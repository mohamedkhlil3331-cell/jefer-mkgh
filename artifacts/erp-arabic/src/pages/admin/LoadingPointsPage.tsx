import { useState, useEffect } from "react";
import { MapPin, Plus, Edit2, Trash2, X, Save, Building2, Navigation } from "lucide-react";

interface LoadingPoint {
  id: number; name: string; city: string; address: string;
  lat: number; lng: number; active: number; notes: string; created_at: string;
}

export default function LoadingPointsPage() {
  const [points, setPoints] = useState<LoadingPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<LoadingPoint> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/loading-points").then(r => r.json()).then(d => setPoints(Array.isArray(d) ? d : [])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!modal?.name) return;
    setSaving(true);
    const isEdit = !!modal.id;
    const url = isEdit ? `/api/loading-points/${modal.id}` : "/api/loading-points";
    await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modal),
    });
    setSaving(false);
    setModal(null);
    load();
  };

  const del = async (id: number) => {
    if (!confirm("تعطيل نقطة التحميل هذه؟")) return;
    await fetch(`/api/loading-points/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#103c68] flex items-center justify-center">
            <MapPin size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">نقاط التحميل والمصانع</h1>
            <p className="text-sm text-gray-500">مستودعات ومصانع الشركة — تُستخدم لحساب المسافات والتسعير</p>
          </div>
        </div>
        <button onClick={() => setModal({ active: 1 })}
          className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0d2e50] transition-colors">
          <Plus size={15} /> إضافة نقطة تحميل
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-32 animate-pulse" />)}
        </div>
      ) : points.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <MapPin size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold">لا توجد نقاط تحميل</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {points.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#103c68]/10 flex items-center justify-center flex-shrink-0">
                      <Building2 size={14} className="text-[#103c68]" />
                    </div>
                    <h3 className="font-bold text-gray-900">{p.name}</h3>
                  </div>
                  {p.city && <p className="text-sm text-gray-500 mt-1">{p.city}</p>}
                  {p.address && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.address}</p>}
                  {(p.lat && p.lng) && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                      <Navigation size={11} />
                      {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </div>
                  )}
                  {p.notes && <p className="text-xs text-blue-600 mt-1">{p.notes}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setModal(p)} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => del(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900">{modal.id ? "تعديل نقطة التحميل" : "إضافة نقطة تحميل جديدة"}</h3>
              <button onClick={() => setModal(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <input placeholder="اسم النقطة / المصنع *" value={modal.name || ""} onChange={e => setModal(m => ({...m!, name: e.target.value}))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="المدينة" value={modal.city || ""} onChange={e => setModal(m => ({...m!, city: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              <div className="flex gap-2">
                <input placeholder="خط العرض" type="number" step="0.0001" value={modal.lat || ""} onChange={e => setModal(m => ({...m!, lat: parseFloat(e.target.value)}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="خط الطول" type="number" step="0.0001" value={modal.lng || ""} onChange={e => setModal(m => ({...m!, lng: parseFloat(e.target.value)}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              <input placeholder="العنوان" value={modal.address || ""} onChange={e => setModal(m => ({...m!, address: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
            </div>
            <textarea rows={2} placeholder="ملاحظات" value={modal.notes || ""} onChange={e => setModal(m => ({...m!, notes: e.target.value}))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={save} disabled={saving || !modal.name}
                className="flex-1 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d2e50] disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
