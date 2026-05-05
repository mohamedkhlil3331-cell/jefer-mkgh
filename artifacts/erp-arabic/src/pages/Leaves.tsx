import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import Table from "@/components/Table";
import Badge from "@/components/Badge";
import { Plus, CheckCircle, XCircle } from "lucide-react";

interface Leave {
  id: number;
  employee_id: number;
  employee_name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  status: string;
  reviewed_by: string;
  created_at: string;
}

const LEAVE_TYPES: Record<string, string> = { annual: "سنوية", sick: "مرضية", emergency: "طارئة", unpaid: "بدون راتب" };

export default function Leaves() {
  const [rows, setRows] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ employee_name: "", leave_type: "annual", from_date: "", to_date: "", reason: "" });

  const load = () => {
    setLoading(true);
    apiFetch<Leave[]>("/leave-requests").then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/leave-requests", { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      setForm({ employee_name: "", leave_type: "annual", from_date: "", to_date: "", reason: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const updateStatus = async (id: number, status: "approved" | "rejected") => {
    await apiFetch(`/leave-requests/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, reviewed_by: "المدير" }),
    });
    load();
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا الطلب؟")) return;
    await apiFetch(`/leave-requests/${id}`, { method: "DELETE" });
    load();
  };

  const pending = rows.filter(r => r.status === "pending").length;
  const approved = rows.filter(r => r.status === "approved").length;

  return (
    <div>
      <PageHeader
        title="طلبات الإجازة"
        subtitle={`${rows.length} طلب — ${pending} قيد الانتظار — ${approved} مقبول`}
        action={
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 text-sm">
            <Plus size={16} />طلب إجازة جديد
          </button>
        }
      />

      <Table
        data={rows}
        keyField="id"
        loading={loading}
        columns={[
          { key: "employee_name", label: "اسم الموظف", render: r => <span className="font-medium">{r.employee_name as string}</span> },
          { key: "leave_type", label: "نوع الإجازة", render: r => LEAVE_TYPES[r.leave_type as string] || (r.leave_type as string) },
          { key: "from_date", label: "من تاريخ", render: r => new Date(r.from_date as string).toLocaleDateString("ar-SA") },
          { key: "to_date", label: "إلى تاريخ", render: r => new Date(r.to_date as string).toLocaleDateString("ar-SA") },
          { key: "days", label: "عدد الأيام", render: r => <span className="font-bold">{r.days as number}</span> },
          { key: "reason", label: "السبب", render: r => <span className="max-w-xs truncate block">{(r.reason as string) || "—"}</span> },
          { key: "reviewed_by", label: "المراجع", render: r => (r.reviewed_by as string) || "—" },
          { key: "status", label: "الحالة", render: r => <Badge status={r.status as string} /> },
          {
            key: "actions", label: "",
            render: r => r.status === "pending" ? (
              <div className="flex gap-1">
                <button onClick={() => updateStatus(r.id as number, "approved")} className="p-1.5 hover:bg-green-50 rounded text-green-600" title="قبول">
                  <CheckCircle size={16} />
                </button>
                <button onClick={() => updateStatus(r.id as number, "rejected")} className="p-1.5 hover:bg-red-50 rounded text-red-500" title="رفض">
                  <XCircle size={16} />
                </button>
              </div>
            ) : (
              <button onClick={() => del(r.id as number)} className="p-1.5 hover:bg-red-50 rounded text-red-400"><XCircle size={14} /></button>
            )
          }
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title="تقديم طلب إجازة">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">اسم الموظف *</label>
            <input required value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">نوع الإجازة *</label>
            <select required value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
              {Object.entries(LEAVE_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">من تاريخ *</label>
              <input type="date" required value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">إلى تاريخ *</label>
              <input type="date" required value={form.to_date} min={form.from_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
          </div>
          {form.from_date && form.to_date && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-center text-blue-700 font-medium">
              عدد الأيام: {Math.max(1, Math.round((new Date(form.to_date).getTime() - new Date(form.from_date).getTime()) / 86400000) + 1)} يوم
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">سبب الإجازة</label>
            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={3} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm resize-none" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary/90 disabled:opacity-60 text-sm font-medium">
              {submitting ? "جاري التقديم..." : "تقديم الطلب"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
