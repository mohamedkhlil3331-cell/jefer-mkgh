import { useState, useEffect, useRef } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { Plus, X, Package, Truck, CheckCircle, Clock, XCircle, AlertTriangle, RefreshCw, Search, MapPin, UserCheck, FileText, Upload, Eye, Car, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type SupplyRequest = {
  id: number; product_name: string; requested_qty: number; unit: string;
  trailer_loads: number; status: string; priority: string; notes?: string;
  destination_division?: string; requested_by?: string;
  external_customer_name?: string; external_customer_phone?: string;
  vehicle_plate?: string; driver_name?: string; driver_phone?: string;
  reference_no?: string; created_at: string;
};
type RepRequest = {
  id: number; request_no: string; product_name: string;
  loading_locations: string[]; delivery_location: string | null;
  rep_name: string | null; rep_phone: string | null;
  status: string; vehicle_plate: string | null;
  driver_name: string | null; driver_phone: string | null;
  permit_photo_url: string | null; invoice_photo_url: string | null;
  notes: string | null; created_by: string | null; created_at: string;
};
type Product = { id: number; name: string; unit: string; category: string; };
type Rep = { id: number; name: string; phone: string; };
type Vehicle = { id: number; plate_number: string; vehicle_type: string; status: string; branch?: string | null; driver_name?: string; driver_phone?: string; linked_user_name?: string; linked_user_phone?: string; last_delivery_location?: string | null; last_delivery_date?: string | null; };
type Driver  = { id?: number; name: string; phone: string; };

const VEH_STATUS_AR:    Record<string, string> = { available: "متاح", busy: "مشغول", maintenance: "صيانة", broken: "معطل", on_trip: "في رحلة" };
const VEH_STATUS_COLOR: Record<string, string> = {
  available:   "bg-green-50 text-green-700 border-green-200",
  busy:        "bg-blue-50 text-blue-700 border-blue-200",
  on_trip:     "bg-blue-50 text-blue-700 border-blue-200",
  maintenance: "bg-amber-50 text-amber-700 border-amber-200",
  broken:      "bg-red-50 text-red-700 border-red-200",
};

const STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:          { label: "بانتظار الموافقة",  color: "bg-yellow-100 text-yellow-800", icon: <Clock size={13}/> },
  approved:         { label: "موافق عليه",        color: "bg-blue-100 text-blue-800",    icon: <CheckCircle size={13}/> },
  assigned:         { label: "سيارة معيّنة",      color: "bg-indigo-100 text-indigo-800", icon: <Truck size={13}/> },
  in_transit:       { label: "في الطريق",         color: "bg-violet-100 text-violet-800", icon: <Truck size={13}/> },
  loaded:           { label: "تم التحميل",        color: "bg-cyan-100 text-cyan-800",    icon: <Package size={13}/> },
  delivered_to_warehouse: { label: "وصل المستودع", color: "bg-teal-100 text-teal-800",  icon: <CheckCircle size={13}/> },
  completed:        { label: "مكتمل",             color: "bg-green-100 text-green-800",  icon: <CheckCircle size={13}/> },
  cancelled:        { label: "ملغى",              color: "bg-red-100 text-red-800",      icon: <XCircle size={13}/> },
};

const REP_STATUS: Record<string, { label: string; color: string }> = {
  pending:          { label: "⏳ بانتظار تعيين سيارة",  color: "bg-amber-100 text-amber-800" },
  vehicle_assigned: { label: "🚛 سيارة معيّنة — بانتظار الفسحة", color: "bg-blue-100 text-blue-800" },
  permit_uploaded:  { label: "📄 الفسحة صادرة — بانتظار التحميل", color: "bg-purple-100 text-purple-800" },
  loaded:           { label: "📦 تم التحميل — في الطريق",  color: "bg-indigo-100 text-indigo-800" },
  delivered:        { label: "✅ تم التسليم",             color: "bg-green-100 text-green-800" },
  cancelled:        { label: "❌ ملغى",                   color: "bg-red-100 text-red-800" },
};

const UNITS = ["وحدة","طن","متر","م²","م³","لتر","كرتون","صندوق","رولة","قطعة"];

