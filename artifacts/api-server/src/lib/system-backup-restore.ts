import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import * as yauzl from "yauzl";
import db, { DB_PATH, UPLOADS_PATH, checkpointWAL } from "./db.js";
import { isFilesystemStorageMode, makeStorage, uploadDbBackup } from "./db-sync.js";
import {
  HostingerObjectFile,
  listHostingerObjects,
  removeHostingerObject,
  writeHostingerObject,
  type HostingerObjectMetadata,
} from "./hostinger-filesystem-storage.js";

const RESTORE_AUDIT_TABLES = new Set([
  "system_backup_restore_runs",
  "system_backup_restore_items",
]);
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024 * 1024;

type ManifestFile = {
  archive_path: string;
  bytes: number;
  restore_path?: string;
};

type ManifestObject = ManifestFile & {
  storage_key: string;
  crc32c?: string;
  content_type?: string;
  cache_control?: string;
  content_disposition?: string;
  metadata?: Record<string, string>;
};

type BackupManifest = {
  format: string;
  created_at: string;
  database: { path: string; bytes: number; sha256: string };
  database_tables?: ManifestFile;
  local_uploads: ManifestFile[];
  objects: ManifestObject[];
};

type ExtractedBackup = {
  directory: string;
  databasePath: string;
  manifest: BackupManifest;
  objects: Array<ManifestObject & { filePath: string }>;
  uploads: Array<ManifestFile & { filePath: string; relativePath: string }>;
};

export type RestoreMode = "full" | "append";
export type RestoreCounts = {
  restoredRows: number;
  duplicateRows: number;
  conflictRows: number;
  restoredFiles: number;
  alreadyPresent: number;
  runId: number;
  status: "completed" | "partial";
  message: string;
};

type FileOutcome = {
  itemType: "object" | "local_upload";
  label: string;
  key: string;
  outcome: "restored" | "conflict" | "already_present";
  details?: string;
};

type TableColumn = {
  name: string;
  type: string;
  pk: number;
};

type RestoreItemInput = {
  itemType: "record" | "object" | "local_upload" | "system";
  tableName?: string;
  recordKey?: string;
  label: string;
  outcome: "restored" | "duplicated" | "conflict" | "already_present" | "skipped";
  details?: string;
};

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function safeArchivePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.includes("\0") || value.includes("\\")
      || value.startsWith("/") || /^[a-z]:/i.test(value)) {
    throw new Error("يوجد مسار غير آمن داخل ملف النسخة");
  }
  const withoutTrailingSlash = value.endsWith("/") ? value.slice(0, -1) : value;
  const parts = withoutTrailingSlash.split("/");
  if (!withoutTrailingSlash || parts.some(part => !part || part === "." || part === "..")
      || path.posix.normalize(withoutTrailingSlash) !== withoutTrailingSlash) {
    throw new Error("يوجد مسار غير آمن داخل ملف النسخة");
  }
  return withoutTrailingSlash;
}

function safeStorageKey(value: unknown): string {
  const key = safeArchivePath(value);
  if (key.startsWith("db-backups/") || key.startsWith("_system_restore_")) {
    throw new Error("يحتوي ملف النسخة على مسار تخزين محجوز");
  }
  return key;
}

function isExtensionFriendlyArchivePath(originalPath: string, archivePath: string): boolean {
  if (archivePath === originalPath) return true;
  if (!archivePath.startsWith(originalPath)) return false;
  const suffix = archivePath.slice(originalPath.length);
  return /^(?:\.[a-z0-9]{1,10}|~[a-f0-9]{8}(?:-\d+)?(?:\.[a-z0-9]{1,10})?)$/i.test(suffix);
}

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, {
      lazyEntries: true,
      autoClose: false,
      decodeStrings: true,
      strictFileNames: true,
      validateEntrySizes: true,
    }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error("تعذر فتح ملف ZIP"));
      else resolve(zip);
    });
  });
}

function getZipEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zip.on("error", reject);
    zip.on("end", () => resolve(entries));
    zip.on("entry", entry => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.readEntry();
  });
}

async function extractEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, destination: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const input = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error("تعذر قراءة ملف من ZIP"));
      else resolve(stream);
    });
  });
  await pipeline(input, fs.createWriteStream(destination, { flags: "wx" }));
}

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function validateManifest(value: unknown): BackupManifest {
  if (!value || typeof value !== "object") throw new Error("ملف manifest.json غير صالح");
  const manifest = value as BackupManifest;
  if (manifest.format !== "mkgh-full-backup-v1"
      || !manifest.database
      || manifest.database.path !== "database/erp.db"
      || !Number.isSafeInteger(manifest.database.bytes)
      || manifest.database.bytes < 0
      || typeof manifest.database.sha256 !== "string"
      || !/^[a-f0-9]{64}$/i.test(manifest.database.sha256)
      || !Array.isArray(manifest.objects)
      || !Array.isArray(manifest.local_uploads)) {
    throw new Error("نسخة النظام غير متوافقة أو ملف manifest.json غير مكتمل");
  }
  const seen = new Set<string>();
  if (manifest.database_tables !== undefined) {
    const archivePath = safeArchivePath(manifest.database_tables.archive_path);
    if (archivePath !== "database-tables.xlsx" || !Number.isSafeInteger(manifest.database_tables.bytes)
        || manifest.database_tables.bytes < 0) {
      throw new Error("ملف Excel المرفق بالنسخة غير صالح");
    }
    seen.add(archivePath);
  }
  for (const item of manifest.objects) {
    const key = safeStorageKey(item?.storage_key);
    const archivePath = safeArchivePath(item?.archive_path);
    if (!isExtensionFriendlyArchivePath(`storage/${key}`, archivePath)
        || !Number.isSafeInteger(item.bytes) || item.bytes < 0
        || seen.has(archivePath)) {
      throw new Error("قائمة ملفات التخزين في النسخة غير صالحة");
    }
    seen.add(archivePath);
  }
  for (const item of manifest.local_uploads) {
    const archivePath = safeArchivePath(item?.archive_path);
    const restorePath = item?.restore_path === undefined
      ? archivePath.slice("uploads/".length)
      : safeArchivePath(item.restore_path);
    if (!archivePath.startsWith("uploads/") || !Number.isSafeInteger(item.bytes)
        || item.bytes < 0
        || !isExtensionFriendlyArchivePath(`uploads/${restorePath}`, archivePath)
        || seen.has(archivePath)) {
      throw new Error("قائمة الملفات المحلية في النسخة غير صالحة");
    }
    seen.add(archivePath);
  }
  return manifest;
}

