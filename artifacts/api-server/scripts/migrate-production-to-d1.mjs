import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  queryProductionD1,
  queryProductionD1Batch,
} from "../src/lib/cloudflare-d1.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const SOURCE_KEY = "db-backups/erp.db";
const D1_TABLE_ROW_LIMIT = 2_000_000;
const MAX_SAFE_ROW_BYTES = 1_900_000;
const OVERFLOW_CHUNK_BYTES = 250_000;
const MAX_BATCH_STATEMENTS = 40;
const MAX_BATCH_BINDINGS = 4_000;
const MAX_BATCH_BODY_BYTES = 4_000_000;
const VERIFY_PAGE_SIZE = 500;
const VERIFY_QUERIES_PER_BATCH = 20;
const INTERNAL_D1_TABLES = new Set([
  "_cf_KV",
  "d1_migration_manifest",
  "d1_migration_overflow_values",
  "d1_migration_reconciliation_log",
]);

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable is unavailable: ${name}`);
  return value;
}

function safeNumber(value, label) {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${label} is outside JavaScript's safe integer range`);
  }
  return number;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function splitUtf8(text, maxBytes) {
  const chunks = [];
  let current = "";
  let bytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes && current) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += characterBytes;
  }
  if (current || !chunks.length) chunks.push(current);
  return chunks;
}

function utf8Size(value) {
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  if (Buffer.isBuffer(value)) return value.byteLength;
  return 0;
}

function normalizedValue(value, label) {
  if (value === null || typeof value === "string" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`Unsupported non-finite numeric value in ${label}`);
    }
    return value;
  }
  if (typeof value === "bigint") return safeNumber(value, label);
  if (Buffer.isBuffer(value)) {
    throw new Error(`D1 import does not support BLOB parameters in this migration: ${label}`);
  }
  throw new Error(`Unsupported SQLite value type in ${label}`);
}

function reconciliationValueJson(value) {
  let serialized;
  if (value === null) {
    serialized = { type: "null", value: null };
  } else if (typeof value === "bigint") {
    serialized = { type: "integer", value: String(value) };
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot audit a non-finite numeric value");
    serialized = { type: "number", value };
  } else if (typeof value === "string") {
    serialized = { type: "text", value };
  } else if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    serialized = { type: "blob", base64: Buffer.from(value).toString("base64") };
  } else {
    throw new Error(`Cannot audit unsupported SQLite value type: ${typeof value}`);
  }
  return JSON.stringify(serialized);
}

function createR2Client() {
  const accountId = requireEnvironment("CLOUDFLARE_R2_ACCOUNT_ID");
  const bucket = requireEnvironment("CLOUDFLARE_R2_BUCKET_NAME");
  const accessKeyId = requireEnvironment("CLOUDFLARE_R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnvironment("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
    }),
  };
}

function getSourceTables(db) {
  return db.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();
}

function getForeignKeyEdges(db, tables) {
  const edges = [];
  for (const table of tables) {
    for (const foreignKey of db.pragma(`foreign_key_list(${quoteIdentifier(table.name)})`)) {
      edges.push({
        child: table.name,
        parent: foreignKey.table,
        column: foreignKey.from,
        parentColumn: foreignKey.to,
        constraintId: foreignKey.id,
      });
    }
  }
  return edges;
}

