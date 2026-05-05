import { useEffect, useState } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import Table from "@/components/Table";
import { Plus, Trash2 } from "lucide-react";

interface Expense {
  id: number;
  date: string;
  car_id: string;
  expense_category: string;
  description: string;
  amount: number;
  document_number: string;
}

const CATEGORIES = ["وقود","زيوت وفلاتر","إطارات","قطع غيار","رسوم تسجيل","غرامات","رواتب سائقين","ورشة خارجية","أخرى"];

export default function FleetExpenses() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), car_id: "", expense_category: "وقود", description: "", amount: "", document_number: "" });

  const load = () => {
    setLoading(true);
    apiFetch<Expense[]>("/fleet-expenses").then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const total = rows.reduce((a, r) => a + (r.amount || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/fleet-expenses", { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      setForm({ date: new Date().toISOString().slice(0, 10), car_id: "", expense_category: "وقود", description: "", amount: "", document_number: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا المصروف؟")) return;
    await apiFetch(`/fleet-expenses/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <PageHeader
        title="مصاريف الأسطول"
        subtitle={`${rows.length} قيد — الإجمالي: ${formatCurrency(total)}`}
        action={
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 text-sm">
            <Plus size={16} />إضافة مصروف
          </button>
        }
      />

      <Table
        data={rows}
        keyField="id"
        loading={loading}
        columns={[
          { key: "date", label: "التاريخ", render: r => new Date(r.date as string).toLocaleDateString("ar-SA") },
          { key: "car_id", label: "السيارة", render: r => (r.car_id as string) || "—" },
          { key: "expense_category", label: "الفئة" },
          { key: "description", label: "الوصف" },
          { key: "document_number", label: "رقم المستند", render: r => (r.document_number as string) || "—" },
          { key: "amount", label: "المبلغ", render: r => <span className="font-bold text-red-600">{formatCurrency(r.amount)}</span> },
          {
            key: "actions", label: "",
            render: r => (
              <button onClick={() => del(r.id as number)} className="p-1.5 hover:bg-red-50 rounded text-red-500">
                <Trash2 size={15} />
              </button>
            )
          }
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة مصروف أسطول">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">التاريخ *</label>
              <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">رقم السيارة</label>
              <input value={form.car_id} onChange={e => setForm(f => ({ ...f, car_id: e.target.value }))}
                placeholder="ABC-1234"
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">الفئة *</label>
              <select required value={form.expense_category} onChange={e => setForm(f => ({ ...f, expense_category: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">رقم المستند</label>
              <input value={form.document_number} onChange={e => setForm(f => ({ ...f, document_number: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">الوصف</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">المبلغ (ر.س) *</label>
            <input type="number" required min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
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
    </div>
  );
}
