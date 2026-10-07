import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import * as XLSX from "xlsx";
import {
  FileText, Truck, CheckCircle, Package, Upload, X,
  Clock, CircleCheck, Search, Download, Pencil, Trash2,
  LayoutDashboard, Plus, MapPin, ClipboardList, FileDown,
} from "lucide-react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { uploadFilesToObjectStorage } from "@/lib/uploadFilesToObjectStorage";

/* ─── Types ────────────────────────────────────────────────── */
interface SupplyTrip {
  id: number; supply_request_id: number;
  routing_dispatch_id?: number | null;
  vehicle_plate: string; driver_name: string; driver_phone: string;
  status: string; product_name: string; requested_qty: number; unit: string;
  warehouse_name: string; destination_division: string | null;
  permit_image_url?: string | null;
  invoice_image: string | null; cargo_type: string | null; reference_no: string | null;
  cargo_items?: { cargo_type: string; quantity?: number | null; sort_order?: number }[];
  attachments?: { kind: string; url: string; file_name?: string; sort_order?: number }[];
  priority: string; created_at: string;
}

interface FleetVehicle {
  id: number; plate_number: string; vehicle_type: string;
  vehicle_subtype?: string; driver_name?: string; status: string;
  load_capacity_tons?: number; equipment_type?: string; notes?: string;
}

interface PendingWO {
  id: number; order_number: string;
  customer_name: string | null; customer_phone: string;
  product_name: string; quantity: number; unit: string;
  delivery_location: string | null; packaging_type: string;
  stage: string; created_at: string;
}

interface FactoryOrder {
  id: number; order_number: string;
  vehicle_plate: string | null; driver_name: string | null; driver_phone: string | null;
  product_name: string; quantity: number; unit: string;
  delivery_site: string | null; notes: string | null;
  status: string;
  permit_number: string | null; permit_doc_url: string | null; permit_issued_at: string | null;
  loading_order_url: string | null; loading_confirmed_at: string | null;
  delivered_at: string | null; delivery_notes: string | null;
  created_at: string;
}
interface RepReqF {
  id: number; request_no: string; product_name: string;
  loading_locations: string[]; delivery_location: string | null;
  rep_name: string | null; rep_phone: string | null;
  vehicle_plate: string | null; driver_name: string | null; driver_phone: string | null;
  status: string; permit_photo_url: string | null;
  notes: string | null; created_at: string;
}

/* ─── Status maps ───────────────────────────────────────────── */
const REQ_STATUS: Record<string, { label: string; color: string }> = {
  assigned:                    { label: "بانتظار تأكيدك",         color: "bg-amber-100 text-amber-700"  },
  pending_permit:              { label: "بانتظار تأكيدك",         color: "bg-amber-100 text-amber-700"  },
  supervisor_assigned:         { label: "بانتظار تأكيدك",         color: "bg-amber-100 text-amber-700"  },
  in_transit:                  { label: "في الطريق 🚛",            color: "bg-blue-100 text-blue-700"    },
  loaded:                      { label: "جارٍ التحميل 📦",         color: "bg-indigo-100 text-indigo-700"},
  delivered_to_warehouse:      { label: "وصل المستودع 🏁",         color: "bg-teal-100 text-teal-700"   },
  pending_warehouse_approval:  { label: "بانتظار موافقة المستودع", color: "bg-purple-100 text-purple-700"},
  received:                    { label: "تم الاستلام ✓",           color: "bg-green-100 text-green-700" },
  completed:                   { label: "مكتمل ✓",                color: "bg-green-100 text-green-700" },
  redirected:                  { label: "تم التحويل",              color: "bg-gray-100 text-gray-600"   },
};

const FO_STATUS: Record<string, { label: string; color: string }> = {
  pending_permit: { label: "بانتظار الفسحة",   color: "bg-amber-100 text-amber-700"    },
  permit_issued:  { label: "الفسحة صادرة",     color: "bg-blue-100 text-blue-700"      },
  loaded:         { label: "تم التحميل",        color: "bg-indigo-100 text-indigo-700"  },
  delivered:      { label: "تم التسليم",        color: "bg-green-100 text-green-700"    },
};

const VEH_STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  available:   { label: "متاحة",   dot: "bg-green-400",  badge: "bg-green-50 text-green-700 border-green-200"   },
  busy:        { label: "في العمل", dot: "bg-blue-400",   badge: "bg-blue-50 text-blue-700 border-blue-200"     },
  maintenance: { label: "صيانة",   dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700 border-amber-200"  },
  inactive:    { label: "متوقفة",  dot: "bg-gray-300",   badge: "bg-gray-50 text-gray-500 border-gray-200"     },
};

