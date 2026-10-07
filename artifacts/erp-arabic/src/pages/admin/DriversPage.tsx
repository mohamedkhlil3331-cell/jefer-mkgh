import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  RefreshCw, Plus, Edit2, Trash2, Phone, Truck, Search, X, Save,
  FileText, Shield, Link, LinkIcon, UserCheck, UserX, BookOpen,
  Camera, Upload, Download, AlertTriangle, CheckCircle, User, ExternalLink,
  UserPlus, GitMerge, ChevronDown, Printer,
} from "lucide-react";
import DriverStatementModal, { printSavedDriverStatement, type StoredStatementPrint } from "@/pages/transportation/DriverStatementModal";
import DriverSettlementStatementModal from "@/pages/admin/DriverSettlementStatementModal";
import { useRememberedState } from "@/hooks/useRememberedState";

const P  = "#103c68";
const S  = "#0eb5cb";
const BG = "#f4f7f6";

interface Driver {
  id: number; vehicle_plate?: string; driver_name: string; phone?: string;
  branch?: string; email?: string;
  photo_url?: string;
  fingerprint_url?: string; signature_url?: string;
  license_url?: string; license_expiry?: string;
  operation_card_url?: string; operation_card_expiry?: string;
  iqama_image_url?: string; iqama_pdf_url?: string; iqama_expiry?: string;
  delegated_form_image_url?: string; delegated_form_pdf_url?: string; delegated_form_expiry?: string;
  driver_card_url?: string; insurance_url?: string;
  status?: string; notes?: string; synced_at?: string;
  user_id?: number | null; user_name?: string | null; user_phone_account?: string | null;
  total_revenue?: number; trips_count?: number;
  salary?: number;
}

interface UserAccount { id: number; name: string; phone: string; role: string; }
interface GhostDriver { name: string; in_trips: number; in_orders: number; in_breakdowns: number; }
interface CustodyRecord {
  id: number; driver_phone: string; driver_name?: string; vehicle_plate?: string;
  print_date: string; date_from?: string; date_to?: string;
  filter_ref?: string; load_types?: string;
  net_amount: number; item_count?: number; items_snapshot?: string;
  is_custody_printed: number; custody_printed_at?: string; created_at: string;
  batch_key?: string;
  is_cancelled: number; cancelled_at?: string; include_driver_signatures: number;
  snapshot_required?: number; has_print_snapshot?: number;
}
interface CustodySummary {
  total_custody: number;
  per_driver: { driver_phone: string; driver_name?: string; vehicle_plate?: string; total_amount: number; record_count: number }[];
}
interface StatementSummary {
  total_custody_due: number;
  total_on_drivers: number;
  total_remaining_for_drivers: number;
  per_driver: { driver_phone: string; balance: number }[];
}
interface SettlementDashboardSettings {
  cash_amount: number;
  company_custody_amount: number;
  rentals_amount: number;
}
interface Stats {
  total: number; active: number; onTrip: number; noDoc: number;
  recentOrders: { driver_name: string; vehicle_plate: string; order_number: string; delivery_location: string; stage: string; created_at: string }[];
}

const STATUS_STYLE: Record<string, string> = {
  "نشط":     "bg-green-100 text-green-700",
  "في رحلة": "bg-blue-100  text-blue-700",
  "إجازة":   "bg-yellow-100 text-yellow-700",
  "موقوف":   "bg-red-100   text-red-700",
};
const STATUS_OPTIONS = ["نشط", "في رحلة", "إجازة", "موقوف"];
const EMPTY: Partial<Driver> = { status: "نشط" };
const EMPTY_STATEMENT_SUMMARY: StatementSummary = {
  total_custody_due: 0,
  total_on_drivers: 0,
  total_remaining_for_drivers: 0,
  per_driver: [],
};
const EMPTY_SETTLEMENT_DASHBOARD: SettlementDashboardSettings = {
  cash_amount: 0,
  company_custody_amount: 0,
  rentals_amount: 0,
};

function expiryStatus(dateStr?: string): { label: string; color: string; icon: "ok" | "warn" | "expired" } | null {
  if (!dateStr) return null;
  const days = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (days < 0)  return { label: "منتهية",     color: "#dc2626", icon: "expired" };
  if (days < 30) return { label: `${days} يوم`, color: "#d97706", icon: "warn" };
  return { label: "سارية", color: "#16a34a", icon: "ok" };
}

function ExpiryBadge({ date }: { date?: string }) {
  const s = expiryStatus(date);
  if (!s) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-bold text-white"
          style={{ backgroundColor: s.color }}>
      {s.icon === "expired" ? <AlertTriangle size={9} /> : s.icon === "warn" ? <AlertTriangle size={9} /> : <CheckCircle size={9} />}
      {s.label}
    </span>
  );
}

async function uploadToStorage(file: File): Promise<string> {
  const r = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!r.ok) throw new Error("فشل الحصول على رابط الرفع");
  const { uploadURL, objectPath } = await r.json() as { uploadURL: string; objectPath: string };
  const uploaded = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!uploaded.ok) throw new Error("فشل رفع الملف");
  return `/api/storage${objectPath}`;
}

function isPdfUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes(".pdf") || lower.includes("/pdf") || lower.startsWith("data:application/pdf");
}

function ImgUploadField({
  label, value, uploading, onFile, icon, accept,
}: {
  label: string; value?: string; uploading: boolean;
  onFile: (f: File) => void; icon: React.ReactNode;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const isPdf = accept === "application/pdf" || isPdfUrl(value);
  const uploadHint = accept === "image/*" ? "صورة فقط" : accept === "application/pdf" ? "ملف PDF فقط" : "صورة أو PDF";
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 block mb-1.5 flex items-center gap-1">
        {icon}{label}
      </label>
      <div
        className="border-2 border-dashed border-gray-200 rounded-xl p-2 text-center cursor-pointer hover:border-blue-300 transition-colors min-h-[72px] flex flex-col items-center justify-center gap-1"
        onClick={() => ref.current?.click()}
      >
        {value && !uploading ? (
          isPdf ? (
            <div className="flex flex-col items-center gap-1.5" onClick={e => e.stopPropagation()}>
              <a href={value} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-100 transition-colors"
                title="فتح PDF">
                <FileText size={16} className="text-red-500" />
                PDF — اضغط للعرض
                <ExternalLink size={11} className="text-red-400" />
              </a>
              <button onClick={e => { e.stopPropagation(); ref.current?.click(); }}
                className="text-[10px] text-gray-400 hover:text-blue-500 underline">
                تغيير الملف
              </button>
            </div>
          ) : (
            <img src={value} alt={label} className="max-h-16 mx-auto object-contain rounded" />
          )
        ) : (
          <span className="text-gray-300 text-xs flex flex-col items-center gap-1">
            <Upload size={16} />{uploadHint}
          </span>
        )}
        {uploading && <span className="text-xs text-blue-500 animate-pulse">جاري الرفع...</span>}
      </div>
      <input ref={ref} type="file" accept={accept ?? "image/*,application/pdf"} className="hidden"
        onChange={e => {
          const input = e.currentTarget;
          const f = input.files?.[0];
          if (f) {
            const valid = accept === "image/*"
              ? f.type.startsWith("image/")
              : accept === "application/pdf"
                ? f.type === "application/pdf"
                : true;
            if (!valid) {
              alert(accept === "application/pdf" ? "اختر ملف PDF" : "اختر ملف صورة");
              input.value = "";
              return;
            }
            onFile(f);
          }
          input.value = "";
        }} />
    </div>
  );
}

