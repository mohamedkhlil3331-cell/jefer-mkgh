import { useState, useEffect } from "react";
import { Plus, Save, Package, Clock, CheckCircle, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Request = {
  id: number; request_number: string; cargo_type: string; cargo_label: string;
  qty: number; unit: string; vehicle_type_name: string; notes: string;
  status: string; assigned_vehicle_plate: string; assigned_driver_name: string;
  created_at: string;
};
type VehicleDef = { id: number; name: string; icon: string };

const CARGO_OPTIONS = [
  { key: "cement_packed", label: "أسمنت معبأ (كيس)", unit: "كيس", icon: "🧱" },
  { key: "cement_loose",  label: "أسمنت سائب",       unit: "م³",  icon: "🛢️" },
  { key: "blocks",        label: "بلوك",              unit: "قطعة",icon: "🏗️" },
  { key: "tiles",         label: "بلاط وأرضيات",      unit: "م²",  icon: "🔲" },
  { key: "other",         label: "أخرى",              unit: "وحدة",icon: "📦" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:     { label: "معلق",    color: "bg-yellow-100 text-yellow-700", icon: Clock },
  assigned:    { label: "مُعيَّن", color: "bg-blue-100 text-blue-700",    icon: CheckCircle },
  in_progress: { label: "جاري",   color: "bg-indigo-100 text-indigo-700", icon: Clock },
  completed:   { label: "مكتمل",  color: "bg-green-100 text-green-700",   icon: CheckCircle },
  cancelled:   { label: "ملغى",   color: "bg-red-100 text-red-700",       icon: X },
};

export default function InternalRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests]       = useState<Request[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleDef[]>([]);
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [form, setForm] = useState({
    cargo_type: "cement_packed", cargo_label: "أسمنت معبأ (كيس)",
    qty: "", unit: "كيس", vehicle_type_id: "", vehicle_type_name: "", notes: "",
  });

  const load = () => {
    fetch("/api/internal-requests").then(r => r.json()).then(setRequests).catch(() => {});
    fetch("/api/vehicle-type-defs").then(r => r.json()).then(setVehicleTypes).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.cargo_type || !form.qty) return;
    setSaving(true);
    try {
      await fetch("/api/internal-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          qty: parseInt(form.qty) || 0,
          requester_name: user?.name,
          requester_role: user?.role,
          requester_id: user?.id,
        }),
      });
      setForm({ cargo_type: "cement_packed", cargo_label: "أسمنت معبأ (كيس)", qty: "", unit: "كيس", vehicle_type_id: "", vehicle_type_name: "", notes: "" });
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  };

  const pending   = requests.filter(r => r.status === "pending").length;
  const assigned  = requests.filter(r => ["assigned","in_progress"].includes(r.status)).length;
  const completed = requests.filter(r => r.status === "completed").length;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">الطلبات الداخلية للنقل</h1>
          <p className="text-sm text-gray-400 mt-1">طلب نقل بضائع داخلي — يُعيَّن مشرف الحركة السيارة</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
          <Plus size={16} />طلب جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "معلقة",   value: pending,   color: "bg-yellow-50 text-yellow-700" },
          { label: "جارية",   value: assigned,  color: "bg-blue-50 text-blue-700" },
          { label: "مكتملة",  value: completed, color: "bg-green-50 text-green-700" },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-xl px-4 py-3 text-center`}>
            <div className="text-2xl font-black">{s.value}</div>
            <div className="text-xs font-semibold mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Requests list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Package size={16} className="text-blue-600" />
          <h2 className="font-bold text-gray-900">سجل الطلبات</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{requests.length} طلب</span>
        </div>

        {requests.length === 0 ? (
          <div className="p-10 text-center">
            <Package size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">لا توجد طلبات — اضغط "طلب جديد" أعلاه</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {requests.map(r => {
              const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
              const Icon = sc.icon;
              const cargo = CARGO_OPTIONS.find(c => c.key === r.cargo_type);
              return (
                <div key={r.id} className="px-5 py-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5">{cargo?.icon || "📦"}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-xs text-gray-400">{r.request_number}</span>
                          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${sc.color}`}>
                            <Icon size={11} />{sc.label}
                          </span>
                        </div>
                        <div className="font-semibold text-gray-800">
                          {r.cargo_label} — {r.qty?.toLocaleString("ar-SA")} {r.unit}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-3">
                          {r.vehicle_type_name && <span>🚛 {r.vehicle_type_name}</span>}
                          {r.assigned_vehicle_plate && (
                            <span className="text-green-600 font-semibold">✅ {r.assigned_vehicle_plate} · {r.assigned_driver_name}</span>
                          )}
                          <span>📅 {new Date(r.created_at).toLocaleDateString("ar-SA")}</span>
                        </div>
                        {r.notes && <p className="text-xs text-gray-400 italic mt-1">{r.notes}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New request modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">طلب نقل داخلي جديد</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">نوع الشحنة <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {CARGO_OPTIONS.map(c => (
                    <button key={c.key} onClick={() => setForm(f => ({ ...f, cargo_type: c.key, cargo_label: c.label, unit: c.unit }))}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-semibold transition-all ${form.cargo_type === c.key ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      <span className="text-xl">{c.icon}</span>
                      <span className="text-center leading-tight">{c.label.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">الكمية <span className="text-red-500">*</span></label>
                  <input type="number" min="1" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">الوحدة</label>
                  <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">نوع السيارة المفضل</label>
                <select value={form.vehicle_type_id}
                  onChange={e => {
                    const vt = vehicleTypes.find(v => String(v.id) === e.target.value);
                    setForm(f => ({ ...f, vehicle_type_id: e.target.value, vehicle_type_name: vt?.name || "" }));
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— اختياري —</option>
                  {vehicleTypes.map(v => <option key={v.id} value={String(v.id)}>{v.icon} {v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">ملاحظات</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="أي تفاصيل إضافية..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">إلغاء</button>
              <button onClick={submit} disabled={saving || !form.cargo_type || !form.qty}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                <Save size={14} />{saving ? "جاري الإرسال..." : "إرسال الطلب"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
