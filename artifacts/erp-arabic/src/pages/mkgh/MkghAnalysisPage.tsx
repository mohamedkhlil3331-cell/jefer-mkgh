import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth, authFetch } from "@/context/AuthContext";
import {
  Upload, Trash2, RefreshCw, BarChart3, Database, TrendingUp,
  TrendingDown, Truck, Users, AlertTriangle, CheckCircle, X,
  ChevronDown, Search, FileDown, Sparkles, Calendar, ChevronRight,
  Mail, Plus, Send, Clock, Eye, EyeOff, Settings, ExternalLink, Edit2, Save,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useRememberedState } from "@/hooks/useRememberedState";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Summary {
  total_rows: number; total_revenue: number; total_expenses: number;
  net_profit: number; driver_count: number; vehicle_count: number;
  period_from: string | null; period_to: string | null;
  last_import: { imported_by: string; file_name: string; created_at: string } | null;
}
interface DriverStat {
  driver_name: string; revenue: number; expenses: number; net_profit: number;
  tx_count: number; vehicle_count: number; expense_tx_count: number;
  active_months: number;
}
interface VehicleStat {
  vehicle: string; activity: string | null; model: string | null;
  revenue: number; expenses: number; net_profit: number;
  tx_count: number; driver_count: number; workshop_count: number;
  best_driver: string | null; best_driver_net: number;
  full_maint_count: number; active_months: number;
  period_from: string | null; period_to: string | null;
}
interface MonthlyRow { period: string; revenue: number; expenses: number; net_profit: number; }
interface BreakdownTypes {
  globalTypes: Record<string, { count: number; cost: number }>;
  byVehicle: Record<string, Record<string, { count: number; cost: number }>>;
}
interface MatrixData {
  drivers: string[]; vehicles: string[];
  matrix: Record<string, Record<string, { count: number; cost: number }>>;
}
interface TxRow {
  id: number; month: number; year: number; driver_name: string | null;
  account_tab: string | null; activity: string | null; cost_center: string | null;
  account_name: string | null; tx_date: string | null; doc_number: string | null;
  description: string | null; debit: number; credit: number; net: number;
}
interface Meta { drivers: string[]; vehicles: string[]; months: { month: number; year: number }[]; accountTabs: string[]; accountNames: string[]; }

