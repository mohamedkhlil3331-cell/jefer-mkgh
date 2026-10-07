import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  ArrowLeft, ArrowUpLeft, CalendarDays, Check, ChevronLeft, CircleAlert,
  Clock3, Download, FileImage, FileText, KeyRound, LogOut, MapPin,
  Pencil, Plus, RefreshCw, Route, Send, ShieldCheck, Trash2, Truck,
  UploadCloud, Wallet, X,
} from "lucide-react";

type Tab = "overview" | "trips" | "requests" | "account" | "security";
type Trip = {
  id: number; date?: string; car_id?: string | number; driver_name?: string;
  cargo_type?: string; image_url?: string; permit_image_url?: string;
  fsohat_image_url?: string; loading_region?: string; unloading_region?: string;
  trips_count?: number; unit_price?: number; price?: number;
};
type Template = {
  trip_id?: number; source_trip_id?: number; loading_region?: string; unloading_region?: string;
  cargo_type?: string; price?: number;
};
type Request = {
  id: number; source_trip_id?: number; notes?: string; status?: string;
  created_at?: string; loading_region?: string; unloading_region?: string;
  cargo_type?: string;
};
type Transfer = {
  id: number; amount: number; image_url?: string; status?: string;
  confirmed?: number | boolean; created_at?: string; transfer_date?: string;
  transfer_image_url?: string; transfer_status?: string; payment_date?: string;
};
type Entry = {
  id?: number; date?: string; entry_date?: string; created_at?: string; description?: string;
  type?: string; amount?: number; debit?: number; credit?: number;
  trip_id?: number;
};
type PortalData = {
  customer?: { name?: string; company_name?: string; phone?: string };
  entries?: Entry[]; trips?: Trip[]; templates?: Template[];
  requests?: Request[]; transfers?: Transfer[]; balance?: number | { balance?: number; total_trips?: number; total_transfers?: number };
};

