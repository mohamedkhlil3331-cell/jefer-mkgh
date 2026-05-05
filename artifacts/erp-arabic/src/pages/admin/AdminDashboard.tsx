import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Users, Package, Truck, DollarSign, Plus, Pencil, Trash2 } from "lucide-react";

interface Stats { total: number; pending: number; delivered: number; revenue: number; }
interface User { id: number; name: string; phone: string; role: string; active: number; }
interface Product { id: number; name: string; price_per_unit: number; unit: string; active: number; avg_rating: number | null; review_count: number; }

const ROLE_AR: Record<string, string> = { admin: "مدير", reviewer: "مراجع", supervisor: "مشرف نقليات", warehouse: "مستودع", driver: "سائق", rep: "مندوب", customer: "عميل" };
const ROLE_COLOR: Record<string, string> = { admin: "bg-purple-100 text-purple-700", reviewer: "bg-blue-100 text-blue-700", supervisor: "bg-orange-100 text-orange-700", warehouse: "bg-green-100 text-green-700", driver: "bg-yellow-100 text-yellow-700", rep: "bg-pink-100 text-pink-700", customer: "bg-gray-100 text-gray-700" };

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"overview"|"users"|"products">("overview");
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [userForm, setUserForm] = useState({ name: "", phone: "", password: "123456", role: "customer", company_name: "", vat_number: "" });
  const [productForm, setProductForm] = useState({ name: "", description: "", image_url: "", price_per_unit: "", unit: "كيس 50 كجم", category: "اسمنت", stock: "0" });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/users").then(r => r.json()),
      fetch("/api/products").then(r => r.json()),
      fetch("/api/workflow/orders").then(r => r.json()),
    ]).then(([u, p, o]) => { setUsers(u); setProducts(p); setOrders(o); }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const method = editUser ? "PUT" : "POST";
      const url = editUser ? `/api/users/${editUser.id}` : "/api/users";
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
      const url = editProduct ? `/api/products/${editProduct.id}` : "/api/products";
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(productForm) });
      setShowProductForm(false); setEditProduct(null);
      setProductForm({ name: "", description: "", image_url: "", price_per_unit: "", unit: "كيس 50 كجم", category: "اسمنت", stock: "0" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const delUser = async (id: number) => { if (!confirm("حذف هذا المستخدم؟")) return; await fetch(`/api/users/${id}`, { method: "DELETE" }); load(); };
  const delProduct = async (id: number) => { if (!confirm("حذف هذا المنتج؟")) return; await fetch(`/api/products/${id}`, { method: "DELETE" }); load(); };

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.stage === "pending").length,
    delivered: orders.filter(o => o.stage === "delivered").length,
    revenue: orders.filter(o => o.stage === "delivered").reduce((s, o) => s + ((o.total_with_vat as number)||0), 0),
  };

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">لوحة المدير</h1>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {[{id:"overview",label:"نظرة عامة"},{id:"users",label:`المستخدمون (${users.length})`},{id:"products",label:`المنتجات (${products.length})`}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as "overview"|"users"|"products")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t.id ? "bg-primary text-white" : "bg-white border border-border text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "إجمالي الطلبات", val: stats.total, icon: Truck, color: "bg-blue-50 text-blue-700" },
              { label: "قيد التنفيذ", val: stats.pending, icon: Package, color: "bg-yellow-50 text-yellow-700" },
              { label: "مسلمة", val: stats.delivered, icon: Package, color: "bg-green-50 text-green-700" },
              { label: "الإيرادات", val: `${stats.revenue.toFixed(0)} ر.س`, icon: DollarSign, color: "bg-purple-50 text-purple-700" },
            ].map(({ label, val, icon: Icon, color }) => (
              <div key={label} className={`${color} rounded-xl p-4`}>
                <Icon size={20} className="mb-2 opacity-70" />
                <div className="text-2xl font-bold">{val}</div>
                <div className="text-sm opacity-70 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-bold flex items-center gap-2">
              <Truck size={18} className="text-primary" />آخر الطلبات
            </div>
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/30 text-right"><th className="px-4 py-2.5 font-semibold text-muted-foreground">رقم الطلب</th><th className="px-4 py-2.5 font-semibold text-muted-foreground">العميل</th><th className="px-4 py-2.5 font-semibold text-muted-foreground">المنتج</th><th className="px-4 py-2.5 font-semibold text-muted-foreground">المبلغ</th><th className="px-4 py-2.5 font-semibold text-muted-foreground">الحالة</th></tr></thead>
              <tbody>
                {orders.slice(0,15).map((o, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs text-primary">{o.order_number as string}</td>
                    <td className="px-4 py-3">{o.customer_name as string || o.customer_phone as string}</td>
                    <td className="px-4 py-3">{o.product_name as string}</td>
                    <td className="px-4 py-3 font-medium">{(o.total_with_vat as number)?.toFixed(2)} ر.س</td>
                    <td className="px-4 py-3"><span className="text-xs bg-muted px-2 py-0.5 rounded-full">{o.stage as string}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditUser(null); setUserForm({ name: "", phone: "", password: "123456", role: "customer", company_name: "", vat_number: "" }); setShowUserForm(true); }}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90">
              <Plus size={15} /> إضافة مستخدم
            </button>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/30 text-right"><th className="px-4 py-2.5 font-semibold text-muted-foreground">الاسم</th><th className="px-4 py-2.5 font-semibold text-muted-foreground">الجوال</th><th className="px-4 py-2.5 font-semibold text-muted-foreground">الدور</th><th className="px-4 py-2.5 font-semibold text-muted-foreground">الحالة</th><th className="px-4 py-2.5"></th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{u.phone}</td>
                    <td className="px-4 py-3"><span className={`${ROLE_COLOR[u.role]} px-2.5 py-1 rounded-full text-xs font-medium`}>{ROLE_AR[u.role] || u.role}</span></td>
                    <td className="px-4 py-3"><span className={u.active ? "text-green-600" : "text-red-500"}>{u.active ? "نشط" : "موقوف"}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditUser(u); setUserForm({ name: u.name, phone: u.phone, password: "", role: u.role, company_name: "", vat_number: "" }); setShowUserForm(true); }} className="p-1.5 hover:bg-muted rounded text-primary"><Pencil size={13} /></button>
                        <button onClick={() => delUser(u.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "products" && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditProduct(null); setProductForm({ name: "", description: "", image_url: "", price_per_unit: "", unit: "كيس 50 كجم", category: "اسمنت", stock: "0" }); setShowProductForm(true); }}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90">
              <Plus size={15} /> إضافة منتج
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(p => (
              <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-32 object-cover" onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />}
                <div className="p-4">
                  <div className="font-bold">{p.name}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">★ {p.avg_rating?.toFixed(1) || "—"} ({p.review_count} تقييم)</div>
                  <div className="font-bold text-primary mt-1">{p.price_per_unit} ر.س / {p.unit}</div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { setEditProduct(p); setProductForm({ name: p.name, description: "", image_url: p.image_url||"", price_per_unit: String(p.price_per_unit), unit: p.unit, category: "", stock: "0" }); setShowProductForm(true); }}
                      className="flex-1 flex items-center justify-center gap-1 text-xs border border-border py-1.5 rounded-lg hover:bg-muted">
                      <Pencil size={12} /> تعديل
                    </button>
                    <button onClick={() => delProduct(p.id)} className="p-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Form Modal */}
      {showUserForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowUserForm(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-xl mb-5">{editUser ? "تعديل مستخدم" : "إضافة مستخدم"}</h2>
            <form onSubmit={saveUser} className="space-y-3">
              {[{ field: "name", label: "الاسم *", type: "text" }, { field: "phone", label: "الجوال *", type: "tel" }, { field: "password", label: "كلمة المرور", type: "password" }, { field: "company_name", label: "اسم الشركة", type: "text" }, { field: "vat_number", label: "الرقم الضريبي", type: "text" }].map(({ field, label, type }) => (
                <div key={field}>
                  <label className="block text-sm font-medium mb-1">{label}</label>
                  <input type={type} required={field === "name" || field === "phone"} value={(userForm as Record<string, string>)[field]} onChange={e => setUserForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium mb-1">الدور</label>
                <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40">
                  {Object.entries(ROLE_AR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 bg-primary text-white py-2.5 rounded-xl font-medium disabled:opacity-60">{submitting ? "جاري..." : "حفظ"}</button>
                <button type="button" onClick={() => setShowUserForm(false)} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Form Modal */}
      {showProductForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowProductForm(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-xl mb-5">{editProduct ? "تعديل منتج" : "إضافة منتج"}</h2>
            <form onSubmit={saveProduct} className="space-y-3">
              {[{f:"name",l:"الاسم *",t:"text"},{f:"description",l:"الوصف",t:"text"},{f:"image_url",l:"رابط الصورة",t:"url"},{f:"price_per_unit",l:"السعر (ر.س)",t:"number"},{f:"unit",l:"الوحدة",t:"text"},{f:"category",l:"الفئة",t:"text"},{f:"stock",l:"المخزون",t:"number"}].map(({f,l,t}) => (
                <div key={f}>
                  <label className="block text-sm font-medium mb-1">{l}</label>
                  <input type={t} required={f==="name"} value={(productForm as Record<string,string>)[f]} onChange={e => setProductForm(p => ({...p,[f]:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 bg-primary text-white py-2.5 rounded-xl font-medium disabled:opacity-60">{submitting ? "جاري..." : "حفظ"}</button>
                <button type="button" onClick={() => setShowProductForm(false)} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
