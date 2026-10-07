import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, X } from "lucide-react";

type MutationState = "syncing" | "success" | "failed";

interface MutationEntry {
  id: number;
  label: string;
  state: MutationState;
  message?: string;
  conflict?: boolean;
}

type Subscriber = (entries: MutationEntry[]) => void;

const subscribers = new Set<Subscriber>();
let entries: MutationEntry[] = [];
let nextId = 1;
let installed = false;
let mutationQueue: Promise<void> = Promise.resolve();

function publish(next: MutationEntry[]) {
  entries = next;
  subscribers.forEach(listener => listener(entries));
}

function subscribe(listener: Subscriber) {
  subscribers.add(listener);
  listener(entries);
  return () => {
    subscribers.delete(listener);
  };
}

function isTrackedMutation(method: string, url: string) {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  return ![
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/logout",
    "/api/auth/logout-all",
  ].some(path => url.includes(path));
}

function mutationLabel(method: string) {
  if (method === "DELETE") return "حذف البيانات";
  if (method === "POST") return "حفظ البيانات الجديدة";
  return "حفظ التعديلات";
}

function complete(id: number) {
  publish(entries.map(entry => entry.id === id
    ? { ...entry, state: "success", message: "تم الحفظ بنجاح" }
    : entry));
  window.setTimeout(() => {
    publish(entries.filter(entry => entry.id !== id || entry.state !== "success"));
  }, 2600);
}

function dismiss(id: number) {
  publish(entries.filter(entry => entry.id !== id));
}

function fail(
  id: number,
  message: string,
  conflict = false,
) {
  publish(entries.map(entry => entry.id === id
    ? { ...entry, state: "failed", message, conflict }
    : entry));
}

function isSameOriginApi(url: string) {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

async function runQueued<T>(operation: () => Promise<T>): Promise<T> {
  const previous = mutationQueue;
  let release!: () => void;
  mutationQueue = new Promise<void>(resolve => { release = resolve; });
  await previous.catch(() => {});
  try {
    return await operation();
  } finally {
    release();
  }
}

export function installMutationProtection() {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  const monitoredFetch: typeof window.fetch = async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = input instanceof Request ? input.url : String(input);
    if (!isSameOriginApi(url)) return originalFetch(input, init);

    const originalRequest = new Request(input, init);
    const baseHeaders = new Headers(originalRequest.headers);
    const token = localStorage.getItem("mkgh_token");
    if (token && token !== "guest" && !baseHeaders.has("Authorization")) {
      baseHeaders.set("Authorization", `Bearer ${token}`);
    }

    const trackedMutation = isTrackedMutation(method, url);

    const execute = async () => {
      const request = new Request(originalRequest, { headers: baseHeaders });

      if (!trackedMutation) {
        return originalFetch(request);
      }

      const id = nextId++;
      const label = mutationLabel(method);

      publish([...entries, { id, label, state: "syncing" as MutationState }]);
      try {
        const response = await originalFetch(request);
        if (response.ok) {
          complete(id);
        } else {
          const payload = await response.clone().json().catch(() => null) as { code?: string; error?: string } | null;
          const sessionReplaced = payload?.code === "SESSION_REPLACED";
          fail(
            id,
            sessionReplaced
              ? "تم فتح الحساب من جهاز آخر. أُوقفت هذه الجلسة ولن يُنفذ التعديل."
              : payload?.error || `تعذر الحفظ (رمز الخادم ${response.status})`,
            sessionReplaced,
          );
        }
        return response;
      } catch (error) {
        fail(id, "تعذر الاتصال بالخادم — لم يتم تأكيد الحفظ، أعد تنفيذ العملية من الصفحة");
        throw error;
      }
    };

    return trackedMutation ? runQueued(execute) : execute();
  };

  window.fetch = monitoredFetch;
}

export function MutationSyncStatus() {
  const [current, setCurrent] = useState<MutationEntry[]>(entries);

  useEffect(() => subscribe(setCurrent), []);

  const active = current.filter(entry => entry.state === "syncing");
  const failed = [...current].reverse().find(entry => entry.state === "failed");
  const succeeded = [...current].reverse().find(entry => entry.state === "success");

  if (active.length > 0) {
    return (
      <div
        className="fixed bottom-4 start-1/2 -translate-x-1/2 z-[10000] flex items-center gap-2 rounded-2xl bg-[#103c68] px-4 py-3 text-sm font-bold text-white shadow-2xl"
        role="status"
        aria-live="polite"
      >
        <RefreshCw size={16} className="animate-spin" />
        <span>{active.length > 1 ? `جاري مزامنة ${active.length} عمليات...` : "جاري المزامنة..."}</span>
      </div>
    );
  }

  if (failed) {
    return (
      <div
        className="fixed bottom-4 start-1/2 -translate-x-1/2 z-[10000] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-2xl"
        role="alert"
        aria-live="assertive"
      >
        <AlertCircle size={17} className="shrink-0" />
        <span className="truncate">{failed.message || "تعذر الحفظ"}</span>
        {failed.conflict && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs text-white hover:bg-red-700"
          >
            إعادة تحميل
          </button>
        )}
        <button
          type="button"
          onClick={() => dismiss(failed.id)}
          className="shrink-0 rounded-lg p-1 text-red-400 hover:bg-red-100 hover:text-red-700"
          aria-label="إغلاق رسالة الحفظ"
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  if (succeeded) {
    return (
      <div
        className="fixed bottom-4 start-1/2 -translate-x-1/2 z-[10000] flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-2xl"
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 size={17} />
        <span>{succeeded.message || "تم الحفظ بنجاح"}</span>
      </div>
    );
  }

  return null;
}

export function MutationSyncMonitor({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const onConflict = () => {
      const id = nextId++;
      publish([...entries, {
        id,
        label: "مزامنة تحديث مؤجل",
        state: "failed",
        conflict: true,
        message: "تم إلغاء تحديث مؤجل قديم لأن بيانات أحدث حُفظت من جهاز آخر.",
      }]);
    };
    window.addEventListener("mkgh:stale-write", onConflict);
    return () => window.removeEventListener("mkgh:stale-write", onConflict);
  }, []);
  return (
    <>
      {children}
      <MutationSyncStatus />
    </>
  );
}