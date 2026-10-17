import type { File, Storage as GoogleStorage } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  ACL_POLICY_METADATA_KEY,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import {
  HostingerObjectFile,
  issueHostingerUpload,
  resolveHostingerUploadPath,
} from "./hostinger-filesystem-storage.js";
import { isFilesystemStorageMode } from "./runtime-mode.js";
import {
  createR2UploadUrl,
  deleteR2Object,
  getR2Object,
  headR2Object,
  isWorkerR2BindingConfigured,
  isR2ObjectStorageBackend,
  r2BucketName,
  setR2ObjectMetadata,
} from "./r2-storage.js";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const R2_OBJECT_PREFIX = "app-objects/";

class R2StoredObject {
  constructor(readonly key: string) {}

  get name(): string {
    return this.key;
  }

  async exists(): Promise<[boolean]> {
    return [Boolean(await headR2Object(this.key))];
  }

  async getMetadata(): Promise<[Record<string, unknown>]> {
    const head = await headR2Object(this.key);
    if (!head) throw new ObjectNotFoundError();
    const r2Metadata = head.Metadata ?? {};
    const metadata = { ...r2Metadata };
    const aclPolicy = r2Metadata["custom-acl-policy"];
    if (aclPolicy) metadata[ACL_POLICY_METADATA_KEY] = aclPolicy;
    return [{
      metadata,
      size: head.ContentLength,
      contentType: head.ContentType,
      cacheControl: head.CacheControl,
      contentDisposition: head.ContentDisposition,
      contentEncoding: head.ContentEncoding,
      contentLanguage: head.ContentLanguage,
      updated: head.LastModified,
    }];
  }

  async setMetadata(options: { metadata?: Record<string, string> }): Promise<void> {
    const [current] = await this.getMetadata();
    const merged = { ...(current.metadata as Record<string, string>), ...(options.metadata ?? {}) };
    const r2Metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(merged)) {
      const r2Key = key === ACL_POLICY_METADATA_KEY ? "custom-acl-policy" : key.toLowerCase();
      if (!/^[a-z0-9-]+$/.test(r2Key)) {
        throw new Error("R2 custom metadata key contains unsupported characters");
      }
      r2Metadata[r2Key] = value;
    }
    await setR2ObjectMetadata(this.key, r2Metadata);
  }

  async delete(): Promise<void> {
    await deleteR2Object(this.key);
  }
}