async function extractAndValidateBackup(zipPath: string, workDir: string): Promise<ExtractedBackup> {
  const zip = await openZip(zipPath);
  try {
    const entries = await getZipEntries(zip);
    const files = new Map<string, yauzl.Entry>();
    let totalBytes = 0;
    for (const entry of entries) {
      const originalName = entry.fileName;
      if (originalName.endsWith("/")) {
        safeArchivePath(originalName);
        continue;
      }
      const name = safeArchivePath(originalName);
      if (files.has(name)) throw new Error("يحتوي ملف ZIP على أسماء ملفات مكررة");
      totalBytes += entry.uncompressedSize;
      if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new Error("حجم الملفات بعد فك الضغط يتجاوز الحد المسموح");
      }
      if (name !== "manifest.json" && name !== "README.txt"
          && name !== "database/erp.db" && name !== "database-tables.xlsx" && !name.startsWith("storage/")
          && !name.startsWith("uploads/")) {
        throw new Error(`مسار غير متوقع داخل النسخة: ${name.slice(0, 120)}`);
      }
      files.set(name, entry);
    }

    const manifestEntry = files.get("manifest.json");
    if (!manifestEntry || manifestEntry.uncompressedSize > 2 * 1024 * 1024) {
      throw new Error("ملف manifest.json مفقود أو أكبر من الحد المسموح");
    }
    const manifestPath = path.join(workDir, "manifest.json");
    await extractEntry(zip, manifestEntry, manifestPath);
    const manifest = validateManifest(JSON.parse(await fs.promises.readFile(manifestPath, "utf8")));
    const required = new Set([
      "manifest.json",
      "README.txt",
      manifest.database.path,
      ...(manifest.database_tables ? [manifest.database_tables.archive_path] : []),
      ...manifest.objects.map(object => object.archive_path),
      ...manifest.local_uploads.map(upload => upload.archive_path),
    ]);
    for (const name of files.keys()) {
      if (!required.has(name)) throw new Error(`الملف ${name.slice(0, 120)} غير مدرج في manifest.json`);
    }
    for (const name of required) {
      if (name !== "README.txt" && !files.has(name)) {
        throw new Error(`الملف ${name.slice(0, 120)} مفقود من النسخة`);
      }
    }

    const databaseEntry = files.get(manifest.database.path)!;
    if (databaseEntry.uncompressedSize !== manifest.database.bytes) {
      throw new Error("حجم قاعدة البيانات لا يطابق manifest.json");
    }
    const databasePath = path.join(workDir, "erp-restored.db");
    await extractEntry(zip, databaseEntry, databasePath);
    if (await sha256File(databasePath) !== manifest.database.sha256.toLowerCase()) {
      throw new Error("فشل التحقق من بصمة قاعدة البيانات داخل النسخة");
    }
    const sourceDb = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      const check = sourceDb.pragma("quick_check") as Array<{ quick_check: string }>;
      if (check.length !== 1 || check[0]?.quick_check !== "ok") {
        throw new Error("قاعدة البيانات داخل النسخة غير سليمة");
      }
      const fkErrors = sourceDb.pragma("foreign_key_check") as unknown[];
      if (fkErrors.length) throw new Error("تحتوي قاعدة البيانات داخل النسخة على روابط غير سليمة");
    } finally {
      sourceDb.close();
    }

    const objects: ExtractedBackup["objects"] = [];
    for (const item of manifest.objects) {
      const entry = files.get(item.archive_path)!;
      if (entry.uncompressedSize !== item.bytes) {
        throw new Error(`حجم الملف ${item.archive_path.slice(8, 120)} لا يطابق manifest.json`);
      }
      const filePath = path.join(workDir, "storage", item.storage_key);
      await extractEntry(zip, entry, filePath);
      objects.push({ ...item, filePath });
    }

    const uploads: ExtractedBackup["uploads"] = [];
    for (const item of manifest.local_uploads) {
      const entry = files.get(item.archive_path)!;
      if (entry.uncompressedSize !== item.bytes) {
        throw new Error(`حجم الملف ${item.archive_path.slice(8, 120)} لا يطابق manifest.json`);
      }
      const relativePath = item.restore_path ?? item.archive_path.slice("uploads/".length);
      const filePath = path.join(workDir, "uploads", relativePath);
      await extractEntry(zip, entry, filePath);
      uploads.push({ ...item, filePath, relativePath });
    }
    return { directory: workDir, databasePath, manifest, objects, uploads };
  } finally {
    zip.close();
  }
}

function listTables(connection: Database.Database): string[] {
  return (connection.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all() as Array<{ name: string }>).map(row => row.name);
}

function getColumns(connection: Database.Database, table: string): TableColumn[] {
  return connection.pragma(`table_info(${quoteIdentifier(table)})`) as TableColumn[];
}

function primaryKeyColumns(columns: TableColumn[]): TableColumn[] {
  return columns.filter(column => column.pk > 0).sort((left, right) => left.pk - right.pk);
}

function jsonValue(value: unknown): unknown {
  return Buffer.isBuffer(value) ? { buffer: value.toString("base64") } : value;
}

