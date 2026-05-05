import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { MapPin, Locate, ChevronRight } from "lucide-react";

interface Product { id: number; name: string; price_per_unit: number; unit: string; description: string; image_url: string; }
interface Rep { id: number; name: string; phone: string; }

export default function PlaceOrder() {
  const { id: productId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [product, setProduct] = useState<Product | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

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
      const unitPrice = product.price_per_unit;
      const qty = parseFloat(form.quantity) || 1;
      const res = await fetch("/api/workflow/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_phone: user.phone,
          customer_name: user.name,
          rep_id: form.rep_id || null,
          product_id: product.id,
          product_name: product.name,
          quantity: qty,
          unit: product.unit,
          unit_price: unitPrice,
          delivery_location: form.delivery_location,
          delivery_lat: form.delivery_lat || null,
          delivery_lng: form.delivery_lng || null,
          destination_type: form.destination_type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(data.order_number);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!product) return <div className="text-center py-20 text-muted-foreground">المنتج غير موجود</div>;

  const qty = parseFloat(form.quantity) || 1;
  const total = qty * product.price_per_unit;
  const vat = total * 0.15;
  const net = total + vat;

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">✅</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">تم إرسال طلبك!</h2>
          <p className="text-muted-foreground mb-4">رقم طلبك:</p>
          <div className="bg-gray-100 rounded-xl px-4 py-3 font-mono text-lg font-bold text-primary mb-6">{success}</div>
          <p className="text-sm text-muted-foreground mb-6">سيتم مراجعة طلبك وتأكيد الدفع قريباً. يمكنك متابعة حالة الطلب من صفحة طلباتي.</p>
          <div className="flex gap-3">
            <button onClick={() => navigate("/my-orders")} className="flex-1 bg-primary text-white py-3 rounded-xl font-medium hover:bg-primary/90">
              متابعة الطلبات
            </button>
            <button onClick={() => navigate("/")} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-200">
              الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-2 hover:bg-gray-100 rounded-xl">
          <ChevronRight size={20} />
        </button>
        <h1 className="font-bold text-lg">تقديم طلب</h1>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        {/* Product card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex gap-4 p-4">
          <img src={product.image_url} alt={product.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${product.id}/200`; }} />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900">{product.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{product.description}</p>
            <div className="text-primary font-bold mt-1">{product.price_per_unit.toLocaleString("ar-SA")} ر.س / {product.unit}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Quantity */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">تفاصيل الطلب</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الكمية ({product.unit}) *</label>
              <input
                type="number" required min="1" step="1"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold text-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Calc summary */}
            <div className="mt-4 bg-blue-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">المبلغ قبل الضريبة:</span><span className="font-medium">{total.toFixed(2)} ر.س</span></div>
              <div className="flex justify-between"><span className="text-gray-600">ضريبة القيمة المضافة 15%:</span><span className="font-medium text-yellow-700">{vat.toFixed(2)} ر.س</span></div>
              <div className="flex justify-between border-t border-blue-200 pt-2"><span className="font-bold text-gray-900">الإجمالي شامل الضريبة:</span><span className="font-bold text-primary text-base">{net.toFixed(2)} ر.س</span></div>
            </div>
          </div>

          {/* Destination */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">موقع التسليم</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">التسليم إلى</label>
              <div className="grid grid-cols-3 gap-2">
                {["مستودع","مصنع","موقع"].map(d => (
                  <button key={d} type="button" onClick={() => setForm(f => ({ ...f, destination_type: d }))}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${form.destination_type === d ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary"}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">عنوان التسليم *</label>
              <div className="relative">
                <input
                  required
                  value={form.delivery_location}
                  onChange={e => setForm(f => ({ ...f, delivery_location: e.target.value }))}
                  placeholder="اكتب العنوان أو اضغط تحديد الموقع"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-12 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
              <button
                type="button"
                onClick={getLocation}
                disabled={locating}
                className="mt-2 flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium"
              >
                <Locate size={15} />
                {locating ? "جاري تحديد الموقع..." : "تحديد موقعي الحالي تلقائياً"}
              </button>
              {form.delivery_lat && (
                <div className="mt-2 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                  ✓ تم تحديد الموقع: {parseFloat(form.delivery_lat).toFixed(5)}, {parseFloat(form.delivery_lng).toFixed(5)}
                </div>
              )}
            </div>
          </div>

          {/* Rep selection */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">المندوب</h3>
            <div className="grid grid-cols-1 gap-2">
              {reps.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا يوجد مناديب متاحون</p>
              ) : (
                reps.map(rep => (
                  <button key={rep.id} type="button"
                    onClick={() => setForm(f => ({ ...f, rep_id: String(rep.id) }))}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-right transition-colors ${form.rep_id === String(rep.id) ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-bold text-sm">{rep.name.charAt(0)}</span>
                    </div>
                    <div>
                      <div className="font-medium text-sm text-gray-900">{rep.name}</div>
                      <div className="text-xs text-muted-foreground">{rep.phone}</div>
                    </div>
                    {form.rep_id === String(rep.id) && <span className="mr-auto text-primary text-lg">✓</span>}
                  </button>
                ))
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-white py-4 rounded-2xl font-bold text-base hover:bg-primary/90 disabled:opacity-60 shadow-lg transition-colors"
          >
            {submitting ? "جاري إرسال الطلب..." : `إرسال الطلب — ${net.toFixed(2)} ر.س`}
          </button>
        </form>
      </div>
    </div>
  );
}
