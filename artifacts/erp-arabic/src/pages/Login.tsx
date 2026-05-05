import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(phone, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" dir="rtl">
      {/* Left panel — brand */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-white"
              style={{ width: `${200 + i * 100}px`, height: `${200 + i * 100}px`, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
          ))}
        </div>
        <div className="relative text-center text-white">
          <div className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl border border-white/30">
            <span className="text-white font-black text-4xl tracking-tight">M</span>
          </div>
          <h1 className="text-5xl font-black tracking-tight">MKGH</h1>
          <p className="text-blue-200 text-lg mt-3 font-medium">نظام أتمتة بيانات الشركات</p>
          <div className="mt-10 space-y-3 text-right">
            {["إدارة الطلبات والتوصيل","تتبع الأسطول والسائقين","إدارة المستودعات","التقارير والفواتير الضريبية"].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-blue-100">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <span className="text-white font-black text-2xl">M</span>
            </div>
            <h1 className="text-3xl font-black text-gray-900">MKGH</h1>
            <p className="text-gray-400 text-sm mt-1">نظام أتمتة بيانات الشركات</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">تسجيل الدخول</h2>
              <p className="text-sm text-gray-400 mt-1">أدخل بيانات حسابك للمتابعة</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">رقم الجوال</label>
                <input
                  type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
                  placeholder="05xxxxxxxx"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-gray-50 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-gray-50 transition-all"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold disabled:opacity-60 transition-colors shadow-sm mt-1">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                    جاري تسجيل الدخول...
                  </span>
                ) : "تسجيل الدخول"}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center mb-3 font-medium">حسابات تجريبية — انقر للملء</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: "مدير", phone: "0500000000", pass: "admin123", color: "bg-purple-50 border-purple-100 text-purple-700" },
                  { label: "مراجع", phone: "0500000001", pass: "123456", color: "bg-indigo-50 border-indigo-100 text-indigo-700" },
                  { label: "مشرف نقليات", phone: "0500000002", pass: "123456", color: "bg-orange-50 border-orange-100 text-orange-700" },
                  { label: "مستودع", phone: "0500000003", pass: "123456", color: "bg-green-50 border-green-100 text-green-700" },
                  { label: "سائق", phone: "0500000004", pass: "123456", color: "bg-yellow-50 border-yellow-100 text-yellow-700" },
                  { label: "عميل", phone: "0555555555", pass: "123456", color: "bg-blue-50 border-blue-100 text-blue-700" },
                ].map(({ label, phone: p, pass, color }) => (
                  <button key={p} onClick={() => { setPhone(p); setPassword(pass); }}
                    className={`text-right border rounded-xl px-3 py-2.5 transition-all hover:shadow-sm ${color}`}>
                    <div className="font-bold">{label}</div>
                    <div className="opacity-60 mt-0.5 font-mono text-xs">{p}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-300 mt-4">MKGH © {new Date().getFullYear()} — نظام أتمتة بيانات الشركات</p>
        </div>
      </div>
    </div>
  );
}
