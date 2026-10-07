import { useState, useRef } from "react";
import { MonthShortcuts } from "@/components/MonthShortcuts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Truck, AlertTriangle, FileText, BarChart3, CheckCircle, Clock,
  Plus, X, Upload, Eye, Wrench, MapPin, User, Activity, Shield,
  RefreshCw, Image, Calculator, Package, DollarSign, Save, Trash2, ShoppingBag, Pencil, Search, Download,
  TrendingUp, Users, Printer, Calendar, ChevronDown,
} from "lucide-react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { useRememberedState } from "@/hooks/useRememberedState";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FleetVehicle {
  id: number; plate_number: string; vehicle_type: string;
  status: string; driver_name: string; gps_device_id?: string | null;
  branch?: string | null; linked_trailer_number?: string | null;
  linked_teidara_id?: number | null; linked_teidara_ids?: string | null;
}
interface CompanyBranch {
  id: number;
  entity_name: string;
  is_default?: number;
}
interface ComplianceDoc {
  id: number; car_number: string; doc_type: string;
  start_date: string; end_date: string; image_url: string|null; notes: string|null;
  created_at: string; updated_at: string;
}
interface Breakdown {
  id: number; car_number: string; driver_name: string|null; driver_phone: string|null;
  operational_state: string|null; action_taken: string|null;
  description: string|null; photo_url: string|null; status: string;
  invoice_image_url: string|null; resolved_by: string|null;
  resolve_notes: string|null; resolved_at: string|null; created_at: string;
}
interface TripRow {
  id?: number; date: string; driver_name: string|null; trips_count: number|null;
  net_amount: number|null; distance_km: number|null; trip_state: string|null;
  payment_voucher: string|null; loading_card_no: string|null; vehicle_type: string|null;
  material_type: string|null; meter_ton: number|null; unit_price: number|null;
  return_value_no_vat: number|null; client_name: string|null; supplier: string|null;
  material_expense_diesel: number|null; work_value: number|null;
  destination: string|null; notes: string|null; cash_collection: number|null;
}
interface DriverDieselExpense {
  id: number;
  expense_date: string|null;
  driver_name: string|null;
  vehicle_plate: string|null;
  expense_type: string|null;
  description: string|null;
  order_number: string|null;
  amount: number|null;
  liters: number|null;
}
interface AnalyticsData {
  vehicle: FleetVehicle;
  trips: TripRow[];
  totalTrips: number; totalKm: number;
  driverHistory: {driver_name:string;trip_count:number;last_date:string}[];
  workshopJobs: {id:number;title:string;description:string;total_cost:number;parts_cost:number;status:string;invoice_target:string;job_type:string;created_at:string}[];
  fleetExpenses: {expense_type:string;amount:number;date:string;description:string}[];
  complianceDocs: ComplianceDoc[];
  breakdowns: Breakdown[];
  legacyBreakdowns: {id:number;breakdown_type:string;description:string|null;status:string;created_at:string;driver_name:string|null;operational_state:string|null;action_taken:string|null;invoice_image_url:string|null}[];
  orderStats: { total: number; delivered: number };
  purchaseInvoices: {id:number; serial_no:string|null; invoice_date:string|null; invoice_number:string|null; supplier_name:string|null; item_name:string|null; price_before_vat:number; quantity:number; price_after_vat:number; notes:string|null; imported_by:string|null; created_at:string}[];
  assignedDrivers: {id:number;driver_name:string;phone:string|null;branch:string;status:string;email:string|null}[];
  maintenanceLogs: {id:number; card_number:string|null; maintenance_date:string|null; maintenance_type:string|null; description:string|null; amount:number; driver_name:string|null; branch:string|null; entry_time:string|null; exit_time:string|null; exit_date:string|null; trailer_number:string|null}[];
  commonFaults: {fault_type:string; count:number}[];
  workshopVisits: number;
  totalPurchaseCost: number;
  costSummary: { warehouse: number; vehicle: number; direct: number; purchases: number; maintenance: number; total: number };
}
interface KmRate {
  id: number; vehicle_type: string; rate_per_km: number; multiplier: number; updated_at: string;
}
interface VehicleParts {
  workshopParts: {id:number;title:string;parts_used:string|null;parts_cost:number;total_cost:number;status:string;invoice_target:string;job_type:string;created_at:string}[];
  purchaseParts: {id:number;title:string;quantity:number;unit:string;estimated_cost:number;actual_cost:number;status:string;created_at:string}[];
  directExpenses: {id:number;title:string;amount:number;description:string;date:string}[];
  inventoryParts: {id:number;item_name:string;quantity:number;unit:string;cost_per_unit:number;total_cost:number;reason:string;reference_no:string|null;created_at:string;created_by:string|null}[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });
const toISO = (d: string | undefined | null): string => {
  if (!d) return "";
  const p = new Date(d);
  return isNaN(p.getTime()) ? "" : p.toISOString().slice(0, 10);
};
const fmtDate = (s: string|null) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

const DOC_TYPES = ["التأمين", "الفحص الدوري", "كرت التشغيل"] as const;
type DocType = typeof DOC_TYPES[number];

function docStatus(doc: ComplianceDoc|undefined): "valid"|"expiring"|"expired"|"missing" {
  if (!doc) return "missing";
  if (!doc.end_date) return "missing";
  const end = new Date(doc.end_date).getTime();
  const now = Date.now();
  const diff = (end - now) / (1000 * 60 * 60 * 24);
  if (diff < 0)  return "expired";
  if (diff < 30) return "expiring";
  return "valid";
}
const STATUS_CFG = {
  valid:   { bg:"bg-emerald-50",  border:"border-emerald-200", badge:"bg-emerald-100 text-emerald-800",  icon:CheckCircle, iconColor:"text-emerald-600", label:"ساري" },
  expiring:{ bg:"bg-amber-50",    border:"border-amber-200",   badge:"bg-amber-100 text-amber-800",      icon:Clock,       iconColor:"text-amber-600",   label:"ينتهي قريباً" },
  expired: { bg:"bg-red-50",      border:"border-red-200",     badge:"bg-red-100 text-red-800",          icon:AlertTriangle,iconColor:"text-red-600",    label:"منتهي" },
  missing: { bg:"bg-gray-50",     border:"border-gray-200",    badge:"bg-gray-100 text-gray-600",        icon:FileText,    iconColor:"text-gray-400",    label:"غير مرفوع" },
};

