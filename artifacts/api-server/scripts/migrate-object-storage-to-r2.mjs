import { Storage } from "@google-cloud/storage";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";

const R2_OBJECT_PREFIX = "app-objects/";
const LEGACY_UPLOAD_PREFIX = "legacy-uploads/";
const R2_LEGACY_UPLOAD_PREFIX = "app-uploads/";
const SIDECAR = "http://127.0.0.1:1106";
const APPLY = process.argv.includes("--apply");
const DRY_RUN = process.argv.includes("--dry-run") || !APPLY;

if (APPLY && process.argv.includes("--dry-run")) {
  throw new Error("Choose either --apply or --dry-run");
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable ${name} is not configured`);
  return value;
}

function makeGcsClient() {
  return new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${SIDECAR}/token`,
      type: "external_account",
      credential_source: {
        url: `${SIDECAR}/credential`,
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
}

function makeR2Client() {
  const accountId = requiredEnv("CLOUDFLARE_R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

function parseStorageRoot(root) {
  const [bucketName, ...parts] = root.replace(/^\/+/, "").split("/");
  const prefix = parts.join("/");
  if (!bucketName || !prefix || prefix.startsWith("gs://")) {
    throw new Error("Configured object storage path must contain a bucket and a non-empty prefix");
  }
  return { bucketName, prefix };
}

function normalizedMd5(file) {
  const base64 = file.metadata?.md5Hash;
  if (typeof base64 !== "string" || !base64) return null;
  return Buffer.from(base64, "base64").toString("hex").toLowerCase();
}

function r2Metadata(gcsMetadata, md5Hex) {
  const metadata = {};
  for (const [rawKey, rawValue] of Object.entries(gcsMetadata.metadata ?? {})) {
    const key = rawKey === "custom:aclPolicy" ? "custom-acl-policy" : rawKey.toLowerCase();
    const value = String(rawValue);
    if (!/^[a-z0-9-]+$/.test(key) || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error("A source object's custom metadata cannot be represented safely in R2");
    }
    metadata[key] = value;
  }
  metadata["gcs-md5"] = md5Hex;
  return metadata;
}

async function listGcsPrefix(client, bucketName, prefix, keyForFile, sources) {
  const bucket = client.bucket(bucketName);
  let pageToken;
  do {
    const [files, nextQuery] = await bucket.getFiles({
      prefix,
      maxResults: 500,
      pageToken,
      autoPaginate: false,
    });
    for (const file of files) {
      if (file.name.endsWith("/")) continue;
      const key = keyForFile(file.name);
      if (!key || key.startsWith("/") || key.split("/").some(part => part === "..")) {
        throw new Error("A source object has an invalid destination key");
      }
      const size = Number(file.metadata?.size);
      const md5Hex = normalizedMd5(file);
      if (
        !Number.isSafeInteger(size)
        || size < 0
        || size > 5 * 1024 ** 3
        || !md5Hex
        || !/^[0-9a-f]{32}$/.test(md5Hex)
      ) {
        throw new Error("A source object is missing a safe size or MD5 checksum");
      }
      r2Metadata(file.metadata ?? {}, md5Hex);
      const previous = sources.get(key);
      if (previous && (previous.size !== size || previous.md5Hex !== md5Hex)) {
        throw new Error("Two source paths map to the same R2 key with different contents");
      }
      if (!previous) sources.set(key, { key, size, md5Hex, file });
    }
    pageToken = nextQuery?.pageToken;
  } while (pageToken);
}

async function listSources(gcs) {
  const sources = new Map();
  const publicRoots = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const privateRoot = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!publicRoots.length || !privateRoot) {
    throw new Error("PUBLIC_OBJECT_SEARCH_PATHS and PRIVATE_OBJECT_DIR must be configured");
  }

  for (const root of publicRoots) {
    const { bucketName, prefix } = parseStorageRoot(root);
    await listGcsPrefix(gcs, bucketName, prefix, name => `${R2_OBJECT_PREFIX}${name}`, sources);
  }

  const { bucketName: privateBucket, prefix: privatePrefix } = parseStorageRoot(privateRoot);
  await listGcsPrefix(
    gcs,
    privateBucket,
    privatePrefix,
    name => {
      if (name === privatePrefix) return "";
      if (!name.startsWith(`${privatePrefix}/`)) {
        throw new Error("A private source object is outside its configured storage directory");
      }
      return `${R2_OBJECT_PREFIX}${name.slice(privatePrefix.length + 1)}`;
    },
    sources,
  );

  const legacyBucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim();
  if (legacyBucket) {
    await listGcsPrefix(
      gcs,
      legacyBucket,
      LEGACY_UPLOAD_PREFIX,
      name => `${R2_LEGACY_UPLOAD_PREFIX}${name.slice(LEGACY_UPLOAD_PREFIX.length)}`,
      sources,
    );
  }
  return [...sources.values()];
}

async function listR2Targets(client, bucket) {
  const targets = new Map();
  for (const prefix of [R2_OBJECT_PREFIX, R2_LEGACY_UPLOAD_PREFIX]) {
    let continuationToken;
    do {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      for (const object of page.Contents ?? []) {
        if (!object.Key || object.Key.endsWith("/")) continue;
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: object.Key }));
        targets.set(object.Key, {
          size: Number(head.ContentLength ?? 0),
          etag: (head.ETag ?? "").replaceAll("\"", "").toLowerCase(),
          md5Hex: head.Metadata?.["gcs-md5"]?.toLowerCase() ?? null,
        });
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
  }
  return targets;
}

function compareSources(sources, targets) {
  const result = { sourceObjects: sources.length, sourceBytes: 0, alreadyVerified: 0, toCopy: 0, conflicts: 0 };
  for (const source of sources) {
    result.sourceBytes += source.size;
    const target = targets.get(source.key);
    if (!target) {
      result.toCopy++;
      continue;
    }
    if (
      target.size === source.size
      && (target.md5Hex === source.md5Hex || target.etag === source.md5Hex)
    ) {
      result.alreadyVerified++;
    } else {
      result.conflicts++;
    }
  }
  return result;
}

async function copySource(client, bucket, source) {
  const digest = createHash("md5");
  let bytes = 0;
  const hashingStream = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      digest.update(chunk);
      callback(null, chunk);
    },
  });
  const body = source.file.createReadStream().pipe(hashingStream);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: source.key,
    Body: body,
    ContentLength: source.size,
    ContentType: source.file.metadata?.contentType || "application/octet-stream",
    CacheControl: source.file.metadata?.cacheControl,
    ContentDisposition: source.file.metadata?.contentDisposition,
    ContentEncoding: source.file.metadata?.contentEncoding,
    ContentLanguage: source.file.metadata?.contentLanguage,
    Metadata: r2Metadata(source.file.metadata ?? {}, source.md5Hex),
  }));
  const uploadedMd5 = digest.digest("hex").toLowerCase();
  if (bytes !== source.size || uploadedMd5 !== source.md5Hex) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: source.key }));
    throw new Error("A streamed source object failed size or MD5 verification; its incomplete R2 copy was removed");
  }
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: source.key }));
  if (
    Number(head.ContentLength) !== source.size
    || head.Metadata?.["gcs-md5"]?.toLowerCase() !== source.md5Hex
  ) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: source.key }));
    throw new Error("An uploaded R2 object failed metadata verification; its copy was removed");
  }
}

