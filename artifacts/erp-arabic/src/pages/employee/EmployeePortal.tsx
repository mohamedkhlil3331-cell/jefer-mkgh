import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import {
  FileText, CalendarDays, TrendingUp, LogOut as LogOutIcon,
  Briefcase, Clock, CheckCircle, XCircle, Plus, ChevronDown,
  User, Phone, Send, Building2, Hash,
  ClipboardCheck, Truck, Warehouse, Car, Users2,
  Bell, AlertTriangle, ChevronRight, Star,
} from "lucide-react";

interface EmpProfile {
  id: number; name: string; job_title: string; department: string;
  entity: string; nationality: string; phone: string; email: string;
  salary: number; allowances: number; status: string; hire_date: string;
  iqama_end: string; driver_license_end: string; passport_end: string;
  efficiency: string;
}
interface HRRequest {
  id: number; employee_name: string; request_type: string; details: string;
  from_date: string; to_date: string; days: number;
  status: "pending" | "approved" | "rejected"; reviewed_by: string;
  review_notes: string; created_at: string;
}

const REQUEST_TYPES = [
  "إجازة سنوية","إجازة مرضية","إجازة طارئة","إجازة أمومة","إجازة حج",
  "زيادة راتب","استقالة","شكوى","طلب نقل","تقرير طبي","أخرى",
];
const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة", approved: "موافق عليه", rejected: "مرفوض",
};
const STATUS_CLS: Record<string, string> = {
  pending:  "bg-amber-50  text-amber-700  border-amber-200",
  approved: "bg-green-50  text-green-700  border-green-200",
  rejected: "bg-red-50    text-red-700    border-red-200",
};

const ROLE_INFO: Record<string, { label: string; icon: React.ElementType; color: string; href: string; pageLabel: string }> = {
  reviewer:   { label: "مراجع الطلبات",     icon: ClipboardCheck, color: "bg-indigo-600",  href: "/reviewer",   pageLabel: "مراجعة الطلبات"     },
  supervisor: { label: "مشرف النقليات",     icon: Truck,          color: "bg-orange-500",  href: "/supervisor", pageLabel: "صفحة النقليات"      },
  warehouse:  { label: "مسؤول المستودع",    icon: Warehouse,      color: "bg-green-600",   href: "/warehouse",  pageLabel: "صفحة المستودع"      },
  driver:     { label: "سائق",              icon: Car,            color: "bg-yellow-500",  href: "/driver",     pageLabel: "رحلاتي"             },
  rep:        { label: "مندوب مبيعات",      icon: Users2,         color: "bg-pink-500",    href: "/rep",        pageLabel: "طلبات المندوب"      },
};

const EMPTY_REQ = { request_type: "إجازة سنوية", details: "", from_date: "", to_date: "" };

