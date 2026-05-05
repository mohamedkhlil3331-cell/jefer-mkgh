import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle, Clock, XCircle } from "lucide-react";

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string; total_with_vat: number;
  delivery_location: string; stage: string; created_at: string; rep_id: number;
  payment_transfer_ref: string; payment_amount: number; reviewer_name: string; review_date: string;
}
interface Transfer {
  id: number; customer_phone: string; customer_name: string; amount: number;
  transfer_date: string; transfer_ref: string; bank_name: string; confirmed: number; transfer_image: string; created_at: string;
}

export default function ReviewerOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"orders"|"transfers">("orders");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [transferRef, setTransferRef] = useState("");
  const [paymentAmt, setPaymentAmt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/workflow/orders?role=reviewer").then(r => r.json()),
      fetch("/api/portal/transfers").then(r => r.json()),
    ]).then(([o, t]) => { setOrders(o); setTransfers(t); }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const confirmPayment = async () => {
    if (!selectedOrder || !user) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/confirm-payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer_phone: user.phone, reviewer_name: user.name, payment_transfer_ref: transferRef, payment_amount: paymentAmt }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedOrder(null);
      setTransferRef(""); setPaymentAmt("");
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const confirmTransfer = async (id: number) => {
    await fetch(`/api/portal/transfers/${id}/confirm`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer_phone: user?.phone }),
    });
    load();
  };

  const cancelOrder = async (id: number) => {
    const reason = prompt("سبب الإلغاء:");
    if (reason === null) return;
    await fetch(`/api/workflow/orders/${id}/cancel`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    load();
  };

  const pendingOrders = orders.filter(o => o.stage === "pending");
  const confirmedOrders = orders.filter(o => o.stage === "payment_confirmed");
  const pendingTransfers = transfers.filter(t => !t.confirmed);

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">لوحة المراجع</h1>
          <p className="text-muted-foreground text-sm">{pendingOrders.length} طلب ينتظر التأكيد — {pendingTransfers.length} تحويل ينتظر</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {[
          { id: "orders", label: `الطلبات (${orders.length})` },
          { id: "transfers", label: `التحويلات (${transfers.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as "orders"|"transfers")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t.id ? "bg-primary text-white" : "bg-white border border-border text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div className="space-y-4">
          {orders.length === 0 && !loading && <div className="text-center py-16 text-muted-foreground bg-card rounded-xl border border-border">لا توجد طلبات</div>}
          {orders.map(order => (
            <div key={order.id} className={`bg-card border rounded-xl p-5 ${order.stage === "pending" ? "border-yellow-300" : "border-border"}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-mono text-sm font-bold text-primary">{order.order_number}</div>
                  <div className="font-bold text-gray-900 mt-1">{order.customer_name || order.customer_phone}</div>
                  <div className="text-sm text-muted-foreground">{order.product_name} × {order.quantity} {order.unit}</div>
                </div>
                <div className="text-left">
                  <div className="font-bold text-lg">{order.total_with_vat?.toFixed(2)} ر.س</div>
                  {order.stage === "pending" ? (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full flex items-center gap-1 mt-1">
                      <Clock size={11} /> ينتظر
                    </span>
                  ) : (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1 mt-1">
                      <CheckCircle size={11} /> مؤكد
                    </span>
                  )}
                </div>
              </div>

              <div className="text-sm text-muted-foreground mb-3">📍 {order.delivery_location}</div>

              {order.payment_transfer_ref && (
                <div className="bg-green-50 rounded-lg px-3 py-2 text-sm mb-3">
                  <span className="text-green-700">مرجع التحويل: <strong>{order.payment_transfer_ref}</strong></span>
                  {order.payment_amount ? <span className="text-green-600 mr-2">({order.payment_amount} ر.س)</span> : null}
                </div>
              )}

              {order.reviewer_name && (
                <div className="text-xs text-muted-foreground mb-2">✓ راجعه: {order.reviewer_name} — {order.review_date ? new Date(order.review_date).toLocaleDateString("ar-SA") : ""}</div>
              )}

              {order.stage === "pending" && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setSelectedOrder(order)}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700">
                    <CheckCircle size={15} /> تأكيد الدفع والتوقيع
                  </button>
                  <button onClick={() => cancelOrder(order.id)}
                    className="p-2.5 border border-red-200 text-red-500 rounded-xl hover:bg-red-50">
                    <XCircle size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "transfers" && (
        <div className="space-y-4">
          {transfers.length === 0 && <div className="text-center py-16 text-muted-foreground bg-card rounded-xl border border-border">لا توجد تحويلات</div>}
          {transfers.map(t => (
            <div key={t.id} className={`bg-card border rounded-xl p-5 ${!t.confirmed ? "border-yellow-300" : "border-border"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-green-700 text-lg">{t.amount?.toFixed(2)} ر.س</div>
                  <div className="font-medium text-gray-900">{t.customer_name || t.customer_phone}</div>
                  <div className="text-sm text-muted-foreground">{t.bank_name && `${t.bank_name} — `}{t.transfer_ref}</div>
                  <div className="text-xs text-muted-foreground">{new Date(t.transfer_date).toLocaleDateString("ar-SA")}</div>
                </div>
                {t.confirmed ? (
                  <span className="bg-green-100 text-green-700 text-xs px-3 py-1.5 rounded-full font-medium">✓ مؤكد</span>
                ) : (
                  <button onClick={() => confirmTransfer(t.id)}
                    className="bg-primary text-white text-sm px-4 py-2 rounded-xl hover:bg-primary/90 font-medium">
                    تأكيد
                  </button>
                )}
              </div>
              {t.transfer_image && (
                <a href={t.transfer_image} target="_blank" className="text-xs text-primary mt-2 block">عرض صورة التحويل</a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirm modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-xl mb-1">تأكيد الدفع</h2>
            <p className="text-sm text-muted-foreground mb-5">طلب: {selectedOrder.order_number} — {selectedOrder.customer_name}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">مرجع التحويل البنكي</label>
                <input value={transferRef} onChange={e => setTransferRef(e.target.value)}
                  placeholder="رقم العملية / المرجع"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">مبلغ التحويل (ر.س)</label>
                <input type="number" value={paymentAmt} onChange={e => setPaymentAmt(e.target.value)}
                  placeholder={String(selectedOrder.total_with_vat)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-3 text-sm mt-4">
              <div className="text-blue-700 font-medium">بتوقيعك تؤكد:</div>
              <div className="text-blue-600 mt-1">أنك تحققت من وصول المبلغ وسيتم إرسال الطلب للمستودع تلقائياً</div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={confirmPayment} disabled={submitting}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 disabled:opacity-60">
                {submitting ? "جاري التأكيد..." : "✓ تأكيد وتوقيع"}
              </button>
              <button onClick={() => setSelectedOrder(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
