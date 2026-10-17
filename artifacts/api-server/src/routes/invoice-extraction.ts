import { Router, type NextFunction, type Request, type Response } from "express";
import { Readable } from "stream";
import { execute, executeBatch, queryAll, queryOne } from "../lib/erp-sql.js";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";
import { isSysAdminToken } from "./auth.js";

const router = Router();
const objectStorage = new ObjectStorageService();
const AI_BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const AI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const ALLOWED_ROLES = new Set(["admin", "supervisor", "reviewer"]);
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024;

async function requireTripLogAccess(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === "guest") return void res.status(401).json({ error: "يجب تسجيل الدخول" });
  if (await isSysAdminToken(token)) return next();

  const user = await queryOne<{ role: string; permissions: string | null }>(`
    SELECT u.role, u.permissions
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
      AND s.rowid=(SELECT MAX(current.rowid) FROM sessions current WHERE current.user_id=s.user_id)
    LIMIT 1
  `, token);
  if (!user) return void res.status(401).json({ error: "الجلسة منتهية" });
  if (ALLOWED_ROLES.has(user.role)) {
    next();
    return;
  }

  let permissions: string[] | null = null;
  if (user.permissions?.trim()) {
    try {
      const parsed = JSON.parse(user.permissions) as unknown;
      if (parsed === null) {
        permissions = null;
      } else if (Array.isArray(parsed) && parsed.every(permission => typeof permission === "string")) {
        permissions = parsed;
      } else {
        return void res.status(403).json({ error: "صلاحيات سجل الرحلات مطلوبة" });
      }
    } catch {
      // Match /api/auth/me: unparsable legacy permission data is exposed to
      // the client as null, which keeps legacy role-based page access intact.
      permissions = null;
    }
  }

  const hasLegacyAccess = !permissions || permissions.length === 0;
  if (!hasLegacyAccess && !(permissions ?? []).includes("fleet_trips")) {
    return void res.status(403).json({ error: "صلاحيات سجل الرحلات مطلوبة" });
  }
  next();
}

router.get("/trips/:id/invoice-images", requireTripLogAccess, async (req, res) => {
  const trip = await queryOne<{ id: number; client_request_id: string | null }>(
    "SELECT id, client_request_id FROM trips WHERE id=?", req.params.id,
  );
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  const invoiceImages = await queryAll<Record<string, unknown>>(
    "SELECT * FROM trip_invoice_images WHERE trip_id=? ORDER BY id DESC", trip.id,
  );
  const match = String(trip.client_request_id || "").match(/^routing-trip:(\d+)$/);
  const routedAttachments = match
    ? await (async () => {
      const child = await queryOne<{ attachments_json: string | null }>(
        "SELECT attachments_json FROM supply_request_trips WHERE id=?", Number(match[1]),
      );
      if (!child?.attachments_json) return [];
      try {
        const parsed = JSON.parse(child.attachments_json);
        if (!Array.isArray(parsed)) return [];
        return parsed.flatMap((item: Record<string, unknown>) => {
          if (typeof item.url !== "string" || !item.url) return [];
          const label = item.kind === "supervisor_permit" ? "فسح المشرف"
            : item.kind === "fsohat_permit" ? "فسحة مسؤول الفسوحات"
            : item.kind === "driver_invoice" ? "صورة فاتورة السائق" : "مرفق الرحلة";
          const fileName = typeof item.file_name === "string" ? item.file_name.trim() : "";
          return [{ object_path: item.url, file_name: fileName ? `${label} — ${fileName}` : label }];
        });
      } catch { return []; }
    })()
    : [];
  res.json([...invoiceImages, ...routedAttachments]);
});

router.use(async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === "guest") return void res.status(401).json({ error: "يجب تسجيل الدخول" });
  if (await isSysAdminToken(token)) return next();
  const user = await queryOne<{ role: string }>(`
    SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1 LIMIT 1
  `, token);
  if (!user) return void res.status(401).json({ error: "الجلسة منتهية" });
  if (!ALLOWED_ROLES.has(user.role)) return void res.status(403).json({ error: "صلاحيات إدارة الرحلات مطلوبة" });
  next();
});

type TemplateBody = {
  name?: string;
  description?: string;
  supplier?: string;
  cargo_type?: string;
  marker_text?: string;
  rules?: unknown;
  tariff_id?: number | null;
  sample_images?: string[];
  active?: boolean | number;
};

type ExtractedInvoice = {
  matched_template_id: number | null;
  material_type: string | null;
  quantity: number | null;
  unit: string | null;
  weight: number | null;
  weight_unit: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  permit_number: string | null;
  supplier: string | null;
  customer_name: string | null;
  loading_place: string | null;
  unloading_place: string | null;
  confidence: number;
  field_confidence?: Record<string, number>;
  recipient_signature: string | null;
  recipient_signature_readable: boolean | null;
  recipient_signature_matches_template: boolean | null;
  notes: string | null;
};

