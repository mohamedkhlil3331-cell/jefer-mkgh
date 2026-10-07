import { useState, useEffect } from "react";
import { Truck, Plus, Trash2, Edit2, Save, X, Package, CheckCircle, Moon } from "lucide-react";

type VehicleDef = {
  id: number; name: string; icon: string; description: string;
  max_load_bags: number; cargo_types: string; sort_order: number;
  is_custom: number; is_active: number; overnight_rate: number;
};
type CargoRule = {
  id: number; cargo_type: string; cargo_label: string;
  min_qty: number; max_qty: number; vehicle_type_id: number;
  vehicle_type_name: string; vehicle_icon: string; notes: string;
};
type Product = { id: number; name: string; unit: string; category: string; active: number };

const CARGO_TYPES = [
  { key: "cement_packed", label: "أسمنت معبأ (كيس)" },
  { key: "cement_loose",  label: "أسمنت سائب" },
  { key: "blocks",        label: "بلوك" },
  { key: "tiles",         label: "بلاط وأرضيات" },
  { key: "other",         label: "أخرى" },
];

type CargoItem = { key: string; label: string; min: number; max: number };

function parseCargo(raw: string): CargoItem[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr.map((item: string | { key: string; label?: string; min?: number; max?: number }) =>
      typeof item === "string"
        ? { key: item, label: CARGO_TYPES.find(x => x.key === item)?.label || item, min: 0, max: 0 }
        : { key: item.key, label: item.label || CARGO_TYPES.find(x => x.key === item.key)?.label || item.key, min: Number(item.min) || 0, max: Number(item.max) || 0 }
    );
  } catch { return []; }
}

