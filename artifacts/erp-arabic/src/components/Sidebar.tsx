import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Truck, Wallet, Users, CalendarDays,
  ShoppingCart, Car, Wrench, ChevronDown, Menu, X, Package,
  ClipboardCheck, Bell, LogOut, Database, Home, Warehouse, Sheet, Tag, MapPin,
  ChevronLeft, Globe, Shield, BarChart3, ShoppingBag, DollarSign, Building2,
  Scale, ScrollText, Star, Target, HardHat, CheckCircle, Boxes, Search, FileSpreadsheet, BookOpen,
  ALargeSmall,
  MessagesSquare,
} from "lucide-react";
import { ThemeToggleBar, ThemeToggleCycle } from "@/components/ThemeToggle";
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import { useCart } from "@/context/CartContext";
import { LANGUAGES } from "@/i18n/translations";
import { useFontScale } from "@/hooks/useFontScale";

type NavItem  = { href: string; labelKey: string; icon: React.ElementType; badge?: number };
type NavGroup = { key: string; labelKey: string; icon: React.ElementType; items: NavItem[] };

const CUSTOMER_NAV: NavItem[] = [
  { href: "/",                 labelKey: "navCatalog",  icon: Package },
  { href: "/my-orders",        labelKey: "navMyOrders", icon: ShoppingCart },
  { href: "/external-rentals", labelKey: "navRentals",  icon: Truck },
  { href: "/profile",          labelKey: "navProfile",  icon: Users },
  { href: "/account",          labelKey: "navAccount",  icon: Wallet },
];
const PORTAL_LINK: NavItem = { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users };
const CHAT_LINK: NavItem = { href: "/chat", labelKey: "navChat", icon: MessagesSquare };

const REVIEWER_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/reviewer",        labelKey: "navReview",         icon: ClipboardCheck },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];
const SUPERVISOR_NAV: NavItem[] = [
  { href: "/employee-portal",      labelKey: "navEmployeePortal", icon: Users },
  { href: "/supervisor",           labelKey: "navTransport",      icon: Truck },
  { href: "/drivers-manage",       labelKey: "navDriversMgmt",    icon: Car },
  { href: "/driver-doc-requests",  labelKey: "navDocRequests",    icon: FileText },
  { href: "/notifications",        labelKey: "navNotifications",  icon: Bell },
];
const WAREHOUSE_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/warehouse",       labelKey: "navInvoice",        icon: FileText },
  { href: "/warehouses",      labelKey: "navWarehouses",     icon: Warehouse },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];
