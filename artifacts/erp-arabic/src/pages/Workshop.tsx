import { useEffect, useState } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import Table from "@/components/Table";
import Badge from "@/components/Badge";
import { Plus, Wrench } from "lucide-react";

interface Job {
  id: number;
  vehicle_id: string;
  issue_desc: string;
  technician: string;
  status: string;
  cost: number;
  start_date: string;
  end_date: string;
  created_at: string;
}

export default function Workshop() {
  const [rows, setRows] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [updateJob, setUpdateJob] = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ vehicle_id: "", issue_desc: "", technician: "", start_date: new Date().toISOString().slice(0, 10), cost: "" });
  const [upd, setUpd] = useState({ status: "in_progress", end_date: "", cost: "" });

  const load = () => {
    setLoading(true);
    apiFetch<Job[]>("/workshop").then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/workshop", { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      setForm({ vehicle_id: "", issue_desc: "", technician: "", start_date: new Date().toISOString().slice(0, 10), cost: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateJob) return;
    setSubmitting(true);
    try {
      await apiFetch(`/workshop/${updateJob.id}/status`, { method: "PUT", body: JSON.stringify(upd) });
      setUpdateJob(null);
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const openCount = rows.filter(r => r.status === "open").length;
  const inProgressCount = rows.filter(r => r.status === "in_progress").length;
  const totalCost = rows.reduce((a, r) => a + (r.cost || 0), 0);

  return (
    <div>
      <PageHeader
        title="الورشة والصيانة"
        subtitle="إدارة أعمال الصيانة والإصلاح"
        action={
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 text-sm">
            <Plus size={16} />بلاغ جديد
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-700">{openCount}</div>
          <div className="text-sm text-red-600">مفتوح</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">{inProgressCount}</div>
          <div className="text-sm text-yellow-600">جاري الإصلاح</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{formatCurrency(totalCost)}</div>
          <div className="text-sm text-green-600">إجمالي التكاليف</div>
        </div>
      </div>

      <Table
        data={rows}
        keyField="id"
        loading={loading}
        columns={[
          { key: "vehicle_id", label: "السيارة" },
          { key: "issue_desc", label: "وصف العطل" },
          { key: "technician", label: "الفني", render: r => (r.technician as string) || "—" },
          { key: "start_date", label: "تاريخ البدء", render: r => (r.start_date as string) ? new Date(r.start_date as string).toLocaleDateString("ar-SA") : "—" },
          { key: "end_date", label: "تاريخ الانتهاء", render: r => (r.end_date as string) ? new Date(r.end_date as string).toLocaleDateString("ar-SA") : "—" },
          { key: "cost", label: "التكلفة", render: r => formatCurrency(r.cost) },
          { key: "status", label: "الحالة", render: r => <Badge status={r.status as string} /> },
          {
            key: "actions", label: "",
            render: r => r.status !== "done" ? (
              <button onClick={() => { setUpdateJob(r as unknown as Job); setUpd({ status: "in_progress", end_date: new Date().toISOString().slice(0, 10), cost: String(r.cost || "") }); }}
                className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded">
                <Wrench size={13} />تحديث
              </button>
            ) : null
          }
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title="بلاغ صيانة جديد">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">رقم السيارة *</label>
            <input required value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">وصف العطل *</label>
            <textarea required value={form.issue_desc} onChange={e => setForm(f => ({ ...f, issue_desc: e.target.value }))}
              rows={3} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">الفني المسؤول</label>
              <input value={form.technician} onChange={e => setForm(f => ({ ...f, technician: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">تاريخ البدء</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">التكلفة التقديرية (ر.س)</label>
            <input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary/90 disabled:opacity-60 text-sm font-medium">
              {submitting ? "جاري الحفظ..." : "حفظ"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!updateJob} onClose={() => setUpdateJob(null)} title="تحديث حالة الصيانة">
        <form onSubmit={handleUpdate} className="space-y-4">
          <p className="text-sm text-muted-foreground">السيارة: <strong>{updateJob?.vehicle_id}</strong></p>
          <div>
            <label className="block text-sm font-medium mb-1">الحالة</label>
            <select value={upd.status} onChange={e => setUpd(d => ({ ...d, status: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
              <option value="in_progress">جاري الإصلاح</option>
              <option value="done">منتهي</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">تاريخ الانتهاء</label>
            <input type="date" value={upd.end_date} onChange={e => setUpd(d => ({ ...d, end_date: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">التكلفة الفعلية (ر.س)</label>
            <input type="number" min="0" step="0.01" value={upd.cost} onChange={e => setUpd(d => ({ ...d, cost: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary/90 disabled:opacity-60 text-sm font-medium">
              {submitting ? "جاري التحديث..." : "تحديث"}
            </button>
            <button type="button" onClick={() => setUpdateJob(null)} className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
