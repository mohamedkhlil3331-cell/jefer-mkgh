import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Star, ShoppingCart, Package } from "lucide-react";

interface Product {
  id: number;
  name: string;
  description: string;
  image_url: string;
  price_per_unit: number;
  unit: string;
  category: string;
  avg_rating: number | null;
  review_count: number;
}

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    fetch("/api/products").then(r => r.json()).then(setProducts).finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p =>
    !search || p.name.includes(search) || p.category?.includes(search) || p.description?.includes(search)
  );

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  const StarRating = ({ rating, count }: { rating: number | null; count: number }) => {
    const r = rating || 0;
    return (
      <div className="flex items-center gap-1">
        {[1,2,3,4,5].map(i => (
          <Star key={i} size={12} className={i <= Math.round(r) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"} />
        ))}
        <span className="text-xs text-muted-foreground mr-1">{r > 0 ? r.toFixed(1) : "—"} ({count})</span>
      </div>
    );
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">كتالوج المنتجات</h1>
              <p className="text-sm text-muted-foreground">أهلاً {user?.name}</p>
            </div>
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow">
              <span className="text-white font-bold text-sm">M</span>
            </div>
          </div>
          <input
            placeholder="ابحث عن منتج..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        {categories.length > 0 && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSearch(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${search === cat ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary"}`}
              >
                {cat}
              </button>
            ))}
            {search && <button onClick={() => setSearch("")} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs bg-gray-100 text-gray-500 border border-gray-200">× مسح</button>}
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Package size={48} className="mx-auto mb-3 opacity-30" />
            <p>لا توجد منتجات</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(product => (
              <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative h-48 overflow-hidden bg-gray-100">
                  <img
                    src={product.image_url || "https://picsum.photos/seed/product/400/300"}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${product.id}/400/300`; }}
                  />
                  {product.category && (
                    <span className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-xs text-gray-600 px-2.5 py-1 rounded-full font-medium shadow-sm">
                      {product.category}
                    </span>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="font-bold text-gray-900 text-base mb-1">{product.name}</h3>
                  <StarRating rating={product.avg_rating} count={product.review_count} />
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed">{product.description}</p>

                  <div className="flex items-center justify-between mt-4">
                    <div>
                      <span className="text-xl font-bold text-primary">{product.price_per_unit.toLocaleString("ar-SA")}</span>
                      <span className="text-sm text-muted-foreground"> ر.س/{product.unit}</span>
                    </div>
                    <button
                      onClick={() => navigate(`/order/${product.id}`)}
                      className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      <ShoppingCart size={15} />
                      اطلب الآن
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
