import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Star, ShoppingCart, Package, Search, ChevronLeft, Tag, TrendingUp, Layers } from "lucide-react";

interface Product {
  id: number;
  name: string;
  description: string;
  image_url: string;
  price_per_unit: number;
  price_delivered?: number;
  unit: string;
  category: string;
  avg_rating: number | null;
  review_count: number;
  stock?: number;
  active?: number;
}

function StarRow({ rating, count }: { rating: number | null; count: number }) {
  const r = rating ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={11}
          className={i <= Math.round(r) ? "fill-yellow-400 text-yellow-400" : "text-gray-200 fill-gray-200"} />
      ))}
      <span className="text-xs text-gray-400 mr-1">{r > 0 ? r.toFixed(1) : "—"}</span>
      {count > 0 && <span className="text-xs text-gray-300">({count})</span>}
    </div>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  "اسمنت": "🏗️", "رمل": "🏖️", "حصى": "⚪", "خبث": "⚫",
  "جبس": "🪨", "طوب": "🧱", "حديد": "🔩", "معدات": "🔧",
};

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [catFilter,setCatFilter]= useState("الكل");
  const [, navigate] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    fetch("/api/products")
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d.filter((p: Product) => p.active !== 0) : []))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() =>
    ["الكل", ...new Set(products.map(p => p.category).filter(Boolean))],
    [products]
  );

  const filtered = useMemo(() => {
    let list = catFilter === "الكل" ? products : products.filter(p => p.category === catFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, catFilter, search]);

  const bestSeller = useMemo(() =>
    [...products].sort((a, b) => (b.review_count || 0) - (a.review_count || 0))[0],
    [products]
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-3 border-[#103c68] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">جاري تحميل المنتجات...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* ── Sticky header ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 pt-4 pb-2">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-black text-gray-900">كتالوج المنتجات</h1>
              <p className="text-xs text-gray-400">أهلاً {user?.name} · {products.length} منتج</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#103c68] to-[#0eb5cb] flex items-center justify-center shadow-md">
              <span className="text-white font-black text-sm">M</span>
            </div>
          </div>
          {/* Search */}
          <div className="relative mb-2">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="ابحث عن منتج أو فئة..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCatFilter("الكل"); }}
              className="w-full border border-gray-200 rounded-xl pr-9 pl-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 focus:border-[#103c68]/50"
            />
          </div>
          {/* Category pills */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => { setCatFilter(cat); setSearch(""); }}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  catFilter === cat
                    ? "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                    : "bg-white text-gray-500 border-gray-200 hover:border-[#103c68]/40"
                }`}
              >
                {cat !== "الكل" && <span>{CATEGORY_ICONS[cat] || "📦"}</span>}
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* ── Hero banner ── */}
        {!search && catFilter === "الكل" && bestSeller && (
          <div
            onClick={() => navigate(`/order/${bestSeller.id}`)}
            className="cursor-pointer rounded-2xl bg-gradient-to-l from-[#103c68] to-[#0d2e50] text-white p-5 flex items-center gap-4 shadow-lg relative overflow-hidden"
          >
            <div className="absolute left-0 top-0 bottom-0 w-32 opacity-10">
              <div className="w-32 h-32 rounded-full bg-white/30 -mr-10 -mt-6" />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp size={13} className="text-[#0eb5cb]" />
                <span className="text-xs font-semibold text-[#0eb5cb]">الأكثر طلباً</span>
              </div>
              <h2 className="font-black text-lg leading-tight mb-1">{bestSeller.name}</h2>
              {bestSeller.description && (
                <p className="text-white/70 text-xs line-clamp-2">{bestSeller.description}</p>
              )}
              <div className="flex items-center gap-3 mt-3">
                <div>
                  <span className="text-2xl font-black">{bestSeller.price_per_unit?.toFixed(0)}</span>
                  <span className="text-sm font-medium mr-1 text-white/80">ر.س/{bestSeller.unit}</span>
                </div>
                <div className="bg-[#0eb5cb] text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                  <ShoppingCart size={12} /> اطلب الآن
                </div>
              </div>
            </div>
            {bestSeller.image_url ? (
              <img src={bestSeller.image_url} alt={bestSeller.name}
                className="w-24 h-24 object-cover rounded-xl flex-shrink-0 shadow-lg" />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 text-4xl">
                {CATEGORY_ICONS[bestSeller.category] || "📦"}
              </div>
            )}
          </div>
        )}

        {/* ── Stats row ── */}
        {!search && catFilter === "الكل" && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Package, label: "منتجات متاحة", val: products.length, color: "text-[#103c68] bg-[#103c68]/10" },
              { icon: Tag, label: "فئات", val: categories.length - 1, color: "text-[#0eb5cb] bg-[#0eb5cb]/10" },
              { icon: Layers, label: "طلب الآن", val: "سريع", color: "text-emerald-600 bg-emerald-50" },
            ].map(({ icon: Icon, label, val, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
                <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mx-auto mb-2`}>
                  <Icon size={16} />
                </div>
                <div className="font-black text-gray-900 text-lg leading-none">{val}</div>
                <div className="text-xs text-gray-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Product grid ── */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Package size={48} className="text-gray-200 mx-auto mb-3" />
            <p className="font-semibold text-gray-500">لا توجد منتجات</p>
            <p className="text-sm text-gray-300 mt-1">جرب بحثاً مختلفاً</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800 text-sm">
                {catFilter !== "الكل" ? catFilter : search ? `نتائج "${search}"` : "جميع المنتجات"}
                <span className="text-gray-400 font-normal mr-1">({filtered.length})</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(product => (
                <div
                  key={product.id}
                  onClick={() => navigate(`/order/${product.id}`)}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer group hover:shadow-md hover:border-[#103c68]/20 transition-all"
                >
                  {/* Image */}
                  <div className="relative h-44 bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl">
                        {CATEGORY_ICONS[product.category] || "📦"}
                      </div>
                    )}
                    {product.category && (
                      <span className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur-sm text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                        {CATEGORY_ICONS[product.category] || ""} {product.category}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900 mb-1 leading-tight">{product.name}</h3>
                    {product.description && (
                      <p className="text-xs text-gray-400 mb-2 line-clamp-2 leading-relaxed">{product.description}</p>
                    )}
                    <StarRow rating={product.avg_rating} count={product.review_count} />

                    <div className="mt-3 pt-3 border-t border-gray-50 flex items-end justify-between">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-black text-gray-900">{product.price_per_unit?.toFixed(0)}</span>
                          <span className="text-xs text-gray-400">ر.س</span>
                        </div>
                        <div className="text-xs text-gray-400">لكل {product.unit}</div>
                        {product.price_delivered && product.price_delivered !== product.price_per_unit && (
                          <div className="text-xs text-[#0eb5cb] font-medium mt-0.5">
                            {product.price_delivered.toFixed(0)} ر.س موصّل
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 bg-[#103c68] text-white text-xs font-bold px-3 py-2 rounded-xl group-hover:bg-[#0d2e50] transition-colors">
                        <ShoppingCart size={12} />
                        اطلب
                        <ChevronLeft size={12} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
