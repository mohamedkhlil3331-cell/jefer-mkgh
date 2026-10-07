import Database from "better-sqlite3";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { File as GcsFile } from "@google-cloud/storage";
import * as XLSX from "xlsx";
import { ZipFile } from "yazl";
import { appStorageClient, getConfiguredAppStorageRoots } from "./appStorageClient.js";
import { UPLOADS_PATH, default as liveDb } from "./db.js";

const EXCEL_MAX_DATA_ROWS = 1_048_575;
const EXCEL_PAGE_SIZE = 2_000;
const EXCEL_MAX_CELL_CHARS = 32_000;

interface LocalUpload {
  fullPath: string;
  archivePath: string;
  size: number;
  mtime: Date;
}

interface StorageObject {
  file: GcsFile;
  archivePath: string;
  size: number;
  mtime: Date;
  contentType?: string;
}

export interface SystemBackupSummary {
  createdAt: string;
  tableCount: number;
  databaseRows: number;
  databaseBytes: number;
  workbookBytes: number;
  uploadCount: number;
  uploadBytes: number;
  appStorageObjectCount: number;
  appStorageBytes: number;
  workbookMaskedValues: number;
  workbookTruncatedCells: number;
}

export interface PreparedSystemBackup {
  zip: ZipFile;
  summary: SystemBackupSummary;
  cleanup: () => Promise<void>;
}

export class SystemBackupPreparationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "SystemBackupPreparationError";
  }
}

interface WorkbookStats {
  tableCount: number;
  totalRows: number;
  maskedValues: number;
  truncatedCells: number;
  tableRows: Array<[string, number]>;
}

export async function prepareSystemBackup(): Promise<PreparedSystemBackup> {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "mkgh-system-backup-"));
  const snapshotPath = path.join(tempDir, "erp.db");
  const workbookPath = path.join(tempDir, "erp-data.xlsx");

  try {
    await liveDb.backup(snapshotPath);
    const uploads = await listLocalUploads();
    const storageObjects = await listAppStorageObjects();
    const workbookStats = buildWorkbook(snapshotPath, workbookPath);

    const databaseBytes = (await fsp.stat(snapshotPath)).size;
    const workbookBytes = (await fsp.stat(workbookPath)).size;
    const uploadBytes = uploads.reduce((total, upload) => total + upload.size, 0);
    const appStorageBytes = storageObjects.reduce((total, object) => total + object.size, 0);
    const createdAt = new Date().toISOString();

    const summary: SystemBackupSummary = {
      createdAt,
      tableCount: workbookStats.tableCount,
      databaseRows: workbookStats.totalRows,
      databaseBytes,
      workbookBytes,
      uploadCount: uploads.length,
      uploadBytes,
      appStorageObjectCount: storageObjects.length,
      appStorageBytes,
      workbookMaskedValues: workbookStats.maskedValues,
      workbookTruncatedCells: workbookStats.truncatedCells,
    };

    const manifest = {
      format: "MKGH ERP comprehensive data backup",
      createdAt,
      contents: {
        database: {
          path: "database/erp.db",
          snapshot: "SQLite online backup API",
          bytes: databaseBytes,
          tableCount: summary.tableCount,
          rowCount: summary.databaseRows,
        },
        workbook: {
          path: "database/erp-data.xlsx",
          bytes: workbookBytes,
          maskedValues: workbookStats.maskedValues,
          truncatedCells: workbookStats.truncatedCells,
        },
        localUploads: {
          path: "uploads/",
          fileCount: uploads.length,
          bytes: uploadBytes,
        },
        appStorage: {
          path: "app-storage/",
          configuredRoots: getConfiguredAppStorageRoots().map((root) => root.label),
          objectCount: storageObjects.length,
          bytes: appStorageBytes,
        },
      },
      exclusions: [
        "Project source code",
        "Replit Secrets and environment variables",
      ],
      workbookPrivacy: "Password-, token-, secret-, and API-key-like columns are masked in the workbook only; the SQLite database remains complete.",
    };

    const readme = [
      "MKGH ERP — Comprehensive Data Backup",
      `Created: ${createdAt}`,
      "",
      "Contents:",
      "- database/erp.db: complete SQLite snapshot.",
      "- database/erp-data.xlsx: readable workbook generated from the snapshot.",
      "- uploads/: files from the API server's local uploads directory.",
      "- app-storage/: objects from the configured private and public App Storage paths.",
      "- manifest.json: file counts, sizes, and export details.",
      "",
      "Sensitive data:",
      "- The SQLite database is complete and may contain account and session records. Keep this archive private.",
      "- Password, token, secret, and API-key-like values are masked in the workbook only.",
      "- Replit Secrets, environment variables, and project source code are not included.",
      "",
      "This archive is a data export. It does not install or configure the application on another hosting provider.",
      "",
    ].join("\n");

    const zip = new ZipFile();
    const defaultFileOptions = {
      forceZip64Format: true,
      mode: 0o100600,
    };

    zip.addBuffer(Buffer.from(readme, "utf8"), "README.txt", {
      ...defaultFileOptions,
      compress: true,
      compressionLevel: 6,
    });
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), "manifest.json", {
      ...defaultFileOptions,
      compress: true,
      compressionLevel: 6,
    });
    zip.addFile(snapshotPath, "database/erp.db", {
      ...defaultFileOptions,
      mtime: new Date(),
      compress: true,
      compressionLevel: 1,
    });
    zip.addFile(workbookPath, "database/erp-data.xlsx", {
      ...defaultFileOptions,
      mtime: new Date(),
      compress: false,
    });

    for (const upload of uploads) {
      zip.addFile(upload.fullPath, upload.archivePath, {
        ...defaultFileOptions,
        mtime: upload.mtime,
        compress: shouldCompress(upload.archivePath),
        ...(shouldCompress(upload.archivePath) ? { compressionLevel: 1 } : {}),
      });
    }

    for (const object of storageObjects) {
      const options = {
        ...defaultFileOptions,
        mtime: object.mtime,
        size: object.size,
        compress: shouldCompress(object.archivePath, object.contentType),
        ...(shouldCompress(object.archivePath, object.contentType) ? { compressionLevel: 1 } : {}),
      };

      if (object.archivePath.endsWith("/")) {
        zip.addEmptyDirectory(object.archivePath, { mtime: object.mtime, mode: 0o040700 });
        continue;
      }

      zip.addReadStreamLazy(object.archivePath, options, (callback) => {
        try {
          callback(null, object.file.createReadStream());
        } catch (error) {
          callback(error, Readable.from([]));
        }
      });
    }

    return {
      zip,
      summary,
      cleanup: () => fsp.rm(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await fsp.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function listLocalUploads(): Promise<LocalUpload[]> {
  const uploads: LocalUpload[] = [];

  const walk = async (directory: string): Promise<void> => {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error("يوجد رابط رمزي داخل مجلد الملفات المرفوعة؛ أُوقف التصدير لتجنب قراءة ملفات خارجه.");
      }
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const stat = await fsp.stat(fullPath);
      const relativePath = path.relative(UPLOADS_PATH, fullPath).split(path.sep).join("/");
      uploads.push({
        fullPath,
        archivePath: safeArchivePath(`uploads/${relativePath}`),
        size: stat.size,
        mtime: stat.mtime,
      });
    }
  };

  await walk(UPLOADS_PATH);
  return uploads;
}

