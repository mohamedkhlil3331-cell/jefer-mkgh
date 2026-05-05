import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { ChevronRight, Star } from "lucide-react";

interface Order {
  id: number; order_number: string; product_id: number; product_name: string; quantity: number;
  unit: string; unit_price: number; total_before_vat: number; vat_amount: number; total_with_vat: number;
  delivery_location: string; delivery_lat: number; delivery_lng: number; destination_type: string;
  stage: string; reviewer_name: string; review_date: string; payment_transfer_ref: string;
  vehicle_plate: string; driver_name: string; driver_phone: string; loading_photo_url: string;
  loading_date: string; delivery_date: string; invoice_number: string; invoice_image_url: string;
  cancel_reason: string; rep_id: number; created_at: string;
}

const STAGES = [
  { key: "pending", label: "قيد مراجعة الدفع", icon: "⏳", desc: "جاري مراجعة التحويل البنكي" },
  { key: "payment_confirmed", label: "تم تأكيد الدفع", icon: "✅", desc: "تم التحقق من الدفع ومراجعته" },
  { key: "vehicle_assigned", label: "جاري التجهيز", icon: "🚗", desc: "تم تخصيص سيارة وسائق" },
  { key: "invoiced", label: "صدرت الفاتورة", icon: "🧾", desc: "تم إصدار فاتورة التوصيل" },
  { key: "loaded", label: "في الطريق إليك", icon: "🚛", desc: "الشحنة محملة والسائق في الطريق" },
  { key: "delivered", label: "تم التسليم", icon: "📦", desc: "تم استلام طلبك بنجاح" },
];

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [rated, setRated] = useState(false);

  useEffect(() => {
    fetch(`/api/workflow/orders/${id}`).then(r => r.json()).then(setOrder).finally(() => setLoading(false));
  }, [id]);

  const submitRating = async () => {
    if (!rating || !order?.product_id || !user) return;
    await fetch(`/api/products/${order.product_id}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_phone: user.phone, customer_name: user.name, rating, comment }),
    });
    setRated(true);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!order) return <div className="text-center py-20 text-muted-foreground">الطلب غير موجود</div>;

  const currentIdx = STAGES.findIndex(s => s.key === order.stage);
  const isCancelled = order.stage === "cancelled";

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate("/my-orders")} className="p-2 hover:bg-gray-100 rounded-xl">
          <ChevronRight size={20} />
        </button>
        <div>
          <h1 className="font-bold text-gray-900">{order.order_number}</h1>
          <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("ar-SA", { dateStyle: "full" })}</p>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-5">
        {/* Status tracker */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">حالة الطلب</h2>
          {isCancelled ? (
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <div className="text-3xl mb-2">❌</div>
              <div className="font-bold text-red-700">تم إلغاء الطلب</div>
              {order.cancel_reason && <div className="text-sm text-red-600 mt-1">{order.cancel_reason}</div>}
            </div>
          ) : (
            <div className="space-y-3">
              {STAGES.map((stage, idx) => {
                const done = idx <= currentIdx;
                const current = idx === currentIdx;
                return (
                  <div key={stage.key} className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm mt-0.5 ${done ? "bg-primary text-white" : "bg-gray-100 text-gray-400"} ${current ? "ring-4 ring-primary/20" : ""}`}>
                      {done ? stage.icon : idx + 1}
                    </div>
                    <div className={`flex-1 pb-3 ${idx < STAGES.length - 1 ? "border-r-2 pr-3 mr-1" : ""} ${done ? "border-primary" : "border-gray-200"}`}>
                      <div className={`font-medium text-sm ${done ? "text-gray-900" : "text-muted-foreground"}`}>{stage.label}</div>
                      {current && <div className="text-xs text-primary mt-0.5">{stage.desc}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Driver info when loaded */}
        {order.stage === "loaded" && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <h3 className="font-bold text-green-800 mb-3">🚛 السائق في الطريق إليك</h3>
            <div className="space-y-2 text-sm">
              {order.vehicle_plate && <div className="flex justify-between"><span className="text-gray-600">رقم السيارة:</span><span className="font-bold">{order.vehicle_plate}</span></div>}
              {order.driver_name && <div className="flex justify-between"><span className="text-gray-600">اسم السائق:</span><span className="font-bold">{order.driver_name}</span></div>}
              {order.driver_phone && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">جوال السائق:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{order.driver_phone}</span>
                    <a href={`https://wa.me/966${order.driver_phone.replace(/^0/,"")}`} target="_blank" rel="noreferrer"
                      className="bg-green-600 text-white text-xs px-2.5 py-1 rounded-lg">واتساب</a>
                  </div>
                </div>
              )}
            </div>
            {order.loading_photo_url && (
              <img src={order.loading_photo_url} alt="صورة التحميل" className="mt-3 rounded-xl w-full object-cover max-h-48" />
            )}
          </div>
        )}

        {/* Order details */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">تفاصيل الطلب</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">المنتج:</span><span className="font-medium">{order.product_name}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">الكمية:</span><span className="font-medium">{order.quantity} {order.unit}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">سعر الوحدة:</span><span className="font-medium">{order.unit_price?.toFixed(2)} ر.س</span></div>
            <div className="border-t pt-3">
              <div className="flex justify-between"><span className="text-gray-600">الإجمالي قبل الضريبة:</span><span>{order.total_before_vat?.toFixed(2)} ر.س</span></div>
              <div className="flex justify-between mt-1"><span className="text-gray-600">ضريبة 15%:</span><span>{order.vat_amount?.toFixed(2)} ر.س</span></div>
              <div className="flex justify-between mt-1 font-bold text-base"><span>الإجمالي:</span><span className="text-primary">{order.total_with_vat?.toFixed(2)} ر.س</span></div>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between"><span className="text-gray-600">موقع التسليم:</span><span className="font-medium text-left max-w-[60%] break-words">{order.delivery_location}</span></div>
              <div className="flex justify-between mt-1"><span className="text-gray-600">التسليم إلى:</span><span className="font-medium">{order.destination_type}</span></div>
            </div>
            {order.payment_transfer_ref && <div className="flex justify-between"><span className="text-gray-600">مرجع التحويل:</span><span className="font-medium">{order.payment_transfer_ref}</span></div>}
            {order.invoice_number && <div className="flex justify-between"><span className="text-gray-600">رقم الفاتورة:</span><span className="font-medium">{order.invoice_number}</span></div>}
          </div>
          {order.delivery_lat && order.delivery_lng && (
            <a
              href={`https://maps.google.com/?q=${order.delivery_lat},${order.delivery_lng}`}
              target="_blank" rel="noreferrer"
              className="mt-3 flex items-center gap-2 text-sm text-primary"
            >
              📍 عرض الموقع على الخريطة
            </a>
          )}
        </div>

        {/* VAT invoice link */}
        {order.stage === "delivered" && (
          <a
            href={`/api/portal/customers/${user?.phone}/orders/${order.id}/vat-invoice`}
            target="_blank"
            className="block bg-primary text-white rounded-2xl py-4 text-center font-bold hover:bg-primary/90 transition-colors"
          >
            🧾 تحميل الفاتورة الضريبية
          </a>
        )}

        {/* Rating */}
        {order.stage === "delivered" && !rated && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-900 mb-4">قيّم تجربتك</h2>
            <div className="flex gap-2 justify-center mb-4">
              {[1,2,3,4,5].map(i => (
                <button key={i} onClick={() => setRating(i)}>
                  <Star size={32} className={i <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"} />
                </button>
              ))}
            </div>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              placeholder="تعليقك على المنتج والخدمة..."
              rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <button onClick={submitRating} disabled={!rating}
              className="w-full mt-3 bg-yellow-500 text-white py-3 rounded-xl font-medium hover:bg-yellow-600 disabled:opacity-50">
              إرسال التقييم
            </button>
          </div>
        )}
        {rated && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center text-green-700 font-medium">
            ✅ شكراً على تقييمك!
          </div>
        )}
      </div>
    </div>
  );
}