function stableValue(value: unknown): string {
  return JSON.stringify(jsonValue(value));
}

function rowMatches(left: Record<string, unknown>, right: Record<string, unknown>, columns: string[]): boolean {
  return columns.every(column => stableValue(left[column]) === stableValue(right[column]));
}

function makeRecordKey(table: string, pk: TableColumn[], row: Record<string, unknown>): string {
  const key = Object.fromEntries(pk.map(column => [column.name, jsonValue(row[column.name])]));
  const serialized = JSON.stringify(key);
  if (/session|token|secret|credential/i.test(table) || pk.some(column => /token|secret|password/i.test(column.name))) {
    return `sha256:${crypto.createHash("sha256").update(serialized).digest("hex")}`;
  }
  return serialized;
}

function labelForRecord(table: string, row: Record<string, unknown>, pk: TableColumn[]): string {
  const preferred = [
    "order_number", "invoice_number", "document_number", "card_number",
    "plate_number", "name", "title", "customer_name", "driver_name", "date",
  ];
  const key = preferred.find(name => typeof row[name] === "string" && String(row[name]).trim());
  const suffix = key ? ` — ${String(row[key]).slice(0, 100)}` : ` — ${makeRecordKey(table, pk, row).slice(0, 48)}`;
  return `${table.replaceAll("_", " ")}${suffix}`;
}

function logRestoreItem(runId: number, item: RestoreItemInput): number {
  const result = db.prepare(`
    INSERT INTO system_backup_restore_items
      (run_id, item_type, table_name, record_key, display_label, outcome, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId, item.itemType, item.tableName ?? null, item.recordKey ?? null,
    item.label.slice(0, 240), item.outcome, item.details?.slice(0, 2000) ?? null,
  );
  const itemId = Number(result.lastInsertRowid);
  db.prepare("UPDATE system_backup_restore_items SET target_path=? WHERE id=?")
    .run(`/backup-restore-log?item=${itemId}`, itemId);
  return itemId;
}

function insertRow(
  table: string,
  values: Record<string, unknown>,
  excludedColumns: Set<string> = new Set(),
): Database.RunResult {
  const columns = Object.keys(values).filter(name => !excludedColumns.has(name));
  if (!columns.length) return db.prepare(`INSERT INTO ${quoteIdentifier(table)} DEFAULT VALUES`).run();
  const sql = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(",")}) `
    + `VALUES (${columns.map(() => "?").join(",")})`;
  return db.prepare(sql).run(columns.map(name => values[name]));
}

function tableForeignKeys(connection: Database.Database, table: string): Array<{
  table: string; from: string; to: string | null;
}> {
  return connection.pragma(`foreign_key_list(${quoteIdentifier(table)})`) as Array<{
    table: string; from: string; to: string | null;
  }>;
}

function appendTableOrder(connection: Database.Database, tables: string[]): { ordered: string[]; cyclic: Set<string> } {
  const tableSet = new Set(tables);
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  for (const table of tables) {
    parents.set(table, new Set());
    children.set(table, new Set());
  }
  for (const child of tables) {
    for (const fk of tableForeignKeys(connection, child)) {
      if (!tableSet.has(fk.table)) continue;
      parents.get(child)!.add(fk.table);
      children.get(fk.table)!.add(child);
    }
  }
  const indegree = new Map([...parents].map(([table, parentSet]) => [table, parentSet.size]));
  const queue = tables.filter(table => indegree.get(table) === 0).sort();
  const ordered: string[] = [];
  while (queue.length) {
    const table = queue.shift()!;
    ordered.push(table);
    for (const child of children.get(table)!) {
      const next = indegree.get(child)! - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
    queue.sort();
  }
  return { ordered, cyclic: new Set(tables.filter(table => !ordered.includes(table))) };
}

function foreignKeyViolationKey(row: { table: string; rowid: number | null; parent: string; fkid: number }): string {
  return `${row.table}:${row.rowid}:${row.parent}:${row.fkid}`;
}

function assertNoNewForeignKeyViolations(before: Array<{ table: string; rowid: number | null; parent: string; fkid: number }>): void {
  const beforeCounts = new Map<string, number>();
  for (const row of before) {
    const key = foreignKeyViolationKey(row);
    beforeCounts.set(key, (beforeCounts.get(key) ?? 0) + 1);
  }
  const after = db.pragma("foreign_key_check") as Array<{ table: string; rowid: number | null; parent: string; fkid: number }>;
  const afterCounts = new Map<string, number>();
  for (const row of after) {
    const key = foreignKeyViolationKey(row);
    afterCounts.set(key, (afterCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of afterCounts) {
    if (count > (beforeCounts.get(key) ?? 0)) {
      throw new Error("تعذر الدمج دون إنشاء روابط بيانات غير سليمة؛ تم التراجع عن العملية");
    }
  }
}

function importFullDatabase(
  source: Database.Database,
  runId: number,
  fileOutcomes: FileOutcome[],
  writeAuditItems = true,
): Omit<RestoreCounts, "runId" | "status" | "message"> {
  const sourceTables = listTables(source).filter(table => !RESTORE_AUDIT_TABLES.has(table));
  const targetTables = listTables(db).filter(table => !RESTORE_AUDIT_TABLES.has(table));
  const targetSet = new Set(targetTables);
  for (const table of sourceTables) {
    if (!targetSet.has(table)) throw new Error(`الجدول ${table} غير موجود في إصدار التطبيق الحالي؛ لم تُستبدل البيانات`);
    const targetColumns = new Set(getColumns(db, table).map(column => column.name));
    const missingColumns = getColumns(source, table).filter(column => !targetColumns.has(column.name));
    if (missingColumns.length) {
      throw new Error(`يتطلب الجدول ${table} أعمدة غير موجودة في التطبيق الحالي؛ لم تُستبدل البيانات`);
    }
  }

  const sourceSequences = source.prepare("SELECT name, seq FROM sqlite_sequence").all() as Array<{ name: string; seq: number }>;
  let restoredRows = 0;
  let conflictRows = 0;
  const previousForeignKeys = Number((db.pragma("foreign_keys") as Array<{ foreign_keys: number }>)[0]?.foreign_keys ?? 1);
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      for (const table of targetTables) db.exec(`DELETE FROM ${quoteIdentifier(table)}`);
      db.prepare("DELETE FROM sqlite_sequence WHERE name NOT IN (?, ?)")
        .run(...RESTORE_AUDIT_TABLES);

      for (const table of sourceTables) {
        const sourceColumns = getColumns(source, table).map(column => column.name);
        const insertSql = `INSERT INTO ${quoteIdentifier(table)} (${sourceColumns.map(quoteIdentifier).join(",")}) `
          + `VALUES (${sourceColumns.map(() => "?").join(",")})`;
        const insert = db.prepare(insertSql);
        const select = source.prepare(`SELECT * FROM ${quoteIdentifier(table)}`);
        const pk = primaryKeyColumns(getColumns(source, table));
        for (const row of select.iterate() as Iterable<Record<string, unknown>>) {
          insert.run(sourceColumns.map(column => row[column]));
          restoredRows += 1;
          if (writeAuditItems) {
            logRestoreItem(runId, {
              itemType: "record", tableName: table, recordKey: makeRecordKey(table, pk, row),
              label: labelForRecord(table, row, pk), outcome: "restored",
            });
          }
        }
      }
      for (const item of sourceSequences) {
        if (targetSet.has(item.name) && !RESTORE_AUDIT_TABLES.has(item.name)) {
          db.prepare("DELETE FROM sqlite_sequence WHERE name=?").run(item.name);
          db.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)").run(item.name, item.seq);
        }
      }
      const fkErrors = db.pragma("foreign_key_check") as unknown[];
      if (fkErrors.length) throw new Error("قاعدة البيانات المستعادة تحتوي على روابط غير سليمة؛ تم إلغاء الاستعادة");
      if (writeAuditItems) {
        for (const item of fileOutcomes) {
          logRestoreItem(runId, {
            itemType: item.itemType, recordKey: item.key, label: item.label,
            outcome: item.outcome, details: item.details,
          });
          if (item.outcome === "conflict") conflictRows += 1;
        }
      }
    })();
  } finally {
    db.pragma(`foreign_keys = ${previousForeignKeys ? "ON" : "OFF"}`);
  }
  return {
    restoredRows,
    duplicateRows: 0,
    conflictRows,
    restoredFiles: fileOutcomes.filter(item => item.outcome === "restored").length,
    alreadyPresent: fileOutcomes.filter(item => item.outcome === "already_present").length,
  };
}

