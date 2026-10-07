import { useState, useEffect, useCallback, useRef, useId, type FC } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import { LANGUAGES } from "@/i18n/translations";
import { ThemeToggleCycle } from "@/components/ThemeToggle";
import {
  Lock, AlertCircle, Eye, EyeOff, X, Globe, User, LogIn,
  ChevronDown, Package, Star, Truck, ShieldCheck, Zap,
  Search, ShoppingCart, Weight, BoxSelect, Tag, Info,
  CheckCircle2, ChevronLeft, Menu, Phone, Mail, RefreshCw,
  Calendar, Wrench, HardHat, ArrowRight, MapPin, Locate,
  MessageCircle, Send,
} from "lucide-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const OFMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SA_CENTER: [number, number] = [43.975, 26.326]; // [lng, lat] for maplibre

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseGMapsUrl(url: string): { lat: number; lng: number } | null {
  const patterns = [
    /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
    /\/place\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  return null;
}

interface LocationPreset { label: string; location: string; lat: number; lng: number; }

interface RentalMapPickerProps {
  label: string;
  emoji: string;
  pinPos: [number, number] | null;
  address: string;
  onPick: (lat: number, lng: number, address: string) => void;
  presets?: LocationPreset[];
}
function RentalMapPicker({ label, emoji, pinPos, address, onPick, presets = [] }: RentalMapPickerProps) {
  const fieldId = useId();
  const [pasteUrl,  setPasteUrl]  = useState("");
  const [pasteErr,  setPasteErr]  = useState(false);
  const [search,    setSearch]    = useState("");
  const [results,   setResults]   = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [searching, setSearching] = useState(false);
  const [locating,  setLocating]  = useState(false);
  const [showMap,   setShowMap]   = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const markerRef       = useRef<maplibregl.Marker | null>(null);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ar`);
      const d = await r.json();
      onPick(lat, lng, d.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } catch { onPick(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`); }
  }, [onPick]);

  useEffect(() => {
    if (!showMap || !mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OFMAP_STYLE,
      center: pinPos ? [pinPos[1], pinPos[0]] : SA_CENTER,
      zoom: pinPos ? 12 : 6,
    });
    map.on("click", e => reverseGeocode(e.lngLat.lat, e.lngLat.lng));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pinPos) return;
    const lngLat: [number, number] = [pinPos[1], pinPos[0]];
    if (markerRef.current) { markerRef.current.setLngLat(lngLat); }
    else { markerRef.current = new maplibregl.Marker({ color: "#103c68" }).setLngLat(lngLat).addTo(map); }
    map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 12), duration: 600 });
  }, [pinPos]);

  const handlePaste = useCallback(async (val: string) => {
    setPasteUrl(val); setPasteErr(false);
    if (!val.trim()) return;
    const coords = parseGMapsUrl(val);
    if (coords) { await reverseGeocode(coords.lat, coords.lng); setShowMap(true); setPasteUrl(""); return; }
    if (val.includes("goo.gl") || val.includes("maps.app")) {
      try {
        const r = await fetch(`/api/portal/resolve-maps-url?url=${encodeURIComponent(val)}`);
        const d = await r.json();
        const c = d.lat ? d : (d.url ? parseGMapsUrl(d.url) : null);
        if (c?.lat) { await reverseGeocode(c.lat, c.lng); setShowMap(true); setPasteUrl(""); return; }
      } catch {}
      setPasteErr(true);
    } else if (val.length > 20) { setPasteErr(true); }
  }, [reverseGeocode]);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true); setResults([]);
    try {
      const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(search)}&limit=5&lang=ar&bbox=34.5,16.3,55.7,32.2`);
      const d = await r.json();
      const hits = (d.features ?? []).map((f: { geometry: { coordinates: number[] }; properties: Record<string, string> }) => {
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties;
        const name = [p.name, p.city || p.county, p.state].filter(Boolean).join("، ");
        return { name: name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng };
      });
      setResults(hits);
      if (hits.length === 1) { onPick(hits[0].lat, hits[0].lng, hits[0].name); setShowMap(true); setSearch(""); setResults([]); }
    } catch {} finally { setSearching(false); }
  };

  const handleGPS = () => {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      async pos => { await reverseGeocode(pos.coords.latitude, pos.coords.longitude); setLocating(false); setShowMap(true); },
      () => setLocating(false),
    );
  };

  return (
    <div className="space-y-2">
      <label htmlFor={`${fieldId}-search`} className="block text-xs font-bold text-gray-700">{emoji} {label}</label>

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map(p => (
            <button key={p.label} type="button" onClick={() => onPick(p.lat, p.lng, p.location)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                address === p.location || address.startsWith(p.label)
                  ? "bg-[#103c68] text-white border-[#103c68]"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:border-[#103c68]/40 hover:text-[#103c68]"
              }`}>
              📍 {p.label}
            </button>
          ))}
        </div>
      )}

      <div>
        <input aria-label={`رابط Google Maps — ${label} (اختياري)`} value={pasteUrl} onChange={e => handlePaste(e.target.value)} dir="ltr"
          placeholder="الصق رابط Google Maps هنا (اختياري)..."
          className={`w-full border rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 ${pasteErr ? "border-red-300 focus:ring-red-200" : "border-gray-200 focus:ring-[#103c68]/30"}`} />
        {pasteErr && <p className="text-[10px] text-red-500 mt-0.5 pr-1">لم يُتعرف على الرابط — جرب البحث أو الخريطة</p>}
      </div>

      <div className="flex gap-2">
        <input id={`${fieldId}-search`} aria-label={`البحث عن ${label}`} value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleSearch())}
          placeholder="ابحث عن مدينة أو موقع..."
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
        <button type="button" aria-label={`البحث عن ${label}`} onClick={handleSearch} disabled={searching}
          className="px-3 py-2 bg-[#103c68] text-white rounded-xl text-xs font-bold hover:bg-[#0d2e50] disabled:opacity-60 transition-colors">
          {searching ? "⏳" : "بحث"}
        </button>
        <button type="button" aria-label={`استخدام موقعي الحالي — ${label}`} onClick={handleGPS} disabled={locating} title="موقعي الحالي"
          className="px-3 py-2 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 disabled:opacity-60 transition-colors">
          <Locate size={15} className={locating ? "animate-pulse text-[#103c68]" : ""} />
        </button>
      </div>

      {results.length > 1 && (
        <div className="border border-gray-200 rounded-xl bg-white shadow-md overflow-hidden">
          {results.map((r, i) => (
            <button key={i} type="button"
              onClick={() => { onPick(r.lat, r.lng, r.name); setShowMap(true); setSearch(""); setResults([]); }}
              className="w-full text-right px-3 py-2 text-sm hover:bg-[#103c68]/5 border-b border-gray-100 last:border-0 flex items-center gap-2">
              <MapPin size={11} className="text-[#103c68] flex-shrink-0" />
              <span className="truncate">{r.name}</span>
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setShowMap(v => !v)}
        className="text-xs text-[#103c68] font-semibold flex items-center gap-1 hover:underline">
        <MapPin size={11} /> {showMap ? "إخفاء الخريطة" : "اختر من الخريطة ▸"}
      </button>

      {showMap && (
        <div ref={mapContainerRef} className="rounded-xl overflow-hidden border border-gray-200"
          style={{ height: 200, width: "100%" }} />
      )}

      {address ? (
        <div className="bg-[#103c68]/5 border border-[#103c68]/20 rounded-xl px-3 py-2 text-xs text-[#103c68] flex items-start gap-1.5">
          <MapPin size={11} className="flex-shrink-0 mt-0.5" />
          <span className="line-clamp-2">{address}</span>
          <button type="button" aria-label={`مسح ${label}`} onClick={() => onPick(0, 0, "")} className="mr-auto text-gray-400 hover:text-red-400 flex-shrink-0">
            <X size={10} />
          </button>
        </div>
      ) : (
        <textarea aria-label={`العنوان اليدوي — ${label}`} placeholder="أو أدخل العنوان يدوياً..." rows={1}
          onChange={e => onPick(0, 0, e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none" />
      )}
    </div>
  );
}

/* ────────────────────────── Types ──────────────────────────── */
interface ProductPreview {
  id: number; name: string; description?: string; image_url?: string;
  avg_rating?: number; review_count?: number; category?: string;
  price_per_unit?: number; unit?: string; price_locked?: number;
}
interface ProductFull extends ProductPreview {
  price_delivered?: number; price_truck_buraydah?: number;
  packaging_type?: string; weight_kg?: number; stock?: number;
  ratings?: Array<{ customer_name?: string; rating: number; comment?: string }>;
  price_locked?: number;
}

/* ────────────────────────── Stars ──────────────────────────── */
function Stars({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={size}
          className={i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-gray-200 fill-gray-200"} />
      ))}
    </div>
  );
}

/* ──────────────── Product Detail Modal ─────────────────────── */
function ProductDetailModal({ productId, onClose, onOrder, priceLocked, quoteAction, onWhatsappOrder }: {
  productId: number; onClose: () => void; onOrder: () => void; priceLocked?: boolean;
  quoteAction?: string; onWhatsappOrder?: () => void;
}) {
  const [product, setProduct] = useState<ProductFull | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/products/${productId}`)
      .then(r => r.json())
      .then(d => { setProduct(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [productId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <button aria-label="إغلاق تفاصيل المنتج" onClick={onClose}
          className="absolute top-3 left-3 z-10 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors">
          <X size={15} className="text-gray-600" />
        </button>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-[#103c68] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !product ? (
          <div className="flex items-center justify-center h-64 text-gray-400">خطأ في التحميل</div>
        ) : (
          <>
            <div className="relative w-full h-52 bg-gradient-to-br from-slate-100 to-slate-200 flex-shrink-0">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package size={56} className="text-slate-300" />
                </div>
              )}
              {product.category && (
                <span className="absolute bottom-3 right-3 bg-[#103c68] text-white text-xs font-bold px-3 py-1 rounded-full">
                  {product.category}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <h2 className="text-xl font-black text-gray-900">{product.name}</h2>
                {(product.avg_rating ?? 0) > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <Stars rating={product.avg_rating!} size={13} />
                    <span className="text-sm font-bold text-amber-600">{Number(product.avg_rating).toFixed(1)}</span>
                    <span className="text-xs text-gray-400">({product.review_count} تقييم)</span>
                  </div>
                )}
              </div>
              {product.description && <p className="text-gray-500 text-sm leading-relaxed">{product.description}</p>}

              <div className="grid grid-cols-2 gap-2">
                {product.unit && (
                  <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
                    <BoxSelect size={15} className="text-[#103c68]" />
                    <div><div className="text-xs text-gray-400">الوحدة</div><div className="font-bold text-sm">{product.unit}</div></div>
                  </div>
                )}
                {(product.weight_kg ?? 0) > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
                    <Weight size={15} className="text-[#103c68]" />
                    <div><div className="text-xs text-gray-400">الوزن</div><div className="font-bold text-sm">{product.weight_kg} كجم</div></div>
                  </div>
                )}
                {product.packaging_type && (
                  <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
                    <Tag size={15} className="text-[#103c68]" />
                    <div><div className="text-xs text-gray-400">النوع</div><div className="font-bold text-sm">{product.packaging_type === "سائب" ? "🚛 سائب" : "📦 معبأ"}</div></div>
                  </div>
                )}
                {(product.stock ?? 0) > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
                    <Info size={15} className="text-[#103c68]" />
                    <div><div className="text-xs text-gray-400">المخزون</div><div className="font-bold text-sm">{product.stock?.toLocaleString("ar-SA")}</div></div>
                  </div>
                )}
              </div>

              {priceLocked ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 flex items-center gap-3 text-gray-400">
                  <span className="text-xl">🔒</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-600">الأسعار غير معروضة حالياً</div>
                    <div className="text-xs mt-0.5">تواصل معنا للاستفسار عن الأسعار</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500">الأسعار (ريال سعودي)</div>
                  {[
                    { label: "💰 للحبة", sub: "ارض البرحة", val: product.price_per_unit, color: "text-[#103c68]" },
                    { label: "🚚 واصل", sub: "توصيل للعميل", val: product.price_delivered, color: "text-green-600" },
                    { label: "🏭 ترلة بريدة", sub: "سعر الترلة الكاملة", val: product.price_truck_buraydah, color: "text-purple-600" },
                  ].filter(r => (r.val ?? 0) > 0).map(row => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-3 border-t border-gray-100 first:border-t-0">
                      <div>
                        <div className="text-sm font-semibold text-gray-700">{row.label}</div>
                        <div className="text-xs text-gray-400">{row.sub}</div>
                      </div>
                      <div className={`text-lg font-black ${row.color}`}>
                        {row.val?.toLocaleString("ar-SA")}
                        <span className="text-xs font-normal text-gray-400 mr-1">ر.س</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {product.ratings && product.ratings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500">آراء العملاء</p>
                  {product.ratings.slice(0, 3).map((r, i) => (
                    <div key={i} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Stars rating={r.rating} size={11} />
                        <span className="text-xs text-gray-500">{r.customer_name || "عميل"}</span>
                      </div>
                      {r.comment && <p className="text-xs text-gray-600">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-100 flex gap-3">
              <button onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200">
                إغلاق
              </button>
              {quoteAction === "whatsapp" ? (
                <button onClick={onWhatsappOrder}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-center gap-1.5">
                  <Send size={14} /> اطلب الآن 📩
                </button>
              ) : (
                <button onClick={onOrder}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors">
                  اطلب الآن
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ──────────────── Login Modal ───────────────────────────────── */
function LoginModal({ onClose, onLogin, onGuest }: {
  onClose: () => void;
  onLogin: (id: string, pw: string, otp?: string) => Promise<void>;
  onGuest: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password,   setPassword]   = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [error,      setError]      = useState("");
  const [loading,    setLoading]    = useState(false);

  const [showReg,    setShowReg]    = useState(() => new URLSearchParams(window.location.search).get("register") === "1");
  const [reps,       setReps]       = useState<Array<{id:number;name:string;phone:string}>>([]);
  const [regForm,    setRegForm]    = useState({ name:"", phone:"", password:"", rep_phone:"" });
  const [regLoading, setRegLoading] = useState(false);
  const [regError,   setRegError]   = useState("");
  const [regSuccess, setRegSuccess] = useState("");
  const [forgot, setForgot] = useState(false);
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [recoveryStep, setRecoveryStep] = useState<"phone" | "code">("phone");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const recoveryRequest = async (path: string, body: Record<string, string>) => {
    const response = await fetch(`/api/auth/forgot-password/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as { error?: string; phone?: string };
    if (!response.ok) throw new Error(result.error || "تعذر الاتصال، حاول مجددًا");
    return result;
  };

  const requestRecoveryCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setRecoveryBusy(true); setRecoveryError("");
    try {
      await recoveryRequest("request-otp", { phone: recoveryPhone.trim() });
      setRecoveryStep("code");
    } catch (err) { setRecoveryError((err as Error).message); }
    finally { setRecoveryBusy(false); }
  };

  const resetForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryBusy(true); setRecoveryError("");
    try {
      const result = await recoveryRequest("reset", {
        phone: recoveryPhone.trim(),
        otp: recoveryCode.trim(),
        new_password: recoveryPassword,
      });
      setIdentifier(result.phone || recoveryPhone.trim());
      setPassword("");
      setRegSuccess("تم تعيين كلمة سر جديدة. سجل الدخول بها الآن.");
      setForgot(false);
      setRecoveryCode("");
      setRecoveryPassword("");
      setRecoveryStep("phone");
    } catch (err) { setRecoveryError((err as Error).message); }
    finally { setRecoveryBusy(false); }
  };

  const loadReps = async () => {
    try { const r = await fetch("/api/admin/reps"); if (r.ok) setReps(await r.json()); } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { await onLogin(identifier.trim(), password); }
    catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!regForm.name || !regForm.phone || !regForm.password) { setRegError("يرجى تعبئة الاسم والجوال وكلمة المرور"); return; }
    setRegLoading(true); setRegError(""); setRegSuccess("");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...regForm, role: "customer" }),
        signal: ctrl.signal,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "حدث خطأ");
      setRegSuccess("تم إنشاء الحساب! يمكنك الدخول الآن");
      setIdentifier(regForm.phone);
      setShowReg(false);
    } catch (e: any) {
      setRegError(e?.name === "AbortError" ? "تعذر الاتصال بالخادم، حاول مجدداً" : (e as Error).message);
    } finally {
      clearTimeout(timer);
      setRegLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="bg-[#103c68] px-6 py-5">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-black text-lg">{forgot ? "نسيت كلمة السر" : showReg ? "حساب جديد" : "تسجيل الدخول"}</h2>
            <button aria-label="إغلاق نافذة الدخول والتسجيل" onClick={onClose} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
              <X size={15} className="text-white" />
            </button>
          </div>
          <p className="text-white/60 text-xs mt-1">{forgot ? "استعد الدخول باستخدام رقم جوالك المسجّل" : showReg ? "أنشئ حساب عميل جديد" : "أدخل بياناتك للوصول إلى حسابك"}</p>
        </div>

        <div className="p-6 space-y-4">
          {forgot ? (
            <div dir="rtl">
              <p className="text-sm text-gray-600 mb-4">
                {recoveryStep === "phone" ? "أدخل رقم الجوال المسجّل في حسابك لإرسال رمز التحقق." : "أدخل الرمز المرسل لجوالك وكلمة السر الجديدة. الرمز صالح لمدة 5 دقائق."}
              </p>
              {recoveryError && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-2.5 mb-3">{recoveryError}</div>}
              <form onSubmit={recoveryStep === "phone" ? requestRecoveryCode : resetForgotPassword} className="space-y-3">
                <input type="tel" placeholder="رقم الجوال المسجّل" aria-label="رقم الجوال المسجّل"
                  value={recoveryPhone} onChange={e => setRecoveryPhone(e.target.value)}
                  autoComplete="tel" dir="ltr" required disabled={recoveryStep === "code"}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 disabled:opacity-70" />
                {recoveryStep === "code" && (
                  <>
                    <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                      placeholder="رمز التحقق (6 أرقام)" aria-label="رمز التحقق" autoComplete="one-time-code"
                      value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} dir="ltr" required
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                    <input type="password" minLength={8} placeholder="كلمة سر جديدة (8 أحرف على الأقل)"
                      aria-label="كلمة سر جديدة" autoComplete="new-password" required
                      value={recoveryPassword} onChange={e => setRecoveryPassword(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                  </>
                )}
                <button type="submit" disabled={recoveryBusy}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#103c68] hover:bg-[#0d2e50] disabled:opacity-40">
                  {recoveryBusy ? "جاري الإرسال..." : recoveryStep === "phone" ? "إرسال رمز التحقق" : "تعيين كلمة سر جديدة"}
                </button>
              </form>
              {recoveryStep === "code" && (
                <div className="flex items-center justify-between mt-3 text-xs">
                  <button type="button" disabled={recoveryBusy} onClick={() => { setRecoveryStep("phone"); setRecoveryError(""); }}
                    className="text-[#103c68] hover:underline">تغيير رقم الجوال</button>
                  <button type="button" disabled={recoveryBusy} onClick={() => void requestRecoveryCode()}
                    className="text-[#103c68] hover:underline">إعادة إرسال الرمز</button>
                </div>
              )}
              <button type="button" onClick={() => { setForgot(false); setRecoveryError(""); }}
                className="block mx-auto mt-5 text-sm text-gray-500 hover:text-[#103c68]">العودة لتسجيل الدخول</button>
            </div>
          ) : !showReg ? (
            <>
              {regSuccess && <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl p-2.5">{regSuccess}</div>}
              <form onSubmit={handleSubmit} className="space-y-3">
                {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-2.5">{error}</div>}
                <div className="relative">
                  <User size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" aria-label="رقم الجوال أو اسم المستخدم" placeholder="رقم الجوال أو اسم المستخدم" value={identifier}
                    onChange={e => setIdentifier(e.target.value)} required
                    className="w-full border border-gray-200 rounded-xl pr-9 pl-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
                <div className="relative">
                  <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type={showPw ? "text" : "password"} aria-label="كلمة المرور" placeholder="كلمة المرور" value={password}
                    onChange={e => setPassword(e.target.value)} required
                    className="w-full border border-gray-200 rounded-xl pr-9 pl-10 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={showPw}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button type="button" onClick={() => {
                  setRecoveryPhone(identifier);
                  setRecoveryStep("phone");
                  setRecoveryError("");
                  setForgot(true);
                }} className="text-xs font-semibold text-[#103c68] hover:underline">نسيت كلمة السر؟</button>
                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#103c68] hover:bg-[#0d2e50] disabled:opacity-40 flex items-center justify-center gap-2">
                  {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />جاري الدخول...</> : <><LogIn size={15} />دخول</>}
                </button>
              </form>
              <div className="text-center">
                <button onClick={() => { setShowReg(true); if (!reps.length) loadReps(); }}
                  className="text-sm text-gray-400 hover:text-gray-600">
                  لا تملك حساباً؟ <span className="text-[#103c68] font-bold">سجل الآن</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {regError && <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-2.5">{regError}</div>}
              <div className="space-y-3">
                {[
                  { k: "name",     p: "الاسم الكامل *",           t: "text"    },
                  { k: "phone",    p: "رقم الجوال * (05XXXXXXXX)", t: "tel"     },
                  { k: "password", p: "كلمة المرور *",             t: "password"},
                ].map(f => (
                  <input key={f.k} type={f.t} aria-label={f.p} placeholder={f.p}
                    value={regForm[f.k as keyof typeof regForm]}
                    onChange={e => setRegForm(r => ({ ...r, [f.k]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                ))}
                {reps.length > 0 && (
                  <select aria-label="المندوب (اختياري)" value={regForm.rep_phone} onChange={e => setRegForm(f => ({ ...f, rep_phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50">
                    <option value="">المندوب (اختياري)</option>
                    {reps.map(r => <option key={r.phone} value={r.phone}>{r.name}</option>)}
                  </select>
                )}
                <button onClick={handleRegister} disabled={regLoading || !regForm.name || !regForm.phone || !regForm.password}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white bg-orange-700 hover:bg-orange-800 disabled:opacity-40 flex items-center justify-center gap-2">
                  {regLoading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />جاري التسجيل...</> : "إنشاء الحساب"}
                </button>
              </div>
              <div className="text-center">
                <button onClick={() => setShowReg(false)} className="text-sm text-gray-400 hover:text-gray-600">
                  لديك حساب؟ <span className="text-[#103c68] font-bold">سجل الدخول</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Hero Photo Slideshow Background ───────────── */
const HERO_SLIDES = [
  { url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1920&q=80", kb: "kenBurns0", pos: "center 60%" },
  { url: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1920&q=80", kb: "kenBurns1", pos: "center 40%" },
  { url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1920&q=80", kb: "kenBurns2", pos: "center 50%" },
  { url: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=1920&q=80", kb: "kenBurns3", pos: "center 55%" },
];


const _OLD_ConstructionBackground_UNUSED: FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;
    let truckX = -250;

    const particles = Array.from({ length: 35 }, (_, i) => ({
      x: Math.random() * 1400,
      y: Math.random() * 400,
      size: Math.random() * 2.5 + 0.8,
      speed: Math.random() * 0.4 + 0.15,
      opacity: Math.random() * 0.25 + 0.08,
      hue: i % 4 === 0 ? "orange" : "navy",
    }));

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function drawGrid(c: CanvasRenderingContext2D) {
      c.save();
      c.globalAlpha = 0.035;
      c.strokeStyle = "#103c68";
      c.lineWidth = 1;
      const s = 44;
      for (let x = 0; x < canvas!.width; x += s) {
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, canvas!.height); c.stroke();
      }
      for (let y = 0; y < canvas!.height; y += s) {
        c.beginPath(); c.moveTo(0, y); c.lineTo(canvas!.width, y); c.stroke();
      }
      c.restore();
    }

    function drawSkyline(c: CanvasRenderingContext2D) {
      const W = canvas!.width, H = canvas!.height;
      const bldgs = [
        [0.04, 0.07, 0.38], [0.12, 0.05, 0.52], [0.18, 0.06, 0.32],
        [0.25, 0.08, 0.60], [0.34, 0.04, 0.28], [0.68, 0.08, 0.48],
        [0.77, 0.05, 0.55], [0.83, 0.07, 0.38], [0.91, 0.05, 0.45],
      ];
      bldgs.forEach(([bx, bw, bh]) => {
        const rx = bx * W, rw = bw * W, rh = bh * H, ry = H - rh;
        c.save();
        c.globalAlpha = 0.07;
        c.fillStyle = "#103c68";
        c.fillRect(rx, ry, rw, rh);
        // windows
        c.globalAlpha = 0.12;
        c.fillStyle = "#f97316";
        for (let wy = ry + 12; wy < H - 10; wy += 18) {
          for (let wx = rx + 6; wx < rx + rw - 6; wx += 13) {
            if (Math.sin(wx * 0.3 + wy * 0.2) > 0.1) c.fillRect(wx, wy, 7, 9);
          }
        }
        c.restore();
      });
    }

    function drawCrane(c: CanvasRenderingContext2D, time: number) {
      const W = canvas!.width, H = canvas!.height;
      const cx = W * 0.62, cy = H;
      const mast = H * 0.58, arm = W * 0.2;
      const swing = Math.sin(time * 0.4) * 0.06;
      const hookDrop = 0.22 + Math.sin(time * 0.25) * 0.06;

      c.save();
      c.globalAlpha = 0.16;
      c.strokeStyle = "#103c68";
      c.lineWidth = 3;
      c.lineCap = "round";

      // mast
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - mast); c.stroke();
      // lattice
      c.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const y1 = cy - (mast * i) / 6, y2 = cy - (mast * (i + 1)) / 6;
        c.beginPath(); c.moveTo(cx - 10, y1); c.lineTo(cx + 10, y2); c.stroke();
        c.beginPath(); c.moveTo(cx + 10, y1); c.lineTo(cx - 10, y2); c.stroke();
      }

      // jib arm (rotates slightly)
      c.save();
      c.translate(cx, cy - mast);
      c.rotate(swing);
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(-arm * 0.28, 0); c.lineTo(arm * 0.72, 0); c.stroke();
      // cable support
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(arm * 0.72, 0); c.stroke();
      // counter-weight
      c.fillStyle = "#103c68";
      c.fillRect(-arm * 0.28 - 20, -8, 24, 16);
      // hook cable
      const hx = arm * 0.55;
      const hy = H * hookDrop;
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(hx, 0); c.lineTo(hx, hy); c.stroke();
      // hook
      c.lineWidth = 2;
      c.strokeStyle = "#f97316";
      c.beginPath(); c.arc(hx, hy + 7, 7, 0, Math.PI * 2); c.stroke();
      c.restore();

      // concrete block hanging
      c.globalAlpha = 0.12;
      c.fillStyle = "#103c68";
      const bx = cx + arm * 0.55 * Math.cos(swing) - 18;
      const bBlockY = cy - mast + H * hookDrop + 16;
      c.fillRect(bx, bBlockY, 36, 22);

      c.restore();
    }

    function drawTruck(c: CanvasRenderingContext2D, x: number) {
      const W = canvas!.width, H = canvas!.height;
      const y = H - 22, s = 0.85;
      c.save();
      c.globalAlpha = 0.22;
      c.translate(x, y);
      c.scale(-s, s); // mirror → moves right-to-left

      // trailer
      c.fillStyle = "#1e3a5f";
      c.beginPath();
      c.roundRect(0, -38, 100, 38, 4);
      c.fill();
      // cargo stripes
      c.fillStyle = "#f97316";
      c.fillRect(8, -26, 84, 7);
      // cab
      c.fillStyle = "#103c68";
      c.beginPath();
      c.roundRect(100, -48, 52, 48, [4, 10, 4, 4]);
      c.fill();
      // windshield
      c.fillStyle = "rgba(186,230,253,0.7)";
      c.beginPath();
      c.roundRect(104, -44, 40, 22, 4);
      c.fill();
      // grill
      c.fillStyle = "#f97316";
      c.fillRect(148, -20, 8, 18);
      // wheels
      [[18, 4], [56, 4], [108, 4], [130, 4]].forEach(([wx, wy]) => {
        c.fillStyle = "#0f172a";
        c.beginPath(); c.arc(wx, wy, 14, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#334155";
        c.beginPath(); c.arc(wx, wy, 7, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(255,255,255,0.3)";
        c.beginPath(); c.arc(wx, wy, 3, 0, Math.PI * 2); c.fill();
      });
      // exhaust
      c.globalAlpha = 0.18;
      for (let i = 0; i < 3; i++) {
        c.fillStyle = "#94a3b8";
        c.beginPath();
        c.arc(152 + i * 12, -55 - i * 8, 4 + i * 2, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();

      // road dust
      c.save();
      c.globalAlpha = 0.06;
      for (let i = 0; i < 4; i++) {
        c.fillStyle = "#94a3b8";
        c.beginPath();
        c.arc(x + 160 * s + i * 18, y - 8 - i * 5, 6 + i * 3, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    function drawCementBags(c: CanvasRenderingContext2D, time: number) {
      const W = canvas!.width, H = canvas!.height;
      const bags = [
        { bx: W * 0.08, by: H - 55, phase: 0 },
        { bx: W * 0.14, by: H - 68, phase: 1.2 },
        { bx: W * 0.10, by: H - 80, phase: 2.4 },
        { bx: W * 0.88, by: H - 55, phase: 0.8 },
        { bx: W * 0.93, by: H - 68, phase: 2.1 },
      ];
      bags.forEach(({ bx, by, phase }) => {
        const sway = Math.sin(time * 0.6 + phase) * 2;
        c.save();
        c.globalAlpha = 0.14;
        c.translate(bx + sway, by);
        c.fillStyle = "#e2e8f0";
        c.beginPath();
        c.roundRect(-18, -14, 36, 28, 6);
        c.fill();
        c.fillStyle = "#103c68";
        c.globalAlpha = 0.22;
        c.font = "bold 8px sans-serif";
        c.textAlign = "center";
        c.fillText("CEMENT", 0, 4);
        c.restore();
      });
    }

    function drawParticles(c: CanvasRenderingContext2D, time: number) {
      const H = canvas!.height;
      particles.forEach(p => {
        p.y -= p.speed;
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * canvas!.width; }
        c.save();
        c.globalAlpha = p.opacity * (0.7 + 0.3 * Math.sin(time * 1.5 + p.x * 0.05));
        c.fillStyle = p.hue === "orange" ? "#f97316" : "#103c68";
        c.beginPath();
        c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        c.fill();
        c.restore();
      });
    }

    function drawGround(c: CanvasRenderingContext2D) {
      const W = canvas!.width, H = canvas!.height;
      const grad = c.createLinearGradient(0, H - 6, 0, H);
      grad.addColorStop(0, "rgba(16,60,104,0.18)");
      grad.addColorStop(1, "rgba(16,60,104,0.06)");
      c.fillStyle = grad;
      c.fillRect(0, H - 6, W, 6);
      // road markings
      c.save();
      c.globalAlpha = 0.06;
      c.strokeStyle = "#f97316";
      c.setLineDash([30, 25]);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, H - 3); c.lineTo(W, H - 3);
      c.stroke();
      c.restore();
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid(ctx);
      drawSkyline(ctx);
      drawCrane(ctx, t);
      drawCementBags(ctx, t);
      drawGround(ctx);
      truckX += 1.8;
      if (truckX > canvas.width + 250) truckX = -250;
      drawTruck(ctx, truckX);
      drawParticles(ctx, t);
      t += 0.018;
      animId = requestAnimationFrame(draw);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    draw();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} />;
};

/* ──────────────── Dark Canvas Background ───────────────────── */
const DarkCanvasBackground: FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;
    let truckX = -280;

    const particles = Array.from({ length: 55 }, (_, i) => ({
      x: Math.random() * 1400,
      y: Math.random() * 500,
      size: Math.random() * 1.8 + 0.5,
      speed: Math.random() * 0.35 + 0.1,
      opacity: Math.random() * 0.5 + 0.1,
      type: i % 5 === 0 ? "blue" : "white",
    }));

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function drawGrid(c: CanvasRenderingContext2D) {
      c.save();
      c.globalAlpha = 0.04;
      c.strokeStyle = "rgba(255,255,255,1)";
      c.lineWidth = 1;
      const s = 44;
      for (let x = 0; x < canvas!.width; x += s) {
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, canvas!.height); c.stroke();
      }
      for (let y = 0; y < canvas!.height; y += s) {
        c.beginPath(); c.moveTo(0, y); c.lineTo(canvas!.width, y); c.stroke();
      }
      c.restore();
    }

    function drawSkyline(c: CanvasRenderingContext2D) {
      const W = canvas!.width, H = canvas!.height;
      const bldgs = [
        [0.04, 0.07, 0.38], [0.12, 0.05, 0.52], [0.18, 0.06, 0.32],
        [0.25, 0.08, 0.60], [0.34, 0.04, 0.28], [0.68, 0.08, 0.48],
        [0.77, 0.05, 0.55], [0.83, 0.07, 0.38], [0.91, 0.05, 0.45],
      ];
      bldgs.forEach(([bx, bw, bh]) => {
        const rx = bx * W, rw = bw * W, rh = bh * H, ry = H - rh;
        c.save();
        c.globalAlpha = 1;
        c.fillStyle = "rgba(255,255,255,0.05)";
        c.fillRect(rx, ry, rw, rh);
        c.strokeStyle = "rgba(255,255,255,0.1)";
        c.lineWidth = 0.5;
        c.strokeRect(rx, ry, rw, rh);
        // windows
        for (let wy = ry + 12; wy < H - 10; wy += 18) {
          for (let wx = rx + 6; wx < rx + rw - 6; wx += 13) {
            if (Math.sin(wx * 0.3 + wy * 0.2) > 0.1) {
              c.globalAlpha = Math.random() > 0.1 ? 0.35 : 0.65;
              c.fillStyle = Math.random() > 0.3 ? "rgba(255,240,180,1)" : "rgba(180,220,255,1)";
              c.fillRect(wx, wy, 7, 9);
            }
          }
        }
        c.restore();
      });
    }

    function drawCrane(c: CanvasRenderingContext2D, time: number) {
      const W = canvas!.width, H = canvas!.height;
      const cx = W * 0.62, cy = H;
      const mast = H * 0.58, arm = W * 0.2;
      const swing = Math.sin(time * 0.4) * 0.06;
      const hookDrop = 0.22 + Math.sin(time * 0.25) * 0.06;

      c.save();
      c.globalAlpha = 0.55;
      c.strokeStyle = "rgba(255,255,255,0.35)";
      c.lineWidth = 3;
      c.lineCap = "round";

      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - mast); c.stroke();
      c.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const y1 = cy - (mast * i) / 6, y2 = cy - (mast * (i + 1)) / 6;
        c.beginPath(); c.moveTo(cx - 10, y1); c.lineTo(cx + 10, y2); c.stroke();
        c.beginPath(); c.moveTo(cx + 10, y1); c.lineTo(cx - 10, y2); c.stroke();
      }

      c.save();
      c.translate(cx, cy - mast);
      c.rotate(swing);
      c.lineWidth = 3;
      c.strokeStyle = "rgba(255,255,255,0.4)";
      c.beginPath(); c.moveTo(-arm * 0.28, 0); c.lineTo(arm * 0.72, 0); c.stroke();
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(arm * 0.72, 0); c.stroke();
      c.fillStyle = "rgba(255,255,255,0.2)";
      c.fillRect(-arm * 0.28 - 20, -8, 24, 16);
      const hx = arm * 0.55;
      const hy = H * hookDrop;
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(hx, 0); c.lineTo(hx, hy); c.stroke();
      c.lineWidth = 2;
      c.strokeStyle = "#f97316";
      c.beginPath(); c.arc(hx, hy + 7, 7, 0, Math.PI * 2); c.stroke();
      c.restore();

      c.globalAlpha = 0.2;
      c.fillStyle = "rgba(255,255,255,0.3)";
      const bBlockX = cx + arm * 0.55 * Math.cos(swing) - 18;
      const bBlockY = cy - mast + H * hookDrop + 16;
      c.fillRect(bBlockX, bBlockY, 36, 22);
      c.restore();
    }

    function drawTruck(c: CanvasRenderingContext2D, x: number) {
      const W = canvas!.width, H = canvas!.height;
      const y = H - 28, s = 0.85;
      c.save();
      c.globalAlpha = 0.75;
      c.translate(x, y);
      c.scale(-s, s);

      // trailer
      c.fillStyle = "rgba(20,40,80,0.95)";
      c.beginPath(); c.roundRect(0, -38, 100, 38, 4); c.fill();
      c.strokeStyle = "rgba(255,255,255,0.12)";
      c.lineWidth = 0.5;
      c.strokeRect(0, -38, 100, 38);
      // cargo stripe
      c.fillStyle = "#f97316"; c.globalAlpha = 0.8;
      c.fillRect(8, -26, 84, 7);
      c.globalAlpha = 0.75;
      // cab
      c.fillStyle = "rgba(10,30,70,0.98)";
      c.beginPath(); c.roundRect(100, -48, 52, 48, [4, 10, 4, 4]); c.fill();
      // windshield
      c.fillStyle = "rgba(100,160,255,0.2)";
      c.beginPath(); c.roundRect(104, -44, 40, 22, 4); c.fill();
      // headlight glow
      c.save();
      const grad = c.createRadialGradient(151, -10, 0, 151, -10, 28);
      grad.addColorStop(0, "rgba(255,230,150,1)");
      grad.addColorStop(0.25, "rgba(255,210,80,0.5)");
      grad.addColorStop(1, "rgba(255,200,80,0)");
      c.globalAlpha = 0.85;
      c.fillStyle = grad;
      c.beginPath(); c.arc(151, -10, 28, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      c.fillStyle = "rgba(255,245,210,1)";
      c.beginPath(); c.arc(151, -10, 4, 0, Math.PI * 2); c.fill();
      c.restore();
      // light beam on road
      c.save();
      c.globalAlpha = 0.06;
      const beamGrad = c.createLinearGradient(-W * 0.25, 0, 151, -8);
      beamGrad.addColorStop(0, "rgba(255,230,150,0)");
      beamGrad.addColorStop(1, "rgba(255,230,150,0.8)");
      c.fillStyle = beamGrad;
      c.beginPath();
      c.moveTo(151, -12); c.lineTo(-W * 0.25, 5); c.lineTo(-W * 0.25, -5); c.closePath();
      c.fill();
      c.restore();
      // grill
      c.globalAlpha = 0.75;
      c.fillStyle = "#f97316"; c.fillRect(148, -20, 8, 18);
      // wheels
      [[18, 4], [56, 4], [108, 4], [130, 4]].forEach(([wx, wy]) => {
        c.fillStyle = "#020810";
        c.beginPath(); c.arc(wx, wy, 14, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "rgba(255,255,255,0.15)";
        c.lineWidth = 1;
        c.beginPath(); c.arc(wx, wy, 14, 0, Math.PI * 2); c.stroke();
        c.fillStyle = "rgba(60,90,130,0.9)";
        c.beginPath(); c.arc(wx, wy, 7, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(255,255,255,0.45)";
        c.beginPath(); c.arc(wx, wy, 3, 0, Math.PI * 2); c.fill();
      });
      c.restore();
    }

    function drawParticles(c: CanvasRenderingContext2D, time: number) {
      const H = canvas!.height;
      particles.forEach(p => {
        p.y -= p.speed;
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * canvas!.width; }
        c.save();
        c.globalAlpha = p.opacity * (0.6 + 0.4 * Math.sin(time * 1.5 + p.x * 0.05));
        c.fillStyle = p.type === "blue" ? "rgba(100,160,255,0.9)" : "#ffffff";
        c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
        if (p.size > 1.4) {
          c.globalAlpha *= 0.25;
          c.beginPath(); c.arc(p.x, p.y, p.size * 2.8, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      });
    }

    function drawGround(c: CanvasRenderingContext2D) {
      const W = canvas!.width, H = canvas!.height;
      const roadGrad = c.createLinearGradient(0, H - 30, 0, H);
      roadGrad.addColorStop(0, "rgba(8,18,42,0.98)");
      roadGrad.addColorStop(1, "rgba(4,13,30,1)");
      c.fillStyle = roadGrad;
      c.fillRect(0, H - 30, W, 30);
      c.save();
      c.globalAlpha = 0.3;
      c.strokeStyle = "rgba(255,255,255,0.35)";
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, H - 30); c.lineTo(W, H - 30); c.stroke();
      c.restore();
      // center dashes
      c.save();
      c.globalAlpha = 0.15;
      c.strokeStyle = "rgba(255,220,80,0.9)";
      c.setLineDash([30, 25]);
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, H - 15); c.lineTo(W, H - 15); c.stroke();
      c.restore();
      // wet road reflection
      c.save();
      c.globalAlpha = 0.06;
      const reflGrad = c.createLinearGradient(0, H - 30, 0, H);
      reflGrad.addColorStop(0, "rgba(80,130,255,0.8)");
      reflGrad.addColorStop(1, "rgba(80,130,255,0)");
      c.fillStyle = reflGrad;
      c.fillRect(0, H - 30, W, 30);
      c.restore();
    }

    function drawBottomBar(c: CanvasRenderingContext2D) {
      const W = canvas!.width, H = canvas!.height;
      const barGrad = c.createLinearGradient(0, 0, W, 0);
      barGrad.addColorStop(0,   "rgba(255,200,80,0)");
      barGrad.addColorStop(0.15,"rgba(255,215,100,0.7)");
      barGrad.addColorStop(0.5, "rgba(255,225,120,1)");
      barGrad.addColorStop(0.85,"rgba(255,215,100,0.7)");
      barGrad.addColorStop(1,   "rgba(255,200,80,0)");
      c.save();
      c.fillStyle = barGrad;
      c.fillRect(0, H - 2, W, 2);
      const glowGrad = c.createLinearGradient(0, H - 20, 0, H - 2);
      glowGrad.addColorStop(0, "rgba(255,200,80,0)");
      glowGrad.addColorStop(1, "rgba(255,200,80,0.15)");
      c.fillStyle = glowGrad;
      c.fillRect(0, H - 20, W, 18);
      c.restore();
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.fillStyle = "#040d1e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawGrid(ctx);
      drawSkyline(ctx);
      drawCrane(ctx, t);
      drawGround(ctx);
      truckX += 1.8;
      if (truckX > canvas.width + 280) truckX = -280;
      drawTruck(ctx, truckX);
      drawParticles(ctx, t);
      drawBottomBar(ctx);
      t += 0.018;
      animId = requestAnimationFrame(draw);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    draw();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} />;
};

const ConstructionBackground: FC = () => {
  const [cur, setCur] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCur(c => (c + 1) % HERO_SLIDES.length), 6500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ pointerEvents: "none" }}>
      {HERO_SLIDES.map((slide, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${slide.url})`,
            backgroundSize: "cover",
            backgroundPosition: slide.pos,
            opacity: i === cur ? 1 : 0,
            transition: "opacity 2s ease-in-out",
            animation: i === cur ? `${slide.kb} 12s ease-in-out forwards` : "none",
          }}
        />
      ))}
      {/* White radial overlay — keeps center text readable, photo shows at edges */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 80% 80% at 50% 48%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 40%, rgba(255,255,255,0.40) 72%, rgba(16,60,104,0.10) 100%)",
      }} />
      {/* Bottom blend to white */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "30%",
        background: "linear-gradient(to bottom, transparent, white)",
      }} />
      {/* Top blend */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "18%",
        background: "linear-gradient(to top, transparent, rgba(255,255,255,0.85))",
      }} />
    </div>
  );
};


/* ──────────────── Language Switcher ────────────────────────── */
function LangSwitcher() {
  const { lang, setLang } = useLang();
  const [open, setOpen]   = useState(false);
  const [q,    setQ]      = useState("");
  const inputRef          = useRef<HTMLInputElement>(null);
  const current           = LANGUAGES.find(l => l.code === lang);

  const shown = LANGUAGES.filter(l =>
    !q.trim() ||
    l.label.toLowerCase().includes(q.toLowerCase()) ||
    l.code.toLowerCase().includes(q.toLowerCase())
  );

  const handleOpen = () => { setQ(""); setOpen(v => !v); };

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  return (
    <div className="relative">
      <button aria-label={`اختيار اللغة — ${current?.label ?? lang}`} aria-expanded={open} onClick={handleOpen}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 border border-gray-200 transition-all">
        <Globe size={12} /><span>{current?.flag}</span>
        <ChevronDown size={9} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQ(""); }} />
          <div className="absolute top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[160px] left-0">
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                <Search size={11} className="text-gray-400 shrink-0" />
                <input aria-label="البحث عن لغة" ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                  placeholder="اكتب لغة..."
                  className="flex-1 bg-transparent text-xs focus-visible:outline-2 focus-visible:outline-[#103c68] placeholder:text-gray-400 min-w-0" />
                {q && (
                  <button aria-label="مسح البحث عن لغة" onClick={() => { setQ(""); inputRef.current?.focus(); }}
                    className="text-gray-300 hover:text-gray-500">
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>
            {shown.length > 0 ? shown.map(l => (
              <button key={l.code} onClick={() => { setLang(l.code); setOpen(false); setQ(""); }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors
                  ${l.code === lang ? "bg-gray-50 font-semibold text-[#103c68]" : "text-gray-600 hover:bg-gray-50"}`}>
                <span>{l.flag}</span>
                <span>{l.label}</span>
                {l.code === lang && <CheckCircle2 size={11} className="ms-auto text-[#103c68]" />}
              </button>
            )) : (
              <p className="text-center text-xs text-gray-400 py-3">لا توجد نتائج</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ──────────────── Product Card ──────────────────────────────── */
function ProductCard({ product, onClick, priceLocked }: { product: ProductPreview; onClick: () => void; priceLocked?: boolean }) {
  return (
    <button onClick={onClick}
      className="text-right bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col group">
      <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={36} className="text-slate-300" />
          </div>
        )}
        {product.category && (
          <span className="absolute top-2 right-2 bg-white/90 text-[#103c68] text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            {product.category}
          </span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <p className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 flex-1">{product.name}</p>
        {(product.avg_rating ?? 0) > 0 && (
          <div className="flex items-center gap-1.5">
            <Stars rating={product.avg_rating!} />
            <span className="text-xs text-gray-400">({product.review_count})</span>
          </div>
        )}
        <div className="flex items-end justify-between mt-1">
          {!priceLocked && (product.price_per_unit ?? 0) > 0 ? (
            <div>
              <span className="text-lg font-black text-orange-500">
                {product.price_per_unit?.toLocaleString("ar-SA")}
              </span>
              <span className="text-xs text-gray-400 mr-1">ر.س/{product.unit}</span>
            </div>
          ) : <span />}
          <span className="text-[10px] bg-orange-50 text-orange-600 px-2 py-1 rounded-lg font-semibold border border-orange-100">
            اطلب →
          </span>
        </div>
      </div>
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════
   Main Login Page — home-store inspired layout
════════════════════════════════════════════════════════════════ */
export default function Login() {
  const { login, loginAsGuest } = useAuth();
  const { dir } = useLang();

  const [products,          setProducts]          = useState<ProductPreview[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [showLoginModal,    setShowLoginModal]    = useState(false);
  const [priceLocked,       setPriceLocked]       = useState(false);
  const [quoteAction,       setQuoteAction]       = useState<"whatsapp"|"login">("whatsapp");
  const [whatsappOrderPhone, setWhatsappOrderPhone] = useState("0571748370");
  const [quoteProduct,      setQuoteProduct]      = useState<ProductPreview | null>(null);
  const [quoteForm,         setQuoteForm]         = useState({ qty: "", name: "", phone: "", location: "" });
  const [quoteSent,         setQuoteSent]         = useState(false);
  const [activeCategory,    setActiveCategory]    = useState("");
  const [logoTaps,          setLogoTaps]          = useState(0);
  const [searchQuery,       setSearchQuery]       = useState("");
  const [supervisorPhone,   setSupervisorPhone]   = useState("");
  const [supervisorName,    setSupervisorName]    = useState("مشرف الحركة");
  const [contactEntries,    setContactEntries]    = useState<Array<{ id: number; label: string; phone: string; has_whatsapp: number }>>([]);
  const [mobileMenuOpen,    setMobileMenuOpen]    = useState(false);
  const [siteContent,  setSiteContent]  = useState<Record<string, string>>({});
  const [siteServices, setSiteServices] = useState<Array<{ id: number; icon: string; label: string; sub: string }>>([]);
  const [siteEmails,   setSiteEmails]   = useState<Array<{ id: number; label: string; email: string }>>([]);

  /* ── Rental request modal ── */
  const [showRentalModal,   setShowRentalModal]   = useState(false);
  const [rentalVehicleTypes, setRentalVehicleTypes] = useState<Array<{ id: number; name: string; icon: string }>>([]);
  const [pickupPresets,  setPickupPresets]  = useState<LocationPreset[]>([]);
  const [destPresets,    setDestPresets]    = useState<LocationPreset[]>([]);
  const [rentalForm, setRentalForm] = useState({
    vehicle_type: "", start_date: new Date().toISOString().slice(0,10),
    pickup_location: "", pickup_lat: null as number|null, pickup_lng: null as number|null,
    dest_location:   "", dest_lat:   null as number|null, dest_lng:   null as number|null,
    notes: "", name: "", wa_phone: "", extra_phone: "",
  });
  const [rentalSubmitting, setRentalSubmitting] = useState(false);
  const [rentalDone, setRentalDone] = useState(false);

  const resetRentalForm = () => {
    const p0 = pickupPresets[0];
    const d0 = destPresets[0];
    setRentalForm({
      vehicle_type: rentalVehicleTypes[0]?.name || "شاحنة",
      start_date: new Date().toISOString().slice(0,10),
      pickup_location: p0?.location ?? "", pickup_lat: p0?.lat ?? null, pickup_lng: p0?.lng ?? null,
      dest_location:   d0?.location ?? "", dest_lat:   d0?.lat ?? null, dest_lng:   d0?.lng ?? null,
      notes: "", name: "", wa_phone: "", extra_phone: "",
    });
    setRentalDone(false);
  };

  const onPickupPick = useCallback((lat: number, lng: number, address: string) => {
    setRentalForm(f => ({ ...f, pickup_location: address, pickup_lat: lat || null, pickup_lng: lng || null }));
  }, []);
  const onDestPick = useCallback((lat: number, lng: number, address: string) => {
    setRentalForm(f => ({ ...f, dest_location: address, dest_lat: lat || null, dest_lng: lng || null }));
  }, []);

  const submitRentalRequest = async () => {
    if (!rentalForm.name.trim() || !rentalForm.wa_phone.trim()) return;
    setRentalSubmitting(true);

    const pickupShort = rentalForm.pickup_location.split(",")[0].trim();
    const destShort   = rentalForm.dest_location.split(",")[0].trim();

    try {
      await fetch("/api/external-rentals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_phone:       rentalForm.wa_phone.trim(),
          customer_name:        rentalForm.name.trim(),
          vehicle_type:         rentalForm.vehicle_type || "شاحنة نقل ثقيل",
          start_date:           rentalForm.start_date,
          pickup_location:      rentalForm.pickup_location || null,
          pickup_lat:           rentalForm.pickup_lat,
          pickup_lng:           rentalForm.pickup_lng,
          destination_location: rentalForm.dest_location || null,
          destination_lat:      rentalForm.dest_lat,
          destination_lng:      rentalForm.dest_lng,
          notes: [
            rentalForm.notes.trim(),
            rentalForm.extra_phone.trim() ? `رقم إضافي: ${rentalForm.extra_phone.trim()}` : "",
          ].filter(Boolean).join(" | ") || null,
          duration_type:  "محددة",
          duration_days:  1,
          payment_method: "transfer",
        }),
      });
    } catch {}

    const mapsPickup = rentalForm.pickup_lat
      ? `\nhttps://maps.google.com/?q=${rentalForm.pickup_lat},${rentalForm.pickup_lng}`
      : "";
    const mapsDest = rentalForm.dest_lat
      ? `\nhttps://maps.google.com/?q=${rentalForm.dest_lat},${rentalForm.dest_lng}`
      : "";

    const lines = [
      "السلام عليكم 👋",
      `*طلب تأجير سيارة نقل ثقيل*`,
      `━━━━━━━━━━━━━━━━`,
      `🚛 نوع المركبة: ${rentalForm.vehicle_type || "شاحنة نقل ثقيل"}`,
      rentalForm.start_date         ? `📅 تاريخ التحميل: ${rentalForm.start_date}` : "",
      pickupShort ? `📍 موقع التحميل: ${pickupShort}${mapsPickup}` : "",
      destShort   ? `🏁 الوجهة: ${destShort}${mapsDest}` : "",
      rentalForm.notes              ? `📝 ملاحظات: ${rentalForm.notes}` : "",
      `━━━━━━━━━━━━━━━━`,
      `👤 الاسم: ${rentalForm.name}`,
      `📱 الواتس: ${rentalForm.wa_phone}`,
      rentalForm.extra_phone ? `📞 رقم إضافي: ${rentalForm.extra_phone}` : "",
    ].filter(Boolean).join("\n");
    const num = supervisorPhone.replace(/^0/, "966");
    const link = `https://wa.me/${num}?text=${encodeURIComponent(lines)}`;
    window.open(link, "_blank", "noopener,noreferrer");
    setRentalSubmitting(false);
    setRentalDone(true);
  };

  useEffect(() => {
    fetch("/api/products")
      .then(r => r.json())
      .then(data => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/invoice-settings")
      .then(r => r.json())
      .then(d => setPriceLocked(d.prices_locked === 1))
      .catch(() => {});
    fetch("/api/app-settings")
      .then(r => r.json())
      .then(d => {
        if (d.quote_action)         setQuoteAction(d.quote_action as "whatsapp"|"login");
        if (d.whatsapp_order_phone) setWhatsappOrderPhone(d.whatsapp_order_phone);
      })
      .catch(() => {});
    fetch("/api/portal/supervisor-contact")
      .then(r => r.json())
      .then(d => { if (d.phone) { setSupervisorPhone(d.phone); setSupervisorName(d.name || "مشرف الحركة"); } })
      .catch(() => {});
    fetch("/api/portal/contact-entries")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d) && d.length > 0) { setContactEntries(d); setSupervisorPhone(d[0].phone); setSupervisorName(d[0].label); } })
      .catch(() => {});
    fetch("/api/portal/site-content").then(r => r.json()).then(setSiteContent).catch(() => {});
    fetch("/api/portal/site-services").then(r => r.json()).then(d => { if (Array.isArray(d) && d.length > 0) setSiteServices(d); }).catch(() => {});
    fetch("/api/portal/site-emails").then(r => r.json()).then(d => { if (Array.isArray(d)) setSiteEmails(d); }).catch(() => {});
    fetch("/api/rental-vehicle-types")
      .then(r => r.json())
      .then((d: Array<{ id: number; name: string; icon: string }>) => {
        if (Array.isArray(d) && d.length > 0) {
          setRentalVehicleTypes(d);
          setRentalForm(f => ({ ...f, vehicle_type: f.vehicle_type || d[0].name }));
        }
      })
      .catch(() => {});
    fetch("/api/portal/rental-location-presets")
      .then(r => r.json())
      .then((d: { pickups: LocationPreset[]; destinations: LocationPreset[] }) => {
        const ps = Array.isArray(d.pickups) ? d.pickups : [];
        const ds = Array.isArray(d.destinations) ? d.destinations : [];
        setPickupPresets(ps);
        setDestPresets(ds);
        if (ps[0]) setRentalForm(f => ({
          ...f,
          pickup_location: f.pickup_location || ps[0].location,
          pickup_lat: f.pickup_lat ?? ps[0].lat,
          pickup_lng: f.pickup_lng ?? ps[0].lng,
        }));
        if (ds[0]) setRentalForm(f => ({
          ...f,
          dest_location: f.dest_location || ds[0].location,
          dest_lat: f.dest_lat ?? ds[0].lat,
          dest_lng: f.dest_lng ?? ds[0].lng,
        }));
      })
      .catch(() => {});
  }, []);

  const waLink = (msg: string) => {
    if (!supervisorPhone) return undefined;
    const num = supervisorPhone.replace(/^0/, "966");
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  };

  const handleLogin = useCallback(async (id: string, pw: string, otp?: string) => {
    await login(id, pw, otp);
  }, [login]);

  const handleLogoTap = () => {
    const next = logoTaps + 1;
    setLogoTaps(next);
    if (next >= 3) { setShowLoginModal(true); setLogoTaps(0); }
  };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];

  const filtered = products.filter(p => {
    const matchCat = !activeCategory || p.category === activeCategory;
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  /* Category → representative product image */
  const categoryImages: Record<string, string> = {};
  for (const p of products) {
    if (p.category && p.image_url && !categoryImages[p.category]) {
      categoryImages[p.category] = p.image_url;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden" dir={dir}>

      {/* ── Product Detail Modal ── */}
      {selectedProductId !== null && (
        <ProductDetailModal
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
          onOrder={() => { setSelectedProductId(null); setShowLoginModal(true); }}
          priceLocked={priceLocked}
          quoteAction={quoteAction}
          onWhatsappOrder={() => {
            const p = products.find(x => x.id === selectedProductId);
            setSelectedProductId(null);
            if (p) { setQuoteForm({ qty: "", name: "", phone: "", location: "" }); setQuoteSent(false); setQuoteProduct(p); }
          }}
        />
      )}

      {/* ── Login Modal ── */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onLogin={handleLogin}
          onGuest={() => { setShowLoginModal(false); loginAsGuest(); }}
        />
      )}

      {/* ── WhatsApp Quote Modal (for price-locked products) ── */}
      {quoteProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setQuoteProduct(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" dir="rtl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                  <MessageCircle size={18} className="text-green-600" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-sm">اطلب الآن</h3>
                  <p className="text-xs text-gray-400 line-clamp-1">{quoteProduct.name}</p>
                </div>
              </div>
              <button aria-label="إغلاق نافذة طلب المنتج" onClick={() => setQuoteProduct(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={16} /></button>
            </div>

            {quoteSent ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 size={28} className="text-green-600" />
                </div>
                <p className="font-bold text-gray-900">تم فتح واتساب!</p>
                <p className="text-sm text-gray-500">سيتواصل معك فريقنا في أقرب وقت.</p>
                <button onClick={() => setQuoteProduct(null)}
                  className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200 transition-colors">
                  إغلاق
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label htmlFor="quote-quantity" className="block text-xs font-semibold text-gray-600 mb-1">الكمية ({quoteProduct.unit || "وحدة"})</label>
                  <input id="quote-quantity" type="number" min="1" value={quoteForm.qty}
                    onChange={e => setQuoteForm(f => ({ ...f, qty: e.target.value }))}
                    placeholder="مثال: 100"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label htmlFor="quote-name" className="block text-xs font-semibold text-gray-600 mb-1">الاسم *</label>
                  <input id="quote-name" type="text" value={quoteForm.name}
                    onChange={e => setQuoteForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="اسمك الكريم"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label htmlFor="quote-phone" className="block text-xs font-semibold text-gray-600 mb-1">رقم الجوال *</label>
                  <input id="quote-phone" type="tel" value={quoteForm.phone}
                    onChange={e => setQuoteForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="05xxxxxxxx"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label htmlFor="quote-location" className="block text-xs font-semibold text-gray-600 mb-1">موقع التنزيل *</label>
                  <input id="quote-location" type="text" value={quoteForm.location}
                    onChange={e => setQuoteForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="المدينة / الحي / العنوان"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <button
                  disabled={!quoteForm.name.trim() || !quoteForm.phone.trim() || !quoteForm.location.trim()}
                  onClick={() => {
                    const num = whatsappOrderPhone.replace(/^0/, "966");
                    const lines = [
                      `📦 *طلب جديد — ${quoteProduct.name}*`,
                      `الاسم: ${quoteForm.name}`,
                      `الجوال: ${quoteForm.phone}`,
                      quoteForm.qty    ? `الكمية: ${quoteForm.qty} ${quoteProduct.unit || ""}` : null,
                      `موقع التنزيل: ${quoteForm.location}`,
                    ].filter(Boolean).join("\n");
                    window.open(`https://wa.me/${num}?text=${encodeURIComponent(lines)}`, "_blank");
                    setQuoteSent(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M11.998 2C6.478 2 2 6.48 2 12.001c0 1.765.461 3.468 1.338 4.973L2 22l5.149-1.321A9.956 9.956 0 0011.998 22C17.519 22 22 17.52 22 12c0-5.522-4.48-10-10.002-10z"/>
                  </svg>
                  إرسال عبر واتساب
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════
          NAVBAR — white, clean
      ════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex items-center h-16 gap-4">

            {/* Logo — right (RTL) */}
            <button onClick={handleLogoTap}
              className="flex-shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#103c68] active:scale-95 transition-transform">
              <img src="/jefer-logo-new.png" alt="JEFER" className="h-9 object-contain" />
            </button>

            {/* Category nav — center, desktop */}
            {categories.length > 0 && (
              <nav className="hidden md:flex flex-1 items-center justify-center gap-1 overflow-x-auto scrollbar-none px-4">
                <button
                  onClick={() => setActiveCategory("")}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    !activeCategory
                      ? "bg-[#103c68] text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}>
                  الكل
                </button>
                {categories.map(cat => (
                  <button key={cat}
                    onClick={() => setActiveCategory(cat === activeCategory ? "" : cat)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                      activeCategory === cat
                        ? "bg-[#103c68] text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}>
                    {cat}
                  </button>
                ))}
              </nav>
            )}

            {/* Actions — left (RTL = mr-auto) */}
            <div className="flex items-center gap-2 mr-auto flex-shrink-0">
              {/* Search — desktop */}
              <div className="hidden sm:flex items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50 focus-within:border-[#103c68]/50 focus-within:ring-2 focus-within:ring-[#103c68]/10 transition-all">
                <input
                  aria-label="البحث عن منتج"
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن منتج..."
                  className="px-3 py-2 text-sm bg-transparent outline-none w-44 text-gray-700 placeholder:text-gray-400"
                  dir="rtl"
                />
                <button aria-label="البحث عن المنتجات" className="px-3 py-2 text-gray-400 hover:text-[#103c68] transition-colors">
                  <Search size={15} />
                </button>
              </div>

              <LangSwitcher />

              <ThemeToggleCycle />

              <button
                onClick={() => setShowLoginModal(true)}
                className="flex items-center gap-1.5 border border-[#103c68] text-[#103c68] hover:bg-[#103c68] hover:text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors">
                <User size={14} />
                <span>دخول</span>
              </button>

              <button
                aria-label="عرض المنتجات"
                onClick={() => { document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth" }); }}
                className="relative p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors">
                <ShoppingCart size={18} />
              </button>

              {/* Mobile menu toggle */}
              {categories.length > 0 && (
                <button
                  aria-label={mobileMenuOpen ? "إخفاء قائمة الأقسام" : "إظهار قائمة الأقسام"} aria-expanded={mobileMenuOpen}
                  onClick={() => setMobileMenuOpen(v => !v)}
                  className="md:hidden p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors">
                  <Menu size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Mobile search */}
          <div className="sm:hidden pb-2">
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50 focus-within:border-[#103c68] focus-within:ring-2 focus-within:ring-[#103c68]">
              <input
                aria-label="البحث عن منتج"
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث عن منتج..."
                className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
                dir="rtl"
              />
              <button aria-label="البحث عن المنتجات" className="px-3 text-gray-400">
                <Search size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile category strip */}
        {mobileMenuOpen && categories.length > 0 && (
          <div className="md:hidden border-t border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto scrollbar-none bg-white">
            <button
              onClick={() => { setActiveCategory(""); setMobileMenuOpen(false); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                !activeCategory ? "bg-[#103c68] text-white" : "bg-gray-100 text-gray-600"
              }`}>
              الكل
            </button>
            {categories.map(cat => (
              <button key={cat}
                onClick={() => { setActiveCategory(cat === activeCategory ? "" : cat); setMobileMenuOpen(false); }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeCategory === cat ? "bg-[#103c68] text-white" : "bg-gray-100 text-gray-600"
                }`}>
                {cat}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ════════════════════════════════════
          HERO — light, centered
      ════════════════════════════════════ */}
      <section className="relative bg-white border-b border-gray-100 overflow-hidden">
        <ConstructionBackground />
        <div className="relative z-10 max-w-4xl mx-auto px-6 py-16 lg:py-20 text-center">
          {/* Logo badge — watery glass effect */}
          <div className="inline-flex items-center justify-center mb-8">
            <div className="relative">
              {/* Outer glow ring */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#103c68]/20 via-sky-400/10 to-cyan-300/20 blur-xl scale-110" />
              {/* Glass card */}
              <div className="relative backdrop-blur-md bg-gradient-to-br from-white/70 via-sky-50/60 to-white/80 border border-white/60 rounded-3xl px-10 py-6 shadow-[0_8px_32px_rgba(16,60,104,0.12),inset_0_1px_0_rgba(255,255,255,0.8)]">
                {/* Water shimmer line */}
                <div className="absolute top-2 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
                <img src="/jefer-logo-new.png" alt="JEFER" className="h-20 object-contain relative z-10" />
                {/* Bottom reflection */}
                <div className="absolute bottom-2 left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#103c68]/10 to-transparent" />
              </div>
            </div>
          </div>

          <h1 className="text-4xl lg:text-5xl font-black text-[#103c68] leading-tight mb-4">
            {(siteContent.hero_title ?? "مواد البناء\nالأفضل جودةً").split("\n").map((line, i, arr) =>
              i < arr.length - 1
                ? <span key={i}>{line}<br /></span>
                : <span key={i} className="text-orange-500">{line}</span>
            )}
          </h1>
          <p className="text-gray-500 text-base lg:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
            {siteContent.hero_subtitle ?? "أسمنت، بلوك، حديد — توصيل سريع وتتبع لحظي لكل طلب في المملكة"}
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => { const el = document.getElementById("products-section"); el?.scrollIntoView({ behavior: "smooth" }); }}
              className="flex items-center gap-2 border-2 border-[#103c68] text-[#103c68] hover:bg-[#103c68] hover:text-white px-8 py-3.5 rounded-xl font-bold text-sm transition-all">
              {siteContent.cta_browse ?? "تصفح المنتجات"}
            </button>
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-8 py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40">
              {siteContent.cta_register ?? "سجل الآن"}
            </button>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════
          TRUST BADGES
      ════════════════════════════════════ */}
      <div className="bg-gray-50 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(siteServices.length > 0 ? siteServices : [
            { id: 1, icon: "truck",  label: "توصيل سريع",  sub: "لجميع مناطق المملكة" },
            { id: 2, icon: "shield", label: "جودة مضمونة", sub: "منتجات موثوقة 100%"   },
            { id: 3, icon: "zap",    label: "طلب فوري",    sub: "تتبع طلبك لحظياً"    },
            { id: 4, icon: "phone",  label: "دعم مستمر",   sub: "خدمة عملاء 24/7"     },
          ]).map(svc => {
            const IconMap: Record<string, typeof Truck> = { truck: Truck, shield: ShieldCheck, zap: Zap, phone: Phone, star: Star, package: Package, mail: Mail, "check-circle": CheckCircle2 };
            const SvcIcon = IconMap[svc.icon] ?? ShieldCheck;
            return (
              <div key={svc.id} className="flex items-center gap-3 py-1">
                <div className="w-10 h-10 rounded-xl bg-[#103c68]/5 flex items-center justify-center flex-shrink-0">
                  <SvcIcon size={18} className="text-[#103c68]" />
                </div>
                <div>
                  <div className="font-bold text-gray-800 text-sm">{svc.label}</div>
                  <div className="text-gray-400 text-xs">{svc.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════════════════════════════════
          CATEGORIES SECTION
      ════════════════════════════════════ */}
      {categories.length > 0 && (
        <section className="bg-white py-10 border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 lg:px-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1 h-6 rounded-full bg-orange-500" />
              <h2 className="text-xl font-black text-gray-900">تسوق حسب الأقسام</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {categories.map(cat => {
                const img = categoryImages[cat];
                const count = products.filter(p => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setActiveCategory(cat);
                      const el = document.getElementById("products-section");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={`relative group rounded-2xl overflow-hidden aspect-[4/3] flex items-end transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                      activeCategory === cat ? "ring-2 ring-[#103c68]" : ""
                    }`}>
                    {img ? (
                      <img
                        src={img}
                        alt={cat}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[#103c68]/20 to-[#103c68]/40" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="relative z-10 p-3 text-right w-full">
                      <p className="text-white font-black text-sm leading-tight">{cat}</p>
                      <p className="text-white/70 text-xs">{count} منتج</p>
                    </div>
                    {activeCategory === cat && (
                      <div className="absolute top-2 left-2 w-5 h-5 bg-[#103c68] rounded-full flex items-center justify-center">
                        <CheckCircle2 size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════
          PRODUCTS GRID
      ════════════════════════════════════ */}
      <section id="products-section" className="max-w-6xl mx-auto px-4 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 rounded-full bg-orange-500" />
            <div>
              <h2 className="text-xl font-black text-gray-900">
                {activeCategory ? activeCategory : "جميع المنتجات"}
              </h2>
              <p className="text-gray-400 text-sm mt-0.5">
                {searchQuery || activeCategory
                  ? `${filtered.length} نتيجة`
                  : `${products.length} منتج متاح`}
              </p>
            </div>
          </div>
          {(searchQuery || activeCategory) && (
            <button
              onClick={() => { setSearchQuery(""); setActiveCategory(""); }}
              className="text-xs text-orange-500 hover:text-orange-600 font-semibold border border-orange-200 px-3 py-1.5 rounded-xl flex items-center gap-1">
              <X size={11} /> مسح الفلتر
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">لا توجد منتجات</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map(p => (
              <ProductCard key={p.id} product={p} onClick={() => setSelectedProductId(p.id)} priceLocked={priceLocked} />
            ))}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════
          EXTERNAL RENTAL SERVICE
      ════════════════════════════════════ */}
      <section id="rental-section" className="bg-white py-10 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-6 rounded-full bg-orange-500" />
                <h2 className="text-xl font-black text-gray-900">خدمة التأجير الخارجي</h2>
              </div>
              <p className="text-gray-400 text-sm me-3">أسطول متنوع من المركبات والمعدات الثقيلة للإيجار بأسعار تنافسية</p>
            </div>
            <a href={waLink("السلام عليكم، أود الاستفسار عن خدمة التأجير الخارجي")}
              target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-sm text-[#103c68] font-semibold hover:text-green-600 transition-colors flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-500"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 2C6.478 2 2 6.48 2 12.001c0 1.765.461 3.468 1.338 4.973L2 22l5.149-1.321A9.956 9.956 0 0011.998 22C17.519 22 22 17.52 22 12c0-5.522-4.48-10-10.002-10zm.002 18.17a8.17 8.17 0 01-4.17-1.144l-.299-.178-3.056.784.808-2.977-.196-.308A8.161 8.161 0 013.832 12c0-4.506 3.665-8.17 8.168-8.17 4.505 0 8.17 3.664 8.17 8.17 0 4.505-3.665 8.17-8.17 8.17z"/></svg>
              استفسر الآن <ArrowRight size={14} />
            </a>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => { setShowRentalModal(true); setRentalDone(false); }}
              className="text-right bg-white border-2 border-[#103c68]/20 rounded-2xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-[#103c68]/40 transition-all duration-200 flex flex-col gap-3 group relative">
              <div className="absolute top-2 left-2 bg-[#103c68] text-white text-[9px] font-black px-2 py-0.5 rounded-full">اطلب الآن</div>
              <div className="w-11 h-11 rounded-xl bg-[#103c68]/5 flex items-center justify-center flex-shrink-0">
                <Truck size={20} className="text-[#103c68]" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 text-sm mb-1">شاحنة نقل ثقيل</p>
                <p className="text-gray-400 text-xs leading-relaxed">مناسبة لنقل مواد البناء بالكميات الكبيرة</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-[#103c68]/5 text-[#103c68] border-[#103c68]/10">سائب / معبأ</span>
                <span className="text-[10px] text-[#103c68] font-semibold group-hover:underline flex items-center gap-0.5">
                  طلب إيجار ←
                </span>
              </div>
            </button>

            {[
              {
                icon: Calendar,
                title: "عقد إيجار مرن",
                desc: "عقود يومية وأسبوعية وشهرية حسب الطلب",
                badge: "حسب الاتفاق",
                color: "bg-orange-50 text-orange-600 border-orange-100",
                iconBg: "bg-orange-50",
              },
            ].map(({ icon: Icon, title, desc, badge, color, iconBg }) => (
              <a key={title}
                href={waLink(`السلام عليكم، أود الاستفسار عن ${title}`)}
                target="_blank" rel="noopener noreferrer"
                className="text-right bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3 group">
                <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={20} className="text-[#103c68]" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm mb-1">{title}</p>
                  <p className="text-gray-400 text-xs leading-relaxed">{desc}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${color}`}>{badge}</span>
                  <span className="text-[10px] text-green-600 font-semibold group-hover:underline flex items-center gap-0.5">
                    واتساب ←
                  </span>
                </div>
              </a>
            ))}
          </div>

          <div className="mt-6 rounded-2xl overflow-hidden bg-[#103c68]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-5">
              <div className="text-right">
                <p className="text-white font-black text-base">تحتاج مركبة أو معدة؟</p>
                <p className="text-white/60 text-sm">تواصل معنا وسنجهز لك العرض المناسب خلال 24 ساعة</p>
              </div>
              <a href={waLink("السلام عليكم، أود الاستفسار عن خدمة التأجير الخارجي")}
                target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 bg-green-500 hover:bg-green-600 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors shadow-sm whitespace-nowrap flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 2C6.478 2 2 6.48 2 12.001c0 1.765.461 3.468 1.338 4.973L2 22l5.149-1.321A9.956 9.956 0 0011.998 22C17.519 22 22 17.52 22 12c0-5.522-4.48-10-10.002-10zm.002 18.17a8.17 8.17 0 01-4.17-1.144l-.299-.178-3.056.784.808-2.977-.196-.308A8.161 8.161 0 013.832 12c0-4.506 3.665-8.17 8.168-8.17 4.505 0 8.17 3.664 8.17 8.17 0 4.505-3.665 8.17-8.17 8.17z"/></svg>
                تواصل عبر واتساب
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════
          FOOTER
      ════════════════════════════════════ */}
      <footer className="bg-[#103c68] text-white mt-0">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {/* Brand */}
            <div className="text-right">
              <div className="inline-block bg-white/10 rounded-xl px-4 py-2 mb-3">
                <img src="/jefer-logo-new.png" alt="JEFER" className="h-8 object-contain"
                  style={{ filter: "brightness(0) invert(1)" }} />
              </div>
              <p className="text-white/60 text-sm leading-relaxed">
                {siteContent.footer_tagline ?? "منصة متكاملة لمواد البناء — توصيل سريع وتتبع لحظي لجميع مناطق المملكة"}
              </p>
              {siteEmails.length > 0 && (
                <div className="mt-3 space-y-1">
                  {siteEmails.map(e => (
                    <a key={e.id} href={`mailto:${e.email}`}
                      className="flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors justify-end">
                      <span>{e.label ? `${e.label}: ` : ""}{e.email}</span>
                      <Mail size={11} />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="text-right">
              <h3 className="font-bold text-white mb-3 text-sm">روابط سريعة</h3>
              <ul className="space-y-2">
                {[
                  { label: "الرئيسية", onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
                  { label: "المنتجات", onClick: () => document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth" }) },
                  { label: "خدمة التأجير", onClick: () => document.getElementById("rental-section")?.scrollIntoView({ behavior: "smooth" }) },
                  { label: "تسجيل الدخول", onClick: () => setShowLoginModal(true) },
                ].map(link => (
                  <li key={link.label}>
                    <button onClick={link.onClick}
                      className="text-white/60 hover:text-white text-sm transition-colors">
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div className="text-right">
              <h3 className="font-bold text-white mb-3 text-sm">تواصل معنا</h3>
              {contactEntries.length > 0 ? (
                <div className="space-y-3">
                  {contactEntries.map(entry => (
                    <div key={entry.id} className="space-y-1">
                      <p className="text-white/40 text-xs">{entry.label}</p>
                      <a href={`tel:${entry.phone}`}
                        className="flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors justify-end">
                        <span>{entry.phone}</span>
                        <Phone size={13} />
                      </a>
                      {entry.has_whatsapp === 1 && (
                        <a href={`https://wa.me/${entry.phone.replace(/^0/, "966")}?text=${encodeURIComponent("السلام عليكم، أود الاستفسار")}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-green-400 hover:text-green-300 text-sm transition-colors justify-end">
                          <span>واتساب</span>
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 2C6.478 2 2 6.48 2 12.001c0 1.765.461 3.468 1.338 4.973L2 22l5.149-1.321A9.956 9.956 0 0011.998 22C17.519 22 22 17.52 22 12c0-5.522-4.48-10-10.002-10z"/></svg>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : supervisorPhone ? (
                <div className="space-y-2">
                  <a href={`tel:${supervisorPhone}`}
                    className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors justify-end">
                    <span>{supervisorPhone}</span>
                    <Phone size={14} />
                  </a>
                  <a href={waLink("السلام عليكم، أود الاستفسار")}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-green-400 hover:text-green-300 text-sm transition-colors justify-end">
                    <span>واتساب</span>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 2C6.478 2 2 6.48 2 12.001c0 1.765.461 3.468 1.338 4.973L2 22l5.149-1.321A9.956 9.956 0 0011.998 22C17.519 22 22 17.52 22 12c0-5.522-4.48-10-10.002-10z"/></svg>
                  </a>
                </div>
              ) : (
                <p className="text-white/40 text-sm">تواصل معنا عبر الواتساب</p>
              )}
            </div>
          </div>

          <div className="border-t border-white/10 mt-8 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-white/40 text-xs">© {new Date().getFullYear()} MKGH — جميع الحقوق محفوظة</p>
            <a
              href={`https://wa.me/${siteContent.dev_whatsapp ?? "966571748340"}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors border border-white/10">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-green-400 flex-shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 2C6.478 2 2 6.48 2 12.001c0 1.765.461 3.468 1.338 4.973L2 22l5.149-1.321A9.956 9.956 0 0011.998 22C17.519 22 22 17.52 22 12c0-5.522-4.48-10-10.002-10zm.002 18.17a8.17 8.17 0 01-4.17-1.144l-.299-.178-3.056.784.808-2.977-.196-.308A8.161 8.161 0 013.832 12c0-4.506 3.665-8.17 8.168-8.17 4.505 0 8.17 3.664 8.17 8.17 0 4.505-3.665 8.17-8.17 8.17z"/></svg>
              {siteContent.dev_credit ?? "تم إنشاء الموقع بواسطة MKGH — 0571748340"}
            </a>
          </div>
        </div>
      </footer>

      {/* ════════════════════════════════════
          RENTAL REQUEST MODAL
      ════════════════════════════════════ */}
      {showRentalModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl"
          onClick={e => { if (e.target === e.currentTarget) { setShowRentalModal(false); resetRentalForm(); } }}>
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#103c68]/5 flex items-center justify-center">
                  <Truck size={18} className="text-[#103c68]" />
                </div>
                <div>
                  <h2 className="font-black text-gray-900 text-base">طلب تأجير سيارة نقل ثقيل</h2>
                  <p className="text-xs text-gray-400">سيتواصل معك فريقنا خلال 24 ساعة</p>
                </div>
              </div>
              <button aria-label="إغلاق نافذة طلب التأجير" onClick={() => { setShowRentalModal(false); resetRentalForm(); }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {rentalDone ? (
                <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 size={32} className="text-green-500" />
                  </div>
                  <div>
                    <p className="font-black text-gray-900 text-lg">تم فتح واتساب ✅</p>
                    <p className="text-sm text-gray-400 mt-1">أرسل الرسالة لإكمال الطلب — سيتواصل معك فريقنا قريباً</p>
                  </div>
                  <button onClick={() => { setShowRentalModal(false); resetRentalForm(); }}
                    className="px-6 py-2.5 bg-[#103c68] text-white rounded-xl font-bold text-sm hover:bg-[#0d2e50] transition-colors">
                    إغلاق
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-2">🚛 نوع المركبة</label>
                    <div className="flex flex-wrap gap-2">
                      {(rentalVehicleTypes.length > 0
                        ? rentalVehicleTypes
                        : [{ id:0, name:"شاحنة نقل ثقيل", icon:"🚛" }, { id:1, name:"سطحة", icon:"🚚" }, { id:2, name:"بلكر", icon:"⛽" }]
                      ).map(t => (
                        <button key={t.name} type="button"
                          onClick={() => setRentalForm(f => ({ ...f, vehicle_type: t.name }))}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
                            rentalForm.vehicle_type === t.name
                              ? "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                          }`}>
                          <span>{t.icon}</span> {t.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="rental-start-date" className="block text-xs font-bold text-gray-600 mb-1.5">
                      📅 تاريخ التحميل
                      <span className="text-gray-400 font-normal mr-1">(الافتراضي: اليوم)</span>
                    </label>
                    <input id="rental-start-date" type="date"
                      value={rentalForm.start_date}
                      onChange={e => setRentalForm(f => ({ ...f, start_date: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                  </div>

                  <RentalMapPicker
                    label="موقع التحميل"
                    emoji="📍"
                    pinPos={rentalForm.pickup_lat ? [rentalForm.pickup_lat, rentalForm.pickup_lng!] : null}
                    address={rentalForm.pickup_location}
                    onPick={onPickupPick}
                    presets={pickupPresets}
                  />

                  {rentalForm.pickup_lat && rentalForm.dest_lat && (
                    <div className="flex items-center justify-center gap-2 py-1">
                      <div className="h-px flex-1 bg-gray-200" />
                      <span className="bg-[#103c68]/5 border border-[#103c68]/20 text-[#103c68] text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                        📏 {haversineKm(rentalForm.pickup_lat, rentalForm.pickup_lng!, rentalForm.dest_lat, rentalForm.dest_lng!).toFixed(0)} كم
                      </span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                  )}

                  <RentalMapPicker
                    label="الوجهة"
                    emoji="🏁"
                    pinPos={rentalForm.dest_lat ? [rentalForm.dest_lat, rentalForm.dest_lng!] : null}
                    address={rentalForm.dest_location}
                    onPick={onDestPick}
                    presets={destPresets}
                  />

                  <div>
                    <label htmlFor="rental-notes" className="block text-xs font-bold text-gray-600 mb-1.5">📝 ملاحظات (اختياري)</label>
                    <textarea id="rental-notes" rows={2} placeholder="أي تفاصيل إضافية عن الشحنة..."
                      value={rentalForm.notes}
                      onChange={e => setRentalForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
                  </div>

                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs font-bold text-gray-400 whitespace-nowrap">بيانات التواصل</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  <div>
                    <label htmlFor="rental-name" className="block text-xs font-bold text-gray-600 mb-1.5">👤 الاسم <span className="text-red-500">*</span></label>
                    <input id="rental-name" type="text" placeholder="اسمك الكريم..." required
                      value={rentalForm.name}
                      onChange={e => setRentalForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                  </div>

                  <div>
                    <label htmlFor="rental-whatsapp" className="block text-xs font-bold text-gray-600 mb-1.5">
                      <span className="inline-flex items-center gap-1">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-green-500"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 2C6.478 2 2 6.48 2 12.001c0 1.765.461 3.468 1.338 4.973L2 22l5.149-1.321A9.956 9.956 0 0011.998 22C17.519 22 22 17.52 22 12c0-5.522-4.48-10-10.002-10z"/></svg>
                        رقم الواتساب <span className="text-red-500">*</span>
                      </span>
                    </label>
                    <input id="rental-whatsapp" type="tel" placeholder="05xxxxxxxx" required
                      value={rentalForm.wa_phone}
                      onChange={e => setRentalForm(f => ({ ...f, wa_phone: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-400/40 font-mono" />
                  </div>

                  <div>
                    <label htmlFor="rental-extra-phone" className="block text-xs font-bold text-gray-600 mb-1.5">
                      <span className="inline-flex items-center gap-1">
                        <Phone size={12} className="text-gray-400" />
                        رقم تواصل إضافي <span className="text-gray-400 font-normal">(اختياري)</span>
                      </span>
                    </label>
                    <input id="rental-extra-phone" type="tel" placeholder="رقم آخر للتواصل..."
                      value={rentalForm.extra_phone}
                      onChange={e => setRentalForm(f => ({ ...f, extra_phone: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 font-mono" />
                  </div>
                </>
              )}
            </div>

            {!rentalDone && (
              <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={submitRentalRequest}
                  disabled={rentalSubmitting || !rentalForm.name.trim() || !rentalForm.wa_phone.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-2xl text-sm transition-colors shadow-sm">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 2C6.478 2 2 6.48 2 12.001c0 1.765.461 3.468 1.338 4.973L2 22l5.149-1.321A9.956 9.956 0 0011.998 22C17.519 22 22 17.52 22 12c0-5.522-4.48-10-10.002-10zm.002 18.17a8.17 8.17 0 01-4.17-1.144l-.299-.178-3.056.784.808-2.977-.196-.308A8.161 8.161 0 013.832 12c0-4.506 3.665-8.17 8.168-8.17 4.505 0 8.17 3.664 8.17 8.17 0 4.505-3.665 8.17-8.17 8.17z"/></svg>
                  {rentalSubmitting ? "جاري الإرسال..." : "إرسال عبر واتساب"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
