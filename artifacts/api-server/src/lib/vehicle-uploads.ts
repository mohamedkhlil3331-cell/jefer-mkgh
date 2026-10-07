import fs from "node:fs/promises";
import path from "node:path";
import db, { UPLOADS_PATH } from "./db.js";
import { makeStorage } from "./db-sync.js";
import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage.js";

const objectStorage = new ObjectStorageService();
const attachmentColumnPattern = /url|uri|image|photo|file|attachment|document|pdf|signature|scan|receipt|proof/i;
const uploadPathPrefix = "/api/uploads/";
const objectPathPrefix = "/objects/";
const objectRoutePrefix = "/api/storage/objects/";
const localUrlBase = "http://vehicle-uploads.local";

export type VehicleAttachmentIdentity =
  | { key: string; kind: "upload"; fileName: string }
  | { key: string; kind: "object"; objectPath: string };

export class UnsupportedVehicleAttachmentError extends Error {
  constructor() {
    super("This attachment is not stored in a supported vehicle-upload location");
    this.name = "UnsupportedVehicleAttachmentError";
  }
}

function getPathname(value: string): string | null {
  try {
    const parsed = new URL(value, localUrlBase);
    const isTrustedStorageHost = parsed.hostname === "storage.googleapis.com";
    const isLocalUrl = parsed.origin === localUrlBase;
    if (!isTrustedStorageHost && !isLocalUrl) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

function getLocalUploadFileName(value: string): string | null {
  const pathname = getPathname(value);
  if (!pathname?.startsWith(uploadPathPrefix)) return null;

  const encodedName = pathname.slice(uploadPathPrefix.length);
  if (!encodedName || encodedName.includes("/")) return null;

  let fileName: string;
  try {
    fileName = decodeURIComponent(encodedName);
  } catch {
    return null;
  }

  if (
    !fileName ||
    fileName === "." ||
    fileName === ".." ||
    fileName.includes("\0") ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    path.basename(fileName) !== fileName
  ) {
    return null;
  }

  const uploadsRoot = path.resolve(UPLOADS_PATH);
  const absolutePath = path.resolve(uploadsRoot, fileName);
  if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) return null;

  return fileName;
}

function getObjectEntityPath(value: string): string | null {
  let candidate = value.trim();
  const pathname = getPathname(candidate);

  if (pathname?.startsWith(objectRoutePrefix)) {
    candidate = pathname.slice("/api/storage".length);
  } else if (pathname?.startsWith(objectPathPrefix)) {
    candidate = pathname;
  }

  try {
    const normalized = objectStorage.normalizeObjectEntityPath(candidate);
    if (!normalized.startsWith(objectPathPrefix)) return null;

    const entityId = normalized.slice(objectPathPrefix.length);
    if (
      !entityId ||
      entityId.split("/").some(part => !part || part === "." || part === ".." || part.includes("\\") || part.includes("\0"))
    ) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

export function getVehicleAttachmentIdentity(value: unknown): VehicleAttachmentIdentity | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const fileName = getLocalUploadFileName(value.trim());
  if (fileName) return { key: `upload:${fileName}`, kind: "upload", fileName };

  const objectPath = getObjectEntityPath(value.trim());
  if (objectPath) return { key: `object:${objectPath}`, kind: "object", objectPath };

  return null;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function countVehicleAttachmentReferences(identity: VehicleAttachmentIdentity): number {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).all() as { name: string }[];
  let references = 0;

  for (const { name: tableName } of tables) {
    const table = quoteIdentifier(tableName);
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];

    for (const { name: columnName } of columns) {
      if (
        !attachmentColumnPattern.test(columnName) ||
        /base64|_data$|_blob$/i.test(columnName)
      ) continue;

      const column = quoteIdentifier(columnName);
      const rows = db.prepare(`
        SELECT ${column} AS value
        FROM ${table}
        WHERE ${column} LIKE ?
           OR ${column} LIKE ?
           OR ${column} LIKE ?
      `).all("%/api/uploads/%", "%/objects/%", "https://storage.googleapis.com/%") as { value: unknown }[];

      for (const row of rows) {
        if (getVehicleAttachmentIdentity(row.value)?.key === identity.key) references += 1;
      }
    }
  }

  return references;
}

export async function deleteVehicleAttachmentBytes(identity: VehicleAttachmentIdentity): Promise<void> {
  if (identity.kind === "upload") {
    const uploadsRoot = path.resolve(UPLOADS_PATH);
    const absolutePath = path.resolve(uploadsRoot, identity.fileName);
    if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
      throw new UnsupportedVehicleAttachmentError();
    }

    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (bucketId) {
      await makeStorage()
        .bucket(bucketId)
        .file(`legacy-uploads/${identity.fileName}`)
        .delete({ ignoreNotFound: true });
    }

    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return;
  }

  try {
    const objectFile = await objectStorage.getObjectEntityFile(identity.objectPath);
    await objectFile.delete({ ignoreNotFound: true });
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) throw error;
  }
}