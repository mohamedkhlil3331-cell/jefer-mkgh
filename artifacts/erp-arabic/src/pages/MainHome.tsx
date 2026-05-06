import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  Users, Building2, LayoutDashboard, ClipboardCheck, Truck,
  Package, TrendingUp, ArrowRight, Bell, Star,
} from "lucide-react";
import Catalog from "@/pages/customer/Catalog";
import ReviewerOrders from "@/pages/reviewer/ReviewerOrders";
import SupervisorOrders from "@/pages/supervisor/SupervisorOrders";
import WarehouseOrders from "@/pages/warehouse/WarehouseOrders";
import RepOrders from "@/pages/rep/RepOrders";

interface Stats {
  total: number; pending: number; delivered: number; revenue: number;
  notifications: number; pending_transfers: number;
}

function AdminSummaryCards({ stats }: { stats: Stats }) {
  const cards = [
    { label: "إجمالي الطلبات",    val: stats.total,              icon: Package,       color: "bg-[#103c68] text-white", href: "/reviewer"    },
    { label: "طلبات معلّقة",      val: stats.pending,            icon: ClipboardCheck,color: "bg-amber-500 text-white", href: "/reviewer"    },
    { label: "الإيرادات (ريال)",  val: stats.revenue.toFixed(0), icon: TrendingUp,    color: "bg-green-600 text-white", href: "/dashboard"   },
    { label: "إشعارات جديدة",     val: stats.notifications,      icon: Bell,          color: "bg-red-500 text-white",   href: "/notifications"},
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map(({ label, val, icon: Icon, color, href }) => (
        <Link key={label} href={href}>
          <div className={`${color} rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity shadow-sm`}>
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Icon size={17} className="text-white" />
            </div>
            <div>
              <div className="text-lg font-black leading-none">{typeof val === "string" ? val : val.toLocaleString("ar-SA")}</div>
              <div className="text-xs opacity-80 mt-0.5">{label}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function AdminInternalHome() {
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, delivered: 0, revenue: 0, notifications: 0, pending_transfers: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats/dashboard")
      .then(r => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  const quickLinks = [
    { href: "/dashboard",      icon: LayoutDashboard, label: "لوحة التحكم الرئيسية",  color: "bg-[#103c68]/10 text-[#103c68]"  },
    { href: "/reviewer",       icon: ClipboardCheck,  label: "مراجعة الطلبات",          color: "bg-blue-50 text-blue-700"        },
    { href: "/supervisor",     icon: Truck,           label: "إدارة النقليات",           color: "bg-orange-50 text-orange-700"   },
    { href: "/reports",        icon: TrendingUp,      label: "التقارير والإحصائيات",    color: "bg-emerald-50 text-emerald-700"  },
    { href: "/employees",      icon: Users,           label: "إدارة الموظفين",           color: "bg-purple-50 text-purple-700"   },
    { href: "/notifications",  icon: Bell,            label: "الإشعارات",               color: "bg-red-50 text-red-700"          },
  ];

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
      ))}
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

export default function MainHome() {
  const [tab, setTab] = useState<"customer" | "internal">("customer");

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl w-full sm:w-fit overflow-x-auto">
        <button onClick={() => setTab("customer")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            tab === "customer" ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}>
          <Users size={15} />طلبات العملاء
        </button>
        <button onClick={() => setTab("internal")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            tab === "internal" ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}>
          <Building2 size={15} />داخل الشركة
        </button>
      </div>

      {tab === "customer" ? <Catalog /> : <InternalHome />}
    </div>
  );
}
