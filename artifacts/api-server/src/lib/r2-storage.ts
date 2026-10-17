import {
  CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand,
  ListObjectsV2Command, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageEngine } from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.replace(/[\u0000-\u001f\u007f]/g, "").trim();

type WorkerR2Object = {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    contentLanguage?: string;
    cacheExpiry?: Date;
  };
  customMetadata?: Record<string, string>;
  body?: ReadableStream<Uint8Array>;
};

type WorkerR2Bucket = {
  get(key: string): Promise<WorkerR2Object | null>;
  head(key: string): Promise<WorkerR2Object | null>;
  put(key: string, value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string | null, options?: Record<string, unknown>): Promise<WorkerR2Object | null>;
  delete(key: string): Promise<void>;
  list(options?: { cursor?: string }): Promise<{ objects: WorkerR2Object[]; truncated: boolean; cursor?: string }>;
};

function workerR2Bucket(): WorkerR2Bucket | undefined {
  return (globalThis as typeof globalThis & {
    __ERP_WORKER_ENV?: { ERP_OBJECTS?: WorkerR2Bucket };
  }).__ERP_WORKER_ENV?.ERP_OBJECTS;
}

export function isWorkerR2BindingConfigured(): boolean {
  return Boolean(workerR2Bucket());
}

export async function handleWorkerR2Upload(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/api\/storage\/r2-upload\/(uploads|branch-documents)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  if (!match) return null;
  if (request.method !== "PUT") return new Response("Method not allowed", { status: 405, headers: { Allow: "PUT" } });
  const bucket = workerR2Bucket();
  if (!bucket) return new Response("R2 binding is unavailable", { status: 503 });
  if (!request.body) return new Response("Upload body is required", { status: 400 });
  const declaredSize = url.searchParams.get("size") ?? request.headers.get("content-length");
  const size = declaredSize === null ? NaN : Number(declaredSize);
  if (!Number.isSafeInteger(size) || size < 0) {
    return new Response("A valid upload size is required", { status: 411 });
  }
  const requestLength = request.headers.get("content-length");
  if (requestLength !== null && Number(requestLength) !== size) {
    return new Response("Upload size does not match the request body length", { status: 400 });
  }
  const FixedLengthStream = (globalThis as typeof globalThis & {
    FixedLengthStream?: new (length: number) => {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
    };
  }).FixedLengthStream;
  if (!FixedLengthStream) return new Response("Fixed-length upload streaming is unavailable", { status: 503 });

  const metadata: NonNullable<WorkerR2Object["httpMetadata"]> = {};
  const contentType = request.headers.get("content-type");
  const cacheControl = request.headers.get("cache-control");
  const contentDisposition = request.headers.get("content-disposition");
  const contentEncoding = request.headers.get("content-encoding");
  const contentLanguage = request.headers.get("content-language");
  if (contentType) metadata.contentType = contentType;
  if (cacheControl) metadata.cacheControl = cacheControl;
  if (contentDisposition) metadata.contentDisposition = contentDisposition;
  if (contentEncoding) metadata.contentEncoding = contentEncoding;
  if (contentLanguage) metadata.contentLanguage = contentLanguage;

  const fixedLength = new FixedLengthStream(size);
  const [stored] = await Promise.all([
    bucket.put(`app-objects/${match[1]}/${match[2]}`, fixedLength.readable, {
      ...(Object.keys(metadata).length ? { httpMetadata: metadata } : {}),
    }),
    request.body.pipeTo(fixedLength.writable),
  ]);
  if (!stored) return new Response("R2 upload failed", { status: 500 });
  return new Response(null, { status: 200 });
}

function workerBodyAsNodeStream(body: ReadableStream<Uint8Array>): NonNullable<GetObjectCommandOutput["Body"]> {
  const stream = Readable.fromWeb(body);
  const transformToByteArray = async (): Promise<Uint8Array> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  };
  return Object.assign(stream, { transformToByteArray }) as unknown as NonNullable<GetObjectCommandOutput["Body"]>;
}

