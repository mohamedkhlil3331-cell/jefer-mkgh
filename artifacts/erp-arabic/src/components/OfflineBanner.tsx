import { useEffect, useState } from "react";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";

type BannerState = "online" | "offline" | "synced";

export default function OfflineBanner() {
  const [state, setState] = useState<BannerState>(navigator.onLine ? "online" : "offline");
  const [pendingCount, setPendingCount] = useState(0);
  const [visible, setVisible] = useState(!navigator.onLine);

  /* Count items queued in IndexedDB */
  async function countPending() {
    try {
      const req = indexedDB.open("mkgh-pending", 1);
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("requests")) { setPendingCount(0); return; }
        const tx    = db.transaction("requests", "readonly");
        const count = tx.objectStore("requests").count();
        count.onsuccess = () => setPendingCount(count.result);
      };
    } catch { setPendingCount(0); }
  }

  useEffect(() => {
    const onOffline = () => { setState("offline"); setVisible(true); countPending(); };
    const onOnline  = () => { setState("online");  countPending(); };
    const onSynced  = () => { setState("synced"); setPendingCount(0); setTimeout(() => setVisible(false), 3000); };

    window.addEventListener("offline",       onOffline);
    window.addEventListener("online",        onOnline);
    window.addEventListener("pwa:offline",   onOffline);
    window.addEventListener("pwa:online",    onOnline);
    window.addEventListener("pwa:sync-done", onSynced);

    if (!navigator.onLine) countPending();

    return () => {
      window.removeEventListener("offline",       onOffline);
      window.removeEventListener("online",        onOnline);
      window.removeEventListener("pwa:offline",   onOffline);
      window.removeEventListener("pwa:online",    onOnline);
      window.removeEventListener("pwa:sync-done", onSynced);
    };
  }, []);

  if (!visible) return null;

  if (state === "synced") {
    return (
      <div className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-bold shadow-lg animate-pulse">
        <Wifi size={15} />
        <span>تم مزامنة البيانات المحفوظة محلياً بنجاح ✓</span>
      </div>
    );
  }

  if (state === "offline") {
    return (
      <div className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-bold shadow-lg">
        <WifiOff size={15} />
        <span>
          أنت غير متصل بالإنترنت — البرنامج يعمل محلياً
          {pendingCount > 0 && <span className="mr-2 bg-white/20 rounded-full px-2 py-0.5 text-xs">{pendingCount} طلب في الانتظار</span>}
        </span>
      </div>
    );
  }

  /* state === "online" after being offline — show briefly then hide */
  return (
    <div className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2.5 bg-[#103c68] text-white text-sm font-bold shadow-lg">
      <RefreshCw size={14} className="animate-spin" />
      <span>عاد الاتصال — جارٍ مزامنة البيانات...</span>
    </div>
  );
}
