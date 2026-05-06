import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Car, Truck, Wrench, DollarSign, Users, AlertTriangle,
  TrendingUp, TrendingDown, RefreshCw, Package, BarChart3,
  ChevronRight, Calendar,
} from "lucide-react";

interface DashboardData {
  vehicles:  { status: string; c: number }[];
  orders:    { status: string; c: number }[];
  workshop:  { c: number };
  tripRev:   { total: number | null };
  expenses:  { total: number | null };
  employees: { c: number };
  expiring:  { name: string; iqama_end: string; work_permit_end: string; driver_license_end: string }[];
}

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("ar-SA", { maximumFractionDigits: 0 });
}

const V_STATUS_COLOR: Record<string, string> = {
  available:   "bg-green-500", busy: "bg-blue-500",
  maintenance: "bg-amber-500", broken: "bg-red-500",
};
const V_STATUS_AR: Record<string, string> = {
  available: "متاح", busy: "مشغول", maintenance: "صيانة", broken: "معطل",
};

export default function Dashboard() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/dashboard").then(r => r.json()).then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#103c68] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const vMap = Object.fromEntries((data?.vehicles ?? []).map(v => [v.status, v.c]));
  const oMap = Object.fromEntries((data?.orders   ?? []).map(o => [o.status, o.c]));
  const totalVehicles = Object.values(vMap).reduce((a, b) => a + b, 0);

  const tripRev  = data?.tripRev.total  ?? 0;
  const expenses = data?.expenses.total ?? 0;
  const net      = tripRev - expenses;

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <BarChart3 size={22} className="text-[#103c68]" />لوحة التحكم
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">نظرة عامة على عمليات الشركة</p>
        </div>
        <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
          <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المركبات", val: fmt(totalVehicles),   icon: Car,       color: "bg-[#103c68] text-white", href: "/vehicles"  },
          { label: "مركبات متاحة",    val: fmt(vMap.available),  icon: Car,       color: "bg-green-600 text-white", href: "/vehicles"  },
          { label: "إيرادات الردود",  val: `${fmt(tripRev)} ر.س`, icon: Truck,     color: "bg-emerald-600 text-white",href: "/trips"    },
          { label: "مصاريف الأسطول", val: `${fmt(expenses)} ر.س`,icon: DollarSign,color: "bg-red-500 text-white",   href: "/fleet-expenses" },
          { label: "طلبات الورشة",    val: fmt(data?.workshop.c),icon: Wrench,    color: "bg-amber-500 text-white", href: "/workshop"  },
          { label: "موظفون نشطون",    val: fmt(data?.employees.c),icon: Users,    color: "bg-purple-600 text-white",href: "/employees" },
          { label: "صافي الإيرادات",  val: `${fmt(net)} ر.س`,    icon: net >= 0 ? TrendingUp : TrendingDown,
            color: net >= 0 ? "bg-teal-600 text-white" : "bg-rose-600 text-white", href: "/trips" },
          { label: "طلبات جارية",     val: fmt(oMap.in_progress),icon: Package,   color: "bg-indigo-600 text-white",href: "/orders"   },
        ].map(({ label, val, icon: Icon, color, href }) => (
          <Link key={label} href={href}>
            <div className={`${color} rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity shadow-sm`}>
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Icon size={17} className="text-white" />
              </div>
              <div>
                <div className="font-black text-base leading-tight">{val}</div>
                <div className="text-xs opacity-75 mt-0.5">{label}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Vehicle status bars */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2"><Car size={16} className="text-[#103c68]" />حالة المركبات</h2>
            <Link href="/vehicles">
              <span className="text-xs text-[#103c68] font-semibold flex items-center gap-0.5 hover:underline cursor-pointer">
                عرض الكل <ChevronRight size={13} />
              </span>
            </Link>
          </div>
          <div className="space-y-3">
            {Object.entries(V_STATUS_AR).map(([key, label]) => {
              const count = vMap[key] ?? 0;
              const pct   = totalVehicles ? Math.round((count / totalVehicles) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${V_STATUS_COLOR[key]}`} />
                      <span className="text-gray-700">{label}</span>
                    </span>
                    <span className="font-bold text-gray-900">{count} <span className="text-gray-400 font-normal text-xs">({pct}%)</span></span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${V_STATUS_COLOR[key]} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Orders status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2"><Package size={16} className="text-[#103c68]" />حالة الطلبات</h2>
            <Link href="/orders">
              <span className="text-xs text-[#103c68] font-semibold flex items-center gap-0.5 hover:underline cursor-pointer">
                عرض الكل <ChevronRight size={13} />
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: "new",         label: "جديد",        color: "bg-blue-100 text-blue-800 border-blue-200"       },
              { key: "in_progress", label: "جاري",        color: "bg-amber-100 text-amber-800 border-amber-200"   },
              { key: "delivered",   label: "تم التسليم",  color: "bg-green-100 text-green-800 border-green-200"   },
              { key: "cancelled",   label: "ملغي",        color: "bg-gray-100 text-gray-700 border-gray-200"      },
            ].map(({ key, label, color }) => (
              <div key={key} className={`${color} border rounded-2xl p-4 text-center`}>
                <div className="text-2xl font-black">{oMap[key] ?? 0}</div>
                <div className="text-xs mt-0.5 font-medium">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expiring documents alert */}
      {data?.expiring && data.expiring.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-base mb-4 flex items-center gap-2 text-amber-800">
            <AlertTriangle size={18} className="text-amber-500" />
            وثائق تنتهي قريباً ({data.expiring.length} موظف)
          </h2>
          <div className="space-y-2">
            {data.expiring.map((e, i) => (
              <div key={i} className="bg-white rounded-xl border border-amber-200 p-3 flex flex-wrap items-center gap-3 text-sm">
                <div className="font-bold text-gray-900 min-w-[120px]">{e.name}</div>
                <div className="flex flex-wrap gap-2">
                  {e.iqama_end && (
                    <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-lg font-medium">
                      <Calendar size={10} />إقامة: {e.iqama_end}
                    </span>
                  )}
                  {e.work_permit_end && (
                    <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs px-2 py-1 rounded-lg font-medium">
                      <Calendar size={10} />تصريح عمل: {e.work_permit_end}
                    </span>
                  )}
                  {e.driver_license_end && (
                    <span className="flex items-center gap-1 bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded-lg font-medium">
                      <Calendar size={10} />رخصة قيادة: {e.driver_license_end}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
