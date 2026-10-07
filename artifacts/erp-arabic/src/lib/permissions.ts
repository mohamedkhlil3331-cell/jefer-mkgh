export interface PermDef {
  key: string;
  label: string;
  route?: string;
}

export interface PermGroupDef {
  key: string;
  label: string;
  emoji: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  perms: PermDef[];
}

export const PERMISSION_GROUPS: PermGroupDef[] = [
  {
    key: "home",
    label: "الرئيسية",
    emoji: "🏠",
    colorClass: "text-slate-700",
    bgClass: "bg-slate-100",
    borderClass: "border-slate-300",
    perms: [
      { key: "home_main",      label: "الصفحة الرئيسية (MainHome)",  route: "/" },
      { key: "home_dashboard", label: "لوحة التحليلات والإحصائيات", route: "/dashboard" },
    ],
  },
  {
    key: "ops",
    label: "العمليات والطلبات",
    emoji: "🚚",
    colorClass: "text-orange-700",
    bgClass: "bg-orange-50",
    borderClass: "border-orange-300",
    perms: [
      { key: "ops_reviewer",   label: "مراجعة وتأكيد المدفوعات",       route: "/reviewer" },
      { key: "ops_supervisor", label: "تعيين المركبات والسائقين",       route: "/supervisor" },
      { key: "ops_warehouse",  label: "إصدار الفواتير (المستودع)",      route: "/warehouse" },
    ],
  },
  {
    key: "portal",
    label: "البوابات الشخصية",
    emoji: "👤",
    colorClass: "text-teal-700",
    bgClass: "bg-teal-50",
    borderClass: "border-teal-300",
    perms: [
      { key: "portal_employee", label: "بوابة الموظف (رحلات، مصروفات، عهدة)", route: "/employee-portal" },
      { key: "portal_driver",   label: "بوابة السائق (تحميل وتسليم)",         route: "/driver" },
      { key: "portal_rep",      label: "بوابة المندوب (متابعة الطلبات)",       route: "/rep" },
    ],
  },
  {
    key: "customer",
    label: "بوابة العملاء",
    emoji: "🛒",
    colorClass: "text-blue-700",
    bgClass: "bg-blue-50",
    borderClass: "border-blue-300",
    perms: [
      { key: "customer_catalog", label: "كتالوج المنتجات وتقديم الطلبات" },
      { key: "customer_orders",  label: "متابعة الطلبات والفواتير",      route: "/my-orders" },
      { key: "customer_account", label: "الحساب والكشف المالي",           route: "/account" },
    ],
  },
  {
    key: "stock",
    label: "المخازن والمنتجات",
    emoji: "📦",
    colorClass: "text-green-700",
    bgClass: "bg-green-50",
    borderClass: "border-green-300",
    perms: [
      { key: "stock_warehouses",        label: "إدارة المستودعات والمخزون",      route: "/warehouses" },
      { key: "stock_warehouse_manager", label: "لوحة مسؤول المستودع",            route: "/warehouse-manager" },
      { key: "stock_products",          label: "إدارة المنتجات والأسعار",        route: "/products-admin" },
      { key: "stock_tariffs",           label: "التعريفات والمسافات والتسعير",   route: "/tariffs" },
      { key: "stock_internal_req",      label: "الطلبات الداخلية للنقل",         route: "/internal-requests" },
    ],
  },
  {
    key: "fleet",
    label: "الأسطول والورشة",
    emoji: "🔧",
    colorClass: "text-rose-700",
    bgClass: "bg-rose-50",
    borderClass: "border-rose-300",
    perms: [
      { key: "fleet_transportation",     label: "قسم النقليات (لوحة + سيارات + موظفين + سائقين + مشتريات)", route: "/transportation" },
      { key: "fleet_trips",              label: "الردود / رحلات السيارات",                                    route: "/trips" },
      { key: "fleet_drivers",           label: "إدارة السائقين والمركبات",              route: "/drivers-manage" },
      { key: "fleet_workshop",          label: "الورشة وأوامر العمل والأعطال",          route: "/workshop-manager" },
      { key: "fleet_workshop_inventory", label: "مستودع الورشة",                         route: "/workshop-inventory" },
      { key: "fleet_purchasing",        label: "المشتريات وطلبات الشراء والمخزون",      route: "/purchasing" },
      { key: "fleet_mkgh_analysis",     label: "تحليل MKGH",                             route: "/mkgh-analysis" },
      { key: "fleet_reimbursement",     label: "طلبات الاستعاضة (محاسب / مسؤول البنوك)", route: "/reimbursement" },
      { key: "fleet_vehicle_analytics", label: "تحليلات السيارات وإدارة الوثائق والأعطال", route: "/vehicle-analytics" },
      { key: "fleet_vehicle_types",     label: "أنواع السيارات وقواعد التحميل",          route: "/vehicle-types-admin" },
      { key: "fleet_vehicles_edit",     label: "تعديل بيانات السيارات ورفع الوثائق",      route: "/fleet-manage" },
    ],
  },
  {
    key: "bulker",
    label: "حركة البلاكر",
    emoji: "🛢️",
    colorClass: "text-cyan-700",
    bgClass: "bg-cyan-50",
    borderClass: "border-cyan-300",
    perms: [
      { key: "ops_bulker",       label: "مشرف حركة البلاكر (رحلات + طلبات داخلية)", route: "/bulker-supervisor" },
      { key: "stock_internal_req", label: "الطلبات الداخلية للنقل (مستودع)",          route: "/internal-requests" },
      { key: "ops_fsohat",       label: "مسؤل الفسوحات (مراجعة + رفع فاتورة)",       route: "/fsohat" },
      { key: "ops_doc_requests", label: "طلبات مستندات السائقين (عرض + تحديث الحالة)", route: "/driver-doc-requests" },
    ],
  },
  {
    key: "crane",
    label: "حركة الدينه والأوناش",
    emoji: "🏗️",
    colorClass: "text-amber-700",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-300",
    perms: [
      { key: "ops_crane_supervisor", label: "مشرف حركة الدينه والأوناش (طلبات زبائن خارجيين)", route: "/crane-supervisor" },
    ],
  },
  {
    key: "hr",
    label: "الموارد البشرية والإدارة",
    emoji: "👥",
    colorClass: "text-indigo-700",
    bgClass: "bg-indigo-50",
    borderClass: "border-indigo-300",
    perms: [
      { key: "hr_employees",  label: "قائمة الموظفين وبياناتهم",           route: "/employees" },
      { key: "hr_requests",   label: "طلبات الإجازات والغياب",              route: "/hr-requests" },
      { key: "hr_approvals",  label: "الموافقات على تسجيلات العملاء",       route: "/approvals" },
      { key: "users_manage",  label: "إدارة المستخدمين والصلاحيات",         route: "/users" },
      { key: "users_rep_targets", label: "تارجت المندوبين",                  route: "/rep-targets" },
    ],
  },
  {
    key: "reports",
    label: "التقارير والمالية",
    emoji: "📊",
    colorClass: "text-purple-700",
    bgClass: "bg-purple-50",
    borderClass: "border-purple-300",
    perms: [
      { key: "reports_main",  label: "التقارير الإجمالية والإحصائيات",      route: "/reports" },
      { key: "finance_main",  label: "المالية والحسابات والعهدة",           route: "/finance" },
    ],
  },
  {
    key: "legal",
    label: "الإطار القانوني والامتثال",
    emoji: "⚖️",
    colorClass: "text-amber-800",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-300",
    perms: [
      { key: "legal_library",  label: "مكتبة الأنظمة السعودية",              route: "/legal" },
      { key: "legal_hearings", label: "متتبع الجلسات والقضايا",              route: "/legal" },
      { key: "legal_ratings",  label: "تحليلات التقييمات 360°",              route: "/ratings-analytics" },
      { key: "legal_logs",     label: "سجلات النظام والأنشطة",               route: "/system-logs" },
      { key: "legal_loading",  label: "إدارة نقاط التحميل والمستودعات",      route: "/loading-points" },
    ],
  },
  {
    key: "settings",
    label: "الإعدادات والنظام",
    emoji: "⚙️",
    colorClass: "text-gray-700",
    bgClass: "bg-gray-50",
    borderClass: "border-gray-300",
    perms: [
      { key: "settings_company", label: "فروع الشركة والبيانات المالية",    route: "/company-settings" },
      { key: "settings_system",  label: "إعدادات النظام المتقدمة (Legacy ERP)", route: "/admin" },
      { key: "settings_excel_import", label: "استيراد Excel",                    route: "/excel-import" },
      { key: "settings_system_guide", label: "دليل النظام",                       route: "/system-guide" },
      { key: "settings_notifs",  label: "الإشعارات",                            route: "/notifications" },
    ],
  },
];