const money = (value: unknown) => Number(value || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
};
const documentUrl = (value?: string) => value && (/^https?:\/\//.test(value) || value.startsWith("/")) ? value : undefined;
const statusText = (status?: string) => ({ pending: "بانتظار المراجعة", approved: "مقبول", accepted: "مقبول", rejected: "مرفوض", confirmed: "مؤكد", cancelled: "ملغي" }[status || ""] || status || "بانتظار المراجعة");

export default function RentalTripPortal() {
  const { user, token, logout } = useAuth();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [requestFor, setRequestFor] = useState<Template | null>(null);
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [editingTransfer, setEditingTransfer] = useState<number | null>(null);
  const [deleteTransfer, setDeleteTransfer] = useState<number | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!receipt) { setReceiptPreview(""); return; }
    const url = URL.createObjectURL(receipt);
    setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt]);

  const api = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${token || localStorage.getItem("mkgh_token") || ""}`, "Content-Type": "application/json", ...init?.headers },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.message || `تعذر إكمال العملية (${response.status})`);
    return result as T;
  }, [token]);

  const viewReceipt = async (value?: string) => {
    const path = documentUrl(value);
    if (!path) return;
    const popup = window.open("about:blank", "_blank");
    try {
      const receiptPath = path.startsWith("/objects/") ? `/api/storage${path}` : path;
      const receiptUrl = new URL(receiptPath, window.location.href);
      if (receiptUrl.origin !== window.location.origin) throw new Error("رابط الإيصال غير آمن.");
      const response = await fetch(receiptUrl.toString(), {
        headers: { Authorization: `Bearer ${token || localStorage.getItem("mkgh_token") || ""}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `تعذر فتح الإيصال (${response.status})`);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      if (popup) {
        popup.location.href = objectUrl;
      } else {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `rental-transfer-receipt-${Date.now()}`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
    } catch (e) {
      popup?.close();
      setError((e as Error).message || "تعذر فتح إيصال التحويل.");
    }
  };

  const load = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    setError("");
    try {
      const result = await api<PortalData>("/api/rental-trip-portal/me");
      setData({
        ...result,
        trips: result.trips || [],
        templates: (result.templates || []).map(t => ({ ...t, trip_id: t.source_trip_id ?? t.trip_id })),
        transfers: (result.transfers || []).map(t => ({
          ...t, image_url: t.transfer_image_url ?? t.image_url,
          status: t.transfer_status ?? t.status,
          transfer_date: t.payment_date ?? t.transfer_date,
        })),
        entries: (result.entries || []).map(e => ({ ...e, date: e.entry_date ?? e.date })),
      });
    } catch (e) {
      setError((e as Error).message || "تعذر تحميل بياناتك. تحقق من اتصالك وحاول مجدداً.");
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(true); }, [load, user?.id]);

  const action = async (task: () => Promise<void>, success: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await task(); await load(); setNotice(success); }
    catch (e) { setError((e as Error).message || "حدث خطأ، يرجى المحاولة مجدداً."); }
    finally { setBusy(false); }
  };

  const createRequest = (e: FormEvent) => {
    e.preventDefault();
    if (!requestFor) return;
    void action(async () => {
      await api("/api/rental-trip-portal/requests", { method: "POST", body: JSON.stringify({ source_trip_id: requestFor.source_trip_id ?? requestFor.trip_id, notes: notes.trim() }) });
      setRequestFor(null); setNotes(""); setTab("requests");
    }, "تم إرسال طلب الرحلة وسيتم مراجعته قريباً.");
  };

  const selectReceipt = (file?: File) => {
    if (!file) { setReceipt(null); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("صيغة الصورة غير مدعومة. اختر JPG أو PNG أو WebP."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("يجب ألا يتجاوز حجم الصورة 10 ميجابايت."); return; }
    setError(""); setReceipt(file);
  };

  const uploadReceipt = async (file: File) => {
    const upload = await api<{ uploadURL: string; objectPath: string }>("/api/storage/uploads/request-url", {
      method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (!upload.uploadURL || !upload.objectPath) throw new Error("تعذر تجهيز رفع الصورة.");
    const response = await fetch(upload.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!response.ok) throw new Error("تعذر رفع صورة الحوالة. حاول مجدداً.");
    return `/api/storage${upload.objectPath}`;
  };

  const saveTransfer = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setError("أدخل مبلغاً صحيحاً أكبر من صفر."); return; }
    if (!receipt && editingTransfer === null) { setError("أرفق صورة إيصال التحويل."); return; }
    void action(async () => {
      const image_url = receipt ? await uploadReceipt(receipt) : data?.transfers?.find(t => t.id === editingTransfer)?.transfer_image_url;
      if (!image_url) throw new Error("أرفق صورة إيصال التحويل.");
      await api(`/api/rental-trip-portal/transfers${editingTransfer !== null ? `/${editingTransfer}` : ""}`, {
        method: editingTransfer !== null ? "PUT" : "POST", body: JSON.stringify({ amount: value, image_url }),
      });
      setAmount(""); setReceipt(null); setEditingTransfer(null);
    }, editingTransfer !== null ? "تم تحديث التحويل." : "تم تسجيل الحوالة وإضافة المبلغ إلى كشف حسابك فوراً، وهي قيد التأكيد.");
  };

  const removeTransfer = (id: number) => void action(async () => {
    await api(`/api/rental-trip-portal/transfers/${id}`, { method: "DELETE" });
    setDeleteTransfer(null);
  }, "تم حذف الحوالة المعلقة وتحديث كشف الحساب.");

  const requestOtp = () => void action(async () => {
    await api("/api/auth/rental-password/request-otp", { method: "POST", body: JSON.stringify({}) });
    setOtpSent(true);
  }, "تم إرسال رمز التحقق برسالة نصية إلى جوالك.");

  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("كلمة المرور يجب ألا تقل عن 8 أحرف."); return; }
    setBusy(true); setError("");
    void api("/api/auth/rental-password/verify-otp", { method: "POST", body: JSON.stringify({ otp: otp.trim(), new_password: password }) })
      .then(() => { setOtp(""); setPassword(""); setOtpSent(false); logout(); })
      .catch(e => setError((e as Error).message || "تعذر تغيير كلمة المرور."))
      .finally(() => setBusy(false));
  };

  const trips = data?.trips || [];
  const templates = data?.templates || [];
  const requests = data?.requests || [];
  const transfers = data?.transfers || [];
  const entries = data?.entries || [];
  const balance = typeof data?.balance === "number" ? data.balance : Number(data?.balance?.balance || 0);
  const totalTripValue = trips.reduce((sum, t) => sum + Number(t.price || 0), 0);
  const totalCredits = transfers.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const customerName = data?.customer?.company_name || data?.customer?.name || user?.company_name || user?.name || "عميل الرحلات";

  return (
    <div className="rtp" dir="rtl">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Tajawal:wght@400;500;600;700;800;900&display=swap');
        .rtp{--ink:#142c35;--muted:#72828a;--line:#e4e6df;--paper:#f5f5ef;--surface:#fffefa;--accent:#dc7047;--soft:#e9efec;min-height:100dvh;background:var(--paper);color:var(--ink);font-family:Tajawal,"DM Sans",sans-serif;position:relative}
        .rtp *{box-sizing:border-box}.rtp button,.rtp input,.rtp textarea{font:inherit}.rtp button{cursor:pointer}.rtp button:disabled{cursor:not-allowed;opacity:.52}
        .rtp-shell{max-width:1460px;margin:auto;padding:0 38px}.rtp-header{background:#fcfcf7;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
        .rtp-header-inner{min-height:84px;display:flex;align-items:center;gap:24px}.rtp-mark{height:42px;width:42px;background:var(--ink);color:#f1eee4;display:grid;place-items:center;border-radius:12px;flex:none}
        .rtp-brand{font-size:19px;line-height:1.1;font-weight:900;letter-spacing:-.05em}.rtp-brand small{display:block;font-size:11px;font-weight:700;letter-spacing:0;color:var(--muted);margin-top:5px}
        .rtp-header-right{margin-inline-start:auto;display:flex;align-items:center;gap:16px}.rtp-identity{text-align:left;font-size:13px;line-height:1.3}.rtp-identity strong{display:block;font-size:14px}.rtp-identity span{color:var(--muted)}
        .rtp-divider{height:30px;width:1px;background:var(--line)}.rtp-iconbtn{height:38px;width:38px;border:1px solid var(--line);border-radius:11px;background:transparent;color:var(--ink);display:grid;place-items:center;transition:background .2s}.rtp-iconbtn:hover{background:var(--soft)}
        .rtp-layout{display:grid;grid-template-columns:215px minmax(0,1fr);gap:42px;padding-top:42px;padding-bottom:90px}
        .rtp-side{position:sticky;top:125px;align-self:start}.rtp-side-label{font-size:11px;color:#889397;font-weight:900;letter-spacing:.1em;margin:0 14px 16px}.rtp-nav{display:flex;flex-direction:column;gap:5px}
        .rtp-nav button{border:0;background:transparent;color:#65767c;border-radius:12px;padding:12px 14px;width:100%;display:flex;align-items:center;gap:12px;font-size:14px;font-weight:800;text-align:right;transition:background .2s,color .2s}
        .rtp-nav button:hover{background:#e8ece7;color:var(--ink)}.rtp-nav button.active{background:var(--ink);color:#fffefa}.rtp-nav button span{margin-inline-start:auto;font-size:11px;opacity:.7}
        .rtp-side-note{margin-top:38px;padding:18px 15px;border-top:1px solid var(--line);font-size:12px;line-height:1.8;color:var(--muted)}
        .rtp-main{min-width:0}.rtp-eyebrow{display:flex;align-items:center;gap:9px;color:#aa5a3c;font-size:12px;font-weight:900;letter-spacing:.02em;margin-bottom:13px}
        .rtp-title{font-size:clamp(32px,4vw,54px);line-height:1.12;letter-spacing:-.055em;font-weight:900;margin:0}.rtp-subtitle{font-size:15px;color:var(--muted);line-height:1.8;margin:12px 0 0}
        .rtp-heading{display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:29px}.rtp-button{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:var(--accent);color:#fffefa;border:1px solid var(--accent);border-radius:11px;padding:12px 17px;font-weight:900;font-size:13px;white-space:nowrap;transition:transform .2s,opacity .2s}
        .rtp-button:hover{transform:translateY(-2px)}.rtp-button.alt{background:transparent;border-color:#d8ddd8;color:var(--ink)}.rtp-button.dark{background:var(--ink);border-color:var(--ink)}.rtp-button.danger{background:#9c493e;border-color:#9c493e}
        .rtp-hero{min-height:240px;display:flex;justify-content:space-between;gap:24px;background:var(--ink);border-radius:22px;color:#f9f7ee;padding:37px 40px;overflow:hidden;position:relative}
        .rtp-hero:before{content:"";position:absolute;width:440px;height:440px;border:1px solid #ffffff27;border-radius:50%;left:-85px;top:-190px;box-shadow:0 0 0 45px #ffffff08,0 0 0 90px #ffffff06}
        .rtp-hero-content{position:relative;z-index:1}.rtp-hero-label{font-size:13px;color:#aabcb9;font-weight:700;margin-bottom:22px}.rtp-hero-number{font-family:"DM Sans",Tajawal,sans-serif;direction:ltr;text-align:right;font-size:clamp(36px,5vw,60px);font-weight:600;letter-spacing:-.055em;line-height:1}
        .rtp-hero-number span{font-family:Tajawal,sans-serif;font-size:17px;letter-spacing:0;margin-right:7px;color:#bbc9c4}.rtp-hero-footer{font-size:12px;color:#b7c8c0;margin-top:18px}
        .rtp-hero-aside{position:relative;z-index:1;align-self:end;background:#ffffff13;border:1px solid #ffffff1b;border-radius:15px;padding:17px 20px;min-width:190px}.rtp-hero-aside span{display:block;font-size:12px;color:#aabcb9;margin-bottom:8px}.rtp-hero-aside strong{font-size:22px;font-family:"DM Sans",Tajawal,sans-serif}
        .rtp-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin:16px 0 42px}.rtp-stat{background:var(--surface);border:1px solid var(--line);padding:20px 23px;border-radius:15px;min-height:111px}.rtp-stat-label{color:var(--muted);font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px}.rtp-stat-value{font-size:29px;font-weight:900;line-height:1;margin-top:17px;font-family:"DM Sans",Tajawal,sans-serif;letter-spacing:-.04em}
        .rtp-section{margin:35px 0 0}.rtp-section-head{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:16px}.rtp-section-head h2{font-size:21px;font-weight:900;letter-spacing:-.035em;margin:0}.rtp-section-head button{border:0;background:none;color:#a65336;font-size:13px;font-weight:900;display:flex;align-items:center;gap:5px}
        .rtp-panel{background:var(--surface);border:1px solid var(--line);border-radius:17px;overflow:hidden}.rtp-route{padding:18px 21px;display:flex;align-items:center;gap:18px;border-bottom:1px solid var(--line)}.rtp-route:last-child{border-bottom:0}.rtp-route-icon{width:45px;height:45px;flex:none;background:#edf1ec;border-radius:12px;display:grid;place-items:center;color:#425f5b}
        .rtp-route-body{flex:1;min-width:0}.rtp-route-name{font-size:15px;font-weight:900;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rtp-route-name svg{color:#b3bfbb}.rtp-route-detail{color:var(--muted);font-size:12px;margin-top:5px}.rtp-route-price{text-align:left;white-space:nowrap}.rtp-route-price strong{display:block;font-family:"DM Sans",Tajawal,sans-serif;font-size:17px}.rtp-route-price span{color:var(--muted);font-size:11px}
        .rtp-row-button{border:1px solid #dddfd9;background:transparent;color:var(--ink);height:34px;width:34px;display:grid;place-items:center;border-radius:9px;flex:none}.rtp-row-button:hover{background:#edf1ec}
        .rtp-empty{padding:52px 20px;text-align:center;color:var(--muted)}.rtp-empty-icon{margin:0 auto 14px;color:#94aaa5}.rtp-empty strong{display:block;color:var(--ink);font-size:16px;margin-bottom:6px}.rtp-empty p{margin:0;font-size:13px;line-height:1.7}
        .rtp-alert{padding:13px 16px;border-radius:11px;margin-bottom:18px;display:flex;align-items:flex-start;gap:10px;font-size:13px;font-weight:700;line-height:1.6}.rtp-alert.error{background:#fff0eb;color:#954635;border:1px solid #eecbbd}.rtp-alert.success{background:#e6f1e9;color:#275941;border:1px solid #c6dece}
        .rtp-trip{padding:22px;border-bottom:1px solid var(--line)}.rtp-trip:last-child{border:0}.rtp-trip-top{display:flex;gap:15px;align-items:start;justify-content:space-between}.rtp-trip-id{color:#aa5a3c;font-size:11px;font-weight:900;letter-spacing:.06em}.rtp-trip h3{font-size:17px;margin:5px 0 8px;font-weight:900}.rtp-trip-meta{display:flex;gap:9px 18px;flex-wrap:wrap;color:var(--muted);font-size:12px}.rtp-trip-meta span{display:flex;align-items:center;gap:5px}.rtp-trip-price{font-family:"DM Sans",Tajawal,sans-serif;font-size:20px;font-weight:700;white-space:nowrap}.rtp-trip-price small{font-family:Tajawal,sans-serif;font-size:12px;color:var(--muted);font-weight:600}.rtp-docs{display:flex;gap:8px;flex-wrap:wrap;margin-top:17px}.rtp-doc{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);color:#36575c;background:#f7f8f3;border-radius:8px;padding:8px 11px;font-size:12px;font-weight:800;text-decoration:none}.rtp-doc:hover{background:#e7efec}
        .rtp-chip{border-radius:100px;padding:5px 11px;background:#f8eddb;color:#966126;font-size:11px;font-weight:900;white-space:nowrap}.rtp-chip.confirmed{background:#e3efe8;color:#317054}.rtp-chip.rejected{background:#fae6e1;color:#aa4c3e}
        .rtp-form{padding:24px}.rtp-field{display:block;margin-bottom:18px}.rtp-field label{display:block;font-size:12px;font-weight:900;margin-bottom:9px}.rtp-input{width:100%;border:1px solid #dbe0db;background:#f8f9f5;color:var(--ink);border-radius:10px;padding:13px 14px;outline:none;font-size:14px}.rtp-input:focus{border-color:#72918a;box-shadow:0 0 0 3px #72918a20}.rtp-input::placeholder{color:#a8b2ae}.rtp-form-note{font-size:12px;color:var(--muted);line-height:1.8;margin:0 0 18px}
        .rtp-upload{display:flex;align-items:center;justify-content:center;gap:11px;min-height:102px;border:1px dashed #a9bbb3;background:#f7f9f4;border-radius:12px;color:#4b6861;font-weight:800;font-size:13px;cursor:pointer;text-align:center;padding:15px}.rtp-upload input{display:none}.rtp-upload small{display:block;color:var(--muted);font-size:11px;font-weight:600;margin-top:4px}
        .rtp-preview{height:100px;width:100px;object-fit:cover;border-radius:10px;border:1px solid var(--line);margin-top:12px}.rtp-two-col{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:18px;align-items:start}.rtp-transfer{padding:17px 19px;border-bottom:1px solid var(--line)}.rtp-transfer:last-child{border:0}.rtp-transfer-head{display:flex;align-items:start;justify-content:space-between;gap:10px}.rtp-transfer-amount{font:700 18px "DM Sans",Tajawal,sans-serif}.rtp-transfer-amount small{font:600 11px Tajawal,sans-serif;color:var(--muted)}.rtp-transfer-actions{display:flex;align-items:center;gap:8px;margin-top:13px;flex-wrap:wrap}.rtp-transfer-actions button{border:0;background:transparent;color:#637d79;font-size:12px;font-weight:800;display:flex;align-items:center;gap:5px;padding:4px}.rtp-transfer-actions button:last-child{color:#ae5948}
        .rtp-table-wrap{overflow:auto}.rtp-table{width:100%;border-collapse:collapse;text-align:right;font-size:12px;min-width:560px}.rtp-table th{color:var(--muted);background:#f4f6f1;padding:14px 19px;font-weight:900}.rtp-table td{padding:16px 19px;border-top:1px solid var(--line);font-weight:700}.rtp-table td:first-child{color:var(--muted);white-space:nowrap}.rtp-table .credit{color:#317054}.rtp-table .debit{color:#a35a44}
        .rtp-modal-back{position:fixed;inset:0;z-index:50;background:#10252dc2;display:grid;place-items:center;padding:18px}.rtp-modal{background:var(--surface);border-radius:19px;width:min(100%,480px);padding:27px;box-shadow:0 30px 80px #0b202b40}.rtp-modal-head{display:flex;justify-content:space-between;align-items:start;gap:15px;margin-bottom:16px}.rtp-modal h2{font-size:22px;margin:0;font-weight:900}.rtp-modal p{font-size:13px;color:var(--muted);line-height:1.8}.rtp-modal-actions{display:flex;gap:9px;margin-top:18px}
        .rtp-skeleton{height:18px;border-radius:6px;background:linear-gradient(90deg,#e8ece6,#f8faf5,#e8ece6);background-size:200% 100%;animation:rtp-pulse 1.4s infinite}.rtp-skeleton-card{height:230px;border-radius:20px;margin-bottom:18px}@keyframes rtp-pulse{to{background-position-x:-200%}}
        @media(max-width:900px){.rtp-shell{padding-inline:22px}.rtp-layout{grid-template-columns:1fr;gap:25px;padding-top:25px}.rtp-side{position:static}.rtp-side-label,.rtp-side-note{display:none}.rtp-nav{flex-direction:row;overflow-x:auto;padding-bottom:3px}.rtp-nav button{white-space:nowrap;width:auto;flex:none;padding:10px 12px}.rtp-nav button span{display:none}}
        @media(max-width:640px){.rtp-shell{padding-inline:16px}.rtp-header-inner{min-height:69px;gap:10px}.rtp-mark{height:36px;width:36px}.rtp-brand{font-size:16px}.rtp-brand small{font-size:9px}.rtp-identity,.rtp-divider{display:none}.rtp-header-right{gap:7px}.rtp-heading{align-items:start;flex-direction:column}.rtp-title{font-size:35px}.rtp-hero{padding:26px;min-height:222px;flex-direction:column}.rtp-hero-aside{align-self:stretch;min-width:0;padding:12px 15px;display:flex;align-items:center;justify-content:space-between}.rtp-hero-aside span{margin:0}.rtp-stats{gap:7px}.rtp-stat{min-height:95px;padding:13px 10px}.rtp-stat-label{font-size:10px}.rtp-stat-value{font-size:21px}.rtp-two-col{grid-template-columns:1fr}.rtp-route{gap:10px;padding:15px 12px;flex-wrap:wrap}.rtp-route-icon{height:35px;width:35px}.rtp-route-name{font-size:13px}.rtp-route-price{margin-inline-start:auto}.rtp-trip{padding:17px}.rtp-trip-price{font-size:16px}}
      `}</style>
      <header className="rtp-header">
        <div className="rtp-shell rtp-header-inner">
          <div className="rtp-mark"><Truck size={21} strokeWidth={1.8}/></div>
          <div className="rtp-brand">دورة عميل ايجار رحلات<small>بوابة العملاء / رحلات الإيجار</small></div>
          <div className="rtp-header-right">
            <div className="rtp-identity"><strong>{customerName}</strong><span>حساب رحلات الإيجار</span></div>
            <div className="rtp-divider"/>
            <button className="rtp-iconbtn" type="button" title="تحديث البيانات" aria-label="تحديث البيانات" data-testid="button-refresh-portal" onClick={() => void load()}><RefreshCw size={17}/></button>
            <button className="rtp-iconbtn" type="button" title="تسجيل الخروج" aria-label="تسجيل الخروج" data-testid="button-logout-rental" onClick={logout}><LogOut size={17}/></button>
          </div>
        </div>
      </header>
      <div className="rtp-shell rtp-layout">
        <aside className="rtp-side">
          <p className="rtp-side-label">مساحة العمل</p>
          <nav className="rtp-nav" aria-label="أقسام بوابة الرحلات">
            {([
              ["overview", "نظرة عامة", Route], ["trips", "سجل الرحلات", Truck],
              ["requests", "طلبات الرحلات", Send], ["account", "كشف الحساب", Wallet],
              ["security", "الأمان", KeyRound],
            ] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" className={tab === key ? "active" : ""} data-testid={`button-tab-${key}`} onClick={() => { setTab(key); setError(""); setNotice(""); }}>
                <Icon size={17} strokeWidth={1.8}/>{label}
                {key === "requests" && requests.filter(r => (r.status || "pending") === "pending").length > 0 && <span>{requests.filter(r => (r.status || "pending") === "pending").length}</span>}
              </button>
            ))}
          </nav>
          <div className="rtp-side-note">كل رحلاتك وتحويلاتك في مكان واحد.<br/>بيانات حسابك تُحدّث عند فتح الصفحة أو الضغط على زر التحديث.</div>
        </aside>
        <main className="rtp-main">
          {error && <div className="rtp-alert error" role="alert" data-testid="status-portal-error"><CircleAlert size={18}/><span>{error} {data === null && <button type="button" onClick={() => void load(true)} style={{textDecoration:"underline",marginRight:8,border:0,background:"none",color:"inherit",fontWeight:900}}>إعادة المحاولة</button>}</span></div>}
          {notice && <div className="rtp-alert success" role="status" data-testid="status-portal-success"><Check size={18}/>{notice}</div>}
          {loading && !data ? <div aria-label="جاري تحميل البوابة"><div className="rtp-skeleton" style={{width:"35%",height:13,marginBottom:20}}/><div className="rtp-skeleton" style={{width:"70%",height:43,marginBottom:30}}/><div className="rtp-skeleton rtp-skeleton-card"/><div className="rtp-stats">{[0,1,2].map(i => <div key={i} className="rtp-skeleton" style={{height:100}}/>)}</div></div> : data ? <>
            {tab === "overview" && <>
              <div className="rtp-heading"><div><div className="rtp-eyebrow"><span>●</span> لوحة العميل</div><h1 className="rtp-title">أهلاً، {data.customer?.name || user?.name || "بك"}</h1><p className="rtp-subtitle">مساراتك المعتادة، رحلاتك السابقة وحسابك، دون خطوات إضافية.</p></div><button type="button" className="rtp-button" data-testid="button-browse-routes" onClick={() => setTab("requests")}><Plus size={16}/>اطلب رحلة جديدة</button></div>
              <div className="rtp-hero"><div className="rtp-hero-content"><div className="rtp-hero-label">رصيد الحساب الحالي</div><div className="rtp-hero-number" data-testid="text-account-balance">{money(Math.abs(balance))}<span>ر.س</span></div><div className="rtp-hero-footer">{balance > 0 ? "رصيد مستحق عليك" : balance < 0 ? "رصيد دائن لصالحك" : "حسابك متوازن حتى الآن"}</div></div><div className="rtp-hero-aside"><span>إجمالي الرحلات المسجلة</span><strong>{trips.length.toLocaleString("ar-SA")}</strong></div></div>
              <div className="rtp-stats"><div className="rtp-stat"><div className="rtp-stat-label"><Route size={15}/>مسارات سابقة</div><div className="rtp-stat-value">{templates.length.toLocaleString("ar-SA")}</div></div><div className="rtp-stat"><div className="rtp-stat-label"><Clock3 size={15}/>طلبات قيد المراجعة</div><div className="rtp-stat-value">{requests.filter(r => (r.status || "pending") === "pending").length.toLocaleString("ar-SA")}</div></div><div className="rtp-stat"><div className="rtp-stat-label"><ArrowUpLeft size={15}/>تحويلات مسجلة</div><div className="rtp-stat-value">{transfers.length.toLocaleString("ar-SA")}</div></div></div>
              <section className="rtp-section"><div className="rtp-section-head"><h2>اطلب من مساراتك السابقة</h2><button type="button" onClick={() => setTab("requests")} data-testid="button-all-routes">كل المسارات <ArrowLeft size={14}/></button></div><div className="rtp-panel">{templates.length ? templates.slice(0,4).map(t => <RouteRow key={t.trip_id} template={t} onSelect={() => setRequestFor(t)}/>) : <Empty icon={Route} title="لا توجد مسارات سابقة" text="ستظهر مسارات رحلاتك هنا عند تسجيل أول رحلة."/ >}</div></section>
              <section className="rtp-section"><div className="rtp-section-head"><h2>أحدث الرحلات</h2><button type="button" onClick={() => setTab("trips")} data-testid="button-all-trips">سجل الرحلات <ArrowLeft size={14}/></button></div><div className="rtp-panel">{trips.length ? trips.slice(0,3).map(trip => <TripRow key={trip.id} trip={trip}/>) : <Empty icon={Truck} title="سجل رحلاتك يبدأ هنا" text="لم تُسجل رحلات لهذا الحساب بعد."/ >}</div></section>
            </>}
            {tab === "trips" && <><PageHeading eyebrow="أرشيف الرحلات" title="سجل الرحلات" subtitle="كل رحلة، تكلفتها الخاصة بك، وصورها ومستنداتها في مكان واحد."/><div className="rtp-panel">{trips.length ? trips.map(trip => <TripRow key={trip.id} trip={trip}/>) : <Empty icon={Truck} title="لا توجد رحلات بعد" text="عندما تضاف رحلاتك ستظهر تفاصيلها ومستنداتها هنا."/ >}</div></>}
            {tab === "requests" && <><PageHeading eyebrow="رحلتك القادمة" title="طلبات الرحلات" subtitle="اختر مساراً من رحلاتك السابقة، ثم أرسل طلباً جديداً بضغطة واحدة."/><section className="rtp-section" style={{marginTop:0}}><div className="rtp-section-head"><h2>المسارات المتاحة</h2><span style={{fontSize:12,color:"#72828a"}}>{templates.length.toLocaleString("ar-SA")} مسار</span></div><div className="rtp-panel">{templates.length ? templates.map(t => <RouteRow key={t.trip_id} template={t} onSelect={() => setRequestFor(t)}/>) : <Empty icon={Route} title="لا توجد مسارات للطلب" text="يمكنك طلب رحلة جديدة بعد تسجيل رحلة سابقة لحسابك."/ >}</div></section><section className="rtp-section"><div className="rtp-section-head"><h2>طلباتك السابقة</h2></div><div className="rtp-panel">{requests.length ? requests.map(r => { const source = templates.find(t => t.trip_id === r.source_trip_id) || trips.find(t => t.id === r.source_trip_id); return <div className="rtp-transfer" key={r.id} data-testid={`card-request-${r.id}`}><div className="rtp-transfer-head"><div><strong style={{fontSize:15}}>طلب رحلة #{r.id}</strong><div className="rtp-route-detail">{r.loading_region || source?.loading_region || "نقطة التحميل"} ← {r.unloading_region || source?.unloading_region || "نقطة التفريغ"}</div></div><span className={`rtp-chip ${["approved","accepted"].includes(r.status || "") ? "confirmed" : r.status === "rejected" ? "rejected" : ""}`}>{statusText(r.status)}</span></div>{r.notes && <p style={{fontSize:12,color:"#72828a",margin:"10px 0 4px"}}>{r.notes}</p>}<div className="rtp-route-detail">{date(r.created_at)}</div></div>; }) : <Empty icon={Send} title="لم ترسل أي طلب بعد" text="اختر مساراً من الأعلى لتقديم أول طلب رحلة."/ >}</div></section></>}
            {tab === "account" && <>
              <PageHeading eyebrow="المدفوعات والمستحقات" title="كشف الحساب" subtitle="تفاصيل الرحلات بالسعر الخاص بك، والتحويلات التي تُضاف إلى حسابك مباشرة."/>
              <div className="rtp-hero" style={{minHeight:190,marginBottom:19}}>
                <div className="rtp-hero-content"><div className="rtp-hero-label">الرصيد الحالي {balance > 0 ? "· مستحق عليك" : balance < 0 ? "· دائن لصالحك" : ""}</div><div className="rtp-hero-number" data-testid="text-statement-balance">{money(Math.abs(balance))}<span>ر.س</span></div></div>
                <div className="rtp-hero-aside"><span>التحويلات المسجلة</span><strong>{money(totalCredits)}</strong></div>
              </div>
              <div className="rtp-stats" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))"}}>
                <div className="rtp-stat"><div className="rtp-stat-label">قيمة الرحلات</div><div className="rtp-stat-value">{money(totalTripValue)}</div></div>
                <div className="rtp-stat"><div className="rtp-stat-label">إجمالي التحويلات</div><div className="rtp-stat-value">{money(totalCredits)}</div></div>
              </div>
              <div className="rtp-two-col">
                <section>
                  <div className="rtp-section-head"><h2>{editingTransfer !== null ? "تعديل حوالة معلقة" : "إضافة حوالة"}</h2></div>
                  <form className="rtp-panel rtp-form" onSubmit={saveTransfer}>
                    <div className="rtp-field"><label htmlFor="rtp-amount">مبلغ التحويل · ر.س</label><input id="rtp-amount" data-testid="input-transfer-amount" className="rtp-input" dir="ltr" type="number" min="0.01" step="0.01" required placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}/></div>
                    <div className="rtp-field"><label>صورة إيصال التحويل {editingTransfer === null ? "· مطلوبة" : "· اختياري لتغيير الصورة"}</label><label className="rtp-upload"><UploadCloud size={21}/><span>{receipt ? receipt.name : "اختر صورة الإيصال"}<small>JPG أو PNG أو WebP · حد أقصى 10 ميجابايت</small></span><input data-testid="input-transfer-receipt" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => selectReceipt(e.target.files?.[0])}/></label>{receiptPreview && <img className="rtp-preview" src={receiptPreview} alt="معاينة إيصال التحويل"/>}</div>
                    <p className="rtp-form-note">يظهر التحويل في كشف حسابك فور إرساله، ويظل قيد التأكيد حتى مراجعته.</p>
                    <div style={{display:"flex",gap:9}}><button className="rtp-button dark" data-testid="button-save-transfer" disabled={busy} type="submit"><UploadCloud size={16}/>{busy ? "جارٍ الحفظ..." : editingTransfer !== null ? "حفظ التعديل" : "تسجيل الحوالة"}</button>{editingTransfer !== null && <button className="rtp-button alt" type="button" onClick={() => {setEditingTransfer(null);setAmount("");setReceipt(null);}}>إلغاء</button>}</div>
                  </form>
                </section>
                <section>
                  <div className="rtp-section-head"><h2>التحويلات</h2><span style={{fontSize:12,color:"#72828a"}}>{transfers.length} تحويل</span></div>
                  <div className="rtp-panel">{transfers.length ? transfers.map(t => {
                    const confirmed = Boolean(t.confirmed) || t.status === "confirmed";
                    return <div className="rtp-transfer" key={t.id} data-testid={`card-transfer-${t.id}`}>
                      <div className="rtp-transfer-head"><div><div className="rtp-transfer-amount">{money(t.amount)} <small>ر.س</small></div><div className="rtp-route-detail">{date(t.created_at || t.transfer_date)}</div></div><span className={`rtp-chip ${confirmed ? "confirmed" : ""}`}>{confirmed ? "مؤكد" : "بانتظار التأكيد"}</span></div>
                      <div className="rtp-transfer-actions">{documentUrl(t.image_url) && <button className="rtp-doc" type="button" onClick={() => void viewReceipt(t.image_url)} data-testid={`link-transfer-image-${t.id}`}><FileImage size={14}/>عرض / تنزيل الإيصال <Download size={12}/></button>}{!confirmed && <><button type="button" data-testid={`button-edit-transfer-${t.id}`} onClick={() => {setEditingTransfer(t.id);setAmount(String(t.amount));setReceipt(null);window.scrollTo({top:0,behavior:"smooth"});}}><Pencil size={13}/>تعديل</button><button type="button" data-testid={`button-delete-transfer-${t.id}`} onClick={() => setDeleteTransfer(t.id)}><Trash2 size={13}/>حذف</button></>}</div>
                    </div>;
                  }) : <Empty icon={Wallet} title="لا توجد تحويلات" text="سجّل حوالتك الأولى من النموذج المجاور."/ >}</div>
                </section>
              </div>
              <section className="rtp-section"><div className="rtp-section-head"><h2>حركة الحساب</h2></div><div className="rtp-panel rtp-table-wrap">{entries.length ? <table className="rtp-table"><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th></tr></thead><tbody>{entries.map((entry,i) => {
                const debit = Number(entry.debit || 0);
                const credit = Number(entry.credit || 0);
                return <tr key={`${entry.id || i}-${i}`} data-testid={`row-statement-${i}`}><td>{date(entry.entry_date || entry.date || entry.created_at)}</td><td>{entry.description || "حركة حساب"}</td><td className="debit">{debit ? money(debit) : "—"}</td><td className="credit">{credit ? money(credit) : "—"}</td></tr>;
              })}</tbody></table> : <Empty icon={FileText} title="لا توجد حركات حساب" text="ستظهر تفاصيل الرحلات والتحويلات هنا."/ >}</div></section>
            </>}
            {tab === "security" && <><PageHeading eyebrow="إدارة الحساب" title="الأمان وكلمة المرور" subtitle="غيّر كلمة مرور بوابتك بأمان عبر رمز تحقق يُرسل إلى جوالك المسجل."/><div className="rtp-panel" style={{maxWidth:560}}><div style={{padding:"23px 24px 0",display:"flex",gap:13,alignItems:"center"}}><div className="rtp-route-icon"><ShieldCheck size={21}/></div><div><strong style={{fontSize:17}}>تأكيد هويتك أولاً</strong><div className="rtp-route-detail">سيصلك رمز لمرة واحدة على رقم {data.customer?.phone || user?.phone || "جوالك المسجل"}</div></div></div><div className="rtp-form">{!otpSent ? <><p className="rtp-form-note">لن نغيّر كلمة المرور حتى تؤكد الرمز الذي وصلك. إذا تعذر إرسال الرسالة، سنعرض سبب المشكلة هنا.</p><button className="rtp-button dark" data-testid="button-request-password-otp" disabled={busy} type="button" onClick={requestOtp}><Send size={16}/>{busy ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}</button></> : <form onSubmit={changePassword}><div className="rtp-field"><label htmlFor="rtp-otp">رمز التحقق</label><input className="rtp-input" id="rtp-otp" data-testid="input-password-otp" dir="ltr" inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={e => setOtp(e.target.value)} placeholder="أدخل الرمز المرسل"/></div><div className="rtp-field"><label htmlFor="rtp-password">كلمة المرور الجديدة</label><input className="rtp-input" id="rtp-password" data-testid="input-new-password" dir="ltr" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="8 أحرف على الأقل"/></div><div style={{display:"flex",alignItems:"center",gap:13,flexWrap:"wrap"}}><button className="rtp-button dark" data-testid="button-confirm-password" disabled={busy} type="submit"><KeyRound size={16}/>{busy ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}</button><button type="button" data-testid="button-resend-password-otp" disabled={busy} onClick={requestOtp} style={{border:0,background:"none",color:"#a65336",fontWeight:900}}>إعادة إرسال الرمز</button></div></form>}</div></div></>}
          </> : !loading && <div className="rtp-panel"><Empty icon={CircleAlert} title="تعذر عرض البوابة" text="تحقق من الاتصال ثم أعد المحاولة."/ ><div style={{textAlign:"center",paddingBottom:30}}><button className="rtp-button dark" type="button" onClick={() => void load(true)}>إعادة المحاولة</button></div></div>}
        </main>
      </div>
      {requestFor && <div className="rtp-modal-back" role="presentation" onMouseDown={e => {if(e.target === e.currentTarget && !busy) setRequestFor(null);}}><div className="rtp-modal" role="dialog" aria-modal="true" aria-labelledby="rtp-request-title"><div className="rtp-modal-head"><div><div className="rtp-eyebrow">طلب رحلة جديدة</div><h2 id="rtp-request-title">{requestFor.loading_region || "نقطة التحميل"} ← {requestFor.unloading_region || "نقطة التفريغ"}</h2></div><button className="rtp-iconbtn" type="button" aria-label="إغلاق" onClick={() => setRequestFor(null)}><X size={17}/></button></div><p>سننشئ طلباً جديداً اعتماداً على هذا المسار السابق. السعر المرجعي الخاص بك: <strong>{money(requestFor.price)} ر.س</strong>.</p>{error && <div className="rtp-alert error" role="alert"><CircleAlert size={16}/>{error}</div>}<form onSubmit={createRequest}><div className="rtp-field"><label htmlFor="rtp-notes">ملاحظات للرحلة · اختياري</label><textarea id="rtp-notes" data-testid="input-request-notes" className="rtp-input" rows={4} maxLength={1000} placeholder="موعد مناسب، تفاصيل الحمولة أو تعليمات إضافية..." value={notes} onChange={e => setNotes(e.target.value)}/></div><div className="rtp-modal-actions"><button className="rtp-button dark" data-testid="button-submit-trip-request" disabled={busy} type="submit"><Send size={15}/>{busy ? "جارٍ الإرسال..." : "إرسال الطلب"}</button><button className="rtp-button alt" disabled={busy} type="button" onClick={() => setRequestFor(null)}>إلغاء</button></div></form></div></div>}
      {deleteTransfer !== null && <div className="rtp-modal-back" role="presentation" onMouseDown={e => {if(e.target === e.currentTarget && !busy) setDeleteTransfer(null);}}><div className="rtp-modal" role="dialog" aria-modal="true" aria-labelledby="rtp-delete-title"><div className="rtp-modal-head"><h2 id="rtp-delete-title">حذف الحوالة المعلقة؟</h2><button className="rtp-iconbtn" type="button" aria-label="إغلاق" onClick={() => setDeleteTransfer(null)}><X size={17}/></button></div><p>سيُزال هذا التحويل من كشف حسابك. لا يمكن التراجع عن الحذف.</p>{error && <div className="rtp-alert error" role="alert"><CircleAlert size={16}/>{error}</div>}<div className="rtp-modal-actions"><button className="rtp-button danger" data-testid="button-confirm-delete-transfer" disabled={busy} type="button" onClick={() => removeTransfer(deleteTransfer)}>{busy ? "جارٍ الحذف..." : "نعم، احذف الحوالة"}</button><button className="rtp-button alt" disabled={busy} type="button" onClick={() => setDeleteTransfer(null)}>إلغاء</button></div></div></div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div className="rtp-heading"><div><div className="rtp-eyebrow"><span>●</span>{eyebrow}</div><h1 className="rtp-title">{title}</h1><p className="rtp-subtitle">{subtitle}</p></div></div>;
}

function Empty({ icon: Icon, title, text }: { icon: typeof Route; title: string; text: string }) {
  return <div className="rtp-empty"><Icon size={29} strokeWidth={1.5} className="rtp-empty-icon"/><strong>{title}</strong><p>{text}</p></div>;
}

function RouteRow({ template, onSelect }: { template: Template; onSelect: () => void }) {
  return <div className="rtp-route" data-testid={`card-route-${template.trip_id}`}><div className="rtp-route-icon"><MapPin size={19}/></div><div className="rtp-route-body"><div className="rtp-route-name">{template.loading_region || "نقطة التحميل"} <ChevronLeft size={15}/> {template.unloading_region || "نقطة التفريغ"}</div><div className="rtp-route-detail">{template.cargo_type || "رحلة إيجار"} · مسار سابق</div></div><div className="rtp-route-price"><strong>{money(template.price)}</strong><span>ر.س / رحلة</span></div><button className="rtp-row-button" type="button" title="طلب هذا المسار" aria-label={`طلب رحلة من ${template.loading_region || "نقطة التحميل"} إلى ${template.unloading_region || "نقطة التفريغ"}`} data-testid={`button-request-route-${template.trip_id}`} onClick={onSelect}><Plus size={17}/></button></div>;
}

function TripRow({ trip }: { trip: Trip }) {
  const docs = [
    { label: "صورة الرحلة", url: trip.image_url, icon: FileImage },
    { label: "التصريح", url: trip.permit_image_url, icon: FileText },
    { label: "الفسوحات", url: trip.fsohat_image_url, icon: FileText },
  ];
  return <article className="rtp-trip" data-testid={`card-trip-${trip.id}`}><div className="rtp-trip-top"><div><div className="rtp-trip-id">رحلة #{trip.id}</div><h3>{trip.loading_region || "نقطة التحميل"} ← {trip.unloading_region || "نقطة التفريغ"}</h3><div className="rtp-trip-meta"><span><CalendarDays size={13}/>{date(trip.date)}</span>{trip.car_id && <span><Truck size={13}/>السيارة {trip.car_id}</span>}{trip.driver_name && <span>السائق: {trip.driver_name}</span>}{trip.cargo_type && <span>الحمولة: {trip.cargo_type}</span>}{trip.trips_count && <span>عدد الرحلات: {trip.trips_count}</span>}</div></div><div className="rtp-trip-price" data-testid={`text-trip-price-${trip.id}`}>{money(trip.price)} <small>ر.س</small></div></div>{docs.some(doc => documentUrl(doc.url)) && <div className="rtp-docs">{docs.map(doc => { const href = documentUrl(doc.url); return href && <a className="rtp-doc" key={doc.label} href={href} target="_blank" rel="noopener noreferrer" data-testid={`link-trip-document-${trip.id}-${doc.label}`}><doc.icon size={14}/>{doc.label}<Download size={12}/></a>; })}</div>}</article>;
}