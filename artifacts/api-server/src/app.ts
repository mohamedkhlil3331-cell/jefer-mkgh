import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { execute, queryOne } from "./lib/erp-sql.js";
import {
  getAppDataDir,
  isBackupWriterFenced,
  isFilesystemDatabaseMode,
  isFilesystemStorageMode,
  makeStorage,
} from "./lib/db-sync.js";
import { mutationSessionGuard } from "./middlewares/mutation-session-guard.js";
import { getR2Object, isR2ObjectStorageBackend } from "./lib/r2-storage.js";

const isCloudflareWorker = Boolean(
  (globalThis as typeof globalThis & { __ERP_WORKER_ENV?: unknown }).__ERP_WORKER_ENV,
);
const __dirname = isCloudflareWorker ? "/worker" : path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_PATH = isFilesystemStorageMode() || isFilesystemDatabaseMode()
  ? path.join(getAppDataDir(), "uploads")
  : path.join(__dirname, "..", "uploads");

const app: Express = express();

if ((globalThis as typeof globalThis & { __ERP_WORKER_ENV?: unknown }).__ERP_WORKER_ENV) {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.once("finish", () => {
      logger.info({
        req: { method: req.method, url: req.url?.split("?")[0] },
        res: { statusCode: res.statusCode },
        responseTime: Date.now() - startedAt,
      }, "request completed");
    });
    next();
  });
} else {
  const { default: pinoHttp } = await import("pino-http");
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );
}

app.use(compression({ threshold: 1024 }));
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Only the newest login session may execute a state-changing request.
app.use(mutationSessionGuard);

// ── Dev audit logger: records API activity to dev_audit_log ───────────────────
// Skipped GET paths (noisy polling / static assets)
const AUDIT_SKIP_GET = [
  "/api/auth/me", "/api/notifications", "/api/offers", "/api/products",
  "/api/invoice-settings", "/api/rental-vehicle-types",
  "/api/portal/supervisor-contact", "/api/portal/rental-location-presets",
];
app.use((req: Request, res: Response, next: NextFunction) => {
  const p = req.path;
  if (p === "/api/site-analytics/pageview") return next();
  // Skip dev-dashboard and credentials routes
  if (p.startsWith("/mkgh/") || p.startsWith("/auth/login") || p.startsWith("/auth/otp") || p.startsWith("/auth/register")) return next();
  // For GET: only log meaningful page-level reads, skip noisy polling
  if (req.method === "GET" && AUDIT_SKIP_GET.includes(p)) return next();
  // Skip static assets
  if (p.startsWith("/uploads") || p.startsWith("/public")) return next();

  res.on("finish", () => {
    void (async () => {
      let userId: number | null = null, userName: string | null = null, userRole: string | null = null;
      const auth = req.headers.authorization;
      if (auth?.startsWith("Bearer ")) {
        const tok = auth.slice(7);
        // No expiry check here — we just want to know who made the call
        const row = await queryOne<{ id: number; name: string; role: string }>(
          "SELECT u.id, u.name, u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=?",
          tok,
        );
        if (row) { userId = row.id; userName = row.name; userRole = row.role; }
      }
      const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim()
        ?? req.socket?.remoteAddress
        ?? null;
      await execute(
        "INSERT INTO dev_audit_log (method, path, user_id, user_name, user_role, ip_address, status_code) VALUES (?,?,?,?,?,?,?)",
        req.method, p.split("?")[0], userId, userName, userRole, ip, res.statusCode,
      );
    })().catch(() => { /* non-blocking */ });
  });
  next();
});

// Serve uploaded files (invoice images)
app.use("/api/uploads", express.static(UPLOADS_PATH));
// Older published uploads lived on the server filesystem. Serve preserved copies
// from durable storage after a republish replaces that filesystem.
app.get("/api/uploads/:file", async (req, res, next) => {
  const name = req.params.file;
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/.test(name)) return next();
  if (isR2ObjectStorageBackend()) {
    try {
      const object = await getR2Object(`app-uploads/${name}`);
      if (object?.Body) {
        res.setHeader("Content-Type", object.ContentType || "application/octet-stream");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", object.CacheControl || "private, max-age=300");
        if (object.ContentLength != null) res.setHeader("Content-Length", object.ContentLength);
        const body = object.Body as ReadableStream<Uint8Array> | import("node:stream").Readable;
        if (typeof (body as ReadableStream<Uint8Array>).getReader === "function") {
          Readable.fromWeb(body as ReadableStream<Uint8Array>).pipe(res);
        } else {
          (body as import("node:stream").Readable).pipe(res);
        }
        return;
      }
    } catch (error) {
      return next(error);
    }
  }
  if (isFilesystemStorageMode()) {
    return res.status(404).json({ error: "الملف غير موجود؛ قد يلزم إعادة رفع النسخة الأصلية" });
  }
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return res.status(503).json({ error: "تعذر الوصول إلى الملفات المحفوظة" });
  try {
    const object = makeStorage().bucket(bucketId).file(`legacy-uploads/${name}`);
    const [exists] = await object.exists();
    if (!exists) return res.status(404).json({ error: "الملف غير موجود؛ قد يلزم إعادة رفع النسخة الأصلية" });
    const [metadata] = await object.getMetadata();
    res.setHeader("Content-Type", metadata.contentType || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (metadata.size) res.setHeader("Content-Length", metadata.size);
    object.createReadStream().on("error", error => {
      if (res.headersSent) res.destroy(error);
      else next(error);
    }).pipe(res);
  } catch (error) {
    next(error);
  }
});

// Public files remain served by the Node deployment; Workers have no local filesystem.
if (!isCloudflareWorker) {
  app.use("/api/public", express.static(path.join(import.meta.dirname, "..", "public")));
}


app.use("/api", router);

if (process.env.HOSTINGER_SERVE_FRONTEND === "1") {
  const defaultFrontendDir = path.resolve(__dirname, "../../../artifacts/erp-arabic/dist/public");
  const frontendDir = path.resolve(process.env.HOSTINGER_FRONTEND_DIR || defaultFrontendDir);
  const frontendIndex = path.join(frontendDir, "index.html");
  if (!fs.existsSync(frontendIndex)) {
    throw new Error(`[startup] Hostinger frontend build was not found at ${frontendIndex}`);
  }
  app.use(express.static(frontendDir, { index: false }));
  app.get("/{*splat}", (req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(frontendIndex, error => {
      if (error) next(error);
    });
  });
}

app.use("/api/auth/login", (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "[auth] Login request failed");
  if (res.headersSent) return;
  res.status(isBackupWriterFenced() ? 503 : 500).json({
    error: isBackupWriterFenced()
      ? "الخادم يعيد التشغيل لحماية البيانات. حاول تسجيل الدخول بعد ثوانٍ."
      : "تعذر تسجيل الدخول بسبب خطأ في الخادم. حاول مجدداً أو تواصل مع الإدارة.",
  });
});

export default app;
