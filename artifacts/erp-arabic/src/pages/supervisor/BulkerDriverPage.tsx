import { useState, useEffect, useRef } from "react";
import { canAccess, useAuth } from "@/context/AuthContext";
import {
  Truck, Upload, CheckCircle, Clock, Package, Fuel,
  Receipt, Pencil, Trash2, X, Plus, Wallet,
  AlertTriangle, ChevronDown, ChevronUp, Camera,
  FileImage, MapPin, PenLine, Phone,
} from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import CargoPhotoUploadGate from "@/components/CargoPhotoUploadGate";
import DriverOrders from "@/pages/driver/DriverOrders";

type LoadingOrder = {
  id: number;
  permit_number: string | null;
  cement_ref_number: string | null;
  vehicle_plate: string;
  driver_name: string;
  cargo_type: string | null;
  unload_location: string | null;
  unload_location_phone: string | null;
  unload_location_map_url: string | null;
  status: string;
  confirmed_at: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
};

type Expense = {
  id: number;
  driver_phone: string;
  expense_type: string;
  amount: number;
  liters: number;
  description: string | null;
  expense_date: string;
  attachment_url: string | null;
  vehicle_plate: string | null;
  created_at: string;
};

type Balance = {
  allocated: number;
  spent: number;
  remaining: number;
  last_settlement_date: string | null;
};

type BonusSummary = {
  month: string;
  gross_bonus: number;
  trip_bonus: number;
  order_bonus: number;
  rental_bonus: number;
  total_diesel: number;
  net_bonus: number;
  breakdown: { state: string; km: number; rate: number; bonus: number }[];
};

type VehicleInfo = {
  show_cargo_photo?: number | null;
  plate_number: string | null;
  vehicle_type: string | null;
  vehicle_name: string | null;
  status: string | null;
  max_weight_kg: number | null;
  vehicles?: {
    plate_number: string;
    vehicle_type: string | null;
    vehicle_name: string | null;
    assignment_role: "primary" | "backup";
  }[];
};

type VehicleImage = { id: number; image_url: string; angle: string };

type DriverTrip = {
  id: number; date: string; car_id: string; driver_name: string | null;
  destination: string | null; image_url: string | null; notes: string | null;
  route_bonus: number; return_value_no_vat: number; net_amount: number;
  trip_state: string | null; loading_region: string | null; unloading_region: string | null;
  trips_count: number; unit_price: number; client_name: string | null;
};

const EMPTY_BREAKDOWN_FORM = { operational_state: "متعطل", action_taken: "", description: "" };

const EMPTY_EXPENSE = {
  expense_type: "ديزل",
  amount: "",
  liters: "",
  description: "",
  expense_date: new Date().toISOString().slice(0, 10),
  vehicle_plate: "",
};

