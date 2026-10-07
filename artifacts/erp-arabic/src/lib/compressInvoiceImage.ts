const MAX_IMAGE_DIMENSION = 2400;
const JPEG_QUALITY = 0.9;

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/")
    || /\.(?:jpe?g|png|webp|avif|heic|heif|bmp|gif)$/i.test(file.name);
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Fall back to the browser image decoder for devices without bitmap support.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("أبعاد الصورة غير صالحة");
    }
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new Error("تعذر قراءة الصورة على هذا الجهاز؛ جرّب صورة بصيغة JPG أو PNG");
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("تعذر ضغط الصورة")),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/**
 * Shrinks oversized driver invoice photos and re-encodes them as broadly
 * supported JPEGs. PDFs are returned untouched, and already-smaller images
 * are kept as-is when recompression would increase their size.
 */
export async function compressInvoiceImage(file: File): Promise<File> {
  if (!isImageFile(file)) return file;

  const decoded = await decodeImage(file);
  const canvas = document.createElement("canvas");
  try {
    if (!decoded.width || !decoded.height) throw new Error("أبعاد الصورة غير صالحة");
    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(decoded.width, decoded.height),
    );
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز الصورة للضغط");

    // JPEG has no alpha channel; use a white background for transparent sources.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    const compressed = await canvasToJpeg(canvas);
    if (compressed.size >= file.size) return file;

    const originalName = file.name.replace(/\.[^./\\]+$/, "") || "فاتورة-تحميل";
    return new File([compressed], `${originalName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    decoded.dispose();
    canvas.width = 0;
    canvas.height = 0;
  }
}