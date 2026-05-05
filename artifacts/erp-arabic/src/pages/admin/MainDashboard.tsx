import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, ShoppingCart, Truck, DollarSign, Users, Clock, CheckCircle,
  AlertTriangle, Package, Bell, RefreshCw, Download, ArrowLeft,
} from "lucide-react";

interface DashData {
  kpi: Record<string, number>;
  chart_monthly: { label: string; orders: number; revenue: number }[];
  chart_stages: { name: string; value: number; key: string }[];
  chart_products: { name: string; count: number }[];
  recent_orders: Record<string, unknown>[];
  vehicles: Record<string, unknown>[];
}

const PIE_COLORS = ["#F59E0B","#3B82F6","#8B5CF6","#EC4899","#F97316","#10B981","#EF4444"];

const VEHICLE_STATUS_COLOR: Record<string, string> = {
  available: "bg-green-100 border-green-300 text-green-700",
  busy: "bg-orange-100 border-orange-300 text-orange-700",
  maintenance: "bg-yellow-100 border-yellow-300 text-yellow-700",
  broken: "bg-red-100 border-red-300 text-red-700",
};
const VEHICLE_STATUS_LABEL: Record<string, string> = {
  available: "متاحة", busy: "مشغولة", maintenance: "صيانة", broken: "تعطل",
};

function KpiCard({ label, value, icon: Icon, color, sub, href }: {
  label: string; value: string | number; icon: React.ElementType;
  color: string; sub?: string; href?: string;
}) {
  const inner = (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-start gap-4 ${href ? "cursor-pointer hover:shadow-md hover:border-blue-100 group transition-all" : ""}`}>
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold text-gray-900 leading-none mb-1">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
      {href && (
        <ArrowLeft size={16} className="text-gray-300 group-hover:text-blue-500 mt-1 transition-colors flex-shrink-0" />
      )}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function StageBadge({ stage }: { stage: string }) {
  const LABELS: Record<string, string> = {
    pending: "انتظار", payment_confirmed: "مؤكد", vehicle_assigned: "مجهّز",
    invoiced: "فاتورة", loaded: "في الطريق", delivered: "تم", cancelled: "ملغي",
  };
  const COLORS: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700", payment_confirmed: "bg-blue-100 text-blue-700",
    vehicle_assigned: "bg-purple-100 text-purple-700", invoiced: "bg-pink-100 text-pink-700",
    loaded: "bg-orange-100 text-orange-700", delivered: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COLORS[stage] || "bg-gray-100 text-gray-600"}`}>
      {LABELS[stage] || stage}
    </span>
  );
}

