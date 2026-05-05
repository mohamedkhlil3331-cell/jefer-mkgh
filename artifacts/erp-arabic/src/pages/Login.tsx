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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-white font-bold text-2xl">M</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">MKGH Logistics</h1>
            <p className="text-muted-foreground text-sm mt-1">نظام إدارة الطلبات والتوصيل</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">رقم الجوال</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                placeholder="05xxxxxxxx"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary bg-gray-50"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors mt-2"
            >
              {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-muted-foreground text-center mb-3 font-medium">حسابات تجريبية</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: "مدير", phone: "0500000000", pass: "admin123" },
                { label: "مراجع", phone: "0500000001", pass: "123456" },
                { label: "مشرف نقليات", phone: "0500000002", pass: "123456" },
                { label: "مستودع", phone: "0500000003", pass: "123456" },
                { label: "سائق", phone: "0500000004", pass: "123456" },
                { label: "عميل", phone: "0555555555", pass: "123456" },
              ].map(({ label, phone: p, pass }) => (
                <button
                  key={p}
                  onClick={() => { setPhone(p); setPassword(pass); }}
                  className="text-right bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-2 transition-colors"
                >
                  <div className="font-medium text-gray-700">{label}</div>
                  <div className="text-gray-400 mt-0.5">{p}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
