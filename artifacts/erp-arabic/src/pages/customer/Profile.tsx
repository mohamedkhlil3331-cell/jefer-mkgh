import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { User, Phone, MapPin, Building2, FileText, Save, CheckCircle, AlertCircle, Lock, Users, Plus, Pencil, Trash2, Star, X, LogOut } from "lucide-react";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface Rep { id: number; name: string; phone: string; }
interface RepLink { id: number; rep_phone: string; rep_name: string; link_status: string; linked_at: string; }
interface SavedLoc { id: number; alias: string; address: string; lat: number | null; lng: number | null; is_default: number; }

function MapPicker({ lat, lng, onPick }: { lat: number | null; lng: number | null; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}
function MapFly({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.6 }); }, [lat, lng, map]);
  return null;
}

const DEFAULT_CENTER: [number, number] = [24.7136, 46.6753];

export default function Profile() {
  const { user, logoutAllDevices } = useAuth();
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", city: "",
    company_name: "", vat_number: "", cr_number: "",
  });
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [error, setError] = useState("");
  const [pwError, setPwError] = useState("");
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState("");

  const [repLink, setRepLink] = useState<RepLink | null | undefined>(undefined);
  const [reps, setReps] = useState<Rep[]>([]);
  const [selectedRep, setSelectedRep] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState({ type: "", text: "" });

  const [savedLocs, setSavedLocs] = useState<SavedLoc[]>([]);
  const [locsLoading, setLocsLoading] = useState(false);
  const [showLocForm, setShowLocForm] = useState(false);
  const [editingLoc, setEditingLoc] = useState<SavedLoc | null>(null);
  const [locForm, setLocForm] = useState({ alias: "", address: "", lat: null as number | null, lng: null as number | null, is_default: false });
  const [savingLoc, setSavingLoc] = useState(false);
  const [showLocMap, setShowLocMap] = useState(false);

  const token = () => localStorage.getItem("mkgh_token") || "";

  const loadLocs = () => {
    if (!user?.phone) return;
    setLocsLoading(true);
    fetch(`/api/client-locations?phone=${user.phone}`)
      .then(r => r.json())
      .then(d => setSavedLocs(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLocsLoading(false));
  };

  useEffect(() => {
    if (!user || user.role !== "customer") return;
    fetch(`/api/rep/my-link?customer_phone=${user.phone}`)
      .then(r => r.json()).then(d => setRepLink(d)).catch(() => setRepLink(null));
    fetch("/api/admin/reps")
      .then(r => r.json()).then(d => setReps(Array.isArray(d) ? d : [])).catch(() => {});
    loadLocs();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => setForm({
        name: d.name || user.name || "",
        phone: d.phone || user.phone || "",
        email: d.email || "",
        address: d.address || "",
        city: d.city || "",
        company_name: d.company_name || "",
        vat_number: d.vat_number || "",
        cr_number: d.cr_number || "",
      })).catch(() => setForm(f => ({ ...f, name: user.name || "", phone: user.phone || "" })));
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true); setError(""); setSuccess(false);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...form, phone: user.phone }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "حدث خطأ");
      setSuccess(true); setTimeout(() => setSuccess(false), 3000);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const savePassword = async () => {
    if (!user) return;
    if (pwForm.next !== pwForm.confirm) { setPwError("كلمتا المرور غير متطابقتين"); return; }
    if (pwForm.next.length < 4) { setPwError("كلمة المرور يجب أن تكون 4 أحرف على الأقل"); return; }
    setSavingPw(true); setPwError(""); setPwSuccess(false);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: user.phone, current_password: pwForm.current, new_password: pwForm.next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "حدث خطأ");
      setPwSuccess(true); setPwForm({ current: "", next: "", confirm: "" });
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (e) { setPwError((e as Error).message); }
    finally { setSavingPw(false); }
  };

  const handleLogoutAllDevices = async () => {
    if (!confirm("سيتم تسجيل الخروج من جميع الأجهزة المرتبطة بهذا الحساب، بما فيها هذا الجهاز، وستحتاج إلى تسجيل الدخول من جديد. هل تريد المتابعة؟")) return;
    setLoggingOutAll(true);
    setLogoutAllError("");
    try {
      await logoutAllDevices();
      window.location.assign("/");
    } catch (e) {
      setLogoutAllError((e as Error).message);
    } finally {
      setLoggingOutAll(false);
    }
  };

  const linkToRep = async () => {
    if (!selectedRep || !user) return;
    setLinking(true); setLinkMsg({ type: "", text: "" });
    try {
      const res = await fetch("/api/rep/link-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_phone: user.phone, rep_phone: selectedRep }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "حدث خطأ");
      setLinkMsg({ type: "success", text: d.message });
      fetch(`/api/rep/my-link?customer_phone=${user.phone}`).then(r => r.json()).then(d => setRepLink(d)).catch(() => {});
    } catch (e) { setLinkMsg({ type: "error", text: (e as Error).message }); }
    setLinking(false);
  };

  const openAddLoc = () => {
    setEditingLoc(null);
    setLocForm({ alias: "", address: "", lat: null, lng: null, is_default: false });
    setShowLocMap(false);
    setShowLocForm(true);
  };

  const openEditLoc = (loc: SavedLoc) => {
    setEditingLoc(loc);
    setLocForm({ alias: loc.alias, address: loc.address || "", lat: loc.lat, lng: loc.lng, is_default: !!loc.is_default });
    setShowLocMap(false);
    setShowLocForm(true);
  };

  const saveLoc = async () => {
    if (!user || !locForm.alias.trim()) return;
    setSavingLoc(true);
    try {
      if (editingLoc) {
        await fetch(`/api/client-locations/${editingLoc.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...locForm, customer_phone: user.phone, is_default: locForm.is_default ? 1 : 0 }),
        });
      } else {
        await fetch("/api/client-locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...locForm, customer_phone: user.phone, is_default: locForm.is_default ? 1 : 0 }),
        });
      }
      setShowLocForm(false); setEditingLoc(null);
      loadLocs();
    } catch { /* ignore */ }
    setSavingLoc(false);
  };

  const deleteLoc = async (id: number) => {
    if (!confirm("هل تريد حذف هذا الموقع؟")) return;
    await fetch(`/api/client-locations/${id}`, { method: "DELETE" });
    loadLocs();
  };

  const pinPos: [number, number] | null = (locForm.lat && locForm.lng) ? [locForm.lat, locForm.lng] : null;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <User size={20} className="text-[#103c68]" /> الملف الشخصي
            </h1>
            <p className="text-xs text-gray-400">بيانات حسابك الشخصي</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-[#103c68] flex items-center justify-center text-white font-black text-xl shadow-md">
            {user?.name?.[0] || "؟"}
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-3 flex items-center gap-2 text-sm text-green-700">
            <CheckCircle size={16} /> تم حفظ البيانات بنجاح
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Personal Info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
            <User size={15} className="text-[#103c68]" /> البيانات الشخصية
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">الاسم الكامل *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1 flex items-center gap-1"><Phone size={11} />رقم الجوال</label>
              <input value={form.phone} disabled
                className="w-full border border-gray-100 rounded-xl px-4 py-2.5 text-sm bg-gray-100 text-gray-400 cursor-not-allowed" />
              <p className="text-xs text-gray-400 mt-0.5">لا يمكن تغيير رقم الجوال — تواصل مع الإدارة</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">البريد الإلكتروني</label>
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
            <MapPin size={15} className="text-[#103c68]" /> بيانات العنوان
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">المدينة</label>
              <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                <option value="">— اختر المدينة —</option>
                {["الرياض","بريدة","عنيزة","الرس","المذنب","أبها","جدة","مكة المكرمة","المدينة المنورة","الدمام","الخبر","الجبيل","تبوك","حائل","نجران","الطائف"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">العنوان التفصيلي</label>
              <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                rows={2} placeholder="الحي، الشارع، رقم المبنى..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none" />
            </div>
          </div>
        </div>

        {/* Saved Locations */}
        {user?.role === "customer" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                <MapPin size={15} className="text-emerald-600" /> مواقعي المحفوظة
              </h2>
              <button onClick={openAddLoc}
                className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-200 transition-colors">
                <Plus size={13} /> إضافة موقع
              </button>
            </div>
            <p className="text-xs text-gray-400">احفظ مواقع التسليم المتكررة لاستخدامها بسرعة عند الطلب</p>

            {locsLoading && <div className="text-center py-3 text-gray-400 text-xs">جاري التحميل...</div>}

            {!locsLoading && savedLocs.length === 0 && (
              <div className="text-center py-4 border-2 border-dashed border-gray-200 rounded-xl">
                <MapPin size={24} className="text-gray-300 mx-auto mb-1" />
                <p className="text-xs text-gray-400">لا توجد مواقع محفوظة بعد</p>
              </div>
            )}

            {savedLocs.map(loc => (
              <div key={loc.id} className={`flex items-start gap-3 p-3 rounded-xl border ${loc.is_default ? "border-emerald-200 bg-emerald-50" : "border-gray-100 bg-gray-50"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${loc.is_default ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {loc.is_default ? <Star size={16} /> : <MapPin size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-gray-900 text-sm">{loc.alias}</p>
                    {loc.is_default && <span className="text-xs bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">افتراضي</span>}
                  </div>
                  {loc.address && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{loc.address}</p>}
                  {loc.lat && loc.lng && (
                    <p className="text-xs text-gray-400 mt-0.5">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEditLoc(loc)}
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => deleteLoc(loc.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            {/* Add/Edit Location Form */}
            {showLocForm && (
              <div className="border border-[#103c68]/20 rounded-2xl p-4 bg-[#103c68]/3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 text-sm">{editingLoc ? "تعديل الموقع" : "إضافة موقع جديد"}</h3>
                  <button onClick={() => setShowLocForm(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">اسم الموقع (اختصار) *</label>
                  <input value={locForm.alias} onChange={e => setLocForm(f => ({ ...f, alias: e.target.value }))}
                    placeholder="مثال: المستودع الرئيسي، موقع المشروع..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">العنوان التفصيلي</label>
                  <input value={locForm.address} onChange={e => setLocForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="الحي، الشارع، المدينة..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>

                {/* Map toggle */}
                <button type="button" onClick={() => setShowLocMap(v => !v)}
                  className="flex items-center gap-2 text-xs text-[#103c68] font-semibold hover:underline">
                  <MapPin size={13} />
                  {showLocMap ? "إخفاء الخريطة" : (pinPos ? "تعديل الموقع على الخريطة" : "تحديد الموقع على الخريطة (اختياري)")}
                </button>

                {showLocMap && (
                  <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 200, zIndex: 0 }}>
                    <MapContainer center={pinPos ?? DEFAULT_CENTER} zoom={pinPos ? 14 : 6}
                      style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <MapPicker lat={locForm.lat} lng={locForm.lng}
                        onPick={(lat, lng) => setLocForm(f => ({ ...f, lat, lng }))} />
                      {pinPos && <><MapFly lat={pinPos[0]} lng={pinPos[1]} /><Marker position={pinPos} /></>}
                    </MapContainer>
                    {pinPos && (
                      <div className="mt-1 text-xs text-emerald-700 flex items-center gap-1">
                        <CheckCircle size={11} /> تم تحديد الإحداثيات: {locForm.lat?.toFixed(4)}, {locForm.lng?.toFixed(4)}
                        <button type="button" onClick={() => setLocForm(f => ({ ...f, lat: null, lng: null }))} className="mr-auto text-red-400 hover:text-red-600"><X size={12} /></button>
                      </div>
                    )}
                    {!pinPos && <p className="text-xs text-gray-400 mt-1 text-center">اضغط على الخريطة لتثبيت الموقع</p>}
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={locForm.is_default} onChange={e => setLocForm(f => ({ ...f, is_default: e.target.checked }))}
                    className="w-4 h-4 rounded accent-[#103c68]" />
                  <span className="text-sm text-gray-700">تعيين كموقع افتراضي</span>
                </label>

                <div className="flex gap-2">
                  <button onClick={saveLoc} disabled={savingLoc || !locForm.alias.trim()}
                    className="flex-1 bg-[#103c68] hover:bg-[#0d2e50] disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    <Save size={14} />{savingLoc ? "جاري الحفظ..." : "حفظ الموقع"}
                  </button>
                  <button onClick={() => setShowLocForm(false)}
                    className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition-colors">
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Company Info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
            <Building2 size={15} className="text-[#103c68]" /> بيانات الشركة (اختياري)
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">اسم الشركة</label>
              <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1 flex items-center gap-1"><FileText size={11} />الرقم الضريبي</label>
                <input value={form.vat_number} onChange={e => setForm(f => ({ ...f, vat_number: e.target.value }))}
                  placeholder="3xxxxxxxxxxxxxxx3"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">السجل التجاري</label>
                <input value={form.cr_number} onChange={e => setForm(f => ({ ...f, cr_number: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
            </div>
          </div>
        </div>

        {/* Rep Assignment */}
        {user?.role === "customer" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
              <Users size={15} className="text-[#103c68]" /> المندوب المرتبط
            </h2>
            {repLink === undefined && <div className="text-center py-3 text-gray-400 text-xs">جاري التحميل...</div>}
            {repLink && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                <div className="w-10 h-10 rounded-full bg-[#103c68]/10 flex items-center justify-center text-[#103c68] font-black text-base flex-shrink-0">
                  {repLink.rep_name?.[0] || "م"}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">{repLink.rep_name}</p>
                  <p className="text-xs text-gray-400">{repLink.rep_phone}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  repLink.link_status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-700"
                }`}>{repLink.link_status === "active" ? "مرتبط" : "بانتظار الموافقة"}</span>
              </div>
            )}
            {repLink === null && (
              <>
                <p className="text-xs text-gray-500">يمكنك الارتباط بمندوب مبيعات لتسهيل طلباتك وتتبعها</p>
                {reps.length > 0 ? (
                  <>
                    <select value={selectedRep} onChange={e => setSelectedRep(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                      <option value="">— اختر مندوب مبيعات —</option>
                      {reps.map(r => <option key={r.phone} value={r.phone}>{r.name} · {r.phone}</option>)}
                    </select>
                    {linkMsg.text && (
                      <div className={`rounded-xl p-2.5 text-xs flex items-center gap-2 ${linkMsg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                        {linkMsg.type === "success" ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                        {linkMsg.text}
                      </div>
                    )}
                    <button onClick={linkToRep} disabled={!selectedRep || linking}
                      className="w-full bg-[#103c68] hover:bg-[#0d2e50] disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                      <Users size={14} />{linking ? "جاري الربط..." : "ربط بالمندوب"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">لا يوجد مندوبون متاحون حالياً</p>
                )}
              </>
            )}
          </div>
        )}

        <button onClick={save} disabled={saving || !form.name}
          className="w-full bg-[#103c68] hover:bg-[#0d2e50] text-white py-4 rounded-2xl font-black text-base disabled:opacity-60 shadow-lg transition-colors flex items-center justify-center gap-2">
          <Save size={18} />{saving ? "جاري الحفظ..." : "حفظ البيانات"}
        </button>

        {/* Password Change */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
            <Lock size={15} className="text-[#103c68]" /> تغيير كلمة المرور
          </h2>
          {pwSuccess && <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700 flex items-center gap-2"><CheckCircle size={14} />تم تغيير كلمة المرور بنجاح</div>}
          {pwError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex items-center gap-2"><AlertCircle size={14} />{pwError}</div>}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">كلمة المرور الحالية</label>
              <input type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">كلمة المرور الجديدة</label>
              <input type="password" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">تأكيد كلمة المرور</label>
              <input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
            </div>
          </div>
          <button onClick={savePassword} disabled={savingPw || !pwForm.current || !pwForm.next}
            className="w-full bg-gray-800 hover:bg-gray-900 text-white py-3 rounded-2xl font-bold text-sm disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
            <Lock size={16} />{savingPw ? "جاري التحديث..." : "تحديث كلمة المرور"}
          </button>
        </div>

        {!user?.isGuest && (
          <div className="bg-red-50 rounded-2xl border border-red-100 p-5 space-y-3">
            <h2 className="font-bold text-red-800 flex items-center gap-2 text-sm">
              <LogOut size={16} /> أمان الحساب
            </h2>
            <p className="text-xs leading-5 text-red-700">
              استخدم هذا الخيار إذا فقدت جهازًا أو شككت أن حسابك مفتوح على جهاز آخر. سيتم إنهاء جميع جلسات الدخول، ثم تسجيل دخولك من جديد.
            </p>
            {logoutAllError && (
              <div className="bg-white/70 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle size={14} /> {logoutAllError}
              </div>
            )}
            <button onClick={handleLogoutAllDevices} disabled={loggingOutAll}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
              <LogOut size={15} />{loggingOutAll ? "جاري إنهاء الجلسات..." : "تسجيل الخروج من جميع الأجهزة"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
