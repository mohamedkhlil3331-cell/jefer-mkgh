import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRememberedState } from "@/hooks/useRememberedState";
import { ScrollText, Search, RefreshCw, User, Clock, DatabaseZap, CheckCircle2, AlertTriangle, ShieldAlert, Trash2, ChevronDown, ChevronUp, Table2 } from "lucide-react";

interface LogEntry {
  id: number; user_phone: string; user_name: string; user_role: string;
  action: string; entity_type: string; entity_id: string; details: string; created_at: string;
}

interface MirrorError {
  at: string;
  sql: string;
  message: string;
  table?: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير", reviewer: "مراجع", supervisor: "مشرف", warehouse: "مستودع",
  driver: "سائق", rep: "مندوب", customer: "عميل", workshop_manager: "مدير ورشة",
  purchasing: "مشتريات",
};
const ACTION_COLORS: Record<string, string> = {
  "order": "bg-blue-50 text-blue-700",
  "login": "bg-green-50 text-green-700",
  "cancel": "bg-red-50 text-red-700",
  "rate": "bg-amber-50 text-amber-700",
  "payment": "bg-purple-50 text-purple-700",
  "action": "bg-gray-50 text-gray-600",
};

export default function SystemLogsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || (user?.permissions?.includes("legal_logs") ?? false);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useRememberedState("admin-system-logs-search", "");
  const [roleFilter, setRoleFilter] = useRememberedState("admin-system-logs-role-filter", "");
  const [actionFilter, setActionFilter] = useRememberedState("admin-system-logs-action-filter", "");

  // Supabase sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; summary?: Record<string, number>; error?: string } | null>(null);

  // Mirror-error state
  const [mirrorErrors, setMirrorErrors] = useState<MirrorError[]>([]);
  const [mirrorCount, setMirrorCount] = useState(0);
  const [clearingErrors, setClearingErrors] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const toggleError = (i: number) => setExpandedErrors(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const loadMirrorErrors = useCallback(() => {
    if (!isAdmin) return;
    fetch("/api/admin/mirror-errors")
      .then(r => r.ok ? r.json() : { count: 0, errors: [] })
      .then(d => { setMirrorCount(d.count ?? 0); setMirrorErrors(d.errors ?? []); })
      .catch(() => {});
  }, [isAdmin]);

  const clearMirrorErrors = async () => {
    setClearingErrors(true);
    try {
      await fetch("/api/admin/mirror-errors", { method: "DELETE" });
      setMirrorErrors([]);
      setMirrorCount(0);
    } finally {
      setClearingErrors(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync-to-pg", { method: "POST" });
      const d = await res.json();
      setSyncResult(d);
    } catch {
      setSyncResult({ ok: false, error: "تعذّر الاتصال بالخادم" });
    } finally {
      setSyncing(false);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (!isAdmin && user?.phone) params.set("phone", user.phone);
    if (search) params.set("q", search);
    if (roleFilter) params.set("role", roleFilter);
    if (actionFilter) params.set("action", actionFilter);
    params.set("limit", "300");
    fetch(`/api/system-logs?${params}`)
      .then(r => r.json())
      .then(d => setLogs(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [isAdmin, user?.phone, search, roleFilter, actionFilter]);

  useEffect(load, [load]);

  // Poll mirror errors every 30s so the admin sees failures quickly
  useEffect(() => {
    loadMirrorErrors();
    const id = setInterval(loadMirrorErrors, 30_000);
    return () => clearInterval(id);
  }, [loadMirrorErrors]);

  const getActionColor = (action: string) => {
    const key = Object.keys(ACTION_COLORS).find(k => action.toLowerCase().includes(k));
    return ACTION_COLORS[key || "action"] || ACTION_COLORS.action;
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center">
            <ScrollText size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">سجلات النظام والأنشطة</h1>
            <p className="text-sm text-gray-500">{isAdmin ? "جميع الأنشطة في النظام" : "سجل نشاطك الشخصي"}</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-gray-200 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> تحديث
        </button>
      </div>

      {/* ── Mirror-Error Alert Panel ── */}
      {isAdmin && mirrorCount > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-2xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={18} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-red-900 text-sm flex items-center gap-2">
                  فشل حفظ البيانات في Supabase
                  <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{mirrorCount}</span>
                </p>
                <p className="text-xs text-red-600 mt-0.5">بعض التعديلات لم تُرسَل إلى قاعدة البيانات السحابية — البيانات محفوظة محلياً فقط</p>
              </div>
            </div>
            <button
              onClick={clearMirrorErrors}
              disabled={clearingErrors}
              className="flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-100 disabled:opacity-60 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              <Trash2 size={14} />
              {clearingErrors ? "جاري المسح..." : "مسح الأخطاء"}
            </button>
          </div>
          <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
            {mirrorErrors.map((e, i) => {
              const expanded = expandedErrors.has(i);
              return (
                <div key={i} className="bg-white border border-red-200 rounded-xl overflow-hidden">
                  {/* Header row — always visible */}
                  <button
                    onClick={() => toggleError(i)}
                    className="w-full text-right px-3 py-2.5 flex items-start gap-2 hover:bg-red-50/60 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-1 text-xs font-mono">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1 text-red-400">
                          <Clock size={11} className="flex-shrink-0" />
                          {new Date(e.at).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                        {e.table && (
                          <span className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-semibold font-sans">
                            <Table2 size={10} />
                            {e.table}
                          </span>
                        )}
                      </div>
                      <div className={`text-red-800 font-semibold leading-snug ${expanded ? "" : "line-clamp-2"}`}>{e.message}</div>
                    </div>
                    <div className="flex-shrink-0 mt-0.5 text-red-400">
                      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>

                  {/* Expanded: full message + SQL */}
                  {expanded && (
                    <div className="border-t border-red-100 px-3 py-2.5 space-y-2 bg-red-50/30">
                      <div>
                        <p className="text-[10px] font-semibold text-red-500 mb-1 font-sans">رسالة PostgreSQL الكاملة</p>
                        <pre className="text-xs text-red-900 whitespace-pre-wrap break-all font-mono leading-relaxed bg-white border border-red-100 rounded-lg px-3 py-2 select-all">{e.message}</pre>
                      </div>
                      {e.sql && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 mb-1 font-sans">SQL</p>
                          <pre className="text-xs text-gray-500 whitespace-pre-wrap break-all font-mono bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 select-all">{e.sql}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Supabase OK badge when no errors ── */}
      {isAdmin && mirrorCount === 0 && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 w-fit">
          <CheckCircle2 size={13} />
          <span>لا توجد أخطاء في مزامنة Supabase</span>
        </div>
      )}

      {/* ── Supabase Backup Sync Panel ── */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                <DatabaseZap size={18} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-blue-900 text-sm">مزامنة البيانات مع Supabase</p>
                <p className="text-xs text-blue-600 mt-0.5">بعد كل استيراد من Excel، اضغط هنا لحفظ البيانات في الخادم السحابي</p>
              </div>
            </div>
            <button
              onClick={runSync}
              disabled={syncing}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "جاري المزامنة..." : "مزامنة الآن"}
            </button>
          </div>

          {syncResult && (
            <div className={`mt-3 rounded-xl px-4 py-3 text-sm font-semibold flex items-start gap-2 ${syncResult.ok ? "bg-green-100 text-green-800 border border-green-200" : "bg-red-100 text-red-800 border border-red-200"}`}>
              {syncResult.ok ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
              <div>
                {syncResult.ok ? (
                  <>
                    <div>تمت المزامنة بنجاح ✅</div>
                    {syncResult.summary && (
                      <div className="text-xs font-normal mt-1 space-y-0.5">
                        {Object.entries(syncResult.summary).filter(([,v]) => v > 0).map(([t, v]) => (
                          <div key={t}>{t}: {v} صف</div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div>{syncResult.error || "فشلت المزامنة"}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input placeholder="ابحث في السجلات..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pr-9 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
          </div>
          {isAdmin && (
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
              <option value="">جميع الأدوار</option>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
            <option value="">جميع الإجراءات</option>
            {["order","login","cancel","rate","payment"].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw size={24} className="animate-spin text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">جاري التحميل...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <ScrollText size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-semibold">لا توجد سجلات</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  {(isAdmin ? ["المستخدم","الدور","الإجراء","التفاصيل","الكيان","الوقت"] : ["الإجراء","التفاصيل","الوقت"]).map(h => (
                    <th key={h} className="px-4 py-3 text-right font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    {isAdmin && (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#103c68]/10 flex items-center justify-center flex-shrink-0">
                              <User size={11} className="text-[#103c68]" />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 text-xs">{log.user_name || log.user_phone || "النظام"}</div>
                              <div className="text-xs text-gray-400">{log.user_phone}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{ROLE_LABELS[log.user_role] || log.user_role || "—"}</span>
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getActionColor(log.action)}`}>{log.action}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <span className="line-clamp-2 text-xs">{log.details || "—"}</span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">{log.entity_type || "—"}{log.entity_id ? ` #${log.entity_id}` : ""}</td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock size={11} />
                        {new Date(log.created_at).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && logs.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
            {logs.length} سجل · آخر تحديث {new Date().toLocaleTimeString("ar-SA")}
          </div>
        )}
      </div>
    </div>
  );
}
