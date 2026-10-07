import { useEffect, useRef, useState } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { Link } from "wouter";
import { canAccess, useAuth } from "@/context/AuthContext";
import {
  Users, Building2, ClipboardCheck, Truck,
  Package, TrendingUp, ArrowRight, Bell, Star, Layers,
  Factory,
} from "lucide-react";
import type { BranchDashboardBranch } from "@workspace/api-client-react";
import BranchDashboard from "@/pages/admin/BranchDashboard";
import Catalog from "@/pages/customer/Catalog";
import ReviewerOrders from "@/pages/reviewer/ReviewerOrders";
import SupervisorOrders from "@/pages/supervisor/SupervisorOrders";
import WarehouseOrders from "@/pages/warehouse/WarehouseOrders";
import RepOrders from "@/pages/rep/RepOrders";

interface Stats {
  total: number; pending: number; delivered: number; revenue: number;
  notifications: number; pending_transfers: number;
}

/* ─── Admin summary ──────────────────────────────────────────────────────────  */
function AdminSummaryCards({ stats }: { stats: Stats }) {
  const cards = [
    { label: "إجمالي الطلبات",    val: stats.total,                    icon: Package,        color: "bg-[#103c68] text-white", href: "/reviewer"     },
    { label: "طلبات معلّقة",      val: stats.pending,                   icon: ClipboardCheck, color: "bg-amber-500 text-white", href: "/reviewer"     },
    { label: "الإيرادات (ريال)",  val: (stats.revenue ?? 0).toFixed(0), icon: TrendingUp,     color: "bg-green-600 text-white" },
    { label: "إشعارات جديدة",     val: stats.notifications,             icon: Bell,           color: "bg-red-500 text-white",   href: "/notifications" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map(({ label, val, icon: Icon, color, href }) => {
        const card = (
          <div className={`${color} rounded-2xl p-4 flex items-center gap-3 ${href ? "cursor-pointer hover:opacity-90" : ""} transition-opacity shadow-sm`}>
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Icon size={17} className="text-white" />
            </div>
            <div>
              <div className="text-lg font-black leading-none">{typeof val === "string" ? val : (val ?? 0).toLocaleString("ar-SA")}</div>
              <div className="text-xs opacity-80 mt-0.5">{label}</div>
            </div>
          </div>
        );
        return href ? <Link key={label} href={href}>{card}</Link> : <div key={label}>{card}</div>;
      })}
    </div>
  );
}

function AdminInternalHome() {
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, delivered: 0, revenue: 0, notifications: 0, pending_transfers: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats/dashboard")
      .then(r => r.json())
      .then((data: { kpi?: Record<string, number> }) => {
        const kpi = data.kpi ?? {};
        setStats({
          total: kpi.total_orders ?? 0,
          pending: kpi.pending_orders ?? 0,
          delivered: kpi.delivered_orders ?? 0,
          revenue: kpi.revenue ?? 0,
          notifications: kpi.notifications ?? 0,
          pending_transfers: kpi.pending_transfers ?? 0,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const quickLinks = [
    { href: "/reviewer",      icon: ClipboardCheck,  label: "مراجعة الطلبات",         color: "bg-blue-50 text-blue-700"       },
    { href: "/supervisor",    icon: Truck,           label: "إدارة النقليات",          color: "bg-orange-50 text-orange-700"  },
    { href: "/reports",       icon: TrendingUp,      label: "التقارير والإحصائيات",   color: "bg-emerald-50 text-emerald-700" },
    { href: "/employees",     icon: Users,           label: "إدارة الموظفين",          color: "bg-purple-50 text-purple-700"  },
    { href: "/notifications", icon: Bell,            label: "الإشعارات",              color: "bg-red-50 text-red-700"         },
  ];

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-5">
      <AdminSummaryCards stats={stats} />
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Star size={16} className="text-amber-500" />وصول سريع للإدارة
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickLinks.map(({ href, icon: Icon, label, color }) => (
            <Link key={href} href={href}>
              <button className="w-full flex items-center gap-2.5 p-3.5 rounded-xl hover:bg-gray-50 border border-gray-100 hover:border-[#103c68]/20 transition-all group text-start">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color} flex-shrink-0 group-hover:scale-105 transition-transform`}>
                  <Icon size={16} />
                </div>
                <span className="text-xs font-semibold text-gray-700 leading-tight">{label}</span>
                <ArrowRight size={12} className="text-gray-300 mr-auto group-hover:text-[#103c68] transition-colors" />
              </button>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function InternalHome() {
  const { user } = useAuth();
  if (user?.role === "reviewer")  return <ReviewerOrders />;
  if (user?.role === "supervisor") return <SupervisorOrders />;
  if (user?.role === "warehouse")  return <WarehouseOrders />;
  if (user?.role === "rep")        return <RepOrders />;
  if (user?.role === "admin")      return <AdminInternalHome />;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
      <Building2 size={40} className="mx-auto text-gray-200 mb-3" />
      <p className="text-gray-400 text-sm">سجّل دخولك بحساب دور محدد لرؤية مهامك</p>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────────  */
type TabKey = "customer" | "internal" | "branch_all" | `branch_${number}`;

export default function MainHome() {
  const [tab, setTab] = useRememberedState("main-home-tab", "customer" as TabKey);
  const [branches, setBranches] = useState<BranchDashboardBranch[]>([]);
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";
  const canViewDashboard = canAccess(user, "home_dashboard");
  const previouslyHadDashboardAccess = useRef(false);

  useEffect(() => {
    if (canViewDashboard && !previouslyHadDashboardAccess.current) setTab("branch_all");
    if (!canViewDashboard && previouslyHadDashboardAccess.current) setTab("customer");
    previouslyHadDashboardAccess.current = canViewDashboard;
  }, [canViewDashboard, setTab]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/company-settings")
      .then(r => r.json())
      .then((data: BranchDashboardBranch[]) => {
        if (Array.isArray(data)) setBranches(data.filter(b => b.entity_name?.trim()));
      })
      .catch(() => {});
  }, [isAdmin]);

  const activeBranchId = tab === "branch_all"
    ? null
    : tab.startsWith("branch_")
      ? Number(tab.replace("branch_", ""))
      : null;
  const activeBranch = activeBranchId === null
    ? null
    : branches.find(b => b.id === activeBranchId) ?? null;

  const isBranchTab = tab === "branch_all" || tab.startsWith("branch_");

  const tabBtn = (key: TabKey, label: string, Icon: React.ElementType) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
        tab === key ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      <Icon size={13} />{label}
    </button>
  );

  return (
    <div className="space-y-5" dir="rtl">

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 bg-gray-100 p-1.5 rounded-2xl w-full overflow-x-auto">

        {/* Branch tabs — right side (first in RTL DOM) */}
        {canViewDashboard && (
          <>
            {tabBtn("branch_all", "شامل", Layers)}
            {isAdmin && branches.map(b =>
              tabBtn(`branch_${b.id}` as TabKey, b.entity_name.trim(), Factory)
            )}

            {/* Divider */}
            <div className="w-px h-5 bg-gray-300 flex-shrink-0 mx-1" />
          </>
        )}

        {/* Main tabs */}
        {tabBtn("customer", "طلبات العملاء", Users)}
        {tabBtn("internal", "داخل الشركة",  Building2)}
      </div>

      {/* ── Content ── */}
      {isBranchTab
        ? <BranchDashboard branchId={activeBranchId} branchName={activeBranch?.entity_name} token={token} />
        : tab === "customer"
          ? <Catalog />
          : <InternalHome />
      }
    </div>
  );
}
