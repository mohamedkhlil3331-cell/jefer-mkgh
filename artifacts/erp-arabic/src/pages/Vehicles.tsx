import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import Badge from "@/components/Badge";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Vehicle {
  id: number;
  plate_number: string;
  vehicle_type: string;
  status: string;
  driver_name: string;
  notes: string;
}

const STATUSES = ["available", "busy", "maintenance", "broken"];
const STATUS_AR: Record<string, string> = { available: "متاح", busy: "مشغول", maintenance: "صيانة", broken: "معطل" };

export default function Vehicles() {
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ plate_number: "", vehicle_type: "شاحنة نقل", status: "available", driver_name: "", notes: "" });

  const load = () => {
    setLoading(true);
    apiFetch<Vehicle[]>("/vehicles").then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openAdd = () => { setEditing(null); setForm({ plate_number: "", vehicle_type: "شاحنة نقل", status: "available", driver_name: "", notes: "" }); setOpen(true); };
  const openEdit = (v: Vehicle) => { setEditing(v); setForm({ plate_number: v.plate_number, vehicle_type: v.vehicle_type, status: v.status, driver_name: v.driver_name || "", notes: v.notes || "" }); setOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await apiFetch(`/vehicles/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await apiFetch("/vehicles", { method: "POST", body: JSON.stringify(form) });
      }
      setOpen(false);
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذه المركبة؟")) return;
    await apiFetch(`/vehicles/${id}`, { method: "DELETE" });
    load();
  };

  const statusGroups = STATUSES.map(s => ({ status: s, label: STATUS_AR[s], count: rows.filter(r => r.status === s).length }));

  return (
    <div>
      <PageHeader
        title="المركبات"
        subtitle={`${rows.length} مركبة`}
        action={
          <button onClick={openAdd} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 text-sm">
            <Plus size={16} />إضافة مركبة
          </button>
        }
      />

      <div className="grid grid-cols-4 gap-3 mb-6">
        {statusGroups.map(({ status, label, count }) => (
          <div key={status} className="bg-card border border-border rounded-xl p-4 text-center">
            <Badge status={status} />
            <div className="text-2xl font-bold mt-2">{count}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(v => (
            <div key={v.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-bold text-lg">{v.plate_number}</div>
                  <div className="text-sm text-muted-foreground">{v.vehicle_type}</div>
                </div>
                <Badge status={v.status} />
              </div>
              {v.driver_name && <div className="text-sm"><span className="text-muted-foreground">السائق: </span>{v.driver_name}</div>}
              {v.notes && <div className="text-sm text-muted-foreground mt-1 truncate">{v.notes}</div>}
              <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                <button onClick={() => openEdit(v)} className="flex items-center gap-1 text-sm text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg">
                  <Pencil size={13} />تعديل
                </button>
                <button onClick={() => del(v.id)} className="flex items-center gap-1 text-sm text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg mr-auto">
                  <Trash2 size={13} />حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "تعديل مركبة" : "إضافة مركبة"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">رقم اللوحة *</label>
            <input required value={form.plate_number} onChange={e => setForm(f => ({ ...f, plate_number: e.target.value }))}
              placeholder="ABC-1234"
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">نوع المركبة</label>
            <input value={form.vehicle_type} onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">الحالة</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">السائق المعين</label>
            <input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm resize-none" />
          </div>
          <div className="flex gap-3">
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
