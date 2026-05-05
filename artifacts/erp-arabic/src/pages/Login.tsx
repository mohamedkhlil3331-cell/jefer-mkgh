import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Package, Truck, LayoutDashboard, Users, Warehouse,
  ArrowLeft, Phone, Lock, AlertCircle, ChevronRight,
} from "lucide-react";

type Portal = null | "customer" | "admin";

const CUSTOMER_DEMOS = [
  { label: "عميل", phone: "0555555555", pass: "123456" },
];

const ADMIN_DEMOS = [
  { label: "مدير",          phone: "0500000000", pass: "admin123", color: "bg-[#103c68] text-white" },
  { label: "مراجع",         phone: "0500000001", pass: "123456",   color: "bg-indigo-600 text-white" },
  { label: "مشرف نقليات",  phone: "0500000002", pass: "123456",   color: "bg-orange-500 text-white" },
  { label: "مستودع",        phone: "0500000003", pass: "123456",   color: "bg-green-600 text-white" },
  { label: "سائق",          phone: "0500000004", pass: "123456",   color: "bg-yellow-500 text-white" },
  { label: "مندوب",         phone: "0500000005", pass: "123456",   color: "bg-pink-500 text-white" },
];

export default function Login() {
  const { login } = useAuth();
  const [portal, setPortal] = useState<Portal>(null);
  const [phone, setPhone]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await login(phone, password); }
    catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  const fill = (p: string, pass: string) => { setPhone(p); setPassword(pass); setError(""); };
  const back  = () => { setPortal(null); setPhone(""); setPassword(""); setError(""); };

  /* ── Landing ──────────────────────────────────────────────────────────────── */
  if (!portal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a1f3c] via-[#103c68] to-[#0eb5cb] flex flex-col items-center justify-center p-6" dir="rtl">
        {/* Decorative rings */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[300,500,700,900].map((s, i) => (
            <div key={i} className="absolute rounded-full border border-white/5"
              style={{ width: s, height: s, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
          ))}
        </div>

        {/* Brand */}
        <div className="relative text-center mb-12">
          <div className="w-20 h-20 bg-white/15 backdrop-blur rounded-3xl flex items-center justify-center mx-auto mb-5 border border-white/20 shadow-2xl">
            <span className="text-white font-black text-3xl">M</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">MKGH</h1>
          <p className="text-white/50 text-sm mt-2">نظام إدارة الشركة الموحد</p>
        </div>

        {/* Portal cards */}
        <div className="relative w-full max-w-2xl grid sm:grid-cols-2 gap-5">
          {/* Customer portal */}
          <button
            onClick={() => setPortal("customer")}
            className="group bg-white/10 hover:bg-white/15 backdrop-blur border border-white/15 hover:border-[#0eb5cb]/60
              rounded-3xl p-8 text-right transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
          >
            <div className="w-14 h-14 bg-[#0eb5cb]/20 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-[#0eb5cb]/30 transition-colors">
              <Package size={26} className="text-[#0eb5cb]" />
            </div>
            <h2 className="text-white font-black text-xl mb-2">بوابة العملاء</h2>
            <p className="text-white/50 text-sm leading-relaxed">
              تصفح المنتجات، تقديم الطلبات<br />ومتابعة حالة التوصيل
            </p>
            <div className="mt-6 flex items-center gap-2 text-[#0eb5cb] text-sm font-semibold">
              <span>ادخل الآن</span>
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["طلب اسمنت","تتبع الطلب","الفواتير","الكتالوج"].map(f => (
                <span key={f} className="text-xs bg-white/10 text-white/50 px-2 py-1 rounded-lg">{f}</span>
              ))}
            </div>
          </button>

          {/* Admin portal */}
          <button
            onClick={() => setPortal("admin")}
            className="group bg-white/10 hover:bg-white/15 backdrop-blur border border-white/15 hover:border-amber-400/60
              rounded-3xl p-8 text-right transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
          >
            <div className="w-14 h-14 bg-amber-400/15 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-amber-400/25 transition-colors">
              <LayoutDashboard size={26} className="text-amber-400" />
            </div>
            <h2 className="text-white font-black text-xl mb-2">بوابة الإدارة</h2>
            <p className="text-white/50 text-sm leading-relaxed">
              لوحة تحكم الإدارة، المستودعات<br />الموظفين، السائقين، والتقارير
            </p>
            <div className="mt-6 flex items-center gap-2 text-amber-400 text-sm font-semibold">
              <span>دخول الموظفين</span>
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["مدير","مشرف","سائق","مستودع","مراجع"].map(f => (
                <span key={f} className="text-xs bg-white/10 text-white/50 px-2 py-1 rounded-lg">{f}</span>
              ))}
            </div>
          </button>
        </div>

        <p className="relative text-white/25 text-xs mt-10">MKGH © {new Date().getFullYear()} — جميع الحقوق محفوظة</p>
      </div>
    );
  }

  /* ── Login form ───────────────────────────────────────────────────────────── */
  const isCustomer = portal === "customer";
  const accent     = isCustomer ? "#0eb5cb" : "#f59e0b";
  const accentBg   = isCustomer ? "bg-[#0eb5cb]" : "bg-amber-400";
  const accentHov  = isCustomer ? "hover:bg-[#0ca3b6]" : "hover:bg-amber-500";
  const accentRing = isCustomer ? "focus:ring-[#0eb5cb]/30" : "focus:ring-amber-400/30";
  const portalIcon = isCustomer ? <Package size={22} /> : <LayoutDashboard size={22} />;
  const demos      = isCustomer ? CUSTOMER_DEMOS : ADMIN_DEMOS;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1f3c] via-[#103c68] to-[#0eb5cb] flex items-center justify-center p-4" dir="rtl">
      {/* Decorative rings */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[300,500,700].map((s, i) => (
          <div key={i} className="absolute rounded-full border border-white/5"
            style={{ width: s, height: s, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
        ))}
      </div>

      <div className="relative w-full max-w-md">
        {/* Back button */}
        <button onClick={back}
          className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors group">
          <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
          العودة للبوابات
        </button>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Portal header */}
          <div style={{ background: `linear-gradient(135deg, #103c68, ${accent})` }} className="px-7 pt-7 pb-8">
            <div className="flex items-center gap-3 text-white mb-3">
              <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center">
                {portalIcon}
              </div>
              <div>
                <div className="font-black text-lg">{isCustomer ? "بوابة العملاء" : "بوابة الإدارة"}</div>
                <div className="text-white/60 text-xs">{isCustomer ? "نظام الطلبات والتوصيل" : "MKGH — إدارة الشركة"}</div>
              </div>
            </div>
            <p className="text-white/50 text-xs">
              {isCustomer ? "أدخل رقم جوالك وكلمة مرورك لمتابعة طلباتك" : "أدخل بيانات حسابك الوظيفي"}
            </p>
          </div>

          {/* Form */}
          <div className="px-7 py-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                  <Phone size={13} className="text-gray-400" />رقم الجوال
                </label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
                  placeholder="05xxxxxxxx"
                  className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ${accentRing} focus:border-gray-300 bg-gray-50 transition-all`} />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                  <Lock size={13} className="text-gray-400" />كلمة المرور
                </label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ${accentRing} focus:border-gray-300 bg-gray-50 transition-all`} />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                  <AlertCircle size={15} className="flex-shrink-0" />{error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className={`w-full ${accentBg} ${accentHov} text-white py-3.5 rounded-xl font-bold disabled:opacity-60 transition-all shadow-sm mt-1 text-sm`}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    جاري الدخول...
                  </span>
                ) : "تسجيل الدخول"}
              </button>
            </form>

            {/* Demo accounts */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center mb-3 font-medium">حسابات تجريبية — انقر للملء</p>
              <div className={`grid gap-2 ${demos.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
                {demos.map(({ label, phone: p, pass, color }) => (
                  <button key={p} onClick={() => fill(p, pass)}
                    className={`rounded-xl px-3 py-2.5 text-right transition-all hover:opacity-90 hover:scale-[1.02] ${color || "bg-gray-100 text-gray-700"}`}>
                    <div className="font-bold text-xs">{label}</div>
                    <div className="opacity-70 mt-0.5 font-mono text-[10px]">{p}</div>
                  </button>
                ))}
              </div>

              {/* Admin portal — extra info */}
              {!isCustomer && (
                <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <div className="flex flex-wrap gap-3 text-xs text-amber-700">
                    <div className="flex items-center gap-1.5"><Truck size={12} />النقليات والسائقين</div>
                    <div className="flex items-center gap-1.5"><Warehouse size={12} />إدارة المستودعات</div>
                    <div className="flex items-center gap-1.5"><Users size={12} />الموارد البشرية</div>
                  </div>
                </div>
              )}
              {isCustomer && (
                <div className="mt-4 bg-cyan-50 border border-cyan-100 rounded-xl p-3">
                  <p className="text-xs text-cyan-700 text-center">
                    عميل جديد؟ تواصل مع المبيعات على الواتساب
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
