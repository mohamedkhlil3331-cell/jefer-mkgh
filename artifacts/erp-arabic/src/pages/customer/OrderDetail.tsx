import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronRight, Star, Truck, CheckCircle, Clock, FileText,
  Package, XCircle, MapPin, Phone, ExternalLink, Download,
  User, Hash, MessageSquare, Banknote,
} from "lucide-react";

interface Order {
  id: number; order_number: string; product_id: number; product_name: string;
  quantity: number; unit: string; unit_price: number;
  total_before_vat: number; vat_amount: number; total_with_vat: number;
  delivery_location: string; delivery_lat: number; delivery_lng: number;
  destination_type: string; stage: string;
  reviewer_name: string; review_date: string; payment_transfer_ref: string;
  vehicle_plate: string; driver_name: string; driver_phone: string;
  loading_photo_url: string; loading_date: string;
  delivery_date: string; invoice_number: string; invoice_image_url: string;
  cancel_reason: string; rep_id: number; created_at: string;
}

const STAGES = [
  { key: "pending",           label: "قيد مراجعة الدفع",  icon: Clock,        color: "text-amber-600",  bg: "bg-amber-100",  desc: "جاري مراجعة التحويل البنكي"           },
  { key: "payment_confirmed", label: "تم تأكيد الدفع",    icon: CheckCircle,  color: "text-blue-600",   bg: "bg-blue-100",   desc: "تم التحقق من الدفع ومراجعته"          },
  { key: "vehicle_assigned",  label: "جاري التجهيز",      icon: Truck,        color: "text-indigo-600", bg: "bg-indigo-100", desc: "تم تخصيص سيارة وسائق"                 },
  { key: "invoiced",          label: "صدرت الفاتورة",     icon: FileText,     color: "text-purple-600", bg: "bg-purple-100", desc: "تم إصدار فاتورة التوصيل"              },
  { key: "loaded",            label: "في الطريق إليك",    icon: Truck,        color: "text-cyan-600",   bg: "bg-cyan-100",   desc: "الشحنة محملة والسائق في الطريق"      },
  { key: "delivered",         label: "تم التسليم",        icon: Package,      color: "text-green-600",  bg: "bg-green-100",  desc: "تم استلام طلبك بنجاح"                 },
];

