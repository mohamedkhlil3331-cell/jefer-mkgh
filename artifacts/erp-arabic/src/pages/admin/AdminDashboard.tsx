import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Users, Package, Truck, DollarSign, Plus, Pencil, Trash2,
  LayoutDashboard, Warehouse, ClipboardCheck, BarChart3,
  Tag, MapPin, Car, CalendarDays, Bell, Shield, ArrowLeft,
  RefreshCw, CheckCircle, Clock, XCircle, TrendingUp,
  ChevronRight, Building2,
} from "lucide-react";

interface Stats { total: number; pending: number; delivered: number; revenue: number; cancelled: number; }
interface User  { id: number; name: string; phone: string; role: string; active: number; }
interface Product {
  id: number; name: string; price_per_unit: number; unit: string;
  active: number; avg_rating: number | null; review_count: number; category?: string;
}

const ROLE_AR: Record<string, string> = {
  admin: "مدير", reviewer: "مراجع", supervisor: "مشرف نقليات",
  warehouse: "مستودع", driver: "سائق", rep: "مندوب", customer: "عميل",
};
const ROLE_COLOR: Record<string, string> = {
  admin:      "bg-purple-100 text-purple-700",
  reviewer:   "bg-blue-100   text-blue-700",
  supervisor: "bg-orange-100 text-orange-700",
  warehouse:  "bg-green-100  text-green-700",
  driver:     "bg-yellow-100 text-yellow-700",
  rep:        "bg-pink-100   text-pink-700",
  customer:   "bg-gray-100   text-gray-700",
};
const STAGE_LABEL: Record<string, string> = {
  pending: "معلق", payment_confirmed: "مؤكد", vehicle_assigned: "مجهّز",
  invoiced: "فاتورة", loaded: "في الطريق", delivered: "مسلّم", cancelled: "ملغي",
};
const STAGE_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700", payment_confirmed: "bg-blue-100 text-blue-700",
  vehicle_assigned: "bg-indigo-100 text-indigo-700", invoiced: "bg-purple-100 text-purple-700",
  loaded: "bg-cyan-100 text-cyan-700", delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const QUICK_LINKS = [
  { href: "/dashboard",       icon: LayoutDashboard, label: "لوحة التحكم",     color: "bg-[#103c68]/10 text-[#103c68]"  },
  { href: "/reviewer",        icon: ClipboardCheck,  label: "مراجعة الطلبات",  color: "bg-blue-50 text-blue-700"        },
  { href: "/supervisor",      icon: Truck,           label: "إدارة النقليات",  color: "bg-orange-50 text-orange-700"    },
  { href: "/warehouse",       icon: Warehouse,       label: "المستودعات",      color: "bg-green-50 text-green-700"      },
  { href: "/users",           icon: Users,           label: "المستخدمون",      color: "bg-purple-50 text-purple-700"    },
  { href: "/employees",       icon: Shield,          label: "الموظفون",        color: "bg-teal-50 text-teal-700"        },
  { href: "/hr-requests",     icon: CalendarDays,    label: "طلبات HR",        color: "bg-indigo-50 text-indigo-700"    },
  { href: "/products-admin",  icon: Tag,             label: "المنتجات",        color: "bg-red-50 text-red-700"          },
  { href: "/warehouses",      icon: Warehouse,       label: "إدارة المستودعات",color: "bg-emerald-50 text-emerald-700"  },
  { href: "/tariffs",         icon: MapPin,          label: "التعريفات",       color: "bg-amber-50 text-amber-700"      },
  { href: "/drivers-manage",  icon: Car,             label: "إدارة السائقين",  color: "bg-yellow-50 text-yellow-700"    },
  { href: "/reports",         icon: BarChart3,       label: "التقارير",        color: "bg-rose-50 text-rose-700"        },
];

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [tab,      setTab]      = useState<"overview" | "users" | "products">("overview");
  const [users,    setUsers]    = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders,   setOrders]   = useState<Record<string, unknown>[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [showUserForm,    setShowUserForm]    = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editUser,        setEditUser]        = useState<User | null>(null);
  const [editProduct,     setEditProduct]     = useState<Product | null>(null);
  const [userForm,        setUserForm]        = useState({ name: "", phone: "", password: "123456", role: "customer", company_name: "", vat_number: "" });
  const [productForm,     setProductForm]     = useState({ name: "", description: "", image_url: "", price_per_unit: "", unit: "كيس 50 كجم", category: "اسمنت", stock: "0" });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/users").then(r => r.json()),
      fetch("/api/products").then(r => r.json()),
      fetch("/api/workflow/orders").then(r => r.json()),
    ]).then(([u, p, o]) => { setUsers(u); setProducts(p); setOrders(o); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const method = editUser ? "PUT" : "POST";
      const url    = editUser ? `/api/users/${editUser.id}` : "/api/users";
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(userForm) });
      setShowUserForm(false); setEditUser(null);
      setUserForm({ name: "", phone: "", password: "123456", role: "customer", company_name: "", vat_number: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const method = editProduct ? "PUT" : "POST";
      const url    = editProduct ? `/api/products/${editProduct.id}` : "/api/products";
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(productForm) });
      setShowProductForm(false); setEditProduct(null);
      setProductForm({ name: "", description: "", image_url: "", price_per_unit: "", unit: "كيس 50 كجم", category: "اسمنت", stock: "0" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const delUser    = async (id: number) => { if (!confirm("حذف هذا المستخدم؟"))   return; await fetch(`/api/users/${id}`,    { method: "DELETE" }); load(); };
  const delProduct = async (id: number) => { if (!confirm("حذف هذا المنتج؟"))    return; await fetch(`/api/products/${id}`, { method: "DELETE" }); load(); };

  const stats: Stats = {
    total:     orders.length,
    pending:   orders.filter(o => o.stage === "pending").length,
    delivered: orders.filter(o => o.stage === "delivered").length,
    cancelled: orders.filter(o => o.stage === "cancelled").length,
    revenue:   orders.filter(o => o.stage === "delivered").reduce((s, o) => s + ((o.total_with_vat as number) || 0), 0),
  };

  const roleGroups = Object.entries(ROLE_AR).map(([role, label]) => ({
    role, label,
    count: users.filter(u => u.role === role).length,
  })).filter(g => g.count > 0);

  return (
    <div dir="rtl" className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">لوحة مدير النظام</h1>
          <p className="text-gray-400 text-sm mt-0.5">{new Date().toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <Link href="/dashboard">
            <button className="flex items-center gap-2 px-4 py-2 bg-[#103c68] text-white rounded-xl text-sm font-semibold hover:bg-[#0d2e50] transition-colors shadow-sm">
              <LayoutDashboard size={14} />لوحة التحكم الرئيسية
            </button>
          </Link>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "إجمالي الطلبات", val: stats.total,              icon: Truck,        color: "bg-[#103c68] text-white" },
          { label: "معلّقة",         val: stats.pending,             icon: Clock,        color: "bg-yellow-500 text-white" },
          { label: "مسلّمة",         val: stats.delivered,           icon: CheckCircle,  color: "bg-green-600 text-white" },
          { label: "ملغاة",          val: stats.cancelled,           icon: XCircle,      color: "bg-red-500 text-white" },
          { label: "الإيرادات (ريال)", val: stats.revenue.toFixed(0), icon: DollarSign,   color: "bg-emerald-600 text-white" },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className={`rounded-2xl p-4 shadow-sm flex items-center gap-3 ${color}`}>
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <div className="text-xl font-black leading-none">{typeof val === "number" ? val.toLocaleString("ar-SA") : val}</div>
              <div className="text-xs opacity-80 mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Quick navigation ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <LayoutDashboard size={16} className="text-[#103c68]" />الوصول السريع
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {QUICK_LINKS.map(({ href, icon: Icon, label, color }) => (
            <Link key={href} href={href}>
              <button className="w-full flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 border border-gray-100 hover:border-[#103c68]/20 transition-all group text-center">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} group-hover:scale-105 transition-transform`}>
                  <Icon size={17} />
                </div>
                <span className="text-xs font-semibold text-gray-600 leading-tight">{label}</span>
              </button>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl w-fit">
        {[
          { id: "overview", label: "نظرة عامة" },
          { id: "users",    label: `المستخدمون (${users.length})` },
          { id: "products", label: `المنتجات (${products.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as "overview" | "users" | "products")}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Users by role */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Users size={16} className="text-[#103c68]" />توزيع المستخدمين
                <span className="mr-auto text-xs text-gray-400 font-normal">{users.length} مستخدم</span>
              </h3>
              <div className="space-y-2.5">
                {roleGroups.map(({ role, label, count }) => {
                  const pct = users.length > 0 ? Math.round((count / users.length) * 100) : 0;
                  return (
                    <div key={role}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[role]}`}>{label}</span>
                        <span className="text-xs font-semibold text-gray-600">{count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-1.5 bg-[#103c68] rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-green-600" />ملخص الأعمال
              </h3>
              <div className="space-y-3">
                {[
                  { label: "إجمالي المستخدمين",  val: users.length,                            icon: Users,     color: "text-[#103c68]"    },
                  { label: "إجمالي الطلبات",     val: orders.length,                           icon: Package,   color: "text-blue-600"     },
                  { label: "الإيرادات المحصّلة", val: `${stats.revenue.toFixed(0)} ر.س`,       icon: DollarSign,color: "text-green-600"    },
                  { label: "المنتجات النشطة",    val: products.filter(p => p.active).length,   icon: Tag,       color: "text-orange-600"   },
                  { label: "العملاء",             val: users.filter(u => u.role==="customer").length, icon: Building2,color: "text-purple-600" },
                ].map(({ label, val, icon: Icon, color }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className={color} />
                      <span className="text-sm text-gray-600">{label}</span>
                    </div>
                    <span className="font-bold text-gray-900 text-sm">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent orders table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-[#103c68]" />
                <h3 className="font-bold text-gray-800">آخر الطلبات</h3>
              </div>
              <Link href="/reviewer">
                <button className="text-xs text-[#103c68] font-semibold hover:underline flex items-center gap-1">
                  عرض الكل <ChevronRight size={12} />
                </button>
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["رقم الطلب", "العميل", "المنتج", "المبلغ", "الحالة", "التاريخ"].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد طلبات بعد</td></tr>
                  ) : orders.slice(0, 12).map((o, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[#103c68] font-bold whitespace-nowrap">{String(o.order_number || "")}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{String(o.customer_name || o.customer_phone || "")}</td>
                      <td className="px-4 py-3 text-gray-700">{String(o.product_name || "")}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{Number(o.total_with_vat || 0).toFixed(2)} ر.س</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STAGE_COLOR[String(o.stage)] || "bg-gray-100 text-gray-600"}`}>
                          {STAGE_LABEL[String(o.stage)] || String(o.stage)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{String(o.created_at || "").slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Users Tab ── */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{users.length} مستخدم مسجّل</p>
            <button onClick={() => { setEditUser(null); setUserForm({ name: "", phone: "", password: "123456", role: "customer", company_name: "", vat_number: "" }); setShowUserForm(true); }}
              className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0d2e50] shadow-sm transition-colors">
              <Plus size={14} />إضافة مستخدم
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["الاسم", "الجوال", "الدور", "الشركة", "الحالة", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">{u.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dir-ltr">{u.phone}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLOR[u.role] || "bg-gray-100 text-gray-600"}`}>
                          {ROLE_AR[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{(u as Record<string, unknown>).company_name as string || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold ${u.active ? "text-green-600" : "text-red-500"}`}>
                          {u.active ? "● نشط" : "● موقوف"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => { setEditUser(u); setUserForm({ name: u.name, phone: u.phone, password: "", role: u.role, company_name: "", vat_number: "" }); setShowUserForm(true); }}
                            className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => delUser(u.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Products Tab ── */}
      {tab === "products" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{products.length} منتج</p>
            <button onClick={() => { setEditProduct(null); setProductForm({ name: "", description: "", image_url: "", price_per_unit: "", unit: "كيس 50 كجم", category: "اسمنت", stock: "0" }); setShowProductForm(true); }}
              className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0d2e50] shadow-sm transition-colors">
              <Plus size={14} />إضافة منتج
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                {p.image_url && (
                  <img src={(p as Record<string, unknown>).image_url as string} alt={p.name}
                    className="w-full h-36 object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 truncate">{p.name}</div>
                      {p.category && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full mt-1 inline-block">{p.category}</span>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${p.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {p.active ? "نشط" : "غير نشط"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    ★ {p.avg_rating?.toFixed(1) || "—"} <span className="text-xs">({p.review_count} تقييم)</span>
                  </div>
                  <div className="font-black text-[#103c68] mt-1">{p.price_per_unit} ر.س <span className="text-xs font-normal text-gray-400">/ {p.unit}</span></div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                    <button onClick={() => { setEditProduct(p); setProductForm({ name: p.name, description: "", image_url: (p as Record<string, unknown>).image_url as string || "", price_per_unit: String(p.price_per_unit), unit: p.unit, category: p.category || "", stock: "0" }); setShowProductForm(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-gray-200 py-2 rounded-xl hover:bg-gray-50 transition-colors text-gray-600 font-medium">
                      <Pencil size={12} /> تعديل
                    </button>
                    <button onClick={() => delProduct(p.id)} className="px-3 py-2 border border-red-100 text-red-500 rounded-xl hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── User Form Modal ── */}
      {showUserForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowUserForm(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="font-black text-xl mb-5 text-gray-900">{editUser ? "تعديل مستخدم" : "إضافة مستخدم جديد"}</h2>
            <form onSubmit={saveUser} className="space-y-3">
              {[
                { field: "name",         label: "الاسم الكامل *",    type: "text"     },
                { field: "phone",        label: "رقم الجوال *",       type: "tel"      },
                { field: "password",     label: "كلمة المرور",        type: "password" },
                { field: "company_name", label: "اسم الشركة",         type: "text"     },
                { field: "vat_number",   label: "الرقم الضريبي",      type: "text"     },
              ].map(({ field, label, type }) => (
                <div key={field}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
                  <input type={type} required={["name","phone"].includes(field)}
                    value={(userForm as Record<string, string>)[field]}
                    onChange={e => setUserForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">الدور</label>
                <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                  {Object.entries(ROLE_AR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-[#103c68] text-white py-3 rounded-xl font-bold disabled:opacity-60 text-sm">
                  {submitting ? "جاري الحفظ..." : "حفظ"}
                </button>
                <button type="button" onClick={() => setShowUserForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-sm">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Product Form Modal ── */}
      {showProductForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowProductForm(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-black text-xl mb-5 text-gray-900">{editProduct ? "تعديل منتج" : "إضافة منتج جديد"}</h2>
            <form onSubmit={saveProduct} className="space-y-3">
              {[
                { f: "name",          l: "اسم المنتج *",    t: "text"   },
                { f: "description",   l: "الوصف",           t: "text"   },
                { f: "image_url",     l: "رابط الصورة",     t: "url"    },
                { f: "price_per_unit",l: "السعر (ر.س) *",   t: "number" },
                { f: "unit",          l: "الوحدة",          t: "text"   },
                { f: "category",      l: "الفئة",           t: "text"   },
                { f: "stock",         l: "الكمية المتاحة",  t: "number" },
              ].map(({ f, l, t }) => (
                <div key={f}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">{l}</label>
                  <input type={t} required={["name","price_per_unit"].includes(f)}
                    value={(productForm as Record<string, string>)[f]}
                    onChange={e => setProductForm(p => ({ ...p, [f]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-[#103c68] text-white py-3 rounded-xl font-bold disabled:opacity-60 text-sm">
                  {submitting ? "جاري الحفظ..." : "حفظ"}
                </button>
                <button type="button" onClick={() => setShowProductForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-sm">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