function importAppendDatabase(source: Database.Database, runId: number, fileOutcomes: FileOutcome[]): Omit<RestoreCounts, "runId" | "status" | "message"> {
  const sourceTables = listTables(source).filter(table => !RESTORE_AUDIT_TABLES.has(table));
  const targetTables = new Set(listTables(db));
  const importableTables = sourceTables.filter(table => targetTables.has(table));
  const { ordered, cyclic } = appendTableOrder(source, importableTables);
  const idMaps = new Map<string, Map<string, { value: unknown; blocked: boolean }>>();
  const blockedTables = new Set<string>();
  let restoredRows = 0;
  let duplicateRows = 0;
  let conflictRows = 0;
  let alreadyPresent = 0;
  const fkBefore = db.pragma("foreign_key_check") as Array<{ table: string; rowid: number | null; parent: string; fkid: number }>;
  const previousForeignKeys = Number((db.pragma("foreign_keys") as Array<{ foreign_keys: number }>)[0]?.foreign_keys ?? 1);
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      for (const table of sourceTables) {
        if (targetTables.has(table)) continue;
        const sourceRows = source.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).iterate() as Iterable<Record<string, unknown>>;
        for (const row of sourceRows) {
          conflictRows += 1;
          logRestoreItem(runId, {
            itemType: "record", tableName: table,
            label: labelForRecord(table, row, primaryKeyColumns(getColumns(source, table))),
            outcome: "conflict", details: "هذا الجدول غير موجود في إصدار التطبيق الحالي؛ لم يُستورد السجل",
          });
        }
      }
      for (const table of cyclic) {
        blockedTables.add(table);
        const rows = source.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).iterate() as Iterable<Record<string, unknown>>;
        const pk = primaryKeyColumns(getColumns(source, table));
        for (const row of rows) {
          const key = makeRecordKey(table, pk, row);
          const primary = pk.length === 1 ? stableValue(row[pk[0].name]) : key;
          if (pk.length === 1) {
            if (!idMaps.has(table)) idMaps.set(table, new Map());
            idMaps.get(table)!.set(primary, { value: null, blocked: true });
          }
          conflictRows += 1;
          logRestoreItem(runId, {
            itemType: "record", tableName: table, recordKey: key,
            label: labelForRecord(table, row, pk), outcome: "conflict",
            details: "لم يُستورد السجل لأن علاقاته بين الجداول متداخلة ولا يمكن نسخها بأمان",
          });
        }
      }

      for (const table of ordered) {
        if (blockedTables.has(table)) continue;
        const sourceColumns = getColumns(source, table).map(column => column.name);
        const targetColumns = new Set(getColumns(db, table).map(column => column.name));
        const sourceOnly = sourceColumns.filter(column => !targetColumns.has(column));
        const pk = primaryKeyColumns(getColumns(source, table));
        const targetPk = primaryKeyColumns(getColumns(db, table));
        const fks = tableForeignKeys(source, table);
        const tableMap = new Map<string, { value: unknown; blocked: boolean }>();
        if (pk.length === 1) idMaps.set(table, tableMap);
        const sourceRows = source.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).iterate() as Iterable<Record<string, unknown>>;

        for (const originalRow of sourceRows) {
          const row = { ...originalRow };
          let dependencyBlocked = false;
          for (const fk of fks) {
            if (!fk.from || !fk.to || !row[fk.from]) continue;
            const parentPk = primaryKeyColumns(getColumns(source, fk.table));
            if (parentPk.length !== 1 || parentPk[0].name !== fk.to) continue;
            const parentMap = idMaps.get(fk.table)?.get(stableValue(row[fk.from]));
            if (!parentMap) continue;
            if (parentMap.blocked) {
              dependencyBlocked = true;
              break;
            }
            row[fk.from] = parentMap.value;
          }
          const key = makeRecordKey(table, pk, originalRow);
          const sourcePkValue = pk.length === 1 ? originalRow[pk[0].name] : undefined;
          const sourceMapKey = pk.length === 1 ? stableValue(sourcePkValue) : key;
          if (dependencyBlocked || sourceOnly.length) {
            if (pk.length === 1) tableMap.set(sourceMapKey, { value: null, blocked: true });
            conflictRows += 1;
            logRestoreItem(runId, {
              itemType: "record", tableName: table, recordKey: key,
              label: labelForRecord(table, originalRow, pk), outcome: "conflict",
              details: dependencyBlocked
                ? "لم يُستورد السجل لأن السجل المرتبط به تعذّر نسخه"
                : `تحتوي النسخة على أعمدة غير موجودة في هذا الإصدار: ${sourceOnly.join(", ")}`,
            });
            continue;
          }

          let existing: Record<string, unknown> | undefined;
          if (pk.length && targetPk.length === pk.length
              && pk.every((column, index) => targetPk[index]?.name === column.name)) {
            const where = pk.map(column => `${quoteIdentifier(column.name)}=?`).join(" AND ");
            existing = db.prepare(`SELECT * FROM ${quoteIdentifier(table)} WHERE ${where}`)
              .get(...pk.map(column => row[column.name])) as Record<string, unknown> | undefined;
          }
          if (existing && rowMatches(existing, row, sourceColumns)) {
            alreadyPresent += 1;
            if (pk.length === 1) tableMap.set(sourceMapKey, { value: existing[pk[0].name], blocked: false });
            continue;
          }

          try {
            if (existing) {
              const integerPrimaryKey = pk.length === 1 && targetPk.length === 1
                && pk[0].type.trim().toUpperCase() === "INTEGER";
              if (!integerPrimaryKey) {
                if (pk.length === 1) tableMap.set(sourceMapKey, { value: null, blocked: true });
                conflictRows += 1;
                logRestoreItem(runId, {
                  itemType: "record", tableName: table, recordKey: key,
                  label: labelForRecord(table, originalRow, pk), outcome: "conflict",
                  details: "يوجد سجل مختلف بهذا المفتاح ولا يمكن إنشاء نسخة مستقلة بأمان",
                });
                continue;
              }
              const result = insertRow(table, row, new Set([pk[0].name]));
              const newKey = result.lastInsertRowid;
              if (pk.length === 1) tableMap.set(sourceMapKey, { value: newKey, blocked: false });
              duplicateRows += 1;
              logRestoreItem(runId, {
                itemType: "record", tableName: table,
                recordKey: makeRecordKey(table, pk, { ...row, [pk[0].name]: newKey }),
                label: labelForRecord(table, row, pk), outcome: "duplicated",
                details: `احتُفظ بالسجل الحالي وأُنشئت نسخة مستعادة بمعرّف داخلي ${String(newKey)}`,
              });
            } else {
              insertRow(table, row);
              if (pk.length === 1) tableMap.set(sourceMapKey, { value: row[pk[0].name], blocked: false });
              restoredRows += 1;
              logRestoreItem(runId, {
                itemType: "record", tableName: table, recordKey: makeRecordKey(table, pk, row),
                label: labelForRecord(table, row, pk), outcome: "restored",
              });
            }
          } catch (error) {
            if (pk.length === 1) tableMap.set(sourceMapKey, { value: null, blocked: true });
            conflictRows += 1;
            logRestoreItem(runId, {
              itemType: "record", tableName: table, recordKey: key,
              label: labelForRecord(table, originalRow, pk), outcome: "conflict",
              details: error instanceof Error
                ? `تعارض قيد في قاعدة البيانات: ${error.message.slice(0, 300)}`
                : "تعذر إدراج السجل بسبب قيد في قاعدة البيانات",
            });
          }
        }
      }

      for (const item of fileOutcomes) {
        logRestoreItem(runId, {
          itemType: item.itemType, recordKey: item.key, label: item.label,
          outcome: item.outcome, details: item.details,
        });
        if (item.outcome === "conflict") conflictRows += 1;
      }
      assertNoNewForeignKeyViolations(fkBefore);
    })();
  } finally {
    db.pragma(`foreign_keys = ${previousForeignKeys ? "ON" : "OFF"}`);
  }
  return {
    restoredRows, duplicateRows, conflictRows,
    restoredFiles: fileOutcomes.filter(item => item.outcome === "restored").length,
    alreadyPresent,
  };
}

