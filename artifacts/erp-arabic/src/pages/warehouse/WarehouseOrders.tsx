import { useEffect, useRef, useState, useMemo } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { useAuth } from "@/context/AuthContext";
import Barcode from "react-barcode";
import {
  FileText, Package, Truck, CheckCircle, Clock, AlertTriangle,
  RefreshCw, X, Upload, BarChart3, Warehouse, ArrowUpDown,
  TrendingDown, Search, Eye, Edit2, Save, XCircle, MapPin, Navigation,
} from "lucide-react";

interface SlaStatus {
  stage: string; elapsed_minutes: number; limit_minutes: number;
  percent: number; status: "ok" | "warning" | "breached";
}
interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string;
  unit_price: number; total_before_vat: number; vat_amount: number; total_with_vat: number;
  delivery_location: string; destination_type: string; stage: string;
  vehicle_plate: string; driver_name: string; driver_phone: string;
  invoice_number: string; invoice_image_url: string; invoice_date: string;
  loading_photo_url: string; loading_date: string;
  delivery_date: string; created_at: string;
  rep_name?: string; rep_phone?: string; packaging_type?: string;
  loading_point_id?: number; loading_point_name?: string;
  warehouse_id?: number; invoice_warehouse_id?: number;
  sla_status?: SlaStatus;
}
function SlaBadge({ sla }: { sla?: SlaStatus }) {
  if (!sla || sla.status === "ok") return null;
  if (sla.status === "breached")
    return (
      <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full" title={`تجاوز SLA: ${sla.elapsed_minutes} دق من ${sla.limit_minutes}`}>
        🚨 تجاوز SLA
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-full" title={`تحذير SLA: ${sla.elapsed_minutes} دق من ${sla.limit_minutes}`}>
      ⚠️ {sla.percent}% من الوقت
    </span>
  );
}

interface LoadingPoint {
  id: number; name: string; city?: string; address?: string; lat?: number; lng?: number;
}

interface WarehouseItem {
  id: number; warehouse_id: number; product_name: string;
  quantity: number; unit: string; min_stock: number;
  last_updated: string; notes: string;
}

interface WarehouseInfo {
  id: number; name: string; location: string;
  capacity: number; items_count: number; total_stock: number;
}

interface Product {
  id: number; name: string; unit: string; category: string | null;
  stock: number; price_per_unit: number; active: number;
}

const STAGE_LABEL: Record<string, string> = {
  vehicle_assigned: "بانتظار الفاتورة",
  invoiced:         "فاتورة صادرة",
  loaded:           "تم التحميل",
  delivered:        "تم التسليم",
};
const STAGE_COLOR: Record<string, string> = {
  vehicle_assigned: "bg-blue-50 text-blue-700 border-blue-200",
  invoiced:         "bg-purple-50 text-purple-700 border-purple-200",
  loaded:           "bg-cyan-50 text-cyan-700 border-cyan-200",
  delivered:        "bg-green-50 text-green-700 border-green-200",
};