const DRIVER_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/",                labelKey: "mainHome",          icon: Truck },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];
const BULKER_DRIVER_NAV: NavItem[] = [
  { href: "/bulker-driver",   labelKey: "navLoadingOrders",  icon: Truck },
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
      { href: "/",          labelKey: "mainHome",   icon: Home },
      CHAT_LINK,
      { href: "/admin",     labelKey: "navSystem",  icon: Database },
    ],
  },
  {
    key: "ops", labelKey: "opsGroup", icon: ClipboardCheck,
    items: [
      { href: "/reviewer",             labelKey: "navReview",          icon: ClipboardCheck },
      { href: "/warehouse",            labelKey: "navInvoice",         icon: FileText },
      { href: "/bulker-supervisor",    labelKey: "navBulkerSupervisor",icon: Truck },
      { href: "/crane-supervisor",     labelKey: "navCraneSupervisor", icon: Truck },
      { href: "/fsohat",               labelKey: "navFsohat",          icon: CheckCircle },
      { href: "/driver-doc-requests",  labelKey: "navDocRequests",     icon: FileText },
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
      { href: "/transportation",        labelKey: "navTransportationDept", icon: Truck },
      { href: "/trips",                 labelKey: "navTrips",              icon: BarChart3 },
      { href: "/supervisor",            labelKey: "navFleetManage",        icon: Shield },
      { href: "/drivers-manage",        labelKey: "navDriversMgmt",        icon: Users },
      { href: "/workshop-manager",      labelKey: "navWorkshopMgr",         icon: Wrench },
      { href: "/workshop-inventory",  labelKey: "navWorkshopInventory",  icon: Boxes },
      { href: "/purchasing",          labelKey: "navPurchasing",          icon: ShoppingBag },
      { href: "/mkgh-analysis",       labelKey: "navMkghAnalysis",        icon: BarChart3 },
      { href: "/vehicle-analytics",   labelKey: "navVehicleAnalytics",  icon: BarChart3 },
      { href: "/vehicle-types-admin", labelKey: "navVehicleTypeDefs",   icon: Package },
    ],
  },
  {
    key: "users", labelKey: "usersGroup", icon: Users,
    items: [
      { href: "/users",           labelKey: "navUsers",         icon: Users },
      { href: "/employees",       labelKey: "navEmployees",     icon: Shield },
      { href: "/hr-requests",     labelKey: "navHRRequests",    icon: CalendarDays },
      { href: "/employee-portal", labelKey: "navEmployeePortal",icon: ChevronLeft },
      { href: "/rep-targets",     labelKey: "navRepTargets",    icon: Target },
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
    key: "finance", labelKey: "financeGroup", icon: DollarSign,
    items: [
      { href: "/finance",  labelKey: "navFinance",  icon: DollarSign },
      { href: "/tariffs",  labelKey: "navTariffs",  icon: MapPin },
    ],
  },
  {
    key: "legal", labelKey: "legalGroup", icon: Scale,
    items: [
      { href: "/legal",             labelKey: "navLegal",           icon: Scale },
      { href: "/system-logs",       labelKey: "navSystemLogs",      icon: ScrollText },
      { href: "/ratings-analytics", labelKey: "navRatingsAnalytics",icon: Star },
      { href: "/loading-points",    labelKey: "navLoadingPoints",   icon: MapPin },
    ],
  },
  {
    key: "settings", labelKey: "settingsGroup", icon: Database,
    items: [
      { href: "/company-settings", labelKey: "navCompanySettings", icon: Building2 },
      { href: "/excel-import",     labelKey: "navExcelImport",     icon: FileSpreadsheet },
      { href: "/system-guide",     labelKey: "navSystemGuide",     icon: BookOpen },
      { href: "/backup-restore-log", labelKey: "navBackupRestore", icon: ScrollText },
    ],
  },
];


const EMPLOYEE_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];

const WORKSHOP_MANAGER_NAV: NavItem[] = [
  { href: "/employee-portal",    labelKey: "navEmployeePortal",    icon: Users },
  { href: "/workshop-manager",   labelKey: "navWorkshopMgr",       icon: Wrench },
  { href: "/workshop-inventory", labelKey: "navWorkshopInventory", icon: Boxes },
  { href: "/notifications",      labelKey: "navNotifications",     icon: Bell },
];
const PURCHASING_NAV: NavItem[] = [
  { href: "/employee-portal",    labelKey: "navEmployeePortal",   icon: Users },
  { href: "/purchasing",         labelKey: "navPurchasing",       icon: ShoppingBag },
  { href: "/notifications",      labelKey: "navNotifications",    icon: Bell },
];
const FINANCE_NAV: NavItem[] = [
  { href: "/finance",        labelKey: "navFinance",        icon: DollarSign },
  { href: "/tariffs",        labelKey: "navTariffs",        icon: MapPin },
  { href: "/notifications",  labelKey: "navNotifications",  icon: Bell },
];

const WAREHOUSE_MANAGER_NAV: NavItem[] = [
  { href: "/warehouse-manager", labelKey: "navWarehouseMgr",     icon: Warehouse },
  { href: "/internal-requests", labelKey: "navInternalRequests", icon: Package },
  { href: "/notifications",     labelKey: "navNotifications",    icon: Bell },
];

