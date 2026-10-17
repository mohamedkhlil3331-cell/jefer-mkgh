import { ReplitConnectors } from "@replit/connectors-sdk";
import { getR2Object, uploadR2Object } from "./r2-storage.js";
import {
  createD1ReplicationService,
  D1_RUNTIME_STATE_TABLE,
  isD1ReadOnlyStatement,
  type ReplicatedStatement,
} from "./d1-replication.js";

const DEFAULT_D1_DATABASE_ID = "bbeae386-5413-4c9d-8ea5-0f0417960591";

type D1QueryResult<T> = {
  results: T[];
  success: boolean;
  meta?: {
    changes?: number;
    duration?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
  };
};

type CloudflareEnvelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: D1QueryResult<T>[];
};

export type ProductionD1Statement = {
  sql: string;
  params?: unknown[];
};

function validateDatabaseId(databaseId: string): string {
  const value = databaseId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("[cloudflare-d1] A valid D1 database ID is required");
  }
  return value;
}

export function getProductionD1DatabaseId(): string {
  return validateDatabaseId(process.env.ERP_D1_PRIMARY_DATABASE_ID?.trim() || DEFAULT_D1_DATABASE_ID);
}

export function getD1ReplicaDatabaseId(): string {
  const replicaId = process.env.ERP_D1_REPLICA_DATABASE_ID?.trim();
  if (!replicaId) throw new Error("[cloudflare-d1] ERP_D1_REPLICA_DATABASE_ID is required");
  return validateDatabaseId(replicaId);
}

function getAccountId(): string {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  if (!accountId) {
    throw new Error("[cloudflare-d1] CLOUDFLARE_R2_ACCOUNT_ID is required");
  }
  return accountId;
}

function replicationEnabled(): boolean {
  return process.env.ERP_D1_REPLICATION_ENABLED === "1";
}

async function executeD1Request<T>(
  databaseId: string,
  body: { sql: string; params: unknown[] } | { batch: Array<{ sql: string; params: unknown[] }> },
  description: string,
): Promise<D1QueryResult<T>[]> {
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy(
    "cloudflare",
    `/v4/accounts/${getAccountId()}/d1/database/${validateDatabaseId(databaseId)}/query`,
    { method: "POST", body },
  );

  let payload: CloudflareEnvelope<T>;
  try {
    payload = await response.json() as CloudflareEnvelope<T>;
  } catch {
    throw new Error(`[cloudflare-d1] Cloudflare returned a non-JSON ${description} response (HTTP ${response.status})`);
  }
  if (!response.ok || !payload.success) {
    const details = payload.errors?.map(error => error.message || `code ${error.code ?? "unknown"}`).join("; ");
    throw new Error(`[cloudflare-d1] ${description} failed (HTTP ${response.status})${details ? `: ${details}` : ""}`);
  }
  const results = payload.result ?? [];
  if (!results.length || results.some(result => !result.success)) {
    throw new Error(`[cloudflare-d1] ${description} returned an unsuccessful D1 result`);
  }
  return results;
}

export async function queryD1Database<T = Record<string, unknown>>(
  databaseId: string,
  sql: string,
  params: unknown[] = [],
): Promise<D1QueryResult<T>> {
  if (!sql.trim()) throw new Error("[cloudflare-d1] SQL statement cannot be empty");
  const results = await executeD1Request<T>(databaseId, { sql, params }, "query");
  if (results.length !== 1) throw new Error("[cloudflare-d1] Query returned an unexpected number of results");
  return results[0];
}

export async function queryD1DatabaseBatch<T = Record<string, unknown>>(
  databaseId: string,
  batch: ProductionD1Statement[],
): Promise<D1QueryResult<T>[]> {
  if (!batch.length) return [];
  if (batch.some(statement => !statement.sql.trim())) {
    throw new Error("[cloudflare-d1] Batch statements cannot be empty");
  }
  const results = await executeD1Request<T>(
    databaseId,
    { batch: batch.map(statement => ({ sql: statement.sql, params: statement.params ?? [] })) },
    "batch",
  );
  if (results.length !== batch.length) {
    throw new Error(`[cloudflare-d1] Batch returned ${results.length} result(s) for ${batch.length} statement(s)`);
  }
  return results;
}

