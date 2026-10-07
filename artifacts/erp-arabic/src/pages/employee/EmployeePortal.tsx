import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import {
  FileText, CalendarDays, TrendingUp, LogOut as LogOutIcon,
  Briefcase, Clock, CheckCircle, Plus, ChevronDown,
  User, Phone, Send, Building2,
  ClipboardCheck, Truck, Warehouse, Car, Users2,
  Bell, AlertTriangle, ChevronRight, Home,
  Wallet, Star, Award, Shield, CreditCard, MinusCircle,
  PlusCircle, Receipt, Banknote, HeartPulse, Plane,
  BookOpen, MessageSquare, ArrowLeftRight, UserMinus,
  HardHat, Stethoscope, Baby, ChevronLeft,
} from "lucide-react";

interface EmpProfile {
  id: number; name: string; job_title: string; department: string;
  entity: string; nationality: string; phone: string; email: string;
  salary: number; allowances: number; bonus: number; rewards: number;
  penalties: number; iqama_amount: number;
  status: string; hire_date: string;
  iqama_no: string; iqama_start: string; iqama_end: string;
  work_permit_start: string; work_permit_end: string;
  driver_license_no: string; driver_license_end: string;
  passport_end: string; vehicle_plate: string; efficiency: string;
}

interface HRRequest {
  id: number; employee_name: string; request_type: string; details: string;
  from_date: string; to_date: string; days: number;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string; review_notes: string; created_at: string;
}

const REQ_CATEGORIES = [
  {
    label: "إجازات", icon: Plane, color: "bg-blue-500", types: [
      { value: "إجازة سنوية",   icon: Plane,       label: "إجازة سنوية" },
      { value: "إجازة مرضية",   icon: Stethoscope, label: "إجازة مرضية" },
      { value: "إجازة طارئة",   icon: AlertTriangle,label: "إجازة طارئة" },
      { value: "إجازة أمومة",   icon: Baby,        label: "إجازة أمومة" },
      { value: "إجازة حج",      icon: BookOpen,    label: "إجازة حج" },
    ],
  },
  {
    label: "مالية وإدارية", icon: Wallet, color: "bg-emerald-500", types: [
      { value: "طلب زيادة راتب",  icon: TrendingUp,     label: "طلب زيادة راتب" },
      { value: "سلفة",           icon: Banknote,        label: "سلفة" },
      { value: "بدل عمل إضافي",  icon: Clock,          label: "بدل عمل إضافي" },
    ],
  },
  {
    label: "شؤون الموظف", icon: User, color: "bg-purple-500", types: [
      { value: "شكوى",           icon: MessageSquare,   label: "شكوى" },
      { value: "طلب نقل",        icon: ArrowLeftRight,  label: "طلب نقل" },
      { value: "تقرير طبي",      icon: HeartPulse,      label: "تقرير طبي" },
      { value: "استقالة",        icon: UserMinus,       label: "استقالة" },
      { value: "أخرى",           icon: FileText,        label: "طلب آخر" },
    ],
  },
];

const ALL_TYPES = REQ_CATEGORIES.flatMap(c => c.types);

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة", approved: "موافق عليه", rejected: "مرفوض",
};
const STATUS_CLS: Record<string, string> = {
  pending:  "bg-amber-50  text-amber-700  border-amber-200",
  approved: "bg-green-50  text-green-700  border-green-200",
  rejected: "bg-red-50    text-red-700    border-red-200",
};
const STATUS_DOT: Record<string, string> = {
  pending: "bg-amber-400", approved: "bg-green-500", rejected: "bg-red-400",
};

const ROLE_INFO: Record<string, { label: string; icon: React.ElementType; color: string; href: string }> = {
  reviewer:   { label: "مراجع الطلبات",  icon: ClipboardCheck, color: "bg-indigo-600", href: "/reviewer"        },
  supervisor: { label: "مشرف النقليات",  icon: Truck,          color: "bg-orange-500", href: "/supervisor"      },
  warehouse:  { label: "مسؤول المستودع", icon: Warehouse,      color: "bg-green-600",  href: "/warehouse"       },
  driver:     { label: "سائق",           icon: Car,            color: "bg-yellow-500", href: "/driver"          },
  rep:        { label: "مندوب مبيعات",   icon: Users2,         color: "bg-pink-500",   href: "/rep"             },
  employee:   { label: "موظف",           icon: HardHat,        color: "bg-teal-600",   href: "/employee-portal" },
};