function OfficialDriverDocumentCard({
  title, icon, imageValue, pdfValue, expiry, uploadingImage, uploadingPdf,
  onImageFile, onPdfFile, onExpiryChange,
}: {
  title: string; icon: React.ReactNode;
  imageValue?: string; pdfValue?: string; expiry?: string;
  uploadingImage: boolean; uploadingPdf: boolean;
  onImageFile: (file: File) => void; onPdfFile: (file: File) => void;
  onExpiryChange: (value: string) => void;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 mb-3">
      <p className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
        {icon}{title}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ImgUploadField label={`صورة ${title}`} value={imageValue} uploading={uploadingImage}
          onFile={onImageFile} accept="image/*" icon={<Camera size={11} className="text-gray-500" />} />
        <ImgUploadField label={`PDF ${title}`} value={pdfValue} uploading={uploadingPdf}
          onFile={onPdfFile} accept="application/pdf" icon={<FileText size={11} className="text-red-500" />} />
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1.5">تاريخ الانتهاء</label>
          <input type="date" value={expiry ?? ""}
            onChange={e => onExpiryChange(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
            style={{ "--tw-ring-color": S } as React.CSSProperties} />
          {expiry && <div className="mt-2"><ExpiryBadge date={expiry} /></div>}
        </div>
      </div>
    </div>
  );
}

export default function DriversPage() {
  const { user, token } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useRememberedState("admin-drivers-search", "");
  const [filterStatus, setFilterStatus] = useRememberedState("admin-drivers-status-filter", "الكل");
  const [modal, setModal] = useState<{ open: boolean; d: Partial<Driver> }>({ open: false, d: {} });
  const [stmtDriver, setStmtDriver] = useState<Driver | null>(null);
  const [saving, setSaving] = useState(false);
  const createRequestIdRef = useRef<string | null>(null);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState({
    photo: false, license: false, opCard: false, fingerprint: false, signature: false,
    iqamaImage: false, iqamaPdf: false, delegatedFormImage: false, delegatedFormPdf: false,
  });
  const importRef = useRef<HTMLInputElement>(null);

  const [ghostDrivers, setGhostDrivers] = useState<GhostDriver[]>([]);
  const [ghostLink, setGhostLink] = useState<{ name: string; targetDriverId: string; renameRecords: boolean } | null>(null);
  const [ghostLinking, setGhostLinking] = useState(false);

  // ── عهدة الحركة tab ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useRememberedState<"drivers" | "custody" | "settlements">("admin-drivers-active-tab", "drivers");
  const [custodyRecs,    setCustodyRecs]    = useState<CustodyRecord[]>([]);
  const [custodySummary, setCustodySummary] = useState<CustodySummary | null>(null);
  const [custodyLoading, setCustodyLoading] = useState(false);
  const [custodySel,     setCustodySel]     = useState<Set<number>>(new Set());
  const [custodyView, setCustodyView] = useState<"unprinted" | "archive">("unprinted");
  const [printingCustody, setPrintingCustody] = useState(false);
  const [savingSignatureForId, setSavingSignatureForId] = useState<number | null>(null);
  const [unprintingCustodyId, setUnprintingCustodyId] = useState<number | null>(null);
  const [custodyDateFrom, setCustodyDateFrom] = useRememberedState("admin-drivers-custody-date-from", "");
  const [custodyDateTo,   setCustodyDateTo]   = useRememberedState("admin-drivers-custody-date-to", "");
  const [custodyDetail,  setCustodyDetail]  = useState<CustodyRecord | null>(null);
  const [showBreakdown,  setShowBreakdown]  = useState(false);

  // ── التسويات الإجمالية tab ───────────────────────────────────────────────────
  interface LedgerRow {
    driver_name: string; phone: string; vehicle_plate: string; status: string;
    earned: number; expenses: number; settled: number; deferred: number;
    companySent: number; balance: number; trips: number;
    lastSettlement: { allocated_amount: number; created_at: string; notes: string } | null;
  }
  const [ledgerRows,    setLedgerRows]    = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [payModal,      setPayModal]      = useState<LedgerRow | null>(null);
  const [statementDriver, setStatementDriver] = useState<LedgerRow | null>(null);
  const [payForm,       setPayForm]       = useState({ amount: "", notes: "", settlement_date: new Date().toISOString().slice(0, 10), type: "دفع" as "دفع" | "خصم" });
  const [paying,        setPaying]        = useState(false);
  const [statementSummary, setStatementSummary] = useState<StatementSummary>(EMPTY_STATEMENT_SUMMARY);
  const [dashboardDraft, setDashboardDraft] = useState<Record<keyof SettlementDashboardSettings, string>>({
    cash_amount: "0",
    company_custody_amount: "0",
    rentals_amount: "0",
  });
  const [savingDashboard, setSavingDashboard] = useState(false);
  const [settlementDashboardLoaded, setSettlementDashboardLoaded] = useState(false);
  const [settlementDashboardError, setSettlementDashboardError] = useState("");
  // ── تعديل رقم الكشف ─────────────────────────────────────────────────────────
  const [editingRef,   setEditingRef]    = useState<{ id: number; val: string } | null>(null);
  const [savingRef,    setSavingRef]     = useState(false);
  const custodyAuthHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const custodyJsonHeaders = { "Content-Type": "application/json", ...custodyAuthHeaders };

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/drivers").then(r => r.json()),
      fetch("/api/drivers/stats").then(r => r.json()),
      fetch("/api/workflow/drivers").then(r => r.json()),
      fetch("/api/drivers/ghost").then(r => r.json()),
    ]).then(([drvs, st, users, ghosts]) => {
      setDrivers(drvs);
      setStats(st);
      setUserAccounts(Array.isArray(users) ? users : []);
      setGhostDrivers(Array.isArray(ghosts) ? ghosts : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (activeTab === "custody") loadCustody(); }, [activeTab, custodyDateFrom, custodyDateTo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === "settlements" && token) loadLedger(); }, [activeTab, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const registerGhost = (name: string) => {
    setModal({ open: true, d: { ...EMPTY, driver_name: name } });
  };

  const linkGhostAlias = async () => {
    if (!ghostLink || !ghostLink.targetDriverId) return;
    setGhostLinking(true);
    const res = await fetch(`/api/drivers/${ghostLink.targetDriverId}/alias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias_name: ghostLink.name, rename: ghostLink.renameRecords }),
    });
    const data = await res.json() as { message?: string; error?: string; renamed?: { orders: number; trips: number; breakdowns: number } };
    setGhostLinking(false);
    if (!res.ok) { alert(data.error || "فشل الربط"); return; }
    if (ghostLink.renameRecords && data.renamed) {
      const { orders, trips, breakdowns } = data.renamed;
      const total = orders + trips + breakdowns;
      if (total > 0) alert(`✅ تم الربط وتحديث ${total} سجل\n(${orders} طلب · ${trips} رحلة · ${breakdowns} عطل)`);
    }
    setGhostLink(null);
    load();
  };

  const closeModal = () => {
    createRequestIdRef.current = null;
    setModal({ open: false, d: {} });
  };

  const save = async () => {
    setSaving(true);
    try {
      const { id, user_name, user_phone_account, vehicle_plate, branch, ...body } = modal.d;
      const createRequestId = id ? undefined : (createRequestIdRef.current ??= crypto.randomUUID());
      const res = await fetch(id ? `/api/drivers/${id}` : "/api/drivers", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...(createRequestId ? { create_request_id: createRequestId } : {}) }),
      });
      const data = await res.json().catch(() => null) as {
        driver?: Driver; id?: number; auto_created?: boolean; error?: string;
      } | null;
      if (!res.ok) {
        alert(data?.error || "فشل حفظ بيانات السائق");
        return;
      }
      if (!data?.driver || typeof data.driver.id !== "number") {
        alert("لم يصل تأكيد حفظ بيانات السائق؛ بقيت البيانات في النموذج");
        return;
      }
      closeModal();
      load();
      if (!id && data.auto_created) {
        alert(`✅ تم إضافة السائق وإنشاء حساب تلقائياً\nرقم الجوال: ${modal.d.phone}\nكلمة المرور: 123456`);
      }
    } catch {
      alert("تعذر الاتصال بالخادم؛ بقيت البيانات في النموذج، ويمكن المحاولة مرة أخرى");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا السائق؟")) return;
    await fetch(`/api/drivers/${id}`, { method: "DELETE" }); load();
  };

  const linkUser = async (driverId: number, userId: number | null) => {
    setLinkingId(driverId);
    const res = await fetch(`/api/drivers/${driverId}/link-user`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error);
    setLinkingId(null); load();
  };

  const mkUpload = (field: "photo" | "license" | "opCard" | "fingerprint" | "signature" | "iqamaImage" | "iqamaPdf" | "delegatedFormImage" | "delegatedFormPdf") => async (file: File) => {
    setUploading(u => ({ ...u, [field]: true }));
    try {
      const url = await uploadToStorage(file);
      const dbField: Record<typeof field, keyof Driver> = {
        photo: "photo_url",
        license: "license_url",
        opCard: "operation_card_url",
        fingerprint: "fingerprint_url",
        signature: "signature_url",
        iqamaImage: "iqama_image_url",
        iqamaPdf: "iqama_pdf_url",
        delegatedFormImage: "delegated_form_image_url",
        delegatedFormPdf: "delegated_form_pdf_url",
      };
      setModal(m => ({ ...m, d: { ...m.d, [dbField[field]]: url } }));
    } catch { alert("فشل رفع الصورة، حاول مرة أخرى"); }
    finally { setUploading(u => ({ ...u, [field]: false })); }
  };

  const loadCustody = () => {
    setCustodyLoading(true);
    const params = new URLSearchParams();
    if (custodyDateFrom) params.set("from", custodyDateFrom);
    if (custodyDateTo)   params.set("to",   custodyDateTo);
    Promise.all([
      fetch(`/api/driver-custody?${params}`, { headers: custodyAuthHeaders }).then(r => r.json()),
      fetch("/api/driver-custody/summary", { headers: custodyAuthHeaders }).then(r => r.json()),
    ]).then(([recs, sum]) => {
      setCustodyRecs(Array.isArray(recs) ? recs : []);
      setCustodySummary(sum as CustodySummary);
      setCustodyLoading(false);
    }).catch(() => setCustodyLoading(false));
  };

  const printCustodySelected = async (recordsToPrint?: CustodyRecord[]) => {
    const sel = (recordsToPrint ?? custodyRecs.filter(r => custodySel.has(r.id)))
      .filter(r => !Number(r.is_custody_printed));
    if (sel.length === 0) return;
    const w = window.open("", "_blank", "width=820,height=1160");
    if (!w) {
      alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول مجددًا.");
      return;
    }
    setPrintingCustody(true);
    try {
    const reservationResponse = await fetch("/api/driver-custody/mark-printed", {
      method: "PATCH", headers: custodyJsonHeaders,
      body: JSON.stringify({ ids: sel.map(r => r.id) }),
    });
    if (!reservationResponse.ok) {
      const data = await reservationResponse.json().catch(() => ({})) as { error?: string };
      w.close();
      alert(data.error || "تعذر حجز سجلات العهدة للطباعة");
      return;
    }
    const signatureRows = sel.filter(r => Number(r.include_driver_signatures ?? 1) === 1);
    const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char] || char));
    const safeSignatureSrc = (value: unknown) =>
      typeof value === "string" && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
        ? value
        : undefined;

    // ── جلب التوقيعات الرقمية للسائقين ────────────────────────────────────────
    const sigMap: Record<string, string> = {}; // batch_key → signature_data
    const batchKeys = [...new Set(signatureRows.map(r => r.batch_key).filter(Boolean) as string[])];
    await Promise.all(
      batchKeys.map(async bk => {
        try {
          const res = await fetch(`/api/driver-settlements/statements/${encodeURIComponent(bk)}/signature`, {
            headers: custodyAuthHeaders,
          });
          if (res.ok) {
            const data = await res.json() as { signature_data: string };
            sigMap[bk] = data.signature_data;
          }
        } catch { /* no signature */ }
      })
    );

    const sar    = (v: number) => v.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
    const total  = sel.reduce((s, r) => s + r.net_amount, 0);
    const today  = new Date().toLocaleDateString("ar-SA");
    const refs   = esc(sel.map(r => r.filter_ref).filter(Boolean).join(" ، "));
    const printer = esc(user?.name || "—");
    const logoUrl = `${window.location.origin}/jefer-logo-new.png`;

    const rows = sel.map((r, i) => `
      <tr style="background:${i % 2 ? "#f9fafb" : "#fff"}">
        <td>${i + 1}</td>
        <td style="font-weight:700;color:#103c68">${esc(r.filter_ref || "—")}</td>
        <td>${esc(r.driver_name || r.driver_phone)}</td>
        <td>${esc(r.vehicle_plate || "—")}</td>
        <td>${r.date_from ? `${esc(r.date_from)}${r.date_to ? " — " + esc(r.date_to) : ""}` : "كامل"}</td>
        <td>${esc(r.load_types || "—")}</td>
        <td style="font-weight:700;color:#059669;text-align:left">${sar(r.net_amount)}</td>
      </tr>`).join("");

    w.document.write(`<!DOCTYPE html><html dir="rtl"><head>
<meta charset="UTF-8">
<title>كشف استعاضة عهدة مستديمة</title>
<style>
  @page { size: A4 portrait; margin: 14mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; direction: rtl; color: #111; background: #fff; }

  /* ── رأس الصفحة ── */
  .hdr { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px double #103c68; padding-bottom: 10px; margin-bottom: 14px; }
  .hdr-side { font-size: 11px; line-height: 1.7; }
  .hdr-side .co  { font-size: 14px; font-weight: 800; color: #103c68; }
  .hdr-side .co-en { font-weight: 700; }
  .hdr-center img { height: 64px; object-fit: contain; display: block; margin: 0 auto; }

  /* ── عنوان الكشف ── */
  .doc-title { text-align: center; font-size: 17px; font-weight: 900; text-decoration: underline; color: #103c68; margin: 14px 0 12px; }

  /* ── بيانات الوثيقة ── */
  .doc-meta { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; font-size: 12px; }
  .doc-meta .label { font-weight: 700; }
  .doc-body-line { font-size: 12px; margin-bottom: 4px; }
  .intro { font-size: 12px; margin: 10px 0 14px; padding: 8px 12px; border-right: 4px solid #103c68; background: #f0f5ff; border-radius: 0 6px 6px 0; }

  /* ── جدول السجلات ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
  th { background: #103c68; color: #fff; padding: 7px 8px; text-align: right; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  tfoot td { background: #eff6ff; font-weight: 800; font-size: 12px; border-top: 2px solid #103c68; }

  /* ── التوقيعات ── */
  .sigs { display: flex; border-top: 2px solid #103c68; padding-top: 14px; margin-top: 18px; page-break-inside: avoid; }
  .sig-box { flex: 1; text-align: center; border-left: 1px solid #d1d5db; padding: 0 8px; }
  .sig-box:last-child { border-left: none; }
  .sig-name { font-size: 11px; font-weight: 700; color: #103c68; margin-bottom: 22px; }
  .sig-line { border-top: 1px solid #9ca3af; margin: 0 8px 6px; }
  .sig-ref  { font-size: 9.5px; color: #555; margin-top: 4px; word-break: break-all; }

  /* ── طباعة ── */
  @media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 0; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { page-break-inside: avoid; }
    .sigs { page-break-inside: avoid; }
    button { display: none; }
  }
</style>
</head><body>

<!-- ── رأس الصفحة ── -->
<div class="hdr">
  <div class="hdr-side" style="text-align:right">
    <div class="co">شركة جيفر التجارية</div>
    <div>س.ت : ١١٣١٣٠٣١٣٢</div>
    <div>المملكة العربية السعودية</div>
  </div>
  <div class="hdr-center">
    <img src="${logoUrl}" alt="جيفر" onerror="this.style.display='none'" />
    <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:#103c68;text-align:center;margin-top:2px">MKGH</div>
  </div>
  <div class="hdr-side" style="text-align:left;direction:ltr">
    <div class="co-en">Jefer Trading company</div>
    <div>C.R : 1131303132</div>
    <div>kingdom of saudi arabia</div>
  </div>
</div>

<!-- ── عنوان الكشف ── -->
<div class="doc-title">كشف استعاضة عهدة مستديمة</div>

<!-- ── بيانات الوثيقة ── -->
<div class="doc-meta">
  <div><span class="label">التاريخ /</span> ${today}</div>
  <div><span class="label">عدد المرفقات /</span> ${sel.length}</div>
</div>
<div class="doc-body-line"><span class="label">تصفية عهدة الموظف /</span> ${printer}</div>
<div class="intro">نرجو التكرم بتصفية المبالغ التي في عهدتنا حسب الايضاح أدناه وحسب المرفقات :</div>

<!-- ── جدول السجلات ── -->
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>رقم الكشف</th>
      <th>السائق</th>
      <th>رقم السيارة</th>
      <th>فترة الكشف</th>
      <th>نوع الحمولات</th>
      <th>الصافي للسائق</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td colspan="6" style="text-align:right;padding:7px 8px">إجمالي العهدة المستحقة</td>
      <td style="text-align:left;color:#103c68;padding:7px 8px">${sar(total)}</td>
    </tr>
  </tfoot>
</table>

<!-- ── توقيعات السائقين ── -->
${signatureRows.length > 0 ? `
<div style="margin-bottom:14px;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;page-break-inside:avoid">
  <div style="font-size:12px;font-weight:800;color:#103c68;margin-bottom:10px;border-bottom:1px solid #e5e7eb;padding-bottom:6px">توقيعات السائقين</div>
  <div style="display:flex;flex-wrap:wrap;gap:12px">
    ${signatureRows.map(r => {
       const sigData = r.batch_key ? safeSignatureSrc(sigMap[r.batch_key]) : undefined;
       const driverLabel = esc(r.driver_name || r.driver_phone);
      return `<div style="min-width:140px;flex:1;text-align:center;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px">
        <div style="font-size:11px;font-weight:700;color:#103c68;margin-bottom:6px">${driverLabel}</div>
        ${sigData
          ? `<img src="${sigData}" style="height:50px;max-width:160px;object-fit:contain;display:block;margin:0 auto" />`
          : `<div style="height:50px;border-bottom:1px solid #9ca3af;margin:0 16px"></div>`}
         <div style="font-size:9.5px;color:#777;margin-top:4px">${esc(r.filter_ref || "—")}</div>
      </div>`;
    }).join("")}
  </div>
</div>` : ""}

<!-- ── التوقيعات ── -->
<div class="sigs">
  ${["مشرف الحركة", "المحاسب", "المدير المالي", "الاعتماد"].map((s, i) => `
  <div class="sig-box">
    <div class="sig-name">${s}</div>
    <div class="sig-line"></div>
    ${i === 0 || i === 1 ? `<div class="sig-ref">أرقام الكشوفات:<br>${refs || "—"}</div>` : ""}
  </div>`).join("")}
</div>

<div style="margin-top:10px;text-align:center">
  <button onclick="window.print()" style="padding:8px 24px;background:#103c68;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">🖨 طباعة</button>
</div>

</body></html>`);

    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
    setCustodySel(new Set());
    } catch (error) {
      w.close();
      alert(error instanceof Error ? error.message : "تعذر تجهيز الكشف للطباعة");
    } finally {
      setPrintingCustody(false);
      loadCustody();
    }
  };

  const saveCustodySignaturePreference = async (record: CustodyRecord, include: boolean) => {
    if (Number(record.is_custody_printed)) return;
    setSavingSignatureForId(record.id);
    try {
      const response = await fetch(`/api/driver-custody/${record.id}/signature`, {
        method: "PATCH", headers: custodyJsonHeaders,
        body: JSON.stringify({ include_driver_signatures: include }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        alert(data.error || "تعذر حفظ إعداد التوقيع");
        return;
      }
      setCustodyRecs(current => current.map(item =>
        item.id === record.id ? { ...item, include_driver_signatures: include ? 1 : 0 } : item
      ));
    } catch {
      alert("تعذر الاتصال بالخادم لحفظ إعداد التوقيع");
    } finally {
      setSavingSignatureForId(null);
    }
  };

  const unprintCustodyRec = async (record: CustodyRecord) => {
    const isPrinted = Number(record.is_custody_printed) === 1;
    const hasLegacyCancellation = Number(record.is_cancelled) === 1;
    if (!isPrinted && !hasLegacyCancellation) {
      setCustodySel(current => {
        const next = new Set(current);
        next.delete(record.id);
        return next;
      });
      return;
    }
    if (!confirm("إلغاء طباعة هذا الكشف وإرجاعه إلى غير مطبوع؟ سيبقى كشف العهدة وبنوده ونسخته المحفوظة كما هي.")) return;
    setUnprintingCustodyId(record.id);
    try {
      const response = await fetch(`/api/driver-custody/${record.id}/cancel`, {
        method: "PATCH", headers: custodyAuthHeaders,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        alert(data.error || "تعذر إلغاء الطباعة");
        return;
      }
      setCustodySel(current => {
        const next = new Set(current);
        next.delete(record.id);
        return next;
      });
      setCustodyView("unprinted");
      loadCustody();
    } catch {
      alert("تعذر الاتصال بالخادم لإلغاء الطباعة");
    } finally {
      setUnprintingCustodyId(null);
    }
  };

  const saveRef = async () => {
    if (!editingRef) return;
    setSavingRef(true);
    const response = await fetch(`/api/driver-custody/${editingRef.id}/ref`, {
      method: "PATCH", headers: custodyJsonHeaders,
      body: JSON.stringify({ filter_ref: editingRef.val }),
    }).catch(() => {});
    if (response && !response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      alert(data.error || "تعذر تعديل رقم الكشف");
      setSavingRef(false);
      return;
    }
    setSavingRef(false);
    setEditingRef(null);
    loadCustody();
  };

  const loadLedger = () => {
    setLedgerLoading(true);
    setSettlementDashboardError("");
    setSettlementDashboardLoaded(false);
    const getJson = async (url: string, headers?: Record<string, string>) => {
      const response = await fetch(url, headers ? { headers } : undefined);
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "تعذر تحميل البيانات المالية");
      }
      return response.json();
    };
    Promise.allSettled([
      getJson("/api/driver-settlements/ledger"),
      getJson("/api/driver-settlements/statement-summary", custodyAuthHeaders),
      getJson("/api/driver-settlements/dashboard-settings", custodyAuthHeaders),
    ])
      .then(results => {
        const [ledgerResult, summaryResult, settingsResult] = results;
        if (ledgerResult.status === "fulfilled") {
          setLedgerRows(Array.isArray(ledgerResult.value) ? ledgerResult.value : []);
        } else {
          setLedgerRows([]);
        }
        if (summaryResult.status !== "fulfilled" || settingsResult.status !== "fulfilled") {
          const reason = summaryResult.status === "rejected"
            ? summaryResult.reason
            : settingsResult.status === "rejected"
              ? settingsResult.reason
              : new Error("تعذر تحميل بيانات لوحة التسويات");
          setSettlementDashboardError(reason instanceof Error ? reason.message : "تعذر تحميل بيانات لوحة التسويات");
          setLedgerLoading(false);
          return;
        }
        const summary = summaryResult.value;
        const settings = settingsResult.value;
        const nextSummary = summary && Array.isArray(summary.per_driver)
          ? { ...EMPTY_STATEMENT_SUMMARY, ...summary }
          : EMPTY_STATEMENT_SUMMARY;
        const nextSettings = settings
          ? {
              cash_amount: Number(settings.cash_amount) || 0,
              company_custody_amount: Number(settings.company_custody_amount) || 0,
              rentals_amount: Number(settings.rentals_amount) || 0,
            }
          : EMPTY_SETTLEMENT_DASHBOARD;
        setStatementSummary(nextSummary);
        setDashboardDraft({
          cash_amount: String(nextSettings.cash_amount),
          company_custody_amount: String(nextSettings.company_custody_amount),
          rentals_amount: String(nextSettings.rentals_amount),
        });
        setSettlementDashboardLoaded(true);
        setLedgerLoading(false);
      })
      .catch(() => setLedgerLoading(false));
  };

  const saveDashboardSettings = async () => {
    const toAmount = (value: string) => {
      const amount = Number(value);
      return Number.isFinite(amount) && amount >= 0 ? amount : 0;
    };
    const nextSettings: SettlementDashboardSettings = {
      cash_amount: toAmount(dashboardDraft.cash_amount),
      company_custody_amount: toAmount(dashboardDraft.company_custody_amount),
      rentals_amount: toAmount(dashboardDraft.rentals_amount),
    };
    setSavingDashboard(true);
    const response = await fetch("/api/driver-settlements/dashboard-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...custodyAuthHeaders },
      body: JSON.stringify(nextSettings),
    }).catch(() => null);
    if (!response?.ok) {
      const data = response ? await response.json().catch(() => ({})) as { error?: string } : {};
      alert(data.error || "تعذر حفظ مبالغ لوحة التسويات");
      setSavingDashboard(false);
      return;
    }
    const saved = await response.json() as SettlementDashboardSettings;
    setDashboardDraft({
      cash_amount: String(saved.cash_amount),
      company_custody_amount: String(saved.company_custody_amount),
      rentals_amount: String(saved.rentals_amount),
    });
    setSavingDashboard(false);
  };

  const submitPay = async () => {
    if (!payModal || !payForm.amount) return;
    setPaying(true);
    const amt = parseFloat(payForm.amount) || 0;
    await fetch("/api/driver-settlements", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driver_phone: payModal.phone,
        driver_name:  payModal.driver_name,
        allocated_amount: payForm.type === "خصم" ? -Math.abs(amt) : Math.abs(amt),
        settlement_date: payForm.settlement_date,
        settled_by: user?.name || "admin",
        notes: payForm.notes || (payForm.type === "دفع" ? "دفعة للسائق" : "خصم من التسويات"),
      }),
    });
    setPaying(false);
    setPayModal(null);
    setPayForm({ amount: "", notes: "", settlement_date: new Date().toISOString().slice(0, 10), type: "دفع" });
    loadLedger();
  };

  const printFromCustody = async (r: CustodyRecord) => {
    // Newer records retain a complete structured statement. Render it through the
    // approved print template instead of querying changed operational data.
    try {
      const snapshotResponse = await fetch(`/api/driver-custody/${r.id}/print-snapshot`, { headers: custodyAuthHeaders });
      if (snapshotResponse.ok) {
        const { print_snapshot } = await snapshotResponse.json() as { print_snapshot?: StoredStatementPrint };
        if (print_snapshot) {
          printSavedDriverStatement(print_snapshot);
          return;
        }
      }
    } catch {
      // Older custody entries have only the short item snapshot below.
    }
    if (r.snapshot_required || r.has_print_snapshot) {
      alert("تعذر فتح النسخة الثابتة لهذا الكشف. لن تُطبع نسخة بديلة حتى لا تختلف البيانات التاريخية.");
      return;
    }

    const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char] || char));
    const logoUrl = `${window.location.origin}/jefer-logo-new.png`;
    const sar = (v: number) => v.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
    const periodLabel = r.date_from ? `${esc(r.date_from)}${r.date_to ? " — " + esc(r.date_to) : ""}` : "كامل التاريخ";
    let itemsHTML = "";
    if (r.items_snapshot) {
      try {
        const items = JSON.parse(r.items_snapshot) as { date: string; kind: string; label: string; sub: string; amount: number; sign: number }[];
        const kindAR: Record<string, string> = { order: "أوردر", trip: "رحلة", rental: "إيجار", supply_trip: "رحلة توريد", expense: "مصروف" };
        itemsHTML = `
<h2>البنود المطبوعة (${items.length} بند)</h2>
<table>
  <thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>التفصيل</th><th>المبلغ</th></tr></thead>
  <tbody>${items.map((it, i) => `
    <tr style="background:${i % 2 ? "#f9fafb" : "#fff"}">
       <td>${esc(it.date || "—")}</td>
       <td>${esc(kindAR[it.kind] || it.kind)}</td>
       <td style="font-weight:600">${esc(it.label)}</td>
       <td style="color:#555">${esc(it.sub || "—")}</td>
       <td style="font-weight:700;color:${it.sign === 1 ? "#059669" : "#dc2626"};text-align:left">${it.sign === 1 ? "+" : "−"}${sar(Number(it.amount) || 0)}</td>
    </tr>`).join("")}
  </tbody>
  <tfoot><tr style="background:#eff6ff">
    <td colspan="4" style="text-align:right;font-weight:700;padding:8px">صافي المستحق</td>
    <td style="font-weight:900;color:#103c68;text-align:left;padding:8px">${sar(r.net_amount)}</td>
  </tr></tfoot>
</table>`;
      } catch { itemsHTML = ""; }
    }
    const w = window.open("", "_blank", "width=820,height=1100");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
<title>كشف السائق — ${esc(r.filter_ref)}</title>
<style>
  @page{size:A4 portrait;margin:14mm 16mm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Segoe UI",Arial,sans-serif;font-size:12px;direction:rtl;color:#111;background:#fff}
  .lh{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #103c68;padding-bottom:10px;margin-bottom:0}
  .lh-s{flex:1;font-size:11px;line-height:1.7}.lh-s.ltr{direction:ltr;text-align:left}
  .co{font-size:14px;font-weight:900;color:#103c68}
  .lh-c{text-align:center;flex-shrink:0;padding:0 14px}
  .lh-c img{height:64px;display:block;margin:0 auto}
  .info-bar{background:#f0f4ff;border:1px solid #c7d6f5;border-radius:6px;padding:8px 14px;margin:10px 0 14px;display:flex;gap:20px;flex-wrap:wrap;align-items:center}
  .di{font-size:11px;font-weight:700;color:#1e3a6e}.di-l{font-weight:500;color:#555;margin-left:4px}
  .ref-badge{font-family:monospace;font-size:15px;font-weight:900;color:#103c68;background:#e0e7ff;border:2px solid #c7d6f5;border-radius:6px;padding:2px 10px}
  h2{font-size:13px;color:#103c68;margin:14px 0 6px;border-bottom:2px solid #103c68;padding-bottom:3px}
  table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px}
  th{background:#103c68;color:#fff;padding:6px 8px;text-align:right;font-weight:600}
  td{padding:5px 8px;border-bottom:1px solid #f3f4f6}
  .sigs{display:flex;border-top:2px solid #103c68;padding-top:14px;margin-top:20px}
  .sig-box{flex:1;text-align:center;border-left:1px solid #d1d5db;padding:0 8px}.sig-box:last-child{border-left:none}
  .sig-name{font-size:11px;font-weight:700;color:#103c68;margin-bottom:24px}
  .sig-line{border-top:1px solid #9ca3af;margin:0 8px}
  @media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="lh">
  <div class="lh-s"><div class="co">شركة جيفر التجارية</div><div>س.ت : ١١٣١٣٠٣١٣٢</div><div>المملكة العربية السعودية</div></div>
  <div class="lh-c"><img src="${logoUrl}" onerror="this.style.display='none'" /><div style="font-size:11px;font-weight:900;letter-spacing:2px;color:#103c68;margin-top:2px">MKGH</div></div>
  <div class="lh-s ltr"><div class="co">Jefer Trading company</div><div>C.R : 1131303132</div><div>kingdom of saudi arabia</div></div>
</div>
<div class="info-bar">
   <div class="di"><span class="ref-badge">${esc(r.filter_ref || "—")}</span></div>
   <div class="di"><span class="di-l">السائق:</span>${esc(r.driver_name || r.driver_phone)}</div>
   <div class="di"><span class="di-l">السيارة:</span>${esc(r.vehicle_plate || "—")}</div>
  <div class="di"><span class="di-l">تاريخ الطباعة:</span>${new Date().toLocaleDateString("ar-SA")}</div>
  <div class="di"><span class="di-l">الفترة:</span>${periodLabel}</div>
</div>
${itemsHTML}
<div class="sigs">
  ${["السائق","مشرف الحركة","المحاسب","رئيس الحسابات"].map(s => `
  <div class="sig-box"><div class="sig-name">${s}</div><div class="sig-line"></div></div>`).join("")}
</div>
<div style="text-align:center;font-size:10px;color:#9ca3af;margin-top:14px">أعيد طباعة هذا الكشف من سجل عهدة الحركة — ${new Date().toLocaleDateString("ar-SA")}</div>
</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  const exportExcel = async () => {
    const r = await fetch("/api/drivers/export-excel");
    if (!r.ok) { alert("فشل التصدير"); return; }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "السائقين.xlsx";
    a.click();
  };

  const importExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/drivers/import-excel", { method: "POST", body: fd });
    const d = await r.json() as { added: number; updated: number; total: number };
    setImporting(false);
    e.target.value = "";
    alert(`تم الاستيراد ✅\nمضاف: ${d.added}  ·  محدَّث: ${d.updated}`);
    load();
  };

  const filtered = drivers.filter(d => {
    const matchSt = filterStatus === "الكل" || d.status === filterStatus;
    const q = search.toLowerCase();
    return matchSt && (!q || d.driver_name.toLowerCase().includes(q) || (d.phone||"").includes(q));
  });

  // Rank map: based on full sorted drivers list (already sorted by revenue DESC from API)
  const revenueRankMap = new Map<number, number>();
  let rankCounter = 0;
  for (const d of drivers) {
    if ((d.total_revenue ?? 0) > 0) {
      rankCounter++;
      revenueRankMap.set(d.id, rankCounter);
    }
  }

  const linkedCount = drivers.filter(d => d.user_id).length;
  const kpis = [
    { label: "إجمالي السائقين",  val: stats?.total ?? 0,  icon: "👥", color: S,         border: S },
    { label: "السائقون النشطون", val: stats?.active ?? 0, icon: "✅", color: "#16a34a",  border: "#16a34a" },
    { label: "في رحلة الآن",    val: stats?.onTrip ?? 0, icon: "🚛", color: "#ea580c",  border: "#ea580c" },
    { label: "مرتبطون بحساب",   val: linkedCount,         icon: "🔗", color: P,          border: P },
  ];

  return (
    <div dir="rtl" style={{ backgroundColor: BG }} className="min-h-screen p-6 space-y-6">

      {/* ── Header ── */}
      <div className="bg-white rounded-xl shadow-sm px-6 py-4 flex items-center justify-between flex-wrap gap-3"
           style={{ borderBottom: `3px solid ${S}` }}>
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: P }}>أسطول السائقين</h1>
          <p className="text-sm mt-0.5" style={{ color: S }}>
            {drivers.length} سائق مسجّل · {linkedCount} مرتبط بحساب
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {/* Import Excel */}
          <button onClick={() => importRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
            <Upload size={14} className="text-green-600" />
            {importing ? "جاري الاستيراد..." : "استيراد Excel"}
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />

          {/* Export Excel */}
          <button onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50">
            <Download size={14} className="text-blue-600" />تصدير Excel
          </button>

          {/* Add driver */}
          <button onClick={() => setModal({ open: true, d: { ...EMPTY } })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: P }}>
            <Plus size={14} />إضافة سائق
          </button>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1.5 w-fit">
        {([
          { key: "drivers",     label: "👥 السائقون" },
          { key: "custody",     label: "📋 عهدة الحركة" },
          { key: "settlements", label: "💰 التسويات الإجمالية" },
        ] as { key: "drivers" | "custody" | "settlements"; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === t.key ? "text-white shadow" : "text-gray-500 hover:text-gray-700"}`}
            style={activeTab === t.key ? { backgroundColor: P } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "drivers" && (<>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow"
               style={{ borderBottom: `4px solid ${k.border}` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-500">{k.label}</span>
              <div className="text-2xl p-2 rounded-lg" style={{ backgroundColor: k.border + "15" }}>{k.icon}</div>
            </div>
            <div className="text-3xl font-extrabold" style={{ color: P }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* ── Ghost Drivers Section ── */}
      {ghostDrivers.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-amber-200">
          <div className="px-5 py-4 border-b border-amber-100 flex items-center justify-between flex-wrap gap-2"
               style={{ backgroundColor: "#fffbeb" }}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              <h3 className="text-base font-extrabold text-amber-800">
                سائقون غير مسجلين في الإدارة
              </h3>
              <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                {ghostDrivers.length}
              </span>
            </div>
            <p className="text-xs text-amber-600">
              هؤلاء ظهروا في الرحلات أو الطلبات أو سجل الأعطال — يمكنك تسجيلهم أو ربطهم كاسم مستعار لسائق موجود
            </p>
          </div>

          <div className="divide-y divide-amber-50">
            {ghostDrivers.map(g => (
              <div key={g.name} className="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-amber-50/40 transition-colors">
                {/* Name + indicator */}
                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                  <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-amber-600 font-extrabold text-xs">{g.name[0]}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                      {g.name}
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded border border-amber-200">
                        غير مسجل
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex gap-2">
                      {g.in_trips > 0   && <span>🚛 {g.in_trips} رحلة</span>}
                      {g.in_orders > 0  && <span>📦 {g.in_orders} طلب</span>}
                      {g.in_breakdowns > 0 && <span>🔧 {g.in_breakdowns} عطل</span>}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Register as new driver */}
                  <button onClick={() => registerGhost(g.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
                    style={{ backgroundColor: P }}>
                    <UserPlus size={12} />تسجيل كسائق جديد
                  </button>

                  {/* Link as alias */}
                  {ghostLink?.name === g.name ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <select value={ghostLink.targetDriverId}
                          onChange={e => setGhostLink({ ...ghostLink, targetDriverId: e.target.value })}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 bg-white min-w-[160px]">
                          <option value="">— اختر السائق الأصلي —</option>
                          {drivers.map(d => (
                            <option key={d.id} value={String(d.id)}>{d.driver_name}</option>
                          ))}
                        </select>
                        <button onClick={linkGhostAlias} disabled={!ghostLink.targetDriverId || ghostLinking}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                          <Save size={11} />{ghostLinking ? "..." : "ربط"}
                        </button>
                        <button onClick={() => setGhostLink(null)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                          <X size={13} className="text-gray-400" />
                        </button>
                      </div>
                      {/* Rename records checkbox */}
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ghostLink.renameRecords}
                          onChange={e => setGhostLink({ ...ghostLink, renameRecords: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-gray-600">
                          تحديث الاسم في الطلبات والرحلات والأعطال بالاسم الأصلي
                        </span>
                      </label>
                    </div>
                  ) : (
                    <button onClick={() => setGhostLink({ name: g.name, targetDriverId: "", renameRecords: false })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 bg-white transition-colors">
                      <GitMerge size={12} />ربط باسم مستعار
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h3 className="text-base font-extrabold" style={{ color: P, borderRight: `4px solid ${S}`, paddingRight: "10px" }}>
            قائمة السائقين
          </h3>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
                className="border border-gray-200 rounded-lg pr-8 pl-3 py-1.5 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": S } as React.CSSProperties} />
            </div>
            {["الكل", ...STATUS_OPTIONS].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${filterStatus === s ? "text-white" : "bg-white text-gray-500 border-gray-200"}`}
                style={filterStatus === s ? { backgroundColor: S, borderColor: S } : {}}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-9 h-9 border-4 border-t-transparent rounded-full animate-spin"
                 style={{ borderColor: `${S} transparent ${S} ${S}` }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <div className="text-5xl mb-3">🚛</div>
            <p className="font-medium">لا يوجد سائقون بعد</p>
            <button onClick={() => setModal({ open: true, d: { ...EMPTY } })}
              className="mt-4 px-5 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: S }}>
              إضافة سائق جديد
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: P + "08" }}>
                <tr>
                  {["اسم السائق", "الجوال", "الراتب", "الحساب", "الوثائق", "الحالة", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-bold" style={{ color: P }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/60 transition-colors">
                    {/* Name + photo + revenue rank */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 border border-gray-100">
                          {d.photo_url
                            ? <img src={d.photo_url} alt={d.driver_name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-white text-xs font-extrabold"
                                   style={{ backgroundColor: P }}>{d.driver_name[0]}</div>}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-gray-800 truncate">{d.driver_name}</span>
                            {(() => {
                              const rank = revenueRankMap.get(d.id);
                              if (!rank) return null;
                              const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
                              if (medal) return <span className="text-base leading-none" title={`الترتيب #${rank} في الإيراد`}>{medal}</span>;
                              return (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
                                      title="الترتيب في الإيراد">
                                  #{rank}
                                </span>
                              );
                            })()}
                          </div>
                          {(d.total_revenue ?? 0) > 0 && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {(d.total_revenue! / 1000).toFixed(0)}k ر.س · {d.trips_count} رحلة
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Phone */}
                    <td className="px-4 py-3">
                      {d.phone
                        ? <a href={`tel:${d.phone}`} className="flex items-center gap-1 text-xs" style={{ color: S }}>
                            <Phone size={12} />{d.phone}
                          </a>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    {/* Salary */}
                    <td className="px-4 py-3">
                      {(d.salary ?? 0) > 0
                        ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {(d.salary!).toLocaleString("ar-SA")} ر.س
                          </span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    {/* Linked account */}
                    <td className="px-4 py-3">
                      {d.user_id
                        ? <div className="flex items-center gap-1.5">
                            <UserCheck size={13} className="text-green-600 flex-shrink-0" />
                            <div>
                              <div className="text-xs font-semibold text-green-700">{d.user_name}</div>
                              <div className="text-xs text-gray-400">{d.user_phone_account}</div>
                            </div>
                          </div>
                        : <span className="text-xs text-gray-300 flex items-center gap-1"><UserX size={12} />غير مرتبط</span>}
                    </td>
                    {/* Documents with expiry */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {d.license_url && (
                          <div className="flex items-center gap-1">
                            <a href={d.license_url} target="_blank" rel="noreferrer"
                              title={`فتح الرخصة${isPdfUrl(d.license_url) ? " (PDF)" : ""}`}
                              className="w-5 h-5 rounded flex items-center justify-center text-white flex-shrink-0 hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: "#16a34a" }}>
                              <FileText size={10} />
                            </a>
                            <ExpiryBadge date={d.license_expiry} />
                          </div>
                        )}
                        {d.operation_card_url && (
                          <div className="flex items-center gap-1">
                            <a href={d.operation_card_url} target="_blank" rel="noreferrer"
                              title={`فتح بطاقة التشغيل${isPdfUrl(d.operation_card_url) ? " (PDF)" : ""}`}
                              className="w-5 h-5 rounded flex items-center justify-center text-white flex-shrink-0 hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: S }}>
                              <Shield size={10} />
                            </a>
                            <ExpiryBadge date={d.operation_card_expiry} />
                          </div>
                        )}
                        {(d.iqama_image_url || d.iqama_pdf_url) && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-500">الإقامة</span>
                            {d.iqama_image_url && (
                              <a href={d.iqama_image_url} target="_blank" rel="noreferrer" title="فتح صورة الإقامة"
                                className="w-5 h-5 rounded flex items-center justify-center text-white flex-shrink-0 hover:opacity-80"
                                style={{ backgroundColor: "#4f46e5" }}><FileText size={10} /></a>
                            )}
                            {d.iqama_pdf_url && (
                              <a href={d.iqama_pdf_url} target="_blank" rel="noreferrer" title="فتح PDF الإقامة"
                                className="w-5 h-5 rounded flex items-center justify-center text-white flex-shrink-0 hover:opacity-80"
                                style={{ backgroundColor: "#dc2626" }}><FileText size={10} /></a>
                            )}
                            <ExpiryBadge date={d.iqama_expiry} />
                          </div>
                        )}
                        {(d.delegated_form_image_url || d.delegated_form_pdf_url) && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-500">الاستمارة المفوضة</span>
                            {d.delegated_form_image_url && (
                              <a href={d.delegated_form_image_url} target="_blank" rel="noreferrer" title="فتح صورة الاستمارة المفوضة"
                                className="w-5 h-5 rounded flex items-center justify-center text-white flex-shrink-0 hover:opacity-80"
                                style={{ backgroundColor: "#7c3aed" }}><FileText size={10} /></a>
                            )}
                            {d.delegated_form_pdf_url && (
                              <a href={d.delegated_form_pdf_url} target="_blank" rel="noreferrer" title="فتح PDF الاستمارة المفوضة"
                                className="w-5 h-5 rounded flex items-center justify-center text-white flex-shrink-0 hover:opacity-80"
                                style={{ backgroundColor: "#dc2626" }}><FileText size={10} /></a>
                            )}
                            <ExpiryBadge date={d.delegated_form_expiry} />
                          </div>
                        )}
                        {!d.license_url && !d.operation_card_url && !d.driver_card_url && !d.insurance_url &&
                          !d.iqama_image_url && !d.iqama_pdf_url && !d.delegated_form_image_url && !d.delegated_form_pdf_url && (
                          <span className="text-gray-300 text-xs">لا وثائق</span>
                        )}
                      </div>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_STYLE[d.status || "نشط"] || STATUS_STYLE["نشط"]}`}>
                        {d.status || "نشط"}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setStmtDriver(d)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors" title="كشف الحساب">
                          <BookOpen size={13} className="text-blue-400" />
                        </button>
                        <button onClick={() => {
                          setModal({ open: true, d: { ...d } });
                        }} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="تعديل">
                          <Edit2 size={13} className="text-gray-400" />
                        </button>
                        <button onClick={() => del(d.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="حذف">
                          <Trash2 size={13} className="text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </>)} {/* end activeTab === "drivers" */}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── تاب عهدة الحركة ────────────────────────────────────────────────── */}
      {activeTab === "custody" && (() => {
        const sarC = (v: number) => v.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
        const totalCustody = custodySummary?.total_custody ?? 0;
        const unprintedRecs = custodyRecs.filter(r => !Number(r.is_custody_printed));
        const archivedRecs = custodyRecs.filter(r => Number(r.is_custody_printed));
        const visibleRecs = custodyView === "unprinted" ? unprintedRecs : archivedRecs;
        const selCount = unprintedRecs.filter(r => custodySel.has(r.id)).length;
        const allIds = unprintedRecs.map(r => r.id);
        const allSelected = allIds.length > 0 && allIds.every(id => custodySel.has(id));
        const toggleAll = () => {
          if (allSelected) setCustodySel(new Set());
          else setCustodySel(new Set(allIds));
        };
        return (
          <div className="space-y-5">
            {/* ── Summary tiles ── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl shadow-sm p-5" style={{ borderBottom: `4px solid ${S}` }}>
                <p className="text-sm font-semibold text-gray-500 mb-1">إجمالي العهدة</p>
                <p className="text-3xl font-extrabold" style={{ color: P }}>{sarC(totalCustody)}</p>
                <p className="text-xs text-gray-400 mt-1">{custodyRecs.length} سجل عهدة</p>
              </div>
              <button
                onClick={() => setShowBreakdown(true)}
                className="bg-white rounded-2xl shadow-sm p-5 text-right hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-teal-200"
                style={{ borderBottom: `4px solid #0eb5cb` }}>
                <p className="text-sm font-semibold text-gray-500 mb-1">إجمالي الذي عليهم للسائقين</p>
                <p className="text-3xl font-extrabold" style={{ color: S }}>{sarC(totalCustody)}</p>
                <p className="text-xs text-teal-500 mt-1">اضغط لعرض التفاصيل بالسائق</p>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setCustodyView("unprinted"); setCustodySel(new Set()); }}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${custodyView === "unprinted" ? "bg-blue-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                غير مطبوعة ({unprintedRecs.length})
              </button>
              <button
                onClick={() => { setCustodyView("archive"); setCustodySel(new Set()); }}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${custodyView === "archive" ? "bg-blue-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                المطبوعة ({archivedRecs.length})
              </button>
            </div>

            {/* ── Controls bar ── */}
            <div className="bg-white rounded-xl shadow-sm px-5 py-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-gray-600">فترة:</span>
              <input type="date" value={custodyDateFrom} onChange={e => setCustodyDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
              <span className="text-gray-400">—</span>
              <input type="date" value={custodyDateTo} onChange={e => setCustodyDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
              {(custodyDateFrom || custodyDateTo) && (
                <button onClick={() => { setCustodyDateFrom(""); setCustodyDateTo(""); }}
                  className="text-xs text-red-400 hover:text-red-600">× مسح الفلتر</button>
              )}
              <div className="flex-1" />
              {custodyView === "unprinted" && selCount > 0 && (
                <button onClick={() => void printCustodySelected()}
                  disabled={printingCustody}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: P }}>
                  <Printer size={14} />طباعة المحدد ({selCount})
                </button>
              )}
              {custodyView === "unprinted" && (
                <button onClick={() => void printCustodySelected(unprintedRecs)}
                  disabled={printingCustody || unprintedRecs.length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: S }}>
                  <Printer size={14} />طباعة جميع غير المطبوعة ({unprintedRecs.length})
                </button>
              )}
              <button onClick={loadCustody} disabled={custodyLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                <RefreshCw size={13} className={custodyLoading ? "animate-spin" : ""} />تحديث
              </button>
            </div>

            {/* ── Records table ── */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {custodyLoading ? (
                <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
              ) : visibleRecs.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="font-semibold">
                    {custodyRecs.length === 0
                      ? "لا توجد سجلات عهدة حركة بعد"
                      : custodyView === "unprinted" ? "لا توجد كشوفات غير مطبوعة" : "لا توجد كشوفات مطبوعة"}
                  </p>
                  {custodyRecs.length === 0 && <p className="text-sm mt-1">ستظهر هنا تلقائياً عند طباعة كشف حساب سائق</p>}
                </div>
              ) : (
                <table className="w-full text-sm text-right">
                  <thead>
                    <tr className="text-white text-xs" style={{ backgroundColor: P }}>
                      {custodyView === "unprinted" && <th className="px-4 py-3">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll}
                          className="w-4 h-4 rounded accent-white" aria-label="تحديد جميع الكشوف غير المطبوعة" />
                      </th>}
                      <th className="px-4 py-3">تاريخ الطباعة</th>
                      <th className="px-4 py-3">رقم الكشف</th>
                      <th className="px-4 py-3">السائق</th>
                      <th className="px-4 py-3">رقم السيارة</th>
                      <th className="px-4 py-3">فترة الكشف</th>
                      <th className="px-4 py-3">نوع الحمولات</th>
                      <th className="px-4 py-3">الصافي</th>
                      <th className="px-4 py-3">حالة العهدة</th>
                      <th className="px-4 py-3">توقيع السائق</th>
                      <th className="px-4 py-3">تفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleRecs.map(r => {
                      const isSelected = custodySel.has(r.id);
                      return (
                        <tr key={r.id}
                          className={`transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-gray-50/60"}`}>
                          {custodyView === "unprinted" && <td className="px-4 py-3">
                            <input type="checkbox" checked={isSelected}
                              onChange={() => {
                                const next = new Set(custodySel);
                                if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                                setCustodySel(next);
                              }}
                              className="w-4 h-4 rounded" />
                          </td>}
                          <td className="px-4 py-3 text-gray-600">{r.print_date}</td>
                          <td className="px-4 py-3">
                            {editingRef?.id === r.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  value={editingRef.val}
                                  onChange={e => setEditingRef({ id: r.id, val: e.target.value })}
                                  className="font-mono text-xs border border-blue-300 rounded px-1.5 py-0.5 w-24 focus:outline-none focus:ring-1"
                                  onKeyDown={e => { if (e.key === "Enter") saveRef(); if (e.key === "Escape") setEditingRef(null); }}
                                  autoFocus
                                />
                                <button onClick={saveRef} disabled={savingRef}
                                  className="text-green-600 hover:text-green-800 disabled:opacity-50" title="حفظ">
                                  <CheckCircle size={13} />
                                </button>
                                <button onClick={() => setEditingRef(null)}
                                  className="text-gray-400 hover:text-gray-600" title="إلغاء">
                                  <X size={12} />
                                </button>
                              </div>
                            ) : r.has_print_snapshot ? (
                              <span
                                className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded font-bold text-gray-700"
                                title="رقم الكشف ثابت بعد حفظ نسخة الطباعة"
                              >
                                {r.filter_ref || "—"}
                              </span>
                            ) : (
                              <button
                                onClick={() => setEditingRef({ id: r.id, val: r.filter_ref || "" })}
                                className="font-mono text-xs bg-gray-100 hover:bg-blue-50 px-2 py-0.5 rounded font-bold text-gray-700 hover:text-blue-700 transition-colors"
                                title="انقر لتعديل رقم الكشف"
                              >
                                {r.filter_ref || "—"}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-800">{r.driver_name || r.driver_phone}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.vehicle_plate || "—"}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {r.date_from ? `${r.date_from}${r.date_to ? " — " + r.date_to : ""}` : "كامل"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">{r.load_types || "—"}</td>
                          <td className="px-4 py-3 font-bold" style={{ color: P }}>{sarC(r.net_amount)}</td>
                          <td className="px-4 py-3">
                            {Number(r.is_custody_printed)
                              ? <span className="inline-flex items-center gap-1 text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                  <CheckCircle size={10} />مطبوع
                                </span>
                              : <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">غير مطبوع</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            {custodyView === "unprinted" ? (
                              <label className="flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={Number(r.include_driver_signatures ?? 1) === 1}
                                  disabled={savingSignatureForId === r.id || printingCustody}
                                  onChange={e => void saveCustodySignaturePreference(r, e.target.checked)}
                                  className="w-4 h-4 rounded"
                                />
                                إظهار التوقيع
                              </label>
                            ) : (
                              <span className={`text-xs font-semibold ${Number(r.include_driver_signatures ?? 1) === 1 ? "text-green-700" : "text-gray-400"}`}>
                                {Number(r.include_driver_signatures ?? 1) === 1 ? "مضمن" : "مخفي"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <button onClick={() => setCustodyDetail(r)}
                                className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors" title="عرض البنود">
                                <BookOpen size={13} className="text-blue-500" />
                              </button>
                              {r.items_snapshot && (
                                <button onClick={() => printFromCustody(r)}
                                  className="p-1.5 rounded-lg hover:bg-purple-50 transition-colors" title="إعادة طباعة الكشف">
                                  <Printer size={13} className="text-purple-500" />
                                </button>
                              )}
                              {(Number(r.is_custody_printed) || Number(r.is_cancelled) || isSelected) && (
                                <button onClick={() => void unprintCustodyRec(r)}
                                  disabled={unprintingCustodyId === r.id || printingCustody}
                                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                                  title={Number(r.is_custody_printed) || Number(r.is_cancelled)
                                    ? "إلغاء الطباعة وإرجاعه لغير مطبوع"
                                    : "إزالة من تحديد الطباعة"}>
                                  <X size={13} className="text-red-500" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── تاب التسويات الإجمالية ─────────────────────────────────────────── */}
      {activeTab === "settlements" && (() => {
        const sar = (value: number) => `${Math.abs(value || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
        const toAmount = (value: string) => {
          const amount = Number(value);
          return Number.isFinite(amount) && amount >= 0 ? amount : 0;
        };
        const cashAmount = toAmount(dashboardDraft.cash_amount);
        const companyCustodyAmount = toAmount(dashboardDraft.company_custody_amount);
        const remainingAmount = cashAmount + companyCustodyAmount - statementSummary.total_remaining_for_drivers;
        const balancesByDriver = new Map(statementSummary.per_driver.map(row => [row.driver_phone, Number(row.balance) || 0]));
        return (
          <div className="space-y-5">
            {settlementDashboardError ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                <span className="font-bold">تعذر تحميل أرقام لوحة التسويات: {settlementDashboardError}</span>
                <button type="button" onClick={loadLedger} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold hover:bg-red-100">
                  إعادة المحاولة
                </button>
              </div>
            ) : !settlementDashboardLoaded ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white py-10 text-sm text-gray-400">
                <RefreshCw size={17} className="animate-spin" />جاري تحميل ملخص التسويات...
              </div>
            ) : (
            <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
                <p className="text-xs font-bold text-emerald-700">إجمالي المستحق للسائقين من الكشوف</p>
                <p className="mt-1 text-xl font-black text-emerald-700">{sar(statementSummary.total_custody_due)}</p>
                <p className="mt-1 text-[11px] text-emerald-600">كشوف عهدة الحركة المطبوعة فقط</p>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4 shadow-sm">
                <p className="text-xs font-bold text-red-700">إجمالي المبالغ على السائقين</p>
                <p className="mt-1 text-xl font-black text-red-700">{sar(statementSummary.total_on_drivers)}</p>
                <p className="mt-1 text-[11px] text-red-600">أرصدة السائقين التي أصبحت عليهم</p>
              </div>
              <div className={`rounded-2xl border p-4 shadow-sm ${remainingAmount >= 0 ? "border-blue-100 bg-blue-50" : "border-amber-100 bg-amber-50"}`}>
                <p className={`text-xs font-bold ${remainingAmount >= 0 ? "text-blue-700" : "text-amber-700"}`}>الباقي</p>
                <p className={`mt-1 text-xl font-black ${remainingAmount >= 0 ? "text-blue-700" : "text-amber-700"}`}>{sar(remainingAmount)}</p>
                <p className="mt-1 text-[11px] text-gray-500">الكاش + عهدة الشركة − المتبقي للسائقين</p>
              </div>
              {[
                { key: "cash_amount" as const, label: "المبالغ الكاش", color: "border-violet-100 bg-violet-50 text-violet-700" },
                { key: "company_custody_amount" as const, label: "العهدة في الشركة", color: "border-cyan-100 bg-cyan-50 text-cyan-700" },
                { key: "rentals_amount" as const, label: "إجمالي الإيجارات", color: "border-orange-100 bg-orange-50 text-orange-700" },
              ].map(card => (
                <div key={card.key} className={`rounded-2xl border p-4 shadow-sm ${card.color}`}>
                  <label className="block text-xs font-bold">{card.label}</label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={dashboardDraft[card.key]}
                      onChange={event => setDashboardDraft(current => ({ ...current, [card.key]: event.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border border-white/80 bg-white px-3 py-2 text-sm font-black text-gray-800 outline-none focus:border-[#103c68]"
                      aria-label={card.label}
                    />
                    <span className="text-xs font-bold opacity-75">ر.س</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveDashboardSettings}
                disabled={savingDashboard}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: P }}
              >
                <Save size={14} />
                {savingDashboard ? "جاري الحفظ..." : "حفظ مبالغ الكاش والعهدة والإيجارات"}
              </button>
            </div>
            </>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between bg-white rounded-xl shadow-sm px-5 py-3">
              <p className="text-sm font-bold text-gray-600">كشف حساب كل سائق من كشوف عهدة الحركة المطبوعة</p>
              <button onClick={loadLedger} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors">
                <RefreshCw size={13} className={ledgerLoading ? "animate-spin" : ""} />تحديث
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {ledgerLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                  <RefreshCw size={18} className="animate-spin" />جاري التحميل...
                </div>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="text-xs text-white" style={{ backgroundColor: P }}>
                      {["السائق","السيارة","الحالة","له / عليه","آخر تسوية","إجراء"].map(h => (
                        <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ledgerRows.map(row => {
                      const statementBalance = balancesByDriver.get(row.phone) || 0;
                      return (
                        <tr key={row.phone} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-800">
                            <button
                              type="button"
                              onClick={() => setStatementDriver(row)}
                              className="text-right hover:text-[#103c68] hover:underline"
                            >
                              {row.driver_name}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.vehicle_plate || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[row.status] || STATUS_STYLE["نشط"]}`}>
                              {row.status || "نشط"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {!settlementDashboardLoaded ? (
                              <span className="text-xs font-semibold text-red-500">تعذر تحميل الرصيد</span>
                            ) : statementBalance === 0 ? (
                              <span className="text-xs font-semibold text-gray-400">لا يوجد رصيد</span>
                            ) : (
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${statementBalance > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                                {sar(statementBalance)} {statementBalance > 0 ? "له" : "عليه"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {row.lastSettlement
                              ? <span title={row.lastSettlement.notes || ""}>{new Date(row.lastSettlement.created_at).toLocaleDateString("ar-SA")}</span>
                              : "—"
                            }
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => setStatementDriver(row)}
                                className="rounded-lg border border-[#103c68] px-3 py-1.5 text-xs font-bold text-[#103c68] transition-colors hover:bg-blue-50"
                              >
                                كشف الحساب
                              </button>
                              <button
                                type="button"
                                onClick={() => { setPayModal(row); setPayForm({ amount: "", notes: "", settlement_date: new Date().toISOString().slice(0, 10), type: "دفع" }); }}
                                className="rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors"
                                style={{ backgroundColor: P }}>
                                دفع / خصم
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {ledgerRows.length === 0 && !ledgerLoading && (
                      <tr><td colSpan={6} className="text-center py-12 text-gray-400">لا توجد بيانات</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── تفاصيل سجل العهدة (مودال) ── */}
      {custodyDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
             onClick={() => setCustodyDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 rounded-t-2xl sticky top-0"
                 style={{ backgroundColor: P }}>
              <div>
                <p className="font-extrabold text-white">{custodyDetail.filter_ref}</p>
                <p className="text-xs text-white/70">{custodyDetail.driver_name} · {custodyDetail.vehicle_plate}</p>
              </div>
              <button onClick={() => setCustodyDetail(null)} className="text-white/80 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">تاريخ الطباعة:</span>
                <span className="font-semibold">{custodyDetail.print_date}</span>
              </div>
              {custodyDetail.date_from && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">فترة الكشف:</span>
                  <span className="font-semibold">{custodyDetail.date_from} — {custodyDetail.date_to || ""}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">نوع الحمولات:</span>
                <span className="font-semibold">{custodyDetail.load_types || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">عدد البنود:</span>
                <span className="font-semibold">{custodyDetail.item_count}</span>
              </div>
              {custodyDetail.items_snapshot && (() => {
                try {
                  const items = JSON.parse(custodyDetail.items_snapshot) as { date: string; kind: string; label: string; sub: string; amount: number; sign: number }[];
                  return (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-bold text-gray-500 mb-2">البنود المطبوعة:</p>
                      <div className="space-y-1.5">
                        {items.map((it, i) => (
                          <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                            <div>
                              <p className="font-semibold text-gray-700">{it.label}</p>
                              {it.sub && <p className="text-gray-400">{it.sub}</p>}
                            </div>
                            <span className={`font-bold ${it.sign === 1 ? "text-green-600" : "text-red-500"}`}>
                              {it.sign === -1 ? "−" : "+"}{it.amount.toLocaleString("ar-SA")} ر.س
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
              <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                <span className="font-bold text-gray-700">الصافي للسائق</span>
                <span className="text-xl font-extrabold" style={{ color: P }}>
                  {custodyDetail.net_amount.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال تفصيل السائقين (إجمالي الذي عليهم) ── */}
      {showBreakdown && custodySummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
             onClick={() => setShowBreakdown(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 rounded-t-2xl sticky top-0"
                 style={{ backgroundColor: S }}>
              <p className="font-extrabold text-white">إجمالي الذي عليهم — بالسائق</p>
              <button onClick={() => setShowBreakdown(false)} className="text-white/80 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4">
              {custodySummary.per_driver.length === 0 ? (
                <p className="text-center text-gray-400 py-8">لا توجد بيانات</p>
              ) : (
                <table className="w-full text-sm text-right">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="pb-2 font-semibold">السائق</th>
                      <th className="pb-2 font-semibold">السيارة</th>
                      <th className="pb-2 font-semibold">كشوفات</th>
                      <th className="pb-2 font-semibold">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {custodySummary.per_driver.map(d => (
                      <tr key={d.driver_phone} className="hover:bg-gray-50">
                        <td className="py-2.5 font-semibold text-gray-800">{d.driver_name || d.driver_phone}</td>
                        <td className="py-2.5 font-mono text-xs text-gray-500">{d.vehicle_plate || "—"}</td>
                        <td className="py-2.5 text-center text-gray-500">{d.record_count}</td>
                        <td className="py-2.5 font-bold" style={{ color: P }}>
                          {d.total_amount.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td colSpan={3} className="pt-2.5 font-bold text-gray-700">الإجمالي الكلي</td>
                      <td className="pt-2.5 font-extrabold text-lg" style={{ color: P }}>
                        {custodySummary.total_custody.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Driver Statement Modal ── */}
      {stmtDriver && <DriverStatementModal driver={stmtDriver as { phone?: string; driver_name?: string; vehicle_plate?: string; status?: string; user_name?: string }} onClose={() => setStmtDriver(null)} />}

      {/* ── Add / Edit Modal ── */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
             onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 rounded-t-2xl sticky top-0 z-10"
                 style={{ backgroundColor: P }}>
              <h2 className="font-extrabold text-white text-lg flex items-center gap-2">
                <Truck size={18} />{modal.d.id ? "تعديل بيانات السائق" : "إضافة سائق جديد"}
              </h2>
              <button onClick={closeModal} className="text-white/80 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* ── صورة السائق ── */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2 flex items-center gap-1.5">
                  <Camera size={12} />صورة السائق الشخصية
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0 bg-gray-50">
                    {modal.d.photo_url
                      ? <img src={modal.d.photo_url} alt="صورة السائق" className="w-full h-full object-cover" />
                      : <User size={32} className="text-gray-300" />}
                  </div>
                  <div className="flex-1">
                    <ImgUploadField label="" value={undefined} uploading={uploading.photo}
                      onFile={mkUpload("photo")} icon={null} />
                    {uploading.photo && <p className="text-xs text-blue-500 mt-1 animate-pulse">جاري الرفع...</p>}
                    {modal.d.photo_url && (
                      <button onClick={() => setModal(m => ({ ...m, d: { ...m.d, photo_url: undefined } }))}
                        className="text-xs text-red-400 hover:text-red-600 mt-1">
                        × حذف الصورة
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ── البيانات الأساسية ── */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-3">البيانات الأساسية</label>
                <div className="grid grid-cols-2 gap-4">
                  {([
                    ["اسم السائق *", "driver_name", "text",   "col-span-2"],
                    ["رقم الجوال",   "phone",       "text",   ""],
                    ["الراتب (ريال)","salary",      "number", ""],
                    ["البريد الإلكتروني", "email",  "email",  "col-span-2"],
                  ] as [string, keyof Driver, string, string][]).map(([lbl, k, t, cls]) => (
                    <div key={String(k)} className={cls}>
                      <label className="text-xs font-semibold text-gray-600 block mb-1.5">{lbl}</label>
                      <input type={t} value={String(modal.d[k] ?? "")}
                        onChange={e => setModal(m => ({ ...m, d: { ...m.d, [k]: e.target.value } }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": S } as React.CSSProperties} />
                    </div>
                  ))}

                  {/* الحالة */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">الحالة</label>
                    <select value={modal.d.status ?? "نشط"}
                      onChange={e => setModal(m => ({ ...m, d: { ...m.d, status: e.target.value } }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white">
                      {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  {/* ربط بحساب */}
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5 flex items-center gap-1.5">
                      <LinkIcon size={12} />ربط بحساب مستخدم (اختياري)
                    </label>
                    <select value={String(modal.d.user_id ?? "")}
                      onChange={e => setModal(m => ({ ...m, d: { ...m.d, user_id: e.target.value ? parseInt(e.target.value) : null } }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white">
                      <option value="">— بدون ربط —</option>
                      {userAccounts.map(u => <option key={u.id} value={u.id}>{u.name} ({u.phone})</option>)}
                    </select>
                    {modal.d.user_id && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <UserCheck size={11} />سيتمكن هذا السائق من تتبع طلباته عبر حسابه
                      </p>
                    )}
                  </div>

                  {/* ملاحظات */}
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">ملاحظات</label>
                    <textarea value={modal.d.notes ?? ""} rows={2}
                      onChange={e => setModal(m => ({ ...m, d: { ...m.d, notes: e.target.value } }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none" />
                  </div>
                </div>
              </div>

              {/* ── البصمة والتوقيع ── */}
              <div className="border-t border-gray-100 pt-4">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-3 flex items-center gap-1.5">
                  <User size={12} />البصمة والتوقيع
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {/* صورة البصمة */}
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                      <span className="text-base leading-none">🖐</span>صورة البصمة
                    </p>
                    {modal.d.fingerprint_url && !uploading.fingerprint && (
                      <div className="mb-2 relative group">
                        <img
                          src={modal.d.fingerprint_url}
                          alt="البصمة"
                          className="w-full h-24 object-contain rounded-lg border border-gray-200 bg-white"
                        />
                        <button
                          onClick={() => setModal(m => ({ ...m, d: { ...m.d, fingerprint_url: undefined } }))}
                          className="absolute top-1 left-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          title="حذف البصمة"
                        >×</button>
                      </div>
                    )}
                    <ImgUploadField
                      label={modal.d.fingerprint_url ? "تغيير البصمة" : "رفع صورة البصمة"}
                      value={undefined}
                      uploading={uploading.fingerprint}
                      onFile={mkUpload("fingerprint")}
                      icon={null}
                    />
                  </div>

                  {/* صورة التوقيع */}
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                      <span className="text-base leading-none">✍️</span>صورة التوقيع
                    </p>
                    {modal.d.signature_url && !uploading.signature && (
                      <div className="mb-2 relative group">
                        <img
                          src={modal.d.signature_url}
                          alt="التوقيع"
                          className="w-full h-24 object-contain rounded-lg border border-gray-200 bg-white"
                        />
                        <button
                          onClick={() => setModal(m => ({ ...m, d: { ...m.d, signature_url: undefined } }))}
                          className="absolute top-1 left-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          title="حذف التوقيع"
                        >×</button>
                      </div>
                    )}
                    <ImgUploadField
                      label={modal.d.signature_url ? "تغيير التوقيع" : "رفع صورة التوقيع"}
                      value={undefined}
                      uploading={uploading.signature}
                      onFile={mkUpload("signature")}
                      icon={null}
                    />
                  </div>
                </div>
              </div>

              {/* ── الوثائق ── */}
              <div className="border-t border-gray-100 pt-4">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-3 flex items-center gap-1.5">
                  <FileText size={12} />الوثائق الرسمية
                </label>

                <OfficialDriverDocumentCard
                  title="الإقامة"
                  icon={<Shield size={12} className="text-indigo-600" />}
                  imageValue={modal.d.iqama_image_url}
                  pdfValue={modal.d.iqama_pdf_url}
                  expiry={modal.d.iqama_expiry}
                  uploadingImage={uploading.iqamaImage}
                  uploadingPdf={uploading.iqamaPdf}
                  onImageFile={mkUpload("iqamaImage")}
                  onPdfFile={mkUpload("iqamaPdf")}
                  onExpiryChange={value => setModal(m => ({ ...m, d: { ...m.d, iqama_expiry: value } }))}
                />

                <OfficialDriverDocumentCard
                  title="الاستمارة المفوضة"
                  icon={<FileText size={12} className="text-purple-600" />}
                  imageValue={modal.d.delegated_form_image_url}
                  pdfValue={modal.d.delegated_form_pdf_url}
                  expiry={modal.d.delegated_form_expiry}
                  uploadingImage={uploading.delegatedFormImage}
                  uploadingPdf={uploading.delegatedFormPdf}
                  onImageFile={mkUpload("delegatedFormImage")}
                  onPdfFile={mkUpload("delegatedFormPdf")}
                  onExpiryChange={value => setModal(m => ({ ...m, d: { ...m.d, delegated_form_expiry: value } }))}
                />

                {/* رخصة القيادة */}
                <div className="bg-gray-50 rounded-xl p-4 mb-3">
                  <p className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <FileText size={12} className="text-green-600" />رخصة القيادة
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <ImgUploadField label="وثيقة الرخصة (صورة أو PDF)" value={modal.d.license_url}
                      uploading={uploading.license} onFile={mkUpload("license")}
                      icon={<FileText size={11} className="text-green-600" />} />
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1.5">تاريخ الانتهاء</label>
                      <input type="date" value={modal.d.license_expiry ?? ""}
                        onChange={e => setModal(m => ({ ...m, d: { ...m.d, license_expiry: e.target.value } }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": S } as React.CSSProperties} />
                      {modal.d.license_expiry && (
                        <div className="mt-2">
                          <ExpiryBadge date={modal.d.license_expiry} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* بطاقة التشغيل */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Shield size={12} className="text-blue-500" />بطاقة التشغيل
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <ImgUploadField label="وثيقة بطاقة التشغيل (صورة أو PDF)" value={modal.d.operation_card_url}
                      uploading={uploading.opCard} onFile={mkUpload("opCard")}
                      icon={<Shield size={11} className="text-blue-500" />} />
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1.5">تاريخ الانتهاء</label>
                      <input type="date" value={modal.d.operation_card_expiry ?? ""}
                        onChange={e => setModal(m => ({ ...m, d: { ...m.d, operation_card_expiry: e.target.value } }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": S } as React.CSSProperties} />
                      {modal.d.operation_card_expiry && (
                        <div className="mt-2">
                          <ExpiryBadge date={modal.d.operation_card_expiry} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 flex gap-3 sticky bottom-0 bg-white pt-3 border-t border-gray-100">
              <button onClick={closeModal}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
              {modal.d.id && modal.d.user_id && (
                <button onClick={() => linkUser(modal.d.id!, null)} disabled={linkingId === modal.d.id}
                  className="px-4 py-2.5 border border-red-200 rounded-xl text-sm text-red-600 hover:bg-red-50 flex items-center gap-1.5">
                  <UserX size={13} />إلغاء الربط
                </button>
              )}
              <button onClick={save} disabled={saving || !modal.d.driver_name}
                className="flex-1 py-2.5 rounded-xl text-sm font-extrabold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: P }}>
                <Save size={14} />{saving ? "جاري الحفظ..." : modal.d.id ? "تحديث" : "إضافة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال دفع / خصم للتسويات ── */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
             onClick={() => setPayModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 rounded-t-2xl"
                 style={{ backgroundColor: P }}>
              <div>
                <p className="font-extrabold text-white">دفع / خصم تسوية</p>
                <p className="text-xs text-white/70">{payModal.driver_name} · {payModal.vehicle_plate || ""}</p>
              </div>
              <button onClick={() => setPayModal(null)} className="text-white/80 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* الرصيد الحالي */}
              <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-gray-500 font-semibold">الرصيد الحالي للسائق</span>
                <span className={`text-xl font-extrabold ${payModal.balance >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {payModal.balance.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                </span>
              </div>
              {/* نوع العملية */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">نوع العملية</label>
                <div className="flex gap-2">
                  {(["دفع", "خصم"] as const).map(t => (
                    <button key={t} onClick={() => setPayForm(f => ({ ...f, type: t }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                        payForm.type === t
                          ? t === "دفع" ? "bg-green-50 border-green-500 text-green-700" : "bg-red-50 border-red-500 text-red-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}>
                      {t === "دفع" ? "💸 دفع للسائق" : "➖ خصم من الرصيد"}
                    </button>
                  ))}
                </div>
              </div>
              {/* المبلغ */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">المبلغ (ر.س)</label>
                <input type="number" min="0" step="0.01"
                  value={payForm.amount}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": P } as React.CSSProperties} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">تاريخ التسوية</label>
                <input type="date" required
                  value={payForm.settlement_date}
                  onChange={e => setPayForm(f => ({ ...f, settlement_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": P } as React.CSSProperties} />
              </div>
              {/* ملاحظات */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">ملاحظات (اختياري)</label>
                <input value={payForm.notes}
                  onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="سبب التسوية..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": P } as React.CSSProperties} />
              </div>
              {/* معاينة الرصيد الجديد */}
              {payForm.amount && !isNaN(parseFloat(payForm.amount)) && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm flex justify-between items-center">
                  <span className="text-gray-600 font-semibold">الرصيد بعد التسوية</span>
                  <span className="font-extrabold text-blue-700">
                    {(payModal.balance - (payForm.type === "دفع" ? 1 : -1) * parseFloat(payForm.amount))
                      .toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                  </span>
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setPayModal(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
              <button onClick={submitPay} disabled={paying || !payForm.amount || !payForm.settlement_date}
                className={`flex-1 py-2.5 rounded-xl text-sm font-extrabold text-white disabled:opacity-50 ${
                  payForm.type === "دفع" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}>
                {paying ? "جاري الحفظ..." : payForm.type === "دفع" ? "💸 تأكيد الدفع" : "➖ تأكيد الخصم"}
              </button>
            </div>
          </div>
        </div>
      )}
      {statementDriver && (
        <DriverSettlementStatementModal
          driver={statementDriver}
          token={token}
          onClose={() => setStatementDriver(null)}
        />
      )}
    </div>
  );
}
