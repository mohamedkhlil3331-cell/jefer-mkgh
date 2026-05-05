import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Package, ChevronLeft } from "lucide-react";

interface Order {
  id: number; order_number: string; product_name: string; quantity: number; unit: string;
  total_with_vat: number; stage: string; delivery_location: string;
  vehicle_plate: string; driver_phone: string; created_at: string;
}

const STAGE_STEPS = [
  { key: "pending", label: "قيد المراجعة", icon: "⏳" },
  { key: "payment_confirmed", label: "تم تأكيد الدفع", icon: "✅" },
  { key: "vehicle_assigned", label: "جاري التجهيز", icon: "🚗" },
  { key: "invoiced", label: "صدرت الفاتورة", icon: "🧾" },
  { key: "loaded", label: "في الطريق إليك", icon: "🚛" },
  { key: "delivered", label: "تم التسليم", icon: "📦" },
];

const stageIndex = (s: string) => STAGE_STEPS.findIndex(x => x.key === s);

export default function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!user) return;
    fetch(`/api/workflow/orders?role=customer&phone=${user.phone}`)
      .then(r => r.json()).then(setOrders).finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-4">
        <h1 className="font-bold text-xl text-gray-900">طلباتي</h1>
        <p className="text-sm text-muted-foreground">{orders.length} طلب</p>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {orders.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Package size={48} className="mx-auto mb-3 opacity-30" />
            <p>لا توجد طلبات بعد</p>
            <button onClick={() => navigate("/")} className="mt-4 bg-primary text-white px-6 py-2 rounded-xl text-sm">اطلب الآن</button>
          </div>
        ) : orders.map(order => {
          const idx = stageIndex(order.stage);
          const isCancelled = order.stage === "cancelled";
          return (
            <div
              key={order.id}
              onClick={() => navigate(`/my-orders/${order.id}`)}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-mono text-sm font-bold text-primary">{order.order_number}</div>
                  <div className="font-semibold text-gray-900 mt-0.5">{order.product_name}</div>
                  <div className="text-sm text-muted-foreground">{order.quantity} {order.unit}</div>
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-900">{order.total_with_vat?.toFixed(2)} <span className="text-xs font-normal">ر.س</span></div>
                  <div className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("ar-SA")}</div>
                </div>
              </div>

              {isCancelled ? (
                <div className="bg-red-50 rounded-xl px-3 py-2 text-sm text-red-700 font-medium">❌ ملغي</div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{STAGE_STEPS[idx]?.icon} {STAGE_STEPS[idx]?.label}</span>
                    <span className="text-xs text-muted-foreground">{idx + 1} / {STAGE_STEPS.length}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${((idx + 1) / STAGE_STEPS.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {order.stage === "loaded" && order.driver_phone && (
                <div className="mt-3 bg-green-50 rounded-xl p-3 text-sm">
                  <div className="font-medium text-green-700">🚛 السائق في الطريق</div>
                  <div className="text-green-600 mt-1">السيارة: {order.vehicle_plate} | جوال: {order.driver_phone}</div>
                  <a
                    href={`https://wa.me/966${order.driver_phone.replace(/^0/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-block mt-2 bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg"
                  >
                    💬 واتساب السائق
                  </a>
                </div>
              )}

              <div className="flex items-center justify-end mt-3 text-primary text-xs">
                <span>تفاصيل الطلب</span>
                <ChevronLeft size={14} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