export default function VehicleTypeDefsPage() {
  const [types, setTypes]         = useState<VehicleDef[]>([]);
  const [rules, setRules]         = useState<CargoRule[]>([]);
  const [products, setProducts]   = useState<Product[]>([]);
  const [editType, setEditType]   = useState<Partial<VehicleDef> | null>(null);
  const [showAddRule, setShowAddRule] = useState(false);
  const [editRule, setEditRule]   = useState<CargoRule | null>(null);
  const [saving, setSaving]       = useState(false);

  const loadAll = () => {
    fetch("/api/vehicle-type-defs").then(r => r.json()).then(setTypes).catch(() => {});
    fetch("/api/cargo-routing-rules").then(r => r.json()).then(setRules).catch(() => {});
    fetch("/api/products").then(r => r.json()).then((d: Product[]) => setProducts(d.filter(p => p.active))).catch(() => {});
  };
  useEffect(() => { loadAll(); }, []);

  const deleteType = async (id: number) => {
    if (!confirm("حذف نوع السيارة؟")) return;
    await fetch(`/api/vehicle-type-defs/${id}`, { method: "DELETE" });
    loadAll();
  };

  const deleteRule = async (id: number) => {
    if (!confirm("حذف القاعدة؟")) return;
    await fetch(`/api/cargo-routing-rules/${id}`, { method: "DELETE" });
    loadAll();
  };

  const saveType = async () => {
    if (!editType?.name?.trim()) return;
    setSaving(true);
    try {
      const isNew = !editType.id;
      await fetch(isNew ? "/api/vehicle-type-defs" : `/api/vehicle-type-defs/${editType.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editType),
      });
      setEditType(null);
      loadAll();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-gray-900">أنواع السيارات وقواعد التحميل</h1>
        <p className="text-sm text-gray-400 mt-1">تعريف أنواع السيارات وتحديد أي شحنة تناسب كل نوع</p>
      </div>

      {/* Vehicle Types Grid */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-blue-600" />
            <h2 className="font-bold text-gray-900">أنواع السيارات</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{types.length} نوع</span>
          </div>
          <button
            onClick={() => setEditType({ icon: "🚛", is_active: 1, is_custom: 1, cargo_types: "[]" })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
            <Plus size={14} />إضافة نوع
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5">
          {types.map(t => {
            const cargoArr = parseCargo(t.cargo_types);
            return (
              <div key={t.id} className={`rounded-xl border p-4 relative transition-all ${t.is_active ? "border-blue-100 bg-blue-50/30" : "border-gray-100 bg-gray-50 opacity-60"}`}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-3xl">{t.icon}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setEditType({ ...t })}
                      className="p-1 rounded-lg hover:bg-white text-gray-400 hover:text-blue-600 transition-colors">
                      <Edit2 size={13} />
                    </button>
                    {!!t.is_custom && (
                      <button onClick={() => deleteType(t.id)}
                        className="p-1 rounded-lg hover:bg-white text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="font-bold text-gray-900 text-lg">{t.name}</div>
                {t.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.description}</p>}
                {t.max_load_bags > 0 && (
                  <div className="mt-2 text-xs text-blue-700 bg-blue-100 rounded-lg px-2 py-1 inline-block">
                    ⚖️ الحد الأقصى: {t.max_load_bags.toLocaleString("ar-SA")} كيس
                  </div>
                )}
                {t.overnight_rate > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1">
                    <Moon size={11} />
                    معد السهر: {t.overnight_rate.toLocaleString("ar-SA")} ر.س / كم
                  </div>
                )}
                {cargoArr.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {cargoArr.map(c => {
                      const range = (c.min > 0 || c.max > 0) ? ` ${c.min}–${c.max > 0 ? c.max : "∞"}` : "";
                      return <span key={c.key} className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-600">{c.label}{range}</span>;
                    })}
                  </div>
                )}
                {!t.is_active && <p className="mt-2 text-xs text-red-500 font-semibold">غير نشط</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cargo Routing Rules */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-green-600" />
            <h2 className="font-bold text-gray-900">قواعد توجيه الشحنات</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{rules.length} قاعدة</span>
          </div>
          <button onClick={() => setShowAddRule(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700">
            <Plus size={14} />إضافة قاعدة
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">لا توجد قواعد محددة</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right">نوع الشحنة</th>
                  <th className="px-4 py-3 text-center">الكمية من</th>
                  <th className="px-4 py-3 text-center">إلى</th>
                  <th className="px-4 py-3 text-right">نوع السيارة المناسب</th>
                  <th className="px-4 py-3 text-right">ملاحظات</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rules.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-800">{r.cargo_label || r.cargo_type}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{r.min_qty > 0 ? r.min_qty : "—"}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{r.max_qty > 0 ? r.max_qty : "غير محدد"}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span>{r.vehicle_icon}</span>
                        <span className="font-semibold text-blue-700">{r.vehicle_type_name || "—"}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditRule(r)}
                          className="p-1 hover:bg-blue-50 rounded text-gray-300 hover:text-blue-500">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => deleteRule(r.id)}
                          className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-3 bg-green-50/40 border-t border-green-100">
          <p className="text-xs text-green-700 flex items-center gap-1.5">
            <CheckCircle size={13} />
            هذه القواعد ستُستخدم مستقبلاً لاقتراح نوع السيارة المناسب تلقائياً عند تقديم الطلبات
          </p>
        </div>
      </div>

      {/* Add/Edit Vehicle Type Modal */}
      {editType && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="font-bold text-gray-900">{editType.id ? "تعديل نوع السيارة" : "إضافة نوع سيارة جديد"}</h3>
              <button onClick={() => setEditType(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">اسم النوع <span className="text-red-500">*</span></label>
                  <input value={editType.name || ""} onChange={e => setEditType(d => ({ ...d!, name: e.target.value }))}
                    placeholder="مثال: شاحنة ثقيلة"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">الأيقونة</label>
                  <input value={editType.icon || "🚛"} onChange={e => setEditType(d => ({ ...d!, icon: e.target.value }))}
                    className="w-full px-3 py-2 text-sm text-center border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">الوصف</label>
                <input value={editType.description || ""} onChange={e => setEditType(d => ({ ...d!, description: e.target.value }))}
                  placeholder="وصف مختصر"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">الحد الأقصى للحمولة (كيس) — 0 = غير محدد</label>
                <input type="number" min="0" value={editType.max_load_bags ?? 0}
                  onChange={e => setEditType(d => ({ ...d!, max_load_bags: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <Moon size={13} className="text-indigo-500" />
                  معد السهر (ر.س / كم) — 0 = لا يوجد
                </label>
                <div className="flex gap-2">
                  <input type="number" min="0" step="0.01" value={editType.overnight_rate ?? 0}
                    onChange={e => setEditType(d => ({ ...d!, overnight_rate: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  {(editType.overnight_rate ?? 0) > 0 && (
                    <button type="button"
                      onClick={() => setEditType(d => ({ ...d!, overnight_rate: 0 }))}
                      className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50 flex items-center gap-1">
                      <Trash2 size={12} />حذف
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">المبلغ الذي يستحقه السائق عن كل كيلومتر عند السهر خارج المدينة</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">أنواع الشحنات التي يحملها</label>
                {rules.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">أضف قواعد توجيه الشحنات أولاً لتظهر الأنواع هنا</p>
                ) : (
                  <div className="space-y-3">
                    {Array.from(new Map(rules.map(r => [r.cargo_type, { key: r.cargo_type, label: r.cargo_label || r.cargo_type }])).values()).map(c => {
                      const arr = parseCargo(editType.cargo_types || "[]");
                      const existing = arr.find(x => x.key === c.key);
                      const checked = !!existing;
                      const item = existing || { key: c.key, label: c.label, min: 0, max: 0 };

                      const toggle = () => {
                        const prev = parseCargo(editType.cargo_types || "[]");
                        const next = checked ? prev.filter(x => x.key !== c.key) : [...prev, { key: c.key, label: c.label, min: 0, max: 0 }];
                        setEditType(d => ({ ...d!, cargo_types: JSON.stringify(next) }));
                      };

                      const updateField = (field: "min" | "max", val: number) => {
                        const prev = parseCargo(editType.cargo_types || "[]");
                        const next = prev.map(x => x.key === c.key ? { ...x, [field]: val } : x);
                        setEditType(d => ({ ...d!, cargo_types: JSON.stringify(next) }));
                      };

                      return (
                        <div key={c.key}>
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input type="checkbox" checked={checked} onChange={toggle} className="w-4 h-4 accent-blue-600" />
                            <span className="text-sm text-gray-700">{c.label}</span>
                          </label>
                          {checked && (
                            <div className="mt-2 mr-7 grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">الحد الأدنى للكمية</label>
                                <input type="number" min="0" value={item.min}
                                  onChange={e => updateField("min", parseInt(e.target.value) || 0)}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">الحد الأقصى (0 = غير محدد)</label>
                                <input type="number" min="0" value={item.max}
                                  onChange={e => updateField("max", parseInt(e.target.value) || 0)}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={editType.is_active !== 0}
                  onChange={e => setEditType(d => ({ ...d!, is_active: e.target.checked ? 1 : 0 }))}
                  className="w-4 h-4 accent-blue-600" />
                <span className="text-sm text-gray-700">نشط</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={() => setEditType(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">إلغاء</button>
              <button onClick={saveType} disabled={saving || !editType.name?.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                <Save size={14} />{saving ? "جاري الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Cargo Rule Modal */}
      {showAddRule && (
        <CargoRuleModal types={types} rule={null} rules={rules} products={products}
          onClose={() => setShowAddRule(false)}
          onSave={() => { setShowAddRule(false); loadAll(); }} />
      )}
      {editRule && (
        <CargoRuleModal types={types} rule={editRule} rules={rules} products={products}
          onClose={() => setEditRule(null)}
          onSave={() => { setEditRule(null); loadAll(); }} />
      )}
    </div>
  );
}

function CargoRuleModal({ types, rule, rules: _rules, products, onClose, onSave }: {
  types: VehicleDef[];
  rule: CargoRule | null;
  rules: CargoRule[];
  products: Product[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    cargo_type:      rule?.cargo_type      ?? "",
    cargo_label:     rule?.cargo_label     ?? "",
    min_qty:         String(rule?.min_qty  ?? 0),
    max_qty:         String(rule?.max_qty  ?? 0),
    vehicle_type_id: String(rule?.vehicle_type_id ?? ""),
    notes:           rule?.notes           ?? "",
  });
  const [saving, setSaving] = useState(false);

  const isEdit = !!rule?.id;

  const save = async () => {
    setSaving(true);
    try {
      const url    = isEdit ? `/api/cargo-routing-rules/${rule!.id}` : "/api/cargo-routing-rules";
      const method = isEdit ? "PUT" : "POST";
      await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          min_qty:         parseInt(form.min_qty)         || 0,
          max_qty:         parseInt(form.max_qty)         || 0,
          vehicle_type_id: form.vehicle_type_id           || null,
        }),
      });
      onSave();
    } finally { setSaving(false); }
  };

  const selectProduct = (val: string) => {
    if (val === "") { setForm(f => ({ ...f, cargo_type: "", cargo_label: "" })); return; }
    if (val === "all") { setForm(f => ({ ...f, cargo_type: "all", cargo_label: "الكل (جميع المنتجات)" })); return; }
    const prod = products.find(p => String(p.id) === val);
    if (prod) setForm(f => ({ ...f, cargo_type: `product_${prod.id}`, cargo_label: prod.name }));
  };

  const currentSelectVal = (() => {
    if (!form.cargo_type) return "";
    if (form.cargo_type === "all") return "all";
    const match = form.cargo_type.match(/^product_(\d+)$/);
    if (match) return match[1];
    return "legacy";
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{isEdit ? "تعديل قاعدة توجيه" : "إضافة قاعدة توجيه"}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">المنتج / نوع الشحنة</label>
            <select
              value={currentSelectVal}
              onChange={e => selectProduct(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              <option value="">— اختر منتج —</option>
              <option value="all">🔘 الكل (جميع المنتجات)</option>
              {products.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.name} — {p.unit} ({p.category})
                </option>
              ))}
              {currentSelectVal === "legacy" && (
                <option value="legacy">{form.cargo_label || form.cargo_type}</option>
              )}
            </select>
            {form.cargo_label && (
              <p className="mt-1 text-xs text-gray-400">الرمز الداخلي: {form.cargo_type}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">الكمية من</label>
              <input type="number" min="0" value={form.min_qty}
                onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">إلى (0 = غير محدد)</label>
              <input type="number" min="0" value={form.max_qty}
                onChange={e => setForm(f => ({ ...f, max_qty: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">نوع السيارة المناسب</label>
            <select value={form.vehicle_type_id}
              onChange={e => setForm(f => ({ ...f, vehicle_type_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400">
              <option value="">— اختر —</option>
              {types.filter(t => t.is_active).map(t => <option key={t.id} value={String(t.id)}>{t.icon} {t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">ملاحظات</label>
            <input value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="وصف مختصر للقاعدة"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">إلغاء</button>
          <button onClick={save} disabled={saving || !form.cargo_label.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50">
            <Save size={14} />{saving ? "..." : isEdit ? "حفظ التعديلات" : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}
