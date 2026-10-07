import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import GuestAuthModal from "@/components/GuestAuthModal";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin, Locate, ChevronRight, Package, Star, CheckCircle,
  Hash, Truck, Users, Calculator, Search, X,
  CreditCard, Banknote, Lock, Upload, Bookmark, Navigation, BookmarkCheck,
  ShoppingBag, User,
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
  packaging_type?: string;
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
  const { totalCount: cartCount } = useCart();
  const [, navigate]      = useLocation();
  const [product,        setProduct]        = useState<Product | null>(null);
  const [reps,           setReps]           = useState<Rep[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [success,        setSuccess]        = useState<string | null>(null);
  const [locating,       setLocating]       = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);

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
    payment_method: "transfer",
    packaging_type: "فرش",
  });

  // Saved locations
  interface SavedLoc { id: number; alias: string; address: string; lat: number; lng: number; is_default: number; }
  const [savedLocations, setSavedLocations] = useState<SavedLoc[]>([]);
  const [showSavedLocs, setShowSavedLocs] = useState(false);

  // Nearest loading point
  interface LoadingPoint { id: number; name: string; city: string; address: string; lat: number; lng: number; distance_km: number; }
  const [loadingPoints, setLoadingPoints] = useState<LoadingPoint[]>([]);
  const [nearestLP, setNearestLP] = useState<LoadingPoint | null>(null);

  // Save location modal
  const [showSaveLocModal, setShowSaveLocModal] = useState(false);
  const [saveLocAlias, setSaveLocAlias] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locSaved, setLocSaved] = useState(false);

  // Draft saving
  const [savingDraft, setSavingDraft] = useState(false);

  const [cardForm, setCardForm] = useState({
    card_number: "", card_name: "", card_expiry: "", card_cvv: "",
  });
  const [showCardForm, setShowCardForm] = useState(false);
  const [bankReceipt, setBankReceipt] = useState<string>("");
  const receiptFileRef = useRef<HTMLInputElement>(null);

  // Derived: current pin position
  const pinLat = form.delivery_lat ? parseFloat(form.delivery_lat) : null;
  const pinLng = form.delivery_lng ? parseFloat(form.delivery_lng) : null;
  const pinPos: [number, number] | null = (pinLat !== null && pinLng !== null) ? [pinLat, pinLng] : null;

  useEffect(() => {
    Promise.all([
      fetch(`/api/products/${productId}`).then(r => r.ok ? r.json() : null),
      fetch("/api/users?role=rep").then(r => r.ok ? r.json() : []),
    ]).then(([p, r]) => {
      setProduct(p);
      setReps(Array.isArray(r) ? r : []);
      if (p?.packaging_type === "سائب") {
        setForm(f => ({ ...f, packaging_type: "سائب" }));
      }
    }).finally(() => {
      setLoading(false);
      // Show guest modal right after load if not logged in
      if (!user) setShowGuestModal(true);
    });
  }, [productId, user]);

  useEffect(() => {
    if (!user?.phone) return;
    fetch(`/api/client-locations?phone=${user.phone}`)
      .then(r => r.json()).then(d => setSavedLocations(Array.isArray(d) ? d : [])).catch(() => {});
  }, [user?.phone]);

  // Load all active loading points once
  useEffect(() => {
    fetch("/api/loading-points")
      .then(r => r.json()).then(d => setLoadingPoints(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Unloading places from tariffs
  const [unloadingPlaces, setUnloadingPlaces] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/tariffs/unloading-places")
      .then(r => r.json()).then(d => setUnloadingPlaces(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Haversine distance (km) between two coords
  const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371, toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // Recalculate nearest loading point whenever pin changes
  useEffect(() => {
    if (!pinLat || !pinLng || !loadingPoints.length) { setNearestLP(null); return; }
    const pts = loadingPoints
      .filter(p => p.lat && p.lng)
      .map(p => ({ ...p, distance_km: haversine(pinLat, pinLng, p.lat, p.lng) }))
      .sort((a, b) => a.distance_km - b.distance_km);
    setNearestLP(pts[0] || null);
  }, [pinLat, pinLng, loadingPoints]);

  const doSaveLocation = async () => {
    if (!user || !saveLocAlias.trim() || !pinLat || !pinLng) return;
    setSavingLocation(true);
    try {
      await fetch("/api/client-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_phone: user.phone,
          alias: saveLocAlias.trim(),
          address: form.delivery_location,
          lat: pinLat, lng: pinLng,
          is_default: 0,
        }),
      });
      setLocSaved(true); setShowSaveLocModal(false); setSaveLocAlias("");
      fetch(`/api/client-locations?phone=${user.phone}`)
        .then(r => r.json()).then(d => setSavedLocations(Array.isArray(d) ? d : []));
      setTimeout(() => setLocSaved(false), 3000);
    } catch { /* ignore */ }
    setSavingLocation(false);
  };

  const handleSaveDraft = async () => {
    if (!user) { setShowGuestModal(true); return; }
    if (!product) return;
    setSavingDraft(true);
    try {
      const qty = parseFloat(form.quantity) || 1;
      const res = await fetch("/api/workflow/orders/draft", {
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
          unit_price: product.price_per_unit,
          delivery_location: form.delivery_location,
          delivery_lat: form.delivery_lat || null,
          delivery_lng: form.delivery_lng || null,
          destination_type: form.destination_type,
          payment_method: form.payment_method,
          packaging_type: form.packaging_type,
          required_vehicle_type: form.packaging_type === "سائب" ? "بلكر" : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(`تم حفظ المسودة رقم ${data.order_number} — يمكنك إرسالها لاحقاً من قسم طلباتي`);
      navigate("/my-orders");
    } catch (err) { alert((err as Error).message); }
    finally { setSavingDraft(false); }
  };

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
    setForm(f => ({ ...f, delivery_lat: "", delivery_lng: "" }));
  };

  const formatCardNumber = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  const formatExpiry    = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length >= 3 ? d.slice(0,2) + "/" + d.slice(2) : d; };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setShowGuestModal(true); return; }
    if (!product) return;
    // If card selected but form not shown yet, show card form instead of submitting
    if (form.payment_method === "card" && !showCardForm) {
      setShowCardForm(true);
      return;
    }
    // Validate card fields if card payment
    if (form.payment_method === "card") {
      if (!cardForm.card_number || !cardForm.card_name || !cardForm.card_expiry || !cardForm.card_cvv)
        return;
    }
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
          payment_method:    form.payment_method,
          packaging_type:       form.packaging_type,
          required_vehicle_type: form.packaging_type === "سائب" ? "بلكر" : null,
          bank_receipt_image: bankReceipt || null,
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
      {/* ── Navbar — matches Catalog white navbar ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex items-center h-16 gap-4">

            {/* Logo */}
            <button onClick={() => navigate("/")} className="flex-shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#103c68] active:scale-95 transition-transform">
              <img src="/jefer-logo-new.png" alt="JEFER" className="h-9 object-contain" />
            </button>

            {/* Page title — fills center */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <button aria-label="العودة إلى المتجر" onClick={() => navigate("/")} className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0">
                <ChevronRight size={18} className="text-gray-500" />
              </button>
              <div className="min-w-0">
                <div className="font-black text-gray-900 text-sm leading-tight truncate">{product.name}</div>
                <div className="text-xs text-gray-400">تقديم طلب</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* User badge — desktop */}
              {user && (
                <div className="hidden sm:flex items-center gap-1.5 bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700">
                  <User size={14} className="text-[#103c68]" />
                  <span className="max-w-[80px] truncate">{user.name}</span>
                </div>
              )}

              {/* Cart */}
              <button aria-label={`عرض السلة (${cartCount} منتجات)`} onClick={() => navigate("/cart")}
                className="relative p-2.5 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors">
                <ShoppingBag size={20} />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -left-1 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {/* ── Product summary card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex gap-4 p-4">
            <img src={product.image_url} alt={product.name}
              className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
              onError={e => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${product.id}/200`; }} />
            <div className="flex-1 min-w-0">
              <h2 className="font-black text-gray-900">{product.name}</h2>
              <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{product.description}</p>
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
              <label htmlFor="order-quantity" className="block text-sm font-semibold text-gray-700 mb-1.5">الكمية ({product.unit}) *</label>
              <div className="flex items-center gap-3">
                <button type="button" aria-label="تقليل الكمية"
                  onClick={() => setForm(f => ({ ...f, quantity: String(Math.max(1, parseFloat(f.quantity) - 1)) }))}
                  className="w-11 h-11 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-xl transition-colors">
                  −
                </button>
                <input id="order-quantity" type="number" required min="1" step="1"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-2xl font-black text-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                <button type="button" aria-label="زيادة الكمية"
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

          {/* ── Packaging Type ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package size={16} className="text-[#103c68]" />
              <h3 className="font-bold text-gray-900">نوع التعبئة</h3>
              {product?.packaging_type === "سائب" && (
                <span className="mr-auto text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Truck size={11} /> سائب (بلكر) — محدد تلقائياً
                </span>
              )}
            </div>
            {product?.packaging_type === "سائب" ? (
              <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 flex items-center gap-3">
                <div className="text-3xl">🚛</div>
                <div>
                  <div className="font-bold text-blue-800">سائب (بلكر)</div>
                  <div className="text-xs text-blue-600">هذا المنتج سائب ويتطلب شاحنة بلكر متخصصة</div>
                </div>
                <CheckCircle size={20} className="text-blue-600 mr-auto" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "فرش", label: "فرش", sub: "شحن أرضي مباشر", emoji: "📋" },
                  { key: "طبالي خشب", label: "طبالي خشب", sub: "منصات خشبية", emoji: "🪵" },
                  { key: "طبالي بلاستيك", label: "طبالي بلاستيك", sub: "منصات بلاستيكية", emoji: "📦" },
                  { key: "سائب", label: "سائب (بلكر)", sub: "شاحنة بلكر متخصصة", emoji: "🚛" },
                ].map(opt => (
                  <button key={opt.key} type="button"
                    onClick={() => setForm(f => ({ ...f, packaging_type: opt.key }))}
                    className={`p-4 rounded-xl border-2 text-right transition-all ${
                      form.packaging_type === opt.key
                        ? "border-[#103c68] bg-[#103c68]/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}>
                    <div className="text-2xl mb-1">{opt.emoji}</div>
                    <div className="font-bold text-gray-900 text-sm">{opt.label}</div>
                    <div className="text-xs text-gray-400">{opt.sub}</div>
                    {form.packaging_type === opt.key && (
                      <div className="mt-1 text-xs text-[#103c68] font-semibold flex items-center gap-1">
                        <CheckCircle size={11} /> محدد
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {form.packaging_type === "سائب" && product?.packaging_type !== "سائب" && (
              <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 flex items-center gap-2">
                <Truck size={14} className="flex-shrink-0" />
                <span>سيتم تعيين شاحنة بلكر متخصصة لطلبك</span>
              </div>
            )}
            {["فرش","طبالي خشب","طبالي بلاستيك"].includes(form.packaging_type) && (
              <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 flex items-center gap-2">
                <Truck size={14} className="flex-shrink-0" />
                <span>سيتم تهيئة المقطورة بناءً على نوع التعبئة المختار</span>
              </div>
            )}
          </div>

          {/* ── Destination type + location ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={16} className="text-red-500" />
              <h3 className="font-bold text-gray-900">موقع التسليم</h3>
            </div>

            {/* ── Saved locations quick-pick ── */}
            {savedLocations.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                  <BookmarkCheck size={12} className="text-emerald-600" /> مواقعي المحفوظة
                </label>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {savedLocations.map(loc => (
                    <button key={loc.id} type="button"
                      onClick={() => {
                        if (loc.lat && loc.lng) {
                          setForm(f => ({ ...f, delivery_lat: String(loc.lat), delivery_lng: String(loc.lng), delivery_location: loc.address || loc.alias }));
                        } else {
                          setForm(f => ({ ...f, delivery_location: loc.address || loc.alias }));
                        }
                      }}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#103c68]/20 bg-[#103c68]/5 hover:bg-[#103c68]/10 text-[#103c68] text-xs font-semibold transition-colors">
                      <MapPin size={11} />
                      {loc.alias}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Unloading places from tariffs ── */}
            {unloadingPlaces.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                  <MapPin size={12} className="text-red-400" /> أماكن التنزيل المتاحة
                </label>
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
              <label htmlFor="order-address-search" className="block text-sm font-semibold text-gray-700 mb-1.5">ابحث عن الموقع بالعنوان</label>
              <div className="flex gap-2">
                <input
                  id="order-address-search"
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
              <div className="flex items-center justify-between bg-green-50 border border-green-200 px-3 py-2 rounded-xl mb-2">
                <div className="flex items-center gap-1.5 text-xs text-green-700">
                  <CheckCircle size={12} />
                  <span>تم تثبيت الدبوس: {pinPos[0].toFixed(5)}, {pinPos[1].toFixed(5)}</span>
                </div>
                <button type="button" aria-label="مسح دبوس موقع التسليم" onClick={clearPin} className="text-gray-400 hover:text-red-500 transition-colors">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Nearest loading point */}
            {nearestLP && pinPos && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 mb-2 flex items-start gap-2">
                <Navigation size={14} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-indigo-800">أقرب مكان تحميل</p>
                  <p className="text-xs text-indigo-700">{nearestLP.name} — {nearestLP.city}</p>
                  <p className="text-xs text-indigo-500 mt-0.5">المسافة التقريبية: {nearestLP.distance_km.toFixed(1)} كم</p>
                </div>
              </div>
            )}

            {/* Save location button */}
            {pinPos && !locSaved && !showSaveLocModal && (
              <button type="button" onClick={() => { setShowSaveLocModal(true); setSaveLocAlias(""); }}
                className="flex items-center gap-1.5 text-xs text-[#103c68] font-semibold hover:text-[#0d2e50] mb-2 transition-colors">
                <Bookmark size={13} /> احفظ هذا الموقع في مواقعي
              </button>
            )}
            {locSaved && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-2">
                <CheckCircle size={12} /> تم حفظ الموقع في ملفك الشخصي
              </div>
            )}

            {/* Save location modal */}
            {showSaveLocModal && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-2 space-y-2">
                <label htmlFor="order-location-alias" className="text-xs font-bold text-emerald-800 flex items-center gap-1"><Bookmark size={12} /> سمّ هذا الموقع</label>
                <div className="flex gap-2">
                  <input id="order-location-alias" value={saveLocAlias} onChange={e => setSaveLocAlias(e.target.value)}
                    placeholder="مثال: موقع المشروع، مستودعي..."
                    className="flex-1 border border-emerald-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                  <button type="button" onClick={doSaveLocation} disabled={savingLocation || !saveLocAlias.trim()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors">
                    {savingLocation ? "..." : "حفظ"}
                  </button>
                  <button type="button" aria-label="إلغاء حفظ الموقع" onClick={() => setShowSaveLocModal(false)} className="px-2 py-1.5 bg-gray-100 rounded-lg text-gray-500 hover:bg-gray-200 text-xs transition-colors">
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Address text field */}
            <div>
              <label htmlFor="order-delivery-address" className="block text-sm font-semibold text-gray-700 mb-1.5">عنوان التسليم التفصيلي *</label>
              <textarea id="order-delivery-address" required rows={2}
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

          {/* ── Payment Method ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={16} className="text-emerald-500" />
              <h3 className="font-bold text-gray-900">طريقة الدفع</h3>
            </div>
            <div className="flex gap-2 mb-4">
              <button type="button"
                onClick={() => { setForm(f => ({ ...f, payment_method: "transfer" })); setShowCardForm(false); }}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                  form.payment_method === "transfer"
                    ? "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}>
                <Banknote size={14} /> تحويل بنكي
              </button>
              <button type="button"
                onClick={() => { setForm(f => ({ ...f, payment_method: "cash" })); setShowCardForm(false); }}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                  form.payment_method === "cash"
                    ? "bg-amber-700 text-white border-amber-700 shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}>
                💵 نقداً
              </button>
              <button type="button"
                onClick={() => { setForm(f => ({ ...f, payment_method: "card" })); setShowCardForm(false); }}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                  form.payment_method === "card"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}>
                <CreditCard size={14} /> بطاقة
              </button>
            </div>

            {form.payment_method === "cash" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                <div className="flex items-start gap-2">
                  <span className="text-base flex-shrink-0">💵</span>
                  <div>
                    <div className="font-bold mb-0.5">الدفع النقدي يحتاج موافقة مسبقة</div>
                    <div>سيتم إرسال طلبك للمندوب والمدير للموافقة قبل المعالجة. سيتواصلون معك لتحديد طريقة وموعد الدفع.</div>
                  </div>
                </div>
              </div>
            )}

            {form.payment_method === "transfer" && (
              <div className="space-y-2">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 flex items-center gap-2">
                  <Banknote size={13} className="flex-shrink-0" />
                  <span>سيتم إرسال تفاصيل التحويل البنكي بعد تأكيد الطلب من قِبَل المراجع</span>
                </div>
                <input aria-label="رفع إيصال التحويل (اختياري)" ref={receiptFileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => setBankReceipt(ev.target?.result as string); r.readAsDataURL(f); } }} />
                {bankReceipt ? (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    <img src={bankReceipt} alt="إيصال التحويل" className="w-full max-h-36 object-contain bg-gray-50" />
                    <button type="button" aria-label="إزالة إيصال التحويل" onClick={() => setBankReceipt("")} className="absolute top-2 left-2 p-1 bg-red-500 rounded-lg text-white"><X size={12} /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => receiptFileRef.current?.click()}
                    className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-[#103c68]/40 flex items-center justify-center gap-2">
                    <Upload size={13} /> رفع إيصال التحويل (اختياري)
                  </button>
                )}
              </div>
            )}

            {form.payment_method === "card" && !showCardForm && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700 flex items-center gap-2">
                <Lock size={13} className="flex-shrink-0" />
                <span>ستنتقل لإدخال بيانات بطاقتك عند الضغط على "إرسال الطلب" — الدفع آمن ومشفر</span>
              </div>
            )}

            {form.payment_method === "card" && showCardForm && (
              <div className="space-y-3">
                {/* Card visual */}
                <div className="bg-gradient-to-l from-[#103c68] to-[#0d2e50] rounded-2xl p-4 text-white">
                  <div className="flex justify-between items-start mb-4">
                    <div className="text-xs opacity-70">MKGH Logistics</div>
                    <CreditCard size={20} className="opacity-80" />
                  </div>
                  <div className="font-mono text-base font-bold tracking-widest mb-3">
                    {cardForm.card_number || "•••• •••• •••• ••••"}
                  </div>
                  <div className="flex justify-between items-end text-sm">
                    <div>
                      <div className="text-xs opacity-60 mb-0.5">اسم حامل البطاقة</div>
                      <div className="font-semibold">{cardForm.card_name || "—"}</div>
                    </div>
                    <div className="text-end">
                      <div className="text-xs opacity-60 mb-0.5">انتهاء الصلاحية</div>
                      <div className="font-semibold">{cardForm.card_expiry || "MM/YY"}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="order-card-number" className="text-xs font-semibold text-gray-700 block mb-1">رقم البطاقة</label>
                  <input id="order-card-number" type="text" inputMode="numeric" placeholder="•••• •••• •••• ••••"
                    value={cardForm.card_number}
                    onChange={e => setCardForm(f => ({ ...f, card_number: formatCardNumber(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono tracking-wider text-center" />
                </div>
                <div>
                  <label htmlFor="order-card-name" className="text-xs font-semibold text-gray-700 block mb-1">اسم حامل البطاقة</label>
                  <input id="order-card-name" type="text" placeholder="الاسم كما هو على البطاقة"
                    value={cardForm.card_name}
                    onChange={e => setCardForm(f => ({ ...f, card_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="order-card-expiry" className="text-xs font-semibold text-gray-700 block mb-1">تاريخ الانتهاء</label>
                    <input id="order-card-expiry" type="text" placeholder="MM/YY" maxLength={5}
                      value={cardForm.card_expiry}
                      onChange={e => setCardForm(f => ({ ...f, card_expiry: formatExpiry(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-center font-mono" />
                  </div>
                  <div>
                    <label htmlFor="order-card-cvv" className="text-xs font-semibold text-gray-700 block mb-1">CVV</label>
                    <input id="order-card-cvv" type="password" placeholder="•••" maxLength={4}
                      value={cardForm.card_cvv}
                      onChange={e => setCardForm(f => ({ ...f, card_cvv: e.target.value.replace(/\D/g,"").slice(0,4) }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-center font-mono" />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                  <Lock size={12} className="flex-shrink-0" />
                  <span>الدفع آمن ومشفر — سيُؤكَّد طلبك تلقائياً عند اكتمال الدفع</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Submit + Draft ── */}
          <button type="submit" disabled={submitting}
            className={`w-full text-white py-4.5 rounded-2xl font-black text-base disabled:opacity-60 shadow-xl transition-all active:scale-[0.99] ${
              form.payment_method === "card" ? "bg-emerald-600 hover:bg-emerald-700" : form.payment_method === "cash" ? "bg-amber-700 hover:bg-amber-800" : "bg-[#103c68] hover:bg-[#0d2e50]"
            }`}
            style={{ paddingTop: "1.125rem", paddingBottom: "1.125rem" }}>
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {form.payment_method === "card" ? "جاري معالجة الدفع..." : "جاري إرسال الطلب..."}
              </span>
            ) : form.payment_method === "card" && !showCardForm ? (
              <span className="flex items-center justify-center gap-2">
                <CreditCard size={18} />
                التالي — إدخال بيانات البطاقة
              </span>
            ) : form.payment_method === "card" ? (
              <span className="flex items-center justify-center gap-2">
                <Lock size={18} />
                تأكيد الدفع وإرسال الطلب — {net.toFixed(2)} ر.س
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Truck size={18} />
                إرسال الطلب — {net.toFixed(2)} ر.س
              </span>
            )}
          </button>

          {/* Save as draft */}
          <button type="button" onClick={handleSaveDraft} disabled={savingDraft || submitting}
            className="w-full border-2 border-gray-200 hover:border-gray-300 text-gray-600 py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            <Bookmark size={15} />{savingDraft ? "جاري الحفظ..." : "حفظ كمسودة (إرسال لاحقاً)"}
          </button>
        </form>
      </div>

      {showGuestModal && (
        <GuestAuthModal
          onClose={() => setShowGuestModal(false)}
          message="سجّل دخولك أو أنشئ حساباً لتقديم طلبك"
        />
      )}
    </div>
  );
}
