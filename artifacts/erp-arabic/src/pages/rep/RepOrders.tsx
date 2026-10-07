import { useEffect, useState, useMemo, useCallback } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { useAuth } from "@/context/AuthContext";
import {
  Users, Package, TrendingUp, DollarSign, Clock, CheckCircle2,
  XCircle, AlertCircle, Search, ShoppingCart, FileText, Award,
  Truck, Building2, Plus, RefreshCw, ChevronDown, ChevronUp,
  Download, Phone, MapPin, X, Star,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Order {
  id: number; order_number: string; customer_phone: string; customer_name: string;
  product_name: string; quantity: number; unit: string; unit_price: number;
  total_with_vat: number; stage: string; payment_method: string;
  delivery_location: string; created_at: string;
}
interface Product { id: number; name: string; category: string; price_per_unit: number; unit: string; load_capacity: number; }
interface Client {
  id: number; name: string; phone: string; company_name: string; city: string;
  order_count: number; total_revenue: number; last_order_at: string;
}
interface PendingClient {
  link_id: number; customer_phone: string; name: string; phone: string;
  company_name: string; city: string; linked_at: string; registered_at: string;
}
interface RepStats {
  total_orders: number; active_orders: number; delivered_orders: number;
  total_revenue: number; total_qty: number; client_count: number; pending_count: number;
  category_stats: Array<{ category: string; total_qty: number; total_revenue: number }>;
}
interface Target {
  id: number; product_category: string; target_qty: number;
  tier1_qty: number; tier1_bonus: number; tier2_qty: number; tier2_bonus: number;
  tier3_qty: number; tier3_bonus: number; period: string;
  start_date: string | null; end_date: string | null;
  achieved_qty: number; progress_pct: number; earned_bonus: number; earned_tier: number;
}
interface StatementData {
  customer: { name: string; phone: string; company_name: string; city: string; address: string };
  orders: Order[];
  summary: { total_orders: number; delivered: number; cancelled: number; total_revenue: number; paid_revenue: number };
}

type Tab = "dashboard" | "clients" | "pending" | "orders" | "newOrder" | "rep_requests";

interface RepRequest {
  id: number; request_no: string; product_name: string;
  loading_locations: string[]; delivery_location: string | null;
  rep_name: string | null; rep_phone: string | null;
  status: string; vehicle_plate: string | null;
  driver_name: string | null; driver_phone: string | null;
  permit_photo_url: string | null; invoice_photo_url: string | null;
  notes: string | null; created_at: string;
}

const STAGES: Record<string, { label: string; color: string }> = {
  pending:                { label: "بانتظار التأكيد",      color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  pending_cash_approval:  { label: "انتظار موافقة كاش",    color: "bg-amber-100 text-amber-700 border-amber-200" },
  pending_rep_approval:   { label: "يحتاج موافقتك",        color: "bg-violet-100 text-violet-700 border-violet-200" },
  fsohat_pending:         { label: "بانتظار الفسحة",       color: "bg-blue-100 text-blue-700 border-blue-200" },
  fsohat_processing:      { label: "جارٍ إصدار الفسحة",    color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  payment_confirmed:      { label: "تم تأكيد الدفع",      color: "bg-blue-100 text-blue-700 border-blue-200" },
  vehicle_assigned:       { label: "تم تحديد المركبة",    color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  invoiced:               { label: "تم إصدار الفاتورة",   color: "bg-purple-100 text-purple-700 border-purple-200" },
  loaded:                 { label: "تم التحميل",           color: "bg-orange-100 text-orange-700 border-orange-200" },
  delivered:              { label: "تم التسليم",           color: "bg-green-100 text-green-700 border-green-200" },
  cancelled:              { label: "ملغي",                 color: "bg-red-100 text-red-700 border-red-200" },
};

const fmt = (n: number) => (n || 0).toLocaleString("ar-SA", { maximumFractionDigits: 0 });
const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

/* ─── CSV Export ─────────────────────────────────────────────────────────── */
function exportCSV(stmt: StatementData) {
  const header = "رقم الطلب,المنتج,الكمية,الوحدة,السعر,الإجمالي بالضريبة,الحالة,التاريخ";
  const rows = stmt.orders.map(o =>
    [o.order_number, o.product_name, o.quantity, o.unit, o.unit_price, o.total_with_vat,
      STAGES[o.stage]?.label || o.stage, fmtDate(o.created_at)].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `كشف-${stmt.customer.name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

/* ─── Target Progress Card ───────────────────────────────────────────────── */
function TargetCard({ t }: { t: Target }) {
  const pct = t.progress_pct;
  const tierPos = (qty: number) => t.target_qty > 0 ? Math.min(100, (qty / t.target_qty) * 100) : 0;
  const tierColors = ["", "text-yellow-600", "text-orange-500", "text-emerald-600"];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-bold text-gray-900 text-sm">{t.product_category}</p>
          <p className="text-xs text-gray-500">
            {t.period === "monthly" ? "شهري" : t.period}
            {t.start_date ? ` · ${fmtDate(t.start_date)} – ${fmtDate(t.end_date || "")}` : ""}
          </p>
        </div>
        {t.earned_tier > 0 && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
            ["", "bg-yellow-50 text-yellow-700", "bg-orange-50 text-orange-700", "bg-emerald-50 text-emerald-700"][t.earned_tier]
          }`}>
            <Star size={11} fill="currentColor" /> مستوى {t.earned_tier}
          </div>
        )}
      </div>

      {/* Progress bar with tier markers */}
      <div className="relative mb-1">
        <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: pct >= 100 ? "linear-gradient(90deg,#10b981,#059669)" : "linear-gradient(90deg,#103c68,#0eb5cb)",
            }}
          />
        </div>
        {[{ qty: t.tier1_qty, n: 1 }, { qty: t.tier2_qty, n: 2 }, { qty: t.tier3_qty, n: 3 }]
          .filter(tier => tier.qty > 0)
          .map(tier => (
            <div
              key={tier.n}
              className="absolute top-0 h-5"
              style={{ left: `${tierPos(tier.qty)}%`, transform: "translateX(-50%)" }}
            >
              <div className={`w-0.5 h-5 ${t.achieved_qty >= tier.qty ? "bg-emerald-400" : "bg-gray-400"}`} />
            </div>
          ))}
      </div>
      <p className="text-xs text-gray-500 text-end mb-3">
        {fmt(t.achieved_qty)} / {fmt(t.target_qty)} {pct >= 100 ? "✓ اكتمل" : `(${pct}%)`}
      </p>

      {/* Tier bonuses row */}
      <div className="flex gap-2 flex-wrap">
        {[
          { qty: t.tier1_qty, bonus: t.tier1_bonus, n: 1 },
          { qty: t.tier2_qty, bonus: t.tier2_bonus, n: 2 },
          { qty: t.tier3_qty, bonus: t.tier3_bonus, n: 3 },
        ].filter(tier => tier.qty > 0).map(tier => {
          const reached = t.achieved_qty >= tier.qty;
          return (
            <div key={tier.n} className={`flex-1 text-center rounded-xl p-2 border text-xs ${
              reached ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-500"
            }`}>
              <p className="font-bold">{fmt(tier.qty)}</p>
              <p className={`font-black text-sm ${tierColors[tier.n]}`}>{fmt(tier.bonus)} ﷼</p>
              <p>{reached ? "✓ محقق" : `مستوى ${tier.n}`}</p>
            </div>
          );
        })}
      </div>
      {t.earned_bonus > 0 && (
        <div className="w-full bg-gradient-to-l from-emerald-500 to-teal-500 text-white rounded-xl p-2 text-center text-xs font-bold mt-2">
          البونص المكتسب: {fmt(t.earned_bonus)} ﷼
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
═══════════════════════════════════════════════════════════════════════════ */
export default function RepOrders() {
  const { user } = useAuth();
  const [tab, setTab] = useRememberedState("rep-orders-tab", "dashboard" as Tab);

  const [stats,    setStats]    = useState<RepStats | null>(null);
  const [clients,  setClients]  = useState<Client[]>([]);
  const [pending,  setPending]  = useState<PendingClient[]>([]);
  const [targets,  setTargets]  = useState<Target[]>([]);
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [repRequests, setRepRequests] = useState<RepRequest[]>([]);

  const [stmtData,    setStmtData]    = useState<StatementData | null>(null);
  const [stmtClient,  setStmtClient]  = useState<Client | null>(null);
  const [stmtLoading, setStmtLoading] = useState(false);

  const [approvalStmts,        setApprovalStmts]        = useState<Record<number, StatementData | null>>({});
  const [approvalStmtLoading,  setApprovalStmtLoading]  = useState<Record<number, boolean>>({});
  const [approvalStmtOpen,     setApprovalStmtOpen]     = useState<Record<number, boolean>>({});

  const [clientSearch, setClientSearch] = useRememberedState("rep-client-search", "");
  const [orderSearch,  setOrderSearch]  = useRememberedState("rep-order-search", "");
  const [stageFilter,  setStageFilter]  = useRememberedState("rep-order-stage-filter", "all");
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  const [form, setForm] = useState({
    customer_phone: "", product_id: "", quantity: "", unit_price: "",
    delivery_location: "", destination_type: "site", payment_method: "transfer", notes: "",
  });
  const [placing, setPlacing] = useState(false);
  const [placeMsg, setPlaceMsg] = useState({ type: "", text: "" });

  const repPhone = user?.phone || "";
  const token = () => localStorage.getItem("mkgh_token") || "";

  const loadAll = useCallback(async () => {
    if (!repPhone) return;
    setLoading(true);
    // Load rep requests separately (no auth header needed)
    fetch(`/api/rep-requests?rep_phone=${encodeURIComponent(repPhone)}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setRepRequests(Array.isArray(d) ? d : []))
      .catch(() => {});
    try {
      const [statsRes, clientsRes, pendingRes, targetsRes, ordersRes, productsRes] = await Promise.all([
        fetch(`/api/rep/stats?rep_phone=${repPhone}`,           { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`/api/rep/clients?rep_phone=${repPhone}`,         { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`/api/rep/pending-clients?rep_phone=${repPhone}`, { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`/api/rep/targets?rep_phone=${repPhone}`,         { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`/api/workflow/orders?role=rep&phone=${repPhone}`,{ headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`/api/products`,                                  { headers: { Authorization: `Bearer ${token()}` } }),
      ]);
      if (statsRes.ok)    setStats(await statsRes.json());
      if (clientsRes.ok)  setClients(await clientsRes.json());
      if (pendingRes.ok)  setPending(await pendingRes.json());
      if (targetsRes.ok)  setTargets(await targetsRes.json());
      if (ordersRes.ok)   setOrders(await ordersRes.json());
      if (productsRes.ok) setProducts(await productsRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [repPhone]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const approveClient = async (link_id: number, action: "approve" | "reject") => {
    await fetch(`/api/rep/pending-clients/${link_id}/action`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ action, rep_phone: repPhone }),
    });
    loadAll();
  };

  const approveCash = async (orderId: number, action: "approve" | "reject", note?: string) => {
    if (action === "approve") {
      await fetch(`/api/workflow/orders/${orderId}/approve-cash`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ approver_phone: repPhone, approver_name: user?.name, note: note || "" }),
      });
    } else {
      await fetch(`/api/workflow/orders/${orderId}/cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ reason: "رفض المندوب للدفع النقدي" }),
      });
    }
    loadAll();
  };

  const repApproveOrder = async (orderId: number) => {
    await fetch(`/api/workflow/orders/${orderId}/rep-approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ approver_phone: repPhone, approver_name: user?.name }),
    });
    loadAll();
  };

  const repRejectOrder = async (orderId: number) => {
    const reason = prompt("سبب الرفض (اختياري):");
    if (reason === null) return;
    await fetch(`/api/workflow/orders/${orderId}/rep-reject`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ approver_phone: repPhone, reason: reason || "رفض المندوب — رصيد العميل غير كافٍ" }),
    });
    loadAll();
  };

  const viewStatement = async (client: Client) => {
    setStmtClient(client); setStmtLoading(true); setStmtData(null);
    const res = await fetch(`/api/rep/clients/${client.phone}/statement?rep_phone=${repPhone}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) setStmtData(await res.json());
    setStmtLoading(false);
  };

  const toggleApprovalStmt = async (orderId: number, customerPhone: string) => {
    const nowOpen = !approvalStmtOpen[orderId];
    setApprovalStmtOpen(prev => ({ ...prev, [orderId]: nowOpen }));
    if (nowOpen && approvalStmts[orderId] === undefined && !approvalStmtLoading[orderId]) {
      setApprovalStmtLoading(prev => ({ ...prev, [orderId]: true }));
      try {
        const res = await fetch(`/api/portal/customers/${customerPhone}/statement`, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        const data = res.ok ? await res.json() : null;
        setApprovalStmts(prev => ({ ...prev, [orderId]: data }));
      } catch { setApprovalStmts(prev => ({ ...prev, [orderId]: null })); }
      setApprovalStmtLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const placeOrder = async () => {
    if (!form.customer_phone || !form.product_id || !form.quantity) {
      setPlaceMsg({ type: "error", text: "يرجى تعبئة جميع الحقول المطلوبة" });
      return;
    }
    setPlacing(true); setPlaceMsg({ type: "", text: "" });
    const prod = products.find(p => String(p.id) === form.product_id);
    const unitPrice = parseFloat(form.unit_price) || prod?.price_per_unit || 0;
    const customer = clients.find(c => c.phone === form.customer_phone);
    try {
      const res = await fetch("/api/workflow/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          customer_phone: form.customer_phone,
          customer_name: customer?.name || "",
          rep_id: user?.id,
          product_id: parseInt(form.product_id),
          product_name: prod?.name || "",
          quantity: parseFloat(form.quantity),
          unit: prod?.unit || "طن",
          unit_price: unitPrice,
          delivery_location: form.delivery_location,
          destination_type: form.destination_type,
          payment_method: form.payment_method,
          notes: form.notes,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "حدث خطأ");
      setPlaceMsg({ type: "success", text: `تم إرسال الطلب ${d.order_number}` });
      setForm({ customer_phone: "", product_id: "", quantity: "", unit_price: "", delivery_location: "", destination_type: "site", payment_method: "transfer", notes: "" });
      loadAll();
    } catch (e) { setPlaceMsg({ type: "error", text: (e as Error).message }); }
    setPlacing(false);
  };

  const filteredClients = useMemo(() =>
    clients.filter(c =>
      !clientSearch || c.name.includes(clientSearch) || c.phone.includes(clientSearch) || (c.company_name || "").includes(clientSearch)
    ), [clients, clientSearch]);

  const filteredOrders = useMemo(() =>
    orders.filter(o =>
      (stageFilter === "all" || o.stage === stageFilter) &&
      (!orderSearch || o.order_number.includes(orderSearch) || (o.customer_name || "").includes(orderSearch))
    ), [orders, stageFilter, orderSearch]);

  const totalEarnedBonus = useMemo(() => targets.reduce((s, t) => s + t.earned_bonus, 0), [targets]);
  const selectedProduct = products.find(p => String(p.id) === form.product_id);

  const repApprovalOrders = useMemo(
    () => orders.filter(o => o.stage === "pending_rep_approval"),
    [orders]
  );
  const pendingApprovalCount = pending.length + repApprovalOrders.length;

  const activeRepRequests = repRequests.filter(r => !["delivered","cancelled"].includes(r.status));

  const TABS: { key: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: "dashboard",    label: "الرئيسية",  icon: TrendingUp },
    { key: "clients",      label: "عملائي",    icon: Users,       badge: clients.length },
    { key: "pending",      label: "الموافقات", icon: Clock,       badge: pendingApprovalCount },
    { key: "orders",       label: "الطلبات",   icon: ShoppingCart, badge: orders.filter(o => !["delivered","cancelled","draft"].includes(o.stage)).length },
    { key: "newOrder",     label: "طلب جديد",  icon: Plus },
    { key: "rep_requests", label: "طلباتي 👤", icon: Plus,         badge: activeRepRequests.length },
  ];

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-[#103c68] text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-black text-lg">لوحة المندوب</h1>
            <p className="text-white/60 text-xs">{user?.name} · {user?.phone}</p>
          </div>
          <button onClick={loadAll} disabled={loading} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        {/* Tab bar */}
        <div className="flex overflow-x-auto scrollbar-hide border-t border-white/10">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 min-w-[70px] flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition-colors relative ${
                tab === t.key ? "text-white border-b-2 border-[#0eb5cb]" : "text-white/50 hover:text-white/80"
              }`}
            >
              <t.icon size={15} />
              {t.label}
              {(t.badge ?? 0) > 0 && (
                <span className="absolute top-1.5 end-1 bg-[#0eb5cb] text-white text-[9px] font-black min-w-[14px] h-3.5 rounded-full flex items-center justify-center px-0.5">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {loading && tab !== "newOrder" && (
          <div className="flex justify-center py-16 text-gray-400">
            <RefreshCw size={28} className="animate-spin" />
          </div>
        )}

        {/* ── DASHBOARD ──────────────────────────────────────────────── */}
        {!loading && tab === "dashboard" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "عملائي",        value: stats?.client_count || 0,  icon: Users,       color: "bg-blue-50 text-[#103c68]",     vfmt: fmt },
                { label: "طلبات نشطة",    value: stats?.active_orders || 0, icon: ShoppingCart, color: "bg-orange-50 text-orange-600",  vfmt: fmt },
                { label: "إجمالي المبيعات", value: stats?.total_revenue || 0, icon: DollarSign,  color: "bg-emerald-50 text-emerald-600", vfmt: (n: number) => `${fmt(n)} ﷼` },
                { label: "بونص محقق",     value: totalEarnedBonus,           icon: Award,       color: "bg-yellow-50 text-yellow-600",  vfmt: (n: number) => `${fmt(n)} ﷼` },
              ].map(card => (
                <div key={card.label} className={`rounded-2xl p-4 ${card.color} shadow-sm`}>
                  <card.icon size={18} className="mb-2 opacity-70" />
                  <p className="text-2xl font-black">{card.vfmt(card.value)}</p>
                  <p className="text-xs font-semibold opacity-60 mt-0.5">{card.label}</p>
                </div>
              ))}
            </div>

            {(stats?.pending_count ?? 0) > 0 && (
              <button onClick={() => setTab("pending")} className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center gap-3 text-amber-700 hover:bg-amber-100 transition-colors">
                <Clock size={18} />
                <div className="text-start flex-1">
                  <p className="font-bold text-sm">{stats!.pending_count} عميل بانتظار موافقتك</p>
                  <p className="text-xs opacity-70">اضغط للمراجعة والقبول أو الرفض</p>
                </div>
                <ChevronDown size={16} className="rotate-[270deg]" />
              </button>
            )}

            {targets.length > 0 && (
              <>
                <h2 className="font-black text-gray-900 text-sm flex items-center gap-2"><Award size={16} className="text-[#103c68]" /> التارجت والبونص</h2>
                {targets.map(t => <TargetCard key={t.id} t={t} />)}
              </>
            )}
            {targets.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
                <Award size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">لا توجد أهداف مضبوطة حتى الآن</p>
              </div>
            )}

            {(stats?.category_stats || []).length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2"><Package size={15} className="text-[#103c68]" /> المبيعات حسب الفئة</h3>
                <div className="space-y-2">
                  {stats!.category_stats.map(cat => (
                    <div key={cat.category} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 font-medium">{cat.category}</span>
                      <div className="text-end">
                        <p className="font-bold text-gray-900">{fmt(cat.total_revenue)} ﷼</p>
                        <p className="text-xs text-gray-400">{fmt(cat.total_qty)} وحدة</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── CLIENTS ────────────────────────────────────────────────── */}
        {tab === "clients" && (
          <>
            <div className="relative">
              <Search size={15} className="absolute top-3 end-3 text-gray-400" />
              <input value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الجوال أو الشركة..."
                className="w-full border border-gray-200 rounded-xl pe-9 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
              />
            </div>
            {!loading && filteredClients.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
                <Users size={36} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm font-semibold">لا يوجد عملاء مرتبطون</p>
                <p className="text-xs mt-1">يمكن للعملاء اختيارك كمندوب من ملفهم الشخصي</p>
              </div>
            )}
            {!loading && filteredClients.map(client => (
              <div key={client.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#103c68]/10 flex items-center justify-center text-[#103c68] font-black text-lg flex-shrink-0">
                    {client.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{client.name}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Phone size={10} />{client.phone}</p>
                    {client.company_name && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Building2 size={10} />{client.company_name}</p>}
                    {client.city && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={10} />{client.city}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-50">
                  <div className="text-center">
                    <p className="text-sm font-black text-gray-900">{fmt(client.order_count)}</p>
                    <p className="text-xs text-gray-400">طلب</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black text-[#103c68]">{fmt(client.total_revenue)} ﷼</p>
                    <p className="text-xs text-gray-400">إجمالي الطلبات</p>
                  </div>
                </div>
                <button onClick={() => viewStatement(client)}
                  className="w-full mt-3 bg-[#103c68]/5 hover:bg-[#103c68]/10 text-[#103c68] text-sm font-bold py-2 rounded-xl transition-colors flex items-center justify-center gap-2">
                  <FileText size={14} /> كشف حساب
                </button>
              </div>
            ))}
          </>
        )}

        {/* ── PENDING ────────────────────────────────────────────────── */}
        {tab === "pending" && (
          <>
            {/* ── Orders needing rep balance approval ── */}
            {!loading && repApprovalOrders.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-violet-700">
                  <AlertCircle size={15} />
                  طلبات تحتاج موافقتك على الرصيد ({repApprovalOrders.length})
                </div>
                {repApprovalOrders.map(o => {
                  const isOpen      = !!approvalStmtOpen[o.id];
                  const stmtLoading = !!approvalStmtLoading[o.id];
                  const stmt        = approvalStmts[o.id];
                  const balance     = stmt ? (stmt.summary.paid_revenue - stmt.summary.total_revenue) : null;
                  return (
                  <div key={o.id} className="bg-white rounded-2xl border border-violet-300 shadow-sm p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-gray-900 text-sm">{o.order_number}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-violet-100 text-violet-700 border-violet-200">
                            يحتاج موافقتك
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 font-semibold">{o.customer_name || o.customer_phone}</p>
                        <p className="text-xs text-gray-400">{o.product_name} × {o.quantity} {o.unit}</p>
                        <p className="text-xs text-gray-400">{fmtDate(o.created_at)}</p>
                      </div>
                      <div className="text-left flex-shrink-0">
                        <div className="font-black text-lg text-gray-900">{(o.total_with_vat || 0).toFixed(0)}</div>
                        <div className="text-xs text-gray-400">ر.س</div>
                      </div>
                    </div>

                    <div className="bg-violet-50 rounded-xl px-3 py-2 text-xs text-violet-700 font-medium">
                      أرسل إليك المراجع هذا الطلب لأن رصيد العميل غير كافٍ — قرر القبول أو الرفض
                    </div>

                    {/* Account statement toggle */}
                    <button
                      onClick={() => toggleApprovalStmt(o.id, o.customer_phone)}
                      className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 transition-colors">
                      <span className="flex items-center gap-1.5"><FileText size={12} className="text-[#103c68]" /> كشف حساب العميل</span>
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    {isOpen && (
                      <div className="rounded-xl border border-gray-100 overflow-hidden">
                        {stmtLoading && (
                          <div className="p-4 text-center text-xs text-gray-400 animate-pulse">جاري تحميل كشف الحساب…</div>
                        )}
                        {!stmtLoading && !stmt && (
                          <div className="p-4 text-center text-xs text-red-400">تعذّر تحميل الكشف</div>
                        )}
                        {!stmtLoading && stmt && (
                          <div className="p-3 space-y-2">
                            {/* Customer summary */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-gray-50 rounded-xl p-2 text-center">
                                <p className="text-xs text-gray-400">إجمالي الطلبات</p>
                                <p className="font-black text-sm text-gray-900">{fmt(stmt.summary.total_revenue)} ﷼</p>
                              </div>
                              <div className="bg-gray-50 rounded-xl p-2 text-center">
                                <p className="text-xs text-gray-400">المدفوع</p>
                                <p className="font-black text-sm text-gray-900">{fmt(stmt.summary.paid_revenue)} ﷼</p>
                              </div>
                            </div>
                            {balance !== null && (
                              <div className={`rounded-xl p-2 text-center border ${balance >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                                <p className="text-xs font-semibold mb-0.5">{balance >= 0 ? "رصيد دائن" : "رصيد مدين"}</p>
                                <p className={`font-black text-base ${balance >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                                  {balance >= 0 ? "+" : ""}{fmt(balance)} ﷼
                                </p>
                              </div>
                            )}
                            <div className="grid grid-cols-3 gap-1 text-center">
                              <div className="bg-blue-50 rounded-lg p-1.5">
                                <p className="text-xs font-black text-blue-800">{stmt.summary.total_orders}</p>
                                <p className="text-[10px] text-blue-600">إجمالي</p>
                              </div>
                              <div className="bg-green-50 rounded-lg p-1.5">
                                <p className="text-xs font-black text-green-800">{stmt.summary.delivered}</p>
                                <p className="text-[10px] text-green-600">مسلّم</p>
                              </div>
                              <div className="bg-red-50 rounded-lg p-1.5">
                                <p className="text-xs font-black text-red-800">{stmt.summary.cancelled}</p>
                                <p className="text-[10px] text-red-600">ملغي</p>
                              </div>
                            </div>
                            {/* Last 3 orders */}
                            {stmt.orders.slice(0, 3).map(ord => (
                              <div key={ord.id} className="flex items-center justify-between text-xs py-1.5 border-t border-gray-50">
                                <div>
                                  <p className="font-mono font-bold text-gray-700">{ord.order_number}</p>
                                  <p className="text-gray-400">{ord.product_name} × {ord.quantity}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-gray-800">{fmt(ord.total_with_vat)} ﷼</p>
                                  <p className="text-gray-400">{fmtDate(ord.created_at)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button onClick={() => repApproveOrder(o.id)}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                        <CheckCircle2 size={14} />قبول الطلب
                      </button>
                      <button onClick={() => repRejectOrder(o.id)}
                        className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold py-2.5 rounded-xl border border-red-200 transition-colors flex items-center justify-center gap-1.5">
                        <XCircle size={14} />رفض
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* ── Pending client link requests ── */}
            {!loading && pending.length > 0 && repApprovalOrders.length > 0 && (
              <div className="flex items-center gap-2 text-sm font-bold text-amber-700 pt-2 border-t border-gray-100">
                <Clock size={14} />طلبات ارتباط العملاء ({pending.length})
              </div>
            )}
            {!loading && pending.length === 0 && repApprovalOrders.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
                <CheckCircle2 size={36} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm font-semibold">لا توجد موافقات معلقة</p>
                <p className="text-xs mt-1">ستظهر هنا طلبات العملاء الجدد وطلبات الرصيد</p>
              </div>
            )}
            {!loading && pending.map(pc => (
              <div key={pc.link_id} className="bg-white rounded-2xl border border-amber-200 shadow-sm p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-black text-lg flex-shrink-0">
                    {pc.name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">{pc.name}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Phone size={10} />{pc.phone}</p>
                    {pc.company_name && <p className="text-xs text-gray-500 flex items-center gap-1"><Building2 size={10} />{pc.company_name}</p>}
                    <p className="text-xs text-amber-600 mt-1 font-medium">طلب الارتباط: {fmtDate(pc.linked_at)}</p>
                    <p className="text-xs text-gray-400">تاريخ التسجيل: {fmtDate(pc.registered_at)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveClient(pc.link_id, "approve")}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1">
                    <CheckCircle2 size={14} /> قبول
                  </button>
                  <button onClick={() => approveClient(pc.link_id, "reject")}
                    className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold py-2.5 rounded-xl border border-red-200 transition-colors flex items-center justify-center gap-1">
                    <XCircle size={14} /> رفض
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── ORDERS ─────────────────────────────────────────────────── */}
        {tab === "orders" && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {[{ key: "all", label: "الكل" }, ...Object.entries(STAGES).map(([k, v]) => ({ key: k, label: v.label }))].map(s => (
                <button key={s.key} onClick={() => setStageFilter(s.key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    stageFilter === s.key ? "bg-[#103c68] text-white border-[#103c68]" : "bg-white text-gray-600 border-gray-200 hover:border-[#103c68]/40"
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={15} className="absolute top-3 end-3 text-gray-400" />
              <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)}
                placeholder="ابحث برقم الطلب أو العميل..."
                className="w-full border border-gray-200 rounded-xl pe-9 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
              />
            </div>
            {!loading && filteredOrders.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
                <ShoppingCart size={36} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm font-semibold">لا توجد طلبات</p>
              </div>
            )}
            {!loading && filteredOrders.map(o => {
              const stg = STAGES[o.stage] || { label: o.stage, color: "bg-gray-100 text-gray-600 border-gray-200" };
              const expanded = expandedOrder === o.id;
              return (
                <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedOrder(expanded ? null : o.id)} className="w-full p-4 flex items-center gap-3 text-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-gray-900 text-sm">{o.order_number}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${stg.color}`}>{stg.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{o.customer_name || o.customer_phone} · {o.product_name}</p>
                      <p className="text-xs text-gray-400">{fmtDate(o.created_at)}</p>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <p className="font-black text-[#103c68]">{fmt(o.total_with_vat)} ﷼</p>
                      <p className="text-xs text-gray-400">{fmt(o.quantity)} {o.unit}</p>
                    </div>
                    {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </button>
                  {expanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-gray-50 space-y-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-gray-600">
                        <div><span className="text-gray-400">الموقع: </span>{o.delivery_location || "—"}</div>
                        <div><span className="text-gray-400">الدفع: </span>{o.payment_method === "transfer" ? "تحويل بنكي" : o.payment_method === "cash" ? "💵 نقداً" : "بطاقة"}</div>
                        <div><span className="text-gray-400">سعر الوحدة: </span>{fmt(o.unit_price)} ﷼</div>
                        <div><span className="text-gray-400">الجوال: </span>{o.customer_phone}</div>
                      </div>
                      {/* Cash approval action */}
                      {o.stage === "pending_cash_approval" && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-bold text-amber-800 flex items-center gap-1">
                            💵 طلب دفع نقدي — يحتاج موافقتك
                          </p>
                          <p className="text-xs text-amber-700">العميل {o.customer_name || o.customer_phone} يريد الدفع نقداً بمبلغ {fmt(o.total_with_vat)} ﷼</p>
                          <div className="flex gap-2">
                            <button onClick={() => approveCash(o.id, "approve")}
                              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 rounded-xl transition-colors flex items-center justify-center gap-1">
                              <CheckCircle2 size={13} /> موافقة
                            </button>
                            <button onClick={() => approveCash(o.id, "reject")}
                              className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold py-2 rounded-xl border border-red-200 transition-colors flex items-center justify-center gap-1">
                              <XCircle size={13} /> رفض
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ── NEW ORDER ──────────────────────────────────────────────── */}
        {tab === "newOrder" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="font-black text-gray-900 flex items-center gap-2"><Plus size={18} className="text-[#103c68]" /> طلب جديد لعميل</h2>

            {placeMsg.text && (
              <div className={`rounded-xl p-3 flex items-center gap-2 text-sm ${
                placeMsg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"
              }`}>
                {placeMsg.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                {placeMsg.text}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">العميل *</label>
              {clients.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-center gap-2">
                  <AlertCircle size={14} /> لا يوجد عملاء مرتبطون. يمكن للعملاء اختيارك من ملفهم الشخصي.
                </div>
              ) : (
                <select value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                  <option value="">— اختر العميل —</option>
                  {clients.map(c => <option key={c.phone} value={c.phone}>{c.name}{c.company_name ? ` (${c.company_name})` : ""} · {c.phone}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">المنتج *</label>
              <select value={form.product_id}
                onChange={e => {
                  const p = products.find(pr => String(pr.id) === e.target.value);
                  setForm(f => ({ ...f, product_id: e.target.value, unit_price: p ? String(p.price_per_unit) : "" }));
                }}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                <option value="">— اختر المنتج —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} · {fmt(p.price_per_unit)} ﷼/{p.unit}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">الكمية *</label>
                <input type="number" min="1" step="0.5" value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  placeholder={selectedProduct?.load_capacity ? `حتى ${selectedProduct.load_capacity} ${selectedProduct.unit}` : "0"}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">سعر الوحدة (﷼)</label>
                <input type="number" min="0" value={form.unit_price}
                  onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
                />
              </div>
            </div>

            {form.quantity && form.unit_price && (() => {
              const sub = parseFloat(form.quantity) * parseFloat(form.unit_price);
              const vat = sub * 0.15;
              return (
                <div className="bg-[#103c68]/5 rounded-xl p-3 text-xs text-gray-700 space-y-1">
                  <div className="flex justify-between"><span>قبل الضريبة</span><span className="font-bold">{fmt(sub)} ﷼</span></div>
                  <div className="flex justify-between"><span>ضريبة 15%</span><span className="font-bold">{fmt(vat)} ﷼</span></div>
                  <div className="flex justify-between text-[#103c68] font-black text-sm"><span>الإجمالي</span><span>{fmt(sub + vat)} ﷼</span></div>
                </div>
              );
            })()}

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">موقع التسليم</label>
              <input value={form.delivery_location} onChange={e => setForm(f => ({ ...f, delivery_location: e.target.value }))}
                placeholder="المدينة / الحي..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">نوع الوجهة</label>
                <select value={form.destination_type} onChange={e => setForm(f => ({ ...f, destination_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                  <option value="site">موقع</option>
                  <option value="warehouse">مستودع</option>
                  <option value="other">أخرى</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">طريقة الدفع</label>
                <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                  <option value="transfer">تحويل بنكي</option>
                  <option value="cash">كاش</option>
                  <option value="credit">آجل</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">ملاحظات</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="أي تعليمات خاصة..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none"
              />
            </div>

            <button onClick={placeOrder}
              disabled={placing || !form.customer_phone || !form.product_id || !form.quantity}
              className="w-full bg-[#103c68] hover:bg-[#0d2e50] disabled:opacity-50 text-white font-black py-4 rounded-2xl text-base transition-colors flex items-center justify-center gap-2 shadow-lg">
              <Truck size={18} />{placing ? "جاري الإرسال..." : "إرسال الطلب"}
            </button>
          </div>
        )}
      </div>

      {/* ── Statement Modal ─────────────────────────────────────────────── */}
      {stmtClient && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={() => { setStmtClient(null); setStmtData(null); }}>
          <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden max-h-[90vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="bg-[#103c68] text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-black text-lg">كشف حساب</h3>
                <p className="text-white/70 text-xs">{stmtClient.name}{stmtClient.company_name ? ` · ${stmtClient.company_name}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {stmtData && (
                  <button onClick={() => exportCSV(stmtData)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors" title="تصدير CSV">
                    <Download size={16} />
                  </button>
                )}
                <button onClick={() => { setStmtClient(null); setStmtData(null); }} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {stmtLoading && (
              <div className="flex justify-center py-12 text-gray-400">
                <RefreshCw size={24} className="animate-spin" />
              </div>
            )}

            {stmtData && !stmtLoading && (
              <>
                <div className="grid grid-cols-3 border-b border-gray-100 flex-shrink-0">
                  {[
                    { label: "إجمالي الطلبات", value: stmtData.summary.total_orders },
                    { label: "مسلَّم",          value: stmtData.summary.delivered },
                    { label: "المبيعات (﷼)",    value: fmt(stmtData.summary.total_revenue) },
                  ].map(s => (
                    <div key={s.label} className="text-center py-3 border-e border-gray-100 last:border-0">
                      <p className="text-lg font-black text-gray-900">{s.value}</p>
                      <p className="text-xs text-gray-400">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-y-auto flex-1 p-4 space-y-2">
                  {stmtData.orders.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-8">لا توجد طلبات</p>
                  )}
                  {stmtData.orders.map(o => {
                    const stg = STAGES[o.stage] || { label: o.stage, color: "bg-gray-100 text-gray-600 border-gray-200" };
                    return (
                      <div key={o.id} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{o.order_number}</p>
                          <p className="text-xs text-gray-500 truncate">{o.product_name} · {fmt(o.quantity)} {o.unit}</p>
                          <p className="text-xs text-gray-400">{fmtDate(o.created_at)}</p>
                        </div>
                        <div className="text-end flex-shrink-0">
                          <p className="text-sm font-black text-[#103c68]">{fmt(o.total_with_vat)} ﷼</p>
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full border font-bold mt-1 ${stg.color}`}>{stg.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ طلباتي (طلب للمندوب) TAB ══ */}
      {tab === "rep_requests" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <span className="text-xl">👤</span> طلباتي — تتبع الشحنات
              {activeRepRequests.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{activeRepRequests.length} نشط</span>
              )}
            </h2>
            <button onClick={() => fetch(`/api/rep-requests?rep_phone=${encodeURIComponent(repPhone)}`).then(r => r.ok ? r.json() : []).then(d => setRepRequests(Array.isArray(d) ? d : [])).catch(() => {})}
              className="text-xs text-gray-400 hover:text-gray-600 font-semibold flex items-center gap-1">
              🔄 تحديث
            </button>
          </div>

          {repRequests.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <div className="text-5xl">📦</div>
              <p className="font-semibold text-gray-500">لا توجد طلبات مرتبطة بك</p>
              <p className="text-xs text-gray-400">يقوم مشرف الدينا والأوناش بإنشاء الطلبات وإسنادها إليك</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {repRequests.map(req => {
                const statusMap: Record<string, { label: string; color: string; step: number }> = {
                  pending:          { label: "⏳ بانتظار تعيين سيارة",    color: "bg-amber-100 text-amber-800",   step: 1 },
                  vehicle_assigned: { label: "🚛 سيارة معيّنة — الفسحة",  color: "bg-blue-100 text-blue-800",     step: 2 },
                  permit_uploaded:  { label: "📄 الفسحة صادرة — التحميل", color: "bg-purple-100 text-purple-800", step: 3 },
                  loaded:           { label: "📦 في الطريق إليك",          color: "bg-indigo-100 text-indigo-800", step: 4 },
                  delivered:        { label: "✅ تم التسليم",               color: "bg-green-100 text-green-800",   step: 5 },
                  cancelled:        { label: "❌ ملغى",                     color: "bg-red-100 text-red-800",       step: 0 },
                };
                const st = statusMap[req.status] ?? { label: req.status, color: "bg-gray-100 text-gray-700", step: 0 };
                return (
                  <div key={req.id} className="p-5 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-gray-900 text-base">📦 {req.product_name}</div>
                        <div className="font-mono text-xs text-gray-400 mt-0.5">{req.request_no}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-bold flex-shrink-0 ${st.color}`}>{st.label}</span>
                    </div>

                    {/* Progress bar */}
                    {req.status !== "cancelled" && (
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(s => (
                          <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${
                            s <= st.step ? "bg-[#103c68]" : "bg-gray-100"
                          }`} />
                        ))}
                      </div>
                    )}

                    {/* Loading locations */}
                    {req.loading_locations?.length > 0 && (
                      <div className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2">
                        📍 أماكن التحميل: {req.loading_locations.join(" · ")}
                      </div>
                    )}

                    {/* Delivery location */}
                    {req.delivery_location && (
                      <div className="text-xs text-indigo-700 bg-indigo-50 rounded-xl px-3 py-2 break-all">
                        🗺️ {req.delivery_location}
                      </div>
                    )}

                    {/* Vehicle / driver (visible after vehicle_assigned) */}
                    {(req.vehicle_plate || req.driver_name) && (
                      <div className="flex flex-wrap gap-3 text-xs text-blue-800 bg-blue-50 rounded-xl px-3 py-2">
                        {req.vehicle_plate && <span>🚛 {req.vehicle_plate}</span>}
                        {req.driver_name   && <span>👨‍✈️ {req.driver_name}</span>}
                        {req.driver_phone  && (
                          <a href={`https://wa.me/966${req.driver_phone.replace(/^0/,"")}`} target="_blank" rel="noreferrer" className="text-green-600 underline font-bold">واتساب السائق</a>
                        )}
                      </div>
                    )}

                    {/* Permit photo link */}
                    {req.permit_photo_url && (
                      <a href={req.permit_photo_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 text-xs text-purple-700 bg-purple-50 rounded-xl px-3 py-2 font-semibold w-fit">
                        👁️ صورة الفسحة
                      </a>
                    )}

                    {/* Invoice photo link */}
                    {req.invoice_photo_url && (
                      <a href={req.invoice_photo_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-xl px-3 py-2 font-semibold w-fit">
                        📄 صورة الفاتورة
                      </a>
                    )}

                    {req.notes && <p className="text-xs text-gray-400 italic">{req.notes}</p>}

                    <div className="text-xs text-gray-400 border-t border-gray-50 pt-2">
                      {new Date(req.created_at).toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
