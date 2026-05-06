import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Car, Wrench, RefreshCw, AlertTriangle, CheckCircle,
  Clock, Truck, Package, X, BarChart3, MapPin, ArrowRight,
  Users, Search, ChevronDown,
} from "lucide-react";

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string; total_with_vat: number;
  delivery_location: string; destination_type: string; stage: string;
  vehicle_plate: string; driver_name: string; driver_phone: string;
  vehicle_assign_date: string; created_at: string;
}
interface Vehicle {
  id: number; plate_number: string; vehicle_type: string;
  status: string; driver_name: string; driver_phone: string;
  capacity?: number; notes?: string;
}
interface Driver {
  id: number; name: string; phone: string;
}

const STATUS_AR:    Record<string, string> = { available: "متاح", busy: "مشغول", maintenance: "صيانة", broken: "معطل" };
const STATUS_COLOR: Record<string, string> = {
  available:   "bg-green-50 text-green-700 border-green-200",
  busy:        "bg-blue-50 text-blue-700 border-blue-200",
  maintenance: "bg-amber-50 text-amber-700 border-amber-200",
  broken:      "bg-red-50 text-red-700 border-red-200",
};
const STATUS_DOT: Record<string, string> = {
  available: "bg-green-500", busy: "bg-blue-500", maintenance: "bg-amber-500", broken: "bg-red-500",
};