const replicationService = createD1ReplicationService({
  query: queryD1Database,
  batch: queryD1DatabaseBatch,
  putObject: (key, contents) => uploadR2Object(key, contents, "application/json", "no-store"),
  getObject: async key => {
    const object = await getR2Object(key);
    if (!object?.Body) return null;
    return Buffer.from(await object.Body.transformToByteArray());
  },
});

export async function ensureD1ReplicationSchema(): Promise<void> {
  if (!replicationEnabled()) {
    throw new Error("[cloudflare-d1] Set ERP_D1_REPLICATION_ENABLED=1 before starting the D1 backend");
  }
  const primaryId = getProductionD1DatabaseId();
  const replicaId = getD1ReplicaDatabaseId();
  if (primaryId === replicaId) {
    throw new Error("[cloudflare-d1] The D1 primary and replica must be different databases");
  }
  await replicationService.ensureSchema(primaryId, replicaId);
}

export async function hasD1MigrationBaselineBeenVerified(): Promise<boolean> {
  const result = await queryD1Database<{ migration_baseline_verified_at: string | null }>(
    getProductionD1DatabaseId(),
    `SELECT migration_baseline_verified_at FROM ${D1_RUNTIME_STATE_TABLE} WHERE id=1`,
  );
  return Boolean(result.results[0]?.migration_baseline_verified_at);
}

export async function markD1MigrationBaselineVerified(): Promise<void> {
  await queryD1Database(
    getProductionD1DatabaseId(),
    `INSERT INTO ${D1_RUNTIME_STATE_TABLE} (id, migration_baseline_verified_at)
     VALUES (1, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET migration_baseline_verified_at=COALESCE(
       ${D1_RUNTIME_STATE_TABLE}.migration_baseline_verified_at, excluded.migration_baseline_verified_at
     )`,
  );
}

export async function drainD1Replication(maxOperations = 100): Promise<number> {
  return replicationService.drain(getProductionD1DatabaseId(), getD1ReplicaDatabaseId(), maxOperations);
}

export async function getD1ReplicationStatus(): Promise<{
  pendingOperations: number;
  lastAppliedSequence: number;
  latestSequence: number;
}> {
  return replicationService.status(getProductionD1DatabaseId(), getD1ReplicaDatabaseId());
}

export async function acquireD1ReplicaSnapshotLock(): Promise<{ token: string; sequence: number }> {
  return replicationService.acquireSnapshotLock(getD1ReplicaDatabaseId());
}

export async function releaseD1ReplicaSnapshotLock(token: string): Promise<void> {
  return replicationService.releaseSnapshotLock(getD1ReplicaDatabaseId(), token);
}

type CloudflareTimeTravelEnvelope = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: {
    bookmark?: string;
    message?: string;
    previous_bookmark?: string;
  };
};

async function callD1TimeTravel(
  databaseId: string,
  operation: "bookmark" | "restore",
  bookmark?: string,
): Promise<CloudflareTimeTravelEnvelope> {
  const database = validateDatabaseId(databaseId);
  const base = `/v4/accounts/${getAccountId()}/d1/database/${database}/time_travel`;
  const endpoint = operation === "bookmark"
    ? `${base}/bookmark`
    : `${base}/restore?bookmark=${encodeURIComponent(bookmark ?? "")}`;
  const connectors = new ReplitConnectors();
  const proxyFetch = connectors.createProxyFetch("cloudflare");
  const response = await proxyFetch(endpoint, {
    method: operation === "bookmark" ? "GET" : "POST",
  });
  let envelope: CloudflareTimeTravelEnvelope;
  try {
    envelope = await response.json() as CloudflareTimeTravelEnvelope;
  } catch {
    throw new Error(`[cloudflare-d1] D1 time-travel request returned non-JSON output (HTTP ${response.status})`);
  }
  if (!response.ok || !envelope.success) {
    const details = envelope.errors?.map(error => error.message || `code ${error.code ?? "unknown"}`).join("; ");
    throw new Error(`[cloudflare-d1] D1 time-travel ${operation} failed (HTTP ${response.status})${details ? `: ${details}` : ""}`);
  }
  return envelope;
}

