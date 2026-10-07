import { useState, useEffect, useRef } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { Plus, X, Package, Car, Printer, ClipboardList, CheckCheck, Truck, Phone, Pencil, Trash2, Upload, Download, FileSpreadsheet, AlertTriangle, Paperclip, ScanText, Search, CheckCircle, UserCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

type Driver  = { id: number; driver_name: string; phone: string; vehicle_plate: string; branch?: string };
type Vehicle = { id: number; plate: string; type: string; status: string; driver_name?: string; driver_phone?: string; entity?: string; branch?: string };
type SupplyReq = {
  id: number; product_name: string; requested_qty: number; unit: string;
  trailer_loads: number; status: string; priority: string; notes?: string;
  warehouse_name?: string; requested_by?: string; created_at: string;
  vehicle_plate?: string; driver_name?: string; driver_phone?: string;
};
type LoadingOrder = {
  id: number;
  permit_number: string | null; cement_ref_number: string | null;
  vehicle_plate: string; driver_name: string; driver_phone: string | null;
  cargo_type: string | null;
  unload_location: string | null; status: string; confirmed_at: string | null;
  unload_location_id: number | null;
  unload_location_phone: string | null; unload_location_map_url: string | null;
  saib_order_id: number | null; supply_request_id: number | null;
  created_by: string | null; notes: string | null;
  attachment_url: string | null; loading_invoice_url: string | null; net_weight: string | null; created_at: string;
  tariff_id: number | null;
  tariff_loading_place: string | null; tariff_unloading_place: string | null;
  tariff_bonus: number | null; tariff_rental_per_ton: number | null;
};
type BulkerTariff = {
  id: number; loading_place: string; unloading_place: string;
  vehicle_type: string | null; cargo_type: string | null;
  driver_expense: number; rental: number;
};
const tonsFromInvoice = (raw: string | null) => {
  const normalized = (raw || "").replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/٬/g, ",").replace(/٫/g, ".");
  const value = Number(normalized.match(/\d[\d,.]*/)?.[0].replace(/,/g, "") || 0);
  return /كجم|كيلو|kg/i.test(normalized) || (!/طن|ton/i.test(normalized) && value >= 1000) ? value / 1000 : value;
};
type SaibOrder = {
  id: number; order_number: string; customer_name: string | null; customer_phone: string;
  product_name: string; quantity: number; unit: string;
  delivery_location: string | null; packaging_type: string;
  stage: string; created_at: string;
};
type BulkerVehicle = {
  id: number; vehicle_plate: string; driver_name: string;
  destination: string | null; driver_phone: string | null;
  supervisor_phone: string | null; notes: string | null;
  is_stopped: number; created_at: string;
};
const EMPTY_BV = { vehicle_plate: "", driver_name: "", destination: "", driver_phone: "", supervisor_phone: "", notes: "" };
type ImportRow = {
  permit_number: string; cement_ref_number: string; vehicle_plate: string;
  driver_name: string; cargo_type: string; unload_location: string; tariff_id: string; notes: string;
  _valid: boolean;
};
type BvImportRow = {
  vehicle_plate: string; driver_name: string; destination: string;
  driver_phone: string; supervisor_phone: string; notes: string;
  _valid: boolean;
};
type UnloadLocation = {
  id: number; name: string; notes: string | null;
  phone_number: string | null; map_url: string | null; created_at: string;
};

