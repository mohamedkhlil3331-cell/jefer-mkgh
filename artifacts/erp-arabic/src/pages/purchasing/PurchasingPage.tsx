import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import * as XLSX from "xlsx";
import {
  ShoppingBag, Package, CheckCircle, X, RefreshCw, Plus,
  Clock, AlertTriangle, Boxes, XCircle, ArrowDownCircle,
  FileSpreadsheet, Upload, Trash2, Search, Eye, Truck, Briefcase, RotateCcw, ClipboardPaste,
  ChevronDown, ClipboardList, Wallet, FileText, Printer, Download,
} from "lucide-react";
import { buildCompanyLetterheadHtml, COMPANY_LETTERHEAD_PRINT_CSS } from "@/pages/transportation/DriverStatementModal";
import { useRememberedState } from "@/hooks/useRememberedState";
import { InvoicePasteModal, type InvoicePasteRow } from "./InvoicePasteModal";
import {
  usePasteSupplierPurchaseInvoices,
  type SupplierPurchaseInvoicePasteInput,
  type SupplierPurchaseInvoicePasteResult,
} from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PurchaseRequest {
  id: number; item_name: string; quantity: number; unit: string;
  reason: string | null; workshop_job_id: number | null;
  requested_by: string; status: "pending" | "approved" | "rejected" | "received";
  approved_by: string | null; rejection_reason: string | null;
  estimated_cost: number; actual_cost: number; supplier: string | null;
  supplier_id: number | null;
  received_at: string | null; created_at: string; vehicle_plate: string | null;
}
interface Supplier {
  id: number; name: string; phone: string | null; specialty: string | null;
  notes: string | null; is_active: number; created_at: string;
  order_count: number; total_amount: number; last_deal: string | null;
  received_count: number; avg_rating: number;
  inv_count: number; inv_total: number;
}
interface FleetVehicle {
  plate_number: string; vehicle_type: string; branch?: string | null;
  linked_trailer_number?: string | null;
}
interface TeidaraOption { id: number; teidara_number: string | null; category: string; }
interface InventoryItem {
  id: number; item_name: string; item_code: string | null; category: string;
  quantity: number; unit: string; min_stock: number;
  cost_per_unit: number; supplier: string | null; last_updated: string;
}
interface PurchaseInvoice {
  id: number; serial_no: string | null; invoice_date: string | null;
  branch: string | null; vehicle_plate: string | null; invoice_number: string | null;
  reimbursement_claim_id?: number | null;
  claim_number?: string | null;
  claim_sequence_no?: number | null;
  claim_is_printed?: number | null;
  claim_is_cancelled?: number | null;
  claim_printed_at?: string | null;
  claim_printed_by?: string | null;
  claim_last_reprinted_by?: string | null;
  claim_last_reprinted_at?: string | null;
  work_on?: "vehicle" | "trailer" | null; trailer_number?: string | null;
  supplier_name: string | null; supplier_id: number | null; item_name: string;
  price_before_vat: number; quantity: number; price_after_vat: number;
  discount_amount?: number;
  notes: string | null; imported_by: string | null; created_at: string;
}
interface SupplierClaim {
  id: number;
  claim_number: string;
  sequence_no: number;
  created_by: string;
  branch?: string | null;
  total_before_vat: number;
  total_after_vat: number;
  invoice_count: number;
  notes: string | null;
  created_at: string;
  is_printed: number;
  printed_at: string | null;
  is_cancelled: number;
  cancelled_at: string | null;
  cancelled_by: string | null;
  include_driver_signatures: number;
  original_printed_by?: string | null;
  last_reprinted_by?: string | null;
  last_reprinted_at?: string | null;
}

interface Branch { id: number; entity_name: string; }

// Excel row (raw from SheetJS)
interface ExcelRow {
  serial_no: string; invoice_date: string; branch: string;
  vehicle_plate: string; invoice_number: string; supplier_name: string;
  item_name: string; price_before_vat: number; quantity: number;
  price_after_vat: number; notes: string;
  [k: string]: unknown;
}