interface EmailSettings { enabled: boolean; send_day: number; recipients: string[]; last_sent: string | null; fallback_email: string; }
interface ReportLogRow { id: number; period_label: string | null; recipients: string | null; sent_at: string; triggered_by: string; status: string; error_message: string | null; error?: string | null; }
interface VehicleDetail {
  vehicle: string;
  kpi: { revenue: number; expenses: number; net_profit: number; tx_count: number; driver_count: number;
    activity: string | null; model: string | null; period_from: string | null; period_to: string | null; active_months: number; };
  monthly: MonthlyRow[];
  drivers: { driver_name: string; tx_count: number; revenue: number; expenses: number; net_profit: number; period_from: string | null; period_to: string | null }[];
  breakdownTypes: Record<string, { count: number; cost: number }>;
}
interface DriverDetail {
  driver: string;
  kpi: { revenue: number; expenses: number; net_profit: number; tx_count: number; vehicle_count: number;
    period_from: string | null; period_to: string | null; active_months: number; };
  monthly: MonthlyRow[];
  vehicles: { vehicle: string; activity: string | null; tx_count: number; revenue: number; expenses: number; net_profit: number; period_from: string | null; period_to: string | null }[];
  breakdownTypes: Record<string, { count: number; cost: number }>;
}
interface AiItem { original: string; category: string; note: string; }
interface AiResult { items: AiItem[]; summary: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sar = (n: number, _short = false) => {
  return n.toLocaleString("ar-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
};
const pct = (a: number, b: number) => b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "—";

const COLORS = ["#0ea5e9","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];
const NET_THRESHOLD = 0; // vehicles below this → recommend sell

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = "text-gray-900", icon: Icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ElementType;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2">
      {Icon && <Icon size={20} className={`${color} opacity-70`} />}
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── MultiSelectFilter ────────────────────────────────────────────────────────
function MultiSelectFilter({
  label, options, value, onChange,
}: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className={`border rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5 min-w-[110px] transition-colors ${
          value.length > 0
            ? "border-cyan-400 bg-cyan-50 text-cyan-800 font-semibold"
            : "border-gray-200 text-gray-600 hover:border-gray-300"
        }`}>
        <span className="truncate max-w-[130px]">{value.length > 0 ? `${label} (${value.length})` : label}</span>
        <ChevronDown size={10} className="flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-white rounded-xl shadow-xl border border-gray-100 min-w-[200px] max-h-[260px] overflow-y-auto py-1">
          {options.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-2">لا يوجد خيارات</p>
          ) : (
            <>
              {value.length > 0 && (
                <button onClick={() => { onChange([]); setOpen(false); }}
                  className="w-full text-right px-3 py-1.5 text-xs text-red-400 hover:bg-red-50 font-semibold border-b border-gray-100">
                  × مسح التحديد
                </button>
              )}
              {options.map(opt => (
                <label key={opt}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs text-gray-700">
                  <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)}
                    className="w-3.5 h-3.5 rounded accent-cyan-600 flex-shrink-0" />
                  <span className="truncate">{opt}</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function MkghAnalysisPage() {
  const [tab, setTab] = useRememberedState<"data" | "dashboard" | "email">("mkgh-analysis-tab", "dashboard");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { token } = useAuth();
  const api = useCallback((path: string, opts?: RequestInit) => authFetch(token)(path, opts), [token]);

  // Analytics data
  const [summary, setSummary] = useState<Summary | null>(null);
  const [drivers, setDrivers] = useState<DriverStat[]>([]);
  const [vehicles, setVehicles] = useState<VehicleStat[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [breakdowns, setBreakdowns] = useState<BreakdownTypes | null>(null);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);

  // Data tab
  const [txRows, setTxRows] = useState<TxRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useRememberedState("mkgh-transactions-page", 1);
  const [meta, setMeta] = useState<Meta>({ drivers: [], vehicles: [], months: [], accountTabs: [], accountNames: [] });
  const [filters, setFilters] = useRememberedState("mkgh-transaction-filters", { driver: "", vehicle: "", month: "", year: "", account_tab: "", account_name: "" });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Row selection + edit in data tab
  const [txSel,   setTxSel]   = useState<Set<number>>(new Set());
  const [editRow, setEditRow] = useState<TxRow | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Record<string, string>>>({});

  // Dashboard filters (global — apply to all dashboard sections)
  const [dashFilters, setDashFilters] = useRememberedState("mkgh-dashboard-filters", {
    drivers:       [] as string[],
    vehicles:      [] as string[],
    account_tabs:  [] as string[],
    account_names: [] as string[],
    periodFrom:    "",
    periodTo:      "",
  });
  // Monthly chart zoom filters (on top of dashFilters)
  const [selectedVehicle, setSelectedVehicle] = useRememberedState("mkgh-monthly-vehicle-filter", "");
  const [selectedDriver, setSelectedDriver] = useRememberedState("mkgh-monthly-driver-filter", "");

  // Detail drawers
  const [vehicleDrawer, setVehicleDrawer] = useState<VehicleDetail | null>(null);
  const [driverDrawer, setDriverDrawer] = useState<DriverDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // AI analysis modal
  const [aiModal, setAiModal] = useState<{ open: boolean; loading: boolean; result: AiResult | null; vehicle?: string; driver?: string }>({ open: false, loading: false, result: null });

  // Review popup (راجع reasons + best driver)
  const [reviewPopup, setReviewPopup] = useState<{ vehicle: VehicleStat; anchor: DOMRect } | null>(null);

  // Email settings state
  const [emailSettings, setEmailSettings] = useState<EmailSettings>({ enabled: false, send_day: 1, recipients: [], last_sent: null, fallback_email: "" });
  const [emailLog, setEmailLog] = useState<ReportLogRow[]>([]);
  const [newRecipient, setNewRecipient] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Gmail credentials state
  const [gmailUser, setGmailUser] = useState("");
  const [gmailPass, setGmailPass] = useState("");
  const [gmailPassSet, setGmailPassSet] = useState(false);
  const [showGmailPass, setShowGmailPass] = useState(false);
  const [gmailSaving, setGmailSaving] = useState(false);
  const [gmailTesting, setGmailTesting] = useState(false);
  const [gmailMsg, setGmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const openVehicleDrawer = useCallback(async (vehicle: string) => {
    setVehicleDrawer(null);
    setDriverDrawer(null);
    setDrawerLoading(true);
    const d = await api(`/mkgh/vehicle/${encodeURIComponent(vehicle)}`);
    setVehicleDrawer(d);
    setDrawerLoading(false);
  }, [api]);

  const openDriverDrawer = useCallback(async (driver: string) => {
    setDriverDrawer(null);
    setVehicleDrawer(null);
    setDrawerLoading(true);
    const d = await api(`/mkgh/driver/${encodeURIComponent(driver)}`);
    setDriverDrawer(d);
    setDrawerLoading(false);
  }, [api]);

  // Compute review reasons for a "راجع" vehicle
  const getReviewReasons = (v: VehicleStat, allVehicles: VehicleStat[]) => {
    const reasons: string[] = [];
    if (v.net_profit < 0)
      reasons.push(`صافي سالب (${sar(v.net_profit, true)}) — المصاريف تتجاوز الإيرادات`);
    const expenseRatio = v.revenue > 0 ? v.expenses / v.revenue : Infinity;
    if (expenseRatio >= 1.5)
      reasons.push(`نسبة المصاريف ${Math.round(expenseRatio * 100)}% من الإيرادات`);
    const avgMaint = allVehicles.length
      ? allVehicles.reduce((s, x) => s + x.full_maint_count, 0) / allVehicles.length
      : 0;
    if (v.full_maint_count > avgMaint * 1.5 && v.full_maint_count > 2)
      reasons.push(`زيارات صيانة عالية (${v.full_maint_count}) مقارنةً بالمتوسط (${Math.round(avgMaint)})`);
    if (v.revenue === 0 && v.expenses > 0)
      reasons.push("لا توجد إيرادات مسجّلة — مصاريف بدون دخل");
    if (reasons.length === 0)
      reasons.push("الصافي دون الحد المقبول");
    return reasons;
  };

  const runAiAnalysis = useCallback(async (vehicle?: string, driver?: string) => {
    setAiModal({ open: true, loading: true, result: null, vehicle, driver });
    try {
      const body: Record<string, string> = {};
      if (vehicle) body.vehicle = vehicle;
      if (driver)  body.driver  = driver;
      const d = await api("/mkgh/analyze-descriptions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setAiModal(p => ({ ...p, loading: false, result: d }));
    } catch {
      setAiModal(p => ({ ...p, loading: false, result: { items: [], summary: "فشل الاتصال بالذكاء الاصطناعي" } }));
    }
  }, [api]);

  // ── Load analytics ──────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      // Build shared query params from global dashboard filters (multi-select)
      const q = new URLSearchParams();
      if (dashFilters.drivers.length > 0)       q.set("drivers",       dashFilters.drivers.join(","));
      if (dashFilters.vehicles.length > 0)      q.set("vehicles",      dashFilters.vehicles.join(","));
      if (dashFilters.account_tabs.length > 0)  q.set("account_tabs",  dashFilters.account_tabs.join(","));
      if (dashFilters.account_names.length > 0) q.set("account_names", dashFilters.account_names.join(","));
      if (dashFilters.periodFrom) q.set("periodFrom", dashFilters.periodFrom);
      if (dashFilters.periodTo)   q.set("periodTo",   dashFilters.periodTo);
      const baseQs = q.toString() ? `?${q}` : "";

      // Monthly chart additionally filtered by selectedVehicle / selectedDriver (override)
      const mq = new URLSearchParams(q);
      if (selectedVehicle)     { mq.set("vehicles", selectedVehicle); mq.delete("drivers"); }
      else if (selectedDriver) { mq.set("drivers",  selectedDriver);  mq.delete("vehicles"); }
      const monthlyQs = mq.toString() ? `?${mq}` : "";

      const [sumR, drvR, vehR, monR, brkR, matR, metaR] = await Promise.all([
        api(`/mkgh/analytics/summary${baseQs}`),
        api(`/mkgh/analytics/drivers${baseQs}`),
        api(`/mkgh/analytics/vehicles${baseQs}`),
        api(`/mkgh/analytics/monthly${monthlyQs}`),
        api("/mkgh/analytics/breakdown-types"),
        api("/mkgh/analytics/driver-vehicle-matrix"),
        api("/mkgh/meta"),
      ]);
      setSummary(typeof sumR?.total_rows === "number" ? sumR : null);
      setDrivers(Array.isArray(drvR) ? drvR : []);
      setVehicles(Array.isArray(vehR) ? vehR : []);
      setMonthly(Array.isArray(monR) ? monR : []);
      setBreakdowns(brkR?.globalTypes ? brkR : null);
      setMatrix(matR?.drivers ? matR : null);
      setMeta(prev => metaR?.drivers ? { ...prev, ...metaR } : prev);
    } finally { setLoading(false); }
  }, [dashFilters, selectedVehicle, selectedDriver, api]);

  // ── Load transactions ───────────────────────────────────────────────────────
  const loadTx = useCallback(async (page = 1) => {
    const q = new URLSearchParams({ page: String(page), limit: "100" });
    if (filters.driver)       q.set("driver",       filters.driver);
    if (filters.vehicle)      q.set("vehicle",      filters.vehicle);
    if (filters.month)        q.set("month",        filters.month);
    if (filters.year)         q.set("year",         filters.year);
    if (filters.account_tab)  q.set("account_tab",  filters.account_tab);
    if (filters.account_name) q.set("account_name", filters.account_name);
    const d = await api(`/mkgh/transactions?${q}`);
    setTxRows(Array.isArray(d.rows) ? d.rows : []);
    setTxTotal(d.total || 0);
    setTxPage(page);
  }, [filters, api]);

  // ── Load email settings + log ───────────────────────────────────────────────
  const loadEmailSettings = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        api("/mkgh/email-settings"),
        api("/mkgh/report-log"),
      ]);
      if (s?.recipients !== undefined) setEmailSettings(s);
      if (Array.isArray(l)) setEmailLog(l);
    } catch { /* non-fatal */ }
  }, [api]);

  // ── Load / save / test Gmail credentials ────────────────────────────────────
  const loadGmailConfig = useCallback(async () => {
    try {
      const d = await api("/mkgh/gmail-config");
      setGmailUser(d?.gmail_user || "");
      setGmailPassSet(!!d?.gmail_pass_set);
      setGmailPass(""); // never pre-fill the pass field
    } catch { /* non-fatal */ }
  }, [api]);

