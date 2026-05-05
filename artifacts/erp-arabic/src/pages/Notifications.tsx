import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Bell, Check } from "lucide-react";

interface Notification {
  id: number; title: string; body: string; read: number; created_at: string;
}

export default function Notifications() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!user) return;
    setLoading(true);
    fetch(`/api/notifications?phone=${user.phone}`).then(r => r.json()).then(setNotifs).finally(() => setLoading(false));
  };
  useEffect(load, [user]);

  const readAll = async () => {
    if (!user) return;
    await fetch("/api/notifications/read-all", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: user.phone }),
    });
    load();
  };

  const unread = notifs.filter(n => !n.read).length;

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">الإشعارات</h1>
          {unread > 0 && <p className="text-sm text-muted-foreground">{unread} إشعار غير مقروء</p>}
        </div>
        {unread > 0 && (
          <button onClick={readAll} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium">
            <Check size={14} /> تحديد الكل مقروء
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifs.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground bg-card rounded-xl border border-border">
          <Bell size={48} className="mx-auto mb-3 opacity-30" />
          <p>لا توجد إشعارات</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => (
            <div key={n.id} className={`bg-card border rounded-xl p-4 ${!n.read ? "border-primary/30 bg-primary/5" : "border-border"}`}>
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.read ? "bg-primary" : "bg-gray-300"}`} />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{n.title}</div>
                  {n.body && <div className="text-sm text-muted-foreground mt-0.5">{n.body}</div>}
                  <div className="text-xs text-muted-foreground mt-1.5">
                    {new Date(n.created_at).toLocaleString("ar-SA")}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
