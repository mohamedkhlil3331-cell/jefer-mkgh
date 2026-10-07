import { useEffect, useState } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import {
  FileText, Clock, CheckCircle, XCircle, Users, TrendingUp,
  HeartPulse, CalendarDays, LogOut, Plus, X, Check,
  ChevronDown, Search, RefreshCw, Briefcase,
} from "lucide-react";

interface HRRequest {
  id: number;
  employee_id: number | null;
  employee_name: string;
  employee_job: string;
  employee_dept: string;
  request_type: string;
  details: string;
  from_date: string;
  to_date: string;
  days: number;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string;
  review_notes: string;
  created_at: string;
}

interface Stats {
  total: number; pending: number; approved: number; rejected: number;
  vacation: number; sick: number; salary: number; resign: number;
}

const REQUEST_TYPES = ["الكل","إجازة سنوية","إجازة مرضية","إجازة طارئة","زيادة راتب","استقالة","شكوى","طلب نقل","أخرى"];
const STATUS_FILTER = ["الكل","pending","approved","rejected"];
const STATUS_LABELS: Record<string, string> = { pending: "قيد المراجعة", approved: "موافق عليه", rejected: "مرفوض" };
const STATUS_CLS: Record<string, string> = {
  pending:  "bg-amber-50  text-amber-700  border border-amber-200",
  approved: "bg-green-50  text-green-700  border border-green-200",
  rejected: "bg-red-50    text-red-700    border border-red-200",
};
const TYPE_ICON: Record<string, typeof CalendarDays> = {
  "إجازة سنوية":  CalendarDays,
  "إجازة مرضية":  HeartPulse,
  "إجازة طارئة":  CalendarDays,
  "زيادة راتب":   TrendingUp,
  "استقالة":      LogOut,
  "شكوى":         FileText,
  "طلب نقل":      Briefcase,
  "أخرى":         FileText,
};
const TYPE_COLOR: Record<string, string> = {
  "إجازة سنوية":  "bg-blue-100 text-blue-600",
  "إجازة مرضية":  "bg-red-100 text-red-600",
  "إجازة طارئة":  "bg-orange-100 text-orange-600",
  "زيادة راتب":   "bg-green-100 text-green-600",
  "استقالة":      "bg-gray-100 text-gray-600",
  "شكوى":         "bg-yellow-100 text-yellow-600",
  "طلب نقل":      "bg-purple-100 text-purple-600",
  "أخرى":         "bg-slate-100 text-slate-600",
};

const EMPTY_REQUEST = { employee_name:"", employee_job:"", employee_dept:"", request_type:"إجازة سنوية", details:"", from_date:"", to_date:"" };