const EMPTY_REQ = { request_type: "إجازة سنوية", details: "", from_date: "", to_date: "" };

const fmt = (n: number) => n.toLocaleString("ar-SA");
const daysUntil = (d: string) => {
  if (!d) return null;
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return diff;
};
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("ar-SA") : "—";

export default function EmployeePortal() {
  const { user, logout, logoutAllDevices } = useAuth();
  const { dir } = useLang();

  const [emp, setEmp]             = useState<EmpProfile | null>(null);
  const [requests, setRequests]   = useState<HRRequest[]>([]);
  const [newReq, setNewReq]       = useState({ ...EMPTY_REQ });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");
  const [showForm, setShowForm]   = useState(false);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [tab, setTab]             = useState<"home"|"salary"|"requests"|"profile">("home");
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState("");

  const handleLogoutAllDevices = async () => {
    if (!confirm("سيتم تسجيل الخروج من جميع الأجهزة المرتبطة بهذا الحساب، بما فيها هذا الجهاز، وستحتاج إلى تسجيل الدخول من جديد. هل تريد المتابعة؟")) return;
    setLoggingOutAll(true);
    setLogoutAllError("");
    try {
      await logoutAllDevices();
      window.location.assign("/");
    } catch (e) {
      setLogoutAllError((e as Error).message);
    } finally {
      setLoggingOutAll(false);
    }
  };

  const loadRequests = useCallback(() => {
    if (!user) return;
    fetch("/api/hr-requests")
      .then(r => r.json())
      .then((rows: HRRequest[]) => {
        setRequests(Array.isArray(rows) ? rows.filter(r => r.employee_name === user.name) : []);
      }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/employees")
      .then(r => r.json())
      .then((rows: EmpProfile[]) => {
        const match = Array.isArray(rows)
          ? rows.find(e => e.phone === user.phone || e.name === user.name)
          : null;
        if (match) setEmp(match);
      }).catch(() => {});
    loadRequests();
  }, [user, loadRequests]);

  const submitRequest = async () => {
    if (!user || !newReq.request_type || !newReq.details) return;
    setSubmitting(true); setSubmitMsg("");
    try {
      const r = await fetch("/api/hr-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: emp?.id ?? 0,
          employee_name: user.name,
          employee_job: emp?.job_title ?? ROLE_INFO[user.role]?.label ?? user.role,
          employee_dept: emp?.department ?? "—",
          ...newReq,
        }),
      });
      if (r.ok) {
        setSubmitMsg("✅ تم تقديم طلبك بنجاح، سيتم مراجعته قريباً");
        setNewReq({ ...EMPTY_REQ }); setShowForm(false); setSelectedCat(null);
        loadRequests();
      } else { const d = await r.json(); setSubmitMsg(`❌ ${d.error}`); }
    } catch { setSubmitMsg("❌ فشل الاتصال"); }
    finally { setSubmitting(false); }
  };

  if (!user) return null;

  const roleInfo = ROLE_INFO[user.role] ?? ROLE_INFO.employee;
  const RoleIcon = roleInfo.icon;

  // ── Salary calculations ──
  const baseSalary   = emp?.salary      ?? 0;
  const allowances   = emp?.allowances  ?? 0;
  const bonus        = emp?.bonus       ?? 0;
  const rewards      = emp?.rewards     ?? 0;
  const penalties    = emp?.penalties   ?? 0;
  const iqamaAmount  = emp?.iqama_amount ?? 0;
  const grossIncome  = baseSalary + allowances + bonus;
  const totalDeduc   = penalties + iqamaAmount;
  const netSalary    = grossIncome - totalDeduc;

  // ── Document expiry alerts ──
  const docs = [
    { label: "الإقامة",         date: emp?.iqama_end,           no: emp?.iqama_no },
    { label: "رخصة القيادة",    date: emp?.driver_license_end,  no: emp?.driver_license_no },
    { label: "الجواز",          date: emp?.passport_end,        no: null },
    { label: "تصريح العمل",     date: emp?.work_permit_end,     no: null },
  ].map(d => ({ ...d, days: daysUntil(d.date ?? "") }))
   .filter(d => d.days !== null && d.days > 0);

  const expiringDocs = docs.filter(d => (d.days ?? 999) < 60);

  // ── Requests stats ──
  const pending  = requests.filter(r => r.status === "pending").length;
  const approved = requests.filter(r => r.status === "approved").length;

  const needsDates = newReq.request_type.includes("إجازة") || newReq.request_type === "بدل عمل إضافي";

  const ChevronDir = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <div className="min-h-screen bg-gray-50" dir={dir}>

      {/* ══════════ HEADER ══════════ */}
      <div className={`${roleInfo.color} text-white`} style={{background: "linear-gradient(135deg,#0d4a26 0%,#15803d 100%)"}}>
        <div className="max-w-2xl mx-auto px-4 py-5">
          {/* Top row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg border border-white/20">
                {user.name[0]}
              </div>
              <div>
                <div className="font-black text-xl leading-tight">{user.name}</div>
                <div className="flex items-center gap-1.5 text-white/65 text-xs mt-0.5">
                  <RoleIcon size={12}/>
                  <span>{emp?.job_title || roleInfo.label}</span>
                  {emp?.department && <><span>·</span><span>{emp.department}</span></>}
                </div>
                {emp?.status && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-400/20 text-emerald-200 px-2 py-0.5 rounded-full mt-1">
                    <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full"/>
                    {emp.status}
                  </span>
                )}
              </div>
            </div>
            <button onClick={logout} className="flex flex-col items-center gap-0.5 text-white/50 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors text-[10px]">
              <LogOutIcon size={16}/>خروج
            </button>
          </div>

          {/* Net salary banner */}
          {baseSalary > 0 && (
            <div className="mt-4 bg-white/10 border border-white/15 rounded-2xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-white/50 text-xs mb-0.5">الراتب الصافي الشهري</div>
                <div className="text-2xl font-black">{fmt(netSalary)} <span className="text-sm font-medium text-white/60">ر.س</span></div>
              </div>
              <div className="text-end">
                <div className="text-white/50 text-xs">الكفاءة</div>
                <div className="font-bold text-sm mt-0.5">{emp?.efficiency ?? "—"}</div>
              </div>
            </div>
          )}

          {/* Expiry alert */}
          {expiringDocs.length > 0 && (
            <div className="mt-3 bg-red-500/20 border border-red-400/30 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-300 flex-shrink-0 mt-0.5"/>
              <div className="text-xs text-red-200">
                <span className="font-bold">تنبيه: </span>
                {expiringDocs.map(d => `${d.label} (${d.days} يوم)`).join(" · ")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════ TABS ══════════ */}
      <div className="max-w-2xl mx-auto px-4 pt-3">
        <div className="flex bg-white rounded-2xl border border-gray-100 p-1 shadow-sm gap-0.5">
          {([
            ["home",     "الرئيسية", Home],
            ["salary",   "الراتب",   Wallet],
            ["requests", "طلباتي",   FileText],
            ["profile",  "بياناتي",  User],
          ] as const).map(([key, lbl, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-xs font-semibold transition-all
                ${tab === key ? "bg-emerald-600 text-white shadow-sm" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
              <Icon size={15}/>
              <span>{lbl}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 pb-10 space-y-4">

        {/* ════════════════════════ HOME ════════════════════════ */}
        {tab === "home" && (
          <>
            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Wallet,       color: "bg-emerald-500", label: "الراتب الصافي",    value: baseSalary > 0 ? `${fmt(netSalary)} ر.س` : "—" },
                { icon: Clock,        color: "bg-amber-500",   label: "طلبات معلقة",      value: String(pending)  },
                { icon: CheckCircle,  color: "bg-green-500",   label: "موافق عليها",      value: String(approved) },
              ].map(({ icon: Icon, color, label, value }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                  <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center mx-auto mb-2`}>
                    <Icon size={16} className="text-white"/>
                  </div>
                  <div className="font-black text-base text-gray-800">{value}</div>
                  <div className="text-gray-400 text-[11px] mt-0.5 leading-tight">{label}</div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                <Star size={14} className="text-amber-400"/>إجراءات سريعة
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setTab("requests"); setShowForm(true); }}
                  className="flex items-center gap-2.5 p-3.5 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors text-start">
                  <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Plus size={16} className="text-white"/>
                  </div>
                  <span className="text-sm font-semibold text-emerald-800">طلب جديد</span>
                </button>
                <button onClick={() => setTab("salary")}
                  className="flex items-center gap-2.5 p-3.5 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors text-start">
                  <div className="w-8 h-8 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <CreditCard size={16} className="text-white"/>
                  </div>
                  <span className="text-sm font-semibold text-blue-800">كشف راتب</span>
                </button>
                {user.role !== "employee" && (
                  <Link href={roleInfo.href}>
                    <div className="flex items-center gap-2.5 p-3.5 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors">
                      <div className={`w-8 h-8 ${roleInfo.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <RoleIcon size={14} className="text-white"/>
                      </div>
                      <span className="text-sm font-semibold text-orange-800">صفحة عملي</span>
                    </div>
                  </Link>
                )}
                <button onClick={() => setTab("profile")}
                  className="flex items-center gap-2.5 p-3.5 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors text-start">
                  <div className="w-8 h-8 bg-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Shield size={16} className="text-white"/>
                  </div>
                  <span className="text-sm font-semibold text-purple-800">بياناتي</span>
                </button>
              </div>
            </div>

            {/* Document status */}
            {docs.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                  <Shield size={14} className="text-gray-400"/>الوثائق الرسمية
                </h3>
                <div className="space-y-2">
                  {docs.map(doc => {
                    const days = doc.days ?? 0;
                    const status = days < 30 ? "critical" : days < 60 ? "warning" : "ok";
                    return (
                      <div key={doc.label} className={`flex items-center justify-between p-3 rounded-xl border
                        ${status === "critical" ? "bg-red-50 border-red-100" : status === "warning" ? "bg-amber-50 border-amber-100" : "bg-gray-50 border-gray-100"}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${status === "critical" ? "bg-red-500" : status === "warning" ? "bg-amber-500" : "bg-green-500"}`}/>
                          <span className="text-sm font-medium text-gray-700">{doc.label}</span>
                          {doc.no && <span className="text-xs text-gray-400 font-mono">({doc.no})</span>}
                        </div>
                        <div className="text-end">
                          <div className={`text-xs font-bold ${status === "critical" ? "text-red-600" : status === "warning" ? "text-amber-600" : "text-gray-500"}`}>
                            {days} يوم
                          </div>
                          <div className="text-[10px] text-gray-400">{fmtDate(doc.date ?? "")}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent requests */}
            {requests.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2"><FileText size={14} className="text-gray-400"/>آخر الطلبات</h3>
                  <button onClick={() => setTab("requests")} className="text-xs text-emerald-600 font-semibold">عرض الكل</button>
                </div>
                <div className="space-y-2">
                  {requests.slice(0, 3).map(req => (
                    <div key={req.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${STATUS_DOT[req.status]}`}/>
                        <span className="text-sm text-gray-700">{req.request_type}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${STATUS_CLS[req.status]}`}>
                        {STATUS_LABELS[req.status]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════ SALARY ════════════════════════ */}
        {tab === "salary" && (
          <>
            {/* Net salary card */}
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-2 text-emerald-200 text-xs mb-3">
                <Banknote size={14}/>كشف الراتب الشهري
              </div>
              <div className="text-4xl font-black mb-1">{fmt(netSalary)}</div>
              <div className="text-emerald-200 text-sm">ريال سعودي — صافي الراتب</div>
              <div className="mt-4 pt-4 border-t border-white/15 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-emerald-300 text-xs mb-1">إجمالي الدخل</div>
                  <div className="font-bold">{fmt(grossIncome)} ر.س</div>
                </div>
                <div>
                  <div className="text-emerald-300 text-xs mb-1">إجمالي الخصميات</div>
                  <div className="font-bold">{fmt(totalDeduc)} ر.س</div>
                </div>
              </div>
            </div>

            {/* Income breakdown */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                <PlusCircle size={15} className="text-emerald-500"/>بنود الدخل
              </h3>
              <div className="space-y-2">
                {[
                  { label: "الراتب الأساسي",  value: baseSalary,  icon: Wallet,   must: true },
                  { label: "البدلات",          value: allowances,  icon: Award     },
                  { label: "المكافآت",         value: bonus,       icon: Star      },
                  { label: "المكافآت الإضافية",value: rewards,     icon: Award     },
                ].filter(r => r.must || r.value > 0).map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <Icon size={15} className="text-emerald-600"/>
                      </div>
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                    </div>
                    <span className="font-bold text-emerald-700">{fmt(value)} ر.س</span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3 bg-emerald-100 rounded-xl border border-emerald-200">
                  <span className="font-bold text-emerald-800">إجمالي الدخل</span>
                  <span className="font-black text-emerald-800">{fmt(grossIncome)} ر.س</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                <MinusCircle size={15} className="text-red-500"/>الخصميات
              </h3>
              {totalDeduc === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">
                  <CheckCircle size={28} className="mx-auto mb-2 text-green-400 opacity-60"/>
                  لا توجد خصميات هذا الشهر
                </div>
              ) : (
                <div className="space-y-2">
                  {[
                    { label: "الغرامات والجزاءات", value: penalties,   icon: MinusCircle },
                    { label: "رسوم الإقامة",       value: iqamaAmount, icon: Receipt     },
                  ].filter(r => r.value > 0).map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center justify-between p-3 bg-red-50/60 rounded-xl">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                          <Icon size={15} className="text-red-500"/>
                        </div>
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                      </div>
                      <span className="font-bold text-red-600">- {fmt(value)} ر.س</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 bg-red-100 rounded-xl border border-red-200">
                    <span className="font-bold text-red-800">إجمالي الخصميات</span>
                    <span className="font-black text-red-800">- {fmt(totalDeduc)} ر.س</span>
                  </div>
                </div>
              )}
            </div>

            {/* Final net */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-gray-400"/>
                  <span className="font-bold text-gray-800">صافي الراتب المستحق</span>
                </div>
                <div className="text-2xl font-black text-emerald-700">{fmt(netSalary)} ر.س</div>
              </div>
            </div>
          </>
        )}

        {/* ════════════════════════ REQUESTS ════════════════════════ */}
        {tab === "requests" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">طلباتي الوظيفية</h2>
              <button onClick={() => { setShowForm(v => !v); setSelectedCat(null); setSubmitMsg(""); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors">
                <Plus size={14}/>طلب جديد
              </button>
            </div>

            {/* ── New request form ── */}
            {showForm && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Send size={15} className="text-emerald-600"/>تقديم طلب جديد</h3>

                {/* Category picker */}
                {selectedCat === null ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 mb-3">اختر نوع الطلب:</p>
                    {REQ_CATEGORIES.map((cat, idx) => {
                      const CatIcon = cat.icon;
                      return (
                        <button key={cat.label} onClick={() => { setSelectedCat(idx); setNewReq(p => ({ ...p, request_type: cat.types[0].value })); }}
                          className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-transparent hover:border-emerald-200 bg-gray-50 hover:bg-emerald-50 transition-all text-start`}>
                          <div className={`w-10 h-10 ${cat.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                            <CatIcon size={18} className="text-white"/>
                          </div>
                          <div>
                            <div className="font-bold text-gray-800 text-sm">{cat.label}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{cat.types.map(t => t.label).join("، ")}</div>
                          </div>
                          <ChevronDir size={16} className="text-gray-300 ms-auto flex-shrink-0"/>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button onClick={() => setSelectedCat(null)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                      {dir === "rtl" ? <ChevronRight size={13}/> : <ChevronLeft size={13}/>}رجوع للتصنيفات
                    </button>

                    {/* Type selector */}
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-2">نوع الطلب</label>
                      <div className="grid grid-cols-2 gap-2">
                        {REQ_CATEGORIES[selectedCat].types.map(t => {
                          const TIcon = t.icon;
                          return (
                            <button key={t.value} onClick={() => setNewReq(p => ({ ...p, request_type: t.value }))}
                              className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-start
                                ${newReq.request_type === t.value
                                  ? "border-emerald-500 bg-emerald-50"
                                  : "border-gray-100 bg-gray-50 hover:border-gray-200"}`}>
                              <TIcon size={15} className={newReq.request_type === t.value ? "text-emerald-600" : "text-gray-400"}/>
                              <span className={`text-xs font-semibold ${newReq.request_type === t.value ? "text-emerald-800" : "text-gray-600"}`}>{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dates for leave types */}
                    {needsDates && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-700 block mb-1">من تاريخ</label>
                          <input type="date" value={newReq.from_date} onChange={e => setNewReq(p => ({ ...p, from_date: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"/>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-700 block mb-1">إلى تاريخ</label>
                          <input type="date" value={newReq.to_date} onChange={e => setNewReq(p => ({ ...p, to_date: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"/>
                        </div>
                      </div>
                    )}

                    {/* Details */}
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">تفاصيل الطلب <span className="text-red-500">*</span></label>
                      <textarea value={newReq.details} onChange={e => setNewReq(p => ({ ...p, details: e.target.value }))} rows={3}
                        placeholder="اشرح طلبك بالتفصيل..."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40 resize-none"/>
                    </div>

                    {submitMsg && (
                      <div className={`text-sm px-4 py-2.5 rounded-xl border
                        ${submitMsg.startsWith("✅") ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                        {submitMsg}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button onClick={() => { setShowForm(false); setSelectedCat(null); setSubmitMsg(""); }}
                        className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">إلغاء</button>
                      <button onClick={submitRequest} disabled={submitting || !newReq.details}
                        className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5">
                        <Send size={13}/>{submitting ? "جاري الإرسال..." : "إرسال الطلب"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Stats pills */}
            <div className="flex gap-2">
              {[
                { label: "الكل", count: requests.length, color: "bg-gray-100 text-gray-600" },
                { label: "معلق", count: pending, color: "bg-amber-100 text-amber-700" },
                { label: "موافق", count: approved, color: "bg-green-100 text-green-700" },
                { label: "مرفوض", count: requests.filter(r=>r.status==="rejected").length, color: "bg-red-100 text-red-700" },
              ].map(p => (
                <div key={p.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${p.color}`}>
                  {p.label} <span className="font-black">{p.count}</span>
                </div>
              ))}
            </div>

            {/* Requests list */}
            {requests.length === 0 ? (
              <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
                <FileText size={40} className="mx-auto mb-3 opacity-20"/>
                <p className="font-medium">لا توجد طلبات بعد</p>
                <p className="text-xs mt-1">اضغط "طلب جديد" للبدء</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map(req => {
                  const typeInfo = ALL_TYPES.find(t => t.value === req.request_type);
                  const TIcon = typeInfo?.icon ?? FileText;
                  return (
                    <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="flex items-start gap-3 p-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5
                          ${req.status === "approved" ? "bg-green-100" : req.status === "rejected" ? "bg-red-100" : "bg-amber-100"}`}>
                          <TIcon size={18} className={req.status === "approved" ? "text-green-600" : req.status === "rejected" ? "text-red-500" : "text-amber-600"}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-gray-800 text-sm">{req.request_type}</div>
                              {req.days > 0 && <div className="text-xs text-gray-400">{req.days} يوم</div>}
                            </div>
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0 border ${STATUS_CLS[req.status]}`}>
                              {STATUS_LABELS[req.status]}
                            </span>
                          </div>
                          {req.details && <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{req.details}</p>}
                          {req.from_date && (
                            <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                              <CalendarDays size={11}/>
                              <span>{fmtDate(req.from_date)}</span>
                              {req.to_date && <><span>—</span><span>{fmtDate(req.to_date)}</span></>}
                            </div>
                          )}
                        </div>
                      </div>
                      {req.review_notes && (
                        <div className="px-4 pb-3">
                          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700">
                            <span className="font-bold">ملاحظة الإدارة: </span>{req.review_notes}
                          </div>
                        </div>
                      )}
                      <div className="px-4 pb-3 text-xs text-gray-300 flex items-center gap-1">
                        <Clock size={10}/>{fmtDate(req.created_at)}
                        {req.reviewed_by && <span className="ms-2">· راجعه: {req.reviewed_by}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ════════════════════════ PROFILE ════════════════════════ */}
        {tab === "profile" && (
          <div className="space-y-4">
            {/* Personal */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2"><User size={14} className="text-gray-400"/>البيانات الشخصية</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { label: "الاسم الكامل",    value: user.name },
                  { label: "رقم الجوال",      value: user.phone },
                  { label: "الجنسية",         value: emp?.nationality },
                  { label: "تاريخ المباشرة",  value: fmtDate(emp?.hire_date ?? "") },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm text-gray-400 w-32 flex-shrink-0">{label}</span>
                    <span className="text-sm font-semibold text-gray-800">{value || "—"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Work */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2"><Briefcase size={14} className="text-gray-400"/>البيانات الوظيفية</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { label: "المسمى الوظيفي",  value: emp?.job_title || ROLE_INFO[user.role]?.label },
                  { label: "القسم",           value: emp?.department },
                  { label: "الجهة",           value: emp?.entity },
                  { label: "الكفاءة",         value: emp?.efficiency },
                  { label: "حالة التوظيف",    value: emp?.status },
                  { label: "رقم السيارة",     value: emp?.vehicle_plate },
                ].filter(f => f.value).map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm text-gray-400 w-32 flex-shrink-0">{label}</span>
                    <span className="text-sm font-semibold text-gray-800">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Documents */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2"><Shield size={14} className="text-gray-400"/>الوثائق الرسمية</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { label: "رقم الإقامة",     value: emp?.iqama_no,         date: emp?.iqama_end },
                  { label: "صلاحية الإقامة",  value: fmtDate(emp?.iqama_end ?? ""), date: emp?.iqama_end },
                  { label: "تصريح العمل",     value: fmtDate(emp?.work_permit_end ?? ""), date: emp?.work_permit_end },
                  { label: "رخصة القيادة",    value: emp?.driver_license_no, date: emp?.driver_license_end },
                  { label: "انتهاء الرخصة",   value: fmtDate(emp?.driver_license_end ?? ""), date: emp?.driver_license_end },
                  { label: "انتهاء الجواز",   value: fmtDate(emp?.passport_end ?? ""), date: emp?.passport_end },
                ].filter(f => f.value && f.value !== "—").map(({ label, value, date }) => {
                  const days = daysUntil(date ?? "");
                  const urgent = days !== null && days > 0 && days < 60;
                  return (
                    <div key={label} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-gray-400">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{value}</span>
                        {urgent && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">{days}د</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl text-sm font-bold transition-colors border border-red-100">
              <LogOutIcon size={16}/>تسجيل الخروج
            </button>

            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 space-y-3">
              <div>
                <h3 className="font-bold text-red-800 text-sm">أمان الحساب</h3>
                <p className="text-xs text-red-700 leading-5 mt-1">
                  أنهِ جلسات الدخول على كل الأجهزة إذا فقدت جهازًا أو شككت أن حسابك مفتوح في مكان آخر.
                </p>
              </div>
              {logoutAllError && <p className="text-xs text-red-700 bg-white/70 rounded-xl p-2.5">{logoutAllError}</p>}
              <button onClick={handleLogoutAllDevices} disabled={loggingOutAll}
                className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors">
                <LogOutIcon size={15}/>{loggingOutAll ? "جاري إنهاء الجلسات..." : "تسجيل الخروج من جميع الأجهزة"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
