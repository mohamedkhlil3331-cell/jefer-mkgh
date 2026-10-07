import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, LogOut, Users, Clock, ShoppingBag, Activity, Settings, Eye, EyeOff, CheckCircle, Phone, Trash2, Plus, Pencil, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TOKEN_KEY = "mkgh_dev_token";

/* ── colour & image helpers ── */
async function compressImage(dataUrl: string, maxW = 1200, q = 0.8): Promise<string> {
  return new Promise(resolve => {
    const img = document.createElement('img');
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.src = dataUrl;
  });
}
function hexGrad(hex: string, dir: 'front' | 'back'): string {
  const r = parseInt(hex.slice(1,3),16)||0, g = parseInt(hex.slice(3,5),16)||0, b = parseInt(hex.slice(5,7),16)||0;
  const cl = (n:number,a:number) => Math.max(0,Math.min(255,n+a));
  if (dir === 'front') return `linear-gradient(135deg,rgb(${cl(r,-25)},${cl(g,-25)},${cl(b,-25)}) 0%,${hex} 60%,rgb(${cl(r,20)},${cl(g,20)},${cl(b,20)}) 100%)`;
  return `linear-gradient(145deg,rgb(${cl(r,-3)},${cl(g,-3)},${cl(b,-3)}) 0%,rgb(${cl(r,5)},${cl(g,5)},${cl(b,5)}) 50%,rgb(${cl(r,-5)},${cl(g,-5)},${cl(b,-5)}) 100%)`;
}

interface Session {
  token: string; created_at: string; expires_at: string; ip_address: string;
  user_id: number; name: string; phone: string; role: string;
}
interface AuditEntry {
  id: number; method: string; path: string;
  user_name: string; user_role: string; ip_address: string;
  status_code: number; created_at: string;
}
interface Stats {
  userCount: number; sessionCount: number; orderCount: number;
  auditCount: number; todayActions: number;
  usersByRole: { role: string; count: number }[];
  recentLogins: { name: string; role: string; phone: string; created_at: string; ip_address: string }[];
}
interface ConfigEntry { key: string; value: string; has_value: boolean; updated_at: string; }

const ROLE_AR: Record<string, string> = {
  admin: "مدير", reviewer: "مراجع", supervisor: "مشرف نقليات",
  warehouse: "مستودع", driver: "سائق", rep: "مندوب",
  workshop_manager: "مدير الورشة", purchasing: "مشتريات", customer: "عميل",
  vehicle: "مركبة", finance: "مالية", accountant: "محاسب",
  bank_officer: "مصرف", warehouse_manager: "مدير مستودع",
  bulker_driver: "سائق بلكر", fsohat: "فسوحات",
};
const METHOD_COLOR: Record<string, string> = {
  POST: "bg-green-500/20 text-green-400", PUT: "bg-blue-500/20 text-blue-400",
  PATCH: "bg-yellow-500/20 text-yellow-400", DELETE: "bg-red-500/20 text-red-400",
};

function statusColor(s: number) {
  if (s >= 500) return "text-red-400";
  if (s >= 400) return "text-orange-400";
  if (s >= 300) return "text-yellow-400";
  return "text-green-400";
}

