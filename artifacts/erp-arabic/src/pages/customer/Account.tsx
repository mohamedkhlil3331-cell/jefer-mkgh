import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Wallet, Plus, CheckCircle } from "lucide-react";

interface Statement {
  customer: Record<string, string>;
  orders: { id: number; order_number: string; product_name: string; total_with_vat: number; stage: string; created_at: string }[];
  transfers: { id: number; amount: number; transfer_date: string; transfer_ref: string; bank_name: string; confirmed: number; transfer_image: string; created_at: string }[];
  summary: { total_orders: number; total_transfers: number; balance: number };
}

export default function Account() {
  const { user } = useAuth();
  const [data, setData] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<"orders"|"transfers">("orders");

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
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setOpenTransfer(false);
      formRef.current.reset();
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const s = data?.summary;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-4">
        <h1 className="font-bold text-xl text-gray-900">حسابي</h1>
        <p className="text-sm text-muted-foreground">{user?.company_name || user?.name}</p>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-5">
        {/* Balance card */}
        <div className={`rounded-2xl p-5 text-white shadow-lg ${(s?.balance ?? 0) >= 0 ? "bg-gradient-to-br from-green-500 to-emerald-600" : "bg-gradient-to-br from-red-500 to-rose-600"}`}>
          <div className="text-sm opacity-80 mb-1">الرصيد الحالي</div>
          <div className="text-3xl font-bold">{s?.balance?.toFixed(2)} <span className="text-lg">ر.س</span></div>
          <div className="text-sm opacity-70 mt-1">{(s?.balance ?? 0) >= 0 ? "رصيد دائن (لك)" : "رصيد مدين (عليك)"}</div>
          <div className="flex gap-4 mt-4 text-sm">
            <div><div className="opacity-70">إجمالي الطلبات</div><div className="font-bold">{s?.total_orders?.toFixed(2)} ر.س</div></div>
            <div><div className="opacity-70">إجمالي التحويلات</div><div className="font-bold">{s?.total_transfers?.toFixed(2)} ر.س</div></div>
          </div>
        </div>

        {/* Add transfer button */}
        <button
          onClick={() => setOpenTransfer(true)}
          className="w-full flex items-center justify-center gap-2 bg-white border-2 border-dashed border-primary text-primary py-3 rounded-2xl font-medium hover:bg-primary/5 transition-colors"
        >
          <Plus size={18} />
          إضافة تحويل بنكي جديد
        </button>

        {/* Tabs */}
        <div className="flex bg-white rounded-2xl border border-gray-100 p-1 shadow-sm">
          {[{id:"orders",label:`الطلبات (${data?.orders.length||0})`},{id:"transfers",label:`التحويلات (${data?.transfers.length||0})`}].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as "orders"|"transfers")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab === t.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "orders" && (
          <div className="space-y-3">
            {(data?.orders || []).map(order => (
              <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs text-primary font-bold">{order.order_number}</div>
                  <div className="font-medium text-sm text-gray-900 mt-0.5">{order.product_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("ar-SA")}</div>
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-900">{order.total_with_vat?.toFixed(2)} ر.س</div>
                  <a href={`/api/portal/customers/${user?.phone}/orders/${order.id}/vat-invoice`} target="_blank"
                    className="text-xs text-primary hover:underline mt-1 block">فاتورة</a>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "transfers" && (
          <div className="space-y-3">
            {(data?.transfers || []).map(t => (
              <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-green-700">{t.amount?.toFixed(2)} ر.س</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.bank_name && `${t.bank_name} — `}{t.transfer_ref}</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.transfer_date).toLocaleDateString("ar-SA")}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {t.confirmed ? (
                      <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full font-medium">
                        <CheckCircle size={12} /> مؤكد
                      </span>
                    ) : (
                      <span className="bg-yellow-100 text-yellow-700 text-xs px-2.5 py-1 rounded-full font-medium">قيد المراجعة</span>
                    )}
                  </div>
                </div>
                {t.transfer_image && (
                  <a href={t.transfer_image} target="_blank" className="text-xs text-primary mt-2 block">عرض صورة التحويل</a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Full statement download */}
        <a
          href={`/api/portal/customers/${user?.phone}/statement`}
          target="_blank"
          className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 py-3 rounded-2xl text-sm font-medium hover:bg-gray-50"
        >
          <Wallet size={16} />
          تحميل كشف حساب كامل (JSON)
        </a>
      </div>

      {/* Transfer modal */}
      {openTransfer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setOpenTransfer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-t-3xl w-full max-w-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-lg">إضافة تحويل بنكي</h2>
            <form ref={formRef} onSubmit={submitTransfer} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">المبلغ (ر.س) *</label>
                  <input type="number" name="amount" required min="1" step="0.01"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">تاريخ التحويل *</label>
                  <input type="date" name="transfer_date" required defaultValue={new Date().toISOString().slice(0,10)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">اسم البنك</label>
                <input name="bank_name" placeholder="مثال: الأهلي، الراجحي..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">رقم المرجع / التحويل</label>
                <input name="transfer_ref"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">صورة التحويل</label>
                <input type="file" name="transfer_image" accept="image/*"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-primary text-white py-3 rounded-xl font-medium disabled:opacity-60">
                  {submitting ? "جاري الإرسال..." : "إرسال التحويل"}
                </button>
                <button type="button" onClick={() => setOpenTransfer(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium">
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
