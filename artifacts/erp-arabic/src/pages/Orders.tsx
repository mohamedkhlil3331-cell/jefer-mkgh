import { useEffect, useState } from "react";
import {
  Package, Plus, Truck, RefreshCw, X, Save,
  Phone, MapPin, User, Clock, CheckCircle, XCircle,
  Hash, ChevronRight,
} from "lucide-react";

interface Order {
  id: number; order_type: string; quantity: number; unit: string;
  client_name: string; client_phone: string; location: string;
  car_id: string; driver_name: string; status: string;
  notes: string; created_at: string;
}

const STATUSES = ["new", "in_progress", "delivered", "cancelled"];
const STATUS_AR: Record<string, string> = { new: "جديد", in_progress: "جاري", delivered: "تم التسليم", cancelled: "ملغي" };
const STATUS_COLOR: Record<string, string> = {
  new:         "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  delivered:   "bg-green-100 text-green-700 border-green-200",
  cancelled:   "bg-gray-100 text-gray-500 border-gray-200",
};
const STATUS_DOT: Record<string, string> = {
  new: "bg-blue-500", in_progress: "bg-amber-500", delivered: "bg-green-500", cancelled: "bg-gray-400",
};

export default function Orders() {
  const [rows,          setRows]          = useState<Order[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [openAdd,       setOpenAdd]       = useState(false);
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [filter,        setFilter]        = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [form, setForm] = useState({
    order_type: "اسمنت", quantity: "", unit: "طن",
    client_name: "", client_phone: "", location: "", notes: "",
  });
  const [dispatch, setDispatch] = useState({ car_id: "", driver_name: "", status: "in_progress" });

  const load = () => {
    setLoading(true);
    const q = filter ? `?status=${encodeURIComponent(filter)}` : "";
    fetch(`/api/orders${q}`).then(r => r.json()).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, [filter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setOpenAdd(false);
      setForm({ order_type: "اسمنت", quantity: "", unit: "طن", client_name: "", client_phone: "", location: "", notes: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchOrder) return;
    setSubmitting(true);
    try {
      await fetch(`/api/orders/${dispatchOrder.id}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dispatch),
      });
      setDispatchOrder(null); load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = rows.filter(r => r.status === s).length; return acc;
  }, {} as Record<string, number>);

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Package size={22} className="text-[#103c68]" />الطلبات
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">{rows.length} طلب</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={() => setOpenAdd(true)}
            className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2e50] transition-colors shadow-sm">
            <Plus size={16} />إضافة طلب
          </button>
        </div>
      </div>

      {/* Status KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {STATUSES.map(s => (
          <div key={s}
            className={`rounded-2xl p-3 text-center cursor-pointer border-2 transition-all ${
              filter === s ? "border-[#103c68] bg-[#103c68]/5 shadow-sm" : "border-transparent bg-white shadow-sm border-gray-100"
            }`}
            onClick={() => setFilter(filter === s ? "" : s)}>
            <div className="text-xl font-black text-gray-900">{counts[s] ?? 0}</div>
            <div className="flex items-center justify-center gap-1 mt-1">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
              <span className="text-xs text-gray-500">{STATUS_AR[s]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter("")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            !filter ? "bg-[#103c68] text-white border-[#103c68] shadow-sm" : "bg-white text-gray-600 border-gray-200"
          }`}>
          الكل ({rows.length})
        </button>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(filter === s ? "" : s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              filter === s ? `border-[#103c68] bg-[#103c68]/5 text-[#103c68]` : "bg-white text-gray-600 border-gray-200"
            }`}>
            {STATUS_AR[s]}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Package size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400">لا توجد طلبات</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(order => (
            <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs text-gray-400 flex items-center gap-0.5"><Hash size={10} />{order.id}</span>
                    <span className="font-bold text-gray-900">{order.order_type}</span>
                    <span className="text-sm text-gray-600">{order.quantity} {order.unit}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><User size={11} />{order.client_name}</span>
                    {order.client_phone && <span className="flex items-center gap-1"><Phone size={11} />{order.client_phone}</span>}
                    {order.location && <span className="flex items-center gap-1"><MapPin size={11} />{order.location}</span>}
                    {order.car_id && <span className="flex items-center gap-1"><Truck size={11} />{order.car_id} — {order.driver_name || "?"}</span>}
                  </div>
                  {order.notes && <div className="text-xs text-gray-400 mt-1 truncate">{order.notes}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2.5 py-1.5 rounded-xl font-semibold border ${STATUS_COLOR[order.status] || "bg-gray-100 text-gray-500"}`}>
                    {STATUS_AR[order.status] || order.status}
                  </span>
                  {order.status !== "delivered" && order.status !== "cancelled" && (
                    <button
                      onClick={() => { setDispatchOrder(order); setDispatch({ car_id: order.car_id || "", driver_name: order.driver_name || "", status: "in_progress" }); }}
                      className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                      <ChevronRight size={16} className="text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {openAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setOpenAdd(false)}>
          <div className="bg-white rounded-t-3xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-black text-lg flex items-center gap-2"><Package size={18} className="text-[#103c68]" />إضافة طلب جديد</h2>
              <button onClick={() => setOpenAdd(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">نوع الطلب *</label>
                  <input required value={form.order_type} onChange={e => setForm(f => ({ ...f, order_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">الكمية *</label>
                    <input type="number" required value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                  </div>
                  <div className="w-20">
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">الوحدة</label>
                    <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-2 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                      {["طن","كيس","م3","وحدة"].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">اسم العميل *</label>
                  <input required value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم الهاتف</label>
                  <input value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">موقع التسليم</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">ملاحظات</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60">
                  <Save size={16} />{submitting ? "جاري الحفظ..." : "حفظ الطلب"}
                </button>
                <button type="button" onClick={() => setOpenAdd(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispatch modal */}
      {dispatchOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setDispatchOrder(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-5">
              <Truck size={20} className="text-[#103c68]" />
              <h2 className="font-black text-lg">إرسال / تحديث الطلب</h2>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3 mb-5 text-sm border border-gray-100">
              <div className="font-bold text-gray-900">{dispatchOrder.order_type} — {dispatchOrder.client_name}</div>
              <div className="text-gray-500 text-xs mt-0.5">{dispatchOrder.quantity} {dispatchOrder.unit} · {dispatchOrder.location}</div>
            </div>
            <form onSubmit={handleDispatch} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم السيارة</label>
                <input value={dispatch.car_id} onChange={e => setDispatch(d => ({ ...d, car_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">اسم السائق</label>
                <input value={dispatch.driver_name} onChange={e => setDispatch(d => ({ ...d, driver_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">الحالة الجديدة</label>
                <select value={dispatch.status} onChange={e => setDispatch(d => ({ ...d, status: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                  {STATUSES.slice(1).map(s => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60">
                  <CheckCircle size={16} />{submitting ? "جاري التحديث..." : "تحديث الحالة"}
                </button>
                <button type="button" onClick={() => setDispatchOrder(null)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
