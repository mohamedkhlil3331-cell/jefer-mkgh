import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Truck, Wallet, Users, CalendarDays,
  ShoppingCart, Car, Wrench, ChevronDown, Menu, X, Package,
  ClipboardCheck, Bell, LogOut, Database, Home, Warehouse, Sheet, Tag, MapPin,
  ChevronLeft, Globe, Shield, BarChart3,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import { LANGUAGES } from "@/i18n/translations";

type NavItem  = { href: string; labelKey: string; icon: React.ElementType };
type NavGroup = { key: string; labelKey: string; icon: React.ElementType; items: NavItem[] };

const CUSTOMER_NAV: NavItem[] = [
  { href: "/",          labelKey: "navCatalog",  icon: Package },
  { href: "/my-orders", labelKey: "navMyOrders", icon: ShoppingCart },
  { href: "/account",   labelKey: "navAccount",  icon: Wallet },
];
const PORTAL_LINK: NavItem = { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users };

const REVIEWER_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/reviewer",        labelKey: "navReview",         icon: ClipboardCheck },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];
const SUPERVISOR_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/supervisor",      labelKey: "navTransport",      icon: Truck },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];
const WAREHOUSE_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/warehouse",       labelKey: "navInvoice",        icon: FileText },
  { href: "/warehouses",      labelKey: "navWarehouses",     icon: Warehouse },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];
const DRIVER_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/driver",          labelKey: "navMyOrders",       icon: Truck },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];
const REP_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/rep",             labelKey: "navMyOrders",       icon: Users },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];

const ADMIN_GROUPS: NavGroup[] = [
  {
    key: "home", labelKey: "home", icon: Home,
    items: [
      { href: "/dashboard", labelKey: "dashboard",  icon: LayoutDashboard },
      { href: "/",          labelKey: "mainHome",   icon: Home },
    ],
  },
  {
    key: "ops", labelKey: "opsGroup", icon: ClipboardCheck,
    items: [
      { href: "/reviewer",   labelKey: "navReview",    icon: ClipboardCheck },
      { href: "/supervisor", labelKey: "navTransport", icon: Truck },
      { href: "/warehouse",  labelKey: "navInvoice",   icon: FileText },
    ],
  },
  {
    key: "stock", labelKey: "stockGroup", icon: Warehouse,
    items: [
      { href: "/warehouses",     labelKey: "navWarehouses", icon: Warehouse },
      { href: "/products-admin", labelKey: "navProducts",   icon: Tag },
      { href: "/tariffs",        labelKey: "navTariffs",    icon: MapPin },
    ],
  },
  {
    key: "fleet", labelKey: "fleetGroup", icon: Truck,
    items: [
      { href: "/drivers-manage", labelKey: "navDriversMgmt", icon: Users },
    ],
  },
  {
    key: "users", labelKey: "usersGroup", icon: Users,
    items: [
      { href: "/users",           labelKey: "navUsers",         icon: Users },
      { href: "/employees",       labelKey: "navEmployees",     icon: Shield },
      { href: "/hr-requests",     labelKey: "navHRRequests",    icon: CalendarDays },
      { href: "/employee-portal", labelKey: "navEmployeePortal",icon: ChevronLeft },
    ],
  },
  {
    key: "approvals", labelKey: "approvalsGroup", icon: ClipboardCheck,
    items: [
      { href: "/approvals", labelKey: "navApprovals", icon: ClipboardCheck },
    ],
  },
  {
    key: "reports", labelKey: "reportsGroup", icon: BarChart3,
    items: [
      { href: "/reports", labelKey: "navReports", icon: BarChart3 },
    ],
  },
  {
    key: "settings", labelKey: "settingsGroup", icon: Database,
    items: [
      { href: "/sheets", labelKey: "navSheets", icon: Sheet },
      { href: "/admin",  labelKey: "navSystem", icon: Database },
    ],
  },
];

const ERP_NAV = [
  { href: "/erp/invoices",       labelKey: "navLegacyErp", icon: FileText,     label: "الفواتير" },
  { href: "/erp/trips",          labelKey: "",              icon: Truck,        label: "الردود" },
  { href: "/erp/fleet-expenses", labelKey: "",              icon: Wallet,       label: "مصاريف الأسطول" },
  { href: "/erp/petty-cash",     labelKey: "",              icon: Wallet,       label: "العهدة" },
  { href: "/erp/orders",         labelKey: "",              icon: ShoppingCart, label: "الطلبات (ERP)" },
  { href: "/erp/vehicles",       labelKey: "",              icon: Car,          label: "المركبات" },
  { href: "/erp/workshop",       labelKey: "",              icon: Wrench,       label: "الورشة" },
  { href: "/erp/employees",      labelKey: "",              icon: Users,        label: "الموظفون" },
  { href: "/erp/leaves",         labelKey: "",              icon: CalendarDays, label: "طلبات الإجازة" },
];

const EMPLOYEE_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];

const ROLE_NAV: Record<string, NavItem[]> = {
  customer: CUSTOMER_NAV, reviewer: REVIEWER_NAV, supervisor: SUPERVISOR_NAV,
  warehouse: WAREHOUSE_NAV, driver: DRIVER_NAV, rep: REP_NAV, employee: EMPLOYEE_NAV,
};

const ROLE_COLOR: Record<string, string> = {
  customer: "bg-blue-600", reviewer: "bg-indigo-600", supervisor: "bg-orange-600",
  warehouse: "bg-green-600", driver: "bg-yellow-600", rep: "bg-pink-600",
  admin: "bg-purple-600", employee: "bg-teal-600",
};