function orderTables(tables, edges) {
  const names = tables.map(table => table.name);
  const indegree = new Map(names.map(name => [name, 0]));
  const children = new Map(names.map(name => [name, new Set()]));
  for (const edge of edges) {
    if (edge.child === edge.parent || !indegree.has(edge.parent)) continue;
    if (!children.get(edge.parent).has(edge.child)) {
      children.get(edge.parent).add(edge.child);
      indegree.set(edge.child, indegree.get(edge.child) + 1);
    }
  }
  const queue = names.filter(name => indegree.get(name) === 0);
  const ordered = [];
  while (queue.length) {
    const parent = queue.shift();
    ordered.push(parent);
    for (const child of children.get(parent)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  if (ordered.length !== names.length) {
    const cyclic = names.filter(name => !ordered.includes(name));
    throw new Error(`Foreign-key cycle prevents safe ordered import: ${cyclic.join(", ")}`);
  }
  return ordered;
}

function foreignKeyViolations(db, edges) {
  const edgeByKey = new Map(edges.map(edge => [
    `${edge.child}:${edge.constraintId}`,
    edge,
  ]));
  const grouped = new Map();
  for (const violation of db.pragma("foreign_key_check")) {
    const edge = edgeByKey.get(`${violation.table}:${violation.fkid}`);
    if (!edge) throw new Error(`Could not identify a foreign key violation in ${violation.table}`);
    const key = `${edge.child}:${edge.column}:${edge.parent}:${edge.parentColumn}`;
    const current = grouped.get(key) ?? { ...edge, count: 0 };
    current.count += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function createTableDdl(sourceSql, brokenEdges) {
  let ddl = sourceSql;
  for (const edge of brokenEdges) {
    const escapedColumn = edge.column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const columnLine = new RegExp(`^\\s*["'\`\\[]?${escapedColumn}["'\`\\]]?(?:\\s|$)`, "i");
    const lines = ddl.split(/\r?\n/);
    let removed = false;
    ddl = lines.map(line => {
      if (!columnLine.test(line)) return line;
      const updated = line.replace(
        /\s+REFERENCES\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w.]*)\s*\([^)]*\)(?:\s+ON\s+(?:DELETE|UPDATE)\s+\w+)*(?:\s+MATCH\s+\w+)?/i,
        "",
      );
      if (updated === line) return line;
      removed = true;
      return updated;
    }).join("\n");
    if (!removed) {
      throw new Error(`Could not isolate foreign key ${edge.child}.${edge.column} for preservation`);
    }
  }
  return ddl;
}

function validateSchemaInMemory(tables, orderedNames, edges, violations, indexes, triggers) {
  const brokenKeys = new Set(violations.map(edge => `${edge.child}:${edge.column}:${edge.parent}:${edge.parentColumn}`));
  const brokenEdges = edges.filter(edge => brokenKeys.has(
    `${edge.child}:${edge.column}:${edge.parent}:${edge.parentColumn}`,
  ));
  const tableByName = new Map(tables.map(table => [table.name, table]));
  const scratch = new Database(":memory:");
  try {
    for (const name of orderedNames) {
      scratch.exec(createTableDdl(
        tableByName.get(name).sql,
        brokenEdges.filter(edge => edge.child === name),
      ));
    }
    for (const index of indexes) scratch.exec(index.sql);
    for (const trigger of triggers) scratch.exec(trigger.sql);
    const counts = {
      tables: scratch.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count,
      indexes: scratch.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").get().count,
      triggers: scratch.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger'").get().count,
    };
    if (
      Number(counts.tables) !== tables.length
      || Number(counts.indexes) !== indexes.length
      || Number(counts.triggers) !== triggers.length
    ) {
      throw new Error("Offline D1 schema preflight did not reproduce all source tables, indexes, and triggers");
    }
    return brokenEdges;
  } finally {
    scratch.close();
  }
}

function sourceRowIdColumn(columns, tableName) {
  const names = new Set(columns.map(column => column.name.toLowerCase()));
  const pseudoColumn = ["rowid", "_rowid_", "oid"].find(name => !names.has(name));
  if (!pseudoColumn) {
    throw new Error(`No unshadowed SQLite rowid alias is available for ${tableName}`);
  }
  return pseudoColumn;
}

function discoverOversizedValues(db, tables, tableInfo, rowIdColumns) {
  const oversized = [];
  for (const table of tables) {
    const columns = tableInfo.get(table.name);
    const pseudoColumn = rowIdColumns.get(table.name);
    const select = [
      `${quoteIdentifier(pseudoColumn)} AS "__d1_source_rowid__"`,
      ...columns.map(column => quoteIdentifier(column.name)),
    ];
    for (const row of db.prepare(`SELECT ${select.join(", ")} FROM ${quoteIdentifier(table.name)}`).iterate()) {
      let safeRowBytes = 0;
      for (const column of columns) {
        const value = row[column.name];
        if (Buffer.isBuffer(value)) {
          throw new Error(`D1 migration cannot safely bind a BLOB in ${table.name}.${column.name}`);
        }
        if (typeof value === "bigint") {
          safeNumber(value, `${table.name}.${column.name}`);
          continue;
        }
        if (typeof value !== "string") continue;
        const bytes = Buffer.byteLength(value, "utf8");
        if (bytes <= D1_TABLE_ROW_LIMIT) {
          safeRowBytes += bytes;
          continue;
        }
        if (table.name !== "supply_requests" || column.name !== "invoice_image") {
          throw new Error(
            `D1 cannot store ${table.name}.${column.name} as one value (${bytes} bytes); no approved chunk mapping exists`,
          );
        }
        oversized.push({
          table: table.name,
          column: column.name,
          rowid: String(row.__d1_source_rowid__),
          bytes,
          sha256: sha256(Buffer.from(value, "utf8")),
        });
        safeRowBytes += 512;
      }
      if (safeRowBytes > MAX_SAFE_ROW_BYTES) {
        throw new Error(
          `D1 row size cannot be safely preserved in ${table.name} at rowid ${String(row.__d1_source_rowid__)}`,
        );
      }
    }
  }
  return oversized;
}

function keepsRowIdThroughPrimaryKey(columns) {
  const primaryKey = columns.filter(column => Number(column.pk) > 0);
  return primaryKey.length === 1 && String(primaryKey[0].type).toUpperCase() === "INTEGER";
}

function rowSelect(tableName, pseudoColumn, columns, cursor, limit) {
  const selectColumns = [
    `${quoteIdentifier(pseudoColumn)} AS "__d1_source_rowid__"`,
    ...columns.map(column => quoteIdentifier(column.name)),
  ];
  const where = cursor === null ? "" : ` WHERE ${quoteIdentifier(pseudoColumn)} > ?`;
  const params = cursor === null
    ? [limit]
    : [safeNumber(cursor, `${tableName} rowid cursor`), limit];
  return {
    sql: `SELECT ${selectColumns.join(", ")} FROM ${quoteIdentifier(tableName)}${where} ORDER BY ${quoteIdentifier(pseudoColumn)} LIMIT ?`,
    params,
  };
}

function overflowMarker(snapshotSha256, tableName, rowId, columnName, valueSha256, byteLength) {
  return `d1-overflow-v1:${JSON.stringify({
    snapshot: snapshotSha256,
    table: tableName,
    rowid: String(rowId),
    column: columnName,
    sha256: valueSha256,
    bytes: byteLength,
  })}`;
}

function buildInsertStatement(tableName, columnNames, rows) {
  const quotedColumns = columnNames.map(quoteIdentifier).join(", ");
  const placeholders = `(${columnNames.map(() => "?").join(", ")})`;
  const sql = `INSERT INTO ${quoteIdentifier(tableName)} (${quotedColumns}) VALUES ${rows.map(() => placeholders).join(", ")}`;
  const params = rows.flatMap(row => row);
  if (params.length > 100) {
    throw new Error(`D1 parameter limit exceeded while building an insert for ${tableName}`);
  }
  return { sql, params, expectedChanges: rows.length };
}

function addBoundedStatement(pending, statement) {
  const statementBytes = Buffer.byteLength(JSON.stringify({
    sql: statement.sql,
    params: statement.params,
  }));
  if (pending.statements.length && (
    pending.statements.length >= MAX_BATCH_STATEMENTS
    || pending.bindings + statement.params.length > MAX_BATCH_BINDINGS
    || pending.bytes + statementBytes > MAX_BATCH_BODY_BYTES
  )) {
    return { shouldFlush: true, statementBytes };
  }
  return { shouldFlush: false, statementBytes };
}

async function flushInsertBatch(pending, tableName) {
  if (!pending.statements.length) return 0;
  const result = await queryProductionD1Batch(pending.statements);
  let inserted = 0;
  for (let index = 0; index < result.length; index++) {
    const actual = Number(result[index].meta?.changes ?? 0);
    const expected = pending.expectedChanges[index];
    if (actual !== expected) {
      throw new Error(`D1 reported ${actual} inserted row(s), expected ${expected}, in ${tableName}`);
    }
    inserted += actual;
  }
  pending.statements = [];
  pending.expectedChanges = [];
  pending.bindings = 0;
  pending.bytes = 0;
  return inserted;
}

async function readD1Inventory(tableNames) {
  const statements = tableNames.map(name => ({
    sql: `SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(name)}`,
    params: [],
  }));
  const output = {};
  for (let start = 0; start < statements.length; start += 40) {
    const results = await queryProductionD1Batch(statements.slice(start, start + 40));
    for (let i = 0; i < results.length; i++) {
      output[tableNames[start + i]] = safeNumber(
        results[i].results[0]?.row_count ?? 0,
        `${tableNames[start + i]} D1 row count`,
      );
    }
  }
  return output;
}

async function validateEveryValue(
  db,
  tableNames,
  tableInfo,
  rowIdColumns,
  expectedCounts,
  markerSnapshotSha256,
  { collectChanges = false } = {},
) {
  let checkedRows = 0;
  const oversized = new Map();
  const changes = [];
  for (const tableName of tableNames) {
    const columns = tableInfo.get(tableName);
    const pseudoColumn = rowIdColumns.get(tableName);
    let cursor = null;
    let tableRows = 0;
    while (tableRows < expectedCounts[tableName]) {
      const pages = [];
      let pageCursor = cursor;
      let rowsQueued = 0;
      while (
        pages.length < VERIFY_QUERIES_PER_BATCH
        && tableRows + rowsQueued < expectedCounts[tableName]
      ) {
        const requestCursor = pageCursor;
        const pageLimit = Math.min(
          VERIFY_PAGE_SIZE,
          expectedCounts[tableName] - tableRows - rowsQueued,
        );
        const localStatement = rowSelect(tableName, pseudoColumn, columns, requestCursor, pageLimit);
        const sourcePage = db.prepare(localStatement.sql).all(...localStatement.params);
        if (!sourcePage.length) break;
        pageCursor = sourcePage[sourcePage.length - 1].__d1_source_rowid__;
        rowsQueued += sourcePage.length;
        pages.push({
          sourcePage,
          statement: rowSelect(tableName, pseudoColumn, columns, requestCursor, pageLimit),
          sourceCursor: pageCursor,
        });
      }
      if (!pages.length) {
        throw new Error(`Source has fewer rows than the D1 baseline in ${tableName}`);
      }

      const remotePages = await queryProductionD1Batch(pages.map(page => page.statement));
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const sourcePage = pages[pageIndex].sourcePage;
        const targetPage = remotePages[pageIndex].results;
        if (targetPage.length !== sourcePage.length) {
          throw new Error(`Exact verification row-count mismatch in ${tableName} after rowid ${String(cursor)}`);
        }
        for (let rowIndex = 0; rowIndex < sourcePage.length; rowIndex++) {
          const sourceRow = sourcePage[rowIndex];
          const targetRow = targetPage[rowIndex];
          const sourceRowId = sourceRow.__d1_source_rowid__;
          if (Number(targetRow.__d1_source_rowid__) !== safeNumber(sourceRowId, `${tableName} rowid`)) {
            throw new Error(`D1 rowid mismatch in ${tableName}`);
          }
          for (const column of columns) {
            const name = column.name;
            const original = sourceRow[name];
            let expected = normalizedValue(original, `${tableName}.${name}`);
            if (typeof original === "string" && Buffer.byteLength(original, "utf8") > D1_TABLE_ROW_LIMIT) {
              const bytes = Buffer.byteLength(original, "utf8");
              const valueHash = sha256(Buffer.from(original, "utf8"));
              const marker = overflowMarker(markerSnapshotSha256, tableName, sourceRowId, name, valueHash, bytes);
              expected = marker;
              oversized.set(`${tableName}:${String(sourceRowId)}:${name}`, {
                table: tableName,
                rowid: String(sourceRowId),
                column: name,
                bytes,
                sha256: valueHash,
                marker,
                snapshotSha256: markerSnapshotSha256,
              });
            }
            const actual = targetRow[name];
            if (!(Object.is(expected, actual) || expected === actual)) {
              if (!collectChanges) {
                throw new Error(`Exact verification mismatch in ${tableName}.${name} at source rowid ${String(sourceRowId)}`);
              }
              if (typeof original === "string" && Buffer.byteLength(original, "utf8") > D1_TABLE_ROW_LIMIT) {
                throw new Error(`Cannot safely reconcile an oversized value in ${tableName}.${name} at rowid ${String(sourceRowId)}; no row values were changed`);
              }
              const oldValueJson = reconciliationValueJson(actual);
              const newValueJson = reconciliationValueJson(original);
              const auditBytes = Buffer.byteLength(oldValueJson, "utf8") + Buffer.byteLength(newValueJson, "utf8");
              if (auditBytes > MAX_SAFE_ROW_BYTES) {
                throw new Error(`Cannot safely audit the changed value in ${tableName}.${name} at rowid ${String(sourceRowId)}; no row values were changed`);
              }
              changes.push({
                table: tableName,
                rowid: String(sourceRowId),
                column: name,
                oldValue: actual,
                newValue: normalizedValue(original, `${tableName}.${name}`),
                oldValueJson,
                newValueJson,
              });
            }
          }
        }
        tableRows += sourcePage.length;
        checkedRows += sourcePage.length;
      }
      cursor = pages.at(-1).sourceCursor;
    }
    if (tableRows !== expectedCounts[tableName]) {
      throw new Error(`Exact verification checked ${tableRows} row(s) in ${tableName}, expected ${expectedCounts[tableName]}`);
    }
    console.info(`Verified ${tableName}: ${tableRows} row(s)`);
  }
  return { checkedRows, oversized: [...oversized.values()], changes };
}

