import { useEffect, useState, useMemo, useRef } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { useAuth } from "@/context/AuthContext";
import { MonthShortcuts } from "@/components/MonthShortcuts";
import {
  Warehouse, Package, AlertTriangle, TrendingDown, TrendingUp, RefreshCw,
  Plus, Pencil, Save, X, Send, CheckCircle, Clock, BarChart3, Truck,
  ChevronDown, ChevronUp, FileText, MapPin, ClipboardList, Trash2, CheckCheck,
  RotateCcw, Download, Printer, Users,
} from "lucide-react";
import * as XLSX from "xlsx";

interface WarehouseItem {
  id: number; warehouse_id: number; product_name: string;
  product_id?: number | null;
  quantity: number; unit: string; min_stock: number; max_stock: number;
  last_updated: string; notes?: string; active?: number | null;
}
interface WarehouseInfo {
  id: number; name: string; location?: string; manager_name?: string;
  capacity: number; active: number; lat?: number; lng?: number;
  warehouse_manager_user_id?: number;
}
interface SupplyRequest {
  id: number; product_name: string; requested_qty: number; unit: string;
  trailer_loads: number; status: string; auto_triggered: number;
  destination_division?: string; created_at: string; priority: string;
  vehicle_plate?: string; driver_name?: string; driver_phone?: string;
  invoice_image?: string; driver_loading_image?: string;
  cargo_type?: string; redirect_location?: string;
  parent_id?: number; warehouse_id?: number; warehouse_name?: string;
  batch_id?: string; notes?: string;
}
interface TrailerConfig {
  id: number; name: string; product_category: string; trailer_capacity: number; min_threshold: number; approved_qty: number; unit: string;
}
interface VehicleTypeDef { id: number; name: string; icon: string; }
interface CatalogProduct { id: number; name: string; unit: string; image_url?: string | null; }

interface WarehouseOrder {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string;
  total_with_vat: number; stage: string; invoice_number?: string;
  vehicle_plate?: string; driver_name?: string; created_at: string;
  invoice_date?: string; delivery_date?: string;
  loading_point_name?: string;
}

interface WarehouseReturn {
  id: number; warehouse_id: number; warehouse_name?: string;
  product_name: string; product_id?: number; warehouse_item_id?: number;
  unit: string; quantity: number;
  reason?: string; returned_by?: string; created_by?: string; created_at: string;
}

interface DispatchOrder {
  id: number; warehouse_id: number; warehouse_name: string;
  product_name: string; product_id?: number; unit: string;
  quantity: number; price: number;
  payment_status: "paid" | "unpaid";
  recipient_name?: string; notes?: string;
  status: "pending" | "delivered";
  created_by?: string; created_at: string; delivered_at?: string;
}

type TimeFilter = "today" | "week" | "month" | "year" | "custom";

const TIME_LABELS: Record<TimeFilter, string> = {
  today: "اليوم",
  week: "هذا الأسبوع",
  month: "هذا الشهر",
  year: "هذه السنة",
  custom: "فترة مخصصة",
};