export default function WarehouseOrders() {
  const { user } = useAuth();
  const [orders,        setOrders]        = useState<Order[]>([]);
  const [warehouses,    setWarehouses]     = useState<WarehouseInfo[]>([]);
  const [items,         setItems]          = useState<WarehouseItem[]>([]);
  const [products,      setProducts]       = useState<Product[]>([]);
  const [loadingPoints, setLoadingPoints]  = useState<LoadingPoint[]>([]);
  const [loading,       setLoading]        = useState(true);
  const [tab,           setTab]            = useRememberedState("warehouse-orders-tab", "dashboard" as "dashboard"|"pending"|"history"|"inventory");

  const [selectedOrder,   setSelectedOrder]   = useState<Order | null>(null);
  const [invoiceNum,      setInvoiceNum]       = useState("");
  const [submitting,      setSubmitting]       = useState(false);
  const [previewMode,     setPreviewMode]      = useState(false);
  const [transferModal,   setTransferModal]    = useState<Order | null>(null);
  const [targetWhId,      setTargetWhId]       = useState<string>("");
  const [transferReason,  setTransferReason]   = useState("");
  const [transferring,    setTransferring]     = useState(false);
  const [searchHistory,   setSearchHistory]    = useRememberedState("warehouse-orders-history-search", "");
  const [expandedWh,      setExpandedWh]       = useState<number | null>(null);

  // Change loading point state
  const [lpModal,       setLpModal]       = useState<Order | null>(null);
  const [selectedLPId,  setSelectedLPId]  = useState<string>("");
  const [customLPText,  setCustomLPText]  = useState("");
  const [changingLP,    setChangingLP]    = useState(false);

  // Stock editing state
  const [editingStock, setEditingStock] = useState<Record<number, string>>({});
  const [savingStock,  setSavingStock]  = useState<number | null>(null);
  const [stockSearch,  setStockSearch]  = useRememberedState("warehouse-orders-stock-search", "");
  const [whItemStock,      setWhItemStock]      = useState<number | null>(null);
  const [selectedSourceWh, setSelectedSourceWh] = useState<number | null>(null);
  const [whStockPerWh,     setWhStockPerWh]     = useState<Record<number, number>>({});

  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/workflow/orders?role=warehouse").then(r => r.json()),
      fetch("/api/warehouses").then(r => r.json()),
      fetch("/api/products/all").then(r => r.json()),
      fetch("/api/loading-points").then(r => r.json()),
    ]).then(([o, w, p, lp]) => {
      setOrders(Array.isArray(o) ? o : []);
      setWarehouses(Array.isArray(w) ? w : []);
      setProducts(Array.isArray(p) ? p : []);
      setLoadingPoints(Array.isArray(lp) ? lp : []);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const startEdit = (p: Product) =>
    setEditingStock(prev => ({ ...prev, [p.id]: String(p.stock) }));

  const cancelEdit = (id: number) =>
    setEditingStock(prev => { const n = { ...prev }; delete n[id]; return n; });

  const saveStock = async (p: Product) => {
    const val = parseInt(editingStock[p.id] ?? "");
    if (isNaN(val) || val < 0) return;
    setSavingStock(p.id);
    try {
      const res = await fetch(`/api/products/${p.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock: val }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, stock: val } : x));
      cancelEdit(p.id);
    } catch { alert("فشل تحديث المخزون"); }
    finally { setSavingStock(null); }
  };

  const filteredProducts = useMemo(() => {
    const q = stockSearch.toLowerCase();
    return products.filter(p =>
      !q || p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q)
    );
  }, [products, stockSearch]);

  useEffect(() => {
    if (!selectedOrder) {
      setWhItemStock(null); setWhStockPerWh({}); setSelectedSourceWh(null);
      return;
    }
    if (selectedOrder.invoice_warehouse_id) setSelectedSourceWh(selectedOrder.invoice_warehouse_id);
    if (!warehouses.length) return;
    Promise.all(
      warehouses.map(w =>
        fetch(`/api/warehouses/${w.id}/items`).then(r => r.json())
          .then((items: WarehouseItem[]) => {
            const match = items.find(i =>
              i.product_name.includes(selectedOrder.product_name) ||
              selectedOrder.product_name.includes(i.product_name)
            );
            return { id: w.id, qty: match?.quantity ?? null as number | null };
          })
          .catch(() => ({ id: w.id, qty: null as number | null }))
      )
    ).then(results => {
      const perWh: Record<number, number> = {};
      let total = 0;
      results.forEach(({ id, qty }) => { if (qty !== null) { perWh[id] = qty; total += qty; } });
      setWhStockPerWh(perWh);
      setWhItemStock(total || null);
      if (!selectedOrder.invoice_warehouse_id) {
        const enough = results.find(r => r.qty !== null && r.qty >= (selectedOrder.quantity || 0));
        if (enough) setSelectedSourceWh(enough.id);
        else if (results.length) setSelectedSourceWh(results[0].id);
      }
    });
  }, [selectedOrder, warehouses]);

  const loadWarehouseItems = async (whId: number) => {
    if (expandedWh === whId) { setExpandedWh(null); return; }
    const data = await fetch(`/api/warehouses/${whId}/items`).then(r => r.json());
    setItems(data);
    setExpandedWh(whId);
  };

  const issueInvoice = async () => {
    if (!selectedOrder || !user) return;
    if (!selectedSourceWh) { alert("يرجى اختيار مستودع التحميل أولاً"); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("warehouse_phone", user.phone);
      fd.append("invoice_number", invoiceNum || `INV-${selectedOrder.order_number}`);
      fd.append("invoice_warehouse_id", String(selectedSourceWh));
      if (fileRef.current?.files?.[0]) fd.append("invoice_image", fileRef.current.files[0]);
      const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/invoice`, { method: "PUT", body: fd });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedOrder(null); setInvoiceNum(""); setPreviewMode(false);
      setSelectedSourceWh(null); setWhStockPerWh({});
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const transferOrder = async () => {
    if (!transferModal || !targetWhId) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/warehouses/transfer-order/${transferModal.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_warehouse_id: parseInt(targetWhId), reason: transferReason, transferred_by: user?.name || user?.phone }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setTransferModal(null); setTargetWhId(""); setTransferReason("");
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setTransferring(false); }
  };

  const changeLoadingPoint = async () => {
    if (!lpModal) return;
    setChangingLP(true);
    try {
      const body = selectedLPId && selectedLPId !== "custom"
        ? { loading_point_id: parseInt(selectedLPId) }
        : { loading_point_name: customLPText };
      const res = await fetch(`/api/workflow/orders/${lpModal.id}/change-loading-point`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setLpModal(null); setSelectedLPId(""); setCustomLPText("");
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setChangingLP(false); }
  };

  const pending   = useMemo(() => orders.filter(o => o.stage === "vehicle_assigned"), [orders]);
  const history   = useMemo(() => orders.filter(o => ["invoiced","loaded","delivered"].includes(o.stage)), [orders]);
  const delivered = useMemo(() => orders.filter(o => o.stage === "delivered"), [orders]);
  const revenue   = useMemo(() => delivered.reduce((s, o) => s + (o.total_with_vat || 0), 0), [delivered]);

  const filteredHistory = useMemo(() => {
    if (!searchHistory.trim()) return history;
    const q = searchHistory.toLowerCase();
    return history.filter(o =>
      o.order_number?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.invoice_number?.toLowerCase().includes(q)
    );
  }, [history, searchHistory]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={22} className="animate-spin text-[#103c68]" />
    </div>
  );

  const StagePill = ({ stage }: { stage: string }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${STAGE_COLOR[stage] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );

  return (
    <div dir="rtl" className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Warehouse size={24} className="text-[#103c68]" />بوابة المستودع
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">{pending.length} طلب ينتظر إصدار فاتورة</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl text-sm transition-colors">
          <RefreshCw size={14} />تحديث
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none">
        {([
          { id: "dashboard", label: "الرئيسية",        icon: BarChart3 },
          { id: "pending",   label: "انتظار الفاتورة", icon: Clock,    count: pending.length },
          { id: "history",   label: "السجل",            icon: FileText, count: history.length },
          { id: "inventory", label: "المخزون",          icon: Package },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all
                ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon size={13} className="shrink-0" />{t.label}
              {"count" in t && t.count !== undefined && t.count > 0 && (
                <span className={`text-xs font-black px-1.5 rounded-full
                  ${t.id === "pending" && t.count > 0 ? "bg-amber-100 text-amber-700" :
                    tab === t.id ? "bg-[#103c68]/10 text-[#103c68]" : "bg-gray-200 text-gray-600"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════ DASHBOARD ══════════════════════════════ */}
      {tab === "dashboard" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "بانتظار الفاتورة", val: pending.length,   icon: Clock,        color: "bg-amber-500",  alert: pending.length > 0 },
              { label: "فواتير صادرة",     val: history.filter(o => o.stage === "invoiced").length, icon: FileText, color: "bg-purple-500", alert: false },
              { label: "في الطريق",         val: orders.filter(o => o.stage === "loaded").length, icon: Truck, color: "bg-cyan-500", alert: false },
              { label: "تم التسليم",         val: delivered.length, icon: CheckCircle, color: "bg-green-500", alert: false },
            ].map(({ label, val, icon: Icon, color, alert }) => (
              <div key={label} className={`bg-white rounded-2xl border shadow-sm p-3 sm:p-5 flex items-start gap-2 sm:gap-3 ${alert && val > 0 ? "border-amber-200" : "border-gray-100"}`}>
                <div className={`${color} w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon size={17} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl sm:text-2xl font-black text-gray-900">{val}</div>
                  <div className="text-[10px] sm:text-xs text-gray-400 mt-0.5 leading-tight">{label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-l from-[#103c68] to-[#1a5899] rounded-2xl p-4 sm:p-6 text-white flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs sm:text-sm opacity-70">إجمالي المبيعات المسلّمة (شامل الضريبة)</div>
              <div className="text-2xl sm:text-4xl font-black mt-1 truncate">{revenue.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س</div>
              <div className="text-xs opacity-50 mt-1">من {delivered.length} طلب مسلّم</div>
            </div>
            <BarChart3 size={48} className="opacity-10 shrink-0" />
          </div>

          {pending.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-amber-800">{pending.length} طلب ينتظر إصدار الفاتورة</div>
                <div className="text-sm text-amber-600 mt-0.5">هذه الطلبات جاهزة للشحن وتحتاج فواتير قبل التحميل</div>
              </div>
              <button onClick={() => setTab("pending")}
                className="flex-shrink-0 bg-amber-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-amber-600 transition-colors">
                إصدار الآن
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="font-bold text-gray-800">آخر النشاطات</h2>
            </div>
            {orders.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">لا توجد طلبات بعد</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {orders.slice(0, 6).map(o => (
                  <div key={o.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</div>
                      <div className="text-sm font-semibold text-gray-800 truncate">{o.customer_name}</div>
                      <div className="text-xs text-gray-400">{o.product_name} × {o.quantity} {o.unit}</div>
                    </div>
                    <div className="text-left flex-shrink-0 space-y-1">
                      <div className="font-bold text-sm text-gray-900">{o.total_with_vat?.toFixed(0)} ر.س</div>
                      <StagePill stage={o.stage} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════ PENDING INVOICES ══════════════════════════════ */}
      {tab === "pending" && (
        <div className="space-y-4">
          {pending.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 text-gray-400">
              <CheckCircle size={40} className="mx-auto mb-3 text-green-400 opacity-60" />
              <p className="font-semibold">لا توجد طلبات معلقة</p>
              <p className="text-sm mt-1">جميع الطلبات الجاهزة حصلت على فواتيرها</p>
            </div>
          ) : pending.map(order => (
            <div key={order.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono text-xs text-[#103c68] font-bold">{order.order_number}</span>
                    <SlaBadge sla={order.sla_status} />
                  </div>
                  <div className="font-black text-gray-900 text-lg">{order.customer_name}</div>
                  <div className="text-sm text-gray-500">{order.product_name}</div>
                </div>
                <div className="text-left">
                  <div className="font-black text-2xl text-gray-900">{order.total_with_vat?.toFixed(2)}</div>
                  <div className="text-xs text-gray-400">ريال سعودي شامل الضريبة</div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-sm mb-4">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">الكمية</div>
                  <div className="font-bold text-gray-700">{order.quantity} {order.unit}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">قبل الضريبة</div>
                  <div className="font-bold text-gray-700">{order.total_before_vat?.toFixed(2)} ر.س</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">الضريبة 15%</div>
                  <div className="font-bold text-gray-700">{order.vat_amount?.toFixed(2)} ر.س</div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-400 mb-3 flex-wrap">
                <span>📍 {order.delivery_location || "—"}</span>
                <span>🚗 {order.vehicle_plate || "—"}</span>
                {order.driver_name && <span>👤 {order.driver_name}</span>}
                {order.loading_point_name && (
                  <span className="flex items-center gap-1 text-[#103c68] font-semibold">
                    <MapPin size={11} />تحميل: {order.loading_point_name}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setLpModal(order); setSelectedLPId(""); setCustomLPText(""); }}
                  className="flex items-center justify-center gap-1.5 px-3 py-3 border border-[#103c68]/30 text-[#103c68] rounded-xl text-sm font-semibold hover:bg-[#103c68]/5 transition-colors"
                  title="تغيير مكان التحميل">
                  <Navigation size={14} />تحميل
                </button>
                <button
                  onClick={() => { setTransferModal(order); setTargetWhId(""); setTransferReason(""); }}
                  className="flex items-center justify-center gap-1.5 px-3 py-3 border border-[#103c68] text-[#103c68] rounded-xl text-sm font-semibold hover:bg-[#103c68]/5 transition-colors">
                  <ArrowUpDown size={14} />ترحيل
                </button>
                <button
                  onClick={() => { setSelectedOrder(order); setInvoiceNum(`INV-${order.order_number}`); setPreviewMode(false); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] hover:bg-[#0d3158] text-white py-3 rounded-xl font-bold text-sm transition-colors">
                  <FileText size={15} />إصدار الفاتورة
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════ HISTORY ══════════════════════════════ */}
      {tab === "history" && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={15} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={searchHistory} onChange={e => setSearchHistory(e.target.value)}
              placeholder="بحث بالرقم أو العميل أو رقم الفاتورة..."
              className="w-full bg-white border border-gray-200 rounded-xl pe-10 ps-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/20 shadow-sm" />
          </div>
          <div className="text-xs text-gray-400 px-1">عرض {filteredHistory.length} من {history.length}</div>
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">لا توجد نتائج</div>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map(o => (
                <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-xs text-[#103c68] font-bold">{o.order_number}</span>
                        {o.invoice_number && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">{o.invoice_number}</span>
                        )}
                      </div>
                      <div className="font-semibold text-gray-800">{o.customer_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{o.product_name} × {o.quantity} {o.unit}</div>
                    </div>
                    <div className="text-left flex-shrink-0 space-y-1">
                      <div className="font-black text-gray-900">{o.total_with_vat?.toFixed(0)} ر.س</div>
                      <StagePill stage={o.stage} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 flex-wrap">
                    {o.invoice_date && <span>📅 {new Date(o.invoice_date).toLocaleDateString("ar-SA")}</span>}
                    {o.vehicle_plate && <span>🚗 {o.vehicle_plate}</span>}
                    {o.delivery_date && <span>✅ تسليم: {new Date(o.delivery_date).toLocaleDateString("ar-SA")}</span>}
                    {o.invoice_image_url && (
                      <a href={o.invoice_image_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-[#103c68] hover:underline font-semibold">
                        <Eye size={11} />عرض الفاتورة
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════ INVENTORY ══════════════════════════════ */}
      {tab === "inventory" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
              <input value={stockSearch} onChange={e => setStockSearch(e.target.value)}
                placeholder="بحث عن منتج..."
                className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
            </div>
            <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
              <span className="font-bold text-[#103c68]">{products.length}</span> منتج إجمالاً
            </div>
          </div>

          {products.filter(p => p.stock === 0).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-bold text-red-700">{products.filter(p => p.stock === 0).length} منتج نفذ مخزونه</span>
                <span className="text-red-500 mr-1">— يُستحسن تحديث الكميات</span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <div className="grid grid-cols-12 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 min-w-[380px]">
              <div className="col-span-5">المنتج</div>
              <div className="col-span-2 text-center">الوحدة</div>
              <div className="col-span-3 text-center">الكمية الحالية</div>
              <div className="col-span-2 text-center">تعديل</div>
            </div>
            {filteredProducts.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">لا توجد نتائج</div>
            ) : (
              <div className="divide-y divide-gray-50 min-w-[380px]">
                {filteredProducts.map(p => {
                  const isEditing = p.id in editingStock;
                  const isSaving  = savingStock === p.id;
                  const isEmpty   = p.stock === 0;
                  return (
                    <div key={p.id} className={`grid grid-cols-12 px-4 py-3.5 items-center text-sm transition-colors ${isEmpty ? "bg-red-50/40" : "hover:bg-gray-50/60"}`}>
                      <div className="col-span-5 flex items-center gap-2 min-w-0">
                        {isEmpty && <TrendingDown size={13} className="text-red-500 flex-shrink-0" />}
                        <div>
                          <div className={`font-semibold truncate ${isEmpty ? "text-red-700" : "text-gray-900"}`}>{p.name}</div>
                          {p.category && <div className="text-xs text-gray-400">{p.category}</div>}
                        </div>
                      </div>
                      <div className="col-span-2 text-center text-gray-500 text-xs">{p.unit}</div>
                      <div className="col-span-3 text-center">
                        {isEditing ? (
                          <input type="number" min="0" step="1" value={editingStock[p.id]}
                            onChange={e => setEditingStock(prev => ({ ...prev, [p.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") saveStock(p); if (e.key === "Escape") cancelEdit(p.id); }}
                            autoFocus
                            className="w-24 border-2 border-[#103c68] rounded-lg px-2 py-1 text-center font-black text-[#103c68] text-base focus:outline-none" />
                        ) : (
                          <span className={`font-black text-lg ${isEmpty ? "text-red-600" : "text-[#103c68]"}`}>
                            {p.stock.toLocaleString("ar-SA")}
                          </span>
                        )}
                      </div>
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveStock(p)} disabled={isSaving}
                              className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                              {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                            </button>
                            <button onClick={() => cancelEdit(p.id)} className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">
                              <XCircle size={13} />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => startEdit(p)} className="p-1.5 bg-[#103c68]/10 hover:bg-[#103c68]/20 text-[#103c68] rounded-lg transition-colors">
                            <Edit2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>{/* /overflow-x-auto */}
          </div>

          {/* Warehouse stock breakdown */}
          {warehouses.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <Warehouse size={16} className="text-[#103c68]" />مخزون المستودعات
                </h2>
              </div>
              {warehouses.map(w => (
                <div key={w.id} className="border-b border-gray-50 last:border-0">
                  <button onClick={() => loadWarehouseItems(w.id)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-sm">
                    <span className="font-semibold text-gray-800">{w.name}</span>
                    <span className="text-gray-400 text-xs">{w.items_count} صنف · {w.location || "—"}</span>
                  </button>
                  {expandedWh === w.id && (
                    <div className="px-5 pb-3">
                      {items.length === 0 ? (
                        <p className="text-gray-400 text-xs py-2">لا توجد أصناف</p>
                      ) : (
                        <div className="space-y-1.5">
                          {items.map(i => (
                            <div key={i.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                              <span className="text-gray-700 font-medium">{i.product_name}</span>
                              <div className="flex items-center gap-3">
                                <span className={`font-bold ${i.quantity <= i.min_stock ? "text-red-600" : "text-[#103c68]"}`}>
                                  {i.quantity.toLocaleString("ar-SA")} {i.unit}
                                </span>
                                {i.quantity <= i.min_stock && (
                                  <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">منخفض</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 text-center">اضغط <kbd className="bg-gray-100 px-1 rounded">Enter</kbd> لحفظ أو <kbd className="bg-gray-100 px-1 rounded">Esc</kbd> للإلغاء</p>
        </div>
      )}

      {/* ══════════════════════════════ INVOICE MODAL ══════════════════════════════ */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* ─── FORM MODE ─────────────────────────────────── */}
            {!previewMode && (
              <>
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                  <div>
                    <h2 className="font-black text-gray-900 text-lg">إصدار فاتورة</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{selectedOrder.order_number}</p>
                  </div>
                  <button onClick={() => { setSelectedOrder(null); setSelectedSourceWh(null); setWhStockPerWh({}); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                    <X size={18} />
                  </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
                    {[
                      ["العميل",       selectedOrder.customer_name],
                      ["الجوال",       selectedOrder.customer_phone],
                      ["المنتج",       `${selectedOrder.product_name} × ${selectedOrder.quantity} ${selectedOrder.unit}`],
                      ["نوع التغليف",  selectedOrder.packaging_type || "معبأ"],
                      ["موقع التسليم", selectedOrder.delivery_location || "—"],
                      ["مكان التحميل", selectedOrder.loading_point_name || "—"],
                      ["قبل الضريبة",  `${selectedOrder.total_before_vat?.toFixed(2)} ر.س`],
                      ["الضريبة 15%",  `${selectedOrder.vat_amount?.toFixed(2)} ر.س`],
                    ].map(([l, v]) => (
                      <div key={l} className="flex justify-between">
                        <span className="text-gray-500">{l}</span>
                        <span className="font-semibold text-gray-800">{v}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-base font-black border-t border-gray-200 pt-2">
                      <span>الإجمالي</span>
                      <span className="text-[#103c68]">{selectedOrder.total_with_vat?.toFixed(2)} ر.س</span>
                    </div>
                  </div>
                  {/* ── مستودع التحميل + رصيد المخزون ── */}
                  {warehouses.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-gray-700">
                          مستودع التحميل <span className="text-red-500">*</span>
                        </label>
                        {whItemStock !== null && (
                          <span className="text-xs text-gray-400">
                            إجمالي: {whItemStock.toLocaleString("ar-SA")} {selectedOrder.unit}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {warehouses.map(wh => {
                          const stock  = whStockPerWh[wh.id] ?? null;
                          const enough = stock !== null && stock >= selectedOrder.quantity;
                          const isSel  = selectedSourceWh === wh.id;
                          return (
                            <button
                              key={wh.id}
                              type="button"
                              onClick={() => setSelectedSourceWh(wh.id)}
                              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 text-sm transition-colors ${
                                isSel
                                  ? "border-[#103c68] bg-[#103c68]/5"
                                  : "border-gray-200 bg-gray-50 hover:border-gray-300"
                              }`}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSel ? "bg-[#103c68]" : "bg-gray-300"}`} />
                                <span className={`font-semibold ${isSel ? "text-[#103c68]" : "text-gray-700"}`}>{wh.name}</span>
                                {wh.location && <span className="text-gray-400 text-xs hidden sm:inline">({wh.location})</span>}
                              </div>
                              <span className={`font-bold tabular-nums text-sm ${
                                stock === null ? "text-gray-400 text-xs" : enough ? "text-green-600" : "text-red-500"
                              }`}>
                                {stock === null ? "—" : `${stock.toLocaleString("ar-SA")} ${selectedOrder.unit || ""}`}
                                {stock !== null && !enough && (
                                  <span className="text-[10px] font-normal mr-1">(غير كافٍ)</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1.5">رقم الفاتورة</label>
                    <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1.5">رفع صورة الفاتورة (اختياري)</label>
                    <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 hover:border-[#103c68]/40 rounded-xl p-3 transition-colors">
                      <Upload size={16} className="text-gray-400" />
                      <span className="text-sm text-gray-500">{fileRef.current?.files?.[0]?.name || "اختر صورة أو PDF..."}</span>
                      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" />
                    </label>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setSelectedOrder(null); setSelectedSourceWh(null); setWhStockPerWh({}); }}
                      className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                      إلغاء
                    </button>
                    <button onClick={() => setPreviewMode(true)} disabled={!invoiceNum}
                      className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-black text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                      <Eye size={14} />معاينة الفاتورة
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ─── PREVIEW MODE ──────────────────────────────── */}
            {previewMode && (
              <>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#103c68] rounded-t-3xl">
                  <h2 className="font-black text-white text-lg">معاينة الفاتورة</h2>
                  <span className="text-xs text-white/60">تأكد من البيانات قبل الإصدار</span>
                </div>

                <div className="px-6 py-5 space-y-4" dir="rtl">
                  {/* Company header */}
                  <div className="text-center border-b border-gray-200 pb-4">
                    <div className="text-xl font-black text-[#103c68]">شركة MKGH للمقاولات</div>
                    <div className="text-sm text-gray-500 mt-0.5">فاتورة ضريبية رقم {invoiceNum}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}</div>
                  </div>

                  {/* Meta grid */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ["رقم الفاتورة",   invoiceNum],
                      ["رقم الطلب",      selectedOrder.order_number],
                      ["تاريخ الإصدار",  new Date().toLocaleDateString("ar-SA")],
                      ["نوع التغليف",    selectedOrder.packaging_type || "معبأ"],
                    ].map(([lbl, val]) => (
                      <div key={lbl} className="bg-gray-50 rounded-xl p-3">
                        <div className="text-xs text-gray-400 mb-0.5">{lbl}</div>
                        <div className="font-bold text-gray-700 font-mono text-sm">{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Client info */}
                  <div className="bg-blue-50 rounded-xl p-4">
                    <div className="text-xs font-bold text-[#103c68] mb-2">بيانات العميل</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500 text-xs">الاسم: </span><span className="font-semibold">{selectedOrder.customer_name}</span></div>
                      <div><span className="text-gray-500 text-xs">الجوال: </span><span className="font-semibold">{selectedOrder.customer_phone}</span></div>
                      <div className="col-span-2"><span className="text-gray-500 text-xs">موقع التسليم: </span><span className="font-semibold">{selectedOrder.delivery_location || "—"}</span></div>
                      {selectedOrder.loading_point_name && (
                        <div className="col-span-2"><span className="text-gray-500 text-xs">مكان التحميل: </span><span className="font-semibold text-[#103c68]">{selectedOrder.loading_point_name}</span></div>
                      )}
                    </div>
                  </div>

                  {/* Product table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-[#103c68] text-white text-xs font-bold px-4 py-2 grid grid-cols-4 gap-2">
                      <span className="col-span-2">المنتج</span><span className="text-center">الكمية</span><span className="text-center">المبلغ</span>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-4 gap-2 text-sm">
                      <span className="col-span-2 font-semibold text-gray-800">{selectedOrder.product_name}</span>
                      <span className="text-center text-gray-600">{selectedOrder.quantity} {selectedOrder.unit}</span>
                      <span className="text-center font-bold text-[#103c68]">{selectedOrder.total_before_vat?.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 text-sm flex justify-between">
                      <span className="text-gray-500">الضريبة 15%</span>
                      <span className="font-semibold">{selectedOrder.vat_amount?.toFixed(2)} ر.س</span>
                    </div>
                    <div className="px-4 py-3 bg-[#103c68]/5 flex justify-between font-black text-base">
                      <span className="text-[#103c68]">الإجمالي شامل الضريبة</span>
                      <span className="text-[#103c68]">{selectedOrder.total_with_vat?.toFixed(2)} ر.س</span>
                    </div>
                  </div>

                  {/* Logistics */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {selectedSourceWh && (() => {
                      const wh = warehouses.find(w => w.id === selectedSourceWh);
                      return wh ? (
                        <div className="bg-[#103c68]/5 border border-[#103c68]/20 rounded-xl p-3 col-span-2">
                          <div className="text-xs text-[#103c68]/60 mb-0.5">مستودع التحميل</div>
                          <div className="font-black text-[#103c68]">{wh.name}</div>
                          {wh.location && <div className="text-xs text-[#103c68]/50 mt-0.5">{wh.location}</div>}
                        </div>
                      ) : null;
                    })()}
                    {selectedOrder.vehicle_plate && (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="text-xs text-gray-400 mb-0.5">رقم السيارة</div>
                        <div className="font-bold text-gray-700">{selectedOrder.vehicle_plate}</div>
                      </div>
                    )}
                    {selectedOrder.driver_name && (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="text-xs text-gray-400 mb-0.5">السائق</div>
                        <div className="font-bold text-gray-700">{selectedOrder.driver_name}</div>
                      </div>
                    )}
                    {selectedOrder.rep_name && (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="text-xs text-gray-400 mb-0.5">المندوب</div>
                        <div className="font-bold text-gray-700">{selectedOrder.rep_name}</div>
                      </div>
                    )}
                    {selectedOrder.destination_type && (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="text-xs text-gray-400 mb-0.5">نوع الوجهة</div>
                        <div className="font-bold text-gray-700">{selectedOrder.destination_type}</div>
                      </div>
                    )}
                  </div>

                  {/* Barcode */}
                  <div className="flex flex-col items-center py-4 border border-dashed border-gray-200 rounded-xl bg-white">
                    <Barcode
                      value={selectedOrder.order_number}
                      width={1.4}
                      height={50}
                      fontSize={11}
                      margin={6}
                      displayValue={true}
                    />
                  </div>

                  {/* VAT notice */}
                  <div className="text-center text-xs text-gray-400 border-t border-gray-100 pt-3">
                    ضريبة القيمة المضافة 15% · المملكة العربية السعودية
                  </div>
                </div>

                <div className="flex gap-3 px-6 pb-6">
                  <button onClick={() => setPreviewMode(false)}
                    className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2">
                    <X size={14} />تعديل
                  </button>
                  <button onClick={issueInvoice} disabled={submitting}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {submitting ? <><RefreshCw size={14} className="animate-spin" />جاري...</> : <><CheckCircle size={14} />تأكيد الإصدار</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════ TRANSFER MODAL ══════════════════════════════ */}
      {transferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-black text-gray-900 text-lg">ترحيل الطلب</h2>
                <p className="text-xs text-gray-400">{transferModal.order_number} — {transferModal.customer_name}</p>
              </div>
              <button onClick={() => setTransferModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">المستودع الهدف</label>
                <select value={targetWhId} onChange={e => setTargetWhId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                  <option value="">اختر مستودعاً...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} — {w.location || ""}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">سبب الترحيل (اختياري)</label>
                <textarea value={transferReason} onChange={e => setTransferReason(e.target.value)} rows={2}
                  placeholder="مثال: طاقة مستودع ممتلئة..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTransferModal(null)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50">إلغاء</button>
                <button onClick={transferOrder} disabled={!targetWhId || transferring}
                  className="flex-1 py-3 bg-[#103c68] text-white rounded-xl font-black text-sm disabled:opacity-50 hover:bg-[#0d3158] flex items-center justify-center gap-2">
                  {transferring ? <RefreshCw size={14} className="animate-spin" /> : <ArrowUpDown size={14} />}
                  تأكيد الترحيل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════ CHANGE LOADING POINT MODAL ══════════════════════════════ */}
      {lpModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-black text-gray-900 text-lg flex items-center gap-2">
                  <Navigation size={18} className="text-[#103c68]" />تغيير مكان التحميل
                </h2>
                <p className="text-xs text-gray-400">{lpModal.order_number} — {lpModal.customer_name}</p>
              </div>
              <button onClick={() => setLpModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              {lpModal.loading_point_name && (
                <div>
                  <div className="text-xs font-bold text-gray-500 mb-1">مكان التحميل الحالي</div>
                  <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-600 flex items-center gap-2">
                    <MapPin size={13} className="text-gray-400" />{lpModal.loading_point_name}
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">مكان التحميل الجديد</label>
                {loadingPoints.length > 0 ? (
                  <select value={selectedLPId} onChange={e => setSelectedLPId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20">
                    <option value="">اختر نقطة التحميل...</option>
                    {loadingPoints.map(lp => (
                      <option key={lp.id} value={lp.id}>{lp.name}{lp.city ? ` — ${lp.city}` : ""}</option>
                    ))}
                    <option value="custom">✏️ إدخال يدوي...</option>
                  </select>
                ) : (
                  <div className="text-xs text-gray-400 mb-2">لا توجد نقاط تحميل مسجّلة — أدخل يدوياً</div>
                )}
              </div>
              {(selectedLPId === "custom" || loadingPoints.length === 0) && (
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">العنوان (يدوي)</label>
                  <input value={customLPText} onChange={e => setCustomLPText(e.target.value)}
                    placeholder="أدخل اسم أو عنوان مكان التحميل..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setLpModal(null)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50">إلغاء</button>
                <button onClick={changeLoadingPoint}
                  disabled={(!selectedLPId && !customLPText) || changingLP}
                  className="flex-1 py-3 bg-[#103c68] text-white rounded-xl font-black text-sm disabled:opacity-50 hover:bg-[#0d3158] flex items-center justify-center gap-2">
                  {changingLP ? <RefreshCw size={14} className="animate-spin" /> : <Navigation size={14} />}
                  تأكيد التغيير
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
