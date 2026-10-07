import { useEffect, useState, useMemo } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { useAuth } from "@/context/AuthContext";
import {
  CheckCircle, Clock, XCircle, RefreshCw, AlertTriangle,
  DollarSign, FileText, Search, Eye, X, ArrowRight,
  TrendingUp, Users, ShieldCheck, BanknoteIcon, BarChart3,
  Building2, BookOpen, Activity, Scale, Package, Calendar,
  ChevronDown, Wallet, UserCheck, Globe, PieChart, BadgeAlert,
  Send, Landmark, TrendingDown, CreditCard, Trash2, Download,
  RotateCcw, Pencil, Undo2,
} from "lucide-react";
import PasswordModal from "@/components/PasswordModal";

interface SlaStatus {
  stage: string; elapsed_minutes: number; limit_minutes: number;
  percent: number; status: "ok" | "warning" | "breached";
}
interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string;
  total_before_vat: number; vat_amount: number; total_with_vat: number;
  delivery_location: string; destination_type: string; stage: string;
  rep_id: number; payment_transfer_ref: string; payment_amount: number;
  reviewer_name: string; review_date: string; created_at: string;
  sla_status?: SlaStatus;
}
function SlaBadge({ sla }: { sla?: SlaStatus }) {
  if (!sla || sla.status === "ok") return null;
  if (sla.status === "breached")
    return (
      <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full" title={`تجاوز SLA: ${sla.elapsed_minutes} دق من ${sla.limit_minutes}`}>
        🚨 تجاوز SLA
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-full" title={`تحذير SLA: ${sla.elapsed_minutes} دق من ${sla.limit_minutes}`}>
      ⚠️ {sla.percent}% من الوقت
    </span>
  );
}
interface Transfer {
  id: number; customer_phone: string; customer_name: string; amount: number;
  transfer_date: string; transfer_ref: string; bank_name: string;
  confirmed: number; transfer_image: string; created_at: string;
}
interface ClientSummary {
  id: number; name: string; phone: string; company_name: string | null;
  vat_number: string | null; created_at: string;
  order_count: number; total_orders: number; total_paid: number; balance: number;
}
interface ClientProfile {
  customer: Record<string, unknown>;
  orders: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
  summary: { order_count: number; delivered_count: number; total_orders: number; total_paid: number; balance: number; };
}
interface PendingApproval {
  id: number; name: string; phone: string; company_name: string | null;
  vat_number: string | null; register_note: string | null; approval_status: string; created_at: string;
}
interface SalesData { name: string; count: number; revenue: number; }
interface SalesBreakdown {
  by_product: SalesData[]; by_packaging: SalesData[];
  by_rep: SalesData[]; by_warehouse: SalesData[];
  debts: { total_debt: number; debtor_count: number; };
  monthly_trend: { month: string; label: string; revenue: number; count: number; }[];
  total_revenue: number; total_delivered: number;
}
interface SystemLog {
  id: number; user_phone: string; user_name: string; user_role: string;
  action: string; entity_type: string; entity_id: string; details: string; created_at: string;
}
interface AuditorTransfer extends Transfer { company_name?: string | null; }

const STAGE_AR: Record<string, string> = {
  pending: "انتظار التأكيد", pending_cash_approval: "انتظار الكاش",
  pending_rep_approval: "انتظار المندوب",
  payment_confirmed: "مؤكد", vehicle_assigned: "تم تعيين سيارة",
  invoiced: "تم الفوترة", loaded: "محمّل", delivered: "مُسلَّم", cancelled: "ملغي",
};
const STAGE_COLOR: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  pending_cash_approval: "bg-orange-50 text-orange-700 border-orange-200",
  pending_rep_approval: "bg-violet-50 text-violet-700 border-violet-200",
  payment_confirmed: "bg-green-50 text-green-700 border-green-200",
  vehicle_assigned: "bg-blue-50 text-blue-700 border-blue-200",
  invoiced: "bg-purple-50 text-purple-700 border-purple-200",
  loaded: "bg-cyan-50 text-cyan-700 border-cyan-200",
  delivered: "bg-teal-50 text-teal-700 border-teal-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

