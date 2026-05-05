import { useEffect, useState } from "react";
import {
  Plane, Plus, CheckCircle, XCircle, Clock, RefreshCw, X, Save,
  Calendar, User, FileText, AlertTriangle, Trash2,
} from "lucide-react";

interface Leave {
  id: number; employee_id: number; employee_name: string;
  leave_type: string; from_date: string; to_date: string;
  days: number; reason: string; status: string;
  reviewed_by: string; created_at: string;
}

const LEAVE_TYPES: Record<string, string> = {
  annual: "سنوية", sick: "مرضية", emergency: "طارئة", unpaid: "بدون راتب",
};
const LEAVE_COLOR: Record<string, string> = {
  annual:    "bg-blue-100 text-blue-700",
  sick:      "bg-red-100 text-red-700",
  emergency: "bg-amber-100 text-amber-700",
  unpaid:    "bg-gray-100 text-gray-600",
};

const STATUS_LABEL: Record<string, string> = { pending: "قيد الانتظار", approved: "مقبول", rejected: "مرفوض" };
const STATUS_COLOR: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-600 border-red-200",
};

export default function Leaves() {
  const [rows,       setRows]       = useState<Leave[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [openAdd,    setOpenAdd]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    employee_name: "", leave_type: "annual", from_date: "", to_date: "", reason: "",
  });

  const load = () => {
    setLoading(true);
    fetch("/api/leave-requests").then(r => r.json()).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/leave-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setOpenAdd(false);
      setForm({ employee_name: "", leave_type: "annual", from_date: "", to_date: "", reason: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const updateStatus = async (id: number, status: "approved" | "rejected") => {
    await fetch(`/api/leave-requests/${id}/status`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewed_by: "المدير" }),
    });
    load();
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا الطلب؟")) return;
    await fetch(`/api/leave-requests/${id}`, { method: "DELETE" });
    load();
  };

  const pending  = rows.filter(r => r.status === "pending").length;
  const approved = rows.filter(r => r.status === "approved").length;

  const calcDays = () => {
    if (!form.from_date || !form.to_date) return 0;
    return Math.max(1, Math.round((new Date(form.to_date).getTime() - new Date(form.from_date).getTime()) / 86400000) + 1);
  };

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Plane size={22} className="text-blue-500" />طلبات الإجازة
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {rows.length} طلب — {pending} قيد الانتظار — {approved} مقبول
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={() => setOpenAdd(true)}
            className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2e50] transition-colors shadow-sm">
            <Plus size={16} />طلب إجازة جديد
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {(pending > 0 || approved > 0) && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-amber-500 text-white rounded-2xl p-4 text-center shadow-sm">
            <div className="text-2xl font-black">{pending}</div>
            <div className="text-xs opacity-80 mt-0.5">قيد الانتظار</div>
          </div>
          <div className="bg-green-600 text-white rounded-2xl p-4 text-center shadow-sm">
            <div className="text-2xl font-black">{approved}</div>
            <div className="text-xs opacity-80 mt-0.5">مقبولة</div>
          </div>
          <div className="bg-red-500 text-white rounded-2xl p-4 text-center shadow-sm">
            <div className="text-2xl font-black">{rows.filter(r => r.status === "rejected").length}</div>
            <div className="text-xs opacity-80 mt-0.5">مرفوضة</div>
          </div>
        </div>
      )}

      {/* Requests list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Plane size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400">لا توجد طلبات إجازة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(leave => (
            <div key={leave.id}
              className={`bg-white rounded-2xl border shadow-sm p-4 transition-shadow hover:shadow-md ${
                leave.status === "pending" ? "border-amber-200" : "border-gray-100"
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <div className="font-bold text-gray-900 flex items-center gap-1.5">
                      <User size={13} className="text-gray-400" />{leave.employee_name}
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-xl font-semibold ${LEAVE_COLOR[leave.leave_type] || "bg-gray-100 text-gray-600"}`}>
                      إجازة {LEAVE_TYPES[leave.leave_type] || leave.leave_type}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {new Date(leave.from_date).toLocaleDateString("ar-SA")} ← {new Date(leave.to_date).toLocaleDateString("ar-SA")}
                    </span>
                    <span className="font-bold text-gray-700">{leave.days} يوم</span>
                  </div>
                  {leave.reason && (
                    <div className="text-xs text-gray-400 truncate">{leave.reason}</div>
                  )}
                  {leave.reviewed_by && (
                    <div className="text-xs text-gray-400 mt-0.5">راجعه: {leave.reviewed_by}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2.5 py-1.5 rounded-xl font-semibold border ${STATUS_COLOR[leave.status] || ""}`}>
                    {STATUS_LABEL[leave.status] || leave.status}
                  </span>
                </div>
              </div>
              {leave.status === "pending" && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                  <button onClick={() => updateStatus(leave.id, "approved")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-colors">
                    <CheckCircle size={14} />قبول
                  </button>
                  <button onClick={() => updateStatus(leave.id, "rejected")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors">
                    <XCircle size={14} />رفض
                  </button>
                  <button onClick={() => del(leave.id)} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50">
                    <Trash2 size={14} className="text-gray-400" />
                  </button>
                </div>
              )}
              {leave.status !== "pending" && (
                <div className="flex justify-end mt-3 pt-3 border-t border-gray-50">
                  <button onClick={() => del(leave.id)} className="p-2 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {openAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setOpenAdd(false)}>
          <div className="bg-white rounded-t-3xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-black text-lg flex items-center gap-2"><Plane size={18} className="text-blue-500" />تقديم طلب إجازة</h2>
              <button onClick={() => setOpenAdd(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">اسم الموظف *</label>
                <input required value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">نوع الإجازة *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(LEAVE_TYPES).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, leave_type: v }))}
                      className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                        form.leave_type === v ? "bg-[#103c68] text-white border-[#103c68] shadow-sm" : "bg-white text-gray-600 border-gray-200"
                      }`}>
                      إجازة {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">من تاريخ *</label>
                  <input type="date" required value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">إلى تاريخ *</label>
                  <input type="date" required value={form.to_date} min={form.from_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
              </div>
              {form.from_date && form.to_date && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-center text-blue-700 font-bold">
                  مدة الإجازة: {calcDays()} يوم
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">سبب الإجازة</label>
                <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60">
                  <Save size={16} />{submitting ? "جاري التقديم..." : "تقديم الطلب"}
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
