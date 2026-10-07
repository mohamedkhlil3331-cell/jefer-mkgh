import { useEffect, useState, useRef } from "react";
import * as XLSX from "xlsx";
import { MonthShortcuts } from "@/components/MonthShortcuts";
import { useAuth } from "@/context/AuthContext";
import { useRememberedState } from "@/hooks/useRememberedState";
import {
  Wrench, AlertTriangle, CheckCircle, RefreshCw, Clock, Car,
  Image as ImageIcon, X, Plus, Package, ChevronRight, ShoppingBag,
  Boxes, ArrowUpCircle, Truck, FileText, Download, Upload, Trash2, Search, Pencil, Printer,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface BreakdownReport {
  id: number; driver_phone: string; driver_name: string;
  vehicle_id: number; vehicle_plate: string; breakdown_type: string;
  description: string; photo_url: string | null;
  status: "open" | "resolved"; resolved_by: string | null;
  resolve_notes: string | null; resolved_at: string | null; created_at: string;
}
interface WorkshopJob {
  id: number; vehicle_plate: string; breakdown_report_id: number | null;
  title: string; job_type: string; description: string | null;
  parts_used: string | null; labor_cost: number; parts_cost: number;
  total_cost: number; invoice_target: "vehicle" | "inventory";
  status: "open" | "in_progress" | "done"; created_by: string | null;
  notes: string | null; created_at: string; completed_at: string | null;
  breakdown_type?: string; driver_name?: string;
}
interface InventoryItem {
  id: number; item_name: string; item_code: string | null; category: string;
  quantity: number; unit: string; min_stock: number;
  cost_per_unit: number; supplier: string | null; last_updated: string;
  updated_by?: string | null;
}
interface MaintenanceLogPart {
  item_id: number | null; item_name: string; item_code?: string | null; quantity: number; unit: string; cost_per_unit: number;
}
interface MaintenanceLog {
  id: number; card_number: string | null; maintenance_date: string | null;
  entry_time: string | null; exit_time: string | null; exit_date: string | null;
  vehicle_plate: string | null; driver_name: string | null; branch: string | null;
  maintenance_type: string | null; description: string | null;
  amount: number;
  amount_mechanical: number; amount_electrical: number;
  technicians?: string | null;
  tires?: string | null;
  trailer_number?: string | null;
  trailer_type?: string | null;
  is_external?: number | null;
  amount_breakdown?: string | null;
  vehicle_choice?: "vehicle" | "trailer" | null;
  is_printed?: number | null;
  oil_change_amount?: number;
  filter_status?: "with" | "without";
  created_at: string;
  parts?: MaintenanceLogPart[];
}
interface FleetVehicle {
  id: number; plate_number: string; vehicle_type: string; status: string; driver_name: string | null;
  branch: string | null;
  linked_trailer_number: string | null;
  linked_trailer_type:   string | null;
  linked_trailer_default: "vehicle" | "trailer" | null;
}
interface Driver { id: number; name: string; phone: string; vehicle_plate: string | null; }
interface WsBranch { id: number; entity_name: string; }

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  "ميكانيكي":  "bg-orange-50 text-orange-700 border-orange-200",
  "كهربائي":   "bg-yellow-50 text-yellow-700 border-yellow-200",
  "حادث":      "bg-red-50 text-red-700 border-red-200",
  "إطارات":    "bg-blue-50 text-blue-700 border-blue-200",
  "أخرى":      "bg-gray-50 text-gray-600 border-gray-200",
};
const JOB_STATUS_COLOR: Record<string, string> = {
  open:        "bg-red-100 text-red-700 border-red-200",
  in_progress: "bg-yellow-100 text-yellow-700 border-yellow-200",
  done:        "bg-green-100 text-green-700 border-green-200",
};
const JOB_STATUS_LABEL: Record<string, string> = {
  open: "مفتوح", in_progress: "قيد العمل", done: "مكتمل",
};
const fmt = (d: string) =>
  new Date(d).toLocaleDateString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const sar = (n: number) =>
  n.toLocaleString("ar-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 0 });

const ML_HEADER_MAP: Record<string, string> = {
  "رقم كارت الصيانة": "card_number",  "رقم كارت الصيانه": "card_number",
  "مبلغ الصيانة": "amount",           "مبلغ الصيانه": "amount",
  "بيان الصيانة": "description",      "بيان الصيانه": "description",
  "نوع الصيانة": "maintenance_type",  "نوع الصيانه": "maintenance_type",
  "الفرع": "branch",
  "اسم السائق": "driver_name",
  "رقم اللوحة": "vehicle_plate",      "رقم اللوحه": "vehicle_plate",
  "تاريخ الخروج": "exit_date",
  "وقت الخروج": "exit_time",
  "وقت الدخول": "entry_time",
  "التاريخ": "maintenance_date",
};
const EMPTY_ML_FORM = {
  card_number: "", maintenance_date: "", entry_time: "", exit_time: "",
  exit_date: "", vehicle_plate: "", driver_name: "", branch: "",
  maintenance_type: "", description: "",
  amount: "", amount_mechanical: "", amount_electrical: "",
  vehicle_choice: "vehicle" as "vehicle" | "trailer",
  trailer_number: "", trailer_type: "",
};

const WORKSHOP_TECHNICIANS = ["قيصر", "سيف الله", "رامندرا", "نعيم"];
const TIRE_LABELS: Record<string, string> = {
  FL: "أمامي أيسر", FR: "أمامي أيمن",
  RL_O: "خلفي أيسر خارجي", RL_I: "خلفي أيسر داخلي",
  RR_I: "خلفي أيمن داخلي", RR_O: "خلفي أيمن خارجي",
  // Trailer single-axle tires
  ML: "وسط أيسر", MR: "وسط أيمن",
  RL: "خلفي أيسر",  RR: "خلفي أيمن",
  // Trailer dual-axle middle
  ML_O: "وسط أيسر خارجي", ML_I: "وسط أيسر داخلي",
  MR_I: "وسط أيمن داخلي", MR_O: "وسط أيمن خارجي",
};
type TireCond = { cond: "new" | "from_vehicle" | "puncture"; vehicle?: string; serial?: string };
const TIRE_COND_LABELS: Record<string, string> = { new: "جديد", from_vehicle: "من سيارة", puncture: "مبنشر" };
function parseTires(raw: string): { ids: string[]; details: Record<string, TireCond> } {
  try {
    const arr = JSON.parse(raw) as { id: string; cond?: string; vehicle?: string; serial?: string }[];
    if (!Array.isArray(arr)) throw new Error();
    const ids = arr.map(t => t.id);
    const details: Record<string, TireCond> = {};
    arr.forEach(t => { details[t.id] = { cond: (t.cond as TireCond["cond"]) || "new", vehicle: t.vehicle, serial: t.serial }; });
    return { ids, details };
  } catch {
    const ids = raw.split(",").map(s => s.trim()).filter(Boolean);
    const details: Record<string, TireCond> = {};
    ids.forEach(id => { details[id] = { cond: "new" }; });
    return { ids, details };
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WorkshopManagerPage() {
  const { user } = useAuth();
  const [tab, setTab] = useRememberedState<"breakdowns" | "jobs" | "inventory" | "maintenance_log" | "oil_changes" | "tires">("workshop-manager-tab", "breakdowns");

  // Breakdown state
  const [reports, setReports] = useState<BreakdownReport[]>([]);
  const [bTab, setBTab] = useRememberedState<"open" | "all">("workshop-breakdown-status-filter", "open");
  const [bVehicleFilter, setBVehicleFilter] = useRememberedState("workshop-breakdown-vehicle-filter", "");
  const [resolving, setResolving] = useState<BreakdownReport | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [jobFromReport, setJobFromReport] = useState<BreakdownReport | null>(null);

  // Jobs state
  const [jobs, setJobs] = useState<WorkshopJob[]>([]);
  const [jTab, setJTab] = useRememberedState<"open" | "in_progress" | "done" | "all">("workshop-jobs-status-filter", "open");
  const [newJob, setNewJob] = useState(false);
  const [jobForm, setJobForm] = useState({
    vehicle_plate: "", title: "", job_type: "صيانة_مباشرة",
    description: "", labor_cost: "", parts_cost: "",
    invoice_target: "vehicle", notes: "",
  });
  const [completingJob, setCompletingJob] = useState<WorkshopJob | null>(null);
  const [completeNotes, setCompleteNotes] = useState("");

  // Inventory state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [invForm, setInvForm] = useState({
    item_name: "", item_code: "", category: "عام", quantity: "",
    unit: "قطعة", min_stock: "", cost_per_unit: "", supplier: "",
  });
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showInvForm, setShowInvForm] = useState(false);
  const [selectedInvIds, setSelectedInvIds] = useState<Set<number>>(new Set());
  const [bulkInvDeleting, setBulkInvDeleting] = useState(false);

  // Maintenance log state
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlSearch, setMlSearch] = useRememberedState("workshop-maintenance-search", "");
  const [mlVehicle, setMlVehicle] = useRememberedState("workshop-maintenance-vehicle-filter", "");
  const [mlBranch, setMlBranch] = useRememberedState("workshop-maintenance-branch-filter", "");
  const [mlFrom, setMlFrom] = useRememberedState("workshop-maintenance-date-from", "");
  const [mlTo, setMlTo] = useRememberedState("workshop-maintenance-date-to", "");
  const [mlTypeFilter, setMlTypeFilter] = useRememberedState("workshop-maintenance-type-filter", "");
  const [mlBranchCardFilter, setMlBranchCardFilter] = useRememberedState("workshop-maintenance-card-branch-filter", "");
  const [oilLogs, setOilLogs] = useState<MaintenanceLog[]>([]);
  const [oilLoading, setOilLoading] = useState(false);
  const [oilFilter, setOilFilter] = useRememberedState<"all" | "with" | "without">("workshop-oil-status-filter", "all");
  const [tiresSearch, setTiresSearch] = useRememberedState("workshop-tires-search", "");
  const [allTireLogs, setAllTireLogs] = useState<MaintenanceLog[]>([]);
  const [mlImporting, setMlImporting] = useState(false);
  const [mlSubmitting, setMlSubmitting] = useState(false);
  const [showMlForm, setShowMlForm] = useState(false);
  const [mlForm, setMlForm] = useState(EMPTY_ML_FORM);
  const [editingLog, setEditingLog] = useState<MaintenanceLog | null>(null);
  const [mlError, setMlError] = useState("");
  const mlFileRef = useRef<HTMLInputElement>(null);

  // ── Technicians multi-select ───────────────────────────────────────────────
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [techInput, setTechInput] = useState("");
  const [selectedTires, setSelectedTires] = useState<string[]>([]);
  const [tireDetails, setTireDetails] = useState<Record<string, TireCond>>({});
  const [typePrices, setTypePrices] = useState<Record<string, string>>({});

  // ── Extra technicians (localStorage-persisted) ─────────────────────────────
  const [extraTechnicians, setExtraTechnicians] = useState<string[]>(() => {
    try { const s = localStorage.getItem("workshop_technicians_extra"); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });

  // ── Multi-select card printing ─────────────────────────────────────────────
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set());

  // ── Maintenance type list (localStorage-persisted) ─────────────────────────
  const DEFAULT_MAINT_TYPES = ["هواء","ميكانيكة","كهرباء","جير","كفرات","تشحيم","صيانة دورية"];
  const [maintenanceTypes, setMaintenanceTypes] = useState<string[]>(() => {
    try { const s = localStorage.getItem("ws_maintenance_types"); return s ? JSON.parse(s) : DEFAULT_MAINT_TYPES; }
    catch { return DEFAULT_MAINT_TYPES; }
  });
  const [newTypeInput, setNewTypeInput] = useState("");
  const [editingTypeIdx, setEditingTypeIdx] = useState<number | null>(null);
  const [editingTypeName, setEditingTypeName] = useState("");

  const saveTypes = (types: string[]) => {
    setMaintenanceTypes(types);
    localStorage.setItem("ws_maintenance_types", JSON.stringify(types));
  };

  // ── Draft autosave (new cards only) ───────────────────────────────────────
  useEffect(() => {
    if (!showMlForm || editingLog !== null) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem("workshop_card_draft", JSON.stringify({
          mlForm, selectedTechs, selectedTires, tireDetails, typePrices,
        }));
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mlForm, selectedTechs, selectedTires, tireDetails, typePrices, showMlForm, editingLog]);
  const selectedMaintTypes = mlForm.maintenance_type.split(/[,،]/).map(s => s.trim()).filter(Boolean);
  const isTrailerMode  = mlForm.vehicle_choice === "trailer";
  const isQallab       = isTrailerMode && (mlForm.trailer_type || "").includes("قلاب");
  const currentTireIds = isTrailerMode
    ? (isQallab
        ? ["FL","FR","ML_O","ML_I","MR_I","MR_O","RL_O","RL_I","RR_I","RR_O"]
        : ["FL","FR","ML","MR","RL","RR"])
    : ["FL","FR","RL_O","RL_I","RR_I","RR_O"];

  // ── Click-counter per chip: 1=select, 2=deselect, 3=edit ─────────────────
  const [chipClicks, setChipClicks] = useState<Record<number, number>>({});
  const chipTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const handleChipClick = (t: string, idx: number) => {
    if (chipTimers.current[idx]) clearTimeout(chipTimers.current[idx]);
    const count = (chipClicks[idx] || 0) + 1;

    if (count === 1) {
      // Select: add if not already present
      const cur = mlForm.maintenance_type.split(/[,،]/).map(s => s.trim()).filter(Boolean);
      if (!cur.includes(t)) setMlForm(f => ({ ...f, maintenance_type: [...cur, t].join("، ") }));
    } else if (count === 2) {
      // Deselect: remove
      const cur = mlForm.maintenance_type.split(/[,،]/).map(s => s.trim()).filter(Boolean);
      setMlForm(f => ({ ...f, maintenance_type: cur.filter(x => x !== t).join("، ") }));
    } else {
      // 3rd click: edit mode — reset counter and open edit
      setEditingTypeIdx(idx);
      setEditingTypeName(t);
      setChipClicks(c => ({ ...c, [idx]: 0 }));
      return;
    }

    setChipClicks(c => ({ ...c, [idx]: count }));
    // Reset counter after 700ms of inactivity
    chipTimers.current[idx] = setTimeout(() => {
      setChipClicks(c => ({ ...c, [idx]: 0 }));
    }, 700);
  };

  // Inventory part selection (for maintenance log form)
  const [invSearchQ, setInvSearchQ] = useState("");
  const [invItems, setInvItems] = useState<{ item: InventoryItem; qty: string }[]>([]);
  const [invDropOpen, setInvDropOpen] = useState(false);

  // Fleet / drivers / branches
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [wsBranches, setWsBranches] = useState<WsBranch[]>([]);
  const [teidarList, setTeidarList] = useState<{ id: number; teidara_number: string | null; vehicle_plate: string | null; teidara_type: string | null }[]>([]);

  // Plate autocomplete
  const [plateSearch, setPlateSearch] = useState("");
  const [plateDropOpen, setPlateDropOpen] = useState(false);
  // Driver autocomplete
  const [driverSearch, setDriverSearch] = useState("");
  const [driverDropOpen, setDriverDropOpen] = useState(false);

  // Exit-time modal
  const [exitingLog, setExitingLog] = useState<MaintenanceLog | null>(null);
  const [exitForm, setExitForm] = useState({ exit_date: "", exit_time: "" });
  const [exitSubmitting, setExitSubmitting] = useState(false);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load data
  const loadReports   = () => fetch("/api/workflow/breakdown-reports").then(r => r.json()).then(d => setReports(Array.isArray(d) ? d : []));
  const loadJobs      = () => fetch("/api/workshop-jobs").then(r => r.json()).then(d => setJobs(Array.isArray(d) ? d : []));
  const loadInventory = () => fetch("/api/workshop-inventory").then(r => r.json()).then(d => setInventory(Array.isArray(d) ? d : []));
  const loadFleet     = () => fetch("/api/fleet-vehicles-list").then(r => r.json()).then(d => setFleetVehicles(Array.isArray(d) ? d : []));
  const loadDrivers   = () => fetch("/api/drivers-list").then(r => r.ok ? r.json() : []).then(d => setDrivers(Array.isArray(d) ? d : []));
  const loadWsBranches = () => fetch("/api/company-settings").then(r => r.ok ? r.json() : []).then(d => setWsBranches(Array.isArray(d) ? d : []));
  const loadTeidarat  = () => fetch("/api/teidarat").then(r => r.json()).then(d => setTeidarList(Array.isArray(d) ? d : []));

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadReports(), loadJobs(), loadInventory(), loadFleet(), loadDrivers(), loadWsBranches(), loadTeidarat()]);
    setLoading(false);
  };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (tab === "maintenance_log") {
      loadMaintenanceLogs({ search: mlSearch, vehicle: mlVehicle, branch: mlBranch, from: mlFrom, to: mlTo });
    } else if (tab === "oil_changes") {
      loadOilChanges({ search: mlSearch, vehicle: mlVehicle, branch: mlBranch, from: mlFrom, to: mlTo });
    } else if (tab === "tires") {
      fetch("/api/maintenance-logs?limit=9999")
        .then(r => r.json())
        .then(d => setAllTireLogs(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [tab]);

  // ── Breakdown: resolve ──────────────────────────────────────────────────────
  const resolveReport = async () => {
    if (!resolving || !user) return;
    setSubmitting(true);
    try {
      await fetch(`/api/workflow/breakdown-reports/${resolving.id}/resolve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved_by: user.name, resolve_notes: resolveNotes }),
      });
      setResolving(null); setResolveNotes("");
      loadReports();
    } catch { alert("فشل تسجيل الحل"); }
    finally { setSubmitting(false); }
  };

  // ── Job: create ─────────────────────────────────────────────────────────────
  const createJob = async (breakdownReportId?: number) => {
    if (!jobForm.title) return alert("يرجى إدخال عنوان أمر العمل");
    setSubmitting(true);
    try {
      await fetch("/api/workshop-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...jobForm,
          labor_cost: Number(jobForm.labor_cost) || 0,
          parts_cost: Number(jobForm.parts_cost) || 0,
          created_by: user?.name,
          breakdown_report_id: breakdownReportId || null,
        }),
      });
      setNewJob(false);
      setJobFromReport(null);
      setJobForm({ vehicle_plate: "", title: "", job_type: "صيانة_مباشرة", description: "", labor_cost: "", parts_cost: "", invoice_target: "vehicle", notes: "" });
      loadAll();
    } catch { alert("فشل إنشاء أمر العمل"); }
    finally { setSubmitting(false); }
  };

  // ── Job: complete ───────────────────────────────────────────────────────────
  const completeJob = async () => {
    if (!completingJob) return;
    setSubmitting(true);
    try {
      await fetch(`/api/workshop-jobs/${completingJob.id}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: completeNotes }),
      });
      setCompletingJob(null); setCompleteNotes("");
      loadJobs();
    } catch { alert("فشل إغلاق أمر العمل"); }
    finally { setSubmitting(false); }
  };

  // ── Job: change status ──────────────────────────────────────────────────────
  const changeJobStatus = async (job: WorkshopJob, status: string) => {
    await fetch(`/api/workshop-jobs/${job.id}/status`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadJobs();
  };

  // ── Inventory: save ─────────────────────────────────────────────────────────
  const saveInventory = async () => {
    if (!invForm.item_name) return alert("اسم القطعة مطلوب");
    setSubmitting(true);
    try {
      const url = editingItem ? `/api/workshop-inventory/${editingItem.id}` : "/api/workshop-inventory";
      const r = await fetch(url, {
        method: editingItem ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...invForm, quantity: Number(invForm.quantity) || 0, min_stock: Number(invForm.min_stock) || 0, cost_per_unit: Number(invForm.cost_per_unit) || 0, created_by: user?.name, ...(editingItem ? { updated_by: user?.name } : {}) }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        return alert(body.error || "فشل حفظ القطعة");
      }
      setShowInvForm(false);
      setEditingItem(null);
      setInvForm({ item_name: "", item_code: "", category: "عام", quantity: "", unit: "قطعة", min_stock: "", cost_per_unit: "", supplier: "" });
      loadInventory();
    } catch { alert("فشل حفظ القطعة"); }
    finally { setSubmitting(false); }
  };

  // ── Inventory: bulk delete ──────────────────────────────────────────────────
  const bulkDeleteInventory = async () => {
    if (selectedInvIds.size === 0) return;
    if (!confirm(`حذف ${selectedInvIds.size} صنف؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setBulkInvDeleting(true);
    try {
      await fetch("/api/workshop-inventory/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedInvIds] }),
      });
      setSelectedInvIds(new Set());
      loadInventory();
    } catch { alert("فشل حذف الأصناف"); }
    finally { setBulkInvDeleting(false); }
  };

  // ── Maintenance Log: load ──────────────────────────────────────────────────
  const loadMaintenanceLogs = async (p?: { search?: string; vehicle?: string; branch?: string; from?: string; to?: string }) => {
    setMlLoading(true);
    try {
      const q = new URLSearchParams();
      if (p?.search)  q.set("search",       p.search);
      if (p?.vehicle) q.set("vehicle_plate", p.vehicle);
      if (p?.branch)  q.set("branch",       p.branch);
      if (p?.from)    q.set("from",          p.from);
      if (p?.to)      q.set("to",            p.to);
      const d = await fetch(`/api/maintenance-logs?${q}`).then(r => r.json());
      setMaintenanceLogs(Array.isArray(d) ? d : []);
    } finally { setMlLoading(false); }
  };

  const loadOilChanges = async (
    p?: { search?: string; vehicle?: string; branch?: string; from?: string; to?: string },
    requestedFilter = oilFilter,
  ) => {
    setOilLoading(true);
    try {
      const q = new URLSearchParams();
      if (p?.search)  q.set("search", p.search);
      if (p?.vehicle) q.set("vehicle_plate", p.vehicle);
      if (p?.branch)  q.set("branch", p.branch);
      if (p?.from)    q.set("from", p.from);
      if (p?.to)      q.set("to", p.to);
      if (requestedFilter !== "all") q.set("filter_status", requestedFilter);
      const response = await fetch(`/api/maintenance-logs/oil-changes?${q}`);
      const data = await response.json();
      setOilLogs(Array.isArray(data) ? data : []);
    } finally {
      setOilLoading(false);
    }
  };

  // ── Maintenance Log: import from Excel ────────────────────────────────────
  const importFromExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMlImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" });
      const rows = rawRows.map(row => {
        const mapped: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          const key = ML_HEADER_MAP[String(k).trim()] ?? null;
          if (key) mapped[key] = v;
        }
        return mapped;
      }).filter(r => Object.keys(r).length > 0);
      if (rows.length === 0) {
        alert("لم يتم التعرف على أعمدة الملف.\nتأكد أن رؤوس الأعمدة مطابقة للنموذج.");
        return;
      }
      const res = await fetch("/api/maintenance-logs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, imported_by: user?.name }),
      });
      if (!res.ok) { alert("فشل الاستيراد"); return; }
      const { inserted, skipped } = await res.json();
      alert(`تم استيراد ${inserted} سجل${skipped > 0 ? `\nتم تخطي ${skipped} سجل مكرر (رقم كارت موجود مسبقاً)` : ""}`);
      loadMaintenanceLogs();
    } catch { alert("حدث خطأ أثناء قراءة الملف"); }
    finally { setMlImporting(false); if (mlFileRef.current) mlFileRef.current.value = ""; }
  };

  // ── Maintenance Log: export to Excel ──────────────────────────────────────
  // helper: parse amount_breakdown → Record<string,number>
  const parseBd = (r: MaintenanceLog): Record<string, number> => {
    if (r.amount_breakdown) {
      try { return JSON.parse(r.amount_breakdown) as Record<string, number>; } catch {}
    }
    // Legacy fallback for very old records that have no amount_breakdown at all
    const fb: Record<string, number> = {};
    if ((r.amount_mechanical || 0) > 0) fb["ميكانيكة"] = r.amount_mechanical;
    if ((r.amount_electrical || 0) > 0) fb["كهرباء"]   = r.amount_electrical;
    return fb;
  };

  const normalizeMaintenanceType = (value: string) => value.trim().replace(/\s+/g, " ");
  const logHasMaintenanceType = (r: MaintenanceLog, selectedType: string) => {
    const wanted = normalizeMaintenanceType(selectedType);
    const savedTypes = (r.maintenance_type || "")
      .split(/[,،]/)
      .map(normalizeMaintenanceType)
      .filter(Boolean);
    const amountTypes = Object.keys(parseBd(r)).map(normalizeMaintenanceType);
    return [...savedTypes, ...amountTypes].some(type => type === wanted);
  };
  const displayedMaintenanceLogs = maintenanceLogs.filter(r => {
    const matchesType = !mlTypeFilter || logHasMaintenanceType(r, mlTypeFilter);
    const branch = r.branch?.trim() || "بدون فرع";
    const matchesBranch = !mlBranchCardFilter || branch === mlBranchCardFilter;
    return matchesType && matchesBranch;
  });

  const exportToExcel = () => {
    if (maintenanceLogs.length === 0) return void alert("لا توجد بيانات للتصدير");

    const exportLogs = maintenanceLogs;
    const allTypes = new Set<string>();
    exportLogs.forEach(r => {
      Object.keys(parseBd(r)).forEach(k => allTypes.add(k));
      if (Object.keys(parseBd(r)).length === 0 && r.maintenance_type) {
        allTypes.add(r.maintenance_type);
      }
    });
    const typeList = [...allTypes];
    const headers = [
      "رقم كارت الصيانة", "التاريخ", "وقت الدخول", "وقت الخروج", "تاريخ الخروج",
      "رقم اللوحة", "الشغل على", "الأصناف المُصرفة", "اسم السائق", "الفرع",
      "نوع الصيانة", "بيان الصيانة", ...typeList, "الإجمالي",
    ];
    const toRow = (r: MaintenanceLog): Record<string, unknown> => {
      const bd = parseBd(r);
      const row: Record<string, unknown> = {
        "رقم كارت الصيانة": r.card_number     || "",
        "التاريخ":          r.maintenance_date || "",
        "وقت الدخول":       r.entry_time       || "",
        "وقت الخروج":       r.exit_time        || "",
        "تاريخ الخروج":     r.exit_date        || "",
        "رقم اللوحة":       r.vehicle_plate    || "",
        "الشغل على":        r.vehicle_choice === "trailer" && r.trailer_number ? `تيدر رقم ${r.trailer_number}` : (r.vehicle_plate ? `راس رقم ${r.vehicle_plate}` : ""),
        "اسم السائق":       r.driver_name      || "",
        "الفرع":            r.branch           || "",
        "نوع الصيانة":      r.maintenance_type || "",
        "بيان الصيانة":     r.description      || "",
      };
      row["الأصناف المُصرفة"] = r.parts?.map(p => `${p.item_name} ×${p.quantity} ${p.unit}`).join("، ") || "";
      typeList.forEach(t => {
        row[t] = bd[t] || (Object.keys(bd).length === 0 && r.maintenance_type === t ? (r.amount || 0) : 0);
      });
      row["الإجمالي"] = r.amount || 0;
      return row;
    };
    const toSheet = (logs: MaintenanceLog[]) => {
      const data = logs.map(toRow);
      const ws = XLSX.utils.json_to_sheet(data, { header: headers });
      const headerStyle = {
        fill: { patternType: "solid", fgColor: { rgb: "FCE4D6" } },
        font: { bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "9EADCC" } },
          bottom: { style: "thin", color: { rgb: "9EADCC" } },
          left: { style: "thin", color: { rgb: "9EADCC" } },
          right: { style: "thin", color: { rgb: "9EADCC" } },
        },
      };
      const bodyStyle = {
        alignment: { vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "D9E2F3" } },
          bottom: { style: "thin", color: { rgb: "D9E2F3" } },
          left: { style: "thin", color: { rgb: "D9E2F3" } },
          right: { style: "thin", color: { rgb: "D9E2F3" } },
        },
      };
      headers.forEach((_, column) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: column })];
        if (cell) cell.s = headerStyle;
        for (let row = 1; row <= data.length; row++) {
          const bodyCell = ws[XLSX.utils.encode_cell({ r: row, c: column })];
          if (bodyCell) bodyCell.s = bodyStyle;
        }
      });
      ws["!cols"] = headers.map(header => ({
        wch: Math.min(32, Math.max(12, header.length + 2)),
      }));
      ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${Math.max(1, data.length + 1)}` };
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      return ws;
    };
    const usedSheetNames = new Set<string>();
    const makeSheetName = (raw: string) => {
      const base = (raw || "بدون اسم")
        .replace(/[\\/:*?"<>\[\]]/g, " ")
        .trim()
        .slice(0, 31) || "ورقة";
      let name = base;
      let suffix = 2;
      while (usedSheetNames.has(name)) {
        const suffixText = ` (${suffix++})`;
        name = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
      }
      usedSheetNames.add(name);
      return name;
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, toSheet(exportLogs), makeSheetName("السجل الكامل"));

    const byBranch = new Map<string, MaintenanceLog[]>();
    exportLogs.forEach(log => {
      const branch = log.branch?.trim() || "بدون فرع";
      const current = byBranch.get(branch) || [];
      current.push(log);
      byBranch.set(branch, current);
    });
    [...byBranch.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "ar"))
      .forEach(([branch, logs]) => {
        XLSX.utils.book_append_sheet(wb, toSheet(logs), makeSheetName(`فرع - ${branch}`));
      });

    const branchSummary = [...byBranch.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "ar"))
      .map(([branch, logs]) => [
        branch,
        logs.length,
        logs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0),
      ]);
    const totalCompanyAmount = exportLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
    const branchAnalysis = [...byBranch.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "ar"))
      .map(([branch, logs]) => {
        const mechanicalAmount = logs.reduce((sum, log) => sum + Object.entries(parseBd(log))
          .filter(([type]) => /ميكاني|ميكانيك|ميكانيكا/i.test(type))
          .reduce((inner, [, amount]) => inner + (Number(amount) || 0), 0), 0);
        const electricalAmount = logs.reduce((sum, log) => sum + Object.entries(parseBd(log))
          .filter(([type]) => /كهرب/i.test(type))
          .reduce((inner, [, amount]) => inner + (Number(amount) || 0), 0), 0);
        const mechanicalCount = logs.filter(log => /ميكاني|ميكانيك|ميكانيكا/i.test(log.maintenance_type || "") ||
          Object.keys(parseBd(log)).some(type => /ميكاني|ميكانيك|ميكانيكا/i.test(type))).length;
        const electricalCount = logs.filter(log => /كهرب/i.test(log.maintenance_type || "") ||
          Object.keys(parseBd(log)).some(type => /كهرب/i.test(type))).length;
        const amount = logs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
        return [
          branch, logs.length, amount, mechanicalCount, mechanicalAmount,
          electricalCount, electricalAmount, logs.length ? amount / logs.length : 0,
          totalCompanyAmount ? amount / totalCompanyAmount : 0,
        ];
      });
    const typeSummary = new Map<string, { count: number; amount: number }>();
    exportLogs.forEach(log => {
      const branch = log.branch?.trim() || "بدون فرع";
      const breakdown = parseBd(log);
      const entries = Object.entries(breakdown).filter(([, amount]) => Number(amount) > 0);
      const types = entries.length > 0
        ? entries.map(([type, amount]) => ({ type, amount: Number(amount) || 0 }))
        : [{ type: log.maintenance_type?.trim() || "غير محدد", amount: Number(log.amount) || 0 }];
      types.forEach(({ type, amount }) => {
        const key = `${branch}\u0000${type}`;
        const current = typeSummary.get(key) || { count: 0, amount: 0 };
        current.count += 1;
        current.amount += amount;
        typeSummary.set(key, current);
      });
    });
    const reportRows: unknown[][] = [
      ["تقرير ملخص سجل الأعطال"],
      ["تاريخ التصدير", new Date().toLocaleString("ar-SA")],
      ["عدد السجلات", exportLogs.length],
      ["إجمالي المبالغ", exportLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0)],
      ["الفلاتر المستخدمة", [
        mlSearch && `البحث: ${mlSearch}`,
        mlBranch && `الفرع: ${mlBranch}`,
        mlVehicle && `اللوحة: ${mlVehicle}`,
        mlFrom && `من: ${mlFrom}`,
        mlTo && `إلى: ${mlTo}`,
        mlTypeFilter && `نوع العطل: ${mlTypeFilter}`,
      ].filter(Boolean).join(" | ") || "لا توجد فلاتر"],
      [],
      ["ملخص حسب الفرع"],
      ["الفرع", "عدد السجلات", "إجمالي المبلغ"],
      ...branchSummary,
      [],
      ["تفصيل أنواع الصيانة حسب الفرع"],
      ["الفرع", "نوع الصيانة", "عدد السجلات", "إجمالي المبلغ"],
      ...[...typeSummary.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "ar"))
        .map(([key, summary]) => {
          const [branch, type] = key.split("\u0000");
          return [branch, type, summary.count, summary.amount];
        }),
      [],
      ["تحليل بيانات كل فرع"],
      ["الفرع", "عدد السجلات", "الإجمالي", "عدد الميكانيكا", "مبلغ الميكانيكا", "عدد الكهرباء", "مبلغ الكهرباء", "متوسط السجل", "نسبة الفرع"],
      ...branchAnalysis,
    ];
    const reportSheet = XLSX.utils.aoa_to_sheet(reportRows);
    reportSheet["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
    reportSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    reportSheet["!rtl"] = true;
    for (let row = 0; row < reportRows.length; row++) {
      for (let column = 0; column < (reportRows[row]?.length || 1); column++) {
        const cell = reportSheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (!cell) continue;
        cell.s = {
          alignment: { horizontal: "right", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "D9E2F3" } },
            bottom: { style: "thin", color: { rgb: "D9E2F3" } },
            left: { style: "thin", color: { rgb: "D9E2F3" } },
            right: { style: "thin", color: { rgb: "D9E2F3" } },
          },
        };
      }
      if (reportRows[row]?.length === 1 || (typeof reportRows[row]?.[0] === "string" && String(reportRows[row][0]).includes("الفرع"))) {
        const firstCell = reportSheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
        if (firstCell) firstCell.s = {
          fill: { patternType: "solid", fgColor: { rgb: "FCE4D6" } },
          font: { bold: true, color: { rgb: "000000" } },
          alignment: { horizontal: "right", vertical: "center", wrapText: true },
        };
      }
    }
    XLSX.utils.book_append_sheet(wb, reportSheet, makeSheetName("تقرير وملخص"));
    XLSX.writeFile(wb, `سجل_الأعطال_${new Date().toLocaleDateString("en-CA")}.xlsx`);
  };

  // ── Company maintenance register: one sheet per branch, mech/electric only ─
  const exportCompanyMaintenanceRegister = async () => {
    let exportLogs: MaintenanceLog[];
    try {
      // This report is for the company, so it must include every branch even
      // when the maintenance-log screen currently has a filter applied.
      const response = await fetch("/api/maintenance-logs");
      const data = await response.json();
      exportLogs = Array.isArray(data) ? data as MaintenanceLog[] : [];
    } catch {
      return void alert("تعذر تحميل بيانات سجل الشركة");
    }
    if (exportLogs.length === 0) return void alert("لا توجد بيانات لسجل الشركة");

    type CompanyRow = MaintenanceLog & {
      company_type: "ميكانيكا" | "كهرباء";
      company_amount: number;
    };
    const isOilChangeType = (value: string) =>
      /(?:تبديل|تغيير)\s*(?:ال)?زيت/i.test(normalizeMaintenanceType(value));
    const maintenanceTypesOf = (log: MaintenanceLog) => [
      ...(log.maintenance_type || "").split(/[,،]/),
      ...Object.keys(parseBd(log)),
    ]
      .map(normalizeMaintenanceType)
      .filter(Boolean);
    const hasOilChange = (log: MaintenanceLog) =>
      maintenanceTypesOf(log).some(isOilChangeType);
    const oilChangeAmount = (log: MaintenanceLog) => {
      const breakdown = parseBd(log);
      const oilBreakdownEntries = Object.entries(breakdown)
        .filter(([type]) => isOilChangeType(type));
      if (oilBreakdownEntries.length > 0) {
        return oilBreakdownEntries.reduce((sum, [, amount]) => sum + (Number(amount) || 0), 0);
      }

      // Legacy oil-only rows did not always have amount_breakdown.
      const savedTypes = (log.maintenance_type || "")
        .split(/[,،]/)
        .map(normalizeMaintenanceType)
        .filter(Boolean);
      return savedTypes.length > 0 && savedTypes.every(isOilChangeType)
        ? Number(log.amount) || 0
        : 0;
    };
    const filterStatus = (log: MaintenanceLog) =>
      (log.parts || []).some(part => /فلتر|فلاتر|filter/i.test(
        `${part.item_name || ""} ${part.item_code || ""}`,
      ))
        ? "مع فلاتر"
        : "بدون فلاتر";
    const classifyAmount = (log: MaintenanceLog): CompanyRow[] => {
      const breakdown = parseBd(log);
      const electrical = Object.entries(breakdown)
        .filter(([type]) => /كهرب/i.test(type))
        .reduce((sum, [, amount]) => sum + (Number(amount) || 0), 0);
      // The company register has two rows per mixed card: electricity gets
      // its own amount, while every non-electricity type is grouped together
      // in the mechanical/other row.
      const otherAmount = Object.entries(breakdown)
        .filter(([type]) => !/كهرب/i.test(type))
        .reduce((sum, [, amount]) => sum + (Number(amount) || 0), 0);
      const rawType = log.maintenance_type || "";
      const rawTypes = rawType.split(/[,،]/).map(normalizeMaintenanceType).filter(Boolean);
      const hasElectrical = electrical > 0 || /كهرب/i.test(rawType);
      const hasOther = otherAmount > 0 || rawTypes.some(type => !/كهرب/i.test(type));
      const total = Number(log.amount) || 0;
      const groupedOtherAmount = otherAmount || (
        hasElectrical && electrical > 0
          ? Math.max(total - electrical, 0)
          : !hasElectrical ? total : 0
      );
      const rows: CompanyRow[] = [];
      if (hasElectrical) rows.push({ ...log, company_type: "كهرباء", company_amount: electrical || (!hasOther ? total : 0) });
      if (hasOther) rows.push({ ...log, company_type: "ميكانيكا", company_amount: groupedOtherAmount });
      // Any legacy/unknown category is kept in the mechanical register rather
      // than creating a third category in the company's official report.
      if (rows.length === 0) rows.push({ ...log, company_type: "ميكانيكا", company_amount: total });
      return rows;
    };
    const companyStatement = (log: MaintenanceLog) => {
      const mainType = /ميكاني|ميكانيك|ميكانيكا|كهرب/i;
      const detailTypes = [
        ...(log.maintenance_type || "").split(/[,،]/),
        ...Object.keys(parseBd(log)),
      ]
        .map(normalizeMaintenanceType)
        .filter(type => type && !mainType.test(type))
        .filter((type, index, all) => all.indexOf(type) === index);
      const description = (log.description || "").trim();
      if (detailTypes.length === 0) return description;
      const details = `الأنواع المنفذة: ${detailTypes.join("، ")}`;
      return [description, details].filter(Boolean).join(" — ");
    };

    const headers = [
      "التاريخ", "وقت الدخول", "وقت الخروج", "تاريخ الخروج",
      "رقم اللوحة", "اسم السائق", "الفرع", "نوع الصيانة",
      "بيان الصيانة", "رقم كرت الصيانة", "مبلغ الصيانة",
    ];
    const toSheet = (logs: MaintenanceLog[]) => {
      const companyRows = logs.flatMap(classifyAmount);
      const data = companyRows.map(row => ({
        "التاريخ": row.maintenance_date || "",
        "وقت الدخول": row.entry_time || "",
        "وقت الخروج": row.exit_time || "",
        "تاريخ الخروج": row.exit_date || "",
        "رقم اللوحة": row.vehicle_plate || row.trailer_number || "",
        "اسم السائق": row.driver_name || "",
        "الفرع": row.branch || "",
        "نوع الصيانة": row.company_type,
        "بيان الصيانة": companyStatement(row),
        "رقم كرت الصيانة": row.card_number || "",
        "مبلغ الصيانة": row.company_amount,
      }));
      const ws = XLSX.utils.json_to_sheet(data, { header: headers });
      const endRow = Math.max(1, companyRows.length + 1);
      ws["!autofilter"] = { ref: `A1:K${endRow}` };
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      ws["!cols"] = [
        { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 13 },
        { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 13 },
        { wch: 58 }, { wch: 16 }, { wch: 16 },
      ];
      // Totals are deliberately placed after the filtered table so they remain
      // readable in Excel and match the company's paper register layout.
      const mechanicalRows = companyRows.filter(row => row.company_type === "ميكانيكا");
      const electricalRows = companyRows.filter(row => row.company_type === "كهرباء");
      const summaryStart = companyRows.length + 3;
      XLSX.utils.sheet_add_aoa(ws, [
        ["إجمالي الميكانيكا", mechanicalRows.reduce((sum, row) => sum + row.company_amount, 0), "عدد الميكانيكا", mechanicalRows.length],
        ["إجمالي الكهرباء", electricalRows.reduce((sum, row) => sum + row.company_amount, 0), "عدد الكهرباء", electricalRows.length],
        ["الإجمالي العام", companyRows.reduce((sum, row) => sum + row.company_amount, 0), "عدد السجلات", companyRows.length],
      ], { origin: `A${summaryStart}` });
      return ws;
    };

    const byBranch = new Map<string, MaintenanceLog[]>();
    exportLogs.forEach(log => {
      const branch = log.branch?.trim() || "بدون فرع";
      byBranch.set(branch, [...(byBranch.get(branch) || []), log]);
    });
    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();
    const sheetName = (branch: string) => {
      const base = branch.replace(/[\\/:*?"<>\[\]]/g, " ").trim().slice(0, 31) || "بدون فرع";
      let name = base;
      let suffix = 2;
      while (usedNames.has(name)) {
        const suffixText = ` (${suffix++})`;
        name = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
      }
      usedNames.add(name);
      return name;
    };
    [...byBranch.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "ar"))
      .forEach(([branch, logs]) => XLSX.utils.book_append_sheet(wb, toSheet(logs), sheetName(branch)));

    // A dedicated company-wide sheet for oil changes. It keeps the complete
    // register columns, but uses only the oil-change amount and marks whether
    // a filter was issued from the workshop inventory for the same card.
    const oilHeaders = [
      "التاريخ", "وقت الدخول", "وقت الخروج", "تاريخ الخروج",
      "رقم اللوحة", "الشغل على", "اسم السائق", "الفرع",
      "نوع الصيانة", "بيان الصيانة", "رقم كرت الصيانة",
      "الأصناف المُصرفة", "الفلاتر", "مبلغ تبديل الزيت",
    ];
    const oilLogs = exportLogs.filter(hasOilChange);
    const oilRows = oilLogs.map(log => ({
      "التاريخ": log.maintenance_date || "",
      "وقت الدخول": log.entry_time || "",
      "وقت الخروج": log.exit_time || "",
      "تاريخ الخروج": log.exit_date || "",
      "رقم اللوحة": log.vehicle_plate || log.trailer_number || "",
      "الشغل على": log.vehicle_choice === "trailer" && log.trailer_number
        ? `تيدر رقم ${log.trailer_number}`
        : (log.vehicle_plate ? `راس رقم ${log.vehicle_plate}` : ""),
      "اسم السائق": log.driver_name || "",
      "الفرع": log.branch || "",
      "نوع الصيانة": "تبديل زيت",
      "بيان الصيانة": companyStatement(log),
      "رقم كرت الصيانة": log.card_number || "",
      "الأصناف المُصرفة": log.parts?.map(part =>
        `${part.item_name} ×${part.quantity} ${part.unit}`,
      ).join("، ") || "",
      "الفلاتر": filterStatus(log),
      "مبلغ تبديل الزيت": oilChangeAmount(log),
    }));
    const oilSheet = XLSX.utils.json_to_sheet(oilRows, { header: oilHeaders });
    oilSheet["!autofilter"] = {
      ref: `A1:N${Math.max(1, oilRows.length + 1)}`,
    };
    oilSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    oilSheet["!cols"] = [
      { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 13 },
      { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 16 },
      { wch: 14 }, { wch: 58 }, { wch: 16 }, { wch: 42 },
      { wch: 14 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, oilSheet, sheetName("تبديل الزيت"));
    XLSX.writeFile(wb, `تصدير_سجل_للشركة_${new Date().toLocaleDateString("en-CA")}.xlsx`);
  };

  // ── Maintenance Log: add / edit ────────────────────────────────────────────
  const saveMaintenanceLog = async () => {
    setMlError("");
    const isEdit = editingLog !== null;
    const vehicleChanged = isEdit &&
      mlForm.vehicle_plate.trim() !== String(editingLog?.vehicle_plate || "").trim();
    if ((!isEdit || vehicleChanged) && !mlForm.branch.trim()) {
      setMlError("يجب اختيار الفرع قبل حفظ سجل العطل");
      return;
    }
    setMlSubmitting(true);
    try {
      const url = isEdit ? `/api/maintenance-logs/${editingLog!.id}` : "/api/maintenance-logs";
      const method = isEdit ? "PUT" : "POST";
      const totalAmt = selectedMaintTypes.reduce((s, t) => s + (Number(typePrices[t]) || 0), 0);
      const isTrailer = mlForm.vehicle_choice === "trailer";
      const body: Record<string, unknown> = {
        ...mlForm,
        amount: totalAmt,
        technicians:       selectedTechs.length > 0 ? selectedTechs.join("، ") : null,
        tires: selectedTires.length > 0
          ? JSON.stringify(selectedTires.map(id => ({ id, ...(tireDetails[id] || { cond: "new" }) })))
          : null,
        amount_breakdown: Object.keys(typePrices).length > 0 ? JSON.stringify(
          Object.fromEntries(Object.entries(typePrices).map(([k, v]) => [k, Number(v) || 0]).filter(([, v]) => (v as number) > 0))
        ) : null,
        // always save both — vehicle_choice only controls work target (tire diagram etc.)
        vehicle_plate:  mlForm.vehicle_plate  || null,
        trailer_number: mlForm.trailer_number || null,
        trailer_type:   mlForm.trailer_type   || null,
        is_external:    mlForm.vehicle_plate
          ? (fleetVehicles.some(v => v.plate_number === mlForm.vehicle_plate) ? 0 : 1)
          : 0,
      };
      body.inv_items    = invItems.map(ii => ({ id: ii.item.id, qty: Number(ii.qty) || 1 }));
      body.performed_by = user?.name;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const d = await res.json();
        setMlError(d.error || "رقم الكارت مكرر");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMlError(d.error || "فشل الحفظ");
        return;
      }
      setShowMlForm(false);
      setEditingLog(null);
      setMlForm(EMPTY_ML_FORM);
      localStorage.removeItem("workshop_card_draft");
      setSelectedTechs([]); setTechInput(""); setSelectedTires([]); setTireDetails({});
      setTypePrices({});
      setInvItems([]); setInvSearchQ(""); setInvDropOpen(false);
       loadMaintenanceLogs({ search: mlSearch, vehicle: mlVehicle, branch: mlBranch, from: mlFrom, to: mlTo });
      loadInventory();
    } finally { setMlSubmitting(false); }
  };

  // ── Maintenance Log: delete single ────────────────────────────────────────
  const deleteMaintenanceLog = async (id: number) => {
    if (!confirm("حذف هذا السجل؟")) return;
    await fetch(`/api/maintenance-logs/${id}`, { method: "DELETE" });
    loadMaintenanceLogs({ search: mlSearch, vehicle: mlVehicle, branch: mlBranch, from: mlFrom, to: mlTo });
  };

  // ── Maintenance Log: record exit time ──────────────────────────────────────
  const recordExit = async () => {
    if (!exitingLog) return;
    if (!exitForm.exit_time) return alert("يرجى إدخال وقت الخروج");
    setExitSubmitting(true);
    try {
      await fetch(`/api/maintenance-logs/${exitingLog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_number:       exitingLog.card_number,
          maintenance_date:  exitingLog.maintenance_date,
          entry_time:        exitingLog.entry_time,
          exit_time:         exitForm.exit_time,
          exit_date:         exitForm.exit_date,
          vehicle_plate:     exitingLog.vehicle_plate,
          driver_name:       exitingLog.driver_name,
          branch:            exitingLog.branch,
          maintenance_type:  exitingLog.maintenance_type,
          description:       exitingLog.description,
          amount:            exitingLog.amount,
          amount_mechanical: exitingLog.amount_mechanical,
          amount_electrical: exitingLog.amount_electrical,
          vehicle_choice:    exitingLog.vehicle_choice,
          trailer_number:    exitingLog.trailer_number,
          trailer_type:      exitingLog.trailer_type,
          technicians:       exitingLog.technicians,
          tires:             exitingLog.tires,
          amount_breakdown:  exitingLog.amount_breakdown,
          is_external:       exitingLog.is_external,
        }),
      });
      setExitingLog(null);
       loadMaintenanceLogs({ search: mlSearch, vehicle: mlVehicle, branch: mlBranch, from: mlFrom, to: mlTo });
    } catch { alert("فشل تسجيل الخروج"); }
    finally { setExitSubmitting(false); }
  };

  // ── Maintenance Log: clear all ─────────────────────────────────────────────
  const clearAllMaintenanceLogs = async () => {
    if (!confirm(`حذف جميع سجلات الأعطال (${maintenanceLogs.length} سجل)؟\nهذا الإجراء لا يمكن التراجع عنه.`)) return;
    await fetch("/api/maintenance-logs/clear", { method: "DELETE" });
    loadMaintenanceLogs();
  };

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const openBreakdowns = reports.filter(r => r.status === "open").length;
  const openJobs       = jobs.filter(j => j.status === "open").length;
  const inProgressJobs = jobs.filter(j => j.status === "in_progress").length;
  const lowStock       = inventory.filter(i => i.quantity <= i.min_stock).length;

  // ── Filtered job list ───────────────────────────────────────────────────────
  const displayedJobs = jTab === "all" ? jobs : jobs.filter(j => j.status === jTab);
  const baseReports   = bTab === "open" ? reports.filter(r => r.status === "open") : reports;
  const displayedReports = bVehicleFilter
    ? baseReports.filter(r => r.vehicle_plate === bVehicleFilter)
    : baseReports;
  const breakdownVehicles = [...new Set(reports.map(r => r.vehicle_plate).filter(Boolean))].sort() as string[];

  // ── Print helpers ────────────────────────────────────────────────────────────
  const LOGO_URL = window.location.origin + "/logo.png";

  const PRINT_CSS_BASE = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;padding:20px 26px;color:#111;background:#fff}
.hdr{display:flex;align-items:center;gap:16px;border-bottom:3px solid #103c68;padding-bottom:14px;margin-bottom:20px}
.hdr-logo{width:64px;height:64px;object-fit:contain;flex-shrink:0}
.hdr-text{flex:1;text-align:center}
.co{font-size:19px;font-weight:900;color:#103c68;letter-spacing:1px}
.rpt{font-size:14px;font-weight:700;color:#444;margin-top:4px}
.meta{font-size:12px;color:#444;font-weight:600;margin-top:3px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#103c68;color:#fff;padding:8px 9px;text-align:right;font-weight:700;font-size:11px}
td{padding:6px 9px;border-bottom:1px solid #e5e7eb;vertical-align:top}
tr:nth-child(even) td{background:#f8fafc}
.bo{background:#fee2e2;color:#991b1b;border-radius:5px;padding:2px 6px;font-size:10px;font-weight:700}
.br{background:#dcfce7;color:#166534;border-radius:5px;padding:2px 6px;font-size:10px;font-weight:700}
tfoot td{background:#eff6ff;font-weight:700;border-top:2px solid #103c68}
.vhdr{background:#103c68;color:#fff;padding:10px 14px;font-size:14px;font-weight:900;border-radius:8px 8px 0 0;margin-top:4px}
.vsub{font-size:12px;font-weight:600;opacity:1;margin-right:8px}
.vsec{margin-bottom:0}
.vsec table{border-radius:0 0 8px 8px;overflow:hidden}
.ft{margin-top:16px;font-size:11px;color:#555;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
@page{size:A4 portrait;margin:1cm}html{width:210mm}body{width:210mm;margin:0;padding:0}@media print{body{padding:4px}.no-break{page-break-inside:avoid}.page-break{page-break-after:always}}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.07;width:65%;pointer-events:none;z-index:-1}
`;

  const mkHdr = (title: string, now: string, count: number, extra = "") =>
    `<div class="hdr">
      <img src="${LOGO_URL}" class="hdr-logo" alt="logo" />
      <div class="hdr-text">
        <div class="co">MKGH — شركة المثالي للمقاولات والنقليات</div>
        <div class="rpt">${title}</div>
        <div class="meta">تاريخ الطباعة: ${now} — إجمالي السجلات: ${count}${extra}</div>
      </div>
      <img src="${LOGO_URL}" class="hdr-logo" alt="logo" />
    </div>`;

  const bdRows = (records: BreakdownReport[]) =>
    records.map((r, i) => `<tr>
      <td>${i + 1}</td>
      <td><strong>${r.vehicle_plate || "—"}</strong></td>
      <td>${r.driver_name || r.driver_phone || "—"}</td>
      <td>${r.breakdown_type || "—"}</td>
      <td>${r.description || "—"}</td>
      <td><span class="${r.status === "open" ? "bo" : "br"}">${r.status === "open" ? "مفتوح" : "تم الحل"}</span></td>
      <td>${r.resolve_notes || "—"}</td>
      <td>${r.resolved_by || "—"}</td>
      <td>${new Date(r.created_at).toLocaleDateString("ar-SA")}</td>
    </tr>`).join("");

  const bdThead = () =>
    `<thead><tr>
      <th>#</th><th>رقم اللوحة</th><th>السائق</th><th>نوع العطل</th>
      <th>الوصف</th><th>الحالة</th><th>ملاحظات الحل</th>
      <th>المسؤول عن الحل</th><th>تاريخ البلاغ</th>
    </tr></thead>`;

  const printBreakdownReports = (records: BreakdownReport[], vehiclePlate?: string) => {
    const win = window.open("", "_blank", "width=1000,height=750");
    if (!win) { alert("يرجى السماح بالنوافذ المنبثقة لطباعة التقرير"); return; }
    const title = vehiclePlate ? `سجل أعطال السيارة: ${vehiclePlate}` : "سجل الأعطال الكامل";
    const now = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
<style>${PRINT_CSS_BASE}</style></head><body>
<img class="wm" src="${LOGO_URL}" alt="" />
${mkHdr(title, now, records.length)}
<table>${bdThead()}<tbody>${bdRows(records)}</tbody></table>
<div class="ft">تم إنشاء هذا التقرير بواسطة نظام MKGH — ${now}</div>
<script>window.onload=()=>window.print();<\/script></body></html>`);
    win.document.close();
  };

  const printBreakdownsPerVehicle = (records: BreakdownReport[]) => {
    const win = window.open("", "_blank", "width=1000,height=750");
    if (!win) { alert("يرجى السماح بالنوافذ المنبثقة لطباعة التقرير"); return; }
    const now = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    const plates = [...new Set(records.map(r => r.vehicle_plate).filter(Boolean))].sort() as string[];
    const sections = plates.map((plate, pi) => {
      const vRecs = records.filter(r => r.vehicle_plate === plate);
      const isLast = pi === plates.length - 1;
      return `<div class="vsec${isLast ? "" : " page-break"}">
        <div class="vhdr">🚛 سيارة: ${plate} <span class="vsub">(${vRecs.length} سجل)</span></div>
        <table>${bdThead()}<tbody>${bdRows(vRecs)}</tbody></table>
      </div>`;
    }).join("");
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>سجل الأعطال — كل سيارة منفردة</title>
<style>${PRINT_CSS_BASE}</style></head><body>
<img class="wm" src="${LOGO_URL}" alt="" />
${mkHdr("سجل الأعطال — كل سيارة منفردة", now, records.length, ` — ${plates.length} سيارة`)}
${sections}
<div class="ft">تم إنشاء هذا التقرير بواسطة نظام MKGH — ${now}</div>
<script>window.onload=()=>window.print();<\/script></body></html>`);
    win.document.close();
  };

  const fmtSAR = (n: number) => n.toLocaleString("ar-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 0 });

  const mlThead = () =>
    `<thead><tr>
      <th>#</th><th>رقم الكارت</th><th>التاريخ</th>
      <th>وقت الدخول</th><th>وقت الخروج</th><th>تاريخ الخروج</th>
      <th>رقم اللوحة</th><th>اسم السائق</th><th>الفرع</th>
      <th>نوع الصيانة</th><th>البيان</th>
      <th>ميكانيكا</th><th>كهرباء</th><th>الإجمالي</th>
    </tr></thead>`;

  const mlRows = (records: MaintenanceLog[]) =>
    records.map((r, i) => `<tr>
      <td>${i + 1}</td>
      <td><strong>${r.card_number || "—"}</strong></td>
      <td>${r.maintenance_date || "—"}</td>
      <td>${r.entry_time || "—"}</td>
      <td>${r.exit_time || "—"}</td>
      <td>${r.exit_date || "—"}</td>
      <td><strong>${r.vehicle_plate || "—"}</strong></td>
      <td>${r.driver_name || "—"}</td>
      <td>${r.branch || "—"}</td>
      <td>${r.maintenance_type || "—"}</td>
      <td>${r.description || "—"}</td>
      <td>${r.amount_mechanical > 0 ? fmtSAR(r.amount_mechanical) : "—"}</td>
      <td>${r.amount_electrical > 0 ? fmtSAR(r.amount_electrical) : "—"}</td>
      <td><strong>${r.amount > 0 ? fmtSAR(r.amount) : "—"}</strong></td>
    </tr>`).join("");

  const mlTfoot = (records: MaintenanceLog[]) =>
    `<tfoot><tr>
      <td colspan="11" style="text-align:right">المجموع الكلي</td>
      <td>${fmtSAR(records.reduce((s, r) => s + (r.amount_mechanical || 0), 0))}</td>
      <td>${fmtSAR(records.reduce((s, r) => s + (r.amount_electrical || 0), 0))}</td>
      <td>${fmtSAR(records.reduce((s, r) => s + (r.amount || 0), 0))}</td>
    </tr></tfoot>`;

  const printMaintenanceLogs = (records: MaintenanceLog[], vehiclePlate?: string) => {
    const win = window.open("", "_blank", "width=1100,height=750");
    if (!win) { alert("يرجى السماح بالنوافذ المنبثقة لطباعة التقرير"); return; }
    const title = vehiclePlate ? `سجل صيانة السيارة: ${vehiclePlate}` : "سجل الأعطال والصيانة الكامل";
    const now = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    const total = records.reduce((s, r) => s + (r.amount || 0), 0);
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
<style>${PRINT_CSS_BASE}@page{size:A4 landscape;margin:10mm}html{width:297mm}body{width:297mm;margin:0;padding:0}</style></head><body>
<img class="wm" src="${LOGO_URL}" alt="" />
${mkHdr(title, now, records.length, ` — الإجمالي: ${fmtSAR(total)}`)}
<table>${mlThead()}<tbody>${mlRows(records)}</tbody>${mlTfoot(records)}</table>
<div class="ft">تم إنشاء هذا التقرير بواسطة نظام MKGH — ${now}</div>
<script>window.onload=()=>window.print();<\/script></body></html>`);
    win.document.close();
  };

  const printMaintenanceLogsPerVehicle = (records: MaintenanceLog[]) => {
    const win = window.open("", "_blank", "width=1100,height=750");
    if (!win) { alert("يرجى السماح بالنوافذ المنبثقة لطباعة التقرير"); return; }
    const now = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    const plates = [...new Set(records.map(r => r.vehicle_plate).filter(Boolean))].sort() as string[];
    const sections = plates.map((plate, pi) => {
      const vRecs = records.filter(r => r.vehicle_plate === plate);
      const isLast = pi === plates.length - 1;
      const vTotal = vRecs.reduce((s, r) => s + (r.amount || 0), 0);
      return `<div class="vsec${isLast ? "" : " page-break"}">
        <div class="vhdr">🚛 سيارة: ${plate} <span class="vsub">(${vRecs.length} سجل — إجمالي: ${fmtSAR(vTotal)})</span></div>
        <table>${mlThead()}<tbody>${mlRows(vRecs)}</tbody>${mlTfoot(vRecs)}</table>
      </div>`;
    }).join("");
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>سجل الصيانة — كل سيارة منفردة</title>
<style>${PRINT_CSS_BASE}@media print{@page{size:A4 landscape}}</style></head><body>
<img class="wm" src="${LOGO_URL}" alt="" />
${mkHdr("سجل الأعطال والصيانة — كل سيارة منفردة", now, records.length, ` — ${plates.length} سيارة`)}
${sections}
<div class="ft">تم إنشاء هذا التقرير بواسطة نظام MKGH — ${now}</div>
<script>window.onload=()=>window.print();<\/script></body></html>`);
    win.document.close();
  };

  // ── طباعة كارت واحد (لوجو جيفر) ─────────────────────────────────────────
  const JEFER_LOGO = window.location.origin + "/jefer-logo-new.png";

  // ── Helper: build single card inner HTML (shared by single + multi print) ──
  const buildCardHTML = (r: MaintenanceLog, now: string) => {
    const field = (label: string, val: string | number | null | undefined, cls = "") =>
      `<div class="field${cls ? " " + cls : ""}"><span class="lbl">${label}</span><span class="val">${val || "—"}</span></div>`;
    const parts = r.parts ?? [];
    const partsTotal = parts.reduce((s, p) => s + p.quantity * p.cost_per_unit, 0);
    const partsSection = parts.length > 0 ? `
<div class="parts-box">
  <div class="parts-hdr"><span>🔧</span> قطع الغيار المُستخدمة</div>
  <table class="parts-tbl">
    <thead><tr>
      <th>رقم الصنف</th><th>اسم القطعة</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>الإجمالي</th>
    </tr></thead>
    <tbody>
      ${parts.map(p => `<tr>
        <td style="text-align:center;font-family:monospace;color:#555">${p.item_code || "—"}</td>
        <td><strong>${p.item_name}</strong></td>
        <td style="text-align:center">${p.quantity}</td>
        <td style="text-align:center">${p.unit}</td>
        <td style="text-align:center">${p.cost_per_unit > 0 ? fmtSAR(p.cost_per_unit) : "—"}</td>
        <td style="text-align:center;font-weight:700">${p.cost_per_unit > 0 ? fmtSAR(p.quantity * p.cost_per_unit) : "—"}</td>
      </tr>`).join("")}
    </tbody>
    ${partsTotal > 0 ? `<tfoot><tr>
      <td colspan="5" style="text-align:right;font-weight:700">إجمالي قطع الغيار</td>
      <td style="text-align:center;font-weight:900;color:#103c68">${fmtSAR(partsTotal)}</td>
    </tr></tfoot>` : ""}
  </table>
</div>` : "";
    // ── Per-type amount breakdown ──────────────────────────────────────────────
    const breakdown = (() => {
      if (!r.amount_breakdown) return null;
      try { return JSON.parse(r.amount_breakdown) as Record<string, number>; } catch { return null; }
    })();
    const bdTypes = (r.maintenance_type || "").split(/[,،]/).map(s => s.trim()).filter(Boolean);
    const totalsSection = (() => {
      if (breakdown && Object.keys(breakdown).length > 0) {
        const cells = bdTypes
          .map(t => {
            const price = breakdown[t] || 0;
            return price > 0
              ? `<div class="tot-type-cell"><div class="tot-lbl">${t}</div><div class="tot-val">${fmtSAR(price)}</div></div>`
              : "";
          })
          .filter(Boolean)
          .join("");
        return `<div class="tot-type-grid">${cells}<div class="tot-type-cell tot-type-total"><div class="tot-lbl">الإجمالي</div><div class="tot-val t-total">${r.amount > 0 ? fmtSAR(r.amount) : "—"}</div></div></div>`;
      }
      return `<div class="tot-grid">
        <div class="tot-cell"><div class="tot-lbl">ميكانيكا</div><div class="tot-val t-mech">${r.amount_mechanical > 0 ? fmtSAR(r.amount_mechanical) : "—"}</div></div>
        <div class="tot-cell"><div class="tot-lbl">كهرباء</div><div class="tot-val t-elec">${r.amount_electrical > 0 ? fmtSAR(r.amount_electrical) : "—"}</div></div>
        <div class="tot-cell"><div class="tot-lbl">الإجمالي</div><div class="tot-val t-total">${r.amount > 0 ? fmtSAR(r.amount) : "—"}</div></div>
      </div>`;
    })();
    const plateOrTrailer = r.vehicle_plate || (r.trailer_number ? `تيدر ${r.trailer_number}` : null);
    const workTargetLabel = r.vehicle_choice === "trailer" && r.trailer_number
      ? `🔗 تيدر رقم ${r.trailer_number}`
      : `🚛 سيارة رقم ${r.vehicle_plate || "—"}`;
    return `
<img class="wm" src="${LOGO_URL}" alt="" />
<div class="lh">
  <div class="lh-s ar">
    <div class="cn">شركة جيفر التجارية</div>
    <div>س.ت : ١١٣١٣٠٣١٣٢</div>
    <div>المملكة العربية السعودية</div>
  </div>
  <div class="lh-c">
    <img class="logo" src="${JEFER_LOGO}" alt="Jefer" onerror="this.style.display='none'" />
    <div class="lh-mk">MKGH</div>
  </div>
  <div class="lh-s en">
    <div class="cn">Jefer Trading company</div>
    <div>C.R : 1131303132</div>
    <div>kingdom of saudi arabia</div>
  </div>
</div>
<div class="card-title">
  <h1>كارت صيانة السيارة</h1>
  <div class="card-num">كارت # ${r.card_number || r.id}</div>
</div>
<div class="grid4">
  ${field("رقم اللوحة", plateOrTrailer, "sm")}
  ${field("الشغل على", workTargetLabel, "sm")}
  ${field("اسم السائق", r.driver_name, "sm")}
  ${field("التاريخ", r.maintenance_date, "sm")}
  ${field("الفرع", r.branch, "sm")}
  ${field("وقت الدخول", r.entry_time, "sm")}
  ${field("وقت الخروج", r.exit_time, "sm")}
  ${field("تاريخ الخروج", r.exit_date, "sm")}
  ${field("نوع الصيانة", r.maintenance_type, "sm")}
</div>
<div class="grid">
  ${r.technicians ? field("الفنيون", r.technicians, "full") : ""}
  ${r.tires ? (() => {
    const { ids, details } = parseTires(r.tires);
    const lines = ids.map(id => {
      const det = details[id] || { cond: "new" };
      const label = TIRE_LABELS[id] || id;
      const cond = TIRE_COND_LABELS[det.cond] || det.cond;
      let extra = "";
      if (det.cond === "from_vehicle" && det.vehicle) extra = `: ${det.vehicle}`;
      else if (det.cond === "new" && det.serial) extra = ` (سيريل: ${det.serial})`;
      return `${label} — ${cond}${extra}`;
    }).join(" · ");
    return field("الكفرات", lines, "full");
  })() : ""}
  ${field("بيان الصيانة", r.description, "full")}
</div>
<div class="totals">
  <div class="tot-hdr">المبالغ</div>
  ${totalsSection}
</div>
${partsSection}
<div class="sig-section">
  <div class="sig-section-title">التوقيعات والاعتمادات</div>
  <div class="sig-row sig-row-3">
    <div class="sig-box"><div><span class="sig-num">١</span><br/><span class="sig-lbl">معد الكارت</span></div><div class="sig-area"></div></div>
    <div class="sig-box"><div><span class="sig-num">٢</span><br/><span class="sig-lbl">المشرف الفني</span></div><div class="sig-area"></div></div>
    <div class="sig-box"><div><span class="sig-num">٣</span><br/><span class="sig-lbl">السائق</span></div><div class="sig-area"></div></div>
  </div>
  <div class="sig-row sig-row-3">
    <div class="sig-box"><div><span class="sig-num">٤</span><br/><span class="sig-lbl">مدير الورشة</span></div><div class="sig-area"></div></div>
    <div class="sig-box"><div><span class="sig-num">٥</span><br/><span class="sig-lbl">المراقب</span></div><div class="sig-area"></div></div>
    <div class="sig-box" style="border:2px solid #103c68"><div><span class="sig-num" style="background:#c2410c">٦</span><br/><span class="sig-lbl" style="color:#103c68;font-size:10px">الاعتماد</span></div><div class="sig-area" style="border-bottom:1px dashed #103c68"></div></div>
  </div>
</div>
<div class="ft">تم إنشاء هذا الكارت بواسطة نظام MKGH — ${now}</div>`;
  };

  // ── Print multiple selected cards (each on its own page) ─────────────────
  const printSelectedCards = (logs: MaintenanceLog[]) => {
    const toprint = logs.filter(l => selectedCardIds.has(l.id));
    if (toprint.length === 0) return;
    const win = window.open("", "_blank", "width=820,height=800");
    if (!win) { alert("يرجى السماح بالنوافذ المنبثقة لطباعة الكروت"); return; }
    const now = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;background:#fff;color:#111}
.card-page{padding:22px 28px;page-break-after:always}
.card-page:last-child{page-break-after:avoid}
.lh{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #103c68;padding-bottom:8px;margin-bottom:8px}
.lh-s{flex:1;font-size:10px;line-height:1.65}.lh-s.ar{direction:rtl;text-align:right}.lh-s.en{direction:ltr;text-align:left}
.cn{font-size:12px;font-weight:900;color:#103c68}
.lh-c{text-align:center;flex-shrink:0;padding:0 10px}
.logo{height:60px;object-fit:contain;display:block;margin:0 auto}
.lh-mk{font-size:10px;font-weight:900;letter-spacing:2px;color:#103c68;text-align:center;margin-top:2px}
.card-title{text-align:center;margin-bottom:8px}
.card-title h1{font-size:13px;font-weight:900;color:#103c68}
.card-num{display:inline-block;background:#103c68;color:#fff;font-size:16px;font-weight:900;padding:3px 16px;border-radius:8px;letter-spacing:1px;margin-top:4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:6px}
.field{background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:5px 9px;display:flex;flex-direction:column;gap:1px}
.field.full{grid-column:1/-1}
.field.sm .val{font-size:12px}
.lbl{font-size:11px;color:#444;font-weight:700}
.val{font-size:11px;color:#111;font-weight:700}
.totals{border:2px solid #103c68;border-radius:9px;overflow:hidden;margin-bottom:8px}
.tot-hdr{background:#103c68;color:#fff;padding:5px 11px;font-size:11px;font-weight:700}
.tot-grid{display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center}
.tot-cell{padding:6px 5px;border-left:1px solid #e5e7eb}
.tot-cell:last-child{border-left:none}
.tot-type-grid{display:flex;flex-wrap:wrap}
.tot-type-cell{flex:1;min-width:60px;padding:5px 6px;text-align:center;border-left:1px solid #e5e7eb}
.tot-type-cell:last-child{border-left:none}
.tot-type-total{background:#eff6ff}
.tot-lbl{font-size:11px;color:#444;font-weight:700}
.tot-val{font-size:12px;font-weight:900;margin-top:1px}
.t-mech{color:#c2410c}.t-elec{color:#a16207}.t-total{color:#103c68}
.parts-box{border:1.5px solid #d1d5db;border-radius:9px;overflow:hidden;margin-bottom:8px}
.parts-hdr{background:#f0fdf4;color:#166534;padding:5px 10px;font-size:10px;font-weight:700;border-bottom:1px solid #d1fae5;display:flex;align-items:center;gap:6px}
.parts-tbl{width:100%;border-collapse:collapse;font-size:12px}
.parts-tbl th{background:#e5e7eb;color:#111;padding:5px 8px;text-align:right;font-weight:700;font-size:11px;border-bottom:1px solid #d1d5db}
.parts-tbl td{padding:4px 8px;border-bottom:1px solid #f3f4f6}
.parts-tbl tfoot td{background:#eff6ff;border-top:1.5px solid #103c68;font-size:10px}
.sig-section{margin-bottom:8px}
.sig-section-title{font-size:11px;font-weight:700;color:#103c68;margin-bottom:6px;padding-bottom:3px;border-bottom:2px solid #103c68}
.sig-row{display:grid;gap:8px;margin-bottom:7px}
.sig-row-3{grid-template-columns:1fr 1fr 1fr}
.sig-box{border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;text-align:center;min-height:52px;display:flex;flex-direction:column;justify-content:space-between}
.sig-num{display:inline-block;background:#103c68;color:#fff;font-size:7px;font-weight:700;width:14px;height:14px;border-radius:50%;line-height:14px;margin-bottom:3px}
.sig-lbl{font-size:8px;color:#374151;font-weight:700}
.sig-area{flex:1;min-height:18px;border-bottom:1px dashed #9ca3af;margin:4px 4px 3px}
.ft{font-size:11px;color:#555;text-align:center;border-top:1px solid #e5e7eb;padding-top:7px}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.07;width:65%;pointer-events:none;z-index:-1}
@page{size:A4 portrait;margin:14mm 16mm}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.card-page{padding:2px}}`;
    const cardsHTML = toprint.map(r => `<div class="card-page">${buildCardHTML(r, now)}</div>`).join("\n");
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="utf-8"><title>طباعة ${toprint.length} كروت صيانة</title>
<style>${CSS}</style></head><body>
${cardsHTML}
<script>window.onload=()=>window.print();<\/script>
</body></html>`);
    win.document.close();
  };

  const SINGLE_CARD_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;background:#fff;color:#111;padding:14px 20px}
.lh{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #103c68;padding-bottom:8px;margin-bottom:8px}
.lh-s{flex:1;font-size:10px;line-height:1.65}.lh-s.ar{direction:rtl;text-align:right}.lh-s.en{direction:ltr;text-align:left}
.cn{font-size:12px;font-weight:900;color:#103c68}
.lh-c{text-align:center;flex-shrink:0;padding:0 10px}
.logo{height:60px;object-fit:contain;display:block;margin:0 auto}
.lh-mk{font-size:10px;font-weight:900;letter-spacing:2px;color:#103c68;text-align:center;margin-top:2px}
.card-title{text-align:center;margin-bottom:8px}
.card-title h1{font-size:13px;font-weight:900;color:#103c68}
.card-num{display:inline-block;background:#103c68;color:#fff;font-size:16px;font-weight:900;padding:3px 16px;border-radius:8px;letter-spacing:1px;margin-top:4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:6px}
.field{background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:5px 9px;display:flex;flex-direction:column;gap:1px}
.field.full{grid-column:1/-1}
.field.sm .val{font-size:12px}
.lbl{font-size:11px;color:#444;font-weight:700}
.val{font-size:11px;color:#111;font-weight:700}
.totals{border:2px solid #103c68;border-radius:9px;overflow:hidden;margin-bottom:8px}
.tot-hdr{background:#103c68;color:#fff;padding:5px 11px;font-size:11px;font-weight:700}
.tot-grid{display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center}
.tot-cell{padding:6px 5px;border-left:1px solid #e5e7eb}
.tot-cell:last-child{border-left:none}
.tot-type-grid{display:flex;flex-wrap:wrap}
.tot-type-cell{flex:1;min-width:60px;padding:5px 6px;text-align:center;border-left:1px solid #e5e7eb}
.tot-type-cell:last-child{border-left:none}
.tot-type-total{background:#eff6ff}
.tot-lbl{font-size:11px;color:#444;font-weight:700}
.tot-val{font-size:12px;font-weight:900;margin-top:1px}
.t-mech{color:#c2410c}.t-elec{color:#a16207}.t-total{color:#103c68}
.parts-box{border:1.5px solid #d1d5db;border-radius:9px;overflow:hidden;margin-bottom:8px}
.parts-hdr{background:#f0fdf4;color:#166534;padding:5px 10px;font-size:10px;font-weight:700;border-bottom:1px solid #d1fae5;display:flex;align-items:center;gap:6px}
.parts-tbl{width:100%;border-collapse:collapse;font-size:12px}
.parts-tbl th{background:#e5e7eb;color:#111;padding:5px 8px;text-align:right;font-weight:700;font-size:11px;border-bottom:1px solid #d1d5db}
.parts-tbl td{padding:4px 8px;border-bottom:1px solid #f3f4f6}
.parts-tbl tfoot td{background:#eff6ff;border-top:1.5px solid #103c68;font-size:10px}
.sig-section{margin-bottom:8px}
.sig-section-title{font-size:11px;font-weight:700;color:#103c68;margin-bottom:6px;padding-bottom:3px;border-bottom:2px solid #103c68}
.sig-row{display:grid;gap:8px;margin-bottom:7px}
.sig-row-3{grid-template-columns:1fr 1fr 1fr}
.sig-box{border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;text-align:center;min-height:52px;display:flex;flex-direction:column;justify-content:space-between}
.sig-num{display:inline-block;background:#103c68;color:#fff;font-size:7px;font-weight:700;width:14px;height:14px;border-radius:50%;line-height:14px;margin-bottom:3px}
.sig-lbl{font-size:8px;color:#374151;font-weight:700}
.sig-area{flex:1;min-height:18px;border-bottom:1px dashed #9ca3af;margin:4px 4px 3px}
.ft{font-size:11px;color:#555;text-align:center;border-top:1px solid #e5e7eb;padding-top:7px}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.07;width:65%;pointer-events:none;z-index:-1}
@page{size:A4 portrait;margin:14mm 16mm}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{padding:0}}`;

  const printSingleCard = (r: MaintenanceLog) => {
    const win = window.open("", "_blank", "width=800,height=700");
    if (!win) { alert("يرجى السماح بالنوافذ المنبثقة لطباعة الكارت"); return; }
    const now = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="utf-8"><title>كارت صيانة ${r.card_number || r.id}</title>
<style>${SINGLE_CARD_CSS}</style></head><body>
${buildCardHTML(r, now)}
<script>window.onload=()=>window.print();<\/script>
</body></html>`);
    win.document.close();
  };

  return (
    <div dir="rtl" className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Wrench size={24} className="text-[#103c68]" />ورشة الصيانة
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">إدارة الأعطال وأوامر العمل والمخزون</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />تحديث
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "بلاغات مفتوحة", val: openBreakdowns, color: "bg-red-500",    Icon: AlertTriangle },
          { label: "أوامر مفتوحة",  val: openJobs,       color: "bg-orange-500", Icon: Clock },
          { label: "قيد العمل",     val: inProgressJobs, color: "bg-yellow-500", Icon: Wrench },
          { label: "مخزون منخفض",  val: lowStock,       color: "bg-purple-500", Icon: Package },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${kpi.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <kpi.Icon size={18} className="text-white" />
            </div>
            <div>
              <div className="text-2xl font-black text-gray-900">{kpi.val}</div>
              <div className="text-xs text-gray-400">{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl w-fit">
        {([
          { id: "breakdowns", label: "بلاغات الأعطال", count: openBreakdowns, Icon: AlertTriangle },
          { id: "jobs",       label: "أوامر العمل",    count: openJobs + inProgressJobs, Icon: Wrench },
          { id: "inventory",       label: "مستودع الورشة", count: lowStock, Icon: Boxes },
          { id: "maintenance_log", label: "سجل الأعطال",  count: 0,        Icon: FileText },
          { id: "oil_changes",     label: "سجل تبديل الزيت", count: 0,        Icon: ShoppingBag },
          { id: "tires",           label: "الكفرات",       count: 0,        Icon: AlertTriangle },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <t.Icon size={14} />
            {t.label}
            {t.count > 0 && <span className="text-xs font-black px-1.5 rounded-full bg-red-100 text-red-700">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── TAB: BREAKDOWNS ─────────────────────────────────────────────────── */}
      {tab === "breakdowns" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* open / all sub-tabs */}
            <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl">
              {([{ id: "open", label: "المفتوحة", count: openBreakdowns }, { id: "all", label: "الكل", count: reports.length }] as const).map(t => (
                <button key={t.id} onClick={() => setBTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                    ${bTab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {t.label}
                  {t.count > 0 && <span className="text-xs font-black px-1.5 rounded-full bg-gray-200 text-gray-600">{t.count}</span>}
                </button>
              ))}
            </div>

            {/* vehicle filter */}
            <select
              value={bVehicleFilter}
              onChange={e => setBVehicleFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
              <option value="">كل السيارات</option>
              {breakdownVehicles.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* print buttons */}
            <button
              onClick={() => printBreakdownReports(reports, undefined)}
              className="flex items-center gap-1.5 border border-[#103c68] text-[#103c68] px-3 py-2 rounded-xl text-sm font-bold hover:bg-[#103c68]/5 transition-colors">
              <Printer size={14} />طباعة الكل
            </button>
            <button
              onClick={() => printBreakdownsPerVehicle(reports)}
              title="طباعة كل سيارة في صفحة منفردة"
              className="flex items-center gap-1.5 border border-orange-500 text-orange-600 px-3 py-2 rounded-xl text-sm font-bold hover:bg-orange-50 transition-colors">
              <Printer size={14} />كل سيارة منفردة
            </button>
            {bVehicleFilter && (
              <button
                onClick={() => printBreakdownReports(
                  reports.filter(r => r.vehicle_plate === bVehicleFilter),
                  bVehicleFilter
                )}
                className="flex items-center gap-1.5 bg-[#103c68] text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-[#0d3158] transition-colors">
                <Printer size={14} />طباعة سجل {bVehicleFilter}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><RefreshCw size={22} className="animate-spin text-[#103c68]" /></div>
          ) : displayedReports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <CheckCircle size={40} className="mx-auto mb-3 text-green-300" />
              <p className="font-semibold text-gray-500">لا توجد بلاغات أعطال</p>
            </div>
          ) : (
            displayedReports.map(r => (
              <div key={r.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${r.status === "open" ? "border-red-200" : "border-gray-100"}`}>
                <div className={`px-5 py-3 flex items-center justify-between gap-3 ${r.status === "open" ? "bg-red-50" : "bg-gray-50"}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Car size={14} className={r.status === "open" ? "text-red-600" : "text-gray-400"} />
                    <span className="font-bold text-gray-800">{r.vehicle_plate || "—"}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${TYPE_COLOR[r.breakdown_type] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                      {r.breakdown_type}
                    </span>
                    {r.status === "open"
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200"><Clock size={10} />مفتوح</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200"><CheckCircle size={10} />تم الحل</span>}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{fmt(r.created_at)}</span>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#103c68]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-[#103c68]">{(r.driver_name || "س")[0]}</span>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800 text-sm">{r.driver_name || r.driver_phone}</div>
                      <div className="text-xs text-gray-400">{r.driver_phone}</div>
                    </div>
                  </div>
                  {r.description && <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-700 border border-gray-100">{r.description}</div>}
                  {r.photo_url && (
                    <button onClick={() => setPhotoModal(r.photo_url!)} className="flex items-center gap-2 text-sm text-[#103c68] font-semibold hover:underline">
                      <ImageIcon size={14} />عرض صورة العطل
                    </button>
                  )}
                  {r.status === "resolved" && r.resolve_notes && (
                    <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm">
                      <span className="font-semibold text-green-800">الحل: </span>
                      <span className="text-green-700">{r.resolve_notes}</span>
                      {r.resolved_by && <span className="text-green-500 text-xs"> — {r.resolved_by}</span>}
                    </div>
                  )}
                  {r.status === "open" && (
                    <div className="flex gap-2">
                      <button onClick={() => { setResolving(r); setResolveNotes(""); }}
                        className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] hover:bg-[#0d3158] text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
                        <Wrench size={14} />تسجيل الحل
                      </button>
                      <button onClick={() => {
                        setJobFromReport(r);
                        setJobForm(f => ({ ...f, vehicle_plate: r.vehicle_plate || "", title: `إصلاح ${r.breakdown_type} - ${r.vehicle_plate || ""}` }));
                        setTab("jobs"); setNewJob(true);
                      }}
                        className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
                        <Plus size={14} />أمر عمل
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB: JOBS ───────────────────────────────────────────────────────── */}
      {tab === "jobs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl">
              {([
                { id: "open", label: "مفتوح" }, { id: "in_progress", label: "قيد العمل" },
                { id: "done", label: "مكتمل" }, { id: "all", label: "الكل" },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setJTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all
                    ${jTab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <button onClick={() => { setJobFromReport(null); setNewJob(true); }}
              className="flex items-center gap-1.5 bg-[#103c68] text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-[#0d3158] transition-colors">
              <Plus size={14} />أمر عمل جديد
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><RefreshCw size={22} className="animate-spin text-[#103c68]" /></div>
          ) : displayedJobs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Wrench size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="font-semibold text-gray-500">لا توجد أوامر عمل</p>
            </div>
          ) : (
            displayedJobs.map(j => (
              <div key={j.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Truck size={14} className="text-gray-500" />
                    <span className="font-bold text-gray-800">{j.vehicle_plate || "—"}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${JOB_STATUS_COLOR[j.status]}`}>
                      {JOB_STATUS_LABEL[j.status]}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${j.invoice_target === "vehicle" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-purple-50 text-purple-700 border-purple-200"}`}>
                      {j.invoice_target === "vehicle" ? "فاتورة على السيارة" : "مستودع الورشة"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{fmt(j.created_at)}</span>
                </div>
                <div className="p-5 space-y-3">
                  <div className="font-bold text-gray-900">{j.title}</div>
                  {j.description && <div className="text-sm text-gray-600">{j.description}</div>}
                  <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl p-3">
                    <div className="text-center">
                      <div className="text-xs text-gray-400">أجور</div>
                      <div className="font-bold text-sm">{sar(j.labor_cost)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-400">قطع غيار</div>
                      <div className="font-bold text-sm">{sar(j.parts_cost)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-400">الإجمالي</div>
                      <div className="font-black text-sm text-[#103c68]">{sar(j.total_cost)}</div>
                    </div>
                  </div>
                  {j.notes && <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">{j.notes}</div>}
                  {j.status !== "done" && (
                    <div className="flex gap-2">
                      {j.status === "open" && (
                        <button onClick={() => changeJobStatus(j, "in_progress")}
                          className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-bold text-sm transition-colors">
                          بدء العمل
                        </button>
                      )}
                      {j.status === "in_progress" && (
                        <button onClick={() => { setCompletingJob(j); setCompleteNotes(j.notes || ""); }}
                          className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm transition-colors">
                          <CheckCircle size={14} className="inline ml-1.5" />إغلاق وإصدار فاتورة
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB: INVENTORY ──────────────────────────────────────────────────── */}
      {tab === "inventory" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500 ml-auto">{inventory.length} صنف في المخزون</span>
            {selectedInvIds.size > 0 && (
              <>
                <button onClick={() => setSelectedInvIds(new Set())}
                  className="flex items-center gap-1.5 border border-gray-300 text-gray-500 px-3 py-2 rounded-xl font-bold text-sm hover:bg-gray-50">
                  إلغاء التحديد
                </button>
                <button onClick={bulkDeleteInventory} disabled={bulkInvDeleting}
                  className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-60">
                  <Trash2 size={14} />{bulkInvDeleting ? "جارٍ الحذف…" : `حذف المحدد (${selectedInvIds.size})`}
                </button>
              </>
            )}
            <button onClick={() => { setEditingItem(null); setInvForm({ item_name: "", item_code: "", category: "عام", quantity: "", unit: "قطعة", min_stock: "", cost_per_unit: "", supplier: "" }); setShowInvForm(true); }}
              className="flex items-center gap-1.5 bg-[#103c68] text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-[#0d3158] transition-colors">
              <Plus size={14} />إضافة صنف
            </button>
          </div>

          {lowStock > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-800 font-semibold">{lowStock} صنف وصل للحد الأدنى من المخزون</span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16"><RefreshCw size={22} className="animate-spin text-[#103c68]" /></div>
          ) : inventory.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Package size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="font-semibold text-gray-500">لا يوجد مخزون بعد</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox"
                        className="w-3.5 h-3.5 rounded accent-[#103c68] cursor-pointer"
                        checked={inventory.length > 0 && inventory.every(i => selectedInvIds.has(i.id))}
                        onChange={e => {
                          if (e.target.checked) setSelectedInvIds(new Set(inventory.map(i => i.id)));
                          else setSelectedInvIds(new Set());
                        }}
                      />
                    </th>
                    <th className="text-right px-4 py-3">الصنف</th>
                    <th className="text-center px-4 py-3">الكمية</th>
                    <th className="text-center px-4 py-3">الحد الأدنى</th>
                    <th className="text-center px-4 py-3">سعر الوحدة</th>
                    <th className="text-center px-4 py-3">الحالة</th>
                    <th className="text-right px-4 py-3">آخر تعديل</th>
                    <th className="text-center px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(item => (
                    <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${selectedInvIds.has(item.id) ? "bg-red-50/40" : ""}`}>
                      <td className="px-3 py-3">
                        <input type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-[#103c68] cursor-pointer"
                          checked={selectedInvIds.has(item.id)}
                          onChange={e => {
                            setSelectedInvIds(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(item.id) : next.delete(item.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-800">{item.item_name}</div>
                        <div className="text-xs text-gray-400">{item.category}{item.item_code ? ` · ${item.item_code}` : ""}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold">{item.quantity} {item.unit}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{item.min_stock} {item.unit}</td>
                      <td className="px-4 py-3 text-center">{sar(item.cost_per_unit)}</td>
                      <td className="px-4 py-3 text-center">
                        {item.quantity <= item.min_stock
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">منخفض</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">متاح</span>}
                      </td>
                      <td className="px-4 py-3">
                        {item.updated_by ? (
                          <div className="leading-tight">
                            <span className="text-xs font-semibold text-gray-700 block">{item.updated_by}</span>
                            <span className="text-[10px] text-gray-400">{new Date(item.last_updated).toLocaleDateString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => {
                          setEditingItem(item);
                          setInvForm({
                            item_name: item.item_name, item_code: item.item_code || "",
                            category: item.category, quantity: String(item.quantity),
                            unit: item.unit, min_stock: String(item.min_stock),
                            cost_per_unit: String(item.cost_per_unit), supplier: item.supplier || "",
                          });
                          setShowInvForm(true);
                        }} className="text-[#103c68] hover:underline text-xs font-semibold">تعديل</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: OIL-CHANGE REGISTER ────────────────────────────────────────── */}
      {tab === "oil_changes" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center flex-1 min-w-[180px] gap-1.5 border border-gray-200 rounded-xl px-3 bg-white">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input
                value={mlSearch}
                onChange={e => setMlSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadOilChanges({ search: mlSearch, vehicle: mlVehicle, branch: mlBranch, from: mlFrom, to: mlTo })}
                placeholder="بحث بالكارت / السائق / الوصف / اللوحة..."
                className="flex-1 py-2 text-sm bg-transparent outline-none"
              />
            </div>
            <input value={mlVehicle} onChange={e => setMlVehicle(e.target.value)} placeholder="رقم اللوحة"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-32 focus:outline-none" />
            <input list="oil-maintenance-branches" value={mlBranch} onChange={e => setMlBranch(e.target.value)} placeholder="الفرع"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-32 focus:outline-none" />
            <datalist id="oil-maintenance-branches">
              {wsBranches.map(branch => <option key={branch.id} value={branch.entity_name} />)}
            </datalist>
            <input type="date" value={mlFrom} onChange={e => setMlFrom(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            <span className="text-gray-400 text-xs">—</span>
            <input type="date" value={mlTo} onChange={e => setMlTo(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            <MonthShortcuts onSelect={(from, to) => { setMlFrom(from); setMlTo(to); }} />
            <select
              value={oilFilter}
              onChange={e => setOilFilter(e.target.value as "all" | "with" | "without")}
              aria-label="فلترة صرف الفلاتر"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none"
            >
              <option value="all">كل السجلات</option>
              <option value="with">مع فلاتر مصروفة</option>
              <option value="without">بدون فلاتر مصروفة</option>
            </select>
            <button
              onClick={() => loadOilChanges({ search: mlSearch, vehicle: mlVehicle, branch: mlBranch, from: mlFrom, to: mlTo })}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#103c68] text-white rounded-xl text-sm font-semibold hover:bg-[#0d3158]"
            >
              <Search size={13} />بحث
            </button>
            {(mlSearch || mlVehicle || mlBranch || mlFrom || mlTo || oilFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setMlSearch(""); setMlVehicle(""); setMlBranch(""); setMlFrom(""); setMlTo(""); setOilFilter("all");
                  loadOilChanges({}, "all");
                }}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100"
              >
                <X size={12} />مسح الفلاتر
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-2 text-sm">
              <span className="text-orange-700 font-semibold">سجلات تبديل الزيت: </span>
              <span className="font-black text-orange-900">{oilLogs.length}</span>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 text-sm">
              <span className="text-blue-700 font-semibold">مبلغ تبديل الزيت: </span>
              <span className="font-black text-blue-900">
                {sar(oilLogs.reduce((sum, log) => sum + (Number(log.oil_change_amount) || 0), 0))}
              </span>
            </div>
            <span className="text-xs text-gray-400">
              حالة الفلاتر مبنية على صرف المستودع المرتبط برقم كرت الصيانة
            </span>
          </div>

          {oilLoading ? (
            <div className="flex justify-center py-16"><RefreshCw size={22} className="animate-spin text-[#103c68]" /></div>
          ) : oilLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <ShoppingBag size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="font-semibold text-gray-500">لا توجد سجلات تبديل زيت مطابقة</p>
              <p className="text-xs text-gray-400 mt-1">تظهر هنا السجلات التي تحتوي على نوع صيانة تبديل أو تغيير الزيت</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full min-w-[1650px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-[#103c68] text-white text-xs">
                    <th className="text-right px-3 py-3">رقم الكرت</th>
                    <th className="text-right px-3 py-3">التاريخ</th>
                    <th className="text-right px-3 py-3">وقت الدخول</th>
                    <th className="text-right px-3 py-3">وقت الخروج</th>
                    <th className="text-right px-3 py-3">تاريخ الخروج</th>
                    <th className="text-right px-3 py-3">رقم اللوحة</th>
                    <th className="text-right px-3 py-3">الشغل على</th>
                    <th className="text-right px-3 py-3">الأصناف المُصرفة</th>
                    <th className="text-right px-3 py-3">اسم السائق</th>
                    <th className="text-right px-3 py-3">الفرع</th>
                    <th className="text-right px-3 py-3">نوع الصيانة</th>
                    <th className="text-right px-3 py-3 min-w-[260px]">بيان الصيانة</th>
                    <th className="text-right px-3 py-3">الفنيون</th>
                    <th className="text-right px-3 py-3">الكفرات</th>
                    <th className="text-center px-3 py-3">الفلاتر</th>
                    <th className="text-center px-3 py-3 font-bold">مبلغ تبديل الزيت</th>
                  </tr>
                </thead>
                <tbody>
                  {oilLogs.map(log => {
                    const tireText = log.tires
                      ? parseTires(log.tires).ids.map(id => TIRE_LABELS[id] || id).join("، ")
                      : "";
                    return (
                      <tr key={log.id} className="border-b border-gray-50 hover:bg-orange-50/40">
                        <td className="px-3 py-2.5 font-mono text-xs text-[#103c68] font-bold">{log.card_number || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{log.maintenance_date || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-600">{log.entry_time || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-600">{log.exit_time || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-600">{log.exit_date || "—"}</td>
                        <td className="px-3 py-2.5 font-semibold text-gray-800">{log.vehicle_plate || log.trailer_number || "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {log.vehicle_choice === "trailer" && log.trailer_number
                            ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">تيدر رقم {log.trailer_number}</span>
                            : <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">راس رقم {log.vehicle_plate || "—"}</span>}
                        </td>
                        <td className="px-3 py-2.5 align-top max-w-[260px]">
                          {log.parts && log.parts.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {log.parts.map((part, index) => (
                                <span key={`${part.item_id ?? part.item_name}-${index}`} className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-lg px-2 py-0.5 w-fit whitespace-nowrap">
                                  <span className="font-bold">{part.item_name}</span>
                                  <span className="text-indigo-400">×{part.quantity} {part.unit}</span>
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">{log.driver_name || "—"}</td>
                        <td className="px-3 py-2.5">{log.branch || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border bg-orange-50 text-orange-700 border-orange-200">
                            {log.maintenance_type || "تبديل زيت"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 max-w-[300px] truncate" title={log.description || ""}>{log.description || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-600 max-w-[180px] truncate" title={log.technicians || ""}>{log.technicians || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-600 max-w-[180px] truncate" title={tireText}>{tireText || "—"}</td>
                        <td className="px-3 py-2.5 text-center">
                          {log.filter_status === "with"
                            ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">مع فلاتر</span>
                            : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">بدون فلاتر</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center font-black text-orange-700 whitespace-nowrap">
                          {sar(Number(log.oil_change_amount) || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: MAINTENANCE LOG ────────────────────────────────────────────── */}
      {tab === "maintenance_log" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center flex-1 min-w-[180px] gap-1.5 border border-gray-200 rounded-xl px-3 bg-white">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input value={mlSearch} onChange={e => setMlSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadMaintenanceLogs({ search: mlSearch, vehicle: mlVehicle, branch: mlBranch, from: mlFrom, to: mlTo })}
                placeholder="بحث بالكارت / نوع العطل / السائق / الوصف..." className="flex-1 py-2 text-sm bg-transparent outline-none" />
            </div>
            <input value={mlVehicle} onChange={e => setMlVehicle(e.target.value)} placeholder="رقم اللوحة"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-32 focus:outline-none" />
            <input list="maintenance-branches" value={mlBranch} onChange={e => setMlBranch(e.target.value)} placeholder="الفرع"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-32 focus:outline-none" />
            <datalist id="maintenance-branches">
              {wsBranches.map(branch => <option key={branch.id} value={branch.entity_name} />)}
            </datalist>
            <input type="date" value={mlFrom} onChange={e => setMlFrom(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            <span className="text-gray-400 text-xs">—</span>
            <input type="date" value={mlTo} onChange={e => setMlTo(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            <MonthShortcuts onSelect={(f, t) => { setMlFrom(f); setMlTo(t); }} />
            <button onClick={() => loadMaintenanceLogs({ search: mlSearch, vehicle: mlVehicle, branch: mlBranch, from: mlFrom, to: mlTo })}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#103c68] text-white rounded-xl text-sm font-semibold hover:bg-[#0d3158]">
              <Search size={13} />بحث
            </button>
            {mlTypeFilter && (
              <button
                type="button"
                onClick={() => setMlTypeFilter("")}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100"
              >
                <X size={12} /> إلغاء نوع «{mlTypeFilter}»
              </button>
            )}
            {mlBranchCardFilter && (
              <button
                type="button"
                onClick={() => setMlBranchCardFilter("")}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100"
              >
                <X size={12} /> إلغاء فرع «{mlBranchCardFilter}»
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={() => {
              const now = new Date();
              const todayStr = now.toISOString().split("T")[0];
              const nowTime = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
              setEditingLog(null); setMlError("");
              // ── Auto-increment card number ──────────────────────────────────
              const numericCards = maintenanceLogs
                .map(l => parseInt(l.card_number || "", 10))
                .filter(n => !isNaN(n));
              const nextCard = numericCards.length > 0
                ? String(Math.max(...numericCards) + 1)
                : "";
              // ── Restore draft if available, else start fresh ───────────────
              try {
                const raw = localStorage.getItem("workshop_card_draft");
                if (raw) {
                  const d = JSON.parse(raw);
                  setMlForm(d.mlForm || { ...EMPTY_ML_FORM, maintenance_date: todayStr, entry_time: nowTime, card_number: nextCard });
                  setSelectedTechs(d.selectedTechs || []);
                  setSelectedTires(d.selectedTires || []);
                  setTireDetails(d.tireDetails || {});
                  setTypePrices(d.typePrices || {});
                } else {
                  setMlForm({ ...EMPTY_ML_FORM, maintenance_date: todayStr, entry_time: nowTime, card_number: nextCard });
                  setSelectedTechs([]); setSelectedTires([]); setTireDetails({}); setTypePrices({});
                }
              } catch {
                setMlForm({ ...EMPTY_ML_FORM, maintenance_date: todayStr, entry_time: nowTime, card_number: nextCard });
                setSelectedTechs([]); setSelectedTires([]); setTireDetails({}); setTypePrices({});
              }
              setTechInput("");
              setInvItems([]); setInvSearchQ(""); setInvDropOpen(false);
              setPlateSearch(""); setPlateDropOpen(false);
              setDriverSearch(""); setDriverDropOpen(false);
              setShowMlForm(true);
            }}
              className="flex items-center gap-1.5 bg-[#103c68] text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-[#0d3158]">
              <Plus size={14} />إضافة سجل
            </button>
            <button onClick={() => mlFileRef.current?.click()} disabled={mlImporting}
              className="flex items-center gap-1.5 border border-[#103c68] text-[#103c68] px-4 py-2 rounded-xl font-bold text-sm hover:bg-[#103c68]/5 disabled:opacity-60">
              {mlImporting ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
              استيراد من Excel
            </button>
            <input ref={mlFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importFromExcel} />
            <button onClick={exportToExcel}
              className="flex items-center gap-1.5 border border-green-600 text-green-700 px-4 py-2 rounded-xl font-bold text-sm hover:bg-green-50">
              <Download size={14} />تصدير Excel
            </button>
            <button onClick={exportCompanyMaintenanceRegister}
              className="flex items-center gap-1.5 border border-orange-500 text-orange-700 bg-orange-50 px-4 py-2 rounded-xl font-bold text-sm hover:bg-orange-100">
              <Download size={14} />تصدير سجل للشركة
            </button>
            <button onClick={() => printMaintenanceLogs(maintenanceLogs, mlVehicle || undefined)}
              className="flex items-center gap-1.5 border border-[#103c68] text-[#103c68] px-4 py-2 rounded-xl font-bold text-sm hover:bg-[#103c68]/5">
              <Printer size={14} />{mlVehicle ? `طباعة سجل ${mlVehicle}` : "طباعة السجل"}
            </button>
            <button onClick={() => printMaintenanceLogsPerVehicle(maintenanceLogs)}
              title="طباعة كل سيارة في صفحة منفردة"
              className="flex items-center gap-1.5 border border-orange-500 text-orange-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-orange-50">
              <Printer size={14} />كل سيارة منفردة
            </button>
            {selectedCardIds.size > 0 && (
              <button
                onClick={() => printSelectedCards(maintenanceLogs)}
                className="flex items-center gap-1.5 bg-[#103c68] text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-[#0d3158] shadow-md ring-2 ring-[#103c68]/30">
                <Printer size={14} />طباعة المحددة ({selectedCardIds.size})
              </button>
            )}
            {selectedCardIds.size > 0 && (
              <button
                onClick={() => setSelectedCardIds(new Set())}
                className="flex items-center gap-1.5 border border-gray-300 text-gray-500 px-3 py-2 rounded-xl font-bold text-sm hover:bg-gray-50">
                إلغاء التحديد
              </button>
            )}
            {maintenanceLogs.length > 0 && (
              <button onClick={clearAllMaintenanceLogs}
                className="flex items-center gap-1.5 border border-red-300 text-red-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-50">
                <Trash2 size={14} />مسح الكل
              </button>
            )}
            <span className="text-xs text-gray-400 mr-auto">
              {displayedMaintenanceLogs.length}{mlTypeFilter ? ` من ${maintenanceLogs.length}` : ""} سجل
            </span>
          </div>

          {/* ── إجماليات حسب نوع الصيانة + الراس/التيدر ── */}
            {!mlLoading && maintenanceLogs.length > 0 && (() => {
            const typeAgg: Record<string, number> = {};
            maintenanceLogs.forEach(r => {
              const bd = parseBd(r);
              Object.entries(bd).forEach(([k, v]) => { if (v > 0) typeAgg[k] = (typeAgg[k] || 0) + v; });
            });
            const branchAgg: Record<string, { amount: number; count: number }> = {};
            maintenanceLogs.forEach(r => {
              const branch = r.branch?.trim() || "بدون فرع";
              if (!branchAgg[branch]) branchAgg[branch] = { amount: 0, count: 0 };
              branchAgg[branch].amount += Number(r.amount) || 0;
              branchAgg[branch].count += 1;
            });
            const branchEntries = Object.entries(branchAgg).sort(([, a], [, b]) => b.amount - a.amount);
            const grandTotal = maintenanceLogs.reduce((s, r) => s + (r.amount || 0), 0);
            const entries = Object.entries(typeAgg).sort(([, a], [, b]) => b - a);
            const headTotal = mlVehicle
              ? maintenanceLogs.filter(r => !r.trailer_number || r.trailer_number.trim() === "").reduce((s, r) => s + (r.amount || 0), 0)
              : null;
            const trailerTotal = mlVehicle
              ? maintenanceLogs.filter(r => !!r.trailer_number && r.trailer_number.trim() !== "").reduce((s, r) => s + (r.amount || 0), 0)
              : null;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {branchEntries.map(([branch, summary]) => (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => setMlBranchCardFilter(current => current === branch ? "" : branch)}
                      title={`عرض سجلات فرع ${branch}`}
                      className={`text-right bg-white border rounded-2xl px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                        mlBranchCardFilter === branch
                          ? "border-[#103c68] ring-2 ring-[#103c68]/20 bg-blue-50/40"
                          : "border-blue-100 hover:border-blue-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-gray-500 truncate" title={branch}>{branch}</span>
                        <span className="text-[10px] text-gray-400">{summary.count} سجل</span>
                      </div>
                      <div className="mt-1 text-lg font-black text-[#103c68]">{sar(summary.amount)}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">إجمالي أعطال الفرع</div>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 items-center bg-white border border-gray-100 rounded-2xl px-4 py-2.5 shadow-sm">
                  <span className="text-[11px] font-bold text-[#103c68] ml-1 whitespace-nowrap">📊 إجماليات:</span>
                  {entries.map(([type, amt]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setMlTypeFilter(current => current === type ? "" : type)}
                        title={`عرض أعطال نوع: ${type}`}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 border transition-colors ${
                          mlTypeFilter === type
                            ? "bg-[#103c68] text-white border-[#103c68] ring-2 ring-[#103c68]/20"
                            : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200"
                        }`}
                      >
                      <span className="text-[10px] text-gray-500 font-medium">{type}</span>
                        <span className={`text-xs font-black ${mlTypeFilter === type ? "text-white" : "text-[#103c68]"}`}>{sar(amt)}</span>
                      </button>
                  ))}
                  <div className="flex items-center gap-1 bg-[#103c68] text-white rounded-lg px-2.5 py-1">
                    <span className="text-[10px] opacity-75">الإجمالي</span>
                    <span className="text-xs font-black">{sar(grandTotal)}</span>
                  </div>
                  {mlVehicle && headTotal !== null && trailerTotal !== null && (
                    <div className="flex items-center gap-1.5 mr-2 border-r border-gray-200 pr-2.5">
                      <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
                        <span className="text-[10px] text-blue-600 font-medium">🚛 الراس</span>
                        <span className="text-xs font-black text-blue-700">{sar(headTotal)}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                        <span className="text-[10px] text-amber-600 font-medium">🔗 التيدر</span>
                        <span className="text-xs font-black text-amber-700">{sar(trailerTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {mlLoading ? (
            <div className="flex justify-center py-16"><RefreshCw size={22} className="animate-spin text-[#103c68]" /></div>
            ) : displayedMaintenanceLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <FileText size={40} className="mx-auto mb-3 text-gray-200" />
                <p className="font-semibold text-gray-500">
                  {mlTypeFilter ? `لا توجد أعطال من نوع «${mlTypeFilter}»` : "لا توجد سجلات أعطال"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {mlTypeFilter ? "اضغط على إلغاء التصفية لعرض كل السجلات" : "أضف سجلاً يدوياً أو استورد من ملف Excel"}
                </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox"
                        className="w-3.5 h-3.5 rounded accent-[#103c68] cursor-pointer"
                        checked={displayedMaintenanceLogs.length > 0 && displayedMaintenanceLogs.every(l => selectedCardIds.has(l.id))}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedCardIds(prev => new Set([...prev, ...displayedMaintenanceLogs.map(l => l.id)]));
                          } else {
                            setSelectedCardIds(prev => {
                              const next = new Set(prev);
                              displayedMaintenanceLogs.forEach(l => next.delete(l.id));
                              return next;
                            });
                          }
                        }}
                        title="تحديد الكل / إلغاء الكل"
                      />
                    </th>
                    <th className="text-right px-3 py-3">رقم الكارت</th>
                    <th className="text-right px-3 py-3">التاريخ</th>
                    <th className="text-right px-3 py-3">وقت الدخول</th>
                    <th className="text-right px-3 py-3">وقت الخروج</th>
                    <th className="text-right px-3 py-3">تاريخ الخروج</th>
                    <th className="text-right px-3 py-3">رقم اللوحة</th>
                     <th className="text-center px-3 py-3">الشغل على</th>
                    <th className="text-right px-3 py-3 min-w-[160px]">الأصناف المُصرفة</th>
                    <th className="text-right px-3 py-3">اسم السائق</th>
                    <th className="text-right px-3 py-3">الفرع</th>
                    <th className="text-right px-3 py-3">نوع الصيانة</th>
                    <th className="text-right px-3 py-3">بيان الصيانة</th>
                    <th className="text-right px-3 py-3 min-w-[200px]">تفاصيل المبالغ (لكل نوع)</th>
                    <th className="text-center px-3 py-3 font-bold text-[#103c68]">الإجمالي</th>
                    <th className="w-8 px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedMaintenanceLogs.map(r => (
                    <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${selectedCardIds.has(r.id) ? "bg-blue-50/60" : ""}`}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-[#103c68] cursor-pointer"
                          checked={selectedCardIds.has(r.id)}
                          onChange={e => {
                            setSelectedCardIds(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(r.id) : next.delete(r.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[#103c68] font-bold">{r.card_number || "—"}</td>
                      <td className="px-3 py-2.5 text-gray-700">{r.maintenance_date || "—"}</td>
                      <td className="px-3 py-2.5 text-gray-600">{r.entry_time || "—"}</td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {r.exit_time ? r.exit_time : (
                          <button
                            onClick={() => {
                              const now = new Date();
                              setExitingLog(r);
                              setExitForm({
                                exit_date: now.toISOString().split("T")[0],
                                exit_time: now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }),
                              });
                            }}
                            className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-lg transition-colors whitespace-nowrap">
                            + تسجيل الخروج
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{r.exit_date || "—"}</td>
                      <td className="px-3 py-2.5 font-semibold text-gray-800">
                        {r.vehicle_plate || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {r.vehicle_choice === "trailer" && r.trailer_number
                          ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">🔗 تيدر رقم {r.trailer_number}</span>
                          : <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">🚛 راس رقم {r.vehicle_plate || "—"}</span>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {r.parts && r.parts.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {r.parts.map((p, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-lg px-2 py-0.5 w-fit whitespace-nowrap">
                                <span className="font-bold">{p.item_name}</span>
                                <span className="text-indigo-400">×{p.quantity} {p.unit}</span>
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5">{r.driver_name || "—"}</td>
                      <td className="px-3 py-2.5">{r.branch || "—"}</td>
                      <td className="px-3 py-2.5">
                        {r.maintenance_type
                          ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${TYPE_COLOR[r.maintenance_type] || "bg-gray-50 text-gray-600 border-gray-200"}`}>{r.maintenance_type}</span>
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 max-w-[180px] truncate" title={r.description || ""}>{r.description || "—"}</td>
                      {/* تفاصيل كل نوع صيانة مع مبلغه */}
                      <td className="px-3 py-2.5">
                        {(() => {
                          const bd = parseBd(r);
                          const entries = Object.entries(bd).filter(([, v]) => v > 0);
                          if (entries.length === 0) return <span className="text-gray-400 text-xs">—</span>;
                          return (
                            <div className="flex flex-wrap gap-1">
                              {entries.map(([type, amt]) => (
                                <span key={type}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-700 whitespace-nowrap">
                                  <span className="text-[10px] text-gray-400">{type}:</span>
                                  <span className="text-[#103c68] font-bold">{sar(amt)}</span>
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-center font-bold text-[#103c68]">{r.amount > 0 ? sar(r.amount) : "—"}</td>
                      <td className="px-2 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => {
                            setEditingLog(r);
                            setMlError("");
                            setMlForm({
                              card_number: r.card_number || "",
                              maintenance_date: r.maintenance_date || "",
                              entry_time: r.entry_time || "",
                              exit_time: r.exit_time || "",
                              exit_date: r.exit_date || "",
                              vehicle_plate: r.vehicle_plate || "",
                              driver_name: r.driver_name || "",
                              branch: r.branch || "",
                              maintenance_type: r.maintenance_type || "",
                              description: r.description || "",
                              amount: String(r.amount || ""),
                              amount_mechanical: String(r.amount_mechanical || ""),
                              amount_electrical: String(r.amount_electrical || ""),
                              vehicle_choice: (r.vehicle_choice === "trailer" ? "trailer" : "vehicle") as "vehicle" | "trailer",
                              trailer_number: r.trailer_number || "",
                              trailer_type: r.trailer_type || "",
                            });
                            setSelectedTechs(r.technicians ? r.technicians.split(/[,،]/).map((s: string) => s.trim()).filter(Boolean) : []);
                            if (r.tires) {
                              const parsed = parseTires(r.tires);
                              setSelectedTires(parsed.ids);
                              setTireDetails(parsed.details);
                            } else {
                              setSelectedTires([]); setTireDetails({});
                            }
                            setTechInput("");
                            // ── Populate typePrices from existing amounts ──
                            {
                              if (r.amount_breakdown) {
                                try {
                                  const bd = JSON.parse(r.amount_breakdown) as Record<string, number>;
                                  setTypePrices(Object.fromEntries(Object.entries(bd).map(([k, v]) => [k, String(v)])));
                                } catch {
                                  setTypePrices({});
                                }
                              } else {
                                const types = (r.maintenance_type || "").split(/[,،]/).map((s: string) => s.trim()).filter(Boolean);
                                const prices: Record<string, string> = {};
                                const mech = r.amount_mechanical || 0;
                                const elec = r.amount_electrical || 0;
                                if (types.includes("ميكانيكة") && mech > 0) prices["ميكانيكة"] = String(mech);
                                if (types.includes("كهرباء")   && elec > 0) prices["كهرباء"]   = String(elec);
                                const otherTypes = types.filter(t => t !== "ميكانيكة" && t !== "كهرباء");
                                const remaining  = (r.amount || 0) - mech - elec;
                                if (otherTypes.length === 1 && remaining > 0) prices[otherTypes[0]] = String(remaining);
                                setTypePrices(prices);
                              }
                            }
                            setShowMlForm(true);
                            // Populate invItems from existing parts (match by item_id in current inventory)
                            if (r.parts && r.parts.length > 0) {
                              const preloaded = r.parts.flatMap((p: MaintenanceLogPart) => {
                                if (!p.item_id) return [];
                                const found = inventory.find(i => i.id === p.item_id);
                                const item: InventoryItem = found ?? {
                                  id: p.item_id, item_name: p.item_name, item_code: null, category: "عام",
                                  quantity: 0, unit: p.unit, min_stock: 0, cost_per_unit: p.cost_per_unit,
                                  supplier: null, last_updated: "",
                                };
                                return [{ item, qty: String(p.quantity) }];
                              });
                              setInvItems(preloaded);
                            } else {
                              setInvItems([]);
                            }
                            setInvSearchQ(""); setInvDropOpen(false);
                          }} className="text-blue-400 hover:text-blue-600 p-1 rounded-lg hover:bg-blue-50 transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteMaintenanceLog(r.id)} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 size={13} />
                          </button>
                          <button onClick={() => printSingleCard(r)} title="طباعة هذا الكارت" className="text-[#103c68] hover:text-[#0d3158] p-1 rounded-lg hover:bg-[#103c68]/10 transition-colors">
                            <Printer size={13} />
                          </button>
                          <button
                            title={r.is_printed ? "مطبوع — اضغط لإلغاء" : "غير مطبوع — اضغط للتأكيد"}
                            onClick={async () => {
                              const res = await fetch(`/api/maintenance-logs/${r.id}/printed`, { method: "PATCH" });
                              const data = await res.json() as { is_printed: number };
                              setMaintenanceLogs(prev => prev.map(row => row.id === r.id ? { ...row, is_printed: data.is_printed } : row));
                            }}
                            className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-colors ${r.is_printed ? "text-green-600 bg-green-50 hover:bg-green-100" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"}`}>
                            {r.is_printed ? "✓ مطبوع" : "○"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

            </div>
          )}
        </div>
      )}

      {/* ── Modal: Add Maintenance Log ───────────────────────────────────────── */}
      {showMlForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="font-black text-gray-900 flex items-center gap-2">
                {editingLog ? <Pencil size={18} className="text-blue-600" /> : <FileText size={18} className="text-[#103c68]" />}
                {editingLog ? `تعديل سجل — كارت ${editingLog.card_number || editingLog.id}` : "إضافة سجل عطل"}
              </h2>
              <button onClick={() => { if (!editingLog) localStorage.removeItem("workshop_card_draft"); setShowMlForm(false); setEditingLog(null); setMlError(""); setSelectedTechs([]); setTechInput(""); setPlateSearch(""); setPlateDropOpen(false); setDriverSearch(""); setDriverDropOpen(false); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">رقم كارت الصيانة</label>
                  {(() => {
                    const trimmed = mlForm.card_number.trim();
                    const isDup = trimmed !== "" && maintenanceLogs.some(
                      l => l.card_number?.trim() === trimmed && l.id !== editingLog?.id
                    );
                    return (
                      <>
                        <input
                          value={mlForm.card_number}
                          onChange={e => setMlForm(f => ({ ...f, card_number: e.target.value }))}
                          placeholder="1001"
                          className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${isDup ? "border-amber-400 focus:ring-amber-300 bg-amber-50" : "border-gray-200 focus:ring-[#103c68]/20"}`}
                        />
                        {isDup && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5 text-xs font-semibold">
                            <AlertTriangle size={13} className="flex-shrink-0" />
                            تنبيه: رقم الكارت {trimmed} مستخدم في سجل آخر
                          </div>
                        )}
                        {!editingLog && !isDup && (() => {
                          const nums = maintenanceLogs.map(l => parseInt(l.card_number || "", 10)).filter(n => !isNaN(n));
                          const last = nums.length > 0 ? Math.max(...nums) : null;
                          return last !== null ? (
                            <p className="text-xs text-gray-400 mt-1">آخر كارت مُستخدم: <span className="font-bold text-gray-600">{last}</span></p>
                          ) : null;
                        })()}
                      </>
                    );
                  })()}
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">التاريخ</label>
                  <input type="date" value={mlForm.maintenance_date} onChange={e => setMlForm(f => ({ ...f, maintenance_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">وقت الدخول</label>
                  <input type="time" value={mlForm.entry_time} onChange={e => setMlForm(f => ({ ...f, entry_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">وقت الخروج</label>
                  <input type="time" value={mlForm.exit_time} onChange={e => setMlForm(f => ({ ...f, exit_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">تاريخ الخروج</label>
                  <input type="date" value={mlForm.exit_date} onChange={e => setMlForm(f => ({ ...f, exit_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
              </div>
              {/* ══ السيارة + التيدر — حقلين دايماً ظاهرين ══ */}
              {(() => {
                const plateSuggestions = plateSearch.length >= 1
                  ? fleetVehicles.filter(v => v.plate_number.includes(plateSearch)).slice(0, 8)
                  : fleetVehicles.slice(0, 8);
                const selectedPlateOpenBreakdown = mlForm.vehicle_plate
                  ? reports.find(r => r.vehicle_plate === mlForm.vehicle_plate && r.status === "open")
                  : null;
                const isExternal = mlForm.vehicle_plate.trim() !== "" &&
                  !fleetVehicles.some(v => v.plate_number === mlForm.vehicle_plate.trim());
                const sv = fleetVehicles.find(v => v.plate_number === mlForm.vehicle_plate.trim()) ?? null;
                const hasBoth = !!(mlForm.vehicle_plate.trim() && mlForm.trailer_number.trim());

                return (
                  <div className="space-y-3">

                    {/* ── صف السيارة ── */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* رقم اللوحة */}
                      <div className="relative">
                        <label className="text-sm font-bold text-gray-700 block mb-1">
                          🚛 رقم اللوحة
                          {isExternal && (
                            <span className="mr-2 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">خارجية</span>
                          )}
                        </label>
                        <input
                          value={plateSearch || mlForm.vehicle_plate}
                          onChange={e => {
                            const value = e.target.value;
                            const fleetVehicle = fleetVehicles.find(v => v.plate_number.trim() === value.trim());
                            setPlateSearch(value);
                            setMlForm(f => ({
                              ...f,
                              vehicle_plate: value,
                              branch: fleetVehicle?.branch?.trim() || "",
                              driver_name: "",
                              trailer_number: "",
                              trailer_type: "",
                            }));
                            setPlateDropOpen(true);
                          }}
                          onFocus={() => setPlateDropOpen(true)}
                          onBlur={() => setTimeout(() => setPlateDropOpen(false), 180)}
                          placeholder="ابحث برقم اللوحة…"
                          className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 ${isExternal ? "border-orange-300 bg-orange-50" : "border-gray-200"}`}
                        />
                        {plateDropOpen && plateSuggestions.length > 0 && (
                          <div className="absolute z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-full mt-1 max-h-48 overflow-y-auto">
                            {plateSuggestions.map(v => (
                              <button key={v.id} type="button"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  const def = v.linked_trailer_default || "vehicle";
                                  const hasT = !!v.linked_trailer_number;
                                  setMlForm(f => ({
                                    ...f,
                                    vehicle_plate:  v.plate_number,
                                    branch:         v.branch?.trim() || "",
                                    driver_name:    v.driver_name || f.driver_name,
                                    // auto-fill linked trailer
                                    trailer_number: hasT ? (v.linked_trailer_number || "") : f.trailer_number,
                                    trailer_type:   hasT ? (v.linked_trailer_type   || "") : f.trailer_type,
                                    // set work target based on preference
                                    vehicle_choice: hasT && def === "trailer" ? "trailer" : "vehicle",
                                  }));
                                  if (v.driver_name) setDriverSearch("");
                                  setPlateSearch(""); setPlateDropOpen(false);
                                }}
                                className="w-full text-right px-3 py-2 text-sm hover:bg-[#103c68]/5 flex justify-between items-center gap-2">
                                <span className="font-bold text-[#103c68]">{v.plate_number}</span>
                                <span className="text-gray-400 text-xs flex items-center gap-1">
                                  {v.vehicle_type}{v.driver_name ? ` · ${v.driver_name}` : ""}
                                  {v.linked_trailer_number && (
                                    <span className="text-indigo-500 bg-indigo-50 border border-indigo-100 rounded px-1 text-[10px]">🔗 {v.linked_trailer_number}</span>
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {selectedPlateOpenBreakdown && (
                          <div className="mt-1.5 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs text-amber-700 font-semibold">
                            <span>⚠️</span>
                            <span>بلاغ عطل مفتوح — {selectedPlateOpenBreakdown.created_at?.slice(0,10) || ""}</span>
                          </div>
                        )}
                      </div>

                      {/* اسم السائق */}
                      <div className="relative">
                        <label className="text-sm font-bold text-gray-700 block mb-1">اسم السائق</label>
                        <input
                          value={driverSearch || mlForm.driver_name}
                          onChange={e => { setDriverSearch(e.target.value); setMlForm(f => ({ ...f, driver_name: e.target.value })); setDriverDropOpen(true); }}
                          onFocus={() => setDriverDropOpen(true)}
                          onBlur={() => setTimeout(() => setDriverDropOpen(false), 180)}
                          placeholder="ابحث باسم السائق…"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
                        />
                        {driverDropOpen && (() => {
                          const q = driverSearch.trim();
                          const ds = q
                            ? drivers.filter(d => d.name.includes(q) || (d.phone || "").includes(q)).slice(0, 8)
                            : drivers.slice(0, 8);
                          return ds.length > 0 ? (
                            <div className="absolute z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-full mt-1 max-h-48 overflow-y-auto">
                              {ds.map(d => (
                                <button key={d.id} type="button"
                                  onMouseDown={e => { e.preventDefault(); setMlForm(f => ({ ...f, driver_name: d.name })); setDriverSearch(""); setDriverDropOpen(false); }}
                                  className="w-full text-right px-3 py-2 text-sm hover:bg-[#103c68]/5 flex justify-between items-center">
                                  <span className="font-semibold">{d.name}</span>
                                  <span className="text-gray-400 text-xs">{d.phone}{d.vehicle_plate ? ` · ${d.vehicle_plate}` : ""}</span>
                                </button>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>

                    {/* datalist for teidarat */}
                    <datalist id="ws-teidar-list">
                      {teidarList.map(t => (
                        <option key={t.id} value={t.teidara_number ?? ""}>
                          {t.vehicle_plate ? `(مرتبط بـ ${t.vehicle_plate})` : "(غير مرتبط)"}
                        </option>
                      ))}
                    </datalist>

                    {/* ── صف التيدر ── */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-bold text-gray-700 block mb-1">🔗 رقم التيدر</label>
                        <input
                          list="ws-teidar-list"
                          value={mlForm.trailer_number}
                          onChange={e => {
                            const val = e.target.value;
                            const matched = teidarList.find(t => t.teidara_number === val);
                            setMlForm(f => ({
                              ...f,
                              trailer_number: val,
                              trailer_type: matched?.teidara_type ?? f.trailer_type,
                            }));
                          }}
                          placeholder="اختر أو اكتب رقم التيدر"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-bold text-gray-700 block mb-1">نوع التيدر</label>
                        <select
                          value={mlForm.trailer_type}
                          onChange={e => { setMlForm(f => ({ ...f, trailer_type: e.target.value })); setSelectedTires([]); setTireDetails({}); }}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 bg-white"
                        >
                          <option value="">-- اختر النوع --</option>
                          <option value="مقطورة مسطحة">مقطورة مسطحة (6 كفرات)</option>
                          <option value="بلكر (سائب)">بلكر (6 كفرات)</option>
                          <option value="قلاب">قلاب (12 كفرة)</option>
                          <option value="مقطورة صهريج">مقطورة صهريج</option>
                          <option value="مقطورة مغلقة">مقطورة مغلقة</option>
                          <option value="تيدر شاحنة">تيدر شاحنة</option>
                          <option value="أخرى">أخرى</option>
                        </select>
                      </div>
                    </div>

                    {/* ── العمل على + ربط + مفضل ── */}
                    {(mlForm.vehicle_plate.trim() || mlForm.trailer_number.trim()) && (
                      <div className="bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 space-y-2">
                        {/* work-target radio */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-600">العمل على:</span>
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input type="radio" name="work_target"
                              checked={mlForm.vehicle_choice === "vehicle"}
                              onChange={() => { setMlForm(f => ({ ...f, vehicle_choice: "vehicle" })); setSelectedTires([]); setTireDetails({}); }}
                              className="accent-[#103c68] w-4 h-4" />
                            <span className="text-sm font-medium">🚛 السيارة
                              {mlForm.vehicle_plate && <span className="mr-1 text-[#103c68] font-bold text-xs">{mlForm.vehicle_plate}</span>}
                            </span>
                            {sv && (sv.linked_trailer_default || "vehicle") === "vehicle" && mlForm.trailer_number && (
                              <span className="text-[10px] text-[#103c68] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">مفضل</span>
                            )}
                          </label>
                          {mlForm.trailer_number.trim() && (
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input type="radio" name="work_target"
                                checked={mlForm.vehicle_choice === "trailer"}
                                onChange={() => { setMlForm(f => ({ ...f, vehicle_choice: "trailer" })); setSelectedTires([]); setTireDetails({}); }}
                                className="accent-[#103c68] w-4 h-4" />
                              <span className="text-sm font-medium">🔗 التيدر
                                <span className="mr-1 text-indigo-700 font-bold text-xs">{mlForm.trailer_number}</span>
                              </span>
                              {sv && (sv.linked_trailer_default || "vehicle") === "trailer" && (
                                <span className="text-[10px] text-[#103c68] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">مفضل</span>
                              )}
                            </label>
                          )}
                        </div>

                      </div>
                    )}

                  </div>
                );
              })()}

              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">
                  الفرع <span className="text-red-500">*</span>
                </label>
                <input
                  value={mlForm.branch}
                  onChange={e => setMlForm(f => ({ ...f, branch: e.target.value }))}
                  disabled={fleetVehicles.some(v => v.plate_number.trim() === mlForm.vehicle_plate.trim())}
                  list="workshop-company-branches"
                  placeholder={fleetVehicles.some(v => v.plate_number.trim() === mlForm.vehicle_plate.trim())
                    ? "يُحدد تلقائيًا من بيانات السيارة"
                    : "اكتب فرع السيارة الخارجية"}
                  required
                  aria-required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                </input>
                <datalist id="workshop-company-branches">
                  {wsBranches.map(b => <option key={b.id} value={b.entity_name} />)}
                </datalist>
                {fleetVehicles.some(v => v.plate_number.trim() === mlForm.vehicle_plate.trim()) && (
                  <p className="text-[11px] text-gray-400 mt-1">تم تحديد الفرع تلقائيًا من إدارة الأسطول ولا يمكن تغييره هنا.</p>
                )}
              </div>

              {/* ── الفنيون: multi-select chips ──────────────────────────────── */}
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-2">الفنيون</label>
                <div className="border border-gray-200 rounded-xl p-3 space-y-2.5 bg-gray-50/50">
                  <div className="flex flex-wrap gap-2">
                    {[...WORKSHOP_TECHNICIANS, ...extraTechnicians].map(t => {
                      const sel = selectedTechs.includes(t);
                      const isExtra = !WORKSHOP_TECHNICIANS.includes(t);
                      return (
                        <button key={t} type="button"
                          onClick={() => setSelectedTechs(prev => sel ? prev.filter(x => x !== t) : [...prev, t])}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all select-none ${
                            sel ? "bg-[#103c68] text-white border-[#103c68] shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-[#103c68]/40 hover:text-[#103c68]"
                          }`}>
                          {sel && <span className="text-[10px]">✓</span>}
                          {t}
                          {isExtra && !sel && (
                            <span
                              title="حذف من القائمة"
                              className="text-[10px] opacity-50 hover:opacity-100 hover:text-red-500"
                              onClick={e => {
                                e.stopPropagation();
                                setExtraTechnicians(prev => {
                                  const next = prev.filter(x => x !== t);
                                  try { localStorage.setItem("workshop_technicians_extra", JSON.stringify(next)); } catch {}
                                  return next;
                                });
                                setSelectedTechs(prev => prev.filter(x => x !== t));
                              }}
                            >✕</span>
                          )}
                        </button>
                      );
                    })}
                    {/* one-off techs typed in this session but not saved to extras */}
                    {selectedTechs.filter(t => !WORKSHOP_TECHNICIANS.includes(t) && !extraTechnicians.includes(t)).map(t => (
                      <button key={t} type="button"
                        onClick={() => setSelectedTechs(prev => prev.filter(x => x !== t))}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border bg-[#103c68] text-white border-[#103c68] shadow-sm select-none">
                        <span className="text-[10px]">✓</span>
                        {t}
                        <span className="text-[10px] opacity-70">✕</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5 pt-1 border-t border-gray-200">
                    <input
                      value={techInput}
                      onChange={e => setTechInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          const t = techInput.trim();
                          if (!t || selectedTechs.includes(t)) return;
                          setSelectedTechs(prev => [...prev, t]);
                          if (!WORKSHOP_TECHNICIANS.includes(t)) {
                            setExtraTechnicians(prev => {
                              const next = prev.includes(t) ? prev : [...prev, t];
                              try { localStorage.setItem("workshop_technicians_extra", JSON.stringify(next)); } catch {}
                              return next;
                            });
                          }
                          setTechInput("");
                        }
                      }}
                      placeholder="اسم فني آخر..."
                      className="flex-1 border border-dashed border-gray-300 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#103c68]/50 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const t = techInput.trim();
                        if (!t || selectedTechs.includes(t)) return;
                        setSelectedTechs(prev => [...prev, t]);
                        if (!WORKSHOP_TECHNICIANS.includes(t)) {
                          setExtraTechnicians(prev => {
                            const next = prev.includes(t) ? prev : [...prev, t];
                            try { localStorage.setItem("workshop_technicians_extra", JSON.stringify(next)); } catch {}
                            return next;
                          });
                        }
                        setTechInput("");
                      }}
                      disabled={!techInput.trim() || selectedTechs.includes(techInput.trim())}
                      className="px-3 py-1.5 bg-[#103c68] text-white rounded-xl text-xs font-bold hover:bg-[#0d3158] disabled:opacity-40">
                      + إضافة
                    </button>
                  </div>
                  {selectedTechs.length > 0 && (
                    <p className="text-xs text-[#103c68] font-semibold pt-0.5">
                      المحدد: {selectedTechs.join(" · ")}
                    </p>
                  )}
                </div>
              </div>

              {/* ── نوع الصيانة: multi-select + إضافة/تعديل ── */}
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-2">نوع الصيانة</label>
                <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/50">
                  {/* Checkboxes */}
                  <div className="flex flex-wrap gap-2">
                    {maintenanceTypes.map((t, idx) => {
                      const isSelected = selectedMaintTypes.includes(t);
                      const isEditing  = editingTypeIdx === idx;
                      return (
                        <div key={idx} className="flex items-center">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                value={editingTypeName}
                                onChange={e => setEditingTypeName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") {
                                    const trimmed = editingTypeName.trim();
                                    if (!trimmed) return;
                                    const updated = [...maintenanceTypes];
                                    const oldName = updated[idx];
                                    updated[idx] = trimmed;
                                    saveTypes(updated);
                                    // update selected if was selected
                                    if (selectedMaintTypes.includes(oldName)) {
                                      const next = selectedMaintTypes.map(s => s === oldName ? trimmed : s);
                                      setMlForm(f => ({ ...f, maintenance_type: next.join("، ") }));
                                    }
                                    setEditingTypeIdx(null);
                                  } else if (e.key === "Escape") {
                                    setEditingTypeIdx(null);
                                  }
                                }}
                                onBlur={() => setEditingTypeIdx(null)}
                                className="border border-blue-300 rounded-lg px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                              <button
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  const trimmed = editingTypeName.trim();
                                  if (!trimmed) return;
                                  const updated = [...maintenanceTypes];
                                  const oldName = updated[idx];
                                  updated[idx] = trimmed;
                                  saveTypes(updated);
                                  if (selectedMaintTypes.includes(oldName)) {
                                    const next = selectedMaintTypes.map(s => s === oldName ? trimmed : s);
                                    setMlForm(f => ({ ...f, maintenance_type: next.join("، ") }));
                                  }
                                  setEditingTypeIdx(null);
                                }}
                                className="text-blue-600 hover:text-blue-800 text-xs px-1">✓</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleChipClick(t, idx)}
                              title="١ضغطة اختيار · ٢ إلغاء · ٣ تعديل"
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all select-none ${
                                isSelected
                                  ? "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                                  : chipClicks[idx] === 2
                                    ? "bg-red-50 text-red-500 border-red-200"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-[#103c68]/40 hover:text-[#103c68]"
                              }`}>
                              {isSelected && <span className="text-[10px]">✓</span>}
                              {chipClicks[idx] === 2 && !isSelected && <span className="text-[10px]">✕</span>}
                              {t}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add new type */}
                  <div className="flex gap-1.5 pt-1 border-t border-gray-200">
                    <input
                      value={newTypeInput}
                      onChange={e => setNewTypeInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          const t = newTypeInput.trim();
                          if (!t || maintenanceTypes.includes(t)) return;
                          saveTypes([...maintenanceTypes, t]);
                          setNewTypeInput("");
                        }
                      }}
                      placeholder="نوع جديد..."
                      className="flex-1 border border-dashed border-gray-300 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#103c68]/50 bg-white"
                    />
                    <button
                      onClick={() => {
                        const t = newTypeInput.trim();
                        if (!t || maintenanceTypes.includes(t)) return;
                        saveTypes([...maintenanceTypes, t]);
                        setNewTypeInput("");
                      }}
                      className="px-3 py-1.5 bg-[#103c68] text-white rounded-xl text-xs font-bold hover:bg-[#0d3158] disabled:opacity-40"
                      disabled={!newTypeInput.trim() || maintenanceTypes.includes(newTypeInput.trim())}>
                      + إضافة
                    </button>
                  </div>

                  {selectedMaintTypes.length > 0 && (
                    <p className="text-xs text-[#103c68] font-semibold pt-0.5">
                      المحدد: {selectedMaintTypes.join(" · ")}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400">١ضغطة تحديد · ٢ إلغاء · ٣ تعديل المسمى</p>
                </div>
              </div>

              {/* ── مخطط الكفرات — يظهر فقط عند تحديد "كفرات" ── */}
              {selectedMaintTypes.includes("كفرات") && (
                <div className="border border-orange-200 rounded-xl p-4 bg-orange-50/40">
                  <label className="text-sm font-bold text-gray-700 block mb-3">
                    🔴 اختر الكفرات المعطوبة
                    <span className="text-xs font-normal text-gray-400 mr-2">(اضغط على الكفرة لتحديدها)</span>
                  </label>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    {/* ══ SVG Diagrams — adaptive by vehicle/trailer type ══ */}
                    {(() => {
                      const toggleTire = (id: string) => {
                        if (selectedTires.includes(id)) {
                          setSelectedTires(p => p.filter(x => x !== id));
                          setTireDetails(p => { const n = { ...p }; delete n[id]; return n; });
                        } else {
                          setSelectedTires(p => [...p, id]);
                        }
                      };
                      const TRect = ({ id, x, y, w, h, rx: r }: { id: string; x: number; y: number; w: number; h: number; rx: number }) => {
                        const s = selectedTires.includes(id);
                        return (
                          <g onClick={() => toggleTire(id)} style={{ cursor: "pointer" }}>
                            <rect x={x} y={y} width={w} height={h} rx={r}
                              fill={s ? "#ef4444" : "#374151"} stroke={s ? "#b91c1c" : "#1f2937"} strokeWidth="1.5"/>
                            {s && <text x={x + w / 2} y={y + h / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={w > 22 ? 14 : 11} fontWeight="bold">✓</text>}
                          </g>
                        );
                      };

                      /* ── سطحة / بلكر: 6 كفرات ─────────────────────────────── */
                      if (isTrailerMode && !isQallab) return (
                        <svg viewBox="0 0 220 340" className="w-40 h-auto flex-shrink-0" style={{ direction: "ltr" }}>
                          <text x="110" y="11" textAnchor="middle" fill="#6b7280" fontSize="9" fontWeight="bold">الأمام ↑</text>
                          <text x="110" y="335" textAnchor="middle" fill="#6b7280" fontSize="9" fontWeight="bold">↓ الخلف</text>
                          {/* Body */}
                          <rect x="72" y="15" width="76" height="306" rx="10" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1.5"/>
                          <rect x="94" y="9" width="32" height="12" rx="4" fill="#9ca3af"/>
                          <line x1="78" y1="125" x2="142" y2="125" stroke="#b5b5b5" strokeWidth="1" strokeDasharray="4,3"/>
                          <line x1="78" y1="220" x2="142" y2="220" stroke="#b5b5b5" strokeWidth="1" strokeDasharray="4,3"/>
                          {/* Axles */}
                          <line x1="58" y1="76" x2="162" y2="76" stroke="#6b7280" strokeWidth="4" strokeLinecap="round"/>
                          <line x1="58" y1="175" x2="162" y2="175" stroke="#6b7280" strokeWidth="4" strokeLinecap="round"/>
                          <line x1="58" y1="272" x2="162" y2="272" stroke="#6b7280" strokeWidth="4" strokeLinecap="round"/>
                          {/* 6 tires */}
                          <TRect id="FL"  x={36} y={50} w={27} h={52} rx={7}/>
                          <TRect id="FR"  x={157} y={50} w={27} h={52} rx={7}/>
                          <TRect id="ML"  x={36} y={148} w={27} h={52} rx={7}/>
                          <TRect id="MR"  x={157} y={148} w={27} h={52} rx={7}/>
                          <TRect id="RL"  x={36} y={246} w={27} h={52} rx={7}/>
                          <TRect id="RR"  x={157} y={246} w={27} h={52} rx={7}/>
                          {/* Side labels */}
                          <text x="49" y="45" textAnchor="middle" fill="#6b7280" fontSize="7">أيسر</text>
                          <text x="170" y="45" textAnchor="middle" fill="#6b7280" fontSize="7">أيمن</text>
                          {/* Axle labels inside body */}
                          <text x="110" y="68" textAnchor="middle" fill="#9ca3af" fontSize="6.5">أمامي</text>
                          <text x="110" y="167" textAnchor="middle" fill="#9ca3af" fontSize="6.5">أوسط</text>
                          <text x="110" y="264" textAnchor="middle" fill="#9ca3af" fontSize="6.5">خلفي</text>
                        </svg>
                      );

                      /* ── قلاب: 12 كفرة ──────────────────────────────────────── */
                      if (isTrailerMode && isQallab) return (
                        <svg viewBox="0 0 230 340" className="w-44 h-auto flex-shrink-0" style={{ direction: "ltr" }}>
                          <text x="115" y="11" textAnchor="middle" fill="#6b7280" fontSize="9" fontWeight="bold">الأمام ↑</text>
                          <text x="115" y="335" textAnchor="middle" fill="#6b7280" fontSize="9" fontWeight="bold">↓ الخلف</text>
                          {/* Body */}
                          <rect x="74" y="15" width="82" height="306" rx="10" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1.5"/>
                          <rect x="78" y="19" width="74" height="50" rx="7" fill="#9ca3af" opacity="0.45"/>
                          {/* Axles */}
                          <line x1="36" y1="76" x2="194" y2="76" stroke="#6b7280" strokeWidth="4" strokeLinecap="round"/>
                          <line x1="28" y1="175" x2="202" y2="175" stroke="#6b7280" strokeWidth="4" strokeLinecap="round"/>
                          <line x1="28" y1="272" x2="202" y2="272" stroke="#6b7280" strokeWidth="4" strokeLinecap="round"/>
                          {/* Front: 2 single */}
                          <TRect id="FL"  x={40}  y={50}  w={27} h={52} rx={7}/>
                          <TRect id="FR"  x={163} y={50}  w={27} h={52} rx={7}/>
                          {/* Middle: 4 dual */}
                          <TRect id="ML_O" x={10} y={148} w={21} h={52} rx={6}/>
                          <TRect id="ML_I" x={33} y={148} w={21} h={52} rx={6}/>
                          <TRect id="MR_I" x={176} y={148} w={21} h={52} rx={6}/>
                          <TRect id="MR_O" x={199} y={148} w={21} h={52} rx={6}/>
                          {/* Rear: 4 dual */}
                          <TRect id="RL_O" x={10} y={246} w={21} h={52} rx={6}/>
                          <TRect id="RL_I" x={33} y={246} w={21} h={52} rx={6}/>
                          <TRect id="RR_I" x={176} y={246} w={21} h={52} rx={6}/>
                          <TRect id="RR_O" x={199} y={246} w={21} h={52} rx={6}/>
                          {/* Labels */}
                          <text x="53"  y="45" textAnchor="middle" fill="#6b7280" fontSize="7">أيسر</text>
                          <text x="177" y="45" textAnchor="middle" fill="#6b7280" fontSize="7">أيمن</text>
                          <text x="21"  y="143" textAnchor="middle" fill="#9ca3af" fontSize="5.5">خ</text>
                          <text x="43"  y="143" textAnchor="middle" fill="#9ca3af" fontSize="5.5">د</text>
                          <text x="187" y="143" textAnchor="middle" fill="#9ca3af" fontSize="5.5">د</text>
                          <text x="210" y="143" textAnchor="middle" fill="#9ca3af" fontSize="5.5">خ</text>
                          <text x="115" y="68"  textAnchor="middle" fill="#9ca3af" fontSize="6.5">أمامي</text>
                          <text x="115" y="167" textAnchor="middle" fill="#9ca3af" fontSize="6.5">أوسط</text>
                          <text x="115" y="264" textAnchor="middle" fill="#9ca3af" fontSize="6.5">خلفي</text>
                        </svg>
                      );

                      /* ── سيارة عادية: 6 كفرات (2 أمام + 4 خلف مزدوج) ───── */
                      return (
                        <svg viewBox="0 0 220 295" className="w-40 h-auto flex-shrink-0" style={{ direction: "ltr" }}>
                          <text x="110" y="11" textAnchor="middle" fill="#6b7280" fontSize="9" fontWeight="bold">الأمام ↑</text>
                          <text x="110" y="289" textAnchor="middle" fill="#6b7280" fontSize="9" fontWeight="bold">↓ الخلف</text>
                          <rect x="70" y="18" width="80" height="254" rx="22" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1.5"/>
                          <rect x="76" y="23" width="68" height="68" rx="16" fill="#93c5fd" opacity="0.65"/>
                          <rect x="80" y="104" width="60" height="108" rx="6" fill="#e5e7eb" opacity="0.75"/>
                          <rect x="76" y="220" width="68" height="42" rx="12" fill="#c4c4c4"/>
                          <line x1="64" y1="68" x2="156" y2="68" stroke="#6b7280" strokeWidth="3.5" strokeLinecap="round"/>
                          <line x1="50" y1="220" x2="170" y2="220" stroke="#6b7280" strokeWidth="3.5" strokeLinecap="round"/>
                          <TRect id="FL"   x={37}  y={44}  w={27} h={48} rx={8}/>
                          <TRect id="FR"   x={156} y={44}  w={27} h={48} rx={8}/>
                          <TRect id="RL_O" x={27}  y={192} w={21} h={55} rx={6}/>
                          <TRect id="RL_I" x={50}  y={192} w={21} h={55} rx={6}/>
                          <TRect id="RR_I" x={149} y={192} w={21} h={55} rx={6}/>
                          <TRect id="RR_O" x={172} y={192} w={21} h={55} rx={6}/>
                          <text x="50"  y="42"  textAnchor="middle" fill="#6b7280" fontSize="7">أيسر</text>
                          <text x="169" y="42"  textAnchor="middle" fill="#6b7280" fontSize="7">أيمن</text>
                          <text x="38"  y="256" textAnchor="middle" fill="#6b7280" fontSize="6.5">خارجي</text>
                          <text x="61"  y="256" textAnchor="middle" fill="#6b7280" fontSize="6.5">داخلي</text>
                          <text x="160" y="256" textAnchor="middle" fill="#6b7280" fontSize="6.5">داخلي</text>
                          <text x="183" y="256" textAnchor="middle" fill="#6b7280" fontSize="6.5">خارجي</text>
                        </svg>
                      );
                    })()}

                    {/* Summary + condition panel */}
                    <div className="flex-1 text-sm space-y-2 min-w-0 max-h-72 overflow-y-auto pr-1">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide sticky top-0 bg-orange-50/40 pb-1">تفاصيل كل كفرة</p>
                      {selectedTires.length === 0 ? (
                        <p className="text-gray-400 text-xs italic">اضغط على الكفرة في الرسم لتحديدها</p>
                      ) : (
                        <div className="space-y-2">
                          {selectedTires.map(id => {
                            const det: TireCond = tireDetails[id] || { cond: "new" };
                            return (
                              <div key={id} className="bg-white border border-red-100 rounded-xl p-2.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-red-700">{TIRE_LABELS[id] || id}</span>
                                  <button
                                    onClick={() => {
                                      setSelectedTires(prev => prev.filter(x => x !== id));
                                      setTireDetails(prev => { const n = { ...prev }; delete n[id]; return n; });
                                    }}
                                    className="text-red-300 hover:text-red-600 text-sm leading-none">×</button>
                                </div>
                                {/* Last replacement info */}
                                {(() => {
                                  const plate = mlForm.vehicle_plate;
                                  if (!plate) return null;
                                  const lastLog = maintenanceLogs
                                    .filter(log => log.vehicle_plate === plate && log.tires)
                                    .sort((a, b) => {
                                      const da = a.maintenance_date || a.created_at || "";
                                      const db2 = b.maintenance_date || b.created_at || "";
                                      return db2.localeCompare(da);
                                    })
                                    .find(log => {
                                      try {
                                        const arr = JSON.parse(log.tires!) as { id: string }[];
                                        return arr.some(t => t.id === id);
                                      } catch { return false; }
                                    });
                                  if (!lastLog) return (
                                    <p className="text-[10px] text-gray-400 italic">لا يوجد سجل تبديل سابق</p>
                                  );
                                  const dateStr = lastLog.maintenance_date || lastLog.created_at?.slice(0,10) || "";
                                  return (
                                    <p className="text-[10px] text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                                      🕐 آخر تبديل: {dateStr}
                                      {lastLog.card_number ? ` · كارت #${lastLog.card_number}` : ""}
                                    </p>
                                  );
                                })()}
                                {/* Condition selector */}
                                <div className="flex gap-1">
                                  {([ ["new","🔵 جديد"], ["from_vehicle","🔄 من سيارة"], ["puncture","🔧 مبنشر"] ] as [TireCond["cond"], string][]).map(([val, label]) => (
                                    <button key={val}
                                      onClick={() => setTireDetails(prev => ({ ...prev, [id]: { ...det, cond: val, vehicle: val !== "from_vehicle" ? undefined : det.vehicle, serial: val !== "new" ? undefined : det.serial } }))}
                                      className={`flex-1 text-[10px] px-1.5 py-1 rounded-lg border transition-colors leading-tight ${det.cond === val ? "bg-red-600 text-white border-red-600 font-bold" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-red-50 hover:border-red-200"}`}>
                                      {label}
                                    </button>
                                  ))}
                                </div>
                                {/* Serial number when new */}
                                {det.cond === "new" && (
                                  <input
                                    type="text"
                                    placeholder="رقم سيريل الكفر (اختياري)"
                                    value={det.serial || ""}
                                    onChange={e => setTireDetails(prev => ({ ...prev, [id]: { ...det, serial: e.target.value } }))}
                                    className="w-full text-xs border border-blue-200 rounded-lg px-2 py-1 bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-300 placeholder-gray-400"
                                    dir="ltr"
                                  />
                                )}
                                {/* Vehicle selector when "from_vehicle" */}
                                {det.cond === "from_vehicle" && (
                                  <select
                                    value={det.vehicle || ""}
                                    onChange={e => setTireDetails(prev => ({ ...prev, [id]: { ...det, vehicle: e.target.value } }))}
                                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-red-300">
                                    <option value="">— اختر رقم السيارة —</option>
                                    {fleetVehicles.map(v => (
                                      <option key={v.id} value={v.plate_number}>
                                        {v.plate_number}{v.vehicle_type ? ` · ${v.vehicle_type}` : ""}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-2 pt-1 sticky bottom-0 bg-orange-50/40">
                        <button onClick={() => setSelectedTires(currentTireIds)}
                          className="text-xs px-2.5 py-1 bg-gray-700 text-white rounded-lg hover:bg-gray-900 transition-colors">
                          تحديد الكل
                        </button>
                        {selectedTires.length > 0 && (
                          <button onClick={() => { setSelectedTires([]); setTireDetails({}); }}
                            className="text-xs px-2.5 py-1 border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors">
                            مسح الكل
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">بيان الصيانة</label>
                <textarea value={mlForm.description} onChange={e => setMlForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  placeholder="وصف العطل أو أعمال الصيانة..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none" />
              </div>
              {/* ── Inventory Parts (editable in both create & edit) ─────────── */}
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">
                  قطع من المستودع
                  <span className="text-xs font-normal text-gray-400 mr-1">
                    {editingLog
                      ? "(يمكنك إضافة أو حذف القطع — سيتم تعديل المخزون تلقائياً)"
                      : "(اختياري — تُخصم فوراً من المخزون)"}
                  </span>
                </label>

                {/* Selected items list */}
                {invItems.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {invItems.map((ii, idx) => (
                      <div key={ii.item.id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                        <Package size={13} className="text-emerald-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-gray-800 truncate">{ii.item.item_name}</div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {ii.item.item_code && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{ii.item.item_code}</span>
                            )}
                            <span className={`text-xs font-semibold ${ii.item.quantity <= ii.item.min_stock ? "text-red-600" : "text-emerald-600"}`}>
                              المتاح: {ii.item.quantity} {ii.item.unit}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-xs text-gray-500">الكمية:</span>
                          <input
                            type="number" min="1"
                            value={ii.qty}
                            onChange={e => setInvItems(items => items.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))}
                            className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-emerald-400"
                          />
                          <span className="text-xs text-gray-400">{ii.item.unit}</span>
                        </div>
                        <button
                          onClick={() => setInvItems(items => items.filter((_, i) => i !== idx))}
                          className="text-gray-400 hover:text-red-500 p-0.5 flex-shrink-0 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search field */}
                <div className="relative">
                  <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    value={invSearchQ}
                    onChange={e => { setInvSearchQ(e.target.value); setInvDropOpen(true); }}
                    onFocus={() => setInvDropOpen(true)}
                    onBlur={() => setTimeout(() => setInvDropOpen(false), 180)}
                    placeholder={invItems.length > 0 ? "+ إضافة قطعة أخرى من المستودع..." : "ابحث باسم القطعة في المستودع..."}
                    className="w-full border border-gray-200 rounded-xl pr-8 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
                  />
                  {invDropOpen && (() => {
                    const q = invSearchQ.trim().toLowerCase();
                    const alreadyIds = new Set(invItems.map(ii => ii.item.id));
                    const results = (q
                      ? inventory.filter(i => i.item_name.toLowerCase().includes(q) || (i.item_code || "").toLowerCase().includes(q))
                      : inventory.slice(0, 10)
                    ).filter(i => !alreadyIds.has(i.id));
                    return results.length > 0 ? (
                      <div className="absolute z-50 top-full right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                        {results.map(item => (
                          <button key={item.id} type="button"
                            onMouseDown={e => { e.preventDefault();
                              setInvItems(prev => [...prev, { item, qty: "1" }]);
                              setInvSearchQ(""); setInvDropOpen(false);
                            }}
                            className="w-full text-right px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-2 text-sm border-b border-gray-50 last:border-0">
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-semibold text-gray-800">{item.item_name}</span>
                              {item.item_code && (
                                <span className="text-xs text-gray-400">رقم الصنف: {item.item_code}</span>
                              )}
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${item.quantity <= item.min_stock ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                              {item.quantity} {item.unit}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* ── Amount per maintenance type ───────────────────────────────── */}
              {selectedMaintTypes.length > 0 && (
                <div className="bg-gray-50 rounded-2xl p-3 space-y-2.5 border border-gray-100">
                  <div className="text-xs font-bold text-gray-500 mb-1">تكلفة كل نوع صيانة (ريال)</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {selectedMaintTypes.map(type => (
                      <div key={type}>
                        <label className="text-xs font-bold text-gray-700 block mb-1">{type}</label>
                        <div className="relative">
                          <input
                            type="number" min="0"
                            value={typePrices[type] || ""}
                            onChange={e => setTypePrices(p => ({ ...p, [type]: e.target.value }))}
                            placeholder="0"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">ر.س</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const total = selectedMaintTypes.reduce((s, t) => s + (Number(typePrices[t]) || 0), 0);
                    return total > 0 ? (
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200 mt-1">
                        <span className="text-xs font-bold text-gray-500">الإجمالي</span>
                        <span className="text-lg font-black text-[#103c68]">{total.toLocaleString("ar-SA")} ر.س</span>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              {mlError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm font-semibold">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  {mlError}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { if (!editingLog) localStorage.removeItem("workshop_card_draft"); setShowMlForm(false); setEditingLog(null); setMlError(""); setSelectedTechs([]); setTechInput(""); }} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
                <button onClick={saveMaintenanceLog} disabled={mlSubmitting}
                  className={`flex-1 py-3 text-white rounded-xl font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2 ${editingLog ? "bg-blue-600 hover:bg-blue-700" : "bg-[#103c68] hover:bg-[#0d3158]"}`}>
                  {mlSubmitting ? <><RefreshCw size={13} className="animate-spin" />جاري...</> : editingLog ? <><Pencil size={14} />حفظ التعديل</> : <><Plus size={14} />حفظ السجل</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Resolve Breakdown ─────────────────────────────────────────── */}
      {resolving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900">تسجيل الحل</h2>
              <button onClick={() => setResolving(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1">
                <div className="flex gap-2"><span className="text-gray-500">السيارة:</span><span className="font-semibold">{resolving.vehicle_plate}</span></div>
                <div className="flex gap-2"><span className="text-gray-500">النوع:</span><span className="font-semibold">{resolving.breakdown_type}</span></div>
                <div className="flex gap-2"><span className="text-gray-500">السائق:</span><span className="font-semibold">{resolving.driver_name || resolving.driver_phone}</span></div>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">وصف الحل / الإصلاح *</label>
                <textarea value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} rows={3}
                  placeholder="مثال: تم تغيير الزيت وفلتر الوقود..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setResolving(null)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
                <button onClick={resolveReport} disabled={submitting || !resolveNotes.trim()}
                  className="flex-1 py-3 bg-[#103c68] text-white rounded-xl font-black text-sm disabled:opacity-50 hover:bg-[#0d3158] flex items-center justify-center gap-2">
                  {submitting ? <><RefreshCw size={13} className="animate-spin" />جاري...</> : <><CheckCircle size={14} />تأكيد الحل</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: New Job ───────────────────────────────────────────────────── */}
      {newJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="font-black text-gray-900">أمر عمل جديد</h2>
              <button onClick={() => { setNewJob(false); setJobFromReport(null); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {jobFromReport && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm">
                  <span className="font-bold text-orange-800">من بلاغ: </span>
                  <span className="text-orange-700">{jobFromReport.breakdown_type} — {jobFromReport.vehicle_plate}</span>
                </div>
              )}
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">لوحة السيارة</label>
                <input value={jobForm.vehicle_plate} onChange={e => setJobForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                  placeholder="مثال: أ ب ج 1234" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">عنوان أمر العمل *</label>
                <input value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="مثال: تغيير زيت المحرك" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">النوع</label>
                  <select value={jobForm.job_type} onChange={e => setJobForm(f => ({ ...f, job_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                    <option value="صيانة_مباشرة">صيانة مباشرة</option>
                    <option value="قطع_غيار">قطع غيار</option>
                    <option value="كهربائي">كهربائي</option>
                    <option value="إطارات">إطارات</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">الفاتورة تذهب لـ</label>
                  <select value={jobForm.invoice_target} onChange={e => setJobForm(f => ({ ...f, invoice_target: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                    <option value="vehicle">على السيارة مباشرة</option>
                    <option value="inventory">مستودع الورشة</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">الوصف</label>
                <textarea value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  placeholder="تفاصيل أمر العمل..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">أجور (ريال)</label>
                  <input type="number" min="0" value={jobForm.labor_cost} onChange={e => setJobForm(f => ({ ...f, labor_cost: e.target.value }))}
                    placeholder="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">قطع غيار (ريال)</label>
                  <input type="number" min="0" value={jobForm.parts_cost} onChange={e => setJobForm(f => ({ ...f, parts_cost: e.target.value }))}
                    placeholder="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
              </div>
              <div className="bg-[#103c68]/5 rounded-xl p-3 text-center">
                <span className="text-sm text-gray-500">الإجمالي: </span>
                <span className="font-black text-[#103c68]">{sar((Number(jobForm.labor_cost) || 0) + (Number(jobForm.parts_cost) || 0))}</span>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">ملاحظات</label>
                <input value={jobForm.notes} onChange={e => setJobForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="أي ملاحظات إضافية..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setNewJob(false); setJobFromReport(null); }} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
                <button onClick={() => createJob(jobFromReport?.id)} disabled={submitting}
                  className="flex-1 py-3 bg-[#103c68] text-white rounded-xl font-black text-sm disabled:opacity-50 hover:bg-[#0d3158] flex items-center justify-center gap-2">
                  {submitting ? <><RefreshCw size={13} className="animate-spin" />جاري...</> : <><Plus size={14} />إنشاء أمر العمل</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Complete Job ──────────────────────────────────────────────── */}
      {completingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900">إغلاق أمر العمل</h2>
              <button onClick={() => setCompletingJob(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1">
                <div className="flex gap-2"><span className="text-gray-500">السيارة:</span><span className="font-semibold">{completingJob.vehicle_plate}</span></div>
                <div className="flex gap-2"><span className="text-gray-500">العنوان:</span><span className="font-semibold">{completingJob.title}</span></div>
                <div className="flex gap-2"><span className="text-gray-500">الإجمالي:</span><span className="font-black text-[#103c68]">{sar(completingJob.total_cost)}</span></div>
                <div className="flex gap-2">
                  <span className="text-gray-500">الفاتورة:</span>
                  <span className={`font-semibold ${completingJob.invoice_target === "vehicle" ? "text-blue-700" : "text-purple-700"}`}>
                    {completingJob.invoice_target === "vehicle" ? "على السيارة مباشرة" : "مستودع الورشة"}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">ملاحظات الإغلاق</label>
                <textarea value={completeNotes} onChange={e => setCompleteNotes(e.target.value)} rows={3}
                  placeholder="وصف ما تم تنفيذه..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCompletingJob(null)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
                <button onClick={completeJob} disabled={submitting}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-black text-sm disabled:opacity-50 hover:bg-green-700 flex items-center justify-center gap-2">
                  {submitting ? <><RefreshCw size={13} className="animate-spin" />جاري...</> : <><CheckCircle size={14} />تأكيد الإغلاق</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Inventory Form ────────────────────────────────────────────── */}
      {showInvForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900">{editingItem ? "تعديل الصنف" : "إضافة صنف جديد"}</h2>
              <button onClick={() => setShowInvForm(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">اسم الصنف *</label>
                <input value={invForm.item_name} onChange={e => setInvForm(f => ({ ...f, item_name: e.target.value }))}
                  placeholder="مثال: فلتر زيت" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">رمز الصنف</label>
                  <input value={invForm.item_code} onChange={e => setInvForm(f => ({ ...f, item_code: e.target.value }))}
                    placeholder="اختياري" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">الفئة</label>
                  <select value={invForm.category} onChange={e => setInvForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                    {["عام","زيوت وفلاتر","إطارات","كهربائي","ميكانيكي","ببلات ومكابح","تبريد"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">الكمية</label>
                  <input type="number" min="0" value={invForm.quantity} onChange={e => setInvForm(f => ({ ...f, quantity: e.target.value }))}
                    placeholder="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">الوحدة</label>
                  <select value={invForm.unit} onChange={e => setInvForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                    {["قطعة","لتر","كيلو","متر","علبة"].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">الحد الأدنى</label>
                  <input type="number" min="0" value={invForm.min_stock} onChange={e => setInvForm(f => ({ ...f, min_stock: e.target.value }))}
                    placeholder="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">سعر الوحدة (ريال)</label>
                  <input type="number" min="0" value={invForm.cost_per_unit} onChange={e => setInvForm(f => ({ ...f, cost_per_unit: e.target.value }))}
                    placeholder="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">المورّد</label>
                  <input value={invForm.supplier} onChange={e => setInvForm(f => ({ ...f, supplier: e.target.value }))}
                    placeholder="اختياري" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowInvForm(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
                <button onClick={saveInventory} disabled={submitting}
                  className="flex-1 py-3 bg-[#103c68] text-white rounded-xl font-black text-sm disabled:opacity-50 hover:bg-[#0d3158] flex items-center justify-center gap-2">
                  {submitting ? <><RefreshCw size={13} className="animate-spin" />جاري...</> : <><CheckCircle size={14} />حفظ</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Exit Time Modal ────────────────────────────────────────────────────── */}
      {exitingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900 flex items-center gap-2 text-base">
                <span className="text-lg">🚪</span>
                تسجيل خروج السيارة
              </h2>
              <button onClick={() => setExitingLog(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-xl px-4 py-2.5 text-sm text-gray-700 font-semibold">
                {exitingLog.vehicle_plate || "—"} {exitingLog.driver_name ? `· ${exitingLog.driver_name}` : ""}
                <div className="text-xs text-gray-400 font-normal mt-0.5">كارت رقم {exitingLog.card_number || exitingLog.id} · دخول {exitingLog.entry_time || "—"}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">وقت الخروج</label>
                  <input type="time" value={exitForm.exit_time} onChange={e => setExitForm(f => ({ ...f, exit_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-1">تاريخ الخروج</label>
                  <input type="date" value={exitForm.exit_date} onChange={e => setExitForm(f => ({ ...f, exit_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setExitingLog(null)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
                <button onClick={recordExit} disabled={exitSubmitting}
                  className="flex-1 py-3 bg-[#103c68] text-white rounded-xl font-black text-sm disabled:opacity-50 hover:bg-[#0d3158] flex items-center justify-center gap-2">
                  {exitSubmitting ? <><RefreshCw size={13} className="animate-spin" />جاري...</> : <><CheckCircle size={14} />تأكيد الخروج</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: TIRES ──────────────────────────────────────────────────────── */}
      {tab === "tires" && (() => {
        // Flatten all tires from maintenance_logs into rows
        const rows: {
          vehicle_plate: string;
          card_number: string;
          date: string;
          tireId: string;
          tireLabel: string;
          cond: string;
          serial: string;
          fromVehicle: string;
        }[] = [];
        allTireLogs.forEach(log => {
          if (!log.tires) return;
          const { ids, details } = parseTires(log.tires);
          ids.forEach(tId => {
            const det = details[tId] || { cond: "new" as const };
            rows.push({
              vehicle_plate: log.vehicle_plate || "—",
              card_number: log.card_number || String(log.id),
              date: log.maintenance_date || log.created_at?.slice(0, 10) || "—",
              tireId: tId,
              tireLabel: TIRE_LABELS[tId] || tId,
              cond: TIRE_COND_LABELS[det.cond || "new"] || det.cond || "—",
              serial: det.serial || "—",
              fromVehicle: det.vehicle || "—",
            });
          });
        });
        const q = tiresSearch.trim().toLowerCase();
        const filtered = q ? rows.filter(r =>
          r.vehicle_plate.toLowerCase().includes(q) ||
          r.card_number.toLowerCase().includes(q) ||
          r.serial.toLowerCase().includes(q)
        ) : rows;

        return (
          <div className="space-y-4">
            {/* Search bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center flex-1 min-w-[180px] gap-1.5 border border-gray-200 rounded-xl px-3 bg-white">
                <Search size={13} className="text-gray-400 flex-shrink-0" />
                <input
                  value={tiresSearch}
                  onChange={e => setTiresSearch(e.target.value)}
                  placeholder="بحث برقم السيارة أو الكارت أو السيريل..."
                  className="flex-1 py-2 text-sm bg-transparent outline-none"
                />
                {tiresSearch && (
                  <button onClick={() => setTiresSearch("")} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
                )}
              </div>
              <span className="text-xs text-gray-400">{filtered.length} كفرة</span>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">🔴</div>
                <p className="text-sm font-medium">{tiresSearch ? "لا توجد نتائج" : "لا توجد كفرات مسجّلة بعد"}</p>
                <p className="text-xs mt-1 text-gray-300">يتم تسجيل الكفرات تلقائياً من بطاقات الصيانة</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#103c68] text-white">
                      <th className="px-4 py-3 text-right font-bold">رقم السيارة</th>
                      <th className="px-4 py-3 text-right font-bold">رقم الكارت</th>
                      <th className="px-4 py-3 text-right font-bold">تاريخ التركيب</th>
                      <th className="px-4 py-3 text-right font-bold">مكان الكفر</th>
                      <th className="px-4 py-3 text-right font-bold">الحالة</th>
                      <th className="px-4 py-3 text-right font-bold">رقم السيريل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={i} className={`border-b border-gray-50 hover:bg-orange-50/40 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                        <td className="px-4 py-2.5 font-mono font-semibold text-[#103c68]">{r.vehicle_plate}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.card_number}</td>
                        <td className="px-4 py-2.5 text-gray-500">{r.date}</td>
                        <td className="px-4 py-2.5 font-medium">{r.tireLabel}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                            r.cond === "جديد" ? "bg-blue-100 text-blue-700" :
                            r.cond === "من سيارة" ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-600"
                          }`}>
                            {r.cond === "جديد" ? "🔵" : r.cond === "من سيارة" ? "🔄" : "🔧"} {r.cond}
                          </span>
                          {r.cond === "من سيارة" && r.fromVehicle !== "—" && (
                            <span className="text-xs text-gray-400 mr-1">({r.fromVehicle})</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dir-ltr">{r.serial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Photo Modal */}
      {photoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setPhotoModal(null)}>
          <div className="relative max-w-2xl w-full">
            <button onClick={() => setPhotoModal(null)} className="absolute top-2 end-2 z-10 bg-black/60 text-white p-2 rounded-xl hover:bg-black/80"><X size={18} /></button>
            <img src={photoModal} alt="صورة العطل" className="w-full rounded-2xl object-contain max-h-[80vh]" />
          </div>
        </div>
      )}
    </div>
  );
}
