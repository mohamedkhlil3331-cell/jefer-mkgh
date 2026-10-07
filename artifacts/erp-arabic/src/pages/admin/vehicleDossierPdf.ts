import { jsPDF } from "jspdf";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

export type VehicleDossierDoc = {
  doc_type?: string;
  start_date?: string | null;
  end_date?: string | null;
  image_url?: string | null;
  notes?: string | null;
  created_at?: string;
};

export type VehicleDossierImage = {
  angle?: string;
  image_url?: string;
  created_at?: string;
};

export type VehicleDossierPerson = Record<string, unknown> & {
  driver_name?: string | null;
  phone?: string | null;
};

export type VehicleDossierVehicle = Record<string, unknown> & {
  plate_number: string;
  vehicle_name?: string | null;
  vehicle_type?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  backup_driver_name?: string | null;
  backup_driver_phone?: string | null;
};

export type VehicleDossierInput = {
  vehicle: VehicleDossierVehicle;
  vehicleDocs: VehicleDossierDoc[];
  vehicleImages: VehicleDossierImage[];
  drivers: VehicleDossierPerson[];
};

type Attachment = { label: string; url: string };
type PdfPageCanvas = HTMLCanvasElement;

const PAGE_WIDTH = 1200;
const PAGE_HEIGHT = 1697;
const BRAND = "#103c68";
const ACCENT = "#0eb5cb";

const STATUS_LABELS: Record<string, string> = {
  available: "متاحة",
  on_trip: "في رحلة",
  busy: "في رحلة",
  maintenance: "في الصيانة",
  inactive: "متوقفة",
  "نشط": "نشط",
  "في رحلة": "في رحلة",
  "إجازة": "إجازة",
  "موقوف": "موقوف",
};

const FIELD_LABELS: Record<string, string> = {
  insurance_image: "وثيقة تأمين السيارة",
  inspection_image: "وثيقة الفحص الدوري",
  operation_card_image: "كرت تشغيل السيارة",
  registration_image: "استمارة السيارة",
  registration_url: "استمارة السيارة",
  vehicle_registration_url: "استمارة السيارة",
  photo_url: "صورة السائق",
  fingerprint_url: "بصمة السائق",
  signature_url: "توقيع السائق",
  license_url: "رخصة القيادة",
  operation_card_url: "بطاقة تشغيل السائق",
  driver_card_url: "بطاقة السائق",
  insurance_url: "تأمين السائق",
  iqama_image_url: "صورة الإقامة",
  iqama_pdf_url: "ملف الإقامة PDF",
  delegated_form_image_url: "صورة الاستمارة المفوضة",
  delegated_form_pdf_url: "ملف الاستمارة المفوضة PDF",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  insurance: "التأمين",
  inspection: "الفحص الدوري",
  operation_card: "كرت التشغيل",
  registration: "الاستمارة",
};

const ANGLE_LABELS: Record<string, string> = {
  front: "أمامية",
  back: "خلفية",
  left: "الجانب الأيسر",
  right: "الجانب الأيمن",
  interior: "داخلية",
  other: "أخرى",
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "number") return value.toLocaleString("ar-SA");
  return String(value).trim();
}

function normalizeName(value: unknown): string {
  return displayValue(value).replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizePhone(value: unknown): string {
  return displayValue(value).replace(/[^\d+]/g, "");
}

function resolveDriver(
  name: unknown,
  phone: unknown,
  drivers: VehicleDossierPerson[],
): VehicleDossierPerson | null {
  const wantedPhone = normalizePhone(phone);
  const wantedName = normalizeName(name);
  const match = (wantedPhone && drivers.find(driver => normalizePhone(driver.phone) === wantedPhone))
    || (wantedName && drivers.find(driver => normalizeName(driver.driver_name) === wantedName));
  if (match) return match;
  if (wantedName || wantedPhone) {
    return {
      driver_name: displayValue(name) || null,
      phone: displayValue(phone) || null,
    };
  }
  return null;
}

function statusLabel(value: unknown): string {
  const text = displayValue(value);
  return STATUS_LABELS[text] || text;
}

function drawText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  bold = false,
  maxWidth?: number,
) {
  context.direction = "rtl";
  context.textAlign = "right";
  context.textBaseline = "alphabetic";
  context.font = `${bold ? "bold " : ""}${size}px Arial, sans-serif`;
  context.fillStyle = color;
  context.fillText(value, x, y, maxWidth);
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
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
  return lines;
}