export async function getD1DatabaseBookmark(databaseId: string): Promise<string> {
  const envelope = await callD1TimeTravel(databaseId, "bookmark");
  const bookmark = envelope.result?.bookmark?.trim();
  if (!bookmark) throw new Error("[cloudflare-d1] D1 bookmark response did not contain a bookmark");
  return bookmark;
}

export async function captureD1ReplicaCheckpoint(): Promise<{ bookmark: string; replicationSequence: number }> {
  const replicaId = getD1ReplicaDatabaseId();
  const lock = await replicationService.acquireSnapshotLock(replicaId);
  try {
    const bookmark = await getD1DatabaseBookmark(replicaId);
    return { bookmark, replicationSequence: lock.sequence };
  } finally {
    await replicationService.releaseSnapshotLock(replicaId, lock.token);
  }
}

export async function restoreD1ReplicaCheckpoint(bookmark: string): Promise<void> {
  const value = bookmark.trim();
  if (!/^[A-Za-z0-9._-]{1,256}$/.test(value)) {
    throw new Error("[cloudflare-d1] D1 bookmark format is invalid");
  }
  const replicaId = getD1ReplicaDatabaseId();
  const lock = await replicationService.acquireSnapshotLock(replicaId);
  let restored = false;
  try {
    await callD1TimeTravel(replicaId, "restore", value);
    restored = true;
    await replicationService.clearRestoredSnapshotLock(replicaId);
  } catch (error) {
    if (!restored) {
      await replicationService.releaseSnapshotLock(replicaId, lock.token).catch(() => {});
    }
    throw error;
  }
}

export function startD1ReplicationWorker(
  onError: (error: unknown) => void,
  intervalMs = 2_000,
): () => void {
  if (!replicationEnabled()) {
    throw new Error("[cloudflare-d1] Cannot start the replica worker while D1 replication is disabled");
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 250) {
    throw new Error("[cloudflare-d1] Replica worker interval must be at least 250ms");
  }
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await drainD1Replication(20);
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * Execute one SQL statement against the production D1 database.
 * Cloudflare connector paths are relative to /client and therefore start with /v4.
 */
export async function queryProductionD1<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<D1QueryResult<T>> {
  if (!sql.trim()) throw new Error("[cloudflare-d1] SQL statement cannot be empty");
  const primaryId = getProductionD1DatabaseId();
  if (!isD1ReadOnlyStatement(sql) && replicationEnabled()) {
    const results = await replicationService.executeAndJournal(primaryId, [{ sql, params }]);
    return results[0] as D1QueryResult<T>;
  }
  return queryD1Database<T>(primaryId, sql, params);
}

/**
 * Execute an atomic batch of statements against production D1.
 * Cloudflare runs the statements sequentially and rolls the batch back if one fails.
 */
export async function queryProductionD1Batch<T = Record<string, unknown>>(
  batch: ProductionD1Statement[],
): Promise<D1QueryResult<T>[]> {
  if (!batch.length) return [];
  if (batch.some(statement => !statement.sql.trim())) {
    throw new Error("[cloudflare-d1] Batch statements cannot be empty");
  }
  const primaryId = getProductionD1DatabaseId();
  const statements: ReplicatedStatement[] = batch.map(({ sql, params }) => ({ sql, params }));
  if (replicationEnabled() && statements.some(statement => !isD1ReadOnlyStatement(statement.sql))) {
    return await replicationService.executeAndJournal(primaryId, statements) as D1QueryResult<T>[];
  }
  return queryD1DatabaseBatch<T>(primaryId, batch);
}

export async function checkProductionD1(): Promise<void> {
  const result = await queryProductionD1<{ ok: number }>("SELECT 1 AS ok");
  if (result.results[0]?.ok !== 1) {
    throw new Error("[cloudflare-d1] D1 health query returned an unexpected result");
  }
}
