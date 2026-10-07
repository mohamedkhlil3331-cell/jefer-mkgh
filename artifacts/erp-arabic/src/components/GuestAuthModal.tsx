import { useLocation } from "wouter";
import { X, UserPlus, LogIn, ShoppingCart } from "lucide-react";

interface Props {
  onClose: () => void;
  message?: string;
}

export default function GuestAuthModal({ onClose, message }: Props) {
  const [loc, navigate] = useLocation();

  const returnTo = encodeURIComponent(loc);

  const goRegister = () => {
    onClose();
    navigate(`/login?register=1&returnTo=${returnTo}`);
  };

  const goLogin = () => {
    onClose();
    navigate(`/login?returnTo=${returnTo}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      dir="rtl"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-gradient-to-l from-[#103c68] to-[#0d2e50] p-5 text-white relative">
          <button
            aria-label="إغلاق نافذة تسجيل الدخول"
            onClick={onClose}
            className="absolute top-4 left-4 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X size={14} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
              <ShoppingCart size={22} className="text-white" />
            </div>
            <div>
              <h2 className="font-black text-lg leading-tight">تحتاج حساباً</h2>
              <p className="text-white/70 text-xs mt-0.5">
                {message ?? "سجّل دخولك أو أنشئ حساباً للمتابعة"}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <button
            onClick={goRegister}
            className="w-full bg-[#103c68] hover:bg-[#0d2e50] text-white py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#103c68]/20"
          >
            <UserPlus size={18} />
            إنشاء حساب جديد
          </button>

          <button
            onClick={goLogin}
            className="w-full bg-gray-50 hover:bg-gray-100 text-gray-800 py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-colors border border-gray-200"
          >
            <LogIn size={18} />
            تسجيل الدخول
          </button>

          <button
            onClick={onClose}
            className="w-full text-gray-400 hover:text-gray-600 py-2 text-sm font-medium transition-colors"
          >
            متابعة التصفح فقط
          </button>
        </div>
      </div>
    </div>
  );
}
