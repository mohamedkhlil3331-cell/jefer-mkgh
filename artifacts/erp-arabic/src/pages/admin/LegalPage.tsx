import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRememberedState } from "@/hooks/useRememberedState";
import {
  Scale, BookOpen, Gavel, Plus, Search, Edit2, Trash2,
  X, Save, ChevronDown, AlertCircle, CheckCircle, Clock, FileText
} from "lucide-react";

interface LegalDoc {
  id: number; title: string; category: string; doc_number: string;
  published_date: string; content: string; tags: string; created_at: string;
}
interface Hearing {
  id: number; title: string; case_type: string; case_number: string;
  party_name: string; driver_name: string; vehicle_plate: string;
  hearing_date: string; court: string; status: string; notes: string;
  outcome: string; order_number: string; created_at: string;
}

const DOC_CATEGORIES = ["نظام","لائحة","قرار","تعميم","عقد","أخرى"];
const CASE_TYPES = ["مخالفة مرورية","نزاع تجاري","عقد لوجستي","حادث مروري","مطالبة عمالية","أخرى"];
const HEARING_STATUSES = ["مفتوحة","جارية","مؤجلة","مغلقة"];

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    "مفتوحة": "bg-amber-50 text-amber-700 border-amber-200",
    "جارية": "bg-blue-50 text-blue-700 border-blue-200",
    "مؤجلة": "bg-orange-50 text-orange-700 border-orange-200",
    "مغلقة": "bg-green-50 text-green-700 border-green-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg[status] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {status}
    </span>
  );
}

