import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { FileText } from "lucide-react";

interface Order {
  id: number; order_number: string; customer_name: string; product_name: string;
  quantity: number; unit: string; unit_price: number; total_before_vat: number;
  vat_amount: number; total_with_vat: number; delivery_location: string;
  destination_type: string; stage: string; vehicle_plate: string; driver_name: string;
  created_at: string; invoice_number: string; invoice_image_url: string;
}

export default function WarehouseOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [invoiceNum, setInvoiceNum] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/workflow/orders?role=warehouse").then(r => r.json()).then(setOrders).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const issueInvoice = async () => {
    if (!selectedOrder || !user) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("warehouse_phone", user.phone);
      fd.append("invoice_number", invoiceNum || `INV-${selectedOrder.order_number}`);
      if (fileRef.current?.files?.[0]) fd.append("invoice_image", fileRef.current.files[0]);

      const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/invoice`, { method: "PUT", body: fd });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedOrder(null); setInvoiceNum("");
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const pendingOrders = orders.filter(o => o.stage === "vehicle_assigned");
  const invoicedOrders = orders.filter(o => o.stage === "invoiced");

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">المستودع والفواتير</h1>
        <p className="text-muted-foreground text-sm">{pendingOrders.length} طلب ينتظر إصدار فاتورة</p>
      </div>

      <h2 className="font-bold text-lg mb-4">طلبات تحتاج فاتورة ({pendingOrders.length})</h2>
      <div className="space-y-4 mb-8">
        {pendingOrders.length === 0 && <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-border">لا توجد طلبات</div>}
        {pendingOrders.map(order => (
          <div key={order.id} className="bg-card border border-blue-300 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-mono text-sm font-bold text-primary">{order.order_number}</div>
                <div className="font-bold">{order.customer_name}</div>
                <div className="text-sm text-muted-foreground">{order.product_name} × {order.quantity} {order.unit}</div>
              </div>
              <div className="text-left">
                <div className="font-bold text-lg">{order.total_with_vat?.toFixed(2)} ر.س</div>
                <div className="text-xs text-muted-foreground">{order.destination_type}</div>
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg p-3 text-sm mb-3 grid grid-cols-3 gap-2 text-center">
              <div><div className="text-muted-foreground text-xs">قبل الضريبة</div><div className="font-medium">{order.total_before_vat?.toFixed(2)}</div></div>
              <div><div className="text-muted-foreground text-xs">ضريبة 15%</div><div className="font-medium">{order.vat_amount?.toFixed(2)}</div></div>
              <div><div className="text-muted-foreground text-xs">الإجمالي</div><div className="font-bold text-primary">{order.total_with_vat?.toFixed(2)}</div></div>
            </div>

            {order.vehicle_plate && (
              <div className="text-sm text-muted-foreground mb-3">🚗 السيارة: {order.vehicle_plate} | السائق: {order.driver_name || "—"}</div>
            )}

            <button onClick={() => { setSelectedOrder(order); setInvoiceNum(`INV-${order.order_number}`); }}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90">
              <FileText size={15} /> إصدار الفاتورة
            </button>
          </div>
        ))}
      </div>

      {invoicedOrders.length > 0 && (
        <>
          <h2 className="font-bold text-lg mb-4">فواتير صادرة ({invoicedOrders.length})</h2>
          <div className="space-y-3">
            {invoicedOrders.map(order => (
              <div key={order.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs text-primary font-bold">{order.order_number}</div>
                  <div className="font-medium">{order.customer_name}</div>
                  <div className="text-xs text-muted-foreground">فاتورة: {order.invoice_number}</div>
                </div>
                <div className="text-left">
                  <div className="font-bold text-green-700">{order.total_with_vat?.toFixed(2)} ر.س</div>
                  {order.invoice_image_url && <a href={order.invoice_image_url} target="_blank" className="text-xs text-primary">عرض الفاتورة</a>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-xl mb-1">إصدار فاتورة</h2>
            <p className="text-sm text-muted-foreground mb-5">{selectedOrder.order_number}</p>

            <div className="space-y-4">
              <div className="bg-muted/30 rounded-xl p-4 text-sm space-y-1">
                <div className="flex justify-between"><span>العميل:</span><span className="font-medium">{selectedOrder.customer_name}</span></div>
                <div className="flex justify-between"><span>المنتج:</span><span className="font-medium">{selectedOrder.product_name} × {selectedOrder.quantity}</span></div>
                <div className="flex justify-between font-bold"><span>الإجمالي:</span><span className="text-primary">{selectedOrder.total_with_vat?.toFixed(2)} ر.س</span></div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">رقم الفاتورة</label>
                <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">صورة الفاتورة (اختياري)</label>
                <input ref={fileRef} type="file" accept="image/*"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={issueInvoice} disabled={submitting}
                className="flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 disabled:opacity-60">
                {submitting ? "جاري الإصدار..." : "إصدار الفاتورة"}
              </button>
              <button onClick={() => setSelectedOrder(null)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
