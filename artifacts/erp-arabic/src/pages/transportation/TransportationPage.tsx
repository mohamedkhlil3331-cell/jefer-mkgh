import { useState, useEffect, useRef } from "react";
import FleetManagePage from "@/pages/admin/FleetManagePage";
import { Truck, BarChart3, X, ChevronRight, RefreshCw, Layers, Shield, Wrench, FileText, Bell, Package, Trash2, Save, Upload, Eye, DollarSign, Users, Plus, Phone, UserCheck } from "lucide-react";
import { useRememberedState } from "@/hooks/useRememberedState";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PurchaseInvoice {
  id: number; serial_no?: string; invoice_date?: string; branch?: string;
  vehicle_plate?: string; invoice_number?: string; supplier_name?: string;
  item_name: string; price_before_vat: number; quantity: number;
  price_after_vat: number; notes?: string;
}
type VehicleImage = { id: number; plate_number: string; angle: string; image_url: string; created_at: string };
interface FleetVehicle {
  id: number; plate_number: string; vehicle_name?: string; vehicle_type?: string;
  entity?: string; status?: string; driver_name?: string; notes?: string;
  max_weight_kg?: number; empty_weight_kg?: number; gps_device_id?: string;
  linked_teidara_id?: number; linked_teidara_ids?: string;
  linked_teidara?: { id: number; teidara_number?: string; category: string; seq_no: number } | null;
  linked_teidarat?: Teidara[];
  vehicle_images?: VehicleImage[];
  compliance?: Record<string, ComplianceDoc>;
  types?: VehicleTypeAssignment[];
  order_label?: string; supply_label?: string; rep_label?: string;
}
type ComplianceDoc = { id: number; car_number: string; doc_type: string; start_date?: string; end_date?: string; image_url?: string; notes?: string; created_at: string };
type DocFormState  = { file: File | null; start_date: string; end_date: string; notes: string; uploading: boolean };
type DocStatus     = "missing" | "uploaded" | "valid" | "expiring" | "expired";
type VehicleTypeDef = { id: number; name: string; icon: string; is_active: number };
type FleetNotif    = { id: number; title: string; body: string; read: number; created_at: string };
type DriverProfile = { id: number; driver_name: string; phone?: string; vehicle_plate?: string };
type VehicleTypeAssignment = { type_name: string; is_primary: number };
interface Teidara {
  id: number; category: string; seq_no: number;
  vehicle_plate?: string; notes?: string;
  teidara_number?: string; teidara_type?: string;
  length_m?: number; width_m?: number; height_m?: number;
  capacity?: number; weight_kg?: number; image_url?: string;
  vehicle_type?: string; vehicle_status?: string; driver_name?: string;
}

type FleetExpense  = { id: number; date: string; car_id?: string; expense_category: string; description?: string; amount: number; document_number?: string; created_at: string };
type TransEmployee = { id: number; name: string; job_title?: string; phone?: string; email?: string; salary?: number; status?: string; entity?: string; hire_date?: string; nationality?: string; department?: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
const sar  = (v: number) => (v || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
const num  = (v: number) => (v || 0).toLocaleString("ar-SA");
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("ar-SA") : "—";

const STATUS_LABEL: Record<string, string> = {
  available: "متاحة", busy: "مشغولة", maintenance: "صيانة", out_of_service: "خارج الخدمة",
  active: "نشط", inactive: "غير نشط", on_leave: "إجازة",
};
const STATUS_COLOR: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-700",
  busy:      "bg-amber-100 text-amber-700",
  maintenance:"bg-red-100 text-red-700",
  out_of_service: "bg-gray-100 text-gray-500",
  active:    "bg-emerald-100 text-emerald-700",
  inactive:  "bg-gray-100 text-gray-500",
  on_leave:  "bg-blue-100 text-blue-700",
};

const TABS = [
  { key: "dashboard",     label: "لوحة التحكم",        icon: BarChart3    },
  { key: "fleet_manage",  label: "سيارات الشركة كاملة", icon: Shield       },
  { key: "teidarat",      label: "التيدارات",          icon: Layers       },
  { key: "gen_expenses",  label: "المصروفات العمومية", icon: DollarSign   },
  { key: "emp_transport", label: "الموظفون",           icon: Users        },
];

// ── Fleet Manage constants ─────────────────────────────────────────────────────
const FM_DOC_TYPES = [
  { key: "insurance",      label: "التأمين",       icon: Shield   },
  { key: "inspection",     label: "الفحص الدوري",  icon: Wrench   },
  { key: "operation_card", label: "كرت التشغيل",   icon: FileText },
];
const FM_VEH_TYPES      = ["سطحة","بلكر","ونش","دين","شاحنة","بيك أب","أخرى"];
const FM_ENTITY_OPTIONS = ["مصنع سمنت مكس","النقليات","الاسمنت","مصنع روعة جيفر","سيارة إيجار خارجي"];
const FM_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  available:   { label: "متاح",       cls: "bg-green-100 text-green-700"   },
  on_trip:     { label: "في رحلة",    cls: "bg-blue-100 text-blue-700"     },
  maintenance: { label: "في الصيانة", cls: "bg-yellow-100 text-yellow-700" },
  inactive:    { label: "متوقف",      cls: "bg-gray-100 text-gray-500"     },
};
const EMPTY_DOC_FORM: DocFormState = { file: null, start_date: "", end_date: "", notes: "", uploading: false };
const FM_DOC_STATUS_CFG: Record<DocStatus, { label: string; dot: string; badge: string; card: string; border: string }> = {
  missing:  { label: "غير موجودة",   dot: "bg-gray-300",   badge: "bg-gray-100 text-gray-500",     card: "bg-gray-50",      border: "border-gray-200"   },
  uploaded: { label: "موجودة",       dot: "bg-blue-400",   badge: "bg-blue-100 text-blue-600",     card: "bg-blue-50/30",   border: "border-blue-100"   },
  valid:    { label: "سارية",        dot: "bg-green-500",  badge: "bg-green-100 text-green-700",   card: "bg-green-50/30",  border: "border-green-200"  },
  expiring: { label: "تنتهي قريباً", dot: "bg-orange-400", badge: "bg-orange-100 text-orange-700", card: "bg-orange-50/40", border: "border-orange-200" },
  expired:  { label: "منتهية ⚠️",   dot: "bg-red-500",    badge: "bg-red-100 text-red-600",       card: "bg-red-50/40",    border: "border-red-200"    },
};
function fmGetDocStatus(doc?: ComplianceDoc): DocStatus {
  if (!doc) return "missing";
  if (!doc.end_date) return doc.image_url || doc.start_date ? "uploaded" : "missing";
  const d = Math.floor((new Date(doc.end_date).getTime() - Date.now()) / 86400000);
  if (d < 0) return "expired";
  if (d < 30) return "expiring";
  return "valid";
}