async function listLocalFiles(root: string, relative = ""): Promise<Array<{ relativePath: string; filePath: string; bytes: number }>> {
  const result: Array<{ relativePath: string; filePath: string; bytes: number }> = [];
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return result;
  const items = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const item of items) {
    if (item.isSymbolicLink()) throw new Error("يوجد رابط رمزي في مجلد الملفات؛ أُوقفت الاستعادة لحماية الملفات");
    const child = path.posix.join(relative, item.name);
    if (item.isDirectory()) result.push(...await listLocalFiles(root, child));
    else if (item.isFile()) {
      const filePath = path.join(root, child);
      result.push({ relativePath: child, filePath, bytes: (await fs.promises.stat(filePath)).size });
    }
  }
  return result;
}

async function restoreLocalUploads(
  backup: ExtractedBackup,
  mode: RestoreMode,
  rollbackPath: string,
): Promise<{ outcomes: FileOutcome[]; rollback: () => Promise<void> }> {
  const outcomes: FileOutcome[] = [];
  const added: string[] = [];
  const existing = await listLocalFiles(UPLOADS_PATH);
  const existingByPath = new Map(existing.map(item => [item.relativePath, item]));
  if (mode === "full") {
    await fs.promises.cp(UPLOADS_PATH, rollbackPath, { recursive: true, force: true });
    try {
      await fs.promises.rm(UPLOADS_PATH, { recursive: true, force: true });
      await fs.promises.mkdir(UPLOADS_PATH, { recursive: true });
      for (const upload of backup.uploads) {
        const destination = path.join(UPLOADS_PATH, upload.relativePath);
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        await fs.promises.copyFile(upload.filePath, destination, fs.constants.COPYFILE_EXCL);
        outcomes.push({
          itemType: "local_upload", key: upload.relativePath, label: upload.relativePath,
          outcome: "restored",
        });
      }
    } catch (error) {
      await fs.promises.rm(UPLOADS_PATH, { recursive: true, force: true });
      await fs.promises.mkdir(UPLOADS_PATH, { recursive: true });
      await fs.promises.cp(rollbackPath, UPLOADS_PATH, { recursive: true, force: true });
      throw error;
    }
    return {
      outcomes,
      rollback: async () => {
        await fs.promises.rm(UPLOADS_PATH, { recursive: true, force: true });
        await fs.promises.mkdir(UPLOADS_PATH, { recursive: true });
        await fs.promises.cp(rollbackPath, UPLOADS_PATH, { recursive: true, force: true });
      },
    };
  }

  for (const upload of backup.uploads) {
    const current = existingByPath.get(upload.relativePath);
    if (current) {
      const [incomingHash, currentHash] = await Promise.all([
        sha256File(upload.filePath), sha256File(current.filePath),
      ]);
      if (incomingHash === currentHash) {
        outcomes.push({
          itemType: "local_upload", key: upload.relativePath, label: upload.relativePath,
          outcome: "already_present",
        });
      } else {
        outcomes.push({
          itemType: "local_upload", key: upload.relativePath, label: upload.relativePath,
          outcome: "conflict", details: "يوجد ملف مختلف بالمسار نفسه؛ احتُفظ بالملف الحالي",
        });
      }
      continue;
    }
    const destination = path.join(UPLOADS_PATH, upload.relativePath);
    try {
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.copyFile(upload.filePath, destination, fs.constants.COPYFILE_EXCL);
      added.push(destination);
      outcomes.push({
        itemType: "local_upload", key: upload.relativePath, label: upload.relativePath,
        outcome: "restored",
      });
    } catch (error) {
      for (const addedPath of added) await fs.promises.rm(addedPath, { force: true }).catch(() => {});
      throw error;
    }
  }
  return {
    outcomes,
    rollback: async () => {
      for (const filePath of added) await fs.promises.rm(filePath, { force: true });
    },
  };
}

