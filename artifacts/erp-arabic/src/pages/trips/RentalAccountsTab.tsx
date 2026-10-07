import React, { useState, useEffect, useMemo } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { 
  Search, Plus, FileText, Printer, MessageCircle, Wallet, ArrowDownRight, 
  ArrowUpRight, RotateCcw, ArrowRightLeft, Banknote, Edit, HandCoins, X, Trash2, LockKeyhole, ShieldCheck, Download, ExternalLink, Check, Ban, RefreshCw, Eye, EyeOff
} from "lucide-react";
import { buildCompanyLetterheadHtml, COMPANY_LETTERHEAD_PRINT_CSS } from "../transportation/DriverStatementModal";

// --- Types ---
interface RentalAccount {
  name: string;
  phone: string | null;
  reply_count: number;
  total_due: number;
  company_share: number;
  broker_commission: number;
  manual_credit: number;
  paid: number;
  direct_paid: number;
  cash_paid: number;
  cash_in_custody: number;
  balance: number;
}
interface RentalCustomer {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  customer_type: "rental" | "company";
  active: number;
  login_user_id?: number | null;
  portal_user_id?: number | null;
  linked_user_id?: number | null;
  user_id?: number | null;
  has_login?: boolean;
  login_active?: number | boolean | null;
  login_status?: string | null;
}
interface RentalRequest {
  id: number;
  customer_name?: string;
  customer_phone?: string | null;
  requested_date?: string | null;
  loading_region?: string | null;
  unloading_region?: string | null;
  trips_count?: number | null;
  notes?: string | null;
  status: string;
  created_at?: string;
}
interface CustomerTransfer {
  id: number;
  payment_id?: number | null;
  customer_name?: string;
  amount: number;
  payment_date?: string | null;
  transfer_date?: string | null;
  reference_no?: string | null;
  notes?: string | null;
  image_url?: string | null;
  receipt_image_url?: string | null;
  transfer_image_url?: string | null;
  transfer_status?: string | null;
  status?: string;
  confirmed_at?: string | null;
  created_at?: string;
}
interface AllRentalSummaryRow {
  customer_name: string; loading_region: string; unloading_region: string;
  unit_price: number; trips_count: number; total_amount: number; company_share: number; broker_commission: number;
}
interface CompanyIncomeRow {
  id: number; payment_date: string; customer_name: string; amount: number;
  reference_no: string | null; notes: string | null; created_by: string | null;
}
interface FinancialSummary {
  customer_debt: number;
  my_company_debt: number;
  company_outstanding: number;
}
interface CashCustody {
  received: number;
  remitted: number;
  balance: number;
}
interface StatementEntry {
  source: string;
  id: number | string;
  entry_date: string;
  description: string;
  debit: number;
  credit: number;
  reference_no: string | null;
  loading_region?: string | null;
  unloading_region?: string | null;
  trips_count?: number | null;
  unit_price?: number | null;
  statement_debit?: number;
  created_at: string;
}
interface StatementResponse {
  customer: { name: string; phone: string | null };
  entries: StatementEntry[];
}
interface Remittance {
  id: number;
  remittance_date: string;
  amount: number;
  reference_no: string | null;
  notes: string | null;
  customer_name: string | null;
  created_by: string | null;
  created_at: string;
  image_url: string | null;
}
interface CashMovement {
  movement_type: "receipt" | "remittance";
  id: number;
  movement_date: string;
  customer_name: string;
  incoming: number;
  outgoing: number;
  balance_after: number;
  reference_no: string | null;
  notes: string | null;
  created_by: string | null;
}
interface ExternalAccount {
  id: number;
  name: string;
  phone: string | null;
  company_due_from: number;
  company_due_to: number;
  personal_due_from: number;
  personal_due_to: number;
}
interface ExternalPartyEntry {
  id: number;
  entry_date: string;
  entry_type: string;
  money_scope: string;
  payment_method: string | null;
  amount: number;
  description: string;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
}
interface ExternalStatementResponse {
  party: ExternalAccount;
  entries: ExternalPartyEntry[];
}
interface FinancialAuditEntry {
  id: number;
  entity_type: "account_entry" | "payment" | "cash_remittance" | "external_entry";
  entity_id: number;
  operation: "update" | "delete";
  actor_name: string;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown> | null;
  created_at: string;
}
interface MonthlyClosure {
  id: number;
  customer_name: string;
  month: string;
  opening_balance: number;
  period_debit: number;
  period_credit: number;
  closing_balance: number;
  status: "closed" | "reopened";
  closed_by: string;
  closed_at: string;
  reopened_by: string | null;
  reopened_at: string | null;
}