export default function LegalPage() {
  const { user } = useAuth();
  const [tab, setTab] = useRememberedState<"library" | "hearings">("admin-legal-active-tab", "library");

  // ── Legal Docs ────────────────────────────────────────────────────
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [docSearch, setDocSearch] = useRememberedState("admin-legal-documents-search", "");
  const [docCategory, setDocCategory] = useRememberedState("admin-legal-documents-category-filter", "");
  const [docModal, setDocModal] = useState<Partial<LegalDoc> | null>(null);
  const [docSaving, setDocSaving] = useState(false);

  const loadDocs = () => {
    const params = new URLSearchParams();
    if (docSearch) params.set("q", docSearch);
    if (docCategory) params.set("category", docCategory);
    fetch(`/api/legal-docs?${params}`).then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : []));
  };
  useEffect(loadDocs, [docSearch, docCategory]);

  const saveDoc = async () => {
    if (!docModal?.title) return;
    setDocSaving(true);
    const isEdit = !!docModal.id;
    const url = isEdit ? `/api/legal-docs/${docModal.id}` : "/api/legal-docs";
    await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...docModal, created_by: user?.name || user?.phone }),
    });
    setDocSaving(false);
    setDocModal(null);
    loadDocs();
  };

  const deleteDoc = async (id: number) => {
    if (!confirm("أرشفة هذه الوثيقة؟")) return;
    await fetch(`/api/legal-docs/${id}`, { method: "DELETE" });
    loadDocs();
  };

  // ── Hearings ──────────────────────────────────────────────────────
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [hSearch, setHSearch] = useRememberedState("admin-legal-hearings-search", "");
  const [hStatus, setHStatus] = useRememberedState("admin-legal-hearings-status-filter", "");
  const [hModal, setHModal] = useState<Partial<Hearing> | null>(null);
  const [hSaving, setHSaving] = useState(false);

  const loadHearings = () => {
    const params = new URLSearchParams();
    if (hSearch) params.set("q", hSearch);
    if (hStatus) params.set("status", hStatus);
    fetch(`/api/hearings?${params}`).then(r => r.json()).then(d => setHearings(Array.isArray(d) ? d : []));
  };
  useEffect(loadHearings, [hSearch, hStatus]);

  const saveHearing = async () => {
    if (!hModal?.title) return;
    setHSaving(true);
    const isEdit = !!hModal.id;
    const url = isEdit ? `/api/hearings/${hModal.id}` : "/api/hearings";
    await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...hModal, created_by: user?.name || user?.phone }),
    });
    setHSaving(false);
    setHModal(null);
    loadHearings();
  };

  const deleteHearing = async (id: number) => {
    if (!confirm("حذف هذه الجلسة؟")) return;
    await fetch(`/api/hearings/${id}`, { method: "DELETE" });
    loadHearings();
  };

  const openHearings = hearings.filter(h => h.status === "مفتوحة").length;
  const pendingHearings = hearings.filter(h => ["مفتوحة","جارية"].includes(h.status)).length;

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Scale size={20} className="text-amber-700" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">الإطار القانوني والامتثال</h1>
            <p className="text-sm text-gray-500">مكتبة الأنظمة السعودية • متتبع الجلسات</p>
          </div>
        </div>
        <div className="flex gap-2">
          {tab === "library" && (
            <button onClick={() => setDocModal({ category: "نظام" })}
              className="flex items-center gap-2 bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-800 transition-colors">
              <Plus size={15} /> إضافة وثيقة
            </button>
          )}
          {tab === "hearings" && (
            <button onClick={() => setHModal({ case_type: "مخالفة مرورية", status: "مفتوحة" })}
              className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0d2e50] transition-colors">
              <Plus size={15} /> إضافة جلسة
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: BookOpen, label: "وثائق الأنظمة", val: docs.length, color: "bg-amber-50 text-amber-700" },
          { icon: Gavel, label: "إجمالي الجلسات", val: hearings.length, color: "bg-blue-50 text-blue-700" },
          { icon: AlertCircle, label: "جلسات مفتوحة", val: openHearings, color: "bg-red-50 text-red-700" },
          { icon: Clock, label: "قيد المتابعة", val: pendingHearings, color: "bg-orange-50 text-orange-700" },
        ].map(({ icon: Icon, label, val, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center mb-2`}><Icon size={16} /></div>
            <div className="text-2xl font-black text-gray-900">{val}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: "library" as const, label: "مكتبة الأنظمة", icon: BookOpen },
          { key: "hearings" as const, label: "متتبع الجلسات", icon: Gavel },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500"}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Legal Library Tab ── */}
      {tab === "library" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input placeholder="ابحث في الأنظمة والتعاميم..." value={docSearch} onChange={e => setDocSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pr-9 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
              <select value={docCategory} onChange={e => setDocCategory(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white">
                <option value="">جميع التصنيفات</option>
                {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {docs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
              <BookOpen size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-semibold">لا توجد وثائق بعد</p>
              <p className="text-sm text-gray-400">أضف أنظمة ولوائح وتعاميم من الزر أعلاه</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {docs.map(doc => (
                <div key={doc.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200 font-medium">{doc.category}</span>
                      <h3 className="font-bold text-gray-900 mt-1 leading-tight">{doc.title}</h3>
                      {doc.doc_number && <p className="text-xs text-gray-400 mt-0.5">رقم: {doc.doc_number}</p>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setDocModal(doc)} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => deleteDoc(doc.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {doc.content && <p className="text-xs text-gray-500 line-clamp-2 mt-1">{doc.content}</p>}
                  {doc.published_date && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                      <FileText size={11} /> صدر في: {doc.published_date}
                    </div>
                  )}
                  {doc.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {doc.tags.split(",").map(t => (
                        <span key={t} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{t.trim()}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Hearings Tab ── */}
      {tab === "hearings" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input placeholder="ابحث بالعنوان أو الطرف أو رقم القضية..." value={hSearch} onChange={e => setHSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pr-9 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <select value={hStatus} onChange={e => setHStatus(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 bg-white">
                <option value="">جميع الحالات</option>
                {HEARING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {hearings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
              <Gavel size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-semibold">لا توجد جلسات مسجلة</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs">
                  <tr>
                    {["العنوان","نوع القضية","رقم القضية","الطرف الآخر","تاريخ الجلسة","الحالة","إجراء"].map(h => (
                      <th key={h} className="px-4 py-3 text-right font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {hearings.map(h => (
                    <tr key={h.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">{h.title}</td>
                      <td className="px-4 py-3 text-gray-600">{h.case_type}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{h.case_number || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{h.party_name || h.driver_name || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{h.hearing_date ? new Date(h.hearing_date).toLocaleDateString("ar-SA") : "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={h.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setHModal(h)} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => deleteHearing(h.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Doc Modal ── */}
      {docModal !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setDocModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900">{docModal.id ? "تعديل الوثيقة" : "إضافة وثيقة جديدة"}</h3>
              <button onClick={() => setDocModal(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <input placeholder="عنوان الوثيقة *" value={docModal.title || ""} onChange={e => setDocModal(d => ({...d!, title: e.target.value}))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">التصنيف</label>
                <select value={docModal.category || "نظام"} onChange={e => setDocModal(d => ({...d!, category: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white">
                  {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">رقم الوثيقة</label>
                <input placeholder="م/1445" value={docModal.doc_number || ""} onChange={e => setDocModal(d => ({...d!, doc_number: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">تاريخ الإصدار</label>
              <input type="date" value={docModal.published_date || ""} onChange={e => setDocModal(d => ({...d!, published_date: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">محتوى / ملخص</label>
              <textarea rows={4} placeholder="نص النظام أو ملخصه..." value={docModal.content || ""} onChange={e => setDocModal(d => ({...d!, content: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">الوسوم (مفصولة بفاصلة)</label>
              <input placeholder="أسمنت, نقل, عمالة" value={docModal.tags || ""} onChange={e => setDocModal(d => ({...d!, tags: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setDocModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={saveDoc} disabled={docSaving || !docModal.title}
                className="flex-1 py-2.5 bg-amber-700 text-white rounded-xl text-sm font-bold hover:bg-amber-800 disabled:opacity-60 flex items-center justify-center gap-2">
                {docSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hearing Modal ── */}
      {hModal !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setHModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900">{hModal.id ? "تعديل الجلسة" : "إضافة جلسة جديدة"}</h3>
              <button onClick={() => setHModal(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <input placeholder="عنوان الجلسة / القضية *" value={hModal.title || ""} onChange={e => setHModal(h => ({...h!, title: e.target.value}))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">نوع القضية</label>
                <select value={hModal.case_type || "مخالفة مرورية"} onChange={e => setHModal(h => ({...h!, case_type: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 bg-white">
                  {CASE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">رقم القضية</label>
                <input placeholder="Q-2026/..." value={hModal.case_number || ""} onChange={e => setHModal(h => ({...h!, case_number: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">الطرف الآخر / المدعي</label>
                <input placeholder="اسم الطرف" value={hModal.party_name || ""} onChange={e => setHModal(h => ({...h!, party_name: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">السائق المعني</label>
                <input placeholder="اسم السائق" value={hModal.driver_name || ""} onChange={e => setHModal(h => ({...h!, driver_name: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">لوحة السيارة</label>
                <input placeholder="ABC 1234" value={hModal.vehicle_plate || ""} onChange={e => setHModal(h => ({...h!, vehicle_plate: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">تاريخ الجلسة</label>
                <input type="date" value={hModal.hearing_date || ""} onChange={e => setHModal(h => ({...h!, hearing_date: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">المحكمة</label>
              <input placeholder="اسم المحكمة / الجهة" value={hModal.court || ""} onChange={e => setHModal(h => ({...h!, court: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
            </div>
            {hModal.id && (
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">الحالة</label>
                <div className="flex gap-2">
                  {HEARING_STATUSES.map(s => (
                    <button key={s} onClick={() => setHModal(h => ({...h!, status: s}))}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${hModal.status === s ? "bg-[#103c68] text-white border-[#103c68]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">ملاحظات</label>
              <textarea rows={3} value={hModal.notes || ""} onChange={e => setHModal(h => ({...h!, notes: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
            </div>
            {hModal.id && (
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">النتيجة / القرار</label>
                <textarea rows={2} placeholder="نتيجة الجلسة أو قرار المحكمة..." value={hModal.outcome || ""} onChange={e => setHModal(h => ({...h!, outcome: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setHModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={saveHearing} disabled={hSaving || !hModal.title}
                className="flex-1 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d2e50] disabled:opacity-60 flex items-center justify-center gap-2">
                {hSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
