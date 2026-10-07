import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import Database from "better-sqlite3";
import { ZipFile } from "yazl";
import db, { UPLOADS_PATH } from "../lib/db.js";
import { isFilesystemStorageMode, makeStorage, pauseDbBackup, waitForDbBackupIdle } from "../lib/db-sync.js";
import { listHostingerObjects } from "../lib/hostinger-filesystem-storage.js";
import {
  extensionForContentType,
  inferLocalUploadExtension,
  uniqueArchivePath,
  writeDatabaseTablesWorkbook,
} from "../lib/system-backup-export.js";
import { beginSystemRestore, endSystemRestore, waitForOtherApiRequests } from "../lib/system-restore-state.js";
import { executeSystemBackupRestore } from "../lib/system-backup-restore.js";
import { isSysAdminToken } from "./auth.js";

const router = Router();
const TICKET_LIFETIME_MS = 60_000;
let downloadInProgress = false;
const restoreArchiveUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, _file, callback) => callback(null, `mkgh-restore-upload-${crypto.randomBytes(20).toString("hex")}.zip`),
  }),
  limits: { files: 1, fileSize: 50 * 1024 * 1024 * 1024 },
}).single("archive");

type BackupTicket = {
  actor: number | "system";
  sessionHash: string;
  expiresAt: number;
  nonce: string;
};