export default function SupervisorOrders() {
  const { user } = useAuth();
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers,  setDrivers]  = useState<Driver[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<"dashboard" | "pending" | "fleet" | "active">("dashboard");

  const [selectedOrder,   setSelectedOrder]   = useState<Order | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedDriver,  setSelectedDriver]  = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [vehicleSearch,   setVehicleSearch]   = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/workflow/orders?role=supervisor").then(r => r.json()),
      fetch("/api/workflow/vehicles").then(r => r.json()),
      fetch("/api/workflow/drivers").then(r => r.json()),
    ]).then(([o, v, d]) => {
      setOrders(Array.isArray(o) ? o : []);
      setVehicles(Array.isArray(v) ? v : []);
      setDrivers(Array.isArray(d) ? d : []);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const assignVehicle = async () => {
    if (!selectedOrder || !selectedVehicle || !selectedDriver || !user) return;
    setSubmitting(true);
    try {
      const driver = drivers.find(d => d.phone === selectedDriver);
      const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/assign-vehicle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supervisor_phone: user.phone,
          vehicle_id: parseInt(selectedVehicle),
          driver_phone: selectedDriver,
          driver_name_override: driver?.name,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedOrder(null); setSelectedVehicle(""); setSelectedDriver("");
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const reportBreak = async (vehicleId: number) => {
    const notes = prompt("وصف العطل:");
    if (!notes) return;
    await fetch(`/api/workflow/vehicles/${vehicleId}/break`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    load();
  };

  const pendingOrders  = useMemo(() => orders.filter(o => o.stage === "payment_confirmed"), [orders]);
  const activeOrders   = useMemo(() => orders.filter(o => ["vehicle_assigned", "invoiced", "loaded"].includes(o.stage)), [orders]);
  const availableVehicles = useMemo(() => vehicles.filter(v => v.status === "available"), [vehicles]);

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.toLowerCase();
    return vehicles.filter(v => !q || v.plate_number?.toLowerCase().includes(q) || v.vehicle_type?.toLowerCase().includes(q) || v.driver_name?.toLowerCase().includes(q));
  }, [vehicles, vehicleSearch]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={22} className="animate-spin text-[#103c68]" />
    </div>
  );

  const StagePill = ({ stage }: { stage: string }) => {
    const map: Record<string, { label: string; cls: string }> = {
      payment_confirmed: { label: "مؤكد الدفع",    cls: "bg-green-50 text-green-700 border-green-200" },
      vehicle_assigned:  { label: "سيارة معيّنة",   cls: "bg-blue-50 text-blue-700 border-blue-200" },
      invoiced:          { label: "تم الفوترة",     cls: "bg-purple-50 text-purple-700 border-purple-200" },
      loaded:            { label: "محمّل",          cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
    };
    const s = map[stage] ?? { label: stage, cls: "bg-gray-100 text-gray-500 border-gray-200" };
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>{s.label}</span>;
  };

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Truck size={24} className="text-[#103c68]" />مشرف النقليات
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {pendingOrders.length} طلب ينتظر تخصيص سيارة · {availableVehicles.length} سيارة متاحة
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl text-sm transition-colors">
          <RefreshCw size={14} />تحديث
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 flex-wrap bg-gray-100 p-1.5 rounded-2xl w-fit">
        {([
          { id: "dashboard", label: "الرئيسية",    icon: BarChart3 },
          { id: "pending",   label: "تحتاج تخصيص", icon: Clock,  count: pendingOrders.length },
          { id: "active",    label: "في التنفيذ",   icon: Package, count: activeOrders.length },
          { id: "fleet",     label: "الأسطول",      icon: Car,    count: vehicles.length },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon size={14} />{t.label}
              {"count" in t && t.count !== undefined && t.count > 0 && (
                <span className={`text-xs font-black px-1.5 rounded-full ${t.id === "pending" ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-600"}`}>
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
          {/* Alert */}
          {pendingOrders.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
                <div>
                  <div className="font-bold text-amber-800">{pendingOrders.length} طلب يحتاج تخصيص سيارة</div>
                  <div className="text-xs text-amber-600 mt-0.5">{availableVehicles.length} سيارة متاحة للتخصيص</div>
                </div>
              </div>
              <button onClick={() => setTab("pending")}
                className="flex-shrink-0 bg-amber-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-amber-600 flex items-center gap-1">
                تخصيص <ArrowRight size={12} />
              </button>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "بانتظار سيارة", val: pendingOrders.length,       color: "bg-amber-500",   icon: Clock },
              { label: "سيارات متاحة",  val: availableVehicles.length,   color: "bg-green-500",   icon: Car },
              { label: "سيارات مشغولة", val: vehicles.filter(v => v.status === "busy").length, color: "bg-blue-500", icon: Truck },
              { label: "تحت الصيانة",  val: vehicles.filter(v => ["maintenance","broken"].includes(v.status)).length, color: "bg-red-500", icon: Wrench },
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

          {/* Fleet overview */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-800 flex items-center gap-2"><Car size={16} className="text-[#103c68]" />حالة السيارات</h2>
              <button onClick={() => setTab("fleet")} className="text-xs text-[#103c68] font-semibold hover:underline">عرض الكل</button>
            </div>
            <div className="grid grid-cols-4 px-5 py-2.5 bg-gray-50 text-xs font-bold text-gray-500">
              <span className="col-span-2">السيارة</span>
              <span className="text-center">الحالة</span>
              <span className="text-center">السائق</span>
            </div>
            {vehicles.slice(0, 6).map(v => (
              <div key={v.id} className="grid grid-cols-4 px-5 py-3.5 border-t border-gray-50 items-center text-sm">
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${STATUS_DOT[v.status]}`} />
                    <span className="font-bold text-gray-800">{v.plate_number}</span>
                  </div>
                  <div className="text-xs text-gray-400 ps-4">{v.vehicle_type}</div>
                </div>
                <div className="text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLOR[v.status]}`}>
                    {STATUS_AR[v.status]}
                  </span>
                </div>
                <div className="text-center text-xs text-gray-500">{v.driver_name || "—"}</div>
              </div>
            ))}
          </div>

          {/* Active orders */}
          {activeOrders.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-800">الطلبات الجارية ({activeOrders.length})</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {activeOrders.slice(0, 5).map(o => (
                  <div key={o.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</div>
                      <div className="text-sm font-semibold text-gray-800 truncate">{o.customer_name}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1">
                        <Car size={10} />{o.vehicle_plate || "—"} · {o.driver_name || "—"}
                      </div>
                    </div>
                    <StagePill stage={o.stage} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ PENDING ORDERS ══ */}
      {tab === "pending" && (
        <div className="space-y-4">
          {pendingOrders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <CheckCircle size={40} className="mx-auto mb-3 text-green-400 opacity-60" />
              <p className="font-semibold text-gray-600">لا توجد طلبات معلقة</p>
            </div>
          ) : pendingOrders.map(order => (
            <div key={order.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="font-mono text-xs text-[#103c68] font-bold mb-0.5">{order.order_number}</div>
                  <div className="font-black text-gray-900 text-lg">{order.customer_name}</div>
                  <div className="text-sm text-gray-500">{order.product_name} × {order.quantity} {order.unit}</div>
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><MapPin size={11} />{order.delivery_location} · {order.destination_type}</div>
                </div>
                <div className="text-left flex-shrink-0">
                  <div className="font-black text-2xl text-gray-900">{order.total_with_vat?.toFixed(0)}</div>
                  <div className="text-xs text-gray-400">ر.س</div>
                </div>
              </div>
              <button
                onClick={() => { setSelectedOrder(order); setSelectedVehicle(""); setSelectedDriver(""); }}
                className="w-full flex items-center justify-center gap-2 bg-[#103c68] hover:bg-[#0d3158] text-white py-3 rounded-xl font-bold text-sm transition-colors">
                <Car size={15} />تخصيص سيارة
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ══ ACTIVE ORDERS ══ */}
      {tab === "active" && (
        <div className="space-y-3">
          {activeOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">لا توجد طلبات جارية</div>
          ) : activeOrders.map(o => (
            <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</span>
                    <StagePill stage={o.stage} />
                  </div>
                  <div className="font-semibold text-gray-800">{o.customer_name}</div>
                  <div className="text-xs text-gray-400">{o.product_name} × {o.quantity} {o.unit}</div>
                </div>
                <div className="font-black text-gray-900">{o.total_with_vat?.toFixed(0)} ر.س</div>
              </div>
              {(o.vehicle_plate || o.driver_name) && (
                <div className="bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-3 text-sm">
                  <Car size={14} className="text-blue-600" />
                  <span className="font-bold text-blue-800">{o.vehicle_plate}</span>
                  {o.driver_name && <span className="text-blue-600">· {o.driver_name}</span>}
                  {o.driver_phone && <span className="text-blue-500 text-xs">{o.driver_phone}</span>}
                </div>
              )}
              <div className="text-xs text-gray-400 mt-2 flex items-center gap-1"><MapPin size={10} />{o.delivery_location}</div>
            </div>
          ))}
        </div>
      )}

      {/* ══ FLEET MANAGEMENT ══ */}
      {tab === "fleet" && (
        <div className="space-y-4">
          {/* Vehicle status cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {["available","busy","maintenance","broken"].map(s => {
              const count = vehicles.filter(v => v.status === s).length;
              return (
                <div key={s} className={`rounded-2xl border p-4 text-center ${STATUS_COLOR[s]}`}>
                  <div className="text-2xl font-black">{count}</div>
                  <div className="text-sm mt-0.5 font-semibold">{STATUS_AR[s]}</div>
                </div>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={vehicleSearch} onChange={e => setVehicleSearch(e.target.value)}
              placeholder="بحث بلوحة، نوع، أو سائق..."
              className="w-full bg-white border border-gray-200 rounded-xl pe-10 ps-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 shadow-sm" />
          </div>

          {/* Fleet list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-12 px-5 py-3 bg-gray-50 text-xs font-bold text-gray-500">
              <span className="col-span-3">اللوحة</span>
              <span className="col-span-3">النوع</span>
              <span className="col-span-2 text-center">الحالة</span>
              <span className="col-span-2">السائق</span>
              <span className="col-span-2 text-center">إجراء</span>
            </div>
            {filteredVehicles.map(v => (
              <div key={v.id} className="grid grid-cols-12 px-5 py-3.5 border-t border-gray-50 items-center text-sm">
                <div className="col-span-3 flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[v.status]}`} />
                  <span className="font-bold text-gray-800">{v.plate_number}</span>
                </div>
                <div className="col-span-3 text-gray-500 text-xs">{v.vehicle_type}</div>
                <div className="col-span-2 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLOR[v.status]}`}>
                    {STATUS_AR[v.status]}
                  </span>
                </div>
                <div className="col-span-2 text-xs text-gray-600">{v.driver_name || "—"}</div>
                <div className="col-span-2 text-center">
                  {v.status !== "broken" && (
                    <button onClick={() => reportBreak(v.id)}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline flex items-center gap-1 mx-auto">
                      <Wrench size={11} />عطل
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ ASSIGN VEHICLE MODAL ══ */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="font-black text-gray-900 text-lg">تخصيص سيارة</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedOrder.order_number} · {selectedOrder.customer_name}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Order summary */}
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-gray-500">المنتج</span><span className="font-semibold">{selectedOrder.product_name} × {selectedOrder.quantity} {selectedOrder.unit}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">الوجهة</span><span className="font-semibold">{selectedOrder.delivery_location}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">نوع الوجهة</span><span className="font-semibold">{selectedOrder.destination_type}</span></div>
                <div className="flex justify-between font-bold border-t border-gray-200 pt-1.5">
                  <span>القيمة</span><span className="text-[#103c68]">{selectedOrder.total_with_vat?.toFixed(2)} ر.س</span>
                </div>
              </div>

              {/* Vehicle selection */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-2">اختر السيارة المتاحة *</label>
                {availableVehicles.length === 0 ? (
                  <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl p-3 text-center">
                    <AlertTriangle size={16} className="mx-auto mb-1 text-red-500" />
                    لا توجد سيارات متاحة حالياً
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {availableVehicles.map(v => (
                      <button key={v.id} type="button"
                        onClick={() => { setSelectedVehicle(String(v.id)); }}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-right transition-all ${
                          selectedVehicle === String(v.id)
                            ? "border-[#103c68] bg-[#103c68]/5 shadow-sm"
                            : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${selectedVehicle === String(v.id) ? "bg-[#103c68]" : "bg-gray-100"}`}>
                          <Car size={16} className={selectedVehicle === String(v.id) ? "text-white" : "text-gray-500"} />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-gray-900">{v.plate_number}</div>
                          <div className="text-xs text-gray-400">{v.vehicle_type}{v.driver_name ? ` · ${v.driver_name}` : ""}</div>
                        </div>
                        {selectedVehicle === String(v.id) && (
                          <CheckCircle size={18} className="text-[#103c68] flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Driver selection */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-2">اختر السائق *</label>
                {drivers.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl p-3 text-center">
                    لا يوجد سائقون مسجلون في النظام
                  </div>
                ) : (
                  <div className="space-y-2">
                    {drivers.map(d => (
                      <button key={d.phone} type="button"
                        onClick={() => setSelectedDriver(d.phone)}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-all ${
                          selectedDriver === d.phone
                            ? "border-[#103c68] bg-[#103c68]/5 shadow-sm"
                            : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${selectedDriver === d.phone ? "bg-[#103c68]" : "bg-gray-100"}`}>
                          <span className={`text-sm font-black ${selectedDriver === d.phone ? "text-white" : "text-gray-500"}`}>{d.name[0]}</span>
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-gray-900 text-sm">{d.name}</div>
                          <div className="text-xs text-gray-400">{d.phone}</div>
                        </div>
                        {selectedDriver === d.phone && (
                          <CheckCircle size={16} className="text-[#103c68] flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Helper hint showing what's still missing */}
              {(!selectedVehicle || !selectedDriver) && availableVehicles.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700 text-center">
                  {!selectedVehicle && !selectedDriver
                    ? "يرجى اختيار سيارة وسائق أولاً"
                    : !selectedVehicle
                    ? "يرجى اختيار سيارة"
                    : "يرجى اختيار سائق"}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setSelectedOrder(null); setSelectedVehicle(""); setSelectedDriver(""); }}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  إلغاء
                </button>
                <button onClick={assignVehicle}
                  disabled={submitting || !selectedVehicle || !selectedDriver || availableVehicles.length === 0}
                  className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-black text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                  {submitting
                    ? <><RefreshCw size={14} className="animate-spin" />جاري...</>
                    : <><Car size={14} />تخصيص السيارة</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