function cleanObjectPath(raw: unknown): string {
  const value = String(raw || "").trim();
  return value.startsWith("/api/storage") ? value.slice("/api/storage".length) : value;
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

function nullableString(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function normalizeInvoiceDate(value: unknown): string | null {
  const raw = nullableString(value)?.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  if (!raw) return null;
  const cleaned = raw.replace(/\./g, "-").replace(/\//g, "-").trim();
  let year: number;
  let month: number;
  let day: number;
  const yearFirst = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dayFirst = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (yearFirst) {
    year = Number(yearFirst[1]);
    month = Number(yearFirst[2]);
    day = Number(yearFirst[3]);
  } else if (dayFirst) {
    day = Number(dayFirst[1]);
    month = Number(dayFirst[2]);
    year = Number(dayFirst[3]);
  } else {
    return null;
  }
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseJsonResponse(raw: string): ExtractedInvoice {
  const normalized = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(normalized) as Record<string, unknown>;
  const numberOrNull = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  return {
    matched_template_id: Number(parsed.matched_template_id) || null,
    material_type: nullableString(parsed.material_type),
    quantity: numberOrNull(parsed.quantity),
    unit: nullableString(parsed.unit),
    weight: numberOrNull(parsed.weight),
    weight_unit: nullableString(parsed.weight_unit),
    invoice_number: nullableString(parsed.invoice_number),
    invoice_date: normalizeInvoiceDate(parsed.invoice_date),
    permit_number: nullableString(parsed.permit_number),
    supplier: nullableString(parsed.supplier),
    customer_name: nullableString(parsed.customer_name),
    loading_place: nullableString(parsed.loading_place),
    unloading_place: nullableString(parsed.unloading_place),
    confidence,
    field_confidence: parsed.field_confidence && typeof parsed.field_confidence === "object"
      ? parsed.field_confidence as Record<string, number>
      : undefined,
    recipient_signature: nullableString(parsed.recipient_signature),
    recipient_signature_readable: typeof parsed.recipient_signature_readable === "boolean"
      ? parsed.recipient_signature_readable : null,
    recipient_signature_matches_template: typeof parsed.recipient_signature_matches_template === "boolean"
      ? parsed.recipient_signature_matches_template : null,
    notes: nullableString(parsed.notes),
  };
}

async function resolveTariff(result: ExtractedInvoice, templateId?: number) {
  const template = templateId
    ? await queryOne<{ tariff_id: number | null }>(
      "SELECT tariff_id FROM invoice_templates WHERE id=? AND active=1", templateId,
    )
    : undefined;
  if (template?.tariff_id) {
    const tariff = await queryOne(
      "SELECT id, loading_place, unloading_place, driver_expense, rental, vehicle_type, cargo_type, supplier, customer_name FROM tariffs WHERE id=?",
      template.tariff_id,
    );
    if (tariff) return { tariff, score: 100, matched_by: "نموذج الفاتورة" };
  }

  const rows = await queryAll<Record<string, unknown>>(`
    SELECT id, loading_place, unloading_place, driver_expense, rental, vehicle_type,
           cargo_type, supplier, customer_name
    FROM tariffs
    WHERE status='approved' OR status IS NULL
  `);
  const loading = normalizeText(result.loading_place);
  const unloading = normalizeText(result.unloading_place);
  const supplier = normalizeText(result.supplier);
  const customer = normalizeText(result.customer_name);
  const cargo = normalizeText(result.material_type);
  let best: { tariff: Record<string, unknown>; score: number } | null = null;
  for (const tariff of rows) {
    let score = 0;
    const tariffLoading = normalizeText(tariff.loading_place);
    const tariffUnloading = normalizeText(tariff.unloading_place);
    if (loading && tariffLoading === loading) score += 8;
    if (unloading && tariffUnloading === unloading) score += 8;
    if (supplier && normalizeText(tariff.supplier) === supplier) score += 4;
    if (customer && normalizeText(tariff.customer_name) === customer) score += 4;
    if (cargo && normalizeText(tariff.cargo_type) === cargo) score += 3;
    if (!best || score > best.score) best = { tariff, score };
  }
  if (!best || best.score < 3) return null;
  const matchedBy = best.score >= 16 ? "مكانا التحميل والتنزيل"
    : best.score >= 8 ? "مكان التحميل أو التنزيل"
    : "الحمولة أو المورد";
  return { ...best, matched_by: matchedBy };
}

async function resolveTemplate(result: ExtractedInvoice, requestedTemplateId?: number) {
  if (requestedTemplateId) {
    return queryOne<Record<string, unknown>>(
      "SELECT * FROM invoice_templates WHERE id=? AND active=1", requestedTemplateId,
    );
  }
  const templates = await queryAll<Record<string, unknown>>(
    "SELECT * FROM invoice_templates WHERE active=1 ORDER BY updated_at DESC",
  );
  const supplier = normalizeText(result.supplier);
  const cargo = normalizeText(result.material_type);
  let best: { row: Record<string, unknown>; score: number } | null = null;
  for (const row of templates) {
    let score = 0;
    if (supplier && normalizeText(row.supplier) === supplier) score += 5;
    if (cargo && normalizeText(row.cargo_type) === cargo) score += 3;
    if (!best || score > best.score) best = { row, score };
  }
  return best && best.score >= 3 ? best.row : undefined;
}

async function readImage(objectPath: string) {
  const file = await objectStorage.getObjectEntityFile(cleanObjectPath(objectPath));
  const response = await objectStorage.downloadObject(file);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!contentType.startsWith("image/")) return null;
  const bytes = await response.arrayBuffer();
  return { contentType, base64: Buffer.from(bytes).toString("base64") };
}

function templateRow(row: Record<string, unknown>) {
  let rules: unknown = {};
  let sampleImages: unknown = [];
  try { rules = JSON.parse(String(row.rules_json || "{}")); } catch {}
  try { sampleImages = JSON.parse(String(row.sample_images || "[]")); } catch {}
  return { ...row, active: Boolean(row.active), rules, sample_images: sampleImages };
}

type InvoiceExtractionPayload = {
  preview: Record<string, unknown>;
  conflicts: string[];
  matched_by: string | null;
  tariff: Record<string, unknown> | null;
  template: { id: unknown; name: unknown } | null;
  extracted: ExtractedInvoice;
  signature_question: string | null;
  signature_needs_confirmation: boolean;
};

async function extractInvoiceForTrip(tripId: number, requestedTemplateId?: number): Promise<InvoiceExtractionPayload> {
  if (!AI_BASE_URL || !AI_API_KEY) throw new Error("خدمة قراءة الفواتير غير متاحة حالياً");
  const trip = await queryOne<Record<string, unknown>>("SELECT * FROM trips WHERE id=?", tripId);
  if (!trip) throw new Error("الرحلة غير موجودة");
  const tripImagePath = cleanObjectPath(trip.image_url);
  if (!tripImagePath) throw new Error("لا توجد صورة حمولة محفوظة في هذه الرحلة");

  const requestedTemplate = requestedTemplateId
    ? await queryOne<Record<string, unknown>>(
      "SELECT * FROM invoice_templates WHERE id=? AND active=1 AND tariff_id IS NOT NULL", requestedTemplateId,
    )
    : undefined;
  const referenceTemplates = requestedTemplate
    ? [requestedTemplate]
    : await queryAll<Record<string, unknown>>(`
        SELECT it.*, t.loading_place, t.unloading_place
        FROM invoice_templates it
        JOIN tariffs t ON t.id=it.tariff_id
        WHERE it.active=1 AND it.tariff_id IS NOT NULL AND it.sample_images <> '[]'
        ORDER BY it.updated_at DESC LIMIT 12
      `);
  let templateRules = "";
  if (requestedTemplate) {
    let rules: unknown = {};
    try { rules = JSON.parse(String(requestedTemplate.rules_json || "{}")); } catch {}
    templateRules = `\nتعليمات النموذج المختار:
- الاسم: ${requestedTemplate.name || ""}
- المورد المتوقع: ${requestedTemplate.supplier || ""}
- نوع الحمولة المتوقع: ${requestedTemplate.cargo_type || ""}
- الختم/العلامة المميزة: ${requestedTemplate.marker_text || ""}
- قواعد وأماكن الحقول: ${JSON.stringify(rules)}
استخدم هذه التعليمات كدليل، لكن لا تخترع قيمة غير ظاهرة في المستند.`;
  }
  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: `الصورة الأولى هي صورة الرحلة المطلوب استخراج بياناتها. الصور التالية — إن وجدت — نماذج مرجعية للتعريفات وليست مصدر البيانات.
قارن شكل الصفحة والتوقيعات والختم ومواضع الحقول مع النماذج المرجعية، ثم أرجع JSON فقط بلا markdown وبالمفاتيح التالية:
matched_template_id (رقم النموذج المرجعي المطابق بصرياً، أو null إذا لم توجد مطابقة موثوقة)،
ركز على توقيع المستلم في خانة التسليم فقط، وليس توقيع السائق أو توقيع الموظف. استخدم توقيع المستلم كدليل أساسي لتحديد مكان التنزيل المطابق للتعريفة المرجعية.
material_type (نوع الحمولة، مثل أسمنت سائب أو أسمنت أكياس)، quantity (الكمية الرقمية إن وجدت)، unit،
weight (الوزن الصافي الرقمي إن وجد وإلا الوزن/الكمية الأكثر وضوحاً)، weight_unit،
invoice_number (رقم الفاتورة أو المستند)، permit_number (رقم التصريح/كارت التحميل)، supplier،
invoice_date (تاريخ الفاتورة الظاهر في المستند بصيغة YYYY-MM-DD)،
customer_name، loading_place، unloading_place، recipient_signature (اسم/نص توقيع المستلم إذا كان مقروءاً وإلا null)،
recipient_signature_readable (true فقط إذا أمكن قراءة التوقيع)،
recipient_signature_matches_template (true/false/null عند مقارنة توقيع المستلم بالتعريفة المرجعية)، confidence (من 0 إلى 1)،
field_confidence (كائن ثقة لكل حقل من 0 إلى 1)، notes.
إذا ظهر رقم رقمي مستقل داخل خانة Remarks/الملاحظات، مثل 5262، فاعتبره رقم الفاتورة المقصود لكارت التحميل
وأعطه الأولوية في invoice_number على أرقام DN.No أو Delivery Note الأخرى. في الفواتير الأخرى استخدم رقم الفاتورة الواضح حسب تصميم المستند.
لا تستنتج رقم السيارة أو اسم السائق. لا تخمّن التاريخ؛ أعد فقط تاريخ الفاتورة المطبوع بوضوح، وإذا لم تجد قيمة اكتب null.
إذا كان توقيع المستلم غير واضح، لا تخمّن مكان التنزيل؛ أعد recipient_signature_readable=false وrecipient_signature_matches_template=null.
بيانات الرحلة المرجعية للقراءة فقط: نوع السيارة=${trip.vehicle_type || ""}، السيارة=${trip.car_id || ""}، السائق=${trip.driver_name || ""}.${templateRules}`,
  }];
  const readable = await readImage(tripImagePath);
  if (!readable) throw new Error("صورة الحمولة المحفوظة غير قابلة للقراءة");
  content.push({ type: "image_url", image_url: { url: `data:${readable.contentType};base64,${readable.base64}` } });
  const candidateTemplateIds = new Set<number>();
  for (const template of referenceTemplates) {
    let sampleImages: string[] = [];
    let rules: unknown = {};
    try { sampleImages = JSON.parse(String(template.sample_images || "[]")); } catch {}
    try { rules = JSON.parse(String(template.rules_json || "{}")); } catch {}
    const samplePath = sampleImages[0];
    if (!samplePath) continue;
    const sample = await readImage(samplePath);
    if (!sample) continue;
    candidateTemplateIds.add(Number(template.id));
    content.push({
      type: "text",
      text: `نموذج مرجعي فقط: template_id=${template.id}، التحميل=${template.loading_place || ""}، التنزيل=${template.unloading_place || ""}، مناطق الحقول بالنسب المئوية=${JSON.stringify(rules)}.`,
    });
    content.push({ type: "image_url", image_url: { url: `data:${sample.contentType};base64,${sample.base64}` } });
  }
  const aiResponse = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-5.4",
      max_completion_tokens: 900,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
    }),
  });
  if (!aiResponse.ok) throw new Error("فشل الاتصال بخدمة قراءة الفاتورة");
  const data = await aiResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
  const extracted = parseJsonResponse(data.choices?.[0]?.message?.content || "{}");
  const candidateId = [requestedTemplateId, extracted.matched_template_id]
    .map(Number)
    .find(id => Number.isFinite(id) && candidateTemplateIds.has(id));
  const matchedTemplate = candidateId
    ? await queryOne<Record<string, unknown>>(
      "SELECT * FROM invoice_templates WHERE id=? AND active=1 AND tariff_id IS NOT NULL", candidateId,
    )
    : undefined;
  const tariffMatch = await resolveTariff(extracted, matchedTemplate ? Number(matchedTemplate.id) : undefined);
  const tariff = tariffMatch?.tariff as Record<string, unknown> | undefined;
  const meterTon = (extracted.weight ?? extracted.quantity ?? Number(trip.meter_ton)) || 0;
  const unitPrice = tariff ? Number(tariff.rental) || 0 : Number(trip.unit_price) || 0;
  const routeBonus = tariff ? Number(tariff.driver_expense) || 0 : Number(trip.route_bonus) || 0;
  const returnValue = Number((meterTon > 0 ? meterTon * unitPrice : unitPrice).toFixed(2));
  const preview = {
    date: extracted.invoice_date,
    material_type: extracted.material_type || tariff?.cargo_type || null,
    meter_ton: meterTon || null,
    payment_voucher: extracted.invoice_number,
    loading_card_no: extracted.invoice_number || extracted.permit_number,
    supplier: extracted.supplier || tariff?.supplier || null,
    client_name: extracted.customer_name || tariff?.customer_name || null,
    vehicle_type: tariff?.vehicle_type || null,
    loading_region: tariff?.loading_place || null,
    unloading_region: tariff?.unloading_place || null,
    destination: tariff?.unloading_place || null,
    trips_count: 1,
    unit_price: unitPrice,
    route_bonus: routeBonus,
    return_value_no_vat: returnValue,
    net_amount: Number((returnValue - routeBonus - (Number(trip.material_expense_diesel) || 0)).toFixed(2)),
  };
  const conflicts: string[] = [];
  if (!tariffMatch) conflicts.push("لم يتم العثور على تعريفة مطابقة؛ تم تخطي الرحلة.");
  if (extracted.confidence < 0.65) conflicts.push("درجة الثقة منخفضة؛ راجع الحقول المقروءة يدوياً.");
  if (tariff && extracted.recipient_signature_matches_template === false) {
    conflicts.push("توقيع المستلم لا يطابق التوقيع المرجعي لمكان التنزيل؛ لن يتم الحفظ.");
  }
  const signatureNeedsConfirmation = Boolean(
    tariff && extracted.recipient_signature_matches_template !== true &&
    extracted.recipient_signature_matches_template !== false,
  );
  return {
    extracted,
    preview,
    tariff: tariff || null,
    matched_by: tariffMatch?.matched_by || null,
    template: matchedTemplate ? { id: matchedTemplate.id, name: matchedTemplate.name } : null,
    conflicts,
    signature_question: signatureNeedsConfirmation
      ? `هل توقيع المستلم الظاهر في الصورة يخص مكان التنزيل «${tariff?.unloading_place || ""}»؟`
      : null,
    signature_needs_confirmation: signatureNeedsConfirmation,
  };
}