function newPageCanvas(): PdfPageCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر إنشاء صفحة PDF");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  return canvas;
}

function drawPageHeader(context: CanvasRenderingContext2D, title: string, subtitle: string) {
  context.fillStyle = BRAND;
  context.fillRect(0, 0, PAGE_WIDTH, 205);
  context.fillStyle = ACCENT;
  context.fillRect(0, 197, PAGE_WIDTH, 8);
  drawText(context, title, PAGE_WIDTH - 72, 92, 38, "#ffffff", true, PAGE_WIDTH - 144);
  drawText(context, subtitle, PAGE_WIDTH - 74, 145, 21, "#dbeafe", false, PAGE_WIDTH - 148);
}

function drawSection(
  context: CanvasRenderingContext2D,
  title: string,
  rows: Array<[string, string]>,
  top: number,
): number {
  if (rows.length === 0) return top;
  const labelWidth = 225;
  const valueWidth = 710;
  const rowHeights = rows.map(([, value]) => {
    context.font = "20px Arial, sans-serif";
    return Math.max(52, wrapText(context, value, valueWidth).length * 27 + 24);
  });
  const bodyHeight = rowHeights.reduce((sum, height) => sum + height, 0);
  const sectionHeight = 58 + bodyHeight;

  context.fillStyle = "#f8fafc";
  context.fillRect(55, top, PAGE_WIDTH - 110, sectionHeight);
  context.strokeStyle = "#dbe4ee";
  context.lineWidth = 2;
  context.strokeRect(55, top, PAGE_WIDTH - 110, sectionHeight);
  context.fillStyle = BRAND;
  context.fillRect(55, top, PAGE_WIDTH - 110, 58);
  drawText(context, title, PAGE_WIDTH - 85, top + 38, 24, "#ffffff", true);

  let rowTop = top + 58;
  rows.forEach(([label, value], index) => {
    const rowHeight = rowHeights[index];
    if (index > 0) {
      context.strokeStyle = "#e2e8f0";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(82, rowTop);
      context.lineTo(PAGE_WIDTH - 82, rowTop);
      context.stroke();
    }
    drawText(context, label, PAGE_WIDTH - 88, rowTop + 34, 18, "#64748b", true, labelWidth);
    context.font = "20px Arial, sans-serif";
    const lines = wrapText(context, value, valueWidth);
    lines.forEach((line, lineIndex) => {
      drawText(context, line, PAGE_WIDTH - 340, rowTop + 34 + lineIndex * 27, 20, "#0f172a", false, valueWidth);
    });
    rowTop += rowHeight;
  });
  return top + sectionHeight + 24;
}

