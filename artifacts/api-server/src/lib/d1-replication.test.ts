import assert from "node:assert/strict";
import {
  createD1ReplicationService,
  isD1ReadOnlyStatement,
  parseD1ReplicationPayload,
  serializeD1ReplicationPayload,
  type D1ReplicationAdapter,
  type ReplicatedStatement,
} from "./d1-replication.js";

type OutboxEntry = {
  sequence: number;
  operation_id: string;
  payload_key: string;
};

class FakeD1ReplicationAdapter implements D1ReplicationAdapter {
  readonly outbox: OutboxEntry[] = [];
  readonly objects = new Map<string, Buffer>();
  readonly replicaApplied = new Set<string>();
  readonly replayedStatements: ReplicatedStatement[][] = [];
  replicaSequence = 0;
  failObjectUpload = false;
  private nextSequence = 1;
  private nextId = 1;

  async query<T>(databaseId: string, sql: string, params: unknown[] = []) {
    if (databaseId === "replica" && sql.includes("__d1_replication_state")) {
      return { success: true, results: [{ last_sequence: this.replicaSequence } as T] };
    }
    if (databaseId === "primary" && sql.includes("MAX(sequence)")) {
      return {
        success: true,
        results: [{ latest_sequence: this.nextSequence - 1 || null } as T],
      };
    }
    if (databaseId === "primary" && sql.includes("__d1_replication_outbox")) {
      const lastSequence = Number(params[0] ?? 0);
      const entry = this.outbox.find(item => item.sequence > lastSequence);
      return { success: true, results: (entry ? [entry] : []) as T[] };
    }
    throw new Error(`Unexpected fake query: ${databaseId} ${sql}`);
  }

  async batch<T>(databaseId: string, statements: ReplicatedStatement[]) {
    if (databaseId === "primary") {
      const journal = statements.at(-1);
      if (journal?.sql.includes("INSERT INTO __d1_replication_outbox")) {
        const [operationId, payloadKey] = journal.params ?? [];
        this.outbox.push({
          sequence: this.nextSequence++,
          operation_id: String(operationId),
          payload_key: String(payloadKey),
        });
      }
      return statements.map(() => ({ success: true, results: [] as T[] }));
    }

    if (databaseId === "replica" && statements[0]?.sql.includes("__d1_replication_applied")) {
      const [operationId, sequence] = statements[0].params ?? [];
      if (this.replicaApplied.has(String(operationId))) {
        throw new Error("UNIQUE constraint failed: duplicate replication operation");
      }
      this.replicaApplied.add(String(operationId));
      this.replayedStatements.push(statements.slice(1, -1));
      this.replicaSequence = Number(sequence);
      return statements.map(() => ({ success: true, results: [] as T[] }));
    }
    return statements.map(() => ({ success: true, results: [] as T[] }));
  }

  async putObject(key: string, contents: Buffer): Promise<void> {
    if (this.failObjectUpload) throw new Error("fake R2 upload failure");
    this.objects.set(key, Buffer.from(contents));
  }

  async getObject(key: string): Promise<Buffer | null> {
    return this.objects.get(key) ?? null;
  }

  newId(): string {
    return `operation-${this.nextId++}`;
  }
}

async function main(): Promise<void> {
  assert.equal(isD1ReadOnlyStatement("SELECT id FROM products"), true);
  assert.equal(isD1ReadOnlyStatement("-- comment\nEXPLAIN QUERY PLAN SELECT 1"), true);
  assert.equal(isD1ReadOnlyStatement("WITH changed AS (SELECT 1) UPDATE products SET active=1"), false);
  assert.equal(isD1ReadOnlyStatement("INSERT INTO products(name) VALUES (?)"), false);

  const bytes = Buffer.from([0, 1, 255]);
  const serialized = serializeD1ReplicationPayload("round-trip", [
    { sql: "SELECT ?, ?, ?", params: [12n, bytes, "text"] },
  ]);
  const parsed = parseD1ReplicationPayload(serialized);
  assert.equal(parsed.operationId, "round-trip");
  assert.equal(parsed.statements[0].params?.[0], 12n);
  assert.deepEqual(parsed.statements[0].params?.[1], bytes);
  assert.equal(parsed.statements[0].params?.[2], "text");
  assert.throws(
    () => serializeD1ReplicationPayload("unsupported", [{ sql: "SELECT ?", params: [new Date()] }]),
    /Unsupported SQL parameter type/,
  );

  const adapter = new FakeD1ReplicationAdapter();
  const service = createD1ReplicationService(adapter);
  await service.ensureSchema("primary", "replica");
  const originalStatements = [
    { sql: "UPDATE products SET active=? WHERE id=?", params: [1, 9] },
    { sql: "INSERT INTO product_ratings(product_id, rating) VALUES (?, ?)", params: [9, 5] },
  ];
  const results = await service.executeAndJournal("primary", originalStatements);
  assert.equal(results.length, originalStatements.length);
  assert.equal(adapter.outbox.length, 1);
  assert.equal(adapter.objects.size, 1);

  assert.equal(await service.drain("primary", "replica", 10), 1);
  assert.deepEqual(adapter.replayedStatements[0], originalStatements);
  assert.deepEqual(await service.status("primary", "replica"), {
    pendingOperations: 0,
    lastAppliedSequence: 1,
    latestSequence: 1,
  });
  assert.equal(await service.drain("primary", "replica", 10), 0);

  const failingAdapter = new FakeD1ReplicationAdapter();
  failingAdapter.failObjectUpload = true;
  const failingService = createD1ReplicationService(failingAdapter);
  await assert.rejects(
    failingService.executeAndJournal("primary", [{ sql: "DELETE FROM products WHERE id=?", params: [9] }]),
    /fake R2 upload failure/,
  );
  assert.equal(failingAdapter.outbox.length, 0);

  console.log("D1 replication tests passed");
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
