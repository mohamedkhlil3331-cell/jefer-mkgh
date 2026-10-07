import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { Truck, Plus, Trash2, RefreshCw, X, Save, Download, Upload, AlertTriangle, Search, Filter, Pencil, Printer, PauseCircle, ChevronDown, ScanLine, FileImage, Undo2, CheckCircle, Maximize2, Minimize2, EyeOff, Eye, Share2 } from "lucide-react";
import { MonthShortcuts } from "@/components/MonthShortcuts";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import RentalAccountsTab from "@/pages/trips/RentalAccountsTab";
import { useAuth, type User } from "@/context/AuthContext";
import { createTripPdf, type TripPdfDetails } from "@/pages/trips/tripPdf";

interface Trip {
  id: number;
  date: string;
  payment_voucher?: string;
  loading_card_no?: string;
  car_id: string;
  trailer_number?: string | null;
  linked_trailer_number?: string | null;
  vehicle_type?: string;
  driver_name?: string;
  driver_phone?: string | null;
  material_type?: string;
  meter_ton?: number;
  unit_price: number;
  trips_count: number;
  return_value_no_vat?: number;
  client_name?: string;
  supplier?: string;
  material_expense_diesel?: number;
  work_value?: number;
  destination?: string;
  notes?: string;
  client_request_id?: string | null;
  routing_child_status?: string | null;
  cash_collection?: number;
  loading_region?: string;
  unloading_region?: string;
  route_bonus?: number;
  net_amount?: number;
  rental_company_share?: number | null;
  rental_broker_commission?: number | null;
  rental_broker_type?: "self" | "external" | null;
  rental_broker_name?: string | null;
  image_url?: string;
  permit_image_url?: string | null;
  fsohat_image_url?: string | null;
  routing_cargo_items?: { cargo_type: string; quantity?: number | null; sort_order?: number }[];
  routing_attachments?: { kind: string; url: string; file_name?: string; sort_order?: number }[];
  invoice_data_source?: string | null;
  invoice_data_status?: string | null;
  invoice_data_run_id?: number | null;
}

interface PrintedMark {
  item_type: string;
  item_ref: string;
  statement_ref?: string | null;
  marked_at: string;
}

interface Summary {
  total_records: number;
  total_trips: number;
  total_return_no_vat: number;
  total_cash: number;
  total_net?: number;
  show_vehicle_stops?: boolean;
}

interface StopRecord {
  id: number;
  vehicle_plate: string;
  stop_date: string;
  reason: string;
  source: string;
  notes?: string;
}

interface Deductions {
  total_workshop: number;
  total_parts: number;
  parts_head: number;
  parts_trailer: number;
  total_purchase: number;
}

interface FleetVehicle {
  plate_number: string;
  vehicle_type: string | null;
  driver_name: string | null;
}

async function requestTripSave(
  url: string,
  init: RequestInit,
  retryTransient: boolean,
): Promise<Record<string, unknown>> {
  const attempts = retryTransient ? 3 : 1;
  let lastError: Error = new Error("تعذر حفظ البيانات");
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, ...sessionHeaders() },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        const message = String(data.error || data.message || "تعذر حفظ البيانات");
        const transient = [408, 425, 429].includes(response.status) || response.status >= 500;
        if (!transient || attempt === attempts - 1) throw new Error(message);
        lastError = new Error(message);
      } else {
        return data;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("تعذر الاتصال بالخادم");
      const networkFailure = error instanceof TypeError ||
        (error instanceof DOMException && error.name === "AbortError");
      if (!networkFailure || attempt === attempts - 1) throw lastError;
    } finally {
      window.clearTimeout(timer);
    }
    await new Promise(resolve => window.setTimeout(resolve, 700 * (attempt + 1)));
  }
  throw lastError;
}

type InvoicePreview = {
  date: string | null;
  material_type: string | null;
  vehicle_type: string | null;
  meter_ton: number | null;
  payment_voucher: string | null;
  loading_card_no: string | null;
  supplier: string | null;
  client_name: string | null;
  loading_region: string | null;
  unloading_region: string | null;
  destination: string | null;
  trips_count: number;
  unit_price: number | null;
  route_bonus: number | null;
  return_value_no_vat: number | null;
  net_amount: number | null;
};

type InvoiceExtractionResult = {
  preview: InvoicePreview;
  conflicts: string[];
  matched_by?: string | null;
  extracted?: {
    confidence?: number;
    weight_unit?: string | null;
    unit?: string | null;
    recipient_signature?: string | null;
    recipient_signature_readable?: boolean | null;
    recipient_signature_matches_template?: boolean | null;
  };
  signature_question?: string | null;
  signature_needs_confirmation?: boolean;
};

const sessionHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` });

// ─── Header map for Excel import (handles trailing spaces + alt spellings) ────
const TRIP_HEADER_MAP: Record<string, string> = {
  "اليوم": "date",
  "سند الصرف": "payment_voucher",
  "رقم كارت التحميل": "loading_card_no",
  "رقم كارت التحمبل": "loading_card_no",
  "رقم السيارة": "car_id",
  "رقم السياره": "car_id",
  "نوع السيارة": "vehicle_type",
  "نوع السياره": "vehicle_type",
  "اسم السائق": "driver_name",
  "الحمولة": "material_type",
  "الحموله": "material_type",
  "متر/طن": "meter_ton",
  "سعر الرد/المتر/الطن": "unit_price",
  "سعر الرد / المتر/طن": "unit_price",
  "سعر الرد/م/ط": "unit_price",
  "سعر الرد": "unit_price",
  "السعر": "unit_price",
  "عدد الردود": "trips_count",
  "قيمة الرد بدون ضريبة": "return_value_no_vat",
  "قيمة الرد بدون  الضريبة": "return_value_no_vat",
  "قيمة الرد بدون الضريبة": "return_value_no_vat",
  "اسم العميل": "client_name",
  "المورد": "supplier",
  "مصروف قيمة المواد شامل الديزل": "material_expense_diesel",
  "مصروف شامل الديزل": "material_expense_diesel",
  "مصروف مواد+ديزل": "material_expense_diesel",
  "قيمة العمل": "work_value",
  "قيمة المواد": "work_value",
  "مكان النزول": "destination",
  "ملاحظات": "notes",
  "ملاحظات2": "notes2",
  "التحصيل النقدي": "cash_collection",
  "التحصيل النقدى": "cash_collection",
};

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  payment_voucher: "", loading_card_no: "",
  car_id: "", vehicle_type: "", driver_name: "",
  material_type: "", meter_ton: "",
  unit_price: "", trips_count: "1",
  client_name: "", supplier: "",
  material_expense_diesel: "", work_value: "",
  destination: "",
  notes: "", cash_collection: "",
  loading_region: "", unloading_region: "",
  route_bonus: "", image_url: "",
  rental_broker_commission: "", rental_broker_type: "", rental_broker_name: "",
};

function n(v: number | undefined | null) {
  return (v ?? 0).toLocaleString("ar-SA");
}

function toISO(d: string | undefined | null): string {
  if (!d) return "";
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function formatPrintedAt(value: string | undefined): string {
  if (!value) return "—";
  const normalized = value.includes(" ") && !value.includes("T") ? `${value.replace(" ", "T")}Z` : value;
  const parsed = new Date(normalized);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

function COLS() {
  return [
    { key: "date",                    label: "اليوم",                          w: 108 },
    { key: "payment_voucher",         label: "سند الصرف",                     w: 100 },
    { key: "loading_card_no",         label: "رقم كارت التحميل",              w: 130 },
    { key: "car_id",                  label: "رقم السيارة",                   w: 110 },
    { key: "linked_trailer_number",   label: "رقم التيدر",                    w: 105 },
    { key: "vehicle_type",            label: "نوع السيارة",                   w: 110 },
    { key: "driver_name",             label: "اسم السائق",                    w: 120 },
    { key: "material_type",           label: "الحمولة",                       w: 100 },
    { key: "meter_ton",               label: "متر/طن",                        w: 85  },
    { key: "unit_price",              label: "سعر الرد/م/ط",                 w: 105 },
    { key: "trips_count",             label: "عدد الردود",                    w: 90  },
    { key: "return_value_no_vat",     label: "قيمة الرد بدون ضريبة",         w: 145 },
    { key: "client_name",             label: "اسم العميل",                    w: 120 },
    { key: "supplier",                label: "المورد",                        w: 110 },
    { key: "material_expense_diesel", label: "مصروف مواد + ديزل",            w: 145 },
    { key: "work_value",              label: "قيمة العمل",                   w: 105 },
    { key: "loading_region",          label: "منطقة التحميل",                w: 120 },
    { key: "unloading_region",        label: "منطقة التنزيل",                w: 120 },
    { key: "route_bonus",             label: "بونص المسار",                  w: 105 },
    { key: "net_amount",              label: "الصافي",                        w: 110 },
    { key: "image_url",               label: "صورة الحمولة",                 w: 90  },
    { key: "permit_image_url",        label: "الفسح",                        w: 90  },
    { key: "invoice_data_status",     label: "حالة السحب",                   w: 130 },
    { key: "notes",                   label: "ملاحظات",                      w: 150 },
    { key: "cash_collection",         label: "التحصيل النقدي",               w: 115 },
  ] as const;
}

const NUM_KEYS = new Set([
  "meter_ton", "unit_price", "trips_count", "return_value_no_vat",
  "material_expense_diesel", "work_value", "cash_collection", "route_bonus", "net_amount",
]);

type SavedTripFilters = {
  search: string;
  dateFrom: string;
  dateTo: string;
  driver: string;
  vehicle: string;
  trailer: string;
  material: string;
  columns: Record<string, string[]>;
};

const emptyTripFilters: SavedTripFilters = {
  search: "", dateFrom: "", dateTo: "", driver: "", vehicle: "",
  trailer: "", material: "", columns: {},
};

function readTripFilters(userId: number | undefined): SavedTripFilters {
  try {
    const saved = JSON.parse(localStorage.getItem(`trips_filters_${userId ?? "guest"}`) || "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return emptyTripFilters;
    const text = (key: keyof SavedTripFilters) => typeof saved[key] === "string" ? saved[key] as string : "";
    const allowedColumns = new Set<string>(COLS().map(col => col.key));
    const columns = saved.columns && typeof saved.columns === "object" && !Array.isArray(saved.columns)
      ? Object.fromEntries(Object.entries(saved.columns)
          .filter(([key, values]) => allowedColumns.has(key) && Array.isArray(values))
          .map(([key, values]) => [key, (values as unknown[]).filter((value): value is string => typeof value === "string")]))
      : {};
    return {
      search: text("search"), dateFrom: text("dateFrom"), dateTo: text("dateTo"),
      driver: text("driver"), vehicle: text("vehicle"), trailer: text("trailer"),
      material: text("material"), columns,
    };
  } catch {
    return emptyTripFilters;
  }
}

export default function Trips() {
  const { user } = useAuth();
  return <TripsContent key={user?.id ?? "guest"} user={user} />;
}

function TripsContent({ user }: { user: User | null }) {
  const [savedFilters] = useState(() => readTripFilters(user?.id));
  const [pageTab, setPageTab] = useRememberedState<"trips" | "rental_accounts">("trips-page-tab", "trips");
  const [rows, setRows]         = useState<Trip[]>([]);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");
  const [openAdd, setOpenAdd]   = useState(false);
  const [bonusIsPerReply, setBonusIsPerReply] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [submitting, setSub]    = useState(false);
  const [clearConfirm, setCC]   = useState(false);
  const [clearing, setClearing] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // ── Stop records + deductions ─────────────────────────────────────────────
  const [stopRows,      setStopRows]      = useState<StopRecord[]>([]);
  const [deductions,    setDeductions]    = useState<Deductions>({ total_workshop: 0, total_parts: 0, parts_head: 0, parts_trailer: 0, total_purchase: 0 });
  const [showStops,     setShowStops]     = useState(false);
  const [editStopId,       setEditStopId]       = useState<number | null>(null);
  const [stopEditForm,     setStopEditForm]     = useState({ reason: "", notes: "" });
  const [showStopSummary,  setShowStopSummary]  = useState(false);

  // ── Inline editing ────────────────────────────────────────────────────────
  const [editInline,    setEditInline]    = useState<Record<number, Partial<Trip>>>({});
  const [savingInline,  setSavingInline]  = useState<number | null>(null);
  const [invoiceTrip, setInvoiceTrip] = useState<Trip | null>(null);
  const [invoiceExtracting, setInvoiceExtracting] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<InvoiceExtractionResult | null>(null);
  const [signatureConfirmed, setSignatureConfirmed] = useState<boolean | null>(null);
  const [bulkExtracting, setBulkExtracting] = useState(false);
  const [bulkUndoing, setBulkUndoing] = useState(false);
  const [canUndoBulk, setCanUndoBulk] = useState(false);
  const [printedMarks, setPrintedMarks] = useState<Map<string, PrintedMark>>(new Map());
  const [pdfTripId, setPdfTripId] = useState<number | null>(null);
  const [preparedTripPdfs, setPreparedTripPdfs] = useState<Record<number, File>>({});
  const [pdfNotice, setPdfNotice] = useState("");
  const [pdfWhatsappUrl, setPdfWhatsappUrl] = useState("");

  const createAndDownloadTripPdf = async (trip: Trip) => {
    setPdfTripId(trip.id);
    setPdfNotice("");
    setPdfWhatsappUrl("");
    setPreparedTripPdfs(current => {
      const next = { ...current };
      delete next[trip.id];
      return next;
    });
    try {
      const attachmentWarnings: string[] = [];
      let invoiceImages: Array<{ object_path?: string; file_name?: string }> = [];
      let attachmentResponse: Response | null = null;
      try {
        attachmentResponse = await fetch(`/api/trips/${trip.id}/invoice-images`, {
          headers: sessionHeaders(),
        });
      } catch {
        attachmentWarnings.push("تعذر الاتصال بخدمة المرفقات؛ سيُجهّز PDF ببيانات الرحلة والصور المتاحة.");
      }
      if (attachmentResponse) {
        const responseBody = await attachmentResponse.json().catch(() => null) as { error?: unknown } | unknown[] | null;
        if (!attachmentResponse.ok) {
          const serverMessage = responseBody && !Array.isArray(responseBody) && typeof responseBody.error === "string"
            ? responseBody.error
            : "تعذر تحميل قائمة مرفقات الرحلة";
          const message = `${serverMessage} (HTTP ${attachmentResponse.status})`;
          const tripNotFound = attachmentResponse.status === 404 && /الرحلة غير موجودة|trip not found/i.test(serverMessage);
          if ([401, 403].includes(attachmentResponse.status) || tripNotFound) throw new Error(message);
          attachmentWarnings.push(message);
        } else if (Array.isArray(responseBody)) {
          invoiceImages = responseBody as Array<{ object_path?: string; file_name?: string }>;
        } else {
          attachmentWarnings.push("استجابة مرفقات الرحلة غير صالحة؛ سيُجهّز PDF بالبيانات والصور المتاحة.");
        }
      }
      const imageCandidates = [
        ...(trip.image_url ? [{ url: trip.image_url, label: "صورة الحمولة" }] : []),
        ...(trip.permit_image_url ? [{ url: trip.permit_image_url, label: "فسح المشرف" }] : []),
        ...(trip.fsohat_image_url ? [{ url: trip.fsohat_image_url, label: "فسح ضابط الفسح" }] : []),
        ...invoiceImages
          .filter(image => Boolean(image.object_path))
          .map(image => ({ url: image.object_path!, label: image.file_name || "مرفق الفاتورة" })),
      ];
      const seenImageUrls = new Set<string>();
      const images = imageCandidates.filter(image => {
        if (seenImageUrls.has(image.url)) return false;
        seenImageUrls.add(image.url);
        return true;
      });
      const details: TripPdfDetails = {
        id: trip.id,
        date: trip.date,
        invoiceNumber: trip.payment_voucher || trip.loading_card_no || "—",
        loading: trip.loading_region,
        unloading: trip.unloading_region || trip.destination,
        driverName: trip.driver_name,
        driverPhone: trip.driver_phone,
        cargoSummary: trip.routing_cargo_items?.length
          ? trip.routing_cargo_items.map(item => `${item.cargo_type}${item.quantity != null ? ` — ${item.quantity}` : ""}`).join("، ")
          : trip.material_type,
        images,
        attachmentWarnings,
      };
      const result = await createTripPdf(details);
      const safeDriver = (trip.driver_name || "سائق").replace(/[^\p{L}\p{N}_-]+/gu, "-");
      const file = new File([result.blob], `رحلة-${trip.id}-${safeDriver}.pdf`, { type: "application/pdf" });
      setPreparedTripPdfs(current => ({ ...current, [trip.id]: file }));
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      const warningMessage = result.warnings.length
        ? ` تم تضمين المتاح فقط؛ توجد ${result.warnings.length} ملاحظة. أولها: ${result.warnings[0]} التفاصيل كاملة داخل PDF.`
        : "";
      setPdfNotice(`تم تجهيز وتنزيل PDF للرحلة ${trip.id} على صفحات A4 جاهزة للطباعة.${warningMessage} استخدم «مشاركة PDF» لإرساله، أو أرفق الملف يدوياً في واتساب.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "تعذر إنشاء ملف PDF للرحلة");
    } finally {
      setPdfTripId(null);
    }
  };

  const sharePreparedTripPdf = (trip: Trip, file: File) => {
    const manualAttachFallback = () => {
      setPdfNotice("المشاركة بالملف غير متاحة. ملف PDF مُنزّل؛ أرفقه يدوياً في واتساب، لأن رابط wa.me لا يستطيع إرفاق ملف ثنائي تلقائياً.");
      setPdfWhatsappUrl("");
      const recipient = window.prompt("أدخل رقم المستلم لفتح محادثة واتساب (اختياري):")?.trim();
      if (recipient) {
        const phone = recipient.replace(/[^\d+]/g, "").replace(/^\+/, "");
        if (phone) {
          setPdfWhatsappUrl(`https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(`ملف تفاصيل الرحلة ${trip.id} جاهز للإرسال`)}`);
        }
      }
    };

    const canShareFile = typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare({ files: [file] }));
    if (!canShareFile) {
      manualAttachFallback();
      return;
    }

    try {
      // Invoke share before any await or other asynchronous work, preserving this click's user activation.
      void navigator.share({
        files: [file],
        title: `تفاصيل الرحلة ${trip.id}`,
        text: `تفاصيل الرحلة رقم ${trip.id}`,
      }).then(() => {
        setPdfWhatsappUrl("");
        setPdfNotice("تم فتح المشاركة؛ اختر المستلم أو واتساب لإرسال ملف PDF.");
      }).catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") {
          setPdfWhatsappUrl("");
          setPdfNotice("تم إلغاء المشاركة. ملف PDF ما زال جاهزاً ويمكنك المحاولة مرة أخرى.");
          return;
        }
        manualAttachFallback();
      });
    } catch {
      manualAttachFallback();
    }
  };

  const loadBulkUndo = () => fetch("/api/trips/bulk-invoice-extraction/last")
    .then(r => r.ok ? r.json() : null)
    .then(run => setCanUndoBulk(Number(run?.changed_count || 0) > 0))
    .catch(() => setCanUndoBulk(false));

  const runBulkExtraction = async () => {
    if (!confirm("سيتم استكمال البيانات الناقصة من صور الفواتير، بما فيها رقم كارت التحميل وتاريخ الفاتورة، دون حذف الرحلات. هل تريد المتابعة؟")) return;
    setBulkExtracting(true);
    try {
      const response = await fetch("/api/trips/bulk-invoice-extraction", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "فشل السحب الجماعي");
      alert(`اكتمل السحب: ${result.saved} محفوظة، ${result.skipped} متخطاة.`);
      await Promise.all([load(true), loadBulkUndo()]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "فشل السحب الجماعي");
    } finally { setBulkExtracting(false); }
  };

  const undoBulkExtraction = async () => {
    if (!confirm("سيتم التراجع عن آخر عملية سحب جماعي فقط، مع حماية أي رحلة عُدلت بعدها. هل تريد المتابعة؟")) return;
    setBulkUndoing(true);
    try {
      const response = await fetch("/api/trips/bulk-invoice-extraction/undo", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "فشل التراجع");
      alert(`تمت استعادة ${result.restored} رحلة${result.protected ? `، وحماية ${result.protected} رحلة معدلة لاحقاً` : ""}.`);
      await Promise.all([load(true), loadBulkUndo()]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "فشل التراجع");
    } finally { setBulkUndoing(false); }
  };

  const setInlineVal = (id: number, k: keyof Trip, v: string | number | null) =>
    setEditInline(e => ({ ...e, [id]: { ...e[id], [k]: v } }));

  const cancelInline = (id: number) =>
    setEditInline(e => { const n = { ...e }; delete n[id]; return n; });

  const saveInline = async (id: number) => {
    const patch = editInline[id];
    if (!patch) return;
    setSavingInline(id);
    const orig = rows.find(r => r.id === id)!;
    try {
      const result = await requestTripSave(`/api/trips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...orig, ...patch }),
      }, true);
      const saved = result.trip as Trip | undefined;
      if (!saved || Number(saved.id) !== id) throw new Error("لم يؤكد الخادم حفظ التعديل");
      setRows(current => current.map(row => row.id === id ? saved : row));
      cancelInline(id);
      void load(true);
      alert("تم الحفظ والتأكد من تسجيل البيانات في قاعدة النظام");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر الحفظ؛ احتفظنا بالتعديل للمحاولة مرة أخرى");
    } finally {
      setSavingInline(null);
    }
  };

  // ── Fleet data for smart form ─────────────────────────────────────────────
  const [fleetVehicles,   setFleetVehicles]   = useState<FleetVehicle[]>([]);
  const [newTripVehicles, setNewTripVehicles] = useState<FleetVehicle[]>([]);
  const [tripDrivers,     setTripDrivers]     = useState<{ id: number; name: string }[]>([]);
  const [openingAdd,      setOpeningAdd]      = useState(false);
  const [loadingPlaces,   setLoadingPlaces]   = useState<string[]>([]);
  const [unloadingPlaces, setUnloadingPlaces] = useState<string[]>([]);
  const [editId,          setEditId]          = useState<number | null>(null);
  const [bonusFound,      setBonusFound]      = useState(false); // was route found in tariffs
  // routes for selected loading place
  const [routeOptions,    setRouteOptions]    = useState<{ unloading_place: string; driver_expense: number; rental: number; vehicle_type?: string; cargo_type?: string }[]>([]);
  const [tripCustomers, setTripCustomers] = useState<{ id: number; name: string; customer_type: "rental" | "company" }[]>([]);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState(savedFilters.search);
  const [filterDateFrom, setFilterDateFrom] = useState(savedFilters.dateFrom);
  const [filterDateTo,   setFilterDateTo]   = useState(savedFilters.dateTo);
  const [filterDriver,   setFilterDriver]   = useState(savedFilters.driver);
  const [filterVehicle,  setFilterVehicle]  = useState(savedFilters.vehicle);
  const [filterTrailer,  setFilterTrailer]  = useState(savedFilters.trailer);
  const [filterMaterial, setFilterMaterial] = useState(savedFilters.material);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(savedFilters.columns);
  const [columnFilterMenu, setColumnFilterMenu] = useState<{ key: string; label: string; top: number; left: number } | null>(null);
  const [columnFilterSearch, setColumnFilterSearch] = useState("");
  const [columnFilterOptions, setColumnFilterOptions] = useState<string[]>([]);
  const [loadingColumnOptions, setLoadingColumnOptions] = useState(false);
  const [teidarList, setTeidarList] = useState<{ id: number; teidara_number: string | null; vehicle_plate: string | null; teidara_type: string | null }[]>([]);
  const [formTrailer, setFormTrailer] = useState("");
  const [compactSections, setCompactSections] = useState(() => localStorage.getItem("trips_compact_sections") === "1");
  const [showFilterSection, setShowFilterSection] = useState(() => localStorage.getItem("trips_show_filters") !== "0");
  const [showSummarySection, setShowSummarySection] = useState(() => localStorage.getItem("trips_show_summary") !== "0");
  const [showChartSection, setShowChartSection] = useState(() => localStorage.getItem("trips_show_chart") !== "0");

  useEffect(() => {
    try {
      localStorage.setItem(`trips_filters_${user?.id ?? "guest"}`, JSON.stringify({
        search, dateFrom: filterDateFrom, dateTo: filterDateTo, driver: filterDriver,
        vehicle: filterVehicle, trailer: filterTrailer, material: filterMaterial,
        columns: columnFilters,
      } satisfies SavedTripFilters));
    } catch { /* storage may be unavailable */ }
  }, [user?.id, search, filterDateFrom, filterDateTo, filterDriver, filterVehicle, filterTrailer, filterMaterial, columnFilters]);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError("");
    Promise.all([
      fetch("/api/trips").then(r => {
        if (!r.ok) throw new Error("تعذر تحميل سجل الردود");
        return r.json();
      }),
      fetch("/api/trips/summary").then(r => r.json()),
      fetch("/api/fleet-vehicles").then(r => r.json()).catch(() => []),
      fetch("/api/tariffs/loading-places").then(r => r.json()).catch(() => []),
      fetch("/api/tariffs/unloading-places").then(r => r.json()).catch(() => []),
      fetch("/api/trips/stops").then(r => r.json()).catch(() => []),
      fetch("/api/teidarat").then(r => r.json()).catch(() => []),
      fetch("/api/driver-settlements/printed-marks-all", { headers: sessionHeaders() })
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
      fetch("/api/trip-customers").then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([t, s, v, lp, up, st, td, marks, customers]) => {
      setRows(Array.isArray(t) ? t : (t.rows || []));
      setSummary(s);
      if (s?.show_vehicle_stops !== undefined) setShowStops(!!s.show_vehicle_stops);
      if (Array.isArray(v)) setFleetVehicles(v);
      if (Array.isArray(lp)) setLoadingPlaces(lp);
      if (Array.isArray(up)) setUnloadingPlaces(up);
      if (Array.isArray(st)) setStopRows(st);
      if (Array.isArray(td)) setTeidarList(td);
      if (Array.isArray(marks)) {
        const markMap = new Map<string, PrintedMark>();
        marks.forEach((mark: PrintedMark) => {
          if (mark?.item_type && mark.item_ref !== undefined) {
            markMap.set(`${mark.item_type}:${String(mark.item_ref)}`, mark);
          }
        });
        setPrintedMarks(markMap);
      }
      if (Array.isArray(customers)) setTripCustomers(customers);
    }).catch(() => setLoadError("تعذر تحميل سجل الردود. اضغط تحديث للمحاولة مرة أخرى."))
      .finally(() => { if (!silent) setLoading(false); });
  };
  useEffect(() => { load(); }, []);
  // Keep the log current when a supervisor or driver updates a routing trip elsewhere.
  useEffect(() => {
    let refreshing = false;
    const refreshLog = async () => {
      if (document.visibilityState !== "visible" || refreshing) return;
      refreshing = true;
      try {
        const [tripsResponse, summaryResponse] = await Promise.all([
          fetch("/api/trips", { cache: "no-store" }),
          fetch("/api/trips/summary", { cache: "no-store" }),
        ]);
        if (!tripsResponse.ok || !summaryResponse.ok) throw new Error("تعذر تحديث سجل الرحلات");
        const [trips, latestSummary] = await Promise.all([tripsResponse.json(), summaryResponse.json()]);
        setRows(Array.isArray(trips) ? trips : (trips.rows || []));
        setSummary(latestSummary);
      } catch {
        // The existing refresh button remains available if a background request fails.
      } finally {
        refreshing = false;
      }
    };
    const interval = window.setInterval(refreshLog, 15000);
    document.addEventListener("visibilitychange", refreshLog);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshLog);
    };
  }, []);
  useEffect(() => { loadBulkUndo(); }, []);

  // ── Fetch deductions whenever date/vehicle filter changes ─────────────────
  const loadDeductions = useCallback(() => {
    const p = new URLSearchParams();
    if (filterDateFrom) p.set("from", filterDateFrom);
    if (filterDateTo)   p.set("to",   filterDateTo);
    if (filterVehicle)  p.set("car_id",      filterVehicle);
    if (filterTrailer)  p.set("trailer_id",  filterTrailer);
    fetch(`/api/trips/deductions?${p}`)
      .then(r => r.json())
      .then((d: Deductions) => { if (typeof d?.total_workshop === "number") setDeductions(d); })
      .catch(() => {});
  }, [filterDateFrom, filterDateTo, filterVehicle, filterTrailer]);
  useEffect(() => { loadDeductions(); }, [loadDeductions]);

  // ── Unique filter options ─────────────────────────────────────────────────
  const uniqueDrivers   = useMemo(() => Array.from(new Set(rows.map(r => r.driver_name  || "").filter(Boolean))).sort(), [rows]);
  const uniqueVehicles  = useMemo(() => Array.from(new Set(rows.map(r => r.car_id       || "").filter(Boolean))).sort(), [rows]);
  const uniqueMaterials = useMemo(() => Array.from(new Set(rows.map(r => r.material_type || "").filter(Boolean))).sort(), [rows]);
  const openColumnFilter = (key: string) => {
    const params = new URLSearchParams({ key });
    if (filterDateFrom) params.set("from", filterDateFrom);
    if (filterDateTo) params.set("to", filterDateTo);
    setLoadingColumnOptions(true);
    fetch(`/api/trips/filter-options?${params}`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(values => setColumnFilterOptions(Array.isArray(values) ? values : []))
      .catch(() => setColumnFilterOptions([]))
      .finally(() => setLoadingColumnOptions(false));
  };

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (q) {
        const haystack = [
          r.date, r.payment_voucher, r.loading_card_no, r.car_id,
          r.vehicle_type, r.driver_name, r.material_type,
          r.meter_ton, r.unit_price, r.trips_count, r.return_value_no_vat,
          r.client_name, r.supplier, r.material_expense_diesel,
           r.work_value, r.destination, r.loading_region, r.unloading_region,
           r.notes, r.cash_collection,
        ].map(v => (v ?? "").toString().toLowerCase()).join(" ");
        if (!haystack.includes(q)) return false;
      }
      const iso = toISO(r.date);
      if (filterDateFrom && iso && iso < filterDateFrom) return false;
      if (filterDateTo   && iso && iso > filterDateTo)   return false;
      if (filterDriver   && (r.driver_name   || "") !== filterDriver)   return false;
      if (filterVehicle  && (r.car_id                  || "") !== filterVehicle)  return false;
      if (filterTrailer  && (r.trailer_number           || "") !== filterTrailer)  return false;
      if (filterMaterial && (r.material_type           || "") !== filterMaterial) return false;
      for (const [key, selectedValues] of Object.entries(columnFilters)) {
        if (selectedValues.length === 0) continue;
        const rawValue = (r as unknown as Record<string, unknown>)[key];
        const value = String(rawValue ?? "").trim() || "(فارغ)";
        if (!selectedValues.includes(value)) return false;
      }
      return true;
    }).sort((a, b) => {
      const da = toISO(a.date);
      const db2 = toISO(b.date);
      if (db2 > da) return 1;
      if (db2 < da) return -1;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [rows, search, filterDateFrom, filterDateTo, filterDriver, filterVehicle, filterTrailer, filterMaterial, columnFilters]);

  // Keyed routing rows remain in the log, but are earned only after the
  // corresponding child trip has completed.
  const accountedRows = useMemo(
    () => filteredRows.filter(row =>
      !row.client_request_id?.startsWith("routing-trip:") || row.routing_child_status === "completed"
    ),
    [filteredRows],
  );

  const hasColumnFilter = Object.values(columnFilters).some(values => values.length > 0);
  const hasFilter = !!(search || filterDateFrom || filterDateTo || filterDriver || filterVehicle || filterTrailer || filterMaterial || hasColumnFilter);

  // ── Filtered stop records ─────────────────────────────────────────────────
  const filteredStopRows = useMemo(() => {
    if (!showStops) return [];
    return stopRows.filter(s => {
      if (filterDateFrom && s.stop_date < filterDateFrom) return false;
      if (filterDateTo   && s.stop_date > filterDateTo)   return false;
      if (filterVehicle  && s.vehicle_plate !== filterVehicle) return false;
      return true;
    });
  }, [stopRows, showStops, filterDateFrom, filterDateTo, filterVehicle]);

  // ── Per-vehicle stop summary ──────────────────────────────────────────────
  const vehicleStopStats = useMemo(() => {
    if (!filteredStopRows.length) return [];

    // Period length in days (for stop-rate denominator)
    let periodDays = 1;
    if (filterDateFrom && filterDateTo) {
      const msPerDay = 86400000;
      const diff = (new Date(filterDateTo).getTime() - new Date(filterDateFrom).getTime()) / msPerDay;
      periodDays = Math.max(1, Math.round(diff) + 1);
    }

    // Trip counts per vehicle from the current filtered trip rows
    const tripCountByPlate = new Map<string, number>();
    for (const r of accountedRows) {
      if (r.car_id) {
        tripCountByPlate.set(r.car_id, (tripCountByPlate.get(r.car_id) || 0) + (r.trips_count || 1));
      }
    }

    const map = new Map<string, { count: number; reasons: Map<string, number> }>();
    for (const s of filteredStopRows) {
      if (!map.has(s.vehicle_plate)) map.set(s.vehicle_plate, { count: 0, reasons: new Map() });
      const entry = map.get(s.vehicle_plate)!;
      entry.count++;
      entry.reasons.set(s.reason, (entry.reasons.get(s.reason) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([plate, { count, reasons }]) => {
        let topReason = "";
        let topCount  = 0;
        reasons.forEach((c, r) => { if (c > topCount) { topCount = c; topReason = r; } });
        const tripCount = tripCountByPlate.get(plate) || 0;
        const stopRate  = Math.round((count / periodDays) * 100);
        return { plate, count, topReason, tripCount, stopRate };
      })
      .sort((a, b) => b.stopRate - a.stopRate || b.count - a.count);
  }, [filteredStopRows, accountedRows, filterDateFrom, filterDateTo]);

  // ── Daily chart data ──────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of accountedRows) {
      const d = toISO(r.date);
      if (d) map.set(d, (map.get(d) || 0) + (r.trips_count || 0));
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cnt]) => ({ date: date.slice(8), fullDate: date, count: cnt }));
  }, [accountedRows]);

  // ── Dynamic summary from filtered rows ───────────────────────────────────
  const totalNet = accountedRows.reduce((s, r) => s + (r.net_amount ?? (r.return_value_no_vat || 0)), 0);
  const totalDed = deductions.total_workshop + deductions.total_parts + deductions.total_purchase;
  const dynamicSummary = useMemo(() => ({
    total_records:              accountedRows.length,
    total_trips:                accountedRows.reduce((s, r) => s + (r.trips_count || 0), 0),
    total_return_no_vat:        accountedRows.reduce((s, r) => s + (r.return_value_no_vat || 0), 0),
    total_cash:                 accountedRows.reduce((s, r) => s + (r.cash_collection || 0), 0),
    total_net:                  totalNet,
    total_net_after_deductions: totalNet - totalDed,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [accountedRows, deductions]);

  const displaySummary = hasFilter ? dynamicSummary : summary;

  const clearFilters = () => {
    setSearch(""); setFilterDateFrom(""); setFilterDateTo("");
    setFilterDriver(""); setFilterVehicle(""); setFilterTrailer(""); setFilterMaterial("");
    setColumnFilters({});
  };
  const setSectionPreference = (key: string, value: boolean, setter: (value: boolean) => void) => {
    setter(value); localStorage.setItem(key, value ? "1" : "0");
  };

  const openNewTrip = async () => {
    setOpeningAdd(true);
    try {
      const [fleetResponse, driversResponse] = await Promise.all([
        fetch("/api/fleet-vehicles?driver_source=fleet", { cache: "no-store" }),
        fetch("/api/drivers-list", { cache: "no-store" }),
      ]);
      if (!fleetResponse.ok || !driversResponse.ok) throw new Error("تعذر تحميل السيارات أو السائقين");
      const [vehicles, drivers] = await Promise.all([fleetResponse.json(), driversResponse.json()]);
      if (!Array.isArray(vehicles) || !Array.isArray(drivers)) throw new Error("تعذر قراءة قائمة السيارات أو السائقين");
      setNewTripVehicles(vehicles);
      setTripDrivers(drivers);
      setEditId(null);
      setForm(EMPTY_FORM);
      setFormTrailer("");
      setRouteOptions([]);
      setBonusFound(false);
      setOpenAdd(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر فتح الرحلة الجديدة");
    } finally {
      setOpeningAdd(false);
    }
  };

  // ── Auto-fill vehicle type + driver when vehicle is selected ─────────────
  const formVehicles = openAdd && editId === null ? newTripVehicles : fleetVehicles;
  const handleVehicleSelect = (plate: string) => {
    const v = formVehicles.find(fv => fv.plate_number === plate);
    // auto-fill linked trailer from teidarat table
    const linked = teidarList.find(t => t.vehicle_plate === plate);
    setFormTrailer(linked?.teidara_number ?? (v as unknown as Record<string,string>)?.linked_trailer_number ?? "");
    setForm(f => ({
      ...f,
      car_id:       plate,
      vehicle_type: v?.vehicle_type  ?? f.vehicle_type,
      driver_name:  editId === null ? (v?.driver_name ?? "") : (v?.driver_name ?? f.driver_name),
    }));
  };

  // ── Fetch routes for a loading place (filtered unloading + prices + types) ─
  const fetchRoutes = async (loading: string) => {
    if (!loading.trim()) { setRouteOptions([]); return; }
    try {
      const res = await fetch(`/api/tariffs/routes?loading=${encodeURIComponent(loading)}`);
      const data = await res.json() as { unloading_place: string; driver_expense: number; rental: number; vehicle_type?: string; cargo_type?: string }[];
      setRouteOptions(Array.isArray(data) ? data : []);
    } catch { setRouteOptions([]); }
  };

  // ── Apply tariff prices + types when unloading is picked ─────────────────
  const applyTariffForRoute = (loading: string, unloading: string, opts: typeof routeOptions) => {
    const match = opts.find(r => r.unloading_place === unloading);
    if (match) {
      setBonusFound(true);
      setBonusIsPerReply(true);
      setForm(f => ({
        ...f,
        route_bonus:   match.driver_expense > 0   ? String(match.driver_expense) : f.route_bonus,
        unit_price:    match.rental         > 0   ? String(match.rental)         : f.unit_price,
        // auto-fill vehicle & material type from tariff if the tariff row has them set
        vehicle_type:  match.vehicle_type?.trim() ? match.vehicle_type.trim()    : f.vehicle_type,
        material_type: (match as { cargo_type?: string }).cargo_type?.trim()
                         ? (match as { cargo_type?: string }).cargo_type!.trim()
                         : f.material_type,
      }));
    } else {
      setBonusFound(false);
      setBonusIsPerReply(false);
    }
  };

  const handleLoadingChange = async (val: string) => {
    setForm(f => ({ ...f, loading_region: val, unloading_region: "" }));
    setBonusFound(false);
    await fetchRoutes(val);
  };

  const handleUnloadingChange = (val: string) => {
    setForm(f => ({ ...f, unloading_region: val }));
    applyTariffForRoute(form.loading_region, val, routeOptions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSub(true);
    try {
      if (editId !== null) {
        const result = await requestTripSave(`/api/trips/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, trailer_number: formTrailer || null }),
        }, true);
        const saved = result.trip as Trip | undefined;
        if (!saved || Number(saved.id) !== editId) throw new Error("لم يؤكد الخادم حفظ التعديل");
        setRows(current => current.map(row => row.id === editId ? saved : row));
      } else {
        const result = await requestTripSave("/api/trips", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ ...form, trailer_number: formTrailer || null }),
        }, true);
        if (!result.trip) throw new Error("لم يؤكد الخادم حفظ الرد الجديد");

      }
      setOpenAdd(false);
      setEditId(null);
      setForm(EMPTY_FORM);
      setFormTrailer("");
      setBonusFound(false);
      setBonusIsPerReply(false);
      setRouteOptions([]);
      void load(true);
      alert("تم الحفظ والتأكد من تسجيل البيانات في قاعدة النظام");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر الحفظ؛ البيانات ما زالت في النموذج للمحاولة مرة أخرى");
    } finally { setSub(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا القيد؟")) return;
    await fetch(`/api/trips/${id}`, { method: "DELETE" });
    load();
  };

  const clearAll = async () => {
    setClearing(true);
    await fetch("/api/trips/clear", { method: "DELETE" });
    setCC(false);
    setClearing(false);
    load();
  };

  const openInvoiceExtraction = (trip: Trip) => {
    setInvoiceTrip(trip);
    setInvoiceResult(null);
    setSignatureConfirmed(null);
  };

  const extractInvoiceData = async () => {
    if (!invoiceTrip?.image_url) return;
    setInvoiceExtracting(true);
    setInvoiceResult(null);
    setSignatureConfirmed(null);
    try {
      const response = await fetch(`/api/trips/${invoiceTrip.id}/extract-invoice-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر قراءة الفاتورة");
      setInvoiceResult(data as InvoiceExtractionResult);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setInvoiceExtracting(false);
    }
  };

  const saveInvoiceExtraction = async () => {
    if (!invoiceTrip || !invoiceResult) return;
    if (invoiceResult.signature_needs_confirmation && signatureConfirmed !== true) {
      alert("اختر «نعم» لتأكيد توقيع المستلم قبل الحفظ.");
      return;
    }
    if (invoiceResult.extracted?.recipient_signature_matches_template === false) {
      alert("لا يمكن الحفظ لأن توقيع المستلم لا يطابق مكان التنزيل المرجعي.");
      return;
    }
    setInvoiceSaving(true);
    try {
      const response = await fetch(`/api/trips/${invoiceTrip.id}/invoice-extraction`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({ values: invoiceResult.preview, signature_confirmed: signatureConfirmed === true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ البيانات");
      alert(`${data.message}${data.skipped?.length ? `\nتم الاحتفاظ بـ ${data.skipped.length} حقل موجود دون تغيير.` : ""}`);
      setInvoiceTrip(null);
      setInvoiceResult(null);
      setSignatureConfirmed(null);
      load(true);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setInvoiceSaving(false);
    }
  };

  const handlePrint = () => {
    const printRows = hasFilter ? filteredRows : rows;
    const win = window.open("", "_blank");
    if (!win) return;
    const totalRvnv = printRows.reduce((s, r) => s + (r.return_value_no_vat || 0), 0);
    const totalNet  = printRows.reduce((s, r) => s + (r.net_amount || 0), 0);
    const fmt = (n: number) => n.toLocaleString("ar-SA");
    const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char
    );
    const printValue = (row: Trip, key: string) => {
      if (key === "image_url") return row.image_url ? "متاحة في السجل" : "—";
      if (key === "permit_image_url") {
        return [row.permit_image_url && "المشرف", row.fsohat_image_url && "الفسح"].filter(Boolean).join(" / ") || "—";
      }
      if (key === "invoice_data_status") {
        const status = row.invoice_data_status;
        const hasRoute = Boolean(row.loading_region || row.unloading_region);
        return status === "auto_success" ? "مسحوبة تلقائياً"
          : status === "manual" || (!status && hasRoute) ? "موجودة/معدلة مسبقاً"
          : status === "skipped_no_image" ? "متخطاة: بلا صورة"
          : status === "skipped_no_match" ? "متخطاة: لا تطابق"
          : status === "skipped_error" ? "متخطاة: خطأ"
          : "بانتظار السحب";
      }
      const value = (row as unknown as Record<string, unknown>)[key];
      if (NUM_KEYS.has(key)) return fmt(Number(value) || 0);
      return value == null || value === "" ? "—" : String(value);
    };
    const rowsHtml = printRows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        ${visibleCols.map(col => `<td>${escapeHtml(printValue(r, col.key))}</td>`).join("")}
      </tr>`).join("");
    const dateRange = (filterDateFrom || filterDateTo)
      ? ` | الفترة: ${filterDateFrom || "—"} حتى ${filterDateTo || "—"}`
      : "";
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
      <title>سجل الردود</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;direction:rtl;margin:16px;}
        h2{text-align:center;color:#103c68;margin-bottom:4px;}
        .sub{text-align:center;font-size:12px;color:#444;font-weight:600;margin-bottom:10px;}
        table{width:100%;border-collapse:collapse;margin-top:8px;}
        th,td{border:1px solid #ccc;padding:5px 7px;text-align:right;vertical-align:middle;}
        th{background:#103c68;color:#fff;font-size:11px;font-weight:700;}
        .totals{margin-top:12px;font-weight:bold;font-size:12px;text-align:left;color:#103c68;}
        @page{size:A4 landscape;margin:10mm 12mm}html{width:297mm}body{width:297mm;margin:0;padding:0}@media print{button{display:none}}
      </style>
    </head><body>
      <h2>سجل الردود</h2>
      <div class="sub">${printRows.length} رحلة${dateRange}</div>
      <table><thead><tr>
        <th>م</th>${visibleCols.map(col => `<th>${escapeHtml(col.label)}</th>`).join("")}
      </tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="totals">
        إجمالي قيمة الرد: ${fmt(totalRvnv)} ر.س &nbsp;&nbsp;|&nbsp;&nbsp; إجمالي الصافي: ${fmt(totalNet)} ر.س
      </div>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`);
    win.document.close();
  };

  const handleExport = () => {
    const exportRows = hasFilter ? filteredRows : rows;
    if (!exportRows.length) { alert("لا توجد بيانات للتصدير"); return; }
    const data = exportRows.map((r, i) => ({
      "م":                              i + 1,
      "اليوم":                          r.date,
      "سند الصرف":                      r.payment_voucher || "",
      "رقم كارت التحميل":               r.loading_card_no || "",
      "رقم السيارة":                    r.car_id,
      "نوع السيارة":                    r.vehicle_type || "",
      "اسم السائق":                     r.driver_name || "",
      "الحمولة":                        r.material_type || "",
      "متر/طن":                         r.meter_ton || 0,
      "سعر الرد/المتر/الطن":            r.unit_price,
      "عدد الردود":                     r.trips_count,
      "قيمة الرد بدون ضريبة":           r.return_value_no_vat || 0,
      "اسم العميل":                     r.client_name || "",
      "المورد":                         r.supplier || "",
      "مصروف قيمة المواد شامل الديزل":  r.material_expense_diesel || 0,
      "قيمة العمل":                    r.work_value || 0,
      "بونص المسار":                    r.route_bonus || 0,
      "الصافي":                        r.net_amount ?? 0,
      "ملاحظات":                       r.notes || "",
      "التحصيل النقدي":                 r.cash_collection || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الردود");
    XLSX.writeFile(wb, hasFilter ? `رحلات_مفلترة_${new Date().toLocaleDateString("en-CA")}.xlsx` : "رحلات_السيارات.xlsx");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { type: "array", cellDates: true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" }) as Record<string, unknown>[];
      if (!json.length) { alert("الملف فارغ"); return; }

      const normalized = json.map(row => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          const key = TRIP_HEADER_MAP[String(k).trim()];
          if (key) out[key] = v;
        }
        return out;
      });

      const mapped = normalized
        .filter(r => r.date || r.car_id || r.loading_card_no)
        .map(r => ({
          date:                    String(r.date || ""),
          payment_voucher:         String(r.payment_voucher || ""),
          loading_card_no:         String(r.loading_card_no || ""),
          car_id:                  String(r.car_id || ""),
          vehicle_type:            String(r.vehicle_type || ""),
          driver_name:             String(r.driver_name || ""),
          material_type:           String(r.material_type || ""),
          meter_ton:               parseFloat(String(r.meter_ton || "0")) || 0,
          unit_price:              parseFloat(String(r.unit_price || "0")) || 0,
          trips_count:             parseInt(String(r.trips_count || "1")) || 1,
          return_value_no_vat:     parseFloat(String(r.return_value_no_vat || "0")) || 0,
          client_name:             String(r.client_name || ""),
          supplier:                String(r.supplier || ""),
          material_expense_diesel: parseFloat(String(r.material_expense_diesel || "0")) || 0,
          work_value:              parseFloat(String(r.work_value || "0")) || 0,
          destination:             String(r.destination || ""),
          notes:                   String(r.notes || ""),
          cash_collection:         parseFloat(String(r.cash_collection || "0")) || 0,
        }));

      if (!mapped.length) {
        alert("لم يتم التعرف على أعمدة الملف.\nتأكد أن رؤوس الأعمدة مطابقة للنموذج.");
        return;
      }

      const res = await fetch("/api/trips/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped }),
      });
      const result = await res.json() as { inserted: number; message: string };
      alert(result.message || `تم استيراد ${result.inserted} رحلة`);
      load();
    } catch (err) {
      alert("خطأ في قراءة الملف: " + (err as Error).message);
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const mtonF  = parseFloat(form.meter_ton)    || 0;
  const cnt    = parseFloat(form.trips_count)  || 0;
  const prce   = parseFloat(form.unit_price)   || 0;
  const bonus  = parseFloat(form.route_bonus)            || 0;
  const totalBonus = bonusIsPerReply ? bonus * cnt : bonus;
  const matExp = parseFloat(form.material_expense_diesel) || 0;
  // قيمة الرد بدون ضريبة = متر/طن × سعر الرد × عدد الردود
  const rvnv   = mtonF > 0 ? mtonF * prce * cnt : cnt * prce;
  // الصافي = قيمة الرد بدون ضريبة − بونص المسار − مصروف مواد+ديزل
  const netVal = rvnv - totalBonus - matExp;
  const selectedCustomerType = tripCustomers.find(customer => customer.name === form.client_name)?.customer_type;
  const brokerCommission = parseFloat(form.rental_broker_commission) || 0;
  const companyShare = Math.max(0, rvnv - brokerCommission);

  const cols = COLS();

  // ── Column visibility ─────────────────────────────────────────────────────
  const LS_COL_KEY = "trips_col_visibility";
  const [colVisibility, setColVisibility] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(LS_COL_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        const merged: Record<string, boolean> = {};
        for (const c of cols) merged[c.key] = parsed[c.key] !== false;
        return merged;
      }
    } catch { /* ignore */ }
    return Object.fromEntries(cols.map(c => [c.key, true]));
  });
  const [showColMenu, setShowColMenu] = useState(false);
  const [actionVisibility, setActionVisibility] = useState<Record<"pdf" | "extract", boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`trips_action_visibility_${user?.id ?? "guest"}`) || "{}");
      return { pdf: saved.pdf !== false, extract: saved.extract !== false };
    } catch { return { pdf: true, extract: true }; }
  });
  const toggleAction = (key: "pdf" | "extract") => {
    setActionVisibility(current => {
      const next = { ...current, [key]: !current[key] };
      localStorage.setItem(`trips_action_visibility_${user?.id ?? "guest"}`, JSON.stringify(next));
      return next;
    });
  };
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColMenu) return;
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node))
        setShowColMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColMenu]);

  const toggleCol = (key: string) => {
    setColVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(LS_COL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const setAllCols = (val: boolean) => {
    const next = Object.fromEntries(cols.map(c => [c.key, val]));
    try { localStorage.setItem(LS_COL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setColVisibility(next);
  };

  const visibleCols = cols.filter(c => colVisibility[c.key] !== false);

  // ── Revenue target ────────────────────────────────────────────────────────
  const LS_TARGET_KEY = "trips_revenue_target";
  const [targetRevenue, setTargetRevenue] = useState<number | null>(() => {
    try {
      const s = localStorage.getItem(LS_TARGET_KEY);
      return s !== null ? Number(s) : null;
    } catch { return null; }
  });
  const [showTargetInput, setShowTargetInput] = useState(false);
  const [targetDraft, setTargetDraft] = useState("");

  const saveTarget = () => {
    const val = parseFloat(targetDraft.replace(/,/g, ""));
    if (isNaN(val) || val < 0) return;
    setTargetRevenue(val);
    try { localStorage.setItem(LS_TARGET_KEY, String(val)); } catch { /* ignore */ }
    setShowTargetInput(false);
  };

  const clearTarget = () => {
    setTargetRevenue(null);
    try { localStorage.removeItem(LS_TARGET_KEY); } catch { /* ignore */ }
    setShowTargetInput(false);
  };

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Truck size={22} className="text-[#103c68]" />الردود / رحلات السيارات
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">سجل التوصيلات والرحلات اليومية</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => load()} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 border border-green-200 text-green-700 bg-green-50 rounded-xl text-sm font-medium hover:bg-green-100">
            <Download size={14} />{hasFilter ? "تصدير المفلتر" : "تصدير Excel"}
          </button>
          <button onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-700 bg-blue-50 rounded-xl text-sm font-medium hover:bg-blue-100">
            <Upload size={14} />استيراد Excel
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 border border-purple-200 text-purple-700 bg-purple-50 rounded-xl text-sm font-medium hover:bg-purple-100">
            <Printer size={14} />طباعة
          </button>
          <button onClick={runBulkExtraction} disabled={bulkExtracting}
            className="flex items-center gap-1.5 px-3 py-2 border border-violet-200 text-violet-700 bg-violet-50 rounded-xl text-sm font-medium hover:bg-violet-100 disabled:opacity-50">
            <ScanLine size={14} className={bulkExtracting ? "animate-pulse" : ""} />
            {bulkExtracting ? "جاري السحب..." : "سحب جماعي"}
          </button>
          <button onClick={undoBulkExtraction} disabled={bulkUndoing || !canUndoBulk}
            title={!canUndoBulk ? "لا توجد عملية سحب جماعي قابلة للتراجع" : "التراجع عن آخر سحب جماعي"}
            className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-700 bg-amber-50 rounded-xl text-sm font-medium hover:bg-amber-100 disabled:opacity-40">
            <Undo2 size={14} />{bulkUndoing ? "جاري التراجع..." : "تراجع آخر سحب"}
          </button>
          <button onClick={() => setCC(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-red-50 rounded-xl text-sm font-medium hover:bg-red-100">
            <Trash2 size={14} />مسح الكل
          </button>
          <button onClick={() => void openNewTrip()} disabled={openingAdd}
            className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2e50] shadow-sm disabled:opacity-50">
            <Plus size={16} />{openingAdd ? "جاري تحميل السائقين…" : "إضافة رحلة"}
          </button>
        </div>
      </div>
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setPageTab("trips")}
          className={`rounded-lg px-5 py-2 text-sm font-bold transition-colors ${
            pageTab === "trips" ? "bg-[#103c68] text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          سجل الردود
        </button>
        <button
          type="button"
          onClick={() => setPageTab("rental_accounts")}
          className={`rounded-lg px-5 py-2 text-sm font-bold transition-colors ${
            pageTab === "rental_accounts" ? "bg-[#103c68] text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          حسابات الإيجار والعهدة
        </button>
      </div>

      {pageTab === "rental_accounts" ? (
        <RentalAccountsTab />
      ) : (
        <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = !compactSections;
            setCompactSections(next); localStorage.setItem("trips_compact_sections", next ? "1" : "0");
          }}
          className="flex items-center gap-2 rounded-xl border border-[#103c68]/20 bg-white px-3 py-2 text-sm font-bold text-[#103c68] hover:bg-slate-50"
        >
          {compactSections ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}
          {compactSections ? "إظهار أقسام الصفحة" : "وضع الجدول الموسع"}
        </button>
        {!compactSections && (
          <>
            <button onClick={() => setSectionPreference("trips_show_filters", !showFilterSection, setShowFilterSection)} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold">
              {showFilterSection ? <EyeOff size={13}/> : <Eye size={13}/>} الفلاتر
            </button>
            <button onClick={() => setSectionPreference("trips_show_summary", !showSummarySection, setShowSummarySection)} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold">
              {showSummarySection ? <EyeOff size={13}/> : <Eye size={13}/>} الإحصائيات
            </button>
            <button onClick={() => setSectionPreference("trips_show_chart", !showChartSection, setShowChartSection)} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold">
              {showChartSection ? <EyeOff size={13}/> : <Eye size={13}/>} الرسم
            </button>
          </>
        )}
      </div>
      {/* ── Filter bar ── */}
      {!compactSections && showFilterSection && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Filter size={14} className="text-gray-400" />
            <span className="text-xs font-bold text-gray-600">تصفية الرحلات</span>
            {hasFilter && (
              <button onClick={clearFilters}
                className="mr-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-semibold transition-colors">
                <X size={12} />مسح الفلاتر
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالسيارة، السائق، العميل، الوجهة..."
                className="w-full pr-8 pl-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 focus:bg-white"
              />
            </div>
            {/* Date from */}
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              title="من تاريخ"
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 focus:bg-white min-w-[140px]"
            />
            {/* Date to */}
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              title="إلى تاريخ"
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 focus:bg-white min-w-[140px]"
            />
            <MonthShortcuts onSelect={(f, t) => { setFilterDateFrom(f); setFilterDateTo(t); }} />
            <button
              type="button"
              onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }}
              className={`px-3 py-1 text-xs font-bold rounded-lg border transition-colors ${
                !filterDateFrom && !filterDateTo
                  ? "bg-[#103c68] text-white border-[#103c68]"
                  : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-[#103c68] hover:text-white"
              }`}
            >
              كل المدة
            </button>
            {/* Driver */}
            <select
              value={filterDriver}
              onChange={e => setFilterDriver(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 focus:bg-white min-w-[150px]"
            >
              <option value="">كل السائقين</option>
              {uniqueDrivers.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {/* Vehicle */}
            <select
              value={filterVehicle}
              onChange={e => setFilterVehicle(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 focus:bg-white min-w-[150px]"
            >
              <option value="">كل السيارات</option>
              {uniqueVehicles.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            {/* Trailer */}
            <input
              type="text"
              value={filterTrailer}
              onChange={e => setFilterTrailer(e.target.value)}
              placeholder="رقم التيدر"
              title="فلتر برقم التيدر"
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 focus:bg-white min-w-[120px]"
            />
            {/* Material */}
            <select
              value={filterMaterial}
              onChange={e => setFilterMaterial(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 focus:bg-white min-w-[140px]"
            >
              <option value="">كل الحمولات</option>
              {uniqueMaterials.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            {/* Column visibility toggle */}
            <div className="relative" ref={colMenuRef}>
              <button
                onClick={() => setShowColMenu(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 hover:bg-white hover:border-[#103c68]/30 transition-colors font-medium text-gray-600"
              >
                <Filter size={13} className="text-gray-400" />
                الأعمدة
                {visibleCols.length < cols.length && (
                  <span className="bg-[#103c68] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {cols.length - visibleCols.length}
                  </span>
                )}
                <ChevronDown size={13} className={`text-gray-400 transition-transform ${showColMenu ? "rotate-180" : ""}`} />
              </button>

              {showColMenu && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 min-w-[220px]">
                  {/* Actions */}
                  <div className="flex gap-2 mb-2 pb-2 border-b border-gray-100">
                    <button onClick={() => setAllCols(true)}
                      className="flex-1 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
                      تحديد الكل
                    </button>
                    <button onClick={() => setAllCols(false)}
                      className="flex-1 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                      إلغاء الكل
                    </button>
                  </div>
                  {/* Column checkboxes */}
                  <div className="pb-2 mb-2 border-b border-gray-100 text-xs">
                    <div className="font-bold text-gray-600 mb-1">أزرار سجل الرحلات</div>
                    <label className="flex items-center gap-2 py-1 cursor-pointer"><input type="checkbox" checked={actionVisibility.extract} onChange={() => toggleAction("extract")} />سحب البيانات</label>
                    <label className="flex items-center gap-2 py-1 cursor-pointer"><input type="checkbox" checked={actionVisibility.pdf} onChange={() => toggleAction("pdf")} />تجهيز PDF ومشاركته</label>
                  </div>
                  <div className="space-y-0.5 max-h-72 overflow-y-auto">
                    {cols.map(c => (
                      <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={colVisibility[c.key] !== false}
                          onChange={() => toggleCol(c.key)}
                          className="w-3.5 h-3.5 rounded accent-[#103c68]"
                        />
                        <span className="text-xs text-gray-700">{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Summary cards ── */}
      {!compactSections && showSummarySection && displaySummary && (
        <div className="space-y-2">
          {/* Filter active indicator */}
          {hasFilter && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <span className="text-amber-500 text-sm">★</span>
              <span>
                الأرقام تعكس الفلتر الحالي —{" "}
                <span className="font-bold">{filteredRows.length}</span> من{" "}
                <span className="font-bold">{rows.length}</span> رحلة
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className={`rounded-2xl p-4 shadow-sm transition-colors ${hasFilter ? "bg-[#0d2e50] ring-2 ring-amber-300" : "bg-[#103c68]"} text-white`}>
              <div className="text-xl font-black">{dynamicSummary.total_records.toLocaleString("ar-SA")}</div>
              <div className="text-xs opacity-70 mt-0.5">إجمالي رحلات السيارات</div>
            </div>
            <div className={`rounded-2xl p-4 shadow-sm transition-colors ${hasFilter ? "bg-blue-700 ring-2 ring-amber-300" : "bg-blue-600"} text-white`}>
              <div className="text-xl font-black">{Number(dynamicSummary.total_trips).toLocaleString("ar-SA")}</div>
              <div className="text-xs opacity-70 mt-0.5">إجمالي الردود</div>
            </div>
            <div className={`rounded-2xl p-4 shadow-sm transition-colors ${hasFilter ? "bg-amber-600 ring-2 ring-amber-300" : "bg-amber-500"} text-white`}>
              <div className="text-xl font-black">{Number(dynamicSummary.total_return_no_vat).toLocaleString("ar-SA")} <span className="text-xs font-normal">ر.س</span></div>
              <div className="text-xs opacity-70 mt-0.5">إجمالي قيمة الرد (بدون ضريبة)</div>
            </div>
            <div className={`rounded-2xl p-4 shadow-sm transition-colors ${hasFilter ? "bg-green-700 ring-2 ring-amber-300" : "bg-green-600"} text-white`}>
              <div className="text-xl font-black">{Number(dynamicSummary.total_cash).toLocaleString("ar-SA")} <span className="text-xs font-normal">ر.س</span></div>
              <div className="text-xs opacity-70 mt-0.5">إجمالي التحصيل النقدي</div>
            </div>
            <div className={`rounded-2xl p-4 shadow-sm transition-colors ${hasFilter ? "bg-teal-700 ring-2 ring-amber-300" : "bg-teal-600"} text-white`}>
              <div className="text-xl font-black">{Number(dynamicSummary.total_net ?? 0).toLocaleString("ar-SA")} <span className="text-xs font-normal">ر.س</span></div>
              <div className="text-xs opacity-70 mt-0.5">إجمالي الصافي (بعد خصم البونص)</div>
            </div>
            {/* 6th card — net after workshop & warehouse deductions */}
            <div className={`rounded-2xl p-4 shadow-sm transition-colors ${hasFilter ? "bg-purple-800 ring-2 ring-amber-300" : "bg-purple-700"} text-white`}>
              <div className="text-xl font-black">{Number(dynamicSummary.total_net_after_deductions ?? 0).toLocaleString("ar-SA")} <span className="text-xs font-normal">ر.س</span></div>
              <div className="text-xs opacity-70 mt-0.5">الصافي بعد خصم الورشة</div>
              {totalDed > 0 && (
                <div className="text-[10px] opacity-50 mt-1">خصم: {totalDed.toLocaleString("ar-SA")} ر.س</div>
              )}
            </div>
          </div>

          {/* ── Target + Remaining row ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Target card */}
            <div className="rounded-2xl p-4 shadow-sm bg-white border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-500">🎯 تارجت الإيراد</span>
                {!showTargetInput && (
                  <button
                    onClick={() => { setTargetDraft(targetRevenue !== null ? String(targetRevenue) : ""); setShowTargetInput(true); }}
                    className="text-xs text-[#103c68] hover:underline font-semibold">
                    {targetRevenue !== null ? "تعديل" : "تحديد"}
                  </button>
                )}
              </div>
              {showTargetInput ? (
                <div className="flex gap-2 items-center mt-1">
                  <input
                    type="number" min="0" step="any"
                    value={targetDraft}
                    onChange={e => setTargetDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveTarget(); if (e.key === "Escape") setShowTargetInput(false); }}
                    autoFocus
                    placeholder="0"
                    className="flex-1 px-3 py-1.5 border border-[#103c68] rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#103c68]/30"
                  />
                  <button onClick={saveTarget} className="px-3 py-1.5 bg-[#103c68] text-white rounded-xl text-xs font-bold hover:bg-[#0d2e50]">حفظ</button>
                  <button onClick={() => setShowTargetInput(false)} className="px-2 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-400 hover:bg-gray-50">إلغاء</button>
                  {targetRevenue !== null && (
                    <button onClick={clearTarget} className="px-2 py-1.5 text-red-400 hover:text-red-600 text-xs">حذف</button>
                  )}
                </div>
              ) : (
                <div className="text-xl font-black text-gray-800">
                  {targetRevenue !== null
                    ? <>{targetRevenue.toLocaleString("ar-SA")} <span className="text-xs font-normal text-gray-400">ر.س</span></>
                    : <span className="text-sm font-semibold text-gray-300">لم يُحدَّد بعد</span>}
                </div>
              )}
            </div>

            {/* Remaining card */}
            {(() => {
              if (targetRevenue === null) {
                return (
                  <div className="rounded-2xl p-4 shadow-sm bg-gray-50 border border-dashed border-gray-200 opacity-50">
                    <div className="text-xs font-bold text-gray-400 mb-1">📊 المتبقي من التارجت</div>
                    <div className="text-sm font-semibold text-gray-300">حدد التارجت أولاً</div>
                  </div>
                );
              }
              const achieved = dynamicSummary.total_return_no_vat;
              const remaining = targetRevenue - achieved;
              const pct = targetRevenue > 0 ? (achieved / targetRevenue) * 100 : 0;
              const isAchieved = remaining <= 0;
              const isNearlyDone = !isAchieved && remaining < targetRevenue * 0.2;
              const bgColor = isAchieved ? "bg-emerald-600" : isNearlyDone ? "bg-amber-500" : "bg-red-600";
              const label = isAchieved ? "✅ تم تحقيق التارجت!" : isNearlyDone ? "🔥 قريب جداً!" : "🔴 متبقٍ";
              return (
                <div className={`rounded-2xl p-4 shadow-sm ${bgColor} text-white`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold opacity-80">📊 المتبقي من التارجت</span>
                    <span className="text-xs font-bold opacity-70">{pct.toFixed(1)}% محقق</span>
                  </div>
                  <div className="text-xl font-black">
                    {isAchieved
                      ? <span className="text-base">{label}</span>
                      : <>{remaining.toLocaleString("ar-SA")} <span className="text-xs font-normal opacity-80">ر.س</span></>}
                  </div>
                  <div className="text-[11px] opacity-70 mt-0.5">{isAchieved ? `زيادة: ${Math.abs(remaining).toLocaleString("ar-SA")} ر.س` : label}</div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white/70 rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Workshop + Purchasing expense cards + net ── */}
          {(() => {
            const workshopTotal  = deductions.total_workshop + deductions.total_parts;
            const headTotal      = deductions.total_workshop + deductions.parts_head;
            const trailerTotal   = deductions.parts_trailer;
            const splitTotal     = headTotal + trailerTotal;
            const headPct        = splitTotal > 0 ? (headTotal / splitTotal) * 100 : 50;
            const trailerPct     = splitTotal > 0 ? (trailerTotal / splitTotal) * 100 : 50;
            const headWins       = headTotal >= trailerTotal;
            const purchaseTotal  = deductions.total_purchase;
            const netAfter       = totalNet - workshopTotal - purchaseTotal;
            const netPositive    = netAfter >= 0;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* مصروف الورشة */}
                <div className="rounded-2xl p-4 shadow-sm bg-white border border-orange-100">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-base">🔧</span>
                    <span className="text-xs font-bold text-gray-500">مصروف الورشة</span>
                    {workshopTotal > 0 && (
                      <span className="mr-auto text-xs text-orange-500 font-bold bg-orange-50 px-2 py-0.5 rounded-full">
                        {workshopTotal.toLocaleString("ar-SA")} ر.س
                      </span>
                    )}
                  </div>
                  {workshopTotal > 0 ? (
                    <>
                      <div className="text-xl font-black text-gray-800 mb-2">
                        {workshopTotal.toLocaleString("ar-SA")}
                        <span className="text-xs font-normal text-gray-400 mr-1">ر.س</span>
                      </div>
                      {/* راس vs تيدر bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-semibold">
                          <span className={headWins ? "text-blue-600" : "text-gray-400"}>
                            🚛 الراس — {headTotal.toLocaleString("ar-SA")} ر.س
                            {headWins && " ▲"}
                          </span>
                          <span className={!headWins ? "text-amber-600" : "text-gray-400"}>
                            {!headWins && "▲ "}
                            التيدر — {trailerTotal.toLocaleString("ar-SA")} ر.س 🔗
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden flex bg-gray-100">
                          <div
                            className={`h-full transition-all rounded-r-full ${headWins ? "bg-blue-500" : "bg-blue-300"}`}
                            style={{ width: `${headPct}%` }}
                          />
                          <div
                            className={`h-full transition-all rounded-l-full ${!headWins ? "bg-amber-500" : "bg-amber-300"}`}
                            style={{ width: `${trailerPct}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-400 text-center">
                          الراس {headPct.toFixed(0)}% · التيدر {trailerPct.toFixed(0)}%
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-300 font-semibold">لا يوجد مصروف للورشة</div>
                  )}
                </div>

                {/* مصروف المشتريات */}
                <div className="rounded-2xl p-4 shadow-sm bg-white border border-indigo-100">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-base">🛒</span>
                    <span className="text-xs font-bold text-gray-500">مصروف المشتريات</span>
                    {purchaseTotal > 0 && (
                      <span className="mr-auto text-xs text-indigo-500 font-bold bg-indigo-50 px-2 py-0.5 rounded-full">
                        {purchaseTotal.toLocaleString("ar-SA")} ر.س
                      </span>
                    )}
                  </div>
                  {purchaseTotal > 0 ? (
                    <>
                      <div className="text-xl font-black text-gray-800 mb-1">
                        {purchaseTotal.toLocaleString("ar-SA")}
                        <span className="text-xs font-normal text-gray-400 mr-1">ر.س</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1">
                        إجمالي فواتير الشراء لسيارات الرحلات
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-300 font-semibold">لا توجد فواتير مشتريات</div>
                  )}
                </div>

                {/* الصافي بعد الخصومات */}
                <div className={`rounded-2xl p-4 shadow-sm bg-white border ${netPositive ? "border-green-100" : "border-red-100"}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-base">{netPositive ? "✅" : "⚠️"}</span>
                    <span className="text-xs font-bold text-gray-500">الصافي بعد الخصومات</span>
                    <span className={`mr-auto text-xs font-bold px-2 py-0.5 rounded-full ${netPositive ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"}`}>
                      {netAfter.toLocaleString("ar-SA")} ر.س
                    </span>
                  </div>
                  <div className={`text-xl font-black mb-2 ${netPositive ? "text-green-700" : "text-red-600"}`}>
                    {netAfter.toLocaleString("ar-SA")}
                    <span className="text-xs font-normal text-gray-400 mr-1">ر.س</span>
                  </div>
                  <div className="space-y-0.5 text-[10px] text-gray-400">
                    <div className="flex justify-between">
                      <span>📊 صافي الرحلات</span>
                      <span className="font-semibold text-gray-600">{totalNet.toLocaleString("ar-SA")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>🔧 مصروف الورشة</span>
                      <span className="font-semibold text-orange-500">− {workshopTotal.toLocaleString("ar-SA")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>🛒 مصروف المشتريات</span>
                      <span className="font-semibold text-indigo-500">− {purchaseTotal.toLocaleString("ar-SA")}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Vehicle stop summary card ── */}
      {showStops && vehicleStopStats.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => setShowStopSummary(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-50/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <PauseCircle size={15} className="text-amber-500" />
              <span className="text-sm font-bold text-gray-700">إحصاء توقفات السيارات</span>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                {vehicleStopStats.length} سيارة — {filteredStopRows.length} يوم توقف
              </span>
            </div>
            <ChevronDown
              size={15}
              className={`text-gray-400 transition-transform ${showStopSummary ? "rotate-180" : ""}`}
            />
          </button>
          {showStopSummary && (
            <div className="border-t border-amber-100 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-amber-50 text-amber-800">
                    <th className="px-4 py-2 text-right font-bold">اللوحة</th>
                    <th className="px-4 py-2 text-center font-bold">أيام التوقف</th>
                    <th className="px-4 py-2 text-center font-bold">الرحلات</th>
                    <th className="px-4 py-2 text-center font-bold">نسبة التوقف</th>
                    <th className="px-4 py-2 text-right font-bold">أكثر سبب متكرر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {vehicleStopStats.map(({ plate, count, topReason, tripCount, stopRate }) => (
                    <tr
                      key={plate}
                      className={`transition-colors ${stopRate > 50 ? "bg-red-50 hover:bg-red-100/60" : "hover:bg-amber-50/40"}`}
                    >
                      <td className="px-4 py-2.5 font-bold text-gray-800">{plate}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-black text-sm ${
                          count >= 5 ? "bg-red-100 text-red-700" :
                          count >= 3 ? "bg-orange-100 text-orange-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {count}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold text-gray-700">
                        {tripCount > 0 ? tripCount : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-xs ${
                          stopRate > 50 ? "bg-red-200 text-red-800" :
                          stopRate > 25 ? "bg-orange-100 text-orange-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {stopRate}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          topReason === "في الورشة" ? "bg-orange-100 text-orange-700" :
                          topReason === "توقف بدون عذر" ? "bg-red-100 text-red-600" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {topReason || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Daily returns chart ── */}
      {!compactSections && showChartSection && chartData.length > 1 && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#103c68] inline-block" />
              الردود اليومية
            </h3>
            <span className="text-xs text-gray-400">
              {chartData.length} يوم — {accountedRows.reduce((s, r) => s + (r.trips_count || 0), 0).toLocaleString("ar-SA")} رد
            </span>
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={chartData} margin={{ top: 2, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", direction: "rtl" }}
                formatter={(v: number) => [v.toLocaleString("ar-SA"), "الردود"]}
                labelFormatter={(l) => `يوم ${l}`}
              />
              <Bar dataKey="count" fill="#103c68" radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Spreadsheet table ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {hasFilter && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-center gap-1.5">
            <Search size={12} />
            عرض <span className="font-bold">{filteredRows.length}</span> رحلة
            {filteredStopRows.length > 0 && <> + <span className="font-bold text-amber-600">{filteredStopRows.length}</span> توقف</>}
            {" "}من إجمالي {rows.length} رحلة
          </div>
        )}
        <div className="max-h-[72vh] overflow-auto">
          {pdfNotice && (
            <div role="status" className="sticky top-0 z-20 whitespace-normal break-words border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800">
              {pdfNotice}
              {pdfWhatsappUrl && (
                <a href={pdfWhatsappUrl} target="_blank" rel="noopener noreferrer" className="mr-2 underline font-black">
                  فتح محادثة واتساب
                </a>
              )}
            </div>
          )}
          <table className="text-xs w-max min-w-full">
            <thead className="sticky top-0 z-30">
              <tr className="bg-[#103c68] text-white">
                <th className="px-3 py-2.5 text-center font-bold sticky right-0 bg-[#103c68] z-10" style={{ minWidth: 44 }}>م</th>
                {visibleCols.map(c => (
                  <th key={c.key} className="px-3 py-2.5 text-right font-bold whitespace-nowrap" style={{ minWidth: c.w }}>
                    <div className="flex items-center justify-between gap-2">
                      <span>{c.label}</span>
                      {c.key !== "permit_image_url" && <button
                        type="button"
                        title={`تصفية عمود ${c.label}`}
                        onClick={event => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          setColumnFilterSearch("");
                          openColumnFilter(c.key);
                          setColumnFilterMenu(current => current?.key === c.key ? null : {
                            key: c.key,
                            label: c.label,
                            top: rect.bottom + 6,
                            left: Math.max(8, Math.min(window.innerWidth - 290, rect.left - 230)),
                          });
                        }}
                        className={`rounded p-1 transition-colors ${
                          (columnFilters[c.key]?.length || 0) > 0
                            ? "bg-amber-400 text-slate-900"
                            : "bg-white/10 text-white hover:bg-white/20"
                        }`}
                      >
                        <ChevronDown size={13} />
                      </button>}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center font-bold" style={{ minWidth: 60 }}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={visibleCols.length + 2} className="py-10 text-center text-gray-400">جاري التحميل...</td></tr>
              ) : loadError ? (
                <tr><td colSpan={visibleCols.length + 2} className="py-12 text-center text-red-600">{loadError}</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.length + 2} className="py-12 text-center text-gray-400">
                    <Truck size={36} className="mx-auto text-gray-200 mb-2" />
                    {rows.length === 0 ? (
                      <>
                        <div>لا توجد رحلات مسجّلة</div>
                        <div className="text-xs mt-1 text-gray-300">أضف رحلة أو استورد من Excel</div>
                      </>
                    ) : (
                      <>
                        <div>لا توجد نتائج تطابق الفلتر الحالي</div>
                        <button onClick={clearFilters} className="text-xs mt-2 text-blue-500 hover:underline">مسح الفلاتر</button>
                      </>
                    )}
                  </td>
                </tr>
              ) : (() => {
                // Merge trips + stop rows, sorted by date desc
                type DisplayRow =
                  | { kind: 'trip';  data: Trip;       idx: number }
                  | { kind: 'stop';  data: StopRecord; idx: number };
                const tripItems: DisplayRow[] = filteredRows.map((data, idx) => ({ kind: 'trip' as const, data, idx }));
                const stopItems: DisplayRow[] = filteredStopRows.map((data, idx) => ({ kind: 'stop' as const, data, idx }));
                const merged = [...tripItems, ...stopItems].sort((a, b) => {
                  const da = a.kind === 'trip' ? toISO(a.data.date) : a.data.stop_date;
                  const db2 = b.kind === 'trip' ? toISO(b.data.date) : b.data.stop_date;
                  if (db2 > da) return 1;
                  if (db2 < da) return -1;
                  // stops after trips on same day
                  if (a.kind === 'stop' && b.kind === 'trip') return 1;
                  if (a.kind === 'trip' && b.kind === 'stop') return -1;
                  return 0;
                });

                return merged.map((item) => {
                  if (item.kind === 'stop') {
                    const s = item.data;
                    return (
                      <tr key={`stop-${s.id}`} className="bg-amber-50/80 hover:bg-amber-50 border-b border-amber-100">
                        <td className="px-3 py-2 text-center sticky right-0 bg-amber-50/80 border-l border-amber-100 z-10">
                          <PauseCircle size={14} className="mx-auto text-amber-400" />
                        </td>
                        {visibleCols.map(c => {
                          if (c.key === 'date')        return <td key={c.key} className="px-3 py-2 whitespace-nowrap text-right text-amber-800 font-medium">{s.stop_date}</td>;
                          if (c.key === 'car_id')      return <td key={c.key} className="px-3 py-2 whitespace-nowrap text-right text-amber-700 font-bold">{s.vehicle_plate}</td>;
                          if (c.key === 'driver_name') return (
                            <td key={c.key} className="px-3 py-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${s.source === 'auto' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                                {s.source === 'auto' ? 'تلقائي' : 'يدوي'}
                              </span>
                            </td>
                          );
                          if (c.key === 'material_type') return (
                            <td key={c.key} className="px-3 py-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${s.reason === 'في الورشة' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-600'}`}>
                                {s.reason}
                              </span>
                            </td>
                          );
                          if (c.key === 'notes') return <td key={c.key} className="px-3 py-2 text-xs text-gray-400">{s.notes || ''}</td>;
                          return <td key={c.key} className="px-3 py-2 text-center text-gray-200 text-[10px]">—</td>;
                        })}
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => { setEditStopId(s.id); setStopEditForm({ reason: s.reason, notes: s.notes || "" }); }}
                            className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors" title="تعديل سبب التوقف">
                            <Pencil size={13} className="text-amber-500" />
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  const row     = item.data;
                  const i       = item.idx;
                  const dirty   = !!editInline[row.id];
                  const saving  = savingInline === row.id;
                  const preparedPdf = preparedTripPdfs[row.id];
                  const printedMark = printedMarks.get(`trip:${row.id}`);
                  const isPrinted = !!printedMark;
                  // fields editable inline (inputs always rendered)
                  const INLINE_TEXT = new Set(["driver_name","material_type","client_name","supplier","notes","payment_voucher","loading_card_no"]);
                  const INLINE_NUM  = new Set(["trips_count","meter_ton","unit_price","route_bonus","cash_collection","material_expense_diesel","work_value"]);
                  // computed / display-only
                  const READONLY = new Set(["return_value_no_vat","net_amount","image_url","permit_image_url","date","car_id","linked_trailer_number","vehicle_type","loading_region","unloading_region","invoice_data_status"]);

                  const getVal = (k: string) =>
                    (editInline[row.id]?.[k as keyof Trip] !== undefined
                      ? editInline[row.id][k as keyof Trip]
                      : (row as unknown as Record<string,unknown>)[k]);

                  return (
                    <tr
                      key={row.id}
                      title={isPrinted ? `طُبع بتاريخ ${formatPrintedAt(printedMark.marked_at)}${printedMark.statement_ref ? ` في الكشف ${printedMark.statement_ref}` : ""}` : undefined}
                      className={`transition-colors ${dirty ? "bg-yellow-50/60" : isPrinted ? "bg-emerald-50 hover:bg-emerald-100/80 border-r-4 border-r-emerald-500" : "hover:bg-blue-50/20"}`}
                    >
                      <td className={`px-3 py-1.5 text-center font-bold text-xs sticky right-0 border-l z-10 ${dirty ? "bg-yellow-50" : isPrinted ? "bg-emerald-50" : "bg-white border-gray-100"}`}>
                        {dirty
                          ? <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" title="تعديل معلّق" />
                          : isPrinted
                            ? (
                              <span className="inline-flex flex-col items-center gap-0.5 text-emerald-700">
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-black"><CheckCircle size={11} /> مطبوع</span>
                                <span className="text-[9px] font-semibold whitespace-nowrap">{formatPrintedAt(printedMark.marked_at)}</span>
                                {printedMark.statement_ref && <span className="text-[9px] font-semibold whitespace-nowrap">{printedMark.statement_ref}</span>}
                              </span>
                            )
                            : <span className="text-gray-400">{i + 1}</span>}
                      </td>

                      {visibleCols.map(c => {
                        const rawVal = (row as unknown as Record<string,unknown>)[c.key];

                        /* ── image ── */
                        if (c.key === "image_url") return (
                          <td key={c.key} className="px-3 py-1 text-center">
                            {rawVal ? (
                              <a href={rawVal as string} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100" title="تحميل الصورة وفتحها">
                                <FileImage size={13} /> عرض
                              </a>
                            ) : <span className="text-gray-200 text-xs">—</span>}
                          </td>
                        );

                        if (c.key === "permit_image_url") return (
                          <td key={c.key} className="px-3 py-1 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {[
                                { url: row.permit_image_url, label: "فسح المشرف" },
                                { url: row.fsohat_image_url, label: "فسح ضابط الفسح" },
                              ].map(permit => permit.url ? (
                                <a key={permit.label} href={permit.url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                                  title={permit.label}>
                                  <FileImage size={13} />{permit.label === "فسح المشرف" ? "المشرف" : "الفسح"}
                                </a>
                              ) : null)}
                              {(row.routing_attachments || []).map((attachment, index) => {
                                const label = attachment.kind === "supervisor_permit" ? "المشرف"
                                  : attachment.kind === "fsohat_permit" ? "الفسح"
                                  : attachment.kind === "driver_invoice" ? "السائق" : "مرفق";
                                return (
                                  <a key={`${attachment.kind}-${attachment.url}-${index}`} href={attachment.url}
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                                    title={attachment.file_name ? `${label} — ${attachment.file_name}` : label}>
                                    <FileImage size={13} />{label}
                                  </a>
                                );
                              })}
                              {!row.permit_image_url && !row.fsohat_image_url && !row.routing_attachments?.length && <span className="text-gray-200 text-xs">—</span>}
                            </div>
                          </td>
                        );

                        if (c.key === "invoice_data_status") {
                          const status = row.invoice_data_status;
                          const hasExistingRoute = Boolean(row.loading_region || row.unloading_region);
                          const label = status === "auto_success" ? "مسحوبة تلقائياً"
                            : status === "manual" || (!status && hasExistingRoute) ? "موجودة/معدلة مسبقاً"
                            : status === "skipped_no_image" ? "متخطاة: بلا صورة"
                            : status === "skipped_no_match" ? "متخطاة: لا تطابق"
                            : status === "skipped_error" ? "متخطاة: خطأ"
                            : "بانتظار السحب";
                          const style = status === "auto_success" ? "bg-emerald-100 text-emerald-700"
                            : status?.startsWith("skipped") ? "bg-amber-100 text-amber-700"
                            : status === "manual" || hasExistingRoute ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-500";
                          return <td key={c.key} className="px-2 py-1.5 whitespace-nowrap"><span className={`px-2 py-1 rounded-full text-[10px] font-bold ${style}`}>{label}</span></td>;
                        }

                        /* ── computed / display-only ── */
                        if (READONLY.has(c.key)) return (
                          <td key={c.key} className="px-3 py-1.5 whitespace-nowrap text-gray-500 text-xs">
                            {NUM_KEYS.has(c.key) ? n(rawVal as number) : (rawVal as string) || <span className="text-gray-200">—</span>}
                          </td>
                        );

                        const curVal = getVal(c.key);
                        const changed = editInline[row.id]?.[c.key as keyof Trip] !== undefined;

                        /* ── inline number ── */
                        if (INLINE_NUM.has(c.key)) {
                          const numVal = Number(curVal ?? 0);
                          return (
                            <td key={c.key} className="px-2 py-1">
                              <input
                                type="number" min="0" step="any"
                                value={numVal === 0 && !changed ? "" : numVal}
                                placeholder={numVal === 0 ? "0" : ""}
                                onChange={e => setInlineVal(row.id, c.key as keyof Trip, parseFloat(e.target.value) || 0)}
                                className={`w-full px-2 py-1 text-xs text-center border rounded-lg focus:outline-none focus:ring-1 transition-colors ${
                                  changed ? "border-amber-300 bg-amber-50 font-semibold" : "border-gray-200 bg-transparent text-gray-700 hover:border-gray-300"
                                }`}
                                style={{ minWidth: 60, maxWidth: (c as {w:number}).w - 16 }}
                              />
                            </td>
                          );
                        }

                        /* ── inline text ── */
                        if (INLINE_TEXT.has(c.key)) {
                          const textVal = String(curVal ?? "");
                          if (c.key === "material_type" && row.routing_cargo_items?.length) return (
                            <td key={c.key} className="px-2 py-1">
                              <div className="min-w-32 space-y-0.5 text-[10px] text-gray-600">
                                {row.routing_cargo_items.map((item, index) => (
                                  <div key={`${item.cargo_type}-${index}`}>
                                    {item.cargo_type}{item.quantity != null ? ` — ${item.quantity}` : ""}
                                  </div>
                                ))}
                              </div>
                              <input
                                type="text"
                                value={textVal}
                                onChange={e => setInlineVal(row.id, "material_type", e.target.value)}
                                className={`mt-1 w-full px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-1 transition-colors ${
                                  changed ? "border-amber-300 bg-amber-50 font-semibold" : "border-gray-200 bg-transparent text-gray-700 hover:border-gray-300"
                                }`}
                                style={{ minWidth: 70 }}
                              />
                            </td>
                          );
                          if (c.key === "client_name") return (
                            <td key={c.key} className="px-2 py-1">
                              <select
                                value={textVal}
                                onChange={e => setInlineVal(row.id, "client_name", e.target.value)}
                                className={`w-full px-2 py-1 text-xs border rounded-lg ${changed ? "border-amber-300 bg-amber-50 font-semibold" : "border-gray-200 bg-white"}`}
                              >
                                <option value="">بدون عميل</option>
                                {tripCustomers.map(customer => (
                                  <option key={customer.id} value={customer.name}>
                                    {customer.name} — {customer.customer_type === "company" ? "تابع للشركة" : "إيجار خارجي"}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                          return (
                            <td key={c.key} className="px-2 py-1">
                              <input
                                type="text"
                                value={textVal}
                                onChange={e => setInlineVal(row.id, c.key as keyof Trip, e.target.value)}
                                className={`w-full px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-1 transition-colors ${
                                  changed ? "border-amber-300 bg-amber-50 font-semibold" : "border-gray-200 bg-transparent text-gray-700 hover:border-gray-300"
                                }`}
                                style={{ minWidth: 70 }}
                              />
                            </td>
                          );
                        }

                        /* ── default display ── */
                        return (
                          <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap text-xs ${NUM_KEYS.has(c.key) ? "text-left font-medium text-gray-700" : "text-right text-gray-700"}`}>
                            {NUM_KEYS.has(c.key) ? n(rawVal as number) : (rawVal as string) || <span className="text-gray-200">—</span>}
                          </td>
                        );
                      })}

                      {/* ── Actions ── */}
                      <td className="px-2 py-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {dirty ? (
                            <>
                              <button onClick={() => saveInline(row.id)} disabled={saving}
                                className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[11px] font-bold disabled:opacity-50 transition-colors">
                                <Save size={11} />{saving ? "..." : "حفظ"}
                              </button>
                              <button onClick={() => cancelInline(row.id)} disabled={saving}
                                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="إلغاء">
                                <X size={11} className="text-gray-400" />
                              </button>
                            </>
                          ) : null}
                           {actionVisibility.pdf && <button
                            onClick={() => void createAndDownloadTripPdf(row)}
                            disabled={pdfTripId !== null}
                            className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap disabled:opacity-50"
                            title="تجهيز وتنزيل PDF لهذه الرحلة فقط">
                            {pdfTripId === row.id ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                            {pdfTripId === row.id ? "جاري التجهيز" : preparedPdf ? "إعادة تجهيز PDF" : "تجهيز PDF"}
                           </button>}
                           {actionVisibility.pdf && preparedPdf && (
                            <button
                              onClick={() => sharePreparedTripPdf(row, preparedPdf)}
                              className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap"
                              title="مشاركة ملف PDF الجاهز لهذه الرحلة">
                              <Share2 size={12} />مشاركة PDF
                            </button>
                          )}
                           {actionVisibility.extract && <button onClick={() => openInvoiceExtraction(row)}
                            className="flex items-center gap-1 px-2 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap"
                            title="قراءة صور الفواتير واستكمال الحقول الناقصة">
                            <ScanLine size={12} />سحب البيانات
                           </button>}
                          <button onClick={() => {
                            setEditId(row.id);
                            setForm({
                              date:                    toISO(row.date) || new Date().toISOString().slice(0,10),
                              payment_voucher:         row.payment_voucher         ?? "",
                              loading_card_no:         row.loading_card_no         ?? "",
                              car_id:                  row.car_id                  ?? "",
                              vehicle_type:            row.vehicle_type            ?? "",
                              driver_name:             row.driver_name             ?? "",
                              material_type:           row.material_type           ?? "",
                              meter_ton:               row.meter_ton != null ? String(row.meter_ton) : "",
                              unit_price:              row.unit_price != null ? String(row.unit_price) : "",
                              trips_count:             row.trips_count != null ? String(row.trips_count) : "1",
                              client_name:             row.client_name             ?? "",
                              supplier:                row.supplier                ?? "",
                              material_expense_diesel: row.material_expense_diesel != null ? String(row.material_expense_diesel) : "",
                              work_value:              row.work_value              != null ? String(row.work_value) : "",
                              destination:             row.destination             ?? "",
                              notes:                   row.notes                   ?? "",
                              cash_collection:         row.cash_collection         != null ? String(row.cash_collection) : "",
                              loading_region:          row.loading_region          ?? "",
                              unloading_region:        row.unloading_region        ?? "",
                              route_bonus:             row.route_bonus != null ? String(row.route_bonus) : "",
                              image_url:               row.image_url ?? "",
                              rental_broker_commission: row.rental_broker_commission != null ? String(row.rental_broker_commission) : "",
                              rental_broker_type:       row.rental_broker_type ?? "",
                              rental_broker_name:       row.rental_broker_name ?? "",
                            });
                            setFormTrailer(row.linked_trailer_number ?? "");
                            setBonusFound(!!(row.route_bonus));
                            setBonusIsPerReply(false);
                            if (row.loading_region) fetchRoutes(row.loading_region);
                            setOpenAdd(true);
                          }} className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title="تعديل كامل">
                            <Pencil size={13} className="text-blue-400" />
                          </button>
                          <button onClick={() => del(row.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="حذف">
                            <Trash2 size={13} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {columnFilterMenu && (
        <>
          <button
            type="button"
            aria-label="إغلاق قائمة التصفية"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setColumnFilterMenu(null)}
          />
          <div
            className="fixed z-50 w-[280px] rounded-xl border border-slate-200 bg-white p-3 text-right shadow-2xl"
            style={{ top: columnFilterMenu.top, left: columnFilterMenu.left }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-black text-slate-800">تصفية: {columnFilterMenu.label}</span>
              <button type="button" onClick={() => setColumnFilterMenu(null)} className="rounded p-1 hover:bg-slate-100">
                <X size={15} />
              </button>
            </div>
            <input
              autoFocus
              value={columnFilterSearch}
              onChange={event => setColumnFilterSearch(event.target.value)}
              placeholder="بحث داخل القيم..."
              className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#103c68]/20"
            />
            <div className="mb-2 flex gap-2 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setColumnFilters(current => ({
                  ...current,
                  [columnFilterMenu.key]: columnFilterOptions,
                }))}
                className="text-[#103c68] hover:underline"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setColumnFilters(current => ({ ...current, [columnFilterMenu.key]: [] }))}
                className="text-rose-600 hover:underline"
              >
                مسح التحديد
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {loadingColumnOptions ? (
                <div className="py-8 text-center text-xs text-slate-400">جاري تحميل كل قيم العمود...</div>
              ) : columnFilterOptions
                .filter(value => value.toLocaleLowerCase().includes(columnFilterSearch.trim().toLocaleLowerCase()))
                .map(value => {
                  const checked = columnFilters[columnFilterMenu.key]?.includes(value) || false;
                  return (
                    <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setColumnFilters(current => {
                          const selected = new Set(current[columnFilterMenu.key] || []);
                          if (selected.has(value)) selected.delete(value); else selected.add(value);
                          return { ...current, [columnFilterMenu.key]: Array.from(selected) };
                        })}
                        className="accent-[#103c68]"
                      />
                      <span className="truncate text-slate-700">{value}</span>
                    </label>
                  );
                })}
            </div>
            <button
              type="button"
              onClick={() => {
                setColumnFilterMenu(null);
              }}
              className="mt-3 w-full rounded-lg bg-[#103c68] px-3 py-2 text-xs font-black text-white"
            >
              إغلاق
            </button>
          </div>
        </>
      )}

      {/* ── Invoice extraction review modal ── */}
      {invoiceTrip && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setInvoiceTrip(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100 rounded-t-2xl">
              <div>
                <h2 className="font-black text-lg text-gray-900 flex items-center gap-2"><ScanLine size={19} className="text-violet-600" />سحب بيانات الفواتير</h2>
                <p className="text-xs text-gray-500 mt-1">الرحلة #{invoiceTrip.id} — {invoiceTrip.car_id} — لن تتغير السيارة أو السائق أو التيدر أو صورة الحمولة.</p>
              </div>
              <button onClick={() => setInvoiceTrip(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
                سيقارن النظام صورة الرحلة تلقائيًا بصور التعريفات المعلّمة، ثم يختار مسار التحميل والتنزيل المطابق.
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-bold text-sm text-gray-800">صورة الحمولة الموجودة في الرحلة</div>
                    <div className="text-[11px] text-gray-500">سيتم سحب البيانات من هذه الصورة مباشرةً، بدون رفع صورة جديدة.</div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${invoiceTrip.image_url ? "text-emerald-700 bg-emerald-100" : "text-red-700 bg-red-100"}`}>
                    {invoiceTrip.image_url ? "الصورة جاهزة" : "لا توجد صورة"}
                  </span>
                </div>
                {invoiceTrip.image_url ? (
                  <a href={invoiceTrip.image_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-8 font-bold text-violet-700 hover:bg-violet-50">
                    <FileImage size={22} /> اضغط لفتح صورة الحمولة
                  </a>
                ) : (
                  <div className="w-full py-8 text-center text-red-500 border-2 border-dashed border-red-200 rounded-xl">
                    <FileImage size={28} className="mx-auto mb-2" />هذه الرحلة لا تحتوي على صورة حمولة
                  </div>
                )}
              </div>

              <button onClick={extractInvoiceData} disabled={!invoiceTrip.image_url || invoiceExtracting}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-black disabled:opacity-50">
                <ScanLine size={17} className={invoiceExtracting ? "animate-pulse" : ""} />
                {invoiceExtracting ? "جاري قراءة الفواتير ومطابقة التعريفة..." : "قراءة البيانات وعرضها للمراجعة"}
              </button>

              {invoiceResult && (
                <div className="space-y-4">
                  {invoiceResult.conflicts.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      <div className="font-black flex items-center gap-1.5 mb-1"><AlertTriangle size={15} />تحتاج مراجعة</div>
                      <ul className="list-disc pr-5 space-y-1 text-xs">{invoiceResult.conflicts.map((conflict, index) => <li key={index}>{conflict}</li>)}</ul>
                    </div>
                  )}
                  {(invoiceResult.extracted?.recipient_signature_readable ||
                    invoiceResult.signature_needs_confirmation ||
                    invoiceResult.extracted?.recipient_signature_matches_template === false) && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                      {invoiceResult.extracted?.recipient_signature_readable && (
                        <div className="text-xs text-violet-700 mb-2">
                          توقيع المستلم المقروء:
                          <span className="font-black mr-1">{invoiceResult.extracted.recipient_signature || "تم التعرف عليه بصرياً"}</span>
                        </div>
                      )}
                      {invoiceResult.signature_needs_confirmation && invoiceResult.signature_question && (
                        <>
                          <div className="font-black text-violet-900 mb-3">{invoiceResult.signature_question}</div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setSignatureConfirmed(true)}
                              className={`px-5 py-2 rounded-xl font-bold text-sm ${signatureConfirmed === true ? "bg-emerald-600 text-white" : "bg-white border border-emerald-300 text-emerald-700"}`}>
                              نعم
                            </button>
                            <button type="button" onClick={() => setSignatureConfirmed(false)}
                              className={`px-5 py-2 rounded-xl font-bold text-sm ${signatureConfirmed === false ? "bg-red-600 text-white" : "bg-white border border-red-300 text-red-700"}`}>
                              لا
                            </button>
                          </div>
                          {signatureConfirmed === false && (
                            <div className="text-xs text-red-700 font-bold mt-2">لن يتم حفظ مكان التنزيل. صحح التعريفة أو أعد القراءة.</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                    <div className="flex justify-between gap-3 mb-4">
                      <div>
                        <div className="font-black text-emerald-900">معاينة قبل الحفظ</div>
                        <div className="text-xs text-emerald-700 mt-0.5">يمكن تصحيح القيم؛ لا تُستبدل البيانات الموجودة، باستثناء اعتماد تاريخ الفاتورة الظاهر.</div>
                      </div>
                      <div className="text-xs text-emerald-700 text-left">
                        ثقة القراءة: {Math.round((invoiceResult.extracted?.confidence || 0) * 100)}%
                        {invoiceResult.matched_by && <div>التعريفة: {invoiceResult.matched_by}</div>}
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {([
                        ["date", "تاريخ الفاتورة", "date"],
                        ["material_type", "نوع الحمولة", "text"],
                        ["vehicle_type", "نوع السيارة (من التعريفة)", "text"],
                        ["meter_ton", "الوزن / الكمية", "number"],
                        ["payment_voucher", "رقم الفاتورة / المستند", "text"],
                        ["loading_card_no", "رقم الفاتورة في كارت التحميل", "text"],
                        ["supplier", "المورد", "text"],
                        ["client_name", "العميل", "text"],
                        ["loading_region", "مكان التحميل (من التعريفة)", "text"],
                        ["unloading_region", "مكان التنزيل (من التعريفة)", "text"],
                        ["unit_price", "سعر الرد (من التعريفة)", "number"],
                        ["route_bonus", "مصروف السائق (من التعريفة)", "number"],
                      ] as const).map(([key, label, type]) => (
                        <div key={key}>
                          <label className="block text-[11px] font-bold text-gray-600 mb-1">{label}</label>
                          <input type={type} value={invoiceResult.preview[key] ?? ""}
                            onChange={event => setInvoiceResult(result => result ? {
                              ...result,
                              preview: {
                                ...result.preview,
                                [key]: type === "number" ? (event.target.value ? Number(event.target.value) : null) : event.target.value,
                                ...(key === "unloading_region" ? { destination: event.target.value } : {}),
                              },
                            } : result)}
                            className="w-full border border-emerald-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                        </div>
                      ))}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 mt-4">
                      {(() => {
                        const quantity = Number(invoiceResult.preview.meter_ton) || 0;
                        const price = Number(invoiceResult.preview.unit_price) || 0;
                        const driverExpense = Number(invoiceResult.preview.route_bonus) || 0;
                        const returnValue = quantity > 0 ? quantity * price : price;
                        const netValue = returnValue - driverExpense - (Number(invoiceTrip?.material_expense_diesel) || 0);
                        return (
                          <>
                            <div className="rounded-xl bg-white border border-blue-200 px-4 py-3">
                              <div className="text-[11px] font-bold text-blue-600">قيمة الرد بدون ضريبة</div>
                              <div className="text-lg font-black text-blue-900 mt-1">{returnValue.toFixed(2)} ر.س</div>
                            </div>
                            <div className="rounded-xl bg-white border border-emerald-200 px-4 py-3">
                              <div className="text-[11px] font-bold text-emerald-600">الصافي بعد مصروف السائق والمواد/الديزل</div>
                              <div className="text-lg font-black text-emerald-900 mt-1">{netValue.toFixed(2)} ر.س</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={saveInvoiceExtraction}
                      disabled={invoiceSaving ||
                        invoiceResult.extracted?.recipient_signature_matches_template === false ||
                        (invoiceResult.signature_needs_confirmation === true && signatureConfirmed !== true)}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black disabled:opacity-50">
                      <Save size={16} />{invoiceSaving ? "جاري الحفظ..." : "تأكيد واستكمال البيانات الناقصة"}
                    </button>
                    <button onClick={() => setInvoiceResult(null)} className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm">إعادة القراءة</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Clear all confirm ── */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <div className="font-black text-gray-900">مسح جميع الردود</div>
                <div className="text-sm text-gray-500">هذا الإجراء لا يمكن التراجع عنه</div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              سيتم حذف <span className="font-bold text-red-600">{rows.length} قيد</span> نهائياً من قاعدة البيانات.
            </p>
            <div className="flex gap-3">
              <button onClick={clearAll} disabled={clearing}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl font-bold disabled:opacity-60 hover:bg-red-700">
                {clearing ? "جاري المسح..." : "نعم، احذف الكل"}
              </button>
              <button onClick={() => setCC(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-200">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stop edit modal ── */}
      {editStopId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setEditStopId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-black text-base flex items-center gap-2">
                <PauseCircle size={16} className="text-amber-500" />
                تعديل سجل التوقف
              </h2>
              <button onClick={() => setEditStopId(null)} className="p-1.5 hover:bg-gray-100 rounded-xl">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">سبب التوقف</label>
                <select
                  value={stopEditForm.reason}
                  onChange={e => setStopEditForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <option value="توقف بدون عذر">توقف بدون عذر</option>
                  <option value="في الورشة">في الورشة</option>
                  <option value="إجازة">إجازة</option>
                  <option value="عطل">عطل</option>
                  <option value="غياب">غياب</option>
                  <option value="ظروف طارئة">ظروف طارئة</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  value={stopEditForm.notes}
                  onChange={e => setStopEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="أي تفاصيل إضافية..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={async () => {
                    await fetch(`/api/trips/stops/${editStopId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(stopEditForm),
                    });
                    setStopRows(prev => prev.map(s => s.id === editStopId ? { ...s, ...stopEditForm } : s));
                    setEditStopId(null);
                  }}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
                >
                  <Save size={14} /> حفظ
                </button>
                <button
                  onClick={() => setEditStopId(null)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-200"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add modal ── */}
      {openAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setOpenAdd(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="font-black text-lg flex items-center gap-2">
                <Truck size={18} className="text-[#103c68]" />
                {editId !== null ? "تعديل رحلة" : "إضافة رحلة / رد"}
              </h2>
              <button onClick={() => { setOpenAdd(false); setEditId(null); }} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">اليوم *</label>
                  <input type="date" required value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">سند الصرف</label>
                  <input value={form.payment_voucher}
                    onChange={e => setForm(f => ({ ...f, payment_voucher: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">رقم كارت التحميل</label>
                  <input value={form.loading_card_no}
                    onChange={e => setForm(f => ({ ...f, loading_card_no: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                {/* datalist for teidarat */}
                <datalist id="trips-teidar-list">
                  {teidarList.map(t => (
                    <option key={t.id} value={t.teidara_number ?? ""} />
                  ))}
                </datalist>

                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">رقم السيارة *</label>
                  <select required value={form.car_id}
                    onChange={e => handleVehicleSelect(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                    <option value="">-- اختر السيارة --</option>
                    {formVehicles.map(v => (
                      <option key={v.plate_number} value={v.plate_number}>{v.plate_number}</option>
                    ))}
                    {/* allow keeping existing value if not in current fleet list */}
                    {form.car_id && !formVehicles.find(v => v.plate_number === form.car_id) && (
                      <option value={form.car_id}>{form.car_id}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#103c68] mb-1">🔗 رقم التيدر <span className="text-gray-400 font-normal text-[10px]">(من جدول التيدارات)</span></label>
                  <input
                    list="trips-teidar-list"
                    value={formTrailer}
                    onChange={e => setFormTrailer(e.target.value)}
                    placeholder="يُملأ تلقائياً عند اختيار السيارة"
                    className="w-full border border-blue-100 rounded-xl px-3 py-2 text-sm bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#103c68] mb-1">نوع السيارة <span className="text-gray-400 font-normal text-[10px]">(محسوب تلقائياً)</span></label>
                  <input readOnly value={form.vehicle_type}
                    onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))}
                    placeholder="يُملأ تلقائياً عند اختيار السيارة"
                    className="w-full border border-blue-100 rounded-xl px-3 py-2 text-sm bg-blue-50 text-blue-800 focus:outline-none cursor-default" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#103c68] mb-1">اسم السائق <span className="text-gray-400 font-normal text-[10px]">(تلقائي أو اكتب يدوياً)</span></label>
                  <input value={form.driver_name}
                    list={editId === null ? "trip-driver-options" : undefined}
                    onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                    placeholder="يُملأ تلقائياً أو اكتب اسم السائق…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                  {editId === null && (
                    <datalist id="trip-driver-options">
                      {tripDrivers.map(driver => (
                        <option key={driver.id} value={driver.name} />
                      ))}
                    </datalist>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">الحمولة</label>
                  <input value={form.material_type}
                    onChange={e => setForm(f => ({ ...f, material_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">متر/طن</label>
                  <input type="number" step="0.01" min="0" value={form.meter_ton}
                    onChange={e => setForm(f => ({ ...f, meter_ton: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    سعر الرد/م/ط *
                    {bonusFound && form.unit_price
                      ? <span className="mr-1 text-[10px] text-emerald-600 font-normal">(من التعريفة ✓)</span>
                      : null}
                  </label>
                  <input type="number" step="0.01" min="0" required value={form.unit_price}
                    onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${bonusFound && form.unit_price ? "border-emerald-300 bg-emerald-50/40 focus:ring-emerald-400/40 text-emerald-800" : "border-gray-200 bg-gray-50 focus:ring-[#103c68]/30"}`} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">عدد الردود *</label>
                  <input type="number" min="1" required value={form.trips_count}
                    onChange={e => setForm(f => ({ ...f, trips_count: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    قيمة الرد بدون ضريبة
                    <span className="text-gray-400 font-normal text-[10px] mr-1">(متر/طن × السعر × العدد)</span>
                  </label>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-sm font-bold text-blue-700">
                    {rvnv.toLocaleString("ar-SA")} ر.س
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    الصافي
                    <span className="text-gray-400 font-normal text-[10px] mr-1">(قيمة الرد − بونص المسار)</span>
                  </label>
                  <div className={`border rounded-xl px-3 py-2 text-sm font-bold ${netVal >= 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {netVal.toLocaleString("ar-SA")} ر.س
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">العميل وتصنيفه</label>
                  <select value={form.client_name}
                    onChange={e => setForm(f => ({
                      ...f,
                      client_name: e.target.value,
                      rental_broker_commission: "",
                      rental_broker_type: "",
                      rental_broker_name: "",
                    }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                    <option value="">بدون عميل</option>
                    {tripCustomers.map(customer => (
                      <option key={customer.id} value={customer.name}>
                        {customer.name} — {customer.customer_type === "company" ? "تابع للشركة" : "إيجار خارجي"}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedCustomerType === "rental" && (
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <div>
                      <label className="block text-xs font-bold text-amber-900 mb-1">إجمالي الإيجار</label>
                      <div className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-black text-slate-800">
                        {rvnv.toLocaleString("ar-SA")} ر.س
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-amber-900 mb-1">عمولة الوسيط</label>
                      <input type="number" step="0.01" min="0" max={rvnv} value={form.rental_broker_commission}
                        onChange={e => setForm(f => ({ ...f, rental_broker_commission: e.target.value }))}
                        className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-amber-900 mb-1">الوسيط</label>
                      <select value={form.rental_broker_type}
                        required={brokerCommission > 0}
                        disabled={brokerCommission <= 0}
                        onChange={e => setForm(f => ({ ...f, rental_broker_type: e.target.value, rental_broker_name: e.target.value === "self" ? "" : f.rental_broker_name }))}
                        className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm disabled:opacity-50">
                        <option value="">حدد الوسيط</option>
                        <option value="self">أنا الوسيط</option>
                        <option value="external">وسيط خارجي</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-amber-900 mb-1">حق الشركة/صاحب السيارة</label>
                      <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-black text-emerald-700">
                        {companyShare.toLocaleString("ar-SA")} ر.س
                      </div>
                    </div>
                    {form.rental_broker_type === "external" && (
                      <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-amber-900 mb-1">اسم الوسيط الخارجي</label>
                        <input value={form.rental_broker_name} required
                          onChange={e => setForm(f => ({ ...f, rental_broker_name: e.target.value }))}
                          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">المورد</label>
                  <input value={form.supplier}
                    onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">مصروف مواد+ديزل</label>
                  <input type="number" step="0.01" min="0" value={form.material_expense_diesel}
                    onChange={e => setForm(f => ({ ...f, material_expense_diesel: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-700 mb-1">
                    منطقة التحميل <span className="text-gray-400 font-normal text-[10px]">(لن يؤدي الإدخال اليدوي إلى إنشاء تعريفة)</span>
                  </label>
                  <input list="loading-places-list" value={form.loading_region}
                    onChange={e => handleLoadingChange(e.target.value)}
                    placeholder="اختر أو اكتب منطقة التحميل"
                    className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
                  <datalist id="loading-places-list">
                    {loadingPlaces.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-700 mb-1">
                    منطقة التنزيل
                    {routeOptions.length > 0
                      ? <span className="mr-1 text-[10px] text-emerald-600 font-normal">({routeOptions.length} وجهة من التعريفة)</span>
                      : <span className="text-gray-400 font-normal text-[10px]"> (يمكن الكتابة دون إنشاء تعريفة)</span>}
                  </label>
                  <input list="unloading-places-list" value={form.unloading_region}
                    onChange={e => handleUnloadingChange(e.target.value)}
                    placeholder={routeOptions.length > 0 ? "اختر وجهة أو اكتب جديد…" : "اختر أو اكتب منطقة التنزيل"}
                    className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
                  <datalist id="unloading-places-list">
                    {(routeOptions.length > 0 ? routeOptions.map(r => r.unloading_place) : unloadingPlaces)
                      .map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-700 mb-1">
                    بونص المسار
                    {bonusFound
                      ? <span className="mr-1 text-[10px] text-emerald-600 font-normal">(من التعريفة ✓)</span>
                      : form.loading_region && form.unloading_region
                        ? <span className="mr-1 text-[10px] text-gray-500 font-normal">(غير مرتبط بتعريفة محفوظة)</span>
                        : null}
                  </label>
                  <input type="number" step="0.01" min="0" value={form.route_bonus}
                    onChange={e => {
                      setForm(f => ({ ...f, route_bonus: e.target.value }));
                      setBonusFound(false);
                      setBonusIsPerReply(true);
                    }}
                    placeholder="يُملأ تلقائياً من التعريفة"
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${bonusFound ? "border-emerald-300 bg-emerald-50/40 focus:ring-emerald-400/40 text-emerald-800" : "border-gray-200 bg-gray-50 focus:ring-[#103c68]/30"}`} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">التحصيل النقدي</label>
                  <input type="number" step="0.01" min="0" value={form.cash_collection}
                    onChange={e => setForm(f => ({ ...f, cash_collection: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">ملاحظات</label>
                  <textarea rows={2} value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
                </div>
                {/* صورة الحمولة — لا تُحمّل إلا عند فتحها */}
                {editId !== null && form.image_url && (
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-600 mb-1">صورة الحمولة</label>
                    <div className="flex items-center gap-3">
                      <a href={form.image_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700 hover:bg-blue-100">
                        <FileImage size={17} /> فتح صورة الحمولة
                      </a>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">لا تُحمّل الصورة إلا عند فتحها</p>
                        <button type="button" onClick={() => setForm(f => ({ ...f, image_url: "" }))}
                          className="mt-2 text-xs text-red-500 hover:text-red-700 underline">
                          إزالة الصورة
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-2.5 rounded-xl font-bold hover:bg-[#0d2e50] disabled:opacity-60">
                  <Save size={15} />{submitting ? "جاري الحفظ..." : "حفظ الرحلة"}
                </button>
                <button type="button" onClick={() => setOpenAdd(false)}
                  className="px-6 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-200">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