/* ─── NavLink ─────────────────────────────────────────────────────────────── */
function NavLink({ href, labelKey, icon: Icon, onClose, indent = false }: NavItem & { onClose: () => void; indent?: boolean }) {
  const { t } = useLang();
  const [location] = useLocation();
  const active = href === "/" ? location === "/" : location.startsWith(href);
  return (
    <Link href={href} onClick={onClose}>
      <div className={`flex items-center gap-3 rounded-xl cursor-pointer transition-all
        ${indent ? "px-3 py-2 ms-3" : "px-3 py-2.5"}
        ${active
          ? "bg-blue-600 text-white font-semibold shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}>
        <Icon size={indent ? 14 : 17} />
        <span className={indent ? "text-xs flex-1" : "text-sm flex-1"}>{t(labelKey)}</span>
        {active && !indent && <ChevronLeft size={13} className="opacity-60" />}
      </div>
    </Link>
  );
}

/* ─── CollapsibleGroup ───────────────────────────────────────────────────── */
function CollapsibleGroup({ group, onClose }: { group: NavGroup; onClose: () => void }) {
  const { t } = useLang();
  const [location] = useLocation();
  const hasActive = group.items.some(i => i.href === "/" ? location === "/" : location.startsWith(i.href));
  const [open, setOpen] = useState(hasActive);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium
          ${hasActive ? "text-blue-600" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
        <group.icon size={17} className="flex-shrink-0" />
        <span className="flex-1 text-start">{t(group.labelKey)}</span>
        <ChevronDown size={14} className={`flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 border-s-2 border-blue-100 ms-5">
          {group.items.map(item => (
            <NavLink key={item.href} {...item} onClose={onClose} indent />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Language Picker (compact) ──────────────────────────────────────────── */
function SidebarLangPicker() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const cur = LANGUAGES.find(l => l.code === lang);
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-medium transition-colors">
        <Globe size={12} />
        <span>{cur?.flag}</span>
        <span className="hidden lg:inline">{cur?.label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-1 start-0 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[150px]">
            {LANGUAGES.map(l => (
              <button key={l.code} onClick={() => { setLang(l.code); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-gray-50 transition-colors
                  ${l.code === lang ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700"}`}>
                <span className="text-base">{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Sidebar ─────────────────────────────────────────────────────────────── */
export default function Sidebar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { user, logout } = useAuth();
  const { t, dir } = useLang();

  useEffect(() => {
    if (!user) return;
    const check = () =>
      fetch(`/api/notifications?phone=${user.phone}`)
        .then(r => r.json())
        .then(n => setUnread(Array.isArray(n) ? n.filter((x: Record<string, unknown>) => !x.read).length : 0))
        .catch(() => {});
    check();
    const ti = setInterval(check, 30000);
    return () => clearInterval(ti);
  }, [user]);

  const isAdmin = user?.role === "admin";
  const flatNav = user ? (ROLE_NAV[user.role] ?? []) : [];
  const close   = () => setOpen(false);

  const roleKey = `role${(user?.role || "").charAt(0).toUpperCase() + (user?.role || "").slice(1)}` as string;

  const SidebarContent = () => (
    <nav className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${user ? ROLE_COLOR[user.role] : "bg-blue-600"} flex items-center justify-center shadow-sm flex-shrink-0`}>
            <span className="text-white font-black text-sm">M</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm text-foreground tracking-tight">MKGH</div>
            <div className="text-xs text-muted-foreground truncate">{t("tagline")}</div>
          </div>
          <button onClick={close} className="md:hidden p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        {user && (
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg ${ROLE_COLOR[user.role]} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white font-bold text-xs">{user.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground">{t(roleKey)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {isAdmin ? (
          ADMIN_GROUPS.map(group => <CollapsibleGroup key={group.key} group={group} onClose={close} />)
        ) : (
          flatNav.map(item => <NavLink key={item.href} {...item} onClose={close} />)
        )}

        {/* Notifications */}
        {user && (
          <Link href="/notifications" onClick={close}>
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all
              ${location === "/notifications" ? "bg-blue-600 text-white font-semibold shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <Bell size={17} />
              <span className="text-sm flex-1">{t("navNotifications")}</span>
              {unread > 0 && <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{unread > 9 ? "9+" : unread}</span>}
            </div>
          </Link>
        )}

        {/* ERP legacy */}
        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t("navLegacyErp")}</div>
            </div>
            {ERP_NAV.map(({ href, icon: Icon, label }) => {
              const active = location.startsWith(href);
              return (
                <Link key={href} href={href} onClick={close}>
                  <div className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all
                    ${active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
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
      <div className="px-4 py-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString(dir === "rtl" ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric" })}
          </div>
          <SidebarLangPicker />
        </div>
        {user && (
          <button onClick={logout}
            className="w-full flex items-center justify-center gap-2 text-xs text-red-500 hover:text-red-700 py-1.5 rounded-xl hover:bg-red-50 transition-colors">
            <LogOut size={13} />{t("logout")}
          </button>
        )}
      </div>
    </nav>
  );

  return (
    <>
      <button
        className="md:hidden fixed top-3 end-3 z-50 p-2 bg-blue-600 text-white rounded-xl shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Menu size={20} />
      </button>
      {open && <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={close} />}
      <aside className={`fixed md:relative inset-y-0 ${dir === "rtl" ? "right-0" : "left-0"} z-40 w-60 bg-card border-s border-border shadow-sm flex-shrink-0
        flex flex-col transition-transform duration-200
        ${open ? "translate-x-0" : `${dir === "rtl" ? "translate-x-full" : "-translate-x-full"} md:translate-x-0`}`}>
        <SidebarContent />
      </aside>
    </>
  );
}
