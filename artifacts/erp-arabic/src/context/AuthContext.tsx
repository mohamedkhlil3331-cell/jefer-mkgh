import { createContext, useContext, useEffect, useState } from "react";

export interface User {
  id: number;
  name: string;
  phone: string;
  role: "customer" | "rep" | "reviewer" | "supervisor" | "warehouse" | "driver" | "admin" | "employee";
  company_name?: string;
  vat_number?: string;
  cr_number?: string;
  isGuest?: boolean;
}

interface RegisterData {
  name: string; phone: string; password: string;
  company_name?: string; vat_number?: string; role?: string;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  login: (phone: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<{ pending?: boolean; message: string }>;
  loginAsGuest: () => void;
  logout: () => void;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]   = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("mkgh_token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("mkgh_token");
    if (!t) { setLoading(false); return; }
    if (t === "guest") {
      setUser({ id: 0, name: "زائر", phone: "guest", role: "customer", isGuest: true });
      setLoading(false);
      return;
    }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.ok ? r.json() : null)
      .then(u => {
        if (u) { setUser(u); setToken(t); }
        else { localStorage.removeItem("mkgh_token"); setToken(null); }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (phone: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل تسجيل الدخول");
    localStorage.setItem("mkgh_token", data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (formData: RegisterData) => {
    const res = await fetch("/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
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
    setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, token, login, register, loginAsGuest, logout, loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function authFetch(token: string | null) {
  return (path: string, opts?: RequestInit) =>
    fetch(`/api${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
    }).then(r => r.json());
}
