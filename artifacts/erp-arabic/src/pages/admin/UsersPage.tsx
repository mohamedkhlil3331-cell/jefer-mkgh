import { useEffect, useState, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  Users, Search, Plus, Pencil, Trash2, Download, Upload,
  CheckCircle, XCircle, Shield, HardHat, Truck, Package,
  Warehouse, Car, User, LayoutDashboard, ChevronDown,
  X, Save, AlertCircle, RefreshCw, Filter, Wrench, ShoppingBag,
  Ban, ToggleLeft, ToggleRight, ChevronUp, Eye, EyeOff, ArrowLeftRight,
  MessageCircle,
} from "lucide-react";
import { PERMISSION_GROUPS, ALL_PERM_KEYS, ROLE_TEMPLATES } from "@/lib/permissions";
import { useAuth } from "@/context/AuthContext";
import { useRememberedState } from "@/hooks/useRememberedState";
import {
  useGetChatAdminUserConversations, useUpdateChatConversationSettings,
  getGetChatAdminUserConversationsQueryKey,
} from "@workspace/api-client-react";
import type { ChatAdminConversation } from "@workspace/api-client-react";

interface UserRow {
  id: number; name: string; phone: string; role: string;
  active: number; company_name: string; vat_number: string;
  email: string; approval_status: string; created_at: string;
  permissions?: string | null;
}