function fromWorkerR2Object(object: WorkerR2Object): GetObjectCommandOutput {
  return {
    Body: object.body ? workerBodyAsNodeStream(object.body) : undefined,
    ContentLength: object.size,
    ContentType: object.httpMetadata?.contentType,
    CacheControl: object.httpMetadata?.cacheControl,
    ContentDisposition: object.httpMetadata?.contentDisposition,
    ContentEncoding: object.httpMetadata?.contentEncoding,
    ContentLanguage: object.httpMetadata?.contentLanguage,
    Expires: object.httpMetadata?.cacheExpiry,
    Metadata: object.customMetadata ?? {},
    ETag: object.httpEtag,
    LastModified: object.uploaded,
    $metadata: { httpStatusCode: 200 },
  };
}

export const isR2Configured = Boolean((accountId && bucket && accessKeyId && secretAccessKey) || workerR2Bucket());

/**
 * Keep the current Replit Object Storage fallback until a production cutover
 * is explicitly configured. In R2 mode, never silently issue new uploads to
 * Replit when R2 credentials are missing.
 */
export function isR2ObjectStorageBackend(): boolean {
  const selected = process.env.ERP_OBJECT_STORAGE_BACKEND?.trim();
  if (selected && selected !== "r2") {
    throw new Error(`[r2-storage] Unsupported ERP_OBJECT_STORAGE_BACKEND: ${selected}`);
  }
  if (selected === "r2" && !isR2Configured) {
    throw new Error("[r2-storage] ERP_OBJECT_STORAGE_BACKEND=r2 requires complete Cloudflare R2 configuration");
  }
  return selected === "r2" || (!selected && isR2Configured);
}

