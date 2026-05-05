import { useEffect, useRef, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  FileText, Package, Truck, CheckCircle, Clock, AlertTriangle,
  RefreshCw, X, Upload, BarChart3, Warehouse, ArrowUpDown,
  TrendingDown, Search, Eye, ChevronDown,
} from "lucide-react";

interface Order {
  id: number; order_number: string; customer_name: string; customer_phone: string;
  product_name: string; quantity: number; unit: string;
  unit_price: number; total_before_vat: number; vat_amount: number; total_with_vat: number;
  delivery_location: string; destination_type: string; stage: string;
  vehicle_plate: string; driver_name: string; driver_phone: string;
  invoice_number: string; invoice_image_url: string; invoice_date: string;
  loading_photo_url: string; loading_date: string;
  delivery_date: string; created_at: string;
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
  const [orders,     setOrders]     = useState<Order[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([]);
  const [items,      setItems]      = useState<WarehouseItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<"dashboard"|"pending"|"history"|"inventory">("dashboard");

  const [selectedOrder, setSelectedOrder]   = useState<Order | null>(null);
  const [invoiceNum,    setInvoiceNum]       = useState("");
  const [submitting,    setSubmitting]       = useState(false);
  const [searchHistory, setSearchHistory]   = useState("");
  const [expandedWh,    setExpandedWh]       = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/workflow/orders?role=warehouse").then(r => r.json()),
      fetch("/api/warehouses").then(r => r.json()),
    ]).then(([o, w]) => {
      setOrders(Array.isArray(o) ? o : []);
      setWarehouses(Array.isArray(w) ? w : []);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const loadWarehouseItems = async (whId: number) => {
    if (expandedWh === whId) { setExpandedWh(null); return; }
    const data = await fetch(`/api/warehouses/${whId}/items`).then(r => r.json());
    setItems(data);
    setExpandedWh(whId);
  };

  const issueInvoice = async () => {
    if (!selectedOrder || !user) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("warehouse_phone", user.phone);
      fd.append("invoice_number", invoiceNum || `INV-${selectedOrder.order_number}`);
      if (fileRef.current?.files?.[0]) fd.append("invoice_image", fileRef.current.files[0]);
      const res = await fetch(`/api/workflow/orders/${selectedOrder.id}/invoice`, { method: "PUT", body: fd });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedOrder(null); setInvoiceNum("");
      load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
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
      <div className="flex gap-1.5 flex-wrap bg-gray-100 p-1.5 rounded-2xl w-fit">
        {([
          { id: "dashboard", label: "الرئيسية",    icon: BarChart3 },
          { id: "pending",   label: "انتظار الفاتورة", icon: Clock, count: pending.length },
          { id: "history",   label: "السجل",         icon: FileText, count: history.length },
          { id: "inventory", label: "المخزون",        icon: Package },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon size={14} />{t.label}
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
          {/* KPI grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "بانتظار الفاتورة", val: pending.length,   icon: Clock,         color: "bg-amber-500",  alert: pending.length > 0 },
              { label: "فواتير صادرة",      val: history.filter(o => o.stage === "invoiced").length, icon: FileText, color: "bg-purple-500", alert: false },
              { label: "في الطريق",          val: orders.filter(o => o.stage === "loaded").length, icon: Truck, color: "bg-cyan-500", alert: false },
              { label: "تم التسليم",          val: delivered.length, icon: CheckCircle, color: "bg-green-500", alert: false },
            ].map(({ label, val, icon: Icon, color, alert }) => (
              <div key={label} className={`bg-white rounded-2xl border shadow-sm p-5 flex items-start gap-3 ${alert && val > 0 ? "border-amber-200" : "border-gray-100"}`}>
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

          {/* Revenue banner */}
          <div className="bg-gradient-to-l from-[#103c68] to-[#1a5899] rounded-2xl p-6 text-white flex items-center justify-between">
            <div>
              <div className="text-sm opacity-70">إجمالي المبيعات المسلّمة (شامل الضريبة)</div>
              <div className="text-4xl font-black mt-1">{revenue.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س</div>
              <div className="text-xs opacity-50 mt-1">من {delivered.length} طلب مسلّم</div>
            </div>
            <BarChart3 size={60} className="opacity-10" />
          </div>

          {/* Pending alert */}
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

          {/* Recent activity */}
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

      {/* ══════════════════════════════ PENDING INVOICES TAB ══════════════════════════════ */}
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
                  <div className="font-mono text-xs text-[#103c68] font-bold mb-0.5">{order.order_number}</div>
                  <div className="font-black text-gray-900 text-lg">{order.customer_name}</div>
                  <div className="text-sm text-gray-500">{order.product_name}</div>
                </div>
                <div className="text-left">
                  <div className="font-black text-2xl text-gray-900">{order.total_with_vat?.toFixed(2)}</div>
                  <div className="text-xs text-gray-400">ريال سعودي شامل الضريبة</div>
                </div>
              </div>

              {/* Price breakdown */}
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

              <div className="flex items-center gap-3 text-xs text-gray-400 mb-4 flex-wrap">
                <span>📍 {order.delivery_location}</span>
                <span>🚗 {order.vehicle_plate || "—"}</span>
                {order.driver_name && <span>👤 {order.driver_name}</span>}
              </div>

              <button
                onClick={() => { setSelectedOrder(order); setInvoiceNum(`INV-${order.order_number}`); }}
                className="w-full flex items-center justify-center gap-2 bg-[#103c68] hover:bg-[#0d3158] text-white py-3 rounded-xl font-bold text-sm transition-colors">
                <FileText size={15} />إصدار الفاتورة
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════ HISTORY TAB ══════════════════════════════ */}
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
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">
              لا توجد نتائج
            </div>
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

      {/* ══════════════════════════════ INVENTORY TAB ══════════════════════════════ */}
      {tab === "inventory" && (
        <div className="space-y-4">
          {warehouses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">لا توجد مستودعات</div>
          ) : warehouses.map(wh => (
            <div key={wh.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Warehouse header */}
              <button
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-right"
                onClick={() => loadWarehouseItems(wh.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#103c68]/10 flex items-center justify-center flex-shrink-0">
                    <Warehouse size={18} className="text-[#103c68]" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{wh.name}</div>
                    <div className="text-xs text-gray-400">{wh.location}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-left hidden sm:block">
                    <div className="text-xs text-gray-400">المخزون الإجمالي</div>
                    <div className="font-bold text-[#103c68]">{wh.total_stock?.toLocaleString("ar-SA")} وحدة</div>
                  </div>
                  <div className="text-left hidden sm:block">
                    <div className="text-xs text-gray-400">الطاقة الاستيعابية</div>
                    <div className="font-bold text-gray-600">{wh.capacity?.toLocaleString("ar-SA")}</div>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`text-gray-400 transition-transform ${expandedWh === wh.id ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {/* Progress bar */}
              {wh.capacity > 0 && (
                <div className="px-5 pb-3">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>نسبة الامتلاء</span>
                    <span>{Math.min(100, Math.round((wh.total_stock / wh.capacity) * 100))}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#103c68] rounded-full transition-all"
                      style={{ width: `${Math.min(100, (wh.total_stock / wh.capacity) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Items list */}
              {expandedWh === wh.id && (
                <div className="border-t border-gray-100">
                  {items.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">لا توجد أصناف في هذا المستودع</div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      <div className="grid grid-cols-4 px-5 py-2.5 bg-gray-50 text-xs font-bold text-gray-500">
                        <span className="col-span-2">الصنف</span>
                        <span className="text-center">الكمية</span>
                        <span className="text-center">الحد الأدنى</span>
                      </div>
                      {items.map(item => {
                        const low = item.quantity <= item.min_stock;
                        return (
                          <div key={item.id} className={`grid grid-cols-4 px-5 py-3 items-center text-sm ${low ? "bg-red-50/50" : ""}`}>
                            <div className="col-span-2 flex items-center gap-2">
                              {low && <TrendingDown size={14} className="text-red-500 flex-shrink-0" />}
                              <div>
                                <div className={`font-semibold ${low ? "text-red-700" : "text-gray-800"}`}>{item.product_name}</div>
                                <div className="text-xs text-gray-400">{item.unit}</div>
                              </div>
                            </div>
                            <div className={`text-center font-black text-base ${low ? "text-red-600" : "text-[#103c68]"}`}>
                              {item.quantity.toLocaleString("ar-SA")}
                            </div>
                            <div className="text-center text-gray-400 text-sm">{item.min_stock.toLocaleString("ar-SA")}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Low stock alerts */}
          {items.filter(i => i.quantity <= i.min_stock).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 font-bold text-red-700 mb-2">
                <AlertTriangle size={16} />{items.filter(i => i.quantity <= i.min_stock).length} صنف تحت الحد الأدنى
              </div>
              {items.filter(i => i.quantity <= i.min_stock).map(i => (
                <div key={i.id} className="text-sm text-red-600 flex items-center justify-between py-1">
                  <span>{i.product_name}</span>
                  <span className="font-bold">{i.quantity} / {i.min_stock} (الحد الأدنى)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════ INVOICE MODAL ══════════════════════════════ */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="font-black text-gray-900 text-lg">إصدار فاتورة</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedOrder.order_number}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Order summary */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">العميل</span>
                  <span className="font-semibold text-gray-800">{selectedOrder.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">المنتج</span>
                  <span className="font-semibold text-gray-800">{selectedOrder.product_name} × {selectedOrder.quantity} {selectedOrder.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">قبل الضريبة</span>
                  <span className="font-semibold">{selectedOrder.total_before_vat?.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">الضريبة 15%</span>
                  <span className="font-semibold">{selectedOrder.vat_amount?.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between text-base font-black border-t border-gray-200 pt-2">
                  <span>الإجمالي</span>
                  <span className="text-[#103c68]">{selectedOrder.total_with_vat?.toFixed(2)} ر.س</span>
                </div>
              </div>

              {/* Invoice number */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">رقم الفاتورة</label>
                <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/20" />
              </div>

              {/* File upload */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">رفع صورة الفاتورة (اختياري)</label>
                <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 hover:border-[#103c68]/40 rounded-xl p-3 transition-colors">
                  <Upload size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-500">{fileRef.current?.files?.[0]?.name || "اختر صورة أو PDF..."}</span>
                  <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" />
                </label>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setSelectedOrder(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  إلغاء
                </button>
                <button onClick={issueInvoice} disabled={submitting}
                  className="flex-1 py-3 bg-[#103c68] hover:bg-[#0d3158] text-white rounded-xl font-black text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {submitting ? <><RefreshCw size={14} className="animate-spin" />جاري...</> : <><FileText size={14} />إصدار الفاتورة</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
