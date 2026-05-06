import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Wrench, AlertTriangle, CheckCircle, RefreshCw, Clock, Car,
  Image as ImageIcon, X, ChevronDown,
} from "lucide-react";

interface BreakdownReport {
  id: number;
  driver_phone: string;
  driver_name: string;
  vehicle_id: number;
  vehicle_plate: string;
  breakdown_type: string;
  description: string;
  photo_url: string | null;
  status: "open" | "resolved";
  resolved_by: string | null;
  resolve_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

const TYPE_COLOR: Record<string, string> = {
  "ميكانيكي":  "bg-orange-50 text-orange-700 border-orange-200",
  "كهربائي":   "bg-yellow-50 text-yellow-700 border-yellow-200",
  "حادث":      "bg-red-50 text-red-700 border-red-200",
  "إطارات":    "bg-blue-50 text-blue-700 border-blue-200",
  "أخرى":      "bg-gray-50 text-gray-600 border-gray-200",
};

export default function WorkshopManagerPage() {
  const { user } = useAuth();
  const [reports,    setReports]    = useState<BreakdownReport[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<"open" | "all">("open");
  const [resolving,  setResolving]  = useState<BreakdownReport | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/workflow/breakdown-reports")
      .then(r => r.json())
      .then(d => setReports(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const resolve = async () => {
    if (!resolving || !user) return;
    setSubmitting(true);
    try {
      await fetch(`/api/workflow/breakdown-reports/${resolving.id}/resolve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved_by: user.name, resolve_notes: resolveNotes }),
      });
      setResolving(null);
      setResolveNotes("");
      load();
    } catch { alert("فشل تسجيل الحل"); }
    finally { setSubmitting(false); }
  };

  const displayed = tab === "open" ? reports.filter(r => r.status === "open") : reports;
  const openCount     = reports.filter(r => r.status === "open").length;
  const resolvedCount = reports.filter(r => r.status === "resolved").length;

  const fmt = (d: string) => new Date(d).toLocaleDateString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div dir="rtl" className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Wrench size={24} className="text-[#103c68]" />ورشة الصيانة
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">بلاغات الأعطال والصيانة</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />تحديث
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={22} className="text-white" />
          </div>
          <div>
            <div className="text-3xl font-black text-gray-900">{openCount}</div>
            <div className="text-xs text-gray-400 mt-0.5">بلاغ مفتوح</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckCircle size={22} className="text-white" />
          </div>
          <div>
            <div className="text-3xl font-black text-gray-900">{resolvedCount}</div>
            <div className="text-xs text-gray-400 mt-0.5">تم الحل</div>
          </div>
        </div>
      </div>

      {/* Alert banner */}
      {openCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <div>
            <div className="font-bold text-red-800">{openCount} سيارة بحاجة للصيانة</div>
            <div className="text-xs text-red-600 mt-0.5">تحقق من البلاغات وسجل الحل بعد الإصلاح</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl w-fit">
        {([
          { id: "open", label: "المفتوحة", count: openCount },
          { id: "all",  label: "الكل",     count: reports.length },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs font-black px-1.5 rounded-full ${t.id === "open" ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-600"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Report list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={22} className="animate-spin text-[#103c68]" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <CheckCircle size={40} className="mx-auto mb-3 text-green-300" />
          <p className="font-semibold text-gray-500">لا توجد بلاغات أعطال</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map(r => (
            <div key={r.id}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${r.status === "open" ? "border-red-200" : "border-gray-100"}`}>
              {/* Top bar */}
              <div className={`px-5 py-3 flex items-center justify-between gap-3 ${r.status === "open" ? "bg-red-50" : "bg-gray-50"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Car size={14} className={r.status === "open" ? "text-red-600" : "text-gray-400"} />
                  <span className="font-bold text-gray-800">{r.vehicle_plate || "—"}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${TYPE_COLOR[r.breakdown_type] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                    {r.breakdown_type}
                  </span>
                  {r.status === "open" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                      <Clock size={10} />مفتوح
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                      <CheckCircle size={10} />تم الحل
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{fmt(r.created_at)}</span>
              </div>

              <div className="p-5 space-y-3">
                {/* Driver info */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#103c68]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-[#103c68]">{(r.driver_name || "س")[0]}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">{r.driver_name || r.driver_phone}</div>
                    <div className="text-xs text-gray-400">{r.driver_phone}</div>
                  </div>
                </div>

                {/* Description */}
                {r.description && (
                  <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-700 border border-gray-100">
                    {r.description}
                  </div>
                )}

                {/* Photo */}
                {r.photo_url && (
                  <button onClick={() => setPhotoModal(r.photo_url!)}
                    className="flex items-center gap-2 text-sm text-[#103c68] font-semibold hover:underline">
                    <ImageIcon size={14} />عرض صورة العطل
                  </button>
                )}

                {/* Resolved info */}
                {r.status === "resolved" && r.resolve_notes && (
                  <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm">
                    <span className="font-semibold text-green-800">الحل: </span>
                    <span className="text-green-700">{r.resolve_notes}</span>
                    {r.resolved_by && <span className="text-green-500 text-xs"> — {r.resolved_by}</span>}
                  </div>
                )}

                {/* Resolve button */}
                {r.status === "open" && (
                  <button onClick={() => { setResolving(r); setResolveNotes(""); }}
                    className="w-full flex items-center justify-center gap-2 bg-[#103c68] hover:bg-[#0d3158] text-white py-3 rounded-xl font-bold text-sm transition-colors">
                    <Wrench size={14} />تسجيل الحل
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resolve modal */}
      {resolving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900">تسجيل الحل</h2>
              <button onClick={() => setResolving(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1">
                <div className="flex gap-2"><span className="text-gray-500">السيارة:</span><span className="font-semibold">{resolving.vehicle_plate}</span></div>
                <div className="flex gap-2"><span className="text-gray-500">النوع:</span><span className="font-semibold">{resolving.breakdown_type}</span></div>
                <div className="flex gap-2"><span className="text-gray-500">السائق:</span><span className="font-semibold">{resolving.driver_name || resolving.driver_phone}</span></div>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">وصف الحل / الإصلاح *</label>
                <textarea value={resolveNotes} onChange={e => setResolveNotes(e.target.value)}
                  rows={3} placeholder="مثال: تم تغيير الزيت وفلتر الوقود..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setResolving(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  إلغاء
                </button>
                <button onClick={resolve} disabled={submitting || !resolveNotes.trim()}
                  className="flex-1 py-3 bg-[#103c68] text-white rounded-xl font-black text-sm disabled:opacity-50 hover:bg-[#0d3158] transition-colors flex items-center justify-center gap-2">
                  {submitting ? <><RefreshCw size={13} className="animate-spin" />جاري...</> : <><CheckCircle size={14} />تأكيد الحل</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo modal */}
      {photoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setPhotoModal(null)}>
          <div className="relative max-w-2xl w-full">
            <button onClick={() => setPhotoModal(null)} className="absolute top-2 end-2 z-10 bg-black/60 text-white p-2 rounded-xl hover:bg-black/80">
              <X size={18} />
            </button>
            <img src={photoModal} alt="صورة العطل" className="w-full rounded-2xl object-contain max-h-[80vh]" />
          </div>
        </div>
      )}
    </div>
  );
}
