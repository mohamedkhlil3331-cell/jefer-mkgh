import { useEffect, useRef, useState } from "react";
import { apiFetch, apiUpload, formatCurrency } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import Table from "@/components/Table";
import { Plus, Image, Trash2 } from "lucide-react";

interface Invoice {
  id: number;
  department: string;
  details: string;
  amount: number;
  image_url: string | null;
  created_at: string;
}

export default function Invoices() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch<Invoice[]>("/invoices").then(setRows).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;
    setSubmitting(true);
    try {
      const fd = new FormData(formRef.current);
      await apiUpload("/invoices", fd);
      setOpen(false);
      setPreview(null);
      formRef.current.reset();
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذه الفاتورة؟")) return;
    await apiFetch(`/invoices/${id}`, { method: "DELETE" });
    load();
  };

  const totalAmount = rows.reduce((a, r) => a + (r.amount || 0), 0);

  return (
    <div>
      <PageHeader
        title="الفواتير"
        subtitle={`${rows.length} فاتورة — الإجمالي: ${formatCurrency(totalAmount)}`}
        action={
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm">
            <Plus size={16} />إضافة فاتورة
          </button>
        }
      />

      <Table
        data={rows}
        keyField="id"
        loading={loading}
        columns={[
          { key: "id", label: "#" },
          { key: "department", label: "القسم" },
          { key: "details", label: "التفاصيل" },
          {
            key: "amount", label: "المبلغ",
            render: r => <span className="font-medium text-green-700">{formatCurrency(r.amount)}</span>
          },
          {
            key: "image_url", label: "الصورة",
            render: r => r.image_url ? (
              <button onClick={() => setImgSrc(r.image_url as string)} className="text-primary hover:underline flex items-center gap-1">
                <Image size={14} />عرض
              </button>
            ) : "—"
          },
          {
            key: "created_at", label: "التاريخ",
            render: r => new Date(r.created_at as string).toLocaleDateString("ar-SA")
          },
          {
            key: "actions", label: "",
            render: r => (
              <button onClick={() => del(r.id as number)} className="p-1.5 hover:bg-red-50 rounded text-red-500 hover:text-red-700">
                <Trash2 size={15} />
              </button>
            )
          }
        ]}
      />

      <Modal open={open} onClose={() => { setOpen(false); setPreview(null); }} title="إضافة فاتورة">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">القسم *</label>
            <select name="department" required className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
              {["الإدارة","المشتريات","المبيعات","الصيانة","الأسطول","الموارد البشرية","المالية"].map(d => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">التفاصيل</label>
            <textarea name="details" rows={3} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">المبلغ (ر.س)</label>
            <input type="number" name="amount" step="0.01" min="0" className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">صورة الفاتورة</label>
            <input
              type="file" name="invoice_image" accept="image/*"
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) setPreview(URL.createObjectURL(f));
                else setPreview(null);
              }}
            />
            {preview && <img src={preview} alt="preview" className="mt-2 rounded-lg max-h-40 object-contain border border-border" />}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary/90 disabled:opacity-60 text-sm font-medium">
              {submitting ? "جاري الحفظ..." : "حفظ"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setPreview(null); }} className="flex-1 bg-muted text-foreground py-2 rounded-lg hover:bg-muted/80 text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {imgSrc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setImgSrc(null)}>
          <img src={imgSrc} alt="invoice" className="max-w-full max-h-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
