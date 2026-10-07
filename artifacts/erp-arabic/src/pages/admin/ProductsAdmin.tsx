import { useEffect, useState, useRef } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import * as XLSX from "xlsx";
import { Plus, Pencil, Trash2, Download, Upload, Save, X, Package, Tag, Check, LayoutGrid, Table2, Lock, LockOpen } from "lucide-react";

interface Product {
  id: number; name: string; description?: string; category?: string; image_url?: string;
  price_per_unit: number; price_delivered: number; price_truck_buraydah: number;
  unit: string; stock: number; active: number; sort_order: number; load_capacity?: number; weight_kg?: number;
  packaging_type?: string; price_locked?: number;
}
const PACK_INFO: Record<string, { emoji: string; label: string; cls: string; clsCard: string }> = {
  "معبأ":     { emoji: "📦", label: "معبأ",      cls: "bg-emerald-50 text-emerald-700 border-emerald-200", clsCard: "bg-emerald-50 text-emerald-600" },
  "سائب":     { emoji: "🚛", label: "سائب",      cls: "bg-blue-50 text-blue-700 border-blue-200",         clsCard: "bg-blue-50 text-blue-600"       },
  "بلوك":     { emoji: "🧱", label: "بلوك",      cls: "bg-orange-50 text-orange-700 border-orange-200",   clsCard: "bg-orange-50 text-orange-600"   },
  "متر مكعب": { emoji: "📐", label: "م³",        cls: "bg-purple-50 text-purple-700 border-purple-200",   clsCard: "bg-purple-50 text-purple-600"   },
  "أخرى":     { emoji: "🔹", label: "أخرى",      cls: "bg-gray-100 text-gray-600 border-gray-200",        clsCard: "bg-gray-100 text-gray-500"      },
};
function packBadge(pt: string | undefined, size: "card" | "table" = "table") {
  const info = PACK_INFO[pt || ""] ?? PACK_INFO["معبأ"];
  if (size === "card")
    return <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] ${info.clsCard}`}>{info.emoji} {info.label}</span>;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${info.cls}`}>{info.emoji} {info.label}</span>;
}

