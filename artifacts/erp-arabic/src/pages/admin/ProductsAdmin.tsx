import { useEffect, useState, useRef } from "react";
import { Plus, Pencil, Trash2, Download, Upload, Save, X, Package, Tag, Check } from "lucide-react";

interface Product {
  id: number; name: string; description?: string; category?: string;
  price_per_unit: number; price_delivered: number; price_truck_buraydah: number;
  unit: string; stock: number; active: number; sort_order: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  "اسمنت المدينة":  "bg-blue-50   border-blue-200   text-blue-700",
  "اسمنت القصيم":   "bg-indigo-50 border-indigo-200 text-indigo-700",
  "اسمنت مكس":      "bg-purple-50 border-purple-200 text-purple-700",
  "جيفر":           "bg-orange-50 border-orange-200 text-orange-700",
  "بركاني":         "bg-red-50    border-red-200    text-red-700",
  "بلوك":           "bg-green-50  border-green-200  text-green-700",
};

function PriceCell({ value, onChange, saved }: { value: number; onChange: (v: number) => void; saved?: boolean }) {
  return (
    <div className="relative">
      <input
        type="number" min="0" step="0.5"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={`w-28 px-3 py-1.5 text-sm text-center border rounded-lg outline-none transition-all focus:ring-2 focus:ring-blue-400 focus:border-blue-400 ${
          saved ? "border-green-400 bg-green-50" : "border-gray-200 bg-white hover:border-gray-300"
        }`}
      />
      {saved && <Check size={12} className="absolute -top-1.5 -left-1.5 text-green-500 bg-white rounded-full" />}
    </div>
  );
}

