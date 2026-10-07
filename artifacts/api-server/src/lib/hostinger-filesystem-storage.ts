import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getAppDataDir } from "./db-sync.js";

export interface HostingerObjectMetadata {
  size?: number;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  updated?: string;
  metadata?: Record<string, string>;
}

interface PendingUpload {
  objectKey: string;
  expiresAt: number;
}

const pendingUploads = new Map<string, PendingUpload>();
const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function objectRoot(): string {
  return path.join(getAppDataDir(), "objects");
}

function safeObjectKey(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.includes("\\") ||
    normalized.includes("\0") ||
    segments.some(segment => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid object key");
  }
  return segments.join("/");
}

export function getHostingerObjectPath(key: string): string {
  return path.join(objectRoot(), ...safeObjectKey(key).split("/"));
}

function metadataPath(filePath: string): string {
  return `${filePath}.meta.json`;
}

export class HostingerObjectFile {
  readonly key: string;
  readonly name: string;
  readonly filePath: string;

  constructor(key: string) {
    this.key = safeObjectKey(key);
    this.name = this.key;
    this.filePath = getHostingerObjectPath(this.key);
  }

  async exists(): Promise<[boolean]> {
    try {
      await fs.promises.access(this.filePath, fs.constants.F_OK);
      return [true];
    } catch {
      return [false];
    }
  }

  async getMetadata(): Promise<[HostingerObjectMetadata]> {
    const stat = await fs.promises.stat(this.filePath);
    let saved: HostingerObjectMetadata = {};
    try {
      saved = JSON.parse(await fs.promises.readFile(metadataPath(this.filePath), "utf8")) as HostingerObjectMetadata;
    } catch {
      // Older migrated objects may not have a sidecar; serve them as binary.
    }
    return [{
      ...saved,
      size: stat.size,
      contentType: saved.contentType || "application/octet-stream",
      updated: stat.mtime.toISOString(),
    }];
  }

  createReadStream(): fs.ReadStream {
    return fs.createReadStream(this.filePath);
  }

  async delete(options?: { ignoreNotFound?: boolean }): Promise<void> {
    try {
      await fs.promises.unlink(this.filePath);
      await fs.promises.unlink(metadataPath(this.filePath)).catch(() => {});
    } catch (error) {
      if (!options?.ignoreNotFound) throw error;
    }
  }

  async setMetadata(options: { metadata?: Record<string, unknown> }): Promise<void> {
    let existing: HostingerObjectMetadata = {};
    try {
      existing = JSON.parse(await fs.promises.readFile(metadataPath(this.filePath), "utf8")) as HostingerObjectMetadata;
    } catch {
      // A missing sidecar is expected for older objects.
    }
    const customMetadata = options.metadata || {};
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.promises.writeFile(metadataPath(this.filePath), JSON.stringify({
      ...existing,
      metadata: { ...existing.metadata, ...customMetadata },
    }));
  }

  async copy(destination: HostingerObjectFile): Promise<void> {
    const [metadata] = await this.getMetadata();
    await fs.promises.mkdir(path.dirname(destination.filePath), { recursive: true });
    await fs.promises.copyFile(this.filePath, destination.filePath);
    await fs.promises.writeFile(metadataPath(destination.filePath), JSON.stringify(metadata));
  }
}

export function issueHostingerUpload(folder: "uploads" | "branch-documents"): string {
  const token = crypto.randomUUID();
  pendingUploads.set(token, {
    objectKey: `private/${folder}/${crypto.randomUUID()}`,
    expiresAt: Date.now() + UPLOAD_URL_TTL_MS,
  });
  return `/api/storage/local-upload/${token}`;
}

export function resolveHostingerUploadPath(uploadURL: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(uploadURL, "http://localhost").pathname;
  } catch {
    return null;
  }
  const match = /^\/api\/storage\/local-upload\/([0-9a-f-]{36})$/i.exec(pathname);
  if (!match) return null;
  const pending = pendingUploads.get(match[1]);
  if (!pending || pending.expiresAt <= Date.now()) {
    pendingUploads.delete(match[1]);
    return null;
  }
  return `/objects/${pending.objectKey.slice("private/".length)}`;
}

export async function saveHostingerUpload(
  token: string,
  source: Readable,
  contentType: string,
): Promise<{ objectKey: string; size: number }> {
  const pending = pendingUploads.get(token);
  if (!pending || pending.expiresAt <= Date.now()) {
    pendingUploads.delete(token);
    throw new Error("UPLOAD_URL_EXPIRED");
  }
  pendingUploads.delete(token);

  const destination = getHostingerObjectPath(pending.objectKey);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.${crypto.randomUUID()}.upload`;
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        callback(new Error("UPLOAD_TOO_LARGE"));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(source, limiter, fs.createWriteStream(temporaryPath, { flags: "wx" }));
    await fs.promises.rename(temporaryPath, destination);
    const safeContentType = /^[\w.+-]+\/[\w.+-]+$/.test(contentType)
      ? contentType
      : "application/octet-stream";
    await fs.promises.writeFile(metadataPath(destination), JSON.stringify({
      size,
      contentType: safeContentType,
      updated: new Date().toISOString(),
    }));
    return { objectKey: pending.objectKey, size };
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

export async function listHostingerObjects(): Promise<Array<{
  key: string;
  filePath: string;
  metadata: HostingerObjectMetadata;
}>> {
  const root = objectRoot();
  const results: Array<{ key: string; filePath: string; metadata: HostingerObjectMetadata }> = [];
  const visit = async (directory: string): Promise<void> => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await visit(filePath);
        continue;
      }
      if (!entry.isFile() || entry.name.endsWith(".meta.json") || entry.name.endsWith(".upload")) continue;
      const key = path.relative(root, filePath).split(path.sep).join("/");
      const file = new HostingerObjectFile(key);
      const [metadata] = await file.getMetadata();
      results.push({ key, filePath, metadata });
    }
  };
  await visit(root);
  return results;
}

export async function writeHostingerObject(
  key: string,
  sourcePath: string,
  metadata: HostingerObjectMetadata = {},
): Promise<void> {
  const file = new HostingerObjectFile(key);
  await fs.promises.mkdir(path.dirname(file.filePath), { recursive: true });
  await fs.promises.copyFile(sourcePath, file.filePath);
  await fs.promises.writeFile(metadataPath(file.filePath), JSON.stringify(metadata));
}

export async function removeHostingerObject(key: string): Promise<void> {
  await new HostingerObjectFile(key).delete({ ignoreNotFound: true });
}
