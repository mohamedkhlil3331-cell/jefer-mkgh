import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Camera, CheckCircle, AlertTriangle, Fuel, DollarSign, Clock,
  X, Save, Truck, MapPin, Phone, Package, RefreshCw, FileText,
  TrendingUp, Hash,
} from "lucide-react";

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

function fmt(n: number) { return n.toLocaleString("ar-SA", { maximumFractionDigits: 0 }); }

export default function DriverOrders() {
  const { user } = useAuth();
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [balance,      setBalance]      = useState<Balance | null>(null);
  const [loadingOrder, setLoadingOrder] = useState<Order | null>(null);
  const [dieselModal,  setDieselModal]  = useState<{ open: boolean; order?: Order }>({ open: false });
  const [dieselForm,   setDieselForm]   = useState({ amount: "", liters: "", description: "" });
  const [submitting,   setSubmitting]   = useState(false);
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

  const readyOrders    = orders.filter(o => o.stage === "invoiced");
  const loadedOrders   = orders.filter(o => o.stage === "loaded");
  const deliveredOrders= orders.filter(o => o.stage === "delivered");

  return (
    <div dir="rtl" className="space-y-5 pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">مهام السائق</h1>
          <p className="text-gray-400 text-sm mt-0.5">{user?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadOrders(); loadBalance(); }}
            className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={() => alert("تم تسجيل بلاغ العطل. تواصل مع المشرف.")}
            className="flex items-center gap-2 bg-red-100 text-red-600 hover:bg-red-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
            <AlertTriangle size={15} />الإبلاغ عن عطل
          </button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "جاهز",    val: readyOrders.length,    color: "bg-blue-500 text-white"   },
          { label: "في الطريق",val: loadedOrders.length,  color: "bg-orange-500 text-white"  },
          { label: "مسلّمة",  val: deliveredOrders.length,color: "bg-green-600 text-white"   },
        ].map(({ label, val, color }) => (
          <div key={label} className={`${color} rounded-2xl p-3 text-center shadow-sm`}>
            <div className="text-2xl font-black">{val}</div>
            <div className="text-xs opacity-80 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Diesel balance card ── */}
      {balance && (
        <div className={`rounded-2xl border p-5 ${balance.remaining < 0 ? "bg-red-50 border-red-200" : balance.remaining < 500 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100 shadow-sm"}`}>
          <div className="flex items-center gap-2 mb-4">
            <Fuel size={18} className="text-orange-500" />
            <h2 className="font-bold text-gray-900">عهدة الديزل</h2>
            {balance.last_settlement_date && (
              <span className="text-xs text-gray-400 mr-auto flex items-center gap-1">
                <Clock size={11} />منذ: {balance.last_settlement_date}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "المخصص", val: balance.allocated, color: "text-[#103c68]" },
              { label: "المصروف",val: balance.spent,     color: "text-orange-600" },
              { label: "المتبقي",val: balance.remaining, color: balance.remaining < 0 ? "text-red-600" : balance.remaining < 500 ? "text-amber-600" : "text-green-600" },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-white/80 rounded-xl p-3 text-center border border-gray-100">
                <div className={`text-xl font-black ${color}`}>{fmt(val)}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label} (ريال)</div>
              </div>
            ))}
          </div>
          {balance.remaining <= 0 && (
            <div className="text-xs text-red-600 font-semibold flex items-center gap-1.5 mb-3 bg-red-100 rounded-xl px-3 py-2">
              <AlertTriangle size={13} />تجاوزت الحد المخصص — تواصل مع المشرف لتسوية العهدة
            </div>
          )}
          {balance.expenses.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">آخر المصاريف</div>
              <div className="space-y-1.5">
                {balance.expenses.slice(0, 5).map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-white/70 rounded-lg px-3 py-1.5 text-xs border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Fuel size={11} className="text-orange-500" />
                      <span>{e.expense_date}</span>
                      {e.order_number && <span className="font-mono text-gray-400 text-[10px]">{e.order_number}</span>}
                      {e.liters > 0 && <span className="text-gray-400">{e.liters} ل</span>}
                    </div>
                    <span className="font-semibold text-red-600">-{fmt(e.amount)} ر.س</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => setDieselModal({ open: true })}
            className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold transition-colors">
            <Fuel size={15} />إضافة مصروف ديزل
          </button>
        </div>
      )}

      {/* ── Ready to load ── */}
      {readyOrders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-blue-500 rounded-full" />
            <h2 className="font-bold text-gray-900">جاهز للتحميل</h2>
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">{readyOrders.length}</span>
          </div>
          <div className="space-y-3">
            {readyOrders.map(order => (
              <div key={order.id} className="bg-white border-2 border-blue-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-blue-50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-blue-600" />
                    <span className="font-mono text-xs font-bold text-blue-700">{order.order_number}</span>
                  </div>
                  <span className="text-xs bg-blue-200 text-blue-800 px-2.5 py-1 rounded-full font-semibold">جاهز للتحميل</span>
                </div>
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <Phone size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{order.customer_name || order.customer_phone}</div>
                      <div className="text-xs text-gray-500">{order.product_name} × {order.quantity} {order.unit}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <MapPin size={12} className="text-red-400 flex-shrink-0" />
                    <span>{order.delivery_location} ({order.destination_type})</span>
                  </div>
                  {order.invoice_image_url && (
                    <a href={order.invoice_image_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-[#103c68] font-semibold">
                      <FileText size={12} />عرض الفاتورة ({order.invoice_number})
                    </a>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setDieselModal({ open: true, order })}
                      className="flex items-center gap-1.5 px-3 py-2.5 bg-orange-100 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-200 transition-colors">
                      <Fuel size={14} />ديزل
                    </button>
                    <button onClick={() => setLoadingOrder(order)}
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold transition-colors">
                      <Camera size={15} />تأكيد التحميل + صورة
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── On the way (loaded) ── */}
      {loadedOrders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
            <h2 className="font-bold text-gray-900">في الطريق</h2>
            <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-semibold">{loadedOrders.length}</span>
          </div>
          <div className="space-y-3">
            {loadedOrders.map(order => (
              <div key={order.id} className="bg-white border-2 border-orange-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-orange-50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck size={14} className="text-orange-600" />
                    <span className="font-mono text-xs font-bold text-orange-700">{order.order_number}</span>
                  </div>
                  <span className="text-xs bg-orange-200 text-orange-800 px-2.5 py-1 rounded-full font-semibold">في الطريق</span>
                </div>
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <Phone size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{order.customer_name || order.customer_phone}</div>
                      <div className="text-xs text-gray-500">{order.product_name} × {order.quantity} {order.unit}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <MapPin size={12} className="text-red-400 flex-shrink-0" />
                    <span>{order.delivery_location}</span>
                  </div>
                  {order.loading_photo_url && (
                    <a href={order.loading_photo_url} target="_blank" rel="noreferrer">
                      <img src={order.loading_photo_url} alt="صورة التحميل"
                        className="w-full max-h-44 object-cover rounded-xl hover:opacity-90 transition-opacity" />
                    </a>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setDieselModal({ open: true, order })}
                      className="flex items-center gap-1.5 px-3 py-2.5 bg-orange-100 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-200 transition-colors">
                      <Fuel size={14} />ديزل
                    </button>
                    <a href={`tel:${order.customer_phone}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">
                      <Phone size={14} />اتصال
                    </a>
                    <button onClick={() => confirmDelivery(order)} disabled={submitting}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors">
                      <CheckCircle size={15} />تأكيد التسليم
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Delivered history ── */}
      {deliveredOrders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-green-500 rounded-full" />
            <h2 className="font-bold text-gray-900">المسلّمة</h2>
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold">{deliveredOrders.length}</span>
          </div>
          <div className="space-y-2">
            {deliveredOrders.slice(0, 10).map(order => (
              <div key={order.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div>
                  <div className="font-mono text-xs text-gray-400">{order.order_number}</div>
                  <div className="font-semibold text-sm text-gray-800 mt-0.5">{order.customer_name || order.customer_phone}</div>
                  <div className="text-xs text-gray-400">{order.product_name} × {order.quantity} {order.unit}</div>
                </div>
                <div className="flex items-center gap-1.5 bg-green-100 text-green-700 text-xs px-2.5 py-1.5 rounded-xl font-semibold">
                  <CheckCircle size={12} />مسلّم
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 && !loading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Truck size={48} className="mx-auto text-gray-200 mb-3" />
          <p className="font-semibold text-gray-400">لا توجد طلبات مخصصة لك حالياً</p>
          <p className="text-xs text-gray-300 mt-1">انتظر حتى يتم تعيين طلب لك</p>
        </div>
      )}

      {/* ── Loading confirmation modal ── */}
      {loadingOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-2 mb-4">
              <Camera size={20} className="text-blue-600" />
              <h2 className="font-black text-xl">تأكيد التحميل</h2>
            </div>
            <div className="bg-blue-50 rounded-2xl p-4 text-sm space-y-1.5 mb-5 border border-blue-100">
              <div className="flex gap-2"><Hash size={13} className="text-blue-400 mt-0.5 flex-shrink-0" /><span className="text-gray-700"><strong>رقم الطلب:</strong> {loadingOrder.order_number}</span></div>
              <div className="flex gap-2"><Phone size={13} className="text-blue-400 mt-0.5 flex-shrink-0" /><span className="text-gray-700"><strong>العميل:</strong> {loadingOrder.customer_name}</span></div>
              <div className="flex gap-2"><Package size={13} className="text-blue-400 mt-0.5 flex-shrink-0" /><span className="text-gray-700"><strong>المنتج:</strong> {loadingOrder.product_name} × {loadingOrder.quantity} {loadingOrder.unit}</span></div>
              <div className="flex gap-2"><MapPin size={13} className="text-blue-400 mt-0.5 flex-shrink-0" /><span className="text-gray-700"><strong>الوجهة:</strong> {loadingOrder.delivery_location}</span></div>
            </div>
            <label className="block text-sm font-bold text-gray-700 mb-2">صورة التحميل (مطلوبة)</label>
            <input ref={photoRef} type="file" accept="image/*" capture="environment"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white" />
            <div className="flex gap-3 mt-5">
              <button onClick={confirmLoad} disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60 transition-colors">
                <CheckCircle size={16} />{submitting ? "جاري التسجيل..." : "تأكيد التحميل"}
              </button>
              <button onClick={() => setLoadingOrder(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Diesel expense modal ── */}
      {dieselModal.open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Fuel size={20} className="text-orange-500" />
                <h2 className="font-black text-lg">مصروف ديزل</h2>
              </div>
              <button onClick={() => setDieselModal({ open: false })} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {dieselModal.order && (
                <div className="bg-orange-50 rounded-xl p-3 text-xs text-orange-700 border border-orange-200 flex items-center gap-2">
                  <Truck size={12} />
                  <span><strong>الطلب:</strong> {dieselModal.order.order_number} — {dieselModal.order.delivery_location}</span>
                </div>
              )}
              {balance && (
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 text-sm border border-gray-100">
                  <div className="flex items-center gap-2 text-gray-500"><TrendingUp size={13} />الرصيد المتبقي</div>
                  <span className={`font-black ${balance.remaining > 0 ? "text-green-600" : "text-red-600"}`}>
                    {fmt(balance.remaining)} ر.س
                  </span>
                </div>
              )}
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">المبلغ (ريال) *</label>
                <input type="number" min="0" step="1" value={dieselForm.amount}
                  onChange={e => setDieselForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0" autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-xl font-black text-center focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">الكمية (لتر)</label>
                <input type="number" min="0" step="1" value={dieselForm.liters}
                  onChange={e => setDieselForm(f => ({ ...f, liters: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">ملاحظة</label>
                <input type="text" value={dieselForm.description}
                  onChange={e => setDieselForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="مثال: محطة أرامكو — طريق الرياض"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setDieselModal({ open: false })}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">
                إلغاء
              </button>
              <button onClick={addDiesel} disabled={submitting || !dieselForm.amount}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                <Save size={15} />{submitting ? "جاري الحفظ..." : "تسجيل المصروف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