function vehicleRows(vehicle: VehicleDossierVehicle, attachmentCount: number): Array<[string, string]> {
  const typeAssignments = Array.isArray(vehicle.types)
    ? (vehicle.types as Array<{ type_name?: string; is_primary?: number }>).map(type =>
        `${type.is_primary ? "★ " : ""}${displayValue(type.type_name)}`).filter(Boolean).join("، ")
    : "";
  const linkedTeidarat = Array.isArray(vehicle.linked_teidarat)
    ? (vehicle.linked_teidarat as Array<{ teidara_number?: string; seq_no?: number; teidara_type?: string; category?: string }>)
        .map(item => {
          const number = displayValue(item.teidara_number || item.seq_no);
          const type = displayValue(item.teidara_type || item.category);
          return number ? `${number}${type ? ` (${type})` : ""}` : type;
        })
        .filter(Boolean)
        .join("، ")
    : "";
  const rows: Array<[string, string]> = [
    ["رقم السيارة", displayValue(vehicle.plate_number)],
    ["اسم السيارة", displayValue(vehicle.vehicle_name)],
    ["النوع", typeAssignments || displayValue(vehicle.vehicle_type)],
    ["الجهة", displayValue(vehicle.entity)],
    ["الفرع", displayValue(vehicle.branch)],
    ["الحالة", statusLabel(vehicle.status)],
    ["نوع التجهيز", displayValue(vehicle.equipment_type)],
    ["الفئة", displayValue(vehicle.vehicle_category)],
    ["النوع الفرعي", displayValue(vehicle.vehicle_subtype)],
    ["الوزن فارغة", vehicle.empty_weight_kg ? `${displayValue(vehicle.empty_weight_kg)} كجم` : ""],
    ["الحمولة القصوى", vehicle.max_weight_kg ? `${displayValue(vehicle.max_weight_kg)} كجم` : ""],
    ["السعة", vehicle.load_capacity_tons ? `${displayValue(vehicle.load_capacity_tons)} طن` : ""],
    ["رقم المقطورة المرتبطة", displayValue(vehicle.linked_trailer_number)],
    ["نوع المقطورة المرتبطة", displayValue(vehicle.linked_trailer_type)],
    ["التجهيز الافتراضي للمقطورة", displayValue(vehicle.linked_trailer_default)],
    ["التيدارات المرتبطة", linkedTeidarat],
    ["السائق الأساسي", displayValue(vehicle.driver_name)],
    ["جوال السائق الأساسي", displayValue(vehicle.driver_phone)],
    ["السائق الاحتياطي", displayValue(vehicle.backup_driver_name)],
    ["جوال السائق الاحتياطي", displayValue(vehicle.backup_driver_phone)],
    ["عدد المرفقات", displayValue(attachmentCount)],
    ["ملاحظات", displayValue(vehicle.notes)],
  ];
  return rows.filter(([, value]) => value !== "");
}

function driverRows(driver: VehicleDossierPerson): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["اسم السائق", displayValue(driver.driver_name)],
    ["رقم الجوال", displayValue(driver.phone)],
    ["الفرع", displayValue(driver.branch)],
    ["البريد الإلكتروني", displayValue(driver.email)],
    ["الحالة", statusLabel(driver.status)],
    ["الراتب", driver.salary === null || driver.salary === undefined || driver.salary === ""
      ? ""
      : `${displayValue(driver.salary)} ر.س`],
    ["انتهاء رخصة القيادة", displayValue(driver.license_expiry)],
    ["انتهاء بطاقة التشغيل", displayValue(driver.operation_card_expiry)],
    ["انتهاء الإقامة", displayValue(driver.iqama_expiry)],
    ["انتهاء الاستمارة المفوضة", displayValue(driver.delegated_form_expiry)],
    ["ملاحظات", displayValue(driver.notes)],
  ];
  return rows.filter(([, value]) => value !== "");
}

function makeVehicleSummaryPage(
  vehicle: VehicleDossierVehicle,
  attachmentCount: number,
): PdfPageCanvas {
  const canvas = newPageCanvas();
  const context = canvas.getContext("2d")!;
  const vehicleName = displayValue(vehicle.vehicle_name) || displayValue(vehicle.vehicle_type) || "سيارة";
  drawPageHeader(context, "ملف السيارة", `${vehicleName} · ${displayValue(vehicle.plate_number)}`);
  let top = 245;
  top = drawSection(context, "بيانات السيارة", vehicleRows(vehicle, attachmentCount), top);
  drawText(
    context,
    `تاريخ إنشاء الملف: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date())}`,
    PAGE_WIDTH - 85,
    Math.min(top + 6, PAGE_HEIGHT - 45),
    17,
    "#64748b",
  );
  return canvas;
}

