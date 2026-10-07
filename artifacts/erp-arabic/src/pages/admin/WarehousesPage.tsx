import { useEffect, useState, useRef } from "react";
import {
  Warehouse, Plus, Pencil, Trash2, Package, AlertTriangle, Download,
  ChevronDown, ChevronUp, X, Settings, RefreshCw, Truck, Map, Power,
  BarChart3, TrendingDown, TrendingUp, Users, ArrowDownToLine, ArrowUpFromLine,
  Printer, ShoppingCart,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRememberedState } from "@/hooks/useRememberedState";
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png", iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png", shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png" });

function MapPicker({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onChange(e.latlng.lat, e.latlng.lng); } });
  return lat && lng ? <Marker position={[lat, lng]} /> : null;
}

interface WarehouseItem { id: number; warehouse_id: number; product_name: string; quantity: number; unit: string; min_stock: number; max_stock?: number; last_updated: string; notes?: string; active?: number; product_listed?: number | null; }
interface WarehouseRow { id: number; name: string; location?: string; manager_name?: string; capacity: number; notes?: string; items_count: number; total_stock: number; items?: WarehouseItem[]; lat?: number; lng?: number; active: number; warehouse_manager_user_id?: number; }
interface UserRow { id: number; name: string; phone: string; role: string; }
interface TrailerConfig { id: number; name: string; product_category: string; trailer_capacity: number; min_threshold: number; approved_qty: number; unit: string; active: number; }
interface DispatchOrder { id: number; warehouse_id: number; warehouse_name?: string; product_name: string; unit: string; quantity: number; price: number; payment_status: string; recipient_name?: string; status: string; created_at: string; }
interface SupplyRequest { id: number; warehouse_id: number; warehouse_name?: string; product_name: string; requested_qty: number; unit: string; status: string; priority: string; created_at: string; }