let client: S3Client | null = null;
export function getR2Client(): S3Client {
  if (!isR2Configured || !accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 credentials are not configured");
  }
  return client ??= new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

export function r2BucketName(): string {
  if (!bucket) throw new Error("Cloudflare R2 bucket is not configured");
  return bucket;
}

export type R2ObjectInfo = {
  key: string;
  size: number;
  updated?: string;
  etag?: string;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
};

export async function listR2Objects(): Promise<R2ObjectInfo[]> {
  const boundBucket = workerR2Bucket();
  if (boundBucket) {
    const objects: R2ObjectInfo[] = [];
    let cursor: string | undefined;
    do {
      const page = await boundBucket.list({ cursor });
      objects.push(...page.objects.map(object => ({
        key: object.key,
        size: object.size,
        updated: object.uploaded?.toISOString(),
        etag: object.httpEtag,
        contentType: object.httpMetadata?.contentType,
        cacheControl: object.httpMetadata?.cacheControl,
        contentDisposition: object.httpMetadata?.contentDisposition,
        metadata: object.customMetadata,
      })));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return objects;
  }

  const objects: R2ObjectInfo[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await getR2Client().send(new ListObjectsV2Command({
      Bucket: r2BucketName(),
      ContinuationToken: continuationToken,
    }));
    for (const item of page.Contents ?? []) {
      if (!item.Key || item.Key.endsWith("/")) continue;
      const head = await headR2Object(item.Key);
      objects.push({
        key: item.Key,
        size: Number(item.Size ?? 0),
        updated: item.LastModified?.toISOString(),
        etag: item.ETag,
        contentType: head?.ContentType,
        cacheControl: head?.CacheControl,
        contentDisposition: head?.ContentDisposition,
        metadata: head?.Metadata,
      });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

export async function uploadR2File(
  key: string,
  filePath: string,
  metadata: Pick<R2ObjectInfo, "contentType" | "cacheControl" | "contentDisposition" | "metadata"> = {},
): Promise<void> {
  const size = (await fs.promises.stat(filePath)).size;
  await getR2Client().send(new PutObjectCommand({
    Bucket: r2BucketName(),
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentLength: size,
    ContentType: metadata.contentType,
    CacheControl: metadata.cacheControl,
    ContentDisposition: metadata.contentDisposition,
    Metadata: metadata.metadata,
  }));
}

export async function copyR2Object(sourceKey: string, destinationKey: string): Promise<void> {
  const boundBucket = workerR2Bucket();
  if (boundBucket) {
    const source = await boundBucket.get(sourceKey);
    if (!source?.body) throw new Error("R2 source object not found");
    const copied = await boundBucket.put(destinationKey, source.body, {
      httpMetadata: source.httpMetadata,
      customMetadata: source.customMetadata,
    });
    if (!copied) throw new Error("R2 object copy did not complete");
    return;
  }

  const encodedSource = sourceKey.split("/").map(encodeURIComponent).join("/");
  await getR2Client().send(new CopyObjectCommand({
    Bucket: r2BucketName(),
    Key: destinationKey,
    CopySource: `${r2BucketName()}/${encodedSource}`,
    MetadataDirective: "COPY",
  }));
}

export async function createR2UploadUrl(key: string, expiresIn = 900): Promise<string> {
  if (workerR2Bucket()) {
    throw new Error("Worker R2 uploads must use the bound upload route, not a signed S3 URL");
  }
  return getSignedUrl(getR2Client(), new PutObjectCommand({ Bucket: r2BucketName(), Key: key }), { expiresIn });
}

export async function uploadR2Object(key: string, body: Buffer, contentType: string, cacheControl?: string): Promise<void> {
  const boundBucket = workerR2Bucket();
  if (boundBucket) {
    const stored = await boundBucket.put(key, body, {
      httpMetadata: { contentType, ...(cacheControl ? { cacheControl } : {}) },
    });
    if (!stored) throw new Error("R2 object upload did not complete");
    return;
  }

  await getR2Client().send(new PutObjectCommand({
    Bucket: r2BucketName(), Key: key, Body: body, ContentType: contentType,
    ...(cacheControl ? { CacheControl: cacheControl } : {}),
  }));
}

export async function getR2Object(key: string) {
  const boundBucket = workerR2Bucket();
  if (boundBucket) {
    const object = await boundBucket.get(key);
    return object ? fromWorkerR2Object(object) : null;
  }

  try {
    return await getR2Client().send(new GetObjectCommand({ Bucket: r2BucketName(), Key: key }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function headR2Object(key: string) {
  const boundBucket = workerR2Bucket();
  if (boundBucket) {
    const object = await boundBucket.head(key);
    return object ? fromWorkerR2Object(object) : null;
  }

  try {
    return await getR2Client().send(new HeadObjectCommand({ Bucket: r2BucketName(), Key: key }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function setR2ObjectMetadata(key: string, metadata: Record<string, string>): Promise<void> {
  const boundBucket = workerR2Bucket();
  if (boundBucket) {
    const current = await boundBucket.get(key);
    if (!current?.body) throw new Error("R2 object not found");
    const updated = await boundBucket.put(key, current.body, {
      httpMetadata: current.httpMetadata,
      customMetadata: metadata,
      onlyIf: { etagMatches: current.etag },
    });
    if (!updated) throw new Error("R2 object changed while updating metadata");
    return;
  }

  const bucket = r2BucketName();
  const current = await headR2Object(key);
  if (!current) throw new Error("R2 object not found");
  await getR2Client().send(new CopyObjectCommand({
    Bucket: bucket,
    Key: key,
    CopySource: `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
    MetadataDirective: "REPLACE",
    Metadata: metadata,
    ContentType: current.ContentType,
    CacheControl: current.CacheControl,
    ContentDisposition: current.ContentDisposition,
    ContentEncoding: current.ContentEncoding,
    ContentLanguage: current.ContentLanguage,
    Expires: current.Expires,
  }));
}

export async function deleteR2Object(key: string): Promise<void> {
  const boundBucket = workerR2Bucket();
  if (boundBucket) {
    await boundBucket.delete(key);
    return;
  }

  await getR2Client().send(new DeleteObjectCommand({ Bucket: r2BucketName(), Key: key }));
}

export function r2MulterStorage(makeFilename: (originalName: string) => string): StorageEngine {
  return {
    _handleFile(_req, file, callback) {
      if (!isR2Configured) {
        callback(new Error("Cloudflare R2 is not configured for direct file uploads"));
        return;
      }
      const key = makeFilename(file.originalname);
      const chunks: Buffer[] = [];
      let size = 0;
      file.stream.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        size += buffer.length;
      });
      file.stream.once("error", callback);
      file.stream.once("end", () => {
        void uploadR2Object(`app-uploads/${key}`, Buffer.concat(chunks), file.mimetype || "application/octet-stream")
          .then(() => callback(null, { destination: "r2", filename: key, path: `r2://app-uploads/${key}`, size }))
          .catch(callback);
      });
    },
    _removeFile(_req, file, callback) {
      void deleteR2Object(`app-uploads/${file.filename}`)
        .then(() => callback(null))
        .catch(callback);
    },
  };
}

export function uniqueUploadName(prefix: string, originalName: string): string {
  const extension = originalName.match(/\.[A-Za-z0-9]{1,12}$/)?.[0]?.toLowerCase() || "";
  return `${prefix}${randomUUID()}${extension}`;
}