/* ─── Stat Card ─────────────────────────────────────────────── */
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color: string;
}) {
  return (
    <div className={`rounded-2xl p-4 flex items-center gap-3 ${color}`}>
      <div className="w-10 h-10 bg-white/40 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon size={20} className="text-current" />
      </div>
      <div>
        <div className="text-2xl font-black">{value}</div>
        <div className="text-xs font-semibold opacity-80 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function FsohatPage() {
  const { user } = useAuth();

  /* ─ Supply trips state ─ */
  const [trips,     setTrips]     = useState<SupplyTrip[]>([]);
  const [reqLoad,   setReqLoad]   = useState(true);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [form,      setForm]      = useState({ reference_no: "", invoice_file: null as File | null, invoice_files: [] as File[], invoice_preview: "" });
  const [saving,    setSaving]    = useState(false);
  const fileRef                   = useRef<HTMLInputElement>(null);

  /* ─ Edit in_transit trip state ─ */
  const [editId,      setEditId]      = useState<number | null>(null);
  const [editForm,    setEditForm]    = useState({ reference_no: "", invoice_file: null as File | null, invoice_files: [] as File[], invoice_preview: "" });
  const [editSaving,  setEditSaving]  = useState(false);
  const editFileRef                   = useRef<HTMLInputElement>(null);

  /* ─ Fleet vehicles state ─ */
  const [vehicles,  setVehicles]  = useState<FleetVehicle[]>([]);
  const [search,    setSearch]    = useRememberedState("fsohat-search", "");

  /* ─ Request filter (status pill) ─ */
  const [reqFilter, setReqFilter] = useRememberedState<string | null>("fsohat-request-status-filter", null);

  /* ─ Bulk selection ─ */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected]           = useState<Set<number>>(new Set());
  const [showTrash, setShowTrash]         = useState(false);
  const [archivedTrips, setArchivedTrips] = useState<SupplyTrip[]>([]);
  const [bulkSaving, setBulkSaving]       = useState(false);

  /* ─ Tab ─ */
  const [tab, setTab] = useRememberedState<"requests" | "factory">("fsohat-tab", "requests");

  /* ─ Factory orders state ─ */
  const [factoryOrders, setFactoryOrders] = useState<FactoryOrder[]>([]);
  const [foLoad,        setFoLoad]        = useState(false);
  const [foStatusFilter, setFoStatusFilter] = useRememberedState("fsohat-factory-status-filter", "all");
  const [showCreateFo,  setShowCreateFo]  = useState(false);
  const [foForm,        setFoForm]        = useState({
    vehicle_plate: "", driver_name: "", driver_phone: "",
    product_name: "", quantity: "", unit: "طن",
    delivery_site: "", notes: "",
  });
  const [foSaving,  setFoSaving]  = useState(false);
  /* permit upload — factory orders */
  const [permitId,  setPermitId]  = useState<number | null>(null);
  const [permitForm, setPermitForm] = useState({ permit_number: "" });
  const [permitFile, setPermitFile] = useState<File | null>(null);
  const [permitSaving, setPermitSaving] = useState(false);
  const permitFileRef = useRef<HTMLInputElement>(null);
  /* rep requests */
  const [repReqs,       setRepReqs]       = useState<RepReqF[]>([]);
  const [permitRepId,   setPermitRepId]   = useState<number | null>(null);
  const [permitRepFile, setPermitRepFile] = useState<File | null>(null);
  const [permitRepSaving, setPermitRepSaving] = useState(false);
  const permitRepRef = useRef<HTMLInputElement>(null);
  /* delivery site edit */
  const [editSiteId,  setEditSiteId]  = useState<number | null>(null);
  const [editSiteVal, setEditSiteVal] = useState("");

  /* ─ fsohat_pending workflow orders (سائب orders after rep approval) ─ */
  const [pendingWO,    setPendingWO]    = useState<PendingWO[]>([]);
  const [pwConverting, setPwConverting] = useState<number | null>(null);

  /* ─ Fetch supply trips ─ */
  const loadTrips = () => {
    setReqLoad(true);
    fetch(`/api/supply-request-trips?active_only=0&_=${Date.now()}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: SupplyTrip[]) => setTrips(Array.isArray(data) ? data.filter(t =>
        ["assigned","in_transit","loaded","delivered_to_warehouse",
         "pending_warehouse_approval","completed"].includes(t.status)
      ) : []))
      .catch(() => {})
      .finally(() => setReqLoad(false));
  };

  /* ─ Archived trips ─ */
  const loadArchivedTrips = () => {
    fetch(`/api/supply-request-trips?active_only=0&include_archived=1&_=${Date.now()}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: SupplyTrip[]) => setArchivedTrips(Array.isArray(data) ? data.filter(t => (t as unknown as Record<string,unknown>).archived_at) : []))
      .catch(() => {});
  };

  /* ─ Bulk actions ─ */
  const bulkArchive = async () => {
    if (!selected.size) return;
    setBulkSaving(true);
    const res = await fetch("/api/supply-request-trips/bulk-archive", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    const d = await res.json();
    alert(d.message || d.error);
    setSelected(new Set()); setSelectionMode(false);
    loadTrips(); loadArchivedTrips();
    setBulkSaving(false);
  };

  const bulkRestore = async (ids: number[]) => {
    if (!ids.length) return;
    setBulkSaving(true);
    const res = await fetch("/api/supply-request-trips/bulk-restore", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const d = await res.json();
    alert(d.message || d.error);
    setSelected(new Set());
    loadTrips(); loadArchivedTrips();
    setBulkSaving(false);
  };

  const bulkHardDelete = async (ids: number[]) => {
    if (!ids.length) return;
    if (!confirm(`هل أنت متأكد من الحذف النهائي لـ ${ids.length} طلب؟ لا يمكن التراجع.`)) return;
    setBulkSaving(true);
    const res = await fetch("/api/supply-request-trips/bulk-hard-delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const d = await res.json();
    alert(d.message || d.error);
    setSelected(new Set());
    loadArchivedTrips();
    setBulkSaving(false);
  };

  /* ─ Fetch fleet vehicles (all) ─ */
  const loadVehicles = () => {
    fetch("/api/portal/fleet-vehicles")
      .then(r => r.json())
      .then((data: FleetVehicle[]) => setVehicles(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  /* ─ Fetch fsohat_pending workflow orders (سائب after rep approval) ─ */
  const loadPendingWO = () => {
    fetch("/api/workflow/orders?role=fsohat")
      .then(r => r.json())
      .then((d: PendingWO[]) => setPendingWO(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  /* ─ Convert workflow order to factory order ─ */
  const convertToFactoryOrder = async (woId: number) => {
    setPwConverting(woId);
    try {
      const res = await fetch(`/api/factory-orders/from-workflow/${woId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ created_by_phone: user?.phone }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      loadPendingWO();
      loadFactoryOrders();
    } catch (e) { alert((e as Error).message); }
    finally { setPwConverting(null); }
  };

  /* ─ Fetch factory orders ─ */
  const loadFactoryOrders = () => {
    setFoLoad(true);
    fetch("/api/factory-orders")
      .then(r => r.json())
      .then((d: FactoryOrder[]) => setFactoryOrders(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setFoLoad(false));
  };

  /* ─ Create factory order ─ */
  const createFactoryOrder = async () => {
    if (!foForm.product_name) { alert("اسم المنتج مطلوب"); return; }
    setFoSaving(true);
    try {
      const res = await fetch("/api/factory-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...foForm, created_by_phone: user?.phone }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowCreateFo(false);
      setFoForm({ vehicle_plate: "", driver_name: "", driver_phone: "", product_name: "", quantity: "", unit: "طن", delivery_site: "", notes: "" });
      loadFactoryOrders();
    } catch (e) { alert((e as Error).message); }
    finally { setFoSaving(false); }
  };

  /* ─ Upload permit ─ */
  const uploadPermit = async () => {
    if (!permitId) return;
    setPermitSaving(true);
    try {
      const fd = new FormData();
      fd.append("permit_number", permitForm.permit_number);
      if (permitFile) fd.append("permit_doc", permitFile);
      const res = await fetch(`/api/factory-orders/${permitId}/permit`, { method: "PUT", body: fd });
      if (!res.ok) throw new Error((await res.json()).error);
      setPermitId(null);
      setPermitForm({ permit_number: "" });
      setPermitFile(null);
      loadFactoryOrders();
    } catch (e) { alert((e as Error).message); }
    finally { setPermitSaving(false); }
  };

  /* ─ Update delivery site ─ */
  const saveDeliverySite = async (id: number) => {
    await fetch(`/api/factory-orders/${id}/delivery-site`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivery_site: editSiteVal }),
    });
    setEditSiteId(null);
    loadFactoryOrders();
  };

  const loadRepReqs = () => {
    fetch("/api/rep-requests?status=vehicle_assigned")
      .then(r => r.ok ? r.json() : [])
      .then(d => setRepReqs(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  const uploadRepPermit = async () => {
    if (!permitRepId || !permitRepFile) { alert("يرجى اختيار صورة الفسحة"); return; }
    setPermitRepSaving(true);
    try {
      const fd = new FormData();
      fd.append("permit_photo", permitRepFile);
      const res = await fetch(`/api/rep-requests/${permitRepId}/upload-permit`, { method: "PUT", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في رفع الفسحة");
      setPermitRepId(null); setPermitRepFile(null);
      loadRepReqs();
    } catch (e) { alert((e as Error).message); }
    finally { setPermitRepSaving(false); }
  };

  useEffect(() => { loadTrips(); loadArchivedTrips(); loadVehicles(); loadFactoryOrders(); loadPendingWO(); loadRepReqs(); }, []);

  /* ─ File helpers ─ */
  const makePreview = (file: File, setter: (s: string) => void) => {
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = e => setter((e.target?.result as string) || "");
      reader.readAsDataURL(file);
    } else { setter(""); }
  };

  const handleFiles = (files: File[]) => {
    const selected = files.slice(0, 20);
    const file = selected[0];
    if (!file) return;
    makePreview(file, preview => setForm(f => ({ ...f, invoice_file: file, invoice_files: selected, invoice_preview: preview })));
    if (!file.type.startsWith("image/")) setForm(f => ({ ...f, invoice_file: file, invoice_files: selected, invoice_preview: "" }));
  };

  const handleFile = (file: File) => handleFiles([file]);

  const handleEditFiles = (files: File[]) => {
    const selected = files.slice(0, 20);
    const file = selected[0];
    if (!file) return;
    makePreview(file, preview => setEditForm(f => ({ ...f, invoice_file: file, invoice_files: selected, invoice_preview: preview })));
    if (!file.type.startsWith("image/")) setEditForm(f => ({ ...f, invoice_file: file, invoice_files: selected, invoice_preview: "" }));
  };

  const handleEditFile = (file: File) => handleEditFiles([file]);

  /* ─ Confirm request ─ */
  const confirmRequest = async (id: number, trip?: SupplyTrip) => {
    if (!form.reference_no) { alert("يرجى إدخال رقم المرجع"); return; }
    setSaving(true);
    try {
      const endpoint = trip?.routing_dispatch_id
        ? `/api/supply-request-trips/${trip.id}/fsohat-confirm`
        : `/api/supply-requests/${id}/fsohat-confirm`;
      const token = localStorage.getItem("mkgh_token") || "";
      let res: Response;
      if (trip?.routing_dispatch_id) {
        const files = form.invoice_files.length ? form.invoice_files : form.invoice_file ? [form.invoice_file] : [];
        const attachments = await uploadFilesToObjectStorage(files, token || undefined);
        res = await fetch(endpoint, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            reference_no: form.reference_no,
            confirmed_by: user?.name || user?.phone || "",
            attachments,
          }),
        });
      } else {
        const fd = new FormData();
        fd.append("reference_no", form.reference_no);
        fd.append("confirmed_by", user?.name || user?.phone || "");
        if (form.invoice_file) fd.append("invoice_file", form.invoice_file);
        res = await fetch(endpoint, {
          method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: fd,
        });
      }
      if (!res.ok) { alert((await res.json()).error || "خطأ"); return; }
      setConfirmId(null);
      setForm({ reference_no: "", invoice_file: null, invoice_files: [], invoice_preview: "" });
      loadTrips();
    } finally { setSaving(false); }
  };

  /* ─ Update confirmed trip ─ */
  const updateTrip = async (id: number, trip?: SupplyTrip) => {
    setEditSaving(true);
    try {
      const endpoint = trip?.routing_dispatch_id
        ? `/api/supply-request-trips/${trip.id}/fsohat-update`
        : `/api/supply-requests/${id}/fsohat-update`;
      const token = localStorage.getItem("mkgh_token") || "";
      let res: Response;
      if (trip?.routing_dispatch_id) {
        const files = editForm.invoice_files.length ? editForm.invoice_files : editForm.invoice_file ? [editForm.invoice_file] : [];
        const attachments = await uploadFilesToObjectStorage(files, token || undefined);
        res = await fetch(endpoint, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ reference_no: editForm.reference_no, attachments }),
        });
      } else {
        const fd = new FormData();
        fd.append("reference_no", editForm.reference_no);
        if (editForm.invoice_file) fd.append("invoice_file", editForm.invoice_file);
        res = await fetch(endpoint, {
          method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: fd,
        });
      }
      if (!res.ok) { alert((await res.json()).error || "خطأ"); return; }
      setEditId(null);
      setEditForm({ reference_no: "", invoice_file: null, invoice_files: [], invoice_preview: "" });
      loadTrips();
    } finally { setEditSaving(false); }
  };

  /* ─ Recall (cancel) confirmed trip ─ */
  const recallTrip = async (id: number, trip?: SupplyTrip) => {
    if (!window.confirm("هل تريد سحب تأكيد هذه الرحلة وإعادتها لبانتظار التأكيد؟")) return;
    try {
      const endpoint = trip?.routing_dispatch_id
        ? `/api/supply-request-trips/${trip.id}/fsohat-recall`
        : `/api/supply-requests/${id}/fsohat-recall`;
      const res = await fetch(endpoint, {
        method: "PUT", headers: { Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` },
      });
      if (!res.ok) { alert((await res.json()).error || "خطأ"); return; }
      loadTrips();
    } catch { alert("خطأ في الاتصال"); }
  };

  /* ─ Excel export ─ */
  const exportExcel = () => {
    const rows = trips.map(r => ({
      "المنتج":        r.product_name,
      "الكمية":        r.requested_qty,
      "الوحدة":        r.unit,
      "المستودع":      r.warehouse_name || "",
      "السيارة":       r.vehicle_plate || "",
      "السائق":        r.driver_name || "",
      "رقم المرجع":   r.reference_no || r.cargo_type || "",
      "الحالة":        REQ_STATUS[r.status]?.label || r.status,
      "التاريخ":       r.created_at?.slice(0, 10) || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "طلبات التوريد");
    XLSX.writeFile(wb, `supply-requests-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  /* ─ Derived data ─ */
  const pending   = trips.filter(t => t.status === "assigned");
  const inTransit = trips.filter(t => ["in_transit","loaded","delivered_to_warehouse","pending_warehouse_approval"].includes(t.status));
  const received  = trips.filter(t => t.status === "completed");

  const foPendingPermit = factoryOrders.filter(o => o.status === "pending_permit");
  const foPermitIssued  = factoryOrders.filter(o => o.status === "permit_issued");
  const foLoaded        = factoryOrders.filter(o => o.status === "loaded");
  const foFiltered      = foStatusFilter === "all" ? factoryOrders : factoryOrders.filter(o => o.status === foStatusFilter);
  const pendingWOCount  = pendingWO.filter(o => o.stage === "fsohat_pending").length;


  /* helper: render invoice file (image or PDF link) */
  const renderInvoice = (url: string, label = "ملف الفاتورة") => {
    const isPdf = url.toLowerCase().includes(".pdf") || url.toLowerCase().includes("application/pdf");
    return isPdf ? (
      <a href={url} target="_blank" rel="noreferrer"
        className="flex items-center gap-2 text-indigo-700 underline text-sm font-semibold">
        <FileText size={14} className="text-indigo-500" />{label}
        <Download size={13} className="text-indigo-400" />
      </a>
    ) : (
      <div className="relative inline-block">
        <img src={url} alt={label} className="max-h-40 rounded-xl border border-gray-200 object-contain cursor-pointer"
          onClick={() => window.open(url, "_blank")} />
        <a href={url} download className="absolute top-1 end-1 bg-white/80 backdrop-blur rounded-full p-1 shadow">
          <Download size={12} className="text-gray-600" />
        </a>
      </div>
    );
  };

  const renderCard = (r: SupplyTrip) => {
    const sc = REQ_STATUS[r.status] || { label: r.status, color: "bg-gray-100 text-gray-600" };
    const isOpen   = confirmId === r.id;
    const isEditing = editId === r.id;
    const refLabel  = r.reference_no || r.cargo_type || null;
    const canEdit   = r.status === "in_transit";

    return (
      <div key={r.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${selected.has(r.id) ? "border-indigo-400 ring-2 ring-indigo-200" : "border-gray-100"}`}>
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            {selectionMode && (
              <input type="checkbox" checked={selected.has(r.id)}
                onChange={e => setSelected(s => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })}
                className="mt-1 w-4 h-4 accent-indigo-600 flex-shrink-0 cursor-pointer" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${sc.color}`}>{sc.label}</span>
                {r.priority === "urgent" && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">عاجل</span>
                )}
              </div>
              <div className="font-bold text-gray-900 text-base">{r.product_name}</div>
              <div className="text-sm text-gray-500 mt-0.5">
                {r.requested_qty?.toLocaleString("ar-SA")} {r.unit}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                {r.warehouse_name && <span>🏭 {r.warehouse_name}</span>}
                {r.vehicle_plate  && <span>🚛 {r.vehicle_plate}</span>}
                {r.driver_name    && <span>👤 {r.driver_name}</span>}
                {r.driver_phone   && <span>📞 {r.driver_phone}</span>}
                {r.cargo_items?.length
                  ? r.cargo_items.map((item, index) => (
                    <span key={`${item.cargo_type}-${index}`}>📦 {item.cargo_type}{item.quantity != null ? ` — ${item.quantity}` : ""}</span>
                  ))
                  : r.cargo_type && <span>📦 نوع الحمولة: <strong>{r.cargo_type}</strong></span>}
                {refLabel         && <span className="text-indigo-600 font-semibold">🔖 رقم المرجع: {refLabel}</span>}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              {r.status === "assigned" && (
                <button
                  onClick={() => {
                    setConfirmId(isOpen ? null : r.id);
                    setForm({ reference_no: r.reference_no || r.cargo_type || "", invoice_file: null, invoice_files: [], invoice_preview: "" });
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors">
                  <CheckCircle size={14} />
                  {isOpen ? "إلغاء" : "تأكيد وإرسال"}
                </button>
              )}
              {canEdit && (
                <>
                  <button
                    onClick={() => {
                      setEditId(isEditing ? null : r.id);
                      setEditForm({ reference_no: r.reference_no || r.cargo_type || "", invoice_file: null, invoice_files: [], invoice_preview: "" });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-xl hover:bg-amber-100 transition-colors">
                    <Pencil size={12} />{isEditing ? "إلغاء" : "تعديل"}
                  </button>
                  <button
                    onClick={() => recallTrip(r.supply_request_id, r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-xl hover:bg-red-100 transition-colors">
                    <Trash2 size={12} />سحب
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ─ Supervisor permits and final fsohat permits ─ */}
          {r.attachments?.length ? r.attachments
            .filter(attachment => attachment.kind === "supervisor_permit" || attachment.kind === "fsohat_permit")
            .map((attachment, index) => {
              const isSupervisorPermit = attachment.kind === "supervisor_permit";
              const label = isSupervisorPermit ? "فسحة المشرف" : "الفسحة النهائية من مسؤول الفسوحات";
              return (
                <div key={`${attachment.kind}-${attachment.url}-${index}`}
                  className={`mt-3 p-3 rounded-xl border ${isSupervisorPermit ? "bg-teal-50 border-teal-100" : "bg-indigo-50 border-indigo-100"}`}>
                  <p className={`text-xs font-semibold mb-2 ${isSupervisorPermit ? "text-teal-700" : "text-indigo-600"}`}>
                    📎 {label}{attachment.file_name ? ` — ${attachment.file_name}` : ""}
                  </p>
                  {renderInvoice(attachment.url, label)}
                </div>
              );
            })
            : <>
              {r.permit_image_url && (
                <div className="mt-3 p-3 bg-teal-50 rounded-xl border border-teal-100">
                  <p className="text-xs font-semibold text-teal-700 mb-2">📎 فسحة المشرف</p>
                  {renderInvoice(r.permit_image_url, "فسحة المشرف")}
                </div>
              )}
              {r.invoice_image && (
                <div className="mt-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                  <p className="text-xs font-semibold text-indigo-600 mb-2">📎 الفسحة النهائية من مسؤول الفسوحات</p>
                  {renderInvoice(r.invoice_image, "الفسحة النهائية من مسؤول الفسوحات")}
                </div>
              )}
            </>}
        </div>

        {/* ─ Confirm panel (for assigned trips) ─ */}
        {isOpen && (
          <div className="border-t border-gray-100 p-4 bg-indigo-50/60 space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                رقم المرجع <span className="text-red-500">*</span>
              </label>
              <input
                value={form.reference_no}
                onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))}
                placeholder="مثال: REF-2026-001"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {r.routing_dispatch_id ? "ملفات الفسح (صور أو PDF — اختياري، حتى 20 ملفًا)" : "ملف الفاتورة (صورة أو PDF — اختياري)"}
              </label>
              <div
                className="border-2 border-dashed border-indigo-200 rounded-xl p-4 text-center cursor-pointer hover:bg-white transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files);
                  if (r.routing_dispatch_id) handleFiles(files); else if (files[0]) handleFile(files[0]);
                }}>
                {form.invoice_file ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                    {form.invoice_preview
                      ? <img src={form.invoice_preview} alt="" className="max-h-24 rounded-lg object-contain" />
                      : <FileText size={20} className="text-indigo-500" />
                    }
                    <span className="font-semibold truncate max-w-xs">{form.invoice_file.name}</span>
                    <button type="button"
                      onClick={ev => { ev.stopPropagation(); setForm(f => ({ ...f, invoice_file: null, invoice_files: [], invoice_preview: "" })); }}
                      className="text-red-400 hover:text-red-600"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="text-indigo-400">
                    <Upload size={24} className="mx-auto mb-1" />
                    <p className="text-sm font-semibold">اضغط أو اسحب — صورة أو PDF</p>
                  </div>
                )}
              </div>
              {form.invoice_files.length > 1 && (
                <p className="mt-1 text-xs text-gray-500">
                  تم اختيار {form.invoice_files.length} ملفات: {form.invoice_files.map(file => file.name).join("، ")}
                </p>
              )}
              <input ref={fileRef} type="file" multiple={!!r.routing_dispatch_id} accept="image/*,application/pdf" className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  if (r.routing_dispatch_id) handleFiles(files); else if (files[0]) handleFile(files[0]);
                }} />
            </div>
            <button
              type="button"
              onClick={() => confirmRequest(r.supply_request_id, r)}
              disabled={saving || !form.reference_no}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              <Truck size={15} />
              {saving ? "جاري الإرسال..." : "تأكيد — السيارة في الطريق"}
            </button>
          </div>
        )}

        {/* ─ Edit panel (for in_transit trips) ─ */}
        {isEditing && (
          <div className="border-t border-gray-100 p-4 bg-amber-50/60 space-y-3">
            <p className="text-xs font-bold text-amber-700">تعديل بيانات الرحلة</p>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">رقم المرجع</label>
              <input
                value={editForm.reference_no}
                onChange={e => setEditForm(f => ({ ...f, reference_no: e.target.value }))}
                placeholder="رقم المرجع..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {r.routing_dispatch_id ? "استبدال ملفات الفسح (اختياري)" : "استبدال ملف الفاتورة (اختياري)"}
              </label>
              <div
                className="border-2 border-dashed border-amber-200 rounded-xl p-3 text-center cursor-pointer hover:bg-white transition-colors"
                onClick={() => editFileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files);
                  if (r.routing_dispatch_id) handleEditFiles(files); else if (files[0]) handleEditFile(files[0]);
                }}>
                {editForm.invoice_file ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                    {editForm.invoice_preview
                      ? <img src={editForm.invoice_preview} alt="" className="max-h-16 rounded-lg object-contain" />
                      : <FileText size={16} className="text-amber-500" />
                    }
                    <span className="truncate max-w-xs text-xs">{editForm.invoice_file.name}</span>
                    <button type="button"
                      onClick={ev => { ev.stopPropagation(); setEditForm(f => ({ ...f, invoice_file: null, invoice_files: [], invoice_preview: "" })); }}
                      className="text-red-400"><X size={13} /></button>
                  </div>
                ) : (
                  <div className="text-amber-500 text-sm">
                    <Upload size={16} className="mx-auto mb-0.5" />اضغط لاستبدال الملف
                  </div>
                )}
              </div>
              {editForm.invoice_files.length > 1 && (
                <p className="mt-1 text-xs text-gray-500">
                  تم اختيار {editForm.invoice_files.length} ملفات: {editForm.invoice_files.map(file => file.name).join("، ")}
                </p>
              )}
              <input ref={editFileRef} type="file" multiple={!!r.routing_dispatch_id} accept="image/*,application/pdf" className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  if (r.routing_dispatch_id) handleEditFiles(files); else if (files[0]) handleEditFile(files[0]);
                }} />
            </div>
            <button
              type="button"
                onClick={() => updateTrip(r.supply_request_id, r)}
              disabled={editSaving}
              className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl disabled:opacity-40 transition-colors text-sm">
              <CheckCircle size={14} />{editSaving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
          <LayoutDashboard size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">مسؤل الفسوحات</h1>
          <p className="text-xs text-gray-400">مراجعة طلبات التوريد وطلبيات المصنع</p>
        </div>
      </div>

      {/* ── Dashboard Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={Clock}         label="بانتظار تأكيدك"   value={pending.length}           color="bg-amber-100 text-amber-800"  />
        <StatCard icon={Truck}         label="في الطريق"         value={inTransit.length}          color="bg-blue-100 text-blue-800"   />
        <StatCard icon={ClipboardList} label="فسحات بانتظار"    value={foPendingPermit.length}    color="bg-orange-100 text-orange-800" />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {([
          ["requests", "طلبات التوريد",   pending.length],
          ["factory",  "طلبيات المصنع",   foPendingPermit.length + pendingWOCount],
        ] as const).map(([k, label, badge]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`relative px-4 py-2 text-sm font-semibold rounded-lg transition-all ${tab === k ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
            {badge > 0 && (
              <span className="absolute -top-1 -start-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════
          TAB: طلبيات المصنع (Factory Orders)
      ════════════════════════════════════ */}
      {tab === "factory" && (
        <div className="space-y-4">

          {/* ─ Pending workflow orders (سائب after rep approval) ─ */}
          {pendingWO.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 font-bold text-orange-800 text-sm">
                <Package size={15} className="text-orange-500" />
                طلبيات سائب وافق عليها المندوب — بانتظار إصدار الفسحة
                <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{pendingWOCount}</span>
              </h3>
              {pendingWO.map(wo => {
                const isProcessing = wo.stage === "fsohat_processing";
                return (
                  <div key={wo.id} className={`rounded-2xl border p-4 flex items-start justify-between gap-3 ${isProcessing ? "bg-indigo-50 border-indigo-200" : "bg-orange-50 border-orange-200"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isProcessing ? "bg-indigo-100 text-indigo-700" : "bg-orange-100 text-orange-700"}`}>
                          {isProcessing ? "جارٍ إصدار الفسحة" : "بانتظار الفسحة"}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">{wo.order_number}</span>
                      </div>
                      <div className="font-bold text-gray-900">
                        🚛 {wo.product_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {wo.quantity > 0 && `${wo.quantity.toLocaleString("ar-SA")} ${wo.unit} · `}
                        {wo.customer_name || wo.customer_phone}
                        {wo.delivery_location && ` · 📍 ${wo.delivery_location}`}
                      </div>
                    </div>
                    {!isProcessing && (
                      <button
                        onClick={() => convertToFactoryOrder(wo.id)}
                        disabled={pwConverting === wo.id}
                        className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 flex-shrink-0"
                      >
                        <ClipboardList size={13} />
                        {pwConverting === wo.id ? "جاري..." : "إنشاء طلبية مصنع"}
                      </button>
                    )}
                    {isProcessing && (
                      <span className="text-xs text-indigo-600 font-semibold flex-shrink-0 mt-1">تم الإحالة ✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ─ Action bar ─ */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Status filter */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {(["all","pending_permit","permit_issued","loaded","delivered"] as const).map(s => (
                <button key={s} onClick={() => setFoStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${foStatusFilter === s ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {s === "all" ? `الكل (${factoryOrders.length})` : (FO_STATUS[s]?.label || s)}
                </button>
              ))}
            </div>
            <button onClick={() => setShowCreateFo(v => !v)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors">
              <Plus size={15} />طلبية جديدة
            </button>
          </div>

          {/* ─ Create form ─ */}
          {showCreateFo && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-indigo-800 flex items-center gap-2"><ClipboardList size={16} />إنشاء طلبية مصنع</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">رقم اللوحة</label>
                  <select value={foForm.vehicle_plate}
                    onChange={e => {
                      const v = vehicles.find(vv => vv.plate_number === e.target.value);
                      setFoForm(f => ({ ...f, vehicle_plate: e.target.value, driver_name: v?.driver_name || "" }));
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="">اختر سيارة...</option>
                    {vehicles.filter(v => v.status === "available" || v.status === "busy").map(v => (
                      <option key={v.id} value={v.plate_number}>{v.plate_number} — {v.vehicle_type}{v.driver_name ? ` (${v.driver_name})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">اسم السائق</label>
                  <input value={foForm.driver_name} onChange={e => setFoForm(f => ({ ...f, driver_name: e.target.value }))}
                    placeholder="اسم السائق" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">المنتج <span className="text-red-500">*</span></label>
                  <input value={foForm.product_name} onChange={e => setFoForm(f => ({ ...f, product_name: e.target.value }))}
                    placeholder="مثال: أسمنت بركاني" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-700 block mb-1">الكمية</label>
                    <input type="number" value={foForm.quantity} onChange={e => setFoForm(f => ({ ...f, quantity: e.target.value }))}
                      placeholder="0" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <div className="w-20">
                    <label className="text-xs font-bold text-gray-700 block mb-1">الوحدة</label>
                    <select value={foForm.unit} onChange={e => setFoForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      {["طن","كيس","رحلة"].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-gray-700 block mb-1">موقع التسليم</label>
                  <input value={foForm.delivery_site} onChange={e => setFoForm(f => ({ ...f, delivery_site: e.target.value }))}
                    placeholder="مثال: مشروع الرياض — حي النرجس" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-gray-700 block mb-1">ملاحظات</label>
                  <input value={foForm.notes} onChange={e => setFoForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="ملاحظات إضافية..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowCreateFo(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-white">إلغاء</button>
                <button onClick={createFactoryOrder} disabled={foSaving || !foForm.product_name}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
                  {foSaving ? "جاري الإرسال..." : "إنشاء الطلبية"}
                </button>
              </div>
            </div>
          )}

          {/* ─ Orders list ─ */}
          {foLoad ? (
            <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
          ) : foFiltered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <ClipboardList size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400">لا توجد طلبيات</p>
            </div>
          ) : (
            <div className="space-y-3">
              {foFiltered.map(fo => {
                const st = FO_STATUS[fo.status] || { label: fo.status, color: "bg-gray-100 text-gray-600" };
                const isPermitOpen  = permitId  === fo.id;
                const isEditSite    = editSiteId === fo.id;
                return (
                  <div key={fo.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Status + order number */}
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.color}`}>{st.label}</span>
                            <span className="text-xs text-gray-400 font-mono">{fo.order_number}</span>
                          </div>
                          {/* Product */}
                          <div className="font-bold text-gray-900">{fo.product_name}</div>
                          <div className="text-sm text-gray-500">{fo.quantity > 0 ? `${fo.quantity.toLocaleString("ar-SA")} ${fo.unit}` : ""}</div>
                          {/* Vehicle + driver */}
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                            {fo.vehicle_plate && <span>🚛 {fo.vehicle_plate}</span>}
                            {fo.driver_name   && <span>👤 {fo.driver_name}</span>}
                            {fo.delivery_site && <span>📍 {fo.delivery_site}</span>}
                          </div>
                          {/* Permit info */}
                          {fo.permit_number && (
                            <div className="mt-1.5 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-2.5 py-1.5">
                              <FileText size={11} />رقم الفسحة: <strong className="font-mono">{fo.permit_number}</strong>
                              {fo.permit_doc_url && (
                                <a href={fo.permit_doc_url} target="_blank" rel="noreferrer"
                                  className="underline mr-1">عرض الوثيقة</a>
                              )}
                            </div>
                          )}
                          {/* Loading order */}
                          {fo.loading_order_url && (
                            <div className="mt-1.5 flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 rounded-lg px-2.5 py-1.5">
                              <Truck size={11} />أمر التحميل:
                              <a href={fo.loading_order_url} target="_blank" rel="noreferrer" className="underline">عرض</a>
                              <span className="text-gray-400">{fo.loading_confirmed_at?.slice(0,10)}</span>
                            </div>
                          )}
                        </div>
                        {/* Action buttons */}
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          {fo.status === "pending_permit" && (
                            <button onClick={() => { setPermitId(isPermitOpen ? null : fo.id); setPermitForm({ permit_number: fo.permit_number || "" }); setPermitFile(null); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors">
                              <Upload size={12} />رفع الفسحة
                            </button>
                          )}
                          {(fo.status === "permit_issued" || fo.status === "loaded") && (
                            <button onClick={() => { setPermitId(isPermitOpen ? null : fo.id); setPermitForm({ permit_number: fo.permit_number || "" }); setPermitFile(null); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-colors">
                              <FileText size={12} />تعديل الفسحة
                            </button>
                          )}
                          <button onClick={() => { setEditSiteId(isEditSite ? null : fo.id); setEditSiteVal(fo.delivery_site || ""); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-colors">
                            <MapPin size={12} />
                            {fo.delivery_site ? "تعديل الموقع" : "تحديد الموقع"}
                          </button>
                        </div>
                      </div>

                      {/* ─ Edit delivery site ─ */}
                      {isEditSite && (
                        <div className="mt-3 flex gap-2">
                          <input value={editSiteVal} onChange={e => setEditSiteVal(e.target.value)}
                            placeholder="موقع التسليم الجديد..."
                            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                          <button onClick={() => saveDeliverySite(fo.id)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">حفظ</button>
                          <button onClick={() => setEditSiteId(null)}
                            className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500"><X size={13} /></button>
                        </div>
                      )}
                    </div>

                    {/* ─ Permit upload panel ─ */}
                    {isPermitOpen && (
                      <div className="border-t border-gray-100 p-4 bg-amber-50/60 space-y-3">
                        <div>
                          <label className="text-xs font-bold text-gray-700 block mb-1">رقم الفسحة <span className="text-red-500">*</span></label>
                          <input value={permitForm.permit_number}
                            onChange={e => setPermitForm(f => ({ ...f, permit_number: e.target.value }))}
                            placeholder="مثال: FSH-2026-0001"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-700 block mb-1">صورة / وثيقة الفسحة (اختياري)</label>
                          <div className="border-2 border-dashed border-amber-200 rounded-xl p-3 text-center cursor-pointer hover:bg-white transition-colors"
                            onClick={() => permitFileRef.current?.click()}>
                            {permitFile ? (
                              <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                                <FileText size={16} className="text-amber-500" />{permitFile.name}
                                <button onClick={ev => { ev.stopPropagation(); setPermitFile(null); }} className="text-red-400"><X size={12} /></button>
                              </div>
                            ) : (
                              <div className="text-amber-500 text-sm"><Upload size={18} className="mx-auto mb-1" />اضغط لاختيار ملف</div>
                            )}
                          </div>
                          <input ref={permitFileRef} type="file" accept="image/*,application/pdf" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) setPermitFile(f); }} />
                        </div>
                        <button onClick={uploadPermit} disabled={permitSaving || !permitForm.permit_number}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl disabled:opacity-40 transition-colors text-sm">
                          <CheckCircle size={15} />{permitSaving ? "جاري الرفع..." : "رفع الفسحة — إشعار السائق"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════
          TAB 1 — Supply Requests
      ════════════════════════════════════ */}
      {tab === "requests" && (
        <>
          {/* ── طلبات المناديب — بانتظار رفع الفسحة ── */}
          {repReqs.length > 0 && (
            <div className="bg-white rounded-2xl border border-purple-100 shadow-sm overflow-hidden mb-4">
              <div className="bg-purple-50 border-b border-purple-100 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-purple-800 text-sm">📄 طلبات المناديب — رفع الفسحة</span>
                  <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-bold">{repReqs.length}</span>
                </div>
                <button onClick={loadRepReqs} className="text-xs text-purple-500 hover:text-purple-700 font-semibold">تحديث</button>
              </div>
              <div className="divide-y divide-gray-50">
                {repReqs.map(r => (
                  <div key={r.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-gray-900 text-sm">📦 {r.product_name}</div>
                        <div className="font-mono text-xs text-gray-400">{r.request_no}</div>
                      </div>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">بانتظار الفسحة</span>
                    </div>
                    {r.loading_locations?.length > 0 && (
                      <div className="text-xs text-gray-600">📍 {r.loading_locations.join(" · ")}</div>
                    )}
                    {r.delivery_location && (
                      <div className="text-xs text-indigo-700 break-all">🗺️ {r.delivery_location}</div>
                    )}
                    {(r.vehicle_plate || r.driver_name) && (
                      <div className="flex flex-wrap gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                        {r.vehicle_plate && <span>🚛 {r.vehicle_plate}</span>}
                        {r.driver_name   && <span>👨‍✈️ {r.driver_name}</span>}
                        {r.driver_phone  && (
                          <a href={`https://wa.me/966${r.driver_phone.replace(/^0/,"")}`} target="_blank" rel="noreferrer" className="text-green-600 underline font-bold">واتساب</a>
                        )}
                      </div>
                    )}
                    {/* Permit upload for this rep request */}
                    {permitRepId === r.id ? (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-purple-700">رفع صورة الفسحة</p>
                        <div
                          className="border-2 border-dashed border-purple-200 rounded-xl p-3 text-center cursor-pointer hover:bg-white transition-colors"
                          onClick={() => permitRepRef.current?.click()}>
                          {permitRepFile ? (
                            <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                              <span>{permitRepFile.name}</span>
                              <button onClick={e => { e.stopPropagation(); setPermitRepFile(null); }} className="text-red-400">✕</button>
                            </div>
                          ) : (
                            <div className="text-purple-500 text-sm">📤 اضغط لاختيار صورة الفسحة</div>
                          )}
                        </div>
                        <input ref={permitRepRef} type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) setPermitRepFile(f); }} />
                        <div className="flex gap-2">
                          <button onClick={() => { setPermitRepId(null); setPermitRepFile(null); }}
                            className="flex-1 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50">إلغاء</button>
                          <button onClick={uploadRepPermit} disabled={permitRepSaving || !permitRepFile}
                            className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 disabled:opacity-60">
                            {permitRepSaving ? "جارٍ الرفع..." : "✓ رفع الفسحة"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPermitRepId(r.id)}
                        className="w-full py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 flex items-center justify-center gap-2">
                        📤 رفع الفسحة
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── فلاتر الحالة (قابلة للضغط) ── */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setReqFilter(null)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${reqFilter === null ? "bg-gray-700 text-white border-gray-700" : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"}`}>
              الكل ({trips.length})
            </button>
            {([
              { s: "assigned",              label: "بانتظار تأكيدك",  active: "bg-amber-500 text-white border-amber-500",  idle: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200" },
              { s: "in_transit",            label: "في الطريق 🚛",    active: "bg-blue-500 text-white border-blue-500",    idle: "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200" },
              { s: "delivered_to_warehouse",label: "وصل المستودع",    active: "bg-teal-500 text-white border-teal-500",    idle: "bg-teal-100 text-teal-700 border-teal-200 hover:bg-teal-200" },
              { s: "completed",             label: "مكتمل ✓",         active: "bg-green-500 text-white border-green-500",  idle: "bg-green-100 text-green-700 border-green-200 hover:bg-green-200" },
            ] as const).map(({ s, label, active, idle }) => {
              const cnt = trips.filter(t => t.status === s).length;
              const isActive = reqFilter === s;
              return (
                <button key={s} onClick={() => setReqFilter(isActive ? null : s)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${isActive ? active : idle}`}>
                  {label} ({cnt})
                </button>
              );
            })}
          </div>

          {/* ─ Action bar ─ */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">{trips.length} طلب إجمالاً</span>
              {/* تحديد / إلغاء */}
              <button
                onClick={() => { setSelectionMode(m => !m); setSelected(new Set()); setShowTrash(false); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${selectionMode ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"}`}>
                {selectionMode ? "✕ إلغاء التحديد" : "☑ تحديد"}
              </button>
              {/* سلة المحذوفات */}
              <button
                onClick={() => { setShowTrash(t => !t); if (!showTrash) loadArchivedTrips(); setSelectionMode(false); setSelected(new Set()); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${showTrash ? "bg-red-600 text-white border-red-600" : "bg-white text-red-500 border-red-200 hover:bg-red-50"}`}>
                🗑 سلة المحذوفات {archivedTrips.length > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 py-0 text-[10px] font-bold">{archivedTrips.length}</span>}
              </button>
            </div>
            <button
              onClick={exportExcel}
              disabled={trips.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40">
              <FileDown size={14} />تصدير Excel
            </button>
          </div>

          {/* ─ Bulk action toolbar ─ */}
          {selectionMode && (
            <div className="flex items-center gap-2 flex-wrap p-3 bg-indigo-50 border border-indigo-200 rounded-2xl">
              <span className="text-xs font-bold text-indigo-700 flex-1">
                {selected.size > 0 ? `${selected.size} طلب محدد` : "اختر طلبات من القائمة"}
              </span>
              <button
                onClick={() => setSelected(new Set(trips.map(t => t.id)))}
                className="px-3 py-1.5 text-xs font-bold bg-white border border-indigo-200 text-indigo-700 rounded-xl hover:bg-indigo-100">
                تحديد الكل
              </button>
              <button
                disabled={!selected.size || bulkSaving}
                onClick={bulkArchive}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40 transition-colors">
                🗑 أرشفة المحددة ({selected.size})
              </button>
            </div>
          )}

          {reqLoad ? (
            <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
          ) : trips.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Package size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400">لا توجد طلبات</p>
            </div>
          ) : (() => {
            const visible = reqFilter ? trips.filter(t => t.status === reqFilter) : trips;
            return visible.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">لا توجد طلبات بهذه الحالة</div>
            ) : (
              <div className="space-y-3">
                {visible.map(r => renderCard(r))}
              </div>
            );
          })()}

          {/* ─ سلة المحذوفات (Archived trips) ─ */}
          {showTrash && (
            <div className="mt-2 space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-red-100">
                <span className="text-sm font-bold text-red-700">🗑 سلة المحذوفات</span>
                {archivedTrips.length > 0 && (
                  <button
                    disabled={bulkSaving}
                    onClick={() => bulkHardDelete(archivedTrips.map(t => t.id))}
                    className="ms-auto text-xs text-red-500 hover:text-red-700 font-bold disabled:opacity-40">
                    حذف الكل نهائياً
                  </button>
                )}
              </div>
              {archivedTrips.length === 0 ? (
                <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-400 text-sm">السلة فارغة</div>
              ) : (
                archivedTrips.map(r => {
                  const sc = REQ_STATUS[r.status] || { label: r.status, color: "bg-gray-100 text-gray-600" };
                  const refLabel = r.reference_no || r.cargo_type || null;
                  return (
                    <div key={r.id} className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 opacity-80">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${sc.color}`}>{sc.label}</span>
                          </div>
                          <div className="font-bold text-gray-800 text-sm">{r.product_name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {r.requested_qty?.toLocaleString("ar-SA")} {r.unit}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-gray-400">
                            {r.warehouse_name && <span>🏭 {r.warehouse_name}</span>}
                            {r.vehicle_plate  && <span>🚛 {r.vehicle_plate}</span>}
                            {r.driver_name    && <span>👤 {r.driver_name}</span>}
                            {refLabel         && <span className="text-indigo-500">🔖 {refLabel}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button
                            disabled={bulkSaving}
                            onClick={() => bulkRestore([r.id])}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 disabled:opacity-40 transition-colors">
                            ↩ استرجاع
                          </button>
                          <button
                            disabled={bulkSaving}
                            onClick={() => bulkHardDelete([r.id])}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 disabled:opacity-40 transition-colors">
                            🗑 حذف نهائي
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

    </div>
  );
}
