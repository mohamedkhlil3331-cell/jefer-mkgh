import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  CheckCircle, Clock, XCircle, RefreshCw, AlertTriangle,
  DollarSign, FileText, Search, Eye, X, ArrowRight,
  TrendingUp, Users, ShieldCheck, BanknoteIcon, BarChart3,
} from "lucide-react";

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string;
  total_before_vat: number; vat_amount: number; total_with_vat: number;
  delivery_location: string; destination_type: string; stage: string;
  rep_id: number; payment_transfer_ref: string; payment_amount: number;
  reviewer_name: string; review_date: string; created_at: string;
}
interface Transfer {
  id: number; customer_phone: string; customer_name: string; amount: number;
  transfer_date: string; transfer_ref: string; bank_name: string;
  confirmed: number; transfer_image: string; created_at: string;
}

const STAGE_AR: Record<string, string> = {
  pending: "انتظار التأكيد", payment_confirmed: "مؤكد", vehicle_assigned: "تم تعيين سيارة",
  invoiced: "تم الفوترة", loaded: "محمّل", delivered: "مُسلَّم", cancelled: "ملغي",
};
const STAGE_COLOR: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  payment_confirmed: "bg-green-50 text-green-700 border-green-200",
  vehicle_assigned: "bg-blue-50 text-blue-700 border-blue-200",
  invoiced: "bg-purple-50 text-purple-700 border-purple-200",
  loaded: "bg-cyan-50 text-cyan-700 border-cyan-200",
  delivered: "bg-teal-50 text-teal-700 border-teal-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

