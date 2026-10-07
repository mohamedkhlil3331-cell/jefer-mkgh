import { Storage } from "@google-cloud/storage";
import Database from "better-sqlite3";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import fs from "fs";
import path from "path";

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
// Use separate backup keys for production vs development so they never
// overwrite each other's data.
const BACKUP_KEY = process.env.NODE_ENV === "production"
  ? "db-backups/erp.db"
  : "db-backups/erp.db.dev";
const SIDECAR = "http://127.0.0.1:1106";
const PROCESS_STARTED_AT = Date.now();
const WRITER_ID = `${hostname()}:${process.pid}:${PROCESS_STARTED_AT}:${randomUUID()}`;
let backupQueue: Promise<void> = Promise.resolve();
let shuttingDown = false;
let writerFenced = false;
let backupPauseDepth = 0;
let staleWriterShutdown: (() => Promise<void>) | undefined;

export function pauseDbBackup(): () => void {
  backupPauseDepth += 1;
  let resumed = false;
  return () => {
    if (resumed) return;
    resumed = true;
    backupPauseDepth = Math.max(0, backupPauseDepth - 1);
  };
}

export async function waitForDbBackupIdle(): Promise<void> {
  await backupQueue;
}

export function isBackupWriterFenced(): boolean {
  return writerFenced;
}

/**
 * A newer server process owns the backup object. The old process must stop
 * accepting writes instead of acknowledging writes it can no longer persist.
 */
export function registerStaleWriterShutdown(handler: () => Promise<void>): void {
  staleWriterShutdown = handler;
  if (writerFenced) void handler();
}

function fenceStaleWriter(): void {
  if (writerFenced) return;
  writerFenced = true;
  shuttingDown = true;
  console.error("[db-sync] This server process is stale; rejecting mutations and shutting down");
  void staleWriterShutdown?.().catch(err => {
    console.error("[db-sync] Failed to close stale server:", err);
  });
}

