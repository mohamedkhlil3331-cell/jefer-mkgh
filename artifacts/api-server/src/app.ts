import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import db, { UPLOADS_PATH } from "./lib/db.js";
import { isBackupWriterFenced, makeStorage } from "./lib/db-sync.js";
import { mutationSessionGuard } from "./middlewares/mutation-session-guard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

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
  // Skip dev-dashboard and credentials routes
  if (p.startsWith("/mkgh/") || p.startsWith("/auth/login") || p.startsWith("/auth/otp") || p.startsWith("/auth/register")) return next();
  // For GET: only log meaningful page-level reads, skip noisy polling
  if (req.method === "GET" && AUDIT_SKIP_GET.includes(p)) return next();
  // Skip static assets
  if (p.startsWith("/uploads") || p.startsWith("/public")) return next();

  res.on("finish", () => {
    try {
      let userId: number | null = null, userName: string | null = null, userRole: string | null = null;
      const auth = req.headers.authorization;
      if (auth?.startsWith("Bearer ")) {
        const tok = auth.slice(7);
        // No expiry check here — we just want to know who made the call
        const row = db.prepare(
          "SELECT u.id, u.name, u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=?"
        ).get(tok) as { id: number; name: string; role: string } | undefined;
        if (row) { userId = row.id; userName = row.name; userRole = row.role; }
      }
      const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim()
        ?? req.socket?.remoteAddress
        ?? null;
      db.prepare(
        "INSERT INTO dev_audit_log (method, path, user_id, user_name, user_role, ip_address, status_code) VALUES (?,?,?,?,?,?,?)"
      ).run(req.method, p.split("?")[0], userId, userName, userRole, ip, res.statusCode);
    } catch { /* non-blocking */ }
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

// Serve static public files (system guide, etc.)
app.use("/api/public", express.static(path.join(import.meta.dirname, "..", "public")));


app.use("/api", router);

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
