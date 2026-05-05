import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Truck, Wallet, Users, CalendarDays,
  ShoppingCart, Car, Wrench, ChevronLeft, Menu, X, Package,
  ClipboardCheck, UserCheck, Bell, LogOut, BookOpen, CreditCard
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const CUSTOMER_NAV = [
  { href: "/", label: "المنتجات", icon: Package },
  { href: "/my-orders", label: "طلباتي", icon: ShoppingCart },
  { href: "/account", label: "حسابي", icon: Wallet },
];

const REVIEWER_NAV = [
  { href: "/reviewer", label: "الطلبات والتحويلات", icon: ClipboardCheck },
];

const SUPERVISOR_NAV = [
  { href: "/supervisor", label: "تخصيص السيارات", icon: Truck },
];

const WAREHOUSE_NAV = [
  { href: "/warehouse", label: "إصدار الفواتير", icon: FileText },
];

const DRIVER_NAV = [
  { href: "/driver", label: "طلباتي", icon: Truck },
];

const REP_NAV = [
  { href: "/rep", label: "طلبات عملائي", icon: Users },
];

const ADMIN_NAV = [
  { href: "/admin", label: "لوحة المدير", icon: LayoutDashboard },
  { href: "/reviewer", label: "المراجعة", icon: ClipboardCheck },
  { href: "/supervisor", label: "النقليات", icon: Truck },
  { href: "/warehouse", label: "المستودع", icon: Package },
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
  customer: CUSTOMER_NAV,
  reviewer: REVIEWER_NAV,
  supervisor: SUPERVISOR_NAV,
  warehouse: WAREHOUSE_NAV,
  driver: DRIVER_NAV,
  rep: REP_NAV,
  admin: ADMIN_NAV,
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
      {/* Logo + user */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${user ? ROLE_COLOR[user.role] : "bg-primary"} flex items-center justify-center shadow`}>
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-foreground truncate">{user?.name || "MKGH"}</div>
            <div className="text-xs text-muted-foreground">{user ? ROLE_LABEL[user.role] : "النظام"}</div>
          </div>
          <button onClick={() => setOpen(false)} className="md:hidden p-1 rounded hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        {user?.company_name && <div className="text-xs text-muted-foreground mt-1.5 truncate">{user.company_name}</div>}
      </div>

      {/* Main nav */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                active ? "bg-primary text-white font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
                <Icon size={18} />
                <span className="text-sm">{label}</span>
                {active && <ChevronLeft size={14} className="mr-auto opacity-70" />}
              </div>
            </Link>
          );
        })}

        {/* Notifications */}
        {user && (
          <Link href="/notifications" onClick={() => setOpen(false)}>
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${location === "/notifications" ? "bg-primary text-white font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <Bell size={18} />
              <span className="text-sm">الإشعارات</span>
              {unread > 0 && <span className="mr-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{unread > 9 ? "9+" : unread}</span>}
            </div>
          </Link>
        )}

        {/* ERP legacy section */}
        {showErp && (
          <>
            <div className="pt-3 pb-1 px-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">نظام ERP</div>
            </div>
            {ERP_NAV.map(({ href, label, icon: Icon }) => {
              const active = location.startsWith(href);
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)}>
                  <div className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}>
                    <Icon size={16} />
                    <span className="text-sm">{label}</span>
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
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-xs text-red-500 hover:text-red-700 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
            <LogOut size={13} />تسجيل الخروج
          </button>
        )}
      </div>
    </nav>
  );

  return (
    <>
      <button
        className="md:hidden fixed top-3 right-3 z-50 p-2 bg-primary text-white rounded-lg shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
      )}

      <aside className={`fixed md:relative inset-y-0 right-0 z-40 w-60 bg-card border-l border-border shadow-sm flex-shrink-0
        flex flex-col transition-transform duration-200
        ${open ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}>
        <SidebarContent />
      </aside>
    </>
  );
}