const invoiceRestorableColumns = [
  "date", "material_type", "meter_ton", "payment_voucher", "loading_card_no", "supplier", "client_name",
  "vehicle_type", "loading_region", "unloading_region", "destination", "trips_count", "unit_price",
  "route_bonus", "return_value_no_vat", "total_amount", "net_amount", "invoice_data_source",
  "invoice_data_status", "invoice_data_run_id", "invoice_identity_status", "invoice_identity_updated_at",
] as const;

function buildInvoiceExtractionUpdate(
  trip: Record<string, unknown>,
  values: Record<string, unknown>,
  source: "auto" | "manual",
  runId?: number,
) {
  const updates: Record<string, unknown> = { trips_count: 1 };
  const allowed: Record<string, "text" | "number"> = {
    date: "text", material_type: "text", meter_ton: "number", payment_voucher: "text", loading_card_no: "text",
    supplier: "text", client_name: "text", vehicle_type: "text", loading_region: "text",
    unloading_region: "text", destination: "text", unit_price: "number", route_bonus: "number",
  };
  for (const [key, type] of Object.entries(allowed)) {
    const raw = values[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    const current = trip[key];
    if (key !== "date" && current !== null && current !== undefined && String(current).trim() !== "" && Number(current) !== 0) continue;
    const value = type === "number" ? Number(raw) : String(raw).trim();
    if (type === "number" && !Number.isFinite(value as number)) continue;
    updates[key] = value;
  }
  const meterTon = Number(updates.meter_ton ?? trip.meter_ton) || 0;
  const unitPrice = Number(updates.unit_price ?? trip.unit_price) || 0;
  const routeBonus = Number(updates.route_bonus ?? trip.route_bonus) || 0;
  const materialExpense = Number(trip.material_expense_diesel) || 0;
  const returnValue = Number((meterTon > 0 ? meterTon * unitPrice : unitPrice).toFixed(2));
  updates.return_value_no_vat = returnValue;
  updates.total_amount = returnValue;
  updates.net_amount = Number((returnValue - routeBonus - materialExpense).toFixed(2));
  updates.invoice_data_source = source;
  updates.invoice_data_status = source === "auto" ? "auto_success" : "manual";
  updates.invoice_data_run_id = runId ?? null;
  if (values.loading_card_no || values.date) {
    updates.invoice_identity_status = "success";
    updates.invoice_identity_updated_at = new Date().toISOString();
  }
  return { updates, updated: Object.keys(updates) };
}

const invoiceIdentityQueue: number[] = [];
const queuedInvoiceIdentityTripIds = new Set<number>();
let invoiceIdentityWorkerRunning = false;

async function processInvoiceIdentityQueue() {
  if (invoiceIdentityWorkerRunning) return;
  invoiceIdentityWorkerRunning = true;
  try {
    while (invoiceIdentityQueue.length > 0) {
      const tripId = invoiceIdentityQueue.shift()!;
      try {
        const result = await extractInvoiceForTrip(tripId);
        const invoiceNumber = nullableString(result.extracted.invoice_number || result.extracted.permit_number);
        const invoiceDate = normalizeInvoiceDate(result.extracted.invoice_date);
        const current = await queryOne<{
          loading_card_no: string | null;
          date: string | null;
        }>("SELECT loading_card_no, date FROM trips WHERE id=?", tripId);
        if (!current) continue;

        const updates: Record<string, unknown> = {};
        if (invoiceNumber && !nullableString(current.loading_card_no)) updates.loading_card_no = invoiceNumber;
        if (invoiceDate) updates.date = invoiceDate;
        updates.invoice_identity_status = invoiceNumber || invoiceDate ? "success" : "no_data";
        updates.invoice_identity_updated_at = new Date().toISOString();

        const columns = Object.keys(updates);
        await execute(`UPDATE trips SET ${columns.map(column => `${column}=?`).join(", ")} WHERE id=?`,
          ...columns.map(column => updates[column]), tripId);
      } catch {
        await execute(`
          UPDATE trips
          SET invoice_identity_status='error', invoice_identity_updated_at=datetime('now')
          WHERE id=?
        `, tripId);
      } finally {
        queuedInvoiceIdentityTripIds.delete(tripId);
      }
    }
  } finally {
    invoiceIdentityWorkerRunning = false;
  }
}

export async function queueTripInvoiceIdentityExtraction(tripId: number, force = false): Promise<boolean> {
  if (!Number.isFinite(tripId) || queuedInvoiceIdentityTripIds.has(tripId)) return false;
  const trip = await queryOne<{ image_url: string | null; invoice_identity_status: string | null }>(`
    SELECT image_url, invoice_identity_status
    FROM trips
    WHERE id=?
  `, tripId);
  if (!trip || !cleanObjectPath(trip.image_url)) return false;
  if (!force && trip.invoice_identity_status) return false;

  await execute(`
    UPDATE trips
    SET invoice_identity_status='pending', invoice_identity_updated_at=datetime('now')
    WHERE id=?
  `, tripId);
  queuedInvoiceIdentityTripIds.add(tripId);
  invoiceIdentityQueue.push(tripId);
  void processInvoiceIdentityQueue();
  return true;
}

router.get("/invoice-templates", async (req, res) => {
  const includeInactive = req.query.include_inactive === "1";
  const rows = await queryAll<Record<string, unknown>>(`
    SELECT it.*, t.loading_place, t.unloading_place, t.driver_expense, t.rental
    FROM invoice_templates it
    LEFT JOIN tariffs t ON t.id=it.tariff_id
    ${includeInactive ? "" : "WHERE it.active=1"}
    ORDER BY it.active DESC, it.updated_at DESC, it.id DESC
  `);
  res.json(rows.map(templateRow));
});

router.post("/invoice-templates", async (req, res) => {
  const body = req.body as TemplateBody;
  if (!body.name?.trim()) return void res.status(400).json({ error: "اسم النموذج مطلوب" });
  if (!body.tariff_id || !await queryOne("SELECT id FROM tariffs WHERE id=?", body.tariff_id)) {
    return void res.status(400).json({ error: "يجب ربط تعليم الصورة بتعريفة موجودة" });
  }
  const rules = JSON.stringify(body.rules && typeof body.rules === "object" ? body.rules : {});
  const sampleImages = JSON.stringify(Array.isArray(body.sample_images) ? body.sample_images.slice(0, 12).map(cleanObjectPath) : []);
  const result = await execute(`
    INSERT INTO invoice_templates
      (name, description, supplier, cargo_type, marker_text, rules_json, tariff_id, sample_images, active, updated_at)
    VALUES (?,?,?,?,?,?,?,?,1,datetime('now'))
  `,
    body.name.trim(), nullableString(body.description), nullableString(body.supplier),
    nullableString(body.cargo_type), nullableString(body.marker_text), rules,
    body.tariff_id || null, sampleImages,
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put("/invoice-templates/:id", async (req, res) => {
  const body = req.body as TemplateBody;
  if (!body.name?.trim()) return void res.status(400).json({ error: "اسم النموذج مطلوب" });
  const existing = await queryOne<{ id: number; tariff_id: number | null }>(
    "SELECT id, tariff_id FROM invoice_templates WHERE id=?", req.params.id,
  );
  if (!existing) return void res.status(404).json({ error: "النموذج غير موجود" });
  if (!existing.tariff_id) return void res.status(400).json({ error: "هذا نموذج قديم غير مرتبط بتعريفة" });
  const rules = JSON.stringify(body.rules && typeof body.rules === "object" ? body.rules : {});
  const sampleImages = JSON.stringify(Array.isArray(body.sample_images) ? body.sample_images.slice(0, 12).map(cleanObjectPath) : []);
  await execute(`
    UPDATE invoice_templates SET name=?, description=?, supplier=?, cargo_type=?, marker_text=?,
      rules_json=?, tariff_id=?, sample_images=?, active=?, updated_at=datetime('now')
    WHERE id=?
  `,
    body.name.trim(), nullableString(body.description), nullableString(body.supplier),
    nullableString(body.cargo_type), nullableString(body.marker_text), rules,
    existing.tariff_id, sampleImages, body.active === false || body.active === 0 ? 0 : 1,
    req.params.id,
  );
  res.json({ message: "تم تحديث نموذج الفاتورة" });
});

router.post("/invoice-templates/:id/duplicate", async (req, res) => {
  const source = await queryOne<Record<string, unknown>>("SELECT * FROM invoice_templates WHERE id=?", req.params.id);
  if (!source) return void res.status(404).json({ error: "النموذج غير موجود" });
  const result = await execute(`
    INSERT INTO invoice_templates
      (name, description, supplier, cargo_type, marker_text, rules_json, tariff_id, sample_images, active, updated_at)
    VALUES (?,?,?,?,?,?,?,?,1,datetime('now'))
  `,
    `${source.name} — نسخة`, source.description || null, source.supplier || null,
    source.cargo_type || null, source.marker_text || null, source.rules_json || "{}",
    source.tariff_id || null, source.sample_images || "[]",
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.post("/trips/:id/invoice-images", async (req, res) => {
  const trip = await queryOne("SELECT id FROM trips WHERE id=?", req.params.id);
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  const images = Array.isArray(req.body?.images) ? req.body.images : [];
  if (!images.length || images.length > 12) return void res.status(400).json({ error: "أرفق من 1 إلى 12 صورة فاتورة" });
  const inserted: number[] = [];
  for (const image of images) {
    const objectPath = cleanObjectPath(image?.object_path);
    if (!objectPath.startsWith("/objects/")) continue;
    const result = await execute(`
      INSERT INTO trip_invoice_images (trip_id, object_path, file_name)
      VALUES (?,?,?)
    `, req.params.id, objectPath, nullableString(image?.file_name));
    inserted.push(Number(result.lastInsertRowid));
  }
  if (!inserted.length) return void res.status(400).json({ error: "مسارات الصور غير صالحة" });
  res.status(201).json({ ids: inserted });
});

router.delete("/trips/:tripId/invoice-images/:imageId", async (req, res) => {
  await execute("DELETE FROM trip_invoice_images WHERE id=? AND trip_id=?", req.params.imageId, req.params.tripId);
  res.json({ message: "تم حذف مصدر الفاتورة" });
});

router.post("/trips/:id/extract-invoice-data", async (req, res) => {
  if (!AI_BASE_URL || !AI_API_KEY) return void res.status(503).json({ error: "خدمة قراءة الفواتير غير متاحة حالياً" });
  const trip = await queryOne<Record<string, unknown>>("SELECT * FROM trips WHERE id=?", req.params.id);
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة" });

  const tripImagePath = cleanObjectPath(trip.image_url);
  if (!tripImagePath) return void res.status(400).json({ error: "لا توجد صورة حمولة محفوظة في هذه الرحلة" });

  try {
    const requestedTemplateId = Number(req.body?.template_id) || undefined;
    const requestedTemplate = requestedTemplateId
      ? await queryOne<Record<string, unknown>>(
        "SELECT * FROM invoice_templates WHERE id=? AND active=1", requestedTemplateId,
      )
      : undefined;
    const referenceTemplates = requestedTemplate
      ? [requestedTemplate]
      : await queryAll<Record<string, unknown>>(`
          SELECT it.*, t.loading_place, t.unloading_place
          FROM invoice_templates it
          JOIN tariffs t ON t.id=it.tariff_id
          WHERE it.active=1 AND it.tariff_id IS NOT NULL AND it.sample_images <> '[]'
          ORDER BY it.updated_at DESC LIMIT 12
        `);
    let templateRules = "";
    if (requestedTemplate) {
      let rules: unknown = {};
      try { rules = JSON.parse(String(requestedTemplate.rules_json || "{}")); } catch {}
      templateRules = `\nتعليمات النموذج المختار:
- الاسم: ${requestedTemplate.name || ""}
- المورد المتوقع: ${requestedTemplate.supplier || ""}
- نوع الحمولة المتوقع: ${requestedTemplate.cargo_type || ""}
- الختم/العلامة المميزة: ${requestedTemplate.marker_text || ""}
- قواعد وأماكن الحقول: ${JSON.stringify(rules)}
استخدم هذه التعليمات كدليل، لكن لا تخترع قيمة غير ظاهرة في المستند.`;
    }
    const content: Array<Record<string, unknown>> = [{
      type: "text",
      text: `الصورة الأولى هي صورة الرحلة المطلوب استخراج بياناتها. الصور التالية — إن وجدت — نماذج مرجعية للتعريفات وليست مصدر البيانات.
قارن شكل الصفحة والتوقيعات والختم ومواضع الحقول مع النماذج المرجعية، ثم أرجع JSON فقط بلا markdown وبالمفاتيح التالية:
matched_template_id (رقم النموذج المرجعي المطابق بصرياً، أو null إذا لم توجد مطابقة موثوقة)،
ركز على توقيع المستلم في خانة التسليم فقط، وليس توقيع السائق أو توقيع الموظف. استخدم توقيع المستلم كدليل أساسي لتحديد مكان التنزيل المطابق للتعريفة المرجعية.
material_type (نوع الحمولة، مثل أسمنت سائب أو أسمنت أكياس)، quantity (الكمية الرقمية إن وجدت)، unit،
weight (الوزن الصافي الرقمي إن وجد وإلا الوزن/الكمية الأكثر وضوحاً)، weight_unit،
invoice_number (رقم الفاتورة أو المستند)، permit_number (رقم التصريح/كارت التحميل)، supplier،
invoice_date (تاريخ الفاتورة الظاهر في المستند بصيغة YYYY-MM-DD)،
customer_name، loading_place، unloading_place، recipient_signature (اسم/نص توقيع المستلم إذا كان مقروءاً وإلا null)،
recipient_signature_readable (true فقط إذا أمكن قراءة التوقيع)،
recipient_signature_matches_template (true/false/null عند مقارنة توقيع المستلم بالتعريفة المرجعية)، confidence (من 0 إلى 1)،
field_confidence (كائن ثقة لكل حقل من 0 إلى 1)، notes.
إذا ظهر رقم رقمي مستقل داخل خانة Remarks/الملاحظات، مثل 5262، فاعتبره رقم الفاتورة المقصود لكارت التحميل
وأعطه الأولوية في invoice_number على أرقام DN.No أو Delivery Note الأخرى. في الفواتير الأخرى استخدم رقم الفاتورة الواضح حسب تصميم المستند.
لا تستنتج رقم السيارة أو اسم السائق. لا تخمّن التاريخ؛ أعد فقط تاريخ الفاتورة المطبوع بوضوح، وإذا لم تجد قيمة اكتب null.
إذا كان توقيع المستلم غير واضح، لا تخمّن مكان التنزيل؛ أعد recipient_signature_readable=false وrecipient_signature_matches_template=null.
بيانات الرحلة المرجعية للقراءة فقط: نوع السيارة=${trip.vehicle_type || ""}، السيارة=${trip.car_id || ""}، السائق=${trip.driver_name || ""}.${templateRules}`,
    }];
    const readable = await readImage(tripImagePath);
    if (!readable) return void res.status(400).json({ error: "صورة الحمولة المحفوظة غير قابلة للقراءة" });
    content.push({ type: "image_url", image_url: { url: `data:${readable.contentType};base64,${readable.base64}` } });
    const candidateTemplateIds = new Set<number>();
    for (const template of referenceTemplates) {
      let sampleImages: string[] = [];
      let rules: unknown = {};
      try { sampleImages = JSON.parse(String(template.sample_images || "[]")); } catch {}
      try { rules = JSON.parse(String(template.rules_json || "{}")); } catch {}
      const samplePath = sampleImages[0];
      if (!samplePath) continue;
      const sample = await readImage(samplePath);
      if (!sample) continue;
      candidateTemplateIds.add(Number(template.id));
      content.push({
        type: "text",
        text: `نموذج مرجعي فقط: template_id=${template.id}، التحميل=${template.loading_place || ""}، التنزيل=${template.unloading_place || ""}، مناطق الحقول بالنسب المئوية=${JSON.stringify(rules)}.`,
      });
      content.push({ type: "image_url", image_url: { url: `data:${sample.contentType};base64,${sample.base64}` } });
    }

    const aiResponse = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_completion_tokens: 900,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content }],
      }),
    });
    if (!aiResponse.ok) {
      req.log.error({ status: aiResponse.status }, "invoice extraction AI request failed");
      return void res.status(502).json({ error: "فشل الاتصال بخدمة قراءة الفاتورة" });
    }
    const data = await aiResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content || "{}";
    const extracted = parseJsonResponse(raw);
    const candidateId = [requestedTemplateId, extracted.matched_template_id]
      .map(Number)
      .find(id => Number.isFinite(id) && candidateTemplateIds.has(id));
    const matchedTemplate = candidateId
      ? await queryOne<Record<string, unknown>>(
        "SELECT * FROM invoice_templates WHERE id=? AND active=1 AND tariff_id IS NOT NULL", candidateId,
      )
      : undefined;
    const templateId = matchedTemplate ? Number(matchedTemplate.id) : undefined;
    const tariffMatch = await resolveTariff(extracted, templateId);
    const tariff = tariffMatch?.tariff as Record<string, unknown> | undefined;

    const preview = {
      date: extracted.invoice_date,
      material_type: extracted.material_type || tariff?.cargo_type || null,
      meter_ton: extracted.weight ?? extracted.quantity,
      payment_voucher: extracted.invoice_number,
      loading_card_no: extracted.invoice_number || extracted.permit_number,
      supplier: extracted.supplier || tariff?.supplier || null,
      client_name: extracted.customer_name || tariff?.customer_name || null,
      vehicle_type: tariff?.vehicle_type || null,
      loading_region: tariff?.loading_place || null,
      unloading_region: tariff?.unloading_place || null,
      destination: tariff?.unloading_place || null,
      trips_count: 1,
      unit_price: tariff ? Number(tariff.rental) || 0 : null,
      route_bonus: tariff ? Number(tariff.driver_expense) || 0 : null,
      return_value_no_vat: tariff
        ? Number(((extracted.weight ?? extracted.quantity ?? 0) > 0
            ? (extracted.weight ?? extracted.quantity ?? 0) * (Number(tariff.rental) || 0)
            : Number(tariff.rental) || 0).toFixed(2))
        : null,
      net_amount: tariff
        ? Number((((extracted.weight ?? extracted.quantity ?? 0) > 0
            ? (extracted.weight ?? extracted.quantity ?? 0) * (Number(tariff.rental) || 0)
            : Number(tariff.rental) || 0) - (Number(tariff.driver_expense) || 0) - (Number(trip.material_expense_diesel) || 0)).toFixed(2))
        : null,
    };
    const conflicts: string[] = [];
    if (!tariffMatch) conflicts.push("لم يتم العثور على تعريفة مطابقة؛ راجع مكانَي التحميل والتنزيل قبل الحفظ.");
    if (extracted.confidence < 0.65) conflicts.push("درجة الثقة منخفضة؛ راجع الحقول المقروءة يدوياً.");
    if (extracted.loading_place && tariff && normalizeText(extracted.loading_place) !== normalizeText(tariff.loading_place)) {
      conflicts.push(`المستند يشير إلى التحميل من «${extracted.loading_place}» بينما التعريفة المطابقة من «${tariff.loading_place}».`);
    }
    if (tariff && extracted.recipient_signature_matches_template === false) {
      conflicts.push("توقيع المستلم لا يطابق التوقيع المرجعي لمكان التنزيل؛ لن يتم الحفظ.");
    }
    const signatureNeedsConfirmation = Boolean(
      tariff && extracted.recipient_signature_matches_template !== true &&
      extracted.recipient_signature_matches_template !== false,
    );
    const signatureQuestion = signatureNeedsConfirmation
      ? `هل توقيع المستلم الظاهر في الصورة يخص مكان التنزيل «${tariff?.unloading_place || ""}»؟`
      : null;
    const rawResult = JSON.stringify({
      extracted, preview, tariffMatch, conflicts,
      signature_question: signatureQuestion,
      signature_needs_confirmation: signatureNeedsConfirmation,
    });
    await execute(`
      INSERT INTO trip_invoice_extractions (trip_id, image_ids, template_id, result_json, confidence)
      VALUES (?,?,?,?,?)
    `, req.params.id, "[]", templateId || null, rawResult, extracted.confidence);
    res.json({
      extracted,
      preview,
      tariff: tariffMatch?.tariff || null,
      matched_by: tariffMatch?.matched_by || null,
      template: matchedTemplate ? { id: matchedTemplate.id, name: matchedTemplate.name } : null,
      conflicts,
      signature_question: signatureQuestion,
      signature_needs_confirmation: signatureNeedsConfirmation,
    });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return void res.status(404).json({ error: "صورة الحمولة غير موجودة في التخزين" });
    req.log.error({ err: error }, "invoice extraction failed");
    res.status(500).json({ error: "فشل استخراج بيانات الفاتورة" });
  }
});

router.get("/trips/bulk-invoice-extraction/last", async (_req, res) => {
  const run = await queryOne<Record<string, unknown>>(`
    SELECT r.*, COUNT(c.id) AS changed_count
    FROM trip_invoice_bulk_runs r
    LEFT JOIN trip_invoice_bulk_changes c ON c.run_id=r.id
    WHERE r.status='completed'
    GROUP BY r.id
    ORDER BY r.id DESC LIMIT 1
  `);
  res.json(run || null);
});

router.post("/trips/bulk-invoice-extraction", async (req, res) => {
  if (!AI_BASE_URL || !AI_API_KEY) return void res.status(503).json({ error: "خدمة قراءة الفواتير غير متاحة حالياً" });
  const candidates = await queryAll<Record<string, unknown>>(`
    SELECT *
    FROM trips
    WHERE COALESCE(TRIM(image_url), '')<>''
      AND (
        COALESCE(TRIM(loading_card_no), '')=''
        OR COALESCE(TRIM(loading_region), '')=''
        OR COALESCE(TRIM(unloading_region), '')=''
      )
  `);
  const run = await execute("INSERT INTO trip_invoice_bulk_runs (status) VALUES ('running')");
  const runId = Number(run.lastInsertRowid);
  const results = { processed: 0, saved: 0, skipped: 0, no_image: 0, no_match: 0, errors: 0, run_id: runId };

  try {
    for (const trip of candidates) {
      results.processed++;
      if (!cleanObjectPath(trip.image_url)) {
        await execute("UPDATE trips SET invoice_data_source='system', invoice_data_status='skipped_no_image', invoice_data_run_id=NULL WHERE id=?", trip.id);
        results.skipped++;
        results.no_image++;
        continue;
      }
      try {
        const extracted = await extractInvoiceForTrip(Number(trip.id));
        const confidentVisualMatch = Boolean(
          extracted.template && extracted.tariff && extracted.extracted.confidence >= 0.65 &&
          extracted.extracted.recipient_signature_matches_template === true,
        );
        if (!confidentVisualMatch) {
          await execute("UPDATE trips SET invoice_data_source='system', invoice_data_status='skipped_no_match', invoice_data_run_id=NULL WHERE id=?", trip.id);
          results.skipped++;
          results.no_match++;
          continue;
        }
        const before = await queryOne<Record<string, unknown>>("SELECT * FROM trips WHERE id=?", trip.id);
        if (!before) throw new Error("الرحلة غير موجودة");
        const applied = buildInvoiceExtractionUpdate(before, extracted.preview, "auto", runId);
        const after = { ...before, ...applied.updates };
        await executeBatch([
          {
            sql: `UPDATE trips SET ${applied.updated.map(column => `${column}=?`).join(", ")} WHERE id=?`,
            params: [...applied.updated.map(column => applied.updates[column]), trip.id],
          },
          {
            sql: `INSERT INTO trip_invoice_bulk_changes (run_id, trip_id, before_json, after_json)
                  VALUES (?,?,?,?)`,
            params: [runId, trip.id, JSON.stringify(before), JSON.stringify(after)],
          },
        ]);
        results.saved++;
      } catch {
        await execute("UPDATE trips SET invoice_data_source='system', invoice_data_status='skipped_error', invoice_data_run_id=NULL WHERE id=?", trip.id);
        results.skipped++;
        results.errors++;
      }
    }
    await execute("UPDATE trip_invoice_bulk_runs SET status='completed' WHERE id=?", runId);
    res.json(results);
  } catch (error) {
    await execute("UPDATE trip_invoice_bulk_runs SET status='failed' WHERE id=?", runId);
    req.log.error({ err: error }, "bulk invoice extraction failed");
    res.status(500).json({ error: "فشل السحب الجماعي", run_id: runId });
  }
});

router.post("/trips/bulk-invoice-extraction/undo", async (_req, res) => {
  const run = await queryOne<{ id: number }>(`
    SELECT * FROM trip_invoice_bulk_runs
    WHERE status='completed' AND EXISTS (
      SELECT 1 FROM trip_invoice_bulk_changes c WHERE c.run_id=trip_invoice_bulk_runs.id AND c.undone_at IS NULL
    )
    ORDER BY id DESC LIMIT 1
  `);
  if (!run) return void res.status(404).json({ error: "لا توجد عملية سحب جماعي قابلة للتراجع" });

  const changes = await queryAll<Record<string, unknown>>(`
    SELECT c.*, t.invoice_data_run_id, t.invoice_data_source, t.invoice_data_status
    FROM trip_invoice_bulk_changes c
    JOIN trips t ON t.id=c.trip_id
    WHERE c.run_id=? AND c.undone_at IS NULL
  `, run.id);
  let restored = 0;
  let protectedCount = 0;
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  for (const change of changes) {
    if (Number(change.invoice_data_run_id) !== run.id ||
        change.invoice_data_source !== "auto" ||
        change.invoice_data_status !== "auto_success") {
      protectedCount++;
      continue;
    }
    let before: Record<string, unknown>;
    try { before = JSON.parse(String(change.before_json)); } catch { protectedCount++; continue; }
    const values = invoiceRestorableColumns.map(column => before[column] ?? null);
    statements.push({
      sql: `UPDATE trips SET ${invoiceRestorableColumns.map(column => `${column}=?`).join(", ")} WHERE id=?`,
      params: [...values, change.trip_id],
    });
    statements.push({
      sql: "UPDATE trip_invoice_bulk_changes SET undone_at=datetime('now') WHERE id=?",
      params: [change.id],
    });
    restored++;
  }
  statements.push({
    sql: "UPDATE trip_invoice_bulk_runs SET status=?, undone_at=datetime('now') WHERE id=?",
    params: [protectedCount === 0 ? "undone" : "undone_partial", run.id],
  });
  await executeBatch(statements);
  res.json({ message: "تم التراجع عن آخر سحب جماعي", restored, protected: protectedCount });
});

router.put("/trips/:id/invoice-extraction", async (req, res) => {
  const trip = await queryOne<Record<string, unknown>>("SELECT * FROM trips WHERE id=?", req.params.id);
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  const body = req.body?.values as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return void res.status(400).json({ error: "بيانات المراجعة مطلوبة" });
  const latest = await queryOne<{ result_json: string }>(`
    SELECT result_json FROM trip_invoice_extractions WHERE trip_id=? ORDER BY id DESC LIMIT 1
  `, req.params.id);
  if (latest) {
    try {
      const result = JSON.parse(latest.result_json) as {
        signature_needs_confirmation?: boolean;
        extracted?: { recipient_signature_matches_template?: boolean | null };
      };
      if (result.extracted?.recipient_signature_matches_template === false) {
        return void res.status(409).json({ error: "توقيع المستلم لا يطابق مكان التنزيل المرجعي" });
      }
      if (result.signature_needs_confirmation && req.body?.signature_confirmed !== true) {
        return void res.status(400).json({ error: "يجب تأكيد سؤال توقيع المستلم قبل الحفظ" });
      }
    } catch {
      return void res.status(400).json({ error: "تعذر التحقق من نتيجة قراءة توقيع المستلم" });
    }
  }

  const allowed: Record<string, "text" | "number"> = {
    date: "text", material_type: "text", meter_ton: "number", payment_voucher: "text", loading_card_no: "text",
    supplier: "text", client_name: "text", vehicle_type: "text",
    loading_region: "text", unloading_region: "text", destination: "text",
    unit_price: "number", route_bonus: "number",
  };
  const updates: Record<string, unknown> = {};
  const skipped: string[] = [];
  updates.trips_count = 1;
  for (const [key, type] of Object.entries(allowed)) {
    const raw = body[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    const current = trip[key];
    if (key !== "date" && current !== null && current !== undefined && String(current).trim() !== "" && Number(current) !== 0) {
      skipped.push(key);
      continue;
    }
    const value = type === "number" ? Number(raw) : String(raw).trim();
    if (type === "number" && !Number.isFinite(value as number)) continue;
    updates[key] = value;
  }
  const effectiveMeterTon = Number(updates.meter_ton ?? trip.meter_ton) || 0;
  const effectiveUnitPrice = Number(updates.unit_price ?? trip.unit_price) || 0;
  const effectiveRouteBonus = Number(updates.route_bonus ?? trip.route_bonus) || 0;
  const materialExpense = Number(trip.material_expense_diesel) || 0;
  const returnValue = Number((effectiveMeterTon > 0
    ? effectiveMeterTon * effectiveUnitPrice
    : effectiveUnitPrice).toFixed(2));
  updates.return_value_no_vat = returnValue;
  updates.total_amount = returnValue;
  updates.net_amount = Number((returnValue - effectiveRouteBonus - materialExpense).toFixed(2));
  updates.invoice_data_source = "auto";
  updates.invoice_data_status = "auto_success";
  updates.invoice_data_run_id = null;
  if (body.loading_card_no || body.date) {
    updates.invoice_identity_status = "success";
    updates.invoice_identity_updated_at = new Date().toISOString();
  }
  const columns = Object.keys(updates);
  if (columns.length) {
    const sql = `UPDATE trips SET ${columns.map(column => `${column}=?`).join(", ")} WHERE id=?`;
    await execute(sql, ...columns.map(column => updates[column]), req.params.id);
  }
  res.json({ message: columns.length ? "تم استكمال بيانات الرحلة" : "لا توجد حقول ناقصة للحفظ", updated: columns, skipped });
});

export default router;