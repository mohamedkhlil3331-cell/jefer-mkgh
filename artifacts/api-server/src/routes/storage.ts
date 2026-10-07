import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import db from "../lib/db.js";
import { isSpecialSessionValid } from "../lib/special-sessions.js";
import { isSysAdminToken } from "./auth.js";
import { isRentalAccessTokenValid } from "./rental-accounts.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const FINANCE_ROLES = new Set(["admin", "supervisor", "reviewer", "finance", "accountant"]);

function authorizeProtectedReceipt(req: Request, objectPath: string) {
  const paths = [objectPath, `/api/storage${objectPath}`, `/api${objectPath}`];
  const placeholders = paths.map(() => "?").join(",");
  const registered = db.prepare(
    `SELECT owner_user_id FROM rental_receipt_objects WHERE path IN (${placeholders}) LIMIT 1`
  ).get(...paths) as { owner_user_id: number } | undefined;
  const attached = db.prepare(
    `SELECT 1 FROM rental_payments WHERE transfer_image_url IN (${placeholders}) LIMIT 1`
  ).get(...paths);
  if (!registered && !attached) return true;

  const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  const token = bearer?.[1]?.trim();
  const user = token ? db.prepare(`
    SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
      AND s.rowid=(
        SELECT MAX(s2.rowid) FROM sessions s2
        WHERE s2.user_id=s.user_id AND datetime(s2.expires_at)>datetime('now')
      )
  `).get(token) as { id: number; role: string } | undefined : undefined;

  const accessToken = String(req.headers["x-rental-access"] || "").trim();
  const unlocked = isRentalAccessTokenValid(accessToken);
  if (unlocked && token && isSpecialSessionValid("system-admin", token)) return true;
  if (unlocked && user && FINANCE_ROLES.has(user.role)) return true;

  if (user?.role === "rental_trip_customer") {
    const activeCustomer = db.prepare(`
      SELECT id,name FROM rental_customers
      WHERE portal_user_id=? AND active=1 AND customer_type='rental'
    `).get(user.id) as { id: number; name: string } | undefined;
    if (activeCustomer) {
      if (registered?.owner_user_id === user.id) return true;
      const ownedAttachment = db.prepare(`
        SELECT 1 FROM rental_payments p
        JOIN rental_customers c ON LOWER(TRIM(c.name))=LOWER(TRIM(p.customer_name))
        WHERE p.transfer_image_url IN (${placeholders})
          AND c.portal_user_id=? AND c.active=1 AND c.customer_type='rental'
        LIMIT 1
      `).get(...paths, user.id);
      if (ownedAttachment) return true;
    }
  }
  return false;
}

function branchDocumentObjectAccess(req: Request): "allowed" | "unauthenticated" | "forbidden" {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token || token === "guest") return "unauthenticated";
  if (isSysAdminToken(token)) return "allowed";
  const session = db.prepare(`
    SELECT u.role
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
      AND s.rowid=(
        SELECT MAX(current.rowid)
        FROM sessions current
        WHERE current.user_id=s.user_id
      )
  `).get(token) as { role: string } | undefined;
  if (!session) return "unauthenticated";
  return session.role === "admin" ? "allowed" : "forbidden";
}

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body ?? {};
  if (!name || typeof size !== "number" || !contentType) {
    res.status(400).json({ error: "name, size, contentType مطلوبة" });
    return;
  }
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "فشل توليد رابط الرفع" });
  }
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) { res.status(404).json({ error: "File not found" }); return; }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else { res.end(); }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    if (objectPath.startsWith("/objects/branch-documents/")) {
      const access = branchDocumentObjectAccess(req);
      if (access !== "allowed") {
        res.status(access === "unauthenticated" ? 401 : 403).json({
          error: access === "unauthenticated" ? "تسجيل الدخول مطلوب" : "صلاحية مدير النظام مطلوبة",
        });
        return;
      }
    }
    if (!authorizeProtectedReceipt(req, objectPath)) {
      res.status(403).json({ error: "لا تملك صلاحية عرض إيصال التحويل" });
      return;
    }
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else { res.end(); }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
