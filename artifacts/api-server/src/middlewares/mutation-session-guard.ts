import type { NextFunction, Request, Response } from "express";
import { queryOne } from "../lib/erp-sql.js";
import { isBackupWriterFenced, isFilesystemStorageMode } from "../lib/db-sync.js";
import { acquireActorLock } from "../lib/session-control.js";
import { isSpecialSessionValid } from "../lib/special-sessions.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_MUTATION_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/guest",
  "/api/auth/logout",
  "/api/auth/forgot-password/request-otp",
  "/api/auth/forgot-password/reset",
  "/api/mkgh/auth",
  "/api/site-analytics/pageview",
]);

type CurrentSession = { user_id: number };

async function actorFor(authorization: string): Promise<string | null> {
  if (authorization.startsWith("DevAuth ")) {
    const token = authorization.slice(8).trim();
    return await isSpecialSessionValid("developer-admin", token) ? "developer-admin" : null;
  }

  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === "guest") return null;
  if (await isSpecialSessionValid("system-admin", token)) return "system-admin";

  const session = await queryOne<CurrentSession>(`
    SELECT s.user_id
    FROM sessions s
    WHERE s.token=?
      AND datetime(s.expires_at) > datetime('now')
      AND s.rowid=(
        SELECT MAX(current.rowid)
        FROM sessions current
        WHERE current.user_id=s.user_id
          AND datetime(current.expires_at) > datetime('now')
      )
  `, token);
  return session ? `user:${session.user_id}` : null;
}

export async function mutationSessionGuard(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // The URL is a short-lived, single-use capability issued to an authenticated
  // client; the file bytes are then uploaded directly to the app server.
  if (
    isFilesystemStorageMode() &&
    req.method.toUpperCase() === "PUT" &&
    /^\/api\/storage\/local-upload\/[0-9a-f-]{36}$/i.test(req.path)
  ) return next();

  if (isBackupWriterFenced()) {
    return void res.status(503).json({
      code: "SERVER_RESTARTING",
      error: "الخادم يعيد التشغيل لحماية البيانات. حدّث الصفحة وحاول مرة أخرى بعد ثوانٍ.",
    });
  }

  if (PUBLIC_MUTATION_PATHS.has(req.path)) return next();

  const authorization = req.headers.authorization?.trim();
  if (!authorization) {
    return void res.status(401).json({
      code: "MUTATION_AUTH_REQUIRED",
      error: "يجب تحديث الصفحة أو تسجيل الدخول قبل حفظ أي تغيير.",
    });
  }

  const actorKey = await actorFor(authorization);
  if (!actorKey) {
    return void res.status(401).json({
      code: "SESSION_REPLACED",
      error: "تم فتح هذا الحساب من جهاز آخر، لذلك أُوقفت جلسة هذا الجهاز لحماية البيانات.",
    });
  }

  const release = await acquireActorLock(actorKey);
  if (await actorFor(authorization) !== actorKey) {
    release();
    return void res.status(401).json({
      code: "SESSION_REPLACED",
      error: "تم فتح هذا الحساب من جهاز آخر، لذلك أُوقفت جلسة هذا الجهاز لحماية البيانات.",
    });
  }

  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    release();
  };
  res.once("finish", releaseOnce);
  res.once("close", releaseOnce);
  next();
}