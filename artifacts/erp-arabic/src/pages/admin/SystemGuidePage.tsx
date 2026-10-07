import { useRef } from "react";
import { useLocation } from "wouter";
import {
  Printer, ArrowRight, BookOpen, Users, ShoppingCart, Truck,
  Wrench, Package, BarChart3, Shield, FileText, Database,
  CheckCircle, Clock, AlertTriangle, DollarSign, MapPin,
  FileDown, Boxes, UserCheck, Bell, Star, CreditCard,
  Settings, Zap, RefreshCw, Lock,
} from "lucide-react";

// ─── Reusable components ─────────────────────────────────────────────────────

const Section = ({ id, title, icon: Icon, color, children }: {
  id: string; title: string; icon: React.ElementType;
  color: string; children: React.ReactNode;
}) => (
  <section id={id} className="mb-10 print:mb-6">
    <div className={`flex items-center gap-3 mb-4 pb-2 border-b-2 ${color}`}>
      <Icon size={22} className="shrink-0" />
      <h2 className="text-xl font-black text-gray-800">{title}</h2>
    </div>
    {children}
  </section>
);

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-5">
    <h3 className="text-base font-black text-gray-700 mb-2 flex items-center gap-2">
      <span className="w-1 h-4 bg-[#103c68]/40 rounded-full inline-block" />
      {title}
    </h3>
    {children}
  </div>
);