export default function BulkerSupervisorPage() {
  const { user } = useAuth();
  const [tab, setTab]                   = useRememberedState("bulker-supervisor-tab", "saib" as "saib"|"loading-orders"|"needs-location"|"vehicles"|"locations");
  const [quickLocMap,  setQuickLocMap]  = useState<Record<number, string>>({});
  const [quickTariffMap, setQuickTariffMap] = useState<Record<number, string>>({});
  const [savingQuickLoc, setSavingQuickLoc] = useState<Record<number, boolean>>({});
  const [supplyReqs, setSupplyReqs]     = useState<SupplyReq[]>([]);
  const [drivers, setDrivers]           = useState<Driver[]>([]);
  const [vehicles, setVehicles]         = useState<Vehicle[]>([]);
  const [supplyAssignId, setSupplyAssignId] = useState<number | null>(null);
  const [supplyForm, setSupplyForm]     = useState({ vehicle_plate: "", driver_name: "", driver_phone: "" });

  // سائب orders waiting for bulker assignment
  const [saibOrders, setSaibOrders]     = useState<SaibOrder[]>([]);
  const [saibAssignId, setSaibAssignId] = useState<number | null>(null);
  const [saibForm, setSaibForm]         = useState({ vehicle_plate: "", driver_name: "", driver_phone: "" });
  const [saibSaving, setSaibSaving]     = useState(false);

  // ── دفتر سيارات البلكر ──────────────────────────────────────
  const [bulkerVehiclesList, setBulkerVehiclesList] = useState<BulkerVehicle[]>([]);

  const [bvForm, setBvForm]           = useState({ ...EMPTY_BV, supervisor_phone: "" });
  const [editingBV, setEditingBV]     = useState<BulkerVehicle | null>(null);
  const [savingBV, setSavingBV]       = useState(false);
  const [bvSearch, setBvSearch]       = useRememberedState("bulker-supervisor-vehicle-search", "");
  const [syncingFleet, setSyncingFleet] = useState(false);

  // ── أوامر التحميل ──────────────────────────────────────────
  const EMPTY_LO = { permit_number: "", cement_ref_number: "", vehicle_plate: "", driver_name: "", driver_phone: "", cargo_type: "", unload_location: "", unload_location_id: "", notes: "", net_weight: "", tariff_id: "" };
  const [loadingOrders, setLoadingOrders] = useState<LoadingOrder[]>([]);
  const [bulkerTariffs, setBulkerTariffs] = useState<BulkerTariff[]>([]);
  const [loSearch, setLoSearch]           = useRememberedState("bulker-supervisor-loading-order-search", "");
  const [showNewLO, setShowNewLO]         = useState(false);
  const [loForm, setLoForm]               = useState({ ...EMPTY_LO });
  const [savingLO, setSavingLO]           = useState(false);
  const [confirmingLO, setConfirmingLO]   = useState<number | null>(null);
  const [editLO, setEditLO]               = useState<LoadingOrder | null>(null);
  const [editForm, setEditForm]           = useState({ ...EMPTY_LO });
  const [savingEditLO, setSavingEditLO]   = useState(false);
  const [editAttachFile, setEditAttachFile]         = useState<File | null>(null);
  const [editAttachUploading, setEditAttachUploading] = useState(false);
  const [parsingEditPdf, setParsingEditPdf]         = useState(false);

  // ── مرفق أمر التحميل ────────────────────────────────────────────────────
  const [loAttachFile, setLoAttachFile]       = useState<File | null>(null);
  const [loAttachUploading, setLoAttachUploading] = useState(false);

  // ── معاينة المرفقات (صور/PDF بدون امتداد في الرابط) ─────────────────────
  const [brokenPreviews, setBrokenPreviews] = useState<Set<string>>(new Set());
  const markPreviewBroken = (key: string) =>
    setBrokenPreviews(prev => new Set(prev).add(key));

  const renderFilePreview = (rawUrl: string, key: string, label: string) => {
    const href = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `/api/storage${rawUrl}`.replace(/\/api\/storage\/api\/storage/, "/api/storage");
    if (brokenPreviews.has(key)) {
      return (
        <a href={href} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors">
          <Paperclip size={12} />{label}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" className="mt-2 block w-24 h-16 rounded-lg overflow-hidden border border-indigo-200 hover:opacity-80 transition-opacity">
        <img src={href} alt={label} className="w-full h-full object-cover" onError={() => markPreviewBroken(key)} />
      </a>
    );
  };

  // ── تحديد وحذف أوامر التحميل ──────────────────────────────────────────
  const [selectedLOs, setSelectedLOs]   = useState<Set<number>>(new Set());
  const [deletingLOs, setDeletingLOs]   = useState(false);

  // ── استيراد / تصدير Excel — أوامر التحميل ───────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows]           = useState<ImportRow[]>([]);
  const [importingLO, setImportingLO]         = useState(false);
  const importFileRef                         = useRef<HTMLInputElement>(null);

  // ── استيراد / تصدير Excel — دفتر السيارات ────────────────────────────────
  const [showBvImportModal, setShowBvImportModal] = useState(false);
  const [bvImportRows, setBvImportRows]           = useState<BvImportRow[]>([]);
  const [importingBV, setImportingBV]             = useState(false);
  const bvImportFileRef                           = useRef<HTMLInputElement>(null);

  // ── مواقع التنزيل ────────────────────────────────────────────────────────
  const [unloadLocations, setUnloadLocations]   = useState<UnloadLocation[]>([]);
  const [locForm, setLocForm]                   = useState({ name: "", notes: "", phone_number: "", map_url: "" });
  const [editingLoc, setEditingLoc]             = useState<UnloadLocation | null>(null);
  const [savingLoc, setSavingLoc]               = useState(false);

  // ── قراءة PDF وثيقة التسليم ──────────────────────────────────────────────
  const [parsingPdf, setParsingPdf] = useState(false);
  const pdfInputRef                 = useRef<HTMLInputElement>(null);

  const load = () => {
    fetch("/api/supply-requests").then(r => r.json()).then(setSupplyReqs).catch(() => {});
    fetch("/api/drivers").then(r => r.json()).then(setDrivers).catch(() => {});
    fetch("/api/fleet-vehicles-list").then(r => r.json()).then((data: any[]) =>
      setVehicles(data.map(v => ({ id: v.id, plate: v.plate_number, type: v.vehicle_type || "", status: v.status, driver_name: v.driver_name || "", driver_phone: v.driver_phone || v.linked_user_phone || "", entity: v.entity || "", branch: v.branch || "" })))
    ).catch(() => {});
    fetch("/api/workflow/orders?role=bulker")
      .then(r => r.json()).then(d => setSaibOrders(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/loading-orders").then(r => r.json()).then(setLoadingOrders).catch(() => {});
    fetch("/api/loading-orders/bulker-tariffs").then(r => r.ok ? r.json() : []).then(setBulkerTariffs).catch(() => {});
    fetch("/api/bulker-vehicles").then(r => r.json()).then(setBulkerVehiclesList).catch(() => {});
    fetch("/api/unload-locations").then(r => r.json()).then(setUnloadLocations).catch(() => {});
  };

  const fmtDateTime = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso + (iso.includes("T") ? "" : "Z"));
    return d.toLocaleString("ar-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  };
  const orderTariff = (o: LoadingOrder): BulkerTariff | undefined => {
    const current = bulkerTariffs.find(t => t.id === o.tariff_id);
    if (!o.tariff_loading_place) return current;
    return {
      id: o.tariff_id || 0, loading_place: o.tariff_loading_place,
      unloading_place: o.tariff_unloading_place || "",
      vehicle_type: current?.vehicle_type || "بلكر", cargo_type: current?.cargo_type || null,
      driver_expense: o.tariff_bonus || 0, rental: o.tariff_rental_per_ton || 0,
    };
  };

  const updateLoadingOrder = async () => {
    if (!editLO) return;
    if (!editForm.vehicle_plate || !editForm.driver_name) { alert("رقم السيارة واسم السائق مطلوبان"); return; }
    if (editForm.unload_location && !editForm.tariff_id) { alert("اختر تعريفة عند تحديد موقع التنزيل"); return; }
    if (editForm.unload_location && !editForm.unload_location_id && editForm.unload_location !== (editLO.unload_location || "")) {
      alert("اختر موقعًا محفوظًا من القائمة"); return;
    }
    setSavingEditLO(true);
    try {
      let attachment_url: string | undefined = undefined;
      if (editAttachFile) {
        setEditAttachUploading(true);
        attachment_url = await uploadAttachment(editAttachFile);
        setEditAttachUploading(false);
      }
      const r = await fetch(`/api/loading-orders/${editLO.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, ...(attachment_url ? { attachment_url } : {}) }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل التحديث"); return; }
      setEditLO(null);
      setEditAttachFile(null);
      load();
    } catch (e) { alert((e as Error).message || "فشل الاتصال"); setEditAttachUploading(false); }
    finally { setSavingEditLO(false); }
  };

  const exportLoadingOrdersExcel = () => {
    const headers = ["رقم", "رقم الفسح", "مرجع الاسمنت", "رقم السيارة", "اسم السائق", "نوع الحمولة", "موقع التنزيل", "الحالة", "تاريخ الإنشاء", "تاريخ التنزيل", "ملاحظات", "مكان التحميل", "التعريفة", "الوزن طن", "البونص", "الإيجار"];
    const rows = loadingOrders.map(o => [
      o.id,
      o.permit_number || "",
      o.cement_ref_number || "",
      o.vehicle_plate,
      o.driver_name,
      o.cargo_type || "",
      o.unload_location || "",
      o.status === "confirmed" ? "تم التنزيل" : "بانتظار التنزيل",
      o.created_at?.slice(0, 16) || "",
      o.confirmed_at?.slice(0, 16) || "",
      o.notes || "",
      orderTariff(o)?.loading_place || "",
      o.tariff_id || "",
      tonsFromInvoice(o.net_weight),
      orderTariff(o)?.driver_expense || 0,
      (orderTariff(o)?.rental || 0) * tonsFromInvoice(o.net_weight),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [6,14,18,16,16,14,16,14,16,16,20].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "أوامر التحميل");
    XLSX.writeFile(wb, `أوامر_التحميل_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const downloadImportTemplate = () => {
    const headers = ["رقم الفسح", "مرجع الاسمنت", "رقم السيارة *", "اسم السائق *", "نوع الحمولة", "موقع التنزيل (اسم محفوظ)", "رقم التعريفة", "ملاحظات"];
    const example = ["ف-1234", "M-5678", "أ ب ج 1234", "محمد علي", "اسمنت سائب", "", "", ""];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = [14, 16, 20, 20, 14, 22, 14, 18].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج الاستيراد");
    XLSX.writeFile(wb, "نموذج_أوامر_التحميل.xlsx");
  };

  const parseImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;
      const wb = XLSX.read(data, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      const colMap: Record<string, keyof Omit<ImportRow,"_valid">> = {
        "رقم الفسح": "permit_number", "permit_number": "permit_number",
        "مرجع الاسمنت": "cement_ref_number", "cement_ref_number": "cement_ref_number",
        "رقم السيارة *": "vehicle_plate", "رقم السيارة": "vehicle_plate", "vehicle_plate": "vehicle_plate",
        "اسم السائق *": "driver_name", "اسم السائق": "driver_name", "driver_name": "driver_name",
        "نوع الحمولة": "cargo_type", "cargo_type": "cargo_type",
        "موقع التنزيل": "unload_location", "موقع التنزيل (اسم محفوظ)": "unload_location", "unload_location": "unload_location",
        "رقم التعريفة": "tariff_id", "التعريفة": "tariff_id", "tariff_id": "tariff_id",
        "ملاحظات": "notes", "notes": "notes",
      };
      const mapped: ImportRow[] = rawRows.map(row => {
        const r: ImportRow = { permit_number: "", cement_ref_number: "", vehicle_plate: "", driver_name: "", cargo_type: "", unload_location: "", tariff_id: "", notes: "", _valid: false };
        for (const [h, val] of Object.entries(row)) {
          const field = colMap[h.trim()];
          if (field) {
            const strVal = String(val || "").trim();
            r[field] = field === "vehicle_plate"
              ? strVal.replace(/\D/g, "")  // أرقام فقط — حذف الحروف والمسافات
              : strVal;
          }
        }
        const hasLocation = !!r.unload_location.trim();
        const locationExists = !hasLocation || unloadLocations.some(l => l.name.trim().toLocaleLowerCase() === r.unload_location.trim().toLocaleLowerCase());
        const tariff = r.tariff_id ? bulkerTariffs.find(t => String(t.id) === r.tariff_id && (!t.cargo_type || t.cargo_type === r.cargo_type)) : null;
        r._valid = !!(r.vehicle_plate && r.driver_name && locationExists
          && (!r.tariff_id || tariff)
          && (!hasLocation || tariff));
        return r;
      }).filter(r => Object.entries(r).some(([k, v]) => k !== "_valid" && v));
      setImportRows(mapped);
      setShowImportModal(true);
    };
    reader.readAsBinaryString(file);
  };

  const importLoadingOrders = async () => {
    const validRows = importRows.filter(r => r._valid);
    if (validRows.length === 0) return;
    setImportingLO(true);
    try {
      const r = await fetch("/api/loading-orders/bulk-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows, created_by: user?.name || user?.phone }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل الاستيراد"); return; }
      const { inserted, skipped } = await r.json();
      const msg = `تم استيراد ${inserted} صف بنجاح${skipped > 0 ? `\nتم تخطي ${skipped} صف (بيانات ناقصة)` : ""}`;
      alert(msg);
      setShowImportModal(false);
      setImportRows([]);
      load();
    } catch { alert("فشل الاتصال"); }
    finally { setImportingLO(false); }
  };

  // ── دفتر السيارات — تصدير / استيراد Excel ────────────────────────────────
  const exportBulkerVehicles = () => {
    const headers = ["رقم السيارة", "اسم السائق", "الجهة", "رقم السائق", "رقم المسؤول", "ملاحظات"];
    const rows = bulkerVehiclesList.map(v => [
      v.vehicle_plate, v.driver_name, v.destination || "", v.driver_phone || "", v.supervisor_phone || "", v.notes || "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [20, 22, 16, 16, 16, 24].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "دفتر السيارات");
    XLSX.writeFile(wb, `دفتر_السيارات_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const downloadBvTemplate = () => {
    const headers = ["رقم السيارة *", "اسم السائق *", "الجهة", "رقم السائق", "رقم المسؤول", "ملاحظات"];
    const example = ["أ ب ج 1234", "محمد علي", "الرياض", "0501234567", "0509876543", ""];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = [20, 22, 16, 16, 16, 24].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج الاستيراد");
    XLSX.writeFile(wb, "نموذج_دفتر_السيارات.xlsx");
  };

  const parseBvImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;
      const wb = XLSX.read(data, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      const colMap: Record<string, keyof Omit<BvImportRow, "_valid">> = {
        "رقم السيارة *": "vehicle_plate", "رقم السيارة": "vehicle_plate", "vehicle_plate": "vehicle_plate",
        "اسم السائق *": "driver_name",  "اسم السائق": "driver_name",  "driver_name": "driver_name",
        "الجهة": "destination",          "destination": "destination",
        "رقم السائق": "driver_phone",    "driver_phone": "driver_phone",
        "رقم المسؤول": "supervisor_phone","supervisor_phone": "supervisor_phone",
        "ملاحظات": "notes",              "notes": "notes",
      };
      const mapped: BvImportRow[] = rawRows.map(row => {
        const r: BvImportRow = { vehicle_plate: "", driver_name: "", destination: "", driver_phone: "", supervisor_phone: "", notes: "", _valid: false };
        for (const [h, val] of Object.entries(row)) {
          const field = colMap[h.trim()];
          if (field) {
            const strVal = String(val ?? "").trim();
            r[field] = field === "vehicle_plate"
              ? strVal.replace(/\D/g, "")  // أرقام فقط
              : strVal;
          }
        }
        r._valid = !!(r.vehicle_plate && r.driver_name);
        return r;
      }).filter(r => Object.entries(r).some(([k, v]) => k !== "_valid" && v));
      setBvImportRows(mapped);
      setShowBvImportModal(true);
    };
    reader.readAsBinaryString(file);
  };

  const importBulkerVehicles = async () => {
    const validRows = bvImportRows.filter(r => r._valid);
    if (validRows.length === 0) return;
    setImportingBV(true);
    try {
      const r = await fetch("/api/bulker-vehicles/bulk-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل الاستيراد"); return; }
      const { inserted, updated, skipped } = await r.json() as { inserted: number; updated: number; skipped: number };
      alert(`تم الاستيراد ✅\nمضاف جديد: ${inserted}\nمحدَّث: ${updated}${skipped > 0 ? `\nمتخطى: ${skipped}` : ""}`);
      setShowBvImportModal(false);
      setBvImportRows([]);
      load();
    } catch { alert("فشل الاتصال"); }
    finally { setImportingBV(false); }
  };

  const uploadAttachment = async (file: File): Promise<string> => {
    const res = await fetch("/api/storage/uploads/request-url", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
    });
    if (!res.ok) throw new Error("فشل طلب رابط الرفع");
    const { uploadURL, objectPath } = await res.json();
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) throw new Error("فشل رفع الملف");
    return objectPath as string;
  };

  const createLoadingOrder = async () => {
    if (!loForm.vehicle_plate || !loForm.driver_name) { alert("رقم السيارة واسم السائق مطلوبان"); return; }
    if (loForm.unload_location && !loForm.unload_location_id) { alert("اختر موقعًا محفوظًا من القائمة"); return; }
    if (loForm.unload_location && !loForm.tariff_id) { alert("اختر تعريفة عند تحديد موقع التنزيل"); return; }
    setSavingLO(true);
    try {
      let attachment_url: string | null = null;
      if (loAttachFile) {
        setLoAttachUploading(true);
        attachment_url = await uploadAttachment(loAttachFile);
        setLoAttachUploading(false);
      }
      const r = await fetch("/api/loading-orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...loForm, attachment_url, created_by: user?.name || user?.phone }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل الحفظ"); return; }

      setLoForm({ ...EMPTY_LO });
      setLoAttachFile(null);
      setShowNewLO(false);
      load();
    } catch (e) { alert((e as Error).message || "فشل الاتصال"); setLoAttachUploading(false); }
    finally { setSavingLO(false); }
  };

  const openEditLoadingOrder = (o: LoadingOrder) => {
    setEditLO(o);
    setEditForm({
      ...EMPTY_LO,
      permit_number: o.permit_number || "",
      cement_ref_number: o.cement_ref_number || "",
      vehicle_plate: o.vehicle_plate,
      driver_name: o.driver_name,
      driver_phone: o.driver_phone || "",
      cargo_type: o.cargo_type || "",
      unload_location: o.unload_location || "",
      unload_location_id: o.unload_location_id ? String(o.unload_location_id) : "",
      notes: o.notes || "",
      net_weight: o.net_weight || "",
      tariff_id: o.tariff_id ? String(o.tariff_id) : "",
    });
  };

  const confirmUnloading = async (id: number) => {
    if (!confirm("تأكيد وصول الشحنة وتنزيلها؟")) return;
    setConfirmingLO(id);
    try {
      const r = await fetch(`/api/loading-orders/${id}/confirm`, { method: "PUT" });
      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل"); }
      else load();
    } catch { alert("فشل الاتصال"); }
    finally { setConfirmingLO(null); }
  };

  const deleteSingleLO = async (id: number, isConfirmed: boolean) => {
    if (!confirm(isConfirmed ? "حذف أمر التحميل المؤكد؟ ستبقى الرحلة المسجلة في سجل الرحلات." : "حذف هذا الأمر؟")) return;
    const response = await fetch(`/api/loading-orders/${id}`, { method: "DELETE" });
    if (!response.ok) { alert((await response.json()).error || "فشل الحذف"); return; }
    load();
  };

  const deleteSelectedLOs = async () => {
    if (selectedLOs.size === 0) return;
    const ids = Array.from(selectedLOs);
    if (!confirm(`حذف ${ids.length} أمر تحميل؟ الرحلات المسجلة ستبقى في سجل الرحلات.`)) return;
    setDeletingLOs(true);
    try {
      await fetch("/api/loading-orders/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, force: true }),
      });
      setSelectedLOs(new Set());
      load();
    } catch { alert("فشل الحذف"); }
    finally { setDeletingLOs(false); }
  };

  const toggleLOSelect = (id: number) => {
    setSelectedLOs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAllLOs = (visibleIds: number[]) => {
    if (visibleIds.length > 0 && visibleIds.every(id => selectedLOs.has(id))) {
      setSelectedLOs(new Set());
    } else {
      setSelectedLOs(new Set(visibleIds));
    }
  };

  const printLoadingOrder = (o: LoadingOrder) => {
    const tariff = orderTariff(o);
    const today = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    const rows: [string, string, string?][] = [
      ["رقم تسلسلي",               String(o.id),                         "serial"],
      ["رقم الفسح",                 o.permit_number       || "—"],
      ["رقم مرجع شركة الاسمنت",    o.cement_ref_number   || "—"],
      ["رقم السيارة",               o.vehicle_plate,                      "bold"],
      ["اسم السائق",                o.driver_name,                        "bold"],
      ["نوع الحمولة",               o.cargo_type          || "—"],
       ["مكان التحميل",              tariff?.loading_place || "—"],
      ["موقع التنزيل",              o.unload_location     || "—",          "bold"],
       ["الوزن (طن)",                o.net_weight || "—"],
       ["البونص",                    tariff ? String(tariff.driver_expense) : "—"],
       ["الإيجار",                   tariff && o.net_weight ? String((tariff.rental * tonsFromInvoice(o.net_weight)).toFixed(2)) : "—"],
      ["حالة التنزيل",              o.status === "confirmed" ? "✓ تم التنزيل" : "بانتظار التأكيد", o.status === "confirmed" ? "done" : "pending"],
      ...(o.confirmed_at ? [["تاريخ التنزيل", new Date(o.confirmed_at).toLocaleDateString("ar-SA")] as [string, string]] : []),
      ...(o.notes ? [["ملاحظات", o.notes] as [string, string]] : []),
    ];
    const rowHtml = rows.map(([label, val, style]) => {
      let tdCls = "padding:8px 14px;color:#333;font-size:13px;font-weight:600;width:42%";
      let valCls = "padding:8px 14px;font-size:13px;font-weight:500;";
      if (style === "serial") valCls += "font-size:24px;font-weight:900;color:#103c68;";
      if (style === "bold")   valCls += "font-weight:800;font-size:15px;color:#1e293b;";
      if (style === "done")   valCls += "color:#16a34a;font-weight:700;";
      if (style === "pending") valCls += "color:#d97706;font-weight:700;";
      return `<tr><td style="${tdCls}">${label}</td><td style="${valCls}">${val}</td></tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>أمر تحميل #${o.id}</title>
<style>@page{size:A4 portrait;margin:15mm 15mm}html{width:210mm}body{width:210mm;margin:0;padding:0}*{box-sizing:border-box}body{font-family:Arial,sans-serif;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#f3f4f6}@media screen{.page{max-width:180mm;margin:8mm auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}}@media print{body{background:#fff}.page{margin:0}}.hdr{background:#103c68;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center}.hdr h1{font-size:20px;font-weight:900}.hdr .sub{font-size:12px;opacity:1;margin-top:4px;font-weight:600}.num{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:8px 18px;font-size:28px;font-weight:900;letter-spacing:1px}table{width:100%;border-collapse:collapse}tr:nth-child(even) td{background:#f9fafb}.sec{background:#e2e8f0;padding:8px 14px;font-size:12px;font-weight:700;color:#111;letter-spacing:.5px}.sigs{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px 28px;border-top:1px solid #e5e7eb}.sig-line{border-top:1.5px solid #94a3b8;margin-top:36px;margin-bottom:6px}.sig-lbl{font-size:12px;color:#333;font-weight:700;text-align:center}.footer{background:#f8fafc;padding:8px 28px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between}.footer span{font-size:11px;color:#555;font-weight:600}</style></head>
<body><div class="page">
<div class="hdr"><div><div class="sub">نظام MKGH — مشرف البلاكر</div><h1>أمر تحميل سيارة</h1></div><div class="num">#${o.id}</div></div>
<div class="sec">بيانات أمر التحميل</div>
<table>${rowHtml}</table>
<div class="sigs"><div><div class="sig-line"></div><div class="sig-lbl">مشرف البلاكر</div></div><div><div class="sig-line"></div><div class="sig-lbl">السائق</div></div></div>
<div class="footer"><span>طُبع: ${today}</span><span>MKGH Logistics</span></div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
    const w = window.open("", "_blank", "width=780,height=820");
    if (!w) { alert("يرجى السماح بالنوافذ المنبثقة"); return; }
    w.document.write(html); w.document.close();
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (user?.phone) setBvForm(f => ({ ...f, supervisor_phone: f.supervisor_phone || user.phone }));
  }, [user?.phone]);

  // Bulker vehicles = type contains بلك/bulker, or all vehicles if none found
  const bulkerVehicles = vehicles.filter(v => /بلك|بالك|bulker/i.test(v.type));
  const vehiclePool = bulkerVehicles.length > 0 ? bulkerVehicles : vehicles;
  const availableBulkers = vehiclePool.filter(v => v.status === "available");

  const assignBulker = async (orderId: number) => {
    if (!saibForm.vehicle_plate) return;
    setSaibSaving(true);
    try {
      const res = await fetch(`/api/workflow/orders/${orderId}/assign-bulker`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...saibForm, assigned_by: user?.name || user?.phone }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSaibAssignId(null);
      setSaibForm({ vehicle_plate: "", driver_name: "", driver_phone: "" });
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setSaibSaving(false); }
  };

  const assignSupplyReq = async (id: number) => {
    if (!supplyForm.vehicle_plate && !supplyForm.driver_name) return;
    const d = drivers.find(x => x.driver_name === supplyForm.driver_name);
    await fetch(`/api/supply-requests/${id}/assign-vehicle`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle_plate: supplyForm.vehicle_plate,
        driver_name: supplyForm.driver_name,
        driver_phone: supplyForm.driver_phone || d?.phone || "",
        assigned_by: user?.name,
      }),
    });
    setSupplyAssignId(null);
    setSupplyForm({ vehicle_plate: "", driver_name: "", driver_phone: "" });
    load();
  };

  const parsePdfDeliveryAdvice = async (file: File) => {
    setParsingPdf(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it: any) => it.str).join(" ") + "\n";
      }

      const get = (patterns: RegExp[]): string => {
        for (const re of patterns) {
          const m = text.match(re);
          if (m?.[1]?.trim()) return m[1].trim();
        }
        return "";
      };

      const deliveryNo  = get([/Delivery Advice No\.?\s*[\n\r]+\s*(\d+)/i, /Delivery Advice No\.?\s+(\d+)/i]);
      const truckNo     = get([/Truck\s+Number\s+(\S+)/i]);
      const custRef     = get([/Customer Reference NO\.?\s*[\n\r]+\s*(\d+)/i, /Customer Reference NO\.?\s+(\d+)/i]);
      const driverRaw   = get([/Driver\s+Name\s+([\w\s]+?)(?=Truck|Customer|$)/i]);
      // Cement type: OPC/Type-I → عادي, SRC/Type-V/sulfate → مقاوم
      let cargoType = "";
      if (/SRC|Type.V|sulfa/i.test(text))       cargoType = "اسمنت مقاوم";
      else if (/OPC|Type.I\b/i.test(text))      cargoType = "اسمنت عادي";

      const parsed: Partial<typeof EMPTY_LO> = {};
      const truckNoDigits = truckNo.replace(/\D/g, ""); // أرقام فقط
      if (deliveryNo)    parsed.cement_ref_number = deliveryNo;
      if (custRef)       parsed.permit_number     = custRef;
      if (truckNoDigits) parsed.vehicle_plate     = truckNoDigits;
      if (cargoType)     parsed.cargo_type        = cargoType;
      if (driverRaw)     parsed.driver_name       = driverRaw.replace(/\s+/g, " ").trim();

      // Also try to auto-fill phone from bulkerVehiclesList by plate
      if (truckNoDigits) {
        const match = bulkerVehiclesList.find(v => v.vehicle_plate.replace(/\D/g,"") === truckNoDigits);
        if (match) {
          if (!parsed.driver_name && match.driver_name) parsed.driver_name = match.driver_name;
          if (match.driver_phone) (parsed as any).driver_phone = match.driver_phone;
        }
      }

      setLoForm(f => ({ ...f, ...parsed }));
      if (Object.keys(parsed).length === 0) alert("لم أتمكن من استخراج بيانات من الـ PDF — تأكد أنه وثيقة تسليم من المصنع");
    } catch (e) {
      alert("خطأ في قراءة الـ PDF: " + (e as Error).message);
    } finally {
      setParsingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const parsePdfForEditForm = async (file: File) => {
    setParsingEditPdf(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it: any) => it.str).join(" ") + "\n";
      }
      const get = (patterns: RegExp[]): string => {
        for (const re of patterns) { const m = text.match(re); if (m?.[1]?.trim()) return m[1].trim(); }
        return "";
      };
      const deliveryNo = get([/Delivery Advice No\.?\s*[\n\r]+\s*(\d+)/i, /Delivery Advice No\.?\s+(\d+)/i]);
      const truckNo    = get([/Truck\s+Number\s+(\S+)/i]);
      const custRef    = get([/Customer Reference NO\.?\s*[\n\r]+\s*(\d+)/i, /Customer Reference NO\.?\s+(\d+)/i]);
      const driverRaw  = get([/Driver\s+Name\s+([\w\s]+?)(?=Truck|Customer|$)/i]);
      let cargoType = "";
      if (/SRC|Type.V|sulfa/i.test(text))  cargoType = "اسمنت مقاوم";
      else if (/OPC|Type.I\b/i.test(text)) cargoType = "اسمنت عادي";
      const parsed: Partial<typeof EMPTY_LO> = {};
      const truckNoDigits2 = truckNo.replace(/\D/g, ""); // أرقام فقط
      if (deliveryNo)     parsed.cement_ref_number = deliveryNo;
      if (custRef)        parsed.permit_number     = custRef;
      if (truckNoDigits2) parsed.vehicle_plate     = truckNoDigits2;
      if (cargoType)      parsed.cargo_type        = cargoType;
      if (driverRaw)      parsed.driver_name       = driverRaw.replace(/\s+/g, " ").trim();
      if (truckNoDigits2) {
        const match = bulkerVehiclesList.find(v => v.vehicle_plate.replace(/\D/g,"") === truckNoDigits2);
        if (match) {
          if (!parsed.driver_name && match.driver_name) parsed.driver_name = match.driver_name;
          if (match.driver_phone) (parsed as any).driver_phone = match.driver_phone;
        }
      }
      setEditForm(f => ({ ...f, ...parsed }));
      if (Object.keys(parsed).length === 0) alert("لم أتمكن من استخراج بيانات من الـ PDF");
    } catch (e) {
      alert("خطأ في قراءة الـ PDF: " + (e as Error).message);
    } finally {
      setParsingEditPdf(false);
    }
  };

  const nextPermitNumber = (): string => {
    const nums = loadingOrders
      .map(o => o.permit_number)
      .filter(Boolean)
      .map(p => parseInt((p as string).replace(/\D/g, ""), 10))
      .filter(n => !isNaN(n));
    if (nums.length === 0) return "";
    return String(Math.max(...nums) + 1);
  };

  const saveBulkerVehicle = async () => {
    if (!bvForm.vehicle_plate || !bvForm.driver_name) { alert("رقم السيارة واسم السائق مطلوبان"); return; }
    setSavingBV(true);
    try {
      const url = editingBV ? `/api/bulker-vehicles/${editingBV.id}` : "/api/bulker-vehicles";
      const method = editingBV ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(bvForm) });
      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل الحفظ"); return; }
      setBvForm({ ...EMPTY_BV, supervisor_phone: user?.phone || "" });
      setEditingBV(null);
      load();
    } catch { alert("فشل الاتصال"); }
    finally { setSavingBV(false); }
  };

  const syncFromFleet = async () => {
    setSyncingFleet(true);
    try {
      const r = await fetch("/api/bulker-vehicles/sync-from-fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisor_phone: user?.phone || null }),
      });
      const d = await r.json() as { added: number; updated: number; total: number };
      alert(`تم مزامنة الأسطول ✅\nمضاف جديد: ${d.added}\nمحدَّث: ${d.updated}\nإجمالي سيارات البلكر في الأسطول: ${d.total}`);
      load();
    } finally {
      setSyncingFleet(false);
    }
  };

  const deleteBulkerVehicle = async (id: number) => {
    if (!confirm("حذف هذه السيارة من الدفتر؟")) return;
    await fetch(`/api/bulker-vehicles/${id}`, { method: "DELETE" });
    load();
  };

  // ── مواقع التنزيل CRUD ────────────────────────────────────────────────────
  const saveLocation = async () => {
    if (!locForm.name.trim()) return;
    setSavingLoc(true);
    try {
      const url = editingLoc ? `/api/unload-locations/${editingLoc.id}` : "/api/unload-locations";
      const r = await fetch(url, {
        method: editingLoc ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(locForm),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل الحفظ"); return; }
      setLocForm({ name: "", notes: "", phone_number: "", map_url: "" });
      setEditingLoc(null);
      load();
    } catch { alert("فشل الاتصال"); }
    finally { setSavingLoc(false); }
  };
  const deleteLocation = async (id: number) => {
    if (!confirm("حذف هذا الموقع؟")) return;
    await fetch(`/api/unload-locations/${id}`, { method: "DELETE" });
    load();
  };

  const pendingSupply = supplyReqs.filter(r => r.status === "pending");
  const loSearchNorm = loSearch.trim().toLowerCase();
  const filteredLoadingOrders = loSearchNorm
    ? loadingOrders.filter(o => [o.permit_number, o.cement_ref_number, o.vehicle_plate, o.cargo_type, o.unload_location]
        .some(f => (f || "").toLowerCase().includes(loSearchNorm)))
    : loadingOrders;
  // pending orders without unload_location → محملة
  const loadedPlates   = new Set(
    loadingOrders.filter(o => o.status === "pending" && !o.unload_location).map(o => o.vehicle_plate)
  );
  // pending orders WITH unload_location → متوجهة
  const headingPlates  = new Set(
    loadingOrders.filter(o => o.status === "pending" && !!o.unload_location).map(o => o.vehicle_plate)
  );
  // all pending plates (union)
  const activeLOPlates = new Set([...loadedPlates, ...headingPlates]);
  // not in any pending order → متاحة
  const vehiclesLoaded    = bulkerVehiclesList.filter(v => loadedPlates.has(v.vehicle_plate)).length;
  const vehiclesHeading   = bulkerVehiclesList.filter(v => headingPlates.has(v.vehicle_plate)).length;
  const vehiclesAvailable = bulkerVehiclesList.filter(v => !activeLOPlates.has(v.vehicle_plate) && !v.is_stopped).length;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-gray-900">مشرف حركة البلاكر</h1>
          <p className="text-sm text-gray-400 mt-1">إدارة طلبيات السائب وأوامر التحميل</p>
        </div>
      </div>

      {/* Stat badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          { label: "طلبيات السائب",     value: saibOrders.length,                                          color: "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-100",  icon: "📦", tab: "saib"            },
          { label: "أوامر تحميل معلقة", value: loadingOrders.filter(o => o.status === "pending").length,   color: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100",  icon: "📋", tab: "loading-orders"  },
          { label: "طلبات توريد معلقة", value: pendingSupply.length,                                       color: "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100",      icon: "⏳", tab: "loading-orders"  },
          { label: "سيارات محملة",      value: vehiclesLoaded,                                              color: "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100",          icon: "🚛", tab: "vehicles"        },
          { label: "سيارات متاحة",      value: vehiclesAvailable,                                           color: "bg-green-50 text-green-700 hover:bg-green-100 border border-green-100",      icon: "✅", tab: "vehicles"        },
          { label: "سيارات متوجهة",     value: vehiclesHeading,                                             color: "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100",  icon: "📍", tab: "vehicles"        },
        ] as const).map(s => (
          <button key={s.label} onClick={() => setTab(s.tab)}
            className={`${s.color} rounded-xl px-4 py-3 text-center cursor-pointer transition-colors w-full`}>
            <div className="text-lg mb-0.5">{s.icon}</div>
            <div className="text-2xl font-black">{s.value}</div>
            <div className="text-xs font-semibold mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {([
          ["saib",           "طلبيات السائب",       saibOrders.length,                                                                         "bg-orange-500", "text-orange-700"],
          ["loading-orders", "أوامر التحميل",       loadingOrders.filter(o => o.status === "pending").length,                                  "bg-indigo-500", "text-indigo-700"],
          ["needs-location", "تحتاج موقع",          loadingOrders.filter(o => o.status === "loaded" && !o.unload_location).length,             "bg-red-500",    "text-red-700"   ],
          ["vehicles",       "دفتر السيارات",       bulkerVehiclesList.length,                                                                 "bg-slate-600",  "text-slate-700"],
          ["locations",      "مواقع التنزيل",       unloadLocations.length,                                                                    "bg-teal-600",   "text-teal-700"],
        ] as const).map(([k, label, cnt, badgeColor, activeColor]) => (
          <button key={k} onClick={() => setTab(k as "saib"|"loading-orders"|"needs-location"|"vehicles"|"locations")}
            className={`px-3 py-2 text-sm font-semibold rounded-lg transition-all relative ${tab === k ? `bg-white ${activeColor} shadow-sm` : "text-gray-500 hover:text-gray-700"}`}>
            {label}
            {cnt > 0 && (
              <span className={`absolute -top-1 -start-1 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold ${badgeColor}`}>{cnt}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── سائب Orders — Bulker Assignment ── */}
      {tab === "saib" && (
        <div className="space-y-3">
          {/* Available bulkers summary */}
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Car size={16} className="text-orange-600" />
              <span className="font-bold text-orange-800 text-sm">سيارات البلاكر المتاحة:</span>
              <span className="text-2xl font-black text-orange-700">{availableBulkers.length}</span>
              <span className="text-xs text-orange-500">من أصل {vehiclePool.length}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {availableBulkers.map(v => (
                <span key={v.id} className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-1 rounded-lg font-semibold">{v.plate}</span>
              ))}
              {availableBulkers.length === 0 && (
                <span className="text-xs text-orange-600">لا توجد سيارات متاحة حالياً</span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-orange-100 bg-orange-50/40 flex items-center gap-2">
              <Package size={16} className="text-orange-600" />
              <h2 className="font-bold text-gray-900">طلبيات الأسمنت السائب — بانتظار تعيين بلاكر</h2>
              {saibOrders.length > 0 && (
                <span className="bg-orange-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">{saibOrders.length}</span>
              )}
            </div>

            {saibOrders.length === 0 ? (
              <div className="p-10 text-center">
                <Package size={32} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">لا توجد طلبيات سائب بانتظار التعيين</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {saibOrders.map(order => {
                  const isOpen = saibAssignId === order.id;
                  return (
                    <div key={order.id} className="px-5 py-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">بانتظار بلاكر</span>
                            <span className="font-mono text-xs text-gray-400">{order.order_number}</span>
                          </div>
                          <div className="font-bold text-gray-900">🛢️ {order.product_name}</div>
                          <div className="text-sm text-gray-600 mt-0.5">
                            {order.quantity > 0 && `${order.quantity.toLocaleString("ar-SA")} ${order.unit} · `}
                            {order.customer_name || order.customer_phone}
                            {order.delivery_location && ` · 📍 ${order.delivery_location}`}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{order.created_at?.slice(0, 16)}</div>
                        </div>
                        <button
                          onClick={() => {
                            setSaibAssignId(isOpen ? null : order.id);
                            setSaibForm({ vehicle_plate: "", driver_name: "", driver_phone: "" });
                          }}
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition-colors">
                          <Car size={13} />تعيين بلاكر
                        </button>
                      </div>

                      {/* Inline assign form */}
                      {isOpen && (
                        <div className="mt-3 p-4 bg-orange-50 rounded-xl space-y-3">
                          <div className="text-xs font-bold text-orange-800 mb-2 flex items-center gap-1.5">
                            <Car size={13} />اختر سيارة بلاكر متاحة
                          </div>
                          {/* Bulker vehicle chips */}
                          <div className="flex gap-2 flex-wrap">
                            {vehiclePool.map(v => {
                              const isAvailable = v.status === "available";
                              const isSelected = saibForm.vehicle_plate === v.plate;
                              return (
                                <button key={v.id} type="button"
                                  onClick={() => {
                                    const d = drivers.find(dr => dr.vehicle_plate === v.plate);
                                    setSaibForm(f => ({
                                      ...f,
                                      vehicle_plate: v.plate,
                                      driver_name: d?.driver_name || f.driver_name,
                                      driver_phone: d?.phone || f.driver_phone,
                                    }));
                                  }}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                                    isSelected
                                      ? "bg-orange-600 text-white border-orange-600"
                                      : isAvailable
                                      ? "bg-green-50 text-green-700 border-green-200 hover:border-green-400"
                                      : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300"
                                  }`}>
                                  <Car size={11} />
                                  {v.plate}
                                  <span className={`text-[10px] px-1 py-0.5 rounded-full ${
                                    isAvailable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                                  }`}>
                                    {isAvailable ? "متاح" : v.status === "busy" ? "مشغول" : "صيانة"}
                                  </span>
                                  {isSelected && <CheckCircle size={11} />}
                                </button>
                              );
                            })}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">لوحة السيارة <span className="text-red-500">*</span></label>
                              <input list="saib-vlist" value={saibForm.vehicle_plate}
                                onChange={e => setSaibForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                                placeholder="رقم اللوحة"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                              <datalist id="saib-vlist">{vehiclePool.map(v => <option key={v.id} value={v.plate}>{v.plate} — {v.type}</option>)}</datalist>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">السائق</label>
                              <input list="saib-dlist" value={saibForm.driver_name}
                                onChange={e => {
                                  const d = drivers.find(x => x.driver_name === e.target.value);
                                  setSaibForm(f => ({ ...f, driver_name: e.target.value, driver_phone: d?.phone || f.driver_phone }));
                                }}
                                placeholder="اسم السائق"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                              <datalist id="saib-dlist">{drivers.map(d => <option key={d.id} value={d.driver_name}>{d.driver_name} — {d.phone}</option>)}</datalist>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">جوال السائق</label>
                            <input value={saibForm.driver_phone}
                              onChange={e => setSaibForm(f => ({ ...f, driver_phone: e.target.value }))}
                              placeholder="05xxxxxxxx"
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => assignBulker(order.id)}
                              disabled={saibSaving || !saibForm.vehicle_plate}
                              className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 disabled:opacity-40 transition-colors">
                              <UserCheck size={14} />{saibSaving ? "جاري..." : "تأكيد التعيين وإحالة للفسوحات"}
                            </button>
                            <button onClick={() => setSaibAssignId(null)}
                              className="p-2 hover:bg-orange-100 rounded-xl text-gray-500">
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}



      {/* ── أوامر التحميل ── */}
      {tab === "loading-orders" && (
        <div className="space-y-4">
          {/* Header bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <ClipboardList size={18} className="text-indigo-600" />
              <h2 className="font-black text-gray-900">أوامر التحميل</h2>
              <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {loadingOrders.filter(o => o.status === "pending").length} معلقة
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={downloadImportTemplate}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-600 bg-white rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors">
                <Download size={14} />نموذج
              </button>
              <label className="flex items-center gap-1.5 px-3 py-2 border border-blue-300 text-blue-700 bg-blue-50 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors cursor-pointer">
                <Upload size={14} />استيراد Excel
                <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) parseImportFile(e.target.files[0]); e.target.value = ""; }} />
              </label>
              {loadingOrders.length > 0 && (
                <button onClick={exportLoadingOrdersExcel}
                  className="flex items-center gap-1.5 px-3 py-2 border border-green-300 text-green-700 bg-green-50 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors">
                  <FileSpreadsheet size={14} />تصدير Excel
                </button>
              )}
              <button onClick={() => {
                  if (showNewLO) { setShowNewLO(false); setLoForm({ ...EMPTY_LO }); }
                  else { setLoForm({ ...EMPTY_LO, permit_number: nextPermitNumber() }); setShowNewLO(true); }
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">
                <Plus size={14} />{showNewLO ? "إلغاء" : "أمر تحميل جديد"}
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
            <input
              value={loSearch}
              onChange={e => setLoSearch(e.target.value)}
              placeholder="بحث برقم الفسح، مرجع الاسمنت، رقم السيارة، نوع الاسمنت، أو موقع التنزيل..."
              className="w-full pr-9 pl-9 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            />
            {loSearch && (
              <button onClick={() => setLoSearch("")}
                className="absolute top-1/2 -translate-y-1/2 left-3 text-gray-400 hover:text-gray-600">
                <X size={15} />
              </button>
            )}
          </div>
          {loSearchNorm && (
            <p className="text-xs text-gray-400 -mt-2">
              {filteredLoadingOrders.length} نتيجة من أصل {loadingOrders.length}
            </p>
          )}

          {/* Bulk-select action bar */}
          {loadingOrders.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filteredLoadingOrders.length > 0 && filteredLoadingOrders.every(o => selectedLOs.has(o.id))}
                  onChange={() => toggleSelectAllLOs(filteredLoadingOrders.map(o => o.id))}
                  className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                />
                <span className="text-sm font-semibold text-gray-600">
                  {selectedLOs.size === 0
                    ? "تحديد الكل"
                    : `${selectedLOs.size} محدد`}
                </span>
              </label>
              {selectedLOs.size > 0 && (
                <button onClick={deleteSelectedLOs} disabled={deletingLOs}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50">
                  <Trash2 size={13} />
                  {deletingLOs ? "جاري الحذف..." : `حذف المحدد (${selectedLOs.size})`}
                </button>
              )}
              {selectedLOs.size > 0 && (
                <button onClick={() => setSelectedLOs(new Set())}
                  className="text-xs text-gray-400 hover:text-gray-600 font-semibold">
                  إلغاء التحديد
                </button>
              )}
            </div>
          )}

          {/* ── Edit modal ── */}
          {editLO && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => { setEditLO(null); setEditAttachFile(null); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                  <h3 className="font-black text-gray-900 flex items-center gap-2"><ClipboardList size={16} className="text-indigo-600" />تعديل أمر التحميل #{editLO.id}</h3>
                  <button onClick={() => { setEditLO(null); setEditAttachFile(null); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={16} /></button>
                </div>

                <div className="p-5 space-y-4">
                  {/* رقم الفسح + المرجع */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">رقم الفسح</label>
                      <input value={editForm.permit_number}
                        onChange={e => setEditForm(f => ({ ...f, permit_number: e.target.value }))}
                        placeholder="رقم الفسح"
                        className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-indigo-50/30 font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">مرجع شركة الاسمنت</label>
                      <input value={editForm.cement_ref_number}
                        onChange={e => setEditForm(f => ({ ...f, cement_ref_number: e.target.value }))}
                        placeholder="رقم المرجع"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                    </div>
                  </div>

                  {/* السيارة + السائق */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                        رقم السيارة <span className="text-red-500">*</span>
                        {editForm.vehicle_plate && !bulkerVehiclesList.find(v => v.vehicle_plate === editForm.vehicle_plate) && (
                          <span className="text-amber-600 font-normal text-xs bg-amber-50 px-1.5 py-0.5 rounded-full">جديدة · ستُضاف للدفتر</span>
                        )}
                      </label>
                      <input value={editForm.vehicle_plate}
                        list="edit-plate-list"
                        onChange={e => {
                          const plate = e.target.value;
                          const match = bulkerVehiclesList.find(v => v.vehicle_plate === plate);
                          setEditForm(f => ({
                            ...f,
                            vehicle_plate: plate,
                            ...(match ? {
                              driver_name:  match.driver_name  || f.driver_name,
                              driver_phone: match.driver_phone || f.driver_phone,
                            } : {}),
                          }));
                        }}
                        placeholder="اختر أو اكتب رقم السيارة"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                      <datalist id="edit-plate-list">
                        {bulkerVehiclesList.map(v => (
                          <option key={v.id} value={v.vehicle_plate}>
                            {v.vehicle_plate}{v.driver_name ? ` — ${v.driver_name}` : ""}
                          </option>
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                        اسم السائق <span className="text-red-500">*</span>
                        {editForm.driver_name && editForm.vehicle_plate && (
                          <span className="text-green-600 font-normal text-xs bg-green-50 px-1.5 py-0.5 rounded-full">من الدفتر</span>
                        )}
                      </label>
                      <input value={editForm.driver_name}
                        onChange={e => setEditForm(f => ({ ...f, driver_name: e.target.value }))}
                        placeholder="يُعبَّأ تلقائيًا عند اختيار السيارة"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                    </div>
                  </div>

                  {/* جوال السائق */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                        رقم جوال السائق
                        {editForm.driver_phone && editForm.vehicle_plate && (
                          <span className="text-green-600 font-normal text-xs bg-green-50 px-1.5 py-0.5 rounded-full">من الدفتر</span>
                        )}
                      </label>
                      <input value={editForm.driver_phone}
                        onChange={e => setEditForm(f => ({ ...f, driver_phone: e.target.value }))}
                        placeholder="05xxxxxxxx" dir="ltr"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                    </div>
                  </div>

                  {/* نوع الحمولة + موقع التنزيل */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">نوع الحمولة</label>
                      <input value={editForm.cargo_type}
                        list="edit-cargo-type-list"
                        onChange={e => setEditForm(f => ({ ...f, cargo_type: e.target.value }))}
                        placeholder="اختر أو اكتب نوعًا جديدًا"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                      <datalist id="edit-cargo-type-list">
                        {["اسمنت مقاوم", "اسمنت عادي",
                          ...Array.from(new Set(loadingOrders.map(o => o.cargo_type).filter(Boolean)))
                            .filter(t => t !== "اسمنت مقاوم" && t !== "اسمنت عادي")
                        ].map(t => <option key={t as string} value={t as string} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">موقع التنزيل</label>
                      <input value={editForm.unload_location}
                        list="edit-unload-loc-list"
                        onChange={e => {
                          const name = e.target.value;
                          const location = unloadLocations.find(l => l.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
                          setEditForm(f => ({ ...f, unload_location: name, unload_location_id: location ? String(location.id) : "" }));
                        }}
                        placeholder="ابحث عن موقع محفوظ بالاسم"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                      <datalist id="edit-unload-loc-list">
                        {unloadLocations.map(l => <option key={l.id} value={l.name} />)}
                      </datalist>
                    </div>
                  </div>

                  {/* الوزن الصافي */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      التعريفة (بلكر) {editForm.unload_location ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">اختيارية بدون موقع</span>}
                    </label>
                    <select value={editForm.tariff_id} onChange={e => setEditForm(f => ({ ...f, tariff_id: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white">
                      <option value="">بدون تعريفة (أمر قديم)</option>
                      {bulkerTariffs.filter(t => !t.cargo_type || t.cargo_type === editForm.cargo_type || String(t.id) === editForm.tariff_id).map(t =>
                        <option key={t.id} value={t.id}>{t.loading_place} ← {t.unloading_place} · {t.cargo_type || "كل الحمولات"} · بونص {t.driver_expense} · إيجار/طن {t.rental}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">الوزن الصافي</label>
                    <input value={editForm.net_weight}
                      onChange={e => setEditForm(f => ({ ...f, net_weight: e.target.value }))}
                      placeholder="الوزن الصافي من فاتورة التحميل..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                  </div>

                  {/* ملاحظات */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات</label>
                    <input value={editForm.notes}
                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="أي تفاصيل إضافية..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                  </div>

                  {/* مرفق جديد (يستبدل القديم) + PDF يملأ البيانات */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                      {editLO.attachment_url ? "استبدال المرفق" : "إضافة مرفق"}
                      <span className="text-indigo-500 font-normal text-xs bg-indigo-50 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <ScanText size={10} />PDF يملأ البيانات تلقائيًا
                      </span>
                    </label>
                    {/* المرفق الحالي */}
                    {editLO.attachment_url && !editAttachFile && (() => {
                      const href = `/api/storage${editLO.attachment_url}`;
                      const isImg = /\.(jpe?g|png|gif|webp)$/i.test(editLO.attachment_url);
                      return (
                        <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl mb-2">
                          {isImg
                            ? <img src={href} alt="المرفق الحالي" className="w-10 h-10 object-cover rounded-lg flex-shrink-0 border border-gray-200" />
                            : <div className="w-10 h-10 flex items-center justify-center bg-red-50 rounded-lg flex-shrink-0"><span className="text-red-500 text-xs font-black">PDF</span></div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-500">المرفق الحالي</p>
                            <a href={href} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline truncate block">عرض المرفق</a>
                          </div>
                        </div>
                      );
                    })()}
                    {/* رفع مرفق جديد */}
                    {!editAttachFile ? (
                      <label className={`flex items-center gap-2 w-full px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${parsingEditPdf ? "border-indigo-400 bg-indigo-100/60" : "border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/40"}`}>
                        {parsingEditPdf
                          ? <ScanText size={16} className="text-indigo-500 animate-pulse" />
                          : <Upload size={16} className="text-indigo-400" />}
                        <span className="text-sm text-indigo-400 font-semibold">
                          {parsingEditPdf ? "جاري قراءة PDF وتعبئة البيانات..." : editLO.attachment_url ? "اختر ملفًا لاستبداله" : "اختر صورة أو ملف PDF"}
                        </span>
                        <span className="text-xs text-gray-400 mr-auto">JPG · PNG · PDF</span>
                        <input type="file" accept="image/*,.pdf" className="hidden" disabled={parsingEditPdf}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setEditAttachFile(file);
                            if (file.type === "application/pdf") parsePdfForEditForm(file);
                          }} />
                      </label>
                    ) : (
                      <div className="flex items-center gap-3 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
                        {editAttachFile.type.startsWith("image/") ? (
                          <img src={URL.createObjectURL(editAttachFile)} alt="preview"
                            className="w-12 h-12 object-cover rounded-lg border border-indigo-100 flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-lg flex-shrink-0 relative">
                            <span className="text-red-600 text-xs font-black">PDF</span>
                            <ScanText size={10} className="absolute bottom-1 right-1 text-indigo-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{editAttachFile.name}</p>
                          <p className="text-xs text-gray-400">{(editAttachFile.size / 1024).toFixed(0)} KB
                            {editAttachFile.type === "application/pdf" && <span className="text-indigo-500 mr-1">· تم استخراج البيانات</span>}
                          </p>
                        </div>
                        <button onClick={() => setEditAttachFile(null)} className="p-1.5 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-500 flex-shrink-0">
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 px-5 pb-5">
                  <button onClick={updateLoadingOrder} disabled={savingEditLO || !editForm.vehicle_plate || !editForm.driver_name}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                    <CheckCheck size={14} />
                    {editAttachUploading ? "جاري رفع الملف..." : savingEditLO ? "جاري الحفظ..." : "حفظ التعديلات"}
                  </button>
                  <button onClick={() => { setEditLO(null); setEditAttachFile(null); }}
                    className="px-4 py-2.5 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 text-gray-600">إلغاء</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Import modal ── */}
          {showImportModal && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setShowImportModal(false)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mt-8" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-blue-700 rounded-t-2xl">
                  <div className="flex items-center gap-2 text-white">
                    <Upload size={18} />
                    <h2 className="font-black text-lg">استيراد أوامر التحميل</h2>
                    <span className="bg-white/20 text-white text-xs rounded-full px-2 font-bold">{importRows.length} صف</span>
                  </div>
                  <button onClick={() => setShowImportModal(false)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/80"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-4">
                  {/* Summary */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                      <CheckCheck size={15} className="text-green-600" />
                      <span className="text-sm font-bold text-green-700">{importRows.filter(r => r._valid).length} صف صالح</span>
                    </div>
                    {importRows.filter(r => !r._valid).length > 0 && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                        <AlertTriangle size={15} className="text-red-500" />
                        <span className="text-sm font-bold text-red-600">{importRows.filter(r => !r._valid).length} صف غير صالح: راجع السيارة والسائق والموقع والتعريفة</span>
                      </div>
                    )}
                    <button onClick={downloadImportTemplate}
                      className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 ms-auto">
                      <Download size={12} />تحميل النموذج
                    </button>
                  </div>

                  {/* Preview table */}
                  <div className="overflow-x-auto rounded-xl border border-gray-200 max-h-80 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0">
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-right px-3 py-2 font-bold text-gray-500">#</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">رقم الفسح</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">مرجع الاسمنت</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">رقم السيارة</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">اسم السائق</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">نوع الحمولة</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">موقع التنزيل</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">رقم التعريفة</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">ملاحظات</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.map((row, i) => (
                          <tr key={i} className={row._valid ? "hover:bg-green-50/50" : "bg-red-50/60"}>
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2 text-gray-700">{row.permit_number || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-gray-700">{row.cement_ref_number || <span className="text-gray-300">—</span>}</td>
                            <td className={`px-3 py-2 font-bold ${!row.vehicle_plate ? "text-red-500" : "text-gray-900"}`}>{row.vehicle_plate || "⚠ ناقص"}</td>
                            <td className={`px-3 py-2 font-semibold ${!row.driver_name ? "text-red-500" : "text-gray-800"}`}>{row.driver_name || "⚠ ناقص"}</td>
                            <td className="px-3 py-2 text-gray-600">{row.cargo_type || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-gray-600">{row.unload_location || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-gray-600">{row.tariff_id || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-gray-500">{row.notes || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2">{row._valid ? <CheckCheck size={12} className="text-green-500" /> : <AlertTriangle size={12} className="text-red-400" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button onClick={importLoadingOrders}
                      disabled={importingLO || importRows.filter(r => r._valid).length === 0}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-700 text-white font-bold rounded-xl hover:bg-blue-800 disabled:opacity-40 text-sm">
                      <Upload size={14} />{importingLO ? "جاري الاستيراد..." : `استيراد ${importRows.filter(r => r._valid).length} صف`}
                    </button>
                    <label className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">
                      <FileSpreadsheet size={14} />اختر ملف آخر
                      <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                        onChange={e => { if (e.target.files?.[0]) parseImportFile(e.target.files[0]); e.target.value = ""; }} />
                    </label>
                    <button onClick={() => setShowImportModal(false)}
                      className="px-4 py-2.5 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 text-gray-600">إلغاء</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* New loading order form */}
          {showNewLO && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-bold text-indigo-900 flex items-center gap-2"><ClipboardList size={15} />بيانات أمر التحميل الجديد</h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                    رقم الفسح
                    {loForm.permit_number && (
                      <span className="text-indigo-500 font-normal text-xs bg-indigo-50 px-1.5 py-0.5 rounded-full">تلقائي · قابل للتعديل</span>
                    )}
                  </label>
                  <input value={loForm.permit_number}
                    onChange={e => setLoForm(f => ({ ...f, permit_number: e.target.value }))}
                    placeholder="يُعبَّأ تلقائيًا من آخر رقم"
                    className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-indigo-50/30 font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">رقم مرجع شركة الاسمنت</label>
                  <input value={loForm.cement_ref_number}
                    onChange={e => setLoForm(f => ({ ...f, cement_ref_number: e.target.value }))}
                    placeholder="رقم المرجع"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                    رقم السيارة <span className="text-red-500">*</span>
                    {loForm.vehicle_plate && !bulkerVehiclesList.find(v => v.vehicle_plate === loForm.vehicle_plate) && (
                      <span className="text-amber-600 font-normal text-xs bg-amber-50 px-1.5 py-0.5 rounded-full">جديدة · ستُضاف للدفتر</span>
                    )}
                  </label>
                  <input value={loForm.vehicle_plate}
                    list="lo-plate-list"
                    onChange={e => {
                      const plate = e.target.value;
                      const match = bulkerVehiclesList.find(v => v.vehicle_plate === plate);
                      setLoForm(f => ({
                        ...f,
                        vehicle_plate: plate,
                        ...(match ? {
                          driver_name:  match.driver_name  || f.driver_name,
                          driver_phone: match.driver_phone || f.driver_phone,
                        } : {}),
                      }));
                    }}
                    placeholder="اختر أو اكتب رقم سيارة جديد"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                  <datalist id="lo-plate-list">
                    {bulkerVehiclesList.map(v => (
                      <option key={v.id} value={v.vehicle_plate}>
                        {v.vehicle_plate}{v.driver_name ? ` — ${v.driver_name}` : ""}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                    اسم السائق <span className="text-red-500">*</span>
                    {loForm.driver_name && loForm.vehicle_plate && (
                      <span className="text-green-600 font-normal text-xs bg-green-50 px-1.5 py-0.5 rounded-full">من الدفتر</span>
                    )}
                  </label>
                  <input value={loForm.driver_name}
                    onChange={e => setLoForm(f => ({ ...f, driver_name: e.target.value }))}
                    placeholder="يُعبَّأ تلقائيًا عند اختيار السيارة"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                    رقم جوال السائق
                    {loForm.driver_phone && loForm.vehicle_plate && (
                      <span className="text-green-600 font-normal text-xs bg-green-50 px-1.5 py-0.5 rounded-full">من الدفتر</span>
                    )}
                  </label>
                  <input value={loForm.driver_phone}
                    onChange={e => setLoForm(f => ({ ...f, driver_phone: e.target.value }))}
                    placeholder="05xxxxxxxx"
                    dir="ltr"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">نوع الحمولة</label>
                  <input value={loForm.cargo_type}
                    list="cargo-type-list"
                    onChange={e => setLoForm(f => ({ ...f, cargo_type: e.target.value }))}
                    placeholder="اختر أو اكتب نوعًا جديدًا"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                  <datalist id="cargo-type-list">
                    {["اسمنت مقاوم", "اسمنت عادي",
                      ...Array.from(new Set(loadingOrders.map(o => o.cargo_type).filter(Boolean)))
                        .filter(t => t !== "اسمنت مقاوم" && t !== "اسمنت عادي")
                    ].map(t => <option key={t as string} value={t as string} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">موقع التنزيل</label>
                  <input value={loForm.unload_location}
                    list="lo-unload-loc-list"
                    onChange={e => {
                      const name = e.target.value;
                      const location = unloadLocations.find(l => l.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
                      setLoForm(f => ({ ...f, unload_location: name, unload_location_id: location ? String(location.id) : "" }));
                    }}
                    placeholder="ابحث عن موقع محفوظ بالاسم"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                  <datalist id="lo-unload-loc-list">
                    {unloadLocations.map(l => <option key={l.id} value={l.name} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  التعريفة (بلكر) {loForm.unload_location ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">اختيارية بدون موقع</span>}
                </label>
                <select value={loForm.tariff_id} onChange={e => setLoForm(f => ({ ...f, tariff_id: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white">
                  <option value="">اختر التعريفة المناسبة للحمولة (إن لزم)</option>
                  {bulkerTariffs.filter(t => !t.cargo_type || t.cargo_type === loForm.cargo_type).map(t =>
                    <option key={t.id} value={t.id}>{t.loading_place} ← {t.unloading_place} · {t.cargo_type || "كل الحمولات"} · بونص {t.driver_expense} · إيجار/طن {t.rental}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات</label>
                <input value={loForm.notes}
                  onChange={e => setLoForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="أي تفاصيل إضافية..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
              </div>

              {/* ── مرفق (صورة أو PDF) — PDF يملأ البيانات تلقائيًا ── */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  مرفق (صورة أو PDF)
                  <span className="text-indigo-500 font-normal text-xs bg-indigo-50 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                    <ScanText size={10} />PDF يملأ البيانات تلقائيًا
                  </span>
                </label>
                {!loAttachFile ? (
                  <label className={`flex items-center gap-2 w-full px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${parsingPdf ? "border-indigo-400 bg-indigo-100/60" : "border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/40"}`}>
                    {parsingPdf
                      ? <ScanText size={16} className="text-indigo-500 animate-pulse" />
                      : <Upload size={16} className="text-indigo-400" />}
                    <span className="text-sm text-indigo-400 font-semibold">
                      {parsingPdf ? "جاري قراءة PDF وتعبئة البيانات..." : "اختر صورة أو ملف PDF"}
                    </span>
                    <span className="text-xs text-gray-400 mr-auto">JPG · PNG · PDF</span>
                    <input type="file" accept="image/*,.pdf" className="hidden" disabled={parsingPdf}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setLoAttachFile(file);
                        if (file.type === "application/pdf") parsePdfDeliveryAdvice(file);
                      }} />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
                    {loAttachFile.type.startsWith("image/") ? (
                      <img src={URL.createObjectURL(loAttachFile)} alt="preview"
                        className="w-12 h-12 object-cover rounded-lg border border-indigo-100 flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-lg flex-shrink-0 relative">
                        <span className="text-red-600 text-xs font-black">PDF</span>
                        <ScanText size={10} className="absolute bottom-1 right-1 text-indigo-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{loAttachFile.name}</p>
                      <p className="text-xs text-gray-400">{(loAttachFile.size / 1024).toFixed(0)} KB
                        {loAttachFile.type === "application/pdf" && <span className="text-indigo-500 mr-1">· تم استخراج البيانات</span>}
                      </p>
                    </div>
                    <button onClick={() => setLoAttachFile(null)} className="p-1.5 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-500 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={createLoadingOrder} disabled={savingLO || !loForm.vehicle_plate || !loForm.driver_name || (Boolean(loForm.unload_location) && (!loForm.unload_location_id || !loForm.tariff_id))}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                  <ClipboardList size={14} />
                  {loAttachUploading ? "جاري رفع الملف..." : savingLO ? "جاري الحفظ..." : "إنشاء أمر التحميل"}
                </button>
                <button onClick={() => { setShowNewLO(false); setLoForm({ ...EMPTY_LO }); setLoAttachFile(null); }}
                  className="px-4 py-2.5 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 text-gray-600">إلغاء</button>
              </div>
            </div>
          )}

          {/* Loading orders list */}
          {loadingOrders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 text-gray-400">
              <ClipboardList size={40} className="mx-auto mb-3 opacity-20" />
              <p className="font-semibold">لا توجد أوامر تحميل بعد</p>
              <p className="text-xs mt-1">أنشئ أمر تحميل جديد من الزر أعلاه</p>
            </div>
          ) : filteredLoadingOrders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 text-gray-400">
              <Search size={40} className="mx-auto mb-3 opacity-20" />
              <p className="font-semibold">لا توجد نتائج مطابقة للبحث</p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200">
              <table className="min-w-full text-xs whitespace-nowrap text-right">
                <thead className="bg-indigo-50 text-indigo-900">
                  <tr>{["", "#", "الفسح", "مرجع الأسمنت", "السيارة", "السائق / الجوال", "الحمولة", "مكان التحميل", "موقع التنزيل", "الوزن", "البونص", "الإيجار", "الحالة", "الإنشاء / التنزيل", "ملاحظات", "إجراءات"].map((label, i) =>
                    <th key={i} className="px-3 py-3 font-bold">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLoadingOrders.map(o => {
                    const tariff = orderTariff(o);
                    return <tr key={o.id} className={selectedLOs.has(o.id) ? "bg-indigo-50" : "hover:bg-gray-50"}>
                      <td className="px-3 py-2"><input type="checkbox" checked={selectedLOs.has(o.id)} onChange={() => toggleLOSelect(o.id)} /></td>
                      <td className="px-3 py-2 font-bold">{o.id}</td>
                      <td className="px-3 py-2">{o.permit_number || "—"}{o.attachment_url && renderFilePreview(o.attachment_url, `${o.id}:attachment`, "صورة الفسح")}</td>
                      <td className="px-3 py-2">{o.cement_ref_number || "—"}</td>
                      <td className="px-3 py-2 font-bold text-indigo-700">{o.vehicle_plate}</td>
                      <td className="px-3 py-2">{o.driver_name}<br />{o.driver_phone || ""}</td>
                      <td className="px-3 py-2">{o.cargo_type || "—"}</td>
                      <td className="px-3 py-2">{tariff?.loading_place || "—"}</td>
                      <td className="px-3 py-2">{o.unload_location || "—"}</td>
                      <td className="px-3 py-2">{o.net_weight || "—"}{o.loading_invoice_url && renderFilePreview(o.loading_invoice_url, `${o.id}:invoice`, "فاتورة التحميل")}</td>
                      <td className="px-3 py-2">{tariff ? tariff.driver_expense : "—"}</td>
                      <td className="px-3 py-2">{tariff && o.net_weight ? (tariff.rental * tonsFromInvoice(o.net_weight)).toFixed(2) : "—"}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 font-bold ${o.status === "confirmed" ? "bg-green-100 text-green-700" : o.status === "loaded" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>
                        {o.status === "confirmed" ? "تم التنزيل" : o.status === "loaded" ? "تم التحميل" : "بانتظار التحميل"}</span></td>
                      <td className="px-3 py-2">{fmtDateTime(o.created_at)}<br />{fmtDateTime(o.confirmed_at)}</td>
                      <td className="px-3 py-2 max-w-44 truncate" title={o.notes || ""}>{o.notes || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => printLoadingOrder(o)} title="طباعة"><Printer size={15} /></button>
                          <button onClick={() => openEditLoadingOrder(o)} title="تعديل أمر التحميل (لا يغير الرحلة المسجلة)"><Pencil size={15} /></button>
                          {o.status === "loaded" && o.unload_location && <button onClick={() => confirmUnloading(o.id)} disabled={confirmingLO === o.id} title="تأكيد التنزيل" className="text-green-700 disabled:opacity-50"><CheckCheck size={16} /></button>}
                          <button onClick={() => deleteSingleLO(o.id, o.status === "confirmed")} title="حذف الأمر" className="text-red-600"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: سيارات محملة تحتاج موقع ── */}
      {tab === "needs-location" && (() => {
        const needsLoc = loadingOrders.filter(o => o.status === "loaded" && !o.unload_location);
        const saveQuickLoc = async (o: LoadingOrder) => {
          const locationName = (quickLocMap[o.id] || "").trim();
          const location = unloadLocations.find(item => item.name.trim().toLocaleLowerCase() === locationName.toLocaleLowerCase());
          const tariffId = quickTariffMap[o.id] || (o.tariff_id ? String(o.tariff_id) : "");
          if (!location || !tariffId) return;
          setSavingQuickLoc(p => ({ ...p, [o.id]: true }));
          try {
            const response = await fetch(`/api/loading-orders/${o.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                vehicle_plate: o.vehicle_plate,
                driver_name: o.driver_name,
                driver_phone: o.driver_phone || "",
                permit_number: o.permit_number || "",
                cement_ref_number: o.cement_ref_number || "",
                cargo_type: o.cargo_type || "",
                notes: o.notes || "",
                net_weight: o.net_weight || "",
                unload_location: location.name,
                unload_location_id: location.id,
                tariff_id: tariffId,
              }),
            });
            if (!response.ok) {
              const error = await response.json();
              alert(error.error || "تعذر حفظ الموقع والتعريفة");
              return;
            }
            setQuickLocMap(p => { const n = { ...p }; delete n[o.id]; return n; });
            setQuickTariffMap(p => { const n = { ...p }; delete n[o.id]; return n; });
            await fetch("/api/loading-orders").then(r => r.json()).then(setLoadingOrders).catch(() => {});
          } catch {
            alert("تعذر الاتصال أثناء حفظ الموقع والتعريفة");
          } finally {
            setSavingQuickLoc(p => ({ ...p, [o.id]: false }));
          }
        };
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚛</span>
              <h2 className="font-black text-gray-900">سيارات محملة تحتاج موقع تنزيل</h2>
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{needsLoc.length}</span>
            </div>
            {needsLoc.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-10 text-center">
                <div className="text-4xl mb-2">✅</div>
                <p className="font-bold text-green-800">جميع السيارات المحملة لديها موقع تنزيل</p>
              </div>
            ) : (
              <div className="space-y-3">
                {needsLoc.map(o => (
                  <div key={o.id} className="bg-white border border-red-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-gray-900 text-sm">{o.vehicle_plate}</span>
                        <span className="text-gray-400 text-xs">—</span>
                        <span className="text-gray-700 text-sm">{o.driver_name}</span>
                        {o.driver_phone && <span className="text-gray-400 text-xs">({o.driver_phone})</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">محمّل</span>
                          <button onClick={() => openEditLoadingOrder(o)}
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="تعديل كامل">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      </div>
                    </div>
                    {o.cargo_type && <p className="text-xs text-gray-500 mb-1">البضاعة: {o.cargo_type}</p>}
                    {o.net_weight && <p className="text-xs text-emerald-700 font-bold mb-1">⚖️ الوزن الصافي: {o.net_weight}</p>}
                    {o.loading_invoice_url && (
                      <div className="mb-3">{renderFilePreview(o.loading_invoice_url, `${o.id}:invoice`, "🧾 فتح فاتورة التحميل")}</div>
                    )}
                    {/* اختيار الموقع بالاسم، ثم التعريفة المطلوبة */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={quickLocMap[o.id] ?? ""}
                        list={`quick-unload-loc-list-${o.id}`}
                        onChange={e => setQuickLocMap(p => ({ ...p, [o.id]: e.target.value }))}
                        placeholder="ابحث عن موقع محفوظ بالاسم"
                        className="flex-1 min-w-0 px-3 py-2 text-sm border border-red-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
                      />
                      <datalist id={`quick-unload-loc-list-${o.id}`}>
                        {unloadLocations.map(loc => <option key={loc.id} value={loc.name} />)}
                      </datalist>
                      <select
                        value={quickTariffMap[o.id] ?? (o.tariff_id ? String(o.tariff_id) : "")}
                        onChange={e => setQuickTariffMap(p => ({ ...p, [o.id]: e.target.value }))}
                        className="flex-1 min-w-0 px-3 py-2 text-sm border border-red-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
                      >
                        <option value="">— اختر التعريفة —</option>
                        {bulkerTariffs.filter(t => !t.cargo_type || t.cargo_type === o.cargo_type || String(t.id) === String(o.tariff_id)).map(t =>
                          <option key={t.id} value={t.id}>{t.loading_place} ← {t.unloading_place} · {t.cargo_type || "كل الحمولات"}</option>)}
                      </select>
                      <button
                        onClick={() => saveQuickLoc(o)}
                        disabled={savingQuickLoc[o.id]
                          || !unloadLocations.some(loc => loc.name.trim().toLocaleLowerCase() === (quickLocMap[o.id] || "").trim().toLocaleLowerCase())
                          || !(quickTariffMap[o.id] || o.tariff_id)}
                        className="flex items-center justify-center gap-1 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-40 whitespace-nowrap transition-colors">
                        <CheckCheck size={14} />{savingQuickLoc[o.id] ? "..." : "حفظ"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Supply Requests — moved to supervisor ── */}
      {(false as boolean) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Truck size={16} className="text-amber-600" />
            <h2 className="font-bold text-gray-900">طلبات التوريد من المستودعات</h2>
          </div>
          {supplyReqs.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">لا توجد طلبات توريد</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {supplyReqs.map(r => {
                const sc =
                  r.status === "pending"             ? { label: "معلق",           color: "bg-amber-100 text-amber-700"  } :
                  r.status === "supervisor_assigned" ? { label: "تم تعيين سيارة", color: "bg-blue-100 text-blue-700"   } :
                  r.status === "in_transit"          ? { label: "في الطريق 🚛",   color: "bg-indigo-100 text-indigo-700"} :
                  r.status === "received"            ? { label: "مستلم ✓",        color: "bg-green-100 text-green-700" } :
                  r.status === "redirected"          ? { label: "محوَّل",         color: "bg-gray-100 text-gray-600"   } :
                                                       { label: r.status,          color: "bg-gray-100 text-gray-700"   };
                const isOpen = supplyAssignId === r.id;
                return (
                  <div key={r.id} className="px-5 py-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sc.color}`}>{sc.label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.priority === "urgent" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                            {r.priority === "urgent" ? "عاجل" : "عادي"}
                          </span>
                        </div>
                        <div className="font-semibold text-gray-900">{r.product_name}</div>
                        <div className="text-sm text-gray-500">{r.requested_qty?.toLocaleString("ar-SA")} {r.unit} · {r.trailer_loads} شاحنة</div>
                        <div className="mt-1 text-xs text-gray-400 flex flex-wrap gap-3">
                          {r.warehouse_name && <span>🏭 {r.warehouse_name}</span>}
                          {r.requested_by   && <span>👤 {r.requested_by}</span>}
                          {r.vehicle_plate  && <span>🚛 {r.vehicle_plate}</span>}
                          {r.driver_name    && <span>👷 {r.driver_name}</span>}
                          <span>{r.created_at?.slice(0,16)}</span>
                        </div>
                        {r.notes && <p className="text-xs text-gray-400 italic mt-1">{r.notes}</p>}
                      </div>
                      {r.status === "pending" && (
                        <button
                          onClick={() => { setSupplyAssignId(isOpen ? null : r.id); setSupplyForm({ vehicle_plate: "", driver_name: "", driver_phone: "" }); }}
                          className="flex-shrink-0 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600">
                          تعيين سيارة
                        </button>
                      )}
                    </div>

                    {/* Inline assign form */}
                    {isOpen && (
                      <div className="mt-3 p-4 bg-amber-50 rounded-xl space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">لوحة السيارة <span className="text-red-500">*</span></label>
                            <input list="sv-vlist" value={supplyForm.vehicle_plate}
                              onChange={e => setSupplyForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                              placeholder="رقم اللوحة"
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                            <datalist id="sv-vlist">{vehicles.filter(v => v.branch === "النقليات").map(v => <option key={v.id} value={v.plate}>{v.plate} — {v.type}</option>)}</datalist>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">السائق <span className="text-red-500">*</span></label>
                            <input list="sv-dlist" value={supplyForm.driver_name}
                              onChange={e => {
                                const d = drivers.find(x => x.driver_name === e.target.value);
                                setSupplyForm(f => ({ ...f, driver_name: e.target.value, driver_phone: d?.phone || f.driver_phone }));
                              }}
                              placeholder="اسم السائق"
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                            <datalist id="sv-dlist">{drivers.map(d => <option key={d.id} value={d.driver_name}>{d.driver_name} — {d.phone}</option>)}</datalist>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">جوال السائق</label>
                          <input value={supplyForm.driver_phone}
                            onChange={e => setSupplyForm(f => ({ ...f, driver_phone: e.target.value }))}
                            placeholder="05xxxxxxxx"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => assignSupplyReq(r.id)}
                            disabled={!supplyForm.vehicle_plate && !supplyForm.driver_name}
                            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 disabled:opacity-40">
                            <CheckCircle size={14} />تأكيد التعيين
                          </button>
                          <button onClick={() => setSupplyAssignId(null)}
                            className="p-2 hover:bg-amber-100 rounded-xl text-gray-500">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── دفتر سيارات البلكر ── */}
      {tab === "vehicles" && (
        <div className="space-y-5">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Excel buttons */}
            <button onClick={exportBulkerVehicles} disabled={bulkerVehiclesList.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
              <Download size={12} />تصدير Excel
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors">
              <Upload size={12} />استيراد Excel
              <input ref={bvImportFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { if (e.target.files?.[0]) parseBvImportFile(e.target.files[0]); e.target.value = ""; }} />
            </label>
            <button onClick={downloadBvTemplate}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors">
              <FileSpreadsheet size={12} />نموذج Excel
            </button>
            {/* Sync button */}
            <button onClick={syncFromFleet} disabled={syncingFleet}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors me-auto">
              <Car size={12} />{syncingFleet ? "جاري المزامنة..." : "مزامنة من الأسطول"}
            </button>
          </div>

          {/* Add / Edit Form */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              {editingBV ? <><Pencil size={13} />تعديل بيانات السيارة #{editingBV.id}</> : <><Plus size={13} />إضافة سيارة جديدة</>}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">رقم السيارة <span className="text-red-500">*</span></label>
                <input value={bvForm.vehicle_plate}
                  list="bv-plate-list"
                  onChange={e => {
                    const plate = e.target.value;
                    const match = vehiclePool.find(v => v.plate === plate);
                    const plateDigits = plate.replace(/\D/g, "");
                    const driverRec = drivers.find(d =>
                      d.vehicle_plate?.replace(/\D/g, "") === plateDigits
                    );
                    setBvForm(f => ({
                      ...f,
                      vehicle_plate: plate,
                      driver_name:  match?.driver_name  || driverRec?.driver_name || f.driver_name,
                      driver_phone: match?.driver_phone || driverRec?.phone       || f.driver_phone,
                      destination:  match?.entity       || driverRec?.branch      || f.destination,
                    }));
                  }}
                  placeholder="مثال: أ ب ج 1234"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" />
                <datalist id="bv-plate-list">
                  {vehiclePool.map(v => (
                    <option key={v.id} value={v.plate}>{v.plate}{v.driver_name ? ` — ${v.driver_name}` : ""}</option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">اسم السائق <span className="text-red-500">*</span></label>
                <input value={bvForm.driver_name}
                  list="bv-driver-list"
                  onChange={e => {
                    const name = e.target.value;
                    const match = drivers.find(d => d.driver_name === name);
                    const vehicleMatch = vehiclePool.find(v => v.driver_name === name);
                    setBvForm(f => ({
                      ...f,
                      driver_name: name,
                      driver_phone: match?.phone || vehicleMatch?.driver_phone || f.driver_phone,
                      destination:  vehicleMatch?.entity || match?.branch || f.destination,
                    }));
                  }}
                  placeholder="اختر أو اكتب اسم السائق"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" />
                <datalist id="bv-driver-list">
                  {drivers.map(d => (
                    <option key={d.id} value={d.driver_name}>{d.driver_name}{d.phone ? ` — ${d.phone}` : ""}</option>
                  ))}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">الجهة</label>
                <input value={bvForm.destination} onChange={e => setBvForm(f => ({ ...f, destination: e.target.value }))}
                  placeholder="المدينة أو الموقع"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">رقم السائق</label>
                <input value={bvForm.driver_phone} onChange={e => setBvForm(f => ({ ...f, driver_phone: e.target.value }))}
                  placeholder="05xxxxxxxx" type="tel"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1.5">
                  رقم المسؤول
                  {bvForm.supervisor_phone === user?.phone && (
                    <span className="text-blue-600 text-xs font-normal bg-blue-50 px-1.5 py-0.5 rounded-full">رقمك</span>
                  )}
                </label>
                <input value={bvForm.supervisor_phone} onChange={e => setBvForm(f => ({ ...f, supervisor_phone: e.target.value }))}
                  placeholder="05xxxxxxxx" type="tel"
                  className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 ${bvForm.supervisor_phone === user?.phone ? "border-blue-200 bg-blue-50/40 text-blue-800 font-semibold" : "border-gray-200 bg-white"}`} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">ملاحظات</label>
              <input value={bvForm.notes} onChange={e => setBvForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="أي تفاصيل إضافية..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" />
            </div>
            <div className="flex gap-2">
              <button onClick={saveBulkerVehicle} disabled={savingBV || !bvForm.vehicle_plate || !bvForm.driver_name}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white text-sm font-bold rounded-xl hover:bg-slate-700 disabled:opacity-40">
                <CheckCheck size={13} />{savingBV ? "جاري الحفظ..." : editingBV ? "حفظ التعديل" : "إضافة للدفتر"}
              </button>
              {editingBV && (
                <button onClick={() => { setEditingBV(null); setBvForm({ ...EMPTY_BV, supervisor_phone: user?.phone || "" }); }}
                  className="px-4 py-2 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 text-gray-600">إلغاء</button>
              )}
            </div>
          </div>

          {/* Vehicles Table */}
          {bulkerVehiclesList.length === 0 ? (
            <div className="text-center py-14 text-sm text-gray-400 bg-white rounded-2xl border border-gray-100">
              <Truck size={36} className="mx-auto text-gray-200 mb-3" />
              لا توجد سيارات في الدفتر بعد
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
                <Truck size={15} className="text-slate-600" />
                <span className="font-bold text-slate-800 text-sm">سيارات البلكر المسجلة</span>
                <span className="bg-slate-200 text-slate-700 text-xs rounded-full px-2 font-bold">{bulkerVehiclesList.length}</span>
                <input
                  value={bvSearch} onChange={e => setBvSearch(e.target.value)}
                  placeholder="بحث برقم السيارة..."
                  className="mr-auto px-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white w-44" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-right px-4 py-2.5 font-bold text-gray-500 text-xs">رقم السيارة</th>
                      <th className="text-right px-4 py-2.5 font-bold text-gray-500 text-xs">اسم السائق</th>
                      <th className="text-right px-4 py-2.5 font-bold text-gray-500 text-xs">الجهة</th>
                      <th className="text-right px-4 py-2.5 font-bold text-gray-500 text-xs">رقم السائق</th>
                      <th className="text-right px-4 py-2.5 font-bold text-gray-500 text-xs">رقم المسؤول</th>
                      <th className="px-4 py-2.5 text-xs"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {bulkerVehiclesList.filter(v => !bvSearch || v.vehicle_plate.includes(bvSearch)).map(v => {
                      const isLoaded   = loadedPlates.has(v.vehicle_plate);
                      const isHeading  = headingPlates.has(v.vehicle_plate);
                      const isStopped  = !!v.is_stopped;
                      return (
                      <tr key={v.id} className={`hover:bg-slate-50 transition-colors group ${isLoaded ? "bg-blue-50/40" : isHeading ? "bg-purple-50/40" : isStopped ? "bg-gray-50/60" : ""}`}>
                        <td className="px-4 py-3 font-bold text-gray-900">
                          <div className="flex items-center gap-2">
                            <span className={isStopped ? "text-gray-400 line-through" : ""}>{v.vehicle_plate}</span>
                            {isLoaded   && <span className="text-xs font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">🚛 محملة</span>}
                            {isHeading  && <span className="text-xs font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full">📍 متوجهة</span>}
                            {isStopped  && <span className="text-xs font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full">⛔ متوقفة</span>}
                            {!isLoaded && !isHeading && !isStopped && <span className="text-xs font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">✅ متاحة</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-800">{v.driver_name}</td>
                        <td className="px-4 py-3 text-gray-600">{v.destination || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3">
                          {v.driver_phone
                            ? <a href={`tel:${v.driver_phone}`} className="flex items-center gap-1 text-blue-600 hover:underline font-mono text-xs"><Phone size={11} />{v.driver_phone}</a>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {v.supervisor_phone
                            ? <a href={`tel:${v.supervisor_phone}`} className="flex items-center gap-1 text-blue-600 hover:underline font-mono text-xs"><Phone size={11} />{v.supervisor_phone}</a>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={async () => {
                                await fetch(`/api/bulker-vehicles/${v.id}/toggle-stopped`, { method: "PUT" });
                                const rows = await fetch("/api/bulker-vehicles").then(r => r.json());
                                setBulkerVehiclesList(rows);
                              }}
                              className={`p-1.5 rounded-lg border text-xs font-bold transition-colors ${v.is_stopped ? "bg-green-50 hover:bg-green-100 text-green-600 border-green-100" : "bg-gray-50 hover:bg-gray-100 text-gray-500 border-gray-200"}`}
                              title={v.is_stopped ? "تفعيل السيارة" : "تعطيل السيارة مؤقتاً"}>
                              {v.is_stopped ? "▶ تفعيل" : "⛔ إيقاف"}
                            </button>
                            <button
                              onClick={() => {
                                setEditingBV(v);
                                setBvForm({ vehicle_plate: v.vehicle_plate, driver_name: v.driver_name, destination: v.destination || "", driver_phone: v.driver_phone || "", supervisor_phone: v.supervisor_phone || "", notes: v.notes || "" });
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg border border-indigo-100" title="تعديل">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => { setLoForm({ ...EMPTY_LO, permit_number: nextPermitNumber(), vehicle_plate: v.vehicle_plate, driver_name: v.driver_name }); setShowNewLO(true); setTab("loading-orders"); }}
                              className="p-1.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg border border-green-100 text-xs font-bold px-2" title="إنشاء أمر تحميل لهذه السيارة">
                              + أمر
                            </button>
                            <button onClick={() => deleteBulkerVehicle(v.id)}
                              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg border border-red-100" title="حذف">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* BV Import Modal */}
          {showBvImportModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <FileSpreadsheet size={16} className="text-indigo-600" />
                    معاينة ملف الاستيراد — دفتر السيارات
                  </h2>
                  <button onClick={() => setShowBvImportModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-gray-600">
                      <span className="font-bold text-green-600">{bvImportRows.filter(r => r._valid).length}</span> صف صالح
                      {bvImportRows.filter(r => !r._valid).length > 0 && (
                        <span className="font-bold text-red-500 mr-2">{bvImportRows.filter(r => !r._valid).length} غير صالح</span>
                      )}
                    </span>
                    <button onClick={downloadBvTemplate}
                      className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 me-auto">
                      <Download size={12} />تحميل النموذج
                    </button>
                  </div>
                  {bvImportRows.filter(r => !r._valid).length > 0 && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                      <AlertTriangle size={15} className="text-red-500" />
                      <span className="text-sm font-bold text-red-600">الصفوف الحمراء ستُتخطى (رقم السيارة أو اسم السائق ناقص)</span>
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-xl border border-gray-200 max-h-80 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0">
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-right px-3 py-2 font-bold text-gray-500">#</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">رقم السيارة</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">اسم السائق</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">الجهة</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">رقم السائق</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">رقم المسؤول</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">ملاحظات</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bvImportRows.map((row, i) => (
                          <tr key={i} className={row._valid ? "hover:bg-green-50/50" : "bg-red-50/60"}>
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className={`px-3 py-2 font-bold ${!row.vehicle_plate ? "text-red-500" : "text-gray-900"}`}>{row.vehicle_plate || "⚠ ناقص"}</td>
                            <td className={`px-3 py-2 font-semibold ${!row.driver_name ? "text-red-500" : "text-gray-800"}`}>{row.driver_name || "⚠ ناقص"}</td>
                            <td className="px-3 py-2 text-gray-600">{row.destination || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-gray-600 font-mono">{row.driver_phone || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-gray-600 font-mono">{row.supervisor_phone || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-gray-500">{row.notes || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2">{row._valid ? <CheckCheck size={12} className="text-green-500" /> : <AlertTriangle size={12} className="text-red-400" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button onClick={importBulkerVehicles}
                      disabled={importingBV || bvImportRows.filter(r => r._valid).length === 0}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-700 text-white font-bold rounded-xl hover:bg-indigo-800 disabled:opacity-40 text-sm">
                      <Upload size={14} />{importingBV ? "جاري الاستيراد..." : `استيراد ${bvImportRows.filter(r => r._valid).length} صف`}
                    </button>
                    <label className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">
                      <FileSpreadsheet size={14} />اختر ملف آخر
                      <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                        onChange={e => { if (e.target.files?.[0]) parseBvImportFile(e.target.files[0]); e.target.value = ""; }} />
                    </label>
                    <button onClick={() => setShowBvImportModal(false)}
                      className="px-4 py-2.5 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 text-gray-600">إلغاء</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── مواقع التنزيل ── */}
      {tab === "locations" && (
        <div className="space-y-4">
          {/* نموذج الإضافة / التعديل */}
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 space-y-3">
            <h3 className="font-black text-teal-900 flex items-center gap-2">
              <span className="text-lg">📍</span>
              {editingLoc ? `تعديل: ${editingLoc.name}` : "إضافة موقع تنزيل جديد"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">اسم الموقع <span className="text-red-500">*</span></label>
                <input value={locForm.name}
                  onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="مثال: مشروع الشمال، مستودع الرياض..."
                  className="w-full px-3 py-2 text-sm border border-teal-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">رقم جوال الموقع</label>
                <input value={locForm.phone_number}
                  onChange={e => setLocForm(f => ({ ...f, phone_number: e.target.value }))}
                  placeholder="05xxxxxxxx" type="tel" dir="ltr"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">رابط اللوكيشن</label>
                <input value={locForm.map_url}
                  onChange={e => setLocForm(f => ({ ...f, map_url: e.target.value }))}
                  placeholder="https://maps.google.com/..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات</label>
                <input value={locForm.notes}
                  onChange={e => setLocForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="عنوان تفصيلي أو تعليمات..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveLocation} disabled={savingLoc || !locForm.name.trim()}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-teal-700 text-white text-sm font-bold rounded-xl hover:bg-teal-800 disabled:opacity-50">
                <CheckCheck size={14} />{savingLoc ? "جاري الحفظ..." : editingLoc ? "حفظ التعديل" : "إضافة الموقع"}
              </button>
              {editingLoc && (
                <button onClick={() => { setEditingLoc(null); setLocForm({ name: "", notes: "", phone_number: "", map_url: "" }); }}
                  className="px-4 py-2.5 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 text-gray-600">إلغاء</button>
              )}
            </div>
          </div>

          {/* قائمة المواقع */}
          {unloadLocations.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">📍</div>
              <p className="font-semibold">لا توجد مواقع بعد</p>
              <p className="text-sm mt-1">أضف مواقع التنزيل المستخدمة بشكل متكرر</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {unloadLocations.map(loc => (
                <div key={loc.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-teal-200 transition-colors">
                  <span className="text-lg">📍</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{loc.name}</p>
                    {loc.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{loc.notes}</p>}
                    {loc.phone_number && <a href={`tel:${loc.phone_number}`} className="block text-xs text-gray-600 mt-1" dir="ltr">{loc.phone_number}</a>}
                    {loc.map_url && <a href={loc.map_url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-teal-700 underline mt-1">فتح اللوكيشن ↗</a>}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => { setEditingLoc(loc); setLocForm({ name: loc.name, notes: loc.notes || "", phone_number: loc.phone_number || "", map_url: loc.map_url || "" }); }}
                      className="p-1.5 hover:bg-teal-50 rounded-lg text-gray-400 hover:text-teal-600 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteLocation(loc.id)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


    </div>
  );
}