const FSOHAT_NAV: NavItem[] = [
  { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  { href: "/fsohat",          labelKey: "navFsohat",         icon: CheckCircle },
  { href: "/notifications",   labelKey: "navNotifications",  icon: Bell },
];

const CRANE_SUPERVISOR_NAV: NavItem[] = [
  { href: "/employee-portal",  labelKey: "navEmployeePortal",  icon: Users },
  { href: "/crane-supervisor", labelKey: "navCraneSupervisor", icon: Truck },
  { href: "/notifications",    labelKey: "navNotifications",   icon: Bell },
];

const VEHICLE_NAV: NavItem[] = [
  { href: "/",              labelKey: "navHome",          icon: Car },
  { href: "/notifications", labelKey: "navNotifications", icon: Bell },
];

const ROLE_NAV: Record<string, NavItem[]> = {
  customer: CUSTOMER_NAV, reviewer: REVIEWER_NAV, supervisor: SUPERVISOR_NAV,
  warehouse: WAREHOUSE_NAV, driver: DRIVER_NAV, bulker_driver: BULKER_DRIVER_NAV,
  rep: REP_NAV, employee: EMPLOYEE_NAV,
  workshop_manager: WORKSHOP_MANAGER_NAV, purchasing: PURCHASING_NAV,
  finance: FINANCE_NAV, warehouse_manager: WAREHOUSE_MANAGER_NAV,
  fsohat: FSOHAT_NAV, vehicle: VEHICLE_NAV,
  crane_traffic_supervisor: CRANE_SUPERVISOR_NAV,
};

/** Maps permission key → the nav item that grants access to that page.
 *  Used to build the sidebar dynamically for custom roles. */
const PERM_NAV_MAP: Record<string, NavItem> = {
  home_main:               { href: "/",                  labelKey: "mainHome",           icon: Home },
  home_dashboard:          { href: "/",                  labelKey: "mainHome",           icon: Home },
  ops_reviewer:            { href: "/reviewer",           labelKey: "navReview",          icon: ClipboardCheck },
  ops_supervisor:          { href: "/supervisor",         labelKey: "navTransport",       icon: Truck },
  ops_warehouse:           { href: "/warehouse",          labelKey: "navInvoice",         icon: FileText },
  stock_warehouses:        { href: "/warehouses",         labelKey: "navWarehouses",      icon: Warehouse },
  stock_warehouse_manager: { href: "/warehouse-manager",  labelKey: "navWarehouseMgr",    icon: Warehouse },
  stock_products:          { href: "/products-admin",     labelKey: "navProducts",        icon: Tag },
  stock_tariffs:           { href: "/tariffs",            labelKey: "navTariffs",         icon: MapPin },
  fleet_transportation:    { href: "/transportation",      labelKey: "navTransportationDept", icon: Truck },
  fleet_trips:             { href: "/trips",               labelKey: "navTrips",              icon: BarChart3 },
  fleet_drivers:           { href: "/drivers-manage",     labelKey: "navDriversMgmt",     icon: Car },
  fleet_workshop:          { href: "/workshop-manager",   labelKey: "navWorkshopMgr",     icon: Wrench },
  fleet_workshop_inventory:{ href: "/workshop-inventory", labelKey: "navWorkshopInventory", icon: Boxes },
  fleet_purchasing:        { href: "/purchasing",         labelKey: "navPurchasing",      icon: ShoppingBag },
  fleet_mkgh_analysis:     { href: "/mkgh-analysis",      labelKey: "navMkghAnalysis",    icon: BarChart3 },
  fleet_reimbursement:     { href: "/reimbursement",      labelKey: "navReimbursement",   icon: DollarSign },
  fleet_vehicle_analytics: { href: "/vehicle-analytics",  labelKey: "navVehicleAnalytics",icon: Car },
  fleet_vehicle_types:     { href: "/vehicle-types-admin",labelKey: "navVehicleTypeDefs", icon: Package },
  fleet_vehicles_edit:     { href: "/supervisor",           labelKey: "navFleetManage",     icon: Shield },
  ops_bulker:              { href: "/bulker-supervisor",   labelKey: "navBulkerSupervisor",icon: Truck },
  stock_internal_req:      { href: "/internal-requests",  labelKey: "navInternalRequests",icon: Package },
  ops_fsohat:              { href: "/fsohat",             labelKey: "navFsohat",          icon: CheckCircle },
  ops_crane_supervisor:    { href: "/crane-supervisor",  labelKey: "navCraneSupervisor", icon: Truck },
  ops_doc_requests:        { href: "/driver-doc-requests",labelKey: "navDocRequests",     icon: FileText },
  hr_employees:            { href: "/employees",          labelKey: "navEmployees",       icon: HardHat },
  hr_requests:             { href: "/hr-requests",        labelKey: "navHRRequests",      icon: CalendarDays },
  hr_approvals:            { href: "/approvals",          labelKey: "navApprovals",       icon: CheckCircle },
  users_manage:            { href: "/users",              labelKey: "navUsers",           icon: Users },
  users_rep_targets:       { href: "/rep-targets",        labelKey: "navRepTargets",      icon: Target },
  reports_main:            { href: "/reports",            labelKey: "navReports",         icon: BarChart3 },
  finance_main:            { href: "/finance",            labelKey: "navFinance",         icon: DollarSign },
  legal_library:           { href: "/legal",              labelKey: "navLegal",           icon: Scale },
  legal_logs:              { href: "/system-logs",        labelKey: "navSystemLogs",      icon: ScrollText },
  legal_ratings:           { href: "/ratings-analytics",  labelKey: "navRatingsAnalytics",icon: Star },
  legal_loading:           { href: "/loading-points",     labelKey: "navLoadingPoints",   icon: MapPin },
  settings_company:        { href: "/company-settings",   labelKey: "navCompanySettings", icon: Building2 },
  settings_system:         { href: "/admin",              labelKey: "navSystem",          icon: LayoutDashboard },
  settings_excel_import:   { href: "/excel-import",       labelKey: "navExcelImport",     icon: FileSpreadsheet },
  settings_system_guide:   { href: "/system-guide",       labelKey: "navSystemGuide",     icon: BookOpen },
  settings_notifs:         { href: "/notifications",      labelKey: "navNotifications",   icon: Bell },
  portal_employee:         { href: "/employee-portal",    labelKey: "navEmployeePortal",  icon: Users },
  portal_driver:           { href: "/",                   labelKey: "mainHome",           icon: Truck },
  portal_rep:              { href: "/rep",                labelKey: "navMyOrders",        icon: Users },
};

/** Build a nav list from a user's permissions (used for custom roles). */
function buildNavFromPerms(perms: string[]): NavItem[] {
  const seen = new Set<string>();
  const items: NavItem[] = [
    { href: "/employee-portal", labelKey: "navEmployeePortal", icon: Users },
  ];
  seen.add("/employee-portal");
  for (const p of perms) {
    const item = PERM_NAV_MAP[p];
    if (item && !seen.has(item.href)) {
      seen.add(item.href);
      items.push(item);
    }
  }
  return items;
}

const ROLE_COLOR: Record<string, string> = {
  customer: "bg-blue-600", reviewer: "bg-indigo-600", supervisor: "bg-orange-600",
  warehouse: "bg-green-600", driver: "bg-yellow-600", rep: "bg-pink-600",
  admin: "bg-purple-600", employee: "bg-teal-600",
  workshop_manager: "bg-red-700", purchasing: "bg-cyan-600",
  warehouse_manager: "bg-emerald-700", accountant: "bg-violet-700", bank_officer: "bg-sky-700",
};

/* ─── NavLink ─────────────────────────────────────────────────────────────── */
function NavLink({ href, labelKey, icon: Icon, onClose, indent = false, badge, collapsed }: NavItem & { onClose: () => void; indent?: boolean; collapsed?: boolean }) {
  const { t } = useLang();
  const [location] = useLocation();
  const active = href === "/" ? location === "/" : location.startsWith(href);
  if (collapsed) {
    return (
      <Link href={href} onClick={onClose}>
        <div title={t(labelKey)} className={`relative flex items-center justify-center w-10 h-10 mx-auto rounded-xl cursor-pointer transition-all
          ${active ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          <Icon size={18} />
          {badge != null && badge > 0 && (
            <span className="absolute -top-1 -end-1 bg-amber-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </div>
      </Link>
    );
  }
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
        {badge != null && badge > 0 && (
          <span className="bg-amber-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
        {active && !indent && !badge && <ChevronLeft size={13} className="opacity-60" />}
      </div>
    </Link>
  );
}

/* ─── CollapsibleGroup ───────────────────────────────────────────────────── */
function CollapsibleGroup({ group, onClose, collapsed }: { group: NavGroup; onClose: () => void; collapsed?: boolean }) {
  const { t } = useLang();
  const [location] = useLocation();
  const hasActive = group.items.some(i => i.href === "/" ? location === "/" : location.startsWith(i.href));
  const [open, setOpen] = useState(hasActive);

  if (collapsed) {
    // In collapsed mode show only the group icon; each item still gets its own icon row
    return (
      <div className="space-y-0.5">
        {group.items.map(item => (
          <NavLink key={item.href} {...item} onClose={onClose} collapsed />
        ))}
      </div>
    );
  }

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
  const [q,    setQ]    = useState("");
  const inputRef        = useRef<HTMLInputElement>(null);
  const cur             = LANGUAGES.find(l => l.code === lang);

  const shown = LANGUAGES.filter(l =>
    !q.trim() ||
    l.label.toLowerCase().includes(q.toLowerCase()) ||
    l.code.toLowerCase().includes(q.toLowerCase())
  );

  const handleOpen = () => { setQ(""); setOpen(v => !v); };

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  return (
    <div className="relative">
      <button onClick={handleOpen}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-medium transition-colors">
        <Globe size={12} />
        <span>{cur?.flag}</span>
        <span className="hidden lg:inline">{cur?.label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQ(""); }} />
          <div className="absolute bottom-full mb-1 start-0 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[160px]">

            {/* ── filter input — fires on every character ── */}
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                <Search size={11} className="text-gray-400 shrink-0" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="اكتب لغة..."
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-gray-400 min-w-0"
                />
                {q && (
                  <button onClick={() => { setQ(""); inputRef.current?.focus(); }}
                    className="text-gray-300 hover:text-gray-400">
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>

            {/* ── filtered list ── */}
            {shown.length > 0 ? shown.map(l => (
              <button key={l.code}
                onClick={() => { setLang(l.code); setOpen(false); setQ(""); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-gray-50 transition-colors
                  ${l.code === lang ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700"}`}>
                <span className="text-base">{l.flag}</span>
                <span>{l.label}</span>
              </button>
            )) : (
              <p className="text-center text-xs text-gray-400 py-3">لا توجد نتائج</p>
            )}
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
  const [pendingDocs, setPendingDocs] = useState(0);
  const { user, logout } = useAuth();
  const { t, dir } = useLang();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "1"; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(c => {
    const next = !c;
    try { localStorage.setItem("sidebar-collapsed", next ? "1" : "0"); } catch {}
    return next;
  });

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

  useEffect(() => {
    if (!user) return;
    if (!["admin", "supervisor"].includes(user.role) && !(user.permissions ?? []).includes("ops_doc_requests")) return;
    const check = () =>
      fetch("/api/driver-doc-requests")
        .then(r => r.json())
        .then((data: Record<string, unknown>[]) =>
          setPendingDocs(Array.isArray(data) ? data.filter(r => r.status === "pending").length : 0))
        .catch(() => {});
    check();
    const ti = setInterval(check, 60000);
    return () => clearInterval(ti);
  }, [user]);

  const isAdmin = user?.role === "admin";
  const [navSearch, setNavSearch] = useState("");

  const adminGroups = useMemo<NavGroup[]>(() =>
    ADMIN_GROUPS.map(g => ({
      ...g,
      items: g.items.map(item =>
        item.href === "/driver-doc-requests" && pendingDocs > 0
          ? { ...item, badge: pendingDocs }
          : item
      ),
    })), [pendingDocs]);

  // If the user has explicit custom permissions, build nav from those (ignoring the role template).
  // Only fall back to the role template when no custom permissions are set.
  const baseFlatNav = user
    ? (user.permissions && user.permissions.length > 0
        ? buildNavFromPerms(user.permissions)
        : (ROLE_NAV[user.role] ?? []))
    : [];
  const flatNav = user &&
    !user.isGuest &&
    !baseFlatNav.some(item => item.href === "/chat")
    ? [...baseFlatNav, CHAT_LINK]
    : baseFlatNav;
  const close   = () => { setOpen(false); setNavSearch(""); };
  const { totalCount: cartCount } = useCart();
  const { fontScale, fontScaleUp, fontScaleDown, fontScaleReset, canFontScaleUp, canFontScaleDown } = useFontScale();

  // All admin items flat (for search)
  const allAdminItems = useMemo<NavItem[]>(() =>
    adminGroups.flatMap(g => g.items), [adminGroups]);

  // Filtered nav items when search is active
  const searchedItems = useMemo<NavItem[]>(() => {
    const q = navSearch.trim().toLowerCase();
    if (!q) return [];
    const pool = isAdmin ? allAdminItems : flatNav;
    return pool.filter(item =>
      t(item.labelKey).toLowerCase().includes(q)
    );
  }, [navSearch, isAdmin, allAdminItems, flatNav, t]);

  const roleKey = `role${(user?.role || "").charAt(0).toUpperCase() + (user?.role || "").slice(1)}` as string;

  const sidebarContent = (
    <nav className="flex flex-col h-full">
      {/* Brand */}
      <div className={`border-b border-border ${collapsed ? "py-3 px-1 flex flex-col items-center gap-2" : "px-4 py-4"}`}>
        {collapsed ? (
          <>
            {/* Hamburger toggle */}
            <button onClick={toggleCollapsed} title="توسيع الشريط"
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Menu size={20} />
            </button>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-8 h-8 rounded-xl overflow-hidden shadow-sm">
                <img src="/jefer-logo-new.png" alt="MKGH" className="w-full h-full object-contain" />
              </div>
              <span data-testid="text-brand-mark" className="text-[8px] font-bold leading-none tracking-wider text-muted-foreground">mkgh</span>
            </div>
            {user && (
              <div title={user.name} className={`w-7 h-7 rounded-lg ${ROLE_COLOR[user.role]} flex items-center justify-center`}>
                <span className="text-white font-bold text-xs">{user.name[0]}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <div className="w-9 h-9 rounded-xl overflow-hidden shadow-sm">
                  <img src="/jefer-logo-new.png" alt="MKGH" className="w-full h-full object-contain" />
                </div>
                <span data-testid="text-brand-mark" className="text-[8px] font-bold leading-none tracking-wider text-muted-foreground">mkgh</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-sm text-foreground tracking-tight">MKGH</div>
                <div className="text-xs text-muted-foreground truncate">{t("tagline")}</div>
              </div>
              {/* Hamburger toggle — desktop */}
              <button onClick={toggleCollapsed} title="تصغير الشريط"
                className="hidden md:flex w-8 h-8 items-center justify-center rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0">
                <Menu size={18} />
              </button>
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
          </>
        )}
      </div>

      {/* Search — hidden when collapsed */}
      {user && !collapsed && (
        <div className="px-3 pt-3 pb-1 border-b border-border/40">
          <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
            <Search size={13} className="text-muted-foreground shrink-0" />
            <input
              value={navSearch}
              onChange={e => setNavSearch(e.target.value)}
              placeholder="ابحث في القائمة..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
              dir="rtl"
            />
            {navSearch && (
              <button onClick={() => setNavSearch("")} className="text-muted-foreground hover:text-foreground">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <div className={`flex-1 overflow-y-auto py-3 space-y-0.5 ${collapsed ? "px-1" : "px-2"}`}>
        {/* Search results */}
        {!collapsed && navSearch.trim() ? (
          searchedItems.length > 0 ? (
            searchedItems.map(item => <NavLink key={item.href} {...item} onClose={close} />)
          ) : (
            <div className="text-center py-8 text-muted-foreground text-xs">لا توجد نتائج</div>
          )
        ) : isAdmin ? (
          adminGroups.map(group => <CollapsibleGroup key={group.key} group={group} onClose={close} collapsed={collapsed} />)
        ) : (
          flatNav.filter(item => item.href !== "/notifications").map(item => {
            if (item.href === "/my-orders" && user?.role === "customer") {
              return (
                <Link key={item.href} href={item.href} onClick={close}>
                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all
                    ${location === item.href ? "bg-primary text-primary-foreground font-semibold shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                    <ShoppingCart size={17} />
                    <span className="text-sm flex-1">{t(item.labelKey)}</span>
                  </div>
                </Link>
              );
            }
            if (item.href === "/driver-doc-requests") {
              const active = location.startsWith("/driver-doc-requests");
              return (
                <Link key={item.href} href={item.href} onClick={close}>
                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all
                    ${active ? "bg-blue-600 text-white font-semibold shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                    <FileText size={17} />
                    <span className="text-sm flex-1">{t("navDocRequests")}</span>
                    {pendingDocs > 0 && (
                      <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                        {pendingDocs > 9 ? "9+" : pendingDocs}
                      </span>
                    )}
                  </div>
                </Link>
              );
            }
            return <NavLink key={item.href} {...item} onClose={close} collapsed={collapsed} />;
          })
        )}

        {/* Cart — customer only */}
        {user?.role === "customer" && (
          collapsed ? (
            <Link href="/cart" onClick={close}>
              <div title="سلة المشتريات" className={`relative flex items-center justify-center w-10 h-10 mx-auto rounded-xl cursor-pointer transition-all
                ${location === "/cart" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <ShoppingBag size={18} />
                {cartCount > 0 && <span className="absolute -top-1 -end-1 bg-orange-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{cartCount > 9 ? "9+" : cartCount}</span>}
              </div>
            </Link>
          ) : (
            <Link href="/cart" onClick={close}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all
                ${location === "/cart" ? "bg-primary text-primary-foreground font-semibold shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <ShoppingBag size={17} />
                <span className="text-sm flex-1">سلة المشتريات</span>
                {cartCount > 0 && <span className="bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{cartCount > 9 ? "9+" : cartCount}</span>}
              </div>
            </Link>
          )
        )}

        {/* Notifications — always shown with unread badge */}
        {user && user.role !== "customer" && (
          collapsed ? (
            <Link href="/notifications" onClick={close}>
              <div title={t("navNotifications")} className={`relative flex items-center justify-center w-10 h-10 mx-auto rounded-xl cursor-pointer transition-all
                ${location === "/notifications" ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <Bell size={18} />
                {unread > 0 && <span className="absolute -top-1 -end-1 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{unread > 9 ? "9+" : unread}</span>}
              </div>
            </Link>
          ) : (
            <Link href="/notifications" onClick={close}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all
                ${location === "/notifications" ? "bg-blue-600 text-white font-semibold shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <Bell size={17} />
                <span className="text-sm flex-1">{t("navNotifications")}</span>
                {unread > 0 && <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{unread > 9 ? "9+" : unread}</span>}
              </div>
            </Link>
          )
        )}

      </div>

      {/* Footer */}
      {collapsed ? (
        <div className="py-3 border-t border-border flex flex-col items-center gap-2">
          {/* Font scale controls — collapsed */}
          <button onClick={fontScaleUp} disabled={!canFontScaleUp} title="تكبير الخط"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ALargeSmall size={16} />
          </button>
          <button onClick={fontScaleDown} disabled={!canFontScaleDown} title="تصغير الخط"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ALargeSmall size={13} />
          </button>
          <ThemeToggleCycle />
          {user && (
            <button onClick={logout} title={t("logout")}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
              <LogOut size={16} />
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString(dir === "rtl" ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric" })}
            </div>
            <SidebarLangPicker />
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">المظهر</span>
            <ThemeToggleBar />
          </div>
          {/* Font scale controls — expanded: [−] [100%] [+] */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">حجم الخط</span>
            <div className="flex items-center gap-1">
              <button onClick={fontScaleDown} disabled={!canFontScaleDown} title="تصغير الخط"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <ALargeSmall size={11} />
              </button>
              <button onClick={fontScaleReset} title="إعادة ضبط الخط"
                className="px-2 h-7 flex items-center justify-center rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-w-[2.5rem]">
                {fontScale}%
              </button>
              <button onClick={fontScaleUp} disabled={!canFontScaleUp} title="تكبير الخط"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <ALargeSmall size={13} />
              </button>
            </div>
          </div>
          {user && (
            <button onClick={logout}
              className="w-full flex items-center justify-center gap-2 text-xs text-red-500 hover:text-red-700 py-1.5 rounded-xl hover:bg-red-50 transition-colors">
              <LogOut size={13} />{t("logout")}
            </button>
          )}
        </div>
      )}

      {/* Toggle collapse button — desktop only, shown in brand header */}
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
      <aside className={`fixed md:relative inset-y-0 ${dir === "rtl" ? "right-0" : "left-0"} z-40 bg-card border-s border-border shadow-sm flex-shrink-0
        flex flex-col transition-all duration-200
        ${collapsed ? "md:w-14 w-60" : "w-60"}
        ${open ? "translate-x-0" : `${dir === "rtl" ? "translate-x-full" : "-translate-x-full"} md:translate-x-0`}`}>
        {sidebarContent}
      </aside>
    </>
  );
}
