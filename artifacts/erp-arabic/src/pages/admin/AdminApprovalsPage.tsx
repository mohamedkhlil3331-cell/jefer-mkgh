import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Clock, CheckCircle2, XCircle, User, Phone, Building2, RefreshCw, Inbox } from "lucide-react";

interface PendingUser {
  id: number; name: string; phone: string; role: string;
  company_name?: string; register_note?: string; created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  customer: "عميل", rep: "مندوب", reviewer: "مراجع",
  supervisor: "مشرف نقليات", warehouse: "مستودع", driver: "سائق", admin: "مدير",
};

const ROLE_COLORS: Record<string, string> = {
  customer: "bg-blue-100 text-blue-700",  rep: "bg-pink-100 text-pink-700",
  reviewer: "bg-indigo-100 text-indigo-700", supervisor: "bg-orange-100 text-orange-700",
  warehouse: "bg-green-100 text-green-700", driver: "bg-yellow-100 text-yellow-700",
  admin: "bg-purple-100 text-purple-700",
};

export default function AdminApprovalsPage() {
  const { token } = useAuth();
  const [pending, setPending]   = useState<PendingUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [acting,  setActing]    = useState<number | null>(null);
  const [flash,   setFlash]     = useState<{ id: number; ok: boolean } | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/pending-approvals", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPending(d); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const decide = async (id: number, approved: boolean) => {
    setActing(id);
    try {
      await fetch(`/api/admin/users/${id}/approve`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ approved }),
      });
      setFlash({ id, ok: approved });
      setTimeout(() => { setFlash(null); setPending(prev => prev.filter(u => u.id !== id)); }, 1200);
    } finally { setActing(null); }
  };

  return (
    <div dir="rtl" className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Clock size={24} className="text-amber-500" /> موافقة الحسابات الجديدة
          </h1>
          <p className="text-gray-400 text-sm mt-1">الحسابات التي تحتاج موافقتك للتفعيل</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />تحديث
        </button>
      </div>

      {/* Count badge */}
      {!loading && (
        <div className="flex items-center gap-3">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
            ${pending.length > 0 ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-green-50 text-green-700 border border-green-100"}`}>
            {pending.length > 0 ? <Clock size={15} /> : <CheckCircle2 size={15} />}
            {pending.length > 0 ? `${pending.length} طلب بانتظار المراجعة` : "لا توجد طلبات معلقة"}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && pending.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Inbox size={48} className="text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">لا توجد طلبات معلقة</p>
          <p className="text-gray-300 text-sm mt-1">جميع الطلبات تمت مراجعتها</p>
        </div>
      )}

      {/* Cards */}
      {!loading && pending.map(u => (
        <div key={u.id}
          className={`bg-white rounded-2xl border shadow-sm p-5 transition-all duration-300
            ${flash?.id === u.id
              ? flash.ok ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"
              : "border-gray-100 hover:shadow-md"}`}>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#103c68]/10 flex items-center justify-center flex-shrink-0 text-[#103c68] font-black text-lg">
              {u.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-900">{u.name}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || "bg-gray-100 text-gray-600"}`}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Phone size={11} />{u.phone}</span>
                {u.company_name && <span className="flex items-center gap-1"><Building2 size={11} />{u.company_name}</span>}
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {new Date(u.created_at).toLocaleDateString("ar-SA")}
                </span>
              </div>

              {u.register_note && (
                <div className="mt-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-600">
                  <span className="font-semibold text-gray-400 ml-1">ملاحظة:</span>{u.register_note}
                </div>
              )}
            </div>

            {/* Actions */}
            {flash?.id === u.id ? (
              <div className={`flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-xl
                ${flash.ok ? "text-green-600 bg-green-100" : "text-red-600 bg-red-100"}`}>
                {flash.ok ? <><CheckCircle2 size={16}/>تم القبول</> : <><XCircle size={16}/>تم الرفض</>}
              </div>
            ) : (
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => decide(u.id, true)} disabled={acting === u.id}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                  <CheckCircle2 size={15} />قبول
                </button>
                <button onClick={() => decide(u.id, false)} disabled={acting === u.id}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors border border-red-200">
                  <XCircle size={15} />رفض
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
