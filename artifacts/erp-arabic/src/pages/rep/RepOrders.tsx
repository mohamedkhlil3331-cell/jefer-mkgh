import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Users, ShoppingCart, TrendingUp, CheckCircle, Clock, XCircle,
  Plus, X, Search, ChevronDown, Package, MapPin, Phone,
  Building2, FileText, Filter, RefreshCw, ArrowRight,
  DollarSign, Truck, AlertCircle, Star,
} from "lucide-react";

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string;
  total_before_vat: number; vat_amount: number; total_with_vat: number;
  delivery_location: string; destination_type: string; stage: string;
  vehicle_plate: string; driver_name: string; driver_phone: string;
  created_at: string;
}
interface Product {
  id: number; name: string; price_per_unit: number; price_delivered: number;
  unit: string; category: string; stock: number; active: number;
}
interface Customer {
  id: number; name: string; phone: string; company_name: string;
  vat_number: string; active: number;
}

const STAGE_LABEL: Record<string, string> = {
  pending: "انتظار المراجعة", payment_confirmed: "تم تأكيد الدفع",
  vehicle_assigned: "تم تجهيز السيارة", invoiced: "صدرت الفاتورة",
  loaded: "في الطريق", delivered: "تم التسليم", cancelled: "ملغي",
};
const STAGE_COLOR: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  payment_confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  vehicle_assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  invoiced: "bg-purple-50 text-purple-700 border-purple-200",
  loaded: "bg-cyan-50 text-cyan-700 border-cyan-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};
const STAGE_ICON: Record<string, React.ElementType> = {
  pending: Clock, payment_confirmed: CheckCircle,
  vehicle_assigned: Truck, invoiced: FileText,
  loaded: Truck, delivered: Star, cancelled: XCircle,
};

const DEST_OPTIONS = ["مستودع", "موقع", "مصنع"];

