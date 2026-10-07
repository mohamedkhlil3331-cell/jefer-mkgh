import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { Trash2, Plus, Minus, ShoppingCart, CheckCircle, MapPin, ChevronRight, Package, Banknote, Upload, X, UserPlus } from "lucide-react";
import GuestAuthModal from "@/components/GuestAuthModal";

export default function Cart() {
  const { items, removeItem, updateQty, clearCart } = useCart();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [showGuestModal, setShowGuestModal] = useState(false);
  const [form, setForm] = useState({
    delivery_location: "",
    payment_method: "transfer",
    notes: "",
  });
  const [receipt, setReceipt] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string[]>([]);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [unloadingPlaces, setUnloadingPlaces] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/tariffs/unloading-places")
      .then(r => r.json()).then(d => setUnloadingPlaces(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const totalBeforeVat = items.reduce((s, i) => s + i.price_per_unit * i.quantity, 0);
  const vat = totalBeforeVat * 0.15;
  const total = totalBeforeVat + vat;

  const handleReceipt = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setReceipt(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!user) { setShowGuestModal(true); return; }
    if (items.length === 0) return;
    if (!form.delivery_location.trim()) { alert("أدخل موقع التسليم"); return; }
    setSubmitting(true);
    const orderNumbers: string[] = [];
    try {
      for (const item of items) {
        const res = await fetch("/api/workflow/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_phone: user.phone,
            customer_name: user.name,
            product_id: item.productId,
            product_name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.price_per_unit,
            delivery_location: form.delivery_location,
            payment_method: form.payment_method,
            bank_receipt_image: receipt || null,
            notes: form.notes || null,
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "خطأ في الطلب");
        orderNumbers.push(d.order_number);
      }
      clearCart();
      setSuccess(orderNumbers);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (success.length > 0) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-xl p-8 text-center max-w-md w-full">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={40} className="text-green-500" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">تم إرسال طلباتك!</h2>
        <p className="text-gray-500 text-sm mb-5">تم إنشاء {success.length} طلب — سيتم مراجعتها وتأكيد الدفع</p>
        <div className="space-y-2 mb-6">
          {success.map(num => (
            <div key={num} className="bg-[#103c68]/5 border border-[#103c68]/15 rounded-xl px-4 py-2.5">
              <div className="text-xs text-gray-400 mb-0.5">رقم الطلب</div>
              <div className="font-mono text-base font-black text-[#103c68]">{num}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate("/my-orders")}
            className="flex-1 bg-[#103c68] text-white py-3.5 rounded-xl font-bold hover:bg-[#0d2e50]">
            متابعة الطلبات
          </button>
          <button onClick={() => navigate("/")}
            className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium hover:bg-gray-200">
            الرئيسية
          </button>
        </div>
      </div>
    </div>
  );

  if (items.length === 0) return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 hover:bg-gray-100 rounded-xl">
            <ChevronRight size={20} className="text-gray-600" />
          </button>
          <h1 className="font-black text-lg text-gray-900">سلة المشتريات</h1>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-5">
          <ShoppingCart size={40} className="text-gray-300" />
        </div>
        <h2 className="text-xl font-black text-gray-700 mb-2">السلة فارغة</h2>
        <p className="text-gray-400 text-sm mb-6">أضف منتجات من الكتالوج لتبدأ طلبك</p>
        <button onClick={() => navigate("/")}
          className="bg-[#103c68] text-white px-8 py-3 rounded-2xl font-bold hover:bg-[#0d2e50]">
          تصفح المنتجات
        </button>
      </div>
      {showGuestModal && <GuestAuthModal onClose={() => setShowGuestModal(false)} />}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 hover:bg-gray-100 rounded-xl">
            <ChevronRight size={20} className="text-gray-600" />
          </button>
          <div>
            <h1 className="font-black text-lg text-gray-900">سلة المشتريات</h1>
            <p className="text-xs text-gray-400">{items.length} منتج</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-32">
        {/* Items */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {items.map((item, idx) => (
            <div key={item.productId} className={`p-4 flex items-center gap-3 ${idx < items.length - 1 ? "border-b border-gray-50" : ""}`}>
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : "📦"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 text-sm truncate">{item.name}</div>
                <div className="text-xs text-[#103c68] font-semibold">{item.price_per_unit.toFixed(0)} ر.س / {item.unit}</div>
                <div className="text-xs text-gray-400">الإجمالي: {(item.price_per_unit * item.quantity).toFixed(0)} ر.س</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => updateQty(item.productId, item.quantity - 1)}
                  className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                  <Minus size={12} />
                </button>
                <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                <button onClick={() => updateQty(item.productId, item.quantity + 1)}
                  className="w-7 h-7 rounded-lg bg-[#103c68] text-white flex items-center justify-center hover:bg-[#0d2e50]">
                  <Plus size={12} />
                </button>
                <button onClick={() => removeItem(item.productId)}
                  className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 mr-1">
                  <Trash2 size={12} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Price summary */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-500"><span>المجموع قبل الضريبة</span><span>{totalBeforeVat.toFixed(2)} ر.س</span></div>
          <div className="flex justify-between text-gray-500"><span>ضريبة القيمة المضافة (15%)</span><span>{vat.toFixed(2)} ر.س</span></div>
          <div className="flex justify-between font-black text-gray-900 text-base pt-2 border-t border-gray-100">
            <span>الإجمالي</span><span>{total.toFixed(2)} ر.س</span>
          </div>
        </div>

        {/* Delivery location */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm"><MapPin size={15} className="text-[#103c68]" />موقع التسليم</h2>
          {unloadingPlaces.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">اختر من أماكن التنزيل المتاحة</p>
              <div className="flex gap-2 flex-wrap">
                {unloadingPlaces.map(p => (
                  <button key={p} type="button"
                    onClick={() => setForm(f => ({ ...f, delivery_location: p }))}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      form.delivery_location === p
                        ? "bg-[#103c68] text-white border-[#103c68]"
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:border-[#103c68]/40 hover:bg-[#103c68]/5"
                    }`}>
                    <MapPin size={10} />{p}
                  </button>
                ))}
              </div>
            </div>
          )}
          <textarea value={form.delivery_location} onChange={e => setForm(f => ({ ...f, delivery_location: e.target.value }))}
            rows={2} placeholder="أو أدخل عنوان أو وصف الموقع..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none" />
        </div>

        {/* Payment method */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <h2 className="font-bold text-gray-900 text-sm">طريقة الدفع</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm(f => ({ ...f, payment_method: "transfer" }))}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${form.payment_method === "transfer" ? "bg-[#103c68] text-white border-[#103c68]" : "bg-white text-gray-600 border-gray-200"}`}>
              <Banknote size={14} /> تحويل بنكي
            </button>
            <button type="button" onClick={() => setForm(f => ({ ...f, payment_method: "cash" }))}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${form.payment_method === "cash" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200"}`}>
              💵 نقداً
            </button>
          </div>

          {form.payment_method === "transfer" && (
            <div className="space-y-2">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 flex items-center gap-2">
                <Banknote size={13} className="flex-shrink-0" />
                <span>سيتم إرسال تفاصيل التحويل البنكي بعد تأكيد الطلب من قِبَل المراجع</span>
              </div>
              <input ref={receiptRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleReceipt(e.target.files[0])} />
              {receipt ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200">
                  <img src={receipt} alt="إيصال التحويل" className="w-full max-h-36 object-contain bg-gray-50" />
                  <button onClick={() => setReceipt("")} className="absolute top-2 left-2 p-1 bg-red-500 rounded-lg text-white">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button onClick={() => receiptRef.current?.click()} type="button"
                  className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-[#103c68]/40 flex items-center justify-center gap-2">
                  <Upload size={13} /> رفع إيصال التحويل (اختياري)
                </button>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
          <h2 className="font-bold text-gray-900 text-sm">ملاحظات إضافية</h2>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2} placeholder="أي ملاحظات خاصة بطلبك..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none" />
        </div>

        <Package size={0} className="hidden" />
      </div>

      {/* Guest banner */}
      {!user && (
        <div className="mx-4 mb-2 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <UserPlus size={16} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-amber-800 text-sm">تحتاج حساباً لإتمام الطلب</p>
            <p className="text-xs text-amber-600 mt-0.5">أنشئ حساباً مجانياً أو سجّل دخولك</p>
          </div>
          <button
            onClick={() => setShowGuestModal(true)}
            className="flex-shrink-0 bg-[#103c68] text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-[#0d2e50] transition-colors"
          >
            تسجيل
          </button>
        </div>
      )}

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 shadow-lg p-4 z-20">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="flex-shrink-0 text-right">
            <div className="text-xs text-gray-400">الإجمالي شامل الضريبة</div>
            <div className="font-black text-[#103c68] text-lg">{total.toFixed(2)} ر.س</div>
          </div>
          <button onClick={handleSubmit} disabled={submitting || items.length === 0}
            className="flex-1 bg-[#103c68] hover:bg-[#0d2e50] text-white py-4 rounded-2xl font-black text-base disabled:opacity-60 shadow-lg transition-colors flex items-center justify-center gap-2">
            {submitting ? (
              <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> جاري الإرسال...</>
            ) : (
              <><ShoppingCart size={18} /> تأكيد {items.length} طلب</>
            )}
          </button>
        </div>
      </div>

      {showGuestModal && <GuestAuthModal onClose={() => setShowGuestModal(false)} message="أنشئ حساباً لإتمام طلباتك" />}
    </div>
  );
}