export default function OrderDetail() {
  const { id }             = useParams<{ id: string }>();
  const { user }           = useAuth();
  const [, navigate]       = useLocation();
  const [order,   setOrder]  = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating,  setRating]  = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [rated,   setRated]   = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);

  useEffect(() => {
    fetch(`/api/workflow/orders/${id}`)
      .then(r => r.json())
      .then(setOrder)
      .finally(() => setLoading(false));
  }, [id]);

  const submitRating = async () => {
    if (!rating || !order?.product_id || !user) return;
    setSubmittingRating(true);
    await fetch(`/api/products/${order.product_id}/rate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_phone: user.phone, customer_name: user.name, rating, comment }),
    });
    setSubmittingRating(false);
    setRated(true);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-3 border-[#103c68] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!order) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center text-gray-400">
        <Package size={48} className="mx-auto mb-3 opacity-30" />
        <p>الطلب غير موجود</p>
      </div>
    </div>
  );

  const currentIdx  = STAGES.findIndex(s => s.key === order.stage);
  const isCancelled = order.stage === "cancelled";
  const isDelivered = order.stage === "delivered";
  const currentStage= STAGES[currentIdx];
  const pct         = isCancelled ? 0 : Math.round(((currentIdx + 1) / STAGES.length) * 100);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* ── Sticky header ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate("/my-orders")}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronRight size={20} className="text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-xs font-bold text-[#103c68]">{order.order_number}</div>
            <div className="text-xs text-gray-400">
              {new Date(order.created_at).toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
          {!isCancelled && currentStage && (
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${currentStage.bg} ${currentStage.color}`}>
              <currentStage.icon size={12} />
              {currentStage.label}
            </div>
          )}
          {isCancelled && (
            <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-red-100 text-red-700">
              <XCircle size={12} />ملغي
            </div>
          )}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {/* ── Cancelled banner ── */}
        {isCancelled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <XCircle size={40} className="text-red-400 mx-auto mb-2" />
            <div className="font-bold text-red-700 text-lg">تم إلغاء الطلب</div>
            {order.cancel_reason && (
              <div className="text-sm text-red-600 mt-2 bg-red-100 rounded-xl px-4 py-2">{order.cancel_reason}</div>
            )}
          </div>
        )}

        {/* ── Progress tracker ── */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">تتبع الطلب</h2>
              <span className="text-xs text-gray-400">{pct}% مكتمل</span>
            </div>
            {/* Progress bar */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-5">
              <div
                className="h-2 bg-gradient-to-l from-[#0eb5cb] to-[#103c68] rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* Stage steps */}
            <div className="space-y-2.5">
              {STAGES.map((stage, idx) => {
                const done    = idx <= currentIdx;
                const current = idx === currentIdx;
                const Icon    = stage.icon;
                return (
                  <div key={stage.key} className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${current ? `${stage.bg} ring-1 ring-${stage.color}/30` : ""}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      done ? `${stage.bg} ${stage.color}` : "bg-gray-100 text-gray-300"
                    } ${current ? "shadow-sm" : ""}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${done ? "text-gray-900" : "text-gray-400"}`}>
                        {stage.label}
                      </div>
                      {current && (
                        <div className={`text-xs mt-0.5 ${stage.color}`}>{stage.desc}</div>
                      )}
                    </div>
                    {done && !current && (
                      <CheckCircle size={16} className="text-gray-300 flex-shrink-0" />
                    )}
                    {current && (
                      <div className={`w-2 h-2 rounded-full ${stage.bg.replace("bg-","bg-")} border-2 border-current ${stage.color} flex-shrink-0 animate-pulse`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Driver in transit card ── */}
        {order.stage === "loaded" && (
          <div className="bg-gradient-to-l from-[#103c68] to-[#0d2e50] rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <Truck size={18} className="text-[#0eb5cb]" />
              <h3 className="font-bold text-lg">السائق في الطريق إليك</h3>
            </div>
            <div className="space-y-2.5">
              {order.vehicle_plate && (
                <div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 text-white/70 text-sm"><Hash size={13} />رقم السيارة</div>
                  <span className="font-bold text-sm">{order.vehicle_plate}</span>
                </div>
              )}
              {order.driver_name && (
                <div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 text-white/70 text-sm"><User size={13} />السائق</div>
                  <span className="font-bold text-sm">{order.driver_name}</span>
                </div>
              )}
              {order.driver_phone && (
                <div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 text-white/70 text-sm"><Phone size={13} />الجوال</div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{order.driver_phone}</span>
                    <a
                      href={`https://wa.me/966${order.driver_phone.replace(/^0/, "")}`}
                      target="_blank" rel="noreferrer"
                      className="bg-green-500 hover:bg-green-600 text-white text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-colors"
                    >
                      واتساب
                    </a>
                  </div>
                </div>
              )}
            </div>
            {order.loading_photo_url && (
              <div className="mt-3">
                <a href={order.loading_photo_url} target="_blank" rel="noreferrer">
                  <img src={order.loading_photo_url} alt="صورة التحميل"
                    className="w-full rounded-xl object-cover max-h-52 hover:opacity-90 transition-opacity" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* ── Delivered success card ── */}
        {isDelivered && (
          <div className="bg-gradient-to-l from-green-600 to-emerald-700 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle size={24} className="text-white" />
              </div>
              <div>
                <div className="font-black text-lg">تم التسليم بنجاح!</div>
                {order.delivery_date && (
                  <div className="text-white/70 text-xs mt-0.5">
                    {new Date(order.delivery_date).toLocaleDateString("ar-SA", { dateStyle: "full" })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Order details card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
            <Package size={16} className="text-[#103c68]" />
            <h2 className="font-bold text-gray-900">تفاصيل الطلب</h2>
          </div>
          <div className="p-5 space-y-0">
            {[
              { label: "المنتج",           val: order.product_name,                  icon: Package   },
              { label: "الكمية",           val: `${order.quantity} ${order.unit}`,   icon: Hash      },
              { label: "سعر الوحدة",       val: `${order.unit_price?.toFixed(2)} ر.س`, icon: Banknote },
              { label: "موقع التسليم",     val: order.delivery_location,             icon: MapPin    },
              { label: "نوع التسليم",      val: order.destination_type,              icon: Truck     },
              order.payment_transfer_ref && { label: "مرجع التحويل", val: order.payment_transfer_ref, icon: FileText },
              order.invoice_number && { label: "رقم الفاتورة", val: order.invoice_number, icon: Hash },
              order.reviewer_name && { label: "راجعه", val: order.reviewer_name, icon: CheckCircle },
            ].filter(Boolean).map((row, i) => {
              if (!row) return null;
              const { label, val, icon: Icon } = row as { label: string; val: string; icon: React.ElementType };
              return (
                <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                  <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon size={13} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-400 mb-0.5">{label}</div>
                    <div className="text-sm font-semibold text-gray-800 break-words">{val}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Financial summary ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Banknote size={16} className="text-green-600" />
            <h2 className="font-bold text-gray-900">الملخص المالي</h2>
          </div>
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">المبلغ قبل الضريبة</span>
              <span className="font-semibold text-gray-800">{order.total_before_vat?.toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ضريبة القيمة المضافة (15%)</span>
              <span className="font-semibold text-yellow-600">{order.vat_amount?.toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between pt-2.5 border-t border-gray-100">
              <span className="font-black text-gray-900">الإجمالي شامل الضريبة</span>
              <span className="font-black text-[#103c68] text-lg">{order.total_with_vat?.toFixed(2)} ر.س</span>
            </div>
          </div>
        </div>

        {/* ── Map link ── */}
        {order.delivery_lat && order.delivery_lng && (
          <a
            href={`https://maps.google.com/?q=${order.delivery_lat},${order.delivery_lng}`}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-2xl py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <MapPin size={15} className="text-red-500" />عرض موقع التسليم على الخريطة
            <ExternalLink size={12} className="text-gray-400" />
          </a>
        )}

        {/* ── VAT Invoice download ── */}
        {isDelivered && (
          <a
            href={`/api/portal/customers/${user?.phone}/orders/${order.id}/vat-invoice`}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 bg-[#103c68] hover:bg-[#0d2e50] text-white rounded-2xl py-4 font-bold shadow-lg transition-colors"
          >
            <Download size={16} />تحميل الفاتورة الضريبية
            <FileText size={14} className="opacity-70" />
          </a>
        )}

        {/* ── Invoice image ── */}
        {order.invoice_image_url && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-purple-600" />
                <h3 className="font-bold text-gray-900">صورة الفاتورة</h3>
              </div>
              <a href={order.invoice_image_url} target="_blank" rel="noreferrer"
                className="text-xs text-[#103c68] font-semibold hover:underline flex items-center gap-1">
                فتح <ExternalLink size={11} />
              </a>
            </div>
            <img src={order.invoice_image_url} alt="الفاتورة"
              className="w-full object-contain max-h-72" />
          </div>
        )}

        {/* ── Rating (delivered) ── */}
        {isDelivered && !rated && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star size={16} className="text-yellow-500 fill-yellow-500" />
              <h2 className="font-bold text-gray-900">قيّم تجربتك</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">كيف تقيّم جودة المنتج والخدمة؟</p>
            <div className="flex gap-2 justify-center mb-4">
              {[1, 2, 3, 4, 5].map(i => (
                <button key={i}
                  onMouseEnter={() => setHoverRating(i)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(i)}>
                  <Star size={36}
                    className={`transition-all ${
                      i <= (hoverRating || rating)
                        ? "fill-yellow-400 text-yellow-400 scale-110"
                        : "text-gray-200 fill-gray-200"
                    }`} />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <div className="text-center text-sm font-semibold text-gray-600 mb-4">
                {["", "ضعيف جداً", "ضعيف", "مقبول", "جيد", "ممتاز"][rating]}
              </div>
            )}
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              placeholder="شاركنا رأيك بالمنتج والخدمة (اختياري)..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
            <button onClick={submitRating} disabled={!rating || submittingRating}
              className="w-full mt-3 bg-yellow-500 hover:bg-yellow-600 text-white py-3.5 rounded-xl font-bold disabled:opacity-50 transition-colors shadow-sm">
              {submittingRating ? "جاري الإرسال..." : "إرسال التقييم"}
            </button>
          </div>
        )}

        {rated && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
            <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
            <div className="font-bold text-green-700">شكراً على تقييمك!</div>
            <div className="text-sm text-green-600 mt-1">مساهمتك تساعدنا على التحسين المستمر</div>
          </div>
        )}

        {/* ── Contact support ── */}
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-gray-700 text-sm">تحتاج مساعدة؟</div>
            <div className="text-xs text-gray-400 mt-0.5">تواصل معنا عبر واتساب</div>
          </div>
          <a href="https://wa.me/966500000000" target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <MessageSquare size={14} />تواصل
          </a>
        </div>
      </div>
    </div>
  );
}