async function verifyOverflowValues(entries, snapshotSha256) {
  const verified = [];
  for (const entry of entries) {
    const overflowSnapshotSha256 = entry.snapshotSha256 ?? snapshotSha256;
    const chunkCount = Number((await queryProductionD1(
      `SELECT COUNT(*) AS chunk_count FROM d1_migration_overflow_values WHERE snapshot_sha256=? AND table_name=? AND record_key=? AND column_name=?`,
      [overflowSnapshotSha256, entry.table, entry.rowid, entry.column],
    )).results[0]?.chunk_count ?? 0);
    if (!chunkCount) throw new Error(`No D1 overflow chunks found for ${entry.table}.${entry.column}`);

    const chunks = [];
    for (let index = 0; index < chunkCount; index++) {
      const result = await queryProductionD1(
        `SELECT chunk_value FROM d1_migration_overflow_values WHERE snapshot_sha256=? AND table_name=? AND record_key=? AND column_name=? AND chunk_index=?`,
        [overflowSnapshotSha256, entry.table, entry.rowid, entry.column, index],
      );
      if (result.results.length !== 1 || typeof result.results[0].chunk_value !== "string") {
        throw new Error(`Missing overflow chunk ${index} for ${entry.table}.${entry.column}`);
      }
      chunks.push(result.results[0].chunk_value);
    }
    const reconstructed = chunks.join("");
    const reconstructedBytes = Buffer.from(reconstructed, "utf8");
    if (
      reconstructedBytes.byteLength !== entry.bytes
      || sha256(reconstructedBytes) !== entry.sha256
    ) {
      throw new Error(`D1 overflow reconstruction failed for ${entry.table}.${entry.column}`);
    }
    const metadata = await queryProductionD1(
      `SELECT COUNT(*) AS rows, MIN(chunk_count) AS min_chunks, MAX(chunk_count) AS max_chunks, MIN(original_byte_length) AS min_bytes, MAX(original_byte_length) AS max_bytes, MIN(original_sha256) AS min_sha, MAX(original_sha256) AS max_sha FROM d1_migration_overflow_values WHERE snapshot_sha256=? AND table_name=? AND record_key=? AND column_name=?`,
      [overflowSnapshotSha256, entry.table, entry.rowid, entry.column],
    );
    const summary = metadata.results[0];
    if (
      Number(summary?.rows) !== chunkCount
      || Number(summary?.min_chunks) !== chunkCount
      || Number(summary?.max_chunks) !== chunkCount
      || Number(summary?.min_bytes) !== entry.bytes
      || Number(summary?.max_bytes) !== entry.bytes
      || summary?.min_sha !== entry.sha256
      || summary?.max_sha !== entry.sha256
    ) {
      throw new Error(`D1 overflow metadata mismatch for ${entry.table}.${entry.column}`);
    }
    verified.push({
      table: entry.table,
      rowid: entry.rowid,
      column: entry.column,
      bytes: entry.bytes,
      sha256: entry.sha256,
      chunks: chunkCount,
      reconstructionVerified: true,
    });
  }
  return verified;
}

async function assertEmptyTarget() {
  const result = await queryProductionD1(
    `SELECT name, type FROM sqlite_master WHERE type IN ('table','view','trigger','index') AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV' ORDER BY type, name`,
  );
  const existing = result.results.filter(item => String(item.name) !== "_cf_KV");
  if (existing.length) {
    throw new Error(`Refusing to overwrite non-empty production D1; found ${existing.length} existing schema object(s)`);
  }
}