function parsePerms(raw?: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function ChatRetentionControls({ target, token, onClose }: { target: UserRow; token: string | null; onClose: () => void }) {
  const headers = { Authorization: `Bearer ${token ?? ""}` };
  const queryClient = useQueryClient();
  const query = useGetChatAdminUserConversations(target.id, {
    query: { queryKey: getGetChatAdminUserConversationsQueryKey(target.id) },
    request: { headers },
  });
  const update = useUpdateChatConversationSettings({ request: { headers } });
  const [error, setError] = useState("");
  const [draftDays, setDraftDays] = useState<Record<number, string>>({});
  async function save(item: ChatAdminConversation, changes: Partial<Pick<ChatAdminConversation, "retention_mode" | "retention_days" | "allow_user_delete">>) {
    const next = { retention_mode: item.retention_mode, retention_days: item.retention_days, allow_user_delete: item.allow_user_delete, ...changes };
    try {
      await update.mutateAsync({ conversationId: item.id, data: next });
      queryClient.invalidateQueries({ queryKey: getGetChatAdminUserConversationsQueryKey(target.id) });
    } catch { setError("تعذر حفظ سياسة المحادثة. حاول مجدداً."); }
  }
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl" dir="rtl">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div><h2 className="font-black text-gray-900">سياسات محادثات {target.name}</h2><p className="mt-1 text-xs text-gray-500">إعداد الحذف والاحتفاظ لكل محادثة مباشرة</p></div>
        <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="إغلاق"><X size={18}/></button>
      </div>
      <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {query.isLoading ? <div className="space-y-3">{[0,1,2].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100"/>)}</div> :
        query.isError ? <div className="py-10 text-center text-sm text-gray-500"><p>تعذر تحميل إعدادات المحادثات</p><button onClick={() => query.refetch()} className="mt-2 font-bold text-[#103c68]">إعادة المحاولة</button></div> :
        query.data?.length ? query.data.map(item => <div key={item.id} className="rounded-xl border border-gray-200 bg-[#fcfdfb] p-4" data-testid={`chat-policy-${item.id}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><div className="text-sm font-bold text-gray-800">{item.user_name} <span className="mx-1 text-gray-300">↔</span> {item.other_user_name}</div><div className="mt-1 text-xs text-gray-500">{item.user_role} · {item.other_user_role}</div></div>
            <span className="rounded-full bg-[#edf4ef] px-2.5 py-1 text-[10px] font-bold text-[#527569]">محادثة #{item.id}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <label className="text-xs font-semibold text-gray-600">الاحتفاظ بالرسائل
              <select value={item.retention_mode} disabled={update.isPending} onChange={e => void save(item, { retention_mode: e.target.value as "auto_delete" | "keep" })} className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#86aa99]" data-testid={`select-retention-${item.id}`}>
                <option value="auto_delete">حذف تلقائي</option><option value="keep">الاحتفاظ حتى الحذف اليدوي</option>
              </select>
            </label>
            <label className={`text-xs font-semibold text-gray-600 ${item.retention_mode === "keep" ? "opacity-45" : ""}`}>بعد (يوم)
              <input type="number" min={1} max={3650} value={draftDays[item.id] ?? String(item.retention_days)} disabled={update.isPending || item.retention_mode === "keep"} onChange={e => setDraftDays(current => ({ ...current, [item.id]: e.target.value }))} onBlur={e => {
                const days = Math.min(3650, Math.max(1, Number(e.target.value) || item.retention_days));
                setDraftDays(current => ({ ...current, [item.id]: String(days) }));
                if (days !== item.retention_days) void save(item, { retention_days: days });
              }} className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#86aa99]" data-testid={`input-retention-days-${item.id}`}/>
            </label>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600"><input type="checkbox" checked={item.allow_user_delete} disabled={update.isPending} onChange={e => void save(item, { allow_user_delete: e.target.checked })} className="h-4 w-4 accent-[#1d756f]" data-testid={`checkbox-user-delete-${item.id}`}/>السماح للمستخدم بحذف رسائله في هذه المحادثة</label>
        </div>) :
        <div className="py-12 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400"><MessageCircle size={21}/></div><p className="text-sm font-semibold text-gray-600">لا توجد محادثات لهذا المستخدم</p><p className="mt-1 text-xs text-gray-400">تظهر إعدادات الاحتفاظ عند بدء محادثة داخلية.</p></div>}
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/70 px-5 py-3 text-[11px] text-gray-500"><span>المحادثات الجديدة تبدأ بالاحتفاظ التلقائي لمدة 45 يوماً.</span><button onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-50">إغلاق</button></div>
    </div>
  </div>;
}

const ROLES: { key: string; label: string; color: string; bg: string; icon: React.ElementType }[] = [
  { key: "all",              label: "الكل",              color: "text-gray-700",    bg: "bg-gray-100",    icon: Users },
  { key: "admin",            label: "مدير النظام",       color: "text-purple-700",  bg: "bg-purple-100",  icon: LayoutDashboard },
  { key: "employee",         label: "موظف",              color: "text-teal-700",    bg: "bg-teal-100",    icon: HardHat },
  { key: "reviewer",         label: "مراجع",             color: "text-indigo-700",  bg: "bg-indigo-100",  icon: CheckCircle },
  { key: "supervisor",       label: "مشرف نقليات",       color: "text-orange-700",  bg: "bg-orange-100",  icon: Truck },
  { key: "warehouse",         label: "مستودع",            color: "text-green-700",   bg: "bg-green-100",   icon: Warehouse },
  { key: "warehouse_manager", label: "مسؤول المستودع",   color: "text-emerald-700", bg: "bg-emerald-100", icon: Warehouse },
  { key: "driver",           label: "سائق",              color: "text-yellow-700",  bg: "bg-yellow-100",  icon: Car },
  { key: "rep",              label: "مندوب",             color: "text-pink-700",    bg: "bg-pink-100",    icon: Users },
  { key: "workshop_manager", label: "مدير الورشة",       color: "text-rose-700",    bg: "bg-rose-100",    icon: Wrench },
  { key: "purchasing",       label: "مسئول المشتريات",   color: "text-amber-700",   bg: "bg-amber-100",   icon: ShoppingBag },
  { key: "accountant",              label: "محاسب",                   color: "text-violet-700", bg: "bg-violet-100", icon: Users },
  { key: "bank_officer",            label: "مسؤول البنوك",            color: "text-sky-700",    bg: "bg-sky-100",    icon: Users },
  { key: "fsohat",                  label: "مسؤول الفسوحات",          color: "text-cyan-700",   bg: "bg-cyan-100",   icon: Users },
  { key: "crane_traffic_supervisor",label: "مشرف الدينا والأوناش",    color: "text-lime-700",   bg: "bg-lime-100",   icon: Truck },
  { key: "customer",                label: "عميل",                    color: "text-blue-700",   bg: "bg-blue-100",   icon: User },
  { key: "rental_trip_customer",    label: "دورة عميل ايجار رحلات", color: "text-emerald-800", bg: "bg-emerald-50", icon: Car },
];

const ROLE_MAP: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {};
ROLES.forEach(r => { ROLE_MAP[r.key] = { label: r.label, color: r.color, bg: r.bg, icon: r.icon }; });

const EMPTY_FORM = { name: "", phone: "", password: "", role: "customer", company_name: "", vat_number: "", email: "", permissions: [] as string[] };

export default function UsersPage() {
  const { token } = useAuth();
  const [users,      setUsers]      = useState<UserRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [roleFilter, setRoleFilter] = useRememberedState("admin-users-role-filter", "all");
  const [search,     setSearch]     = useRememberedState("admin-users-search", "");
  const [showForm,   setShowForm]   = useState(false);
  const [editUser,   setEditUser]   = useState<UserRow | null>(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [importing,  setImporting]  = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);
  const [openGroups,        setOpenGroups]        = useState<Record<string, boolean>>({});
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [showPass,     setShowPass]     = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null);
  const [passwordInfo, setPasswordInfo] = useState<{ id: number; password: string | null; recoverable: boolean } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [chatPolicyTarget, setChatPolicyTarget] = useState<UserRow | null>(null);
  const [showSwap,     setShowSwap]     = useState(false);
  const [swapSourceId, setSwapSourceId] = useState("");
  const [swapTargetId, setSwapTargetId] = useState("");
  const [swapping,     setSwapping]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/users", { headers: { Authorization: `Bearer ${token ?? ""}` } }).then(r => r.json())
      .then(setUsers).finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Filtered users
  const filtered = useMemo(() => {
    let list = roleFilter === "all" ? users : users.filter(u => u.role === roleFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.phone?.includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.company_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, roleFilter, search]);

  // Role counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: users.length };
    users.forEach(u => { c[u.role] = (c[u.role] ?? 0) + 1; });
    return c;
  }, [users]);

  // ── CRUD ──────────────────────────────────────────────────────────────
  const openNew = () => { setEditUser(null); setForm({ ...EMPTY_FORM, permissions: [] }); setSelectedTemplates([]); setShowForm(true); setMsg(null); };
  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setForm({
      name: u.name, phone: u.phone, password: "", role: u.role,
      company_name: u.company_name ?? "", vat_number: u.vat_number ?? "",
      email: u.email ?? "", permissions: parsePerms(u.permissions),
    });
    setSelectedTemplates([]);
    setShowForm(true); setMsg(null);
  };

  const viewPassword = async (u: UserRow) => {
    setPasswordTarget(u);
    setPasswordInfo(null);
    setPasswordError("");
    setPasswordLoading(true);
    try {
      const response = await fetch(`/api/users/${u.id}/password`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
        cache: "no-store",
      });
      const data = await response.json() as { error?: string; password: string | null; recoverable: boolean };
      if (!response.ok) throw new Error(data.error || "تعذر عرض كلمة المرور");
      setPasswordInfo({ id: u.id, password: data.password, recoverable: data.recoverable });
    } catch (error) {
      setPasswordError((error as Error).message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const toggleTemplate = (key: string) => {
    setSelectedTemplates(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      const merged = [...new Set(
        next.flatMap(k => ROLE_TEMPLATES.find(t => t.key === k)?.perms ?? [])
      )];
      setForm(p => ({ ...p, permissions: merged }));
      return next;
    });
  };

  const togglePerm = (key: string) =>
    setForm(p => ({
      ...p,
      permissions: p.permissions.includes(key)
        ? p.permissions.filter(k => k !== key)
        : [...p.permissions, key],
    }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setMsg(null);
    try {
      const url    = editUser ? `/api/users/${editUser.id}` : "/api/users";
      const method = editUser ? "PUT" : "POST";
      const body   = editUser
        ? { name: form.name, phone: form.phone, role: form.role, company_name: form.company_name, vat_number: form.vat_number, email: form.email, permissions: form.permissions, ...(form.password ? { password: form.password } : {}) }
        : { ...form };
      const r  = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` }, body: JSON.stringify(body) });
      const d  = await r.json();
      if (!r.ok) throw new Error(d.error ?? "فشل الحفظ");
      setMsg({ type: "ok", text: editUser ? "تم التحديث" : "تمت الإضافة" });
      setShowForm(false); setEditUser(null); load();
    } catch (err) { setMsg({ type: "err", text: (err as Error).message }); }
    finally { setSubmitting(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (r.ok) {
        setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const toggleActive = async (u: UserRow) => {
    await fetch(`/api/users/${u.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ active: u.active ? 0 : 1 }),
    });
    load();
  };

  const swapLoginCredentials = async () => {
    if (!swapSourceId || !swapTargetId || swapSourceId === swapTargetId) return;
    setSwapping(true);
    try {
      const r = await fetch("/api/users/swap-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ source_user_id: Number(swapSourceId), target_user_id: Number(swapTargetId) }),
      });
      const data = await r.json() as { error?: string; message?: string };
      if (!r.ok) throw new Error(data.error || "تعذر تبديل بيانات الدخول");
      setShowSwap(false);
      setSwapSourceId("");
      setSwapTargetId("");
      setMsg({ type: "ok", text: data.message || "تم تبديل بيانات الدخول" });
      load();
    } catch (err) {
      setMsg({ type: "err", text: (err as Error).message });
    } finally {
      setSwapping(false);
    }
  };

  // ── EXPORT ────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const rows = filtered.map(u => ({
      "الاسم":            u.name,
      "رقم الجوال":       u.phone,
      "الدور":            ROLE_MAP[u.role]?.label ?? u.role,
      "role_key":         u.role,
      "البريد الإلكتروني": u.email ?? "",
      "اسم الشركة":       u.company_name ?? "",
      "الرقم الضريبي":    u.vat_number ?? "",
      "الحالة":           u.active ? "نشط" : "موقوف",
      "حالة الموافقة":    u.approval_status ?? "approved",
      "تاريخ الإنشاء":    u.created_at ? new Date(u.created_at).toLocaleDateString("ar-SA") : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    // Column widths
    ws["!cols"] = [
      { wch: 22 }, { wch: 15 }, { wch: 18 }, { wch: 14 },
      { wch: 25 }, { wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المستخدمون");

    // Header row for import template on second sheet
    const tplData = [
      ["الاسم", "رقم الجوال", "role_key", "كلمة المرور", "البريد الإلكتروني", "اسم الشركة", "الرقم الضريبي"],
      ["مثال: محمد علي", "0555000001", "employee", "0555000001", "", "", ""],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(tplData);
    ws2["!cols"] = [{ wch: 22 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, "قالب الاستيراد");

    const label = roleFilter === "all" ? "المستخدمين" : (ROLE_MAP[roleFilter]?.label ?? roleFilter);
    XLSX.writeFile(wb, `MKGH_${label}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── IMPORT ────────────────────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportResult(null);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      // Use first sheet
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      let added = 0, skipped = 0;
      for (const row of rows) {
        const name  = String(row["الاسم"]  || row["name"] || "").trim();
        const phone = String(row["رقم الجوال"] || row["phone"] || "").trim();
        const role  = String(row["role_key"] || row["الدور"] || "employee").trim();
        const pass  = String(row["كلمة المرور"] || row["password"] || phone || "123456").trim();
        const email = String(row["البريد الإلكتروني"] || row["email"] || "").trim();
        const comp  = String(row["اسم الشركة"] || row["company_name"] || "").trim();
        const vat   = String(row["الرقم الضريبي"] || row["vat_number"] || "").trim();

        if (!name || !phone) { skipped++; continue; }

        const r = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
          body: JSON.stringify({ name, phone, password: pass || phone, role: role || "employee", email, company_name: comp, vat_number: vat }),
        });
        if (r.ok) added++; else skipped++;
      }
      setImportResult({ added, skipped });
      load();
    } catch (err) { alert("خطأ في قراءة الملف: " + (err as Error).message); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const RoleTag = ({ role }: { role: string }) => {
    const info = ROLE_MAP[role] ?? { label: role, color: "text-gray-600", bg: "bg-gray-100", icon: User };
    const Icon = info.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${info.bg} ${info.color}`}>
        <Icon size={11}/>{info.label}
      </span>
    );
  };

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2"><Users size={24} className="text-[#103c68]"/>إدارة المستخدمين</h1>
          <p className="text-gray-400 text-sm mt-0.5">{users.length} مستخدم مسجل في النظام</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <Download size={15}/>تصدير Excel
          </button>
          <label className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm cursor-pointer">
            {importing ? <RefreshCw size={15} className="animate-spin"/> : <Upload size={15}/>}
            استيراد Excel
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} disabled={importing}/>
          </label>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <Plus size={15}/>مستخدم جديد
          </button>
          <button onClick={() => { setSwapSourceId(""); setSwapTargetId(""); setShowSwap(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <ArrowLeftRight size={15}/>تبديل بيانات الدخول
          </button>
        </div>
      </div>

      {/* ── Import result ── */}
      {importResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-700 text-sm">
            <CheckCircle size={16}/>
            <span className="font-bold">اكتمل الاستيراد:</span>
            <span>أُضيف {importResult.added} مستخدم</span>
            {importResult.skipped > 0 && <span className="text-amber-600">· تُجاهل {importResult.skipped} (موجودون مسبقاً أو بيانات ناقصة)</span>}
          </div>
          <button onClick={() => setImportResult(null)} className="text-emerald-400 hover:text-emerald-700"><X size={15}/></button>
        </div>
      )}

      {/* ── Message ── */}
      {msg && (
        <div className={`rounded-xl px-4 py-3 flex items-center justify-between text-sm
          ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          <div className="flex items-center gap-2">{msg.type === "ok" ? <CheckCircle size={15}/> : <AlertCircle size={15}/>}{msg.text}</div>
          <button onClick={() => setMsg(null)}><X size={14}/></button>
        </div>
      )}

      {/* ── Role filter tabs ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map(({ key, label, color, bg, icon: Icon }) => {
            const count = counts[key] ?? 0;
            const active = roleFilter === key;
            return (
              <button key={key} onClick={() => setRoleFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all
                  ${active ? `${bg} ${color} ring-2 ring-offset-1 ring-current/30 shadow-sm` : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                <Icon size={13}/>
                <span>{label}</span>
                <span className={`font-black tabular-nums ${active ? "" : "text-gray-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search size={16} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الجوال أو الشركة..."
          className="w-full bg-white border border-gray-200 rounded-xl pe-10 ps-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 shadow-sm"/>
        {search && (
          <button onClick={() => setSearch("")} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14}/>
          </button>
        )}
      </div>

      {/* ── Results count ── */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span className="flex items-center gap-1.5">
          <Filter size={13}/>
          عرض <span className="font-bold text-gray-800">{filtered.length}</span> من {users.length} مستخدم
        </span>
        {(roleFilter !== "all" || search) && (
          <button onClick={() => { setRoleFilter("all"); setSearch(""); }} className="text-[#103c68] hover:underline font-semibold text-xs">إلغاء الفلتر</button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw size={20} className="animate-spin me-2"/>جاري التحميل...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-20"/>
            <p className="font-medium">لا توجد نتائج</p>
            <p className="text-xs mt-1">جرّب تغيير الفلتر أو البحث</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-start font-bold text-gray-600 text-xs">#</th>
                  <th className="px-4 py-3 text-start font-bold text-gray-600 text-xs">الاسم</th>
                  <th className="px-4 py-3 text-start font-bold text-gray-600 text-xs">رقم الجوال</th>
                  <th className="px-4 py-3 text-start font-bold text-gray-600 text-xs">الدور</th>
                  <th className="px-4 py-3 text-start font-bold text-gray-600 text-xs">الشركة / الرقم الضريبي</th>
                  <th className="px-4 py-3 text-start font-bold text-gray-600 text-xs">الحالة</th>
                  <th className="px-4 py-3 text-start font-bold text-gray-600 text-xs">تاريخ الإنشاء</th>
                  <th className="px-4 py-3 text-start font-bold text-gray-600 text-xs">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u, idx) => (
                  <tr key={u.id} className="hover:bg-gray-50/60 transition-colors group">
                    <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{u.name}</span>
                        {!u.active && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-600 border border-red-200">
                            <Ban size={9}/> موقوف
                          </span>
                        )}
                      </div>
                      {u.email && <div className="text-xs text-gray-400">{u.email}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600 text-sm">{u.phone}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <RoleTag role={u.role}/>
                        {u.permissions && u.permissions !== "[]" && u.permissions !== "null" && (() => {
                          const perms = parsePerms(u.permissions);
                          return perms.length > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
                              <Shield size={9}/>{perms.length} صلاحية مخصصة
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.company_name ? (
                        <div>
                          <div className="text-sm text-gray-700">{u.company_name}</div>
                          {u.vat_number && <div className="text-xs text-gray-400 font-mono">{u.vat_number}</div>}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold
                        ${u.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {u.active ? <><CheckCircle size={11}/>نشط</> : <><XCircle size={11}/>موقوف</>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("ar-SA") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(u)} title="تعديل"
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors border border-blue-100">
                          <Pencil size={12}/>تعديل
                        </button>
                        {u.role !== "customer" && u.role !== "rental_trip_customer" && (
                          <button onClick={() => setChatPolicyTarget(u)} title="سياسات محادثات المستخدم"
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors border border-teal-100">
                            <MessageCircle size={12}/>المحادثات
                          </button>
                        )}
                        <button onClick={() => viewPassword(u)} title="عرض كلمة المرور للمدير"
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors border border-violet-100">
                          <Eye size={12}/>كلمة المرور
                        </button>
                        <button onClick={() => toggleActive(u)} title={u.active ? "إيقاف الحساب" : "تنشيط الحساب"}
                          className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors border
                            ${u.active
                              ? "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-100"
                              : "bg-green-50 text-green-600 hover:bg-green-100 border-green-100"}`}>
                          {u.active ? <><ToggleLeft size={12}/>إيقاف</> : <><ToggleRight size={12}/>تنشيط</>}
                        </button>
                        <button onClick={() => setDeleteTarget(u)} title="حذف نهائي"
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-500 hover:bg-red-100 transition-colors border border-red-100">
                          <Trash2 size={12}/>حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {passwordTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="عرض كلمة مرور المستخدم">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">كلمة مرور {passwordTarget.name}</h2>
              <button type="button" onClick={() => { setPasswordTarget(null); setPasswordInfo(null); }}
                aria-label="إغلاق" className="text-gray-500 hover:text-gray-800"><X size={18}/></button>
            </div>
            {passwordLoading && <p className="text-sm text-gray-500">جاري التحميل...</p>}
            {passwordError && <p className="text-sm text-red-700">{passwordError}</p>}
            {passwordInfo?.id === passwordTarget.id && (
              passwordInfo.recoverable
                ? <div>
                    <p className="text-sm text-gray-600 mb-2">كلمة المرور الحالية المحفوظة لهذا الحساب:</p>
                    <code dir="ltr" className="block break-all rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-900 select-all">{passwordInfo.password || "فارغة"}</code>
                  </div>
                : <p className="text-sm text-amber-800 bg-amber-50 rounded-xl p-3">كلمة المرور مشفّرة ولا يمكن عرضها. يمكنك تعيين كلمة جديدة من تعديل المستخدم.</p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setPasswordTarget(null); setPasswordInfo(null); }}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm">إغلاق</button>
              {passwordInfo?.id === passwordTarget.id && !passwordInfo.recoverable && (
                <button type="button" onClick={() => { openEdit(passwordTarget); setPasswordTarget(null); setPasswordInfo(null); }}
                  className="flex-1 rounded-xl bg-[#103c68] px-3 py-2 text-sm text-white">تعيين كلمة جديدة</button>
              )}
            </div>
          </div>
        </div>
      )}
      {chatPolicyTarget && <ChatRetentionControls target={chatPolicyTarget} token={token} onClose={() => setChatPolicyTarget(null)}/>}

      {/* ── Login credential swap modal ── */}
      {showSwap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-black text-gray-900 text-lg flex items-center gap-2"><ArrowLeftRight size={18} className="text-violet-600"/>تبديل بيانات الدخول</h2>
                <p className="text-xs text-gray-500 mt-1">يتبادل الحسابان رقم الجوال وكلمة المرور فقط.</p>
              </div>
              <button onClick={() => setShowSwap(false)} disabled={swapping} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">المستخدم التجريبي</label>
                <select value={swapSourceId} onChange={e => setSwapSourceId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white">
                  <option value="">اختر المستخدم التجريبي...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.phone}</option>)}
                </select>
              </div>
              <div className="flex justify-center text-violet-500"><ArrowLeftRight size={22}/></div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">المستخدم الفعلي</label>
                <select value={swapTargetId} onChange={e => setSwapTargetId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white">
                  <option value="">اختر المستخدم الفعلي...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.phone}</option>)}
                </select>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
                سيتم تسجيل خروج الحسابين. الاسم والدور والصلاحيات والبيانات التشغيلية لن تتغير.
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowSwap(false)} disabled={swapping}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
                <button onClick={swapLoginCredentials} disabled={swapping || !swapSourceId || !swapTargetId || swapSourceId === swapTargetId}
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  {swapping ? <><RefreshCw size={14} className="animate-spin"/>جاري التبديل...</> : <><ArrowLeftRight size={14}/>تأكيد التبديل</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-50 px-6 pt-6 pb-4 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-3">
                <Trash2 size={26} className="text-red-500"/>
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-1">حذف المستخدم نهائياً</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Are you sure you want to delete this user?<br/>
                هل أنت متأكد من حذف المستخدم
              </p>
            </div>
            <div className="px-6 pb-4 pt-3 bg-red-50/40">
              <div className="flex items-center gap-3 bg-white rounded-2xl border border-red-100 px-4 py-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white font-black text-sm shrink-0">
                  {deleteTarget.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{deleteTarget.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{deleteTarget.phone}</p>
                </div>
              </div>
              <p className="text-xs text-red-500 text-center mb-4 font-medium">
                ⚠️ هذا الإجراء لا يمكن التراجع عنه — سيُحذف المستخدم وجميع جلساته نهائياً.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {deleting
                    ? <><RefreshCw size={14} className="animate-spin"/>جاري الحذف...</>
                    : <><Trash2 size={14}/>تأكيد الحذف</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900 text-lg flex items-center gap-2">
                {editUser ? <><Pencil size={18} className="text-[#103c68]"/>تعديل مستخدم</> : <><Plus size={18} className="text-[#103c68]"/>مستخدم جديد</>}
              </h2>
              <button onClick={() => { setShowForm(false); setMsg(null); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18}/>
              </button>
            </div>

            <form onSubmit={save} className="px-6 py-5 space-y-4">
              {msg && (
                <div className={`rounded-xl px-3 py-2.5 text-sm flex items-center gap-2
                  ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {msg.type === "ok" ? <CheckCircle size={14}/> : <AlertCircle size={14}/>}{msg.text}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">الاسم الكامل *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">رقم الجوال *</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} required dir="ltr"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    كلمة المرور {editUser && <span className="text-gray-400 font-normal">(اتركها فارغة للإبقاء)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      required={!editUser}
                      placeholder={editUser ? "••••" : "مطلوب"}
                      dir="ltr"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pe-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      title={showPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    >
                      {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    الدور * <span className="text-gray-400 font-normal">(اختر من القائمة أو اكتب دوراً مخصصاً)</span>
                  </label>
                  <input
                    list="role-suggestions"
                    value={form.role}
                    onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                    required
                    placeholder="اكتب الدور أو اختر من القائمة..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50"
                  />
                  <datalist id="role-suggestions">
                    {ROLES.filter(r => r.key !== "all").map(r => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">البريد الإلكتروني</label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} dir="ltr"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">اسم الشركة</label>
                  <input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50"/>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">الرقم الضريبي</label>
                  <input value={form.vat_number} onChange={e => setForm(p => ({ ...p, vat_number: e.target.value }))} dir="ltr"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50"/>
                </div>
              </div>

              {/* ── Permissions Section ── */}
              <div className="rounded-2xl border border-[#103c68]/20 overflow-hidden">

                {/* ── Role Template Picker (multi-select) ── */}
                <div className="px-4 py-3 bg-[#103c68]/5 border-b border-[#103c68]/10">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-black text-[#103c68] flex items-center gap-1.5">
                      <Shield size={13}/>قالب الدور — يمكنك اختيار أكثر من قالب
                    </label>
                    {selectedTemplates.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setSelectedTemplates([]); setForm(p => ({ ...p, permissions: [] })); }}
                        className="text-[11px] font-bold text-red-500 hover:underline"
                      >
                        مسح القوالب ({selectedTemplates.length})
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pb-1">
                    {ROLE_TEMPLATES.map(t => {
                      const sel = selectedTemplates.includes(t.key);
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => toggleTemplate(t.key)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                            sel
                              ? "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                              : "bg-white text-gray-600 border-gray-200 hover:border-[#103c68]/40 hover:bg-[#103c68]/5"
                          }`}
                        >
                          {sel && "✓ "}{t.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                    اختيار عدة قوالب يدمج صلاحياتها — يمكنك التعديل اليدوي بعد ذلك.
                  </p>
                </div>

                {/* Section sub-header with counters & bulk actions */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-100">
                  <span className="text-xs text-gray-500">
                    {form.permissions.length === 0
                      ? "لا توجد صلاحيات مخصصة (وصول كامل حسب الدور)"
                      : `${form.permissions.length} / ${ALL_PERM_KEYS.length} صلاحية مفعّلة`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button type="button"
                      onClick={() => setForm(p => ({ ...p, permissions: ALL_PERM_KEYS }))}
                      className="text-[11px] font-bold text-[#103c68] hover:underline">كل الصلاحيات</button>
                    <span className="text-gray-300">|</span>
                    <button type="button"
                      onClick={() => setForm(p => ({ ...p, permissions: [] }))}
                      className="text-[11px] font-bold text-red-500 hover:underline">مسح الكل</button>
                  </div>
                </div>

                {/* Accordion groups */}
                <div className="divide-y divide-gray-100">
                  {PERMISSION_GROUPS.map(group => {
                    const groupKeys = group.perms.map(p => p.key);
                    const selectedCount = form.permissions.filter(k => groupKeys.includes(k)).length;
                    const allSel = selectedCount === groupKeys.length;
                    const isOpen = openGroups[group.key] ?? false;
                    return (
                      <div key={group.key}>
                        {/* Group header row — uses div to avoid button-in-button */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenGroups(prev => ({ ...prev, [group.key]: !isOpen }))}
                          onKeyDown={e => e.key === "Enter" && setOpenGroups(prev => ({ ...prev, [group.key]: !isOpen }))}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer gap-2 select-none"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base leading-none">{group.emoji}</span>
                            <span className="text-xs font-bold text-gray-700 truncate">{group.label}</span>
                            {selectedCount > 0 && (
                              <span className="shrink-0 text-[10px] font-black text-white bg-[#103c68] px-1.5 py-0.5 rounded-full tabular-nums">
                                {selectedCount}/{groupKeys.length}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={e => {
                                e.stopPropagation();
                                setForm(p => ({
                                  ...p,
                                  permissions: allSel
                                    ? p.permissions.filter(k => !groupKeys.includes(k))
                                    : [...new Set([...p.permissions, ...groupKeys])],
                                }));
                              }}
                              onKeyDown={e => e.key === "Enter" && e.stopPropagation()}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors cursor-pointer
                                ${allSel
                                  ? "text-red-500 border-red-200 hover:bg-red-50"
                                  : "text-[#103c68] border-[#103c68]/20 hover:bg-[#103c68]/5"}`}
                            >
                              {allSel ? "إلغاء الكل" : "تحديد الكل"}
                            </span>
                            {isOpen
                              ? <ChevronUp size={13} className="text-gray-400"/>
                              : <ChevronDown size={13} className="text-gray-400"/>}
                          </div>
                        </div>

                        {/* Checkboxes — shown when group is open */}
                        {isOpen && (
                          <div className={`px-4 pb-3 pt-1 grid grid-cols-1 gap-1.5 ${group.bgClass} border-t border-gray-100`}>
                            {group.perms.map(({ key, label }) => {
                              const checked = form.permissions.includes(key);
                              return (
                                <label
                                  key={key}
                                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer select-none transition-all text-xs
                                    ${checked
                                      ? "bg-white border-[#103c68]/40 text-[#103c68] font-semibold shadow-sm"
                                      : "bg-white/60 border-gray-200 text-gray-600 hover:border-[#103c68]/30 hover:bg-white"}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => togglePerm(key)}
                                    className="w-3.5 h-3.5 accent-[#103c68] rounded shrink-0"
                                  />
                                  <span className="leading-snug">{label}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setMsg(null); }}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  <Save size={15}/>{submitting ? "جاري الحفظ..." : (editUser ? "حفظ التعديلات" : "إضافة المستخدم")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