function makeVehicleDocumentPages(
  vehicle: VehicleDossierVehicle,
  docs: VehicleDossierDoc[],
): PdfPageCanvas[] {
  const rows: Array<[string, string]> = [];
  const directDocs = [
    { label: "التأمين", start: "insurance_start", end: "insurance_end", file: "insurance_image" },
    { label: "الفحص الدوري", start: "inspection_start", end: "inspection_end", file: "inspection_image" },
    { label: "كرت التشغيل", start: "operation_card_start", end: "operation_card_end", file: "operation_card_image" },
  ];
  for (const doc of directDocs) {
    const start = displayValue(vehicle[doc.start]);
    const end = displayValue(vehicle[doc.end]);
    const hasFile = !!displayValue(vehicle[doc.file]);
    if (!start && !end && !hasFile) continue;
    const details = [
      start && `البداية: ${start}`,
      end && `الانتهاء: ${end}`,
      hasFile ? "الملف مرفق" : "لا يوجد ملف مرفق",
    ].filter(Boolean).join(" · ");
    rows.push([doc.label, details]);
  }

  for (const doc of docs) {
    const type = displayValue(doc.doc_type);
    const label = DOC_TYPE_LABELS[type] || type.replace(/_/g, " ") || "وثيقة إضافية";
    const details = [
      doc.start_date && `البداية: ${displayValue(doc.start_date)}`,
      doc.end_date && `الانتهاء: ${displayValue(doc.end_date)}`,
      doc.created_at && `تاريخ الرفع: ${displayValue(doc.created_at)}`,
      doc.image_url ? "الملف مرفق" : "لا يوجد ملف مرفق",
      doc.notes && `ملاحظات: ${displayValue(doc.notes)}`,
    ].filter(Boolean).join(" · ");
    rows.push([label, details]);
  }

  const pages: PdfPageCanvas[] = [];
  const pageSize = 8;
  const pageCount = Math.ceil(rows.length / pageSize);
  for (let start = 0; start < rows.length; start += pageSize) {
    const pageNumber = Math.floor(start / pageSize) + 1;
    const canvas = newPageCanvas();
    const context = canvas.getContext("2d")!;
    drawPageHeader(
      context,
      "وثائق السيارة",
      pageCount > 1 ? `الصفحة ${pageNumber} من ${pageCount} · ${displayValue(vehicle.plate_number)}` : displayValue(vehicle.plate_number),
    );
    drawSection(context, "الوثائق المسجلة وتواريخها", rows.slice(start, start + pageSize), 245);
    pages.push(canvas);
  }
  return pages;
}

function makeDriverSummaryPage(
  driver: VehicleDossierPerson,
  role: string,
  vehicle: VehicleDossierVehicle,
): PdfPageCanvas {
  const canvas = newPageCanvas();
  const context = canvas.getContext("2d")!;
  const driverName = displayValue(driver.driver_name) || "بيانات السائق";
  drawPageHeader(context, role, `${driverName} · سيارة ${displayValue(vehicle.plate_number)}`);
  drawSection(context, "بيانات السائق من إدارة السائقين", driverRows(driver), 245);
  return canvas;
}