export function makeStorage(): Storage {
  return new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${SIDECAR}/token`,
      type: "external_account",
      credential_source: {
        url: `${SIDECAR}/credential`,
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    } as never,
    projectId: "",
  });
}

function assertDevelopmentWriterLock(operation: string): void {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_DB_WRITER_LOCK_HELD !== "1") {
    throw new Error(`[db-sync] Refusing development database ${operation} without the exclusive writer lock`);
  }
}

function getBackupWriterMetadata(): Record<string, string> {
  const metadata = { writerStartedAt: String(PROCESS_STARTED_AT) };
  if (process.env.NODE_ENV !== "production") {
    return {
      ...metadata,
      writerId: WRITER_ID,
      writerPid: String(process.pid),
      writerHost: hostname(),
      writerEnvironment: process.env.NODE_ENV || "development",
      writerRuntime: process.env.DEV_DB_WRITER_LOCK_HELD === "1"
        ? "development-api-with-exclusive-lock"
        : "unlocked-nonproduction",
    };
  }
  return metadata;
}

/**
 * Restore the database from Object Storage if a backup exists.
 * Call this BEFORE opening the SQLite connection so the restored file is
 * what gets opened.  Safe to call multiple times — idempotent.
 * Returns true when a backup was actually restored.
 */
export async function restoreDbFromStorage(dbPath: string): Promise<boolean> {
  return downloadDbBackupToStaging(dbPath);
}

export async function downloadDbBackupToStaging(dbPath: string): Promise<boolean> {
  assertDevelopmentWriterLock("restore");
  const isProduction = process.env.NODE_ENV === "production";
  if (!BUCKET_ID) {
    if (isProduction) {
      throw new Error("[db-sync] Object Storage is unavailable in production; refusing to start without the live database backup");
    }
    return false;
  }
  const stagingPath = dbPath + ".staging";
  try {
    const storage = makeStorage();
    const bucket = storage.bucket(BUCKET_ID);
    const file = bucket.file(BACKUP_KEY);

    const [exists] = await file.exists();
    if (!exists) {
      if (isProduction) {
        throw new Error(`[db-sync] Production backup ${BACKUP_KEY} is missing; refusing to start with an empty or bundled database`);
      } else {
        console.log("[db-sync] No backup found in object storage — using default db");
      }
      return false;
    }

    // In production, ALWAYS restore from object storage — it is the source of
    // truth for live data regardless of what was bundled at deploy time.
    // In development, only restore if the backup is strictly newer to avoid
    // overwriting active local work.

    const [meta] = await file.getMetadata();
    const backupTime = new Date(meta.updated as string).getTime();
    const localDbTime = fs.existsSync(dbPath) ? fs.statSync(dbPath).mtimeMs : 0;
    const localWalTime = !isProduction && fs.existsSync(dbPath + "-wal")
      ? fs.statSync(dbPath + "-wal").mtimeMs
      : 0;
    // A committed development write may still be in WAL after an unclean stop.
    // Treat it as newer than the main DB file so restore cannot discard it.
    const localTime = Math.max(localDbTime, localWalTime);

    if (isProduction || backupTime > localTime) {
      console.log(`[db-sync] Restoring backup (mode=${isProduction ? "prod-force" : "dev-newer"}, backup: ${new Date(backupTime).toISOString()}, local: ${new Date(localTime).toISOString()})`);
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      await file.download({ destination: stagingPath });
      for (const ext of ["-wal", "-shm"]) {
        const stagedSidecar = stagingPath + ext;
        if (fs.existsSync(stagedSidecar)) fs.unlinkSync(stagedSidecar);
      }
      const stagedDb = new Database(stagingPath, { readonly: true, fileMustExist: true });
      try {
        const check = stagedDb.pragma("quick_check") as { quick_check?: string }[];
        if (!check.length || check.some(row => row.quick_check !== "ok")) {
          throw new Error("downloaded SQLite backup failed quick_check");
        }
      } finally {
        stagedDb.close();
      }
      for (const ext of ["-wal", "-shm"]) {
        const stagedSidecar = stagingPath + ext;
        if (fs.existsSync(stagedSidecar)) fs.unlinkSync(stagedSidecar);
      }
      // Move the old DB and sidecars out of the way as one rollback-capable
      // operation. Never delete WAL frames before the validated replacement is
      // installed successfully.
      const previousPaths: { original: string; previous: string }[] = [];
      try {
        for (const ext of ["", "-wal", "-shm"]) {
          const original = dbPath + ext;
          if (!fs.existsSync(original)) continue;
          const previous = original + ".previous";
          if (fs.existsSync(previous)) fs.unlinkSync(previous);
          fs.renameSync(original, previous);
          previousPaths.push({ original, previous });
        }
        fs.renameSync(stagingPath, dbPath);
      } catch (swapError) {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        for (const { original, previous } of previousPaths.reverse()) {
          if (fs.existsSync(previous)) fs.renameSync(previous, original);
        }
        throw swapError;
      }
      for (const { previous } of previousPaths) {
        if (fs.existsSync(previous)) fs.unlinkSync(previous);
      }
      console.log("[db-sync] DB restored from object storage backup");
      return true;
    } else {
      console.log("[db-sync] Local db is up to date — no restore needed");
      return false;
    }
  } catch (err) {
    if (fs.existsSync(dbPath + ".staging")) fs.unlinkSync(dbPath + ".staging");
    if (isProduction) {
      console.error("[db-sync] Production restore failed — startup aborted to protect live data:", err);
      throw err;
    }
    console.error("[db-sync] Restore failed (using local db):", err);
    return false;
  }
}

/**
 * Upload DB to object storage.
 * @param checkpointFn  Optional callback called BEFORE the upload to flush WAL
 *                      into the main DB file (pass db.checkpointWAL).
 */
export async function uploadDbBackup(
  dbPath: string,
  checkpointFn?: () => void,
  allowWhilePaused = false,
): Promise<void> {
  assertDevelopmentWriterLock("backup");
  const run = backupQueue.then(async () => {
    if (backupPauseDepth > 0 && !allowWhilePaused) return;
    if (!BUCKET_ID || !fs.existsSync(dbPath)) return;
    // Flush WAL into the main file FIRST. checkpointFn must throw unless every
    // committed frame is present in the main DB file.
    if (checkpointFn) checkpointFn();

    const storage = makeStorage();
    const bucket = storage.bucket(BUCKET_ID);
    const file = bucket.file(BACKUP_KEY);
    for (let attempt = 0; attempt < 2; attempt++) {
      const [exists] = await file.exists();
      let metadata: { metadata?: Record<string, string>; generation?: string | number } = {};
      if (exists) {
        const [currentMetadata] = await file.getMetadata();
        metadata = currentMetadata as typeof metadata;
      }
      const incumbentStartedAt = Number(
        metadata.metadata?.writerStartedAt || 0,
      );
      if (incumbentStartedAt > PROCESS_STARTED_AT) {
        const incumbentWriter = metadata.metadata?.writerId
          || `pid=${metadata.metadata?.writerPid || "unknown"} host=${metadata.metadata?.writerHost || "unknown"} startedAt=${incumbentStartedAt}`;
        console.error(`[db-sync] Backup writer conflict: current=${WRITER_ID}; newer owner=${incumbentWriter}`);
        fenceStaleWriter();
        throw new Error("[db-sync] Refusing backup from an older server process after a newer deployment became authoritative");
      }
      const generation = exists && metadata.generation
        ? Number(metadata.generation)
        : 0;
      try {
        await bucket.upload(dbPath, {
          destination: BACKUP_KEY,
          metadata: { metadata: getBackupWriterMetadata() },
          preconditionOpts: { ifGenerationMatch: generation },
        });
        console.log(process.env.NODE_ENV === "production"
          ? "[db-sync] DB backed up to object storage"
          : `[db-sync] Development DB backed up to object storage (writer=${WRITER_ID})`);
        return;
      } catch (err: any) {
        if (attempt === 0 && (err?.code === 412 || err?.code === 409)) continue;
        throw err;
      }
    }
  });
  backupQueue = run.catch(() => {});
  return run.catch(err => {
    console.error("[db-sync] Backup upload failed:", err);
    throw err;
  });
}

/**
 * Start periodic backups.
 * - First backup fires immediately (no delay) so Replit sleep right after
 *   startup doesn't lose any data.
 * - Then every 30 s (was 60 s) to minimise the window of data loss.
 */
export function startPeriodicDbBackup(
  dbPath: string,
  intervalMs = 30_000,
  checkpointFn?: () => void,
  initialBackupAlreadyDone = false,
): void {
  if (!initialBackupAlreadyDone) uploadDbBackup(dbPath, checkpointFn).catch(() => {});
  setInterval(() => {
    if (!shuttingDown && backupPauseDepth === 0) uploadDbBackup(dbPath, checkpointFn).catch(() => {});
  }, intervalMs);
}

/** Register SIGTERM / SIGINT handlers that upload a final backup before exit.
 *  Call once from the main process. */
export function registerShutdownBackup(
  dbPath: string,
  checkpointFn?: () => void,
  stopAcceptingRequests?: () => Promise<void>,
): void {
  const handler = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[db-sync] ${signal} received — draining requests before final backup...`);
    try {
      if (stopAcceptingRequests) await stopAcceptingRequests();
      await uploadDbBackup(dbPath, checkpointFn);
      process.exit(0);
    } catch (err) {
      console.error("[db-sync] Graceful shutdown backup failed:", err);
      process.exit(1);
    }
  };
  process.once("SIGTERM", () => { void handler("SIGTERM"); });
  process.once("SIGINT",  () => { void handler("SIGINT"); });
}

export function getDefaultDbPath(): string {
  const cwd = process.cwd();
  const apiServerRoot = path.basename(cwd) === "api-server"
    ? cwd
    : path.join(cwd, "artifacts", "api-server");
  return path.join(apiServerRoot, "data", "erp.db");
}

export function getBackupWriterId(): string {
  return WRITER_ID;
}
