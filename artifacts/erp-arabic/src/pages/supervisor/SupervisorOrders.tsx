import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Car, Wrench } from "lucide-react";

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string; total_with_vat: number;
  delivery_location: string; destination_type: string; stage: string; created_at: string;
  vehicle_plate: string; driver_name: string; driver_phone: string; vehicle_assign_date: string;
}
interface Vehicle { id: number; plate_number: string; vehicle_type: string; status: string; driver_name: string; }

const STATUS_AR: Record<string, string> = { available: "متاح", busy: "مشغول", maintenance: "صيانة", broken: "معطل" };
const STATUS_COLOR: Record<string, string> = { available: "bg-green-100 text-green-700", busy: "bg-blue-100 text-blue-700", maintenance: "bg-yellow-100 text-yellow-700", broken: "bg-red-100 text-red-700" };

export default function SupervisorOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/workflow/orders?role=supervisor").then(r => r.json()),
      fetch("/api/workflow/vehicles").then(r => r.json()),
    ]).then(([o, v]) => { setOrders(o); setVehicles(v); }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const assignVehicle = async () => {
    if (!selectedOrder || !selectedVehicle || !user) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/assign-vehicle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisor_phone: user.phone, vehicle_id: parseInt(selectedVehicle), driver_phone: driverPhone }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedOrder(null); setSelectedVehicle(""); setDriverPhone("");
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const reportBreak = async (vehicleId: number) => {
    const notes = prompt("وصف العطل:");
    if (!notes) return;
    await fetch(`/api/workflow/vehicles/${vehicleId}/break`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    load();
  };

  const pendingOrders = orders.filter(o => o.stage === "payment_confirmed");
  const assignedOrders = orders.filter(o => o.stage === "vehicle_assigned");
  const availableVehicles = vehicles.filter(v => v.status === "available");

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">مشرف النقليات</h1>
        <p className="text-muted-foreground text-sm">{pendingOrders.length} طلب ينتظر تخصيص سيارة</p>
      </div>

      {/* Vehicle status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {["available","busy","maintenance","broken"].map(s => {
          const count = vehicles.filter(v => v.status === s).length;
          return (
            <div key={s} className={`${STATUS_COLOR[s]} rounded-xl p-4 text-center`}>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-sm mt-1">{STATUS_AR[s]}</div>
            </div>
          );
        })}
      </div>

      {/* Vehicles table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 font-bold">
          <Car size={18} className="text-primary" />حالة السيارات
        </div>
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/30 text-right"><th className="px-4 py-2.5 font-semibold text-muted-foreground">اللوحة</th><th className="px-4 py-2.5 font-semibold text-muted-foreground">النوع</th><th className="px-4 py-2.5 font-semibold text-muted-foreground">الحالة</th><th className="px-4 py-2.5 font-semibold text-muted-foreground">السائق</th><th className="px-4 py-2.5"></th></tr></thead>
          <tbody>
            {vehicles.map(v => (
              <tr key={v.id} className="border-t border-border hover:bg-muted/20">
                <td className="px-4 py-3 font-bold">{v.plate_number}</td>
                <td className="px-4 py-3 text-muted-foreground">{v.vehicle_type}</td>
                <td className="px-4 py-3"><span className={`${STATUS_COLOR[v.status]} px-2.5 py-1 rounded-full text-xs font-medium`}>{STATUS_AR[v.status]}</span></td>
                <td className="px-4 py-3">{v.driver_name || "—"}</td>
                <td className="px-4 py-3">
                  {v.status !== "broken" && (
                    <button onClick={() => reportBreak(v.id)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                      <Wrench size={12} /> عطل
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending assignment orders */}
      <h2 className="font-bold text-lg mb-4">طلبات تحتاج تخصيص سيارة ({pendingOrders.length})</h2>
      <div className="space-y-4 mb-8">
        {pendingOrders.length === 0 && <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-border">لا توجد طلبات معلقة</div>}
        {pendingOrders.map(order => (
          <div key={order.id} className="bg-card border border-yellow-300 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-mono text-sm font-bold text-primary">{order.order_number}</div>
                <div className="font-bold">{order.customer_name}</div>
                <div className="text-sm text-muted-foreground">{order.product_name} × {order.quantity} {order.unit}</div>
              </div>
              <div className="text-left">
                <div className="font-bold">{order.total_with_vat?.toFixed(2)} ر.س</div>
                <div className="text-xs text-muted-foreground mt-1">{order.destination_type}</div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground mb-3">📍 {order.delivery_location}</div>
            <button onClick={() => { setSelectedOrder(order); setSelectedVehicle(""); setDriverPhone(""); }}
              className="w-full bg-primary text-white py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90">
              تخصيص سيارة
            </button>
          </div>
        ))}
      </div>

      {/* Assigned orders */}
      {assignedOrders.length > 0 && (
        <>
          <h2 className="font-bold text-lg mb-4">طلبات بها سيارة ({assignedOrders.length})</h2>
          <div className="space-y-3">
            {assignedOrders.map(order => (
              <div key={order.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs text-primary font-bold">{order.order_number}</div>
                  <div className="font-medium">{order.customer_name}</div>
                </div>
                <div className="text-left text-sm">
                  <div className="font-bold text-primary">{order.vehicle_plate}</div>
                  <div className="text-muted-foreground text-xs">{order.driver_name}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Assign modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-xl mb-1">تخصيص سيارة</h2>
            <p className="text-sm text-muted-foreground mb-5">{selectedOrder.order_number} — {selectedOrder.customer_name}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">اختر السيارة المتاحة *</label>
                {availableVehicles.length === 0 ? (
                  <div className="bg-red-50 text-red-700 text-sm rounded-xl p-3">لا توجد سيارات متاحة حالياً</div>
                ) : (
                  <div className="space-y-2">
                    {availableVehicles.map(v => (
                      <button key={v.id} type="button"
                        onClick={() => { setSelectedVehicle(String(v.id)); if (v.driver_name) setDriverPhone(v.driver_name); }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-colors ${selectedVehicle === String(v.id) ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}>
                        <Car size={20} className="text-primary flex-shrink-0" />
                        <div>
                          <div className="font-bold">{v.plate_number}</div>
                          <div className="text-xs text-muted-foreground">{v.vehicle_type}{v.driver_name ? ` — ${v.driver_name}` : ""}</div>
                        </div>
                        {selectedVehicle === String(v.id) && <span className="mr-auto text-primary">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">جوال السائق</label>
                <input value={driverPhone} onChange={e => setDriverPhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={assignVehicle} disabled={submitting || !selectedVehicle || availableVehicles.length === 0}
                className="flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 disabled:opacity-60">
                {submitting ? "جاري التخصيص..." : "تخصيص السيارة"}
              </button>
              <button onClick={() => setSelectedOrder(null)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
