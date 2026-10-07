import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { MonthShortcuts } from "@/components/MonthShortcuts";
import { useRememberedState } from "@/hooks/useRememberedState";
import {
  DollarSign, CheckCircle, XCircle, RefreshCw, Settings,
  MapPin, Truck, Clock, BarChart3, ChevronLeft, TrendingUp, TrendingDown,
  BookOpen, Scale, Download, Plus, RotateCcw, Filter,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Tariff {
  id: number; loading_place: string; unloading_place: string;
  driver_expense: number; rental: number; status: string;
  proposed_by: string | null; price_set_by: string | null; synced_at: string;
}
interface FinanceSettings {
  supervisor_salary_pct: number; transport_pct: number;
  admin_pct: number; driver_salary_default: number;
}
interface ReportRow {
  vehicle_plate: unknown; driver_name: unknown; driver_phone: unknown;
  trips: number; revenue: number; driver_bonus_gross: number;
  diesel: number; repairs: number; supervisor_cost: number;
  transport_cost: number; admin_cost: number; driver_salary: number; net_profit: number;
}
interface ReportData { report: ReportRow[]; totals: ReportRow; settings: FinanceSettings; from: string; to: string; }

interface Account { code: string; name: string; type: string; normal_side: string; }
interface JournalEntry {
  id: number; entry_date: string; reference_type: string; reference_id: string | null;
  debit_account: string; debit_account_name: string;
  credit_account: string; credit_account_name: string;
  amount: number; description: string | null; created_by: string | null; created_at: string;
}
interface TrialBalanceRow {
  code: string; name: string; type: string; normal_side: string;
  total_debit: number; total_credit: number; balance: number;
}
interface TrialBalance { rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number; balanced: boolean; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return (n || 0).toLocaleString("ar-SA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtSAR(n: number) { return `${fmt(n)} ر.س`; }

const RTYPE_LABELS: Record<string, string> = {
  invoice:           "فاتورة",
  payment_cash:      "دفع نقدي",
  payment_bank:      "دفع بنكي",
  purchase_receive:  "استلام مشتريات",
  job_inventory:     "إغلاق أمر عمل (مخزون)",
  job_external:      "إغلاق أمر عمل (خارجي)",
  settlement_create: "إنشاء تسوية",
  settlement_pay:    "صرف تسوية",
  manual:            "قيد يدوي",
  reversal:          "قيد عكسي",
};

const TYPE_COLORS: Record<string, string> = {
  invoice:           "bg-blue-50 text-blue-700",
  payment_cash:      "bg-green-50 text-green-700",
  payment_bank:      "bg-emerald-50 text-emerald-700",
  purchase_receive:  "bg-orange-50 text-orange-700",
  job_inventory:     "bg-amber-50 text-amber-700",
  job_external:      "bg-red-50 text-red-700",
  settlement_create: "bg-purple-50 text-purple-700",
  settlement_pay:    "bg-indigo-50 text-indigo-700",
  manual:            "bg-gray-100 text-gray-700",
  reversal:          "bg-rose-50 text-rose-700",
};

const now_d = new Date();
const _pmFirst = new Date(now_d.getFullYear(), now_d.getMonth() - 1, 1).toISOString().slice(0, 10);
const _pmLast  = new Date(now_d.getFullYear(), now_d.getMonth(), 0).toISOString().slice(0, 10);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function FinancePage() {
  const { token } = useAuth();
  const [tab, setTab] = useRememberedState<"pending" | "report" | "journal" | "trial" | "settings">("admin-finance-active-tab", "pending");

  // Tariffs
  const [tariffs,       setTariffs]       = useState<Tariff[]>([]);
  const [priceInputs,   setPriceInputs]   = useState<Record<number, { driver_expense: string; rental: string }>>({});

  // Settings
  const [settings,      setSettings]      = useState<FinanceSettings>({ supervisor_salary_pct: 5, transport_pct: 3, admin_pct: 7, driver_salary_default: 3000 });
  const [settingsDraft, setSettingsDraft] = useState<FinanceSettings>({ supervisor_salary_pct: 5, transport_pct: 3, admin_pct: 7, driver_salary_default: 3000 });
  const [saving,        setSaving]        = useState(false);

  // Report
  const [report,     setReport]     = useState<ReportData | null>(null);
  const [repLoading, setRepLoading] = useState(false);
  const [reportFrom, setReportFrom] = useRememberedState("admin-finance-report-from", _pmFirst);
  const [reportTo,   setReportTo]   = useRememberedState("admin-finance-report-to", _pmLast);

  // Journal
  const [journal,      setJournal]    = useState<JournalEntry[]>([]);
  const [accounts,     setAccounts]   = useState<Account[]>([]);
  const [jLoading,     setJLoading]   = useState(false);
  const [jFrom,        setJFrom]      = useRememberedState("admin-finance-journal-from", _pmFirst);
  const [jTo,          setJTo]        = useRememberedState("admin-finance-journal-to", _pmLast);
  const [jAccount,     setJAccount]   = useRememberedState("admin-finance-journal-account-filter", "");
  const [jRefType,     setJRefType]   = useRememberedState("admin-finance-journal-reference-type-filter", "");
  const [showManual,   setShowManual] = useState(false);
  const [manualForm,   setManualForm] = useState({ debit_account: "", credit_account: "", amount: "", description: "", entry_date: new Date().toISOString().slice(0, 10) });
  const [manualSaving, setManualSaving] = useState(false);

  // Trial Balance
  const [trial,    setTrial]    = useState<TrialBalance | null>(null);
  const [tLoading, setTLoading] = useState(false);
  const [tFrom,    setTFrom]    = useRememberedState("admin-finance-trial-from", _pmFirst);
  const [tTo,      setTTo]      = useRememberedState("admin-finance-trial-to", _pmLast);

  // Shared
  const [msg, setMsg] = useState<string | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flash(m: string) {
    setMsg(m);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 3000);
  }

  // ── Load fns ─────────────────────────────────────────────────────────────
  const loadTariffs  = () => fetch("/api/tariffs").then(r => r.json()).then(d => setTariffs(Array.isArray(d.rows) ? d.rows : []));
  const loadSettings = () => fetch("/api/finance-settings").then(r => r.json()).then(s => { setSettings(s); setSettingsDraft(s); });
  const loadAccounts = () => fetch("/api/chart-of-accounts").then(r => r.json()).then(setAccounts);

  const loadReport = () => {
    setRepLoading(true);
    fetch(`/api/finance/report?from=${reportFrom}&to=${reportTo}`)
      .then(r => r.json()).then(setReport).finally(() => setRepLoading(false));
  };

  const loadJournal = () => {
    setJLoading(true);
    const p = new URLSearchParams({ from: jFrom, to: jTo });
    if (jAccount) p.set("account", jAccount);
    if (jRefType)  p.set("reference_type", jRefType);
    fetch(`/api/journal-entries?${p}`).then(r => r.json()).then(d => {
      setJournal(Array.isArray(d) ? d : []);
    }).finally(() => setJLoading(false));
  };

  const loadTrial = () => {
    setTLoading(true);
    const p = new URLSearchParams({ from: tFrom, to: tTo });
    fetch(`/api/trial-balance?${p}`).then(r => r.json()).then(setTrial).finally(() => setTLoading(false));
  };

  useEffect(() => { loadTariffs(); loadSettings(); loadAccounts(); }, []);
  useEffect(() => { if (tab === "report")   loadReport(); }, [tab]);
  useEffect(() => { if (tab === "journal")  loadJournal(); }, [tab]);
  useEffect(() => { if (tab === "trial")    loadTrial(); }, [tab]);

  // ── Tariff actions ────────────────────────────────────────────────────────
  const approve = async (id: number) => {
    const inp = priceInputs[id];
    if (inp) {
      await fetch(`/api/tariffs/${id}/set-price`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driver_expense: parseFloat(inp.driver_expense) || 0, rental: parseFloat(inp.rental) || 0 }) });
    }
    await fetch(`/api/tariffs/${id}/approve`, { method: "PUT" });
    setPriceInputs(p => { const n = { ...p }; delete n[id]; return n; });
    loadTariffs();
  };
  const reject = async (id: number) => {
    if (!confirm("تأكيد رفض هذا المسار؟")) return;
    await fetch(`/api/tariffs/${id}/reject`, { method: "PUT" });
    loadTariffs();
  };
  const setPrice = async (id: number) => {
    const inp = priceInputs[id];
    if (!inp) return;
    await fetch(`/api/tariffs/${id}/set-price`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driver_expense: parseFloat(inp.driver_expense) || 0, rental: parseFloat(inp.rental) || 0 }) });
    setPriceInputs(p => { const n = { ...p }; delete n[id]; return n; });
    loadTariffs();
    flash("تم حفظ السعر");
  };

  // ── Settings save ─────────────────────────────────────────────────────────
  const saveSettings = async () => {
    setSaving(true);
    await fetch("/api/finance-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settingsDraft) });
    setSettings(settingsDraft);
    setSaving(false);
    flash("تم حفظ الإعدادات");
  };

  // ── Manual journal entry ──────────────────────────────────────────────────
  const submitManual = async () => {
    if (!manualForm.debit_account || !manualForm.credit_account || !manualForm.amount || !manualForm.description) {
      flash("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }
    setManualSaving(true);
    const r = await fetch("/api/journal-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...manualForm, amount: parseFloat(manualForm.amount) }),
    });
    const data = await r.json();
    setManualSaving(false);
    if (r.ok) {
      flash("تم إنشاء القيد اليدوي");
      setShowManual(false);
      setManualForm({ debit_account: "", credit_account: "", amount: "", description: "", entry_date: new Date().toISOString().slice(0, 10) });
      loadJournal();
    } else {
      flash(data.error || "خطأ في إنشاء القيد");
    }
  };

  // ── Reverse entry ─────────────────────────────────────────────────────────
  const reverseEntry = async (id: number) => {
    const reason = prompt("سبب العكس (إلزامي):");
    if (!reason) return;
    const r = await fetch(`/api/journal-entries/${id}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
    });
    const data = await r.json();
    if (r.ok) { flash("تم إنشاء القيد العكسي"); loadJournal(); }
    else flash(data.error || "خطأ");
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const exportJournal = () => {
    const p = new URLSearchParams({ from: jFrom, to: jTo });
    if (jAccount) p.set("account", jAccount);
    if (jRefType)  p.set("reference_type", jRefType);
    window.open(`/api/journal-entries/export?${p}`, "_blank");
  };

  // ── Tabs config ───────────────────────────────────────────────────────────
  const pendingTariffs = tariffs.filter(t => t.status === "pending");
  const TABS = [
    { key: "pending"  as const, label: "التعريفات المعلقة", icon: Clock,     badge: pendingTariffs.length },
    { key: "journal"  as const, label: "سجل اليومية",       icon: BookOpen  },
    { key: "trial"    as const, label: "ميزان المراجعة",    icon: Scale     },
    { key: "report"   as const, label: "التقرير المالي",    icon: BarChart3 },
    { key: "settings" as const, label: "إعدادات التكاليف",  icon: Settings  },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="space-y-5 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <DollarSign size={24} className="text-[#103c68]" />المالية
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">قيود اليومية · ميزان المراجعة · التعريفات · التقرير المالي</p>
        </div>
        {msg && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-2.5 text-sm font-semibold">
            <CheckCircle size={15} />{msg}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon, badge }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-shrink-0 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all
              ${tab === key ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon size={15} />
            <span className="hidden sm:inline">{label}</span>
            {badge != null && badge > 0 && (
              <span className="bg-red-500 text-white text-[11px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ PENDING TARIFFS ══ */}
      {tab === "pending" && (
        <div className="space-y-3">
          {pendingTariffs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
              <CheckCircle size={42} className="mx-auto text-green-400 mb-3" />
              <p className="font-semibold text-gray-600">لا توجد تعريفات معلقة</p>
              <p className="text-xs text-gray-400 mt-1">جميع التعريفات المقترحة تمت معالجتها</p>
            </div>
          ) : pendingTariffs.map(t => {
            const inp = priceInputs[t.id];
            const currentDE  = inp ? parseFloat(inp.driver_expense) || 0 : t.driver_expense;
            const currentRnt = inp ? parseFloat(inp.rental) || 0 : t.rental;
            const hasPrices  = currentDE > 0 || currentRnt > 0;
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-bold text-gray-900 flex-wrap">
                        <MapPin size={15} className="text-blue-500 flex-shrink-0" />
                        <span>{t.loading_place}</span>
                        <ChevronLeft size={14} className="text-gray-400" />
                        <span className="text-green-700">{t.unloading_place}</span>
                      </div>
                      {t.proposed_by && (
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Truck size={10} />اقترحه: {t.proposed_by}
                          {t.price_set_by && <span className="mr-2">· سعّره: {t.price_set_by}</span>}
                        </div>
                      )}
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold flex items-center gap-1 flex-shrink-0">
                      <Clock size={10} />معلق
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">بونص السائق (ريال)</label>
                      <input type="number" min="0"
                        value={inp?.driver_expense ?? t.driver_expense}
                        onChange={e => setPriceInputs(p => ({ ...p, [t.id]: { driver_expense: e.target.value, rental: p[t.id]?.rental ?? String(t.rental) } }))}
                        className="w-full border border-orange-200 bg-orange-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">الإيجار / الإيراد (ريال)</label>
                      <input type="number" min="0"
                        value={inp?.rental ?? t.rental}
                        onChange={e => setPriceInputs(p => ({ ...p, [t.id]: { driver_expense: p[t.id]?.driver_expense ?? String(t.driver_expense), rental: e.target.value } }))}
                        className="w-full border border-purple-200 bg-purple-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder="0" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {inp && (
                      <button onClick={() => setPrice(t.id)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors">
                        حفظ السعر
                      </button>
                    )}
                    <button onClick={() => approve(t.id)} disabled={!hasPrices}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <CheckCircle size={13} />موافقة وتفعيل
                    </button>
                    <button onClick={() => reject(t.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors">
                      <XCircle size={13} />رفض
                    </button>
                  </div>
                  {!hasPrices && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
                      أدخل البونص والإيجار قبل الموافقة (يمكن أن يكون المشرف قد سعّره بالفعل)
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ JOURNAL ENTRIES TAB ══ */}
      {tab === "journal" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">من</label>
                <input type="date" value={jFrom} onChange={e => setJFrom(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">إلى</label>
                <input type="date" value={jTo} onChange={e => setJTo(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">الحساب</label>
                <select value={jAccount} onChange={e => setJAccount(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                  <option value="">كل الحسابات</option>
                  {accounts.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">نوع الحدث</label>
                <select value={jRefType} onChange={e => setJRefType(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                  <option value="">كل الأنواع</option>
                  {Object.entries(RTYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <MonthShortcuts onSelect={(f, t) => { setJFrom(f); setJTo(t); }} />
              </div>
              <button onClick={loadJournal} disabled={jLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d3158] transition-colors disabled:opacity-60">
                <Filter size={14} className={jLoading ? "animate-spin" : ""} />بحث
              </button>
            </div>
          </div>

          {/* Actions bar */}
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <p className="text-sm text-gray-500">{journal.length} قيد</p>
            <div className="flex gap-2">
              <button onClick={exportJournal}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors">
                <Download size={14} />تصدير Excel
              </button>
              <button onClick={() => setShowManual(v => !v)}
                className="flex items-center gap-2 px-4 py-2 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d3158] transition-colors">
                <Plus size={14} />قيد يدوي
              </button>
            </div>
          </div>

          {/* Manual entry form */}
          {showManual && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-black text-blue-900 text-sm flex items-center gap-2"><BookOpen size={16} />إنشاء قيد يدوي</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">الحساب المدين *</label>
                  <select value={manualForm.debit_account} onChange={e => setManualForm(f => ({ ...f, debit_account: e.target.value }))}
                    className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                    <option value="">اختر الحساب</option>
                    {accounts.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">الحساب الدائن *</label>
                  <select value={manualForm.credit_account} onChange={e => setManualForm(f => ({ ...f, credit_account: e.target.value }))}
                    className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                    <option value="">اختر الحساب</option>
                    {accounts.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">المبلغ (ريال) *</label>
                  <input type="number" min="0.01" step="0.01" value={manualForm.amount}
                    onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">تاريخ القيد</label>
                  <input type="date" value={manualForm.entry_date}
                    onChange={e => setManualForm(f => ({ ...f, entry_date: e.target.value }))}
                    className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-gray-600 block mb-1">سبب القيد (إلزامي — 5 أحرف على الأقل) *</label>
                  <input type="text" value={manualForm.description}
                    onChange={e => setManualForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" placeholder="وصف سبب هذا القيد..." />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={submitManual} disabled={manualSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white rounded-xl text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-60">
                  {manualSaving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  {manualSaving ? "جاري الحفظ..." : "حفظ القيد"}
                </button>
                <button onClick={() => setShowManual(false)}
                  className="px-4 py-2.5 text-gray-600 border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors">
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {/* Journal table */}
          {jLoading ? (
            <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-gray-400" /></div>
          ) : journal.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
              <BookOpen size={42} className="mx-auto text-gray-300 mb-3" />
              <p className="font-semibold text-gray-600">لا توجد قيود في هذه الفترة</p>
              <p className="text-xs text-gray-400 mt-1">ستظهر القيود تلقائياً عند حدوث أي حدث مالي</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" style={{ fontSize: "12px" }}>
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["#", "التاريخ", "نوع الحدث", "المرجع", "الحساب المدين", "الحساب الدائن", "المبلغ", "البيان", "بواسطة", ""].map(h => (
                        <th key={h} className="px-3 py-3 text-right font-bold text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {journal.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50/60">
                        <td className="px-3 py-2.5 font-mono text-gray-400 text-xs">{e.id}</td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{e.entry_date}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[e.reference_type] || "bg-gray-100 text-gray-600"}`}>
                            {RTYPE_LABELS[e.reference_type] || e.reference_type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{e.reference_id || "—"}</td>
                        <td className="px-3 py-2.5 text-blue-800 font-semibold">
                          <span className="font-mono text-xs text-gray-400">{e.debit_account}</span>
                          <span className="mx-1 text-gray-300">|</span>
                          <span>{e.debit_account_name}</span>
                        </td>
                        <td className="px-3 py-2.5 text-emerald-800 font-semibold">
                          <span className="font-mono text-xs text-gray-400">{e.credit_account}</span>
                          <span className="mx-1 text-gray-300">|</span>
                          <span>{e.credit_account_name}</span>
                        </td>
                        <td className="px-3 py-2.5 font-black text-gray-900 whitespace-nowrap">{fmtSAR(e.amount)}</td>
                        <td className="px-3 py-2.5 text-gray-500 max-w-[180px] truncate">{e.description || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs">{e.created_by || "—"}</td>
                        <td className="px-3 py-2.5">
                          {e.reference_type !== "reversal" && (
                            <button onClick={() => reverseEntry(e.id)} title="قيد عكسي"
                              className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                              <RotateCcw size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-500 flex justify-between items-center">
                <span>القيود غير قابلة للتعديل أو الحذف — التصحيح بقيد عكسي فقط</span>
                <span className="font-bold text-gray-700">
                  الإجمالي: {fmtSAR(journal.reduce((s, e) => s + e.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ TRIAL BALANCE TAB ══ */}
      {tab === "trial" && (
        <div className="space-y-4">
          {/* Date filter */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">من</label>
                <input type="date" value={tFrom} onChange={e => setTFrom(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">إلى</label>
                <input type="date" value={tTo} onChange={e => setTTo(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div className="flex flex-col justify-end">
                <MonthShortcuts onSelect={(f, t) => { setTFrom(f); setTTo(t); }} />
              </div>
              <button onClick={loadTrial} disabled={tLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d3158] transition-colors disabled:opacity-60">
                <RefreshCw size={14} className={tLoading ? "animate-spin" : ""} />تحديث
              </button>
            </div>
          </div>

          {tLoading ? (
            <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-gray-400" /></div>
          ) : !trial ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
              <Scale size={42} className="mx-auto text-gray-300 mb-3" />
              <p className="font-semibold text-gray-600">اضغط تحديث لعرض ميزان المراجعة</p>
            </div>
          ) : (
            <>
              {/* Balance indicator */}
              <div className={`rounded-2xl border p-4 flex items-center gap-3 ${trial.balanced ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                {trial.balanced
                  ? <><CheckCircle size={20} className="text-green-600" /><span className="font-black text-green-800">الميزان متوازن ✓</span></>
                  : <><XCircle size={20} className="text-red-600" /><span className="font-black text-red-800">الميزان غير متوازن — فارق: {fmtSAR(Math.abs(trial.totalDebit - trial.totalCredit))}</span></>
                }
                <div className="mr-auto text-sm font-semibold text-gray-600">
                  إجمالي مدين: <span className="text-blue-700 font-black">{fmtSAR(trial.totalDebit)}</span>
                  {" | "}
                  إجمالي دائن: <span className="text-emerald-700 font-black">{fmtSAR(trial.totalCredit)}</span>
                </div>
              </div>

              {/* Trial Balance table */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ fontSize: "13px" }}>
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-right font-bold text-gray-600">كود</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-600">اسم الحساب</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-600">النوع</th>
                        <th className="px-4 py-3 text-center font-bold text-blue-600">إجمالي المدين</th>
                        <th className="px-4 py-3 text-center font-bold text-emerald-600">إجمالي الدائن</th>
                        <th className="px-4 py-3 text-center font-bold text-gray-700">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {trial.rows.map(r => {
                        const typeLabel: Record<string, string> = { asset: "أصل", liability: "التزام", revenue: "إيراد", expense: "مصروف" };
                        const typeColor: Record<string, string> = { asset: "text-blue-600", liability: "text-orange-600", revenue: "text-green-600", expense: "text-red-600" };
                        const hasActivity = r.total_debit > 0 || r.total_credit > 0;
                        return (
                          <tr key={r.code} className={`hover:bg-gray-50/60 ${!hasActivity ? "opacity-40" : ""}`}>
                            <td className="px-4 py-3 font-mono font-bold text-gray-500">{r.code}</td>
                            <td className="px-4 py-3 font-semibold text-gray-900">{r.name}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-bold ${typeColor[r.type] || "text-gray-500"}`}>
                                {typeLabel[r.type] || r.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-blue-700 font-semibold">
                              {r.total_debit > 0 ? fmtSAR(r.total_debit) : "—"}
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-emerald-700 font-semibold">
                              {r.total_credit > 0 ? fmtSAR(r.total_credit) : "—"}
                            </td>
                            <td className={`px-4 py-3 text-center font-black font-mono ${r.balance > 0 ? "text-blue-700" : r.balance < 0 ? "text-emerald-700" : "text-gray-400"}`}>
                              {hasActivity ? fmtSAR(Math.abs(r.balance)) : "—"}
                              {hasActivity && r.balance !== 0 && (
                                <span className="text-xs font-normal mr-1">
                                  {r.balance > 0 ? "(م)" : "(د)"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-black">
                      <tr>
                        <td className="px-4 py-3 text-gray-900" colSpan={3}>الإجمالي</td>
                        <td className="px-4 py-3 text-center text-blue-700">{fmtSAR(trial.totalDebit)}</td>
                        <td className="px-4 py-3 text-center text-emerald-700">{fmtSAR(trial.totalCredit)}</td>
                        <td className={`px-4 py-3 text-center ${trial.balanced ? "text-green-700" : "text-red-600"}`}>
                          {trial.balanced ? "✓ متوازن" : fmtSAR(Math.abs(trial.totalDebit - trial.totalCredit))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-400">
                  (م) = رصيد مدين · (د) = رصيد دائن · الأرصدة بالريال السعودي
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ FINANCIAL REPORT TAB ══ */}
      {tab === "report" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">من</label>
                <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">إلى</label>
                <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div className="flex flex-col justify-end">
                <MonthShortcuts onSelect={(f, t) => { setReportFrom(f); setReportTo(t); }} />
              </div>
              <button onClick={loadReport} disabled={repLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d3158] transition-colors disabled:opacity-60">
                <RefreshCw size={14} className={repLoading ? "animate-spin" : ""} />تحديث
              </button>
            </div>
          </div>
          {repLoading ? (
            <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-gray-400" /></div>
          ) : !report || report.report.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
              <BarChart3 size={42} className="mx-auto text-gray-300 mb-3" />
              <p className="font-semibold text-gray-600">لا توجد بيانات في هذه الفترة</p>
              <p className="text-xs text-gray-400 mt-1">لاستخدام التقرير المالي يجب ربط الطلبات بالتعريفة عند تخصيص السيارات</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "الإيراد الإجمالي", val: report.totals.revenue, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
                  { label: "بونص السائقين",    val: report.totals.driver_bonus_gross, icon: Truck, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
                  { label: "إجمالي الديزل",   val: report.totals.diesel, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
                  { label: "صافي الربح",      val: report.totals.net_profit, icon: DollarSign, color: report.totals.net_profit >= 0 ? "text-blue-700" : "text-red-700", bg: report.totals.net_profit >= 0 ? "bg-blue-50" : "bg-red-50", border: report.totals.net_profit >= 0 ? "border-blue-200" : "border-red-200" },
                ].map(({ label, val, icon: Icon, color, bg, border }) => (
                  <div key={label} className={`rounded-2xl border p-4 ${bg} ${border}`}>
                    <div className="flex items-center gap-2 mb-1.5"><Icon size={16} className={color} /><span className="text-xs text-gray-500">{label}</span></div>
                    <div className={`text-xl font-black ${color}`}>{fmtSAR(val)}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ fontSize: "11px" }}>
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {["السيارة","السائق","رحلات","الإيجار","البونص","الراتب","الديزل","الإصلاح","نسب إدارية","صافي ربح"].map(h => (
                          <th key={h} className="px-3 py-3 font-bold text-gray-600 text-right">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {report.report.map((r, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/60">
                          <td className="px-3 py-3 font-bold font-mono">{r.vehicle_plate as string||"—"}</td>
                          <td className="px-3 py-3 text-gray-600">{r.driver_name as string||"—"}</td>
                          <td className="px-3 py-3 text-center font-semibold">{r.trips}</td>
                          <td className="px-3 py-3 text-center font-bold text-green-600">{fmtSAR(r.revenue)}</td>
                          <td className="px-3 py-3 text-center text-orange-600">{fmtSAR(r.driver_bonus_gross)}</td>
                          <td className="px-3 py-3 text-center text-gray-500">{fmtSAR(r.driver_salary)}</td>
                          <td className="px-3 py-3 text-center text-red-500">{fmtSAR(r.diesel)}</td>
                          <td className="px-3 py-3 text-center text-amber-600">{fmtSAR(r.repairs)}</td>
                          <td className="px-3 py-3 text-center text-purple-600">{fmtSAR(r.supervisor_cost+r.transport_cost+r.admin_cost)}</td>
                          <td className={`px-3 py-3 text-center font-black ${r.net_profit>=0?"text-blue-700":"text-red-600"}`}>{fmtSAR(r.net_profit)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                        <td className="px-3 py-3 font-black" colSpan={2}>الإجمالي</td>
                        <td className="px-3 py-3 text-center font-black">{report.totals.trips}</td>
                        <td className="px-3 py-3 text-center text-green-600 font-black">{fmtSAR(report.totals.revenue)}</td>
                        <td className="px-3 py-3 text-center text-orange-600">{fmtSAR(report.totals.driver_bonus_gross)}</td>
                        <td className="px-3 py-3 text-center text-gray-500">{fmtSAR(report.totals.driver_salary)}</td>
                        <td className="px-3 py-3 text-center text-red-500">{fmtSAR(report.totals.diesel)}</td>
                        <td className="px-3 py-3 text-center text-amber-600">{fmtSAR(report.totals.repairs)}</td>
                        <td className="px-3 py-3 text-center text-purple-600">{fmtSAR(report.totals.supervisor_cost+report.totals.transport_cost+report.totals.admin_cost)}</td>
                        <td className={`px-3 py-3 text-center font-black text-base ${report.totals.net_profit>=0?"text-blue-700":"text-red-600"}`}>{fmtSAR(report.totals.net_profit)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-500">
                  <span className="font-semibold">صيغة الحساب:</span>
                  {" "}صافي الربح = الإيراد − (راتب السائق + البونص + الديزل + الإصلاح + نسب إدارية)
                  <span className="mx-2">·</span>نسبة مشرف الحركة {settings.supervisor_salary_pct}%
                  {" "}+ نسبة الحركة {settings.transport_pct}%{" "}+ نسبة الإدارة {settings.admin_pct}%
                  <span className="mx-2">·</span>راتب سائق افتراضي {fmtSAR(settings.driver_salary_default)}/شهر
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ SETTINGS TAB ══ */}
      {tab === "settings" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="font-black text-gray-900">إعدادات نسب التكاليف</h2>
            <p className="text-xs text-gray-400 mt-0.5">تُطبَّق هذه النسب على إجمالي إيراد كل سيارة عند احتساب التقرير المالي</p>
          </div>
          <div className="px-6 py-5 space-y-5">
            {[
              { key: "supervisor_salary_pct" as const, label: "نسبة راتب مشرف الحركة",          suffix: "%",    color: "text-purple-600",  desc: "من إجمالي الإيراد" },
              { key: "transport_pct"         as const, label: "نسبة الحركة (تكاليف تشغيل)",     suffix: "%",    color: "text-blue-600",    desc: "من إجمالي الإيراد" },
              { key: "admin_pct"             as const, label: "نسبة الإدارة (مصروف عمومي)",      suffix: "%",    color: "text-indigo-600",  desc: "من إجمالي الإيراد" },
              { key: "driver_salary_default" as const, label: "الراتب الشهري الافتراضي للسائق", suffix: "ر.س", color: "text-orange-600",  desc: "راتب ثابت شهري" },
            ].map(({ key, label, suffix, color, desc }) => (
              <div key={key} className="flex items-center gap-4">
                <div className="flex-1">
                  <label className={`text-sm font-bold ${color} block`}>{label}</label>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" step={key === "driver_salary_default" ? "100" : "0.5"}
                    value={settingsDraft[key]}
                    onChange={e => setSettingsDraft(s => ({ ...s, [key]: parseFloat(e.target.value) || 0 }))}
                    className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                  <span className="text-xs text-gray-400 w-6">{suffix}</span>
                </div>
              </div>
            ))}
            <div className="bg-gray-50 rounded-2xl p-4 text-xs text-gray-600 space-y-1.5 border border-gray-100">
              <div className="font-bold text-gray-700 mb-2">مثال على رحلة إيرادها 1,000 ريال:</div>
              {[
                { label: "نسبة مشرف الحركة", val: settingsDraft.supervisor_salary_pct * 10 },
                { label: "نسبة الحركة",      val: settingsDraft.transport_pct * 10 },
                { label: "نسبة الإدارة",     val: settingsDraft.admin_pct * 10 },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between"><span>{label}</span><span className="font-semibold text-red-600">−{fmtSAR(val)}</span></div>
              ))}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold text-gray-800">
                <span>إجمالي النسب الإدارية</span>
                <span className="text-red-700">−{fmtSAR((settingsDraft.supervisor_salary_pct + settingsDraft.transport_pct + settingsDraft.admin_pct) * 10)}</span>
              </div>
            </div>
            <button onClick={saveSettings} disabled={saving}
              className="w-full py-3 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-60">
              {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