export default function ReviewerOrders() {
  const { user } = useAuth();
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<"dashboard" | "pending" | "all" | "transfers">("dashboard");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [transferRef,   setTransferRef]   = useState("");
  const [paymentAmt,    setPaymentAmt]    = useState("");
  const [search,        setSearch]        = useState("");
  const [submitting,    setSubmitting]    = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/workflow/orders?role=reviewer").then(r => r.json()),
      fetch("/api/portal/transfers").then(r => r.json()),
    ]).then(([o, t]) => {
      setOrders(Array.isArray(o) ? o : []);
      setTransfers(Array.isArray(t) ? t : []);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const confirmPayment = async () => {
    if (!selectedOrder || !user) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/confirm-payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewer_phone: user.phone, reviewer_name: user.name,
          payment_transfer_ref: transferRef, payment_amount: paymentAmt,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedOrder(null); setTransferRef(""); setPaymentAmt("");
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const confirmTransfer = async (id: number) => {
    await fetch(`/api/portal/transfers/${id}/confirm`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer_phone: user?.phone }),
    });
    load();
  };

  const cancelOrder = async (id: number) => {
    const reason = prompt("سبب الإلغاء:");
    if (reason === null) return;
    const res = await fetch(`/api/workflow/orders/${id}/cancel`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, caller_phone: user?.phone }),
    });
    if (!res.ok) { const e = await res.json(); alert(e.error || "خطأ"); return; }
    load();
  };

  const pendingOrders    = useMemo(() => orders.filter(o => o.stage === "pending"), [orders]);
  const confirmedOrders  = useMemo(() => orders.filter(o => o.stage !== "pending" && o.stage !== "cancelled"), [orders]);
  const pendingTransfers = useMemo(() => transfers.filter(t => !t.confirmed), [transfers]);
  const totalRevenue     = useMemo(() => orders.filter(o => o.stage === "delivered").reduce((s, o) => s + (o.total_with_vat || 0), 0), [orders]);

  const filteredAll = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o =>
      !q || o.order_number?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.customer_phone?.includes(q)
    );
  }, [orders, search]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={22} className="animate-spin text-[#103c68]" />
    </div>
  );

  const StagePill = ({ stage }: { stage: string }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${STAGE_COLOR[stage] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
      {STAGE_AR[stage] ?? stage}
    </span>
  );

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShieldCheck size={24} className="text-[#103c68]" />لوحة المراجع
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {pendingOrders.length} طلب ينتظر التأكيد
            {pendingTransfers.length > 0 && ` · ${pendingTransfers.length} تحويل معلق`}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl text-sm transition-colors">
          <RefreshCw size={14} />تحديث
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 flex-wrap bg-gray-100 p-1.5 rounded-2xl w-fit">
        {([
          { id: "dashboard",  label: "الرئيسية",     icon: BarChart3 },
          { id: "pending",    label: "تحتاج تأكيد",  icon: Clock,        count: pendingOrders.length },
          { id: "all",        label: "كل الطلبات",   icon: FileText,     count: orders.length },
          { id: "transfers",  label: "التحويلات",    icon: BanknoteIcon, count: pendingTransfers.length },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon size={14} />{t.label}
              {"count" in t && t.count !== undefined && t.count > 0 && (
                <span className={`text-xs font-black px-1.5 rounded-full
                  ${t.id === "pending" || t.id === "transfers" ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-600"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══ DASHBOARD ══ */}
      {tab === "dashboard" && (
        <div className="space-y-5">
          {/* Alerts */}
          {(pendingOrders.length > 0 || pendingTransfers.length > 0) && (
            <div className="space-y-2">
              {pendingOrders.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
                    <div>
                      <div className="font-bold text-amber-800">{pendingOrders.length} طلب ينتظر مراجعتك وتأكيد الدفع</div>
                      <div className="text-xs text-amber-600 mt-0.5">تأكد من وصول المبلغ قبل الموافقة</div>
                    </div>
                  </div>
                  <button onClick={() => setTab("pending")}
                    className="flex-shrink-0 bg-amber-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-amber-600 flex items-center gap-1">
                    مراجعة <ArrowRight size={12} />
                  </button>
                </div>
              )}
              {pendingTransfers.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <BanknoteIcon size={18} className="text-blue-500 flex-shrink-0" />
                    <div className="font-bold text-blue-800">{pendingTransfers.length} تحويل بنكي بانتظار تأكيد الاستلام</div>
                  </div>
                  <button onClick={() => setTab("transfers")}
                    className="flex-shrink-0 bg-blue-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-600 flex items-center gap-1">
                    تأكيد <ArrowRight size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "طلبات معلقة",    val: pendingOrders.length,   color: "bg-amber-500",  icon: Clock },
              { label: "طلبات مؤكدة",    val: confirmedOrders.length, color: "bg-green-500",  icon: CheckCircle },
              { label: "إجمالي الطلبات", val: orders.length,          color: "bg-[#103c68]",  icon: FileText },
              { label: "تحويلات معلقة",  val: pendingTransfers.length,color: "bg-purple-500", icon: BanknoteIcon },
            ].map(({ label, val, color, icon: Icon }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-3">
                <div className={`${color} w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon size={20} className="text-white" />
                </div>
                <div>
                  <div className="text-2xl font-black text-gray-900">{val}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Revenue banner */}
          <div className="bg-gradient-to-l from-[#103c68] to-[#1a5899] rounded-2xl p-6 text-white flex items-center justify-between">
            <div>
              <div className="text-sm opacity-70">إيرادات الطلبات المُسلَّمة (شامل الضريبة)</div>
              <div className="text-4xl font-black mt-1">{totalRevenue.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س</div>
              <div className="text-xs opacity-50 mt-1">{orders.filter(o => o.stage === "delivered").length} طلب مُسلَّم</div>
            </div>
            <TrendingUp size={60} className="opacity-10" />
          </div>

          {/* Stage breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-4">توزيع حالات الطلبات</h2>
            <div className="space-y-2.5">
              {Object.entries(STAGE_AR).map(([stage, label]) => {
                const count = orders.filter(o => o.stage === stage).length;
                if (count === 0) return null;
                const pct = orders.length ? Math.round((count / orders.length) * 100) : 0;
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <div className="w-24 text-xs text-gray-500 text-left flex-shrink-0">{label}</div>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#103c68] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-10 text-xs font-bold text-gray-700 text-left">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent orders */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">آخر الطلبات</h2>
              <button onClick={() => setTab("all")} className="text-xs text-[#103c68] font-semibold hover:underline">عرض الكل</button>
            </div>
            <div className="divide-y divide-gray-50">
              {orders.slice(0, 5).map(o => (
                <div key={o.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</div>
                    <div className="text-sm font-semibold text-gray-800 truncate">{o.customer_name || o.customer_phone}</div>
                    <div className="text-xs text-gray-400">{o.product_name} × {o.quantity} {o.unit}</div>
                  </div>
                  <div className="text-left flex-shrink-0 space-y-1">
                    <div className="font-bold text-sm">{o.total_with_vat?.toFixed(0)} ر.س</div>
                    <StagePill stage={o.stage} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ PENDING ══ */}
      {tab === "pending" && (
        <div className="space-y-4">
          {pendingOrders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <CheckCircle size={40} className="mx-auto mb-3 text-green-400 opacity-60" />
              <p className="font-semibold text-gray-600">لا توجد طلبات معلقة</p>
              <p className="text-sm text-gray-400 mt-1">جميع الطلبات تمت مراجعتها</p>
            </div>
          ) : pendingOrders.map(order => (
            <div key={order.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="font-mono text-xs text-[#103c68] font-bold mb-0.5">{order.order_number}</div>
                  <div className="font-black text-gray-900 text-lg">{order.customer_name || order.customer_phone}</div>
                  <div className="text-sm text-gray-500">{order.product_name} × {order.quantity} {order.unit}</div>
                  <div className="text-xs text-gray-400 mt-1">📍 {order.delivery_location} · {order.destination_type}</div>
                </div>
                <div className="text-left flex-shrink-0">
                  <div className="font-black text-2xl text-gray-900">{order.total_with_vat?.toFixed(2)}</div>
                  <div className="text-xs text-gray-400">ر.س شامل الضريبة</div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-sm mb-4">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">قبل الضريبة</div>
                  <div className="font-bold">{order.total_before_vat?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">ضريبة 15%</div>
                  <div className="font-bold">{order.vat_amount?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">الإجمالي</div>
                  <div className="font-black text-[#103c68]">{order.total_with_vat?.toFixed(2)}</div>
                </div>
              </div>

              <div className="text-xs text-gray-400 mb-4">
                {new Date(order.created_at).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setSelectedOrder(order); setTransferRef(""); setPaymentAmt(String(order.total_with_vat)); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-sm transition-colors">
                  <CheckCircle size={15} />تأكيد الدفع
                </button>
                <button onClick={() => cancelOrder(order.id)}
                  className="px-3 py-3 border border-red-200 text-red-500 rounded-xl hover:bg-red-50 transition-colors">
                  <XCircle size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ ALL ORDERS ══ */}
      {tab === "all" && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={15} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالرقم أو العميل أو الجوال..."
              className="w-full bg-white border border-gray-200 rounded-xl pe-10 ps-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 shadow-sm" />
          </div>
          <div className="text-xs text-gray-400 px-1">عرض {filteredAll.length} من {orders.length}</div>

          {filteredAll.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">لا توجد نتائج</div>
          ) : (
            <div className="space-y-3">
              {filteredAll.map(o => (
                <div key={o.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${o.stage === "pending" ? "border-amber-200" : "border-gray-100"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</span>
                        <StagePill stage={o.stage} />
                      </div>
                      <div className="font-semibold text-gray-800 truncate">{o.customer_name || o.customer_phone}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{o.product_name} × {o.quantity} {o.unit}</div>
                      {o.payment_transfer_ref && (
                        <div className="text-xs text-green-600 mt-1 font-mono">تحويل: {o.payment_transfer_ref}</div>
                      )}
                    </div>
                    <div className="text-left flex-shrink-0 space-y-1">
                      <div className="font-black text-gray-900">{o.total_with_vat?.toFixed(0)} ر.س</div>
                      <div className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString("ar-SA")}</div>
                    </div>
                  </div>
                  {o.reviewer_name && (
                    <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                      <CheckCircle size={11} className="text-green-500" />
                      {o.reviewer_name} — {o.review_date ? new Date(o.review_date).toLocaleDateString("ar-SA") : ""}
                    </div>
                  )}
                  {o.stage === "pending" && (
                    <button onClick={() => { setSelectedOrder(o); setPaymentAmt(String(o.total_with_vat)); }}
                      className="mt-3 w-full py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-colors">
                      تأكيد الدفع
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ TRANSFERS ══ */}
      {tab === "transfers" && (
        <div className="space-y-3">
          {transfers.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">لا توجد تحويلات</div>
          ) : transfers.map(t => (
            <div key={t.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${!t.confirmed ? "border-amber-200" : "border-gray-100"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-green-700 text-lg">{t.amount?.toFixed(2)} ر.س</span>
                    {t.confirmed ? (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold border border-green-200">✓ مؤكد</span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-semibold border border-amber-200">معلق</span>
                    )}
                  </div>
                  <div className="font-semibold text-gray-800">{t.customer_name || t.customer_phone}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {t.bank_name && `${t.bank_name} · `}
                    <span className="font-mono">{t.transfer_ref}</span>
                  </div>
                  <div className="text-xs text-gray-400">{new Date(t.transfer_date).toLocaleDateString("ar-SA")}</div>
                </div>
                <div className="flex-shrink-0 flex flex-col gap-2">
                  {t.transfer_image && (
                    <a href={t.transfer_image} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-[#103c68] hover:underline font-semibold">
                      <Eye size={11} />الصورة
                    </a>
                  )}
                  {!t.confirmed && (
                    <button onClick={() => confirmTransfer(t.id)}
                      className="bg-[#103c68] text-white text-xs px-3 py-2 rounded-xl hover:bg-[#0d3158] font-bold transition-colors">
                      تأكيد
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ CONFIRM PAYMENT MODAL ══ */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="font-black text-gray-900 text-lg">تأكيد الدفع والتوقيع</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedOrder.order_number} · {selectedOrder.customer_name}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">المنتج</span><span className="font-semibold">{selectedOrder.product_name} × {selectedOrder.quantity}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">قبل الضريبة</span><span className="font-semibold">{selectedOrder.total_before_vat?.toFixed(2)} ر.س</span></div>
                <div className="flex justify-between"><span className="text-gray-500">ضريبة 15%</span><span className="font-semibold">{selectedOrder.vat_amount?.toFixed(2)} ر.س</span></div>
                <div className="flex justify-between font-black border-t border-gray-200 pt-2 text-base">
                  <span>الإجمالي المطلوب</span>
                  <span className="text-[#103c68]">{selectedOrder.total_with_vat?.toFixed(2)} ر.س</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">مرجع التحويل البنكي</label>
                <input value={transferRef} onChange={e => setTransferRef(e.target.value)}
                  placeholder="رقم العملية أو المرجع"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">مبلغ التحويل (ر.س)</label>
                <input type="number" value={paymentAmt} onChange={e => setPaymentAmt(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-sm">
                <div className="font-bold text-blue-800 mb-1 flex items-center gap-1.5"><ShieldCheck size={14} />التزام المراجع</div>
                <div className="text-blue-600 text-xs">بالنقر على "تأكيد وتوقيع" تؤكد أنك تحققت شخصياً من وصول المبلغ وسيتم إحالة الطلب للمستودع تلقائياً.</div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setSelectedOrder(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  إلغاء
                </button>
                <button onClick={confirmPayment} disabled={submitting}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {submitting ? <><RefreshCw size={14} className="animate-spin" />جاري...</> : <><CheckCircle size={14} />تأكيد وتوقيع</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