async function importTable(db, tableName, tableInfo, rowIdColumns, keepRowId, snapshotSha256, afterRowId = null) {
  const columns = tableInfo.get(tableName);
  const pseudoColumn = rowIdColumns.get(tableName);
  const insertColumns = [
    ...(keepRowId ? [pseudoColumn] : []),
    ...columns.map(column => column.name),
  ];
  const sourceColumns = [
    `${quoteIdentifier(pseudoColumn)} AS "__d1_source_rowid__"`,
    ...(keepRowId ? [`${quoteIdentifier(pseudoColumn)} AS "__d1_insert_rowid__"`] : []),
    ...columns.map(column => quoteIdentifier(column.name)),
  ];
  const pending = { statements: [], expectedChanges: [], bindings: 0, bytes: 0 };
  const maxRowsPerStatement = Math.max(1, Math.floor(100 / insertColumns.length));
  let pendingRows = [];
  let inserted = 0;

  const sourceSelect = db.prepare(`
    SELECT ${sourceColumns.join(", ")}
    FROM ${quoteIdentifier(tableName)}
    ${afterRowId == null ? "" : `WHERE ${quoteIdentifier(pseudoColumn)} > ?`}
    ORDER BY ${quoteIdentifier(pseudoColumn)}
  `);

  async function queueRows(rows) {
    if (!rows.length) return;
    const statement = buildInsertStatement(tableName, insertColumns, rows);
    const sizing = addBoundedStatement(pending, statement);
    if (sizing.shouldFlush) {
      inserted += await flushInsertBatch(pending, tableName);
    }
    pending.statements.push({ sql: statement.sql, params: statement.params });
    pending.expectedChanges.push(statement.expectedChanges);
    pending.bindings += statement.params.length;
    pending.bytes += sizing.statementBytes;
    if (
      pending.statements.length >= MAX_BATCH_STATEMENTS
      || pending.bindings >= MAX_BATCH_BINDINGS
      || pending.bytes >= MAX_BATCH_BODY_BYTES
    ) {
      inserted += await flushInsertBatch(pending, tableName);
    }
  }

  const sourceIterator = afterRowId == null
    ? sourceSelect.iterate()
    : sourceSelect.iterate(afterRowId);
  for (const sourceRow of sourceIterator) {
    const sourceRowId = sourceRow.__d1_source_rowid__;
    const values = insertColumns.map(name =>
      name === pseudoColumn && keepRowId
        ? sourceRow.__d1_insert_rowid__
        : sourceRow[name],
    );
    let textAndBlobBytes = 0;
    const normalized = [];
    for (let index = 0; index < values.length; index++) {
      const value = values[index];
      const sourceColumn = insertColumns[index];
      const existingDefinition = tableInfo.get(tableName).find(column => column.name === sourceColumn);
      const label = `${tableName}.${sourceColumn}`;
      if (typeof value === "string") {
        const byteLength = Buffer.byteLength(value, "utf8");
        textAndBlobBytes += byteLength;
        if (byteLength > D1_TABLE_ROW_LIMIT) {
          if (tableName !== "supply_requests" || sourceColumn !== "invoice_image") {
            throw new Error(`Unexpected oversized D1 value in ${label}; refusing to truncate or alter it`);
          }
          const chunkTexts = splitUtf8(value, OVERFLOW_CHUNK_BYTES);
          const valueBytes = Buffer.from(value, "utf8");
          const valueHash = sha256(valueBytes);
          const recordKey = String(sourceRow.__d1_source_rowid__);
          const metadata = {
            snapshot_sha256: snapshotSha256,
            table_name: tableName,
            record_key: recordKey,
            column_name: sourceColumn,
            chunk_count: chunkTexts.length,
            original_byte_length: valueBytes.byteLength,
            original_sha256: valueHash,
          };
          const chunks = chunkTexts.map((chunk, chunkIndex) => [
            metadata.snapshot_sha256,
            metadata.table_name,
            metadata.record_key,
            metadata.column_name,
            chunkIndex,
            metadata.chunk_count,
            metadata.original_byte_length,
            metadata.original_sha256,
            chunk,
          ]);
          for (let start = 0; start < chunks.length; start += 10) {
            const statement = buildInsertStatement(
              "d1_migration_overflow_values",
              ["snapshot_sha256", "table_name", "record_key", "column_name", "chunk_index", "chunk_count", "original_byte_length", "original_sha256", "chunk_value"],
              chunks.slice(start, start + 10),
            );
            const results = await queryProductionD1Batch([{ sql: statement.sql, params: statement.params }]);
            if (Number(results[0].meta?.changes ?? 0) !== statement.expectedChanges) {
              throw new Error(`D1 did not store every overflow chunk for ${label}`);
            }
          }
          const marker = overflowMarker(snapshotSha256, tableName, sourceRowId, sourceColumn, valueHash, valueBytes.byteLength);
          textAndBlobBytes -= byteLength;
          textAndBlobBytes += Buffer.byteLength(marker, "utf8");
          normalized.push(marker);
          continue;
        }
      } else if (Buffer.isBuffer(value)) {
        textAndBlobBytes += value.byteLength;
      }
      if (!existingDefinition && sourceColumn !== pseudoColumn) {
        throw new Error(`Unexpected insert column ${tableName}.${sourceColumn}`);
      }
      normalized.push(normalizedValue(value, label));
    }

    if (textAndBlobBytes > MAX_SAFE_ROW_BYTES) {
      throw new Error(`D1 row would exceed the safe size threshold in ${tableName} at rowid ${String(sourceRowId)}`);
    }
    pendingRows.push(normalized);
    if (pendingRows.length >= maxRowsPerStatement) {
      await queueRows(pendingRows);
      pendingRows = [];
    }
  }
  if (pendingRows.length) await queueRows(pendingRows);
  inserted += await flushInsertBatch(pending, tableName);
  return inserted;
}

async function dropD1Triggers(triggers) {
  const statements = triggers.map(trigger => ({
    sql: `DROP TRIGGER IF EXISTS ${quoteIdentifier(trigger.name)}`,
    params: [],
  }));
  for (let start = 0; start < statements.length; start += 30) {
    await queryProductionD1Batch(statements.slice(start, start + 30));
  }
}

async function applyReconciliationChanges(changes, sourceSha256, rowIdColumns) {
  await queryProductionD1(
    `CREATE TABLE IF NOT EXISTS d1_migration_reconciliation_log (
      batch_sha256 TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_key TEXT NOT NULL,
      column_name TEXT NOT NULL,
      old_value_json TEXT NOT NULL,
      new_value_json TEXT NOT NULL,
      reconciled_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (batch_sha256, table_name, record_key, column_name)
    )`,
  );

  for (let start = 0; start < changes.length; start += 20) {
    const group = changes.slice(start, start + 20);
    const statements = [];
    for (const change of group) {
      const table = quoteIdentifier(change.table);
      const column = quoteIdentifier(change.column);
      const rowId = quoteIdentifier(rowIdColumns.get(change.table));
      statements.push({
        sql: `INSERT OR IGNORE INTO d1_migration_reconciliation_log
          (batch_sha256, table_name, record_key, column_name, old_value_json, new_value_json)
          VALUES (?, ?, ?, ?, ?, ?)`,
        params: [
          sourceSha256,
          change.table,
          change.rowid,
          change.column,
          change.oldValueJson,
          change.newValueJson,
        ],
      });
      statements.push({
        sql: `UPDATE ${table} SET ${column}=? WHERE ${rowId}=? AND ${column} IS ?`,
        params: [
          change.newValue,
          safeNumber(BigInt(change.rowid), `${change.table} reconciliation rowid`),
          normalizedValue(change.oldValue, `${change.table}.${change.column} prior D1 value`),
        ],
      });
    }
    const results = await queryProductionD1Batch(statements);
    for (let index = 0; index < results.length; index += 2) {
      const auditChanges = Number(results[index].meta?.changes ?? 0);
      const valueChanges = Number(results[index + 1].meta?.changes ?? 0);
      if (auditChanges > 1 || valueChanges > 1) {
        throw new Error("D1 reconciliation affected an unexpected number of rows");
      }
    }
  }

  const audit = (await queryProductionD1(
    `SELECT table_name, record_key, column_name, old_value_json, new_value_json
     FROM d1_migration_reconciliation_log
     WHERE batch_sha256=? ORDER BY table_name, record_key, column_name`,
    [sourceSha256],
  )).results;
  const expected = new Map(changes.map(change => [
    `${change.table}\u0000${change.rowid}\u0000${change.column}`,
    change,
  ]));
  for (const entry of audit) {
    const key = `${entry.table_name}\u0000${entry.record_key}\u0000${entry.column_name}`;
    const change = expected.get(key);
    if (
      change
      && (entry.old_value_json !== change.oldValueJson || entry.new_value_json !== change.newValueJson)
    ) {
      throw new Error(`D1 reconciliation audit mismatch in ${change.table}.${change.column} at rowid ${change.rowid}`);
    }
  }
  for (const key of expected.keys()) {
    if (!audit.some(entry => `${entry.table_name}\u0000${entry.record_key}\u0000${entry.column_name}` === key)) {
      throw new Error("D1 did not persist a reconciliation audit record for every changed value");
    }
  }
  return audit.map(entry => ({
    table: String(entry.table_name),
    rowid: String(entry.record_key),
    column: String(entry.column_name),
    oldValueSha256: sha256(String(entry.old_value_json)),
    newValueSha256: sha256(String(entry.new_value_json)),
  }));
}

