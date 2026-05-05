import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Truck, Wallet, Users, CalendarDays,
  ShoppingCart, Car, Wrench, ChevronLeft, Menu, X, Package,
  ClipboardCheck, Bell, LogOut, Database, Home, Warehouse, Sheet, Tag, MapPin
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const CUSTOMER_NAV = [
  { href: "/", label: "المنتجات", icon: Package },
  { href: "/my-orders", label: "طلباتي", icon: ShoppingCart },
  { href: "/account", label: "حسابي", icon: Wallet },
];

const REVIEWER_NAV = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/reviewer", label: "الطلبات والتحويلات", icon: ClipboardCheck },
];

const SUPERVISOR_NAV = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/supervisor", label: "تخصيص السيارات", icon: Truck },
];

const WAREHOUSE_NAV = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/warehouse", label: "إصدار الفواتير", icon: FileText },
  { href: "/warehouses", label: "المستودعات", icon: Warehouse },
];

const DRIVER_NAV = [
  { href: "/driver", label: "طلباتي", icon: Truck },
];

const REP_NAV = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/rep", label: "طلبات عملائي", icon: Users },
];

const ADMIN_NAV = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/", label: "الرئيسية (تبويب)", icon: Home },
  { href: "/products-admin", label: "الأسعار والمنتجات", icon: Tag },
  { href: "/reviewer", label: "المراجعة", icon: ClipboardCheck },
  { href: "/supervisor", label: "النقليات", icon: Truck },
  { href: "/warehouse", label: "إصدار الفواتير", icon: FileText },
  { href: "/warehouses", label: "المستودعات", icon: Warehouse },
  { href: "/employees", label: "الموظفون", icon: Users },
  { href: "/tariffs", label: "التعريفة", icon: MapPin },
  { href: "/drivers-manage", label: "إدارة السائقين", icon: Truck },
  { href: "/sheets", label: "جوجل شيت", icon: Sheet },
  { href: "/admin", label: "إدارة النظام", icon: Database },
];

const ERP_NAV = [
  { href: "/erp/invoices", label: "الفواتير", icon: FileText },
  { href: "/erp/trips", label: "الردود", icon: Truck },
  { href: "/erp/fleet-expenses", label: "مصاريف الأسطول", icon: Wallet },
  { href: "/erp/petty-cash", label: "العهدة", icon: Wallet },
  { href: "/erp/orders", label: "الطلبات (ERP)", icon: ShoppingCart },
  { href: "/erp/vehicles", label: "المركبات", icon: Car },
  { href: "/erp/workshop", label: "الورشة", icon: Wrench },
  { href: "/erp/employees", label: "الموظفون", icon: Users },
  { href: "/erp/leaves", label: "طلبات الإجازة", icon: CalendarDays },
];

const ROLE_NAV: Record<string, typeof CUSTOMER_NAV> = {
  customer: CUSTOMER_NAV, reviewer: REVIEWER_NAV, supervisor: SUPERVISOR_NAV,
  warehouse: WAREHOUSE_NAV, driver: DRIVER_NAV, rep: REP_NAV, admin: ADMIN_NAV,
};

const ROLE_LABEL: Record<string, string> = {
  customer: "عميل", reviewer: "مراجع", supervisor: "مشرف النقليات",
  warehouse: "مستودع", driver: "سائق", rep: "مندوب", admin: "مدير",
};

const ROLE_COLOR: Record<string, string> = {
  customer: "bg-blue-600", reviewer: "bg-indigo-600", supervisor: "bg-orange-600",
  warehouse: "bg-green-600", driver: "bg-yellow-600", rep: "bg-pink-600", admin: "bg-purple-600",
};

export default function Sidebar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { user, logout } = useAuth();

  useEffect(() => {
    if (!user) return;
    const check = () =>
      fetch(`/api/notifications?phone=${user.phone}`)
        .then(r => r.json())
        .then(n => setUnread(Array.isArray(n) ? n.filter((x: Record<string, unknown>) => !x.read).length : 0))
        .catch(() => {});
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [user]);

  const nav = user ? (ROLE_NAV[user.role] ?? []) : [];
  const showErp = user?.role === "admin";

  const SidebarContent = () => (
    <nav className="flex flex-col h-full">
      {/* Brand header */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${user ? ROLE_COLOR[user.role] : "bg-blue-600"} flex items-center justify-center shadow-sm flex-shrink-0`}>
            <span className="text-white font-black text-sm">M</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm text-foreground tracking-tight">MKGH</div>
            <div className="text-xs text-muted-foreground truncate">نظام أتمتة بيانات الشركات</div>
          </div>
          <button onClick={() => setOpen(false)} className="md:hidden p-1 rounded hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        {user && (
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg ${ROLE_COLOR[user.role]} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white font-bold text-xs">{user.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</div>
            </div>
          </div>
        )}
      </div>

      {/* Main nav */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                active
                  ? "bg-blue-600 text-white font-semibold shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
                <Icon size={17} />
                <span className="text-sm flex-1">{label}</span>
                {active && <ChevronLeft size={13} className="opacity-60" />}
              </div>
            </Link>
          );
        })}

        {/* Notifications */}
        {user && (
          <Link href="/notifications" onClick={() => setOpen(false)}>
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${location === "/notifications" ? "bg-blue-600 text-white font-semibold shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <Bell size={17} />
              <span className="text-sm flex-1">الإشعارات</span>
              {unread > 0 && <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{unread > 9 ? "9+" : unread}</span>}
            </div>
          </Link>
        )}

        {/* ERP legacy section */}
        {showErp && (
          <>
            <div className="pt-4 pb-1 px-3">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">نظام ERP القديم</div>
            </div>
            {ERP_NAV.map(({ href, label, icon: Icon }) => {
              const active = location.startsWith(href);
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)}>
                  <div className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all ${
                    active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}>
                    <Icon size={15} />
                    <span className="text-xs">{label}</span>
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <div className="text-xs text-muted-foreground text-center mb-2">
          {new Date().toLocaleDateString("ar-SA", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
        </div>
        {user && (
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-xs text-red-500 hover:text-red-700 py-1.5 rounded-xl hover:bg-red-50 transition-colors">
            <LogOut size={13} />تسجيل الخروج
          </button>
        )}
      </div>
    </nav>
  );

  return (
    <>
      <button
        className="md:hidden fixed top-3 right-3 z-50 p-2 bg-blue-600 text-white rounded-xl shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Menu size={20} />
      </button>

      {open && <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />}

      <aside className={`fixed md:relative inset-y-0 right-0 z-40 w-60 bg-card border-l border-border shadow-sm flex-shrink-0
        flex flex-col transition-transform duration-200
        ${open ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}>
        <SidebarContent />
      </aside>
    </>
  );
}
