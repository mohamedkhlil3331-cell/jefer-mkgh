import { useEffect, useState } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import Table from "@/components/Table";
import { Plus, Trash2 } from "lucide-react";

interface Trip {
  id: number;
  date: string;
  car_id: string;
  driver_name: string;
  client_name: string;
  material_type: string;
  destination: string;
  trips_count: number;
  unit_price: number;
  total_amount: number;
  vat: number;
  net_amount: number;
}

interface Summary { total_records: number; total_trips: number; total_gross: number; total_vat: number; total_net: number; }

export default function Trips() {
  const [rows, setRows] = useState<Trip[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), car_id: "", driver_name: "", client_name: "", material_type: "اسمنت", destination: "", trips_count: "1", unit_price: "" });
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const load = () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (filterFrom) q.set("from", filterFrom);
    if (filterTo) q.set("to", filterTo);
    Promise.all([
      apiFetch<Trip[]>(`/trips?${q}`),
      apiFetch<Summary>("/trips/summary"),
    ]).then(([t, s]) => { setRows(t); setSummary(s); }).finally(() => setLoading(false));
  };

  useEffect(load, [filterFrom, filterTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/trips", { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      setForm({ date: new Date().toISOString().slice(0, 10), car_id: "", driver_name: "", client_name: "", material_type: "اسمنت", destination: "", trips_count: "1", unit_price: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا القيد؟")) return;
    await apiFetch(`/trips/${id}`, { method: "DELETE" });
    load();
  };

  const unitPrice = parseFloat(form.unit_price) || 0;
  const tripsCount = parseInt(form.trips_count) || 1;
  const total = unitPrice * tripsCount;
  const vat = parseFloat((total * 0.15).toFixed(2));
  const net = parseFloat((total + vat).toFixed(2));

  return (
    <div>
      <PageHeader
        title="الردود / الرحلات"
        subtitle="سجل التوصيلات والرحلات اليومية"
        action={
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 text-sm">
            <Plus size={16} />إضافة رحلة
          </button>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: "عدد القيود", val: summary.total_records },
            { label: "إجمالي الردود", val: summary.total_trips },
            { label: "إجمالي المبلغ", val: formatCurrency(summary.total_gross) },
            { label: "ضريبة القيمة المضافة (15%)", val: formatCurrency(summary.total_vat) },
            { label: "الإجمالي شامل الضريبة", val: formatCurrency(summary.total_net) },
          ].map(({ label, val }) => (
            <div key={label} className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-primary">{val}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mb-4 flex-wrap">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">من تاريخ</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 bg-background text-sm" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">إلى تاريخ</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 bg-background text-sm" />
        </div>
        {(filterFrom || filterTo) && (
          <div className="flex items-end">
            <button onClick={() => { setFilterFrom(""); setFilterTo(""); }} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg">مسح</button>
          </div>
        )}
      </div>

      <Table
        data={rows}
        keyField="id"
        loading={loading}
        columns={[
          { key: "date", label: "التاريخ", render: r => new Date(r.date as string).toLocaleDateString("ar-SA") },
          { key: "car_id", label: "السيارة" },
          { key: "driver_name", label: "السائق" },
          { key: "client_name", label: "العميل" },
          { key: "material_type", label: "المادة" },
          { key: "destination", label: "الوجهة" },
          { key: "trips_count", label: "الردود" },
          { key: "unit_price", label: "سعر الرد", render: r => formatCurrency(r.unit_price) },
          { key: "total_amount", label: "الإجمالي", render: r => formatCurrency(r.total_amount) },
          { key: "vat", label: "ض.ق.م 15%", render: r => formatCurrency(r.vat) },
          { key: "net_amount", label: "الصافي شامل الضريبة", render: r => <span className="font-bold text-primary">{formatCurrency(r.net_amount)}</span> },
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

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة رحلة / رد" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">التاريخ *</label>
              <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">رقم السيارة *</label>
              <input required value={form.car_id} onChange={e => setForm(f => ({ ...f, car_id: e.target.value }))}
                placeholder="ABC-1234"
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">اسم السائق</label>
              <input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">العميل</label>
              <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">نوع المادة</label>
              <input value={form.material_type} onChange={e => setForm(f => ({ ...f, material_type: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">الوجهة</label>
              <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">عدد الردود *</label>
              <input type="number" required min="1" value={form.trips_count} onChange={e => setForm(f => ({ ...f, trips_count: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">سعر الرد (ر.س) *</label>
              <input type="number" required min="0" step="0.01" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-sm grid grid-cols-3 gap-2 text-center">
            <div><div className="text-muted-foreground">الإجمالي</div><div className="font-bold">{formatCurrency(total)}</div></div>
            <div><div className="text-muted-foreground">ض.ق.م 15%</div><div className="font-bold text-yellow-700">{formatCurrency(vat)}</div></div>
            <div><div className="text-muted-foreground">شامل الضريبة</div><div className="font-bold text-primary">{formatCurrency(net)}</div></div>
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
