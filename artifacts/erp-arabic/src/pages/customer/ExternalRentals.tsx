import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Truck, Plus, X, CheckCircle, Clock, XCircle,
  CalendarDays, CreditCard, Banknote, Car,
  MapPin, Locate, Lock, FileText, Route,
  Star, Trash2, Hash,
} from "lucide-react";

const OFMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SA_CENTER: [number, number] = [43.975, 26.326]; // lng, lat

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface VehicleType { id: number; name: string; icon: string; }
interface Rental {
  id: number; vehicle_type: string; start_date: string; duration_type: string;
  duration_days: number; status: string; payment_method: string; payment_status: string;
  assigned_vehicle: string | null; assigned_driver: string | null; total_price: number;
  notes: string | null; pickup_location: string | null; destination_location: string | null;
  lease_proposal: string | null; created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: "قيد الانتظار", color: "bg-amber-50  text-amber-700  border-amber-200",  icon: Clock },
  confirmed: { label: "مؤكد",          color: "bg-blue-50   text-blue-700   border-blue-200",   icon: CheckCircle },
  active:    { label: "جارٍ التنفيذ", color: "bg-green-50  text-green-700  border-green-200",  icon: Truck },
  completed: { label: "مكتمل",         color: "bg-gray-50   text-gray-600   border-gray-200",   icon: CheckCircle },
  cancelled: { label: "ملغى",          color: "bg-red-50    text-red-700    border-red-200",    icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.pending;
  const Icon = s.icon;
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.color}`}><Icon size={11} /> {s.label}</span>;
}

interface Preset { label: string; lat: number; lng: number; }

interface MapPickerProps {
  label: string;
  pinPos: [number, number] | null;
  address: string;
  onPick: (lat: number, lng: number, address: string) => void;
  presets?: Preset[];
}
function MapPicker({ label, pinPos, address, onPick, presets }: MapPickerProps) {
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
    navigator.geolocation?.getCurrentPosition(async pos => {
      await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      setLocating(false); setShowMap(true);
    }, () => setLocating(false));
  };

  return (
    <div>
      <label className="text-sm font-semibold text-gray-700 block mb-2 flex items-center gap-1.5">
        <MapPin size={14} className="text-[#103c68]" /> {label} *
      </label>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {presets.map(p => (
            <button key={p.label} type="button"
              onClick={() => { onPick(p.lat, p.lng, p.label); setShowMap(false); }}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                address === p.label
                  ? "bg-[#103c68] text-white border-[#103c68]"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:border-[#103c68]/40 hover:text-[#103c68]"
              }`}>
              📍 {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleSearch())}
          placeholder="ابحث عن مدينة أو موقع في السعودية..."
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
        <button type="button" onClick={handleSearch} disabled={searching}
          className="px-3 py-2.5 bg-[#103c68] text-white rounded-xl text-xs font-bold hover:bg-[#0d2e50] disabled:opacity-60 transition-colors">
          {searching ? "⏳" : "بحث"}
        </button>
        <button type="button" onClick={handleGPS} disabled={locating}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          title="موقعي الحالي">
          <Locate size={15} className={locating ? "animate-pulse text-[#103c68]" : ""} />
        </button>
      </div>

      {results.length > 1 && (
        <div className="border border-gray-200 rounded-xl bg-white shadow-md overflow-hidden mb-2">
          {results.map((res, i) => (
            <button key={i} type="button"
              onClick={() => { onPick(res.lat, res.lng, res.name); setShowMap(true); setSearch(""); setResults([]); }}
              className="w-full text-right px-3 py-2 text-sm hover:bg-[#103c68]/5 border-b border-gray-100 last:border-0 flex items-center gap-2">
              <MapPin size={11} className="text-[#103c68] flex-shrink-0" />
              <span className="truncate">{res.name}</span>
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setShowMap(v => !v)}
        className="text-xs text-[#103c68] font-semibold flex items-center gap-1 mb-2 hover:underline">
        <MapPin size={11} /> {showMap ? "إخفاء الخريطة" : "اختر من الخريطة"}
      </button>

      {showMap && (
        <div ref={mapContainerRef} className="rounded-xl overflow-hidden border border-gray-200 mb-2"
          style={{ height: 220, width: "100%" }} />
      )}

      {address ? (
        <div className="bg-[#103c68]/5 border border-[#103c68]/20 rounded-xl px-3 py-2 text-xs text-[#103c68] flex items-start gap-1.5">
          <MapPin size={11} className="flex-shrink-0 mt-0.5" />
          <span className="line-clamp-2">{address}</span>
        </div>
      ) : (
        <textarea value={address} onChange={e => onPick(pinPos?.[0] ?? 0, pinPos?.[1] ?? 0, e.target.value)}
          placeholder="أو أدخل العنوان يدوياً..."
          rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none" />
      )}
    </div>
  );
}

interface FavoriteItem {
  id: string;
  label: string;
  vehicle_type: string;
  pickup_addr: string; pickup_lat: number | null; pickup_lng: number | null;
  dest_addr: string;   dest_lat: number | null;   dest_lng: number | null;
  duration_type: string; duration_days: string;
  payment_method: string; notes: string; lease_proposal: string;
}

function favKey(phone: string) { return `rental_fav_${phone}`; }
function loadFavs(phone: string): FavoriteItem[] {
  try { return JSON.parse(localStorage.getItem(favKey(phone)) || "[]"); } catch { return []; }
}
function saveFavs(phone: string, favs: FavoriteItem[]) {
  localStorage.setItem(favKey(phone), JSON.stringify(favs));
}

interface FlatbedRule { id: number; origin_city: string; dest_city: string; multiplier: number; }
interface PricingCalc {
  actual_km: number; multiplier: number; billing_km: number;
  rate_per_km: number; total_price: number; reason: string; loading: boolean;
}

export default function ExternalRentals() {
  const { user } = useAuth();
  const [rentals,      setRentals]      = useState<Rental[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [success,      setSuccess]      = useState(false);

  const [form, setForm] = useState({
    vehicle_type: "", start_date: "", duration_type: "محددة", duration_days: "1",
    payment_method: "transfer", notes: "", card_number: "", card_name: "", card_expiry: "", card_cvv: "",
    lease_proposal: "",
  });
  const [pickupPos,     setPickupPos]     = useState<[number,number] | null>(null);
  const [pickupAddr,    setPickupAddr]    = useState("");
  const [destPos,       setDestPos]       = useState<[number,number] | null>(null);
  const [destAddr,      setDestAddr]      = useState("");
  const [cardStep,      setCardStep]      = useState(false);

  const [flatbedRules,  setFlatbedRules]  = useState<FlatbedRule[]>([]);
  const [vehicleRates,  setVehicleRates]  = useState<Record<string, number>>({});
  const [pricing,       setPricing]       = useState<PricingCalc | null>(null);

  const [favorites,    setFavorites]    = useState<FavoriteItem[]>(() => user ? loadFavs(user.phone) : []);
  const [showSaveFav,  setShowSaveFav]  = useState(false);
  const [favLabel,     setFavLabel]     = useState("");
  const [quantity,     setQuantity]     = useState(1);
  const [pickupPresets, setPickupPresets] = useState<Preset[]>([]);
  const [destPresets,   setDestPresets]   = useState<Preset[]>([]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [rentalsRes, typesRes, locRes] = await Promise.all([
        fetch(`/api/external-rentals?phone=${user.phone}&role=customer`),
        fetch("/api/rental-vehicle-types"),
        fetch(`/api/external-rentals/locations?phone=${user.phone}`),
      ]);
      const rentalsData = await rentalsRes.json();
      const typesData   = await typesRes.json();
      const locData     = await locRes.json();
      setRentals(Array.isArray(rentalsData) ? rentalsData : []);
      const types = Array.isArray(typesData) ? typesData : [];
      setVehicleTypes(types);
      if (types.length > 0 && !form.vehicle_type) setForm(f => ({ ...f, vehicle_type: types[0].name }));
      if (Array.isArray(locData?.pickup))      setPickupPresets(locData.pickup);
      if (Array.isArray(locData?.destination)) setDestPresets(locData.destination);
    } catch { setRentals([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    Promise.all([
      fetch("/api/flatbed-multipliers").then(r => r.json()),
      fetch("/api/rental-vehicle-types").then(r => r.json()),
    ]).then(([rules, types]) => {
      setFlatbedRules(Array.isArray(rules) ? rules : []);
      const rates: Record<string, number> = {};
      if (Array.isArray(types)) types.forEach((t: { name: string; rate_per_km: number }) => { rates[t.name] = t.rate_per_km || 0; });
      setVehicleRates(rates);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pickupPos || !destPos || !form.vehicle_type) { setPricing(null); return; }
    let cancelled = false;
    setPricing(p => ({ ...(p ?? { actual_km:0, multiplier:1, billing_km:0, rate_per_km:0, total_price:0, reason:"" }), loading: true }));
    (async () => {
      try {
        const [pLat, pLng] = pickupPos;
        const [dLat, dLng] = destPos;
        const osrm = await fetch(`https://router.project-osrm.org/route/v1/driving/${pLng},${pLat};${dLng},${dLat}?overview=false`);
        const od = await osrm.json();
        const actual_km = od.routes?.[0]?.distance ? +(od.routes[0].distance / 1000).toFixed(1) : 0;
        let multiplier = 1;
        let reason = "رحلة أحادية الاتجاه";
        const vt = form.vehicle_type;
        if (vt.includes("بلكر") || vt.includes("قلاب")) {
          multiplier = 2;
          reason = "رحلة ذهاب وعودة";
        } else if (vt.includes("سطحة")) {
          const rule = flatbedRules.find(r =>
            (pickupAddr.includes(r.origin_city)) && (destAddr.includes(r.dest_city))
          );
          if (rule) {
            multiplier = rule.multiplier;
            reason = `قاعدة المسار: ${rule.origin_city} ← ${rule.dest_city}`;
          } else {
            multiplier = 2;
            reason = "قاعدة افتراضية (ذهاب وعودة)";
          }
        }
        const billing_km = +(actual_km * multiplier).toFixed(1);
        const rate_per_km = vehicleRates[vt] || 0;
        const total_price = +(billing_km * rate_per_km).toFixed(2);
        if (!cancelled) setPricing({ actual_km, multiplier, billing_km, rate_per_km, total_price, reason, loading: false });
      } catch {
        if (!cancelled) setPricing(p => p ? { ...p, loading: false } : null);
      }
    })();
    return () => { cancelled = true; };
  }, [pickupPos, destPos, form.vehicle_type, flatbedRules, vehicleRates, pickupAddr, destAddr]);

  const resetForm = () => {
    setForm({ vehicle_type: vehicleTypes[0]?.name || "", start_date: "", duration_type: "محددة", duration_days: "1", payment_method: "transfer", notes: "", card_number: "", card_name: "", card_expiry: "", card_cvv: "", lease_proposal: "" });
    setPickupPos(null); setPickupAddr(""); setDestPos(null); setDestAddr(""); setCardStep(false);
    setQuantity(1); setShowSaveFav(false); setFavLabel("");
  };

  const applyFavorite = (fav: FavoriteItem) => {
    setForm(f => ({ ...f, vehicle_type: fav.vehicle_type, duration_type: fav.duration_type, duration_days: fav.duration_days, payment_method: fav.payment_method, notes: fav.notes, lease_proposal: fav.lease_proposal }));
    if (fav.pickup_lat && fav.pickup_lng) { setPickupPos([fav.pickup_lat, fav.pickup_lng]); setPickupAddr(fav.pickup_addr); }
    if (fav.dest_lat && fav.dest_lng)     { setDestPos([fav.dest_lat, fav.dest_lng]);       setDestAddr(fav.dest_addr); }
    setShowForm(true);
  };

  const saveFavorite = () => {
    if (!user || !favLabel.trim()) return;
    const fav: FavoriteItem = {
      id: Date.now().toString(), label: favLabel.trim(),
      vehicle_type: form.vehicle_type,
      pickup_addr: pickupAddr, pickup_lat: pickupPos?.[0] ?? null, pickup_lng: pickupPos?.[1] ?? null,
      dest_addr: destAddr,     dest_lat: destPos?.[0]   ?? null, dest_lng: destPos?.[1]   ?? null,
      duration_type: form.duration_type, duration_days: form.duration_days,
      payment_method: form.payment_method, notes: form.notes, lease_proposal: form.lease_proposal,
    };
    const next = [fav, ...favorites.filter(f => f.label !== fav.label)];
    setFavorites(next); saveFavs(user.phone, next);
    setShowSaveFav(false); setFavLabel("");
  };

  const removeFavorite = (id: string) => {
    if (!user) return;
    const next = favorites.filter(f => f.id !== id);
    setFavorites(next); saveFavs(user.phone, next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (form.payment_method === "card" && !cardStep) { setCardStep(true); return; }
    setSubmitting(true);
    try {
      const payload = {
        customer_phone: user.phone, customer_name: user.name,
        vehicle_type:   form.vehicle_type, start_date: form.start_date,
        duration_type:  form.duration_type, duration_days: form.duration_days,
        payment_method: form.payment_method, notes: form.notes || null,
        pickup_location: pickupAddr || null,
        pickup_lat: pickupPos?.[0] || null, pickup_lng: pickupPos?.[1] || null,
        destination_location: destAddr || null,
        destination_lat: destPos?.[0] || null, destination_lng: destPos?.[1] || null,
        lease_proposal: form.lease_proposal || null,
      };
      const count = Math.max(1, Math.min(quantity, 20));
      const reqs = Array.from({ length: count }, () =>
        fetch("/api/external-rentals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      );
      const results = await Promise.all(reqs);
      const first = results[0];
      if (!first.ok) { const d = await first.json(); throw new Error(d.error); }
      setSuccess(true); setShowForm(false); resetForm(); load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const formatCardNumber = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  const formatExpiry = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length >= 3 ? d.slice(0,2)+"/"+d.slice(2) : d; };
  const cancelRental = async (id: number) => {
    if (!confirm("هل تريد إلغاء هذا الطلب؟")) return;
    await fetch(`/api/external-rentals/${id}`, { method: "DELETE" }); load();
  };

  const handlePickupPick = useCallback((lat: number, lng: number, addr: string) => { setPickupPos([lat, lng]); setPickupAddr(addr); }, []);
  const handleDestPick   = useCallback((lat: number, lng: number, addr: string) => { setDestPos([lat, lng]);   setDestAddr(addr); }, []);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2"><Truck size={20} className="text-[#103c68]" /> تأجير خارجي</h1>
            <p className="text-xs text-gray-400">احجز مركبة نقل خارجية</p>
          </div>
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md bg-[#103c68]">
            <img src="/logo.png" alt="MKGH" className="w-full h-full object-contain" />
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-green-500 flex-shrink-0" />
            <div><div className="font-bold text-green-800 text-sm">تم إرسال طلب التأجير بنجاح!</div><div className="text-xs text-green-600 mt-0.5">سيتواصل معك المشرف لتأكيد التفاصيل</div></div>
            <button onClick={() => setSuccess(false)} className="mr-auto text-green-400 hover:text-green-600"><X size={16} /></button>
          </div>
        )}

        {/* ── Favorites strip ── */}
        {!showForm && favorites.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Star size={14} className="text-amber-500 fill-amber-400" />
              <span className="text-sm font-bold text-gray-700">المفضلة</span>
              <span className="text-xs text-gray-400">({favorites.length})</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {favorites.map(fav => (
                <div key={fav.id} className="flex-shrink-0 flex items-center gap-0.5 bg-white border border-amber-200 rounded-xl shadow-sm">
                  <button
                    onClick={() => applyFavorite(fav)}
                    className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-[#103c68] hover:bg-amber-50 rounded-xl transition-colors">
                    <Star size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />
                    <span className="whitespace-nowrap max-w-32 truncate">{fav.label}</span>
                    <span className="text-xs text-gray-400 font-normal">{fav.vehicle_type}</span>
                  </button>
                  <button onClick={() => removeFavorite(fav.id)}
                    className="p-2 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-colors mr-0.5">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="w-full bg-[#103c68] text-white py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-lg hover:bg-[#0d2e50] transition-colors">
            <Plus size={20} /> طلب تأجير جديد
          </button>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">طلب تأجير مركبة</h3>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-xl"><X size={16} className="text-gray-400" /></button>
            </div>

            {!cardStep ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Vehicle type */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">نوع المركبة *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(vehicleTypes.length > 0 ? vehicleTypes : [{ id:0, name:"سطحة", icon:"🚛" }]).map(t => (
                      <button key={t.name} type="button"
                        onClick={() => setForm(f => ({ ...f, vehicle_type: t.name }))}
                        className={`py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                          form.vehicle_type === t.name ? "bg-[#103c68] text-white border-[#103c68] shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                        }`}>
                        <span>{t.icon}</span> {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pickup location map */}
                <MapPicker label="موقع التحميل (الانطلاق)" pinPos={pickupPos} address={pickupAddr} onPick={handlePickupPick} presets={pickupPresets} />

                {/* Distance badge */}
                {pickupPos && destPos && (
                  <div className="flex items-center gap-2 py-1">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="bg-[#0eb5cb]/10 border border-[#0eb5cb]/30 text-[#0a8fa0] text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                      📏 {haversineKm(pickupPos[0], pickupPos[1], destPos[0], destPos[1]).toFixed(0)} كم
                    </span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>
                )}

                {/* Destination location map */}
                <MapPicker label="موقع التنزيل (الوجهة)" pinPos={destPos} address={destAddr} onPick={handleDestPick} presets={destPresets} />

                {/* ── Distance pricing breakdown ── */}
                {pricing && (
                  <div className={`rounded-2xl border p-4 transition-all ${pricing.loading ? "bg-gray-50 border-gray-200 animate-pulse" : "bg-blue-50 border-blue-200"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Route size={15} className="text-[#103c68]" />
                      <h4 className="font-bold text-[#103c68] text-sm">تقدير التسعير بالمسافة</h4>
                      {pricing.loading && (
                        <div className="mr-auto w-4 h-4 border-2 border-[#103c68] border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                    {!pricing.loading && pricing.actual_km > 0 && (
                      <>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-white/80 rounded-xl p-2.5 text-center border border-blue-100">
                            <div className="font-black text-gray-900 text-lg">{pricing.actual_km} كم</div>
                            <div className="text-xs text-gray-500 mt-0.5">المسافة الفعلية</div>
                          </div>
                          <div className="bg-white/80 rounded-xl p-2.5 text-center border border-orange-200">
                            <div className="font-black text-orange-600 text-lg">× {pricing.multiplier}</div>
                            <div className="text-xs text-gray-500 mt-0.5">المضاعف</div>
                          </div>
                          <div className="bg-white/80 rounded-xl p-2.5 text-center border border-blue-200">
                            <div className="font-black text-[#103c68] text-lg">{pricing.billing_km} كم</div>
                            <div className="text-xs text-gray-500 mt-0.5">المسافة المحاسبية</div>
                          </div>
                          {pricing.rate_per_km > 0 ? (
                            <div className="bg-green-600 rounded-xl p-2.5 text-center text-white shadow-sm">
                              <div className="font-black text-lg">{pricing.total_price.toLocaleString("ar-SA")} ر.س</div>
                              <div className="text-xs opacity-80 mt-0.5">الإجمالي المقدر</div>
                            </div>
                          ) : (
                            <div className="bg-white/80 rounded-xl p-2.5 text-center border border-gray-200">
                              <div className="font-semibold text-gray-500 text-sm">يُحدد لاحقاً</div>
                              <div className="text-xs text-gray-400 mt-0.5">السعر</div>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-blue-700 bg-white/60 rounded-xl px-3 py-2 flex items-start gap-1.5 border border-blue-100">
                          <span className="flex-shrink-0">📐</span>
                          <span>
                            {pricing.actual_km} كم × {pricing.multiplier} ({pricing.reason}) = <strong>{pricing.billing_km} كم</strong>
                            {pricing.rate_per_km > 0 && ` × ${pricing.rate_per_km} ر.س/كم = `}
                            {pricing.rate_per_km > 0 && <strong>{pricing.total_price.toLocaleString("ar-SA")} ر.س</strong>}
                          </span>
                        </div>
                      </>
                    )}
                    {!pricing.loading && pricing.actual_km === 0 && (
                      <div className="text-xs text-gray-500 text-center py-2">تعذّر حساب المسافة — تأكد من صحة الإحداثيات</div>
                    )}
                  </div>
                )}

                {/* Start date */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5"><CalendarDays size={14} />تاريخ البداية *</label>
                  <input type="date" required min={new Date().toISOString().slice(0,10)}
                    value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                </div>

                {/* Duration */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">نوع المدة</label>
                  <div className="flex gap-2">
                    {["محددة", "مفتوحة"].map(d => (
                      <button key={d} type="button" onClick={() => setForm(f => ({ ...f, duration_type: d }))}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${form.duration_type === d ? "bg-[#103c68] text-white border-[#103c68]" : "bg-white text-gray-600 border-gray-200"}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                  {form.duration_type === "محددة" && (
                    <div className="mt-2">
                      <label className="text-xs text-gray-500 block mb-1">عدد الأيام</label>
                      <input type="number" min="1" max="365" value={form.duration_days}
                        onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
                    </div>
                  )}
                </div>

                {/* Lease proposal */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5"><FileText size={14} />اقتراح الإيجار (اختياري)</label>
                  <textarea value={form.lease_proposal} onChange={e => setForm(f => ({ ...f, lease_proposal: e.target.value }))}
                    placeholder="أكتب هنا شروطك المقترحة للإيجار، مثل: السعر اليومي، التأمين، الشروط الخاصة..."
                    rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none" />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5">ملاحظات إضافية</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="أي تفاصيل إضافية..." rows={2}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none" />
                </div>

                {/* Payment method */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">طريقة الدفع</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { k:"transfer",  l:"تحويل بنكي",      icon: Banknote,   active: "bg-[#103c68] text-white border-[#103c68]"    },
                      { k:"cash",      l:"دفع نقدي",         icon: Banknote,   active: "bg-amber-600 text-white border-amber-600"    },
                      { k:"card",      l:"بطاقة ائتمانية",  icon: CreditCard, active: "bg-emerald-600 text-white border-emerald-600" },
                      { k:"deferred",  l:"دفع مؤجل",         icon: Clock,      active: "bg-purple-600 text-white border-purple-600"  },
                    ].map(({ k, l, icon: Icon, active }) => (
                      <button key={k} type="button" onClick={() => setForm(f => ({ ...f, payment_method: k }))}
                        className={`py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${form.payment_method === k ? active : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                        <Icon size={14} /> {l}
                      </button>
                    ))}
                  </div>
                  {form.payment_method === "deferred" && (
                    <p className="text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2 mt-2">
                      سيُحسب المبلغ في نهاية الشهر — تُقدَّم لك فاتورة شاملة لتسوية الحساب
                    </p>
                  )}
                </div>

                {/* ── Quantity + Save favorite ── */}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                      <Hash size={13} className="text-[#103c68]" /> عدد المركبات
                    </label>
                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                      <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        className="px-3 py-2.5 text-lg font-bold text-gray-500 hover:bg-gray-100 transition-colors select-none">−</button>
                      <span className="flex-1 text-center font-black text-gray-900 text-lg">{quantity}</span>
                      <button type="button" onClick={() => setQuantity(q => Math.min(20, q + 1))}
                        className="px-3 py-2.5 text-lg font-bold text-gray-500 hover:bg-gray-100 transition-colors select-none">+</button>
                    </div>
                    {quantity > 1 && <p className="text-xs text-amber-600 mt-1">سيُرسَل {quantity} طلبات منفصلة</p>}
                  </div>
                  <div className="flex-1">
                    <label className="text-sm font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                      <Star size={13} className="text-amber-500" /> حفظ كمفضلة
                    </label>
                    {!showSaveFav ? (
                      <button type="button" onClick={() => setShowSaveFav(true)}
                        className="w-full py-2.5 border border-amber-200 text-amber-600 rounded-xl text-sm font-semibold hover:bg-amber-50 transition-colors flex items-center justify-center gap-1.5 bg-amber-50/40">
                        <Star size={14} /> حفظ
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <input autoFocus value={favLabel} onChange={e => setFavLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveFavorite(); } if (e.key === "Escape") setShowSaveFav(false); }}
                          placeholder="اسم المفضلة..."
                          className="flex-1 border border-amber-300 rounded-xl px-2 py-2 text-xs bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400/40 min-w-0" />
                        <button type="button" onClick={saveFavorite} disabled={!favLabel.trim()}
                          className="px-2.5 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors flex-shrink-0">
                          <CheckCircle size={14} />
                        </button>
                        <button type="button" onClick={() => setShowSaveFav(false)}
                          className="px-2 py-2 border border-gray-200 rounded-xl text-xs text-gray-400 hover:bg-gray-50 flex-shrink-0">
                          <X size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button type="submit" disabled={submitting || !form.vehicle_type}
                  className={`w-full py-3.5 rounded-2xl font-black text-white disabled:opacity-60 shadow-lg transition-colors ${form.payment_method === "card" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#103c68] hover:bg-[#0d2e50]"}`}>
                  {form.payment_method === "card" ? "التالي — إدخال بيانات البطاقة" : submitting ? "جاري الإرسال..." : quantity > 1 ? `إرسال ${quantity} طلبات تأجير` : "إرسال طلب التأجير"}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                {/* Card visual */}
                <div className="bg-gradient-to-l from-[#103c68] to-[#0d2e50] rounded-2xl p-4 text-white">
                  <div className="flex justify-between items-start mb-4"><div className="text-xs opacity-70">MKGH Logistics</div><CreditCard size={20} className="opacity-80" /></div>
                  <div className="font-mono text-base font-bold tracking-widest mb-3">{form.card_number || "•••• •••• •••• ••••"}</div>
                  <div className="flex justify-between items-end text-sm">
                    <div><div className="text-xs opacity-60 mb-0.5">اسم حامل البطاقة</div><div className="font-semibold">{form.card_name || "—"}</div></div>
                    <div className="text-end"><div className="text-xs opacity-60 mb-0.5">انتهاء الصلاحية</div><div className="font-semibold">{form.card_expiry || "MM/YY"}</div></div>
                  </div>
                </div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">رقم البطاقة</label>
                  <input type="text" inputMode="numeric" placeholder="•••• •••• •••• ••••" value={form.card_number}
                    onChange={e => setForm(f => ({ ...f, card_number: formatCardNumber(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono tracking-wider text-center" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">اسم حامل البطاقة</label>
                  <input type="text" placeholder="الاسم كما هو على البطاقة" value={form.card_name}
                    onChange={e => setForm(f => ({ ...f, card_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-semibold text-gray-700 block mb-1">تاريخ الانتهاء</label>
                    <input type="text" placeholder="MM/YY" maxLength={5} value={form.card_expiry}
                      onChange={e => setForm(f => ({ ...f, card_expiry: formatExpiry(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-center font-mono" /></div>
                  <div><label className="text-xs font-semibold text-gray-700 block mb-1">CVV</label>
                    <input type="password" placeholder="•••" maxLength={4} value={form.card_cvv}
                      onChange={e => setForm(f => ({ ...f, card_cvv: e.target.value.replace(/\D/g,"").slice(0,4) }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-center font-mono" /></div>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                  <Lock size={12} className="flex-shrink-0" /><span>الدفع آمن ومشفر — سيُؤكَّد طلبك تلقائياً عند اكتمال الدفع</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCardStep(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">رجوع</button>
                  <button type="button" onClick={handleSubmit as any} disabled={submitting || !form.card_number || !form.card_name || !form.card_expiry || !form.card_cvv}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                    <Lock size={14} />{submitting ? "جاري المعالجة..." : "تأكيد الدفع"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rentals list */}
        {loading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse h-24" />)}</div>
        ) : rentals.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
            <Truck size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="font-semibold text-gray-500">لا توجد طلبات تأجير بعد</p>
            <p className="text-xs text-gray-400 mt-1">اضغط "طلب تأجير جديد" للبدء</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="font-bold text-gray-700 text-sm">طلباتي ({rentals.length})</h2>
            {rentals.map(r => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-black text-gray-900">{r.vehicle_type}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><CalendarDays size={11} />{r.start_date} · {r.duration_type === "مفتوحة" ? "مدة مفتوحة" : `${r.duration_days} يوم`}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.pickup_location && (
                  <div className="text-xs text-gray-500 flex items-start gap-1"><MapPin size={10} className="flex-shrink-0 mt-0.5 text-green-500" /><span className="line-clamp-1">{r.pickup_location}</span></div>
                )}
                {r.destination_location && (
                  <div className="text-xs text-gray-500 flex items-start gap-1"><MapPin size={10} className="flex-shrink-0 mt-0.5 text-red-500" /><span className="line-clamp-1">{r.destination_location}</span></div>
                )}
                {r.assigned_vehicle && (
                  <div className="bg-blue-50 text-blue-700 rounded-xl px-3 py-2 text-xs flex items-center gap-1.5">
                    <Car size={12} /><span className="font-semibold">{r.assigned_vehicle}{r.assigned_driver ? ` · ${r.assigned_driver}` : ""}</span>
                  </div>
                )}
                {r.notes && <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">{r.notes}</div>}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{r.payment_method === "card" ? "💳 بطاقة" : "🏦 تحويل"}</span>
                  {r.total_price > 0 && <span className="font-bold text-gray-700">{r.total_price.toFixed(0)} ر.س</span>}
                </div>
                {r.status === "pending" && (
                  <button onClick={() => cancelRental(r.id)}
                    className="w-full py-2 border border-red-200 text-red-500 hover:bg-red-50 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1">
                    <XCircle size={13} /> إلغاء الطلب
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
