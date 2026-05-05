import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Camera, CheckCircle, AlertTriangle, Fuel, DollarSign, Clock, X, Save } from "lucide-react";

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string; delivery_location: string;
  destination_type: string; stage: string; vehicle_plate: string; invoice_image_url: string;
  invoice_number: string; loading_photo_url: string; created_at: string;
}

interface Balance {
  allocated: number; spent: number; remaining: number;
  last_settlement_date: string | null; driver_name: string;
  expenses: { id: number; amount: number; liters: number; expense_type: string; expense_date: string; order_number?: string; description?: string }[];
}

function fmt(n: number) { return n.toLocaleString("ar-SA"); }

export default function DriverOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loadingOrder, setLoadingOrder] = useState<Order | null>(null);
  const [dieselModal, setDieselModal] = useState<{ open: boolean; order?: Order }>({ open: false });
  const [dieselForm, setDieselForm] = useState({ amount: "", liters: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const loadOrders = () => {
    if (!user) return;
    setLoading(true);
    fetch(`/api/workflow/orders?role=driver&phone=${user.phone}`)
      .then(r => r.json()).then(setOrders).finally(() => setLoading(false));
  };

  const loadBalance = () => {
    if (!user) return;
    fetch(`/api/driver-balance?phone=${user.phone}`)
      .then(r => r.json()).then(setBalance).catch(() => {});
  };

  useEffect(() => { loadOrders(); loadBalance(); }, [user]);

  const confirmLoad = async () => {
    if (!loadingOrder) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (photoRef.current?.files?.[0]) fd.append("loading_photo", photoRef.current.files[0]);
      const res = await fetch(`/api/workflow/orders/${loadingOrder.id}/load`, { method: "PUT", body: fd });
      if (!res.ok) throw new Error((await res.json()).error);
      setLoadingOrder(null);
      loadOrders();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const confirmDelivery = async (order: Order) => {
    const notes = prompt("ملاحظات التسليم (اختياري):");
    if (notes === null) return;
    setSubmitting(true);
    try {
      await fetch(`/api/workflow/orders/${order.id}/deliver`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      loadOrders();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const addDiesel = async () => {
    if (!user || !dieselForm.amount) return;
    setSubmitting(true);
    try {
      await fetch("/api/driver-expenses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_phone: user.phone, driver_name: user.name,
          order_id: dieselModal.order?.id || null,
          order_number: dieselModal.order?.order_number || null,
          expense_type: "ديزل",
          amount: parseFloat(dieselForm.amount) || 0,
          liters: parseFloat(dieselForm.liters) || 0,
          description: dieselForm.description || null,
          expense_date: new Date().toISOString().slice(0, 10),
        }),
      });
      setDieselModal({ open: false });
      setDieselForm({ amount: "", liters: "", description: "" });
      loadBalance();
    } catch { alert("فشل تسجيل المصروف"); }
    finally { setSubmitting(false); }
  };

  const readyOrders = orders.filter(o => o.stage === "invoiced");
  const loadedOrders = orders.filter(o => o.stage === "loaded");
  const deliveredOrders = orders.filter(o => o.stage === "delivered");

  return (
    <div dir="rtl" className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">طلباتي</h1>
          <p className="text-muted-foreground text-sm">السائق: {user?.name}</p>
        </div>
        <button
          onClick={() => {
            const orders2 = orders.find(o => o.stage !== "delivered");
            if (!orders2) return alert("لا توجد سيارة مخصصة");
            alert("تم تسجيل بلاغ العطل. تواصل مع المشرف.");
          }}
          className="flex items-center gap-2 bg-red-100 text-red-600 hover:bg-red-200 px-4 py-2 rounded-xl text-sm font-medium"
        >
          <AlertTriangle size={16} /> الإبلاغ عن عطل
        </button>
      </div>

      {/* عهدة Balance Card */}
      {balance && (
        <div className={`rounded-2xl p-5 border ${balance.remaining < 0 ? "bg-red-50 border-red-200" : balance.remaining < 500 ? "bg-yellow-50 border-yellow-200" : "bg-white border-gray-100 shadow-sm"}`}>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={18} className="text-green-600" />
            <h2 className="font-bold text-gray-900">عهدة الديزل</h2>
            {balance.last_settlement_date && (
              <span className="text-xs text-gray-400 mr-auto flex items-center gap-1">
                <Clock size={12} />منذ: {balance.last_settlement_date}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/80 rounded-xl p-3 text-center border border-gray-100">
              <div className="text-xl font-bold text-blue-600">{fmt(balance.allocated)}</div>
              <div className="text-xs text-gray-500 mt-0.5">المخصص (ريال)</div>
            </div>
            <div className="bg-white/80 rounded-xl p-3 text-center border border-gray-100">
              <div className="text-xl font-bold text-orange-500">{fmt(balance.spent)}</div>
              <div className="text-xs text-gray-500 mt-0.5">المصروف (ريال)</div>
            </div>
            <div className={`rounded-xl p-3 text-center border ${balance.remaining < 0 ? "bg-red-100 border-red-300" : balance.remaining < 500 ? "bg-yellow-100 border-yellow-300" : "bg-green-50 border-green-200"}`}>
              <div className={`text-xl font-bold ${balance.remaining < 0 ? "text-red-600" : balance.remaining < 500 ? "text-yellow-600" : "text-green-600"}`}>
                {fmt(balance.remaining)}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">المتبقي (ريال)</div>
            </div>
          </div>
          {balance.remaining <= 0 && (
            <div className="mt-3 text-xs text-red-600 font-medium flex items-center gap-1">
              <AlertTriangle size={13} />تجاوزت الحد المخصص، تواصل مع المشرف لتسوية العهدة
            </div>
          )}

          {/* Recent diesel expenses */}
          {balance.expenses.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">آخر مصاريف الديزل</div>
              <div className="space-y-1.5">
                {balance.expenses.slice(0, 5).map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-white/70 rounded-lg px-3 py-1.5 text-xs border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Fuel size={12} className="text-orange-500" />
                      <span>{e.expense_date}</span>
                      {e.order_number && <span className="font-mono text-gray-400">{e.order_number}</span>}
                      {e.liters > 0 && <span className="text-gray-400">{e.liters} لتر</span>}
                    </div>
                    <span className="font-semibold text-red-600">-{fmt(e.amount)} ريال</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setDieselModal({ open: true })}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600"
          >
            <Fuel size={15} />إضافة مصروف ديزل
          </button>
        </div>
      )}

      {/* No balance yet */}
      {balance && balance.allocated === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700">
          لم يتم تخصيص عهدة ديزل بعد. تواصل مع المشرف.
        </div>
      )}

      {/* Ready to load */}
      {readyOrders.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3 text-blue-700">جاهز للتحميل 📦</h2>
          <div className="space-y-4">
            {readyOrders.map(order => (
              <div key={order.id} className="bg-card border border-blue-300 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-sm font-bold text-primary">{order.order_number}</div>
                    <div className="font-bold">{order.customer_name || order.customer_phone}</div>
                    <div className="text-sm text-muted-foreground">{order.product_name} × {order.quantity} {order.unit}</div>
                  </div>
                  <span className="bg-blue-100 text-blue-700 text-xs px-3 py-1.5 rounded-full font-medium">جاهز للتحميل</span>
                </div>
                <div className="text-sm text-muted-foreground mb-3">📍 {order.delivery_location} ({order.destination_type})</div>
                {order.invoice_image_url && (
                  <a href={order.invoice_image_url} target="_blank" className="text-sm text-primary flex items-center gap-1 mb-3">
                    🧾 عرض الفاتورة ({order.invoice_number})
                  </a>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setDieselModal({ open: true, order }); }}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-orange-100 text-orange-700 rounded-xl text-sm font-medium hover:bg-orange-200"
                  >
                    <Fuel size={14} />ديزل
                  </button>
                  <button onClick={() => setLoadingOrder(order)}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-xl font-medium hover:bg-blue-700">
                    <Camera size={16} />تأكيد التحميل + صورة
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loaded - on the way */}
      {loadedOrders.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3 text-orange-700">في الطريق 🚛</h2>
          <div className="space-y-4">
            {loadedOrders.map(order => (
              <div key={order.id} className="bg-card border border-orange-300 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-sm font-bold text-primary">{order.order_number}</div>
                    <div className="font-bold">{order.customer_name || order.customer_phone}</div>
                    <div className="text-sm text-muted-foreground">{order.product_name} × {order.quantity} {order.unit}</div>
                  </div>
                  <span className="bg-orange-100 text-orange-700 text-xs px-3 py-1.5 rounded-full font-medium">في الطريق</span>
                </div>
                <div className="text-sm text-muted-foreground mb-3">📍 {order.delivery_location}</div>
                {order.loading_photo_url && (
                  <img src={order.loading_photo_url} alt="صورة التحميل" className="w-full max-h-40 object-cover rounded-xl mb-3" />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setDieselModal({ open: true, order })}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-orange-100 text-orange-700 rounded-xl text-sm font-medium hover:bg-orange-200"
                  >
                    <Fuel size={14} />ديزل
                  </button>
                  <a href={`tel:${order.customer_phone}`}
                    className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm hover:bg-gray-50">
                    📞 اتصال
                  </a>
                  <button onClick={() => confirmDelivery(order)} disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-60">
                    <CheckCircle size={15} />تأكيد التسليم
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {deliveredOrders.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3 text-muted-foreground">مسلمة ({deliveredOrders.length})</h2>
          <div className="space-y-2">
            {deliveredOrders.slice(0, 10).map(order => (
              <div key={order.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">{order.order_number}</div>
                  <div className="font-medium text-sm">{order.customer_name}</div>
                </div>
                <span className="bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full font-medium">✓ مسلم</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 && !loading && (
        <div className="text-center py-20 text-muted-foreground">
          <div className="text-5xl mb-3">🚛</div>
          <p>لا توجد طلبات مخصصة لك حالياً</p>
        </div>
      )}

      {/* Loading confirmation modal */}
      {loadingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="font-bold text-xl mb-1">تأكيد التحميل</h2>
            <p className="text-sm text-muted-foreground mb-4">{loadingOrder.order_number}</p>
            <div className="bg-muted/30 rounded-xl p-4 text-sm mb-4">
              <div><strong>العميل:</strong> {loadingOrder.customer_name}</div>
              <div className="mt-1"><strong>المنتج:</strong> {loadingOrder.product_name} × {loadingOrder.quantity}</div>
              <div className="mt-1"><strong>الوجهة:</strong> {loadingOrder.delivery_location}</div>
            </div>
            <label className="block text-sm font-medium mb-1.5">صورة التحميل (مطلوبة)</label>
            <input ref={photoRef} type="file" accept="image/*" capture="environment"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50" />
            <div className="flex gap-3 mt-5">
              <button onClick={confirmLoad} disabled={submitting}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
                {submitting ? "جاري التسجيل..." : "تأكيد التحميل"}
              </button>
              <button onClick={() => setLoadingOrder(null)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Diesel expense modal */}
      {dieselModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Fuel size={20} className="text-orange-500" />
                <h2 className="font-bold text-lg">إضافة مصروف ديزل</h2>
              </div>
              <button onClick={() => setDieselModal({ open: false })} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} />
              </button>
            </div>

            {dieselModal.order && (
              <div className="bg-orange-50 rounded-xl p-3 text-xs text-orange-700 mb-4 border border-orange-200">
                <strong>الطلب:</strong> {dieselModal.order.order_number} — {dieselModal.order.delivery_location}
              </div>
            )}

            {balance && (
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 text-sm mb-4">
                <span className="text-gray-500">الرصيد المتبقي:</span>
                <span className={`font-bold ${balance.remaining > 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmt(balance.remaining)} ريال
                </span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">المبلغ (ريال) *</label>
                <input
                  type="number" min="0" step="1"
                  value={dieselForm.amount}
                  onChange={e => setDieselForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 text-center text-lg font-bold"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">الكمية (لتر) - اختياري</label>
                <input
                  type="number" min="0" step="1"
                  value={dieselForm.liters}
                  onChange={e => setDieselForm(f => ({ ...f, liters: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">ملاحظة - اختياري</label>
                <input
                  type="text"
                  value={dieselForm.description}
                  onChange={e => setDieselForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="مثال: محطة أرامكو - طريق الرياض"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setDieselModal({ open: false })} className="flex-1 py-2.5 border rounded-xl text-sm">إلغاء</button>
              <button
                onClick={addDiesel}
                disabled={submitting || !dieselForm.amount}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
              >
                <Save size={15} />{submitting ? "جاري الحفظ..." : "تسجيل المصروف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
