import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  MapPin, Locate, ChevronRight, Package, Star, CheckCircle,
  Hash, Truck, Users, Calculator,
} from "lucide-react";

interface Product {
  id: number; name: string; price_per_unit: number; unit: string;
  description: string; image_url: string; avg_rating: number; review_count: number;
}
interface Rep { id: number; name: string; phone: string; }

export default function PlaceOrder() {
  const { id: productId } = useParams<{ id: string }>();
  const { user }          = useAuth();
  const [, navigate]      = useLocation();
  const [product,    setProduct]    = useState<Product | null>(null);
  const [reps,       setReps]       = useState<Rep[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState<string | null>(null);
  const [locating,   setLocating]   = useState(false);

  const [form, setForm] = useState({
    quantity: "1",
    rep_id: "",
    delivery_location: "",
    delivery_lat: "",
    delivery_lng: "",
    destination_type: "مستودع",
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/products/${productId}`).then(r => r.json()),
      fetch("/api/users?role=rep").then(r => r.json()),
    ]).then(([p, r]) => { setProduct(p); setReps(r); }).finally(() => setLoading(false));
  }, [productId]);

  const getLocation = () => {
    if (!navigator.geolocation) return alert("المتصفح لا يدعم تحديد الموقع");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          delivery_lat: String(pos.coords.latitude),
          delivery_lng: String(pos.coords.longitude),
          delivery_location: f.delivery_location || `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`,
        }));
        setLocating(false);
      },
      () => { alert("تعذر تحديد الموقع"); setLocating(false); }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !product) return;
    setSubmitting(true);
    try {
      const qty = parseFloat(form.quantity) || 1;
      const res = await fetch("/api/workflow/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_phone:   user.phone,
          customer_name:    user.name,
          rep_id:           form.rep_id || null,
          product_id:       product.id,
          product_name:     product.name,
          quantity:         qty,
          unit:             product.unit,
          unit_price:       product.price_per_unit,
          delivery_location:form.delivery_location,
          delivery_lat:     form.delivery_lat || null,
          delivery_lng:     form.delivery_lng || null,
          destination_type: form.destination_type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(data.order_number);
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-9 h-9 border-2 border-[#103c68] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!product) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center text-gray-400">
        <Package size={40} className="mx-auto mb-2 opacity-30" />
        <p>المنتج غير موجود</p>
      </div>
    </div>
  );

  const qty   = parseFloat(form.quantity) || 1;
  const total = qty * product.price_per_unit;
  const vat   = total * 0.15;
  const net   = total + vat;

  /* ── Success screen ── */
  if (success) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-xl p-8 text-center max-w-md w-full">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={40} className="text-green-500" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">تم إرسال طلبك!</h2>
        <p className="text-gray-500 text-sm mb-5">سيتم مراجعة طلبك وتأكيد الدفع خلال أقل من 24 ساعة</p>
        <div className="bg-[#103c68]/5 border border-[#103c68]/15 rounded-2xl px-5 py-4 mb-2">
          <div className="text-xs text-gray-400 mb-1">رقم طلبك</div>
          <div className="font-mono text-xl font-black text-[#103c68]">{success}</div>
        </div>
        <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-sm text-gray-600 text-start space-y-1.5">
          <div className="flex gap-2"><Package size={13} className="text-gray-400 mt-0.5 flex-shrink-0" /><span>{product.name} × {qty} {product.unit}</span></div>
          <div className="flex gap-2"><Calculator size={13} className="text-gray-400 mt-0.5 flex-shrink-0" /><span>الإجمالي: <strong>{net.toFixed(2)} ر.س</strong></span></div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate("/my-orders")}
            className="flex-1 bg-[#103c68] text-white py-3.5 rounded-xl font-bold hover:bg-[#0d2e50] transition-colors shadow-sm">
            متابعة الطلبات
          </button>
          <button onClick={() => navigate("/")}
            className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium hover:bg-gray-200 transition-colors">
            الرئيسية
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* ── Sticky header ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronRight size={20} className="text-gray-600" />
          </button>
          <div>
            <h1 className="font-black text-lg text-gray-900">تقديم طلب</h1>
            <p className="text-xs text-gray-400">{product.name}</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {/* ── Product summary card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex gap-4 p-4">
            <img src={product.image_url} alt={product.name}
              className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
              onError={e => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${product.id}/200`; }} />
            <div className="flex-1 min-w-0">
              <h2 className="font-black text-gray-900">{product.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{product.description}</p>
              {product.avg_rating > 0 && (
                <div className="flex items-center gap-1 mt-1.5">
                  <Star size={11} className="text-yellow-400 fill-yellow-400" />
                  <span className="text-xs text-gray-500">{product.avg_rating?.toFixed(1)} ({product.review_count} تقييم)</span>
                </div>
              )}
              <div className="text-[#103c68] font-black text-lg mt-1">{product.price_per_unit.toLocaleString("ar-SA")} <span className="text-sm font-normal text-gray-400">ر.س / {product.unit}</span></div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Quantity + calculation ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Hash size={16} className="text-[#103c68]" />
              <h3 className="font-bold text-gray-900">الكمية المطلوبة</h3>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">الكمية ({product.unit}) *</label>
              <div className="flex items-center gap-3">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, quantity: String(Math.max(1, parseFloat(f.quantity) - 1)) }))}
                  className="w-11 h-11 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-xl transition-colors">
                  −
                </button>
                <input type="number" required min="1" step="1"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-2xl font-black text-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, quantity: String(parseFloat(f.quantity) + 1) }))}
                  className="w-11 h-11 flex items-center justify-center bg-[#103c68] hover:bg-[#0d2e50] text-white rounded-xl font-bold text-xl transition-colors shadow-sm">
                  +
                </button>
              </div>
            </div>

            {/* Live calculation */}
            <div className="mt-4 bg-[#103c68]/5 border border-[#103c68]/15 rounded-2xl p-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>قبل الضريبة ({qty} × {product.price_per_unit})</span>
                <span className="font-semibold">{total.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between text-yellow-700">
                <span>ضريبة القيمة المضافة (15%)</span>
                <span className="font-semibold">{vat.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#103c68]/15 text-gray-900">
                <span className="font-black">الإجمالي شامل الضريبة</span>
                <span className="font-black text-[#103c68] text-base">{net.toFixed(2)} ر.س</span>
              </div>
            </div>
          </div>

          {/* ── Destination type + location ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={16} className="text-red-500" />
              <h3 className="font-bold text-gray-900">موقع التسليم</h3>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">التسليم إلى</label>
              <div className="flex gap-2">
                {["مستودع", "مصنع", "موقع"].map(d => (
                  <button key={d} type="button"
                    onClick={() => setForm(f => ({ ...f, destination_type: d }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      form.destination_type === d
                        ? "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">عنوان التسليم *</label>
              <textarea required rows={2}
                value={form.delivery_location}
                onChange={e => setForm(f => ({ ...f, delivery_location: e.target.value }))}
                placeholder="اكتب العنوان التفصيلي أو اضغط تحديد الموقع..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
              <button type="button" onClick={getLocation} disabled={locating}
                className="mt-2 flex items-center gap-2 text-sm text-[#103c68] hover:text-[#0d2e50] font-semibold disabled:opacity-60 transition-colors">
                <Locate size={15} />{locating ? "جاري تحديد الموقع..." : "تحديد موقعي الحالي تلقائياً"}
              </button>
              {form.delivery_lat && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-xl">
                  <CheckCircle size={12} />تم تحديد الموقع: {parseFloat(form.delivery_lat).toFixed(5)}, {parseFloat(form.delivery_lng).toFixed(5)}
                </div>
              )}
            </div>
          </div>

          {/* ── Rep selection ── */}
          {reps.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-purple-500" />
                <h3 className="font-bold text-gray-900">اختر مندوبك</h3>
                <span className="text-xs text-gray-400">(اختياري)</span>
              </div>
              <div className="space-y-2">
                {reps.map(rep => (
                  <button key={rep.id} type="button"
                    onClick={() => setForm(f => ({ ...f, rep_id: form.rep_id === String(rep.id) ? "" : String(rep.id) }))}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-start transition-all ${
                      form.rep_id === String(rep.id)
                        ? "border-[#103c68] bg-[#103c68]/5 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm ${
                      form.rep_id === String(rep.id) ? "bg-[#103c68] text-white" : "bg-gray-100 text-gray-600"
                    }`}>
                      {rep.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900">{rep.name}</div>
                      <div className="text-xs text-gray-400">{rep.phone}</div>
                    </div>
                    {form.rep_id === String(rep.id) && (
                      <CheckCircle size={16} className="text-[#103c68] flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Submit ── */}
          <button type="submit" disabled={submitting}
            className="w-full bg-[#103c68] hover:bg-[#0d2e50] text-white py-4.5 rounded-2xl font-black text-base disabled:opacity-60 shadow-xl transition-all active:scale-[0.99]"
            style={{ paddingTop: "1.125rem", paddingBottom: "1.125rem" }}>
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                جاري إرسال الطلب...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Truck size={18} />
                إرسال الطلب — {net.toFixed(2)} ر.س
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