const EMPTY_SUPPLY = {
  external_customer_name: "", external_customer_phone: "",
  product_name: "", requested_qty: "", unit: "وحدة",
  trailer_loads: "1", destination_division: "", priority: "normal", notes: "",
};

const FILTERS = [
  { key: "all",        label: "الكل" },
  { key: "pending",    label: "بانتظار الموافقة" },
  { key: "assigned",   label: "سيارة معيّنة" },
  { key: "in_transit", label: "في الطريق" },
  { key: "completed",  label: "مكتمل" },
  { key: "cancelled",  label: "ملغى" },
];

export default function CraneSupervisorPage() {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useRememberedState("crane-supervisor-main-tab", "supply" as "supply" | "rep");

  // ── Supply requests state ──────────────────────────────────────────────────
  const [requests,     setRequests]     = useState<SupplyRequest[]>([]);
  const [showForm,     setShowForm]     = useState(false);
  const [form,         setForm]         = useState({ ...EMPTY_SUPPLY });
  const [saving,       setSaving]       = useState(false);
  const [loadingData,  setLoadingData]  = useState(true);
  const [filterStatus, setFilterStatus] = useRememberedState("crane-supervisor-status-filter", "all");

  // ── Crane assign enabled (admin-controlled) ────────────────────────────────
  const [craneAssignEnabled, setCraneAssignEnabled] = useState(true);
  const [craneAssignSaving,  setCraneAssignSaving]  = useState(false);

  // ── Rep requests state ─────────────────────────────────────────────────────
  const [repRequests,       setRepRequests]       = useState<RepRequest[]>([]);
  const [showRepForm,       setShowRepForm]       = useState(false);
  const [products,          setProducts]          = useState<Product[]>([]);
  const [reps,              setReps]              = useState<Rep[]>([]);
  const [vehicles,          setVehicles]          = useState<Vehicle[]>([]);
  const [drivers,           setDrivers]           = useState<Driver[]>([]);
  const [repAssignModal,    setRepAssignModal]    = useState<RepRequest | null>(null);
  const [repAssignForm,     setRepAssignForm]     = useState({ vehicle_plate: "", driver_name: "", driver_phone: "" });
  const [repAssignSubmit,   setRepAssignSubmit]   = useState(false);
  const [repAssignSuccess,  setRepAssignSuccess]  = useState(false);
  const [repSaving,    setRepSaving]    = useState(false);
  const [repLoading,   setRepLoading]   = useState(false);
  const [prodSearch,   setProdSearch]   = useState("");
  const [prodDropOpen, setProdDropOpen] = useState(false);
  const [repFilter,    setRepFilter]    = useRememberedState("crane-supervisor-rep-filter", "all");

  // Rep form state
  const EMPTY_REP = { product_name: "", loading_locations: [""], delivery_location: "", rep_name: "", rep_phone: "", notes: "" };
  const [repForm, setRepForm] = useState({ ...EMPTY_REP });

  // ── Load functions ─────────────────────────────────────────────────────────
  const loadSupply = () => {
    setLoadingData(true);
    fetch(`/api/supply-requests?requested_by=${encodeURIComponent(user?.phone || "")}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setRequests(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingData(false));
  };

  const loadRepRequests = () => {
    setRepLoading(true);
    fetch(`/api/rep-requests?created_by=${encodeURIComponent(user?.phone || "")}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setRepRequests(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setRepLoading(false));
  };

  const loadProducts  = () => fetch("/api/products").then(r => r.ok ? r.json() : []).then(d => setProducts(Array.isArray(d) ? d : [])).catch(() => {});
  const loadReps      = () => fetch("/api/reps").then(r => r.ok ? r.json() : []).then(d => setReps(Array.isArray(d) ? d : [])).catch(() => {});
  const loadVehicles  = () => fetch("/api/workflow/vehicles").then(r => r.ok ? r.json() : []).then(d => setVehicles(Array.isArray(d) ? d : [])).catch(() => {});
  const loadDrivers   = () => fetch("/api/workflow/drivers").then(r => r.ok ? r.json() : []).then(d => setDrivers(Array.isArray(d) ? d : [])).catch(() => {});

  const toggleCraneAssign = async (val: boolean) => {
    setCraneAssignSaving(true);
    setCraneAssignEnabled(val);
    try {
      await fetch("/api/supervisor-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` },
        body: JSON.stringify({ crane_assign_enabled: val ? 1 : 0 }),
      });
    } finally { setCraneAssignSaving(false); }
  };

  useEffect(() => {
    if (user) {
      loadSupply();
      loadRepRequests();
      loadProducts();
      loadReps();
      loadVehicles();
      loadDrivers();
      fetch("/api/supervisor-settings").then(r => r.json())
        .then(s => { if (s?.crane_assign_enabled !== undefined) setCraneAssignEnabled(!!s.crane_assign_enabled); })
        .catch(() => {});
    }
  }, [user]);

  // ── Supply request handlers ────────────────────────────────────────────────
  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submitSupply = async () => {
    if (!form.external_customer_name.trim()) { alert("يرجى إدخال اسم الزبون"); return; }
    if (!form.product_name.trim())           { alert("يرجى إدخال اسم المنتج"); return; }
    if (!form.requested_qty)                 { alert("يرجى إدخال الكمية"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/supply-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, requested_qty: parseFloat(form.requested_qty) || 0, trailer_loads: parseFloat(form.trailer_loads) || 1, requested_by: user?.phone }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ");
      setForm({ ...EMPTY_SUPPLY }); setShowForm(false); loadSupply();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const cancelReq = async (id: number) => {
    if (!window.confirm("هل تريد إلغاء هذا الطلب؟")) return;
    await fetch(`/api/supply-requests/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    loadSupply();
  };

  // ── Rep request handlers ───────────────────────────────────────────────────
  const addLoadingLoc = () => setRepForm(p => ({ ...p, loading_locations: [...p.loading_locations, ""] }));
  const removeLoadingLoc = (i: number) => setRepForm(p => ({ ...p, loading_locations: p.loading_locations.filter((_, idx) => idx !== i) }));
  const updateLoadingLoc = (i: number, v: string) => setRepForm(p => ({ ...p, loading_locations: p.loading_locations.map((l, idx) => idx === i ? v : l) }));

  const submitRepRequest = async () => {
    if (!repForm.product_name.trim()) { alert("يرجى اختيار المنتج"); return; }
    setRepSaving(true);
    try {
      const locs = repForm.loading_locations.filter(l => l.trim());
      const res = await fetch("/api/rep-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name:       repForm.product_name,
          loading_locations:  locs,
          delivery_location:  repForm.delivery_location || null,
          rep_name:           repForm.rep_name || null,
          rep_phone:          repForm.rep_phone || null,
          notes:              repForm.notes || null,
          created_by:         user?.phone,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في الإرسال");
      setRepForm({ ...EMPTY_REP }); setProdSearch(""); setShowRepForm(false); loadRepRequests();
    } catch (e) { alert((e as Error).message); }
    finally { setRepSaving(false); }
  };

  const cancelRepReq = async (id: number) => {
    if (!window.confirm("إلغاء هذا الطلب؟")) return;
    await fetch(`/api/rep-requests/${id}/cancel`, { method: "PUT" });
    loadRepRequests();
  };

  const assignRepVehicle = async () => {
    if (!repAssignModal || !repAssignForm.vehicle_plate) return;
    setRepAssignSubmit(true);
    try {
      const res = await fetch(`/api/rep-requests/${repAssignModal.id}/assign-vehicle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_plate: repAssignForm.vehicle_plate,
          driver_name:   repAssignForm.driver_name  || null,
          driver_phone:  repAssignForm.driver_phone || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في التعيين");
      setRepAssignSuccess(true);
      loadRepRequests();
      loadVehicles();
      setTimeout(() => {
        setRepAssignSuccess(false);
        setRepAssignModal(null);
        setRepAssignForm({ vehicle_plate: "", driver_name: "", driver_phone: "" });
      }, 1800);
    } catch (e) { alert((e as Error).message); }
    finally { setRepAssignSubmit(false); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = filterStatus === "all" ? requests : requests.filter(r => r.status === filterStatus);
  const filteredRep = repFilter === "all" ? repRequests : repRequests.filter(r => r.status === repFilter);

  const supplyStats = {
    total: requests.length,
    pending: requests.filter(r => r.status === "pending").length,
    active: requests.filter(r => ["approved","assigned","in_transit","loaded"].includes(r.status)).length,
    done: requests.filter(r => ["completed","delivered_to_warehouse"].includes(r.status)).length,
  };

  const repPending = repRequests.filter(r => !["delivered","cancelled"].includes(r.status)).length;

  const filteredProducts = prodSearch.trim()
    ? products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase()))
    : products.slice(0, 12);

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── Main header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-800">🏗️ مشرف حركة الدينه والأوناش</h1>
          <p className="text-sm text-gray-500 mt-0.5">إدارة طلبات التوريد وطلبات المناديب</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {user?.role === "admin" && (
            <button
              onClick={() => toggleCraneAssign(!craneAssignEnabled)}
              disabled={craneAssignSaving}
              title="تحكم في ظهور زر تعيين السيارة لمشرف الدينة"
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                craneAssignEnabled
                  ? "bg-green-50 text-green-700 border-green-300"
                  : "bg-red-50 text-red-600 border-red-200"
              }`}>
              {craneAssignEnabled
                ? <><ToggleRight size={18} className="text-green-600"/>تعيين السيارة: مفعّل</>
                : <><ToggleLeft  size={18} className="text-red-400"/>تعيين السيارة: موقوف</>}
            </button>
          )}
          <button onClick={() => { loadSupply(); loadRepRequests(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm">
            <RefreshCw size={14}/> تحديث
          </button>
          {mainTab === "supply" ? (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm">
              <Plus size={15}/> طلب توريد جديد
            </button>
          ) : (
            <button onClick={() => setShowRepForm(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#103c68] hover:bg-[#0d3158] text-white font-bold text-sm">
              <Plus size={15}/> طلب جديد للمندوب
            </button>
          )}
        </div>
      </div>

      {/* ── Main tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b border-gray-200 pb-1">
        {([
          { key: "supply", label: "طلبات التوريد",   emoji: "🏭" },
          { key: "rep",    label: "طلبات المناديب",   emoji: "👤", count: repPending },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              mainTab === t.key
                ? "bg-white shadow-sm text-[#103c68] border border-gray-100"
                : "text-gray-500 hover:text-gray-700"
            }`}>
            {t.emoji} {t.label}
            {"count" in t && t.count > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 rounded-full font-black">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ SUPPLY REQUESTS TAB ══ */}
      {mainTab === "supply" && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "إجمالي الطلبات",     value: supplyStats.total,   color: "text-gray-700",   bg: "bg-gray-50",   border: "border-gray-200" },
              { label: "بانتظار الموافقة",   value: supplyStats.pending, color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
              { label: "جارية / في الطريق", value: supplyStats.active,  color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" },
              { label: "مكتملة",            value: supplyStats.done,    color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-4 text-center`}>
                <div className={`text-3xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(fl => (
              <button key={fl.key} onClick={() => setFilterStatus(fl.key)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  filterStatus === fl.key
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
                }`}>{fl.label}</button>
            ))}
          </div>

          {/* List */}
          {loadingData ? (
            <div className="text-center py-12 text-gray-400 text-sm">جارٍ التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 space-y-2">
              <Package size={40} className="mx-auto opacity-30"/>
              <p className="text-sm">لا توجد طلبات</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(req => {
                const st = STATUS[req.status] ?? { label: req.status, color: "bg-gray-100 text-gray-700", icon: null };
                return (
                  <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                    <div className="flex flex-wrap items-start gap-2 justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-800">#{req.id} · {req.product_name}</span>
                          {req.priority === "urgent" && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <AlertTriangle size={10}/> عاجل
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {req.requested_qty} {req.unit}
                          {req.trailer_loads > 1 && ` · ${req.trailer_loads} ترلة`}
                          {req.destination_division && ` · 📍 ${req.destination_division}`}
                        </div>
                      </div>
                      <span className={`flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full ${st.color}`}>
                        {st.icon} {st.label}
                      </span>
                    </div>
                    {req.external_customer_name && (
                      <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-800 flex flex-wrap items-center gap-2">
                        👤 <strong>{req.external_customer_name}</strong>
                        {req.external_customer_phone && (
                          <a href={`tel:${req.external_customer_phone}`} className="text-amber-700 underline">📞 {req.external_customer_phone}</a>
                        )}
                      </div>
                    )}
                    {(req.vehicle_plate || req.driver_name) && (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 text-xs text-indigo-800 flex flex-wrap gap-3">
                        {req.vehicle_plate && <span>🚛 {req.vehicle_plate}</span>}
                        {req.driver_name   && <span>👨‍✈️ {req.driver_name}</span>}
                        {req.driver_phone  && (
                          <a href={`https://wa.me/966${req.driver_phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="text-green-600 font-bold underline">واتساب</a>
                        )}
                      </div>
                    )}
                    {req.notes && <p className="text-xs text-gray-400 italic">{req.notes}</p>}
                    <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-50">
                      <span>{new Date(req.created_at).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" })}</span>
                      {req.status === "pending" && (
                        <button onClick={() => cancelReq(req.id)} className="text-red-400 hover:text-red-600 font-bold">إلغاء الطلب</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ REP REQUESTS TAB ══ */}
      {mainTab === "rep" && (
        <div className="space-y-4">
          {/* Rep filter */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all",             label: "الكل" },
              { key: "pending",         label: "⏳ بانتظار السيارة" },
              { key: "vehicle_assigned",label: "🚛 بانتظار الفسحة" },
              { key: "permit_uploaded", label: "📄 بانتظار التحميل" },
              { key: "loaded",          label: "📦 في الطريق" },
              { key: "delivered",       label: "✅ مكتملة" },
            ].map(fl => (
              <button key={fl.key} onClick={() => setRepFilter(fl.key)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  repFilter === fl.key
                    ? "bg-[#103c68] text-white border-[#103c68]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-[#103c68]/30"
                }`}>{fl.label}</button>
            ))}
          </div>

          {/* Rep requests list */}
          {repLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">جارٍ التحميل...</div>
          ) : filteredRep.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <UserCheck size={40} className="mx-auto mb-3 text-gray-300"/>
              <p className="font-semibold text-gray-500">لا توجد طلبات مناديب</p>
              <button onClick={() => setShowRepForm(true)} className="mt-4 px-5 py-2 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d3158]">
                + إنشاء طلب جديد
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRep.map(req => {
                const st = REP_STATUS[req.status] ?? { label: req.status, color: "bg-gray-100 text-gray-700" };
                return (
                  <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Status bar */}
                    <div className={`px-4 py-2 text-xs font-bold flex items-center justify-between ${st.color}`}>
                      <span>{st.label}</span>
                      <span className="font-mono opacity-70">{req.request_no}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {/* Product */}
                      <div className="font-bold text-gray-900 text-base">📦 {req.product_name}</div>

                      {/* Loading locations */}
                      {req.loading_locations.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-gray-500">📍 أماكن التحميل:</div>
                          {req.loading_locations.map((loc, i) => (
                            <div key={i} className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-1.5">{loc}</div>
                          ))}
                        </div>
                      )}

                      {/* Delivery location */}
                      {req.delivery_location && (
                        <div className="flex items-start gap-2 text-xs text-indigo-700 bg-indigo-50 rounded-xl px-3 py-2">
                          <MapPin size={12} className="flex-shrink-0 mt-0.5"/>
                          <span className="break-all">{req.delivery_location}</span>
                        </div>
                      )}

                      {/* Rep info */}
                      {req.rep_name && (
                        <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 rounded-xl px-3 py-2">
                          <UserCheck size={12} className="flex-shrink-0"/>
                          <strong>{req.rep_name}</strong>
                          {req.rep_phone && (
                            <a href={`https://wa.me/966${req.rep_phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="text-green-600 underline font-bold">واتساب</a>
                          )}
                        </div>
                      )}

                      {/* Vehicle / driver */}
                      {(req.vehicle_plate || req.driver_name) && (
                        <div className="flex flex-wrap gap-3 text-xs text-indigo-800 bg-indigo-50 rounded-xl px-3 py-2">
                          {req.vehicle_plate && <span>🚛 {req.vehicle_plate}</span>}
                          {req.driver_name   && <span>👨‍✈️ {req.driver_name}</span>}
                          {req.driver_phone  && (
                            <a href={`https://wa.me/966${req.driver_phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="text-green-600 underline font-bold">واتساب</a>
                          )}
                        </div>
                      )}

                      {/* Permit + Invoice photos */}
                      <div className="flex flex-wrap gap-2">
                        {req.permit_photo_url && (
                          <a href={req.permit_photo_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-1.5 font-semibold hover:bg-purple-100">
                            <Eye size={12}/> صورة الفسحة
                          </a>
                        )}
                        {req.invoice_photo_url && (
                          <a href={req.invoice_photo_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5 font-semibold hover:bg-blue-100">
                            <FileText size={12}/> صورة الفاتورة
                          </a>
                        )}
                      </div>

                      {req.notes && <p className="text-xs text-gray-400 italic">{req.notes}</p>}

                      <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-50">
                        <span>{new Date(req.created_at).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" })}</span>
                        <div className="flex items-center gap-2">
                          {req.status === "pending" && craneAssignEnabled && (
                            <button
                              onClick={() => {
                                setRepAssignModal(req);
                                setRepAssignForm({ vehicle_plate: "", driver_name: "", driver_phone: "" });
                                setRepAssignSuccess(false);
                              }}
                              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-[#103c68] text-white rounded-xl hover:bg-[#0d2e50] transition-colors">
                              <Truck size={11}/> تعيين سيارة
                            </button>
                          )}
                          {req.status === "pending" && !craneAssignEnabled && user?.role !== "admin" && (
                            <span className="text-[10px] text-gray-400 italic">التعيين موقوف مؤقتاً</span>
                          )}
                          {req.status === "pending" && (
                            <button onClick={() => cancelRepReq(req.id)} className="text-red-400 hover:text-red-600 font-bold">إلغاء</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ REP ASSIGN VEHICLE MODAL ══ */}
      {repAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-black text-lg text-gray-900">🚛 تعيين سيارة</h2>
                <p className="text-xs text-gray-400 mt-0.5">{repAssignModal.product_name}</p>
              </div>
              <button onClick={() => setRepAssignModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Success */}
              {repAssignSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-green-700 text-sm font-bold">
                  <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                  تم تعيين السيارة — الطلب انتقل لمسؤول الفسوحات ✅
                </div>
              )}

              {/* Request summary */}
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1.5 border border-gray-200">
                <div className="flex items-center gap-1.5 mb-2 font-bold text-[#103c68]">
                  <Package size={13} />تفاصيل الطلب
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 flex-shrink-0">المنتج</span>
                  <span className="font-semibold text-gray-700">{repAssignModal.product_name}</span>
                </div>
                {repAssignModal.delivery_location && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">موقع التسليم</span>
                    <span className="font-semibold text-gray-700 text-xs text-left">{repAssignModal.delivery_location}</span>
                  </div>
                )}
                {repAssignModal.rep_name && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">المندوب</span>
                    <span className="font-semibold text-gray-700">{repAssignModal.rep_name}</span>
                  </div>
                )}
              </div>

              {/* Vehicle picker */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-2">اختر سيارة من الأسطول *</label>
                {vehicles.filter(v => v.branch === "النقليات" && v.status === "available").length === 0 && vehicles.some(v => v.branch === "النقليات") && (
                  <div className="mb-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl px-3 py-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0" />لا توجد سيارات متاحة — يمكنك اختيار سيارة مشغولة أو إدخال اللوحة يدوياً
                  </div>
                )}
                {vehicles.some(v => v.branch === "النقليات") && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {vehicles.filter(v => v.branch === "النقليات").map(v => (
                      <button key={v.id} type="button"
                        onClick={() => setRepAssignForm({
                          vehicle_plate: v.plate_number,
                          driver_name:   v.linked_user_name  || v.driver_name  || "",
                          driver_phone:  v.linked_user_phone || v.driver_phone || "",
                        })}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-all ${
                          repAssignForm.vehicle_plate === v.plate_number
                            ? "border-[#103c68] bg-[#103c68]/5"
                            : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          repAssignForm.vehicle_plate === v.plate_number ? "bg-[#103c68]" : "bg-gray-100"
                        }`}>
                          <Car size={14} className={repAssignForm.vehicle_plate === v.plate_number ? "text-white" : "text-gray-500"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5 flex-wrap">
                            {v.plate_number}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${VEH_STATUS_COLOR[v.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                              {VEH_STATUS_AR[v.status] || v.status}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {v.vehicle_type}{(v.linked_user_name || v.driver_name) ? ` · ${v.linked_user_name || v.driver_name}` : ""}
                          </div>
                          {v.last_delivery_location && (
                            <div className="text-[10px] text-indigo-500 truncate mt-0.5 flex items-center gap-0.5">
                              <span>📍</span>
                              <span>آخر تنزيل: {v.last_delivery_location}</span>
                            </div>
                          )}
                        </div>
                        {repAssignForm.vehicle_plate === v.plate_number && <CheckCircle size={16} className="text-[#103c68] flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
                <input type="text"
                  value={repAssignForm.vehicle_plate}
                  onChange={e => setRepAssignForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                  placeholder="أو أدخل رقم اللوحة يدوياً"
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>

              {/* Driver picker */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">السائق</label>
                <select
                  value={repAssignForm.driver_phone}
                  onChange={e => {
                    const d = drivers.find(d => d.phone === e.target.value);
                    setRepAssignForm(f => ({ ...f, driver_phone: e.target.value, driver_name: d?.name || f.driver_name }));
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50">
                  <option value="">— اختر سائقاً —</option>
                  {drivers.map(d => <option key={d.phone} value={d.phone}>{d.name}</option>)}
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => setRepAssignModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
              <button onClick={assignRepVehicle}
                disabled={repAssignSubmit || !repAssignForm.vehicle_plate}
                className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d2e50] text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {repAssignSubmit
                  ? <><RefreshCw size={14} className="animate-spin" />جارٍ التعيين...</>
                  : <><CheckCircle size={14} />تأكيد التعيين</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SUPPLY FORM MODAL ══ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-black text-gray-800">🏗️ طلب توريد جديد</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-amber-800">بيانات الزبون الخارجي</p>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">اسم الزبون <span className="text-red-500">*</span></label>
                  <input value={form.external_customer_name} onChange={e => f("external_customer_name", e.target.value)}
                    placeholder="اسم الزبون أو الجهة..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">جوال الزبون</label>
                  <input value={form.external_customer_phone} onChange={e => f("external_customer_phone", e.target.value)}
                    placeholder="05XXXXXXXX"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">المنتج / الصنف <span className="text-red-500">*</span></label>
                <input value={form.product_name} onChange={e => f("product_name", e.target.value)}
                  placeholder="اسم المنتج أو الصنف..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">الكمية <span className="text-red-500">*</span></label>
                  <input type="number" min="0" value={form.requested_qty} onChange={e => f("requested_qty", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">الوحدة</label>
                  <select value={form.unit} onChange={e => f("unit", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">عدد الترلات</label>
                  <input type="number" min="1" value={form.trailer_loads} onChange={e => f("trailer_loads", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">الأولوية</label>
                  <select value={form.priority} onChange={e => f("priority", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300">
                    <option value="normal">عادي</option>
                    <option value="urgent">عاجل 🔴</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">موقع التسليم</label>
                <input value={form.destination_division} onChange={e => f("destination_division", e.target.value)}
                  placeholder="المدينة / الحي / الموقع..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات</label>
                <textarea value={form.notes} onChange={e => f("notes", e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"/>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-bold">إلغاء</button>
                <button onClick={submitSupply} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm disabled:opacity-60">
                  {saving ? "جارٍ الإرسال..." : "إرسال الطلب ✓"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ REP REQUEST FORM MODAL ══ */}
      {showRepForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowRepForm(false); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-black text-gray-800">👤 طلب جديد للمندوب</h2>
              <button onClick={() => setShowRepForm(false)} className="text-gray-400 hover:text-gray-700"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-4">

              {/* Product search */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">المنتج <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                  <input
                    value={prodSearch || repForm.product_name}
                    onChange={e => { setProdSearch(e.target.value); setRepForm(p => ({ ...p, product_name: e.target.value })); setProdDropOpen(true); }}
                    onFocus={() => setProdDropOpen(true)}
                    onBlur={() => setTimeout(() => setProdDropOpen(false), 180)}
                    placeholder="ابحث عن المنتج..."
                    className="w-full border border-gray-200 rounded-xl pr-8 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
                  />
                  {prodDropOpen && filteredProducts.length > 0 && (
                    <div className="absolute z-50 top-full right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                      {filteredProducts.map(p => (
                        <button key={p.id} type="button"
                          onMouseDown={e => { e.preventDefault(); setRepForm(f => ({ ...f, product_name: p.name })); setProdSearch(""); setProdDropOpen(false); }}
                          className="w-full text-right px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between gap-2 text-sm border-b border-gray-50 last:border-0">
                          <span className="font-semibold text-gray-800">{p.name}</span>
                          <span className="text-xs text-gray-400">{p.unit}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {repForm.product_name && !prodSearch && (
                  <div className="mt-1.5 flex items-center gap-2 bg-blue-50 text-blue-800 rounded-lg px-3 py-1.5 text-xs font-semibold">
                    <CheckCircle size={12}/> {repForm.product_name}
                    <button onClick={() => setRepForm(p => ({ ...p, product_name: "" }))} className="mr-auto text-gray-400 hover:text-red-500"><X size={11}/></button>
                  </div>
                )}
              </div>

              {/* Loading locations */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700">📍 أماكن التحميل</label>
                  <button type="button" onClick={addLoadingLoc}
                    className="text-xs text-[#103c68] font-bold flex items-center gap-1 hover:underline">
                    <Plus size={11}/> إضافة موقع
                  </button>
                </div>
                <div className="space-y-2">
                  {repForm.loading_locations.map((loc, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <MapPin size={13} className="text-gray-400 flex-shrink-0"/>
                      <input value={loc} onChange={e => updateLoadingLoc(i, e.target.value)}
                        placeholder={`موقع التحميل ${i + 1}...`}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"/>
                      {repForm.loading_locations.length > 1 && (
                        <button type="button" onClick={() => removeLoadingLoc(i)} className="text-gray-300 hover:text-red-500 p-0.5"><X size={14}/></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery location */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">🗺️ لوكيشن التنزيل (رابط أو نص)</label>
                <textarea value={repForm.delivery_location} rows={2}
                  onChange={e => setRepForm(p => ({ ...p, delivery_location: e.target.value }))}
                  placeholder="الصق رابط الخريطة أو اكتب موقع التسليم..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none"/>
              </div>

              {/* Rep selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">👤 المندوب</label>
                {reps.length > 0 ? (
                  <select value={repForm.rep_phone}
                    onChange={e => {
                      const rep = reps.find(r => r.phone === e.target.value);
                      setRepForm(p => ({ ...p, rep_phone: e.target.value, rep_name: rep?.name || "" }));
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-white">
                    <option value="">— اختر المندوب —</option>
                    {reps.map(r => (
                      <option key={r.id} value={r.phone}>{r.name} ({r.phone})</option>
                    ))}
                  </select>
                ) : (
                  <input value={repForm.rep_name} onChange={e => setRepForm(p => ({ ...p, rep_name: e.target.value }))}
                    placeholder="اسم المندوب..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"/>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات (اختياري)</label>
                <textarea value={repForm.notes} rows={2} onChange={e => setRepForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none"/>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowRepForm(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-bold">إلغاء</button>
                <button onClick={submitRepRequest} disabled={repSaving}
                  className="flex-1 py-3 rounded-xl bg-[#103c68] hover:bg-[#0d3158] text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                  {repSaving ? <><RefreshCw size={13} className="animate-spin"/>جارٍ الإرسال...</> : <><Upload size={14}/>إرسال الطلب</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
