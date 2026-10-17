import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  captureD1ReplicaCheckpoint,
  queryD1Database,
  queryD1DatabaseBatch,
  restoreD1ReplicaCheckpoint,
} from "./cloudflare-d1.js";
import {
  createD1ReplicationService,
  type D1ReplicationAdapter,
  type ReplicatedStatement,
} from "./d1-replication.js";
import {
  deleteR2Object,
  getR2Object,
  uploadR2Object,
} from "./r2-storage.js";

const primaryId = process.env.ERP_D1_PRIMARY_DATABASE_ID?.trim();
const replicaId = process.env.ERP_D1_REPLICA_DATABASE_ID?.trim();
const testTable = "__d1_replication_integration_items";
const runId = randomUUID();
const r2Prefix = `d1-replication-test/${runId}`;
const uploadedKeys = new Set<string>();

if (!primaryId || !replicaId || primaryId === replicaId) {
  throw new Error("Set distinct test-only ERP_D1_PRIMARY_DATABASE_ID and ERP_D1_REPLICA_DATABASE_ID values.");
}

function mapR2Key(key: string): string {
  const suffix = key.replace(/^d1-replication\//, "");
  return `${r2Prefix}/${suffix}`;
}

const adapter: D1ReplicationAdapter = {
  query: queryD1Database,
  batch: (databaseId: string, statements: ReplicatedStatement[]) =>
    queryD1DatabaseBatch(databaseId, statements),
  putObject: async (key, contents) => {
    const mappedKey = mapR2Key(key);
    uploadedKeys.add(mappedKey);
    await uploadR2Object(mappedKey, contents, "application/json", "no-store");
  },
  getObject: async key => {
    const object = await getR2Object(mapR2Key(key));
    if (!object?.Body) return null;
    return Buffer.from(await object.Body.transformToByteArray());
  },
  newId: randomUUID,
};

const replication = createD1ReplicationService(adapter);

async function assertDatabaseHasNoTables(databaseId: string): Promise<void> {
  const result = await queryD1Database<{ name: string }>(
    databaseId,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  assert.deepEqual(
    result.results.map(row => row.name).filter(name => name !== "_cf_KV"),
    [],
    "refusing to run against a non-empty test database",
  );
}

async function cleanup(): Promise<void> {
  for (const databaseId of [primaryId!, replicaId!]) {
    const tables = databaseId === primaryId
      ? [testTable, "__d1_replication_outbox", "__d1_runtime_state"]
      : [testTable, "__d1_replication_applied", "__d1_replication_state", "__d1_replication_outbox"];
    await queryD1DatabaseBatch(databaseId, tables.map(name => ({
      sql: `DROP TABLE IF EXISTS "${name}"`,
    })));
  }
  await Promise.all([...uploadedKeys].map(key => deleteR2Object(key)));
}

async function main(): Promise<void> {
  await assertDatabaseHasNoTables(primaryId!);
  await assertDatabaseHasNoTables(replicaId!);

  try {
    await replication.ensureSchema(primaryId!, replicaId!);

    await replication.executeAndJournal(primaryId!, [{
      sql: `CREATE TABLE ${testTable} (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`,
    }]);
    const snapshotLock = await replication.acquireSnapshotLock(replicaId!);
    assert.equal(await replication.drain(primaryId!, replicaId!, 10), 0, "snapshot lock must pause replica replay");
    await replication.releaseSnapshotLock(replicaId!, snapshotLock.token);
    assert.equal(await replication.drain(primaryId!, replicaId!, 10), 1);

    await replication.executeAndJournal(primaryId!, [
      { sql: `INSERT INTO ${testTable} (id, value) VALUES (?, ?)`, params: [1, "synthetic-alpha"] },
      { sql: `INSERT INTO ${testTable} (id, value) VALUES (?, ?)`, params: [2, "synthetic-beta"] },
    ]);
    assert.equal(await replication.drain(primaryId!, replicaId!, 10), 1);

    const primaryRows = await queryD1Database<{ id: number; value: string }>(
      primaryId!,
      `SELECT id, value FROM ${testTable} ORDER BY id`,
    );
    const replicaRows = await queryD1Database<{ id: number; value: string }>(
      replicaId!,
      `SELECT id, value FROM ${testTable} ORDER BY id`,
    );
    assert.deepEqual(replicaRows.results, primaryRows.results);

    const checkpoint = await captureD1ReplicaCheckpoint();
    assert.equal(checkpoint.replicationSequence, 2);
    assert.ok(checkpoint.bookmark.length > 0);

    await replication.executeAndJournal(primaryId!, [{
      sql: `INSERT INTO ${testTable} (id, value) VALUES (?, ?)`,
      params: [3, "synthetic-after-snapshot"],
    }]);
    assert.equal(await replication.drain(primaryId!, replicaId!, 10), 1);

    await restoreD1ReplicaCheckpoint(checkpoint.bookmark);
    const restoredReplicaRows = await queryD1Database<{ id: number; value: string }>(
      replicaId!,
      `SELECT id, value FROM ${testTable} ORDER BY id`,
    );
    assert.deepEqual(restoredReplicaRows.results.map(row => row.id), [1, 2]);
    assert.deepEqual(await replication.status(primaryId!, replicaId!), {
      pendingOperations: 1,
      lastAppliedSequence: 2,
      latestSequence: 3,
    });
    assert.equal(await replication.drain(primaryId!, replicaId!, 10), 1);
    const caughtUpReplicaRows = await queryD1Database<{ id: number; value: string }>(
      replicaId!,
      `SELECT id, value FROM ${testTable} ORDER BY id`,
    );
    const currentPrimaryRows = await queryD1Database<{ id: number; value: string }>(
      primaryId!,
      `SELECT id, value FROM ${testTable} ORDER BY id`,
    );
    assert.deepEqual(caughtUpReplicaRows.results, currentPrimaryRows.results);

    await assert.rejects(replication.executeAndJournal(primaryId!, [
      { sql: `INSERT INTO ${testTable} (id, value) VALUES (?, ?)`, params: [4, "must-rollback"] },
      { sql: `INSERT INTO ${testTable} (id, value) VALUES (?, ?)`, params: [1, "duplicate"] },
    ]));
    const afterFailedBatch = await queryD1Database<{ id: number }>(
      primaryId!,
      `SELECT id FROM ${testTable} ORDER BY id`,
    );
    assert.deepEqual(afterFailedBatch.results.map(row => row.id), [1, 2, 3]);

    assert.deepEqual(await replication.status(primaryId!, replicaId!), {
      pendingOperations: 0,
      lastAppliedSequence: 3,
      latestSequence: 3,
    });
    console.log("Live D1/R2 journal, replay, Time Travel restore, and catch-up test passed with synthetic data only");
  } finally {
    await cleanup();
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