async function ensureFinalSourceManifestColumns() {
  const existing = new Set((await queryProductionD1(
    `PRAGMA table_info(d1_migration_manifest)`,
  )).results.map(row => String(row.name)));
  const columns = [
    ["final_source_etag", "TEXT"],
    ["final_source_last_modified", "TEXT"],
    ["final_source_size_bytes", "INTEGER"],
    ["final_source_sha256", "TEXT"],
    ["final_source_table_count", "INTEGER"],
    ["final_source_row_count", "INTEGER"],
  ];
  for (const [name, type] of columns) {
    if (!existing.has(name)) {
      await queryProductionD1(
        `ALTER TABLE d1_migration_manifest ADD COLUMN ${quoteIdentifier(name)} ${type}`,
      );
    }
  }
}

async function readD1MaxRowId(tableName, pseudoColumn) {
  const result = await queryProductionD1(
    `SELECT MAX(${quoteIdentifier(pseudoColumn)}) AS max_rowid FROM ${quoteIdentifier(tableName)}`,
  );
  const value = result.results[0]?.max_rowid;
  return value == null ? null : safeNumber(value, `${tableName} max rowid`);
}

async function verifySequences(db) {
  const sourceRows = db.prepare(`SELECT name, seq FROM sqlite_sequence ORDER BY name`).all();
  const targetRows = (await queryProductionD1(
    `SELECT name, seq FROM sqlite_sequence ORDER BY name`,
  )).results;
  const source = new Map(sourceRows.map(row => [String(row.name), safeNumber(row.seq, `${row.name} source sequence`)]));
  const target = new Map(targetRows.map(row => [String(row.name), safeNumber(row.seq, `${row.name} D1 sequence`)]));
  const names = new Set([...source.keys(), ...target.keys()]);
  const mismatches = [...names]
    .filter(name => source.get(name) !== target.get(name))
    .map(name => ({ table: name, source: source.get(name) ?? null, d1: target.get(name) ?? null }));
  if (mismatches.length) {
    throw new Error(`SQLite sequence mismatch: ${JSON.stringify(mismatches)}`);
  }
  return source.size;
}