export default function HRRequestsPage() {
  const [requests, setRequests] = useState<HRRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useRememberedState("admin-hr-requests-search", "");
  const [filterType, setFilterType] = useRememberedState("admin-hr-requests-type-filter", "الكل");
  const [filterStatus, setFilterStatus] = useRememberedState("admin-hr-requests-status-filter", "الكل");
  const [modal, setModal] = useState<{ open: boolean; req: Partial<HRRequest> | null }>({ open: false, req: null });
  const [reviewModal, setReviewModal] = useState<{ open: boolean; req: HRRequest | null }>({ open: false, req: null });
  const [reviewNotes, setReviewNotes] = useState("");
  const [newReq, setNewReq] = useState<typeof EMPTY_REQUEST>({ ...EMPTY_REQUEST });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/hr-requests?status=${filterStatus}&type=${filterType}`).then(r => r.json()),
      fetch("/api/hr-requests/stats").then(r => r.json()),
    ]).then(([rows, s]) => {
      setRequests(Array.isArray(rows) ? rows : []);
      setStats(s);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filterStatus, filterType]);

  const filtered = requests.filter(r =>
    !search || r.employee_name.includes(search) || r.request_type.includes(search) || r.employee_dept?.includes(search)
  );

  const submitNew = async () => {
    if (!newReq.employee_name || !newReq.request_type) return;
    setSaving(true);
    await fetch("/api/hr-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newReq),
    });
    setSaving(false);
    setModal({ open: false, req: null });
    setNewReq({ ...EMPTY_REQUEST });
    load();
  };

  const updateStatus = async (id: number, status: "approved" | "rejected") => {
    await fetch(`/api/hr-requests/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewed_by: "الإدارة", review_notes: reviewNotes }),
    });
    setReviewModal({ open: false, req: null });
    setReviewNotes("");
    load();
  };

  const deleteReq = async (id: number) => {
    if (!confirm("حذف هذا الطلب؟")) return;
    await fetch(`/api/hr-requests/${id}`, { method: "DELETE" });
    load();
  };

  const KPI = ({ label, value, icon: Icon, color, sub }: { label: string; value: number; icon: typeof Clock; color: string; sub?: string }) => (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
        <span className="text-2xl font-black text-gray-800">{value}</span>
      </div>
      <div className="text-sm font-semibold text-gray-700">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#103c68]">طلبات الموارد البشرية</h1>
          <p className="text-sm text-gray-500 mt-0.5">إدارة طلبات الموظفين — إجازات · رواتب · استقالات · شكاوى</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50"><RefreshCw size={16} /></button>
          <button onClick={() => setModal({ open: true, req: null })}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-semibold hover:bg-[#0d3158]">
            <Plus size={16} />طلب جديد
          </button>
        </div>
      </div>

      {/* KPI cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="col-span-2 sm:col-span-2"><KPI label="إجمالي الطلبات" value={stats.total} icon={FileText} color="bg-blue-100 text-blue-600" /></div>
          <div className="col-span-2 sm:col-span-2"><KPI label="قيد المراجعة" value={stats.pending} icon={Clock} color="bg-amber-100 text-amber-600" sub="يحتاج إجراء" /></div>
          <div className="col-span-2 sm:col-span-2"><KPI label="مُوافق عليها" value={stats.approved} icon={CheckCircle} color="bg-green-100 text-green-600" /></div>
          <div className="col-span-2 sm:col-span-2"><KPI label="مرفوضة" value={stats.rejected} icon={XCircle} color="bg-red-100 text-red-600" /></div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-3">
            <CalendarDays size={16} className="text-blue-500 flex-shrink-0" />
            <div><div className="text-lg font-black text-blue-700">{stats.vacation}</div><div className="text-xs text-blue-500">إجازات</div></div>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-3">
            <HeartPulse size={16} className="text-red-500 flex-shrink-0" />
            <div><div className="text-lg font-black text-red-700">{stats.sick}</div><div className="text-xs text-red-500">مرضية</div></div>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-3">
            <TrendingUp size={16} className="text-green-500 flex-shrink-0" />
            <div><div className="text-lg font-black text-green-700">{stats.salary}</div><div className="text-xs text-green-500">زيادة راتب</div></div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3">
            <LogOut size={16} className="text-gray-500 flex-shrink-0" />
            <div><div className="text-lg font-black text-gray-700">{stats.resign}</div><div className="text-xs text-gray-500">استقالات</div></div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو القسم أو نوع الطلب..."
            className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none">
          {REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white">
          {STATUS_FILTER.map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 text-xs font-medium transition-colors
                ${filterStatus === s ? "bg-[#103c68] text-white" : "text-gray-500 hover:bg-gray-50"}`}>
              {s === "الكل" ? "الكل" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Requests list */}
      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-[#103c68]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>لا توجد طلبات</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(req => {
            const TypeIcon = TYPE_ICON[req.request_type] || FileText;
            const typeColor = TYPE_COLOR[req.request_type] || "bg-gray-100 text-gray-600";
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeColor}`}>
                    <TypeIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">{req.employee_name}</h3>
                        <p className="text-xs text-gray-400">{req.employee_job} · {req.employee_dept}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${STATUS_CLS[req.status] || STATUS_CLS.pending}`}>
                          {STATUS_LABELS[req.status] || req.status}
                        </span>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${typeColor}`}>{req.request_type}</span>
                      </div>
                    </div>

                    {req.details && (
                      <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded-lg px-3 py-2">{req.details}</p>
                    )}

                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
                      {req.from_date && (
                        <span>من: <span className="text-gray-600 font-medium">{req.from_date}</span></span>
                      )}
                      {req.to_date && (
                        <span>إلى: <span className="text-gray-600 font-medium">{req.to_date}</span></span>
                      )}
                      {req.days && (
                        <span>المدة: <span className="text-gray-600 font-medium">{req.days} يوم</span></span>
                      )}
                      <span>{new Date(req.created_at).toLocaleDateString("ar-SA")}</span>
                    </div>

                    {req.review_notes && (
                      <div className="mt-2 text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
                        <span className="text-blue-500 font-semibold">ملاحظة المراجع: </span>
                        <span className="text-blue-700">{req.review_notes}</span>
                        {req.reviewed_by && <span className="text-blue-400"> — {req.reviewed_by}</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {req.status === "pending" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                    <button onClick={() => { setReviewModal({ open: true, req }); setReviewNotes(""); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700">
                      <Check size={13} />موافقة
                    </button>
                    <button onClick={() => { setReviewModal({ open: true, req }); setReviewNotes(""); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600"
                      data-action="reject">
                      <X size={13} />رفض
                    </button>
                    <button onClick={() => deleteReq(req.id)}
                      className="mr-auto flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50">
                      حذف
                    </button>
                  </div>
                )}
                {req.status !== "pending" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                    <button onClick={() => deleteReq(req.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-400 rounded-lg text-xs hover:bg-gray-50">
                      حذف
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Review modal */}
      {reviewModal.open && reviewModal.req && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">مراجعة الطلب</h2>
              <button onClick={() => setReviewModal({ open: false, req: null })} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-semibold text-gray-800">{reviewModal.req.employee_name}</p>
                <p className="text-sm text-gray-500">{reviewModal.req.request_type}</p>
                {reviewModal.req.details && <p className="text-sm text-gray-600 mt-2">{reviewModal.req.details}</p>}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">ملاحظات المراجع (اختياري)</label>
                <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={3}
                  placeholder="أضف ملاحظة للموظف..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => updateStatus(reviewModal.req!.id, "approved")}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700">
                <CheckCircle size={15} />موافقة
              </button>
              <button onClick={() => updateStatus(reviewModal.req!.id, "rejected")}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">
                <XCircle size={15} />رفض
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New request modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal({ open: false, req: null })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Plus size={18} className="text-[#103c68]" />تقديم طلب جديد</h2>
              <button onClick={() => setModal({ open: false, req: null })} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">اسم الموظف *</label>
                  <input value={newReq.employee_name} onChange={e => setNewReq(p => ({ ...p, employee_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" placeholder="الاسم الكامل" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">الوظيفة</label>
                  <input value={newReq.employee_job} onChange={e => setNewReq(p => ({ ...p, employee_job: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" placeholder="المسمى الوظيفي" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">القسم / الفرع</label>
                  <input value={newReq.employee_dept} onChange={e => setNewReq(p => ({ ...p, employee_dept: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" placeholder="مثال: النقليات" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">نوع الطلب *</label>
                  <div className="relative">
                    <select value={newReq.request_type} onChange={e => setNewReq(p => ({ ...p, request_type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 appearance-none bg-white">
                      {REQUEST_TYPES.filter(t => t !== "الكل").map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              {(newReq.request_type.startsWith("إجازة")) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">من تاريخ</label>
                    <input type="date" value={newReq.from_date} onChange={e => setNewReq(p => ({ ...p, from_date: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">إلى تاريخ</label>
                    <input type="date" value={newReq.to_date} onChange={e => setNewReq(p => ({ ...p, to_date: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">تفاصيل الطلب</label>
                <textarea value={newReq.details} onChange={e => setNewReq(p => ({ ...p, details: e.target.value }))} rows={3}
                  placeholder="اكتب تفاصيل الطلب هنا..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setModal({ open: false, req: null })}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={submitNew} disabled={saving || !newReq.employee_name}
                className="flex-1 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-semibold hover:bg-[#0d3158] disabled:opacity-50">
                {saving ? "جاري الحفظ..." : "تقديم الطلب"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
