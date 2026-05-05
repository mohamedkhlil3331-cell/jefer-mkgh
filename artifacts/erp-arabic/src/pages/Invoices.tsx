import { useEffect, useRef, useState } from "react";
import {
  FileText, Plus, Trash2, RefreshCw, X, Save,
  Image, ExternalLink, Building2, Calendar, DollarSign,
} from "lucide-react";

interface Invoice {
  id: number; department: string; details: string;
  amount: number; image_url: string | null; created_at: string;
}

const DEPARTMENTS = ["الإدارة", "المشتريات", "المبيعات", "الصيانة", "الأسطول", "الموارد البشرية", "المالية"];
const DEPT_COLOR: Record<string, string> = {
  "الإدارة":          "bg-purple-100 text-purple-700",
  "المشتريات":        "bg-blue-100 text-blue-700",
  "المبيعات":         "bg-green-100 text-green-700",
  "الصيانة":          "bg-amber-100 text-amber-700",
  "الأسطول":          "bg-orange-100 text-orange-700",
  "الموارد البشرية":  "bg-pink-100 text-pink-700",
  "المالية":          "bg-teal-100 text-teal-700",
};

function fmt(n: number) { return n.toLocaleString("ar-SA", { minimumFractionDigits: 2 }); }

export default function Invoices() {
  const [rows,       setRows]       = useState<Invoice[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [openAdd,    setOpenAdd]    = useState(false);
  const [imgSrc,     setImgSrc]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview,    setPreview]    = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/invoices").then(r => r.json()).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;
    setSubmitting(true);
    try {
      const fd = new FormData(formRef.current);
      await fetch("/api/invoices", { method: "POST", body: fd });
      setOpenAdd(false);
      setPreview(null);
      formRef.current.reset();
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذه الفاتورة؟")) return;
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    load();
  };

  const totalAmount = rows.reduce((a, r) => a + (r.amount || 0), 0);

  /* ── Totals by dept ── */
  const deptTotals = DEPARTMENTS.map(d => ({
    dept: d,
    total: rows.filter(r => r.department === d).reduce((a, r) => a + (r.amount || 0), 0),
    count: rows.filter(r => r.department === d).length,
  })).filter(d => d.count > 0);

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <FileText size={22} className="text-[#103c68]" />الفواتير
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">{rows.length} فاتورة — الإجمالي: {fmt(totalAmount)} ر.س</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={() => setOpenAdd(true)}
            className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2e50] transition-colors shadow-sm">
            <Plus size={16} />إضافة فاتورة
          </button>
        </div>
      </div>

      {/* Total by dept */}
      {deptTotals.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4 text-sm">الإنفاق حسب القسم</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {deptTotals.map(({ dept, total, count }) => (
              <div key={dept} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${DEPT_COLOR[dept] || "bg-gray-100 text-gray-600"}`}>{dept}</span>
                <div className="font-black text-gray-900 text-base mt-2">{fmt(total)}</div>
                <div className="text-xs text-gray-400 mt-0.5">{count} فاتورة</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <FileText size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400">لا توجد فواتير مسجّلة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(inv => (
            <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs text-gray-400">#{inv.id}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-xl font-semibold ${DEPT_COLOR[inv.department] || "bg-gray-100 text-gray-600"}`}>
                      {inv.department}
                    </span>
                  </div>
                  {inv.details && (
                    <div className="text-sm text-gray-700 leading-relaxed">{inv.details}</div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Calendar size={11} />{new Date(inv.created_at).toLocaleDateString("ar-SA")}</span>
                    {inv.image_url && (
                      <button onClick={() => setImgSrc(inv.image_url!)}
                        className="flex items-center gap-1 text-[#103c68] font-semibold hover:underline">
                        <Image size={11} />عرض الفاتورة
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2 flex-shrink-0">
                  <div className="text-end">
                    <div className="font-black text-green-700 text-base">{fmt(inv.amount)}</div>
                    <div className="text-xs text-gray-400">ر.س</div>
                  </div>
                  <button onClick={() => del(inv.id)} className="p-2 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image lightbox */}
      {imgSrc && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setImgSrc(null)}>
          <button className="absolute top-4 left-4 p-2 bg-white/20 rounded-xl text-white hover:bg-white/30 transition-colors">
            <X size={20} />
          </button>
          <img src={imgSrc} alt="فاتورة" className="max-w-full max-h-full rounded-2xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Add modal */}
      {openAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setOpenAdd(false); setPreview(null); }}>
          <div className="bg-white rounded-t-3xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-black text-lg flex items-center gap-2"><FileText size={18} className="text-[#103c68]" />إضافة فاتورة</h2>
              <button onClick={() => { setOpenAdd(false); setPreview(null); }} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">القسم *</label>
                <select name="department" required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">التفاصيل</label>
                <textarea name="details" rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none"
                  placeholder="وصف الفاتورة..." />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">المبلغ (ر.س)</label>
                <input type="number" name="amount" step="0.01" min="0" placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xl font-black text-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">صورة الفاتورة</label>
                <input type="file" name="invoice_image" accept="image/*"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#103c68] file:text-white"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setPreview(URL.createObjectURL(f)); else setPreview(null);
                  }} />
                {preview && (
                  <img src={preview} alt="معاينة" className="mt-2 rounded-xl max-h-40 w-full object-contain border border-gray-200" />
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60">
                  <Save size={16} />{submitting ? "جاري الحفظ..." : "حفظ الفاتورة"}
                </button>
                <button type="button" onClick={() => { setOpenAdd(false); setPreview(null); }}
                  className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