const Badge = ({ text, cls }: { text: string; cls: string }) => (
  <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full ${cls}`}>{text}</span>
);

const InfoBox = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <div className={`rounded-xl border p-4 text-sm mb-4 ${color}`}>{children}</div>
);

const Tag = ({ text }: { text: string }) => (
  <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200">{text}</span>
);

// ─── Data ────────────────────────────────────────────────────────────────────

const VERSION = "2.7.0";
const LAST_UPDATED = "يوليو 2026";

const roles = [
  { role: "admin",            ar: "مدير",              phone: "0500000000", pass: "admin123", color: "bg-purple-100 text-purple-800",
    access: "وصول كامل لجميع صفحات وإعدادات النظام",
    pages: ["لوحة الإدارة", "إدارة المستخدمين", "التقارير الشاملة", "الإعدادات", "دليل النظام"] },
  { role: "reviewer",         ar: "مراجع",             phone: "0500000001", pass: "123456",   color: "bg-blue-100 text-blue-800",
    access: "مراجعة الطلبات + تأكيد التحويلات المالية + التوقيع",
    pages: ["قائمة الطلبات المعلقة", "تأكيد/رفض الدفع", "إدارة التحويلات"] },
  { role: "supervisor",       ar: "مشرف نقليات",       phone: "0500000002", pass: "123456",   color: "bg-orange-100 text-orange-800",
    access: "تخصيص السيارات والسائقين للطلبات المؤكدة",
    pages: ["قائمة الطلبات المؤكدة", "اختيار سيارة متاحة", "اختيار سائق", "خريطة GPS"] },
  { role: "warehouse",        ar: "مستودع",            phone: "0500000003", pass: "123456",   color: "bg-green-100 text-green-800",
    access: "إصدار الفواتير المستودعية + إدارة حركة المخزون",
    pages: ["إصدار فاتورة للطلب", "تأكيد الشحنة", "إدارة المخزون", "طلبات التوريد الداخلي"] },
  { role: "driver",           ar: "سائق",              phone: "0500000004", pass: "123456",   color: "bg-yellow-100 text-yellow-800",
    access: "تأكيد التحميل + رفع الصورة + تأكيد التسليم + بلاغات الأعطال",
    pages: ["طلبي الحالي", "رفع صورة التحميل", "تأكيد التسليم", "بلاغ عطل", "المطالبات"] },
  { role: "rep",              ar: "مندوب",             phone: "0500000005", pass: "123456",   color: "bg-pink-100 text-pink-800",
    access: "متابعة طلبات عملائه + إحصائيات العمولة",
    pages: ["عملاء المندوب", "طلبات جارية ومنتهية", "إحصائيات المبيعات"] },
  { role: "workshop_manager", ar: "مدير الورشة",       phone: "0500000006", pass: "123456",   color: "bg-red-100 text-red-800",
    access: "بلاغات الأعطال + أوامر العمل + سجلات الصيانة + مستودع الورشة",
    pages: ["سجل الأعطال المفتوحة", "أوامر العمل", "سجل صيانة (كارت)", "إدارة المخزون"] },
  { role: "purchasing",       ar: "مسئول المشتريات",   phone: "0500000007", pass: "123456",   color: "bg-teal-100 text-teal-800",
    access: "اعتماد طلبات الشراء + تسجيل الاستلام + تحديث مستودع الورشة",
    pages: ["طلبات الشراء المعلقة", "اعتماد/رفض", "تسجيل الاستلام", "تقرير المخزون"] },
  { role: "customer",         ar: "عميل",              phone: "0555555555", pass: "123456",   color: "bg-gray-100 text-gray-800",
    access: "كتالوج المنتجات + تقديم طلبات + كشف الحساب + الفواتير",
    pages: ["الكتالوج", "سلة التسوق", "طلباتي", "كشف الحساب", "رفع تحويل", "تقييم المنتجات"] },
];

const orderStages = [
  { key: "pending",           ar: "معلق",        color: "bg-yellow-100 text-yellow-800",
    actor: "العميل", action: "يقدم الطلب من الكتالوج أو الإدارة", details: "رقم MKGH+timestamp يُنشأ تلقائياً" },
  { key: "payment_confirmed", ar: "مؤكد الدفع",  color: "bg-blue-100 text-blue-800",
    actor: "المراجع", action: "يراجع إثبات التحويل ويوقّع", details: "يمكن الرفض مع ذكر السبب" },
  { key: "vehicle_assigned",  ar: "مجهّز",       color: "bg-indigo-100 text-indigo-800",
    actor: "المشرف", action: "يختار سيارة متاحة وسائقاً لها", details: "السيارة تصبح 'مشغولة' حتى التسليم" },
  { key: "invoiced",          ar: "فاتورة",       color: "bg-purple-100 text-purple-800",
    actor: "المستودع", action: "يصدر فاتورة المخزون ويؤكد الشحنة", details: "تُخصم الكمية من المخزون تلقائياً" },
  { key: "loaded",            ar: "في الطريق",   color: "bg-cyan-100 text-cyan-800",
    actor: "السائق", action: "يؤكد التحميل ويرفع صورة الحمولة", details: "العميل/المندوب يرون: اللوحة + هاتف السائق + واتساب" },
  { key: "delivered",         ar: "مسلّم",        color: "bg-green-100 text-green-800",
    actor: "السائق", action: "يؤكد التسليم للعميل", details: "السيارة تتحرر — العميل يقيّم + يحمّل فاتورة VAT 15%" },
];

const modules = [
  {
    name: "بوابة العميل", icon: ShoppingCart, color: "text-blue-600",
    desc: "الواجهة الرئيسية للعميل من تصفح المنتجات حتى استلام البضاعة",
    pages: [
      { path: "/",               label: "الكتالوج",          desc: "تصفح المنتجات مع تقييمات + متوسط النجوم. زر 'أضف للسلة' يتطلب تسجيل الدخول (نافذة مصادقة للزوار)" },
      { path: "/cart",           label: "سلة التسوق",        desc: "مراجعة المنتجات + الكميات + ملاحظات. العميل غير المسجل يرى شارة تنبيه باللون الأصفر" },
      { path: "/my-orders",      label: "طلباتي",            desc: "تتبع حالة الطلبات بالوقت الفعلي + تقييم المنتج بعد التسليم + تنزيل فاتورة ضريبية VAT 15%" },
      { path: "/account",        label: "حسابي",             desc: "كشف الحساب التفصيلي + رفع إثبات التحويل المالي + سجل جميع المعاملات" },
      { path: "/external-rentals", label: "طلبات التأجير",  desc: "تأجير سيارات خارجية (سطحة / شاحنة / مقطورة) مع تحديد المسافة والوقت" },
    ]
  },
  {
    name: "دورة الطلبات", icon: CheckCircle, color: "text-emerald-600",
    desc: "الصفحات المتعلقة بمراحل تنفيذ الطلب من المراجعة حتى التسليم",
    pages: [
      { path: "/reviewer",   label: "مراجعة الطلبات",  desc: "عرض إثبات التحويل المرفوع + تأكيد أو رفض الدفع + توقيع المراجع" },
      { path: "/supervisor", label: "إدارة النقليات",  desc: "قائمة الطلبات المؤكدة + اختيار سيارة متاحة وسائق + خريطة GPS مباشرة" },
      { path: "/warehouse",  label: "بوابة المستودع",  desc: "إصدار فاتورة مستودعية + تأكيد الشحنة + تتبع حركة المخزون" },
      { path: "/driver",     label: "بوابة السائق",    desc: "رفع صورة التحميل + تأكيد التسليم + إرسال بلاغ عطل + طلب مطالبة مالية" },
      { path: "/rep",        label: "بوابة المندوب",   desc: "متابعة طلبات عملائه + تتبع مستوى التسليم + إحصائيات العمولة" },
    ]
  },
  {
    name: "الأسطول والسيارات", icon: Truck, color: "text-orange-600",
    desc: "إدارة الأسطول من المركبات، الرحلات، المصاريف، والتحليلات",
    pages: [
      { path: "/vehicle-analytics", label: "تحليلات السيارات",  desc: "رحلات كاملة CRUD (إضافة/تعديل/حذف) + مصاريف + أعطال + بطاقات ملخص + GPS + عرض مخطط زمني" },
      { path: "/drivers-manage",    label: "إدارة السائقين",    desc: "ملفات السائقين + وثائق الترخيص + طلبات التجديد التلقائية + حالة كل سائق" },
      { path: "/transportation",    label: "صفحة النقل",        desc: "لوحة تتبع الرحلات الحية مع خريطة تفاعلية ومسارات" },
      { path: "/trips",             label: "سجل الرحلات",       desc: "جدول كامل لجميع الرحلات مع فلترة متقدمة (تاريخ، سيارة، سائق، وجهة)" },
      { path: "/vehicle-types-admin", label: "أنواع السيارات", desc: "تعريف فئات السيارات ومعاملات التسعير لكل فئة" },
    ]
  },
  {
    name: "الورشة والمشتريات", icon: Wrench, color: "text-red-600",
    desc: "إدارة كاملة لصيانة الأسطول — من بلاغ العطل حتى إغلاق أمر العمل",
    pages: [
      { path: "/workshop-manager",   label: "إدارة الورشة",       desc: "بلاغات الأعطال (سيارة أو تيدر/مقطورة) + أوامر العمل + سجل صيانة بكارت (رقم كارت + وقت دخول/خروج + فنيون + قطع غيار)" },
      { path: "/workshop-inventory", label: "مستودع الورشة",       desc: "قطع الغيار مع حد الإنذار + سجل الحركة التفصيلي + تنبيهات النفاد" },
      { path: "/purchasing",         label: "المشتريات",           desc: "اعتماد طلبات الشراء + تتبع الاستلام + تحديث المخزون تلقائياً عند الاستلام" },
    ]
  },
  {
    name: "المستودع والمنتجات", icon: Package, color: "text-teal-600",
    desc: "إدارة المنتجات والمستودعات والأسعار وحركة المخزون",
    pages: [
      { path: "/warehouses",        label: "إدارة المستودعات",  desc: "إدارة مواقع التخزين + نقل المخزون بين الفروع" },
      { path: "/warehouse-manager", label: "مدير المستودع",     desc: "إصدار الطلبات الداخلية + تتبع حركة المخزون التفصيلية" },
      { path: "/products-admin",    label: "المنتجات",          desc: "إضافة/تعديل منتجات + الصور + الفئات + الأسعار + حالة الظهور" },
      { path: "/tariffs",           label: "التعريفات",         desc: "أسعار النقل حسب الوجهة + نوع الحمولة + نوع السيارة" },
      { path: "/loading-points",    label: "نقاط التحميل",      desc: "إدارة مواقع التحميل الجغرافية مع الإحداثيات" },
    ]
  },
  {
    name: "الموارد البشرية", icon: Users, color: "text-indigo-600",
    desc: "إدارة الموظفين والإجازات والرواتب والموافقات",
    pages: [
      { path: "/employees",       label: "الموظفون",           desc: "بيانات الموظفين الكاملة + الراتب + القسم + تاريخ التعيين" },
      { path: "/hr-requests",     label: "طلبات HR",           desc: "طلبات الإجازة + الاعتماد الإلكتروني + السجل التاريخي الكامل" },
      { path: "/approvals",       label: "الموافقات",          desc: "قائمة انتظار الموافقات المعلقة من جميع الأقسام" },
      { path: "/employee-portal", label: "بوابة الموظف",      desc: "الموظف يتابع راتبه وإجازاته وتقاريره الشخصية" },
    ]
  },
  {
    name: "التقارير والمالية", icon: BarChart3, color: "text-violet-600",
    desc: "تقارير شاملة للمبيعات والأسطول والمالية والتقييمات",
    pages: [
      { path: "/reports",           label: "التقارير",           desc: "تقارير المبيعات + الأسطول + الموظفين + المالية — قابلة للتصدير Excel" },
      { path: "/finance",           label: "المالية",            desc: "سندات القبض والصرف + الخزينة + كشوف الحساب التفصيلية" },
      { path: "/reimbursement",     label: "المطالبات",          desc: "مصاريف يومية للسائقين والموظفين + دورة الاعتماد" },
      { path: "/ratings-analytics", label: "تحليل التقييمات",   desc: "تقييمات المنتجات من العملاء + توزيع النجوم + التعليقات" },
    ]
  },
  {
    name: "الإعدادات والنظام", icon: Shield, color: "text-gray-600",
    desc: "إعدادات المنصة وإدارة المستخدمين والسجلات والتوثيق",
    pages: [
      { path: "/admin",            label: "لوحة الإدارة",        desc: "إدارة المستخدمين + المنتجات + الطلبات المباشرة + الإشعارات" },
      { path: "/users",            label: "إدارة المستخدمين",    desc: "إنشاء/تعديل/تعطيل المستخدمين + تعيين الأدوار + إعادة تعيين كلمة المرور" },
      { path: "/company-settings", label: "إعدادات الشركة",      desc: "الفروع + الاسم التجاري + الرقم الضريبي + CR + الشعار" },
      { path: "/system-logs",      label: "سجل النظام",          desc: "جميع العمليات المنفذة مع الطابع الزمني والمستخدم المنفّذ" },
      { path: "/legal",            label: "المكتبة القانونية",   desc: "مرفقات العقود والوثائق القانونية القابلة للتنزيل" },
      { path: "/system-guide",     label: "دليل النظام",         desc: "هذه الصفحة — توثيق كامل ومحدّث للمنصة" },
    ]
  },
];

const dbTables = [
  { name: "users",                  desc: "المستخدمون — الاسم، الهاتف، الدور، كلمة المرور (bcrypt hashed)", cols: "id, name, phone, role, password_hash, active, created_at" },
  { name: "sessions",               desc: "جلسات المصادقة — رمز JWT + تاريخ الانتهاء", cols: "id, user_id, token, expires_at" },
  { name: "products",               desc: "المنتجات — الاسم، السعر، الوحدة، الصورة، الفئة، المخزون", cols: "id, name, price, unit, category, image_url, stock, active" },
  { name: "product_ratings",        desc: "تقييمات المنتجات من العملاء — النجوم والتعليق", cols: "id, product_id, user_id, rating, comment, created_at" },
  { name: "workflow_orders",        desc: "طلبات النظام الرئيسية — رقم MKGH + جميع مراحل الحياة + بيانات التسليم", cols: "id, order_number (MKGH+ts), customer_phone, status, vehicle_plate, driver_phone, total_with_vat, …" },
  { name: "customer_transfers",     desc: "إثباتات التحويل المالي المرفوعة من العملاء", cols: "id, order_id, customer_phone, image_url, status, confirmed_by" },
  { name: "notifications",          desc: "الإشعارات بين الأدوار — مقروءة/غير مقروءة مع رابط", cols: "id, user_role, message, link, is_read, created_at" },
  { name: "breakdown_reports",      desc: "بلاغات أعطال السيارات من السائقين — مفتوحة/محلولة", cols: "id, driver_phone, vehicle_plate, breakdown_type, description, photo_url, status" },
  { name: "workshop_jobs",          desc: "أوامر العمل في الورشة — مرتبطة بسيارة أو مخزون", cols: "id, vehicle_plate, title, job_type, invoice_target, status, total_cost, …" },
  { name: "maintenance_logs",       desc: "سجل صيانة مفصّل (كارت) — يشمل السيارات والتيدرات والخارجية", cols: "id, card_number, vehicle_plate, trailer_number, trailer_type, is_external, technicians, tires, amount_mechanical, amount_electrical, …" },
  { name: "workshop_inventory",     desc: "مخزون قطع الغيار — الكمية + حد الإنذار + تتبع الحركة", cols: "id, item_name, item_code, category, quantity, unit, min_stock, cost_per_unit" },
  { name: "purchase_requests",      desc: "طلبات الشراء من الورشة إلى المشتريات — دورة اعتماد كاملة", cols: "id, item_name, quantity, status (pending/approved/rejected/received), created_by" },
  { name: "trips",                  desc: "سجل رحلات السيارات (الردود) — 29 حقلاً لكل رحلة", cols: "id, vehicle_plate, driver_name, origin, destination, date, distance_km, load_weight, …" },
  { name: "fleet_vehicles",         desc: "بيانات مركبات الأسطول — اللوحة، النوع، الحالة، GPS ID", cols: "id, plate_number, vehicle_type, status, driver_name, gps_device_id, vehicle_password" },
  { name: "fleet_expenses",         desc: "مصاريف الأسطول اليومية — ديزل + صيانة + متفرقات", cols: "id, vehicle_plate, expense_type, amount, date, notes" },
  { name: "employees",              desc: "موظفو الشركة — الراتب، القسم، تاريخ التعيين", cols: "id, name, position, department, salary, hire_date, phone" },
  { name: "leave_requests",         desc: "طلبات الإجازة وحالتها (معلقة/موافق/مرفوض)", cols: "id, employee_id, start_date, end_date, status, approved_by" },
  { name: "invoices",               desc: "فواتير المبيعات التاريخية (Legacy ERP قبل المنصة)", cols: "id, invoice_no, customer, amount, date, items_json" },
];

const apiEndpoints = [
  { method: "POST",   path: "/api/auth/login",                          desc: "تسجيل الدخول — هاتف + كلمة مرور → رمز JWT صالح 7 أيام" },
  { method: "GET",    path: "/api/products",                            desc: "كتالوج المنتجات مع متوسط التقييمات (لا يتطلب مصادقة)" },
  { method: "POST",   path: "/api/workflow/orders",                     desc: "العميل يضع طلباً جديداً — رقم MKGH+timestamp يُنشأ تلقائياً" },
  { method: "PUT",    path: "/api/workflow/orders/:id/confirm-payment", desc: "المراجع يؤكد التحويل المالي + يوقع" },
  { method: "PUT",    path: "/api/workflow/orders/:id/assign-vehicle",  desc: "المشرف يخصص سيارة وسائقاً — السيارة تصبح مشغولة" },
  { method: "PUT",    path: "/api/workflow/orders/:id/invoice",         desc: "المستودع يصدر الفاتورة — الكمية تُخصم من المخزون" },
  { method: "PUT",    path: "/api/workflow/orders/:id/load",            desc: "السائق يؤكد التحميل + يرفع صورة (multipart/form-data)" },
  { method: "PUT",    path: "/api/workflow/orders/:id/deliver",         desc: "السائق يؤكد التسليم — السيارة تتحرر تلقائياً" },
  { method: "GET",    path: "/api/portal/customers/:phone/statement",   desc: "كشف حساب العميل الكامل بجميع الطلبات" },
  { method: "GET",    path: "/api/portal/customers/:phone/orders/:id/vat-invoice", desc: "فاتورة ضريبية PDF (VAT 15%) قابلة للتنزيل" },
  { method: "POST",   path: "/api/portal/transfers",                    desc: "العميل يرفع إثبات التحويل المالي" },
  { method: "PUT",    path: "/api/portal/transfers/:id/confirm",        desc: "المراجع يؤكد التحويل" },
  { method: "GET",    path: "/api/trips",                               desc: "قائمة الرحلات مع فلاتر (سيارة، تاريخ، وجهة)" },
  { method: "POST",   path: "/api/trips",                               desc: "إضافة رحلة يدوية لسجل السيارة" },
  { method: "PUT",    path: "/api/trips/:id",                           desc: "تعديل بيانات رحلة" },
  { method: "DELETE", path: "/api/trips/:id",                           desc: "حذف رحلة" },
  { method: "GET",    path: "/api/fleet/vehicles",                      desc: "قائمة السيارات مع حالة الانشغال" },
  { method: "GET",    path: "/api/vehicle-analytics/:plate",            desc: "تحليلات سيارة: رحلات + مصاريف + أعطال + ملخص مالي" },
  { method: "POST",   path: "/api/breakdown-reports",                   desc: "السائق يرفع بلاغ عطل (صورة اختيارية)" },
  { method: "POST",   path: "/api/workshop-jobs",                       desc: "إنشاء أمر عمل في الورشة" },
  { method: "PUT",    path: "/api/workshop-jobs/:id/complete",          desc: "إغلاق أمر العمل + تسجيل التكلفة الإجمالية" },
  { method: "GET",    path: "/api/maintenance-logs",                    desc: "سجل صيانة مفلتر (سيارة، تاريخ، فرع)" },
  { method: "POST",   path: "/api/maintenance-logs",                    desc: "إضافة سجل صيانة جديد (سيارة أو تيدر — خارجي أو داخلي)" },
  { method: "PUT",    path: "/api/maintenance-logs/:id",                desc: "تعديل سجل صيانة قائم" },
  { method: "POST",   path: "/api/purchase-requests",                   desc: "الورشة تطلب شراء قطعة من المشتريات" },
  { method: "PUT",    path: "/api/purchase-requests/:id/approve",       desc: "المشتريات تعتمد طلب الشراء" },
  { method: "PUT",    path: "/api/purchase-requests/:id/receive",       desc: "استلام المشتريات → يُضاف للمخزون تلقائياً" },
  { method: "GET",    path: "/api/workshop-inventory",                  desc: "مستودع الورشة مع تنبيهات النفاد" },
  { method: "GET",    path: "/api/notifications",                       desc: "إشعارات المستخدم الحالي (غير المقروءة)" },
];

const METHOD_COLOR: Record<string, string> = {
  GET:    "bg-green-100 text-green-800",
  POST:   "bg-blue-100 text-blue-800",
  PUT:    "bg-amber-100 text-amber-800",
  DELETE: "bg-red-100 text-red-800",
};

const roleGuides: {
  role: string; ar: string; color: string; icon: React.ElementType;
  sections: { title: string; steps: { action: string; result: string }[] }[];
}[] = [
  {
    role: "customer", ar: "العميل", color: "bg-gray-100 text-gray-800", icon: ShoppingCart,
    sections: [
      { title: "الكتالوج وتقديم الطلب", steps: [
        { action: "يفتح الكتالوج (/) ويتصفح المنتجات", result: "يرى المنتجات مع الأسعار ومتوسط التقييمات — البحث والفلترة يعملان فوراً" },
        { action: "يضغط 'أضف للسلة'", result: "إذا غير مسجل تظهر نافذة تسجيل الدخول — وإلا تُضاف الكمية للسلة فوراً" },
        { action: "يفتح السلة ويراجع الطلب (/cart)", result: "يرى المنتجات + الكميات + الإجمالي مع VAT 15% محسوبة تلقائياً" },
        { action: "يضغط 'تأكيد الطلب'", result: "يُنشأ طلب برقم MKGH+timestamp — الحالة: معلق — يصل إشعار فوري للمراجع" },
      ]},
      { title: "متابعة الطلب ودفعه", steps: [
        { action: "يرفع إثبات التحويل البنكي من (حسابي)", result: "تُحفظ صورة التحويل وتنتظر مراجعة المراجع المالي" },
        { action: "يتابع حالة الطلب من (طلباتي)", result: "يرى الحالة الحية: معلق → مؤكد → مجهّز → فاتورة → في الطريق → مسلّم" },
        { action: "الطلب يصل لحالة 'في الطريق'", result: "يُتاح له: رقم لوحة السيارة + رقم هاتف السائق + رابط WhatsApp مباشر" },
      ]},
      { title: "ما بعد التسليم", steps: [
        { action: "الطلب يصل لحالة 'مسلّم' — يضغط زر 'تقييم'", result: "يعطي نجوم + تعليق — يُؤثر على متوسط تقييم المنتج في الكتالوج" },
        { action: "يضغط 'تنزيل الفاتورة الضريبية'", result: "PDF رسمي جاهز يحتوي بيانات الشركة + القيمة + VAT 15% — قابل للطباعة" },
        { action: "يفتح كشف الحساب (حسابي)", result: "يرى إجمالي مشترياته + المدفوع + المتبقي + سجل كل المعاملات" },
      ]},
    ]
  },
  {
    role: "reviewer", ar: "المراجع", color: "bg-blue-100 text-blue-800", icon: CheckCircle,
    sections: [
      { title: "مراجعة الطلبات والدفع", steps: [
        { action: "يفتح بوابة المراجع (/reviewer)", result: "يرى قائمة الطلبات المعلقة التي تنتظر تأكيد الدفع" },
        { action: "يفتح طلباً ويراجع صورة التحويل البنكي", result: "تظهر صورة الإيصال بحجم كامل للتحقق من المبلغ والمستفيد" },
        { action: "يضغط 'تأكيد الدفع'", result: "الطلب ينتقل لـ payment_confirmed — يصل إشعار فوري للمشرف لتعيين سيارة" },
        { action: "يضغط 'رفض' ويكتب السبب", result: "الطلب يُعاد لحالة معلق — العميل يرى السبب ويستطيع رفع تحويل جديد" },
      ]},
      { title: "الحوالات البنكية", steps: [
        { action: "يفتح قائمة الحوالات البنكية", result: "يرى كل الحوالات المرفوعة من العملاء مع صور الإيصالات" },
        { action: "يضغط 'تأكيد الحوالة'", result: "تُسجَّل في سجل المدفوعات ويُحدَّث رصيد حساب العميل" },
        { action: "الطلبات الآجلة (من مندوب)", result: "يُحيلها للمندوب المسؤول لاعتماد حد الائتمان أولاً" },
      ]},
    ]
  },
  {
    role: "supervisor", ar: "مشرف النقليات", color: "bg-orange-100 text-orange-800", icon: Truck,
    sections: [
      { title: "تعيين السيارات", steps: [
        { action: "يفتح لوحة التوزيع (/supervisor)", result: "يرى بطاقات الطلبات المعتمدة في انتظار تعيين سيارة" },
        { action: "يضغط 'تعيين سيارة' على طلب", result: "تظهر قائمة السيارات المتاحة فقط — المشغولة لا تظهر" },
        { action: "يختار سيارة + سائق + التعريفة", result: "الطلب ينتقل لـ vehicle_assigned — السيارة تُحجَز — إشعار للمستودع والسائق" },
      ]},
      { title: "متابعة الأسطول والرحلات", steps: [
        { action: "يفتح حالة الأسطول", result: "يرى كل السيارات: أخضر=متاح / أحمر=مشغول / رمادي=في الصيانة" },
        { action: "يفتح الرحلات النشطة", result: "يرى كل الرحلات الجارية حالياً مع حالتها ووجهتها" },
        { action: "يفتح خريطة GPS لسيارة", result: "يرى الموقع الحي للسيارة على الخريطة" },
      ]},
      { title: "تسويات السائقين", steps: [
        { action: "يفتح صفحة تسويات السائقين", result: "يرى الرحلات المنتهية ومبالغ كل سائق المستحقة" },
        { action: "ينشئ تسوية لسائق", result: "يُسجَّل المبلغ المستحق ويُحوَّل لقسم المالية للصرف" },
      ]},
    ]
  },
  {
    role: "warehouse", ar: "أمين المستودع", color: "bg-green-100 text-green-800", icon: Package,
    sections: [
      { title: "إصدار فواتير التحميل", steps: [
        { action: "يفتح بوابة المستودع (/warehouse)", result: "يرى الطلبات التي عُيِّنت لها سيارة وجاهزة للتحميل" },
        { action: "يضغط 'إصدار فاتورة تحميل'", result: "تُنشأ فاتورة رسمية بضريبة 15% — الحالة تصبح invoiced — إشعار للسائق" },
        { action: "يطبع أمر التحميل", result: "يُعطيه للسائق لاصطحابه عند الانطلاق" },
      ]},
      { title: "إدارة المخزون", steps: [
        { action: "يرى مستويات المخزون الحالية", result: "يعرض الكميات لكل منتج في كل فرع" },
        { action: "يسجّل استلام بضاعة واردة", result: "الكميات تُضاف للمخزون تلقائياً ويُسجَّل الوارد" },
        { action: "الكمية تقترب من الحد الأدنى", result: "تنبيه أحمر تلقائي لطلب توريد جديد" },
      ]},
      { title: "الطلبات الداخلية", steps: [
        { action: "يفتح صفحة الطلبات الداخلية", result: "يرى طلبات نقل المخزون بين الفروع أو الأقسام" },
        { action: "يؤكد استلام طلب داخلي", result: "المخزون يُحدَّث تلقائياً في الفرعين (الصادر والوارد)" },
      ]},
    ]
  },
  {
    role: "driver", ar: "السائق", color: "bg-yellow-100 text-yellow-800", icon: Truck,
    sections: [
      { title: "تنفيذ الرحلة", steps: [
        { action: "يفتح بوابة السائق (/driver)", result: "يرى طلبه الحالي مع تفاصيل الحمولة والعميل والوجهة" },
        { action: "يضغط 'تأكيد التحميل' + يرفع صورة", result: "الحالة تصبح loaded — العميل والمندوب يرون: اللوحة + هاتفه + رابط WhatsApp" },
        { action: "يصل للعميل ويضغط 'تأكيد التسليم'", result: "الحالة تصبح delivered — السيارة تتحرر تلقائياً — العميل يقيّم ويحمّل الفاتورة" },
      ]},
      { title: "الأعطال والمطالبات", steps: [
        { action: "يضغط 'إبلاغ عن عطل'", result: "يصف العطل ويرفع صورة — يصل إشعار فوري لمدير الورشة" },
        { action: "يفتح صفحة المطالبات (/reimbursement)", result: "يُدخل مصاريفه اليومية (وقود/طوارئ) — تدخل دورة الاعتماد للصرف" },
      ]},
      { title: "وثائقه الشخصية", steps: [
        { action: "يرى حالة وثائقه", result: "يعرض رخصة القيادة + الإقامة + البطاقة الصحية مع تواريخ الانتهاء" },
        { action: "يطلب تجديد وثيقة", result: "يُنشأ طلب تجديد يتابعه المسؤول ويُحدّثه" },
      ]},
    ]
  },
  {
    role: "rep", ar: "المندوب", color: "bg-pink-100 text-pink-800", icon: UserCheck,
    sections: [
      { title: "متابعة العملاء والطلبات", steps: [
        { action: "يفتح بوابة المندوب (/rep)", result: "يرى عملاءه الحاليين وطلباتهم الجارية والمنتهية" },
        { action: "يختار عميلاً من القائمة", result: "يرى الحالة الحية لجميع طلبات العميل المرتبطة به" },
        { action: "يرى كشف حساب العميل", result: "يعرض الرصيد + المستحقات + سجل كل المعاملات" },
      ]},
      { title: "الطلبات الآجلة والأهداف", steps: [
        { action: "يستقبل طلب آجل من المراجع للاعتماد", result: "يُراجع حد ائتمان العميل ويوافق أو يرفض" },
        { action: "يفتح صفحة الأهداف", result: "يرى أهداف المبيعات الشهرية ومدى تحقيقها" },
        { action: "يرى إحصائيات مبيعاته", result: "يعرض مجموع مبيعاته + عدد الطلبات + معدل التسليم" },
      ]},
    ]
  },
  {
    role: "workshop_manager", ar: "مدير الورشة", color: "bg-red-100 text-red-800", icon: Wrench,
    sections: [
      { title: "بلاغات الأعطال وأوامر العمل", steps: [
        { action: "يفتح إدارة الورشة (/workshop-manager)", result: "يرى بلاغات الأعطال المفتوحة + أوامر العمل الجارية" },
        { action: "يفتح بلاغ عطل من السائق", result: "يرى وصف العطل + صورته + بيانات السيارة" },
        { action: "يضغط 'إنشاء أمر عمل' من البلاغ", result: "يُنشأ أمر عمل مرتبط تلقائياً ببيانات المركبة والعطل" },
        { action: "يُحدد مصدر التكلفة في الأمر", result: "inventory: يخصم من مستودع الورشة | vehicle: يُضيف للسجل المالي للسيارة" },
        { action: "يُغلق أمر العمل بالتكلفة الفعلية", result: "التكاليف تُسجَّل — الكميات تُخصم من المخزون — السيارة تعود للخدمة" },
      ]},
      { title: "بطاقات الصيانة (كارت)", steps: [
        { action: "يضيف كارت صيانة جديد", result: "رقم تسلسلي يُنشأ تلقائياً — يختار: سيارة/تيدر + وقت الدخول والخروج" },
        { action: "يختار الفنيين وقطع الغيار والكفرات", result: "الكميات تُخصم من مستودع الورشة عند الحفظ" },
        { action: "لوحة غير موجودة في الأسطول", result: "يُعلَّم الكارت تلقائياً 'سيارة خارجية' بمؤشر بصري" },
      ]},
      { title: "طلبات الشراء", steps: [
        { action: "الكمية تصل للحد الأدنى", result: "تنبيه أحمر يظهر على صنف المخزون — ينشئ طلب شراء" },
        { action: "يُنشئ طلب شراء قطعة غيار", result: "الطلب ينتقل لقسم المشتريات للاعتماد" },
      ]},
    ]
  },
  {
    role: "purchasing", ar: "مسئول المشتريات", color: "bg-teal-100 text-teal-800", icon: CreditCard,
    sections: [
      { title: "اعتماد طلبات الشراء", steps: [
        { action: "يفتح المشتريات (/purchasing)", result: "يرى طلبات الشراء المعلقة من الورشة مع تفاصيل الصنف والكمية" },
        { action: "يضغط 'اعتماد' على طلب", result: "الطلب ينتقل لحالة approved — إشعار لمدير الورشة بالاعتماد" },
        { action: "يضغط 'رفض' ويكتب السبب", result: "الطلب يُرفض — إشعار لمدير الورشة مع سبب الرفض" },
      ]},
      { title: "الاستلام وتحديث المخزون", steps: [
        { action: "يسجّل استلام الأصناف المشتراة", result: "الكميات تُضاف تلقائياً لمستودع الورشة — الطلب يُغلق" },
        { action: "يرى تقرير المخزون الكامل", result: "عرض شامل لكل الأصناف مع مستويات المخزون الحالية" },
      ]},
    ]
  },
  {
    role: "admin", ar: "المدير", color: "bg-purple-100 text-purple-800", icon: Shield,
    sections: [
      { title: "لوحة الإدارة والمستخدمون", steps: [
        { action: "يفتح لوحة الإدارة (/admin)", result: "يرى إحصائيات شاملة: الطلبات + المستخدمين + الإيرادات + حالة الأسطول" },
        { action: "يُنشئ مستخدماً جديداً (/users)", result: "يُدخل الاسم + الهاتف + الدور + كلمة المرور — الحساب جاهز فوراً" },
        { action: "يُعطّل حساب مستخدم", result: "يُمنع من الدخول فوراً دون حذف بياناته" },
        { action: "يُعدّل أي طلب في أي مرحلة", result: "صلاحية admin-edit تتجاوز قيود الأدوار العادية" },
      ]},
      { title: "التقارير والنظام", steps: [
        { action: "يفتح التقارير (/reports)", result: "تقارير مبيعات + أسطول + موظفين + مالية — قابلة للتصدير Excel" },
        { action: "يراجع سجل النظام (/system-logs)", result: "يرى جميع العمليات مع الطابع الزمني والمستخدم المنفّذ" },
        { action: "يُشغّل المزامنة مع Supabase", result: "يُرسل نسخة كاملة من SQLite لـ Supabase كنسخة احتياطية — يرى أي أخطاء بالتفصيل" },
      ]},
      { title: "إعدادات الشركة", steps: [
        { action: "يفتح إعدادات الشركة (/company-settings)", result: "يُعدّل بيانات الشركة: الاسم + الشعار + الرقم الضريبي + CR + الفروع" },
        { action: "يُضيف فرعاً جديداً", result: "الفرع يظهر فوراً في خيارات الفواتير والمخزون" },
      ]},
    ]
  },
];

const recentUpdates = [
  {
    version: "2.7.0", date: "يوليو 2026",
    changes: [
      "إضافة قسم 'دليل كل دور' — خطوات تفصيلية لكل مستخدم مع النتيجة المتوقعة",
      "حذف ملف HTML الزائد وتوحيد الدليل داخل صفحة النظام",
    ]
  },
  {
    version: "2.6.0", date: "يونيو 2026",
    changes: [
      "دعم التيدر (مقطورة) في سجل الصيانة — toggle سيارة/تيدر + حقلا رقم ونوع التيدر",
      "مؤشر 'سيارة خارجية عن الشركة' عند إدخال لوحة غير موجودة في الأسطول",
      "نافذة مصادقة للزوار غير المسجلين عند الضغط على 'أضف للسلة'",
      "شارة تنبيه بالكارت الأصفر في صفحة السلة للعميل غير المسجل",
      "تحسين صفحة دليل النظام: زر طباعة منفصل + زر PDF منفصل",
    ]
  },
  {
    version: "2.5.x", date: "مايو 2026",
    changes: [
      "سجل الرحلات الكامل في تحليلات السيارات — CRUD مباشر من الصفحة",
      "أنواع الصيانة قابلة للتخصيص محلياً (localStorage) مع إضافة/تعديل/حذف",
      "سجل عمليات المخزون (workshop_inventory_transactions) مع رسم بياني",
      "تكامل أوسع بين بلاغ العطل وأمر العمل (ربط تلقائي)",
    ]
  },
  {
    version: "2.4.x", date: "أبريل 2026",
    changes: [
      "وحدة تقرير الأعطال الكامل للسائق (DriverBreakdownReport)",
      "إضافة حقول الكفرات لسجل الصيانة مع 6 مواضع وحالة لكل كفر",
      "صفحة استعاضة المصاريف (Reimbursement) للسائقين",
      "طباعة كارت الصيانة فردياً أو جماعياً بصيغة A4",
    ]
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SystemGuidePage() {
  const [, navigate] = useLocation();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    const prev = document.title;
    document.title = `دليل-منصة-MKGH-${VERSION}-${LAST_UPDATED}`;
    window.print();
    setTimeout(() => { document.title = prev; }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white" dir="rtl">

      {/* ── Top bar (hidden in print) ── */}
      <div className="print:hidden sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-5 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate("/company-settings")}
              className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 shrink-0">
              <ArrowRight size={18} />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen size={20} className="text-[#103c68] shrink-0" />
              <h1 className="font-black text-gray-800 text-lg truncate">دليل النظام الشامل</h1>
              <span className="text-xs bg-[#103c68]/10 text-[#103c68] px-2 py-0.5 rounded-full font-bold shrink-0">v{VERSION}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/erp-guide/"
              target="_blank"
              rel="noopener noreferrer"
              title="عرض البريزنتيشن التشغيلي"
              className="flex items-center gap-1.5 px-3 py-2 bg-[#0eb5cb] hover:bg-[#0ca0b4] text-white rounded-xl text-sm font-bold transition-colors no-underline"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21l3-3 3 3"/></svg>
              <span className="hidden sm:inline">دليل التشغيل</span>
            </a>
            <a
              href="/api/public/system-guide.html"
              target="_blank"
              rel="noopener noreferrer"
              title="فتح الدليل كصفحة مستقلة"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors no-underline"
            >
              <BookOpen size={15} />
              <span className="hidden sm:inline">الدليل الكامل</span>
            </a>
            <button
              onClick={handlePrint}
              title="طباعة الدليل"
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors"
            >
              <Printer size={15} />
              <span className="hidden sm:inline">طباعة</span>
            </button>
            <button
              onClick={handleExportPDF}
              title="تصدير PDF — في نافذة الطباعة اختر 'حفظ كـ PDF'"
              className="flex items-center gap-1.5 px-3 py-2 bg-[#103c68] hover:bg-[#0d3057] text-white rounded-xl text-sm font-bold transition-colors"
            >
              <FileDown size={15} />
              <span className="hidden sm:inline">تصدير PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Print-only header ── */}
      <div className="hidden print:flex items-center justify-between mb-6 pb-4 border-b-2 border-[#103c68]/20">
        <div>
          <div className="text-2xl font-black text-[#103c68]">دليل منصة MKGH</div>
          <div className="text-sm text-gray-500">نظام ERP اللوجستي — الإصدار {VERSION} — {LAST_UPDATED}</div>
        </div>
        <div className="text-xs text-gray-400 text-left">
          <div>تاريخ الطباعة: {new Date().toLocaleDateString("ar-SA")}</div>
          <div>jefer-mkgh.com</div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div ref={printRef} className="max-w-5xl mx-auto px-5 py-8 print:py-2 print:px-0">

        {/* Cover */}
        <div className="text-center mb-10 print:mb-6 pb-8 border-b-2 border-[#103c68]/20 print:hidden">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-[#103c68] rounded-3xl mb-4">
            <BookOpen size={36} className="text-white" />
          </div>
          <h1 className="text-4xl font-black text-[#103c68] mb-2">دليل منصة MKGH</h1>
          <p className="text-lg text-gray-500 mb-1">نظام ERP اللوجستي المتكامل — مواد البناء والأسمنت</p>
          <p className="text-sm text-gray-400 mb-5">
            الإصدار <strong className="text-[#103c68]">{VERSION}</strong> — آخر تحديث: <strong>{LAST_UPDATED}</strong>
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <span className="bg-[#103c68]/10 text-[#103c68] px-3 py-1 rounded-full font-bold">jefer-mkgh.com</span>
            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full">Express 5 + SQLite + Supabase</span>
            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full">React + Vite + TailwindCSS</span>
            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full">PWA — يعمل بدون إنترنت</span>
            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full">9 أدوار + صلاحيات دقيقة</span>
          </div>
        </div>

        {/* ── 1. Overview ── */}
        <Section id="overview" title="نظرة عامة" icon={BookOpen} color="border-[#103c68] text-[#103c68]">
          <p className="text-gray-700 leading-8 mb-5">
            منصة <strong>MKGH</strong> هي نظام ERP متكامل مخصص لشركات مواد البناء (أسمنت، رمل، حجر، بلوك).
            تربط المنصة جميع أطراف العملية اللوجستية — العميل، المراجع المالي، مشرف النقليات،
            أمين المستودع، السائق، مدير الورشة، وقسم المشتريات — في تدفق واحد متصل
            من لحظة تقديم الطلب حتى التسليم الفعلي للبضاعة وإصدار الفاتورة الضريبية.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { n: "9",   label: "أدوار وظيفية",           bg: "bg-purple-50 text-purple-700" },
              { n: "40+", label: "صفحة وظيفية",            bg: "bg-blue-50 text-blue-700" },
              { n: "20+", label: "جدول في قاعدة البيانات", bg: "bg-teal-50 text-teal-700" },
              { n: "60+", label: "نقطة API",                bg: "bg-orange-50 text-orange-700" },
            ].map(c => (
              <div key={c.n} className={`rounded-2xl p-4 text-center ${c.bg}`}>
                <div className="text-3xl font-black">{c.n}</div>
                <div className="text-xs mt-1 font-medium">{c.label}</div>
              </div>
            ))}
          </div>
          <InfoBox color="bg-blue-50 border-blue-200 text-blue-800">
            <strong>البنية التقنية:</strong> pnpm monorepo حزمتان —
            <Tag text="api-server" /> (Express 5 + SQLite) و <Tag text="erp-arabic" /> (React + Vite + TailwindCSS).
            النسخ الاحتياطي التلقائي يعمل على Supabase PostgreSQL عند كل عملية كتابة.
          </InfoBox>
        </Section>

        {/* ── 2. Roles ── */}
        <Section id="roles" title="الأدوار والصلاحيات" icon={Users} color="border-purple-500 text-purple-700">
          <p className="text-sm text-gray-500 mb-4">
            كل مستخدم له دور وحيد يحدد الصفحات المتاحة له. الصلاحيات تُحسب لحظياً عبر دالة
            <Tag text="canAccess()" /> الموجودة في <Tag text="AuthContext" />.
          </p>
          <div className="space-y-3">
            {roles.map((r, i) => (
              <div key={r.role} className={`rounded-xl border border-gray-100 overflow-hidden ${i%2===0?"bg-white":"bg-gray-50/30"}`}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-50">
                  <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{r.role}</code>
                  <Badge text={r.ar} cls={r.color} />
                  <span className="font-mono text-xs text-gray-500 ltr">{r.phone}</span>
                  <span className="font-mono text-xs text-gray-400">· {r.pass}</span>
                </div>
                <div className="px-4 py-2.5">
                  <p className="text-sm text-gray-700 mb-1.5"><strong>الصلاحية:</strong> {r.access}</p>
                  <p className="text-xs text-gray-500">
                    <strong>الصفحات:</strong> {r.pages.join(" · ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 3. Order Workflow ── */}
        <Section id="workflow" title="دورة حياة الطلب" icon={ShoppingCart} color="border-emerald-500 text-emerald-700">
          <p className="text-sm text-gray-500 mb-4">
            رقم الطلب بصيغة: <Tag text="MKGH + YYYYMMDDHHmmss" /> — مثال:
            <Tag text="MKGH20260505120305" />
          </p>
          <div className="space-y-2 mb-6">
            {orderStages.map((s, i) => (
              <div key={s.key} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-white">
                <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{i+1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge text={s.ar} cls={s.color} />
                    <span className="text-sm text-gray-600">← <strong>{s.actor}</strong>: {s.action}</span>
                  </div>
                  <p className="text-xs text-gray-400">{s.details}</p>
                </div>
                {i < orderStages.length - 1 && (
                  <div className="text-gray-300 text-lg shrink-0 pt-1">↓</div>
                )}
              </div>
            ))}
          </div>
          <InfoBox color="bg-emerald-50 border-emerald-200 text-emerald-700">
            <strong className="text-emerald-800">ضريبة القيمة المضافة:</strong> 15% محسوبة تلقائياً — كل طلب يحفظ
            <Tag text="total_before_vat" /> + <Tag text="vat_amount" /> + <Tag text="total_with_vat" />.
            الفاتورة الضريبية قابلة للتنزيل بعد التسليم.
          </InfoBox>
        </Section>

        {/* ── 4. Role-by-role guide ── */}
        <Section id="role-guide" title="دليل كل دور — خطوة بخطوة" icon={UserCheck} color="border-indigo-500 text-indigo-700">
          <p className="text-sm text-gray-500 mb-5">
            ماذا يفعل كل مستخدم بالضبط وماذا يحدث كنتيجة لكل إجراء.
          </p>
          <div className="space-y-5">
            {roleGuides.map(g => (
              <div key={g.role} className="border border-gray-100 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <g.icon size={16} className="text-gray-500" />
                  <Badge text={g.ar} cls={g.color} />
                  <code className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-mono mr-auto">{g.role}</code>
                </div>
                <div className="divide-y divide-gray-100">
                  {g.sections.map((sec, si) => (
                    <div key={si}>
                      <div className="px-4 py-2 bg-gray-50/80 border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{sec.title}</span>
                      </div>
                      {sec.steps.map((s, i) => (
                        <div key={i} className="grid sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-gray-50 border-b border-gray-50 last:border-b-0">
                          <div className="flex items-start gap-2.5 px-4 py-2.5">
                            <span className="w-5 h-5 rounded-full bg-[#103c68]/10 text-[#103c68] text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                            <p className="text-sm text-gray-700">{s.action}</p>
                          </div>
                          <div className="flex items-start gap-2 px-4 py-2.5 bg-emerald-50/40">
                            <CheckCircle size={13} className="text-emerald-500 shrink-0 mt-1" />
                            <p className="text-xs text-gray-600 leading-5">{s.result}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 5. Workshop Detail ── */}
        <Section id="workshop" title="وحدة الورشة والصيانة" icon={Wrench} color="border-red-500 text-red-700">
          <SubSection title="سجل الصيانة (كارت الصيانة)">
            <p className="text-sm text-gray-600 mb-3">
              كل كارت صيانة يمثل زيارة مركبة للورشة ويحمل رقماً فريداً. يشمل:
            </p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {[
                { label: "رقم الكارت", desc: "رقم تسلسلي فريد يُولّد تلقائياً بناءً على آخر رقم مستخدم" },
                { label: "نوع المركبة", desc: "سيارة من الأسطول أو تيدر/مقطورة (برقم ونوع التيدر)" },
                { label: "السيارة الخارجية", desc: "إذا أُدخل رقم لوحة غير موجود في الأسطول يُعلَّم تلقائياً 'خارجي'" },
                { label: "وقت الدخول/الخروج", desc: "تسجيل دقيق لزمن الصيانة لكل كارت" },
                { label: "الفنيون المنفذون", desc: "multi-select من قائمة الفنيين مع إمكانية إضافة فني مؤقت" },
                { label: "الكفرات", desc: "6 مواضع كفرات (أمامي/خلفي أيسر/أيمن داخلي/خارجي) مع حالة كل كفر" },
                { label: "التكلفة المفصّلة", desc: "ميكانيكي + كهرباء + مستلزمات (salvage) كل بند منفصل" },
                { label: "قطع الغيار", desc: "اختيار من مستودع الورشة مع خصم تلقائي للكميات عند الحفظ" },
              ].map(item => (
                <div key={item.label} className="flex gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="w-1 h-full min-h-[20px] bg-red-200 rounded-full shrink-0 mt-1" />
                  <div>
                    <div className="font-bold text-gray-700">{item.label}</div>
                    <div className="text-gray-500 mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="أوامر العمل (Workshop Jobs)">
            <p className="text-sm text-gray-600">
              أوامر العمل تُنشأ إما من بلاغ عطل مباشر أو يدوياً. حقل
              <Tag text="invoice_target" /> يحدد إن كانت التكلفة على السيارة أم تُخصم من مستودع الورشة.
              الحالات: <Badge text="مفتوح" cls="bg-red-100 text-red-700" /> →
              <Badge text="قيد العمل" cls="bg-yellow-100 text-yellow-700" /> →
              <Badge text="مكتمل" cls="bg-green-100 text-green-700" />
            </p>
          </SubSection>

          <SubSection title="مستودع الورشة وطلبات الشراء">
            <p className="text-sm text-gray-600">
              كل قطعة غيار لها حد إنذار (<Tag text="min_stock" />). عند الوصول لهذا الحد تظهر تنبيهات.
              مدير الورشة ينشئ طلب شراء → المشتريات تعتمد → عند الاستلام تُضاف الكميات للمخزون تلقائياً.
            </p>
          </SubSection>
        </Section>

        {/* ── 5. Modules ── */}
        <Section id="modules" title="وحدات النظام والصفحات" icon={BarChart3} color="border-blue-500 text-blue-700">
          <div className="space-y-5">
            {modules.map(mod => (
              <div key={mod.name} className="border border-gray-100 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <mod.icon size={16} className={mod.color} />
                  <h3 className="font-black text-gray-800 text-sm">{mod.name}</h3>
                  <span className="text-xs text-gray-400 mr-auto">{mod.desc}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {mod.pages.map(p => (
                    <div key={p.path} className="flex items-start gap-3 px-4 py-3">
                      <code className="text-xs bg-[#103c68]/8 text-[#103c68] px-2 py-0.5 rounded font-mono whitespace-nowrap shrink-0 mt-0.5">{p.path}</code>
                      <div>
                        <span className="font-bold text-gray-800 text-sm">{p.label}</span>
                        <p className="text-gray-500 text-xs mt-0.5 leading-5">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── HR ── */}
        <Section id="hr" title="الموارد البشرية والموظفين" icon={UserCheck} color="border-indigo-500 text-indigo-700">
          <SubSection title="ملفات الموظفين">
            <div className="space-y-2">
              {[
                { badge: "قائمة الموظفين", cls: "bg-blue-100 text-blue-800", desc: "كل الموظفين مع: المسمى الوظيفي، القسم، تاريخ التعيين، الراتب، حالة الوثائق" },
                { badge: "إضافة موظف", cls: "bg-green-100 text-green-800", desc: "يُدخل بيانات الموظف الكاملة ← يُنشأ ملف رسمي في النظام" },
                { badge: "تعديل", cls: "bg-orange-100 text-orange-800", desc: "تحديث الراتب، القسم، المسمى، الوثائق" },
              ].map((r,i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Badge text={r.badge} cls={r.cls} />
                  <span className="text-gray-600">{r.desc}</span>
                </div>
              ))}
            </div>
          </SubSection>
          <SubSection title="طلبات الموارد البشرية">
            <div className="space-y-2">
              {[
                { badge: "أنواع الطلبات", cls: "bg-blue-100 text-blue-800", desc: "إجازة سنوية / مرضية / طارئة / سلفة / شهادة عمل / غيرها" },
                { badge: "رفع طلب", cls: "bg-green-100 text-green-800", desc: "الموظف يرفع طلبه من بوابته ← يُشعَر المدير فوراً" },
                { badge: "اعتماد / رفض", cls: "bg-purple-100 text-purple-800", desc: "المدير يوافق أو يرفض مع إضافة ملاحظة ← الموظف يُشعَر بالنتيجة" },
              ].map((r,i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Badge text={r.badge} cls={r.cls} />
                  <span className="text-gray-600">{r.desc}</span>
                </div>
              ))}
            </div>
          </SubSection>
          <SubSection title="بوابة الموظف (Self-Service)">
            <div className="space-y-2">
              {[
                { badge: "راتبي", cls: "bg-blue-100 text-blue-800", desc: "يرى تفاصيل راتبه الشهري والخصومات والبدلات" },
                { badge: "طلباتي", cls: "bg-green-100 text-green-800", desc: "يرفع طلباته ويتابع حالتها" },
                { badge: "مصروفاتي", cls: "bg-orange-100 text-orange-800", desc: "يرفع مصروفات العهدة (Petty Cash) ← المحاسب يعتمدها ويصرفها" },
              ].map((r,i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Badge text={r.badge} cls={r.cls} />
                  <span className="text-gray-600">{r.desc}</span>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* ── Finance ── */}
        <Section id="finance" title="المالية والتقارير" icon={CreditCard} color="border-yellow-500 text-yellow-700">
          <SubSection title="التقارير المالية المتاحة">
            <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 font-bold text-gray-600">التقرير</th>
                    <th className="px-4 py-2.5 font-bold text-gray-600">يعرض</th>
                    <th className="px-4 py-2.5 font-bold text-gray-600">يُصدَّر</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["تقرير المبيعات", "إجمالي الإيرادات حسب الفترة والمنتج والعميل", "Excel / طباعة"],
                    ["كشف حساب العميل", "كل معاملات عميل محدد والرصيد", "PDF مطبوع"],
                    ["تقرير الرحلات", "تكلفة كل رحلة، التعريفة، صافي الربح", "Excel"],
                    ["فاتورة ضريبة القيمة المضافة", "فاتورة رسمية بضريبة 15٪", "PDF"],
                    ["تقرير مصروفات الورشة", "تكاليف الصيانة حسب المركبة والفترة", "Excel"],
                    ["تقرير السائقين", "الرحلات، التسويات، المدفوعات لكل سائق", "Excel"],
                  ].map(([name, desc, export_], i) => (
                    <tr key={i} className={`border-b border-gray-50 ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                      <td className="px-4 py-2 font-bold text-gray-700 text-xs whitespace-nowrap">{name}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{desc}</td>
                      <td className="px-4 py-2 text-xs"><Badge text={export_} cls="bg-green-100 text-green-800" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SubSection>
          <SubSection title="الإعدادات المالية">
            <div className="space-y-2">
              {[
                { badge: "نسبة ضريبة القيمة المضافة", cls: "bg-purple-100 text-purple-800", desc: "مُعيَّنة 15٪ (المعدل السعودي) — تُطبَّق تلقائياً على كل الفواتير" },
                { badge: "أسعار الكيلومتر", cls: "bg-blue-100 text-blue-800", desc: "إعداد سعر الكيلومتر لكل نوع مركبة — يُستخدم لحساب التعريفة تلقائياً" },
                { badge: "معاملات الطريق", cls: "bg-orange-100 text-orange-800", desc: "معاملات مضاعفة التعريفة لطرق محددة (مثل القصيم ↔ المدينة)" },
              ].map((r,i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Badge text={r.badge} cls={r.cls} />
                  <span className="text-gray-600">{r.desc}</span>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* ── Notifications ── */}
        <Section id="notifications" title="نظام الإشعارات" icon={Bell} color="border-orange-500 text-orange-700">
          <p className="text-sm text-gray-500 mb-4">كل حدث مهم يُولّد إشعاراً فورياً للجهة المعنية داخل النظام</p>
          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 font-bold text-gray-600">الحدث</th>
                  <th className="px-4 py-2.5 font-bold text-gray-600">من يُشعَر</th>
                  <th className="px-4 py-2.5 font-bold text-gray-600">وقت الإشعار</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["طلب جديد من عميل", "المراجعون + المدير", "فوري"],
                  ["تأكيد الدفع", "المشرف", "فوري"],
                  ["تعيين سيارة وسائق", "السائق + المستودع", "فوري"],
                  ["السيارة محمَّلة", "العميل + المندوب", "فوري"],
                  ["تم التسليم", "العميل + المدير", "فوري"],
                  ["رفع حوالة بنكية", "المراجعون", "فوري"],
                  ["بلاغ عطل", "مدير الورشة", "فوري"],
                  ["طلب شراء جديد", "مسؤول المشتريات", "فوري"],
                  ["انتهاء وثيقة مركبة (30 يوم)", "المدير", "يومي"],
                  ["انتهاء رخصة سائق (30 يوم)", "المدير", "يومي"],
                  ["طلب شراء مُعتمَد", "مدير الورشة", "فوري"],
                  ["مخزون نازل عن الحد الأدنى", "مدير الورشة", "عند التحديث"],
                ].map(([event, who, when], i) => (
                  <tr key={i} className={`border-b border-gray-50 ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                    <td className="px-4 py-2 text-gray-700 text-xs">{event}</td>
                    <td className="px-4 py-2 text-gray-600 text-xs">{who}</td>
                    <td className="px-4 py-2 text-xs">
                      <Badge text={when} cls={when==="فوري"?"bg-green-100 text-green-800":"bg-blue-100 text-blue-800"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-xs text-green-800">
            <strong>الإشعارات داخلية تماماً:</strong> تظهر في جرس الإشعارات داخل النظام — لا تحتاج اتصالاً بالإنترنت الخارجي أو SMS
          </div>
        </Section>

        {/* ── Quick Reference ── */}
        <Section id="quickref" title="مرجع سريع — الحالات والمعاني" icon={CheckCircle} color="border-gray-400 text-gray-600">
          <SubSection title="حالات الطلب">
            <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 font-bold text-gray-600">الحالة (بالنظام)</th>
                    <th className="px-4 py-2.5 font-bold text-gray-600">المعنى</th>
                    <th className="px-4 py-2.5 font-bold text-gray-600">من يغيّرها</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["pending", "🟡 معلّق — بانتظار مراجعة الدفع", "تلقائي عند الطلب"],
                    ["payment_confirmed", "🔵 مؤكد الدفع — بانتظار سيارة", "المراجع"],
                    ["vehicle_assigned", "🟢 سيارة مُعيَّنة — بانتظار التحميل", "المشرف"],
                    ["invoiced", "🟣 تم التفويت — جاهز للتحميل", "المستودع"],
                    ["loaded", "🚛 في الطريق — السيارة محمّلة", "السائق"],
                    ["delivered", "✅ تم التسليم — منتهي", "السائق"],
                    ["cancelled", "❌ ملغي", "المدير"],
                  ].map(([status, meaning, who], i) => (
                    <tr key={i} className={`border-b border-gray-50 ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                      <td className="px-4 py-2 whitespace-nowrap"><code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{status}</code></td>
                      <td className="px-4 py-2 text-gray-700 text-xs">{meaning}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{who}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SubSection>
          <SubSection title="تنسيق رقم الطلب">
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
              <strong>MKGH + السنة + الشهر + اليوم + الساعة + الدقيقة + الثانية</strong><br/>
              <span className="text-xs mt-1 block">مثال: <code className="bg-blue-100 px-2 py-0.5 rounded font-mono">MKGH20260701143022</code> = طلب بتاريخ 1 يوليو 2026 الساعة 2:30:22 م</span>
            </div>
          </SubSection>
        </Section>

        {/* ── 6. Database ── */}
        <Section id="database" title="جداول قاعدة البيانات" icon={Database} color="border-teal-500 text-teal-700">
          <div className="flex flex-wrap gap-3 mb-4 text-sm text-gray-600">
            <span>قاعدة البيانات: <Tag text="SQLite via better-sqlite3" /></span>
            <span>الملف: <Tag text="artifacts/api-server/data/erp.db" /></span>
            <span>نسخ احتياطي: <Tag text="Supabase PostgreSQL" /></span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-bold text-gray-600 whitespace-nowrap">اسم الجدول</th>
                  <th className="px-4 py-3 font-bold text-gray-600">الوصف</th>
                  <th className="px-4 py-3 font-bold text-gray-600 hidden md:table-cell">الأعمدة الرئيسية</th>
                </tr>
              </thead>
              <tbody>
                {dbTables.map((t, i) => (
                  <tr key={t.name} className={`border-b border-gray-50 ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{t.name}</code>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs">{t.desc}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs font-mono hidden md:table-cell max-w-[220px] truncate" title={t.cols}>{t.cols}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── 7. API ── */}
        <Section id="api" title="نقاط API الرئيسية" icon={FileText} color="border-orange-500 text-orange-700">
          <div className="flex flex-wrap gap-3 mb-4 text-sm text-gray-600">
            <span>Base URL: <Tag text="https://jefer-mkgh.com/api/" /></span>
            <span>المصادقة: <Tag text="Authorization: Bearer <token>" /></span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
            <table className="w-full text-xs text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2.5 font-bold text-gray-600 w-16">Method</th>
                  <th className="px-3 py-2.5 font-bold text-gray-600">المسار</th>
                  <th className="px-3 py-2.5 font-bold text-gray-600">الوصف</th>
                </tr>
              </thead>
              <tbody>
                {apiEndpoints.map((ep, i) => (
                  <tr key={i} className={`border-b border-gray-50 ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                    <td className="px-3 py-2">
                      <Badge text={ep.method} cls={METHOD_COLOR[ep.method] ?? "bg-gray-100 text-gray-700"} />
                    </td>
                    <td className="px-3 py-2">
                      <code className="font-mono text-[#103c68] text-xs">{ep.path}</code>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{ep.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── 8. Tech Notes ── */}
        <Section id="tech" title="ملاحظات تقنية" icon={Shield} color="border-gray-400 text-gray-700">
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                title: "المصادقة والأمان",
                icon: Lock, color: "text-purple-600",
                items: [
                  "JWT tokens — صالحة 7 أيام، تُجدَّد تلقائياً",
                  "كلمات المرور مشفرة بـ bcrypt (10 rounds)",
                  "الصلاحيات تُحسب لحظياً بـ canAccess(role, page)",
                  "دالة guard() تمنع الوصول غير المصرح به على مستوى الـ route",
                  "نافذة GuestAuthModal للزوار غير المسجلين في الكتالوج",
                ]
              },
              {
                title: "PWA — يعمل بدون إنترنت",
                icon: Zap, color: "text-emerald-600",
                items: [
                  "Service Worker مع Cache-First للأصول الثابتة",
                  "Background Sync لإرسال البيانات حين يعود الاتصال",
                  "شريط OfflineBanner يظهر عند انقطاع الإنترنت",
                  "قابل للتثبيت على الشاشة الرئيسية (Add to Home Screen)",
                  "تحديث تلقائي عند توفر نسخة جديدة",
                ]
              },
              {
                title: "قاعدة البيانات والنسخ الاحتياطي",
                icon: Database, color: "text-teal-600",
                items: [
                  "SQLite محلي via better-sqlite3 — سريع وبدون خادم منفصل",
                  "PgMirror يرسل كل write إلى Supabase PostgreSQL في الخلفية",
                  "استعادة تلقائية من Supabase عند بدء التشغيل (cold start)",
                  "Migrations تُنفَّذ تلقائياً في db.ts مع كل تشغيل",
                  "فهارس على card_number, vehicle_plate, order_number لسرعة البحث",
                ]
              },
              {
                title: "البنية التقنية",
                icon: Boxes, color: "text-orange-600",
                items: [
                  "pnpm monorepo — حزمتان مستقلتان: api-server + erp-arabic",
                  "Express 5 + esbuild للخادم — يعمل على منفذ 8080",
                  "React 18 + Vite 5 + TailwindCSS 3 + wouter للواجهة",
                  "RTL عربي كامل — lang=ar dir=rtl في جميع الصفحات",
                  "Reverse proxy يوزّع /erp/ و /api/ على الخدمتين",
                ]
              },
              {
                title: "تتبع GPS",
                icon: MapPin, color: "text-blue-600",
                items: [
                  "تكامل مع Tawasolmap / Wialon API",
                  "كل سيارة في fleet_vehicles لها gps_device_id قابل للتعديل",
                  "خريطة مباشرة في صفحة المشرف والعميل (رحلة مفتوحة)",
                  "الإحداثيات تُحدَّث كل 30 ثانية خلال الرحلة",
                  "عرض مسار كامل للرحلة بعد اكتمالها",
                ]
              },
              {
                title: "الفواتير والمالية",
                icon: DollarSign, color: "text-violet-600",
                items: [
                  "VAT 15% محسوب تلقائياً — الأعداد الثلاثة دائماً متزامنة",
                  "فاتورة ضريبية PDF مُنشأة server-side، قابلة للتنزيل",
                  "كشف حساب تفصيلي لكل عميل بجميع الطلبات والمدفوعات",
                  "سندات قبض وصرف + إدارة الخزينة بأرصدة متعددة",
                  "دعم متعدد الفروع — كل فرع كيان مستقل",
                ]
              },
              {
                title: "الإشعارات",
                icon: Bell, color: "text-amber-600",
                items: [
                  "نظام إشعارات داخلي بين جميع الأدوار",
                  "Polling كل 30 ثانية لجلب الإشعارات الجديدة",
                  "شارة عداد الإشعارات في شريط التنقل",
                  "إشعار تلقائي عند انتقال الطلب لمرحلة جديدة",
                  "إشعار لمدير الورشة عند وصول مخزون لحد الإنذار",
                ]
              },
              {
                title: "التقارير والتصدير",
                icon: BarChart3, color: "text-indigo-600",
                items: [
                  "تصدير Excel من جميع جداول البيانات الرئيسية",
                  "طباعة كارت الصيانة فردياً أو جماعياً (PDF A4)",
                  "تقارير مبيعات قابلة للفلترة بالفترة والمنتج والعميل",
                  "رسوم بيانية للرحلات والمصاريف والأعطال عبر الزمن",
                  "إمكانية استيراد بيانات من Excel (maintenance logs, trips)",
                ]
              },
            ].map(card => (
              <div key={card.title} className="border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <card.icon size={16} className={card.color} />
                  <h3 className="font-black text-gray-800 text-sm">{card.title}</h3>
                </div>
                <ul className="space-y-1.5">
                  {card.items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="text-gray-300 mt-0.5 shrink-0">•</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 9. Recent Updates ── */}
        <Section id="updates" title="آخر التحديثات" icon={RefreshCw} color="border-emerald-400 text-emerald-700">
          <p className="text-sm text-gray-500 mb-4">
            سجل التغييرات المُضافة للمنصة — يُحدَّث مع كل إصدار جديد.
          </p>
          <div className="space-y-4">
            {recentUpdates.map((u, i) => (
              <div key={u.version} className={`border rounded-2xl overflow-hidden ${i===0 ? "border-emerald-200" : "border-gray-100"}`}>
                <div className={`flex items-center gap-3 px-4 py-3 ${i===0 ? "bg-emerald-50" : "bg-gray-50"}`}>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-full ${i===0 ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700"}`}>
                    v{u.version}
                  </span>
                  <span className="text-sm font-semibold text-gray-700">{u.date}</span>
                  {i===0 && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">الأحدث</span>}
                </div>
                <ul className="divide-y divide-gray-50">
                  {u.changes.map((c, j) => (
                    <li key={j} className="flex items-start gap-2.5 px-4 py-2.5 text-sm text-gray-700">
                      <CheckCircle size={14} className={`shrink-0 mt-0.5 ${i===0 ? "text-emerald-500" : "text-gray-300"}`} />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Footer */}
        <div className="text-center pt-8 border-t border-gray-100 text-xs text-gray-400 space-y-1">
          <p className="font-semibold text-gray-500">منصة MKGH — نظام ERP اللوجستي المتكامل</p>
          <p>الإصدار {VERSION} — {LAST_UPDATED}</p>
          <p>تاريخ طباعة هذا الدليل: {new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </div>

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 15mm; }

          /* ── 0. Watermark — appears centered on every printed page ── */
          body::before {
            content: '';
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-35deg);
            width: 420px;
            height: 210px;
            background-image: url('/erp/jefer-logo-new.png');
            background-repeat: no-repeat;
            background-size: contain;
            background-position: center;
            opacity: 0.07;
            z-index: 9999;
            pointer-events: none;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── 1. Reset the App layout wrapper that clips to one screen height ── */
          html, body, #root {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: white !important;
          }

          /* The sidebar layout: "flex h-screen overflow-hidden" */
          .h-screen {
            height: auto !important;
          }

          /* The scroll container: "flex-1 overflow-y-auto" */
          .overflow-y-auto,
          .overflow-y-scroll {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }

          /* Any remaining overflow containers */
          .overflow-hidden,
          .overflow-x-auto,
          .overflow-auto {
            overflow: visible !important;
          }

          /* ── 2. Colour fidelity ── */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body { font-size: 10pt !important; }

          /* ── 3. Hide / show elements ── */
          .print\\:hidden { display: none !important; }

          /* ── 4. Fix sticky nav bar ── */
          .sticky { position: static !important; top: auto !important; z-index: auto !important; }

          /* ── 5. Expand width to fill A4 ── */
          .max-w-5xl, .max-w-4xl, .max-w-3xl, .max-w-2xl, .max-w-xl {
            max-width: 100% !important;
          }

          /* ── 6. Tables ── */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto;
          }
          thead { display: table-header-group; }
          tr    { page-break-inside: avoid; }
          td, th { padding: 3px 7px !important; font-size: 9pt !important; }

          /* ── 7. Grid → single column for A4 ── */
          .grid { display: block !important; }
          .grid > * { margin-bottom: 8px !important; width: 100% !important; }

          /* ── 8. Page breaks ── */
          h2 { page-break-after: avoid; margin-top: 12pt !important; }
          h3 { page-break-after: avoid; }
          section { page-break-before: auto; }

          /* ── 9. Strip shadows / heavy radius ── */
          * { box-shadow: none !important; }
          .rounded-xl, .rounded-2xl, .rounded-3xl { border-radius: 4px !important; }
        }
      `}</style>
    </div>
  );
}