export default function ReviewerOrders() {
  const { user } = useAuth();
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useRememberedState("reviewer-tab", "dashboard" as "dashboard" | "pending" | "all" | "transfers" | "client_approvals" | "clients" | "analytics" | "audit_log");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [transferRef,   setTransferRef]   = useState("");
  const [paymentAmt,    setPaymentAmt]    = useState("");
  const [search,        setSearch]        = useRememberedState("reviewer-search", "");
  const [submitting,    setSubmitting]    = useState(false);
  const [customerStatement, setCustomerStatement] = useState<ClientProfile | null>(null);
  const [loadingStatement,  setLoadingStatement]  = useState(false);

  // ── Auditor state ──────────────────────────────────────────────────────────
  const [clients,          setClients]          = useState<ClientSummary[]>([]);
  const [clientSearch,     setClientSearch]     = useRememberedState("reviewer-client-search", "");
  const [loadingClients,   setLoadingClients]   = useState(false);
  const [clientProfile,    setClientProfile]    = useState<ClientProfile | null>(null);
  const [profilePhone,     setProfilePhone]     = useState<string | null>(null);
  const [loadingProfile,   setLoadingProfile]   = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [salesBreakdown,   setSalesBreakdown]   = useState<SalesBreakdown | null>(null);
  const [systemLogs,       setSystemLogs]       = useState<SystemLog[]>([]);
  const [logSearch,        setLogSearch]        = useRememberedState("reviewer-log-search", "");
  const [logEntityType,    setLogEntityType]    = useRememberedState("reviewer-log-entity-type", "");
  const [transferPeriod,   setTransferPeriod]   = useRememberedState("reviewer-transfer-period", "month" as "all"|"today"|"week"|"month"|"year");
  const [auditorTransfers, setAuditorTransfers] = useState<AuditorTransfer[]>([]);
  const [loadingAudit,     setLoadingAudit]     = useState(false);

  // ── Password modal ─────────────────────────────────────────────────────────
  const [pwdModal, setPwdModal] = useState<{ type: "delete_transfer" | "reverse_delivery"; targetId: number } | null>(null);

  // ── Edit confirmed order modal ──────────────────────────────────────────────
  interface EditModal { order: Order; qty: string; unitPrice: string; }
  const [editModal, setEditModal] = useState<EditModal | null>(null);

  const openEditModal = (order: Order) => {
    const unitPrice = order.quantity > 0
      ? (order.total_before_vat / order.quantity).toFixed(2)
      : "0";
    setEditModal({ order, qty: String(order.quantity), unitPrice });
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/workflow/orders?role=reviewer").then(r => r.json()),
      fetch("/api/portal/transfers").then(r => r.json()),
    ]).then(([o, t]) => {
      setOrders(Array.isArray(o) ? o : []);
      setTransfers(Array.isArray(t) ? t : []);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  // ── Auditor load functions ─────────────────────────────────────────────────
  const loadClients = () => {
    setLoadingClients(true);
    fetch("/api/auditor/clients").then(r => r.json())
      .then(d => setClients(Array.isArray(d) ? d : []))
      .finally(() => setLoadingClients(false));
  };
  const openClientProfile = (phone: string) => {
    setProfilePhone(phone); setClientProfile(null); setLoadingProfile(true);
    fetch(`/api/auditor/clients/${phone}/profile`).then(r => r.json())
      .then(d => setClientProfile(d))
      .finally(() => setLoadingProfile(false));
  };
  const loadPendingApprovals = () => {
    fetch("/api/auditor/pending-approvals").then(r => r.json())
      .then(d => setPendingApprovals(Array.isArray(d) ? d : []));
  };
  const loadSalesBreakdown = () => {
    fetch("/api/auditor/sales-breakdown").then(r => r.json()).then(d => setSalesBreakdown(d));
  };
  const loadAuditorTransfers = (period: string) => {
    setLoadingAudit(true);
    const url = `/api/auditor/transfers${period !== "all" ? `?period=${period}` : ""}`;
    fetch(url).then(r => r.json())
      .then(d => setAuditorTransfers(Array.isArray(d) ? d : []))
      .finally(() => setLoadingAudit(false));
  };
  const loadSystemLogs = (search?: string, entityType?: string) => {
    const p = new URLSearchParams();
    if (search)     p.set("search",      search);
    if (entityType) p.set("entity_type", entityType);
    fetch(`/api/auditor/system-logs?${p}`).then(r => r.json())
      .then(d => setSystemLogs(Array.isArray(d.logs) ? d.logs : []));
  };
  useEffect(() => {
    loadClients(); loadPendingApprovals(); loadSalesBreakdown();
    loadAuditorTransfers("month"); loadSystemLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openConfirmModal = (order: Order) => {
    setSelectedOrder(order);
    setTransferRef("");
    setPaymentAmt(String(order.total_with_vat));
    setCustomerStatement(null);
    setLoadingStatement(true);
    fetch(`/api/portal/customers/${order.customer_phone}/statement`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setCustomerStatement(d))
      .catch(() => setCustomerStatement(null))
      .finally(() => setLoadingStatement(false));
  };

  const sendToRep = async () => {
    if (!selectedOrder || !user) return;
    if (!selectedOrder.rep_id) { alert("لا يوجد مندوب مرتبط بهذا الطلب"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/send-to-rep`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer_phone: user.phone, reviewer_name: user.name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedOrder(null);
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const confirmPayment = async () => {
    if (!selectedOrder || !user) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/confirm-payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewer_phone: user.phone, reviewer_name: user.name,
          payment_transfer_ref: transferRef, payment_amount: paymentAmt,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedOrder(null); setTransferRef(""); setPaymentAmt("");
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const confirmTransfer = async (id: number) => {
    await fetch(`/api/portal/transfers/${id}/confirm`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer_phone: user?.phone }),
    });
    load();
  };

  const deleteTransfer = (id: number) => {
    setPwdModal({ type: "delete_transfer", targetId: id });
  };

  const reverseDelivery = (id: number) => {
    setPwdModal({ type: "reverse_delivery", targetId: id });
  };

  const handlePasswordConfirm = async (password: string) => {
    if (!pwdModal) return;
    try {
      if (pwdModal.type === "delete_transfer") {
        const res = await fetch(`/api/portal/transfers/${pwdModal.targetId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, caller_phone: user?.phone }),
        });
        if (!res.ok) { const e = await res.json(); alert(e.error || "خطأ في الحذف"); return; }
        setTransfers(prev => prev.filter(t => t.id !== pwdModal.targetId));
        load();
      } else if (pwdModal.type === "reverse_delivery") {
        const res = await fetch(`/api/workflow/orders/${pwdModal.targetId}/reverse-delivery`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "عكس التسليم من لوحة المراجع", password, caller_phone: user?.phone }),
        });
        if (!res.ok) { const e = await res.json(); alert(e.error || "خطأ في العملية"); return; }
        load();
      }
      setPwdModal(null);
    } catch { alert("حدث خطأ. حاول مرة أخرى."); }
  };

  const exportTransfersExcel = () => {
    const BOM = "\uFEFF";
    const headers = ["#", "اسم العميل", "رقم الجوال", "المبلغ (ر.س)", "البنك", "مرجع التحويل", "تاريخ التحويل", "الحالة", "تاريخ الإدخال"];
    const rows = transfers.map((t, i) => [
      i + 1,
      t.customer_name || "",
      t.customer_phone || "",
      (t.amount || 0).toFixed(2),
      t.bank_name || "",
      t.transfer_ref || "",
      t.transfer_date ? new Date(t.transfer_date).toLocaleDateString("ar-SA") : "",
      t.confirmed ? "مؤكد" : "معلق",
      t.created_at ? new Date(t.created_at).toLocaleDateString("ar-SA") : "",
    ]);
    const csv = BOM + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `تحويلات_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const cancelOrder = async (id: number) => {
    const reason = prompt("سبب الإلغاء:");
    if (reason === null) return;
    const res = await fetch(`/api/workflow/orders/${id}/cancel`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelled_by: user?.name || user?.phone, cancel_reason: reason }),
    });
    if (!res.ok) { const e = await res.json(); alert(e.error || "خطأ"); return; }
    load();
  };

  const unconfirmOrder = async (id: number) => {
    const reason = prompt("سبب إلغاء التأكيد (اختياري):");
    if (reason === null) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflow/orders/${id}/unconfirm`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const submitEditConfirmed = async () => {
    if (!editModal) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflow/orders/${editModal.order.id}/edit-confirmed`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: editModal.qty, unit_price: editModal.unitPrice }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditModal(null);
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const approveCash = async (id: number) => {
    if (!user) return;
    const note = prompt("ملاحظة اختيارية (أو اضغط موافق للمتابعة):");
    if (note === null) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflow/orders/${id}/approve-cash`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approver_phone: user.phone, approver_name: user.name, note }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const pendingOrders = useMemo(
    () => orders.filter(o => ["pending", "pending_cash_approval", "pending_rep_approval"].includes(o.stage)),
    [orders]
  );
  const confirmedOrders  = useMemo(() => orders.filter(o => o.stage !== "pending" && o.stage !== "cancelled"), [orders]);
  const pendingTransfers = useMemo(() => transfers.filter(t => !t.confirmed), [transfers]);
  const totalRevenue     = useMemo(() => orders.filter(o => o.stage === "delivered").reduce((s, o) => s + (o.total_with_vat || 0), 0), [orders]);

  const filteredAll = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o =>
      !q || o.order_number?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.customer_phone?.includes(q)
    );
  }, [orders, search]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={22} className="animate-spin text-[#103c68]" />
    </div>
  );

  const StagePill = ({ stage }: { stage: string }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${STAGE_COLOR[stage] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
      {STAGE_AR[stage] ?? stage}
    </span>
  );

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShieldCheck size={24} className="text-[#103c68]" />لوحة المراجع
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {pendingOrders.length} طلب ينتظر التأكيد
            {pendingTransfers.length > 0 && ` · ${pendingTransfers.length} تحويل معلق`}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl text-sm transition-colors">
          <RefreshCw size={14} />تحديث
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 flex-wrap bg-gray-100 p-1.5 rounded-2xl w-fit">
        {([
          { id: "dashboard",  label: "الرئيسية",     icon: BarChart3 },
          { id: "pending",    label: "تحتاج تأكيد",  icon: Clock,        count: pendingOrders.length },
          { id: "all",        label: "كل الطلبات",   icon: FileText,     count: orders.length },
          { id: "transfers",       label: "التحويلات",      icon: BanknoteIcon, count: pendingTransfers.length },
          { id: "client_approvals", label: "طلبات عملاء",   icon: UserCheck,    count: pendingApprovals.length },
          { id: "clients",          label: "حسابات العملاء", icon: Building2 },
          { id: "analytics",        label: "التحليلات",      icon: PieChart },
          { id: "audit_log",        label: "سجل التدقيق",   icon: BookOpen },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon size={14} />{t.label}
              {"count" in t && t.count !== undefined && t.count > 0 && (
                <span className={`text-xs font-black px-1.5 rounded-full
                  ${t.id === "pending" || t.id === "transfers" ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-600"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══ DASHBOARD ══ */}
      {tab === "dashboard" && (
        <div className="space-y-5">
          {/* Alerts */}
          {(pendingOrders.length > 0 || pendingTransfers.length > 0) && (
            <div className="space-y-2">
              {pendingOrders.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
                    <div>
                      <div className="font-bold text-amber-800">{pendingOrders.length} طلب ينتظر مراجعتك وتأكيد الدفع</div>
                      <div className="text-xs text-amber-600 mt-0.5">تأكد من وصول المبلغ قبل الموافقة</div>
                    </div>
                  </div>
                  <button onClick={() => setTab("pending")}
                    className="flex-shrink-0 bg-amber-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-amber-600 flex items-center gap-1">
                    مراجعة <ArrowRight size={12} />
                  </button>
                </div>
              )}
              {pendingTransfers.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <BanknoteIcon size={18} className="text-blue-500 flex-shrink-0" />
                    <div className="font-bold text-blue-800">{pendingTransfers.length} تحويل بنكي بانتظار تأكيد الاستلام</div>
                  </div>
                  <button onClick={() => setTab("transfers")}
                    className="flex-shrink-0 bg-blue-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-600 flex items-center gap-1">
                    تأكيد <ArrowRight size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "طلبات معلقة",    val: pendingOrders.length,   color: "bg-amber-500",  icon: Clock },
              { label: "طلبات مؤكدة",    val: confirmedOrders.length, color: "bg-green-500",  icon: CheckCircle },
              { label: "إجمالي الطلبات", val: orders.length,          color: "bg-[#103c68]",  icon: FileText },
              { label: "تحويلات معلقة",  val: pendingTransfers.length,color: "bg-purple-500", icon: BanknoteIcon },
            ].map(({ label, val, color, icon: Icon }) => (
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

          {/* Revenue banner */}
          <div className="bg-gradient-to-l from-[#103c68] to-[#1a5899] rounded-2xl p-6 text-white flex items-center justify-between">
            <div>
              <div className="text-sm opacity-70">إيرادات الطلبات المُسلَّمة (شامل الضريبة)</div>
              <div className="text-4xl font-black mt-1">{totalRevenue.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س</div>
              <div className="text-xs opacity-50 mt-1">{orders.filter(o => o.stage === "delivered").length} طلب مُسلَّم</div>
            </div>
            <TrendingUp size={60} className="opacity-10" />
          </div>

          {/* Stage breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-4">توزيع حالات الطلبات</h2>
            <div className="space-y-2.5">
              {Object.entries(STAGE_AR).map(([stage, label]) => {
                const count = orders.filter(o => o.stage === stage).length;
                if (count === 0) return null;
                const pct = orders.length ? Math.round((count / orders.length) * 100) : 0;
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <div className="w-24 text-xs text-gray-500 text-left flex-shrink-0">{label}</div>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#103c68] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-10 text-xs font-bold text-gray-700 text-left">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent orders */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">آخر الطلبات</h2>
              <button onClick={() => setTab("all")} className="text-xs text-[#103c68] font-semibold hover:underline">عرض الكل</button>
            </div>
            <div className="divide-y divide-gray-50">
              {orders.slice(0, 5).map(o => (
                <div key={o.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</div>
                    <div className="text-sm font-semibold text-gray-800 truncate">{o.customer_name || o.customer_phone}</div>
                    <div className="text-xs text-gray-400">{o.product_name} × {o.quantity} {o.unit}</div>
                  </div>
                  <div className="text-left flex-shrink-0 space-y-1">
                    <div className="font-bold text-sm">{o.total_with_vat?.toFixed(0)} ر.س</div>
                    <StagePill stage={o.stage} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ PENDING ══ */}
      {tab === "pending" && (
        <div className="space-y-4">
          {pendingOrders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <CheckCircle size={40} className="mx-auto mb-3 text-green-400 opacity-60" />
              <p className="font-semibold text-gray-600">لا توجد طلبات معلقة</p>
              <p className="text-sm text-gray-400 mt-1">جميع الطلبات تمت مراجعتها</p>
            </div>
          ) : pendingOrders.map(order => (
            <div key={order.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <div className="font-mono text-xs text-[#103c68] font-bold">{order.order_number}</div>
                    <SlaBadge sla={order.sla_status} />
                  </div>
                  <div className="font-black text-gray-900 text-lg">{order.customer_name || order.customer_phone}</div>
                  <div className="text-sm text-gray-500">{order.product_name} × {order.quantity} {order.unit}</div>
                  <div className="text-xs text-gray-400 mt-1">📍 {order.delivery_location} · {order.destination_type}</div>
                </div>
                <div className="text-left flex-shrink-0">
                  <div className="font-black text-2xl text-gray-900">{order.total_with_vat?.toFixed(2)}</div>
                  <div className="text-xs text-gray-400">ر.س شامل الضريبة</div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-sm mb-4">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">قبل الضريبة</div>
                  <div className="font-bold">{order.total_before_vat?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">ضريبة 15%</div>
                  <div className="font-bold">{order.vat_amount?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">الإجمالي</div>
                  <div className="font-black text-[#103c68]">{order.total_with_vat?.toFixed(2)}</div>
                </div>
              </div>

              <div className="text-xs text-gray-400 mb-4">
                {new Date(order.created_at).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}
              </div>

              {order.stage === "pending_cash_approval" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-sm text-orange-700 font-semibold">
                    <DollarSign size={14} />طلب دفع نقدي — يحتاج موافقة
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => approveCash(order.id)} disabled={submitting}
                      className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-60">
                      <CheckCircle size={15} />الموافقة على الكاش
                    </button>
                    <button onClick={() => cancelOrder(order.id)}
                      className="px-3 py-3 border border-red-200 text-red-500 rounded-xl hover:bg-red-50 transition-colors">
                      <XCircle size={18} />
                    </button>
                  </div>
                </div>
              ) : order.stage === "pending_rep_approval" ? (
                <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 text-sm text-violet-700 font-semibold">
                  <Send size={14} />في انتظار موافقة المندوب على الطلب
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => openConfirmModal(order)}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-sm transition-colors">
                    <CheckCircle size={15} />مراجعة الحساب والتأكيد
                  </button>
                  <button onClick={() => cancelOrder(order.id)}
                    className="px-3 py-3 border border-red-200 text-red-500 rounded-xl hover:bg-red-50 transition-colors">
                    <XCircle size={18} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══ ALL ORDERS ══ */}
      {tab === "all" && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={15} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالرقم أو العميل أو الجوال..."
              className="w-full bg-white border border-gray-200 rounded-xl pe-10 ps-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 shadow-sm" />
          </div>
          <div className="text-xs text-gray-400 px-1">عرض {filteredAll.length} من {orders.length}</div>

          {filteredAll.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">لا توجد نتائج</div>
          ) : (
            <div className="space-y-3">
              {filteredAll.map(o => (
                <div key={o.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${
                    o.stage === "pending" ? "border-amber-200"
                    : o.stage === "pending_cash_approval" ? "border-orange-200"
                    : "border-gray-100"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</span>
                        <StagePill stage={o.stage} />
                        <SlaBadge sla={o.sla_status} />
                      </div>
                      <div className="font-semibold text-gray-800 truncate">{o.customer_name || o.customer_phone}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{o.product_name} × {o.quantity} {o.unit}</div>
                      {o.payment_transfer_ref && (
                        <div className="text-xs text-green-600 mt-1 font-mono">تحويل: {o.payment_transfer_ref}</div>
                      )}
                    </div>
                    <div className="text-left flex-shrink-0 space-y-1">
                      <div className="font-black text-gray-900">{o.total_with_vat?.toFixed(0)} ر.س</div>
                      <div className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString("ar-SA")}</div>
                    </div>
                  </div>
                  {o.reviewer_name && (
                    <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                      <CheckCircle size={11} className="text-green-500" />
                      {o.reviewer_name} — {o.review_date ? new Date(o.review_date).toLocaleDateString("ar-SA") : ""}
                    </div>
                  )}
                  {o.stage === "pending" && (
                    <button onClick={() => openConfirmModal(o)}
                      className="mt-3 w-full py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5">
                      <Eye size={12} />مراجعة الحساب والتأكيد
                    </button>
                  )}
                  {o.stage === "pending_rep_approval" && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-violet-600 font-semibold">
                      <Send size={11} />في انتظار موافقة المندوب
                    </div>
                  )}
                  {o.stage === "pending_cash_approval" && (
                    <button onClick={() => approveCash(o.id)} disabled={submitting}
                      className="mt-3 w-full py-2 bg-orange-500 text-white rounded-xl text-xs font-bold hover:bg-orange-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5">
                      <DollarSign size={13} />الموافقة على الدفع النقدي
                    </button>
                  )}
                  {o.stage === "payment_confirmed" && (
                    <div className="mt-3 flex gap-1.5">
                      <button onClick={() => unconfirmOrder(o.id)} disabled={submitting}
                        title="إلغاء التأكيد وإعادة للانتظار"
                        className="flex-1 flex items-center justify-center gap-1 py-2 border border-amber-300 text-amber-700 bg-amber-50 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors disabled:opacity-50">
                        <Undo2 size={12} />إلغاء التأكيد
                      </button>
                      <button onClick={() => openEditModal(o)}
                        title="تعديل الكمية والمبلغ"
                        className="flex-1 flex items-center justify-center gap-1 py-2 border border-blue-200 text-blue-700 bg-blue-50 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors">
                        <Pencil size={12} />تعديل
                      </button>
                      <button onClick={() => cancelOrder(o.id)}
                        title="إلغاء الطلب نهائياً"
                        className="px-3 py-2 border border-red-200 text-red-500 rounded-xl hover:bg-red-50 transition-colors">
                        <XCircle size={15} />
                      </button>
                    </div>
                  )}
                  {o.stage === "delivered" && (
                    <button onClick={() => reverseDelivery(o.id)}
                      className="mt-3 w-full py-2 border border-orange-200 text-orange-600 rounded-xl text-xs font-bold hover:bg-orange-50 transition-colors flex items-center justify-center gap-1.5">
                      <RotateCcw size={13} />عكس التسليم
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ TRANSFERS ══ */}
      {tab === "transfers" && (
        <div className="space-y-3">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700">
              {transfers.length} تحويل
              {transfers.filter(t => !t.confirmed).length > 0 && (
                <span className="mr-2 text-amber-600">({transfers.filter(t => !t.confirmed).length} معلق)</span>
              )}
            </span>
            <button
              onClick={exportTransfersExcel}
              disabled={transfers.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold disabled:opacity-40 transition-colors">
              <Download size={13} />تصدير إكسل
            </button>
          </div>

          {transfers.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">لا توجد تحويلات</div>
          ) : transfers.map(t => (
            <div key={t.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${!t.confirmed ? "border-amber-200" : "border-gray-100"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-green-700 text-lg">{t.amount?.toFixed(2)} ر.س</span>
                    {t.confirmed ? (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold border border-green-200">✓ مؤكد</span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-semibold border border-amber-200">معلق</span>
                    )}
                  </div>
                  <div className="font-semibold text-gray-800">{t.customer_name || t.customer_phone}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {t.bank_name && `${t.bank_name} · `}
                    <span className="font-mono">{t.transfer_ref}</span>
                  </div>
                  <div className="text-xs text-gray-400">{new Date(t.transfer_date).toLocaleDateString("ar-SA")}</div>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-2">
                  {t.transfer_image && (
                    <a href={t.transfer_image} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-[#103c68] hover:underline font-semibold">
                      <Eye size={11} />الصورة
                    </a>
                  )}
                  {!t.confirmed && (
                    <button onClick={() => confirmTransfer(t.id)}
                      className="bg-[#103c68] text-white text-xs px-3 py-2 rounded-xl hover:bg-[#0d3158] font-bold transition-colors">
                      تأكيد
                    </button>
                  )}
                  <button
                    onClick={() => deleteTransfer(t.id)}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors">
                    <Trash2 size={12} />حذف
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ CLIENT APPROVALS ══ */}
      {tab === "client_approvals" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2"><UserCheck size={18} className="text-[#103c68]" />طلبات تسجيل عملاء جدد</h2>
              <p className="text-xs text-gray-400 mt-0.5">عرض فقط — لمراجعة الملف المالي. التفعيل يتم من لوحة المدير</p>
            </div>
            <button onClick={loadPendingApprovals} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 border border-gray-200 rounded-xl text-sm hover:bg-gray-50"><RefreshCw size={13} />تحديث</button>
          </div>
          {pendingApprovals.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <UserCheck size={32} className="mx-auto text-green-400 mb-3" />
              <p className="text-gray-500 font-semibold">لا توجد طلبات معلقة</p>
              <p className="text-xs text-gray-400 mt-1">جميع طلبات التسجيل تمت معالجتها</p>
            </div>
          ) : pendingApprovals.map(a => (
            <div key={a.id} className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-8 h-8 rounded-full bg-[#103c68] text-white flex items-center justify-center text-sm font-black">{a.name?.charAt(0)}</span>
                    <div>
                      <div className="font-black text-gray-900">{a.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{a.phone}</div>
                    </div>
                    <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full border border-amber-200 font-semibold">معلق</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                    {a.company_name && <div className="bg-gray-50 rounded-lg px-2 py-1"><span className="text-gray-400">الشركة: </span><span className="font-semibold">{a.company_name}</span></div>}
                    {a.vat_number   && <div className="bg-gray-50 rounded-lg px-2 py-1"><span className="text-gray-400">الرقم الضريبي: </span><span className="font-mono font-semibold">{a.vat_number}</span></div>}
                    {a.register_note && <div className="bg-gray-50 rounded-lg px-2 py-1 col-span-2"><span className="text-gray-400">ملاحظة: </span><span>{a.register_note}</span></div>}
                    <div className="text-gray-400"><Calendar size={10} className="inline ml-1" />{new Date(a.created_at).toLocaleDateString("ar-SA")}</div>
                  </div>
                </div>
                <button onClick={() => openClientProfile(a.phone)}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-[#103c68] text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-[#0d3158] transition-colors">
                  <Eye size={13} />الملف المالي
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ CLIENTS DIRECTORY ══ */}
      {tab === "clients" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2"><Building2 size={18} className="text-[#103c68]" />دليل حسابات العملاء</h2>
              <p className="text-xs text-gray-400 mt-0.5">{clients.length} عميل · عرض فقط</p>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                  placeholder="بحث باسم أو رقم..." dir="rtl"
                  className="pr-9 pl-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 w-52" />
              </div>
              <button onClick={loadClients} disabled={loadingClients} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
                <RefreshCw size={13} className={loadingClients ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
          {loadingClients ? (
            <div className="flex items-center justify-center py-16"><RefreshCw size={22} className="animate-spin text-[#103c68]" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {clients.filter(c =>
                !clientSearch || c.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
                c.phone?.includes(clientSearch) || c.company_name?.toLowerCase().includes(clientSearch.toLowerCase())
              ).map(c => (
                <button key={c.phone} onClick={() => openClientProfile(c.phone)}
                  className="bg-white border border-gray-100 rounded-2xl p-4 text-right hover:border-[#103c68]/30 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#103c68] to-[#1a5a9a] text-white flex items-center justify-center text-sm font-black flex-shrink-0">
                          {c.name?.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-gray-900 truncate">{c.name}</div>
                          <div className="text-xs text-gray-400 font-mono">{c.phone}</div>
                        </div>
                      </div>
                      {c.company_name && <div className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Globe size={10} />{c.company_name}</div>}
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                          <div className="font-black text-[#103c68]">{c.order_count}</div>
                          <div className="text-gray-400">طلب</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                          <div className="font-black text-gray-700">{c.total_paid.toFixed(0)}</div>
                          <div className="text-gray-400">مدفوع</div>
                        </div>
                        <div className={`rounded-lg p-1.5 text-center ${c.balance >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                          <div className={`font-black ${c.balance >= 0 ? "text-green-700" : "text-red-600"}`}>{Math.abs(c.balance).toFixed(0)}</div>
                          <div className={`text-xs ${c.balance >= 0 ? "text-green-500" : "text-red-400"}`}>{c.balance >= 0 ? "رصيد" : "مديون"}</div>
                        </div>
                      </div>
                    </div>
                    <Eye size={15} className="text-gray-300 group-hover:text-[#103c68] transition-colors flex-shrink-0 mt-1" />
                  </div>
                </button>
              ))}
              {clients.length === 0 && !loadingClients && (
                <div className="col-span-2 text-center py-12 text-gray-400">لا يوجد عملاء</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ ANALYTICS ══ */}
      {tab === "analytics" && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2"><PieChart size={18} className="text-[#103c68]" />لوحة التحليلات المالية</h2>
            <p className="text-xs text-gray-400 mt-0.5">بيانات مجمّعة من كامل العمليات · عرض فقط</p>
          </div>

          {/* KPI Row */}
          {salesBreakdown && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-[#103c68] to-[#1a5a9a] rounded-2xl p-4 text-white">
                  <div className="text-xs opacity-70 mb-1 flex items-center gap-1"><Wallet size={11} />إجمالي الإيرادات</div>
                  <div className="text-2xl font-black">{salesBreakdown.total_revenue.toLocaleString("ar-SA", {maximumFractionDigits:0})}</div>
                  <div className="text-xs opacity-60">ر.س · مسلَّم</div>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Package size={11} />طلبات مكتملة</div>
                  <div className="text-2xl font-black text-gray-900">{salesBreakdown.total_delivered}</div>
                  <div className="text-xs text-gray-400">طلب تم تسليمه</div>
                </div>
                <div className={`rounded-2xl p-4 shadow-sm border ${salesBreakdown.debts.total_debt > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                  <div className={`text-xs mb-1 flex items-center gap-1 ${salesBreakdown.debts.total_debt > 0 ? "text-red-400" : "text-green-500"}`}>
                    <BadgeAlert size={11} />إجمالي المديونيات
                  </div>
                  <div className={`text-2xl font-black ${salesBreakdown.debts.total_debt > 0 ? "text-red-700" : "text-green-700"}`}>
                    {salesBreakdown.debts.total_debt.toLocaleString("ar-SA", {maximumFractionDigits:0})}
                  </div>
                  <div className={`text-xs ${salesBreakdown.debts.total_debt > 0 ? "text-red-400" : "text-green-500"}`}>
                    ر.س · {salesBreakdown.debts.debtor_count} عميل مدين
                  </div>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Activity size={11} />الاتجاه الشهري</div>
                  <div className="flex items-end gap-0.5 h-10">
                    {salesBreakdown.monthly_trend.map((m, i) => {
                      const max = Math.max(...salesBreakdown.monthly_trend.map(x => x.revenue), 1);
                      const h = Math.max(4, Math.round((m.revenue / max) * 36));
                      return <div key={i} title={`${m.label}: ${m.revenue.toLocaleString()} ر.س`}
                        className={`flex-1 rounded-sm transition-all ${i === 5 ? "bg-[#103c68]" : "bg-gray-200"}`}
                        style={{ height: `${h}px` }} />;
                    })}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">آخر 6 أشهر</div>
                </div>
              </div>

              {/* Monthly trend detail */}
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <h3 className="font-black text-gray-800 text-sm mb-3 flex items-center gap-2"><Activity size={14} className="text-[#103c68]" />الاتجاه الشهري للإيرادات</h3>
                <div className="space-y-2">
                  {[...salesBreakdown.monthly_trend].reverse().map((m, i) => {
                    const max = Math.max(...salesBreakdown.monthly_trend.map(x => x.revenue), 1);
                    const pct = Math.round((m.revenue / max) * 100);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-16 text-xs text-gray-500 text-left font-semibold">{m.label}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-l from-[#103c68] to-[#1a5a9a] transition-all"
                            style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-28 text-xs text-left font-black text-gray-800">{m.revenue.toLocaleString("ar-SA",{maximumFractionDigits:0})} ر.س</div>
                        <div className="w-10 text-xs text-gray-400 text-left">{m.count} ط</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sales breakdown tables */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* By Product */}
                {salesBreakdown.by_product.length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <h3 className="font-black text-gray-800 text-sm mb-3 flex items-center gap-2"><Package size={14} className="text-[#103c68]" />المبيعات حسب المنتج</h3>
                    <div className="space-y-2">
                      {salesBreakdown.by_product.map((p, i) => {
                        const max = salesBreakdown.by_product[0]?.revenue || 1;
                        return (
                          <div key={i}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="font-semibold text-gray-700 truncate max-w-[60%]">{p.name}</span>
                              <span className="font-black text-[#103c68]">{p.revenue.toLocaleString("ar-SA",{maximumFractionDigits:0})} ر.س</span>
                            </div>
                            <div className="bg-gray-100 rounded-full h-2">
                              <div className="h-full rounded-full bg-[#103c68]" style={{ width: `${Math.round((p.revenue/max)*100)}%` }} />
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">{p.count} طلب</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* By Packaging */}
                {salesBreakdown.by_packaging.length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <h3 className="font-black text-gray-800 text-sm mb-3 flex items-center gap-2"><Scale size={14} className="text-[#103c68]" />المبيعات حسب نوع التعبئة</h3>
                    <div className="space-y-2">
                      {salesBreakdown.by_packaging.map((p, i) => {
                        const total = salesBreakdown.by_packaging.reduce((s, x) => s + x.count, 0) || 1;
                        const pct = Math.round((p.count / total) * 100);
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#103c68] text-white flex items-center justify-center text-xs font-black">{pct}%</div>
                            <div className="flex-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-semibold text-gray-700">{p.name}</span>
                                <span className="font-black text-gray-800">{p.count} طلب</span>
                              </div>
                              <div className="bg-gray-100 rounded-full h-1.5 mt-0.5">
                                <div className="h-full rounded-full bg-gradient-to-l from-[#103c68] to-[#1a5a9a]" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* By Rep */}
                {salesBreakdown.by_rep.length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <h3 className="font-black text-gray-800 text-sm mb-3 flex items-center gap-2"><Users size={14} className="text-[#103c68]" />المبيعات حسب المندوب</h3>
                    <div className="space-y-3">
                      {salesBreakdown.by_rep.slice(0,8).map((r, i) => {
                        const max = salesBreakdown.by_rep[0]?.revenue || 1;
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500">{i+1}</div>
                            <div className="flex-1">
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="font-semibold text-gray-700 truncate">{r.name}</span>
                                <span className="font-black text-[#103c68]">{r.revenue.toLocaleString("ar-SA",{maximumFractionDigits:0})} ر.س</span>
                              </div>
                              <div className="bg-gray-100 rounded-full h-2">
                                <div className="h-full rounded-full bg-gradient-to-l from-[#103c68] to-blue-300" style={{ width: `${Math.round((r.revenue/max)*100)}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* By Warehouse */}
                {salesBreakdown.by_warehouse.filter(w => w.name !== "غير محدد").length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <h3 className="font-black text-gray-800 text-sm mb-3 flex items-center gap-2"><Globe size={14} className="text-[#103c68]" />المبيعات حسب المستودع</h3>
                    <div className="space-y-2">
                      {salesBreakdown.by_warehouse.filter(w => w.name !== "غير محدد").map((w, i) => {
                        const max = salesBreakdown.by_warehouse[0]?.revenue || 1;
                        return (
                          <div key={i}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="font-semibold text-gray-700">{w.name}</span>
                              <span className="font-black text-gray-800">{w.revenue.toLocaleString("ar-SA",{maximumFractionDigits:0})} ر.س</span>
                            </div>
                            <div className="bg-gray-100 rounded-full h-2">
                              <div className="h-full rounded-full bg-gradient-to-l from-[#103c68] to-cyan-400" style={{ width: `${Math.round((w.revenue/max)*100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Bank transfers tracker */}
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h3 className="font-black text-gray-800 text-sm flex items-center gap-2"><BanknoteIcon size={14} className="text-[#103c68]" />متابعة التحويلات البنكية</h3>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select value={transferPeriod}
                        onChange={e => { setTransferPeriod(e.target.value as typeof transferPeriod); loadAuditorTransfers(e.target.value); }}
                        className="appearance-none pr-8 pl-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 font-semibold">
                        <option value="today">اليوم</option>
                        <option value="week">هذا الأسبوع</option>
                        <option value="month">هذا الشهر</option>
                        <option value="year">هذه السنة</option>
                        <option value="all">الكل</option>
                      </select>
                      <ChevronDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    {loadingAudit && <RefreshCw size={13} className="animate-spin text-gray-400" />}
                  </div>
                </div>
                <div className="flex gap-4 mb-3 text-sm">
                  <div className="bg-[#103c68]/5 rounded-xl p-3 flex-1 text-center">
                    <div className="font-black text-[#103c68] text-lg">{auditorTransfers.filter(t => t.confirmed).reduce((s,t) => s + t.amount, 0).toLocaleString("ar-SA",{maximumFractionDigits:0})}</div>
                    <div className="text-xs text-gray-400">ر.س مؤكدة</div>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 flex-1 text-center">
                    <div className="font-black text-amber-700 text-lg">{auditorTransfers.filter(t => !t.confirmed).reduce((s,t) => s + t.amount, 0).toLocaleString("ar-SA",{maximumFractionDigits:0})}</div>
                    <div className="text-xs text-gray-400">ر.س معلقة</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 flex-1 text-center">
                    <div className="font-black text-gray-700 text-lg">{auditorTransfers.length}</div>
                    <div className="text-xs text-gray-400">إجمالي التحويلات</div>
                  </div>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {auditorTransfers.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm">لا توجد تحويلات في هذه الفترة</div>
                  ) : auditorTransfers.slice(0,20).map(t => (
                    <div key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-xs ${t.confirmed ? "border-green-100 bg-green-50/50" : "border-amber-100 bg-amber-50/50"}`}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.confirmed ? "bg-green-500" : "bg-amber-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-800">{t.customer_name || t.customer_phone}</div>
                        {(t as AuditorTransfer).company_name && <div className="text-gray-400">{(t as AuditorTransfer).company_name}</div>}
                      </div>
                      <div className="font-black text-green-700">{t.amount?.toLocaleString("ar-SA",{maximumFractionDigits:0})} ر.س</div>
                      <div className="text-gray-400">{t.bank_name || ""}</div>
                      <div className="text-gray-300">{new Date(t.created_at).toLocaleDateString("ar-SA")}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {!salesBreakdown && (
            <div className="flex items-center justify-center py-20"><RefreshCw size={22} className="animate-spin text-[#103c68]" /></div>
          )}
        </div>
      )}

      {/* ══ AUDIT LOG ══ */}
      {tab === "audit_log" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2"><BookOpen size={18} className="text-[#103c68]" />سجل التدقيق الشامل</h2>
              <p className="text-xs text-gray-400 mt-0.5">{systemLogs.length} إجراء مسجّل · عرض فقط</p>
            </div>
            <button onClick={() => loadSystemLogs(logSearch, logEntityType)} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
              <RefreshCw size={13} />تحديث
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadSystemLogs(logSearch, logEntityType)}
                placeholder="بحث في السجل..." dir="rtl"
                className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
            </div>
            <div className="relative">
              <select value={logEntityType}
                onChange={e => { setLogEntityType(e.target.value); loadSystemLogs(logSearch, e.target.value); }}
                className="appearance-none pr-8 pl-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 font-semibold">
                <option value="">كل الأنواع</option>
                <option value="order">طلبات</option>
                <option value="transfer">تحويلات</option>
                <option value="user">مستخدمون</option>
                <option value="vehicle">مركبات</option>
              </select>
              <ChevronDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <button onClick={() => loadSystemLogs(logSearch, logEntityType)}
              className="bg-[#103c68] text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#0d3158] transition-colors">
              بحث
            </button>
          </div>

          {/* Log entries */}
          <div className="space-y-1.5">
            {systemLogs.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                <BookOpen size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">لا توجد سجلات مطابقة</p>
              </div>
            ) : systemLogs.map((log, i) => {
              const entityColors: Record<string, string> = {
                order:    "bg-blue-100 text-blue-700 border-blue-200",
                transfer: "bg-green-100 text-green-700 border-green-200",
                user:     "bg-purple-100 text-purple-700 border-purple-200",
                vehicle:  "bg-orange-100 text-orange-700 border-orange-200",
              };
              const actionLabels: Record<string, string> = {
                pending: "تم إنشاء الطلب", payment_confirmed: "تأكيد الدفع",
                vehicle_assigned: "تعيين مركبة", invoiced: "إصدار الفاتورة",
                loaded: "التحميل", delivered: "التسليم", cancelled: "الإلغاء",
                transfer_confirmed: "تأكيد التحويل", transfer_pending: "تحويل جديد",
              };
              const roleColors: Record<string, string> = {
                customer: "bg-gray-100 text-gray-600", reviewer: "bg-blue-50 text-blue-600",
                supervisor: "bg-amber-50 text-amber-700", warehouse: "bg-purple-50 text-purple-700",
                driver: "bg-cyan-50 text-cyan-700", admin: "bg-red-50 text-red-700",
              };
              return (
                <div key={`${log.id}-${i}`} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-start gap-3 hover:border-gray-200 transition-colors">
                  <div className="flex-shrink-0 text-center mt-0.5">
                    <div className="text-xs text-gray-400 font-mono leading-tight">
                      {new Date(log.created_at).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })}
                    </div>
                    <div className="text-xs text-gray-300 font-mono">
                      {new Date(log.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${entityColors[log.entity_type] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {log.entity_type}
                      </span>
                      <span className="font-bold text-gray-800 text-sm">
                        {actionLabels[log.action] ?? log.action}
                      </span>
                      {log.entity_id && (
                        <span className="text-xs text-gray-400 font-mono">#{log.entity_id}</span>
                      )}
                    </div>
                    {(log.user_name || log.user_phone) && (
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${roleColors[log.user_role] ?? "bg-gray-100 text-gray-500"}`}>
                          {log.user_name || log.user_phone}
                        </span>
                        {log.details && <span className="text-xs text-gray-400 truncate">{log.details}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ CLIENT FINANCIAL PROFILE MODAL ══ */}
      {profilePhone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) { setProfilePhone(null); setClientProfile(null); } }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#103c68] to-[#1a5a9a] text-white flex items-center justify-center font-black text-lg">
                  {String(clientProfile?.customer?.name ?? profilePhone).charAt(0)}
                </div>
                <div>
                  <h2 className="font-black text-gray-900 text-lg">{String(clientProfile?.customer?.name ?? "...")}</h2>
                  <p className="text-xs text-gray-400 font-mono">{profilePhone}</p>
                </div>
                <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full border border-blue-200 font-semibold flex items-center gap-1"><Eye size={10} />عرض فقط</span>
              </div>
              <button onClick={() => { setProfilePhone(null); setClientProfile(null); }}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            {loadingProfile ? (
              <div className="flex items-center justify-center py-20 flex-1"><RefreshCw size={24} className="animate-spin text-[#103c68]" /></div>
            ) : clientProfile ? (
              <div className="overflow-y-auto flex-1 p-6 space-y-5">
                {/* Company info */}
                {!!(clientProfile.customer.company_name || clientProfile.customer.vat_number) && (
                  <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-2 gap-3 text-sm">
                    {!!clientProfile.customer.company_name && (
                      <div><div className="text-xs text-gray-400 mb-0.5">الشركة</div><div className="font-bold text-gray-800">{String(clientProfile.customer.company_name)}</div></div>
                    )}
                    {!!clientProfile.customer.vat_number && (
                      <div><div className="text-xs text-gray-400 mb-0.5">الرقم الضريبي</div><div className="font-mono font-bold text-gray-800">{String(clientProfile.customer.vat_number)}</div></div>
                    )}
                    {!!clientProfile.customer.cr_number && (
                      <div><div className="text-xs text-gray-400 mb-0.5">السجل التجاري</div><div className="font-mono font-bold text-gray-800">{String(clientProfile.customer.cr_number)}</div></div>
                    )}
                  </div>
                )}

                {/* Financial summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-[#103c68] rounded-2xl p-3 text-white text-center">
                    <div className="text-xl font-black">{clientProfile.summary.order_count}</div>
                    <div className="text-xs opacity-70">طلب</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-center">
                    <div className="text-xl font-black text-gray-800">{clientProfile.summary.delivered_count}</div>
                    <div className="text-xs text-gray-400">مُسلَّم</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
                    <div className="text-sm font-black text-[#103c68]">{clientProfile.summary.total_orders.toLocaleString("ar-SA",{maximumFractionDigits:0})}</div>
                    <div className="text-xs text-blue-500">ر.س طلبات</div>
                  </div>
                  <div className={`rounded-2xl p-3 text-center border ${clientProfile.summary.balance >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                    <div className={`text-sm font-black ${clientProfile.summary.balance >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {Math.abs(clientProfile.summary.balance).toLocaleString("ar-SA",{maximumFractionDigits:0})}
                    </div>
                    <div className={`text-xs ${clientProfile.summary.balance >= 0 ? "text-green-500" : "text-red-400"}`}>
                      {clientProfile.summary.balance >= 0 ? "رصيد دائن" : "مديون"}
                    </div>
                  </div>
                </div>

                {/* Transaction history */}
                <div>
                  <h3 className="font-black text-gray-800 text-sm mb-3 flex items-center gap-2"><FileText size={14} className="text-[#103c68]" />سجل الطلبات</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {clientProfile.orders.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-xs">لا توجد طلبات</div>
                    ) : clientProfile.orders.map((o, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-800 truncate">{o.order_number as string}</div>
                          <div className="text-gray-400">{o.product_name as string} · {o.quantity as number} {o.unit as string}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-[#103c68]">{((o.total_with_vat as number)||0).toLocaleString("ar-SA",{maximumFractionDigits:0})} ر.س</div>
                          <StagePill stage={o.stage as string} />
                        </div>
                        <div className="text-gray-300 text-right flex-shrink-0">
                          {new Date(o.created_at as string).toLocaleDateString("ar-SA",{month:"short",day:"numeric"})}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bank transfers */}
                <div>
                  <h3 className="font-black text-gray-800 text-sm mb-3 flex items-center gap-2"><BanknoteIcon size={14} className="text-[#103c68]" />الحوالات البنكية</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {clientProfile.transfers.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-xs">لا توجد حوالات مسجلة</div>
                    ) : clientProfile.transfers.map((t, i) => (
                      <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs border ${(t.confirmed as number) ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${(t.confirmed as number) ? "bg-green-500" : "bg-amber-400"}`} />
                        <div className="flex-1">
                          <div className="font-bold text-gray-800">{((t.amount as number)||0).toLocaleString("ar-SA",{maximumFractionDigits:0})} ر.س</div>
                          <div className="text-gray-400">{String(t.bank_name ?? "")} {t.transfer_ref ? `· ${String(t.transfer_ref)}` : ""}</div>
                        </div>
                        <div className={`font-semibold ${(t.confirmed as number) ? "text-green-700" : "text-amber-600"}`}>
                          {(t.confirmed as number) ? "✓ مؤكد" : "معلق"}
                        </div>
                        <div className="text-gray-300">{new Date(t.created_at as string).toLocaleDateString("ar-SA",{month:"short",day:"numeric"})}</div>
                        {!!t.transfer_image && (
                          <a href={t.transfer_image as string} target="_blank" rel="noreferrer" className="text-[#103c68] hover:underline flex items-center gap-0.5"><Eye size={10} />صورة</a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Account balance summary */}
                <div className={`rounded-2xl p-4 border ${clientProfile.summary.balance >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <div className="flex justify-between items-center text-sm">
                    <div className="space-y-1">
                      <div className="flex justify-between gap-8"><span className="text-gray-500">إجمالي الطلبات:</span><span className="font-bold">{clientProfile.summary.total_orders.toLocaleString("ar-SA",{maximumFractionDigits:2})} ر.س</span></div>
                      <div className="flex justify-between gap-8"><span className="text-gray-500">إجمالي المدفوع:</span><span className="font-bold">{clientProfile.summary.total_paid.toLocaleString("ar-SA",{maximumFractionDigits:2})} ر.س</span></div>
                      <div className={`flex justify-between gap-8 font-black text-base border-t pt-1 mt-1 ${clientProfile.summary.balance >= 0 ? "border-green-200 text-green-700" : "border-red-200 text-red-700"}`}>
                        <span>الرصيد:</span>
                        <span>{clientProfile.summary.balance >= 0 ? "+" : ""}{clientProfile.summary.balance.toLocaleString("ar-SA",{maximumFractionDigits:2})} ر.س</span>
                      </div>
                    </div>
                    <div className={`text-4xl font-black ${clientProfile.summary.balance >= 0 ? "text-green-300" : "text-red-200"}`}>
                      {clientProfile.summary.balance >= 0 ? "✓" : "!"}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ══ CONFIRM PAYMENT MODAL (with account statement) ══ */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-black text-gray-900 text-lg">مراجعة الحساب والتأكيد</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedOrder.order_number} · {selectedOrder.customer_name || selectedOrder.customer_phone}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

              {/* ── Customer Account Statement ── */}
              <div className="rounded-2xl border overflow-hidden">
                <div className="bg-[#103c68] text-white px-4 py-3 flex items-center gap-2">
                  <Landmark size={15} />
                  <span className="font-bold text-sm">كشف حساب العميل</span>
                  {loadingStatement && <RefreshCw size={12} className="animate-spin mr-auto opacity-60" />}
                </div>

                {loadingStatement ? (
                  <div className="p-4 text-center text-sm text-gray-400">جاري تحميل الحساب...</div>
                ) : customerStatement ? (
                  <div className="divide-y divide-gray-50">
                    {/* Balance summary */}
                    {(() => {
                      const s = customerStatement.summary;
                      const balance = s.balance ?? (s.total_paid - s.total_orders);
                      const isPositive = balance >= 0;
                      return (
                        <div className={`px-4 py-3 ${isPositive ? "bg-green-50" : "bg-red-50"}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isPositive
                                ? <CreditCard size={15} className="text-green-600" />
                                : <TrendingDown size={15} className="text-red-500" />}
                              <span className="text-sm font-semibold text-gray-700">الرصيد الحالي</span>
                            </div>
                            <div className={`text-lg font-black ${isPositive ? "text-green-700" : "text-red-600"}`}>
                              {isPositive ? "+" : ""}{balance.toFixed(2)} ر.س
                            </div>
                          </div>
                          {!isPositive && (
                            <p className="text-xs text-red-500 mt-1 font-medium">
                              ⚠️ رصيد العميل غير كافٍ — يمكنك إرسال الطلب للمندوب للموافقة
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    {/* Stats */}
                    <div className="grid grid-cols-3 divide-x divide-x-reverse divide-gray-100 text-center text-xs">
                      <div className="p-3">
                        <div className="font-black text-gray-900 text-sm">{customerStatement.summary.total_orders?.toFixed(0)} ر.س</div>
                        <div className="text-gray-400 mt-0.5">إجمالي الطلبات</div>
                      </div>
                      <div className="p-3">
                        <div className="font-black text-gray-900 text-sm">{(customerStatement.summary.total_paid ?? customerStatement.summary.balance + customerStatement.summary.total_orders)?.toFixed(0)} ر.س</div>
                        <div className="text-gray-400 mt-0.5">إجمالي المدفوع</div>
                      </div>
                      <div className="p-3">
                        <div className="font-black text-gray-900 text-sm">{customerStatement.orders?.length ?? 0}</div>
                        <div className="text-gray-400 mt-0.5">عدد الطلبات</div>
                      </div>
                    </div>
                    {/* Last 3 orders */}
                    {customerStatement.orders?.slice(0, 3).map((o: Record<string, unknown>, i: number) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-mono text-[#103c68] font-bold">{String(o.order_number || "")}</span>
                          <span className="text-gray-400 mr-2">{String(o.product_name || "")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-700">{Number(o.total_with_vat || 0).toFixed(0)} ر.س</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STAGE_COLOR[String(o.stage || "")] || "bg-gray-100 text-gray-500"}`}>
                            {STAGE_AR[String(o.stage || "")] || String(o.stage || "")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-gray-400">لا توجد بيانات حساب</div>
                )}
              </div>

              {/* ── Order Summary ── */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">المنتج</span><span className="font-semibold">{selectedOrder.product_name} × {selectedOrder.quantity} {selectedOrder.unit}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">قبل الضريبة</span><span className="font-semibold">{selectedOrder.total_before_vat?.toFixed(2)} ر.س</span></div>
                <div className="flex justify-between"><span className="text-gray-500">ضريبة 15%</span><span className="font-semibold">{selectedOrder.vat_amount?.toFixed(2)} ر.س</span></div>
                <div className="flex justify-between font-black border-t border-gray-200 pt-2 text-base">
                  <span>الإجمالي المطلوب</span>
                  <span className="text-[#103c68]">{selectedOrder.total_with_vat?.toFixed(2)} ر.س</span>
                </div>
              </div>

              {/* ── Transfer Details ── */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">مرجع التحويل البنكي</label>
                <input value={transferRef} onChange={e => setTransferRef(e.target.value)}
                  placeholder="رقم العملية أو المرجع"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">مبلغ التحويل (ر.س)</label>
                <input type="number" value={paymentAmt} onChange={e => setPaymentAmt(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-sm">
                <div className="font-bold text-blue-800 mb-1 flex items-center gap-1.5"><ShieldCheck size={14} />التزام المراجع</div>
                <div className="text-blue-600 text-xs">بالنقر على "تأكيد وتوقيع" تؤكد أنك تحققت شخصياً من وصول المبلغ وسيتم إحالة الطلب للمستودع تلقائياً.</div>
              </div>
            </div>

            {/* Buttons */}
            <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex-shrink-0 space-y-2">
              {/* Send to rep — only if order has a rep */}
              {selectedOrder.rep_id && (
                <button onClick={sendToRep} disabled={submitting}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <Send size={14} />
                  {submitting ? "جاري الإرسال..." : "إرسال للمندوب للموافقة (رصيد غير كافٍ)"}
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={() => setSelectedOrder(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  إلغاء
                </button>
                <button onClick={confirmPayment} disabled={submitting}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {submitting ? <><RefreshCw size={14} className="animate-spin" />جاري...</> : <><CheckCircle size={14} />تأكيد وتوقيع</>}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Edit Confirmed Order Modal ── */}
      {editModal && (() => {
        const qty     = parseFloat(editModal.qty)     || 0;
        const uPrice  = parseFloat(editModal.unitPrice) || 0;
        const before  = Math.round(qty * uPrice * 100) / 100;
        const vat     = Math.round(before * 0.15 * 100) / 100;
        const total   = Math.round((before + vat) * 100) / 100;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h2 className="font-black text-gray-900">تعديل الطلب المؤكد</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{editModal.order.order_number} · {editModal.order.customer_name || editModal.order.customer_phone}</p>
                </div>
                <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                  <X size={18} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* Product info */}
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
                  المنتج: <span className="font-bold text-gray-800">{editModal.order.product_name}</span>
                  <span className="mx-2">·</span>
                  الوحدة: <span className="font-bold text-gray-800">{editModal.order.unit}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1.5">الكمية</label>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={editModal.qty}
                      onChange={e => setEditModal(m => m && ({ ...m, qty: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1.5">سعر الوحدة (ر.س)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={editModal.unitPrice}
                      onChange={e => setEditModal(m => m && ({ ...m, unitPrice: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
                    />
                  </div>
                </div>

                {/* Live calculation */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm space-y-1.5">
                  <div className="flex justify-between text-gray-600">
                    <span>قبل الضريبة</span>
                    <span className="font-semibold">{before.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>ضريبة 15%</span>
                    <span className="font-semibold">{vat.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between font-black text-[#103c68] text-base border-t border-blue-200 pt-1.5">
                    <span>الإجمالي</span>
                    <span>{total.toFixed(2)} ر.س</span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  ⚠️ هذا التعديل يغير مبالغ الطلب المؤكد مسبقاً. تأكد من صحة البيانات قبل الحفظ.
                </div>
              </div>

              <div className="px-6 pb-5 flex gap-2">
                <button onClick={() => setEditModal(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  إلغاء
                </button>
                <button onClick={submitEditConfirmed} disabled={submitting || qty <= 0 || uPrice <= 0}
                  className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-black text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {submitting ? <><RefreshCw size={14} className="animate-spin" />جاري...</> : <><Pencil size={14} />حفظ التعديل</>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Password Modal ── */}
      {pwdModal && (
        <PasswordModal
          title={pwdModal.type === "delete_transfer" ? "تأكيد حذف التحويل" : "تأكيد عكس التسليم"}
          description={pwdModal.type === "delete_transfer" ? "هذا الإجراء لا يمكن التراجع عنه. أدخل كلمة المرور للمتابعة." : "سيتم إعادة الطلب إلى مرحلة محمّل. أدخل كلمة المرور للمتابعة."}
          onConfirm={handlePasswordConfirm}
          onClose={() => setPwdModal(null)}
        />
      )}
    </div>
  );
}