// --- Helpers ---
const sar = (n: number | undefined | null) => (n || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sarNoDec = (n: number | undefined | null) => (n || 0).toLocaleString("ar-SA");
const apiHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}`,
  "X-Rental-Access": sessionStorage.getItem("rental_accounts_access") || "",
});
const apiError = async (response: Response, fallback: string) => {
  if (response.ok) return;
  const data = await response.json().catch(() => ({}));
  throw new Error(data.error || data.message || fallback);
};
const listFrom = <T,>(payload: unknown, key: string): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj[key])) return obj[key] as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
  }
  return [];
};
const resolveTransferImageUrl = (value: string): string => {
  const prefix = value.startsWith("/objects/") ? "/objects/"
    : value.startsWith("/api/storage/objects/") ? "/api/storage/objects/" : null;
  if (!prefix) return value;
  const segments = value.slice(prefix.length).split("/");
  if (segments.some(segment => {
    try {
      const decoded = decodeURIComponent(segment);
      return !decoded || decoded === "." || decoded === ".." || /[\\/\x00-\x1f?#]/.test(decoded);
    } catch { return true; }
  })) throw new Error("مسار صورة التحويل غير صالح");
  return `/api/storage/objects/${segments.join("/")}`;
};
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] || char));

// --- Components ---
const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; maxWidth?: string }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto" dir="rtl">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <h3 className="font-black text-lg text-slate-800 tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-800">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
};

export default function RentalAccountsTab({ createdBy = "System" }: { createdBy?: string }) {
  const [unlocked, setUnlocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [activeTab, setActiveTab] = useRememberedState<"customers" | "all_rentals" | "company_income" | "custody" | "external" | "audit" | "requests" | "transfers">("rental-accounts-tab", "customers");

  // State: Data
  const [accounts, setAccounts] = useState<RentalAccount[]>([]);
  const [cashCustody, setCashCustody] = useState<CashCustody | null>(null);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [customerDirectory, setCustomerDirectory] = useState<RentalCustomer[]>([]);
  const [rentalRequests, setRentalRequests] = useState<RentalRequest[]>([]);
  const [customerTransfers, setCustomerTransfers] = useState<CustomerTransfer[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [queueActionId, setQueueActionId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [externalAccounts, setExternalAccounts] = useState<ExternalAccount[]>([]);
  const [auditEntries, setAuditEntries] = useState<FinancialAuditEntry[]>([]);
  const [auditAvailable, setAuditAvailable] = useState(false);
  const [allRentalRows, setAllRentalRows] = useState<AllRentalSummaryRow[]>([]);
  const [allRentalCustomer, setAllRentalCustomer] = useRememberedState("rental-accounts-customer-filter", "");
  const [allRentalFrom, setAllRentalFrom] = useRememberedState("rental-accounts-date-from", "");
  const [allRentalTo, setAllRentalTo] = useRememberedState("rental-accounts-date-to", "");
  const [showAllRentalCommission, setShowAllRentalCommission] = useState(true);
  const [companyIncomeRows, setCompanyIncomeRows] = useState<CompanyIncomeRow[]>([]);
  const [companyIncomeTotal, setCompanyIncomeTotal] = useState(0);
  const [companyIncomeFrom, setCompanyIncomeFrom] = useRememberedState("company-income-date-from", "");
  const [companyIncomeTo, setCompanyIncomeTo] = useRememberedState("company-income-date-to", "");
  const [showCompanyIncomeCustomers, setShowCompanyIncomeCustomers] = useState(true);

  // State: Loading
  const [submitting, setSubmitting] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [loadingExtStatement, setLoadingExtStatement] = useState(false);

  // State: Modals & Details
  const [customerSearch, setCustomerSearch] = useRememberedState("rental-accounts-customer-search", "");
  const [externalSearch, setExternalSearch] = useRememberedState("rental-accounts-external-search", "");
  
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<RentalCustomer | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', notes: '', customer_type: 'rental' as "rental" | "company", reclassify_existing: false });
  
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [customerStatement, setCustomerStatement] = useState<StatementResponse | null>(null);
  const [hideTripSplit, setHideTripSplit] = useState(false);
  useEffect(() => { setHideTripSplit(false); }, [selectedCustomer]);
  const [showRouteSummary, setShowRouteSummary] = useState(false);
  const [routeSummaryPeriod, setRouteSummaryPeriod] = useRememberedState<"all" | "current" | "previous" | "month" | "range">("rental-route-summary-period", "all");
  const [routeSummaryMonth, setRouteSummaryMonth] = useRememberedState("rental-route-summary-month", new Date().toISOString().slice(0, 7));
  const [routeSummaryFrom, setRouteSummaryFrom] = useRememberedState("rental-route-summary-date-from", "");
  const [routeSummaryTo, setRouteSummaryTo] = useRememberedState("rental-route-summary-date-to", "");
  const [monthlyClosures, setMonthlyClosures] = useState<MonthlyClosure[]>([]);
  const [showMonthlyClosure, setShowMonthlyClosure] = useState(false);
  const [closureMonth, setClosureMonth] = useRememberedState("rental-account-closure-month", () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().slice(0, 7);
  });
  const [reopenPassword, setReopenPassword] = useState("");
  
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showStandaloneReceipt, setShowStandaloneReceipt] = useState(false);
  const [receiptCustomer, setReceiptCustomer] = useState("");
  const [receiptNewName, setReceiptNewName] = useState("");
  const [receiptNewPhone, setReceiptNewPhone] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptReference, setReceiptReference] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptSuccess, setReceiptSuccess] = useState("");
  const [editingTransfer, setEditingTransfer] = useState<CustomerTransfer | null>(null);
  const [transferEditForm, setTransferEditForm] = useState({ payment_date: "", amount: "", reference_no: "", notes: "" });
  const [paymentForm, setPaymentForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', payment_method: 'company_direct', reference_no: '', notes: '' });
  
  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [entryForm, setEntryForm] = useState({ entry_date: new Date().toISOString().slice(0, 10), entry_type: 'opening_debit', amount: '', description: '', reference_no: '', notes: '' });
  
  const [showEditPhone, setShowEditPhone] = useState(false);
  const [phoneForm, setPhoneForm] = useState("");

  const [showRemitModal, setShowRemitModal] = useState(false);
  const [remitForm, setRemitForm] = useState({ remittance_date: new Date().toISOString().slice(0, 10), amount: '', customer_name: '', reference_no: '', notes: '' });
  const [remitImage, setRemitImage] = useState<File | null>(null);

  const [showAddExternal, setShowAddExternal] = useState(false);
  const [externalPartyForm, setExternalPartyForm] = useState({ name: '', phone: '', notes: '' });
  
  const [selectedExternalId, setSelectedExternalId] = useState<number | null>(null);
  const [externalStatement, setExternalStatement] = useState<ExternalStatementResponse | null>(null);
  
  const [showExtEntryModal, setShowExtEntryModal] = useState(false);
  const [extEntryForm, setExtEntryForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    entry_type: 'receivable',
    money_scope: 'company',
    payment_method: 'company_direct',
    amount: '',
    description: '',
    reference_no: '',
    notes: ''
  });

  // --- Data Fetching ---
  const loadCustomers = async () => {
    try {
      const r = await fetch('/api/rental-accounts', { headers: apiHeaders() });
      if (r.ok) {
        const d = await r.json();
        setAccounts(d.accounts || []);
        setCashCustody(d.cash_custody || null);
        setFinancialSummary(d.summary || null);
      }
    } catch(e) {}
  };

  const loadCustomerDirectory = async () => {
    try {
      const r = await fetch('/api/rental-customers', { headers: apiHeaders() });
      if (r.ok) setCustomerDirectory(await r.json());
    } catch {}
  };

  const loadQueue = async (tab: "requests" | "transfers") => {
    setQueueLoading(true);
    setQueueError("");
    try {
      const url = tab === "requests" ? "/api/rental-accounts/rental-requests" : "/api/rental-accounts/customer-transfers";
      const response = await fetch(url, { headers: apiHeaders() });
      await apiError(response, "تعذر تحميل البيانات");
      const payload = await response.json();
      if (tab === "requests") setRentalRequests(listFrom<RentalRequest>(payload, "requests"));
      else setCustomerTransfers(listFrom<CustomerTransfer>(payload, "transfers"));
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "تعذر تحميل البيانات");
    } finally { setQueueLoading(false); }
  };

  const updateRentalRequest = async (id: number, status: "accepted" | "rejected") => {
    if (!confirm(status === "accepted" ? "قبول الطلب؟ لن يتم إنشاء رد أو رحلة تلقائياً." : "رفض هذا الطلب؟")) return;
    setQueueActionId(id); setActionError("");
    try {
      const response = await fetch(`/api/rental-accounts/rental-requests/${id}`, {
        method: "PUT", headers: apiHeaders(), body: JSON.stringify({ status }),
      });
      await apiError(response, "تعذر تحديث الطلب");
      await loadQueue("requests");
    } catch (error) { setActionError(error instanceof Error ? error.message : "تعذر تحديث الطلب"); }
    finally { setQueueActionId(null); }
  };

  const confirmTransfer = async (id: number) => {
    if (!confirm("تأكيد مطابقة التحويل؟ هذا الإجراء لا يسجل دفعة ثانية.")) return;
    setQueueActionId(id); setActionError("");
    try {
      const response = await fetch(`/api/rental-accounts/customer-transfers/${id}/confirm`, {
        method: "PUT", headers: apiHeaders(),
      });
      await apiError(response, "تعذر تأكيد التحويل");
      await Promise.all([loadQueue("transfers"), loadCustomers()]);
      if (selectedCustomer) await openCustomerStatement(selectedCustomer);
    } catch (error) { setActionError(error instanceof Error ? error.message : "تعذر تأكيد التحويل"); }
    finally { setQueueActionId(null); }
  };

  const editTransfer = (transfer: CustomerTransfer) => {
    setActionError("");
    setEditingTransfer(transfer);
    setTransferEditForm({
      payment_date: (transfer.payment_date || transfer.transfer_date || transfer.created_at || new Date().toISOString()).slice(0, 10),
      amount: String(transfer.amount),
      reference_no: transfer.reference_no || "",
      notes: transfer.notes || "",
    });
  };

  const saveTransferEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTransfer || Number(transferEditForm.amount) <= 0) return;
    setSubmitting(true); setActionError("");
    try {
      const response = await fetch(`/api/rental-payments/${editingTransfer.payment_id || editingTransfer.id}`, {
        method: "PUT", headers: apiHeaders(),
        body: JSON.stringify({
          ...transferEditForm, amount: Number(transferEditForm.amount), payment_method: "company_direct",
        }),
      });
      await apiError(response, "تعذر تعديل التحويل. قد يكون شهره مقفلاً.");
      setEditingTransfer(null);
      await Promise.all([loadQueue("transfers"), loadCustomers(), loadCompanyIncome()]);
      if (selectedCustomer) await openCustomerStatement(selectedCustomer);
    } catch (error) { setActionError(error instanceof Error ? error.message : "تعذر تعديل التحويل"); }
    finally { setSubmitting(false); }
  };

  const deleteTransfer = async (transfer: CustomerTransfer) => {
    if (!confirm(`حذف تحويل ${transfer.customer_name || ""} بمبلغ ${sar(Number(transfer.amount))}؟ سيُحذف سجل الدفعة من الحساب.`)) return;
    setQueueActionId(transfer.id); setActionError("");
    try {
      const response = await fetch(`/api/rental-payments/${transfer.payment_id || transfer.id}`, { method: "DELETE", headers: apiHeaders() });
      await apiError(response, "تعذر حذف التحويل. قد يكون شهره مقفلاً.");
      await Promise.all([loadQueue("transfers"), loadCustomers(), loadCompanyIncome()]);
      if (selectedCustomer) await openCustomerStatement(selectedCustomer);
    } catch (error) { setActionError(error instanceof Error ? error.message : "تعذر حذف التحويل"); }
    finally { setQueueActionId(null); }
  };

  const openTransferImage = async (imageUrl: string, download = false) => {
    setActionError("");
    try {
      const parsed = new URL(resolveTransferImageUrl(imageUrl), window.location.origin);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("رابط الصورة غير صالح");
      if (parsed.origin !== window.location.origin) {
        const link = document.createElement("a");
        link.href = parsed.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        if (download) link.download = `transfer-${Date.now()}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      const response = await fetch(parsed.pathname + parsed.search, { headers: apiHeaders() });
      await apiError(response, "تعذر فتح صورة التحويل");
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (download) link.download = `transfer-${Date.now()}.${response.headers.get("content-type")?.includes("png") ? "png" : "jpg"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) { setActionError(error instanceof Error ? error.message : "تعذر فتح الصورة"); }
  };

  const loadRemittances = async () => {
    try {
      const r = await fetch('/api/rental-cash-remittances', { headers: apiHeaders() });
      if (r.ok) setRemittances(await r.json());
    } catch(e) {}
  };

  const loadCashMovements = async () => {
    try {
      const r = await fetch('/api/rental-cash-movements', { headers: apiHeaders() });
      if (r.ok) setCashMovements(await r.json());
    } catch {}
  };

  const loadExternal = async () => {
    try {
      const r = await fetch('/api/external-accounts', { headers: apiHeaders() });
      if (r.ok) setExternalAccounts(await r.json());
    } catch(e) {}
  };

  const loadAudit = async () => {
    try {
      const r = await fetch('/api/rental-financial-audit', { headers: apiHeaders() });
      if (r.ok) {
        setAuditEntries(await r.json());
        setAuditAvailable(true);
      } else {
        setAuditAvailable(false);
      }
    } catch {
      setAuditAvailable(false);
    }
  };

  useEffect(() => {
    if (!unlocked) return;
    loadCustomers();
    loadRemittances();
    loadCashMovements();
    loadExternal();
    loadCustomerDirectory();
    loadAudit();
  }, [unlocked]);

  useEffect(() => {
    if (unlocked && activeTab === "custody") loadCashMovements();
  }, [unlocked, activeTab]);
  useEffect(() => {
    if (unlocked && (activeTab === "requests" || activeTab === "transfers")) void loadQueue(activeTab);
  }, [unlocked, activeTab]);
  const loadAllRentals = async () => {
    const params = new URLSearchParams();
    if (allRentalFrom) params.set("from", allRentalFrom);
    if (allRentalTo) params.set("to", allRentalTo);
    if (allRentalCustomer) params.set("customer", allRentalCustomer);
    const response = await fetch(`/api/rental-accounts-summary/routes?${params}`, { headers: apiHeaders() });
    if (response.ok) setAllRentalRows(await response.json());
  };
  useEffect(() => { if (unlocked && activeTab === "all_rentals") void loadAllRentals(); }, [unlocked, activeTab, allRentalFrom, allRentalTo, allRentalCustomer]);
  const loadCompanyIncome = async () => {
    const params = new URLSearchParams();
    if (companyIncomeFrom) params.set("from", companyIncomeFrom);
    if (companyIncomeTo) params.set("to", companyIncomeTo);
    const response = await fetch(`/api/rental-company-income?${params}`, { headers: apiHeaders() });
    if (response.ok) {
      const data = await response.json();
      setCompanyIncomeRows(data.rows || []);
      setCompanyIncomeTotal(Number(data.total) || 0);
    }
  };
  useEffect(() => { if (unlocked && activeTab === "company_income") void loadCompanyIncome(); }, [unlocked, activeTab, companyIncomeFrom, companyIncomeTo]);

  const printAllRentals = () => {
    const popup = window.open("", "_blank");
    if (!popup) return alert("يرجى السماح بالنوافذ المنبثقة");
    const rows = allRentalRows.map(row => `<tr><td>${esc(row.customer_name)}</td><td>${esc(row.loading_region)}</td><td>${esc(row.unloading_region)}</td><td>${row.trips_count}</td><td>${sar(row.unit_price)}</td><td>${sar(row.total_amount)}</td><td>${sar(row.company_share)}</td>${showAllRentalCommission ? `<td>${sar(row.broker_commission)}</td>` : ""}</tr>`).join("");
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${COMPANY_LETTERHEAD_PRINT_CSS}body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #64748b;padding:7px}th,tfoot{background:#e2e8f0}</style></head><body>${buildCompanyLetterheadHtml("/logo.png")}<h2 style="text-align:center">ملخص جميع الإيجارات</h2><table><thead><tr><th>العميل</th><th>التحميل</th><th>التنزيل</th><th>الردود</th><th>سعر الرد</th><th>الإجمالي</th><th>حق الشركة</th>${showAllRentalCommission ? "<th>عمولة الوسيط</th>" : ""}</tr></thead><tbody>${rows}</tbody></table></body></html>`);
    popup.document.close(); setTimeout(() => { popup.print(); popup.close(); }, 250);
  };
  const printCompanyIncome = () => {
    const popup = window.open("", "_blank");
    if (!popup) return alert("يرجى السماح بالنوافذ المنبثقة");
    const rows = companyIncomeRows.map(row => `<tr><td>${esc(new Date(row.payment_date).toLocaleDateString("ar-SA"))}</td>${showCompanyIncomeCustomers ? `<td>${esc(row.customer_name)}</td>` : ""}<td>${esc(row.reference_no || "—")}</td><td>${esc(row.notes || "—")}</td><td>${esc(sar(row.amount))}</td></tr>`).join("");
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${COMPANY_LETTERHEAD_PRINT_CSS}body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #64748b;padding:8px}th,tfoot{background:#e2e8f0}</style></head><body>${buildCompanyLetterheadHtml("/logo.png")}<h2 style="text-align:center">كشف وارد الشركة</h2><p>الفترة: ${esc(companyIncomeFrom || "البداية")} حتى ${esc(companyIncomeTo || "اليوم")}</p><table><thead><tr><th>التاريخ</th>${showCompanyIncomeCustomers ? "<th>وارد من</th>" : ""}<th>المرجع</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${rows || `<tr><td colspan="${showCompanyIncomeCustomers ? 5 : 4}" style="text-align:center">لا توجد مبالغ واردة</td></tr>`}</tbody><tfoot><tr><th colspan="${showCompanyIncomeCustomers ? 4 : 3}">الإجمالي</th><th>${esc(sar(companyIncomeTotal))}</th></tr></tfoot></table></body></html>`);
    popup.document.close(); setTimeout(() => { popup.print(); popup.close(); }, 250);
  };
  const shareCompanyIncomeWhatsApp = () => {
    const details = companyIncomeRows.map(row => `${new Date(row.payment_date).toLocaleDateString("ar-SA")} — ${showCompanyIncomeCustomers ? `${row.customer_name} — ` : ""}${sar(row.amount)} ريال`).join("\n");
    const message = `كشف وارد الشركة\nالفترة: ${companyIncomeFrom || "البداية"} حتى ${companyIncomeTo || "اليوم"}\n\n${details}\n\nالإجمالي: ${sar(companyIncomeTotal)} ريال`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlocking(true); setUnlockError("");
    try {
      const r = await fetch("/api/rental-accounts/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` },
        body: JSON.stringify({ password: unlockPassword }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "تعذر فتح الحسابات");
      sessionStorage.setItem("rental_accounts_access", data.access_token);
      setUnlockPassword("");
      setUnlocked(true);
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : "تعذر فتح الحسابات");
    } finally { setUnlocking(false); }
  };

  // --- Customers Actions ---
  const openCustomerStatement = async (name: string) => {
    setSelectedCustomer(name);
    setLoadingStatement(true);
    try {
      const [statementResponse, closuresResponse] = await Promise.all([
        fetch(`/api/rental-accounts/${encodeURIComponent(name)}/statement`, { headers: apiHeaders() }),
        fetch(`/api/rental-monthly-closures?customer_name=${encodeURIComponent(name)}`, { headers: apiHeaders() }),
      ]);
      if (statementResponse.ok) setCustomerStatement(await statementResponse.json());
      if (closuresResponse.ok) setMonthlyClosures(await closuresResponse.json());
    } catch (e) {
      alert("تعذر جلب كشف الحساب");
    } finally {
      setLoadingStatement(false);
    }
  };

  const closeCustomerMonth = async () => {
    if (!selectedCustomer || !closureMonth) return;
    if (!confirm(`تقفيل شهر ${closureMonth} للعميل ${selectedCustomer}؟ لن يمكن تعديل حركات هذا الشهر قبل إعادة فتحه.`)) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/rental-monthly-closures", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ customer_name: selectedCustomer, month: closureMonth }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تقفيل الشهر");
      const refreshed = await fetch(`/api/rental-monthly-closures?customer_name=${encodeURIComponent(selectedCustomer)}`, { headers: apiHeaders() });
      if (refreshed.ok) setMonthlyClosures(await refreshed.json());
      alert("تم تقفيل الشهر وحفظ نسخة ثابتة من الكشف");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تقفيل الشهر");
    } finally { setSubmitting(false); }
  };

  const reopenCustomerMonth = async (closure: MonthlyClosure) => {
    if (!reopenPassword) return alert("أدخل كلمة مرور حسابات الإيجار");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/rental-monthly-closures/${closure.id}/reopen`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ password: reopenPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إعادة فتح الشهر");
      setMonthlyClosures(current => current.map(item => item.id === closure.id ? data : item));
      setReopenPassword("");
      alert("تمت إعادة فتح الشهر ويمكن تعديل حركاته الآن");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر إعادة فتح الشهر");
    } finally { setSubmitting(false); }
  };

  const printMonthlyClosure = async (closure: MonthlyClosure) => {
    try {
      const response = await fetch(`/api/rental-monthly-closures/${closure.id}`, { headers: apiHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر جلب نسخة التقفيل");
      const snapshot = data.statement_snapshot as {
        entries: StatementEntry[];
        opening_balance: number;
        period_debit: number;
        period_credit: number;
        closing_balance: number;
      };
      let running = Number(snapshot.opening_balance) || 0;
      const rowsHtml = snapshot.entries.map(entry => {
        const debit = Number(entry.debit) || 0;
        const credit = Number(entry.credit) || 0;
        running += debit - credit;
        return `<tr>
          <td>${esc(new Date(entry.entry_date).toLocaleDateString("ar-SA"))}</td>
          <td>${esc(entry.description)}</td>
          <td>${esc(entry.reference_no || "—")}</td>
          <td>${debit ? esc(sar(debit)) : "—"}</td>
          <td>${credit ? esc(sar(credit)) : "—"}</td>
          <td>${esc(sar(Math.abs(running)))} ${running > 0 ? "عليه" : running < 0 ? "له" : ""}</td>
        </tr>`;
      }).join("");
      const printWindow = window.open("", "_blank", "width=1000,height=800");
      if (!printWindow) return alert("يرجى السماح بالنوافذ المنبثقة لطباعة الكشف");
      printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقفيل ${esc(closure.month)}</title>
        <style>${COMPANY_LETTERHEAD_PRINT_CSS}
        body{font-family:Arial,sans-serif;color:#172033;padding:22px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
        .box{border:1px solid #cbd5e1;border-radius:7px;padding:9px}.box b{display:block;color:#64748b;font-size:11px;margin-bottom:4px}
        table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #94a3b8;padding:7px;text-align:right}th{background:#e2e8f0}
        h2{text-align:center;margin:8px 0}.footer{margin-top:18px;font-size:11px;color:#64748b}@media print{body{padding:0}}
        </style></head><body>
        ${buildCompanyLetterheadHtml("/logo.png")}
        <h2>كشف حساب شهري مقفول</h2>
        <div class="meta">
          <div class="box"><b>رقم التقفيل</b>${closure.id}</div>
          <div class="box"><b>العميل</b>${esc(closure.customer_name)}</div>
          <div class="box"><b>الشهر</b>${esc(closure.month)}</div>
          <div class="box"><b>الرصيد الافتتاحي</b>${esc(sar(snapshot.opening_balance))}</div>
          <div class="box"><b>إجمالي المدين</b>${esc(sar(snapshot.period_debit))}</div>
          <div class="box"><b>إجمالي الدائن</b>${esc(sar(snapshot.period_credit))}</div>
        </div>
        <table><thead><tr><th>التاريخ</th><th>البيان</th><th>المرجع</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="6" style="text-align:center">لا توجد حركات خلال الشهر</td></tr>'}</tbody>
        <tfoot><tr><th colspan="5">الرصيد الختامي</th><th>${esc(sar(Math.abs(snapshot.closing_balance)))} ${snapshot.closing_balance > 0 ? "عليه" : snapshot.closing_balance < 0 ? "له" : ""}</th></tr></tfoot></table>
        <div class="footer">أُقفل بواسطة: ${esc(closure.closed_by)} — ${esc(new Date(closure.closed_at).toLocaleString("ar-SA"))}</div>
        </body></html>`);
      printWindow.document.close();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر طباعة نسخة التقفيل");
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(editingCustomer ? `/api/rental-customers/${editingCustomer.id}` : '/api/rental-customers', {
        method: editingCustomer ? 'PUT' : 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ ...customerForm, created_by: createdBy })
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في إضافة العميل");
      await loadCustomers();
      await loadCustomerDirectory();
      setShowAddCustomer(false);
      setEditingCustomer(null);
      setCustomerForm({ name: '', phone: '', notes: '', customer_type: 'rental', reclassify_existing: false });
    } catch(err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  const activateCustomerLogin = async () => {
    if (!editingCustomer?.phone) return;
    setSubmitting(true); setActionError("");
    try {
      const response = await fetch(`/api/rental-customers/${editingCustomer.id}/activate-login`, {
        method: "POST", headers: apiHeaders(),
      });
      await apiError(response, "تعذر تنشيط حساب الدخول");
      await loadCustomerDirectory();
      setShowAddCustomer(false);
      setEditingCustomer(null);
    } catch (error) { setActionError(error instanceof Error ? error.message : "تعذر تنشيط حساب الدخول"); }
    finally { setSubmitting(false); }
  };

  const submitStandaloneReceipt = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(receiptAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setActionError("أدخل مبلغاً أكبر من صفر"); return; }
    if (receiptCustomer === "__new__" && (!receiptNewName.trim() || !receiptNewPhone.trim())) {
      setActionError("أدخل اسم العميل الجديد ورقم جواله"); return;
    }
    if (!receiptCustomer) { setActionError("اختر عميلاً أو أضف عميلاً جديداً"); return; }
    setSubmitting(true); setActionError("");
    let customerName = receiptCustomer;
    try {
      if (receiptCustomer === "__new__") {
        const response = await fetch("/api/rental-customers", {
          method: "POST", headers: apiHeaders(),
          body: JSON.stringify({ name: receiptNewName.trim(), phone: receiptNewPhone.trim(), customer_type: "rental", created_by: createdBy }),
        });
        await apiError(response, "تعذر إنشاء العميل");
        const created = await response.json() as { id?: number; name?: string; phone?: string | null; login_provisioned?: boolean; initial_password?: string };
        if (!created.id || !created.name) throw new Error("لم يرجع الخادم بيانات العميل المنشأ؛ تحقق من قائمة العملاء قبل إعادة المحاولة.");
        customerName = created.name;
        await loadCustomerDirectory();
        setReceiptSuccess(created.login_provisioned
          ? `تم إنشاء دخول العميل برقم ${created.phone || receiptNewPhone.trim()}؛ كلمة المرور الأولية هي رقم الجوال.`
          : "تم حفظ العميل. إذا كان لديه حساب دخول سابق، فلن تُنشأ كلمة مرور جديدة.");
      }
      const response = await fetch("/api/rental-payments", {
        method: "POST", headers: apiHeaders(),
        body: JSON.stringify({
          customer_name: customerName, payment_date: receiptDate, amount,
          payment_method: "company_direct", reference_no: receiptReference.trim(), notes: receiptNotes.trim(), created_by: createdBy,
        }),
      });
      await apiError(response, `تم إنشاء العميل ${customerName} لكن تعذر تسجيل المبلغ. أعد المحاولة باختيار العميل من القائمة.`);
      await Promise.all([loadCustomers(), loadCustomerDirectory(), loadCompanyIncome()]);
      if (selectedCustomer === customerName) await openCustomerStatement(customerName);
      setShowStandaloneReceipt(false);
      setReceiptSuccess(previous => `تم تسجيل مبلغ ${sar(amount)} للعميل ${customerName}. ${receiptCustomer === "__new__" ? previous : ""}`);
      setReceiptCustomer(""); setReceiptNewName(""); setReceiptNewPhone("");
      setReceiptAmount(""); setReceiptReference(""); setReceiptNotes("");
    } catch (error) {
      if (customerName !== "__new__") setReceiptCustomer(customerName);
      setActionError(error instanceof Error ? error.message : "تعذر تسجيل المبلغ");
    } finally { setSubmitting(false); }
  };

  const handleDeleteCustomer = async () => {
    if (!editingCustomer || !confirm(`حذف العميل «${editingCustomer.name}»؟ لن يتم الحذف إذا كان مرتبطًا بأي رد أو حركة مالية.`)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rental-customers/${editingCustomer.id}`, { method: 'DELETE', headers: apiHeaders() });
      if (!res.ok) throw new Error((await res.json()).error || "تعذر حذف العميل");
      await loadCustomers();
      await loadCustomerDirectory();
      setShowAddCustomer(false);
      setEditingCustomer(null);
      setCustomerForm({ name: '', phone: '', notes: '', customer_type: 'rental', reclassify_existing: false });
    } catch (err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/rental-customers', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ name: selectedCustomer, phone: phoneForm, created_by: createdBy })
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في تحديث الجوال");
      await loadCustomers();
      await loadCustomerDirectory();
      if (selectedCustomer) await openCustomerStatement(selectedCustomer);
      setShowEditPhone(false);
    } catch(err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/rental-payments', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ ...paymentForm, customer_name: selectedCustomer, amount: Number(paymentForm.amount), created_by: createdBy })
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في تسجيل الدفعة");
      await loadCustomers();
      if (selectedCustomer) await openCustomerStatement(selectedCustomer);
      setShowPaymentModal(false);
      setPaymentForm({ payment_date: new Date().toISOString().slice(0, 10), amount: '', payment_method: 'company_direct', reference_no: '', notes: '' });
    } catch(err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/rental-account-entries', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ ...entryForm, customer_name: selectedCustomer, amount: Number(entryForm.amount), created_by: createdBy })
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في حفظ القيد");
      await loadCustomers();
      if (selectedCustomer) await openCustomerStatement(selectedCustomer);
      setShowAddEntryModal(false);
      setEntryForm({ entry_date: new Date().toISOString().slice(0, 10), entry_type: 'opening_debit', amount: '', description: '', reference_no: '', notes: '' });
    } catch(err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  // --- Custody Actions ---
  const handleRemit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let image_url: string | null = null;
      if (remitImage) {
        const request = await fetch("/api/storage/uploads/request-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: remitImage.name, size: remitImage.size, contentType: remitImage.type }),
        });
        if (!request.ok) throw new Error("تعذر تجهيز رفع صورة التوريد");
        const { uploadURL, objectPath } = await request.json();
        const uploaded = await fetch(uploadURL, { method: "PUT", body: remitImage, headers: { "Content-Type": remitImage.type } });
        if (!uploaded.ok) throw new Error("تعذر رفع صورة التوريد");
        image_url = `/api/storage${objectPath}`;
      }
      const res = await fetch('/api/rental-cash-remittances', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ ...remitForm, amount: Number(remitForm.amount), image_url, created_by: createdBy })
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في تسجيل التوريد");
      await loadCustomers();
      await Promise.all([loadRemittances(), loadCashMovements()]);
      setShowRemitModal(false);
      setRemitImage(null);
      setRemitForm({ remittance_date: new Date().toISOString().slice(0, 10), amount: '', customer_name: '', reference_no: '', notes: '' });
    } catch(err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  // --- External Actions ---
  const openExternalStatement = async (id: number) => {
    setSelectedExternalId(id);
    setLoadingExtStatement(true);
    try {
      const r = await fetch(`/api/external-accounts/${id}/statement`, { headers: apiHeaders() });
      if (r.ok) setExternalStatement(await r.json());
    } catch (e) {
      alert("تعذر جلب كشف الحساب");
    } finally {
      setLoadingExtStatement(false);
    }
  };

  const handleAddExternal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/external-parties', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(externalPartyForm)
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في إضافة الجهة");
      await loadExternal();
      setShowAddExternal(false);
      setExternalPartyForm({ name: '', phone: '', notes: '' });
    } catch(err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  const handleAddExtEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const isPayment = extEntryForm.entry_type === 'receivable_payment' || extEntryForm.entry_type === 'payable_payment';
    try {
      const res = await fetch('/api/external-account-entries', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          ...extEntryForm,
          party_id: selectedExternalId,
          amount: Number(extEntryForm.amount),
          payment_method: isPayment ? extEntryForm.payment_method : null,
          created_by: createdBy
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في حفظ القيد");
      await loadExternal();
      if (selectedExternalId) await openExternalStatement(selectedExternalId);
      setShowExtEntryModal(false);
      setExtEntryForm({ entry_date: new Date().toISOString().slice(0, 10), entry_type: 'receivable', money_scope: 'company', payment_method: 'company_direct', amount: '', description: '', reference_no: '', notes: '' });
    } catch(err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  const editCustomerEntry = async (entry: StatementEntry) => {
    if (entry.source === "statement_adjustment") return;
    if (entry.source === "trip") {
      if (!selectedCustomer) return;
      const originalDebit = Number(entry.debit) || 0;
      const currentDebit = Number(entry.statement_debit ?? originalDebit) || 0;
      const value = prompt(`قيمة الرد الجديدة في هذا الكشف فقط (الإجمالي لعدد ${entry.trips_count || 1})`, String(currentDebit));
      if (value === null) return;
      const nextDebit = Number(value);
      if (!Number.isFinite(nextDebit) || nextDebit < originalDebit) {
        return alert("يجب إدخال مبلغ صحيح لا يقل عن قيمة الرد الأصلية");
      }
      const response = await fetch(`/api/rental-accounts/${encodeURIComponent(selectedCustomer)}/statement-adjustments/replies/${entry.id}`, {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify({ adjusted_debit: nextDebit }),
      });
      const data = await response.json();
      if (!response.ok) return alert(data.error || "تعذر حفظ تعديل الرد في كشف الحساب");
      if (selectedCustomer) await openCustomerStatement(selectedCustomer);
      return;
    }
    const value = prompt("المبلغ الجديد", String(Number(entry.debit) || Number(entry.credit) || 0));
    if (value === null) return;
    const date = prompt("التاريخ", entry.entry_date);
    if (date === null) return;
    const description = prompt("البيان", entry.description) ?? entry.description;
    const endpoint = entry.source === "manual" ? "rental-account-entries" : "rental-payments";
    const body = entry.source === "manual"
      ? { entry_date: date, amount: Number(value), entry_type: Number(entry.debit) > 0 ? "opening_debit" : "opening_credit", description, reference_no: entry.reference_no, notes: "" }
      : { payment_date: date, amount: Number(value), payment_method: entry.source, reference_no: entry.reference_no, notes: description };
    const r = await fetch(`/api/${endpoint}/${entry.id}`, { method: "PUT", headers: apiHeaders(), body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) return alert(data.error || "تعذر تعديل الحركة");
    await loadCustomers();
    if (selectedCustomer) await openCustomerStatement(selectedCustomer);
  };

  const deleteCustomerEntry = async (entry: StatementEntry) => {
    if (entry.source === "statement_adjustment") {
      if (!selectedCustomer) return;
      const response = await fetch(`/api/rental-accounts/${encodeURIComponent(selectedCustomer)}/statement-adjustments/${entry.id}`, {
        method: "DELETE",
        headers: apiHeaders(),
      });
      const data = await response.json();
      if (!response.ok) return alert(data.error || "تعذر حذف زيادة الكشف");
      await openCustomerStatement(selectedCustomer);
      return;
    }
    if (entry.source === "trip") return alert("يتم حذف الرد من جدول سجل الردود نفسه");
    if (!confirm("هل تريد حذف هذه الحركة نهائيًا؟ ستُعاد حسابات الرصيد مباشرة.")) return;
    const endpoint = entry.source === "manual" ? "rental-account-entries" : "rental-payments";
    const r = await fetch(`/api/${endpoint}/${entry.id}`, { method: "DELETE", headers: apiHeaders() });
    const data = await r.json();
    if (!r.ok) return alert(data.error || "تعذر حذف الحركة");
    await loadCustomers();
    if (selectedCustomer) await openCustomerStatement(selectedCustomer);
  };

  const addCustomerStatementCharge = async () => {
    const value = prompt("قيمة الزيادة التي ستضاف لهذا الكشف فقط");
    if (value === null) return;
    const charge = Number(value);
    if (!Number.isFinite(charge) || charge <= 0) return alert("أدخل مبلغ زيادة صحيحًا");
    if (!selectedCustomer) return;
    const response = await fetch(`/api/rental-accounts/${encodeURIComponent(selectedCustomer)}/statement-adjustments`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ amount: charge }),
    });
    const data = await response.json();
    if (!response.ok) return alert(data.error || "تعذر حفظ زيادة الكشف");
    await openCustomerStatement(selectedCustomer);
  };

  const editRemittance = async (remit: Remittance) => {
    const value=prompt("المبلغ الجديد",String(remit.amount)); if(value===null)return;
    const date=prompt("التاريخ",remit.remittance_date); if(date===null)return;
    const customer=prompt("اسم العميل",remit.customer_name || ""); if(customer===null)return;
    const r=await fetch(`/api/rental-cash-remittances/${remit.id}`,{method:"PUT",headers:apiHeaders(),body:JSON.stringify({amount:Number(value),remittance_date:date,customer_name:customer,reference_no:remit.reference_no,notes:remit.notes})});
    const data=await r.json(); if(!r.ok)return alert(data.error||"تعذر تعديل التوريد");
    await Promise.all([loadCustomers(),loadRemittances(),loadCashMovements()]);
  };

  const deleteRemittance = async (remit: Remittance) => {
    if(!confirm("هل تريد حذف هذا التوريد؟ سيعود المبلغ إلى العهدة."))return;
    const r=await fetch(`/api/rental-cash-remittances/${remit.id}`,{method:"DELETE",headers:apiHeaders()});
    const data=await r.json(); if(!r.ok)return alert(data.error||"تعذر حذف التوريد");
    await Promise.all([loadCustomers(),loadRemittances(),loadCashMovements()]);
  };

  const editExternalEntry = async (entry: ExternalPartyEntry) => {
    const value=prompt("المبلغ الجديد",String(entry.amount)); if(value===null)return;
    const date=prompt("التاريخ",entry.entry_date); if(date===null)return;
    const description=prompt("البيان",entry.description)||entry.description;
    const r=await fetch(`/api/external-account-entries/${entry.id}`,{method:"PUT",headers:apiHeaders(),body:JSON.stringify({...entry,amount:Number(value),entry_date:date,description})});
    const data=await r.json(); if(!r.ok)return alert(data.error||"تعذر تعديل الحركة");
    await loadExternal(); if(selectedExternalId)await openExternalStatement(selectedExternalId);
  };

  const deleteExternalEntry = async (entry: ExternalPartyEntry) => {
    if(!confirm("هل تريد حذف هذه الحركة نهائيًا؟"))return;
    const r=await fetch(`/api/external-account-entries/${entry.id}`,{method:"DELETE",headers:apiHeaders()});
    const data=await r.json(); if(!r.ok)return alert(data.error||"تعذر حذف الحركة");
    await loadExternal(); if(selectedExternalId)await openExternalStatement(selectedExternalId);
  };

  // --- Printing & WhatsApp ---
  const getAdjustedCustomerStatementEntries = (): StatementEntry[] => {
    if (!customerStatement) return [];
    return customerStatement.entries.map(entry => ({
      ...entry,
      debit: Number(entry.statement_debit ?? entry.debit) || 0,
    }));
  };

  const printCustomerStatement = () => {
    if (!customerStatement) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert("يرجى السماح بالنوافذ المنبثقة.");

    let runningBalance = 0;
    const statementEntries = getAdjustedCustomerStatementEntries().filter(entry => entry.source !== "trip_split");
    const rowsHtml = statementEntries.map(e => {
      runningBalance += (Number(e.debit) || 0) - (Number(e.credit) || 0);
      return `
        <tr>
          <td>${new Date(e.entry_date).toLocaleDateString('ar-SA')}</td>
          <td>${esc(e.description)}</td>
          <td>${esc(e.reference_no || '—')}</td>
          <td>${esc(e.loading_region || '—')}</td>
          <td>${esc(e.unloading_region || '—')}</td>
          <td style="color: #dc2626; font-weight: bold;">${e.debit ? sar(e.debit) : '—'}</td>
          <td style="color: #059669; font-weight: bold;">${e.credit ? sar(e.credit) : '—'}</td>
          <td style="direction: ltr; text-align: right; font-weight: bold; color: #1e293b;">
            <span style="float: left; font-size: 11px; font-weight: normal; color: #64748b; margin-top: 3px;">
              ${runningBalance !== 0 ? (runningBalance > 0 ? 'عليه' : 'له') : ''}
            </span>
            ${sar(Math.abs(runningBalance))}
          </td>
        </tr>
      `;
    }).join('');
    const statementTotals = statementEntries.reduce((totals, entry) => ({
      debit: totals.debit + (Number(entry.debit) || 0),
      credit: totals.credit + (Number(entry.credit) || 0),
    }), { debit: 0, credit: 0 });

    const html = `
      <html dir="rtl">
        <head>
          <title>كشف حساب - ${esc(customerStatement.customer.name)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #0f172a; margin: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 30px; font-size: 14px; }
            th, td { border: 1px solid #cbd5e1; padding: 12px; text-align: right; }
            th { background-color: #f1f5f9; font-weight: 900; color: #1e293b; }
            ${COMPANY_LETTERHEAD_PRINT_CSS}
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${buildCompanyLetterheadHtml('/logo.png')}
          <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
            <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 900;">كشف حساب عميل نقليات</h2>
          </div>
          
          <div style="display: flex; justify-content: space-between; margin-bottom: 20px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-size: 16px;">
              <div style="color: #64748b; margin-bottom: 4px;">اسم العميل</div>
              <strong style="color: #0f172a;">${esc(customerStatement.customer.name)}</strong>
            </div>
            <div style="font-size: 16px;">
              <div style="color: #64748b; margin-bottom: 4px;">رقم الجوال</div>
              <strong style="color: #0f172a;">${esc(customerStatement.customer.phone || '—')}</strong>
            </div>
            <div style="font-size: 16px;">
              <div style="color: #64748b; margin-bottom: 4px;">تاريخ استخراج الكشف</div>
              <strong style="color: #0f172a;">${new Date().toLocaleDateString('ar-SA')}</strong>
            </div>
            <div style="font-size: 16px;">
              <div style="color: #64748b; margin-bottom: 4px;">الرصيد النهائي</div>
              <strong style="color: ${runningBalance > 0 ? '#dc2626' : runningBalance < 0 ? '#059669' : '#0f172a'};">
                ${Math.abs(runningBalance).toLocaleString('ar-SA', {minimumFractionDigits: 2})} ${runningBalance > 0 ? 'عليه' : runningBalance < 0 ? 'له' : ''}
              </strong>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 12%;">التاريخ</th>
                <th style="width: 38%;">البيان</th>
                <th style="width: 15%;">المرجع</th>
                <th>مكان التحميل</th>
                <th>مكان التنزيل</th>
                <th style="width: 12%;">مدين (عليه)</th>
                <th style="width: 12%;">دائن (له)</th>
                <th style="width: 11%;">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">لا توجد حركات مسجلة</td></tr>`}
            </tbody>
          </table>
          <div style="display:flex;justify-content:space-between;gap:12px;margin-top:18px;padding:14px;border:1px solid #cbd5e1;border-radius:8px;font-weight:bold;">
            <span>إجمالي المدين: ${sar(statementTotals.debit)}</span>
            <span>إجمالي الدائن: ${sar(statementTotals.credit)}</span>
            <span>الرصيد النهائي: ${sar(Math.abs(runningBalance))} ${runningBalance > 0 ? 'عليه' : runningBalance < 0 ? 'له' : ''}</span>
          </div>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const printRouteSummary = () => {
    if (!customerStatement) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return alert("يرجى السماح بالنوافذ المنبثقة");
    const totalTrips = routeSummaryRows.reduce((sum, row) => sum + row.trips, 0);
    const totalValue = routeSummaryRows.reduce((sum, row) => sum + row.total, 0);
    const rows = routeSummaryRows.map(row => `<tr><td>${esc(row.loading)}</td><td>${esc(row.unloading)}</td><td>${esc(row.trips)}</td><td>${esc(sar(row.unitPrice))}</td><td>${esc(sar(row.total))}</td></tr>`).join("");
    printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملخص ردود ${esc(customerStatement.customer.name)}</title>
      <style>${COMPANY_LETTERHEAD_PRINT_CSS}body{font-family:Arial;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #64748b;padding:8px;text-align:right}th,tfoot{background:#e2e8f0}</style></head><body>
      ${buildCompanyLetterheadHtml("/logo.png")}<h2>ملخص ردود العميل حسب المسار</h2>
      <p><b>العميل:</b> ${esc(customerStatement.customer.name)}</p>
      <table><thead><tr><th>مكان التحميل</th><th>مكان التنزيل</th><th>عدد الردود</th><th>سعر الرد</th><th>الإجمالي</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center">لا توجد ردود خلال الفترة</td></tr>'}</tbody>
      <tfoot><tr><th colspan="2">المجموع</th><th>${esc(totalTrips)}</th><th>—</th><th>${esc(sar(totalValue))}</th></tr></tfoot></table></body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const handleWhatsApp = (statement: StatementResponse) => {
    if (!statement.customer.phone) return alert("رقم الجوال غير متوفر لهذا العميل");
    let runningBalance = 0;
    const entries = statement === customerStatement ? getAdjustedCustomerStatementEntries() : statement.entries;
    entries.forEach(e => runningBalance += (Number(e.debit) || 0) - (Number(e.credit) || 0));
    
    const text = `مرحباً ${statement.customer.name}،\nهذا ملخص حسابك لدينا:\nالرصيد المتبقي: ${sar(Math.abs(runningBalance))} ${runningBalance > 0 ? 'عليكم' : runningBalance < 0 ? 'لكم' : ''}\n(يرجى الاطلاع على كشف الحساب المرفق في ملف PDF لمزيد من التفاصيل)`;
    
    const phone = statement.customer.phone.replace(/\D/g, '');
    const finalPhone = phone.startsWith('0') ? '966' + phone.slice(1) : phone;
    const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
    
    alert("سيتم توجيهك إلى واتساب. لا تنسَ إرفاق ملف PDF لكشف الحساب يدوياً بعد طباعته كملف.");
    window.open(url, '_blank');
  };

  const printExternalStatement = () => {
    if (!externalStatement) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert("يرجى السماح بالنوافذ المنبثقة.");

    const runningByScope = { company: 0, personal: 0 };
    const rowsHtml = externalStatement.entries.map(e => {
      let debit = ['receivable', 'payable_payment'].includes(e.entry_type) ? Number(e.amount) : 0;
      let credit = ['payable', 'receivable_payment'].includes(e.entry_type) ? Number(e.amount) : 0;
      const scope = e.money_scope === "personal" ? "personal" : "company";
      runningByScope[scope] += (debit - credit);
      const scopeBalance = runningByScope[scope];
      
      return `
        <tr>
          <td>${new Date(e.entry_date).toLocaleDateString('ar-SA')}</td>
          <td>${esc(e.description)}</td>
          <td>${scope === "company" ? "الشركة" : "شخصي"}</td>
          <td>${esc(e.reference_no || '—')}</td>
          <td style="color: #dc2626; font-weight: bold;">${debit ? sar(debit) : '—'}</td>
          <td style="color: #059669; font-weight: bold;">${credit ? sar(credit) : '—'}</td>
          <td style="direction: ltr; text-align: right; font-weight: bold; color: #1e293b;">
            <span style="float: left; font-size: 11px; font-weight: normal; color: #64748b; margin-top: 3px;">
              ${scopeBalance !== 0 ? (scopeBalance > 0 ? 'عليه' : 'له') : ''}
            </span>
            ${sar(Math.abs(scopeBalance))}
          </td>
        </tr>
      `;
    }).join('');

    const html = `
      <html dir="rtl">
        <head>
          <title>كشف حساب جهة خارجية - ${esc(externalStatement.party.name)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #0f172a; margin: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 30px; font-size: 14px; }
            th, td { border: 1px solid #cbd5e1; padding: 12px; text-align: right; }
            th { background-color: #f1f5f9; font-weight: 900; color: #1e293b; }
            ${COMPANY_LETTERHEAD_PRINT_CSS}
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${buildCompanyLetterheadHtml('/logo.png')}
          <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
            <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 900;">كشف حساب جهة خارجية</h2>
          </div>
          
          <div style="display: flex; justify-content: space-between; margin-bottom: 20px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-size: 16px;">
              <div style="color: #64748b; margin-bottom: 4px;">الجهة</div>
              <strong style="color: #0f172a;">${esc(externalStatement.party.name)}</strong>
            </div>
            <div style="font-size: 16px;">
              <div style="color: #64748b; margin-bottom: 4px;">رقم الجوال</div>
              <strong style="color: #0f172a;">${esc(externalStatement.party.phone || '—')}</strong>
            </div>
            <div style="font-size: 16px;">
              <div style="color: #64748b; margin-bottom: 4px;">تاريخ استخراج الكشف</div>
              <strong style="color: #0f172a;">${new Date().toLocaleDateString('ar-SA')}</strong>
            </div>
            <div style="font-size: 16px;">
              <div style="color: #64748b; margin-bottom: 4px;">رصيد الشركة</div>
              <strong>${sar(Math.abs(runningByScope.company))} ${runningByScope.company > 0 ? 'لنا' : runningByScope.company < 0 ? 'علينا' : ''}</strong>
            </div>
            <div style="font-size: 16px;">
              <div style="color: #64748b; margin-bottom: 4px;">الرصيد الشخصي</div>
              <strong>${sar(Math.abs(runningByScope.personal))} ${runningByScope.personal > 0 ? 'لي' : runningByScope.personal < 0 ? 'عليّ' : ''}</strong>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 12%;">التاريخ</th>
                <th style="width: 38%;">البيان</th>
                <th style="width: 10%;">الذمة</th>
                <th style="width: 15%;">المرجع</th>
                <th style="width: 12%;">مدين (لنا)</th>
                <th style="width: 12%;">دائن (لهم)</th>
                <th style="width: 11%;">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">لا توجد حركات مسجلة</td></tr>`}
            </tbody>
          </table>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const handleExternalWhatsApp = (statement: ExternalStatementResponse) => {
    if (!statement.party.phone) return alert("رقم الجوال غير متوفر لهذه الجهة");
    const companyBalance = statement.party.company_due_from - statement.party.company_due_to;
    const personalBalance = statement.party.personal_due_from - statement.party.personal_due_to;
    
    const text = `مرحباً ${statement.party.name}،\nهذا ملخص الحساب:\nحساب الشركة: ${sar(Math.abs(companyBalance))} ${companyBalance > 0 ? 'عليكم' : companyBalance < 0 ? 'لكم' : ''}\nالحساب الشخصي: ${sar(Math.abs(personalBalance))} ${personalBalance > 0 ? 'عليكم' : personalBalance < 0 ? 'لكم' : ''}\n(يرجى الاطلاع على كشف الحساب المرفق في ملف PDF)`;
    
    const phone = statement.party.phone.replace(/\D/g, '');
    const finalPhone = phone.startsWith('0') ? '966' + phone.slice(1) : phone;
    const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
    
    alert("سيتم توجيهك إلى واتساب. يرجى إرفاق ملف PDF لكشف الحساب يدوياً.");
    window.open(url, '_blank');
  };

  // --- Filtering ---
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return accounts;
    const q = customerSearch.toLowerCase();
    return accounts.filter(a => a.name.toLowerCase().includes(q) || (a.phone && a.phone.includes(q)));
  }, [accounts, customerSearch]);
  const routeSummaryRows = useMemo(() => {
    if (!customerStatement) return [];
    const now = new Date();
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const selectedMonth = routeSummaryPeriod === "current"
      ? now.toISOString().slice(0, 7)
      : routeSummaryPeriod === "previous"
        ? `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`
        : routeSummaryMonth;
    const trips = customerStatement.entries.filter(entry => {
      if (entry.source !== "trip") return false;
      const date = String(entry.entry_date || "").slice(0, 10);
      if (routeSummaryPeriod === "current" || routeSummaryPeriod === "previous" || routeSummaryPeriod === "month") {
        return date.startsWith(selectedMonth);
      }
      if (routeSummaryPeriod === "range") {
        if (routeSummaryFrom && date < routeSummaryFrom) return false;
        if (routeSummaryTo && date > routeSummaryTo) return false;
      }
      return true;
    });
    const grouped = new Map<string, { loading: string; unloading: string; unitPrice: number; trips: number; total: number }>();
    trips.forEach(entry => {
      const loading = entry.loading_region || "غير محدد";
      const unloading = entry.unloading_region || "غير محدد";
      const unitPrice = Number(entry.unit_price) || 0;
      const key = `${loading}\u0000${unloading}\u0000${unitPrice}`;
      const current = grouped.get(key) || { loading, unloading, unitPrice, trips: 0, total: 0 };
      current.trips += Number(entry.trips_count) || 1;
      current.total += Number(entry.debit) || 0;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((a, b) =>
      a.loading.localeCompare(b.loading, "ar") || a.unloading.localeCompare(b.unloading, "ar") || a.unitPrice - b.unitPrice
    );
  }, [customerStatement, routeSummaryPeriod, routeSummaryMonth, routeSummaryFrom, routeSummaryTo]);

  const filteredExternal = useMemo(() => {
    if (!externalSearch.trim()) return externalAccounts;
    const q = externalSearch.toLowerCase();
    return externalAccounts.filter(a => a.name.toLowerCase().includes(q) || (a.phone && a.phone.includes(q)));
  }, [externalAccounts, externalSearch]);
  const displayStatementEntries = getAdjustedCustomerStatementEntries();
  const visibleStatementEntries = hideTripSplit
    ? displayStatementEntries.filter(entry => entry.source !== "trip_split")
    : displayStatementEntries;
  const displayStatementTotals = displayStatementEntries.reduce((totals, entry) => ({
    debit: totals.debit + (Number(entry.debit) || 0),
    credit: totals.credit + (Number(entry.credit) || 0),
  }), { debit: 0, credit: 0 });
  const displayStatementBalance = displayStatementTotals.debit - displayStatementTotals.credit;
  const hasPersistedStatementAdjustments = displayStatementEntries.some(entry =>
    entry.source === "statement_adjustment" || (entry.source === "trip" && entry.statement_debit !== undefined)
  );

  if (!unlocked) return (
    <div className="min-h-[70vh] flex items-center justify-center bg-slate-50 p-4" dir="rtl">
      <form onSubmit={handleUnlock} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-7">
        <div className="w-14 h-14 rounded-full bg-slate-800 text-white flex items-center justify-center mx-auto mb-4"><LockKeyhole size={26}/></div>
        <h2 className="text-xl font-black text-slate-900 text-center">حسابات الإيجار والعهدة محمية</h2>
        <p className="text-sm text-slate-500 text-center mt-2 mb-5">أدخل كلمة المرور لفتح الحسابات وإدارة الحركات المالية.</p>
        <input autoFocus type="password" value={unlockPassword} onChange={e=>setUnlockPassword(e.target.value)} className="w-full border border-slate-300 rounded-xl p-3 text-center text-lg" placeholder="كلمة المرور" />
        {unlockError && <div className="mt-3 text-sm font-bold text-rose-600 text-center">{unlockError}</div>}
        <button disabled={unlocking||!unlockPassword} className="w-full mt-4 bg-slate-800 text-white rounded-xl p-3 font-black disabled:opacity-50">{unlocking?"جاري التحقق...":"فتح الحسابات"}</button>
      </form>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 bg-slate-50 min-h-[80vh] p-4 md:p-6" dir="rtl">
      
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">الحسابات والمالية (الردود)</h1>
        <p className="text-slate-500 font-medium">سجل مالي دقيق لعملاء النقليات والجهات الخارجية والعهد النقدية</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div><p className="font-black text-emerald-950">تحصيل مباشر من العميل</p><p className="text-xs text-emerald-800 mt-1">سجّل المبلغ لحساب عميل موجود أو أنشئ عميلاً جديداً دون فتح كشف حسابه.</p></div>
        <button data-testid="button-receive-rental-amount" onClick={() => { setActionError(""); setReceiptSuccess(""); setShowStandaloneReceipt(true); }} className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-900"><HandCoins size={17}/> استلام مبلغ</button>
      </div>
      {receiptSuccess && <div role="status" data-testid="status-receipt-success" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">{receiptSuccess}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500">إجمالي المديونية على عملاء الإيجار</div>
          <div className="text-2xl font-black text-rose-600 mt-1">{sar(financialSummary?.customer_debt)}</div>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500">الكاش المستلم الموجود في عهدتي</div>
          <div className="text-2xl font-black text-amber-600 mt-1">{sar(financialSummary?.my_company_debt)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 shadow-sm text-white">
          <div className="text-xs font-bold text-slate-300">إجمالي حق الشركة القائم</div>
          <div className="text-2xl font-black mt-1">{sar(financialSummary?.company_outstanding)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap bg-white rounded-lg p-1.5 shadow-sm border border-slate-200 shrink-0 w-fit gap-1">
        <button 
          onClick={() => setActiveTab("customers")}
          className={`px-6 py-2.5 rounded-md font-bold text-sm transition-all duration-200 ${activeTab === 'customers' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          حسابات عملاء الردود
        </button>
        <button onClick={() => setActiveTab("all_rentals")} className={`px-6 py-2.5 rounded-md font-bold text-sm ${activeTab === "all_rentals" ? "bg-slate-800 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}>كل الإيجارات</button>
        <button onClick={() => setActiveTab("company_income")} className={`px-6 py-2.5 rounded-md font-bold text-sm ${activeTab === "company_income" ? "bg-slate-800 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}>وارد الشركة</button>
        <button data-testid="button-rental-requests" onClick={() => setActiveTab("requests")} className={`px-6 py-2.5 rounded-md font-bold text-sm ${activeTab === "requests" ? "bg-slate-800 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}>طلبات الإيجار</button>
        <button data-testid="button-customer-transfers" onClick={() => setActiveTab("transfers")} className={`px-6 py-2.5 rounded-md font-bold text-sm ${activeTab === "transfers" ? "bg-slate-800 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}>تحويلات العملاء</button>
        <button 
          onClick={() => setActiveTab("custody")}
          className={`px-6 py-2.5 rounded-md font-bold text-sm transition-all duration-200 ${activeTab === 'custody' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          العهدة النقدية
        </button>
        <button 
          onClick={() => setActiveTab("external")}
          className={`px-6 py-2.5 rounded-md font-bold text-sm transition-all duration-200 ${activeTab === 'external' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          الجهات الخارجية
        </button>
        {auditAvailable && <button
          onClick={() => { setActiveTab("audit"); loadAudit(); }}
          className={`px-6 py-2.5 rounded-md font-bold text-sm transition-all duration-200 ${activeTab === 'audit' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          سجل المراجعة
        </button>}
      </div>

      {(activeTab === "requests" || activeTab === "transfers") && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
            <div><h2 className="text-lg font-black text-slate-900">{activeTab === "requests" ? "طلبات الإيجار الواردة" : "تحويلات العملاء"}</h2>
              <p className="mt-1 text-xs text-slate-500">{activeTab === "requests" ? "قبول الطلب لا ينشئ رحلة تلقائياً." : "التأكيد يطابق الحوالة فقط؛ لا يضيف مبلغاً آخر إلى الحساب."}</p></div>
            <button onClick={() => void loadQueue(activeTab as "requests" | "transfers")} disabled={queueLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={15}/> تحديث</button>
          </header>
          {(queueError || actionError) && <div role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">{queueError || actionError} {queueError && <button className="mr-3 underline" onClick={() => void loadQueue(activeTab as "requests" | "transfers")}>إعادة المحاولة</button>}</div>}
          {queueLoading ? <div className="space-y-3 p-5" aria-label="جاري تحميل القائمة">{[0,1,2].map(n => <div key={n} className="h-16 animate-pulse rounded-lg bg-slate-100"/>)}</div>
          : queueError ? null
          : activeTab === "requests" ? (
            rentalRequests.length ? <div className="divide-y divide-slate-100">{rentalRequests.map(request => (
              <article key={request.id} className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between" data-testid={`row-rental-request-${request.id}`}>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><strong className="text-slate-900">{request.customer_name || "عميل غير محدد"}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{request.status === "pending" ? "بانتظار المراجعة" : request.status === "accepted" ? "مقبول" : request.status === "rejected" ? "مرفوض" : request.status}</span></div>
                  <p className="text-sm text-slate-600">{[request.loading_region && `من ${request.loading_region}`, request.unloading_region && `إلى ${request.unloading_region}`, request.trips_count && `${request.trips_count} ردود`].filter(Boolean).join(" · ") || "لم تحدد تفاصيل المسار"}</p>
                  <p className="text-xs text-slate-500">{request.customer_phone || ""} {request.requested_date || request.created_at ? `· ${request.requested_date || request.created_at}` : ""}</p>
                  {request.notes && <p className="text-xs text-slate-600">{request.notes}</p>}
                </div>
                {request.status === "pending" && <div className="flex gap-2">
                  <button data-testid={`button-accept-request-${request.id}`} disabled={queueActionId !== null} onClick={() => void updateRentalRequest(request.id, "accepted")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check size={15}/> قبول</button>
                  <button data-testid={`button-reject-request-${request.id}`} disabled={queueActionId !== null} onClick={() => void updateRentalRequest(request.id, "rejected")} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><Ban size={15}/> رفض</button>
                </div>}
              </article>))}</div> : <div className="p-12 text-center text-sm text-slate-500">لا توجد طلبات إيجار بعد.</div>
          ) : customerTransfers.length ? <div className="divide-y divide-slate-100">{customerTransfers.map(transfer => {
            const imageUrl = transfer.transfer_image_url || transfer.image_url || transfer.receipt_image_url;
            const confirmed = transfer.transfer_status === "confirmed" || transfer.status === "confirmed" || Boolean(transfer.confirmed_at);
            return <article key={transfer.id} className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between" data-testid={`row-customer-transfer-${transfer.id}`}>
              <div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-900">{transfer.customer_name || "عميل غير محدد"}</strong><span className="font-mono font-black text-emerald-800">{sar(Number(transfer.amount))} ر.س</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{confirmed ? "مؤكد" : "بانتظار التأكيد"}</span></div>
                <p className="text-xs text-slate-500">{transfer.payment_date || transfer.transfer_date || transfer.created_at || ""} {transfer.reference_no && `· مرجع: ${transfer.reference_no}`}</p>{transfer.notes && <p className="text-xs text-slate-600">{transfer.notes}</p>}</div>
              <div className="flex flex-wrap gap-2">
                {imageUrl && <><button onClick={() => void openTransferImage(imageUrl)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"><ExternalLink size={14}/> عرض الإيصال</button><button onClick={() => void openTransferImage(imageUrl, true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"><Download size={14}/> تحميل</button></>}
                {!confirmed && <button data-testid={`button-confirm-transfer-${transfer.id}`} disabled={queueActionId !== null} onClick={() => void confirmTransfer(transfer.id)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{queueActionId === transfer.id ? "جاري التأكيد..." : "تأكيد التحويل"}</button>}
                <button data-testid={`button-edit-transfer-${transfer.id}`} disabled={queueActionId !== null} onClick={() => editTransfer(transfer)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Edit size={14}/> تعديل</button>
                <button data-testid={`button-delete-transfer-${transfer.id}`} disabled={queueActionId !== null} onClick={() => void deleteTransfer(transfer)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><Trash2 size={14}/> حذف</button>
              </div>
            </article>;
          })}</div> : <div className="p-12 text-center text-sm text-slate-500">لا توجد تحويلات عملاء بعد.</div>}
        </section>
      )}

      {/* View: Customers */}
      {activeTab === 'customers' && (
        <div className="flex flex-col gap-4 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-black text-slate-800">دليل العملاء وتصنيفهم</h3>
              <span className="text-xs text-slate-500">اضغط على العميل لتعديل تصنيفه</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {customerDirectory.map(customer => (
                <button key={customer.id} onClick={() => {
                  setEditingCustomer(customer);
                  setCustomerForm({ name: customer.name, phone: customer.phone || '', notes: customer.notes || '', customer_type: customer.customer_type, reclassify_existing: false });
                  setShowAddCustomer(true);
                }} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${customer.customer_type === 'company' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                  {customer.name} · {customer.customer_type === 'company' ? 'تابع للشركة' : 'إيجار خارجي'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-100 gap-4 bg-slate-50/50">
            <div className="relative max-w-md w-full">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="ابحث باسم العميل أو الجوال..." 
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-slate-800 font-medium placeholder-slate-400"
              />
            </div>
            <button onClick={() => {
              setEditingCustomer(null);
              setCustomerForm({ name: '', phone: '', notes: '', customer_type: 'rental', reclassify_existing: false });
              setShowAddCustomer(true);
            }} className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-sm transition-colors shrink-0">
              <Plus size={18} />
              <span>إضافة عميل جديد</span>
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3 pl-4">اسم العميل</th>
                  <th className="p-3">رقم الجوال</th>
                  <th className="p-3 text-center">عدد الردود</th>
                  <th className="p-3">إجمالي القيمة</th>
                  <th className="p-3">حق الشركة</th>
                  <th className="p-3">عمولة الوسيط</th>
                  <th className="p-3">المدفوع</th>
                  <th className="p-3">كاش عندي</th>
                  <th className="p-3">الرصيد المتبقي</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(acc => (
                  <tr key={acc.name} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-3 pl-4 font-black text-slate-800">{acc.name}</td>
                    <td className="p-3 text-slate-600 font-mono text-sm">{acc.phone || '—'}</td>
                    <td className="p-3 text-center font-bold text-slate-700">{acc.reply_count}</td>
                    <td className="p-3 font-mono font-bold text-slate-700">{sar(acc.total_due)}</td>
                    <td className="p-3 font-mono font-bold text-blue-700">{sar(acc.company_share)}</td>
                    <td className="p-3 font-mono font-bold text-amber-700">{sar(acc.broker_commission)}</td>
                    <td className="p-3">
                      <div className="flex flex-col gap-0.5 items-start">
                        <span className="font-mono font-bold text-emerald-600">{sar(acc.paid)}</span>
                        {(acc.cash_paid > 0 || acc.direct_paid > 0) && (
                          <span className="text-[11px] text-slate-400 font-bold">
                            ({acc.direct_paid > 0 ? `تحويل: ${sarNoDec(acc.direct_paid)}` : ''}
                            {acc.direct_paid > 0 && acc.cash_paid > 0 ? ' | ' : ''}
                            {acc.cash_paid > 0 ? `نقدي: ${sarNoDec(acc.cash_paid)}` : ''})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-mono font-bold text-amber-600">{sar(acc.cash_in_custody)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono font-black text-lg ${acc.balance > 0 ? 'text-rose-600' : acc.balance < 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {sar(Math.abs(acc.balance))}
                        </span>
                        {acc.balance !== 0 && (
                          <span className="text-xs font-bold text-slate-500">
                            {acc.balance > 0 ? 'عليه' : 'له'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center">
                        <button 
                          onClick={() => openCustomerStatement(acc.name)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md font-bold text-xs transition-colors shadow-sm"
                        >
                          <FileText size={14} />
                          كشف الحساب
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">لا توجد حسابات مطابقة.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "all_rentals" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b bg-slate-50 p-4">
            <div><label className="block text-xs font-bold mb-1">العميل</label><select value={allRentalCustomer} onChange={e=>setAllRentalCustomer(e.target.value)} className="border rounded-lg p-2"><option value="">كل العملاء</option>{accounts.map(a=><option key={a.name} value={a.name}>{a.name}</option>)}</select></div>
            <div><label className="block text-xs font-bold mb-1">من</label><input type="date" value={allRentalFrom} onChange={e=>setAllRentalFrom(e.target.value)} className="border rounded-lg p-2"/></div>
            <div><label className="block text-xs font-bold mb-1">إلى</label><input type="date" value={allRentalTo} onChange={e=>setAllRentalTo(e.target.value)} className="border rounded-lg p-2"/></div>
            <label className="flex items-center gap-2 font-bold text-sm"><input type="checkbox" checked={showAllRentalCommission} onChange={e=>setShowAllRentalCommission(e.target.checked)}/> إظهار عمولة الوسيط</label>
            <button onClick={printAllRentals} className="mr-auto flex items-center gap-2 bg-slate-800 text-white rounded-lg px-4 py-2 font-bold"><Printer size={16}/> طباعة</button>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-slate-100"><tr><th className="p-3">العميل</th><th className="p-3">التحميل</th><th className="p-3">التنزيل</th><th className="p-3">عدد الردود</th><th className="p-3">سعر الرد</th><th className="p-3">الإجمالي</th><th className="p-3">حق الشركة</th>{showAllRentalCommission&&<th className="p-3">عمولة الوسيط</th>}</tr></thead>
          <tbody>{allRentalRows.map((r,i)=><tr key={i} className="border-t"><td className="p-3 font-black">{r.customer_name}</td><td className="p-3">{r.loading_region}</td><td className="p-3">{r.unloading_region}</td><td className="p-3">{r.trips_count}</td><td className="p-3">{sar(r.unit_price)}</td><td className="p-3 font-bold">{sar(r.total_amount)}</td><td className="p-3 text-blue-700">{sar(r.company_share)}</td>{showAllRentalCommission&&<td className="p-3 text-amber-700">{sar(r.broker_commission)}</td>}</tr>)}</tbody>
          <tfoot className="bg-slate-100 font-black"><tr><td colSpan={3} className="p-3">الإجمالي العام</td><td className="p-3">{allRentalRows.reduce((s,r)=>s+r.trips_count,0)}</td><td></td><td className="p-3">{sar(allRentalRows.reduce((s,r)=>s+r.total_amount,0))}</td><td className="p-3">{sar(allRentalRows.reduce((s,r)=>s+r.company_share,0))}</td>{showAllRentalCommission&&<td className="p-3">{sar(allRentalRows.reduce((s,r)=>s+r.broker_commission,0))}</td>}</tr></tfoot></table></div>
        </div>
      )}

      {activeTab === "company_income" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b bg-slate-50 p-4">
            <div><label className="block text-xs font-bold mb-1">من</label><input type="date" value={companyIncomeFrom} onChange={e=>setCompanyIncomeFrom(e.target.value)} className="border rounded-lg p-2"/></div>
            <div><label className="block text-xs font-bold mb-1">إلى</label><input type="date" value={companyIncomeTo} onChange={e=>setCompanyIncomeTo(e.target.value)} className="border rounded-lg p-2"/></div>
            <label className="flex items-center gap-2 font-bold text-sm"><input type="checkbox" checked={showCompanyIncomeCustomers} onChange={e=>setShowCompanyIncomeCustomers(e.target.checked)}/> إظهار أسماء العملاء</label>
            <button onClick={printCompanyIncome} className="mr-auto flex items-center gap-2 bg-slate-800 text-white rounded-lg px-4 py-2 font-bold"><Printer size={16}/> طباعة</button>
            <button onClick={shareCompanyIncomeWhatsApp} className="flex items-center gap-2 bg-[#25D366] text-white rounded-lg px-4 py-2 font-bold"><MessageCircle size={16}/> واتساب</button>
          </div>
          <div className="p-4 bg-emerald-50 border-b border-emerald-100"><span className="text-sm font-bold text-emerald-800">إجمالي وارد الشركة: </span><span className="text-2xl font-black text-emerald-700">{sar(companyIncomeTotal)}</span></div>
          <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-slate-100"><tr><th className="p-3">التاريخ</th>{showCompanyIncomeCustomers&&<th className="p-3">وارد من</th>}<th className="p-3">المرجع</th><th className="p-3">البيان</th><th className="p-3">المبلغ</th></tr></thead>
          <tbody>{companyIncomeRows.length===0?<tr><td colSpan={showCompanyIncomeCustomers?5:4} className="p-10 text-center text-slate-400">لا توجد تحويلات مباشرة للشركة خلال الفترة</td></tr>:companyIncomeRows.map(r=><tr key={r.id} className="border-t"><td className="p-3">{new Date(r.payment_date).toLocaleDateString("ar-SA")}</td>{showCompanyIncomeCustomers&&<td className="p-3 font-black">{r.customer_name}</td>}<td className="p-3">{r.reference_no||"—"}</td><td className="p-3">{r.notes||"—"}</td><td className="p-3 font-mono font-black text-emerald-700">{sar(r.amount)}</td></tr>)}</tbody>
          <tfoot className="bg-slate-100 font-black"><tr><td colSpan={showCompanyIncomeCustomers?4:3} className="p-3">الإجمالي</td><td className="p-3">{sar(companyIncomeTotal)}</td></tr></tfoot></table></div>
        </div>
      )}

      {/* View: Custody */}
      {activeTab === 'custody' && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center shrink-0">
                <ArrowDownRight size={24} />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-500 mb-1">إجمالي المقبوضات النقدية</div>
                <div className="text-2xl font-black font-mono text-slate-900">{sar(cashCustody?.received || 0)}</div>
              </div>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center shrink-0">
                <ArrowUpRight size={24} />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-500 mb-1">المُورّد والمُسلّم (محول)</div>
                <div className="text-2xl font-black font-mono text-slate-900">{sar(cashCustody?.remitted || 0)}</div>
              </div>
            </div>
            
            <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm flex items-center gap-4 text-white">
              <div className="w-12 h-12 bg-white/20 text-white rounded-full flex items-center justify-center shrink-0">
                <Wallet size={24} />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-300 mb-1">الرصيد الحالي في العهدة</div>
                <div className="text-2xl font-black font-mono text-white">{sar(cashCustody?.balance || 0)}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <ArrowRightLeft size={20} className="text-blue-600" /> حركة العهدة النقدية
              </h3>
              <p className="text-xs text-slate-500 mt-1">استلام الكاش من العميل يضيف للعهدة، وتسليمه للشركة يخصم منها.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">الحركة</th>
                    <th className="p-3">العميل</th>
                    <th className="p-3">داخل</th>
                    <th className="p-3">خارج للشركة</th>
                    <th className="p-3">الرصيد بعد الحركة</th>
                    <th className="p-3">المرجع / ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {cashMovements.map(movement => (
                    <tr key={`${movement.movement_type}-${movement.id}`} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3 font-mono text-slate-700">{new Date(movement.movement_date).toLocaleDateString('ar-SA')}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${movement.movement_type === 'receipt' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {movement.movement_type === 'receipt' ? 'استلام من العميل' : 'تسليم للشركة'}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-800">{movement.customer_name}</td>
                      <td className="p-3 font-mono font-black text-emerald-600">{movement.incoming ? sar(movement.incoming) : '—'}</td>
                      <td className="p-3 font-mono font-black text-rose-600">{movement.outgoing ? sar(movement.outgoing) : '—'}</td>
                      <td className="p-3 font-mono font-black text-slate-900">{sar(movement.balance_after)}</td>
                      <td className="p-3 text-slate-600">{[movement.reference_no, movement.notes].filter(Boolean).join(' — ') || '—'}</td>
                    </tr>
                  ))}
                  {cashMovements.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">لا توجد حركة نقدية مسجلة.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50 gap-4">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Banknote size={20} className="text-emerald-600" /> سجل التوريدات النقدية للشركة
              </h3>
              <button onClick={() => setShowRemitModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-sm transition-colors shrink-0">
                <Plus size={18} /> إضافة توريد للشركة
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3 pl-4">التاريخ</th>
                    <th className="p-3">المبلغ</th>
                    <th className="p-3">العميل</th>
                    <th className="p-3">المرجع / السند</th>
                    <th className="p-3 w-1/3">ملاحظات</th>
                    <th className="p-3">الصورة</th>
                    <th className="p-3">بواسطة</th>
                    <th className="p-3 text-center">إدارة</th>
                  </tr>
                </thead>
                <tbody>
                  {remittances.map(remit => (
                    <tr key={remit.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono text-slate-700">{new Date(remit.remittance_date).toLocaleDateString('ar-SA')}</td>
                      <td className="p-3 font-mono font-black text-rose-600">{sar(remit.amount)}</td>
                      <td className="p-3 font-bold text-slate-700">{remit.customer_name || 'توريد قديم غير موزع'}</td>
                      <td className="p-3 text-slate-600 font-mono text-sm">{remit.reference_no || '—'}</td>
                      <td className="p-3 text-slate-800 font-medium">{remit.notes || '—'}</td>
                      <td className="p-3">{remit.image_url ? <a href={remit.image_url} target="_blank" rel="noreferrer" className="font-bold text-blue-700 hover:underline">عرض الصورة</a> : '—'}</td>
                      <td className="p-3 text-slate-500 text-xs font-bold bg-slate-50/50">{remit.created_by || '—'}</td>
                      <td className="p-3"><div className="flex justify-center gap-1">
                        <button onClick={()=>editRemittance(remit)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="تعديل"><Edit size={15}/></button>
                        <button onClick={()=>deleteRemittance(remit)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title="حذف"><Trash2 size={15}/></button>
                      </div></td>
                    </tr>
                  ))}
                  {remittances.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">لا توجد توريدات مسجلة.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* View: External Accounts */}
      {activeTab === 'external' && (
        <div className="flex flex-col gap-4 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-100 gap-4 bg-slate-50/50">
            <div className="relative max-w-md w-full">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="ابحث عن جهة..." 
                value={externalSearch}
                onChange={e => setExternalSearch(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-slate-800 font-medium placeholder-slate-400"
              />
            </div>
            <button onClick={() => setShowAddExternal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-sm transition-colors shrink-0">
              <Plus size={18} />
              <span>إضافة جهة خارجية</span>
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3 pl-4">الجهة الخارجية</th>
                  <th className="p-3">رقم الجوال</th>
                  <th className="p-3">للشركة عندهم</th>
                  <th className="p-3">علي الشركة لهم</th>
                  <th className="p-3">شخصي لي عندهم</th>
                  <th className="p-3">شخصي عليّ لهم</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredExternal.map(acc => {
                  return (
                    <tr key={acc.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-3 pl-4 font-black text-slate-800">{acc.name}</td>
                      <td className="p-3 text-slate-600 font-mono text-sm">{acc.phone || '—'}</td>
                      <td className="p-3 font-mono font-bold text-emerald-600">{sar(acc.company_due_from)}</td>
                      <td className="p-3 font-mono font-bold text-rose-600">{sar(acc.company_due_to)}</td>
                      <td className="p-3 font-mono font-bold text-blue-600">{sar(acc.personal_due_from)}</td>
                      <td className="p-3 font-mono font-bold text-amber-600">{sar(acc.personal_due_to)}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-center">
                          <button 
                            onClick={() => openExternalStatement(acc.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md font-bold text-xs transition-colors shadow-sm"
                          >
                            <FileText size={14} />
                            كشف الحساب
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredExternal.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">لا توجد جهات مسجلة.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'audit' && auditAvailable && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-black text-slate-800 flex items-center gap-2"><ShieldCheck size={20} className="text-emerald-600"/> سجل مراجعة الحركات المالية</h3>
            <p className="text-xs text-slate-500 mt-1">سجل للقراءة فقط يعرض القيم قبل التعديل أو الحذف وبعده.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead><tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-3">وقت العملية</th><th className="p-3">العملية</th><th className="p-3">نوع الحركة</th>
                <th className="p-3">رقم الحركة</th><th className="p-3">الموظف</th><th className="p-3">القيم القديمة</th><th className="p-3">القيم الجديدة</th>
              </tr></thead>
              <tbody>
                {auditEntries.map(entry => {
                  const labels = { account_entry: "قيد عميل", payment: "دفعة عميل", cash_remittance: "توريد نقدي", external_entry: "حركة جهة خارجية" };
                  const summarize = (values: Record<string, unknown> | null) => values
                    ? Object.entries(values).filter(([key]) => !["id","created_at"].includes(key)).map(([key,value]) => `${key}: ${value ?? "—"}`).join(" · ")
                    : "—";
                  return <tr key={entry.id} className="border-b border-slate-100 align-top">
                    <td className="p-3 whitespace-nowrap font-mono">{new Date(entry.created_at + (entry.created_at.endsWith("Z") ? "" : "Z")).toLocaleString("ar-SA")}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-black ${entry.operation === "delete" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"}`}>{entry.operation === "delete" ? "حذف" : "تعديل"}</span></td>
                    <td className="p-3 font-bold">{labels[entry.entity_type]}</td>
                    <td className="p-3 font-mono">{entry.entity_id}</td><td className="p-3 font-bold">{entry.actor_name}</td>
                    <td className="p-3 min-w-72 text-xs leading-6 text-slate-700">{summarize(entry.old_values)}</td>
                    <td className="p-3 min-w-72 text-xs leading-6 text-slate-700">{summarize(entry.new_values)}</td>
                  </tr>;
                })}
                {auditEntries.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-slate-500">لا توجد تعديلات أو عمليات حذف مسجلة بعد.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- Modals --- */}
      <Modal isOpen={!!editingTransfer} onClose={() => { if (!submitting) setEditingTransfer(null); }} title="تعديل تحويل العميل">
        <form onSubmit={saveTransferEdit} className="space-y-4">
          <p className="text-xs text-slate-500">التعديل يخضع لقفل الشهر المالي. لا يمكن تعديل دفعات شهر مقفل.</p>
          <label className="block text-sm font-bold text-slate-700">تاريخ الدفعة<input type="date" required value={transferEditForm.payment_date} onChange={e => setTransferEditForm(p => ({...p, payment_date: e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 p-3"/></label>
          <label className="block text-sm font-bold text-slate-700">المبلغ<input type="number" min="0.01" step="0.01" required value={transferEditForm.amount} onChange={e => setTransferEditForm(p => ({...p, amount: e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 p-3"/></label>
          <label className="block text-sm font-bold text-slate-700">رقم المرجع<input value={transferEditForm.reference_no} onChange={e => setTransferEditForm(p => ({...p, reference_no: e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 p-3"/></label>
          <label className="block text-sm font-bold text-slate-700">ملاحظات<textarea value={transferEditForm.notes} onChange={e => setTransferEditForm(p => ({...p, notes: e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 p-3"/></label>
          {actionError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{actionError}</p>}
          <div className="flex justify-end gap-2"><button type="button" disabled={submitting} onClick={() => setEditingTransfer(null)} className="rounded-lg px-4 py-2 font-bold text-slate-600">إلغاء</button><button type="submit" disabled={submitting} className="rounded-lg bg-slate-800 px-4 py-2 font-bold text-white disabled:opacity-50">{submitting ? "جاري الحفظ..." : "حفظ التعديل"}</button></div>
        </form>
      </Modal>
      <Modal isOpen={showStandaloneReceipt} onClose={() => { if (!submitting) setShowStandaloneReceipt(false); }} title="استلام مبلغ من عميل" maxWidth="max-w-lg">
        <form onSubmit={submitStandaloneReceipt} className="space-y-4">
          <p className="rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-900">تُسجّل الدفعة مباشرة في حساب الشركة. عند إنشاء عميل بجوال، يكون جواله كلمة مرور الدخول الأولية لحساب الإيجار.</p>
          <label className="block text-sm font-bold text-slate-700">العميل
            <select data-testid="select-receipt-customer" required value={receiptCustomer} onChange={e => { setReceiptCustomer(e.target.value); setActionError(""); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3">
              <option value="">اختر عميلاً...</option>
              {customerDirectory.filter(c => c.customer_type === "rental").map(c => <option key={c.id} value={c.name}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}
              {accounts.filter(a => !customerDirectory.some(c => c.name === a.name)).map(a => <option key={`account-${a.name}`} value={a.name}>{a.name}{a.phone ? ` — ${a.phone}` : ""}</option>)}
              <option value="__new__">+ عميل جديد</option>
            </select>
          </label>
          {receiptCustomer === "__new__" && <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">اسم العميل<input data-testid="input-receipt-new-name" required value={receiptNewName} onChange={e => setReceiptNewName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3"/></label>
            <label className="text-sm font-bold text-slate-700">رقم الجوال<input data-testid="input-receipt-new-phone" required type="tel" dir="ltr" value={receiptNewPhone} onChange={e => setReceiptNewPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3"/></label>
          </div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">المبلغ (ر.س)<input data-testid="input-receipt-amount" required min="0.01" step="0.01" type="number" value={receiptAmount} onChange={e => setReceiptAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 font-mono"/></label>
            <label className="text-sm font-bold text-slate-700">تاريخ الاستلام<input required type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3"/></label>
          </div>
          <label className="block text-sm font-bold text-slate-700">رقم المرجع / الحوالة<input value={receiptReference} onChange={e => setReceiptReference(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3"/></label>
          <label className="block text-sm font-bold text-slate-700">ملاحظات<textarea rows={2} value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3"/></label>
          {actionError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{actionError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" disabled={submitting} onClick={() => setShowStandaloneReceipt(false)} className="rounded-lg px-4 py-2.5 font-bold text-slate-600">إلغاء</button>
            <button data-testid="button-save-receipt" type="submit" disabled={submitting} className="rounded-lg bg-emerald-800 px-5 py-2.5 font-bold text-white disabled:opacity-50">{submitting ? "جاري الحفظ..." : "تسجيل الاستلام"}</button>
          </div>
        </form>
      </Modal>
      
      <Modal isOpen={showAddCustomer} onClose={() => { setShowAddCustomer(false); setEditingCustomer(null); }} title={editingCustomer ? "تعديل بيانات العميل" : "إضافة عميل ردود جديد"}>
        <form onSubmit={handleAddCustomer} className="flex flex-col gap-4">
          {editingCustomer && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <span><span className="font-bold text-slate-800">حساب الدخول: </span>{editingCustomer.portal_user_id || editingCustomer.login_user_id || editingCustomer.linked_user_id || editingCustomer.user_id || editingCustomer.has_login || editingCustomer.login_status === "active" ? (editingCustomer.login_active === false || editingCustomer.login_active === 0 || editingCustomer.login_status === "inactive" ? "موقوف" : "مرتبط") : "غير مرتبط"}</span>
            {editingCustomer.customer_type === "rental" && editingCustomer.phone && !editingCustomer.portal_user_id && <button type="button" disabled={submitting} onClick={activateCustomerLogin} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">تنشيط حساب الدخول</button>}
            {editingCustomer.customer_type === "rental" && !editingCustomer.phone && <span className="text-xs text-amber-700">أضف رقم الجوال واحفظه أولاً لتنشيط الدخول.</span>}
          </div>}
          {actionError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{actionError}</p>}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">اسم العميل</label>
            <input type="text" required value={customerForm.name} onChange={e => setCustomerForm(p => ({...p, name: e.target.value}))} className="w-full p-2.5 rounded-lg border border-slate-300 font-bold" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">رقم الجوال (اختياري، مطلوب لحساب الدخول)</label>
            <input type="text" dir="ltr" placeholder="05XXXXXXXX" value={customerForm.phone} onChange={e => setCustomerForm(p => ({...p, phone: e.target.value}))} className="w-full p-2.5 rounded-lg border border-slate-300 font-mono text-right" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">تصنيف العميل</label>
            <select value={customerForm.customer_type} onChange={e => setCustomerForm(p => ({...p, customer_type: e.target.value as "rental" | "company"}))} className="w-full p-2.5 rounded-lg border border-slate-300 font-bold">
              <option value="rental">عميل إيجار خارجي — يظهر في كشف الحساب</option>
              <option value="company">عميل تابع للشركة — لا يظهر في كشف الإيجارات</option>
            </select>
          </div>
          <label className="flex items-start gap-2 text-sm font-bold text-slate-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <input type="checkbox" checked={customerForm.reclassify_existing} onChange={e => setCustomerForm(p => ({...p, reclassify_existing: e.target.checked}))} className="mt-1" />
            <span>تطبيق التصنيف الجديد على الردود القديمة لهذا العميل أيضًا</span>
          </label>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label>
            <textarea rows={2} value={customerForm.notes} onChange={e => setCustomerForm(p => ({...p, notes: e.target.value}))} className="w-full p-2.5 rounded-lg border border-slate-300" />
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 mt-2">
            {editingCustomer && <button type="button" disabled={submitting} onClick={handleDeleteCustomer} className="ml-auto px-4 py-2.5 text-rose-700 font-bold hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"><Trash2 size={16}/> حذف العميل</button>}
            <button type="button" onClick={() => { setShowAddCustomer(false); setEditingCustomer(null); }} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors">إلغاء</button>
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50">
              {submitting ? 'جاري الحفظ...' : 'حفظ العميل'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showAddExternal} onClose={() => setShowAddExternal(false)} title="إضافة جهة خارجية جديدة">
        <form onSubmit={handleAddExternal} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">اسم الجهة / الشخص</label>
            <input type="text" required value={externalPartyForm.name} onChange={e => setExternalPartyForm(p => ({...p, name: e.target.value}))} className="w-full p-2.5 rounded-lg border border-slate-300 font-bold" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">رقم الجوال (اختياري)</label>
            <input type="text" dir="ltr" placeholder="05XXXXXXXX" value={externalPartyForm.phone} onChange={e => setExternalPartyForm(p => ({...p, phone: e.target.value}))} className="w-full p-2.5 rounded-lg border border-slate-300 font-mono text-right" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label>
            <textarea rows={2} value={externalPartyForm.notes} onChange={e => setExternalPartyForm(p => ({...p, notes: e.target.value}))} className="w-full p-2.5 rounded-lg border border-slate-300" />
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 mt-2">
            <button type="button" onClick={() => setShowAddExternal(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors">إلغاء</button>
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50">
              {submitting ? 'جاري الحفظ...' : 'حفظ الجهة'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!selectedCustomer} onClose={() => setSelectedCustomer(null)} title={`كشف حساب: ${selectedCustomer}`} maxWidth="max-w-6xl">
        {loadingStatement ? (
          <div className="p-12 text-center text-slate-500 font-bold flex flex-col items-center gap-3">
            <RotateCcw className="animate-spin text-slate-400" size={32} />
            جاري تحميل كشف الحساب...
          </div>
        ) : customerStatement ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-500">رقم الجوال</span>
                  <span className="font-mono font-bold text-slate-900">{customerStatement.customer.phone || 'غير مسجل'}</span>
                </div>
                <button onClick={() => { setPhoneForm(customerStatement.customer.phone || ''); setShowEditPhone(true); }} className="p-1.5 hover:bg-slate-200 text-slate-600 rounded transition-colors" title="تعديل رقم الجوال">
                  <Edit size={16} />
                </button>
              </div>
              
              <div className="flex items-center gap-2">
                <button onClick={() => setShowPaymentModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-bold text-sm transition-colors shadow-sm">
                  <HandCoins size={16} /> تسجيل دفعة مستلمة
                </button>
                <button onClick={() => setShowAddEntryModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-md font-bold text-sm transition-colors shadow-sm">
                  <ArrowRightLeft size={16} /> تسوية (مدين/دائن)
                </button>
                <button onClick={() => setShowMonthlyClosure(true)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-bold text-sm transition-colors shadow-sm">
                  <LockKeyhole size={16} /> التقفيل الشهري
                </button>
                <button onClick={() => setShowRouteSummary(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-md font-bold text-sm transition-colors shadow-sm">
                  <FileText size={16} /> ملخص الردود
                </button>
                <button onClick={addCustomerStatementCharge} className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-bold text-sm transition-colors shadow-sm">
                  <Plus size={16} /> زيادة خاصة بهذا الكشف
                </button>
                <div className="w-px h-8 bg-slate-300 mx-2"></div>
                <button type="button" onClick={() => setHideTripSplit(hidden => !hidden)}
                  aria-pressed={hideTripSplit}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md font-bold text-sm transition-colors">
                  {hideTripSplit ? <Eye size={16} /> : <EyeOff size={16} />}
                  {hideTripSplit ? "إظهار توزيع الرد" : "إخفاء توزيع الرد"}
                </button>
                <button onClick={() => printCustomerStatement()} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md font-bold text-sm transition-colors">
                  <Printer size={16} /> طباعة
                </button>
                <button onClick={() => handleWhatsApp(customerStatement)} className="flex items-center gap-1.5 px-4 py-2 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-md font-bold text-sm transition-colors shadow-sm">
                  <MessageCircle size={16} /> واتساب
                </button>
              </div>
            </div>
            {hasPersistedStatementAdjustments && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                التعديلات محفوظة لحساب هذا العميل فقط؛ لا تغيّر سجل الردود الأصلي ولا كشوف التقفيل الشهرية المحفوظة.
              </div>
            )}
            
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3 pl-4">التاريخ</th>
                    <th className="p-3">المصدر</th>
                    <th className="p-3 w-1/3">البيان</th>
                    <th className="p-3">المرجع</th>
                    <th className="p-3">مكان التحميل</th>
                    <th className="p-3">مكان التنزيل</th>
                    <th className="p-3 text-rose-700">مدين (عليه)</th>
                    <th className="p-3 text-emerald-700">دائن (له)</th>
                    <th className="p-3 bg-slate-200/50">الرصيد التراكمي</th>
                    <th className="p-3 text-center">إدارة</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let running = 0;
                    return visibleStatementEntries.map((e, idx) => {
                      const debit = Number(e.debit) || 0;
                      const credit = Number(e.credit) || 0;
                      running += (debit - credit);
                      return (
                        <tr key={e.id + '-' + idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-mono text-slate-700">{new Date(e.entry_date).toLocaleDateString('ar-SA')}</td>
                          <td className="p-3 text-slate-600 text-xs font-bold">
                            <span className="bg-slate-100 px-2 py-1 rounded">{e.source === "statement_adjustment" ? "زيادة كشف" : e.source}</span>
                            {e.statement_debit !== undefined && <span className="mr-1 rounded bg-amber-100 px-2 py-1 text-amber-800">سعر معدّل</span>}
                          </td>
                          <td className="p-3 text-slate-800 font-bold">{e.description}</td>
                          <td className="p-3 font-mono text-slate-500 text-xs">{e.reference_no || '—'}</td>
                          <td className="p-3 text-slate-700">{e.loading_region || '—'}</td>
                          <td className="p-3 text-slate-700">{e.unloading_region || '—'}</td>
                          <td className="p-3 font-mono font-bold text-rose-600">{debit ? sar(debit) : '—'}</td>
                          <td className="p-3 font-mono font-bold text-emerald-600">{credit ? sar(credit) : '—'}</td>
                          <td className="p-3 font-mono font-black text-slate-900 bg-slate-50/50" dir="ltr">
                            <span className="text-xs font-normal text-slate-500 float-left mt-1">{running !== 0 ? (running > 0 ? 'عليه' : 'له') : ''}</span>
                            {sar(Math.abs(running))}
                          </td>
                          <td className="p-3"><div className="flex justify-center gap-1">
                            {e.source !== "statement_adjustment" && (
                              <button onClick={()=>editCustomerEntry(e)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title={e.source === "trip" ? "تعديل قيمة الرد في هذا الكشف فقط" : "تعديل"}><Edit size={15}/></button>
                            )}
                            <button onClick={()=>deleteCustomerEntry(e)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title={e.source === "statement_adjustment" ? "إزالة الزيادة من هذا الكشف" : "حذف"}><Trash2 size={15}/></button>
                          </div></td>
                        </tr>
                      );
                    });
                  })()}
                  {visibleStatementEntries.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-slate-500 font-medium">لا توجد حركات مسجلة.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <div className="font-bold text-rose-700">إجمالي المدين: {sar(displayStatementTotals.debit)}</div>
              <div className="font-bold text-emerald-700">إجمالي الدائن: {sar(displayStatementTotals.credit)}</div>
              <div className="font-black text-slate-900">الرصيد النهائي: {sar(Math.abs(displayStatementBalance))} {displayStatementBalance > 0 ? "عليه" : displayStatementBalance < 0 ? "له" : ""}</div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 font-bold">تعذر تحميل البيانات.</div>
        )}
      </Modal>

      <Modal isOpen={showRouteSummary} onClose={() => setShowRouteSummary(false)} title={`ملخص ردود العميل: ${selectedCustomer || ""}`} maxWidth="max-w-5xl">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">الفترة</label>
              <select value={routeSummaryPeriod} onChange={event => setRouteSummaryPeriod(event.target.value as typeof routeSummaryPeriod)} className="rounded-lg border border-slate-300 px-3 py-2 font-bold">
                <option value="all">كل المدة</option><option value="current">الشهر الحالي</option><option value="previous">الشهر السابق</option>
                <option value="month">شهر معين</option><option value="range">فترة محددة</option>
              </select>
            </div>
            {routeSummaryPeriod === "month" && <input type="month" value={routeSummaryMonth} onChange={event => setRouteSummaryMonth(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />}
            {routeSummaryPeriod === "range" && <>
              <div><label className="mb-1 block text-xs font-bold text-slate-600">من</label><input type="date" value={routeSummaryFrom} onChange={event => setRouteSummaryFrom(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" /></div>
              <div><label className="mb-1 block text-xs font-bold text-slate-600">إلى</label><input type="date" value={routeSummaryTo} onChange={event => setRouteSummaryTo(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" /></div>
            </>}
            <button type="button" onClick={printRouteSummary} className="mr-auto flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 font-black text-white"><Printer size={16}/> طباعة الملخص</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-100"><tr><th className="p-3">مكان التحميل</th><th className="p-3">مكان التنزيل</th><th className="p-3">عدد الردود</th><th className="p-3">سعر الرد</th><th className="p-3">الإجمالي</th></tr></thead>
              <tbody>
                {routeSummaryRows.length === 0 ? <tr><td colSpan={5} className="p-10 text-center text-slate-400">لا توجد ردود خلال الفترة المحددة</td></tr> :
                  routeSummaryRows.map((row, index) => <tr key={`${row.loading}-${row.unloading}-${row.unitPrice}-${index}`} className="border-t"><td className="p-3 font-bold">{row.loading}</td><td className="p-3 font-bold">{row.unloading}</td><td className="p-3 font-mono">{row.trips}</td><td className="p-3 font-mono">{sar(row.unitPrice)}</td><td className="p-3 font-mono font-black">{sar(row.total)}</td></tr>)}
              </tbody>
              <tfoot className="bg-slate-100 font-black"><tr><td colSpan={2} className="p-3">المجموع</td><td className="p-3">{routeSummaryRows.reduce((sum,row)=>sum+row.trips,0)}</td><td className="p-3">—</td><td className="p-3">{sar(routeSummaryRows.reduce((sum,row)=>sum+row.total,0))}</td></tr></tfoot>
            </table>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showMonthlyClosure} onClose={() => setShowMonthlyClosure(false)} title={`التقفيل الشهري: ${selectedCustomer || ""}`} maxWidth="max-w-3xl">
        <div className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-3 text-sm font-bold text-amber-900">
              يحفظ التقفيل رصيد أول الشهر وحركاته ورصيده الختامي، ويمنع تعديل حركات الشهر حتى إعادة فتحه.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">الشهر المطلوب</label>
                <input type="month" value={closureMonth} onChange={event => setClosureMonth(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 font-bold" />
              </div>
              <button type="button" disabled={submitting} onClick={closeCustomerMonth} className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50">
                {submitting ? "جاري الحفظ..." : "اعتماد وتقفيل الشهر"}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-3">الشهر</th>
                  <th className="p-3">رصيد افتتاحي</th>
                  <th className="p-3">مدين الشهر</th>
                  <th className="p-3">دائن الشهر</th>
                  <th className="p-3">رصيد ختامي</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {monthlyClosures.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد أشهر مقفولة لهذا العميل</td></tr>
                ) : monthlyClosures.map(closure => (
                  <tr key={closure.id} className="border-t border-slate-100">
                    <td className="p-3 font-black">{closure.month}</td>
                    <td className="p-3 font-mono">{sar(closure.opening_balance)}</td>
                    <td className="p-3 font-mono text-rose-700">{sar(closure.period_debit)}</td>
                    <td className="p-3 font-mono text-emerald-700">{sar(closure.period_credit)}</td>
                    <td className="p-3 font-mono font-black">{sar(Math.abs(closure.closing_balance))} {closure.closing_balance > 0 ? "عليه" : closure.closing_balance < 0 ? "له" : ""}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${closure.status === "closed" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
                        {closure.status === "closed" ? "مقفول" : "أعيد فتحه"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => printMonthlyClosure(closure)} className="text-xs font-black text-blue-700 hover:underline">
                          طباعة النسخة
                        </button>
                      {closure.status === "closed" && (
                        <button type="button" onClick={() => {
                          const password = prompt("أدخل كلمة مرور حسابات الإيجار لإعادة فتح الشهر") || "";
                          setReopenPassword(password);
                          if (!password) return;
                          setSubmitting(true);
                          fetch(`/api/rental-monthly-closures/${closure.id}/reopen`, {
                            method: "POST", headers: apiHeaders(), body: JSON.stringify({ password }),
                          }).then(async response => {
                            const data = await response.json();
                            if (!response.ok) throw new Error(data.error || "تعذر إعادة فتح الشهر");
                            setMonthlyClosures(current => current.map(item => item.id === closure.id ? data : item));
                            setReopenPassword("");
                            alert("تمت إعادة فتح الشهر");
                          }).catch(error => alert(error.message)).finally(() => setSubmitting(false));
                        }} className="text-xs font-black text-rose-700 hover:underline">
                          إعادة فتح الشهر
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!selectedExternalId} onClose={() => setSelectedExternalId(null)} title={`كشف حساب: ${externalStatement?.party.name || ''}`} maxWidth="max-w-6xl">
        {loadingExtStatement ? (
          <div className="p-12 text-center text-slate-500 font-bold flex flex-col items-center gap-3">
            <RotateCcw className="animate-spin text-slate-400" size={32} />
            جاري تحميل كشف الحساب...
          </div>
        ) : externalStatement ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-500">رقم الجوال</span>
                  <span className="font-mono font-bold text-slate-900">{externalStatement.party.phone || 'غير مسجل'}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button onClick={() => setShowExtEntryModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-md font-bold text-sm transition-colors shadow-sm">
                  <Plus size={16} /> إضافة حركة (قيد/دفعة)
                </button>
                <div className="w-px h-8 bg-slate-300 mx-2"></div>
                <button onClick={() => printExternalStatement()} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md font-bold text-sm transition-colors">
                  <Printer size={16} /> طباعة
                </button>
                <button onClick={() => handleExternalWhatsApp(externalStatement)} className="flex items-center gap-1.5 px-4 py-2 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-md font-bold text-sm transition-colors shadow-sm">
                  <MessageCircle size={16} /> واتساب
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3 pl-4">التاريخ</th>
                    <th className="p-3 w-1/3">البيان</th>
                    <th className="p-3">التوجيه (الذمة)</th>
                    <th className="p-3">المرجع</th>
                    <th className="p-3 text-emerald-700">مدين (لنا)</th>
                    <th className="p-3 text-rose-700">دائن (لهم)</th>
                    <th className="p-3 bg-slate-200/50">الرصيد التراكمي</th>
                    <th className="p-3 text-center">إدارة</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const running = { company: 0, personal: 0 };
                    return externalStatement.entries.map((e, idx) => {
                      let debit = ['receivable', 'payable_payment'].includes(e.entry_type) ? Number(e.amount) : 0;
                      let credit = ['payable', 'receivable_payment'].includes(e.entry_type) ? Number(e.amount) : 0;
                      const scope = e.money_scope === "personal" ? "personal" : "company";
                      running[scope] += (debit - credit);
                      const scopeBalance = running[scope];
                      return (
                        <tr key={e.id + '-' + idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-mono text-slate-700">{new Date(e.entry_date).toLocaleDateString('ar-SA')}</td>
                          <td className="p-3 text-slate-800 font-bold">{e.description}</td>
                          <td className="p-3 text-slate-600 text-xs font-bold"><span className="bg-slate-100 px-2 py-1 rounded">{e.money_scope === 'personal' ? 'شخصي' : 'شركة'}</span></td>
                          <td className="p-3 font-mono text-slate-500 text-xs">{e.reference_no || '—'}</td>
                          <td className="p-3 font-mono font-bold text-emerald-600">{debit ? sar(debit) : '—'}</td>
                          <td className="p-3 font-mono font-bold text-rose-600">{credit ? sar(credit) : '—'}</td>
                          <td className="p-3 font-mono font-black text-slate-900 bg-slate-50/50" dir="ltr">
                            <span className="text-xs font-normal text-slate-500 float-left mt-1">{scopeBalance !== 0 ? (scopeBalance > 0 ? 'لصالحنا' : 'لصالحهم') : ''}</span>
                            {sar(Math.abs(scopeBalance))}
                          </td>
                          <td className="p-3"><div className="flex justify-center gap-1">
                            <button onClick={()=>editExternalEntry(e)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="تعديل"><Edit size={15}/></button>
                            <button onClick={()=>deleteExternalEntry(e)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title="حذف"><Trash2 size={15}/></button>
                          </div></td>
                        </tr>
                      );
                    });
                  })()}
                  {externalStatement.entries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-500 font-medium">لا توجد حركات مسجلة.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 font-bold">تعذر تحميل البيانات.</div>
        )}
      </Modal>

      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title={`تسجيل دفعة مستلمة: ${selectedCustomer}`}>
        <form onSubmit={handleAddPayment} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ المحصل</label>
            <input type="number" step="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm(p => ({...p, amount: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono text-lg font-bold" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">التاريخ</label>
              <input type="date" required value={paymentForm.payment_date} onChange={e => setPaymentForm(p => ({...p, payment_date: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">طريقة الدفع</label>
              <select value={paymentForm.payment_method} onChange={e => setPaymentForm(p => ({...p, payment_method: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-bold text-slate-800">
                <option value="company_direct">تحويل بنكي (حساب الشركة)</option>
                <option value="cash_received">نقدي (للعهدة)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">رقم المرجع / الحوالة</label>
            <input type="text" value={paymentForm.reference_no} onChange={e => setPaymentForm(p => ({...p, reference_no: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات اضافية</label>
            <textarea rows={2} value={paymentForm.notes} onChange={e => setPaymentForm(p => ({...p, notes: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300" />
          </div>
          <div className="pt-5 border-t border-slate-100 flex justify-end gap-3 mt-2">
            <button type="button" onClick={() => setShowPaymentModal(false)} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors">إلغاء</button>
            <button type="submit" disabled={submitting} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-md disabled:opacity-50">
              {submitting ? 'جاري الحفظ...' : 'حفظ الدفعة'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showAddEntryModal} onClose={() => setShowAddEntryModal(false)} title={`تسوية قيد: ${selectedCustomer}`}>
        <form onSubmit={handleAddEntry} className="flex flex-col gap-4">
          <div className="flex gap-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <label className="flex items-center gap-2 font-black text-slate-800 cursor-pointer">
              <input type="radio" name="entry_type" value="opening_debit" checked={entryForm.entry_type === 'opening_debit'} onChange={e => setEntryForm(p => ({...p, entry_type: e.target.value}))} className="w-5 h-5 text-slate-800" />
              مدين (نطالبه بمبلغ)
            </label>
            <label className="flex items-center gap-2 font-black text-slate-800 cursor-pointer">
              <input type="radio" name="entry_type" value="opening_credit" checked={entryForm.entry_type === 'opening_credit'} onChange={e => setEntryForm(p => ({...p, entry_type: e.target.value}))} className="w-5 h-5 text-slate-800" />
              دائن (يطالبنا بمبلغ)
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ</label>
              <input type="number" step="0.01" required value={entryForm.amount} onChange={e => setEntryForm(p => ({...p, amount: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono text-lg font-bold" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">التاريخ</label>
              <input type="date" required value={entryForm.entry_date} onChange={e => setEntryForm(p => ({...p, entry_date: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">البيان (الوصف)</label>
            <input type="text" required placeholder="مثال: رصيد افتتاحي، تسوية خصم..." value={entryForm.description} onChange={e => setEntryForm(p => ({...p, description: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-bold" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">رقم المرجع (اختياري)</label>
            <input type="text" value={entryForm.reference_no} onChange={e => setEntryForm(p => ({...p, reference_no: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono" />
          </div>
          <div className="pt-5 border-t border-slate-100 flex justify-end gap-3 mt-2">
            <button type="button" onClick={() => setShowAddEntryModal(false)} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors">إلغاء</button>
            <button type="submit" disabled={submitting} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition-colors shadow-md disabled:opacity-50">
              {submitting ? 'جاري الحفظ...' : 'حفظ القيد'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showExtEntryModal} onClose={() => setShowExtEntryModal(false)} title="إضافة حركة لجهة خارجية">
        <form onSubmit={handleAddExtEntry} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">نوع الحركة</label>
              <select value={extEntryForm.entry_type} onChange={e => setExtEntryForm(p => ({...p, entry_type: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-bold text-slate-800">
                <option value="receivable">استحقاق لصالحنا (عليهم)</option>
                <option value="receivable_payment">دفعة مستلمة منهم (سداد لنا)</option>
                <option value="payable">استحقاق لصالحهم (علينا)</option>
                <option value="payable_payment">دفعة مدفوعة لهم (سداد منا)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">التوجيه (الذمة)</label>
              <select value={extEntryForm.money_scope} onChange={e => setExtEntryForm(p => ({...p, money_scope: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-bold text-slate-800">
                <option value="company">ذمة الشركة (رسمي)</option>
                <option value="personal">ذمة شخصية (خارجي)</option>
              </select>
            </div>
          </div>

          {(extEntryForm.entry_type === 'receivable_payment' || extEntryForm.entry_type === 'payable_payment') && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">طريقة الدفع/الاستلام</label>
              <select value={extEntryForm.payment_method || 'company_direct'} onChange={e => setExtEntryForm(p => ({...p, payment_method: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-bold text-slate-800">
                <option value="company_direct">تحويل بنكي (رسمي)</option>
                <option value="cash">نقدي</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ</label>
              <input type="number" step="0.01" required value={extEntryForm.amount} onChange={e => setExtEntryForm(p => ({...p, amount: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono text-lg font-bold" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">التاريخ</label>
              <input type="date" required value={extEntryForm.entry_date} onChange={e => setExtEntryForm(p => ({...p, entry_date: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">البيان (الوصف)</label>
            <input type="text" required value={extEntryForm.description} onChange={e => setExtEntryForm(p => ({...p, description: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-bold" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">رقم المرجع (اختياري)</label>
            <input type="text" value={extEntryForm.reference_no} onChange={e => setExtEntryForm(p => ({...p, reference_no: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono" />
          </div>
          <div className="pt-5 border-t border-slate-100 flex justify-end gap-3 mt-2">
            <button type="button" onClick={() => setShowExtEntryModal(false)} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors">إلغاء</button>
            <button type="submit" disabled={submitting} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition-colors shadow-md disabled:opacity-50">
              {submitting ? 'جاري الحفظ...' : 'حفظ الحركة'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showRemitModal} onClose={() => setShowRemitModal(false)} title="إضافة توريد نقدي للشركة">
        <form onSubmit={handleRemit} className="flex flex-col gap-4">
          <div className="bg-slate-100 p-4 rounded-lg flex items-center justify-between">
            <span className="font-bold text-slate-700">رصيد العهدة الحالي:</span>
            <span className="font-mono font-black text-xl text-slate-900">{sar(cashCustody?.balance || 0)}</span>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">العميل صاحب الكاش المورّد</label>
            <select required value={remitForm.customer_name} onChange={e => setRemitForm(p => ({...p, customer_name: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-bold">
              <option value="">اختر العميل</option>
              {accounts.filter(account => account.cash_in_custody > 0).map(account => (
                <option key={account.name} value={account.name}>{account.name} — متاح {sar(account.cash_in_custody)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ المورد</label>
            <input type="number" step="0.01" required value={remitForm.amount} onChange={e => setRemitForm(p => ({...p, amount: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono text-lg font-bold" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">التاريخ</label>
            <input type="date" required value={remitForm.remittance_date} onChange={e => setRemitForm(p => ({...p, remittance_date: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">رقم السند / المرجع</label>
            <input type="text" value={remitForm.reference_no} onChange={e => setRemitForm(p => ({...p, reference_no: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300 font-mono" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات اضافية</label>
            <textarea rows={2} value={remitForm.notes} onChange={e => setRemitForm(p => ({...p, notes: e.target.value}))} className="w-full p-3 rounded-lg border border-slate-300" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">صورة إيصال / سند التوريد (اختياري)</label>
            <input type="file" accept="image/*" onChange={e => setRemitImage(e.target.files?.[0] || null)} className="w-full p-3 rounded-lg border border-slate-300 bg-slate-50" />
          </div>
          <div className="pt-5 border-t border-slate-100 flex justify-end gap-3 mt-2">
            <button type="button" onClick={() => setShowRemitModal(false)} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors">إلغاء</button>
            <button type="submit" disabled={submitting} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition-colors shadow-md disabled:opacity-50">
              {submitting ? 'جاري الحفظ...' : 'اعتماد التوريد'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showEditPhone} onClose={() => setShowEditPhone(false)} title="تحديث رقم الجوال">
        <form onSubmit={handleUpdatePhone} className="flex flex-col gap-4">
          <div className="text-sm font-bold text-slate-500 bg-slate-100 p-3 rounded-lg mb-2">العميل: {selectedCustomer}</div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">رقم الجوال الجديد</label>
            <input type="text" dir="ltr" required placeholder="05XXXXXXXX" value={phoneForm} onChange={e => setPhoneForm(e.target.value)} className="w-full p-3 rounded-lg border border-slate-300 font-mono text-right text-lg font-bold" />
          </div>
          <div className="pt-5 border-t border-slate-100 flex justify-end gap-3 mt-2">
            <button type="button" onClick={() => setShowEditPhone(false)} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors">إلغاء</button>
            <button type="submit" disabled={submitting} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition-colors shadow-md disabled:opacity-50">
              {submitting ? 'جاري الحفظ...' : 'تحديث الرقم'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
