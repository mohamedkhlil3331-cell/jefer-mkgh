import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Building2, Save, Plus, CheckCircle2, AlertCircle,
  Hash, MapPin, Phone, FileText, Trash2, X, ShieldAlert, BookOpen,
  RefreshCw, Database, Timer, Clock, MessageCircleMore, MessageSquare,
  Download, Printer,
} from "lucide-react";

interface Branch {
  id: number; entity_name: string; tax_number: string;
  national_address: string; cr_number: string; phone: string;
  active: number;
}

type BranchDocumentType = "tax_number" | "cr_number" | "national_address" | "custom";

interface BranchDocument {
  id: number;
  branch_id: number;
  document_type: BranchDocumentType;
  title: string;
  file_name: string;
  content_type: string;
  file_size: number;
  created_at: string;
}

const FIXED_BRANCH_DOCUMENTS: { document_type: Exclude<BranchDocumentType, "custom">; title: string }[] = [
  { document_type: "tax_number", title: "الرقم الضريبي" },
  { document_type: "cr_number", title: "السجل التجاري" },
  { document_type: "national_address", title: "العنوان الوطني" },
];

const BRANCH_DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
const BRANCH_DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function branchDocumentHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` };
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character] || character);
}

function BranchField({ label, icon, value, onChange, placeholder = "" }: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-1.5">{icon}{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50"
      />
    </div>
  );
}

function ConfirmDeleteModal({ branch, onConfirm, onCancel }: {
  branch: Branch; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <ShieldAlert size={22} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">حذف الفرع</h3>
            <p className="text-sm text-gray-500 mt-0.5">هذا الإجراء لا يمكن التراجع عنه</p>
          </div>
          <button onClick={onCancel} className="mr-auto text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-5">
          <p className="text-sm text-red-800">
            هل أنت متأكد من حذف فرع <span className="font-bold">"{branch.entity_name}"</span>؟
            سيتم إخفاؤه من القوائم مع الاحتفاظ بجميع بياناته المالية.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
            نعم، احذف الفرع
          </button>
          <button onClick={onCancel}
            className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 py-2.5 rounded-xl font-bold text-sm transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

interface SlaSetting {
  id: number; stage: string; limit_minutes: number;
}

const SLA_STAGE_LABELS: Record<string, string> = {
  pending:           "انتظار المراجعة",
  payment_confirmed: "انتظار تخصيص سيارة",
  vehicle_assigned:  "انتظار إصدار الفاتورة",
  invoiced:          "انتظار التحميل",
};

interface SyncResult {
  success: boolean;
  tables?: number;
  totalRows?: number;
  failedTables?: string[];
  errors?: string[];
  error?: string;
}

interface SupabaseStatus {
  available: boolean;
  errorCount: number;
  lastErrors: { at: string; sql: string; message: string }[];
}

export default function CompanySettingsPage() {
  const [branches, setBranches]       = useState<Branch[]>([]);
  const [selected, setSelected]       = useState<Branch | null>(null);
  const [saving,   setSaving]         = useState(false);
  const [msg,      setMsg]            = useState<{ type: "ok"|"err"; text: string } | null>(null);
  const [addMode,  setAddMode]        = useState(false);
  const [newName,  setNewName]        = useState("");
  const [adding,   setAdding]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);

  const [supabase,    setSupabase]    = useState<SupabaseStatus | null>(null);
  const [syncing,     setSyncing]     = useState(false);
  const [syncResult,  setSyncResult]  = useState<SyncResult | null>(null);

  const [slaSettings,  setSlaSettings]  = useState<SlaSetting[]>([]);
  const [slaDraft,     setSlaDraft]     = useState<Record<string, number>>({});
  const [slaSaving,    setSlaSaving]    = useState(false);
  const [slaMsg,       setSlaMsg]       = useState<{ type: "ok"|"err"; text: string } | null>(null);

  const [showAiChat,        setShowAiChat]        = useState<boolean>(true);
  const [aiSaving,          setAiSaving]          = useState(false);
  const [whatsappOrderPhone, setWhatsappOrderPhone] = useState("0571748370");
  const [waSaving,           setWaSaving]          = useState(false);
  const [waMsg,              setWaMsg]             = useState<{ type: "ok"|"err"; text: string } | null>(null);
  const [quoteAction,        setQuoteAction]       = useState<"whatsapp"|"login">("whatsapp");
  const [qaSaving,           setQaSaving]          = useState(false);
  const [branchDocuments, setBranchDocuments] = useState<BranchDocument[]>([]);
  const [branchDocumentsLoading, setBranchDocumentsLoading] = useState(false);
  const [documentUploading, setDocumentUploading] = useState<BranchDocumentType | null>(null);
  const [documentMsg, setDocumentMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [customDocumentTitle, setCustomDocumentTitle] = useState("");
  const [customDocumentFile, setCustomDocumentFile] = useState<File | null>(null);
  const customDocumentFileRef = useRef<HTMLInputElement>(null);

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}`,
    "Content-Type": "application/json",
  });

  // ── Load AI chat visibility + WhatsApp order phone + quote action ──
  useEffect(() => {
    fetch("/api/app-settings")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setShowAiChat(!!d.show_ai_chat);
          if (d.whatsapp_order_phone) setWhatsappOrderPhone(d.whatsapp_order_phone);
          if (d.quote_action) setQuoteAction(d.quote_action as "whatsapp"|"login");
        }
      })
      .catch(() => {});
  }, []);

  const saveQuoteAction = async (val: "whatsapp"|"login") => {
    setQaSaving(true);
    try {
      await fetch("/api/supervisor-settings", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ quote_action: val }),
      });
      setQuoteAction(val);
    } finally { setQaSaving(false); }
  };

  const saveWhatsappPhone = async () => {
    setWaSaving(true); setWaMsg(null);
    try {
      const r = await fetch("/api/supervisor-settings", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ whatsapp_order_phone: whatsappOrderPhone.trim() }),
      });
      if (r.status === 401) {
        setWaMsg({ type: "err", text: "انتهت جلستك — أعد تسجيل الدخول ثم حاول مجدداً" });
        return;
      }
      if (!r.ok) throw new Error();
      setWaMsg({ type: "ok", text: "تم حفظ الرقم بنجاح" });
    } catch { setWaMsg({ type: "err", text: "فشل الحفظ، حاول مجدداً" }); }
    finally { setWaSaving(false); }
  };

  const toggleAiChat = async (val: boolean) => {
    setAiSaving(true);
    try {
      await fetch("/api/supervisor-settings", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ show_ai_chat: val ? 1 : 0 }),
      });
      setShowAiChat(val);
      // Let AIChatWidget react by dispatching a storage event as a simple cross-component signal
      window.dispatchEvent(new StorageEvent("storage", { key: "show_ai_chat", newValue: String(val ? 1 : 0) }));
    } finally { setAiSaving(false); }
  };

  const loadSupabaseStatus = async () => {
    try {
      const r = await fetch("/api/admin/supabase-status", { headers: authHeaders() });
      if (r.ok) setSupabase(await r.json());
    } catch { /* ignore */ }
  };

  const runSync = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const r = await fetch("/api/admin/sync-supabase", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await r.json();
      setSyncResult(data);
      if (data.success) loadSupabaseStatus();
    } catch { setSyncResult({ success: false, error: "فشل الاتصال بالخادم" }); }
    finally { setSyncing(false); }
  };

  useEffect(() => { loadSupabaseStatus(); }, []);

  const loadSla = async () => {
    try {
      const r = await fetch("/api/company-settings/sla");
      if (!r.ok) return;
      const rows: SlaSetting[] = await r.json();
      setSlaSettings(rows);
      const draft: Record<string, number> = {};
      for (const s of rows) draft[s.stage] = s.limit_minutes;
      setSlaDraft(draft);
    } catch { /* ignore */ }
  };
  useEffect(() => { loadSla(); }, []);

  const saveSla = async () => {
    setSlaSaving(true); setSlaMsg(null);
    try {
      const settings = Object.entries(slaDraft).map(([stage, limit_minutes]) => ({ stage, limit_minutes }));
      const r = await fetch("/api/company-settings/sla", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!r.ok) throw new Error();
      setSlaMsg({ type: "ok", text: "تم حفظ إعدادات SLA بنجاح" });
      await loadSla();
    } catch { setSlaMsg({ type: "err", text: "فشل الحفظ، حاول مجدداً" }); }
    finally { setSlaSaving(false); }
  };

  const load = async (): Promise<Branch[]> => {
    try {
      const r = await fetch("/api/company-settings");
      if (!r.ok) return [];
      const data: Branch[] = await r.json();
      setBranches(data);
      return data;
    } catch { return []; }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (branches.length && !selected) setSelected(branches[0]);
  }, [branches]);

  const selectedBranchId = selected?.id;
  useEffect(() => {
    let active = true;
    if (!selectedBranchId) {
      setBranchDocuments([]);
      setBranchDocumentsLoading(false);
      return () => { active = false; };
    }

    setBranchDocuments([]);
    setBranchDocumentsLoading(true);
    setDocumentMsg(null);
    fetch(`/api/company-settings/${selectedBranchId}/documents`, { headers: branchDocumentHeaders() })
      .then(async response => {
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(data.error || "تعذر تحميل مرفقات الفرع");
        if (!Array.isArray(data)) throw new Error("استجابة مرفقات الفرع غير صحيحة");
        return data as BranchDocument[];
      })
      .then(data => { if (active) setBranchDocuments(data); })
      .catch(error => {
        if (active) setDocumentMsg({
          type: "err",
          text: error instanceof Error ? error.message : "تعذر تحميل مرفقات الفرع",
        });
      })
      .finally(() => { if (active) setBranchDocumentsLoading(false); });

    return () => { active = false; };
  }, [selectedBranchId]);

  const save = async () => {
    if (!selected) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/company-settings/${selected.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected),
      });
      if (!res.ok) throw new Error();
      setMsg({ type: "ok", text: "تم حفظ بيانات الفرع بنجاح" });
      const data = await load();
      const updated = data.find((b: Branch) => b.id === selected.id);
      if (updated) setSelected(updated);
    } catch { setMsg({ type: "err", text: "فشل الحفظ، حاول مجدداً" }); }
    finally { setSaving(false); }
  };

  const addBranch = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/company-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_name: newName }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewName(""); setAddMode(false);
        const list = await load();
        const created = list.find((b: Branch) => b.id === data.id);
        if (created) setSelected(created);
      }
    } finally { setAdding(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/company-settings/${deleteTarget.id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: body.error || "فشل الحذف" });
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    const list = await load();
    if (selected?.id === deleteTarget.id) {
      setSelected(list.length ? list[0] : null);
    }
    setMsg({ type: "ok", text: `تم حذف فرع "${deleteTarget.entity_name}" بنجاح` });
  };

  const uploadBranchDocument = async (
    file: File,
    documentType: BranchDocumentType,
    title: string,
  ): Promise<boolean> => {
    if (!selected) return false;
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const contentType = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)
      ? file.type
      : BRANCH_DOCUMENT_MIME_BY_EXTENSION[extension];
    if (!contentType) {
      setDocumentMsg({ type: "err", text: "اختر ملف PDF أو صورة JPG أو PNG أو WEBP" });
      return false;
    }
    if (file.size < 1) {
      setDocumentMsg({ type: "err", text: "الملف فارغ" });
      return false;
    }

    const existing = branchDocuments.find(document => document.document_type === documentType);
    if (existing && documentType !== "custom") {
      const confirmed = window.confirm(`سيتم استبدال مرفق «${existing.title}» الحالي بالملف الجديد. هل تريد المتابعة؟`);
      if (!confirmed) return false;
    }

    const branchId = selected.id;
    setDocumentUploading(documentType);
    setDocumentMsg(null);
    try {
      const uploadUrlResponse = await fetch(`/api/company-settings/${branchId}/documents/upload-url`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: file.name, contentType, size: file.size }),
      });
      const uploadUrlData = await uploadUrlResponse.json().catch(() => ({}));
      if (!uploadUrlResponse.ok) throw new Error(uploadUrlData.error || "تعذر تجهيز رفع الملف");
      if (!uploadUrlData.uploadURL || !uploadUrlData.objectPath) throw new Error("رابط رفع الملف غير مكتمل");

      const uploadResponse = await fetch(uploadUrlData.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("فشل رفع الملف إلى التخزين");

      const saveResponse = await fetch(`/api/company-settings/${branchId}/documents`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          document_type: documentType,
          title,
          object_path: uploadUrlData.objectPath,
          file_name: file.name,
          content_type: contentType,
        }),
      });
      const savedDocument = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) throw new Error(savedDocument.error || "تعذر حفظ مرفق الفرع");

      setBranchDocuments(current => {
        const remaining = current.filter(document =>
          documentType === "custom"
            ? document.id !== savedDocument.id
            : document.document_type !== documentType
        );
        return [...remaining, savedDocument as BranchDocument];
      });
      setDocumentMsg({ type: "ok", text: `تم حفظ مرفق «${savedDocument.title || title}»` });
      return true;
    } catch (error) {
      setDocumentMsg({
        type: "err",
        text: error instanceof Error ? error.message : "تعذر رفع مرفق الفرع",
      });
      return false;
    } finally {
      setDocumentUploading(null);
    }
  };

  const downloadBranchDocument = async (branchDocument: BranchDocument) => {
    if (!selected) return;
    try {
      const response = await fetch(
        `/api/company-settings/${selected.id}/documents/${branchDocument.id}/file`,
        { headers: branchDocumentHeaders() },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "تعذر تنزيل المرفق");
      }
      const fileUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = branchDocument.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
    } catch (error) {
      setDocumentMsg({
        type: "err",
        text: error instanceof Error ? error.message : "تعذر تنزيل المرفق",
      });
    }
  };

  const exportBranchPdf = () => {
    if (!selected) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setDocumentMsg({ type: "err", text: "اسمح بفتح النوافذ المنبثقة لتصدير بيانات الفرع" });
      return;
    }

    const informationRows = [
      ["اسم الفرع", selected.entity_name],
      ["رقم الهاتف", selected.phone || "—"],
      ["الرقم الضريبي", selected.tax_number || "—"],
      ["السجل التجاري", selected.cr_number || "—"],
      ["العنوان الوطني", selected.national_address || "—"],
    ];
    const documentRows = [
      ...FIXED_BRANCH_DOCUMENTS.map(fixed => ({
        title: fixed.title,
        file: branchDocuments.find(document => document.document_type === fixed.document_type)?.file_name || "غير مرفق",
      })),
      ...branchDocuments
        .filter(document => document.document_type === "custom")
        .map(document => ({ title: document.title, file: document.file_name })),
    ];
    const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"/><title>${escapeHtml(selected.entity_name)}</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#172033;padding:28px;direction:rtl}
