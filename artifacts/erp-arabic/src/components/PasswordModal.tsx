import { useState } from "react";
import { Lock, Mail, X, RefreshCw } from "lucide-react";

interface PasswordModalProps {
  title: string;
  description?: string;
  onConfirm: (password: string) => void;
  onClose: () => void;
}

const PROTECTED_PASSWORD = "mkgh";

type Step = "password" | "otp";

export default function PasswordModal({ title, description, onConfirm, onClose }: PasswordModalProps) {
  const [step, setStep]           = useState<Step>("password");
  const [password, setPassword]   = useState("");
  const [otp, setOtp]             = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);

  const handlePasswordConfirm = async () => {
    if (password !== PROTECTED_PASSWORD) {
      setError("كلمة المرور غير صحيحة");
      setPassword("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/request", { method: "POST" });
      if (!res.ok) throw new Error("فشل إرسال رمز التحقق");
      setStep("otp");
    } catch (e) {
      setError((e as Error).message || "حدث خطأ، حاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    if (!otp.trim()) { setError("أدخل رمز التحقق"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "الرمز غير صحيح");
      onConfirm(password);
    } catch (e) {
      setError((e as Error).message || "الرمز غير صحيح");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError("");
    setOtp("");
    try {
      await fetch("/api/auth/otp/request", { method: "POST" });
    } catch {}
    setResending(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 hover:bg-gray-100 rounded-xl transition-colors text-gray-400"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            step === "otp" ? "bg-blue-100" : "bg-red-100"
          }`}>
            {step === "otp"
              ? <Mail size={20} className="text-blue-600" />
              : <Lock size={20} className="text-red-600" />
            }
          </div>
          <div>
            <h2 className="font-black text-gray-900 text-base">{title}</h2>
            {step === "password" && description && (
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            )}
            {step === "otp" && (
              <p className="text-xs text-gray-400 mt-0.5">أدخل الرمز المرسل للبريد الإلكتروني</p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {step === "password" ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  كلمة مرور الحماية
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handlePasswordConfirm()}
                  placeholder="أدخل كلمة المرور"
                  autoFocus
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-colors ${
                    error ? "border-red-400 bg-red-50" : "border-gray-200"
                  }`}
                />
                {error && (
                  <p className="text-red-600 text-xs mt-1.5 font-semibold">{error}</p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handlePasswordConfirm}
                  disabled={!password || loading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />إرسال الرمز...</>
                    : "تأكيد"
                  }
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-medium text-sm transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700 flex items-center gap-2">
                <Mail size={13} className="flex-shrink-0" />
                تم إرسال رمز التحقق إلى البريد الإلكتروني المسجّل
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  رمز التحقق (6 أرقام)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && otp.length === 6 && handleOtpVerify()}
                  placeholder="● ● ● ● ● ●"
                  autoFocus
                  dir="ltr"
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-center font-mono text-lg tracking-widest transition-colors ${
                    error ? "border-red-400 bg-red-50" : "border-gray-200"
                  }`}
                />
                {error && (
                  <p className="text-red-600 text-xs mt-1.5 font-semibold">{error}</p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleOtpVerify}
                  disabled={otp.length !== 6 || loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />جارٍ التحقق...</>
                    : "تحقق"
                  }
                </button>
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="flex items-center gap-1.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={13} className={resending ? "animate-spin" : ""} />
                  إعادة
                </button>
              </div>
              <button
                onClick={() => { setStep("password"); setError(""); setOtp(""); }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
              >
                ← رجوع
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