  const saveGmailConfig = async () => {
    if (!gmailUser.trim()) return;
    setGmailSaving(true);
    setGmailMsg(null);
    try {
      await api("/mkgh/gmail-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail_user: gmailUser, ...(gmailPass ? { gmail_pass: gmailPass } : {}) }),
      });
      setGmailMsg({ ok: true, text: "تم الحفظ ✓" });
      setGmailPassSet(gmailPass.length > 0 || gmailPassSet);
      setGmailPass("");
    } catch { setGmailMsg({ ok: false, text: "فشل الحفظ" }); }
    finally { setGmailSaving(false); setTimeout(() => setGmailMsg(null), 4000); }
  };

  const handleTestEmail = async () => {
    setGmailTesting(true);
    setGmailMsg(null);
    try {
      const r = await api("/mkgh/test-email", { method: "POST" });
      setGmailMsg(r?.ok ? { ok: true, text: "تم إرسال رسالة الاختبار ✓ — تحقق من صندوق الوارد" } : { ok: false, text: r?.error || "فشل الإرسال" });
    } catch { setGmailMsg({ ok: false, text: "فشل الاتصال بالخادم" }); }
    finally { setGmailTesting(false); }
  };

  const saveEmailSettings = async (patch: Partial<EmailSettings>) => {
    setEmailSaving(true);
    setEmailMsg(null);
    try {
      await api("/mkgh/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setEmailSettings(prev => ({ ...prev, ...patch }));
      setEmailMsg({ ok: true, text: "تم الحفظ" });
    } catch { setEmailMsg({ ok: false, text: "فشل الحفظ" }); }
    finally { setEmailSaving(false); setTimeout(() => setEmailMsg(null), 3000); }
  };

  const handleSendNow = async () => {
    if (!confirm("إرسال التقرير الآن لجميع المستلمين؟")) return;
    setEmailSending(true);
    setEmailMsg(null);
    try {
      const r = await api("/mkgh/send-report-now", { method: "POST" });
      if (r?.ok) {
        setEmailMsg({ ok: true, text: "تم الإرسال بنجاح ✓" });
        await loadEmailSettings();
      } else {
        setEmailMsg({ ok: false, text: r?.error || "فشل الإرسال" });
      }
    } catch { setEmailMsg({ ok: false, text: "فشل الاتصال بالخادم" }); }
    finally { setEmailSending(false); }
  };

  const addRecipient = () => {
    const e = newRecipient.trim().toLowerCase();
    if (!e || !e.includes("@") || emailSettings.recipients.includes(e)) { setNewRecipient(""); return; }
    const updated = [...emailSettings.recipients, e];
    saveEmailSettings({ recipients: updated });
    setNewRecipient("");
  };

  const removeRecipient = (email: string) => {
    saveEmailSettings({ recipients: emailSettings.recipients.filter(r => r !== email) });
  };

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);
  const previousTxFilters = useRef(filters);
  useEffect(() => {
    const filtersChanged = previousTxFilters.current !== filters;
    previousTxFilters.current = filters;
    if (tab === "data") loadTx(filtersChanged ? 1 : txPage);
  }, [tab, loadTx]);
  useEffect(() => {
    if (tab === "email") {
      loadEmailSettings();
      loadGmailConfig();
    }
  }, [tab, loadEmailSettings, loadGmailConfig]);

  // ── Upload handler ──────────────────────────────────────────────────────────
  // useCallback with token in deps so stale-closure is impossible.
  // Falls back to localStorage so even a late React state update can't drop the token.
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Always use the freshest token available
    const activeToken = token ?? localStorage.getItem("token");
    if (!activeToken) {
      alert("يجب تسجيل الدخول أولاً لرفع الملف");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/mkgh/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeToken}` },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 401) {
          alert(`⚠️ انتهت الجلسة — يرجى تسجيل الدخول مجدداً ثم إعادة رفع الملف`);
        } else {
          alert(d.error || "فشل الاستيراد");
        }
        return;
      }
      alert(`✅ تم استيراد ${(d.inserted as number).toLocaleString()} سجل من ورقة "${d.sheet as string}"`);
      await loadAnalytics();
      if (tab === "data") await loadTx(1);
    } catch { alert("فشل الاتصال بالخادم"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }, [token, tab, loadAnalytics, loadTx]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/mkgh/export", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) { alert("فشل التصدير"); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `mkgh-analysis-${date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("فشل الاتصال بالخادم"); }
    finally { setExporting(false); }
  };

  const clearData = async () => {
    await fetch("/api/mkgh/transactions", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setShowClearConfirm(false);
    setSummary(null); setDrivers([]); setVehicles([]); setMonthly([]);
    setBreakdowns(null); setMatrix(null); setTxRows([]); setTxTotal(0);
  };

  const deleteSingleTx = async (id: number) => {
    if (!confirm("حذف هذا السجل نهائياً؟")) return;
    await api(`/mkgh/transactions/${id}`, { method: "DELETE" });
    setTxSel(prev => { const s = new Set(prev); s.delete(id); return s; });
    loadTx(txPage);
  };

  const bulkDeleteTxs = async () => {
    if (txSel.size === 0) return;
    if (!confirm(`حذف ${txSel.size} سجل محدد نهائياً؟`)) return;
    await api("/mkgh/transactions/bulk", {
      method: "DELETE",
      body: JSON.stringify({ ids: Array.from(txSel) }),
    });
    setTxSel(new Set());
    loadTx(txPage);
  };

  const openEditRow = (r: TxRow) => {
    setEditRow(r);
    setEditDraft({
      driver_name: r.driver_name ?? "",
      cost_center: r.cost_center ?? "",
      activity: r.activity ?? "",
      account_name: r.account_name ?? "",
      account_tab: r.account_tab ?? "",
      description: r.description ?? "",
      tx_date: r.tx_date ?? "",
      doc_number: r.doc_number ?? "",
      debit: String(r.debit ?? 0),
      credit: String(r.credit ?? 0),
      month: String(r.month ?? ""),
      year: String(r.year ?? ""),
    });
  };

  const saveTxEdit = async () => {
    if (!editRow) return;
    await api(`/mkgh/transactions/${editRow.id}`, {
      method: "PATCH",
      body: JSON.stringify(editDraft),
    });
    setEditRow(null);
    loadTx(txPage);
    loadAnalytics();
  };

  // ── Derived data ────────────────────────────────────────────────────────────
  const isEmpty = !summary || summary.total_rows === 0;

  const breakdownChartData = breakdowns
    ? Object.entries(breakdowns.globalTypes)
        .map(([name, v]) => ({ name, count: v.count, cost: Math.round(v.cost) }))
        .sort((a, b) => b.count - a.count)
    : [];

  const matrixDrivers  = matrix?.drivers.slice(0, 10) ?? [];
  const matrixVehicles = matrix?.vehicles.slice(0, 10) ?? [];

  const monthlyData = monthly.map(r => ({
    ...r,
    revenue:   Math.round(r.revenue),
    expenses:  Math.round(r.expenses),
    net_profit: Math.round(r.net_profit),
  }));

  const hasData = !isEmpty;

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">تحليل بيانات MKGH</h1>
          {summary?.last_import && (
            <p className="text-xs text-gray-400 mt-0.5">
              آخر استيراد: {summary.last_import.file_name} — {new Date(summary.last_import.created_at).toLocaleDateString("ar-SA")}
              {summary.last_import.imported_by ? ` — بواسطة: ${summary.last_import.imported_by}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 text-white rounded-xl font-bold text-sm hover:bg-cyan-700 transition-colors disabled:opacity-60">
            {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? "جاري الاستيراد..." : "استيراد Excel"}
          </button>
          {hasData && (
            <>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-60">
                {exporting ? <RefreshCw size={16} className="animate-spin" /> : <FileDown size={16} />}
                {exporting ? "جاري التصدير..." : "تصدير Excel"}
              </button>
              <button onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-50 transition-colors">
                <Trash2 size={16} /> مسح البيانات
              </button>
            </>
          )}
          <button onClick={loadAnalytics} disabled={loading}
            className="p-2.5 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([
          { id: "dashboard", label: "لوحة التحليل", icon: BarChart3 },
          { id: "data",      label: "البيانات",      icon: Database },
          { id: "email",     label: "البريد الشهري", icon: Mail },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === t.id ? "bg-white text-cyan-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
           DASHBOARD TAB
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          {isEmpty ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
              <BarChart3 size={48} className="mx-auto mb-4 text-gray-200" />
              <p className="font-bold text-gray-500 text-lg">لا توجد بيانات بعد</p>
              <p className="text-gray-400 text-sm mt-2">ارفع ملف Excel من زر "استيراد Excel" لبدء التحليل</p>
            </div>
          ) : (
            <>
              {/* ── Global Dashboard Filters ── */}
              {(() => {
                const hasFilter = dashFilters.drivers.length > 0 || dashFilters.vehicles.length > 0 ||
                  dashFilters.account_tabs.length > 0 || dashFilters.account_names.length > 0 ||
                  !!dashFilters.periodFrom || !!dashFilters.periodTo;
                const clearAll = () => {
                  setDashFilters({ drivers: [], vehicles: [], account_tabs: [], account_names: [], periodFrom: "", periodTo: "" });
                  setSelectedVehicle(""); setSelectedDriver("");
                };
                return (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 space-y-2">
                    {/* Row 1: multi-select filters */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Search size={14} className="text-gray-400 flex-shrink-0" />
                      <MultiSelectFilter label="السائقين" options={meta.drivers}
                        value={dashFilters.drivers}
                        onChange={v => { setDashFilters(p => ({ ...p, drivers: v })); setSelectedDriver(""); }} />
                      <MultiSelectFilter label="السيارات" options={meta.vehicles}
                        value={dashFilters.vehicles}
                        onChange={v => { setDashFilters(p => ({ ...p, vehicles: v })); setSelectedVehicle(""); }} />
                      <MultiSelectFilter label="التبويبات" options={meta.accountTabs}
                        value={dashFilters.account_tabs}
                        onChange={v => setDashFilters(p => ({ ...p, account_tabs: v }))} />
                      <MultiSelectFilter label="أسماء الحسابات" options={meta.accountNames}
                        value={dashFilters.account_names}
                        onChange={v => setDashFilters(p => ({ ...p, account_names: v }))} />
                      {hasFilter && (
                        <button onClick={clearAll}
                          className="text-xs text-red-400 hover:text-red-600 font-semibold px-2 py-1 rounded-lg hover:bg-red-50">
                          × مسح الكل
                        </button>
                      )}
                      <span className="text-xs text-gray-400 mr-auto">
                        {hasFilter ? "⚡ فلتر مفعّل — يطبق على كل الأقسام" : "كل البيانات"}
                      </span>
                    </div>
                    {/* Row 2: period range */}
                    <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-50">
                      <Calendar size={13} className="text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-500 font-semibold">المدة:</span>
                      <span className="text-xs text-gray-400">من</span>
                      <select value={dashFilters.periodFrom}
                        onChange={e => setDashFilters(p => ({ ...p, periodFrom: e.target.value }))}
                        className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none">
                        <option value="">البداية</option>
                        {meta.months.map(m => {
                          const v = `${m.year}-${String(m.month).padStart(2,"0")}`;
                          return <option key={v} value={v}>{m.year} — شهر {m.month}</option>;
                        })}
                      </select>
                      <span className="text-xs text-gray-400">إلى</span>
                      <select value={dashFilters.periodTo}
                        onChange={e => setDashFilters(p => ({ ...p, periodTo: e.target.value }))}
                        className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none">
                        <option value="">النهاية</option>
                        {[...meta.months].reverse().map(m => {
                          const v = `${m.year}-${String(m.month).padStart(2,"0")}`;
                          return <option key={v} value={v}>{m.year} — شهر {m.month}</option>;
                        })}
                      </select>
                      {(dashFilters.periodFrom || dashFilters.periodTo) && (
                        <button onClick={() => setDashFilters(p => ({ ...p, periodFrom: "", periodTo: "" }))}
                          className="text-xs text-red-400 hover:text-red-600 font-semibold">× مسح</button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <KpiCard label="إجمالي الإيرادات" value={sar(summary!.total_revenue, true)} color="text-green-600" icon={TrendingUp} />
                <KpiCard label="إجمالي المصاريف" value={sar(summary!.total_expenses, true)} color="text-red-500" icon={TrendingDown} />
                <KpiCard label="صافي الربح" value={sar(summary!.net_profit, true)}
                  color={summary!.net_profit >= 0 ? "text-cyan-700" : "text-red-600"} icon={BarChart3} />
                <KpiCard label="عدد السائقين" value={String(summary!.driver_count)} icon={Users} />
                <KpiCard label="عدد السيارات" value={String(summary!.vehicle_count)} icon={Truck} />
                <KpiCard label="عدد الحركات" value={summary!.total_rows.toLocaleString("ar-SA")}
                  sub={summary!.period_from ? `${summary!.period_from} → ${summary!.period_to}` : undefined} />
              </div>

              {/* Monthly Trend */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <h2 className="font-black text-gray-800 text-base">📈 الاتجاه الشهري</h2>
                  <div className="flex items-center gap-2">
                    <select value={selectedVehicle} onChange={e => { setSelectedVehicle(e.target.value); setSelectedDriver(""); }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none">
                      <option value="">كل السيارات</option>
                      {meta.vehicles.map(v => <option key={v} value={v}>سيارة {v}</option>)}
                    </select>
                    <select value={selectedDriver} onChange={e => { setSelectedDriver(e.target.value); setSelectedVehicle(""); }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none">
                      <option value="">كل السائقين</option>
                      {meta.drivers.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                {monthlyData.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">لا توجد بيانات للفترة المحددة</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v.toLocaleString("ar-SA")} />
                      <Tooltip formatter={(v: number) => sar(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue"   name="الإيرادات" stroke="#10b981" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="expenses"  name="المصاريف"  stroke="#ef4444" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="net_profit" name="الصافي"   stroke="#0ea5e9" strokeWidth={2.5} dot={false} strokeDasharray="5 3" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Driver + Vehicle ranking side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Driver Ranking */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-black text-gray-800">👤 تصنيف السائقين</h2>
                    <span className="text-xs text-gray-400">ضغطتين على صف لعرض التفاصيل</span>
                  </div>
                  <div className="overflow-auto max-h-72">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-gray-100 text-xs text-gray-400">
                          <th className="text-right pb-2">السائق</th>
                          <th className="text-center pb-2">إيرادات</th>
                          <th className="text-center pb-2">مصاريف</th>
                          <th className="text-center pb-2">الصافي</th>
                          <th className="text-center pb-2">متوسط شهري</th>
                          <th className="text-center pb-2">نسبة الربح</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drivers.map((d, i) => (
                          <tr key={d.driver_name}
                            className="border-b border-gray-50 hover:bg-cyan-50/60 cursor-pointer select-none"
                            onDoubleClick={() => openDriverDrawer(d.driver_name)}
                            title="ضغطتين لعرض تفاصيل السائق">
                            <td className="py-2 font-semibold text-gray-800">
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-black mr-1 ${
                                i === 0 ? "bg-amber-400 text-white" :
                                i === 1 ? "bg-gray-300 text-white" :
                                i === 2 ? "bg-amber-700 text-white" : "bg-gray-100 text-gray-500"
                              }`}>{i + 1}</span>
                              {d.driver_name}
                            </td>
                            <td className="py-2 text-center text-xs text-green-600 font-semibold">{sar(d.revenue, true)}</td>
                            <td className="py-2 text-center text-xs text-red-500 font-semibold">{sar(d.expenses, true)}</td>
                            <td className={`py-2 text-center text-xs font-black ${d.net_profit >= 0 ? "text-cyan-700" : "text-red-600"}`}>
                              {sar(d.net_profit, true)}
                            </td>
                            <td className="py-2 text-center text-xs text-indigo-600 font-semibold">
                              {d.active_months > 0 ? sar(Math.round(d.revenue / d.active_months), true) : "—"}
                              {d.active_months > 0 && <span className="text-gray-400 text-[10px] block">{d.active_months} شهر</span>}
                            </td>
                            <td className="py-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                d.net_profit >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                              }`}>{pct(d.net_profit, d.revenue || 1)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Vehicle Ranking */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-black text-gray-800">🚛 تصنيف السيارات</h2>
                    <span className="text-xs text-gray-400">ضغطتين على صف لعرض التفاصيل</span>
                  </div>
                  <div className="overflow-auto max-h-72">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-gray-100 text-xs text-gray-400">
                          <th className="text-right pb-2">سيارة</th>
                          <th className="text-center pb-2">نوع</th>
                          <th className="text-center pb-2">الصافي</th>
                          <th className="text-center pb-2">متوسط شهري</th>
                          <th className="text-center pb-2">ورشة</th>
                          <th className="text-center pb-2">قرار</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vehicles.map((v, i) => (
                          <tr key={v.vehicle}
                            className="border-b border-gray-50 hover:bg-cyan-50/60 cursor-pointer select-none"
                            onDoubleClick={() => openVehicleDrawer(v.vehicle)}
                            title="ضغطتين لعرض تفاصيل السيارة">
                            <td className="py-2 font-bold text-gray-800">
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-black mr-1 ${
                                i === 0 ? "bg-amber-400 text-white" :
                                i === 1 ? "bg-gray-300 text-white" :
                                i === 2 ? "bg-amber-700 text-white" : "bg-gray-100 text-gray-500"
                              }`}>{i + 1}</span>
                              {v.vehicle}
                            </td>
                            <td className="py-2 text-center text-xs text-gray-500">{v.activity || "—"}</td>
                            <td className={`py-2 text-center text-xs font-black ${v.net_profit >= 0 ? "text-cyan-700" : "text-red-600"}`}>
                              {sar(v.net_profit, true)}
                            </td>
                            <td className="py-2 text-center text-xs text-indigo-600 font-semibold">
                              {v.active_months > 0 ? sar(Math.round(v.revenue / v.active_months), true) : "—"}
                              {v.active_months > 0 && <span className="text-gray-400 text-[10px] block">{v.active_months} شهر</span>}
                            </td>
                            <td className="py-2 text-center text-xs text-orange-500 font-semibold">{v.workshop_count}</td>
                            <td className="py-2 text-center">
                              {v.net_profit >= NET_THRESHOLD ? (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">احتفظ ✅</span>
                              ) : (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setReviewPopup(p => p?.vehicle.vehicle === v.vehicle ? null : { vehicle: v, anchor: rect });
                                  }}
                                  className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold hover:bg-red-200 transition-colors cursor-pointer">
                                  راجع ⚠️
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Breakdown types + Vehicle bar chart side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Breakdown Types Pie */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h2 className="font-black text-gray-800 mb-4">🔧 أنواع الصيانة (إجمالي)</h2>
                  {breakdownChartData.length === 0 ? (
                    <p className="text-center text-gray-400 py-8">لا توجد بيانات صيانة</p>
                  ) : (
                    <div className="flex gap-4">
                      <ResponsiveContainer width="50%" height={200}>
                        <PieChart>
                          <Pie data={breakdownChartData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {breakdownChartData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number, name: string) => [v + " مرة", name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-1.5 self-center">
                        {breakdownChartData.map((d, i) => (
                          <div key={d.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                              <span className="text-gray-700 font-semibold">{d.name}</span>
                            </div>
                            <span className="text-gray-500 font-mono">{d.count} | {sar(d.cost, true)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Revenue vs Expenses per vehicle bar */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h2 className="font-black text-gray-800 mb-4">📊 الإيرادات والمصاريف لكل سيارة</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={vehicles.map(v => ({ name: v.vehicle, revenue: Math.round(v.revenue), expenses: Math.round(v.expenses) }))} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v.toLocaleString("ar-SA")} />
                      <Tooltip formatter={(v: number) => sar(v)} />
                      <Legend />
                      <Bar dataKey="revenue"  name="الإيرادات" fill="#10b981" radius={[3,3,0,0]} />
                      <Bar dataKey="expenses" name="المصاريف"  fill="#ef4444" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Driver-Vehicle Matrix */}
              {matrix && matrixDrivers.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h2 className="font-black text-gray-800 mb-1">🔩 مصفوفة السائق × السيارة (عدد أوامر الورشة)</h2>
                  <p className="text-xs text-gray-400 mb-4">اللون الأغمق = عدد أوامر ورشة أعلى مع هذا الزوج (سائق + سيارة)</p>
                  <div className="overflow-x-auto">
                    <table className="text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-right text-gray-400 border border-gray-100 bg-gray-50 font-semibold min-w-[120px]">السائق \ السيارة</th>
                          {matrixVehicles.map(v => (
                            <th key={v} className="px-3 py-2 text-center border border-gray-100 bg-gray-50 font-bold text-gray-700">{v}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrixDrivers.map(d => {
                          const dRow = matrix.matrix[d] || {};
                          const maxCount = Math.max(...matrixDrivers.flatMap(dr =>
                            matrixVehicles.map(v => matrix.matrix[dr]?.[v]?.count || 0)
                          ), 1);
                          return (
                            <tr key={d} className="hover:bg-amber-50/30">
                              <td className="px-3 py-2 text-right font-semibold text-gray-700 border border-gray-100 bg-gray-50/50 whitespace-nowrap">{d}</td>
                              {matrixVehicles.map(v => {
                                const cell = dRow[v];
                                const intensity = cell ? Math.round((cell.count / maxCount) * 100) : 0;
                                return (
                                  <td key={v} title={cell ? `${cell.count} أمر — ${sar(cell.cost, true)}` : "لا يوجد"}
                                    className="px-3 py-2 text-center border border-gray-100 font-bold"
                                    style={{
                                      background: cell
                                        ? `rgba(239, 68, 68, ${0.1 + (intensity / 100) * 0.7})`
                                        : "transparent",
                                      color: intensity > 50 ? "white" : cell ? "#ef4444" : "#d1d5db",
                                    }}>
                                    {cell ? cell.count : "·"}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">* يُظهر فقط أعلى 10 سائقين وسيارات من حيث أوامر الورشة</p>
                </div>
              )}

              {/* Recommendations section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {vehicles.filter(v => v.net_profit < 0).length > 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
                    <h2 className="font-black text-red-700 mb-3 flex items-center gap-2">
                      <AlertTriangle size={18} /> سيارات تحتاج مراجعة (صافي سالب)
                    </h2>
                    <div className="space-y-2">
                      {vehicles.filter(v => v.net_profit < 0).map(v => (
                        <div key={v.vehicle} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 shadow-sm">
                          <div>
                            <span className="font-black text-gray-800">سيارة {v.vehicle}</span>
                            {v.activity && <span className="text-xs text-gray-400 mr-2">({v.activity})</span>}
                          </div>
                          <div className="text-sm font-black text-red-600">{sar(v.net_profit)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {vehicles.filter(v => v.net_profit > 0).length > 0 && (
                  <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
                    <h2 className="font-black text-green-700 mb-3 flex items-center gap-2">
                      <CheckCircle size={18} /> أفضل السيارات أداءً (صافي موجب)
                    </h2>
                    <div className="space-y-2">
                      {vehicles.filter(v => v.net_profit > 0).slice(0, 5).map(v => (
                        <div key={v.vehicle} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 shadow-sm">
                          <div>
                            <span className="font-black text-gray-800">سيارة {v.vehicle}</span>
                            {v.activity && <span className="text-xs text-gray-400 mr-2">({v.activity})</span>}
                          </div>
                          <div className="text-sm font-black text-green-700">{sar(v.net_profit)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
           DATA TAB
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "data" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Search size={15} className="text-gray-400 flex-shrink-0" />
              <select value={filters.driver} onChange={e => setFilters(p => ({ ...p, driver: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none">
                <option value="">كل السائقين</option>
                {meta.drivers.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={filters.vehicle} onChange={e => setFilters(p => ({ ...p, vehicle: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none">
                <option value="">كل السيارات</option>
                {meta.vehicles.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={`${filters.year}-${filters.month}`}
                onChange={e => {
                  const [yr, mn] = e.target.value.split("-");
                  setFilters(p => ({ ...p, year: yr === "0" ? "" : yr, month: mn === "0" ? "" : mn }));
                }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none">
                <option value="0-0">كل الفترات</option>
                {meta.months.map(m => (
                  <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                    {m.year} — شهر {m.month}
                  </option>
                ))}
              </select>
              <select value={filters.account_tab} onChange={e => setFilters(p => ({ ...p, account_tab: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none">
                <option value="">كل التبويبات</option>
                {meta.accountTabs.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filters.account_name} onChange={e => setFilters(p => ({ ...p, account_name: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none max-w-[200px]">
                <option value="">كل أسماء الحسابات</option>
                {meta.accountNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button onClick={() => loadTx(1)}
                className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-xs font-bold hover:bg-cyan-700">
                بحث
              </button>
              <button onClick={() => { setFilters({ driver: "", vehicle: "", month: "", year: "", account_tab: "", account_name: "" }); }}
                className="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg text-xs font-bold hover:bg-gray-50">
                إعادة تعيين
              </button>
              {txSel.size > 0 && (
                <button onClick={bulkDeleteTxs}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700">
                  <Trash2 size={13} /> حذف المحدد ({txSel.size})
                </button>
              )}
              <button
                onClick={() => runAiAnalysis(filters.vehicle || undefined, filters.driver || undefined)}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-700 mr-auto">
                <Sparkles size={13} /> تحليل AI للبيان
              </button>
              <span className="text-xs text-gray-400">{txTotal.toLocaleString("ar-SA")} سجل</span>
            </div>
          </div>

          {txRows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Database size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="text-gray-500 font-semibold">لا توجد بيانات — ارفع ملف Excel أولاً</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox"
                          checked={txRows.length > 0 && txRows.every(r => txSel.has(r.id))}
                          onChange={e => setTxSel(e.target.checked ? new Set(txRows.map(r => r.id)) : new Set())}
                          className="w-3.5 h-3.5 rounded accent-cyan-600" />
                      </th>
                      <th className="text-right px-3 py-3">السائق</th>
                      <th className="text-center px-3 py-3">سيارة</th>
                      <th className="text-center px-3 py-3">النشاط</th>
                      <th className="text-right px-3 py-3">اسم الحساب</th>
                      <th className="text-right px-3 py-3">البيان</th>
                      <th className="text-center px-3 py-3">الشهر/السنة</th>
                      <th className="text-center px-3 py-3">مدين</th>
                      <th className="text-center px-3 py-3">دائن</th>
                      <th className="text-center px-3 py-3">الصافي</th>
                      <th className="text-right px-3 py-3">تبويب الحساب</th>
                      <th className="text-center px-3 py-3">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txRows.map(r => (
                      <tr key={r.id}
                        className={`border-b border-gray-50 transition-colors ${txSel.has(r.id) ? "bg-cyan-50/60" : "hover:bg-gray-50/50"}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={txSel.has(r.id)}
                            onChange={e => setTxSel(prev => { const s = new Set(prev); e.target.checked ? s.add(r.id) : s.delete(r.id); return s; })}
                            className="w-3.5 h-3.5 rounded accent-cyan-600" />
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-800">{r.driver_name || "—"}</td>
                        <td className="px-3 py-2 text-center font-mono text-cyan-700">{r.cost_center || "—"}</td>
                        <td className="px-3 py-2 text-center text-gray-500">{r.activity || "—"}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[150px] truncate">{r.account_name || "—"}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">{r.description || "—"}</td>
                        <td className="px-3 py-2 text-center text-gray-500">{r.year}/{r.month}</td>
                        <td className="px-3 py-2 text-center text-orange-600">{r.debit > 0 ? r.debit.toLocaleString("ar-SA") : "—"}</td>
                        <td className="px-3 py-2 text-center text-green-600">{r.credit > 0 ? r.credit.toLocaleString("ar-SA") : "—"}</td>
                        <td className={`px-3 py-2 text-center font-bold ${r.net >= 0 ? "text-cyan-700" : "text-red-600"}`}>
                          {r.net.toLocaleString("ar-SA")}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[130px] truncate">{r.account_tab || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-center">
                            <button onClick={() => openEditRow(r)} title="تعديل"
                              className="p-1 rounded hover:bg-cyan-50 text-cyan-600 transition-colors">
                              <Edit2 size={12} />
                            </button>
                            <button onClick={() => deleteSingleTx(r.id)} title="حذف"
                              className="p-1 rounded hover:bg-red-50 text-red-400 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {txTotal > 100 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400">صفحة {txPage} من {Math.ceil(txTotal / 100)}</span>
                  <div className="flex gap-2">
                    <button onClick={() => loadTx(txPage - 1)} disabled={txPage <= 1}
                      className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">السابق</button>
                    <button onClick={() => loadTx(txPage + 1)} disabled={txPage >= Math.ceil(txTotal / 100)}
                      className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">التالي</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
           EDIT TRANSACTION MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-black text-gray-900 flex items-center gap-2">
                <Edit2 size={16} className="text-cyan-600" /> تعديل السجل #{editRow.id}
              </h2>
              <button onClick={() => setEditRow(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>
            {/* Form */}
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              {([
                ["driver_name",  "اسم السائق",      "text"],
                ["cost_center",  "رقم السيارة",      "text"],
                ["activity",     "النشاط",           "text"],
                ["account_name", "اسم الحساب",       "text"],
                ["account_tab",  "تبويب الحساب",     "text"],
                ["description",  "البيان",           "text"],
                ["doc_number",   "رقم المستند",      "text"],
                ["tx_date",      "تاريخ العملية",    "date"],
                ["month",        "الشهر",            "number"],
                ["year",         "السنة",            "number"],
                ["debit",        "مدين",             "number"],
                ["credit",       "دائن",             "number"],
              ] as [string, string, string][]).map(([key, label, type]) => (
                <div key={key} className={key === "description" ? "col-span-2" : ""}>
                  <label className="block text-xs font-bold text-gray-500 mb-1">{label}</label>
                  <input
                    type={type}
                    value={editDraft[key] ?? ""}
                    onChange={e => setEditDraft(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                    dir={type === "text" ? "rtl" : "ltr"}
                  />
                </div>
              ))}
              {/* Computed net preview */}
              <div className="col-span-2 bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-2">
                <span className="text-xs text-gray-500">الصافي بعد التعديل:</span>
                <span className={`font-black text-base ${
                  (parseFloat(editDraft["credit"] || "0") - parseFloat(editDraft["debit"] || "0")) >= 0
                    ? "text-cyan-700" : "text-red-600"
                }`}>
                  {(parseFloat(editDraft["credit"] || "0") - parseFloat(editDraft["debit"] || "0")).toLocaleString("ar-SA")}
                </span>
              </div>
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setEditRow(null)}
                className="px-5 py-2 text-sm border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 font-semibold">
                إلغاء
              </button>
              <button onClick={saveTxEdit}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 font-bold">
                <Save size={14} /> حفظ التعديل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
           EMAIL TAB
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "email" && (
        <div className="space-y-5">
          {/* ── Gmail Credentials Card ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-gray-900 text-base flex items-center gap-2">
                <Settings size={18} className="text-cyan-600" /> إعداد حساب Gmail للإرسال
              </h2>
              {gmailPassSet && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full border border-green-200">
                  <CheckCircle size={13} /> مُعدَّ مسبقاً
                </span>
              )}
            </div>

            {/* Help notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800 space-y-1.5">
              <p className="font-bold flex items-center gap-2">⚠️ يجب استخدام "كلمة مرور التطبيق" وليس كلمة مرور حساب Google العادية</p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-amber-700 mr-2">
                <li>افتح <strong>myaccount.google.com</strong> وتأكد من تفعيل التحقق بخطوتين</li>
                <li>ابحث عن <strong>"App Passwords"</strong> أو كلمات مرور التطبيقات</li>
                <li>أنشئ كلمة مرور جديدة (اختر "Mail" + "Other") وانسخها هنا</li>
              </ol>
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-700 underline hover:text-amber-900 font-semibold mt-1">
                <ExternalLink size={12} /> فتح صفحة App Passwords من Google
              </a>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">حساب Gmail</label>
                <input
                  type="email"
                  value={gmailUser}
                  onChange={e => setGmailUser(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 font-mono"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">
                  كلمة مرور التطبيق (App Password)
                  {gmailPassSet && <span className="mr-2 text-xs text-green-600 font-normal">● محفوظة</span>}
                </label>
                <div className="relative">
                  <input
                    type={showGmailPass ? "text" : "password"}
                    value={gmailPass}
                    onChange={e => setGmailPass(e.target.value)}
                    placeholder={gmailPassSet ? "اتركه فارغاً للإبقاء على الحالي" : "xxxx xxxx xxxx xxxx"}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 font-mono pl-10"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGmailPass(p => !p)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showGmailPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-gray-100">
              <button
                onClick={saveGmailConfig}
                disabled={gmailSaving || !gmailUser.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-xl font-bold text-sm hover:bg-cyan-700 disabled:opacity-50 transition-colors">
                {gmailSaving ? <RefreshCw size={15} className="animate-spin" /> : <Settings size={15} />}
                {gmailSaving ? "جاري الحفظ..." : "حفظ الإعدادات"}
              </button>
              <button
                onClick={handleTestEmail}
                disabled={gmailTesting || (!gmailPassSet && !gmailPass)}
                className="flex items-center gap-2 px-5 py-2.5 border border-emerald-300 text-emerald-700 rounded-xl font-bold text-sm hover:bg-emerald-50 disabled:opacity-50 transition-colors">
                {gmailTesting ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                {gmailTesting ? "جاري الاختبار..." : "اختبار الإرسال"}
              </button>
              {gmailMsg && (
                <span className={`text-sm font-bold flex items-center gap-1 ${gmailMsg.ok ? "text-green-600" : "text-red-600"}`}>
                  {gmailMsg.ok ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                  {gmailMsg.text}
                </span>
              )}
            </div>
          </div>

          {/* Settings card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <h2 className="font-black text-gray-900 text-base flex items-center gap-2">
              <Mail size={18} className="text-cyan-600" /> إعدادات الإرسال الشهري
            </h2>

            {/* Enable toggle */}
            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-4">
              <div>
                <p className="font-bold text-gray-800">الإرسال التلقائي</p>
                <p className="text-xs text-gray-400 mt-0.5">يُرسل التقرير تلقائياً في اليوم المحدد من كل شهر</p>
              </div>
              <button
                onClick={() => saveEmailSettings({ enabled: !emailSettings.enabled })}
                disabled={emailSaving}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                  emailSettings.enabled ? "bg-cyan-600" : "bg-gray-300"
                }`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                  emailSettings.enabled ? "right-1" : "right-7"
                }`} />
              </button>
            </div>

            {/* Send day */}
            <div className="flex items-center gap-4">
              <label className="font-semibold text-gray-700 text-sm whitespace-nowrap">يوم الإرسال (من الشهر):</label>
              <select
                value={emailSettings.send_day}
                onChange={e => saveEmailSettings({ send_day: Number(e.target.value) })}
                disabled={emailSaving}
                className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-400">
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>اليوم {d}</option>
                ))}
              </select>
              {emailSettings.last_sent && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock size={13} /> آخر إرسال: {emailSettings.last_sent}
                </span>
              )}
            </div>

            {/* Recipients */}
            <div>
              <p className="font-semibold text-gray-700 text-sm mb-3">المستلمون</p>
              <div className="space-y-2 mb-3">
                {emailSettings.recipients.length === 0 && (
                  <p className="text-xs text-gray-400 italic">لم يُضف أي مستلم بعد</p>
                )}
                {emailSettings.recipients.map(email => (
                  <div key={email} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                    <span className="text-sm font-mono text-gray-700">{email}</span>
                    <button onClick={() => removeRecipient(email)}
                      className="text-red-400 hover:text-red-600 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newRecipient}
                  onChange={e => setNewRecipient(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addRecipient()}
                  placeholder="أضف بريد إلكتروني..."
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-400"
                />
                <button onClick={addRecipient}
                  disabled={emailSaving || !newRecipient.includes("@")}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-xl font-bold text-sm hover:bg-cyan-700 disabled:opacity-50 transition-colors">
                  <Plus size={15} /> إضافة
                </button>
              </div>
            </div>

            {/* Fallback email */}
            <div>
              <p className="font-semibold text-gray-700 text-sm mb-1 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-500" />
                بريد الطوارئ (عند فشل الإرسال)
              </p>
              <p className="text-xs text-gray-400 mb-2">إذا فشل الإرسال التلقائي، سيُرسل تنبيه لهذا البريد بدلاً منه</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailSettings.fallback_email}
                  onChange={e => setEmailSettings(prev => ({ ...prev, fallback_email: e.target.value }))}
                  onBlur={() => saveEmailSettings({ fallback_email: emailSettings.fallback_email })}
                  placeholder="fallback@example.com"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Actions row */}
            <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
              <button
                onClick={handleSendNow}
                disabled={emailSending || emailSettings.recipients.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {emailSending ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                {emailSending ? "جاري الإرسال..." : "إرسال الآن"}
              </button>
              <p className="text-xs text-gray-400">يُرسل التقرير الحالي فوراً لجميع المستلمين</p>
              {emailMsg && (
                <span className={`text-sm font-bold mr-auto flex items-center gap-1 ${emailMsg.ok ? "text-green-600" : "text-red-600"}`}>
                  {emailMsg.ok ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                  {emailMsg.text}
                </span>
              )}
            </div>
          </div>

          {/* Send log */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-gray-900 text-base flex items-center gap-2">
                <Clock size={18} className="text-gray-400" /> سجل الإرسال
              </h2>
              <button onClick={loadEmailSettings}
                className="p-2 border border-gray-200 rounded-xl text-gray-400 hover:bg-gray-50">
                <RefreshCw size={14} />
              </button>
            </div>
            {emailLog.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">لم يُرسل أي تقرير بعد</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400">
                      <th className="text-right pb-2 pr-2">الفترة</th>
                      <th className="text-right pb-2">المستلمون</th>
                      <th className="text-center pb-2">وقت الإرسال</th>
                      <th className="text-center pb-2">بواسطة</th>
                      <th className="text-center pb-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailLog.map(row => (
                      <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-2 pr-2 font-mono font-bold text-gray-800">{row.period_label || "—"}</td>
                        <td className="py-2 text-xs text-gray-500 max-w-[220px] truncate">{row.recipients}</td>
                        <td className="py-2 text-center text-xs text-gray-400">
                          {new Date(row.sent_at).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            row.triggered_by === "manual"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {row.triggered_by === "manual" ? "يدوي" : "تلقائي"}
                          </span>
                        </td>
                        <td className="py-2 text-center">
                          {row.status === "ok" ? (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 w-fit mx-auto">
                              <CheckCircle size={12} /> تم
                            </span>
                          ) : (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold" title={row.error || ""}>
                              فشل ⚠
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Review Popup (reasons + best driver) ── */}
      {reviewPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setReviewPopup(null)} />
          <div
            className="fixed z-50 w-72 bg-white rounded-2xl shadow-2xl border border-red-100 p-4"
            style={{
              top: Math.min(reviewPopup.anchor.bottom + 6, window.innerHeight - 280),
              right: Math.max(window.innerWidth - reviewPopup.anchor.right, 8),
            }}
            dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-red-500" />
                <span className="font-black text-red-700 text-sm">أسباب المراجعة</span>
                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">{reviewPopup.vehicle.vehicle}</span>
              </div>
              <button onClick={() => setReviewPopup(null)} className="text-gray-300 hover:text-gray-500">
                <X size={14} />
              </button>
            </div>

            <ul className="space-y-1.5 mb-4">
              {getReviewReasons(reviewPopup.vehicle, vehicles).map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                  <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-black text-[10px]">{i + 1}</span>
                  {r}
                </li>
              ))}
            </ul>

            {reviewPopup.vehicle.best_driver ? (
              <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3">
                <p className="text-xs text-cyan-500 font-bold mb-1">⭐ أفضل سائق لهذه السيارة</p>
                <div className="flex items-center justify-between">
                  <span
                    className="font-black text-cyan-800 text-sm cursor-pointer hover:underline"
                    onDoubleClick={() => { setReviewPopup(null); openDriverDrawer(reviewPopup.vehicle.best_driver!); }}>
                    {reviewPopup.vehicle.best_driver}
                  </span>
                  <span className={`text-xs font-bold ${reviewPopup.vehicle.best_driver_net >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {sar(reviewPopup.vehicle.best_driver_net, true)}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">ضغطتين على الاسم لعرض تفاصيله</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center">لا يوجد سائق مسجّل بعد</p>
            )}
          </div>
        </>
      )}

      {/* ── Vehicle / Driver Detail Drawer ── */}
      {(vehicleDrawer || driverDrawer || drawerLoading) && (
        <div className="fixed inset-0 z-40 flex" dir="rtl">
          <div className="flex-1" onClick={() => { setVehicleDrawer(null); setDriverDrawer(null); }} />
          <div className="w-full max-w-md bg-white shadow-2xl border-r border-gray-100 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="font-black text-gray-900 text-base">
                {drawerLoading ? "جاري التحميل..." :
                  vehicleDrawer ? `🚛 ${vehicleDrawer.vehicle}` :
                  driverDrawer  ? `👤 ${driverDrawer.driver}` : ""}
              </h3>
              <button onClick={() => { setVehicleDrawer(null); setDriverDrawer(null); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            {drawerLoading && (
              <div className="flex-1 flex items-center justify-center py-20">
                <RefreshCw size={28} className="animate-spin text-cyan-500" />
              </div>
            )}

            {/* ── Vehicle Drawer Body ── */}
            {vehicleDrawer && !drawerLoading && (() => {
              const d = vehicleDrawer;
              return (
                <div className="p-4 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "إيرادات", val: sar(d.kpi.revenue, true), cls: "text-green-600" },
                      { label: "مصاريف", val: sar(d.kpi.expenses, true), cls: "text-red-500" },
                      { label: "صافي", val: sar(d.kpi.net_profit, true), cls: d.kpi.net_profit >= 0 ? "text-cyan-700" : "text-red-600" },
                      { label: "عدد الحركات", val: d.kpi.tx_count.toLocaleString("ar-SA"), cls: "text-gray-700" },
                    ].map(k => (
                      <div key={k.label} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-0.5">{k.label}</p>
                        <p className={`font-black text-sm ${k.cls}`}>{k.val}</p>
                      </div>
                    ))}
                  </div>
                  {d.kpi.period_from && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                      <Calendar size={13} />
                      <span>فترة النشاط: <strong>{d.kpi.period_from}</strong> → <strong>{d.kpi.period_to}</strong></span>
                      <span className="mr-auto text-cyan-600 font-bold">{d.kpi.active_months} شهر</span>
                    </div>
                  )}
                  {d.monthly.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-2">الاتجاه الشهري</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={d.monthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="period" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} width={60} tickFormatter={v => v.toLocaleString("ar-SA")} />
                          <Tooltip formatter={(v: number) => sar(v)} />
                          <Line type="monotone" dataKey="net_profit" name="الصافي" stroke="#0891b2" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {d.drivers.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-2">السائقون ({d.drivers.length})</p>
                      <div className="overflow-auto max-h-48">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 text-gray-400">
                              <th className="text-right pb-1">السائق</th>
                              <th className="text-center pb-1">من</th>
                              <th className="text-center pb-1">إلى</th>
                              <th className="text-center pb-1">صافي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.drivers.map(dr => (
                              <tr key={dr.driver_name} className="border-b border-gray-50 hover:bg-cyan-50/40 cursor-pointer"
                                onDoubleClick={() => openDriverDrawer(dr.driver_name)}>
                                <td className="py-1 font-semibold">{dr.driver_name}</td>
                                <td className="py-1 text-center text-gray-400">{dr.period_from ?? "—"}</td>
                                <td className="py-1 text-center text-gray-400">{dr.period_to ?? "—"}</td>
                                <td className={`py-1 text-center font-bold ${dr.net_profit >= 0 ? "text-cyan-700" : "text-red-500"}`}>{sar(dr.net_profit, true)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {Object.keys(d.breakdownTypes).length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-2">أنواع الصيانة</p>
                      <ResponsiveContainer width="100%" height={90}>
                        <BarChart data={Object.entries(d.breakdownTypes).map(([k, v]) => ({ name: k, cost: v.cost, count: v.count }))}
                          layout="vertical" margin={{ top: 0, right: 0, left: 60, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => v.toLocaleString("ar-SA")} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={60} />
                          <Tooltip formatter={(v: number) => sar(v)} />
                          <Bar dataKey="cost" name="التكلفة" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <button onClick={() => runAiAnalysis(d.vehicle, undefined)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700">
                    <Sparkles size={14} /> تحليل AI للبيان
                  </button>
                </div>
              );
            })()}

            {/* ── Driver Drawer Body ── */}
            {driverDrawer && !drawerLoading && (() => {
              const d = driverDrawer;
              return (
                <div className="p-4 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "إيرادات", val: sar(d.kpi.revenue, true), cls: "text-green-600" },
                      { label: "مصاريف", val: sar(d.kpi.expenses, true), cls: "text-red-500" },
                      { label: "صافي", val: sar(d.kpi.net_profit, true), cls: d.kpi.net_profit >= 0 ? "text-cyan-700" : "text-red-600" },
                      { label: "عدد الحركات", val: d.kpi.tx_count.toLocaleString("ar-SA"), cls: "text-gray-700" },
                    ].map(k => (
                      <div key={k.label} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-0.5">{k.label}</p>
                        <p className={`font-black text-sm ${k.cls}`}>{k.val}</p>
                      </div>
                    ))}
                  </div>
                  {d.kpi.period_from && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2.5">
                      <Calendar size={14} className="text-cyan-500 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-cyan-700 mb-0.5">فترة العمل</p>
                        <p>{d.kpi.period_from} → {d.kpi.period_to}</p>
                      </div>
                      <div className="mr-auto text-center">
                        <p className="text-lg font-black text-cyan-700 leading-none">{d.kpi.active_months}</p>
                        <p className="text-gray-400">شهر</p>
                      </div>
                    </div>
                  )}
                  {d.monthly.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-2">الاتجاه الشهري</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={d.monthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="period" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} width={60} tickFormatter={v => v.toLocaleString("ar-SA")} />
                          <Tooltip formatter={(v: number) => sar(v)} />
                          <Line type="monotone" dataKey="net_profit" name="الصافي" stroke="#0891b2" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {d.vehicles.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-2">السيارات المستخدمة ({d.vehicles.length})</p>
                      <div className="overflow-auto max-h-48">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 text-gray-400">
                              <th className="text-right pb-1">رقم السيارة</th>
                              <th className="text-center pb-1">من</th>
                              <th className="text-center pb-1">إلى</th>
                              <th className="text-center pb-1">صافي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.vehicles.map(v => (
                              <tr key={v.vehicle} className="border-b border-gray-50 hover:bg-cyan-50/40 cursor-pointer"
                                onDoubleClick={() => openVehicleDrawer(v.vehicle)}>
                                <td className="py-1 font-semibold">{v.vehicle}</td>
                                <td className="py-1 text-center text-gray-400">{v.period_from ?? "—"}</td>
                                <td className="py-1 text-center text-gray-400">{v.period_to ?? "—"}</td>
                                <td className={`py-1 text-center font-bold ${v.net_profit >= 0 ? "text-cyan-700" : "text-red-500"}`}>{sar(v.net_profit, true)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {Object.keys(d.breakdownTypes).length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-2">أنواع الصيانة</p>
                      <ResponsiveContainer width="100%" height={90}>
                        <BarChart data={Object.entries(d.breakdownTypes).map(([k, v]) => ({ name: k, cost: v.cost }))}
                          layout="vertical" margin={{ top: 0, right: 0, left: 60, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => v.toLocaleString("ar-SA")} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={60} />
                          <Tooltip formatter={(v: number) => sar(v)} />
                          <Bar dataKey="cost" name="التكلفة" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <button onClick={() => runAiAnalysis(undefined, d.driver)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700">
                    <Sparkles size={14} /> تحليل AI للبيان
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── AI Analysis Modal ── */}
      {aiModal.open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/50 backdrop-blur-sm" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-violet-500" />
                <h3 className="font-black text-gray-900">تحليل AI للبيان</h3>
                {(aiModal.vehicle || aiModal.driver) && (
                  <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">
                    {aiModal.vehicle || aiModal.driver}
                  </span>
                )}
              </div>
              <button onClick={() => setAiModal(p => ({ ...p, open: false }))}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            {aiModal.loading && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
                <RefreshCw size={32} className="animate-spin text-violet-500" />
                <p className="text-sm text-gray-500">الذكاء الاصطناعي يحلل البيانات...</p>
              </div>
            )}

            {!aiModal.loading && aiModal.result && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {aiModal.result.summary && (
                  <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
                    <p className="text-xs font-bold text-violet-600 mb-1">ملخص التحليل</p>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{aiModal.result.summary}</p>
                  </div>
                )}
                {aiModal.result.items.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-500">{aiModal.result.items.length} نص محلل</p>
                      <button
                        onClick={() => {
                          const csv = ["النص الأصلي,الفئة,الملاحظة",
                            ...aiModal.result!.items.map(r =>
                              `"${r.original.replace(/"/g,'""')}","${r.category}","${r.note}"`)
                          ].join("\n");
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
                          a.download = "ai_analysis.csv";
                          a.click();
                        }}
                        className="flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-800 font-bold">
                        <FileDown size={12} /> تحميل CSV
                      </button>
                    </div>
                    <div className="overflow-auto max-h-64 rounded-xl border border-gray-100">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="border-b border-gray-100 text-gray-400">
                            <th className="text-right p-2 font-bold">النص الأصلي</th>
                            <th className="text-center p-2 font-bold whitespace-nowrap">الفئة</th>
                            <th className="text-right p-2 font-bold">ملاحظة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiModal.result.items.map((item, i) => (
                            <tr key={i} className={`border-b border-gray-50 ${item.note ? "bg-amber-50/40" : ""}`}>
                              <td className="p-2 text-gray-700 max-w-xs">{item.original}</td>
                              <td className="p-2 text-center">
                                <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                                  {item.category}
                                </span>
                              </td>
                              <td className="p-2 text-amber-700 font-semibold">{item.note || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Clear Confirm Modal ── */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center">
            <AlertTriangle size={40} className="text-red-400 mx-auto mb-4" />
            <h3 className="font-black text-gray-900 text-lg mb-2">حذف جميع البيانات؟</h3>
            <p className="text-sm text-gray-500 mb-6">سيتم حذف جميع الحركات المستوردة نهائياً ولا يمكن التراجع.</p>
            <div className="flex gap-3">
              <button onClick={clearData} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black hover:bg-red-700">
                نعم، احذف
              </button>
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
