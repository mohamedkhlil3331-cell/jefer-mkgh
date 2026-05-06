import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin, Locate, ChevronRight, Package, Star, CheckCircle,
  Hash, Truck, Users, Calculator, Search, X,
} from "lucide-react";

// Fix leaflet default icon paths broken by bundlers
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface Product {
  id: number; name: string; price_per_unit: number; unit: string;
  description: string; image_url: string; avg_rating: number; review_count: number;
}
interface Rep { id: number; name: string; phone: string; }

// ── Inner: handle map clicks to place/move pin ────────────────────────────
function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

// ── Inner: fly to a position when lat/lng change ──────────────────────────
function MapFlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.8 }); }, [lat, lng, map]);
  return null;
}

// Default center: Riyadh
const DEFAULT_CENTER: [number, number] = [24.7136, 46.6753];

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

  // Address search
  const [searchQuery,    setSearchQuery]    = useState("");
  const [searching,      setSearching]      = useState(false);
  const [searchResults,  setSearchResults]  = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    quantity: "1",
    rep_id: "",
    delivery_location: "",
    delivery_lat: "",
    delivery_lng: "",
    destination_type: "مستودع",
  });

  // Derived: current pin position
  const pinLat = form.delivery_lat ? parseFloat(form.delivery_lat) : null;
  const pinLng = form.delivery_lng ? parseFloat(form.delivery_lng) : null;
  const pinPos: [number, number] | null = (pinLat !== null && pinLng !== null) ? [pinLat, pinLng] : null;

  useEffect(() => {
    Promise.all([
      fetch(`/api/products/${productId}`).then(r => r.json()),
      fetch("/api/users?role=rep").then(r => r.json()),
    ]).then(([p, r]) => { setProduct(p); setReps(r); }).finally(() => setLoading(false));
  }, [productId]);

  // Close search dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Reverse geocode to get address label from lat/lng
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar`,
        { headers: { "Accept-Language": "ar" } }
      );
      const data = await res.json();
      if (data.display_name) {
        setForm(f => ({ ...f, delivery_location: data.display_name }));
      }
    } catch { /* ignore */ }
  }, []);

  // Handle map click: place/move pin
  const handleMapPick = useCallback((lat: number, lng: number) => {
    setForm(f => ({
      ...f,
      delivery_lat: String(lat),
      delivery_lng: String(lng),
    }));
    reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  // Handle GPS button
  const getLocation = () => {
    if (!navigator.geolocation) return alert("المتصفح لا يدعم تحديد الموقع");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setForm(f => ({ ...f, delivery_lat: String(lat), delivery_lng: String(lng) }));
        reverseGeocode(lat, lng);
        setLocating(false);
      },
      () => { alert("تعذر تحديد الموقع"); setLocating(false); }
    );
  };

  // Nominatim forward geocoding search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&accept-language=ar`,
        { headers: { "Accept-Language": "ar" } }
      );
      const data = await res.json();
      setSearchResults(data);
    } catch { /* ignore */ }
    finally { setSearching(false); }
  };

  const selectSearchResult = (r: { display_name: string; lat: string; lon: string }) => {
    setForm(f => ({
      ...f,
      delivery_lat: r.lat,
      delivery_lng: r.lon,
      delivery_location: r.display_name,
    }));
    setSearchResults([]);
    setSearchQuery("");
  };

  const clearPin = () => {
    setForm(f => ({ ...f, delivery_lat: "", delivery_lng: "", delivery_location: "" }));
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
          customer_phone:    user.phone,
          customer_name:     user.name,
          rep_id:            form.rep_id || null,
          product_id:        product.id,
          product_name:      product.name,
          quantity:          qty,
          unit:              product.unit,
          unit_price:        product.price_per_unit,
          delivery_location: form.delivery_location,
          delivery_lat:      form.delivery_lat || null,
          delivery_lng:      form.delivery_lng || null,
          destination_type:  form.destination_type,
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

            {/* Destination type pills */}
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

            {/* Address search */}
            <div className="mb-3" ref={searchRef}>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">ابحث عن الموقع بالعنوان</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleSearch())}
                  placeholder="مثال: الرياض، حي النخيل..."
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30"
                />
                <button type="button" onClick={handleSearch} disabled={searching || !searchQuery.trim()}
                  className="px-4 py-2.5 bg-[#103c68] text-white rounded-xl hover:bg-[#0d2e50] disabled:opacity-50 transition-colors flex items-center gap-1.5 text-sm font-semibold">
                  <Search size={14} />{searching ? "..." : "بحث"}
                </button>
              </div>
              {/* Search results dropdown */}
              {searchResults.length > 0 && (
                <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50 relative">
                  {searchResults.map((r, i) => (
                    <button key={i} type="button" onClick={() => selectSearchResult(r)}
                      className="w-full text-right px-4 py-3 text-sm text-gray-700 hover:bg-[#103c68]/5 border-b border-gray-100 last:border-0 transition-colors line-clamp-2">
                      {r.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Map */}
            <div className="mb-3 rounded-xl overflow-hidden border border-gray-200" style={{ height: 240, zIndex: 0 }}>
              <MapContainer
                center={pinPos ?? DEFAULT_CENTER}
                zoom={pinPos ? 14 : 6}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickHandler onPick={handleMapPick} />
                {pinPos && (
                  <>
                    <MapFlyTo lat={pinPos[0]} lng={pinPos[1]} />
                    <Marker position={pinPos} />
                  </>
                )}
              </MapContainer>
            </div>
            <p className="text-xs text-gray-400 mb-3 text-center">اضغط على الخريطة لتحديد موقع التسليم</p>

            {/* GPS button */}
            <button type="button" onClick={getLocation} disabled={locating}
              className="flex items-center gap-2 text-sm text-[#103c68] hover:text-[#0d2e50] font-semibold disabled:opacity-60 transition-colors mb-3">
              <Locate size={15} />{locating ? "جاري تحديد الموقع..." : "استخدام موقعي الحالي تلقائياً"}
            </button>

            {/* Pin confirmed badge */}
            {pinPos && (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 px-3 py-2 rounded-xl mb-3">
                <div className="flex items-center gap-1.5 text-xs text-green-700">
                  <CheckCircle size={12} />
                  <span>تم تثبيت الدبوس: {pinPos[0].toFixed(5)}, {pinPos[1].toFixed(5)}</span>
                </div>
                <button type="button" onClick={clearPin} className="text-gray-400 hover:text-red-500 transition-colors">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Address text field */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">عنوان التسليم التفصيلي *</label>
              <textarea required rows={2}
                value={form.delivery_location}
                onChange={e => setForm(f => ({ ...f, delivery_location: e.target.value }))}
                placeholder="يُملأ تلقائياً عند تحديد الموقع، أو اكتبه يدوياً..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
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
