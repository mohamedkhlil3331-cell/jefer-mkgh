import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Badge from "@/components/Badge";

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string; total_with_vat: number;
  delivery_location: string; stage: string; vehicle_plate: string; driver_phone: string;
  created_at: string;
}

export default function RepOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/workflow/orders?role=rep&phone=${user.phone}`)
      .then(r => r.json()).then(setOrders).finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">طلبات عملائي</h1>
        <p className="text-muted-foreground text-sm">{orders.length} طلب</p>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground bg-card rounded-xl border border-border">لا توجد طلبات مرتبطة بك</div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-mono text-sm font-bold text-primary">{order.order_number}</div>
                  <div className="font-bold">{order.customer_name || order.customer_phone}</div>
                  <div className="text-sm text-muted-foreground">{order.product_name} × {order.quantity} {order.unit}</div>
                </div>
                <div className="text-left">
                  <div className="font-bold">{order.total_with_vat?.toFixed(2)} ر.س</div>
                  <div className="mt-1"><Badge status={order.stage} /></div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground mb-2">📍 {order.delivery_location}</div>

              {order.stage === "loaded" && (
                <div className="bg-green-50 rounded-lg p-3 text-sm">
                  <div className="text-green-700 font-medium">🚛 السائق في الطريق</div>
                  {order.vehicle_plate && <div className="text-green-600">السيارة: {order.vehicle_plate}</div>}
                  {order.driver_phone && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-green-600">جوال السائق: {order.driver_phone}</span>
                      <a href={`https://wa.me/966${order.driver_phone.replace(/^0/,"")}`} target="_blank" rel="noreferrer"
                        className="bg-green-600 text-white text-xs px-2 py-0.5 rounded">واتساب</a>
                    </div>
                  )}
                </div>
              )}

              <div className="text-xs text-muted-foreground mt-2">{new Date(order.created_at).toLocaleDateString("ar-SA", { dateStyle: "full" })}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
