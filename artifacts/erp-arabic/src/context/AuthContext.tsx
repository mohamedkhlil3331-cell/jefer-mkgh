import { createContext, useContext, useEffect, useState } from "react";
import { clearRememberedViewState } from "@/lib/remembered-view-storage";

export interface User {
  id: number;
  name: string;
  phone: string;
  role: "customer" | "rep" | "reviewer" | "supervisor" | "warehouse" | "driver" | "vehicle" | "admin" | "employee" | "finance" | "workshop_manager" | "purchasing" | "accountant" | "complaints" | (string & {});
  company_name?: string;
  vat_number?: string;
  cr_number?: string;
  isGuest?: boolean;
  vehicle_plate?: string;
  vehicle_id?: number;
  permissions?: string[] | null;
}

type AuthUserResult = { status: number; user?: User };

async function fetchAuthUser(token: string, signal?: AbortSignal): Promise<AuthUserResult> {
  const init: RequestInit = {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    ...(signal ? { signal } : {}),
  };
  let response = await fetch("/api/auth/me", init);
  if (response.status === 304) {
    response = await fetch("/api/auth/me", { ...init, cache: "reload" });
  }
  if (!response.ok) return { status: response.status };
  return { status: response.status, user: await response.json() as User };
}

/** Returns true if the user has the given permission key.
 *  - admin role always bypasses all permission checks.
 *  - Users with no permissions set get legacy role-based access (nothing blocked).
 *  - Users with a permissions array set are checked against that array. */
export function canAccess(user: User | null, perm: string): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (!user.permissions || user.permissions.length === 0) return true; // legacy role-based
  return user.permissions.includes(perm);
}

interface RegisterData {
  name: string; phone: string; password: string;
  company_name?: string; vat_number?: string; role?: string;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  login: (phone: string, password: string, otp?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<{ pending?: boolean; message: string }>;
  loginAsGuest: () => void;
  logout: () => void;
  logoutAllDevices: () => Promise<void>;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]   = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("mkgh_token"));
  const [loading, setLoading] = useState(true);

  // Fetch fresh user data (including latest permissions) from the server.
  // Returns the same object reference when nothing changed so that consumers
  // that depend on user identity (user?.id) are NOT re-rendered unnecessarily.
  const refreshUser = (t: string) => {
    if (!t || t === "guest") return;
    fetchAuthUser(t)
      .then(({ status, user: u }) => {
        if (u) {
          setUser(prev => {
            if (prev && prev.id === u.id &&
                JSON.stringify(prev.permissions) === JSON.stringify(u.permissions))
              return prev; // same user, same permissions — keep same reference → no re-render
            return u;
          });
          setToken(t);
        }
        else if (status === 401) {
          localStorage.removeItem("mkgh_token");
          setToken(null);
          setUser(null);
        }
      })
      .catch(() => { /* Keep the current session on transient network errors. */ });
  };

  useEffect(() => {
    const t = localStorage.getItem("mkgh_token");
    if (!t) { setLoading(false); return; }
    if (t === "guest") {
      setUser({ id: 0, name: "زائر", phone: "guest", role: "customer", isGuest: true });
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    fetchAuthUser(t, ctrl.signal)
      .then(({ status, user: u }) => {
        if (u) { setUser(u); setToken(t); }
        else if (status === 401) { localStorage.removeItem("mkgh_token"); setToken(null); }
      })
      .catch(() => { /* Keep the saved session on timeout or network errors. */ })
      .finally(() => { clearTimeout(timer); setLoading(false); });
  }, []);

  // Re-fetch permissions whenever the user returns to the tab (visibility change)
  // This ensures admin-granted permissions appear immediately without re-login.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        const t = localStorage.getItem("mkgh_token");
        if (t) refreshUser(t);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const login = async (phone: string, password: string, otp?: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password, ...(otp ? { otp } : {}) }),
        signal: ctrl.signal,
      });
      let data: { error?: string; otp_required?: boolean; token?: string; user?: typeof user };
      try {
        data = await res.json();
      } catch {
        throw new Error("تعذر الاتصال بخادم تسجيل الدخول. حاول مجدداً بعد قليل.");
      }
      if (!res.ok) throw new Error(data.error || "فشل تسجيل الدخول");
      if (data.otp_required) throw new Error("OTP_REQUIRED");
      if (!data.token || !data.user) throw new Error("استجابة تسجيل الدخول غير مكتملة. حاول مجدداً.");
      localStorage.setItem("mkgh_token", data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err: any) {
      if (err?.name === "AbortError") throw new Error("تعذر الاتصال بالخادم، حاول مجدداً");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  const register = async (formData: RegisterData) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التسجيل");
      // Auto-login customers
      if (data.token) {
        localStorage.setItem("mkgh_token", data.token);
        setToken(data.token);
        setUser(data.user);
      }
      return { pending: data.pending, message: data.message };
    } catch (err: any) {
      if (err?.name === "AbortError") throw new Error("تعذر الاتصال بالخادم، حاول مجدداً");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  const loginAsGuest = () => {
    localStorage.setItem("mkgh_token", "guest");
    setToken("guest");
    setUser({ id: 0, name: "زائر", phone: "guest", role: "customer", isGuest: true });
  };

  const logout = () => {
    const t = localStorage.getItem("mkgh_token");
    if (t && t !== "guest") fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${t}` } });
    localStorage.removeItem("mkgh_token");
    clearRememberedViewState();
    setToken(null);
    setUser(null);
  };

  const logoutAllDevices = async () => {
    const t = localStorage.getItem("mkgh_token");
    if (!t || t === "guest") {
      logout();
      return;
    }
    const res = await fetch("/api/auth/logout-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "تعذر تسجيل الخروج من الأجهزة");
    localStorage.removeItem("mkgh_token");
    clearRememberedViewState();
    setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, token, login, register, loginAsGuest, logout, logoutAllDevices, loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function authFetch(token: string | null) {
  return (path: string, opts?: RequestInit) =>
    fetch(`/api${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
    }).then(r => r.json());
}
