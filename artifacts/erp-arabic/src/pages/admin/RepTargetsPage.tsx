import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, X, CheckCircle2, AlertCircle, RefreshCw, Award, Users } from "lucide-react";

interface Rep { id: number; name: string; phone: string; }
interface RepTarget {
  id: number; rep_phone: string; rep_name: string; product_category: string;
  target_qty: number; tier1_qty: number; tier1_bonus: number;
  tier2_qty: number; tier2_bonus: number; tier3_qty: number; tier3_bonus: number;
  period: string; start_date: string | null; end_date: string | null; active: number;
}

const EMPTY_FORM = {
  rep_phone: "", product_category: "", target_qty: "", period: "monthly",
  tier1_qty: "", tier1_bonus: "", tier2_qty: "", tier2_bonus: "",
  tier3_qty: "", tier3_bonus: "", start_date: "", end_date: "",
};

const fmt = (n: number) => (n || 0).toLocaleString("ar-SA", { maximumFractionDigits: 0 });
const token = () => localStorage.getItem("mkgh_token") || "";

export default function RepTargetsPage() {
  const [targets, setTargets] = useState<RepTarget[]>([]);
  const [reps,    setReps]    = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<"new" | RepTarget | null>(null);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState({ type: "", text: "" });

  const load = async () => {
    setLoading(true);
    const [tRes, rRes] = await Promise.all([
      fetch("/api/admin/rep-targets", { headers: { Authorization: `Bearer ${token()}` } }),
      fetch("/api/admin/reps",        { headers: { Authorization: `Bearer ${token()}` } }),
    ]);
    if (tRes.ok) setTargets(await tRes.json());
    if (rRes.ok) setReps(await rRes.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm(EMPTY_FORM); setMsg({ type: "", text: "" }); setModal("new");
  };
  const openEdit = (t: RepTarget) => {
    setForm({
      rep_phone: t.rep_phone, product_category: t.product_category,
      target_qty: String(t.target_qty), period: t.period,
      tier1_qty: String(t.tier1_qty), tier1_bonus: String(t.tier1_bonus),
      tier2_qty: String(t.tier2_qty), tier2_bonus: String(t.tier2_bonus),
      tier3_qty: String(t.tier3_qty), tier3_bonus: String(t.tier3_bonus),
      start_date: t.start_date || "", end_date: t.end_date || "",
    });
    setMsg({ type: "", text: "" });
    setModal(t);
  };

  const save = async () => {
    if (!form.rep_phone || !form.product_category || !form.target_qty) {
      setMsg({ type: "error", text: "المندوب والفئة والهدف مطلوبة" });
      return;
    }
    setSaving(true); setMsg({ type: "", text: "" });
    const isEdit = modal !== "new" && modal !== null;
    const body = {
      rep_phone: form.rep_phone, product_category: form.product_category,
      target_qty: parseFloat(form.target_qty) || 0,
      tier1_qty: parseFloat(form.tier1_qty) || 0, tier1_bonus: parseFloat(form.tier1_bonus) || 0,
      tier2_qty: parseFloat(form.tier2_qty) || 0, tier2_bonus: parseFloat(form.tier2_bonus) || 0,
      tier3_qty: parseFloat(form.tier3_qty) || 0, tier3_bonus: parseFloat(form.tier3_bonus) || 0,
      period: form.period, start_date: form.start_date || null, end_date: form.end_date || null,
      active: 1,
    };
    const url  = isEdit ? `/api/admin/rep-targets/${(modal as RepTarget).id}` : "/api/admin/rep-targets";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body: JSON.stringify(body) });
    if (res.ok) { setModal(null); load(); }
    else { const d = await res.json(); setMsg({ type: "error", text: d.error || "حدث خطأ" }); }
    setSaving(false);
  };

  const del = async (id: number) => {
    if (!confirm("هل تريد حذف هذا التارجت؟")) return;
    await fetch(`/api/admin/rep-targets/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const toggleActive = async (t: RepTarget) => {
    await fetch(`/api/admin/rep-targets/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ ...t, active: t.active ? 0 : 1 }),
    });
    load();
  };

  const f = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2"><Award size={20} className="text-[#103c68]" /> تارجت وبونص المندوبين</h1>
            <p className="text-xs text-gray-400">إدارة أهداف المبيعات والمكافآت لكل مندوب</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={openNew}
              className="flex items-center gap-2 bg-[#103c68] hover:bg-[#0d2e50] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm">
              <Plus size={16} /> إضافة تارجت
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5">
        {loading && (
          <div className="flex justify-center py-16 text-gray-400"><RefreshCw size={28} className="animate-spin" /></div>
        )}

        {!loading && targets.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
            <Award size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-semibold">لا توجد أهداف مضبوطة</p>
            <p className="text-xs mt-1">أضف تارجت لكل مندوب ومنتج لتفعيل نظام البونص</p>
          </div>
        )}

        {!loading && targets.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["المندوب","الفئة","الهدف","المستوى 1","المستوى 2","المستوى 3","الفترة","نشط","إجراءات"]
                      .map(h => <th key={h} className="px-4 py-3 text-xs font-bold text-gray-500 whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {targets.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-gray-900">{t.rep_name}</p>
                          <p className="text-xs text-gray-400">{t.rep_phone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-700">{t.product_category}</td>
                      <td className="px-4 py-3 font-bold text-[#103c68]">{fmt(t.target_qty)}</td>
                      <td className="px-4 py-3 text-xs">
                        {t.tier1_qty > 0 ? <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-lg font-bold">{fmt(t.tier1_qty)} → {fmt(t.tier1_bonus)} ﷼</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {t.tier2_qty > 0 ? <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-lg font-bold">{fmt(t.tier2_qty)} → {fmt(t.tier2_bonus)} ﷼</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {t.tier3_qty > 0 ? <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg font-bold">{fmt(t.tier3_qty)} → {fmt(t.tier3_bonus)} ﷼</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{t.period === "monthly" ? "شهري" : t.period}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleActive(t)}
                          className={`px-3 py-1 rounded-full text-xs font-bold border ${t.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                          {t.active ? "نشط" : "معطل"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => del(t.id)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="bg-[#103c68] text-white px-5 py-4 flex items-center justify-between sticky top-0">
              <h3 className="font-black text-lg">{modal === "new" ? "إضافة تارجت جديد" : "تعديل التارجت"}</h3>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-4">
              {msg.text && (
                <div className={`rounded-xl p-3 flex items-center gap-2 text-sm ${msg.type === "error" ? "bg-red-50 border border-red-200 text-red-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
                  {msg.type === "error" ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />} {msg.text}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">المندوب *</label>
                <select value={form.rep_phone} onChange={f("rep_phone")}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                  <option value="">— اختر مندوب —</option>
                  {reps.map(r => <option key={r.phone} value={r.phone}>{r.name} · {r.phone}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">فئة المنتج *</label>
                  <input value={form.product_category} onChange={f("product_category")} placeholder="مثال: أسمنت"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">الهدف الكلي (وحدة) *</label>
                  <input type="number" min="0" value={form.target_qty} onChange={f("target_qty")} placeholder="1000"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
              </div>

              {/* Tier 1 */}
              <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-yellow-700">المستوى الأول</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">الكمية المطلوبة</label>
                    <input type="number" min="0" value={form.tier1_qty} onChange={f("tier1_qty")} placeholder="300"
                      className="w-full border border-yellow-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">البونص (﷼)</label>
                    <input type="number" min="0" value={form.tier1_bonus} onChange={f("tier1_bonus")} placeholder="500"
                      className="w-full border border-yellow-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" />
                  </div>
                </div>
              </div>

              {/* Tier 2 */}
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-orange-700">المستوى الثاني</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">الكمية المطلوبة</label>
                    <input type="number" min="0" value={form.tier2_qty} onChange={f("tier2_qty")} placeholder="600"
                      className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">البونص (﷼)</label>
                    <input type="number" min="0" value={form.tier2_bonus} onChange={f("tier2_bonus")} placeholder="1000"
                      className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" />
                  </div>
                </div>
              </div>

              {/* Tier 3 */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-emerald-700">المستوى الثالث</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">الكمية المطلوبة</label>
                    <input type="number" min="0" value={form.tier3_qty} onChange={f("tier3_qty")} placeholder="1000"
                      className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">البونص (﷼)</label>
                    <input type="number" min="0" value={form.tier3_bonus} onChange={f("tier3_bonus")} placeholder="2000"
                      className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" />
                  </div>
                </div>
              </div>

              {/* Period & Dates */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">الفترة</label>
                  <select value={form.period} onChange={f("period")}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                    <option value="monthly">شهري</option>
                    <option value="quarterly">ربع سنوي</option>
                    <option value="annual">سنوي</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">من تاريخ</label>
                  <input type="date" value={form.start_date} onChange={f("start_date")}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">إلى تاريخ</label>
                  <input type="date" value={form.end_date} onChange={f("end_date")}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
              </div>

              <button onClick={save} disabled={saving}
                className="w-full bg-[#103c68] hover:bg-[#0d2e50] disabled:opacity-50 text-white font-black py-4 rounded-2xl text-base transition-colors flex items-center justify-center gap-2">
                {saving ? <><RefreshCw size={16} className="animate-spin" /> جاري الحفظ...</> : <><CheckCircle2 size={16} /> حفظ التارجت</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