interface VehicleGroup {
  label: string;
  category: string;
  colorFrom: string;
  colorTo: string;
  textColor: string;
  badgeColor: string;
  headerBg: string;
  icon: string;
}
const TEIDARAT_GROUPS: VehicleGroup[] = [
  { label: "القلابات",  category: "قلابات",  colorFrom: "from-orange-50",  colorTo: "to-orange-100/60",  textColor: "text-orange-800",  badgeColor: "bg-orange-500",  headerBg: "bg-orange-50",  icon: "🚛" },
  { label: "البلاكر",   category: "بلاكر",   colorFrom: "from-blue-50",    colorTo: "to-blue-100/60",    textColor: "text-blue-800",    badgeColor: "bg-blue-500",    headerBg: "bg-blue-50",    icon: "🔵" },
  { label: "السطحات",  category: "سطحات",  colorFrom: "from-emerald-50", colorTo: "to-emerald-100/60", textColor: "text-emerald-800", badgeColor: "bg-emerald-500", headerBg: "bg-emerald-50", icon: "🚚" },
];
const TEIDARA_TYPE_CATEGORY: Record<string, string> = {
  "قلاب":  "قلابات",
  "سطحة":  "سطحات",
  "بلكر":  "بلاكر",
};
const TEIDARA_LINK_TYPES = Object.keys(TEIDARA_TYPE_CATEGORY);


// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TransportationPage() {
  const [tab, setTab]             = useRememberedState("transportation-tab", "dashboard");
  const [loading, setLoading]     = useState(false);
  const [selectedPlate, setSelectedPlate] = useState("");

  // data
  const [invoices,  setInvoices]  = useState<PurchaseInvoice[]>([]);
  const [vehicles,  setVehicles]  = useState<FleetVehicle[]>([]);

  // ── Fleet Manage state ──────────────────────────────────────────────────────
  const [fmVehicles,        setFmVehicles]        = useState<FleetVehicle[]>([]);
  const [fmLoading,         setFmLoading]         = useState(false);
  const [fmDrivers,         setFmDrivers]         = useState<DriverProfile[]>([]);
  const [fmSearch,          setFmSearch]          = useRememberedState("transportation-fleet-search", "");
  const [fmSelected,        setFmSelected]        = useState<FleetVehicle | null>(null);
  const [fmDetailTab,       setFmDetailTab]       = useState<"info"|"docs"|"photos">("info");
  const [fmEditForm,        setFmEditForm]        = useState<Record<string,string>>({});
  const [fmSaving,          setFmSaving]          = useState(false);
  const [fmVehicleDocs,     setFmVehicleDocs]     = useState<ComplianceDoc[]>([]);
  const [fmDocForms,        setFmDocForms]        = useState<Record<string,DocFormState>>({});
  const [fmNewDoc,          setFmNewDoc]          = useState<DocFormState & { doc_type: string }>({ ...EMPTY_DOC_FORM, doc_type: "" });
  const [fmAddOpen,         setFmAddOpen]         = useState(false);
  const [fmAddForm,         setFmAddForm]         = useState<Record<string,string>>({ status: "available" });
  const [fmAddSaving,       setFmAddSaving]       = useState(false);
  const [vehicleTypes,      setVehicleTypes]      = useState<VehicleTypeDef[]>([]);
  const [fmTypeFilter,      setFmTypeFilter]      = useRememberedState("transportation-fleet-type-filter", "all");
  const [fmNotifs,          setFmNotifs]          = useState<FleetNotif[]>([]);
  const [fmEditTypes,       setFmEditTypes]       = useState<string[]>([]);
  const [fmEditPrimaryType, setFmEditPrimaryType] = useState("");
  const fmFileRefs    = useRef<Record<string, HTMLInputElement | null>>({});
  const fmNewDocFileRef = useRef<HTMLInputElement | null>(null);
  const vImgFileRef   = useRef<HTMLInputElement | null>(null);
  const [fmEditLinkedTeidaraIds, setFmEditLinkedTeidaraIds] = useState<string[]>([]);
  const [fmAddLinkedTeidaraIds,  setFmAddLinkedTeidaraIds]  = useState<string[]>([]);
  const [fmVehicleImages,        setFmVehicleImages]        = useState<VehicleImage[]>([]);
  const [vImgUploading,          setVImgUploading]          = useState(false);
  const [vImgAngle,              setVImgAngle]              = useState("front");
  const [tImgUploading,          setTImgUploading]          = useState<Record<number,boolean>>({});

  // ── Tab 4: المصروفات العمومية ────────────────────────────────────────────────
  const [genExpenses,  setGenExpenses]  = useState<FleetExpense[]>([]);
  const [genLoading,   setGenLoading]   = useState(false);
  const [genExpSaving, setGenExpSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [genExpForm,   setGenExpForm]   = useState({ date: today, car_id: "", expense_category: "", description: "", amount: "", document_number: "" });
  const [genEditItem,  setGenEditItem]  = useState<FleetExpense | null>(null);
  const [genEditForm,  setGenEditForm]  = useState({ date: "", car_id: "", expense_category: "", description: "", amount: "", document_number: "" });
  const [genEditSaving,setGenEditSaving]= useState(false);

  // ── Tab 5: الموظفون ──────────────────────────────────────────────────────────
  const [transEmp,    setTransEmp]    = useState<TransEmployee[]>([]);
  const [empLoading,  setEmpLoading]  = useState(false);
  const [empAddOpen,  setEmpAddOpen]  = useState(false);
  const [empForm,     setEmpForm]     = useState<Record<string, string>>({ entity: "النقليات", status: "active" });
  const [empSaving,   setEmpSaving]   = useState(false);
  const [empEditItem, setEmpEditItem] = useState<TransEmployee | null>(null);
  const [empEditForm, setEmpEditForm] = useState<Record<string, string>>({});
  const [empEditSaving, setEmpEditSaving] = useState(false);
  const [empDeleteId, setEmpDeleteId] = useState<number | null>(null);

  // teidarat state
  const [teidarat,       setTeidarat]       = useState<Teidara[]>([]);
  const [tLoading,       setTLoading]       = useState(false);
  const [tModal,         setTModal]         = useState<{ category: string; item?: Teidara } | null>(null);
  const [tNotes,         setTNotes]         = useState("");
  const [tNumber,        setTNumber]        = useState("");
  const [tType,          setTType]          = useState("");
  const [tLength,        setTLength]        = useState("");
  const [tWidth,         setTWidth]         = useState("");
  const [tHeight,        setTHeight]        = useState("");
  const [tCapacity,      setTCapacity]      = useState("");
  const [tWeight,        setTWeight]        = useState("");
  const [tSaving,        setTSaving]        = useState(false);
  const [tDeleteConfirm, setTDeleteConfirm] = useState<Teidara | null>(null);


  // ── Fleet Manage functions ───────────────────────────────────────────────────
  const loadFmVehicles = () => {
    setFmLoading(true);
    fetch("/api/fleet-vehicles/manage-full").then(r => r.json())
      .then(d => { setFmVehicles(Array.isArray(d) ? d : []); setFmLoading(false); })
      .catch(() => setFmLoading(false));
  };
  const loadFmNotifs = () => {
    fetch("/api/notifications?phone=0500000002").then(r => r.json())
      .then((d: FleetNotif[]) => {
        const fleet = (Array.isArray(d) ? d : []).filter(n =>
          !n.read && (n.title?.includes("حمولة") || n.title?.includes("أسطول") || n.body?.includes("سيار"))
        );
        setFmNotifs(fleet);
      }).catch(() => {});
  };
  const fmMarkRead = (id: number) => {
    fetch(`/api/notifications/${id}/read`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "0500000002" }) }).catch(() => {});
    setFmNotifs(prev => prev.filter(n => n.id !== id));
  };
  const fmHandleNotifClick = (n: FleetNotif) => {
    const plate = n.title.replace(/.*—\s*/, "").trim();
    if (plate) setFmSearch(plate);
    fmMarkRead(n.id);
  };
  const fmOpenVehicle = (v: FleetVehicle) => {
    setFmSelected(v);
    setFmEditForm({
      vehicle_name:      v.vehicle_name     || "",
      new_plate_number:  v.plate_number,
      vehicle_type:      v.vehicle_type     || "",
      entity:            v.entity           || "",
      status:            v.status           || "available",
      notes:             v.notes            || "",
      max_weight_kg:     String(v.max_weight_kg   || ""),
      empty_weight_kg:   String(v.empty_weight_kg || ""),
      driver_name:       v.driver_name      || "",
      linked_teidara_id: v.linked_teidara_id ? String(v.linked_teidara_id) : "",
    });
    setFmEditLinkedTeidaraIds((v.linked_teidarat || []).map(t => String(t.id)));
    setFmVehicleImages(v.vehicle_images || []);
    const assigned = (v.types || []).map(t => t.type_name);
    setFmEditTypes(assigned.length > 0 ? assigned : (v.vehicle_type ? [v.vehicle_type] : []));
    setFmEditPrimaryType((v.types || []).find(t => t.is_primary)?.type_name || v.vehicle_type || "");
    setFmDocForms({});
    setFmDetailTab("info");
    fetch(`/api/vehicle-compliance/${encodeURIComponent(v.plate_number)}`).then(r => r.json()).then(d => setFmVehicleDocs(Array.isArray(d) ? d : [])).catch(() => {});
  };
  const fmSaveVehicle = async () => {
    if (!fmSelected) return;
    setFmSaving(true);
    try {
      const res = await fetch(`/api/fleet-vehicles/${encodeURIComponent(fmSelected.plate_number)}/info`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fmEditForm, linked_teidara_ids: fmEditLinkedTeidaraIds }) });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "حدث خطأ"); return; }
      const newPlate = data.new_plate || fmSelected.plate_number;
      const typesPayload = fmEditTypes.map(name => ({ type_name: name, is_primary: name === fmEditPrimaryType ? 1 : 0 }));
      await fetch(`/api/fleet-vehicles/${encodeURIComponent(newPlate)}/types`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ types: typesPayload }) });
      loadFmVehicles();
      setFmSelected(prev => prev ? { ...prev, plate_number: newPlate, vehicle_name: fmEditForm.vehicle_name, vehicle_type: fmEditPrimaryType || fmEditTypes[0] || fmEditForm.vehicle_type, status: fmEditForm.status, notes: fmEditForm.notes, types: typesPayload } : null);
    } finally { setFmSaving(false); }
  };
  const fmDeleteVehicle = async () => {
    if (!fmSelected) return;
    const plate = fmSelected.plate_number;

    // Fetch summary of linked data
    let summary = { docs: 0, images: 0, breaks: 0, trips: 0 };
    try {
      const r = await fetch(`/api/fleet-vehicles/${encodeURIComponent(plate)}/delete-summary`);
      if (r.ok) summary = await r.json();
    } catch {}

    const lines: string[] = [`السيارة: ${plate}`];
    if (summary.docs    > 0) lines.push(`• ${summary.docs} وثيقة/وثائق امتثال`);
    if (summary.images  > 0) lines.push(`• ${summary.images} صورة`);
    if (summary.breaks  > 0) lines.push(`• ${summary.breaks} بلاغ عطل (يُبقى كسجل تاريخي)`);
    if (summary.trips   > 0) lines.push(`• ${summary.trips} رحلة مرتبطة (تُبقى كسجل تاريخي)`);
    lines.push("", "هل تريد الحذف النهائي؟ لا يمكن التراجع.");

    if (!confirm(lines.join("\n"))) return;

    const res = await fetch(`/api/fleet-vehicles/${encodeURIComponent(plate)}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); alert(d.error || "حدث خطأ"); return; }
    setFmSelected(null);
    loadFmVehicles();
  };
  const fmAddVehicle = async () => {
    if (!fmAddForm.plate_number?.trim()) return;
    setFmAddSaving(true);
    try {
      const res = await fetch("/api/fleet-vehicles/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fmAddForm, linked_teidara_ids: fmAddLinkedTeidaraIds }) });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "حدث خطأ"); return; }
      setFmAddOpen(false);
      setFmAddForm({ status: "available" });
      setFmAddLinkedTeidaraIds([]);
      loadFmVehicles();
    } finally { setFmAddSaving(false); }
  };
  const uploadVehicleImage = async (plate: string, angle: string, file: File) => {
    setVImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("plate_number", plate);
      fd.append("angle", angle);
      const r = await fetch("/api/vehicle-images", { method: "POST", body: fd });
      const data = await r.json();
      if (r.ok) setFmVehicleImages(prev => [...prev, { id: data.id, plate_number: plate, angle: data.angle, image_url: data.image_url, created_at: new Date().toISOString() }]);
    } finally { setVImgUploading(false); if (vImgFileRef.current) vImgFileRef.current.value = ""; }
  };
  const deleteVehicleImage = async (id: number) => {
    if (!confirm("حذف هذه الصورة؟")) return;
    await fetch(`/api/vehicle-images/${id}`, { method: "DELETE" });
    setFmVehicleImages(prev => prev.filter(img => img.id !== id));
  };
  const uploadTeidaraImage = async (id: number, file: File) => {
    setTImgUploading(prev => ({ ...prev, [id]: true }));
    try {
      const fd = new FormData();
      fd.append("image", file);
      const r = await fetch(`/api/teidarat/${id}/image`, { method: "POST", body: fd });
      const data = await r.json();
      if (r.ok) setTeidarat(prev => prev.map(t => t.id === id ? { ...t, image_url: data.image_url } : t));
    } finally { setTImgUploading(prev => ({ ...prev, [id]: false })); }
  };
  const fmSetDocField = (docType: string, field: keyof DocFormState, val: unknown) => {
    setFmDocForms(f => ({ ...f, [docType]: { ...(f[docType] || { ...EMPTY_DOC_FORM }), [field]: val } }));
  };
  const fmUploadDoc = async (docType: string) => {
    if (!fmSelected) return;
    const form = fmDocForms[docType] || EMPTY_DOC_FORM;
    if (!form.file && !form.start_date && !form.end_date) return;
    fmSetDocField(docType, "uploading", true);
    try {
      const fd = new FormData();
      fd.append("car_number", fmSelected.plate_number);
      fd.append("doc_type", docType);
      if (form.file)       fd.append("image",      form.file);
      if (form.start_date) fd.append("start_date", form.start_date);
      if (form.end_date)   fd.append("end_date",   form.end_date);
      if (form.notes)      fd.append("notes",      form.notes);
      await fetch("/api/vehicle-compliance", { method: "POST", body: fd });
      const docs = await fetch(`/api/vehicle-compliance/${encodeURIComponent(fmSelected.plate_number)}`).then(r => r.json());
      setFmVehicleDocs(Array.isArray(docs) ? docs : []);
      setFmDocForms(f => ({ ...f, [docType]: { ...EMPTY_DOC_FORM } }));
      if (fmFileRefs.current[docType]) fmFileRefs.current[docType]!.value = "";
      loadFmVehicles();
    } finally { fmSetDocField(docType, "uploading", false); }
  };
  const fmUploadNewDoc = async () => {
    if (!fmSelected || !fmNewDoc.doc_type.trim()) return;
    setFmNewDoc(f => ({ ...f, uploading: true }));
    const fd = new FormData();
    fd.append("car_number", fmSelected.plate_number);
    fd.append("doc_type", fmNewDoc.doc_type.trim());
    if (fmNewDoc.file)       fd.append("image",      fmNewDoc.file);
    if (fmNewDoc.start_date) fd.append("start_date", fmNewDoc.start_date);
    if (fmNewDoc.end_date)   fd.append("end_date",   fmNewDoc.end_date);
    if (fmNewDoc.notes)      fd.append("notes",      fmNewDoc.notes);
    await fetch("/api/vehicle-compliance", { method: "POST", body: fd });
    setFmNewDoc({ ...EMPTY_DOC_FORM, doc_type: "" });
    if (fmNewDocFileRef.current) fmNewDocFileRef.current.value = "";
    const docs = await fetch(`/api/vehicle-compliance/${encodeURIComponent(fmSelected.plate_number)}`).then(r => r.json());
    setFmVehicleDocs(Array.isArray(docs) ? docs : []);
    setFmNewDoc(f => ({ ...f, uploading: false }));
  };

  // ── Load teidarat ────────────────────────────────────────────────────────────
  const loadTeidarat = async () => {
    setTLoading(true);
    const data = await fetch("/api/teidarat").then(r => r.json()).catch(() => []);
    setTeidarat(Array.isArray(data) ? data : []);
    setTLoading(false);
  };

  // ── (staff functions removed) ────────────────────────────────────────────────

  const resetTForm = () => {
    setTNotes(""); setTNumber(""); setTType("");
    setTLength(""); setTWidth(""); setTHeight(""); setTCapacity(""); setTWeight("");
  };
  const openAddTeidara = () => {
    resetTForm();
    setTModal({ category: "" });
  };
  const openEditTeidara = (item: Teidara) => {
    setTNotes(item.notes || "");
    setTNumber(item.teidara_number || "");
    setTType(item.teidara_type || "");
    setTLength(item.length_m != null ? String(item.length_m) : "");
    setTWidth(item.width_m != null ? String(item.width_m) : "");
    setTHeight(item.height_m != null ? String(item.height_m) : "");
    setTCapacity(item.capacity != null ? String(item.capacity) : "");
    setTWeight(item.weight_kg != null ? String(item.weight_kg) : "");
    setTModal({ category: item.category, item });
  };
  const saveTeidara = async () => {
    if (!tModal) return;
    if (!tModal.item && !tModal.category) return;
    setTSaving(true);
    const body = {
      notes:          tNotes.trim()    || null,
      teidara_number: tNumber.trim()   || null,
      teidara_type:   tType.trim()     || null,
      length_m:   tLength   !== "" ? parseFloat(tLength)   : null,
      width_m:    tWidth    !== "" ? parseFloat(tWidth)    : null,
      height_m:   tHeight   !== "" ? parseFloat(tHeight)   : null,
      capacity:   tCapacity !== "" ? parseFloat(tCapacity) : null,
      weight_kg:  tWeight   !== "" ? parseFloat(tWeight)   : null,
    };
    if (tModal.item) {
      await fetch(`/api/teidarat/${tModal.item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/teidarat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: tModal.category, ...body }) });
    }
    setTSaving(false); setTModal(null);
    loadTeidarat();
  };
  const deleteTeidara = async (item: Teidara) => {
    await fetch(`/api/teidarat/${item.id}`, { method: "DELETE" });
    setTDeleteConfirm(null);
    loadTeidarat();
  };

  // ── General Expenses functions ───────────────────────────────────────────────
  const loadGenExp = () => {
    setGenLoading(true);
    fetch("/api/fleet-expenses").then(r => r.json())
      .then(d => { setGenExpenses(Array.isArray(d) ? d : []); setGenLoading(false); })
      .catch(() => setGenLoading(false));
  };
  const saveGenExp = async () => {
    if (!genExpForm.date || !genExpForm.expense_category || !genExpForm.amount) return;
    setGenExpSaving(true);
    await fetch("/api/fleet-expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...genExpForm, amount: parseFloat(genExpForm.amount) || 0 }),
    });
    setGenExpSaving(false);
    setGenExpForm({ date: new Date().toISOString().slice(0, 10), car_id: "", expense_category: "", description: "", amount: "", document_number: "" });
    loadGenExp();
  };
  const deleteGenExp = async (id: number) => {
    await fetch(`/api/fleet-expenses/${id}`, { method: "DELETE" });
    loadGenExp();
  };
  const openEditGenExp = (e: FleetExpense) => {
    setGenEditItem(e);
    setGenEditForm({ date: e.date?.slice(0,10) || "", car_id: e.car_id || "", expense_category: e.expense_category, description: e.description || "", amount: String(e.amount), document_number: e.document_number || "" });
  };
  const updateGenExp = async () => {
    if (!genEditItem) return;
    setGenEditSaving(true);
    await fetch(`/api/fleet-expenses/${genEditItem.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...genEditForm, amount: parseFloat(genEditForm.amount) || 0 }) });
    setGenEditSaving(false);
    setGenEditItem(null);
    loadGenExp();
  };

  // ── Employees (النقليات branch) functions ────────────────────────────────────
  const loadTransEmp = () => {
    setEmpLoading(true);
    fetch("/api/employees").then(r => r.json())
      .then(d => {
        const all = Array.isArray(d) ? d as TransEmployee[] : [];
        setTransEmp(all.filter(e => e.entity === "النقليات" || e.department === "النقليات"));
        setEmpLoading(false);
      })
      .catch(() => setEmpLoading(false));
  };
  const saveNewEmp = async () => {
    if (!empForm.name) return;
    setEmpSaving(true);
    await fetch("/api/employees", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...empForm, entity: "النقليات" }),
    });
    setEmpSaving(false);
    setEmpAddOpen(false);
    setEmpForm({ entity: "النقليات", status: "active" });
    loadTransEmp();
  };
  const openEditEmp = (e: TransEmployee) => {
    setEmpEditItem(e);
    setEmpEditForm({ name: e.name, job_title: e.job_title||"", phone: e.phone||"", email: e.email||"", salary: String(e.salary||""), nationality: e.nationality||"", hire_date: e.hire_date?.slice(0,10)||"", status: e.status||"active", department: e.department||"" });
  };
  const updateEmp = async () => {
    if (!empEditItem) return;
    setEmpEditSaving(true);
    await fetch(`/api/employees/${empEditItem.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...empEditForm, entity: "النقليات" }) });
    setEmpEditSaving(false);
    setEmpEditItem(null);
    loadTransEmp();
  };
  const deleteEmp = async (id: number) => {
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    setEmpDeleteId(null);
    loadTransEmp();
  };

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true);
    const [invData, vehData] = await Promise.all([
      fetch("/api/purchase-invoices?branch=النقليات").then(r => r.json()).catch(() => []),
      fetch("/api/fleet-vehicles-list").then(r => r.json()).catch(() => []),
    ]);
    setInvoices(Array.isArray(invData) ? invData : []);
    setVehicles(Array.isArray(vehData) ? vehData : []);
    setLoading(false);
  };
  useEffect(() => { loadAll(); loadTeidarat(); }, []);
  useEffect(() => {
    if (tab === "gen_expenses")  loadGenExp();
    if (tab === "emp_transport") loadTransEmp();
  }, [tab]);
  useEffect(() => {
    if (tab !== "fleet_manage") return;
    if (fmVehicles.length === 0 && !fmLoading) loadFmVehicles();
    loadFmNotifs();
    if (vehicleTypes.length === 0) {
      fetch("/api/vehicle-type-defs").then(r => r.json())
        .then((d: VehicleTypeDef[]) => setVehicleTypes(Array.isArray(d) ? d.filter(t => t.is_active !== 0) : []))
        .catch(() => {});
    }
    if (fmDrivers.length === 0) {
      fetch("/api/drivers").then(r => r.json())
        .then((d: DriverProfile[]) => setFmDrivers(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [tab]);

  // ── Dashboard derived ───────────────────────────────────────────────────────
  const totalSpend     = invoices.reduce((s, r) => s + (r.price_after_vat || 0), 0);
  const totalBeforeVat = invoices.reduce((s, r) => s + (r.price_before_vat || 0), 0);
  const totalQty       = invoices.reduce((s, r) => s + (r.quantity || 0), 0);

  // group by vehicle_plate
  const byVehicle: Record<string, { count: number; spend: number; qty: number }> = {};
  for (const inv of invoices) {
    const k = inv.vehicle_plate || "غير محدد";
    if (!byVehicle[k]) byVehicle[k] = { count: 0, spend: 0, qty: 0 };
    byVehicle[k].count++;
    byVehicle[k].spend += inv.price_after_vat || 0;
    byVehicle[k].qty   += inv.quantity        || 0;
  }
  const topVehicles = Object.entries(byVehicle)
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 10);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="space-y-5 pb-8">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#103c68] flex items-center justify-center shadow-md">
            <Truck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">قسم النقليات</h1>
            <p className="text-xs text-gray-400 mt-0.5">إدارة سيارات ومشتريات النقليات</p>
          </div>
        </div>
        <button onClick={loadAll} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          تحديث
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t.key
                  ? "bg-white text-[#103c68] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}>
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Dashboard Tab ──────────────────────────────────────────────────── */}
      {tab === "dashboard" && (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "إجمالي سجلات المشتريات", value: num(invoices.length), sub: "سجل مشتريات نقليات", color: "text-gray-800", bg: "bg-white" },
              { label: "إجمالي الكميات",          value: num(totalQty),        sub: "وحدة / قطعة",        color: "text-cyan-700", bg: "bg-white" },
              { label: "إجمالي الإنفاق (بعد الضريبة)", value: sar(totalSpend), sub: "ريال سعودي",          color: "text-[#103c68]", bg: "bg-[#103c68]/5" },
              { label: "سيارات لديها مشتريات",   value: num(Object.keys(byVehicle).length), sub: "سيارة مختلفة", color: "text-emerald-700", bg: "bg-white" },
            ].map(k => (
              <div key={k.label} className={`${k.bg} rounded-2xl p-5 border border-gray-100 shadow-sm`}>
                <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Vehicle spend ranking */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="font-black text-gray-800 text-sm">أعلى السيارات إنفاقاً — مشتريات النقليات</h3>
            </div>
            {topVehicles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
                لا توجد بيانات — تأكد من أن عمود الفرع يحتوي "النقليات"
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2.5">#</th>
                      <th className="px-4 py-2.5">رقم السيارة</th>
                      <th className="px-4 py-2.5 text-center">عدد السجلات</th>
                      <th className="px-4 py-2.5 text-center">إجمالي الكمية</th>
                      <th className="px-4 py-2.5 text-center">الإنفاق (بعد الضريبة)</th>
                      <th className="px-4 py-2.5 text-center">تفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topVehicles.map(([plate, stat], i) => (
                      <tr key={plate} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 text-gray-400 text-xs font-medium">{i + 1}</td>
                        <td className="px-4 py-2.5 font-black text-gray-800">{plate}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-600">{num(stat.count)}</td>
                        <td className="px-4 py-2.5 text-center text-xs font-semibold text-cyan-700">{num(stat.qty)}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-[#103c68]">{sar(stat.spend)}</td>
                        <td className="px-4 py-2.5 text-center">
                          {plate !== "غير محدد" && (
                            <button onClick={() => setSelectedPlate(plate)}
                              className="flex items-center gap-1 mx-auto text-[#0eb5cb] hover:text-[#0d9fb3] text-xs font-semibold hover:underline">
                              عرض <ChevronRight size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ══ الأسطول والوثائق Tab ══════════════════════════════════════════════ */}
      {tab === "fleet_manage" && (
        <FleetManagePage />
      )}

            {/* ── التيدارات Tab ──────────────────────────────────────────────────── */}
      {tab === "teidarat" && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {TEIDARAT_GROUPS.map(g => {
              const count = teidarat.filter(t => t.category === g.category).length;
              return (
                <div key={g.category} className={`bg-gradient-to-br ${g.colorFrom} ${g.colorTo} rounded-2xl border border-gray-100 shadow-sm p-5`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{g.icon}</span>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">{g.label}</p>
                      <p className={`text-3xl font-black ${g.textColor}`}>{count}</p>
                    </div>
                    <span className={`mr-auto ${g.badgeColor} text-white text-xs font-black px-2.5 py-1 rounded-xl`}>{count}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">بيانات التيدارات الأساسية</p>
                </div>
              );
            })}
          </div>

          {/* Loading indicator */}
          {tLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={20} className="animate-spin text-[#0eb5cb]" />
            </div>
          )}

          {/* Unified table — all categories */}
          {!tLoading && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-sm text-gray-700">جميع التيدارات</h3>
                  <span className="bg-gray-600 text-white text-xs font-black px-2 py-0.5 rounded-lg">{teidarat.length}</span>
                </div>
                <button onClick={() => openAddTeidara()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#103c68] text-white rounded-lg text-xs font-bold hover:opacity-90 transition-opacity">
                  + إضافة تيدار
                </button>
              </div>

              {teidarat.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-sm gap-2">
                  <Layers size={28} className="opacity-20" />
                  <p className="font-semibold">لا توجد تيدارات</p>
                  <p className="text-xs text-gray-300">اضغط "+ إضافة تيدار" لإنشاء وحدة جديدة</p>
                </div>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2.5 w-12 text-center">الرقم</th>
                      <th className="px-3 py-2.5">نوع التيدار</th>
                      <th className="px-2 py-2.5 text-center">صورة</th>
                      <th className="px-3 py-2.5">رقم التيدار</th>
                      <th className="px-3 py-2.5">رقم السيارة</th>
                      <th className="px-3 py-2.5">الوصف التفصيلي</th>
                      <th className="px-3 py-2.5 text-center">الأبعاد (ط×ع×ا) م</th>
                      <th className="px-3 py-2.5 text-center">سعة / وزن</th>
                      <th className="px-3 py-2.5">ملاحظات</th>
                      <th className="px-3 py-2.5 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teidarat.map((t, i) => {
                      const grp = TEIDARAT_GROUPS.find(g => g.category === t.category);
                      return (
                      <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${i % 2 === 1 ? "bg-gray-50/20" : ""}`}>
                        {/* Global sequential number */}
                        <td className="px-3 py-3 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-600 text-white text-xs font-black shadow">
                            {t.seq_no}
                          </span>
                        </td>
                        {/* Category badge */}
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold text-white ${grp?.badgeColor || "bg-gray-400"}`}>
                            {grp?.icon} {grp?.label || t.category}
                          </span>
                        </td>
                        {/* Photo */}
                        <td className="px-2 py-2 text-center">
                          {t.image_url ? (
                            <div className="relative group inline-block">
                              <img src={t.image_url} alt="" className="w-12 h-9 object-cover rounded-lg border border-gray-100 shadow-sm" />
                            </div>
                          ) : (
                            <label className="cursor-pointer">
                              <span className="text-gray-300 text-xs border border-dashed border-gray-200 rounded-lg px-2 py-1 hover:border-blue-300 hover:text-blue-400 transition-colors">
                                {tImgUploading[t.id] ? "..." : "📷"}
                              </span>
                              <input type="file" accept="image/*" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadTeidaraImage(t.id, f); e.target.value = ""; }} />
                            </label>
                          )}
                        </td>
                        {/* Teidara number */}
                        <td className="px-3 py-3 text-xs font-black text-gray-800">
                          {t.teidara_number || <span className="text-gray-300">—</span>}
                        </td>
                        {/* Linked vehicle — display only; managed from FleetManagePage */}
                        <td className="px-3 py-3">
                          {t.vehicle_plate ? (
                            <span className="inline-flex px-2 py-1 rounded-lg bg-[#103c68]/10 text-[#103c68] text-xs font-black">
                              {t.vehicle_plate}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">غير مرتبط</span>
                          )}
                        </td>
                        {/* Detailed type description */}
                        <td className="px-3 py-3 text-xs text-gray-600 font-semibold">
                          {t.teidara_type || <span className="text-gray-300">—</span>}
                        </td>
                        {/* Dimensions */}
                        <td className="px-3 py-3 text-center text-xs text-gray-600 font-mono">
                          {(t.length_m != null || t.width_m != null || t.height_m != null) ? (
                            <span className="bg-gray-100 px-2 py-0.5 rounded-lg">
                              {t.length_m ?? "?"} × {t.width_m ?? "?"} × {t.height_m ?? "?"}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                          {/* Capacity / Weight */}
                          <td className="px-3 py-3 text-center text-xs text-gray-600">
                            {(t.capacity != null || t.weight_kg != null) ? (
                              <div className="flex flex-col items-center gap-0.5">
                                {t.capacity  != null && <span className="text-blue-600 font-semibold">{t.capacity} م³</span>}
                                {t.weight_kg != null && <span className="text-amber-600 font-semibold">{t.weight_kg} كغ</span>}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          {/* Notes */}
                          <td className="px-3 py-3 text-xs text-gray-400 max-w-[120px] truncate">
                            {t.notes || "—"}
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => openEditTeidara(t)}
                                className="px-2.5 py-1 bg-[#103c68]/10 text-[#103c68] rounded-lg text-xs font-bold hover:bg-[#103c68]/20 transition-colors">
                                تعديل
                              </button>
                              <button onClick={() => setTDeleteConfirm(t)}
                                className="px-2.5 py-1 bg-red-50 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors">
                                حذف
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 4: المصروفات العمومية ──────────────────────────────────────── */}
      {tab === "gen_expenses" && (
        <div className="space-y-5">
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "إجمالي المصروفات", value: sar(genExpenses.reduce((s,e) => s+(e.amount||0),0)), color: "text-[#103c68]" },
              { label: "عدد السجلات",      value: num(genExpenses.length),                              color: "text-gray-800"   },
              { label: "سيارات مشمولة",    value: num(new Set(genExpenses.filter(e=>e.car_id).map(e=>e.car_id)).size), color: "text-emerald-700" },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Add form */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-black text-[#103c68] mb-4 flex items-center gap-2 text-sm">
              <DollarSign size={15}/> إضافة مصروف عمومي
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">التاريخ *</label>
                <input type="date" value={genExpForm.date}
                  onChange={e => setGenExpForm(f => ({...f, date: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0eb5cb]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">السيارة (اختياري)</label>
                <select value={genExpForm.car_id}
                  onChange={e => setGenExpForm(f => ({...f, car_id: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0eb5cb]">
                  <option value="">— مصروف عام —</option>
                  {vehicles.filter(v => v.entity === "النقليات").map(v => (
                    <option key={v.id} value={v.plate_number}>{v.plate_number}{v.vehicle_name ? ` — ${v.vehicle_name}` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">فئة المصروف *</label>
                <input value={genExpForm.expense_category}
                  onChange={e => setGenExpForm(f => ({...f, expense_category: e.target.value}))}
                  list="gen-exp-cats" placeholder="ديزل، صيانة، رواتب..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0eb5cb]" />
                <datalist id="gen-exp-cats">
                  {["ديزل","صيانة","رواتب","إيجار","تأمين","مواد","تسجيل","غسيل","أخرى"].map(c => <option key={c} value={c}/>)}
                </datalist>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600 block mb-1">الوصف</label>
                <input value={genExpForm.description}
                  onChange={e => setGenExpForm(f => ({...f, description: e.target.value}))}
                  placeholder="تفاصيل المصروف..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0eb5cb]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">المبلغ (ريال) *</label>
                <input type="number" min="0" step="0.01" value={genExpForm.amount}
                  onChange={e => setGenExpForm(f => ({...f, amount: e.target.value}))}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0eb5cb] text-center" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">رقم المستند</label>
                <input value={genExpForm.document_number}
                  onChange={e => setGenExpForm(f => ({...f, document_number: e.target.value}))}
                  placeholder="اختياري"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0eb5cb]" />
              </div>
            </div>
            <button onClick={saveGenExp}
              disabled={genExpSaving || !genExpForm.date || !genExpForm.expense_category || !genExpForm.amount}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-black hover:bg-[#0d3055] disabled:opacity-50 transition-colors">
              <Save size={14}/>{genExpSaving ? "جاري الحفظ..." : "حفظ المصروف"}
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="font-black text-gray-800 text-sm">سجل المصروفات</h3>
              <span className="text-xs text-gray-400">{genExpenses.length} سجل</span>
            </div>
            {genLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-7 h-7 border-4 border-t-transparent rounded-full animate-spin border-[#0eb5cb]"/>
              </div>
            ) : genExpenses.length === 0 ? (
              <p className="py-10 text-center text-gray-400 text-sm">لا توجد مصروفات مسجلة</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["التاريخ","السيارة","الفئة","الوصف","المبلغ","رقم المستند",""].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-xs font-bold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {genExpenses.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDate(e.date)}</td>
                        <td className="px-4 py-3 text-xs font-mono font-semibold text-[#103c68]">{e.car_id || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{e.expense_category}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[180px] truncate">{e.description || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-xs font-black text-[#103c68] whitespace-nowrap">{sar(e.amount)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{e.document_number || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditGenExp(e)}
                              className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title="تعديل">
                              <Eye size={13} className="text-blue-400"/>
                            </button>
                            <button onClick={() => deleteGenExp(e.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="حذف">
                              <Trash2 size={13} className="text-red-400"/>
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
        </div>
      )}

      {/* ── Tab 5: الموظفون ─────────────────────────────────────────────────── */}
      {tab === "emp_transport" && (
        <div className="space-y-5">
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "إجمالي الموظفين",  value: num(transEmp.length),                                                         color: "text-gray-800"    },
              { label: "نشطون",             value: num(transEmp.filter(e => e.status==="active"||e.status==="يعمل").length),     color: "text-emerald-700" },
              { label: "إجمالي الرواتب",   value: sar(transEmp.reduce((s,e) => s+(e.salary||0),0)),                             color: "text-[#103c68]"   },
              { label: "متوسط الراتب",      value: transEmp.length ? sar(transEmp.reduce((s,e)=>s+(e.salary||0),0)/transEmp.length) : "—", color: "text-amber-700" },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                <p className={`text-xl font-black ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Add employee button + inline form */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-[#103c68] text-sm flex items-center gap-2">
                <Users size={15}/> موظفو فرع النقليات
              </h3>
              <button onClick={() => setEmpAddOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#103c68] text-white rounded-xl text-xs font-bold hover:bg-[#0d3055] transition-colors">
                <Plus size={13}/>{empAddOpen ? "إلغاء" : "إضافة موظف"}
              </button>
            </div>

            {empAddOpen && (
              <div className="mb-5 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-xs font-bold text-gray-500 mb-3">بيانات الموظف الجديد</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {([
                    ["الاسم الكامل *", "name",      "text"],
                    ["المسمى الوظيفي", "job_title", "text"],
                    ["الجوال",         "phone",     "text"],
                    ["الراتب (ريال)",  "salary",    "number"],
                    ["الجنسية",        "nationality","text"],
                    ["تاريخ التعيين",  "hire_date", "date"],
                  ] as [string, string, string][]).map(([lbl, k, t]) => (
                    <div key={k}>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">{lbl}</label>
                      <input type={t} value={empForm[k] || ""}
                        onChange={e => setEmpForm(f => ({...f, [k]: e.target.value}))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0eb5cb]" />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">الحالة</label>
                    <select value={empForm.status || "active"}
                      onChange={e => setEmpForm(f => ({...f, status: e.target.value}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0eb5cb]">
                      <option value="active">نشط</option>
                      <option value="on_leave">إجازة</option>
                      <option value="inactive">غير نشط</option>
                    </select>
                  </div>
                </div>
                <button onClick={saveNewEmp} disabled={empSaving || !empForm.name}
                  className="mt-3 flex items-center gap-2 px-5 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-black hover:bg-[#0d3055] disabled:opacity-50 transition-colors">
                  <Save size={14}/>{empSaving ? "جاري الحفظ..." : "حفظ الموظف"}
                </button>
              </div>
            )}

            {/* Table */}
            {empLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-7 h-7 border-4 border-t-transparent rounded-full animate-spin border-[#0eb5cb]"/>
              </div>
            ) : transEmp.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <div className="text-4xl mb-2">👥</div>
                لا يوجد موظفون مسجلون في فرع النقليات
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["الاسم","المسمى","الجوال","الراتب","الجنسية","تاريخ التعيين","الحالة",""].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-xs font-bold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {transEmp.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                                 style={{ backgroundColor: "#103c68" }}>
                              {e.name[0]}
                            </div>
                            <span className="font-semibold text-gray-800 text-xs">{e.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{e.job_title || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3">
                          {e.phone
                            ? <a href={`tel:${e.phone}`} className="flex items-center gap-1 text-xs text-[#0eb5cb]">
                                <Phone size={11}/>{e.phone}
                              </a>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-[#103c68]">
                          {(e.salary||0) > 0 ? sar(e.salary!) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{e.nationality || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{e.hire_date ? fmtDate(e.hire_date) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            e.status==="active"||e.status==="يعمل"
                              ? "bg-emerald-100 text-emerald-700"
                              : e.status==="on_leave"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {e.status==="active"||e.status==="يعمل" ? "نشط" : e.status==="on_leave" ? "إجازة" : "غير نشط"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditEmp(e)}
                              className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title="تعديل">
                              <Eye size={13} className="text-blue-400"/>
                            </button>
                            <button onClick={() => setEmpDeleteId(e.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="حذف">
                              <Trash2 size={13} className="text-red-400"/>
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
        </div>
      )}

      {/* ── Teidarat Add/Edit Modal ─────────────────────────────────────────── */}
      {tModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-gray-900">
                {tModal.item ? "تعديل التيدار" : "إضافة تيدار"}
              </h3>
              <button onClick={() => setTModal(null)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            {tModal.item && (
              <div className="mb-4 px-3 py-2 bg-gray-50 rounded-xl text-xs text-gray-500">
                الرقم التسلسلي: <span className="font-black text-gray-800 text-sm">{tModal.item.seq_no}</span>
                {" · "}النوع: <span className="font-black text-gray-800">{TEIDARAT_GROUPS.find(g => g.category === tModal.category)?.label || tModal.category}</span>
              </div>
            )}

            <div className="space-y-3">
              {/* اختيار نوع التيدار — للإضافة فقط */}
              {!tModal.item && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">نوع التيدار <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    {TEIDARAT_GROUPS.map(g => (
                      <button key={g.category} type="button"
                        onClick={() => setTModal(prev => prev ? { ...prev, category: g.category } : null)}
                        className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                          tModal.category === g.category
                            ? `${g.badgeColor} text-white border-transparent shadow-md`
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}>
                        <span className="text-base">{g.icon}</span>
                        <span>{g.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* رقم التيدار */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">رقم التيدار</label>
                <input
                  value={tNumber}
                  onChange={e => setTNumber(e.target.value)}
                  placeholder="مثال: T-001"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0eb5cb] text-right"
                />
              </div>

              {/* وصف النوع التفصيلي */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">الوصف التفصيلي للنوع (اختياري)</label>
                <input
                  value={tType}
                  onChange={e => setTType(e.target.value)}
                  placeholder="مثال: مسطح، مغلق، خلاط..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0eb5cb] text-right"
                />
              </div>

              {/* ملاحظات */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">ملاحظات (اختياري)</label>
                <input
                  value={tNotes}
                  onChange={e => setTNotes(e.target.value)}
                  placeholder="أي ملاحظة..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0eb5cb] text-right"
                />
              </div>

              {/* أبعاد: طول × عرض × ارتفاع */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">الأبعاد (بالمتر)</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <input
                      type="number" min="0" step="0.01"
                      value={tLength}
                      onChange={e => setTLength(e.target.value)}
                      placeholder="الطول"
                      className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0eb5cb] text-center"
                    />
                    <p className="text-center text-[10px] text-gray-400 mt-0.5">طول</p>
                  </div>
                  <div>
                    <input
                      type="number" min="0" step="0.01"
                      value={tWidth}
                      onChange={e => setTWidth(e.target.value)}
                      placeholder="العرض"
                      className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0eb5cb] text-center"
                    />
                    <p className="text-center text-[10px] text-gray-400 mt-0.5">عرض</p>
                  </div>
                  <div>
                    <input
                      type="number" min="0" step="0.01"
                      value={tHeight}
                      onChange={e => setTHeight(e.target.value)}
                      placeholder="الارتفاع"
                      className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0eb5cb] text-center"
                    />
                    <p className="text-center text-[10px] text-gray-400 mt-0.5">ارتفاع</p>
                  </div>
                </div>
              </div>

              {/* سعة + وزن */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">السعة (م³)</label>
                  <input
                    type="number" min="0" step="0.1"
                    value={tCapacity}
                    onChange={e => setTCapacity(e.target.value)}
                    placeholder="0.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0eb5cb] text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">الوزن (كغ)</label>
                  <input
                    type="number" min="0" step="1"
                    value={tWeight}
                    onChange={e => setTWeight(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0eb5cb] text-center"
                  />
                </div>
              </div>

            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={saveTeidara}
                disabled={tSaving || (!tModal.item && !tModal.category)}
                className="flex-1 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-black hover:bg-[#0d3055] transition-colors disabled:opacity-50">
                {tSaving ? "جاري الحفظ..." : (!tModal.item && !tModal.category ? "اختر الفئة أولاً" : "حفظ")}
              </button>
              <button onClick={() => setTModal(null)}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Teidarat Delete Confirm ──────────────────────────────────────────── */}
      {tDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" dir="rtl">
            <h3 className="font-black text-gray-900 mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-gray-600 mb-5">
              هل تريد حذف التيدار رقم <span className="font-black">{tDeleteConfirm.seq_no}</span>؟
              سيتم إعادة ترقيم جميع التيدارات تلقائياً.
            </p>
            <div className="flex gap-3">
              <button onClick={() => deleteTeidara(tDeleteConfirm)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-black hover:bg-red-600 transition-colors">
                حذف
              </button>
              <button onClick={() => setTDeleteConfirm(null)}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: تعديل مصروف عمومي ──────────────────────────────────────── */}
      {genEditItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setGenEditItem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 rounded-t-2xl" style={{ backgroundColor: "#103c68" }}>
              <h2 className="font-extrabold text-white flex items-center gap-2"><DollarSign size={16}/>تعديل المصروف</h2>
              <button onClick={() => setGenEditItem(null)} className="text-white/80 hover:text-white"><X size={20}/></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {([
                ["التاريخ *",       "date",             "date"],
                ["فئة المصروف *",   "expense_category", "text"],
                ["السيارة",         "car_id",           "text"],
                ["رقم المستند",     "document_number",  "text"],
                ["المبلغ (ريال) *", "amount",           "number"],
              ] as [string, string, string][]).map(([lbl, k, t]) => (
                <div key={k} className={k === "expense_category" || k === "amount" ? "" : ""}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{lbl}</label>
                  {k === "car_id" ? (
                    <select value={genEditForm.car_id}
                      onChange={e => setGenEditForm(f => ({...f, car_id: e.target.value}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0eb5cb]">
                      <option value="">— مصروف عام —</option>
                      {vehicles.filter(v => v.entity === "النقليات").map(v => (
                        <option key={v.id} value={v.plate_number}>{v.plate_number}{v.vehicle_name ? ` — ${v.vehicle_name}` : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <input type={t} value={genEditForm[k as keyof typeof genEditForm] || ""}
                      onChange={e => setGenEditForm(f => ({...f, [k]: e.target.value}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0eb5cb]" />
                  )}
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 block mb-1">الوصف</label>
                <input value={genEditForm.description}
                  onChange={e => setGenEditForm(f => ({...f, description: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0eb5cb]" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={updateGenExp} disabled={genEditSaving || !genEditForm.date || !genEditForm.expense_category || !genEditForm.amount}
                className="flex-1 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-black hover:bg-[#0d3055] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <Save size={14}/>{genEditSaving ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>
              <button onClick={() => setGenEditItem(null)}
                className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: تعديل موظف ──────────────────────────────────────────────── */}
      {empEditItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setEmpEditItem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 rounded-t-2xl sticky top-0 z-10" style={{ backgroundColor: "#103c68" }}>
              <h2 className="font-extrabold text-white flex items-center gap-2"><Users size={16}/>تعديل بيانات الموظف</h2>
              <button onClick={() => setEmpEditItem(null)} className="text-white/80 hover:text-white"><X size={20}/></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {([
                ["الاسم الكامل *", "name",        "text"],
                ["المسمى الوظيفي", "job_title",   "text"],
                ["الجوال",         "phone",       "text"],
                ["البريد الإلكتروني","email",     "email"],
                ["الراتب (ريال)",  "salary",      "number"],
                ["الجنسية",        "nationality", "text"],
                ["القسم",          "department",  "text"],
                ["تاريخ التعيين",  "hire_date",   "date"],
              ] as [string, string, string][]).map(([lbl, k, t]) => (
                <div key={k}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{lbl}</label>
                  <input type={t} value={empEditForm[k] || ""}
                    onChange={e => setEmpEditForm(f => ({...f, [k]: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0eb5cb]" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">الحالة</label>
                <select value={empEditForm.status || "active"}
                  onChange={e => setEmpEditForm(f => ({...f, status: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0eb5cb]">
                  <option value="active">نشط</option>
                  <option value="on_leave">إجازة</option>
                  <option value="inactive">غير نشط</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={updateEmp} disabled={empEditSaving || !empEditForm.name}
                className="flex-1 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-black hover:bg-[#0d3055] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <Save size={14}/>{empEditSaving ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>
              <button onClick={() => setEmpEditItem(null)}
                className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm: حذف موظف ──────────────────────────────────────────────── */}
      {empDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" dir="rtl">
            <h3 className="font-black text-gray-900 mb-2">تأكيد حذف الموظف</h3>
            <p className="text-sm text-gray-500 mb-5">هل أنت متأكد من حذف هذا الموظف؟ لا يمكن التراجع.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteEmp(empDeleteId)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-black hover:bg-red-600 transition-colors">
                حذف
              </button>
              <button onClick={() => setEmpDeleteId(null)}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
