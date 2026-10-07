import { useEffect, useState } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import Table from "@/components/Table";
import Badge from "@/components/Badge";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Employee {
  id: number;
  name: string;
  job_title: string;
  department: string;
  nationality: string;
  phone: string;
  email: string;
  role: string;
  status: string;
  salary: number;
  hire_date: string;
  iqama_no: string;
  iqama_start: string;
  iqama_end: string;
  work_permit_start: string;
  work_permit_end: string;
  driver_license_no: string;
  driver_license_end: string;
}

const EMPTY_FORM = {
  name: "", job_title: "", department: "", nationality: "سعودي", phone: "", email: "", password: "",
  role: "worker", status: "active", salary: "", hire_date: "",
  iqama_no: "", iqama_start: "", iqama_end: "",
  work_permit_start: "", work_permit_end: "",
  driver_license_no: "", driver_license_end: "",
};

const DEPTS = ["الإدارة","المالية","المشتريات","الأسطول","الورشة","الموارد البشرية","المبيعات","أخرى"];

export default function Employees() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tab, setTab] = useState<"basic"|"documents">("basic");

  const load = () => {
    setLoading(true);
    apiFetch<Employee[]>("/employees").then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setTab("basic"); setOpen(true); };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({ name: e.name, job_title: e.job_title || "", department: e.department || "", nationality: e.nationality || "سعودي", phone: e.phone || "", email: e.email || "", password: "", role: e.role || "worker", status: e.status || "active", salary: String(e.salary || ""), hire_date: e.hire_date || "", iqama_no: e.iqama_no || "", iqama_start: e.iqama_start || "", iqama_end: e.iqama_end || "", work_permit_start: e.work_permit_start || "", work_permit_end: e.work_permit_end || "", driver_license_no: e.driver_license_no || "", driver_license_end: e.driver_license_end || "" });
    setTab("basic");
    setOpen(true);
  };

  const handleSubmit = async (e2: React.FormEvent) => {
    e2.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form, salary: parseFloat(form.salary) || 0 };
      if (editing) {
        await apiFetch(`/employees/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/employees", { method: "POST", body: JSON.stringify(payload) });
      }
      setOpen(false);
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا الموظف؟")) return;
    await apiFetch(`/employees/${id}`, { method: "DELETE" });
    load();
  };

  const f = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <div>
      <PageHeader
        title="الموظفون"
        subtitle={`${rows.length} موظف`}
        action={
          <button onClick={openAdd} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 text-sm">
            <Plus size={16} />إضافة موظف
          </button>
        }
      />

      <Table
        data={rows as unknown as Record<string, unknown>[]}
        keyField="id"
        loading={loading}
        columns={[
          { key: "name", label: "الاسم", render: r => <span className="font-medium">{r.name as string}</span> },
          { key: "job_title", label: "المسمى الوظيفي", render: r => (r.job_title as string) || "—" },
          { key: "department", label: "القسم", render: r => (r.department as string) || "—" },
          { key: "nationality", label: "الجنسية", render: r => (r.nationality as string) || "—" },
          { key: "phone", label: "الهاتف", render: r => (r.phone as string) || "—" },
          { key: "salary", label: "الراتب", render: r => formatCurrency(r.salary as number | null) },
          { key: "iqama_end", label: "انتهاء الإقامة", render: r => (r.iqama_end as string) || "—" },
          { key: "status", label: "الحالة", render: r => <Badge status={r.status as string} /> },
          {
            key: "actions", label: "",
            render: r => (
              <div className="flex gap-1">
                <button onClick={() => openEdit(r as unknown as Employee)} className="p-1.5 hover:bg-muted rounded text-primary"><Pencil size={14} /></button>
                <button onClick={() => del(r.id as number)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 size={14} /></button>
              </div>
            )
          }
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "تعديل بيانات موظف" : "إضافة موظف جديد"} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-1 border-b border-border mb-4">
            {[{id:"basic",label:"البيانات الأساسية"},{id:"documents",label:"الوثائق والرخص"}].map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id as "basic"|"documents")}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === t.id ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "basic" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">الاسم الكامل *</label>
                <input required value={form.name} onChange={f("name")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">المسمى الوظيفي</label>
                <input value={form.job_title} onChange={f("job_title")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">القسم</label>
                <select value={form.department} onChange={f("department")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
                  <option value="">— اختر —</option>
                  {DEPTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">الجنسية</label>
                <input value={form.nationality} onChange={f("nationality")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">الهاتف</label>
                <input value={form.phone} onChange={f("phone")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">البريد الإلكتروني</label>
                <input type="email" value={form.email} onChange={f("email")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">كلمة المرور</label>
                <input type="password" value={form.password} onChange={f("password")} placeholder={editing ? "اتركها فارغة لعدم التغيير" : ""}
                  className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">الدور الوظيفي</label>
                <select value={form.role} onChange={f("role")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
                  <option value="admin">مدير</option>
                  <option value="supervisor">مشرف</option>
                  <option value="worker">موظف</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">الراتب (ر.س)</label>
                <input type="number" min="0" step="0.01" value={form.salary} onChange={f("salary")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">تاريخ التعيين</label>
                <input type="date" value={form.hire_date} onChange={f("hire_date")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">الحالة</label>
                <select value={form.status} onChange={f("status")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
                  <option value="active">نشط</option>
                  <option value="suspended">موقوف</option>
                  <option value="terminated">منتهية الخدمة</option>
                </select>
              </div>
            </div>
          )}

          {tab === "documents" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 font-semibold text-sm text-muted-foreground border-b border-border pb-2">الإقامة</div>
              <div>
                <label className="block text-sm font-medium mb-1">رقم الإقامة</label>
                <input value={form.iqama_no} onChange={f("iqama_no")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1">تاريخ الإصدار</label>
                  <input type="date" value={form.iqama_start} onChange={f("iqama_start")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">تاريخ الانتهاء</label>
                  <input type="date" value={form.iqama_end} onChange={f("iqama_end")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
                </div>
              </div>
              <div className="col-span-2 font-semibold text-sm text-muted-foreground border-b border-border pb-2 pt-2">تصريح العمل</div>
              <div>
                <label className="block text-sm font-medium mb-1">تاريخ البدء</label>
                <input type="date" value={form.work_permit_start} onChange={f("work_permit_start")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">تاريخ الانتهاء</label>
                <input type="date" value={form.work_permit_end} onChange={f("work_permit_end")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div className="col-span-2 font-semibold text-sm text-muted-foreground border-b border-border pb-2 pt-2">رخصة القيادة</div>
              <div>
                <label className="block text-sm font-medium mb-1">رقم الرخصة</label>
                <input value={form.driver_license_no} onChange={f("driver_license_no")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">تاريخ الانتهاء</label>
                <input type="date" value={form.driver_license_end} onChange={f("driver_license_end")} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary/90 disabled:opacity-60 text-sm font-medium">
              {submitting ? "جاري الحفظ..." : "حفظ"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