export default function BulkerDriverPage() {
  const { user, token } = useAuth();
  const legacyPlate = user?.vehicle_plate;
  const phone   = user?.phone;

  const [orders,    setOrders]    = useState<LoadingOrder[]>([]);
  const [expenses,  setExpenses]  = useState<Expense[]>([]);
  const [balance,   setBalance]   = useState<Balance | null>(null);
  const [loading,   setLoading]   = useState(true);

  const [uploading,  setUploading]  = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  const [expModal,      setExpModal]      = useState<null | "diesel" | "expense">(null);
  const [editExp,       setEditExp]       = useState<Expense | null>(null);
  const [expForm,       setExpForm]       = useState({ ...EMPTY_EXPENSE });
  const [expAttachFile, setExpAttachFile] = useState<File | null>(null);
  const [expAttachPrev, setExpAttachPrev] = useState<string>("");
  const [savingExp,     setSavingExp]     = useState(false);
  const [deletingExp,   setDeletingExp]   = useState<number | null>(null);
  const expFileRef = useRef<HTMLInputElement>(null);

  // Bonus
  const [bonus,         setBonus]         = useState<BonusSummary | null>(null);

  // Vehicle info
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [vehicleImg,  setVehicleImg]  = useState<string | null>(null);
  const plate = vehicleInfo?.plate_number || legacyPlate;

  // Breakdown report
  const [breakdownModal,   setBreakdownModal]   = useState(false);
  const [breakdownForm,    setBreakdownForm]     = useState({ ...EMPTY_BREAKDOWN_FORM });
  const [savingBreakdown,  setSavingBreakdown]   = useState(false);

  // Cargo photo upload (direct to trips log)
  const [cargoUploading, setCargoUploading] = useState(false);
  const [recentUploads,  setRecentUploads]  = useState<{ id: number; image_url: string; date: string }[]>([]);
  const cargoImgRef     = useRef<HTMLInputElement>(null);
  const cargoGalleryRef = useRef<HTMLInputElement>(null);

  // ── Consolidated home dashboard extras ────────────────────────────────────
  // workflow orders → KPI strip
  const [wOrders,      setWOrders]      = useState<{ stage: string }[]>([]);
  // printed marks + statement snapshot → "الباقي من الطباعة"
  const [printedMarks, setPrintedMarks] = useState<Set<string>>(new Set());
  type PrintedMark = { item_type: string; item_ref: string; marked_at: string; batch_key?: string };
  const [printedMarksList, setPrintedMarksList] = useState<PrintedMark[]>([]);
  const [signatures,       setSignatures]       = useState<Map<string, string>>(new Map()); // batch_key → signed_at
  const [sigModalBatchKey, setSigModalBatchKey] = useState<string | null>(null);
  const [sigSaving,        setSigSaving]        = useState(false);
  type StmtSnap = {
    totals: { total_settled: number };
    orders: { order_number: string | number; driver_bonus: number }[];
    trips:  { id?: number | null; bonus: number }[];
    rentals: { id?: number | null; driver_bonus: number }[];
    supply_trips: { id: number; rental: number | string }[];
    expenses: { id: number; amount: number }[];
  };
  const [stmtSnap,     setStmtSnap]     = useState<StmtSnap | null>(null);

  // My trips log
  const [myTrips,       setMyTrips]       = useState<DriverTrip[]>([]);
  const [tripsExpanded, setTripsExpanded] = useState(true);
  const [editingTrip,   setEditingTrip]   = useState<DriverTrip | null>(null);
  const [tripNote,      setTripNote]      = useState("");
  const [savingTripNote, setSavingTripNote] = useState(false);
  const [tripImgFile,   setTripImgFile]   = useState<File | null>(null);
  const [tripImgPrev,   setTripImgPrev]   = useState<string>("");
  const tripImgRef        = useRef<HTMLInputElement>(null);
  const tripImgGalleryRef = useRef<HTMLInputElement>(null);

  // Lightbox & delete
  const [lightboxUrl,    setLightboxUrl]    = useState<string | null>(null);
  const [deletingTripId, setDeletingTripId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const authToken = () => localStorage.getItem("mkgh_token") || "";

  async function load() {
    if (!phone) return;
    setLoading(true);
    try {
      const [vinfoRes, vimgResArr] = await Promise.all([
        fetch(`/api/driver-vehicle-info?phone=${encodeURIComponent(phone)}`, {
          headers: { Authorization: `Bearer ${authToken()}` },
        }).then(r => r.json()),
        plate ? fetch(`/api/vehicle-images/${encodeURIComponent(plate)}`).then(r => r.json()) : Promise.resolve([]),
      ]);
      if (vinfoRes && !vinfoRes.error) setVehicleInfo(vinfoRes as VehicleInfo);
      const imgs = Array.isArray(vimgResArr) ? (vimgResArr as VehicleImage[]) : [];
      const front = imgs.find(i => i.angle === "front") || imgs[0];
      setVehicleImg(front?.image_url ?? null);

      const fetches: Promise<Response>[] = [
        fetch(`/api/driver-expenses?phone=${encodeURIComponent(phone)}`),
        fetch(`/api/driver-balance?phone=${encodeURIComponent(phone)}`),
        fetch(`/api/driver-bonus-summary?phone=${encodeURIComponent(phone)}`),
        fetch("/api/trips/for-driver", { headers: { Authorization: `Bearer ${authToken()}` } }),
      ];
      if (plate) {
        fetches.unshift(fetch(`/api/loading-orders/by-plate/${encodeURIComponent(plate)}`));
      }
      const results = await Promise.all(fetches.map(f => f.then(r => r.json())));
      if (plate) {
        const [ord, exp, bal, bon, trips] = results;
        setOrders(Array.isArray(ord) ? ord : []);
        setExpenses(Array.isArray(exp) ? exp : []);
        setBalance(bal && typeof bal === "object" ? bal : null);
        setBonus(bon && typeof bon === "object" && !bon.error ? bon : null);
        setMyTrips(Array.isArray(trips) ? trips : []);
      } else {
        const [exp, bal, bon, trips] = results;
        setOrders([]);
        setExpenses(Array.isArray(exp) ? exp : []);
        setBalance(bal && typeof bal === "object" ? bal : null);
        setBonus(bon && typeof bon === "object" && !bon.error ? bon : null);
        setMyTrips(Array.isArray(trips) ? trips : []);
      }

      // ── Extra: workflow orders + printed marks + statement snapshot + signatures ──
      Promise.all([
        fetch(`/api/workflow/orders?phone=${encodeURIComponent(phone)}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/driver-settlements/printed-marks/${encodeURIComponent(phone)}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/driver-settlements/statement/${encodeURIComponent(phone)}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/driver-settlements/statements/signatures/${encodeURIComponent(phone)}`, { headers: { Authorization: `Bearer ${authToken()}` } }).then(r => r.ok ? r.json() : []),
      ]).then(([wOrd, marks, stmt, sigs]) => {
        setWOrders(Array.isArray(wOrd) ? wOrd as { stage: string }[] : []);
        const marksArr = Array.isArray(marks) ? marks as PrintedMark[] : [];
        setPrintedMarks(new Set(marksArr.map(m => `${m.item_type}:${m.item_ref}`)));
        setPrintedMarksList(marksArr);
        const sigsArr = Array.isArray(sigs) ? sigs as { batch_key: string; signed_at: string }[] : [];
        setSignatures(new Map(sigsArr.map(s => [s.batch_key, s.signed_at])));
        if (stmt && typeof stmt === "object" && !stmt.error && stmt.totals) setStmtSnap(stmt as StmtSnap);
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  async function uploadCargoPhoto(file: File) {
    if (!plate) { alert("لا توجد سيارة مرتبطة بحسابك"); return; }
    setCargoUploading(true);
    try {
      // 1) رفع الملف إلى object storage
      const pr = await fetch("/api/storage/uploads/request-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!pr.ok) throw new Error("فشل توليد رابط الرفع");
      const { uploadURL, objectPath } = await pr.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error(`فشل رفع الملف (${putRes.status})`);
      const image_url = `/api/storage${objectPath}`;

      // 2) إنشاء قيد في سجل الردود
      const today = new Date().toISOString().slice(0, 10);
      const r = await fetch("/api/trips/driver-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify({ image_url, car_id: plate, driver_name: user?.name || "", date: today }),
      });
      if (!r.ok) throw new Error("فشل إنشاء القيد");
      const { id } = await r.json() as { id: number };
      setRecentUploads(prev => [{ id, image_url, date: today }, ...prev.slice(0, 4)]);
    } catch (err) {
      alert("فشل رفع الصورة — حاول مجددًا");
      console.error(err);
    } finally {
      setCargoUploading(false);
    }
  }

  function openEditTrip(trip: DriverTrip) {
    setEditingTrip(trip);
    setTripNote(trip.notes || "");
    setTripImgFile(null);
    setTripImgPrev(trip.image_url || "");
  }

  async function saveTripNote() {
    if (!editingTrip) return;
    setSavingTripNote(true);
    try {
      let newImageUrl = editingTrip.image_url;
      if (tripImgFile) {
        const pr = await fetch("/api/storage/uploads/request-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tripImgFile.name, size: tripImgFile.size, contentType: tripImgFile.type }),
        });
        if (!pr.ok) throw new Error("فشل توليد رابط الرفع");
        const { uploadURL, objectPath } = await pr.json() as { uploadURL: string; objectPath: string };
        const putRes = await fetch(uploadURL, { method: "PUT", body: tripImgFile, headers: { "Content-Type": tripImgFile.type } });
        if (!putRes.ok) throw new Error("فشل رفع الصورة");
        newImageUrl = `/api/storage${objectPath}`;
      }
      const body: Record<string, string> = { notes: tripNote };
      if (newImageUrl !== editingTrip.image_url) body.image_url = newImageUrl || "";
      const r = await fetch(`/api/trips/${editingTrip.id}/driver-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("فشل الحفظ");
      setEditingTrip(null);
      setTripImgFile(null);
      setTripImgPrev("");
      // Refresh trips list
      const fresh = await fetch("/api/trips/mine", { headers: { Authorization: `Bearer ${authToken()}` } });
      if (fresh.ok) setMyTrips(await fresh.json());
    } catch (err) {
      alert("فشل الحفظ — حاول مجددًا");
      console.error(err);
    } finally {
      setSavingTripNote(false);
    }
  }

  async function deleteTrip(id: number) {
    setDeletingTripId(id);
    try {
      const r = await fetch(`/api/trips/${id}/mine`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken()}` },
      });
      if (!r.ok) { alert("فشل الحذف — حاول مجددًا"); return; }
      setMyTrips(prev => prev.filter(t => t.id !== id));
      setRecentUploads(prev => prev.filter(u => u.id !== id));
    } catch {
      alert("فشل الحذف — حاول مجددًا");
    } finally {
      setDeletingTripId(null);
      setConfirmDeleteId(null);
    }
  }

  async function submitBreakdown() {
    if (!plate) { alert("لا توجد سيارة مرتبطة بحسابك"); return; }
    setSavingBreakdown(true);
    try {
      const fd = new FormData();
      fd.append("car_number", plate);
      fd.append("driver_name", user?.name || "");
      fd.append("driver_phone", phone || "");
      fd.append("operational_state", breakdownForm.operational_state);
      fd.append("action_taken", breakdownForm.action_taken);
      fd.append("description", breakdownForm.description);
      const r = await fetch("/api/vehicle-breakdowns", { method: "POST", body: fd });
      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل الإرسال"); return; }
      setBreakdownModal(false);
      setBreakdownForm({ ...EMPTY_BREAKDOWN_FORM });
      alert("✅ تم إرسال بلاغ العطل للورشة والمشرف");
    } finally {
      setSavingBreakdown(false);
    }
  }

  useEffect(() => { load(); }, [plate, phone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const refresh = () => { void load(); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sign a printed statement ────────────────────────────────────────────────
  async function signStatement(batchKey: string, signatureData: string) {
    if (!phone) return;
    setSigSaving(true);
    try {
      const r = await fetch(`/api/driver-settlements/statements/${encodeURIComponent(batchKey)}/sign`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({ driver_phone: phone, signature_data: signatureData }),
      });
      if (!r.ok) { alert("فشل حفظ التوقيع — حاول مجددًا"); return; }
      setSigModalBatchKey(null);
      // Refresh signatures
      const sigs = await fetch(`/api/driver-settlements/statements/signatures/${encodeURIComponent(phone)}`, { headers: { Authorization: `Bearer ${authToken()}` } }).then(r2 => r2.ok ? r2.json() : []);
      const sigsArr = Array.isArray(sigs) ? sigs as { batch_key: string; signed_at: string }[] : [];
      setSignatures(new Map(sigsArr.map(s => [s.batch_key, s.signed_at])));
    } catch { alert("فشل حفظ التوقيع"); }
    finally { setSigSaving(false); }
  }

  // ── Calculate net amount for a printed batch ────────────────────────────────
  function calcBatchNet(items: PrintedMark[]): number {
    if (!stmtSnap) return 0;
    let net = 0;
    for (const item of items) {
      if (item.item_type === "order") {
        const o = stmtSnap.orders.find(x => String(x.order_number) === item.item_ref);
        if (o) net += o.driver_bonus || 0;
      } else if (item.item_type === "trip") {
        const t = stmtSnap.trips.find(x => String(x.id) === item.item_ref);
        if (t) net += t.bonus || 0;
      } else if (item.item_type === "rental") {
        const r = stmtSnap.rentals.find(x => String(x.id) === item.item_ref);
        if (r) net += r.driver_bonus || 0;
      } else if (item.item_type === "supply_trip") {
        const t = stmtSnap.supply_trips.find(x => String(x.id) === item.item_ref);
        if (t) net += Number(t.rental) || 0;
      } else if (item.item_type === "expense") {
        const e = stmtSnap.expenses.find(x => String(x.id) === item.item_ref);
        if (e) net -= e.amount || 0;
      }
    }
    return net;
  }

  async function handleUpload(order: LoadingOrder, file: File) {
    setUploading(order.id);
    try {
      const pr = await fetch("/api/storage/uploads/request-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!pr.ok) throw new Error("فشل توليد رابط الرفع");
      const { uploadURL, objectPath } = await pr.json() as { uploadURL: string; objectPath: string };
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      await fetch(`/api/loading-orders/${order.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_plate: order.vehicle_plate, driver_name: order.driver_name, attachment_url: `/api/storage${objectPath}` }),
      });
      await load();
    } catch {
      alert("فشل رفع الملف — حاول مجددًا");
    } finally {
      setUploading(null);
    }
  }

  async function confirmDelivery(id: number) {
    setConfirming(id);
    try {
      await fetch(`/api/loading-orders/${id}/confirm`, { method: "PUT" });
      await load();
    } finally {
      setConfirming(null);
    }
  }

  function openAddExpense(type: "diesel" | "expense") {
    setEditExp(null);
    const vehicles = vehicleInfo?.vehicles || [];
    setExpForm({
      ...EMPTY_EXPENSE,
      expense_type: type === "diesel" ? "ديزل" : "مصروف",
      vehicle_plate: vehicles.length === 1 ? vehicles[0].plate_number : "",
    });
    setExpAttachFile(null);
    setExpAttachPrev("");
    setExpModal(type);
  }

  function openEditExpense(exp: Expense) {
    setEditExp(exp);
    setExpForm({
      expense_type: exp.expense_type,
      amount: String(exp.amount),
      liters: String(exp.liters || ""),
      description: exp.description || "",
      expense_date: exp.expense_date,
      vehicle_plate: exp.vehicle_plate || "",
    });
    setExpAttachFile(null);
    setExpAttachPrev(exp.attachment_url ? `/api/storage${exp.attachment_url}`.replace(/\/api\/storage\/api\/storage/, "/api/storage") : "");
    setExpModal(exp.expense_type === "ديزل" ? "diesel" : "expense");
  }

  async function uploadExpenseFile(file: File): Promise<string | null> {
    const pr = await fetch("/api/storage/uploads/request-url", {
      method: "POST", headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken()}`,
      },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (!pr.ok) throw new Error("تعذر تجهيز رفع صورة الفاتورة");
    const { uploadURL, objectPath } = await pr.json() as { uploadURL: string; objectPath: string };
    const uploaded = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!uploaded.ok) throw new Error("تعذر رفع صورة الفاتورة");
    return objectPath;
  }

  async function saveExpense() {
    if (!expForm.amount) { alert("أدخل المبلغ"); return; }
    if (!editExp && (vehicleInfo?.vehicles?.length || 0) > 1 && !expForm.vehicle_plate) {
      alert("اختر السيارة التي تخصها الفاتورة");
      return;
    }
    setSavingExp(true);
    try {
      let attachment_url: string | null = editExp?.attachment_url ?? null;
      if (expAttachFile) {
        const path = await uploadExpenseFile(expAttachFile);
        if (path) attachment_url = path;
      }
      const buildHeaders = (extra?: Record<string, string>): Record<string, string> => ({
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
      });
      if (editExp) {
        const r = await fetch(`/api/driver-expenses/${editExp.id}`, {
          method: "PUT", headers: buildHeaders(),
          body: JSON.stringify({ ...expForm, attachment_url }),
        });
        if (!r.ok) { const e = await r.json(); alert(e.error || "فشل التحديث"); return; }
      } else {
        const r = await fetch("/api/driver-expenses", {
          method: "POST", headers: buildHeaders(),
          body: JSON.stringify({
            ...expForm,
            driver_phone: phone,
            driver_name: user?.name,
            vehicle_plate: expForm.vehicle_plate || null,
            attachment_url,
          }),
        });
        const result = await r.json().catch(() => ({}));
        if (!r.ok || !result.expense) {
          alert(result.error || "لم يؤكد النظام حفظ الفاتورة");
          return;
        }
      }
      setExpModal(null);
      setEditExp(null);
      setExpAttachFile(null);
      setExpAttachPrev("");
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حفظ الفاتورة");
    } finally {
      setSavingExp(false);
    }
  }

  async function deleteExpense(id: number) {
    if (!confirm("حذف هذا المصروف؟")) return;
    setDeletingExp(id);
    try {
      const res = await fetch(`/api/driver-expenses/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { const e = await res.json(); alert(e.error || "فشل الحذف"); return; }
      await load();
    } finally {
      setDeletingExp(null);
    }
  }

  const pending   = orders.filter(o => o.status === "pending");
  const confirmed = orders.filter(o => o.status === "confirmed");

  return (
    <div className="space-y-5 w-full max-w-5xl mx-auto p-3 sm:p-5" dir="rtl">

      {/* Header */}
      <header className="space-y-3">
      {plate && vehicleInfo ? (
        <div className="flex items-center gap-3">
          {/* Vehicle image */}
          <div className="shrink-0 w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm">
            {vehicleImg ? (
              <img src={vehicleImg} alt={plate} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Truck className="w-8 h-8 text-gray-300" />
              </div>
            )}
          </div>
          {/* Driver + vehicle info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-black text-gray-900 leading-tight truncate">{user?.name}</h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg">
                {plate}
              </span>
              {vehicleInfo.vehicle_type && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">
                  {vehicleInfo.vehicle_type}
                </span>
              )}
              {vehicleInfo.max_weight_kg && (
                <span className="text-xs text-gray-400">{vehicleInfo.max_weight_kg.toLocaleString()} كغ</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <h1 className="text-3xl font-black text-gray-900">{user?.name}</h1>
            <p className="text-sm text-gray-400 mt-1">بوابة السائق</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-800 text-sm">لا يوجد سيارة مرتبطة بحسابك</div>
              <div className="text-xs text-amber-700 mt-1 leading-relaxed">
                اطلب من <span className="font-bold">مشرف الحركة</span> ربط سيارتك من صفحته ←
                {" "}<span className="font-bold">لوحة التحكم</span> → بطاقة <span className="font-bold">ربط سائق بسيارة</span>.
              </div>
            </div>
          </div>
        </div>
      )}
      <div id="driver-header-actions" className="flex flex-wrap items-center gap-2 empty:hidden" />
      </header>
      <div id="driver-top-vehicle" className="empty:hidden" />
      <div id="driver-top-supply" className="empty:hidden" />
      <div id="driver-top-assigned-rep" className="empty:hidden" />
      <div id="driver-top-assigned-bulker" className="empty:hidden" />
      <div id="driver-top-assigned-waiting" className="empty:hidden" />
      <div id="driver-top-assigned-ready" className="empty:hidden" />
      <div id="driver-top-assigned-loaded" className="empty:hidden" />

      {/* ── KPI strip — حالات الطلبات ── */}
      {(() => {
        const kpis = [
          { label: "في الانتظار", val: wOrders.filter(o => o.stage === "vehicle_assigned").length + pending.length, bg: "bg-yellow-500" },
          { label: "جاهز",        val: wOrders.filter(o => o.stage === "invoiced").length,          bg: "bg-blue-500"   },
          { label: "مُحمَّل",    val: wOrders.filter(o => o.stage === "loaded").length,             bg: "bg-orange-500" },
          { label: "مُسلَّم",   val: wOrders.filter(o => o.stage === "delivered").length + confirmed.length, bg: "bg-green-600" },
        ];
        return (
          <div className="grid grid-cols-4 gap-1 sm:gap-2">
            {kpis.map(k => (
              <div key={k.label} className={`${k.bg} min-w-0 rounded-xl px-1 py-2 sm:p-3 text-center text-white shadow-sm`}>
                <div className="text-base sm:text-xl font-black">{k.val}</div>
                <div className="text-[10px] sm:text-xs leading-tight opacity-90 mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── ملخص الديزل والصافي والباقي من الطباعة ── */}
      {(() => {
        // حساب الباقي من الطباعة
        let printedNet = 0;
        if (stmtSnap && printedMarks.size > 0) {
          (stmtSnap.orders       || []).forEach(o => { if (printedMarks.has(`order:${o.order_number}`))       printedNet += o.driver_bonus || 0; });
          (stmtSnap.trips        || []).forEach(t => { if (t.id != null && printedMarks.has(`trip:${t.id}`)) printedNet += t.bonus        || 0; });
          (stmtSnap.rentals      || []).forEach(r => { if (r.id != null && printedMarks.has(`rental:${r.id}`)) printedNet += r.driver_bonus || 0; });
          (stmtSnap.supply_trips || []).forEach(t => { if (printedMarks.has(`supply_trip:${t.id}`))          printedNet += Number(t.rental) || 0; });
          (stmtSnap.expenses     || []).forEach(e => { if (printedMarks.has(`expense:${e.id}`))              printedNet -= e.amount        || 0; });
        }
        const hasPrinted   = printedMarks.size > 0;
        const remaining    = hasPrinted ? printedNet - (stmtSnap?.totals?.total_settled ?? 0) : 0;
        const totalDiesel  = bonus?.total_diesel  ?? 0;
        const netBonus     = bonus?.net_bonus     ?? 0;

        return (
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
            {/* إجمالي الديزل */}
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 text-center">
              <div className="text-[10px] text-orange-500 font-semibold mb-1">إجمالي الديزل</div>
              <div className="text-2xl font-black text-orange-700">{totalDiesel.toLocaleString()}</div>
              <div className="text-[10px] text-orange-400">ر.س</div>
            </div>
            {/* الصافي بعد الديزل = gross − diesel */}
            <div className={`rounded-2xl p-3 text-center border ${netBonus >= 0 ? "bg-indigo-50 border-indigo-100" : "bg-red-50 border-red-100"}`}>
              <div className={`text-[10px] font-semibold mb-1 ${netBonus >= 0 ? "text-indigo-500" : "text-red-500"}`}>الصافي بعد الديزل</div>
              <div className={`text-2xl font-black ${netBonus >= 0 ? "text-indigo-700" : "text-red-700"}`}>{Math.abs(netBonus).toLocaleString()}</div>
              <div className={`text-[10px] ${netBonus >= 0 ? "text-indigo-400" : "text-red-400"}`}>ر.س</div>
            </div>
            {/* الباقي من الطباعة */}
            <div className={`rounded-2xl p-3 text-center border ${remaining >= 0 ? "bg-violet-50 border-violet-100" : "bg-red-50 border-red-100"}`}>
              <div className={`text-[10px] font-semibold mb-1 ${remaining >= 0 ? "text-violet-500" : "text-red-500"}`}>الباقي من الطباعة</div>
              <div className={`text-2xl font-black ${remaining >= 0 ? "text-violet-700" : "text-red-700"}`}>{Math.abs(remaining).toLocaleString()}</div>
              <div className={`text-[10px] ${remaining >= 0 ? "text-violet-400" : "text-red-400"}`}>ر.س</div>
            </div>
          </div>
        );
      })()}

      {/* ── كشوفاتي المطبوعة ── */}
      {(() => {
        // Group printed marks by batch_key (skip legacy marks with no batch_key)
        const batchMap = new Map<string, PrintedMark[]>();
        for (const m of printedMarksList) {
          if (!m.batch_key) continue;
          const list = batchMap.get(m.batch_key) ?? [];
          list.push(m);
          batchMap.set(m.batch_key, list);
        }
        if (batchMap.size === 0) return null;
        const batches = Array.from(batchMap.entries())
          .map(([bk, items]) => ({
            bk, items,
            date: items.reduce((latest, i) => i.marked_at > latest ? i.marked_at : latest, ""),
            net: calcBatchNet(items),
            signedAt: signatures.get(bk),
          }))
          .sort((a, b) => b.date.localeCompare(a.date));
        return (
          <div className="rounded-2xl border border-violet-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-violet-50">
              <PenLine className="w-4 h-4 text-violet-600" />
              <span className="font-bold text-violet-800 text-sm">كشوفاتي المطبوعة</span>
              <span className="bg-violet-100 text-violet-700 text-xs font-bold px-2 py-0.5 rounded-full">{batches.length}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {batches.map(({ bk, items, date, net, signedAt }) => (
                <div key={bk} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-800">
                        🖨️ {date ? new Date(date).toLocaleDateString("ar-SA") : "—"}
                      </span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
                        {items.length} بند
                      </span>
                      {net !== 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${net >= 0 ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50"}`}>
                          {net >= 0 ? "+" : "−"}{Math.abs(net).toLocaleString("ar-SA")} ر.س
                        </span>
                      )}
                    </div>
                    {signedAt && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          ✓ وقّعت بتاريخ {new Date(signedAt).toLocaleDateString("ar-SA")}
                        </span>
                      </div>
                    )}
                  </div>
                  {!signedAt && (
                    <button
                      onClick={() => setSigModalBatchKey(bk)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors shadow-sm"
                    >
                      <PenLine className="w-3 h-3" /> وقّع وابصم
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── صورة الحمولة ── */}
      <CargoPhotoUploadGate showCargoPhoto={vehicleInfo?.show_cargo_photo}>
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-indigo-600" />
            <span className="font-bold text-indigo-800 text-sm">صورة الحمولة</span>
          </div>
        </div>
        {/* hidden inputs — camera + gallery */}
        <input
          ref={cargoImgRef}
          type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { uploadCargoPhoto(f); e.target.value = ""; } }}
        />
        <input
          ref={cargoGalleryRef}
          type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { uploadCargoPhoto(f); e.target.value = ""; } }}
        />
        <div className="flex gap-2">
          <button
            onClick={() => cargoImgRef.current?.click()}
            disabled={cargoUploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 transition-colors shadow-sm"
          >
            {cargoUploading
              ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full" /> جاري الرفع...</>
              : <><Camera className="w-3 h-3" /> 📷 كاميرا</>}
          </button>
          <button
            onClick={() => cargoGalleryRef.current?.click()}
            disabled={cargoUploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-xs font-bold disabled:opacity-50 transition-colors"
          >
            🖼️ من المعرض
          </button>
        </div>
        {recentUploads.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {recentUploads.map(u => (
              <div key={u.id} className="relative group">
                <img
                  src={u.image_url}
                  alt="صورة حمولة"
                  onClick={() => setLightboxUrl(u.image_url)}
                  className="w-16 h-12 object-cover rounded-xl border-2 border-indigo-200 hover:border-indigo-400 transition-colors cursor-pointer shadow-sm"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-indigo-500 opacity-75">
            ارفع صورة حمولة مباشرة — تُسجَّل تلقائياً في سجل الردود
          </p>
        )}
      </div>
      </CargoPhotoUploadGate>

      {/* ── سجل الصور والرحلات ── */}
      {myTrips.length > 0 && (
        <div className="rounded-2xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setTripsExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-50/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileImage className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-emerald-800 text-sm">سجل الصور والرحلات</span>
              <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {myTrips.length}
              </span>
              {myTrips.some(t => t.route_bonus > 0) && (
                <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  بونص: {myTrips.reduce((s,t) => s + (t.route_bonus||0), 0).toLocaleString("ar-SA")} ر.س
                </span>
              )}
            </div>
            {tripsExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {tripsExpanded && (
            <div className="divide-y divide-gray-50">
              {myTrips.map(trip => (
                <div key={trip.id} className="px-4 py-3 flex items-start gap-3">
                  {/* Thumbnail — opens lightbox */}
                  <div
                    className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer active:opacity-80"
                    onClick={() => trip.image_url && setLightboxUrl(trip.image_url)}
                  >
                    {trip.image_url ? (
                      <img src={trip.image_url} alt="صورة" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileImage className="w-5 h-5 text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-800">{trip.date}</span>
                      {trip.trip_state && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md font-medium">{trip.trip_state}</span>
                      )}
                      {trip.route_bonus > 0 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md font-bold">
                          +{trip.route_bonus.toLocaleString("ar-SA")} ر.س
                        </span>
                      )}
                    </div>
                    {(trip.loading_region || trip.unloading_region || trip.destination) && (
                      <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-500">
                        <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="truncate">
                          {[trip.loading_region, trip.unloading_region || trip.destination].filter(Boolean).join(" ← ")}
                        </span>
                      </div>
                    )}
                    {trip.return_value_no_vat > 0 && (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        قيمة الرد: {trip.return_value_no_vat.toLocaleString("ar-SA")} ر.س
                      </div>
                    )}
                    {trip.notes && (
                      <div className="text-[11px] text-gray-500 mt-0.5 truncate">{trip.notes}</div>
                    )}
                    {!trip.image_url && !trip.loading_region && !trip.notes && (
                      <div className="text-[11px] text-amber-500 mt-0.5">في انتظار إضافة بيانات الرحلة من المدير</div>
                    )}
                  </div>

                  {/* حذف الرحلات للمدير فقط — مخفي من بوابة السائق */}
                  <div className="shrink-0 flex flex-col gap-1">
                    <button
                      onClick={() => openEditTrip(trip)}
                      className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 transition-colors"
                      title="إضافة ملاحظة أو صورة"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {false && confirmDeleteId === trip.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => deleteTrip(trip.id)}
                          disabled={deletingTripId === trip.id}
                          className="text-[9px] bg-red-500 text-white px-1.5 py-1 rounded-lg font-bold disabled:opacity-50"
                        >
                          {deletingTripId === trip.id ? "⏳" : "حذف"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-1 rounded-lg font-bold"
                        >
                          لا
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(trip.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-300 transition-colors hidden"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expense action button */}
      <div className="flex gap-2">
        <button onClick={() => openAddExpense("diesel")}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-sm transition-colors">
          <Fuel className="w-4 h-4" /> إضافة ديزل
        </button>
      </div>

      {/* Expenses list */}
      {expenses.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-gray-400" />
            <span className="font-bold text-gray-700 text-sm">المصروفات ({expenses.length})</span>
          </div>
          <div className="divide-y divide-gray-50">
            {expenses.map(exp => (
              <div key={exp.id} className="px-4 py-3 flex items-center gap-3">
                <span className={`text-lg ${exp.expense_type === "ديزل" ? "text-amber-500" : "text-purple-500"}`}>
                  {exp.expense_type === "ديزل" ? "⛽" : "🧾"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 text-sm">{exp.amount.toLocaleString()} ر.س</span>
                    {exp.expense_type === "ديزل" && exp.liters > 0 && (
                      <span className="text-xs text-gray-400">{exp.liters} لتر</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {exp.expense_type}{exp.description ? ` — ${exp.description}` : ""} · {exp.expense_date}
                  </div>
                  {exp.attachment_url && (
                    <a href={`/api/storage${exp.attachment_url}`.replace(/\/api\/storage\/api\/storage/, "/api/storage")}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline mt-0.5">
                      <Upload className="w-3 h-3" /> فاتورة ↗
                    </a>
                  )}
                </div>
                {/* تعديل وحذف المصروفات للمدير فقط — مخفي من بوابة السائق */}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400">جاري التحميل...</div>
      ) : (
        <>
          {/* Pending orders */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" /> معلقة ({pending.length})
              </h2>
              {pending.map(order => (
                <OrderCard key={order.id} order={order}
                  uploading={uploading === order.id}
                  confirming={confirming === order.id}
                  onUpload={(file) => handleUpload(order, file)}
                  onConfirm={() => confirmDelivery(order.id)}
                />
              ))}
            </div>
          )}

          {/* المسلمة — confirmed orders */}
          {confirmed.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" /> المسلمة ({confirmed.length})
              </h2>
              {confirmed.map(order => (
                <div key={order.id}
                  className="rounded-2xl p-4 bg-green-50 border border-green-200 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{order.permit_number || `أمر #${order.id}`}</div>
                      {order.cement_ref_number && (
                        <div className="text-xs text-gray-500 mt-0.5">مرجع: {order.cement_ref_number}</div>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                      <CheckCircle className="w-3.5 h-3.5" /> تم التسليم
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-gray-600">
                    {order.cargo_type && <div>البضاعة: <span className="font-medium text-gray-800">{order.cargo_type}</span></div>}
                    {order.unload_location && (
                      <div>
                        <div>موقع التنزيل: <span className="font-medium text-gray-800">{order.unload_location}</span></div>
                        {order.unload_location_phone && (
                          <a href={`tel:${order.unload_location_phone}`} className="inline-flex items-center gap-1 mt-1 text-blue-700 underline" dir="ltr">
                            <Phone className="w-3 h-3" />{order.unload_location_phone}
                          </a>
                        )}
                        {order.unload_location_map_url && (
                          <a href={order.unload_location_map_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-1 text-blue-700 underline">
                            <MapPin className="w-3 h-3" />فتح اللوكيشن
                          </a>
                        )}
                      </div>
                    )}
                    {order.confirmed_at && (
                      <div className="text-gray-400 mt-1">
                        وقت التسليم: {new Date(order.confirmed_at).toLocaleString("ar-SA")}
                      </div>
                    )}
                  </div>
                  {order.attachment_url && (
                    <a href={order.attachment_url} target="_blank" rel="noopener noreferrer"
                      className="inline-block mt-2 text-xs text-indigo-600 underline">
                      عرض الفاتورة ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

        </>
      )}

      {user && canAccess(user, "portal_driver") && (
        <section className="mt-8 border-t border-gray-200 pt-6">
          <DriverOrders hideRequestUi onRefresh={load} />
        </section>
      )}

      {/* Breakdown Report Modal */}
      {breakdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setBreakdownModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> إشعار بعطل السيارة
              </h3>
              <button onClick={() => setBreakdownModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {plate && (
              <div className="bg-red-50 rounded-xl px-3 py-2 text-sm text-red-700 font-semibold">
                السيارة: {plate}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">الحالة *</label>
                <select value={breakdownForm.operational_state}
                  onChange={e => setBreakdownForm(f => ({ ...f, operational_state: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option>متعطل</option>
                  <option>يعمل جزئياً</option>
                  <option>حادث</option>
                  <option>أخرى</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">الإجراء المتخذ</label>
                <input type="text"
                  value={breakdownForm.action_taken}
                  onChange={e => setBreakdownForm(f => ({ ...f, action_taken: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  placeholder="مثال: السيارة في مكانها، أُبلغ السائق..." />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">وصف العطل</label>
                <textarea rows={3}
                  value={breakdownForm.description}
                  onChange={e => setBreakdownForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  placeholder="صف العطل بالتفصيل..." />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={submitBreakdown} disabled={savingBreakdown}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors">
                <AlertTriangle className="w-4 h-4" />
                {savingBreakdown ? "جاري الإرسال..." : "إرسال البلاغ"}
              </button>
              <button onClick={() => setBreakdownModal(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Trip Edit Modal ── */}
      {editingTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setEditingTrip(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900 flex items-center gap-2">
                <FileImage className="w-4 h-4 text-emerald-600" /> تعديل الرحلة
              </h3>
              <button onClick={() => setEditingTrip(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
            </div>

            {/* Trip summary */}
            <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600 space-y-0.5">
              <div className="font-semibold text-gray-800">{editingTrip.date}</div>
              {editingTrip.loading_region && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-gray-400" />
                  {editingTrip.loading_region}{editingTrip.unloading_region ? ` ← ${editingTrip.unloading_region}` : ""}
                </div>
              )}
              {editingTrip.route_bonus > 0 && (
                <div className="text-emerald-600 font-bold">
                  بونص: {editingTrip.route_bonus.toLocaleString("ar-SA")} ر.س
                </div>
              )}
            </div>

            {/* Image */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">صورة الفاتورة / الحمولة</label>
              {/* hidden inputs — camera + gallery */}
              <input ref={tripImgRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setTripImgFile(f);
                  const reader = new FileReader();
                  reader.onload = ev => setTripImgPrev(ev.target?.result as string);
                  reader.readAsDataURL(f);
                  e.target.value = "";
                }} />
              <input ref={tripImgGalleryRef} type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setTripImgFile(f);
                  const reader = new FileReader();
                  reader.onload = ev => setTripImgPrev(ev.target?.result as string);
                  reader.readAsDataURL(f);
                  e.target.value = "";
                }} />
              {tripImgPrev && tripImgPrev.startsWith("data:") ? (
                <div className="relative">
                  <img src={tripImgPrev} alt="معاينة" className="w-full max-h-40 object-contain rounded-xl border border-gray-200" />
                  <button onClick={() => { setTripImgFile(null); setTripImgPrev(editingTrip.image_url || ""); }}
                    className="absolute top-1 left-1 bg-white/80 rounded-full p-0.5 text-red-500 hover:bg-red-50">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : tripImgPrev ? (
                <div className="relative">
                  <img src={tripImgPrev} alt="صورة الرحلة" className="w-full max-h-40 object-contain rounded-xl border border-gray-200" />
                  <div className="absolute bottom-1 left-1 flex gap-1">
                    <button onClick={() => tripImgRef.current?.click()}
                      className="bg-white/90 rounded-lg px-2 py-1 text-[10px] text-indigo-600 font-bold shadow">
                      📷 كاميرا
                    </button>
                    <button onClick={() => tripImgGalleryRef.current?.click()}
                      className="bg-white/90 rounded-lg px-2 py-1 text-[10px] text-indigo-600 font-bold shadow">
                      🖼️ معرض
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => tripImgRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors">
                  <Camera className="w-4 h-4" /> التقط أو اختر صورة
                </button>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">ملاحظات</label>
              <textarea rows={3}
                value={tripNote}
                onChange={e => setTripNote(e.target.value)}
                placeholder="أضف ملاحظة على هذه الرحلة..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={saveTripNote} disabled={savingTripNote}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                <CheckCircle className="w-4 h-4" />
                {savingTripNote ? "جاري الحفظ..." : "حفظ التعديل"}
              </button>
              <button onClick={() => setEditingTrip(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {expModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => { setExpModal(null); setEditExp(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900 flex items-center gap-2">
                {expModal === "diesel"
                  ? <><Fuel className="w-4 h-4 text-amber-500" />{editExp ? "تعديل ديزل" : "إضافة ديزل"}</>
                  : <><Receipt className="w-4 h-4 text-purple-500" />{editExp ? "تعديل مصروف" : "إضافة مصروف"}</>}
              </h3>
              <button onClick={() => { setExpModal(null); setEditExp(null); }}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              {!editExp && (vehicleInfo?.vehicles?.length || 0) > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    السيارة التي تخصها الفاتورة {(vehicleInfo?.vehicles?.length || 0) > 1 ? "*" : ""}
                  </label>
                  {(vehicleInfo?.vehicles?.length || 0) === 1 ? (
                    <div className="w-full border border-amber-200 rounded-xl px-3 py-2.5 text-sm bg-amber-50 text-amber-800 font-bold">
                      {vehicleInfo?.vehicles?.[0]?.plate_number} — {
                        vehicleInfo?.vehicles?.[0]?.assignment_role === "primary" ? "أساسية" : "احتياطية"
                      }
                    </div>
                  ) : (
                    <select
                      value={expForm.vehicle_plate}
                      onChange={e => setExpForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                      className="w-full border border-amber-200 rounded-xl px-3 py-2.5 text-sm bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="">-- اختر السيارة --</option>
                      {vehicleInfo?.vehicles?.map(vehicle => (
                        <option key={`${vehicle.plate_number}-${vehicle.assignment_role}`} value={vehicle.plate_number}>
                          {vehicle.plate_number} — {vehicle.assignment_role === "primary" ? "أساسية" : "احتياطية"}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">المبلغ (ر.س) *</label>
                <input type="number" min="0" step="0.01"
                  value={expForm.amount}
                  onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="0.00" autoFocus />
              </div>

              {expModal === "diesel" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">الكمية (لتر)</label>
                  <input type="number" min="0" step="0.1"
                    value={expForm.liters}
                    onChange={e => setExpForm(f => ({ ...f, liters: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="0.0" />
                </div>
              )}

              {expModal === "expense" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">البيان</label>
                  <input type="text"
                    value={expForm.description}
                    onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    placeholder="وصف المصروف" />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">التاريخ</label>
                <input type="date"
                  value={expForm.expense_date}
                  onChange={e => setExpForm(f => ({ ...f, expense_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>

              {/* صورة الفاتورة */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">صورة الفاتورة</label>
                <input ref={expFileRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setExpAttachFile(f);
                    if (f.type.startsWith("image/")) {
                      const reader = new FileReader();
                      reader.onload = ev => setExpAttachPrev(ev.target?.result as string);
                      reader.readAsDataURL(f);
                    } else {
                      setExpAttachPrev("");
                    }
                    e.target.value = "";
                  }} />
                {expAttachPrev && expAttachPrev.startsWith("data:image") ? (
                  <div className="relative">
                    <img src={expAttachPrev} alt="فاتورة" className="w-full max-h-40 object-contain rounded-xl border border-gray-200" />
                    <button onClick={() => { setExpAttachFile(null); setExpAttachPrev(""); }}
                      className="absolute top-1 left-1 bg-white/80 rounded-full p-0.5 text-red-500 hover:bg-red-50">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : expAttachPrev ? (
                  <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 rounded-xl px-3 py-2">
                    <Upload className="w-3.5 h-3.5" />
                    {expAttachFile ? expAttachFile.name : "فاتورة محفوظة"}
                    <button onClick={() => { setExpAttachFile(null); setExpAttachPrev(""); }}
                      className="mr-auto text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button onClick={() => expFileRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-amber-300 hover:text-amber-500 transition-colors">
                    <Upload className="w-4 h-4" /> اختر صورة أو PDF
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={saveExpense} disabled={
                savingExp ||
                !expForm.amount ||
                (!editExp && (vehicleInfo?.vehicles?.length || 0) > 1 && !expForm.vehicle_plate)
              }
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm text-white transition-colors disabled:opacity-50 ${expModal === "diesel" ? "bg-amber-500 hover:bg-amber-600" : "bg-purple-600 hover:bg-purple-700"}`}>
                <Plus className="w-4 h-4" />
                {savingExp ? "جاري الحفظ..." : editExp ? "تحديث" : "حفظ"}
              </button>
              <button onClick={() => { setExpModal(null); setEditExp(null); }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Signature Pad Modal ── */}
      {sigModalBatchKey && (
        <SignaturePad
          driverName={user?.name}
          onClose={() => setSigModalBatchKey(null)}
          onConfirm={async (dataUrl) => {
            if (sigSaving) return;
            await signStatement(sigModalBatchKey, dataUrl);
          }}
        />
      )}

      {/* ── Lightbox overlay ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="صورة الحمولة"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <a
            href={lightboxUrl}
            download
            className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/20 hover:bg-white/30 text-white text-sm font-bold px-4 py-2 rounded-full flex items-center gap-2 transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <Upload className="w-4 h-4 rotate-180" /> تحميل الصورة
          </a>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, uploading, confirming, onUpload, onConfirm }: {
  order: LoadingOrder;
  uploading: boolean;
  confirming: boolean;
  onUpload: (file: File) => void;
  onConfirm: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-2xl p-4 bg-white border border-gray-200 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-bold text-gray-900 text-sm">{order.permit_number || `أمر #${order.id}`}</div>
          {order.cement_ref_number && (
            <div className="text-xs text-gray-500 mt-0.5">مرجع: {order.cement_ref_number}</div>
          )}
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
          <Clock className="w-3.5 h-3.5" /> معلق
        </span>
      </div>

      <div className="space-y-1 text-xs text-gray-600 mb-3">
        {order.cargo_type && (
          <div>البضاعة: <span className="font-medium text-gray-800">{order.cargo_type}</span></div>
        )}
        {order.unload_location && (
          <div>
            <div>موقع التنزيل: <span className="font-medium text-gray-800">{order.unload_location}</span></div>
            {order.unload_location_phone && (
              <a href={`tel:${order.unload_location_phone}`} className="inline-flex items-center gap-1 mt-1 text-blue-700 underline" dir="ltr">
                <Phone className="w-3 h-3" />{order.unload_location_phone}
              </a>
            )}
            {order.unload_location_map_url && (
              <a href={order.unload_location_map_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-1 text-blue-700 underline">
                <MapPin className="w-3 h-3" />فتح اللوكيشن
              </a>
            )}
          </div>
        )}
        {order.notes && <div className="text-gray-400 mt-1">{order.notes}</div>}
      </div>

      <div className="flex gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ""; } }} />

        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "جاري الرفع..." : order.attachment_url ? "تحديث الفاتورة" : "رفع الفاتورة"}
        </button>

        {order.attachment_url && (
          <button onClick={onConfirm} disabled={confirming}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            <CheckCircle className="w-3.5 h-3.5" />
            {confirming ? "جاري..." : "تأكيد التنزيل"}
          </button>
        )}
      </div>

      {order.attachment_url && (
        <div className="mt-3">
          <a href={order.attachment_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-indigo-600 underline">
            عرض الفاتورة المرفوعة ↗
          </a>
        </div>
      )}
    </div>
  );
}