interface Offer {
  id: number; title: string; description?: string; image_url?: string;
  discount_pct: number; valid_from?: string; valid_until?: string; active: number;
  created_at: string; product_ids?: number[];
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
  const [activeTab, setActiveTab] = useRememberedState<"products" | "offers">("admin-products-active-tab", "products");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<number, Partial<Product>>>({});
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Product | null>(null);
  const [filter, setFilter] = useRememberedState("admin-products-category-filter", "");
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const fileRef = useRef<HTMLInputElement>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerModal, setOfferModal] = useState<Offer | null | "new">(null);
  const [priceLocked, setPriceLocked] = useState(false);
  const [savingLock, setSavingLock] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/products/all");
    const d = await r.json();
    setProducts(d);
    setLoading(false);
  };

  const loadOffers = async () => {
    setOffersLoading(true);
    const r = await fetch("/api/offers?role=admin");
    const d = await r.json();
    setOffers(Array.isArray(d) ? d : []);
    setOffersLoading(false);
  };

  useEffect(() => {
    load(); loadOffers();
    fetch("/api/invoice-settings").then(r => r.json())
      .then(d => setPriceLocked(d.prices_locked === 1)).catch(() => {});
  }, []);

  const togglePriceLock = async () => {
    setSavingLock(true);
    const next = !priceLocked;
    await fetch("/api/invoice-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prices_locked: next }),
    });
    setPriceLocked(next);
    setSavingLock(false);
  };

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
    if (!confirm("هل أنت متأكد من حذف هذا المنتج نهائياً؟")) return;
    setProducts(ps => ps.filter(p => p.id !== id));
    fetch(`/api/products/${id}`, { method: "DELETE" });
  };

  const exportXLSX = () => {
    const rows = products.map(p => ({
      "الاسم":               p.name,
      "الفئة":               p.category ?? "",
      "السعر للحبة":         p.price_per_unit,
      "السعر واصل":          p.price_delivered,
      "السعر بالترلة بريدة": p.price_truck_buraydah,
      "الوحدة":              p.unit,
      "المخزون":             p.stock,
      "الحالة":              p.active ? "نشط" : "غير نشط",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المنتجات");
    XLSX.writeFile(wb, `mkgh-products-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const importXLSX = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      for (const row of rows) {
        const name = String(row["الاسم"] ?? row["name"] ?? "").trim();
        if (!name) continue;
        await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            category:             String(row["الفئة"] ?? row["category"] ?? "").trim() || null,
            price_per_unit:       parseFloat(String(row["السعر للحبة"]         ?? row["price_per_unit"]       ?? 0)) || 0,
            price_delivered:      parseFloat(String(row["السعر واصل"]          ?? row["price_delivered"]      ?? 0)) || 0,
            price_truck_buraydah: parseFloat(String(row["السعر بالترلة بريدة"] ?? row["price_truck_buraydah"] ?? 0)) || 0,
            unit:                 String(row["الوحدة"] ?? row["unit"] ?? "كيس").trim() || "كيس",
            stock:                parseInt(String(row["المخزون"]  ?? row["stock"] ?? 0)) || 0,
          }),
        });
      }
      load();
    };
    reader.readAsArrayBuffer(file);
  };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];
  const filtered = filter
    ? products.filter(p => p.category === filter)
    : products;
  const dirtyCount = Object.keys(edits).length;

  return (
    <div className="space-y-6" dir="rtl">
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={e => { if (e.target.files?.[0]) { importXLSX(e.target.files[0]); e.target.value = ""; } }} />

      {editModal && <ProductModal product={editModal} onClose={() => setEditModal(null)} onSave={() => { setEditModal(null); load(); }} />}
      {addModal && <ProductModal onClose={() => setAddModal(false)} onSave={() => { setAddModal(false); load(); }} />}
      {offerModal !== null && <OfferModal offer={offerModal === "new" ? undefined : offerModal} products={products} onClose={() => setOfferModal(null)} onSave={() => { setOfferModal(null); loadOffers(); }} />}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المنتجات والعروض</h1>
          <p className="text-sm text-gray-500 mt-0.5">{products.length} منتج · {offers.length} عرض</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {activeTab === "products" && (<>
            {dirtyCount > 0 && (
              <button onClick={saveAll}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 shadow-sm">
                <Save size={14} />حفظ التعديلات ({dirtyCount})
              </button>
            )}
            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
              <button onClick={() => setViewMode("cards")}
                className={`p-2 rounded-lg transition-colors ${viewMode === "cards" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
                title="عرض بطاقات">
                <LayoutGrid size={15} />
              </button>
              <button onClick={() => setViewMode("table")}
                className={`p-2 rounded-lg transition-colors ${viewMode === "table" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
                title="عرض جدول">
                <Table2 size={15} />
              </button>
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 shadow-sm">
              <Upload size={14} />استيراد Excel
            </button>
            <button
              onClick={togglePriceLock}
              disabled={savingLock}
              title={priceLocked ? "الأسعار مخفية عن الزوار — اضغط لإظهارها" : "اضغط لإخفاء الأسعار عن الزوار"}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border shadow-sm transition-colors disabled:opacity-50 ${
                priceLocked
                  ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}>
              {priceLocked ? <Lock size={14} /> : <LockOpen size={14} />}
              {priceLocked ? "الأسعار مقفولة" : "قفل الأسعار"}
            </button>
            <button onClick={exportXLSX}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 shadow-sm">
              <Download size={14} />تصدير Excel
            </button>
            <button onClick={() => setAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm">
              <Plus size={14} />منتج جديد
            </button>
          </>)}
          {activeTab === "offers" && (
            <button onClick={() => setOfferModal("new")}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 shadow-sm">
              <Plus size={14} />عرض جديد
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([["products","المنتجات","📦"],["offers","العروض","🏷️"]] as const).map(([key, label, icon]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${activeTab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </div>

      {activeTab === "offers" && (
        offersLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : offers.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="text-5xl mb-3">🏷️</div>
            <p className="font-bold text-gray-500">لا توجد عروض بعد</p>
            <button onClick={() => setOfferModal("new")}
              className="mt-4 bg-orange-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-orange-600">
              أضف عرضاً الآن
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {offers.map(offer => (
              <div key={offer.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${offer.active ? "border-orange-200" : "border-gray-200 opacity-60"}`}>
                {offer.image_url && <img src={offer.image_url} alt={offer.title} className="w-full h-32 object-cover" />}
                {!offer.image_url && <div className="w-full h-20 bg-gradient-to-l from-orange-500 to-red-500 flex items-center justify-center text-4xl">🏷️</div>}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-gray-900 text-sm">{offer.title}</h3>
                    {offer.discount_pct > 0 && <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">-{offer.discount_pct}%</span>}
                  </div>
                  {offer.description && <p className="text-xs text-gray-400 mb-2 line-clamp-2">{offer.description}</p>}
                  {(offer.valid_from || offer.valid_until) && (
                    <div className="text-xs text-gray-400 mb-2">
                      {offer.valid_from && `من ${offer.valid_from}`}{offer.valid_until && ` حتى ${offer.valid_until}`}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${offer.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {offer.active ? "نشط" : "موقف"}
                    </span>
                    <button onClick={() => setOfferModal(offer)}
                      className="text-xs text-blue-600 hover:underline">تعديل</button>
                    <button onClick={async () => { if (confirm("حذف هذا العرض؟")) { await fetch(`/api/offers/${offer.id}`, { method:"DELETE" }); await loadOffers(); } }}
                      className="text-xs text-red-500 hover:underline">حذف</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === "products" && (
      <div className="space-y-5">
      {/* Tip banner — only for table mode */}
      {viewMode === "table" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-blue-700">
          <Tag size={16} className="mt-0.5 flex-shrink-0" />
          <span>عدّل الأسعار مباشرة في الجدول ← ستظهر زر <b>حفظ</b> في كل سطر، أو اضغط <b>حفظ التعديلات</b> لحفظ كل شيء دفعة واحدة</span>
        </div>
      )}
      {viewMode === "cards" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-emerald-700">
          <LayoutGrid size={16} className="mt-0.5 flex-shrink-0" />
          <span>اضغط <b>تعديل</b> على أي منتج لتغيير صورته أو نصوصه أو أسعاره — يمكنك رفع صورة مباشرة من جهازك</span>
        </div>
      )}

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

      {/* ── CARD VIEW ─────────────────────────────────────────── */}
      {viewMode === "cards" && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => {
            const colorClass = CATEGORY_COLORS[p.category ?? ""] || "bg-gray-50 border-gray-200 text-gray-600";
            return (
              <div key={p.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow ${!p.active ? "opacity-55" : ""}`}>
                {/* Image */}
                <div className="relative w-full h-44 bg-gradient-to-br from-slate-100 to-slate-200 flex-shrink-0 overflow-hidden">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                      <Package size={36} className="text-slate-300" />
                      <button onClick={() => setEditModal(p)}
                        className="text-xs text-blue-500 hover:text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full font-medium transition-colors">
                        رفع صورة
                      </button>
                    </div>
                  )}
                  {/* Status badge */}
                  <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.active ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                    {p.active ? "نشط" : "مخفي"}
                  </span>
                  {/* Category */}
                  {p.category && (
                    <span className={`absolute bottom-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${colorClass}`}>
                      {p.category}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-3.5 flex-1 flex flex-col gap-2">
                  <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">{p.name}</h3>
                  {p.description && (
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{p.description}</p>
                  )}

                  {/* Prices */}
                  <div className="space-y-1 mt-auto">
                    {p.price_per_unit > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">💰 للحبة</span>
                        <span className="font-bold text-[#103c68]">{p.price_per_unit.toLocaleString("ar-SA")} ر.س</span>
                      </div>
                    )}
                    {p.price_delivered > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">🚚 واصل</span>
                        <span className="font-bold text-green-600">{p.price_delivered.toLocaleString("ar-SA")} ر.س</span>
                      </div>
                    )}
                    {p.price_truck_buraydah > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">🏭 ترلة بريدة</span>
                        <span className="font-bold text-purple-600">{p.price_truck_buraydah.toLocaleString("ar-SA")} ر.س</span>
                      </div>
                    )}
                  </div>

                  {/* Specs row */}
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 pt-1 border-t border-gray-50">
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded">{p.unit}</span>
                    {p.packaging_type && packBadge(p.packaging_type, "card")}
                    <span className="mr-auto text-gray-300">{p.stock} {p.unit}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setEditModal(p)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-white rounded-xl bg-[#103c68] hover:bg-[#0d2f53] transition-colors">
                      <Pencil size={12} />تعديل
                    </button>
                    <button onClick={() => toggleActive(p)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${p.active ? "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200" : "bg-green-50 text-green-600 border-green-200 hover:bg-green-100"}`}>
                      {p.active ? "إخفاء" : "تفعيل"}
                    </button>
                    <button onClick={() => deleteProduct(p.id)}
                      className="px-2.5 py-2 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-200 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "table" && loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {viewMode === "table" && !loading && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-right text-xs font-bold text-gray-500">المنتج</th>
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
                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-500">النوع</th>
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
                          <td colSpan={10} className={`px-5 py-2 border-y border-gray-100`}>
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
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-3">
                                  {p.image_url ? (
                                    <img src={p.image_url} alt={p.name} className="w-9 h-9 rounded-lg object-cover border border-gray-200 flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                  ) : (
                                    <div className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                                      <Package size={16} className="text-gray-300" />
                                    </div>
                                  )}
                                  <span className="font-semibold text-gray-800">{p.name}</span>
                                </div>
                              </td>
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
                              <td className="px-3 py-3 text-center">{packBadge(p.packaging_type)}</td>
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
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="w-9 h-9 rounded-lg object-cover border border-gray-200 flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                              <Package size={16} className="text-gray-300" />
                            </div>
                          )}
                          <span className="font-semibold text-gray-800">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-400 text-xs">—</td>
                      <td className="px-3 py-3 text-center"><PriceCell value={getVal(p, "price_per_unit")} onChange={v => setEdit(p.id, "price_per_unit", v)} saved={isSaved} /></td>
                      <td className="px-3 py-3 text-center"><PriceCell value={getVal(p, "price_delivered")} onChange={v => setEdit(p.id, "price_delivered", v)} saved={isSaved} /></td>
                      <td className="px-3 py-3 text-center"><PriceCell value={getVal(p, "price_truck_buraydah")} onChange={v => setEdit(p.id, "price_truck_buraydah", v)} saved={isSaved} /></td>
                      <td className="px-3 py-3 text-center text-gray-500 text-xs">{p.unit}</td>
                      <td className="px-3 py-3 text-center font-mono text-xs">{p.stock.toLocaleString("ar-SA")}</td>
                      <td className="px-3 py-3 text-center">{packBadge(p.packaging_type)}</td>
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
      {!loading && products.length > 0 && (
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
      </div>)}
    </div>
  );
}

function OfferModal({ offer, products, onClose, onSave }: { offer?: Offer; products: Product[]; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    title: offer?.title || "", description: offer?.description || "",
    image_url: offer?.image_url || "", discount_pct: offer?.discount_pct ?? 0,
    valid_from: offer?.valid_from || "", valid_until: offer?.valid_until || "",
    active: offer?.active ?? 1,
    product_ids: offer?.product_ids ?? [] as number[],
  });
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);

  const handleImg = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setForm(f => ({ ...f, image_url: e.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const toggleProduct = (id: number) => {
    setForm(f => ({
      ...f,
      product_ids: f.product_ids.includes(id)
        ? f.product_ids.filter(x => x !== id)
        : [...f.product_ids, id],
    }));
  };

  const save = async () => {
    if (!form.title) return;
    setSaving(true);
    const url  = offer ? `/api/offers/${offer.id}` : "/api/offers";
    const meth = offer ? "PUT" : "POST";
    await fetch(url, { method: meth, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{offer ? "تعديل عرض" : "عرض جديد"}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X size={16} /></button>
        </div>
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImg(e.target.files[0])} />
        {form.image_url ? (
          <div className="relative rounded-xl overflow-hidden h-32 cursor-pointer" onClick={() => imgRef.current?.click()}>
            <img src={form.image_url} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-sm font-medium opacity-0 hover:opacity-100">تغيير الصورة</div>
          </div>
        ) : (
          <button onClick={() => imgRef.current?.click()} type="button"
            className="w-full h-24 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm hover:border-orange-400 transition-colors flex flex-col items-center justify-center gap-1">
            <span className="text-2xl">🖼️</span>رفع صورة للعرض
          </button>
        )}
        <div><label className="text-xs font-semibold text-gray-600 block mb-1">عنوان العرض *</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none" /></div>
        <div><label className="text-xs font-semibold text-gray-600 block mb-1">الوصف</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none resize-none" /></div>
        <div><label className="text-xs font-semibold text-gray-600 block mb-1">نسبة الخصم (%)</label>
          <input type="number" min="0" max="100" step="0.5" value={form.discount_pct}
            onChange={e => setForm(f => ({ ...f, discount_pct: parseFloat(e.target.value)||0 }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none" /></div>

        {/* ── Product selection ── */}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">
            الأصناف المشمولة بالعرض
            {form.product_ids.length > 0 && (
              <span className="mr-2 bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {form.product_ids.length} صنف
              </span>
            )}
          </label>
          {products.length === 0 ? (
            <p className="text-xs text-gray-400">لا توجد أصناف بعد</p>
          ) : (
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
              {products.filter(p => p.active).map(p => {
                const selected = form.product_ids.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggleProduct(p.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-right transition-colors ${selected ? "bg-orange-50" : "hover:bg-gray-50"}`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? "bg-orange-500 border-orange-500" : "border-gray-300"}`}>
                      {selected && <Check size={10} className="text-white" />}
                    </div>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-gray-100 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{p.name}</div>
                      {p.category && <div className="text-[10px] text-gray-400">{p.category}</div>}
                    </div>
                    <div className="text-xs text-gray-400 shrink-0">{p.price_per_unit} ريال</div>
                  </button>
                );
              })}
            </div>
          )}
          {form.product_ids.length === 0 && (
            <p className="text-[10px] text-gray-400 mt-1">اترك فارغاً لتطبيق العرض على الكتالوج كاملاً</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-semibold text-gray-600 block mb-1">من تاريخ</label>
            <input type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none" /></div>
          <div><label className="text-xs font-semibold text-gray-600 block mb-1">حتى تاريخ</label>
            <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none" /></div>
        </div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">العرض نشط</label>
          <button type="button" onClick={() => setForm(f => ({ ...f, active: f.active ? 0 : 1 }))}
            className={`w-12 h-6 rounded-full transition-colors ${form.active ? "bg-green-500" : "bg-gray-300"} relative`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${form.active ? "right-0.5" : "left-0.5"}`} />
          </button>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">إلغاء</button>
          <button onClick={save} disabled={saving || !form.title}
            className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50">
            {saving ? "جاري الحفظ..." : offer ? "تحديث" : "إضافة العرض"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductModal({ product, onClose, onSave }: { product?: Product; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    name: product?.name || "", description: product?.description || "",
    category: product?.category || "", unit: product?.unit || "كيس",
    image_url: product?.image_url || "",
    price_per_unit: product?.price_per_unit || 0,
    price_delivered: product?.price_delivered || 0,
    price_truck_buraydah: product?.price_truck_buraydah || 0,
    stock: product?.stock || 0,
    load_capacity: product?.load_capacity || 0,
    weight_kg: product?.weight_kg || 0,
    packaging_type: product?.packaging_type || "معبأ",
    price_locked: product?.price_locked ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgFileRef = useRef<HTMLInputElement>(null);

  const handleImageFile = (file: File) => {
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setForm(f => ({ ...f, image_url: dataUrl }));
      setUploading(false);
    };
    reader.onerror = () => setUploading(false);
    reader.readAsDataURL(file);
  };

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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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

          {/* Product image */}
          <div className="col-span-2">
            <label className="text-sm font-medium text-gray-600 block mb-1">صورة المنتج</label>
            <input
              ref={imgFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); e.target.value = ""; }}
            />
            <div className="flex gap-3 items-start">
              {/* Preview */}
              <div
                className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center flex-shrink-0 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors overflow-hidden"
                onClick={() => imgFileRef.current?.click()}
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : form.image_url ? (
                  <img src={form.image_url} alt="معاينة"
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="text-center">
                    <Upload size={16} className="text-gray-300 mx-auto mb-0.5" />
                    <span className="text-xs text-gray-300">رفع</span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <button
                  type="button"
                  onClick={() => imgFileRef.current?.click()}
                  className="w-full py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5"
                >
                  <Upload size={12} /> {form.image_url ? "تغيير الصورة" : "رفع صورة من الجهاز"}
                </button>
                <div className="relative">
                  <input
                    type="text" value={form.image_url.startsWith("data:") ? "" : form.image_url}
                    onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                    placeholder="أو الصق رابط URL للصورة..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                {form.image_url && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, image_url: "" }))}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                    <X size={11} /> حذف الصورة
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Price lock toggle */}
          <div className="col-span-2">
            <div className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 cursor-pointer transition-colors ${form.price_locked ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}
              onClick={() => setForm(f => ({ ...f, price_locked: f.price_locked ? 0 : 1 }))}>
              <div className="flex items-center gap-2">
                {form.price_locked ? <Lock size={16} className="text-red-500" /> : <LockOpen size={16} className="text-gray-400" />}
                <div>
                  <div className={`text-sm font-bold ${form.price_locked ? "text-red-700" : "text-gray-700"}`}>
                    {form.price_locked ? "السعر مقفول — يظهر زر «اطلب الآن»" : "السعر ظاهر للعملاء"}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {form.price_locked ? "العملاء يرسلون طلبهم عبر واتساب بدون رؤية السعر" : "انقر لإخفاء السعر وتفعيل زر طلب واتساب"}
                  </div>
                </div>
              </div>
              <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.price_locked ? "bg-red-500" : "bg-gray-300"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.price_locked ? "translate-x-6" : "translate-x-1"}`} />
              </div>
            </div>
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
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">طاقة التحميل (طن)</label>
            <input type="number" min="0" step="0.5" value={form.load_capacity}
              onChange={e => setForm(f => ({ ...f, load_capacity: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">وزن الوحدة (كجم)</label>
            <input type="number" min="0" step="0.1" value={form.weight_kg}
              onChange={e => setForm(f => ({ ...f, weight_kg: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-gray-600 block mb-2">نوع التعبئة / الوحدة</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: "معبأ",      label: "معبأ (أكياس)",    sub: "شاحنة عادية",        emoji: "📦", activeColor: "border-emerald-600 bg-emerald-50", unit: "كيس"  },
                { val: "سائب",      label: "سائب (بلكر)",     sub: "شاحنة بلكر",          emoji: "🚛", activeColor: "border-blue-600 bg-blue-50",    unit: "طن"   },
                { val: "بلوك",      label: "بلوك (حبة)",      sub: "يُعدّ بالحبة",        emoji: "🧱", activeColor: "border-orange-500 bg-orange-50", unit: "حبة"  },
                { val: "متر مكعب",  label: "متر مكعب",        sub: "يُحسب بالم³",         emoji: "📐", activeColor: "border-purple-600 bg-purple-50", unit: "م³"   },
                { val: "أخرى",      label: "أخرى",            sub: "وحدة مخصصة",          emoji: "🔹", activeColor: "border-gray-500 bg-gray-50",    unit: ""     },
              ].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setForm(f => ({ ...f, packaging_type: opt.val, ...(opt.unit ? { unit: opt.unit } : {}) }))}
                  className={`p-2.5 rounded-xl border-2 text-right transition-all ${
                    form.packaging_type === opt.val ? opt.activeColor : "border-gray-200 hover:border-gray-300"
                  }`}>
                  <div className="text-lg mb-0.5">{opt.emoji}</div>
                  <div className="font-bold text-gray-900 text-xs">{opt.label}</div>
                  <div className="text-[10px] text-gray-400 leading-tight">{opt.sub}</div>
                </button>
              ))}
            </div>
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