function buildVehicleAttachments(
  vehicle: VehicleDossierVehicle,
  docs: VehicleDossierDoc[],
  images: VehicleDossierImage[],
): Attachment[] {
  const attachments: Attachment[] = [];
  const add = (urlValue: unknown, label: string) => {
    const url = displayValue(urlValue);
    if (url) attachments.push({ url, label });
  };

  const directDocs = [
    { key: "insurance_image", label: "التأمين", start: "insurance_start", end: "insurance_end" },
    { key: "inspection_image", label: "الفحص الدوري", start: "inspection_start", end: "inspection_end" },
    { key: "operation_card_image", label: "كرت التشغيل", start: "operation_card_start", end: "operation_card_end" },
    { key: "registration_image", label: "استمارة السيارة", start: "registration_start", end: "registration_end" },
    { key: "registration_url", label: "استمارة السيارة", start: "registration_start", end: "registration_end" },
    { key: "vehicle_registration_url", label: "استمارة السيارة", start: "registration_start", end: "registration_end" },
  ];
  for (const doc of directDocs) {
    const start = displayValue(vehicle[doc.start]);
    const end = displayValue(vehicle[doc.end]);
    const dates = [start && `من ${start}`, end && `إلى ${end}`].filter(Boolean).join(" · ");
    add(vehicle[doc.key], `وثيقة السيارة — ${doc.label}${dates ? ` (${dates})` : ""}`);
  }

  for (const [field, value] of Object.entries(vehicle)) {
    if (typeof value !== "string" || !value.trim() || !/(?:_url|_image|_pdf)$/i.test(field)) continue;
    if (directDocs.some(doc => doc.key === field)) continue;
    const label = FIELD_LABELS[field] || `مرفق السيارة — ${field.replace(/_(?:url|image|pdf)$/i, "").replace(/_/g, " ")}`;
    add(value, label);
  }

  for (const doc of docs) {
    if (!doc.image_url) continue;
    const type = displayValue(doc.doc_type);
    const label = DOC_TYPE_LABELS[type] || type.replace(/_/g, " ") || "وثيقة السيارة";
    const dates = [
      doc.start_date && `من ${displayValue(doc.start_date)}`,
      doc.end_date && `إلى ${displayValue(doc.end_date)}`,
    ].filter(Boolean).join(" · ");
    const notes = displayValue(doc.notes);
    add(doc.image_url, `وثيقة السيارة — ${label}${dates ? ` (${dates})` : ""}${notes ? ` — ${notes}` : ""}`);
  }

  attachments.push(...buildVehiclePhotoAttachments(images));
  return dedupeAttachments(attachments);
}

function buildVehiclePhotoAttachments(images: VehicleDossierImage[]): Attachment[] {
  return images.filter(image => !!image.image_url).map(image => {
    const angle = ANGLE_LABELS[displayValue(image.angle)] || displayValue(image.angle) || "أخرى";
    const date = displayValue(image.created_at);
    return {
      url: displayValue(image.image_url),
      label: `صورة السيارة — ${angle}${date ? ` · ${date}` : ""}`,
    };
  });
}

function buildDriverAttachments(driver: VehicleDossierPerson, role: string): Attachment[] {
  const attachments: Attachment[] = [];
  for (const [field, value] of Object.entries(driver)) {
    if (typeof value !== "string" || !value.trim() || !/(?:_url|_image|_pdf)$/i.test(field)) continue;
    const label = FIELD_LABELS[field] || `مرفق السائق — ${field.replace(/_(?:url|image|pdf)$/i, "").replace(/_/g, " ")}`;
    const expiryField = field === "license_url"
      ? "license_expiry"
      : field === "operation_card_url"
        ? "operation_card_expiry"
        : field.startsWith("iqama_")
          ? "iqama_expiry"
          : field.startsWith("delegated_form_")
            ? "delegated_form_expiry"
            : "";
    const expiry = expiryField ? displayValue(driver[expiryField]) : "";
    attachments.push({
      url: value.trim(),
      label: `${role} — ${label}${expiry ? ` · الانتهاء ${expiry}` : ""}`,
    });
  }
  return attachments;
}

function dedupeAttachments(attachments: Attachment[]): Attachment[] {
  const seen = new Map<string, Attachment>();
  for (const attachment of attachments) {
    const existing = seen.get(attachment.url);
    if (existing) {
      if (!existing.label.includes(attachment.label)) existing.label = `${existing.label} / ${attachment.label}`;
    } else {
      seen.set(attachment.url, { ...attachment });
    }
  }
  return [...seen.values()];
}

function attachmentUrl(url: string): URL {
  const storageRoute = url.startsWith("/objects/")
    ? `/api/storage/objects/${url.slice("/objects/".length)}`
    : url;
  const resolved = new URL(storageRoute, window.location.origin);
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:" && resolved.protocol !== "data:") {
    throw new Error("رابط المرفق غير صالح");
  }
  return resolved;
}