function exportWarehouseCSV(w: WarehouseRow) {
  if (!w.items) return;
  const csv = ["اسم الصنف,الكمية,الوحدة,الحد الأدنى,آخر تحديث",
    ...w.items.map(i => `${i.product_name},${i.quantity},${i.unit},${i.min_stock},${i.last_updated?.slice(0,10)}`)
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `warehouse-${w.name}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

function ItemModal({ wid, item, onClose, onSave }: {
  wid: number; item?: WarehouseItem; onClose: () => void; onSave: () => void;
}) {
  const [form, setForm] = useState({ product_name: item?.product_name || "", quantity: item?.quantity || 0, unit: item?.unit || "كيس", min_stock: item?.min_stock || 0, max_stock: item?.max_stock || 0, notes: item?.notes || "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const url = item ? `/api/warehouses/${wid}/items/${item.id}` : `/api/warehouses/${wid}/items`;
    await fetch(url, { method: item ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); onSave();
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-800">{item ? "تعديل صنف" : "إضافة صنف جديد"}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          {[["اسم الصنف","product_name","text"],["الكمية","quantity","number"],["الوحدة","unit","text"],["الحد الأدنى","min_stock","number"],["الحد الأقصى","max_stock","number"]].map(([lbl, key, type]) => (
            <div key={key}>
              <label className="text-sm font-medium text-gray-600 block mb-1">{lbl}</label>
              <input type={type} value={String(form[key as keyof typeof form])}
                onChange={e => setForm(f => ({ ...f, [key]: type === "number" ? parseFloat(e.target.value) || 0 : e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
            </div>
          ))}
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">إلغاء</button>
          <button onClick={save} disabled={saving || !form.product_name} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WarehouseModal({ warehouse, onClose, onSave }: { warehouse?: WarehouseRow; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    name: warehouse?.name || "", location: warehouse?.location || "",
    manager_name: warehouse?.manager_name || "", capacity: warehouse?.capacity || 0,
    notes: warehouse?.notes || "", lat: warehouse?.lat || "", lng: warehouse?.lng || "",
    warehouse_manager_user_id: warehouse?.warehouse_manager_user_id ? String(warehouse.warehouse_manager_user_id) : "",
  });
  const [users, setUsers] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  useEffect(() => { fetch("/api/users").then(r => r.json()).then(setUsers).catch(() => {}); }, []);

  const handleMapPick = async (lat: number, lng: number) => {
    setForm(f => ({ ...f, lat: String(lat.toFixed(6)), lng: String(lng.toFixed(6)) }));
    setGeocoding(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar`, { headers: { "User-Agent": "mkgh-erp/1.0" } });
      const data = await res.json();
      if (data?.display_name) setForm(f => ({ ...f, location: data.display_name }));
    } catch { }
    setGeocoding(false);
  };
  const save = async () => {
    setSaving(true);
    const url = warehouse ? `/api/warehouses/${warehouse.id}` : "/api/warehouses";
    await fetch(url, { method: warehouse ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); onSave();
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-gray-800">{warehouse ? "تعديل مستودع" : "إضافة مستودع جديد"}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
        <div className="grid grid-cols-2 gap-3">
          {[["اسم المستودع","name"],["المدير المسؤول","manager_name"]].map(([lbl, key]) => (
            <div key={key} className={key === "name" ? "col-span-2" : ""}>
              <label className="text-sm font-medium text-gray-600 block mb-1">{lbl}</label>
              <input value={String(form[key as keyof typeof form])} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          ))}
          <div className="col-span-2">
            <label className="text-sm font-medium text-gray-600 block mb-1 flex items-center gap-1.5">
              <Map size={13} className="text-blue-600" />العنوان
              {geocoding && <span className="text-xs text-blue-400 font-normal">جاري تحديد العنوان...</span>}
            </label>
            <textarea value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="انقر على الخريطة أو اكتب العنوان يدوياً" rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">الطاقة الاستيعابية</label>
            <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="col-span-2">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-sm font-medium text-gray-600">انقر على الخريطة لتحديد الموقع تلقائياً</span>
            </div>
            <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 220 }}>
              <MapContainer
                center={[form.lat ? Number(form.lat) : 24.7136, form.lng ? Number(form.lng) : 46.6753]}
                zoom={form.lat ? 13 : 6}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapPicker lat={Number(form.lat) || 0} lng={Number(form.lng) || 0} onChange={handleMapPick} />
              </MapContainer>
            </div>
            {form.lat && form.lng && (
              <a href={`https://www.google.com/maps?q=${form.lat},${form.lng}`} target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 hover:underline mt-1 block">📍 عرض على خرائط جوجل ←</a>
            )}
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-gray-600 block mb-1">المستخدم المسؤول عن المستودع</label>
            <select value={form.warehouse_manager_user_id}
              onChange={e => setForm(f => ({ ...f, warehouse_manager_user_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">— غير محدد —</option>
              {users.map(u => (
                <option key={u.id} value={String(u.id)}>{u.name} ({u.phone}) — {u.role}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-gray-600 block mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">إلغاء</button>
          <button onClick={save} disabled={saving || !form.name} className="flex-1 py-2 bg-[#103c68] text-white rounded-lg text-sm font-medium hover:bg-[#0d3158] disabled:opacity-50">
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Analytics Dashboard ────────────────────────────────────────────────────────
function AnalyticsDashboard({ warehouses, allItems }: { warehouses: WarehouseRow[]; allItems: WarehouseItem[] }) {
  const [dispatch, setDispatch] = useState<DispatchOrder[]>([]);
  const [supply, setSupply] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterWarehouse, setFilterWarehouse] = useRememberedState<string>("admin-warehouses-analytics-warehouse-filter", "all");
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/warehouse-dispatch-orders").then(r => r.json()),
      fetch("/api/supply-requests").then(r => r.json()),
    ]).then(([d, s]) => {
      setDispatch(Array.isArray(d) ? d : []);
      setSupply(Array.isArray(s) ? s : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const printReport = () => {
    const el = reportRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>تقرير المستودعات</title>
      <style>@page{size:A4 portrait;margin:15mm}html{width:210mm}body{width:210mm;margin:0 auto;padding:0}body{font-family:Arial,sans-serif;font-size:12px;direction:rtl;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 10px;text-align:right}th{background:#103c68;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}h2{color:#103c68}.kpi{display:inline-block;border:1px solid #ddd;border-radius:8px;padding:10px 16px;margin:4px;min-width:120px}@media print{button{display:none}}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close(); w.print();
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-[#103c68] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const filteredDispatch = filterWarehouse === "all" ? dispatch : dispatch.filter(d => String(d.warehouse_id) === filterWarehouse);
  const filteredSupply   = filterWarehouse === "all" ? supply   : supply.filter(s => String(s.warehouse_id) === filterWarehouse);
  const filteredItems    = filterWarehouse === "all" ? allItems  : allItems.filter(i => String(i.warehouse_id) === filterWarehouse);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalIn       = filteredSupply.filter(s => s.status === "delivered" || s.status === "received").reduce((acc, s) => acc + s.requested_qty, 0);
  const totalOut      = filteredDispatch.reduce((acc, d) => acc + d.quantity, 0);
  const totalRevenue  = filteredDispatch.reduce((acc, d) => acc + d.quantity * d.price, 0);
  const totalPaid     = filteredDispatch.filter(d => d.payment_status === "paid").reduce((acc, d) => acc + d.quantity * d.price, 0);
  const totalUnpaid   = totalRevenue - totalPaid;
  const totalStock    = filteredItems.reduce((acc, i) => acc + (i.quantity ?? 0), 0);
  const lowStockItems = filteredItems.filter(i => (i.quantity ?? 0) <= (i.min_stock ?? 0) && (i.min_stock ?? 0) > 0);

  // ── Per-product map ──────────────────────────────────────────────────────────
  const productMap: Record<string, { in: number; out: number; revenue: number; paid: number; unit: string; stock: number }> = {};
  filteredSupply.filter(s => s.status === "delivered" || s.status === "received").forEach(s => {
    if (!productMap[s.product_name]) productMap[s.product_name] = { in: 0, out: 0, revenue: 0, paid: 0, unit: s.unit, stock: 0 };
    productMap[s.product_name].in += s.requested_qty;
  });
  filteredDispatch.forEach(d => {
    if (!productMap[d.product_name]) productMap[d.product_name] = { in: 0, out: 0, revenue: 0, paid: 0, unit: d.unit, stock: 0 };
    productMap[d.product_name].out += d.quantity;
    productMap[d.product_name].revenue += d.quantity * d.price;
    if (d.payment_status === "paid") productMap[d.product_name].paid += d.quantity * d.price;
  });
  filteredItems.forEach(i => {
    if (!productMap[i.product_name]) productMap[i.product_name] = { in: 0, out: 0, revenue: 0, paid: 0, unit: i.unit, stock: 0 };
    productMap[i.product_name].stock = (i.quantity ?? 0);
  });
  const productRows = Object.entries(productMap).sort(([,a],[,b]) => b.out - a.out);

  // ── Per-rep map ─────────────────────────────────────────────────────────────
  const repMap: Record<string, { orders: number; qty: number; revenue: number; paid: number; products: Set<string> }> = {};
  filteredDispatch.forEach(d => {
    const key = d.recipient_name?.trim() || "غير محدد";
    if (!repMap[key]) repMap[key] = { orders: 0, qty: 0, revenue: 0, paid: 0, products: new Set() };
    repMap[key].orders++;
    repMap[key].qty += d.quantity;
    repMap[key].revenue += d.quantity * d.price;
    repMap[key].products.add(d.product_name);
    if (d.payment_status === "paid") repMap[key].paid += d.quantity * d.price;
  });
  const repRows = Object.entries(repMap).sort(([,a],[,b]) => b.revenue - a.revenue);

  // ── Per-warehouse map ────────────────────────────────────────────────────────
  const whMap: Record<string, { name: string; in: number; out: number; revenue: number; stock: number }> = {};
  warehouses.forEach(w => { whMap[String(w.id)] = { name: w.name, in: 0, out: 0, revenue: 0, stock: w.total_stock }; });
  supply.filter(s => s.status === "delivered" || s.status === "received").forEach(s => {
    const k = String(s.warehouse_id);
    if (whMap[k]) whMap[k].in += s.requested_qty;
  });
  dispatch.forEach(d => {
    const k = String(d.warehouse_id);
    if (whMap[k]) { whMap[k].out += d.quantity; whMap[k].revenue += d.quantity * d.price; }
  });
  const whRows = Object.entries(whMap).sort(([,a],[,b]) => b.revenue - a.revenue);

  const today = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });

  const kpis = [
    { label: "الوارد (مستلَم)", val: totalIn.toLocaleString("ar-SA"), icon: ArrowDownToLine, bg: "bg-blue-600",   sub: `${filteredSupply.length} طلب` },
    { label: "المنصرف",         val: totalOut.toLocaleString("ar-SA"), icon: ArrowUpFromLine, bg: "bg-red-500",    sub: `${filteredDispatch.length} أمر صرف` },
    { label: "الإيرادات",       val: totalRevenue.toLocaleString("ar-SA", { minimumFractionDigits: 2 }) + " ر.س", icon: TrendingUp, bg: "bg-emerald-600", sub: "إجمالي الصرف" },
    { label: "مُحصَّل",          val: totalPaid.toLocaleString("ar-SA", { minimumFractionDigits: 2 }) + " ر.س",    icon: ShoppingCart, bg: "bg-green-600",  sub: `${totalRevenue > 0 ? Math.round((totalPaid/totalRevenue)*100) : 0}% نسبة التحصيل` },
    { label: "غير مُحصَّل",      val: totalUnpaid.toLocaleString("ar-SA", { minimumFractionDigits: 2 }) + " ر.س",  icon: AlertTriangle, bg: "bg-orange-500", sub: "مستحقات متبقية" },
    { label: "المخزون الحالي",  val: totalStock.toLocaleString("ar-SA"), icon: Package,       bg: "bg-violet-600", sub: `${lowStockItems.length} منتج منخفض` },
  ];

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <select value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#103c68] outline-none">
            <option value="all">جميع المستودعات</option>
            {warehouses.map(w => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
          </select>
        </div>
        <button onClick={printReport}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#103c68] text-white rounded-xl text-sm font-semibold hover:bg-[#0d3158] shadow-sm">
          <Printer size={14} />طباعة التقرير
        </button>
      </div>

      {/* Printable area */}
      <div ref={reportRef} className="space-y-5">
        {/* Report header (print only visible) */}
        <div className="hidden print:block text-center pb-4 border-b mb-4">
          <h2 className="text-xl font-black text-[#103c68]">تقرير حركة المستودعات الشاملة</h2>
          <p className="text-xs text-gray-400 mt-1">تاريخ التقرير: {today} · {filterWarehouse === "all" ? "جميع المستودعات" : warehouses.find(w => String(w.id) === filterWarehouse)?.name}</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2">
              <div className={`w-9 h-9 rounded-xl ${k.bg} flex items-center justify-center flex-shrink-0`}>
                <k.icon size={18} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">{k.label}</p>
                <p className="text-lg font-black text-gray-800 leading-tight">{k.val}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Table 1: Per-product in/out/stock ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-[#103c68] flex items-center gap-2">
            <Package size={16} className="text-white" />
            <span className="font-bold text-white text-sm">حركة المخزون لكل منتج</span>
          </div>
          {productRows.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">لا توجد بيانات</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-3 text-right">المنتج</th>
                    <th className="px-4 py-3 text-center text-blue-600">الوارد</th>
                    <th className="px-4 py-3 text-center text-red-500">المنصرف</th>
                    <th className="px-4 py-3 text-center text-emerald-600">الإيرادات</th>
                    <th className="px-4 py-3 text-center text-green-600">مُحصَّل</th>
                    <th className="px-4 py-3 text-center text-orange-500">غير مُحصَّل</th>
                    <th className="px-4 py-3 text-center text-violet-600">المخزون الحالي</th>
                    <th className="px-4 py-3 text-center">الحركة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {productRows.map(([name, row], idx) => {
                    const total = row.in + row.stock;
                    const outPct = total > 0 ? Math.min(100, Math.round((row.out / total) * 100)) : 0;
                    const collPct = row.revenue > 0 ? Math.round((row.paid / row.revenue) * 100) : 0;
                    return (
                      <tr key={name} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                        <td className="px-4 py-3 font-semibold text-gray-800">{name}</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-700">
                          {row.in > 0 ? `${row.in.toLocaleString("ar-SA")} ${row.unit}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-red-600">
                          {row.out > 0 ? `${row.out.toLocaleString("ar-SA")} ${row.unit}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-emerald-700">
                          {row.revenue > 0 ? `${row.revenue.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-green-700">
                          {row.paid > 0 ? `${row.paid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-orange-600">
                          {(row.revenue - row.paid) > 0 ? `${(row.revenue - row.paid).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-bold text-violet-700">{row.stock.toLocaleString("ar-SA")} {row.unit}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 min-w-[80px]">
                            {/* out bar */}
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-red-400 rounded-full" style={{ width: `${outPct}%` }} />
                              </div>
                              <span className="text-[10px] text-gray-500 w-7">{outPct}%</span>
                            </div>
                            {/* collection bar */}
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${collPct >= 80 ? "bg-green-500" : collPct >= 50 ? "bg-yellow-400" : "bg-orange-400"}`}
                                  style={{ width: `${collPct}%` }} />
                              </div>
                              <span className="text-[10px] text-gray-500 w-7">{collPct}%</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#103c68]/5 font-black text-sm border-t-2 border-[#103c68]/20">
                    <td className="px-4 py-3 text-[#103c68]">الإجمالي</td>
                    <td className="px-4 py-3 text-center text-blue-800">{totalIn.toLocaleString("ar-SA")}</td>
                    <td className="px-4 py-3 text-center text-red-700">{totalOut.toLocaleString("ar-SA")}</td>
                    <td className="px-4 py-3 text-center text-emerald-800">{totalRevenue.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                    <td className="px-4 py-3 text-center text-green-800">{totalPaid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                    <td className="px-4 py-3 text-center text-orange-700">{totalUnpaid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                    <td className="px-4 py-3 text-center text-violet-800">{totalStock.toLocaleString("ar-SA")}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Table 2: Per-rep breakdown ── */}
        {repRows.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-violet-600 flex items-center gap-2">
              <Users size={16} className="text-white" />
              <span className="font-bold text-white text-sm">تفصيل المناديب والمستلمين</span>
              <span className="mr-auto text-violet-200 text-xs">{repRows.length} مستلم</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-3 text-right">#</th>
                    <th className="px-4 py-3 text-right">المستلم</th>
                    <th className="px-4 py-3 text-center">أوامر الصرف</th>
                    <th className="px-4 py-3 text-center">المنتجات</th>
                    <th className="px-4 py-3 text-center">إجمالي الإيرادات</th>
                    <th className="px-4 py-3 text-center">مُحصَّل</th>
                    <th className="px-4 py-3 text-center">غير مُحصَّل</th>
                    <th className="px-4 py-3 text-center">نسبة التحصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {repRows.map(([name, row], idx) => {
                    const collPct = row.revenue > 0 ? Math.round((row.paid / row.revenue) * 100) : 0;
                    return (
                      <tr key={name} className={idx % 2 === 0 ? "bg-white" : "bg-violet-50/20"}>
                        <td className="px-4 py-3 text-gray-400 text-xs font-bold">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-black text-xs flex-shrink-0">
                              {name.charAt(0)}
                            </div>
                            <span className="font-semibold text-gray-800">{name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 text-violet-700 font-black text-xs">{row.orders}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500 max-w-[180px]">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {Array.from(row.products).map(p => (
                              <span key={p} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{p}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-emerald-700 font-bold">{row.revenue.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                        <td className="px-4 py-3 text-center text-green-700">{row.paid.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                        <td className="px-4 py-3 text-center text-orange-600">{(row.revenue - row.paid).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${collPct >= 80 ? "bg-green-500" : collPct >= 50 ? "bg-yellow-400" : "bg-red-400"}`}
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

        {/* ── Table 3: Per-warehouse summary ── */}
        {filterWarehouse === "all" && whRows.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-[#103c68] flex items-center gap-2">
              <Warehouse size={16} className="text-white" />
              <span className="font-bold text-white text-sm">ملخص كل مستودع</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-3 text-right">المستودع</th>
                    <th className="px-4 py-3 text-center text-blue-600">الوارد</th>
                    <th className="px-4 py-3 text-center text-red-500">المنصرف</th>
                    <th className="px-4 py-3 text-center text-emerald-600">الإيرادات</th>
                    <th className="px-4 py-3 text-center text-violet-600">المخزون الحالي</th>
                    <th className="px-4 py-3 text-center">نسبة الصرف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {whRows.map(([wid, row], idx) => {
                    const total = row.in + row.stock;
                    const outPct = total > 0 ? Math.min(100, Math.round((row.out / total) * 100)) : 0;
                    return (
                      <tr key={wid} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                              <Warehouse size={14} className="text-blue-600" />
                            </div>
                            <span className="font-semibold text-gray-800">{row.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-blue-700">
                          {row.in > 0 ? row.in.toLocaleString("ar-SA") : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-red-600">
                          {row.out > 0 ? row.out.toLocaleString("ar-SA") : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-emerald-700 font-bold">
                          {row.revenue > 0 ? `${row.revenue.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-violet-700">{row.stock.toLocaleString("ar-SA")}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${outPct >= 70 ? "bg-red-400" : outPct >= 40 ? "bg-yellow-400" : "bg-blue-400"}`}
                                style={{ width: `${outPct}%` }} />
                            </div>
                            <span className="text-xs font-bold w-8 text-gray-600">{outPct}%</span>
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

        {/* ── Low stock alerts ── */}
        {lowStockItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-red-500 flex items-center gap-2">
              <AlertTriangle size={16} className="text-white" />
              <span className="font-bold text-white text-sm">تنبيهات نقص المخزون</span>
              <span className="mr-auto bg-red-400 text-white text-xs px-2 py-0.5 rounded-full">{lowStockItems.length} منتج</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-red-50 text-xs text-red-700">
                    <th className="px-4 py-3 text-right">المستودع</th>
                    <th className="px-4 py-3 text-right">المنتج</th>
                    <th className="px-4 py-3 text-center">المخزون الحالي</th>
                    <th className="px-4 py-3 text-center">الحد الأدنى</th>
                    <th className="px-4 py-3 text-center">النقص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {lowStockItems.map(item => {
                    const wh = warehouses.find(w => w.id === item.warehouse_id);
                    return (
                      <tr key={item.id} className="hover:bg-red-50/30">
                        <td className="px-4 py-3 text-xs text-gray-500">{wh?.name || "—"}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{item.product_name}</td>
                        <td className="px-4 py-3 text-center font-black text-red-600">{(item.quantity ?? 0).toLocaleString("ar-SA")} {item.unit}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{(item.min_stock ?? 0).toLocaleString("ar-SA")} {item.unit}</td>
                        <td className="px-4 py-3 text-center font-bold text-orange-600">
                          {Math.max(0, (item.min_stock ?? 0) - (item.quantity ?? 0)).toLocaleString("ar-SA")} {item.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [allItems, setAllItems] = useState<WarehouseItem[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editW, setEditW] = useState<WarehouseRow | "new" | null>(null);
  const [editItem, setEditItem] = useState<{ wid: number; item?: WarehouseItem } | null>(null);
  const [mainTab, setMainTab] = useRememberedState<"warehouses" | "analytics">("admin-warehouses-active-tab", "warehouses");

  const [autoRep, setAutoRep] = useState(false);
  const [autoInvoice, setAutoInvoice] = useState(false);
  const [trailerConfigs, setTrailerConfigs] = useState<TrailerConfig[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [editTrailer, setEditTrailer] = useState<TrailerConfig | "new" | null>(null);
  const [trailerForm, setTrailerForm] = useState({ name: "", product_category: "", trailer_capacity: 0, min_threshold: 0, approved_qty: 0, unit: "كيس" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<{ id: number; name: string; unit: string; active: number }[]>([]);
  const [productSearch, setProductSearch] = useRememberedState("admin-warehouses-product-search", "");
  const [productDropOpen, setProductDropOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [d, cfgs, settings, prods] = await Promise.all([
      fetch("/api/warehouses").then(r => r.json()),
      fetch("/api/trailer-configs").then(r => r.json()),
      fetch("/api/invoice-settings").then(r => r.json()),
      fetch("/api/products/all").then(r => r.json()),
    ]);
    const ws: WarehouseRow[] = Array.isArray(d) ? d : [];
    setWarehouses(ws);
    setTrailerConfigs(Array.isArray(cfgs) ? cfgs : []);
    setAutoRep(settings?.auto_replenishment === 1);
    setAutoInvoice(settings?.auto_invoice_enabled === 1);
    setCatalogProducts(Array.isArray(prods) ? prods : []);
    setLoading(false);

    // Load all items for analytics
    const itemsArr: WarehouseItem[] = [];
    await Promise.all(ws.map(async w => {
      try {
        const r = await fetch(`/api/warehouses/${w.id}`);
        const data = await r.json();
        if (Array.isArray(data.items)) itemsArr.push(...data.items);
      } catch { }
    }));
    setAllItems(itemsArr);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    await fetch("/api/invoice-settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_replenishment: autoRep, auto_invoice_enabled: autoInvoice }),
    });
    setSavingSettings(false);
  };

  const saveTrailer = async () => {
    const url = editTrailer && editTrailer !== "new" ? `/api/trailer-configs/${editTrailer.id}` : "/api/trailer-configs";
    await fetch(url, { method: editTrailer && editTrailer !== "new" ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(trailerForm) });
    setEditTrailer(null);
    load();
  };

  const loadItems = async (wid: number) => {
    const r = await fetch(`/api/warehouses/${wid}`); const data = await r.json();
    setWarehouses(ws => ws.map(w => w.id === wid ? { ...w, items: data.items } : w));
  };

  const toggleExpand = async (wid: number) => {
    if (expanded === wid) { setExpanded(null); return; }
    setExpanded(wid);
    const w = warehouses.find(x => x.id === wid);
    if (!w?.items) await loadItems(wid);
  };

  const deleteWarehouse = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستودع؟")) return;
    await fetch(`/api/warehouses/${id}`, { method: "DELETE" }); load();
  };
  const deleteItem = async (wid: number, iid: number) => {
    await fetch(`/api/warehouses/${wid}/items/${iid}`, { method: "DELETE" }); loadItems(wid);
  };
  const toggleItem = async (wid: number, iid: number) => {
    await fetch(`/api/warehouses/${wid}/items/${iid}/toggle`, { method: "PATCH" });
    loadItems(wid);
  };

  useEffect(() => { load(); }, []);

  const totalStock = warehouses.reduce((s, w) => s + (w.total_stock || 0), 0);
  const totalItems = warehouses.reduce((s, w) => s + (w.items_count || 0), 0);

  return (
    <div className="space-y-6" dir="rtl">
      {editW && (
        <WarehouseModal
          warehouse={editW === "new" ? undefined : editW}
          onClose={() => setEditW(null)}
          onSave={() => { setEditW(null); load(); }}
        />
      )}
      {editItem && (
        <ItemModal
          wid={editItem.wid} item={editItem.item}
          onClose={() => setEditItem(null)}
          onSave={() => { setEditItem(null); loadItems(editItem.wid); }}
        />
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة المستودعات</h1>
          <p className="text-sm text-gray-500">{warehouses.length} مستودع · {totalItems} صنف · إجمالي المخزون: {totalStock.toLocaleString("ar-SA")}</p>
        </div>
        <div className="flex gap-2">
          {mainTab === "warehouses" && (
            <>
              <button onClick={() => setShowSettings(s => !s)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${showSettings ? "bg-[#103c68] text-white border-[#103c68]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                <Settings size={16} />الإعدادات
              </button>
              <button onClick={() => setEditW("new")} className="flex items-center gap-2 px-4 py-2 bg-[#103c68] text-white rounded-xl text-sm font-medium hover:bg-[#0d3158] shadow-sm">
                <Plus size={16} />مستودع جديد
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { id: "warehouses", label: "المستودعات", icon: Warehouse },
          { id: "analytics",  label: "الداشبورد التحليلي", icon: BarChart3 },
        ] as { id: "warehouses" | "analytics"; label: string; icon: typeof Warehouse }[]).map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mainTab === t.id ? "bg-white text-[#103c68] shadow-sm font-bold" : "text-gray-500 hover:text-gray-700"
            }`}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {/* ── Analytics Tab ── */}
      {mainTab === "analytics" && (
        <AnalyticsDashboard warehouses={warehouses} allItems={allItems} />
      )}

      {/* ── Warehouses Tab ── */}
      {mainTab === "warehouses" && (
        <>
          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
              <h2 className="font-bold text-gray-800 flex items-center gap-2"><Settings size={18} className="text-[#103c68]" />إعدادات التوريد والفواتير</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "الطلب التلقائي", desc: "إرسال طلب توريد تلقائياً عند انخفاض المخزون", val: autoRep, set: setAutoRep },
                  { label: "الفوترة التلقائية", desc: "إصدار الفاتورة تلقائياً عند تعيين السيارة", val: autoInvoice, set: setAutoInvoice },
                ].map(({ label, desc, val, set }) => (
                  <div key={label} className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${val ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
                    <div>
                      <div className={`font-bold text-sm ${val ? "text-green-800" : "text-gray-700"}`}>{label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                    </div>
                    <div className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors flex-shrink-0 ${val ? "bg-green-500" : "bg-gray-300"}`}
                      onClick={() => set(v => !v)}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${val ? "right-0.5" : "left-0.5"}`} />
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={saveSettings} disabled={savingSettings}
                className="px-4 py-2 bg-[#103c68] text-white rounded-xl text-sm font-medium hover:bg-[#0d3158] disabled:opacity-50 flex items-center gap-2">
                {savingSettings ? <><RefreshCw size={13} className="animate-spin" />جاري الحفظ...</> : "حفظ الإعدادات"}
              </button>

              {/* Trailer Load Configs */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-700 flex items-center gap-2"><Truck size={16} className="text-[#103c68]" />تكوينات حمولة الشاحنات</h3>
                  <button onClick={() => { setEditTrailer("new"); setTrailerForm({ name: "", product_category: "", trailer_capacity: 0, min_threshold: 0, approved_qty: 0, unit: "كيس" }); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#103c68] text-white rounded-xl text-xs hover:bg-[#0d3158]">
                    <Plus size={12} />إضافة تكوين
                  </button>
                </div>
                {editTrailer && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                      <div className="relative">
                        <label className="text-xs text-gray-600 block mb-1">فئة المنتج</label>
                        <input type="text"
                          value={productDropOpen ? productSearch : trailerForm.product_category}
                          placeholder="ابحث عن منتج..."
                          onFocus={() => { setProductDropOpen(true); setProductSearch(""); }}
                          onBlur={() => setTimeout(() => setProductDropOpen(false), 150)}
                          onChange={e => setProductSearch(e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                        />
                        {productDropOpen && (
                          <div className="absolute z-50 right-0 left-0 top-full mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-xs">
                            {catalogProducts.filter(p => p.name.includes(productSearch)).map(p => (
                              <button key={p.id} type="button"
                                onMouseDown={() => { setTrailerForm(f => ({ ...f, product_category: p.name, name: p.name, unit: p.unit ?? f.unit })); setProductDropOpen(false); setProductSearch(""); }}
                                className="w-full text-right px-3 py-2 hover:bg-blue-50 flex items-center gap-2">
                                <span>{p.name}</span>
                                {p.active === 0 && <span className="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">مغلق</span>}
                              </button>
                            ))}
                            {catalogProducts.filter(p => p.name.includes(productSearch)).length === 0 && (
                              <p className="px-3 py-2 text-gray-400">لا توجد نتائج</p>
                            )}
                          </div>
                        )}
                      </div>
                      {([["الحمولة/شاحنة","trailer_capacity","number"],["أقل كمية للطلب","min_threshold","number"],["كمية التوريد المعتمدة","approved_qty","number"],["الوحدة","unit","text"]] as [string,string,string][]).map(([lbl, key, type]) => (
                        <div key={key}>
                          <label className="text-xs text-gray-600 block mb-1">{lbl}</label>
                          <input type={type} value={String(trailerForm[key as keyof typeof trailerForm])}
                            onChange={e => setTrailerForm(f => ({ ...f, [key]: type === "number" ? parseFloat(e.target.value) || 0 : e.target.value }))}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveTrailer} className="px-3 py-1.5 bg-[#103c68] text-white rounded-lg text-xs hover:bg-[#0d3158]">حفظ</button>
                      <button onClick={() => setEditTrailer(null)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">إلغاء</button>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 rounded-xl">
                      <tr>
                        {["الاسم","فئة المنتج","الحمولة/شاحنة","أقل كمية للطلب","كمية التوريد المعتمدة","الوحدة",""].map(h => (
                          <th key={h} className="px-3 py-2 text-right text-xs font-semibold text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {trailerConfigs.filter(c => c.active !== 0).map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{c.name}</td>
                          <td className="px-3 py-2 text-gray-600">{c.product_category}</td>
                          <td className="px-3 py-2 font-bold text-[#103c68]">{c.trailer_capacity.toLocaleString("ar-SA")}</td>
                          <td className="px-3 py-2 text-gray-500">{c.min_threshold.toLocaleString("ar-SA")}</td>
                          <td className="px-3 py-2 font-semibold text-emerald-700">{c.approved_qty > 0 ? c.approved_qty.toLocaleString("ar-SA") : <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-gray-500">{c.unit}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button onClick={() => { setEditTrailer(c); setTrailerForm({ name: c.name, product_category: c.product_category, trailer_capacity: c.trailer_capacity, min_threshold: c.min_threshold, approved_qty: c.approved_qty || 0, unit: c.unit }); }}
                                className="p-1 hover:bg-gray-100 rounded"><Pencil size={12} className="text-gray-400" /></button>
                              <button onClick={async () => { await fetch(`/api/trailer-configs/${c.id}`, { method: "DELETE" }); load(); }}
                                className="p-1 hover:bg-red-50 rounded"><Trash2 size={12} className="text-red-400" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {trailerConfigs.length === 0 && (
                    <div className="text-center py-6 text-gray-400 text-sm">لا توجد تكوينات — أضف تكويناً أعلاه</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Warehouses list */}
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {warehouses.map(w => {
                const isExpanded = expanded === w.id;
                const items = w.items || [];
                const lowStock = items.filter(i => i.quantity <= i.min_stock);
                return (
                  <div key={w.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-4 p-5 cursor-pointer" onClick={() => toggleExpand(w.id)}>
                      <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Warehouse size={22} className="text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-800">{w.name}</h3>
                          {lowStock.length > 0 && (
                            <span className="flex items-center gap-1 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                              <AlertTriangle size={11} />{lowStock.length} مخزون منخفض
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                          {w.location && <span>📍 {w.location}</span>}
                          {w.manager_name && <span>👤 {w.manager_name}</span>}
                          <span>📦 {w.items_count} صنف</span>
                          <span>📊 {(w.total_stock || 0).toLocaleString("ar-SA")} وحدة</span>
                          {w.capacity > 0 && (
                            <span className={(w.total_stock / w.capacity > 0.8) ? "text-red-500" : "text-green-500"}>
                              🏭 {Math.round((w.total_stock / w.capacity) * 100)}% مُشغَّل
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={e => { e.stopPropagation(); setEditW(w); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                          <Pencil size={15} className="text-gray-400" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteWarehouse(w.id); }} className="p-2 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={15} className="text-red-400" />
                        </button>
                        {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                      </div>
                    </div>
                    {w.capacity > 0 && (
                      <div className="px-5 pb-3">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${w.total_stock / w.capacity > 0.8 ? "bg-red-400" : "bg-blue-500"}`}
                            style={{ width: `${Math.min(100, Math.round((w.total_stock / w.capacity) * 100))}%` }} />
                        </div>
                      </div>
                    )}
                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
                          <span className="text-sm font-medium text-gray-600">المخزون ({items.length} صنف)</span>
                          <div className="flex gap-2">
                            <button onClick={() => exportWarehouseCSV({ ...w, items })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 bg-white rounded-lg hover:bg-gray-50">
                              <Download size={13} />تصدير
                            </button>
                            <button onClick={() => setEditItem({ wid: w.id })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                              <Plus size={13} />إضافة صنف
                            </button>
                          </div>
                        </div>
                        {items.length === 0 ? (
                          <div className="text-center py-8 text-gray-400 text-sm">لا توجد أصناف. أضف صنفاً أو استورد من CSV.</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50/60">
                                <tr>
                                  {["الصنف","الكمية","الوحدة","الحد الأدنى","الحالة","آخر تحديث",""].map(h => (
                                    <th key={h} className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {items.map(item => {
                                  const isActive = item.active !== 0;
                                  const low = isActive && item.quantity <= item.min_stock;
                                  return (
                                    <tr key={item.id} className={`hover:bg-gray-50 transition-opacity ${!isActive ? "opacity-40" : low ? "bg-red-50/30" : ""}`}>
                                      <td className="px-4 py-2.5 font-medium text-gray-800">
                                        <div className="flex items-center gap-2">
                                          <span className={!isActive ? "line-through text-gray-400" : ""}>{item.product_name}</span>
                                          {item.product_listed === 1 && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium">معروض</span>
                                          )}
                                          {item.product_listed === 0 && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200 font-medium">مخفي</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className={`px-4 py-2.5 font-bold ${low ? "text-red-600" : "text-gray-700"}`}>{item.quantity.toLocaleString("ar-SA")}</td>
                                      <td className="px-4 py-2.5 text-gray-500">{item.unit}</td>
                                      <td className="px-4 py-2.5 text-gray-500">{item.min_stock}</td>
                                      <td className="px-4 py-2.5">
                                        {!isActive ? (
                                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-400">موقوف</span>
                                        ) : (
                                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${low ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                                            {low ? "⚠ منخفض" : "✓ طبيعي"}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-gray-400 text-xs">{item.last_updated?.slice(0,10)}</td>
                                      <td className="px-4 py-2.5">
                                        <div className="flex gap-1">
                                          <button onClick={() => toggleItem(w.id, item.id)}
                                            title={isActive ? "إيقاف الصنف" : "تفعيل الصنف"}
                                            className={`p-1.5 rounded-lg transition-colors ${isActive ? "hover:bg-orange-50" : "hover:bg-green-50"}`}>
                                            <Power size={13} className={isActive ? "text-orange-400" : "text-green-500"} />
                                          </button>
                                          <button onClick={() => setEditItem({ wid: w.id, item })} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil size={13} className="text-gray-400" /></button>
                                          <button onClick={() => deleteItem(w.id, item.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={13} className="text-red-400" /></button>
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
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