h1{font-size:24px;margin:0 0 8px}p{color:#667085;font-size:12px;margin:0 0 24px}
h2{font-size:16px;margin:24px 0 10px;border-bottom:1px solid #d6dce5;padding-bottom:8px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd3df;padding:10px;text-align:right;vertical-align:top}
th{background:#f0f4f9;width:27%}.address{white-space:pre-wrap}.exported{text-align:left;margin-top:26px;color:#667085;font-size:11px}
@page{size:A4 portrait;margin:16mm}@media print{body{padding:0}}
</style></head>
<body>
  <h1>بيانات الفرع</h1>
  <p>${escapeHtml(selected.entity_name)}</p>
  <h2>المعلومات</h2>
  <table><tbody>${informationRows.map(([label, value]) =>
    `<tr><th>${escapeHtml(label)}</th><td class="${label === "العنوان الوطني" ? "address" : ""}">${escapeHtml(value)}</td></tr>`
  ).join("")}</tbody></table>
  <h2>المرفقات</h2>
  <table><thead><tr><th>المستند</th><th>اسم الملف</th></tr></thead><tbody>
    ${documentRows.length
      ? documentRows.map(row => `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.file)}</td></tr>`).join("")
      : "<tr><td colspan='2'>لا توجد مرفقات</td></tr>"}
  </tbody></table>
  <div class="exported">تاريخ التصدير: ${escapeHtml(new Date().toLocaleString("ar-SA"))}</div>
  <script>window.onload=()=>window.print()</script>
</body></html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div dir="rtl" className="space-y-5 max-w-3xl">

      {deleteTarget && (
        <ConfirmDeleteModal
          branch={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">فروع الشركة</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            بيانات كل فرع — تظهر في الفواتير وتُستخدم في الأمور المالية
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/system-guide">
            <a className="flex items-center gap-2 border border-[#103c68]/30 hover:bg-[#103c68]/5 text-[#103c68] px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
              <BookOpen size={15} />دليل النظام
            </a>
          </Link>
          <button onClick={() => { setAddMode(v => !v); setMsg(null); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
            <Plus size={15} />إضافة فرع
          </button>
        </div>
      </div>

      {addMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex gap-3 flex-wrap items-center">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="اسم الفرع الجديد (مثال: مصنع البلك — الرياض)"
            onKeyDown={e => e.key === "Enter" && addBranch()}
            className="flex-1 min-w-48 border border-blue-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
          <button onClick={addBranch} disabled={adding || !newName.trim()}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-60">
            {adding ? "جاري الإضافة..." : "إضافة"}
          </button>
          <button onClick={() => { setAddMode(false); setNewName(""); }}
            className="text-gray-400 hover:text-gray-700 px-3 text-sm">
            إلغاء
          </button>
        </div>
      )}

      {/* Branch cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {branches.map(b => (
          <div key={b.id} className="relative group">
            <button onClick={() => { setSelected(b); setMsg(null); }}
              className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-start transition-all
                ${selected?.id === b.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-100 bg-white hover:border-gray-200 shadow-sm"}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                ${selected?.id === b.id ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                <Building2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`font-bold text-sm truncate ${selected?.id === b.id ? "text-blue-700" : "text-gray-900"}`}>
                  {b.entity_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">انقر لتعديل البيانات</div>
              </div>
            </button>

            <button
              onClick={e => { e.stopPropagation(); setDeleteTarget(b); setMsg(null); }}
              title="حذف الفرع"
              className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity
                w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 flex items-center justify-center text-red-500">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Branch edit form */}
      {selected && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
              <Building2 size={18} className="text-blue-500" />{selected.entity_name}
            </h2>
            <div className="flex items-center gap-3">
              <button onClick={exportBranchPdf} disabled={branchDocumentsLoading}
                className="flex items-center gap-1.5 text-blue-700 hover:text-blue-900 text-sm font-semibold transition-colors disabled:opacity-50">
                <Printer size={14} /> تصدير PDF
              </button>
              <button onClick={() => setDeleteTarget(selected)}
                className="flex items-center gap-1.5 text-red-500 hover:text-red-700 text-sm font-semibold transition-colors">
                <Trash2 size={14} /> حذف الفرع
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BranchField label="اسم الفرع" icon={<Building2 size={13} className="text-gray-400" />}
              value={selected.entity_name}
              onChange={value => setSelected(current => current ? { ...current, entity_name: value } : current)}
              placeholder="شركة MKGH — الفرع الرئيسي" />
            <BranchField label="رقم الهاتف" icon={<Phone size={13} className="text-gray-400" />}
              value={selected.phone || ""}
              onChange={value => setSelected(current => current ? { ...current, phone: value } : current)}
              placeholder="05xxxxxxxx" />
            <BranchField label="الرقم الضريبي" icon={<Hash size={13} className="text-gray-400" />}
              value={selected.tax_number || ""}
              onChange={value => setSelected(current => current ? { ...current, tax_number: value } : current)}
              placeholder="3001234567890003" />
            <BranchField label="السجل التجاري" icon={<FileText size={13} className="text-gray-400" />}
              value={selected.cr_number || ""}
              onChange={value => setSelected(current => current ? { ...current, cr_number: value } : current)}
              placeholder="1234567890" />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-1.5">
              <MapPin size={13} className="text-gray-400" />العنوان الوطني
            </label>
            <textarea
              value={selected.national_address || ""}
              onChange={e => setSelected({ ...selected, national_address: e.target.value })}
              placeholder="الرياض، المملكة العربية السعودية — مثال: ٢٣٤٥ شارع الأمير محمد"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50 resize-none"
            />
          </div>

          <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5 space-y-4">
            <div>
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <FileText size={16} className="text-blue-600" /> مرفقات بيانات الفرع
              </h3>
              <p className="text-xs text-gray-500 mt-1">ارفع صورة أو ملف PDF لكل مستند؛ تُحفظ المرفقات لهذا الفرع فقط.</p>
            </div>

            {branchDocumentsLoading ? (
              <p className="text-sm text-gray-500">جاري تحميل المرفقات...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {FIXED_BRANCH_DOCUMENTS.map(fixed => {
                  const attached = branchDocuments.find(document => document.document_type === fixed.document_type);
                  return (
                    <div key={fixed.document_type} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                      <div>
                        <div className="font-semibold text-sm text-gray-800">{fixed.title}</div>
                        <div className="text-xs text-gray-500 mt-1 truncate" title={attached?.file_name}>
                          {attached ? attached.file_name : "لا يوجد مرفق"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {attached && (
                          <button type="button" onClick={() => void downloadBranchDocument(attached)}
                            className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">
                            <Download size={13} /> تنزيل
                          </button>
                        )}
                        <label className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold
                          ${documentUploading ? "bg-gray-100 text-gray-400" : "bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>
                          {documentUploading === fixed.document_type
                            ? "جاري الرفع..."
                            : attached ? "استبدال المرفق" : "إرفاق ملف"}
                          <input
                            type="file"
                            accept={BRANCH_DOCUMENT_ACCEPT}
                            disabled={!!documentUploading}
                            className="sr-only"
                            onChange={event => {
                              const input = event.currentTarget;
                              const file = input.files?.[0];
                              if (file) void uploadBranchDocument(file, fixed.document_type, fixed.title)
                                .finally(() => { input.value = ""; });
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t border-blue-100 pt-4 space-y-3">
              <div>
                <h4 className="text-sm font-bold text-gray-800">مستندات إضافية</h4>
                <p className="text-xs text-gray-500 mt-1">أضف مستنداً بعنوان تختاره وارفق صورته أو ملف PDF.</p>
              </div>
              <form
                className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end"
                onSubmit={event => {
                  event.preventDefault();
                  if (customDocumentFile && customDocumentTitle.trim()) {
                    void uploadBranchDocument(customDocumentFile, "custom", customDocumentTitle.trim())
                      .then(saved => {
                        if (!saved) return;
                        setCustomDocumentTitle("");
                        setCustomDocumentFile(null);
                        if (customDocumentFileRef.current) customDocumentFileRef.current.value = "";
                      });
                  }
                }}
              >
                <label className="text-xs font-semibold text-gray-600 space-y-1">
                  <span className="block">مسمى المستند</span>
                  <input
                    value={customDocumentTitle}
                    onChange={event => setCustomDocumentTitle(event.target.value)}
                    maxLength={120}
                    placeholder="مثال: شهادة الزكاة"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600 space-y-1">
                  <span className="block">الملف</span>
                  <input
                    ref={customDocumentFileRef}
                    type="file"
                    accept={BRANCH_DOCUMENT_ACCEPT}
                    onChange={event => setCustomDocumentFile(event.target.files?.[0] || null)}
                    className="block w-full text-xs text-gray-500 file:ml-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-gray-700"
                  />
                </label>
                <button type="submit" disabled={!customDocumentTitle.trim() || !customDocumentFile || !!documentUploading}
                  className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50">
                  <Plus size={13} /> إضافة
                </button>
              </form>

              {branchDocuments.filter(document => document.document_type === "custom").length > 0 && (
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                  {branchDocuments.filter(document => document.document_type === "custom").map(document => (
                    <div key={document.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate">{document.title}</div>
                        <div className="text-xs text-gray-500 truncate">{document.file_name}</div>
                      </div>
                      <button type="button" onClick={() => void downloadBranchDocument(document)}
                        className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">
                        <Download size={13} /> تنزيل
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {documentMsg && (
              <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3
                ${documentMsg.type === "ok"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"}`}>
                {documentMsg.type === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                {documentMsg.text}
              </div>
            )}
          </section>

          {msg && (
            <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3
              ${msg.type === "ok"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"}`}>
              {msg.type === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {msg.text}
            </div>
          )}

          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-60 transition-colors">
            <Save size={15} />{saving ? "جاري الحفظ..." : "حفظ التغييرات"}
          </button>
        </div>
      )}

      {branches.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد فروع — أضف أول فرع للشركة</p>
        </div>
      )}

      {/* ── SLA Settings ── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Timer size={18} className="text-orange-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">إعدادات SLA</h2>
            <p className="text-xs text-gray-400 mt-0.5">الحد الأقصى للوقت المسموح به في كل مرحلة (بالدقائق)</p>
          </div>
        </div>

        {slaSettings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {slaSettings.map(s => (
              <div key={s.stage} className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Clock size={13} className="text-orange-400" />
                  {SLA_STAGE_LABELS[s.stage] ?? s.stage}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={slaDraft[s.stage] ?? s.limit_minutes}
                    onChange={e => setSlaDraft(d => ({ ...d, [s.stage]: Math.max(1, Number(e.target.value)) }))}
                    className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
                  />
                  <span className="text-xs text-gray-400">دقيقة ({((slaDraft[s.stage] ?? s.limit_minutes) / 60).toFixed(1)} ساعة)</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">جاري تحميل الإعدادات...</p>
        )}

        {slaMsg && (
          <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3
            ${slaMsg.type === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"}`}>
            {slaMsg.type === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {slaMsg.text}
          </div>
        )}

        <button onClick={saveSla} disabled={slaSaving || slaSettings.length === 0}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-60 transition-colors">
          <Save size={15} />{slaSaving ? "جاري الحفظ..." : "حفظ إعدادات SLA"}
        </button>
      </div>

      {/* ── WhatsApp Order Phone ── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <MessageSquare size={18} className="text-green-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">رقم واتساب استقبال الطلبات</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              عندما يُخفى سعر منتج، يُرسَل طلب العميل إلى هذا الرقم عبر واتساب
            </p>
          </div>
        </div>
        <div className="flex gap-3 items-start flex-wrap">
          <div className="flex-1 min-w-48">
            <input
              type="tel"
              value={whatsappOrderPhone}
              onChange={e => { setWhatsappOrderPhone(e.target.value); setWaMsg(null); }}
              placeholder="0571748370"
              dir="ltr"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-gray-50 text-left"
            />
            <p className="text-xs text-gray-400 mt-1">أدخل الرقم بصيغة 05XXXXXXXX</p>
          </div>
          <button onClick={saveWhatsappPhone} disabled={waSaving || !whatsappOrderPhone.trim()}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 transition-colors whitespace-nowrap">
            <Save size={14} />{waSaving ? "جاري الحفظ..." : "حفظ الرقم"}
          </button>
        </div>
        {waMsg && (
          <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 ${
            waMsg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {waMsg.type === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {waMsg.text}
          </div>
        )}
      </div>

      {/* ── Quote Action Toggle ── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <MessageSquare size={18} className="text-orange-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">سلوك زر «اطلب الآن» للزوار</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              عندما يضغط زائر غير مسجّل على «اطلب الآن» لمنتج مقفول السعر
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([
            { val: "whatsapp", label: "إرسال واتساب مباشرةً", desc: "يفتح نموذج الطلب بدون تسجيل دخول", icon: "💬" },
            { val: "login",    label: "طلب تسجيل الدخول",    desc: "يُحوَّل الزائر لصفحة الدخول أولاً", icon: "🔒" },
          ] as const).map(opt => (
            <button key={opt.val} onClick={() => saveQuoteAction(opt.val)} disabled={qaSaving}
              className={`text-right p-4 rounded-2xl border-2 transition-all ${
                quoteAction === opt.val
                  ? opt.val === "whatsapp"
                    ? "border-green-500 bg-green-50"
                    : "border-[#103c68] bg-[#103c68]/5"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300"
              }`}>
              <div className="text-2xl mb-1">{opt.icon}</div>
              <div className={`text-sm font-bold ${quoteAction === opt.val ? (opt.val === "whatsapp" ? "text-green-700" : "text-[#103c68]") : "text-gray-700"}`}>
                {opt.label}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
              {quoteAction === opt.val && (
                <div className={`mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                  opt.val === "whatsapp" ? "bg-green-500 text-white" : "bg-[#103c68] text-white"
                }`}>✓ محدد حالياً</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── AI Chat Toggle ── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0eb5cb]/10 flex items-center justify-center flex-shrink-0">
              <MessageCircleMore size={18} className="text-[#0eb5cb]" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800">مساعد الذكاء الاصطناعي</h2>
              <p className="text-xs text-gray-400 mt-0.5">إظهار أو إخفاء زر الشات الذكي لجميع مستخدمي التطبيق</p>
            </div>
          </div>
          <button
            onClick={() => toggleAiChat(!showAiChat)}
            disabled={aiSaving}
            className={`relative inline-flex h-7 w-13 w-[52px] items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50
              ${showAiChat ? "bg-[#0eb5cb]" : "bg-gray-300"}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200
              ${showAiChat ? "translate-x-[28px]" : "translate-x-1"}`} />
          </button>
        </div>
        <p className={`mt-3 text-xs font-semibold ${showAiChat ? "text-[#0eb5cb]" : "text-gray-400"}`}>
          {showAiChat ? "✓ الشات الذكي ظاهر حالياً" : "✗ الشات الذكي مخفي حالياً"}
        </p>
      </div>

      {supabase?.available && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Database size={18} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800">مزامنة Supabase</h2>
              <p className="text-xs text-gray-400 mt-0.5">نسخ احتياطي فوري من SQLite إلى Supabase</p>
            </div>
            {supabase.errorCount > 0 && (
              <span className="mr-auto inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full">
                <AlertCircle size={12} />
                {supabase.errorCount} خطأ في الذاكرة
              </span>
            )}
          </div>

          {supabase.errorCount > 0 && supabase.lastErrors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-semibold text-red-700 mb-1">آخر أخطاء المزامنة:</p>
              {supabase.lastErrors.map((e, i) => (
                <div key={i} className="text-xs text-red-600 bg-white border border-red-100 rounded-xl px-3 py-2">
                  <span className="text-gray-400">{new Date(e.at).toLocaleString("ar-SA")}</span>
                  {" — "}
                  {e.message}
                </div>
              ))}
            </div>
          )}

          {syncResult && (
            <div className={`text-sm rounded-xl px-4 py-3 space-y-1.5
              ${syncResult.success
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"}`}>
              <div className="flex items-start gap-2">
                {syncResult.success
                  ? <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0" />
                  : <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />}
                <span>
                  {syncResult.success
                    ? `تمت المزامنة بنجاح — ${syncResult.tables} جدول، ${syncResult.totalRows?.toLocaleString("ar-SA")} صف`
                    : syncResult.failedTables && syncResult.failedTables.length > 0
                      ? `فشل مزامنة ${syncResult.failedTables.length} جدول: ${syncResult.failedTables.join("، ")}`
                      : `فشلت المزامنة: ${syncResult.error}`}
                </span>
              </div>
              {syncResult.errors && syncResult.errors.length > 0 && (
                <ul className="pr-5 list-disc text-xs opacity-80 space-y-0.5">
                  {syncResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}

          <button
            onClick={runSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60
              text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors">
            <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            {syncing ? "جاري المزامنة..." : "مزامنة الآن"}
          </button>
        </div>
      )}
    </div>
  );
}