function storageRollbackKey(runId: number, objectKey: string): string {
  const encoded = Buffer.from(objectKey).toString("base64url");
  return `_system_restore_rollback/${runId}/${encoded}`;
}

async function restoreFilesystemObjectFiles(
  backup: ExtractedBackup,
  mode: RestoreMode,
  runId: number,
): Promise<{ outcomes: FileOutcome[]; rollback: () => Promise<void>; cleanup: () => Promise<void> }> {
  const current = await listHostingerObjects();
  const currentByKey = new Map(current.map(object => [object.key, object]));
  const incomingByKey = new Map(backup.objects.map(object => [object.storage_key, object]));
  const outcomes: FileOutcome[] = [];
  const uploadedKeys: string[] = [];

  if (mode === "full") {
    const rollbackDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `mkgh-local-objects-${runId}-`));
    const snapshots: Array<{ key: string; filePath: string; metadata: HostingerObjectMetadata }> = [];
    for (const object of current) {
      const snapshotPath = path.join(rollbackDir, ...object.key.split("/"));
      await fs.promises.mkdir(path.dirname(snapshotPath), { recursive: true });
      await fs.promises.copyFile(object.filePath, snapshotPath);
      snapshots.push({ key: object.key, filePath: snapshotPath, metadata: object.metadata });
    }

    const restoreSnapshot = async () => {
      const now = await listHostingerObjects();
      for (const object of now) await removeHostingerObject(object.key);
      for (const snapshot of snapshots) {
        await writeHostingerObject(snapshot.key, snapshot.filePath, snapshot.metadata);
      }
    };

    try {
      for (const object of current) await removeHostingerObject(object.key);
      for (const object of backup.objects) {
        await writeHostingerObject(object.storage_key, object.filePath, {
          contentType: object.content_type || "application/octet-stream",
          cacheControl: object.cache_control,
          contentDisposition: object.content_disposition,
          metadata: object.metadata,
        });
        const [savedMetadata] = await new HostingerObjectFile(object.storage_key).getMetadata();
        if (savedMetadata.size !== object.bytes) {
          throw new Error(`تعذر التحقق من الملف المستعاد: ${object.storage_key.slice(0, 120)}`);
        }
        uploadedKeys.push(object.storage_key);
        outcomes.push({
          itemType: "object", key: object.storage_key, label: object.storage_key,
          outcome: "restored",
        });
      }
    } catch (error) {
      await restoreSnapshot().catch(() => {});
      await fs.promises.rm(rollbackDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }

    return {
      outcomes,
      rollback: restoreSnapshot,
      cleanup: async () => {
        await fs.promises.rm(rollbackDir, { recursive: true, force: true });
      },
    };
  }

  try {
    for (const object of backup.objects) {
      const existing = currentByKey.get(object.storage_key);
      if (existing) {
        if (existing.metadata.size === object.bytes
            && await sha256File(existing.filePath) === await sha256File(object.filePath)) {
          outcomes.push({
            itemType: "object", key: object.storage_key, label: object.storage_key,
            outcome: "already_present",
          });
        } else {
          outcomes.push({
            itemType: "object", key: object.storage_key, label: object.storage_key,
            outcome: "conflict", details: "يوجد ملف مختلف بالمسار نفسه؛ احتُفظ بالملف الحالي",
          });
        }
        continue;
      }
      await writeHostingerObject(object.storage_key, object.filePath, {
        contentType: object.content_type || "application/octet-stream",
        cacheControl: object.cache_control,
        contentDisposition: object.content_disposition,
        metadata: object.metadata,
      });
      const [savedMetadata] = await new HostingerObjectFile(object.storage_key).getMetadata();
      if (savedMetadata.size !== object.bytes) {
        throw new Error(`تعذر التحقق من الملف المستعاد: ${object.storage_key.slice(0, 120)}`);
      }
      uploadedKeys.push(object.storage_key);
      outcomes.push({
        itemType: "object", key: object.storage_key, label: object.storage_key,
        outcome: "restored",
      });
    }
  } catch (error) {
    for (const key of uploadedKeys) await removeHostingerObject(key).catch(() => {});
    throw error;
  }

  return {
    outcomes,
    rollback: async () => {
      for (const key of uploadedKeys) await removeHostingerObject(key);
    },
    cleanup: async () => {},
  };
}