let objectStorageClient: GoogleStorage | undefined;
async function getObjectStorageClient(): Promise<GoogleStorage> {
  if (!objectStorageClient) {
    const { Storage } = await import("@google-cloud/storage");
    objectStorageClient = new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
        type: "external_account",
        credential_source: {
          url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
          format: {
            type: "json",
            subject_token_field_name: "access_token",
          },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });
  }
  return objectStorageClient;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      if (isFilesystemStorageMode()) return ["/local/public"];
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    if (isFilesystemStorageMode()) return "/local/private";
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      if (isR2ObjectStorageBackend()) {
        const r2Key = `${R2_OBJECT_PREFIX}${objectName}`;
        if (await headR2Object(r2Key)) return new R2StoredObject(r2Key) as unknown as File;
      }
      if (isFilesystemStorageMode()) {
        const localFile = new HostingerObjectFile(objectName);
        const [exists] = await localFile.exists();
        if (exists) return localFile as unknown as File;
        continue;
      }
      const bucket = (await getObjectStorageClient()).bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(file: File, cacheTtlSec: number = 3600): Promise<Response> {
    if (file instanceof R2StoredObject) {
      const object = await getR2Object(file.key);
      if (!object?.Body) throw new ObjectNotFoundError();
      const body = object.Body as ReadableStream<Uint8Array> | NodeJS.ReadableStream;
      const webStream = typeof (body as ReadableStream<Uint8Array>).getReader === "function"
        ? body as ReadableStream<Uint8Array>
        : Readable.toWeb(body as import("node:stream").Readable) as ReadableStream<Uint8Array>;
      const headers: Record<string, string> = {
        "Content-Type": object.ContentType || "application/octet-stream",
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
        "X-Content-Type-Options": "nosniff",
      };
      if (object.ContentLength != null) headers["Content-Length"] = String(object.ContentLength);
      return new Response(webStream, { headers });
    }
    if (file instanceof HostingerObjectFile) {
      const [metadata] = await file.getMetadata();
      const nodeStream = file.createReadStream();
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;
      const isPublic = file.key.startsWith("public/");
      const headers: Record<string, string> = {
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
        "X-Content-Type-Options": "nosniff",
      };
      if (metadata.size) headers["Content-Length"] = String(metadata.size);
      return new Response(webStream, { headers });
    }
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(expectedSize?: number): Promise<string> {
    if (isFilesystemStorageMode()) return issueHostingerUpload("uploads");
    if (isR2ObjectStorageBackend()) {
      if (isWorkerR2BindingConfigured()) {
        const size = expectedSize === undefined ? "" : `?size=${encodeURIComponent(String(expectedSize))}`;
        return `/api/storage/r2-upload/uploads/${randomUUID()}${size}`;
      }
      return createR2UploadUrl(`${R2_OBJECT_PREFIX}uploads/${randomUUID()}`);
    }
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getBranchDocumentUploadURL(expectedSize?: number): Promise<string> {
    if (isFilesystemStorageMode()) return issueHostingerUpload("branch-documents");
    if (isR2ObjectStorageBackend()) {
      if (isWorkerR2BindingConfigured()) {
        const size = expectedSize === undefined ? "" : `?size=${encodeURIComponent(String(expectedSize))}`;
        return `/api/storage/r2-upload/branch-documents/${randomUUID()}${size}`;
      }
      return createR2UploadUrl(`${R2_OBJECT_PREFIX}branch-documents/${randomUUID()}`);
    }
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/branch-documents/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    if (isR2ObjectStorageBackend()) {
      const r2Object = await headR2Object(`${R2_OBJECT_PREFIX}${entityId}`);
      if (r2Object) return new R2StoredObject(`${R2_OBJECT_PREFIX}${entityId}`) as unknown as File;
    }
    if (isFilesystemStorageMode()) {
      const objectFile = new HostingerObjectFile(`private/${entityId}`);
      const [exists] = await objectFile.exists();
      if (!exists) throw new ObjectNotFoundError();
      return objectFile as unknown as File;
    }
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = (await getObjectStorageClient()).bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (isFilesystemStorageMode()) {
      const localPath = resolveHostingerUploadPath(rawPath);
      if (localPath) return localPath;
      try {
        const url = new URL(rawPath);
        if (url.hostname === "storage.googleapis.com") {
          const segments = url.pathname.split("/").filter(Boolean);
          const privateIndex = segments.indexOf("private");
          if (privateIndex >= 1) return `/objects/${segments.slice(privateIndex + 1).join("/")}`;
        }
      } catch {
        // Already-normalized object paths are not absolute URLs.
      }
      return rawPath;
    }
    if (isWorkerR2BindingConfigured()) {
      try {
        const url = new URL(rawPath, "https://worker-upload.invalid");
        const match = url.pathname.match(
          /^\/api\/storage\/r2-upload\/(uploads|branch-documents)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
        );
        if (match) return `/objects/${match[1]}/${match[2]}`;
      } catch { /* already-normalized object paths are not absolute URLs */ }
    }
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      if (isR2ObjectStorageBackend()) {
        try {
          const url = new URL(rawPath);
          const accountHost = `${process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim()}.r2.cloudflarestorage.com`.toLowerCase();
          const bucketName = r2BucketName();
          const hostname = url.hostname.toLowerCase();
          const segments = url.pathname.split("/").filter(Boolean);
          const objectKeySegments = hostname === accountHost && segments[0] === bucketName
            ? segments.slice(1)
            : hostname === `${bucketName}.${accountHost}`
              ? segments
              : null;
          const objectKey = objectKeySegments?.join("/");
          if (objectKey?.startsWith(R2_OBJECT_PREFIX)) {
            const entityId = objectKey.slice(R2_OBJECT_PREFIX.length);
            if (entityId) return `/objects/${entityId}`;
          }
        } catch { /* already a normalized path */ }
      }
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json() as { signed_url: string };
  return signedURL;
}
