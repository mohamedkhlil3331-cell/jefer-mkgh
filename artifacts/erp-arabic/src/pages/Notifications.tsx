import { useEffect, useState, useMemo } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { useAuth } from "@/context/AuthContext";
import {
  Bell, Check, CheckCheck, RefreshCw, Info, AlertTriangle,
  ShoppingCart, Truck, FileText, Package, X,
} from "lucide-react";

interface Notification {
  id: number; title: string; body: string; read: number; created_at: string;
  notification_type?: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  order:   ShoppingCart,
  payment: FileText,
  vehicle: Truck,
  invoice: FileText,
  load:    Package,
  deliver: Package,
  default: Bell,
};
const TYPE_COLOR: Record<string, string> = {
  order:   "bg-blue-100 text-blue-600",
  payment: "bg-green-100 text-green-600",
  vehicle: "bg-orange-100 text-orange-600",
  invoice: "bg-purple-100 text-purple-600",
  load:    "bg-cyan-100 text-cyan-600",
  deliver: "bg-teal-100 text-teal-600",
  default: "bg-gray-100 text-gray-500",
};

function relTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr / 24);
  if (day  > 0) return `منذ ${day} ${day === 1 ? "يوم" : "أيام"}`;
  if (hr   > 0) return `منذ ${hr} ${hr === 1 ? "ساعة" : "ساعات"}`;
  if (min  > 0) return `منذ ${min} دقيقة`;
  return "الآن";
}

export default function Notifications() {
  const { user } = useAuth();
  const [notifs,   setNotifs]   = useState<Notification[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useRememberedState("notifications-filter", "all" as "all" | "unread");

  const load = () => {
    if (!user) return;
    setLoading(true);
    fetch(`/api/notifications?phone=${user.phone}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setNotifs(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, [user]);

  const markRead = async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: user?.phone }),
    });
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
  };

  const readAll = async () => {
    if (!user) return;
    await fetch("/api/notifications/read-all", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: user.phone }),
    });
    setNotifs(prev => prev.map(n => ({ ...n, read: 1 })));
  };

  const unread = useMemo(() => notifs.filter(n => !n.read).length, [notifs]);
  const displayed = useMemo(() =>
    filter === "unread" ? notifs.filter(n => !n.read) : notifs,
    [notifs, filter]
  );

  const getTypeKey = (n: Notification) => {
    const t = (n.notification_type || n.title || "").toLowerCase();
    if (t.includes("طلب") || t.includes("order"))    return "order";
    if (t.includes("دفع") || t.includes("payment"))  return "payment";
    if (t.includes("سيار") || t.includes("vehicle")) return "vehicle";
    if (t.includes("فاتور") || t.includes("invoice")) return "invoice";
    if (t.includes("تحميل") || t.includes("load"))   return "load";
    if (t.includes("تسليم") || t.includes("deliv"))  return "deliver";
    return "default";
  };

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Bell size={24} className="text-[#103c68]" />الإشعارات
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {notifs.length} إشعار
            {unread > 0 && ` · ${unread} غير مقروء`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button onClick={readAll}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl transition-colors">
              <CheckCheck size={14} />تحديد الكل مقروء
            </button>
          )}
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl text-sm transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-xl w-fit">
        {([["all","الكل"],["unread","غير المقروءة"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              filter === k ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500"
            }`}>
            {l}
            {k === "unread" && unread > 0 && (
              <span className="ml-1.5 bg-[#103c68] text-white text-xs px-1.5 py-0.5 rounded-full">{unread}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse flex gap-3">
              <div className="w-11 h-11 rounded-xl bg-gray-100 flex-shrink-0" />
              <div className="flex-1">
                <div className="h-4 bg-gray-100 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
            <Bell size={32} className="text-gray-200" />
          </div>
          <p className="font-semibold text-gray-500">
            {filter === "unread" ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات"}
          </p>
          <p className="text-sm text-gray-300 mt-1">
            {filter === "unread" ? "لقد قرأت جميع الإشعارات" : "ستظهر هنا التحديثات والنشاطات"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(n => {
            const typeKey = getTypeKey(n);
            const Icon    = TYPE_ICON[typeKey] ?? Bell;
            const color   = TYPE_COLOR[typeKey];
            return (
              <div key={n.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 flex items-start gap-3 transition-all group
                  ${!n.read ? "border-[#103c68]/20 bg-[#103c68]/[0.02]" : "border-gray-100"}`}>

                {/* Icon */}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon size={18} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className={`font-semibold text-sm ${!n.read ? "text-gray-900" : "text-gray-700"} flex items-center gap-2`}>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-[#103c68] inline-block flex-shrink-0" />}
                        <span className="truncate">{n.title}</span>
                      </div>
                      {n.body && (
                        <div className="text-sm text-gray-500 mt-0.5 leading-relaxed">{n.body}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-300 whitespace-nowrap">{relTime(n.created_at)}</span>
                      {!n.read && (
                        <button
                          onClick={() => markRead(n.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                          title="تحديد مقروء">
                          <Check size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-300 mt-1">
                    {new Date(n.created_at).toLocaleString("ar-SA", {
                      weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
