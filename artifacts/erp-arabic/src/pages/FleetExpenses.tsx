import { useEffect, useState } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import {
  Fuel, Plus, Trash2, RefreshCw, X, Save, Car, Calendar,
  DollarSign, Hash, Filter, TrendingDown, FileText,
} from "lucide-react";

interface Expense {
  id: number; date: string; car_id: string; expense_category: string;
  description: string; amount: number; document_number: string;
}

const CATEGORIES = ["وقود", "زيوت وفلاتر", "إطارات", "قطع غيار", "رسوم تسجيل", "غرامات", "رواتب سائقين", "ورشة خارجية", "أخرى"];

const CAT_COLOR: Record<string, string> = {
  "وقود":          "bg-orange-100 text-orange-700",
  "زيوت وفلاتر":  "bg-yellow-100 text-yellow-700",
  "إطارات":        "bg-gray-100 text-gray-700",
  "قطع غيار":      "bg-blue-100 text-blue-700",
  "رسوم تسجيل":   "bg-purple-100 text-purple-700",
  "غرامات":        "bg-red-100 text-red-700",
  "رواتب سائقين": "bg-green-100 text-green-700",
  "ورشة خارجية":  "bg-indigo-100 text-indigo-700",
  "أخرى":          "bg-gray-100 text-gray-500",
};

function fmt(n: number) { return n.toLocaleString("ar-SA", { minimumFractionDigits: 0 }); }

export default function FleetExpenses() {
  const [rows,       setRows]       = useState<Expense[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [openAdd,    setOpenAdd]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterCat,  setFilterCat]  = useRememberedState("fleet-expenses-category-filter", "الكل");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    car_id: "", expense_category: "وقود",
    description: "", amount: "", document_number: "",
  });

  const load = () => {
    setLoading(true);
    fetch("/api/fleet-expenses").then(r => r.json()).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const displayed = filterCat === "الكل" ? rows : rows.filter(r => r.expense_category === filterCat);
  const total     = rows.reduce((a, r) => a + (r.amount || 0), 0);
  const dispTotal = displayed.reduce((a, r) => a + (r.amount || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/fleet-expenses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setOpenAdd(false);
      setForm({ date: new Date().toISOString().slice(0, 10), car_id: "", expense_category: "وقود", description: "", amount: "", document_number: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا المصروف؟")) return;
    await fetch(`/api/fleet-expenses/${id}`, { method: "DELETE" });
    load();
  };

  /* ── Cat totals for summary ── */
  const catTotals = CATEGORIES.map(c => ({
    name: c,
    total: rows.filter(r => r.expense_category === c).reduce((a, r) => a + (r.amount || 0), 0),
    count: rows.filter(r => r.expense_category === c).length,
  })).filter(c => c.count > 0);

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Fuel size={22} className="text-orange-500" />مصاريف الأسطول
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">{rows.length} قيد — الإجمالي: {fmt(total)} ر.س</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={() => setOpenAdd(true)}
            className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2e50] transition-colors shadow-sm">
            <Plus size={16} />إضافة مصروف
          </button>
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-gradient-to-br from-[#103c68] to-[#0eb5cb] rounded-3xl p-5 text-white shadow-xl">
        <div className="text-white/70 text-sm mb-1">إجمالي مصاريف الأسطول</div>
        <div className="text-4xl font-black mb-4">{fmt(total)} <span className="text-lg font-normal opacity-70">ر.س</span></div>
        <div className="grid grid-cols-2 gap-2">
          {catTotals.slice(0, 4).map(c => (
            <div key={c.name} className="bg-white/15 rounded-2xl p-2.5">
              <div className="text-xs opacity-70">{c.name}</div>
              <div className="font-bold text-sm mt-0.5">{fmt(c.total)} ر.س</div>
            </div>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {["الكل", ...CATEGORIES.filter(c => rows.some(r => r.expense_category === c))].map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              filterCat === cat ? "bg-[#103c68] text-white border-[#103c68] shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Expenses list */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <TrendingDown size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400">لا توجد مصاريف مسجّلة</p>
        </div>
      ) : (
        <>
          {filterCat !== "الكل" && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 text-sm text-orange-700 font-semibold">
              إجمالي {filterCat}: {fmt(dispTotal)} ر.س ({displayed.length} قيد)
            </div>
          )}
          <div className="space-y-2">
            {displayed.map(exp => (
              <div key={exp.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-xs px-2.5 py-1 rounded-xl font-semibold ${CAT_COLOR[exp.expense_category] || "bg-gray-100 text-gray-600"}`}>
                      {exp.expense_category}
                    </span>
                    {exp.car_id && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 font-mono">
                        <Car size={10} />{exp.car_id}
                      </span>
                    )}
                    {exp.document_number && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Hash size={10} />{exp.document_number}
                      </span>
                    )}
                  </div>
                  {exp.description && <div className="text-sm text-gray-600 truncate">{exp.description}</div>}
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <Calendar size={10} />{new Date(exp.date).toLocaleDateString("ar-SA")}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-end">
                    <div className="font-black text-red-600">{fmt(exp.amount)}</div>
                    <div className="text-xs text-gray-400">ر.س</div>
                  </div>
                  <button onClick={() => del(exp.id)} className="p-2 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add modal */}
      {openAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setOpenAdd(false)}>
          <div className="bg-white rounded-t-3xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-black text-lg flex items-center gap-2"><Fuel size={18} className="text-orange-500" />إضافة مصروف أسطول</h2>
              <button onClick={() => setOpenAdd(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">التاريخ *</label>
                  <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم السيارة</label>
                  <input value={form.car_id} onChange={e => setForm(f => ({ ...f, car_id: e.target.value }))}
                    placeholder="ABC-1234"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">الفئة *</label>
                  <select required value={form.expense_category} onChange={e => setForm(f => ({ ...f, expense_category: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم المستند</label>
                  <input value={form.document_number} onChange={e => setForm(f => ({ ...f, document_number: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">الوصف</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">المبلغ (ر.س) *</label>
                <input type="number" required min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xl font-black text-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60">
                  <Save size={16} />{submitting ? "جاري الحفظ..." : "حفظ المصروف"}
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
