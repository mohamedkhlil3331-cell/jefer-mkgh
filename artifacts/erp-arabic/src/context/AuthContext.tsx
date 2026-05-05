import { createContext, useContext, useEffect, useState } from "react";

export interface User {
  id: number;
  name: string;
  phone: string;
  role: "customer" | "rep" | "reviewer" | "supervisor" | "warehouse" | "driver" | "admin";
  company_name?: string;
  vat_number?: string;
  cr_number?: string;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("mkgh_token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u) setUser(u); else { localStorage.removeItem("mkgh_token"); setToken(null); } })
      .finally(() => setLoading(false));
  }, [token]);

  const login = async (phone: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل تسجيل الدخول");
    localStorage.setItem("mkgh_token", data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    localStorage.removeItem("mkgh_token");
    setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, token, login, logout, loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function authFetch(token: string | null) {
  return (path: string, opts?: RequestInit) =>
    fetch(`/api${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
    }).then(r => r.json());
}
