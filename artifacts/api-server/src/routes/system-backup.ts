import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { DownloadSystemBackupQueryParams, type SystemBackupTicket } from "@workspace/api-zod";
import type { Readable } from "node:stream";
import db from "../lib/db.js";
import {
  prepareSystemBackup,
  SystemBackupPreparationError,
} from "../lib/systemBackupExport.js";

const router = Router();
const TICKET_TTL_SECONDS = 5 * 60;

interface BackupTicketPayload {
  version: 1;
  userId: number;
  sessionHash: string;
  expiresAt: number;
  nonce: string;
}

type AdminAuthResult =
  | { ok: true; userId: number; sessionToken: string }
  | { ok: false; status: 401 | 403; error: string };

router.post("/admin/system-backup/tickets", (req, res) => {
  const auth = authenticateAdmin(readBearerToken(req.get("authorization")));
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(503).json({
      error: "تعذر إنشاء تذكرة التنزيل لأن إعداد توقيع الجلسات غير متاح.",
      code: "backup_ticket_unavailable",
    });
    return;
  }

  const expiresAt = Date.now() + TICKET_TTL_SECONDS * 1000;
  const payload: BackupTicketPayload = {
    version: 1,
    userId: auth.userId,
    sessionHash: hashSessionToken(auth.sessionToken),
    expiresAt,
    nonce: randomBytes(16).toString("base64url"),
  };
  const response: SystemBackupTicket = {
    ticket: signTicket(payload, secret),
    expiresAt: new Date(expiresAt),
    expiresInSeconds: TICKET_TTL_SECONDS,
  };

  res.setHeader("Cache-Control", "no-store, private");
  res.status(201).json(response);
});

router.get("/admin/system-backup/download", async (req, res): Promise<void> => {
  const parsedQuery = DownloadSystemBackupQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: "تذكرة التنزيل مطلوبة أو غير صالحة.", code: "invalid_ticket" });
    return;
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(503).json({
      error: "تعذر التحقق من تذكرة التنزيل لأن إعداد توقيع الجلسات غير متاح.",
      code: "backup_ticket_unavailable",
    });
    return;
  }

  const payload = verifyTicket(parsedQuery.data.ticket, secret);
  if (!payload) {
    res.status(401).json({ error: "تذكرة التنزيل غير صالحة أو انتهت صلاحيتها.", code: "invalid_ticket" });
    return;
  }

  if (!isAdminSessionCurrent(payload)) {
    res.status(401).json({ error: "انتهت جلسة المدير؛ سجّل الدخول واطلب نسخة جديدة.", code: "session_expired" });
    return;
  }

  let backup;
  try {
    backup = await prepareSystemBackup();
  } catch (error) {
    req.log.error({ err: error }, "System backup preparation failed");
    const statusCode = error instanceof SystemBackupPreparationError ? error.statusCode : 500;
    const code = error instanceof SystemBackupPreparationError ? error.code : "backup_preparation_failed";
    res.status(statusCode).json({ error: safeErrorMessage(error), code });
    return;
  }

  const zipName = `MKGH-ERP-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  res.status(200);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const output = backup.zip.outputStream as Readable;
  let streamFailed = false;
  const failStream = (error: unknown) => {
    if (streamFailed) return;
    streamFailed = true;
    req.log.error({ err: error }, "System backup ZIP stream failed");

    if (!res.headersSent && !res.writableEnded && !res.destroyed) {
      res.removeHeader("Content-Type");
      res.removeHeader("Content-Disposition");
      res.status(500).json({
        error: `تعذر إنشاء ملف ZIP: ${safeErrorMessage(error)}`,
        code: "backup_stream_failed",
      });
      return;
    }
    if (!res.destroyed) res.destroy();
  };

  try {
    await new Promise<void>((resolve) => {
      res.once("finish", resolve);
      res.once("close", () => {
        if (!res.writableFinished && !output.destroyed) output.destroy();
        resolve();
      });
      output.on("error", failStream);
      backup.zip.on("error", failStream);
      output.pipe(res);
      backup.zip.end({ forceZip64Format: true, comment: "" });
    });
  } catch (error) {
    failStream(error);
  } finally {
    await backup.cleanup().catch((error) => {
      req.log.warn({ err: error }, "Could not remove temporary system backup files");
    });
  }
});

function readBearerToken(value: string | undefined): string | null {
  const match = value?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function authenticateAdmin(token: string | null): AdminAuthResult {
  if (!token) {
    return { ok: false, status: 401, error: "تسجيل الدخول مطلوب لتنزيل النسخة الاحتياطية." };
  }

  const session = db.prepare(`
    SELECT u.id, u.role, u.active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
    LIMIT 1
  `).get(token) as { id: number; role: string; active: number | null } | undefined;

  if (!session) {
    return { ok: false, status: 401, error: "جلسة الدخول غير صالحة أو منتهية." };
  }
  if (session.role !== "admin" || Number(session.active) !== 1) {
    return { ok: false, status: 403, error: "تنزيل النسخة الاحتياطية متاح لمدير النظام فقط." };
  }

  return { ok: true, userId: Number(session.id), sessionToken: token };
}

function signTicket(payload: BackupTicketPayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyTicket(ticket: string, secret: string): BackupTicketPayload | null {
  const parts = ticket.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const expectedSignature = createHmac("sha256", secret).update(parts[0]).digest();
  const actualSignature = Buffer.from(parts[1], "base64url");
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<BackupTicketPayload>;
    if (
      value.version !== 1 ||
      !Number.isSafeInteger(value.userId) ||
      Number(value.userId) <= 0 ||
      !Number.isSafeInteger(value.expiresAt) ||
      Number(value.expiresAt) <= Date.now() ||
      typeof value.sessionHash !== "string" ||
      !/^[a-f0-9]{64}$/i.test(value.sessionHash) ||
      typeof value.nonce !== "string"
    ) {
      return null;
    }
    return value as BackupTicketPayload;
  } catch {
    return null;
  }
}

function isAdminSessionCurrent(payload: BackupTicketPayload): boolean {
  const expectedHash = Buffer.from(payload.sessionHash, "hex");
  const sessions = db.prepare(`
    SELECT s.token
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.user_id = ?
      AND u.role = 'admin'
      AND COALESCE(u.active, 0) = 1
      AND datetime(s.expires_at) > datetime('now')
  `).all(payload.userId) as Array<{ token: string }>;

  return sessions.some((session) => {
    const actualHash = Buffer.from(hashSessionToken(session.token), "hex");
    return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
  });
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "خطأ غير معروف.";
  return raw
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[محجوب]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[رابط محجوب]")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

export default router;
