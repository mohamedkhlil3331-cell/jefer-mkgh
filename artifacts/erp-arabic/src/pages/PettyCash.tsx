import { useEffect, useState } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import {
  DollarSign, Plus, Trash2, RefreshCw, X, Save,
  ArrowUpRight, ArrowDownRight, Search, TrendingUp, Wallet,
} from "lucide-react";

interface Entry {
  id: number; date: string; custodian_name: string; transaction_type: string;
  description: string; amount_in: number; amount_out: number;
  receipt_number: string; balance: number;
}

function fmt(n: number) { return n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function PettyCash() {
  const [rows,       setRows]       = useState<Entry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [openAdd,    setOpenAdd]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [custodian,  setCustodian]  = useRememberedState("petty-cash-custodian-filter", "");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    custodian_name: "", transaction_type: "in",
    description: "", amount_in: "", amount_out: "", receipt_number: "",
  });

  const load = () => {
    setLoading(true);
    const q = custodian ? `?custodian=${encodeURIComponent(custodian)}` : "";
    fetch(`/api/petty-cash${q}`).then(r => r.json()).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, [custodian]);

  const totalIn  = rows.reduce((a, r) => a + (r.amount_in  || 0), 0);
  const totalOut = rows.reduce((a, r) => a + (r.amount_out || 0), 0);
  const balance  = rows[rows.length - 1]?.balance ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/petty-cash", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount_in:  form.transaction_type === "in"  ? form.amount_in  : "0",
          amount_out: form.transaction_type === "out" ? form.amount_out : "0",
        }),
      });
      setOpenAdd(false);
      setForm({ date: new Date().toISOString().slice(0, 10), custodian_name: "", transaction_type: "in", description: "", amount_in: "", amount_out: "", receipt_number: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا القيد؟")) return;
    await fetch(`/api/petty-cash/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Wallet size={22} className="text-emerald-600" />العهدة / الصندوق النثري
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">سجل الإيرادات والمصروفات النثرية</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={() => setOpenAdd(true)}
            className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2e50] transition-colors shadow-sm">
            <Plus size={16} />إضافة قيد
          </button>
        </div>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-600 text-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-white/70 text-xs mb-2">
            <ArrowDownRight size={13} />إجمالي الوارد
          </div>
          <div className="text-xl font-black">{fmt(totalIn)}</div>
          <div className="text-xs text-white/60 mt-0.5">ر.س</div>
        </div>
        <div className="bg-red-500 text-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-white/70 text-xs mb-2">
            <ArrowUpRight size={13} />إجمالي الصادر
          </div>
          <div className="text-xl font-black">{fmt(totalOut)}</div>
          <div className="text-xs text-white/60 mt-0.5">ر.س</div>
        </div>
        <div className={`${balance >= 0 ? "bg-[#103c68]" : "bg-rose-700"} text-white rounded-2xl p-4 shadow-sm`}>
          <div className="flex items-center gap-1.5 text-white/70 text-xs mb-2">
            <Wallet size={13} />الرصيد الحالي
          </div>
          <div className="text-xl font-black">{fmt(balance)}</div>
          <div className="text-xs text-white/60 mt-0.5">ر.س</div>
        </div>
      </div>

      {/* Search custodian */}
      <div className="relative">
        <Search size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="فلترة باسم أمين الصندوق..."
          value={custodian}
          onChange={e => setCustodian(e.target.value)}
          className="w-full border border-gray-200 rounded-xl ps-4 pe-10 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/30"
        />
      </div>

      {/* Ledger */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-14 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <DollarSign size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400">لا توجد قيود نثرية</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-6 px-4 py-3 bg-gray-50 text-xs font-bold text-gray-500 border-b border-gray-100">
            <span>التاريخ</span>
            <span>أمين الصندوق</span>
            <span>البيان</span>
            <span className="text-center text-green-600">وارد</span>
            <span className="text-center text-red-600">صادر</span>
            <span className="text-center text-[#103c68]">الرصيد</span>
          </div>
          {rows.map((row, i) => (
            <div key={row.id} className={`grid grid-cols-6 px-4 py-3 items-center text-sm border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${i === rows.length - 1 ? "bg-blue-50/50" : ""}`}>
              <span className="text-xs text-gray-500">{new Date(row.date).toLocaleDateString("ar-SA")}</span>
              <span className="text-gray-700 truncate text-xs">{row.custodian_name || "—"}</span>
              <span className="text-gray-600 truncate text-xs">{row.description}</span>
              <span className="text-center font-bold text-green-700">{row.amount_in ? fmt(row.amount_in) : "—"}</span>
              <span className="text-center font-bold text-red-600">{row.amount_out ? fmt(row.amount_out) : "—"}</span>
              <div className="flex items-center justify-center gap-1">
                <span className={`font-black text-sm ${row.balance >= 0 ? "text-[#103c68]" : "text-red-600"}`}>{fmt(row.balance)}</span>
                <button onClick={() => del(row.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg ml-1">
                  <Trash2 size={12} className="text-red-400" />
                </button>
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
              <h2 className="font-black text-lg flex items-center gap-2"><Wallet size={18} className="text-emerald-600" />إضافة قيد للعهدة</h2>
              <button onClick={() => setOpenAdd(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Transaction type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">نوع العملية *</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm(f => ({ ...f, transaction_type: "in" }))}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm border transition-all ${
                      form.transaction_type === "in" ? "bg-green-600 text-white border-green-600 shadow-sm" : "bg-white text-gray-600 border-gray-200"
                    }`}>
                    <ArrowDownRight size={16} />وارد (دخول)
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, transaction_type: "out" }))}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm border transition-all ${
                      form.transaction_type === "out" ? "bg-red-500 text-white border-red-500 shadow-sm" : "bg-white text-gray-600 border-gray-200"
                    }`}>
                    <ArrowUpRight size={16} />صادر (خروج)
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">التاريخ *</label>
                  <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">أمين الصندوق *</label>
                  <input required value={form.custodian_name} onChange={e => setForm(f => ({ ...f, custodian_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">البيان *</label>
                <textarea required rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">المبلغ (ر.س) *</label>
                  <input type="number" required min="0" step="0.01"
                    value={form.transaction_type === "in" ? form.amount_in : form.amount_out}
                    onChange={e => setForm(f => form.transaction_type === "in" ? { ...f, amount_in: e.target.value } : { ...f, amount_out: e.target.value })}
                    placeholder="0.00"
                    className={`w-full border rounded-xl px-3 py-3 text-xl font-black text-center focus:outline-none focus:ring-2 bg-gray-50 ${
                      form.transaction_type === "in" ? "border-green-200 focus:ring-green-400/30" : "border-red-200 focus:ring-red-400/30"
                    }`} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم الإيصال</label>
                  <input value={form.receipt_number} onChange={e => setForm(f => ({ ...f, receipt_number: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60">
                  <Save size={16} />{submitting ? "جاري الحفظ..." : "حفظ القيد"}
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
