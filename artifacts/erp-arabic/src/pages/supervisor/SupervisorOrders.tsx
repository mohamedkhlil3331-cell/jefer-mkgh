import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { useAuth, canAccess } from "@/context/AuthContext";
import { uploadFilesToObjectStorage } from "@/lib/uploadFilesToObjectStorage";
import {
  Car, Wrench, RefreshCw, AlertTriangle, CheckCircle,
  Clock, Truck, Package, X, BarChart3, MapPin, ArrowRight,
  Users, Search, ChevronDown, Map, UserCheck, Link, DollarSign, ChevronLeft, Lock,
  CalendarDays, CreditCard, Key, TrendingUp, Wallet, ToggleLeft, ToggleRight,
  Layers, Banknote, Target, PieChart, ZapOff, Activity, Pencil, Check, OctagonX, Bell,
  FileText, Printer, Upload, Eye, Shield, Trash2, Save, Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet default icon paths broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const STAGE_ICON_COLOR: Record<string, string> = {
  vehicle_assigned: "#3b82f6",
  invoiced: "#a855f7",
  loaded: "#06b6d4",
};

function FitBounds({ orders }: { orders: Order[] }) {
  const map = useMap();
  useEffect(() => {
    if (orders.length === 0) return;
    const bounds = L.latLngBounds(orders.map(o => [o.delivery_lat!, o.delivery_lng!]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [map, orders]);
  return null;
}

function makeIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:22px;height:22px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function makeStartIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function makeDriverIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="background:#f97316;width:30px;height:30px;border-radius:50% 50% 50% 0;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);font-size:14px;line-height:1;">🚛</span>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
  });
}

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string; total_with_vat: number;
  delivery_location: string; destination_type: string; stage: string;
  vehicle_plate: string; driver_name: string; driver_phone: string;
  vehicle_assign_date: string; created_at: string;
  delivery_lat: number | null; delivery_lng: number | null;
  driver_lat: number | null; driver_lng: number | null;
  driver_location_updated_at: string | null;
  packaging_type?: string;
  rep_name?: string | null;
  rep_phone?: string | null;
  sla_status?: { stage: string; elapsed_minutes: number; limit_minutes: number; percent: number; status: "ok" | "warning" | "breached" };
}

interface SupplyReq {
  id: number; product_name: string; requested_qty: number; unit: string;
  trailer_loads: number; status: string; priority: string;
  notes?: string; warehouse_name?: string; requested_by?: string;
  created_at: string; vehicle_plate?: string; driver_name?: string; driver_phone?: string;
  destination_division?: string; trips_count?: number;
  driver_loading_image?: string; invoice_image?: string;
}
interface RepRequestU {
  id: number; request_no: string; product_name: string;
  loading_locations: string[]; delivery_location: string | null;
  rep_name: string | null; rep_phone: string | null;
  status: string; notes: string | null; created_by: string | null; created_at: string;
}
interface SupplyTrip {
  id: number; vehicle_plate: string; driver_phone?: string; driver_name?: string; status: string;
  product_name: string; requested_qty: number; unit: string;
  warehouse_name?: string; warehouse_location?: string;
  warehouse_lat?: number | null; warehouse_lng?: number | null;
  warehouse_manager_phone?: string; warehouse_manager_name?: string;
  destination_division?: string; supply_request_id: number;
}
interface Vehicle {
  id: number; plate_number: string; vehicle_type: string;
  status: string; driver_name: string; driver_phone: string;
   active_routing?: {
     trip_status: string; tariff_id: number | null;
     loading_place: string | null; unloading_place: string | null;
     tariff_loading_place: string | null; tariff_unloading_place: string | null;
     cargo_type: string | null; driver_expense: number; rental: number;
   } | null;
  branch?: string | null;
  linked_user_id?: number | null;
  linked_user_name?: string | null;
  linked_user_phone?: string | null;
  capacity?: number; notes?: string; gps_device_id?: string | null;
  last_delivery_location?: string | null;
  last_delivery_date?: string | null;
  last_trip_loading_place?: string | null;
  last_trip_unloading_place?: string | null;
  last_trip_date?: string | null;
}
interface GpsLocation {
  gps_device_id: string; lat: number; lng: number; speed: number; updated_at: string;
}
interface TrackPoint {
  lat: number; lng: number; speed: number; t: number;
}
interface Driver {
  id: number; name: string; phone: string;
}
interface Tariff {
  id: number; loading_place: string; unloading_place: string;
  driver_expense: number; rental: number; status: string; proposed_by: string | null;
  vehicle_type?: string;
  locations?: { id: number; kind: "loading" | "unloading"; name: string; url: string }[];
}
interface ExternalRental {
  id: number; customer_name: string; customer_phone: string;
  vehicle_type: string; rental_date: string; start_date?: string; duration_days: number;
  pickup_location: string; destination: string; payment_method: string;
  status: string; assigned_vehicle_plate: string | null; assigned_driver_name: string | null;
  driver_bonus?: number | null; driver_phone?: string | null;
  driver_stage?: string | null; driver_stage_at?: string | null;
  notes: string | null; created_at: string;
  total_price?: number | null; estimated_price?: number | null; payment_type?: string | null;
}
interface SettlementRow {
  driver_name: string; phone: string; vehicle_plate: string; status: string;
  earned: number; expenses: number; settled: number; deferred: number; companySent: number;
  balance: number; trips: number; tripsNoBonus: number;
  lastSettlement: { id?: number; allocated_amount: number; settlement_date: string; deferred: number; delivered_at: string | null } | null;
  lastCompanySend: { id: number; amount: number; note: string | null; created_at: string } | null;
}
interface BreakdownReport {
  id: number; breakdown_type: string; description: string | null;
  fault_attribution: string | null; operational_state: string | null;
  action_taken: string | null; driver_name: string | null; created_at: string;
}
interface VehicleStat {
  id: number; plate_number: string; vehicle_type: string; driver_name: string; status: string;
  equipment_type: string | null; load_capacity_tons: number | null;
  trips: number; revenue: number; expenses: number; breakdowns: number;
  workshopVisits: number; workshopCost: number; workshopRepeats: number;
  attribution: Record<string, number>;
  topCauses: Array<{ notes: string; c: number }>;
  reports: BreakdownReport[];
  workingDays: number; daysDelivered: number; daysWorkshopDays: number;
  loadedNotDelivered: number; daysIdle: number; avgDailyRevenue: number;
}
interface FleetSummary {
  totalRevenue: number; totalTrips: number; totalBreakdowns: number; totalExpenses: number;
  monthlyRevenue: Array<{ month: string; revenue: number; trips: number }>;
  topCauses: Array<{ notes: string; c: number }>;
  attrSummary: Array<{ fault_attribution: string; c: number }>;
  workshopRepeat: Array<{ vehicle_plate: string; visits: number; cost: number }>;
  customerRevenue: Array<{ customer_name: string; trips: number; revenue: number; totalQty: number }>;
  unattributedBreakdowns: Array<{ id: number; breakdown_type: string; description: string | null; fault_attribution: string | null; driver_name: string | null; created_at: string }>;
}

const STATUS_AR:    Record<string, string> = { available: "متاح", busy: "مشغول", maintenance: "صيانة", broken: "معطل" };
const STATUS_COLOR: Record<string, string> = {
  available:   "bg-green-50 text-green-700 border-green-200",
  busy:        "bg-blue-50 text-blue-700 border-blue-200",
  maintenance: "bg-amber-50 text-amber-700 border-amber-200",
  broken:      "bg-red-50 text-red-700 border-red-200",
};
const STATUS_DOT: Record<string, string> = {
  available: "bg-green-500", busy: "bg-blue-500", maintenance: "bg-amber-500", broken: "bg-red-500",
};

// ── Fleet Management types & constants (merged from FleetManagePage) ──────────
type ComplianceDoc  = { id: number; car_number: string; doc_type: string; start_date?: string; end_date?: string; image_url?: string; notes?: string; created_at: string };
type DocFormState   = { file: File | null; start_date: string; end_date: string; notes: string; uploading: boolean };
type DocStatus      = "missing" | "uploaded" | "valid" | "expiring" | "expired";
type VehicleTypeDef = { id: number; name: string; icon: string; is_active: number };
type FleetNotif     = { id: number; title: string; body: string; read: number; created_at: string };
type DriverProfile  = { id: number; driver_name: string; phone?: string; vehicle_plate?: string };
type VehicleTypeAssignment = { type_name: string; is_primary: number };
type FleetVehicle   = { id: number; plate_number: string; vehicle_name?: string; vehicle_type?: string; entity?: string; branch?: string; status?: string; driver_name?: string; driver_phone?: string; notes?: string; max_weight_kg?: number; empty_weight_kg?: number; gps_device_id?: string; linked_user_id?: number; linked_user_name?: string; linked_user_phone?: string; compliance?: Record<string, ComplianceDoc>; types?: VehicleTypeAssignment[] };

const FM_DOC_TYPES = [
  { key: "insurance",      label: "التأمين",        icon: Shield,   },
  { key: "inspection",     label: "الفحص الدوري",   icon: Wrench,   },
  { key: "operation_card", label: "كرت التشغيل",    icon: FileText, },
];
const FM_VEH_TYPES      = ["سطحة","بلكر","ونش","دين","شاحنة","بيك أب","أخرى"];
const FM_ENTITY_OPTIONS = ["مصنع سمنت مكس","النقليات","الاسمنت","مصنع روعة جيفر","سيارة إيجار خارجي"];
const FM_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  available:   { label: "متاح",       cls: "bg-green-100 text-green-700"   },
  on_trip:     { label: "في رحلة",    cls: "bg-blue-100 text-blue-700"     },
  maintenance: { label: "في الصيانة", cls: "bg-yellow-100 text-yellow-700" },
  inactive:    { label: "متوقف",      cls: "bg-gray-100 text-gray-500"     },
};
const EMPTY_DOC_FORM: DocFormState = { file: null, start_date: "", end_date: "", notes: "", uploading: false };
const FM_DOC_STATUS_CFG: Record<DocStatus, { label: string; dot: string; badge: string; card: string; border: string }> = {
  missing:  { label: "غير موجودة",   dot: "bg-gray-300",   badge: "bg-gray-100 text-gray-500",     card: "bg-gray-50",      border: "border-gray-200"   },
  uploaded: { label: "موجودة",       dot: "bg-blue-400",   badge: "bg-blue-100 text-blue-600",     card: "bg-blue-50/30",   border: "border-blue-100"   },
  valid:    { label: "سارية",        dot: "bg-green-500",  badge: "bg-green-100 text-green-700",   card: "bg-green-50/30",  border: "border-green-200"  },
  expiring: { label: "تنتهي قريباً", dot: "bg-orange-400", badge: "bg-orange-100 text-orange-700", card: "bg-orange-50/40", border: "border-orange-200" },
  expired:  { label: "منتهية ⚠️",   dot: "bg-red-500",    badge: "bg-red-100 text-red-600",       card: "bg-red-50/40",    border: "border-red-200"    },
};
function fmGetDocStatus(doc?: ComplianceDoc): DocStatus {
  if (!doc) return "missing";
  if (!doc.end_date) return doc.image_url || doc.start_date ? "uploaded" : "missing";
  const d = Math.floor((new Date(doc.end_date).getTime() - Date.now()) / 86400000);
  if (d < 0) return "expired";
  if (d < 30) return "expiring";
  return "valid";
}

