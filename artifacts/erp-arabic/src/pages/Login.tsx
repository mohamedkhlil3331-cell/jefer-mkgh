import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import { LANGUAGES } from "@/i18n/translations";
import {
  Package, Truck, LayoutDashboard, Users, Warehouse,
  ArrowLeft, Phone, Lock, AlertCircle, ChevronRight,
  UserPlus, Eye, EyeOff, Building2, Hash, CheckCircle2,
  Clock, Globe,
} from "lucide-react";

type Portal  = null | "customer" | "admin";
type CustTab = "login" | "register";

export default function Login() {
  const { login, register, loginAsGuest } = useAuth();
  const { t, lang, setLang, dir } = useLang();

  const [portal, setPortal]   = useState<Portal>(null);
  const [custTab, setCustTab] = useState<CustTab>("login");
  const [showPw, setShowPw]   = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Login fields
  const [phone, setPhone]       = useState("");
  const [password, setPassword] = useState("");

  // Register fields
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

  // Floating language switcher
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
          <div className="absolute top-full mt-1 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[140px]"
            style={{ [dir === "rtl" ? "right" : "left"]: 0 }}>
            {LANGUAGES.map(l => (
              <button key={l.code} onClick={() => { setLang(l.code); setShowLangMenu(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-gray-50 transition-colors text-right
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

  /* ══════════════ Landing ══════════════════════════════════════════════════ */
  if (!portal) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1f3c] via-[#103c68] to-[#0eb5cb] flex flex-col items-center justify-center p-6" dir={dir}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[300,500,700,900].map((s,i) => (
          <div key={i} className="absolute rounded-full border border-white/5"
            style={{width:s,height:s,top:"50%",left:"50%",transform:"translate(-50%,-50%)"}} />
        ))}
      </div>

      {/* Language switcher — top right */}
      <div className="absolute top-4 end-4">
        <LangSwitcher dark />
      </div>

      <div className="relative text-center mb-12">
        <div className="w-20 h-20 bg-white/15 backdrop-blur rounded-3xl flex items-center justify-center mx-auto mb-5 border border-white/20 shadow-2xl">
          <span className="text-white font-black text-3xl">M</span>
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight">{t("brand")}</h1>
        <p className="text-white/50 text-sm mt-2">{t("tagline")}</p>
      </div>

      <div className="relative w-full max-w-2xl grid sm:grid-cols-2 gap-5">
        {/* Customer */}
        <button onClick={() => setPortal("customer")}
          className="group bg-white/10 hover:bg-white/15 backdrop-blur border border-white/15 hover:border-[#0eb5cb]/60
            rounded-3xl p-8 text-start transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
          <div className="w-14 h-14 bg-[#0eb5cb]/20 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-[#0eb5cb]/30 transition-colors">
            <Package size={26} className="text-[#0eb5cb]" />
          </div>
          <h2 className="text-white font-black text-xl mb-2">{t("customerPortal")}</h2>
          <p className="text-white/50 text-sm leading-relaxed whitespace-pre-line">{t("customerPortalDesc")}</p>
          <div className="mt-6 flex items-center gap-2 text-[#0eb5cb] text-sm font-semibold">
            <span>{t("enterNow")}</span>
            <ArrowLeft size={16} className={`transition-transform ${dir === "rtl" ? "group-hover:-translate-x-1" : "group-hover:translate-x-1 rotate-180"}`} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[t("navCatalog"), t("navMyOrders"), t("register"), t("guestLogin")].map(f => (
              <span key={f} className="text-xs bg-white/10 text-white/50 px-2 py-1 rounded-lg">{f}</span>
            ))}
          </div>
        </button>

        {/* Admin */}
        <button onClick={() => setPortal("admin")}
          className="group bg-white/10 hover:bg-white/15 backdrop-blur border border-white/15 hover:border-amber-400/60
            rounded-3xl p-8 text-start transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
          <div className="w-14 h-14 bg-amber-400/15 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-amber-400/25 transition-colors">
            <LayoutDashboard size={26} className="text-amber-400" />
          </div>
          <h2 className="text-white font-black text-xl mb-2">{t("adminPortal")}</h2>
          <p className="text-white/50 text-sm leading-relaxed whitespace-pre-line">{t("adminPortalDesc")}</p>
          <div className="mt-6 flex items-center gap-2 text-amber-400 text-sm font-semibold">
            <span>{t("staffEntry")}</span>
            <ArrowLeft size={16} className={`transition-transform ${dir === "rtl" ? "group-hover:-translate-x-1" : "group-hover:translate-x-1 rotate-180"}`} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[t("roleAdmin"), t("roleSupervisor"), t("roleDriver"), t("roleWarehouse")].map(f => (
              <span key={f} className="text-xs bg-white/10 text-white/50 px-2 py-1 rounded-lg">{f}</span>
            ))}
          </div>
        </button>
      </div>
      <p className="relative text-white/25 text-xs mt-10">{t("brand")} © {new Date().getFullYear()} — {t("rights")}</p>
    </div>
  );

  /* ══════════════ Admin Login ══════════════════════════════════════════════ */
  if (portal === "admin") {
    const ADMIN_DEMOS = [
      { label: t("roleAdmin"),      phone: "0500000000", pass: "admin123",   color: "bg-[#103c68] text-white" },
      { label: t("roleReviewer"),   phone: "0500000001", pass: "0500000001", color: "bg-indigo-600 text-white" },
      { label: t("roleSupervisor"), phone: "0500000002", pass: "0500000002", color: "bg-orange-500 text-white" },
      { label: t("roleWarehouse"),  phone: "0500000003", pass: "0500000003", color: "bg-green-600 text-white" },
      { label: t("roleDriver"),     phone: "0500000004", pass: "0500000004", color: "bg-yellow-500 text-white" },
      { label: t("roleRep"),        phone: "0500000005", pass: "0500000005", color: "bg-pink-500 text-white" },
    ];
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a1f3c] via-[#103c68] to-[#0eb5cb] flex items-center justify-center p-4" dir={dir}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[300,500,700].map((s,i) => (
            <div key={i} className="absolute rounded-full border border-white/5"
              style={{width:s,height:s,top:"50%",left:"50%",transform:"translate(-50%,-50%)"}} />
          ))}
        </div>
        {/* Language + Back row */}
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
                <div><div className="font-black text-lg">{t("adminPortal")}</div><div className="text-white/50 text-xs">MKGH</div></div>
              </div>
              <div className="mt-3 bg-amber-400/15 border border-amber-400/30 rounded-xl p-2.5 flex items-center gap-2 text-amber-300 text-xs">
                <Clock size={13} />{t("adminApprovalNote")}
              </div>
            </div>
            <div className="px-7 py-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5"><Phone size={13} className="text-gray-400" />{t("phone")}</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder={t("phonePlaceholder")}
                    dir="ltr"
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
                <p className="text-xs text-gray-400 text-center mb-3 font-medium">{t("demoAccounts")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {ADMIN_DEMOS.map(({label,phone:p,pass,color}) => (
                    <button key={p} onClick={() => fill(p,pass)}
                      className={`rounded-xl px-2 py-2.5 text-start transition-all hover:opacity-90 hover:scale-[1.02] ${color}`}>
                      <div className="font-bold text-xs">{label}</div>
                      <div className="opacity-70 font-mono text-[9px] mt-0.5">{p}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <div className="flex flex-wrap gap-3 text-xs text-amber-700">
                    <div className="flex items-center gap-1.5"><Truck size={12}/>{t("fleetGroup")}</div>
                    <div className="flex items-center gap-1.5"><Warehouse size={12}/>{t("navWarehouses")}</div>
                    <div className="flex items-center gap-1.5"><Users size={12}/>{t("hrGroup")}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════ Customer Portal ══════════════════════════════════════════ */
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

          {/* Tabs */}
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
                    <div className="opacity-60 font-mono mt-0.5 dir-ltr text-left">0555555555</div>
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