async function restoreObjectFiles(
  backup: ExtractedBackup,
  mode: RestoreMode,
  runId: number,
): Promise<{ outcomes: FileOutcome[]; rollback: () => Promise<void>; cleanup: () => Promise<void> }> {
  if (isFilesystemStorageMode()) return restoreFilesystemObjectFiles(backup, mode, runId);
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("تخزين الملفات غير مهيأ؛ لم تُستعد الملفات");
  const bucket = makeStorage().bucket(bucketId);
  const [listed] = await bucket.getFiles();
  const current = listed.filter(file => file.name && !file.name.endsWith("/")
    && !file.name.startsWith("db-backups/")
    && !file.name.startsWith("_system_restore_"));
  const currentByKey = new Map(current.map(file => [file.name, file]));
  const incomingByKey = new Map(backup.objects.map(object => [object.storage_key, object]));
  const outcomes: FileOutcome[] = [];
  const uploadedKeys: string[] = [];
  const originalKeys = new Set(currentByKey.keys());
  const rollbackCopies = new Map<string, string>();

  if (mode === "full") {
    for (const file of current) {
      const rollbackKey = storageRollbackKey(runId, file.name);
      await file.copy(bucket.file(rollbackKey));
      rollbackCopies.set(file.name, rollbackKey);
    }
    try {
      for (const object of backup.objects) {
        const destination = bucket.file(object.storage_key);
        await bucket.upload(object.filePath, {
          destination: object.storage_key,
          metadata: {
            contentType: object.content_type || undefined,
            cacheControl: object.cache_control || undefined,
            contentDisposition: object.content_disposition || undefined,
            metadata: object.metadata || undefined,
          },
        });
        uploadedKeys.push(object.storage_key);
        const [saved] = await destination.getMetadata();
        if (Number(saved.size) !== object.bytes
            || (object.crc32c && saved.crc32c && saved.crc32c !== object.crc32c)) {
          throw new Error(`تعذر التحقق من الملف المستعاد: ${object.storage_key.slice(0, 120)}`);
        }
        outcomes.push({
          itemType: "object", key: object.storage_key, label: object.storage_key,
          outcome: "restored",
        });
      }
      for (const file of current) {
        if (!incomingByKey.has(file.name)) {
          await file.delete({ ignoreNotFound: true });
        }
      }
    } catch (error) {
      await rollback();
      for (const rollbackKey of rollbackCopies.values()) {
        await bucket.file(rollbackKey).delete({ ignoreNotFound: true }).catch(() => {});
      }
      throw error;
    }
    async function rollback(): Promise<void> {
      const touched = new Set([...originalKeys, ...incomingByKey.keys()]);
      for (const key of touched) {
        const rollbackKey = rollbackCopies.get(key);
        if (rollbackKey) {
          await bucket.file(rollbackKey).copy(bucket.file(key));
        } else {
          await bucket.file(key).delete({ ignoreNotFound: true }).catch(() => {});
        }
      }
    }
    return {
      outcomes,
      rollback,
      cleanup: async () => {
        for (const rollbackKey of rollbackCopies.values()) {
          await bucket.file(rollbackKey).delete({ ignoreNotFound: true }).catch(() => {});
        }
      },
    };
  }

  try {
    for (const object of backup.objects) {
      const existing = currentByKey.get(object.storage_key);
      if (existing) {
        const [metadata] = await existing.getMetadata();
        if (Number(metadata.size) === object.bytes
            && object.crc32c && metadata.crc32c === object.crc32c) {
          outcomes.push({
            itemType: "object", key: object.storage_key, label: object.storage_key,
            outcome: "already_present",
          });
          continue;
        }
        if (!object.crc32c && Number(metadata.size) === object.bytes) {
          const currentHash = crypto.createHash("sha256");
          for await (const chunk of existing.createReadStream()) currentHash.update(chunk);
          if (currentHash.digest("hex") === await sha256File(object.filePath)) {
            outcomes.push({
              itemType: "object", key: object.storage_key, label: object.storage_key,
              outcome: "already_present",
            });
            continue;
          }
        }
        outcomes.push({
          itemType: "object", key: object.storage_key, label: object.storage_key,
          outcome: "conflict", details: "يوجد ملف مختلف بالمسار نفسه؛ احتُفظ بالملف الحالي",
        });
        continue;
      }
      await bucket.upload(object.filePath, {
        destination: object.storage_key,
        metadata: {
          contentType: object.content_type || undefined,
          cacheControl: object.cache_control || undefined,
          contentDisposition: object.content_disposition || undefined,
          metadata: object.metadata || undefined,
        },
      });
      uploadedKeys.push(object.storage_key);
      const [saved] = await bucket.file(object.storage_key).getMetadata();
      if (Number(saved.size) !== object.bytes
          || (object.crc32c && saved.crc32c && saved.crc32c !== object.crc32c)) {
        throw new Error(`تعذر التحقق من الملف المستعاد: ${object.storage_key.slice(0, 120)}`);
      }
      outcomes.push({
        itemType: "object", key: object.storage_key, label: object.storage_key,
        outcome: "restored",
      });
    }
  } catch (error) {
    for (const key of uploadedKeys) {
      await bucket.file(key).delete({ ignoreNotFound: true }).catch(() => {});
    }
    throw error;
  }
  return {
    outcomes,
    rollback: async () => {
      for (const key of uploadedKeys) await bucket.file(key).delete({ ignoreNotFound: true }).catch(() => {});
    },
    cleanup: async () => {},
  };
}