export default function ProductsAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<number, Partial<Product>>>({});
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Product | null>(null);
  const [filter, setFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/products/all");
    const d = await r.json();
    setProducts(d);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getVal = (p: Product, key: keyof Product) =>
    edits[p.id]?.[key] !== undefined ? edits[p.id][key] as number : p[key] as number;

  const setEdit = (id: number, key: keyof Product, val: number) => {
    setEdits(e => ({ ...e, [id]: { ...e[id], [key]: val } }));
    setSaved(s => { const n = new Set(s); n.delete(id); return n; });
  };

  const savePrices = async (p: Product) => {
    const patch = {
      price_per_unit:       getVal(p, "price_per_unit"),
      price_delivered:      getVal(p, "price_delivered"),
      price_truck_buraydah: getVal(p, "price_truck_buraydah"),
    };
    setSaving(s => new Set(s).add(p.id));
    await fetch(`/api/products/${p.id}/prices`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(s => { const n = new Set(s); n.delete(p.id); return n; });
    setSaved(s => new Set(s).add(p.id));
    setEdits(e => { const n = { ...e }; delete n[p.id]; return n; });
    setProducts(ps => ps.map(x => x.id === p.id ? { ...x, ...patch } : x));
    setTimeout(() => setSaved(s => { const n = new Set(s); n.delete(p.id); return n; }), 2000);
  };

  const saveAll = async () => {
    const dirty = products.filter(p => edits[p.id]);
    await Promise.all(dirty.map(p => savePrices(p)));
  };

  const toggleActive = async (p: Product) => {
    await fetch(`/api/products/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...p, active: p.active ? 0 : 1 }),
    });
    load();
  };

  const deleteProduct = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    load();
  };

  const exportCSV = () => {
    const rows = products.map(p =>
      [p.name, p.category, p.price_per_unit, p.price_delivered, p.price_truck_buraydah, p.unit, p.stock, p.active ? "نشط" : "غير نشط"].join(",")
    );
    const csv = ["النوع,الفئة,السعر للحبة,السعر واصل,السعر بالترلة بريدة,الوحدة,المخزون,الحالة", ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `mkgh-products-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const importCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const lines = (e.target?.result as string).trim().split("\n").slice(1);
      for (const line of lines) {
        const [name, category, price_per_unit, price_delivered, price_truck_buraydah, unit, stock] = line.split(",");
        if (!name?.trim()) continue;
        await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(), category: category?.trim() || null,
            price_per_unit: parseFloat(price_per_unit) || 0,
            price_delivered: parseFloat(price_delivered) || 0,
            price_truck_buraydah: parseFloat(price_truck_buraydah) || 0,
            unit: unit?.trim() || "كيس",
            stock: parseInt(stock) || 0,
          }),
        });
      }
      load();
    };
    reader.readAsText(file, "utf-8");
  };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];
  const filtered = filter
    ? products.filter(p => p.category === filter)
    : products;
  const dirtyCount = Object.keys(edits).length;

  return (
    <div className="space-y-6" dir="rtl">
      <input ref={fileRef} type="file" accept=".csv" className="hidden"
        onChange={e => { if (e.target.files?.[0]) { importCSV(e.target.files[0]); e.target.value = ""; } }} />

      {editModal && <ProductModal product={editModal} onClose={() => setEditModal(null)} onSave={() => { setEditModal(null); load(); }} />}
      {addModal && <ProductModal onClose={() => setAddModal(false)} onSave={() => { setAddModal(false); load(); }} />}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة الأسعار والمنتجات</h1>
          <p className="text-sm text-gray-500 mt-0.5">{products.length} منتج — عدّل الأسعار مباشرة ثم احفظ</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {dirtyCount > 0 && (
            <button onClick={saveAll}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 shadow-sm">
              <Save size={14} />حفظ التعديلات ({dirtyCount})
            </button>
          )}
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 shadow-sm">
            <Upload size={14} />استيراد CSV
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 shadow-sm">
            <Download size={14} />تصدير
          </button>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm">
            <Plus size={14} />منتج جديد
          </button>
        </div>
      </div>

      {/* Tip banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-blue-700">
        <Tag size={16} className="mt-0.5 flex-shrink-0" />
        <span>عدّل الأسعار مباشرة في الجدول ← ستظهر زر <b>حفظ</b> في كل سطر، أو اضغط <b>حفظ التعديلات</b> لحفظ كل شيء دفعة واحدة</span>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter("")}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${!filter ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
          الكل ({products.length})
        </button>
        {categories.map(cat => {
          const count = products.filter(p => p.category === cat).length;
          return (
            <button key={cat} onClick={() => setFilter(cat === filter ? "" : cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${filter === cat ? "bg-blue-600 text-white border-blue-600" : `bg-white border-gray-200 hover:border-gray-300 ${CATEGORY_COLORS[cat]?.split(" ")[2] || "text-gray-600"}`}`}>
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-right text-xs font-bold text-gray-500">النوع</th>
                  <th className="px-3 py-3 text-right text-xs font-bold text-gray-500">الفئة</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-blue-600">
                    💰 السعر للحبة<br /><span className="font-normal text-gray-400">ارض البرحة</span>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-green-600">
                    🚚 السعر واصل<br /><span className="font-normal text-gray-400">للعميل</span>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-purple-600">
                    🏭 سعر الترلة<br /><span className="font-normal text-gray-400">واصل بريدة</span>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-500">الوحدة</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-500">المخزون</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-500">الحالة</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {/* Group by category */}
                {categories
                  .filter(cat => !filter || cat === filter)
                  .map(cat => {
                    const catProducts = filtered.filter(p => p.category === cat);
                    if (catProducts.length === 0) return null;
                    const colorClass = CATEGORY_COLORS[cat] || "bg-gray-50 border-gray-200 text-gray-600";
                    return (
                      <tbody key={cat}>
                        <tr>
                          <td colSpan={9} className={`px-5 py-2 border-y border-gray-100`}>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${colorClass}`}>
                              <Package size={11} />{cat}
                            </span>
                          </td>
                        </tr>
                        {catProducts.map(p => {
                          const isDirty = !!edits[p.id];
                          const isSaving = saving.has(p.id);
                          const isSaved = saved.has(p.id);
                          return (
                            <tr key={p.id} className={`border-b border-gray-50 transition-colors ${isDirty ? "bg-yellow-50/40" : "hover:bg-gray-50/60"} ${!p.active ? "opacity-50" : ""}`}>
                              <td className="px-5 py-3 font-semibold text-gray-800">{p.name}</td>
                              <td className="px-3 py-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>{p.category}</span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <PriceCell
                                  value={getVal(p, "price_per_unit")}
                                  onChange={v => setEdit(p.id, "price_per_unit", v)}
                                  saved={isSaved}
                                />
                              </td>
                              <td className="px-3 py-3 text-center">
                                <PriceCell
                                  value={getVal(p, "price_delivered")}
                                  onChange={v => setEdit(p.id, "price_delivered", v)}
                                  saved={isSaved}
                                />
                              </td>
                              <td className="px-3 py-3 text-center">
                                <PriceCell
                                  value={getVal(p, "price_truck_buraydah")}
                                  onChange={v => setEdit(p.id, "price_truck_buraydah", v)}
                                  saved={isSaved}
                                />
                              </td>
                              <td className="px-3 py-3 text-center text-gray-500 text-xs">{p.unit}</td>
                              <td className="px-3 py-3 text-center text-gray-600 font-mono text-xs">{p.stock.toLocaleString("ar-SA")}</td>
                              <td className="px-3 py-3 text-center">
                                <button onClick={() => toggleActive(p)}
                                  className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors ${
                                    p.active ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200" : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                                  }`}>
                                  {p.active ? "نشط" : "مخفي"}
                                </button>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-1 justify-center">
                                  {isDirty && (
                                    <button onClick={() => savePrices(p)} disabled={isSaving}
                                      className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                                      {isSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={12} />}
                                      حفظ
                                    </button>
                                  )}
                                  {!isDirty && (
                                    <>
                                      <button onClick={() => setEditModal(p)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                                        <Pencil size={14} className="text-gray-400" />
                                      </button>
                                      <button onClick={() => deleteProduct(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 size={14} className="text-red-400" />
                                      </button>
                                    </>
                                  )}
                                  {isDirty && (
                                    <button onClick={() => setEdits(e => { const n = { ...e }; delete n[p.id]; return n; })} className="p-1.5 hover:bg-gray-100 rounded-lg">
                                      <X size={12} className="text-gray-400" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    );
                  })}
                {/* Uncategorized */}
                {filtered.filter(p => !p.category).map(p => {
                  const isDirty = !!edits[p.id];
                  const isSaving = saving.has(p.id);
                  const isSaved = saved.has(p.id);
                  return (
                    <tr key={p.id} className={`border-b border-gray-50 ${isDirty ? "bg-yellow-50/40" : "hover:bg-gray-50/60"} ${!p.active ? "opacity-50" : ""}`}>
                      <td className="px-5 py-3 font-semibold text-gray-800">{p.name}</td>
                      <td className="px-3 py-3 text-gray-400 text-xs">—</td>
                      <td className="px-3 py-3 text-center"><PriceCell value={getVal(p, "price_per_unit")} onChange={v => setEdit(p.id, "price_per_unit", v)} saved={isSaved} /></td>
                      <td className="px-3 py-3 text-center"><PriceCell value={getVal(p, "price_delivered")} onChange={v => setEdit(p.id, "price_delivered", v)} saved={isSaved} /></td>
                      <td className="px-3 py-3 text-center"><PriceCell value={getVal(p, "price_truck_buraydah")} onChange={v => setEdit(p.id, "price_truck_buraydah", v)} saved={isSaved} /></td>
                      <td className="px-3 py-3 text-center text-gray-500 text-xs">{p.unit}</td>
                      <td className="px-3 py-3 text-center font-mono text-xs">{p.stock.toLocaleString("ar-SA")}</td>
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => toggleActive(p)} className={`text-xs px-2 py-1 rounded-full border font-medium ${p.active ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>{p.active ? "نشط" : "مخفي"}</button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          {isDirty && <button onClick={() => savePrices(p)} disabled={isSaving} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">{isSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={12} />}حفظ</button>}
                          {!isDirty && <><button onClick={() => setEditModal(p)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil size={14} className="text-gray-400" /></button><button onClick={() => deleteProduct(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14} className="text-red-400" /></button></>}
                          {isDirty && <button onClick={() => setEdits(e => { const n = { ...e }; delete n[p.id]; return n; })} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={12} className="text-gray-400" /></button>}
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

      {/* Summary */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "أرخص منتج", val: `${Math.min(...products.map(p => p.price_per_unit))} ريال`, icon: "💰", color: "text-blue-600" },
            { label: "أغلى منتج", val: `${Math.max(...products.map(p => p.price_per_unit))} ريال`, icon: "💎", color: "text-purple-600" },
            { label: "منتجات نشطة", val: products.filter(p => p.active).length, icon: "✅", color: "text-green-600" },
          ].map((c, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
              <div className="text-2xl mb-1">{c.icon}</div>
              <div className={`text-xl font-bold ${c.color}`}>{c.val}</div>
              <div className="text-xs text-gray-400 mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductModal({ product, onClose, onSave }: { product?: Product; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    name: product?.name || "", description: product?.description || "",
    category: product?.category || "", unit: product?.unit || "كيس",
    price_per_unit: product?.price_per_unit || 0,
    price_delivered: product?.price_delivered || 0,
    price_truck_buraydah: product?.price_truck_buraydah || 0,
    stock: product?.stock || 0,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    const url = product ? `/api/products/${product.id}` : "/api/products";
    await fetch(url, {
      method: product ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, active: 1 }),
    });
    setSaving(false); onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-800 text-lg">{product ? "تعديل منتج" : "إضافة منتج جديد"}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-sm font-medium text-gray-600 block mb-1">اسم المنتج *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">الفئة</label>
            <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              list="cats" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            <datalist id="cats">{["اسمنت المدينة","اسمنت القصيم","اسمنت مكس","جيفر","بركاني","بلوك"].map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">الوحدة</label>
            <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              {["كيس","حبة","م³","طن","لتر"].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* Pricing — 3 columns */}
          <div className="col-span-2">
            <div className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Tag size={14} />الأسعار (ريال سعودي)</div>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["💰 السعر للحبة", "price_per_unit", "ارض البرحة"],
                ["🚚 السعر واصل", "price_delivered", "للعميل"],
                ["🏭 سعر الترلة", "price_truck_buraydah", "واصل بريدة"],
              ].map(([lbl, key, sub]) => (
                <div key={key} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs font-bold text-gray-700">{lbl}</div>
                  <div className="text-xs text-gray-400 mb-2">{sub}</div>
                  <input type="number" min="0" step="0.5"
                    value={form[key as keyof typeof form] as number}
                    onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">المخزون</label>
            <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-gray-600 block mb-1">الوصف</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">إلغاء</button>
          <button onClick={save} disabled={saving || !form.name}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? "جاري الحفظ..." : product ? "تحديث المنتج" : "إضافة المنتج"}
          </button>
        </div>
      </div>
    </div>
  );
}