async function listAppStorageObjects(): Promise<StorageObject[]> {
  let roots;
  try {
    roots = getConfiguredAppStorageRoots();
  } catch {
    throw new SystemBackupPreparationError(
      "مسارات App Storage غير مضبوطة؛ تعذر تحديد الملفات المراد تصديرها.",
      503,
      "app_storage_not_configured",
    );
  }
  const objects: StorageObject[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const bucket = appStorageClient.bucket(root.bucketName);
    let files: GcsFile[];
    try {
      [files] = await bucket.getFiles({ prefix: root.prefix });
    } catch {
      throw new SystemBackupPreparationError(
        `تعذر قراءة ملفات App Storage ضمن المسار ${root.label}.`,
        503,
        "app_storage_unavailable",
      );
    }

    for (const file of files) {
      if (!file.name.startsWith(root.prefix)) {
        throw new Error(`ظهر كائن خارج مسار App Storage المحدد (${root.label}).`);
      }
      const objectKey = `${root.bucketName}\0${file.name}`;
      if (seen.has(objectKey)) continue;
      seen.add(objectKey);

      const relativeName = root.prefix ? file.name.slice(root.prefix.length) : file.name;
      const archivePath = safeArchivePath(`${root.archivePrefix}/${relativeName}`);
      const size = Number(file.metadata.size);
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(`تعذر قراءة حجم أحد ملفات App Storage ضمن المسار ${root.label}.`);
      }

      const updatedAt = file.metadata.updated ? new Date(file.metadata.updated) : new Date();
      objects.push({
        file,
        archivePath,
        size,
        mtime: Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
        contentType: file.metadata.contentType,
      });
    }
  }

  return objects;
}