async function run() {
  if (process.argv.slice(2).some(argument => !["--apply", "--dry-run"].includes(argument))) {
    throw new Error("Use only --dry-run or --apply");
  }
  const bucket = requiredEnv("CLOUDFLARE_R2_BUCKET_NAME");
  const gcs = makeGcsClient();
  const r2 = makeR2Client();
  const sources = await listSources(gcs);
  const targets = await listR2Targets(r2, bucket);
  const summary = compareSources(sources, targets);
  console.info(JSON.stringify({ mode: DRY_RUN ? "dry-run" : "apply", ...summary }));
  if (summary.conflicts) {
    throw new Error("Object migration stopped before copying because existing R2 keys do not match their source objects");
  }
  if (DRY_RUN) return;

  let copied = 0;
  for (const source of sources) {
    const target = targets.get(source.key);
    if (target && (target.md5Hex === source.md5Hex || target.etag === source.md5Hex)) continue;
    await copySource(r2, bucket, source);
    targets.set(source.key, { size: source.size, etag: source.md5Hex, md5Hex: source.md5Hex });
    copied++;
    if (copied % 25 === 0 || copied === summary.toCopy) {
      console.info(`Verified ${copied}/${summary.toCopy} R2 file copy/copies`);
    }
  }
  console.info(JSON.stringify({ status: "completed", copied, preservedSourceObjects: true }));
}

run().catch(error => {
  console.error(`Object storage migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
