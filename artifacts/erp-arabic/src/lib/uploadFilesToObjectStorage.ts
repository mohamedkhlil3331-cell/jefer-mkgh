export interface UploadedObjectFile {
  url: string;
  file_name: string;
}

async function uploadOne(file: File, token?: string): Promise<UploadedObjectFile> {
  const response = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `تعذر تجهيز رفع الملف «${file.name}»`);
  }

  const { uploadURL, objectPath } = await response.json() as {
    uploadURL: string;
    objectPath: string;
  };
  if (!uploadURL || !objectPath?.startsWith("/objects/")) {
    throw new Error(`استجابة رفع غير صالحة للملف «${file.name}»`);
  }

  const uploaded = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!uploaded.ok) throw new Error(`تعذر رفع الملف «${file.name}»`);

  return { url: `/api/storage${objectPath}`, file_name: file.name };
}

export function uploadFilesToObjectStorage(files: File[], token?: string): Promise<UploadedObjectFile[]> {
  return Promise.all(files.map(file => uploadOne(file, token)));
}