function buildWorkbook(snapshotPath: string, outputPath: string): WorkbookStats {
  const snapshot = new Database(snapshotPath, { readonly: true, fileMustExist: true });
  const stats: WorkbookStats = {
    tableCount: 0,
    totalRows: 0,
    maskedValues: 0,
    truncatedCells: 0,
    tableRows: [],
  };
  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>(["ملخص".toLowerCase()]);
  const summarySheet = XLSX.utils.aoa_to_sheet([["البيان", "القيمة"]]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "ملخص");

  try {
    snapshot.pragma("query_only = ON");
    const tables = snapshot
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>;

    for (const { name } of tables) {
      const quotedName = quoteIdentifier(name);
      const columns = snapshot
        .prepare(`PRAGMA table_info(${quotedName})`)
        .all() as Array<{ name: string }>;
      if (columns.length === 0) continue;

      const countResult = snapshot.prepare(`SELECT COUNT(*) AS count FROM ${quotedName}`).get() as { count: number };
      const rowCount = Number(countResult.count);
      stats.tableCount += 1;
      stats.totalRows += rowCount;
      stats.tableRows.push([name, rowCount]);

      const columnNames = columns.map((column) => column.name);
      const selectPage = snapshot.prepare(`SELECT * FROM ${quotedName} LIMIT ? OFFSET ?`);
      let offset = 0;
      let chunkIndex = 1;

      do {
        const pageRows: Array<Record<string, unknown>> = [];
        let rowsOnSheet = 0;
        const sheet = XLSX.utils.aoa_to_sheet([columnNames]);

        while (rowsOnSheet < EXCEL_MAX_DATA_ROWS) {
          const limit = Math.min(EXCEL_PAGE_SIZE, EXCEL_MAX_DATA_ROWS - rowsOnSheet);
          const rows = selectPage.all(limit, offset) as Array<Record<string, unknown>>;
          if (rows.length === 0) break;
          pageRows.push(...rows);
          offset += rows.length;
          rowsOnSheet += rows.length;
          if (rows.length < limit) break;
        }

        if (pageRows.length > 0) {
          const excelRows = pageRows.map((row) =>
            columnNames.map((column) => toExcelCell(row[column], column, name, stats)),
          );
          XLSX.utils.sheet_add_aoa(sheet, excelRows, { origin: -1 });
        }

        const sheetName = uniqueSheetName(name, chunkIndex, usedSheetNames);
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
        chunkIndex += 1;
      } while (offset < rowCount);
    }
  } finally {
    snapshot.close();
  }

  const summaryRows: Array<Array<string | number>> = [
    ["تاريخ إنشاء النسخة", new Date().toISOString()],
    ["عدد الجداول", stats.tableCount],
    ["إجمالي السجلات", stats.totalRows],
    ["عدد القيم المحجوبة في هذا الملف", stats.maskedValues],
    ["عدد الخلايا النصية المقتطعة", stats.truncatedCells],
    ["ملاحظة", "قاعدة SQLite داخل الأرشيف تحتوي البيانات الأصلية كاملة."],
    [],
    ["الجدول", "عدد السجلات"],
    ...stats.tableRows,
  ];
  XLSX.utils.sheet_add_aoa(summarySheet, summaryRows, { origin: -1 });
  XLSX.writeFile(workbook, outputPath, { bookType: "xlsx", compression: true });

  return stats;
}

function toExcelCell(
  value: unknown,
  columnName: string,
  tableName: string,
  stats: WorkbookStats,
): string | number {
  if (value == null) return "";

  if (/(password|passwd|pwd|session|token|secret|credential|authorization|api[_-]?key|private[_-]?key)/i.test(columnName)) {
    stats.maskedValues += 1;
    return "[محجوب؛ راجع قاعدة SQLite]";
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return `[بيانات ثنائية: ${value.byteLength} بايت؛ راجع قاعدة SQLite]`;
  }
  if (typeof value === "string") {
    if (value.length > EXCEL_MAX_CELL_CHARS) {
      stats.truncatedCells += 1;
      return `${value.slice(0, EXCEL_MAX_CELL_CHARS - 1)}…`;
    }
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();

  return String(value);
}

function uniqueSheetName(tableName: string, chunkIndex: number, used: Set<string>): string {
  const normalized = tableName.replace(/[\\/?*:[\]]/g, "_").trim() || "جدول";
  let suffix = chunkIndex > 1 ? `_${chunkIndex}` : "";
  let candidate = `${normalized.slice(0, 31 - suffix.length)}${suffix}`;
  let extra = 2;
  while (used.has(candidate.toLowerCase())) {
    suffix = `_${chunkIndex}_${extra}`;
    candidate = `${normalized.slice(0, 31 - suffix.length)}${suffix}`;
    extra += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function safeArchivePath(value: string): string {
  const normalized = value
    .split("/")
    .map((segment) => {
      const encodedPercent = segment.replace(/%/g, "%25").replace(/\\/g, "%5C");
      if (encodedPercent === ".") return "%2E";
      if (encodedPercent === "..") return "%2E%2E";
      return encodedPercent;
    })
    .join("/");

  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error("تعذر إنشاء مسار آمن لأحد ملفات النسخة.");
  }
  if (Buffer.byteLength(normalized, "utf8") > 0xffff) {
    throw new Error("اسم أحد الملفات أطول من الحد الذي يدعمه ZIP.");
  }
  return normalized;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function shouldCompress(filePath: string, contentType?: string): boolean {
  if (contentType?.startsWith("text/")) return true;
  if (/^(application\/(json|xml|javascript|sql)|image\/svg\+xml)/i.test(contentType ?? "")) return true;
  return /\.(json|csv|txt|xml|log|sql|html|css|js|ts|yaml|yml|md|db)$/i.test(filePath);
}