export default function RepOrders() {
  const { user } = useAuth();
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [products,  setProducts]  = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading,   setLoading]   = useState(true);

  // UI state
  const [tab,           setTab]           = useState<"dashboard"|"orders"|"newOrder"|"customers">("dashboard");
  const [stageFilter,   setStageFilter]   = useState("all");
  const [searchOrders,  setSearchOrders]  = useState("");
  const [searchCust,    setSearchCust]    = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [successMsg,    setSuccessMsg]    = useState("");

  // New order form
  const [selectedProduct, setSelectedProduct]   = useState<Product | null>(null);
  const [custPhone,        setCustPhone]         = useState("");
  const [custName,         setCustName]          = useState("");
  const [qty,              setQty]               = useState("");
  const [deliveryLoc,      setDeliveryLoc]       = useState("");
  const [destType,         setDestType]          = useState("مستودع");
  const [customPrice,      setCustomPrice]       = useState("");
  const [showProdPicker,   setShowProdPicker]    = useState(false);
  const [showCustPicker,   setShowCustPicker]    = useState(false);
  const [prodSearch,       setProdSearch]        = useState("");

  // New customer form
  const [newCustForm, setNewCustForm] = useState({ name: "", phone: "", company_name: "", vat_number: "" });
  const [addingCust,  setAddingCust]  = useState(false);
  const [custMsg,     setCustMsg]     = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/workflow/orders?role=rep&phone=${user?.phone}`).then(r => r.json()),
      fetch("/api/products").then(r => r.json()),
      fetch("/api/users").then(r => r.json()),
    ]).then(([o, p, u]) => {
      setOrders(Array.isArray(o) ? o : []);
      setProducts((Array.isArray(p) ? p : []).filter((x: Product) => x.active));
      setCustomers((Array.isArray(u) ? u : []).filter((x: Customer) => (x as unknown as { role: string }).role === "customer"));
    }).catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (user) load(); }, [user]);

  // Stats
  const stats = useMemo(() => ({
    total:     orders.length,
    pending:   orders.filter(o => o.stage === "pending").length,
    delivered: orders.filter(o => o.stage === "delivered").length,
    revenue:   orders.filter(o => o.stage !== "cancelled").reduce((s, o) => s + (o.total_with_vat || 0), 0),
    inProgress: orders.filter(o => !["pending","delivered","cancelled"].includes(o.stage)).length,
  }), [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let list = stageFilter === "all" ? orders : orders.filter(o => o.stage === stageFilter);
    if (searchOrders.trim()) {
      const q = searchOrders.toLowerCase();
      list = list.filter(o =>
        o.order_number?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.customer_phone?.includes(q) ||
        o.product_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, stageFilter, searchOrders]);

  const filteredProducts = useMemo(() => {
    if (!prodSearch.trim()) return products;
    const q = prodSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
  }, [products, prodSearch]);

  const filteredCustomers = useMemo(() => {
    if (!searchCust.trim()) return customers;
    const q = searchCust.toLowerCase();
    return customers.filter(c =>
      c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.company_name?.toLowerCase().includes(q)
    );
  }, [customers, searchCust]);

  // Order total preview
  const unitPrice = customPrice ? parseFloat(customPrice) : (selectedProduct?.price_per_unit || 0);
  const totalBefore = (parseFloat(qty) || 0) * unitPrice;
  const vat = totalBefore * 0.15;
  const totalWith = totalBefore + vat;

  const selectCustomer = (c: Customer) => {
    setCustPhone(c.phone);
    setCustName(c.name);
    setShowCustPicker(false);
  };

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !custPhone || !qty || !deliveryLoc) return;
    setSubmitting(true);
    try {
      const repRow = { id: user?.id || 0 };
      const body = {
        customer_phone: custPhone,
        customer_name: custName,
        rep_id: repRow.id,
        product_id: selectedProduct.id,
        quantity: parseFloat(qty),
        unit_price: unitPrice,
        delivery_location: deliveryLoc,
        destination_type: destType,
      };
      const r = await fetch("/api/workflow/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "فشل إنشاء الطلب");
      setSuccessMsg(`تم إنشاء الطلب بنجاح رقم: ${d.order_number}`);
      // Reset form
      setSelectedProduct(null); setCustPhone(""); setCustName("");
      setQty(""); setDeliveryLoc(""); setDestType("مستودع"); setCustomPrice("");
      load();
      setTimeout(() => { setSuccessMsg(""); setTab("orders"); }, 2500);
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const submitNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault(); setAddingCust(true); setCustMsg("");
    try {
      const r = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newCustForm, role: "customer", password: newCustForm.phone || "123456", active: 1 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "فشل الإضافة");
      setCustMsg("تمت إضافة العميل بنجاح");
      setNewCustForm({ name: "", phone: "", company_name: "", vat_number: "" });
      load();
    } catch (err) { setCustMsg("❌ " + (err as Error).message); }
    finally { setAddingCust(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={24} className="animate-spin text-[#103c68]" />
    </div>
  );

  const StageBadge = ({ stage }: { stage: string }) => {
    const Icon = STAGE_ICON[stage] ?? Clock;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${STAGE_COLOR[stage] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
        <Icon size={11} />{STAGE_LABEL[stage] ?? stage}
      </span>
    );
  };

  return (
    <div dir="rtl" className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Users size={24} className="text-[#103c68]" />بوابة المندوب
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">مرحباً {user?.name} — {orders.length} طلب إجمالاً</p>
        </div>
        <button onClick={() => setTab("newOrder")}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-bold text-sm shadow-sm transition-colors">
          <Plus size={16} />طلب جديد
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 flex-wrap bg-gray-100 p-1.5 rounded-2xl w-fit">
        {([
          { id: "dashboard", label: "الرئيسية",   icon: TrendingUp },
          { id: "orders",    label: "الطلبات",    icon: ShoppingCart, count: orders.length },
          { id: "newOrder",  label: "طلب جديد",   icon: Plus },
          { id: "customers", label: "العملاء",    icon: Users, count: customers.length },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon size={14} />{t.label}
              {"count" in t && t.count !== undefined && (
                <span className={`text-xs font-black px-1.5 rounded-full ${tab === t.id ? "bg-[#103c68]/10 text-[#103c68]" : "bg-gray-200 text-gray-600"}`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════ DASHBOARD TAB ══════════════════════════════════════════ */}
      {tab === "dashboard" && (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "إجمالي طلباتي", val: stats.total,     icon: ShoppingCart, color: "bg-[#103c68]" },
              { label: "في الانتظار",    val: stats.pending,   icon: Clock,        color: "bg-amber-500" },
              { label: "قيد التنفيذ",   val: stats.inProgress,icon: Truck,        color: "bg-blue-500"  },
              { label: "مسلّمة",         val: stats.delivered, icon: CheckCircle,  color: "bg-green-500" },
            ].map(({ label, val, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-3">
                <div className={`${color} w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon size={20} className="text-white" />
                </div>
                <div>
                  <div className="text-2xl font-black text-gray-900">{val}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Revenue */}
          <div className="bg-gradient-to-l from-[#103c68] to-[#1a5899] rounded-2xl p-6 text-white flex items-center justify-between">
            <div>
              <div className="text-sm opacity-75">إجمالي مبيعاتي (شامل الضريبة)</div>
              <div className="text-4xl font-black mt-1">{stats.revenue.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س</div>
              <div className="text-xs opacity-60 mt-1">من {stats.total} طلب · {stats.delivered} مسلّم</div>
            </div>
            <DollarSign size={60} className="opacity-10" />
          </div>

          {/* Recent orders */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">آخر الطلبات</h2>
              <button onClick={() => setTab("orders")} className="text-xs text-[#103c68] flex items-center gap-1 hover:underline">
                عرض الكل <ArrowRight size={12} />
              </button>
            </div>
            {orders.slice(0, 5).length === 0 ? (
              <div className="text-center py-10 text-gray-300">
                <ShoppingCart size={36} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد طلبات بعد</p>
                <button onClick={() => setTab("newOrder")} className="mt-3 text-[#103c68] text-sm font-bold hover:underline">إنشاء أول طلب</button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {orders.slice(0, 5).map(o => (
                  <div key={o.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</div>
                      <div className="font-semibold text-gray-800 text-sm truncate">{o.customer_name || o.customer_phone}</div>
                      <div className="text-xs text-gray-400">{o.product_name} × {o.quantity} {o.unit}</div>
                    </div>
                    <div className="text-left flex-shrink-0">
                      <div className="font-bold text-gray-900 text-sm">{o.total_with_vat?.toFixed(0)} ر.س</div>
                      <StageBadge stage={o.stage} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setTab("newOrder")}
              className="bg-[#103c68] text-white rounded-2xl p-5 text-center hover:bg-[#0d3158] transition-colors">
              <Plus size={24} className="mx-auto mb-2" />
              <div className="font-bold text-sm">طلب جديد</div>
            </button>
            <button onClick={() => setTab("customers")}
              className="bg-white border border-gray-100 shadow-sm text-gray-700 rounded-2xl p-5 text-center hover:bg-gray-50 transition-colors">
              <Users size={24} className="mx-auto mb-2 text-[#103c68]" />
              <div className="font-bold text-sm">إدارة العملاء</div>
              <div className="text-xs text-gray-400 mt-0.5">{customers.length} عميل</div>
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ ORDERS TAB ══════════════════════════════════════════ */}
      {tab === "orders" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap gap-2 items-center">
            <Filter size={14} className="text-gray-400 ms-1" />
            {["all","pending","payment_confirmed","vehicle_assigned","loaded","delivered","cancelled"].map(s => (
              <button key={s} onClick={() => setStageFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                  ${stageFilter === s
                    ? "bg-[#103c68] text-white"
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                {s === "all" ? `الكل (${orders.length})` : `${STAGE_LABEL[s]} (${orders.filter(o => o.stage === s).length})`}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={15} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={searchOrders} onChange={e => setSearchOrders(e.target.value)}
              placeholder="بحث بالرقم أو العميل أو المنتج..."
              className="w-full bg-white border border-gray-200 rounded-xl pe-10 ps-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 shadow-sm" />
          </div>

          <div className="text-xs text-gray-400 px-1">عرض {filteredOrders.length} من {orders.length} طلب</div>

          {filteredOrders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 text-gray-400">
              <ShoppingCart size={36} className="mx-auto mb-2 opacity-30" />
              <p>لا توجد طلبات مطابقة</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map(o => (
                <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-[#103c68] font-bold mb-0.5">{o.order_number}</div>
                      <div className="font-bold text-gray-900">{o.customer_name || o.customer_phone}</div>
                      <div className="text-sm text-gray-400">{o.product_name} × {o.quantity} {o.unit}</div>
                    </div>
                    <div className="text-left flex-shrink-0 space-y-1">
                      <div className="font-black text-lg text-gray-900">{o.total_with_vat?.toFixed(0)} ر.س</div>
                      <StageBadge stage={o.stage} />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                    {o.delivery_location && <span className="flex items-center gap-1"><MapPin size={11} />{o.delivery_location}</span>}
                    <span className="flex items-center gap-1"><Phone size={11} />{o.customer_phone}</span>
                    <span>{new Date(o.created_at).toLocaleDateString("ar-SA")}</span>
                  </div>

                  {o.stage === "loaded" && (
                    <div className="mt-3 bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2.5 text-xs">
                      <div className="text-cyan-700 font-bold">🚛 الشحنة في الطريق</div>
                      {o.vehicle_plate && <div className="text-cyan-600 mt-0.5">السيارة: {o.vehicle_plate} · السائق: {o.driver_name}</div>}
                      {o.driver_phone && (
                        <a href={`https://wa.me/966${o.driver_phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 mt-1.5 bg-green-600 text-white px-2 py-1 rounded-lg font-bold">
                          واتساب السائق
                        </a>
                      )}
                    </div>
                  )}

                  {o.stage === "delivered" && (
                    <div className="mt-3 bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-xs text-green-700 font-semibold flex items-center gap-1.5">
                      <CheckCircle size={13} />تم التسليم بنجاح
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════ NEW ORDER TAB ══════════════════════════════════════════ */}
      {tab === "newOrder" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
          <h2 className="font-black text-gray-900 text-xl mb-5 flex items-center gap-2">
            <Plus size={20} className="text-[#103c68]" />إنشاء طلب جديد
          </h2>

          {successMsg && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-5 flex items-center gap-2 font-semibold text-sm">
              <CheckCircle size={16} />{successMsg}
            </div>
          )}

          <form onSubmit={submitOrder} className="space-y-5">
            {/* Product picker */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">المنتج *</label>
              {selectedProduct ? (
                <div className="flex items-center justify-between bg-[#103c68]/5 border border-[#103c68]/20 rounded-xl px-4 py-3">
                  <div>
                    <div className="font-bold text-[#103c68]">{selectedProduct.name}</div>
                    <div className="text-xs text-gray-500">{selectedProduct.category} · {selectedProduct.price_per_unit} ر.س/{selectedProduct.unit}</div>
                  </div>
                  <button type="button" onClick={() => setSelectedProduct(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowProdPicker(true)}
                  className="w-full flex items-center justify-between border border-dashed border-gray-300 rounded-xl px-4 py-3 text-gray-400 hover:border-[#103c68] hover:text-[#103c68] transition-colors text-sm">
                  <span>اختر منتجاً...</span>
                  <ChevronDown size={15} />
                </button>
              )}
            </div>

            {/* Customer picker */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">العميل *</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Phone size={14} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="05xxxxxxxx" dir="ltr" required
                    className="w-full border border-gray-200 rounded-xl pe-9 ps-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
                </div>
                <button type="button" onClick={() => setShowCustPicker(true)}
                  className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold text-gray-600 flex items-center gap-1.5 transition-colors">
                  <Users size={14} />اختر
                </button>
              </div>
              <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="اسم العميل (اختياري)"
                className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
            </div>

            {/* Qty + custom price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  الكمية ({selectedProduct?.unit || "وحدة"}) *
                </label>
                <input type="number" value={qty} onChange={e => setQty(e.target.value)} required min="1" placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  السعر/وحدة {selectedProduct && <span className="text-gray-400 font-normal">(افتراضي: {selectedProduct.price_per_unit})</span>}
                </label>
                <input type="number" value={customPrice} onChange={e => setCustomPrice(e.target.value)}
                  placeholder={selectedProduct ? String(selectedProduct.price_per_unit) : "0"}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
            </div>

            {/* Delivery location */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">موقع التسليم *</label>
              <input value={deliveryLoc} onChange={e => setDeliveryLoc(e.target.value)} required
                placeholder="اكتب العنوان أو الحي أو المنطقة"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
            </div>

            {/* Destination type */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">نوع الوجهة</label>
              <div className="flex gap-2">
                {DEST_OPTIONS.map(d => (
                  <button key={d} type="button" onClick={() => setDestType(d)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors
                      ${destType === d ? "bg-[#103c68] text-white border-[#103c68]" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Price preview */}
            {qty && selectedProduct && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>المجموع قبل الضريبة</span>
                  <span className="font-semibold">{totalBefore.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>ضريبة القيمة المضافة (15%)</span>
                  <span className="font-semibold">{vat.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between text-gray-900 font-black text-base pt-2 border-t border-gray-200">
                  <span>الإجمالي</span>
                  <span className="text-[#103c68]">{totalWith.toFixed(2)} ر.س</span>
                </div>
              </div>
            )}

            <button type="submit" disabled={submitting || !selectedProduct || !custPhone || !qty || !deliveryLoc}
              className="w-full py-3.5 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-black text-base disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {submitting ? <><RefreshCw size={16} className="animate-spin" />جاري الإرسال...</> : <><ShoppingCart size={16} />إرسال الطلب</>}
            </button>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════ CUSTOMERS TAB ══════════════════════════════════════════ */}
      {tab === "customers" && (
        <div className="space-y-4">
          {/* Add customer form */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Plus size={16} className="text-[#103c68]" />إضافة عميل جديد</h3>
            {custMsg && (
              <div className={`rounded-xl px-3 py-2.5 mb-4 text-sm flex items-center gap-2
                ${custMsg.startsWith("❌") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                {custMsg.startsWith("❌") ? <AlertCircle size={14} /> : <CheckCircle size={14} />}{custMsg}
              </div>
            )}
            <form onSubmit={submitNewCustomer} className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="text-xs font-semibold text-gray-600 block mb-1">اسم العميل *</label>
                <input value={newCustForm.name} onChange={e => setNewCustForm(p => ({ ...p, name: e.target.value }))} required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-xs font-semibold text-gray-600 block mb-1">رقم الجوال *</label>
                <input value={newCustForm.phone} onChange={e => setNewCustForm(p => ({ ...p, phone: e.target.value }))} required dir="ltr"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">اسم الشركة</label>
                <input value={newCustForm.company_name} onChange={e => setNewCustForm(p => ({ ...p, company_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">الرقم الضريبي</label>
                <input value={newCustForm.vat_number} onChange={e => setNewCustForm(p => ({ ...p, vat_number: e.target.value }))} dir="ltr"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div className="col-span-2">
                <button type="submit" disabled={addingCust}
                  className="px-6 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d3158] disabled:opacity-50 transition-colors">
                  {addingCust ? "جاري الإضافة..." : "إضافة العميل"}
                </button>
              </div>
            </form>
          </div>

          {/* Customers list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between gap-3">
              <h3 className="font-bold text-gray-800">قائمة العملاء ({customers.length})</h3>
              <div className="relative">
                <Search size={13} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input value={searchCust} onChange={e => setSearchCust(e.target.value)} placeholder="بحث..."
                  className="border border-gray-200 rounded-xl pe-8 ps-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 w-40" />
              </div>
            </div>
            {filteredCustomers.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">لا توجد عملاء</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredCustomers.map(c => (
                  <div key={c.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-gray-50/50 group">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#103c68]/10 flex items-center justify-center font-bold text-[#103c68] text-sm flex-shrink-0">
                        {c.name?.charAt(0) || "؟"}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800 text-sm">{c.name}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-2">
                          <span className="font-mono">{c.phone}</span>
                          {c.company_name && <span className="flex items-center gap-0.5"><Building2 size={10} />{c.company_name}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setCustPhone(c.phone); setCustName(c.name); setTab("newOrder"); }}
                      className="opacity-0 group-hover:opacity-100 text-xs text-[#103c68] font-bold hover:underline flex items-center gap-1 transition-opacity">
                      طلب جديد <ArrowRight size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ PRODUCT PICKER MODAL ══════════════════════════════════════════ */}
      {showProdPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">اختر المنتج</h3>
              <button onClick={() => setShowProdPicker(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search size={14} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder="ابحث عن منتج..."
                  className="w-full border border-gray-200 rounded-xl pe-9 ps-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" autoFocus />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-2 pb-3">
              {filteredProducts.map(p => (
                <button key={p.id} onClick={() => { setSelectedProduct(p); setShowProdPicker(false); setProdSearch(""); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 text-right transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-[#103c68]/10 flex items-center justify-center flex-shrink-0">
                    <Package size={18} className="text-[#103c68]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-800 text-sm">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.category}</div>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <div className="font-black text-[#103c68] text-sm">{p.price_per_unit} ر.س</div>
                    <div className="text-xs text-gray-400">/{p.unit}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ CUSTOMER PICKER MODAL ══════════════════════════════════════════ */}
      {showCustPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">اختر عميلاً</h3>
              <button onClick={() => setShowCustPicker(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-50 px-1 pb-2">
              {customers.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">لا يوجد عملاء — أضف عميلاً من تبويب العملاء</div>
              ) : customers.map(c => (
                <button key={c.id} onClick={() => selectCustomer(c)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-right transition-colors">
                  <div className="w-9 h-9 rounded-full bg-[#103c68]/10 flex items-center justify-center font-bold text-[#103c68] text-sm flex-shrink-0">
                    {c.name?.charAt(0) || "؟"}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">{c.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{c.phone}</div>
                    {c.company_name && <div className="text-xs text-gray-400">{c.company_name}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
