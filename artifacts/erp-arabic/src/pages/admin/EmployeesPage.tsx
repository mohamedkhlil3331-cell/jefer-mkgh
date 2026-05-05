import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Users, Plus, Edit2, Trash2, Download, Upload, Search,
  AlertTriangle, CheckCircle, Clock, DollarSign, Car, X, Save, Sheet, RefreshCw,
} from "lucide-react";

interface Employee {
  id: number;
  name: string;
  job_title?: string;
  department?: string;
  entity?: string;
  nationality?: string;
  phone?: string;
  email?: string;
  status?: string;
  salary?: number;
  allowances?: number;
  bonus?: number;
  rewards?: number;
  penalties?: number;
  hire_date?: string;
  iqama_no?: string;
  iqama_amount?: number;
  iqama_start?: string;
  iqama_end?: string;
  driver_license_no?: string;
  driver_license_end?: string;
  passport_end?: string;
  vehicle_plate?: string;
  efficiency?: string;
}

const EMPTY: Partial<Employee> = {
  status: "يعمل", salary: 0, allowances: 0, bonus: 0, rewards: 0, penalties: 0,
  iqama_amount: 0, efficiency: "ممتاز",
};

const STATUS_OPTIONS = ["يعمل", "متوقف", "إجازة", "منتهي"];
const EFFICIENCY_OPTIONS = ["ممتاز", "جيد جداً", "جيد", "مقبول", "ضعيف"];

const STATUS_COLOR: Record<string, string> = {
  "يعمل": "bg-green-100 text-green-700",
  "متوقف": "bg-red-100 text-red-700",
  "إجازة": "bg-yellow-100 text-yellow-700",
  "منتهي": "bg-gray-100 text-gray-500",
};

const EFF_COLOR: Record<string, string> = {
  "ممتاز": "bg-blue-100 text-blue-700",
  "جيد جداً": "bg-teal-100 text-teal-700",
  "جيد": "bg-green-100 text-green-700",
  "مقبول": "bg-yellow-100 text-yellow-700",
  "ضعيف": "bg-red-100 text-red-700",
};

function dateStatus(dateStr?: string): "expired" | "warning" | "ok" | "none" {
  if (!dateStr) return "none";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / 864e5;
  if (diff < 0) return "expired";
  if (diff <= 90) return "warning";
  return "ok";
}

function DateCell({ label, value }: { label: string; value?: string }) {
  const st = dateStatus(value);
  if (st === "none") return <span className="text-gray-300 text-xs">—</span>;
  const colors = {
    expired: "text-red-600 font-semibold",
    warning: "text-orange-500 font-semibold",
    ok: "text-gray-500",
  };
  return (
    <div className={`text-xs ${colors[st]}`}>
      <div className="text-gray-400 text-[10px]">{label}</div>
      {value?.slice(0, 10)}
    </div>
  );
}

