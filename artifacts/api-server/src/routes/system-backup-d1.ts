import { Router, type Request } from "express";
import crypto from "node:crypto";
import path from "node:path";
import { ZipFile } from "yazl";
import {
  captureD1ReplicaCheckpoint,
  drainD1Replication,
  getD1ReplicaDatabaseId,
  getD1ReplicationStatus,
  getProductionD1DatabaseId,
  restoreD1ReplicaCheckpoint,
} from "../lib/cloudflare-d1.js";
import { execute, queryAll, queryOne } from "../lib/erp-sql.js";
import { getR2Object, isR2Configured, listR2Objects, uploadR2Object } from "../lib/r2-storage.js";
import { isSysAdminToken } from "./auth.js";

const router = Router();
const TICKET_LIFETIME_MS = 60_000;
let downloadInProgress = false;

type BackupTicket = {
  actor: number | "system";
  sessionHash: string;
  expiresAt: number;
  nonce: string;
};

type D1CheckpointPointer = {
  format: "mkgh-d1-checkpoint-pointer-v1";
  checkpoint_id: string;
  created_at: string;
  bookmark: string;
  replication_sequence: number;
  replica_database_id: string;
  primary_database_id: string;
};

function checkpointObjectKey(id: string): string {
  return `db-backups/d1-checkpoints/${id}.json`;
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signingKey(): string {
  const key = process.env.SESSION_SECRET;
  if (!key) throw new Error("SESSION_SECRET is required for system backup downloads");
  return key;
}

async function currentAdmin(req: Request): Promise<{ actor: number | "system"; token: string } | null> {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  if (await isSysAdminToken(token)) return { actor: "system", token };
  const row = await queryOne<{ id: number }>(`
    SELECT u.id
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now')
      AND u.active=1 AND u.role='admin'
      AND s.rowid=(SELECT MAX(newest.rowid) FROM sessions newest
                   WHERE newest.user_id=u.id AND datetime(newest.expires_at)>datetime('now'))
  `, token);
  return row ? { actor: row.id, token } : null;
}

function signTicket(payload: BackupTicket): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

async function verifyTicket(ticket: unknown): Promise<boolean> {
  if (typeof ticket !== "string" || ticket.length > 1000) return false;
  const [body, signature, extra] = ticket.split(".");
  if (!body || !signature || extra) return false;
  const expected = crypto.createHmac("sha256", signingKey()).update(body).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return false; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  let parsed: BackupTicket;
  try { parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { return false; }
  if (!parsed || !Number.isSafeInteger(parsed.expiresAt) || parsed.expiresAt < Date.now()
      || parsed.expiresAt > Date.now() + TICKET_LIFETIME_MS
      || typeof parsed.sessionHash !== "string" || !/^[a-f0-9]{64}$/.test(parsed.sessionHash)
      || typeof parsed.nonce !== "string" || !/^[a-f0-9]{32}$/.test(parsed.nonce)
      || (parsed.actor !== "system" && (!Number.isSafeInteger(parsed.actor) || parsed.actor <= 0))) return false;

  const session = parsed.actor === "system"
    ? await queryOne<{ token: string }>(
      "SELECT token FROM special_sessions WHERE kind='system-admin' AND datetime(expires_at)>datetime('now')",
    )
    : await queryOne<{ token: string }>(`
        SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE u.id=? AND u.active=1 AND u.role='admin'
          AND datetime(s.expires_at)>datetime('now')
        ORDER BY s.rowid DESC LIMIT 1
      `, parsed.actor);
  return Boolean(session && crypto.timingSafeEqual(
    Buffer.from(parsed.sessionHash, "hex"),
    Buffer.from(tokenHash(session.token), "hex"),
  ));
}

function safeArchivePath(key: string): string {
  const normalized = path.posix.normalize(`storage/${key}`);
  if (!key || key.includes("\\") || key.split("/").includes("..") || normalized !== `storage/${key}`) {
    throw new Error("Unsafe R2 object name in D1 checkpoint backup");
  }
  return normalized;
}

router.get("/system-backup/ticket", async (req, res) => {
  const admin = await currentAdmin(req);
  if (!admin) return void res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة لتنزيل النسخة الاحتياطية" });
  if (!isR2Configured() || !process.env.SESSION_SECRET) {
    return void res.status(503).json({ error: "خدمة النسخ الاحتياطي إلى R2 غير مهيأة" });
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

router.get("/system-backup/download", async (req, res) => {
  if (!isR2Configured() || !process.env.SESSION_SECRET) {
    return void res.status(503).json({ error: "خدمة النسخ الاحتياطي إلى R2 غير مهيأة" });
  }
  if (!await verifyTicket(req.query.ticket)) {
    return void res.status(403).json({ error: "انتهت صلاحية رابط التنزيل؛ اضغط زر النسخة الاحتياطية مجددًا" });
  }
  if (downloadInProgress) {
    return void res.status(429).json({ error: "يوجد تنزيل نسخة احتياطية جارٍ؛ حاول بعد اكتماله" });
  }

  downloadInProgress = true;
  let zip: ZipFile | undefined;
  let source: NodeJS.ReadableStream | undefined;
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    downloadInProgress = false;
  };
  const fail = (error: Error) => {
    if (finished) return;
    req.log.error({ err: error }, "D1 checkpoint backup download failed");
    if (source && "destroy" in source) (source as NodeJS.ReadableStream & { destroy(): void }).destroy();
    if (res.headersSent) res.destroy(error);
    else res.status(500).json({ error: "تعذر إكمال تنزيل بيان النسخة؛ لم يتم تنزيل ملف كامل" });
    cleanup();
  };

  try {
    const checkpoint = await captureD1ReplicaCheckpoint();
    const replication = await getD1ReplicationStatus();
    if (
      replication.pendingOperations !== 0
      || replication.lastAppliedSequence !== checkpoint.replicationSequence
      || replication.latestSequence !== checkpoint.replicationSequence
    ) {
      cleanup();
      return void res.status(503).json({
        error: "قاعدة الظل غير متزامنة بالكامل؛ أعد المحاولة بعد اكتمال مزامنة D1",
      });
    }

    const checkpointId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const pointer: D1CheckpointPointer = {
      format: "mkgh-d1-checkpoint-pointer-v1",
      checkpoint_id: checkpointId,
      created_at: createdAt,
      bookmark: checkpoint.bookmark,
      replication_sequence: checkpoint.replicationSequence,
      replica_database_id: getD1ReplicaDatabaseId(),
      primary_database_id: getProductionD1DatabaseId(),
    };
    await uploadR2Object(
      checkpointObjectKey(checkpointId),
      Buffer.from(JSON.stringify(pointer)),
      "application/json",
      "no-store",
    );

    const candidates = (await listR2Objects())
      .filter(object => !object.key.startsWith("db-backups/") && !object.key.startsWith("_system_restore_"))
      .map(object => ({
        ...object,
        archivePath: safeArchivePath(object.key),
      }));
    const manifest = {
      format: "mkgh-d1-checkpoint-v1",
      created_at: createdAt,
      database: {
        provider: "cloudflare-d1-time-travel",
        role: "replica",
        checkpoint_id: checkpointId,
        bookmark: checkpoint.bookmark,
        replication_sequence: checkpoint.replicationSequence,
        replica_database_id: getD1ReplicaDatabaseId(),
        primary_database_id: getProductionD1DatabaseId(),
        note: "قاعدة البيانات نفسها محفوظة داخل D1 Time Travel؛ هذا الملف يحتوي مؤشر الاستعادة ونسخ ملفات R2.",
      },
      objects: candidates.map(({ key, archivePath, size, updated, etag, contentType, cacheControl,
        contentDisposition, metadata }) => ({
        storage_key: key,
        archive_path: archivePath,
        bytes: size,
        updated,
        etag,
        content_type: contentType,
        cache_control: cacheControl,
        content_disposition: contentDisposition,
        metadata,
      })),
    };

    zip = new ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), "manifest.json");
    zip.addBuffer(Buffer.from(
      "MKGH D1 checkpoint backup\n" +
      "This archive contains a Cloudflare D1 Time Travel bookmark and a copy of R2 objects.\n" +
      "The D1 database contents are retained by Cloudflare Time Travel, not embedded in this ZIP.\n" +
      "The bookmark is tied to the replica database in manifest.json and is not portable to another D1 database.\n" +
      "Use the D1 replica restore endpoint to rehearse recovery. The active primary database is not modified.\n" +
      "Store this file securely; it contains private business uploads.\n",
    ), "README.txt");
    let estimatedBytes = 0;
    for (const item of candidates) {
      if (!Number.isSafeInteger(item.size) || item.size < 0) throw new Error("Invalid R2 object size");
      estimatedBytes += item.size;
      zip.addReadStreamLazy(item.archivePath, { size: item.size, compress: false }, callback => {
        void getR2Object(item.key).then(object => {
          const stream = object?.Body as NodeJS.ReadableStream | undefined;
          if (!stream) return callback(new Error(`R2 object is unavailable: ${item.key}`), null as never);
          if (finished) {
            if ("destroy" in stream) (stream as NodeJS.ReadableStream & { destroy(): void }).destroy();
            return callback(new Error("Download cancelled"), null as never);
          }
          source = stream;
          stream.once("error", error => zip?.emit("error", error));
          callback(null, stream);
        }).catch(error => callback(error, null as never));
      });
    }
    zip.on("error", fail);
    zip.outputStream.on("error", fail);
    res.once("close", () => {
      if (!res.writableFinished) {
        if (source && "destroy" in source) (source as NodeJS.ReadableStream & { destroy(): void }).destroy();
        if (zip?.outputStream && "destroy" in zip.outputStream) {
          (zip.outputStream as NodeJS.ReadableStream & { destroy(): void }).destroy();
        }
      }
      cleanup();
    });
    res.once("finish", cleanup);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="mkgh-d1-checkpoint-${createdAt.slice(0, 10)}.zip"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    zip.outputStream.pipe(res);
    zip.end({ forceZip64Format: true, comment: "" });
    req.log.info({ objects: candidates.length, estimatedBytes, replicationSequence: checkpoint.replicationSequence },
      "Started D1 replica checkpoint backup download");
  } catch (error) {
    fail(error instanceof Error ? error : new Error("Unknown D1 checkpoint backup error"));
  }
});

router.post("/system-backup/restore", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(409).json({
    error: "استعادة قاعدة D1 الأساسية غير متاحة من شاشة SQLite القديمة؛ استخدم استعادة قاعدة الظل فقط بعد مراجعة بيان D1.",
  });
});

router.post("/system-backup/restore-replica", async (req, res) => {
  const admin = await currentAdmin(req);
  if (!admin) return void res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة لاستعادة قاعدة الظل" });
  if (process.env.ERP_D1_REPLICATION_ENABLED !== "1") {
    return void res.status(503).json({ error: "نسخ D1 إلى قاعدة الظل غير مفعّل" });
  }
  if (getD1ReplicaDatabaseId() === getProductionD1DatabaseId()) {
    return void res.status(503).json({ error: "قاعدة الظل غير منفصلة عن قاعدة الإنتاج" });
  }
  const checkpointId = typeof req.body?.checkpoint_id === "string" ? req.body.checkpoint_id.trim() : "";
  const databaseId = typeof req.body?.replica_database_id === "string" ? req.body.replica_database_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(checkpointId) || databaseId !== getD1ReplicaDatabaseId()) {
    return void res.status(400).json({ error: "أرسل معرّف نقطة استعادة صحيحاً ومعرّف قاعدة الظل المطابق للبيان" });
  }

  const run = await execute(`
    INSERT INTO system_backup_restore_runs
      (mode, actor_id, source_filename, status, message)
    VALUES ('append', ?, 'D1 replica Time Travel checkpoint', 'running', 'بدأت استعادة قاعدة الظل؛ قاعدة الإنتاج لم تُمس')
  `, String(admin.actor));
  const runId = Number(run.lastInsertRowid);
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    return void res.status(500).json({ error: "تعذر إنشاء سجل تدقيق للاستعادة" });
  }

  try {
    const object = await getR2Object(checkpointObjectKey(checkpointId));
    if (!object?.Body) throw new Error("نقطة الاستعادة غير موجودة في R2");
    const pointer = JSON.parse(Buffer.from(await object.Body.transformToByteArray()).toString("utf8")) as D1CheckpointPointer;
    if (
      pointer.format !== "mkgh-d1-checkpoint-pointer-v1"
      || pointer.checkpoint_id !== checkpointId
      || pointer.replica_database_id !== getD1ReplicaDatabaseId()
      || pointer.primary_database_id !== getProductionD1DatabaseId()
      || !Number.isSafeInteger(pointer.replication_sequence)
      || typeof pointer.bookmark !== "string"
    ) {
      throw new Error("بيانات نقطة الاستعادة لا تطابق قاعدة الظل الحالية");
    }
    await restoreD1ReplicaCheckpoint(pointer.bookmark);
    let status = await getD1ReplicationStatus();
    for (let attempt = 0; attempt < 60 && status.pendingOperations > 0; attempt += 1) {
      await drainD1Replication(100);
      status = await getD1ReplicationStatus();
      if (status.pendingOperations > 0) await new Promise(resolve => setTimeout(resolve, 500));
    }
    const caughtUp = status.pendingOperations === 0
      && status.lastAppliedSequence === status.latestSequence;
    await execute(`
      UPDATE system_backup_restore_runs
      SET status=?, restored_rows=0, conflict_rows=?, message=?, completed_at=datetime('now')
      WHERE id=?
    `, caughtUp ? "completed" : "partial", caughtUp ? 0 : status.pendingOperations,
    caughtUp
      ? "استُعيدت قاعدة الظل ثم طابقت قاعدة الإنتاج؛ لم تتغير قاعدة الإنتاج"
      : "استُعيدت قاعدة الظل لكنها لم تلحق بقاعدة الإنتاج؛ يلزم فحص حالة المزامنة",
    runId);
    await execute(`
      INSERT INTO system_backup_restore_items
        (run_id, item_type, display_label, outcome, details)
      VALUES (?, 'system', ?, ?, ?)
    `, runId, "استعادة نقطة D1 إلى قاعدة الظل", caughtUp ? "restored" : "conflict",
    JSON.stringify({ replica_database_id: getD1ReplicaDatabaseId(), pending_operations: status.pendingOperations }));
    res.setHeader("Cache-Control", "no-store");
    res.status(caughtUp ? 200 : 202).json({
      run_id: runId,
      replica_restored: true,
      primary_modified: false,
      replication: status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر استعادة قاعدة الظل";
    await execute(`
      UPDATE system_backup_restore_runs
      SET status='failed', message=?, completed_at=datetime('now')
      WHERE id=?
    `, message.slice(0, 1000), runId);
    await execute(`
      INSERT INTO system_backup_restore_items
        (run_id, item_type, display_label, outcome, details)
      VALUES (?, 'system', ?, 'conflict', ?)
    `, runId, "تعذر استعادة نقطة D1 إلى قاعدة الظل", JSON.stringify({ error: message.slice(0, 1000) }));
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ error: message, run_id: runId, primary_modified: false });
  }
});