async function createD1Schema(tables, orderedNames, edges, violations) {
  const brokenKeys = new Set(violations.map(edge => `${edge.child}:${edge.column}:${edge.parent}:${edge.parentColumn}`));
  const brokenEdges = edges.filter(edge => brokenKeys.has(
    `${edge.child}:${edge.column}:${edge.parent}:${edge.parentColumn}`,
  ));
  const tableByName = new Map(tables.map(table => [table.name, table]));
  const statements = [
    {
      sql: `CREATE TABLE d1_migration_manifest (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        source_object_key TEXT NOT NULL,
        source_etag TEXT NOT NULL,
        source_last_modified TEXT NOT NULL,
        source_size_bytes INTEGER NOT NULL,
        source_sha256 TEXT NOT NULL,
        source_table_count INTEGER NOT NULL,
        source_row_count INTEGER NOT NULL,
        source_foreign_key_violations_json TEXT NOT NULL,
        schema_adjustments_json TEXT NOT NULL,
        migrated_table_counts_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        final_source_etag TEXT,
        final_source_last_modified TEXT,
        final_source_size_bytes INTEGER,
        final_source_sha256 TEXT,
        final_source_table_count INTEGER,
        final_source_row_count INTEGER
      )`,
    },
    {
      sql: `CREATE TABLE d1_migration_overflow_values (
        snapshot_sha256 TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_key TEXT NOT NULL,
        column_name TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        original_byte_length INTEGER NOT NULL,
        original_sha256 TEXT NOT NULL,
        chunk_value TEXT NOT NULL,
        PRIMARY KEY (snapshot_sha256, table_name, record_key, column_name, chunk_index)
      )`,
    },
  ];
  for (const name of orderedNames) {
    const sourceTable = tableByName.get(name);
    statements.push({ sql: createTableDdl(sourceTable.sql, brokenEdges.filter(edge => edge.child === name)) });
  }
  for (let start = 0; start < statements.length; start += 30) {
    const batch = statements.slice(start, start + 30).map(item => ({ sql: item.sql, params: [] }));
    try {
      await queryProductionD1Batch(batch);
    } catch (error) {
      throw new Error(`Failed while creating D1 schema objects: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return brokenEdges;
}

async function createD1IndexesAndTriggers(indexes, triggers) {
  for (const [label, items] of [["indexes", indexes], ["triggers", triggers]]) {
    for (let start = 0; start < items.length; start += 30) {
      const batch = items.slice(start, start + 30).map(item => ({ sql: item.sql, params: [] }));
      if (!batch.length) continue;
      try {
        await queryProductionD1Batch(batch);
      } catch (error) {
        throw new Error(`Failed while creating D1 ${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
async function restoreSequences(db) {
  const sequences = db.prepare("SELECT name, seq FROM sqlite_sequence ORDER BY name").all();
  const statements = [];
  for (const sequence of sequences) {
    statements.push({
      sql: `UPDATE sqlite_sequence SET seq=MAX(seq, ?) WHERE name=?`,
      params: [safeNumber(sequence.seq, `sqlite_sequence.${sequence.name}`), sequence.name],
    });
    statements.push({
      sql: `INSERT INTO sqlite_sequence (name, seq) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name=?)`,
      params: [
        sequence.name,
        safeNumber(sequence.seq, `sqlite_sequence.${sequence.name}`),
        sequence.name,
      ],
    });
  }
  for (let start = 0; start < statements.length; start += 40) {
    await queryProductionD1Batch(statements.slice(start, start + 40));
  }
  return sequences.length;
}

async function run() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");
  const resume = process.argv.includes("--resume");
  if ([apply, dryRun, resume].filter(Boolean).length !== 1) {
    throw new Error("Choose exactly one mode: --dry-run, --apply, or --resume. The default is not to write to D1.");
  }

  const temporaryPath = path.join(os.tmpdir(), `erp-production-${randomUUID()}.db`);
  let db;
  let manifestCreated = false;
  let manifestProgress = {};
  let sourceTriggers = [];
  let triggersDropped = false;
  let baseSnapshot = null;
  let reconciliationEntries = [];
  let sourceDownloaded = false;
  let preserveSnapshotOnFailure = false;
  let migrationSucceeded = false;
  let sourceReport;
  let sourceTables = [];
  let snapshotSha256;

  try {
    const { client, bucket } = createR2Client();
    const head = await client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: SOURCE_KEY,
    }));
    if (!head.ContentLength || !head.ETag || !head.LastModified) {
      throw new Error(`Production R2 object ${SOURCE_KEY} is missing required metadata`);
    }
    const object = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: SOURCE_KEY,
    }));
    if (!object.Body) throw new Error(`Production R2 object ${SOURCE_KEY} has no content`);
    if (
      (object.ETag && object.ETag !== head.ETag)
      || (object.ContentLength !== undefined && Number(object.ContentLength) !== Number(head.ContentLength))
    ) {
      throw new Error("Production R2 backup changed between metadata check and download; retry using a stable snapshot");
    }
    await pipeline(object.Body, createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }));
    sourceDownloaded = true;
    const sourceBytes = await readFile(temporaryPath);
    if (sourceBytes.byteLength !== Number(head.ContentLength)) {
      throw new Error("Downloaded R2 production snapshot size does not match its object metadata");
    }
    snapshotSha256 = sha256(sourceBytes);

    db = new Database(temporaryPath, { readonly: true, fileMustExist: true });
    db.defaultSafeIntegers(true);
    const integrity = db.pragma("quick_check");
    if (!integrity.length || integrity.some(row => row.quick_check !== "ok")) {
      throw new Error("The downloaded production SQLite snapshot failed quick_check");
    }
    sourceTables = getSourceTables(db);
    const edges = getForeignKeyEdges(db, sourceTables);
    const violations = foreignKeyViolations(db, edges);
    const tableInfo = new Map(sourceTables.map(table => [
      table.name,
      db.pragma(`table_info(${quoteIdentifier(table.name)})`),
    ]));
    const rowIdColumns = new Map(sourceTables.map(table => [
      table.name,
      sourceRowIdColumn(tableInfo.get(table.name), table.name),
    ]));
    for (const [name, info] of tableInfo) {
      if (info.length > 100) throw new Error(`D1 supports at most 100 columns; ${name} has ${info.length}`);
      if (/WITHOUT\s+ROWID/i.test(sourceTables.find(table => table.name === name)?.sql ?? "")) {
        throw new Error(`This migration currently requires rowid tables; ${name} is WITHOUT ROWID`);
      }
      if (info.some(column => column.name === "__d1_source_rowid__" || column.name === "__d1_insert_rowid__")) {
        throw new Error(`A source column conflicts with migration read-back aliases in ${name}`);
      }
    }
    const orderedNames = orderTables(sourceTables, edges);
    const tableCounts = {};
    for (const table of sourceTables) {
      tableCounts[table.name] = safeNumber(
        db.prepare(`SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(table.name)}`).get().row_count,
        `${table.name} source row count`,
      );
    }
    const totalRows = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
    const oversizedValues = discoverOversizedValues(db, sourceTables, tableInfo, rowIdColumns);
    const indexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name").all()
      .map(row => ({ name: row.name, sql: row.sql }));
    const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all()
      .map(row => ({ name: row.name, sql: row.sql }));
    sourceTriggers = triggers;
    const brokenEdges = validateSchemaInMemory(
      sourceTables,
      orderedNames,
      edges,
      violations,
      indexes,
      triggers,
    );
    const sourceFkViolations = violations.map(({ child, column, parent, parentColumn, count }) => ({
      table: child,
      column,
      parentTable: parent,
      parentColumn,
      rows: count,
    }));
    const schemaAdjustments = {
      omittedForeignKeys: sourceFkViolations.map(({ table, column, parentTable, parentColumn, rows }) => ({
        table,
        column,
        references: `${parentTable}.${parentColumn}`,
        orphanRowsPreserved: rows,
        reason: "D1 enforces foreign keys per request; the current source snapshot already contains these orphan references.",
      })),
      oversizedValues: oversizedValues.map(value => ({
        table: value.table,
        column: value.column,
        sourceRowId: value.rowid,
        bytes: value.bytes,
        sha256: value.sha256,
        handling: "The original text is stored in UTF-8 chunks in d1_migration_overflow_values; the source column contains a reversible d1-overflow-v1 marker.",
        d1MaximumCellOrRowBytes: D1_TABLE_ROW_LIMIT,
      })),
    };
    sourceReport = {
      source: {
        objectKey: SOURCE_KEY,
        etag: head.ETag,
        lastModified: head.LastModified.toISOString(),
        sizeBytes: sourceBytes.byteLength,
        sha256: snapshotSha256,
      },
      integrity: "ok",
      tableCount: sourceTables.length,
      totalRows,
      tableCounts,
      foreignKeyViolationCount: violations.reduce((sum, violation) => sum + violation.count, 0),
      foreignKeyViolations: sourceFkViolations,
      explicitIndexCount: indexes.length,
      triggerCount: triggers.length,
      schemaAdjustments,
    };

    const existingD1Tables = (await queryProductionD1(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )).results.map(result => String(result.name));
    if (!existingD1Tables.includes("_cf_KV")) {
      throw new Error("Expected Cloudflare's internal _cf_KV table; refusing an unexpected D1 target");
    }
    if (!resume) await assertEmptyTarget();

    if (dryRun) {
      console.info(JSON.stringify({
        mode: "dry-run",
        source: sourceReport.source,
        sourceIntegrity: sourceReport.integrity,
        tableCount: sourceReport.tableCount,
        totalRows: sourceReport.totalRows,
        foreignKeyViolationCount: sourceReport.foreignKeyViolationCount,
        foreignKeyViolations: sourceReport.foreignKeyViolations,
        oversizedValues: sourceReport.schemaAdjustments.oversizedValues,
        targetApplicationTables: existingD1Tables.filter(name => name !== "_cf_KV"),
        proposedBrokenForeignKeys: sourceReport.schemaAdjustments.omittedForeignKeys,
      }, null, 2));
      return;
    }

    const adjustmentsJson = JSON.stringify(schemaAdjustments);
    let markerSnapshotSha256 = snapshotSha256;
    if (resume) {
      await ensureFinalSourceManifestColumns();
      const manifestResult = await queryProductionD1(
        `SELECT source_object_key, source_etag, source_last_modified, source_size_bytes,
                source_sha256, source_table_count, source_row_count, migrated_table_counts_json
         FROM d1_migration_manifest WHERE id=1`,
      );
      const manifest = manifestResult.results[0];
      if (!manifest) throw new Error("Cannot resume: the D1 migration manifest is missing");
      if (String(manifest.source_object_key) !== SOURCE_KEY) {
        throw new Error("Cannot resume: the existing D1 manifest points at a different source object");
      }
      if (Number(manifest.source_table_count) !== sourceTables.length) {
        throw new Error("Cannot resume: the source table count differs from the D1 migration baseline");
      }
      markerSnapshotSha256 = String(manifest.source_sha256);
      baseSnapshot = {
        objectKey: String(manifest.source_object_key),
        etag: String(manifest.source_etag),
        lastModified: String(manifest.source_last_modified),
        sizeBytes: safeNumber(manifest.source_size_bytes, "manifest source size"),
        sha256: markerSnapshotSha256,
        rowCount: safeNumber(manifest.source_row_count, "manifest source rows"),
      };
      try {
        manifestProgress = JSON.parse(String(manifest.migrated_table_counts_json ?? "{}"));
      } catch {
        throw new Error("Cannot resume: the D1 migration manifest contains invalid table progress");
      }
      if (
        Object.keys(manifestProgress).length !== sourceTables.length
        || orderedNames.some(name => !Number.isSafeInteger(manifestProgress[name]))
      ) {
        throw new Error("Cannot resume: the D1 migration manifest does not show every source table imported");
      }

      const actualObjects = (await queryProductionD1(
        `SELECT name, type FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type, name`,
      )).results;
      const currentTableNames = actualObjects
        .filter(row => row.type === "table" && !String(row.name).startsWith("sqlite_") && !INTERNAL_D1_TABLES.has(String(row.name)))
        .map(row => String(row.name))
        .sort();
      const expectedTableNames = [...orderedNames].sort();
      if (JSON.stringify(currentTableNames) !== JSON.stringify(expectedTableNames)) {
        throw new Error("Cannot resume: D1 application table names differ from the production snapshot");
      }
      const currentIndexNames = actualObjects
        .filter(row => row.type === "index" && !String(row.name).startsWith("sqlite_autoindex"))
        .map(row => String(row.name))
        .sort();
      const expectedIndexNames = indexes.map(item => String(item.name)).sort();
      const currentTriggerNames = actualObjects
        .filter(row => row.type === "trigger")
        .map(row => String(row.name))
        .sort();
      const expectedTriggerNames = triggers.map(item => String(item.name)).sort();
      if (
        JSON.stringify(currentIndexNames) !== JSON.stringify(expectedIndexNames)
        || JSON.stringify(currentTriggerNames) !== JSON.stringify(expectedTriggerNames)
      ) {
        throw new Error("Cannot resume: D1 indexes or triggers differ from the production snapshot");
      }

      const baselineCounts = await readD1Inventory(orderedNames);
      const baselineMismatches = orderedNames
        .filter(name => baselineCounts[name] !== manifestProgress[name])
        .map(name => ({ table: name, manifest: manifestProgress[name], d1: baselineCounts[name] }));
      if (baselineMismatches.length) {
        throw new Error(`Cannot resume: D1 row counts differ from the imported manifest: ${JSON.stringify(baselineMismatches)}`);
      }
      const sourceCountRegressions = orderedNames
        .filter(name => tableCounts[name] < baselineCounts[name])
        .map(name => ({ table: name, source: tableCounts[name], d1: baselineCounts[name] }));
      if (sourceCountRegressions.length) {
        throw new Error(`Cannot resume safely because source tables lost rows after the baseline: ${JSON.stringify(sourceCountRegressions)}`);
      }

      console.info(`Verifying all ${Object.values(baselineCounts).reduce((sum, count) => sum + count, 0)} existing D1 rows against the latest R2 snapshot before reconciling appended rows`);
      const baselineVerification = await validateEveryValue(
        db,
        orderedNames,
        tableInfo,
        rowIdColumns,
        baselineCounts,
        markerSnapshotSha256,
        { collectChanges: true },
      );
      await verifyOverflowValues(baselineVerification.oversized, markerSnapshotSha256);

      const additions = [];
      for (const tableName of orderedNames) {
        const gap = tableCounts[tableName] - baselineCounts[tableName];
        if (!gap) continue;
        const pseudoColumn = rowIdColumns.get(tableName);
        const maxRowId = await readD1MaxRowId(tableName, pseudoColumn);
        const sourceAddedCount = maxRowId == null
          ? tableCounts[tableName]
          : safeNumber(
            db.prepare(`SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier(pseudoColumn)} > ?`).get(maxRowId).row_count,
            `${tableName} appended source rows`,
          );
        if (sourceAddedCount !== gap) {
          throw new Error(`Cannot reconcile ${tableName}: source changes are not append-only after the last verified D1 row`);
        }
        additions.push({ tableName, gap, maxRowId });
      }

      manifestCreated = true;
      preserveSnapshotOnFailure = true;
      await queryProductionD1(
        `UPDATE d1_migration_manifest SET status='running', finished_at=NULL WHERE id=1`,
      );
      if (additions.length || baselineVerification.changes.length) {
        await dropD1Triggers(triggers);
        triggersDropped = true;
      }
      reconciliationEntries = await applyReconciliationChanges(
        baselineVerification.changes,
        snapshotSha256,
        rowIdColumns,
      );
      for (const { tableName, gap, maxRowId } of additions) {
        const inserted = await importTable(
          db,
          tableName,
          tableInfo,
          rowIdColumns,
          !keepsRowIdThroughPrimaryKey(tableInfo.get(tableName)),
          markerSnapshotSha256,
          maxRowId,
        );
        if (inserted !== gap) {
          throw new Error(`D1 reconciliation count mismatch in ${tableName}: inserted ${inserted}, expected ${gap}`);
        }
        manifestProgress[tableName] = tableCounts[tableName];
        await queryProductionD1(
          `UPDATE d1_migration_manifest SET migrated_table_counts_json=? WHERE id=1`,
          [JSON.stringify(manifestProgress)],
        );
        console.info(`Reconciled ${tableName}: ${inserted} appended row(s)`);
      }
      if (triggersDropped) {
        await createD1IndexesAndTriggers([], triggers);
        triggersDropped = false;
      }
    } else {
      await createD1Schema(sourceTables, orderedNames, edges, violations);
      await queryProductionD1(
        `INSERT INTO d1_migration_manifest
          (id, source_object_key, source_etag, source_last_modified, source_size_bytes,
           source_sha256, source_table_count, source_row_count,
           source_foreign_key_violations_json, schema_adjustments_json, status)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`,
        [
          SOURCE_KEY,
          head.ETag,
          head.LastModified.toISOString(),
          sourceBytes.byteLength,
          snapshotSha256,
          sourceTables.length,
          totalRows,
          JSON.stringify(sourceFkViolations),
          adjustmentsJson,
        ],
      ).catch(async error => {
        throw new Error(`Could not start D1 migration manifest: ${error instanceof Error ? error.message : String(error)}`);
      });
      manifestCreated = true;
      preserveSnapshotOnFailure = true;

      for (const tableName of orderedNames) {
        const count = await importTable(
          db,
          tableName,
          tableInfo,
          rowIdColumns,
          !keepsRowIdThroughPrimaryKey(tableInfo.get(tableName)),
          snapshotSha256,
        );
        if (count !== tableCounts[tableName]) {
          throw new Error(`D1 import count mismatch in ${tableName}: inserted ${count}, expected ${tableCounts[tableName]}`);
        }
        manifestProgress[tableName] = count;
        await queryProductionD1(
          `UPDATE d1_migration_manifest SET migrated_table_counts_json=? WHERE id=1`,
          [JSON.stringify(manifestProgress)],
        );
        console.info(`Imported ${tableName}: ${count} row(s)`);
      }
    }

    const sequenceCount = await restoreSequences(db);
    const verifiedSequenceCount = await verifySequences(db);
    if (sequenceCount !== verifiedSequenceCount) {
      throw new Error(`SQLite sequence verification count mismatch: ${verifiedSequenceCount}/${sequenceCount}`);
    }
    if (!resume) await createD1IndexesAndTriggers(indexes, triggers);
    const d1Counts = await readD1Inventory(orderedNames);
    const countMismatches = orderedNames
      .filter(name => d1Counts[name] !== tableCounts[name])
      .map(name => ({ table: name, source: tableCounts[name], d1: d1Counts[name] }));
    if (countMismatches.length) {
      throw new Error(`D1 table count mismatches: ${JSON.stringify(countMismatches)}`);
    }

    const actualSchema = (await queryProductionD1(
      `SELECT name, type FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type, name`,
    )).results;
    const d1SourceTableNames = actualSchema
      .filter(row => row.type === "table" && !String(row.name).startsWith("sqlite_") && !INTERNAL_D1_TABLES.has(String(row.name)))
      .map(row => String(row.name))
      .sort();
    const d1SourceTableCount = d1SourceTableNames.length;
    if (JSON.stringify(d1SourceTableNames) !== JSON.stringify([...orderedNames].sort())) {
      throw new Error("D1 application table names do not match the production snapshot");
    }
    const d1IndexCount = actualSchema.filter(row => row.type === "index" && String(row.name).startsWith("sqlite_autoindex") === false).length;
    const d1TriggerCount = actualSchema.filter(row => row.type === "trigger").length;
    if (d1SourceTableCount !== sourceTables.length || d1IndexCount !== indexes.length || d1TriggerCount !== triggers.length) {
      throw new Error(`D1 schema object count mismatch: tables ${d1SourceTableCount}/${sourceTables.length}, indexes ${d1IndexCount}/${indexes.length}, triggers ${d1TriggerCount}/${triggers.length}`);
    }

    const d1QuickCheck = await queryProductionD1("PRAGMA quick_check");
    if (d1QuickCheck.results.some(row => row.quick_check !== "ok")) {
      throw new Error("D1 PRAGMA quick_check reported an integrity issue");
    }
    const orphanCheckResults = [];
    for (const violation of violations) {
      const child = quoteIdentifier(violation.child);
      const parent = quoteIdentifier(violation.parent);
      const column = quoteIdentifier(violation.column);
      const parentColumn = quoteIdentifier(violation.parentColumn);
      const result = await queryProductionD1(
        `SELECT COUNT(*) AS orphan_count FROM ${child} c LEFT JOIN ${parent} p ON c.${column}=p.${parentColumn} WHERE c.${column} IS NOT NULL AND p.${parentColumn} IS NULL`,
      );
      const actual = safeNumber(result.results[0]?.orphan_count ?? 0, `${violation.child} orphan count`);
      if (actual !== violation.count) {
        throw new Error(`Orphan row preservation mismatch for ${violation.child}.${violation.column}: ${actual}/${violation.count}`);
      }
      orphanCheckResults.push({
        table: violation.child,
        column: violation.column,
        parentTable: violation.parent,
        parentColumn: violation.parentColumn,
        sourceRows: violation.count,
        d1Rows: actual,
        preserved: true,
      });
    }

    console.info(`Starting exact read-back verification for ${totalRows} source row(s)`);
    const exactVerification = await validateEveryValue(
      db,
      orderedNames,
      tableInfo,
      rowIdColumns,
      tableCounts,
      markerSnapshotSha256,
    );
    const overflowVerification = await verifyOverflowValues(exactVerification.oversized, markerSnapshotSha256);

    const report = {
      status: "completed",
      migratedAt: new Date().toISOString(),
      source: sourceReport.source,
      migrationBaselineSource: baseSnapshot,
      sourceIntegrity: sourceReport.integrity,
      tableCount: sourceTables.length,
      totalSourceRows: totalRows,
      totalD1SourceRows: Object.values(d1Counts).reduce((sum, count) => sum + count, 0),
      tableCounts: orderedNames.map(name => ({
        table: name,
        source: tableCounts[name],
        d1: d1Counts[name],
        exactValueReadback: true,
      })),
      foreignKeyViolationCount: sourceReport.foreignKeyViolationCount,
      foreignKeyViolations: sourceFkViolations,
      orphanRowsPreserved: orphanCheckResults,
      reconciliation: {
        changedCells: reconciliationEntries.length,
        auditTable: "d1_migration_reconciliation_log",
        entries: reconciliationEntries,
      },
      schema: {
        copiedTables: d1SourceTableCount,
        explicitIndexes: d1IndexCount,
        triggers: d1TriggerCount,
        restoredSequences: verifiedSequenceCount,
        brokenForeignKeysOmittedForOrphanPreservation: sourceReport.schemaAdjustments.omittedForeignKeys,
      },
      oversizedValues: overflowVerification,
      exactRowsReadBack: exactVerification.checkedRows,
      d1IntegrityCheck: d1QuickCheck.results[0]?.quick_check ?? "unknown",
      developmentDatabaseChanged: false,
      publishedApplicationCutOverToD1: false,
      productionSQLiteBackupPreserved: true,
    };

    await queryProductionD1(
      `UPDATE d1_migration_manifest
       SET migrated_table_counts_json=?, status='completed', finished_at=datetime('now'),
           final_source_etag=?, final_source_last_modified=?, final_source_size_bytes=?,
           final_source_sha256=?, final_source_table_count=?, final_source_row_count=?
       WHERE id=1`,
      [
        JSON.stringify(d1Counts),
        sourceReport.source.etag,
        sourceReport.source.lastModified,
        sourceReport.source.sizeBytes,
        sourceReport.source.sha256,
        sourceTables.length,
        totalRows,
      ],
    );
    const outputPath = path.join(PROJECT_ROOT, ".agents", "outputs", "production-d1-migration-report.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    migrationSucceeded = true;
    console.info(JSON.stringify({
      status: report.status,
      source: report.source,
      tableCount: report.tableCount,
      totalSourceRows: report.totalSourceRows,
      exactRowsReadBack: report.exactRowsReadBack,
      foreignKeyViolationCount: report.foreignKeyViolationCount,
      oversizedValues: report.oversizedValues,
      reportPath: path.relative(PROJECT_ROOT, outputPath),
    }, null, 2));
  } catch (error) {
    if (triggersDropped) {
      try {
        await createD1IndexesAndTriggers([], sourceTriggers);
        triggersDropped = false;
      } catch {
        // Keep the original error; report the migration as failed for manual repair.
      }
    }
    if (manifestCreated) {
      try {
        await queryProductionD1(
          `UPDATE d1_migration_manifest
           SET migrated_table_counts_json=?, status='failed', finished_at=datetime('now')
           WHERE id=1`,
          [JSON.stringify(manifestProgress)],
        );
      } catch {
        // Keep the original migration error; the manifest remains available for inspection.
      }
    }
    throw error;
  } finally {
    db?.close();
    if (migrationSucceeded || !sourceDownloaded || !preserveSnapshotOnFailure) {
      await rm(temporaryPath, { force: true });
    } else {
      console.warn(`Preserved the production SQLite snapshot for exact diagnosis at ${temporaryPath}`);
    }
  }
}

run().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Production D1 migration failed: ${message}`);
  process.exitCode = 1;
});
