import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import * as XLSX from "xlsx";

const EXCEL_MAX_ROWS = 1_048_576;
const EXCEL_MAX_COLUMNS = 16_384;
const EXCEL_MAX_CELL_LENGTH = 32_767;

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/tiff": "tif",
  "image/webp": "webp",
};

export function extensionForContentType(contentType: unknown): string | undefined {
  if (typeof contentType !== "string") return undefined;
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  return CONTENT_TYPE_EXTENSIONS[mediaType];
}

export function uniqueArchivePath(
  originalPath: string,
  extension: string | undefined,
  originalPaths: ReadonlySet<string>,
  chosenPaths: Set<string>,
  identity: string,
): string {
  const suffix = extension ? `.${extension}` : "";
  const candidate = suffix && !originalPath.toLowerCase().endsWith(suffix.toLowerCase())
    ? `${originalPath}${suffix}`
    : originalPath;
  let result = candidate;
  if ((candidate !== originalPath && originalPaths.has(candidate)) || chosenPaths.has(candidate)) {
    const hash = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 8);
    result = `${originalPath}~${hash}${suffix}`;
    let counter = 2;
    while (originalPaths.has(result) || chosenPaths.has(result)) {
      result = `${originalPath}~${hash}-${counter}${suffix}`;
      counter += 1;
    }
  }
  chosenPaths.add(result);
  return result;
}

export async function inferLocalUploadExtension(filePath: string, relativePath: string): Promise<string | undefined> {
  if (path.posix.extname(relativePath)) return undefined;

  const file = await fs.promises.open(filePath, "r");
  let header: Buffer;
  try {
    header = Buffer.alloc(16);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    header = header.subarray(0, bytesRead);
  } finally {
    await file.close();
  }

  if (header.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpg";
  if (["GIF87a", "GIF89a"].includes(header.subarray(0, 6).toString("ascii"))) return "gif";
  if (header.subarray(0, 4).toString("ascii") === "RIFF"
      && header.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (header.subarray(0, 2).toString("ascii") === "BM") return "bmp";
  if (header.subarray(0, 4).toString("ascii") === "II*\0"
      || header.subarray(0, 4).toString("ascii") === "MM\0*") return "tif";
  if (header.length >= 12 && header.subarray(4, 8).toString("ascii") === "ftyp"
      && ["heic", "heix", "hevc", "hevx", "mif1"].includes(header.subarray(8, 12).toString("ascii"))) return "heic";
  return undefined;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function worksheetName(tableName: string, usedNames: Set<string>): string {
  let base = tableName.replace(/[\[\]*?:/\\]/g, "_").replace(/^'+|'+$/g, "").slice(0, 31) || "Table";
  let result = base;
  let number = 2;
  while (usedNames.has(result)) {
    const suffix = ` (${number})`;
    result = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    number += 1;
  }
  usedNames.add(result);
  return result;
}

function excelValue(value: unknown, tableName: string, columnName: string): unknown {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const encoded = Buffer.from(value).toString("base64");
    if (encoded.length > EXCEL_MAX_CELL_LENGTH) {
      throw new Error(`A binary value in ${tableName}.${columnName} exceeds Excel's cell limit`);
    }
    return `base64:${encoded}`;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && value.length > EXCEL_MAX_CELL_LENGTH) {
    throw new Error(`A text value in ${tableName}.${columnName} exceeds Excel's cell limit`);
  }
  return value;
}

export function writeDatabaseTablesWorkbook(databasePath: string, workbookPath: string): number {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const workbook = XLSX.utils.book_new();
    const usedNames = new Set<string>();
    const tables = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    for (const { name } of tables) {
      const columns = database.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`)
        .all() as Array<{ name: string }>;
      if (columns.length > EXCEL_MAX_COLUMNS) {
        throw new Error(`Table ${name} has more columns than Excel can store`);
      }
      const values = database.prepare(`SELECT * FROM ${quoteIdentifier(name)}`).all() as Array<Record<string, unknown>>;
      if (values.length + 1 > EXCEL_MAX_ROWS) {
        throw new Error(`Table ${name} has more rows than Excel can store`);
      }
      const header = columns.map(column => column.name);
      const rows = values.map(row => columns.map(column => excelValue(row[column.name], name, column.name)));
      const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
      XLSX.utils.book_append_sheet(workbook, worksheet, worksheetName(name, usedNames));
    }

    if (workbook.SheetNames.length === 0) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["No application tables"]]), "No tables");
    }
    XLSX.writeFile(workbook, workbookPath, { bookType: "xlsx", compression: true });
    return fs.statSync(workbookPath).size;
  } finally {
    database.close();
  }
}