function num(v: unknown) { return Number(v) || 0; }
function fmt(v: number) { return v.toLocaleString("ar-SA"); }

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [modal, setModal] = useState<{ open: boolean; emp: Partial<Employee> }>({ open: false, emp: {} });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<number | null>(null);
  const [sheetModal, setSheetModal] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetRows, setSheetRows] = useState<Record<string, string>[] | null>(null);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetFetching, setSheetFetching] = useState(false);
  const [sheetImporting, setSheetImporting] = useState(false);
  const [sheetMsg, setSheetMsg] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/employees")
      .then(r => r.json())
      .then(data => { setEmployees(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = employees.filter(e => {
    const matchStatus = filterStatus === "الكل" || e.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q || e.name?.toLowerCase().includes(q) || e.job_title?.toLowerCase().includes(q) || e.entity?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const active = employees.filter(e => e.status === "يعمل");
  const monthlyBill = active.reduce((s, e) => s + num(e.salary) + num(e.allowances), 0);
  const expiring = employees.filter(e =>
    dateStatus(e.iqama_end) !== "ok" || dateStatus(e.driver_license_end) !== "ok" || dateStatus(e.passport_end) !== "ok"
  ).filter(e => dateStatus(e.iqama_end) !== "none" || dateStatus(e.driver_license_end) !== "none" || dateStatus(e.passport_end) !== "none");
  const expired = employees.filter(e =>
    dateStatus(e.iqama_end) === "expired" || dateStatus(e.driver_license_end) === "expired" || dateStatus(e.passport_end) === "expired"
  );

  const openAdd = () => setModal({ open: true, emp: { ...EMPTY } });
  const openEdit = (e: Employee) => setModal({ open: true, emp: { ...e } });
  const closeModal = () => setModal({ open: false, emp: {} });

  const setField = (k: keyof Employee, v: unknown) =>
    setModal(m => ({ ...m, emp: { ...m.emp, [k]: v } }));

  const save = async () => {
    setSaving(true);
    const { id, ...body } = modal.emp;
    const url = id ? `/api/employees/${id}` : "/api/employees";
    const method = id ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    closeModal();
    load();
  };

  const del = async (id: number) => {
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    setDelId(null);
    load();
  };

  // ── Google Sheet import helpers ──────────────────────────────────────────────
  const extractGid = (urlOrGid: string): string => {
    const m = urlOrGid.match(/[?&#]gid=(\d+)/);
    if (m) return m[1];
    if (/^\d+$/.test(urlOrGid.trim())) return urlOrGid.trim();
    return "0";
  };

  const fetchSheet = async () => {
    const gid = extractGid(sheetUrl);
    setSheetFetching(true); setSheetMsg(""); setSheetRows(null);
    try {
      const r = await fetch(`/api/sheets/${gid}`);
      const d = await r.json();
      if (d.error) { setSheetMsg(`خطأ: ${d.error}`); return; }
      setSheetRows(d.rows || []);
      setSheetHeaders(d.headers || []);
      setSheetMsg(`تم جلب ${d.count} سطر — اختر الأعمدة المناسبة ثم استورد`);
    } catch { setSheetMsg("فشل الاتصال"); }
    finally { setSheetFetching(false); }
  };

  const importFromSheet = async () => {
    if (!sheetRows || sheetRows.length === 0) return;
    setSheetImporting(true);
    let imported = 0;
    const FIELD_MAP: Record<string, keyof Employee> = {
      "الاسم": "name", "name": "name",
      "الوظيفة": "job_title", "job_title": "job_title",
      "الجهة": "entity", "entity": "entity",
      "الراتب": "salary", "salary": "salary",
      "العلاوات": "allowances", "allowances": "allowances",
      "البونص": "bonus", "bonus": "bonus",
      "المكافآت": "rewards", "rewards": "rewards",
      "الجزاءات": "penalties", "penalties": "penalties",
      "الحالة": "status", "status": "status",
      "الجنسية": "nationality", "nationality": "nationality",
      "الجوال": "phone", "phone": "phone",
      "تاريخ المباشرة": "hire_date", "hire_date": "hire_date",
      "مبلغ الإقامة": "iqama_amount", "iqama_amount": "iqama_amount",
      "انتهاء الإقامة": "iqama_end", "iqama_end": "iqama_end",
      "انتهاء الرخصة": "driver_license_end", "driver_license_end": "driver_license_end",
      "انتهاء الجواز": "passport_end", "passport_end": "passport_end",
      "السيارة": "vehicle_plate", "vehicle_plate": "vehicle_plate",
      "الكفاءة": "efficiency", "efficiency": "efficiency",
      "القسم": "department", "department": "department",
    };
    for (const row of sheetRows) {
      const emp: Partial<Employee> = { status: "يعمل" };
      for (const [col, val] of Object.entries(row)) {
        const field = FIELD_MAP[col.trim()];
        if (field) (emp as Record<string, unknown>)[field] = val;
      }
      if (!emp.name) continue;
      await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emp),
      });
      imported++;
    }
    setSheetMsg(`✅ تم استيراد ${imported} موظف`);
    setSheetImporting(false);
    setTimeout(() => { setSheetModal(false); setSheetRows(null); setSheetUrl(""); load(); }, 1500);
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const headers = ["ID","الاسم","الوظيفة","الجهة","الراتب","العلاوات","البونص","المكافآت","الجزاءات","الحالة","تاريخ المباشرة","مبلغ الإقامة","انتهاء الإقامة","انتهاء الرخصة","انتهاء الجواز","السيارة","الكفاءة"];
    const rows = employees.map(e => [
      e.id, e.name, e.job_title||"", e.entity||e.department||"", num(e.salary), num(e.allowances),
      num(e.bonus), num(e.rewards), num(e.penalties), e.status||"",
      e.hire_date||"", num(e.iqama_amount), e.iqama_end||"", e.driver_license_end||"", e.passport_end||"",
      e.vehicle_plate||"", e.efficiency||""
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `employees-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const F = ({ label, name, type = "text", options }: {
    label: string; name: keyof Employee; type?: string; options?: string[];
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {options ? (
        <select
          value={String(modal.emp[name] ?? "")}
          onChange={e => setField(name, e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={String(modal.emp[name] ?? "")}
          onChange={e => setField(name, type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة الموظفين</h1>
          <p className="text-sm text-gray-500 mt-0.5">{employees.length} موظف مسجّل</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => { setSheetModal(true); setSheetMsg(""); setSheetRows(null); setSheetUrl(""); }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 shadow-sm">
            <Sheet size={15} />استيراد من شيت
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 shadow-sm">
            <Download size={15} />تصدير CSV
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm">
            <Plus size={15} />إضافة موظف
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center">
            <Users size={20} className="text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{employees.length}</div>
            <div className="text-xs text-gray-500">إجمالي الموظفين</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-green-600 flex items-center justify-center">
            <CheckCircle size={20} className="text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{active.length}</div>
            <div className="text-xs text-gray-500">يعملون حالياً</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-purple-600 flex items-center justify-center">
            <DollarSign size={20} className="text-white" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">{fmt(monthlyBill)}</div>
            <div className="text-xs text-gray-500">الراتب الشهري الإجمالي</div>
          </div>
        </div>
        <div className={`bg-white rounded-2xl p-4 shadow-sm border flex items-center gap-4 ${expired.length > 0 ? "border-red-200 bg-red-50" : "border-gray-100"}`}>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${expired.length > 0 ? "bg-red-500" : "bg-yellow-500"}`}>
            <AlertTriangle size={20} className="text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{expired.length > 0 ? expired.length : expiring.length}</div>
            <div className="text-xs text-gray-500">{expired.length > 0 ? "مستندات منتهية" : "مستندات تنتهي قريباً"}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث باسم الموظف أو الوظيفة..."
            className="w-full border border-gray-200 rounded-xl pr-9 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1">
          {["الكل", "يعمل", "متوقف", "إجازة"].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                filterStatus === s ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 1100 }}>
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["#","الموظف","الجهة","الراتب الكلي","الحالة","انتهاء المستندات","السيارة","الكفاءة","المالية","إجراءات"].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400">لا يوجد موظفون</td></tr>
                ) : filtered.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{e.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 whitespace-nowrap">{e.name}</div>
                      <div className="text-xs text-gray-400">{e.job_title}</div>
                      {e.hire_date && <div className="text-xs text-gray-300">بدأ: {e.hire_date?.slice(0,10)}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.entity || e.department || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 whitespace-nowrap">{fmt(num(e.salary) + num(e.allowances))} ريال</div>
                      <div className="text-xs text-gray-400">راتب: {fmt(num(e.salary))} + علاوة: {fmt(num(e.allowances))}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLOR[e.status||""] || "bg-gray-100 text-gray-500"}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 space-y-0.5">
                      <DateCell label="إقامة" value={e.iqama_end} />
                      <DateCell label="رخصة" value={e.driver_license_end} />
                      <DateCell label="جواز" value={e.passport_end} />
                    </td>
                    <td className="px-4 py-3">
                      {e.vehicle_plate ? (
                        <div className="flex items-center gap-1 text-gray-600 text-xs">
                          <Car size={13} className="text-orange-500" />
                          {e.vehicle_plate}
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EFF_COLOR[e.efficiency||""] || "bg-gray-100 text-gray-500"}`}>
                        {e.efficiency || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs space-y-0.5 text-gray-500">
                        {num(e.bonus) > 0 && <div>بونص: <span className="font-semibold text-green-600">{fmt(num(e.bonus))}</span></div>}
                        {num(e.rewards) > 0 && <div>مكافأة: <span className="font-semibold text-blue-600">{fmt(num(e.rewards))}</span></div>}
                        {num(e.penalties) > 0 && <div>جزاء: <span className="font-semibold text-red-500">{fmt(num(e.penalties))}</span></div>}
                        {num(e.bonus) === 0 && num(e.rewards) === 0 && num(e.penalties) === 0 && <span className="text-gray-300">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(e)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setDelId(e.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4 bg-black/40 backdrop-blur-sm overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mb-6" dir="rtl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg">{modal.emp.id ? "تعديل بيانات الموظف" : "إضافة موظف جديد"}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="col-span-2 md:col-span-3">
                <div className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3 border-b border-blue-50 pb-1">البيانات الأساسية</div>
              </div>
              <F label="اسم الموظف *" name="name" />
              <F label="الوظيفة / العمل" name="job_title" />
              <F label="الجهة" name="entity" />
              <F label="القسم / الإدارة" name="department" />
              <F label="الجنسية" name="nationality" />
              <F label="رقم الجوال" name="phone" />
              <F label="الحالة الوظيفية" name="status" options={STATUS_OPTIONS} />
              <F label="تاريخ مباشرة العمل" name="hire_date" type="date" />
              <F label="السيارة / رقم اللوحة" name="vehicle_plate" />

              <div className="col-span-2 md:col-span-3 mt-2">
                <div className="text-xs font-bold text-green-600 uppercase tracking-widest mb-3 border-b border-green-50 pb-1">الراتب والمالية</div>
              </div>
              <F label="الراتب الأساسي" name="salary" type="number" />
              <F label="العلاوات" name="allowances" type="number" />
              <F label="البونص" name="bonus" type="number" />
              <F label="المكافآت" name="rewards" type="number" />
              <F label="الجزاءات" name="penalties" type="number" />
              <F label="كفاءة الموظف" name="efficiency" options={EFFICIENCY_OPTIONS} />

              <div className="col-span-2 md:col-span-3 mt-2">
                <div className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-3 border-b border-orange-50 pb-1">الإقامة والمستندات</div>
              </div>
              <F label="رقم الإقامة" name="iqama_no" />
              <F label="مبلغ الإقامة" name="iqama_amount" type="number" />
              <F label="تاريخ انتهاء الإقامة" name="iqama_end" type="date" />
              <F label="رقم الرخصة" name="driver_license_no" />
              <F label="تاريخ انتهاء الرخصة" name="driver_license_end" type="date" />
              <F label="تاريخ انتهاء الجواز" name="passport_end" type="date" />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeModal} className="px-5 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button
                onClick={save}
                disabled={saving || !modal.emp.name}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={15} />{saving ? "جاري الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDelId(null)}>
          <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-gray-500 mb-5">هل أنت متأكد من حذف هذا الموظف؟ لا يمكن التراجع.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDelId(null)} className="px-4 py-2 border rounded-xl text-sm">إلغاء</button>
              <button onClick={() => del(delId)} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">حذف</button>
            </div>
          </div>
        </div>
      )}

      {/* Google Sheet import modal */}
      {sheetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSheetModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Sheet size={20} className="text-green-600" />
                <h2 className="font-bold text-gray-900 text-lg">استيراد الموظفين من جوجل شيت</h2>
              </div>
              <button onClick={() => setSheetModal(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                <p className="font-semibold mb-1">كيفية الاستخدام:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-xs">
                  <li>الصق رابط جوجل شيت أو رقم الـ GID فقط</li>
                  <li>اضغط "جلب الشيت" لمعاينة البيانات</li>
                  <li>تأكد من وجود عمود "الاسم" أو "name"</li>
                  <li>اضغط "استيراد" — النظام يربط الأعمدة تلقائياً</li>
                </ol>
              </div>

              {/* URL input */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">رابط الشيت أو رقم GID</label>
                <div className="flex gap-2">
                  <input
                    value={sheetUrl}
                    onChange={e => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/... أو رقم GID مثل 1234567890"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={fetchSheet}
                    disabled={sheetFetching || !sheetUrl.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw size={14} className={sheetFetching ? "animate-spin" : ""} />
                    {sheetFetching ? "جاري الجلب..." : "جلب الشيت"}
                  </button>
                </div>
              </div>

              {/* Status message */}
              {sheetMsg && (
                <div className={`text-sm px-4 py-2.5 rounded-xl border ${sheetMsg.startsWith("✅") ? "bg-green-50 text-green-700 border-green-200" : sheetMsg.startsWith("خطأ") ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                  {sheetMsg}
                </div>
              )}

              {/* Preview */}
              {sheetRows && sheetRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-700">معاينة ({sheetRows.length} سطر)</div>
                    <div className="text-xs text-gray-400">{sheetHeaders.length} عمود</div>
                  </div>
                  <div className="overflow-x-auto border border-gray-200 rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {sheetHeaders.slice(0, 8).map(h => (
                            <th key={h} className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200">{h}</th>
                          ))}
                          {sheetHeaders.length > 8 && <th className="px-3 py-2 text-gray-400 border-b border-gray-200">+{sheetHeaders.length - 8}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {sheetRows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            {sheetHeaders.slice(0, 8).map(h => (
                              <td key={h} className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-32 truncate">{row[h] || "—"}</td>
                            ))}
                            {sheetHeaders.length > 8 && <td className="px-3 py-1.5 text-gray-400">...</td>}
                          </tr>
                        ))}
                        {sheetRows.length > 5 && (
                          <tr><td colSpan={9} className="px-3 py-1.5 text-center text-gray-400 text-xs">... و {sheetRows.length - 5} سطر آخر</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    الأعمدة المعروفة تلقائياً: الاسم، الوظيفة، الجهة، الراتب، العلاوات، الحالة، انتهاء الإقامة، انتهاء الرخصة، انتهاء الجواز، السيارة...
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setSheetModal(false)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button
                onClick={importFromSheet}
                disabled={sheetImporting || !sheetRows || sheetRows.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                <Upload size={15} />{sheetImporting ? "جاري الاستيراد..." : `استيراد ${sheetRows?.length || 0} موظف`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
