import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, authFetch } from "@/context/AuthContext";
import {
  Receipt, CheckCircle, Clock, DollarSign, Upload, X,
  Eye, RefreshCw, AlertTriangle, Building2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReimbRequest {
  id: number;
  request_number: string;
  submitted_by: string;
  description: string | null;
  total_amount: number;
  invoice_count: number;
  invoice_image_url: string | null;
  status: "pending" | "accountant_reviewed" | "reimbursed";
  accountant_name: string | null;
  accountant_notes: string | null;
  accountant_reviewed_at: string | null;
  bank_officer_notes: string | null;
  reimbursed_at: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sar = (n: number) =>
  n.toLocaleString("ar-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 0 });
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_CONFIG = {
  pending:              { label: "بانتظار المحاسب",    bg: "bg-yellow-100", text: "text-yellow-700", icon: Clock },
  accountant_reviewed:  { label: "بانتظار مسؤول البنك", bg: "bg-blue-100",   text: "text-blue-700",   icon: CheckCircle },
  reimbursed:           { label: "تمت الاستعاضة ✓",    bg: "bg-green-100",  text: "text-green-700",  icon: CheckCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? { label: status, bg: "bg-gray-100", text: "text-gray-700", icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <Icon size={11} />{cfg.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReimbursementPage() {
  const { user, token } = useAuth();
  const af = authFetch(token);
  const qc = useQueryClient();

  const role = user?.role ?? "";
  const isPurchasing  = role === "purchasing" || (user?.permissions ?? []).includes("fleet_purchasing");
  const isAccountant  = role === "accountant";
  const isBankOfficer = role === "bank_officer";

  // ── State ──────────────────────────────────────────────────────────────────
  const [submitForm, setSubmitForm] = useState({
    submitted_by: user?.name ?? "",
    description: "",
    total_amount: "",
    invoice_count: "",
  });
  const [submitModal, setSubmitModal] = useState(false);
  const [reviewModal, setReviewModal] = useState<{ open: boolean; req: ReimbRequest | null }>({ open: false, req: null });
  const [reviewForm, setReviewForm]   = useState({ accountant_name: user?.name ?? "", accountant_notes: "" });
  const [reimburseModal, setReimburseModal] = useState<{ open: boolean; req: ReimbRequest | null }>({ open: false, req: null });
  const [reimburseNotes, setReimburseNotes] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: requests = [], isLoading, refetch } = useQuery<ReimbRequest[]>({
    queryKey: ["reimbursement-requests", role],
    queryFn: () => {
      const params = new URLSearchParams();
      if (isPurchasing && !isAccountant && !isBankOfficer)
        params.set("submitted_by", user?.name ?? "");
      if (isBankOfficer) params.set("status", "accountant_reviewed");
      return af(`/reimbursement-requests?${params}`);
    },
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const submitRequest = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("submitted_by",  submitForm.submitted_by);
      fd.append("description",   submitForm.description);
      fd.append("total_amount",  submitForm.total_amount);
      fd.append("invoice_count", submitForm.invoice_count);
      if (imageRef.current?.files?.[0]) fd.append("invoice_image", imageRef.current.files[0]);
      const res = await fetch("/api/reimbursement-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل إرسال الطلب");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reimbursement-requests"] });
      setSubmitModal(false);
      setSubmitForm({ submitted_by: user?.name ?? "", description: "", total_amount: "", invoice_count: "" });
    },
    onError: (e: Error) => alert(e.message),
  });

  const reviewRequest = useMutation({
    mutationFn: async (id: number) => {
      const json = await af(`/reimbursement-requests/${id}/review`, {
        method: "PUT",
        body: JSON.stringify(reviewForm),
      });
      if (json.error) throw new Error(json.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reimbursement-requests"] });
      setReviewModal({ open: false, req: null });
    },
    onError: (e: Error) => alert(e.message),
  });

  const reimburseRequest = useMutation({
    mutationFn: async (id: number) => {
      const json = await af(`/reimbursement-requests/${id}/reimburse`, {
        method: "PUT",
        body: JSON.stringify({ bank_officer_notes: reimburseNotes }),
      });
      if (json.error) throw new Error(json.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reimbursement-requests"] });
      setReimburseModal({ open: false, req: null });
      setReimburseNotes("");
    },
    onError: (e: Error) => alert(e.message),
  });

  // ── Header title/color based on role ────────────────────────────────────────
  const headerColor = isAccountant ? "from-violet-900 to-violet-800" :
                      isBankOfficer ? "from-sky-900 to-sky-800" :
                      "from-cyan-900 to-cyan-800";
  const roleLabel = isAccountant  ? "المحاسب — مراجعة طلبات الاستعاضة" :
                    isBankOfficer ? "مسؤول البنوك — صرف الاستعاضة" :
                    "طلبات الاستعاضة";

  const pending   = requests.filter(r => r.status === "pending").length;
  const reviewed  = requests.filter(r => r.status === "accountant_reviewed").length;
  const done      = requests.filter(r => r.status === "reimbursed").length;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {/* ── Header ── */}
      <div className={`bg-gradient-to-l ${headerColor} text-white px-4 py-5`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Receipt size={22} />
            </div>
            <div>
              <h1 className="text-lg font-black">طلبات الاستعاضة</h1>
              <p className="text-xs opacity-70">{roleLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPurchasing && !isAccountant && !isBankOfficer && (
              <button onClick={() => setSubmitModal(true)}
                className="flex items-center gap-1.5 bg-white text-cyan-800 px-3 py-2 rounded-xl text-xs font-black transition-colors hover:bg-cyan-50">
                <Receipt size={14} />تقديم طلب استعاضة
              </button>
            )}
            <button onClick={() => refetch()}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
              <RefreshCw size={13} />تحديث
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "بانتظار المحاسب",     count: pending,  color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
            { label: "بانتظار مسؤول البنك",  count: reviewed, color: "text-blue-700 bg-blue-50 border-blue-200" },
            { label: "تمت الاستعاضة",        count: done,     color: "text-green-700 bg-green-50 border-green-200" },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border p-4 text-center ${s.color}`}>
              <div className="text-2xl font-black">{s.count}</div>
              <div className="text-xs font-semibold mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Requests List ── */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">جاري التحميل…</div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 text-center py-16 text-gray-300">
            <Receipt size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">لا توجد طلبات استعاضة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(r => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-xs font-bold text-gray-500">{r.request_number}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="font-bold text-gray-800 text-sm">{r.submitted_by}</p>
                    {r.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.description}</p>}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-sm font-black text-emerald-700">{sar(r.total_amount || 0)}</span>
                      {r.invoice_count > 0 && (
                        <span className="text-xs text-gray-500">{r.invoice_count} فاتورة</span>
                      )}
                      <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {r.invoice_image_url && (
                      <button onClick={() => setImagePreview(r.invoice_image_url)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold">
                        <Eye size={13} />عرض الفاتورة
                      </button>
                    )}
                    {isAccountant && r.status === "pending" && (
                      <button onClick={() => { setReviewModal({ open: true, req: r }); setReviewForm({ accountant_name: user?.name ?? "", accountant_notes: "" }); }}
                        className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">
                        <CheckCircle size={12} />مراجعة وإحالة
                      </button>
                    )}
                    {isBankOfficer && r.status === "accountant_reviewed" && (
                      <button onClick={() => { setReimburseModal({ open: true, req: r }); setReimburseNotes(""); }}
                        className="flex items-center gap-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">
                        <DollarSign size={12} />صرف الاستعاضة
                      </button>
                    )}
                  </div>
                </div>

                {/* Accountant review info */}
                {r.accountant_name && (
                  <div className="border-t border-violet-50 bg-violet-50/60 px-4 py-2 flex items-center gap-2 flex-wrap">
                    <CheckCircle size={12} className="text-violet-600 shrink-0" />
                    <span className="text-xs text-violet-700">
                      راجعه <strong>{r.accountant_name}</strong>
                      {r.accountant_reviewed_at ? ` — ${fmtDate(r.accountant_reviewed_at)}` : ""}
                    </span>
                    {r.accountant_notes && (
                      <span className="text-xs text-violet-600 italic">"{r.accountant_notes}"</span>
                    )}
                  </div>
                )}

                {/* Reimbursed info */}
                {r.status === "reimbursed" && (
                  <div className="border-t border-green-50 bg-green-50/60 px-4 py-2 flex items-center gap-2 flex-wrap">
                    <Building2 size={12} className="text-green-600 shrink-0" />
                    <span className="text-xs text-green-700">
                      تم الصرف {r.reimbursed_at ? fmtDate(r.reimbursed_at) : ""}
                    </span>
                    {r.bank_officer_notes && (
                      <span className="text-xs text-green-600 italic">"{r.bank_officer_notes}"</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Submit Modal (purchasing) ── */}
      {submitModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSubmitModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-black text-gray-800 flex items-center gap-2"><Receipt size={18} className="text-cyan-600" />تقديم طلب استعاضة</h2>
              <button onClick={() => setSubmitModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">اسم مقدم الطلب *</label>
                <input value={submitForm.submitted_by}
                  onChange={e => setSubmitForm(s => ({ ...s, submitted_by: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="اسمك" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">وصف المشتريات</label>
                <textarea value={submitForm.description}
                  onChange={e => setSubmitForm(s => ({ ...s, description: e.target.value }))}
                  rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
                  placeholder="اذكر ما تم شراؤه…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">المبلغ الإجمالي (ريال)</label>
                  <input type="number" min="0" value={submitForm.total_amount}
                    onChange={e => setSubmitForm(s => ({ ...s, total_amount: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">عدد الفواتير</label>
                  <input type="number" min="1" value={submitForm.invoice_count}
                    onChange={e => setSubmitForm(s => ({ ...s, invoice_count: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">صورة الفاتورة (اختياري)</label>
                <input ref={imageRef} type="file" accept="image/*,application/pdf"
                  className="w-full text-xs text-gray-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:bg-cyan-50 file:text-cyan-700 file:border-0 file:text-xs file:font-bold" />
              </div>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button onClick={() => setSubmitModal(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={() => submitRequest.mutate()}
                disabled={submitRequest.isPending || !submitForm.submitted_by.trim()}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-black disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                <Upload size={14} />{submitRequest.isPending ? "جاري الإرسال…" : "إرسال الطلب"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review Modal (accountant) ── */}
      {reviewModal.open && reviewModal.req && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setReviewModal({ open: false, req: null })}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-black text-gray-800 flex items-center gap-2"><CheckCircle size={18} className="text-violet-600" />مراجعة وإحالة للبنك</h2>
              <button onClick={() => setReviewModal({ open: false, req: null })}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 text-sm">
                <p className="font-bold text-gray-700">{reviewModal.req.submitted_by}</p>
                <p className="text-gray-500 text-xs mt-1">{reviewModal.req.description || "—"}</p>
                <p className="text-emerald-700 font-black mt-2">{sar(reviewModal.req.total_amount || 0)}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">اسم المحاسب</label>
                <input value={reviewForm.accountant_name}
                  onChange={e => setReviewForm(s => ({ ...s, accountant_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">ملاحظات المحاسب (اختياري)</label>
                <textarea value={reviewForm.accountant_notes}
                  onChange={e => setReviewForm(s => ({ ...s, accountant_notes: e.target.value }))}
                  rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" placeholder="ملاحظات…" />
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">بعد المراجعة سيتم إرسال الطلب تلقائياً لمسؤول البنوك لصرف الاستعاضة.</p>
              </div>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button onClick={() => setReviewModal({ open: false, req: null })}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">إلغاء</button>
              <button onClick={() => reviewRequest.mutate(reviewModal.req!.id)}
                disabled={reviewRequest.isPending || !reviewForm.accountant_name.trim()}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-black disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                <CheckCircle size={14} />{reviewRequest.isPending ? "جاري الإرسال…" : "مراجعة وإحالة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reimburse Modal (bank officer) ── */}
      {reimburseModal.open && reimburseModal.req && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setReimburseModal({ open: false, req: null })}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-black text-gray-800 flex items-center gap-2"><DollarSign size={18} className="text-sky-600" />صرف الاستعاضة</h2>
              <button onClick={() => setReimburseModal({ open: false, req: null })}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                <p className="font-bold text-gray-700">{reimburseModal.req.submitted_by}</p>
                <p className="text-gray-500 text-xs">{reimburseModal.req.description || "—"}</p>
                <p className="text-emerald-700 font-black">{sar(reimburseModal.req.total_amount || 0)}</p>
                {reimburseModal.req.accountant_name && (
                  <p className="text-violet-600 text-xs">راجعه: {reimburseModal.req.accountant_name}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">ملاحظات مسؤول البنوك (اختياري)</label>
                <textarea value={reimburseNotes} onChange={e => setReimburseNotes(e.target.value)}
                  rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" placeholder="رقم التحويل أو ملاحظات الصرف…" />
              </div>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button onClick={() => setReimburseModal({ open: false, req: null })}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">إلغاء</button>
              <button onClick={() => reimburseRequest.mutate(reimburseModal.req!.id)}
                disabled={reimburseRequest.isPending}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-black disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                <DollarSign size={14} />{reimburseRequest.isPending ? "جاري الصرف…" : "تأكيد صرف الاستعاضة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Image Preview Modal ── */}
      {imagePreview && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setImagePreview(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setImagePreview(null)}
              className="absolute -top-10 left-0 text-white/70 hover:text-white flex items-center gap-1 text-sm">
              <X size={16} />إغلاق
            </button>
            <img src={imagePreview} alt="فاتورة الاستعاضة" className="w-full rounded-xl max-h-[80vh] object-contain bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
