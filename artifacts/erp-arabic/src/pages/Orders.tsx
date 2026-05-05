import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import Table from "@/components/Table";
import Badge from "@/components/Badge";
import { Plus, Truck } from "lucide-react";

interface Order {
  id: number;
  order_type: string;
  quantity: number;
  unit: string;
  client_name: string;
  client_phone: string;
  location: string;
  car_id: string;
  driver_name: string;
  status: string;
  notes: string;
  created_at: string;
}

const STATUSES = ["new", "in_progress", "delivered", "cancelled"];
const STATUS_AR: Record<string, string> = { new: "جديد", in_progress: "جاري", delivered: "تم التسليم", cancelled: "ملغي" };

export default function Orders() {
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [filter, setFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ order_type: "اسمنت", quantity: "", unit: "طن", client_name: "", client_phone: "", location: "", notes: "" });
  const [dispatch, setDispatch] = useState({ car_id: "", driver_name: "", status: "in_progress" });

  const load = () => {
    setLoading(true);
    const q = filter ? `?status=${encodeURIComponent(filter)}` : "";
    apiFetch<Order[]>(`/orders${q}`).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, [filter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/orders", { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      setForm({ order_type: "اسمنت", quantity: "", unit: "طن", client_name: "", client_phone: "", location: "", notes: "" });
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchOrder) return;
    setSubmitting(true);
    try {
      await apiFetch(`/orders/${dispatchOrder.id}/status`, { method: "PUT", body: JSON.stringify(dispatch) });
      setDispatchOrder(null);
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <div>
      <PageHeader
        title="الطلبات"
        subtitle={`${rows.length} طلب`}
        action={
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 text-sm">
            <Plus size={16} />إضافة طلب
          </button>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter("")} className={`px-3 py-1.5 rounded-lg text-sm ${!filter ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>الكل</button>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm ${filter === s ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {STATUS_AR[s]}
          </button>
        ))}
      </div>

      <Table
        data={rows}
        keyField="id"
        loading={loading}
        columns={[
          { key: "id", label: "#" },
          { key: "order_type", label: "نوع الطلب" },
          { key: "quantity", label: "الكمية", render: r => `${r.quantity} ${r.unit}` },
          { key: "client_name", label: "العميل" },
          { key: "client_phone", label: "الهاتف", render: r => (r.client_phone as string) || "—" },
          { key: "location", label: "الموقع" },
          { key: "car_id", label: "السيارة", render: r => (r.car_id as string) || "—" },
          { key: "driver_name", label: "السائق", render: r => (r.driver_name as string) || "—" },
          { key: "status", label: "الحالة", render: r => <Badge status={r.status as string} /> },
          {
            key: "actions", label: "",
            render: r => r.status !== "delivered" && r.status !== "cancelled" ? (
              <button onClick={() => { setDispatchOrder(r as unknown as Order); setDispatch({ car_id: (r.car_id as string) || "", driver_name: (r.driver_name as string) || "", status: "in_progress" }); }}
                className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded">
                <Truck size={13} />إرسال
              </button>
            ) : null
          }
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة طلب جديد" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">نوع الطلب *</label>
              <input required value={form.order_type} onChange={e => setForm(f => ({ ...f, order_type: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">الكمية *</label>
                <input type="number" required value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium mb-1">الوحدة</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
                  {["طن","كيس","م3","وحدة"].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">اسم العميل *</label>
              <input required value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">رقم الهاتف</label>
              <input value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">موقع التسليم</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
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

      <Modal open={!!dispatchOrder} onClose={() => setDispatchOrder(null)} title="إرسال / تحديث الطلب">
        <form onSubmit={handleDispatch} className="space-y-4">
          <p className="text-sm text-muted-foreground">طلب: <strong>{dispatchOrder?.order_type}</strong> — {dispatchOrder?.client_name}</p>
          <div>
            <label className="block text-sm font-medium mb-1">رقم السيارة</label>
            <input value={dispatch.car_id} onChange={e => setDispatch(d => ({ ...d, car_id: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">اسم السائق</label>
            <input value={dispatch.driver_name} onChange={e => setDispatch(d => ({ ...d, driver_name: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">الحالة</label>
            <select value={dispatch.status} onChange={e => setDispatch(d => ({ ...d, status: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
              {STATUSES.slice(1).map(s => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary/90 disabled:opacity-60 text-sm font-medium">
              {submitting ? "جاري التحديث..." : "تحديث"}
            </button>
            <button type="button" onClick={() => setDispatchOrder(null)} className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
