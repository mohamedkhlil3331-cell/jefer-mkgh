import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import { LANGUAGES } from "@/i18n/translations";
import {
  Package, Truck, LayoutDashboard, Users, Warehouse,
  ArrowLeft, Phone, Lock, AlertCircle, ChevronRight,
  UserPlus, Eye, EyeOff, Building2, Hash, CheckCircle2,
  Clock, Globe, HardHat,
} from "lucide-react";

type Portal  = null | "customer" | "employee" | "admin";
type CustTab = "login" | "register";

export default function Login() {
  const { login, register, loginAsGuest } = useAuth();
  const { t, lang, setLang, dir } = useLang();

  const [portal, setPortal]   = useState<Portal>(null);
  const [custTab, setCustTab] = useState<CustTab>("login");
  const [showPw, setShowPw]   = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const [phone, setPhone]       = useState("");
  const [password, setPassword] = useState("");

  const [regName,    setRegName]    = useState("");
  const [regPhone,   setRegPhone]   = useState("");
  const [regPass,    setRegPass]    = useState("");
  const [regCompany, setRegCompany] = useState("");
  const [regVat,     setRegVat]     = useState("");

  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => { setError(""); setSuccess(""); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); reset(); setLoading(true);
    try { await login(phone, password); }
    catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); reset(); setLoading(true);
    try {
      const result = await register({ name: regName, phone: regPhone, password: regPass, company_name: regCompany, vat_number: regVat });
      if (result.pending) setSuccess(result.message);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  const fill = (p: string, pw: string) => { setPhone(p); setPassword(pw); reset(); };
  const back = () => { setPortal(null); setPhone(""); setPassword(""); setRegPhone(""); reset(); setCustTab("login"); };

  const currentLang = LANGUAGES.find(l => l.code === lang);

  const LangSwitcher = ({ dark = false }: { dark?: boolean }) => (
    <div className="relative">
      <button onClick={() => setShowLangMenu(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all
          ${dark
            ? "bg-white/10 hover:bg-white/20 text-white border border-white/15"
            : "bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200"}`}>
        <Globe size={13} />
        <span>{currentLang?.flag}</span>
        <span className="hidden sm:inline">{currentLang?.label}</span>
      </button>
      {showLangMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
          <div className="absolute top-full mt-1 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[160px]"
            style={{ [dir === "rtl" ? "right" : "left"]: 0 }}>
            {LANGUAGES.map(l => (
              <button key={l.code} onClick={() => { setLang(l.code); setShowLangMenu(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-gray-50 transition-colors
                  ${l.code === lang ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700"}`}>
                <span className="text-lg">{l.flag}</span>
                <span>{l.label}</span>
                {l.code === lang && <CheckCircle2 size={14} className="ms-auto text-blue-500" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  /* ══════════════ LANDING — 3 portals ═══════════════════════════════════════ */
  if (!portal) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1f3c] via-[#103c68] to-[#0eb5cb] flex flex-col items-center justify-center p-6" dir={dir}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[300,500,700,900].map((s,i) => (
          <div key={i} className="absolute rounded-full border border-white/5"
            style={{width:s,height:s,top:"50%",left:"50%",transform:"translate(-50%,-50%)"}} />
        ))}
      </div>
      <div className="absolute top-4 end-4"><LangSwitcher dark /></div>

      <div className="relative text-center mb-10">
        <div className="w-20 h-20 bg-white/15 backdrop-blur rounded-3xl flex items-center justify-center mx-auto mb-5 border border-white/20 shadow-2xl">
          <span className="text-white font-black text-3xl">M</span>
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight">{t("brand")}</h1>
        <p className="text-white/50 text-sm mt-2">{t("tagline")}</p>
      </div>

      <div className="relative w-full max-w-3xl grid sm:grid-cols-3 gap-4">
        {/* ── Customer ── */}
        <button onClick={() => setPortal("customer")}
          className="group bg-white/10 hover:bg-white/15 backdrop-blur border border-white/15 hover:border-[#0eb5cb]/60
            rounded-3xl p-6 text-start transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
          <div className="w-12 h-12 bg-[#0eb5cb]/20 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-[#0eb5cb]/30">
            <Package size={24} className="text-[#0eb5cb]" />
          </div>
          <h2 className="text-white font-black text-lg mb-1">{t("customerPortal")}</h2>
          <p className="text-white/45 text-xs leading-relaxed">{t("customerPortalDesc")}</p>
          <div className="mt-5 flex items-center gap-2 text-[#0eb5cb] text-sm font-semibold">
            <span>{t("enterNow")}</span>
            <ArrowLeft size={14} className={`transition-transform ${dir === "rtl" ? "group-hover:-translate-x-1" : "group-hover:translate-x-1 rotate-180"}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[t("navCatalog"), t("navMyOrders"), t("register")].map(f => (
              <span key={f} className="text-[10px] bg-white/10 text-white/40 px-2 py-0.5 rounded-md">{f}</span>
            ))}
          </div>
        </button>

        {/* ── Employee ── */}
        <button onClick={() => setPortal("employee")}
          className="group bg-white/10 hover:bg-white/15 backdrop-blur border border-white/15 hover:border-emerald-400/60
            rounded-3xl p-6 text-start transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
          <div className="w-12 h-12 bg-emerald-400/15 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-emerald-400/25">
            <HardHat size={24} className="text-emerald-400" />
          </div>
          <h2 className="text-white font-black text-lg mb-1">بوابة الموظفين</h2>
          <p className="text-white/45 text-xs leading-relaxed">مراجعو الطلبات، مشرفو النقليات<br/>السائقون، المستودعات، المندوبون</p>
          <div className="mt-5 flex items-center gap-2 text-emerald-400 text-sm font-semibold">
            <span>دخول الموظفين</span>
            <ArrowLeft size={14} className={`transition-transform ${dir === "rtl" ? "group-hover:-translate-x-1" : "group-hover:translate-x-1 rotate-180"}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[t("roleReviewer"), t("roleDriver"), t("roleSupervisor"), t("roleWarehouse")].map(f => (
              <span key={f} className="text-[10px] bg-white/10 text-white/40 px-2 py-0.5 rounded-md">{f}</span>
            ))}
          </div>
        </button>

        {/* ── Admin ── */}
        <button onClick={() => setPortal("admin")}
          className="group bg-white/10 hover:bg-white/15 backdrop-blur border border-white/15 hover:border-amber-400/60
            rounded-3xl p-6 text-start transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
          <div className="w-12 h-12 bg-amber-400/15 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-amber-400/25">
            <LayoutDashboard size={24} className="text-amber-400" />
          </div>
          <h2 className="text-white font-black text-lg mb-1">{t("adminPortal")}</h2>
          <p className="text-white/45 text-xs leading-relaxed">لوحة تحكم الإدارة العليا<br/>إحصائيات، تقارير، وإدارة شاملة</p>
          <div className="mt-5 flex items-center gap-2 text-amber-400 text-sm font-semibold">
            <span>{t("staffEntry")}</span>
            <ArrowLeft size={14} className={`transition-transform ${dir === "rtl" ? "group-hover:-translate-x-1" : "group-hover:translate-x-1 rotate-180"}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[t("roleAdmin"), "إدارة النظام", "الموافقات"].map(f => (
              <span key={f} className="text-[10px] bg-white/10 text-white/40 px-2 py-0.5 rounded-md">{f}</span>
            ))}
          </div>
        </button>
      </div>
      <p className="relative text-white/25 text-xs mt-10">{t("brand")} © {new Date().getFullYear()} — {t("rights")}</p>
    </div>
  );

  /* ══════════════ EMPLOYEE PORTAL LOGIN ══════════════════════════════════════ */
  if (portal === "employee") {
    const EMP_DEMOS = [
      { label: t("roleReviewer"),   phone: "0500000001", pass: "0500000001", color: "bg-indigo-600",  icon: "🔍" },
      { label: t("roleSupervisor"), phone: "0500000002", pass: "0500000002", color: "bg-orange-500",  icon: "🚛" },
      { label: t("roleWarehouse"),  phone: "0500000003", pass: "0500000003", color: "bg-green-600",   icon: "🏭" },
      { label: t("roleDriver"),     phone: "0500000004", pass: "0500000004", color: "bg-yellow-500",  icon: "🚗" },
      { label: t("roleRep"),        phone: "0500000005", pass: "0500000005", color: "bg-pink-500",    icon: "👔" },
    ];
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a2e1a] via-[#0d4a26] to-[#16a34a] flex items-center justify-center p-4" dir={dir}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[300,500,700].map((s,i) => (
            <div key={i} className="absolute rounded-full border border-white/5"
              style={{width:s,height:s,top:"50%",left:"50%",transform:"translate(-50%,-50%)"}} />
          ))}
        </div>
        <div className="absolute top-4 end-4"><LangSwitcher dark /></div>
        <div className="relative w-full max-w-md">
          <button onClick={back} className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors">
            <ChevronRight size={16} className={dir === "ltr" ? "rotate-180" : ""} />
            {t("backToPortals")}
          </button>
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-l from-[#15803d] to-[#0d4a26] px-7 pt-7 pb-6">
              <div className="flex items-center gap-3 text-white mb-2">
                <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center"><HardHat size={20} /></div>
                <div>
                  <div className="font-black text-lg">بوابة الموظفين</div>
                  <div className="text-white/50 text-xs">MKGH — Employee Portal</div>
                </div>
              </div>
              <div className="mt-3 bg-emerald-400/15 border border-emerald-400/30 rounded-xl p-2.5 flex items-center gap-2 text-emerald-200 text-xs">
                <Phone size={12} />الدخول برقم الجوال · كلمة المرور = رقم الجوال
              </div>
            </div>
            <div className="px-7 py-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5"><Phone size={13} className="text-gray-400" />{t("phone")}</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder={t("phonePlaceholder")} dir="ltr"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-gray-50" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5"><Lock size={13} className="text-gray-400" />{t("password")}</label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder={t("passwordPlaceholder")}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-gray-50 pe-10" />
                    <button type="button" onClick={() => setShowPw(v=>!v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2"><AlertCircle size={15} className="flex-shrink-0"/>{error}</div>}
                <button type="submit" disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl font-bold disabled:opacity-60 transition-all text-sm">
                  {loading ? t("loggingIn") : "دخول بوابة الموظفين"}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-xs text-gray-400 text-center mb-3 font-medium">{t("demoAccounts")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {EMP_DEMOS.map(({label, phone: p, pass, color, icon}) => (
                    <button key={p} onClick={() => fill(p, pass)}
                      className={`rounded-xl px-2 py-2.5 text-start transition-all hover:opacity-90 hover:scale-[1.02] ${color}`}>
                      <div className="text-base mb-0.5">{icon}</div>
                      <div className="font-bold text-white text-xs leading-tight">{label}</div>
                      <div className="text-white/60 font-mono text-[9px] mt-0.5">{p}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700">
                  <div className="font-bold mb-1">💡 تذكير:</div>
                  <div>كلمة المرور = رقم الجوال لجميع الموظفين</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════ ADMIN LOGIN ════════════════════════════════════════════════ */
  if (portal === "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a1f3c] via-[#103c68] to-[#0eb5cb] flex items-center justify-center p-4" dir={dir}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[300,500,700].map((s,i) => (
            <div key={i} className="absolute rounded-full border border-white/5"
              style={{width:s,height:s,top:"50%",left:"50%",transform:"translate(-50%,-50%)"}} />
          ))}
        </div>
        <div className="absolute top-4 end-4"><LangSwitcher dark /></div>
        <div className="relative w-full max-w-md">
          <button onClick={back} className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors group">
            <ChevronRight size={16} className={dir === "ltr" ? "rotate-180" : ""} />
            {t("backToPortals")}
          </button>
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-l from-[#103c68] to-[#0a1f3c] px-7 pt-7 pb-6">
              <div className="flex items-center gap-3 text-white mb-2">
                <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center"><LayoutDashboard size={20} /></div>
                <div>
                  <div className="font-black text-lg">{t("adminPortal")}</div>
                  <div className="text-white/50 text-xs">MKGH — Admin Access</div>
                </div>
              </div>
              <div className="mt-3 bg-amber-400/15 border border-amber-400/30 rounded-xl p-2.5 flex items-center gap-2 text-amber-300 text-xs">
                <Clock size={13} />صلاحيات الإدارة العليا — للمدراء فقط
              </div>
            </div>
            <div className="px-7 py-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5"><Phone size={13} className="text-gray-400" />{t("phone")}</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder={t("phonePlaceholder")} dir="ltr"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 bg-gray-50" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5"><Lock size={13} className="text-gray-400" />{t("password")}</label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder={t("passwordPlaceholder")}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 bg-gray-50 pe-10" />
                    <button type="button" onClick={() => setShowPw(v=>!v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2"><AlertCircle size={15} className="flex-shrink-0"/>{error}</div>}
                <button type="submit" disabled={loading}
                  className="w-full bg-amber-400 hover:bg-amber-500 text-white py-3.5 rounded-xl font-bold disabled:opacity-60 transition-all shadow-sm text-sm">
                  {loading ? t("loggingIn") : t("loginBtn")}
                </button>
              </form>
              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-xs text-gray-400 text-center mb-3 font-medium">{t("demoAccount")}</p>
                <button onClick={() => fill("0500000000", "admin123")}
                  className="w-full bg-[#103c68] text-white rounded-xl px-3 py-3 text-start hover:bg-[#0d3158] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center"><LayoutDashboard size={16} /></div>
                    <div>
                      <div className="font-bold text-sm">{t("roleAdmin")} — MKGH</div>
                      <div className="text-white/60 font-mono text-xs mt-0.5">0500000000 / admin123</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════ CUSTOMER PORTAL ════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1f3c] via-[#103c68] to-[#0eb5cb] flex items-center justify-center p-4" dir={dir}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[300,500,700].map((s,i) => (
          <div key={i} className="absolute rounded-full border border-white/5"
            style={{width:s,height:s,top:"50%",left:"50%",transform:"translate(-50%,-50%)"}} />
        ))}
      </div>
      <div className="absolute top-4 end-4"><LangSwitcher dark /></div>
      <div className="relative w-full max-w-md">
        <button onClick={back} className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors group">
          <ChevronRight size={16} className={dir === "ltr" ? "rotate-180" : ""} />
          {t("backToPortals")}
        </button>
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-l from-[#0eb5cb] to-[#103c68] px-7 pt-7 pb-5">
            <div className="flex items-center gap-3 text-white">
              <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center"><Package size={20}/></div>
              <div><div className="font-black text-lg">{t("customerPortal")}</div><div className="text-white/50 text-xs">MKGH</div></div>
            </div>
          </div>

          <div className="flex border-b border-gray-100 px-7 pt-4">
            {([["login", t("login"), "🔑"],["register", t("register"), "✨"]] as const).map(([key,lbl,icon]) => (
              <button key={key} onClick={() => {setCustTab(key as CustTab); reset();}}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors
                  ${custTab===key ? "border-[#0eb5cb] text-[#0eb5cb]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                {icon} {lbl}
              </button>
            ))}
            <div className="flex-1"/>
            <button onClick={loginAsGuest}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 hover:text-[#0eb5cb] transition-colors mb-1 rounded-lg hover:bg-cyan-50">
              👤 {t("guestLogin")}
            </button>
          </div>

          <div className="px-7 py-6">
            {custTab === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5"><Phone size={13} className="text-gray-400"/>{t("phone")}</label>
                  <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} required placeholder={t("phonePlaceholder")} dir="ltr"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0eb5cb]/30 bg-gray-50"/>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5"><Lock size={13} className="text-gray-400"/>{t("password")}</label>
                  <div className="relative">
                    <input type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} required placeholder={t("passwordPlaceholder")}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0eb5cb]/30 bg-gray-50 pe-10"/>
                    <button type="button" onClick={()=>setShowPw(v=>!v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw?<EyeOff size={15}/>:<Eye size={15}/>}
                    </button>
                  </div>
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2"><AlertCircle size={15} className="flex-shrink-0"/>{error}</div>}
                <button type="submit" disabled={loading}
                  className="w-full bg-[#0eb5cb] hover:bg-[#0ca3b6] text-white py-3.5 rounded-xl font-bold disabled:opacity-60 transition-all text-sm">
                  {loading ? t("loggingIn") : t("loginBtn")}
                </button>
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 text-center mb-2">{t("demoAccount")}</p>
                  <button type="button" onClick={()=>fill("0555555555","123456")}
                    className="w-full bg-blue-50 border border-blue-100 text-blue-700 rounded-xl px-3 py-2.5 text-xs text-start hover:bg-blue-100 transition-colors">
                    <div className="font-bold">{t("roleCustomer")}</div>
                    <div className="opacity-60 font-mono mt-0.5">0555555555</div>
                  </button>
                </div>
              </form>
            )}

            {custTab === "register" && (
              <>
                {success ? (
                  <div className="text-center py-8">
                    <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4"/>
                    <h3 className="font-bold text-gray-800 text-lg mb-2">{t("registeredSuccess")}</h3>
                    <p className="text-gray-500 text-sm">{success}</p>
                    <button onClick={()=>setSuccess("")} className="mt-4 text-[#0eb5cb] text-sm underline">{t("backToLogin")}</button>
                  </div>
                ) : (
                  <form onSubmit={handleRegister} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center gap-1"><Users size={11} className="text-gray-400"/>{t("fullName")} *</label>
                        <input value={regName} onChange={e=>setRegName(e.target.value)} required placeholder={t("fullNamePlaceholder")}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0eb5cb]/30 bg-gray-50"/>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center gap-1"><Phone size={11} className="text-gray-400"/>{t("phone")} *</label>
                        <input type="tel" value={regPhone} onChange={e=>setRegPhone(e.target.value)} required placeholder={t("phonePlaceholder")} dir="ltr"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0eb5cb]/30 bg-gray-50"/>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center gap-1"><Lock size={11} className="text-gray-400"/>{t("password")} *</label>
                        <input type="password" value={regPass} onChange={e=>setRegPass(e.target.value)} required placeholder={t("passwordPlaceholder")} minLength={6}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0eb5cb]/30 bg-gray-50"/>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center gap-1"><Building2 size={11} className="text-gray-400"/>{t("companyName")}</label>
                        <input value={regCompany} onChange={e=>setRegCompany(e.target.value)} placeholder={t("optional")}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0eb5cb]/30 bg-gray-50"/>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center gap-1"><Hash size={11} className="text-gray-400"/>{t("vatNumber")}</label>
                        <input value={regVat} onChange={e=>setRegVat(e.target.value)} placeholder={t("optional")}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0eb5cb]/30 bg-gray-50"/>
                      </div>
                    </div>
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-xs flex items-center gap-2"><AlertCircle size={13} className="flex-shrink-0"/>{error}</div>}
                    <button type="submit" disabled={loading}
                      className="w-full bg-[#0eb5cb] hover:bg-[#0ca3b6] text-white py-3 rounded-xl font-bold disabled:opacity-60 transition-all text-sm flex items-center justify-center gap-2">
                      <UserPlus size={16}/>{loading ? t("registering") : t("registerBtn")}
                    </button>
                    <p className="text-xs text-gray-400 text-center">{t("autoLogin")}</p>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
