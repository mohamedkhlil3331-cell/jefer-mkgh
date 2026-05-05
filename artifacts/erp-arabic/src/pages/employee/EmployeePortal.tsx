import { useState, useEffect } from "react";
import {
  FileText, CalendarDays, HeartPulse, TrendingUp, LogOut as LogOutIcon,
  Briefcase, Clock, CheckCircle, XCircle, Plus, X, ChevronDown,
  User, Mail, Lock, Send, Building2, Phone,
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

const REQUEST_TYPES = ["إجازة سنوية","إجازة مرضية","إجازة طارئة","زيادة راتب","استقالة","شكوى","طلب نقل","أخرى"];
const STATUS_LABELS: Record<string, string> = { pending: "قيد المراجعة", approved: "موافق عليه", rejected: "مرفوض" };
const STATUS_CLS: Record<string, string> = {
  pending:  "bg-amber-50  text-amber-700  border border-amber-200",
  approved: "bg-green-50  text-green-700  border border-green-200",
  rejected: "bg-red-50    text-red-700    border border-red-200",
};

const EMPTY_REQ = { request_type: "إجازة سنوية", details: "", from_date: "", to_date: "" };

export default function EmployeePortal() {
  const [emp, setEmp] = useState<EmpProfile | null>(() => {
    try { return JSON.parse(localStorage.getItem("emp_portal") || "null"); } catch { return null; }
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [requests, setRequests] = useState<HRRequest[]>([]);
  const [newReq, setNewReq] = useState({ ...EMPTY_REQ });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"requests" | "profile">("requests");

  const loadRequests = (name: string) => {
    fetch(`/api/hr-requests?employee_id=0`)
      .then(r => r.json())
      .then((rows: HRRequest[]) => {
        setRequests(Array.isArray(rows) ? rows.filter(r => r.employee_name === name) : []);
      }).catch(() => {});
  };

  useEffect(() => { if (emp) loadRequests(emp.name); }, [emp]);

  const login = async () => {
    setLoginErr(""); setLoggingIn(true);
    try {
      const r = await fetch("/api/employee-portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) { setLoginErr(d.error || "بيانات غير صحيحة"); return; }
      localStorage.setItem("emp_portal", JSON.stringify(d.employee));
      setEmp(d.employee);
    } catch { setLoginErr("فشل الاتصال بالخادم"); }
    finally { setLoggingIn(false); }
  };

  const logout = () => {
    localStorage.removeItem("emp_portal");
    setEmp(null); setEmail(""); setPassword("");
  };

  const submitRequest = async () => {
    if (!emp || !newReq.request_type) return;
    setSubmitting(true); setSubmitMsg("");
    try {
      const r = await fetch("/api/hr-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: emp.id,
          employee_name: emp.name,
          employee_job: emp.job_title,
          employee_dept: emp.department,
          ...newReq,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setSubmitMsg("✅ تم تقديم طلبك بنجاح، سيتم مراجعته قريباً");
        setNewReq({ ...EMPTY_REQ });
        setShowForm(false);
        loadRequests(emp.name);
      } else setSubmitMsg(`❌ ${d.error}`);
    } catch { setSubmitMsg("❌ فشل الاتصال"); }
    finally { setSubmitting(false); }
  };

  // ── Login page ────────────────────────────────────────────────────────────────
  if (!emp) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#103c68] to-[#0eb5cb] flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-black text-2xl">M</span>
            </div>
            <h1 className="text-white font-black text-2xl">MKGH</h1>
            <p className="text-white/70 text-sm mt-1">بوابة الموظف</p>
          </div>

          <div className="bg-white rounded-3xl p-7 shadow-2xl">
            <h2 className="text-xl font-black text-gray-900 mb-1">تسجيل الدخول</h2>
            <p className="text-gray-400 text-sm mb-6">أدخل بيانات حسابك الوظيفي</p>

            {loginErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{loginErr}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">الإيميل الوظيفي</label>
                <div className="relative">
                  <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && login()}
                    placeholder="your.name@mkgh.com"
                    className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 text-left" dir="ltr" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">كلمة المرور</label>
                <div className="relative">
                  <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && login()}
                    placeholder="••••••••"
                    className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>
              </div>
              <button onClick={login} disabled={loggingIn || !email || !password}
                className="w-full py-3 bg-[#103c68] text-white rounded-xl font-bold hover:bg-[#0d3158] disabled:opacity-50 transition-colors">
                {loggingIn ? "جاري الدخول..." : "دخول"}
              </button>
            </div>

            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center mb-3">مثال تجريبي</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["faizullah@mkgh.com","Fz@12345","سائق قلاب"],
                  ["abdullah.sahli@mkgh.com","Ab@12345","مشرف نقليات"],
                ].map(([e, p, lbl]) => (
                  <button key={e} onClick={() => { setEmail(e); setPassword(p); }}
                    className="text-xs bg-gray-50 hover:bg-gray-100 rounded-lg p-2 text-gray-600 transition-colors text-right">
                    <div className="font-medium">{lbl}</div>
                    <div className="text-gray-400 truncate">{e}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Employee dashboard ─────────────────────────────────────────────────────────
  const pending  = requests.filter(r => r.status === "pending").length;
  const approved = requests.filter(r => r.status === "approved").length;

  const netSalary = (emp.salary || 0) + (emp.allowances || 0);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-l from-[#103c68] to-[#0a2d52] text-white px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center">
              <span className="font-black text-lg">{emp.name[0]}</span>
            </div>
            <div>
              <div className="font-bold text-base">{emp.name}</div>
              <div className="text-white/60 text-xs">{emp.job_title} · {emp.department}</div>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs px-3 py-2 rounded-lg hover:bg-white/10 transition-colors">
            <LogOutIcon size={14} />خروج
          </button>
        </div>

        {/* Stats strip */}
        <div className="max-w-2xl mx-auto mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "الراتب الإجمالي", value: `${netSalary.toLocaleString("ar-SA")} ر.س`, icon: TrendingUp },
            { label: "طلبات معلقة", value: String(pending), icon: Clock },
            { label: "طلبات موافق عليها", value: String(approved), icon: CheckCircle },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
              <Icon size={14} className="mx-auto mb-1 text-white/60" />
              <div className="font-black text-base">{value}</div>
              <div className="text-white/50 text-xs">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Tabs */}
        <div className="flex bg-white rounded-xl border border-gray-100 p-1 shadow-sm">
          {([["requests","طلباتي","📋"],["profile","بياناتي","👤"]] as const).map(([key, lbl, icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors
                ${tab === key ? "bg-[#103c68] text-white" : "text-gray-400 hover:text-gray-600"}`}>
              {icon} {lbl}
            </button>
          ))}
        </div>

        {/* ── Requests tab ── */}
        {tab === "requests" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">طلباتي الوظيفية</h2>
              <button onClick={() => setShowForm(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#0eb5cb] text-white rounded-xl text-sm font-semibold hover:bg-[#0ca3b6]">
                <Plus size={14} />طلب جديد
              </button>
            </div>

            {/* New request form */}
            {showForm && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Send size={16} className="text-[#0eb5cb]" />تقديم طلب جديد</h3>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">نوع الطلب</label>
                  <div className="relative">
                    <select value={newReq.request_type} onChange={e => setNewReq(p => ({ ...p, request_type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none appearance-none bg-white">
                      {REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                {newReq.request_type.startsWith("إجازة") && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">من تاريخ</label>
                      <input type="date" value={newReq.from_date} onChange={e => setNewReq(p => ({ ...p, from_date: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">إلى تاريخ</label>
                      <input type="date" value={newReq.to_date} onChange={e => setNewReq(p => ({ ...p, to_date: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">تفاصيل الطلب</label>
                  <textarea value={newReq.details} onChange={e => setNewReq(p => ({ ...p, details: e.target.value }))} rows={3}
                    placeholder="اكتب تفاصيل طلبك..."
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
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">إلغاء</button>
                  <button onClick={submitRequest} disabled={submitting}
                    className="flex-1 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                    {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
                  </button>
                </div>
              </div>
            )}

            {/* Requests list */}
            {requests.length === 0 ? (
              <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
                <FileText size={36} className="mx-auto mb-3 opacity-30" />
                <p>لا توجد طلبات بعد</p>
                <p className="text-xs mt-1">اضغط "طلب جديد" للبدء</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map(req => (
                  <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold text-gray-800 text-sm">{req.request_type}</span>
                        {req.days && <span className="text-xs text-gray-400 mr-2">({req.days} يوم)</span>}
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex-shrink-0 ${STATUS_CLS[req.status]}`}>
                        {STATUS_LABELS[req.status]}
                      </span>
                    </div>
                    {req.details && <p className="text-sm text-gray-600 mt-2">{req.details}</p>}
                    {req.from_date && (
                      <p className="text-xs text-gray-400 mt-1">
                        {req.from_date} {req.to_date ? `— ${req.to_date}` : ""}
                      </p>
                    )}
                    {req.review_notes && (
                      <div className="mt-2 text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-blue-700">
                        <span className="font-semibold">ملاحظة: </span>{req.review_notes}
                      </div>
                    )}
                    <p className="text-xs text-gray-300 mt-2">{new Date(req.created_at).toLocaleDateString("ar-SA")}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Profile tab ── */}
        {tab === "profile" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {[
              { icon: User, label: "الاسم الكامل", value: emp.name },
              { icon: Briefcase, label: "المسمى الوظيفي", value: emp.job_title },
              { icon: Building2, label: "القسم / الفرع", value: emp.department },
              { icon: Mail, label: "الإيميل", value: emp.email },
              { icon: Phone, label: "الجوال", value: emp.phone },
              { icon: TrendingUp, label: "الراتب الأساسي", value: `${Number(emp.salary).toLocaleString("ar-SA")} ر.س` },
              { icon: TrendingUp, label: "العلاوات", value: `${Number(emp.allowances).toLocaleString("ar-SA")} ر.س` },
              { icon: CalendarDays, label: "تاريخ المباشرة", value: emp.hire_date || "—" },
              { icon: Clock, label: "انتهاء الإقامة", value: emp.iqama_end || "—" },
              { icon: Clock, label: "انتهاء الرخصة", value: emp.driver_license_end || "—" },
              { icon: Clock, label: "انتهاء الجواز", value: emp.passport_end || "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 px-5 py-3.5">
                <Icon size={15} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-500 w-32 flex-shrink-0">{label}</span>
                <span className="text-sm font-semibold text-gray-800 flex-1">{value || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
