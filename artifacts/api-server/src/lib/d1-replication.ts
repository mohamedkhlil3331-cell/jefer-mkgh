import { randomUUID } from "node:crypto";

export type ReplicatedStatement = {
  sql: string;
  params?: unknown[];
};

export type ReplicationQueryResult<T = Record<string, unknown>> = {
  results: T[];
  success: boolean;
  meta?: {
    changes?: number;
    last_row_id?: number;
  };
};

export type D1ReplicationAdapter = {
  query<T = Record<string, unknown>>(
    databaseId: string,
    sql: string,
    params?: unknown[],
  ): Promise<ReplicationQueryResult<T>>;
  batch<T = Record<string, unknown>>(
    databaseId: string,
    statements: ReplicatedStatement[],
  ): Promise<ReplicationQueryResult<T>[]>;
  putObject(key: string, contents: Buffer): Promise<void>;
  getObject(key: string): Promise<Buffer | null>;
  newId?: () => string;
};

type SerializedParameter =
  | null
  | string
  | number
  | boolean
  | { __d1_replication_type: "bigint"; value: string }
  | { __d1_replication_type: "bytes"; value: string };

type ReplicationPayload = {
  version: 1;
  operationId: string;
  statements: Array<{ sql: string; params: SerializedParameter[] }>;
};

type OutboxRow = {
  sequence: number;
  operation_id: string;
  payload_key: string;
};

type ReplicaStateRow = {
  last_sequence: number;
  snapshot_lock_token?: string | null;
  snapshot_lock_expires_at?: number | null;
};

export const D1_REPLICATION_OUTBOX_TABLE = "__d1_replication_outbox";
export const D1_REPLICATION_STATE_TABLE = "__d1_replication_state";
export const D1_REPLICATION_APPLIED_TABLE = "__d1_replication_applied";
export const D1_RUNTIME_STATE_TABLE = "__d1_runtime_state";

const MAX_REPLAY_STATEMENTS = 98;

function sqlWithoutComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*--.*$/gm, " ")
    .trim();
}

/**
 * Only SELECT and EXPLAIN are treated as read-only. Unknown statement forms
 * are journaled so a new mutation syntax cannot silently bypass replication.
 */
export function isD1ReadOnlyStatement(sql: string): boolean {
  const normalized = sqlWithoutComments(sql);
  return /^(?:SELECT|EXPLAIN)\b/i.test(normalized);
}

function serializeParameter(value: unknown): SerializedParameter {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("[d1-replication] Non-finite SQL parameters cannot be journaled");
    return value;
  }
  if (typeof value === "bigint") {
    return { __d1_replication_type: "bigint", value: value.toString() };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return {
      __d1_replication_type: "bytes",
      value: Buffer.from(value).toString("base64"),
    };
  }
  if (value instanceof ArrayBuffer) {
    return {
      __d1_replication_type: "bytes",
      value: Buffer.from(value).toString("base64"),
    };
  }
  throw new Error("[d1-replication] Unsupported SQL parameter type; refusing an unreplicated write");
}

function deserializeParameter(value: SerializedParameter): unknown {
  if (value && typeof value === "object") {
    if (value.__d1_replication_type === "bigint") return BigInt(value.value);
    if (value.__d1_replication_type === "bytes") return Buffer.from(value.value, "base64");
  }
  return value;
}

export function serializeD1ReplicationPayload(
  operationId: string,
  statements: ReplicatedStatement[],
): Buffer {
  if (!operationId || !statements.length) {
    throw new Error("[d1-replication] A journal payload needs an operation ID and at least one statement");
  }
  const payload: ReplicationPayload = {
    version: 1,
    operationId,
    statements: statements.map(({ sql, params = [] }) => {
      if (!sql.trim()) throw new Error("[d1-replication] Cannot journal an empty SQL statement");
      return { sql, params: params.map(serializeParameter) };
    }),
  };
  return Buffer.from(JSON.stringify(payload), "utf8");
}

export function parseD1ReplicationPayload(contents: Buffer): {
  operationId: string;
  statements: ReplicatedStatement[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents.toString("utf8"));
  } catch {
    throw new Error("[d1-replication] Replication payload is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("[d1-replication] Replication payload has an invalid shape");
  }
  const payload = parsed as Partial<ReplicationPayload>;
  if (
    payload.version !== 1
    || typeof payload.operationId !== "string"
    || !payload.operationId
    || !Array.isArray(payload.statements)
    || !payload.statements.length
  ) {
    throw new Error("[d1-replication] Replication payload has an unsupported version or shape");
  }
  return {
    operationId: payload.operationId,
    statements: payload.statements.map(statement => {
      if (!statement || typeof statement.sql !== "string" || !statement.sql.trim() || !Array.isArray(statement.params)) {
        throw new Error("[d1-replication] Replication payload contains an invalid SQL statement");
      }
      return {
        sql: statement.sql,
        params: statement.params.map(deserializeParameter),
      };
    }),
  };
}

