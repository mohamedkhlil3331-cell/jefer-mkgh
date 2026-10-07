import { useEffect, useState, useMemo } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import {
  BarChart3, TrendingUp, DollarSign, ShoppingCart, Users, Package,
  RefreshCw, Download, FileText, CheckCircle, Clock, Truck,
  ArrowUpRight, ArrowDownRight, Calendar, Filter,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string;
  total_before_vat: number; vat_amount: number; total_with_vat: number;
  stage: string; created_at: string; delivery_date: string;
  rep_id: number; driver_name: string; vehicle_plate: string;
  invoice_number: string; destination_type: string; delivery_location: string;
}

const STAGE_AR: Record<string, string> = {
  pending: "معلق", payment_confirmed: "مؤكد", vehicle_assigned: "سيارة معيّنة",
  invoiced: "فاتورة", loaded: "محمّل", delivered: "مُسلَّم", cancelled: "ملغي",
};
const PIE_COLORS = ["#103c68","#0eb5cb","#10B981","#F59E0B","#EF4444","#8B5CF6","#6B7280"];

function fmt(n: number) { return n.toLocaleString("ar-SA", { maximumFractionDigits: 0 }); }
function fmtSAR(n: number) { return `${n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`; }

export default function ReportsPage() {
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useRememberedState<"overview" | "products" | "customers" | "pipeline">("admin-reports-active-tab", "overview");
  const [dateFilter, setDateFilter] = useRememberedState<"all" | "month" | "week">("admin-reports-date-filter", "month");

  const load = () => {
    setLoading(true);
    fetch("/api/workflow/orders")
      .then(r => r.json())
      .then(d => setOrders(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (dateFilter === "all") return orders;
    const now = Date.now();
    const cutoff = dateFilter === "month" ? 30 * 86400000 : 7 * 86400000;
    return orders.filter(o => now - new Date(o.created_at).getTime() <= cutoff);
  }, [orders, dateFilter]);

  /* ── KPIs ── */
  const delivered    = filtered.filter(o => o.stage === "delivered");
  const cancelled    = filtered.filter(o => o.stage === "cancelled");
  const active       = filtered.filter(o => !["delivered","cancelled"].includes(o.stage));
  const totalRevenue = delivered.reduce((s, o) => s + (o.total_with_vat || 0), 0);
  const totalVat     = delivered.reduce((s, o) => s + (o.vat_amount    || 0), 0);
  const totalPre     = delivered.reduce((s, o) => s + (o.total_before_vat || 0), 0);
  const avgOrder     = delivered.length > 0 ? totalRevenue / delivered.length : 0;

  /* ── Monthly data ── */
  const monthlyData = useMemo(() => {
    const map: Record<string, { orders: number; revenue: number; month: string }> = {};
    orders.forEach(o => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("ar-SA", { month: "short", year: "2-digit" });
      if (!map[key]) map[key] = { orders: 0, revenue: 0, month: label };
      map[key].orders++;
      if (o.stage === "delivered") map[key].revenue += o.total_with_vat || 0;
    });
    return Object.keys(map).sort().slice(-12).map(k => map[k]);
  }, [orders]);

  /* ── By product ── */
  const productData = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number; orders: number }> = {};
    filtered.filter(o => o.stage === "delivered").forEach(o => {
      if (!map[o.product_name]) map[o.product_name] = { qty: 0, revenue: 0, orders: 0 };
      map[o.product_name].qty     += o.quantity || 0;
      map[o.product_name].revenue += o.total_with_vat || 0;
      map[o.product_name].orders++;
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  /* ── By customer ── */
  const customerData = useMemo(() => {
    const map: Record<string, { orders: number; revenue: number; phone: string }> = {};
    filtered.forEach(o => {
      const key = o.customer_name || o.customer_phone;
      if (!map[key]) map[key] = { orders: 0, revenue: 0, phone: o.customer_phone };
      map[key].orders++;
      if (o.stage === "delivered") map[key].revenue += o.total_with_vat || 0;
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  /* ── Stage distribution ── */
  const stageData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(o => { map[o.stage] = (map[o.stage] || 0) + 1; });
    return Object.entries(map).map(([stage, value]) => ({ name: STAGE_AR[stage] ?? stage, value, stage }));
  }, [filtered]);

  /* ── CSV export ── */
  const exportCSV = () => {
    const header = "رقم الطلب,العميل,المنتج,الكمية,الوحدة,قبل الضريبة,الضريبة,الإجمالي,الحالة,التاريخ";
    const rows = filtered.map(o =>
      [o.order_number, o.customer_name || o.customer_phone, o.product_name,
       o.quantity, o.unit, o.total_before_vat?.toFixed(2), o.vat_amount?.toFixed(2),
       o.total_with_vat?.toFixed(2), STAGE_AR[o.stage] ?? o.stage,
       new Date(o.created_at).toLocaleDateString("ar-SA")].join(",")
    ).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + header + "\n" + rows], { type: "text/csv;charset=utf-8" }));
    a.download = `mkgh-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={22} className="animate-spin text-[#103c68]" />
    </div>
  );

  return (
    <div dir="rtl" className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <BarChart3 size={24} className="text-[#103c68]" />التقارير والإحصائيات
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">تحليل شامل لأداء المبيعات والعمليات</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date filter */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {([["all","الكل"],["month","30 يوم"],["week","7 أيام"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setDateFilter(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dateFilter === k ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500"}`}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-600 hover:text-gray-800 rounded-xl text-sm font-semibold shadow-sm transition-colors">
            <Download size={14} />تصدير CSV
          </button>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl text-sm transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 flex-wrap bg-gray-100 p-1.5 rounded-2xl w-fit">
        {([
          { id: "overview",  label: "نظرة عامة",   icon: BarChart3 },
          { id: "products",  label: "المنتجات",     icon: Package },
          { id: "customers", label: "العملاء",      icon: Users },
          { id: "pipeline",  label: "مسار الطلبات", icon: Filter },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {/* ══════════ OVERVIEW ══════════ */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* KPI row 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "إجمالي الإيرادات", val: fmtSAR(totalRevenue), sub: `من ${delivered.length} طلب مُسلَّم`, icon: DollarSign, color: "bg-green-500", trend: "up" },
              { label: "إجمالي الطلبات",   val: fmt(filtered.length), sub: `${active.length} نشط حالياً`,    icon: ShoppingCart, color: "bg-[#103c68]", trend: null },
              { label: "متوسط قيمة الطلب", val: fmtSAR(avgOrder),     sub: "للطلبات المُسلَّمة",              icon: TrendingUp,   color: "bg-[#0eb5cb]", trend: "up" },
              { label: "ضريبة القيمة المضافة", val: fmtSAR(totalVat), sub: "15% من المبيعات",               icon: FileText,     color: "bg-purple-500", trend: null },
            ].map(({ label, val, sub, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`${color} w-10 h-10 rounded-xl flex items-center justify-center`}>
                    <Icon size={18} className="text-white" />
                  </div>
                </div>
                <div className="text-xl font-black text-gray-900 leading-tight">{val}</div>
                <div className="text-xs text-gray-400 mt-1">{label}</div>
                <div className="text-xs text-gray-300 mt-0.5">{sub}</div>
              </div>
            ))}
          </div>

          {/* VAT breakdown */}
          <div className="bg-gradient-to-l from-[#103c68] to-[#1a5899] rounded-2xl p-5 text-white">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="opacity-70" />
              <span className="font-bold text-lg">ملخص ضريبة القيمة المضافة</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/10 rounded-xl p-4 text-center">
                <div className="text-2xl font-black">{fmtSAR(totalPre)}</div>
                <div className="text-xs opacity-70 mt-1">الإيرادات قبل الضريبة</div>
              </div>
              <div className="bg-white/10 rounded-xl p-4 text-center">
                <div className="text-2xl font-black">{fmtSAR(totalVat)}</div>
                <div className="text-xs opacity-70 mt-1">الضريبة المحصّلة (15%)</div>
              </div>
              <div className="bg-white/20 rounded-xl p-4 text-center border border-white/20">
                <div className="text-2xl font-black">{fmtSAR(totalRevenue)}</div>
                <div className="text-xs opacity-70 mt-1">الإجمالي شامل الضريبة</div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Monthly orders */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">الطلبات الشهرية</h3>
                <ShoppingCart size={16} className="text-[#103c68]" />
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{ right: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <Tooltip formatter={(v) => [v, "طلبات"]} />
                  <Bar dataKey="orders" fill="#103c68" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly revenue */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">منحنى الإيرادات الشهرية</h3>
                <TrendingUp size={16} className="text-green-500" />
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monthlyData} margin={{ right: 5, left: -10 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#0eb5cb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0eb5cb" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [fmtSAR(v), "الإيرادات"]} />
                  <Area dataKey="revenue" stroke="#0eb5cb" fill="url(#revGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Stage pie */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">توزيع حالات الطلبات</h3>
              <div className="text-xs text-gray-400">{filtered.length} طلب إجمالاً</div>
            </div>
            {stageData.length === 0 ? (
              <div className="text-center py-8 text-gray-400">لا توجد بيانات</div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="45%" height={200}>
                  <PieChart>
                    <Pie data={stageData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                         dataKey="value" paddingAngle={3}>
                      {stageData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [v, "طلبات"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {stageData.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-gray-600">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800">{s.value}</span>
                        <span className="text-xs text-gray-400">({filtered.length > 0 ? Math.round((s.value / filtered.length) * 100) : 0}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ PRODUCTS ══════════ */}
      {tab === "products" && (
        <div className="space-y-5">
          {productData.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 text-gray-400">
              لا توجد مبيعات مُسلَّمة في الفترة المحددة
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">أداء المنتجات (مُسلَّم فقط)</h3>
                  <Package size={16} className="text-[#103c68]" />
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={productData.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#374151" }} width={120} />
                    <Tooltip formatter={(v: number, n) => [n === "revenue" ? fmtSAR(v) : v, n === "revenue" ? "الإيرادات" : "الكمية"]} />
                    <Bar dataKey="revenue" fill="#103c68" radius={[0, 4, 4, 0]} name="revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="grid grid-cols-12 px-5 py-3 bg-gray-50 text-xs font-bold text-gray-500">
                  <span className="col-span-1">#</span>
                  <span className="col-span-4">المنتج</span>
                  <span className="col-span-2 text-center">الطلبات</span>
                  <span className="col-span-3 text-center">الإيرادات</span>
                  <span className="col-span-2 text-center">الحصة</span>
                </div>
                {productData.map((p, i) => (
                  <div key={p.name} className="grid grid-cols-12 px-5 py-3.5 border-t border-gray-50 items-center text-sm">
                    <span className="col-span-1 text-gray-400 font-bold">{i + 1}</span>
                    <div className="col-span-4">
                      <div className="font-semibold text-gray-800 truncate">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.qty.toLocaleString("ar-SA")} وحدة</div>
                    </div>
                    <div className="col-span-2 text-center font-semibold text-gray-700">{p.orders}</div>
                    <div className="col-span-3 text-center font-black text-[#103c68]">{fmtSAR(p.revenue)}</div>
                    <div className="col-span-2 text-center">
                      <div className="text-xs text-gray-500">{totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 100) : 0}%</div>
                      <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-[#103c68] rounded-full"
                             style={{ width: `${totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════ CUSTOMERS ══════════ */}
      {tab === "customers" && (
        <div className="space-y-5">
          {customerData.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 text-gray-400">لا توجد بيانات</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="text-2xl font-black text-gray-900">{customerData.length}</div>
                  <div className="text-sm text-gray-400 mt-1">عميل نشط في الفترة</div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="text-2xl font-black text-[#103c68]">{fmtSAR(customerData[0]?.revenue || 0)}</div>
                  <div className="text-sm text-gray-400 mt-1">أعلى إيرادات عميل</div>
                  <div className="text-xs text-gray-300 mt-0.5">{customerData[0]?.name}</div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="text-2xl font-black text-gray-900">
                    {customerData.reduce((s, c) => s + c.orders, 0)}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">إجمالي الطلبات</div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50">
                  <h3 className="font-bold text-gray-800">أفضل العملاء حسب الإيرادات</h3>
                </div>
                <div className="grid grid-cols-12 px-5 py-3 bg-gray-50 text-xs font-bold text-gray-500">
                  <span className="col-span-1">#</span>
                  <span className="col-span-4">العميل</span>
                  <span className="col-span-2 text-center">الطلبات</span>
                  <span className="col-span-3 text-center">الإيرادات</span>
                  <span className="col-span-2 text-center">الحصة</span>
                </div>
                {customerData.map((c, i) => (
                  <div key={c.name} className="grid grid-cols-12 px-5 py-3.5 border-t border-gray-50 items-center text-sm">
                    <span className={`col-span-1 font-black ${i < 3 ? "text-[#103c68]" : "text-gray-400"}`}>{i + 1}</span>
                    <div className="col-span-4">
                      <div className="font-semibold text-gray-800 truncate">{c.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{c.phone}</div>
                    </div>
                    <div className="col-span-2 text-center font-semibold text-gray-700">{c.orders}</div>
                    <div className="col-span-3 text-center font-black text-[#103c68]">{fmtSAR(c.revenue)}</div>
                    <div className="col-span-2 text-center">
                      <div className="text-xs text-gray-500">{totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 100) : 0}%</div>
                      <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-[#0eb5cb] rounded-full"
                             style={{ width: `${totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════ PIPELINE ══════════ */}
      {tab === "pipeline" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "معلق", stage: "pending",          color: "bg-amber-500",  icon: Clock },
              { label: "مؤكد", stage: "payment_confirmed", color: "bg-green-500",  icon: CheckCircle },
              { label: "في الطريق", stage: "loaded",      color: "bg-cyan-500",   icon: Truck },
              { label: "مُسلَّم", stage: "delivered",      color: "bg-[#103c68]", icon: Package },
            ].map(({ label, stage, color, icon: Icon }) => {
              const count = filtered.filter(o => o.stage === stage).length;
              const total = filtered.filter(o => o.stage === stage).reduce((s, o) => s + (o.total_with_vat || 0), 0);
              return (
                <div key={stage} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className={`${color} w-10 h-10 rounded-xl flex items-center justify-center mb-3`}>
                    <Icon size={18} className="text-white" />
                  </div>
                  <div className="text-2xl font-black text-gray-900">{count}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                  {total > 0 && <div className="text-xs text-[#103c68] font-semibold mt-1">{fmtSAR(total)}</div>}
                </div>
              );
            })}
          </div>

          {/* Order pipeline table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">قائمة الطلبات الكاملة ({filtered.length})</h3>
              <span className="text-xs text-gray-400">مرتب بالأحدث</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    {["الرقم","العميل","المنتج","الكمية","الإجمالي","الحالة","التاريخ"].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-bold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.slice().reverse().map(o => (
                    <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[#103c68] whitespace-nowrap font-bold">{o.order_number}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{o.customer_name || o.customer_phone}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap max-w-32 truncate">{o.product_name}</td>
                      <td className="px-4 py-3 text-gray-600">{o.quantity} {o.unit}</td>
                      <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{o.total_with_vat?.toFixed(2)} ر.س</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          o.stage === "delivered"  ? "bg-green-50 text-green-700 border-green-200" :
                          o.stage === "cancelled"  ? "bg-red-50 text-red-700 border-red-200" :
                          o.stage === "pending"    ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>{STAGE_AR[o.stage] ?? o.stage}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(o.created_at).toLocaleDateString("ar-SA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
