import { useState } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { useQuery } from "@tanstack/react-query";
import { useAuth, authFetch } from "@/context/AuthContext";
import {
  Car, Wrench, AlertTriangle, DollarSign, LogOut,
  Activity, RefreshCw, User, Phone, Package, MapPin,
  Clock, CheckCircle2, Truck, FileText, Hash,
} from "lucide-react";

interface Driver  { id: number; name: string; phone: string; }
interface Order   {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string;
  delivery_location: string; stage: string; created_at: string;
  total_with_vat: number;
}
interface VehicleData {
  vehicle:        Record<string, unknown>;
  expenses:       Record<string, unknown>[];
  jobs:           Record<string, unknown>[];
  breakdowns:     Record<string, unknown>[];
  trips:          Record<string, unknown>[];
  totalExpenses:  number;
  totalJobs:      number;
  linked_driver:  Driver | null;
  active_orders:  Order[];
}

const STAGE_INFO: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  vehicle_assigned: { label: "جاهز — انتظار الفاتورة",  color: "bg-purple-100 text-purple-700 border-purple-200", icon: Clock },
  invoiced:         { label: "جاهز للتحميل",             color: "bg-cyan-100 text-cyan-700 border-cyan-200",       icon: Package },
  loaded:           { label: "في الطريق للتسليم",        color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: Truck },
  delivered:        { label: "تم التسليم",               color: "bg-gray-100 text-gray-600 border-gray-200",       icon: CheckCircle2 },
};

const V_STATUS_AR: Record<string, string> = {
  available:   "متاحة",
  busy:        "مشغولة",
  maintenance: "تحت الصيانة",
  broken:      "معطلة",
};
const V_STATUS_COLOR: Record<string, string> = {
  available:   "bg-green-100 text-green-700",
  busy:        "bg-blue-100 text-blue-700",
  maintenance: "bg-yellow-100 text-yellow-700",
  broken:      "bg-red-100 text-red-700",
};

const fmt     = (n: unknown) => Number(n || 0).toLocaleString("ar-SA", { maximumFractionDigits: 0 });
const fmtDate = (d: unknown) => d ? String(d).slice(0, 10) : "—";

function EmptyState({ icon: Icon, msg }: { icon: React.ElementType; msg: string }) {
  return (
    <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
      <Icon size={36} className="text-gray-300 mx-auto mb-3" />
      <p className="text-gray-400 text-sm">{msg}</p>
    </div>
  );
}