const TABS = [
  { key: "overview",    label: "نظرة عامة",    icon: BarChart3 },
  { key: "report",      label: "بيان السيارة", icon: FileText },
  { key: "docs",        label: "وثائق الامتثال", icon: Shield },
  { key: "breakdowns",  label: "الأعطال",       icon: AlertTriangle },
  { key: "expenses",    label: "المصاريف",      icon: DollarSign },
  { key: "purchases",   label: "المشتريات",     icon: ShoppingBag },
  { key: "parts",       label: "قطع الغيار",    icon: Package },
  { key: "history",     label: "سجل الرحلات",   icon: Activity },
  { key: "full-report", label: "تقرير PDF شامل", icon: Download },
] as const;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function VehicleDashboardAdmin() {
  const { token } = useAuth();
  const af = authFetch(token);
  const qc = useQueryClient();
  const { data: companyBranches = [] } = useQuery<CompanyBranch[]>({
    queryKey: ["company-settings"],
    queryFn: () => fetch("/api/company-settings").then(r => r.ok ? r.json() : []),
  });
  const companyBranchNames = companyBranches
    .map(branch => branch.entity_name?.trim())
    .filter((name): name is string => Boolean(name));
  const defaultCompanyBranch =
    companyBranches.find(branch => branch.is_default)?.entity_name?.trim() ||
    companyBranchNames[0] ||
    "";

  const [selectedPlate, setSelectedPlate] = useState("");
  const [tab, setTab] = useState<"overview"|"report"|"docs"|"breakdowns"|"expenses"|"purchases"|"parts"|"history"|"full-report">("overview");
  const [expandedDriver, setExpandedDriver] = useState<string|null>(null);
  const [docModal, setDocModal] = useState<{ open: boolean; type: string; existing?: ComplianceDoc; isCustom?: boolean }>({ open: false, type: "التأمين" });
  const [resolveModal, setResolveModal] = useState<{ open: boolean; bd: Breakdown|null }>({ open: false, bd: null });
  const [newBdModal, setNewBdModal] = useState(false);
  const [faultFilter, setFaultFilter] = useRememberedState<string|null>("admin-vehicle-dashboard-fault-filter", null);
  const [expandedRanking, setExpandedRanking] = useState<"breakdowns"|"expenses"|"revenue"|"orders"|null>(null);
  const _pm = (() => {
    const t = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const f = (d: Date) => `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    return { from: f(new Date(t.getFullYear(), t.getMonth()-1, 1)), to: f(new Date(t.getFullYear(), t.getMonth(), 0)) };
  })();
  const [reportFrom, setReportFrom] = useRememberedState("admin-vehicle-dashboard-report-from", _pm.from);
  const [reportTo, setReportTo] = useRememberedState("admin-vehicle-dashboard-report-to", _pm.to);
  const [globalFrom, setGlobalFrom]     = useRememberedState("admin-vehicle-dashboard-global-from", _pm.from);
  const [globalTo, setGlobalTo]         = useRememberedState("admin-vehicle-dashboard-global-to", _pm.to);
  const [globalVType, setGlobalVType]     = useRememberedState("admin-vehicle-dashboard-global-type", "");
  const [globalBranch, setGlobalBranch]   = useRememberedState("admin-vehicle-dashboard-global-branch", "");
  const [globalPlates, setGlobalPlates]   = useRememberedState<string[]>("admin-vehicle-dashboard-global-plates", []);
  const [globalTrailers, setGlobalTrailers] = useRememberedState<string[]>("admin-vehicle-dashboard-global-trailers", []);
  const [platesOpen, setPlatesOpen]       = useState(false);
  const [trailersOpen, setTrailersOpen]   = useState(false);
  const [fleetSection, setFleetSection]   = useRememberedState<"rankings"|"drivers"|"perf"|"vehicles"|"diesel">("admin-vehicle-dashboard-section", "rankings");

  const docImageRef   = useRef<HTMLInputElement>(null);
  const resolveImgRef = useRef<HTMLInputElement>(null);
  const bdPhotoRef    = useRef<HTMLInputElement>(null);

  const [docForm, setDocForm]     = useState({ start_date:"", end_date:"", notes:"", custom_type:"" });
  const [resolveForm, setResolveForm] = useState({ resolved_by:"", resolve_notes:"" });
  const [newBdForm, setNewBdForm] = useState({ driver_name:"", driver_phone:"", operational_state:"", action_taken:"", description:"" });
  const [addVehicleModal, setAddVehicleModal] = useState(false);
  const [addVehicleForm, setAddVehicleForm] = useState({ plate_number:"", vehicle_type:"شاحنة", driver_name:"", status:"available", notes:"", gps_device_id:"", branch:"" });
  const [addVehicleError, setAddVehicleError] = useState("");
  const [gpsEditPlate, setGpsEditPlate]       = useState<string|null>(null);
  const [gpsEditValue, setGpsEditValue]       = useState("");
  const [gpsLooking,   setGpsLooking]         = useState(false);
  const [gpsLookupRes, setGpsLookupRes]       = useState<{found:boolean;wialon_id?:string;name?:string;imei?:string|null;lat?:number|null;lng?:number|null}|null>(null);
  const [branchEditPlate, setBranchEditPlate] = useState<string|null>(null);
  const [branchEditValue, setBranchEditValue] = useState("");
  const [showBulkBranch, setShowBulkBranch] = useState(false);
  const [bulkBranchEdits, setBulkBranchEdits] = useState<Record<string,string>>({});

  // ── Trip filter state ──
  const [tripSearch, setTripSearch] = useRememberedState("admin-vehicle-dashboard-trips-search", "");
  const [tripDateFrom, setTripDateFrom] = useRememberedState("admin-vehicle-dashboard-trips-date-from", "");
  const [tripDateTo, setTripDateTo] = useRememberedState("admin-vehicle-dashboard-trips-date-to", "");
  const [tripDriverFilter, setTripDriverFilter] = useRememberedState("admin-vehicle-dashboard-trips-driver-filter", "");
  const [tripMaterialFilter, setTripMaterialFilter] = useRememberedState("admin-vehicle-dashboard-trips-material-filter", "");
  const [tripStateFilter, setTripStateFilter]       = useRememberedState("admin-vehicle-dashboard-trips-state-filter", "");
  const [tripSortDesc, setTripSortDesc]             = useRememberedState("admin-vehicle-dashboard-trips-sort-desc", true);

  const emptyTripForm = () => ({
    date: new Date().toLocaleDateString("en-CA"),
    driver_name: "", client_name: "", material_type: "", destination: "",
    trips_count: "1", unit_price: "", meter_ton: "", trip_state: "سطحة محملة",
    payment_voucher: "", loading_card_no: "", supplier: "",
    material_expense_diesel: "", work_value: "", notes: "",
    cash_collection: "", distance_km: "", return_value_no_vat: "",
  });
  const [addTripModal, setAddTripModal]           = useState(false);
  const [editTripRow, setEditTripRow]             = useState<TripRow|null>(null);
  const [tripForm, setTripForm]                   = useState(emptyTripForm());
  const [tripDeleteClicks, setTripDeleteClicks]   = useState<Record<number,number>>({});

  // ── Breakdown delete / edit state ──
  const [bdDeleteClicks, setBdDeleteClicks] = useState<Record<string, number>>({});
  const [editBdModal, setEditBdModal] = useState<{
    open: boolean; id: number; isLegacy: boolean;
    form: { driver_name:string; driver_phone:string; operational_state:string; action_taken:string; description:string; breakdown_type:string; status:string };
  }>({ open:false, id:0, isLegacy:false, form:{ driver_name:"", driver_phone:"", operational_state:"", action_taken:"", description:"", breakdown_type:"", status:"open" } });

  // ── Queries ──
  const { data: vehicles } = useQuery<FleetVehicle[]>({
    queryKey: ["fleet-vehicles-list"],
    queryFn: () => af("/fleet-vehicles-list"),
  });
  const {
    data: dieselLedger,
    isLoading: dieselLedgerLoading,
    isError: dieselLedgerError,
    refetch: refetchDieselLedger,
  } = useQuery<DriverDieselExpense[]>({
    queryKey: ["driver-diesel-ledger"],
    queryFn: () => af("/driver-expenses/diesel-ledger"),
    enabled: fleetSection === "diesel",
  });
  type TeidaraFilterOption = { id:number; teidara_number:string; category:string };
  const { data: trailerOptions } = useQuery<TeidaraFilterOption[]>({
    queryKey: ["teidarat-filter-options"],
    queryFn: () => af("/teidarat"),
  });
  const displayVehicles = (vehicles || []).filter(v => {
    if (globalBranch && (v.branch || "النقليات") !== globalBranch) return false;
    if (globalVType  && (v.vehicle_type || "") !== globalVType)   return false;
    if (globalPlates.length && !globalPlates.includes(v.plate_number)) return false;
    return true;
  });
  const visibleDieselLedger = (dieselLedger || []).filter(expense => {
    const date = (expense.expense_date || "").slice(0, 10);
    const plate = expense.vehicle_plate || "";
    const vehicle = (vehicles || []).find(item => item.plate_number === plate);
    if (globalFrom && date && date < globalFrom) return false;
    if (globalTo && date && date > globalTo) return false;
    if (globalPlates.length && !globalPlates.includes(plate)) return false;
    if (globalVType && vehicle?.vehicle_type !== globalVType) return false;
    if (globalBranch && (vehicle?.branch || "النقليات") !== globalBranch) return false;
    return true;
  });

  type RankEntry = { plate: string; value: number; asset_type: "vehicle" | "trailer" };
  type FleetRankings = {
    breakdowns: { most: RankEntry[]; least: RankEntry[] };
    expenses:   { most: RankEntry[]; least: RankEntry[] };
    revenue:    { most: RankEntry[]; least: RankEntry[] };
    orders:     { most: RankEntry[]; least: RankEntry[] };
  };
  const { data: rankings } = useQuery<FleetRankings>({
    queryKey: ["fleet-rankings", globalFrom, globalTo, globalVType, globalBranch, globalPlates.join(","), globalTrailers.join(",")],
    queryFn: () => {
      const p = new URLSearchParams();
      if (globalFrom)           p.set("from",   globalFrom);
      if (globalTo)             p.set("to",     globalTo);
      if (globalVType)          p.set("vtype",  globalVType);
      if (globalBranch)         p.set("branch", globalBranch);
      if (globalPlates.length)  p.set("plates", globalPlates.join(","));
      if (globalTrailers.length) p.set("trailers", globalTrailers.join(","));
      if (globalPlates.length || globalTrailers.length) p.set("asset_filter", "1");
      return af(`/fleet-rankings${p.toString() ? "?" + p.toString() : ""}`);
    },
  });

  const { data: analytics, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ["vehicle-analytics", selectedPlate, globalFrom, globalTo],
    queryFn: () => {
      const p = new URLSearchParams();
      if (globalFrom) p.set("from", globalFrom);
      if (globalTo)   p.set("to",   globalTo);
      return af(`/vehicle-analytics/${encodeURIComponent(selectedPlate)}${p.toString() ? "?" + p.toString() : ""}`);
    },
    enabled: !!selectedPlate,
  });

  const { data: kmRates, refetch: refetchKm } = useQuery<KmRate[]>({
    queryKey: ["km-rates"],
    queryFn: () => af("/km-rates"),
  });

  type FleetDriverRow = {
    driver_name: string; total_trips: number; total_revenue: number;
    total_work: number; total_diesel: number; vehicles_count: number;
    vehicles_list: string; first_date: string; last_date: string;
    assigned_vehicle: string|null; driver_status: string|null; phone: string|null;
  };
  const fleetDriversRef = useRef<HTMLDivElement>(null);
  const rankingsRef     = useRef<HTMLDivElement>(null);
  const vehiclesRef     = useRef<HTMLDivElement>(null);
  const perfDashRef     = useRef<HTMLDivElement>(null);

  const [perfPeriod, setPerfPeriod] = useState<"week"|"month"|"this_month"|"all">("all");
  const [perfSortBy, setPerfSortBy] = useRememberedState<"trips"|"revenue"|"breakdowns"|"plate">("admin-vehicle-dashboard-performance-sort", "revenue");

  type DrillKind = "expenses" | "breakdowns" | "revenue" | "orders";
  type DrillSource = { key:string; label:string; tab:string; total:number; count:number; notes:string|null };
  type PlateDetail = {
    plate:string; from:string; to:string;
    expenses:   { total:number; sources:DrillSource[] };
    breakdowns: { total:number; bd_events:{date:string;type:string}[]; ml_events:{date:string;type:string;amount:number}[] };
    revenue:    { total:number; sources:DrillSource[] };
  };
  const [drillDown, setDrillDown] = useState<{ plate:string; kind:DrillKind; asset_type?:"vehicle"|"trailer" } | null>(null);

  const perfDates = (() => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2,"0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const todayStr = fmt(today);
    if (perfPeriod === "week") {
      const w = new Date(today); w.setDate(today.getDate()-7);
      return { from: fmt(w), to: todayStr };
    }
    if (perfPeriod === "month") {
      // Previous calendar month (e.g. June if today is July)
      const firstDay = new Date(today.getFullYear(), today.getMonth()-1, 1);
      const lastDay  = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(firstDay), to: fmt(lastDay) };
    }
    if (perfPeriod === "this_month") {
      return { from: `${today.getFullYear()}-${pad(today.getMonth()+1)}-01`, to: todayStr };
    }
    return { from: "", to: "" };
  })();
  type PerfRow = {
    plate_number: string; vehicle_type: string|null; branch: string; status: string;
    trip_count: number; revenue: number; work_days: number;
    diesel_cost: number; driver_commission: number; net_daily_rev: number;
    driver_count: number; drivers: string|null;
    breakdown_count: number; top_breakdown_type: string|null;
    bd_events: {date:string;type:string;desc:string}[];
    diagnosis: string[];
    parts_count: number; parts_cost: number;
    purchases_count: number; purchases_cost: number;
  };
  const { data: perfData } = useQuery<PerfRow[]>({
    queryKey: ["vehicle-perf-dashboard", perfPeriod, perfDates.from, perfDates.to, globalFrom, globalTo, globalVType, globalBranch, globalPlates.join(",")],
    queryFn: () => {
      const p = new URLSearchParams();
      const dateFrom = globalFrom || perfDates.from;
      const dateTo   = globalTo   || perfDates.to;
      if (dateFrom)            p.set("from",   dateFrom);
      if (dateTo)              p.set("to",     dateTo);
      if (globalVType)         p.set("vtype",  globalVType);
      if (globalBranch)        p.set("branch", globalBranch);
      if (globalPlates.length) p.set("plates", globalPlates.join(","));
      return af(`/vehicle-perf-dashboard${p.toString() ? "?" + p.toString() : ""}`);
    },
  });

  const { data: drillDetail, isLoading: drillLoading } = useQuery<PlateDetail>({
    queryKey: ["vehicle-plate-detail", drillDown?.plate, drillDown?.asset_type, globalFrom, globalTo],
    queryFn: () => {
      const p = new URLSearchParams({ plate: drillDown!.plate });
      if (drillDown?.asset_type) p.set("asset_type", drillDown.asset_type);
      if (globalFrom) p.set("from", globalFrom);
      if (globalTo)   p.set("to",   globalTo);
      return af(`/vehicle-plate-detail?${p.toString()}`);
    },
    enabled: !!drillDown,
  });

  const { data: fleetDrivers } = useQuery<FleetDriverRow[]>({
    queryKey: ["fleet-driver-ranking", globalFrom, globalTo, globalVType, globalBranch, globalPlates.join(",")],
    queryFn: () => {
      const p = new URLSearchParams();
      if (globalFrom)           p.set("from",   globalFrom);
      if (globalTo)             p.set("to",     globalTo);
      if (globalVType)          p.set("vtype",  globalVType);
      if (globalBranch)         p.set("branch", globalBranch);
      if (globalPlates.length)  p.set("plates", globalPlates.join(","));
      return af(`/fleet-driver-ranking${p.toString() ? "?" + p.toString() : ""}`);
    },
    enabled: true,
  });

  type DriverVehicleRow = {
    plate: string; total_trips: number; total_revenue: number;
    total_work: number; first_date: string; last_date: string;
  };
  const { data: driverVehicles } = useQuery<DriverVehicleRow[]>({
    queryKey: ["driver-vehicles", expandedDriver],
    queryFn: () => af(`/driver-vehicles/${encodeURIComponent(expandedDriver!)}`),
    enabled: !!expandedDriver,
  });

  const { data: vehicleParts } = useQuery<VehicleParts>({
    queryKey: ["vehicle-parts", selectedPlate],
    queryFn: () => af(`/vehicle-parts/${encodeURIComponent(selectedPlate)}`),
    enabled: !!selectedPlate,
  });

  const [kmEditId, setKmEditId] = useState<number|null>(null);
  const [kmDraft, setKmDraft] = useState<{rate_per_km:string;multiplier:string}>({ rate_per_km:"", multiplier:"" });
  const [kmCalc, setKmCalc] = useState<{type:string;km:string;result:number|null}>({ type:"", km:"", result:null });

  const updateKmRate = useMutation({
    mutationFn: async ({ id, rate_per_km, multiplier }: {id:number;rate_per_km:number;multiplier:number}) => {
      const res = await af(`/km-rates/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ rate_per_km, multiplier }) });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => { refetchKm(); setKmEditId(null); },
  });

  // ── Mutations ──
  const saveDoc = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("car_number", selectedPlate);
      fd.append("doc_type",   docModal.isCustom ? (docForm.custom_type || docModal.type) : docModal.type);
      fd.append("start_date", docForm.start_date);
      fd.append("end_date",   docForm.end_date);
      fd.append("notes",      docForm.notes);
      if (docImageRef.current?.files?.[0]) fd.append("image", docImageRef.current.files[0]);
      const url    = docModal.existing ? `/vehicle-compliance/${docModal.existing.id}` : "/vehicle-compliance";
      const method = docModal.existing ? "PUT" : "POST";
      const res = await af(url, { method, body: fd });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicle-analytics", selectedPlate] }); setDocModal({ open:false, type:"التأمين" }); setDocForm({ start_date:"", end_date:"", notes:"", custom_type:"" }); },
  });

  const resolveBreakdown = useMutation({
    mutationFn: async (id: number) => {
      if (!resolveImgRef.current?.files?.[0]) throw new Error("فاتورة الإصلاح مطلوبة لإغلاق البلاغ");
      const fd = new FormData();
      fd.append("resolved_by",  resolveForm.resolved_by);
      fd.append("resolve_notes", resolveForm.resolve_notes);
      fd.append("invoice",      resolveImgRef.current.files[0]);
      const res = await af(`/vehicle-breakdowns/${id}/resolve`, { method:"PUT", body:fd });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicle-analytics", selectedPlate] }); setResolveModal({ open:false, bd:null }); setResolveForm({ resolved_by:"", resolve_notes:"" }); },
    onError: (e: Error) => alert(e.message),
  });

  const addBreakdown = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("car_number",       selectedPlate);
      fd.append("driver_name",      newBdForm.driver_name);
      fd.append("driver_phone",     newBdForm.driver_phone);
      fd.append("operational_state", newBdForm.operational_state);
      fd.append("action_taken",     newBdForm.action_taken);
      fd.append("description",      newBdForm.description);
      if (bdPhotoRef.current?.files?.[0]) fd.append("photo", bdPhotoRef.current.files[0]);
      const res = await af("/vehicle-breakdowns", { method:"POST", body:fd });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicle-analytics", selectedPlate] }); setNewBdModal(false); setNewBdForm({ driver_name:"", driver_phone:"", operational_state:"", action_taken:"", description:"" }); },
    onError: (e: Error) => alert(e.message),
  });

  const deleteBreakdown = useMutation({
    mutationFn: async ({ id, isLegacy }: { id:number; isLegacy:boolean }) => {
      const url = isLegacy ? `/legacy-breakdowns/${id}` : `/vehicle-breakdowns/${id}`;
      const res = await af(url, { method:"DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicle-analytics", selectedPlate] }); qc.invalidateQueries({ queryKey: ["fleet-rankings"] }); setBdDeleteClicks({}); },
    onError: (e: Error) => alert(e.message),
  });

  const editBreakdown = useMutation({
    mutationFn: async ({ id, isLegacy, form }: { id:number; isLegacy:boolean; form: typeof editBdModal.form }) => {
      const url = isLegacy ? `/legacy-breakdowns/${id}/edit` : `/vehicle-breakdowns/${id}/edit`;
      const res = await af(url, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicle-analytics", selectedPlate] }); setEditBdModal(s => ({...s, open:false})); },
    onError: (e: Error) => alert(e.message),
  });

  const handleBdDelete = (id: number, isLegacy: boolean) => {
    const key = `${isLegacy ? "L" : "N"}-${id}`;
    const clicks = (bdDeleteClicks[key] || 0) + 1;
    if (clicks >= 5) {
      deleteBreakdown.mutate({ id, isLegacy });
    } else {
      setBdDeleteClicks(prev => ({ ...prev, [key]: clicks }));
      setTimeout(() => setBdDeleteClicks(prev => { const n={...prev}; delete n[key]; return n; }), 4000);
    }
  };

  const addVehicle = useMutation({
    mutationFn: async () => {
      const res = await af("/fleet-vehicles", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(addVehicleForm) });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet-vehicles-list"] }); setAddVehicleModal(false); setAddVehicleError(""); setAddVehicleForm({ plate_number:"", vehicle_type:"شاحنة", driver_name:"", status:"available", notes:"", gps_device_id:"", branch:defaultCompanyBranch }); },
    onError: (e: Error) => setAddVehicleError(e.message),
  });

  const deleteVehicle = useMutation({
    mutationFn: async (plate: string) => {
      const res = await af(`/fleet-vehicles/${encodeURIComponent(plate)}`, { method:"DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: (_data, plate) => { qc.invalidateQueries({ queryKey: ["fleet-vehicles-list"] }); if (selectedPlate === plate) setSelectedPlate(""); },
    onError: (e: Error) => alert(e.message),
  });

  const updateGpsId = useMutation({
    mutationFn: async ({ plate, gps_device_id }: { plate: string; gps_device_id: string }) => {
      const res = await af(`/fleet-vehicles/${encodeURIComponent(plate)}/gps`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gps_device_id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet-vehicles-list"] }); setGpsEditPlate(null); setGpsEditValue(""); setGpsLookupRes(null); },
    onError: (e: Error) => alert(e.message),
  });

  const updateBranch = useMutation({
    mutationFn: async ({ plate, branch }: { plate: string; branch: string }) => {
      const res = await af(`/fleet-vehicles/${encodeURIComponent(plate)}/branch`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-vehicles-list"] });
      qc.invalidateQueries({ queryKey: ["vehicle-perf-dashboard"] });
      setBranchEditPlate(null); setBranchEditValue("");
    },
    onError: (e: Error) => alert(e.message),
  });

  const bulkUpdateBranches = useMutation({
    mutationFn: async (edits: Record<string,string>) => {
      const plates = Object.keys(edits);
      await Promise.all(plates.map(plate =>
        af(`/fleet-vehicles/${encodeURIComponent(plate)}/branch`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branch: edits[plate] }),
        })
      ));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-vehicles-list"] });
      qc.invalidateQueries({ queryKey: ["vehicle-perf-dashboard"] });
      setShowBulkBranch(false);
      setBulkBranchEdits({});
    },
    onError: (e: Error) => alert(e.message),
  });

  const invalidateTrips = () => qc.invalidateQueries({ queryKey: ["vehicle-analytics", selectedPlate] });

  const addTrip = useMutation({
    mutationFn: async (form: typeof tripForm) => {
      const res = await af("/trips", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, car_id: selectedPlate }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في الحفظ");
    },
    onSuccess: () => { invalidateTrips(); setAddTripModal(false); setTripForm(emptyTripForm()); },
    onError: (e: Error) => alert(e.message),
  });

  const updateTrip = useMutation({
    mutationFn: async ({ id, form }: { id: number; form: typeof tripForm }) => {
      const res = await af(`/trips/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في التحديث");
    },
    onSuccess: () => { invalidateTrips(); setEditTripRow(null); setTripForm(emptyTripForm()); },
    onError: (e: Error) => alert(e.message),
  });

  const deleteTrip = useMutation({
    mutationFn: async (id: number) => {
      const res = await af(`/trips/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "خطأ في الحذف");
    },
    onSuccess: () => { invalidateTrips(); setTripDeleteClicks({}); },
    onError: (e: Error) => alert(e.message),
  });

  const handleTripDelete = (id: number) => {
    const clicks = (tripDeleteClicks[id] || 0) + 1;
    if (clicks >= 3) {
      deleteTrip.mutate(id);
    } else {
      setTripDeleteClicks(prev => ({ ...prev, [id]: clicks }));
      setTimeout(() => setTripDeleteClicks(prev => { const n = { ...prev }; delete n[id]; return n; }), 3000);
    }
  };

  const openEditTrip = (t: TripRow) => {
    setTripForm({
      date:                   t.date || "",
      driver_name:            t.driver_name || "",
      client_name:            t.client_name || "",
      material_type:          t.material_type || "",
      destination:            t.destination || "",
      trips_count:            String(t.trips_count ?? "1"),
      unit_price:             String(t.unit_price ?? ""),
      meter_ton:              String(t.meter_ton ?? ""),
      trip_state:             t.trip_state || "سطحة محملة",
      payment_voucher:        t.payment_voucher || "",
      loading_card_no:        t.loading_card_no || "",
      supplier:               t.supplier || "",
      material_expense_diesel:String(t.material_expense_diesel ?? ""),
      work_value:             String(t.work_value ?? ""),
      notes:                  t.notes || "",
      cash_collection:        String(t.cash_collection ?? ""),
      distance_km:            String(t.distance_km ?? ""),
      return_value_no_vat:    String(t.return_value_no_vat ?? ""),
    });
    setEditTripRow(t);
  };

  // ── Open doc modal pre-filled ──
  const openDocModal = (type: string, isCustom = false, existing?: ComplianceDoc) => {
    const found = existing ?? analytics?.complianceDocs.find(d => d.doc_type === type);
    setDocModal({ open: true, type, existing: found, isCustom });
    setDocForm({ start_date: found?.start_date||"", end_date: found?.end_date||"", notes: found?.notes||"", custom_type: isCustom ? type : "" });
  };

  // ─── Fleet PDF Report ─────────────────────────────────────────────────────
  const printFleetReport = () => {
    if (!perfData || perfData.length === 0) { alert("لا توجد بيانات لطباعتها"); return; }
    const win = window.open("", "_blank", "width=1100,height=850");
    if (!win) { alert("يرجى السماح بالنوافذ المنبثقة لطباعة التقرير"); return; }
    const now = new Date().toLocaleDateString("ar-SA", { year:"numeric", month:"long", day:"numeric" });
    const f  = (n: number) => n.toLocaleString("ar-SA", { style:"currency", currency:"SAR", maximumFractionDigits:0 });
    const filterDesc = [
      perfDates.from && perfDates.to ? `الفترة: ${perfDates.from} — ${perfDates.to}` : "",
      globalVType ? `نوع: ${globalVType}` : "",
      globalBranch ? `الفرع: ${globalBranch}` : "",
      globalPlates.length ? `سيارات محددة: ${globalPlates.join("، ")}` : "",
    ].filter(Boolean).join(" | ") || "كل الفترات";

    const totalTrips     = perfData.reduce((s,v)=>s+v.trip_count,0);
    const totalRev       = perfData.reduce((s,v)=>s+v.revenue,0);
    const totalBd        = perfData.reduce((s,v)=>s+v.breakdown_count,0);
    const totalPartsCost = perfData.reduce((s,v)=>s+(v.parts_cost||0),0);
    const totalPurchCost = perfData.reduce((s,v)=>s+(v.purchases_cost||0),0);
    const activeVehs     = perfData.filter(v=>v.trip_count>0).length;
    const zeroTrips      = perfData.filter(v=>v.trip_count===0).length;
    const heavyBd        = perfData.filter(v=>v.breakdown_count>=3).length;

    const diagPriority = (diag: string[]) => {
      if (diag.includes("breakdown_heavy")) return 0;
      if (diag.includes("breakdown"))       return 1;
      if (diag.includes("in_workshop"))     return 2;
      if (diag.includes("no_work"))         return 3;
      if (diag.includes("supervisor"))      return 4;
      if (diag.includes("low_efficiency"))  return 5;
      if (diag.includes("driver_churn"))    return 6;
      return 9;
    };
    const diagLabel = (d: string) => ({
      breakdown_heavy:"أعطال متكررة", breakdown:"عطل", in_workshop:"في الورشة",
      no_work:"مفيش شغل", supervisor:"مشرف مش بيوجه", low_efficiency:"كفاءة منخفضة", driver_churn:"تغيير سائقين",
    }[d] || d);

    const sorted = [...perfData].sort((a,b) => diagPriority(a.diagnosis) - diagPriority(b.diagnosis));

    const vehicleRows = sorted.map((v) => {
      const hasProblem = v.diagnosis.length > 0 && !(v.diagnosis.length===1&&v.diagnosis[0]==="");
      const isHeavy = v.breakdown_count >= 3;
      const rowColor = isHeavy ? "#fff1f2" : v.diagnosis.includes("no_work") ? "#fffbeb" : v.trip_count===0&&v.status==="maintenance" ? "#f5f3ff" : "white";
      const bdEventsList = v.bd_events.slice(0,3).map(e=>`<div style="font-size:10px;color:#92400e">⚠ ${e.type} — ${e.date}${e.desc?` (${e.desc.slice(0,25)})`:"" }</div>`).join("");
      const netDaily = v.net_daily_rev > 0 ? `<span style="color:#0f766e;font-weight:700">${v.net_daily_rev.toLocaleString("ar-SA")}﷼</span>` : `<span style="color:#d1d5db">—</span>`;
      const partsCost = (v.parts_count||0) > 0 ? `<span style="color:#d97706;font-weight:700">${(v.parts_cost||0)>0?f(v.parts_cost):"—"}</span><br/><span style="font-size:9px;color:#9ca3af">${v.parts_count} قطعة</span>` : `<span style="color:#d1d5db">—</span>`;
      const purchCost = (v.purchases_count||0) > 0 ? `<span style="color:#7c3aed;font-weight:700">${(v.purchases_cost||0)>0?f(v.purchases_cost):"—"}</span><br/><span style="font-size:9px;color:#9ca3af">${v.purchases_count} فاتورة</span>` : `<span style="color:#d1d5db">—</span>`;
      return `<tr style="background:${rowColor};border-bottom:1px solid #e5e7eb">
        <td style="padding:5px 8px;font-weight:700;font-family:monospace;color:#1d4ed8">${v.plate_number}</td>
        <td style="padding:5px 8px;color:#6b7280;font-size:11px">${v.vehicle_type||"—"}</td>
        <td style="padding:5px 8px;color:#6b7280;font-size:11px">${v.branch||"—"}</td>
        <td style="padding:5px 8px;text-align:center;font-weight:700;color:${v.trip_count===0?"#d1d5db":"#1d4ed8"}">${v.trip_count.toLocaleString("ar-SA")}</td>
        <td style="padding:5px 8px;text-align:center;color:#059669;font-weight:600">${v.revenue>0?f(v.revenue):"—"}</td>
        <td style="padding:5px 8px;text-align:center;color:#7c3aed">${v.work_days||0}</td>
        <td style="padding:5px 8px;text-align:center">${netDaily}</td>
        <td style="padding:5px 8px;text-align:center;font-size:10px;color:#e11d48">${v.diesel_cost>0?f(v.diesel_cost):"—"}<br/>${v.driver_commission>0?`<span style="color:#7c3aed">${f(v.driver_commission)}</span>`:""}</td>
        <td style="padding:5px 8px;text-align:center;font-weight:700;color:${v.breakdown_count===0?"#d1d5db":isHeavy?"#dc2626":"#f97316"}">${v.breakdown_count}</td>
        <td style="padding:5px 8px;min-width:100px">${bdEventsList||`<span style="color:#d1d5db;font-size:10px">—</span>`}</td>
        <td style="padding:5px 8px;text-align:center">${partsCost}</td>
        <td style="padding:5px 8px;text-align:center">${purchCost}</td>
        <td style="padding:5px 8px;font-size:11px">${v.drivers||"—"}</td>
        <td style="padding:5px 8px">${hasProblem ? v.diagnosis.map(d=>`<span style="background:#fee2e2;color:#b91c1c;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:2px">${diagLabel(d)}</span>`).join("") : `<span style="background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">✓ كفاءة</span>`}</td>
      </tr>`;
    }).join("");

    const shortcomingVehicles = sorted.filter(v=>v.diagnosis.includes("breakdown_heavy")||v.diagnosis.includes("no_work")||v.diagnosis.includes("in_workshop"));

    // ── Driver shortcomings ──
    const topDriverRows = (fleetDrivers||[]).slice(0,8).map((d,i) => `
      <tr style="border-bottom:1px solid #ffe4e6">
        <td style="padding:5px 8px;color:#6b7280">${i+1}</td>
        <td style="padding:5px 8px;font-weight:700">${d.driver_name}</td>
        <td style="padding:5px 8px;text-align:center;font-weight:700;color:#1d4ed8">${(d.total_trips||0).toLocaleString("ar-SA")}</td>
        <td style="padding:5px 8px;color:#059669">${f(d.total_revenue||0)}</td>
        <td style="padding:5px 8px;font-size:11px;color:#6b7280">${d.vehicles_list||"—"}</td>
        <td style="padding:5px 8px;text-align:center">${d.vehicles_count}</td>
        <td style="padding:5px 8px;font-size:11px;color:${d.assigned_vehicle?"#7c3aed":"#9ca3af"}">${d.assigned_vehicle||"غير معين"}</td>
      </tr>`).join("");

    // ── Text recommendations ──
    const recs: string[] = [];
    const heavyVehicles = sorted.filter(v=>v.diagnosis.includes("breakdown_heavy"));
    if (heavyVehicles.length > 0) {
      recs.push(`🔴 <b>أعطال متكررة (${heavyVehicles.length} سيارة):</b> السيارات [${heavyVehicles.map(v=>v.plate_number).join("، ")}] سجّلت ${heavyVehicles.reduce((s,v)=>s+v.breakdown_count,0)} عطلاً — يُوصى بفحص شامل وتقييم تكلفة الإصلاح مقارنة بالإحلال.`);
    }
    const noWorkVehicles = sorted.filter(v=>v.diagnosis.includes("no_work") && !v.diagnosis.includes("in_workshop") && !v.diagnosis.includes("breakdown_heavy"));
    if (noWorkVehicles.length > 0) {
      recs.push(`🟡 <b>سيارات بدون رحلات (${noWorkVehicles.length} سيارة):</b> [${noWorkVehicles.map(v=>v.plate_number).join("، ")}] — يجب التحقق من سبب التوقف: هل هو قرار المشرف أم غياب السائق أم عطل غير مُسجَّل؟`);
    }
    const workshopVehicles = sorted.filter(v=>v.diagnosis.includes("in_workshop"));
    if (workshopVehicles.length > 0) {
      recs.push(`🟠 <b>سيارات في الورشة (${workshopVehicles.length} سيارة):</b> [${workshopVehicles.map(v=>v.plate_number).join("، ")}] — يُوصى بتحديد مدة الإصلاح المتوقعة وتقرير حالة يومي من مدير الورشة.`);
    }
    const churnVehicles = sorted.filter(v=>v.diagnosis.includes("driver_churn"));
    if (churnVehicles.length > 0) {
      recs.push(`🔵 <b>تغيير سائقين متكرر (${churnVehicles.length} سيارة):</b> [${churnVehicles.map(v=>v.plate_number).join("، ")}] — عدم استقرار السائق يؤثر على الأداء. يُوصى بتعيين سائق ثابت لكل سيارة وتفعيل نظام المساءلة.`);
    }
    if (fleetDrivers && fleetDrivers.length > 0) {
      const multiVehicleDrivers = fleetDrivers.filter(d=>d.vehicles_count>2);
      if (multiVehicleDrivers.length > 0) {
        recs.push(`🟣 <b>سائقون متعددو السيارات (${multiVehicleDrivers.length}):</b> [${multiVehicleDrivers.map(d=>`${d.driver_name} (${d.vehicles_count} سيارات)`).join("، ")}] — قد يدل على نقص في القوى العاملة أو عدم وجود تكليف رسمي. يُوصى بمراجعة هيكل التكليف.`);
      }
    }
    const supervisorFlaggedVehicles = sorted.filter(v=>v.diagnosis.includes("supervisor"));
    if (supervisorFlaggedVehicles.length > 0) {
      recs.push(`⚠️ <b>تقصير محتمل من المشرف (${supervisorFlaggedVehicles.length} سيارة):</b> [${supervisorFlaggedVehicles.map(v=>v.plate_number).join("، ")}] — السيارات متاحة لكن غير موجهة لرحلات. يُوصى بمراجعة مع المشرف المسؤول وتفعيل آلية التوجيه اليومي.`);
    }
    if (recs.length === 0) {
      recs.push("✅ <b>الأسطول يعمل بكفاءة جيدة</b> في الفترة المحددة. لا توجد مشكلات جوهرية تستوجب إجراءً فورياً. يُوصى بالمتابعة الدورية والحفاظ على مستوى الأداء الحالي.");
    }

    // ── Overall health score ──
    const healthScore = Math.max(0, 100 - (heavyBd * 10) - (zeroTrips * 5) - (workshopVehicles.length * 3));
    const healthColor = healthScore >= 75 ? "#059669" : healthScore >= 50 ? "#d97706" : "#dc2626";
    const healthLabel = healthScore >= 75 ? "جيد" : healthScore >= 50 ? "متوسط" : "يحتاج تدخل";

    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>تقرير الأسطول الشامل</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:13px;color:#1f2937;background:#fff;padding:20px 24px;direction:rtl}
  .header{background:linear-gradient(135deg,#1e3a8a,#1d4ed8);color:white;padding:20px 24px;border-radius:12px;margin-bottom:20px}
  .title{font-size:22px;font-weight:900;margin-bottom:4px}
  .subtitle{font-size:12px;opacity:.8}
  .filter-badge{background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:11px;display:inline-block;margin-top:8px}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
  .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center}
  .kpi-val{font-size:20px;font-weight:900;line-height:1.2}
  .kpi-lbl{font-size:10px;color:#6b7280;margin-top:2px}
  .section{margin-bottom:20px}
  .sec-title{font-size:13px;font-weight:800;color:#1e3a8a;padding:8px 12px;background:#eff6ff;border-right:3px solid #2563eb;border-radius:6px;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  thead{background:#f1f5f9}
  th{padding:7px 8px;text-align:right;font-weight:700;color:#374151;border-bottom:2px solid #e5e7eb}
  td{padding:5px 8px;vertical-align:middle}
  .health-bar{background:#f1f5f9;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:16px;margin-bottom:20px}
  .rec-box{background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:8px;font-size:12px;line-height:1.8}
  .rec-box b{color:#1e3a8a}
  .total-row td{font-weight:800;background:#f1f5f9;border-top:2px solid #d1d5db}
  @media print{body{padding:10px}}
</style></head><body>
<div class="header">
  <div class="title">📊 تقرير الأسطول الشامل</div>
  <div class="subtitle">تاريخ الطباعة: ${now}</div>
  <div class="filter-badge">🗓 ${filterDesc}</div>
</div>

<div class="health-bar">
  <div style="font-size:11px;color:#6b7280;font-weight:700">صحة الأسطول:</div>
  <div style="flex:1;background:#e5e7eb;border-radius:20px;height:12px;overflow:hidden">
    <div style="width:${healthScore}%;background:${healthColor};height:100%;border-radius:20px;transition:width .3s"></div>
  </div>
  <div style="font-size:18px;font-weight:900;color:${healthColor}">${healthScore}%</div>
  <div style="font-size:12px;font-weight:700;color:${healthColor}">${healthLabel}</div>
</div>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val" style="color:#1d4ed8">${perfData.length}</div><div class="kpi-lbl">إجمالي السيارات</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#059669">${activeVehs}</div><div class="kpi-lbl">سيارات نشطة</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#7c3aed">${totalTrips.toLocaleString("ar-SA")}</div><div class="kpi-lbl">إجمالي الردود</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#047857;font-size:14px">${f(totalRev)}</div><div class="kpi-lbl">إجمالي الإيراد</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${totalBd>10?"#dc2626":"#d97706"}">${totalBd}</div><div class="kpi-lbl">إجمالي الأعطال</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${zeroTrips>3?"#dc2626":"#6b7280"}">${zeroTrips}</div><div class="kpi-lbl">سيارات بدون رحلات</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#d97706;font-size:14px">${f(totalPartsCost)}</div><div class="kpi-lbl">قطع الغيار</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#7c3aed;font-size:14px">${f(totalPurchCost)}</div><div class="kpi-lbl">المشتريات</div></div>
</div>

<div class="section">
  <div class="sec-title">🚛 أداء جميع السيارات (${sorted.length} سيارة — مرتبة حسب الأولوية)</div>
  <table>
    <thead><tr>
      <th>اللوحة</th><th>النوع</th><th>الفرع</th><th>الردود</th><th>الإيراد الإجمالي</th><th>أيام العمل</th><th>صافي/يوم</th><th>ديزل / مصوف</th><th>الأعطال</th><th>تفاصيل الأعطال</th><th>قطع الغيار</th><th>المشتريات</th><th>السائقون</th><th>التشخيص</th>
    </tr></thead>
    <tbody>${vehicleRows}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="3">الإجمالي</td>
      <td style="text-align:center">${totalTrips.toLocaleString("ar-SA")}</td>
      <td>${f(totalRev)}</td>
      <td></td>
      <td></td>
      <td style="font-size:10px;color:#e11d48">${f(perfData.reduce((s,v)=>s+(v.diesel_cost||0)+(v.driver_commission||0),0))}</td>
      <td style="text-align:center">${totalBd}</td>
      <td></td>
      <td style="color:#d97706">${f(totalPartsCost)}</td>
      <td style="color:#7c3aed">${f(totalPurchCost)}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>
</div>

${topDriverRows ? `<div class="section">
  <div class="sec-title">👤 أعلى السائقين ردوداً على مستوى الأسطول</div>
  <table>
    <thead><tr><th>#</th><th>السائق</th><th>الردود</th><th>الإيراد</th><th>السيارات</th><th>عدد السيارات</th><th>السيارة المعينة</th></tr></thead>
    <tbody>${topDriverRows}</tbody>
  </table>
</div>` : ""}

${(() => {
  const withParts = sorted.filter(v=>(v.parts_count||0)>0).sort((a,b)=>(b.parts_count||0)-(a.parts_count||0));
  if (withParts.length === 0) return "";
  const rows = withParts.map((v,i)=>`<tr style="border-bottom:1px solid #fef3c7">
    <td style="padding:5px 8px;color:#6b7280">${i+1}</td>
    <td style="padding:5px 8px;font-weight:700;color:#1d4ed8;font-family:monospace">${v.plate_number}</td>
    <td style="padding:5px 8px;color:#6b7280;font-size:11px">${v.vehicle_type||"—"}</td>
    <td style="padding:5px 8px;text-align:center">${(v.parts_count||0)} قطعة</td>
    <td style="padding:5px 8px;font-weight:700;color:#d97706">${(v.parts_cost||0)>0?f(v.parts_cost):"—"}</td>
    <td style="padding:5px 8px;color:#6b7280;font-size:11px">${v.top_breakdown_type||"—"}</td>
  </tr>`).join("");
  const totalPartsQty = withParts.reduce((s,v)=>s+(v.parts_count||0),0);
  return `<div class="section">
  <div class="sec-title">🔧 قطع الغيار حسب السيارة (${withParts.length} سيارة — ${totalPartsQty} قطعة${totalPartsCost>0?` — إجمالي: ${f(totalPartsCost)}`:""})</div>
  <table>
    <thead><tr><th>#</th><th>اللوحة</th><th>النوع</th><th>عدد القطع</th><th>تكلفة القطع</th><th>أبرز عطل</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row"><td colspan="3">الإجمالي</td><td style="text-align:center">${totalPartsQty} قطعة</td><td style="color:#d97706">${totalPartsCost>0?f(totalPartsCost):"—"}</td><td></td></tr></tfoot>
  </table>
</div>`;
})()}

${(() => {
  const withPurch = sorted.filter(v=>(v.purchases_count||0)>0).sort((a,b)=>(b.purchases_cost||0)-(a.purchases_cost||0));
  if (withPurch.length === 0) return "";
  const rows = withPurch.map((v,i)=>`<tr style="border-bottom:1px solid #f3e8ff">
    <td style="padding:5px 8px;color:#6b7280">${i+1}</td>
    <td style="padding:5px 8px;font-weight:700;color:#1d4ed8;font-family:monospace">${v.plate_number}</td>
    <td style="padding:5px 8px;color:#6b7280;font-size:11px">${v.vehicle_type||"—"}</td>
    <td style="padding:5px 8px;text-align:center">${(v.purchases_count||0)} فاتورة</td>
    <td style="padding:5px 8px;font-weight:700;color:#7c3aed">${(v.purchases_cost||0)>0?f(v.purchases_cost):"—"}</td>
  </tr>`).join("");
  return `<div class="section">
  <div class="sec-title">🛍️ فواتير المشتريات حسب السيارة (${withPurch.length} سيارة — إجمالي: ${totalPurchCost>0?f(totalPurchCost):"—"})</div>
  <table>
    <thead><tr><th>#</th><th>اللوحة</th><th>النوع</th><th>عدد الفواتير</th><th>إجمالي المشتريات</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row"><td colspan="4">الإجمالي</td><td style="color:#7c3aed">${totalPurchCost>0?f(totalPurchCost):"—"}</td></tr></tfoot>
  </table>
</div>`;
})()}

${shortcomingVehicles.length > 0 ? `<div class="section">
  <div class="sec-title">⚠️ السيارات ذات المشكلات الجوهرية (${shortcomingVehicles.length})</div>
  <table>
    <thead><tr><th>اللوحة</th><th>النوع</th><th>الأعطال</th><th>أكثر عطل</th><th>السائق الأخير</th><th>التشخيص</th><th>التوصية الفورية</th></tr></thead>
    <tbody>${shortcomingVehicles.map(v=>{
      const immediateAction = v.diagnosis.includes("breakdown_heavy") ? "فحص شامل وتقرير من الورشة خلال 48 ساعة"
        : v.diagnosis.includes("in_workshop") ? "متابعة يومية مع مدير الورشة لتحديد وقت الانتهاء"
        : v.diagnosis.includes("no_work") ? "مراجعة المشرف وتحديد سبب التوقف"
        : "مراجعة حالة السيارة والسائق";
      return `<tr style="border-bottom:1px solid #fecaca;background:#fff7f7">
        <td style="font-weight:800;color:#dc2626;font-family:monospace">${v.plate_number}</td>
        <td style="color:#6b7280;font-size:11px">${v.vehicle_type||"—"}</td>
        <td style="text-align:center;font-weight:700;color:#dc2626">${v.breakdown_count}</td>
        <td style="color:#92400e;font-size:11px">${v.top_breakdown_type||"—"}</td>
        <td style="font-size:11px">${v.drivers||"—"}</td>
        <td>${v.diagnosis.map(d=>`<span style="background:#fee2e2;color:#b91c1c;border-radius:3px;padding:1px 5px;font-size:10px">${diagLabel(d)}</span>`).join(" ")}</td>
        <td style="color:#1d4ed8;font-size:11px;font-weight:600">${immediateAction}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>
</div>` : ""}

<div class="section">
  <div class="sec-title">📝 التقرير النصي والتوصيات</div>
  ${recs.map(r=>`<div class="rec-box">${r}</div>`).join("")}
  <div class="rec-box" style="background:#eff6ff;border-color:#bfdbfe;margin-top:12px">
    <b>📌 خلاصة تنفيذية:</b><br>
    الأسطول يضم <b>${perfData.length} سيارة</b> — نشط: <b>${activeVehs}</b> | متوقف: <b>${zeroTrips}</b> | أعطال متكررة: <b>${heavyBd}</b><br>
    إجمالي الردود: <b>${totalTrips.toLocaleString("ar-SA")}</b> | الإيراد المقدّر: <b>${f(totalRev)}</b><br>
    قطع الغيار: <b style="color:#d97706">${f(totalPartsCost)}</b> | المشتريات: <b style="color:#7c3aed">${f(totalPurchCost)}</b><br>
    صحة الأسطول: <b style="color:${healthColor}">${healthScore}% — ${healthLabel}</b>
  </div>
</div>

<div style="text-align:center;color:#9ca3af;font-size:10px;margin-top:16px;border-top:1px solid #e5e7eb;padding-top:10px">
  تقرير تحليلات الأسطول — MKGH — ${now}
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`);
    win.document.close();
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-l from-blue-900 to-blue-800 text-white px-4 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <BarChart3 size={22} />
            </div>
            <div>
              <h1 className="text-lg font-black">تحليلات الأسطول</h1>
              <p className="text-xs text-blue-200">تحليل السيارات والتيدارات</p>
            </div>
          </div>
          {selectedPlate && (
            <button onClick={() => refetch()} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
              <RefreshCw size={13} />تحديث
            </button>
          )}
        </div>
        <div className="max-w-5xl mx-auto flex items-center gap-2 flex-wrap mt-4">
          {([
            { key: "rankings", label: "تصنيف الأسطول",      icon: BarChart3,  activeClass: "bg-white text-blue-800 shadow-sm",       inactiveClass: "bg-white/10 hover:bg-white/20 text-white" },
            { key: "drivers",  label: "أكثر السائقين ردوداً", icon: TrendingUp, activeClass: "bg-rose-400 text-white shadow-sm",         inactiveClass: "bg-rose-500/60 hover:bg-rose-500/80 text-white" },
            { key: "perf",     label: "داش بورد الأداء",      icon: Activity,   activeClass: "bg-amber-400 text-white shadow-sm",         inactiveClass: "bg-amber-500/60 hover:bg-amber-500/80 text-white" },
            { key: "vehicles", label: "جميع السيارات",        icon: Truck,      activeClass: "bg-white text-blue-800 shadow-sm",       inactiveClass: "bg-white/10 hover:bg-white/20 text-white" },
            { key: "diesel",   label: "ديزل السيارات",        icon: DollarSign, activeClass: "bg-amber-400 text-white shadow-sm",         inactiveClass: "bg-amber-500/60 hover:bg-amber-500/80 text-white" },
          ] as const).map(({ key, label, icon: Icon, activeClass, inactiveClass }) => (
            <button key={key}
              onClick={() => {
                setFleetSection(key);
                if (key === "diesel") setSelectedPlate("");
                if (key !== "rankings") {
                  setGlobalTrailers([]);
                  setTrailersOpen(false);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap border ${
                fleetSection === key ? activeClass + " border-white/40" : inactiveClass + " border-transparent"
              }`}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">

        {/* ── Global Filters ── */}
        {(() => {
          const allPlatesList = (vehicles || []).map(v => v.plate_number);
          const linkedIds = (value: string | null | undefined): number[] => {
            try {
              const parsed: unknown = JSON.parse(value || "[]");
              return Array.isArray(parsed) ? parsed.map(Number).filter(id => Number.isInteger(id) && id > 0) : [];
            } catch {
              return [];
            }
          };
          const allTrailerList = [...new Set((trailerOptions || [])
            .filter(t => t.teidara_number?.trim())
            .filter(t => {
              const owner = (vehicles || []).find(v =>
                v.linked_trailer_number?.trim() === t.teidara_number?.trim() ||
                Number(v.linked_teidara_id) === t.id ||
                linkedIds(v.linked_teidara_ids).includes(t.id)
              );
              if (globalBranch && (owner?.branch || "النقليات") !== globalBranch) return false;
              if (globalVType && (owner?.vehicle_type || "") !== globalVType) return false;
              return true;
            })
            .map(t => t.teidara_number!.trim()))];
          const vtypesList    = [...new Set((vehicles || []).map(v => v.vehicle_type).filter(Boolean))] as string[];
          const branchesList  = companyBranchNames;
          const anyFilter     = !!(globalFrom || globalTo || globalVType || globalBranch || globalPlates.length || globalTrailers.length);
          const togglePlate   = (p: string) =>
            setGlobalPlates(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
          const toggleTrailer = (number: string) =>
            setGlobalTrailers(prev => prev.includes(number) ? prev.filter(x => x !== number) : [...prev, number]);
          const clearAll = () => {
            setGlobalFrom(""); setGlobalTo(""); setGlobalVType(""); setGlobalBranch(""); setGlobalPlates([]);
            setGlobalTrailers([]); setPlatesOpen(false); setTrailersOpen(false);
          };
          return (
            <div className="bg-white rounded-2xl border border-blue-100 shadow-sm px-4 py-3 space-y-3">
              {/* Row 1: Date range */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-blue-700 font-bold text-sm">
                  <Calendar size={15} className="text-blue-500" />
                  الفترة:
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 font-medium">من</label>
                  <input type="date" value={globalFrom} onChange={e => setGlobalFrom(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 font-medium">إلى</label>
                  <input type="date" value={globalTo} onChange={e => setGlobalTo(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <MonthShortcuts onSelect={(f, t) => { setGlobalFrom(f); setGlobalTo(t); }} />
              </div>

              {/* Row 2: Branch + Vehicle type + plates */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-blue-700 font-bold text-sm">
                  <Truck size={15} className="text-blue-500" />
                  الأصول:
                </div>

                {/* Branch select */}
                <select
                  value={globalBranch}
                  onChange={e => { setGlobalBranch(e.target.value); setGlobalPlates([]); setGlobalTrailers([]); }}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                >
                  <option value="">كل الجهات</option>
                  {branchesList.map(b => <option key={b} value={b}>{b}</option>)}
                </select>

                {/* Vehicle type select */}
                {vtypesList.length > 0 && (
                  <select
                    value={globalVType}
                    onChange={e => { setGlobalVType(e.target.value); setGlobalPlates([]); setGlobalTrailers([]); }}
                    className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  >
                    <option value="">كل الأنواع</option>
                    {vtypesList.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}

                {/* Plates multi-select dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setPlatesOpen(o => !o)}
                    className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                      globalPlates.length
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Truck size={13} />
                    {globalPlates.length ? `${globalPlates.length} سيارة` : "اختر سيارات"}
                    <ChevronDown size={12} className={`transition-transform ${platesOpen ? "rotate-180" : ""}`} />
                  </button>
                  {platesOpen && (
                    <div className="absolute top-full mt-1 right-0 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl min-w-[200px] max-h-60 overflow-y-auto">
                      <div className="px-3 py-2 border-b border-gray-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-600">اختيار السيارات</span>
                        <button onClick={() => setGlobalPlates([])} className="text-[10px] text-red-500 hover:text-red-700">إلغاء الكل</button>
                      </div>
                      {(globalVType
                        ? allPlatesList.filter(p => (vehicles||[]).find(v => v.plate_number===p)?.vehicle_type === globalVType)
                        : allPlatesList
                      ).map(p => (
                        <label key={p} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={globalPlates.includes(p)}
                            onChange={() => togglePlate(p)}
                            className="accent-blue-600"
                          />
                          <span className="font-mono text-gray-700">{p}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {fleetSection === "rankings" && (
                  <div className="relative">
                    <button
                      onClick={() => setTrailersOpen(open => !open)}
                      className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                        globalTrailers.length
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Truck size={13} />
                      {globalTrailers.length ? `${globalTrailers.length} تيدر` : "اختر تيدارات"}
                      <ChevronDown size={12} className={`transition-transform ${trailersOpen ? "rotate-180" : ""}`} />
                    </button>
                    {trailersOpen && (
                      <div className="absolute top-full mt-1 right-0 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl min-w-[200px] max-h-60 overflow-y-auto">
                        <div className="px-3 py-2 border-b border-gray-100 flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-600">اختيار التيدارات</span>
                          <button onClick={() => setGlobalTrailers([])} className="text-[10px] text-red-500 hover:text-red-700">إلغاء الكل</button>
                        </div>
                        {allTrailerList.map(number => (
                          <label key={number} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={globalTrailers.includes(number)}
                              onChange={() => toggleTrailer(number)}
                              className="accent-amber-600"
                            />
                            <span className="font-mono text-gray-700">{number}</span>
                          </label>
                        ))}
                        {allTrailerList.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">لا توجد تيدارات مسجلة</p>}
                      </div>
                    )}
                  </div>
                )}

                {anyFilter && (
                  <button onClick={clearAll}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-medium transition-colors">
                    <X size={12} />مسح الكل
                  </button>
                )}
              </div>

              {/* Active filter badges */}
              {anyFilter && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {(globalFrom || globalTo) && (
                    <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2.5 py-0.5 font-medium">
                      {globalFrom && globalTo ? `${globalFrom} — ${globalTo}` : globalFrom ? `من ${globalFrom}` : `حتى ${globalTo}`}
                    </span>
                  )}
                  {globalBranch && (
                    <span className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2.5 py-0.5 font-medium flex items-center gap-1">
                      فرع: {globalBranch}
                      <button onClick={() => setGlobalBranch("")}><X size={10} /></button>
                    </span>
                  )}
                  {globalVType && (
                    <span className="text-[11px] bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2.5 py-0.5 font-medium flex items-center gap-1">
                      {globalVType}
                      <button onClick={() => setGlobalVType("")}><X size={10} /></button>
                    </span>
                  )}
                  {globalPlates.map(p => (
                    <span key={p} className="text-[11px] bg-green-50 text-green-700 border border-green-100 rounded-full px-2.5 py-0.5 font-medium flex items-center gap-1">
                      {p}
                      <button onClick={() => setGlobalPlates(prev => prev.filter(x => x !== p))}><X size={10} /></button>
                    </span>
                  ))}
                  {globalTrailers.map(number => (
                    <span key={`trailer-${number}`} className="text-[11px] bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-2.5 py-0.5 font-medium flex items-center gap-1">
                      تيدر: {number}
                      <button onClick={() => setGlobalTrailers(prev => prev.filter(x => x !== number))}><X size={10} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Fleet Rankings ── */}
        {fleetSection === "rankings" && rankings && (
          <div ref={rankingsRef} className="space-y-3">
            <h2 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
              <BarChart3 size={14} className="text-blue-600" />تصنيف الأسطول
              {(globalFrom || globalTo || globalVType || globalPlates.length > 0 || globalTrailers.length > 0) && (
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">مفلتر</span>
              )}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

              {/* ── أعطال ── */}
              {(() => {
                const { most = [], least = [] } = rankings.breakdowns ?? {};
                const isExp = expandedRanking === "breakdowns";
                const topList = isExp ? most : most.slice(0, 3);
                const botList = isExp ? [] : least.slice(0, 3);
                return (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <button onClick={() => setExpandedRanking(isExp ? null : "breakdowns")}
                      className="w-full bg-red-50 border-b border-red-100 px-4 py-2.5 flex items-center justify-between hover:bg-red-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={13} className="text-red-500" />
                        <span className="text-xs font-bold text-red-800">الأعطال</span>
                        {isExp && <span className="text-[10px] bg-red-200 text-red-700 px-1.5 py-0.5 rounded-full">كل الأصول</span>}
                      </div>
                      <span className="text-[10px] text-red-400">{isExp ? "▲ طيّ" : "▼ الكل"}</span>
                    </button>
                    <div className="p-3 space-y-1">
                      {topList.length > 0 && <>
                        <div className="text-[10px] text-red-500 font-bold uppercase tracking-wide mb-1">{isExp ? "مرتبة من الأكثر أعطالاً" : "الأكثر أعطالاً"}</div>
                        {topList.map((r, i) => (
                          <div key={`${r.asset_type}:${r.plate}`} className="w-full flex items-center justify-between bg-red-50 hover:bg-red-100 rounded-xl px-3 py-1.5 group cursor-pointer" onClick={() => setDrillDown({ plate: r.plate, kind: "breakdowns", asset_type: r.asset_type })}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-red-400 w-4">#{i+1}</span>
                              <span className="font-mono font-bold text-gray-800 text-sm group-hover:text-blue-600 group-hover:underline">{r.asset_type === "trailer" ? `تيدر ${r.plate}` : r.plate}</span>
                            </div>
                            <span className="text-xs font-bold text-red-600 bg-red-100 group-hover:bg-red-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              {r.value} عطل
                              <Search size={9} />
                            </span>
                          </div>
                        ))}
                      </>}
                      {botList.length > 0 && <>
                        <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide mt-2 mb-1">الأقل أعطالاً</div>
                        {botList.map((r, i) => (
                          <div key={`${r.asset_type}:${r.plate}`} className="w-full flex items-center justify-between bg-emerald-50 hover:bg-emerald-100 rounded-xl px-3 py-1.5 group cursor-pointer" onClick={() => setDrillDown({ plate: r.plate, kind: "breakdowns", asset_type: r.asset_type })}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-emerald-400 w-4">#{i+1}</span>
                              <span className="font-mono font-bold text-gray-800 text-sm group-hover:text-blue-600 group-hover:underline">{r.asset_type === "trailer" ? `تيدر ${r.plate}` : r.plate}</span>
                            </div>
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-100 group-hover:bg-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              {r.value} عطل
                              <Search size={9} />
                            </span>
                          </div>
                        ))}
                      </>}
                    </div>
                  </div>
                );
              })()}

              {/* ── مصاريف ── */}
              {(() => {
                const { most = [], least = [] } = rankings.expenses ?? {};
                const isExp = expandedRanking === "expenses";
                const topList = isExp ? most : most.slice(0, 3);
                const botList = isExp ? [] : least.slice(0, 3);
                return (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <button onClick={() => setExpandedRanking(isExp ? null : "expenses")}
                      className="w-full bg-orange-50 border-b border-orange-100 px-4 py-2.5 flex items-center justify-between hover:bg-orange-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <DollarSign size={13} className="text-orange-500" />
                        <span className="text-xs font-bold text-orange-800">المصاريف</span>
                        {isExp && <span className="text-[10px] bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded-full">كل الأصول</span>}
                      </div>
                      <span className="text-[10px] text-orange-400">{isExp ? "▲ طيّ" : "▼ الكل"}</span>
                    </button>
                    <div className="p-3 space-y-1">
                      {topList.length > 0 && <>
                        <div className="text-[10px] text-orange-500 font-bold uppercase tracking-wide mb-1">{isExp ? "مرتبة من الأعلى مصاريف" : "الأعلى مصاريف"}</div>
                        {topList.map((r, i) => (
                          <div key={`${r.asset_type}:${r.plate}`} className="w-full flex items-center justify-between bg-orange-50 hover:bg-orange-100 rounded-xl px-3 py-1.5 group cursor-pointer" onClick={() => setDrillDown({ plate: r.plate, kind: "expenses", asset_type: r.asset_type })}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-orange-400 w-4">#{i+1}</span>
                              <span className="font-mono font-bold text-gray-800 text-sm group-hover:text-blue-600 group-hover:underline">{r.asset_type === "trailer" ? `تيدر ${r.plate}` : r.plate}</span>
                            </div>
                            <span className="text-xs font-bold text-orange-600 bg-orange-100 group-hover:bg-orange-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              {fmt(r.value)}
                              <Search size={9} />
                            </span>
                          </div>
                        ))}
                      </>}
                      {botList.length > 0 && <>
                        <div className="text-[10px] text-blue-500 font-bold uppercase tracking-wide mt-2 mb-1">الأقل مصاريف</div>
                        {botList.map((r, i) => (
                          <div key={`${r.asset_type}:${r.plate}`} className="w-full flex items-center justify-between bg-blue-50 hover:bg-blue-100 rounded-xl px-3 py-1.5 group cursor-pointer" onClick={() => setDrillDown({ plate: r.plate, kind: "expenses", asset_type: r.asset_type })}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-blue-400 w-4">#{i+1}</span>
                              <span className="font-mono font-bold text-gray-800 text-sm group-hover:text-blue-600 group-hover:underline">{r.asset_type === "trailer" ? `تيدر ${r.plate}` : r.plate}</span>
                            </div>
                            <span className="text-xs font-bold text-blue-600 bg-blue-100 group-hover:bg-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              {fmt(r.value)}
                              <Search size={9} />
                            </span>
                          </div>
                        ))}
                      </>}
                    </div>
                  </div>
                );
              })()}

              {/* ── إيراد ── */}
              {(() => {
                const { most = [], least = [] } = rankings.revenue ?? {};
                const isExp = expandedRanking === "revenue";
                const topList = isExp ? most : most.slice(0, 3);
                const botList = isExp ? [] : least.slice(0, 3);
                return (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <button onClick={() => setExpandedRanking(isExp ? null : "revenue")}
                      className="w-full bg-emerald-50 border-b border-emerald-100 px-4 py-2.5 flex items-center justify-between hover:bg-emerald-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <Calculator size={13} className="text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-800">الإيراد</span>
                        {isExp && <span className="text-[10px] bg-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded-full">كل الأصول</span>}
                      </div>
                      <span className="text-[10px] text-emerald-400">{isExp ? "▲ طيّ" : "▼ الكل"}</span>
                    </button>
                    <div className="p-3 space-y-1">
                      {topList.length > 0 ? <>
                        <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide mb-1">{isExp ? "مرتبة من الأعلى إيراداً" : "الأعلى إيراداً"}</div>
                        {topList.map((r, i) => (
                          <div key={`${r.asset_type}:${r.plate}`} className="w-full flex items-center justify-between bg-emerald-50 hover:bg-emerald-100 rounded-xl px-3 py-1.5 group cursor-pointer" onClick={() => setDrillDown({ plate: r.plate, kind: "revenue", asset_type: r.asset_type })}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-emerald-400 w-4">#{i+1}</span>
                              <span className="font-mono font-bold text-gray-800 text-sm group-hover:text-blue-600 group-hover:underline">{r.asset_type === "trailer" ? `تيدر ${r.plate}` : r.plate}</span>
                            </div>
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 group-hover:bg-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              {fmt(r.value)}
                              <Search size={9} />
                            </span>
                          </div>
                        ))}
                        {botList.length > 0 && <>
                          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-2 mb-1">الأقل إيراداً</div>
                          {botList.map((r, i) => (
                            <div key={`${r.asset_type}:${r.plate}`} className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-1.5 group cursor-pointer" onClick={() => setDrillDown({ plate: r.plate, kind: "revenue", asset_type: r.asset_type })}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-gray-400 w-4">#{i+1}</span>
                                <span className="font-mono font-bold text-gray-800 text-sm group-hover:text-blue-600 group-hover:underline">{r.asset_type === "trailer" ? `تيدر ${r.plate}` : r.plate}</span>
                              </div>
                              <span className="text-xs font-bold text-gray-600 bg-gray-100 group-hover:bg-gray-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                {fmt(r.value)}
                                <Search size={9} />
                              </span>
                            </div>
                          ))}
                        </>}
                      </> : (
                        <div className="text-center py-4 text-gray-300 text-xs">لا توجد بيانات إيراد بعد</div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── عدد الردود ── */}
              {(() => {
                const { most = [], least = [] } = rankings.orders ?? {};
                const isExp = expandedRanking === "orders";
                const topList = isExp ? most : most.slice(0, 3);
                const botList = isExp ? [] : least.slice(0, 3);
                return (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <button onClick={() => setExpandedRanking(isExp ? null : "orders")}
                      className="w-full bg-indigo-50 border-b border-indigo-100 px-4 py-2.5 flex items-center justify-between hover:bg-indigo-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <Package size={13} className="text-indigo-500" />
                        <span className="text-xs font-bold text-indigo-800">الردود</span>
                        {isExp && <span className="text-[10px] bg-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded-full">كل الأصول</span>}
                      </div>
                      <span className="text-[10px] text-indigo-400">{isExp ? "▲ طيّ" : "▼ الكل"}</span>
                    </button>
                    <div className="p-3 space-y-1">
                      {topList.length > 0 ? <>
                        <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide mb-1">{isExp ? "مرتبة من الأكثر ردوداً" : "الأكثر ردوداً"}</div>
                        {topList.map((r, i) => (
                          <div key={`${r.asset_type}:${r.plate}`} className="w-full flex items-center justify-between bg-indigo-50 hover:bg-indigo-100 rounded-xl px-3 py-1.5 group cursor-pointer" onClick={() => setDrillDown({ plate: r.plate, kind: "orders", asset_type: r.asset_type })}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-indigo-400 w-4">#{i+1}</span>
                              <span className="font-mono font-bold text-gray-800 text-sm group-hover:text-blue-600 group-hover:underline">{r.asset_type === "trailer" ? `تيدر ${r.plate}` : r.plate}</span>
                            </div>
                            <span className="text-xs font-bold text-indigo-700 bg-indigo-100 group-hover:bg-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              {r.value} رد
                              <Search size={9} />
                            </span>
                          </div>
                        ))}
                        {botList.length > 0 && <>
                          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-2 mb-1">الأقل ردوداً</div>
                          {botList.map((r, i) => (
                            <div key={`${r.asset_type}:${r.plate}`} className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-1.5 group cursor-pointer" onClick={() => setDrillDown({ plate: r.plate, kind: "orders", asset_type: r.asset_type })}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-gray-400 w-4">#{i+1}</span>
                                <span className="font-mono font-bold text-gray-800 text-sm group-hover:text-blue-600 group-hover:underline">{r.asset_type === "trailer" ? `تيدر ${r.plate}` : r.plate}</span>
                              </div>
                              <span className="text-xs font-bold text-gray-600 bg-gray-100 group-hover:bg-gray-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                {r.value} رد
                                <Search size={9} />
                              </span>
                            </div>
                          ))}
                        </>}
                      </> : (
                        <div className="text-center py-4 text-gray-300 text-xs">لا توجد ردود بعد</div>
                      )}
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
        )}

        {/* ── Fleet Drivers Ranking ── */}
        {fleetSection === "drivers" && fleetDrivers && fleetDrivers.length > 0 && (
          <div ref={fleetDriversRef} className="bg-white rounded-2xl border border-rose-100 shadow-sm overflow-hidden">
            <div className="bg-rose-50 border-b border-rose-100 px-4 py-3 flex items-center gap-2">
              <TrendingUp size={15} className="text-rose-600" />
              <span className="text-sm font-black text-rose-800">أكثر السائقين ردوداً على مستوى الأسطول</span>
              <span className="text-xs bg-rose-200 text-rose-700 px-2 py-0.5 rounded-full font-bold">{fleetDrivers.length} سائق</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-rose-50/60">
                  <tr>
                    {["#","السائق","فترة العمل","إجمالي الردود","قيمة الرد","شغل اليد","عدد السيارات","السيارات"].map(h=>(
                      <th key={h} className="px-3 py-2 text-right text-xs font-bold text-rose-800 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fleetDrivers.map((d,i)=>(
                    <tr key={d.driver_name} className={`border-t border-gray-100 ${d.assigned_vehicle?"bg-rose-50/40 border-r-2 border-r-rose-400":i%2===0?"bg-white":"bg-rose-50/20"} hover:bg-rose-50/60`}>
                      <td className="px-3 py-2 text-gray-400 text-xs font-bold">
                        {i===0?"🏆":i===1?"🥈":i===2?"🥉":i+1}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold">{d.driver_name.trim()}</span>
                          {d.assigned_vehicle && (
                            <span className="bg-rose-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5 whitespace-nowrap">معين</span>
                          )}
                          {d.driver_status && (
                            <span className={`text-xs font-medium rounded-full px-1.5 py-0.5 whitespace-nowrap ${d.driver_status==="نشط"||d.driver_status==="في رحلة"?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500"}`}>
                              {d.driver_status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {d.first_date ? (
                          <div className="text-xs space-y-0.5">
                            <div className="flex items-center gap-1 text-gray-500">
                              <span className="text-[10px] font-medium text-gray-400">من</span>
                              <span className="font-semibold text-gray-700 font-mono">{fmtDate(d.first_date)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-500">
                              <span className="text-[10px] font-medium text-gray-400">إلى</span>
                              <span className="font-semibold text-gray-700 font-mono">{fmtDate(d.last_date||d.first_date)}</span>
                            </div>
                            {(() => {
                              const days = Math.round((new Date(d.last_date||d.first_date).getTime() - new Date(d.first_date).getTime()) / 86400000) + 1;
                              return (
                                <span className={`inline-block text-[10px] font-bold rounded-full px-1.5 py-0.5 ${days<=30?"bg-blue-50 text-blue-600":days<=90?"bg-amber-50 text-amber-600":"bg-rose-50 text-rose-600"}`}>
                                  {days} يوم
                                </span>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-black text-blue-700 text-base">{(d.total_trips||0).toLocaleString("ar-SA")}</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">{fmt(d.total_revenue||0)}</td>
                      <td className="px-3 py-2 text-purple-700">{fmt(d.total_work||0)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 text-xs font-bold">{d.vehicles_count}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(d.vehicles_list||"").split(",").filter(Boolean).slice(0,5).map((p:string)=>(
                            <span key={p} onClick={()=>{ setSelectedPlate(p.trim()); setTab("overview"); }}
                              className={`cursor-pointer text-xs rounded-lg px-2 py-0.5 font-semibold border transition-colors ${p.trim()===d.assigned_vehicle?"ring-1 ring-rose-400":""} ${p.trim()===selectedPlate?"bg-rose-600 text-white border-rose-600":"bg-white border-rose-200 text-rose-700 hover:bg-rose-50"}`}>
                              {p.trim()}
                              {p.trim()===d.assigned_vehicle && <span className="mr-1 text-xs opacity-75">●</span>}
                            </span>
                          ))}
                          {(d.vehicles_list||"").split(",").filter(Boolean).length > 5 && (
                            <span className="text-xs text-gray-400">+{(d.vehicles_list||"").split(",").filter(Boolean).length-5}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {fleetSection === "perf" && (
        <div ref={perfDashRef}>
          {/* Header + period selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
              <Activity size={15} className="text-amber-500" />
              داش بورد أداء السيارات
              {perfData && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {perfData.length} سيارة
                </span>
              )}
            </h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Quick period buttons */}
              {(["week","month","this_month","all"] as const).map(p => (
                <button key={p} onClick={() => setPerfPeriod(p)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors border ${
                    perfPeriod === p
                      ? "bg-amber-500 text-white border-amber-500 shadow"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-amber-50"
                  }`}>
                  {p === "week" ? "آخر أسبوع" : p === "month" ? "الشهر الماضي" : p === "this_month" ? "الشهر الجاري" : "الكل"}
                </button>
              ))}
              {/* Sort */}
              <select value={perfSortBy} onChange={e => setPerfSortBy(e.target.value as typeof perfSortBy)}
                className="border border-gray-200 rounded-lg text-[11px] px-2 py-1 bg-white text-gray-700 font-medium">
                <option value="revenue">ترتيب: الإيراد</option>
                <option value="trips">ترتيب: الردود</option>
                <option value="breakdowns">ترتيب: الأعطال</option>
                <option value="plate">ترتيب: اللوحة</option>
              </select>
              <button
                onClick={printFleetReport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition-colors shadow-sm whitespace-nowrap">
                <Printer size={12} />تقرير PDF شامل
              </button>
            </div>
          </div>

          {/* Period label */}
          {perfDates.from && (
            <p className="text-[10px] text-gray-400 mb-3 flex items-center gap-1">
              <Calendar size={10} />
              {perfDates.from} — {perfDates.to}
            </p>
          )}

          {/* Stats summary bar */}
          {perfData && perfData.length > 0 && (() => {
            const totalTrips = perfData.reduce((s,v)=>s+v.trip_count,0);
            const totalRev   = perfData.reduce((s,v)=>s+v.revenue,0);
            const zeroTrips  = perfData.filter(v=>v.trip_count===0).length;
            const hasBdCount = perfData.filter(v=>v.breakdown_count>0).length;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-2">
                  <TrendingUp size={13} className="text-blue-500 shrink-0" />
                  <div>
                    <div className="text-sm font-black text-blue-700">{totalTrips.toLocaleString("ar-SA")}</div>
                    <div className="text-[10px] text-gray-500">إجمالي الردود</div>
                  </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-2">
                  <DollarSign size={13} className="text-emerald-500 shrink-0" />
                  <div>
                    <div className="text-sm font-black text-emerald-700">{fmt(totalRev)}</div>
                    <div className="text-[10px] text-gray-500">إجمالي الإيراد</div>
                  </div>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-2">
                  <AlertTriangle size={13} className="text-red-500 shrink-0" />
                  <div>
                    <div className="text-sm font-black text-red-700">{hasBdCount} / {perfData.length}</div>
                    <div className="text-[10px] text-gray-500">سيارات بأعطال</div>
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-2">
                  <Clock size={13} className="text-amber-500 shrink-0" />
                  <div>
                    <div className="text-sm font-black text-amber-700">{zeroTrips} / {perfData.length}</div>
                    <div className="text-[10px] text-gray-500">سيارات صفر ردود</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Cards grid */}
          {perfData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {[...perfData]
                .sort((a,b) => {
                  if (perfSortBy === "trips")      return b.trip_count - a.trip_count;
                  if (perfSortBy === "breakdowns") return b.breakdown_count - a.breakdown_count;
                  if (perfSortBy === "plate")      return a.plate_number.localeCompare(b.plate_number, "ar");
                  return b.revenue - a.revenue;
                })
                .map(v => {
                  const hasBd   = v.breakdown_count > 0;
                  const noTrips = v.trip_count === 0;
                  const isInWs  = v.status === "maintenance";
                  const diagMap: Record<string,{label:string;bg:string;text:string}> = {
                    breakdown_heavy: { label:"أعطال متكررة",      bg:"bg-red-100",    text:"text-red-700" },
                    breakdown:       { label:"عطل",                bg:"bg-orange-100", text:"text-orange-700" },
                    in_workshop:     { label:"في الورشة",          bg:"bg-purple-100", text:"text-purple-700" },
                    no_work:         { label:"مفيش شغل",           bg:"bg-gray-100",   text:"text-gray-600" },
                    supervisor:      { label:"مشرف مش بيوجه",      bg:"bg-amber-100",  text:"text-amber-700" },
                    low_efficiency:  { label:"كفاءة منخفضة",       bg:"bg-yellow-100", text:"text-yellow-700" },
                    driver_churn:    { label:"تغيير سائقين",        bg:"bg-indigo-100", text:"text-indigo-700" },
                  };
                  const cardBorder = hasBd && v.breakdown_count >= 3
                    ? "border-red-300"
                    : hasBd
                    ? "border-orange-200"
                    : noTrips && !isInWs
                    ? "border-amber-200"
                    : isInWs
                    ? "border-purple-200"
                    : v.trip_count > 0
                    ? "border-emerald-200"
                    : "border-gray-200";

                  return (
                    <div key={v.plate_number}
                      className={`bg-white rounded-2xl border ${cardBorder} shadow-sm overflow-hidden hover:shadow-md transition-shadow`}>
                      {/* Card header */}
                      <div className={`px-4 py-2.5 flex items-center justify-between ${
                        hasBd && v.breakdown_count >= 3 ? "bg-red-50" :
                        hasBd ? "bg-orange-50" :
                        noTrips && !isInWs ? "bg-amber-50" :
                        isInWs ? "bg-purple-50" :
                        v.trip_count > 0 ? "bg-emerald-50" : "bg-gray-50"
                      }`}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setDrillDown({ plate: v.plate_number, kind: "revenue" })}
                            className="text-sm font-black text-gray-800 hover:text-blue-600 transition-colors flex items-center gap-1.5">
                            <Truck size={13} className="text-gray-400" />
                            {v.plate_number}
                          </button>
                          <button
                            onClick={() => { setSelectedPlate(v.plate_number); setTab("overview"); window.scrollTo({top:0,behavior:"smooth"}); }}
                            title="عرض التقرير الشامل"
                            className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors px-1 py-0.5 rounded hover:bg-white/60">
                            ↗
                          </button>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {v.vehicle_type && (
                            <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                              {v.vehicle_type}
                            </span>
                          )}
                          <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
                            {v.branch}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                            v.status==="maintenance" ? "bg-purple-100 text-purple-700" :
                            v.status==="in_use"      ? "bg-blue-100 text-blue-700" :
                                                       "bg-green-100 text-green-700"
                          }`}>
                            {v.status==="maintenance" ? "ورشة" : v.status==="in_use" ? "شغّال" : "متاح"}
                          </span>
                        </div>
                      </div>

                      {/* Metrics — 4 cells: trips / gross revenue / breakdowns / net daily */}
                      <div className="p-3 grid grid-cols-4 gap-1 text-center border-b border-gray-50">
                        <button onClick={() => setDrillDown({ plate: v.plate_number, kind: "revenue" })}
                          className="rounded-lg hover:bg-blue-50 transition-colors p-1">
                          <div className={`text-base font-black ${v.trip_count === 0 ? "text-gray-300" : "text-blue-700"}`}>
                            {v.trip_count.toLocaleString("ar-SA")}
                          </div>
                          <div className="text-[9px] text-gray-400">ردود</div>
                        </button>
                        <button onClick={() => setDrillDown({ plate: v.plate_number, kind: "revenue" })}
                          className="rounded-lg hover:bg-emerald-50 transition-colors p-1">
                          <div className={`text-[11px] font-black ${v.revenue === 0 ? "text-gray-300" : "text-emerald-700"}`}>
                            {v.revenue === 0 ? "—" : fmt(v.revenue)}
                          </div>
                          <div className="text-[9px] text-gray-400">إيراد إجمالي</div>
                        </button>
                        <button onClick={() => v.breakdown_count > 0 && setDrillDown({ plate: v.plate_number, kind: "breakdowns" })}
                          className={`rounded-lg transition-colors p-1 ${v.breakdown_count > 0 ? "hover:bg-red-50 cursor-pointer" : "cursor-default"}`}>
                          <div className={`text-base font-black ${v.breakdown_count === 0 ? "text-gray-200" : v.breakdown_count >= 3 ? "text-red-600" : "text-orange-500"}`}>
                            {v.breakdown_count}
                          </div>
                          <div className="text-[9px] text-gray-400">أعطال</div>
                        </button>
                        <button onClick={() => setDrillDown({ plate: v.plate_number, kind: "expenses" })}
                          className="rounded-lg hover:bg-teal-50 transition-colors p-1">
                          <div className={`text-[11px] font-black ${v.net_daily_rev <= 0 ? "text-gray-300" : v.net_daily_rev < 300 ? "text-orange-600" : "text-teal-700"}`}>
                            {v.net_daily_rev <= 0 ? "—" : `${v.net_daily_rev.toLocaleString("ar-SA")}﷼`}
                          </div>
                          <div className="text-[9px] text-gray-400" title={v.work_days > 0 ? `صافي إجمالي ÷ ${v.work_days} يوم عمل فعلي` : ""}>صافي/يوم عمل</div>
                        </button>
                      </div>

                      {/* Work days + driver + diesel info */}
                      <div className="px-3 py-1.5 flex items-center justify-between text-[10px] text-gray-400 border-b border-gray-50">
                        <span>{v.work_days > 0 ? `🗓 ${v.work_days} يوم عمل` : "لا رحلات"}</span>
                        <span title={v.drivers || undefined}>
                          {v.driver_count > 0
                            ? (() => {
                                const names = (v.drivers || "").split(",").map(n => n.trim()).filter(Boolean);
                                if (names.length === 0) return `👤 ${v.driver_count} سائق`;
                                if (names.length === 1) return `👤 ${names[0]}`;
                                return `👤 ${names[0]} و${names.length - 1} آخر`;
                              })()
                            : "—"}
                        </span>
                        {(v.diesel_cost > 0 || v.driver_commission > 0) && (
                          <button onClick={() => setDrillDown({ plate: v.plate_number, kind: "expenses" })}
                            className="text-rose-400 hover:text-rose-600 hover:underline transition-colors"
                            title={`ديزل: ${fmt(v.diesel_cost)} | مصوف: ${fmt(v.driver_commission)}`}>
                            ⛽ {fmt(v.diesel_cost + v.driver_commission)}
                          </button>
                        )}
                      </div>

                      {/* Parts + Purchases summary row */}
                      {((v.parts_count||0) > 0 || (v.purchases_count||0) > 0) && (
                        <div className="px-3 py-1.5 flex items-center gap-3 text-[10px] border-b border-gray-50">
                          {(v.parts_count||0) > 0 && (
                            <button onClick={() => { setSelectedPlate(v.plate_number); setTab("parts"); window.scrollTo({top:0,behavior:"smooth"}); }}
                              className="flex items-center gap-1 text-amber-600 hover:text-amber-800 hover:underline transition-colors"
                              title="قطع الغيار">
                              🔧 {v.parts_count} قطعة{(v.parts_cost||0)>0?` (${fmt(v.parts_cost)})`:""}
                            </button>
                          )}
                          {(v.purchases_count||0) > 0 && (
                            <button onClick={() => { setSelectedPlate(v.plate_number); setTab("purchases"); window.scrollTo({top:0,behavior:"smooth"}); }}
                              className="flex items-center gap-1 text-purple-600 hover:text-purple-800 hover:underline transition-colors"
                              title="المشتريات">
                              🛍️ {v.purchases_count} فاتورة{(v.purchases_cost||0)>0?` (${fmt(v.purchases_cost)})`:""}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Breakdown events list (top 3) */}
                      {v.bd_events.length > 0 && (
                        <div className="px-3 py-1.5 border-b border-gray-50 space-y-0.5">
                          {v.bd_events.slice(0,3).map((ev,i) => (
                            <div key={i} className="flex items-start gap-1.5 text-[10px]">
                              <span className="text-red-400 shrink-0">⚠</span>
                              <span className="font-semibold text-orange-700">{ev.type}</span>
                              <span className="text-gray-400 shrink-0">{ev.date}</span>
                              {ev.desc && <span className="text-gray-500 truncate" title={ev.desc}>— {ev.desc}</span>}
                            </div>
                          ))}
                          {v.bd_events.length > 3 && (
                            <div className="text-[10px] text-gray-400">+ {v.bd_events.length - 3} أعطال أخرى</div>
                          )}
                        </div>
                      )}

                      {/* Diagnostic badges */}
                      <div className="px-3 py-2 flex flex-wrap gap-1">
                        {v.diagnosis.length === 0 && v.trip_count > 0 ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">✓ شغّالة بكفاءة</span>
                        ) : v.diagnosis.map(d => {
                          const info = diagMap[d];
                          return info ? (
                            <span key={d} className={`text-[10px] ${info.bg} ${info.text} px-2 py-0.5 rounded-full font-bold`}>
                              {info.label}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {!perfData && (
            <div className="text-center py-10 text-gray-300 text-sm">جاري التحميل…</div>
          )}
        </div>
        )}

        {fleetSection === "diesel" && (
          <section className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4 sm:p-5 space-y-4">
            <div>
              <h2 className="text-base font-black text-gray-800 flex items-center gap-2">
                <DollarSign size={18} className="text-amber-600" />
                سجل ديزل السيارات
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                يعرض مصروفات الديزل المسجلة في كشوف السائقين فقط؛ لا ينشئ خصماً إضافياً ولا يغيّر صافي السيارة. الفلاتر أعلاه تنطبق على السجل.
              </p>
            </div>

            {dieselLedgerLoading ? (
              <div className="text-center py-10 text-gray-400 text-sm">جاري تحميل سجل الديزل…</div>
            ) : dieselLedgerError ? (
              <div className="text-center py-8 text-red-600 text-sm">
                <p>تعذّر تحميل سجل الديزل.</p>
                <button onClick={() => refetchDieselLedger()} className="mt-2 underline font-semibold">إعادة المحاولة</button>
              </div>
            ) : visibleDieselLedger.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">لا توجد مصروفات ديزل ضمن الفلاتر الحالية.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full min-w-[760px] text-right text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      {["التاريخ", "اسم السائق", "رقم السيارة", "النوع", "الوصف", "المبلغ"].map((heading) => (
                        <th key={heading} className="px-3 py-2.5 font-bold">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDieselLedger.map((expense, index) => (
                      <tr key={expense.id} className={`border-t border-gray-50 ${index % 2 === 1 ? "bg-gray-50/40" : ""}`}>
                        <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(expense.expense_date)}</td>
                        <td className="px-3 py-2.5">{expense.driver_name || "—"}</td>
                        <td className="px-3 py-2.5 font-mono">{expense.vehicle_plate || "—"}</td>
                        <td className="px-3 py-2.5">{expense.expense_type || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-500">{expense.description || expense.order_number || "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="font-black text-red-500">{fmt(Number(expense.amount) || 0)}</span>
                          {Number(expense.liters) > 0 && <span className="text-gray-400 text-[10px] mr-1">({expense.liters}ل)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── All Vehicles Grid ── */}
        {fleetSection === "vehicles" && vehicles && vehicles.length > 0 && (
          <div ref={vehiclesRef}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                <Truck size={15} className="text-blue-600" />
                {(globalBranch || globalVType || globalPlates.length)
                  ? `السيارات المفلترة (${displayVehicles.length} من ${vehicles.length})`
                  : `جميع السيارات (${vehicles.length})`}
              </h2>
              <div className="flex items-center gap-2">
                {selectedPlate && (
                  <button onClick={() => setSelectedPlate("")} className="text-xs text-gray-400 hover:text-gray-600 underline">
                    إلغاء التحديد
                  </button>
                )}
                <button
                  onClick={() => {
                    const initial: Record<string,string> = {};
                    (vehicles || []).forEach(v => {
                      initial[v.plate_number] =
                        v.branch && companyBranchNames.includes(v.branch) ? v.branch : "";
                    });
                    setBulkBranchEdits(initial);
                    setShowBulkBranch(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors">
                  🏢 تعيين الجهات
                </button>
                <button onClick={() => {
                  setAddVehicleError("");
                  setAddVehicleForm(form => ({ ...form, branch: defaultCompanyBranch }));
                  setAddVehicleModal(true);
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors">
                  <Plus size={12} />إضافة سيارة
                </button>
              </div>
            </div>
            {displayVehicles.length === 0 && (
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-10 text-center text-gray-400">
                <Truck size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="font-semibold text-sm">لا توجد سيارات في هذا الفرع</p>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayVehicles.map(v => {
                const isSelected = selectedPlate === v.plate_number;
                const statusMap: Record<string, { label: string; color: string; dot: string }> = {
                  available:   { label: "متاحة",     color: "bg-green-100 text-green-700 border-green-200",  dot: "bg-green-500"  },
                  busy:        { label: "مشغولة",    color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
                  maintenance: { label: "صيانة",     color: "bg-amber-100 text-amber-700 border-amber-200",  dot: "bg-amber-500"  },
                  broken:      { label: "عطل",       color: "bg-red-100 text-red-700 border-red-200",         dot: "bg-red-500"    },
                };
                const s = statusMap[v.status] ?? { label: v.status || "—", color: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" };
                return (
                  <div key={v.plate_number} className="relative group">
                    <button
                      onClick={() => { setSelectedPlate(v.plate_number); setTab("overview"); }}
                      className={`text-right rounded-2xl border-2 p-3 shadow-sm transition-all w-full ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 shadow-md"
                          : "border-gray-100 bg-white hover:border-blue-300 hover:shadow"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${s.color}`}>{s.label}</span>
                        <div className={`w-2.5 h-2.5 rounded-full ${s.dot} ${v.status === "busy" ? "animate-pulse" : ""}`} />
                      </div>
                      <div className="font-black text-gray-900 text-base font-mono leading-tight">{v.plate_number}</div>
                      <div className="text-xs text-gray-500 mt-1 truncate">{v.vehicle_type || "غير محدد"}</div>
                      {v.driver_name && (
                        <div className="text-[10px] text-blue-600 font-semibold mt-1 truncate">👤 {v.driver_name}</div>
                      )}
                      {v.gps_device_id && (
                        <div className="text-[10px] text-emerald-600 font-semibold mt-1 truncate">📡 GPS: {v.gps_device_id}</div>
                      )}
                      {v.branch && v.branch !== "النقليات" && (
                        <div className="text-[10px] text-indigo-600 font-semibold mt-1 truncate">🏢 {v.branch}</div>
                      )}
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setGpsEditPlate(v.plate_number);
                        setGpsEditValue(v.gps_device_id || "");
                      }}
                      className="absolute bottom-1.5 left-1.5 p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-500 hover:text-emerald-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      title="تعديل معرّف GPS"
                    >
                      <span className="text-[10px] font-bold">GPS</span>
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setBranchEditPlate(v.plate_number);
                        setBranchEditValue(v.branch || "النقليات");
                      }}
                      className="absolute bottom-1.5 left-9 p-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-500 hover:text-indigo-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      title="تعديل الجهة"
                    >
                      <span className="text-[10px] font-bold">جهة</span>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm(`حذف السيارة ${v.plate_number}؟ لا يمكن التراجع.`)) deleteVehicle.mutate(v.plate_number); }}
                      className="absolute top-1.5 left-1.5 p-1 bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      title="حذف السيارة"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {fleetSection === "vehicles" && !selectedPlate && vehicles && vehicles.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl py-6 text-center text-blue-500">
            <p className="font-semibold text-sm">اضغط على أي سيارة لعرض تحليلاتها التفصيلية</p>
          </div>
        )}

        {fleetSection === "vehicles" && !selectedPlate && (!vehicles || vehicles.length === 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
            <Truck size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-semibold">لا توجد سيارات مسجّلة بعد</p>
          </div>
        )}

        {selectedPlate && isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {selectedPlate && analytics && (
          <>
            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "إجمالي الرحلات", value: analytics.totalTrips, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "إجمالي الكيلومترات", value: `${analytics.totalKm.toLocaleString()} كم`, icon: MapPin, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "دخولات الورشة", value: analytics.workshopVisits||0, icon: Wrench, color: "text-orange-600", bg: "bg-orange-50" },
                { label: "أعطال مفتوحة", value: analytics.breakdowns.filter(b=>b.status==="open").length, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                  <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-2`}>
                    <Icon size={18} className={color} />
                  </div>
                  <div className="text-xl font-black text-gray-900">{value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Date range active indicator */}
            {(globalFrom || globalTo) && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-700">
                <Calendar size={13} className="text-blue-500 shrink-0" />
                <span className="font-semibold">الفترة المطبّقة:</span>
                <span className="font-mono">{globalFrom||"—"}</span>
                <span>←</span>
                <span className="font-mono">{globalTo||"—"}</span>
                <span className="text-blue-400 mr-1">— جميع بيانات السيارة مفلترة بهذه الفترة</span>
              </div>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-100 overflow-x-auto">
                {TABS.map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                      tab === key ? "border-blue-600 text-blue-700 bg-blue-50/50" : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}>
                    <Icon size={14} />{label}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {/* ── Overview ── */}
                {tab === "overview" && (
                  <div className="space-y-5">
                    {/* Vehicle info */}
                    <div className="flex flex-wrap gap-3 text-sm">
                      {[
                        ["رقم اللوحة", analytics.vehicle.plate_number],
                        ["النوع", analytics.vehicle.vehicle_type||"—"],
                        ["الحالة", analytics.vehicle.status||"—"],
                        ["السائق الحالي", analytics.vehicle.driver_name||"—"],
                      ].map(([k,v]) => (
                        <div key={k} className="bg-blue-50 rounded-xl px-4 py-2.5 border border-blue-100">
                          <span className="text-blue-500 text-xs block">{k}</span>
                          <span className="font-bold text-blue-900">{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Cost summary */}
                    <div>
                      <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                        ملخص التكاليف
                        <span className="text-xs text-gray-400 font-normal">(اضغط للانتقال)</span>
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {([
                          { label:"مصروف الورشة المباشر",   value: analytics.costSummary.maintenance||0, color:"orange", goto:"breakdowns" as const },
                          { label:"أوامر عمل الورشة",       value: analytics.costSummary.vehicle||0,     color:"blue",   goto:"history"   as const },
                          { label:"مصروفات الأسطول",        value: analytics.costSummary.direct||0,      color:"red",    goto:"history"   as const },
                          { label:"مشتريات الورشة",         value: analytics.costSummary.purchases||0,   color:"purple", goto:"purchases" as const },
                          { label:"الإجمالي الكلي",         value: analytics.costSummary.total||0,       color:"gray",   goto:null },
                        ] as const).map(({ label, value, color, goto }) => {
                          const cls = `rounded-xl p-3 border text-right w-full transition-all ${
                            color==="blue"  ?"bg-blue-50 border-blue-100 hover:bg-blue-100":
                            color==="orange"?"bg-orange-50 border-orange-100 hover:bg-orange-100":
                            color==="red"   ?"bg-red-50 border-red-100 hover:bg-red-100":
                            color==="purple"?"bg-purple-50 border-purple-100 hover:bg-purple-100":
                            "bg-gray-100 border-gray-200"
                          } ${goto ? "cursor-pointer" : "cursor-default"}`;
                          const inner = (
                            <>
                              <div className="text-xs text-gray-500 mb-1 flex items-center justify-between">
                                {label}
                                {goto && <span className="text-[10px] text-gray-400">←</span>}
                              </div>
                              <div className={`font-black text-sm ${value===0?"text-gray-400":"text-gray-900"}`}>{fmt(value)}</div>
                            </>
                          );
                          return goto ? (
                            <button key={label} className={cls} onClick={() => setTab(goto)}>{inner}</button>
                          ) : (
                            <div key={label} className={cls}>{inner}</div>
                          );
                        })}
                      </div>
                      {/* Head / Trailer breakdown for direct maintenance cost */}
                      {analytics.maintenanceLogs.length > 0 && (() => {
                        const headCost    = analytics.maintenanceLogs.filter(m => !m.trailer_number).reduce((s,m)=>s+(m.amount||0),0);
                        const trailerCost = analytics.maintenanceLogs.filter(m => !!m.trailer_number).reduce((s,m)=>s+(m.amount||0),0);
                        if (headCost === 0 && trailerCost === 0) return null;
                        return (
                          <div className="mt-2 flex gap-2 text-xs">
                            <div className="flex-1 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 flex justify-between items-center">
                              <span className="text-blue-500">🚛 راس</span>
                              <span className={`font-bold ${headCost===0?"text-gray-400":"text-blue-800"}`}>{fmt(headCost)}</span>
                            </div>
                            <div className="flex-1 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5 flex justify-between items-center">
                              <span className="text-indigo-500">🔗 تيدر</span>
                              <span className={`font-bold ${trailerCost===0?"text-gray-400":"text-indigo-800"}`}>{fmt(trailerCost)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Common faults — clickable */}
                    {analytics.commonFaults.length > 0 && (
                      <div>
                        <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                          <AlertTriangle size={14} className="text-orange-500" />الأعطال الشائعة
                          <span className="text-xs text-gray-400 font-normal mr-1">(اضغط لعرض التفاصيل)</span>
                        </h3>
                        <div className="space-y-2">
                          {analytics.commonFaults.map(f => {
                            const max = analytics.commonFaults[0].count;
                            return (
                              <button
                                key={f.fault_type}
                                onClick={() => { setFaultFilter(f.fault_type); setTab("breakdowns"); }}
                                className="w-full text-right bg-orange-50 hover:bg-orange-100 active:scale-[0.98] rounded-xl p-3 border border-orange-100 hover:border-orange-300 transition-all cursor-pointer"
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-sm font-semibold text-gray-800">{f.fault_type}</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{f.count} مرة</span>
                                    <span className="text-orange-400 text-xs">←</span>
                                  </div>
                                </div>
                                <div className="bg-orange-200/50 rounded-full h-1.5">
                                  <div className="bg-orange-400 h-1.5 rounded-full transition-all" style={{ width: `${(f.count / max) * 100}%` }} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Driver history summary */}
                    {analytics.driverHistory.length > 0 && (
                      <div>
                        <h3 className="font-bold text-gray-800 mb-3 text-sm">السائقون السابقون</h3>
                        <div className="space-y-2">
                          {analytics.driverHistory.slice(0,5).map(d => (
                            <div key={d.driver_name} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
                              <div className="flex items-center gap-2">
                                <User size={14} className="text-gray-400" />
                                <span className="font-semibold text-gray-800 text-sm">{d.driver_name}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span>{d.trip_count} رحلة</span>
                                <span>{fmtDate(d.last_date)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Compliance status strip */}
                    <div>
                      <h3 className="font-bold text-gray-800 mb-3 text-sm">حالة الوثائق</h3>
                      <div className="grid grid-cols-3 gap-3">
                        {DOC_TYPES.map(type => {
                          const doc = analytics.complianceDocs.find(d => d.doc_type === type);
                          const s = docStatus(doc);
                          const cfg = STATUS_CFG[s];
                          const Icon = cfg.icon;
                          return (
                            <div key={type} className={`${cfg.bg} ${cfg.border} border rounded-xl p-3 text-center cursor-pointer hover:shadow-sm transition-shadow`}
                              onClick={() => { setTab("docs"); }}>
                              <Icon size={20} className={`${cfg.iconColor} mx-auto mb-1`} />
                              <div className="text-xs font-bold text-gray-700">{type}</div>
                              <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block font-semibold ${cfg.badge}`}>{cfg.label}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Documents ── */}
                {tab === "docs" && (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500">انقر على أي وثيقة لتحديثها أو رفع ملفها (صورة أو PDF).</p>

                    {/* ── Standard 3 doc types ── */}
                    {DOC_TYPES.map(type => {
                      const doc = analytics.complianceDocs.find(d => d.doc_type === type);
                      const s = docStatus(doc);
                      const cfg = STATUS_CFG[s];
                      const StatusIcon = cfg.icon;
                      const isPdf = doc?.image_url?.toLowerCase().includes(".pdf") || doc?.image_url?.toLowerCase().includes("pdf");
                      return (
                        <div key={type} className={`${cfg.bg} ${cfg.border} border rounded-2xl p-4`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                <StatusIcon size={18} className={cfg.iconColor} />
                              </div>
                              <div>
                                <div className="font-bold text-gray-900">{type}</div>
                                {doc ? (
                                  <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                                    <div>من: {fmtDate(doc.start_date)} — إلى: {fmtDate(doc.end_date)}</div>
                                    {doc.notes && <div>ملاحظة: {doc.notes}</div>}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-400 mt-0.5">لم يتم رفع هذه الوثيقة بعد</div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-1 rounded-full font-semibold ${cfg.badge}`}>{cfg.label}</span>
                              {doc?.image_url && (
                                <a href={doc.image_url} target="_blank" rel="noreferrer"
                                  className="p-2 bg-white rounded-lg hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors"
                                  title={isPdf ? "فتح PDF" : "عرض الصورة"}>
                                  {isPdf ? <FileText size={14} /> : <Eye size={14} />}
                                </a>
                              )}
                              <button onClick={() => openDocModal(type)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors">
                                <Plus size={12} />{doc ? "تحديث" : "رفع"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* ── Custom / extra docs ── */}
                    {analytics.complianceDocs.filter(d => !(DOC_TYPES as readonly string[]).includes(d.doc_type)).map(doc => {
                      const isPdf = doc.image_url?.toLowerCase().includes(".pdf") || doc.image_url?.toLowerCase().includes("pdf");
                      return (
                        <div key={doc.id} className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                <FileText size={18} className="text-purple-500" />
                              </div>
                              <div>
                                <div className="font-bold text-gray-900">{doc.doc_type}</div>
                                <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                                  {(doc.start_date || doc.end_date) && <div>من: {fmtDate(doc.start_date)} — إلى: {fmtDate(doc.end_date)}</div>}
                                  {doc.notes && <div>ملاحظة: {doc.notes}</div>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {doc.image_url && (
                                <a href={doc.image_url} target="_blank" rel="noreferrer"
                                  className="p-2 bg-white rounded-lg hover:bg-gray-100 text-gray-500 hover:text-purple-600 transition-colors"
                                  title={isPdf ? "فتح PDF" : "عرض الملف"}>
                                  {isPdf ? <FileText size={14} /> : <Eye size={14} />}
                                </a>
                              )}
                              <button onClick={() => openDocModal(doc.doc_type, true, doc)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors">
                                <Plus size={12} />تحديث
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* ── Add custom doc button ── */}
                    <button onClick={() => openDocModal("", true)}
                      className="w-full py-3 border-2 border-dashed border-purple-300 hover:border-purple-500 text-purple-500 hover:text-purple-700 rounded-2xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                      <Plus size={15} />رفع وثيقة إضافية (تأمين إضافي، ترخيص، وغيره...)
                    </button>
                  </div>
                )}

                {/* ── Breakdowns ── */}
                {tab === "breakdowns" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-gray-800">سجل الأعطال</h3>
                      <button onClick={() => setNewBdModal(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors">
                        <Plus size={13} />بلاغ عطل جديد
                      </button>
                    </div>

                    {/* Active fault filter banner */}
                    {faultFilter && (
                      <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
                        <div className="flex items-center gap-2 text-sm">
                          <AlertTriangle size={14} className="text-orange-500" />
                          <span className="text-gray-700">عرض أعطال نوع:</span>
                          <span className="font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">{faultFilter}</span>
                        </div>
                        <button onClick={() => setFaultFilter(null)}
                          className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1 transition-colors">
                          <X size={13} />إلغاء الفلتر
                        </button>
                      </div>
                    )}

                    {(() => {
                      const filteredLegacy = faultFilter
                        ? analytics.legacyBreakdowns.filter(bd => bd.breakdown_type === faultFilter)
                        : analytics.legacyBreakdowns;
                      const filteredML = analytics.maintenanceLogs.filter(m =>
                        !faultFilter || m.maintenance_type === faultFilter
                      );
                      const noResults = analytics.breakdowns.length === 0 && filteredLegacy.length === 0 && filteredML.length === 0;
                      return noResults ? (
                        <div className="text-center py-12 text-gray-400">
                          <AlertTriangle size={32} className="mx-auto mb-2 text-gray-300" />
                          <p>{faultFilter ? `لا توجد أعطال من نوع "${faultFilter}"` : "لا توجد أعطال مسجّلة"}</p>
                          {faultFilter && <button onClick={() => setFaultFilter(null)} className="mt-2 text-xs text-orange-500 hover:underline">عرض الكل</button>}
                        </div>
                      ) : null;
                    })()}

                    {/* Maintenance logs — always shown, filtered when faultFilter is active */}
                    {analytics.maintenanceLogs.filter(m => !faultFilter || m.maintenance_type === faultFilter).length > 0 && (
                      <div>
                        <div className="text-xs text-blue-500 font-semibold mb-2 flex items-center gap-1">
                          <Wrench size={11} />سجل الصيانة
                          <span className="font-normal text-gray-400 mr-1">({analytics.maintenanceLogs.filter(m => !faultFilter || m.maintenance_type === faultFilter).length} سجل)</span>
                        </div>
                        {analytics.maintenanceLogs.filter(m => !faultFilter || m.maintenance_type === faultFilter).map(m => (
                          <div key={m.id} className="rounded-xl border border-blue-100 bg-blue-50 p-3 mb-2">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2">
                                {m.card_number && <span className="font-mono text-xs font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">#{m.card_number}</span>}
                                <span className="text-xs text-blue-700 font-semibold">{m.maintenance_type}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                {m.maintenance_date && <span>{m.maintenance_date}</span>}
                                {m.amount > 0 && <span className="font-bold text-blue-700">{fmt(m.amount)}</span>}
                              </div>
                            </div>
                            {m.description && <p className="text-xs text-gray-600">{m.description}</p>}
                            <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1">
                              {m.driver_name && <span>👤 {m.driver_name}</span>}
                              {m.branch      && <span>📍 {m.branch}</span>}
                              {m.entry_time  && <span>دخول: {m.entry_time}</span>}
                              {m.exit_time   && <span>خروج: {m.exit_time}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {analytics.breakdowns.length === 0 && analytics.legacyBreakdowns.length === 0 && analytics.maintenanceLogs.length === 0 && !faultFilter && (
                      <div className="text-center py-12 text-gray-400">
                        <AlertTriangle size={32} className="mx-auto mb-2 text-gray-300" />
                        <p>لا توجد أعطال مسجّلة</p>
                      </div>
                    )}

                    {/* New vehicle_breakdowns */}
                    {analytics.breakdowns.map(bd => {
                      const dKey = `N-${bd.id}`;
                      const dClicks = bdDeleteClicks[dKey] || 0;
                      return (
                      <div key={bd.id} className={`rounded-2xl border p-4 ${bd.status==="open" ? "border-red-200 bg-red-50" : "border-gray-100 bg-white"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${bd.status==="open" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                                {bd.status==="open" ? "مفتوح" : "تم الحل"}
                              </span>
                              <span className="text-xs text-gray-500">{fmtDate(bd.created_at)}</span>
                            </div>
                            {bd.driver_name && <div className="text-sm text-gray-700"><User size={12} className="inline ml-1" />{bd.driver_name}</div>}
                            {bd.operational_state && (
                              <div className="flex gap-2 flex-wrap text-xs">
                                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">حالة: {bd.operational_state}</span>
                                {bd.action_taken && <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">إجراء: {bd.action_taken}</span>}
                              </div>
                            )}
                            {bd.description && <p className="text-xs text-gray-600 leading-relaxed">{bd.description}</p>}
                            {bd.resolved_at && (
                              <div className="text-xs text-emerald-600 mt-1">
                                <CheckCircle size={11} className="inline ml-1" />تم الحل بواسطة {bd.resolved_by||"—"} في {fmtDate(bd.resolved_at)}
                                {bd.invoice_image_url && (
                                  <a href={bd.invoice_image_url} target="_blank" rel="noreferrer" className="mr-2 text-blue-600 hover:underline">
                                    <Image size={11} className="inline ml-0.5" />فاتورة
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            {bd.photo_url && (
                              <a href={bd.photo_url} target="_blank" rel="noreferrer"
                                className="p-2 bg-white rounded-xl border border-gray-200 text-gray-500 hover:text-blue-600 transition-colors">
                                <Eye size={14} />
                              </a>
                            )}
                            {bd.status === "open" && (
                              <button onClick={() => setResolveModal({ open:true, bd })}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors">
                                <Wrench size={12} />إغلاق
                              </button>
                            )}
                            <button onClick={() => setEditBdModal({ open:true, id:bd.id, isLegacy:false, form:{ driver_name:bd.driver_name||"", driver_phone:bd.driver_phone||"", operational_state:bd.operational_state||"", action_taken:bd.action_taken||"", description:bd.description||"", breakdown_type:"", status:bd.status } })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors">
                              <Pencil size={12} />تعديل
                            </button>
                            <button onClick={() => handleBdDelete(bd.id, false)} disabled={deleteBreakdown.isPending}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${
                                dClicks === 0 ? "border border-red-300 text-red-500 hover:bg-red-50" :
                                dClicks < 4  ? "bg-red-100 text-red-700 border border-red-300" :
                                               "bg-red-600 text-white animate-pulse"
                              }`}>
                              <Trash2 size={12} />
                              {dClicks === 0 ? "حذف" : dClicks < 4 ? `حذف (${5 - dClicks})` : "تأكيد!"}
                            </button>
                          </div>
                        </div>
                      </div>
                      );
                    })}

                    {/* Legacy breakdown_reports */}
                    {(faultFilter ? analytics.legacyBreakdowns.filter(bd => bd.breakdown_type === faultFilter) : analytics.legacyBreakdowns).length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 font-semibold mb-2 flex items-center gap-1">
                          <Clock size={11} />{faultFilter ? `بلاغات قديمة - ${faultFilter}` : "بلاغات قديمة (من تطبيق السائق)"}
                        </div>
                        {(faultFilter ? analytics.legacyBreakdowns.filter(bd => bd.breakdown_type === faultFilter) : analytics.legacyBreakdowns).map(bd => {
                          const dKey = `L-${bd.id}`;
                          const dClicks = bdDeleteClicks[dKey] || 0;
                          return (
                          <div key={bd.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 mb-2">
                            <div className="flex items-start gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-xs font-semibold text-gray-700">{bd.breakdown_type||"عطل"}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${bd.status==="open" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                                    {bd.status==="open"?"مفتوح":"تم الحل"}
                                  </span>
                                  <span className="text-xs text-gray-400">{fmtDate(bd.created_at)}</span>
                                </div>
                                {bd.operational_state && (
                                  <div className="flex gap-1.5 flex-wrap text-xs mt-1">
                                    <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">حالة: {bd.operational_state}</span>
                                    {bd.action_taken && <span className="bg-orange-50 text-orange-700 border border-orange-100 px-2 py-0.5 rounded-full">{bd.action_taken}</span>}
                                  </div>
                                )}
                                {bd.description && <p className="text-xs text-gray-500 mt-1">{bd.description}</p>}
                              </div>
                              <div className="flex flex-col gap-1.5 shrink-0">
                                <button onClick={() => setEditBdModal({ open:true, id:bd.id, isLegacy:true, form:{ driver_name:"", driver_phone:"", operational_state:bd.operational_state||"", action_taken:bd.action_taken||"", description:bd.description||"", breakdown_type:bd.breakdown_type||"", status:bd.status } })}
                                  className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold transition-colors">
                                  <Pencil size={10} />تعديل
                                </button>
                                <button onClick={() => handleBdDelete(bd.id, true)} disabled={deleteBreakdown.isPending}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 ${
                                    dClicks === 0 ? "border border-red-300 text-red-500 hover:bg-red-50" :
                                    dClicks < 4  ? "bg-red-100 text-red-700 border border-red-300" :
                                                   "bg-red-600 text-white animate-pulse"
                                  }`}>
                                  <Trash2 size={10} />
                                  {dClicks === 0 ? "حذف" : dClicks < 4 ? `(${5 - dClicks})` : "تأكيد!"}
                                </button>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Parts ── */}
                {tab === "parts" && (
                  <div className="space-y-5">
                    {/* KM Rates section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                          <Calculator size={14} className="text-blue-600" />أسعار الكيلومتر حسب نوع السيارة
                        </h3>
                        <div className="flex gap-2">
                          <input type="number" value={kmCalc.km} onChange={e => setKmCalc(c=>({...c,km:e.target.value}))} placeholder="المسافة كم" className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          <select value={kmCalc.type} onChange={e => setKmCalc(c=>({...c,type:e.target.value}))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                            <option value="">نوع السيارة</option>
                            {kmRates?.map(r => <option key={r.id} value={r.vehicle_type}>{r.vehicle_type}</option>)}
                          </select>
                          <button onClick={() => {
                            const r = kmRates?.find(x=>x.vehicle_type===kmCalc.type);
                            if (r && kmCalc.km) setKmCalc(c=>({...c, result: parseFloat((parseFloat(c.km)*r.multiplier*r.rate_per_km).toFixed(2))}));
                          }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold">احسب</button>
                        </div>
                      </div>
                      {kmCalc.result !== null && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-3 flex items-center gap-3">
                          <DollarSign size={18} className="text-blue-600" />
                          <div>
                            <div className="text-xs text-blue-500">التكلفة المحسوبة ({kmCalc.km} كم × {kmRates?.find(x=>x.vehicle_type===kmCalc.type)?.multiplier})</div>
                            <div className="text-xl font-black text-blue-900">{kmCalc.result.toLocaleString()} ريال</div>
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        {kmRates?.map(r => (
                          <div key={r.id} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3">
                            <div className="flex-1">
                              <div className="font-bold text-gray-800 text-sm">{r.vehicle_type}</div>
                              {kmEditId === r.id ? (
                                <div className="flex gap-2 mt-2 flex-wrap">
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-gray-500">سعر/كم:</span>
                                    <input type="number" step="0.01" value={kmDraft.rate_per_km} onChange={e=>setKmDraft(d=>({...d,rate_per_km:e.target.value}))} className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-gray-500">مضاعف:</span>
                                    <input type="number" step="0.5" value={kmDraft.multiplier} onChange={e=>setKmDraft(d=>({...d,multiplier:e.target.value}))} className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                  </div>
                                  <button onClick={() => updateKmRate.mutate({id:r.id,rate_per_km:parseFloat(kmDraft.rate_per_km),multiplier:parseFloat(kmDraft.multiplier)})} disabled={updateKmRate.isPending} className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"><Save size={11}/>حفظ</button>
                                  <button onClick={()=>setKmEditId(null)} className="px-3 py-1 border border-gray-200 rounded-lg text-xs text-gray-500">إلغاء</button>
                                </div>
                              ) : (
                                <div className="text-xs text-gray-500 mt-0.5">{r.rate_per_km} ريال/كم × {r.multiplier} مضاعف = <span className="font-bold text-blue-700">{(r.rate_per_km*r.multiplier).toFixed(3)} ريال فعلي/كم</span></div>
                              )}
                            </div>
                            {kmEditId !== r.id && (
                              <button onClick={()=>{ setKmEditId(r.id); setKmDraft({rate_per_km:String(r.rate_per_km),multiplier:String(r.multiplier)}); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Save size={14}/></button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Parts filtered by global date range */}
                    {(() => {
                      const toIso = (d?: string | null) => {
                        if (!d) return "";
                        const t = new Date(d).getTime();
                        return isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
                      };
                      const inGlobal = (d?: string | null) => {
                        if (!globalFrom && !globalTo) return true;
                        const iso = toIso(d);
                        if (!iso) return false;
                        if (globalFrom && iso < globalFrom) return false;
                        if (globalTo   && iso > globalTo)   return false;
                        return true;
                      };
                      const wp  = (vehicleParts?.workshopParts   || []).filter(p => inGlobal(p.created_at));
                      const pp  = (vehicleParts?.purchaseParts   || []).filter(p => inGlobal(p.created_at));
                      const de  = (vehicleParts?.directExpenses  || []).filter(e => inGlobal(e.date));
                      const ip  = (vehicleParts?.inventoryParts  || []);
                      const empty = vehicleParts && wp.length === 0 && pp.length === 0 && de.length === 0 && ip.length === 0;
                      return (<>
                        {/* Parts from workshop */}
                        {wp.length > 0 && (
                          <div>
                            <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                              <Wrench size={14} className="text-orange-500" />قطع الغيار من الورشة ({wp.length})
                            </h3>
                            <div className="space-y-2">
                              {wp.map(p => (
                                <div key={p.id} className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 flex items-center justify-between">
                                  <div>
                                    <div className="font-semibold text-gray-800 text-sm">{p.title}</div>
                                    {p.parts_used && <div className="text-xs text-gray-500 mt-0.5">{p.parts_used}</div>}
                                    <div className="text-xs text-gray-400 mt-0.5">{fmtDate(p.created_at)}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-orange-700">{fmt(p.total_cost||0)}</div>
                                    <div className={`text-xs mt-0.5 ${p.status==="completed"?"text-emerald-600":"text-orange-500"}`}>{p.status==="completed"?"مكتمل":"جارٍ"}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Parts from purchases */}
                        {pp.length > 0 && (
                          <div>
                            <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                              <Package size={14} className="text-purple-500" />قطع الغيار من المشتريات ({pp.length})
                            </h3>
                            <div className="space-y-2">
                              {pp.map(p => (
                                <div key={p.id} className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 flex items-center justify-between">
                                  <div>
                                    <div className="font-semibold text-gray-800 text-sm">{p.title}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{p.quantity} {p.unit} · {fmtDate(p.created_at)}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-purple-700">{fmt(p.actual_cost||p.estimated_cost||0)}</div>
                                    <div className={`text-xs mt-0.5 ${p.status==="received"?"text-emerald-600":"text-gray-500"}`}>{p.status==="received"?"مستلم":p.status}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Direct repair expenses */}
                        {de.length > 0 && (
                          <div>
                            <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                              <FileText size={14} className="text-blue-500" />إصلاحات السائق المباشرة ({de.length})
                            </h3>
                            <div className="space-y-2">
                              {de.map(e => (
                                <div key={e.id} className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between">
                                  <div>
                                    <div className="font-semibold text-gray-800 text-sm">{e.title}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{e.description} · {e.date}</div>
                                  </div>
                                  <div className="font-bold text-blue-700">{fmt(e.amount||0)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Parts from workshop inventory stock */}
                        {ip.length > 0 && (
                          <div>
                            <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                              <Package size={14} className="text-green-600" />قطع الغيار من المخزن ({ip.length})
                            </h3>
                            <div className="space-y-2">
                              {ip.map(p => (
                                <div key={p.id} className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center justify-between">
                                  <div>
                                    <div className="font-semibold text-gray-800 text-sm">{p.item_name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{p.quantity} {p.unit} × {p.cost_per_unit.toLocaleString("ar-SA")} ر.س</div>
                                    <div className="text-xs text-gray-400 mt-0.5">{fmtDate(p.created_at)}{p.reference_no ? ` · بطاقة ${p.reference_no}` : ""}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-green-700">{fmt(p.total_cost)}</div>
                                    {p.created_by && <div className="text-xs text-gray-400 mt-0.5">{p.created_by}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {empty && (
                          <div className="text-center py-8 text-gray-400">
                            <Package size={32} className="mx-auto mb-2 text-gray-300" />
                            <p>لا توجد قطع غيار مسجّلة لهذه السيارة{(globalFrom||globalTo) ? " في الفترة المحددة" : ""}</p>
                          </div>
                        )}
                      </>);
                    })()}
                  </div>
                )}

                {/* ── Expenses ── */}
                {tab === "expenses" && (
                  <div className="space-y-5">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "مصاريف الأسطول المباشرة", value: analytics.fleetExpenses.reduce((s,e)=>s+(e.amount||0),0), color:"red" },
                        { label: "صيانة وورشة",             value: analytics.maintenanceLogs.reduce((s,m)=>s+((m as {amount:number}).amount||0),0), color:"orange" },
                        { label: "أوامر عمل الورشة",        value: analytics.workshopJobs.filter(j=>j.invoice_target!=="inventory").reduce((s,j)=>s+(j.total_cost||0),0), color:"blue" },
                        { label: "الإجمالي الكلي",           value: analytics.costSummary.total, color:"gray" },
                      ].map(({label,value,color})=>(
                        <div key={label} className={`rounded-xl p-3 border ${color==="red"?"bg-red-50 border-red-100":color==="orange"?"bg-orange-50 border-orange-100":color==="blue"?"bg-blue-50 border-blue-100":"bg-gray-100 border-gray-200"}`}>
                          <div className="text-xs text-gray-500 mb-1">{label}</div>
                          <div className={`font-black text-sm ${value===0?"text-gray-400":"text-gray-900"}`}>{fmt(value)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Fleet expenses table */}
                    <div>
                      <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                        <DollarSign size={14} className="text-red-500" />مصاريف الأسطول المباشرة
                        <span className="text-xs font-normal text-gray-400 mr-1">({analytics.fleetExpenses.length} سجل)</span>
                      </h3>
                      {analytics.fleetExpenses.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">لا توجد مصاريف مباشرة في هذه الفترة</div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                          <table className="min-w-full text-xs text-right" dir="rtl">
                            <thead className="bg-gray-50 border-b border-gray-100">
                              <tr>{["التاريخ","النوع","المبلغ","الوصف"].map(h=><th key={h} className="px-3 py-2 font-bold text-gray-600 whitespace-nowrap">{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {analytics.fleetExpenses.map((e,i)=>(
                                <tr key={i} className={`border-b border-gray-50 ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                                  <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{e.date||"—"}</td>
                                  <td className="px-3 py-1.5 font-medium text-gray-800">{e.expense_type||"—"}</td>
                                  <td className="px-3 py-1.5 font-bold text-red-700 whitespace-nowrap">{fmt(e.amount||0)}</td>
                                  <td className="px-3 py-1.5 text-gray-500 max-w-[200px] truncate">{e.description||"—"}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t border-gray-200">
                              <tr>
                                <td colSpan={2} className="px-3 py-2 font-bold text-gray-700 text-xs">الإجمالي</td>
                                <td className="px-3 py-2 font-black text-red-700 whitespace-nowrap">{fmt(analytics.fleetExpenses.reduce((s,e)=>s+(e.amount||0),0))}</td>
                                <td/>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Maintenance logs cost */}
                    {analytics.maintenanceLogs.length > 0 && (
                      <div>
                        <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                          <Wrench size={14} className="text-orange-500" />سجل الصيانة والورشة
                          <span className="text-xs font-normal text-gray-400 mr-1">({analytics.maintenanceLogs.length} سجل)</span>
                        </h3>
                        {/* Head / Trailer cost split */}
                        {(() => {
                          const headCost    = analytics.maintenanceLogs.filter(m => !m.trailer_number).reduce((s,m)=>s+(m.amount||0),0);
                          const trailerCost = analytics.maintenanceLogs.filter(m => !!m.trailer_number).reduce((s,m)=>s+(m.amount||0),0);
                          return (headCost > 0 || trailerCost > 0) ? (
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-right">
                                <div className="text-xs text-blue-500 mb-0.5">🚛 تكلفة الراس</div>
                                <div className={`font-black text-sm ${headCost===0?"text-gray-400":"text-blue-800"}`}>{fmt(headCost)}</div>
                              </div>
                              <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 text-right">
                                <div className="text-xs text-indigo-500 mb-0.5">🔗 تكلفة التيدر</div>
                                <div className={`font-black text-sm ${trailerCost===0?"text-gray-400":"text-indigo-800"}`}>{fmt(trailerCost)}</div>
                              </div>
                            </div>
                          ) : null;
                        })()}
                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                          <table className="min-w-full text-xs text-right" dir="rtl">
                            <thead className="bg-gray-50 border-b border-gray-100">
                              <tr>{["التاريخ","نوع الصيانة","السائق","رقم التيدر","المبلغ"].map(h=><th key={h} className="px-3 py-2 font-bold text-gray-600 whitespace-nowrap">{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {analytics.maintenanceLogs.map((m,i)=>(
                                <tr key={m.id??i} className={`border-b border-gray-50 ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                                  <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{m.maintenance_date||"—"}</td>
                                  <td className="px-3 py-1.5 font-medium text-gray-800">{m.maintenance_type||"—"}</td>
                                  <td className="px-3 py-1.5 text-gray-700">{m.driver_name||"—"}</td>
                                  <td className="px-3 py-1.5">
                                    {m.trailer_number
                                      ? <span className="text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 font-mono text-[11px]">🔗 {m.trailer_number}</span>
                                      : <span className="text-gray-400 text-[11px]">راس</span>}
                                  </td>
                                  <td className="px-3 py-1.5 font-bold text-orange-700 whitespace-nowrap">{fmt(m.amount||0)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t border-gray-200">
                              <tr>
                                <td colSpan={4} className="px-3 py-2 font-bold text-gray-700 text-xs">الإجمالي</td>
                                <td className="px-3 py-2 font-black text-orange-700 whitespace-nowrap">{fmt(analytics.maintenanceLogs.reduce((s,m)=>s+(m.amount||0),0))}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Purchases ── */}
                {tab === "purchases" && (
                  <div className="space-y-5">
                    {/* Summary strip */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
                        <div className="text-2xl font-black text-purple-800">{analytics.purchaseInvoices.length}</div>
                        <div className="text-xs text-purple-600 mt-0.5">فواتير موردين</div>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                        <div className="text-base font-black text-emerald-800">{fmt(analytics.totalPurchaseCost)}</div>
                        <div className="text-xs text-emerald-600 mt-0.5">إجمالي المشتريات (شامل الضريبة)</div>
                      </div>
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                        <div className="text-2xl font-black text-blue-800">{analytics.maintenanceLogs.length}</div>
                        <div className="text-xs text-blue-600 mt-0.5">سجلات صيانة</div>
                      </div>
                    </div>

                    {/* Purchase invoices from suppliers */}
                    <div>
                      <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                        <ShoppingBag size={14} className="text-purple-500" />فواتير الموردين ({analytics.purchaseInvoices.length})
                      </h3>
                      {analytics.purchaseInvoices.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
                          <ShoppingBag size={28} className="mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">لا توجد فواتير موردين لهذه السيارة</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {analytics.purchaseInvoices.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-800 text-sm">{p.item_name}</div>
                                <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                                  {p.invoice_date && <span>{p.invoice_date}</span>}
                                  {p.invoice_number && <span>فاتورة #{p.invoice_number}</span>}
                                  {p.quantity > 1 && <span>الكمية: {p.quantity}</span>}
                                </div>
                                {p.supplier_name && (
                                  <div className="text-xs text-blue-600 mt-0.5">المورد: {p.supplier_name}</div>
                                )}
                              </div>
                              <div className="text-right mr-3 shrink-0">
                                <div className="font-bold text-purple-700">{fmt(p.price_after_vat * (p.quantity || 1))}</div>
                                <div className="text-[10px] text-gray-400 mt-0.5">قبل الضريبة: {fmt(p.price_before_vat)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Maintenance logs */}
                    <div>
                      <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                        <Wrench size={14} className="text-blue-500" />سجل الأعطال والصيانة ({analytics.maintenanceLogs.length})
                      </h3>
                      {analytics.maintenanceLogs.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
                          <Wrench size={28} className="mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">لا توجد سجلات صيانة لهذه السيارة</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {analytics.maintenanceLogs.map(m => (
                            <div key={m.id} className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {m.card_number && <span className="font-mono text-xs font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">#{m.card_number}</span>}
                                  {m.maintenance_type && (
                                    <span className="text-xs font-semibold text-blue-700 bg-white border border-blue-200 px-2 py-0.5 rounded-full">{m.maintenance_type}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                                  {m.maintenance_date && <span>{m.maintenance_date}</span>}
                                  {m.amount > 0 && <span className="font-bold text-blue-700">{fmt(m.amount)}</span>}
                                </div>
                              </div>
                              {m.description && <p className="text-xs text-gray-600 mt-1">{m.description}</p>}
                              <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1.5">
                                {m.driver_name && <span>👤 {m.driver_name}</span>}
                                {m.branch     && <span>📍 {m.branch}</span>}
                                {m.entry_time && <span>دخول: {m.entry_time}</span>}
                                {m.exit_time  && <span>خروج: {m.exit_time}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── History ── */}
                {tab === "history" && (
                  <div className="space-y-6">

                    {/* ── Trips from الردود table ── */}
                    <div>
                      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                          <Activity size={14} className="text-emerald-500" />سجل الرحلات (الردود)
                          <span className="text-xs font-normal text-gray-400 mr-1">({analytics.trips.length} سجل)</span>
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => { setTripForm(emptyTripForm()); setAddTripModal(true); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#103c68] hover:bg-[#0d3057] text-white rounded-xl text-xs font-bold transition-colors">
                            <Plus size={13} />إضافة رحلة
                          </button>
                        {analytics.trips.length > 0 && (
                          <button
                            onClick={() => {
                              const plate = analytics.vehicle.plate_number || selectedPlate || "vehicle";
                              const date  = new Date().toLocaleDateString("en-CA");
                              const rows = analytics.trips.map(t => ({
                                "اليوم":                    t.date || "",
                                "سند الصرف":               t.payment_voucher || "",
                                "رقم كارت التحميل":        t.loading_card_no || "",
                                "نوع السيارة":             t.vehicle_type || "",
                                "اسم السائق":              t.driver_name || "",
                                "الحمولة":                 t.material_type || "",
                                "متر/طن":                  t.meter_ton ?? "",
                                "سعر الرد/م/ط":            t.unit_price ?? "",
                                "عدد الردود":              t.trips_count ?? "",
                                "قيمة الرد بدون ضريبة":   t.return_value_no_vat ?? "",
                                "اسم العميل":              t.client_name || "",
                                "المورد":                  t.supplier || "",
                                "مصروف مواد+ديزل":        t.material_expense_diesel ?? "",
                                "قيمة العمل":              t.work_value ?? "",
                                "مكان النزول":             t.destination || "",
                                "ملاحظات":                 t.notes || "",
                                "التحصيل النقدي":          t.cash_collection ?? "",
                              }));
                              rows.push({
                                "اليوم":                    "الإجمالي",
                                "سند الصرف":               "",
                                "رقم كارت التحميل":        "",
                                "نوع السيارة":             "",
                                "اسم السائق":              "",
                                "الحمولة":                 "",
                                "متر/طن":                  "",
                                "سعر الرد/م/ط":            "",
                                "عدد الردود":              analytics.trips.reduce((s, t) => s + (t.trips_count || 0), 0),
                                "قيمة الرد بدون ضريبة":   analytics.trips.reduce((s, t) => s + (t.return_value_no_vat || 0), 0),
                                "اسم العميل":              "",
                                "المورد":                  "",
                                "مصروف مواد+ديزل":        analytics.trips.reduce((s, t) => s + (t.material_expense_diesel || 0), 0),
                                "قيمة العمل":              analytics.trips.reduce((s, t) => s + (t.work_value || 0), 0),
                                "مكان النزول":             "",
                                "ملاحظات":                 "",
                                "التحصيل النقدي":          analytics.trips.reduce((s, t) => s + (t.cash_collection || 0), 0),
                              });
                              const ws = XLSX.utils.json_to_sheet(rows);
                              const wb = XLSX.utils.book_new();
                              XLSX.utils.book_append_sheet(wb, ws, "الرحلات");
                              XLSX.writeFile(wb, `رحلات_${plate}_${date}.xlsx`);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
                          >
                            <Download size={13} />تصدير Excel
                          </button>
                        )}
                        </div>
                      </div>

                      {analytics.trips.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
                          <Activity size={28} className="mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">لا توجد رحلات مسجلة لهذه السيارة</p>
                        </div>
                      ) : (
                        <>
                          {/* Filter bar + dynamic summary cards */}
                          {(() => {
                            const q = tripSearch.trim().toLowerCase();
                            const uniqueDrivers = Array.from(new Set(analytics.trips.map(t => t.driver_name || "").filter(Boolean))).sort();
                            const uniqueMaterials = Array.from(new Set(analytics.trips.map(t => t.material_type || "").filter(Boolean))).sort();
                            const filteredTrips = analytics.trips.filter(t => {
                              if (q) {
                                const haystack = [
                                  t.date, t.payment_voucher, t.loading_card_no, t.vehicle_type,
                                  t.driver_name, t.material_type, t.meter_ton, t.unit_price,
                                  t.trips_count, t.return_value_no_vat, t.client_name, t.supplier,
                                  t.material_expense_diesel, t.work_value, t.destination,
                                  t.notes, t.cash_collection,
                                ].map(v => (v ?? "").toString().toLowerCase()).join(" ");
                                if (!haystack.includes(q)) return false;
                              }
                              const iso = toISO(t.date);
                              if (tripDateFrom && iso && iso < tripDateFrom) return false;
                              if (tripDateTo   && iso && iso > tripDateTo)   return false;
                              if (tripDriverFilter && (t.driver_name || "") !== tripDriverFilter) return false;
                              if (tripMaterialFilter && (t.material_type || "") !== tripMaterialFilter) return false;
                              if (tripStateFilter   && (t.trip_state    || "") !== tripStateFilter)   return false;
                              return true;
                            });
                            const sorted = tripSortDesc
                              ? [...filteredTrips].sort((a, b) => toISO(b.date).localeCompare(toISO(a.date)) || (b.id??0)-(a.id??0))
                              : [...filteredTrips].sort((a, b) => toISO(a.date).localeCompare(toISO(b.date)) || (a.id??0)-(b.id??0));
                            const hasFilter = q || tripDateFrom || tripDateTo || tripDriverFilter || tripMaterialFilter || tripStateFilter;
                            const summarySource = hasFilter ? filteredTrips : analytics.trips;
                            return (
                              <>
                          {/* Summary cards */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                            {hasFilter && (
                              <div className="col-span-2 sm:col-span-3 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5" dir="rtl">
                                <span className="text-amber-500">★</span>
                                <span>الأرقام تعكس الفلتر الحالي ({filteredTrips.length} من {analytics.trips.length} رحلة)</span>
                              </div>
                            )}
                            <div className={`rounded-xl px-4 py-3 border text-center ${hasFilter ? "bg-emerald-100 border-emerald-300" : "bg-emerald-50 border-emerald-100"}`}>
                              <div className="text-lg font-black text-emerald-700">
                                {summarySource.reduce((s,t)=>s+(t.trips_count||0),0).toLocaleString("ar-SA")}
                              </div>
                              <div className="text-xs text-emerald-600 mt-0.5">إجمالي الردود</div>
                            </div>
                            <div className={`rounded-xl px-4 py-3 border text-center ${hasFilter ? "bg-blue-100 border-blue-300" : "bg-blue-50 border-blue-100"}`}>
                              <div className="text-lg font-black text-blue-700">
                                {fmt(summarySource.reduce((s,t)=>s+(t.return_value_no_vat||0),0))}
                              </div>
                              <div className="text-xs text-blue-600 mt-0.5">قيمة الرد بدون ضريبة</div>
                            </div>
                            <div className={`rounded-xl px-4 py-3 border text-center ${hasFilter ? "bg-teal-100 border-teal-300" : "bg-teal-50 border-teal-100"}`}>
                              <div className="text-lg font-black text-teal-700">
                                {fmt(summarySource.reduce((s,t)=>s+(t.net_amount||0),0))}
                              </div>
                              <div className="text-xs text-teal-600 mt-0.5">صافي الإيراد</div>
                            </div>
                            <div className={`rounded-xl px-4 py-3 border text-center ${hasFilter ? "bg-violet-100 border-violet-300" : "bg-violet-50 border-violet-100"}`}>
                              <div className="text-lg font-black text-violet-700">
                                {fmt(summarySource.reduce((s,t)=>s+(t.cash_collection||0),0))}
                              </div>
                              <div className="text-xs text-violet-600 mt-0.5">التحصيل النقدي</div>
                            </div>
                            <div className={`rounded-xl px-4 py-3 border text-center ${hasFilter ? "bg-orange-100 border-orange-300" : "bg-orange-50 border-orange-100"}`}>
                              <div className="text-lg font-black text-orange-700">
                                {fmt(summarySource.reduce((s,t)=>s+(t.material_expense_diesel||0),0))}
                              </div>
                              <div className="text-xs text-orange-600 mt-0.5">مصروف الديزل</div>
                            </div>
                            <div className={`rounded-xl px-4 py-3 border text-center ${hasFilter ? "bg-sky-100 border-sky-300" : "bg-sky-50 border-sky-100"}`}>
                              <div className="text-lg font-black text-sky-700">
                                {summarySource.reduce((s,t)=>s+(t.distance_km||0),0).toFixed(1)} كم
                              </div>
                              <div className="text-xs text-sky-600 mt-0.5">إجمالي المسافة</div>
                            </div>
                          </div>

                                <div className="flex flex-wrap gap-2 mb-3 items-center" dir="rtl">
                                  <div className="relative flex-1 min-w-[180px]">
                                    <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    <input
                                      type="text"
                                      value={tripSearch}
                                      onChange={e => setTripSearch(e.target.value)}
                                      placeholder="بحث بالسائق أو العميل أو الوجهة…"
                                      className="w-full pr-8 pl-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                    />
                                  </div>
                                  <select
                                    value={tripDriverFilter}
                                    onChange={e => setTripDriverFilter(e.target.value)}
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 min-w-[130px]"
                                  >
                                    <option value="">كل السائقين</option>
                                    {uniqueDrivers.map(d => (
                                      <option key={d} value={d}>{d}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={tripMaterialFilter}
                                    onChange={e => setTripMaterialFilter(e.target.value)}
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 min-w-[130px]"
                                  >
                                    <option value="">كل الحمولات</option>
                                    {uniqueMaterials.map(m => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                  </select>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-500 whitespace-nowrap">من:</span>
                                    <input
                                      type="date"
                                      value={tripDateFrom}
                                      onChange={e => setTripDateFrom(e.target.value)}
                                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-500 whitespace-nowrap">إلى:</span>
                                    <input
                                      type="date"
                                      value={tripDateTo}
                                      onChange={e => setTripDateTo(e.target.value)}
                                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                    />
                                  </div>
                                  <select
                                    value={tripStateFilter}
                                    onChange={e => setTripStateFilter(e.target.value)}
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 min-w-[120px]"
                                  >
                                    <option value="">كل الأنواع</option>
                                    {Array.from(new Set(analytics.trips.map(t => t.trip_state||"").filter(Boolean))).sort().map(s => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => setTripSortDesc(v => !v)}
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
                                  >
                                    {tripSortDesc ? "↓ الأحدث أولاً" : "↑ الأقدم أولاً"}
                                  </button>
                                  {hasFilter && (
                                    <button
                                      onClick={() => { setTripSearch(""); setTripDateFrom(""); setTripDateTo(""); setTripDriverFilter(""); setTripMaterialFilter(""); setTripStateFilter(""); }}
                                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1.5 rounded-lg border border-red-100 hover:bg-red-50"
                                    >
                                      <X size={12} />مسح
                                    </button>
                                  )}
                                  <span className="text-xs text-gray-400 mr-auto whitespace-nowrap">
                                    {hasFilter
                                      ? <>{filteredTrips.length} من {analytics.trips.length} رحلة</>
                                      : <>{analytics.trips.length} رحلة</>
                                    }
                                  </span>
                                </div>

                                {/* Full trips table */}
                                <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
                                  <table className="min-w-[1400px] w-full text-xs text-right" dir="rtl">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                      <tr>
                                        {["اليوم","سند الصرف","رقم كارت التحميل","نوع السيارة","اسم السائق","الحمولة","متر/طن","سعر الرد/م/ط","عدد الردود","قيمة الرد بدون ضريبة","اسم العميل","المورد","مصروف مواد+ديزل","قيمة العمل","مكان النزول","ملاحظات","التحصيل النقدي","الحالة","إجراءات"].map(h=>(
                                          <th key={h} className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sorted.length === 0 ? (
                                        <tr>
                                          <td colSpan={19} className="text-center py-8 text-gray-400">
                                            <Search size={22} className="mx-auto mb-2 text-gray-300" />
                                            لا توجد نتائج مطابقة للفلتر المحدد
                                          </td>
                                        </tr>
                                      ) : sorted.map((t, i) => (
                                        <tr key={t.id ?? i} className={`border-b border-gray-50 ${i%2===0?"bg-white":"bg-gray-50/40"} hover:bg-emerald-50/30`}>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-600">{t.date||"—"}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{t.payment_voucher||"—"}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{t.loading_card_no||"—"}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{t.vehicle_type||"—"}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap font-medium text-gray-800">{t.driver_name||"—"}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{t.material_type||"—"}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{t.meter_ton??""}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{t.unit_price!=null?fmt(t.unit_price):""}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap font-bold text-emerald-700">{t.trips_count??""}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap font-bold text-blue-700">{t.return_value_no_vat!=null?fmt(t.return_value_no_vat):""}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{t.client_name||"—"}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{t.supplier||"—"}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-orange-700">{t.material_expense_diesel!=null?fmt(t.material_expense_diesel):""}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{t.work_value!=null?fmt(t.work_value):""}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{t.destination||"—"}</td>
                                          <td className="px-3 py-1.5 max-w-[140px] truncate text-gray-500">{t.notes||""}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap font-bold text-violet-700">{t.cash_collection!=null?fmt(t.cash_collection):""}</td>
                                          <td className="px-3 py-1.5 whitespace-nowrap">
                                            {t.trip_state ? (
                                              <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-medium">{t.trip_state}</span>
                                            ) : "—"}
                                          </td>
                                          <td className="px-3 py-1.5 whitespace-nowrap">
                                            <div className="flex items-center gap-1">
                                              {t.id != null && (
                                                <button
                                                  onClick={() => openEditTrip(t)}
                                                  className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                                  title="تعديل"
                                                ><Pencil size={13} /></button>
                                              )}
                                              {t.id != null && (
                                                <button
                                                  onClick={() => handleTripDelete(t.id!)}
                                                  className={`p-1 rounded-lg transition-colors ${(tripDeleteClicks[t.id!]||0)>0 ? "text-red-700 bg-red-100 hover:bg-red-200" : "text-red-400 hover:text-red-600 hover:bg-red-50"}`}
                                                  title={(tripDeleteClicks[t.id!]||0)>0 ? `اضغط ${3-(tripDeleteClicks[t.id!]||0)} مرات للحذف` : "حذف"}
                                                ><Trash2 size={13} /></button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            );
                          })()}
                        </>
                      )}
                    </div>

                    {/* ── Workshop jobs ── */}
                    {analytics.workshopJobs.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                            <Wrench size={14} className="text-orange-500" />أعمال الورشة
                            <span className="text-xs font-normal text-gray-400 mr-1">({analytics.workshopJobs.length} سجل)</span>
                          </h3>
                          <button
                            onClick={() => {
                              const plate = analytics.vehicle.plate_number || selectedPlate || "vehicle";
                              const date  = new Date().toLocaleDateString("en-CA");
                              const rows = analytics.workshopJobs.map(job => ({
                                "العنوان":        job.title || "",
                                "الوصف":          job.description || "",
                                "نوع العمل":      job.job_type || "",
                                "الحساب على":     job.invoice_target === "inventory" ? "المستودع" : "السيارة",
                                "تكلفة القطع":    job.parts_cost ?? 0,
                                "إجمالي التكلفة": job.total_cost ?? 0,
                                "الحالة":         job.status === "completed" ? "مكتمل" : "قيد التنفيذ",
                                "تاريخ الإنشاء":  job.created_at ? job.created_at.slice(0, 10) : "",
                              }));
                              rows.push({
                                "العنوان":        "الإجمالي",
                                "الوصف":          "",
                                "نوع العمل":      "",
                                "الحساب على":     "",
                                "تكلفة القطع":    analytics.workshopJobs.reduce((s, j) => s + (j.parts_cost || 0), 0),
                                "إجمالي التكلفة": analytics.workshopJobs.reduce((s, j) => s + (j.total_cost || 0), 0),
                                "الحالة":         "",
                                "تاريخ الإنشاء":  "",
                              });
                              const ws = XLSX.utils.json_to_sheet(rows);
                              const wb = XLSX.utils.book_new();
                              XLSX.utils.book_append_sheet(wb, ws, "أعمال الورشة");
                              XLSX.writeFile(wb, `أعمال_الورشة_${plate}_${date}.xlsx`);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors"
                          >
                            <Download size={13} />تصدير Excel
                          </button>
                        </div>
                        <div className="space-y-2">
                          {analytics.workshopJobs.slice(0,10).map(job => (
                            <div key={job.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 text-sm">
                              <div>
                                <div className="font-semibold text-gray-800">{String(job.description).slice(0,60)}</div>
                                <div className="text-xs text-gray-500 mt-0.5">{fmtDate(String(job.created_at))}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-bold text-orange-700">{fmt(job.total_cost||0)}</div>
                                <div className={`text-xs ${job.status==="completed"?"text-emerald-600":"text-orange-500"}`}>{job.status==="completed"?"مكتمل":"قيد التنفيذ"}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Fleet expenses ── */}
                    {analytics.fleetExpenses.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                            <FileText size={14} className="text-blue-500" />مصاريف الأسطول
                            <span className="text-xs font-normal text-gray-400 mr-1">({analytics.fleetExpenses.length} سجل)</span>
                          </h3>
                          <button
                            onClick={() => {
                              const plate = analytics.vehicle.plate_number || selectedPlate || "vehicle";
                              const date  = new Date().toLocaleDateString("en-CA");
                              const rows = analytics.fleetExpenses.map(e => ({
                                "نوع المصروف": e.expense_type || "",
                                "المبلغ":      e.amount ?? 0,
                                "التاريخ":     e.date || "",
                                "الوصف":       e.description || "",
                              }));
                              rows.push({
                                "نوع المصروف": "الإجمالي",
                                "المبلغ":      analytics.fleetExpenses.reduce((s, e) => s + (e.amount || 0), 0),
                                "التاريخ":     "",
                                "الوصف":       "",
                              });
                              const ws = XLSX.utils.json_to_sheet(rows);
                              const wb = XLSX.utils.book_new();
                              XLSX.utils.book_append_sheet(wb, ws, "مصاريف الأسطول");
                              XLSX.writeFile(wb, `مصاريف_الأسطول_${plate}_${date}.xlsx`);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors"
                          >
                            <Download size={13} />تصدير Excel
                          </button>
                        </div>
                        <div className="space-y-2">
                          {analytics.fleetExpenses.slice(0,15).map((e, i) => (
                            <div key={i} className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-2.5 border border-blue-100 text-sm">
                              <div>
                                <div className="font-semibold text-gray-800">{e.expense_type}</div>
                                <div className="text-xs text-gray-500">{e.description} · {e.date}</div>
                              </div>
                              <div className="font-bold text-blue-700">{fmt(e.amount||0)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {analytics.workshopJobs.length === 0 && analytics.fleetExpenses.length === 0 && analytics.trips.length === 0 && (
                      <div className="text-center py-12 text-gray-400">
                        <Activity size={32} className="mx-auto mb-2 text-gray-300" />
                        <p>لا توجد سجلات تاريخية</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ══════════════════════ REPORT TAB — بيان السيارة ══════════════════════ */}
                {tab === "report" && analytics && (() => {
                  const t = analytics.trips;

                  // ── Material type pivot ──
                  const matMap = new Map<string,{trips:number;revenue:number;diesel:number;work:number}>();
                  t.forEach(r => {
                    const k = r.material_type || "غير محدد";
                    const v = matMap.get(k) ?? {trips:0,revenue:0,diesel:0,work:0};
                    matMap.set(k, {
                      trips:   v.trips   + (r.trips_count||1),
                      revenue: v.revenue + (r.return_value_no_vat||0),
                      diesel:  v.diesel  + (r.material_expense_diesel||0),
                      work:    v.work    + (r.work_value||0),
                    });
                  });
                  const matRows = [...matMap.entries()].sort((a,b)=>b[1].trips-a[1].trips);

                  // ── Client pivot ──
                  const clientMap = new Map<string,{trips:number;revenue:number}>();
                  t.forEach(r => {
                    const k = r.client_name || "غير محدد";
                    const v = clientMap.get(k) ?? {trips:0,revenue:0};
                    clientMap.set(k, {trips:v.trips+(r.trips_count||1), revenue:v.revenue+(r.return_value_no_vat||0)});
                  });
                  const clientRows = [...clientMap.entries()].sort((a,b)=>b[1].trips-a[1].trips).slice(0,15);

                  // ── Driver pivot (this vehicle) ──
                  const driverMap = new Map<string,{trips:number;revenue:number;work:number;lastDate:string}>();
                  t.forEach(r => {
                    const k = r.driver_name || "غير محدد";
                    const v = driverMap.get(k) ?? {trips:0,revenue:0,work:0,lastDate:""};
                    const d = r.date||"";
                    driverMap.set(k, {
                      trips:   v.trips   + (r.trips_count||1),
                      revenue: v.revenue + (r.return_value_no_vat||0),
                      work:    v.work    + (r.work_value||0),
                      lastDate: d>v.lastDate ? d : v.lastDate,
                    });
                  });
                  const driverRows = [...driverMap.entries()].sort((a,b)=>b[1].trips-a[1].trips);

                  // ── Assigned drivers set (from driver_profiles) ──
                  const assignedSet = new Set<string>(
                    (analytics.assignedDrivers||[]).map(d => d.driver_name.trim())
                  );

                  // ── Fault pivot (maintenance_logs) ──
                  const faultMap = new Map<string,{count:number;total:number}>();
                  analytics.maintenanceLogs.forEach(ml => {
                    const k = ml.maintenance_type || "غير محدد";
                    const v = faultMap.get(k) ?? {count:0,total:0};
                    faultMap.set(k, {count:v.count+1, total:v.total+(ml.amount||0)});
                  });
                  const faultRows = [...faultMap.entries()].sort((a,b)=>b[1].count-a[1].count);

                  // ── Grand totals ──
                  const totTrips   = t.reduce((s,r)=>s+(r.trips_count||1),0);
                  const totRevenue = t.reduce((s,r)=>s+(r.return_value_no_vat||0),0);
                  const totCash    = t.reduce((s,r)=>s+(r.cash_collection||0),0);
                  const totWork    = t.reduce((s,r)=>s+(r.work_value||0),0);
                  const totDiesel  = t.reduce((s,r)=>s+(r.material_expense_diesel||0),0);
                  const netRevenue = totRevenue - analytics.costSummary.total;

                  // ── Excel export for this report ──
                  const exportReport = () => {
                    const wb = XLSX.utils.book_new();
                    // Summary sheet
                    const sumWs = XLSX.utils.aoa_to_sheet([
                      ["بيان السيارة — " + analytics.vehicle.plate_number],
                      ["التاريخ", new Date().toLocaleDateString("ar-SA")],
                      [],
                      ["إجمالي الردود","قيمة الرد","التحصيل النقدي","شغل اليد","مصروف الديزل","إجمالي التكاليف","صافي الإيراد"],
                      [totTrips, totRevenue, totCash, totWork, totDiesel, analytics.costSummary.total, netRevenue],
                    ]);
                    XLSX.utils.book_append_sheet(wb, sumWs, "الملخص");
                    // Material sheet
                    const matWs = XLSX.utils.aoa_to_sheet([
                      ["نوع الحمولة","عدد الردود","قيمة الرد","مصروف الديزل","شغل اليد"],
                      ...matRows.map(([k,v])=>[k,v.trips,v.revenue,v.diesel,v.work]),
                    ]);
                    XLSX.utils.book_append_sheet(wb, matWs, "الحمولات");
                    // Driver sheet
                    const drvWs = XLSX.utils.aoa_to_sheet([
                      ["السائق","عدد الردود","قيمة الرد","شغل اليد","آخر رحلة"],
                      ...driverRows.map(([k,v])=>[k,v.trips,v.revenue,v.work,v.lastDate]),
                    ]);
                    XLSX.utils.book_append_sheet(wb, drvWs, "السائقون");
                    // Faults sheet
                    if (faultRows.length > 0) {
                      const faultWs = XLSX.utils.aoa_to_sheet([
                        ["نوع العطل","عدد المرات","إجمالي التكلفة"],
                        ...faultRows.map(([k,v])=>[k,v.count,v.total]),
                      ]);
                      XLSX.utils.book_append_sheet(wb, faultWs, "الأعطال");
                    }
                    XLSX.writeFile(wb, `بيان_السيارة_${analytics.vehicle.plate_number}_${new Date().toISOString().slice(0,10)}.xlsx`);
                  };

                  // ── Print بيان السيارة كاملاً ──────────────────────────────
                  const printReport = () => {
                    const win = window.open("", "_blank", "width=1050,height=800");
                    if (!win) { alert("يرجى السماح بالنوافذ المنبثقة لطباعة التقرير"); return; }
                    const now = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
                    const LOGO  = window.location.origin + "/logo.png";
                    const JEFER = window.location.origin + "/jefer-logo-new.png";
                    const f = (n: number) => n.toLocaleString("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

                    const summaryCards = `<div class="grid6">
                      ${([
                        { label:"إجمالي الردود",  val:totTrips.toLocaleString("ar-SA"), unit:"رد",   color:"#1d4ed8" },
                        { label:"قيمة الرد",       val:f(totRevenue),                   unit:"ريال", color:"#059669" },
                        { label:"التحصيل النقدي",  val:f(totCash),                      unit:"ريال", color:"#0d9488" },
                        { label:"شغل اليد",        val:f(totWork),                      unit:"ريال", color:"#7c3aed" },
                        { label:"مصروف الديزل",    val:f(totDiesel),                    unit:"ريال", color:"#d97706" },
                        { label:"صافي الإيراد",    val:f(netRevenue),                   unit:"ريال", color:netRevenue>=0?"#16a34a":"#dc2626" },
                      ] as const).map(c=>`<div class="kpi-card"><p class="kpi-label">${c.label}</p><p class="kpi-val" style="color:${c.color}">${c.val}</p><p class="kpi-unit">${c.unit}</p></div>`).join("")}
                    </div>`;

                    const matSection = matRows.length > 0 ? `<div class="section"><div class="sec-title">📦 أنواع الحمولات</div>
                      <table><thead><tr><th>نوع الحمولة</th><th>عدد الردود</th><th>قيمة الرد</th><th>مصروف الديزل</th><th>شغل اليد</th></tr></thead><tbody>
                      ${matRows.map(([k,v])=>`<tr><td>${k}</td><td class="center">${v.trips.toLocaleString("ar-SA")}</td><td>${f(v.revenue)}</td><td>${f(v.diesel)}</td><td>${f(v.work)}</td></tr>`).join("")}
                      <tr class="total-row"><td>الإجمالي</td><td class="center">${totTrips.toLocaleString("ar-SA")}</td><td>${f(totRevenue)}</td><td>${f(totDiesel)}</td><td>${f(totWork)}</td></tr>
                      </tbody></table></div>` : "";

                    const clientSection = clientRows.length > 0 ? `<div class="section"><div class="sec-title">👥 أكثر العملاء (${clientRows.length})</div>
                      <table><thead><tr><th>#</th><th>العميل</th><th>عدد الردود</th><th>قيمة الرد</th><th>النسبة %</th></tr></thead><tbody>
                      ${clientRows.map(([k,v],i)=>`<tr><td class="center gray">${i+1}</td><td>${k}</td><td class="center blue">${v.trips.toLocaleString("ar-SA")}</td><td>${f(v.revenue)}</td><td>${((v.trips/totTrips)*100).toFixed(1)}%</td></tr>`).join("")}
                      </tbody></table></div>` : "";

                    const driverSection = driverRows.length > 0 ? `<div class="section"><div class="sec-title">🚗 السائقون على هذه السيارة</div>
                      <table><thead><tr><th>#</th><th>السائق</th><th>عدد الردود</th><th>قيمة الرد</th><th>شغل اليد</th><th>آخر رحلة</th></tr></thead><tbody>
                      ${driverRows.map(([k,v],i)=>`<tr${assignedSet.has(k.trim())?' class="assigned"':""}><td class="center gray">${i===0?"🏆":i===1?"🥈":i===2?"🥉":i+1}</td><td>${k}${assignedSet.has(k.trim())?` <span class="badge-blue">معين رسمياً</span>`:""}</td><td class="center blue">${v.trips.toLocaleString("ar-SA")}</td><td>${f(v.revenue)}</td><td>${f(v.work)}</td><td class="gray-sm">${v.lastDate||"—"}</td></tr>`).join("")}
                      </tbody></table></div>` : "";

                    const fleetSection = fleetDrivers && fleetDrivers.length > 0 ? `<div class="section"><div class="sec-title">📊 أكثر السائقين ردوداً على مستوى الأسطول</div>
                      <table><thead><tr><th>#</th><th>السائق</th><th>إجمالي الردود</th><th>قيمة الرد</th><th>شغل اليد</th><th>عدد السيارات</th></tr></thead><tbody>
                      ${fleetDrivers.slice(0,20).map((d,i)=>`<tr><td class="center gray">${i===0?"🏆":i===1?"🥈":i===2?"🥉":i+1}</td><td>${d.driver_name.trim()}${d.assigned_vehicle?` <span class="badge-rose">معين</span>`:""}</td><td class="center blue">${(d.total_trips||0).toLocaleString("ar-SA")}</td><td>${f(d.total_revenue||0)}</td><td>${f(d.total_work||0)}</td><td class="center">${d.vehicles_count}</td></tr>`).join("")}
                      </tbody></table></div>` : "";

                    const costSection = `<div class="section"><div class="sec-title">💰 ملخص التكاليف والمصاريف</div>
                      <div class="grid5">
                        ${([
                          { label:"مصروف الورشة المباشر", val:f(analytics.costSummary.maintenance) },
                          { label:"أوامر عمل الورشة",      val:f(analytics.costSummary.vehicle) },
                          { label:"مستودع الورشة",          val:f(analytics.costSummary.warehouse) },
                          { label:"مشتريات",                val:f(analytics.costSummary.purchases) },
                          { label:"مصروفات الأسطول",       val:f(analytics.costSummary.direct) },
                        ] as const).map(c=>`<div class="kpi-card"><p class="kpi-label">${c.label}</p><p class="kpi-val red">${c.val}</p></div>`).join("")}
                      </div>
                      <div class="total-bar"><span>إجمالي التكاليف</span><span>${f(analytics.costSummary.total)}</span></div>
                    </div>`;

                    const faultSection = faultRows.length > 0 ? `<div class="section"><div class="sec-title">⚠️ أكثر الأعطال والصيانة شيوعاً</div>
                      <table><thead><tr><th>#</th><th>نوع العطل/الصيانة</th><th>عدد المرات</th><th>إجمالي التكلفة</th><th>النسبة %</th></tr></thead><tbody>
                      ${faultRows.map(([k,v],i)=>`<tr><td class="center gray">${i+1}</td><td>${k}</td><td class="center"><span class="bo">${v.count} مرة</span></td><td class="red">${f(v.total)}</td><td>${((v.count/faultRows.reduce((s,[,x])=>s+x.count,0))*100).toFixed(1)}%</td></tr>`).join("")}
                      </tbody></table></div>` : "";

                    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>بيان السيارة — ${analytics.vehicle.plate_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;padding:20px 24px;color:#111;background:#fff;font-size:12px}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.06;width:65%;pointer-events:none;z-index:-1}
.doc-header{text-align:center;border-bottom:3px solid #103c68;padding-bottom:14px;margin-bottom:18px}
.jefer-logo{height:60px;object-fit:contain;display:block;margin:0 auto 8px}
.doc-title{font-size:20px;font-weight:900;color:#103c68}
.doc-sub{font-size:13px;color:#333;font-weight:600;margin-top:4px}
.section{margin-bottom:16px}
.sec-title{font-size:13px;font-weight:900;color:#103c68;border-right:4px solid #103c68;padding-right:8px;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:12px}
thead tr{background:#103c68;color:#fff}
th{padding:7px 8px;text-align:right;font-weight:700}
td{padding:6px 8px;border-bottom:1px solid #e5e7eb;vertical-align:middle}
tr:nth-child(even) td{background:#f8fafc}
.total-row td{background:#eff6ff;font-weight:700;border-top:2px solid #103c68;color:#103c68}
.assigned td{background:#eef2ff!important}
.grid6{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:16px}
.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:10px}
.kpi-card{border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center}
.kpi-label{font-size:11px;color:#444;font-weight:600;margin-bottom:4px}
.kpi-val{font-size:14px;font-weight:900;margin-bottom:2px}
.kpi-unit{font-size:11px;color:#555;font-weight:600}
.center{text-align:center}
.blue{color:#1d4ed8;font-weight:700}
.red{color:#dc2626;font-weight:600}
.gray{color:#444;font-size:12px}
.gray-sm{color:#444;font-size:11px}
.badge-blue{background:#4f46e5;color:#fff;border-radius:12px;padding:1px 6px;font-size:9px;font-weight:700}
.badge-rose{background:#e11d48;color:#fff;border-radius:12px;padding:1px 6px;font-size:9px;font-weight:700}
.bo{background:#fee2e2;color:#991b1b;border-radius:12px;padding:2px 6px;font-size:10px;font-weight:700}
.total-bar{background:#1f2937;color:#fff;border-radius:8px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:900;margin-top:4px}
.ft{margin-top:18px;font-size:11px;color:#555;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
@page{size:A4 portrait;margin:1cm}html{width:210mm}body{width:210mm;margin:0;padding:0}@media print{body{padding:4px}.no-break{page-break-inside:avoid}}
</style>
</head><body>
<img class="wm" src="${LOGO}" alt="" />
<div class="doc-header">
  <img class="jefer-logo" src="${JEFER}" alt="Jefer" />
  <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:#103c68;text-align:center;margin-top:2px;margin-bottom:4px">MKGH</div>
  <div class="doc-title">بيان السيارة — ${analytics.vehicle.plate_number}</div>
  <div class="doc-sub">${analytics.vehicle.vehicle_type||"غير محدد"} — تاريخ الطباعة: ${now} — إجمالي سجلات الرحلات: ${t.length}</div>
</div>
${summaryCards}
${matSection}
${clientSection}
${driverSection}
${fleetSection}
${costSection}
${faultSection}
<div class="ft">تم إنشاء هذا البيان بواسطة نظام MKGH — ${now}</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`);
                    win.document.close();
                  };

                  return (
                    <div className="space-y-7 pb-6" dir="rtl">

                      {/* ── Header ── */}
                      <div className="bg-gradient-to-l from-blue-700 to-indigo-800 rounded-2xl p-5 text-white flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <h2 className="text-xl font-black">بيان السيارة</h2>
                          <p className="text-blue-200 text-sm mt-0.5">
                            {analytics.vehicle.plate_number} — {analytics.vehicle.vehicle_type || "غير محدد"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-left text-xs text-blue-200 ml-3">
                            <p>{new Date().toLocaleDateString("ar-SA")}</p>
                            <p>{t.length} سجل رحلة</p>
                          </div>
                          <button onClick={exportReport}
                            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-sm px-3 py-2 rounded-xl font-semibold transition-colors">
                            <Download size={14}/> تصدير Excel
                          </button>
                          <button onClick={printReport}
                            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-sm px-3 py-2 rounded-xl font-semibold transition-colors">
                            <Printer size={14}/> طباعة
                          </button>
                        </div>
                      </div>

                      {/* ── Section 1: Revenue summary cards ── */}
                      <div>
                        <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                          <TrendingUp size={15} className="text-blue-600"/> إجمالي الإيراد والردود
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                          {([
                            {label:"إجمالي الردود",   val:totTrips.toLocaleString("ar-SA"),   unit:"رد",   bg:"bg-blue-50 border-blue-200",     txt:"text-blue-700"},
                            {label:"قيمة الرد",       val:fmt(totRevenue),                     unit:"ريال", bg:"bg-emerald-50 border-emerald-200",txt:"text-emerald-700"},
                            {label:"التحصيل النقدي",  val:fmt(totCash),                        unit:"ريال", bg:"bg-teal-50 border-teal-200",     txt:"text-teal-700"},
                            {label:"شغل اليد",        val:fmt(totWork),                        unit:"ريال", bg:"bg-purple-50 border-purple-200", txt:"text-purple-700"},
                            {label:"مصروف الديزل",    val:fmt(totDiesel),                      unit:"ريال", bg:"bg-orange-50 border-orange-200", txt:"text-orange-700"},
                            {label:"صافي الإيراد",    val:fmt(netRevenue), unit:"ريال",
                              bg: netRevenue>=0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200",
                              txt: netRevenue>=0 ? "text-green-700" : "text-red-700"},
                          ] as const).map(c=>(
                            <div key={c.label} className={`border rounded-xl p-3 ${c.bg}`}>
                              <p className="text-xs text-gray-500 mb-1 leading-tight">{c.label}</p>
                              <p className={`text-base font-black ${c.txt} leading-tight`}>{c.val}</p>
                              <p className="text-xs text-gray-400">{c.unit}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── Section 2: Material Types ── */}
                      {matRows.length > 0 && (
                        <div>
                          <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                            <Package size={15} className="text-amber-600"/> أنواع الحمولات التي اشتغلت عليها
                          </h3>
                          <div className="overflow-x-auto rounded-xl border border-amber-200">
                            <table className="w-full text-sm">
                              <thead className="bg-amber-50">
                                <tr>
                                  {["نوع الحمولة","عدد الردود","قيمة الرد","مصروف الديزل","شغل اليد"].map(h=>(
                                    <th key={h} className="px-3 py-2 text-right text-xs font-bold text-amber-800 whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {matRows.map(([k,v],i)=>(
                                  <tr key={k} className={`border-t border-gray-100 ${i%2===0?"bg-white":"bg-amber-50/30"} hover:bg-amber-50/60`}>
                                    <td className="px-3 py-2 font-semibold">{k}</td>
                                    <td className="px-3 py-2 text-center font-bold text-blue-700">{v.trips.toLocaleString("ar-SA")}</td>
                                    <td className="px-3 py-2 text-emerald-700 font-semibold">{fmt(v.revenue)}</td>
                                    <td className="px-3 py-2 text-orange-700">{fmt(v.diesel)}</td>
                                    <td className="px-3 py-2 text-purple-700">{fmt(v.work)}</td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-amber-300 bg-amber-100 font-bold text-sm">
                                  <td className="px-3 py-2 text-amber-800">الإجمالي</td>
                                  <td className="px-3 py-2 text-center text-blue-700">{totTrips.toLocaleString("ar-SA")}</td>
                                  <td className="px-3 py-2 text-emerald-700">{fmt(totRevenue)}</td>
                                  <td className="px-3 py-2 text-orange-700">{fmt(totDiesel)}</td>
                                  <td className="px-3 py-2 text-purple-700">{fmt(totWork)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* ── Section 3: Top Clients ── */}
                      {clientRows.length > 0 && (
                        <div>
                          <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                            <Users size={15} className="text-teal-600"/> أكثر العملاء ({clientRows.length})
                          </h3>
                          <div className="overflow-x-auto rounded-xl border border-teal-200">
                            <table className="w-full text-sm">
                              <thead className="bg-teal-50">
                                <tr>
                                  {["#","العميل","عدد الردود","قيمة الرد","النسبة %"].map(h=>(
                                    <th key={h} className="px-3 py-2 text-right text-xs font-bold text-teal-800 whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {clientRows.map(([k,v],i)=>(
                                  <tr key={k} className={`border-t border-gray-100 ${i%2===0?"bg-white":"bg-teal-50/30"} hover:bg-teal-50/60`}>
                                    <td className="px-3 py-2 text-gray-400 text-xs">{i+1}</td>
                                    <td className="px-3 py-2 font-semibold">{k}</td>
                                    <td className="px-3 py-2 text-center font-bold text-blue-700">{v.trips.toLocaleString("ar-SA")}</td>
                                    <td className="px-3 py-2 text-emerald-700 font-semibold">{fmt(v.revenue)}</td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-16">
                                          <div className="bg-teal-500 h-1.5 rounded-full" style={{width:`${Math.min(100,(v.trips/totTrips)*100).toFixed(0)}%`}}/>
                                        </div>
                                        <span className="text-xs text-gray-600">{((v.trips/totTrips)*100).toFixed(1)}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* ── Section 4: Drivers on this vehicle ── */}
                      {driverRows.length > 0 && (
                        <div>
                          <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                            <User size={15} className="text-indigo-600"/>
                            السائقون على هذه السيارة
                            {assignedSet.size > 0 && (
                              <span className="bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full px-2 py-0.5">
                                {assignedSet.size} معين رسمياً
                              </span>
                            )}
                          </h3>
                          <div className="overflow-x-auto rounded-xl border border-indigo-200">
                            <table className="w-full text-sm">
                              <thead className="bg-indigo-50">
                                <tr>
                                  {["#","السائق","عدد الردود","قيمة الرد","شغل اليد","آخر رحلة","السيارات الأخرى"].map(h=>(
                                    <th key={h} className="px-3 py-2 text-right text-xs font-bold text-indigo-800 whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {driverRows.map(([k,v],i)=>{
                                  const isAssigned = assignedSet.has(k.trim());
                                  const rowProfile = (analytics.assignedDrivers||[]).find(d=>d.driver_name.trim()===k.trim());
                                  return (
                                    <>
                                      <tr key={k} className={`border-t border-gray-100 ${isAssigned?"bg-indigo-50/50 border-r-2 border-r-indigo-400":i%2===0?"bg-white":"bg-gray-50/50"} hover:bg-indigo-50/60`}>
                                        <td className="px-3 py-2 text-gray-400 text-xs">
                                          {i===0?"🏆":i===1?"🥈":i===2?"🥉":i+1}
                                        </td>
                                        <td className="px-3 py-2">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold">{k}</span>
                                            {isAssigned && (
                                              <span className="bg-indigo-600 text-white text-xs font-bold rounded-full px-2 py-0.5 whitespace-nowrap">
                                                معين رسمياً
                                              </span>
                                            )}
                                            {rowProfile && (
                                              <span className={`text-xs font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${rowProfile.status==="نشط"||rowProfile.status==="في رحلة"?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-600"}`}>
                                                {rowProfile.status}
                                              </span>
                                            )}
                                          </div>
                                          {rowProfile?.phone && (
                                            <p className="text-xs text-gray-400 mt-0.5 mr-0">{rowProfile.phone}</p>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-center font-black text-blue-700 text-base">{v.trips.toLocaleString("ar-SA")}</td>
                                        <td className="px-3 py-2 text-emerald-700 font-semibold">{fmt(v.revenue)}</td>
                                        <td className="px-3 py-2 text-purple-700">{fmt(v.work)}</td>
                                        <td className="px-3 py-2 text-gray-500 text-xs">{v.lastDate ? fmtDate(v.lastDate) : "—"}</td>
                                        <td className="px-3 py-2">
                                          <button
                                            onClick={()=>{
                                              if (expandedDriver===k) setExpandedDriver(null);
                                              else setExpandedDriver(k);
                                            }}
                                            className="text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2 flex items-center gap-1">
                                            {expandedDriver===k ? <X size={11}/> : <Eye size={11}/>}
                                            {expandedDriver===k ? "إخفاء" : "عرض"}
                                          </button>
                                        </td>
                                      </tr>
                                      {expandedDriver===k && (
                                        <tr key={k+"-exp"} className="bg-indigo-50/60">
                                          <td colSpan={7} className="px-4 py-3">
                                            {!driverVehicles ? (
                                              <p className="text-xs text-gray-400 animate-pulse">جاري التحميل...</p>
                                            ) : driverVehicles.length === 0 ? (
                                              <p className="text-xs text-gray-400">لا توجد سيارات أخرى</p>
                                            ) : (
                                              <div>
                                                <p className="text-xs font-bold text-indigo-700 mb-2">السيارات التي اشتغل عليها {k}:</p>
                                                <div className="flex flex-wrap gap-2">
                                                  {driverVehicles.map(dv=>(
                                                    <div key={dv.plate} className={`rounded-xl px-3 py-1.5 text-xs font-semibold border ${dv.plate===selectedPlate?"bg-indigo-600 text-white border-indigo-600":dv.total_trips===0?"bg-amber-50 border-amber-200 text-amber-700":"bg-white border-indigo-200 text-indigo-700"}`}>
                                                      <span className="font-black">{dv.plate}</span>
                                                      {dv.total_trips===0 ? (
                                                        <span className="mr-1 opacity-70"> — معين (بدون رحلات)</span>
                                                      ) : (
                                                        <>
                                                          <span className="mx-1 opacity-60">|</span>
                                                          <span>{dv.total_trips.toLocaleString("ar-SA")} رد</span>
                                                          <span className="mx-1 opacity-60">|</span>
                                                          <span>{fmt(dv.total_revenue)}</span>
                                                        </>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      )}
                                    </>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* ── Section 5: Fleet-wide driver ranking ── */}
                      {fleetDrivers && fleetDrivers.length > 0 && (
                        <div>
                          <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                            <TrendingUp size={15} className="text-rose-600"/> أكثر السائقين ردوداً على مستوى الأسطول
                          </h3>
                          <div className="overflow-x-auto rounded-xl border border-rose-200">
                            <table className="w-full text-sm">
                              <thead className="bg-rose-50">
                                <tr>
                                  {["#","السائق","إجمالي الردود","قيمة الرد","شغل اليد","عدد السيارات","السيارات"].map(h=>(
                                    <th key={h} className="px-3 py-2 text-right text-xs font-bold text-rose-800 whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {fleetDrivers.slice(0,20).map((d,i)=>(
                                  <tr key={d.driver_name} className={`border-t border-gray-100 ${d.assigned_vehicle?"bg-rose-50/40 border-r-2 border-r-rose-400":i%2===0?"bg-white":"bg-rose-50/20"} hover:bg-rose-50/60`}>
                                    <td className="px-3 py-2 text-gray-400 text-xs font-bold">
                                      {i===0?"🏆":i===1?"🥈":i===2?"🥉":i+1}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold">{d.driver_name.trim()}</span>
                                        {d.assigned_vehicle && (
                                          <span className="bg-rose-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5 whitespace-nowrap">
                                            معين
                                          </span>
                                        )}
                                        {d.driver_status && (
                                          <span className={`text-xs font-medium rounded-full px-1.5 py-0.5 whitespace-nowrap ${d.driver_status==="نشط"||d.driver_status==="في رحلة"?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500"}`}>
                                            {d.driver_status}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-center font-black text-blue-700 text-base">{(d.total_trips||0).toLocaleString("ar-SA")}</td>
                                    <td className="px-3 py-2 text-emerald-700 font-semibold">{fmt(d.total_revenue||0)}</td>
                                    <td className="px-3 py-2 text-purple-700">{fmt(d.total_work||0)}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span className="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 text-xs font-bold">
                                        {d.vehicles_count}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-wrap gap-1">
                                        {(d.vehicles_list||"").split(",").filter(Boolean).slice(0,5).map((p: string)=>(
                                          <span key={p} onClick={()=>{ setSelectedPlate(p.trim()); setTab("overview"); }}
                                            className={`cursor-pointer text-xs rounded-lg px-2 py-0.5 font-semibold border transition-colors ${p.trim()===d.assigned_vehicle?"ring-1 ring-rose-400":""} ${p.trim()===selectedPlate?"bg-rose-600 text-white border-rose-600":"bg-white border-rose-200 text-rose-700 hover:bg-rose-50"}`}>
                                            {p.trim()}
                                            {p.trim()===d.assigned_vehicle && <span className="mr-1 text-xs opacity-75">●</span>}
                                          </span>
                                        ))}
                                        {(d.vehicles_list||"").split(",").filter(Boolean).length > 5 && (
                                          <span className="text-xs text-gray-400">+{(d.vehicles_list||"").split(",").filter(Boolean).length-5}</span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* ── Section 6: Expense summary ── */}
                      <div>
                        <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                          <DollarSign size={15} className="text-red-600"/> ملخص التكاليف والمصاريف
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
                          {([
                            {label:"مصروف الورشة المباشر", val:fmt(analytics.costSummary.maintenance), bg:"bg-rose-50 border-rose-200",     txt:"text-rose-700"},
                            {label:"أوامر عمل الورشة",      val:fmt(analytics.costSummary.vehicle),     bg:"bg-orange-50 border-orange-200", txt:"text-orange-700"},
                            {label:"مستودع الورشة",          val:fmt(analytics.costSummary.warehouse),   bg:"bg-yellow-50 border-yellow-200", txt:"text-yellow-700"},
                            {label:"مشتريات",                val:fmt(analytics.costSummary.purchases),   bg:"bg-purple-50 border-purple-200", txt:"text-purple-700"},
                            {label:"مصروفات الأسطول",       val:fmt(analytics.costSummary.direct),      bg:"bg-red-50 border-red-200",       txt:"text-red-700"},
                          ] as const).map(c=>(
                            <div key={c.label} className={`border rounded-xl p-3 ${c.bg}`}>
                              <p className="text-xs text-gray-500 mb-1 leading-tight">{c.label}</p>
                              <p className={`text-base font-black ${c.txt}`}>{c.val}</p>
                            </div>
                          ))}
                        </div>
                        <div className="bg-gray-800 text-white rounded-xl p-4 flex items-center justify-between">
                          <span className="font-bold">إجمالي التكاليف</span>
                          <span className="text-xl font-black">{fmt(analytics.costSummary.total)}</span>
                        </div>
                      </div>

                      {/* ── Section 7: Common faults ── */}
                      {faultRows.length > 0 && (
                        <div>
                          <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                            <AlertTriangle size={15} className="text-red-600"/> أكثر الأعطال والصيانة شيوعاً
                          </h3>
                          <div className="overflow-x-auto rounded-xl border border-red-200">
                            <table className="w-full text-sm">
                              <thead className="bg-red-50">
                                <tr>
                                  {["#","نوع العطل/الصيانة","عدد المرات","إجمالي التكلفة","النسبة %"].map(h=>(
                                    <th key={h} className="px-3 py-2 text-right text-xs font-bold text-red-800 whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {faultRows.map(([k,v],i)=>(
                                  <tr key={k} className={`border-t border-gray-100 ${i===0?"bg-red-50/60":i%2===0?"bg-white":"bg-red-50/20"} hover:bg-red-50/50`}>
                                    <td className="px-3 py-2 text-xs font-bold text-gray-400">{i+1}</td>
                                    <td className="px-3 py-2 font-semibold">
                                      {i===0 && <span className="inline-block bg-red-100 text-red-700 text-xs rounded-full px-2 py-0.5 ml-1 font-bold">الأكثر</span>}
                                      {k}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-black ${i===0?"bg-red-200 text-red-800":i===1?"bg-orange-100 text-orange-700":i===2?"bg-yellow-100 text-yellow-700":"bg-gray-100 text-gray-600"}`}>
                                        {v.count} مرة
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-red-700 font-semibold">{fmt(v.total)}</td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-16">
                                          <div className="bg-red-500 h-1.5 rounded-full" style={{width:`${Math.min(100,(v.count/faultRows[0][1].count)*100).toFixed(0)}%`}}/>
                                        </div>
                                        <span className="text-xs text-gray-500">{((v.count/faultRows.reduce((s,[,x])=>s+x.count,0))*100).toFixed(1)}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {t.length===0 && analytics.maintenanceLogs.length===0 && (
                        <div className="text-center py-16 text-gray-400">
                          <FileText size={40} className="mx-auto mb-3 text-gray-300"/>
                          <p className="text-base font-medium">لا توجد بيانات كافية لإنشاء البيان</p>
                          <p className="text-sm mt-1">أضف رحلات أو سجلات صيانة لهذه السيارة</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ══════════════════════ FULL REPORT TAB — تقرير PDF شامل ══════════════════════ */}
                {tab === "full-report" && analytics && (() => {
                  // ── Date range filter ──
                  const hasDateFilter = !!(reportFrom || reportTo);
                  const inRange = (d?: string | null) => {
                    if (!hasDateFilter) return true;
                    if (!d) return false;
                    const t = new Date(d).getTime();
                    if (isNaN(t)) return false;
                    if (reportFrom && t < new Date(reportFrom).getTime()) return false;
                    if (reportTo && t > new Date(reportTo).getTime() + 86399999) return false;
                    return true;
                  };

                  const fTrips             = analytics.trips.filter(r => inRange(r.date));
                  const fBreakdowns        = analytics.breakdowns.filter(b => inRange(b.created_at));
                  const fLegacyBreakdowns  = analytics.legacyBreakdowns.filter(b => inRange(b.created_at));
                  const fMaintenanceLogs   = analytics.maintenanceLogs.filter(m => inRange(m.maintenance_date || m.entry_time));
                  const fWorkshopJobs      = analytics.workshopJobs.filter(j => inRange(j.created_at));
                  const fFleetExpenses     = analytics.fleetExpenses.filter(e => inRange(e.date));
                  const fPurchaseInvoices  = analytics.purchaseInvoices.filter(p => inRange(p.invoice_date || p.created_at));

                  const totTrips   = fTrips.reduce((s,r)=>s+(r.trips_count||1),0);
                  const totRevenue = fTrips.reduce((s,r)=>s+(r.return_value_no_vat||0),0);

                  const warehouseCost   = fWorkshopJobs.filter(j=>j.invoice_target==="inventory").reduce((s,j)=>s+(j.total_cost||0),0);
                  const vehicleCost     = fWorkshopJobs.filter(j=>j.invoice_target!=="inventory").reduce((s,j)=>s+(j.total_cost||0),0);
                  const directCost      = fFleetExpenses.reduce((s,e)=>s+(e.amount||0),0);
                  const maintenanceCost = fMaintenanceLogs.reduce((s,m)=>s+(m.amount||0),0);
                  const totalPurchaseCost = fPurchaseInvoices.reduce((s,p)=>s+((p.price_after_vat||0)*(p.quantity||1)),0);
                  const costSummary = {
                    warehouse: warehouseCost, vehicle: vehicleCost, direct: directCost,
                    purchases: totalPurchaseCost, maintenance: maintenanceCost,
                    total: vehicleCost + directCost + totalPurchaseCost + maintenanceCost,
                  };
                  const netRevenue = totRevenue - costSummary.total;
                  const workshopVisits = fWorkshopJobs.length + fMaintenanceLogs.length;

                  // ── Driver ↔ fault correlation (breakdowns + legacy breakdowns + maintenance logs) ──
                  const driverFaultMap = new Map<string, number>();
                  [...fBreakdowns, ...fLegacyBreakdowns].forEach(bd => {
                    const name = (bd.driver_name || "").trim();
                    if (!name) return;
                    driverFaultMap.set(name, (driverFaultMap.get(name)||0) + 1);
                  });
                  fMaintenanceLogs.forEach(m => {
                    const name = (m.driver_name || "").trim();
                    if (!name) return;
                    driverFaultMap.set(name, (driverFaultMap.get(name)||0) + 1);
                  });
                  const driverFaultRows = [...driverFaultMap.entries()].sort((a,b)=>b[1]-a[1]);

                  const totalFaultCount = fBreakdowns.length + fLegacyBreakdowns.length + fMaintenanceLogs.length;
                  const openFaultCount = fBreakdowns.filter(b=>b.status==="open").length + fLegacyBreakdowns.filter(b=>b.status==="open").length;

                  // ── Fault type analysis (mirrors backend commonFaults logic, date-filtered) ──
                  const faultTypeMap = new Map<string, number>();
                  fLegacyBreakdowns.forEach(b => { if (b.breakdown_type) faultTypeMap.set(b.breakdown_type, (faultTypeMap.get(b.breakdown_type)||0) + 1); });
                  fMaintenanceLogs.forEach(m => { if (m.maintenance_type) faultTypeMap.set(m.maintenance_type, (faultTypeMap.get(m.maintenance_type)||0) + 1); });
                  const commonFaults = [...faultTypeMap.entries()]
                    .map(([fault_type, count]) => ({ fault_type, count }))
                    .sort((a,b)=>b.count-a.count).slice(0,6);

                  // ── Combined chronological fault/maintenance list ──
                  type CombinedFault = { date:string; type:string; driver:string; status:string; desc:string };
                  const combinedFaults: CombinedFault[] = [
                    ...fBreakdowns.map(b => ({ date:b.created_at||"", type:"عطل مركبة", driver:b.driver_name||"—", status:b.status==="open"?"مفتوح":"تم الحل", desc:b.description||"" })),
                    ...fLegacyBreakdowns.map(b => ({ date:b.created_at||"", type:b.breakdown_type||"عطل", driver:b.driver_name||"—", status:b.status==="open"?"مفتوح":"تم الحل", desc:b.description||"" })),
                    ...fMaintenanceLogs.map(m => ({ date:m.maintenance_date||m.entry_time||"", type:m.maintenance_type||"صيانة", driver:m.driver_name||"—", status:"—", desc:m.description||"" })),
                  ].sort((a,b)=>(b.date||"").localeCompare(a.date||""));

                  // ── Combined parts/repairs list ──
                  type CombinedPart = { title:string; source:string; cost:number; date:string };
                  const combinedParts: CombinedPart[] = [
                    ...(vehicleParts?.workshopParts||[]).map(p=>({ title:p.title, source:"ورشة", cost:p.total_cost||0, date:p.created_at||"" })),
                    ...(vehicleParts?.purchaseParts||[]).map(p=>({ title:p.title, source:"مشتريات", cost:p.actual_cost||p.estimated_cost||0, date:p.created_at||"" })),
                    ...(vehicleParts?.directExpenses||[]).map(e=>({ title:e.title, source:"مباشر (سائق)", cost:e.amount||0, date:e.date||"" })),
                    ...(vehicleParts?.inventoryParts||[]).map(p=>({ title:p.item_name, source:"مخزن الورشة", cost:p.total_cost||0, date:p.created_at||"" })),
                  ].filter(p => inRange(p.date)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
                  const partsTotal = combinedParts.reduce((s,p)=>s+(p.cost||0),0);

                  // ── Driver history (recomputed from filtered trips) ──
                  const driverHistMap = new Map<string, { trip_count:number; last_date:string }>();
                  fTrips.forEach(r => {
                    const name = (r.driver_name || "").trim();
                    if (!name) return;
                    const v = driverHistMap.get(name) ?? { trip_count:0, last_date:"" };
                    v.trip_count += r.trips_count || 1;
                    if (r.date && (!v.last_date || r.date > v.last_date)) v.last_date = r.date;
                    driverHistMap.set(name, v);
                  });
                  const driverHistory = hasDateFilter
                    ? [...driverHistMap.entries()].map(([driver_name, v]) => ({ driver_name, trip_count:v.trip_count, last_date:v.last_date })).sort((a,b)=>b.trip_count-a.trip_count)
                    : analytics.driverHistory;

                  // ── Assigned drivers set ──
                  const assignedSet = new Set<string>((analytics.assignedDrivers||[]).map(d => d.driver_name.trim()));

                  // ── Print التقرير الشامل (PDF) ──────────────────────────────
                  const printFullReport = () => {
                    const win = window.open("", "_blank", "width=1050,height=800");
                    if (!win) { alert("يرجى السماح بالنوافذ المنبثقة لطباعة التقرير"); return; }
                    const now = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
                    const LOGO  = window.location.origin + "/logo.png";
                    const JEFER = window.location.origin + "/jefer-logo-new.png";
                    const f = (n: number) => n.toLocaleString("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

                    const summaryCards = `<div class="grid6">
                      ${([
                        { label:"إجمالي الرحلات",   val:totTrips.toLocaleString("ar-SA"),      unit:"رحلة", color:"#1d4ed8" },
                        { label:"صافي الإيراد",      val:f(netRevenue),                          unit:"ريال", color:netRevenue>=0?"#16a34a":"#dc2626" },
                        { label:"إجمالي التكاليف",   val:f(costSummary.total),        unit:"ريال", color:"#dc2626" },
                        { label:"عدد الأعطال",       val:totalFaultCount.toLocaleString("ar-SA"),unit:"سجل",  color:"#d97706" },
                        { label:"زيارات الورشة",     val:workshopVisits.toLocaleString("ar-SA"), unit:"زيارة", color:"#7c3aed" },
                        { label:"إجمالي المشتريات",  val:f(totalPurchaseCost),        unit:"ريال", color:"#0d9488" },
                      ] as const).map(c=>`<div class="kpi-card"><p class="kpi-label">${c.label}</p><p class="kpi-val" style="color:${c.color}">${c.val}</p><p class="kpi-unit">${c.unit}</p></div>`).join("")}
                    </div>`;

                    const vehicleInfoSection = `<div class="section"><div class="sec-title">🚚 بيانات السيارة</div>
                      <div class="grid4">
                        <div class="kpi-card"><p class="kpi-label">رقم اللوحة</p><p class="kpi-val" style="font-size:13px">${analytics.vehicle.plate_number}</p></div>
                        <div class="kpi-card"><p class="kpi-label">النوع</p><p class="kpi-val" style="font-size:13px">${analytics.vehicle.vehicle_type||"—"}</p></div>
                        <div class="kpi-card"><p class="kpi-label">الحالة</p><p class="kpi-val" style="font-size:13px">${analytics.vehicle.status||"—"}</p></div>
                        <div class="kpi-card"><p class="kpi-label">السائق الحالي</p><p class="kpi-val" style="font-size:13px">${analytics.vehicle.driver_name||"—"}</p></div>
                      </div>
                    </div>`;

                    const docsSection = `<div class="section"><div class="sec-title">🛡️ وثائق الامتثال</div>
                      <table><thead><tr><th>نوع الوثيقة</th><th>من</th><th>إلى</th><th>الحالة</th></tr></thead><tbody>
                      ${DOC_TYPES.map(type => {
                        const doc = analytics.complianceDocs.find(d => d.doc_type === type);
                        const s = docStatus(doc);
                        return `<tr><td>${type}</td><td>${doc?fmtDate(doc.start_date):"—"}</td><td>${doc?fmtDate(doc.end_date):"—"}</td><td>${STATUS_CFG[s].label}</td></tr>`;
                      }).join("")}
                      ${analytics.complianceDocs.filter(d => !(DOC_TYPES as readonly string[]).includes(d.doc_type)).map(d=>`<tr><td>${d.doc_type}</td><td>${fmtDate(d.start_date)}</td><td>${fmtDate(d.end_date)}</td><td>${STATUS_CFG[docStatus(d)].label}</td></tr>`).join("")}
                      </tbody></table></div>`;

                    const faultAnalysisSection = commonFaults.length > 0 ? `<div class="section"><div class="sec-title">⚠️ تحليل أكثر الأعطال شيوعاً</div>
                      <table><thead><tr><th>#</th><th>نوع العطل/الصيانة</th><th>عدد المرات</th><th>النسبة %</th></tr></thead><tbody>
                      ${commonFaults.map((fl,i)=>`<tr><td class="center gray">${i+1}</td><td>${fl.fault_type}</td><td class="center"><span class="bo">${fl.count} مرة</span></td><td>${((fl.count/commonFaults.reduce((s,x)=>s+x.count,0))*100).toFixed(1)}%</td></tr>`).join("")}
                      </tbody></table></div>` : "";

                    const driverFaultSection = driverFaultRows.length > 0 ? `<div class="section"><div class="sec-title">👤 السائقون الأكثر ارتباطاً بالأعطال</div>
                      <table><thead><tr><th>#</th><th>السائق</th><th>عدد الأعطال/الصيانات المرتبطة</th></tr></thead><tbody>
                      ${driverFaultRows.map(([k,v],i)=>`<tr><td class="center gray">${i===0?"🏆":i===1?"🥈":i===2?"🥉":i+1}</td><td>${k}</td><td class="center"><span class="bo">${v} مرة</span></td></tr>`).join("")}
                      </tbody></table></div>` : "";

                    const faultDetailSection = combinedFaults.length > 0 ? `<div class="section"><div class="sec-title">📋 تفصيل الأعطال والصيانة (${combinedFaults.length} سجل — ${openFaultCount} مفتوح حالياً)</div>
                      <table><thead><tr><th>التاريخ</th><th>النوع</th><th>السائق</th><th>الحالة</th><th>الوصف</th></tr></thead><tbody>
                      ${combinedFaults.map(c=>`<tr><td class="gray-sm">${fmtDate(c.date)}</td><td>${c.type}</td><td>${c.driver}</td><td>${c.status}</td><td class="gray-sm">${c.desc||"—"}</td></tr>`).join("")}
                      </tbody></table></div>` : "";

                    const purchasesSection = fPurchaseInvoices.length > 0 ? `<div class="section"><div class="sec-title">🛍️ فواتير الموردين (${fPurchaseInvoices.length})</div>
                      <table><thead><tr><th>التاريخ</th><th>الصنف</th><th>المورد</th><th>الكمية</th><th>القيمة شامل الضريبة</th></tr></thead><tbody>
                      ${fPurchaseInvoices.map(p=>`<tr><td class="gray-sm">${p.invoice_date||"—"}</td><td>${p.item_name||"—"}</td><td>${p.supplier_name||"—"}</td><td class="center">${p.quantity||1}</td><td>${f(p.price_after_vat*(p.quantity||1))}</td></tr>`).join("")}
                      <tr class="total-row"><td colspan="4">الإجمالي</td><td>${f(totalPurchaseCost)}</td></tr>
                      </tbody></table></div>` : "";

                    const partsSection = combinedParts.length > 0 ? `<div class="section"><div class="sec-title">🔧 قطع الغيار والإصلاحات (${combinedParts.length})</div>
                      <table><thead><tr><th>التاريخ</th><th>البند</th><th>المصدر</th><th>التكلفة</th></tr></thead><tbody>
                      ${combinedParts.map(p=>`<tr><td class="gray-sm">${fmtDate(p.date)}</td><td>${p.title}</td><td>${p.source}</td><td>${f(p.cost)}</td></tr>`).join("")}
                      <tr class="total-row"><td colspan="3">الإجمالي</td><td>${f(partsTotal)}</td></tr>
                      </tbody></table></div>` : "";

                    const driverHistorySection = driverHistory.length > 0 ? `<div class="section"><div class="sec-title">🚗 السائقون الذين عملوا على هذه السيارة</div>
                      <table><thead><tr><th>#</th><th>السائق</th><th>عدد الرحلات</th><th>آخر رحلة</th><th>معين رسمياً</th></tr></thead><tbody>
                      ${driverHistory.map((d,i)=>`<tr${assignedSet.has(d.driver_name.trim())?' class="assigned"':""}><td class="center gray">${i+1}</td><td>${d.driver_name}</td><td class="center blue">${d.trip_count.toLocaleString("ar-SA")}</td><td class="gray-sm">${fmtDate(d.last_date)}</td><td class="center">${assignedSet.has(d.driver_name.trim())?"✔️":"—"}</td></tr>`).join("")}
                      </tbody></table></div>` : "";

                    // ── Trips pivot sections (material / client / driver) ──
                    const _matMap = new Map<string,{trips:number;revenue:number;diesel:number;work:number}>();
                    fTrips.forEach(r => {
                      const k = r.material_type || "غير محدد";
                      const v = _matMap.get(k) ?? {trips:0,revenue:0,diesel:0,work:0};
                      _matMap.set(k, { trips:v.trips+(r.trips_count||1), revenue:v.revenue+(r.return_value_no_vat||0), diesel:v.diesel+(r.material_expense_diesel||0), work:v.work+(r.work_value||0) });
                    });
                    const _matRows = [..._matMap.entries()].sort((a,b)=>b[1].trips-a[1].trips);

                    const _clientMap = new Map<string,{trips:number;revenue:number}>();
                    fTrips.forEach(r => {
                      const k = r.client_name || "غير محدد";
                      const v = _clientMap.get(k) ?? {trips:0,revenue:0};
                      _clientMap.set(k, {trips:v.trips+(r.trips_count||1), revenue:v.revenue+(r.return_value_no_vat||0)});
                    });
                    const _clientRows = [..._clientMap.entries()].sort((a,b)=>b[1].trips-a[1].trips).slice(0,15);

                    const _driverMap = new Map<string,{trips:number;revenue:number;work:number;lastDate:string}>();
                    fTrips.forEach(r => {
                      const k = r.driver_name || "غير محدد";
                      const v = _driverMap.get(k) ?? {trips:0,revenue:0,work:0,lastDate:""};
                      const d = r.date||"";
                      _driverMap.set(k, { trips:v.trips+(r.trips_count||1), revenue:v.revenue+(r.return_value_no_vat||0), work:v.work+(r.work_value||0), lastDate:d>v.lastDate?d:v.lastDate });
                    });
                    const _driverRows = [..._driverMap.entries()].sort((a,b)=>b[1].trips-a[1].trips);

                    const matSection = _matRows.length > 0 ? `<div class="section"><div class="sec-title">📦 أنواع الحمولات</div>
                      <table><thead><tr><th>نوع الحمولة</th><th>عدد الردود</th><th>قيمة الرد</th><th>مصروف الديزل</th><th>شغل اليد</th></tr></thead><tbody>
                      ${_matRows.map(([k,v])=>`<tr><td>${k}</td><td class="center">${v.trips.toLocaleString("ar-SA")}</td><td>${f(v.revenue)}</td><td>${f(v.diesel)}</td><td>${f(v.work)}</td></tr>`).join("")}
                      <tr class="total-row"><td>الإجمالي</td><td class="center">${totTrips.toLocaleString("ar-SA")}</td><td>${f(totRevenue)}</td><td>—</td><td>—</td></tr>
                      </tbody></table></div>` : "";

                    const clientSection = _clientRows.length > 0 ? `<div class="section"><div class="sec-title">👥 أكثر العملاء (${_clientRows.length})</div>
                      <table><thead><tr><th>#</th><th>العميل</th><th>عدد الردود</th><th>قيمة الرد</th><th>النسبة %</th></tr></thead><tbody>
                      ${_clientRows.map(([k,v],i)=>`<tr><td class="center gray">${i+1}</td><td>${k}</td><td class="center blue">${v.trips.toLocaleString("ar-SA")}</td><td>${f(v.revenue)}</td><td>${totTrips>0?((v.trips/totTrips)*100).toFixed(1):"0"}%</td></tr>`).join("")}
                      </tbody></table></div>` : "";

                    const driverSection = _driverRows.length > 0 ? `<div class="section"><div class="sec-title">🚗 السائقون على هذه السيارة</div>
                      <table><thead><tr><th>#</th><th>السائق</th><th>عدد الردود</th><th>قيمة الرد</th><th>شغل اليد</th><th>آخر رحلة</th></tr></thead><tbody>
                      ${_driverRows.map(([k,v],i)=>`<tr${assignedSet.has(k.trim())?' class="assigned"':""}><td class="center gray">${i===0?"🏆":i===1?"🥈":i===2?"🥉":i+1}</td><td>${k}${assignedSet.has(k.trim())?` <b>(معين رسمياً)</b>`:""}</td><td class="center blue">${v.trips.toLocaleString("ar-SA")}</td><td>${f(v.revenue)}</td><td>${f(v.work)}</td><td class="gray-sm">${v.lastDate||"—"}</td></tr>`).join("")}
                      </tbody></table></div>` : "";

                    const costSection = `<div class="section"><div class="sec-title">💰 ملخص التكاليف والمصاريف</div>
                      <div class="grid5">
                        ${([
                          { label:"مصروف الورشة المباشر", val:f(costSummary.maintenance) },
                          { label:"أوامر عمل الورشة",      val:f(costSummary.vehicle) },
                          { label:"مستودع الورشة",          val:f(costSummary.warehouse) },
                          { label:"مشتريات",                val:f(costSummary.purchases) },
                          { label:"مصروفات الأسطول",       val:f(costSummary.direct) },
                        ] as const).map(c=>`<div class="kpi-card"><p class="kpi-label">${c.label}</p><p class="kpi-val red">${c.val}</p></div>`).join("")}
                      </div>
                      <div class="total-bar"><span>إجمالي التكاليف</span><span>${f(costSummary.total)}</span></div>
                    </div>`;

                    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>التقرير الشامل — ${analytics.vehicle.plate_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;padding:20px 24px;color:#111;background:#fff;font-size:12px}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.06;width:65%;pointer-events:none;z-index:-1}
.doc-header{text-align:center;border-bottom:3px solid #103c68;padding-bottom:14px;margin-bottom:18px}
.jefer-logo{height:60px;object-fit:contain;display:block;margin:0 auto 8px}
.doc-title{font-size:20px;font-weight:900;color:#103c68}
.doc-sub{font-size:13px;color:#333;font-weight:600;margin-top:4px}
.section{margin-bottom:16px;page-break-inside:avoid}
.sec-title{font-size:13px;font-weight:900;color:#103c68;border-right:4px solid #103c68;padding-right:8px;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:12px}
thead tr{background:#103c68;color:#fff}
th{padding:7px 8px;text-align:right;font-weight:700}
td{padding:6px 8px;border-bottom:1px solid #e5e7eb;vertical-align:middle}
tr:nth-child(even) td{background:#f8fafc}
.total-row td{background:#eff6ff;font-weight:700;border-top:2px solid #103c68;color:#103c68}
.assigned td{background:#eef2ff!important}
.grid6{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:16px}
.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:10px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.kpi-card{border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center}
.kpi-label{font-size:11px;color:#444;font-weight:600;margin-bottom:4px}
.kpi-val{font-size:14px;font-weight:900;margin-bottom:2px}
.kpi-unit{font-size:11px;color:#555;font-weight:600}
.center{text-align:center}
.blue{color:#1d4ed8;font-weight:700}
.red{color:#dc2626;font-weight:600}
.gray{color:#444;font-size:12px}
.gray-sm{color:#444;font-size:11px}
.bo{background:#fee2e2;color:#991b1b;border-radius:12px;padding:2px 6px;font-size:10px;font-weight:700}
.total-bar{background:#1f2937;color:#fff;border-radius:8px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:900;margin-top:4px}
.ft{margin-top:18px;font-size:11px;color:#555;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
@page{size:A4 portrait;margin:1cm}html{width:210mm}body{width:210mm;margin:0;padding:0}@media print{body{padding:4px}.no-break{page-break-inside:avoid}}
</style>
</head><body>
<img class="wm" src="${LOGO}" alt="" />
<div class="doc-header">
  <img class="jefer-logo" src="${JEFER}" alt="Jefer" />
  <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:#103c68;text-align:center;margin-top:2px;margin-bottom:4px">MKGH</div>
  <div class="doc-title">التقرير الشامل — ${analytics.vehicle.plate_number}</div>
  <div class="doc-sub">${analytics.vehicle.vehicle_type||"غير محدد"} — تاريخ الطباعة: ${now}${hasDateFilter ? ` — الفترة: ${reportFrom?fmtDate(reportFrom):"البداية"} إلى ${reportTo?fmtDate(reportTo):"الآن"}` : ""}</div>
</div>
${summaryCards}
${vehicleInfoSection}
${matSection}
${clientSection}
${driverSection}
${docsSection}
${faultAnalysisSection}
${driverFaultSection}
${faultDetailSection}
${purchasesSection}
${partsSection}
${driverHistorySection}
${costSection}
<div class="ft">تم إنشاء هذا التقرير الشامل بواسطة نظام MKGH — ${now}</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`);
                    win.document.close();
                  };

                  return (
                    <div className="space-y-6 pb-6" dir="rtl">
                      {/* ── Header ── */}
                      <div className="bg-gradient-to-l from-indigo-700 to-purple-800 rounded-2xl p-5 text-white flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <h2 className="text-xl font-black">التقرير الشامل للسيارة</h2>
                          <p className="text-indigo-200 text-sm mt-0.5">
                            {analytics.vehicle.plate_number} — {analytics.vehicle.vehicle_type || "غير محدد"}
                          </p>
                        </div>
                        <button onClick={printFullReport}
                          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-sm px-4 py-2.5 rounded-xl font-bold transition-colors">
                          <Download size={15}/> تنزيل / طباعة التقرير الشامل (PDF)
                        </button>
                      </div>

                      <p className="text-xs text-gray-500 -mt-2">
                        يجمع هذا التقرير كل بيانات السيارة (البيانات العامة، وثائق الامتثال، الأعطال، المشتريات، قطع الغيار، سجل السائقين والرحلات) في مستند واحد قابل للطباعة أو الحفظ كملف PDF، ويتضمن تحليلاً لأكثر أنواع الأعطال تكراراً والسائقين المرتبطين بها.
                      </p>

                      {/* ── Date range filter ── */}
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-3">
                        <span className="text-xs font-bold text-gray-600 flex items-center gap-1">
                          <Calendar size={13} />فلترة التقرير حسب الفترة:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs text-gray-500">من</label>
                          <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs text-gray-500">إلى</label>
                          <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        </div>
                        {hasDateFilter && (
                          <button onClick={() => { setReportFrom(""); setReportTo(""); }}
                            className="text-xs text-red-500 hover:underline font-semibold">
                            إلغاء الفلترة
                          </button>
                        )}
                        {hasDateFilter && (
                          <span className="text-[11px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full font-semibold sm:mr-auto">
                            التقرير معروض للفترة المحددة فقط
                          </span>
                        )}
                      </div>

                      {/* ── KPI preview ── */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {([
                          {label:"إجمالي الرحلات",  val:totTrips.toLocaleString("ar-SA"),   unit:"رحلة", bg:"bg-blue-50 border-blue-200",     txt:"text-blue-700"},
                          {label:"صافي الإيراد",     val:fmt(netRevenue),                    unit:"ريال", bg:netRevenue>=0?"bg-emerald-50 border-emerald-200":"bg-red-50 border-red-200", txt:netRevenue>=0?"text-emerald-700":"text-red-700"},
                          {label:"إجمالي التكاليف",  val:fmt(costSummary.total),   unit:"ريال", bg:"bg-red-50 border-red-200",       txt:"text-red-700"},
                          {label:"عدد الأعطال",      val:totalFaultCount.toLocaleString("ar-SA"), unit:"سجل", bg:"bg-orange-50 border-orange-200", txt:"text-orange-700"},
                          {label:"زيارات الورشة",    val:workshopVisits.toLocaleString("ar-SA"), unit:"زيارة", bg:"bg-purple-50 border-purple-200", txt:"text-purple-700"},
                          {label:"إجمالي المشتريات", val:fmt(totalPurchaseCost),   unit:"ريال", bg:"bg-teal-50 border-teal-200",     txt:"text-teal-700"},
                        ] as const).map(c => (
                          <div key={c.label} className={`rounded-xl p-3 border text-center ${c.bg}`}>
                            <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                            <div className={`font-black text-sm ${c.txt}`}>{c.val}</div>
                            <div className="text-[10px] text-gray-400">{c.unit}</div>
                          </div>
                        ))}
                      </div>

                      {/* ── Fault type analysis ── */}
                      {commonFaults.length > 0 && (
                        <div>
                          <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                            <AlertTriangle size={14} className="text-orange-500" />أكثر أنواع الأعطال شيوعاً لهذه السيارة
                          </h3>
                          <div className="space-y-2">
                            {commonFaults.map(f => {
                              const max = commonFaults[0].count;
                              return (
                                <div key={f.fault_type} className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm font-semibold text-gray-800">{f.fault_type}</span>
                                    <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{f.count} مرة</span>
                                  </div>
                                  <div className="bg-orange-200/50 rounded-full h-1.5">
                                    <div className="bg-orange-400 h-1.5 rounded-full" style={{ width: `${(f.count / max) * 100}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ── Driver ↔ fault correlation ── */}
                      {driverFaultRows.length > 0 && (
                        <div>
                          <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                            <User size={14} className="text-red-500" />السائقون الأكثر ارتباطاً بالأعطال
                          </h3>
                          <div className="space-y-2">
                            {driverFaultRows.map(([name, count], i) => (
                              <div key={name} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400 w-5 text-center">{i===0?"🏆":i===1?"🥈":i===2?"🥉":i+1}</span>
                                  <span className="font-semibold text-gray-800 text-sm">{name}</span>
                                </div>
                                <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{count} عطل/صيانة</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(totalFaultCount === 0) && (
                        <div className="text-center py-8 text-gray-400">
                          <FileText size={32} className="mx-auto mb-2 text-gray-300" />
                          <p>لا توجد بيانات أعطال كافية للتحليل — سيتضمن التقرير باقي بيانات السيارة</p>
                        </div>
                      )}

                      {/* ── Footer action ── */}
                      <div className="flex justify-start pt-3 border-t border-gray-100">
                        <button onClick={printFullReport}
                          className="flex items-center gap-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-sm px-4 py-2.5 rounded-xl font-bold transition-colors">
                          <Download size={15}/> تنزيل / طباعة التقرير الشامل (PDF)
                        </button>
                      </div>
                    </div>
                  );
                })()}

              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Doc Modal ── */}
      {docModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="font-black text-lg">
                {docModal.existing ? "تحديث" : "رفع"} وثيقة
                {!docModal.isCustom && ` — ${docModal.type}`}
              </h2>
              <button onClick={() => setDocModal({ open:false, type:"التأمين" })} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {docModal.isCustom && (
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">نوع الوثيقة <span className="text-red-500">*</span></label>
                  <input type="text" value={docForm.custom_type} onChange={e => setDocForm(f => ({ ...f, custom_type: e.target.value }))}
                    placeholder="مثال: تأمين شامل، بطاقة سير، رخصة..."
                    list="doc-type-suggestions"
                    className="w-full border border-purple-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  <datalist id="doc-type-suggestions">
                    {["تأمين شامل","تأمين ضد الغير","بطاقة سير","رخصة قيادة","شهادة جمركية","وثيقة ملكية","فاتورة صيانة","عقد إيجار"].map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">تاريخ البداية</label>
                  <input type="date" value={docForm.start_date} onChange={e => setDocForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">تاريخ الانتهاء</label>
                  <input type="date" value={docForm.end_date} onChange={e => setDocForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">ملاحظات</label>
                <input type="text" value={docForm.notes} onChange={e => setDocForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="ملاحظات اختيارية..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">
                  {docModal.existing?.image_url ? "تحديث الملف (صورة أو PDF)" : "رفع الملف (صورة أو PDF)"}
                </label>
                <input ref={docImageRef} type="file" accept="image/*,application/pdf,.pdf"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white" />
                {docModal.existing?.image_url && (
                  <a href={docModal.existing.image_url} target="_blank" rel="noreferrer"
                    className="mt-1.5 flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <Eye size={11} />الملف الحالي — اضغط للعرض
                  </a>
                )}
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setDocModal({ open:false, type:"التأمين" })} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">إلغاء</button>
              <button onClick={() => saveDoc.mutate()} disabled={saveDoc.isPending || (docModal.isCustom && !docForm.custom_type)}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                <Upload size={14} />{saveDoc.isPending ? "جاري الحفظ..." : "حفظ الوثيقة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resolve Breakdown Modal ── */}
      {resolveModal.open && resolveModal.bd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Wrench size={18} className="text-emerald-600" />
                <h2 className="font-black text-lg">إغلاق بلاغ العطل</h2>
              </div>
              <button onClick={() => setResolveModal({ open:false, bd:null })} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>يُشترط رفع فاتورة الإصلاح الأصلية لإغلاق البلاغ (تأكيد التسليم بفاتورة)</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">تم الإصلاح بواسطة</label>
                <input type="text" value={resolveForm.resolved_by} onChange={e => setResolveForm(f => ({ ...f, resolved_by: e.target.value }))}
                  placeholder="اسم المسؤول..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">ملاحظات الإصلاح</label>
                <textarea value={resolveForm.resolve_notes} onChange={e => setResolveForm(f => ({ ...f, resolve_notes: e.target.value }))}
                  rows={2} placeholder="وصف ما تم إصلاحه..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">
                  فاتورة الإصلاح <span className="text-red-500">* مطلوبة</span>
                </label>
                <input ref={resolveImgRef} type="file" accept="image/*,application/pdf"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setResolveModal({ open:false, bd:null })} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">إلغاء</button>
              <button onClick={() => resolveModal.bd && resolveBreakdown.mutate(resolveModal.bd.id)} disabled={resolveBreakdown.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                <CheckCircle size={14} />{resolveBreakdown.isPending ? "جاري الإغلاق..." : "إغلاق البلاغ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Vehicle Modal ── */}
      {addVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Truck size={18} className="text-blue-600" />
                <h2 className="font-black text-lg">إضافة سيارة جديدة</h2>
              </div>
              <button onClick={() => setAddVehicleModal(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">رقم اللوحة <span className="text-red-500">*</span></label>
                <input type="text" value={addVehicleForm.plate_number} onChange={e => {
                  const val = e.target.value;
                  setAddVehicleForm(f => ({ ...f, plate_number: val }));
                  const dup = (vehicles || []).find((v: FleetVehicle) => v.plate_number.trim() === val.trim());
                  setAddVehicleError(dup ? "رقم اللوحة مسجّل مسبقاً في دفتر السيارات" : "");
                }}
                  placeholder="مثال: أ ب ج 1234"
                  className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${addVehicleError && addVehicleForm.plate_number ? "border-red-400 focus:ring-red-300 bg-red-50" : "border-gray-200 focus:ring-blue-400"}`} />
                {addVehicleError && <p className="text-red-600 text-xs mt-1 font-semibold">⚠️ {addVehicleError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">نوع السيارة</label>
                  <input type="text" value={addVehicleForm.vehicle_type} onChange={e => setAddVehicleForm(f => ({ ...f, vehicle_type: e.target.value }))}
                    list="vehicle-types-list"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <datalist id="vehicle-types-list">
                    {["شاحنة","تريلة","شاحنة بلكر","سطحة","بيك آب","حافلة","معدة"].map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">الحالة</label>
                  <select value={addVehicleForm.status} onChange={e => setAddVehicleForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                    <option value="available">متاحة</option>
                    <option value="busy">مشغولة</option>
                    <option value="maintenance">صيانة</option>
                    <option value="broken">عطل</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">اسم السائق</label>
                <input type="text" value={addVehicleForm.driver_name} onChange={e => setAddVehicleForm(f => ({ ...f, driver_name: e.target.value }))}
                  placeholder="اختياري"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">ملاحظات</label>
                <input type="text" value={addVehicleForm.notes} onChange={e => setAddVehicleForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="اختياري"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">
                  معرّف GPS <span className="text-gray-400 font-normal">(tawasolmap / Wialon)</span>
                </label>
                <input type="text" value={addVehicleForm.gps_device_id} onChange={e => setAddVehicleForm(f => ({ ...f, gps_device_id: e.target.value }))}
                  placeholder="مثال: 12345678 — اختياري"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">الجهة</label>
                <select value={addVehicleForm.branch} onChange={e => setAddVehicleForm(f => ({ ...f, branch: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                  <option value="">— اختر فرع الشركة —</option>
                  {companyBranchNames.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {companyBranchNames.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">أضف فرعًا أولًا من فروع الشركة والبيانات المالية.</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setAddVehicleModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">إلغاء</button>
              <button onClick={() => addVehicle.mutate()} disabled={addVehicle.isPending || !addVehicleForm.plate_number.trim() || !addVehicleForm.branch || !!addVehicleError}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                <Plus size={14} />{addVehicle.isPending ? "جاري الإضافة..." : "إضافة السيارة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Breakdown Modal ── */}
      {newBdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" />
                <h2 className="font-black text-lg">بلاغ عطل جديد</h2>
              </div>
              <button onClick={() => setNewBdModal(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">اسم السائق</label>
                  <input type="text" value={newBdForm.driver_name} onChange={e => setNewBdForm(f => ({ ...f, driver_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">جوال السائق</label>
                  <input type="tel" value={newBdForm.driver_phone} onChange={e => setNewBdForm(f => ({ ...f, driver_phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">حالة السيارة أثناء العطل</label>
                <select value={newBdForm.operational_state} onChange={e => setNewBdForm(f => ({ ...f, operational_state: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">-- اختر الحالة --</option>
                  <option value="شغال">شغال</option>
                  <option value="نشط">نشط</option>
                  <option value="في حمولة">في حمولة</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">الإجراء المتخذ</label>
                <select value={newBdForm.action_taken} onChange={e => setNewBdForm(f => ({ ...f, action_taken: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">-- اختر الإجراء --</option>
                  <option value="وقف">وقف</option>
                  <option value="أكمل">أكمل</option>
                  <option value="ذهاب للورشة">ذهاب للورشة</option>
                  <option value="إمكانية إصلاح على الطريق">إمكانية إصلاح على الطريق</option>
                  <option value="طلب استدعاء الورشة المتنقلة">طلب استدعاء الورشة المتنقلة</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">وصف العطل</label>
                <textarea value={newBdForm.description} onChange={e => setNewBdForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="وصف تفصيلي للعطل..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">صورة العطل</label>
                <input ref={bdPhotoRef} type="file" accept="image/*" capture="environment"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-red-600 file:text-white" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setNewBdModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">إلغاء</button>
              <button onClick={() => addBreakdown.mutate()} disabled={addBreakdown.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                <AlertTriangle size={14} />{addBreakdown.isPending ? "جاري الإرسال..." : "إرسال البلاغ"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Edit Breakdown Modal ── */}
      {editBdModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="font-black text-lg flex items-center gap-2">
                <Pencil size={18} className="text-blue-600" />تعديل سجل العطل
              </h2>
              <button onClick={() => setEditBdModal(s => ({...s, open:false}))} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {editBdModal.isLegacy ? (
                <>
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">نوع العطل</label>
                    <input value={editBdModal.form.breakdown_type} onChange={e => setEditBdModal(s => ({...s, form:{...s.form, breakdown_type:e.target.value}}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">الحالة</label>
                    <select value={editBdModal.form.status} onChange={e => setEditBdModal(s => ({...s, form:{...s.form, status:e.target.value}}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                      <option value="open">مفتوح</option>
                      <option value="resolved">تم الحل</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1">اسم السائق</label>
                      <input value={editBdModal.form.driver_name} onChange={e => setEditBdModal(s => ({...s, form:{...s.form, driver_name:e.target.value}}))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1">رقم الجوال</label>
                      <input value={editBdModal.form.driver_phone} onChange={e => setEditBdModal(s => ({...s, form:{...s.form, driver_phone:e.target.value}}))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">حالة التشغيل</label>
                <select value={editBdModal.form.operational_state} onChange={e => setEditBdModal(s => ({...s, form:{...s.form, operational_state:e.target.value}}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— اختر —</option>
                  <option value="واقف">واقف</option>
                  <option value="تسير ببطء">تسير ببطء</option>
                  <option value="تسير بشكل طبيعي">تسير بشكل طبيعي</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">الإجراء المتخذ</label>
                <select value={editBdModal.form.action_taken} onChange={e => setEditBdModal(s => ({...s, form:{...s.form, action_taken:e.target.value}}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— اختر —</option>
                  <option value="وقف">وقف</option>
                  <option value="أكمل">أكمل</option>
                  <option value="ذهاب للورشة">ذهاب للورشة</option>
                  <option value="إمكانية إصلاح على الطريق">إمكانية إصلاح على الطريق</option>
                  <option value="طلب استدعاء الورشة المتنقلة">طلب استدعاء الورشة المتنقلة</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">الوصف</label>
                <textarea value={editBdModal.form.description} onChange={e => setEditBdModal(s => ({...s, form:{...s.form, description:e.target.value}}))}
                  rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setEditBdModal(s => ({...s, open:false}))} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">إلغاء</button>
              <button onClick={() => editBreakdown.mutate({ id:editBdModal.id, isLegacy:editBdModal.isLegacy, form:editBdModal.form })}
                disabled={editBreakdown.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                <Save size={14} />{editBreakdown.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Trip Add / Edit Modal ── */}
      {(addTripModal || editTripRow) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-4 px-3 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-6">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-800 text-base flex items-center gap-2">
                <Activity size={16} className="text-emerald-500" />
                {editTripRow ? `تعديل رحلة — ${editTripRow.date}` : `إضافة رحلة جديدة — ${selectedPlate}`}
              </h3>
              <button onClick={() => { setAddTripModal(false); setEditTripRow(null); setTripForm(emptyTripForm()); }}
                className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-500"><X size={18} /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">التاريخ *</label>
                <input type="date" value={tripForm.date} onChange={e=>setTripForm(p=>({...p,date:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">نوع الرد</label>
                <select value={tripForm.trip_state} onChange={e=>setTripForm(p=>({...p,trip_state:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none bg-white">
                  {["سطحة محملة","سطحة فارغة","غير محدد","محملة","فارغة"].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">اسم السائق</label>
                <input value={tripForm.driver_name} onChange={e=>setTripForm(p=>({...p,driver_name:e.target.value}))}
                  list="trip-drivers-list"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
                <datalist id="trip-drivers-list">
                  {analytics?.driverHistory?.map(d=><option key={d.driver_name} value={d.driver_name} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">اسم العميل</label>
                <input value={tripForm.client_name} onChange={e=>setTripForm(p=>({...p,client_name:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">الحمولة</label>
                <input value={tripForm.material_type} onChange={e=>setTripForm(p=>({...p,material_type:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">مكان النزول</label>
                <input value={tripForm.destination} onChange={e=>setTripForm(p=>({...p,destination:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">عدد الردود</label>
                <input type="number" min="0" value={tripForm.trips_count} onChange={e=>setTripForm(p=>({...p,trips_count:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">سعر الرد/م/ط</label>
                <input type="number" min="0" value={tripForm.unit_price} onChange={e=>setTripForm(p=>({...p,unit_price:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">متر/طن</label>
                <input type="number" min="0" value={tripForm.meter_ton} onChange={e=>setTripForm(p=>({...p,meter_ton:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  قيمة الرد بدون ضريبة
                  <span className="font-normal text-gray-400 mr-1">(يحسب تلقائياً إذا تُرك فارغاً)</span>
                </label>
                <input type="number" min="0" value={tripForm.return_value_no_vat} onChange={e=>setTripForm(p=>({...p,return_value_no_vat:e.target.value}))}
                  placeholder="اختياري"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">سند الصرف</label>
                <input value={tripForm.payment_voucher} onChange={e=>setTripForm(p=>({...p,payment_voucher:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">رقم كارت التحميل</label>
                <input value={tripForm.loading_card_no} onChange={e=>setTripForm(p=>({...p,loading_card_no:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">المورد</label>
                <input value={tripForm.supplier} onChange={e=>setTripForm(p=>({...p,supplier:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">المسافة (كم)</label>
                <input type="number" min="0" value={tripForm.distance_km} onChange={e=>setTripForm(p=>({...p,distance_km:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">مصروف مواد+ديزل</label>
                <input type="number" min="0" value={tripForm.material_expense_diesel} onChange={e=>setTripForm(p=>({...p,material_expense_diesel:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">قيمة العمل</label>
                <input type="number" min="0" value={tripForm.work_value} onChange={e=>setTripForm(p=>({...p,work_value:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">التحصيل النقدي</label>
                <input type="number" min="0" value={tripForm.cash_collection} onChange={e=>setTripForm(p=>({...p,cash_collection:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-600 mb-1">ملاحظات</label>
                <textarea value={tripForm.notes} onChange={e=>setTripForm(p=>({...p,notes:e.target.value}))} rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none resize-none" />
              </div>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-3 border-t border-gray-100 pt-4">
              <button onClick={() => { setAddTripModal(false); setEditTripRow(null); setTripForm(emptyTripForm()); }}
                className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50">إلغاء</button>
              <button
                onClick={() => editTripRow ? updateTrip.mutate({ id: editTripRow.id!, form: tripForm }) : addTrip.mutate(tripForm)}
                disabled={addTrip.isPending || updateTrip.isPending}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2">
                <Save size={14} />
                {(addTrip.isPending || updateTrip.isPending) ? "جارٍ الحفظ..." : (editTripRow ? "حفظ التعديل" : "إضافة الرحلة")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GPS Edit Modal ── */}
      {gpsEditPlate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="font-black text-lg flex items-center gap-2">
                <span>📡</span> معرّف GPS — {gpsEditPlate}
              </h2>
              <button onClick={() => { setGpsEditPlate(null); setGpsLookupRes(null); }} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="text-xs font-bold text-gray-600 block mb-1">
                معرّف الجهاز في tawasolmap / Wialon
                <span className="font-normal text-gray-400 mr-1">(Wialon Unit ID أو IMEI)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={gpsEditValue}
                  onChange={e => { setGpsEditValue(e.target.value); setGpsLookupRes(null); }}
                  placeholder="مثال: 12345678 أو IMEI"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  onClick={async () => {
                    if (!gpsEditValue.trim()) return;
                    setGpsLooking(true); setGpsLookupRes(null);
                    try {
                      const r = await fetch(`/api/gps/lookup?q=${encodeURIComponent(gpsEditValue.trim())}`);
                      const d = await r.json();
                      setGpsLookupRes(d);
                    } catch { setGpsLookupRes({ found: false }); }
                    finally { setGpsLooking(false); }
                  }}
                  disabled={gpsLooking || !gpsEditValue.trim()}
                  className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold disabled:opacity-50 flex-shrink-0 transition-colors"
                >
                  {gpsLooking ? "⏳" : "🔍 بحث"}
                </button>
              </div>
              {gpsLookupRes && (
                gpsLookupRes.found ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-bold text-emerald-700">✅ تم التعرف على الوحدة في Wialon</p>
                    <p className="text-xs text-gray-700">الاسم: <span className="font-bold">{gpsLookupRes.name}</span></p>
                    {gpsLookupRes.imei && <p className="text-xs text-gray-500">IMEI: <span className="font-mono">{gpsLookupRes.imei}</span></p>}
                    <p className="text-xs text-gray-500">Wialon ID: <span className="font-mono font-bold">{gpsLookupRes.wialon_id}</span></p>
                    {gpsLookupRes.wialon_id && gpsLookupRes.wialon_id !== gpsEditValue.trim() && (
                      <button
                        onClick={() => { setGpsEditValue(gpsLookupRes.wialon_id!); setGpsLookupRes(null); }}
                        className="mt-1 text-xs text-blue-600 underline hover:text-blue-800 font-semibold"
                      >
                        ← استخدم Wialon ID: {gpsLookupRes.wialon_id}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    ⚠️ لم يُعثر على هذا المعرف في Wialon — تحقق من الرقم
                  </p>
                )
              )}
              <p className="text-xs text-gray-400">اتركه فارغاً لإزالة الربط مع GPS</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => { setGpsEditPlate(null); setGpsLookupRes(null); }} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">إلغاء</button>
              <button
                onClick={() => updateGpsId.mutate({ plate: gpsEditPlate, gps_device_id: gpsEditValue })}
                disabled={updateGpsId.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
              >
                {updateGpsId.isPending ? "جاري الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Bulk Branch Assignment Modal ═══════════════════════════════════ */}
      {showBulkBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
              <h2 className="font-black text-lg flex items-center gap-2">
                🏢 تعيين جهة كل سيارة
              </h2>
              <button onClick={() => setShowBulkBranch(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {/* Quick-assign bar */}
            <div className="px-6 py-3 border-b border-gray-50 bg-gray-50 shrink-0">
              <p className="text-xs text-gray-500 mb-2 font-semibold">تعيين سريع — اختر جهة وحدد السيارات:</p>
              <div className="flex flex-wrap gap-2">
                {companyBranchNames.map(b => (
                  <button key={b}
                    onClick={() => {
                      const confirmAll = confirm(`تعيين الجهة "${b}" لكل السيارات المحددة — هل تريد تعيينها لجميع السيارات؟`);
                      if (!confirmAll) return;
                      const all: Record<string,string> = {};
                      Object.keys(bulkBranchEdits).forEach(p => { all[p] = b; });
                      setBulkBranchEdits(all);
                    }}
                    className="px-3 py-1 text-xs font-bold bg-white border border-indigo-200 text-indigo-700 rounded-full hover:bg-indigo-50 transition-colors">
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle list */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <div className="space-y-2">
                {(vehicles || []).map(v => (
                  <div key={v.plate_number} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="font-mono font-black text-blue-700 text-sm w-28 shrink-0">{v.plate_number}</span>
                    <span className="text-xs text-gray-400 w-24 shrink-0">{v.vehicle_type || "—"}</span>
                    <select
                      value={bulkBranchEdits[v.plate_number] ?? (v.branch && companyBranchNames.includes(v.branch) ? v.branch : "")}
                      onChange={e => setBulkBranchEdits(prev => ({ ...prev, [v.plate_number]: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="">— اختر فرع الشركة —</option>
                      {companyBranchNames.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    {bulkBranchEdits[v.plate_number] && bulkBranchEdits[v.plate_number] !== (v.branch || "") && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold shrink-0">مُعدَّل</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 shrink-0">
              {(() => {
                const changedCount = (vehicles || []).filter(v =>
                  bulkBranchEdits[v.plate_number] && bulkBranchEdits[v.plate_number] !== (v.branch || "")
                ).length;
                return (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 flex-1">
                      {changedCount > 0 ? `${changedCount} سيارة سيتم تحديث جهتها` : "لم تُجرَ أي تعديلات بعد"}
                    </span>
                    <button onClick={() => setShowBulkBranch(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                      إلغاء
                    </button>
                    <button
                      onClick={() => bulkUpdateBranches.mutate(bulkBranchEdits)}
                      disabled={bulkUpdateBranches.isPending || changedCount === 0}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                      {bulkUpdateBranches.isPending ? "جاري الحفظ..." : `حفظ التعديلات (${changedCount})`}
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {branchEditPlate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="font-black text-lg flex items-center gap-2">
                <span>🏢</span> تعديل الجهة — {branchEditPlate}
              </h2>
              <button onClick={() => setBranchEditPlate(null)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="text-xs font-bold text-gray-600 block mb-1">الجهة / القسم</label>
              <select
                value={branchEditValue}
                onChange={e => setBranchEditValue(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                <option value="">— اختر فرع الشركة —</option>
                {companyBranchNames.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <p className="text-xs text-gray-400">سيؤثر على فلتر الجهة في داش بورد الأداء وسائر التقارير</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setBranchEditPlate(null)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">إلغاء</button>
              <button
                onClick={() => updateBranch.mutate({ plate: branchEditPlate, branch: branchEditValue })}
                disabled={updateBranch.isPending || !branchEditValue}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
              >
                {updateBranch.isPending ? "جاري الحفظ..." : "حفظ الجهة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          DRILL-DOWN MODAL — تفصيل مصادر المبلغ
          ══════════════════════════════════════════════════════════ */}
      {drillDown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrillDown(null)} />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className={`px-5 py-4 flex items-center justify-between ${
              drillDown.kind === "expenses"   ? "bg-orange-50 border-b border-orange-100" :
              drillDown.kind === "breakdowns" ? "bg-red-50 border-b border-red-100" :
              drillDown.kind === "orders"     ? "bg-indigo-50 border-b border-indigo-100" :
                                               "bg-emerald-50 border-b border-emerald-100"
            }`}>
              <div className="flex items-center gap-2">
                {drillDown.kind === "expenses"   && <DollarSign size={16} className="text-orange-500" />}
                {drillDown.kind === "breakdowns" && <AlertTriangle size={16} className="text-red-500" />}
                {drillDown.kind === "revenue"    && <Calculator size={16} className="text-emerald-600" />}
                {drillDown.kind === "orders"     && <Package size={16} className="text-indigo-500" />}
                <div>
                  <div className="font-black text-gray-800 text-sm">
                    {drillDown.kind === "expenses"   ? "تفصيل المصاريف" :
                     drillDown.kind === "breakdowns" ? "تفصيل الأعطال" :
                     drillDown.kind === "orders"     ? "تفصيل الردود" :
                                                      "تفصيل الإيراد"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {drillDown.asset_type === "trailer" ? "تيدر" : "سيارة"} {drillDown.plate}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {drillDown.asset_type !== "trailer" && <button
                  onClick={() => { setSelectedPlate(drillDown.plate); setTab("overview"); setDrillDown(null); window.scrollTo({top:0,behavior:"smooth"}); }}
                  className="text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1">
                  <Truck size={11} />عرض السيارة
                </button>}
                <button onClick={() => setDrillDown(null)} className="p-1.5 hover:bg-white/60 rounded-lg transition-colors">
                  <X size={16} className="text-gray-400" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 max-h-[70vh] overflow-y-auto">
              {drillLoading && (
                <div className="text-center py-8 text-gray-400 text-sm">جاري التحميل…</div>
              )}

              {drillDetail && drillDown.asset_type === "trailer" && (() => {
                const replies = drillDetail.revenue.sources.reduce((sum, source) => sum + (source.count || 0), 0);
                const net = drillDetail.revenue.total - drillDetail.expenses.total;
                const summaries = [
                  { label:"الأعطال المسجلة", value:String(drillDetail.breakdowns.total), color:"text-red-600" },
                  { label:"المصاريف", value:fmt(drillDetail.expenses.total), color:"text-orange-600" },
                  { label:"الإيراد", value:fmt(drillDetail.revenue.total), color:"text-emerald-600" },
                  { label:"الردود", value:String(replies), color:"text-indigo-600" },
                  { label:"الصافي", value:fmt(net), color:"text-blue-700" },
                ];
                return (
                  <div className="mb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {summaries.map(item => (
                        <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center">
                          <div className={`font-black text-sm ${item.color}`}>{item.value}</div>
                          <div className="text-[10px] text-gray-500">{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2 text-center">
                      الصافي = إيراد الرحلات ناقص المصاريف المسجلة صراحةً للتيدر.
                    </p>
                  </div>
                );
              })()}

              {drillDetail && drillDown.kind === "orders" && (() => {
                const replies = drillDetail.revenue.sources.reduce((sum, source) => sum + (source.count || 0), 0);
                return (
                  <div className="text-center py-4">
                    <div className="text-2xl font-black text-indigo-600">{replies}</div>
                    <div className="text-xs text-gray-400">إجمالي الردود المسجلة في الفترة</div>
                    {drillDetail.revenue.sources.length > 0 && (
                      <div className="mt-4 space-y-2 text-right">
                        {drillDetail.revenue.sources.map(source => (
                          <div key={source.key} className="flex items-center justify-between rounded-xl bg-indigo-50 px-3 py-2 text-xs">
                            <span className="font-semibold text-gray-700">{source.label}</span>
                            <span className="font-bold text-indigo-700">{source.count} رد</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {drillDetail && drillDown.kind === "expenses" && (() => {
                const { total, sources } = drillDetail.expenses;
                return (
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-2xl font-black text-orange-600">{fmt(total)}</div>
                      <div className="text-xs text-gray-400">إجمالي المصاريف</div>
                    </div>
                    {total === 0 ? (
                      <div className="text-center py-4 text-gray-300 text-xs">لا توجد مصاريف في هذه الفترة</div>
                    ) : (
                      <div className="space-y-2">
                        {sources.map(s => {
                          const pct = total > 0 ? Math.round((s.total / total) * 100) : 0;
                          return (
                            <div key={s.key} className="bg-orange-50 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <div>
                                  <span className="text-sm font-bold text-gray-800">{s.label}</span>
                                  {s.count > 0 && <span className="text-[10px] text-gray-400 mr-1">({s.count} سجل)</span>}
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-black text-orange-700">{fmt(s.total)}</div>
                                  <div className="text-[10px] text-orange-400">{pct}%</div>
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div className="w-full bg-orange-100 rounded-full h-1.5">
                                <div className="bg-orange-400 h-1.5 rounded-full transition-all" style={{width:`${pct}%`}} />
                              </div>
                              {s.notes && (
                                <div className="text-[10px] text-gray-400 mt-1 truncate">{s.notes}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {drillDown.asset_type !== "trailer" && <button
                      onClick={() => { setSelectedPlate(drillDown.plate); setTab("overview"); setDrillDown(null); window.scrollTo({top:0,behavior:"smooth"}); }}
                      className="w-full mt-2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                      <Eye size={14} />عرض تفاصيل السيارة
                    </button>}
                  </div>
                );
              })()}

              {drillDetail && drillDown.kind === "breakdowns" && (() => {
                const { bd_events, ml_events } = drillDetail.breakdowns;
                const all = [
                  ...bd_events.map(e => ({...e, isBd: true})),
                  ...ml_events.map(e => ({...e, isBd: false})),
                ].sort((a,b) => (b.date||"").localeCompare(a.date||""));
                return (
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-2xl font-black text-red-600">{all.length}</div>
                      <div className="text-xs text-gray-400">إجمالي الأعطال والصيانة</div>
                    </div>
                    {all.length === 0 ? (
                      <div className="text-center py-4 text-gray-300 text-xs">لا توجد أعطال في هذه الفترة ✓</div>
                    ) : (
                      <div className="space-y-1.5">
                        {all.map((e, i) => (
                          <div key={i} className={`rounded-xl px-3 py-2 flex items-start justify-between gap-2 ${
                            e.isBd ? "bg-red-50 border border-red-100" : "bg-orange-50 border border-orange-100"
                          }`}>
                            <div>
                              <div className="text-xs font-bold text-gray-800">{e.type || "—"}</div>
                              <div className="text-[10px] text-gray-400">{e.isBd ? "بلاغ عطل" : "سجل صيانة"}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-gray-500">{fmtDate(e.date)}</div>
                              {!e.isBd && (e as any).amount > 0 && (
                                <div className="text-[10px] font-bold text-orange-600">{fmt((e as any).amount)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {drillDown.asset_type !== "trailer" && <button
                      onClick={() => { setSelectedPlate(drillDown.plate); setTab("breakdowns"); setDrillDown(null); window.scrollTo({top:0,behavior:"smooth"}); }}
                      className="w-full mt-2 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                      <AlertTriangle size={14} />عرض الأعطال التفصيلية
                    </button>}
                  </div>
                );
              })()}

              {drillDetail && drillDown.kind === "revenue" && (() => {
                const { total, sources } = drillDetail.revenue;
                return (
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-2xl font-black text-emerald-600">{fmt(total)}</div>
                      <div className="text-xs text-gray-400">إجمالي الإيراد</div>
                    </div>
                    {total === 0 ? (
                      <div className="text-center py-4 text-gray-300 text-xs">لا يوجد إيراد في هذه الفترة</div>
                    ) : (
                      <div className="space-y-2">
                        {sources.map(s => {
                          const pct = total > 0 ? Math.round((s.total / total) * 100) : 0;
                          return (
                            <div key={s.key} className="bg-emerald-50 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <div>
                                  <span className="text-sm font-bold text-gray-800">{s.label}</span>
                                  {s.count > 0 && <span className="text-[10px] text-gray-400 mr-1">({s.count} رحلة)</span>}
                                  {s.notes && <div className="text-[10px] text-gray-400">{s.notes}</div>}
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-black text-emerald-700">{fmt(s.total)}</div>
                                  <div className="text-[10px] text-emerald-400">{pct}%</div>
                                </div>
                              </div>
                              <div className="w-full bg-emerald-100 rounded-full h-1.5">
                                <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{width:`${pct}%`}} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {drillDown.asset_type !== "trailer" && <button
                      onClick={() => { setSelectedPlate(drillDown.plate); setTab("history"); setDrillDown(null); window.scrollTo({top:0,behavior:"smooth"}); }}
                      className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                      <Activity size={14} />عرض سجل الرحلات
                    </button>}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
