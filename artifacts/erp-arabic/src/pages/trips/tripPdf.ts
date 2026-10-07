import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

export type TripPdfDetails = {
  id: number;
  date?: string | null;
  invoiceNumber?: string | null;
  loading?: string | null;
  unloading?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  cargoSummary?: string | null;
  images: Array<{ url: string; label: string }>;
  attachmentWarnings?: string[];
};

type EmbeddedImage = { label: string; dataUrl: string };
export type TripPdfResult = { blob: Blob; warnings: string[] };

function wrapCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function validateImageDataUrl(dataUrl: string, label: string): Promise<void> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`تعذر قراءة صورة المرفق «${label}»`));
    image.src = dataUrl;
  });
}

async function embedImage(url: string, label: string): Promise<string[]> {
  const storageRoute = url.startsWith("/objects/")
    ? `/api/storage/objects/${url.slice("/objects/".length)}`
    : url;
  const resolved = new URL(storageRoute, window.location.origin);
  const headers = resolved.origin === window.location.origin
    ? { Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` }
    : undefined;
  const response = await fetch(resolved.href, { headers, credentials: "same-origin" });
  if (!response.ok) throw new Error(`تعذر تحميل المرفق «${label}» (${response.status}). تحقق من صلاحية الملف ثم أعد المحاولة.`);
  const blob = await response.blob();
  if (blob.type.startsWith("image/")) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("تعذر قراءة صورة مرفقة"));
      reader.onerror = () => reject(new Error("تعذر قراءة صورة مرفقة"));
      reader.readAsDataURL(blob);
    });
    return [dataUrl];
  }

  const bytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  const pdfSignature = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  if (blob.type === "application/pdf" || pdfSignature) return renderPdfAttachment(blob, label);
  throw new Error(`صيغة المرفق «${label}» غير مدعومة. أرفق صورة أو ملف PDF صالحاً ثم أعد المحاولة.`);
}

async function renderPdfAttachment(blob: Blob, label: string): Promise<string[]> {
  let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
  try {
    loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
    const document = await loadingTask.promise;
    const renderedPages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(1.5, 1200 / baseViewport.width) });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("تعذر إنشاء صفحة لصورة PDF");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      renderedPages.push(canvas.toDataURL("image/jpeg", 0.94));
      page.cleanup();
    }
    if (!renderedPages.length) throw new Error("لا يحتوي ملف PDF على صفحات");
    return renderedPages;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "تعذر قراءة الملف";
    throw new Error(`تعذر تضمين ملف PDF «${label}»: ${detail}. أعد رفع ملف PDF سليم أو حوّله إلى صور.`);
  } finally {
    await loadingTask?.destroy();
  }
}

async function renderTripCanvas(
  details: TripPdfDetails,
  images: EmbeddedImage[],
  warnings: string[],
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر إنشاء صفحة PDF");

  // Draw directly on the canvas: an SVG with foreignObject can taint it even
  // when every attachment has already been loaded as a data URL.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.direction = "rtl";
  context.textAlign = "right";
  const sliceHeight = Math.floor(width * 841.89 / 595.28);
  const text = (value: string, x: number, y: number, size: number, color: string, bold = false, maxWidth?: number) => {
    context.font = `${bold ? "bold " : ""}${size}px Arial, sans-serif`;
    context.fillStyle = color;
    context.fillText(value, x, y, maxWidth);
  };

  text("تفاصيل الرحلة", width - 50, 92, 32, "#103c68", true);
  text(`رقم الرحلة: ${details.id}`, width - 50, 127, 18, "#64748b");
  context.fillStyle = "#103c68";
  context.fillRect(50, 157, width - 100, 4);

  context.fillStyle = "#f1f5f9";
  context.fillRect(50, 185, width - 100, 345);
  const fields = [
    ["التاريخ", details.date],
    ["رقم الفاتورة", details.invoiceNumber],
    ["منطقة التحميل", details.loading],
    ["منطقة التنزيل", details.unloading],
    ["اسم السائق", details.driverName],
    ["جوال السائق", details.driverPhone],
    ["الحمولة", details.cargoSummary],
  ] as const;
  fields.forEach(([label, value], index) => {
    text(`${label}: ${value || "—"}`, width - 78, 225 + index * 43, 21, "#0f172a", false, width - 155);
  });
  text(`مرفقات الرحلة (${images.length})`, width - 50, 590, 23, "#103c68", true);
  if (!images.length) text("لا توجد صور مرفقة لهذه الرحلة", width - 50, 635, 19, "#64748b");

  for (const [index, attachment] of images.entries()) {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`تعذر عرض المرفق «${attachment.label}» في PDF`));
      image.src = attachment.dataUrl;
    });
    let x: number;
    let y: number;
    if (index < 6) {
      x = index % 2 === 0 ? 610 : 60;
      y = 620 + Math.floor(index / 2) * 365;
    } else {
      const continuedIndex = index - 6;
      const continuedPage = 1 + Math.floor(continuedIndex / 8);
      const positionOnPage = continuedIndex % 8;
      const pageTop = continuedPage * sliceHeight;
      if (positionOnPage === 0) {
        text("مرفقات الرحلة — تابع", width - 50, pageTop + 92, 28, "#103c68", true);
        text(`رقم الرحلة: ${details.id}`, width - 50, pageTop + 127, 18, "#64748b");
        context.fillStyle = "#103c68";
        context.fillRect(50, pageTop + 157, width - 100, 4);
      }
      x = positionOnPage % 2 === 0 ? 610 : 60;
      y = pageTop + 185 + Math.floor(positionOnPage / 2) * 365;
    }
    const cardWidth = 530;
    context.fillStyle = "#f8fafc";
    context.fillRect(x, y, cardWidth, 330);
    context.strokeStyle = "#cbd5e1";
    context.strokeRect(x, y, cardWidth, 330);
    text(attachment.label, x + cardWidth - 15, y + 32, 18, "#103c68", true, cardWidth - 30);
    const scale = Math.min(500 / image.naturalWidth, 270 / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    context.drawImage(image, x + (cardWidth - imageWidth) / 2, y + 48 + (270 - imageHeight) / 2, imageWidth, imageHeight);
  }

  if (warnings.length) {
    const attachmentPageCount = Math.max(1, 1 + Math.ceil(Math.max(0, images.length - 6) / 8));
    const warningsPerPage = 8;
    warnings.forEach((warning, index) => {
      const warningPage = attachmentPageCount + Math.floor(index / warningsPerPage);
      const pageTop = warningPage * sliceHeight;
      const positionOnPage = index % warningsPerPage;
      if (positionOnPage === 0) {
        text("مرفقات تعذّر تضمينها", width - 50, pageTop + 92, 28, "#b45309", true);
        text(`رقم الرحلة: ${details.id}`, width - 50, pageTop + 127, 18, "#64748b");
        context.fillStyle = "#b45309";
        context.fillRect(50, pageTop + 157, width - 100, 4);
      }
      const y = pageTop + 190 + positionOnPage * 180;
      context.fillStyle = "#fff7ed";
      context.strokeStyle = "#fed7aa";
      context.fillRect(60, y, width - 120, 150);
      context.strokeRect(60, y, width - 120, 150);
      context.font = "19px Arial, sans-serif";
      const lines = wrapCanvasText(context, `${index + 1}. ${warning}`, width - 160).slice(0, 4);
      lines.forEach((line, lineIndex) => {
        text(line, width - 82, y + 37 + lineIndex * 29, 19, "#7c2d12", false, width - 160);
      });
    });
  }
  return canvas;
}

async function canvasToPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const sliceHeight = Math.floor(canvas.width * pageHeight / pageWidth);
  const pages: Array<{ bytes: Uint8Array; width: number; height: number }> = [];
  for (let y = 0; y < canvas.height; y += sliceHeight) {
    const page = document.createElement("canvas");
    page.width = canvas.width;
    page.height = sliceHeight;
    const context = page.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز صفحات PDF");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, page.width, page.height);
    context.drawImage(canvas, 0, y, canvas.width, Math.min(sliceHeight, canvas.height - y), 0, 0, page.width, Math.min(sliceHeight, canvas.height - y));
    const jpeg = await new Promise<Blob | null>(resolve => page.toBlob(resolve, "image/jpeg", 0.94));
    if (!jpeg) throw new Error("تعذر حفظ صفحات PDF");
    pages.push({ bytes: new Uint8Array(await jpeg.arrayBuffer()), width: page.width, height: page.height });
  }

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const append = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    parts.push(bytes);
    length += bytes.byteLength;
  };
  const startObject = (id: number) => { offsets[id] = length; append(`${id} 0 obj\n`); };
  const pageObjects = pages.map((_, index) => 3 + index * 3);
  const objectCount = 2 + pages.length * 3;
  append("%PDF-1.4\n");
  startObject(1); append("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject(2); append(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjects.map(id => `${id} 0 R`).join(" ")}] >>\nendobj\n`);
  pages.forEach((page, index) => {
    const pageId = pageObjects[index];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const command = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
    startObject(pageId);
    append(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    startObject(contentId);
    append(`<< /Length ${encoder.encode(command).byteLength} >>\nstream\n${command}endstream\nendobj\n`);
    startObject(imageId);
    append(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.byteLength} >>\nstream\n`);
    append(page.bytes); append("\nendstream\nendobj\n");
  });
  const xrefOffset = length;
  append(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id++) append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(parts.map(part => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer), { type: "application/pdf" });
}

export async function createTripPdf(details: TripPdfDetails): Promise<TripPdfResult> {
  const warnings = [...(details.attachmentWarnings ?? [])];
  const embeddedAttachments = await Promise.all(details.images.map(async attachment => {
    try {
      const dataUrls = await embedImage(attachment.url, attachment.label);
      await Promise.all(dataUrls.map(dataUrl => validateImageDataUrl(dataUrl, attachment.label)));
      return { attachment, dataUrls, warning: null };
    } catch (error) {
      return {
        attachment,
        dataUrls: [] as string[],
        warning: error instanceof Error ? error.message : `تعذر تحميل المرفق «${attachment.label}»`,
      };
    }
  }));
  const images = embeddedAttachments.flatMap(item => {
    if (item.warning) warnings.push(item.warning);
    return item.dataUrls.map((dataUrl, index) => ({
      label: item.dataUrls.length > 1 ? `${item.attachment.label} — الصفحة ${index + 1}` : item.attachment.label,
      dataUrl,
    }));
  });
  const width = 1200;
  const sliceHeight = Math.floor(width * 841.89 / 595.28);
  const attachmentPageCount = Math.max(1, 1 + Math.ceil(Math.max(0, images.length - 6) / 8));
  const warningsPageCount = Math.ceil(warnings.length / 8);
  const height = (attachmentPageCount + warningsPageCount) * sliceHeight;
  const canvas = await renderTripCanvas(details, images, warnings, width, height);
  return { blob: await canvasToPdf(canvas), warnings };
}