import { useEffect, useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Users, Search, Plus, Pencil, Trash2, Download, Upload,
  CheckCircle, XCircle, Shield, HardHat, Truck, Package,
  Warehouse, Car, User, LayoutDashboard, ChevronDown,
  X, Save, AlertCircle, RefreshCw, Filter,
} from "lucide-react";

interface UserRow {
  id: number; name: string; phone: string; role: string;
  active: number; company_name: string; vat_number: string;
  email: string; approval_status: string; created_at: string;
}

const ROLES: { key: string; label: string; color: string; bg: string; icon: React.ElementType }[] = [
  { key: "all",        label: "الكل",            color: "text-gray-700",    bg: "bg-gray-100",    icon: Users },
  { key: "admin",      label: "مدير النظام",     color: "text-purple-700",  bg: "bg-purple-100",  icon: LayoutDashboard },
  { key: "employee",   label: "موظف",            color: "text-teal-700",    bg: "bg-teal-100",    icon: HardHat },
  { key: "reviewer",   label: "مراجع",           color: "text-indigo-700",  bg: "bg-indigo-100",  icon: CheckCircle },
  { key: "supervisor", label: "مشرف نقليات",     color: "text-orange-700",  bg: "bg-orange-100",  icon: Truck },
  { key: "warehouse",  label: "مستودع",          color: "text-green-700",   bg: "bg-green-100",   icon: Warehouse },
  { key: "driver",     label: "سائق",            color: "text-yellow-700",  bg: "bg-yellow-100",  icon: Car },
  { key: "rep",        label: "مندوب",           color: "text-pink-700",    bg: "bg-pink-100",    icon: Users },
  { key: "customer",   label: "عميل",            color: "text-blue-700",    bg: "bg-blue-100",    icon: User },
];

const ROLE_MAP: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {};
ROLES.forEach(r => { ROLE_MAP[r.key] = { label: r.label, color: r.color, bg: r.bg, icon: r.icon }; });

const EMPTY_FORM = { name: "", phone: "", password: "", role: "customer", company_name: "", vat_number: "", email: "" };

export default function UsersPage() {
  const [users,      setUsers]      = useState<UserRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [search,     setSearch]     = useState("");
  const [showForm,   setShowForm]   = useState(false);
  const [editUser,   setEditUser]   = useState<UserRow | null>(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [importing,  setImporting]  = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/users").then(r => r.json())
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
  const openNew = () => { setEditUser(null); setForm({ ...EMPTY_FORM }); setShowForm(true); setMsg(null); };
  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setForm({ name: u.name, phone: u.phone, password: "", role: u.role, company_name: u.company_name ?? "", vat_number: u.vat_number ?? "", email: u.email ?? "" });
    setShowForm(true); setMsg(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setMsg(null);
    try {
      const url    = editUser ? `/api/users/${editUser.id}` : "/api/users";
      const method = editUser ? "PUT" : "POST";
      const body   = editUser
        ? { name: form.name, phone: form.phone, role: form.role, company_name: form.company_name, vat_number: form.vat_number, email: form.email, ...(form.password ? { password: form.password } : {}) }
        : { ...form };
      const r  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d  = await r.json();
      if (!r.ok) throw new Error(d.error ?? "فشل الحفظ");
      setMsg({ type: "ok", text: editUser ? "تم التحديث" : "تمت الإضافة" });
      setShowForm(false); setEditUser(null); load();
    } catch (err) { setMsg({ type: "err", text: (err as Error).message }); }
    finally { setSubmitting(false); }
  };

  const del = async (u: UserRow) => {
    if (!confirm(`حذف المستخدم "${u.name}"؟`)) return;
    await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    load();
  };

  const toggleActive = async (u: UserRow) => {
    await fetch(`/api/users/${u.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: u.active ? 0 : 1 }),
    });
    load();
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
          headers: { "Content-Type": "application/json" },
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
                      <div className="font-semibold text-gray-800">{u.name}</div>
                      {u.email && <div className="text-xs text-gray-400">{u.email}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600 text-sm">{u.phone}</td>
                    <td className="px-4 py-3"><RoleTag role={u.role}/></td>
                    <td className="px-4 py-3">
                      {u.company_name ? (
                        <div>
                          <div className="text-sm text-gray-700">{u.company_name}</div>
                          {u.vat_number && <div className="text-xs text-gray-400 font-mono">{u.vat_number}</div>}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(u)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all hover:opacity-80
                          ${u.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {u.active ? <><CheckCircle size={11}/>نشط</> : <><XCircle size={11}/>موقوف</>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("ar-SA") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(u)}
                          className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-lg transition-colors" title="تعديل">
                          <Pencil size={14}/>
                        </button>
                        <button onClick={() => del(u)}
                          className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition-colors" title="حذف">
                          <Trash2 size={14}/>
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

      {/* ── Add/Edit Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
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
                  <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    required={!editUser} placeholder={editUser ? "••••" : "مطلوب"}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50"/>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">الدور *</label>
                  <div className="relative">
                    <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50 appearance-none">
                      {ROLES.filter(r => r.key !== "all").map(r => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                  </div>
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