export default function SupervisorOrders() {
  const { user } = useAuth();
  const isFleetOnly = useMemo(() => {
    if (!user) return false;
    return canAccess(user, "fleet_vehicles_edit") && !canAccess(user, "ops_supervisor");
  }, [user]);
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers,  setDrivers]  = useState<Driver[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useRememberedState("supervisor-orders-tab", "dashboard" as "dashboard" | "pending" | "fleet" | "active" | "map" | "tariffs" | "rentals" | "performance" | "settlements" | "stops" | "urgent" | "new_routing" | "my_trips");
  const [supplyReqs,        setSupplyReqs]        = useState<SupplyReq[]>([]);
  const [repReqUrgent,      setRepReqUrgent]      = useState<RepRequestU[]>([]);
  const [repAssignModal,    setRepAssignModal]    = useState<RepRequestU | null>(null);
  const [repAssignForm,     setRepAssignForm]     = useState({ vehicle_plate: "", driver_name: "", driver_phone: "" });
  const [repAssigning,      setRepAssigning]      = useState(false);
  const [supplyActiveTrips, setSupplyActiveTrips] = useState<SupplyTrip[]>([]);

  interface BulkerActiveOrder {
    id: number; permit_number: string | null; cement_ref_number: string | null;
    vehicle_plate: string; driver_name: string; driver_phone: string | null;
    cargo_type: string | null; unload_location: string | null;
    status: string; created_at: string;
  }
  const [bulkerActiveOrders, setBulkerActiveOrders] = useState<BulkerActiveOrder[]>([]);
  const [supplyAssignModal, setSupplyAssignModal] = useState<SupplyReq | null>(null);
  const [supplyAssignForm,  setSupplyAssignForm]  = useState({ vehicle_plate: "", driver_name: "", driver_phone: "" });
  const [supplySubmitting,  setSupplySubmitting]  = useState(false);
  /* ── رحلاتي ── */
  interface MyTrip {
    id: number; supply_request_id: number;
    vehicle_plate: string | null; driver_name: string | null; driver_phone: string | null;
    status: string; created_at: string; delivered_at: string | null;
    product_name: string; warehouse_name: string | null; destination_division: string | null;
    routing_dispatch_id: number; driver_expense: number; rental: number;
    sr_notes: string | null; requested_by: string | null;
    tariff_id: number | null; loading_place: string | null; unloading_place: string | null;
    tariff_loading_place: string | null; tariff_unloading_place: string | null;
    override_loading_place: string | null; override_unloading_place: string | null;
    loading_location_name: string | null; loading_location_url: string | null;
    unloading_location_name: string | null; unloading_location_url: string | null;
    warehouse_id: number | null; cargo_type: string | null;
    customer_name: string | null; customer_type: string | null;
    rep_name: string | null; rep_phone: string | null; route_type: string | null;
    permit_image_url: string | null;
  }
  const [myTrips,        setMyTrips]        = useState<MyTrip[]>([]);
  const [myTripsLoading, setMyTripsLoading] = useState(false);
  const [myTripsSaving,  setMyTripsSaving]  = useState<number | null>(null);
  const [myTripsError,   setMyTripsError]   = useState("");
  const [editMyTrip,     setEditMyTrip]     = useState<MyTrip | null>(null);
  const [editMyForm,     setEditMyForm]     = useState({
    tariff_id: "", loading_place: "", unloading_place: "",
    override_loading_place: "", override_unloading_place: "", warehouse_id: "",
    product_name: "", cargo_type: "", destination_division: "", customer_name: "", customer_type: "rental",
    rep_name: "", rep_phone: "", driver_expense: "0", rental: "0",
    route_type: "direct" as "direct" | "via_fusahat",
    vehicle_plate: "", driver_name: "", driver_phone: "", notes: "",
    loading_location_name: "", loading_location_url: "",
    unloading_location_name: "", unloading_location_url: "",
  });
  const [editMyPermitFile, setEditMyPermitFile] = useState<File | null>(null);
  const [editMyPermitError, setEditMyPermitError] = useState("");
  const loadMyTrips = () => {
    setMyTripsLoading(true);
    setMyTripsError("");
    fetch(`/api/routing-dispatch-trips?_=${Date.now()}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` },
    })
      .then(async r => {
        if (!r.ok) throw new Error("تعذر تحميل الرحلات");
        return r.json();
      })
      .then((d: MyTrip[] | { rows?: MyTrip[] }) => {
        const rows = Array.isArray(d) ? d : d?.rows;
        if (!Array.isArray(rows)) throw new Error("استجابة الرحلات غير صالحة");
        setMyTrips(rows);
      })
      .catch(error => setMyTripsError(error instanceof Error ? error.message : "تعذر تحميل الرحلات"))
      .finally(() => setMyTripsLoading(false));
  };
  const cancelMyTrip = async (id: number) => {
    if (!confirm("إلغاء هذه الرحلة؟")) return;
    setMyTripsSaving(id);
    try {
      const response = await fetch(`/api/routing-dispatch-trips/${id}/cancel`, {
        method: "PUT", headers: { Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` },
      });
      if (!response.ok) throw new Error("تعذر إلغاء الرحلة");
      loadMyTrips();
    } catch (error) {
      setMyTripsError(error instanceof Error ? error.message : "تعذر إلغاء الرحلة");
    } finally { setMyTripsSaving(null); }
  };
  const deleteMyTrip = async (id: number) => {
    if (!confirm("حذف الرحلة نهائياً؟ لا يمكن التراجع.")) return;
    setMyTripsSaving(id);
    await fetch(`/api/routing-dispatch-trips/${id}`, { method: "DELETE" });
    loadMyTrips(); setMyTripsSaving(null);
  };
  const saveMyTrip = async () => {
    if (!editMyTrip) return;
    const locationPairs = [
      [editMyForm.loading_location_name, editMyForm.loading_location_url, "رابط موقع التحميل"],
      [editMyForm.unloading_location_name, editMyForm.unloading_location_url, "رابط موقع التنزيل"],
    ] as const;
    for (const [name, url, label] of locationPairs) {
      if (!!name.trim() !== !!url.trim()) {
        setEditMyPermitError("أدخل اسم الموقع والرابط معاً، أو اتركهما فارغين");
        return;
      }
      if (url.trim()) {
        try {
          const parsed = new URL(url.trim());
          if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
        } catch {
          setEditMyPermitError(`${label} يجب أن يكون رابط HTTP أو HTTPS صالحاً`);
          return;
        }
      }
    }
    if (editMyPermitFile && (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(editMyPermitFile.type) || editMyPermitFile.size > 15 * 1024 * 1024)) {
      setEditMyPermitError("يجب أن تكون صورة الفسح صورة أو PDF بحجم لا يتجاوز 15 ميجابايت");
      return;
    }
    setMyTripsSaving(editMyTrip.id);
    setEditMyPermitError("");
    try {
      let permitImageUrl: string | undefined;
      if (editMyPermitFile) {
        const request = await fetch("/api/storage/uploads/request-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editMyPermitFile.name,
            size: editMyPermitFile.size,
            contentType: editMyPermitFile.type,
          }),
        });
        if (!request.ok) throw new Error("تعذر تجهيز رفع صورة الفسح");
        const { uploadURL, objectPath } = await request.json() as { uploadURL: string; objectPath: string };
        const uploaded = await fetch(uploadURL, {
          method: "PUT", body: editMyPermitFile, headers: { "Content-Type": editMyPermitFile.type },
        });
        if (!uploaded.ok) throw new Error("تعذر رفع صورة الفسح");
        permitImageUrl = `/api/storage${objectPath}`;
      }
      const body = {
        ...editMyForm,
        tariff_id: editMyForm.tariff_id ? Number(editMyForm.tariff_id) : null,
        tariff_loading_place: editMyForm.loading_place,
        tariff_unloading_place: editMyForm.unloading_place,
        loading_location_name: editMyForm.loading_location_name.trim(),
        loading_location_url: editMyForm.loading_location_url.trim(),
        unloading_location_name: editMyForm.unloading_location_name.trim(),
        unloading_location_url: editMyForm.unloading_location_url.trim(),
        warehouse_id: editMyForm.warehouse_id ? Number(editMyForm.warehouse_id) : null,
        driver_expense: Number(editMyForm.driver_expense) || 0,
        rental: Number(editMyForm.rental) || 0,
        ...(permitImageUrl ? { permit_image_url: permitImageUrl } : {}),
      };
      const response = await fetch(`/api/routing-dispatch-trips/${editMyTrip.id}`, {
        method: "PUT", headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "تعذر حفظ تعديلات الرحلة");
      }
      setEditMyTrip(null);
      setEditMyPermitFile(null);
      loadMyTrips();
    } catch (error) {
      setEditMyPermitError(error instanceof Error ? error.message : "تعذر حفظ تعديلات الرحلة");
    } finally {
      setMyTripsSaving(null);
    }
  };
  const [supplyAssignSuccess, setSupplyAssignSuccess] = useState(false);
  const [rejectingSupplyId, setRejectingSupplyId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectingOrderId, setRejectingOrderId] = useState<number | null>(null);
  const [rejectOrderNote, setRejectOrderNote] = useState("");
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);
  const [cancelOrderNote, setCancelOrderNote] = useState("");
  const [swapModal,     setSwapModal]     = useState<Order | null>(null);
  const [swapForm,      setSwapForm]      = useState({ vehicle_plate: "", driver_name: "", driver_phone: "" });
  const [linkVehicleForm,   setLinkVehicleForm]   = useState({ phone: "", vehicle_plate: "" });
  const [linkVehicleSaving, setLinkVehicleSaving] = useState(false);
  const [linkVehicleMsg,    setLinkVehicleMsg]    = useState<{ ok: boolean; text: string } | null>(null);
  const [swapSubmitting, setSwapSubmitting] = useState(false);

  const [selectedOrder,   setSelectedOrder]   = useState<Order | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedDriver,  setSelectedDriver]  = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [vehicleSearch,      setVehicleSearch]      = useRememberedState("supervisor-vehicle-search", "");
  const [fleetStatusFilter,  setFleetStatusFilter]  = useRememberedState("supervisor-fleet-status-filter", "" as "" | "available" | "busy" | "maintenance" | "broken");
  const [driverPwModal,   setDriverPwModal]   = useState<{ vehicle: Vehicle | FleetVehicle; newPw: string } | null>(null);
  const [allTariffs,        setAllTariffs]        = useState<Tariff[]>([]);

  const [autoAssign,          setAutoAssign]          = useState(false);
  const [stoppedAlertMinutes, setStoppedAlertMinutes] = useState(30);
  const [altDriverPhone,   setAltDriverPhone]   = useState("");
  const [altDriverName,    setAltDriverName]    = useState("");
  const [settlementLedger, setSettlementLedger] = useState<SettlementRow[]>([]);
  const [vehicleStats,     setVehicleStats]     = useState<VehicleStat[]>([]);
  const [perfVehicle,      setPerfVehicle]      = useRememberedState("supervisor-performance-vehicle-filter", "");
  const [bdPlateEdit,      setBdPlateEdit]      = useState<{ id: number; plate: string } | null>(null);
  const [bdPlateSaving,    setBdPlateSaving]    = useState(false);
  const [settlementModal,  setSettlementModal]  = useState<{ driver: SettlementRow; amount: string; settlement_date: string; deferred: boolean; notes: string; is_cash: boolean } | null>(null);
  const [submittingSettle, setSubmittingSettle] = useState(false);
  const [tariffPriceInputs, setTariffPriceInputs] = useState<Record<number, { driver_expense: string; rental: string }>>({});
  const [selectedTariffId,  setSelectedTariffId]  = useState<number | null>(null);
  const [selectedRouteTariff, setSelectedRouteTariff] = useState<Tariff | null>(null);
  const [selectedRouteVehicles, setSelectedRouteVehicles] = useState<Set<string>>(new Set());
  const [fusahatRouteIds, setFusahatRouteIds] = useState<Set<number>>(() => {
    try { return new Set<number>(JSON.parse(localStorage.getItem("fusahat_route_ids") || "[]")); } catch { return new Set<number>(); }
  });
  const [routeSending, setRouteSending] = useState(false);
  const [routeSentMsg, setRouteSentMsg] = useState<string | null>(null);
  const [routeVehiclesError, setRouteVehiclesError] = useState(false);
  const routeRequestKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  /* ── Routing form lookup data ── */
  const [routeWarehouses,    setRouteWarehouses]    = useState<{id:number;name:string}[]>([]);
  const [routeWarehouseApproval, setRouteWarehouseApproval] = useState<{id:number;name:string;requires_approval:boolean}[]>([]);
  const [selectedApprovalWarehouseIds, setSelectedApprovalWarehouseIds] = useState<Set<number>>(new Set());
  const [warehouseApprovalChoice, setWarehouseApprovalChoice] = useState(true);
  const [warehouseApprovalSaving, setWarehouseApprovalSaving] = useState(false);
  const [warehouseApprovalMessage, setWarehouseApprovalMessage] = useState("");
  const [warehouseApprovalError, setWarehouseApprovalError] = useState("");
  const [showWarehouseApprovalSettings, setShowWarehouseApprovalSettings] = useState(false);
  const [routeFleetBranches, setRouteFleetBranches] = useState<{plate_number:string;branch:string|null}[]>([]);
  const [routeBranchFilter, setRouteBranchFilter] = useRememberedState("supervisor-route-branch-filter", "");
  const [routeBranchError, setRouteBranchError] = useState("");
  const [routeCustomers,     setRouteCustomers]     = useState<{id:number;name:string;phone?:string;customer_type:"rental"|"company"}[]>([]);
  const [routeReps,          setRouteReps]          = useState<{id:number;name:string;phone:string}[]>([]);
  const [routeCargoTypes,    setRouteCargoTypes]    = useState<{id:number;name:string}[]>([]);
  /* ── Routing form selected values (__ prefix = special sentinel) ── */
  const [routeUnloadingSel,   setRouteUnloadingSel]  = useState("");
  const [routeUnloadingCustom,setRouteUnloadingCustom]=useState("");
  const [routeLoadingLocationSel, setRouteLoadingLocationSel] = useState("");
  const [routeUnloadingLocationSel, setRouteUnloadingLocationSel] = useState("");
  const [routeLoadingLocationCustom, setRouteLoadingLocationCustom] = useState({ name: "", url: "" });
  const [routeUnloadingLocationCustom, setRouteUnloadingLocationCustom] = useState({ name: "", url: "" });
  const [routeCustomerSel,    setRouteCustomerSel]   = useState("");
  const [routeCustomerCustom, setRouteCustomerCustom]=useState("");
  const [routeCustomerType,   setRouteCustomerType]  = useState<"rental"|"company">("rental");
  const [routeRepSel,         setRouteRepSel]        = useState("");
  const [routeRepCustom,      setRouteRepCustom]     = useState("");
  const [routeRepPhone,       setRouteRepPhone]      = useState("");
  const [routeCargoSel,       setRouteCargoSel]      = useState("");
  const [routeCargoCustom,    setRouteCargoCustom]   = useState("");
  const [routeCargoQty,       setRouteCargoQty]      = useState("");
  const [routeCargoItems,     setRouteCargoItems]    = useState<{cargo_type:string;quantity:number}[]>([]);
  const [routePermitFiles,    setRoutePermitFiles]   = useState<File[]>([]);
  const pendingTariffs = allTariffs.filter(t => t.status === "pending");
  const tariffs        = allTariffs.filter(t => t.status === "approved");

  // ── Routing tab search filters ────────────────────────────────────────────
  const [routingVehicleType, setRoutingVehicleType] = useRememberedState("supervisor-routing-vehicle-type-filter", "");
  const [routingLoading,     setRoutingLoading]     = useRememberedState("supervisor-routing-loading-filter", "");
  const [routingUnloading,   setRoutingUnloading]   = useRememberedState("supervisor-routing-unloading-filter", "");
  const [routingSearch,      setRoutingSearch]      = useRememberedState("supervisor-routing-search", "");
  const [showRouteCards,     setShowRouteCards]     = useState(false);

  // ── المفضلة — محفوظة في localStorage ────────────────────────────────────
  const [favoriteRouteIds, setFavoriteRouteIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem("routing_favorites");
      return saved ? new Set<number>(JSON.parse(saved)) : new Set<number>();
    } catch { return new Set<number>(); }
  });

  const toggleFavorite = (id: number) => {
    setFavoriteRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("routing_favorites", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const routingVehicleTypes    = useMemo(() => [...new Set(tariffs.map(t => t.vehicle_type || "").filter(Boolean))].sort(), [tariffs]);
  const routingLoadingPlaces   = useMemo(() => [...new Set(tariffs.map(t => t.loading_place).filter(Boolean))].sort(),  [tariffs]);
  const routingUnloadingPlaces = useMemo(() => [...new Set(tariffs.map(t => t.unloading_place).filter(Boolean))].sort(), [tariffs]);

  const filteredTariffs = useMemo(() => tariffs
    .filter(t => {
      if (routingVehicleType && (t.vehicle_type || "") !== routingVehicleType) return false;
      if (routingLoading     && t.loading_place  !== routingLoading)           return false;
      if (routingUnloading   && t.unloading_place !== routingUnloading)        return false;
      if (routingSearch.trim() && ![t.loading_place, t.unloading_place, t.vehicle_type || ""]
        .some(value => value.toLocaleLowerCase().includes(routingSearch.trim().toLocaleLowerCase()))) return false;
      return true;
    })
    .sort((a, b) => {
      const af = favoriteRouteIds.has(a.id) ? 0 : 1;
      const bf = favoriteRouteIds.has(b.id) ? 0 : 1;
      return af - bf;
    }),
  [tariffs, routingVehicleType, routingLoading, routingUnloading, routingSearch, favoriteRouteIds]);

  const routingHasFilter   = !!(routingVehicleType || routingLoading || routingUnloading || routingSearch.trim());
  const favoriteTariffs    = useMemo(() => filteredTariffs.filter(t => favoriteRouteIds.has(t.id)), [filteredTariffs, favoriteRouteIds]);
  const nonFavoriteTariffs = useMemo(() => filteredTariffs.filter(t => !favoriteRouteIds.has(t.id)), [filteredTariffs, favoriteRouteIds]);
  const [rentals,       setRentals]       = useState<ExternalRental[]>([]);
  const [rentalFilter,  setRentalFilter]  = useRememberedState("supervisor-rental-status-filter", "all" as "all" | "pending" | "approved" | "completed" | "cancelled" | "deferred");
  const [rentalAssignModal, setRentalAssignModal] = useState<ExternalRental | null>(null);
  const [rentalPlate,       setRentalPlate]       = useState("");
  const [rentalDriver,      setRentalDriver]      = useState("");
  const [rentalDriverPhone, setRentalDriverPhone] = useState("");
  const [rentalBonus,       setRentalBonus]       = useState("");

  const [rentalEditModal,   setRentalEditModal]   = useState<ExternalRental | null>(null);
  const [rentalEditForm,    setRentalEditForm]    = useState({ vehicle_type: "", start_date: "", duration_days: 1, notes: "", total_price: "", pickup_location: "", destination: "" });
  const [savingRentalEdit,  setSavingRentalEdit]  = useState(false);
  const [fleetSummary, setFleetSummary] = useState<FleetSummary | null>(null);
  const [perfFrom, setPerfFrom] = useRememberedState("supervisor-performance-date-from", "");
  const [perfTo,   setPerfTo]   = useRememberedState("supervisor-performance-date-to", "");
  const [companySendModal, setCompanySendModal] = useState<{ driver: SettlementRow; amount: string; note: string } | null>(null);
  const [equipModal, setEquipModal] = useState<{ plate: string; equipment_type: string; load_capacity_tons: string; vehicle_subtype: string } | null>(null);
  const [autoAssigning, setAutoAssigning] = useState<number | null>(null);
  const [gpsLocations, setGpsLocations] = useState<GpsLocation[]>([]);

  interface VehicleStop {
    id: number; order_number: string; vehicle_plate: string; driver_name: string | null;
    driver_phone: string | null; stage: string; vehicle_stopped_since: string;
    vehicle_stop_notified_at: string | null; duration_minutes: number; still_stopped: boolean;
    notification_sent_at: string | null;
  }
  const [vehicleStops, setVehicleStops] = useState<VehicleStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [vehicleTracks, setVehicleTracks] = useState<Record<string, TrackPoint[]>>({});
  const [gpsEditPlate, setGpsEditPlate] = useState<string | null>(null);
  const [gpsEditValue, setGpsEditValue] = useState("");
  const [gpsLooking,   setGpsLooking]   = useState(false);
  const [gpsLookupRes, setGpsLookupRes] = useState<{found:boolean;wialon_id?:string;name?:string;imei?:string|null}|null>(null);
  const [trackRange, setTrackRange] = useRememberedState("supervisor-track-range", "24h" as "6h" | "12h" | "24h" | "custom");
  const [customFrom, setCustomFrom] = useRememberedState("supervisor-track-date-from", "");
  const [customTo,   setCustomTo]   = useRememberedState("supervisor-track-date-to", "");

  // ── Fleet Management state (merged from FleetManagePage) ──────────────────
  const [fmVehicles,       setFmVehicles]       = useState<FleetVehicle[]>([]);
  const [fmLoading,        setFmLoading]        = useState(false);
  const [fmDrivers,        setFmDrivers]        = useState<DriverProfile[]>([]);
  const [fmSearch,         setFmSearch]         = useRememberedState("supervisor-fleet-management-search", "");
  const [fmSelected,       setFmSelected]       = useState<FleetVehicle | null>(null);
  const [fmDetailTab,      setFmDetailTab]      = useState<"info" | "docs">("info");
  const [fmEditForm,       setFmEditForm]       = useState<Record<string, string>>({});
  const [fmSaving,         setFmSaving]         = useState(false);
  const [fmVehicleDocs,    setFmVehicleDocs]    = useState<ComplianceDoc[]>([]);
  const [fmDocForms,       setFmDocForms]       = useState<Record<string, DocFormState>>({});
  const [fmNewDoc,         setFmNewDoc]         = useState<DocFormState & { doc_type: string }>({ ...EMPTY_DOC_FORM, doc_type: "" });
  const [fmAddOpen,        setFmAddOpen]        = useState(false);
  const [fmAddForm,        setFmAddForm]        = useState<Record<string, string>>({ status: "available" });
  const [fmAddSaving,      setFmAddSaving]      = useState(false);
  const [vehicleTypes,     setVehicleTypes]     = useState<VehicleTypeDef[]>([]);
  const [fmTypeFilter,     setFmTypeFilter]     = useRememberedState("supervisor-fleet-type-filter", "all");
  const [fmNotifs,         setFmNotifs]         = useState<FleetNotif[]>([]);
  const [fmEditTypes,      setFmEditTypes]      = useState<string[]>([]);
  const [fmEditPrimaryType,setFmEditPrimaryType]= useState<string>("");
  const [fmXlsOpen,        setFmXlsOpen]        = useState(false);
  const [fmImporting,      setFmImporting]      = useState(false);
  const fmImportRef = useRef<HTMLInputElement | null>(null);
  const fmFileRefs    = useRef<Record<string, HTMLInputElement | null>>({});
  const fmNewDocFileRef = useRef<HTMLInputElement | null>(null);

  function buildRangeParams(range: "6h" | "12h" | "24h" | "custom", cfrom: string, cto: string): string {
    const now = Math.floor(Date.now() / 1000);
    if (range === "custom") {
      const f = cfrom ? Math.floor(new Date(cfrom).getTime() / 1000) : now - 24 * 3600;
      const t = cto   ? Math.floor(new Date(cto).getTime()   / 1000) : now;
      return `?from=${f}&to=${t}`;
    }
    const hours = range === "6h" ? 6 : range === "12h" ? 12 : 24;
    return `?from=${now - hours * 3600}&to=${now}`;
  }

  const loadGpsLocations = (range = trackRange, cfrom = customFrom, cto = customTo) => {
    const qs = buildRangeParams(range, cfrom, cto);
    return fetch("/api/gps/vehicles")
      .then(r => r.json())
      .then((d: GpsLocation[]) => {
        const locs: GpsLocation[] = Array.isArray(d) ? d : [];
        setGpsLocations(locs);
        setVehicleTracks({});
        locs.forEach(loc => {
          fetch(`/api/gps/vehicles/${loc.gps_device_id}/history${qs}`)
            .then(r => r.json())
            .then((pts: TrackPoint[]) => {
              if (Array.isArray(pts) && pts.length > 0) {
                setVehicleTracks(prev => ({ ...prev, [loc.gps_device_id]: pts }));
              }
            })
            .catch(() => {});
        });
      })
      .catch(() => {});
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/workflow/orders?role=supervisor").then(r => r.json()),
      fetch("/api/workflow/vehicles").then(r => r.json()),
      fetch("/api/workflow/drivers").then(r => r.json()),
      fetch("/api/supervisor-settings").then(r => r.json()),
    ]).then(([o, v, d, settings]) => {
      setOrders(Array.isArray(o) ? o : []);
      setVehicles(Array.isArray(v) ? v : []);
      setDrivers(Array.isArray(d) ? d : []);
      setAutoAssign(!!settings?.auto_assign_enabled);
      if (settings?.stopped_alert_minutes != null) setStoppedAlertMinutes(settings.stopped_alert_minutes);
    }).finally(() => setLoading(false));
  };
  const loadRoutingVehicles = () =>
    fetch("/api/workflow/vehicles").then(r => {
      if (!r.ok) throw new Error("تعذر تحديث السيارات");
      return r.json();
    }).then((rows: Vehicle[]) => {
      if (!Array.isArray(rows)) throw new Error("بيانات السيارات غير صالحة");
      setVehicles(rows);
      setRouteVehiclesError(false);
    }).catch(() => setRouteVehiclesError(true));
  const loadTariffs = () =>
    fetch("/api/tariffs").then(r => r.json()).then(d => setAllTariffs(d.rows || []));
  useEffect(() => {
    if (tab === "new_routing" || tab === "my_trips") void loadTariffs();
  }, [tab]);
  const loadRentals = () =>
    fetch("/api/external-rentals").then(r => r.json()).then(d => setRentals(Array.isArray(d) ? d : []));
  const loadSettlements = () =>
    fetch("/api/driver-settlements/ledger").then(r => r.json()).then(d => setSettlementLedger(Array.isArray(d) ? d : []));
  const buildPerfUrl = (base: string, fromOverride?: string, toOverride?: string) => {
    const f = fromOverride !== undefined ? fromOverride : perfFrom;
    const t = toOverride   !== undefined ? toOverride   : perfTo;
    const p = new URLSearchParams();
    if (f) p.set("from", f);
    if (t) p.set("to",   t);
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const loadVehicleStats = (fromOverride?: string, toOverride?: string) =>
    fetch(buildPerfUrl("/api/supervisor/vehicle-stats", fromOverride, toOverride))
      .then(r => r.json()).then(d => setVehicleStats(Array.isArray(d) ? d : []));
  const loadFleetSummary = (fromOverride?: string, toOverride?: string) =>
    fetch(buildPerfUrl("/api/supervisor/fleet-summary", fromOverride, toOverride))
      .then(r => r.json()).then(d => setFleetSummary(d));

  const loadRoutingLookup = () => {
    Promise.all([
      fetch("/api/warehouses").then(r => r.json()),
      fetch("/api/trip-customers").then(r => r.json()),
      fetch("/api/reps").then(r => r.json()),
      fetch("/api/routing-cargo-types").then(r => r.ok ? r.json() : []),
    ]).then(([wh, cu, rp, cargo]) => {
      setRouteWarehouses(Array.isArray(wh) ? wh : []);
      setRouteCustomers(Array.isArray(cu) ? cu : []);
      setRouteReps(Array.isArray(rp) ? rp : []);
      setRouteCargoTypes(Array.isArray(cargo) ? cargo : []);
    }).catch(() => {});
    fetch("/api/fleet-vehicles-list")
      .then(r => {
        if (!r.ok) throw new Error("تعذر تحميل فروع السيارات");
        return r.json();
      })
      .then((rows: {plate_number:string;branch?:string|null}[]) => {
        if (!Array.isArray(rows)) throw new Error("بيانات فروع السيارات غير صالحة");
        setRouteFleetBranches(rows.map(v => ({ plate_number: v.plate_number, branch: v.branch ?? null })));
        setRouteBranchError("");
      })
      .catch(() => setRouteBranchError("تعذر تحميل قائمة فروع الأسطول؛ أعد المحاولة قبل التصفية"));
    fetch("/api/warehouse-approval-settings", {
      headers: { Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` },
    })
      .then(r => {
        if (!r.ok) throw new Error("تعذر تحميل إعدادات موافقة المستودعات");
        return r.json();
      })
      .then((result: {warehouses?:{id:number;name:string;requires_approval:boolean}[]}) => {
        if (!Array.isArray(result?.warehouses)) throw new Error("بيانات إعدادات المستودعات غير صالحة");
        setRouteWarehouseApproval(result.warehouses);
        setWarehouseApprovalError("");
      })
      .catch(() => setWarehouseApprovalError("تعذر تحميل إعدادات موافقة المستودعات"));
  };
  const saveWarehouseApprovalSettings = async () => {
    if (selectedApprovalWarehouseIds.size === 0) {
      setWarehouseApprovalError("حدد مستودعاً واحداً على الأقل");
      return;
    }
    if (!warehouseApprovalChoice && !confirm("عند الحفظ ستُعالج الحمولات الواصلة والمعلّقة للمستودعات المحددة تلقائياً: ستُضاف للمخزون، وتُسجّل رحلاتها، وتُفرج السيارات. هل تريد المتابعة؟")) return;
    setWarehouseApprovalSaving(true);
    setWarehouseApprovalError("");
    setWarehouseApprovalMessage("");
    try {
      const response = await fetch("/api/warehouse-approval-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}`,
        },
        body: JSON.stringify({
          warehouse_ids: [...selectedApprovalWarehouseIds],
          requires_approval: warehouseApprovalChoice,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "تعذر تحديث إعدادات موافقة المستودعات");
      setWarehouseApprovalMessage(result?.message || "تم حفظ إعدادات موافقة المستودعات");
      const refreshed = await fetch("/api/warehouse-approval-settings", {
        headers: { Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` },
      });
      if (refreshed.ok) {
        const settings = await refreshed.json() as {warehouses?:{id:number;name:string;requires_approval:boolean}[]};
        if (Array.isArray(settings?.warehouses)) setRouteWarehouseApproval(settings.warehouses);
      }
    } catch (error) {
      setWarehouseApprovalError(error instanceof Error ? error.message : "تعذر تحديث إعدادات موافقة المستودعات");
    } finally {
      setWarehouseApprovalSaving(false);
    }
  };

  const loadSupplyReqs = () => {
    fetch("/api/supply-requests")
      .then(r => r.json())
      .then(d => setSupplyReqs(Array.isArray(d) ? d.filter((r: { status: string }) => ["pending","approved","supervisor_assigned"].includes(r.status)) : []))
      .catch(() => {});
    fetch("/api/rep-requests?status=pending")
      .then(r => r.ok ? r.json() : [])
      .then(d => setRepReqUrgent(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  const cancelTrip = async (id: number) => {
    await fetch(`/api/workflow/orders/${id}/cancel-trip`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancel_reason: cancelOrderNote || "إيقاف التنفيذ من مشرف النقليات" }),
    });
    setCancellingOrderId(null);
    setCancelOrderNote("");
    load();
  };

  const rejectOrder = async (id: number) => {
    await fetch(`/api/workflow/orders/${id}/supervisor-reject`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancel_reason: rejectOrderNote || "رفض مشرف النقليات" }),
    });
    setRejectingOrderId(null);
    setRejectOrderNote("");
    load();
  };

  const rejectSupplyReq = async (id: number) => {
    await fetch(`/api/supply-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected", approved_by: user?.name || user?.phone, notes: rejectNote || null }),
    });
    setRejectingSupplyId(null);
    setRejectNote("");
    loadSupplyReqs();
  };

  const loadSupplyActiveTrips = () =>
    fetch("/api/supply-request-trips?active_only=1")
      .then(r => r.json())
      .then(d => setSupplyActiveTrips(Array.isArray(d) ? d : []))
      .catch(() => {});

  const loadBulkerOrders = () =>
    fetch("/api/loading-orders?status=pending")
      .then(r => r.ok ? r.json() : [])
      .then(d => setBulkerActiveOrders(Array.isArray(d) ? d : []))
      .catch(() => {});

  const assignSupplyRequest = async (id: number) => {
    if (!supplyAssignForm.vehicle_plate || !user) return;
    setSupplySubmitting(true);
    try {
      const res = await fetch(`/api/supply-requests/${id}/trips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_plate: supplyAssignForm.vehicle_plate,
          driver_name: supplyAssignForm.driver_name || null,
          driver_phone: supplyAssignForm.driver_phone || null,
          assigned_by: user.name || user.phone,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setSupplyAssignForm({ vehicle_plate: "", driver_name: "", driver_phone: "" });
      setSupplyAssignSuccess(true);
      setTimeout(() => {
        setSupplyAssignSuccess(false);
        if (data.assigned >= data.total) setSupplyAssignModal(null);
      }, 1800);
      loadSupplyReqs();
      load(); /* تحديث قائمة السيارات فوراً */
    } catch (err) { alert((err as Error).message); }
    finally { setSupplySubmitting(false); }
  };

  const swapVehicle = async () => {
    if (!swapModal || !swapForm.vehicle_plate) return;
    const v = vehicles.find(v => v.plate_number === swapForm.vehicle_plate);
    if (!v) return void alert("السيارة غير موجودة في القائمة");
    setSwapSubmitting(true);
    try {
      const res = await fetch(`/api/workflow/orders/${swapModal.id}/swap-vehicle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: v.id,
          driver_phone: swapForm.driver_phone || null,
          driver_name_override: swapForm.driver_name || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSwapModal(null);
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setSwapSubmitting(false); }
  };

  const loadVehicleStops = () => {
    setStopsLoading(true);
    fetch("/api/supervisor/vehicle-stops")
      .then(r => r.json())
      .then(d => setVehicleStops(Array.isArray(d) ? d : []))
      .finally(() => setStopsLoading(false));
  };

  // ── Fleet Management functions ─────────────────────────────────────────────
  const loadFmVehicles = () => {
    setFmLoading(true);
    fetch("/api/fleet-vehicles/manage-full").then(r => r.json())
      .then(d => { setFmVehicles(Array.isArray(d) ? d : []); setFmLoading(false); })
      .catch(() => setFmLoading(false));
  };

  const fmExportFleet = () => {
    const STATUS_LABELS: Record<string, string> = {
      available: "متاح", on_trip: "في رحلة", busy: "في رحلة",
      maintenance: "في الصيانة", inactive: "متوقف",
    };
    const rows = fmVehicles.map(v => {
      const allTypes = v.types && v.types.length > 0
        ? v.types.map(t => (t.is_primary ? `★${t.type_name}` : t.type_name)).join(" / ")
        : v.vehicle_type || "";
      return {
        "رقم اللوحة":             v.plate_number,
        "اسم المركبة":            v.vehicle_name   || "",
        "أنواع المركبة":          allTypes,
        "الجهة":                  v.entity         || "",
        "الحالة":                 STATUS_LABELS[v.status || "available"] || v.status || "",
        "السائق المرتبط":         v.driver_name    || "",
        "وزن السيارة الفارغ كجم": v.empty_weight_kg ?? "",
        "الحمولة القصوى كجم":     v.max_weight_kg  ?? "",
        "ملاحظات":                v.notes          || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الأسطول");
    XLSX.writeFile(wb, `الأسطول_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const fmExportDocs = async () => {
    const DOC_LABELS: Record<string, string> = {
      insurance: "التأمين", inspection: "الفحص الدوري", operation_card: "كرت التشغيل",
    };
    const allDocs = await fetch("/api/vehicle-compliance/all").then(r => r.json()).catch(() => []);
    const rows = (allDocs as Record<string,unknown>[]).map(d => ({
      "رقم اللوحة":    d.car_number,
      "نوع الوثيقة":   DOC_LABELS[d.doc_type as string] || d.doc_type,
      "تاريخ البداية": d.start_date || "",
      "تاريخ الانتهاء":d.end_date   || "",
      "ملاحظات":       d.notes      || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الوثائق");
    XLSX.writeFile(wb, `وثائق_الأسطول_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const fmImportFleet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFmImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "array" });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
      if (!rows.length) { alert("الملف فارغ"); return; }
      const res = await fetch("/api/fleet-vehicles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "حدث خطأ"); return; }
      alert(data.message || "تم الاستيراد");
      loadFmVehicles();
    } catch { alert("فشل قراءة الملف"); }
    finally {
      setFmImporting(false);
      if (fmImportRef.current) fmImportRef.current.value = "";
    }
  };

  const loadFmNotifs = () => {
    if (!user) return;
    fetch(`/api/notifications?phone=${user.phone}`).then(r => r.json())
      .then((d: FleetNotif[]) => {
        const fleet = (Array.isArray(d) ? d : []).filter(n =>
          !n.read && (n.title?.includes("حمولة") || n.title?.includes("أسطول") || n.body?.includes("سيار"))
        );
        setFmNotifs(fleet);
      }).catch(() => {});
  };

  const fmMarkRead = (id: number) => {
    if (!user) return;
    fetch(`/api/notifications/${id}/read`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: user.phone }) }).catch(() => {});
    setFmNotifs(prev => prev.filter(n => n.id !== id));
  };

  const fmHandleNotifClick = (n: FleetNotif) => {
    const plate = n.title.replace(/.*—\s*/, "").trim();
    if (plate) setFmSearch(plate);
    fmMarkRead(n.id);
  };

  const fmUploadNewDoc = async () => {
    if (!fmSelected || !fmNewDoc.doc_type.trim()) return;
    setFmNewDoc(f => ({ ...f, uploading: true }));
    const fd = new FormData();
    fd.append("car_number", fmSelected.plate_number);
    fd.append("doc_type", fmNewDoc.doc_type.trim());
    if (fmNewDoc.file)       fd.append("image",      fmNewDoc.file);
    if (fmNewDoc.start_date) fd.append("start_date", fmNewDoc.start_date);
    if (fmNewDoc.end_date)   fd.append("end_date",   fmNewDoc.end_date);
    if (fmNewDoc.notes)      fd.append("notes",      fmNewDoc.notes);
    await fetch("/api/vehicle-compliance", { method: "POST", body: fd });
    setFmNewDoc({ ...EMPTY_DOC_FORM, doc_type: "" });
    if (fmNewDocFileRef.current) fmNewDocFileRef.current.value = "";
    const docs = await fetch(`/api/vehicle-compliance/${encodeURIComponent(fmSelected.plate_number)}`).then(r => r.json());
    setFmVehicleDocs(Array.isArray(docs) ? docs : []);
    setFmNewDoc(f => ({ ...f, uploading: false }));
  };

  const fmDeleteVehicle = async () => {
    if (!fmSelected) return;
    if (!confirm(`حذف السيارة "${fmSelected.plate_number}" نهائياً؟`)) return;
    await fetch(`/api/fleet-vehicles/${encodeURIComponent(fmSelected.plate_number)}`, { method: "DELETE" });
    setFmSelected(null);
    loadFmVehicles();
  };

  const fmAddVehicle = async () => {
    if (!fmAddForm.plate_number?.trim()) return;
    setFmAddSaving(true);
    try {
      const res = await fetch("/api/fleet-vehicles/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fmAddForm) });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "حدث خطأ"); return; }
      setFmAddOpen(false);
      setFmAddForm({ status: "available" });
      loadFmVehicles();
    } finally { setFmAddSaving(false); }
  };

  const fmOpenVehicle = (v: FleetVehicle) => {
    setFmSelected(v);
    setFmEditForm({
      vehicle_name:     v.vehicle_name     || "",
      new_plate_number: v.plate_number,
      vehicle_type:     v.vehicle_type     || "",
      entity:           v.entity           || "",
      status:           v.status           || "available",
      notes:            v.notes            || "",
      max_weight_kg:    String(v.max_weight_kg   || ""),
      empty_weight_kg:  String(v.empty_weight_kg || ""),
      driver_name:      v.driver_name      || "",
    });
    const assigned = (v.types || []).map(t => t.type_name);
    setFmEditTypes(assigned.length > 0 ? assigned : (v.vehicle_type ? [v.vehicle_type] : []));
    setFmEditPrimaryType((v.types || []).find(t => t.is_primary)?.type_name || v.vehicle_type || "");
    setFmDocForms({});
    setFmDetailTab("info");
    fetch(`/api/vehicle-compliance/${encodeURIComponent(v.plate_number)}`).then(r => r.json()).then(d => setFmVehicleDocs(Array.isArray(d) ? d : [])).catch(() => {});
  };

  const fmSaveVehicle = async () => {
    if (!fmSelected) return;
    setFmSaving(true);
    try {
      const res = await fetch(`/api/fleet-vehicles/${encodeURIComponent(fmSelected.plate_number)}/info`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fmEditForm) });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "حدث خطأ"); return; }
      const newPlate = data.new_plate || fmSelected.plate_number;
      const typesPayload = fmEditTypes.map(name => ({ type_name: name, is_primary: name === fmEditPrimaryType ? 1 : 0 }));
      await fetch(`/api/fleet-vehicles/${encodeURIComponent(newPlate)}/types`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ types: typesPayload }) });
      loadFmVehicles();
      setFmSelected(prev => prev ? { ...prev, plate_number: newPlate, vehicle_name: fmEditForm.vehicle_name, vehicle_type: fmEditPrimaryType || fmEditTypes[0] || fmEditForm.vehicle_type, status: fmEditForm.status, notes: fmEditForm.notes, types: typesPayload } : null);
    } finally { setFmSaving(false); }
  };

  const fmSetDocField = (docType: string, field: keyof DocFormState, val: unknown) => {
    setFmDocForms(f => ({ ...f, [docType]: { ...(f[docType] || { ...EMPTY_DOC_FORM }), [field]: val } }));
  };

  const fmUploadDoc = async (docType: string) => {
    if (!fmSelected) return;
    const form = fmDocForms[docType] || EMPTY_DOC_FORM;
    if (!form.file && !form.start_date && !form.end_date) return;
    fmSetDocField(docType, "uploading", true);
    try {
      const fd = new FormData();
      fd.append("car_number", fmSelected.plate_number);
      fd.append("doc_type", docType);
      if (form.file)       fd.append("image",      form.file);
      if (form.start_date) fd.append("start_date", form.start_date);
      if (form.end_date)   fd.append("end_date",   form.end_date);
      if (form.notes)      fd.append("notes",      form.notes);
      await fetch("/api/vehicle-compliance", { method: "POST", body: fd });
      const docs = await fetch(`/api/vehicle-compliance/${encodeURIComponent(fmSelected.plate_number)}`).then(r => r.json());
      setFmVehicleDocs(Array.isArray(docs) ? docs : []);
      setFmDocForms(f => ({ ...f, [docType]: { ...EMPTY_DOC_FORM } }));
      if (fmFileRefs.current[docType]) fmFileRefs.current[docType]!.value = "";
      loadFmVehicles();
    } finally { fmSetDocField(docType, "uploading", false); }
  };

  useEffect(() => {
    if (isFleetOnly) {
      setLoading(false);
      setTab("dashboard");
      return;
    }
    load(); loadTariffs(); loadRentals(); loadSettlements(); loadVehicleStats(); loadFleetSummary(); loadSupplyReqs(); loadSupplyActiveTrips(); loadBulkerOrders();
  }, []);

  useEffect(() => {
    if (tab !== "map") return;
    loadGpsLocations(trackRange, customFrom, customTo);
    if (trackRange === "custom") return;
    const id = setInterval(() => loadGpsLocations(trackRange, customFrom, customTo), 60_000);
    return () => clearInterval(id);
  }, [tab, trackRange, customFrom, customTo]);

  useEffect(() => {
    if (tab === "stops") loadVehicleStops();
  }, [tab]);

  useEffect(() => {
    if (tab === "my_trips") loadMyTrips();
  }, [tab]);

  useEffect(() => {
    if (tab === "fleet" && fmVehicles.length === 0 && !fmLoading) loadFmVehicles();
  }, [tab]);

  useEffect(() => {
    if (tab !== "new_routing") return;
    loadRoutingVehicles();
    const refresh = setInterval(loadRoutingVehicles, 30_000);
    if (fmVehicles.length === 0 && !fmLoading) loadFmVehicles();
    loadFmNotifs();
    loadRoutingLookup();
    if (vehicleTypes.length === 0) {
      fetch("/api/vehicle-type-defs").then(r => r.json())
        .then((d: VehicleTypeDef[]) => setVehicleTypes(Array.isArray(d) ? d.filter(t => t.is_active !== 0) : []))
        .catch(() => {});
    }
    if (fmDrivers.length === 0) {
      fetch("/api/drivers").then(r => r.json())
        .then((d: DriverProfile[]) => setFmDrivers(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
    return () => clearInterval(refresh);
  }, [tab]);

  const authHdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` });

  const toggleAutoAssign = async (val: boolean) => {
    setAutoAssign(val);
    await fetch("/api/supervisor-settings", {
      method: "PUT", headers: authHdr(),
      body: JSON.stringify({ auto_assign_enabled: val ? 1 : 0 }),
    });
  };

  const saveStoppedAlertMinutes = async (minutes: number) => {
    setStoppedAlertMinutes(minutes);
    await fetch("/api/supervisor-settings", {
      method: "PUT", headers: authHdr(),
      body: JSON.stringify({ stopped_alert_minutes: minutes }),
    });
  };

  const submitSettlement = async (deferred: boolean) => {
    if (!settlementModal || !user) return;
    const amount = parseFloat(settlementModal.amount);
    if (!amount || amount <= 0) { alert("أدخل مبلغاً صحيحاً"); return; }
    setSubmittingSettle(true);
    try {
      await fetch("/api/driver-settlements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_phone: settlementModal.driver.phone,
          driver_name: settlementModal.driver.driver_name,
          allocated_amount: amount,
          settlement_date: settlementModal.settlement_date,
          settled_by: user.name || user.phone,
          notes: settlementModal.notes || null,
          deferred,
          is_settlement_cash: settlementModal.is_cash ? 1 : 0,
        }),
      });
      setSettlementModal(null);
      loadSettlements();
    } finally { setSubmittingSettle(false); }
  };

  const deliverSettlement = async (id: number) => {
    if (!user) return;
    await fetch(`/api/driver-settlements/${id}/deliver`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivered_by: user.name || user.phone }),
    });
    loadSettlements();
  };

  const changeDriverPw = async () => {
    if (!driverPwModal || !user) return;
    const { vehicle, newPw } = driverPwModal;
    if (!newPw || newPw.length < 4) { alert("كلمة المرور قصيرة جداً (4 أحرف على الأقل)"); return; }
    const res = await fetch("/api/auth/change-password", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_plate: vehicle.plate_number, new_password: newPw, caller_role: user.role }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "حدث خطأ"); return; }
    alert(`✅ ${data.message}`);
    setDriverPwModal(null);
  };

  const assignRental = async () => {
    if (!rentalAssignModal) return;
    await fetch(`/api/external-rentals/${rentalAssignModal.id}/assign`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigned_vehicle_plate: rentalPlate,
        assigned_driver_name: rentalDriver,
        driver_phone: rentalDriverPhone || null,
        driver_bonus: parseFloat(rentalBonus) || 0,
      }),
    });
    setRentalAssignModal(null);
    setRentalPlate(""); setRentalDriver("");
    setRentalDriverPhone(""); setRentalBonus("");
    loadRentals();
  };

  const updateRentalStatus = async (id: number, status: string) => {
    await fetch(`/api/external-rentals/${id}/status`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadRentals();
  };

  const openRentalEdit = (r: ExternalRental) => {
    setRentalEditForm({
      vehicle_type:     r.vehicle_type    || "",
      start_date:       r.start_date || r.rental_date || "",
      duration_days:    r.duration_days   || 1,
      notes:            r.notes           || "",
      total_price:      r.total_price != null ? String(r.total_price) : "",
      pickup_location:  r.pickup_location || "",
      destination:      r.destination     || "",
    });
    setRentalEditModal(r);
  };

  const saveRentalEdit = async () => {
    if (!rentalEditModal) return;
    setSavingRentalEdit(true);
    try {
      await fetch(`/api/external-rentals/${rentalEditModal.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_type:    rentalEditForm.vehicle_type    || undefined,
          start_date:      rentalEditForm.start_date      || undefined,
          duration_days:   rentalEditForm.duration_days,
          notes:           rentalEditForm.notes,
          total_price:     rentalEditForm.total_price !== "" ? rentalEditForm.total_price : undefined,
          pickup_location: rentalEditForm.pickup_location || undefined,
          destination:     rentalEditForm.destination     || undefined,
        }),
      });
      setRentalEditModal(null);
      loadRentals();
    } finally { setSavingRentalEdit(false); }
  };

  const deleteRental = async (id: number) => {
    if (!confirm("حذف هذا الطلب نهائياً؟ لا يمكن التراجع.")) return;
    await fetch(`/api/external-rentals/${id}?hard=true`, { method: "DELETE" });
    loadRentals();
  };

  const printDeferredInvoice = (customerPhone: string) => {
    const customerRentals = rentals.filter(r => r.customer_phone === customerPhone && r.payment_method === "deferred");
    if (customerRentals.length === 0) return;
    const customer = customerRentals[0];
    const total = customerRentals.reduce((s, r) => s + (r.total_price || 0), 0);
    const rows = customerRentals.map(r => `
      <tr>
        <td>${r.start_date || r.rental_date || r.created_at?.slice(0,10) || "—"}</td>
        <td>${r.vehicle_type}</td>
        <td>${r.pickup_location || "—"} → ${r.destination || "—"}</td>
        <td>${r.duration_days} يوم</td>
        <td style="font-weight:bold">${(r.total_price || 0).toFixed(2)} ر.س</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
      <title>فاتورة مؤجلة — ${customer.customer_name || customerPhone}</title>
      <style>
        @page{size:A4 portrait;margin:15mm}html{width:210mm}body{width:210mm;margin:0 auto;padding:0}body{font-family:Arial,sans-serif;direction:rtl;color:#111;padding:0}@media screen{body{padding:20px}}
        h2{color:#103c68;margin-bottom:4px}
        .sub{color:#333;font-size:14px;font-weight:600;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#103c68;color:#fff;padding:8px 10px;text-align:right;font-weight:600}
        td{padding:8px 10px;border-bottom:1px solid #eee}
        tr:nth-child(even) td{background:#f7f8fb}
        .total-row{font-size:15px;font-weight:bold;margin-top:16px;text-align:left;color:#103c68}
        .print-btn{display:inline-block;margin-top:24px;padding:10px 24px;background:#103c68;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px}
        .wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.06;width:65%;pointer-events:none;z-index:-1}
        @media print{.print-btn{display:none}}
      </style></head><body>
      <img class="wm" src="/logo.png" alt="" />
      <div style="text-align:center;margin-bottom:16px">
        <img src="/jefer-logo-new.png" alt="JEFER" style="height:64px;object-fit:contain;display:block;margin:0 auto 4px"/>
        <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:#103c68;text-align:center;margin-bottom:6px">MKGH</div>
        <h2 style="color:#103c68;margin:0">فاتورة دفع مؤجل</h2>
      </div>
      <div class="sub">
        <strong>العميل:</strong> ${customer.customer_name || "—"} &nbsp;|&nbsp;
        <strong>هاتف:</strong> ${customerPhone} &nbsp;|&nbsp;
        <strong>تاريخ الإصدار:</strong> ${new Date().toLocaleDateString("ar-SA")}
      </div>
      <table>
        <thead><tr><th>التاريخ</th><th>نوع السيارة</th><th>المسار</th><th>المدة</th><th>المبلغ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total-row">الإجمالي: ${total.toFixed(2)} ر.س (${customerRentals.length} رحلة)</div>
      <button class="print-btn" onclick="window.print()">🖨 طباعة الفاتورة</button>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const setTariffPrice = async (id: number) => {
    const inp = tariffPriceInputs[id];
    if (!inp) return;
    await fetch(`/api/tariffs/${id}/set-price`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driver_expense: parseFloat(inp.driver_expense)||0, rental: parseFloat(inp.rental)||0, set_by: user?.name }),
    });
    setTariffPriceInputs(p => { const n = { ...p }; delete n[id]; return n; });
    loadTariffs();
    alert("تم إرسال السعر لقسم المالية للموافقة");
  };

  const toggleFusahatRoute = (tariffId: number) => {
    setFusahatRouteIds(prev => {
      const next = new Set<number>(prev);
      if (next.has(tariffId)) next.delete(tariffId); else next.add(tariffId);
      localStorage.setItem("fusahat_route_ids", JSON.stringify([...next]));
      return next;
    });
  };

  const toggleRouteVehicle = (plate: string) => {
    setSelectedRouteVehicles(prev => {
      const next = new Set<string>(prev);
      if (next.has(plate)) next.delete(plate); else next.add(plate);
      return next;
    });
  };

  const addRouteCustomer = async () => {
    const name = routeCustomerCustom.trim();
    if (!name) return;
    const r = await fetch("/api/trip-customers", {
      method: "POST", headers: authHdr(),
      body: JSON.stringify({ name, customer_type: routeCustomerType }),
    });
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || "تعذر إضافة العميل"); return; }
    const customer = await r.json() as { id:number; name:string; customer_type:"rental"|"company" };
    setRouteCustomers(prev => [...prev.filter(c => c.id !== customer.id), customer]);
    setRouteCustomerSel(customer.name);
    setRouteCustomerCustom("");
  };

  const saveRouteCargoType = async (old?: {id:number;name:string}) => {
    const name = old ? prompt("تعديل نوع الحمولة", old.name)?.trim() : routeCargoCustom.trim();
    if (!name) return;
    const r = await fetch(old ? `/api/routing-cargo-types/${old.id}` : "/api/routing-cargo-types", {
      method: old ? "PUT" : "POST", headers: authHdr(),
      body: JSON.stringify({ name }),
    });
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || "تعذر حفظ نوع الحمولة"); return; }
    const saved = await r.json() as { id:number;name:string };
    setRouteCargoTypes(prev => [...prev.filter(c => c.id !== saved.id), saved].sort((a,b) => a.name.localeCompare(b.name, "ar")));
    setRouteCargoSel(saved.name);
    setRouteCargoCustom("");
  };

  const addRouteCargoItem = () => {
    const cargoType = routeCargoSel.trim();
    const quantity = Number(routeCargoQty);
    if (!cargoType || cargoType === "__custom__") {
      setRouteSentMsg("اختر نوع الحمولة أولاً");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setRouteSentMsg("أدخل كمية صحيحة لنوع الحمولة");
      return;
    }
    if (routeCargoItems.some(item => item.cargo_type.toLocaleLowerCase() === cargoType.toLocaleLowerCase())) {
      setRouteSentMsg("نوع الحمولة مضاف بالفعل");
      return;
    }
    setRouteCargoItems(prev => [...prev, { cargo_type: cargoType, quantity }]);
    setRouteCargoSel("");
    setRouteCargoQty("");
    setRouteSentMsg(null);
  };

  const deleteRouteCargoType = async (cargo: {id:number;name:string}) => {
    if (!confirm(`حذف "${cargo.name}" من قائمة الاختيارات؟ لن تُمس الرحلات السابقة.`)) return;
    const r = await fetch(`/api/routing-cargo-types/${cargo.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` },
    });
    if (!r.ok) { alert("تعذر حذف نوع الحمولة"); return; }
    setRouteCargoTypes(prev => prev.filter(c => c.id !== cargo.id));
    setRouteCargoSel("");
  };

  const sendRouting = async (routeType: "via_fusahat" | "direct") => {
    if (!selectedRouteTariff || selectedRouteVehicles.size === 0) return;
    const loadingLocation = routeLoadingLocationSel === "__custom__"
      ? routeLoadingLocationCustom
      : selectedRouteTariff.locations?.find(location => location.kind === "loading" && String(location.id) === routeLoadingLocationSel) || { name: "", url: "" };
    const unloadingLocation = routeUnloadingLocationSel === "__custom__"
      ? routeUnloadingLocationCustom
      : selectedRouteTariff.locations?.find(location => location.kind === "unloading" && String(location.id) === routeUnloadingLocationSel) || { name: "", url: "" };
    for (const [location, label] of [[loadingLocation, "موقع التحميل"], [unloadingLocation, "موقع التنزيل"]] as const) {
      if (!!location.name.trim() !== !!location.url.trim()) {
        setRouteSentMsg(`أدخل اسم ${label} والرابط معاً، أو اتركهما فارغين`); return;
      }
      if (location.url.trim()) {
        try {
          const parsed = new URL(location.url.trim());
          if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
        } catch {
          setRouteSentMsg(`رابط ${label} يجب أن يكون رابط HTTP أو HTTPS صالحاً`); return;
        }
      }
    }
    if (routeCustomerSel === "__custom__") {
      setRouteSentMsg("أضف العميل الجديد أولاً، ثم أرسل التوجيه"); return;
    }
    if (routeCargoSel === "__custom__") {
      setRouteSentMsg("أضف نوع الحمولة الجديد أولاً، ثم أرسل التوجيه"); return;
    }
    if (routeCargoSel && !routeCargoItems.some(item => item.cargo_type === routeCargoSel)) {
      setRouteSentMsg("أضف نوع الحمولة والكمية إلى قائمة الرحلة أولاً"); return;
    }
    if (routeCargoItems.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      setRouteSentMsg("تحقق من كميات أنواع الحمولة"); return;
    }
    if (routePermitFiles.length > 20 || routePermitFiles.some(file =>
      !["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type) || file.size > 15 * 1024 * 1024
    )) {
      setRouteSentMsg("صورة الفسح يجب أن تكون صورة أو PDF بحجم لا يتجاوز 15 ميجابايت"); return;
    }
    setRouteSending(true);
    setRouteSentMsg(null);
    const overrideUnloading = routeUnloadingSel === "__custom__" ? routeUnloadingCustom.trim() : routeUnloadingSel.trim();
    const selectedCustomer = routeCustomers.find(c => c.name === routeCustomerSel);
    const selectedRep = routeReps.find(r => r.phone === routeRepSel);
    const form = new FormData();
    const fields: Record<string, string> = {
      tariff_id: String(selectedRouteTariff.id),
      loading_place: selectedRouteTariff.loading_place,
      unloading_place: selectedRouteTariff.unloading_place,
      driver_expense: String(selectedRouteTariff.driver_expense),
      rental: String(selectedRouteTariff.rental),
      vehicle_plates: JSON.stringify([...selectedRouteVehicles]),
      route_type: routeType,
      created_by: user?.phone || "",
      override_unloading_place: overrideUnloading,
      customer_name: routeCustomerSel,
      customer_type: routeCustomerType,
      rep_name: selectedRep?.name || (routeRepSel === "__custom__" ? routeRepCustom.trim() : ""),
      rep_phone: selectedRep?.phone || (routeRepSel === "__custom__" ? routeRepPhone.trim() : ""),
      cargo_type: routeCargoItems[0]?.cargo_type || "",
      cargo_items: JSON.stringify(routeCargoItems),
      loading_location_name: loadingLocation.name.trim(),
      loading_location_url: loadingLocation.url.trim(),
      unloading_location_name: unloadingLocation.name.trim(),
      unloading_location_url: unloadingLocation.url.trim(),
    };
    const fingerprint = JSON.stringify({
      fields,
      permit: routePermitFiles.map(file => ({ name: file.name, size: file.size, lastModified: file.lastModified })),
    });
    if (!routeRequestKeyRef.current || routeRequestKeyRef.current.fingerprint !== fingerprint) {
      routeRequestKeyRef.current = { fingerprint, key: crypto.randomUUID() };
    }
    form.append("client_request_id", routeRequestKeyRef.current.key);
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));
    try {
      const uploadedPermitFiles = await uploadFilesToObjectStorage(
        routePermitFiles,
        localStorage.getItem("mkgh_token") || undefined,
      );
      form.append("permit_images", JSON.stringify(uploadedPermitFiles));
      if (uploadedPermitFiles[0]) form.append("permit_image_url", uploadedPermitFiles[0].url);
      const r = await fetch("/api/routing-dispatches", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` },
        body: form,
      });
      if (r.ok) {
        routeRequestKeyRef.current = null;
        setRouteSentMsg(routeType === "via_fusahat" ? "✅ تم الإرسال إلى مشرف الفسوحات" : "✅ تم الإرسال مباشرة للسيارات");
        setSelectedRouteVehicles(new Set());
        loadRoutingVehicles();
        setRouteUnloadingSel(""); setRouteUnloadingCustom("");
        setRouteLoadingLocationSel("");
        setRouteUnloadingLocationSel("");
        setRouteLoadingLocationCustom({ name: "", url: "" });
        setRouteUnloadingLocationCustom({ name: "", url: "" });
        setRouteCustomerSel(""); setRouteCustomerCustom("");
        setRouteRepSel(""); setRouteRepCustom("");
        setRouteRepPhone(""); setRouteCargoSel(""); setRouteCargoCustom("");
        setRouteCargoQty(""); setRouteCargoItems([]); setRoutePermitFiles([]);
        setTimeout(() => setRouteSentMsg(null), 4000);
      } else {
        setRouteSentMsg((await r.json().catch(() => ({}))).error || "❌ حدث خطأ، حاول مرة أخرى");
      }
    } catch (error) { setRouteSentMsg(error instanceof Error ? error.message : "❌ خطأ في الاتصال"); }
    finally { setRouteSending(false); }
  };

  // Auto-select linked driver when vehicle changes
  const handleVehicleSelect = (vehicleId: string) => {
    setSelectedVehicle(vehicleId);
    if (!vehicleId) { setSelectedDriver(""); return; }
    const v = vehicles.find(x => String(x.id) === vehicleId);
    if (v?.linked_user_phone) {
      // Auto-fill with the linked account's phone
      setSelectedDriver(v.linked_user_phone);
    } else {
      setSelectedDriver("");
    }
  };

  const assignVehicle = async () => {
    if (!selectedOrder || !selectedVehicle || !user) return;
    setSubmitting(true);
    try {
      const vehicle = vehicles.find(v => String(v.id) === selectedVehicle);
      let driverName = vehicle?.linked_user_name || null;
      if (!driverName && selectedDriver) {
        const driverFromList = drivers.find(d => d.phone === selectedDriver);
        driverName = driverFromList?.name || vehicle?.driver_name || null;
      }

      // بلاكر assignment: use dedicated endpoint → goes straight to fsohat
      if (selectedOrder.stage === "bulker_assignment") {
        const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/assign-bulker`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vehicle_plate: vehicle?.plate_number || "",
            driver_name: driverName || vehicle?.driver_name || null,
            driver_phone: vehicle?.linked_user_phone || selectedDriver || null,
            assigned_by: user.name || user.phone,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      } else {
        const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/assign-vehicle`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supervisor_phone: user.phone,
            vehicle_id: parseInt(selectedVehicle),
            driver_phone: selectedDriver || null,
            driver_name_override: driverName,
            ...(selectedTariffId ? { tariff_id: selectedTariffId } : {}),
            ...(altDriverPhone ? { alt_driver_phone: altDriverPhone, alt_driver_name: altDriverName } : {}),
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }

      setSelectedOrder(null); setSelectedVehicle(""); setSelectedDriver(""); setSelectedTariffId(null);
      setAltDriverPhone(""); setAltDriverName("");
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const autoAssignOrder = async (orderId: number) => {
    if (!user) return;
    setAutoAssigning(orderId);
    try {
      const res = await fetch(`/api/supervisor/auto-assign/${orderId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisor_phone: user.phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setAutoAssigning(null); }
  };

  const submitCompanySend = async () => {
    if (!companySendModal || !user) return;
    const amount = parseFloat(companySendModal.amount);
    if (!amount || amount <= 0) { alert("أدخل مبلغاً صحيحاً"); return; }
    await fetch("/api/driver-company-sends", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driver_phone: companySendModal.driver.phone,
        driver_name: companySendModal.driver.driver_name,
        amount,
        note: companySendModal.note || null,
        sent_by: user.name || user.phone,
      }),
    });
    setCompanySendModal(null);
    loadSettlements();
  };

  const saveEquipment = async () => {
    if (!equipModal) return;
    await fetch(`/api/fleet-vehicles/${encodeURIComponent(equipModal.plate)}/equipment`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipment_type: equipModal.equipment_type,
        load_capacity_tons: parseFloat(equipModal.load_capacity_tons) || 0,
        vehicle_subtype: equipModal.vehicle_subtype || null,
      }),
    });
    setEquipModal(null);
    loadVehicleStats();
    load();
  };

  const reportBreak = async (vehicleId: number) => {
    const notes = prompt("وصف العطل:");
    if (!notes) return;
    await fetch(`/api/workflow/vehicles/${vehicleId}/break`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    load();
  };

  const saveGpsId = async (plate: string) => {
    await fetch(`/api/fleet-vehicles/${encodeURIComponent(plate)}/gps`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gps_device_id: gpsEditValue.trim() || null }),
    });
    setGpsEditPlate(null);
    setGpsEditValue("");
    setGpsLookupRes(null);
    load();
  };

  const lookupGpsId = async () => {
    if (!gpsEditValue.trim()) return;
    setGpsLooking(true); setGpsLookupRes(null);
    try {
      const r = await fetch(`/api/gps/lookup?q=${encodeURIComponent(gpsEditValue.trim())}`);
      const d = await r.json();
      setGpsLookupRes(d);
    } catch { setGpsLookupRes({ found: false }); }
    finally { setGpsLooking(false); }
  };

  const bulkerOrders   = useMemo(() => orders.filter(o => o.stage === "bulker_assignment"), [orders]);
  const pendingOrders  = useMemo(() => orders.filter(o => o.stage === "payment_confirmed"), [orders]);
  const activeOrders   = useMemo(() => orders.filter(o => ["vehicle_assigned", "invoiced", "loaded"].includes(o.stage)), [orders]);
  const activeOrdersWithLocation = useMemo(() => activeOrders.filter(o => o.delivery_lat != null && o.delivery_lng != null), [activeOrders]);
  const transportVehicles = useMemo(() => vehicles.filter(v => v.branch === "النقليات"), [vehicles]);
  const availableVehicles = useMemo(() => transportVehicles.filter(v => v.status === "available"), [transportVehicles]);
  const bulkerVehicles    = useMemo(() => transportVehicles.filter(v => v.vehicle_type === "بلكر"), [transportVehicles]);
  const availableBulkers  = useMemo(() => bulkerVehicles.filter(v => v.status === "available"), [bulkerVehicles]);

  const vehicleOrderMap = useMemo(() => {
    const m = new globalThis.Map<string, Order>();
    for (const o of orders) {
      if (o.vehicle_plate && ["vehicle_assigned","invoiced","loaded"].includes(o.stage)) {
        m.set(o.vehicle_plate, o);
      }
    }
    return m;
  }, [orders]);

  const vehicleSupplyTripMap = useMemo(() => {
    const m = new globalThis.Map<string, SupplyTrip>();
    for (const t of supplyActiveTrips) {
      if (t.vehicle_plate && !m.has(t.vehicle_plate)) {
        m.set(t.vehicle_plate, t);
      }
    }
    return m;
  }, [supplyActiveTrips]);

  const vehicleBulkerOrderMap = useMemo(() => {
    const m = new globalThis.Map<string, BulkerActiveOrder>();
    for (const o of bulkerActiveOrders) {
      if (o.vehicle_plate && !m.has(o.vehicle_plate)) {
        m.set(o.vehicle_plate, o);
      }
    }
    return m;
  }, [bulkerActiveOrders]);

  const SUPPLY_TRIP_STATUS: Record<string, { label: string; color: string }> = {
    assigned:                   { label: "بانتظار مسؤل الفسوحات",      color: "text-amber-700 bg-amber-50 border-amber-200"   },
    in_transit:                 { label: "في الطريق للمستودع 🚛",       color: "text-blue-700 bg-blue-50 border-blue-200"      },
    loaded:                     { label: "جارٍ التحميل 📦",              color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
    delivered_to_warehouse:     { label: "وصل المستودع 🏁",             color: "text-teal-700 bg-teal-50 border-teal-200"      },
    pending_warehouse_approval: { label: "بانتظار موافقة المستودع ⏳",   color: "text-purple-700 bg-purple-50 border-purple-200" },
  };

  const STAGE_NEXT_ACTION: Record<string, { label: string; color: string }> = {
    vehicle_assigned: { label: "بانتظار إصدار الفاتورة — المستودع",   color: "text-purple-700 bg-purple-50 border-purple-200" },
    invoiced:         { label: "بانتظار تأكيد التحميل — السائق",       color: "text-cyan-700 bg-cyan-50 border-cyan-200" },
    loaded:           { label: "في الطريق للتسليم — السائق",            color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  };

  const isBulkCementOrder = (o: Order) =>
    o.packaging_type === "سائب" ||
    (o.product_name || "").includes("سائب") ||
    (o.product_name || "").includes("بلكر");

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.toLowerCase();
    return vehicles.filter(v =>
      (!q || v.plate_number?.toLowerCase().includes(q) || v.vehicle_type?.toLowerCase().includes(q) || v.driver_name?.toLowerCase().includes(q)) &&
      (!fleetStatusFilter || v.status === fleetStatusFilter)
    );
  }, [vehicles, vehicleSearch, fleetStatusFilter]);

  const fmNaqaliyatBase = useMemo(() =>
    fmVehicles.filter(v => (v.branch || v.entity) === "النقليات"),
    [fmVehicles]
  );

  // حالة فعلية للسيارة: إذا كانت في أي من خرائط الطلبات النشطة → مشغول
  const fmEffectiveBusyPlates = useMemo(() => {
    const s = new Set<string>();
    for (const plate of vehicleOrderMap.keys())       s.add(plate);
    for (const plate of vehicleSupplyTripMap.keys())  s.add(plate);
    for (const plate of vehicleBulkerOrderMap.keys()) s.add(plate);
    return s;
  }, [vehicleOrderMap, vehicleSupplyTripMap, vehicleBulkerOrderMap]);

  const fmNaqaliyatVehicles = useMemo(() => {
    const q = vehicleSearch.toLowerCase();
    return fmNaqaliyatBase.filter(v => {
      const effSt = fmEffectiveBusyPlates.has(v.plate_number) ? "busy" : (v.status ?? "available");
      return (
        (!q || v.plate_number?.toLowerCase().includes(q) || v.vehicle_type?.toLowerCase().includes(q) || v.driver_name?.toLowerCase().includes(q)) &&
        (!fleetStatusFilter || effSt === fleetStatusFilter)
      );
    });
  }, [fmNaqaliyatBase, vehicleSearch, fleetStatusFilter, fmEffectiveBusyPlates]);

  type DriverPin = { order: Order; lat: number; lng: number; isGps: boolean; speed?: number; gpsUpdatedAt?: string };
  const driverPins = useMemo<DriverPin[]>(() => {
    const gpsById = new globalThis.Map<string, GpsLocation>(gpsLocations.map(g => [g.gps_device_id, g]));
    const vehicleByPlate = new globalThis.Map<string, Vehicle>(vehicles.map(v => [v.plate_number, v]));
    const pins: DriverPin[] = [];
    for (const o of activeOrdersWithLocation) {
      const vehicle = o.vehicle_plate ? vehicleByPlate.get(o.vehicle_plate) : undefined;
      const gpsLoc = vehicle?.gps_device_id ? gpsById.get(vehicle.gps_device_id) : undefined;
      if (gpsLoc) {
        pins.push({ order: o, lat: gpsLoc.lat, lng: gpsLoc.lng, isGps: true, speed: gpsLoc.speed, gpsUpdatedAt: gpsLoc.updated_at });
      } else if (o.driver_lat != null && o.driver_lng != null) {
        pins.push({ order: o, lat: o.driver_lat, lng: o.driver_lng, isGps: false });
      }
    }
    return pins;
  }, [gpsLocations, vehicles, activeOrdersWithLocation]);

  type GpsFleetPin = { lat: number; lng: number; speed: number; updated_at: string; gps_device_id: string; vehicle?: FleetVehicle };
  const gpsFleetPins = useMemo<GpsFleetPin[]>(() => {
    const vehicleByGpsId = new globalThis.Map<string, FleetVehicle>();
    for (const v of fmVehicles) {
      if (v.gps_device_id) vehicleByGpsId.set(v.gps_device_id, v);
    }
    const activePlates = new Set<string>(driverPins.map(p => p.order.vehicle_plate || "").filter(Boolean));
    const seenPlates = new Set<string>();
    const pins: GpsFleetPin[] = [];
    for (const loc of gpsLocations) {
      const vehicle = vehicleByGpsId.get(loc.gps_device_id);
      if (!vehicle) continue;
      if (activePlates.has(vehicle.plate_number)) continue;
      if (seenPlates.has(vehicle.plate_number)) continue;
      seenPlates.add(vehicle.plate_number);
      pins.push({ ...loc, vehicle });
    }
    return pins;
  }, [gpsLocations, driverPins, fmVehicles]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (activeOrdersWithLocation.length > 0) {
      return [
        activeOrdersWithLocation.reduce((s, o) => s + o.delivery_lat!, 0) / activeOrdersWithLocation.length,
        activeOrdersWithLocation.reduce((s, o) => s + o.delivery_lng!, 0) / activeOrdersWithLocation.length,
      ];
    }
    if (gpsFleetPins.length > 0) {
      return [
        gpsFleetPins.reduce((s, p) => s + p.lat, 0) / gpsFleetPins.length,
        gpsFleetPins.reduce((s, p) => s + p.lng, 0) / gpsFleetPins.length,
      ];
    }
    return [24.7, 46.7];
  }, [activeOrdersWithLocation, gpsFleetPins]);

  // Selected vehicle object for auto-link badge
  const selectedVehicleObj = useMemo(() => vehicles.find(v => String(v.id) === selectedVehicle), [vehicles, selectedVehicle]);
  const isDriverAutoLinked = selectedVehicleObj?.linked_user_phone && selectedDriver === selectedVehicleObj.linked_user_phone;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={22} className="animate-spin text-[#103c68]" />
    </div>
  );

  const StagePill = ({ stage }: { stage: string }) => {
    const map: Record<string, { label: string; cls: string }> = {
      payment_confirmed: { label: "مؤكد الدفع",   cls: "bg-green-50 text-green-700 border-green-200" },
      vehicle_assigned:  { label: "سيارة معيّنة",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
      invoiced:          { label: "تم الفوترة",    cls: "bg-purple-50 text-purple-700 border-purple-200" },
      loaded:            { label: "محمّل",         cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
    };
    const s = map[stage] ?? { label: stage, cls: "bg-gray-100 text-gray-500 border-gray-200" };
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>{s.label}</span>;
  };

  return (
    <div dir="rtl" className="supervisor-orders-page space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Truck size={24} className="text-[#103c68]" />مشرف النقليات
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {pendingOrders.length} طلب ينتظر تخصيص سيارة · {availableVehicles.length} سيارة متاحة
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => toggleAutoAssign(!autoAssign)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
              autoAssign
                ? "bg-green-50 text-green-700 border-green-300 shadow-sm"
                : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300"
            }`}>
            {autoAssign
              ? <><ToggleRight size={18} className="text-green-600" />التخصيص التلقائي: تشغيل</>
              : <><ToggleLeft size={18} className="text-gray-400" />التخصيص التلقائي: إيقاف</>}
          </button>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-orange-200 bg-orange-50 text-sm" title="إشعار توقف السيارة: مدة الانتظار قبل التنبيه">
            <ZapOff size={15} className="text-orange-500 shrink-0" />
            <span className="text-orange-700 font-medium whitespace-nowrap">تنبيه توقف بعد</span>
            <input
              type="number"
              min={5}
              max={240}
              step={5}
              value={stoppedAlertMinutes}
              onChange={e => setStoppedAlertMinutes(Number(e.target.value))}
              onBlur={e => saveStoppedAlertMinutes(Number(e.target.value))}
              className="w-14 text-center border border-orange-300 rounded-lg px-1 py-0.5 text-orange-800 font-bold bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <span className="text-orange-700 font-medium whitespace-nowrap">دقيقة</span>
          </div>
          <button onClick={() => { load(); loadSettlements(); loadVehicleStats(); }} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl text-sm transition-colors">
            <RefreshCw size={14} />تحديث
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl w-max min-w-full">
        {([
          { id: "dashboard", label: "الرئيسية",       icon: BarChart3 },
          { id: "pending",   label: "تحتاج تخصيص",  icon: Clock,      count: pendingOrders.length },
          { id: "active",    label: "في التنفيذ",     icon: Package,    count: activeOrders.length },
          { id: "fleet",     label: "الأسطول",        icon: Car,        count: vehicles.length },
          { id: "map",       label: "الخريطة",        icon: Map,        count: activeOrdersWithLocation.length },
          { id: "tariffs",   label: "تسعير المسارات", icon: DollarSign, count: pendingTariffs.length },
          { id: "rentals",   label: "تأجير خارجي",   icon: Key,        count: rentals.filter(r => r.status === "pending").length },
          { id: "performance", label: "الأداء",      icon: TrendingUp },
          { id: "settlements", label: "التصفية",     icon: Wallet,     count: settlementLedger.filter(d => d.balance > 0).length },
          { id: "stops",       label: "توقفات",      icon: OctagonX,   count: vehicleStops.filter(s => s.still_stopped).length },
          { id: "urgent",       label: "طلبات عاجلة",    icon: Bell,   count: supplyReqs.length + repReqUrgent.length },
          { id: "new_routing",  label: "توجيه جديد",     icon: Map },
          { id: "my_trips",     label: "رحلاتي",          icon: Truck },
        ] as const).map(t => {
          if (isFleetOnly) return null;
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0
                ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon size={14} />{t.label}
              {"count" in t && t.count !== undefined && t.count > 0 && (
                <span className={`text-xs font-black px-1.5 rounded-full ${t.id === "pending" ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-600"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>

      {/* ══ DASHBOARD ══ */}
      {tab === "dashboard" && (
        <div className="space-y-5">
          {supplyReqs.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Bell size={18} className="text-red-500 flex-shrink-0" />
                <div>
                  <div className="font-bold text-red-800">{supplyReqs.length} طلب توريد عاجل من المستودعات</div>
                  <div className="text-xs text-red-600 mt-0.5">تحتاج تعيين سيارة من مشرف النقليات</div>
                </div>
              </div>
              <button onClick={() => setTab("urgent")}
                className="flex-shrink-0 bg-red-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-red-600 flex items-center gap-1">
                معالجة <ArrowRight size={12} />
              </button>
            </div>
          )}
          {pendingOrders.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
                <div>
                  <div className="font-bold text-amber-800">{pendingOrders.length} طلب يحتاج تخصيص سيارة</div>
                  <div className="text-xs text-amber-600 mt-0.5">{availableVehicles.length} سيارة متاحة للتخصيص</div>
                </div>
              </div>
              <button onClick={() => setTab("pending")}
                className="flex-shrink-0 bg-amber-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-amber-600 flex items-center gap-1">
                تخصيص <ArrowRight size={12} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "بانتظار سيارة",  val: pendingOrders.length,                                                         color: "bg-amber-500",  icon: Clock },
              { label: "سيارات متاحة",   val: availableVehicles.length,                                                      color: "bg-green-500",  icon: Car },
              { label: "سيارات مشغولة",  val: vehicles.filter(v => v.status === "busy").length,                              color: "bg-blue-500",   icon: Truck },
              { label: "تحت الصيانة",   val: vehicles.filter(v => ["maintenance","broken"].includes(v.status)).length,      color: "bg-red-500",    icon: Wrench },
            ].map(({ label, val, color, icon: Icon }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-3">
                <div className={`${color} w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon size={20} className="text-white" />
                </div>
                <div>
                  <div className="text-2xl font-black text-gray-900">{val}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-800 flex items-center gap-2"><Car size={16} className="text-[#103c68]" />حالة السيارات</h2>
              <button onClick={() => setTab("fleet")} className="text-xs text-[#103c68] font-semibold hover:underline">عرض الكل</button>
            </div>
            <div className="grid grid-cols-4 px-5 py-2.5 bg-gray-50 text-xs font-bold text-gray-500">
              <span className="col-span-2">السيارة</span>
              <span className="text-center">الحالة</span>
              <span className="text-center">السائق</span>
            </div>
            {vehicles.slice(0, 6).map(v => {
              const dashOrder = v.status === "busy" ? vehicleOrderMap.get(v.plate_number) : undefined;
              const dashAction = dashOrder ? STAGE_NEXT_ACTION[dashOrder.stage] : undefined;
              return (
              <div key={v.id} className="border-t border-gray-50">
                <div className="grid grid-cols-4 px-5 py-3.5 items-center text-sm">
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${STATUS_DOT[v.status]}`} />
                      <span className="font-bold text-gray-800">{v.plate_number}</span>
                      {v.linked_user_id && (
                        <UserCheck size={11} className="text-green-500" aria-label="مرتبط بحساب" />
                      )}
                    </div>
                    <div className="text-xs text-gray-400 ps-4">{v.vehicle_type}</div>
                  </div>
                  <div className="text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLOR[v.status]}`}>
                      {STATUS_AR[v.status]}
                    </span>
                  </div>
                  <div className="text-center text-xs text-gray-500">
                    {v.linked_user_name || v.driver_name || "—"}
                  </div>
                </div>
                {dashOrder && (
                  <div className="mx-4 mb-2.5 rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-mono font-bold text-[#103c68]">{dashOrder.order_number}</span>
                      {dashAction && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold ${dashAction.color}`}>
                          <Clock size={9} />{dashAction.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-gray-700 flex-wrap">
                      <span><span className="text-gray-400">العميل: </span><span className="font-semibold">{dashOrder.customer_name}</span></span>
                      <span className="flex items-center gap-1"><MapPin size={9} className="text-gray-400" />{dashOrder.delivery_location}</span>
                      {dashOrder.rep_name && <span><span className="text-gray-400">المندوب: </span><span className="font-semibold text-indigo-700">{dashOrder.rep_name}</span></span>}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {activeOrders.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-800">الطلبات الجارية ({activeOrders.length})</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {activeOrders.slice(0, 5).map(o => (
                  <div key={o.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</div>
                      <div className="text-sm font-semibold text-gray-800 truncate">{o.customer_name}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1">
                        <Car size={10} />{o.vehicle_plate || "—"} · {o.driver_name || "—"}
                      </div>
                    </div>
                    <StagePill stage={o.stage} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ PENDING ORDERS ══ */}
      {tab === "pending" && (
        <div className="space-y-4">

          {/* ─── Bulker assignment orders (top priority) ─── */}
          {bulkerOrders.length > 0 && (
            <div className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                <Truck size={15} className="text-orange-600" />
                <h2 className="font-bold text-orange-900">طلبيات الأسمنت السائب — تحتاج تعيين بلاكر</h2>
                <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{bulkerOrders.length}</span>
                <span className="ms-auto text-xs text-orange-600 font-semibold">
                  بلاكر متاح: {availableBulkers.length} / {bulkerVehicles.length}
                </span>
              </div>
              <div className="divide-y divide-orange-50">
                {bulkerOrders.map(order => (
                  <div key={order.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="font-mono text-xs text-[#103c68] font-bold mb-0.5">{order.order_number}</div>
                        <div className="font-bold text-gray-900">🛢️ {order.product_name}</div>
                        <div className="text-sm text-gray-600">
                          {order.quantity > 0 && `${order.quantity.toLocaleString("ar-SA")} ${order.unit} · `}
                          {order.customer_name}
                        </div>
                        {order.delivery_location && (
                          <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <MapPin size={10} />{order.delivery_location}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-black text-xl text-gray-900">{order.total_with_vat?.toFixed(0)}</div>
                        <div className="text-xs text-gray-400">ر.س</div>
                      </div>
                    </div>
                    {/* Available bulker chips */}
                    {bulkerVehicles.length > 0 && (
                      <div className="mb-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                        <div className="text-xs font-bold text-orange-700 mb-2 flex items-center gap-1.5">
                          <Truck size={11} />سيارات البلكر
                          <span className="bg-orange-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{availableBulkers.length} متاح</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {bulkerVehicles.map(v => (
                            <button key={v.id}
                              onClick={() => { setSelectedOrder(order); handleVehicleSelect(String(v.id)); }}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                v.status === "available"
                                  ? "bg-white border-orange-300 text-orange-800 hover:bg-orange-100"
                                  : "bg-gray-50 border-gray-200 text-gray-400"
                              }`}>
                              <Truck size={10} />{v.plate_number}
                              <span className={`text-[10px] ${v.status === "available" ? "text-green-600" : "text-gray-400"}`}>
                                {v.status === "available" ? "متاح" : v.status === "busy" ? "مشغول" : "صيانة"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => { setSelectedOrder(order); setSelectedVehicle(""); setSelectedDriver(""); }}
                      className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
                      <Car size={14} />تعيين بلاكر يدوياً
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingOrders.length === 0 && bulkerOrders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <CheckCircle size={40} className="mx-auto mb-3 text-green-400 opacity-60" />
              <p className="font-semibold text-gray-600">لا توجد طلبات معلقة</p>
            </div>
          ) : pendingOrders.map(order => (
            <div key={order.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono text-xs text-[#103c68] font-bold">{order.order_number}</span>
                    {order.sla_status && order.sla_status.status !== "ok" && (
                      order.sla_status.status === "breached"
                        ? <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full" title={`تجاوز SLA: ${order.sla_status.elapsed_minutes} دق من ${order.sla_status.limit_minutes}`}>🚨 تجاوز SLA</span>
                        : <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-full" title={`تحذير SLA: ${order.sla_status.elapsed_minutes} دق من ${order.sla_status.limit_minutes}`}>⚠️ {order.sla_status.percent}% من الوقت</span>
                    )}
                  </div>
                  <div className="font-black text-gray-900 text-lg">{order.customer_name}</div>
                  <div className="text-sm text-gray-500">{order.product_name} × {order.quantity} {order.unit}</div>
                  {order.packaging_type && (
                    <div className="mt-1 inline-flex items-center gap-1 bg-[#103c68]/10 text-[#103c68] text-xs font-bold px-2 py-0.5 rounded-full">
                      <Layers size={10} />{order.packaging_type}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><MapPin size={11} />{order.delivery_location} · {order.destination_type}</div>
                </div>
                <div className="text-left flex-shrink-0">
                  <div className="font-black text-2xl text-gray-900">{order.total_with_vat?.toFixed(0)}</div>
                  <div className="text-xs text-gray-400">ر.س</div>
                </div>
              </div>
              {/* ── Bulker quick-select — shown only for loose-cement orders ── */}
              {isBulkCementOrder(order) && (
                <div className="mb-3 bg-teal-50 border border-teal-200 rounded-xl p-3">
                  <div className="text-xs font-bold text-teal-700 mb-2 flex items-center gap-1.5">
                    <Truck size={11} />سيارات البلكر المتاحة
                    <span className="bg-teal-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{availableBulkers.length}</span>
                  </div>
                  {availableBulkers.length === 0 ? (
                    <div className="text-xs text-teal-600 text-center py-1">لا توجد بلكر متاحة حالياً</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {availableBulkers.map(v => (
                        <button key={v.id}
                          onClick={() => { setSelectedOrder(order); handleVehicleSelect(String(v.id)); }}
                          className="flex items-center gap-1.5 bg-white border border-teal-300 text-teal-800 px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-teal-100 transition-colors">
                          <Truck size={10} />{v.plate_number}
                          {(v.linked_user_name || v.driver_name) && (
                            <span className="text-teal-500 font-normal">· {v.linked_user_name || v.driver_name}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setSelectedOrder(order); setSelectedVehicle(""); setSelectedDriver(""); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] hover:bg-[#0d3158] text-white py-3 rounded-xl font-bold text-sm transition-colors">
                  <Car size={15} />تخصيص يدوي
                </button>
                <button
                  onClick={() => autoAssignOrder(order.id)}
                  disabled={autoAssigning === order.id || availableVehicles.length === 0}
                  title={availableVehicles.length === 0 ? "لا توجد سيارات متاحة" : "تخصيص تلقائي ذكي"}
                  className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-40 flex items-center gap-1.5">
                  {autoAssigning === order.id
                    ? <RefreshCw size={14} className="animate-spin" />
                    : <><Target size={14} />تلقائي</>}
                </button>
                <button
                  onClick={() => { setRejectingOrderId(rejectingOrderId === order.id ? null : order.id); setRejectOrderNote(""); }}
                  className="px-4 py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold text-sm transition-colors flex items-center gap-1.5">
                  <X size={14} />رفض
                </button>
              </div>

              {/* Reject inline form */}
              {rejectingOrderId === order.id && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-red-700">سبب الرفض</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["لا توجد سيارات متاحة","الطلب مكرر","بيانات الطلب غير صحيحة","طلب العميل الإلغاء","تعارض مع طلب آخر"].map(r => (
                      <button key={r} type="button"
                        onClick={() => setRejectOrderNote(r)}
                        className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${rejectOrderNote === r ? "bg-red-600 text-white border-red-600" : "bg-white text-red-700 border-red-200 hover:bg-red-100"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={rejectOrderNote}
                    onChange={e => setRejectOrderNote(e.target.value)}
                    placeholder="أو اكتب سبباً آخر..."
                    className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-300 bg-white"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setRejectingOrderId(null); setRejectOrderNote(""); }}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                      إلغاء
                    </button>
                    <button
                      onClick={() => rejectOrder(order.id)}
                      className="px-4 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold">
                      تأكيد الرفض
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══ ACTIVE ORDERS ══ */}
      {tab === "active" && (
        <div className="space-y-3">
          {/* رحلات التوريد النشطة */}
          {supplyActiveTrips.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-teal-700">🏭 رحلات التوريد الجارية</span>
                <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold">{supplyActiveTrips.length}</span>
              </div>
              {supplyActiveTrips.map(t => {
                const st = SUPPLY_TRIP_STATUS[t.status];
                return (
                  <div key={t.id} className="bg-white rounded-2xl border border-teal-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono text-xs text-teal-700 font-bold">#{t.id}</span>
                          {st && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${st.color}`}>
                              {st.label}
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-gray-800">{t.product_name}</div>
                        <div className="text-xs text-gray-400">{t.requested_qty?.toLocaleString("ar-SA")} {t.unit}</div>
                      </div>
                    </div>
                    {(t.vehicle_plate || t.driver_name) && (
                      <div className="bg-teal-50 rounded-xl px-3 py-2 flex items-center gap-3 text-sm">
                        <Car size={14} className="text-teal-600" />
                        <span className="font-bold text-teal-800">{t.vehicle_plate}</span>
                        {t.driver_name && <span className="text-teal-600">· {t.driver_name}</span>}
                        {t.driver_phone && <span className="text-teal-500 text-xs">{t.driver_phone}</span>}
                      </div>
                    )}
                    {t.warehouse_name && (
                      <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                        <MapPin size={10} />{t.warehouse_name}
                      </div>
                    )}
                  </div>
                );
              })}
              {activeOrders.length > 0 && <div className="border-t border-gray-100 my-2" />}
            </div>
          )}
          {/* طلبات العملاء النشطة */}
          {activeOrders.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-[#103c68]">📦 طلبات العملاء الجارية</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{activeOrders.length}</span>
            </div>
          )}
          {activeOrders.length === 0 && supplyActiveTrips.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">لا توجد طلبات جارية</div>
          ) : activeOrders.map(o => (
            <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</span>
                    <StagePill stage={o.stage} />
                    {o.sla_status && o.sla_status.status !== "ok" && (
                      o.sla_status.status === "breached"
                        ? <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full" title={`تجاوز SLA: ${o.sla_status.elapsed_minutes} دق من ${o.sla_status.limit_minutes}`}>🚨 تجاوز SLA</span>
                        : <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-full" title={`تحذير SLA: ${o.sla_status.elapsed_minutes} دق من ${o.sla_status.limit_minutes}`}>⚠️ {o.sla_status.percent}% من الوقت</span>
                    )}
                  </div>
                  <div className="font-semibold text-gray-800">{o.customer_name}</div>
                  <div className="text-xs text-gray-400">{o.product_name} × {o.quantity} {o.unit}</div>
                </div>
                <div className="font-black text-gray-900">{o.total_with_vat?.toFixed(0)} ر.س</div>
              </div>
              {(o.vehicle_plate || o.driver_name) && (
                <div className="bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-3 text-sm">
                  <Car size={14} className="text-blue-600" />
                  <span className="font-bold text-blue-800">{o.vehicle_plate}</span>
                  {o.driver_name && <span className="text-blue-600">· {o.driver_name}</span>}
                  {o.driver_phone && <span className="text-blue-500 text-xs">{o.driver_phone}</span>}
                  {["vehicle_assigned","invoiced"].includes(o.stage) && (
                    <button
                      onClick={() => { setSwapModal(o); setSwapForm({ vehicle_plate: o.vehicle_plate||"", driver_name: o.driver_name||"", driver_phone: o.driver_phone||"" }); }}
                      className="mr-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border border-orange-200 text-orange-600 hover:bg-orange-50 transition-colors">
                      <RefreshCw size={10} />تبديل
                    </button>
                  )}
                </div>
              )}
              <div className="text-xs text-gray-400 mt-2 flex items-center gap-1"><MapPin size={10} />{o.delivery_location}</div>

              {/* Cancel trip button */}
              <div className="mt-3">
                <button
                  onClick={() => { setCancellingOrderId(cancellingOrderId === o.id ? null : o.id); setCancelOrderNote(""); }}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                  <X size={13} />إيقاف التنفيذ وإلغاء الرحلة
                </button>
              </div>

              {/* Cancel inline form */}
              {cancellingOrderId === o.id && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-red-700">سبب الإيقاف</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["عطل في السيارة","طلب العميل الإلغاء","تغيير في الطلب","حادث مروري","خطأ في التخصيص"].map(r => (
                      <button key={r} type="button"
                        onClick={() => setCancelOrderNote(r)}
                        className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${cancelOrderNote === r ? "bg-red-600 text-white border-red-600" : "bg-white text-red-700 border-red-200 hover:bg-red-100"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={cancelOrderNote}
                    onChange={e => setCancelOrderNote(e.target.value)}
                    placeholder="أو اكتب سبباً آخر..."
                    className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-300 bg-white"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setCancellingOrderId(null); setCancelOrderNote(""); }}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                      تراجع
                    </button>
                    <button
                      onClick={() => cancelTrip(o.id)}
                      className="px-4 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold">
                      تأكيد الإيقاف
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══ FLEET MANAGEMENT ══ */}
      {tab === "fleet" && (
        <div className="space-y-4">
          {fmLoading && fmNaqaliyatBase.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-[#103c68]/30 border-t-[#103c68] rounded-full animate-spin" />
              جارٍ تحميل الأسطول...
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["available","busy","maintenance","broken"] as const).map(s => {
              const count = fmNaqaliyatBase.filter(v =>
                (fmEffectiveBusyPlates.has(v.plate_number) ? "busy" : (v.status ?? "available")) === s
              ).length;
              const isActive = fleetStatusFilter === s;
              return (
                <button key={s} type="button"
                  onClick={() => setFleetStatusFilter(f => f === s ? "" : s)}
                  className={`rounded-2xl border p-4 text-center transition-all hover:opacity-90 ${STATUS_COLOR[s]} ${isActive ? "ring-2 ring-offset-1 ring-current shadow-md scale-[1.02]" : "opacity-80"}`}>
                  <div className="text-2xl font-black">{count}</div>
                  <div className="text-sm mt-0.5 font-semibold">{STATUS_AR[s]}</div>
                  {isActive && <div className="text-[10px] mt-1 font-bold opacity-70">✓ مفلتر</div>}
                </button>
              );
            })}
          </div>
          {fleetStatusFilter && (
            <button onClick={() => setFleetStatusFilter("")}
              className="text-xs text-gray-400 hover:text-gray-600 font-semibold flex items-center gap-1">
              <X size={12} />إلغاء الفلتر — عرض الكل ({fmNaqaliyatBase.length})
            </button>
          )}

          <div className="relative">
            <Search size={15} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={vehicleSearch} onChange={e => setVehicleSearch(e.target.value)}
              placeholder="بحث بلوحة، نوع، أو سائق..."
              className="w-full bg-white border border-gray-200 rounded-xl pe-10 ps-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 shadow-sm" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-12 px-5 py-3 bg-gray-50 text-xs font-bold text-gray-500">
              <span className="col-span-2">اللوحة</span>
              <span className="col-span-2">النوع</span>
              <span className="col-span-2 text-center">الحالة</span>
              <span className="col-span-2">السائق / الحساب</span>
              <span className="col-span-3">معرّف GPS</span>
              <span className="col-span-1 text-center">إجراء</span>
            </div>
            {fmNaqaliyatVehicles.length === 0 && !fmLoading && (
              <div className="py-8 text-center text-gray-400 text-sm">لا توجد سيارات مطابقة</div>
            )}
            {fmNaqaliyatVehicles.map(v => {
              // استخدم الخرائط لتحديد الحالة الفعلية — بغض النظر عن v.status في جدول manage-full
              const busyOrder       = vehicleOrderMap.get(v.plate_number);
              const supplyTrip      = !busyOrder ? vehicleSupplyTripMap.get(v.plate_number) : undefined;
              const bulkerOrder     = !busyOrder && !supplyTrip ? vehicleBulkerOrderMap.get(v.plate_number) : undefined;
              const effectiveStatus = busyOrder || supplyTrip || bulkerOrder ? "busy" : (v.status ?? "available");
              const nextAction      = busyOrder ? STAGE_NEXT_ACTION[busyOrder.stage] : undefined;
              const supplyStatus    = supplyTrip ? SUPPLY_TRIP_STATUS[supplyTrip.status] : undefined;
              return (
              <div key={v.id} className="border-t border-gray-50">
                <div className="grid grid-cols-12 px-5 py-3.5 items-center text-sm">
                <div className="col-span-2 flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[effectiveStatus]}`} />
                  <span className="font-bold text-gray-800">{v.plate_number}</span>
                </div>
                <div className="col-span-2 text-gray-500 text-xs">{v.vehicle_type}</div>
                <div className="col-span-2 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLOR[effectiveStatus]}`}>
                    {STATUS_AR[effectiveStatus]}
                  </span>
                </div>
                <div className="col-span-2 text-xs">
                  {v.linked_user_id ? (
                    <div>
                      <div className="flex items-center gap-1 text-green-700 font-semibold">
                        <UserCheck size={11} />{v.linked_user_name}
                      </div>
                      <div className="text-gray-400">{v.linked_user_phone}</div>
                    </div>
                  ) : (
                    <span className="text-gray-400">{v.driver_name || "—"}</span>
                  )}
                </div>
                <div className="col-span-3 text-xs">
                  {gpsEditPlate === v.plate_number ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={gpsEditValue}
                          onChange={e => { setGpsEditValue(e.target.value); setGpsLookupRes(null); }}
                          onKeyDown={e => { if (e.key === "Enter") saveGpsId(v.plate_number); if (e.key === "Escape") { setGpsEditPlate(null); setGpsEditValue(""); setGpsLookupRes(null); } }}
                          placeholder="Wialon ID أو IMEI"
                          className="flex-1 min-w-0 border border-[#103c68]/30 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#103c68]/40"
                        />
                        <button onClick={lookupGpsId} disabled={gpsLooking || !gpsEditValue.trim()}
                          title="بحث في Wialon"
                          className="px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 flex-shrink-0 disabled:opacity-50 text-xs font-bold leading-none whitespace-nowrap">
                          {gpsLooking ? "⏳" : "🔍 بحث"}
                        </button>
                        <button onClick={() => saveGpsId(v.plate_number)}
                          className="p-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 flex-shrink-0">
                          <Check size={12} />
                        </button>
                        <button onClick={() => { setGpsEditPlate(null); setGpsEditValue(""); setGpsLookupRes(null); }}
                          className="p-1 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200 flex-shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                      {gpsLookupRes && (
                        gpsLookupRes.found ? (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 text-xs space-y-0.5">
                            <span className="text-emerald-700 font-bold">✅ {gpsLookupRes.name}</span>
                            {gpsLookupRes.imei && <span className="text-gray-500 font-mono mr-1">· IMEI: {gpsLookupRes.imei}</span>}
                            {gpsLookupRes.wialon_id && gpsLookupRes.wialon_id !== gpsEditValue.trim() && (
                              <div>
                                <button onClick={() => { setGpsEditValue(gpsLookupRes.wialon_id!); setGpsLookupRes(null); }}
                                  className="text-blue-600 underline text-xs">
                                  استخدم ID: {gpsLookupRes.wialon_id}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-red-500">⚠️ غير موجود في Wialon</p>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {v.gps_device_id ? (
                        <span className="flex items-center gap-1 text-emerald-700 font-mono font-semibold bg-emerald-50 border border-emerald-200 rounded-lg px-1.5 py-0.5">
                          <span className="text-base leading-none">📡</span>{v.gps_device_id}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                      <button
                        onClick={() => { setGpsEditPlate(v.plate_number); setGpsEditValue(v.gps_device_id || ""); }}
                        className="p-1 rounded-lg text-gray-400 hover:text-[#103c68] hover:bg-blue-50 border border-transparent hover:border-blue-200 flex-shrink-0 transition-colors">
                        <Pencil size={11} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="col-span-1 flex flex-col items-center gap-1.5">
                  <button onClick={() => setDriverPwModal({ vehicle: v, newPw: "" })}
                    className="text-xs text-gray-500 hover:text-gray-700 hover:underline flex items-center gap-1">
                    <Link size={10} />باسورد
                  </button>
                  {effectiveStatus !== "broken" && (
                    <button onClick={() => reportBreak(v.id)}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline flex items-center gap-1">
                      <Wrench size={11} />عطل
                    </button>
                  )}
                </div>
                </div>{/* end grid row */}

                {/* ── Busy-vehicle: external order details ── */}
                {busyOrder && (
                  <div className="mx-5 mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-mono font-bold text-[#103c68]">{busyOrder.order_number}</span>
                      {nextAction && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold ${nextAction.color}`}>
                          <Clock size={10} />{nextAction.label}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
                      <div><span className="text-gray-400">العميل: </span><span className="font-semibold">{busyOrder.customer_name}</span></div>
                      <div><span className="text-gray-400">المنتج: </span><span className="font-semibold">{busyOrder.product_name} × {busyOrder.quantity} {busyOrder.unit}</span></div>
                      <div className="col-span-2 flex items-center gap-1">
                        <MapPin size={10} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-700">{busyOrder.delivery_location}</span>
                      </div>
                      {busyOrder.rep_name && (
                        <div><span className="text-gray-400">المندوب: </span><span className="font-semibold text-indigo-700">{busyOrder.rep_name}</span></div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Busy-vehicle: bulker loading order details ── */}
                {bulkerOrder && (
                  <div className="mx-5 mb-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold text-cyan-800 flex items-center gap-1">
                        ⛽ أمر تحميل بلكر — بانتظار تأكيد التنزيل
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold text-amber-700 bg-amber-50 border-amber-200">
                        <Clock size={10} />في الطريق
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
                      {bulkerOrder.cargo_type && (
                        <div><span className="text-gray-400">الشحنة: </span><span className="font-semibold">{bulkerOrder.cargo_type}</span></div>
                      )}
                      {bulkerOrder.unload_location && (
                        <div className="col-span-2 flex items-center gap-1">
                          <MapPin size={10} className="text-gray-400 flex-shrink-0" />
                          <span>موقع التنزيل: <strong>{bulkerOrder.unload_location}</strong></span>
                        </div>
                      )}
                      {bulkerOrder.permit_number && (
                        <div><span className="text-gray-400">رقم الفسح: </span><span className="font-mono font-semibold">{bulkerOrder.permit_number}</span></div>
                      )}
                      {bulkerOrder.driver_phone && (
                        <div>
                          <a href={`tel:${bulkerOrder.driver_phone}`} className="text-blue-600 font-semibold hover:underline">
                            📞 {bulkerOrder.driver_phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Busy-vehicle: supply trip details ── */}
                {supplyTrip && (
                  <div className="mx-5 mb-3 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold text-teal-800 flex items-center gap-1">
                        🏭 طلب توريد داخلي
                      </span>
                      {supplyStatus && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold ${supplyStatus.color}`}>
                          <Clock size={10} />{supplyStatus.label}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
                      <div><span className="text-gray-400">المنتج: </span><span className="font-semibold">{supplyTrip.product_name} × {supplyTrip.requested_qty?.toLocaleString("ar-SA")} {supplyTrip.unit}</span></div>
                      {supplyTrip.warehouse_name && (
                        <div><span className="text-gray-400">المستودع: </span><span className="font-semibold">{supplyTrip.warehouse_name}</span></div>
                      )}
                      {(supplyTrip.warehouse_location || supplyTrip.warehouse_lat) && (
                        <div className="col-span-2 flex items-center gap-1">
                          <MapPin size={10} className="text-gray-400 flex-shrink-0" />
                          {supplyTrip.warehouse_lat && supplyTrip.warehouse_lng ? (
                            <a
                              href={`https://maps.google.com/?q=${supplyTrip.warehouse_lat},${supplyTrip.warehouse_lng}`}
                              target="_blank" rel="noreferrer"
                              className="text-blue-600 underline font-semibold"
                            >
                              {supplyTrip.warehouse_location || supplyTrip.warehouse_name} 📍
                            </a>
                          ) : (
                            <span>{supplyTrip.warehouse_location}</span>
                          )}
                        </div>
                      )}
                      {supplyTrip.warehouse_manager_name && (
                        <div className="col-span-2">
                          <span className="text-gray-400">مسؤل المستودع: </span>
                          <span className="font-semibold">{supplyTrip.warehouse_manager_name}</span>
                          {supplyTrip.warehouse_manager_phone && (
                            <a href={`tel:${supplyTrip.warehouse_manager_phone}`}
                              className="text-blue-600 font-semibold mr-2 hover:underline">
                              📞 {supplyTrip.warehouse_manager_phone}
                            </a>
                          )}
                        </div>
                      )}
                      {supplyTrip.destination_division && (
                        <div><span className="text-gray-400">الجهة: </span><span className="font-semibold">{supplyTrip.destination_division}</span></div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* ══ MAP VIEW ══ */}
      {tab === "map" && (
        <div className="space-y-4">
          {/* ── Time-range control ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
              <Clock size={15} className="text-[#103c68]" />
              نطاق المسار:
            </span>
            {(["6h", "12h", "24h", "custom"] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setTrackRange(opt)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  trackRange === opt
                    ? "bg-[#103c68] text-white border-[#103c68] shadow"
                    : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {opt === "6h" ? "6 ساعات" : opt === "12h" ? "12 ساعة" : opt === "24h" ? "24 ساعة" : "مخصص"}
              </button>
            ))}
            {trackRange === "custom" && (
              <div className="flex flex-wrap items-center gap-2 mt-1 w-full">
                <label className="text-xs text-gray-500 font-medium">من:</label>
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-[#103c68]"
                />
                <label className="text-xs text-gray-500 font-medium">إلى:</label>
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-[#103c68]"
                />
                <button
                  onClick={() => loadGpsLocations("custom", customFrom, customTo)}
                  disabled={!customFrom || !customTo}
                  className="px-3 py-1 rounded-full text-xs font-bold bg-[#103c68] text-white disabled:opacity-40 hover:bg-[#0d2f50] transition-colors"
                >
                  تطبيق
                </button>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 items-center">
            {[
              { color: "#3b82f6", label: "موقع التسليم — سيارة معيّنة" },
              { color: "#a855f7", label: "موقع التسليم — تم الفوترة" },
              { color: "#06b6d4", label: "موقع التسليم — محمّل / في الطريق" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-gray-600">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white shadow" style={{ background: color }} />
                {label}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="text-base leading-none">🚛</span>
              موقع السيارة
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <div className="w-6 h-1.5 rounded-full" style={{ background: "#3b82f6" }} />
              {trackRange === "custom"
                ? "مسار الرحلة (مخصص)"
                : `مسار الرحلة (${trackRange === "6h" ? "6 ساعات" : trackRange === "12h" ? "12 ساعة" : "24 ساعة"})`}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <div className="w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: "#22c55e" }} />
              نقطة البداية
            </div>
            {gpsLocations.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <span>📡</span>GPS حقيقي نشط ({gpsLocations.length} وحدة)
              </div>
            )}
          </div>

          <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm relative" style={{ height: "520px" }}>
            {activeOrdersWithLocation.length === 0 && gpsFleetPins.length === 0 && (
              <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm gap-3 pointer-events-none">
                <Map size={40} className="text-gray-400" />
                <div className="text-center">
                  <p className="font-semibold text-gray-600">لا توجد بيانات على الخريطة</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {gpsLocations.length === 0
                      ? "تحقق من بيانات اعتماد GPS (Wialon) أو أضف إحداثيات للطلبات"
                      : "سيتم عرض الطلبات والسيارات هنا تلقائياً"}
                  </p>
                </div>
              </div>
            )}
            {true && (
              <MapContainer
                center={mapCenter}
                zoom={activeOrdersWithLocation.length > 0 || gpsFleetPins.length > 0 ? 10 : 6}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <FitBounds orders={activeOrdersWithLocation} />
                {activeOrdersWithLocation.map(o => {
                  const color = STAGE_ICON_COLOR[o.stage] ?? "#64748b";
                  return (
                    <Marker
                      key={`dest-${o.id}`}
                      position={[o.delivery_lat!, o.delivery_lng!]}
                      icon={makeIcon(color)}
                    >
                      <Popup>
                        <div dir="rtl" className="text-sm min-w-[180px]">
                          <div className="font-bold text-[#103c68] mb-1">{o.order_number}</div>
                          <div className="font-semibold text-gray-800">{o.customer_name}</div>
                          <div className="text-gray-500 text-xs mt-0.5">{o.product_name} × {o.quantity} {o.unit}</div>
                          <div className="text-gray-500 text-xs mt-0.5 flex items-center gap-1">
                            <span>📍</span>موقع التسليم: {o.delivery_location}
                          </div>
                          {o.vehicle_plate && (
                            <div className="text-gray-500 text-xs mt-0.5 flex items-center gap-1">
                              <span>🚛</span>{o.vehicle_plate} {o.driver_name ? `· ${o.driver_name}` : ""}
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
                {driverPins.map(pin => (
                  <Marker
                    key={`driver-${pin.order.id}`}
                    position={[pin.lat, pin.lng]}
                    icon={makeDriverIcon()}
                  >
                    <Popup>
                      <div dir="rtl" className="text-sm min-w-[180px]">
                        <div className={`font-bold mb-1 ${pin.isGps ? "text-emerald-600" : "text-orange-600"}`}>
                          {pin.isGps ? "📡 GPS حقيقي" : "🚛 موقع يدوي"}
                        </div>
                        <div className="font-semibold text-gray-800">{pin.order.driver_name || pin.order.driver_phone}</div>
                        <div className="font-mono text-xs text-[#103c68] mt-0.5">{pin.order.order_number}</div>
                        {pin.order.vehicle_plate && (
                          <div className="text-gray-500 text-xs mt-0.5">🚛 {pin.order.vehicle_plate}</div>
                        )}
                        {pin.isGps && pin.speed !== undefined && (
                          <div className="text-gray-500 text-xs mt-0.5">السرعة: {pin.speed} كم/س</div>
                        )}
                        {pin.isGps && pin.gpsUpdatedAt && (
                          <div className="text-gray-400 text-xs mt-1">
                            📡 آخر تحديث GPS: {new Date(pin.gpsUpdatedAt).toLocaleTimeString("ar-SA")}
                          </div>
                        )}
                        {!pin.isGps && pin.order.driver_location_updated_at && (
                          <div className="text-gray-400 text-xs mt-1">
                            آخر تحديث: {new Date(pin.order.driver_location_updated_at + "Z").toLocaleTimeString("ar-SA")}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
                {/* ── Vehicle route tracks (last 24 h) ── */}
                {driverPins.filter(p => p.isGps).map(pin => {
                  const vehicle = vehicles.find(v => v.plate_number === pin.order.vehicle_plate);
                  const devId = vehicle?.gps_device_id;
                  const pts = devId ? vehicleTracks[devId] : undefined;
                  if (!pts || pts.length < 2) return null;
                  const sorted = [...pts].sort((a, b) => a.t - b.t);
                  const positions = sorted.map(p => [p.lat, p.lng] as [number, number]);
                  const first = sorted[0];
                  return (
                    <React.Fragment key={`track-${pin.order.id}`}>
                      <Polyline
                        positions={positions}
                        pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.75, dashArray: undefined }}
                      />
                      <Marker position={[first.lat, first.lng]} icon={makeStartIcon()}>
                        <Popup>
                          <div dir="rtl" className="text-sm">
                            <div className="font-bold text-green-600 mb-1">🟢 نقطة بداية الرحلة</div>
                            <div className="text-gray-600 text-xs">
                              {new Date(first.t * 1000).toLocaleString("ar-SA")}
                            </div>
                            {pin.order.vehicle_plate && (
                              <div className="text-gray-500 text-xs mt-0.5">🚛 {pin.order.vehicle_plate}</div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    </React.Fragment>
                  );
                })}
                {/* ── GPS fleet vehicles (no active order) ── */}
                {gpsFleetPins.map(pin => (
                  <Marker
                    key={`fleet-gps-${pin.gps_device_id}`}
                    position={[pin.lat, pin.lng]}
                    icon={makeDriverIcon()}
                  >
                    <Popup>
                      <div dir="rtl" className="text-sm min-w-[180px]">
                        <div className="font-bold text-emerald-600 mb-1">📡 سيارة أسطول - GPS</div>
                        {pin.vehicle && (
                          <>
                            <div className="font-semibold text-gray-800">{pin.vehicle.plate_number}</div>
                            <div className="text-gray-500 text-xs mt-0.5">{pin.vehicle.vehicle_type}</div>
                            {pin.vehicle.driver_name && (
                              <div className="text-gray-500 text-xs mt-0.5">🧑‍✈️ {pin.vehicle.driver_name}</div>
                            )}
                          </>
                        )}
                        <div className="text-gray-500 text-xs mt-0.5">السرعة: {pin.speed} كم/س</div>
                        <div className="text-gray-400 text-xs mt-1">
                          📡 آخر تحديث: {new Date(pin.updated_at).toLocaleTimeString("ar-SA")}
                        </div>
                        <div className="text-gray-400 text-xs font-mono mt-0.5">ID: {pin.gps_device_id}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
                {/* ── GPS fleet vehicle route tracks ── */}
                {gpsFleetPins.map(pin => {
                  const pts = vehicleTracks[pin.gps_device_id];
                  if (!pts || pts.length < 2) return null;
                  const sorted = [...pts].sort((a, b) => a.t - b.t);
                  const positions = sorted.map(p => [p.lat, p.lng] as [number, number]);
                  const first = sorted[0];
                  return (
                    <React.Fragment key={`fleet-track-${pin.gps_device_id}`}>
                      <Polyline
                        positions={positions}
                        pathOptions={{ color: "#10b981", weight: 3, opacity: 0.65, dashArray: "6,4" }}
                      />
                      <Marker position={[first.lat, first.lng]} icon={makeStartIcon()}>
                        <Popup>
                          <div dir="rtl" className="text-sm">
                            <div className="font-bold text-green-600 mb-1">🟢 نقطة بداية الرحلة</div>
                            <div className="text-gray-600 text-xs">
                              {new Date(first.t * 1000).toLocaleString("ar-SA")}
                            </div>
                            {pin.vehicle && (
                              <div className="text-gray-500 text-xs mt-0.5">🚛 {pin.vehicle.plate_number}</div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    </React.Fragment>
                  );
                })}
              </MapContainer>
            )}
          </div>

          {/* Orders list below map */}
          {activeOrdersWithLocation.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50 text-sm font-bold text-gray-700">
                الطلبات المعروضة على الخريطة ({activeOrdersWithLocation.length})
              </div>
              <div className="divide-y divide-gray-50">
                {activeOrdersWithLocation.map(o => (
                  <div key={o.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full border-2 border-white shadow flex-shrink-0"
                        style={{ background: STAGE_ICON_COLOR[o.stage] ?? "#64748b" }} />
                      <div>
                        <div className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</div>
                        <div className="font-semibold text-gray-800">{o.customer_name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StagePill stage={o.stage} />
                      {o.vehicle_plate && (
                        <span className="text-xs text-gray-500 flex items-center gap-1"><Car size={11} />{o.vehicle_plate}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ TARIFF PRICING TAB ══ */}
      {tab === "tariffs" && (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
            <DollarSign size={16} className="flex-shrink-0 mt-0.5" />
            <span>حدد بونص السائق وإيجار الرحلة لكل مسار معلق، ثم أرسله للمالية للموافقة النهائية قبل التفعيل.</span>
          </div>
          {pendingTariffs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
              <CheckCircle size={40} className="mx-auto text-green-400 mb-3" />
              <p className="font-semibold text-gray-600">لا توجد مسارات معلقة بانتظار التسعير</p>
            </div>
          ) : pendingTariffs.map(t => {
            const inp = tariffPriceInputs[t.id];
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2 font-bold text-gray-900 flex-wrap">
                  <MapPin size={15} className="text-blue-500 flex-shrink-0" />
                  {t.loading_place}
                  <ChevronLeft size={14} className="text-gray-400" />
                  <span className="text-green-700">{t.unloading_place}</span>
                  {t.proposed_by && <span className="text-xs font-normal text-gray-400 mr-1">— اقترحه: {t.proposed_by}</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">بونص السائق (ريال)</label>
                    <input type="number" min="0"
                      value={inp?.driver_expense ?? t.driver_expense}
                      onChange={e => setTariffPriceInputs(p => ({ ...p, [t.id]: { driver_expense: e.target.value, rental: p[t.id]?.rental ?? String(t.rental) } }))}
                      className="w-full border border-orange-200 bg-orange-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">إيجار الرحلة / الإيراد (ريال)</label>
                    <input type="number" min="0"
                      value={inp?.rental ?? t.rental}
                      onChange={e => setTariffPriceInputs(p => ({ ...p, [t.id]: { driver_expense: p[t.id]?.driver_expense ?? String(t.driver_expense), rental: e.target.value } }))}
                      className="w-full border border-purple-200 bg-purple-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                      placeholder="0" />
                  </div>
                </div>
                <button onClick={() => setTariffPrice(t.id)} disabled={!inp}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d3158] transition-colors disabled:opacity-40">
                  <DollarSign size={14} />إرسال للمالية للموافقة
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ EXTERNAL RENTALS TAB ══ */}
      {tab === "rentals" && (
        <div className="space-y-4">
          {/* Filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {(["all","pending","approved","completed","cancelled","deferred"] as const).map(f => (
              <button key={f} onClick={() => setRentalFilter(f)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  rentalFilter === f
                    ? f === "deferred" ? "bg-purple-600 text-white border-purple-600" : "bg-[#103c68] text-white border-[#103c68]"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                }`}>
                { f === "all" ? "الكل" : f === "pending" ? "معلّق" : f === "approved" ? "موافق" : f === "completed" ? "مكتمل" : f === "deferred" ? "⏳ مؤجل" : "ملغي" }
                {f === "all"      && <span className="mr-1 text-gray-300 font-normal">({rentals.length})</span>}
                {f === "deferred" && <span className="mr-1 opacity-70 font-normal">({rentals.filter(r => r.payment_method === "deferred").length})</span>}
              </button>
            ))}
          </div>

          {/* ── Deferred view: grouped by customer with invoice button ── */}
          {rentalFilter === "deferred" ? (() => {
            const deferred = rentals.filter(r => r.payment_method === "deferred");
            if (deferred.length === 0) return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-14 text-center">
                <Clock size={36} className="mx-auto text-purple-200 mb-3" />
                <p className="font-semibold text-gray-500">لا توجد طلبات بدفع مؤجل</p>
              </div>
            );
            const grouped = deferred.reduce<Record<string, ExternalRental[]>>((acc, r) => {
              (acc[r.customer_phone] = acc[r.customer_phone] || []).push(r);
              return acc;
            }, {});
            return Object.entries(grouped).map(([phone, rows]) => {
              const total = rows.reduce((s, r) => s + (r.total_price || 0), 0);
              const cust  = rows[0];
              return (
                <div key={phone} className="bg-white rounded-2xl border border-purple-100 shadow-sm p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-gray-900 text-sm">{cust.customer_name}</div>
                      <div className="text-xs text-gray-400">{phone}</div>
                    </div>
                    <div className="text-left">
                      <div className="font-black text-purple-700 text-base leading-none">{total.toFixed(2)} ر.س</div>
                      <div className="text-xs text-gray-400 mt-0.5">{rows.length} رحلة</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {rows.map(r => (
                      <div key={r.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-xs">
                        <span className="text-gray-400 flex-shrink-0">{r.start_date || r.rental_date || r.created_at?.slice(0,10)}</span>
                        <span className="font-semibold text-gray-700 flex-shrink-0">{r.vehicle_type}</span>
                        {r.pickup_location && <span className="text-gray-500 truncate">{r.pickup_location}{r.destination ? ` ← ${r.destination}` : ""}</span>}
                        {(r.total_price || 0) > 0 && <span className="mr-auto font-bold text-gray-700 flex-shrink-0">{(r.total_price||0).toFixed(0)} ر.س</span>}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => printDeferredInvoice(phone)}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                    <Printer size={13} /> طباعة فاتورة نهاية الشهر
                  </button>
                </div>
              );
            });
          })() : (
            /* ── Normal status filter view ── */
            rentals.filter(r => rentalFilter === "all" || r.status === rentalFilter).length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-14 text-center">
                <Key size={36} className="mx-auto text-gray-300 mb-3" />
                <p className="font-semibold text-gray-500">لا توجد طلبات تأجير</p>
              </div>
            ) : rentals.filter(r => rentalFilter === "all" || r.status === rentalFilter).map(r => {
              const statusMap: Record<string, { label: string; cls: string }> = {
                pending:   { label: "معلّق",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
                approved:  { label: "موافق",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
                completed: { label: "مكتمل", cls: "bg-green-50 text-green-700 border-green-200" },
                cancelled: { label: "ملغي",  cls: "bg-red-50 text-red-700 border-red-200" },
              };
              const s = statusMap[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-500 border-gray-200" };
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-black text-gray-900 text-sm">{r.customer_name}</div>
                      <div className="text-xs text-gray-400">{r.customer_phone}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.payment_method === "deferred" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-purple-50 text-purple-700 border-purple-200">
                          <Clock size={10} />مؤجل
                        </span>
                      )}
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>{s.label}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
                      <Truck size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="font-semibold text-gray-700">{r.vehicle_type}</span>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
                      <CalendarDays size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="font-semibold text-gray-700">{r.rental_date} · {r.duration_days} يوم</span>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-1.5 col-span-2">
                      <MapPin size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600">{r.pickup_location} ← {r.destination}</span>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
                      <CreditCard size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600">
                        {r.payment_method === "card" ? "بطاقة" : r.payment_method === "cash" ? "💵 نقدي" : r.payment_method === "deferred" ? "⏳ مؤجل" : "تحويل"}
                      </span>
                    </div>
                    {(r.assigned_vehicle_plate || r.assigned_driver_name) && (
                      <div className="bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
                        <Car size={12} className="text-blue-400 flex-shrink-0" />
                        <span className="text-blue-700 font-semibold">{r.assigned_vehicle_plate} {r.assigned_driver_name ? `· ${r.assigned_driver_name}` : ""}</span>
                      </div>
                    )}
                    {r.driver_stage && (
                      <div className={`rounded-xl px-3 py-2 flex items-center gap-1.5 col-span-2 border ${
                        r.driver_stage === "delivered" ? "bg-green-50 border-green-200 text-green-700" :
                        r.driver_stage === "arrived"   ? "bg-amber-50 border-amber-200 text-amber-700" :
                                                         "bg-orange-50 border-orange-200 text-orange-700"
                      }`}>
                        <Activity size={12} className="flex-shrink-0" />
                        <span className="font-semibold text-xs">
                          {r.driver_stage === "loaded" ? "✅ تم التحميل" : r.driver_stage === "arrived" ? "📍 وصل للموقع" : r.driver_stage === "delivered" ? "🏁 تم التسليم" : r.driver_stage}
                        </span>
                        {r.driver_stage_at && <span className="text-xs opacity-60 mr-auto">{new Date(r.driver_stage_at).toLocaleString("ar-SA", { hour:"2-digit", minute:"2-digit", month:"short", day:"numeric" })}</span>}
                      </div>
                    )}
                  </div>
                  {r.notes && (
                    <div className="bg-amber-50 text-amber-700 rounded-xl px-3 py-2 text-xs">{r.notes}</div>
                  )}
                  {r.status === "pending" && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setRentalAssignModal(r); setRentalPlate(r.assigned_vehicle_plate || ""); setRentalDriver(r.assigned_driver_name || ""); setRentalDriverPhone(r.driver_phone || ""); setRentalBonus(r.driver_bonus ? String(r.driver_bonus) : ""); }}
                        className="flex-1 py-2.5 bg-[#103c68] hover:bg-[#0d2e50] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                        <Car size={13} />تعيين سيارة وسائق
                      </button>
                      <button onClick={() => updateRentalStatus(r.id, "cancelled")}
                        className="px-4 py-2.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors">
                        رفض
                      </button>
                    </div>
                  )}
                  {r.status === "approved" && (
                    <button onClick={() => updateRentalStatus(r.id, "completed")}
                      className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                      <CheckCircle size={13} />تأكيد الاستلام والإتمام
                    </button>
                  )}
                  {/* Edit + Delete — always visible */}
                  <div className="flex gap-2 pt-1 border-t border-gray-100">
                    <button onClick={() => openRentalEdit(r)}
                      className="flex-1 py-2 border border-amber-200 text-amber-600 hover:bg-amber-50 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                      <Pencil size={12} />تعديل
                    </button>
                    <button onClick={() => deleteRental(r.id)}
                      className="flex-1 py-2 border border-red-200 text-red-500 hover:bg-red-50 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                      <Trash2 size={12} />حذف
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ══ PERFORMANCE DASHBOARD ══ */}
      {tab === "performance" && (
        <div className="space-y-4">
          {/* ── Date range filter ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <label className="text-xs text-gray-500 font-semibold">من</label>
                <input
                  type="date"
                  value={perfFrom}
                  onChange={e => setPerfFrom(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30"
                />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <label className="text-xs text-gray-500 font-semibold">إلى</label>
                <input
                  type="date"
                  value={perfTo}
                  onChange={e => setPerfTo(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {/* Quick presets */}
                {[
                  { label: "هذا الشهر", get: () => { const n = new Date(); return { f: `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-01`, t: new Date(n.getFullYear(), n.getMonth()+1, 0).toISOString().slice(0,10) }; } },
                  { label: "الشهر الماضي", get: () => { const n = new Date(); const m = new Date(n.getFullYear(), n.getMonth()-1, 1); return { f: m.toISOString().slice(0,10), t: new Date(n.getFullYear(), n.getMonth(), 0).toISOString().slice(0,10) }; } },
                  { label: "آخر 3 أشهر", get: () => { const n = new Date(); const f = new Date(n); f.setMonth(f.getMonth()-3); return { f: f.toISOString().slice(0,10), t: n.toISOString().slice(0,10) }; } },
                  { label: "هذه السنة", get: () => { const y = new Date().getFullYear(); return { f: `${y}-01-01`, t: `${y}-12-31` }; } },
                ].map(({ label, get }) => (
                  <button
                    key={label}
                    onClick={() => { const { f, t } = get(); setPerfFrom(f); setPerfTo(t); loadVehicleStats(f, t); loadFleetSummary(f, t); }}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:border-[#103c68] hover:text-[#103c68] transition-colors"
                  >{label}</button>
                ))}
              </div>
              <div className="flex gap-2 mr-auto">
                {(perfFrom || perfTo) && (
                  <button
                    onClick={() => { setPerfFrom(""); setPerfTo(""); loadVehicleStats("", ""); loadFleetSummary("", ""); }}
                    className="px-3 py-2 rounded-xl border border-red-200 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                  >إعادة ضبط</button>
                )}
                <button
                  onClick={() => { loadVehicleStats(); loadFleetSummary(); }}
                  className="px-4 py-2 rounded-xl bg-[#103c68] text-white text-xs font-bold hover:bg-[#0d2f52] transition-colors"
                >تطبيق</button>
              </div>
            </div>
            {(perfFrom || perfTo) && (
              <div className="mt-2 text-xs text-[#103c68] font-semibold">
                الفترة: {perfFrom || "—"} → {perfTo || "—"}
              </div>
            )}
          </div>

          {/* Fleet KPI summary */}
          {fleetSummary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "إجمالي الإيرادات", val: fleetSummary.totalRevenue.toFixed(0) + " ر.س", color: "bg-green-500", icon: TrendingUp },
                { label: "رحلات مكتملة",     val: String(fleetSummary.totalTrips),                color: "bg-blue-500",  icon: Truck },
                { label: "إجمالي الأعطال",   val: String(fleetSummary.totalBreakdowns),           color: "bg-red-500",   icon: ZapOff },
                { label: "إجمالي المصاريف",  val: fleetSummary.totalExpenses.toFixed(0) + " ر.س", color: "bg-amber-500", icon: Banknote },
              ].map(({ label, val, color, icon: Icon }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                  <div className={`${color} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon size={18} className="text-white" />
                  </div>
                  <div>
                    <div className="font-black text-gray-900 text-lg leading-none">{val}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Monthly revenue chart (simple bar) */}
          {fleetSummary && fleetSummary.monthlyRevenue.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-bold text-gray-700 text-sm mb-4 flex items-center gap-2">
                <BarChart3 size={14} className="text-[#103c68]" />الإيرادات الشهرية (آخر 6 أشهر)
              </h3>
              <div className="flex items-end gap-2 h-28">
                {(() => {
                  const maxRev = Math.max(...fleetSummary.monthlyRevenue.map(m => m.revenue), 1);
                  return fleetSummary.monthlyRevenue.map(m => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs text-gray-500 font-bold">{m.revenue.toFixed(0)}</div>
                      <div
                        className="w-full rounded-t-lg bg-[#103c68] transition-all"
                        style={{ height: `${Math.max((m.revenue / maxRev) * 80, 4)}px` }}
                        title={`${m.month}: ${m.revenue.toFixed(0)} ر.س`}
                      />
                      <div className="text-xs text-gray-400 truncate w-full text-center">{m.month?.slice(5) ?? ""}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top breakdown causes */}
            {fleetSummary && fleetSummary.topCauses.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-700 text-sm mb-3 flex items-center gap-2">
                  <ZapOff size={14} className="text-red-500" />أكثر أسباب الأعطال تكراراً
                </h3>
                <div className="space-y-2">
                  {fleetSummary.topCauses.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                        <span className="text-gray-700 truncate">{c.notes}</span>
                      </div>
                      <span className="font-black text-red-600 flex-shrink-0">{c.c} مرة</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Workshop repeat offenders */}
            {fleetSummary && fleetSummary.workshopRepeat.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-700 text-sm mb-3 flex items-center gap-2">
                  <Wrench size={14} className="text-amber-500" />السيارات الأكثر دخولاً للورشة (90 يوم)
                </h3>
                <div className="space-y-2">
                  {fleetSummary.workshopRepeat.map((w, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                        <span className="font-mono font-bold text-gray-700">{w.vehicle_plate}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-amber-700">{w.visits} زيارة</span>
                        <span className="text-xs text-gray-400 mr-2">{w.cost.toFixed(0)} ر.س</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Customer revenue breakdown chart */}
          {fleetSummary && fleetSummary.customerRevenue && fleetSummary.customerRevenue.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-bold text-gray-700 text-sm mb-4 flex items-center gap-2">
                <TrendingUp size={14} className="text-green-600" />الإبرادات حسب العميل
              </h3>
              <div className="space-y-3">
                {(() => {
                  const maxRev = Math.max(...fleetSummary.customerRevenue.map(c => c.revenue), 1);
                  return fleetSummary.customerRevenue.map((c, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-[#103c68] text-white text-xs font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                          <span className="font-semibold text-gray-800 truncate">{c.customer_name}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500">
                          <span>{c.trips} رحلة</span>
                          <span className="font-black text-green-700">{c.revenue.toFixed(0)} ر.س</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-green-500 to-emerald-400 transition-all"
                          style={{ width: `${Math.max((c.revenue / maxRev) * 100, 2)}%` }}
                        />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Unattributed breakdown reports (no plate) */}
          {fleetSummary && fleetSummary.unattributedBreakdowns && fleetSummary.unattributedBreakdowns.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-5">
              <h3 className="font-bold text-gray-700 text-sm mb-3 flex items-center gap-2">
                <ZapOff size={14} className="text-red-500" />أعطال بدون سيارة محددة ({fleetSummary.unattributedBreakdowns.length})
                <span className="text-xs text-gray-400 font-normal">— يمكن تحديد السيارة يدوياً</span>
              </h3>
              <div className="space-y-2">
                {fleetSummary.unattributedBreakdowns.map(r => (
                  <div key={r.id} className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-red-700 flex-shrink-0">{r.breakdown_type}</span>
                        {r.driver_name && <span className="text-gray-500 truncate">· {r.driver_name}</span>}
                        {r.description && <span className="text-gray-400 truncate hidden sm:inline">· {r.description}</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-gray-400">{r.created_at ? r.created_at.slice(0, 10) : ""}</span>
                        <button
                          onClick={() => setBdPlateEdit({ id: r.id, plate: "" })}
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 transition-colors">
                          تحديد السيارة
                        </button>
                      </div>
                    </div>
                    {bdPlateEdit?.id === r.id && (
                      <div className="flex items-center gap-2 pt-1 border-t border-red-200">
                        <input
                          type="text"
                          value={bdPlateEdit.plate}
                          onChange={e => setBdPlateEdit(prev => prev ? { ...prev, plate: e.target.value } : null)}
                          placeholder="رقم لوحة السيارة..."
                          className="flex-1 border border-blue-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                          disabled={bdPlateSaving || !bdPlateEdit.plate.trim()}
                          onClick={async () => {
                            if (!bdPlateEdit.plate.trim()) return;
                            setBdPlateSaving(true);
                            try {
                              const res = await fetch(`/api/legacy-breakdowns/${r.id}/edit`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ vehicle_plate: bdPlateEdit.plate.trim() }),
                              });
                              if (!res.ok) throw new Error((await res.json()).error || "خطأ");
                              setBdPlateEdit(null);
                              loadFleetSummary();
                            } catch (e) { alert((e as Error).message); }
                            finally { setBdPlateSaving(false); }
                          }}
                          className="bg-blue-600 text-white px-2 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {bdPlateSaving ? "جاري..." : "حفظ"}
                        </button>
                        <button
                          onClick={() => setBdPlateEdit(null)}
                          className="text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg border border-gray-200 text-xs">
                          إلغاء
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-vehicle performance */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Car size={16} className="text-[#103c68]" />أداء كل مركبة
              </h2>
              <button onClick={() => { loadVehicleStats(); loadFleetSummary(); }} className="text-xs text-[#103c68] font-semibold hover:underline flex items-center gap-1">
                <RefreshCw size={12} />تحديث
              </button>
            </div>
            {vehicleStats.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Target size={36} className="mx-auto mb-3 opacity-40" />
                <p>لا توجد بيانات أداء بعد</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {vehicleStats.map(v => {
                  const totalAttr = Object.values(v.attribution).reduce((a, b) => a + b, 0);
                  const isOpen = perfVehicle === v.plate_number;
                  return (
                    <div key={v.plate_number} className={isOpen ? "bg-blue-50/40" : ""}>
                      <div
                        className="px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => setPerfVehicle(isOpen ? "" : v.plate_number)}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[v.status] || "bg-gray-400"}`} />
                            <div>
                              <div className="font-bold text-gray-900 flex items-center gap-2">
                                {v.plate_number}
                                {v.equipment_type && v.equipment_type !== "none" && (
                                  <span className="text-xs bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full font-semibold">{v.equipment_type}</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-400">{v.vehicle_type}{v.driver_name ? ` · ${v.driver_name}` : ""}{v.load_capacity_tons ? ` · ${v.load_capacity_tons}طن` : ""}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={e => { e.stopPropagation(); setEquipModal({ plate: v.plate_number, equipment_type: v.equipment_type || "none", load_capacity_tons: String(v.load_capacity_tons || ""), vehicle_subtype: "" }); }}
                              className="text-xs text-gray-400 hover:text-[#103c68] border border-gray-200 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors">
                              <Wrench size={10} />معدات
                            </button>
                            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: "الرحلات",    val: String(v.trips),                color: "text-blue-600" },
                            { label: "الإيراد",    val: v.revenue.toFixed(0) + " ر.س",  color: "text-green-600" },
                            { label: "المصاريف",   val: v.expenses.toFixed(0) + " ر.س", color: "text-amber-600" },
                            { label: "الأعطال",    val: String(v.breakdowns),            color: "text-red-600" },
                          ].map(m => (
                            <div key={m.label} className="text-center bg-white rounded-xl p-2 border border-gray-100">
                              <div className={`font-black text-sm ${m.color}`}>{m.val}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{m.label}</div>
                            </div>
                          ))}
                        </div>
                        {/* Utilization bar */}
                        {(() => {
                          const wd = v.workingDays || 26;
                          const worked   = Math.min(v.daysDelivered    || 0, wd);
                          const workshop = Math.min(v.daysWorkshopDays || 0, wd - worked);
                          const loaded   = Math.min(v.loadedNotDelivered || 0, wd - worked - workshop);
                          const idle     = Math.max(0, wd - worked - workshop - loaded);
                          const pWorked   = Math.round((worked   / wd) * 100);
                          const pWorkshop = Math.round((workshop / wd) * 100);
                          const pLoaded   = Math.round((loaded   / wd) * 100);
                          const pIdle     = Math.max(0, 100 - pWorked - pWorkshop - pLoaded);
                          return (
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center justify-between text-xs text-gray-500 mb-0.5">
                                <span className="font-semibold text-gray-700">الاستغلال من {wd} يوم عمل</span>
                                <span className="font-black text-green-700">{v.avgDailyRevenue ? v.avgDailyRevenue.toFixed(0) : "0"} ر.س/يوم</span>
                              </div>
                              <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                                {pWorked   > 0 && <div className="bg-green-500  transition-all" style={{ width: `${pWorked}%` }}   title={`شغّل: ${worked} يوم`} />}
                                {pWorkshop > 0 && <div className="bg-amber-400  transition-all" style={{ width: `${pWorkshop}%` }} title={`ورشة: ${workshop} يوم`} />}
                                {pLoaded   > 0 && <div className="bg-blue-400   transition-all" style={{ width: `${pLoaded}%` }}   title={`محملة: ${loaded}`} />}
                                {pIdle     > 0 && <div className="bg-gray-200   transition-all" style={{ width: `${pIdle}%` }}     title={`بدون توجيه: ${idle} يوم`} />}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{worked} يوم شغّل</span>
                                {workshop > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{workshop} ورشة</span>}
                                {loaded   > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />{loaded} محملة</span>}
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />{idle} بدون توجيه</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      {isOpen && (
                        <div className="px-5 pb-4 space-y-3">
                          {/* Workshop info */}
                          {v.workshopVisits > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs space-y-1">
                              <div className="font-bold text-amber-700 flex items-center gap-1.5"><Wrench size={11} />الورشة</div>
                              <div className="flex gap-4 text-amber-700">
                                <span>زيارات: <strong>{v.workshopVisits}</strong></span>
                                <span>تكلفة: <strong>{v.workshopCost.toFixed(0)} ر.س</strong></span>
                                {v.workshopRepeats > 2 && (
                                  <span className="text-red-600 font-bold">⚠ تكرار مرتفع (90 يوم)</span>
                                )}
                              </div>
                            </div>
                          )}
                          {/* Breakdown attribution */}
                          {v.breakdowns > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                                <ZapOff size={12} className="text-red-500" />إسناد الأعطال ({v.breakdowns} عطل)
                              </div>
                              {[
                                { key: "driver",   label: "بسبب السائق",     color: "bg-red-500" },
                                { key: "mechanic", label: "بسبب الميكانيكي", color: "bg-amber-500" },
                                { key: "vehicle",  label: "السيارة نفسها",    color: "bg-blue-500" },
                              ].map(attr => {
                                const count = v.attribution[attr.key] || 0;
                                const pct = totalAttr > 0 ? Math.round((count / totalAttr) * 100) : 0;
                                return (
                                  <div key={attr.key} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-gray-600">{attr.label}</span>
                                      <span className="font-bold text-gray-800">{count} ({pct}%)</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${attr.color} transition-all`} style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* Breakdown reports list */}
                          {v.reports && v.reports.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                                <ZapOff size={12} className="text-red-500" />سجل تقارير الأعطال
                              </div>
                              <div className="space-y-2">
                                {v.reports.map(r => (
                                  <div key={r.id} className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-red-700">{r.breakdown_type}</span>
                                      <span className="text-gray-400">{r.created_at ? r.created_at.slice(0,10) : ""}</span>
                                    </div>
                                    {r.description && <div className="text-gray-600">الوصف: {r.description}</div>}
                                    {r.driver_name && <div className="text-gray-500">السائق: {r.driver_name}</div>}
                                    {r.fault_attribution && (
                                      <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                                        r.fault_attribution === "driver" ? "bg-red-100 text-red-700" :
                                        r.fault_attribution === "mechanic" ? "bg-amber-100 text-amber-700" :
                                        "bg-blue-100 text-blue-700"
                                      }`}>
                                        {r.fault_attribution === "driver" ? "بسبب السائق" : r.fault_attribution === "mechanic" ? "بسبب الميكانيكي" : "السيارة نفسها"}
                                      </div>
                                    )}
                                    {r.operational_state && <div className="text-gray-500">الحالة التشغيلية: {r.operational_state}</div>}
                                    {r.action_taken && <div className="text-gray-500">الإجراء: {r.action_taken}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ VEHICLE STOPS ══ */}
      {tab === "stops" && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <OctagonX size={16} className="flex-shrink-0 mt-0.5" />
            <span>سجل جميع أحداث توقف السيارات المسجَّلة. تُحسب المدة من وقت اكتشاف التوقف حتى انتهاء الرحلة أو حتى الآن إذا كانت السيارة لا تزال متوقفة.</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <OctagonX size={16} className="text-red-500" />سجل توقفات الأسطول
                <span className="text-xs text-gray-400 font-normal">({vehicleStops.length} حادثة)</span>
              </h2>
              <button onClick={loadVehicleStops} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#103c68] border border-gray-200 rounded-lg px-2.5 py-1.5">
                <RefreshCw size={12} />تحديث
              </button>
            </div>

            {stopsLoading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw size={20} className="animate-spin text-[#103c68]" />
              </div>
            ) : vehicleStops.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <CheckCircle size={40} className="text-green-300" />
                <p className="text-sm font-medium">لا توجد أحداث توقف مسجَّلة</p>
                <p className="text-xs">ستظهر هنا عند اكتشاف أي سيارة متوقفة</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-right px-4 py-3 font-semibold">السيارة</th>
                      <th className="text-right px-4 py-3 font-semibold">رقم الطلب</th>
                      <th className="text-right px-4 py-3 font-semibold">السائق</th>
                      <th className="text-right px-4 py-3 font-semibold">وقت بداية التوقف</th>
                      <th className="text-right px-4 py-3 font-semibold">المدة</th>
                      <th className="text-right px-4 py-3 font-semibold">تنبيه أُرسل</th>
                      <th className="text-right px-4 py-3 font-semibold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {vehicleStops.map(stop => {
                      const hrs  = Math.floor(stop.duration_minutes / 60);
                      const mins = stop.duration_minutes % 60;
                      const durationLabel = hrs > 0 ? `${hrs} س ${mins} د` : `${mins} د`;
                      const stoppedDate = new Date(stop.vehicle_stopped_since);
                      const stoppedLabel = stoppedDate.toLocaleString("ar-SA", {
                        year: "numeric", month: "2-digit", day: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      });
                      const notifyLabel = stop.vehicle_stop_notified_at
                        ? new Date(stop.vehicle_stop_notified_at).toLocaleString("ar-SA", {
                            month: "2-digit", day: "2-digit",
                            hour: "2-digit", minute: "2-digit",
                          })
                        : null;
                      return (
                        <tr key={`${stop.id}-${stop.vehicle_stopped_since}`} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-[#103c68] bg-blue-50 px-2 py-0.5 rounded-lg text-xs">
                              {stop.vehicle_plate || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-gray-600">{stop.order_number}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs">
                              <div className="font-medium text-gray-800">{stop.driver_name || "—"}</div>
                              {stop.driver_phone && (
                                <div className="text-gray-400">{stop.driver_phone}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{stoppedLabel}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border ${
                              stop.duration_minutes >= 60
                                ? "bg-red-50 text-red-700 border-red-200"
                                : stop.duration_minutes >= 30
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-gray-50 text-gray-600 border-gray-200"
                            }`}>
                              <Clock size={10} />{durationLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {notifyLabel ? (
                              <span className="flex items-center gap-1 text-blue-600">
                                <Bell size={11} />{notifyLabel}
                              </span>
                            ) : (
                              <span className="text-gray-300">لم يُرسَل</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {stop.still_stopped ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                                لا يزال متوقفًا
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                                <CheckCircle size={10} />انتهى
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Summary cards */}
          {vehicleStops.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "إجمالي التوقفات", val: vehicleStops.length, color: "text-gray-700", bg: "bg-gray-50" },
                { label: "لا تزال متوقفة",  val: vehicleStops.filter(s => s.still_stopped).length,  color: "text-red-600",   bg: "bg-red-50" },
                { label: "انتهت",            val: vehicleStops.filter(s => !s.still_stopped).length, color: "text-green-600", bg: "bg-green-50" },
                { label: "تم إرسال تنبيه",  val: vehicleStops.filter(s => !!s.vehicle_stop_notified_at).length, color: "text-blue-600", bg: "bg-blue-50" },
              ].map(card => (
                <div key={card.label} className={`${card.bg} rounded-2xl border border-gray-100 shadow-sm p-4 text-center`}>
                  <div className={`text-2xl font-black ${card.color}`}>{card.val}</div>
                  <div className="text-xs text-gray-500 mt-1">{card.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ DRIVER SETTLEMENTS ══ */}
      {tab === "settlements" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
            <Wallet size={16} className="flex-shrink-0 mt-0.5" />
            <span>إدارة تصفية البونص والمستحقات. التصفية المؤجلة تسجّل المبلغ بدون أخذ فلوس ثم تسلّمها لاحقاً. "أرسل من الشركة" تسجّل مبلغاً دُفع مسبقاً ويُخصم من الرصيد.</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Banknote size={16} className="text-[#103c68]" />دفتر حسابات السائقين
              </h2>
              <button onClick={loadSettlements} className="text-xs text-[#103c68] font-semibold hover:underline flex items-center gap-1">
                <RefreshCw size={12} />تحديث
              </button>
            </div>
            {settlementLedger.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Wallet size={36} className="mx-auto mb-3 opacity-40" />
                <p>لا توجد سجلات حسابات</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {settlementLedger.map(d => {
                  const hasDeferredPending = d.deferred > 0;
                  return (
                    <div key={d.phone} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="font-bold text-gray-900 flex items-center gap-2">
                            {d.driver_name}
                            {d.vehicle_plate && (
                              <span className="text-xs text-gray-400 font-mono font-normal">{d.vehicle_plate}</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {d.trips} رحلة مكتملة
                            {d.tripsNoBonus > 0 && (
                              <span className="text-amber-500 mr-1">· {d.tripsNoBonus} بدون بونص</span>
                            )}
                          </div>
                        </div>
                        <div className={`text-right ${d.balance >= 0 ? "text-green-700" : "text-red-600"}`}>
                          <div className="font-black text-xl">{d.balance.toFixed(0)} ر.س</div>
                          <div className="text-xs opacity-70">الرصيد المستحق</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="bg-green-50 rounded-xl p-2.5 text-center">
                          <div className="font-bold text-green-700 text-sm">{d.earned.toFixed(0)}</div>
                          <div className="text-xs text-gray-400">البونص</div>
                        </div>
                        <div className="bg-red-50 rounded-xl p-2.5 text-center">
                          <div className="font-bold text-red-600 text-sm">{d.expenses.toFixed(0)}</div>
                          <div className="text-xs text-gray-400">المصاريف</div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                          <div className="font-bold text-gray-700 text-sm">{d.settled.toFixed(0)}</div>
                          <div className="text-xs text-gray-400">المُصفّى</div>
                        </div>
                        {d.companySent > 0 && (
                          <div className="bg-purple-50 rounded-xl p-2.5 text-center">
                            <div className="font-bold text-purple-700 text-sm">{d.companySent.toFixed(0)}</div>
                            <div className="text-xs text-gray-400">أرسل الشركة</div>
                          </div>
                        )}
                      </div>

                      {/* Last settlement info */}
                      {d.lastSettlement && (
                        <div className="text-xs text-gray-400 mb-1.5 flex items-center gap-1.5">
                          <Wallet size={11} />
                          آخر تصفية: <span className="font-semibold text-gray-600">{d.lastSettlement.settlement_date}</span>
                          · <span className="font-bold text-[#103c68]">{d.lastSettlement.allocated_amount.toFixed(0)} ر.س</span>
                          {d.lastSettlement.deferred === 1 && !d.lastSettlement.delivered_at
                            ? <span className="text-amber-600 font-semibold"> (مؤجل)</span>
                            : d.lastSettlement.deferred === 1 && d.lastSettlement.delivered_at
                            ? <span className="text-green-600 font-semibold"> (تم التسليم)</span>
                            : null}
                        </div>
                      )}

                      {/* Last company send info */}
                      {d.lastCompanySend && (
                        <div className="text-xs text-purple-600 mb-1.5 flex items-center gap-1.5">
                          <Banknote size={11} />
                          آخر إرسال شركة: <span className="font-bold">{d.lastCompanySend.amount.toFixed(0)} ر.س</span>
                          · <span className="text-gray-400">{d.lastCompanySend.created_at?.slice(0, 10)}</span>
                          {d.lastCompanySend.note && <span className="text-gray-400">· {d.lastCompanySend.note}</span>}
                        </div>
                      )}

                      {/* Deferred pending */}
                      {hasDeferredPending && (
                        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 text-amber-700">
                            <Wallet size={13} />
                            <span>مؤجل بانتظار التسليم: <strong>{d.deferred.toFixed(0)} ر.س</strong></span>
                          </div>
                          {d.lastSettlement && d.lastSettlement.deferred === 1 && !d.lastSettlement.delivered_at && (
                            <button
                              onClick={() => deliverSettlement((d.lastSettlement as { id?: number }).id ?? 0)}
                              className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors">
                              <Banknote size={11} />تسليم المبالغ
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {d.balance > 0 && (
                          <button
                            onClick={() => setSettlementModal({ driver: d, amount: String(Math.floor(d.balance)), settlement_date: new Date().toISOString().slice(0, 10), deferred: false, notes: "", is_cash: false })}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#103c68] hover:bg-[#0d2e50] text-white rounded-xl text-sm font-bold transition-colors">
                            <Wallet size={13} />تصفية البونص
                          </button>
                        )}
                        <button
                          onClick={() => setCompanySendModal({ driver: d, amount: "", note: "" })}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-purple-200 text-purple-700 hover:bg-purple-50 rounded-xl text-xs font-bold transition-colors">
                          <Banknote size={13} />أرسل من الشركة
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rental assign modal */}
      {rentalAssignModal && (
        <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-black text-lg text-gray-900">تعيين للتأجير الخارجي</h2>
                <p className="text-xs text-gray-400 mt-0.5">{rentalAssignModal.customer_name} · {rentalAssignModal.vehicle_type}</p>
              </div>
              <button onClick={() => setRentalAssignModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Rental summary */}
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1.5 border border-gray-200">
                <div className="flex items-center gap-1.5 mb-2 font-bold text-[#103c68]">
                  <MapPin size={13} />معلومات الإيجار
                </div>
                {rentalAssignModal.pickup_location && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">نقطة الانطلاق</span>
                    <span className="font-semibold text-gray-700 text-left">{rentalAssignModal.pickup_location}</span>
                  </div>
                )}
                {rentalAssignModal.destination && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">الوجهة</span>
                    <span className="font-semibold text-gray-700 text-left">{rentalAssignModal.destination}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">المدة</span>
                  <span className="font-semibold text-gray-700">{rentalAssignModal.duration_days} يوم</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">طريقة الدفع</span>
                  <span className={`font-bold ${rentalAssignModal.payment_method === "cash" ? "text-amber-600" : "text-[#103c68]"}`}>
                    {rentalAssignModal.payment_method === "cash" ? "💵 نقدي" : rentalAssignModal.payment_method === "card" ? "💳 بطاقة" : "🏦 تحويل"}
                  </span>
                </div>
                {rentalAssignModal.notes && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">ملاحظات</span>
                    <span className="text-gray-600 text-xs">{rentalAssignModal.notes}</span>
                  </div>
                )}
              </div>

              {/* Vehicle picker from fleet */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-2">اختر سيارة من الأسطول *</label>
                {availableVehicles.length === 0 && (
                  <div className="mb-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl px-3 py-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0" />لا توجد سيارات متاحة — يمكنك اختيار سيارة مشغولة أو إدخال اللوحة يدوياً
                  </div>
                )}
                {vehicles.length > 0 && (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {transportVehicles.map(v => {
                      const busyOrder = vehicleOrderMap.get(v.plate_number);
                      return (
                        <button key={v.id} type="button"
                          onClick={() => {
                            setRentalPlate(v.plate_number);
                            const dName = v.linked_user_name || v.driver_name || "";
                            const dPhone = v.linked_user_phone || v.driver_phone || "";
                            setRentalDriver(dName);
                            setRentalDriverPhone(dPhone);
                          }}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-all ${
                            rentalPlate === v.plate_number
                              ? "border-[#103c68] bg-[#103c68]/5"
                              : "border-gray-200 hover:border-gray-300"
                          }`}>
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${rentalPlate === v.plate_number ? "bg-[#103c68]" : "bg-gray-100"}`}>
                            <Car size={14} className={rentalPlate === v.plate_number ? "text-white" : "text-gray-500"} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5 flex-wrap">
                              {v.plate_number}
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[v.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                {STATUS_AR[v.status] || v.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 truncate">{v.vehicle_type}{v.linked_user_name ? ` · ${v.linked_user_name}` : v.driver_name ? ` · ${v.driver_name}` : ""}</div>
                            {busyOrder && (
                              <div className="text-[10px] text-blue-600 mt-0.5">
                                {busyOrder.order_number} — {busyOrder.stage === "vehicle_assigned" ? "بانتظار الفوترة" : busyOrder.stage === "invoiced" ? "بانتظار التحميل" : "في التسليم"}
                              </div>
                            )}
                          </div>
                          {rentalPlate === v.plate_number && <CheckCircle size={16} className="text-[#103c68] flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Manual override input */}
                <input type="text" value={rentalPlate} onChange={e => setRentalPlate(e.target.value)}
                  placeholder="أو أدخل اللوحة يدوياً"
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>

              {/* Driver */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">السائق</label>
                <select value={rentalDriverPhone}
                  onChange={e => {
                    const d = drivers.find(d => d.phone === e.target.value);
                    setRentalDriverPhone(e.target.value);
                    setRentalDriver(d?.name || "");
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50">
                  <option value="">— اختر سائقاً —</option>
                  {drivers.map(d => <option key={d.phone} value={d.phone}>{d.name}</option>)}
                </select>
              </div>

              {/* Bonus */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">بونص السائق (ريال)</label>
                <input type="number" min="0" step="1" value={rentalBonus}
                  onChange={e => setRentalBonus(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => setRentalAssignModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={assignRental} disabled={!rentalPlate}
                className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d2e50] text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                <CheckCircle size={14} />تأكيد التعيين
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RENTAL EDIT MODAL ══ */}
      {rentalEditModal && (
        <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setRentalEditModal(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-black text-lg text-gray-900">تعديل طلب التأجير</h2>
                <p className="text-xs text-gray-400 mt-0.5">{rentalEditModal.customer_name} · #{rentalEditModal.id}</p>
              </div>
              <button onClick={() => setRentalEditModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">نوع المركبة</label>
                <input type="text" value={rentalEditForm.vehicle_type}
                  onChange={e => setRentalEditForm(f => ({ ...f, vehicle_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">تاريخ البدء</label>
                  <input type="date" value={rentalEditForm.start_date}
                    onChange={e => setRentalEditForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">المدة (أيام)</label>
                  <input type="number" min="1" value={rentalEditForm.duration_days}
                    onChange={e => setRentalEditForm(f => ({ ...f, duration_days: parseInt(e.target.value) || 1 }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">نقطة الانطلاق</label>
                <input type="text" value={rentalEditForm.pickup_location}
                  onChange={e => setRentalEditForm(f => ({ ...f, pickup_location: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">الوجهة</label>
                <input type="text" value={rentalEditForm.destination}
                  onChange={e => setRentalEditForm(f => ({ ...f, destination: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">السعر الإجمالي (ريال)</label>
                <input type="number" min="0" step="0.01" value={rentalEditForm.total_price}
                  onChange={e => setRentalEditForm(f => ({ ...f, total_price: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">ملاحظات</label>
                <textarea value={rentalEditForm.notes} rows={2}
                  onChange={e => setRentalEditForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => setRentalEditModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={saveRentalEdit} disabled={savingRentalEdit}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                <Save size={14} />{savingRentalEdit ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ASSIGN VEHICLE MODAL ══ */}
      {selectedOrder && (
        <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="font-black text-gray-900 text-lg">تخصيص سيارة</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedOrder.order_number} · {selectedOrder.customer_name}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Order summary */}
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-gray-500">المنتج</span><span className="font-semibold">{selectedOrder.product_name} × {selectedOrder.quantity} {selectedOrder.unit}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">الوجهة</span><span className="font-semibold">{selectedOrder.delivery_location}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">نوع الوجهة</span><span className="font-semibold">{selectedOrder.destination_type}</span></div>
                <div className="flex justify-between font-bold border-t border-gray-200 pt-1.5">
                  <span>القيمة</span><span className="text-[#103c68]">{selectedOrder.total_with_vat?.toFixed(2)} ر.س</span>
                </div>
              </div>

              {/* ── Bulker section — only for loose-cement orders ── */}
              {isBulkCementOrder(selectedOrder) && (
                <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
                      <Truck size={14} className="text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-teal-800">سيارات البلكر المتاحة</div>
                      <div className="text-[11px] text-teal-600">مناسبة للأسمنت السائب</div>
                    </div>
                    <span className="mr-auto bg-teal-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">{availableBulkers.length}</span>
                  </div>
                  {availableBulkers.length === 0 ? (
                    <div className="text-xs text-teal-600 text-center py-2 bg-white/60 rounded-xl border border-teal-100">
                      لا توجد سيارات بلكر متاحة حالياً
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {availableBulkers.map(v => (
                        <button key={v.id} type="button"
                          onClick={() => handleVehicleSelect(String(v.id))}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-right transition-all ${
                            selectedVehicle === String(v.id)
                              ? "border-teal-500 bg-teal-100 shadow-sm"
                              : "border-teal-200 bg-white hover:border-teal-400 hover:bg-teal-50"
                          }`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedVehicle === String(v.id) ? "bg-teal-600" : "bg-teal-100"}`}>
                            <Truck size={14} className={selectedVehicle === String(v.id) ? "text-white" : "text-teal-700"} />
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                              {v.plate_number}
                              {v.linked_user_id && <UserCheck size={12} className="text-green-500" />}
                            </div>
                            <div className="text-xs text-gray-400">
                              {v.linked_user_name
                                ? `${v.linked_user_name} (مرتبط)`
                                : v.driver_name || "—"}
                            </div>
                          </div>
                          {selectedVehicle === String(v.id) && (
                            <CheckCircle size={16} className="text-teal-600 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Vehicle selection */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-2">
                  {isBulkCementOrder(selectedOrder) ? "أو اختر سيارة من الأسطول" : "اختر سيارة *"}
                </label>
                {availableVehicles.length === 0 && (
                  <div className="mb-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl px-3 py-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0" />لا توجد سيارات متاحة — يمكنك اختيار سيارة مشغولة إن لزم
                  </div>
                )}
                {filteredVehicles.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 text-gray-500 text-sm rounded-xl p-3 text-center">
                    لا توجد سيارات في الأسطول
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {filteredVehicles.map(v => {
                      const busyOrder = vehicleOrderMap.get(v.plate_number);
                      const stageInfo = busyOrder ? STAGE_NEXT_ACTION[busyOrder.stage] : null;
                      return (
                        <button key={v.id} type="button"
                          onClick={() => handleVehicleSelect(String(v.id))}
                          className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-right transition-all ${
                            selectedVehicle === String(v.id)
                              ? "border-[#103c68] bg-[#103c68]/5 shadow-sm"
                              : "border-gray-200 hover:border-gray-300"
                          }`}>
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${selectedVehicle === String(v.id) ? "bg-[#103c68]" : "bg-gray-100"}`}>
                            <Car size={16} className={selectedVehicle === String(v.id) ? "text-white" : "text-gray-500"} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                              {v.plate_number}
                              {v.linked_user_id && <UserCheck size={13} className="text-green-500" />}
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[v.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                {STATUS_AR[v.status] || v.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 truncate">
                              {v.vehicle_type}
                              {v.linked_user_name ? ` · ${v.linked_user_name} (مرتبط)` : v.driver_name ? ` · ${v.driver_name}` : ""}
                            </div>
                            {stageInfo && (
                              <div className={`text-[10px] mt-0.5 px-1.5 py-0.5 rounded-lg inline-block border ${stageInfo.color}`}>
                                {busyOrder?.order_number} — {stageInfo.label}
                              </div>
                            )}
                          </div>
                          {selectedVehicle === String(v.id) && (
                            <CheckCircle size={18} className="text-[#103c68] flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Driver selection */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-2">السائق <span className="text-gray-400 font-normal">(اختياري — اللوحة كافية)</span></label>

                {/* Auto-linked badge */}
                {isDriverAutoLinked && selectedVehicleObj && (
                  <div className="mb-2 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <UserCheck size={15} className="text-green-600 flex-shrink-0" />
                    <div className="flex-1 text-sm">
                      <span className="font-bold text-green-800">{selectedVehicleObj.linked_user_name}</span>
                      <span className="text-green-600 text-xs mr-1.5">— تم التحديد تلقائياً من الحساب المرتبط</span>
                    </div>
                  </div>
                )}

                {drivers.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl p-3 text-center">
                    لا يوجد سائقون مسجلون في النظام
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {drivers.map(d => (
                      <button key={d.phone} type="button"
                        onClick={() => setSelectedDriver(d.phone)}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-all ${
                          selectedDriver === d.phone
                            ? "border-[#103c68] bg-[#103c68]/5 shadow-sm"
                            : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${selectedDriver === d.phone ? "bg-[#103c68]" : "bg-gray-100"}`}>
                          <span className={`text-sm font-black ${selectedDriver === d.phone ? "text-white" : "text-gray-500"}`}>{d.name[0]}</span>
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                            {d.name}
                            {selectedVehicleObj?.linked_user_phone === d.phone && (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                                <Link size={9} />مرتبط
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">{d.phone}</div>
                        </div>
                        {selectedDriver === d.phone && (
                          <CheckCircle size={16} className="text-[#103c68] flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Alt driver (optional — bonus routes to this driver) */}
              {selectedVehicle && selectedDriver && (
                <div className="border border-dashed border-gray-300 rounded-2xl p-4 space-y-3 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <Users size={13} className="text-gray-500" />
                    <span className="text-xs font-bold text-gray-600">سائق بديل (اختياري)</span>
                    <span className="text-xs text-gray-400">— إذا خُصص، يُحوَّل البونص إليه</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={altDriverPhone} onChange={e => setAltDriverPhone(e.target.value)}
                      placeholder="رقم جوال البديل"
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-white" />
                    <input type="text" value={altDriverName} onChange={e => setAltDriverName(e.target.value)}
                      placeholder="اسم السائق البديل"
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-white" />
                  </div>
                  {altDriverPhone && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 flex items-center gap-1.5">
                      <Users size={12} />البونص سيُحوَّل لـ {altDriverName || altDriverPhone}
                    </div>
                  )}
                </div>
              )}

              {/* Optional tariff selector */}
              {selectedVehicle && selectedDriver && (
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-2">
                    <DollarSign size={12} className="inline ml-1 text-purple-500" />ربط بالتعريفة (اختياري)
                  </label>
                  <select
                    value={selectedTariffId ?? ""}
                    onChange={e => setSelectedTariffId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
                  >
                    <option value="">— بدون تعريفة —</option>
                    {tariffs.filter(t => t.status === "approved").map(t => (
                      <option key={t.id} value={t.id}>
                        {t.loading_place} → {t.unloading_place}
                        {t.rental > 0 ? ` (إيجار: ${t.rental} ر.س)` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedTariffId && (() => {
                    const tariff = tariffs.find(t => t.id === selectedTariffId);
                    return tariff ? (
                      <div className="mt-1.5 text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-1.5 flex gap-3">
                        <span>بونص السائق: <strong>{tariff.driver_expense} ر.س</strong></span>
                        <span>الإيراد: <strong>{tariff.rental} ر.س</strong></span>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Helper hint showing what's still missing */}
              {!selectedVehicle && availableVehicles.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700 text-center">
                  يرجى اختيار سيارة أولاً (السائق اختياري)
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setSelectedOrder(null); setSelectedVehicle(""); setSelectedDriver(""); }}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  إلغاء
                </button>
                <button onClick={assignVehicle}
                  disabled={submitting || !selectedVehicle}
                  className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-black text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                  {submitting
                    ? <><RefreshCw size={14} className="animate-spin" />جاري...</>
                    : <><Car size={14} />تخصيص السيارة</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Company Send modal ── */}
      {companySendModal && (
        <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-black text-lg flex items-center gap-2">
                  <Banknote size={18} className="text-purple-600" />إرسال مبلغ من الشركة
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {companySendModal.driver.driver_name} · سيُخصم من الرصيد المستحق
                </p>
              </div>
              <button onClick={() => setCompanySendModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">المبلغ المُرسَل (ريال)</label>
                <input type="number" min="0" step="0.01"
                  value={companySendModal.amount}
                  onChange={e => setCompanySendModal(m => m ? { ...m, amount: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-purple-300 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">ملاحظة (اختياري)</label>
                <input type="text"
                  value={companySendModal.note}
                  onChange={e => setCompanySendModal(m => m ? { ...m, note: e.target.value } : null)}
                  placeholder="مثال: تحويل رصيد، سلفة..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-gray-50" />
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5 text-xs text-purple-700">
                هذا المبلغ سيُسجَّل كمبلغ دفعته الشركة للسائق مسبقاً ويُخصم تلقائياً من رصيده المستحق.
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-5">
              <button onClick={submitCompanySend}
                disabled={!companySendModal.amount || parseFloat(companySendModal.amount) <= 0}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                <Banknote size={14} />تسجيل إرسال من الشركة
              </button>
              <button onClick={() => setCompanySendModal(null)}
                className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Equipment modal ── */}
      {equipModal && (
        <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-black text-lg flex items-center gap-2">
                  <Wrench size={18} className="text-[#103c68]" />معدات السيارة
                </h2>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{equipModal.plate}</p>
              </div>
              <button onClick={() => setEquipModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">نوع المعدات</label>
                <select
                  value={equipModal.equipment_type}
                  onChange={e => setEquipModal(m => m ? { ...m, equipment_type: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-white">
                  <option value="none">بدون معدات</option>
                  <option value="فرش">فرش</option>
                  <option value="طبالي خشب">طبالي خشب</option>
                  <option value="طبالي بلاستك">طبالي بلاستك</option>
                  <option value="مختلط">مختلط</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">الحمولة القصوى (طن)</label>
                <input type="number" min="0" step="0.5"
                  value={equipModal.load_capacity_tons}
                  onChange={e => setEquipModal(m => m ? { ...m, load_capacity_tons: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50"
                  placeholder="0" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">النوع الفرعي (اختياري)</label>
                <input type="text"
                  value={equipModal.vehicle_subtype}
                  onChange={e => setEquipModal(m => m ? { ...m, vehicle_subtype: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50"
                  placeholder="مثال: سطحة طويلة، قلاب مزدوج..." />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setEquipModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={saveEquipment}
                className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                <Wrench size={14} />حفظ المعدات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Driver password modal ── */}
      {driverPwModal && (
        <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Lock size={18} className="text-gray-600" />
                  <h2 className="font-black text-lg">تغيير باسورد السائق</h2>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  سيارة: <span className="font-mono font-bold text-gray-700">{driverPwModal.vehicle.plate_number}</span>
                  {driverPwModal.vehicle.driver_name && <span> · {driverPwModal.vehicle.driver_name}</span>}
                </p>
              </div>
              <button onClick={() => setDriverPwModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">كلمة المرور الجديدة</label>
              <input type="text" value={driverPwModal.newPw}
                onChange={e => setDriverPwModal(m => m ? { ...m, newPw: e.target.value } : null)}
                dir="ltr" placeholder="أدخل كلمة المرور الجديدة"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50 font-mono tracking-widest" />
              <p className="text-xs text-gray-400 mt-1">الافتراضي: رقم اللوحة + mk</p>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setDriverPwModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={changeDriverPw} disabled={!driverPwModal.newPw || driverPwModal.newPw.length < 4}
                className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <Lock size={14} />تغيير الباسورد
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Settlement modal ── */}
      {settlementModal && (
        <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-black text-lg flex items-center gap-2">
                  <Wallet size={18} className="text-[#103c68]" />تصفية البونص
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {settlementModal.driver.driver_name} · رصيد: {settlementModal.driver.balance.toFixed(0)} ر.س
                </p>
              </div>
              <button onClick={() => setSettlementModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">المبلغ (ريال)</label>
                <input type="number" min="0" step="0.01"
                  value={settlementModal.amount}
                  onChange={e => setSettlementModal(m => m ? { ...m, amount: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">تاريخ التسوية</label>
                <input type="date" required
                  value={settlementModal.settlement_date}
                  onChange={e => setSettlementModal(m => m ? { ...m, settlement_date: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">ملاحظات (اختياري)</label>
                <input type="text"
                  value={settlementModal.notes}
                  onChange={e => setSettlementModal(m => m ? { ...m, notes: e.target.value } : null)}
                  placeholder="مثال: بونص الشهر الثالث"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
              {/* Cash / Transfer toggle */}
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-2">طريقة الدفع</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ key: false, label: "💳 تحويل بنكي" }, { key: true, label: "💵 نقدي" }].map(opt => (
                    <button key={String(opt.key)} type="button"
                      onClick={() => setSettlementModal(m => m ? { ...m, is_cash: opt.key } : null)}
                      className={`py-2.5 rounded-xl border text-sm font-bold transition-colors ${settlementModal?.is_cash === opt.key ? "bg-[#103c68] text-white border-[#103c68]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 space-y-1">
                <div className="font-bold mb-1">اختر طريقة التصفية:</div>
                <div>• <strong>تصفية مؤجلة:</strong> يُسجَّل المبلغ كمؤجل حتى التسليم الفعلي لاحقاً عبر "تسليم المبالغ"</div>
                <div>• <strong>تسليم فوري:</strong> يُخصم المبلغ من الرصيد فوراً ويُحدَّث الدفتر</div>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-5">
              <button onClick={() => submitSettlement(true)}
                disabled={submittingSettle || !settlementModal.amount || parseFloat(settlementModal.amount) <= 0 || !settlementModal.settlement_date}
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                <Wallet size={14} />تصفية بدون أخذ فلوس (مؤجل)
              </button>
              <button onClick={() => submitSettlement(false)}
                disabled={submittingSettle || !settlementModal.amount || parseFloat(settlementModal.amount) <= 0 || !settlementModal.settlement_date}
                className="w-full py-3 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                <Banknote size={14} />تسليم فوري
              </button>
              <button onClick={() => setSettlementModal(null)}
                className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══ URGENT SUPPLY REQUESTS ══ */}
      {tab === "urgent" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-gray-900">طلبات التوريد العاجلة من المستودعات</h2>
              <p className="text-sm text-gray-400 mt-0.5">تعيين سيارة لكل طلب ← تنتقل لمسؤول الفسوحات</p>
            </div>
            <button onClick={loadSupplyReqs} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:text-gray-700 transition-colors">
              <RefreshCw size={13} />تحديث
            </button>
          </div>

          {supplyReqs.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <CheckCircle size={40} className="mx-auto mb-3 text-green-400 opacity-60" />
              <p className="font-semibold text-gray-600">لا توجد طلبات توريد معلقة</p>
            </div>
          ) : supplyReqs.map(r => {
              return (
              <div key={r.id} className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        {r.priority === "urgent" && (
                          <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Bell size={10} />عاجل
                          </span>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.status === "supervisor_assigned" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                          {r.status === "supervisor_assigned" ? "جزئياً مُعيَّن" : "معلق"}
                        </span>
                        {r.trailer_loads > 0 && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            (r.trips_count ?? 0) >= r.trailer_loads
                              ? "bg-green-100 text-green-700"
                              : "bg-orange-100 text-orange-700"
                          }`}>
                            🚛 {r.trips_count ?? 0}/{r.trailer_loads} سيارة مُعيَّنة
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-gray-900 text-base">🏭 {r.product_name}</div>
                      <div className="text-sm text-gray-600 mt-0.5">
                        {r.requested_qty?.toLocaleString("ar-SA")} {r.unit}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1">
                        {r.warehouse_name && <span>🏭 {r.warehouse_name}</span>}
                        {r.destination_division && <span>📍 {r.destination_division}</span>}
                        {r.requested_by && <span>👤 {r.requested_by}</span>}
                        <span>{r.created_at?.slice(0, 16)}</span>
                      </div>
                      {r.notes && <p className="text-xs text-gray-400 italic mt-1">{r.notes}</p>}
                      {/* Photos from driver / fsohat */}
                      {(r.driver_loading_image || r.invoice_image) && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {r.driver_loading_image && (
                            <a href={r.driver_loading_image} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700 font-medium hover:bg-indigo-100 transition-colors">
                              <img src={r.driver_loading_image} alt="تحميل" className="w-5 h-5 rounded object-cover flex-shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                              📦 صورة التحميل
                            </a>
                          )}
                          {r.invoice_image && (
                            <a href={r.invoice_image} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-medium hover:bg-emerald-100 transition-colors">
                              <img src={r.invoice_image} alt="فاتورة" className="w-5 h-5 rounded object-cover flex-shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                              🧾 صورة الفاتورة
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => {
                          setSupplyAssignModal(r);
                          setSupplyAssignForm({ vehicle_plate: "", driver_name: "", driver_phone: "" });
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-colors bg-[#103c68] hover:bg-[#0d3158] text-white">
                        <Car size={13} />تعيين سيارة
                      </button>
                      <button
                        onClick={() => { setRejectingSupplyId(rejectingSupplyId === r.id ? null : r.id); setRejectNote(""); }}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-colors bg-red-50 hover:bg-red-100 text-red-700 border border-red-200">
                        <X size={13} />رفض الطلب
                      </button>
                    </div>
                  </div>

                  {/* Reject inline form */}
                  {rejectingSupplyId === r.id && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-bold text-red-700">سبب الرفض (اختياري)</p>
                      <input
                        type="text"
                        value={rejectNote}
                        onChange={e => setRejectNote(e.target.value)}
                        placeholder="مثال: لا توجد سيارات متاحة، أو الطلب مكرر..."
                        className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-300 bg-white"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setRejectingSupplyId(null); setRejectNote(""); }}
                          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                          إلغاء
                        </button>
                        <button
                          onClick={() => rejectSupplyReq(r.id)}
                          className="px-4 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold">
                          تأكيد الرفض
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            );
          })}

          {/* ── Rep Requests needing vehicle ── */}
          {repReqUrgent.length > 0 && (
            <div className="space-y-3 mt-4">
              <div className="font-bold text-gray-700 text-sm border-t border-dashed border-gray-200 pt-4">
                👤 طلبات المناديب — بانتظار تعيين سيارة ({repReqUrgent.length})
              </div>
              {repReqUrgent.map(r => (
                <div key={r.id} className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
                  <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700">👤 طلب مندوب</span>
                    <span className="font-mono text-xs text-gray-400">{r.request_no}</span>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <div className="font-bold text-gray-900">📦 {r.product_name}</div>
                    {r.loading_locations?.length > 0 && (
                      <div className="text-xs text-gray-600">
                        📍 {r.loading_locations.join(" · ")}
                      </div>
                    )}
                    {r.delivery_location && (
                      <div className="text-xs text-indigo-700 break-all">🗺️ {r.delivery_location}</div>
                    )}
                    {r.rep_name && (
                      <div className="text-xs text-emerald-700 font-semibold">👤 {r.rep_name}</div>
                    )}
                    {r.notes && <p className="text-xs text-gray-400 italic">{r.notes}</p>}
                    <div className="flex items-center justify-between pt-1 gap-2">
                      <span className="text-xs text-gray-400">{r.created_at?.slice(0, 16)}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!confirm(`حذف طلب المندوب "${r.product_name}"؟ لا يمكن التراجع.`)) return;
                            await fetch(`/api/rep-requests/${r.id}`, { method: "DELETE" });
                            loadSupplyReqs();
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200">
                          🗑 حذف
                        </button>
                        <button
                          onClick={() => { setRepAssignModal(r); setRepAssignForm({ vehicle_plate: "", driver_name: "", driver_phone: "" }); }}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl bg-[#103c68] hover:bg-[#0d3158] text-white">
                          🚛 تعيين سيارة
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ REP ASSIGN MODAL ══ */}
      {repAssignModal && (
        <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-black text-lg text-gray-900">🚛 تعيين سيارة — طلب مندوب</h2>
                <p className="text-xs text-gray-400 mt-0.5">{repAssignModal.product_name}</p>
              </div>
              <button onClick={() => setRepAssignModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Request summary */}
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1.5 border border-gray-200">
                <div className="flex items-center gap-1.5 mb-2 font-bold text-[#103c68]">
                  <Package size={13} />تفاصيل الطلب
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 flex-shrink-0">المنتج</span>
                  <span className="font-semibold text-gray-700">{repAssignModal.product_name}</span>
                </div>
                {repAssignModal.delivery_location && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">موقع التسليم</span>
                    <span className="font-semibold text-gray-700 text-xs text-left">{repAssignModal.delivery_location}</span>
                  </div>
                )}
                {repAssignModal.rep_name && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">المندوب</span>
                    <span className="font-semibold text-gray-700">{repAssignModal.rep_name}</span>
                  </div>
                )}
              </div>

              {/* Vehicle picker */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-2">اختر سيارة من الأسطول *</label>
                {availableVehicles.length === 0 && vehicles.length > 0 && (
                  <div className="mb-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl px-3 py-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0" />لا توجد سيارات متاحة — يمكنك اختيار سيارة مشغولة أو إدخال اللوحة يدوياً
                  </div>
                )}
                {vehicles.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {transportVehicles.map(v => (
                      <button key={v.id} type="button"
                        onClick={() => setRepAssignForm({
                          vehicle_plate: v.plate_number,
                          driver_name:   v.linked_user_name  || v.driver_name  || "",
                          driver_phone:  v.linked_user_phone || v.driver_phone || "",
                        })}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-all ${
                          repAssignForm.vehicle_plate === v.plate_number
                            ? "border-[#103c68] bg-[#103c68]/5"
                            : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          repAssignForm.vehicle_plate === v.plate_number ? "bg-[#103c68]" : "bg-gray-100"
                        }`}>
                          <Car size={14} className={repAssignForm.vehicle_plate === v.plate_number ? "text-white" : "text-gray-500"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5 flex-wrap">
                            {v.plate_number}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[v.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                              {STATUS_AR[v.status] || v.status}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {v.vehicle_type}{(v.linked_user_name || v.driver_name) ? ` · ${v.linked_user_name || v.driver_name}` : ""}
                          </div>
                          {v.last_delivery_location && (
                            <div className="text-[10px] text-indigo-500 truncate mt-0.5 flex items-center gap-0.5">
                              <span>📍</span>
                              <span>آخر تنزيل: {v.last_delivery_location}</span>
                            </div>
                          )}
                        </div>
                        {repAssignForm.vehicle_plate === v.plate_number && <CheckCircle size={16} className="text-[#103c68] flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
                <input type="text"
                  value={repAssignForm.vehicle_plate}
                  onChange={e => setRepAssignForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                  placeholder="أو أدخل رقم اللوحة يدوياً"
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>

              {/* Driver select */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">السائق</label>
                <select
                  value={repAssignForm.driver_phone}
                  onChange={e => {
                    const d = drivers.find(d => d.phone === e.target.value);
                    setRepAssignForm(f => ({ ...f, driver_phone: e.target.value, driver_name: d?.name || f.driver_name }));
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50">
                  <option value="">— اختر سائقاً —</option>
                  {drivers.map(d => <option key={d.phone} value={d.phone}>{d.name}</option>)}
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => setRepAssignModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button
                disabled={repAssigning || !repAssignForm.vehicle_plate.trim()}
                onClick={async () => {
                  setRepAssigning(true);
                  try {
                    const res = await fetch(`/api/rep-requests/${repAssignModal.id}/assign-vehicle`, {
                      method: "PUT", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(repAssignForm),
                    });
                    if (!res.ok) throw new Error((await res.json()).error || "خطأ");
                    setRepAssignModal(null);
                    loadSupplyReqs();
                    load();
                  } catch (e) { alert((e as Error).message); }
                  finally { setRepAssigning(false); }
                }}
                className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d2e50] text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {repAssigning
                  ? <><RefreshCw size={14} className="animate-spin" />جارٍ التعيين...</>
                  : <><CheckCircle size={14} />تأكيد التعيين</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SWAP VEHICLE MODAL ══ */}
      {swapModal && (
        <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-black text-lg text-gray-900">تبديل السيارة</h2>
                <p className="text-xs text-gray-400 mt-0.5">{swapModal.order_number} · {swapModal.customer_name}</p>
              </div>
              <button onClick={() => setSwapModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Current vehicle */}
              {swapModal.vehicle_plate && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
                  <AlertTriangle size={13} className="text-orange-500 flex-shrink-0" />
                  <div>
                    <span className="text-orange-700 font-bold">السيارة الحالية: {swapModal.vehicle_plate}</span>
                    {swapModal.driver_name && <span className="text-orange-500 mr-1">· {swapModal.driver_name}</span>}
                  </div>
                </div>
              )}
              {/* Vehicle picker */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-2">اختر السيارة البديلة *</label>
                {availableVehicles.length === 0 && (
                  <div className="mb-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl px-3 py-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0" />لا توجد سيارات متاحة — يمكنك اختيار سيارة مشغولة أو إدخال اللوحة يدوياً
                  </div>
                )}
                {transportVehicles.length > 0 && (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {transportVehicles.filter(v => v.plate_number !== swapModal.vehicle_plate).map(v => {
                      const busyOrder = vehicleOrderMap.get(v.plate_number);
                      return (
                        <button key={v.id} type="button"
                          onClick={() => setSwapForm({
                            vehicle_plate: v.plate_number,
                            driver_name: v.linked_user_name || v.driver_name || "",
                            driver_phone: v.linked_user_phone || v.driver_phone || "",
                          })}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-all ${
                            swapForm.vehicle_plate === v.plate_number
                              ? "border-[#103c68] bg-[#103c68]/5"
                              : "border-gray-200 hover:border-gray-300"
                          }`}>
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${swapForm.vehicle_plate === v.plate_number ? "bg-[#103c68]" : "bg-gray-100"}`}>
                            <Car size={14} className={swapForm.vehicle_plate === v.plate_number ? "text-white" : "text-gray-500"} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5 flex-wrap">
                              {v.plate_number}
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[v.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                {STATUS_AR[v.status] || v.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 truncate">{v.vehicle_type}{v.linked_user_name ? ` · ${v.linked_user_name}` : v.driver_name ? ` · ${v.driver_name}` : ""}</div>
                            {v.last_delivery_location && !busyOrder && (
                              <div className="text-[10px] text-indigo-500 truncate mt-0.5 flex items-center gap-0.5">
                                <span>📍</span>
                                <span>آخر تنزيل: {v.last_delivery_location}</span>
                              </div>
                            )}
                            {busyOrder && (
                              <div className="text-[10px] text-blue-600 mt-0.5">
                                {busyOrder.order_number} — {busyOrder.stage === "vehicle_assigned" ? "بانتظار الفوترة" : busyOrder.stage === "invoiced" ? "بانتظار التحميل" : "في التسليم"}
                              </div>
                            )}
                          </div>
                          {swapForm.vehicle_plate === v.plate_number && <CheckCircle size={16} className="text-[#103c68] flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
                <input type="text" value={swapForm.vehicle_plate}
                  onChange={e => setSwapForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                  placeholder="أو أدخل اللوحة يدوياً"
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>
              {/* Driver */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">السائق</label>
                <select value={swapForm.driver_phone}
                  onChange={e => {
                    const d = drivers.find(d => d.phone === e.target.value);
                    setSwapForm(f => ({ ...f, driver_phone: e.target.value, driver_name: d?.name || f.driver_name }));
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50">
                  <option value="">— اختر سائقاً —</option>
                  {drivers.map(d => <option key={d.phone} value={d.phone}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => setSwapModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={swapVehicle} disabled={swapSubmitting || !swapForm.vehicle_plate}
                className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {swapSubmitting ? <><RefreshCw size={14} className="animate-spin" />جاري التبديل...</> : <><RefreshCw size={14} />تأكيد التبديل</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SUPPLY REQUEST ASSIGN MODAL ══ */}
      {supplyAssignModal && (
        <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-black text-lg text-gray-900">تعيين سيارة — طلب عاجل</h2>
                <p className="text-xs text-gray-400 mt-0.5">{supplyAssignModal.product_name} · {supplyAssignModal.warehouse_name}</p>
              </div>
              <button onClick={() => setSupplyAssignModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Success banner */}
              {supplyAssignSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-green-700 text-sm font-bold">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  تم تعيين السيارة — الطلب انتقل لمسؤول الفسوحات ✅
                </div>
              )}
              {/* Request summary */}
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1.5 border border-gray-200">
                <div className="flex items-center gap-1.5 mb-2 font-bold text-[#103c68]">
                  <Package size={13} />تفاصيل الطلب
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 flex-shrink-0">المنتج</span>
                  <span className="font-semibold text-gray-700">{supplyAssignModal.product_name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 flex-shrink-0">الكمية</span>
                  <span className="font-semibold text-gray-700">{supplyAssignModal.requested_qty?.toLocaleString("ar-SA")} {supplyAssignModal.unit}</span>
                </div>
                {supplyAssignModal.warehouse_name && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">المستودع</span>
                    <span className="font-semibold text-gray-700">{supplyAssignModal.warehouse_name}</span>
                  </div>
                )}
                {supplyAssignModal.destination_division && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">الوجهة</span>
                    <span className="font-semibold text-gray-700">{supplyAssignModal.destination_division}</span>
                  </div>
                )}
                {supplyAssignModal.trailer_loads > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">السيارات المطلوبة</span>
                    <span className={`font-bold ${(supplyAssignModal.trips_count ?? 0) >= supplyAssignModal.trailer_loads ? "text-green-600" : "text-orange-600"}`}>
                      {supplyAssignModal.trips_count ?? 0} / {supplyAssignModal.trailer_loads} سيارة
                    </span>
                  </div>
                )}
                {supplyAssignModal.notes && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">ملاحظات</span>
                    <span className="text-gray-600 text-xs">{supplyAssignModal.notes}</span>
                  </div>
                )}
              </div>

              {/* Vehicle picker — same as rentals */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-2">اختر سيارة من الأسطول *</label>
                {availableVehicles.length === 0 && (
                  <div className="mb-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl px-3 py-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0" />لا توجد سيارات متاحة — يمكنك اختيار سيارة مشغولة أو إدخال اللوحة يدوياً
                  </div>
                )}
                {vehicles.length > 0 && (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {transportVehicles.map(v => {
                      const busyOrder = vehicleOrderMap.get(v.plate_number);
                      return (
                        <button key={v.id} type="button"
                          onClick={() => {
                            setSupplyAssignForm({
                              vehicle_plate: v.plate_number,
                              driver_name: v.linked_user_name || v.driver_name || "",
                              driver_phone: v.linked_user_phone || v.driver_phone || "",
                            });
                          }}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-all ${
                            supplyAssignForm.vehicle_plate === v.plate_number
                              ? "border-[#103c68] bg-[#103c68]/5"
                              : "border-gray-200 hover:border-gray-300"
                          }`}>
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${supplyAssignForm.vehicle_plate === v.plate_number ? "bg-[#103c68]" : "bg-gray-100"}`}>
                            <Car size={14} className={supplyAssignForm.vehicle_plate === v.plate_number ? "text-white" : "text-gray-500"} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5 flex-wrap">
                              {v.plate_number}
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[v.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                {STATUS_AR[v.status] || v.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 truncate">{v.vehicle_type}{v.linked_user_name ? ` · ${v.linked_user_name}` : v.driver_name ? ` · ${v.driver_name}` : ""}</div>
                            {busyOrder && (
                              <div className="text-[10px] text-blue-600 mt-0.5">
                                {busyOrder.order_number} — {busyOrder.stage === "vehicle_assigned" ? "بانتظار الفوترة" : busyOrder.stage === "invoiced" ? "بانتظار التحميل" : "في التسليم"}
                              </div>
                            )}
                          </div>
                          {supplyAssignForm.vehicle_plate === v.plate_number && <CheckCircle size={16} className="text-[#103c68] flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
                <input type="text"
                  value={supplyAssignForm.vehicle_plate}
                  onChange={e => setSupplyAssignForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                  placeholder="أو أدخل اللوحة يدوياً"
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50" />
              </div>

              {/* Driver select */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">السائق</label>
                <select
                  value={supplyAssignForm.driver_phone}
                  onChange={e => {
                    const d = drivers.find(d => d.phone === e.target.value);
                    setSupplyAssignForm(f => ({ ...f, driver_phone: e.target.value, driver_name: d?.name || f.driver_name }));
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-gray-50">
                  <option value="">— اختر سائقاً —</option>
                  {drivers.map(d => <option key={d.phone} value={d.phone}>{d.name}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => setSupplyAssignModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button
                onClick={() => assignSupplyRequest(supplyAssignModal.id)}
                disabled={supplySubmitting || !supplyAssignForm.vehicle_plate}
                className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d2e50] text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {supplySubmitting ? <><RefreshCw size={14} className="animate-spin" />جاري التعيين...</> : <><CheckCircle size={14} />تأكيد التعيين</>}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ══ NEW ROUTING ══ توجيه جديد */}
      {tab === "new_routing" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-gray-900">توجيه جديد</h2>
              <p className="text-base text-gray-500 mt-1">ابحث عن المسار ثم حدد السيارات</p>
            </div>
            <button type="button"
              onClick={() => setShowWarehouseApprovalSettings(current => !current)}
              aria-expanded={showWarehouseApprovalSettings}
              aria-controls="warehouse-approval-panel"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-base font-bold text-amber-900 hover:bg-amber-100">
              {showWarehouseApprovalSettings ? "إغلاق إعداد المستودعات" : "إعداد تأكيد استلام المستودعات"}
            </button>
          </div>

          {showWarehouseApprovalSettings && (
            <div id="warehouse-approval-panel" className="rounded-2xl border border-amber-200 bg-white p-4 space-y-3">
              <div>
                <p className="text-base font-black text-gray-800">تأكيد استلام المستودعات</p>
                <p className="mt-1 text-sm text-gray-600">اختر مستودعاً أو أكثر ثم احفظ الإعداد عند الحاجة فقط. الإعداد المحفوظ يستمر حتى تغييره.</p>
              </div>
              {warehouseApprovalError && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{warehouseApprovalError}</div>}
              {warehouseApprovalMessage && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{warehouseApprovalMessage}</div>}
              {routeWarehouseApproval.length === 0 ? (
                <p className="text-sm text-gray-600">لا توجد مستودعات متاحة أو تعذر تحميلها.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button type="button"
                      onClick={() => setSelectedApprovalWarehouseIds(new Set(routeWarehouseApproval.map(w => w.id)))}
                      className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700 hover:bg-blue-100">
                      تحديد الكل
                    </button>
                    <button type="button" onClick={() => setSelectedApprovalWarehouseIds(new Set())}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-bold text-gray-600 hover:bg-gray-200">
                      إلغاء التحديد
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {routeWarehouseApproval.map(warehouse => (
                      <label key={warehouse.id} className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2 text-sm text-gray-700">
                        <input type="checkbox" checked={selectedApprovalWarehouseIds.has(warehouse.id)}
                          onChange={e => setSelectedApprovalWarehouseIds(current => {
                            const next = new Set(current);
                            if (e.target.checked) next.add(warehouse.id); else next.delete(warehouse.id);
                            return next;
                          })} />
                        <span className="font-bold">{warehouse.name}</span>
                        <span className="mr-auto text-xs text-gray-500">{warehouse.requires_approval ? "يتطلب تأكيداً" : "بدون تأكيد"}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                      <label className="flex items-center gap-1.5 font-semibold text-gray-700">
                        <input type="radio" name="warehouse-approval-choice" checked={warehouseApprovalChoice} onChange={() => setWarehouseApprovalChoice(true)} />
                        يجب تأكيد الاستلام
                      </label>
                      <label className="flex items-center gap-1.5 font-semibold text-gray-700">
                        <input type="radio" name="warehouse-approval-choice" checked={!warehouseApprovalChoice} onChange={() => setWarehouseApprovalChoice(false)} />
                        لا يجب تأكيد الاستلام
                      </label>
                    </div>
                    <button type="button" onClick={saveWarehouseApprovalSettings}
                      disabled={warehouseApprovalSaving || selectedApprovalWarehouseIds.size === 0}
                      className="rounded-xl bg-[#103c68] px-4 py-2 text-sm font-bold text-white hover:bg-[#0d2f52] disabled:opacity-50">
                      {warehouseApprovalSaving ? "جارٍ الحفظ…" : `حفظ للمستودعات المحددة (${selectedApprovalWarehouseIds.size})`}
                    </button>
                  </div>
                  {!warehouseApprovalChoice && (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                      عند الحفظ ستُعالج الحمولات الواصلة والمعلّقة للمستودعات المحددة تلقائياً، ويُضاف مخزونها وتُسجّل رحلاتها وتُفرج السيارات.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── فلاتر البحث ── */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative min-w-[220px] flex-1">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="search" value={routingSearch}
                  onChange={e => {
                    setRoutingSearch(e.target.value);
                    setShowRouteCards(!!(e.target.value.trim() || routingVehicleType || routingLoading || routingUnloading));
                  }}
                  placeholder="ابحث عن مكان التحميل أو التنزيل أو نوع السيارة"
                  aria-label="البحث في المسارات"
                  className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <button type="button"
                onClick={() => {
                  if (!showRouteCards) {
                    setRoutingVehicleType("");
                    setRoutingLoading("");
                    setRoutingUnloading("");
                    setRoutingSearch("");
                  }
                  setShowRouteCards(current => !current);
                }}
                className="rounded-xl border border-[#103c68] px-3 py-2 text-sm font-bold text-[#103c68] hover:bg-blue-50">
                {showRouteCards ? "إخفاء البطاقات مؤقتاً" : "إظهار الكل"}
              </button>
              {/* نوع السيارة */}
              {routingVehicleTypes.length > 0 && (
                <div className="relative">
                  <Truck size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  <select
                    value={routingVehicleType}
                    onChange={e => { setRoutingVehicleType(e.target.value); setShowRouteCards(true); }}
                    className={`border rounded-xl pr-8 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer transition-colors ${
                      routingVehicleType ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold" : "bg-gray-50 border-gray-200 text-gray-600"
                    }`}
                  >
                    <option value="">كل أنواع السيارات</option>
                    {routingVehicleTypes.map(vt => <option key={vt} value={vt}>{vt}</option>)}
                  </select>
                </div>
              )}
              {/* مكان التحميل */}
              <div className="relative">
                <MapPin size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none" />
                <select
                  value={routingLoading}
                  onChange={e => { setRoutingLoading(e.target.value); setShowRouteCards(true); }}
                  className={`border rounded-xl pr-8 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 appearance-none cursor-pointer transition-colors ${
                    routingLoading ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold" : "bg-gray-50 border-gray-200 text-gray-600"
                  }`}
                >
                  <option value="">كل أماكن التحميل</option>
                  {routingLoadingPlaces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {/* مكان التنزيل */}
              <div className="relative">
                <MapPin size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
                <select
                  value={routingUnloading}
                  onChange={e => { setRoutingUnloading(e.target.value); setShowRouteCards(true); }}
                  className={`border rounded-xl pr-8 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none cursor-pointer transition-colors ${
                    routingUnloading ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold" : "bg-gray-50 border-gray-200 text-gray-600"
                  }`}
                >
                  <option value="">كل أماكن التنزيل</option>
                  {routingUnloadingPlaces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {/* مؤشر النتائج + مسح */}
              {routingHasFilter && (
                <>
                  <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-xl font-medium">
                    {filteredTariffs.length} مسار
                  </span>
                  <button
                    onClick={() => { setRoutingVehicleType(""); setRoutingLoading(""); setRoutingUnloading(""); setRoutingSearch(""); setShowRouteCards(false); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    <X size={11} />مسح الفلاتر
                  </button>
                </>
              )}
            </div>
          </div>

          {tariffs.length === 0 ? (
            <div className="bg-gray-50 rounded-2xl p-10 text-center border border-gray-100">
              <Map size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-semibold text-base">لا توجد مسارات معتمدة في التعريفة</p>
            </div>
          ) : !showRouteCards ? (
            <p className="rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4 text-center text-base text-gray-600">
              ابحث عن مسار أو اضغط «إظهار الكل» لعرض البطاقات.
            </p>
          ) : filteredTariffs.length === 0 ? (
            <div className="bg-gray-50 rounded-2xl p-10 text-center border border-gray-100">
              <Map size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-semibold text-base">لا توجد مسارات تطابق الفلتر</p>
              <button onClick={() => { setRoutingVehicleType(""); setRoutingLoading(""); setRoutingUnloading(""); setRoutingSearch(""); setShowRouteCards(false); }}
                className="mt-3 text-sm text-blue-600 hover:underline">مسح الفلاتر</button>
            </div>
          ) : (() => {
            const renderCard = (t: typeof filteredTariffs[0]) => {
              const isSelected = selectedRouteTariff?.id === t.id;
              const isFusahat  = fusahatRouteIds.has(t.id);
              const isFav      = favoriteRouteIds.has(t.id);
              return (
                <div key={t.id} className="relative group">
                  {/* زر المفضلة */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleFavorite(t.id); }}
                    title={isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                    className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                      isFav
                        ? "bg-amber-400 border-amber-400 text-white shadow"
                        : "bg-white/80 border-gray-200 text-gray-300 opacity-0 group-hover:opacity-100"
                    }`}
                  >★</button>

                  {/* زر الفسوحات */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleFusahatRoute(t.id); }}
                    title={isFusahat ? "مسار عبر الفسوحات (انقر للإلغاء)" : "تفعيل مرور عبر الفسوحات"}
                    className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center border text-xs font-black transition-all ${
                      isFusahat
                        ? "bg-purple-600 border-purple-600 text-white shadow"
                        : "bg-white/80 border-gray-200 text-gray-300 opacity-0 group-hover:opacity-100"
                    }`}
                  >ف</button>

                  <button
                    onClick={() => {
                      setSelectedRouteTariff(isSelected ? null : t);
                      setSelectedRouteVehicles(new Set());
                      setRouteLoadingLocationSel(isSelected ? "" : String(t.locations?.find(location => location.kind === "loading")?.id ?? ""));
                      setRouteUnloadingLocationSel(isSelected ? "" : String(t.locations?.find(location => location.kind === "unloading")?.id ?? ""));
                      setRouteLoadingLocationCustom({ name: "", url: "" });
                      setRouteUnloadingLocationCustom({ name: "", url: "" });
                    }}
                    className={`w-full border rounded-2xl p-4 text-right transition-all ${
                      isSelected
                        ? "bg-[#103c68] border-[#103c68] shadow-lg"
                        : isFav
                          ? "bg-amber-50 border-amber-200 hover:border-amber-400 hover:shadow-md"
                          : "bg-white border-gray-200 hover:border-[#103c68] hover:shadow-md"
                    }`}
                  >
                    {isFusahat && (
                    <div className={`text-xs font-bold mb-1.5 px-1.5 py-0.5 rounded-full inline-block ${isSelected ? "bg-purple-400/30 text-purple-200" : "bg-purple-50 text-purple-600 border border-purple-200"}`}>
                        عبر الفسوحات
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                      <span className={`text-sm font-bold truncate ${isSelected ? "text-white" : "text-gray-800"}`}>{t.loading_place}</span>
                      <ArrowRight size={12} className={`flex-shrink-0 ${isSelected ? "text-blue-200" : "text-gray-400"}`} />
                      <span className={`text-sm font-bold truncate ${isSelected ? "text-white" : "text-gray-800"}`}>{t.unloading_place}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className={`rounded-xl px-2.5 py-1.5 text-center ${isSelected ? "bg-white/15" : "bg-amber-50"}`}>
                        <div className={`text-xs font-semibold ${isSelected ? "text-amber-200" : "text-amber-600"}`}>البونص</div>
                        <div className={`text-sm font-black ${isSelected ? "text-white" : "text-amber-800"}`}>{t.driver_expense.toLocaleString()}</div>
                      </div>
                      <div className={`rounded-xl px-2.5 py-1.5 text-center ${isSelected ? "bg-white/15" : "bg-blue-50"}`}>
                        <div className={`text-xs font-semibold ${isSelected ? "text-blue-200" : "text-blue-600"}`}>الإيجار</div>
                        <div className={`text-sm font-black ${isSelected ? "text-white" : "text-blue-800"}`}>{t.rental.toLocaleString()}</div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            };

            return (
              <div className="space-y-5">
                {/* قسم المفضلة */}
                {favoriteTariffs.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-amber-400 text-base">★</span>
                      <span className="text-base font-bold text-gray-700">المفضلة</span>
                      <span className="text-sm bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{favoriteTariffs.length}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                      {favoriteTariffs.map(renderCard)}
                    </div>
                    {nonFavoriteTariffs.length > 0 && <div className="border-t border-gray-100 mt-5" />}
                  </div>
                )}
                {/* باقي المسارات */}
                {nonFavoriteTariffs.length > 0 && (
                  <div>
                    {favoriteTariffs.length > 0 && (
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base font-bold text-gray-600">كل المسارات</span>
                        <span className="text-sm bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">{nonFavoriteTariffs.length}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                      {nonFavoriteTariffs.map(renderCard)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Vehicle Panel ── */}
          {selectedRouteTariff && (() => {
            const routeBranchNames = [...new Set(routeFleetBranches.map(v => v.branch?.trim()).filter((branch): branch is string => !!branch))].sort((a, b) => a.localeCompare(b, "ar"));
            const branchPlates = new Set(routeFleetBranches.filter(v => v.branch?.trim() === routeBranchFilter).map(v => v.plate_number));
            const branchVehicles = routeBranchFilter ? vehicles.filter(v => branchPlates.has(v.plate_number)) : vehicles;
            const routingAvailable = branchVehicles.filter(v => v.status === "available" && !v.active_routing);
            const routingUnavailable = branchVehicles.filter(v => v.status !== "available" || !!v.active_routing);
            const availCount = routingAvailable.length;
            const busyCount = routingUnavailable.length;
            const isFusahatRoute = fusahatRouteIds.has(selectedRouteTariff.id);
            const anySelected = selectedRouteVehicles.size > 0;
            return (
              <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                {/* Panel header */}
                <div className="bg-[#103c68] px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white flex-wrap">
                    <Truck size={16} className="flex-shrink-0" />
                    <span className="font-black text-sm">{selectedRouteTariff.loading_place}</span>
                    <ArrowRight size={13} className="text-blue-300" />
                    <span className="font-black text-sm">{selectedRouteTariff.unloading_place}</span>
                    {isFusahatRoute && (
                    <span className="text-xs bg-purple-500/40 text-purple-200 font-bold px-2 py-0.5 rounded-full">عبر الفسوحات</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm text-emerald-200 font-bold">{availCount} متاحة</span>
                    <span className="text-sm text-blue-200 font-bold">{busyCount} مشغولة</span>
                    <button onClick={() => { setSelectedRouteTariff(null); setSelectedRouteVehicles(new Set()); }} className="text-white/60 hover:text-white">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="border-b border-gray-100 bg-slate-50 px-4 py-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm font-bold text-gray-700" htmlFor="routing-branch-filter">فرع السيارات</label>
                    <select id="routing-branch-filter" value={routeBranchFilter}
                      onChange={e => { setRouteBranchFilter(e.target.value); setSelectedRouteVehicles(new Set()); }}
                      className="min-w-48 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400" dir="rtl">
                      <option value="">كل الفروع</option>
                      {routeBranchNames.map(branch => <option key={branch} value={branch}>{branch}</option>)}
                    </select>
                    {routeBranchError && <span className="text-sm font-bold text-red-600">{routeBranchError}</span>}
                  </div>

                </div>

                {/* Vehicle list */}
                <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                  {routeVehiclesError && <div className="px-4 py-3 text-sm font-bold text-red-700 bg-red-50">تعذر تحديث حالة السيارات؛ قد تكون القائمة غير محدثة</div>}
                  {routeBranchError && routeBranchFilter && (
                    <div className="px-4 py-3 text-sm font-bold text-red-700 bg-red-50">تعذر التحقق من انتماء السيارات للفروع؛ اختر «كل الفروع» أو حدّث الصفحة.</div>
                  )}
                  {branchVehicles.length === 0 && (
                    <div className="py-10 text-center text-gray-500 text-base">لا توجد سيارات مسجّلة</div>
                  )}
                  {routingAvailable.length > 0 && <div className="px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50">متاحة للاختيار</div>}
                  {[...routingAvailable, ...routingUnavailable].map((v, index) => {
                    const busyOrder  = vehicleOrderMap.get(v.plate_number);
                    const isAvail    = v.status === "available" && !v.active_routing;
                    const isChecked  = selectedRouteVehicles.has(v.plate_number);
                    return (
                      <div key={v.id}>
                        {index === availCount && <div className="px-4 py-2 text-sm font-bold text-blue-700 bg-blue-50">موجّهة أو غير متاحة — للمتابعة فقط</div>}
                        <button
                          type="button"
                          disabled={!isAvail}
                          onClick={() => toggleRouteVehicle(v.plate_number)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-right transition-colors ${
                            isChecked ? "bg-[#103c68]/5 border-r-4 border-[#103c68]" : isAvail ? "hover:bg-gray-50" : "bg-gray-50/40 cursor-default"
                          }`}
                        >
                        {/* Checkbox circle */}
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-colors ${
                          isChecked ? "bg-[#103c68] border-[#103c68]" : "border-gray-300"
                        }`}>
                          {isChecked && <CheckCircle size={12} className="text-white" />}
                        </div>
                        {/* Vehicle icon */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${isAvail ? "bg-emerald-50" : "bg-blue-50"}`}>
                          <Truck size={15} className={isAvail ? "text-emerald-600" : "text-blue-600"} />
                        </div>
                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-gray-900 text-sm">{v.plate_number}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${v.active_routing ? "bg-blue-100 text-blue-700 border-blue-200" : STATUS_COLOR[v.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                              {v.active_routing ? "موجّهة" : STATUS_AR[v.status] || v.status}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mt-0.5">
                            {v.vehicle_type}{v.driver_name ? ` · ${v.driver_name}` : ""}{v.linked_user_name ? ` · ${v.linked_user_name}` : ""}
                          </div>
                          {isAvail && (v.last_trip_loading_place || v.last_trip_unloading_place) && (
                            <div className="mt-1 flex items-center gap-1 text-sm text-indigo-700 font-semibold">
                              <MapPin size={14} className="flex-shrink-0" />
                              <span>آخر رحلة مسجلة: {v.last_trip_loading_place
                                ? `من ${v.last_trip_loading_place} إلى ${v.last_trip_unloading_place || "غير محدد"}`
                                : `إلى ${v.last_trip_unloading_place}`}</span>
                              {v.last_trip_date && <span className="text-gray-600 font-medium">· {v.last_trip_date}</span>}
                            </div>
                          )}
                          {isAvail && !v.last_trip_loading_place && !v.last_trip_unloading_place && v.last_delivery_location && (
                            <div className="mt-1 flex items-center gap-1 text-sm text-indigo-700 font-semibold">
                              <MapPin size={14} className="flex-shrink-0" />
                              <span>آخر تنزيل: {v.last_delivery_location}</span>
                              {v.last_delivery_date && <span className="text-gray-600 font-medium">· {new Date(v.last_delivery_date).toLocaleDateString("ar-SA")}</span>}
                            </div>
                          )}
                          {isAvail && !v.last_trip_loading_place && !v.last_trip_unloading_place && !v.last_delivery_location && <div className="mt-1 text-sm text-emerald-700 font-semibold">جاهزة للتوجيه</div>}
                          {v.active_routing && (
                            <div className="mt-1 space-y-1 text-sm text-blue-800">
                              <div className="font-bold">موجّهة إلى: {v.active_routing.unloading_place || "غير محدد"}</div>
                              <div>الحمولة: {v.active_routing.cargo_type || "غير محددة"} · الحالة: {SUPPLY_TRIP_STATUS[v.active_routing.trip_status]?.label || v.active_routing.trip_status}</div>
                              <div>التعريفة المختارة #{v.active_routing.tariff_id ?? "—"}: {v.active_routing.tariff_loading_place || v.active_routing.loading_place || "—"} ← {v.active_routing.tariff_unloading_place || v.active_routing.unloading_place || "—"}</div>
                              <div>البونص: {Number(v.active_routing.driver_expense || 0).toLocaleString()} · الإيجار: {Number(v.active_routing.rental || 0).toLocaleString()}</div>
                            </div>
                          )}
                          {!isAvail && !v.active_routing && busyOrder && (
                            <div className="mt-1 space-y-0.5">
                              <div className="text-sm text-blue-700 font-bold font-mono">{busyOrder.order_number}</div>
                              <div className="flex items-center gap-1 text-sm text-gray-600"><MapPin size={13} />{busyOrder.delivery_location}</div>
                              <div className="text-xs text-gray-600">
                                {busyOrder.stage === "vehicle_assigned" ? "⏳ بانتظار الفاتورة" : busyOrder.stage === "invoiced" ? "📦 بانتظار التحميل" : "🚛 في الطريق للتسليم"}
                              </div>
                            </div>
                          )}
                          {!isAvail && !v.active_routing && !busyOrder && <div className="mt-1 text-sm text-gray-600">غير متاحة — لا توجد تفاصيل</div>}
                        </div>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* ── Send bar ── */}
                {routeSentMsg && (
                  <div className={`mx-5 mt-3 text-sm font-bold text-center py-2 rounded-xl ${routeSentMsg.startsWith("✅") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {routeSentMsg}
                  </div>
                )}
                {anySelected && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600 font-semibold">
                        {selectedRouteVehicles.size} سيارة محددة: {[...selectedRouteVehicles].join("، ")}
                      </span>
                      <button onClick={() => setSelectedRouteVehicles(new Set())} className="text-sm text-gray-600 hover:text-gray-800">إلغاء التحديد</button>
                    </div>

                    {/* ── Routing optional fields ── */}
                    <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
                      <p className="text-sm font-bold text-gray-600 uppercase tracking-wide">تفاصيل إضافية (اختياري)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {([
                          { kind: "loading" as const, label: "موقع التحميل", value: routeLoadingLocationSel, setValue: setRouteLoadingLocationSel, custom: routeLoadingLocationCustom, setCustom: setRouteLoadingLocationCustom },
                          { kind: "unloading" as const, label: "موقع التنزيل", value: routeUnloadingLocationSel, setValue: setRouteUnloadingLocationSel, custom: routeUnloadingLocationCustom, setCustom: setRouteUnloadingLocationCustom },
                        ]).map(location => {
                          const saved = selectedRouteTariff.locations?.filter(choice => choice.kind === location.kind) || [];
                          return (
                            <div key={location.kind} className="space-y-1.5">
                              <label className="block text-sm font-bold text-gray-700">📍 {location.label} على الخريطة</label>
                              <select value={location.value} onChange={e => location.setValue(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400" dir="rtl">
                                <option value="">— بدون موقع —</option>
                                {saved.map(choice => <option key={choice.id} value={String(choice.id)}>{choice.name} — {choice.url}</option>)}
                                <option value="__custom__">✏️ موقع مخصص لهذه الرحلة</option>
                              </select>
                              {location.value === "__custom__" && (
                                <div className="space-y-2">
                                  <input value={location.custom.name} onChange={e => location.setCustom(current => ({ ...current, name: e.target.value }))}
                                    placeholder={`اسم ${location.label} (اختياري)`} className="w-full border border-blue-200 rounded-xl px-2.5 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white" />
                                  <input type="url" value={location.custom.url} onChange={e => location.setCustom(current => ({ ...current, url: e.target.value }))}
                                    placeholder="https://..." dir="ltr" className="w-full border border-blue-200 rounded-xl px-2.5 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {/* الفرعية منفصلة عن مكان التنزيل المحدد في التعريفة */}
                        <div className="space-y-1.5">
                          <label className="block text-sm font-bold text-gray-700">🏭 الفرعية / المستودع (ليست مكان التنزيل)</label>
                          <select
                            value={routeUnloadingSel}
                            onChange={e => setRouteUnloadingSel(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
                            dir="rtl"
                          >
                            <option value="">— بدون فرعية —</option>
                            {routeWarehouses.map(w => (
                              <option key={w.id} value={w.name}>{w.name}</option>
                            ))}
                            <option value="__custom__">✏️ اكتب جديد...</option>
                          </select>
                          {routeUnloadingSel === "__custom__" && (
                            <input value={routeUnloadingCustom} onChange={e => setRouteUnloadingCustom(e.target.value)}
                              placeholder="اسم الفرعية..."
                              className="w-full border border-blue-200 rounded-xl px-2.5 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white" />
                          )}
                        </div>
                        {/* العميل */}
                        <div className="space-y-1.5">
                          <label className="block text-sm font-bold text-gray-700">👤 العميل / الزبون</label>
                          <select
                            value={routeCustomerSel}
                            onChange={e => {
                              setRouteCustomerSel(e.target.value);
                              const customer = routeCustomers.find(c => c.name === e.target.value);
                              if (customer) setRouteCustomerType(customer.customer_type);
                            }}
                            className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
                            dir="rtl"
                          >
                            <option value="">— بدون تحديد —</option>
                            {routeCustomers.map(c => (
                              <option key={c.id} value={c.name}>{c.name} — {c.customer_type === "company" ? "تابع للشركة" : "خارجي"}</option>
                            ))}
                            <option value="__custom__">✏️ اكتب جديد...</option>
                          </select>
                          {routeCustomerSel === "__custom__" && (
                            <div className="space-y-2">
                              <input value={routeCustomerCustom} onChange={e => setRouteCustomerCustom(e.target.value)}
                                placeholder="اسم العميل الجديد..."
                                className="w-full border border-blue-200 rounded-xl px-2.5 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white" />
                              <button type="button" onClick={addRouteCustomer} disabled={!routeCustomerCustom.trim()}
                                className="text-sm text-blue-700 font-bold disabled:opacity-40">+ حفظ العميل الجديد</button>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-3 text-sm">
                            <label><input type="radio" checked={routeCustomerType === "rental"} onChange={() => setRouteCustomerType("rental")} /> خارجي يدفع إيجارًا</label>
                            <label><input type="radio" checked={routeCustomerType === "company"} onChange={() => setRouteCustomerType("company")} /> تابع للشركة</label>
                          </div>
                        </div>
                        {/* المندوب */}
                        <div className="space-y-1.5">
                          <label className="block text-sm font-bold text-gray-700">🧑‍💼 المندوب</label>
                          <select
                            value={routeRepSel}
                            onChange={e => setRouteRepSel(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
                            dir="rtl"
                          >
                            <option value="">— بدون تحديد —</option>
                            {routeReps.map(r => (
                              <option key={r.id} value={r.phone}>{r.name} — {r.phone}</option>
                            ))}
                            <option value="__custom__">✏️ اكتب جديد...</option>
                          </select>
                          {routeRepSel === "__custom__" && (
                            <div className="space-y-2">
                              <input value={routeRepCustom} onChange={e => setRouteRepCustom(e.target.value)}
                                placeholder="اسم المندوب..."
                                className="w-full border border-blue-200 rounded-xl px-2.5 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white" />
                              <input type="tel" value={routeRepPhone} onChange={e => setRouteRepPhone(e.target.value)}
                                placeholder="رقم المندوب..."
                                className="w-full border border-blue-200 rounded-xl px-2.5 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="block text-sm font-bold text-gray-700">نوع الحمولة</label>
                          <div className="flex gap-2">
                            <select value={routeCargoSel} onChange={e => setRouteCargoSel(e.target.value)}
                              className="flex-1 min-w-0 border border-gray-200 rounded-xl px-2.5 py-2 text-sm bg-white">
                              <option value="">— بدون تحديد —</option>
                              {routeCargoTypes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                              <option value="__custom__">+ إضافة نوع جديد...</option>
                            </select>
                            {routeCargoTypes.find(c => c.name === routeCargoSel) && (
                              <>
                                <button type="button" onClick={() => saveRouteCargoType(routeCargoTypes.find(c => c.name === routeCargoSel)!)}
                                  className="text-sm text-blue-600" title="تعديل النوع">تعديل</button>
                                <button type="button" onClick={() => deleteRouteCargoType(routeCargoTypes.find(c => c.name === routeCargoSel)!)}
                                  className="text-sm text-red-600" title="حذف النوع من القائمة">حذف</button>
                              </>
                            )}
                          </div>
                          {routeCargoSel === "__custom__" && (
                            <div className="flex gap-2">
                              <input value={routeCargoCustom} onChange={e => setRouteCargoCustom(e.target.value)}
                                placeholder="اكتب نوع الحمولة" className="min-w-0 flex-1 border border-blue-200 rounded-xl px-2.5 py-2 text-sm" />
                              <button type="button" onClick={() => saveRouteCargoType()} disabled={!routeCargoCustom.trim()}
                                className="text-sm font-bold text-blue-700 disabled:opacity-40">إضافة</button>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input type="number" min="0.01" step="any" value={routeCargoQty}
                              onChange={e => setRouteCargoQty(e.target.value)} placeholder="الكمية"
                              className="min-w-0 flex-1 border border-gray-200 rounded-xl px-2.5 py-2 text-sm"
                              disabled={!routeCargoSel || routeCargoSel === "__custom__"} />
                            <button type="button" onClick={addRouteCargoItem}
                              disabled={!routeCargoSel || routeCargoSel === "__custom__" || !routeCargoQty}
                              className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 disabled:opacity-40">
                              إضافة للحمولة
                            </button>
                          </div>
                          {routeCargoItems.length > 0 && (
                            <ul className="space-y-1 rounded-xl bg-gray-50 p-2 text-sm">
                              {routeCargoItems.map((item, index) => (
                                <li key={`${item.cargo_type}-${index}`} className="flex items-center justify-between gap-2">
                                  <span>{item.cargo_type} — {item.quantity}</span>
                                  <button type="button" onClick={() => setRouteCargoItems(prev => prev.filter((_, i) => i !== index))}
                                    className="text-red-600">إزالة</button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-sm font-bold text-gray-700">صور وملفات الفسح (اختياري — يمكن اختيار أكثر من ملف)</label>
                          <input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf"
                            onChange={e => {
                              const selected = Array.from(e.target.files || []);
                              e.target.value = "";
                              if (selected.length) setRoutePermitFiles(prev => {
                                const existing = new Set(prev.map(file => `${file.name}:${file.size}:${file.lastModified}`));
                                return [...prev, ...selected.filter(file => !existing.has(`${file.name}:${file.size}:${file.lastModified}`))].slice(0, 20);
                              });
                            }}
                            className="block w-full text-sm text-gray-700" />
                          {routePermitFiles.length > 0 && (
                            <ul className="space-y-1 text-xs text-gray-600">
                              {routePermitFiles.map((file, index) => (
                                <li key={`${file.name}-${file.lastModified}`} className="flex justify-between gap-2">
                                  <span className="truncate">📎 {file.name}</span>
                                  <button type="button" className="shrink-0 text-red-600"
                                    onClick={() => setRoutePermitFiles(prev => prev.filter((_, i) => i !== index))}>إزالة</button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => sendRouting("via_fusahat")}
                        disabled={routeSending}
                        className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-bold text-sm transition-all ${
                          isFusahatRoute
                            ? "bg-purple-600 text-white shadow-lg hover:bg-purple-700"
                            : "bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100"
                        } disabled:opacity-50`}
                      >
                        <Shield size={14} />
                        <span>إرسال عبر الفسوحات</span>
                        {isFusahatRoute && <span className="text-xs bg-white/20 px-1.5 rounded-full">افتراضي</span>}
                      </button>
                      <button
                        onClick={() => sendRouting("direct")}
                        disabled={routeSending}
                        className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-bold text-sm transition-all ${
                          !isFusahatRoute
                            ? "bg-emerald-600 text-white shadow-lg hover:bg-emerald-700"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                        } disabled:opacity-50`}
                      >
                        <Truck size={14} />
                        <span>إرسال مباشر للسيارات</span>
                        {!isFusahatRoute && <span className="text-xs bg-white/20 px-1.5 rounded-full">افتراضي</span>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {tab === "my_trips" && (() => {
        const MY_STATUS: Record<string, { label: string; color: string }> = {
          assigned:                   { label: "بانتظار الفسوحات",      color: "bg-amber-50 text-amber-700 border-amber-200"    },
          in_transit:                 { label: "جارٍ التنفيذ 🚛",        color: "bg-blue-50 text-blue-700 border-blue-200"       },
          loaded:                     { label: "جارٍ التحميل 📦",         color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
          delivered_to_warehouse:     { label: "تم التسليم 🏁",           color: "bg-teal-50 text-teal-700 border-teal-200"       },
          completed:                  { label: "مكتمل ✓",                color: "bg-green-50 text-green-700 border-green-200"    },
          cancelled:                  { label: "ملغي ✗",                 color: "bg-red-50 text-red-600 border-red-200"          },
        };
        const active   = myTrips.filter(t => !["completed","cancelled"].includes(t.status));
        const archived = myTrips.filter(t =>  ["completed","cancelled"].includes(t.status));
        return (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-gray-900">رحلاتي</h2>
                <p className="text-sm text-gray-400 mt-1">جميع الرحلات الصادرة عبر التوجيه</p>
              </div>
              <button onClick={loadMyTrips} disabled={myTripsLoading}
                className="flex items-center gap-2 px-4 py-2 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d2f52] disabled:opacity-50">
                <RefreshCw size={14} className={myTripsLoading ? "animate-spin" : ""} />
                تحديث
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "إجمالي الرحلات", value: myTrips.length,  color: "bg-gray-50 text-gray-700 border border-gray-100" },
                { label: "نشطة",           value: active.length,   color: "bg-blue-50 text-blue-700 border border-blue-100" },
                { label: "مكتملة / ملغاة", value: archived.length, color: "bg-green-50 text-green-700 border border-green-100" },
              ].map(s => (
                <div key={s.label} className={`rounded-2xl p-4 ${s.color}`}>
                  <div className="text-2xl font-black">{s.value}</div>
                  <div className="text-xs font-semibold mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {myTripsError && (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{myTripsError}</div>
            )}
            {myTripsLoading ? (
              <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
                <RefreshCw size={28} className="animate-spin text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">جارٍ التحميل…</p>
              </div>
            ) : myTripsError ? null : myTrips.length === 0 ? (
              <div className="bg-gray-50 rounded-2xl p-10 text-center border border-gray-100">
                <Truck size={32} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 font-semibold text-sm">لا توجد رحلات بعد — أرسل توجيهاً أولاً</p>
              </div>
            ) : (
              <div className="space-y-6">
                {[{ title: "الرحلات النشطة", rows: active }, { title: "المكتملة / الملغاة", rows: archived }]
                  .filter(g => g.rows.length > 0)
                  .map(group => (
                  <div key={group.title}>
                    <h3 className="text-sm font-bold text-gray-500 mb-2 px-1">{group.title}</h3>
                    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                      <table className="min-w-[1120px] w-full text-right text-xs">
                        <thead className="bg-slate-50 text-gray-500">
                          <tr>
                            {["التاريخ", "المسار", "اللوحة / السائق", "العميل", "نوع الحمولة", "التعريفة والمبالغ", "الحالة", "الإجراءات"].map(label => (
                              <th key={label} className="whitespace-nowrap px-4 py-3 font-bold">{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                      {group.rows.map(trip => {
                        const st = MY_STATUS[trip.status] ?? { label: trip.status, color: "bg-gray-50 text-gray-500 border-gray-100" };
                        const total = (trip.driver_expense || 0) + (trip.rental || 0);
                        return (
                          <tr key={trip.id} className="hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                              <div>{new Date(trip.created_at).toLocaleDateString("ar-SA")}</div>
                              <div className="mt-0.5 text-[10px] text-gray-400">{trip.delivered_at ? `التسليم: ${new Date(trip.delivered_at).toLocaleDateString("ar-SA")}` : "—"}</div>
                            </td>
                            <td className="max-w-56 px-4 py-3">
                              <div className="flex items-center gap-1.5 font-bold text-gray-800">
                                <span className="max-w-24 truncate">{trip.loading_place || trip.tariff_loading_place || "—"}</span>
                                <ArrowRight size={12} className="flex-shrink-0 text-gray-400" />
                                <span className="max-w-24 truncate">{trip.override_unloading_place || trip.unloading_place || trip.tariff_unloading_place || trip.destination_division || trip.warehouse_name || "—"}</span>
                              </div>
                              {trip.sr_notes && <div className="mt-1 max-w-56 truncate text-[10px] text-gray-400" title={trip.sr_notes}>{trip.sr_notes}</div>}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="font-black text-gray-800">{trip.vehicle_plate || "—"}</div>
                              <div className="mt-0.5 text-[10px] text-gray-500">{trip.driver_name || "—"}{trip.driver_phone ? ` · ${trip.driver_phone}` : ""}</div>
                            </td>
                            <td className="max-w-40 px-4 py-3 text-gray-700">{trip.customer_name || trip.requested_by || "—"}</td>
                            <td className="max-w-40 px-4 py-3 text-gray-700">{trip.cargo_type || trip.product_name || "—"}</td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="font-bold text-gray-700">#{trip.tariff_id ?? "—"}</div>
                              <div className="mt-1 text-[10px] text-gray-500">
                                بونص {Number(trip.driver_expense || 0).toLocaleString()} · إيجار {Number(trip.rental || 0).toLocaleString()}
                              </div>
                              <div className="mt-0.5 text-[10px] font-bold text-gray-700">الإجمالي {total.toLocaleString()}</div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${st.color}`}>{st.label}</span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                {!["completed","cancelled"].includes(trip.status) && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditMyTrip(trip);
                                        setEditMyForm({
                                          tariff_id: trip.tariff_id == null ? "" : String(trip.tariff_id),
                                          loading_place: trip.loading_place || trip.tariff_loading_place || "",
                                          unloading_place: trip.unloading_place || trip.tariff_unloading_place || "",
                                          override_loading_place: trip.override_loading_place || "",
                                          override_unloading_place: trip.override_unloading_place || "",
                                          loading_location_name: trip.loading_location_name || "",
                                          loading_location_url: trip.loading_location_url || "",
                                          unloading_location_name: trip.unloading_location_name || "",
                                          unloading_location_url: trip.unloading_location_url || "",
                                          warehouse_id: trip.warehouse_id == null ? "" : String(trip.warehouse_id),
                                          product_name: trip.product_name || "",
                                          cargo_type: trip.cargo_type || "",
                                          destination_division: trip.destination_division || "",
                                          customer_name: trip.customer_name || "",
                                          customer_type: trip.customer_type || "rental",
                                          rep_name: trip.rep_name || "",
                                          rep_phone: trip.rep_phone || "",
                                          driver_expense: String(trip.driver_expense ?? 0),
                                          rental: String(trip.rental ?? 0),
                                          route_type: trip.route_type === "via_fusahat" ? "via_fusahat" : "direct",
                                          vehicle_plate: trip.vehicle_plate ?? "",
                                          driver_name: trip.driver_name ?? "",
                                          driver_phone: trip.driver_phone ?? "",
                                          notes: trip.sr_notes ?? "",
                                        });
                                        setEditMyPermitFile(null);
                                        setEditMyPermitError("");
                                      }}
                                      className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-600 hover:bg-blue-100"
                                      title="تعديل بيانات التوجيه"
                                    ><Pencil size={14} /></button>
                                    <button onClick={() => cancelMyTrip(trip.id)} disabled={myTripsSaving === trip.id}
                                      className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-600 hover:bg-amber-100 disabled:opacity-50"
                                      title="إلغاء"><X size={14} /></button>
                                  </>
                                )}
                                <button onClick={() => deleteMyTrip(trip.id)} disabled={myTripsSaving === trip.id}
                                  className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-500 hover:bg-red-100 disabled:opacity-50"
                                  title={["completed","cancelled"].includes(trip.status) ? "حذف نهائي" : "حذف"}><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Edit Modal */}
            {editMyTrip && (
              <div className="supervisor-orders-modal fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-5" onMouseDown={e => { if (e.target === e.currentTarget && !myTripsSaving) setEditMyTrip(null); }}>
                <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
                  <div className="flex items-center justify-between gap-3 p-5 pb-3">
                    <div>
                      <h3 className="text-lg font-black text-gray-900">تعديل بيانات التوجيه</h3>
                      <p className="mt-1 text-xs text-gray-500">تعديلات التعريفة والمسار والعميل والحمولة مشتركة على سيارات التوجيه؛ بيانات اللوحة والسائق تخص هذه الرحلة فقط.</p>
                    </div>
                    <button onClick={() => setEditMyTrip(null)} disabled={!!myTripsSaving} className="rounded-lg p-1.5 hover:bg-gray-100 disabled:opacity-50"><X size={16} /></button>
                  </div>
                  <div className="overflow-y-auto p-5 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="space-y-1">
                        <span className="block text-xs font-bold text-gray-600">التعريفة</span>
                        <select value={editMyForm.tariff_id}
                          onChange={e => {
                            const tariff = allTariffs.find(t => String(t.id) === e.target.value);
                            setEditMyForm(f => ({
                              ...f, tariff_id: e.target.value,
                              loading_place: tariff?.loading_place ?? f.loading_place,
                              unloading_place: tariff?.unloading_place ?? f.unloading_place,
                              driver_expense: tariff ? String(tariff.driver_expense) : f.driver_expense,
                              rental: tariff ? String(tariff.rental) : f.rental,
                            }));
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none">
                          {!allTariffs.some(t => String(t.id) === editMyForm.tariff_id) && editMyForm.tariff_id && (
                            <option value={editMyForm.tariff_id}>التعريفة الحالية #{editMyForm.tariff_id}</option>
                          )}
                          <option value="" disabled>اختر تعريفة</option>
                          {allTariffs.map(t => <option key={t.id} value={t.id}>#{t.id} · {t.loading_place} ← {t.unloading_place}</option>)}
                        </select>
                      </label>
                      {([
                        { kind: "loading" as const, label: "موقع التحميل", nameField: "loading_location_name" as const, urlField: "loading_location_url" as const },
                        { kind: "unloading" as const, label: "موقع التنزيل", nameField: "unloading_location_name" as const, urlField: "unloading_location_url" as const },
                      ]).map(location => {
                        const tariff = allTariffs.find(t => String(t.id) === editMyForm.tariff_id);
                        const saved = tariff?.locations?.filter(choice => choice.kind === location.kind) || [];
                        const matchingSaved = saved.find(choice => choice.name === editMyForm[location.nameField] && choice.url === editMyForm[location.urlField]);
                        const currentChoice = matchingSaved
                          ? String(matchingSaved.id)
                          : editMyForm[location.nameField] || editMyForm[location.urlField] ? "__custom__" : "";
                        return (
                          <div key={location.kind} className="space-y-2 rounded-xl border border-gray-100 bg-slate-50 p-3 sm:col-span-2 lg:col-span-3">
                            <span className="block text-xs font-bold text-gray-700">📍 {location.label} — محفوظة لهذه الرحلة</span>
                            <select value={currentChoice}
                              onChange={e => {
                                const choice = saved.find(item => String(item.id) === e.target.value);
                                setEditMyForm(f => ({
                                  ...f,
                                  [location.nameField]: choice?.name || "",
                                  [location.urlField]: choice?.url || "",
                                }));
                              }}
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none">
                              <option value="">— بدون موقع —</option>
                              {saved.map(choice => <option key={choice.id} value={String(choice.id)}>{choice.name} — {choice.url}</option>)}
                              <option value="__custom__" disabled>موقع مخصص — عدّل الاسم والرابط أدناه</option>
                            </select>
                            {saved.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {saved.map(choice => (
                                  <span key={choice.id} className="break-all text-[11px] font-semibold text-gray-600" dir="auto">{choice.name} · {choice.url}</span>
                                ))}
                              </div>
                            )}
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input value={editMyForm[location.nameField]}
                                onChange={e => setEditMyForm(f => ({ ...f, [location.nameField]: e.target.value }))}
                                placeholder={`اسم ${location.label} (اتركه فارغاً للمسح)`}
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none" />
                              <input type="url" value={editMyForm[location.urlField]}
                                onChange={e => setEditMyForm(f => ({ ...f, [location.urlField]: e.target.value }))}
                                placeholder="https://..." dir="ltr"
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none" />
                            </div>
                          </div>
                        );
                      })}
                      {[
                        ["loading_place", "مكان التحميل"],
                        ["unloading_place", "مكان التنزيل"],
                        ["override_loading_place", "فرع / تحميل بديل"],
                        ["override_unloading_place", "فرع / تنزيل بديل"],
                        ["product_name", "اسم المادة"],
                        ["cargo_type", "نوع الحمولة"],
                        ["destination_division", "الفرعية / وجهة التوجيه"],
                        ["customer_name", "العميل"],
                        ["rep_name", "اسم المندوب"],
                        ["rep_phone", "هاتف المندوب"],
                        ["vehicle_plate", "رقم لوحة السيارة"],
                        ["driver_name", "اسم السائق"],
                        ["driver_phone", "هاتف السائق"],
                      ].map(([field, label]) => (
                        <label key={field} className="space-y-1">
                          <span className="block text-xs font-bold text-gray-600">{label}</span>
                          <input value={editMyForm[field as keyof typeof editMyForm] as string}
                            onChange={e => setEditMyForm(f => {
                              const value = e.target.value;
                              if (field === "vehicle_plate") {
                                const selectedVehicle = vehicles.find(v => v.plate_number === value.trim());
                                return { ...f, vehicle_plate: value,
                                  driver_name: selectedVehicle?.driver_name || f.driver_name,
                                  driver_phone: selectedVehicle?.driver_phone || f.driver_phone };
                              }
                              if (field === "unloading_place" || field === "override_unloading_place") {
                                const destination = (field === "override_unloading_place" ? value : f.override_unloading_place) || (field === "unloading_place" ? value : f.unloading_place);
                                const match = routeWarehouses.find(w => w.name.trim().toLocaleLowerCase() === destination.trim().toLocaleLowerCase());
                                return { ...f, [field]: value, warehouse_id: match ? String(match.id) : "" };
                              }
                              return { ...f, [field]: value };
                            })}
                            dir={field.endsWith("phone") ? "ltr" : undefined}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none" />
                        </label>
                      ))}
                      <label className="space-y-1">
                        <span className="block text-xs font-bold text-gray-600">مستودع / فرعية</span>
                        <select value={editMyForm.warehouse_id}
                          onChange={e => {
                            const warehouse = routeWarehouses.find(w => String(w.id) === e.target.value);
                            setEditMyForm(f => ({
                              ...f,
                              warehouse_id: e.target.value,
                              ...(warehouse ? { destination_division: warehouse.name } : {}),
                            }));
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none">
                          <option value="">بدون تغيير مستودع</option>
                          {routeWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs font-bold text-gray-600">نوع العميل</span>
                        <select value={editMyForm.customer_type} onChange={e => setEditMyForm(f => ({ ...f, customer_type: e.target.value }))}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none">
                          <option value="rental">خارجي / إيجار</option>
                          <option value="company">تابع للشركة</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs font-bold text-gray-600">نوع التوجيه</span>
                        <select value={editMyForm.route_type} onChange={e => setEditMyForm(f => ({ ...f, route_type: e.target.value as "direct" | "via_fusahat" }))}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none">
                          <option value="direct">مباشر للسيارات</option>
                          <option value="via_fusahat">عبر الفسوحات</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs font-bold text-gray-600">البونص / مصروف السائق</span>
                        <input type="number" min="0" step="0.01" value={editMyForm.driver_expense}
                          onChange={e => setEditMyForm(f => ({ ...f, driver_expense: e.target.value }))}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none" />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs font-bold text-gray-600">الإيجار</span>
                        <input type="number" min="0" step="0.01" value={editMyForm.rental}
                          onChange={e => setEditMyForm(f => ({ ...f, rental: e.target.value }))}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none" />
                      </label>
                      <label className="space-y-1 sm:col-span-2">
                        <span className="block text-xs font-bold text-gray-600">استبدال صورة الفسح / PDF</span>
                        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf"
                          onChange={e => { setEditMyPermitFile(e.target.files?.[0] || null); setEditMyPermitError(""); }}
                          className="block w-full text-xs text-gray-600" />
                        {editMyTrip.permit_image_url && (
                          <a href={editMyTrip.permit_image_url} target="_blank" rel="noreferrer" className="inline-block pt-1 text-xs font-bold text-blue-700 underline">عرض ملف الفسح الحالي</a>
                        )}
                      </label>
                      <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <span className="block text-xs font-bold text-gray-600">ملاحظات</span>
                        <textarea rows={2} value={editMyForm.notes} onChange={e => setEditMyForm(f => ({ ...f, notes: e.target.value }))}
                          className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#103c68] focus:outline-none" />
                      </label>
                    </div>
                    {editMyPermitFile && <p className="text-xs text-gray-500">الملف الجديد: {editMyPermitFile.name}</p>}
                    {editMyPermitError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{editMyPermitError}</p>}
                  </div>
                  <div className="flex gap-2 border-t border-gray-100 p-4">
                    <button onClick={saveMyTrip} disabled={!!myTripsSaving}
                      className="flex-1 rounded-xl bg-[#103c68] py-2.5 text-sm font-bold text-white hover:bg-[#0d2f52] disabled:opacity-50">
                      {myTripsSaving === editMyTrip.id ? "جارٍ الحفظ…" : "حفظ التعديلات"}
                    </button>
                    <button onClick={() => setEditMyTrip(null)} disabled={!!myTripsSaving}
                      className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-50">إلغاء</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}
