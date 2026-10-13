import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageEngine } from "multer";
import { randomUUID } from "node:crypto";

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.replace(/[\u0000-\u001f\u007f]/g, "").trim();

export const isR2Configured = Boolean(accountId && bucket && accessKeyId && secretAccessKey);

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

export async function createR2UploadUrl(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(getR2Client(), new PutObjectCommand({ Bucket: r2BucketName(), Key: key }), { expiresIn });
}

export async function uploadR2Object(key: string, body: Buffer, contentType: string, cacheControl?: string): Promise<void> {
  await getR2Client().send(new PutObjectCommand({
    Bucket: r2BucketName(), Key: key, Body: body, ContentType: contentType,
    ...(cacheControl ? { CacheControl: cacheControl } : {}),
  }));
}

export async function getR2Object(key: string) {
  try {
    return await getR2Client().send(new GetObjectCommand({ Bucket: r2BucketName(), Key: key }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function headR2Object(key: string) {
  try {
    return await getR2Client().send(new HeadObjectCommand({ Bucket: r2BucketName(), Key: key }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function deleteR2Object(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: r2BucketName(), Key: key }));
}

export function r2MulterStorage(makeFilename: (originalName: string) => string): StorageEngine {
  return {
    _handleFile(_req, file, callback) {
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
