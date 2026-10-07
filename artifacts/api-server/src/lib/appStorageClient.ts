import { Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export interface AppStorageRoot {
  label: string;
  bucketName: string;
  prefix: string;
  archivePrefix: string;
}

export const appStorageClient = new Storage({
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

export function getConfiguredAppStorageRoots(): AppStorageRoot[] {
  const roots: AppStorageRoot[] = [];
  const seen = new Set<string>();

  const addRoot = (rawPath: string, label: string, archivePrefix: string) => {
    const normalized = rawPath.trim().replace(/^\/+|\/+$/g, "");
    const [bucketName, ...pathParts] = normalized.split("/");
    if (!bucketName) {
      throw new Error(`مسار App Storage غير صالح (${label}).`);
    }

    const rawPrefix = pathParts.join("/");
    const prefix = rawPrefix ? `${rawPrefix}/` : "";
    const key = `${bucketName}\0${prefix}`;
    if (seen.has(key)) return;

    seen.add(key);
    roots.push({ label, bucketName, prefix, archivePrefix });
  };

  const privateDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (privateDir) addRoot(privateDir, "private", "app-storage/private");

  const publicPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];

  publicPaths.forEach((value, index) => {
    addRoot(value, `public-${index + 1}`, `app-storage/public-${index + 1}`);
  });

  if (roots.length === 0) {
    throw new Error("مسارات App Storage غير مضبوطة؛ تعذر تحديد الملفات المراد تصديرها.");
  }

  return roots;
}