export default function VehicleExpenses() {
  const { user, token, logout } = useAuth();
  const [tab, setTab] = useRememberedState("vehicle-expenses-tab", "orders" as "orders" | "breakdowns" | "jobs" | "expenses" | "trips");
  const af    = authFetch(token);
  const plate = user?.vehicle_plate || "";

  const { data, isLoading, refetch } = useQuery<VehicleData>({
    queryKey: ["vehicle-dashboard", plate],
    queryFn:  () => af(`/vehicle-dashboard/${plate}`),
    enabled:  !!plate,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#103c68] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const vehicle       = data?.vehicle  as Record<string, string | number> | undefined;
  const linkedDriver  = data?.linked_driver ?? null;
  const activeOrders  = data?.active_orders ?? [];
  const currentOrder  = activeOrders.find(o => o.stage !== "delivered");
  const vStatus       = String(vehicle?.status || "available");

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {/* ══ Header ══ */}
      <div className="bg-gradient-to-l from-[#103c68] to-[#0b2d50] text-white px-5 py-4 shadow-lg">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center">
              <Car size={24} />
            </div>
            <div>
              <div className="font-black text-2xl tracking-wider">{plate}</div>
              <div className="text-white/60 text-xs">{String(vehicle?.vehicle_type || "مركبة")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-bold border border-white/20 ${
              vStatus === "busy" ? "bg-blue-500/40" :
              vStatus === "broken" ? "bg-red-500/40" :
              vStatus === "maintenance" ? "bg-yellow-500/40" : "bg-green-500/40"
            }`}>
              {V_STATUS_AR[vStatus] || vStatus}
            </span>
            <button onClick={() => refetch()}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
              <RefreshCw size={15} />
            </button>
            <button onClick={logout}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl text-sm transition-colors">
              <LogOut size={14} />خروج
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">

        {/* ══ Vehicle info + Driver row ══ */}
        <div className="grid grid-cols-2 gap-3">
          {/* Vehicle Info Card */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
              <Car size={12} />بيانات السيارة
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">النوع</span>
                <span className="font-semibold text-gray-800">{String(vehicle?.vehicle_type || "—")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">الحالة</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${V_STATUS_COLOR[vStatus] || "bg-gray-100 text-gray-600"}`}>
                  {V_STATUS_AR[vStatus] || vStatus}
                </span>
              </div>
              {vehicle?.gps_device_id && (
                <div className="flex justify-between">
                  <span className="text-gray-400">GPS</span>
                  <span className="font-mono text-xs text-emerald-700 font-bold">{String(vehicle.gps_device_id)}</span>
                </div>
              )}
              {vehicle?.driver_name && (
                <div className="flex justify-between">
                  <span className="text-gray-400">السائق</span>
                  <span className="font-semibold text-gray-700 text-xs">{String(vehicle.driver_name)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Linked Driver Card */}
          <div className={`rounded-2xl p-4 border ${linkedDriver ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-100"}`}>
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              <User size={12} />السائق المرتبط
            </div>
            {linkedDriver ? (
              <div className="space-y-1.5">
                <div className="font-bold text-gray-800 text-sm">{linkedDriver.name}</div>
                <a href={`tel:${linkedDriver.phone}`}
                  className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold hover:underline">
                  <Phone size={11} />{linkedDriver.phone}
                </a>
              </div>
            ) : (
              <div className="text-gray-400 text-xs mt-2">لا يوجد سائق مرتبط حالياً</div>
            )}
          </div>
        </div>

        {/* ══ Current Active Order (prominent) ══ */}
        {currentOrder && (
          <div className="bg-white rounded-2xl border-2 border-[#0eb5cb] shadow-md overflow-hidden">
            <div className="bg-[#0eb5cb] px-4 py-2.5 flex items-center justify-between">
              <span className="font-bold text-white text-sm flex items-center gap-2">
                <Truck size={15} />الطلبية الحالية
              </span>
              {(() => {
                const info = STAGE_INFO[currentOrder.stage];
                const Icon = info?.icon ?? Clock;
                return (
                  <span className="flex items-center gap-1 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                    <Icon size={10} />{info?.label || currentOrder.stage}
                  </span>
                );
              })()}
            </div>
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-black text-[#103c68] text-base">{currentOrder.order_number}</span>
                <span className="text-xs text-gray-400">{fmtDate(currentOrder.created_at)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div>
                  <span className="text-gray-400 text-xs">العميل</span>
                  <div className="font-semibold text-gray-800">{currentOrder.customer_name}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">المنتج</span>
                  <div className="font-semibold text-gray-800">{currentOrder.product_name}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">الكمية</span>
                  <div className="font-semibold text-gray-800">{currentOrder.quantity} {currentOrder.unit}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">الإجمالي</span>
                  <div className="font-bold text-[#103c68]">{fmt(currentOrder.total_with_vat)} ﷼</div>
                </div>
              </div>
              <div className="flex items-start gap-1.5 bg-gray-50 rounded-xl px-3 py-2">
                <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700">{currentOrder.delivery_location}</span>
              </div>
            </div>
          </div>
        )}

        {/* ══ Tabs ══ */}
        <div className="flex bg-white rounded-2xl p-1 border border-gray-100 overflow-x-auto gap-0.5">
          {([
            { key: "orders",     label: "الطلبيات",        icon: FileText,     count: activeOrders.length },
            { key: "breakdowns", label: "الأعطال",          icon: AlertTriangle, count: data?.breakdowns.length },
            { key: "jobs",       label: "أوامر العمل",      icon: Wrench,        count: data?.jobs.length },
            { key: "expenses",   label: "المصاريف",          icon: DollarSign,    count: data?.expenses.length },
            { key: "trips",      label: "الرحلات",           icon: Activity,      count: data?.trips.length },
          ] as const).map(({ key, label, icon: Icon, count }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 min-w-[60px] flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap
                ${tab === key ? "bg-[#103c68] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon size={13} />
              <span>{label}</span>
              {!!count && count > 0 && (
                <span className={`text-[9px] font-black ${tab === key ? "text-white/70" : "text-[#0eb5cb]"}`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ══ Tab Content ══ */}
        <div className="space-y-3 pb-8">

          {/* Orders */}
          {tab === "orders" && (
            activeOrders.length === 0
              ? <EmptyState icon={FileText} msg="لا توجد طلبيات مسجّلة على هذه السيارة" />
              : activeOrders.map((o) => {
                  const info = STAGE_INFO[o.stage];
                  const Icon = info?.icon ?? Hash;
                  return (
                    <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-bold text-[#103c68]">{o.order_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1 ${info?.color || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                          <Icon size={10} />{info?.label || o.stage}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                        <div><span className="text-gray-400 text-xs">العميل </span><span className="font-semibold">{o.customer_name}</span></div>
                        <div><span className="text-gray-400 text-xs">المنتج </span><span className="font-semibold">{o.product_name}</span></div>
                        <div><span className="text-gray-400 text-xs">الكمية </span><span className="font-semibold">{o.quantity} {o.unit}</span></div>
                        <div><span className="text-gray-400 text-xs">الإجمالي </span><span className="font-bold text-[#103c68]">{fmt(o.total_with_vat)} ﷼</span></div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
                        <MapPin size={11} className="text-gray-400" />{o.delivery_location}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{fmtDate(o.created_at)}</div>
                    </div>
                  );
                })
          )}

          {/* Breakdowns */}
          {tab === "breakdowns" && (
            !data?.breakdowns.length
              ? <EmptyState icon={AlertTriangle} msg="لا توجد أعطال مسجّلة لهذه السيارة" />
              : data.breakdowns.map((b, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-gray-800 text-sm">{String(b.breakdown_type || "عطل")}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        b.status === "open"     ? "bg-red-100 text-red-700" :
                        b.status === "resolved" ? "bg-green-100 text-green-700" :
                        "bg-yellow-100 text-yellow-700"}`}>
                        {b.status === "open" ? "مفتوح" : b.status === "resolved" ? "تم الحل" : String(b.status)}
                      </span>
                    </div>
                    <div className="text-gray-500 text-xs">{String(b.description || "")}</div>
                    {!!b.resolve_notes && (
                      <div className="mt-1.5 text-xs text-green-700 bg-green-50 rounded-xl px-3 py-1.5">
                        ملاحظات الحل: {String(b.resolve_notes)}
                      </div>
                    )}
                    <div className="text-gray-400 text-xs mt-1.5 flex items-center gap-2">
                      <span>{fmtDate(b.created_at)}</span>
                      {!!b.driver_name && <span>· السائق: {String(b.driver_name)}</span>}
                    </div>
                  </div>
                ))
          )}

          {/* Workshop Jobs */}
          {tab === "jobs" && (
            !data?.jobs.length
              ? <EmptyState icon={Wrench} msg="لا توجد أوامر عمل لهذه السيارة" />
              : data.jobs.map((j, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-gray-800 text-sm">{String(j.title)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        j.status === "open"        ? "bg-red-100 text-red-700" :
                        j.status === "in_progress" ? "bg-yellow-100 text-yellow-700" :
                        "bg-green-100 text-green-700"}`}>
                        {j.status === "open" ? "مفتوح" : j.status === "in_progress" ? "جارٍ" : "مكتمل"}
                      </span>
                    </div>
                    <div className="text-gray-500 text-xs">{String(j.description || "")}</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-400">{fmtDate(j.created_at)}</span>
                      <div className="flex items-center gap-3 text-xs">
                        {Number(j.labor_cost) > 0 && <span className="text-gray-500">أجور: {fmt(j.labor_cost)} ﷼</span>}
                        {Number(j.parts_cost) > 0 && <span className="text-gray-500">قطع: {fmt(j.parts_cost)} ﷼</span>}
                        <span className="font-bold text-orange-600">إجمالي: {fmt(j.total_cost)} ﷼</span>
                      </div>
                    </div>
                  </div>
                ))
          )}

          {/* Expenses */}
          {tab === "expenses" && (
            !data?.expenses.length
              ? <EmptyState icon={DollarSign} msg="لا توجد مصاريف مسجّلة لهذه السيارة" />
              : data.expenses.map((e, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-gray-800 text-sm">{String(e.expense_category || "مصروف")}</span>
                      <span className="font-black text-red-600">{fmt(e.amount)} ﷼</span>
                    </div>
                    <div className="text-gray-500 text-xs">{String(e.description || "")}</div>
                    <div className="text-gray-400 text-xs mt-1 flex items-center gap-2">
                      <span>{fmtDate(e.date)}</span>
                      {!!e.document_number && <span>#{String(e.document_number)}</span>}
                    </div>
                  </div>
                ))
          )}

          {/* Trips */}
          {tab === "trips" && (
            !data?.trips.length
              ? <EmptyState icon={Activity} msg="لا توجد رحلات مسجّلة لهذه السيارة" />
              : data.trips.map((t, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-gray-800 text-sm">{String(t.material_type || "رحلة")}</span>
                      <span className="font-black text-green-600">{fmt(t.net_amount)} ﷼</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      {!!t.client_name  && <span>العميل: {String(t.client_name)}</span>}
                      {!!t.destination  && <span>الوجهة: {String(t.destination)}</span>}
                      {!!t.driver_name  && <span>السائق: {String(t.driver_name)}</span>}
                    </div>
                    <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
                      <span>{fmtDate(t.date)}</span>
                      <span>{Number(t.trips_count || 1)} رحلة × {fmt(t.unit_price)} ﷼</span>
                    </div>
                  </div>
                ))
          )}
        </div>
      </div>
    </div>
  );
}
