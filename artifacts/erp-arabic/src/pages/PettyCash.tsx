import { useEffect, useState } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import Table from "@/components/Table";
import { Plus, Trash2 } from "lucide-react";

interface Entry {
  id: number;
  date: string;
  custodian_name: string;
  transaction_type: string;
  description: string;
  amount_in: number;
  amount_out: number;
  receipt_number: string;
  balance: number;
}

export default function PettyCash() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [custodian, setCustodian] = useState("");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    custodian_name: "",
    transaction_type: "in",
    description: "",
    amount_in: "",
    amount_out: "",
    receipt_number: "",
  });

  const load = () => {
    setLoading(true);
    const q = custodian ? `?custodian=${encodeURIComponent(custodian)}` : "";
    apiFetch<Entry[]>(`/petty-cash${q}`).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, [custodian]);

  const totalIn = rows.reduce((a, r) => a + (r.amount_in || 0), 0);
  const totalOut = rows.reduce((a, r) => a + (r.amount_out || 0), 0);
  const balance = rows[rows.length - 1]?.balance ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/petty-cash", { method: "POST", body: JSON.stringify({
        ...form,
        amount_in: form.transaction_type === "in" ? form.amount_in : "0",
        amount_out: form.transaction_type === "out" ? form.amount_out : "0",
      })});
      setOpen(false);
      setForm({ date: new Date().toISOString().slice(0, 10), custodian_name: "", transaction_type: "in", description: "", amount_in: "", amount_out: "", receipt_number: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا القيد؟")) return;
    await apiFetch(`/petty-cash/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <PageHeader
        title="العهدة / الصندوق النثري"
        subtitle="سجل الإيرادات والمصروفات النثرية"
        action={
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 text-sm">
            <Plus size={16} />إضافة قيد
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-sm text-green-600 mb-1">إجمالي الوارد</div>
          <div className="text-xl font-bold text-green-700">{formatCurrency(totalIn)}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <div className="text-sm text-red-600 mb-1">إجمالي الصادر</div>
          <div className="text-xl font-bold text-red-700">{formatCurrency(totalOut)}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <div className="text-sm text-blue-600 mb-1">الرصيد الحالي</div>
          <div className={`text-xl font-bold ${balance >= 0 ? "text-blue-700" : "text-red-700"}`}>{formatCurrency(balance)}</div>
        </div>
      </div>

      <div className="mb-4">
        <input
          placeholder="فلترة باسم أمين الصندوق..."
          value={custodian}
          onChange={e => setCustodian(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 bg-background text-sm w-full max-w-xs"
        />
      </div>

      <Table
        data={rows}
        keyField="id"
        loading={loading}
        columns={[
          { key: "date", label: "التاريخ", render: r => new Date(r.date as string).toLocaleDateString("ar-SA") },
          { key: "custodian_name", label: "أمين الصندوق" },
          { key: "transaction_type", label: "النوع", render: r => r.transaction_type === "in" ? <span className="text-green-600 font-medium">وارد</span> : <span className="text-red-600 font-medium">صادر</span> },
          { key: "description", label: "البيان" },
          { key: "receipt_number", label: "رقم الإيصال", render: r => (r.receipt_number as string) || "—" },
          { key: "amount_in", label: "وارد", render: r => r.amount_in ? <span className="text-green-600">{formatCurrency(r.amount_in)}</span> : "—" },
          { key: "amount_out", label: "صادر", render: r => r.amount_out ? <span className="text-red-600">{formatCurrency(r.amount_out)}</span> : "—" },
          { key: "balance", label: "الرصيد", render: r => <span className={`font-bold ${(r.balance as number) >= 0 ? "text-primary" : "text-red-600"}`}>{formatCurrency(r.balance)}</span> },
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

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة قيد للعهدة">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">التاريخ *</label>
              <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">أمين الصندوق *</label>
              <input required value={form.custodian_name} onChange={e => setForm(f => ({ ...f, custodian_name: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">نوع العملية *</label>
              <select required value={form.transaction_type} onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
                <option value="in">وارد (دخول)</option>
                <option value="out">صادر (خروج)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">رقم الإيصال</label>
              <input value={form.receipt_number} onChange={e => setForm(f => ({ ...f, receipt_number: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">البيان *</label>
            <textarea required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">المبلغ (ر.س) *</label>
            <input type="number" required min="0" step="0.01"
              value={form.transaction_type === "in" ? form.amount_in : form.amount_out}
              onChange={e => setForm(f => form.transaction_type === "in" ? { ...f, amount_in: e.target.value } : { ...f, amount_out: e.target.value })}
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