async function listLocalUploads(directory: string): Promise<Array<{
  filePath: string;
  archivePath: string;
  restorePath: string;
  bytes: number;
}>> {
  const raw: Array<{ filePath: string; relativePath: string; extension?: string; bytes: number }> = [];
  const walk = async (relative = ""): Promise<void> => {
    const items = await fs.promises.readdir(path.join(directory, relative), { withFileTypes: true });
    for (const item of items) {
      if (item.isSymbolicLink()) throw new Error("A local upload is a symbolic link; refusing incomplete backup");
      const name = path.posix.join(relative, item.name);
      if (item.isDirectory()) await walk(name);
      else if (item.isFile()) {
        const filePath = path.join(directory, name);
        raw.push({
          filePath,
          relativePath: name,
          extension: await inferLocalUploadExtension(filePath, name),
          bytes: (await fs.promises.stat(filePath)).size,
        });
      }
    }
  };
  await walk();

  const originalPaths = new Set(raw.map(file => `uploads/${file.relativePath}`));
  const chosenPaths = new Set<string>();
  return raw.sort((left, right) => left.relativePath.localeCompare(right.relativePath)).map(file => ({
    filePath: file.filePath,
    archivePath: uniqueArchivePath(
      `uploads/${file.relativePath}`, file.extension, originalPaths, chosenPaths, file.relativePath,
    ),
    restorePath: file.relativePath,
    bytes: file.bytes,
  }));
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signingKey(): string {
  const key = process.env.SESSION_SECRET;
  if (!key) throw new Error("SESSION_SECRET is required for system backup downloads");
  return key;
}

function currentAdmin(req: Request): { actor: number | "system"; token: string } | null {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  if (isSysAdminToken(token)) return { actor: "system", token };
  const row = db.prepare(`
    SELECT u.id
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now')
      AND u.active=1 AND u.role='admin'
      AND s.rowid=(SELECT MAX(newest.rowid) FROM sessions newest
                   WHERE newest.user_id=u.id AND datetime(newest.expires_at)>datetime('now'))
  `).get(token) as { id: number } | undefined;
  return row ? { actor: row.id, token } : null;
}

function signTicket(payload: BackupTicket): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyTicket(ticket: unknown): BackupTicket | null {
  if (typeof ticket !== "string" || ticket.length > 1000) return null;
  const [body, signature, extra] = ticket.split(".");
  if (!body || !signature || extra) return null;
  const expected = crypto.createHmac("sha256", signingKey()).update(body).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  let parsed: BackupTicket;
  try { parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { return null; }
  if (!parsed || !Number.isSafeInteger(parsed.expiresAt) || parsed.expiresAt < Date.now()
      || parsed.expiresAt > Date.now() + TICKET_LIFETIME_MS
      || typeof parsed.sessionHash !== "string" || !/^[a-f0-9]{64}$/.test(parsed.sessionHash)
      || typeof parsed.nonce !== "string" || !/^[a-f0-9]{32}$/.test(parsed.nonce)
      || (parsed.actor !== "system" && (!Number.isSafeInteger(parsed.actor) || parsed.actor <= 0))) return null;

  const session = parsed.actor === "system"
    ? db.prepare("SELECT token FROM special_sessions WHERE kind='system-admin' AND datetime(expires_at)>datetime('now')")
      .get() as { token: string } | undefined
    : db.prepare(`
        SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE u.id=? AND u.active=1 AND u.role='admin'
          AND datetime(s.expires_at)>datetime('now')
        ORDER BY s.rowid DESC LIMIT 1
      `).get(parsed.actor) as { token: string } | undefined;
  if (!session) return null;
  return crypto.timingSafeEqual(
    Buffer.from(parsed.sessionHash, "hex"),
    Buffer.from(tokenHash(session.token), "hex"),
  ) ? parsed : null;
}

router.get("/system-backup/ticket", (req, res) => {
  const admin = currentAdmin(req);
  if (!admin) return void res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة لتنزيل النسخة الاحتياطية" });
  if ((!isFilesystemStorageMode() && !process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) || !process.env.SESSION_SECRET) {
    return void res.status(503).json({ error: "خدمة النسخ الاحتياطي غير مهيأة" });
  }
  const ticket = signTicket({
    actor: admin.actor,
    sessionHash: tokenHash(admin.token),
    expiresAt: Date.now() + TICKET_LIFETIME_MS,
    nonce: crypto.randomBytes(16).toString("hex"),
  });
  res.setHeader("Cache-Control", "no-store");
  res.json({ download_url: `/api/system-backup/download?ticket=${encodeURIComponent(ticket)}` });
});

router.get("/system-backup/download", async (req: Request, res: Response) => {
  if ((!isFilesystemStorageMode() && !process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) || !process.env.SESSION_SECRET) {
    return void res.status(503).json({ error: "خدمة النسخ الاحتياطي غير مهيأة" });
  }
  if (!verifyTicket(req.query.ticket)) {
    return void res.status(403).json({ error: "انتهت صلاحية رابط التنزيل؛ اضغط زر النسخة الاحتياطية مجددًا" });
  }
  if (downloadInProgress) {
    return void res.status(429).json({ error: "يوجد تنزيل نسخة احتياطية جارٍ؛ حاول بعد اكتماله" });
  }
  downloadInProgress = true;
  let tempDir: string | undefined;
  let zip: ZipFile | undefined;
  let source: NodeJS.ReadableStream | undefined;
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    downloadInProgress = false;
    if (tempDir) void fs.promises.rm(tempDir, { recursive: true, force: true })
      .catch(err => req.log.error({ err }, "Failed to remove temporary backup snapshot"));
  };
  const fail = (err: Error) => {
    if (finished) return;
    req.log.error({ err }, "System backup download failed");
    if (source && "destroy" in source) (source as fs.ReadStream).destroy();
    if (res.headersSent) res.destroy(err);
    else res.status(500).json({ error: "تعذر إكمال النسخة الاحتياطية؛ لم يتم تنزيل ملف كامل" });
    cleanup();
  };

  try {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mkgh-export-"));
    const snapshotPath = path.join(tempDir, "erp.db");
    await db.backup(snapshotPath);

    type StorageCandidate = {
      key: string;
      size: number;
      generation?: string | number;
      updated?: string;
      crc32c?: string;
      contentType?: string;
      cacheControl?: string;
      contentDisposition?: string;
      metadata?: Record<string, string>;
      localPath?: string;
    };
    const objectCandidates: StorageCandidate[] = [];
    let openGcsStream: ((key: string, generation?: string | number) => NodeJS.ReadableStream) | undefined;
    if (isFilesystemStorageMode()) {
      const localObjects = await listHostingerObjects();
      for (const object of localObjects) {
        if (object.key.startsWith("_system_restore_") || object.key.endsWith("/")) continue;
        objectCandidates.push({
          key: object.key,
          size: Number(object.metadata.size),
          updated: object.metadata.updated,
          contentType: object.metadata.contentType,
          cacheControl: object.metadata.cacheControl,
          contentDisposition: object.metadata.contentDisposition,
          metadata: object.metadata.metadata,
          localPath: object.filePath,
        });
      }
    } else {
      const bucket = makeStorage().bucket(process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!);
      const [allFiles] = await bucket.getFiles();
      // The live SQLite snapshot supersedes the rotating database object.
      const files = allFiles.filter(file => !file.name.startsWith("db-backups/")
        && !file.name.startsWith("_system_restore_")
        && !file.name.endsWith("/"));
      for (const file of files) {
        objectCandidates.push({
          key: file.name,
          size: Number(file.metadata.size),
          generation: file.metadata.generation,
          updated: file.metadata.updated,
          crc32c: file.metadata.crc32c,
          contentType: file.metadata.contentType,
          cacheControl: file.metadata.cacheControl,
          contentDisposition: file.metadata.contentDisposition,
          metadata: file.metadata.metadata as Record<string, string> | undefined,
        });
      }
      openGcsStream = (key, generation) => bucket.file(
        key,
        generation ? { generation: Number(generation) } : undefined,
      ).createReadStream();
    }
    const originalObjectPaths = new Set(objectCandidates.map(file => `storage/${file.key}`));
    const chosenArchivePaths = new Set(["manifest.json", "README.txt", "database/erp.db", "database-tables.xlsx"]);
    const entries = objectCandidates.map(file => {
      const key = file.key;
      const originalArchiveName = path.posix.normalize(`storage/${key}`);
      if (!key || key.includes("\\") || key.split("/").includes("..")
          || originalArchiveName !== `storage/${key}`) {
        throw new Error("Unsafe object name in backup");
      }
      const size = Number(file.size);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error("Invalid object size in backup");
      const archiveName = uniqueArchivePath(
        originalArchiveName,
        extensionForContentType(file.contentType),
        originalObjectPaths,
        chosenArchivePaths,
        key,
      );
      return {
        file, key, archiveName, size,
        generation: file.generation,
        updated: file.updated,
        crc32c: file.crc32c,
        contentType: file.contentType,
        cacheControl: file.cacheControl,
        contentDisposition: file.contentDisposition,
        metadata: file.metadata,
        localPath: file.localPath,
      };
    });
    const localUploads = await listLocalUploads(UPLOADS_PATH);
    for (const upload of localUploads) chosenArchivePaths.add(upload.archivePath);

    const snapshot = new Database(snapshotPath, { readonly: true, fileMustExist: true });
    try {
      const check = snapshot.pragma("quick_check") as Array<{ quick_check: string }>;
      if (check.length !== 1 || check[0]?.quick_check !== "ok") {
        throw new Error("The SQLite snapshot failed its integrity check");
      }
    } finally {
      snapshot.close();
    }
    const workbookPath = path.join(tempDir, "database-tables.xlsx");
    const workbookSize = writeDatabaseTablesWorkbook(snapshotPath, workbookPath);
    const digest = crypto.createHash("sha256");
    for await (const chunk of fs.createReadStream(snapshotPath)) digest.update(chunk);
    const snapshotSize = (await fs.promises.stat(snapshotPath)).size;
    const createdAt = new Date().toISOString();
    const manifest = {
      format: "mkgh-full-backup-v1",
      created_at: createdAt,
      database: { path: "database/erp.db", bytes: snapshotSize, sha256: digest.digest("hex"), type: "SQLite online snapshot" },
      database_tables: { archive_path: "database-tables.xlsx", bytes: workbookSize },
      local_uploads: localUploads.map(({ archivePath, restorePath, bytes }) => ({
        archive_path: archivePath, restore_path: restorePath, bytes,
      })),
      objects: entries.map(({ key, archiveName, size, generation, updated, crc32c,
        contentType, cacheControl, contentDisposition, metadata }) => ({
        storage_key: key, archive_path: archiveName, bytes: size, generation, updated, crc32c,
        content_type: contentType, cache_control: cacheControl,
        content_disposition: contentDisposition, metadata,
      })),
    };
    zip = new ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), "manifest.json");
    zip.addBuffer(Buffer.from(
      "MKGH complete data backup\n" +
      "database/erp.db is the authoritative SQLite snapshot at export time.\n" +
      "database-tables.xlsx contains a worksheet for each application database table.\n" +
      "storage/ contains every user-uploaded object listed in manifest.json.\n" +
      "uploads/ contains legacy files stored on the application server, if any.\n" +
      "Internal rotating db-backups/ objects are not included because the SQLite snapshot replaces them.\n" +
      "Uploads may change while exporting; the manifest records the exact storage object generations.\n" +
      "This file contains private business data and active account sessions. Store it securely.\n",
    ), "README.txt");
    zip.addFile(snapshotPath, "database/erp.db", { compress: false });
    zip.addFile(workbookPath, "database-tables.xlsx", { compress: false });
    for (const upload of localUploads) {
      zip.addFile(upload.filePath, upload.archivePath, { compress: false });
    }
    for (const entry of entries) {
      zip.addReadStreamLazy(entry.archiveName, { size: entry.size, compress: false }, cb => {
        if (finished) return cb(new Error("Download cancelled"), null as never);
        if (entry.localPath) source = fs.createReadStream(entry.localPath);
        else if (openGcsStream) source = openGcsStream(entry.key, entry.generation);
        else return cb(new Error("Object storage stream is unavailable"), null as never);
        source.once("error", err => zip?.emit("error", err));
        cb(null, source);
      });
    }
    zip.on("error", fail);
    zip.outputStream.on("error", fail);
    res.once("close", () => {
      if (!res.writableFinished) {
        if (source && "destroy" in source) (source as fs.ReadStream).destroy();
        if (zip?.outputStream && "destroy" in zip.outputStream) {
          (zip.outputStream as fs.ReadStream).destroy();
        }
      }
      cleanup();
    });
    res.once("finish", cleanup);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="mkgh-full-backup-${createdAt.slice(0, 10)}.zip"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    zip.outputStream.pipe(res);
    zip.end({ forceZip64Format: true, comment: "" });
    req.log.info({ objects: entries.length, localUploads: localUploads.length,
      estimatedBytes: snapshotSize + entries.reduce((n, x) => n + x.size, 0) + localUploads.reduce((n, x) => n + x.bytes, 0) },
      "Started complete system backup download");
  } catch (err) {
    fail(err instanceof Error ? err : new Error("Unknown backup error"));
  }
});

