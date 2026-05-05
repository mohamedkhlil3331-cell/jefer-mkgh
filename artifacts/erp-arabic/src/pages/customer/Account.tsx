import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Wallet, Plus, CheckCircle, Clock, FileText, Download,
  ArrowUpRight, ArrowDownRight, Banknote, RefreshCw,
  Building2, Phone, CreditCard, ExternalLink, X,
} from "lucide-react";

interface Order {
  id: number; order_number: string; product_name: string;
  total_with_vat: number; stage: string; created_at: string;
}
interface Transfer {
  id: number; amount: number; transfer_date: string; transfer_ref: string;
  bank_name: string; confirmed: number; transfer_image: string; created_at: string;
}
interface Statement {
  customer: Record<string, string>;
  orders: Order[];
  transfers: Transfer[];
  summary: { total_orders: number; total_transfers: number; balance: number };
}

const STAGE_LABEL: Record<string, string> = {
  pending: "انتظار المراجعة", payment_confirmed: "تم تأكيد الدفع",
  vehicle_assigned: "جاري التجهيز", invoiced: "صدرت الفاتورة",
  loaded: "في الطريق", delivered: "تم التسليم", cancelled: "ملغي",
};
const STAGE_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  payment_confirmed: "bg-blue-100 text-blue-700",
  vehicle_assigned: "bg-indigo-100 text-indigo-700",
  invoiced: "bg-purple-100 text-purple-700",
  loaded: "bg-cyan-100 text-cyan-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const BANKS = ["بنك الأهلي", "بنك الراجحي", "بنك الرياض", "البنك السعودي للاستثمار", "بنك البلاد", "بنك الجزيرة", "بنك البنك البريطاني", "مصرف الإنماء", "بنك عبد العزيز", "أخرى"];

