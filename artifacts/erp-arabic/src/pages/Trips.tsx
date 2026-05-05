import { useEffect, useState } from "react";
import {
  Truck, Plus, Trash2, RefreshCw, X, Save, Car, User,
  MapPin, Package, Calendar, TrendingUp, Filter, DollarSign,
} from "lucide-react";

interface Trip {
  id: number; date: string; car_id: string; driver_name: string;
  client_name: string; material_type: string; destination: string;
  trips_count: number; unit_price: number; total_amount: number;
  vat: number; net_amount: number;
}
interface Summary {
  total_records: number; total_trips: number;
  total_gross: number; total_vat: number; total_net: number;
}

function fmt(n: number) { return n.toLocaleString("ar-SA", { minimumFractionDigits: 0 }); }
function fmtSAR(n: number) { return `${fmt(n)} ر.س`; }

const MATERIALS = ["اسمنت", "رمل", "حصى", "حجر", "حديد", "خشب", "أخرى"];

export default function Trips() {
  const [rows,       setRows]       = useState<Trip[]>([]);
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [openAdd,    setOpenAdd]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo,   setFilterTo]   = useState("");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10), car_id: "", driver_name: "",
    client_name: "", material_type: "اسمنت", destination: "",
    trips_count: "1", unit_price: "",
  });

  const load = () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (filterFrom) q.set("from", filterFrom);
    if (filterTo)   q.set("to", filterTo);
    Promise.all([
      fetch(`/api/trips?${q}`).then(r => r.json()),
      fetch("/api/trips/summary").then(r => r.json()),
    ]).then(([t, s]) => { setRows(t); setSummary(s); }).finally(() => setLoading(false));
  };
  useEffect(load, [filterFrom, filterTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/trips", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setOpenAdd(false);
      setForm({ date: new Date().toISOString().slice(0, 10), car_id: "", driver_name: "", client_name: "", material_type: "اسمنت", destination: "", trips_count: "1", unit_price: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا القيد؟")) return;
    await fetch(`/api/trips/${id}`, { method: "DELETE" });
    load();
  };

  const unitPrice  = parseFloat(form.unit_price) || 0;
  const tripsCount = parseInt(form.trips_count)  || 1;
  const total      = unitPrice * tripsCount;
  const vat        = parseFloat((total * 0.15).toFixed(2));
  const net        = parseFloat((total + vat).toFixed(2));

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Truck size={22} className="text-[#103c68]" />الردود / الرحلات
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">سجل التوصيلات والرحلات اليومية</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={() => setOpenAdd(true)}
            className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2e50] transition-colors shadow-sm">
            <Plus size={16} />إضافة رحلة
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "عدد القيود",           val: summary.total_records, color: "bg-[#103c68] text-white" },
            { label: "إجمالي الردود",         val: summary.total_trips,  color: "bg-blue-600 text-white"  },
            { label: "إجمالي المبلغ",         val: fmtSAR(summary.total_gross), color: "bg-amber-500 text-white" },
            { label: "ض.ق.م 15%",            val: fmtSAR(summary.total_vat),   color: "bg-purple-600 text-white" },
            { label: "شامل الضريبة",          val: fmtSAR(summary.total_net),   color: "bg-green-600 text-white"  },
          ].map(({ label, val, color }) => (
            <div key={label} className={`${color} rounded-2xl p-4 shadow-sm`}>
              <div className="text-sm font-black opacity-90">{val}</div>
              <div className="text-xs opacity-70 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Date filter */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <Filter size={14} className="text-gray-400 mt-auto mb-2.5" />
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">من تاريخ</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">إلى تاريخ</label>
          <input type="date" value={filterTo} min={filterFrom} onChange={e => setFilterTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
        </div>
        {(filterFrom || filterTo) && (
          <button onClick={() => { setFilterFrom(""); setFilterTo(""); }}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 mb-0.5">
            مسح الفلتر
          </button>
        )}
      </div>

      {/* Trips list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Truck size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400">لا توجد رحلات مسجّلة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(trip => (
            <div key={trip.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="bg-[#103c68]/10 text-[#103c68] text-xs px-2.5 py-1 rounded-xl font-bold">{trip.material_type}</span>
                    <span className="font-bold text-gray-700">{trip.trips_count} رد</span>
                    {trip.client_name && <span className="text-xs text-gray-500">{trip.client_name}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    {trip.car_id && (
                      <span className="flex items-center gap-1"><Car size={11} />{trip.car_id}</span>
                    )}
                    {trip.driver_name && (
                      <span className="flex items-center gap-1"><User size={11} />{trip.driver_name}</span>
                    )}
                    {trip.destination && (
                      <span className="flex items-center gap-1"><MapPin size={11} />{trip.destination}</span>
                    )}
                    <span className="flex items-center gap-1"><Calendar size={11} />{new Date(trip.date).toLocaleDateString("ar-SA")}</span>
                  </div>
                </div>
                <div className="text-end flex-shrink-0">
                  <div className="font-black text-[#103c68] text-base">{fmt(trip.net_amount)} <span className="text-xs font-normal text-gray-400">ر.س</span></div>
                  <div className="text-xs text-gray-400">شامل 15%</div>
                  <button onClick={() => del(trip.id)} className="mt-1 p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={13} className="text-red-400" />
                  </button>
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
              <h2 className="font-black text-lg flex items-center gap-2"><Truck size={18} className="text-[#103c68]" />إضافة رحلة / رد</h2>
              <button onClick={() => setOpenAdd(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">التاريخ *</label>
                  <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم السيارة *</label>
                  <input required value={form.car_id} onChange={e => setForm(f => ({ ...f, car_id: e.target.value }))}
                    placeholder="ABC-1234"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">اسم السائق</label>
                  <input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">العميل</label>
                  <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">نوع المادة</label>
                  <select value={form.material_type} onChange={e => setForm(f => ({ ...f, material_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                    {MATERIALS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">الوجهة</label>
                  <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">عدد الردود *</label>
                  <input type="number" required min="1" value={form.trips_count} onChange={e => setForm(f => ({ ...f, trips_count: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 text-center font-bold" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">سعر الرد (ر.س) *</label>
                  <input type="number" required min="0" step="0.01" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 font-bold" />
                </div>
              </div>

              {/* Live calc */}
              {unitPrice > 0 && (
                <div className="bg-[#103c68]/5 border border-[#103c68]/15 rounded-2xl p-4 grid grid-cols-3 gap-3 text-center text-sm">
                  <div>
                    <div className="text-gray-500 text-xs">الإجمالي</div>
                    <div className="font-bold text-gray-800">{fmt(total)} ر.س</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">ض.ق.م 15%</div>
                    <div className="font-bold text-amber-700">{fmt(vat)} ر.س</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">شامل الضريبة</div>
                    <div className="font-black text-[#103c68]">{fmt(net)} ر.س</div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60">
                  <Save size={16} />{submitting ? "جاري الحفظ..." : "حفظ الرحلة"}
                </button>
                <button type="button" onClick={() => setOpenAdd(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