router.get("/system-backup/restore-log", async (req, res) => {
  if (!await currentAdmin(req)) return void res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة" });
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
  const items = await queryAll(`
    SELECT i.id, i.run_id, i.item_type, i.table_name, i.record_key, i.display_label,
           i.outcome, i.target_path, i.details, i.reviewed_at, i.reviewed_by, i.created_at,
           r.mode, r.status AS run_status, r.source_filename
    FROM system_backup_restore_items i
    JOIN system_backup_restore_runs r ON r.id=i.run_id
    ${whereSql}
    ORDER BY i.id DESC LIMIT ? OFFSET ?
  `, ...params, limit, offset);
  const total = await queryOne<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM system_backup_restore_items i
    JOIN system_backup_restore_runs r ON r.id=i.run_id
    ${whereSql}
  `, ...params);
  const runs = await queryAll(`
    SELECT id, mode, actor_id, source_filename, source_created_at, status,
           restored_rows, duplicate_rows, conflict_rows, restored_files, message,
           created_at, completed_at
    FROM system_backup_restore_runs
    ORDER BY id DESC LIMIT 100
  `);
  res.setHeader("Cache-Control", "no-store");
  res.json({ items, total: total?.count ?? 0, limit, offset, runs });
});

router.get("/system-backup/restore-log/item/:id", async (req, res) => {
  if (!await currentAdmin(req)) return void res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة" });
  const itemId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return void res.status(400).json({ error: "معرّف السجل غير صالح" });
  const item = await queryOne<{
    id: number;
    item_type: string;
    table_name: string | null;
    record_key: string | null;
    [key: string]: unknown;
  }>(`
    SELECT i.id, i.run_id, i.item_type, i.table_name, i.record_key, i.display_label,
           i.outcome, i.target_path, i.details, i.reviewed_at, i.reviewed_by, i.created_at,
           r.mode, r.status AS run_status, r.source_filename
    FROM system_backup_restore_items i
    JOIN system_backup_restore_runs r ON r.id=i.run_id
    WHERE i.id=?
  `, itemId);
  if (!item) return void res.status(404).json({ error: "سجل الاستعادة غير موجود" });

  let record: Record<string, unknown> | null = null;
  const sensitive = !item.table_name || /session|token|secret|credential/i.test(item.table_name)
    || !item.record_key || item.record_key.startsWith("sha256:");
  if (!sensitive && item.item_type === "record" && item.record_key) {
    try {
      const table = String(item.table_name).replaceAll('"', '""');
      const exists = await queryOne("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", item.table_name);
      if (exists) {
        const columns = await queryAll<{ name: string; pk: number }>(`PRAGMA table_info("${table}")`);
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
          const row = await queryOne<Record<string, unknown>>(`SELECT * FROM "${table}" WHERE ${where}`, ...values);
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

router.patch("/system-backup/restore-log/item/:id/review", async (req, res) => {
  const admin = await currentAdmin(req);
  if (!admin) return void res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة" });
  if (req.body?.reviewed !== true) return void res.status(400).json({ error: "أرسل reviewed=true لتأكيد المراجعة" });
  const itemId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return void res.status(400).json({ error: "معرّف السجل غير صالح" });
  const result = await execute(`
    UPDATE system_backup_restore_items
    SET reviewed_at=COALESCE(reviewed_at, datetime('now')),
        reviewed_by=COALESCE(reviewed_by, ?)
    WHERE id=?
  `, String(admin.actor), itemId);
  if (!result.changes) return void res.status(404).json({ error: "سجل الاستعادة غير موجود" });
  const item = await queryOne(
    "SELECT id, reviewed_at, reviewed_by FROM system_backup_restore_items WHERE id=?",
    itemId,
  );
  res.setHeader("Cache-Control", "no-store");
  res.json({ item });
});

export default router;
