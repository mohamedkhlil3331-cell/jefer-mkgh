import { useEffect, useState, useRef } from "react";
import {
  Plus, Edit2, Trash2, Save, X, MapPin, Truck, Search, Route, DollarSign, Activity, Download, Upload, Copy, Camera, Eye, ImageOff, BookOpen, Power
} from "lucide-react";
import * as XLSX from "xlsx";
import { useRememberedState } from "@/hooks/useRememberedState";

interface Tariff {
  id: number;
  row_id?: number;
  locations?: TariffLocation[];
  loading_place: string;
  unloading_place: string;
  driver_expense: number;
  rental: number;
  vehicle_type?: string;
  supplier?: string;
  customer_name?: string;
  loaded_meters?: number | null;
  cargo_type?: string;
  notes?: string;
  synced_at?: string;
  km_per_route?: number | null;
  image_url?: string | null;
}
interface TariffLocation {
  id: number;
  kind: "loading" | "unloading";
  name: string;
  url: string;
}
interface TripGroup {
  client_name: string;
  material_type: string | null;
  destination: string;
  trip_count: number;
  avg_price: number;
  max_price: number;
  min_price: number;
  avg_bonus: number;
  avg_diesel: number;
  avg_driver_total: number;
  sample_car: string | null;
}
interface VehicleType { id: number; name: string; icon: string; rate_per_km: number; active: number; }
interface VehicleTypeDef { id: number; name: string; icon: string; is_active: number; sort_order: number; }
interface FbRule { id: number; origin_city: string; dest_city: string; multiplier: number; notes?: string; }
interface BonusRate { id: number; state: string; rate_per_km: number; }
interface TemplateRegion {
  key: string;
  label: string;
  image_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface InvoiceTemplate {
  id: number;
  name: string;
  description?: string | null;
  supplier?: string | null;
  cargo_type?: string | null;
  marker_text?: string | null;
  tariff_id?: number | null;
  sample_images: string[];
  active: boolean;
  loading_place?: string | null;
  unloading_place?: string | null;
  rules?: { weight_rule?: string; field_notes?: string; regions?: TemplateRegion[] };
}

const TRIP_STATE_ICONS: Record<string, string> = {
  "سطحة محملة":   "🚛", "قلاب محمل":    "🚚", "بلكر محمل":   "⛽",
  "راس فقط":      "🔧", "رجوع خالي":   "↩️", "عطل / صيانة": "🔴", "فحص": "🔍",
};

const EMPTY: Partial<Tariff> = { loading_place: "", unloading_place: "", driver_expense: 0, rental: 0, vehicle_type: "", supplier: "", customer_name: "", loaded_meters: null, cargo_type: "" };
const FB_EMPTY: Partial<FbRule> = { origin_city: "", dest_city: "", multiplier: 2, notes: "" };
const TRIP_FIELD_OPTIONS = [
  { key: "material_type", label: "نوع الحمولة" },
  { key: "meter_ton", label: "الوزن / الكمية" },
  { key: "payment_voucher", label: "رقم الفاتورة / المستند" },
  { key: "loading_card_no", label: "رقم التصريح / كارت التحميل" },
  { key: "supplier", label: "المورد" },
  { key: "client_name", label: "العميل" },
  { key: "loading_region", label: "مكان التحميل" },
  { key: "unloading_region", label: "مكان التنزيل" },
] as const;

type TabId = "tariffs" | "invoice_templates" | "km" | "bonus" | "multipliers" | "analysis";
const invoiceAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` });

export default function TariffsPage() {
  const [rows, setRows] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationManager, setLocationManager] = useState<{ tariffId: number; kind: TariffLocation["kind"] } | null>(null);
  const [locationForm, setLocationForm] = useState({ name: "", url: "" });
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [filterLoading, setFilterLoading] = useRememberedState("admin-tariffs-loading-place-filter", "");
  const [filterVehicleType, setFilterVehicleType] = useRememberedState("admin-tariffs-vehicle-type-filter", "");
  const [search, setSearch] = useRememberedState("admin-tariffs-search", "");
  const [modal, setModal] = useState<{ open: boolean; row: Partial<Tariff> }>({ open: false, row: {} });
  const [saving, setSaving] = useState(false);
  const [editInline, setEditInline] = useState<Record<number, Partial<Tariff>>>({});

  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [vehicleTypeDefs, setVehicleTypeDefs] = useState<VehicleTypeDef[]>([]);
  const [vtRateEdits,  setVtRateEdits]  = useState<Record<number, string>>({});
  const [savingVt,     setSavingVt]     = useState<number | null>(null);
  const [newVt,        setNewVt]        = useState({ name: "", icon: "🚛", rate_per_km: "" });
  const [addingVt,     setAddingVt]     = useState(false);

  const [fbRules,   setFbRules]   = useState<FbRule[]>([]);
  const [fbModal,   setFbModal]   = useState<{ open: boolean; row: Partial<FbRule> }>({ open: false, row: {} });
  const [savingFb,  setSavingFb]  = useState(false);

  const [bonusRates,  setBonusRates]  = useState<BonusRate[]>([]);
  const [bonusEdits,  setBonusEdits]  = useState<Record<string, string>>({});
  const [savingBonus, setSavingBonus] = useState<string | null>(null);
  const [newBonus,    setNewBonus]    = useState({ state: "", rate_per_km: "" });
  const [addingBonus, setAddingBonus] = useState(false);

  const [activeTab,        setActiveTab]        = useState<TabId>("tariffs");
  const [tripGroups,       setTripGroups]       = useState<TripGroup[]>([]);
  const [loadingTrips,     setLoadingTrips]     = useState(false);
  const [tripSearch,       setTripSearch]       = useRememberedState("admin-tariffs-trips-search", "");
  const [analysisLoaded,   setAnalysisLoaded]   = useState(false);
  const [invoiceTemplates, setInvoiceTemplates] = useState<InvoiceTemplate[]>([]);
  const [templateModal, setTemplateModal] = useState<{ open: boolean; row: Partial<InvoiceTemplate> }>({ open: false, row: {} });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [uploadingTemplateImage, setUploadingTemplateImage] = useState(false);
  const [annotationImageIndex, setAnnotationImageIndex] = useState(0);
  const [selectedTemplateField, setSelectedTemplateField] = useState(TRIP_FIELD_OPTIONS[0].key);
  const [drawingRegion, setDrawingRegion] = useState<{ x: number; y: number; currentX: number; currentY: number } | null>(null);
  const annotationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (templateModal.open) {
      setAnnotationImageIndex(0);
      setDrawingRegion(null);
    }
  }, [templateModal.open]);

  // ── Image upload state ───────────────────────────────────────────────────────
  const [uploadingImgId, setUploadingImgId] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const imgInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const uploadTariffImage = async (id: number, file: File) => {
    setUploadingImgId(id);
    try {
      const r = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = await r.json() as { uploadURL: string; objectPath: string };
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      const imageUrl = `/api/storage${objectPath}`;
      await fetch(`/api/tariffs/${id}/image`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      setRows(prev => prev.map(r => r.id === id ? { ...r, image_url: imageUrl } : r));
    } catch { alert("فشل رفع الصورة"); }
    finally { setUploadingImgId(null); }
  };

  const removeTariffImage = async (id: number) => {
    if (!confirm("حذف صورة هذا المسار؟")) return;
    await fetch(`/api/tariffs/${id}/image`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: null }),
    });
    setRows(prev => prev.map(r => r.id === id ? { ...r, image_url: null } : r));
  };

  const tariffImportRef = useRef<HTMLInputElement | null>(null);
  const [importingTariff, setImportingTariff] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    open: boolean;
    rows: { loading_place: string; unloading_place: string; driver_expense: number; rental: number }[];
    replaceExisting: boolean;
    fileName: string;
  }>({ open: false, rows: [], replaceExisting: false, fileName: "" });

  const load = () => {
    setLoading(true);
    fetch("/api/tariffs")
      .then(r => r.json())
      .then(d => { setRows(d.rows || []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  const refreshTariffs = async () => {
    const response = await fetch("/api/tariffs");
    if (!response.ok) throw new Error("تعذر تحديث قائمة التعريفات");
    const data = await response.json();
    setRows(Array.isArray(data.rows) ? data.rows : []);
  };
  const apiErrorMessage = async (response: Response, fallback: string) => {
    try {
      const data = await response.json();
      return data.error || data.message || fallback;
    } catch {
      return fallback;
    }
  };
  const openLocationManager = (tariffId: number, kind: TariffLocation["kind"]) => {
    setLocationManager({ tariffId, kind });
    setLocationForm({ name: "", url: "" });
    setEditingLocationId(null);
    setLocationError("");
  };
  const saveTariffLocation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!locationManager) return;
    const name = locationForm.name.trim();
    const url = locationForm.url.trim();
    if (!name) {
      setLocationError("يرجى إدخال اسم الموقع");
      return;
    }
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error();
    } catch {
      setLocationError("يرجى إدخال رابط صالح يبدأ بـ http:// أو https://");
      return;
    }
    setLocationBusy(true);
    setLocationError("");
    try {
      const isEditing = editingLocationId !== null;
      const response = await fetch(
        isEditing
          ? `/api/tariffs/${locationManager.tariffId}/locations/${editingLocationId}`
          : `/api/tariffs/${locationManager.tariffId}/locations`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isEditing ? { name, url } : { kind: locationManager.kind, name, url }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response, "تعذر حفظ الموقع"));
      await refreshTariffs();
      setLocationForm({ name: "", url: "" });
      setEditingLocationId(null);
    } catch (error) {
      setLocationError((error as Error).message || "حدث خطأ أثناء حفظ الموقع");
    } finally {
      setLocationBusy(false);
    }
  };
  const deleteTariffLocation = async (locationId: number) => {
    if (!locationManager || !confirm("هل تريد حذف هذا الموقع؟")) return;
    setLocationBusy(true);
    setLocationError("");
    try {
      const response = await fetch(`/api/tariffs/${locationManager.tariffId}/locations/${locationId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "تعذر حذف الموقع"));
      await refreshTariffs();
      if (editingLocationId === locationId) {
        setEditingLocationId(null);
        setLocationForm({ name: "", url: "" });
      }
    } catch (error) {
      setLocationError((error as Error).message || "حدث خطأ أثناء حذف الموقع");
    } finally {
      setLocationBusy(false);
    }
  };
  const loadVt  = () => fetch("/api/rental-vehicle-types/all").then(r => r.json()).then(setVehicleTypes).catch(() => {});
  const loadVtDefs = () => fetch("/api/vehicle-type-defs").then(r => r.json()).then(d => setVehicleTypeDefs(Array.isArray(d) ? d : [])).catch(() => {});
  const loadFb  = () => fetch("/api/flatbed-multipliers").then(r => r.json()).then(setFbRules).catch(() => {});
  const loadBonus = () => fetch("/api/trip-bonus-rates").then(r => r.json()).then(setBonusRates).catch(() => {});

  const loadInvoiceTemplates = () =>
    fetch("/api/invoice-templates?include_inactive=1", { headers: invoiceAuthHeaders() })
      .then(r => r.json())
      .then(d => setInvoiceTemplates(Array.isArray(d) ? d : []))
      .catch(() => {});

  useEffect(() => { load(); loadVt(); loadVtDefs(); loadFb(); loadBonus(); loadInvoiceTemplates(); }, []);

  const saveBonusRate = async (state: string) => {
    const rate = parseFloat(bonusEdits[state] ?? "");
    if (isNaN(rate)) return;
    setSavingBonus(state);
    try {
      await fetch(`/api/trip-bonus-rates/${encodeURIComponent(state)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_per_km: rate }),
      });
      await loadBonus();
      setBonusEdits(prev => { const n = { ...prev }; delete n[state]; return n; });
    } finally { setSavingBonus(null); }
  };

  const addBonusRate = async () => {
    if (!newBonus.state.trim()) return;
    setAddingBonus(true);
    try {
      const res = await fetch("/api/trip-bonus-rates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: newBonus.state.trim(), rate_per_km: parseFloat(newBonus.rate_per_km) || 0 }),
      });
      if (res.ok) { setNewBonus({ state: "", rate_per_km: "" }); await loadBonus(); }
    } finally { setAddingBonus(false); }
  };

  const deleteBonusRate = async (state: string) => {
    if (!confirm(`حذف نوع السيارة "${state}" من قائمة البونص؟`)) return;
    await fetch(`/api/trip-bonus-rates/${encodeURIComponent(state)}`, { method: "DELETE" });
    await loadBonus();
  };

  const loadFromTrips = async () => {
    setLoadingTrips(true);
    try {
      const data = await fetch("/api/tariffs/from-trips").then(r => r.json());
      setTripGroups(Array.isArray(data) ? data : []);
      setAnalysisLoaded(true);
    } finally { setLoadingTrips(false); }
  };

  useEffect(() => {
    if (activeTab === "analysis" && !analysisLoaded) { loadFromTrips(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Warn before unload when there are unsaved inline edits ──────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (Object.keys(editInline).length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editInline]);

  const loadingPlaces   = [...new Set(rows.map(r => r.loading_place))].sort();
  const vehicleTypeOpts = [...new Set(rows.map(r => r.vehicle_type ?? "").filter(Boolean))].sort();

  const filtered = rows.filter(r => {
    const matchPlace   = !filterLoading     || r.loading_place === filterLoading;
    const matchVehicle = !filterVehicleType || (r.vehicle_type ?? "") === filterVehicleType;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.loading_place.toLowerCase().includes(q) ||
      r.unloading_place.toLowerCase().includes(q) ||
      (r.vehicle_type   ?? "").toLowerCase().includes(q) ||
      (r.customer_name  ?? "").toLowerCase().includes(q) ||
      (r.supplier       ?? "").toLowerCase().includes(q);
    return matchPlace && matchVehicle && matchSearch;
  });

  const saveInline = async (id: number) => {
    const patch = editInline[id];
    if (!patch) return;
    setSaving(true);
    const orig = rows.find(r => r.id === id)!;
    await fetch(`/api/tariffs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...orig, ...patch }),
    });
    setSaving(false);
    setEditInline(e => { const n = { ...e }; delete n[id]; return n; });
    load();
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا السطر؟")) return;
    await fetch(`/api/tariffs/${id}`, { method: "DELETE" });
    load();
  };

  const duplicate = async (r: Tariff) => {
    const res = await fetch("/api/tariffs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loading_place: r.loading_place,
        unloading_place: r.unloading_place,
        driver_expense: r.driver_expense,
        rental: r.rental,
        vehicle_type: r.vehicle_type || null,
        supplier: r.supplier || null,
        customer_name: r.customer_name || null,
        loaded_meters: r.loaded_meters ?? null,
        cargo_type: r.cargo_type || null,
        notes: r.notes || null,
      }),
    });
    const data = await res.json();
    const newId = data.id as number;
    await new Promise<void>(resolve => {
      setRows(prev => {
        const idx = prev.findIndex(x => x.id === r.id);
        const copy: Tariff = { ...r, id: newId };
        const next = [...prev];
        next.splice(idx + 1, 0, copy);
        resolve();
        return next;
      });
    });
    setEditInline(e => ({
      ...e,
      [newId]: {
        loading_place: r.loading_place,
        unloading_place: r.unloading_place,
        driver_expense: r.driver_expense,
        rental: r.rental,
        vehicle_type: r.vehicle_type ?? "",
        supplier: r.supplier ?? "",
        customer_name: r.customer_name ?? "",
      },
    }));
  };

  const handleTariffFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
      if (!raw.length) { alert("الملف فارغ أو لا يحتوي على صفوف"); return; }
      const parsed = raw
        .map(row => ({
          loading_place:  String(row["مكان التحميل"]  || row["loading_place"]  || "").trim(),
          unloading_place:String(row["مكان التنزيل"] || row["unloading_place"] || "").trim(),
          driver_expense: parseFloat(String(row["مصروف السائق"] || row["السعر"] || row["driver_expense"] || "0")) || 0,
          rental:         parseFloat(String(row["الإيجار"] || row["الايجار"]   || row["rental"]          || "0")) || 0,
        }))
        .filter(r => r.loading_place && r.unloading_place);
      if (!parsed.length) { alert("لم يُعثر على صفوف صالحة — تأكد من وجود أعمدة: مكان التحميل، مكان التنزيل"); return; }
      setImportPreview({ open: true, rows: parsed, replaceExisting: false, fileName: file.name });
    } catch { alert("فشل قراءة الملف — تأكد أنه ملف Excel (.xlsx/.xls)"); }
    finally { if (tariffImportRef.current) tariffImportRef.current.value = ""; }
  };

  const confirmTariffImport = async () => {
    setImportingTariff(true);
    try {
      const res = await fetch("/api/tariffs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...invoiceAuthHeaders() },
        body: JSON.stringify({ rows: importPreview.rows.map(r => ({
          "مكان التحميل":  r.loading_place,
          "مكان التنزيل": r.unloading_place,
          "مصروف السائق": r.driver_expense,
          "الإيجار":       r.rental,
        })), replace_existing: importPreview.replaceExisting }),
      });
      const d = await res.json();
      alert(d.message || "تم الاستيراد");
      setImportPreview({ open: false, rows: [], replaceExisting: false, fileName: "" });
      load();
    } catch { alert("فشل الاستيراد"); }
    finally { setImportingTariff(false); }
  };

  const exportTariffs = () => {
    if (!rows.length) { alert("لا توجد بيانات للتصدير"); return; }
    const data = rows.map(r => ({
      "مكان التحميل":  r.loading_place,
      "مكان التنزيل": r.unloading_place,
      "نوع السيارة":   r.vehicle_type || "",
      "مصروف السائق": r.driver_expense,
      "الإيجار":       r.rental,
      "ملاحظات":       r.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "التعريفة");
    XLSX.writeFile(wb, `التعريفة_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const saveVtRate = async (vt: VehicleType) => {
    const rate = parseFloat(vtRateEdits[vt.id] ?? String(vt.rate_per_km)) || 0;
    setSavingVt(vt.id);
    await fetch(`/api/rental-vehicle-types/${vt.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: vt.name, icon: vt.icon, sort_order: 0, active: vt.active, rate_per_km: rate }),
    });
    setSavingVt(null);
    setVtRateEdits(e => { const n = { ...e }; delete n[vt.id]; return n; });
    loadVt();
  };

  const addVtType = async () => {
    if (!newVt.name.trim()) return;
    setAddingVt(true);
    try {
      await fetch("/api/rental-vehicle-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newVt.name.trim(), icon: newVt.icon || "🚛", rate_per_km: parseFloat(newVt.rate_per_km) || 0 }),
      });
      setNewVt({ name: "", icon: "🚛", rate_per_km: "" });
      await loadVt();
    } finally { setAddingVt(false); }
  };

  const deleteVtType = async (id: number, name: string) => {
    if (!confirm(`حذف "${name}" من القائمة؟`)) return;
    await fetch(`/api/rental-vehicle-types/${id}`, { method: "DELETE" });
    await loadVt();
  };

  const saveFb = async () => {
    setSavingFb(true);
    const { id, ...body } = fbModal.row;
    const url  = id ? `/api/flatbed-multipliers/${id}` : "/api/flatbed-multipliers";
    const meth = id ? "PUT" : "POST";
    await fetch(url, { method: meth, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSavingFb(false);
    setFbModal({ open: false, row: {} });
    loadFb();
  };

  const deleteFb = async (id: number) => {
    if (!confirm("حذف هذه القاعدة؟")) return;
    await fetch(`/api/flatbed-multipliers/${id}`, { method: "DELETE" });
    setFbRules(r => r.filter(x => x.id !== id));
  };

  const saveModal = async () => {
    setSaving(true);
    const { id, ...body } = modal.row;
    const url = id ? `/api/tariffs/${id}` : "/api/tariffs";
    await fetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    setModal({ open: false, row: {} });
    load();
  };

  const saveInvoiceTemplate = async () => {
    if (!templateModal.row.name?.trim()) return;
    setSavingTemplate(true);
    try {
      const { id, ...body } = templateModal.row;
      const response = await fetch(id ? `/api/invoice-templates/${id}` : "/api/invoice-templates", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ النموذج");
      setTemplateModal({ open: false, row: {} });
      loadInvoiceTemplates();
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const duplicateInvoiceTemplate = async (id: number) => {
    await fetch(`/api/invoice-templates/${id}/duplicate`, { method: "POST", headers: invoiceAuthHeaders() });
    loadInvoiceTemplates();
  };

  const toggleInvoiceTemplate = async (template: InvoiceTemplate) => {
    await fetch(`/api/invoice-templates/${template.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...invoiceAuthHeaders() },
      body: JSON.stringify({ ...template, active: !template.active }),
    });
    loadInvoiceTemplates();
  };

  const uploadTemplateSample = async (file: File) => {
    setUploadingTemplateImage(true);
    try {
      const request = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...invoiceAuthHeaders() },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = await request.json() as { uploadURL: string; objectPath: string };
      const upload = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!upload.ok) throw new Error("فشل رفع صورة النموذج");
      setTemplateModal(current => {
        setAnnotationImageIndex(0);
        return {
          ...current,
          row: {
            ...current.row,
            sample_images: [objectPath],
            rules: { ...(current.row.rules || {}), regions: [] },
          },
        };
      });
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setUploadingTemplateImage(false);
    }
  };

  const annotationPoint = (clientX: number, clientY: number) => {
    const rect = annotationRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const finishRegion = () => {
    if (!drawingRegion) return;
    const x = Math.min(drawingRegion.x, drawingRegion.currentX);
    const y = Math.min(drawingRegion.y, drawingRegion.currentY);
    const width = Math.abs(drawingRegion.currentX - drawingRegion.x);
    const height = Math.abs(drawingRegion.currentY - drawingRegion.y);
    setDrawingRegion(null);
    if (width < 1 || height < 1) return;
    const field = TRIP_FIELD_OPTIONS.find(option => option.key === selectedTemplateField)!;
    setTemplateModal(current => {
      const regions = (current.row.rules?.regions || []).filter(region =>
        !(region.key === field.key && region.image_index === annotationImageIndex)
      );
      return {
        ...current,
        row: {
          ...current.row,
          rules: {
            ...(current.row.rules || {}),
            regions: [...regions, { key: field.key, label: field.label, image_index: annotationImageIndex, x, y, width, height }],
          },
        },
      };
    });
  };

  const openTariffTraining = (tariff: Tariff) => {
    const existing = invoiceTemplates.find(template => Number(template.tariff_id) === tariff.id);
    setTemplateModal({
      open: true,
      row: existing ? { ...existing } : {
        name: `${tariff.loading_place} ← ${tariff.unloading_place}`,
        description: `تعليم صورة تعريفة ${tariff.loading_place} إلى ${tariff.unloading_place}`,
        supplier: tariff.supplier || "",
        cargo_type: tariff.cargo_type || "",
        marker_text: "",
        tariff_id: tariff.id,
        sample_images: [],
        active: true,
        rules: {},
      },
    });
  };

  const setInline = (id: number, k: keyof Tariff, v: string | number) =>
    setEditInline(e => ({ ...e, [id]: { ...e[id], [k]: v } }));

  const TABS: { id: TabId; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "tariffs",     label: "جدول التعريفة",    icon: MapPin,      badge: rows.length },
    { id: "km",          label: "معدل السعر / كم",   icon: DollarSign,  badge: vehicleTypes.length },
    { id: "bonus",       label: "بونص السائق",        icon: Activity,    badge: bonusRates.length },
    { id: "multipliers", label: "مضاعفات المسارات",  icon: Route,       badge: fbRules.length },
    { id: "analysis",    label: "التحاليل",           icon: Search,      badge: tripGroups.length || undefined },
  ];
  const managedTariff = locationManager ? rows.find(row => row.id === locationManager.tariffId) : undefined;
  const managedLocations = managedTariff?.locations?.filter(location => location.kind === locationManager?.kind) || [];

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التعريفة والأسعار</h1>
          <p className="text-sm text-gray-500 mt-0.5">إدارة التعريفة — أسعار الكم — البونص — المضاعفات — التحاليل</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {activeTab === "tariffs" && (
            <>
              <button onClick={exportTariffs} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 shadow-sm">
                <Download size={14} className="text-emerald-600" />تصدير Excel
              </button>
              <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 shadow-sm cursor-pointer">
                <Upload size={14} className="text-blue-600" />استيراد Excel
                <input ref={tariffImportRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleTariffFileSelect} />
              </label>
              <button onClick={() => setModal({ open: true, row: { ...EMPTY } })} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 shadow-sm">
                <Plus size={14} />إضافة يدوي
              </button>
            </>
          )}
          {activeTab === "multipliers" && (
            <button onClick={() => setFbModal({ open: true, row: { ...FB_EMPTY } })}
              className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600">
              <Plus size={14} />إضافة قاعدة
            </button>
          )}
          {activeTab === "analysis" && (
            <button onClick={loadFromTrips} disabled={loadingTrips}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-xl text-sm hover:bg-amber-600 shadow-sm disabled:opacity-60">
              <Activity size={14} />{loadingTrips ? "جاري التحديث..." : "تحديث التحاليل"}
            </button>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
              }`}>
              <Icon size={14} className={active ? (
                tab.id === "tariffs" ? "text-blue-600" :
                tab.id === "km" ? "text-green-600" :
                tab.id === "bonus" ? "text-purple-600" :
                tab.id === "multipliers" ? "text-orange-500" : "text-amber-600"
              ) : "text-gray-400"} />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  active ? "bg-gray-100 text-gray-600" : "bg-gray-200 text-gray-500"
                }`}>{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Import Preview Modal */}
      {importPreview.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">معاينة الاستيراد</h2>
                <p className="text-xs text-gray-500 mt-0.5">{importPreview.fileName} — {importPreview.rows.length} مسار</p>
              </div>
              <button onClick={() => setImportPreview(p => ({ ...p, open: false }))} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-auto flex-1 px-6 py-4">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold text-blue-600">مكان التحميل</th>
                    <th className="px-3 py-2 font-semibold text-green-600">مكان التنزيل</th>
                    <th className="px-3 py-2 font-semibold text-orange-600 text-center">مصروف السائق</th>
                    <th className="px-3 py-2 font-semibold text-purple-600 text-center">الإيجار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {importPreview.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className={i % 2 === 1 ? "bg-gray-50/40" : ""}>
                      <td className="px-3 py-1.5 text-gray-400 font-mono text-xs">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium text-gray-800">{r.loading_place}</td>
                      <td className="px-3 py-1.5 text-gray-600">{r.unloading_place}</td>
                      <td className="px-3 py-1.5 text-center font-mono">{r.driver_expense.toLocaleString("ar-SA")}</td>
                      <td className="px-3 py-1.5 text-center font-mono">{r.rental.toLocaleString("ar-SA")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.rows.length > 50 && (
                <p className="text-xs text-gray-400 text-center mt-3">يُعرض أول 50 سطر — سيُستورد {importPreview.rows.length} سطر عند التأكيد</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={importPreview.replaceExisting}
                  onChange={e => setImportPreview(p => ({ ...p, replaceExisting: e.target.checked }))}
                  className="w-4 h-4 rounded accent-red-500"
                />
                <span className="text-sm text-gray-700">
                  استبدل المسارات الحالية
                  <span className="text-red-500 text-xs mr-1">(حذف كل المسارات المستوردة سابقاً وإعادة الاستيراد)</span>
                </span>
              </label>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setImportPreview(p => ({ ...p, open: false }))} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">
                  إلغاء
                </button>
                <button
                  onClick={confirmTariffImport}
                  disabled={importingTariff}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
                >
                  {importingTariff ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />جاري الاستيراد...</> : `تأكيد استيراد ${importPreview.rows.length} مسار`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: جدول التعريفة ══ */}
      {activeTab === "invoice_templates" && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-violet-50/50">
            <div className="font-black text-violet-900 flex items-center gap-2"><BookOpen size={17} />سجل نماذج الفواتير</div>
            <p className="text-xs text-violet-700 mt-1">النموذج يربط شكل الفاتورة وعلامتها المميزة بالتعريفة. التعديلات تطبق على عمليات السحب القادمة فقط.</p>
          </div>
          {invoiceTemplates.length === 0 ? (
            <div className="py-14 text-center text-gray-400">
              <BookOpen size={34} className="mx-auto mb-2 text-gray-200" />
              <div>لا توجد نماذج محفوظة</div>
              <button onClick={() => setTemplateModal({ open: true, row: { name: "", sample_images: [], active: true, rules: {} } })}
                className="mt-3 text-sm font-bold text-violet-600 hover:underline">إضافة أول نموذج</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs text-gray-500">النموذج</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-500">المورد / العلامة</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-500">التعريفة المرتبطة</th>
                    <th className="px-4 py-3 text-center text-xs text-gray-500">الصور</th>
                    <th className="px-4 py-3 text-center text-xs text-gray-500">الحالة</th>
                    <th className="px-4 py-3 text-center text-xs text-gray-500">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invoiceTemplates.map(template => (
                    <tr key={template.id} className={!template.active ? "opacity-55 bg-gray-50" : "hover:bg-violet-50/30"}>
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-900">{template.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{template.description || template.cargo_type || "بدون وصف"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700">{template.supplier || "—"}</div>
                        <div className="text-xs text-violet-600">{template.marker_text || "لا توجد علامة محددة"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {template.loading_place
                          ? <span className="font-bold text-emerald-700">{template.loading_place} ← {template.unloading_place || "—"}</span>
                          : <span className="text-amber-600">مطابقة تلقائية عند السحب</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 rounded-full bg-gray-100 text-xs font-bold">{template.sample_images?.length || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${template.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                          {template.active ? "نشط" : "متوقف"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setTemplateModal({ open: true, row: { ...template } })} title="تعديل" className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"><Edit2 size={14} /></button>
                          <button onClick={() => duplicateInvoiceTemplate(template.id)} title="إنشاء نسخة" className="p-2 rounded-lg hover:bg-violet-50 text-violet-600"><Copy size={14} /></button>
                          <button onClick={() => toggleInvoiceTemplate(template)} title={template.active ? "إيقاف" : "تفعيل"} className="p-2 rounded-lg hover:bg-amber-50 text-amber-600"><Power size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "tariffs" && (<>
      {/* Summary cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <div className="text-2xl font-bold text-blue-600">{rows.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">إجمالي المسارات</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <div className="text-2xl font-bold text-green-600">{loadingPlaces.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">أماكن التحميل</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <div className="text-xl font-bold text-orange-600">{Math.min(...rows.map(r => r.driver_expense))} – {Math.max(...rows.map(r => r.driver_expense))}</div>
            <div className="text-xs text-gray-500 mt-0.5">نطاق مصروف السائق (ريال)</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <div className="text-xl font-bold text-purple-600">{Math.min(...rows.map(r => r.rental))} – {Math.max(...rows.map(r => r.rental))}</div>
            <div className="text-xs text-gray-500 mt-0.5">نطاق الإيجار (ريال)</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث في أماكن التحميل والتنزيل أو نوع السيارة..."
            className="w-full border border-gray-200 rounded-xl pr-9 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* فلتر نوع السيارة */}
        {vehicleTypeOpts.length > 0 && (
          <div className="relative">
            <Truck size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
            <select
              value={filterVehicleType}
              onChange={e => setFilterVehicleType(e.target.value)}
              className={`border rounded-xl pr-8 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer transition-colors ${
                filterVehicleType ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold" : "bg-white border-gray-200 text-gray-600"
              }`}
            >
              <option value="">كل أنواع السيارات</option>
              {vehicleTypeOpts.map(vt => (
                <option key={vt} value={vt}>{vt}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterLoading("")} className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${!filterLoading ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
            الكل ({rows.length})
          </button>
          {loadingPlaces.slice(0, 6).map(p => (
            <button key={p} onClick={() => setFilterLoading(p === filterLoading ? "" : p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${filterLoading === p ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-white text-gray-600 border-gray-200"}`}>
              {String(p).replace("*/*", " / ")}
            </button>
          ))}
        </div>
        {/* مؤشر الفلاتر النشطة */}
        {(filterVehicleType || filterLoading) && (
          <button
            onClick={() => { setFilterVehicleType(""); setFilterLoading(""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
          >
            <X size={11} />مسح الفلاتر
          </button>
        )}
      </div>

      {/* Main tariffs table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-3" />جاري التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <MapPin size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">لا توجد مسارات — ابدأ بإضافة مسار جديد أو استيراد ملف Excel</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <MapPin size={14} className="text-blue-600" />
            <span className="text-sm font-semibold text-gray-700">جدول التعريفة</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{filtered.length} مسار</span>
            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full mr-auto">
              💡 مصروف السائق يُستخدم تلقائياً كبونص عند إنشاء الرحلات
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">#</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-pink-500">
                    <Camera size={11} className="inline ml-1" />صورة
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600">
                    <MapPin size={11} className="inline ml-1" />مكان التحميل
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-green-600">
                    <MapPin size={11} className="inline ml-1" />مكان التنزيل
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-sky-700">مواقع التحميل</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-emerald-700">مواقع التنزيل</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-600">
                    <Truck size={11} className="inline ml-1" />نوع السيارة
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-rose-600">نوع الحمولة</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-teal-600">اسم العميل</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-amber-600">المورد</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-orange-600">
                    مصروف السائق (ريال)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-purple-600">الإيجار (ريال)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-cyan-600">كم لكل مسار</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-emerald-600">سعر / كم</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r, i) => {
                  const isDirty = !!editInline[r.id];
                  const get = (k: keyof Tariff) => editInline[r.id]?.[k] !== undefined ? editInline[r.id][k] : r[k];
                  return (
                    <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${isDirty ? "bg-yellow-50/40" : ""}`}>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{i + 1}</td>
                      {/* ── Image cell ── */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="file" accept="image/*" className="hidden"
                          ref={el => { imgInputRefs.current[r.id] = el; }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadTariffImage(r.id, f); e.target.value = ""; }}
                        />
                        {r.image_url ? (
                          <div className="relative inline-block group">
                            <img
                              src={r.image_url} alt="صورة المسار"
                              className="w-10 h-10 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => setLightbox(r.image_url!)}
                            />
                            <div className="absolute inset-0 flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded-lg">
                              <button onClick={() => setLightbox(r.image_url!)} className="p-0.5 bg-white/90 rounded text-gray-700 hover:text-blue-600" title="عرض"><Eye size={10} /></button>
                              <button onClick={() => imgInputRefs.current[r.id]?.click()} className="p-0.5 bg-white/90 rounded text-gray-700 hover:text-emerald-600" title="استبدال"><Camera size={10} /></button>
                              <button onClick={() => removeTariffImage(r.id)} className="p-0.5 bg-white/90 rounded text-gray-700 hover:text-red-500" title="حذف"><ImageOff size={10} /></button>
                            </div>
                          </div>
                        ) : uploadingImgId === r.id ? (
                          <div className="w-10 h-10 flex items-center justify-center mx-auto">
                            <div className="w-5 h-5 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : (
                          <button
                            onClick={() => imgInputRefs.current[r.id]?.click()}
                            className="w-10 h-10 flex items-center justify-center mx-auto rounded-lg border border-dashed border-gray-300 hover:border-pink-400 hover:bg-pink-50 text-gray-300 hover:text-pink-400 transition-colors"
                            title="رفع صورة">
                            <Camera size={14} />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={String(editInline[r.id]?.loading_place ?? r.loading_place ?? "")}
                          onChange={e => setInline(r.id, "loading_place", e.target.value)}
                          placeholder="مكان التحميل"
                          className={`w-36 px-2 py-1 text-sm font-medium border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 ${editInline[r.id]?.loading_place !== undefined ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-transparent"}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={String(editInline[r.id]?.unloading_place ?? r.unloading_place ?? "")}
                          onChange={e => setInline(r.id, "unloading_place", e.target.value)}
                          placeholder="مكان التنزيل"
                          className={`w-36 px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 ${editInline[r.id]?.unloading_place !== undefined ? "border-green-300 bg-green-50" : "border-gray-200 bg-transparent"}`}
                        />
                      </td>
                      {(["loading", "unloading"] as const).map(kind => {
                        const namedLocations = (r.locations || []).filter(location => location.kind === kind);
                        return (
                          <td key={kind} className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => openLocationManager(r.id, kind)}
                              className={`max-w-40 min-w-28 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                                kind === "loading"
                                  ? "border-sky-100 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100"
                                  : "border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
                              }`}
                              title={`إدارة مواقع ${kind === "loading" ? "التحميل" : "التنزيل"}`}
                            >
                              {namedLocations.length
                                ? `${namedLocations.slice(0, 2).map(location => location.name).join("، ")}${namedLocations.length > 2 ? ` +${namedLocations.length - 2}` : ""}`
                                : <><Plus size={11} className="inline ml-1" />إضافة موقع</>}
                              <span className="block text-[10px] opacity-70">{namedLocations.length} موقع — إدارة</span>
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3">
                        <select
                          value={String(editInline[r.id]?.vehicle_type ?? r.vehicle_type ?? "")}
                          onChange={e => setInline(r.id, "vehicle_type", e.target.value)}
                          className={`w-32 px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 ${editInline[r.id]?.vehicle_type !== undefined ? "border-indigo-300 bg-indigo-50" : "border-gray-200"}`}
                        >
                          <option value="">— بدون —</option>
                          {vehicleTypeDefs.filter(vt => vt.is_active !== 0).sort((a, b) => a.sort_order - b.sort_order).map(vt => (
                            <option key={vt.id} value={vt.name}>{vt.icon} {vt.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={String(editInline[r.id]?.cargo_type ?? r.cargo_type ?? "")}
                          onChange={e => setInline(r.id, "cargo_type", e.target.value)}
                          placeholder="مثال: أسمنت، حديد..."
                          className={`w-28 px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400 ${editInline[r.id]?.cargo_type !== undefined ? "border-rose-300 bg-rose-50" : "border-gray-200 bg-transparent"}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={String(editInline[r.id]?.customer_name ?? r.customer_name ?? "")}
                          onChange={e => setInline(r.id, "customer_name", e.target.value)}
                          placeholder="اسم العميل"
                          className={`w-32 px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 ${editInline[r.id]?.customer_name !== undefined ? "border-teal-300 bg-teal-50" : "border-gray-200 bg-transparent"}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={String(editInline[r.id]?.supplier ?? r.supplier ?? "")}
                          onChange={e => setInline(r.id, "supplier", e.target.value)}
                          placeholder="المورد"
                          className={`w-32 px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 ${editInline[r.id]?.supplier !== undefined ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-transparent"}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number" min="0" step="1"
                          value={Number(get("driver_expense"))}
                          onChange={e => setInline(r.id, "driver_expense", parseFloat(e.target.value) || 0)}
                          className={`w-24 px-2 py-1 text-sm text-center border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 ${isDirty ? "border-orange-300 bg-orange-50" : "border-gray-200"}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number" min="0" step="1"
                          value={Number(get("rental"))}
                          onChange={e => setInline(r.id, "rental", parseFloat(e.target.value) || 0)}
                          className={`w-24 px-2 py-1 text-sm text-center border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 ${isDirty ? "border-purple-300 bg-purple-50" : "border-gray-200"}`}
                        />
                      </td>
                      {/* كم لكل مسار — editable */}
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number" min="0" step="1"
                          value={editInline[r.id]?.km_per_route !== undefined
                            ? (editInline[r.id].km_per_route ?? "")
                            : (r.km_per_route ?? "")}
                          onChange={e => setInline(r.id, "km_per_route",
                            e.target.value === "" ? (null as unknown as number) : parseFloat(e.target.value) || 0)}
                          placeholder="—"
                          className={`w-20 px-2 py-1 text-sm text-center border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 ${editInline[r.id]?.km_per_route !== undefined ? "border-cyan-300 bg-cyan-50" : "border-gray-200"}`}
                        />
                      </td>
                      {/* سعر / كم — computed, read-only */}
                      {(() => {
                        const km = Number(editInline[r.id]?.km_per_route ?? r.km_per_route ?? 0);
                        const rent = Number(editInline[r.id]?.rental ?? r.rental ?? 0);
                        const pricePerKm = km > 0 ? (rent / km) : null;
                        return (
                          <td className="px-4 py-3 text-center">
                            {pricePerKm !== null ? (
                              <span className="inline-block bg-emerald-50 text-emerald-700 font-bold text-sm px-2 py-0.5 rounded-lg">
                                {pricePerKm.toFixed(2)}
                                <span className="text-[10px] font-normal text-emerald-500 mr-0.5">ر.س</span>
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })()}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          {isDirty ? (
                            <>
                              <button onClick={() => saveInline(r.id)} disabled={saving}
                                className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                                <Save size={11} />حفظ
                              </button>
                              <button onClick={() => setEditInline(e => { const n = { ...e }; delete n[r.id]; return n; })}
                                className="p-1.5 hover:bg-gray-100 rounded-lg">
                                <X size={12} className="text-gray-400" />
                              </button>
                            </>
                          ) : null}
                          <button onClick={() => duplicate(r)}
                            className="p-1.5 hover:bg-emerald-50 rounded-lg" title="استنساخ هذا المسار">
                            <Copy size={13} className="text-emerald-500" />
                          </button>
                          <button onClick={() => setModal({ open: true, row: { ...r } })}
                            className="p-1.5 hover:bg-blue-50 rounded-lg" title="تعديل كامل">
                            <Edit2 size={13} className="text-blue-400" />
                          </button>
                          <button onClick={() => openTariffTraining(r)}
                            className={`p-1.5 rounded-lg ${invoiceTemplates.some(template => Number(template.tariff_id) === r.id && template.sample_images?.length) ? "bg-violet-100 text-violet-700" : "hover:bg-violet-50 text-violet-400"}`}
                            title="إضافة صورة وتحديد حقول هذه التعريفة">
                            <Camera size={13} />
                          </button>
                          <button onClick={() => del(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                            <Trash2 size={13} className="text-red-400" />
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

      </>)}

      {/* ══ TAB: معدل السعر / كم ══ */}
      {activeTab === "km" && (
      <>{/* ── Vehicle type rates per KM ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <DollarSign size={16} className="text-green-600" />
          <h2 className="font-bold text-gray-900">معدل السعر لكل كم — حسب نوع المركبة</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{vehicleTypes.length} نوع</span>
        </div>

        <div className="px-5 py-3 bg-green-50/40 border-b border-green-100 flex items-center gap-2">
          <input
            type="text"
            placeholder="اسم نوع المركبة (مثال: سطحة)"
            value={newVt.name}
            onChange={e => setNewVt(v => ({ ...v, name: e.target.value }))}
            className="flex-1 px-3 py-2 text-sm border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            onKeyDown={e => { if (e.key === "Enter") addVtType(); }}
          />
          <input
            type="text"
            placeholder="🚛"
            value={newVt.icon}
            onChange={e => setNewVt(v => ({ ...v, icon: e.target.value }))}
            className="w-14 px-2 py-2 text-sm text-center border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
          />
          <input
            type="number" min="0" step="0.5"
            placeholder="السعر"
            value={newVt.rate_per_km}
            onChange={e => setNewVt(v => ({ ...v, rate_per_km: e.target.value }))}
            className="w-28 px-3 py-2 text-sm text-center border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">ر.س/كم</span>
          <button
            onClick={addVtType} disabled={addingVt || !newVt.name.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
            <Plus size={14} />{addingVt ? "..." : "إضافة"}
          </button>
        </div>

        {vehicleTypes.length === 0 ? (
          <div className="p-5 text-sm text-gray-400 text-center">لا توجد أنواع مركبات — أضف نوعاً جديداً أعلاه</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {vehicleTypes.map(vt => {
              const isDirty = vtRateEdits[vt.id] !== undefined;
              const val = isDirty ? vtRateEdits[vt.id] : String(vt.rate_per_km);
              return (
                <div key={vt.id} className={`flex items-center gap-3 px-5 py-3 ${isDirty ? "bg-yellow-50/50" : "hover:bg-gray-50"}`}>
                  <span className="text-lg w-7 text-center">{vt.icon}</span>
                  <span className="font-semibold text-gray-800 flex-1">{vt.name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="0" step="0.5"
                      value={val}
                      onChange={e => setVtRateEdits(ed => ({ ...ed, [vt.id]: e.target.value }))}
                      className={`w-28 px-3 py-1.5 text-sm text-center border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 ${isDirty ? "border-green-300 bg-green-50" : "border-gray-200"}`}
                    />
                    <span className="text-xs text-gray-400">ر.س/كم</span>
                    {isDirty ? (
                      <>
                        <button onClick={() => saveVtRate(vt)} disabled={savingVt === vt.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-semibold hover:bg-green-700 disabled:opacity-60">
                          <Save size={11} />{savingVt === vt.id ? "..." : "حفظ"}
                        </button>
                        <button onClick={() => setVtRateEdits(e => { const n = {...e}; delete n[vt.id]; return n; })}
                          className="p-1.5 hover:bg-gray-100 rounded-lg">
                          <X size={12} className="text-gray-400" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => deleteVtType(vt.id, vt.name)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      </>)}

      {/* ══ TAB: بونص السائق ══ */}
      {activeTab === "bonus" && (
      <>{/* ── Trip State Bonus Rates ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-purple-600" />
            <h2 className="font-bold text-gray-900">بونص السائق — معدل كم حسب نوع السيارة</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{bonusRates.length} أنواع</span>
          </div>
        </div>

        <div className="px-5 py-3 bg-purple-50/40 border-b border-purple-100 flex items-center gap-2">
          <input
            type="text"
            placeholder="اسم نوع السيارة (مثل: شاحنة ثقيلة)"
            value={newBonus.state}
            onChange={e => setNewBonus(b => ({ ...b, state: e.target.value }))}
            className="flex-1 px-3 py-2 text-sm border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
            onKeyDown={e => { if (e.key === "Enter") addBonusRate(); }}
          />
          <input
            type="number" min="0" step="0.5"
            placeholder="المعدل"
            value={newBonus.rate_per_km}
            onChange={e => setNewBonus(b => ({ ...b, rate_per_km: e.target.value }))}
            className="w-24 px-3 py-2 text-sm text-center border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">ر.س/كم</span>
          <button
            onClick={addBonusRate} disabled={addingBonus || !newBonus.state.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap">
            <Plus size={14} />{addingBonus ? "..." : "إضافة"}
          </button>
        </div>

        {bonusRates.length === 0 ? (
          <div className="p-5 text-sm text-gray-400 text-center">لا توجد أنواع — أضف نوعاً جديداً أعلاه</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {bonusRates.map(br => {
              const isDirty = bonusEdits[br.state] !== undefined;
              const val = isDirty ? bonusEdits[br.state] : String(br.rate_per_km);
              return (
                <div key={br.state} className={`flex items-center gap-3 px-5 py-3 ${isDirty ? "bg-purple-50/50" : "hover:bg-gray-50"}`}>
                  <span className="text-lg w-7 text-center">{TRIP_STATE_ICONS[br.state] || "🚗"}</span>
                  <span className="font-semibold text-gray-800 flex-1">{br.state}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="0" step="0.5"
                      value={val}
                      onChange={e => setBonusEdits(ed => ({ ...ed, [br.state]: e.target.value }))}
                      className={`w-28 px-3 py-1.5 text-sm text-center border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 ${isDirty ? "border-purple-300 bg-purple-50" : "border-gray-200"}`}
                    />
                    <span className="text-xs text-gray-400">ر.س/كم</span>
                    {isDirty && (
                      <button onClick={() => saveBonusRate(br.state)} disabled={savingBonus === br.state}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-xl text-xs font-semibold hover:bg-purple-700 disabled:opacity-60">
                        <Save size={11} />{savingBonus === br.state ? "..." : "حفظ"}
                      </button>
                    )}
                    {isDirty && (
                      <button onClick={() => setBonusEdits(e => { const n = { ...e }; delete n[br.state]; return n; })}
                        className="p-1.5 hover:bg-gray-100 rounded-lg">
                        <X size={12} className="text-gray-400" />
                      </button>
                    )}
                    <button onClick={() => deleteBonusRate(br.state)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="px-5 py-3 bg-purple-50/40 border-t border-purple-100">
          <p className="text-xs text-purple-600">
            💡 صافي البونص = (مجموع كم × معدل الحالة) − إجمالي سحوبات الديزل — يظهر تلقائياً في لوحة السائق
          </p>
        </div>
      </div>

      </>)}

      {/* ══ TAB: مضاعفات المسارات ══ */}
      {activeTab === "multipliers" && (
      <>{/* ── Flatbed route multipliers ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route size={16} className="text-orange-500" />
            <h2 className="font-bold text-gray-900">مضاعفات المسارات للسطحة</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">القاعدة الافتراضية = ×2</span>
          </div>
          <button onClick={() => setFbModal({ open: true, row: { ...FB_EMPTY } })}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors">
            <Plus size={14} />إضافة قاعدة
          </button>
        </div>
        {fbRules.length === 0 ? (
          <div className="p-5 text-sm text-gray-400 text-center">لا توجد قواعد مخصصة — الافتراضي ×2 لجميع المسارات</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600">مدينة الانطلاق</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-green-600">مدينة الوجهة</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-orange-600">المضاعف</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fbRules.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{r.origin_city}</td>
                    <td className="px-4 py-3 text-gray-600">{r.dest_city}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-black text-base px-3 py-1 rounded-xl ${r.multiplier === 1 ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                        ×{r.multiplier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => setFbModal({ open: true, row: { ...r } })}
                          className="p-1.5 hover:bg-blue-50 rounded-lg" title="تعديل">
                          <Edit2 size={13} className="text-blue-500" />
                        </button>
                        <button onClick={() => deleteFb(r.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg" title="حذف">
                          <Trash2 size={13} className="text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </>)}

      {/* ── Flatbed rule modal ── */}
      {fbModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setFbModal({ open: false, row: {} })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <Route size={18} className="text-orange-500" />
                {fbModal.row.id ? "تعديل قاعدة مسار" : "إضافة قاعدة مسار"}
              </h2>
              <button onClick={() => setFbModal({ open: false, row: {} })} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-blue-600 block mb-1">مدينة الانطلاق *</label>
                <input type="text" placeholder="مثال: القصيم"
                  value={fbModal.row.origin_city || ""}
                  onChange={e => setFbModal(m => ({ ...m, row: { ...m.row, origin_city: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-green-600 block mb-1">مدينة الوجهة *</label>
                <input type="text" placeholder="مثال: المدينة"
                  value={fbModal.row.dest_city || ""}
                  onChange={e => setFbModal(m => ({ ...m, row: { ...m.row, dest_city: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-orange-600 block mb-1">المضاعف *</label>
                <div className="flex gap-2">
                  {[1, 1.5, 2, 2.5, 3].map(m => (
                    <button key={m} type="button"
                      onClick={() => setFbModal(fm => ({ ...fm, row: { ...fm.row, multiplier: m } }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${fbModal.row.multiplier === m ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"}`}>
                      ×{m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">ملاحظات</label>
                <input type="text" placeholder="اختياري"
                  value={fbModal.row.notes || ""}
                  onChange={e => setFbModal(m => ({ ...m, row: { ...m.row, notes: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setFbModal({ open: false, row: {} })} className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600">إلغاء</button>
              <button onClick={saveFb} disabled={savingFb || !fbModal.row.origin_city || !fbModal.row.dest_city}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
                {savingFb ? "جاري الحفظ..." : "حفظ القاعدة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: التحاليل ══ */}
      {activeTab === "analysis" && (
      <>{/* ── From Trips Analysis Section ── */}
      {loadingTrips ? (
        <div className="flex items-center justify-center py-20 text-amber-600">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin ml-3" />
          جاري تحليل الرحلات...
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-200 flex items-center gap-3 flex-wrap">
            <Activity size={16} className="text-amber-600" />
            <span className="font-bold text-amber-900">تحليل الرحلات — مسارات مقترحة للتعريفة</span>
            <span className="bg-amber-200 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">{tripGroups.length} مسار</span>
            <div className="mr-auto flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-400" />
                <input value={tripSearch} onChange={e => setTripSearch(e.target.value)}
                  placeholder="بحث باسم العميل أو الوجهة..."
                  className="pr-8 pl-3 py-1.5 text-xs border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white w-52" />
              </div>
            </div>
          </div>
          {tripGroups.length === 0 ? (
            <div className="p-8 text-center text-sm text-amber-600">لا توجد رحلات مسجلة بوجهات محددة</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-100/60">
                  <tr>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-amber-700">اسم العميل</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-amber-700">نوع الحمولة</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-amber-700">مكان التنزيل</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-amber-700">رحلات</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-blue-700">متوسط السعر</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-purple-700">مصروف السائق شامل الديزل</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-amber-700">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {tripGroups
                    .filter(g => {
                      const q = tripSearch.toLowerCase();
                      return !q || g.client_name.toLowerCase().includes(q) || g.destination.toLowerCase().includes(q) || (g.material_type||"").toLowerCase().includes(q);
                    })
                    .map((g, i) => (
                    <tr key={i} className="hover:bg-amber-50/60 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{g.client_name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{g.material_type || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-gray-700">{g.destination}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{g.trip_count}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-blue-700 font-semibold">
                        {g.avg_price ? Math.round(g.avg_price).toLocaleString("ar-SA") : <span className="text-gray-300">—</span>}
                        {g.min_price !== g.max_price && g.max_price > 0 && (
                          <span className="text-xs text-gray-400 block">{Math.round(g.min_price)}–{Math.round(g.max_price)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {g.avg_driver_total > 0 ? (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            <span className="font-black text-purple-700 font-mono text-base">{Math.round(g.avg_driver_total).toLocaleString("ar-SA")}</span>
                            {g.avg_bonus > 0 && g.avg_diesel > 0 && (
                              <span className="text-xs text-gray-400">بونص {Math.round(g.avg_bonus)} + ديزل {Math.round(g.avg_diesel)}</span>
                            )}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => setModal({ open: true, row: {
                            ...EMPTY,
                            customer_name: g.client_name,
                            cargo_type: g.material_type || "",
                            unloading_place: g.destination,
                            rental: Math.round(g.avg_price) || 0,
                          }})}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 mx-auto">
                          <Plus size={11} />إضافة تعريفة
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </>)}

      {/* ── Image Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox} alt="صورة المسار"
              className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain"
            />
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-3 left-3 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
            >
              <X size={18} />
            </button>
            <a
              href={lightbox} target="_blank" rel="noopener noreferrer"
              className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
              title="فتح في تبويب جديد"
            >
              <Eye size={18} />
            </a>
          </div>
        </div>
      )}

      {templateModal.open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setTemplateModal({ open: false, row: {} })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-black text-lg text-gray-900">تعليم صورة التعريفة</h2>
                <p className="text-xs text-gray-500 mt-1">الصورة والتحديدات مرتبطة بهذه التعريفة فقط ولا تؤثر على الرحلات القديمة.</p>
              </div>
              <button onClick={() => setTemplateModal({ open: false, row: {} })} className="p-2 rounded-xl hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">اسم النموذج *</label>
                  <input value={templateModal.row.name || ""} onChange={event => setTemplateModal(current => ({ ...current, row: { ...current.row, name: event.target.value } }))}
                    placeholder="مثال: فاتورة أسمنت المدينة" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">المورد</label>
                  <input value={templateModal.row.supplier || ""} onChange={event => setTemplateModal(current => ({ ...current, row: { ...current.row, supplier: event.target.value } }))}
                    placeholder="أسمنت المدينة، أوبال..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">نوع الحمولة</label>
                  <input value={templateModal.row.cargo_type || ""} onChange={event => setTemplateModal(current => ({ ...current, row: { ...current.row, cargo_type: event.target.value } }))}
                    placeholder="أسمنت سائب / أكياس" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">الختم / التوقيع / العلامة</label>
                  <input value={templateModal.row.marker_text || ""} onChange={event => setTemplateModal(current => ({ ...current, row: { ...current.row, marker_text: event.target.value } }))}
                    placeholder="نص الختم أو وصف العلامة" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">التعريفة المرتبطة</label>
                  <div className="w-full border border-violet-200 rounded-xl px-3 py-2.5 text-sm bg-violet-50 font-black text-violet-800">
                    {(() => {
                      const tariff = rows.find(row => row.id === Number(templateModal.row.tariff_id));
                      return tariff ? `${tariff.loading_place} ← ${tariff.unloading_place}${tariff.cargo_type ? ` — ${tariff.cargo_type}` : ""}` : "تعريفة غير متاحة";
                    })()}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">قاعدة الوزن والكمية</label>
                  <input value={templateModal.row.rules?.weight_rule || ""} onChange={event => setTemplateModal(current => ({ ...current, row: { ...current.row, rules: { ...(current.row.rules || {}), weight_rule: event.target.value } } }))}
                    placeholder="استخدم الوزن الصافي بالكجم" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">أماكن الحقول</label>
                  <input value={templateModal.row.rules?.field_notes || ""} onChange={event => setTemplateModal(current => ({ ...current, row: { ...current.row, rules: { ...(current.row.rules || {}), field_notes: event.target.value } } }))}
                    placeholder="رقم المستند أعلى اليمين..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">وصف النموذج</label>
                  <textarea rows={2} value={templateModal.row.description || ""} onChange={event => setTemplateModal(current => ({ ...current, row: { ...current.row, description: event.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-bold text-gray-800">صور تعليم النموذج</div>
                    <div className="text-[11px] text-gray-500">مرجع بصري للعمليات القادمة ولا يغير الرحلات القديمة.</div>
                  </div>
                  <label className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 text-violet-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-violet-100">
                    <Camera size={14} />{uploadingTemplateImage ? "جاري الرفع..." : "إضافة صورة"}
                    <input type="file" accept="image/*" disabled={uploadingTemplateImage} className="hidden" onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) uploadTemplateSample(file);
                      event.target.value = "";
                    }} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-3">
                  {(templateModal.row.sample_images || []).map((path, index) => (
                    <div key={`${path}-${index}`} className="relative group">
                      <button type="button" onClick={() => setAnnotationImageIndex(index)}
                        className={`rounded-xl border-2 ${annotationImageIndex === index ? "border-violet-500" : "border-transparent"}`}>
                        <img src={`/api/storage${path}`} alt="صورة نموذج" className="w-24 h-20 rounded-lg object-cover border" />
                      </button>
                      <button onClick={() => setTemplateModal(current => {
                        const images = (current.row.sample_images || []).filter((_, i) => i !== index);
                        const regions = (current.row.rules?.regions || [])
                          .filter(region => region.image_index !== index)
                          .map(region => region.image_index > index ? { ...region, image_index: region.image_index - 1 } : region);
                        setAnnotationImageIndex(0);
                        return { ...current, row: { ...current.row, sample_images: images, rules: { ...(current.row.rules || {}), regions } } };
                      })}
                        className="absolute -top-2 -left-2 w-6 h-6 bg-red-600 text-white rounded-full hidden group-hover:flex items-center justify-center"><X size={12} /></button>
                    </div>
                  ))}
                  {!templateModal.row.sample_images?.length && <div className="text-xs text-gray-400 py-5">لم تُرفع صورة مرجعية بعد</div>}
                </div>

                {(templateModal.row.sample_images || [])[annotationImageIndex] && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end mb-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">هذا الجزء يمثل أي عمود في الرحلة؟</label>
                        <select value={selectedTemplateField} onChange={event => setSelectedTemplateField(event.target.value as typeof selectedTemplateField)}
                          className="w-full border border-violet-200 bg-violet-50 rounded-xl px-3 py-2.5 text-sm font-bold text-violet-800">
                          {TRIP_FIELD_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                        </select>
                      </div>
                      <div className="text-[11px] text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                        اسحب بالماوس مستطيلاً حول قيمة الحقل
                      </div>
                    </div>

                    <div ref={annotationRef}
                      className="relative select-none overflow-hidden rounded-xl border-2 border-violet-200 bg-gray-100 cursor-crosshair touch-none"
                      onPointerDown={event => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const point = annotationPoint(event.clientX, event.clientY);
                        if (point) setDrawingRegion({ x: point.x, y: point.y, currentX: point.x, currentY: point.y });
                      }}
                      onPointerMove={event => {
                        if (!drawingRegion) return;
                        const point = annotationPoint(event.clientX, event.clientY);
                        if (point) setDrawingRegion(current => current ? { ...current, currentX: point.x, currentY: point.y } : null);
                      }}
                      onPointerUp={finishRegion}>
                      <img src={`/api/storage${(templateModal.row.sample_images || [])[annotationImageIndex]}`} alt="تحديد حقول نموذج الفاتورة"
                        className="block w-full h-auto pointer-events-none" draggable={false} />
                      {(templateModal.row.rules?.regions || [])
                        .filter(region => region.image_index === annotationImageIndex)
                        .map(region => (
                          <button key={region.key} type="button" title="اضغط لحذف التحديد"
                            onClick={event => {
                              event.stopPropagation();
                              setTemplateModal(current => ({
                                ...current,
                                row: { ...current.row, rules: { ...(current.row.rules || {}), regions: (current.row.rules?.regions || []).filter(item => item !== region) } },
                              }));
                            }}
                            className="absolute border-2 border-emerald-500 bg-emerald-400/20 hover:bg-red-400/25 hover:border-red-500"
                            style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}>
                            <span className="absolute -top-6 right-0 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap">{region.label}</span>
                          </button>
                        ))}
                      {drawingRegion && (
                        <div className="absolute border-2 border-violet-600 bg-violet-400/20 pointer-events-none"
                          style={{
                            left: `${Math.min(drawingRegion.x, drawingRegion.currentX)}%`,
                            top: `${Math.min(drawingRegion.y, drawingRegion.currentY)}%`,
                            width: `${Math.abs(drawingRegion.currentX - drawingRegion.x)}%`,
                            height: `${Math.abs(drawingRegion.currentY - drawingRegion.y)}%`,
                          }} />
                      )}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500">
                      التحديدات المحفوظة: {(templateModal.row.rules?.regions || []).filter(region => region.image_index === annotationImageIndex).length}
                      {" — "}اضغط على أي تحديد لحذفه وإعادة رسمه.
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={saveInvoiceTemplate} disabled={savingTemplate || !templateModal.row.name?.trim()}
                  className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white py-2.5 rounded-xl font-bold disabled:opacity-50">
                  <Save size={15} />{savingTemplate ? "جاري الحفظ..." : "حفظ النموذج"}
                </button>
                <button onClick={() => setTemplateModal({ open: false, row: {} })} className="px-6 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-bold text-gray-700">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Named loading/unloading location manager */}
      {locationManager && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => !locationBusy && setLocationManager(null)}>
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()} dir="rtl">
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="font-bold text-gray-900">
                  إدارة مواقع {locationManager.kind === "loading" ? "التحميل" : "التنزيل"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {managedTariff ? `${managedTariff.loading_place} ← ${managedTariff.unloading_place}` : `التعريفة #${locationManager.tariffId}`}
                  {" — "}الروابط المسماة المتاحة لهذا المسار
                </p>
              </div>
              <button type="button" disabled={locationBusy} onClick={() => setLocationManager(null)} className="rounded-xl p-2 hover:bg-gray-100 disabled:opacity-50" aria-label="إغلاق">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">المواقع الحالية ({managedLocations.length})</h3>
              {managedLocations.length ? (
                <ul className="space-y-2">
                  {managedLocations.map(location => (
                    <li key={location.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                      <MapPin size={16} className={locationManager.kind === "loading" ? "shrink-0 text-sky-600" : "shrink-0 text-emerald-600"} />
                      <div className="min-w-0 flex-1">
                        <a href={location.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-blue-700 hover:underline">
                          {location.name}
                        </a>
                        <span className="block truncate text-xs text-gray-500" dir="ltr">{location.url}</span>
                      </div>
                      <button
                        type="button"
                        disabled={locationBusy}
                        onClick={() => {
                          setEditingLocationId(location.id);
                          setLocationForm({ name: location.name, url: location.url });
                          setLocationError("");
                        }}
                        className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                        title="تعديل"
                      ><Edit2 size={14} /></button>
                      <button
                        type="button"
                        disabled={locationBusy}
                        onClick={() => deleteTariffLocation(location.id)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50"
                        title="حذف"
                      ><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-500">
                  لا توجد مواقع مسماة لهذا النوع حتى الآن.
                </div>
              )}

              <form onSubmit={saveTariffLocation} className="mt-5 space-y-3 rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">{editingLocationId ? "تعديل الموقع" : "إضافة موقع مسمى"}</h3>
                  {editingLocationId !== null && (
                    <button type="button" disabled={locationBusy} onClick={() => { setEditingLocationId(null); setLocationForm({ name: "", url: "" }); setLocationError(""); }}
                      className="text-xs text-gray-500 hover:text-gray-800">إلغاء التعديل</button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-600">
                    اسم الموقع
                    <input
                      type="text"
                      value={locationForm.name}
                      onChange={event => setLocationForm(form => ({ ...form, name: event.target.value }))}
                      placeholder="مثال: بوابة المصنع"
                      maxLength={200}
                      required
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-600">
                    رابط الموقع (HTTP أو HTTPS)
                    <input
                      type="url"
                      value={locationForm.url}
                      onChange={event => setLocationForm(form => ({ ...form, url: event.target.value }))}
                      placeholder="https://maps.google.com/..."
                      required
                      dir="ltr"
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </label>
                </div>
                {locationError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{locationError}</p>}
                <button type="submit" disabled={locationBusy || !locationForm.name.trim() || !locationForm.url.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {locationBusy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />جاري الحفظ...</> :
                    <><Save size={14} />{editingLocationId ? "حفظ التعديلات" : "إضافة الموقع"}</>}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto" onClick={() => setModal({ open: false, row: {} })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 text-lg">
                {modal.row.id ? `تعديل تعريفة #${modal.row.id}` : "إضافة تعريفة جديدة"}
              </h2>
              <button onClick={() => setModal({ open: false, row: {} })} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {/* Row 1: loading + unloading */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-blue-600 block mb-1">مكان التحميل *</label>
                  <input type="text" value={modal.row.loading_place || ""}
                    onChange={e => setModal(m => ({ ...m, row: { ...m.row, loading_place: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-green-600 block mb-1">مكان التنزيل *</label>
                  <input type="text" value={modal.row.unloading_place || ""}
                    onChange={e => setModal(m => ({ ...m, row: { ...m.row, unloading_place: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              {/* Row 2: supplier + customer */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">المورد</label>
                  <input type="text" value={modal.row.supplier || ""}
                    onChange={e => setModal(m => ({ ...m, row: { ...m.row, supplier: e.target.value } }))}
                    placeholder="اسم المورد / المصنع"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">اسم العميل</label>
                  <input type="text" value={modal.row.customer_name || ""}
                    onChange={e => setModal(m => ({ ...m, row: { ...m.row, customer_name: e.target.value } }))}
                    placeholder="اسم العميل / الجهة"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
                </div>
              </div>
              {/* Row 3: cargo_type + loaded_meters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">نوع الحمولة</label>
                  <input type="text" value={modal.row.cargo_type || ""}
                    onChange={e => setModal(m => ({ ...m, row: { ...m.row, cargo_type: e.target.value } }))}
                    placeholder="مثال: أسمنت، رمل، حديد..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">عدد الأمتار المحملة</label>
                  <input type="number" min="0" step="0.5"
                    value={modal.row.loaded_meters ?? ""}
                    onChange={e => setModal(m => ({ ...m, row: { ...m.row, loaded_meters: parseFloat(e.target.value) || null } }))}
                    placeholder="مثال: 12.5"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
                </div>
              </div>
              {/* Row 4: rental + driver_expense */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-purple-600 block mb-1">سعر الرد بدون ضريبة (الإيجار)</label>
                  <input type="number" min="0" step="1"
                    value={modal.row.rental ?? 0}
                    onChange={e => setModal(m => ({ ...m, row: { ...m.row, rental: parseFloat(e.target.value) || 0 } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-orange-600 block mb-1">مصروف السائق (بونص)</label>
                  <input type="number" min="0" step="1"
                    value={modal.row.driver_expense ?? 0}
                    onChange={e => setModal(m => ({ ...m, row: { ...m.row, driver_expense: parseFloat(e.target.value) || 0 } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              {/* Row 5: vehicle_type */}
              <div>
                <label className="text-xs font-semibold text-indigo-600 block mb-1 flex items-center gap-1">
                  <Truck size={12} /> نوع السيارة
                </label>
                <select
                  value={modal.row.vehicle_type || ""}
                  onChange={e => setModal(m => ({ ...m, row: { ...m.row, vehicle_type: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— بدون تحديد —</option>
                  {vehicleTypeDefs.filter(vt => vt.is_active !== 0).sort((a, b) => a.sort_order - b.sort_order).map(vt => (
                    <option key={vt.id} value={vt.name}>{vt.icon} {vt.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal({ open: false, row: {} })} className="flex-1 py-2.5 border rounded-xl text-sm">إلغاء</button>
              <button onClick={saveModal} disabled={saving || !modal.row.loading_place || !modal.row.unloading_place}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {saving ? "جاري الحفظ..." : modal.row.id ? "حفظ التعديل" : "إضافة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
