import { useEffect, useState, useRef } from "react";
import { Warehouse, Plus, Pencil, Trash2, Package, AlertTriangle, Download, Upload, ChevronDown, ChevronUp, X } from "lucide-react";

interface WarehouseItem { id: number; warehouse_id: number; product_name: string; quantity: number; unit: string; min_stock: number; last_updated: string; notes?: string; }
interface WarehouseRow { id: number; name: string; location?: string; manager_name?: string; capacity: number; notes?: string; items_count: number; total_stock: number; items?: WarehouseItem[]; }

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
  const [form, setForm] = useState({ product_name: item?.product_name || "", quantity: item?.quantity || 0, unit: item?.unit || "كيس", min_stock: item?.min_stock || 0, notes: item?.notes || "" });
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
          {[["اسم الصنف","product_name","text"],["الكمية","quantity","number"],["الوحدة","unit","text"],["الحد الأدنى","min_stock","number"]].map(([lbl, key, type]) => (
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
  const [form, setForm] = useState({ name: warehouse?.name || "", location: warehouse?.location || "", manager_name: warehouse?.manager_name || "", capacity: warehouse?.capacity || 0, notes: warehouse?.notes || "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const url = warehouse ? `/api/warehouses/${warehouse.id}` : "/api/warehouses";
    await fetch(url, { method: warehouse ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); onSave();
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-800">{warehouse ? "تعديل مستودع" : "إضافة مستودع جديد"}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[["اسم المستودع","name"],["الموقع","location"],["المدير المسؤول","manager_name"]].map(([lbl, key]) => (
            <div key={key} className={key === "name" ? "col-span-2" : ""}>
              <label className="text-sm font-medium text-gray-600 block mb-1">{lbl}</label>
              <input value={String(form[key as keyof typeof form])} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          ))}
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">الطاقة الاستيعابية</label>
            <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-gray-600 block mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">إلغاء</button>
          <button onClick={save} disabled={saving || !form.name} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editW, setEditW] = useState<WarehouseRow | "new" | null>(null);
  const [editItem, setEditItem] = useState<{ wid: number; item?: WarehouseItem } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/warehouses"); const d = await r.json();
    setWarehouses(d); setLoading(false);
  };

  const loadItems = async (wid: number) => {
    const r = await fetch(`/api/warehouses/${wid}`); const d = await r.json();
    setWarehouses(ws => ws.map(w => w.id === wid ? { ...w, items: d.items } : w));
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

  const importCSV = (wid: number, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.trim().split("\n").slice(1);
      const rows = lines.map(l => { const [product_name, quantity, unit, min_stock] = l.split(","); return { product_name: product_name?.trim(), quantity: parseFloat(quantity) || 0, unit: unit?.trim() || "وحدة", min_stock: parseFloat(min_stock) || 0 }; }).filter(r => r.product_name);
      await fetch(`/api/warehouses/${wid}/items/bulk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      loadItems(wid);
    };
    reader.readAsText(file);
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
      <input ref={fileRef} type="file" accept=".csv" className="hidden"
        onChange={e => { if (e.target.files?.[0] && expanded) { importCSV(expanded, e.target.files[0]); e.target.value = ""; } }} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة المستودعات</h1>
          <p className="text-sm text-gray-500">{warehouses.length} مستودع · {totalItems} صنف · إجمالي المخزون: {totalStock.toLocaleString("ar-SA")}</p>
        </div>
        <button onClick={() => setEditW("new")} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm">
          <Plus size={16} />مستودع جديد
        </button>
      </div>

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
                {/* Warehouse header */}
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

                {/* Capacity bar */}
                {w.capacity > 0 && (
                  <div className="px-5 pb-3">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${w.total_stock / w.capacity > 0.8 ? "bg-red-400" : "bg-blue-500"}`}
                        style={{ width: `${Math.min(100, Math.round((w.total_stock / w.capacity) * 100))}%` }} />
                    </div>
                  </div>
                )}

                {/* Items */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
                      <span className="text-sm font-medium text-gray-600">المخزون ({items.length} صنف)</span>
                      <div className="flex gap-2">
                        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 bg-white rounded-lg hover:bg-gray-50">
                          <Upload size={13} />استيراد CSV
                        </button>
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
                              const low = item.quantity <= item.min_stock;
                              return (
                                <tr key={item.id} className={`hover:bg-gray-50 ${low ? "bg-red-50/30" : ""}`}>
                                  <td className="px-4 py-2.5 font-medium text-gray-800">{item.product_name}</td>
                                  <td className={`px-4 py-2.5 font-bold ${low ? "text-red-600" : "text-gray-700"}`}>{item.quantity.toLocaleString("ar-SA")}</td>
                                  <td className="px-4 py-2.5 text-gray-500">{item.unit}</td>
                                  <td className="px-4 py-2.5 text-gray-500">{item.min_stock}</td>
                                  <td className="px-4 py-2.5">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${low ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                                      {low ? "⚠ منخفض" : "✓ طبيعي"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-400 text-xs">{item.last_updated?.slice(0,10)}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex gap-1">
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
    </div>
  );
}
