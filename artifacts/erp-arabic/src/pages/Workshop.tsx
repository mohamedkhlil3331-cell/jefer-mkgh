import { useEffect, useState } from "react";
import {
  Wrench, Plus, CheckCircle, Clock, AlertTriangle, RefreshCw,
  X, Car, User, Calendar, DollarSign, ChevronRight, Save,
  TrendingDown, Hash,
} from "lucide-react";

interface Job {
  id: number; vehicle_id: string; issue_desc: string; technician: string;
  status: string; cost: number; start_date: string; end_date: string; created_at: string;
}

const STATUS_LABEL: Record<string, string> = { open: "مفتوح", in_progress: "جاري الإصلاح", done: "منتهٍ" };
const STATUS_COLOR: Record<string, string> = {
  open:        "bg-red-100 text-red-700 border-red-200",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  done:        "bg-green-100 text-green-700 border-green-200",
};
const STATUS_DOT: Record<string, string> = {
  open: "bg-red-500", in_progress: "bg-amber-500", done: "bg-green-500",
};

function fmt(n: number) { return n.toLocaleString("ar-SA", { minimumFractionDigits: 0 }); }

export default function Workshop() {
  const [rows,       setRows]       = useState<Job[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [openAdd,    setOpenAdd]    = useState(false);
  const [updateJob,  setUpdateJob]  = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    vehicle_id: "", issue_desc: "", technician: "",
    start_date: new Date().toISOString().slice(0, 10), cost: "",
  });
  const [upd, setUpd] = useState({ status: "in_progress", end_date: "", cost: "" });

  const load = () => {
    setLoading(true);
    fetch("/api/workshop").then(r => r.json()).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/workshop", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setOpenAdd(false);
      setForm({ vehicle_id: "", issue_desc: "", technician: "", start_date: new Date().toISOString().slice(0, 10), cost: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateJob) return;
    setSubmitting(true);
    try {
      await fetch(`/api/workshop/${updateJob.id}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upd),
      });
      setUpdateJob(null); load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const openCount      = rows.filter(r => r.status === "open").length;
  const inProgressCount= rows.filter(r => r.status === "in_progress").length;
  const doneCount      = rows.filter(r => r.status === "done").length;
  const totalCost      = rows.reduce((a, r) => a + (r.cost || 0), 0);

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Wrench size={22} className="text-[#103c68]" />الورشة والصيانة
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">إدارة أعمال الصيانة والإصلاح</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={() => setOpenAdd(true)}
            className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2e50] transition-colors shadow-sm">
            <Plus size={16} />بلاغ جديد
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "بلاغات مفتوحة",  val: openCount,       color: "bg-red-500 text-white"   },
          { label: "جاري الإصلاح",   val: inProgressCount, color: "bg-amber-500 text-white" },
          { label: "مكتملة",          val: doneCount,       color: "bg-green-600 text-white" },
          { label: "إجمالي التكاليف", val: `${fmt(totalCost)} ر.س`, color: "bg-[#103c68] text-white" },
        ].map(({ label, val, color }) => (
          <div key={label} className={`${color} rounded-2xl p-4 shadow-sm`}>
            <div className="text-2xl font-black">{typeof val === "number" ? val : val}</div>
            <div className="text-xs opacity-80 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Jobs list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Wrench size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400">لا توجد بلاغات صيانة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(job => (
            <div key={job.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                    <Car size={18} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900">{job.vehicle_id}</div>
                    <div className="text-sm text-gray-600 mt-0.5 leading-relaxed">{job.issue_desc}</div>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                      {job.technician && (
                        <span className="flex items-center gap-1"><User size={11} />{job.technician}</span>
                      )}
                      {job.start_date && (
                        <span className="flex items-center gap-1"><Calendar size={11} />
                          {new Date(job.start_date).toLocaleDateString("ar-SA")}
                        </span>
                      )}
                      {job.end_date && (
                        <span className="flex items-center gap-1 text-green-600"><CheckCircle size={11} />
                          {new Date(job.end_date).toLocaleDateString("ar-SA")}
                        </span>
                      )}
                      {job.cost > 0 && (
                        <span className="flex items-center gap-1 text-[#103c68] font-semibold">
                          <DollarSign size={11} />{fmt(job.cost)} ر.س
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border ${STATUS_COLOR[job.status] || "bg-gray-100 text-gray-600"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[job.status] || "bg-gray-400"}`} />
                    {STATUS_LABEL[job.status] || job.status}
                  </span>
                  {job.status !== "done" && (
                    <button
                      onClick={() => { setUpdateJob(job); setUpd({ status: "in_progress", end_date: new Date().toISOString().slice(0, 10), cost: String(job.cost || "") }); }}
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
              <h2 className="font-black text-lg flex items-center gap-2"><Wrench size={18} className="text-[#103c68]" />بلاغ صيانة جديد</h2>
              <button onClick={() => setOpenAdd(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم السيارة *</label>
                <input required value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
                  placeholder="مثال: ABC-1234"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">وصف العطل *</label>
                <textarea required rows={3} value={form.issue_desc} onChange={e => setForm(f => ({ ...f, issue_desc: e.target.value }))}
                  placeholder="اشرح المشكلة بالتفصيل..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">الفني المسؤول</label>
                  <input value={form.technician} onChange={e => setForm(f => ({ ...f, technician: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">تاريخ البدء</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">التكلفة التقديرية (ر.س)</label>
                <input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60 transition-colors">
                  <Save size={16} />{submitting ? "جاري الحفظ..." : "رفع البلاغ"}
                </button>
                <button type="button" onClick={() => setOpenAdd(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update modal */}
      {updateJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setUpdateJob(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-5">
              <Wrench size={20} className="text-[#103c68]" />
              <h2 className="font-black text-lg">تحديث حالة الصيانة</h2>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3 mb-5 text-sm">
              <div className="flex gap-2"><Car size={13} className="text-gray-400 mt-0.5" /><span className="font-bold">{updateJob.vehicle_id}</span></div>
              <div className="text-gray-500 mt-1 text-xs">{updateJob.issue_desc}</div>
            </div>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">الحالة الجديدة</label>
                <select value={upd.status} onChange={e => setUpd(d => ({ ...d, status: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                  <option value="in_progress">جاري الإصلاح</option>
                  <option value="done">منتهٍ</option>
                </select>
              </div>
              {upd.status === "done" && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">تاريخ الانتهاء</label>
                    <input type="date" value={upd.end_date} onChange={e => setUpd(d => ({ ...d, end_date: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">التكلفة الفعلية (ر.س)</label>
                    <input type="number" min="0" step="0.01" value={upd.cost} onChange={e => setUpd(d => ({ ...d, cost: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60">
                  <CheckCircle size={16} />{submitting ? "جاري التحديث..." : "تحديث الحالة"}
                </button>
                <button type="button" onClick={() => setUpdateJob(null)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