/** Flat list of all permission keys */
export const ALL_PERM_KEYS: string[] = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key));

/** Maps a route path → required permission key for PermGuard */
export const ROUTE_PERM: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS
    .flatMap(g => g.perms)
    .filter(p => p.route && p.route !== "/")
    .map(p => [p.route!, p.key])
);

export interface RoleTemplate {
  key: string;
  label: string;
  perms: string[];
}

/**
 * 19 predefined role templates.
 * Selecting one auto-fills the permissions accordion.
 * The admin can still override individual checkboxes after selecting a template.
 */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: "admin_system",
    label: "مدير نظام",
    perms: ALL_PERM_KEYS,
  },
  {
    key: "reviewer",
    label: "مراجع",
    perms: ["home_main", "ops_reviewer", "reports_main", "settings_notifs"],
  },
  {
    key: "accountant",
    label: "محاسب",
    perms: ["home_main", "finance_main", "fleet_reimbursement", "reports_main", "portal_employee", "settings_notifs"],
  },
  {
    key: "bank_officer",
    label: "مسؤول البنوك",
    perms: ["home_main", "fleet_reimbursement", "settings_notifs"],
  },
  {
    key: "employee",
    label: "موظف",
    perms: ["home_main", "portal_employee", "settings_notifs"],
  },
  {
    key: "supervisor_warehouse",
    label: "مشرف النقليات والمستودع",
    perms: [
      "home_main", "home_dashboard",
      "ops_supervisor", "ops_warehouse",
      "fleet_drivers", "stock_warehouses", "stock_tariffs",
      "reports_main", "settings_notifs",
    ],
  },
  {
    key: "driver",
    label: "سائق",
    perms: ["home_main", "portal_driver", "settings_notifs"],
  },
  {
    key: "bulker_driver",
    label: "سائق بلاكر",
    perms: ["portal_bulker_driver", "settings_notifs"],
  },
  {
    key: "vehicle_role",
    label: "سيارة",
    perms: ["home_main", "portal_employee", "settings_notifs"],
  },
  {
    key: "rep",
    label: "مندوب",
    perms: ["home_main", "portal_rep", "settings_notifs"],
  },
  {
    key: "purchasing_rep",
    label: "مندوب مشتريات",
    perms: ["home_main", "fleet_purchasing", "fleet_reimbursement", "stock_warehouses", "settings_notifs"],
  },
  {
    key: "workshop_manager",
    label: "مدير الورشة",
    perms: [
      "home_main", "home_dashboard",
      "fleet_workshop", "fleet_workshop_inventory", "fleet_purchasing", "fleet_drivers", "fleet_vehicle_analytics",
      "reports_main", "settings_notifs",
    ],
  },
  {
    key: "warehouse_manager",
    label: "مسؤول المستودع",
    perms: ["home_main", "stock_warehouses", "stock_warehouse_manager", "stock_internal_req", "settings_notifs"],
  },
  {
    key: "block_factory_manager",
    label: "مدير مصنع البلك",
    perms: [
      "home_main", "home_dashboard",
      "ops_supervisor", "ops_warehouse",
      "stock_warehouses", "stock_products",
      "reports_main", "settings_notifs",
    ],
  },
  {
    key: "transport_manager",
    label: "مدير النقليات",
    perms: [
      "home_main", "home_dashboard",
      "fleet_drivers", "ops_supervisor",
      "reports_main", "settings_notifs",
    ],
  },
  {
    key: "operations_manager",
    label: "مدير التشغيل",
    perms: [
      "home_main", "home_dashboard",
      "ops_reviewer", "ops_supervisor", "ops_warehouse",
      "fleet_drivers", "stock_warehouses",
      "reports_main", "settings_notifs",
    ],
  },
  {
    key: "ceo",
    label: "المدير التنفيذي",
    perms: [
      "home_main", "home_dashboard",
      "ops_reviewer", "ops_supervisor", "ops_warehouse",
      "fleet_drivers", "fleet_workshop",
      "hr_employees", "hr_approvals",
      "reports_main", "finance_main",
      "settings_notifs",
    ],
  },
  {
    key: "hr_manager",
    label: "مدير الموارد البشرية",
    perms: [
      "home_main", "home_dashboard",
      "hr_employees", "hr_requests", "hr_approvals",
      "portal_employee", "reports_main", "settings_notifs",
    ],
  },
  {
    key: "financial_manager",
    label: "المدير المالي",
    perms: [
      "home_main", "home_dashboard",
      "finance_main", "reports_main", "settings_notifs",
    ],
  },
  {
    key: "cement_invoicer",
    label: "مسئول إصدار فواتير الأسمنت",
    perms: [
      "home_main",
      "ops_warehouse", "stock_products", "stock_tariffs",
      "settings_notifs",
    ],
  },
  {
    key: "block_traffic_supervisor",
    label: "مشرف حركة البلاكر",
    perms: [
      "home_main",
      "ops_supervisor", "ops_bulker", "fleet_drivers", "stock_warehouses",
      "settings_notifs",
    ],
  },
  {
    key: "legal_auditor",
    label: "مدقق قانوني",
    perms: [
      "home_main", "home_dashboard",
      "legal_library", "legal_hearings", "legal_ratings", "legal_logs",
      "reports_main", "settings_notifs",
    ],
  },
  {
    key: "fsohat",
    label: "مسؤل الفسوحات",
    perms: ["home_main", "ops_fsohat", "settings_notifs"],
  },
  {
    key: "crane_traffic_supervisor",
    label: "مشرف حركة الدينه والأوناش",
    perms: ["home_main", "ops_crane_supervisor", "settings_notifs"],
  },
  {
    key: "customer",
    label: "عميل",
    perms: ["customer_catalog", "customer_orders", "customer_account"],
  },
];