// ─── Fuzzy column mapper (keyword-based, handles typos & variants) ────────────
function mapColumn(header: string): keyof ExcelRow | null {
  const h = header.trim().replace(/\s+/g, " ");
  const l = h.toLowerCase();
  if (/مسلسل|serial/.test(l))                              return "serial_no";
  if (/تاريخ|date/.test(l))                                return "invoice_date";
  if (/فرع|branch/.test(l))                                return "branch";
  if (/سيار|vehicle|plate/.test(l))                        return "vehicle_plate";
  if (/فاتور|invoice/.test(l))                             return "invoice_number";
  if (/مورد|supplier/.test(l))                             return "supplier_name";
  // item_name: matches "قطع" OR "غيار" OR "صنف" OR "item" — covers قطعة/قطع variants
  if (/قطع|غيار|صنف\b|item/.test(l))                      return "item_name";
  // price_before_vat: "قبل" + tax keyword (ضري covers ضريبة AND ضريية typo)
  if (/قبل.*ضري|ضري.*قبل|before.*tax|price_before/.test(l)) return "price_before_vat";
  if (/كمي|quantity/.test(l))                              return "quantity";
  // price_after_vat: "بعد" + tax keyword OR "قيمة" alone after ضري
  if (/بعد.*ضري|ضري.*بعد|after.*tax|price_after/.test(l))  return "price_after_vat";
  if (/ملاحظ|note/.test(l))                                return "notes";
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (d: string) =>
  new Date(d).toLocaleDateString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("ar-SA") : "—";
const newInvoicePasteRequestKey = () =>
  `supplier-invoice-paste-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

function parseInvoicePasteAmount(rawValue: string): number {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const normalized = rawValue
    .replace(/[٠-٩]/g, digit => String(arabic.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(persian.indexOf(digit)))
    .replace(/[٬,،\s]/g, "")
    .replace(/٫/g, ".");
  const parsed = normalized.trim() ? Number(normalized) : 0;
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("تأكد من صحة الكمية والأسعار والخصم");
  return parsed;
}
const sar = (n: number) =>
  n.toLocaleString("ar-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("ar-SA", { minimumFractionDigits: 0 });
const claimSequenceLabel = (sequence: number | null | undefined, id: number) =>
  String(sequence || id).padStart(6, "0");
const escapePrintHtml = (value: string) =>
  value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character] || character);

function claimDriverSignatureHtml(claim: SupplierClaim, rows: PurchaseInvoice[]): string {
  if (!Number(claim.include_driver_signatures)) return "";
  const plates = [...new Set(rows.map(row => row.vehicle_plate?.trim()).filter((plate): plate is string => Boolean(plate)))];
  const vehicles = plates.length ? plates : [""];
  return `
  <section class="driver-signatures">
    <h3>توقيعات السائقين</h3>
    <div class="driver-signature-grid">
      ${vehicles.map(plate => `<div class="driver-signature">
        <span>اسم السائق: ____________________</span>
        ${plate ? `<span>السيارة: ${escapePrintHtml(plate)}</span>` : ""}
        <span>التوقيع: ____________________</span>
      </div>`).join("")}
    </div>
  </section>`;
}

const STATUS_STYLE: Record<string, string> = {
  pending:  "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  received: "bg-green-100 text-green-700 border-green-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار الموافقة", approved: "تمت الموافقة",
  rejected: "مرفوض", received: "تم الاستلام",
};

function parseExcel(file: File): Promise<ExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Use array mode — find header row ourselves (handles title rows above headers)
        const arr = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
        if (!arr.length) return resolve([]);

        // Find the first row that has at least 3 non-empty cells → header row
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(arr.length, 10); i++) {
          const row = arr[i] as unknown[];
          if (row.filter(c => String(c ?? "").trim() !== "").length >= 3) {
            headerRowIdx = i;
            break;
          }
        }

        const headerRow = arr[headerRowIdx] as unknown[];
        // Map column index → ExcelRow field
        const colMap: Record<number, keyof ExcelRow> = {};
        headerRow.forEach((cell, idx) => {
          const field = mapColumn(String(cell ?? ""));
          if (field) colMap[idx] = field;
        });

        const rows: ExcelRow[] = arr
          .slice(headerRowIdx + 1)
          .map(rawRow => {
            const r = rawRow as unknown[];
            const out: ExcelRow = {
              serial_no: "", invoice_date: "", branch: "", vehicle_plate: "",
              invoice_number: "", supplier_name: "", item_name: "",
              price_before_vat: 0, quantity: 0, price_after_vat: 0, notes: "",
            };
            for (const [idxStr, field] of Object.entries(colMap)) {
              const val = r[Number(idxStr)];
              if (field === "price_before_vat" || field === "quantity" || field === "price_after_vat") {
                (out as Record<string, unknown>)[field] = Number(String(val ?? "").replace(/,/g, "")) || 0;
              } else if (field === "invoice_date") {
                if (val instanceof Date) {
                  (out as Record<string, unknown>)[field] = val.toISOString().split("T")[0];
                } else {
                  (out as Record<string, unknown>)[field] = String(val ?? "").trim();
                }
              } else {
                (out as Record<string, unknown>)[field] = String(val ?? "").trim();
              }
            }
            return out;
          })
          // Keep rows that have at least an item name or a supplier (skip blank/total rows)
          .filter(r => r.item_name.trim() !== "" || r.supplier_name.trim() !== "");

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface InvItem { id: string; item_name: string; quantity: string; price_before_vat: string; price_after_vat: string; }
const mkInvItem = (): InvItem => ({ id: String(Date.now() + Math.random()), item_name: "", quantity: "1", price_before_vat: "", price_after_vat: "" });

export default function PurchasingPage() {
  const { user, token } = useAuth();
  const pasteInvoicesMutation = usePasteSupplierPurchaseInvoices();
  const canManageSupplierClaims = user?.role === "admin";
  const claimRequestHeaders = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  const [tab, setTab] = useRememberedState<"requests" | "inventory" | "invoices" | "custody" | "printed_custody" | "returns" | "suppliers">("purchasing-tab", "requests");

  // Requests state
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [rFilter, setRFilter] = useRememberedState<"all" | "pending" | "approved" | "received">("purchasing-request-status-filter", "pending");
  const [approving, setApproving] = useState<PurchaseRequest | null>(null);
  const [approveForm, setApproveForm] = useState({ actual_cost: "", supplier: "", supplier_id: "" });
  const [rejecting, setRejecting] = useState<PurchaseRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [receiving, setReceiving] = useState<PurchaseRequest | null>(null);
  const [receiveForm, setReceiveForm] = useState({ actual_cost: "", inventory_id: "", qty: "", rating: "0", quality_notes: "" });
  const [newRequest, setNewRequest] = useState(false);
  const [reqForm, setReqForm] = useState({ item_name: "", quantity: "", unit: "قطعة", reason: "", estimated_cost: "", supplier: "", vehicle_plate: "" });
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicle[]>([]);
  const [teidarat, setTeidarat] = useState<TeidaraOption[]>([]);
  const [teidaraLoadError, setTeidaraLoadError] = useState("");

  // Inventory state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [invForm, setInvForm] = useState({
    item_name: "", item_code: "", category: "عام", quantity: "",
    unit: "قطعة", min_stock: "", cost_per_unit: "", supplier: "",
  });
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showInvForm, setShowInvForm] = useState(false);

  // Purchase invoices state
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [invFilter, setInvFilter] = useRememberedState("purchasing-invoice-filters", { vehicle_plate: "", supplier_name: "", branch: "" });
  const [previewRows, setPreviewRows] = useState<ExcelRow[] | null>(null);
  const [previewFile, setPreviewFile] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [editForm, setEditForm] = useState({
    serial_no: "", invoice_date: "", branch: "", vehicle_plate: "",
    work_on: "", trailer_number: "",
    invoice_number: "", supplier_name: "", supplier_id: "", item_name: "",
    price_before_vat: "", quantity: "", price_after_vat: "", notes: "",
  });
  // Multi-select & clear
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [claimInvoiceSelIds, setClaimInvoiceSelIds] = useState<Set<number>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Branches
  const [branches, setBranches] = useState<Branch[]>([]);

  // New invoice modal
  const [newInvOpen, setNewInvOpen] = useState(false);
  const [pasteInvoicesOpen, setPasteInvoicesOpen] = useState(false);
  const [pasteInvoiceRequestKey, setPasteInvoiceRequestKey] = useState(newInvoicePasteRequestKey);
  const [newInvForm, setNewInvForm] = useState({
    serial_no: "", invoice_date: new Date().toISOString().split("T")[0],
    branch: "", vehicle_plate: "", work_on: "vehicle", trailer_number: "", invoice_number: "",
    supplier_name: "", supplier_id: "", notes: "",
  });
  const [invItems, setInvItems] = useState<InvItem[]>([mkInvItem()]);
  const [invoiceDiscount, setInvoiceDiscount] = useState("");
  const [invResult, setInvResult] = useState<{ workshopAdded: boolean; workshopItemName: string } | null>(null);
  const [invVehicleQ, setInvVehicleQ] = useState("");
  const [invVehicleOpen, setInvVehicleOpen] = useState(false);
  const [extraVehicles, setExtraVehicles] = useState<string[]>([]);
  const invVehicleRef = useRef<HTMLDivElement>(null);

  // Returns modal state
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQ, setReturnQ] = useState("");
  const [returnSels, setReturnSels] = useState<Map<number, { qty: string; reason: string }>>(new Map());
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnDone, setReturnDone] = useState<string | null>(null);

  // Returns tab state
  type PurchaseReturn = { id: number; invoice_id: number; invoice_number: string | null; supplier_name: string | null; item_name: string; return_quantity: number; reason: string | null; returned_by: string | null; returned_at: string; vehicle_plate: string | null };
  const [returnsList, setReturnsList] = useState<PurchaseReturn[]>([]);
  const [returnsTabQ, setReturnsTabQ] = useRememberedState("purchasing-returns-search", "");

  // Custody tab state
  const [claimSuccess, setClaimSuccess] = useState<{ id: number; claim_number: string; sequence_no: number; count: number; ids: number[] } | null>(null);
  const [unclaimedInvs, setUnclaimedInvs] = useState<PurchaseInvoice[]>([]);
  const [custodyClaims, setCustodyClaims] = useState<SupplierClaim[]>([]);
  const [printedCustodyClaims, setPrintedCustodyClaims] = useState<SupplierClaim[]>([]);
  const [selIds, setSelIds] = useState<Set<number>>(new Set());
  const [claimNotes, setClaimNotes] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [printingClaims, setPrintingClaims] = useState(false);
  const [expandedClaim, setExpandedClaim] = useState<number | null>(null);
  const [claimItems, setClaimItems] = useState<Record<number, PurchaseInvoice[]>>({});

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierModal, setSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", specialty: "", notes: "" });
  const [supplierHistoryOpen, setSupplierHistoryOpen] = useState<Supplier | null>(null);
  const [supplierHistoryTab, setSupplierHistoryTab] = useRememberedState<"requests" | "invoices">("purchasing-supplier-history-tab", "requests");
  const [supplierHistoryData, setSupplierHistoryData] = useState<{ requests: PurchaseRequest[]; invoices: PurchaseInvoice[] }>({ requests: [], invoices: [] });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadRequests   = () => fetch("/api/purchase-requests").then(r => r.json()).then(d => setRequests(Array.isArray(d) ? d : []));
  const loadInventory  = () => fetch("/api/workshop-inventory").then(r => r.json()).then(d => setInventory(Array.isArray(d) ? d : []));
  const loadFleet      = () => fetch("/api/fleet-vehicles-list").then(r => r.json()).then(d => setFleetVehicles(Array.isArray(d) ? d : []));
  const loadTeidarat   = async () => {
    try {
      const response = await fetch("/api/teidarat");
      if (!response.ok) throw new Error("request failed");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("invalid response");
      setTeidarat(data);
      setTeidaraLoadError("");
    } catch {
      setTeidarat([]);
      setTeidaraLoadError("تعذر تحميل قائمة التيدارات؛ أعد المحاولة قبل إسناد الفاتورة إلى تيدر.");
    }
  };
  const loadBranches   = () => fetch("/api/company-settings").then(r => r.ok ? r.json() : []).then(d => setBranches(Array.isArray(d) ? d : []));
  const loadInvoices  = () => {
    const q = new URLSearchParams();
    if (invFilter.vehicle_plate) q.set("vehicle_plate", invFilter.vehicle_plate);
    if (invFilter.supplier_name) q.set("supplier_name", invFilter.supplier_name);
    if (invFilter.branch)        q.set("branch", invFilter.branch);
    return fetch(`/api/purchase-invoices?${q}`).then(r => r.json()).then(d => {
      const rows = Array.isArray(d) ? d as PurchaseInvoice[] : [];
      setInvoices(rows);
      setClaimInvoiceSelIds(previous => new Set(
        [...previous].filter(id => rows.some(invoice =>
          invoice.id === id && !Number(invoice.reimbursement_claim_id)
        ))
      ));
    });
  };

  const loadReturnsList = () =>
    fetch("/api/purchase-invoice-returns")
      .then(r => r.json()).then(d => setReturnsList(Array.isArray(d) ? d : []));

  const loadUnclaimedInvs = () =>
    fetch(`/api/purchase-invoices?unclaimed=true${user?.name ? `&created_by=${encodeURIComponent(user.name)}` : ""}`)
      .then(r => r.json()).then(d => setUnclaimedInvs(Array.isArray(d) ? d : []));
  const loadCustodyClaims = () =>
    fetch(`/api/supplier-reimbursement-claims${user?.name ? `?created_by=${encodeURIComponent(user.name)}` : ""}`)
      .then(r => r.json()).then(d => setCustodyClaims(Array.isArray(d) ? d : []));
  const loadPrintedCustodyClaims = () => {
    return fetch("/api/supplier-reimbursement-claims?printed=true", {
      headers: claimRequestHeaders(),
    }).then(r => r.json()).then(d => setPrintedCustodyClaims(Array.isArray(d) ? d : []));
  };

  const loadSuppliers = () =>
    fetch("/api/suppliers").then(r => r.json()).then(d => setSuppliers(Array.isArray(d) ? d : []));

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadRequests(), loadInventory(), loadInvoices(), loadFleet(), loadTeidarat(), loadBranches(), loadSuppliers()]);
    setLoading(false);
  };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (tab === "printed_custody") { setTab("custody"); return; }
    if (tab === "custody") {
      loadUnclaimedInvs();
      loadCustodyClaims();
      void loadPrintedCustodyClaims();
    }
    if (tab === "returns") { loadReturnsList(); }
    if (tab === "suppliers") { loadSuppliers(); }
  }, [tab, user?.name, user?.role, token]);

  // ── Supplier CRUD ─────────────────────────────────────────────────────────────
  const saveSupplier = async () => {
    if (!supplierForm.name.trim()) return alert("اسم المورد مطلوب");
    setSubmitting(true);
    try {
      const url = editingSupplier ? `/api/suppliers/${editingSupplier.id}` : "/api/suppliers";
      const res = await fetch(url, {
        method: editingSupplier ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierForm),
      });
      if (!res.ok) { const d = await res.json(); return alert(d.error || "فشل الحفظ"); }
      setSupplierModal(false);
      setEditingSupplier(null);
      setSupplierForm({ name: "", phone: "", specialty: "", notes: "" });
      loadSuppliers();
    } catch { alert("فشل الاتصال بالخادم"); }
    finally { setSubmitting(false); }
  };

  const deactivateSupplier = async (id: number) => {
    if (!confirm("هل تريد إيقاف هذا المورد؟")) return;
    await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    loadSuppliers();
  };

  const openSupplierHistory = async (s: Supplier) => {
    setSupplierHistoryOpen(s);
    setSupplierHistoryData({ requests: [], invoices: [] });
    const d = await fetch(`/api/suppliers/${s.id}/history`).then(r => r.json());
    setSupplierHistoryData({
      requests: Array.isArray(d?.requests) ? d.requests : [],
      invoices: Array.isArray(d?.invoices) ? d.invoices : [],
    });
  };

  // ── Approve ──────────────────────────────────────────────────────────────────
  const approveRequest = async () => {
    if (!approving) return;
    setSubmitting(true);
    try {
      await fetch(`/api/purchase-requests/${approving.id}/approve`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved_by: user?.name,
          actual_cost: Number(approveForm.actual_cost) || 0,
          supplier: approveForm.supplier,
          supplier_id: approveForm.supplier_id ? Number(approveForm.supplier_id) : null,
        }),
      });
      setApproving(null); setApproveForm({ actual_cost: "", supplier: "", supplier_id: "" });
      loadRequests();
    } catch { alert("فشل الموافقة على الطلب"); }
    finally { setSubmitting(false); }
  };

  // ── Reject ───────────────────────────────────────────────────────────────────
  const rejectRequest = async () => {
    if (!rejecting) return;
    setSubmitting(true);
    try {
      await fetch(`/api/purchase-requests/${rejecting.id}/reject`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejection_reason: rejectReason }),
      });
      setRejecting(null); setRejectReason("");
      loadRequests();
    } catch { alert("فشل رفض الطلب"); }
    finally { setSubmitting(false); }
  };

  // ── Receive ──────────────────────────────────────────────────────────────────
  const receiveRequest = async () => {
    if (!receiving) return;
    setSubmitting(true);
    try {
      await fetch(`/api/purchase-requests/${receiving.id}/receive`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actual_cost: Number(receiveForm.actual_cost) || receiving.actual_cost || receiving.estimated_cost,
          inventory_id: receiveForm.inventory_id || null,
          qty: receiveForm.qty || receiving.quantity,
          rating: Number(receiveForm.rating) || null,
          quality_notes: receiveForm.quality_notes || null,
          received_by: user?.name || user?.phone,
          supplier: receiving.supplier || null,
        }),
      });
      setReceiving(null);
      setReceiveForm({ actual_cost: "", inventory_id: "", qty: "", rating: "0", quality_notes: "" });
      loadAll();
    } catch { alert("فشل تسجيل الاستلام"); }
    finally { setSubmitting(false); }
  };

  // ── Create request ────────────────────────────────────────────────────────────
  const createRequest = async () => {
    if (!reqForm.item_name || !reqForm.quantity) return alert("اسم الصنف والكمية مطلوبان");
    setSubmitting(true);
    try {
      await fetch("/api/purchase-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...reqForm, quantity: Number(reqForm.quantity), estimated_cost: Number(reqForm.estimated_cost) || 0, requested_by: user?.name }),
      });
      setNewRequest(false);
      setReqForm({ item_name: "", quantity: "", unit: "قطعة", reason: "", estimated_cost: "", supplier: "", vehicle_plate: "" });
      loadRequests();
    } catch { alert("فشل إرسال الطلب"); }
    finally { setSubmitting(false); }
  };

  // ── Save inventory ─────────────────────────────────────────────────────────────
  const saveInventory = async () => {
    if (!invForm.item_name) return alert("اسم القطعة مطلوب");
    setSubmitting(true);
    try {
      const url = editingItem ? `/api/workshop-inventory/${editingItem.id}` : "/api/workshop-inventory";
      await fetch(url, {
        method: editingItem ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...invForm, quantity: Number(invForm.quantity) || 0, min_stock: Number(invForm.min_stock) || 0, cost_per_unit: Number(invForm.cost_per_unit) || 0, created_by: user?.name || user?.phone, ...(editingItem ? { updated_by: user?.name || user?.phone } : {}) }),
      });
      setShowInvForm(false); setEditingItem(null);
      setInvForm({ item_name: "", item_code: "", category: "عام", quantity: "", unit: "قطعة", min_stock: "", cost_per_unit: "", supplier: "" });
      loadInventory();
    } catch { alert("فشل حفظ القطعة"); }
    finally { setSubmitting(false); }
  };

  // ── Excel Import ──────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewFile(file.name);
    try {
      const rows = await parseExcel(file);
      if (!rows.length) return alert("لم يتم العثور على صفوف بيانات في الملف");
      setPreviewRows(rows);
    } catch {
      alert("فشل قراءة الملف — تأكد أنه ملف إكسل صالح (.xlsx أو .xls)");
    }
    e.target.value = "";
  };

  const confirmImport = async () => {
    if (!previewRows?.length) return;
    setImporting(true);
    try {
      const res = await fetch("/api/purchase-invoices/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: previewRows, imported_by: user?.name }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || "فشل الاستيراد");
      setPreviewRows(null);
      setPreviewFile("");
      await loadInvoices();
      alert(`✅ تم استيراد ${data.inserted} سجل بنجاح`);
    } catch {
      alert("فشل الاستيراد — تحقق من الاتصال");
    }
    setImporting(false);
  };

  const savePastedInvoices = async (pasteRows: InvoicePasteRow[], requestKey: string) => {
    const payload: SupplierPurchaseInvoicePasteInput = {
      request_key: requestKey,
      rows: pasteRows.map(row => ({
        serial_no: row.serial_no.trim() || null,
        invoice_date: row.invoice_date.trim() || null,
        branch: row.branch.trim() || null,
        vehicle_plate: row.vehicle_plate.trim() || null,
        work_on: row.vehicle_plate.trim() === "مستودع الورشة" ? null : row.work_on,
        trailer_number: row.trailer_number.trim() || null,
        invoice_number: row.invoice_number.trim() || null,
        supplier_name: row.supplier_name.trim() || null,
        item_name: row.item_name.trim(),
        quantity: parseInvoicePasteAmount(row.quantity),
        price_before_vat: parseInvoicePasteAmount(row.price_before_vat),
        price_after_vat: parseInvoicePasteAmount(row.price_after_vat),
        discount_amount: parseInvoicePasteAmount(row.discount_amount),
        notes: row.notes.trim() || null,
      })),
    };

    let saved: SupplierPurchaseInvoicePasteResult;
    try {
      saved = await pasteInvoicesMutation.mutateAsync({ data: payload });
    } catch (error) {
      const failure = error as { message?: unknown; status?: unknown; data?: unknown };
      const status = Number(failure.status) || 0;
      const responseError = failure.data && typeof failure.data === "object"
        ? (failure.data as { error?: unknown; replayConflict?: unknown })
        : null;
      const message = typeof responseError?.error === "string"
        ? responseError.error
        : typeof failure.message === "string"
          ? failure.message
          : "فشل حفظ فواتير الموردين";
      if (status === 409 && responseError?.replayConflict === true) {
        throw Object.assign(
          new Error(`${message} راجع سجل الفواتير قبل بدء دفعة جديدة.`),
          { batchAlreadySaved: true },
        );
      }
      throw Object.assign(
        new Error(status >= 400 && status < 500 ? message : "تعذر تأكيد الحفظ. أعد المحاولة دون تعديل الصفوف."),
        status === 0 || status < 400 || status >= 500 ? { uncertain: true } : {},
      );
    }
    if (
      !saved.ok ||
      saved.inserted !== payload.rows.length ||
      !Array.isArray(saved.invoice_ids) ||
      !Array.isArray(saved.invoices) ||
      saved.invoices.length !== payload.rows.length ||
      saved.invoice_ids.some(id => !Number.isSafeInteger(id)) ||
      saved.invoices.some(invoice => !Number.isSafeInteger(invoice.id))
    ) {
      throw Object.assign(
        new Error("وصل رد غير مكتمل بعد الإرسال. أعد المحاولة دون تعديل الصفوف للتحقق من الحفظ."),
        { uncertain: true },
      );
    }

    const matchingRows = saved.invoices.filter(invoice =>
      (!invFilter.vehicle_plate || (invoice.vehicle_plate || "").toLowerCase().includes(invFilter.vehicle_plate.toLowerCase())) &&
      (!invFilter.supplier_name || (invoice.supplier_name || "").toLowerCase().includes(invFilter.supplier_name.toLowerCase())) &&
      (!invFilter.branch || (invoice.branch || "").toLowerCase().includes(invFilter.branch.toLowerCase()))
    );
    setInvoices(previous => {
      const byId = new Map(previous.map(invoice => [invoice.id, invoice]));
      matchingRows.forEach(invoice => byId.set(invoice.id, invoice));
      return [...byId.values()].sort((a, b) =>
        String(b.invoice_date || "").localeCompare(String(a.invoice_date || "")) || b.id - a.id
      );
    });
    setPasteInvoiceRequestKey(newInvoicePasteRequestKey());
    void loadInvoices();
    void loadSuppliers();
    if (saved.workshop_added_count > 0) void loadInventory();
    alert(
      `تم حفظ ${saved.inserted} سجل بنجاح` +
      (saved.workshop_added_count ? `، وإضافة ${saved.workshop_added_count} بند إلى مخزون الورشة` : ""),
    );
  };

  const deleteInvoice = async (id: number) => {
    if (!confirm("هل تريد حذف هذا السجل؟")) return;
    await fetch(`/api/purchase-invoices/${id}`, { method: "DELETE" });
    setInvoices(prev => prev.filter(i => i.id !== id));
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`هل تريد حذف ${selectedIds.size} سجل محدد؟`)) return;
    const ids = [...selectedIds];
    await fetch("/api/purchase-invoices/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setInvoices(prev => prev.filter(i => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
  };

  const clearAllInvoices = async () => {
    setClearing(true);
    try {
      await fetch("/api/purchase-invoices/clear", { method: "DELETE" });
      setInvoices([]);
      setSelectedIds(new Set());
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map(i => i.id)));
    }
  };

  const closeEditInvoice = () => {
    setEditingInvoice(null);
    setInvVehicleOpen(false);
    setInvVehicleQ("");
  };

  const openEditInvoice = (inv: PurchaseInvoice) => {
    setInvVehicleOpen(false);
    setInvVehicleQ("");
    setEditingInvoice(inv);
    setEditForm({
      serial_no:        inv.serial_no        ?? "",
      invoice_date:     inv.invoice_date     ?? "",
      branch:           inv.branch           ?? "",
      vehicle_plate:    inv.vehicle_plate    ?? "",
      work_on:          inv.work_on          ?? "",
      trailer_number:   inv.trailer_number   ?? "",
      invoice_number:   inv.invoice_number   ?? "",
      supplier_name:    inv.supplier_name    ?? "",
      supplier_id:      String(inv.supplier_id ?? ""),
      item_name:        inv.item_name,
      price_before_vat: String(inv.price_before_vat ?? ""),
      quantity:         String(inv.quantity          ?? ""),
      price_after_vat:  String(inv.price_after_vat  ?? ""),
      notes:            inv.notes            ?? "",
    });
  };

  const saveEditInvoice = async () => {
    if (!editingInvoice) return;
    if (!editForm.item_name.trim()) return alert("اسم قطعة الغيار مطلوب");
    if (editForm.work_on === "trailer" && !editForm.trailer_number.trim())
      return alert("اختر رقم التيدر الذي تخصه الفاتورة");
    setSubmitting(true);
    const invId = editingInvoice.id;
    const supplierSelectionChanged =
      editForm.supplier_id !== String(editingInvoice.supplier_id ?? "") ||
      editForm.supplier_name.trim() !== String(editingInvoice.supplier_name ?? "").trim();
    try {
      const res = await fetch(`/api/purchase-invoices/${invId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          ...(!supplierSelectionChanged ? { supplier_id: undefined } : {}),
          price_before_vat: Number(editForm.price_before_vat) || 0,
          quantity:         Number(editForm.quantity)          || 0,
          price_after_vat:  Number(editForm.price_after_vat)  || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || "فشل التعديل");
      if (!data.invoice || Number(data.invoice.id) !== invId)
        return alert("لم يؤكد الخادم حفظ التعديلات؛ بقيت الفاتورة مفتوحة");
      closeEditInvoice();
      setInvoices(prev => prev.map(i => i.id === invId ? data.invoice as PurchaseInvoice : i));
      if (supplierSelectionChanged) {
        void loadSuppliers().catch(error => console.error("Failed to refresh suppliers after invoice edit", error));
      }
    } catch { alert("فشل التعديل — تحقق من الاتصال"); }
    finally { setSubmitting(false); }
  };

  // ── Create invoice (multi-item) ───────────────────────────────────────────────
  const createInvoice = async () => {
    const validItems = invItems.filter(it => it.item_name.trim());
    if (validItems.length === 0) return alert("أدخل اسم صنف واحد على الأقل");
    if (!newInvForm.branch.trim()) return alert("اختيار الفرع مطلوب");
    if (newInvForm.vehicle_plate.trim() !== "مستودع الورشة" &&
        newInvForm.work_on === "vehicle" && !newInvForm.vehicle_plate.trim())
      return alert("اختر السيارة التي تخصها الفاتورة");
    if (newInvForm.vehicle_plate.trim() !== "مستودع الورشة" &&
        newInvForm.work_on === "trailer" && !newInvForm.trailer_number.trim())
      return alert("اختر رقم التيدر الذي تخصه الفاتورة");
    const selectedFleetVehicle = fleetVehicles.find(
      vehicle => vehicle.plate_number.trim().toLowerCase() === newInvForm.vehicle_plate.trim().toLowerCase()
    );
    if (selectedFleetVehicle && !selectedFleetVehicle.branch?.trim()) {
      return alert("هذه السيارة غير مرتبطة بفرع. حدّد فرعها أولًا من إدارة الأسطول");
    }
    setSubmitting(true);
    try {
      const grossTotals = validItems.map(it => (Number(it.quantity) || 0) * (Number(it.price_before_vat) || 0));
      const grossTotal = grossTotals.reduce((sum, amount) => sum + amount, 0);
      const requestedDiscount = Math.max(0, Number(invoiceDiscount) || 0);
      if (requestedDiscount > grossTotal) return alert("قيمة الخصم لا يمكن أن تتجاوز الإجمالي قبل الضريبة");
      let allocatedDiscount = 0;
      const discountShares = grossTotals.map((amount, index) => {
        if (requestedDiscount === 0 || grossTotal === 0) return 0;
        const share = index === grossTotals.length - 1
          ? Math.round((requestedDiscount - allocatedDiscount) * 100) / 100
          : Math.round((requestedDiscount * amount / grossTotal) * 100) / 100;
        allocatedDiscount += share;
        return share;
      });
      const results = await Promise.all(validItems.map((it, index) => {
        const quantity = Number(it.quantity) || 0;
        const netLineBeforeVat = Math.max(0, grossTotals[index] - discountShares[index]);
        const netUnitBeforeVat = quantity > 0 ? netLineBeforeVat / quantity : 0;
        const netUnitAfterVat = Math.round(netUnitBeforeVat * 1.15 * 10000) / 10000;
        return (
        fetch("/api/purchase-invoices", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...newInvForm,
            item_name:       it.item_name,
            price_before_vat: netUnitBeforeVat,
            quantity,
            price_after_vat: netUnitAfterVat,
            discount_amount: discountShares[index],
            imported_by: user?.name,
          }),
        }).then(async r => ({ ok: r.ok, data: await r.json() }))
        );
      }));
      const errResult = results.find(result => !result.ok || result.data.error || !result.data.invoice?.id);
      if (errResult) {
        await loadInvoices();
        return alert(errResult.data.error || "لم يؤكد الخادم حفظ جميع الفواتير؛ بقي النموذج مفتوحًا");
      }
      const savedInvoices = results.map(result => result.data.invoice as PurchaseInvoice);
      const anyWorkshop = results.some(result => result.data.workshopAdded);
      setInvResult({ workshopAdded: anyWorkshop, workshopItemName: results.find(result => result.data.workshopAdded)?.data.workshopItemName || "" });
      setNewInvOpen(false);
      setNewInvForm({ serial_no: "", invoice_date: new Date().toISOString().split("T")[0], branch: "", vehicle_plate: "", work_on: "vehicle", trailer_number: "", invoice_number: "", supplier_name: "", supplier_id: "", notes: "" });
      setInvItems([mkInvItem()]);
      setInvoiceDiscount("");
      setInvoices(prev => [...savedInvoices, ...prev.filter(invoice => !savedInvoices.some(saved => saved.id === invoice.id))]);
      await loadSuppliers();
      if (anyWorkshop) await loadInventory();
    } catch { alert("فشل الإضافة — تحقق من الاتصال"); }
    finally { setSubmitting(false); }
  };

  // ── Submit Returns ────────────────────────────────────────────────────────────
  const submitReturn = async () => {
    if (returnSels.size === 0) return alert("اختر صنفاً واحداً على الأقل");
    const items: { invoice_id: number; invoice_number: string | null; supplier_name: string | null; item_name: string; return_quantity: number; reason: string; vehicle_plate: string | null }[] = [];
    for (const [invId, { qty, reason }] of returnSels.entries()) {
      const inv = invoices.find(i => i.id === invId);
      if (!inv) continue;
      const rQty = Number(qty);
      if (rQty <= 0) return alert(`كمية الإرجاع يجب أن تكون أكبر من صفر للصنف: ${inv.item_name}`);
      items.push({ invoice_id: invId, invoice_number: inv.invoice_number ?? null, supplier_name: inv.supplier_name ?? null, item_name: inv.item_name, return_quantity: rQty, reason, vehicle_plate: inv.vehicle_plate ?? null });
    }
    setReturnSubmitting(true);
    try {
      const res = await fetch("/api/purchase-invoice-returns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, returned_by: user?.name }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || "فشل الإرجاع");
      setReturnDone(`✅ تم إرجاع ${items.length} صنف بنجاح`);
      setReturnSels(new Map());
      setTimeout(() => { setReturnOpen(false); setReturnDone(null); setReturnQ(""); }, 2000);
    } catch { alert("فشل الإرجاع — تحقق من الاتصال"); }
    finally { setReturnSubmitting(false); }
  };

  // ── Custody: Create Claim ────────────────────────────────────────────────────
  const createClaim = async () => {
    if (selIds.size === 0) return;
    setClaimSubmitting(true);
    try {
      const selected = unclaimedInvs.filter(invoice => selIds.has(invoice.id));
      const byBranch = new Map<string, number[]>();
      for (const invoice of selected) {
        const branch = invoice.branch?.trim() || "بدون فرع";
        byBranch.set(branch, [...(byBranch.get(branch) || []), invoice.id]);
      }
      const created: { id: number; claim_number: string; sequence_no: number }[] = [];
      for (const invoiceIds of byBranch.values()) {
        const res = await fetch("/api/supplier-reimbursement-claims", {
          method: "POST", headers: claimRequestHeaders(),
          body: JSON.stringify({ invoice_ids: invoiceIds, notes: claimNotes, created_by: user?.name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل إنشاء الكشف");
        created.push(data);
      }
      setSelIds(new Set());
      setClaimNotes("");
      await Promise.all([loadUnclaimedInvs(), loadCustodyClaims()]);
      if (created.length > 0) {
        setClaimSuccess({ ...created[0], count: created.length, ids: created.map(claim => claim.id) });
        setExpandedClaim(created[0].id);
      }
    } catch (error) { alert(error instanceof Error ? error.message : "فشل الاتصال"); }
    finally { setClaimSubmitting(false); }
  };

  const toggleClaim = async (claimId: number) => {
    if (expandedClaim === claimId) { setExpandedClaim(null); return; }
    setExpandedClaim(claimId);
    if (!claimItems[claimId]) {
      try {
        const response = await fetch(`/api/supplier-reimbursement-claims/${claimId}/invoices`);
        const items = await response.json();
        if (!response.ok) throw new Error(items.error || "تعذر تحميل فواتير الكشف");
        setClaimItems(prev => ({ ...prev, [claimId]: Array.isArray(items) ? items : [] }));
      } catch (error) {
        setExpandedClaim(null);
        alert(error instanceof Error ? error.message : "تعذر تحميل فواتير الكشف");
      }
    }
  };

  const updateDriverSignatureSetting = async (claim: SupplierClaim, includeDriverSignatures: boolean) => {
    try {
      const response = await fetch(`/api/supplier-reimbursement-claims/${claim.id}/signature-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include_driver_signatures: includeDriverSignatures }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return alert(data.error || "تعذر حفظ خيار توقيعات السائقين");
      setCustodyClaims(previous => previous.map(item =>
        item.id === claim.id ? { ...item, include_driver_signatures: includeDriverSignatures ? 1 : 0 } : item
      ));
    } catch {
      alert("تعذر الاتصال بالخادم لحفظ خيار التوقيعات");
    }
  };

  const cancelClaim = async (claim: SupplierClaim) => {
    if (!confirm(`إلغاء الكشف رقم ${claimSequenceLabel(claim.sequence_no, claim.id)} وإعادة فواتيره لقائمة غير المطبوعة؟ سيبقى رقم الكشف وسجله محفوظين.`)) return;
    const response = await fetch(`/api/supplier-reimbursement-claims/${claim.id}/cancel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelled_by: user?.name }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return alert(data.error || "تعذر إلغاء الكشف");
    setExpandedClaim(null);
    await Promise.all([loadUnclaimedInvs(), loadCustodyClaims()]);
    alert(`تم إلغاء الكشف وإعادة ${data.released_count || 0} فاتورة إلى قائمة غير المطبوعة.`);
  };

  const cancelClaimPrint = async (claim: SupplierClaim) => {
    if (!confirm(`إلغاء حالة طباعة الكشف رقم ${claimSequenceLabel(claim.sequence_no, claim.id)} وإرجاعه لغير مطبوع؟ سيبقى الكشف وفواتيره وسجل الطباعة كما هي.`)) return;
    try {
      const response = await fetch(`/api/supplier-reimbursement-claims/${claim.id}/cancel-print`, {
        method: "PATCH",
        headers: claimRequestHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return alert(data.error || "تعذر إلغاء حالة الطباعة");
      if (!data.ok || !data.claim || Number(data.claim.is_printed) !== 0) {
        return alert("لم يؤكد الخادم إلغاء حالة الطباعة");
      }
      setExpandedClaim(null);
      await Promise.all([loadCustodyClaims(), loadPrintedCustodyClaims()]);
      alert("تم إرجاع الكشف إلى غير مطبوع. بقي الكشف وفواتيره وسجل الطباعة محفوظاً.");
    } catch {
      alert("تعذر الاتصال بالخادم لإلغاء حالة الطباعة");
    }
  };

  const printAllClaims = async (
    claimsToPrint: SupplierClaim[] = custodyClaims,
    options: { mode?: "original" | "reprint"; openedWindow?: Window } = {},
  ) => {
    if (printingClaims) { options.openedWindow?.close(); return; }
    const isReprint = options.mode === "reprint";
    const printableClaims = claimsToPrint.filter(claim =>
      isReprint
        ? Number(claim.is_printed)
        : !Number(claim.is_printed) && !Number(claim.is_cancelled)
    );
    if (printableClaims.length === 0) {
      options.openedWindow?.close();
      return alert(isReprint ? "لا توجد كشوف مطبوعة لإعادة طباعتها" : "لا توجد كشوف غير مطبوعة");
    }
    const w = options.openedWindow || window.open("", "_blank", "width=900,height=700");
    if (!w) return alert("اسمح بفتح النوافذ المنبثقة لإكمال الطباعة");
    setPrintingClaims(true);
    w.document.write("<html dir='rtl' lang='ar'><body style='font-family:Arial;padding:24px'>جارٍ تجهيز الكشوف للطباعة...</body></html>");

    let printActionRecorded = false;
    try {
    const fmt = (n: number) => Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) + " ر.س";
    const escapePrintText = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    })[character] || character);
    const logoUrl = `${window.location.origin}/jefer-logo-new.png`;
    const allItems: Record<number, any[]> = { ...claimItems };
    await Promise.all(printableClaims.filter(claim => !allItems[claim.id]).map(async claim => {
      const response = await fetch(`/api/supplier-reimbursement-claims/${claim.id}/invoices`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `تعذر تحميل فواتير الكشف ${claimSequenceLabel(claim.sequence_no, claim.id)}`);
      if (!Array.isArray(data)) throw new Error("استجابة فواتير الكشف غير صحيحة");
      allItems[claim.id] = data;
    }));
    setClaimItems(prev => ({ ...prev, ...allItems }));

    let reservedClaims: SupplierClaim[];
    if (isReprint) {
      const results = await Promise.all(printableClaims.map(async claim => {
        const response = await fetch(`/api/supplier-reimbursement-claims/${claim.id}/reprint`, {
          method: "POST",
          headers: claimRequestHeaders(),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "تعذرت إعادة طباعة الكشف");
        if (!data.claim || !data.event?.actor_name) throw new Error("لم يتم تأكيد تسجيل إعادة الطباعة");
        return data.claim as SupplierClaim;
      }));
      reservedClaims = results;
      printActionRecorded = results.length > 0;
    } else {
      const reservationResponse = await fetch("/api/supplier-reimbursement-claims/mark-printed", {
        method: "POST",
        headers: claimRequestHeaders(),
        body: JSON.stringify({ ids: printableClaims.map(claim => claim.id) }),
      });
      const reservation = await reservationResponse.json().catch(() => ({}));
      if (!reservationResponse.ok) throw new Error(reservation.error || "تعذر تسجيل طباعة الكشوف");
      reservedClaims = Array.isArray(reservation.claims) ? reservation.claims as SupplierClaim[] : [];
      if (reservedClaims.length !== printableClaims.length) throw new Error("لم يتم تأكيد طباعة جميع الكشوف");
      printActionRecorded = true;
    }

    const claimBlocks = reservedClaims.map((claim, ci) => {
      const rows: any[] = allItems[claim.id] || [];
      const letterhead = buildCompanyLetterheadHtml(logoUrl);
      return `
<div class="claim-page" style="${ci > 0 ? "page-break-before:always" : ""}">
${letterhead}
<div class="claim-title">
  <div><strong>كشف استعاضة عهدة دائمة للموظف</strong></div>
  <div class="meta">
    <h2>رقم الكشف ${claimSequenceLabel(claim.sequence_no, claim.id)}</h2>
    <p>المرجع: ${escapePrintText(claim.claim_number)}</p>
    <p>الفرع: ${escapePrintText(claim.branch || "بدون فرع")}</p>
    <p>التاريخ: ${escapePrintText((claim.created_at || "").slice(0, 16).replace("T", " "))}</p>
    <p>اسم الموظف الذي أعدّ الكشف: ${escapePrintText(claim.created_by || "—")}</p>
    <p>طُبع أول مرة بواسطة: ${escapePrintText(claim.original_printed_by || "غير مسجل في سجل الطباعة السابق")}</p>
    <p>عدد الفواتير: ${rows.length}</p>
  </div>
</div>
${claim.notes ? `<div class="notes-box">ملاحظة: ${claim.notes}</div>` : ""}
<table>
  <thead><tr>
    <th>م</th><th>التاريخ</th><th>الفرع</th><th>السيارة</th><th>رقم الفاتورة</th><th>المورد</th>
    <th>بيان الصنف</th><th style="text-align:center">الكمية</th><th>سعر الوحدة غير شامل الضريبة</th><th>سعر الوحدة شامل الضريبة</th>
    <th>الإجمالي غير شامل الضريبة</th><th>الإجمالي شامل الضريبة</th>
    <th>ملاحظة</th>
  </tr></thead>
  <tbody>
    ${rows.map((item, i) => `
    <tr>
      <td style="text-align:center;color:#333;font-weight:700">${item.serial_no || i + 1}</td>
      <td>${item.invoice_date || "—"}</td>
      <td>${item.branch || "—"}</td>
      <td>${item.vehicle_plate || "—"}</td>
      <td style="font-family:monospace">${item.invoice_number || "—"}</td>
      <td>${item.supplier_name || "—"}</td>
      <td><strong>${item.item_name}</strong></td>
      <td style="text-align:center">${item.quantity || 0}</td>
      <td style="text-align:left">${fmt(item.price_before_vat || 0)}</td>
      <td style="text-align:left">${fmt(item.price_after_vat || 0)}</td>
      <td style="text-align:left">${fmt((item.quantity || 0) * (item.price_before_vat || 0))}</td>
      <td style="text-align:left">${fmt((item.quantity || 0) * (item.price_after_vat || 0))}</td>
      <td>${item.notes || "—"}</td>
    </tr>`).join("")}
  </tbody>
  <tfoot><tr>
    <td colspan="10" style="text-align:right">المجاميع</td>
    <td style="text-align:left">${fmt(claim.total_before_vat)}</td>
    <td style="text-align:left">${fmt(claim.total_after_vat)}</td>
    <td></td>
  </tr></tfoot>
</table>
<div class="sigs">
  <div class="sig">توقيع معدّ الكشف<br/><br/>${escapePrintText(claim.created_by || "_______________")}</div>
  <div class="sig">توقيع مشرف الورشة<br/><br/>_______________</div>
  <div class="sig">توقيع مشرف النقليات<br/><br/>_______________</div>
  <div class="sig">توقيع المحاسب<br/><br/>_______________</div>
</div>
${claimDriverSignatureHtml(claim, rows)}
</div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"/><title>${isReprint ? "إعادة طباعة كشوف العهدة" : "كشوفات العهدة"}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;padding:28px 32px;color:#111;font-size:13px}
${COMPANY_LETTERHEAD_PRINT_CSS}
.claim-title{display:flex;justify-content:space-between;align-items:flex-start;background:#f0f4ff;border:1px solid #c7d6f5;border-radius:6px;padding:8px 14px;margin:8px 0 18px}
.meta{text-align:left}
.meta h2{font-size:15px;font-weight:900;margin-bottom:4px}
.meta p{font-size:12px;color:#333;font-weight:600;margin-bottom:2px}
.notes-box{background:#f0f9ff;border-right:4px solid #0e7490;padding:8px 14px;border-radius:4px;margin-bottom:18px;font-size:12px;color:#444}
table{width:100%;border-collapse:collapse;margin-bottom:10px;table-layout:fixed;page-break-inside:auto}
thead{display:table-header-group}tfoot{display:table-footer-group}
tr{page-break-inside:avoid;break-inside:avoid}
th{background:#0e7490;color:#fff;font-weight:900;padding:6px 3px;text-align:center;font-size:8.5px;white-space:normal;overflow-wrap:anywhere;line-height:1.35;border:1px solid #07566c}
td{padding:5px 3px;border:1px solid #9ca3af;font-size:8.5px;font-weight:600;overflow-wrap:anywhere;vertical-align:middle;line-height:1.4}
th:nth-child(1),td:nth-child(1){width:3%}th:nth-child(2),td:nth-child(2){width:7%}
th:nth-child(3),td:nth-child(3){width:6%}th:nth-child(4),td:nth-child(4){width:6%}
th:nth-child(5),td:nth-child(5){width:7%}th:nth-child(6),td:nth-child(6){width:9%}
th:nth-child(7),td:nth-child(7){width:10%}th:nth-child(8),td:nth-child(8){width:5%}
th:nth-child(9),td:nth-child(9),th:nth-child(10),td:nth-child(10){width:9%}
th:nth-child(11),td:nth-child(11),th:nth-child(12),td:nth-child(12){width:10%}
th:nth-child(13),td:nth-child(13){width:9%}
tr:nth-child(even) td{background:#f9fafb}
tfoot td{background:#e0f2fe;font-weight:900;border-top:2px solid #0e7490;font-size:13px}
.sigs{display:flex;gap:22px;margin-top:24px;margin-bottom:12px;page-break-inside:avoid;break-inside:avoid}
.sig{flex:1;text-align:center;padding-top:8px;border-top:2px solid #555;font-size:12px;color:#333;font-weight:600}
.driver-signatures{margin-top:18px;page-break-inside:avoid;break-inside:avoid}
.driver-signatures h3{font-size:13px;margin-bottom:10px}
.driver-signature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.driver-signature{display:flex;flex-wrap:wrap;gap:12px;border:1px solid #9ca3af;padding:10px;font-size:11px}
.claim-page{position:relative;width:100%}
@page{size:A4 portrait;margin:9mm}html,body{width:auto;max-width:192mm;margin:0 auto;padding:0}@media print{button{display:none}}
</style></head>
<body>${claimBlocks}
<script>window.onload=()=>{window.print()}</script>
</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    } catch (error) {
      w.close();
      alert(error instanceof Error ? error.message : "تعذر تجهيز الكشوف للطباعة");
    } finally {
      setPrintingClaims(false);
      if (printActionRecorded) {
        void Promise.all([loadCustodyClaims(), loadPrintedCustodyClaims(), loadInvoices()]);
      }
    }
  };

  const printClaim = (claim: SupplierClaim, reprint = false) => {
    if (!reprint) return printAllClaims([claim]);
    const openedWindow = window.open("", "_blank", "width=900,height=700");
    if (!openedWindow) return alert("اسمح بفتح النوافذ المنبثقة لإكمال إعادة الطباعة");
    void printAllClaims([claim], { mode: "reprint", openedWindow });
  };

  const createAndPrintSelectedInvoices = async () => {
    if (!canManageSupplierClaims || claimSubmitting || printingClaims) return;
    const selectedInvoices = invoices.filter(invoice =>
      claimInvoiceSelIds.has(invoice.id) && !Number(invoice.reimbursement_claim_id)
    );
    if (selectedInvoices.length === 0) return alert("حدد فواتير غير مدرجة في كشف");
    const openedWindow = window.open("", "_blank", "width=900,height=700");
    if (!openedWindow) return alert("اسمح بفتح النوافذ المنبثقة لإكمال الطباعة");
    openedWindow.document.write("<html dir='rtl' lang='ar'><body style='font-family:Arial;padding:24px'>جارٍ إنشاء كشوف الفروع وتجهيز الطباعة...</body></html>");
    setClaimSubmitting(true);
    let claimsCreated = false;
    try {
      const response = await fetch("/api/supplier-reimbursement-claims/bulk", {
        method: "POST",
        headers: claimRequestHeaders(),
        body: JSON.stringify({ invoice_ids: selectedInvoices.map(invoice => invoice.id) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذر إنشاء كشوف الفواتير");
      const createdClaims = Array.isArray(data.claims) ? data.claims as SupplierClaim[] : [];
      if (createdClaims.length === 0) throw new Error("لم يؤكد الخادم إنشاء أي كشف");
      claimsCreated = true;
      setClaimInvoiceSelIds(new Set());
      await printAllClaims(createdClaims, { openedWindow });
    } catch (error) {
      openedWindow.close();
      alert(error instanceof Error ? error.message : "تعذر إنشاء كشوف الفواتير");
    } finally {
      setClaimSubmitting(false);
      if (claimsCreated) {
        void Promise.all([loadInvoices(), loadCustodyClaims(), loadPrintedCustodyClaims()]);
      }
    }
  };

  const renderClaimDetails = (claim: SupplierClaim) => (
    <div className="bg-gray-50 border-t border-gray-100 px-3 sm:px-5 py-3">
      <div className={`mb-3 rounded-lg px-3 py-2 text-xs font-bold ${
        Number(claim.is_cancelled) ? "bg-red-50 text-red-700" :
        Number(claim.is_printed) ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
      }`}>
        {Number(claim.is_cancelled)
          ? `أُلغي الكشف رقم ${claimSequenceLabel(claim.sequence_no, claim.id)} — الفواتير عادت إلى قائمة غير المطبوعة`
          : Number(claim.is_printed)
            ? `هذه الفواتير طُبعت في الكشف رقم ${claimSequenceLabel(claim.sequence_no, claim.id)}`
            : `كشف غير مطبوع رقم ${claimSequenceLabel(claim.sequence_no, claim.id)}`}
      </div>
      {!claimItems[claim.id] ? (
        <p className="text-xs text-gray-400 py-2 text-center">جاري التحميل…</p>
      ) : claimItems[claim.id].length === 0 ? (
        <p className="text-xs text-gray-400 py-2 text-center">لا توجد فواتير</p>
      ) : (
        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-xs min-w-[1400px]">
            <thead>
              <tr className="text-gray-400 font-semibold">
                <th className="text-center pb-2">م</th>
                <th className="text-right pb-2">التاريخ</th>
                <th className="text-right pb-2">الفرع</th>
                <th className="text-right pb-2">السيارة</th>
                <th className="text-right pb-2">رقم الفاتورة</th>
                <th className="text-right pb-2">المورد</th>
                <th className="text-right pb-2">الصنف</th>
                <th className="text-center pb-2">الكمية</th>
                <th className="text-right pb-2">سعر قبل الضريبة</th>
                <th className="text-right pb-2">سعر بعد الضريبة</th>
                <th className="text-right pb-2 text-amber-600">إجمالي قبل الضريبة</th>
                <th className="text-right pb-2 text-[#103c68]">إجمالي بعد الضريبة</th>
                <th className="text-right pb-2">ملاحظة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claimItems[claim.id].map(item => (
                <tr key={item.id}>
                  <td className="py-2 text-center text-gray-400">{item.serial_no || item.id}</td>
                  <td className="py-2 text-gray-500">{item.invoice_date || "—"}</td>
                  <td className="py-2">{item.branch || "—"}</td>
                  <td className="py-2 font-semibold">{item.vehicle_plate || "—"}</td>
                  <td className="py-2 font-mono">{item.invoice_number || "—"}</td>
                  <td className="py-2">{item.supplier_name || "—"}</td>
                  <td className="py-2 font-semibold text-gray-800">{item.item_name}</td>
                  <td className="py-2 text-center">{item.quantity || 0}</td>
                  <td className="py-2">{item.price_before_vat > 0 ? sar(item.price_before_vat) : "—"}</td>
                  <td className="py-2">{item.price_after_vat > 0 ? sar(item.price_after_vat) : "—"}</td>
                  <td className="py-2 font-bold text-amber-700">{sar((item.quantity || 0) * (item.price_before_vat || 0))}</td>
                  <td className="py-2 font-bold text-[#103c68]">{sar((item.quantity || 0) * (item.price_after_vat || 0))}</td>
                  <td className="py-2 text-gray-500 max-w-[180px] truncate">{item.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200">
              <tr>
                <td colSpan={10} className="pt-2 font-bold text-gray-600 text-left">المجموع</td>
                <td className="pt-2 font-black text-amber-700">{sar(claim.total_before_vat)}</td>
                <td className="pt-2 font-black text-[#103c68]">{sar(claim.total_after_vat)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );

  const renderClaimRows = (claims: SupplierClaim[], archive = false) => (
    <div className="divide-y divide-gray-50">
      {claims.map(claim => (
        <div key={claim.id}>
          <div className="px-3 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
            <div className="flex flex-col gap-0.5 cursor-pointer min-w-0 flex-1" onClick={() => void toggleClaim(claim.id)}>
              <span className="font-black text-gray-900 text-sm flex items-center gap-2 flex-wrap">
                <span>كشف رقم {claimSequenceLabel(claim.sequence_no, claim.id)}</span>
                {claimSuccess?.id === claim.id && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">جديد</span>}
                {Number(claim.is_cancelled)
                  ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">ملغي</span>
                  : Number(claim.is_printed)
                    ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">مطبوع</span>
                    : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">غير مطبوع</span>}
                {archive && Number(claim.is_printed) && (
                  <span className="text-xs text-gray-400" data-testid={`text-original-print-${claim.id}`}>
                    طُبع أول مرة {claim.printed_at?.slice(0, 16).replace("T", " ") || ""} بواسطة {claim.original_printed_by || "غير مسجل (كشف سابق)"}
                  </span>
                )}
              </span>
              <span className="text-xs text-gray-400">
                {claim.created_at?.slice(0, 16).replace("T", " ")} — فرع: {claim.branch || "بدون فرع"} — {claim.invoice_count} فاتورة
                {claim.claim_number && <span> — المرجع: {claim.claim_number}</span>}
              </span>
              {Number(claim.is_cancelled) && claim.cancelled_at && (
                <span className="text-xs text-red-500">تاريخ الإلغاء: {claim.cancelled_at.slice(0, 16).replace("T", " ")}</span>
              )}
              {claim.notes && <span className="text-xs text-gray-400 italic">{claim.notes}</span>}
              {archive && claim.last_reprinted_by && (
                <span className="text-xs font-semibold text-cyan-700" data-testid={`text-last-reprint-${claim.id}`}>
                  آخر إعادة طباعة بواسطة {claim.last_reprinted_by}
                  {claim.last_reprinted_at ? ` — ${claim.last_reprinted_at.slice(0, 16).replace("T", " ")}` : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto flex-wrap">
              <div className="text-right whitespace-nowrap">
                <p className="text-xs font-bold text-amber-700">{sar(claim.total_before_vat)}</p>
                <p className="text-xs font-bold text-[#103c68]">{sar(claim.total_after_vat)}</p>
              </div>
              {!archive && !Number(claim.is_printed) && !Number(claim.is_cancelled) && (
                <label
                  onClick={event => event.stopPropagation()}
                  className="flex items-center gap-1 text-[11px] text-gray-600 whitespace-nowrap cursor-pointer"
                  title="إضافة خانات توقيع للسائقين عند طباعة هذا الكشف"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(Number(claim.include_driver_signatures))}
                    onChange={event => void updateDriverSignatureSetting(claim, event.target.checked)}
                    className="accent-cyan-600"
                  />
                  توقيع السائقين
                </label>
              )}
              {!archive && !Number(claim.is_printed) && !Number(claim.is_cancelled) && (
                <button
                  disabled={printingClaims}
                  onClick={event => { event.stopPropagation(); void printClaim(claim); }}
                  title="طباعة الكشف مرة واحدة"
                  data-testid={`button-print-claim-${claim.id}`}
                  className="p-2 rounded-lg text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors disabled:opacity-40">
                  <Printer size={15} />
                </button>
              )}
              {archive && canManageSupplierClaims && Number(claim.is_printed) && (
                <button
                  disabled={printingClaims}
                  onClick={event => { event.stopPropagation(); void printClaim(claim, true); }}
                  title="إعادة طباعة الكشف مع علامة توضح حساب المدير"
                  data-testid={`button-reprint-claim-${claim.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-cyan-700 bg-cyan-50 hover:bg-cyan-100 transition-colors disabled:opacity-40 text-xs font-bold">
                  <Printer size={14} /> إعادة طباعة
                </button>
              )}
              {archive && !canManageSupplierClaims && Number(claim.is_printed) && !Number(claim.is_cancelled) && (
                <button
                  disabled={printingClaims}
                  onClick={event => { event.stopPropagation(); void cancelClaimPrint(claim); }}
                  title="إلغاء حالة الطباعة فقط وإرجاع الكشف لغير مطبوع"
                  data-testid={`button-cancel-print-claim-${claim.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-40 text-xs font-bold">
                  <RotateCcw size={14} /> إلغاء الطباعة
                </button>
              )}
              {!archive && !Number(claim.is_cancelled) && (
                <button
                  onClick={event => { event.stopPropagation(); void cancelClaim(claim); }}
                  title="إلغاء الكشف وإعادة فواتيره إلى قائمة غير المطبوعة"
                  data-testid={`button-cancel-claim-${claim.id}`}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                  <XCircle size={15} />
                </button>
              )}
              <div className="cursor-pointer p-1" onClick={() => void toggleClaim(claim.id)}>
                <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${expandedClaim === claim.id ? "rotate-180" : ""}`} />
              </div>
            </div>
          </div>
          {expandedClaim === claim.id && renderClaimDetails(claim)}
        </div>
      ))}
    </div>
  );

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const pendingCount  = requests.filter(r => r.status === "pending").length;
  const approvedCount = requests.filter(r => r.status === "approved").length;
  const lowStock      = inventory.filter(i => i.quantity <= i.min_stock).length;

  const displayedRequests = rFilter === "all" ? requests : requests.filter(r => r.status === rFilter);
  const unprintedClaims = custodyClaims.filter(claim => !Number(claim.is_printed) && !Number(claim.is_cancelled));
  const claimableInvoices = invoices.filter(invoice => !Number(invoice.reimbursement_claim_id));

  const exportInvoicesToExcel = () => {
    if (invoices.length === 0) return alert("لا توجد فواتير لتصديرها");
    const exportRows = invoices.map((invoice, index) => ({
      "م": index + 1,
      "التاريخ": invoice.invoice_date || "",
      "الفرع": invoice.branch || "",
      "السيارة": invoice.vehicle_plate || "",
      "رقم الفاتورة": invoice.invoice_number || "",
      "المورد": invoice.supplier_name || "",
      "الصنف / قطعة الغيار": invoice.item_name,
      "الكمية": invoice.quantity,
      "سعر الوحدة قبل الضريبة": invoice.price_before_vat,
      "سعر الوحدة بعد الضريبة": invoice.price_after_vat,
      "مبلغ الخصم": invoice.discount_amount || 0,
      "الإجمالي بدون الضريبة": invoice.quantity * invoice.price_before_vat,
      "الإجمالي شامل الضريبة": invoice.quantity * invoice.price_after_vat,
      "ملاحظات": invoice.notes || "",
      "مدخل الفاتورة": invoice.imported_by || "",
    }));
    exportRows.push({
      "م": 0,
      "التاريخ": "",
      "الفرع": "",
      "السيارة": "",
      "رقم الفاتورة": "",
      "المورد": "الإجمالي",
      "الصنف / قطعة الغيار": "",
      "الكمية": totalQty,
      "سعر الوحدة قبل الضريبة": 0,
      "سعر الوحدة بعد الضريبة": 0,
      "مبلغ الخصم": totalDiscount,
      "الإجمالي بدون الضريبة": totalBeforeVat,
      "الإجمالي شامل الضريبة": totalAfterVat,
      "ملاحظات": "",
      "مدخل الفاتورة": "",
    });
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = [
      { wch: 7 }, { wch: 13 }, { wch: 18 }, { wch: 15 }, { wch: 18 },
      { wch: 24 }, { wch: 30 }, { wch: 12 }, { wch: 22 }, { wch: 22 },
      { wch: 16 }, { wch: 23 }, { wch: 23 }, { wch: 30 }, { wch: 20 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "فواتير الموردين");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `سجل-فواتير-الموردين-${date}.xlsx`);
  };

  // Invoice aggregates
  const totalBeforeVat = invoices.reduce((s, i) => s + i.quantity * i.price_before_vat, 0);
  const totalAfterVat  = invoices.reduce((s, i) => s + i.quantity * i.price_after_vat, 0);
  const totalDiscount  = invoices.reduce((s, i) => s + (i.discount_amount || 0), 0);
  const totalQty       = invoices.reduce((s, i) => s + i.quantity, 0);
  const draftGrossBeforeVat = invItems.filter(i => i.item_name.trim()).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price_before_vat) || 0), 0
  );
  const draftDiscount = Math.min(draftGrossBeforeVat, Math.max(0, Number(invoiceDiscount) || 0));
  const draftNetBeforeVat = Math.max(0, draftGrossBeforeVat - draftDiscount);
  const draftVat = draftNetBeforeVat * 0.15;
  const draftTotalAfterVat = draftNetBeforeVat + draftVat;

  return (
    <div dir="rtl" className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShoppingBag size={24} className="text-cyan-600" />المشتريات
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">إدارة طلبات الشراء ومستودع الورشة وفواتير الموردين</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />تحديث
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "بانتظار الموافقة", val: pendingCount,    color: "bg-yellow-500", Icon: Clock },
          { label: "موافق عليها",      val: approvedCount,   color: "bg-blue-500",   Icon: CheckCircle },
          { label: "فواتير مستوردة",   val: invoices.length, color: "bg-cyan-600",   Icon: FileSpreadsheet },
          { label: "مخزون منخفض",     val: lowStock,        color: "bg-red-500",    Icon: AlertTriangle },
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
      <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl w-fit flex-wrap">
        {([
          { id: "requests",  label: "طلبات الشراء",   count: pendingCount,    Icon: ShoppingBag },
          { id: "inventory", label: "مستودع الورشة",   count: lowStock,        Icon: Boxes },
          { id: "invoices",  label: "فواتير الموردين", count: 0,               Icon: FileSpreadsheet },
          { id: "suppliers", label: "الموردون",         count: 0,               Icon: Truck },
          { id: "custody",   label: "عهدتي",           count: 0,               Icon: Briefcase },
          { id: "returns",   label: "المرتجعات",        count: 0,               Icon: RotateCcw },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${tab === t.id ? "bg-white text-cyan-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <t.Icon size={14} />
            {t.label}
            {t.count > 0 && <span className="text-xs font-black px-1.5 rounded-full bg-red-100 text-red-700">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── TAB: REQUESTS ────────────────────────────────────────────────────── */}
      {tab === "requests" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl flex-wrap">
              {([
                { id: "pending",  label: "بانتظار الموافقة" },
                { id: "approved", label: "موافق عليها" },
                { id: "received", label: "مستلمة" },
                { id: "all",      label: "الكل" },
              ] as const).map(f => (
                <button key={f.id} onClick={() => setRFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all
                    ${rFilter === f.id ? "bg-white text-cyan-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <button onClick={() => setNewRequest(true)}
              className="flex items-center gap-1.5 bg-cyan-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-cyan-700 transition-colors">
              <Plus size={14} />طلب شراء جديد
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><RefreshCw size={22} className="animate-spin text-cyan-600" /></div>
          ) : displayedRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <ShoppingBag size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="font-semibold text-gray-500">لا توجد طلبات شراء</p>
            </div>
          ) : (
            displayedRequests.map(req => (
              <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-gray-500" />
                    <span className="font-bold text-gray-800">{req.item_name}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLE[req.status]}`}>
                      {STATUS_LABEL[req.status]}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{fmt(req.created_at)}</span>
                </div>
                <div className="p-5 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-gray-400 block text-xs">الكمية</span><span className="font-bold">{req.quantity} {req.unit}</span></div>
                    <div><span className="text-gray-400 block text-xs">طلب من</span><span className="font-bold">{req.requested_by}</span></div>
                    <div><span className="text-gray-400 block text-xs">التكلفة المقدرة</span><span className="font-bold">{sar(req.estimated_cost)}</span></div>
                    {req.actual_cost > 0 && <div><span className="text-gray-400 block text-xs">التكلفة الفعلية</span><span className="font-bold text-green-700">{sar(req.actual_cost)}</span></div>}
                  </div>
                  {req.vehicle_plate && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 w-fit">
                      <Truck size={11} />
                      <span className="font-bold">{req.vehicle_plate}</span>
                    </div>
                  )}
                  {req.reason && <div className="bg-gray-50 rounded-xl px-4 py-2.5 text-sm text-gray-600">{req.reason}</div>}
                  {req.supplier && <div className="text-xs text-gray-500">المورّد: <span className="font-semibold">{req.supplier}</span></div>}
                  {req.rejection_reason && (
                    <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 text-sm text-red-700">
                      <span className="font-bold">سبب الرفض: </span>{req.rejection_reason}
                    </div>
                  )}
                  {req.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => { setApproving(req); setApproveForm({ actual_cost: String(req.estimated_cost || ""), supplier: req.supplier || "", supplier_id: String(req.supplier_id || "") }); }}
                        className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold text-sm transition-colors">
                        <CheckCircle size={14} className="inline ml-1" />موافقة
                      </button>
                      <button onClick={() => { setRejecting(req); setRejectReason(""); }}
                        className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition-colors">
                        <XCircle size={14} className="inline ml-1" />رفض
                      </button>
                    </div>
                  )}
                  {req.status === "approved" && (
                    <button onClick={() => {
                      setReceiving(req);
                      setReceiveForm({ actual_cost: String(req.actual_cost || req.estimated_cost || ""), inventory_id: "", qty: String(req.quantity), rating: "0", quality_notes: "" });
                    }}
                      className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                      <ArrowDownCircle size={14} />تسجيل الاستلام وإضافة للمخزون
                    </button>
                  )}
                  {req.status === "received" && req.received_at && (
                    <div className="text-xs text-green-600 text-center font-semibold">تم الاستلام: {fmt(req.received_at)}</div>
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
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-500">{inventory.length} صنف في مستودع الورشة</span>
            <button onClick={() => { setEditingItem(null); setInvForm({ item_name: "", item_code: "", category: "عام", quantity: "", unit: "قطعة", min_stock: "", cost_per_unit: "", supplier: "" }); setShowInvForm(true); }}
              className="flex items-center gap-1.5 bg-cyan-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-cyan-700 transition-colors">
              <Plus size={14} />إضافة صنف
            </button>
          </div>

          {lowStock > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-800 font-semibold">{lowStock} صنف وصل للحد الأدنى — يحتاج إعادة طلب</span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16"><RefreshCw size={22} className="animate-spin text-cyan-600" /></div>
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
                    <th className="text-right px-4 py-3">الصنف</th>
                    <th className="text-center px-4 py-3">الكمية</th>
                    <th className="text-center px-4 py-3">الحد الأدنى</th>
                    <th className="text-center px-4 py-3">سعر الوحدة</th>
                    <th className="text-center px-4 py-3">القيمة الإجمالية</th>
                    <th className="text-center px-4 py-3">الحالة</th>
                    <th className="text-center px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(item => (
                    <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${item.quantity <= item.min_stock ? "bg-red-50/30" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-800">{item.item_name}</div>
                        <div className="text-xs text-gray-400">{item.category}{item.item_code ? ` · ${item.item_code}` : ""}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold">{item.quantity} {item.unit}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{item.min_stock} {item.unit}</td>
                      <td className="px-4 py-3 text-center">{sar(item.cost_per_unit)}</td>
                      <td className="px-4 py-3 text-center font-semibold">{sar(item.quantity * item.cost_per_unit)}</td>
                      <td className="px-4 py-3 text-center">
                        {item.quantity <= item.min_stock
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">منخفض</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">متاح</span>}
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
                        }} className="text-cyan-600 hover:underline text-xs font-semibold">تعديل</button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold text-sm">
                    <td className="px-4 py-3" colSpan={4}>إجمالي قيمة المخزون</td>
                    <td className="px-4 py-3 text-center text-[#103c68]">
                      {sar(inventory.reduce((s, i) => s + i.quantity * i.cost_per_unit, 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: INVOICES (Excel import) ────────────────────────────────────── */}
      {tab === "invoices" && (
        <div className="space-y-5">
          {/* Workshop-add result banner */}
          {invResult && (
            <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-semibold
              ${invResult.workshopAdded ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-blue-50 border-blue-200 text-blue-800"}`}>
              <CheckCircle size={16} className="flex-shrink-0" />
              {invResult.workshopAdded
                ? `✅ تمت الإضافة — "${invResult.workshopItemName}" أُضيف تلقائياً لمستودع الورشة`
                : "✅ تمت إضافة الفاتورة بنجاح"}
              <button onClick={() => setInvResult(null)} className="mr-auto text-current opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {/* Import bar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h2 className="font-black text-gray-900 flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-cyan-600" />فواتير الموردين
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  أضف فاتورة يدوياً، الصق صفوفاً من Excel، أو استورد ملفاً — إذا كانت السيارة "مستودع الورشة" تُضاف للمخزون فوراً
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setNewInvOpen(true)}
                  className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-cyan-700 transition-colors"
                >
                  <Plus size={15} />إضافة فاتورة
                </button>
                <button
                  onClick={() => setPasteInvoicesOpen(true)}
                  data-testid="button-open-invoice-paste"
                  className="flex items-center gap-2 border border-cyan-200 bg-cyan-50 text-cyan-800 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-cyan-100 transition-colors"
                >
                  <ClipboardPaste size={15} />لصق من Excel
                </button>
                <button
                  onClick={() => { setReturnOpen(true); setReturnQ(""); setReturnSels(new Map()); setReturnDone(null); }}
                  className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors"
                >
                  <RotateCcw size={15} />مرتجع
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#0d3057] transition-colors"
                >
                  <Upload size={15} />استيراد إكسل
                </button>
                <button
                  onClick={exportInvoicesToExcel}
                  disabled={invoices.length === 0}
                  className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-100 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={15} />تصدير Excel
                </button>
              </div>
              <input
                ref={fileInputRef} type="file" accept=".xlsx,.xls"
                className="hidden" onChange={handleFileChange}
              />
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { key: "vehicle_plate", label: "رقم السيارة", Icon: Search },
                { key: "supplier_name", label: "اسم المورد",  Icon: Search },
                { key: "branch",        label: "الفرع",        Icon: Search },
              ].map(({ key, label, Icon }) => (
                <div key={key} className="relative">
                  <Icon size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
                  <input
                    value={(invFilter as Record<string, string>)[key]}
                    onChange={e => setInvFilter(prev => ({ ...prev, [key]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && loadInvoices()}
                    placeholder={label}
                    className="w-full border border-gray-200 rounded-xl py-2 pr-8 pl-3 text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>
              ))}
            </div>
            <button onClick={loadInvoices} className="mt-3 text-xs text-cyan-700 font-semibold hover:underline">
              تطبيق الفلتر
            </button>
          </div>

          {/* Aggregates */}
          {invoices.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "إجمالي قبل الضريبة", val: sar(totalBeforeVat), color: "text-gray-700" },
                { label: "إجمالي الخصم",        val: sar(totalDiscount),  color: "text-rose-600" },
                { label: "إجمالي الكمية",       val: num(totalQty),       color: "text-cyan-700"  },
                { label: "إجمالي بعد الضريبة",  val: sar(totalAfterVat),  color: "text-[#103c68]" },
              ].map(a => (
                <div key={a.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                  <div className={`text-xl font-black ${a.color}`}>{a.val}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{a.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Invoices table */}
          {loading ? (
            <div className="flex justify-center py-16"><RefreshCw size={22} className="animate-spin text-cyan-600" /></div>
          ) : invoices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <FileSpreadsheet size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="font-semibold text-gray-500">لا توجد فواتير مستوردة بعد</p>
              <p className="text-xs text-gray-400 mt-1">أضف فاتورة يدوياً، الصق صفوفاً من Excel، أو استورد ملفاً</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-auto">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700">{invoices.length} فاتورة</span>
                  {selectedIds.size > 0 && (
                    <span className="bg-red-100 text-red-700 text-xs font-bold rounded-full px-2.5 py-0.5">
                      {selectedIds.size} محدد
                    </span>
                  )}
                  {canManageSupplierClaims && claimInvoiceSelIds.size > 0 && (
                    <span className="bg-cyan-100 text-cyan-800 text-xs font-bold rounded-full px-2.5 py-0.5" data-testid="status-selected-claim-invoices">
                      {claimInvoiceSelIds.size} جاهزة للكشف
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canManageSupplierClaims && claimInvoiceSelIds.size > 0 && (
                    <button
                      onClick={() => void createAndPrintSelectedInvoices()}
                      disabled={claimSubmitting || printingClaims}
                      data-testid="button-create-print-selected-invoices"
                      className="flex items-center gap-1.5 bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {claimSubmitting || printingClaims
                        ? <RefreshCw size={12} className="animate-spin" />
                        : <Printer size={12} />}
                      إنشاء وطباعة كشوف الفروع ({claimInvoiceSelIds.size})
                    </button>
                  )}
                  {selectedIds.size > 0 && (
                    <button
                      onClick={deleteSelected}
                      className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Trash2 size={12} /> حذف المحدد ({selectedIds.size})
                    </button>
                  )}
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 size={12} /> مسح الكل
                  </button>
                </div>
              </div>
              <table className="w-full text-sm min-w-[1800px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={invoices.length > 0 && selectedIds.size === invoices.length}
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 accent-red-500 cursor-pointer"
                      />
                    </th>
                    {canManageSupplierClaims && (
                      <th className="px-3 py-3 text-center" title="حدد الفواتير غير المدرجة في كشف لإنشاء كشوف منفصلة حسب الفرع">
                        <input
                          type="checkbox"
                          checked={claimableInvoices.length > 0 && claimableInvoices.every(invoice => claimInvoiceSelIds.has(invoice.id))}
                          onChange={event => setClaimInvoiceSelIds(
                            event.target.checked ? new Set(claimableInvoices.map(invoice => invoice.id)) : new Set()
                          )}
                          disabled={claimableInvoices.length === 0}
                          aria-label="تحديد كل الفواتير غير المدرجة في كشف"
                          data-testid="checkbox-select-all-claimable-invoices"
                          className="w-3.5 h-3.5 accent-cyan-600 cursor-pointer disabled:opacity-40"
                        />
                      </th>
                    )}
                    <th className="text-center px-3 py-3">م</th>
                    <th className="text-right px-3 py-3">التاريخ</th>
                    <th className="text-right px-3 py-3">الفرع</th>
                    <th className="text-right px-3 py-3">السيارة</th>
                    <th className="text-right px-3 py-3">الشغل على</th>
                    <th className="text-right px-3 py-3">رقم الفاتورة</th>
                    <th className="text-right px-3 py-3">حالة الكشف</th>
                    <th className="text-right px-3 py-3">رقم الكشف</th>
                    <th className="text-right px-3 py-3">المورد</th>
                    <th className="text-right px-3 py-3">قطعة الغيار</th>
                    <th className="text-right px-3 py-3">مدخل الفاتورة</th>
                    <th className="text-right px-3 py-3">الطباعة الأصلية / آخر إعادة</th>
                    <th className="text-center px-3 py-3">الكمية</th>
                    <th className="text-center px-3 py-3">قبل الضريبة</th>
                    <th className="text-center px-3 py-3">بعد الضريبة</th>
                    <th className="text-center px-3 py-3 text-rose-600">الخصم</th>
                    <th className="text-center px-3 py-3 text-amber-700">الإجمالي قبل الضريبة</th>
                    <th className="text-center px-3 py-3 text-[#103c68]">الإجمالي بعد الضريبة</th>
                    <th className="text-right px-3 py-3">ملاحظة</th>
                    <th className="text-center px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const isSel = selectedIds.has(inv.id);
                    const isClaimSelected = claimInvoiceSelIds.has(inv.id);
                    const hasClaim = Number(inv.reimbursement_claim_id) > 0;
                    return (
                      <tr key={inv.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${isClaimSelected ? "bg-cyan-50/60" : isSel ? "bg-red-50/60" : ""}`}>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelect(inv.id)}
                            className="w-3.5 h-3.5 accent-red-500 cursor-pointer"
                          />
                        </td>
                        {canManageSupplierClaims && (
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isClaimSelected}
                              disabled={hasClaim}
                              onChange={event => setClaimInvoiceSelIds(previous => {
                                const next = new Set(previous);
                                if (event.target.checked) next.add(inv.id);
                                else next.delete(inv.id);
                                return next;
                              })}
                              aria-label={`إضافة الفاتورة ${inv.invoice_number || inv.id} إلى كشف`}
                              data-testid={`checkbox-claim-invoice-${inv.id}`}
                              title={hasClaim ? "هذه الفاتورة مدرجة بالفعل في كشف" : "إضافة إلى كشف حسب الفرع"}
                              className="w-3.5 h-3.5 accent-cyan-600 cursor-pointer disabled:opacity-30"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-center text-gray-400 text-xs">{inv.serial_no || inv.id}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(inv.invoice_date)}</td>
                        <td className="px-3 py-2.5 text-xs">{inv.branch || "—"}</td>
                        <td className="px-3 py-2.5 font-semibold text-xs">{inv.vehicle_plate || "—"}</td>
                        <td className="px-3 py-2.5 text-xs font-semibold">
                          {inv.work_on === "trailer"
                            ? `التيدر: ${inv.trailer_number || "—"}`
                            : inv.work_on === "vehicle"
                              ? `رأس السيارة: ${inv.vehicle_plate || "—"}`
                              : "غير محدد"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{inv.invoice_number || "—"}</td>
                        <td className="px-3 py-2.5 text-xs" data-testid={`claim-status-invoice-${inv.id}`}>
                          {!hasClaim ? (
                            <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-1">غير مدرجة</span>
                          ) : Number(inv.claim_is_cancelled) ? (
                            <span className="rounded-full bg-red-100 text-red-700 px-2 py-1">ملغي</span>
                          ) : Number(inv.claim_is_printed) ? (
                            <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-1">مطبوع</span>
                          ) : (
                            <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-1">داخل كشف غير مطبوع</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-semibold text-[#103c68]" data-testid={`claim-number-invoice-${inv.id}`}>
                          {hasClaim
                            ? `كشف ${inv.claim_sequence_no ? claimSequenceLabel(inv.claim_sequence_no, Number(inv.reimbursement_claim_id)) : inv.claim_number || "—"}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-xs">{inv.supplier_name || "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-gray-800 text-xs">{inv.item_name}</div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{inv.imported_by || "—"}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600" data-testid={`claim-printer-invoice-${inv.id}`}>
                          {hasClaim && Number(inv.claim_is_printed)
                            ? <div>
                                <div>أصلًا: {inv.claim_printed_by || "غير مسجل (كشف سابق)"}</div>
                                {inv.claim_last_reprinted_by && <div className="text-cyan-700">إعادة: {inv.claim_last_reprinted_by}</div>}
                              </div>
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-xs">{num(inv.quantity)}</td>
                        <td className="px-3 py-2.5 text-center text-xs">{inv.price_before_vat > 0 ? sar(inv.price_before_vat) : "—"}</td>
                        <td className="px-3 py-2.5 text-center font-semibold text-xs text-[#103c68]">{inv.price_after_vat > 0 ? sar(inv.price_after_vat) : "—"}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-xs text-rose-600">{inv.discount_amount ? sar(inv.discount_amount) : "—"}</td>
                        <td className="px-3 py-2.5 text-center font-semibold text-xs text-amber-700">{inv.price_before_vat > 0 ? sar(inv.quantity * inv.price_before_vat) : "—"}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-xs text-[#103c68]">{inv.price_after_vat > 0 ? sar(inv.quantity * inv.price_after_vat) : "—"}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[120px] truncate">{inv.notes || "—"}</td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEditInvoice(inv)} className="text-cyan-500 hover:text-cyan-700 p-1 rounded hover:bg-cyan-50 transition-colors" title="تعديل">
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button onClick={() => deleteInvoice(inv.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors" title="حذف">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals */}
                  <tr className="bg-gray-50 font-bold text-sm border-t border-gray-200">
                    <td className="px-3 py-3" colSpan={canManageSupplierClaims ? 3 : 2}></td>
                    <td className="px-3 py-3 text-gray-500 text-xs" colSpan={7}>الإجمالي</td>
                    <td colSpan={4}></td>
                    <td className="px-3 py-3 text-center font-black text-cyan-700">{num(totalQty)}</td>
                    <td className="px-3 py-3 text-center font-black text-gray-700">{sar(totalBeforeVat)}</td>
                    <td className="px-3 py-3 text-center font-black text-[#103c68]">{sar(totalAfterVat)}</td>
                    <td className="px-3 py-3 text-center font-black text-rose-600">{sar(totalDiscount)}</td>
                    <td className="px-3 py-3 text-center font-black text-amber-700">{sar(invoices.reduce((s, i) => s + i.quantity * i.price_before_vat, 0))}</td>
                    <td className="px-3 py-3 text-center font-black text-[#103c68]">{sar(invoices.reduce((s, i) => s + i.quantity * i.price_after_vat, 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ Modals ══════════════════════════════════════════════════════════════ */}

      {/* Clear-all confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} className="text-red-600" />
            </div>
            <h2 className="text-lg font-black text-gray-900 mb-2">مسح جميع فواتير المشتريات</h2>
            <p className="text-sm text-gray-500 mb-1">
              سيتم حذف <span className="font-black text-red-600">{invoices.length} فاتورة</span> بشكل نهائي.
            </p>
            <p className="text-xs text-gray-400 mb-6">هذا الإجراء لا يمكن التراجع عنه.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={clearAllInvoices}
                disabled={clearing}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {clearing ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {clearing ? "جاري المسح..." : "مسح الكل"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewRows && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/50 backdrop-blur-sm overflow-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="font-black text-gray-900 flex items-center gap-2">
                  <Eye size={18} className="text-cyan-600" />معاينة البيانات قبل الاستيراد
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{previewFile} — {previewRows.length} سجل</p>
              </div>
              <button onClick={() => { setPreviewRows(null); setPreviewFile(""); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-auto max-h-[55vh] p-4">
              <table className="w-full text-xs min-w-[900px]">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="text-center px-2 py-2">م</th>
                    <th className="text-right px-2 py-2">التاريخ</th>
                    <th className="text-right px-2 py-2">الفرع</th>
                    <th className="text-right px-2 py-2">السيارة</th>
                    <th className="text-right px-2 py-2">رقم الفاتورة</th>
                    <th className="text-right px-2 py-2">المورد</th>
                    <th className="text-right px-2 py-2">قطعة الغيار</th>
                    <th className="text-center px-2 py-2">الكمية</th>
                    <th className="text-center px-2 py-2">قبل ضريبة</th>
                    <th className="text-center px-2 py-2">بعد ضريبة</th>
                    <th className="text-right px-2 py-2">ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                      <td className="px-2 py-2 text-center text-gray-400">{r.serial_no || (i + 1)}</td>
                      <td className="px-2 py-2">{r.invoice_date}</td>
                      <td className="px-2 py-2">{r.branch}</td>
                      <td className="px-2 py-2 font-semibold">{r.vehicle_plate}</td>
                      <td className="px-2 py-2">{r.invoice_number}</td>
                      <td className="px-2 py-2 font-semibold">{r.supplier_name}</td>
                      <td className="px-2 py-2 font-semibold text-gray-800">{r.item_name}</td>
                      <td className="px-2 py-2 text-center font-bold">{r.quantity}</td>
                      <td className="px-2 py-2 text-center">{r.price_before_vat || "—"}</td>
                      <td className="px-2 py-2 text-center font-semibold text-[#103c68]">{r.price_after_vat || "—"}</td>
                      <td className="px-2 py-2 text-gray-500 max-w-[100px] truncate">{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-5 border-t border-gray-100 flex gap-3">
              <button
                onClick={confirmImport} disabled={importing}
                className="flex-1 py-3 bg-[#103c68] text-white rounded-xl font-black text-sm hover:bg-[#0d3057] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {importing ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
                {importing ? "جاري الاستيراد..." : `استيراد ${previewRows.length} سجل`}
              </button>
              <button
                onClick={() => { setPreviewRows(null); setPreviewFile(""); }}
                className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Approve */}
      {approving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900">الموافقة على الطلب</h2>
              <button onClick={() => setApproving(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1">
                <div className="flex gap-2"><span className="text-gray-500">الصنف:</span><span className="font-semibold">{approving.item_name}</span></div>
                <div className="flex gap-2"><span className="text-gray-500">الكمية:</span><span className="font-semibold">{approving.quantity} {approving.unit}</span></div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">التكلفة الفعلية (ريال)</label>
                <input type="number" value={approveForm.actual_cost}
                  onChange={e => setApproveForm(p => ({ ...p, actual_cost: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">المورّد</label>
                <select value={approveForm.supplier_id || "__other"}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === "__other" || val === "") {
                      setApproveForm(p => ({ ...p, supplier_id: "", supplier: "" }));
                    } else {
                      const s = suppliers.find(s => String(s.id) === val);
                      setApproveForm(p => ({ ...p, supplier_id: val, supplier: s?.name || "" }));
                    }
                  }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 bg-white">
                  <option value="">— اختر المورد —</option>
                  {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}{s.specialty ? ` · ${s.specialty}` : ""}</option>)}
                  <option value="__other">آخر (يدوي)</option>
                </select>
                {(!approveForm.supplier_id || approveForm.supplier_id === "__other") && (
                  <input type="text" placeholder="اكتب اسم المورد..."
                    value={approveForm.supplier}
                    onChange={e => setApproveForm(p => ({ ...p, supplier: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 mt-2" />
                )}
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={approveRequest} disabled={submitting}
                className="flex-1 py-3 bg-cyan-600 text-white rounded-xl font-black text-sm hover:bg-cyan-700 transition-colors disabled:opacity-60">
                {submitting ? "..." : "موافقة"}
              </button>
              <button onClick={() => setApproving(null)} className="px-5 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900">رفض الطلب</h2>
              <button onClick={() => setRejecting(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-semibold text-gray-600 mb-1">سبب الرفض</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
                placeholder="اكتب سبب الرفض..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 resize-none" />
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={rejectRequest} disabled={submitting}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black text-sm hover:bg-red-600 transition-colors disabled:opacity-60">
                {submitting ? "..." : "تأكيد الرفض"}
              </button>
              <button onClick={() => setRejecting(null)} className="px-5 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Receive */}
      {receiving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900">تسجيل الاستلام</h2>
              <button onClick={() => setReceiving(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-2xl p-4 text-sm">
                <div className="font-semibold">{receiving.item_name}</div>
                <div className="text-gray-500 text-xs mt-1">المورّد: {receiving.supplier || "—"}</div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">الكمية المستلمة</label>
                <input type="number" value={receiveForm.qty}
                  onChange={e => setReceiveForm(p => ({ ...p, qty: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">التكلفة الفعلية (ريال)</label>
                <input type="number" value={receiveForm.actual_cost}
                  onChange={e => setReceiveForm(p => ({ ...p, actual_cost: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">صنف المخزون المراد تحديثه (اختياري)</label>
                <select value={receiveForm.inventory_id}
                  onChange={e => setReceiveForm(p => ({ ...p, inventory_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400">
                  <option value="">— لا تضف للمخزون —</option>
                  {inventory.map(i => <option key={i.id} value={String(i.id)}>{i.item_name}</option>)}
                </select>
              </div>
              {/* #138 — تقييم المورد */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">تقييم المورد</label>
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(star => (
                    <button key={star} type="button"
                      onClick={() => setReceiveForm(p => ({ ...p, rating: String(star) }))}
                      className={`text-2xl transition-transform hover:scale-110 ${Number(receiveForm.rating) >= star ? "text-amber-400" : "text-gray-200"}`}>
                      ★
                    </button>
                  ))}
                  {Number(receiveForm.rating) > 0 && (
                    <button type="button" onClick={() => setReceiveForm(p => ({ ...p, rating: "0" }))}
                      className="text-xs text-gray-400 hover:text-gray-600 mr-2">إلغاء</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">ملاحظة الجودة (اختياري)</label>
                <input type="text" value={receiveForm.quality_notes}
                  onChange={e => setReceiveForm(p => ({ ...p, quality_notes: e.target.value }))}
                  placeholder="مثال: توصيل سريع، جودة ممتازة..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={receiveRequest} disabled={submitting}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-black text-sm hover:bg-green-700 transition-colors disabled:opacity-60">
                {submitting ? "..." : "تأكيد الاستلام"}
              </button>
              <button onClick={() => setReceiving(null)} className="px-5 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Request */}
      {newRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900">طلب شراء جديد</h2>
              <button onClick={() => setNewRequest(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {[
                { label: "اسم الصنف *",      key: "item_name",       type: "text",   placeholder: "مثال: فلتر زيت" },
                { label: "الكمية *",          key: "quantity",        type: "number", placeholder: "1" },
                { label: "الوحدة",            key: "unit",            type: "text",   placeholder: "قطعة" },
                { label: "التكلفة المقدرة",   key: "estimated_cost",  type: "number", placeholder: "0" },
                { label: "المورد المقترح",    key: "supplier",        type: "text",   placeholder: "اختياري" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                  <input type={f.type} value={(reqForm as Record<string, string>)[f.key]}
                    onChange={e => setReqForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  <Truck size={11} className="inline ml-1 text-blue-500" />رقم السيارة
                </label>
                <select value={reqForm.vehicle_plate} onChange={e => setReqForm(p => ({ ...p, vehicle_plate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 bg-white">
                  <option value="">— اختر السيارة (اختياري) —</option>
                  {fleetVehicles.map(v => (
                    <option key={v.plate_number} value={v.plate_number}>{v.plate_number} · {v.vehicle_type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">السبب</label>
                <textarea value={reqForm.reason} onChange={e => setReqForm(p => ({ ...p, reason: e.target.value }))} rows={2}
                  placeholder="سبب الطلب..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 resize-none" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={createRequest} disabled={submitting}
                className="flex-1 py-3 bg-cyan-600 text-white rounded-xl font-black text-sm hover:bg-cyan-700 transition-colors disabled:opacity-60">
                {submitting ? "..." : "إرسال الطلب"}
              </button>
              <button onClick={() => setNewRequest(false)} className="px-5 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Inventory form */}
      {showInvForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900">{editingItem ? "تعديل صنف" : "إضافة صنف جديد"}</h2>
              <button onClick={() => { setShowInvForm(false); setEditingItem(null); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {[
                { label: "اسم الصنف *",    key: "item_name",    type: "text",   placeholder: "" },
                { label: "رمز الصنف",      key: "item_code",    type: "text",   placeholder: "اختياري" },
                { label: "التصنيف",        key: "category",     type: "text",   placeholder: "عام" },
                { label: "الكمية",         key: "quantity",     type: "number", placeholder: "0" },
                { label: "الوحدة",         key: "unit",         type: "text",   placeholder: "قطعة" },
                { label: "الحد الأدنى",    key: "min_stock",    type: "number", placeholder: "0" },
                { label: "سعر الوحدة",     key: "cost_per_unit",type: "number", placeholder: "0" },
                { label: "المورد",         key: "supplier",     type: "text",   placeholder: "اختياري" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                  <input type={f.type} value={(invForm as Record<string, string>)[f.key]}
                    onChange={e => setInvForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
                </div>
              ))}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={saveInventory} disabled={submitting}
                className="flex-1 py-3 bg-cyan-600 text-white rounded-xl font-black text-sm hover:bg-cyan-700 transition-colors disabled:opacity-60">
                {submitting ? "..." : "حفظ"}
              </button>
              <button onClick={() => { setShowInvForm(false); setEditingItem(null); }} className="px-5 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
      {pasteInvoicesOpen && (
        <InvoicePasteModal
          importedBy={user?.name || user?.phone || ""}
          requestKey={pasteInvoiceRequestKey}
          vehicles={fleetVehicles}
          trailerNumbers={[...new Set(teidarat.map(item => item.teidara_number?.trim()).filter((number): number is string => Boolean(number)))]}
          branchNames={[...new Set(branches.map(branch => branch.entity_name.trim()).filter(Boolean))]}
          supplierNames={[...new Set(suppliers.filter(supplier => supplier.is_active).map(supplier => supplier.name.trim()).filter(Boolean))]}
          onClose={startFreshBatch => {
            setPasteInvoicesOpen(false);
            if (startFreshBatch) setPasteInvoiceRequestKey(newInvoicePasteRequestKey());
          }}
          onSave={savePastedInvoices}
        />
      )}
      {/* ══ Modal: New Invoice ════════════════════════════════════════════════ */}
      {newInvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-auto max-h-[92vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900 text-base flex items-center gap-2">
                <Plus size={16} className="text-cyan-600" />إضافة فاتورة جديدة
              </h2>
              <button onClick={() => { setNewInvOpen(false); setInvItems([mkInvItem()]); setInvoiceDiscount(""); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Branch + vehicle row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">الفرع</label>
                  <input value={newInvForm.branch}
                    onChange={e => setNewInvForm(p => ({ ...p, branch: e.target.value }))}
                    disabled={fleetVehicles.some(v => v.plate_number.trim().toLowerCase() === newInvForm.vehicle_plate.trim().toLowerCase())}
                    list="purchase-company-branches"
                    placeholder={fleetVehicles.some(v => v.plate_number.trim().toLowerCase() === newInvForm.vehicle_plate.trim().toLowerCase())
                      ? "يُحدد تلقائيًا من بيانات السيارة"
                      : "اكتب الفرع"}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400 bg-white">
                  </input>
                  <datalist id="purchase-company-branches">
                    {branches.map(b => <option key={b.id} value={b.entity_name} />)}
                  </datalist>
                  {fleetVehicles.some(v => v.plate_number.trim().toLowerCase() === newInvForm.vehicle_plate.trim().toLowerCase()) && (
                    <p className="text-[11px] text-gray-400 mt-1">تم تحديد الفرع تلقائيًا من بيانات السيارة في الأسطول.</p>
                  )}
                </div>
                <div ref={invVehicleRef} className="relative">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    السيارة <span className="text-emerald-600 font-bold">(مستودع الورشة = يضاف للمخزون)</span>
                  </label>
                  <input
                    type="text"
                    value={invVehicleQ !== "" ? invVehicleQ : newInvForm.vehicle_plate}
                    placeholder="اكتب أو ابحث عن السيارة..."
                    onFocus={() => { setInvVehicleQ(newInvForm.vehicle_plate); setInvVehicleOpen(true); }}
                    onChange={e => {
                      const value = e.target.value;
                      const vehicle = fleetVehicles.find(v => v.plate_number.trim().toLowerCase() === value.trim().toLowerCase());
                      setInvVehicleQ(value);
                      setInvVehicleOpen(true);
                      setNewInvForm(p => ({
                        ...p,
                        vehicle_plate: value,
                        branch: vehicle?.branch?.trim() || "",
                        trailer_number: value.trim() === "مستودع الورشة" ? "" : vehicle?.linked_trailer_number?.trim() || "",
                        work_on: value.trim() === "مستودع الورشة" ? "" : p.work_on || "vehicle",
                      }));
                    }}
                    onBlur={() => setTimeout(() => { setInvVehicleOpen(false); setInvVehicleQ(""); }, 150)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400 bg-white"
                  />
                  {invVehicleOpen && (() => {
                    const q = invVehicleQ.trim().toLowerCase();
                    const fixed = ["مستودع الورشة"];
                    const all = [...fixed, ...extraVehicles, ...fleetVehicles.map(v => v.plate_number)];
                    const unique = [...new Set(all)];
                    const filtered = unique.filter(p => !q || p.toLowerCase().includes(q));
                    const isNew = q && !unique.some(p => p.toLowerCase() === q);
                    return (
                      <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-auto">
                        {filtered.map(plate => (
                          <button key={plate} type="button"
                            onMouseDown={() => {
                              const vehicle = fleetVehicles.find(v => v.plate_number === plate);
                              setNewInvForm(p => ({
                                ...p,
                                vehicle_plate: plate,
                                branch: vehicle?.branch?.trim() || (plate === "مستودع الورشة" ? p.branch : ""),
                                trailer_number: plate === "مستودع الورشة" ? "" : vehicle?.linked_trailer_number?.trim() || "",
                                work_on: plate === "مستودع الورشة" ? "" : p.work_on || "vehicle",
                              }));
                              setInvVehicleOpen(false);
                              setInvVehicleQ("");
                            }}
                            className={`w-full text-right px-3 py-2 text-sm hover:bg-cyan-50 flex items-center gap-2
                              ${newInvForm.vehicle_plate === plate ? "bg-cyan-50 font-bold text-cyan-700" : "text-gray-700"}`}>
                            {plate === "مستودع الورشة" ? "🏭" : "🚛"} {plate}
                          </button>
                        ))}
                        {isNew && (
                          <button type="button"
                            onMouseDown={() => {
                              const val = invVehicleQ.trim();
                              setExtraVehicles(prev => prev.includes(val) ? prev : [...prev, val]);
                              setNewInvForm(p => ({
                                ...p, vehicle_plate: val, branch: "",
                                work_on: p.work_on || "vehicle", trailer_number: "",
                              }));
                              setInvVehicleOpen(false); setInvVehicleQ("");
                            }}
                            className="w-full text-right px-3 py-2 text-sm text-cyan-700 font-bold hover:bg-cyan-50 border-t border-gray-100 flex items-center gap-2">
                            <Plus size={13} /> إضافة جديد: "{invVehicleQ.trim()}"
                          </button>
                        )}
                        {filtered.length === 0 && !isNew && (
                          <p className="px-3 py-2 text-xs text-gray-400">لا توجد نتائج</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {newInvForm.vehicle_plate.trim() !== "مستودع الورشة" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">الشغل على</label>
                    <select
                      value={newInvForm.work_on}
                      onChange={e => setNewInvForm(p => ({ ...p, work_on: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400 bg-white"
                    >
                      <option value="vehicle">رأس السيارة</option>
                      <option value="trailer">التيدر</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      رقم التيدر {newInvForm.work_on === "trailer" ? "*" : "(اختياري)"}
                    </label>
                    <select
                      value={newInvForm.trailer_number}
                      onChange={e => {
                        const number = e.target.value;
                        const owner = fleetVehicles.find(v => v.linked_trailer_number?.trim() === number);
                        setNewInvForm(p => ({
                          ...p,
                          trailer_number: number,
                          branch: !p.vehicle_plate.trim() && owner?.branch?.trim() ? owner.branch.trim() : p.branch,
                          work_on: !p.vehicle_plate.trim() && number ? "trailer" : p.work_on,
                        }));
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400 bg-white"
                    >
                      <option value="">— اختر التيدر —</option>
                      {teidarat.filter(t => t.teidara_number?.trim()).map(t => (
                        <option key={t.id} value={t.teidara_number!}>{t.teidara_number}</option>
                      ))}
                    </select>
                  </div>
                  <p className="col-span-2 -mt-2 text-[11px] text-gray-400">
                    يظهر التيدر المرتبط بالسيارة تلقائيًا. تغييره هنا يخص الفاتورة فقط ولا يغيّر ربط الأسطول.
                  </p>
                  {teidaraLoadError && (
                    <p className="col-span-2 -mt-2 text-[11px] text-red-600">{teidaraLoadError}</p>
                  )}
                </div>
              )}

              {/* Date + invoice number */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">التاريخ</label>
                  <input type="date" value={newInvForm.invoice_date}
                    onChange={e => setNewInvForm(p => ({ ...p, invoice_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">رقم الفاتورة</label>
                  <input type="text" value={newInvForm.invoice_number}
                    onChange={e => setNewInvForm(p => ({ ...p, invoice_number: e.target.value }))}
                    placeholder="INV-001"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
                </div>
              </div>

              {/* Supplier + serial */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">المورد</label>
                  <input
                    type="text"
                    list="purchase-invoice-suppliers"
                    value={newInvForm.supplier_name}
                    onChange={e => {
                      const name = e.target.value;
                      const match = suppliers.find(s => s.name.trim().toLowerCase() === name.trim().toLowerCase());
                      setNewInvForm(p => ({
                        ...p,
                        supplier_name: name,
                        supplier_id: match ? String(match.id) : "",
                      }));
                    }}
                    placeholder="ابحث أو اكتب اسم مورد جديد..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400 bg-white"
                  />
                  <datalist id="purchase-invoice-suppliers">
                    {suppliers.map(s => <option key={s.id} value={s.name} />)}
                  </datalist>
                  <p className="text-[11px] text-gray-400 mt-1">
                    إذا لم يكن المورد موجودًا، سيُضاف تلقائيًا إلى قائمة الموردين.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">المسلسل</label>
                  <input type="text" value={newInvForm.serial_no}
                    onChange={e => setNewInvForm(p => ({ ...p, serial_no: e.target.value }))}
                    placeholder="اختياري"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
                </div>
              </div>

              {/* ── Items list — dynamic multi-item ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">الأصناف والقطع *</label>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {invItems.filter(i => i.item_name.trim()).length} صنف مُدخَل
                  </span>
                </div>

                {(() => {
                  const isWorkshop = newInvForm.vehicle_plate.trim() === "مستودع الورشة";
                  return invItems.map((item, idx) => {
                  const totalBefore = (Number(item.quantity) || 0) * (Number(item.price_before_vat) || 0);
                  const totalAfter  = (Number(item.quantity) || 0) * (Number(item.price_after_vat)  || 0);
                  const upd = (patch: Partial<InvItem>) =>
                    setInvItems(prev => prev.map(it => it.id === item.id ? { ...it, ...patch } : it));
                  // Find matching existing inventory item for quantity badge
                  const matchedInvItem = isWorkshop && item.item_name.trim()
                    ? inventory.find(i => i.item_name.trim().toLowerCase() === item.item_name.trim().toLowerCase())
                    : null;
                  return (
                    <div key={item.id} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                      {/* Row header */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-700">صنف {idx + 1}</span>
                        {invItems.length > 1 && (
                          <button type="button"
                            onClick={() => setInvItems(prev => prev.filter(it => it.id !== item.id))}
                            className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      {/* Item name — combobox when workshop, plain input otherwise */}
                      {isWorkshop ? (
                        <div className="space-y-1">
                          <div className="relative">
                            <input
                              type="text"
                              list={`inv-items-list-${item.id}`}
                              value={item.item_name}
                              onChange={e => upd({ item_name: e.target.value })}
                              placeholder="اختر صنفاً موجوداً أو اكتب اسم جديد..."
                              className="w-full border border-cyan-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 bg-white"
                            />
                            <datalist id={`inv-items-list-${item.id}`}>
                              {inventory.map(i => (
                                <option key={i.id} value={i.item_name}>
                                  {i.item_name} — {i.quantity.toLocaleString("ar-SA")} {i.unit}
                                </option>
                              ))}
                            </datalist>
                          </div>
                          {matchedInvItem ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                                📦 المتوفر حالياً: {matchedInvItem.quantity.toLocaleString("ar-SA")} {matchedInvItem.unit}
                              </span>
                              {matchedInvItem.min_stock > 0 && matchedInvItem.quantity <= matchedInvItem.min_stock && (
                                <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
                                  ⚠ مخزون منخفض
                                </span>
                              )}
                            </div>
                          ) : item.item_name.trim() ? (
                            <span className="text-xs text-amber-600 font-medium">✦ صنف جديد — سيُضاف للمستودع عند الحفظ</span>
                          ) : null}
                        </div>
                      ) : (
                        <input type="text" value={item.item_name}
                          onChange={e => upd({ item_name: e.target.value })}
                          placeholder="اسم قطعة الغيار / الصنف *"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 bg-white" />
                      )}

                      {/* Qty + unit prices */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">الكمية</label>
                          <input type="number" min="0" value={item.quantity}
                            onChange={e => upd({ quantity: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">سعر قبل ض. (ر.س)</label>
                          <input type="number" min="0" value={item.price_before_vat}
                            onChange={e => {
                              const v = e.target.value;
                              const after = v ? String(Math.round(Number(v) * 1.15 * 100) / 100) : "";
                              upd({ price_before_vat: v, price_after_vat: after });
                            }}
                            placeholder="0"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">سعر بعد ض. (ر.س)</label>
                          <input type="number" min="0" value={item.price_after_vat}
                            onChange={e => upd({ price_after_vat: e.target.value })}
                            placeholder="15%↑"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400 bg-white" />
                        </div>
                      </div>

                      {/* Calculated totals — editable, back-calculates unit price */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-amber-600 mb-0.5">إجمالي قبل الضريبة</label>
                          <input type="number" min="0"
                            value={String(totalBefore)}
                            onChange={e => {
                              const total = Number(e.target.value) || 0;
                              const qty   = Number(item.quantity) || 1;
                              const before = total / qty;
                              upd({ price_before_vat: String(before), price_after_vat: String(Math.round(before * 1.15 * 100) / 100) });
                            }}
                            className="w-full border border-amber-300 bg-amber-50 rounded-lg px-2 py-1.5 text-sm font-bold text-amber-700 focus:outline-none focus:border-amber-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#103c68] mb-0.5">إجمالي بعد الضريبة</label>
                          <input type="number" min="0"
                            value={String(totalAfter)}
                            onChange={e => {
                              const total = Number(e.target.value) || 0;
                              const qty   = Number(item.quantity) || 1;
                              upd({ price_after_vat: String(total / qty) });
                            }}
                            className="w-full border border-blue-300 bg-blue-50 rounded-lg px-2 py-1.5 text-sm font-bold text-[#103c68] focus:outline-none focus:border-blue-500" />
                        </div>
                      </div>
                    </div>
                  );
                })
                })()}

                {/* Add item button */}
                <button type="button"
                  onClick={() => setInvItems(prev => [...prev, mkInvItem()])}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-cyan-300 text-cyan-600 rounded-xl text-sm font-bold hover:bg-cyan-50 transition-colors">
                  <Plus size={14} /> إضافة صنف آخر
                </button>

                {/* Whole-entry discount and totals ticket */}
                <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-white to-rose-50 p-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-rose-700">خصم إجمالي على الفاتورة / جميع الأصناف</label>
                    <input
                      type="number"
                      min="0"
                      max={draftGrossBeforeVat}
                      step="0.01"
                      value={invoiceDiscount}
                      onChange={event => setInvoiceDiscount(event.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-rose-300 bg-white px-3 py-2.5 text-sm font-black text-rose-700 outline-none focus:border-rose-500"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">يُوزّع الخصم تلقائيًا بنسبة قيمة كل صنف، ثم تُحسب الضريبة بعد الخصم.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-5">
                    {[
                      { label: "الإجمالي قبل الخصم", value: draftGrossBeforeVat, color: "text-gray-800" },
                      { label: "الخصم", value: draftDiscount, color: "text-rose-600" },
                      { label: "بدون الضريبة", value: draftNetBeforeVat, color: "text-amber-700" },
                      { label: "الضريبة 15%", value: draftVat, color: "text-cyan-700" },
                      { label: "الشامل", value: draftTotalAfterVat, color: "text-[#103c68]" },
                    ].map(total => (
                      <div key={total.label} className="rounded-xl border border-gray-100 bg-white p-2 shadow-sm">
                        <div className={`text-sm font-black ${total.color}`}>{sar(total.value)}</div>
                        <div className="mt-0.5 text-[10px] text-gray-500">{total.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Workshop hint */}
                {newInvForm.vehicle_plate.trim() === "مستودع الورشة" && invItems.some(i => i.item_name.trim()) && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle size={15} className="flex-shrink-0 text-emerald-600" />
                    <span>
                      سيُضاف <strong>{invItems.filter(i => i.item_name.trim()).length} صنف</strong> مباشرةً لمستودع الورشة عند الحفظ
                    </span>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">ملاحظة</label>
                <textarea value={newInvForm.notes} rows={2}
                  onChange={e => setNewInvForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400 resize-none" />
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button onClick={createInvoice} disabled={submitting}
                className="flex-1 py-3 bg-cyan-600 text-white rounded-xl font-black text-sm hover:bg-cyan-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                {submitting
                  ? "جاري الحفظ..."
                  : `إضافة الفاتورة (${invItems.filter(i => i.item_name.trim()).length} صنف)`}
              </button>
              <button onClick={() => { setNewInvOpen(false); setInvItems([mkInvItem()]); setInvoiceDiscount(""); }}
                className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: CUSTODY — كشف الاستعاضة ──────────────────────────────────── */}
      {tab === "custody" && (
        <div className="space-y-5">

          {/* ─ Unclaimed invoices ──────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-w-0">
            <div className="px-3 sm:px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Wallet size={17} className="text-orange-500" />
                <h3 className="font-black text-gray-900 text-sm">فواتير لم تُسدَّد بعد</h3>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">{unclaimedInvs.length}</span>
              </div>
              {selIds.size > 0 && (
                <button onClick={createClaim} disabled={claimSubmitting}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-bold hover:bg-cyan-700 transition-colors disabled:opacity-60 w-full sm:w-auto">
                  {claimSubmitting ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={13} />}
                  إنشاء كشف ({selIds.size})
                </button>
              )}
            </div>

            {unclaimedInvs.length === 0 ? (
              <div className="p-14 text-center">
                <CheckCircle size={36} className="mx-auto mb-3 text-emerald-300" />
                <p className="font-semibold text-gray-400">جميع فواتيرك تم استعاضتها ✓</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full text-sm min-w-[1500px]">
                    <thead className="bg-gray-50 text-xs">
                      <tr>
                        <th className="px-4 py-3 text-right">
                          <input type="checkbox"
                            checked={selIds.size === unclaimedInvs.length && unclaimedInvs.length > 0}
                            onChange={e => setSelIds(e.target.checked ? new Set(unclaimedInvs.map(i => i.id)) : new Set())}
                            className="w-4 h-4 accent-cyan-600 cursor-pointer" />
                        </th>
                        <th className="px-4 py-3 text-center font-bold text-gray-500">م</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-500">التاريخ</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-500">الفرع</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-500">السيارة</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-500">رقم الفاتورة</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-500">المورد</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-500">الصنف</th>
                        <th className="px-4 py-3 text-center font-bold text-gray-500">الكمية</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-500">سعر قبل الضريبة</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-500">سعر بعد الضريبة</th>
                        <th className="px-4 py-3 text-right font-bold text-amber-600">إجمالي قبل الضريبة</th>
                        <th className="px-4 py-3 text-right font-bold text-[#103c68]">إجمالي بعد الضريبة</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-500">ملاحظة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unclaimedInvs.map(inv => (
                        <tr key={inv.id}
                          onClick={() => setSelIds(prev => { const n = new Set(prev); n.has(inv.id) ? n.delete(inv.id) : n.add(inv.id); return n; })}
                          className={`border-t border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 ${selIds.has(inv.id) ? "bg-cyan-50" : ""}`}>
                          <td className="px-4 py-3">
                            <input type="checkbox" readOnly checked={selIds.has(inv.id)}
                              className="w-4 h-4 accent-cyan-600 pointer-events-none" />
                          </td>
                          <td className="px-4 py-3 text-center text-gray-400 text-xs">{inv.serial_no || inv.id}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{inv.invoice_date || "—"}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{inv.branch || "—"}</td>
                          <td className="px-4 py-3 font-semibold text-gray-700 text-xs">{inv.vehicle_plate || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.invoice_number || "—"}</td>
                          <td className="px-4 py-3 text-gray-700 text-xs">{inv.supplier_name || "—"}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{inv.item_name}</td>
                          <td className="px-4 py-3 text-center text-gray-600">{inv.quantity || 0}</td>
                          <td className="px-4 py-3 text-gray-600">{inv.price_before_vat > 0 ? sar(inv.price_before_vat) : "—"}</td>
                          <td className="px-4 py-3 text-gray-600">{inv.price_after_vat > 0 ? sar(inv.price_after_vat) : "—"}</td>
                          <td className="px-4 py-3 font-bold text-amber-700">{sar((inv.quantity || 0) * (inv.price_before_vat || 0))}</td>
                          <td className="px-4 py-3 font-bold text-[#103c68]">{sar((inv.quantity || 0) * (inv.price_after_vat || 0))}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[180px] truncate">{inv.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Selection footer */}
                {selIds.size > 0 && (() => {
                  const sel = unclaimedInvs.filter(i => selIds.has(i.id));
                  const tBefore = sel.reduce((s, i) => s + (i.quantity || 0) * (i.price_before_vat || 0), 0);
                  const tAfter  = sel.reduce((s, i) => s + (i.quantity || 0) * (i.price_after_vat  || 0), 0);
                  return (
                    <div className="border-t border-cyan-100 bg-cyan-50 px-3 sm:px-5 py-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
                      <span className="text-sm font-bold text-cyan-800">{selIds.size} فاتورة محددة</span>
                      <span className="text-sm font-bold text-amber-700">إجمالي قبل الضريبة: {sar(tBefore)}</span>
                      <span className="text-sm font-bold text-[#103c68]">إجمالي بعد الضريبة: {sar(tAfter)}</span>
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 justify-end flex-wrap">
                        <input type="text" value={claimNotes} onChange={e => setClaimNotes(e.target.value)}
                          placeholder="ملاحظة (اختياري)..."
                          className="w-full sm:w-auto border border-cyan-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-400 bg-white sm:min-w-40" />
                        <button onClick={createClaim} disabled={claimSubmitting}
                          className="flex items-center justify-center gap-1.5 px-5 py-2 bg-cyan-600 text-white rounded-lg text-sm font-bold hover:bg-cyan-700 transition-colors disabled:opacity-60">
                          {claimSubmitting ? <RefreshCw size={13} className="animate-spin" /> : <FileText size={13} />}
                          إنشاء كشف الاستعاضة
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* ─ Success banner ───────────────────────────────────────────────── */}
          {claimSuccess && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-3 sm:px-5 py-4">
              <div className="flex items-start sm:items-center gap-2 text-emerald-700 min-w-0">
                <CheckCircle size={18} />
                <span className="font-bold text-sm">
                  {claimSuccess.count > 1
                    ? `تم إنشاء ${claimSuccess.count} كشوف منفصلة حسب الفروع`
                    : <>تم إنشاء الكشف رقم <span className="font-mono">{claimSequenceLabel(claimSuccess.sequence_no, claimSuccess.id)}</span></>}
                  {" — يمكنك الاطلاع والطباعة أدناه"}
                </span>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => {
                    if (claimSuccess.count > 1) {
                      void printAllClaims(custodyClaims.filter(claim => claimSuccess.ids.includes(claim.id)));
                    }
                    else {
                      const c = custodyClaims.find(x => x.id === claimSuccess.id);
                      if (c) void printClaim(c);
                    }
                  }}
                  disabled={printingClaims}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  <Printer size={14} /> {claimSuccess.count > 1 ? "طباعة كشوف الفروع" : "طباعة الآن"}
                </button>
                <button onClick={() => setClaimSuccess(null)} className="text-emerald-500 hover:text-emerald-700 p-1">
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ─ Unprinted claims ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-w-0">
            <div className="px-3 sm:px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardList size={17} className="text-cyan-600" />
                <h3 className="font-black text-gray-900 text-sm">كشوفات غير مطبوعة</h3>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">{unprintedClaims.length}</span>
              </div>
              {unprintedClaims.length > 0 && (
                <button disabled={printingClaims} onClick={() => void printAllClaims(unprintedClaims)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-bold hover:bg-cyan-700 transition-colors w-full sm:w-auto disabled:opacity-50">
                  <Printer size={14} /> طباعة جميع غير المطبوعة ({unprintedClaims.length})
                </button>
              )}
            </div>

            {unprintedClaims.length === 0 ? (
              <div className="p-14 text-center text-gray-300">
                <ClipboardList size={36} className="mx-auto mb-3" />
                <p className="text-sm">لا توجد كشوفات غير مطبوعة — أنشئ كشفاً جديداً من الفواتير أعلاه</p>
              </div>
            ) : renderClaimRows(unprintedClaims)}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-w-0">
            <div className="px-3 sm:px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Printer size={17} className="text-cyan-700" />
                <h3 className="font-black text-gray-900 text-sm">أرشيف الكشوف المطبوعة</h3>
                <span className="text-xs bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded-full font-bold" data-testid="status-printed-claims-count">
                  {printedCustodyClaims.length}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {canManageSupplierClaims
                  ? "إعادة الطباعة تسجل حساب المدير كإعادة، ولا تغيّر اسم الطابع الأصلي."
                  : "تظهر هنا الكشوف المرتبطة بحسابك فقط؛ إلغاء الطباعة يعيد الكشف لغير مطبوع دون فك ارتباط فواتيره."}
              </p>
            </div>
            {printedCustodyClaims.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">لا توجد كشوف مطبوعة</div>
            ) : renderClaimRows(printedCustodyClaims, true)}
          </div>
        </div>
      )}

      {/* ── TAB: RETURNS — المرتجعات ─────────────────────────────────────────── */}
      {tab === "returns" && (
        <div className="space-y-4">
          {/* Header + search */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-black text-lg text-orange-600 flex items-center gap-2">
              <RotateCcw size={18} />مرتجعات فواتير الموردين
            </h2>
            <div className="relative w-72">
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
              <input
                type="text" value={returnsTabQ}
                onChange={e => setReturnsTabQ(e.target.value)}
                placeholder="ابحث بالصنف أو الفاتورة أو المورد أو السيارة..."
                className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>

          {(() => {
            const q = returnsTabQ.trim().toLowerCase();
            const filtered = returnsList.filter(r =>
              !q ||
              r.item_name.toLowerCase().includes(q) ||
              (r.invoice_number ?? "").toLowerCase().includes(q) ||
              (r.supplier_name ?? "").toLowerCase().includes(q) ||
              (r.vehicle_plate ?? "").toLowerCase().includes(q)
            );

            if (filtered.length === 0)
              return (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
                  {returnsTabQ ? "لا توجد نتائج — جرّب بحثاً مختلفاً" : "لا توجد مرتجعات بعد"}
                </div>
              );

            return (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-right font-semibold text-gray-500">التاريخ</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500">رقم الفاتورة</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500">المورد</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500">الصنف</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500">السيارة</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500">الكمية</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500">السبب</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500">بواسطة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, idx) => (
                      <tr key={r.id} className={`border-b border-gray-50 hover:bg-orange-50/40 transition-colors ${idx % 2 === 0 ? "" : "bg-gray-50/40"}`}>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {r.returned_at ? r.returned_at.slice(0, 10) : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {r.invoice_number ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.supplier_name ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{r.item_name}</td>
                        <td className="px-4 py-3">
                          {r.vehicle_plate
                            ? <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 font-bold text-xs px-2 py-0.5 rounded-full"><Truck size={10} />{r.vehicle_plate}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-orange-600 font-black">{r.return_quantity}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{r.reason || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{r.returned_by || <span className="text-gray-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-orange-100 bg-orange-50">
                      <td colSpan={5} className="px-4 py-2 font-bold text-orange-700 text-xs">إجمالي المرتجعات: {filtered.length} صنف</td>
                      <td className="px-4 py-2 font-black text-orange-700 text-sm">
                        {filtered.reduce((s, r) => s + r.return_quantity, 0)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* ══ Modal: Edit Invoice ═══════════════════════════════════════════════ */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-auto max-h-[92vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900 text-base">تعديل الفاتورة #{editingInvoice.id}</h2>
              <button onClick={closeEditInvoice} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">الفرع</label>
                <input
                  value={editForm.branch}
                  onChange={event => setEditForm(previous => ({ ...previous, branch: event.target.value }))}
                  disabled={fleetVehicles.some(vehicle =>
                    vehicle.plate_number.trim().toLowerCase() === editForm.vehicle_plate.trim().toLowerCase()
                  )}
                  list="edit-purchase-company-branches"
                  placeholder={fleetVehicles.some(vehicle =>
                    vehicle.plate_number.trim().toLowerCase() === editForm.vehicle_plate.trim().toLowerCase()
                  ) ? "يُحدد تلقائيًا من بيانات السيارة" : "اكتب الفرع"}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 bg-white disabled:bg-gray-50"
                />
                <datalist id="edit-purchase-company-branches">
                  {branches.map(branch => <option key={branch.id} value={branch.entity_name} />)}
                </datalist>
                {fleetVehicles.some(vehicle =>
                  vehicle.plate_number.trim().toLowerCase() === editForm.vehicle_plate.trim().toLowerCase()
                ) && (
                  <p className="text-[11px] text-gray-400 mt-1">تم تحديد الفرع تلقائيًا من بيانات السيارة في الأسطول.</p>
                )}
              </div>

              <div ref={invVehicleRef} className="relative">
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  السيارة <span className="text-emerald-600 font-bold">(مستودع الورشة = يضاف للمخزون)</span>
                </label>
                <input
                  type="text"
                  value={invVehicleQ !== "" ? invVehicleQ : editForm.vehicle_plate}
                  placeholder="اكتب أو ابحث عن السيارة..."
                  aria-label="ابحث عن سيارة أو أدخل رقم سيارة جديدًا"
                  onFocus={() => { setInvVehicleQ(editForm.vehicle_plate); setInvVehicleOpen(true); }}
                  onChange={event => {
                    const value = event.target.value;
                    const selectedVehicle = fleetVehicles.find(vehicle =>
                      vehicle.plate_number.trim().toLowerCase() === value.trim().toLowerCase()
                    );
                    setInvVehicleQ(value);
                    setInvVehicleOpen(true);
                    setEditForm(previous => ({
                      ...previous,
                      vehicle_plate: value,
                      branch: selectedVehicle?.branch?.trim() || "",
                      trailer_number: value.trim() === "مستودع الورشة"
                        ? ""
                        : selectedVehicle?.linked_trailer_number?.trim() || "",
                      work_on: value.trim() === "مستودع الورشة" ? "" : previous.work_on || "vehicle",
                    }));
                  }}
                  onBlur={() => setTimeout(() => { setInvVehicleOpen(false); setInvVehicleQ(""); }, 150)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 bg-white"
                />
                {invVehicleOpen && (() => {
                  const query = invVehicleQ.trim().toLowerCase();
                  const fixed = ["مستودع الورشة"];
                  const all = [
                    ...fixed,
                    ...extraVehicles,
                    ...(editForm.vehicle_plate.trim() ? [editForm.vehicle_plate.trim()] : []),
                    ...fleetVehicles.map(vehicle => vehicle.plate_number),
                  ];
                  const unique = [...new Set(all)];
                  const filtered = unique.filter(plate => !query || plate.toLowerCase().includes(query));
                  const isNew = query && !unique.some(plate => plate.toLowerCase() === query);
                  return (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-auto">
                      {filtered.map(plate => (
                        <button
                          key={plate}
                          type="button"
                          onMouseDown={() => {
                            const selectedVehicle = fleetVehicles.find(vehicle =>
                              vehicle.plate_number.trim().toLowerCase() === plate.trim().toLowerCase()
                            );
                            const keepCurrentCustomDetails =
                              !selectedVehicle &&
                              plate.trim().toLowerCase() === editForm.vehicle_plate.trim().toLowerCase();
                            setEditForm(previous => ({
                              ...previous,
                              vehicle_plate: plate,
                              branch: selectedVehicle?.branch?.trim() ||
                                (plate === "مستودع الورشة" || keepCurrentCustomDetails ? previous.branch : ""),
                              trailer_number: plate === "مستودع الورشة"
                                ? ""
                                : selectedVehicle?.linked_trailer_number?.trim() ||
                                  (keepCurrentCustomDetails ? previous.trailer_number : ""),
                              work_on: plate === "مستودع الورشة" ? "" : previous.work_on || "vehicle",
                            }));
                            setInvVehicleOpen(false);
                            setInvVehicleQ("");
                          }}
                          className={`w-full text-right px-3 py-2 text-sm hover:bg-cyan-50 flex items-center gap-2
                            ${editForm.vehicle_plate === plate ? "bg-cyan-50 font-bold text-cyan-700" : "text-gray-700"}`}
                        >
                          {plate === "مستودع الورشة" ? "🏭" : "🚛"} {plate}
                        </button>
                      ))}
                      {isNew && (
                        <button
                          type="button"
                          onMouseDown={() => {
                            const value = invVehicleQ.trim();
                            setExtraVehicles(previous => previous.includes(value) ? previous : [...previous, value]);
                            setEditForm(previous => ({
                              ...previous,
                              vehicle_plate: value,
                              branch: "",
                              work_on: previous.work_on || "vehicle",
                              trailer_number: "",
                            }));
                            setInvVehicleOpen(false);
                            setInvVehicleQ("");
                          }}
                          className="w-full text-right px-3 py-2 text-sm text-cyan-700 font-bold hover:bg-cyan-50 border-t border-gray-100 flex items-center gap-2"
                        >
                          <Plus size={13} /> إضافة جديد: "{invVehicleQ.trim()}"
                        </button>
                      )}
                      {filtered.length === 0 && !isNew && (
                        <p className="px-3 py-2 text-xs text-gray-400">لا توجد نتائج</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {editForm.vehicle_plate.trim() !== "مستودع الورشة" ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">الشغل على</label>
                    <select
                      value={editForm.work_on}
                      onChange={event => setEditForm(previous => ({ ...previous, work_on: event.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 bg-white"
                    >
                      <option value="">غير محدد</option>
                      <option value="vehicle">رأس السيارة</option>
                      <option value="trailer">التيدر</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      رقم التيدر {editForm.work_on === "trailer" ? "*" : "(اختياري)"}
                    </label>
                    <select
                      value={editForm.trailer_number}
                      onChange={event => {
                        const number = event.target.value;
                        const owner = fleetVehicles.find(vehicle => vehicle.linked_trailer_number?.trim() === number);
                        setEditForm(previous => ({
                          ...previous,
                          trailer_number: number,
                          branch: !previous.vehicle_plate.trim() && owner?.branch?.trim()
                            ? owner.branch.trim()
                            : previous.branch,
                          work_on: !previous.vehicle_plate.trim() && number ? "trailer" : previous.work_on,
                        }));
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 bg-white"
                    >
                      <option value="">— اختر التيدر —</option>
                      {teidarat.filter(trailer => trailer.teidara_number?.trim()).map(trailer => (
                        <option key={trailer.id} value={trailer.teidara_number!}>{trailer.teidara_number}</option>
                      ))}
                    </select>
                  </div>
                  <p className="col-span-2 -mt-2 text-[11px] text-gray-400">
                    يظهر التيدر المرتبط بالسيارة تلقائيًا. تغييره هنا يخص الفاتورة فقط ولا يغيّر ربط الأسطول.
                  </p>
                  {teidaraLoadError && (
                    <p className="col-span-2 -mt-2 text-[11px] text-red-600">{teidaraLoadError}</p>
                  )}
                </>
              ) : (
                <div className="col-span-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  هذه الفاتورة مخصصة لمخزون الورشة، لذلك لا تُسند إلى رأس أو تيدر.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">التاريخ</label>
                <input
                  type="date"
                  value={editForm.invoice_date}
                  onChange={event => setEditForm(previous => ({ ...previous, invoice_date: event.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">رقم الفاتورة</label>
                <input
                  type="text"
                  value={editForm.invoice_number}
                  onChange={event => setEditForm(previous => ({ ...previous, invoice_number: event.target.value }))}
                  placeholder="INV-001"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">المورد</label>
                <input
                  type="text"
                  list="edit-purchase-invoice-suppliers"
                  value={editForm.supplier_name}
                  onChange={event => {
                    const name = event.target.value;
                    const match = suppliers.find(supplier =>
                      supplier.name.trim().toLowerCase() === name.trim().toLowerCase()
                    );
                    setEditForm(previous => ({
                      ...previous,
                      supplier_name: name,
                      supplier_id: match ? String(match.id) : "",
                    }));
                  }}
                  placeholder="ابحث أو اكتب اسم مورد جديد..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 bg-white"
                />
                <datalist id="edit-purchase-invoice-suppliers">
                  {suppliers.map(supplier => <option key={supplier.id} value={supplier.name} />)}
                </datalist>
                <p className="text-[11px] text-gray-400 mt-1">
                  إذا لم يكن المورد موجودًا، سيُضاف تلقائيًا إلى قائمة الموردين.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">المسلسل</label>
                <input
                  type="text"
                  value={editForm.serial_no}
                  onChange={event => setEditForm(previous => ({ ...previous, serial_no: event.target.value }))}
                  placeholder="اختياري"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
              {/* Full-width item_name */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1">اسم قطعة الغيار *</label>
                {editForm.vehicle_plate.trim() === "مستودع الورشة" ? (
                  <>
                    <input
                      type="text"
                      list={`edit-workshop-items-${editingInvoice.id}`}
                      value={editForm.item_name}
                      onChange={event => setEditForm(previous => ({ ...previous, item_name: event.target.value }))}
                      placeholder="اختر صنفاً موجوداً أو اكتب اسم جديد..."
                      className="w-full border border-cyan-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 bg-white"
                    />
                    <datalist id={`edit-workshop-items-${editingInvoice.id}`}>
                      {inventory.map(item => (
                        <option key={item.id} value={item.item_name}>
                          {item.item_name} — {item.quantity.toLocaleString("ar-SA")} {item.unit}
                        </option>
                      ))}
                    </datalist>
                  </>
                ) : (
                  <input
                    type="text"
                    value={editForm.item_name}
                    onChange={event => setEditForm(previous => ({ ...previous, item_name: event.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                  />
                )}
              </div>
              {[
                { key: "price_before_vat", label: "السعر قبل الضريبة", type: "number" },
                { key: "quantity",         label: "الكمية",             type: "number" },
                { key: "price_after_vat",  label: "القيمة بعد الضريبة",type: "number" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    value={(editForm as Record<string, string>)[f.key]}
                    onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>
              ))}
              {/* Editable totals — back-calculates unit price on change */}
              <div>
                <label className="block text-xs font-semibold text-amber-600 mb-1">الإجمالي قبل الضريبة</label>
                <input
                  type="number" min="0"
                  value={String((Number(editForm.quantity) || 0) * (Number(editForm.price_before_vat) || 0))}
                  onChange={e => {
                    const total = Number(e.target.value) || 0;
                    const qty = Number(editForm.quantity) || 1;
                    setEditForm(p => ({ ...p, price_before_vat: String(total / qty) }));
                  }}
                  className="w-full border border-amber-300 bg-amber-50 rounded-xl px-3 py-2 text-sm font-bold text-amber-700 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#103c68] mb-1">الإجمالي بعد الضريبة</label>
                <input
                  type="number" min="0"
                  value={String((Number(editForm.quantity) || 0) * (Number(editForm.price_after_vat) || 0))}
                  onChange={e => {
                    const total = Number(e.target.value) || 0;
                    const qty = Number(editForm.quantity) || 1;
                    setEditForm(p => ({ ...p, price_after_vat: String(total / qty) }));
                  }}
                  className="w-full border border-blue-300 bg-blue-50 rounded-xl px-3 py-2 text-sm font-bold text-[#103c68] focus:outline-none focus:border-blue-500"
                />
              </div>
              {/* Full-width notes */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1">ملاحظة</label>
                <textarea
                  value={editForm.notes} rows={2}
                  onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 resize-none"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={saveEditInvoice} disabled={submitting}
                className="flex-1 py-3 bg-[#103c68] text-white rounded-xl font-black text-sm hover:bg-[#0d3057] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? <RefreshCw size={14} className="animate-spin" /> : null}
                {submitting ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>
              <button
                onClick={closeEditInvoice}
                className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Returns ════════════════════════════════════════════════════ */}
      {returnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-black text-lg flex items-center gap-2 text-orange-600">
                <RotateCcw size={18} />مرتجع فواتير الموردين
              </h2>
              <button onClick={() => setReturnOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>

            {/* Search */}
            <div className="px-6 pt-4 flex-shrink-0">
              <div className="relative">
                <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
                <input
                  type="text" value={returnQ}
                  onChange={e => setReturnQ(e.target.value)}
                  placeholder="ابحث بالاسم أو رقم الفاتورة أو اسم المورد..."
                  className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                  autoFocus
                />
              </div>
              {returnSels.size > 0 && (
                <p className="text-xs text-orange-600 font-bold mt-2">
                  {returnSels.size} صنف محدد للإرجاع
                </p>
              )}
            </div>

            {/* Results list */}
            <div className="px-6 py-3 overflow-auto flex-1">
              {(() => {
                const q = returnQ.trim().toLowerCase();
                const filtered = invoices.filter(inv =>
                  !q ||
                  inv.item_name.toLowerCase().includes(q) ||
                  (inv.invoice_number ?? "").toLowerCase().includes(q) ||
                  (inv.supplier_name ?? "").toLowerCase().includes(q) ||
                  (inv.vehicle_plate ?? "").toLowerCase().includes(q)
                ).slice(0, 50);

                if (filtered.length === 0)
                  return <p className="text-center text-gray-400 text-sm py-8">لا توجد نتائج — جرّب بحثاً مختلفاً</p>;

                return (
                  <div className="space-y-2">
                    {filtered.map(inv => {
                      const sel = returnSels.get(inv.id);
                      const isSelected = !!sel;
                      return (
                        <div key={inv.id}
                          className={`rounded-xl border p-3 transition-all ${isSelected ? "border-orange-400 bg-orange-50" : "border-gray-100 bg-gray-50 hover:border-gray-200"}`}>
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={isSelected}
                              onChange={e => {
                                setReturnSels(prev => {
                                  const next = new Map(prev);
                                  if (e.target.checked) next.set(inv.id, { qty: String(inv.quantity || 1), reason: "" });
                                  else next.delete(inv.id);
                                  return next;
                                });
                              }}
                              className="mt-1 accent-orange-500 w-4 h-4 flex-shrink-0 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-gray-900">{inv.item_name}</span>
                                {inv.invoice_number && <span className="text-xs text-gray-400">#{inv.invoice_number}</span>}
                                {inv.supplier_name && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{inv.supplier_name}</span>}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5 flex gap-3">
                                {inv.vehicle_plate && <span>🚛 {inv.vehicle_plate}</span>}
                                {inv.invoice_date && <span>📅 {inv.invoice_date}</span>}
                                <span>الكمية: {inv.quantity}</span>
                              </div>
                              {isSelected && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-500 mb-0.5 block">كمية الإرجاع</label>
                                    <input type="number" min="0.01" step="any"
                                      value={sel.qty}
                                      onChange={e => setReturnSels(prev => {
                                        const next = new Map(prev);
                                        next.set(inv.id, { ...sel, qty: e.target.value });
                                        return next;
                                      })}
                                      className="w-full border border-orange-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500 mb-0.5 block">سبب الإرجاع</label>
                                    <input type="text"
                                      value={sel.reason}
                                      onChange={e => setReturnSels(prev => {
                                        const next = new Map(prev);
                                        next.set(inv.id, { ...sel, reason: e.target.value });
                                        return next;
                                      })}
                                      placeholder="اختياري"
                                      className="w-full border border-orange-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-3 border-t border-gray-100 flex-shrink-0 flex gap-3">
              {returnDone ? (
                <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-50 rounded-xl text-green-700 font-bold text-sm">
                  <CheckCircle size={16} />{returnDone}
                </div>
              ) : (
                <>
                  <button onClick={submitReturn} disabled={returnSubmitting || returnSels.size === 0}
                    className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-black text-sm hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {returnSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                    {returnSubmitting ? "جاري الإرجاع..." : `إرجاع ${returnSels.size > 0 ? `(${returnSels.size} صنف)` : ""}`}
                  </button>
                  <button onClick={() => setReturnOpen(false)}
                    className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                    إلغاء
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── TAB: SUPPLIERS ──────────────────────────────────────────────────── */}
      {tab === "suppliers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-500">{suppliers.length} مورد نشط</span>
            <button
              onClick={() => { setEditingSupplier(null); setSupplierForm({ name: "", phone: "", specialty: "", notes: "" }); setSupplierModal(true); }}
              className="flex items-center gap-1.5 bg-cyan-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-cyan-700 transition-colors">
              <Plus size={14} />إضافة مورد
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><RefreshCw size={22} className="animate-spin text-cyan-600" /></div>
          ) : suppliers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Truck size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="font-semibold text-gray-500">لا يوجد موردون مضافون بعد</p>
              <p className="text-xs text-gray-400 mt-1">اضغط "إضافة مورد" لبدء قاعدة بيانات الموردين</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                    <th className="text-right px-4 py-3">المورد</th>
                    <th className="text-right px-4 py-3">التخصص</th>
                    <th className="text-center px-4 py-3">طلبات</th>
                    <th className="text-center px-4 py-3">مستلمة</th>
                    <th className="text-center px-4 py-3">التقييم</th>
                    <th className="text-center px-4 py-3">فواتير</th>
                    <th className="text-center px-4 py-3">إجمالي (ريال)</th>
                    <th className="text-center px-4 py-3">آخر صفقة</th>
                    <th className="text-center px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(s => {
                    const rating = s.avg_rating || 0;
                    const deliveryRate = s.order_count > 0 ? Math.round((s.received_count / s.order_count) * 100) : 0;
                    const combinedTotal = s.total_amount + s.inv_total;
                    return (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <button onClick={() => { setSupplierHistoryTab("requests"); openSupplierHistory(s); }}
                            className="font-bold text-cyan-700 hover:underline text-right block">
                            {s.name}
                          </button>
                          {s.phone && <div className="text-xs text-gray-400 font-mono mt-0.5">{s.phone}</div>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{s.specialty || "—"}</td>
                        <td className="px-4 py-3 text-center font-bold text-gray-800">{s.order_count}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            deliveryRate >= 80 ? "bg-green-100 text-green-700" :
                            deliveryRate >= 50 ? "bg-amber-100 text-amber-700" :
                            s.order_count === 0 ? "bg-gray-100 text-gray-400" : "bg-red-100 text-red-700"
                          }`}>
                            {s.order_count > 0 ? `${deliveryRate}%` : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {rating > 0 ? (
                            <span className="text-amber-400 font-bold text-sm">
                              {"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}
                              <span className="text-xs text-gray-400 mr-1">{rating.toFixed(1)}</span>
                            </span>
                          ) : <span className="text-gray-300 text-xs">لا يوجد</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-600">
                          {s.inv_count > 0 ? <span className="font-bold">{s.inv_count}</span> : "—"}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-cyan-700">{combinedTotal > 0 ? sar(combinedTotal) : "—"}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{s.last_deal ? fmtDate(s.last_deal) : "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => { setEditingSupplier(s); setSupplierForm({ name: s.name, phone: s.phone || "", specialty: s.specialty || "", notes: s.notes || "" }); setSupplierModal(true); }}
                              className="text-cyan-600 hover:underline text-xs font-semibold">تعديل</button>
                            <button onClick={() => deactivateSupplier(s.id)}
                              className="text-red-400 hover:text-red-600 text-xs font-semibold">إيقاف</button>
                          </div>
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

      {/* ── Modal: Supplier Add/Edit ──────────────────────────────────────────── */}
      {supplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-black text-gray-900">{editingSupplier ? "تعديل المورد" : "إضافة مورد جديد"}</h2>
              <button onClick={() => { setSupplierModal(false); setEditingSupplier(null); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {[
                { label: "اسم المورد *",  key: "name",      type: "text",   placeholder: "مثال: شركة الخليج للقطع" },
                { label: "رقم الهاتف",    key: "phone",     type: "tel",    placeholder: "05XXXXXXXX" },
                { label: "التخصص",        key: "specialty", type: "text",   placeholder: "قطع غيار / إطارات / زيوت..." },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                  <input type={f.type}
                    value={(supplierForm as Record<string, string>)[f.key]}
                    onChange={e => setSupplierForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">ملاحظات</label>
                <textarea rows={2} value={supplierForm.notes}
                  onChange={e => setSupplierForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 resize-none" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={saveSupplier} disabled={submitting}
                className="flex-1 py-3 bg-cyan-600 text-white rounded-xl font-black text-sm hover:bg-cyan-700 transition-colors disabled:opacity-60">
                {submitting ? "..." : "حفظ"}
              </button>
              <button onClick={() => { setSupplierModal(false); setEditingSupplier(null); }}
                className="px-5 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Supplier History ───────────────────────────────────────────── */}
      {supplierHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/50 backdrop-blur-sm overflow-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="font-black text-gray-900 flex items-center gap-2">
                  <Truck size={18} className="text-cyan-600" />{supplierHistoryOpen.name}
                </h2>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs">
                  {supplierHistoryOpen.phone && <span className="text-gray-400">📞 {supplierHistoryOpen.phone}</span>}
                  {supplierHistoryOpen.specialty && <span className="text-gray-400">🔧 {supplierHistoryOpen.specialty}</span>}
                  {supplierHistoryOpen.avg_rating > 0 && (
                    <span className="text-amber-500 font-bold">
                      {"★".repeat(Math.round(supplierHistoryOpen.avg_rating))} {supplierHistoryOpen.avg_rating.toFixed(1)}
                    </span>
                  )}
                </div>
                {/* KPIs */}
                <div className="flex gap-4 mt-2 flex-wrap">
                  {[
                    { label: "طلبات الشراء", val: supplierHistoryData.requests.length, color: "text-gray-700" },
                    { label: "فواتير",        val: supplierHistoryData.invoices.length, color: "text-gray-700" },
                    { label: "إجمالي الطلبات", val: sar(supplierHistoryData.requests.reduce((s,r)=>s+r.actual_cost,0)), color: "text-cyan-700" },
                    { label: "إجمالي الفواتير", val: sar(supplierHistoryData.invoices.reduce((s,i)=>s+i.quantity*(i.price_after_vat||0),0)), color: "text-cyan-700" },
                  ].map(k => (
                    <div key={k.label} className="text-center">
                      <div className={`text-sm font-black ${k.color}`}>{k.val}</div>
                      <div className="text-xs text-gray-400">{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setSupplierHistoryOpen(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 px-6 pt-4">
              {([
                { id: "requests", label: `طلبات الشراء (${supplierHistoryData.requests.length})` },
                { id: "invoices", label: `الفواتير (${supplierHistoryData.invoices.length})` },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setSupplierHistoryTab(t.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    supplierHistoryTab === t.id ? "bg-cyan-600 text-white" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="overflow-auto max-h-[50vh] mt-2">
              {/* Requests tab */}
              {supplierHistoryTab === "requests" && (
                supplierHistoryData.requests.length === 0 ? (
                  <div className="p-12 text-center">
                    <Package size={32} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-gray-400 text-sm">لا توجد طلبات شراء مرتبطة بهذا المورد</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="border-b border-gray-100 text-xs text-gray-500">
                        <th className="text-right px-4 py-3">الصنف</th>
                        <th className="text-center px-4 py-3">الكمية</th>
                        <th className="text-center px-4 py-3">التكلفة</th>
                        <th className="text-center px-4 py-3">التقييم</th>
                        <th className="text-center px-4 py-3">الحالة</th>
                        <th className="text-center px-4 py-3">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierHistoryData.requests.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-semibold text-gray-800">
                            {r.item_name}
                            {(r as PurchaseRequest & { quality_notes?: string }).quality_notes && (
                              <div className="text-xs text-gray-400 mt-0.5">{(r as PurchaseRequest & { quality_notes?: string }).quality_notes}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">{r.quantity} {r.unit}</td>
                          <td className="px-4 py-3 text-center font-bold text-cyan-700">{r.actual_cost > 0 ? sar(r.actual_cost) : "—"}</td>
                          <td className="px-4 py-3 text-center text-amber-400 text-sm">
                            {(r as PurchaseRequest & { rating?: number }).rating
                              ? "★".repeat((r as PurchaseRequest & { rating?: number }).rating!)
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLE[r.status]}`}>
                              {STATUS_LABEL[r.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-400">{fmtDate(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-bold">
                        <td className="px-4 py-3 text-gray-600" colSpan={2}>الإجمالي</td>
                        <td className="px-4 py-3 text-center text-cyan-700">
                          {sar(supplierHistoryData.requests.reduce((s, r) => s + r.actual_cost, 0))}
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                )
              )}
              {/* Invoices tab */}
              {supplierHistoryTab === "invoices" && (
                supplierHistoryData.invoices.length === 0 ? (
                  <div className="p-12 text-center">
                    <FileSpreadsheet size={32} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-gray-400 text-sm">لا توجد فواتير مرتبطة بهذا المورد</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="border-b border-gray-100 text-xs text-gray-500">
                        <th className="text-right px-4 py-3">الصنف</th>
                        <th className="text-right px-4 py-3">رقم الفاتورة</th>
                        <th className="text-center px-4 py-3">الكمية</th>
                        <th className="text-center px-4 py-3">قبل الضريبة</th>
                        <th className="text-center px-4 py-3">بعد الضريبة</th>
                        <th className="text-center px-4 py-3">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierHistoryData.invoices.map(inv => (
                        <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-semibold text-gray-800">{inv.item_name}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{inv.invoice_number || "—"}</td>
                          <td className="px-4 py-3 text-center font-bold">{inv.quantity}</td>
                          <td className="px-4 py-3 text-center text-amber-700">{inv.price_before_vat > 0 ? sar(inv.price_before_vat) : "—"}</td>
                          <td className="px-4 py-3 text-center font-bold text-cyan-700">{inv.price_after_vat > 0 ? sar(inv.quantity * inv.price_after_vat) : "—"}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-400">{fmtDate(inv.invoice_date || "")}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-bold">
                        <td className="px-4 py-3 text-gray-600" colSpan={4}>إجمالي بعد الضريبة</td>
                        <td className="px-4 py-3 text-center text-cyan-700">
                          {sar(supplierHistoryData.invoices.reduce((s, i) => s + i.quantity * (i.price_after_vat || 0), 0))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 text-right">
              <button onClick={() => setSupplierHistoryOpen(null)}
                className="px-6 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