export default function EmployeePortal() {
  const { user, logout } = useAuth();
  const { dir } = useLang();

  const [empProfile, setEmpProfile] = useState<EmpProfile | null>(null);
  const [requests, setRequests]     = useState<HRRequest[]>([]);
  const [workOrders, setWorkOrders] = useState<number>(0);
  const [newReq, setNewReq]         = useState({ ...EMPTY_REQ });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg]   = useState("");
  const [showForm, setShowForm]     = useState(false);
  const [tab, setTab]               = useState<"work"|"requests"|"profile">("work");

  const roleInfo = user ? ROLE_INFO[user.role] : null;

  // Load employee profile from employees table by phone
  useEffect(() => {
    if (!user) return;
    fetch(`/api/employees`)
      .then(r => r.json())
      .then((rows: EmpProfile[]) => {
        const match = Array.isArray(rows) ? rows.find(e => e.phone === user.phone || e.name === user.name) : null;
        if (match) setEmpProfile(match);
      })
      .catch(() => {});
  }, [user]);

  // Load HR requests
  const loadRequests = () => {
    if (!user) return;
    fetch(`/api/hr-requests`)
      .then(r => r.json())
      .then((rows: HRRequest[]) => {
        setRequests(Array.isArray(rows) ? rows.filter(r => r.employee_name === user.name) : []);
      }).catch(() => {});
  };

  // Load work stats
  useEffect(() => {
    if (!user || !user.role) return;
    loadRequests();
    fetch(`/api/workflow/orders?role=${user.role}`)
      .then(r => r.json())
      .then(d => {
        const arr = Array.isArray(d) ? d : d.orders ?? [];
        setWorkOrders(arr.filter((o: Record<string, unknown>) => o.stage !== "delivered" && o.stage !== "cancelled").length);
      })
      .catch(() => {});
  }, [user]);

  const submitRequest = async () => {
    if (!user || !newReq.request_type || !newReq.details) return;
    setSubmitting(true); setSubmitMsg("");
    try {
      const emp = empProfile;
      const r = await fetch("/api/hr-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: emp?.id ?? 0,
          employee_name: user.name,
          employee_job: emp?.job_title ?? roleInfo?.label ?? user.role,
          employee_dept: emp?.department ?? "—",
          ...newReq,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setSubmitMsg("✅ تم تقديم طلبك بنجاح، سيتم مراجعته قريباً");
        setNewReq({ ...EMPTY_REQ });
        setShowForm(false);
        loadRequests();
      } else setSubmitMsg(`❌ ${d.error}`);
    } catch { setSubmitMsg("❌ فشل الاتصال"); }
    finally { setSubmitting(false); }
  };

  if (!user || !roleInfo) return null;

  const pending  = requests.filter(r => r.status === "pending").length;
  const approved = requests.filter(r => r.status === "approved").length;
  const netSalary = (empProfile?.salary ?? 0) + (empProfile?.allowances ?? 0);

  // Check document expiries (within 60 days)
  const today = new Date();
  const expiring = [
    { label: "الإقامة",   date: empProfile?.iqama_end },
    { label: "رخصة القيادة", date: empProfile?.driver_license_end },
    { label: "جواز السفر",   date: empProfile?.passport_end },
  ].filter(d => {
    if (!d.date) return false;
    const diff = (new Date(d.date).getTime() - today.getTime()) / 86400000;
    return diff > 0 && diff < 60;
  });

  const RoleIcon = roleInfo.icon;

  return (
    <div className="min-h-screen bg-gray-50" dir={dir}>
      {/* ── Header ── */}
      <div className="bg-gradient-to-l from-[#0d4a26] to-[#0a2e1a] text-white px-5 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 ${roleInfo.color} rounded-xl flex items-center justify-center shadow-lg`}>
                <span className="font-black text-white text-lg">{user.name[0]}</span>
              </div>
              <div>
                <div className="font-black text-lg">{user.name}</div>
                <div className="flex items-center gap-2 text-white/60 text-xs">
                  <RoleIcon size={12} />
                  <span>{roleInfo.label}</span>
                  {empProfile?.department && <span>· {empProfile.department}</span>}
                </div>
              </div>
            </div>
            <button onClick={logout} className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs px-3 py-2 rounded-lg hover:bg-white/10 transition-colors">
              <LogOutIcon size={13} />خروج
            </button>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "الراتب الإجمالي", value: netSalary > 0 ? `${netSalary.toLocaleString("ar-SA")} ر.س` : "—", icon: TrendingUp, color: "text-emerald-300" },
              { label: "طلبات عمل",   value: String(workOrders), icon: RoleIcon,     color: "text-blue-300" },
              { label: "طلبات معلقة", value: String(pending),    icon: Clock,        color: "text-amber-300" },
              { label: "موافق عليها", value: String(approved),   icon: CheckCircle,  color: "text-green-300" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                <Icon size={14} className={`mx-auto mb-1 ${color}`} />
                <div className="font-black text-sm">{value}</div>
                <div className="text-white/40 text-[10px] leading-tight">{label}</div>
              </div>
            ))}
          </div>

          {/* Expiry alerts */}
          {expiring.length > 0 && (
            <div className="mt-3 bg-red-500/20 border border-red-400/30 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-300 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-red-200">
                <span className="font-bold">تنبيه: </span>
                {expiring.map(e => `${e.label} تنتهي قريباً (${e.date})`).join(" | ")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex bg-white rounded-2xl border border-gray-100 p-1 shadow-sm gap-1">
          {([
            ["work",     "عملي",     "💼"],
            ["requests", "طلباتي",   "📋"],
            ["profile",  "بياناتي",  "👤"],
          ] as const).map(([key, lbl, icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
                ${tab === key
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
              {icon} {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* ════════════ WORK TAB ════════════ */}
        {tab === "work" && (
          <>
            {/* Main work page link */}
            <Link href={roleInfo.href}>
              <div className={`${roleInfo.color} rounded-2xl p-5 cursor-pointer hover:opacity-90 transition-opacity shadow-sm`}>
                <div className="flex items-center justify-between text-white">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                      <RoleIcon size={24} />
                    </div>
                    <div>
                      <div className="font-black text-lg">{roleInfo.pageLabel}</div>
                      <div className="text-white/70 text-sm">
                        {workOrders > 0 ? `${workOrders} طلب بانتظارك` : "لا توجد طلبات معلقة"}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-white/60 flex-shrink-0" style={{transform: dir === "ltr" ? "none" : "rotate(180deg)"}} />
                </div>
              </div>
            </Link>

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2"><Star size={15} className="text-amber-400"/>الاختصارات السريعة</h3>
              <div className="grid grid-cols-2 gap-2">
                <Link href={roleInfo.href}>
                  <div className="flex items-center gap-2.5 p-3 bg-gray-50 hover:bg-emerald-50 rounded-xl cursor-pointer transition-colors group">
                    <RoleIcon size={18} className="text-gray-400 group-hover:text-emerald-600" />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">{roleInfo.pageLabel}</span>
                  </div>
                </Link>
                <Link href="/notifications">
                  <div className="flex items-center gap-2.5 p-3 bg-gray-50 hover:bg-blue-50 rounded-xl cursor-pointer transition-colors group">
                    <Bell size={18} className="text-gray-400 group-hover:text-blue-600" />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">الإشعارات</span>
                  </div>
                </Link>
              </div>
            </div>

            {/* Employee card */}
            {empProfile && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                  <User size={15} className="text-gray-400"/>ملف الموظف
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "الوظيفة",    value: empProfile.job_title },
                    { label: "القسم",      value: empProfile.department },
                    { label: "الجنسية",    value: empProfile.nationality },
                    { label: "الكفاءة",    value: empProfile.efficiency },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-xl p-3">
                      <div className="text-xs text-gray-400">{label}</div>
                      <div className="text-sm font-semibold text-gray-700 mt-0.5">{value || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════ REQUESTS TAB ════════════ */}
        {tab === "requests" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">طلباتي الوظيفية</h2>
              <button onClick={() => setShowForm(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors">
                <Plus size={14} />طلب جديد
              </button>
            </div>

            {showForm && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm"><Send size={15} className="text-emerald-600"/>تقديم طلب جديد</h3>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">نوع الطلب</label>
                  <div className="relative">
                    <select value={newReq.request_type} onChange={e => setNewReq(p => ({ ...p, request_type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none appearance-none bg-white">
                      {REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                {newReq.request_type.startsWith("إجازة") && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">من تاريخ</label>
                      <input type="date" value={newReq.from_date} onChange={e => setNewReq(p => ({ ...p, from_date: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">إلى تاريخ</label>
                      <input type="date" value={newReq.to_date} onChange={e => setNewReq(p => ({ ...p, to_date: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">تفاصيل الطلب *</label>
                  <textarea value={newReq.details} onChange={e => setNewReq(p => ({ ...p, details: e.target.value }))} rows={3}
                    placeholder="اكتب تفاصيل طلبك هنا..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none" />
                </div>
                {submitMsg && (
                  <div className={`text-sm px-4 py-2.5 rounded-xl border
                    ${submitMsg.startsWith("✅") ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {submitMsg}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setShowForm(false); setSubmitMsg(""); }}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">إلغاء</button>
                  <button onClick={submitRequest} disabled={submitting || !newReq.details}
                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-emerald-700 transition-colors">
                    {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
                  </button>
                </div>
              </div>
            )}

            {requests.length === 0 ? (
              <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
                <FileText size={36} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">لا توجد طلبات بعد</p>
                <p className="text-xs mt-1">اضغط "طلب جديد" للبدء</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map(req => (
                  <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="font-semibold text-gray-800 text-sm">{req.request_type}</span>
                        {req.days > 0 && <span className="text-xs text-gray-400 ms-2">({req.days} يوم)</span>}
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex-shrink-0 border ${STATUS_CLS[req.status]}`}>
                        {STATUS_LABELS[req.status]}
                      </span>
                    </div>
                    {req.details && <p className="text-sm text-gray-600">{req.details}</p>}
                    {req.from_date && (
                      <p className="text-xs text-gray-400 mt-1.5">
                        📅 {req.from_date}{req.to_date ? ` — ${req.to_date}` : ""}
                      </p>
                    )}
                    {req.review_notes && (
                      <div className="mt-2 text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-blue-700">
                        <span className="font-semibold">ملاحظة الإدارة: </span>{req.review_notes}
                      </div>
                    )}
                    <p className="text-xs text-gray-300 mt-2">{new Date(req.created_at).toLocaleDateString("ar-SA")}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ════════════ PROFILE TAB ════════════ */}
        {tab === "profile" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {[
                { icon: User,         label: "الاسم الكامل",     value: user.name },
                { icon: Briefcase,    label: "المسمى الوظيفي",   value: empProfile?.job_title || roleInfo.label },
                { icon: Building2,    label: "القسم / الفرع",    value: empProfile?.department || "—" },
                { icon: Phone,        label: "رقم الجوال",       value: user.phone },
                { icon: Hash,         label: "الجنسية",          value: empProfile?.nationality || "—" },
                { icon: TrendingUp,   label: "الراتب الأساسي",   value: empProfile?.salary ? `${Number(empProfile.salary).toLocaleString("ar-SA")} ر.س` : "—" },
                { icon: TrendingUp,   label: "العلاوات",         value: empProfile?.allowances ? `${Number(empProfile.allowances).toLocaleString("ar-SA")} ر.س` : "—" },
                { icon: CalendarDays, label: "تاريخ المباشرة",   value: empProfile?.hire_date || "—" },
                { icon: Clock,        label: "انتهاء الإقامة",   value: empProfile?.iqama_end || "—" },
                { icon: Clock,        label: "انتهاء الرخصة",    value: empProfile?.driver_license_end || "—" },
                { icon: Clock,        label: "انتهاء الجواز",    value: empProfile?.passport_end || "—" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 px-5 py-3.5">
                  <Icon size={15} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-500 w-32 flex-shrink-0">{label}</span>
                  <span className="text-sm font-semibold text-gray-800 flex-1">{value || "—"}</span>
                </div>
              ))}
            </div>

            <button onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl text-sm font-semibold transition-colors border border-red-100">
              <LogOutIcon size={16} />تسجيل الخروج
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