function fmtTime(dt: string) {
  if (!dt) return "—";
  try {
    return new Date(dt.endsWith("Z") ? dt : dt + "Z").toLocaleString("ar-SA", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch { return dt; }
}

function RoleBadge({ role, small }: { role: string; small?: boolean }) {
  const colors: Record<string, string> = {
    admin: "bg-red-500/20 text-red-400", reviewer: "bg-yellow-500/20 text-yellow-400",
    supervisor: "bg-blue-500/20 text-blue-400", warehouse: "bg-orange-500/20 text-orange-400",
    warehouse_manager: "bg-orange-500/20 text-orange-400", driver: "bg-green-500/20 text-green-400",
    bulker_driver: "bg-green-500/20 text-green-400", rep: "bg-purple-500/20 text-purple-400",
    workshop_manager: "bg-cyan-500/20 text-cyan-400", purchasing: "bg-teal-500/20 text-teal-400",
    customer: "bg-gray-500/20 text-gray-400", vehicle: "bg-indigo-500/20 text-indigo-400",
    finance: "bg-pink-500/20 text-pink-400",
  };
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 font-medium ${small ? "text-[10px]" : "text-[11px]"} ${colors[role] ?? "bg-gray-700 text-gray-400"}`}>
      {ROLE_AR[role] ?? role}
    </span>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const palette: Record<string, string> = {
    blue: "border-blue-500/20 bg-blue-500/5 text-blue-400", green: "border-green-500/20 bg-green-500/5 text-green-400",
    orange: "border-orange-500/20 bg-orange-500/5 text-orange-400", purple: "border-purple-500/20 bg-purple-500/5 text-purple-400",
    cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-400",
  };
  return (
    <div className={`rounded-xl border ${palette[color]} p-4`}>
      <div className={`flex items-center gap-2 mb-2 opacity-60 ${palette[color].split(" ")[2]}`}>{icon}<span className="text-xs">{label}</span></div>
      <div className="text-2xl font-bold text-white">{value?.toLocaleString("ar-SA") ?? "—"}</div>
    </div>
  );
}

function isExpired(dt: string) {
  if (!dt) return true;
  try { return new Date(dt) < new Date(); } catch { return false; }
}

function SessionsTab({ sessions }: { sessions: Session[] }) {
  const [showAll, setShowAll] = React.useState(false);
  const now = new Date();
  const active = sessions.filter(s => s.expires_at && new Date(s.expires_at) > now);
  const shown = showAll ? sessions : (active.length > 0 ? active : sessions);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">
          جلسات الدخول
          <span className="mr-2 text-[11px] font-normal text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">{active.length} نشطة</span>
          <span className="mr-1 text-[11px] font-normal text-gray-600">/ {sessions.length} إجمالي</span>
        </h2>
        <button onClick={() => setShowAll(v => !v)} className="text-xs text-gray-500 hover:text-gray-300 underline">
          {showAll ? "عرض النشطة فقط" : "عرض الكل"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-800 text-gray-500">
            <th className="px-4 py-2.5 text-right font-medium">المستخدم</th>
            <th className="px-4 py-2.5 text-right font-medium">الدور</th>
            <th className="px-4 py-2.5 text-right font-medium">وقت الدخول</th>
            <th className="px-4 py-2.5 text-right font-medium">انتهاء الجلسة</th>
            <th className="px-4 py-2.5 text-right font-medium">IP</th>
            <th className="px-4 py-2.5 text-right font-medium">الحالة</th>
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-600">لا توجد بيانات</td></tr>}
            {shown.map((s, i) => {
              const expired = isExpired(s.expires_at);
              return (
                <tr key={s.token ?? i} className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors ${expired ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-white">{s.name ?? "—"}</div>
                    <div className="text-gray-500">{s.phone ?? "—"}</div>
                  </td>
                  <td className="px-4 py-2.5"><RoleBadge role={s.role} /></td>
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-[11px] whitespace-nowrap">
                    {s.created_at ? fmtTime(s.created_at) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono text-[11px] whitespace-nowrap">{fmtTime(s.expires_at)}</td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono">{s.ip_address ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {expired
                      ? <span className="text-[10px] bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded">منتهية</span>
                      : <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">نشطة ✓</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTab({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800"><h2 className="text-sm font-semibold text-gray-300">سجل النشاطات ({entries.length})</h2></div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-800 text-gray-500">
            <th className="px-4 py-2.5 text-right font-medium">الوقت</th>
            <th className="px-4 py-2.5 text-right font-medium">المستخدم</th>
            <th className="px-4 py-2.5 text-right font-medium">الطريقة</th>
            <th className="px-4 py-2.5 text-right font-medium">المسار</th>
            <th className="px-4 py-2.5 text-right font-medium">الحالة</th>
            <th className="px-4 py-2.5 text-right font-medium">IP</th>
          </tr></thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-600">لا توجد بيانات بعد — ستظهر هنا بعد أول نشاط</td></tr>}
            {entries.map(e => (
              <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors">
                <td className="px-4 py-2.5 text-gray-500 font-mono text-[11px] whitespace-nowrap">{fmtTime(e.created_at)}</td>
                <td className="px-4 py-2.5">
                  {e.user_name ? <div><div className="text-white font-medium">{e.user_name}</div><RoleBadge role={e.user_role} small /></div>
                    : <span className="text-gray-600">غير معرّف</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold font-mono ${METHOD_COLOR[e.method] ?? "bg-gray-700 text-gray-300"}`}>{e.method}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-400 font-mono text-[11px] max-w-[220px] truncate" title={e.path}>{e.path}</td>
                <td className={`px-4 py-2.5 font-mono font-bold ${statusColor(e.status_code)}`}>{e.status_code}</td>
                <td className="px-4 py-2.5 text-gray-600 font-mono text-[11px]">{e.ip_address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatsTab({ stats }: { stats: Stats }) {
  const maxCount = Math.max(...stats.usersByRole.map(r => r.count), 1);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">توزيع المستخدمين بالدور</h2>
        <div className="space-y-3">
          {stats.usersByRole.map(r => (
            <div key={r.role} className="flex items-center gap-3">
              <div className="w-28 text-xs text-gray-400 text-right shrink-0">{ROLE_AR[r.role] ?? r.role}</div>
              <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(r.count / maxCount) * 100}%` }} />
              </div>
              <div className="text-xs text-gray-400 w-6 text-left shrink-0">{r.count}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">آخر عمليات الدخول</h2>
        <div className="space-y-1">
          {stats.recentLogins.length === 0 && <p className="text-gray-600 text-xs">لا توجد سجلات بعد</p>}
          {stats.recentLogins.map((l, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-800/50 last:border-0">
              <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">{l.name?.[0] ?? "?"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white truncate">{l.name ?? l.phone}</div>
                <div className="text-[11px] text-gray-500">{fmtTime(l.created_at)}</div>
              </div>
              <RoleBadge role={l.role} small />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PwField({ label, hint, onSave }: { label: string; hint?: string; onSave: (val: string) => Promise<void> }) {
  const [val, setVal] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!val) return;
    if (val !== confirm) { setErr("كلمتا المرور غير متطابقتين"); return; }
    setSaving(true); setErr(""); setOk(false);
    await onSave(val);
    setSaving(false); setOk(true); setVal(""); setConfirm("");
    setTimeout(() => setOk(false), 3000);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs text-gray-400">{label}</label>
      {hint && <p className="text-[11px] text-gray-600">{hint}</p>}
      <div className="relative">
        <input type={show ? "text" : "password"} value={val} onChange={e => { setVal(e.target.value); setErr(""); }}
          placeholder="كلمة المرور الجديدة"
          className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 pr-9 border border-gray-700 focus:border-blue-500 outline-none text-sm" />
        <button type="button" onClick={() => setShow(!show)} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      <input type={show ? "text" : "password"} value={confirm} onChange={e => { setConfirm(e.target.value); setErr(""); }}
        placeholder="تأكيد كلمة المرور"
        className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 outline-none text-sm" />
      {err && <p className="text-red-400 text-xs">{err}</p>}
      <button onClick={save} disabled={saving || !val}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg px-4 py-1.5 text-xs font-medium transition-colors">
        {ok ? <><CheckCircle size={13} /> تم الحفظ</> : saving ? "جارٍ الحفظ…" : "حفظ"}
      </button>
    </div>
  );
}

function TextField({ label, value, hasValue, hint, onSave }: {
  label: string; value: string; hasValue: boolean; hint?: string; onSave: (val: string) => Promise<void>;
}) {
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => { setVal(value); }, [value]);

  const save = async () => {
    if (!val.trim()) return;
    setSaving(true); setOk(false);
    await onSave(val.trim());
    setSaving(false); setOk(true);
    setTimeout(() => setOk(false), 3000);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-gray-400 flex items-center gap-2">
        {label}
        {hasValue && <span className="text-[10px] bg-green-500/20 text-green-400 rounded px-1.5 py-0.5">مضبوط ✓</span>}
      </label>
      {hint && <p className="text-[11px] text-gray-600">{hint}</p>}
      <div className="flex gap-2">
        <input type="email" value={val} onChange={e => setVal(e.target.value)}
          className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 outline-none text-sm" />
        <button onClick={save} disabled={saving || !val.trim()}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg px-4 py-1.5 text-xs font-medium transition-colors whitespace-nowrap">
          {ok ? <><CheckCircle size={13} /> تم</> : saving ? "…" : "حفظ"}
        </button>
      </div>
    </div>
  );
}

const ICON_OPTIONS = [
  { value: "truck", label: "🚚 شاحنة" }, { value: "shield", label: "🛡 درع" },
  { value: "zap", label: "⚡ صاعقة" }, { value: "phone", label: "📞 هاتف" },
  { value: "star", label: "⭐ نجمة" }, { value: "package", label: "📦 صندوق" },
  { value: "mail", label: "✉️ بريد" }, { value: "check-circle", label: "✅ صح" },
];

function ContentTab({ token, base }: { token: string; base: string }) {
  const auth = { Authorization: `DevAuth ${token}` };
  const [section, setSection] = useState<"texts" | "images" | "services" | "emails">("texts");

  /* ── Text content ── */
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [textSaving, setTextSaving] = useState(false);
  const [textMsg, setTextMsg] = useState("");
  const TEXT_FIELDS = [
    { key: "hero_title",     label: "عنوان الهيرو الرئيسي", hint: "سطر أول\\nسطر أخير (يظهر بالبرتقالي)", multi: true  },
    { key: "hero_subtitle",  label: "النص التعريفي تحت العنوان",                                        multi: false },
    { key: "cta_browse",     label: "نص زر «تصفح المنتجات»",                                            multi: false },
    { key: "cta_register",   label: "نص زر «سجل الآن»",                                                 multi: false },
    { key: "footer_tagline", label: "نص قسم الفوتر (وصف الشركة)",                                       multi: false },
    { key: "dev_credit",     label: "نص شريط المطور في الأسفل",                                          multi: false },
    { key: "dev_whatsapp",   label: "رقم واتساب المطور (بدون +، مثال: 966571748340)",                   multi: false },
  ];

  const loadTexts = useCallback(async () => {
    const r = await fetch(`${base}/api/mkgh/site-content`, { headers: auth });
    if (r.ok) setTexts(await r.json());
  }, [base, token]);

  useEffect(() => { if (section === "texts") loadTexts(); }, [section, loadTexts]);

  const saveTexts = async () => {
    setTextSaving(true); setTextMsg("");
    const r = await fetch(`${base}/api/mkgh/site-content`, { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(texts) });
    setTextSaving(false);
    setTextMsg(r.ok ? "✓ تم الحفظ بنجاح" : "✗ فشل الحفظ");
    setTimeout(() => setTextMsg(""), 3000);
  };

  /* ── Hero images ── */
  const [images, setImages] = useState<string[]>([]);
  const [imgInput, setImgInput] = useState("");
  const [imgSaving, setImgSaving] = useState(false);

  const loadImages = useCallback(async () => {
    const r = await fetch(`${base}/api/mkgh/site-content`, { headers: auth });
    if (r.ok) {
      const d = await r.json();
      try { setImages(JSON.parse(d.hero_images ?? "[]")); } catch { setImages([]); }
    }
  }, [base, token]);

  useEffect(() => { if (section === "images") loadImages(); }, [section, loadImages]);

  const saveImages = async (imgs: string[]) => {
    setImgSaving(true);
    await fetch(`${base}/api/mkgh/site-content`, { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ hero_images: JSON.stringify(imgs) }) });
    setImgSaving(false);
    setImages(imgs);
  };
  const addImage = () => {
    const url = imgInput.trim();
    if (!url) return;
    const newImgs = [...images, url];
    setImgInput("");
    saveImages(newImgs);
  };
  const removeImage = (i: number) => saveImages(images.filter((_, idx) => idx !== i));

  /* ── Services ── */
  const [services, setServices] = useState<{ id: number; icon: string; label: string; sub: string; sort_order: number; active: number }[]>([]);
  const [svcEdit, setSvcEdit] = useState<number | "new" | null>(null);
  const [svcForm, setSvcForm] = useState({ icon: "truck", label: "", sub: "", sort_order: 0, active: 1 });
  const [svcSaving, setSvcSaving] = useState(false);

  const loadSvcs = useCallback(async () => {
    const r = await fetch(`${base}/api/mkgh/site-services`, { headers: auth });
    if (r.ok) setServices(await r.json());
  }, [base, token]);
  useEffect(() => { if (section === "services") loadSvcs(); }, [section, loadSvcs]);

  const saveSvc = async () => {
    setSvcSaving(true);
    const isNew = svcEdit === "new";
    const url = isNew ? `${base}/api/mkgh/site-services` : `${base}/api/mkgh/site-services/${svcEdit}`;
    await fetch(url, { method: isNew ? "POST" : "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(svcForm) });
    setSvcSaving(false); setSvcEdit(null); await loadSvcs();
  };
  const delSvc = async (id: number) => {
    if (!confirm("حذف هذه الخدمة؟")) return;
    await fetch(`${base}/api/mkgh/site-services/${id}`, { method: "DELETE", headers: auth });
    await loadSvcs();
  };

  /* ── Emails ── */
  const [emails, setEmails] = useState<{ id: number; label: string; email: string; sort_order: number; active: number }[]>([]);
  const [emEdit, setEmEdit] = useState<number | "new" | null>(null);
  const [emForm, setEmForm] = useState({ label: "", email: "", sort_order: 0, active: 1 });
  const [emSaving, setEmSaving] = useState(false);

  const loadEmails = useCallback(async () => {
    const r = await fetch(`${base}/api/mkgh/site-emails`, { headers: auth });
    if (r.ok) setEmails(await r.json());
  }, [base, token]);
  useEffect(() => { if (section === "emails") loadEmails(); }, [section, loadEmails]);

  const saveEmail = async () => {
    if (!emForm.email.trim()) return;
    setEmSaving(true);
    const isNew = emEdit === "new";
    const url = isNew ? `${base}/api/mkgh/site-emails` : `${base}/api/mkgh/site-emails/${emEdit}`;
    await fetch(url, { method: isNew ? "POST" : "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(emForm) });
    setEmSaving(false); setEmEdit(null); await loadEmails();
  };
  const delEmail = async (id: number) => {
    if (!confirm("حذف هذا الإيميل؟")) return;
    await fetch(`${base}/api/mkgh/site-emails/${id}`, { method: "DELETE", headers: auth });
    await loadEmails();
  };

  const SUB_TABS = [
    { key: "texts",    label: "✏️ النصوص" },
    { key: "images",   label: "🖼 صور الخلفية" },
    { key: "services", label: "🏷 الخدمات" },
    { key: "emails",   label: "📧 الإيميلات" },
  ] as const;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-300">📝 محتوى الموقع</h2>

      {/* Sub-tab bar */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800">
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSection(t.key as typeof section)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${section === t.key ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Texts ── */}
      {section === "texts" && (
        <div className="space-y-3">
          {TEXT_FIELDS.map(f => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs text-gray-400">{f.label}</label>
              {f.multi ? (
                <textarea value={texts[f.key] ?? ""} onChange={e => setTexts(t => ({ ...t, [f.key]: e.target.value }))} rows={3}
                  className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 outline-none text-sm resize-none" />
              ) : (
                <input value={texts[f.key] ?? ""} onChange={e => setTexts(t => ({ ...t, [f.key]: e.target.value }))}
                  className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 outline-none text-sm" />
              )}
              {f.hint && <p className="text-gray-600 text-[10px]">{f.hint}</p>}
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button onClick={saveTexts} disabled={textSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg px-5 py-2 text-xs font-medium flex items-center gap-1.5">
              {textSaving ? "جارٍ الحفظ…" : <><CheckCircle size={12} /> حفظ النصوص</>}
            </button>
            {textMsg && <span className={`text-xs ${textMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>{textMsg}</span>}
          </div>
        </div>
      )}

      {/* ── Background images ── */}
      {section === "images" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">صور خلفية شريط الهيرو (تدور بشكل تلقائي مع تأثير Ken Burns)</p>
          <div className="space-y-2">
            {images.map((url, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg p-2">
                <img src={url} alt="" className="w-16 h-10 object-cover rounded flex-shrink-0 bg-gray-800" onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='40'%3E%3Crect fill='%23374151' width='64' height='40'/%3E%3C/svg%3E"; }} />
                <p className="flex-1 text-xs text-gray-400 truncate font-mono" dir="ltr">{url}</p>
                <button onClick={() => removeImage(i)} className="text-red-400 hover:text-red-300 flex-shrink-0"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={imgInput} onChange={e => setImgInput(e.target.value)}
              placeholder="https://... رابط صورة"
              dir="ltr" className="flex-1 bg-gray-900 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 outline-none text-xs font-mono" />
            <button onClick={addImage} disabled={imgSaving || !imgInput.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1">
              <Plus size={12} /> إضافة
            </button>
          </div>
          <p className="text-gray-600 text-[10px]">يمكنك استخدام روابط Unsplash أو أي صورة عامة (https://)</p>
        </div>
      )}

      {/* ── Services ── */}
      {section === "services" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">شارات الخدمات الظاهرة أسفل الهيرو مباشرةً</p>
            <button onClick={() => { setSvcForm({ icon: "truck", label: "", sub: "", sort_order: services.length, active: 1 }); setSvcEdit("new"); }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
              <Plus size={12} /> إضافة
            </button>
          </div>
          {svcEdit !== null && (
            <div className="bg-gray-900 border border-blue-500/30 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-blue-400">{svcEdit === "new" ? "إضافة خدمة" : "تعديل الخدمة"}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">الأيقونة</label>
                  <select value={svcForm.icon} onChange={e => setSvcForm(f => ({ ...f, icon: e.target.value }))}
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 outline-none text-sm">
                    {ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">الترتيب</label>
                  <input type="number" value={svcForm.sort_order} onChange={e => setSvcForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 outline-none text-sm text-center" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">العنوان الرئيسي</label>
                <input value={svcForm.label} onChange={e => setSvcForm(f => ({ ...f, label: e.target.value }))} placeholder="مثال: توصيل سريع"
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 outline-none text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">النص الثانوي</label>
                <input value={svcForm.sub} onChange={e => setSvcForm(f => ({ ...f, sub: e.target.value }))} placeholder="مثال: لجميع مناطق المملكة"
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 outline-none text-sm" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={svcForm.active === 1} onChange={e => setSvcForm(f => ({ ...f, active: e.target.checked ? 1 : 0 }))} className="w-4 h-4 accent-blue-500" />
                <span className="text-xs text-gray-300">مفعّل</span>
              </label>
              <div className="flex gap-2">
                <button onClick={saveSvc} disabled={svcSaving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg px-4 py-1.5 text-xs font-medium flex items-center gap-1.5">
                  {svcSaving ? "جارٍ…" : <><CheckCircle size={12} /> حفظ</>}
                </button>
                <button onClick={() => setSvcEdit(null)} className="text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 text-xs flex items-center gap-1"><X size={12} /> إلغاء</button>
              </div>
            </div>
          )}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {services.length === 0 ? <p className="p-6 text-center text-gray-600 text-xs">لا توجد خدمات — اضغط إضافة</p> : (
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-800 text-gray-500">
                  <th className="px-4 py-2.5 text-right font-medium">الأيقونة</th>
                  <th className="px-4 py-2.5 text-right font-medium">العنوان</th>
                  <th className="px-4 py-2.5 text-right font-medium">النص الثانوي</th>
                  <th className="px-4 py-2.5 text-center font-medium">الحالة</th>
                  <th className="px-4 py-2.5 text-center font-medium">إجراء</th>
                </tr></thead>
                <tbody>{services.map(s => (
                  <tr key={s.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${s.active === 0 ? "opacity-40" : ""}`}>
                    <td className="px-4 py-2.5 text-lg">{ICON_OPTIONS.find(o => o.value === s.icon)?.label.split(" ")[0] ?? "•"}</td>
                    <td className="px-4 py-2.5 font-medium text-white">{s.label}</td>
                    <td className="px-4 py-2.5 text-gray-400">{s.sub}</td>
                    <td className="px-4 py-2.5 text-center">{s.active ? <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">مفعّل</span> : <span className="text-[10px] bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded">مخفي</span>}</td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setSvcForm({ icon: s.icon, label: s.label, sub: s.sub, sort_order: s.sort_order, active: s.active }); setSvcEdit(s.id); }} className="text-blue-400 hover:text-blue-300"><Pencil size={13} /></button>
                        <button onClick={() => delSvc(s.id)} className="text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Emails ── */}
      {section === "emails" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">إيميلات الشركة تظهر في الفوتر أسفل وصف الشركة</p>
            <button onClick={() => { setEmForm({ label: "", email: "", sort_order: emails.length, active: 1 }); setEmEdit("new"); }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
              <Plus size={12} /> إضافة إيميل
            </button>
          </div>
          {emEdit !== null && (
            <div className="bg-gray-900 border border-blue-500/30 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-blue-400">{emEdit === "new" ? "إضافة إيميل" : "تعديل الإيميل"}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">المسمى (اختياري)</label>
                  <input value={emForm.label} onChange={e => setEmForm(f => ({ ...f, label: e.target.value }))} placeholder="مثال: خدمة العملاء"
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 outline-none text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">الإيميل</label>
                  <input value={emForm.email} onChange={e => setEmForm(f => ({ ...f, email: e.target.value }))} placeholder="example@domain.com" dir="ltr"
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 outline-none text-sm text-right" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={emForm.active === 1} onChange={e => setEmForm(f => ({ ...f, active: e.target.checked ? 1 : 0 }))} className="w-4 h-4 accent-blue-500" />
                  <span className="text-xs text-gray-300">يظهر في الموقع</span>
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400">الترتيب:</label>
                  <input type="number" value={emForm.sort_order} onChange={e => setEmForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                    className="w-14 bg-gray-800 text-white rounded-lg px-2 py-1.5 border border-gray-700 outline-none text-sm text-center" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveEmail} disabled={emSaving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg px-4 py-1.5 text-xs font-medium flex items-center gap-1.5">
                  {emSaving ? "جارٍ…" : <><CheckCircle size={12} /> حفظ</>}
                </button>
                <button onClick={() => setEmEdit(null)} className="text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 text-xs flex items-center gap-1"><X size={12} /> إلغاء</button>
              </div>
            </div>
          )}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {emails.length === 0 ? <p className="p-6 text-center text-gray-600 text-xs">لا توجد إيميلات — اضغط إضافة إيميل</p> : (
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-800 text-gray-500">
                  <th className="px-4 py-2.5 text-right font-medium">المسمى</th>
                  <th className="px-4 py-2.5 text-right font-medium">الإيميل</th>
                  <th className="px-4 py-2.5 text-center font-medium">الحالة</th>
                  <th className="px-4 py-2.5 text-center font-medium">إجراء</th>
                </tr></thead>
                <tbody>{emails.map(e => (
                  <tr key={e.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${e.active === 0 ? "opacity-40" : ""}`}>
                    <td className="px-4 py-2.5 text-gray-300">{e.label || "—"}</td>
                    <td className="px-4 py-2.5 text-white font-mono" dir="ltr">{e.email}</td>
                    <td className="px-4 py-2.5 text-center">{e.active ? <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">ظاهر</span> : <span className="text-[10px] bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded">مخفي</span>}</td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setEmForm({ label: e.label, email: e.email, sort_order: e.sort_order, active: e.active }); setEmEdit(e.id); }} className="text-blue-400 hover:text-blue-300"><Pencil size={13} /></button>
                        <button onClick={() => delEmail(e.id)} className="text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ContactEntry {
  id: number; label: string; phone: string; has_whatsapp: number; sort_order: number; active: number;
}

function ContactsTab({ token, base }: { token: string; base: string }) {
  const [entries, setEntries] = useState<ContactEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState({ label: "", phone: "", has_whatsapp: 1, sort_order: 0, active: 1 });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const auth = { Authorization: `DevAuth ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${base}/api/mkgh/contacts`, { headers: auth });
    if (r.ok) setEntries(await r.json());
    setLoading(false);
  }, [base, token]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (e: ContactEntry) => {
    setForm({ label: e.label, phone: e.phone, has_whatsapp: e.has_whatsapp, sort_order: e.sort_order, active: e.active });
    setEditingId(e.id);
    setErr("");
  };

  const startNew = () => {
    setForm({ label: "", phone: "", has_whatsapp: 1, sort_order: entries.length, active: 1 });
    setEditingId("new");
    setErr("");
  };

  const cancel = () => { setEditingId(null); setErr(""); };

  const save = async () => {
    if (!form.phone.trim()) { setErr("رقم الهاتف مطلوب"); return; }
    if (!form.label.trim()) { setErr("المسمى مطلوب"); return; }
    setSaving(true); setErr("");
    const isNew = editingId === "new";
    const url = isNew ? `${base}/api/mkgh/contacts` : `${base}/api/mkgh/contacts/${editingId}`;
    const method = isNew ? "POST" : "PUT";
    const r = await fetch(url, { method, headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (r.ok) { setEditingId(null); await load(); } else { setErr("فشل الحفظ"); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا الرقم؟")) return;
    await fetch(`${base}/api/mkgh/contacts/${id}`, { method: "DELETE", headers: auth });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><Phone size={14} /> أرقام التواصل (واجهة الموقع)</h2>
        <button onClick={startNew}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors">
          <Plus size={12} /> إضافة رقم
        </button>
      </div>

      {/* Add / Edit Form */}
      {editingId !== null && (
        <div className="bg-gray-900 border border-blue-500/30 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-blue-400">{editingId === "new" ? "إضافة رقم جديد" : "تعديل الرقم"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">المسمى (مثال: مدير المبيعات)</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="المسمى الوظيفي أو الاسم"
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 outline-none text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">رقم الجوال</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="05xxxxxxxx" dir="ltr"
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 outline-none text-sm text-right" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.has_whatsapp === 1}
                onChange={e => setForm(f => ({ ...f, has_whatsapp: e.target.checked ? 1 : 0 }))}
                className="w-4 h-4 accent-green-500" />
              <span className="text-xs text-gray-300">يدعم واتساب</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active === 1}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked ? 1 : 0 }))}
                className="w-4 h-4 accent-blue-500" />
              <span className="text-xs text-gray-300">مفعّل (يظهر في الموقع)</span>
            </label>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">الترتيب:</label>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                className="w-16 bg-gray-800 text-white rounded-lg px-2 py-1.5 border border-gray-700 focus:border-blue-500 outline-none text-sm text-center" />
            </div>
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg px-4 py-1.5 text-xs font-medium">
              {saving ? "جارٍ الحفظ…" : <><CheckCircle size={12} /> حفظ</>}
            </button>
            <button onClick={cancel} className="flex items-center gap-1.5 text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 text-xs">
              <X size={12} /> إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Entries List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600 text-xs">جارٍ التحميل…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-gray-600 text-xs">لا توجد أرقام — اضغط "إضافة رقم" لإضافة أول رقم</div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-800 text-gray-500">
              <th className="px-4 py-2.5 text-right font-medium">المسمى</th>
              <th className="px-4 py-2.5 text-right font-medium">الرقم</th>
              <th className="px-4 py-2.5 text-center font-medium">واتساب</th>
              <th className="px-4 py-2.5 text-center font-medium">الترتيب</th>
              <th className="px-4 py-2.5 text-center font-medium">الحالة</th>
              <th className="px-4 py-2.5 text-center font-medium">إجراء</th>
            </tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${e.active === 0 ? "opacity-40" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-white">{e.label}</td>
                  <td className="px-4 py-2.5 text-gray-300 font-mono" dir="ltr">{e.phone}</td>
                  <td className="px-4 py-2.5 text-center">{e.has_whatsapp ? <span className="text-green-400">✓</span> : <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{e.sort_order}</td>
                  <td className="px-4 py-2.5 text-center">
                    {e.active ? <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">مفعّل</span>
                      : <span className="text-[10px] bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded">مخفي</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => startEdit(e)} className="text-blue-400 hover:text-blue-300 transition-colors"><Pencil size={13} /></button>
                      <button onClick={() => del(e.id)} className="text-red-400 hover:text-red-300 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-600">هذه الأرقام تظهر في قسم "تواصل معنا" في الصفحة الرئيسية للموقع</p>
    </div>
  );
}

function SettingsTab({ config, onSave }: {
  config: ConfigEntry[];
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const get = (k: string) => config.find(c => c.key === k);

  return (
    <div className="grid md:grid-cols-2 gap-5">
      {/* Email settings */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-300 border-b border-gray-800 pb-3">📧 إعدادات الإيميل</h2>

        <TextField
          label="بريد استلام OTP"
          hint="الإيميل الذي ترسل إليه رمز التحقق عند تسجيل الدخول بـ mkgh"
          value={get("otp_email")?.value ?? ""}
          hasValue={get("otp_email")?.has_value ?? false}
          onSave={v => onSave("otp_email", v)}
        />

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 flex items-center gap-2">
            بريد الإرسال (Gmail)
            {get("gmail_user")?.has_value && <span className="text-[10px] bg-green-500/20 text-green-400 rounded px-1.5 py-0.5">مضبوط ✓</span>}
          </label>
          <p className="text-[11px] text-gray-600">حساب Gmail الذي يُرسل منه الإيميل</p>
          <div className="flex gap-2">
            <input
              type="email"
              defaultValue={get("gmail_user")?.value ?? ""}
              id="gmail_user_input"
              className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 outline-none text-sm"
            />
            <button
              onClick={() => {
                const v = (document.getElementById("gmail_user_input") as HTMLInputElement).value;
                if (v) onSave("gmail_user", v);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-1.5 text-xs font-medium transition-colors whitespace-nowrap"
            >حفظ</button>
          </div>
        </div>

        <PwField
          label={`كلمة مرور Gmail App ${get("gmail_pass")?.has_value ? "✓" : "⚠️ غير مضبوطة"}`}
          hint='أنشئها من: Google Account ← Security ← 2-Step ← App Passwords'
          onSave={v => onSave("gmail_pass", v)}
        />

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-[11px] text-blue-300 space-y-1" dir="rtl">
          <div className="font-semibold">كيفية الحصول على Gmail App Password:</div>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-400">
            <li>فعّل التحقق بخطوتين في حساب Google</li>
            <li>اذهب إلى: myaccount.google.com/apppasswords</li>
            <li>أنشئ تطبيقاً جديداً (اسمه "MKGH")</li>
            <li>انسخ كلمة المرور المكونة من 16 حرفاً</li>
          </ol>
        </div>
      </div>

      {/* Password settings */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-300 border-b border-gray-800 pb-3">🔐 كلمات المرور</h2>

        <PwField
          label={`كلمة مرور mkgh الإدارية ${get("mkgh_password")?.has_value ? "" : "⚠️"}`}
          hint='كلمة المرور المستخدمة مع phone="mkgh" لتسجيل الدخول كمدير النظام'
          onSave={v => onSave("mkgh_password", v)}
        />

        <PwField
          label="كلمة مرور لوحة المطور"
          hint="تغيير كلمة مرور صفحة /mkgh — سيتطلب تسجيل الدخول من جديد"
          onSave={v => onSave("dev_password", v)}
        />

        <PwField
          label={`كلمة مرور حسابات الإيجار والعهدة ${get("rental_accounts_password_hash")?.has_value ? "✓" : ""}`}
          hint="تغيير كلمة المرور المطلوبة لفتح تاب حسابات الإيجار والعهدة — تُحفظ مشفّرة وتُلغي جلسات الفتح القديمة"
          onSave={v => onSave("rental_accounts_password", v)}
        />
      </div>

      {/* ── Trips / Vehicle stops toggle ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4 md:col-span-2">
        <h2 className="text-sm font-semibold text-gray-300 border-b border-gray-800 pb-3">🚛 إعدادات رحلات السيارات</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-white font-medium">تسجيل توقف السيارات تلقائياً عند منتصف الليل</div>
            <div className="text-xs text-gray-500 mt-1">
              يسجّل توقف كل سيارة نقليات لم تُسجَّل لها رحلة في ذلك اليوم — إذا كانت في الورشة يُظهر "في الورشة"، وإلا "توقف بدون عذر". تظهر السجلات في صفحة الردود.
            </div>
          </div>
          <button
            onClick={() => onSave("show_vehicle_stops", get("show_vehicle_stops")?.value === "1" ? "0" : "1")}
            className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
              get("show_vehicle_stops")?.value === "1" ? "bg-green-500" : "bg-gray-700"
            }`}
            title={get("show_vehicle_stops")?.value === "1" ? "مفعّل — انقر للإيقاف" : "موقوف — انقر للتفعيل"}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              get("show_vehicle_stops")?.value === "1" ? "translate-x-6" : "translate-x-0.5"
            }`} />
          </button>
        </div>
        <p className="text-[11px] text-gray-600">
          الحالة الحالية:{" "}
          <span className={get("show_vehicle_stops")?.value === "1" ? "text-green-400" : "text-gray-500"}>
            {get("show_vehicle_stops")?.value === "1" ? "✓ مفعّل" : "○ موقوف"}
          </span>
        </p>
      </div>
    </div>
  );
}

export default function DevDashboard() {
  const [authed, setAuthed] = useState(() => !!sessionStorage.getItem(TOKEN_KEY));
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"sessions" | "audit" | "stats" | "settings" | "contacts" | "content">("sessions");
  const [showCard, setShowCard] = useState(false);
  const [cardInfo, setCardInfo] = useState<Record<string,string>>({});
  const [cardEditing, setCardEditing] = useState(false);
  const [cardForm, setCardForm] = useState<Record<string,string>>({});
  const [cardSaving, setCardSaving] = useState(false);
  const [cardMsg, setCardMsg] = useState("");
  const loadCard = useCallback(async () => {
    const t = getToken();
    const r = await fetch(`${BASE}/api/mkgh/business-card`, { headers: { Authorization: `DevAuth ${t}` } });
    if (r.ok) { const d = await r.json(); setCardInfo(d); setCardForm(d); }
  }, []);
  useEffect(() => { if (showCard) loadCard(); }, [showCard, loadCard]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [config, setConfig] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const getToken = () => sessionStorage.getItem(TOKEN_KEY) ?? "";

  const apiGet = useCallback(async (path: string) => {
    const r = await fetch(`${BASE}/api${path}`, { headers: { Authorization: `DevAuth ${getToken()}` } });
    if (r.status === 401) { sessionStorage.removeItem(TOKEN_KEY); setAuthed(false); return null; }
    return r.ok ? r.json() : null;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, a, st, cfg] = await Promise.all([
      apiGet("/mkgh/sessions"), apiGet("/mkgh/audit"),
      apiGet("/mkgh/stats"), apiGet("/mkgh/config"),
    ]);
    if (s)   setSessions(s);
    if (a)   setAudit(a);
    if (st)  setStats(st);
    if (cfg) setConfig(cfg);
    setLoading(false);
  }, [apiGet]);

  useEffect(() => { if (authed) refresh(); }, [authed, refresh]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setLoginErr("");
    try {
      const r = await fetch(`${BASE}/api/mkgh/auth`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        const { token: t } = await r.json();
        sessionStorage.setItem(TOKEN_KEY, t);
        setAuthed(true);
      } else { setLoginErr("كلمة مرور خاطئة"); }
    } catch { setLoginErr("خطأ في الاتصال"); }
    finally { setBusy(false); }
  };

  const saveConfig = useCallback(async (key: string, value: string) => {
    await fetch(`${BASE}/api/mkgh/config`, {
      method: "PUT", headers: { "Content-Type": "application/json", Authorization: `DevAuth ${getToken()}` },
      body: JSON.stringify({ [key]: value }),
    });
    // If dev_password changed, we'll be kicked out on next request (server clears tokens)
    if (key === "dev_password") {
      sessionStorage.removeItem(TOKEN_KEY);
      setAuthed(false);
    } else {
      await refresh(); // reload config to show updated has_value
    }
  }, [refresh]);

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4" dir="rtl">
        <form onSubmit={handleLogin} className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-sm space-y-4 shadow-2xl">
          <div className="text-center mb-2">
            <div className="w-14 h-14 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-black text-blue-400">M</span>
            </div>
            <h1 className="text-xl font-bold text-white">لوحة المطور</h1>
            <p className="text-gray-500 text-sm mt-1">MKGH Developer Dashboard</p>
          </div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="كلمة مرور المطور" autoComplete="current-password"
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:border-blue-500 outline-none text-sm" />
          {loginErr && <p className="text-red-400 text-sm text-center">{loginErr}</p>}
          <button type="submit" disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl py-3 font-semibold text-sm transition-colors">
            {busy ? "جارٍ التحقق…" : "دخول"}
          </button>
        </form>
      </div>
    );
  }

  const filteredSessions = filter
    ? sessions.filter(s => s.name?.includes(filter) || s.phone?.includes(filter) || s.role?.includes(filter) || s.ip_address?.includes(filter))
    : sessions;
  const filteredAudit = filter
    ? audit.filter(e => e.path?.includes(filter) || e.user_name?.includes(filter) || e.method === filter.toUpperCase())
    : audit;

  const TABS = [
    ["sessions", "جلسات الدخول"],
    ["audit",    "سجل النشاط"],
    ["stats",    "الإحصائيات"],
    ["content",  "محتوى الموقع"],
    ["contacts", "أرقام التواصل"],
    ["settings", "الإعدادات"],
  ] as const;

  return (
    <div className="min-h-screen bg-gray-950 text-white" dir="rtl">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600/30 border border-blue-500/40 rounded-lg flex items-center justify-center">
            <span className="text-sm font-black text-blue-400">M</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">لوحة المطور — MKGH</h1>
            <p className="text-xs text-gray-500 mt-0.5">Developer Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCard(true)}
            className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/60 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg px-3 py-1.5 transition-colors font-medium">
            🪪 الكارت الشخصي
          </button>
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition-colors">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />تحديث
          </button>
          <button onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setAuthed(false); }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 border border-gray-800 hover:border-red-500/40 rounded-lg px-3 py-1.5 transition-colors">
            <LogOut size={12} />خروج
          </button>
        </div>
      </header>

      {/* ── Business Card Modal ── */}
      {showCard && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 overflow-y-auto" onClick={() => { setShowCard(false); setCardEditing(false); }}>
          <div className="bg-[#0f1117] rounded-2xl shadow-2xl border border-white/10 overflow-hidden w-full max-w-2xl my-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">🪪 الكارت الشخصي</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => { setCardEditing(e => !e); setCardMsg(""); }}
                  className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 transition-colors font-medium border ${cardEditing ? "bg-white/10 text-white border-white/20" : "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"}`}>
                  <Pencil size={11} /> {cardEditing ? "إغلاق التعديل" : "تعديل البيانات"}
                </button>
                <a href="/business-card.html" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs bg-blue-600/90 hover:bg-blue-600 text-white rounded-lg px-3 py-1.5 transition-colors font-medium">
                  🖨 طباعة
                </a>
                <button onClick={() => { setShowCard(false); setCardEditing(false); }} className="text-gray-500 hover:text-white p-1.5 rounded-lg transition-colors">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Card previews */}
            <div className="px-6 pt-7 pb-5 flex flex-col sm:flex-row gap-8 items-center justify-center bg-gradient-to-b from-[#0f1117] to-[#141820]">
              {/* FRONT */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] text-gray-500 tracking-widest uppercase">الوجه الأمامي</p>
                <div style={{ width: 321, height: 208, borderRadius: 15, position: "relative", overflow: "hidden",
                  background: hexGrad(cardInfo.front_color ?? "#12223d", "front"),
                  boxShadow: "0 25px 60px rgba(0,0,0,0.55),0 6px 20px rgba(0,0,0,0.3)" }}>
                  {/* Background image overlay */}
                  {cardInfo.bg_image && (
                    <div style={{ position:"absolute",inset:0,overflow:"hidden",zIndex:0,pointerEvents:"none" }}>
                      <img src={cardInfo.bg_image} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",opacity:(parseFloat(cardInfo.bg_opacity??'20')/100) }} />
                    </div>
                  )}
                  {/* Gold top bar */}
                  <div style={{ position:"absolute",top:0,left:0,right:0,height:4,background:"linear-gradient(90deg,#c8a951,#f0d278,#c8a951)",zIndex:2 }} />
                  {/* Glow orb */}
                  <div style={{ position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",background:"radial-gradient(circle,rgba(200,169,81,0.12) 0%,transparent 70%)",zIndex:1 }} />
                  {/* Top row */}
                  <div style={{ position:"absolute",top:18,left:20,right:20,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                    <img src={cardInfo.logo_data || "/jefer-logo-new.png"} alt="JEFER" style={{ height:42,objectFit:"contain" }} />
                    <div style={{ fontSize:8,color:"#c8a951",lineHeight:1.6,textAlign:"left",direction:"ltr",letterSpacing:"0.3px",opacity:0.9 }}>
                      {(cardInfo.tagline ?? "للمقاولات والنقليات\nContracting & Logistics").split("\n").map((l,i) => <div key={i}>{l}</div>)}
                    </div>
                  </div>
                  {/* Divider */}
                  <div style={{ position:"absolute",top:78,left:20,right:20,borderTop:"1px solid rgba(200,169,81,0.3)" }} />
                  {/* Bottom info */}
                  <div style={{ position:"absolute",bottom:20,left:20,right:20 }}>
                    <div style={{ fontSize:8,fontWeight:600,color:cardInfo.color_company_f??"rgba(200,169,81,0.65)",letterSpacing:"1.5px",marginBottom:5,textTransform:"uppercase" }}>{cardInfo.company ?? "مجموعة جيفر"}</div>
                    <div style={{ fontSize:18,fontWeight:800,color:cardInfo.color_name??"#fff",marginBottom:4,letterSpacing:"0.3px" }}>{cardInfo.name ?? "أحمد الرشودي"}</div>
                    <div style={{ fontSize:9,fontWeight:500,color:cardInfo.color_title??"#c8a951",letterSpacing:"1px",marginBottom:8 }}>{cardInfo.job_title ?? "المدير العام"}</div>
                    <div style={{ display:"flex",alignItems:"center",gap:6,direction:"ltr" }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill={cardInfo.color_tagline??"#c8a951"}><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
                      <span style={{ fontSize:13,fontWeight:700,color:cardInfo.color_phone??"#e8e8e8",letterSpacing:"0.5px",direction:"ltr" }}>{cardInfo.phone ?? "050 381 888"}</span>
                    </div>
                    {cardInfo.email && <div style={{ fontSize:8,color:cardInfo.color_email??"rgba(200,169,81,0.7)",marginTop:3,direction:"ltr",letterSpacing:"0.3px" }}>{cardInfo.email}</div>}
                  </div>
                </div>
              </div>

              {/* BACK */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] text-gray-500 tracking-widest uppercase">الوجه الخلفي</p>
                <div style={{ width: 321, height: 208, borderRadius: 15, position: "relative", overflow: "hidden",
                  background: hexGrad(cardInfo.back_color ?? "#f8f5ee", "back"),
                  boxShadow: "0 25px 60px rgba(0,0,0,0.55),0 6px 20px rgba(0,0,0,0.3)",
                  border: "1.5px solid #c8a951" }}>
                  {/* Inner border */}
                  <div style={{ position:"absolute",top:10,left:10,right:10,bottom:10,border:"0.7px solid rgba(200,169,81,0.3)",borderRadius:9,pointerEvents:"none" }} />
                  {/* Content */}
                  <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8 }}>
                    <img src={cardInfo.logo_data || "/jefer-logo-new.png"} alt="JEFER" style={{ height:48,objectFit:"contain",opacity:0.92 }} />
                    <div style={{ fontSize:13,fontWeight:700,color:cardInfo.color_company_b??"#8b6914",letterSpacing:"1px" }}>{cardInfo.company ?? "مجموعة جيفر"}</div>
                    <div style={{ width:110,height:1.5,background:"linear-gradient(90deg,transparent,#c8a951,transparent)" }} />
                    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:5 }}>
                      {cardInfo.credit_logo && <img src={cardInfo.credit_logo} alt="" style={{ height:12,objectFit:"contain",opacity:0.45 }} />}
                      <div style={{ fontSize:7,color:cardInfo.color_credit??"rgba(139,115,85,0.32)",fontWeight:500,textAlign:"center",lineHeight:1.6 }}>
                        {[cardInfo.credit_text,cardInfo.credit_brand,cardInfo.credit_phone ? '— '+cardInfo.credit_phone : ''].filter(Boolean).join(' ') || 'تصميم الكارت والموقع بواسطة MKGH — 0571748340'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Edit form */}
            {cardEditing && (
              <div className="border-t border-white/8 bg-[#0d1016] px-6 py-5 space-y-4">
                <p className="text-xs font-semibold text-gray-400">✏️ تعديل بيانات الكارت</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key:"name",      label:"الاسم الكامل" },
                    { key:"job_title", label:"المسمى الوظيفي" },
                    { key:"phone",     label:"رقم الهاتف" },
                    { key:"email",     label:"الإيميل (اختياري)" },
                    { key:"whatsapp",  label:"واتساب (بدون +، مثال: 96650...)" },
                  ].map(f => (
                    <div key={f.key} className="space-y-1">
                      <label className="text-[11px] text-gray-500">{f.label}</label>
                      <input value={cardForm[f.key] ?? ""} onChange={e => setCardForm(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-500/50 transition-colors" />
                    </div>
                  ))}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] text-gray-500">شعار الشركة (سطرين)</label>
                    <textarea value={cardForm.tagline ?? ""} onChange={e => setCardForm(p => ({ ...p, tagline: e.target.value }))} rows={2}
                      className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-500/50 transition-colors resize-none" />
                  </div>
                  {/* Card colours */}
                  <div className="sm:col-span-2">
                    <p className="text-[11px] text-amber-400/70 font-semibold mb-2">🎨 لون خلفية الكارت</p>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex flex-col items-center gap-1.5">
                        <label className="text-[11px] text-gray-500">الوجه الأمامي</label>
                        <div className="relative">
                          <input type="color" value={cardForm.front_color ?? "#12223d"}
                            onChange={e => setCardForm(p => ({ ...p, front_color: e.target.value }))}
                            className="w-12 h-9 rounded-lg border-2 border-white/10 cursor-pointer bg-transparent p-0.5" />
                          <div className="mt-1 text-[10px] text-gray-600 text-center">{cardForm.front_color ?? "#12223d"}</div>
                        </div>
                      </div>
                      <button onClick={() => setCardForm(p => ({ ...p, front_color: p.back_color ?? "#f8f5ee", back_color: p.front_color ?? "#12223d" }))}
                        className="mt-0.5 flex flex-col items-center gap-1 text-amber-400/70 hover:text-amber-400 transition-colors text-[18px]" title="تبديل الألوان">
                        ⇄
                        <span className="text-[9px]">تبديل</span>
                      </button>
                      <div className="flex flex-col items-center gap-1.5">
                        <label className="text-[11px] text-gray-500">الوجه الخلفي</label>
                        <div>
                          <input type="color" value={cardForm.back_color ?? "#f8f5ee"}
                            onChange={e => setCardForm(p => ({ ...p, back_color: e.target.value }))}
                            className="w-12 h-9 rounded-lg border-2 border-white/10 cursor-pointer bg-transparent p-0.5" />
                          <div className="mt-1 text-[10px] text-gray-600 text-center">{cardForm.back_color ?? "#f8f5ee"}</div>
                        </div>
                      </div>
                      {/* live mini preview */}
                      <div className="flex gap-2 mr-auto">
                        <div style={{ width:60,height:39,borderRadius:4,background:hexGrad(cardForm.front_color??'#12223d','front'),border:'1px solid rgba(200,169,81,0.4)',flexShrink:0 }} />
                        <div style={{ width:60,height:39,borderRadius:4,background:hexGrad(cardForm.back_color??'#f8f5ee','back'),border:'1.5px solid #c8a951',flexShrink:0 }} />
                      </div>
                    </div>
                    <button onClick={() => setCardForm(p => ({ ...p, front_color:"#12223d", back_color:"#f8f5ee" }))}
                      className="mt-2 text-[10px] text-gray-600 hover:text-amber-400 transition-colors underline underline-offset-2">↺ استعادة الألوان الافتراضية</button>
                  </div>
                  {/* Main logo */}
                  <div className="sm:col-span-2">
                    <p className="text-[11px] text-amber-400/70 font-semibold mb-2">🏷 لوجو الكارت (الأمامي والخلفي)</p>
                    <div className="flex items-center gap-3">
                      {cardForm.logo_data && (
                        <div className="relative">
                          <img src={cardForm.logo_data} alt="" className="h-10 w-auto object-contain rounded border border-white/10 p-1 bg-white/5" />
                          <button onClick={() => setCardForm(p => ({ ...p, logo_data: "" }))}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center leading-none">×</button>
                        </div>
                      )}
                      <label className="cursor-pointer flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300 transition-colors">
                        📁 {cardForm.logo_data ? "تغيير اللوجو" : "رفع اللوجو"}
                        <input type="file" accept="image/*" className="hidden" onChange={async e => {
                          const f = e.target.files?.[0]; if (!f) return;
                          const rd = new FileReader();
                          rd.onload = async ev => {
                            const compressed = await compressImage(ev.target?.result as string, 600, 0.92);
                            setCardForm(p => ({ ...p, logo_data: compressed }));
                          };
                          rd.readAsDataURL(f);
                        }} />
                      </label>
                    </div>
                  </div>
                  {/* Background image */}
                  <div className="sm:col-span-2">
                    <p className="text-[11px] text-amber-400/70 font-semibold mb-2">🖼 صورة خلفية الكارت الأمامي (ووترمارك)</p>
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          {cardForm.bg_image && (
                            <div className="relative">
                              <img src={cardForm.bg_image} alt="" className="h-10 w-16 object-cover rounded border border-white/10 opacity-70" />
                              <button onClick={() => setCardForm(p => ({ ...p, bg_image: "" }))}
                                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center leading-none">×</button>
                            </div>
                          )}
                          <label className="cursor-pointer flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300 transition-colors">
                            📁 {cardForm.bg_image ? "تغيير الخلفية" : "رفع صورة خلفية"}
                            <input type="file" accept="image/*" className="hidden" onChange={async e => {
                              const f = e.target.files?.[0]; if (!f) return;
                              const rd = new FileReader();
                              rd.onload = async ev => {
                                const compressed = await compressImage(ev.target?.result as string);
                                setCardForm(p => ({ ...p, bg_image: compressed }));
                              };
                              rd.readAsDataURL(f);
                            }} />
                          </label>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] text-gray-500">الدرجة المائية (الشفافية)</label>
                            <span className="text-[11px] text-amber-400 font-bold">{cardForm.bg_opacity ?? "20"}%</span>
                          </div>
                          <input type="range" min="0" max="100" step="1"
                            value={cardForm.bg_opacity ?? "20"}
                            onChange={e => setCardForm(p => ({ ...p, bg_opacity: e.target.value }))}
                            className="w-full accent-amber-500 h-1.5 rounded-full" />
                          <div className="flex justify-between text-[10px] text-gray-600">
                            <span>شفاف كلياً 0%</span>
                            <span>100% مرئي</span>
                          </div>
                        </div>
                      </div>
                      {/* mini live preview */}
                      {cardForm.bg_image && (
                        <div style={{ width:80,height:52,borderRadius:4,overflow:"hidden",background:hexGrad(cardForm.front_color??'#12223d','front'),border:"1px solid rgba(200,169,81,0.3)",flexShrink:0,position:"relative" }}>
                          <img src={cardForm.bg_image} alt="" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:(parseFloat(cardForm.bg_opacity??'20')/100) }} />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Text colours */}
                  <div className="sm:col-span-2">
                    <p className="text-[11px] text-amber-400/70 font-semibold mb-3">🖊 ألوان الخطوط</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([
                        { key:"color_name",      label:"الاسم الكامل",       def:"#ffffff", side:"أمامي" },
                        { key:"color_title",     label:"المسمى الوظيفي",     def:"#c8a951", side:"أمامي" },
                        { key:"color_phone",     label:"رقم الهاتف",         def:"#e8e8e8", side:"أمامي" },
                        { key:"color_tagline",   label:"شعار الشركة",        def:"#c8a951", side:"أمامي" },
                        { key:"color_company_f", label:"اسم الشركة",         def:"#c8a951", side:"أمامي" },
                        { key:"color_email",     label:"البريد الإلكتروني",  def:"#c8a951", side:"أمامي" },
                        { key:"color_company_b", label:"اسم الشركة",         def:"#8b6914", side:"خلفي"  },
                        { key:"color_credit",    label:"نص الإسناد",         def:"#8b7355", side:"خلفي"  },
                      ] as { key:string; label:string; def:string; side:string }[]).map(f => {
                        const cur = cardForm[f.key] ?? f.def;
                        const validHex = /^#[0-9a-fA-F]{6}$/.test(cur) ? cur : f.def;
                        return (
                          <div key={f.key} className="flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-xl px-3 py-2">
                            <input type="color" value={validHex}
                              onChange={e => setCardForm(p => ({ ...p, [f.key]: e.target.value }))}
                              className="w-8 h-7 rounded-md border border-white/10 cursor-pointer p-0 bg-transparent flex-shrink-0" />
                            <input type="text" value={cur}
                              onChange={e => setCardForm(p => ({ ...p, [f.key]: e.target.value }))}
                              onBlur={e => {
                                let v = e.target.value.trim();
                                if (!v.startsWith('#')) v = '#' + v;
                                if (/^#[0-9a-fA-F]{6}$/.test(v)) setCardForm(p => ({ ...p, [f.key]: v }));
                                else setCardForm(p => ({ ...p, [f.key]: f.def }));
                              }}
                              placeholder={f.def}
                              className="flex-1 min-w-0 bg-transparent text-gray-300 text-[11px] font-mono outline-none border-b border-white/10 focus:border-amber-500/50 py-0.5" />
                            <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
                              <span className="text-[10px] text-white/60 leading-tight">{f.label}</span>
                              <span className="text-[9px] text-gray-600">{f.side}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={() => setCardForm(p => ({ ...p,
                      color_name:"#ffffff", color_title:"#c8a951", color_phone:"#e8e8e8",
                      color_tagline:"#c8a951", color_company_f:"#c8a951", color_email:"#c8a951",
                      color_company_b:"#8b6914", color_credit:"#8b7355"
                    }))} className="mt-2 text-[10px] text-gray-600 hover:text-amber-400 transition-colors underline underline-offset-2">↺ استعادة ألوان الخطوط الافتراضية</button>
                  </div>
                  {/* Credit row */}
                  <div className="sm:col-span-2">
                    <p className="text-[11px] text-amber-400/70 font-semibold mb-2">✏️ نص الإسناد (الوجه الخلفي)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { key:"credit_text",  label:"نص بواسطة" },
                        { key:"credit_brand", label:"الاسم / البراند" },
                        { key:"credit_phone", label:"رقم التواصل" },
                      ].map(f => (
                        <div key={f.key} className="space-y-1">
                          <label className="text-[11px] text-gray-500">{f.label}</label>
                          <input value={cardForm[f.key] ?? ""} onChange={e => setCardForm(p => ({ ...p, [f.key]: e.target.value }))}
                            className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-500/50 transition-colors" />
                        </div>
                      ))}
                    </div>
                    {/* Logo upload */}
                    <div className="mt-3 space-y-2">
                      <label className="text-[11px] text-gray-500">لوجو صغير بجانب النص (اختياري)</label>
                      <div className="flex items-center gap-3">
                        {cardForm.credit_logo && (
                          <div className="relative">
                            <img src={cardForm.credit_logo} alt="" className="h-8 w-auto object-contain rounded opacity-80 border border-white/10 p-1 bg-white/5" />
                            <button onClick={() => setCardForm(p => ({ ...p, credit_logo: "" }))}
                              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center leading-none">×</button>
                          </div>
                        )}
                        <label className="cursor-pointer flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300 transition-colors">
                          📁 {cardForm.credit_logo ? "تغيير اللوجو" : "رفع لوجو"}
                          <input type="file" accept="image/*" className="hidden" onChange={async e => {
                            const f = e.target.files?.[0]; if (!f) return;
                            const rd = new FileReader();
                            rd.onload = async ev => {
                              const compressed = await compressImage(ev.target?.result as string, 400, 0.9);
                              setCardForm(p => ({ ...p, credit_logo: compressed }));
                            };
                            rd.readAsDataURL(f);
                          }} />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={async () => {
                    setCardSaving(true); setCardMsg("");
                    const t = getToken();
                    const r = await fetch(`${BASE}/api/mkgh/business-card`, { method:"PUT", headers:{ Authorization:`DevAuth ${t}`, "Content-Type":"application/json" }, body: JSON.stringify(cardForm) });
                    setCardSaving(false);
                    if (r.ok) { setCardInfo({ ...cardForm }); setCardMsg("✓ تم الحفظ"); setTimeout(() => setCardMsg(""), 3000); }
                    else setCardMsg("✗ فشل الحفظ");
                  }} disabled={cardSaving}
                    className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-xl px-5 py-2 text-xs font-bold transition-colors">
                    {cardSaving ? "جارٍ الحفظ…" : <><CheckCircle size={12} /> حفظ وتحديث الكارت</>}
                  </button>
                  {cardMsg && <span className={`text-xs ${cardMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>{cardMsg}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-5 space-y-5">
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={<Users size={16}/>}       label="المستخدمون"   value={stats.userCount}    color="blue" />
            <StatCard icon={<Clock size={16}/>}       label="جلسات نشطة"   value={stats.sessionCount} color="green" />
            <StatCard icon={<ShoppingBag size={16}/>} label="الطلبات"       value={stats.orderCount}   color="orange" />
            <StatCard icon={<Activity size={16}/>}    label="سجل النشاطات" value={stats.auditCount}   color="purple" />
            <StatCard icon={<Activity size={16}/>}    label="نشاطات اليوم" value={stats.todayActions} color="cyan" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
            {TABS.map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${tab === key ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}>
                {key === "settings" && <Settings size={11} />}{label}
              </button>
            ))}
          </div>
          {(tab === "sessions" || tab === "audit") && (
            <input value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="بحث في الجدول…"
              className="bg-gray-900 border border-gray-800 text-sm text-white rounded-xl px-3 py-2 outline-none focus:border-blue-500/60 w-52" />
          )}
        </div>

        {tab === "sessions" && <SessionsTab sessions={filteredSessions} />}
        {tab === "audit"    && <AuditTab entries={filteredAudit} />}
        {tab === "stats"    && stats && <StatsTab stats={stats} />}
        {tab === "content"  && <ContentTab  token={getToken()} base={BASE} />}
        {tab === "contacts" && <ContactsTab token={getToken()} base={BASE} />}
        {tab === "settings" && <SettingsTab config={config} onSave={saveConfig} />}
      </div>
    </div>
  );
}