router.post("/system-backup/restore", (req: Request, res: Response, next) => {
  const admin = currentAdmin(req);
  if (!admin) return void res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة لاستعادة النسخة" });
  if (!isFilesystemStorageMode() && !process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
    return void res.status(503).json({ error: "تخزين الملفات غير مهيأ؛ لم تبدأ الاستعادة" });
  }
  restoreArchiveUpload(req, res, error => {
    if (error) {
      const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
      return void res.status(tooLarge ? 413 : 400).json({
        error: tooLarge ? "حجم ملف النسخة يتجاوز الحد المسموح (50 جيجابايت)" : "تعذر استقبال ملف النسخة",
      });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  const admin = currentAdmin(req);
  const uploadedPath = req.file?.path;
  const mode = req.body?.mode;
  res.setHeader("Cache-Control", "no-store");
  if (!admin) {
    if (uploadedPath) await fs.promises.rm(uploadedPath, { force: true }).catch(() => {});
    return void res.status(403).json({ error: "انتهت صلاحية جلسة المدير؛ لم تبدأ الاستعادة" });
  }
  if (!uploadedPath) return void res.status(400).json({ error: "اختر ملف النسخة الشاملة أولاً" });
  if (mode !== "full" && mode !== "append") {
    await fs.promises.rm(uploadedPath, { force: true }).catch(() => {});
    return void res.status(400).json({ error: "نوع الاستعادة غير صالح" });
  }
  if (!beginSystemRestore()) {
    await fs.promises.rm(uploadedPath, { force: true }).catch(() => {});
    return void res.status(429).json({ error: "تجري استعادة أخرى الآن؛ لم تُطبّق هذه النسخة" });
  }

  const resumeBackups = pauseDbBackup();
  try {
    await waitForDbBackupIdle();
    if (!await waitForOtherApiRequests()) {
      throw new Error("تعذر إيقاف الطلبات الأخرى بأمان؛ لم تُطبّق النسخة");
    }
    const result = await executeSystemBackupRestore({
      zipPath: uploadedPath,
      mode,
      filename: req.file?.originalname || "backup.zip",
      actorId: admin.actor,
    });
    return void res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر استعادة النسخة";
    return void res.status(500).json({ error: message });
  } finally {
    resumeBackups();
    endSystemRestore();
    await fs.promises.rm(uploadedPath, { force: true }).catch(() => {});
  }
});

router.get("/system-backup/restore-log", (req: Request, res: Response) => {
  if (!currentAdmin(req)) return void res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة" });
  const limit = Math.max(1, Math.min(100, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? "0"), 10) || 0);
  const runId = Number.parseInt(String(req.query.runId ?? ""), 10);
  const reviewState = req.query.reviewed === "yes" || req.query.reviewed === "no"
    ? String(req.query.reviewed) : "all";
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (Number.isSafeInteger(runId) && runId > 0) {
    where.push("i.run_id=?");
    params.push(runId);
  }
  if (reviewState === "yes") where.push("i.reviewed_at IS NOT NULL");
  if (reviewState === "no") where.push("i.reviewed_at IS NULL");
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const items = db.prepare(`
    SELECT i.id, i.run_id, i.item_type, i.table_name, i.record_key, i.display_label,
           i.outcome, i.target_path, i.details, i.reviewed_at, i.reviewed_by, i.created_at,
           r.mode, r.status AS run_status, r.source_filename
    FROM system_backup_restore_items i
    JOIN system_backup_restore_runs r ON r.id=i.run_id
    ${whereSql}
    ORDER BY i.id DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM system_backup_restore_items i
    JOIN system_backup_restore_runs r ON r.id=i.run_id
    ${whereSql}
  `).get(...params) as { count: number };
  const runs = db.prepare(`
    SELECT id, mode, actor_id, source_filename, source_created_at, status,
           restored_rows, duplicate_rows, conflict_rows, restored_files, message,
           created_at, completed_at
    FROM system_backup_restore_runs
    ORDER BY id DESC LIMIT 100
  `).all();
  res.setHeader("Cache-Control", "no-store");
  res.json({ items, total: total.count, limit, offset, runs });
});

router.get("/system-backup/restore-log/item/:id", (req: Request, res: Response) => {
  if (!currentAdmin(req)) return void res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة" });
  const itemId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return void res.status(400).json({ error: "معرّف السجل غير صالح" });
  const item = db.prepare(`
    SELECT i.id, i.run_id, i.item_type, i.table_name, i.record_key, i.display_label,
           i.outcome, i.target_path, i.details, i.reviewed_at, i.reviewed_by, i.created_at,
           r.mode, r.status AS run_status, r.source_filename
    FROM system_backup_restore_items i
    JOIN system_backup_restore_runs r ON r.id=i.run_id
    WHERE i.id=?
  `).get(itemId) as {
    id: number; item_type: string; table_name: string | null; record_key: string | null;
    [key: string]: unknown;
  } | undefined;
  if (!item) return void res.status(404).json({ error: "سجل الاستعادة غير موجود" });

  let record: Record<string, unknown> | null = null;
  const sensitive = !item.table_name || /session|token|secret|credential/i.test(item.table_name)
    || !item.record_key || item.record_key.startsWith("sha256:");
  if (!sensitive && item.item_type === "record" && item.record_key) {
    try {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(item.table_name);
      if (exists) {
        const escapedTable = String(item.table_name).replaceAll('"', '""');
        const columns = db.pragma(`table_info("${escapedTable}")`) as Array<{ name: string; pk: number }>;
        const primary = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk);
        const key = JSON.parse(item.record_key) as Record<string, unknown>;
        if (primary.length && primary.every(column => Object.hasOwn(key, column.name))) {
          const values = primary.map(column => {
            const value = key[column.name] as { buffer?: string } | unknown;
            return value && typeof value === "object" && "buffer" in value
              ? Buffer.from(String((value as { buffer: string }).buffer), "base64")
              : value;
          });
          const where = primary.map(column => `"${column.name.replaceAll('"', '""')}"=?`).join(" AND ");
          const row = db.prepare(`SELECT * FROM "${escapedTable}" WHERE ${where}`)
            .get(...values) as Record<string, unknown> | undefined;
          if (row) {
            record = Object.fromEntries(Object.entries(row)
              .filter(([name]) => !/password|token|secret|credential/i.test(name))
              .map(([name, value]) => [name, Buffer.isBuffer(value) ? `[ملف ثنائي، ${value.length} بايت]` : value]));
          }
        }
      }
    } catch {
      record = null;
    }
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ item, record, sensitive });
});

router.patch("/system-backup/restore-log/item/:id/review", (req: Request, res: Response) => {
  const admin = currentAdmin(req);
  if (!admin) return void res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة" });
  if (req.body?.reviewed !== true) return void res.status(400).json({ error: "أرسل reviewed=true لتأكيد المراجعة" });
  const itemId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return void res.status(400).json({ error: "معرّف السجل غير صالح" });
  const result = db.prepare(`
    UPDATE system_backup_restore_items
    SET reviewed_at=COALESCE(reviewed_at, datetime('now')),
        reviewed_by=COALESCE(reviewed_by, ?)
    WHERE id=?
  `).run(String(admin.actor), itemId);
  if (!result.changes) return void res.status(404).json({ error: "سجل الاستعادة غير موجود" });
  const item = db.prepare(`
    SELECT id, reviewed_at, reviewed_by FROM system_backup_restore_items WHERE id=?
  `).get(itemId);
  res.setHeader("Cache-Control", "no-store");
  res.json({ item });
});

export default router;