function filterByTime(dateStr: string, filter: TimeFilter, dateFrom?: string, dateTo?: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  if (filter === "today") return d.toDateString() === now.toDateString();
  if (filter === "week") { const w = new Date(now); w.setDate(now.getDate() - 7); return d >= w; }
  if (filter === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (filter === "year") return d.getFullYear() === now.getFullYear();
  if (filter === "custom") {
    const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
    const to   = dateTo   ? new Date(dateTo   + "T23:59:59") : null;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  }
  return true;
}

export default function WarehouseManagerDashboard() {
  const { user } = useAuth();
  const [warehouse, setWarehouse] = useState<WarehouseInfo | null>(null);
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [trailerConfigs, setTrailerConfigs] = useState<TrailerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useRememberedState("warehouse-manager-time-filter", "month" as TimeFilter);
  const _pm = (() => { const t = new Date(); const p = (n: number) => String(n).padStart(2, "0"); const f = (d: Date) => `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; return { from: f(new Date(t.getFullYear(), t.getMonth()-1, 1)), to: f(new Date(t.getFullYear(), t.getMonth(), 0)) }; })();
  const [dateFrom, setDateFrom] = useRememberedState("warehouse-manager-date-from", _pm.from);
  const [dateTo,   setDateTo]   = useRememberedState("warehouse-manager-date-to", _pm.to);
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<WarehouseItem>>({});
  const [savingItem, setSavingItem] = useState(false);
  const [sendingReq, setSendingReq] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ product_name: "", product_id: null as number | null, quantity: 0, unit: "كيس", min_stock: 0, max_stock: 0 });
  const [autoRep, setAutoRep] = useState(false);
  const [tab, setTab] = useRememberedState("warehouse-manager-tab", "stock" as "stock" | "dispatch" | "requests" | "trips" | "orders" | "analytics" | "returns");
  const [warehouseOrders, setWarehouseOrders] = useState<WarehouseOrder[]>([]);
  const [vtDefs, setVtDefs] = useState<VehicleTypeDef[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [replenishConfirm, setReplenishConfirm] = useState<{ item: WarehouseItem; qty: number; cfg: TrailerConfig | undefined } | null>(null);
  const [submittingTransport, setSubmittingTransport] = useState(false);
  const [manualQtys, setManualQtys]   = useState<Record<number, number>>({});
  const [manualNotes, setManualNotes] = useState("");
  const [sendMode, setSendMode]       = useState<"separate" | "combined">("separate");
  const [redirectId, setRedirectId]         = useState<number | null>(null);
  const [redirectDest, setRedirectDest]     = useState("");
  const [confirmingRedirectId, setConfirmingRedirectId] = useState<number | null>(null);
  const [receiveNotesId, setReceiveNotesId] = useState<number | null>(null);
  const [receiveNotesText, setReceiveNotesText] = useState("");
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [dispatchOrders, setDispatchOrders] = useState<DispatchOrder[]>([]);
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [dispatchForm, setDispatchForm] = useState({
    product_name: "", product_id: null as number | null, warehouse_item_id: null as number | null, unit: "وحدة",
    quantity: "", price: "", payment_status: "unpaid", recipient_name: "", notes: "",
  });
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [deliveringId, setDeliveringId] = useState<number | null>(null);
  const [togglingPayId, setTogglingPayId] = useState<number | null>(null);
  const [showClosedItems, setShowClosedItems] = useRememberedState("warehouse-manager-show-closed-items", false);
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null);
  const [editingSrId, setEditingSrId] = useState<number | null>(null);
  const [editingSrDraft, setEditingSrDraft] = useState({ requested_qty: 0, trailer_loads: 1, destination_division: "", notes: "" });
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null);
  const [newLocation, setNewLocation] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [showManualSupply, setShowManualSupply] = useState(false);
  useEffect(() => { if (tab === "requests") setShowManualSupply(true); }, [tab]);
  // ── Returns state ──
  const [returns, setReturns] = useState<WarehouseReturn[]>([]);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnForm, setReturnForm] = useState({ product_name: "", product_id: null as number | null, warehouse_item_id: null as number | null, unit: "وحدة", quantity: "", reason: "", returned_by: "" });
  const [savingReturn, setSavingReturn] = useState(false);
  // ── Reps list (for dispatch recipient combobox) ──
  const [repsList, setRepsList] = useState<{ id: number; name: string; phone: string }[]>([]);
  // ── Edit return state ──
  const [editingReturnId, setEditingReturnId] = useState<number | null>(null);
  const [editReturnDraft, setEditReturnDraft] = useState({ quantity: "", reason: "", returned_by: "" });
  const [savingEditReturn, setSavingEditReturn] = useState(false);
  // ── Edit dispatch state ──
  const [editingDispatchId, setEditingDispatchId] = useState<number | null>(null);
  const [editDispatchDraft, setEditDispatchDraft] = useState({ quantity: "", price: "", recipient_name: "", notes: "", payment_status: "unpaid" });
  const [savingEditDispatch, setSavingEditDispatch] = useState(false);

  const reportRef = useRef<HTMLDivElement | null>(null);

  const exportDispatchXlsx = () => {
    if (!dispatchOrders.length) { alert("لا توجد أوامر صرف للتصدير"); return; }
    const wbName = warehouse?.name || "المستودع";
    const data = dispatchOrders.map(o => ({
      "التاريخ":        new Date(o.created_at).toLocaleDateString("ar-SA"),
      "المنتج":         o.product_name,
      "الكمية":         o.quantity,
      "الوحدة":         o.unit,
      "السعر":          o.price,
      "الإجمالي":       o.quantity * o.price,
      "حالة الدفع":     o.payment_status === "paid" ? "مدفوع" : "غير مدفوع",
      "المستلم":        o.recipient_name || "",
      "الحالة":         o.status === "delivered" ? "تم التسليم" : "معلق",
      "ملاحظات":        o.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "أوامر الصرف");
    XLSX.writeFile(wb, `أوامر_الصرف_${wbName}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const printDispatchOrder = (o: DispatchOrder) => {
    const subtotal  = o.quantity * o.price;
    const vat       = subtotal * 0.15;
    const total     = subtotal + vat;
    const fmt       = (n: number) => n.toLocaleString("ar-SA", { minimumFractionDigits: 2 });
    const fmtDate   = (s: string) => new Date(s).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    const today     = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });

    // Dynamic rows — every non-null field auto-appears
    const rows: [string, string, string?][] = [
      ["رقم أمر الصرف",              `#${o.id}`,                                                          "bold"],
      ["المستودع",                   o.warehouse_name || "—"],
      ["التاريخ",                    fmtDate(o.created_at)],
      ["المنتج",                     o.product_name,                                                       "bold"],
      ["الكمية",                     `${o.quantity.toLocaleString("ar-SA")} ${o.unit}`,                    "bold"],
      ["سعر الوحدة",                  `${fmt(o.price)} ر.س`],
      ["المجموع قبل الضريبة",         `${fmt(subtotal)} ر.س`,                                               "subtotal"],
      ["ضريبة القيمة المضافة (15%)",  `${fmt(vat)} ر.س`,                                                   "vat"],
      ["الإجمالي شامل الضريبة",       `${fmt(total)} ر.س`,                                                  "total"],
      ["المستلم",                    o.recipient_name || "—"],
      ["حالة الدفع",                 o.payment_status === "paid" ? "✓ مدفوع" : "غير مدفوع",               o.payment_status === "paid" ? "paid" : "unpaid"],
      ["حالة الأمر",                  o.status === "delivered" ? "✓ تم التسليم" : "معلق",                   o.status === "delivered" ? "delivered" : "pending"],
      ...(o.delivered_at ? [["تاريخ التسليم", fmtDate(o.delivered_at)] as [string, string]] : []),
      ...(o.created_by  ? [["أُنشئ بواسطة", o.created_by]            as [string, string]] : []),
      ...(o.notes        ? [["ملاحظات",       o.notes]                 as [string, string]] : []),
    ];

    const rowHtml = rows.map(([label, val, style]) => {
      let tdStyle = "padding:8px 14px;";
      let valStyle = "padding:8px 14px;font-weight:500;";
      if (style === "bold")     valStyle += "font-weight:800;font-size:15px;color:#103c68;";
      if (style === "subtotal") tdStyle += "border-top:2px solid #e5e7eb;"; valStyle += style === "subtotal" ? "border-top:2px solid #e5e7eb;" : "";
      if (style === "total")    { tdStyle += "background:#103c68;color:#fff;font-weight:900;font-size:16px;"; valStyle += "background:#103c68;color:#fff;font-weight:900;font-size:16px;"; }
      if (style === "vat")      { valStyle += "color:#b45309;"; }
      if (style === "paid")     valStyle += "color:#16a34a;font-weight:700;";
      if (style === "unpaid")   valStyle += "color:#d97706;font-weight:700;";
      if (style === "delivered") valStyle += "color:#16a34a;font-weight:700;";
      if (style === "pending")  valStyle += "color:#d97706;font-weight:700;";
      return `<tr>
        <td style="${tdStyle}color:#333;font-size:13px;font-weight:600;width:45%">${label}</td>
        <td style="${valStyle}font-size:13px;">${val}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>أمر صرف #${o.id}</title>
<style>
  @page{size:A4 portrait;margin:15mm}html{width:210mm}body{width:210mm;margin:0 auto;padding:0}*{box-sizing:border-box}
  body{font-family:'Arial',sans-serif;direction:rtl;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#f3f4f6}
  @media screen{.page{max-width:180mm;margin:8mm auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}}
  @media print{body{background:#fff}.page{margin:0;border-radius:0;box-shadow:none}}
  .header{background:#103c68;color:#fff;padding:24px 28px;display:flex;justify-content:space-between;align-items:center}
  .header h1{font-size:22px;font-weight:900;letter-spacing:-0.5px}
  .header .sub{font-size:13px;opacity:1;font-weight:600;margin-top:4px}
  .badge{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:6px 14px;font-size:13px;font-weight:700}
  table{width:100%;border-collapse:collapse}
  tr:nth-child(even) td{background:#f9fafb}
  .section-title{background:#e2e8f0;padding:10px 14px;font-size:12px;font-weight:700;color:#111;letter-spacing:.5px;text-transform:uppercase}
  .sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:24px 28px;border-top:1px solid #e5e7eb}
  .sig{text-align:center}
  .sig-line{border-top:1.5px solid #94a3b8;margin-bottom:6px;margin-top:40px}
  .sig-label{font-size:12px;color:#333;font-weight:700}
  .footer{background:#f8fafc;padding:10px 28px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}
  .footer span{font-size:11px;color:#555;font-weight:600}
  @media print{body{background:#fff}.page{margin:0;border-radius:0;box-shadow:none}button{display:none}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="sub">نظام إدارة المستودعات — MKGH</div>
      <h1>أمر صرف مستودع</h1>
    </div>
    <div class="badge">📋 #${o.id}</div>
  </div>
  <div class="section-title">تفاصيل أمر الصرف</div>
  <table>${rowHtml}</table>
  <div class="sigs">
    <div class="sig"><div class="sig-line"></div><div class="sig-label">أمين المستودع</div></div>
    <div class="sig"><div class="sig-line"></div><div class="sig-label">المستلم</div></div>
    <div class="sig"><div class="sig-line"></div><div class="sig-label">المراجع</div></div>
  </div>
  <div class="footer">
    <span>تاريخ الطباعة: ${today}</span>
    <span>MKGH Logistics Platform</span>
  </div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;

    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) { alert("يرجى السماح بالنوافذ المنبثقة لطباعة أمر الصرف"); return; }
    w.document.write(html);
    w.document.close();
  };

  const printReport = () => {
    if (!reportRef.current) return;
    const html = reportRef.current.innerHTML;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/>
      <title>تقرير المستودع</title>
      <style>
        body{font-family:Arial,sans-serif;direction:rtl;padding:20px;color:#1a1a1a;}
        h2{text-align:center;color:#103c68;margin-bottom:4px;}
        p.sub{text-align:center;color:#333;font-size:13px;font-weight:600;margin-bottom:20px;}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;}
        th{background:#103c68;color:#fff;padding:8px 10px;text-align:right;}
        td{padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:right;}
        tr:nth-child(even) td{background:#f8fafc;}
        .total td{background:#f0f6ff;font-weight:bold;}
        .section-title{font-weight:bold;color:#103c68;font-size:14px;margin:16px 0 6px;}
        @media print{body{padding:10px;} button{display:none;}}
      </style></head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const load = async () => {
    setLoading(true);
    try {
      // Find this manager's warehouse from all warehouses
      const allWh = await fetch("/api/warehouses/all").then(r => r.json()).catch(() => []);
      const myWh: WarehouseInfo | undefined = Array.isArray(allWh)
        ? allWh.find((w: WarehouseInfo) => w.warehouse_manager_user_id === user?.id || w.manager_name === user?.name)
        : undefined;

      if (myWh) {
        setWarehouse(myWh);
        const [whData, reqs, configs, settings, wOrders, vts, prods, repsData] = await Promise.all([
          fetch(`/api/warehouses/${myWh.id}`).then(r => r.json()),
          fetch(`/api/supply-requests?warehouse_id=${myWh.id}`).then(r => r.json()),
          fetch("/api/trailer-configs").then(r => r.json()),
          fetch("/api/invoice-settings").then(r => r.json()),
          fetch(`/api/warehouses/${myWh.id}/orders`).then(r => r.json()),
          fetch("/api/vehicle-type-defs").then(r => r.json()).catch(() => []),
          fetch("/api/products").then(r => r.json()).catch(() => []),
          fetch("/api/reps").then(r => r.json()).catch(() => []),
        ]);
        setItems(Array.isArray(whData.items) ? whData.items : []);
        setRequests(Array.isArray(reqs) ? reqs : []);
        setTrailerConfigs(Array.isArray(configs) ? configs : []);
        setAutoRep(settings?.auto_replenishment === 1);
        setWarehouseOrders(Array.isArray(wOrders) ? wOrders : []);
        setVtDefs(Array.isArray(vts) ? vts.filter((v: VehicleTypeDef) => v.name === "سطحة" || v.name === "ونش") : []);
        setCatalogProducts(Array.isArray(prods) ? prods : []);
        setRepsList(Array.isArray(repsData) ? repsData : []);
        const [dOrders, rets] = await Promise.all([
          fetch(`/api/warehouse-dispatch-orders?warehouse_id=${myWh.id}`).then(r => r.json()).catch(() => []),
          fetch(`/api/warehouse-returns?warehouse_id=${myWh.id}`).then(r => r.json()).catch(() => []),
        ]);
        setDispatchOrders(Array.isArray(dOrders) ? dOrders : []);
        setReturns(Array.isArray(rets) ? rets : []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const activeItems      = useMemo(() => items.filter(i => (i.active ?? 1) !== 0), [items]);
  const closedItems      = useMemo(() => items.filter(i => (i.active ?? 1) === 0), [items]);
  const lowStockItems    = useMemo(() => activeItems.filter(i => (i.quantity ?? 0) > 0 && (i.min_stock ?? 0) > 0 && (i.quantity ?? 0) <= (i.min_stock ?? 0)), [activeItems]);
  const filteredRequests = useMemo(() => requests.filter(r => filterByTime(r.created_at, timeFilter, dateFrom, dateTo)), [requests, timeFilter, dateFrom, dateTo]);
  const activeTrips      = useMemo(() => requests.filter(r =>
    ["pending_permit","supervisor_assigned","in_transit","loaded","delivered_to_warehouse","pending_warehouse_approval"].includes(r.status)
  ), [requests]);
  const redirectedTrips  = useMemo(() => requests.filter(r => r.status === "redirected"), [requests]);
  const completedTrips   = useMemo(() => requests.filter(r => ["received","completed"].includes(r.status)), [requests]);
  const incomingByProduct = useMemo(() => {
    const map: Record<string, { qty: number; unit: string }> = {};
    requests.filter(r => !["received","cancelled","rejected","redirected","completed"].includes(r.status))
      .forEach(r => {
        if (!map[r.product_name]) map[r.product_name] = { qty: 0, unit: r.unit };
        map[r.product_name].qty += r.requested_qty;
      });
    return map;
  }, [requests]);

  const startEdit = (item: WarehouseItem) => {
    setEditingItem(item.id);
    setEditDraft({ min_stock: item.min_stock, max_stock: item.max_stock, quantity: item.quantity, notes: item.notes });
  };

  const saveItem = async (item: WarehouseItem) => {
    setSavingItem(true);
    try {
      await fetch(`/api/warehouses/${warehouse!.id}/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item, ...editDraft }),
      });
      setEditingItem(null);
      load();
    } catch { alert("فشل الحفظ"); }
    setSavingItem(false);
  };

  const submitManualReqs = async () => {
    if (!warehouse) return;
    const lines = activeItems.filter(i => (manualQtys[i.id] ?? 0) > 0);
    if (lines.length === 0) return;
    setSubmittingTransport(true);
    const batchId = sendMode === "combined"
      ? `batch_${Date.now()}`
      : null;
    try {
      for (const item of lines) {
        const cfg = trailerConfigs.find(c =>
          item.product_name.includes(c.product_category) ||
          c.product_category.includes(item.product_name)
        );
        const trailerCap = cfg?.trailer_capacity || (manualQtys[item.id] ?? 1);
        const minOrder   = cfg?.min_threshold    || trailerCap;
        let qty = manualQtys[item.id] ?? 0;
        if (cfg && qty < minOrder) qty = minOrder;
        const numLoads = Math.ceil(qty / trailerCap);
        for (let i = 0; i < numLoads; i++) {
          const loadQty = Math.min(trailerCap, qty - i * trailerCap);
          await fetch("/api/supply-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              warehouse_id:   warehouse.id,
              warehouse_name: warehouse.name,
              product_name:   item.product_name,
              requested_qty:  loadQty,
              unit:           item.unit,
              trailer_loads:  1,
              requested_by:   user?.name || user?.phone,
              notes:          manualNotes || null,
              priority:       "normal",
              auto_triggered: 0,
              batch_id:       batchId,
            }),
          });
        }
      }
      setManualQtys({});
      setManualNotes("");
      alert(sendMode === "combined"
        ? `تم إرسال طلبية واحدة تحتوي ${lines.length} ${lines.length === 1 ? "صنف" : "أصناف"} ✓`
        : `تم إرسال ${lines.length} ${lines.length === 1 ? "طلب توريد" : "طلبات توريد منفصلة"} ✓`
      );
      load();
    } finally { setSubmittingTransport(false); }
  };

  const redirectReq = async (id: number, dest: string) => {
    if (!dest) return;
    await fetch(`/api/supply-requests/${id}/redirect`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_location: dest }),
    });
    setRedirectId(null);
    setRedirectDest("");
    load();
  };

  const receiveReq = (id: number) => {
    setReceiveNotesId(id);
    setReceiveNotesText("");
  };

  const submitReceive = async () => {
    if (!receiveNotesId) return;
    await fetch(`/api/supply-requests/${receiveNotesId}/receive`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receive_notes: receiveNotesText || null }),
    });
    setReceiveNotesId(null);
    setReceiveNotesText("");
    load();
  };

  const approveReq = async (id: number) => {
    setApprovingId(id);
    try {
      await fetch(`/api/supply-requests/${id}/approve`, { method: "PUT" });
      load();
    } finally { setApprovingId(null); }
  };

  const editSupplyReq = async () => {
    if (!editingSrId) return;
    try {
      const res = await fetch(`/api/supply-requests/${editingSrId}/edit`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingSrDraft),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error); return; }
      setEditingSrId(null); load();
    } catch { alert("فشل التعديل"); }
  };

  const cancelSupplyReq = async (id: number) => {
    if (!confirm("هل تريد إلغاء هذا الطلب نهائياً؟")) return;
    setCancellingId(id);
    try {
      const res = await fetch(`/api/supply-requests/${id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json(); alert(e.error); return; }
      load();
    } catch { alert("فشل الإلغاء"); }
    setCancellingId(null);
  };

  const updateLocation = async (id: number) => {
    try {
      await fetch(`/api/supply-requests/${id}/location`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination_division: newLocation }),
      });
      setEditingLocationId(null); setNewLocation(""); load();
    } catch { alert("فشل تحديث الموقع"); }
  };

  const sendReplenishRequest = (item: WarehouseItem) => {
    const cfg = trailerConfigs.find(c => (item.product_name || "").includes(c.product_category));
    const trailerCap = cfg?.trailer_capacity || 1;
    const minOrder   = cfg?.min_threshold || trailerCap;
    const autoQty    = Math.max((item.min_stock || 0) - item.quantity, minOrder);
    const defaultQty = cfg?.approved_qty && cfg.approved_qty > 0 ? cfg.approved_qty : autoQty;
    setReplenishConfirm({ item, qty: defaultQty, cfg });
  };

  const submitReplenishConfirm = async () => {
    if (!replenishConfirm || !warehouse) return;
    const { item, qty, cfg } = replenishConfirm;
    setSendingReq(true);
    const trailerCap = cfg?.trailer_capacity || 1;
    const loads = Math.ceil(qty / trailerCap);
    try {
      await fetch("/api/supply-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_id: warehouse.id,
          warehouse_name: warehouse.name,
          product_name: item.product_name,
          requested_qty: qty,
          unit: item.unit,
          trailer_loads: loads,
          destination_division: "المصنع",
          requested_by: user?.name || user?.phone,
          auto_triggered: 0,
          priority: "urgent",
        }),
      });
      setReplenishConfirm(null);
      load();
    } catch { alert("فشل إرسال الطلب"); }
    setSendingReq(false);
  };

  const addItem = async () => {
    if (!warehouse || !newItem.product_name) return;
    await fetch(`/api/warehouses/${warehouse.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: newItem.product_name,
        product_id: newItem.product_id,
        quantity: newItem.quantity,
        unit: newItem.unit,
        min_stock: newItem.min_stock,
        max_stock: newItem.max_stock,
      }),
    });
    setShowAddItem(false);
    setNewItem({ product_name: "", product_id: null, quantity: 0, unit: "كيس", min_stock: 0, max_stock: 0 });
    load();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={22} className="animate-spin text-[#103c68]" />
    </div>
  );

  if (!warehouse) return (
    <div className="flex flex-col items-center justify-center h-64 text-center" dir="rtl">
      <Warehouse size={48} className="text-gray-300 mb-3" />
      <h2 className="text-gray-600 font-bold text-lg">لم يتم تعيين مستودع لحسابك</h2>
      <p className="text-gray-400 text-sm mt-1">يرجى التواصل مع المدير لتعيينك على مستودع محدد</p>
    </div>
  );

  const pendingReqs = filteredRequests.filter(r => r.status === "pending");
  const approvedReqs = filteredRequests.filter(r => r.status === "approved");

  return (
    <>
    <div dir="rtl" className="flex flex-col lg:flex-row gap-5 items-start">
      {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
      <div className="flex-1 min-w-0 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Warehouse size={24} className="text-[#103c68]" />لوحة مسؤول المستودع
          </h1>
          <p className="text-[#103c68] font-semibold mt-0.5">{warehouse.name}</p>
          {warehouse.location && <p className="text-gray-400 text-xs">📍 {warehouse.location}</p>}
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl text-sm transition-colors">
          <RefreshCw size={14} />تحديث
        </button>
      </div>

      {/* Time Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none flex-shrink-0">
          {(["today", "week", "month", "year", "custom"] as TimeFilter[]).map(f => (
            <button key={f} onClick={() => setTimeFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${timeFilter === f ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {TIME_LABELS[f]}
            </button>
          ))}
        </div>
        {timeFilter === "custom" && (
          <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-2xl px-3 py-2 shadow-sm flex-wrap">
            <span className="text-xs font-bold text-gray-500">من</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 text-gray-800" />
            <MonthShortcuts onSelect={(f, t) => { setDateFrom(f); setDateTo(t); }} />
            <span className="text-xs font-bold text-gray-500">إلى</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 text-gray-800" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-xs text-red-400 hover:text-red-600 font-bold px-1">✕ مسح</button>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: "إجمالي الأصناف",  val: activeItems.length,   icon: Package,       color: "bg-[#103c68]" },
          { label: "مخزون منخفض",     val: lowStockItems.length, icon: AlertTriangle,  color: "bg-red-500",   alert: lowStockItems.length > 0 },
          { label: "طلبات معلقة",     val: pendingReqs.length,   icon: Clock,          color: "bg-amber-500" },
          { label: "رحلات نشطة",      val: activeTrips.length,   icon: Truck,          color: "bg-blue-500" },
          { label: "إيرادات مستلمة",  val: dispatchOrders.filter(o => o.payment_status === "paid").reduce((s, o) => s + o.quantity * o.price, 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) + " ر.س", icon: TrendingUp, color: "bg-green-600" },
        ].map(({ label, val, icon: Icon, color, alert }) => (
          <div key={label} className={`bg-white rounded-2xl border shadow-sm p-3 sm:p-5 flex items-start gap-2 sm:gap-3 ${alert && val > 0 ? "border-red-200" : "border-gray-100"}`}>
            <div className={`${color} w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0`}>
              <Icon size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-lg sm:text-2xl font-black text-gray-900 truncate">{val}</div>
              <div className="text-[10px] sm:text-xs text-gray-400 mt-0.5 leading-tight">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Auto-replenishment banner */}
      <div className={`rounded-2xl border p-4 flex items-center justify-between gap-4 ${autoRep ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
        <div>
          <div className={`font-bold ${autoRep ? "text-green-800" : "text-amber-800"}`}>
            الطلب التلقائي {autoRep ? "مفعّل" : "معطّل"}
          </div>
          <div className={`text-sm mt-0.5 ${autoRep ? "text-green-600" : "text-amber-600"}`}>
            {autoRep ? "يُرسَل طلب فوراً عند تفعيله وعند كل خصم يُنزل المخزون دون الحد الأدنى" : "يمكنك إرسال طلبات التوريد يدوياً من قائمة المخزون"}
          </div>
        </div>
        <div className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${autoRep ? "bg-green-500" : "bg-gray-300"}`}
          onClick={async () => {
            const next = !autoRep;
            await fetch("/api/invoice-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto_replenishment: next }) });
            setAutoRep(next);
            if (next && warehouse) {
              const res  = await fetch(`/api/warehouses/${warehouse.id}/auto-replenish-scan`, { method: "POST" });
              const data = await res.json();
              await load();
              setTab("requests");
              if (data.created > 0) {
                alert(`✅ تم إرسال ${data.created} طلب توريد تلقائي للأصناف منخفضة المخزون`);
              } else if (data.total_low === 0) {
                alert("✅ جميع الأصناف مخزونها فوق الحد الأدنى — لا توجد طلبات مطلوبة الآن");
              } else {
                alert("ℹ️ الأصناف المنخفضة لديها طلبات توريد معلقة بالفعل");
              }
            }
          }}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${autoRep ? "right-0.5" : "left-0.5"}`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none">
        {([
          { id: "stock",    label: "المخزون",       icon: Package },
          { id: "dispatch", label: "أوامر الصرف",   icon: ClipboardList, count: dispatchOrders.filter(o => o.status === "pending").length },
          { id: "returns",  label: "المرتجعات",     icon: RotateCcw, count: returns.length },
          { id: "requests", label: "طلبات التوريد", icon: Truck,    count: pendingReqs.length },
          { id: "trips",    label: "تتبع الرحلات",  icon: MapPin,   count: activeTrips.length },
          { id: "orders",   label: "الطلبات",       icon: FileText, count: warehouseOrders.filter(o => o.stage === "invoiced").length },
          { id: "analytics",label: "التحليل",       icon: BarChart3 },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500"}`}>
            <t.icon size={13} className="shrink-0" />{t.label}
            {"count" in t && t.count > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-black px-1.5 rounded-full">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════ STOCK TAB ═══════════════════ */}
      {tab === "stock" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-50 flex-wrap">
            <span className="font-bold text-gray-800 text-sm sm:text-base">
              مخزون المستودع ({activeItems.length} صنف نشط{closedItems.length > 0 ? ` · ${closedItems.length} مغلق` : ""})
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {closedItems.length > 0 && (
                <button onClick={() => setShowClosedItems(v => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors ${showClosedItems ? "bg-gray-700 text-white border-gray-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                  {showClosedItems ? "إخفاء المغلقة" : "عرض المغلقة"}
                </button>
              )}
              <button onClick={() => setShowAddItem(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-[#103c68] text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-[#0d3158]">
                <Plus size={13} />إضافة صنف
              </button>
            </div>
          </div>

          {showAddItem && (
            <div className="p-4 bg-blue-50 border-b border-blue-100">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {/* Product picker from catalog */}
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs font-medium text-gray-600 block mb-1">المنتج من الكتالوج</label>
                  <select
                    value={newItem.product_id ?? ""}
                    onChange={e => {
                      const pid = parseInt(e.target.value);
                      const prod = catalogProducts.find(p => p.id === pid);
                      if (prod) {
                        setNewItem(prev => ({ ...prev, product_id: prod.id, product_name: prod.name, unit: prod.unit }));
                      } else {
                        setNewItem(prev => ({ ...prev, product_id: null, product_name: "", unit: "كيس" }));
                      }
                    }}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="">— اختر منتجاً —</option>
                    {catalogProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                {/* Quantity */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">الكمية</label>
                  <input type="number" value={newItem.quantity}
                    onChange={e => setNewItem(p => ({ ...p, quantity: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                {/* Unit (auto-filled, editable) */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">الوحدة</label>
                  <input type="text" value={newItem.unit}
                    onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                {/* Min stock */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">الحد الأدنى</label>
                  <input type="number" value={newItem.min_stock}
                    onChange={e => setNewItem(p => ({ ...p, min_stock: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                {/* Max stock */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">الحد الأقصى</label>
                  <input type="number" value={newItem.max_stock}
                    onChange={e => setNewItem(p => ({ ...p, max_stock: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              {newItem.product_name && (
                <p className="mt-2 text-xs text-blue-600 font-medium">✓ المنتج المختار: {newItem.product_name}</p>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={addItem} disabled={!newItem.product_name}
                  className="px-4 py-1.5 bg-[#103c68] text-white rounded-lg text-sm font-medium hover:bg-[#0d3158] disabled:opacity-50">حفظ</button>
                <button onClick={() => { setShowAddItem(false); setNewItem({ product_name: "", product_id: null, quantity: 0, unit: "كيس", min_stock: 0, max_stock: 0 }); }}
                  className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">إلغاء</button>
              </div>
            </div>
          )}

          {/* Incoming shipments banner */}
          {Object.keys(incomingByProduct).length > 0 && (
            <div className="mx-5 mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Truck size={13} className="text-blue-600 flex-shrink-0" />
                <span className="text-xs font-bold text-blue-700">شحنات قادمة</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(incomingByProduct).map(([product, { qty, unit }]) => (
                  <span key={product} className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-semibold">
                    {product}: +{qty.toLocaleString("ar-SA")} {unit}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Low stock alert */}
          {lowStockItems.length > 0 && (
            <div className="mx-5 my-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-700 font-semibold">{lowStockItems.length} صنف بمخزون أقل من الحد الأدنى — يُنصح بطلب توريد عاجل</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]" style={{tableLayout:"fixed"}}>
              <colgroup>
                <col style={{width:"34%"}} />
                <col style={{width:"12%"}} />
                <col style={{width:"8%"}} />
                <col style={{width:"10%"}} />
                <col style={{width:"10%"}} />
                <col style={{width:"11%"}} />
                <col style={{width:"15%"}} />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  {["الصنف","الكمية","الوحدة","الحد الأدنى","الحد الأقصى","الحالة","إجراء"].map(h => (
                    <th key={h} className="px-3 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(showClosedItems ? items : activeItems).map(item => {
                  const isClosed = (item.active ?? 1) === 0;
                  const low = !isClosed && (item.quantity ?? 0) <= (item.min_stock ?? 0);
                  const isEditing = editingItem === item.id;
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 ${isClosed ? "opacity-50 bg-gray-50" : low ? "bg-red-50/30" : ""}`}>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const prod = catalogProducts.find(p => p.id === item.product_id || p.name === item.product_name);
                          const img  = prod?.image_url;
                          const pct  = item.max_stock > 0 ? Math.min(100, Math.round((item.quantity ?? 0) / item.max_stock * 100)) : null;
                          return (
                            <div className="flex items-center gap-3 min-w-[160px]">
                              {/* thumbnail */}
                              <div className={`flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border ${low ? "border-red-200" : "border-gray-100"} bg-gray-50`}>
                                {img
                                  ? <img src={img} alt={item.product_name} className="w-full h-full object-cover" />
                                  : <div className="w-full h-full flex items-center justify-center text-lg">📦</div>}
                              </div>
                              {/* name + progress */}
                              <div className="flex-1 min-w-0">
                                <p className={`font-semibold text-sm leading-tight truncate ${isClosed ? "text-gray-400" : low ? "text-red-700" : "text-gray-800"}`}>
                                  {item.product_name}
                                </p>
                                {pct !== null && !isClosed && (
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all ${pct < 25 ? "bg-red-400" : pct < 60 ? "bg-yellow-400" : "bg-emerald-400"}`}
                                        style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">{pct}%</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className={`px-3 py-3 font-bold ${low ? "text-red-600" : "text-gray-700"}`}>
                        {isEditing ? (
                          <input type="number" value={editDraft.quantity ?? item.quantity}
                            onChange={e => setEditDraft(d => ({ ...d, quantity: parseFloat(e.target.value) || 0 }))}
                            className="w-24 px-2 py-1 border border-blue-300 rounded-lg text-sm" />
                        ) : (
                          <div>
                            <span>{(item.quantity ?? 0).toLocaleString("ar-SA")}</span>
                            {(() => {
                              const inc = incomingByProduct[item.product_name];
                              if (!inc || inc.qty === 0) return null;
                              const projected = (item.quantity ?? 0) + inc.qty;
                              return (
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                  <span className="text-[11px] font-semibold text-blue-600 leading-tight">
                                    +{inc.qty.toLocaleString("ar-SA")} قادم
                                  </span>
                                  <span className="text-[11px] font-bold text-emerald-600 leading-tight">
                                    = {projected.toLocaleString("ar-SA")} متوقع
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-500">{item.unit}</td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input type="number" value={editDraft.min_stock ?? item.min_stock}
                            onChange={e => setEditDraft(d => ({ ...d, min_stock: parseFloat(e.target.value) || 0 }))}
                            className="w-24 px-2 py-1 border border-blue-300 rounded-lg text-sm" />
                        ) : <span className="text-gray-600">{item.min_stock}</span>}
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input type="number" value={editDraft.max_stock ?? item.max_stock ?? 0}
                            onChange={e => setEditDraft(d => ({ ...d, max_stock: parseFloat(e.target.value) || 0 }))}
                            className="w-24 px-2 py-1 border border-blue-300 rounded-lg text-sm" />
                        ) : <span className="text-gray-500">{item.max_stock || "—"}</span>}
                      </td>
                      <td className="px-3 py-3">
                        {isClosed ? (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-500">🔒 مغلق</span>
                        ) : (
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${low ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                            {low ? "⚠ منخفض" : "✓ طبيعي"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {isEditing ? (
                            <>
                              <button onClick={() => saveItem(item)} disabled={savingItem}
                                className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 disabled:opacity-50">
                                <Save size={11} />حفظ
                              </button>
                              <button onClick={() => setEditingItem(null)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">
                                <X size={11} />
                              </button>
                            </>
                          ) : (
                            <>
                              {!isClosed && (
                                <button onClick={() => startEdit(item)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="تعديل الحدود">
                                  <Pencil size={13} className="text-gray-400" />
                                </button>
                              )}
                              {!isClosed && (
                                <button onClick={() => sendReplenishRequest(item)} disabled={sendingReq}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs disabled:opacity-50 ${
                                    low
                                      ? "bg-[#103c68] text-white hover:bg-[#0d3158]"
                                      : "bg-green-600 text-white hover:bg-green-700"
                                  }`}>
                                  <Send size={11} />{low ? "طلب توريد" : "طلب زائد"}
                                </button>
                              )}
                              <button
                                disabled={togglingItemId === item.id}
                                title={isClosed ? "فتح الصنف" : "إغلاق الصنف"}
                                onClick={async () => {
                                  if (!warehouse) return;
                                  if (!isClosed && !confirm(`هل تريد إغلاق "${item.product_name}"؟ لن يظهر في لوحة المستودع.`)) return;
                                  setTogglingItemId(item.id);
                                  try {
                                    await fetch(`/api/warehouses/${warehouse.id}/items/${item.id}/toggle`, { method: "PATCH" });
                                    load();
                                  } catch { /* silent */ }
                                  setTogglingItemId(null);
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${isClosed ? "text-green-500 hover:bg-green-50" : "text-gray-300 hover:text-red-400 hover:bg-red-50"}`}>
                                {togglingItemId === item.id ? "..." : isClosed ? "🔓" : <X size={13} />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {items.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Package size={36} className="mx-auto mb-2 opacity-30" />
                <p>لا توجد أصناف في هذا المستودع</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ DISPATCH TAB ═══════════════════ */}
      {tab === "dispatch" && (
        <div className="space-y-4">
          {/* Header + New Button */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-50 flex-wrap">
              <div>
                <span className="font-bold text-gray-800 text-sm sm:text-base">أوامر الصرف</span>
                <span className="text-xs text-gray-400 mr-2">
                  ({dispatchOrders.filter(o => o.status === "pending").length} معلق / {dispatchOrders.filter(o => o.status === "delivered").length} تم التسليم)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportDispatchXlsx}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-50 shadow-sm">
                  <Download size={13} className="text-emerald-600" />تصدير Excel
                </button>
                <button onClick={() => { setShowDispatchForm(true); setDispatchForm({ product_name: "", product_id: null, warehouse_item_id: null, unit: "وحدة", quantity: "", price: "", payment_status: "unpaid", recipient_name: "", notes: "" }); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-[#103c68] text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-[#0d3158]">
                  <Plus size={13} />إضافة أمر صرف
                </button>
              </div>
            </div>

            {/* ── New Dispatch Form ── */}
            {showDispatchForm && (
              <div className="p-5 bg-blue-50 border-b border-blue-100">
                <p className="text-xs font-bold text-[#103c68] mb-3">أمر صرف جديد</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {/* Product */}
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-xs font-medium text-gray-600 block mb-1">المنتج *</label>
                    <select
                      value={dispatchForm.product_id ?? dispatchForm.warehouse_item_id ?? ""}
                      onChange={e => {
                        const pid = parseInt(e.target.value);
                        const warehouseItem = items.find(i => i.product_id === pid || String(i.id) === e.target.value);
                        const prod = catalogProducts.find(p => p.id === pid);
                        if (prod && warehouseItem) {
                          setDispatchForm(prev => ({ ...prev, product_id: prod.id, warehouse_item_id: warehouseItem.id, product_name: prod.name, unit: prod.unit }));
                        } else if (prod) {
                          setDispatchForm(prev => ({ ...prev, product_id: prod.id, warehouse_item_id: null, product_name: prod.name, unit: prod.unit }));
                        } else if (warehouseItem) {
                          setDispatchForm(prev => ({ ...prev, product_id: null, warehouse_item_id: warehouseItem.id, product_name: warehouseItem.product_name, unit: warehouseItem.unit }));
                        }
                      }}
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                      <option value="">اختر منتجاً</option>
                      {activeItems.filter(i => (i.quantity ?? 0) > 0).map(i => (
                        <option key={i.id} value={i.product_id ?? i.id}>
                          {i.product_name} — متاح: {i.quantity.toLocaleString("ar-SA")} {i.unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Stock info card */}
                  {dispatchForm.product_name && (() => {
                    const item = dispatchForm.warehouse_item_id
                      ? items.find(i => i.id === dispatchForm.warehouse_item_id)
                      : items.find(i =>
                          (dispatchForm.product_id != null && i.product_id === dispatchForm.product_id) ||
                          i.product_name === dispatchForm.product_name
                        );
                    if (!item) return null;
                    const pct = item.max_stock > 0 ? Math.min(100, Math.round(item.quantity / item.max_stock * 100)) : null;
                    const low = item.min_stock > 0 && item.quantity <= item.min_stock;
                    return (
                      <div className={`col-span-2 md:col-span-4 flex items-center gap-3 rounded-xl px-4 py-3 border ${low ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}`}>
                        <Package size={18} className={low ? "text-red-500" : "text-blue-500"} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500">الرصيد الحالي في مستودعك</p>
                          <p className={`text-lg font-black leading-tight ${low ? "text-red-600" : "text-blue-700"}`}>
                            {item.quantity.toLocaleString("ar-SA")}
                            <span className="text-sm font-normal text-gray-500 mr-1">{item.unit}</span>
                          </p>
                        </div>
                        {pct !== null && (
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-gray-400 mb-1">من الطاقة القصوى</p>
                            <div className="flex items-center gap-1.5">
                              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${low ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-bold text-gray-600">{pct}%</span>
                            </div>
                          </div>
                        )}
                        {low && <span className="text-xs bg-red-100 text-red-600 border border-red-200 rounded-lg px-2 py-0.5 font-bold flex-shrink-0">مخزون منخفض</span>}
                      </div>
                    );
                  })()}

                  {/* Quantity */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">الكمية *</label>
                    <div className="flex gap-1">
                      <input type="number" min="0" step="any"
                        value={dispatchForm.quantity}
                        onChange={e => setDispatchForm(prev => ({ ...prev, quantity: e.target.value }))}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" />
                      <span className="px-2 py-1.5 bg-gray-100 text-xs rounded-lg text-gray-500 whitespace-nowrap">{dispatchForm.unit}</span>
                    </div>
                  </div>

                  {/* Price */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">السعر (ر.س) *</label>
                    <input type="number" min="0" step="any"
                      value={dispatchForm.price}
                      onChange={e => setDispatchForm(prev => ({ ...prev, price: e.target.value }))}
                      placeholder="0.00"
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>

                  {/* Recipient — combobox: pick rep or type new */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">اسم المستلم</label>
                    <input type="text" list="reps-datalist"
                      value={dispatchForm.recipient_name}
                      onChange={e => setDispatchForm(prev => ({ ...prev, recipient_name: e.target.value }))}
                      placeholder="اختر مندوباً أو اكتب اسماً"
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    <datalist id="reps-datalist">
                      {repsList.map(r => <option key={r.id} value={r.name}>{r.name} — {r.phone}</option>)}
                    </datalist>
                  </div>

                  {/* Payment status */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">حالة الدفع</label>
                    <select
                      value={dispatchForm.payment_status}
                      onChange={e => setDispatchForm(prev => ({ ...prev, payment_status: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                      <option value="unpaid">غير مدفوع</option>
                      <option value="paid">مدفوع</option>
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">ملاحظات</label>
                    <input type="text"
                      value={dispatchForm.notes}
                      onChange={e => setDispatchForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="اختياري"
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                </div>

                {/* Total preview */}
                {dispatchForm.quantity && dispatchForm.price && (
                  <div className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-sm font-bold text-green-700 inline-flex items-center gap-2">
                    <span>الإجمالي:</span>
                    <span>{(parseFloat(dispatchForm.quantity) * parseFloat(dispatchForm.price)).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</span>
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    disabled={savingDispatch || !dispatchForm.product_name || !dispatchForm.quantity || dispatchForm.price === ""}
                    onClick={async () => {
                      if (!warehouse || !dispatchForm.product_name || !dispatchForm.quantity) return;
                      setSavingDispatch(true);
                      try {
                        const r = await fetch("/api/warehouse-dispatch-orders", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            warehouse_id: warehouse.id,
                            warehouse_name: warehouse.name,
                            product_name: dispatchForm.product_name,
                            product_id: dispatchForm.product_id,
                            unit: dispatchForm.unit,
                            quantity: parseFloat(dispatchForm.quantity),
                            price: parseFloat(dispatchForm.price) || 0,
                            payment_status: dispatchForm.payment_status,
                            recipient_name: dispatchForm.recipient_name,
                            notes: dispatchForm.notes,
                            created_by: user?.name || user?.phone,
                          }),
                        });
                        if (!r.ok) { const e = await r.json(); alert(e.error || "فشل الحفظ"); }
                        else { setShowDispatchForm(false); load(); }
                      } catch { alert("فشل الحفظ"); }
                      setSavingDispatch(false);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors">
                    <Save size={13} />{savingDispatch ? "جاري الحفظ..." : "حفظ الأمر"}
                  </button>
                  <button onClick={() => setShowDispatchForm(false)}
                    className="px-4 py-2 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 transition-colors">
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            {/* ── Dispatch Orders Table ── */}
            {dispatchOrders.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <ClipboardList size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد أوامر صرف بعد</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                      <th className="text-right px-4 py-3">التاريخ</th>
                      <th className="text-right px-4 py-3">المنتج</th>
                      <th className="text-right px-4 py-3">الكمية</th>
                      <th className="text-right px-4 py-3">السعر</th>
                      <th className="text-right px-4 py-3">الإجمالي</th>
                      <th className="text-right px-4 py-3">الدفع</th>
                      <th className="text-right px-4 py-3">المستلم</th>
                      <th className="text-right px-4 py-3">الحالة</th>
                      <th className="px-4 py-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatchOrders.map(o => (
                      <tr key={o.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${o.status === "delivered" ? "opacity-70" : ""}`}>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(o.created_at).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{o.product_name}</td>
                        <td className="px-4 py-3 text-gray-700">{o.quantity.toLocaleString("ar-SA")} <span className="text-xs text-gray-400">{o.unit}</span></td>
                        <td className="px-4 py-3 text-gray-700">{o.price.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs text-gray-400">ر.س</span></td>
                        <td className="px-4 py-3 font-bold text-[#103c68]">
                          {(o.quantity * o.price).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-gray-400">ر.س</span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            disabled={togglingPayId === o.id}
                            onClick={async () => {
                              const next = o.payment_status === "paid" ? "unpaid" : "paid";
                              setTogglingPayId(o.id);
                              try {
                                const r = await fetch(`/api/warehouse-dispatch-orders/${o.id}/payment`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ payment_status: next }),
                                });
                                if (!r.ok) { const e = await r.json(); alert(e.error || "فشل"); }
                                else load();
                              } catch { alert("فشل الاتصال"); }
                              setTogglingPayId(null);
                            }}
                            title="اضغط لتغيير حالة الدفع"
                            className={`px-2 py-0.5 rounded-full text-xs font-bold transition-all hover:opacity-75 disabled:opacity-50 cursor-pointer ${o.payment_status === "paid" ? "bg-green-100 text-green-700 border border-green-200" : "bg-amber-100 text-amber-700 border border-amber-200"}`}>
                            {togglingPayId === o.id ? "..." : o.payment_status === "paid" ? "✓ مدفوع" : "غير مدفوع"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{o.recipient_name || "—"}</td>
                        <td className="px-4 py-3">
                          {o.status === "delivered" ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 font-bold">
                              <CheckCheck size={13} />تم التسليم
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-600 font-bold">
                              <Clock size={13} />معلق
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end">
                            {/* Print button — always visible */}
                            <button
                              onClick={() => printDispatchOrder(o)}
                              className="p-1.5 text-gray-400 hover:text-[#103c68] hover:bg-blue-50 rounded-lg transition-colors"
                              title="طباعة أمر الصرف">
                              <Printer size={13} />
                            </button>
                            {o.status === "pending" && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingDispatchId(o.id);
                                    setEditDispatchDraft({ quantity: String(o.quantity), price: String(o.price), recipient_name: o.recipient_name || "", notes: o.notes || "", payment_status: o.payment_status });
                                  }}
                                  className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors" title="تعديل">
                                  <Pencil size={13} />
                                </button>
                                <button
                                  disabled={deliveringId === o.id}
                                  onClick={async () => {
                                    if (!confirm(`تأكيد تسليم ${o.quantity} ${o.unit} من ${o.product_name}؟ سيتم خصم الكمية من المستودع.`)) return;
                                    setDeliveringId(o.id);
                                    try {
                                      const r = await fetch(`/api/warehouse-dispatch-orders/${o.id}/deliver`, { method: "PUT" });
                                      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل"); }
                                      else load();
                                    } catch { alert("فشل الاتصال"); }
                                    setDeliveringId(null);
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50 transition-colors">
                                  <CheckCheck size={11} />{deliveringId === o.id ? "..." : "تم التسليم"}
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!confirm("هل تريد حذف هذا الأمر؟")) return;
                                    try {
                                      const r = await fetch(`/api/warehouse-dispatch-orders/${o.id}`, { method: "DELETE" });
                                      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل"); }
                                      else load();
                                    } catch { alert("فشل الاتصال"); }
                                  }}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                            {o.status === "delivered" && o.delivered_at && (
                              <span className="text-xs text-gray-400">
                                {new Date(o.delivered_at).toLocaleDateString("ar-SA", { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ REQUESTS TAB ═══════════════════ */}
      {tab === "requests" && (
        <div className="space-y-4">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 text-gray-400">
              <Truck size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">لا توجد طلبات توريد في هذه الفترة</p>
            </div>
          ) : filteredRequests.map(r => {
            const isPending    = r.status === "pending";
            const hasVehicle   = !!r.vehicle_plate;
            const isEditingSr  = editingSrId === r.id;
            const isEditingLoc = editingLocationId === r.id;
            const statusMap: Record<string, { label: string; color: string }> = {
              pending:             { label: "معلق",       color: "bg-amber-100 text-amber-700"  },
              approved:            { label: "موافق",       color: "bg-green-100 text-green-700"  },
              rejected:            { label: "مرفوض",       color: "bg-red-100 text-red-600"      },
              supervisor_assigned: { label: "سيارة معيّنة", color: "bg-blue-100 text-blue-700"   },
              in_transit:          { label: "في الطريق",   color: "bg-indigo-100 text-indigo-700"},
              loaded:              { label: "محمّل",        color: "bg-purple-100 text-purple-700"},
              received:            { label: "مستلم",        color: "bg-teal-100 text-teal-700"   },
              cancelled:           { label: "ملغي",         color: "bg-gray-100 text-gray-500"   },
            };
            const sc = statusMap[r.status] || { label: r.status, color: "bg-gray-100 text-gray-600" };
            return (
              <div key={r.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${isPending ? "border-amber-200" : hasVehicle ? "border-blue-100" : "border-gray-100"}`}>
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-gray-800">{r.product_name}</span>
                      {r.auto_triggered === 1 && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">تلقائي</span>
                      )}
                      {r.batch_id && (
                        <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium" title={r.batch_id}>
                          📦 دفعة مشتركة
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.priority === "urgent" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600"}`}>
                        {r.priority === "urgent" ? "⚡ عاجل" : "عادي"}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {r.requested_qty.toLocaleString("ar-SA")} {r.unit} · {r.trailer_loads} شاحنة
                      {r.destination_division && <span className="text-blue-600"> → {r.destination_division}</span>}
                    </div>
                    {r.notes && <div className="text-xs text-gray-400 mt-0.5 italic">{r.notes}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">{r.created_at?.slice(0, 16)}</div>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-semibold flex-shrink-0 ${sc.color}`}>
                    {sc.label}
                  </span>
                </div>

                {/* Driver / vehicle info */}
                {hasVehicle && (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs bg-blue-50 rounded-xl px-3 py-2">
                    <span>🚛 {r.vehicle_plate}</span>
                    {r.driver_name  && <span>👤 {r.driver_name}</span>}
                    {r.driver_phone && <a href={`tel:${r.driver_phone}`} className="text-blue-600">📞 {r.driver_phone}</a>}
                  </div>
                )}

                {/* Photos uploaded by driver / fsohat */}
                {(r.driver_loading_image || r.invoice_image) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.driver_loading_image && (
                      <a href={r.driver_loading_image} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700 font-medium hover:bg-indigo-100 transition-colors">
                        <img src={r.driver_loading_image} alt="تحميل" className="w-6 h-6 rounded object-cover flex-shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        📦 صورة التحميل
                      </a>
                    )}
                    {r.invoice_image && (
                      <a href={r.invoice_image} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-medium hover:bg-emerald-100 transition-colors">
                        <img src={r.invoice_image} alt="فاتورة" className="w-6 h-6 rounded object-cover flex-shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        🧾 صورة الفاتورة
                      </a>
                    )}
                  </div>
                )}

                {/* Inline edit form — pending only */}
                {isEditingSr && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-bold text-amber-700">تعديل الطلب</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">الكمية</label>
                        <input type="number" value={editingSrDraft.requested_qty}
                          onChange={e => setEditingSrDraft(d => ({ ...d, requested_qty: parseFloat(e.target.value) || 0 }))}
                          className="w-full px-2 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">عدد الشاحنات</label>
                        <input type="number" value={editingSrDraft.trailer_loads}
                          onChange={e => setEditingSrDraft(d => ({ ...d, trailer_loads: parseFloat(e.target.value) || 1 }))}
                          className="w-full px-2 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">الوجهة</label>
                      <input type="text" value={editingSrDraft.destination_division}
                        onChange={e => setEditingSrDraft(d => ({ ...d, destination_division: e.target.value }))}
                        placeholder="المصنع، المستودع الرئيسي..."
                        className="w-full px-2 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">ملاحظات</label>
                      <input type="text" value={editingSrDraft.notes}
                        onChange={e => setEditingSrDraft(d => ({ ...d, notes: e.target.value }))}
                        className="w-full px-2 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none" />
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button onClick={() => setEditingSrId(null)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">إلغاء</button>
                      <button onClick={editSupplyReq} className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold">حفظ التعديل</button>
                    </div>
                  </div>
                )}

                {/* Inline location edit — after vehicle assigned */}
                {isEditingLoc && (
                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-bold text-blue-700">تعديل موقع التنزيل</p>
                    <input type="text" value={newLocation}
                      onChange={e => setNewLocation(e.target.value)}
                      placeholder="اسم الموقع الجديد..."
                      className="w-full px-2 py-1.5 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setEditingLocationId(null); setNewLocation(""); }} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">إلغاء</button>
                      <button onClick={() => updateLocation(r.id)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">تحديث الموقع</button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {!isEditingSr && !isEditingLoc && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {isPending && (
                      <button
                        onClick={() => { setEditingSrId(r.id); setEditingSrDraft({ requested_qty: r.requested_qty, trailer_loads: r.trailer_loads, destination_division: r.destination_division || "", notes: "" }); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 font-medium">
                        <Pencil size={11} />تعديل الطلب
                      </button>
                    )}
                    {["pending","approved","supervisor_assigned"].includes(r.status) && (
                      <button
                        disabled={cancellingId === r.id}
                        onClick={() => cancelSupplyReq(r.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-medium disabled:opacity-50">
                        <X size={11} />{cancellingId === r.id ? "جاري الإلغاء..." : "إلغاء الطلب"}
                      </button>
                    )}
                    {hasVehicle && !["received","cancelled","rejected"].includes(r.status) && (
                      <button
                        onClick={() => { setEditingLocationId(r.id); setNewLocation(r.destination_division || ""); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 font-medium">
                        <MapPin size={11} />تعديل موقع التنزيل
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════ TRIPS TAB ═══════════════════ */}
      {tab === "trips" && (
        <div className="space-y-3">
          {activeTrips.length === 0 && redirectedTrips.length === 0 && completedTrips.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 text-gray-400">
              <Truck size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">لا توجد رحلات نشطة أو مكتملة</p>
            </div>
          ) : (
            <>
              {activeTrips.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">رحلات نشطة ({activeTrips.length})</p>
                  {activeTrips.map(r => {
                    const isOpen = redirectId === r.id;
                    const SC_MAP: Record<string, { label: string; color: string }> = {
                      pending_permit:             { label: "بانتظار مسؤل الفسوحات 📋",  color: "bg-amber-100 text-amber-700"   },
                      supervisor_assigned:        { label: "✅ تم تعيين السيارة",          color: "bg-blue-100 text-blue-700"    },
                      in_transit:                 { label: "في الطريق 🚛",               color: "bg-indigo-100 text-indigo-700" },
                      loaded:                     { label: "جارٍ التحميل 📦",            color: "bg-cyan-100 text-cyan-700"    },
                      delivered_to_warehouse:     { label: "وصل المستودع 🏁",            color: "bg-teal-100 text-teal-700"    },
                      pending_warehouse_approval: { label: "بانتظار الموافقة ⏳",         color: "bg-purple-100 text-purple-700" },
                    };
                    const sc = SC_MAP[r.status] || { label: r.status, color: "bg-gray-100 text-gray-600" };
                    const hasVehicleInfo = !!(r.vehicle_plate || r.driver_name || r.driver_phone);
                    return (
                      <div key={r.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${r.status === "supervisor_assigned" && hasVehicleInfo ? "border-blue-200" : "border-blue-100"}`}>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${sc.color}`}>{sc.label}</span>
                              </div>
                              <div className="font-bold text-gray-900">{r.product_name}</div>
                              <div className="text-sm text-gray-500">{r.requested_qty?.toLocaleString("ar-SA")} {r.unit}</div>

                              {/* Vehicle info — highlighted box when supervisor has assigned */}
                              {hasVehicleInfo && (
                                <div className={`mt-2 rounded-xl px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${r.status === "supervisor_assigned" ? "bg-blue-50 border border-blue-200" : "bg-gray-50"}`}>
                                  {r.vehicle_plate && (
                                    <span className="font-bold text-blue-800 text-sm">🚛 {r.vehicle_plate}</span>
                                  )}
                                  {r.driver_name && (
                                    <span className="text-gray-700 font-medium">👤 {r.driver_name}</span>
                                  )}
                                  {r.driver_phone && (
                                    <span className="flex items-center gap-1.5">
                                      <a href={`tel:${r.driver_phone}`} className="text-blue-600 hover:underline">📞 {r.driver_phone}</a>
                                      <a
                                        href={`https://wa.me/966${r.driver_phone.replace(/^0/, "")}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500 text-white rounded-full hover:bg-green-600 font-bold">
                                        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.092.536 4.06 1.476 5.771L.057 23.943l6.325-1.396A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.714 9.714 0 01-4.951-1.354l-.355-.211-3.655.807.853-3.556-.232-.366A9.714 9.714 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
                                        واتساب
                                      </a>
                                    </span>
                                  )}
                                  {r.cargo_type && <span className="text-gray-500">📦 {r.cargo_type}</span>}
                                </div>
                              )}
                            </div>
                            {(["in_transit","loaded","delivered_to_warehouse","pending_warehouse_approval"].includes(r.status)) && (
                              <div className="flex flex-col gap-1.5 flex-shrink-0">
                                {["in_transit","loaded","delivered_to_warehouse"].includes(r.status) && (
                                  <>
                                    {r.status === "delivered_to_warehouse" ? (
                                      <button
                                        onClick={() => receiveReq(r.id)}
                                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 whitespace-nowrap">
                                        ✅ استلام
                                      </button>
                                    ) : (
                                      <span className="px-3 py-1.5 bg-gray-100 text-gray-400 text-xs font-bold rounded-xl whitespace-nowrap text-center cursor-not-allowed" title="انتظر حتى يسلّم السائق الشحنة">
                                        🚛 في الطريق
                                      </span>
                                    )}
                                    <button
                                      onClick={() => { setRedirectId(isOpen ? null : r.id); setRedirectDest(""); }}
                                      className="px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-xl hover:bg-orange-600 whitespace-nowrap">
                                      📍 توجيه
                                    </button>
                                  </>
                                )}
                                {r.status === "pending_warehouse_approval" && (
                                  <button
                                    onClick={() => approveReq(r.id)}
                                    disabled={approvingId === r.id}
                                    className="px-3 py-1.5 bg-[#103c68] text-white text-xs font-bold rounded-xl hover:bg-[#0d3158] whitespace-nowrap disabled:opacity-50">
                                    {approvingId === r.id ? "جاري..." : "✓ موافقة"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {isOpen && (
                            <div className="mt-3 flex gap-2 items-end">
                              <div className="flex-1">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">الموقع الجديد للتوجيه</label>
                                <input
                                  value={redirectDest}
                                  onChange={e => setRedirectDest(e.target.value)}
                                  placeholder="اسم الموقع أو المستودع..."
                                  className="w-full px-3 py-2 text-sm border border-orange-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300"
                                />
                              </div>
                              <button
                                onClick={() => redirectReq(r.id, redirectDest)}
                                disabled={!redirectDest}
                                className="px-3 py-2 bg-orange-500 text-white text-sm font-bold rounded-xl disabled:opacity-40 hover:bg-orange-600">
                                تأكيد
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── رحلات معاد توجيهها — تبقى حتى يؤكد المستودع التسليم ── */}
              {redirectedTrips.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-orange-500 uppercase tracking-wider mt-4 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    معاد توجيهها ({redirectedTrips.length}) — بانتظار التسليم للوجهة
                  </p>
                  {redirectedTrips.map(r => (
                    <div key={r.id} className="bg-orange-50 rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
                                📍 معاد التوجيه
                              </span>
                            </div>
                            <div className="font-bold text-gray-900">{r.product_name}</div>
                            <div className="text-sm text-gray-500">{r.requested_qty?.toLocaleString("ar-SA")} {r.unit}</div>
                            {/* Destination badge */}
                            <div className="mt-2 flex items-center gap-1.5 bg-white border border-orange-200 rounded-xl px-3 py-2 w-fit">
                              <span className="text-orange-400 text-sm">📍</span>
                              <span className="text-xs text-gray-500">متوجهة إلى:</span>
                              <span className="text-sm font-black text-orange-700">{r.redirect_location || "—"}</span>
                            </div>
                            {r.vehicle_plate && (
                              <div className="mt-1.5 text-xs text-gray-400 flex items-center gap-1.5">
                                <span>🚛 {r.vehicle_plate}</span>
                                {r.driver_name && <span>· {r.driver_name}</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            <button
                              disabled={confirmingRedirectId === r.id}
                              onClick={async () => {
                                if (!confirm(`تأكيد وصول شحنة "${r.product_name}" إلى "${r.redirect_location}"؟`)) return;
                                setConfirmingRedirectId(r.id);
                                try {
                                  const res = await fetch(`/api/supply-requests/${r.id}/confirm-redirect-delivery`, { method: "PUT" });
                                  if (!res.ok) { const e = await res.json(); alert(e.error || "فشل"); }
                                  else load();
                                } catch { alert("فشل الاتصال"); }
                                setConfirmingRedirectId(null);
                              }}
                              className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
                              <CheckCheck size={13} />
                              {confirmingRedirectId === r.id ? "جاري..." : "تأكيد التسليم"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {completedTrips.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-4">مكتملة ({completedTrips.length})</p>
                  {completedTrips.slice(0, 10).map(r => (
                    <div key={r.id} className="bg-gray-50 rounded-xl border border-gray-100 p-3 flex items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        r.status === "completed" ? "bg-green-100 text-green-700" :
                        "bg-teal-100 text-teal-700"}`}>
                        {r.status === "completed" ? "مكتمل ✓" : "تم الاستلام ✓"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-700 truncate">{r.product_name}</span>
                        <span className="text-xs text-gray-400 mr-2">{r.requested_qty?.toLocaleString("ar-SA")} {r.unit}</span>
                      </div>
                      {r.vehicle_plate && <span className="text-xs text-gray-400">🚛 {r.vehicle_plate}</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════ ORDERS TAB ═══════════════════ */}
      {tab === "orders" && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "فواتير صادرة",  val: warehouseOrders.filter(o => o.stage === "invoiced").length,  color: "bg-purple-500" },
              { label: "في الطريق",     val: warehouseOrders.filter(o => o.stage === "loaded").length,    color: "bg-cyan-500" },
              { label: "مسلّمة",        val: warehouseOrders.filter(o => o.stage === "delivered").length, color: "bg-green-500" },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                <div className={`${color} w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <FileText size={16} className="text-white" />
                </div>
                <div>
                  <div className="text-xl font-black text-gray-900">{val}</div>
                  <div className="text-xs text-gray-400">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {warehouseOrders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">لا توجد طلبات مرتبطة بهذا المستودع</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <span className="font-bold text-gray-800">سجل الطلبات ({warehouseOrders.length})</span>
              </div>
              <div className="divide-y divide-gray-50">
                {warehouseOrders.map(o => {
                  const stageColor: Record<string, string> = {
                    invoiced:  "bg-purple-100 text-purple-700",
                    loaded:    "bg-cyan-100 text-cyan-700",
                    delivered: "bg-green-100 text-green-700",
                    vehicle_assigned: "bg-blue-100 text-blue-700",
                  };
                  const stageLabel: Record<string, string> = {
                    invoiced: "فاتورة صادرة", loaded: "في الطريق",
                    delivered: "مسلّم", vehicle_assigned: "انتظار فاتورة",
                  };
                  return (
                    <div key={o.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</span>
                            {o.invoice_number && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">{o.invoice_number}</span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${stageColor[o.stage] || "bg-gray-100 text-gray-600"}`}>
                              {stageLabel[o.stage] || o.stage}
                            </span>
                          </div>
                          <div className="font-semibold text-gray-800">{o.customer_name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {o.product_name} × {o.quantity} {o.unit}
                            {o.loading_point_name && (
                              <span className="mr-2 flex items-center gap-0.5 inline-flex text-[#103c68]">
                                <MapPin size={10} />{o.loading_point_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-left flex-shrink-0">
                          <div className="font-black text-gray-900 text-sm">{o.total_with_vat?.toFixed(0)} ر.س</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {o.invoice_date
                              ? new Date(o.invoice_date).toLocaleDateString("ar-SA")
                              : new Date(o.created_at).toLocaleDateString("ar-SA")}
                          </div>
                        </div>
                      </div>
                      {(o.vehicle_plate || o.driver_name) && (
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          {o.vehicle_plate && <span>🚗 {o.vehicle_plate}</span>}
                          {o.driver_name && <span>👤 {o.driver_name}</span>}
                          {o.delivery_date && <span>✅ {new Date(o.delivery_date).toLocaleDateString("ar-SA")}</span>}
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

      {/* ═══════════════════ ANALYTICS TAB ═══════════════════ */}
      {tab === "analytics" && (() => {
        // ── compute Incoming (supply requests delivered) per product ──
        const inMap: Record<string, { qty: number; unit: string }> = {};
        requests.filter(r => r.status === "delivered" || r.status === "received").forEach(r => {
          if (!inMap[r.product_name]) inMap[r.product_name] = { qty: 0, unit: r.unit };
          inMap[r.product_name].qty += r.requested_qty;
        });
        // ── compute Outgoing (dispatch orders) per product ──
        const outMap: Record<string, { qty: number; unit: string; paid: number; unpaid: number; total: number }> = {};
        dispatchOrders.forEach(o => {
          if (!outMap[o.product_name]) outMap[o.product_name] = { qty: 0, unit: o.unit, paid: 0, unpaid: 0, total: 0 };
          outMap[o.product_name].qty    += o.quantity;
          outMap[o.product_name].total  += o.quantity * o.price;
          if (o.payment_status === "paid") outMap[o.product_name].paid += o.quantity * o.price;
          else                             outMap[o.product_name].unpaid += o.quantity * o.price;
        });
        // ── all product names in either map ──
        const allNames = Array.from(new Set([...Object.keys(inMap), ...Object.keys(outMap), ...activeItems.map(i => i.product_name)])).sort();
        const totalIn   = Object.values(inMap).reduce((s, v) => s + v.qty, 0);
        const totalOut  = Object.values(outMap).reduce((s, v) => s + v.qty, 0);
        const totalRev  = Object.values(outMap).reduce((s, v) => s + v.total, 0);
        const totalPaid = Object.values(outMap).reduce((s, v) => s + v.paid, 0);
        const today = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });

        return (
          <div className="space-y-4">
            {/* Action bar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <BarChart3 size={18} className="text-[#103c68]" />تقرير المستودع
              </h2>
              <div className="flex gap-2">
                <button onClick={printReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#103c68] text-white rounded-xl text-sm font-semibold hover:bg-[#0d3158] shadow-sm">
                  <Printer size={14} />طباعة / حفظ كصورة
                </button>
              </div>
            </div>

            {/* ── Printable report ── */}
            <div ref={reportRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
              <div className="text-center border-b pb-4">
                <h2 className="text-xl font-black text-[#103c68]">تقرير حركة مستودع — {warehouse?.name}</h2>
                <p className="text-xs text-gray-400 mt-1">
                  {timeFilter === "custom"
                    ? (dateFrom || dateTo)
                      ? `الفترة: ${dateFrom ? new Date(dateFrom).toLocaleDateString("ar-SA") : "—"} ← ${dateTo ? new Date(dateTo).toLocaleDateString("ar-SA") : "—"}`
                      : "جميع الفترات (بلا تصفية)"
                    : `الفترة: ${TIME_LABELS[timeFilter]} · طُبع: ${today}`
                  }
                </p>
              </div>

              {/* Summary cards row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "إجمالي الوارد",    val: totalIn.toLocaleString("ar-SA"),  color: "bg-blue-50  border-blue-200  text-blue-700"  },
                  { label: "إجمالي المنصرف",   val: totalOut.toLocaleString("ar-SA"), color: "bg-red-50   border-red-200   text-red-700"   },
                  { label: "إيرادات الصرف",    val: totalRev.toLocaleString("ar-SA", { minimumFractionDigits: 2 }) + " ر.س", color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                  { label: "مُحصَّل",           val: totalPaid.toLocaleString("ar-SA", { minimumFractionDigits: 2 }) + " ر.س", color: "bg-green-50  border-green-200  text-green-700"  },
                ].map(c => (
                  <div key={c.label} className={`rounded-xl border p-3 ${c.color}`}>
                    <p className="text-xs font-semibold mb-1">{c.label}</p>
                    <p className="text-lg font-black">{c.val}</p>
                  </div>
                ))}
              </div>

              {/* ── Table 1: Incoming + Outgoing by product ── */}
              <div>
                <p className="section-title text-sm font-bold text-[#103c68] mb-2 flex items-center gap-1">
                  <Package size={14} />الوارد والمنصرف لكل منتج
                </p>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#103c68] text-white text-xs">
                        <th className="px-3 py-2.5 text-right">المنتج</th>
                        <th className="px-3 py-2.5 text-center text-blue-200">الوارد</th>
                        <th className="px-3 py-2.5 text-center text-red-200">المنصرف (كمية)</th>
                        <th className="px-3 py-2.5 text-center text-emerald-200">إيرادات الصرف</th>
                        <th className="px-3 py-2.5 text-center text-yellow-200">مُحصَّل</th>
                        <th className="px-3 py-2.5 text-center text-orange-200">غير مُحصَّل</th>
                        <th className="px-3 py-2.5 text-center">المخزون الحالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {allNames.map((name, idx) => {
                        const inRow  = inMap[name];
                        const outRow = outMap[name];
                        const stock  = activeItems.find(i => i.product_name === name);
                        const unit   = inRow?.unit || outRow?.unit || stock?.unit || "";
                        return (
                          <tr key={name} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                            <td className="px-3 py-2 font-semibold text-gray-800">{name}</td>
                            <td className="px-3 py-2 text-center text-blue-700 font-bold">
                              {inRow ? `${inRow.qty.toLocaleString("ar-SA")} ${unit}` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center text-red-600 font-bold">
                              {outRow ? `${outRow.qty.toLocaleString("ar-SA")} ${unit}` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center text-emerald-700">
                              {outRow ? `${outRow.total.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center text-green-700">
                              {outRow ? `${outRow.paid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center text-orange-600">
                              {outRow ? `${outRow.unpaid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {stock
                                ? <span className={`font-bold ${(stock.quantity??0) <= (stock.min_stock??0) ? "text-red-500" : "text-gray-700"}`}>
                                    {(stock.quantity??0).toLocaleString("ar-SA")} {unit}
                                  </span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Totals row */}
                      <tr className="bg-[#103c68]/5 font-black text-sm border-t-2 border-[#103c68]/20">
                        <td className="px-3 py-2 text-[#103c68]">الإجمالي</td>
                        <td className="px-3 py-2 text-center text-blue-800">{totalIn.toLocaleString("ar-SA")}</td>
                        <td className="px-3 py-2 text-center text-red-700">{totalOut.toLocaleString("ar-SA")}</td>
                        <td className="px-3 py-2 text-center text-emerald-800">{totalRev.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                        <td className="px-3 py-2 text-center text-green-800">{totalPaid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                        <td className="px-3 py-2 text-center text-orange-700">{(totalRev - totalPaid).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                        <td className="px-3 py-2 text-center text-gray-500">{activeItems.reduce((s,i) => s+(i.quantity??0), 0).toLocaleString("ar-SA")}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Table 2: Outgoing breakdown by product (qty + revenue) ── */}
              {Object.keys(outMap).length > 0 && (
                <div>
                  <p className="text-sm font-bold text-[#103c68] mb-2 flex items-center gap-1">
                    <TrendingDown size={14} />المنصرف تفصيلاً لكل منتج
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-red-600 text-white text-xs">
                          <th className="px-3 py-2.5 text-right">المنتج</th>
                          <th className="px-3 py-2.5 text-center">الكمية المنصرفة</th>
                          <th className="px-3 py-2.5 text-center">إيرادات الصرف</th>
                          <th className="px-3 py-2.5 text-center">مُحصَّل</th>
                          <th className="px-3 py-2.5 text-center">غير مُحصَّل</th>
                          <th className="px-3 py-2.5 text-center">نسبة التحصيل</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {Object.entries(outMap).sort(([,a],[,b]) => b.total - a.total).map(([name, row], idx) => {
                          const collPct = row.total > 0 ? Math.round((row.paid / row.total) * 100) : 0;
                          return (
                            <tr key={name} className={idx % 2 === 0 ? "bg-white" : "bg-red-50/30"}>
                              <td className="px-3 py-2 font-semibold text-gray-800">{name}</td>
                              <td className="px-3 py-2 text-center font-bold text-red-700">{row.qty.toLocaleString("ar-SA")} {row.unit}</td>
                              <td className="px-3 py-2 text-center text-emerald-700">{row.total.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                              <td className="px-3 py-2 text-center text-green-700">{row.paid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                              <td className="px-3 py-2 text-center text-orange-600">{row.unpaid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${collPct >= 80 ? "bg-green-500" : collPct >= 50 ? "bg-yellow-500" : "bg-red-400"}`}
                                      style={{ width: `${collPct}%` }} />
                                  </div>
                                  <span className="text-xs font-bold w-8 text-gray-600">{collPct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Table 3: Reps (recipient) breakdown ── */}
              {(() => {
                const repMap: Record<string, { orders: number; qty: number; revenue: number; paid: number; unpaid: number; products: Set<string> }> = {};
                dispatchOrders.forEach(o => {
                  const key = o.recipient_name?.trim() || "غير محدد";
                  if (!repMap[key]) repMap[key] = { orders: 0, qty: 0, revenue: 0, paid: 0, unpaid: 0, products: new Set() };
                  repMap[key].orders++;
                  repMap[key].qty      += o.quantity;
                  repMap[key].revenue  += o.quantity * o.price;
                  repMap[key].products.add(o.product_name);
                  if (o.payment_status === "paid") repMap[key].paid    += o.quantity * o.price;
                  else                             repMap[key].unpaid  += o.quantity * o.price;
                });
                const repRows = Object.entries(repMap).sort(([,a],[,b]) => b.revenue - a.revenue);
                if (!repRows.length) return null;
                return (
                  <div>
                    <p className="text-sm font-bold text-[#103c68] mb-2 flex items-center gap-1">
                      <Users size={14} />تفصيل المناديب / المستلمين
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-violet-600 text-white text-xs">
                            <th className="px-3 py-2.5 text-right">المستلم</th>
                            <th className="px-3 py-2.5 text-center">عدد الأوامر</th>
                            <th className="px-3 py-2.5 text-center">المنتجات</th>
                            <th className="px-3 py-2.5 text-center">إجمالي الإيرادات</th>
                            <th className="px-3 py-2.5 text-center">مُحصَّل</th>
                            <th className="px-3 py-2.5 text-center">غير مُحصَّل</th>
                            <th className="px-3 py-2.5 text-center">نسبة التحصيل</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {repRows.map(([name, row], idx) => {
                            const collPct = row.revenue > 0 ? Math.round((row.paid / row.revenue) * 100) : 0;
                            return (
                              <tr key={name} className={idx % 2 === 0 ? "bg-white" : "bg-violet-50/30"}>
                                <td className="px-3 py-2 font-semibold text-gray-800">{name}</td>
                                <td className="px-3 py-2 text-center text-violet-700 font-bold">{row.orders}</td>
                                <td className="px-3 py-2 text-center text-xs text-gray-500">{Array.from(row.products).join("، ")}</td>
                                <td className="px-3 py-2 text-center text-emerald-700">{row.revenue.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                                <td className="px-3 py-2 text-center text-green-700">{row.paid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                                <td className="px-3 py-2 text-center text-orange-600">{row.unpaid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${collPct >= 80 ? "bg-green-500" : collPct >= 50 ? "bg-yellow-500" : "bg-red-400"}`}
                                        style={{ width: `${collPct}%` }} />
                                    </div>
                                    <span className="text-xs font-bold w-8 text-gray-600">{collPct}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* ── Low stock alerts ── */}
              {activeItems.filter(i => (i.quantity??0) <= (i.min_stock??0) && (i.min_stock??0) > 0).length > 0 && (
                <div>
                  <p className="text-sm font-bold text-red-600 mb-2 flex items-center gap-1">
                    <AlertTriangle size={14} />تنبيهات نقص المخزون
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-red-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-red-50 text-xs text-red-700">
                          <th className="px-3 py-2 text-right">المنتج</th>
                          <th className="px-3 py-2 text-center">المخزون الحالي</th>
                          <th className="px-3 py-2 text-center">الحد الأدنى</th>
                          <th className="px-3 py-2 text-center">النقص</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeItems.filter(i => (i.quantity??0) <= (i.min_stock??0) && (i.min_stock??0) > 0).map(item => (
                          <tr key={item.id} className="border-t border-red-50">
                            <td className="px-3 py-2 font-semibold text-gray-800">{item.product_name}</td>
                            <td className="px-3 py-2 text-center font-bold text-red-600">{(item.quantity??0).toLocaleString("ar-SA")} {item.unit}</td>
                            <td className="px-3 py-2 text-center text-gray-500">{(item.min_stock??0).toLocaleString("ar-SA")} {item.unit}</td>
                            <td className="px-3 py-2 text-center text-orange-700 font-bold">{Math.max(0,(item.min_stock??0)-(item.quantity??0)).toLocaleString("ar-SA")} {item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      </div>{/* end main content */}

      {/* ═══════════════════ SIDEBAR: طلب توريد يدوي ═══════════════════ */}
      {tab === "requests" && <div className="w-full lg:w-80 lg:flex-shrink-0 lg:sticky lg:top-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header — toggle button */}
          <button
            onClick={() => setShowManualSupply(p => !p)}
            className="w-full px-4 py-3 bg-[#103c68] flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <Truck size={15} className="text-white" />
              <span className="font-bold text-white text-sm">طلب توريد يدوي</span>
              {Object.values(manualQtys).some(q => q > 0) && (
                <span className="text-xs bg-white/25 text-white px-2 py-0.5 rounded-full font-bold">
                  {activeItems.filter(i => (manualQtys[i.id] ?? 0) > 0).length} صنف
                </span>
              )}
            </div>
            {showManualSupply ? <ChevronUp size={15} className="text-white/70" /> : <ChevronDown size={15} className="text-white/70" />}
          </button>

          {showManualSupply && (<div>
          {/* نوع الإرسال */}
          <div className="px-3 pt-2.5 pb-1">
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
              <button
                onClick={() => setSendMode("separate")}
                className={`flex-1 py-1.5 font-semibold transition-colors ${sendMode === "separate" ? "bg-[#103c68] text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >كل طلبية لوحدها</button>
              <button
                onClick={() => setSendMode("combined")}
                className={`flex-1 py-1.5 font-semibold transition-colors ${sendMode === "combined" ? "bg-[#103c68] text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >طلبية واحدة</button>
            </div>
          </div>

          {/* قائمة الأصناف */}
          <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
            {activeItems.map(item => {
              const qty      = manualQtys[item.id] ?? 0;
              const cfg      = trailerConfigs.find(c =>
                item.product_name.includes(c.product_category) ||
                c.product_category.includes(item.product_name)
              );
              const minOrder = cfg?.min_threshold || cfg?.trailer_capacity || 0;
              const cap      = cfg?.trailer_capacity || 0;
              const loads    = cap > 0 && qty > 0 ? Math.ceil(qty / cap) : 0;
              const isSelected = qty > 0;
              return (
                <div key={item.id} className={`px-3 py-2.5 transition-colors ${isSelected ? "bg-[#103c68]/5" : "hover:bg-gray-50"}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-800 leading-tight flex-1 ml-2">{item.product_name}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{item.quantity.toLocaleString("ar-SA")} {item.unit}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="0" placeholder="0"
                      value={qty === 0 ? "" : qty}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0;
                        setManualQtys(prev => ({ ...prev, [item.id]: v }));
                      }}
                      onBlur={e => {
                        const v = parseFloat(e.target.value) || 0;
                        if (v > 0 && minOrder > 0 && v < minOrder) {
                          setManualQtys(prev => ({ ...prev, [item.id]: minOrder }));
                        }
                      }}
                      className={`flex-1 px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-1 text-center transition-colors ${
                        isSelected && minOrder > 0 && qty < minOrder
                          ? "border-amber-400 bg-amber-50 font-bold text-amber-700 focus:ring-amber-400/40"
                          : isSelected
                            ? "border-[#103c68]/30 bg-white font-bold text-[#103c68] focus:ring-[#103c68]/40"
                            : "border-gray-200 focus:ring-[#103c68]/40"
                      }`}
                    />
                    <span className="text-[10px] text-gray-500 w-7 text-center flex-shrink-0">{item.unit}</span>
                    {isSelected && (
                      <button onClick={() => setManualQtys(p => ({ ...p, [item.id]: 0 }))}
                        className="text-gray-300 hover:text-red-400 flex-shrink-0">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {isSelected && minOrder > 0 && qty < minOrder && (
                    <div className="mt-1.5 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                      <span className="text-amber-500 text-xs">⚠️</span>
                      <span className="text-xs text-amber-700 font-semibold flex-1">أقل من الحد الأدنى</span>
                      <button
                        onClick={() => setManualQtys(p => ({ ...p, [item.id]: minOrder }))}
                        className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold hover:bg-amber-600 transition-colors flex-shrink-0"
                      >{minOrder.toLocaleString("ar-SA")}</button>
                    </div>
                  )}
                  {isSelected && !(minOrder > 0 && qty < minOrder) && (
                    <div className="mt-1 flex items-center gap-2">
                      {loads > 0 && <span className="text-[10px] text-indigo-600 font-semibold">{loads} شاحنة</span>}
                    </div>
                  )}
                  {!isSelected && minOrder > 0 && (
                    <div className="text-[10px] text-gray-400 mt-0.5">أدنى: {minOrder.toLocaleString("ar-SA")} {item.unit}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ملاحظات وزر الإرسال */}
          <div className="p-3 border-t border-gray-100 space-y-2">
            <textarea
              value={manualNotes}
              onChange={e => setManualNotes(e.target.value)}
              rows={2}
              placeholder="ملاحظات (اختياري)..."
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#103c68]/30 resize-none"
            />
            {(() => {
              const lines = activeItems.filter(i => (manualQtys[i.id] ?? 0) > 0);
              return (
                <>
                  <button
                    onClick={submitManualReqs}
                    disabled={submittingTransport || lines.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#103c68] text-white text-sm font-bold rounded-xl hover:bg-[#0d3158] disabled:opacity-40 transition-colors"
                  >
                    <Send size={14} />
                    {submittingTransport
                      ? "جاري الإرسال..."
                      : lines.length > 0
                        ? `إرسال ${lines.length} ${lines.length === 1 ? "طلب" : "طلبات"}`
                        : "اختر صنفاً لطلبه"}
                  </button>
                  {lines.length > 0 && (
                    <button onClick={() => setManualQtys({})}
                      className="w-full py-1 text-xs text-gray-400 hover:text-gray-600 text-center">
                      مسح الكل
                    </button>
                  )}
                </>
              );
            })()}
          </div>
          </div>)}
        </div>

        {/* بطاقة الطلبات المعلقة */}
        {pendingReqs.length > 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={13} className="text-amber-600" />
              <span className="text-xs font-bold text-amber-700">{pendingReqs.length} طلب معلق</span>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {pendingReqs.slice(0, 5).map(r => (
                <div key={r.id} className="text-xs bg-white rounded-lg px-2 py-1.5 border border-amber-100">
                  <div className="font-semibold text-gray-700 truncate">{r.product_name}</div>
                  <div className="text-gray-400">{r.requested_qty.toLocaleString("ar-SA")} {r.unit}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>}
    </div>

    {/* ═══════════════════ RETURNS TAB ═══════════════════ */}
    {tab === "returns" && (
      <div className="space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-50 flex-wrap">
            <div>
              <span className="font-bold text-gray-800 text-sm sm:text-base flex items-center gap-1.5">
                <RotateCcw size={14} className="text-orange-500" />المرتجعات
              </span>
              <span className="text-xs text-gray-400 mr-2">({returns.length} سجل)</span>
            </div>
            <button
              onClick={() => { setShowReturnForm(true); setReturnForm({ product_name: "", product_id: null, warehouse_item_id: null, unit: "وحدة", quantity: "", reason: "", returned_by: "" }); }}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-500 text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-orange-600">
              <Plus size={13} />تسجيل مرتجع
            </button>
          </div>

          {/* Return Form */}
          {showReturnForm && (
            <div className="p-5 bg-orange-50 border-b border-orange-100">
              <p className="text-xs font-bold text-orange-700 mb-3">تسجيل مرتجع جديد</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {/* Product */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">المنتج *</label>
                  <select
                    value={returnForm.warehouse_item_id ?? ""}
                    onChange={e => {
                      const item = activeItems.find(i => String(i.id) === e.target.value);
                      if (item) setReturnForm(p => ({ ...p, warehouse_item_id: item.id, product_id: item.product_id ?? null, product_name: item.product_name, unit: item.unit }));
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                    <option value="">اختر منتجاً</option>
                    {activeItems.map(i => (
                      <option key={i.id} value={i.id}>{i.product_name} — متاح: {i.quantity.toLocaleString("ar-SA")} {i.unit}</option>
                    ))}
                  </select>
                </div>
                {/* Quantity */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">الكمية المرتجعة *</label>
                  <div className="flex gap-1">
                    <input type="number" min="0" step="any"
                      value={returnForm.quantity}
                      onChange={e => setReturnForm(p => ({ ...p, quantity: e.target.value }))}
                      placeholder="0"
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    <span className="px-2 py-1.5 bg-gray-100 text-xs rounded-lg text-gray-500 whitespace-nowrap">{returnForm.unit}</span>
                  </div>
                </div>
                {/* Returned by */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">اسم المُرجِع</label>
                  <input type="text"
                    value={returnForm.returned_by}
                    onChange={e => setReturnForm(p => ({ ...p, returned_by: e.target.value }))}
                    placeholder="اسم العميل / الجهة"
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
                {/* Reason */}
                <div className="col-span-2 md:col-span-3">
                  <label className="text-xs font-medium text-gray-600 block mb-1">سبب الإرجاع</label>
                  <input type="text"
                    value={returnForm.reason}
                    onChange={e => setReturnForm(p => ({ ...p, reason: e.target.value }))}
                    placeholder="سبب إرجاع البضاعة..."
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  disabled={savingReturn || !returnForm.product_name || !returnForm.quantity}
                  onClick={async () => {
                    if (!warehouse || !returnForm.product_name || !returnForm.quantity) return;
                    setSavingReturn(true);
                    try {
                      const r = await fetch("/api/warehouse-returns", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          warehouse_id: warehouse.id,
                          warehouse_name: warehouse.name,
                          product_name: returnForm.product_name,
                          product_id: returnForm.product_id,
                          warehouse_item_id: returnForm.warehouse_item_id,
                          unit: returnForm.unit,
                          quantity: parseFloat(returnForm.quantity),
                          reason: returnForm.reason || null,
                          returned_by: returnForm.returned_by || null,
                          created_by: user?.name || null,
                        }),
                      });
                      if (!r.ok) { const e = await r.json(); alert(e.error || "فشل"); }
                      else { setShowReturnForm(false); load(); }
                    } catch { alert("فشل الاتصال"); }
                    setSavingReturn(false);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50">
                  <Save size={13} />{savingReturn ? "جاري الحفظ..." : "حفظ المرتجع"}
                </button>
                <button onClick={() => setShowReturnForm(false)}
                  className="px-4 py-2 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 text-gray-600">
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {/* Returns Table */}
          {returns.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <RotateCcw size={36} className="mx-auto mb-2 opacity-30" />
              <p className="font-semibold text-sm">لا توجد مرتجعات مسجّلة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs font-bold border-b border-gray-100">
                  <tr>
                    <th className="text-right px-4 py-3">التاريخ</th>
                    <th className="text-right px-4 py-3">المنتج</th>
                    <th className="text-right px-4 py-3">الكمية</th>
                    <th className="text-right px-4 py-3">المُرجِع</th>
                    <th className="text-right px-4 py-3">السبب</th>
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map(r => {
                    const isEditingRet = editingReturnId === r.id;
                    return (
                      <tr key={r.id} className={`border-b border-gray-50 ${isEditingRet ? "bg-orange-50/40" : "hover:bg-gray-50/50"}`}>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{r.product_name}</td>
                        <td className="px-4 py-3">
                          {isEditingRet ? (
                            <input type="number" min="0.01" step="any"
                              value={editReturnDraft.quantity}
                              onChange={e => setEditReturnDraft(d => ({ ...d, quantity: e.target.value }))}
                              className="w-24 px-2 py-1 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400" />
                          ) : (
                            <>
                              <span className="text-orange-600 font-bold">+{r.quantity.toLocaleString("ar-SA")}</span>
                              <span className="text-xs text-gray-400 mr-1">{r.unit}</span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {isEditingRet ? (
                            <input type="text"
                              value={editReturnDraft.returned_by}
                              onChange={e => setEditReturnDraft(d => ({ ...d, returned_by: e.target.value }))}
                              placeholder="اسم المُرجِع"
                              className="w-28 px-2 py-1 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400" />
                          ) : (
                            <span className="text-gray-600">{r.returned_by || "—"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {isEditingRet ? (
                            <input type="text"
                              value={editReturnDraft.reason}
                              onChange={e => setEditReturnDraft(d => ({ ...d, reason: e.target.value }))}
                              placeholder="سبب الإرجاع"
                              className="w-36 px-2 py-1 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400" />
                          ) : (
                            <span className="text-gray-500">{r.reason || "—"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditingRet ? (
                            <div className="flex gap-1">
                              <button
                                disabled={savingEditReturn}
                                onClick={async () => {
                                  if (!editReturnDraft.quantity) return;
                                  setSavingEditReturn(true);
                                  try {
                                    const res = await fetch(`/api/warehouse-returns/${r.id}`, {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        quantity: parseFloat(editReturnDraft.quantity),
                                        reason: editReturnDraft.reason,
                                        returned_by: editReturnDraft.returned_by,
                                      }),
                                    });
                                    if (!res.ok) { const e = await res.json(); alert(e.error || "فشل"); }
                                    else { setEditingReturnId(null); load(); }
                                  } catch { alert("فشل الاتصال"); }
                                  setSavingEditReturn(false);
                                }}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50" title="حفظ">
                                <Save size={13} />
                              </button>
                              <button
                                onClick={() => setEditingReturnId(null)}
                                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors" title="إلغاء">
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  setEditingReturnId(r.id);
                                  setEditReturnDraft({ quantity: String(r.quantity), reason: r.reason || "", returned_by: r.returned_by || "" });
                                }}
                                className="p-1.5 text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="تعديل">
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm("هل تريد حذف هذا المرتجع؟ سيتم عكس الكمية من المستودع.")) return;
                                  try {
                                    const res = await fetch(`/api/warehouse-returns/${r.id}`, { method: "DELETE" });
                                    if (!res.ok) { const e = await res.json(); alert(e.error || "فشل"); }
                                    else load();
                                  } catch { alert("فشل الاتصال"); }
                                }}
                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="حذف">
                                <Trash2 size={13} />
                              </button>
                            </div>
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
      </div>
    )}

    {/* ── مودال تعديل أمر الصرف ── */}
    {editingDispatchId !== null && (() => {
      const order = dispatchOrders.find(o => o.id === editingDispatchId);
      if (!order) return null;
      const draftQty   = parseFloat(editDispatchDraft.quantity)  || 0;
      const draftPrice = parseFloat(editDispatchDraft.price)     || 0;
      const subtotal   = draftQty * draftPrice;
      const vat        = subtotal * 0.15;
      const total      = subtotal + vat;
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-black text-gray-900">تعديل أمر الصرف <span className="text-[#103c68]">#{order.id}</span></h2>
                <p className="text-xs text-gray-400 mt-0.5">{order.warehouse_name} · {new Date(order.created_at).toLocaleDateString("ar-SA")}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => printDispatchOrder({ ...order, quantity: draftQty, price: draftPrice, recipient_name: editDispatchDraft.recipient_name || order.recipient_name, notes: editDispatchDraft.notes || order.notes, payment_status: editDispatchDraft.payment_status as "paid" | "unpaid" })}
                  className="p-1.5 text-gray-400 hover:text-[#103c68] hover:bg-blue-50 rounded-lg" title="طباعة">
                  <Printer size={16} />
                </button>
                <button onClick={() => setEditingDispatchId(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} className="text-gray-400" /></button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {/* Context card — readonly */}
              <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">المنتج</span><p className="font-bold text-gray-800 mt-0.5">{order.product_name}</p></div>
                <div><span className="text-gray-400">الوحدة</span><p className="font-semibold text-gray-700 mt-0.5">{order.unit}</p></div>
                <div><span className="text-gray-400">المستودع</span><p className="font-semibold text-gray-700 mt-0.5">{order.warehouse_name}</p></div>
                <div><span className="text-gray-400">تاريخ الإنشاء</span><p className="font-semibold text-gray-700 mt-0.5">{new Date(order.created_at).toLocaleDateString("ar-SA")}</p></div>
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">الكمية <span className="text-red-400">*</span></label>
                  <div className="flex gap-1">
                    <input type="number" min="0" step="any"
                      value={editDispatchDraft.quantity}
                      onChange={e => setEditDispatchDraft(p => ({ ...p, quantity: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    <span className="px-2 py-2 bg-gray-100 text-xs rounded-xl text-gray-500 whitespace-nowrap self-center">{order.unit}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">السعر (ر.س) <span className="text-red-400">*</span></label>
                  <input type="number" min="0" step="any"
                    value={editDispatchDraft.price}
                    onChange={e => setEditDispatchDraft(p => ({ ...p, price: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              {/* Live totals preview */}
              {draftQty > 0 && draftPrice > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div><p className="text-gray-500">المجموع</p><p className="font-bold text-gray-800 text-sm">{subtotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</p></div>
                  <div><p className="text-gray-500">ضريبة 15%</p><p className="font-bold text-amber-700 text-sm">{vat.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</p></div>
                  <div><p className="text-gray-500">الإجمالي</p><p className="font-black text-[#103c68] text-sm">{total.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</p></div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">المستلم</label>
                <input type="text" list="reps-datalist"
                  value={editDispatchDraft.recipient_name}
                  onChange={e => setEditDispatchDraft(p => ({ ...p, recipient_name: e.target.value }))}
                  placeholder="اختر مندوباً أو اكتب اسماً"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">حالة الدفع</label>
                <div className="grid grid-cols-2 gap-2">
                  {[["unpaid","غير مدفوع","text-amber-700 bg-amber-50 border-amber-200"],["paid","✓ مدفوع","text-green-700 bg-green-50 border-green-200"]].map(([val, label, cls]) => (
                    <button key={val} type="button"
                      onClick={() => setEditDispatchDraft(p => ({ ...p, payment_status: val }))}
                      className={`py-2 rounded-xl text-sm font-bold border-2 transition-all ${editDispatchDraft.payment_status === val ? cls : "border-gray-200 text-gray-400 bg-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">ملاحظات</label>
                <textarea rows={2}
                  value={editDispatchDraft.notes}
                  onChange={e => setEditDispatchDraft(p => ({ ...p, notes: e.target.value }))}
                  placeholder="ملاحظات إضافية تظهر في أمر الصرف المطبوع"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                disabled={savingEditDispatch}
                onClick={async () => {
                  setSavingEditDispatch(true);
                  try {
                    const r = await fetch(`/api/warehouse-dispatch-orders/${editingDispatchId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        quantity: draftQty,
                        price: draftPrice,
                        recipient_name: editDispatchDraft.recipient_name || null,
                        notes: editDispatchDraft.notes || null,
                        payment_status: editDispatchDraft.payment_status,
                      }),
                    });
                    if (!r.ok) { const e = await r.json(); alert(e.error || "فشل التحديث"); }
                    else { setEditingDispatchId(null); load(); }
                  } catch { alert("فشل الاتصال"); }
                  setSavingEditDispatch(false);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#103c68] text-white text-sm font-bold rounded-xl hover:bg-[#0d3158] disabled:opacity-50">
                <Save size={13} />{savingEditDispatch ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>
              <button onClick={() => setEditingDispatchId(null)}
                className="px-5 py-2.5 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 text-gray-600">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── مودال تأكيد الاستلام بملاحظات ── */}
    {receiveNotesId !== null && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="font-black text-lg text-gray-900">تأكيد استلام الشحنة</h2>
              <p className="text-xs text-gray-400 mt-0.5">ستنتقل لمرحلة انتظار الموافقة</p>
            </div>
            <button onClick={() => setReceiveNotesId(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X size={16} className="text-gray-400" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-2">ملاحظات الاستلام (اختياري)</label>
              <textarea
                value={receiveNotesText}
                onChange={e => setReceiveNotesText(e.target.value)}
                placeholder="حالة الشحنة، عدد الكميات الفعلية، ملاحظات..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
              />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              المخزون لن يُضاف إلا بعد الموافقة النهائية من زر "✓ موافقة"
            </div>
            <div className="flex gap-2">
              <button
                onClick={submitReceive}
                className="flex-1 py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-colors">
                ✅ تأكيد الاستلام
              </button>
              <button
                onClick={() => setReceiveNotesId(null)}
                className="px-4 py-2.5 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ══════════════ نافذة تأكيد طلب التوريد ══════════════ */}
    {replenishConfirm && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setReplenishConfirm(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-[#103c68] flex items-center justify-center">
              <Truck size={15} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-800 text-sm">تأكيد طلب التوريد</p>
              <p className="text-xs text-gray-500">{replenishConfirm.item.product_name}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">الكمية المطلوبة</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0"
                  value={replenishConfirm.qty}
                  onChange={e => setReplenishConfirm(p => p ? { ...p, qty: parseFloat(e.target.value) || 0 } : p)}
                  className="flex-1 px-3 py-2 text-lg font-bold border-2 border-[#103c68]/30 rounded-xl focus:outline-none focus:border-[#103c68] text-center text-[#103c68]"
                />
                <span className="text-sm text-gray-500 font-medium">{replenishConfirm.item.unit}</span>
              </div>
            </div>

            {replenishConfirm.cfg && (
              <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-500 space-y-0.5">
                {replenishConfirm.cfg.min_threshold > 0 && (
                  <div className="flex justify-between">
                    <span>أقل كمية للطلب:</span>
                    <span className="font-semibold">{replenishConfirm.cfg.min_threshold.toLocaleString("ar-SA")} {replenishConfirm.item.unit}</span>
                  </div>
                )}
                {replenishConfirm.cfg.trailer_capacity > 0 && (
                  <div className="flex justify-between">
                    <span>حمولة الشاحنة:</span>
                    <span className="font-semibold">{replenishConfirm.cfg.trailer_capacity.toLocaleString("ar-SA")} {replenishConfirm.item.unit}</span>
                  </div>
                )}
                <div className="flex justify-between pt-0.5 border-t border-gray-200 mt-1">
                  <span>عدد الشاحنات:</span>
                  <span className="font-bold text-[#103c68]">
                    {Math.ceil(replenishConfirm.qty / (replenishConfirm.cfg.trailer_capacity || 1))} شاحنة
                  </span>
                </div>
              </div>
            )}

            {replenishConfirm.cfg?.min_threshold && replenishConfirm.qty < replenishConfirm.cfg.min_threshold && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                <span>⚠️</span>
                <span>الكمية أقل من الحد الأدنى ({replenishConfirm.cfg.min_threshold.toLocaleString("ar-SA")})</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-5">
            <button
              onClick={submitReplenishConfirm}
              disabled={sendingReq || replenishConfirm.qty <= 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#103c68] text-white text-sm font-bold rounded-xl hover:bg-[#0d3158] disabled:opacity-40 transition-colors">
              <Send size={13} />
              {sendingReq ? "جاري الإرسال..." : "إرسال الطلب"}
            </button>
            <button
              onClick={() => setReplenishConfirm(null)}
              className="px-4 py-2.5 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 transition-colors text-gray-600">
              إلغاء
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