export function createD1ReplicationService(adapter: D1ReplicationAdapter) {
  const newId = adapter.newId ? () => adapter.newId!() : randomUUID;

  async function ensureSchema(primaryId: string, replicaId: string): Promise<void> {
    if (!primaryId || !replicaId || primaryId === replicaId) {
      throw new Error("[d1-replication] Primary and replica database IDs must be configured and distinct");
    }
    await adapter.batch(primaryId, [
      {
        sql: `CREATE TABLE IF NOT EXISTS ${D1_REPLICATION_OUTBOX_TABLE} (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          operation_id TEXT NOT NULL UNIQUE,
          payload_key TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS ${D1_RUNTIME_STATE_TABLE} (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          migration_baseline_verified_at TEXT
        )`,
      },
    ]);
    await adapter.batch(replicaId, [
      {
        sql: `CREATE TABLE IF NOT EXISTS ${D1_REPLICATION_OUTBOX_TABLE} (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          operation_id TEXT NOT NULL UNIQUE,
          payload_key TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS ${D1_REPLICATION_STATE_TABLE} (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          last_sequence INTEGER NOT NULL DEFAULT 0,
          snapshot_lock_token TEXT,
          snapshot_lock_expires_at INTEGER
        )`,
      },
      {
        sql: `INSERT OR IGNORE INTO ${D1_REPLICATION_STATE_TABLE} (id, last_sequence) VALUES (1, 0)`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS ${D1_REPLICATION_APPLIED_TABLE} (
          operation_id TEXT PRIMARY KEY,
          sequence INTEGER NOT NULL UNIQUE,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      },
    ]);
  }

  async function executeAndJournal(
    primaryId: string,
    statements: ReplicatedStatement[],
  ): Promise<ReplicationQueryResult[]> {
    if (!statements.length) return [];
    if (statements.length > MAX_REPLAY_STATEMENTS) {
      throw new Error(`[d1-replication] A write batch cannot exceed ${MAX_REPLAY_STATEMENTS} statements`);
    }
    const operationId = newId();
    const payloadKey = `d1-replication/operations/${operationId}.json`;
    const payload = serializeD1ReplicationPayload(operationId, statements);

    // The payload is durable before the D1 transaction. If the D1 response is
    // lost after commit, the outbox still points to a complete replay record.
    await adapter.putObject(payloadKey, payload);
    const results = await adapter.batch(primaryId, [
      ...statements,
      {
        sql: `INSERT INTO ${D1_REPLICATION_OUTBOX_TABLE} (operation_id, payload_key) VALUES (?, ?)`,
        params: [operationId, payloadKey],
      },
    ]);
    if (results.length !== statements.length + 1) {
      throw new Error("[d1-replication] Primary D1 returned an incomplete journaled batch");
    }
    return results.slice(0, statements.length);
  }

  async function getReplicaState(replicaId: string): Promise<ReplicaStateRow> {
    const result = await adapter.query<ReplicaStateRow>(
      replicaId,
      `SELECT last_sequence, snapshot_lock_token, snapshot_lock_expires_at
       FROM ${D1_REPLICATION_STATE_TABLE} WHERE id=1`,
    );
    const state = result.results[0];
    const sequence = Number(state?.last_sequence);
    if (!Number.isSafeInteger(sequence) || sequence < 0) {
      throw new Error("[d1-replication] Replica checkpoint is missing or invalid");
    }
    return { ...state, last_sequence: sequence };
  }

  async function getReplicaSequence(replicaId: string): Promise<number> {
    return (await getReplicaState(replicaId)).last_sequence;
  }

  async function applyNext(primaryId: string, replicaId: string): Promise<boolean> {
    const replicaState = await getReplicaState(replicaId);
    if (
      replicaState.snapshot_lock_token
      && Number(replicaState.snapshot_lock_expires_at ?? 0) > Date.now()
    ) return false;
    const lastSequence = replicaState.last_sequence;
    const nextResult = await adapter.query<OutboxRow>(
      primaryId,
      `SELECT sequence, operation_id, payload_key
       FROM ${D1_REPLICATION_OUTBOX_TABLE}
       WHERE sequence > ?
       ORDER BY sequence
       LIMIT 1`,
      [lastSequence],
    );
    const next = nextResult.results[0];
    if (!next) return false;
    const sequence = Number(next.sequence);
    if (!Number.isSafeInteger(sequence) || sequence !== lastSequence + 1) {
      throw new Error("[d1-replication] Primary outbox has a sequence gap; replica will not advance");
    }
    if (typeof next.operation_id !== "string" || typeof next.payload_key !== "string") {
      throw new Error("[d1-replication] Primary outbox row is malformed");
    }

    const contents = await adapter.getObject(next.payload_key);
    if (!contents) {
      throw new Error(`[d1-replication] Replication payload ${next.operation_id} is missing from R2`);
    }
    const payload = parseD1ReplicationPayload(contents);
    if (payload.operationId !== next.operation_id) {
      throw new Error("[d1-replication] Replication payload ID does not match the primary outbox");
    }
    if (payload.statements.length > MAX_REPLAY_STATEMENTS) {
      throw new Error("[d1-replication] Replication payload exceeds the D1 atomic batch limit");
    }

    try {
      await adapter.batch(replicaId, [
        {
          // The unique key makes concurrent replay attempts safe: only one
          // transaction can apply this operation and advance the checkpoint.
          sql: `INSERT INTO ${D1_REPLICATION_APPLIED_TABLE} (operation_id, sequence) VALUES (?, ?)`,
          params: [next.operation_id, sequence],
        },
        ...payload.statements,
        {
          sql: `UPDATE ${D1_REPLICATION_STATE_TABLE}
                SET last_sequence=?
                WHERE id=1 AND last_sequence=?`,
          params: [sequence, lastSequence],
        },
      ]);
    } catch (error) {
      const currentSequence = await getReplicaSequence(replicaId);
      if (currentSequence >= sequence) return true;
      throw error;
    }
    const currentSequence = await getReplicaSequence(replicaId);
    if (currentSequence !== sequence) {
      throw new Error("[d1-replication] Replica transaction did not advance its checkpoint");
    }
    return true;
  }

  async function drain(primaryId: string, replicaId: string, maxOperations = 100): Promise<number> {
    if (!Number.isSafeInteger(maxOperations) || maxOperations < 1 || maxOperations > 1000) {
      throw new Error("[d1-replication] Drain limit must be between 1 and 1000");
    }
    let applied = 0;
    while (applied < maxOperations && await applyNext(primaryId, replicaId)) applied += 1;
    return applied;
  }

  async function status(primaryId: string, replicaId: string): Promise<{ pendingOperations: number; lastAppliedSequence: number; latestSequence: number }> {
    const [replicaSequence, primaryResult] = await Promise.all([
      getReplicaSequence(replicaId),
      adapter.query<{ latest_sequence: number | null }>(
        primaryId,
        `SELECT MAX(sequence) AS latest_sequence FROM ${D1_REPLICATION_OUTBOX_TABLE}`,
      ),
    ]);
    const latestSequence = Number(primaryResult.results[0]?.latest_sequence ?? 0);
    if (!Number.isSafeInteger(latestSequence) || latestSequence < replicaSequence) {
      throw new Error("[d1-replication] Primary and replica sequence checkpoints are inconsistent");
    }
    return {
      pendingOperations: latestSequence - replicaSequence,
      lastAppliedSequence: replicaSequence,
      latestSequence,
    };
  }

  async function acquireSnapshotLock(replicaId: string, leaseMs = 60 * 60 * 1000): Promise<{
    token: string;
    sequence: number;
  }> {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 10_000 || leaseMs > 2 * 60 * 60 * 1000) {
      throw new Error("[d1-replication] Snapshot lock lease must be between 10 seconds and 2 hours");
    }
    const token = newId();
    const now = Date.now();
    const lock = await adapter.query<ReplicaStateRow>(
      replicaId,
      `UPDATE ${D1_REPLICATION_STATE_TABLE}
       SET snapshot_lock_token=?, snapshot_lock_expires_at=?
       WHERE id=1 AND (snapshot_lock_token IS NULL OR snapshot_lock_expires_at<=?)
       RETURNING last_sequence, snapshot_lock_token, snapshot_lock_expires_at`,
      [token, now + leaseMs, now],
    );
    const state = lock.results[0];
    if (!state || state.snapshot_lock_token !== token) {
      throw new Error("[d1-replication] Another backup or restore currently holds the D1 replica lock");
    }
    return { token, sequence: Number(state.last_sequence) };
  }

  async function releaseSnapshotLock(replicaId: string, token: string): Promise<void> {
    const result = await adapter.query(
      replicaId,
      `UPDATE ${D1_REPLICATION_STATE_TABLE}
       SET snapshot_lock_token=NULL, snapshot_lock_expires_at=NULL
       WHERE id=1 AND snapshot_lock_token=?`,
      [token],
    );
    if ((result.meta?.changes ?? 0) !== 1) {
      throw new Error("[d1-replication] D1 replica snapshot lock could not be released");
    }
  }

  async function clearRestoredSnapshotLock(replicaId: string): Promise<void> {
    await adapter.query(
      replicaId,
      `UPDATE ${D1_REPLICATION_STATE_TABLE}
       SET snapshot_lock_token=NULL, snapshot_lock_expires_at=NULL
       WHERE id=1`,
    );
  }

  return {
    ensureSchema,
    executeAndJournal,
    drain,
    status,
    acquireSnapshotLock,
    releaseSnapshotLock,
    clearRestoredSnapshotLock,
  };
}