function exportCSV(data: DashData) {
  const rows = data.recent_orders.map(o =>
    [o.order_number, o.customer_name || o.customer_phone, o.product_name, o.quantity, o.unit, o.total_with_vat, o.stage, o.created_at].join(",")
  );
  const csv = ["رقم الطلب,العميل,المنتج,الكمية,الوحدة,المجموع,الحالة,التاريخ", ...rows].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
  a.download = `mkgh-dashboard-${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

export default function MainDashboard() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const today = new Date().toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch("/api/stats/dashboard");
      const d = await res.json();
      setData(d);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!data) return null;

  const { kpi } = data;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">لوحة التحكم الرئيسية</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportCSV(data)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Download size={15} />تصدير
          </button>
          <button
            onClick={() => load(true)}
            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm ${refreshing ? "opacity-70" : ""}`}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />تحديث
          </button>
        </div>
      </div>

      {/* Alerts */}
      {(kpi.pending_orders > 0 || kpi.pending_transfers > 0) && (
        <div className="flex flex-wrap gap-3">
          {kpi.pending_orders > 0 && (
            <Link href="/reviewer">
              <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700 cursor-pointer hover:bg-yellow-100 transition-colors">
                <AlertTriangle size={15} />
                <span>{kpi.pending_orders} طلب بانتظار المراجعة — انقر للعرض</span>
              </div>
            </Link>
          )}
          {kpi.pending_transfers > 0 && (
            <Link href="/reviewer">
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors">
                <Bell size={15} />
                <span>{kpi.pending_transfers} تحويل بانتظار التأكيد — انقر للعرض</span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* KPI Row 1 — clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="إجمالي الطلبات" icon={ShoppingCart} color="bg-blue-600"
          value={kpi.total_orders} sub={`${kpi.delivered_orders} مُنفَّذ`}
          href="/reviewer"
        />
        <KpiCard
          label="الإيرادات (ريال)" icon={DollarSign} color="bg-green-600"
          value={kpi.revenue.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
          sub="شامل 15% ضريبة"
          href="/erp/invoices"
        />
        <KpiCard
          label="السيارات المتاحة" icon={Truck} color="bg-orange-500"
          value={kpi.vehicles_available} sub={`${kpi.vehicles_busy} مشغولة`}
          href="/supervisor"
        />
        <KpiCard
          label="العملاء النشطون" icon={Users} color="bg-purple-600"
          value={kpi.customers} sub={`${kpi.employees} موظف`}
          href="/admin"
        />
      </div>

      {/* KPI Row 2 — clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="طلبات معلّقة" icon={Clock} color="bg-yellow-500"
          value={kpi.pending_orders}
          href="/reviewer"
        />
        <KpiCard
          label="تم التسليم" icon={CheckCircle} color="bg-teal-600"
          value={kpi.delivered_orders}
          href="/reviewer"
        />
        <KpiCard
          label="إشعارات جديدة" icon={Bell} color="bg-red-500"
          value={kpi.notifications}
          href="/notifications"
        />
        <KpiCard
          label="تحويلات بانتظار" icon={Package} color="bg-indigo-500"
          value={kpi.pending_transfers}
          href="/reviewer"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Link href="/reviewer">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-100 transition-all">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">الطلبات الشهرية</h3>
              <TrendingUp size={16} className="text-blue-500" />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.chart_monthly} margin={{ right: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6B7280" }} tickFormatter={l => l.split(" ")[0]} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} />
                <Tooltip formatter={(v, n) => [v, n === "orders" ? "طلبات" : "إيرادات (ريال)"]} />
                <Bar dataKey="orders" fill="#3B82F6" radius={[4,4,0,0]} name="orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Link>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">توزيع حالات الطلبات</h3>
            <ShoppingCart size={16} className="text-purple-500" />
          </div>
          {data.chart_stages.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={data.chart_stages} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {data.chart_stages.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [v, "طلبات"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {data.chart_stages.map((s, i) => (
                  <Link key={i} href="/reviewer">
                    <div className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 rounded-lg px-1 py-0.5 transition-colors">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-gray-600 flex-1 truncate">{s.name}</span>
                      <span className="font-semibold text-gray-800">{s.value}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">لا توجد بيانات بعد</div>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Link href="/erp/invoices">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-green-100 transition-all">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">منحنى الإيرادات</h3>
              <DollarSign size={16} className="text-green-500" />
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.chart_monthly} margin={{ right: 10, left: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6B7280" }} tickFormatter={l => l.split(" ")[0]} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} />
                <Tooltip formatter={(v) => [`${v} ريال`, "الإيرادات"]} />
                <Area type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Link>

        <Link href="/products-admin">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-orange-100 transition-all">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">أكثر المنتجات طلباً</h3>
              <Package size={16} className="text-orange-500" />
            </div>
            {data.chart_products.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.chart_products} layout="vertical" margin={{ right: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} width={100} />
                  <Tooltip formatter={(v) => [v, "طلبات"]} />
                  <Bar dataKey="count" fill="#F97316" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">لا توجد بيانات بعد</div>
            )}
          </div>
        </Link>
      </div>

      {/* Vehicles grid — clickable → supervisor */}
      <Link href="/supervisor">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-orange-100 transition-all">
          <div className="flex items-center gap-2 mb-4">
            <Truck size={18} className="text-orange-500" />
            <h3 className="font-semibold text-gray-800">حالة الأسطول</h3>
            <span className="mr-auto text-sm text-gray-400">{data.vehicles.length} مركبة — انقر للإدارة</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.vehicles.map((v, i) => (
              <div key={i} className={`border rounded-xl p-3 ${VEHICLE_STATUS_COLOR[v.status as string] || "bg-gray-100 border-gray-200 text-gray-600"}`}>
                <div className="font-bold text-sm">{String(v.plate_number)}</div>
                <div className="text-xs mt-0.5">{String(v.vehicle_type || "")}</div>
                <div className="text-xs font-medium mt-1">{VEHICLE_STATUS_LABEL[v.status as string] || String(v.status)}</div>
                {v.driver_name && <div className="text-xs mt-0.5 opacity-70">{String(v.driver_name)}</div>}
              </div>
            ))}
          </div>
        </div>
      </Link>

      {/* Recent orders — clickable → reviewer */}
      <Link href="/reviewer">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition-all">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-blue-500" />
              <h3 className="font-semibold text-gray-800">آخر الطلبات</h3>
            </div>
            <span className="text-xs text-blue-500 hover:underline">عرض الكل ←</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["رقم الطلب","العميل","المنتج","الكمية","المجموع","الحالة","التاريخ"].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.recent_orders.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد طلبات بعد</td></tr>
                ) : data.recent_orders.map((o, i) => (
                  <tr key={i} className="hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{String(o.order_number || "")}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{String(o.customer_name || o.customer_phone || "")}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{String(o.product_name || "")}</td>
                    <td className="px-4 py-3 text-gray-700">{String(o.quantity || "")} {String(o.unit || "")}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{Number(o.total_with_vat || 0).toFixed(2)} ريال</td>
                    <td className="px-4 py-3"><StageBadge stage={String(o.stage || "")} /></td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{String(o.created_at || "").slice(0,10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Link>
    </div>
  );
}
