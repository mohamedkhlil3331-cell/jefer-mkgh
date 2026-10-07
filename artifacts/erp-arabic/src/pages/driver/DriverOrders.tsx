import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { useRememberedState } from "@/hooks/useRememberedState";
import { useLang } from "@/context/LangContext";
import { compressInvoiceImage } from "@/lib/compressInvoiceImage";
import { uploadFilesToObjectStorage } from "@/lib/uploadFilesToObjectStorage";
import {
  Camera, CheckCircle, AlertTriangle, Fuel, DollarSign, Clock,
  X, Save, Truck, MapPin, Phone, Package, RefreshCw, FileText, Upload, Download, ExternalLink,
  TrendingUp, Hash, Navigation, ChevronLeft, Send, MessageCircle, Car, Lock, Activity, ChevronDown,
  User, Shield, BookOpen, Scale, FileImage, Pencil, Trash2, ChevronUp,
} from "lucide-react";
import DriverStatementModal from "@/pages/transportation/DriverStatementModal";
import DriverTripStageArt from "./DriverTripStageArt";
import PermitEnvelopeArt from "./PermitEnvelopeArt";

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string; delivery_location: string;
  destination_type: string; stage: string; vehicle_plate: string; invoice_image_url: string;
  invoice_number: string; loading_photo_url: string; created_at: string;
  delivery_lat?: number; delivery_lng?: number; supervisor_phone?: string; rep_phone?: string;
}

function waLink(phone: string): string {
  const n = phone.replace(/^0/, "966").replace(/\D/g, "");
  return `https://wa.me/${n}`;
}
function mapsLink(lat?: number, lng?: number, address?: string): string {
  if (lat && lng) return `https://www.google.com/maps?q=${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || "")}`;
}
/* stageLabel is now a hook inside the component — see makeStageLabelFn */

interface Balance {
  allocated: number; spent: number; remaining: number;
  last_settlement_date: string | null; driver_name: string;
  expenses: { id: number; amount: number; liters: number; expense_type: string; expense_date: string; order_number?: string; description?: string }[];
}

interface FactoryOrder {
  id: number; order_number: string;
  vehicle_plate: string | null; driver_name: string | null;
  product_name: string; quantity: number; unit: string;
  delivery_site: string | null;
  status: string;
  permit_number: string | null; permit_doc_url: string | null;
  loading_order_url: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface RepDriverReq {
  id: number; request_no: string; product_name: string;
  loading_locations: string[]; delivery_location: string | null;
  rep_name: string | null; rep_phone: string | null;
  vehicle_plate: string | null; driver_name: string | null;
  permit_photo_url: string | null; invoice_photo_url: string | null;
  status: string; notes: string | null; created_at: string;
}

interface DriverTrip {
  /* trip fields */
  id: number; supply_request_id: number;
  routing_dispatch_id: number | null;
  loading_location_name: string | null; loading_location_url: string | null;
  unloading_location_name: string | null; unloading_location_url: string | null;
  vehicle_plate?: string; driver_name?: string; driver_phone?: string;
  status: string;
  driver_loading_image?: string; permit_number?: string;
  loaded_at?: string; delivered_at?: string;
  /* joined from supply_request */
  product_name: string; requested_qty: number; unit: string;
  trailer_loads: number; priority: string;
  warehouse_name?: string; destination_division?: string;
  permit_image_url?: string | null; invoice_image?: string | null;
  cargo_type?: string | null; reference_no?: string | null;
  rep_name?: string | null; rep_phone?: string | null;
  customer_name?: string | null; customer_type?: string | null;
  cargo_items?: { cargo_type: string; quantity?: number | null; sort_order?: number }[];
  attachments?: { kind: string; url: string; file_name?: string; sort_order?: number }[];
  created_at: string;
  /* joined from warehouses */
  warehouse_lat?: number | null;
  warehouse_lng?: number | null;
  warehouse_location?: string | null;
}

function requiredInvoicePhotoCount(trip: DriverTrip): number {
  const attachments = trip.attachments || [];
  return attachments.filter(item => item.kind === "fsohat_permit").length
    || attachments.filter(item => item.kind === "supervisor_permit").length
    || ((trip.invoice_image || trip.permit_image_url) ? 1 : 1);
}

interface TripRecord {
  id: number; date: string; car_id: string; driver_name: string | null;
  destination: string | null; image_url: string | null; notes: string | null;
  route_bonus: number; return_value_no_vat: number; net_amount: number;
  trip_state: string | null; loading_region: string | null; unloading_region: string | null;
  trips_count: number; unit_price: number; client_name: string | null;
}

interface VehicleInfo {
  plate_number: string | null; vehicle_type: string | null; vehicle_name: string | null;
  vehicle_subtype: string | null; status: string | null; driver_name: string | null;
  insurance_start: string | null; insurance_end: string | null;
  inspection_start: string | null; inspection_end: string | null;
  operation_card_start: string | null; operation_card_end: string | null;
  entity: string | null; max_weight_kg: number | null; empty_weight_kg: number | null;
  iqama_no: string | null; iqama_start: string | null; iqama_end: string | null;
  driver_license_no: string | null; driver_license_end: string | null;
  nationality: string | null; hire_date: string | null;
  vehicles?: {
    plate_number: string;
    vehicle_type: string | null;
    vehicle_name: string | null;
    assignment_role: "primary" | "backup";
  }[];
}

function fmt(n: number) { return n.toLocaleString("ar-SA", { maximumFractionDigits: 0 }); }

interface ExternalRental {
  id: number; vehicle_type: string; customer_name: string; customer_phone: string;
  start_date: string; duration_type: string; duration_days: number;
  assigned_vehicle: string | null; assigned_driver: string | null;
  pickup_location: string | null; destination_location: string | null;
  total_price: number; notes: string | null; payment_method: string;
  status: string; driver_stage: string | null; driver_stage_at: string | null;
  created_at: string;
}

interface BulkerLoadingOrder {
  id: number;
  permit_number: string | null;
  cement_ref_number: string | null;
  vehicle_plate: string;
  driver_name: string;
  driver_phone: string | null;
  cargo_type: string | null;
  unload_location: string | null;
  unload_location_phone: string | null;
  unload_location_map_url: string | null;
  status: string;
  confirmed_at: string | null;
  attachment_url: string | null;
  loading_invoice_url: string | null;
  net_weight: string | null;
  tariff_id: number | null;
  tariff_loading_place: string | null; tariff_unloading_place: string | null;
  tariff_bonus: number | null; tariff_rental_per_ton: number | null;
  notes: string | null;
  created_at: string;
}

/* RENTAL_STAGE_MAP is now built inside the component using t() */

export default function DriverOrders({ hideRequestUi = false, onRefresh }: { hideRequestUi?: boolean; onRefresh?: () => void }) {
  const { user } = useAuth();
  const { t, dir } = useLang();

  const stageLabel = (stage: string): string => {
    const m: Record<string, string> = {
      pending:           t("stagePending"),
      payment_confirmed: t("stagePaymentConfirmed"),
      vehicle_assigned:  t("stageVehicleAssigned"),
      invoiced:          t("stageInvoiced"),
      loaded:            t("stageLoaded"),
      delivered:         t("stageDelivered"),
      cancelled:         t("stageCancelled"),
    };
    return m[stage] || stage;
  };

  const RENTAL_STAGE_MAP: Record<string, { label: string; next: string | null; nextLabel: string | null; color: string }> = {
    null_stage: { label: t("stageInvoiced"),  next: "loaded",    nextLabel: `✅ ${t("confirmLoad")}`,    color: "bg-blue-50 text-blue-700 border-blue-200"    },
    loaded:     { label: t("stageLoaded"),    next: "arrived",   nextLabel: `📍 ${t("confirmDelivery")}`, color: "bg-orange-50 text-orange-700 border-orange-200" },
    arrived:    { label: t("stageLoaded"),    next: "delivered", nextLabel: `🏁 ${t("confirmDelivery")}`, color: "bg-amber-50 text-amber-700 border-amber-200"  },
    delivered:  { label: t("stageDelivered"), next: null,        nextLabel: null,                          color: "bg-green-50 text-green-700 border-green-200"  },
  };

  const [orders,       setOrders]       = useState<Order[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [myRentals,    setMyRentals]    = useState<ExternalRental[]>([]);
  const [balance,      setBalance]      = useState<Balance | null>(null);
  const [loadingOrder,   setLoadingOrder]   = useState<Order | null>(null);
  const [dieselModal,    setDieselModal]    = useState<{ open: boolean; order?: Order }>({ open: false });
  const [dieselForm,     setDieselForm]     = useState({ amount: "", liters: "", description: "", vehicle_plate: "" });
  const [submitting,     setSubmitting]     = useState(false);
  const [breakdownModal, setBreakdownModal] = useState(false);
  const [bdForm,         setBdForm]         = useState({ type: "", description: "", operational_state: "", action_taken: "" });
  const [bdVehicle,      setBdVehicle]      = useState<{ id: number; plate: string } | null>(null);
  const [bdPlateInput,   setBdPlateInput]   = useState("");
  const [proposeModal, setProposeModal] = useState(false);
  const [proposeForm,  setProposeForm]  = useState({ loading_place: "", unloading_place: "" });
  const [proposeMsg,   setProposeMsg]   = useState<string | null>(null);
  const [tariffRows,   setTariffRows]   = useState<{ loading_place: string; unloading_place: string; driver_expense: number; rental: number }[]>([]);
  const [tariffLoaded, setTariffLoaded] = useState(false);
  const [pwModal,      setPwModal]      = useState(false);
  const [pwForm,       setPwForm]       = useState({ old: "", new1: "", new2: "" });
  const [pwMsg,        setPwMsg]        = useState<string | null>(null);
  const [showStatement, setShowStatement] = useState(false);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const [bonusMonth,   setBonusMonth]   = useRememberedState("driver-bonus-month-filter", thisMonth);
  const [bonusSummary, setBonusSummary] = useState<{
    gross_bonus: number; total_diesel: number; net_bonus: number;
    breakdown: { state: string; km: number; rate: number; bonus: number }[];
  } | null>(null);
  const [bonusLoading,    setBonusLoading]    = useState(false);
  const [bonusExpanded,   setBonusExpanded]   = useState(false);
  const [standaloneModal, setStandaloneModal] = useState(false);
  const [standForm,       setStandForm]       = useState({ amount: "", liters: "", description: "", entry_date: thisMonth + "-" + String(new Date().getDate()).padStart(2,"0"), vehicle_plate: "" });
  const [vehicleInfo,     setVehicleInfo]     = useState<VehicleInfo | null>(null);
  const [showVehicleCard, setShowVehicleCard] = useState(false);
  const [factoryOrders,   setFactoryOrders]   = useState<FactoryOrder[]>([]);

  // ── Driver doc requests ──
  interface DocRequest {
    id: number; driver_name: string | null; request_type: string; request_label: string;
    date: string | null; loading_location_name: string | null; cargo_type: string | null;
    status: string; created_at: string;
  }
  const QUICK_REQUESTS = [
    { type: "fasah_qassim",           label: t("reqFasahQassim") },
    { type: "fasah_madina_sattha",    label: t("reqFasahMadinaSattha") },
    { type: "fasah_madina_bulker",    label: t("reqFasahMadinaBulker") },
    { type: "invoice_bulk_gefer",     label: t("reqInvoiceBulkGefer") },
    { type: "invoice_bulk_madina",    label: t("reqInvoiceBulkMadina") },
  ];
  const [docRequests,      setDocRequests]      = useState<DocRequest[]>([]);
  const [docConfirm,       setDocConfirm]       = useState<{ type: string; label: string } | null>(null);
  const [docInvoiceModal,  setDocInvoiceModal]  = useState(false);
  const [docInvoiceForm,   setDocInvoiceForm]   = useState({
    date: new Date().toISOString().slice(0, 10),
    loading_location_name: "",
    cargo_type: "",
    loading_lat: null as number | null,
    loading_lng: null as number | null,
  });
  const [docGeoLoading,    setDocGeoLoading]    = useState(false);
  const [docSubmitting,    setDocSubmitting]    = useState(false);
  const [docSuccess,       setDocSuccess]       = useState<string | null>(null);
  const [foLoadingId,     setFoLoadingId]     = useState<number | null>(null);
  const [foSubmitting,    setFoSubmitting]    = useState(false);
  const [myTrips,         setMyTrips]         = useState<DriverTrip[]>([]);
  const [srLoadId,        setSrLoadId]        = useState<number | null>(null);
  const [srSubmitting,    setSrSubmitting]    = useState(false);
  const [srFiles,         setSrFiles]         = useState<File[]>([]);
  const [srInvoiceNo,     setSrInvoiceNo]     = useState("");
  const [foFile,          setFoFile]          = useState<File | null>(null);
  const srPhotoRef = useRef<HTMLInputElement>(null);
  const srCameraRef = useRef<HTMLInputElement>(null);
  const foLoadingPhotoRef = useRef<HTMLInputElement>(null);
  /* rep requests */
  const [repMyReqs,     setRepMyReqs]     = useState<RepDriverReq[]>([]);
  const [repLoadId,     setRepLoadId]     = useState<number | null>(null);
  const [repFile,       setRepFile]       = useState<File | null>(null);
  const [repSubmitting, setRepSubmitting] = useState(false);
  const repPhotoRef = useRef<HTMLInputElement>(null);
  const photoRef         = useRef<HTMLInputElement>(null);
  const photoGalleryRef  = useRef<HTMLInputElement>(null);
  const bdPhotoRef       = useRef<HTMLInputElement>(null);
  const bdPhotoGalleryRef = useRef<HTMLInputElement>(null);
  const [loadingPhotoFile, setLoadingPhotoFile] = useState<File | null>(null);

  /* ── أوامر تحميل البلكر ── */
  const [bulkerOrders,       setBulkerOrders]       = useState<BulkerLoadingOrder[]>([]);
  const [bulkerTariffs, setBulkerTariffs] = useState<{ id: number; loading_place: string; unloading_place: string; rental: number; driver_expense: number }[]>([]);
  const [bulkerSubmitting,   setBulkerSubmitting]   = useState(false);
  const [invoiceUploading,   setInvoiceUploading]   = useState<Record<number, boolean>>({});
  const [loadingConfirming,  setLoadingConfirming]  = useState<Record<number, boolean>>({});
  const bulkerInvoiceRefs    = useRef<Record<number, HTMLInputElement | null>>({});
  const [netWeightInputs,    setNetWeightInputs]    = useState<Record<number, string>>({});
  const [netWeightSaving,    setNetWeightSaving]    = useState<Record<number, boolean>>({});
  const [netWeightExtracting, setNetWeightExtracting] = useState<Record<number, boolean>>({});
  /* ── Lightbox لعرض الوثائق داخل التطبيق ── */
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxImgFailed, setLightboxImgFailed] = useState(false);
  const [brokenAttachments, setBrokenAttachments] = useState<Set<number>>(new Set());

  /* ── سجل صور الرحلات الشخصي ── */
  const [tripLog,            setTripLog]            = useState<TripRecord[]>([]);
  const [tripLogExpanded,    setTripLogExpanded]    = useState(true);
  const [editingTripLog,     setEditingTripLog]     = useState<TripRecord | null>(null);
  const [tripLogNote,        setTripLogNote]        = useState("");
  const [savingTripLogNote,  setSavingTripLogNote]  = useState(false);
  const [tripLogImgFile,     setTripLogImgFile]     = useState<File | null>(null);
  const [tripLogImgPrev,     setTripLogImgPrev]     = useState<string>("");
  const [deletingTripLogId,  setDeletingTripLogId]  = useState<number | null>(null);
  const [confirmDeleteTripId, setConfirmDeleteTripId] = useState<number | null>(null);
  const tripLogImgRef        = useRef<HTMLInputElement>(null);
  const tripLogImgGalleryRef = useRef<HTMLInputElement>(null);
  const openAttachmentLightbox = (rawUrl: string) => {
    setLightboxImgFailed(false);
    setLightboxUrl(`/api/storage${rawUrl}`.replace(/\/api\/storage\/api\/storage/, "/api/storage"));
  };

  const loadDocRequests = () => {
    if (!user) return;
    fetch(`/api/driver-doc-requests?driver_phone=${encodeURIComponent(user.phone)}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setDocRequests(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  const submitQuickDocRequest = async (type: string, label: string) => {
    if (!user) return;
    setDocSubmitting(true);
    try {
      const res = await fetch("/api/driver-doc-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_phone: user.phone, driver_name: user.name,
          request_type: type, request_label: label,
          date: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ");
      setDocConfirm(null);
      setDocSuccess(`✅ تم إرسال طلب "${label}" بنجاح`);
      loadDocRequests();
      setTimeout(() => setDocSuccess(null), 4000);
    } catch (e) { alert((e as Error).message); }
    finally { setDocSubmitting(false); }
  };

  const submitCustomDocRequest = async () => {
    if (!user || !docInvoiceForm.cargo_type.trim()) return;
    setDocSubmitting(true);
    try {
      const res = await fetch("/api/driver-doc-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_phone: user.phone, driver_name: user.name,
          request_type: "custom_invoice", request_label: "فاتورة مخصصة",
          date: docInvoiceForm.date,
          loading_lat: docInvoiceForm.loading_lat,
          loading_lng: docInvoiceForm.loading_lng,
          loading_location_name: docInvoiceForm.loading_location_name || null,
          cargo_type: docInvoiceForm.cargo_type.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ");
      setDocInvoiceModal(false);
      setDocInvoiceForm({ date: new Date().toISOString().slice(0, 10), loading_location_name: "", cargo_type: "", loading_lat: null, loading_lng: null });
      setDocSuccess("✅ تم إرسال الفاتورة المخصصة بنجاح");
      loadDocRequests();
      setTimeout(() => setDocSuccess(null), 4000);
    } catch (e) { alert((e as Error).message); }
    finally { setDocSubmitting(false); }
  };

  const detectDocLocation = () => {
    if (!navigator.geolocation) { alert("المتصفح لا يدعم تحديد الموقع"); return; }
    setDocGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setDocInvoiceForm(f => ({
          ...f,
          loading_lat: pos.coords.latitude,
          loading_lng: pos.coords.longitude,
          loading_location_name: f.loading_location_name || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        }));
        setDocGeoLoading(false);
      },
      () => { alert("تعذّر تحديد الموقع. تأكد من تفعيل خدمة الموقع."); setDocGeoLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const loadFactoryOrders = () => {
    if (!user) return;
    fetch(`/api/factory-orders/driver?phone=${user.phone}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setFactoryOrders(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  const loadMyTrips = () => {
    if (!user) return;
    fetch(`/api/supply-request-trips?driver_phone=${encodeURIComponent(user.phone)}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setMyTrips(Array.isArray(d) ? d.filter((t: DriverTrip) =>
        ["assigned","in_transit","loaded","delivered_to_warehouse","pending_warehouse_approval"].includes(t.status)
      ) : []))
      .catch(() => {});
  };

  const confirmSupplyLoad = async (trip: DriverTrip, capturedFiles?: File[]) => {
    const files = capturedFiles || srFiles;
    if (!files.length) { alert("يرجى رفع صورة الفاتورة أو وثيقة الفسح"); return; }
    const requiredCount = requiredInvoicePhotoCount(trip);
    if (trip.routing_dispatch_id != null && files.length !== requiredCount) {
      alert(`يجب رفع ${requiredCount} صورة، صورة واحدة لكل فسح`);
      return;
    }
    if (srSubmitting) return;
    setSrSubmitting(true);
    try {
      let res: Response;
      if (trip.routing_dispatch_id != null) {
        const loadingImages = await uploadFilesToObjectStorage(files, authToken());
        res = await fetch(`/api/supply-request-trips/${trip.id}/driver-load`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${authToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            permit_number: srInvoiceNo.trim() || "",
            loading_images: loadingImages,
          }),
        });
      } else {
        const fd = new FormData();
        fd.append("loading_image", files[0]);
        if (srInvoiceNo.trim()) fd.append("permit_number", srInvoiceNo.trim());
        res = await fetch(`/api/supply-request-trips/${trip.id}/driver-load`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${authToken()}` },
          body: fd,
        });
      }
      if (!res.ok) throw new Error((await res.json()).error || "خطأ");
      setSrLoadId(null);
      setSrFiles([]);
      setSrInvoiceNo("");
      loadMyTrips();
    } catch (e) { alert((e as Error).message); }
    finally { setSrSubmitting(false); }
  };