async function fetchAttachmentBlob(url: string, label: string): Promise<Blob> {
  let resolved: URL;
  try {
    resolved = attachmentUrl(url);
  } catch {
    throw new Error(`رابط المرفق «${label}» غير صالح`);
  }
  const headers = resolved.origin === window.location.origin
    ? { Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` }
    : undefined;
  const response = await fetch(resolved.href, {
    headers,
    credentials: resolved.origin === window.location.origin ? "same-origin" : "omit",
  });
  if (!response.ok) {
    throw new Error(`تعذر تحميل المرفق «${label}» (${response.status})`);
  }
  return response.blob();
}

function createAttachmentPage(title: string, subtitle?: string): PdfPageCanvas {
  const canvas = newPageCanvas();
  const context = canvas.getContext("2d")!;
  context.fillStyle = BRAND;
  context.fillRect(0, 0, PAGE_WIDTH, 170);
  context.fillStyle = ACCENT;
  context.fillRect(0, 162, PAGE_WIDTH, 8);
  drawText(context, title, PAGE_WIDTH - 64, 76, 28, "#ffffff", true, PAGE_WIDTH - 128);
  if (subtitle) drawText(context, subtitle, PAGE_WIDTH - 66, 124, 18, "#dbeafe", false, PAGE_WIDTH - 132);
  context.strokeStyle = "#dbe4ee";
  context.lineWidth = 2;
  context.strokeRect(42, 195, PAGE_WIDTH - 84, PAGE_HEIGHT - 250);
  return canvas;
}

function drawContained(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    source,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/jpeg", 0.94);
  } catch {
    throw new Error("تعذر تجهيز صفحات PDF؛ أعد المحاولة أو تحقق من صلاحية الملفات");
  }
}

function appendCanvasPage(pdf: jsPDF, canvas: PdfPageCanvas, firstPage: boolean): void {
  if (!firstPage) pdf.addPage("a4", "portrait");
  pdf.addImage(canvasToDataUrl(canvas), "JPEG", 0, 0, 210, 297, undefined, "FAST");
}

async function appendImageAttachment(pdf: jsPDF, attachment: Attachment, blob: Blob, firstPage: boolean): Promise<boolean> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error(`تعذر عرض الصورة «${attachment.label}» داخل PDF؛ تحقق من سلامة الملف`);
  }
  const canvas = createAttachmentPage(attachment.label);
  const context = canvas.getContext("2d")!;
  drawContained(context, bitmap, bitmap.width, bitmap.height, 82, 225, PAGE_WIDTH - 164, PAGE_HEIGHT - 330);
  bitmap.close();
  appendCanvasPage(pdf, canvas, firstPage);
  return false;
}

async function appendPdfAttachment(pdf: jsPDF, attachment: Attachment, blob: Blob, firstPage: boolean): Promise<boolean> {
  let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
  let isFirstPage = firstPage;
  try {
    loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
    const sourcePdf = await loadingTask.promise;
    if (sourcePdf.numPages === 0) throw new Error("لا يحتوي الملف على صفحات");

    for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber++) {
      const sourcePage = await sourcePdf.getPage(pageNumber);
      const baseViewport = sourcePage.getViewport({ scale: 1 });
      const scale = Math.min(1.7, 1080 / baseViewport.width, 1360 / baseViewport.height);
      const viewport = sourcePage.getViewport({ scale });
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = Math.ceil(viewport.width);
      sourceCanvas.height = Math.ceil(viewport.height);
      const sourceContext = sourceCanvas.getContext("2d");
      if (!sourceContext) throw new Error("تعذر تجهيز صفحة من الملف");
      await sourcePage.render({
        canvas: sourceCanvas,
        canvasContext: sourceContext,
        viewport,
        background: "#ffffff",
      }).promise;

      const page = createAttachmentPage(
        attachment.label,
        sourcePdf.numPages > 1 ? `الصفحة ${pageNumber} من ${sourcePdf.numPages}` : undefined,
      );
      const context = page.getContext("2d")!;
      drawContained(context, sourceCanvas, sourceCanvas.width, sourceCanvas.height, 82, 210, PAGE_WIDTH - 164, PAGE_HEIGHT - 300);
      appendCanvasPage(pdf, page, isFirstPage);
      isFirstPage = false;
      sourcePage.cleanup();
      sourceCanvas.width = 0;
      sourceCanvas.height = 0;
    }
    return isFirstPage;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "تعذر قراءة الملف";
    throw new Error(`تعذر تضمين PDF «${attachment.label}»: ${detail}`);
  } finally {
    await loadingTask?.destroy();
  }
}

async function appendAttachment(pdf: jsPDF, attachment: Attachment, firstPage: boolean): Promise<boolean> {
  const blob = await fetchAttachmentBlob(attachment.url, attachment.label);
  const signature = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const isPdf = blob.type === "application/pdf"
    || (signature[0] === 0x25 && signature[1] === 0x50 && signature[2] === 0x44 && signature[3] === 0x46 && signature[4] === 0x2d);
  if (isPdf) return appendPdfAttachment(pdf, attachment, blob, firstPage);

  const isImage = blob.type.startsWith("image/")
    || (signature[0] === 0xff && signature[1] === 0xd8)
    || (signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47)
    || (signature[0] === 0x52 && signature[1] === 0x49 && signature[2] === 0x46 && signature[3] === 0x46
      && signature[8] === 0x57 && signature[9] === 0x45 && signature[10] === 0x42 && signature[11] === 0x50);
  if (isImage) return appendImageAttachment(pdf, attachment, blob, firstPage);
  throw new Error(`نوع المرفق «${attachment.label}» غير مدعوم؛ ارفع صورة أو PDF صالحاً`);
}

export async function createVehicleDossierPdf(input: VehicleDossierInput): Promise<Blob> {
  const { vehicle, vehicleDocs, vehicleImages, drivers } = input;
  const primaryDriver = resolveDriver(vehicle.driver_name, vehicle.driver_phone, drivers);
  const backupDriver = resolveDriver(vehicle.backup_driver_name, vehicle.backup_driver_phone, drivers);
  const linkedDrivers: Array<{ driver: VehicleDossierPerson; role: string }> = [];
  for (const entry of [
    { driver: primaryDriver, role: "السائق الأساسي" },
    { driver: backupDriver, role: "السائق الاحتياطي" },
  ]) {
    if (!entry.driver) continue;
    const duplicate = linkedDrivers.some(existing => {
      const samePhone = normalizePhone(existing.driver.phone)
        && normalizePhone(existing.driver.phone) === normalizePhone(entry.driver!.phone);
      const sameName = normalizeName(existing.driver.driver_name)
        && normalizeName(existing.driver.driver_name) === normalizeName(entry.driver!.driver_name);
      return !!samePhone || !!sameName;
    });
    if (!duplicate) linkedDrivers.push({ driver: entry.driver, role: entry.role });
  }

  const vehicleAttachments = [
    ...buildVehicleAttachments(vehicle, vehicleDocs, vehicleImages),
  ];
  const driverAttachments = linkedDrivers.flatMap(({ driver, role }) =>
    buildDriverAttachments(driver, role)
  );
  const attachments = dedupeAttachments([...vehicleAttachments, ...driverAttachments]);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  let firstPage = true;
  appendCanvasPage(pdf, makeVehicleSummaryPage(vehicle, attachments.length), firstPage);
  firstPage = false;

  for (const canvas of makeVehicleDocumentPages(vehicle, vehicleDocs)) {
    appendCanvasPage(pdf, canvas, firstPage);
    firstPage = false;
  }

  for (const { driver, role } of linkedDrivers) {
    appendCanvasPage(
      pdf,
      makeDriverSummaryPage(driver, `بيانات ${role}`, vehicle),
      firstPage,
    );
    firstPage = false;
  }

  if (attachments.length === 0) {
    const canvas = createAttachmentPage("المرفقات", "لا توجد صور أو مستندات مرفقة مسجلة");
    appendCanvasPage(pdf, canvas, firstPage);
    firstPage = false;
  } else {
    for (const attachment of attachments) {
      firstPage = await appendAttachment(pdf, attachment, firstPage);
    }
  }

  return pdf.output("blob");
}