export default function Account() {
  const { user } = useAuth();
  const [data,          setData]          = useState<Statement | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [openTransfer,  setOpenTransfer]  = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [tab,           setTab]           = useState<"orders" | "transfers">("orders");
  const formRef = useRef<HTMLFormElement>(null);

  const load = () => {
    if (!user) return;
    setLoading(true);
    fetch(`/api/portal/customers/${user.phone}/statement`)
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  };
  useEffect(load, [user]);

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current || !user) return;
    setSubmitting(true);
    const fd = new FormData(formRef.current);
    fd.append("customer_phone", user.phone);
    fd.append("customer_name", user.name);
    try {
      const res = await fetch("/api/portal/transfers", { method: "POST", body: fd });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error);
      setOpenTransfer(false);
      formRef.current.reset();
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#103c68] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const s = data?.summary;
  const balance = s?.balance ?? 0;
  const creditBalance = balance >= 0;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Sticky header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-black text-xl text-gray-900">حسابي</h1>
            <p className="text-sm text-gray-400">{user?.company_name || user?.name}</p>
          </div>
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <RefreshCw size={16} className="text-gray-400" />
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {/* ── Balance card ── */}
        <div className={`rounded-3xl p-6 text-white shadow-xl relative overflow-hidden ${
          creditBalance
            ? "bg-gradient-to-bl from-green-500 to-emerald-700"
            : "bg-gradient-to-bl from-red-500 to-rose-700"
        }`}>
          <div className="absolute top-0 start-0 w-full h-full">
            {[200, 300, 400].map((s, i) => (
              <div key={i} className="absolute rounded-full border border-white/10"
                style={{ width: s, height: s, top: "50%", right: "-20%", transform: "translateY(-50%)" }} />
            ))}
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 text-white/70 text-sm mb-3">
              {creditBalance ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              {creditBalance ? "رصيد دائن — لك علينا" : "رصيد مدين — عليك لنا"}
            </div>
            <div className="text-4xl font-black mb-1 tracking-tight">
              {Math.abs(balance).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-white/70 text-sm">ريال سعودي</div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="bg-white/15 rounded-2xl p-3">
                <div className="flex items-center gap-1.5 text-white/60 text-xs mb-1">
                  <ArrowDownRight size={12} />إجمالي الطلبات
                </div>
                <div className="font-bold text-sm">{s?.total_orders?.toFixed(2)} ر.س</div>
              </div>
              <div className="bg-white/15 rounded-2xl p-3">
                <div className="flex items-center gap-1.5 text-white/60 text-xs mb-1">
                  <ArrowUpRight size={12} />إجمالي التحويلات
                </div>
                <div className="font-bold text-sm">{s?.total_transfers?.toFixed(2)} ر.س</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Customer info ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="space-y-2.5">
            {[
              { icon: Building2, label: "الشركة",    val: data?.customer?.company_name || "—"  },
              { icon: Phone,     label: "الجوال",     val: user?.phone || "—"                    },
              { icon: CreditCard,label: "الرقم الضريبي", val: data?.customer?.vat_number || "—" },
            ].map(({ icon: Icon, label, val }) => (
              <div key={label} className="flex items-center gap-3 py-1">
                <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Icon size={13} className="text-gray-400" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-gray-400">{label}</div>
                  <div className="text-sm font-semibold text-gray-800">{val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Add transfer ── */}
        <button onClick={() => setOpenTransfer(true)}
          className="w-full flex items-center justify-center gap-2 bg-[#103c68] hover:bg-[#0d2e50] text-white py-4 rounded-2xl font-bold shadow-lg transition-colors">
          <Plus size={18} />إضافة تحويل بنكي جديد
        </button>

        {/* ── Download statement ── */}
        <a href={`/api/portal/customers/${user?.phone}/statement`} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-600 py-3 rounded-2xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
          <Download size={15} />تحميل كشف الحساب الكامل
          <ExternalLink size={12} className="text-gray-400" />
        </a>

        {/* ── Tabs ── */}
        <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl">
          {([
            { id: "orders",    label: `الطلبات (${data?.orders.length || 0})`       },
            { id: "transfers", label: `التحويلات (${data?.transfers.length || 0})` },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Orders list ── */}
        {tab === "orders" && (
          <div className="space-y-3">
            {(data?.orders || []).length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
                <FileText size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد طلبات بعد</p>
              </div>
            ) : (data?.orders || []).map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-[#103c68] font-bold">{order.order_number}</div>
                    <div className="font-semibold text-gray-900 text-sm mt-0.5 truncate">{order.product_name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(order.created_at).toLocaleDateString("ar-SA", { day: "numeric", month: "long" })}
                    </div>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <div className="font-black text-gray-900">{order.total_with_vat?.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">ر.س</div>
                    <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLOR[order.stage] || "bg-gray-100 text-gray-600"}`}>
                      {STAGE_LABEL[order.stage] || order.stage}
                    </span>
                  </div>
                </div>
                {order.stage === "delivered" && (
                  <div className="mt-3 pt-3 border-t border-gray-50">
                    <a href={`/api/portal/customers/${user?.phone}/orders/${order.id}/vat-invoice`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-[#103c68] font-semibold hover:underline">
                      <FileText size={12} />تحميل الفاتورة الضريبية
                      <ExternalLink size={10} />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Transfers list ── */}
        {tab === "transfers" && (
          <div className="space-y-3">
            {(data?.transfers || []).length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
                <Banknote size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد تحويلات بعد</p>
              </div>
            ) : (data?.transfers || []).map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-emerald-700 text-lg">{t.amount?.toFixed(2)} <span className="text-sm font-normal">ر.س</span></div>
                    {t.bank_name && <div className="text-sm text-gray-600 mt-0.5">{t.bank_name}</div>}
                    {t.transfer_ref && <div className="text-xs text-gray-400 font-mono mt-0.5">{t.transfer_ref}</div>}
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(t.transfer_date).toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {t.confirmed ? (
                      <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs px-2.5 py-1.5 rounded-xl font-semibold">
                        <CheckCircle size={12} />مؤكد
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs px-2.5 py-1.5 rounded-xl font-semibold">
                        <Clock size={12} />قيد المراجعة
                      </span>
                    )}
                  </div>
                </div>
                {t.transfer_image && (
                  <a href={t.transfer_image} target="_blank" rel="noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-xs text-[#103c68] font-semibold hover:underline">
                    <ExternalLink size={11} />عرض صورة الحوالة
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Transfer modal (bottom sheet) ── */}
      {openTransfer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setOpenTransfer(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-t-3xl w-full max-w-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
              <h2 className="font-black text-lg text-gray-900">إضافة تحويل بنكي</h2>
              <button onClick={() => setOpenTransfer(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <form ref={formRef} onSubmit={submitTransfer} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">المبلغ (ر.س) *</label>
                  <input type="number" name="amount" required min="1" step="0.01" placeholder="0.00"
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 font-bold text-center" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">تاريخ التحويل *</label>
                  <input type="date" name="transfer_date" required defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">البنك</label>
                <select name="bank_name"
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                  <option value="">اختر البنك</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم المرجع / الحوالة</label>
                <input name="transfer_ref" placeholder="ادخل رقم مرجع التحويل"
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">صورة إيصال التحويل</label>
                <input type="file" name="transfer_image" accept="image/*"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#103c68] file:text-white" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                سيتم مراجعة التحويل وتأكيده من فريق الحسابات خلال 24 ساعة.
              </div>
              <div className="flex gap-3 pb-2">
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60 transition-colors shadow-sm">
                  {submitting ? "جاري الإرسال..." : "إرسال التحويل"}
                </button>
                <button type="button" onClick={() => setOpenTransfer(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