function replaceDatabaseFromSnapshot(snapshotPath: string): void {
  const source = new Database(snapshotPath, { readonly: true, fileMustExist: true });
  try {
    importFullDatabase(source, 0, [], false);
  } finally {
    source.close();
  }
}

export async function executeSystemBackupRestore(options: {
  zipPath: string;
  mode: RestoreMode;
  filename: string;
  actorId: number | "system";
}): Promise<RestoreCounts> {
  const runResult = db.prepare(`
    INSERT INTO system_backup_restore_runs
      (mode, actor_id, source_filename, status)
    VALUES (?, ?, ?, 'running')
  `).run(options.mode, String(options.actorId), path.basename(options.filename).slice(0, 240));
  const runId = Number(runResult.lastInsertRowid);
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `mkgh-restore-${runId}-`));
  let objectUndo: Awaited<ReturnType<typeof restoreObjectFiles>> | undefined;
  let localUndo: Awaited<ReturnType<typeof restoreLocalUploads>> | undefined;
  let liveDatabasePath: string | undefined;
  let databaseCommitted = false;

  try {
    const backup = await extractAndValidateBackup(options.zipPath, path.join(workDir, "archive"));
    const source = new Database(backup.databasePath, { readonly: true, fileMustExist: true });
    try {
      db.prepare("UPDATE system_backup_restore_runs SET source_created_at=? WHERE id=?")
        .run(backup.manifest.created_at || null, runId);

      checkpointWAL();
      await uploadDbBackup(DB_PATH, checkpointWAL, true);
      liveDatabasePath = path.join(workDir, "live-before-restore.db");
      await db.backup(liveDatabasePath);

      objectUndo = await restoreObjectFiles(backup, options.mode, runId);
      localUndo = await restoreLocalUploads(
        backup, options.mode, path.join(workDir, "local-uploads-before-restore"),
      );

      const fileOutcomes = [...objectUndo.outcomes, ...localUndo.outcomes];
      const stats = options.mode === "full"
        ? importFullDatabase(source, runId, fileOutcomes)
        : importAppendDatabase(source, runId, fileOutcomes);
      databaseCommitted = true;

      const status = stats.conflictRows > 0 ? "partial" : "completed";
      const message = status === "partial"
        ? "اكتملت الاستعادة مع تعارضات محفوظة للمراجعة؛ لم تُستبدل الملفات أو السجلات المتعارضة"
        : "اكتملت الاستعادة";
      db.prepare(`
        UPDATE system_backup_restore_runs
        SET status=?, restored_rows=?, duplicate_rows=?, conflict_rows=?, restored_files=?,
            message=?, completed_at=datetime('now')
        WHERE id=?
      `).run(
        status, stats.restoredRows, stats.duplicateRows, stats.conflictRows,
        stats.restoredFiles, message, runId,
      );
      checkpointWAL();
      await uploadDbBackup(DB_PATH, checkpointWAL, true);
      await objectUndo.cleanup();
      return { ...stats, runId, status, message };
    } finally {
      source.close();
    }
  } catch (error) {
    let rollbackError: unknown;
    try {
      if (databaseCommitted && liveDatabasePath) {
        db.prepare("DELETE FROM system_backup_restore_items WHERE run_id=?").run(runId);
        replaceDatabaseFromSnapshot(liveDatabasePath);
      }
      if (localUndo) await localUndo.rollback();
      if (objectUndo) await objectUndo.rollback();
      checkpointWAL();
      await uploadDbBackup(DB_PATH, checkpointWAL, true);
    } catch (err) {
      rollbackError = err;
    }
    const message = error instanceof Error ? error.message : "تعذر إكمال الاستعادة";
    const fullMessage = rollbackError
      ? `${message}؛ وتعذر إكمال التراجع الآلي: ${rollbackError instanceof Error ? rollbackError.message : "خطأ غير معروف"}`
      : `${message}؛ تم الاحتفاظ بالحالة السابقة`;
    db.prepare(`
      UPDATE system_backup_restore_runs
      SET status=?, conflict_rows=conflict_rows+1, message=?, completed_at=datetime('now')
      WHERE id=?
    `).run(rollbackError ? "partial" : "failed", fullMessage.slice(0, 2000), runId);
    logRestoreItem(runId, {
      itemType: "system", label: "تعذر إكمال الاستعادة",
      outcome: "conflict", details: fullMessage,
    });
    throw new Error(fullMessage);
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}