  const confirmSupplyDeliver = async (id: number) => {
    setSrSubmitting(true);
    try {
      const res = await fetch(`/api/supply-request-trips/${id}/driver-deliver`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${authToken()}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ");
      loadMyTrips();
    } catch (e) { alert((e as Error).message); }
    finally { setSrSubmitting(false); }
  };

  const uploadLoadingOrder = async (foId: number) => {
    if (!foFile) { alert("يرجى اختيار صورة أمر التحميل"); return; }
    setFoSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("loading_order_doc", foFile);
      const res = await fetch(`/api/factory-orders/${foId}/loading-order`, { method: "PUT", body: fd });
      if (!res.ok) throw new Error((await res.json()).error);
      setFoLoadingId(null);
      setFoFile(null);
      loadFactoryOrders();
    } catch (e) { alert((e as Error).message); }
    finally { setFoSubmitting(false); }
  };

  const confirmFactoryDelivery = async (foId: number) => {
    const notes = prompt("ملاحظات التسليم (اختياري):") ?? "";
    if (notes === null) return;
    setFoSubmitting(true);
    try {
      await fetch(`/api/factory-orders/${foId}/deliver`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivery_notes: notes }),
      });
      loadFactoryOrders();
    } catch (e) { alert((e as Error).message); }
    finally { setFoSubmitting(false); }
  };

  const loadVehicleInfo = () => {
    if (!user) return;
    fetch(`/api/driver-vehicle-info?phone=${encodeURIComponent(user.phone)}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setVehicleInfo(d);
        const vehicles = Array.isArray(d.vehicles) ? d.vehicles : [];
        if (vehicles.length === 1) {
          const plate = String(vehicles[0].plate_number || "");
          setDieselForm(f => ({ ...f, vehicle_plate: plate }));
          setStandForm(f => ({ ...f, vehicle_plate: plate }));
        } else {
          setDieselForm(f => ({
            ...f,
            vehicle_plate: vehicles.some((v: { plate_number?: string }) => v.plate_number === f.vehicle_plate) ? f.vehicle_plate : "",
          }));
          setStandForm(f => ({
            ...f,
            vehicle_plate: vehicles.some((v: { plate_number?: string }) => v.plate_number === f.vehicle_plate) ? f.vehicle_plate : "",
          }));
        }
      })
      .catch(() => {});
  };

  const printVehicleCard = () => {
    if (!vehicleInfo && !user) return;
    const v = vehicleInfo;
    const driverName = user?.name || v?.driver_name || "—";
    const driverPhone = user?.phone || "—";
    const row = (label: string, val: string | null | number | undefined) =>
      val ? `<tr><td class="lbl">${label}</td><td class="val">${val}</td></tr>` : "";
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
      <title>بطاقة السيارة — ${v?.plate_number || driverName}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        @page{size:A4 portrait;margin:15mm}html{width:210mm}body{width:210mm;margin:0 auto;padding:0}body{font-family:Arial,sans-serif;direction:rtl;color:#111;font-size:13px}@media screen{body{padding:16px}}
        .header{background:#103c68;color:#fff;padding:14px 20px;border-radius:10px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between}
        .header h1{font-size:17px;font-weight:900}
        .header .sub{font-size:12px;opacity:.8;margin-top:4px}
        .section{background:#f7f8fb;border:1px solid #e0e6f0;border-radius:10px;padding:14px 16px;margin-bottom:14px}
        .section-title{font-size:13px;font-weight:900;color:#103c68;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #103c68}
        table{width:100%;border-collapse:collapse}
        .lbl{width:44%;color:#555;padding:5px 2px;font-size:12px}
        .val{font-weight:700;color:#111;padding:5px 2px;font-size:12px}
        tr:nth-child(even) td{background:rgba(16,60,104,.04);border-radius:4px}
        .plate{font-size:22px;font-weight:900;color:#103c68;font-family:monospace;letter-spacing:2px}
        .print-btn{display:inline-block;margin-top:20px;padding:10px 24px;background:#103c68;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px}
        .wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.06;width:65%;pointer-events:none;z-index:-1}
        @media print{.print-btn{display:none}}
      </style></head><body>
      <img class="wm" src="/logo.png" alt="" />
      <div class="header">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="text-align:center">
            <img src="/jefer-logo-new.png" alt="JEFER" style="height:48px;object-fit:contain;background:#fff;border-radius:8px;padding:4px 8px;display:block"/>
            <div style="font-size:10px;font-weight:900;letter-spacing:2px;color:#103c68;margin-top:2px">MKGH</div>
          </div>
          <div>
            <h1>جيفر للنقل والخدمات اللوجستية</h1>
            <div class="sub">بطاقة بيانات السيارة والسائق</div>
          </div>
        </div>
        <div class="plate">${v?.plate_number || "—"}</div>
      </div>
      <div class="section">
        <div class="section-title">بيانات السائق</div>
        <table>
          ${row("الاسم",          driverName)}
          ${row("رقم الجوال",     driverPhone)}
          ${row("الجنسية",        v?.nationality)}
          ${row("رقم الإقامة",    v?.iqama_no)}
          ${row("انتهاء الإقامة", v?.iqama_end)}
          ${row("رقم رخصة القيادة",   v?.driver_license_no)}
          ${row("انتهاء الرخصة",       v?.driver_license_end)}
          ${row("تاريخ التعيين",  v?.hire_date)}
        </table>
      </div>
      <div class="section">
        <div class="section-title">بيانات السيارة</div>
        <table>
          ${row("رقم اللوحة",     v?.plate_number)}
          ${row("نوع السيارة",    v?.vehicle_type)}
          ${row("مسمى السيارة",   v?.vehicle_name)}
          ${row("النوع الفرعي",   v?.vehicle_subtype)}
          ${row("الجهة / المالك", v?.entity)}
          ${row("الحمولة القصوى", v?.max_weight_kg ? v.max_weight_kg + " كجم" : null)}
          ${row("الوزن الفارغ",   v?.empty_weight_kg ? v.empty_weight_kg + " كجم" : null)}
        </table>
      </div>
      <div class="section">
        <div class="section-title">صلاحيات الوثائق</div>
        <table>
          ${row("بداية التأمين",        v?.insurance_start)}
          ${row("انتهاء التأمين",       v?.insurance_end)}
          ${row("بداية الفحص الدوري",   v?.inspection_start)}
          ${row("انتهاء الفحص الدوري",  v?.inspection_end)}
          ${row("بداية بطاقة التشغيل",  v?.operation_card_start)}
          ${row("انتهاء بطاقة التشغيل", v?.operation_card_end)}
        </table>
      </div>
      <div style="color:#999;font-size:11px;margin-top:8px">تاريخ الطباعة: ${new Date().toLocaleDateString("ar-SA")}</div>
      <button class="print-btn" onclick="window.print()">🖨 طباعة</button>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const loadOrders = () => {
    if (!user) return;
    setLoading(true);
    fetch(`/api/workflow/orders?role=driver&phone=${user.phone}`)
      .then(r => r.json())
      .then(data => {
        setOrders(Array.isArray(data) ? data : []);
        const assigned = Array.isArray(data) ? data.find((o: Order) => ["vehicle_assigned","invoiced","loaded"].includes(o.stage)) : null;
        if (assigned?.vehicle_plate) {
          setBdVehicle({ id: 0, plate: assigned.vehicle_plate });
        }
      })
      .finally(() => setLoading(false));
  };
  const loadBalance = () => {
    if (!user) return;
    fetch(`/api/driver-balance?phone=${user.phone}`)
      .then(r => r.json()).then(setBalance).catch(() => {});
  };
  const loadBonus = (month?: string) => {
    if (!user) return;
    setBonusLoading(true);
    const m = month || bonusMonth;
    fetch(`/api/driver-bonus-summary?phone=${user.phone}&month=${m}`)
      .then(r => r.json()).then(setBonusSummary).catch(() => {})
      .finally(() => setBonusLoading(false));
  };
  const loadRentals = () => {
    if (!user) return;
    fetch(`/api/external-rentals/driver?phone=${user.phone}`)
      .then(r => r.json())
      .then(d => setMyRentals(Array.isArray(d) ? d : []))
      .catch(() => {});
  };
  // Depend on user?.id (not the object reference) so that a refreshUser call
  // that returns the same user doesn't re-trigger all fetches.
  const loadRepMyReqs = () => {
    if (!user) return;
    fetch(`/api/rep-requests?driver_phone=${encodeURIComponent(user.phone)}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setRepMyReqs(Array.isArray(d) ? d.filter((r: RepDriverReq) => ["permit_uploaded","loaded"].includes(r.status)) : []))
      .catch(() => {});
  };

  const loadBulkerOrders = () => {
    if (!user) return;
    fetch("/api/loading-orders/bulker-tariffs")
      .then(r => r.ok ? r.json() : [])
      .then(d => setBulkerTariffs(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch(`/api/loading-orders/by-driver/${encodeURIComponent(user.phone)}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setBulkerOrders(Array.isArray(d) ? d.filter((o: BulkerLoadingOrder) => o.status !== "confirmed") : []))
      .catch(() => {});
  };

  /* رفع فاتورة التحميل من السائق */
  const uploadBulkerInvoice = async (id: number, file: File) => {
    setInvoiceUploading(p => ({ ...p, [id]: true }));
    try {
      const uploadFile = await compressInvoiceImage(file);
      // طلب presigned URL
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uploadFile.name,
          size: uploadFile.size,
          contentType: uploadFile.type || "application/octet-stream",
        }),
      });
      if (!urlRes.ok) throw new Error("فشل استخراج رابط الرفع");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      // رفع الملف
      const upRes = await fetch(uploadURL, {
        method: "PUT",
        body: uploadFile,
        headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
      });
      if (!upRes.ok) throw new Error("فشل رفع الملف");
      // حفظ المسار في قاعدة البيانات
      const invoiceUrl = `/api/storage${objectPath}`;
      const saveRes = await fetch(`/api/loading-orders/${id}/upload-invoice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_url: invoiceUrl }),
      });
      if (!saveRes.ok) throw new Error((await saveRes.json()).error || "فشل حفظ الفاتورة");
      loadBulkerOrders();
      extractNetWeight(id);
    } catch (e) { alert((e as Error).message); }
    finally { setInvoiceUploading(p => ({ ...p, [id]: false })); }
  };

  /* قراءة الوزن الصافي تلقائياً من صورة الفاتورة عبر الذكاء الاصطناعي */
  const extractNetWeight = async (id: number) => {
    setNetWeightExtracting(p => ({ ...p, [id]: true }));
    try {
      const res = await fetch(`/api/loading-orders/${id}/extract-net-weight`, { method: "POST" });
      if (res.ok) {
        const data = await res.json() as { found: boolean; net_weight: string | null };
        if (data.found) {
          setNetWeightInputs(p => ({ ...p, [id]: data.net_weight || "" }));
          loadBulkerOrders();
        }
      }
    } catch { /* الوزن يمكن كتابته يدوياً إذا فشلت القراءة التلقائية */ }
    finally { setNetWeightExtracting(p => ({ ...p, [id]: false })); }
  };

  /* حفظ الوزن الصافي */
  const saveNetWeight = async (id: number) => {
    const value = (netWeightInputs[id] ?? "").trim();
    setNetWeightSaving(p => ({ ...p, [id]: true }));
    try {
      const res = await fetch(`/api/loading-orders/${id}/net-weight`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ net_weight: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل حفظ الوزن الصافي");
      loadBulkerOrders();
    } catch (e) { alert((e as Error).message); }
    finally { setNetWeightSaving(p => ({ ...p, [id]: false })); }
  };

  /* تأكيد التحميل (pending → loaded) */
  const confirmBulkerLoading = async (id: number) => {
    if (!window.confirm("تأكيد إتمام التحميل؟")) return;
    setLoadingConfirming(p => ({ ...p, [id]: true }));
    try {
      const res = await fetch(`/api/loading-orders/${id}/confirm-loading`, { method: "PUT" });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في التأكيد");
      loadBulkerOrders();
    } catch (e) { alert((e as Error).message); }
    finally { setLoadingConfirming(p => ({ ...p, [id]: false })); }
  };

  /* تأكيد التنزيل (loaded → confirmed) */
  const confirmBulkerDeliver = async (id: number) => {
    if (!window.confirm("تأكيد إتمام التنزيل؟ سيُسجَّل في سجل الرحلات.")) return;
    setBulkerSubmitting(true);
    try {
      const res = await fetch(`/api/loading-orders/${id}/confirm`, { method: "PUT" });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في التأكيد");
      loadBulkerOrders();
    } catch (e) { alert((e as Error).message); }
    finally { setBulkerSubmitting(false); }
  };

  const confirmRepLoad = async (id: number) => {
    setRepSubmitting(true);
    try {
      const fd = new FormData();
      if (repFile) fd.append("invoice_photo", repFile);
      const res = await fetch(`/api/rep-requests/${id}/load`, { method: "PUT", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ");
      setRepLoadId(null); setRepFile(null); loadRepMyReqs();
    } catch (e) { alert((e as Error).message); }
    finally { setRepSubmitting(false); }
  };

  const confirmRepDeliver = async (id: number) => {
    if (!window.confirm("هل تم التسليم؟")) return;
    setRepSubmitting(true);
    try {
      const res = await fetch(`/api/rep-requests/${id}/deliver`, { method: "PUT" });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ");
      loadRepMyReqs();
    } catch (e) { alert((e as Error).message); }
    finally { setRepSubmitting(false); }
  };

  /* ── سجل الرحلات — GET /trips/mine ── */
  const authToken = () => localStorage.getItem("mkgh_token") || "";

  const loadTripLog = () => {
    if (!user) return;
    fetch("/api/trips/for-driver", { headers: { Authorization: `Bearer ${authToken()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setTripLog(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  const openEditTripLog = (trip: TripRecord) => {
    setEditingTripLog(trip);
    setTripLogNote(trip.notes || "");
    setTripLogImgFile(null);
    setTripLogImgPrev(trip.image_url || "");
  };

  const saveTripLogNote = async () => {
    if (!editingTripLog) return;
    setSavingTripLogNote(true);
    try {
      let newImageUrl = editingTripLog.image_url;
      if (tripLogImgFile) {
        const pr = await fetch("/api/storage/uploads/request-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tripLogImgFile.name, size: tripLogImgFile.size, contentType: tripLogImgFile.type }),
        });
        if (!pr.ok) throw new Error("فشل توليد رابط الرفع");
        const { uploadURL, objectPath } = await pr.json() as { uploadURL: string; objectPath: string };
        const putRes = await fetch(uploadURL, { method: "PUT", body: tripLogImgFile, headers: { "Content-Type": tripLogImgFile.type } });
        if (!putRes.ok) throw new Error("فشل رفع الصورة");
        newImageUrl = `/api/storage${objectPath}`;
      }
      const body: Record<string, string> = { notes: tripLogNote };
      if (newImageUrl !== editingTripLog.image_url) body.image_url = newImageUrl || "";
      const r = await fetch(`/api/trips/${editingTripLog.id}/driver-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("فشل الحفظ");
      setEditingTripLog(null);
      setTripLogImgFile(null);
      setTripLogImgPrev("");
      loadTripLog();
    } catch (err) {
      alert("فشل الحفظ — حاول مجددًا");
      console.error(err);
    } finally {
      setSavingTripLogNote(false);
    }
  };

  const deleteTripLog = async (id: number) => {
    setDeletingTripLogId(id);
    try {
      const r = await fetch(`/api/trips/${id}/mine`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken()}` },
      });
      if (!r.ok) { alert("فشل الحذف — حاول مجددًا"); return; }
      setTripLog(prev => prev.filter(t => t.id !== id));
    } catch {
      alert("فشل الحذف — حاول مجددًا");
    } finally {
      setDeletingTripLogId(null);
      setConfirmDeleteTripId(null);
    }
  };

  useEffect(() => { loadOrders(); loadBalance(); loadBonus(); loadRentals(); loadVehicleInfo(); loadFactoryOrders(); loadMyTrips(); if (!hideRequestUi) loadDocRequests(); loadRepMyReqs(); loadBulkerOrders(); loadTripLog(); }, [user?.id, hideRequestUi]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const refreshAssignment = () => { loadVehicleInfo(); loadMyTrips(); };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshAssignment();
    };
    const interval = window.setInterval(refreshAssignment, 30_000);
    window.addEventListener("focus", refreshAssignment);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshAssignment);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [user?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmLoad = async () => {
    if (!loadingOrder) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      const loadPhoto = loadingPhotoFile || photoRef.current?.files?.[0] || photoGalleryRef.current?.files?.[0];
      if (loadPhoto) fd.append("loading_photo", loadPhoto);
      const res = await fetch(`/api/workflow/orders/${loadingOrder.id}/load`, { method: "PUT", body: fd });
      if (!res.ok) throw new Error((await res.json()).error);
      setLoadingOrder(null);
      setLoadingPhotoFile(null);
      loadOrders();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const sendLocation = async (order: Order) => {
    if (!user) return;
    if (!navigator.geolocation) { alert("المتصفح لا يدعم تحديد الموقع"); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/workflow/orders/${order.id}/driver-location`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              driver_phone: user.phone,
              driver_lat: pos.coords.latitude,
              driver_lng: pos.coords.longitude,
            }),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          alert("✅ تم إرسال موقعك للمشرف");
        } catch (err) { alert((err as Error).message); }
      },
      () => alert("تعذّر الحصول على موقعك. تأكد من تفعيل خدمة الموقع."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const confirmDelivery = async (order: Order) => {
    const notes = prompt("ملاحظات التسليم (اختياري):");
    if (notes === null) return;
    setSubmitting(true);
    try {
      await fetch(`/api/workflow/orders/${order.id}/deliver`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      loadOrders();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const openBreakdownModal = () => {
    const plate = bdVehicle?.plate || vehicleInfo?.plate_number || "";
    setBdPlateInput(plate);
    setBreakdownModal(true);
  };

  const submitBreakdown = async () => {
    const plateToUse = bdPlateInput.trim();
    if (!user || !bdForm.type) return;
    if (!plateToUse) { alert("يجب تحديد رقم لوحة السيارة قبل إرسال بلاغ العطل"); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("driver_phone", user.phone);
      fd.append("driver_name",  user.name);
      fd.append("breakdown_type",    bdForm.type);
      fd.append("description",       bdForm.description);
      fd.append("operational_state", bdForm.operational_state);
      fd.append("action_taken",      bdForm.action_taken);
      fd.append("vehicle_plate", plateToUse);
      if (bdVehicle) fd.append("vehicle_id", String(bdVehicle.id));
      if (bdPhotoRef.current?.files?.[0]) fd.append("photo", bdPhotoRef.current.files[0]);
      const res = await fetch("/api/workflow/breakdown-reports", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error);
      setBreakdownModal(false);
      setBdForm({ type: "", description: "", operational_state: "", action_taken: "" });
      setBdPlateInput("");
      alert("تم إرسال بلاغ العطل للمشرف ومدير الورشة");
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const changePassword = async () => {
    if (!user) return;
    if (pwForm.new1 !== pwForm.new2) { setPwMsg("❌ كلمتا المرور غير متطابقتين"); return; }
    if (pwForm.new1.length < 4) { setPwMsg("❌ كلمة المرور قصيرة جداً (4 أحرف على الأقل)"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, old_password: pwForm.old, new_password: pwForm.new1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPwMsg("✅ تم تغيير كلمة المرور بنجاح");
      setPwForm({ old: "", new1: "", new2: "" });
      setTimeout(() => { setPwModal(false); setPwMsg(null); }, 2000);
    } catch (err) { setPwMsg(`❌ ${(err as Error).message}`); }
    finally { setSubmitting(false); }
  };

  const openProposeModal = async () => {
    setProposeModal(true);
    if (!tariffLoaded) {
      try {
        const r = await fetch("/api/tariffs");
        if (r.ok) {
          const d = await r.json();
          setTariffRows(Array.isArray(d.rows) ? d.rows : []);
          setTariffLoaded(true);
        }
      } catch { /* ignore */ }
    }
  };

  const proposeTariff = async () => {
    if (!proposeForm.loading_place || !proposeForm.unloading_place || !user) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tariffs/propose", {
        method: "POST", headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify({ loading_place: proposeForm.loading_place, unloading_place: proposeForm.unloading_place, proposed_by: user.phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProposeMsg("✅ تم إرسال المسار المقترح للمشرف بنجاح");
      setProposeForm({ loading_place: "", unloading_place: "" });
      setTimeout(() => { setProposeModal(false); setProposeMsg(null); }, 2500);
    } catch (err) { setProposeMsg(`❌ ${(err as Error).message}`); }
    finally { setSubmitting(false); }
  };

  const addDiesel = async () => {
    if (!user || !dieselForm.amount) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/driver-expenses", {
        method: "POST", headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify({
          driver_phone: user.phone, driver_name: user.name,
          order_id: dieselModal.order?.id || null,
          order_number: dieselModal.order?.order_number || null,
          vehicle_plate: dieselModal.order?.vehicle_plate || dieselForm.vehicle_plate || null,
          expense_type: "ديزل",
          amount: parseFloat(dieselForm.amount) || 0,
          liters: parseFloat(dieselForm.liters) || 0,
          description: dieselForm.description || null,
          expense_date: new Date().toISOString().slice(0, 10),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.expense) {
        throw new Error(result.error || "لم يؤكد النظام حفظ المصروف");
      }
      setDieselModal({ open: false });
      setDieselForm(f => ({ amount: "", liters: "", description: "", vehicle_plate: f.vehicle_plate }));
      loadBalance();
      loadBonus();
    } catch (error) { alert(error instanceof Error ? error.message : "فشل تسجيل المصروف"); }
    finally { setSubmitting(false); }
  };

  const addStandaloneDiesel = async () => {
    if (!user || !standForm.amount) return;
    const assignedVehicles = vehicleInfo?.vehicles || [];
    if (assignedVehicles.length > 1 && !standForm.vehicle_plate) {
      alert("اختر السيارة التي تخصها الفاتورة");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/driver-expenses", {
        method: "POST", headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify({
          driver_phone: user.phone, driver_name: user.name,
          order_id: null, order_number: null,
          vehicle_plate: standForm.vehicle_plate || null,
          expense_type: "ديزل",
          amount: parseFloat(standForm.amount) || 0,
          liters: parseFloat(standForm.liters) || 0,
          description: standForm.description || null,
          expense_date: standForm.entry_date || new Date().toISOString().slice(0, 10),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.expense) {
        throw new Error(result.error || "لم يؤكد النظام حفظ فاتورة الديزل");
      }
      setStandaloneModal(false);
      setStandForm(f => ({ amount: "", liters: "", description: "", entry_date: new Date().toISOString().slice(0, 10), vehicle_plate: f.vehicle_plate }));
      loadBalance();
      loadBonus();
    } catch (error) { alert(error instanceof Error ? error.message : "فشل تسجيل الديزل"); }
    finally { setSubmitting(false); }
  };

  const updateRentalStage = async (rentalId: number, stage: string) => {
    try {
      await fetch(`/api/external-rentals/${rentalId}/driver-stage`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      loadRentals();
    } catch { alert("تعذّر تحديث مرحلة التأجير"); }
  };

  const waitingOrders  = orders.filter(o => o.stage === "vehicle_assigned");
  const readyOrders    = orders.filter(o => o.stage === "invoiced");
  const loadedOrders   = orders.filter(o => o.stage === "loaded");
  const deliveredOrders= orders.filter(o => o.stage === "delivered");
  const nearHeader = (content: ReactNode, slot: string) => {
    const target = hideRequestUi && typeof document !== "undefined" ? document.getElementById(slot) : null;
    return target ? createPortal(content, target) : content;
  };

  return (
    <>
    <div dir="rtl" className="space-y-5 pb-8">

      {/* lightbox يُرسم عبر portal مباشرة على document.body */}

      {/* ── Header ── */}
      {!hideRequestUi && <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{t("driverPortalTitle")}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-gray-400 text-sm">{user?.name}</p>
            {user?.vehicle_plate && (
              <span className="flex items-center gap-1 bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-mono font-bold">
                <Car size={10} />{user.vehicle_plate}
              </span>
            )}
          </div>
        </div>
      </div>}
      {nearHeader(
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { loadOrders(); loadBalance(); loadMyTrips(); loadRepMyReqs(); loadBulkerOrders(); onRefresh?.(); }}
            title="تحديث"
            aria-label="تحديث"
            className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={() => setShowStatement(true)}
            className="flex items-center gap-2 bg-[#103c68] text-white hover:bg-[#0d3257] px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors">
            <BookOpen size={15} />كشف حسابي
          </button>
          <button onClick={() => { setPwModal(true); setPwMsg(null); setPwForm({ old: "", new1: "", new2: "" }); }}
            className="flex items-center gap-2 bg-gray-100 text-gray-600 hover:bg-gray-200 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            title={t("changePassword")}>
            <Lock size={15} />{t("changePassword")}
          </button>
          {!hideRequestUi && (
            <button onClick={openProposeModal}
              className="flex items-center gap-2 bg-green-100 text-green-700 hover:bg-green-200 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors">
              <MapPin size={15} />{t("proposeTrip")}
            </button>
          )}
          <button onClick={openBreakdownModal}
            className="flex items-center gap-2 bg-red-100 text-red-600 hover:bg-red-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
            <AlertTriangle size={15} />{t("reportBreakdown")}
          </button>
        </div>,
        "driver-header-actions"
      )}

      {/* ── KPI strip ── */}
      {!hideRequestUi && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "في الانتظار",       val: waitingOrders.length,   color: "bg-yellow-500 text-white"  },
          { label: t("stageInvoiced"), val: readyOrders.length,    color: "bg-blue-500 text-white"   },
          { label: t("stageLoaded"),   val: loadedOrders.length,   color: "bg-orange-500 text-white"  },
          { label: t("stageDelivered"),val: deliveredOrders.length, color: "bg-green-600 text-white"   },
        ].map(({ label, val, color }) => (
          <div key={label} className={`${color} rounded-2xl p-3 text-center shadow-sm`}>
            <div className="text-2xl font-black">{val}</div>
            <div className="text-xs opacity-80 mt-0.5">{label}</div>
          </div>
        ))}
      </div>}

      {/* ── بيانات سيارتي ── */}
      {nearHeader(
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowVehicleCard(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Car size={18} className="text-[#103c68]" />
            <span className="font-bold text-gray-900">{t("myVehicleData")}</span>
            {vehicleInfo?.plate_number && (
              <span className="bg-[#103c68] text-white text-xs px-2 py-0.5 rounded-full font-mono font-bold">
                {vehicleInfo.plate_number}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={e => { e.stopPropagation(); printVehicleCard(); }}
              className="flex items-center gap-1.5 bg-[#103c68] hover:bg-[#0d3257] text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
            >
              <FileText size={13} />{t("printCard")}
            </button>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${showVehicleCard ? "rotate-180" : ""}`} />
          </div>
        </button>

        {showVehicleCard && vehicleInfo && (
          <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">
            {/* Driver personal data */}
            <div>
              <div className="text-xs font-bold text-[#103c68] mb-2 flex items-center gap-1.5">
                <User size={13} />{t("driverDataSection")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: t("customer"),       val: user?.name || vehicleInfo.driver_name },
                  { label: t("phone"),          val: user?.phone },
                  { label: t("nationality"),    val: vehicleInfo.nationality },
                  { label: t("iqamaNo"),        val: vehicleInfo.iqama_no },
                  { label: t("iqamaExpiry"),    val: vehicleInfo.iqama_end },
                  { label: t("licenseNo"),      val: vehicleInfo.driver_license_no },
                  { label: t("licenseExpiry"),  val: vehicleInfo.driver_license_end },
                ].filter(item => item.val).map(({ label, val }) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                    <div className="text-[10px] text-gray-400 mb-0.5">{label}</div>
                    <div className="text-xs font-bold text-gray-900 font-mono">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Vehicle data */}
            <div>
              <div className="text-xs font-bold text-[#103c68] mb-2 flex items-center gap-1.5">
                <Car size={13} />{t("vehicleDataSection")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: t("plateNumberLabel"),  val: vehicleInfo.plate_number },
                  { label: t("vehicleTypeLabel"),  val: vehicleInfo.vehicle_type },
                  { label: t("vehicleNameLabel"),  val: vehicleInfo.vehicle_name },
                  { label: t("vehicleSubtypeLabel"), val: vehicleInfo.vehicle_subtype },
                  { label: t("entityOwner"),       val: vehicleInfo.entity },
                  { label: t("maxWeight"),         val: vehicleInfo.max_weight_kg ? `${vehicleInfo.max_weight_kg} kg` : null },
                  { label: t("emptyWeight"),       val: vehicleInfo.empty_weight_kg ? `${vehicleInfo.empty_weight_kg} kg` : null },
                ].filter(item => item.val).map(({ label, val }) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                    <div className="text-[10px] text-gray-400 mb-0.5">{label}</div>
                    <div className="text-xs font-bold text-gray-900">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance dates */}
            {(vehicleInfo.insurance_end || vehicleInfo.inspection_end || vehicleInfo.operation_card_end) && (
              <div>
                <div className="text-xs font-bold text-[#103c68] mb-2 flex items-center gap-1.5">
                  <Shield size={13} />{t("docValidity")}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { label: t("insurance"),          start: vehicleInfo.insurance_start,        end: vehicleInfo.insurance_end },
                    { label: t("periodicInspection"), start: vehicleInfo.inspection_start,       end: vehicleInfo.inspection_end },
                    { label: t("operationCard"),      start: vehicleInfo.operation_card_start,   end: vehicleInfo.operation_card_end },
                  ].filter(d => d.end).map(({ label, start, end }) => {
                    const daysLeft = end ? Math.ceil((new Date(end).getTime() - Date.now()) / 86400000) : null;
                    const color = daysLeft === null ? "bg-gray-50 border-gray-200"
                      : daysLeft < 0 ? "bg-red-50 border-red-300"
                      : daysLeft < 30 ? "bg-amber-50 border-amber-300"
                      : "bg-green-50 border-green-200";
                    const textColor = daysLeft === null ? "text-gray-500"
                      : daysLeft < 0 ? "text-red-600"
                      : daysLeft < 30 ? "text-amber-600"
                      : "text-green-700";
                    return (
                      <div key={label} className={`rounded-xl px-3 py-2.5 border flex items-center justify-between ${color}`}>
                        <div>
                          <div className="text-[10px] text-gray-500 mb-0.5">{label}</div>
                          <div className="text-xs font-bold text-gray-800">
                            {start && <span className="text-gray-400 ml-1">{start} ←</span>}
                            {end}
                          </div>
                        </div>
                        {daysLeft !== null && (
                          <div className={`text-xs font-black ${textColor}`}>
                            {daysLeft < 0 ? t("expired") : daysLeft === 0 ? t("today") : `${daysLeft} d`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {showVehicleCard && !vehicleInfo && (
          <div className="border-t border-gray-100 px-5 py-6 text-center text-sm text-gray-400">
            {t("noVehicleLinked")}
          </div>
        )}
      </div>,
      "driver-top-vehicle"
      )}

      {/* ══ طلبات المستندات ══ */}
      {!hideRequestUi && <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-indigo-50">
          <div className="flex items-center gap-2">
            <FileText size={17} className="text-indigo-600" />
            <h2 className="font-bold text-gray-900">{t("docRequests")}</h2>
          </div>
          <button onClick={loadDocRequests} className="text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Success banner */}
          {docSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-semibold">
              {docSuccess}
            </div>
          )}

          {/* Quick request buttons */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2.5">{t("quickRequest")}</p>
            <div className="grid grid-cols-1 gap-2">
              {QUICK_REQUESTS.map(req => (
                <button
                  key={req.type}
                  onClick={() => setDocConfirm({ type: req.type, label: req.label })}
                  className="flex items-center gap-3 w-full text-right bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
                >
                  <FileText size={15} className="shrink-0 text-indigo-500" />
                  {req.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom invoice button */}
          <button
            onClick={() => setDocInvoiceModal(true)}
            className="flex items-center justify-center gap-2 w-full bg-[#103c68] hover:bg-[#0d3257] text-white px-4 py-3 rounded-xl text-sm font-bold transition-colors"
          >
            <Package size={15} />{t("newInvoiceEntry")}
          </button>

          {/* History */}
          {docRequests.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">{t("lastRequests")}</p>
              <div className="space-y-2">
                {docRequests.slice(0, 10).map(r => (
                  <div key={r.id} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{r.request_label}</div>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                        {r.date && <span>📅 {r.date}</span>}
                        {r.loading_location_name && <span>📍 {r.loading_location_name}</span>}
                        {r.cargo_type && <span>📦 {r.cargo_type}</span>}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(r.created_at).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    </div>
                    <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                      r.status === "done" ? "bg-green-100 text-green-700" :
                      r.status === "cancelled" ? "bg-red-100 text-red-600" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {r.status === "done" ? t("reqDone") : r.status === "cancelled" ? t("reqCancelled") : t("reqPending")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {docRequests.length === 0 && (
            <p className="text-center text-xs text-gray-400 pb-1">{t("noPreviousRequests")}</p>
          )}
        </div>
      </div>}

      {/* ── طلبات المناديب المُعيَّنة لهذا السائق ── */}
      {repMyReqs.length > 0 && (
        nearHeader(
        <div className="bg-white rounded-2xl border border-purple-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-purple-50">
            <div className="flex items-center gap-2">
              <span className="text-purple-600 text-lg">👤</span>
              <h2 className="font-bold text-gray-900">طلبات المناديب</h2>
              <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {repMyReqs.length}
              </span>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {repMyReqs.map(req => {
              const isOpen = repLoadId === req.id;
              const isLoaded = req.status === "loaded";
              return (
                <div key={req.id} className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-bold text-gray-900">📦 {req.product_name}</div>
                      <div className="font-mono text-xs text-gray-400">{req.request_no}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-bold flex-shrink-0 ${
                      isLoaded ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"
                    }`}>
                      {isLoaded ? "📦 في الطريق" : "📄 الفسحة صادرة"}
                    </span>
                  </div>

                  {req.permit_photo_url && (
                    <a href={req.permit_photo_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-xs text-purple-700 bg-purple-50 rounded-xl px-3 py-2 font-semibold">
                      👁️ عرض وثيقة الفسحة
                    </a>
                  )}

                  {req.loading_locations?.length > 0 && (
                    <div className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2">
                      📍 أماكن التحميل: {req.loading_locations.join(" · ")}
                    </div>
                  )}

                  {req.delivery_location && (
                    <div className="text-xs text-indigo-700 bg-indigo-50 rounded-xl px-3 py-2 break-all">
                      🗺️ {req.delivery_location}
                    </div>
                  )}

                  {req.rep_name && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                      👤 المندوب: <strong>{req.rep_name}</strong>
                      {req.rep_phone && (
                        <a href={`https://wa.me/966${req.rep_phone.replace(/^0/,"")}`} target="_blank" rel="noreferrer" className="text-green-600 underline font-bold">واتساب</a>
                      )}
                    </div>
                  )}

                  {/* Load action */}
                  {!isLoaded && (
                    isOpen ? (
                      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 space-y-2">
                        <p className="text-xs font-bold text-purple-700">رفع صورة الفاتورة (اختياري)</p>
                        <div className="border-2 border-dashed border-purple-200 rounded-xl p-3 text-center cursor-pointer hover:bg-white"
                          onClick={() => repPhotoRef.current?.click()}>
                          {repFile ? (
                            <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                              <span>{repFile.name}</span>
                              <button onClick={e => { e.stopPropagation(); setRepFile(null); }} className="text-red-400">✕</button>
                            </div>
                          ) : (
                            <div className="text-purple-400 text-sm">📸 صورة الفاتورة (اختياري)</div>
                          )}
                        </div>
                        <input ref={repPhotoRef} type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) setRepFile(f); }} />
                        <div className="flex gap-2">
                          <button onClick={() => { setRepLoadId(null); setRepFile(null); }}
                            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50">إلغاء</button>
                          <button onClick={() => confirmRepLoad(req.id)} disabled={repSubmitting}
                            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 disabled:opacity-60">
                            {repSubmitting ? "جارٍ التأكيد..." : "✅ تأكيد التحميل"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setRepLoadId(req.id)}
                        className="w-full py-3 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 flex items-center justify-center gap-2">
                        📦 تأكيد التحميل
                      </button>
                    )
                  )}

                  {/* Deliver action */}
                  {isLoaded && (
                    <button onClick={() => confirmRepDeliver(req.id)} disabled={repSubmitting}
                      className="w-full py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2">
                      {repSubmitting ? "جارٍ التأكيد..." : "🏁 تأكيد التسليم"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>,
        "driver-top-assigned-rep"
        )
      )}

      {/* ══ أوامر تحميل البلكر — مشرف الحركة ══ */}
      {bulkerOrders.length > 0 && (
        nearHeader(
        <div className="bg-white rounded-2xl border border-cyan-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-cyan-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">⛽</span>
              <h2 className="font-bold text-gray-900">أوامر تحميل البلكر</h2>
              <span className="bg-cyan-100 text-cyan-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {bulkerOrders.length}
              </span>
            </div>
            <button onClick={loadBulkerOrders} className="text-gray-400 hover:text-gray-600 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {bulkerOrders.map(lo => {
              const isPending  = lo.status === "pending";
              const isLoaded   = lo.status === "loaded";
              const hasInvoice = !!lo.loading_invoice_url;
              const currentTariff = bulkerTariffs.find(t => t.id === lo.tariff_id);
              const tariff = lo.tariff_loading_place ? {
                loading_place: lo.tariff_loading_place,
                unloading_place: lo.tariff_unloading_place || "",
                driver_expense: lo.tariff_bonus || 0,
                rental: lo.tariff_rental_per_ton || 0,
              } : currentTariff;
              return (
              <div key={lo.id} className="px-5 py-4 space-y-3">

                {/* ─ رأس الكارد: المعلومات + شارة الحالة ─ */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    {lo.cargo_type && (
                      <div className="font-bold text-gray-900">📦 {lo.cargo_type}</div>
                    )}
                    {lo.permit_number && (
                      <div className="text-xs text-gray-500 font-mono">
                        رقم الفسح: <strong className="text-gray-700">{lo.permit_number}</strong>
                      </div>
                    )}
                    {lo.cement_ref_number && (
                      <div className="text-xs text-gray-500 font-mono">
                        مرجع الأسمنت: <strong className="text-gray-700">{lo.cement_ref_number}</strong>
                      </div>
                    )}
                    <div className="text-[10px] text-gray-400">
                      {new Date(lo.created_at).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </div>
                  {isPending ? (
                    <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">⏳ في الانتظار</span>
                  ) : (
                    <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">✅ تم التحميل</span>
                  )}
                </div>

                {/* ─ وثيقة المشرف ─ */}
                {lo.attachment_url && (() => {
                  const href = `/api/storage${lo.attachment_url}`.replace(/\/api\/storage\/api\/storage/, "/api/storage");
                  const looksLikePdf = lo.attachment_url.toLowerCase().endsWith(".pdf") || lo.attachment_url.toLowerCase().includes("/pdf");
                  const showAsDocument = looksLikePdf || brokenAttachments.has(lo.id);
                  return (
                    <div className="rounded-xl border-2 border-cyan-300 bg-cyan-50 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-200 bg-cyan-100">
                        <div className="flex items-center gap-2 text-sm font-bold text-cyan-900">
                          <FileText size={15} />صورة الفسح — من المشرف
                        </div>
                      </div>
                      {showAsDocument ? (
                        <div className="p-4 flex flex-col items-center gap-3">
                          <div className="text-5xl">📄</div>
                           <p className="text-sm text-cyan-800 font-semibold">مستند الفسح المرفق</p>
                          <button
                            onClick={() => openAttachmentLightbox(lo.attachment_url!)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-bold transition-colors">
                             <ExternalLink size={14} />عرض صورة الفسح
                          </button>
                        </div>
                      ) : (
                        <button
                          className="w-full block p-0 border-0 bg-transparent cursor-zoom-in"
                          onClick={() => openAttachmentLightbox(lo.attachment_url!)}
                        >
                          <img
                             src={href} alt="صورة الفسح"
                            className="w-full object-contain bg-white"
                            style={{ maxHeight: "320px" }}
                            onError={() => setBrokenAttachments(prev => new Set(prev).add(lo.id))}
                          />
                          <div className="py-2 text-center text-xs text-cyan-700 font-semibold bg-cyan-50 flex items-center justify-center gap-1">
                            <ExternalLink size={11} />اضغط لعرض الوثيقة كاملاً
                          </div>
                        </button>
                      )}
                    </div>
                  );
                })()}

                {tariff && <div className="text-xs bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2 space-y-1">
                  <div>مكان التحميل: <strong>{tariff.loading_place}</strong> · مسار التعريفة: <strong>{tariff.unloading_place}</strong></div>
                  <div>البونص: <strong>{tariff.driver_expense.toLocaleString("ar-SA")} ر.س</strong> · إيجار الطن: <strong>{tariff.rental.toLocaleString("ar-SA")} ر.س</strong></div>
                  {lo.net_weight && <div>الإيجار حسب الوزن المسجل: <strong>{(tariff.rental * (() => {
                    const raw = lo.net_weight!.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
                      .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
                      .replace(/٬/g, ",").replace(/٫/g, ".");
                    const value = Number(raw.match(/\d[\d,.]*/)?.[0].replace(/,/g, "") || 0);
                    return /كجم|كيلو|kg/i.test(raw) || (!/طن|ton/i.test(raw) && value >= 1000) ? value / 1000 : value;
                  })()).toLocaleString("ar-SA")} ر.س</strong></div>}
                </div>}
                {lo.notes && (
                  <div className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2">
                    📝 {lo.notes}
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════
                    المرحلة ١ — رفع فاتورة التحميل (status = pending)
                    ═══════════════════════════════════════════════════════ */}
                {isPending && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-2">
                    <div className="text-sm font-bold text-orange-800 flex items-center gap-2">
                      <FileText size={14} />فاتورة التحميل
                    </div>

                    {/* معاينة الفاتورة المرفوعة */}
                    {hasInvoice && (
                      <div className="relative">
                        <img src={lo.loading_invoice_url!} alt="فاتورة التحميل"
                          className="w-full max-h-52 object-contain rounded-lg border border-orange-200 bg-white cursor-pointer"
                          onClick={() => window.open(lo.loading_invoice_url!, "_blank")} />
                        <a href={lo.loading_invoice_url!} download target="_blank" rel="noreferrer"
                          className="absolute top-1 end-1 bg-white/80 backdrop-blur rounded-full px-2 py-1 text-xs text-orange-700 font-semibold flex items-center gap-1 shadow">
                          <Download size={11} />تحميل
                        </a>
                      </div>
                    )}

                    {/* الوزن الصافي */}
                    <div>
                      <label className="text-xs font-bold text-orange-800 flex items-center gap-1 mb-1">
                        <Scale size={12} />الوزن الصافي
                        {netWeightExtracting[lo.id] && <span className="text-orange-500 font-normal">— 🤖 جاري القراءة من الفاتورة...</span>}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text" inputMode="decimal"
                          value={netWeightInputs[lo.id] ?? lo.net_weight ?? ""}
                          onChange={e => setNetWeightInputs(p => ({ ...p, [lo.id]: e.target.value }))}
                          onBlur={() => {
                            const val = (netWeightInputs[lo.id] ?? "").trim();
                            if (val !== (lo.net_weight ?? "")) saveNetWeight(lo.id);
                          }}
                          placeholder="اكتب الوزن الصافي، أو ارفع الفاتورة لقراءته تلقائياً..."
                          className="flex-1 px-3 py-2 text-sm border border-orange-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                        />
                        {netWeightSaving[lo.id] && <span className="text-xs text-orange-500 self-center">⏳</span>}
                      </div>
                    </div>

                    {/* زر الرفع / الإعادة */}
                    {/* مدخل الملف — صورة أو PDF */}
                    <input
                      type="file" accept="image/*,application/pdf"
                      className="hidden"
                      ref={el => { bulkerInvoiceRefs.current[lo.id] = el; }}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadBulkerInvoice(lo.id, f);
                        e.target.value = "";
                      }}
                    />
                    {/* زر رفع من الملفات / المعرض */}
                    <button
                      onClick={() => bulkerInvoiceRefs.current[lo.id]?.click()}
                      disabled={invoiceUploading[lo.id]}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-orange-300 hover:border-orange-400 text-orange-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                    >
                      {invoiceUploading[lo.id] ? (
                        "⏳ جاري تجهيز الفاتورة ورفعها..."
                      ) : hasInvoice ? (
                        <><Upload size={14} />تغيير الفاتورة (صورة أو PDF)</>
                      ) : (
                        <><Upload size={14} />رفع فاتورة التحميل (صورة أو PDF)</>
                      )}
                    </button>

                    {/* زر تأكيد التحميل */}
                    <button
                      onClick={() => confirmBulkerLoading(lo.id)}
                      disabled={!hasInvoice || loadingConfirming[lo.id] || invoiceUploading[lo.id]}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors"
                    >
                      <CheckCircle size={15} />
                      {loadingConfirming[lo.id] ? "جاري التأكيد..." : "تأكيد إتمام التحميل"}
                    </button>
                    {!hasInvoice && (
                      <p className="text-[10px] text-orange-600 text-center">ارفع صورة الفاتورة أولاً لتفعيل زر التأكيد</p>
                    )}
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════
                    المرحلة ٢ — عرض فاتورة التحميل المرفوعة (status = loaded)
                    ═══════════════════════════════════════════════════════ */}
                {isLoaded && lo.loading_invoice_url && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
                    <div className="text-sm font-bold text-green-800 flex items-center gap-2">
                      <FileText size={14} />فاتورة التحميل ✅
                    </div>
                    <div className="relative">
                      <img src={lo.loading_invoice_url} alt="فاتورة التحميل"
                        className="w-full max-h-52 object-contain rounded-lg border border-green-200 bg-white cursor-pointer"
                        onClick={() => window.open(lo.loading_invoice_url!, "_blank")} />
                      <a href={lo.loading_invoice_url} download target="_blank" rel="noreferrer"
                        className="absolute top-1 end-1 bg-white/80 backdrop-blur rounded-full px-2 py-1 text-xs text-green-700 font-semibold flex items-center gap-1 shadow">
                        <Download size={11} />تحميل
                      </a>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-green-800 flex items-center gap-1 mb-1">
                        <Scale size={12} />الوزن الصافي
                        {netWeightExtracting[lo.id] && <span className="text-green-600 font-normal">— 🤖 جاري القراءة من الفاتورة...</span>}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text" inputMode="decimal"
                          value={netWeightInputs[lo.id] ?? lo.net_weight ?? ""}
                          onChange={e => setNetWeightInputs(p => ({ ...p, [lo.id]: e.target.value }))}
                          onBlur={() => {
                            const val = (netWeightInputs[lo.id] ?? "").trim();
                            if (val !== (lo.net_weight ?? "")) saveNetWeight(lo.id);
                          }}
                          placeholder="اكتب الوزن الصافي، أو ارفع الفاتورة لقراءته تلقائياً..."
                          className="flex-1 px-3 py-2 text-sm border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300 bg-white"
                        />
                        {netWeightSaving[lo.id] && <span className="text-xs text-green-500 self-center">⏳</span>}
                      </div>
                    </div>

                    {/* تعديل / استبدال الفاتورة بعد الرفع */}
                    <input
                      type="file" accept="image/*,application/pdf"
                      className="hidden"
                      ref={el => { bulkerInvoiceRefs.current[lo.id] = el; }}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadBulkerInvoice(lo.id, f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      onClick={() => bulkerInvoiceRefs.current[lo.id]?.click()}
                      disabled={invoiceUploading[lo.id]}
                      className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-green-300 hover:border-green-400 text-green-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                    >
                      {invoiceUploading[lo.id] ? "⏳ جاري الرفع..." : <><Upload size={14} />تعديل / استبدال الفاتورة</>}
                    </button>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════
                    المرحلة ٢ب — موقع التنزيل (يظهر فقط بعد التحميل)
                    ═══════════════════════════════════════════════════════ */}
                {isLoaded && lo.unload_location && (
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 flex items-center gap-3">
                    <span className="text-2xl">📍</span>
                    <div className="min-w-0">
                      <div className="text-xs text-cyan-600 font-semibold">وجهة التنزيل</div>
                      <div className="font-bold text-cyan-900">{lo.unload_location}</div>
                      {lo.unload_location_phone && (
                        <a href={`tel:${lo.unload_location_phone}`} className="inline-flex items-center gap-1 mt-1 text-xs text-cyan-800 underline" dir="ltr">
                          <Phone size={12} />{lo.unload_location_phone}
                        </a>
                      )}
                      {lo.unload_location_map_url && (
                        <a href={lo.unload_location_map_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-1 text-xs text-cyan-800 underline">
                          <MapPin size={12} />فتح اللوكيشن
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════
                    المرحلة ٣ — تأكيد التنزيل (يظهر فقط بعد تحديد الموقع)
                    ═══════════════════════════════════════════════════════ */}
                {isLoaded && !lo.unload_location && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-700 font-semibold">
                    ⏳ في انتظار تحديد موقع التنزيل من المشرف
                  </div>
                )}
                {isLoaded && lo.unload_location && (
                  <button
                    onClick={() => confirmBulkerDeliver(lo.id)}
                    disabled={bulkerSubmitting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors"
                  >
                    <CheckCircle size={15} />
                    {bulkerSubmitting ? "جاري التأكيد..." : "✅ تأكيد إتمام التنزيل"}
                  </button>
                )}
              </div>
              );
            })}
          </div>
        </div>,
        "driver-top-assigned-bulker"
        )
      )}

      {/* ── Factory Orders card ── */}
      {/* ── طلبات التوريد المُعيَّنة لهذا السائق ── */}
      {myTrips.length > 0 && (
        nearHeader(
        <div className="bg-white rounded-2xl border border-teal-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-teal-50">
            <div className="flex items-center gap-2">
              <Truck size={17} className="text-teal-600" />
              <h2 className="font-bold text-gray-900">{t("assignedSupplyRequests")}</h2>
              {myTrips.filter(t => t.status === "in_transit" || (t.status === "assigned" && t.invoice_image)).length > 0 && (
                <span className="bg-teal-100 text-teal-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {myTrips.filter(t => t.status === "in_transit" || (t.status === "assigned" && t.invoice_image)).length} {t("readyLabel")}
                </span>
              )}
            </div>
            <button onClick={loadMyTrips} className="text-gray-400 hover:text-gray-600 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {myTrips.map(sr => {
              const readyToLoad = sr.status === "in_transit" || (sr.status === "assigned" && !!sr.invoice_image);
              const statusLabel =
                sr.status === "pending_warehouse_approval" ? { label: `✅ ${t("stageDelivered")} — ${t("assignedSupplyRequests")}`, color: "bg-purple-100 text-purple-700" } :
                sr.status === "delivered_to_warehouse"     ? { label: `🏁 ${t("stageDelivered")}`,                                   color: "bg-indigo-100 text-indigo-700" } :
                sr.status === "loaded"                     ? { label: `📦 ${t("stageLoaded")}`,                                       color: "bg-blue-100 text-blue-700"    } :
                readyToLoad                                ? { label: `✅ ${t("readyLabel")}`,                                         color: "bg-teal-100 text-teal-700"    } :
                                                            { label: `⏳ ${t("reqPending")}`,                                          color: "bg-amber-100 text-amber-700"  };
              const isOpen = srLoadId === sr.id;

              return (
                <div key={sr.id} className="px-5 py-4 space-y-3">

                  {/* ─ معلومات الطلب ─ */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusLabel.color}`}>{statusLabel.label}</span>
                    </div>
                    <div className="font-bold text-gray-900">🏭 {sr.product_name}</div>
                    <div className="text-sm text-gray-600 mt-0.5">
                      {sr.requested_qty?.toLocaleString("ar-SA")} {sr.unit}
                      {sr.vehicle_plate && <span className="mr-2 font-mono text-gray-500">· {sr.vehicle_plate}</span>}
                    </div>
                    {(sr.cargo_items?.length || sr.cargo_type || sr.rep_name || sr.rep_phone) && (
                      <div className="flex flex-wrap gap-3 text-xs text-gray-600 mt-1">
                        {sr.cargo_items?.length
                          ? sr.cargo_items.map((item, index) => (
                            <span key={`${item.cargo_type}-${index}`}>📦 {item.cargo_type}{item.quantity != null ? ` — ${item.quantity}` : ""}</span>
                          ))
                          : sr.cargo_type && <span>📦 نوع الحمولة: <strong>{sr.cargo_type}</strong></span>}
                        {sr.rep_name && <span>👤 المندوب: <strong>{sr.rep_name}</strong></span>}
                        {sr.rep_phone && (
                          <a href={`tel:${sr.rep_phone}`} className="text-blue-600 hover:underline">
                            📞 جوال المندوب: <strong dir="ltr">{sr.rep_phone}</strong>
                          </a>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1">
                      {sr.warehouse_name && (
                        <span className="flex items-center gap-1">
                          🏭 التوجه إلى: <strong className="text-gray-600">{sr.warehouse_name}</strong>
                          {(sr.warehouse_lat || sr.warehouse_location) && (
                            <a
                              href={sr.warehouse_lat && sr.warehouse_lng
                                ? `https://maps.google.com/?q=${sr.warehouse_lat},${sr.warehouse_lng}`
                                : `https://maps.google.com/search/?api=1&query=${encodeURIComponent(sr.warehouse_location || sr.warehouse_name || "")}`}
                              target="_blank" rel="noreferrer"
                              className="text-blue-500 font-bold underline ms-1"
                            >📍 خريطة</a>
                          )}
                        </span>
                      )}
                      {sr.destination_division && <span>📍 إلى: {sr.destination_division}</span>}
                      {(sr.reference_no || sr.cargo_type) && (
                        <span className="text-indigo-600 font-semibold">🔖 رقم المرجع: {sr.reference_no || sr.cargo_type}</span>
                      )}
                    </div>
                  </div>

                  {sr.routing_dispatch_id != null && sr.loading_location_name && sr.loading_location_url && (
                    <a
                      href={sr.loading_location_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline"
                    >
                      <MapPin size={14} />
                      موقع التحميل: {sr.loading_location_name}
                    </a>
                  )}

                  {/* ─ وثائق الفسحة: وثيقة المشرف والفسحة النهائية من مسؤول الفسوحات ─ */}
                  {sr.attachments?.filter(doc => doc.kind === "supervisor_permit" || doc.kind === "fsohat_permit")
                    .map((doc, index) => {
                      const label = doc.kind === "supervisor_permit"
                        ? "فسحة المشرف"
                        : "الفسحة النهائية من مسؤول الفسوحات";
                      return (
                        <div key={`${doc.kind}-${doc.url}-${index}`} className="rounded-xl border border-teal-200 bg-teal-50 p-3 space-y-2">
                          <a href={doc.url} target="_blank" rel="noreferrer"
                            aria-label={`عرض ${label}`}
                            className="block rounded-xl border border-teal-200 bg-white px-3 py-2 text-center text-teal-900 hover:border-teal-500 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 transition-colors">
                            <PermitEnvelopeArt />
                            <span className="block text-sm font-black">اضغط لعرض {label}</span>
                            {doc.file_name && <span className="block truncate text-xs text-teal-700">{doc.file_name}</span>}
                          </a>
                          <a href={doc.url} download target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline">
                            <Download size={12} />تحميل الملف
                          </a>
                        </div>
                      );
                    })}
                  {!sr.attachments?.some(doc => doc.kind === "supervisor_permit" || doc.kind === "fsohat_permit") && [
                    { url: sr.permit_image_url, label: "فسحة المشرف" },
                    { url: sr.invoice_image, label: "الفسحة النهائية من مسؤول الفسوحات" },
                  ].filter((doc): doc is { url: string; label: string } => !!doc.url).map(doc => (
                    <div key={doc.label} className="rounded-xl border border-teal-200 bg-teal-50 p-3 space-y-2">
                      <a href={doc.url} target="_blank" rel="noreferrer" aria-label={`عرض ${doc.label}`}
                        className="block rounded-xl border border-teal-200 bg-white px-3 py-2 text-center text-teal-900">
                        <PermitEnvelopeArt />
                        <span className="block text-sm font-black">اضغط لعرض {doc.label}</span>
                      </a>
                      <a href={doc.url} download target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline">
                        <Download size={12} />تحميل الملف
                      </a>
                    </div>
                  ))}

                  {/* ─ صورة التحميل المرفوعة (بعد أن يحمّل السائق) ─ */}
                  {sr.attachments?.filter(doc => doc.kind === "driver_invoice").map((doc, index) => (
                    <div key={`${doc.url}-${index}`} className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-blue-800">
                        <Camera size={14} />صورة الفاتورة {(sr.attachments?.filter(item => item.kind === "driver_invoice").length || 0) > 1 ? index + 1 : ""}
                        {sr.permit_number && <span className="font-mono text-blue-600 font-normal">· رقم الفسح: {sr.permit_number}</span>}
                      </div>
                      <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-700 underline text-sm">
                        <Upload size={12} />عرض الصورة المرفوعة{doc.file_name ? ` — ${doc.file_name}` : ""}
                      </a>
                    </div>
                  ))}
                  {!sr.attachments?.some(doc => doc.kind === "driver_invoice") && sr.driver_loading_image && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-blue-800">
                        <Camera size={14} />صورة الفاتورة / التحميل
                        {sr.permit_number && (
                          <span className="font-mono text-blue-600 font-normal">· رقم الفسح: {sr.permit_number}</span>
                        )}
                      </div>
                      <a href={sr.driver_loading_image} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 text-blue-700 underline text-sm">
                        <Upload size={12} />عرض الصورة المرفوعة
                      </a>
                      {sr.routing_dispatch_id != null && sr.unloading_location_name && sr.unloading_location_url && (
                        <a
                          href={sr.unloading_location_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-700 underline text-sm"
                        >
                          <MapPin size={14} />
                          موقع التنزيل: {sr.unloading_location_name}
                        </a>
                      )}
                    </div>
                  )}
                  {sr.attachments?.some(doc => doc.kind === "driver_invoice")
                    && sr.routing_dispatch_id != null && sr.unloading_location_name && sr.unloading_location_url && (
                    <a href={sr.unloading_location_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-700 underline text-sm">
                      <MapPin size={14} />موقع التنزيل: {sr.unloading_location_name}
                    </a>
                  )}

                  {/* ─ ACTION: تأكيد التحميل (عند assigned + فسحة صادرة) ─ */}
                  {readyToLoad && (
                    <div className="space-y-2">
                      {!isOpen && (
                        <button type="button"
                          onClick={() => { setSrLoadId(sr.id); setSrFiles([]); }}
                          className="group w-full rounded-2xl border-2 border-teal-200 bg-gradient-to-b from-teal-50 to-white px-4 py-3 text-teal-900 shadow-sm hover:border-teal-500 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 transition-colors">
                          <DriverTripStageArt stage="loading" />
                          <span className="block text-base font-black">اضغط بعد تحميل السيارة</span>
                          <span className="block text-xs text-teal-700 mt-1">الخطوة التالية: تصوير الفاتورة أو وثيقة الشحن</span>
                        </button>
                      )}

                      {isOpen && (
                        <div className="border border-teal-200 rounded-xl p-4 bg-teal-50 space-y-3">
                          <button type="button" onClick={() => { setSrLoadId(null); setSrFiles([]); }}
                            disabled={srSubmitting}
                            className="text-xs font-bold text-gray-600 hover:text-gray-900 disabled:opacity-50">
                            إلغاء
                          </button>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                              رقم الفاتورة <span className="text-gray-400">(اختياري)</span>
                            </label>
                            <input
                              value={srInvoiceNo}
                              onChange={e => setSrInvoiceNo(e.target.value)}
                              placeholder="أدخل رقم الفاتورة"
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400 bg-white"
                              dir="ltr"
                            />
                          </div>
                          <input ref={srCameraRef} type="file" accept="image/*" capture="environment"
                            className="sr-only"
                            aria-label="التقاط صورة الفاتورة أو وثيقة الشحن"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) {
                                const nextFiles = [...srFiles, file].slice(0, 20);
                                setSrFiles(nextFiles);
                                if (requiredInvoicePhotoCount(sr) === 1) {
                                  void confirmSupplyLoad(sr, nextFiles);
                                }
                              }
                            }} />
                          <button type="button" onClick={() => srCameraRef.current?.click()}
                            disabled={srSubmitting}
                            className="w-full rounded-2xl border-2 border-teal-300 bg-white p-3 text-teal-900 hover:border-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-50">
                            <DriverTripStageArt stage="camera" />
                            <span className="block text-base font-black">{srSubmitting ? "جارٍ حفظ الصورة..." : "اضغط لتصوير الفاتورة أو وثيقة الشحن"}</span>
                            <span className="block text-xs text-teal-700 mt-1">
                              {requiredInvoicePhotoCount(sr) > 1
                                ? `صور الفسح المطلوبة: ${srFiles.length} من ${requiredInvoicePhotoCount(sr)}`
                                : "بعد حفظ الصورة تظهر خطوة التنزيل"}
                            </span>
                          </button>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                              أو اختر صورة / PDF من الملفات
                            </label>
                            <label
                              htmlFor="sr-photo-input"
                              className={`w-full text-right border-2 border-dashed rounded-xl px-3 py-2.5 text-sm transition-colors cursor-pointer block ${srFiles.length ? "border-teal-400 bg-teal-50 text-teal-800" : "border-gray-300 bg-gray-50 text-gray-400 hover:border-teal-300 hover:bg-teal-50/40"}`}>
                              {srFiles.length
                                ? `📎 ${srFiles.length} ملف${srFiles.length > 1 ? "ات" : ""} محدد`
                                : "اختر صورة أو ملف PDF"}
                            </label>
                            {srFiles.length > 0 && (
                              <ul className="mt-1 space-y-1 text-xs text-gray-600">
                                {srFiles.map((file, index) => (
                                  <li key={`${file.name}-${file.lastModified}`} className="flex justify-between gap-2">
                                    <span className="truncate">{file.name}</span>
                                    <button type="button" className="shrink-0 text-red-600"
                                      onClick={() => setSrFiles(prev => prev.filter((_, i) => i !== index))}>إزالة</button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <input
                              id="sr-photo-input"
                              ref={srPhotoRef}
                              type="file"
                              multiple={sr.routing_dispatch_id != null}
                              accept="image/*,application/pdf"
                              className="sr-only"
                              onChange={e => {
                                const selected = Array.from(e.target.files || []).slice(0, 20);
                                e.target.value = "";
                                setSrFiles(selected);
                              }}
                            />
                          </div>
                          <button
                            onClick={() => confirmSupplyLoad(sr)}
                            disabled={srSubmitting || !srFiles.length || (sr.routing_dispatch_id != null && srFiles.length !== requiredInvoicePhotoCount(sr))}
                            className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
                            {srSubmitting ? "جاري الرفع..." : "تأكيد التحميل بالملف المختار"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─ ACTION: تأكيد التوصيل (فقط عند loaded) ─ */}
                  {sr.status === "loaded" && (
                    <button
                      onClick={() => confirmSupplyDeliver(sr.id)}
                      disabled={srSubmitting}
                      className="w-full rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50 to-white px-4 py-3 text-blue-900 shadow-sm hover:border-blue-500 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 transition-colors">
                      <DriverTripStageArt stage="unloading" />
                      <span className="block text-base font-black">{srSubmitting ? "جارٍ التأكيد..." : "اضغط بعد تنزيل الحمولة"}</span>
                      <span className="block text-xs text-blue-700 mt-1">تأكيد الوصول للمستودع</span>
                    </button>
                  )}

                  {/* ─ بانتظار المستودع ─ */}
                  {sr.status === "delivered_to_warehouse" && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 flex items-center gap-2">
                      <Clock size={13} />تم التوصيل — بانتظار تأكيد الاستلام من المستودع
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>,
        "driver-top-supply"
        )
      )}

      {factoryOrders.length > 0 && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Package size={17} className="text-indigo-600" />
              <h2 className="font-bold text-gray-900">{t("factoryOrdersTitle")}</h2>
              {factoryOrders.filter(o => o.status !== "delivered").length > 0 && (
                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {factoryOrders.filter(o => o.status !== "delivered").length} {t("activeLabel")}
                </span>
              )}
            </div>
            <button onClick={loadFactoryOrders} className="text-gray-400 hover:text-gray-600 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {factoryOrders.map(fo => {
              const isMyLoadingOrder = foLoadingId === fo.id;
              const FO_STATUS_MAP: Record<string, { label: string; color: string }> = {
                pending_permit: { label: t("reqPending"),      color: "bg-amber-100 text-amber-700"   },
                permit_issued:  { label: t("readyLabel"),    color: "bg-blue-100 text-blue-700"     },
                loaded:         { label: t("stageLoaded"),   color: "bg-indigo-100 text-indigo-700" },
                delivered:      { label: t("stageDelivered"), color: "bg-green-100 text-green-700"  },
              };
              const st = FO_STATUS_MAP[fo.status] || { label: fo.status, color: "bg-gray-100 text-gray-500" };
              return (
                <div key={fo.id} className="px-5 py-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.color}`}>{st.label}</span>
                        <span className="text-xs text-gray-400 font-mono">{fo.order_number}</span>
                      </div>
                      <div className="font-bold text-gray-900">{fo.product_name}</div>
                      {fo.quantity > 0 && <div className="text-sm text-gray-500">{fo.quantity.toLocaleString("ar-SA")} {fo.unit}</div>}
                      {fo.delivery_site && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                          <MapPin size={11} className="text-gray-400" />{fo.delivery_site}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Permit info — visible when permit_issued or later */}
                  {fo.permit_number && (
                    <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-700">
                      <FileText size={12} />
                      رقم الفسحة: <strong className="font-mono">{fo.permit_number}</strong>
                      {fo.permit_doc_url && (
                        <a href={fo.permit_doc_url} target="_blank" rel="noreferrer" className="underline mr-1">عرض الوثيقة</a>
                      )}
                    </div>
                  )}

                  {/* Loading order — already uploaded */}
                  {fo.loading_order_url && (
                    <div className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2 text-xs text-indigo-700">
                      <Truck size={12} />
                      أمر التحميل مرفوع —
                      <a href={fo.loading_order_url} target="_blank" rel="noreferrer" className="underline">عرض</a>
                    </div>
                  )}

                  {/* Action: upload loading order (status=permit_issued, no loading_order_url yet) */}
                  {fo.status === "permit_issued" && !fo.loading_order_url && (
                    <div className="space-y-2">
                      <button onClick={() => setFoLoadingId(isMyLoadingOrder ? null : fo.id)}
                        className="flex items-center gap-2 w-full justify-center py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors">
                        <Upload size={14} />
                        {isMyLoadingOrder ? "إلغاء" : "رفع أمر التحميل"}
                      </button>
                      {isMyLoadingOrder && (
                        <div className="border border-indigo-200 rounded-xl p-3 bg-indigo-50 space-y-2">
                          <label
                            htmlFor="fo-photo-input"
                            className={`w-full text-right border-2 border-dashed rounded-xl px-3 py-2.5 text-sm transition-colors cursor-pointer block ${foFile ? "border-indigo-400 bg-indigo-50 text-indigo-800" : "border-gray-300 bg-gray-50 text-gray-400 hover:border-indigo-300"}`}>
                            {foFile ? `📎 ${foFile.name}` : "اضغط لاختيار صورة أو ملف PDF"}
                          </label>
                          <input id="fo-photo-input" ref={foLoadingPhotoRef} type="file" accept="image/*,application/pdf"
                            className="sr-only"
                            onChange={e => setFoFile(e.target.files?.[0] || null)} />
                          <button onClick={() => uploadLoadingOrder(fo.id)} disabled={foSubmitting}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-40">
                            {foSubmitting ? "جاري الرفع..." : "تأكيد رفع أمر التحميل"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action: confirm delivery (status=loaded) */}
                  {fo.status === "loaded" && (
                    <button onClick={() => confirmFactoryDelivery(fo.id)} disabled={foSubmitting}
                      className="flex items-center gap-2 w-full justify-center py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-40">
                      <CheckCircle size={14} />تأكيد التسليم
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* ── Driver Bonus Summary ── */}
      {!hideRequestUi && (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={18} className="text-purple-600" />
            <h2 className="font-bold text-gray-900">{t("myBonus")}</h2>
            <div className="flex items-center gap-2 mr-auto">
              <input type="month" value={bonusMonth}
                onChange={e => { setBonusMonth(e.target.value); loadBonus(e.target.value); }}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              <button onClick={() => setStandaloneModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-xl text-xs font-bold transition-colors">
                <Fuel size={12} />تسجيل ديزل
              </button>
            </div>
          </div>
          {bonusLoading ? (
            <div className="text-sm text-gray-400 text-center py-2">جاري الحساب...</div>
          ) : bonusSummary ? (
            <>
              {/* Summary cards: Gross - Diesel = Net */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
                  <div className="text-xs text-purple-500 font-semibold mb-1">إجمالي البونص</div>
                  <div className="text-lg font-black text-purple-700">{fmt(bonusSummary.gross_bonus)}</div>
                  <div className="text-[10px] text-purple-400">ر.س</div>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center relative">
                  <div className="text-xs text-orange-500 font-semibold mb-1">سحوبات الديزل</div>
                  <div className="text-lg font-black text-orange-600">−{fmt(bonusSummary.total_diesel)}</div>
                  <div className="text-[10px] text-orange-400">ر.س</div>
                </div>
                <div className={`rounded-xl p-3 text-center border ${bonusSummary.net_bonus >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <div className={`text-xs font-semibold mb-1 ${bonusSummary.net_bonus >= 0 ? "text-green-600" : "text-red-500"}`}>صافي المستحق</div>
                  <div className={`text-lg font-black ${bonusSummary.net_bonus >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(bonusSummary.net_bonus)}</div>
                  <div className={`text-[10px] ${bonusSummary.net_bonus >= 0 ? "text-green-400" : "text-red-400"}`}>ر.س</div>
                </div>
              </div>
              {/* Math formula display */}
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 mb-3">
                <span className="font-mono font-bold text-purple-600">{fmt(bonusSummary.gross_bonus)}</span>
                <span>−</span>
                <span className="font-mono font-bold text-orange-500">{fmt(bonusSummary.total_diesel)}</span>
                <span>=</span>
                <span className={`font-mono font-bold ${bonusSummary.net_bonus >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(bonusSummary.net_bonus)}</span>
                <span className="text-gray-400">ر.س</span>
              </div>
              {/* Breakdown by state */}
              {bonusSummary.breakdown.length > 0 && (
                <div>
                  <button onClick={() => setBonusExpanded(v => !v)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-semibold mb-2">
                    <ChevronDown size={13} className={`transition-transform ${bonusExpanded ? "rotate-180" : ""}`} />
                    تفاصيل الحالات ({bonusSummary.breakdown.length})
                  </button>
                  {bonusExpanded && (
                    <div className="space-y-1.5">
                      {bonusSummary.breakdown.map(b => (
                        <div key={b.state} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 text-xs border border-gray-100">
                          <span className="font-semibold text-gray-700">{b.state}</span>
                          <div className="flex items-center gap-3 text-gray-500">
                            <span>{b.km.toFixed(1)} كم × {b.rate} ر.س</span>
                            <span className="font-bold text-purple-600">{fmt(b.bonus)} ر.س</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {bonusSummary.gross_bonus === 0 && bonusSummary.total_diesel === 0 && (
                <div className="text-xs text-gray-400 text-center py-1">{t("noPreviousRequests")}</div>
              )}
            </>
          ) : null}
        </div>
      </div>
      )}

      {/* ── External Rentals ── */}
      {myRentals.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-violet-500 rounded-full" />
            <h2 className="font-bold text-gray-900">{t("externalRental")}</h2>
            <span className="bg-violet-100 text-violet-700 text-xs px-2 py-0.5 rounded-full font-semibold">{myRentals.length}</span>
          </div>
          <div className="space-y-3">
            {myRentals.map(r => {
              const stageKey = r.driver_stage || "null_stage";
              const stageInfo = RENTAL_STAGE_MAP[stageKey] ?? RENTAL_STAGE_MAP["null_stage"];
              return (
                <div key={r.id} className="bg-white border-2 border-violet-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-violet-50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck size={14} className="text-violet-600" />
                      <span className="font-bold text-violet-700 text-sm">{r.vehicle_type}</span>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${stageInfo.color}`}>{stageInfo.label}</span>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="text-sm text-gray-700 font-semibold">{r.customer_name} · {r.customer_phone}</div>
                    {(r.pickup_location || r.destination_location) && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-500">
                        <MapPin size={12} className="mt-0.5 flex-shrink-0" />
                        <span>{r.pickup_location || "—"} ← {r.destination_location || "—"}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>📅 {r.start_date}</span>
                      {r.assigned_vehicle && <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{r.assigned_vehicle}</span>}
                      {r.payment_method === "cash" && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-semibold">💵 {t("cash") || "Cash"}</span>}
                    </div>
                    {stageInfo.nextLabel && stageKey !== "delivered" && (
                      <button onClick={() => updateRentalStage(r.id, stageInfo.next!)}
                        className="w-full mt-2 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors">
                        {stageInfo.nextLabel}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Waiting for invoice (vehicle_assigned) ── */}
      {waitingOrders.length > 0 && (
        nearHeader(
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
            <h2 className="font-bold text-gray-900">في الانتظار</h2>
            <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-semibold">{waitingOrders.length}</span>
          </div>
          <div className="space-y-3">
            {waitingOrders.map(order => (
              <div key={order.id} className="bg-white border-2 border-yellow-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-yellow-50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-yellow-600" />
                    <span className="font-mono text-xs font-bold text-yellow-700">{order.order_number}</span>
                  </div>
                  <span className="text-xs bg-yellow-200 text-yellow-800 px-2.5 py-1 rounded-full font-semibold">بانتظار الفاتورة</span>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Package size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-sm">{order.customer_name || order.customer_phone}</div>
                      <div className="text-xs text-gray-500">{order.product_name} × {order.quantity} {order.unit}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <MapPin size={12} className="text-red-400 flex-shrink-0" />
                    <span>{order.delivery_location} ({order.destination_type})</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2">
                    <Clock size={11} />
                    <span>تم تعيين السيارة — بانتظار المستودع لإصدار الفاتورة</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        "driver-top-assigned-waiting"
        )
      )}

      {readyOrders.length > 0 && (
        nearHeader(
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-blue-500 rounded-full" />
            <h2 className="font-bold text-gray-900">{t("stageInvoiced")}</h2>
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">{readyOrders.length}</span>
          </div>
          <div className="space-y-3">
            {readyOrders.map(order => (
              <div key={order.id} className="bg-white border-2 border-blue-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-blue-50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-blue-600" />
                    <span className="font-mono text-xs font-bold text-blue-700">{order.order_number}</span>
                  </div>
                  <span className="text-xs bg-blue-200 text-blue-800 px-2.5 py-1 rounded-full font-semibold">{t("stageInvoiced")}</span>
                </div>
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <Phone size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-sm">{order.customer_name || order.customer_phone}</div>
                      <div className="text-xs text-gray-500">{order.product_name} × {order.quantity} {order.unit}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <a href={`tel:${order.customer_phone}`} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors" title="اتصال بالعميل">
                        <Phone size={13} />
                      </a>
                      <a href={waLink(order.customer_phone)} target="_blank" rel="noreferrer" className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors" title="واتساب العميل">
                        <MessageCircle size={13} />
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <MapPin size={12} className="text-red-400 flex-shrink-0" />
                    <span className="flex-1">{order.delivery_location} ({order.destination_type})</span>
                    <a href={mapsLink(order.delivery_lat, order.delivery_lng, order.delivery_location)} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors">
                      <Navigation size={10} />خريطة
                    </a>
                  </div>
                  {order.invoice_image_url && (
                    <a href={order.invoice_image_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-[#103c68] font-semibold">
                      <FileText size={12} />عرض الفاتورة ({order.invoice_number})
                    </a>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setDieselModal({ open: true, order })}
                      className="flex items-center gap-1.5 px-3 py-2.5 bg-orange-100 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-200 transition-colors">
                      <Fuel size={14} />ديزل
                    </button>
                    <button onClick={() => setLoadingOrder(order)}
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold transition-colors">
                      <Camera size={15} />{t("confirmLoad")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        "driver-top-assigned-ready"
        )
      )}

      {/* ── On the way (loaded) ── */}
      {loadedOrders.length > 0 && (
        nearHeader(
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
            <h2 className="font-bold text-gray-900">{t("stageLoaded")}</h2>
            <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-semibold">{loadedOrders.length}</span>
          </div>
          <div className="space-y-3">
            {loadedOrders.map(order => (
              <div key={order.id} className="bg-white border-2 border-orange-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-orange-50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck size={14} className="text-orange-600" />
                    <span className="font-mono text-xs font-bold text-orange-700">{order.order_number}</span>
                  </div>
                  <span className="text-xs bg-orange-200 text-orange-800 px-2.5 py-1 rounded-full font-semibold">{t("stageLoaded")}</span>
                </div>
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <Phone size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-sm">{order.customer_name || order.customer_phone}</div>
                      <div className="text-xs text-gray-500">{order.product_name} × {order.quantity} {order.unit}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <a href={`tel:${order.customer_phone}`} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors" title="اتصال بالعميل">
                        <Phone size={13} />
                      </a>
                      <a href={waLink(order.customer_phone)} target="_blank" rel="noreferrer" className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors" title="واتساب العميل">
                        <MessageCircle size={13} />
                      </a>
                      {order.supervisor_phone && (
                        <a href={waLink(order.supervisor_phone)} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors" title="واتساب المشرف">
                          <Send size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <MapPin size={12} className="text-red-400 flex-shrink-0" />
                    <span className="flex-1">{order.delivery_location}</span>
                    <a href={mapsLink(order.delivery_lat, order.delivery_lng, order.delivery_location)} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors">
                      <Navigation size={10} />اتجاهات
                    </a>
                  </div>
                  {order.loading_photo_url && (
                    <a href={order.loading_photo_url} target="_blank" rel="noreferrer">
                      <img src={order.loading_photo_url} alt="صورة التحميل"
                        className="w-full max-h-44 object-cover rounded-xl hover:opacity-90 transition-opacity" />
                    </a>
                  )}
                  <div className="flex gap-2 pt-1 flex-wrap">
                    <button onClick={() => sendLocation(order)}
                      className="flex items-center gap-1.5 px-3 py-2.5 bg-blue-100 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-200 transition-colors">
                      <Navigation size={14} />موقعي
                    </button>
                    <button onClick={() => setDieselModal({ open: true, order })}
                      className="flex items-center gap-1.5 px-3 py-2.5 bg-orange-100 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-200 transition-colors">
                      <Fuel size={14} />ديزل
                    </button>
                    <button onClick={() => confirmDelivery(order)} disabled={submitting}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors">
                      <CheckCircle size={15} />{t("confirmDelivery")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        "driver-top-assigned-loaded"
        )
      )}

      {/* ── Delivered history ── */}
      {deliveredOrders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-green-500 rounded-full" />
            <h2 className="font-bold text-gray-900">{t("deliveredOrders")}</h2>
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold">{deliveredOrders.length}</span>
          </div>
          <div className="space-y-2">
            {deliveredOrders.slice(0, 10).map(order => (
              <div key={order.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div>
                  <div className="font-mono text-xs text-gray-400">{order.order_number}</div>
                  <div className="font-semibold text-sm text-gray-800 mt-0.5">{order.customer_name || order.customer_phone}</div>
                  <div className="text-xs text-gray-400">{order.product_name} × {order.quantity} {order.unit}</div>
                </div>
                <div className="flex items-center gap-1.5 bg-green-100 text-green-700 text-xs px-2.5 py-1.5 rounded-xl font-semibold">
                  <CheckCircle size={12} />{t("stageDelivered")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 && !loading && !hideRequestUi && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Truck size={48} className="mx-auto text-gray-200 mb-3" />
          <p className="font-semibold text-gray-400">{t("noOrdersAssigned")}</p>
          <p className="text-xs text-gray-300 mt-1">{t("waitForOrder")}</p>
        </div>
      )}

      {/* ══ سجل الصور والرحلات الشخصي ══ */}
      {!hideRequestUi && tripLog.length > 0 && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setTripLogExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-indigo-50/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileImage size={17} className="text-indigo-600" />
              <span className="font-bold text-indigo-900">سجل صوري ورحلاتي</span>
              <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {tripLog.length}
              </span>
              {tripLog.some(t => t.route_bonus > 0) && (
                <span className="bg-emerald-50 text-emerald-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  بونص: {tripLog.reduce((s, t) => s + (t.route_bonus || 0), 0).toLocaleString("ar-SA")} ر.س
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={e => { e.stopPropagation(); loadTripLog(); }}
                className="p-1 hover:bg-indigo-100 rounded-lg text-indigo-400 transition-colors"
              >
                <RefreshCw size={13} />
              </button>
              {tripLogExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </div>
          </button>

          {tripLogExpanded && (
            <div className="divide-y divide-gray-50">
              {tripLog.map(trip => (
                <div key={trip.id} className="px-4 py-3 flex items-start gap-3">

                  {/* Thumbnail — opens lightbox */}
                  <div
                    className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer active:opacity-80"
                    onClick={() => trip.image_url && (() => { setLightboxImgFailed(false); setLightboxUrl(trip.image_url!); })()}
                  >
                    {trip.image_url ? (
                      <img src={trip.image_url} alt="صورة" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileImage size={20} className="text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-800">{trip.date}</span>
                      {trip.trip_state && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">{trip.trip_state}</span>
                      )}
                      {trip.route_bonus > 0 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md font-bold">
                          +{trip.route_bonus.toLocaleString("ar-SA")} ر.س
                        </span>
                      )}
                    </div>
                    {(trip.loading_region || trip.unloading_region || trip.destination || trip.client_name) && (
                      <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-500">
                        <MapPin size={11} className="text-gray-400 shrink-0" />
                        <span className="truncate">
                          {[trip.loading_region, trip.unloading_region || trip.destination].filter(Boolean).join(" ← ")}
                          {trip.client_name ? ` · ${trip.client_name}` : ""}
                        </span>
                      </div>
                    )}
                    {trip.return_value_no_vat > 0 && (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        قيمة الرد: {trip.return_value_no_vat.toLocaleString("ar-SA")} ر.س
                      </div>
                    )}
                    {trip.notes && (
                      <div className="text-[11px] text-indigo-600 mt-0.5 truncate">{trip.notes}</div>
                    )}
                    {!trip.image_url && !trip.loading_region && !trip.notes && (
                      <div className="text-[11px] text-amber-500 mt-0.5">في انتظار إضافة بيانات الرحلة من المدير</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex flex-col gap-1">
                    <button
                      onClick={() => openEditTripLog(trip)}
                      className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 transition-colors"
                      title="تعديل"
                    >
                      <Pencil size={14} />
                    </button>
                    {confirmDeleteTripId === trip.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => deleteTripLog(trip.id)}
                          disabled={deletingTripLogId === trip.id}
                          className="text-[9px] bg-red-500 text-white px-1.5 py-1 rounded-lg font-bold disabled:opacity-50"
                        >
                          {deletingTripLogId === trip.id ? "⏳" : "حذف"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteTripId(null)}
                          className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-1 rounded-lg font-bold"
                        >
                          لا
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteTripId(trip.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-300 transition-colors"
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── نافذة تعديل سجل الرحلة ── */}
      {!hideRequestUi && editingTripLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setEditingTripLog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900 flex items-center gap-2">
                <FileImage size={16} className="text-indigo-600" /> تعديل الرحلة
              </h3>
              <button onClick={() => setEditingTripLog(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <X size={16} />
              </button>
            </div>

            {/* Trip summary */}
            <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600 space-y-0.5">
              <div className="font-semibold text-gray-800">{editingTripLog.date}</div>
              {editingTripLog.loading_region && (
                <div className="flex items-center gap-1">
                  <MapPin size={11} className="text-gray-400" />
                  {editingTripLog.loading_region}{editingTripLog.unloading_region ? ` ← ${editingTripLog.unloading_region}` : ""}
                </div>
              )}
              {editingTripLog.route_bonus > 0 && (
                <div className="text-emerald-600 font-bold">بونص: {editingTripLog.route_bonus.toLocaleString("ar-SA")} ر.س</div>
              )}
            </div>

            {/* Photo */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">صورة الفاتورة / الحمولة</label>
              <input ref={tripLogImgRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setTripLogImgFile(f);
                  const r = new FileReader(); r.onload = ev => setTripLogImgPrev(ev.target?.result as string); r.readAsDataURL(f);
                  e.target.value = "";
                }} />
              <input ref={tripLogImgGalleryRef} type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setTripLogImgFile(f);
                  const r = new FileReader(); r.onload = ev => setTripLogImgPrev(ev.target?.result as string); r.readAsDataURL(f);
                  e.target.value = "";
                }} />
              {tripLogImgPrev ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200">
                  <img src={tripLogImgPrev} alt="صورة" className="w-full max-h-40 object-contain bg-gray-50" />
                  <div className="absolute bottom-1 right-1 flex gap-1">
                    <button onClick={() => tripLogImgRef.current?.click()}
                      className="bg-white/90 rounded-lg px-2 py-1 text-[10px] text-indigo-600 font-bold shadow">
                      📷 كاميرا
                    </button>
                    <button onClick={() => tripLogImgGalleryRef.current?.click()}
                      className="bg-white/90 rounded-lg px-2 py-1 text-[10px] text-indigo-600 font-bold shadow">
                      🖼️ معرض
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => tripLogImgRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 text-indigo-600 rounded-xl text-xs font-semibold">
                    <Camera size={13} /> 📷 كاميرا
                  </button>
                  <button onClick={() => tripLogImgGalleryRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 text-indigo-600 rounded-xl text-xs font-semibold">
                    🖼️ من المعرض
                  </button>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">ملاحظات</label>
              <textarea
                value={tripLogNote}
                onChange={e => setTripLogNote(e.target.value)}
                rows={2}
                placeholder="أضف ملاحظة على هذه الرحلة..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditingTripLog(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">
                إلغاء
              </button>
              <button onClick={saveTripLogNote} disabled={savingTripLogNote}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                <Save size={14} />{savingTripLogNote ? "جاري الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change password modal ── */}
      {pwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Lock size={20} className="text-gray-600" />
                <h2 className="font-black text-lg">{t("changePassword")}</h2>
              </div>
              <button onClick={() => setPwModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">{t("currentPassword")}</label>
                <input type="text" value={pwForm.old} onChange={e => setPwForm(f => ({ ...f, old: e.target.value }))}
                  dir="ltr" placeholder="كلمة المرور الحالية"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50 font-mono" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">{t("newPassword")}</label>
                <input type="text" value={pwForm.new1} onChange={e => setPwForm(f => ({ ...f, new1: e.target.value }))}
                  dir="ltr" placeholder="الجديدة (4 أحرف على الأقل)"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50 font-mono" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">{t("confirmPassword")}</label>
                <input type="text" value={pwForm.new2} onChange={e => setPwForm(f => ({ ...f, new2: e.target.value }))}
                  dir="ltr" placeholder="أعد كتابة الجديدة"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50 font-mono" />
              </div>
              {pwMsg && <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${pwMsg.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{pwMsg}</div>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setPwModal(false)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">{t("cancel")}</button>
              <button onClick={changePassword} disabled={submitting || !pwForm.old || !pwForm.new1 || !pwForm.new2}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <Lock size={14} />{submitting ? t("submitting") : t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading confirmation modal ── */}
      {loadingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain p-3 sm:p-5 bg-black/50 backdrop-blur-sm">
          <div className="my-auto w-full max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain bg-white rounded-3xl shadow-2xl p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Camera size={20} className="text-blue-600" />
              <h2 className="font-black text-xl">{t("confirmLoad")}</h2>
            </div>
            <div className="bg-blue-50 rounded-2xl p-4 text-sm space-y-1.5 mb-5 border border-blue-100">
              <div className="flex gap-2"><Hash size={13} className="text-blue-400 mt-0.5 flex-shrink-0" /><span className="text-gray-700"><strong>{t("orderNumber")}:</strong> {loadingOrder.order_number}</span></div>
              <div className="flex gap-2"><Phone size={13} className="text-blue-400 mt-0.5 flex-shrink-0" /><span className="text-gray-700"><strong>{t("customer")}:</strong> {loadingOrder.customer_name}</span></div>
              <div className="flex gap-2"><Package size={13} className="text-blue-400 mt-0.5 flex-shrink-0" /><span className="text-gray-700"><strong>{t("product")}:</strong> {loadingOrder.product_name} × {loadingOrder.quantity} {loadingOrder.unit}</span></div>
              <div className="flex gap-2"><MapPin size={13} className="text-blue-400 mt-0.5 flex-shrink-0" /><span className="text-gray-700"><strong>{t("destination")}:</strong> {loadingOrder.delivery_location}</span></div>
            </div>
            <label className="block text-sm font-bold text-gray-700 mb-2">{t("uploadLoadPhoto")}</label>
            {/* hidden inputs — camera + gallery */}
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { setLoadingPhotoFile(e.target.files?.[0] || null); e.target.value = ""; }} />
            <input ref={photoGalleryRef} type="file" accept="image/*" className="hidden"
              onChange={e => { setLoadingPhotoFile(e.target.files?.[0] || null); e.target.value = ""; }} />
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => photoRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-blue-200 hover:border-blue-400 text-blue-700 rounded-xl text-sm font-semibold transition-colors">
                <Camera size={14} />📷 كاميرا
              </button>
              <button type="button" onClick={() => photoGalleryRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-blue-200 hover:border-blue-400 text-blue-700 rounded-xl text-sm font-semibold transition-colors">
                🖼️ من المعرض
              </button>
            </div>
            {loadingPhotoFile && (
              <div className="text-xs text-center text-blue-700 bg-blue-50 rounded-lg py-1.5 px-3 font-semibold">
                ✅ {loadingPhotoFile.name}
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={confirmLoad} disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60 transition-colors">
                <CheckCircle size={16} />{submitting ? t("submitting") : t("confirmLoad")}
              </button>
              <button onClick={() => setLoadingOrder(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium">
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Diesel expense modal ── */}
      {dieselModal.open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Fuel size={20} className="text-orange-500" />
                <h2 className="font-black text-lg">{t("fuelExpense")}</h2>
              </div>
              <button onClick={() => setDieselModal({ open: false })} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {dieselModal.order && (
                <div className="bg-orange-50 rounded-xl p-3 text-xs text-orange-700 border border-orange-200 flex items-center gap-2">
                  <Truck size={12} />
                  <span>
                    <strong>الطلب:</strong> {dieselModal.order.order_number} — {dieselModal.order.delivery_location}
                    {dieselModal.order.vehicle_plate ? ` — السيارة ${dieselModal.order.vehicle_plate}` : ""}
                  </span>
                </div>
              )}
              {!dieselModal.order && (vehicleInfo?.vehicles?.length || 0) > 1 && (
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1.5">السيارة التي تخصها الفاتورة *</label>
                  <select
                    value={dieselForm.vehicle_plate}
                    onChange={e => setDieselForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                    className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="">-- اختر السيارة --</option>
                    {vehicleInfo?.vehicles?.map(vehicle => (
                      <option key={`${vehicle.plate_number}-${vehicle.assignment_role}`} value={vehicle.plate_number}>
                        {vehicle.plate_number} — {vehicle.assignment_role === "primary" ? "أساسية" : "احتياطية"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {balance && (
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 text-sm border border-gray-100">
                  <div className="flex items-center gap-2 text-gray-500"><TrendingUp size={13} />الرصيد المتبقي</div>
                  <span className={`font-black ${balance.remaining > 0 ? "text-green-600" : "text-red-600"}`}>
                    {fmt(balance.remaining)} ر.س
                  </span>
                </div>
              )}
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">{t("amount")} *</label>
                <input type="number" min="0" step="1" value={dieselForm.amount}
                  onChange={e => setDieselForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0" autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-xl font-black text-center focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">{t("liters")}</label>
                <input type="number" min="0" step="1" value={dieselForm.liters}
                  onChange={e => setDieselForm(f => ({ ...f, liters: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">ملاحظة</label>
                <input type="text" value={dieselForm.description}
                  onChange={e => setDieselForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="مثال: محطة أرامكو — طريق الرياض"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setDieselModal({ open: false })}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">
                {t("cancel")}
              </button>
              <button onClick={addDiesel} disabled={
                submitting ||
                !dieselForm.amount ||
                (!dieselModal.order && (vehicleInfo?.vehicles?.length || 0) > 1 && !dieselForm.vehicle_plate)
              }
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                <Save size={15} />{submitting ? t("submitting") : t("submit")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Breakdown modal ── */}
      {breakdownModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertTriangle size={20} className="text-red-500" />
                <h2 className="font-black text-lg">{t("reportBreakdown")}</h2>
              </div>
              <button onClick={() => setBreakdownModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">
                  رقم لوحة السيارة <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={bdPlateInput}
                  onChange={e => setBdPlateInput(e.target.value)}
                  placeholder="أدخل رقم لوحة السيارة..."
                  className={`w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 border ${bdPlateInput.trim() ? "bg-red-50 border-red-200 text-red-700 font-bold" : "border-red-300 bg-white"}`}
                />
                {!bdPlateInput.trim() && (
                  <p className="text-xs text-red-500 mt-1">رقم اللوحة مطلوب لإرسال بلاغ العطل</p>
                )}
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-2">نوع العطل *</label>
                <div className="grid grid-cols-2 gap-2">
                  {["ميكانيكي","كهربائي","حادث","إطارات","أخرى"].map(bdType => (
                    <button key={bdType} type="button"
                      onClick={() => setBdForm(f => ({ ...f, type: bdType }))}
                      className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                        bdForm.type === bdType
                          ? "bg-red-600 text-white border-red-600 shadow-sm"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300"
                      }`}>
                      {bdType}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">حالة السيارة أثناء العطل *</label>
                <select value={bdForm.operational_state}
                  onChange={e => setBdForm(f => ({ ...f, operational_state: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">-- اختر الحالة --</option>
                  <option value="شغال">شغال (تعمل بشكل عادي)</option>
                  <option value="نشط">نشط (في الطريق)</option>
                  <option value="في حمولة">في حمولة (محملة بضاعة)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">حالة العطل والإجراء *</label>
                <select value={bdForm.action_taken}
                  onChange={e => setBdForm(f => ({ ...f, action_taken: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">-- اختر الإجراء --</option>
                  <option value="وقف">وقف (Stop Immediately)</option>
                  <option value="أكمل">أكمل (Continue Trip)</option>
                  <option value="ذهاب للورشة">ذهاب للورشة (Go to Workshop)</option>
                  <option value="إمكانية إصلاح على الطريق">إمكانية إصلاح على الطريق (Roadside Repair)</option>
                  <option value="طلب استدعاء الورشة المتنقلة">طلب استدعاء الورشة المتنقلة (Mobile Workshop)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">وصف العطل</label>
                <textarea value={bdForm.description}
                  onChange={e => setBdForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="صف المشكلة بالتفصيل..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">صورة العطل</label>
                <input ref={bdPhotoRef} type="file" accept="image/*" capture="environment"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-red-600 file:text-white" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setBreakdownModal(false)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">
                {t("cancel")}
              </button>
              <button onClick={submitBreakdown} disabled={submitting || !bdForm.type || !bdPlateInput.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                <AlertTriangle size={14} />{submitting ? t("submitting") : t("submit")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══ STANDALONE DIESEL MODAL ══ */}
      {standaloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900 flex items-center gap-2">
                <Fuel size={18} className="text-orange-500" />{t("standaloneDiesel")}
              </h2>
              <button onClick={() => setStandaloneModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {(vehicleInfo?.vehicles?.length || 0) > 0 && (
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">
                    السيارة التي تخصها الفاتورة {(vehicleInfo?.vehicles?.length || 0) > 1 ? "*" : ""}
                  </label>
                  {(vehicleInfo?.vehicles?.length || 0) === 1 ? (
                    <div className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm bg-orange-50 text-orange-800 font-bold">
                      {vehicleInfo?.vehicles?.[0]?.plate_number} — {
                        vehicleInfo?.vehicles?.[0]?.assignment_role === "primary" ? "أساسية" : "احتياطية"
                      }
                    </div>
                  ) : (
                    <select
                      value={standForm.vehicle_plate}
                      onChange={e => setStandForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                      className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
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
                <label className="text-xs font-bold text-gray-700 block mb-1.5">التاريخ *</label>
                <input type="date" value={standForm.entry_date}
                  onChange={e => setStandForm(f => ({ ...f, entry_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">المبلغ (ريال) *</label>
                <input type="number" min="0" step="0.01" placeholder="0.00"
                  value={standForm.amount}
                  onChange={e => setStandForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">الكمية (لتر) — اختياري</label>
                <input type="number" min="0" step="0.1" placeholder="0"
                  value={standForm.liters}
                  onChange={e => setStandForm(f => ({ ...f, liters: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">ملاحظة — اختياري</label>
                <input type="text" placeholder="مثال: تعبئة قبل الرحلة"
                  value={standForm.description}
                  onChange={e => setStandForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setStandaloneModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  {t("cancel")}
                </button>
                <button onClick={addStandaloneDiesel} disabled={
                  submitting ||
                  !standForm.amount ||
                  ((vehicleInfo?.vehicles?.length || 0) > 1 && !standForm.vehicle_plate)
                }
                  className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <Save size={14} />{submitting ? t("submitting") : t("save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ DOC REQUEST CONFIRM MODAL ══ */}
      {!hideRequestUi && docConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900 flex items-center gap-2">
                <FileText size={18} className="text-indigo-600" />تأكيد الطلب
              </h2>
              <button onClick={() => setDocConfirm(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-800 font-semibold text-center">
                {docConfirm.label}
              </div>
              <p className="text-sm text-gray-600 text-center">هل تريد إرسال هذا الطلب للمشرف؟</p>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setDocConfirm(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  إلغاء
                </button>
                <button onClick={() => submitQuickDocRequest(docConfirm.type, docConfirm.label)}
                  disabled={docSubmitting}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <Send size={14} />{docSubmitting ? "جاري الإرسال..." : "إرسال"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ CUSTOM INVOICE MODAL ══ */}
      {!hideRequestUi && docInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-3xl">
              <h2 className="font-black text-gray-900 flex items-center gap-2">
                <Package size={18} className="text-[#103c68]" />إدخال فاتورة جديدة
              </h2>
              <button onClick={() => setDocInvoiceModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Date */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">التاريخ *</label>
                <input type="date" value={docInvoiceForm.date}
                  onChange={e => setDocInvoiceForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>

              {/* Cargo type */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">نوع الحمولة *</label>
                <input type="text" placeholder="مثال: أسمنت، بلك، حصى..."
                  value={docInvoiceForm.cargo_type}
                  onChange={e => setDocInvoiceForm(f => ({ ...f, cargo_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">موقع التحميل</label>
                <div className="flex gap-2 mb-2">
                  <button onClick={detectDocLocation} disabled={docGeoLoading}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors shrink-0">
                    <Navigation size={13} />{docGeoLoading ? "جاري التحديد..." : "حدد موقعي"}
                  </button>
                  {docInvoiceForm.loading_lat && (
                    <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-xl border border-green-200 font-mono">
                      <MapPin size={11} />{docInvoiceForm.loading_lat.toFixed(4)}, {docInvoiceForm.loading_lng?.toFixed(4)}
                    </span>
                  )}
                </div>
                <input type="text" placeholder="أو اكتب اسم الموقع يدوياً..."
                  value={docInvoiceForm.loading_location_name}
                  onChange={e => setDocInvoiceForm(f => ({ ...f, loading_location_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setDocInvoiceModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  إلغاء
                </button>
                <button onClick={submitCustomDocRequest}
                  disabled={docSubmitting || !docInvoiceForm.cargo_type.trim()}
                  className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d3257] text-white rounded-xl font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <Send size={14} />{docSubmitting ? "جاري الإرسال..." : "إرسال"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ PROPOSE TARIFF MODAL ══ */}
      {!hideRequestUi && proposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900 flex items-center gap-2">
                <MapPin size={18} className="text-green-600" />{t("proposeTrip")}
              </h2>
              <button onClick={() => { setProposeModal(false); setProposeMsg(null); setProposeForm({ loading_place: "", unloading_place: "" }); }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* ── Existing tariff routes quick-select ── */}
              {tariffRows.length > 0 && (() => {
                const loadingPlaces = Array.from(new Set(tariffRows.map(r => r.loading_place))).sort();
                const filteredDests = proposeForm.loading_place
                  ? tariffRows.filter(r => r.loading_place === proposeForm.loading_place).map(r => r.unloading_place)
                  : Array.from(new Set(tariffRows.map(r => r.unloading_place))).sort();
                const matchedRoute = proposeForm.loading_place && proposeForm.unloading_place
                  ? tariffRows.find(r => r.loading_place === proposeForm.loading_place && r.unloading_place === proposeForm.unloading_place)
                  : null;
                return (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700">
                      اختر مسار موجود في التعريفة أو أدخل مساراً جديداً للاقتراح
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1.5">{t("loadingPlace")} *</label>
                      <select
                        value={proposeForm.loading_place}
                        onChange={e => setProposeForm(f => ({ ...f, loading_place: e.target.value, unloading_place: "" }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-300">
                        <option value="">-- اختر مكان التحميل --</option>
                        {loadingPlaces.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <input type="text" value={proposeForm.loading_place}
                        onChange={e => setProposeForm(f => ({ ...f, loading_place: e.target.value, unloading_place: "" }))}
                        placeholder="أو اكتب مكاناً جديداً..."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1.5 focus:outline-none focus:ring-2 focus:ring-green-300 bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1.5">{t("unloadingPlace")} *</label>
                      <select
                        value={proposeForm.unloading_place}
                        onChange={e => setProposeForm(f => ({ ...f, unloading_place: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-300">
                        <option value="">-- اختر مكان التنزيل --</option>
                        {filteredDests.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <input type="text" value={proposeForm.unloading_place}
                        onChange={e => setProposeForm(f => ({ ...f, unloading_place: e.target.value }))}
                        placeholder="أو اكتب مكاناً جديداً..."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1.5 focus:outline-none focus:ring-2 focus:ring-green-300 bg-white" />
                    </div>
                    {matchedRoute && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs space-y-1">
                        <p className="font-bold text-blue-800">✅ هذا المسار موجود في التعريفة</p>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div className="text-center bg-white rounded-lg p-2 border border-blue-100">
                            <p className="text-[10px] text-blue-500">مصروف السائق</p>
                            <p className="font-black text-blue-800">{matchedRoute.driver_expense} ﷼</p>
                          </div>
                          <div className="text-center bg-white rounded-lg p-2 border border-blue-100">
                            <p className="text-[10px] text-blue-500">الإيجار</p>
                            <p className="font-black text-blue-800">{matchedRoute.rental} ﷼</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
              {tariffRows.length === 0 && (
                <>
                  <p className="text-sm text-gray-500">إذا لم يكن المسار موجوداً في التعريفة، يمكنك اقتراحه.</p>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1.5">{t("loadingPlace")} *</label>
                    <input type="text" value={proposeForm.loading_place}
                      onChange={e => setProposeForm(f => ({ ...f, loading_place: e.target.value }))}
                      placeholder="مثال: مصنع MKGH - القصيم"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1.5">{t("unloadingPlace")} *</label>
                    <input type="text" value={proposeForm.unloading_place}
                      onChange={e => setProposeForm(f => ({ ...f, unloading_place: e.target.value }))}
                      placeholder="مثال: مشروع الرياض - حي النرجس"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                  </div>
                </>
              )}
              {proposeMsg && (
                <div className={`text-sm rounded-xl px-4 py-3 font-medium ${proposeMsg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                  {proposeMsg}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setProposeModal(false); setProposeMsg(null); setProposeForm({ loading_place: "", unloading_place: "" }); }}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  {t("cancel")}
                </button>
                <button onClick={proposeTariff} disabled={submitting || !proposeForm.loading_place || !proposeForm.unloading_place}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <Send size={14} />{submitting ? t("submitting") : t("submit")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── كشف الحساب ── */}
      {showStatement && user && (
        <DriverStatementModal
          driver={{ phone: user.phone, driver_name: user.name, vehicle_plate: user.vehicle_plate }}
          onClose={() => setShowStatement(false)}
          isDriverView
        />
      )}
    </div>

    {/* ══ Lightbox portal — يُرسم مباشرة على document.body لتجنب أي overflow/transform ══ */}
    {lightboxUrl && createPortal(
      (() => {
        const isPdf = lightboxImgFailed || lightboxUrl.toLowerCase().endsWith(".pdf") || lightboxUrl.toLowerCase().includes("/pdf");
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99999,
              background: "rgba(0,0,0,0.93)", display: "flex", flexDirection: "column" }}
            onClick={() => setLightboxUrl(null)}
          >
            {/* شريط أعلى */}
            <div
              style={{ flexShrink: 0, height: "52px", background: "rgba(0,0,0,0.75)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0 16px", gap: "8px" }}
              onClick={e => e.stopPropagation()}
            >
              <span style={{ color: "#fff", fontWeight: 700, fontSize: "14px", direction: "rtl" }}>
                {isPdf ? "📄 وثيقة أمر التحميل" : "🖼️ وثيقة أمر التحميل"}
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <a href={lightboxUrl} download target="_blank" rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: "4px",
                    background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: "8px",
                    padding: "6px 12px", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}
                  onClick={e => e.stopPropagation()}>
                  <Download size={12} />تحميل
                </a>
                <button onClick={() => setLightboxUrl(null)}
                  style={{ display: "flex", alignItems: "center", gap: "4px",
                    background: "rgba(255,255,255,0.2)", color: "#fff", border: "none",
                    borderRadius: "8px", padding: "6px 12px", fontSize: "12px",
                    fontWeight: 600, cursor: "pointer" }}>
                  <X size={14} />إغلاق
                </button>
              </div>
            </div>

            {/* منطقة المحتوى */}
            <div
              style={{ flex: 1, overflow: "auto", display: "flex",
                alignItems: "center", justifyContent: "center", padding: "16px" }}
              onClick={e => e.stopPropagation()}
            >
              {isPdf ? (
                <div style={{ textAlign: "center", color: "#fff", direction: "rtl" }}>
                  <div style={{ fontSize: "64px", marginBottom: "16px" }}>📄</div>
                  <p style={{ marginBottom: "20px", fontSize: "14px", opacity: 0.8 }}>
                    ملف PDF — اضغط لفتحه
                  </p>
                  <a href={lightboxUrl} target="_blank" rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px",
                      background: "#0891b2", color: "#fff", borderRadius: "12px",
                      padding: "14px 28px", fontSize: "15px", fontWeight: 700,
                      textDecoration: "none" }}
                    onClick={e => e.stopPropagation()}>
                    <ExternalLink size={16} />فتح الـ PDF
                  </a>
                  <br />
                  <a href={lightboxUrl} download target="_blank" rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px",
                      color: "#67e8f9", fontSize: "13px", marginTop: "12px", textDecoration: "underline" }}
                    onClick={e => e.stopPropagation()}>
                    <Download size={13} />تحميل الملف
                  </a>
                </div>
              ) : (
                <img
                  src={lightboxUrl}
                  alt="وثيقة أمر التحميل"
                  style={{ maxWidth: "100%", maxHeight: "100%",
                    width: "auto", height: "auto",
                    objectFit: "contain", borderRadius: "8px",
                    display: "block", touchAction: "pinch-zoom" }}
                  onError={() => setLightboxImgFailed(true)}
                />
              )}
            </div>

            <div style={{ flexShrink: 0, textAlign: "center", color: "rgba(255,255,255,0.35)",
              fontSize: "11px", padding: "8px" }}>
              اضغط خارج الصورة للإغلاق
            </div>
          </div>
        );
      })(),
      document.body
    )}
    </>
  );
}
