import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import {
  Star, ShoppingCart, Package, Search, Tag,
  Truck, Plus, ShoppingBag, X, CheckCircle2,
  Menu, Phone, Zap, ShieldCheck, User, ClipboardList,
  MessageCircle, Send,
} from "lucide-react";
import GuestAuthModal from "@/components/GuestAuthModal";

/* ─── Types ─── */
interface Product {
  id: number;
  name: string;
  description: string;
  image_url: string;
  price_per_unit: number;
  price_delivered?: number;
  unit: string;
  category: string;
  packaging_type?: string;
  avg_rating: number | null;
  review_count: number;
  stock?: number;
  active?: number;
  price_locked?: number;
}

interface Offer {
  id: number; title: string; description?: string; image_url?: string;
  discount_pct: number; valid_from?: string; valid_until?: string;
}

type PkgFilter = "الكل" | "معبأ" | "سائب";

/* ─── Stars ─── */
function Stars({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size}
          className={i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-gray-200 fill-gray-200"} />
      ))}
    </div>
  );
}

/* ─── ProductCard — matches Login.tsx style, with "add to cart" ─── */
function ProductCard({
  product,
  onOrder,
  onAddToCart,
  added,
  onRequestQuote,
}: {
  product: Product;
  onOrder: () => void;
  onAddToCart: (e: React.MouseEvent) => void;
  added: boolean;
  onRequestQuote?: (e: React.MouseEvent) => void;
}) {
  const locked = !!product.price_locked;
  return (
    <div
      onClick={locked ? undefined : onOrder}
      className={`text-right bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col group ${locked ? "" : "cursor-pointer"}`}
    >
      {/* Image */}
      <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={36} className="text-slate-300" />
          </div>
        )}
        {product.category && (
          <span className="absolute top-2 right-2 bg-white/90 text-[#103c68] text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            {product.category}
          </span>
        )}
        {product.packaging_type === "سائب" && (
          <span className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
            <Truck size={9} /> سائب
          </span>
        )}
        {product.packaging_type && product.packaging_type !== "سائب" && (
          <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
            <Package size={9} /> معبأ
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <p className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 flex-1">{product.name}</p>
        {(product.avg_rating ?? 0) > 0 && (
          <div className="flex items-center gap-1.5">
            <Stars rating={product.avg_rating!} />
            <span className="text-xs text-gray-400">({product.review_count})</span>
          </div>
        )}

        {locked ? (
          <div className="mt-1 space-y-1.5">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <MessageCircle size={13} className="text-gray-400 shrink-0" />
              <span className="text-xs text-gray-500 font-medium">السعر بالتواصل</span>
            </div>
            <button
              onClick={onRequestQuote}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-green-500 hover:bg-green-600 text-white transition-colors shadow-sm">
              <Send size={12} /> اطلب الآن 📩
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between mt-1">
              {(product.price_per_unit ?? 0) > 0 ? (
                <div>
                  <span className="text-lg font-black text-orange-500">
                    {product.price_per_unit?.toLocaleString("ar-SA")}
                  </span>
                  <span className="text-xs text-gray-400 mr-1">ر.س/{product.unit}</span>
                </div>
              ) : <span />}
              <span className="text-[10px] bg-orange-50 text-orange-600 px-2 py-1 rounded-lg font-semibold border border-orange-100">
                اطلب →
              </span>
            </div>
            <button
              onClick={onAddToCart}
              className={`w-full mt-1 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                added
                  ? "bg-green-500 text-white border-green-500"
                  : "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-500 hover:text-white hover:border-orange-500"
              }`}>
              {added ? "✓ تمت الإضافة" : <><Plus size={12} /> أضف للسلة</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Catalog — logged-in customer, matches Login.tsx design
════════════════════════════════════════════════════════════ */
export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useRememberedState("customer-catalog-search", "");
  const [activeCategory, setActiveCategory] = useRememberedState("customer-catalog-category-filter", "");
  const [pkgFilter, setPkgFilter] = useRememberedState("customer-catalog-package-filter", "الكل" as PkgFilter);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerIdx, setOfferIdx] = useState(0);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { addItem, totalCount: cartCount } = useCart();
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supervisorPhone, setSupervisorPhone] = useState("");
  const [whatsappOrderPhone, setWhatsappOrderPhone] = useState("0571748370");
  const offerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // WhatsApp quote modal state
  const [quoteProduct, setQuoteProduct] = useState<Product | null>(null);
  const [quoteForm, setQuoteForm] = useState({ qty: "", trucks: "", name: user?.name || "", phone: user?.phone || "", location: "" });
  const [quoteSent, setQuoteSent] = useState(false);

  useEffect(() => {
    fetch("/api/products")
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d.filter((p: Product) => p.active !== 0) : []))
      .finally(() => setLoading(false));
    fetch("/api/offers")
      .then(r => r.json())
      .then(d => setOffers(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/portal/supervisor-contact")
      .then(r => r.json())
      .then(d => { if (d.phone) setSupervisorPhone(d.phone); })
      .catch(() => {});
    fetch("/api/app-settings")
      .then(r => r.json())
      .then(d => { if (d.whatsapp_order_phone) setWhatsappOrderPhone(d.whatsapp_order_phone); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (offers.length <= 1) return;
    offerTimerRef.current = setInterval(() => setOfferIdx(i => (i + 1) % offers.length), 4000);
    return () => { if (offerTimerRef.current) clearInterval(offerTimerRef.current); };
  }, [offers]);

  const categories = useMemo(() =>
    [...new Set(products.map(p => p.category).filter(Boolean))],
    [products]
  );

  const categoryImages = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of products) {
      if (p.category && p.image_url && !map[p.category]) map[p.category] = p.image_url;
    }
    return map;
  }, [products]);

  const hasSaeb = useMemo(() => products.some(p => p.packaging_type === "سائب"), [products]);

  const filtered = useMemo(() => {
    let list = activeCategory ? products.filter(p => p.category === activeCategory) : products;
    if (pkgFilter !== "الكل") {
      list = list.filter(p => pkgFilter === "سائب" ? p.packaging_type === "سائب" : p.packaging_type !== "سائب");
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, activeCategory, pkgFilter, search]);

  const handleAddToCart = useCallback((product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { setShowGuestModal(true); return; }
    addItem({
      productId: product.id, name: product.name,
      price_per_unit: product.price_per_unit,
      price_delivered: product.price_delivered,
      unit: product.unit, image_url: product.image_url, category: product.category,
    });
    setAddedIds(s => new Set([...s, product.id]));
    setTimeout(() => setAddedIds(s => { const n = new Set(s); n.delete(product.id); return n; }), 1500);
  }, [user, addItem]);

  const waLink = (msg: string) => {
    if (!supervisorPhone) return undefined;
    const num = supervisorPhone.replace(/^0/, "966");
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-3 border-[#103c68] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">جاري تحميل المنتجات...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden" dir="rtl">

      {/* ════════════════════════════════════
          NAVBAR — white, matching homepage
      ════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex items-center h-16 gap-4">

            {/* Logo */}
            <button onClick={() => navigate("/")} className="flex-shrink-0 focus:outline-none active:scale-95 transition-transform">
              <img src="/jefer-logo-new.png" alt="JEFER" className="h-9 object-contain" />
            </button>

            {/* Category nav — desktop */}
            {categories.length > 0 && (
              <nav className="hidden md:flex flex-1 items-center justify-center gap-1 overflow-x-auto scrollbar-none px-4">
                <button
                  onClick={() => setActiveCategory("")}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    !activeCategory ? "bg-[#103c68] text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}>
                  الكل
                </button>
                {categories.map(cat => (
                  <button key={cat}
                    onClick={() => setActiveCategory(cat === activeCategory ? "" : cat)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                      activeCategory === cat ? "bg-[#103c68] text-white" : "text-gray-600 hover:bg-gray-100"
                    }`}>
                    {cat}
                  </button>
                ))}
              </nav>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mr-auto flex-shrink-0">
              {/* Search — desktop */}
              <div className="hidden sm:flex items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50 focus-within:border-[#103c68]/50 focus-within:ring-2 focus-within:ring-[#103c68]/10 transition-all">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ابحث عن منتج..."
                  className="px-3 py-2 text-sm bg-transparent outline-none w-44 text-gray-700 placeholder:text-gray-400"
                  dir="rtl"
                />
                <button className="px-3 py-2 text-gray-400 hover:text-[#103c68] transition-colors">
                  <Search size={15} />
                </button>
              </div>

              {/* User badge */}
              <div className="hidden sm:flex items-center gap-1.5 bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700">
                <User size={14} className="text-[#103c68]" />
                <span className="max-w-[80px] truncate">{user?.name}</span>
              </div>

              {/* My Orders button */}
              <button
                onClick={() => navigate("/my-orders")}
                className="flex items-center gap-1.5 bg-[#103c68] text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-[#0d2f52] transition-colors shadow-sm">
                <ClipboardList size={15} />
                <span className="hidden sm:inline">طلباتي</span>
              </button>

              {/* Cart */}
              <button onClick={() => navigate("/cart")}
                className="relative p-2.5 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors">
                <ShoppingBag size={20} />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -left-1 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </button>

              {/* Mobile menu toggle */}
              {categories.length > 0 && (
                <button
                  onClick={() => setMobileMenuOpen(v => !v)}
                  className="md:hidden p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors">
                  <Menu size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Mobile search */}
          <div className="sm:hidden pb-2">
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث عن منتج..."
                className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
                dir="rtl"
              />
              <button className="px-3 text-gray-400">
                <Search size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile category strip */}
        {mobileMenuOpen && categories.length > 0 && (
          <div className="md:hidden border-t border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto scrollbar-none bg-white">
            <button
              onClick={() => { setActiveCategory(""); setMobileMenuOpen(false); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                !activeCategory ? "bg-[#103c68] text-white" : "bg-gray-100 text-gray-600"
              }`}>
              الكل
            </button>
            {categories.map(cat => (
              <button key={cat}
                onClick={() => { setActiveCategory(cat === activeCategory ? "" : cat); setMobileMenuOpen(false); }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeCategory === cat ? "bg-[#103c68] text-white" : "bg-gray-100 text-gray-600"
                }`}>
                {cat}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ════════════════════════════════════
          TRUST BADGES
      ════════════════════════════════════ */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Truck,       label: "توصيل سريع",  sub: "لجميع مناطق المملكة" },
            { icon: ShieldCheck, label: "جودة مضمونة", sub: "منتجات موثوقة 100%"    },
            { icon: Zap,         label: "طلب فوري",    sub: "تتبع طلبك لحظياً"     },
            { icon: Phone,       label: "دعم مستمر",   sub: "خدمة عملاء 24/7"      },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-center gap-3 py-1">
              <div className="w-10 h-10 rounded-xl bg-[#103c68]/5 flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-[#103c68]" />
              </div>
              <div>
                <div className="font-bold text-gray-800 text-sm">{label}</div>
                <div className="text-gray-400 text-xs">{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════
          OFFERS CAROUSEL
      ════════════════════════════════════ */}
      {!search && !activeCategory && pkgFilter === "الكل" && offers.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-6">
          <div className="relative overflow-hidden rounded-2xl">
            <div className="bg-gradient-to-l from-orange-600 to-red-600 text-white p-4 flex items-center gap-3 min-h-[72px]">
              <div className="text-3xl flex-shrink-0">🏷️</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">عروض حصرية</span>
                  {offers[offerIdx]?.discount_pct > 0 && (
                    <span className="text-xs font-black bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full">
                      خصم {offers[offerIdx].discount_pct}%
                    </span>
                  )}
                </div>
                <h3 className="font-black text-base leading-tight">{offers[offerIdx]?.title}</h3>
                {offers[offerIdx]?.description && (
                  <p className="text-white/70 text-xs mt-0.5 line-clamp-1">{offers[offerIdx].description}</p>
                )}
              </div>
              {offers[offerIdx]?.image_url && (
                <img src={offers[offerIdx].image_url} alt={offers[offerIdx].title}
                  className="w-16 h-16 object-cover rounded-xl flex-shrink-0 shadow-lg border-2 border-white/20" />
              )}
            </div>
            {offers.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {offers.map((_, i) => (
                  <button key={i} onClick={() => setOfferIdx(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${i === offerIdx ? "bg-white w-4" : "bg-white/40"}`} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════
          PACKAGING FILTER (when both types exist)
      ════════════════════════════════════ */}
      {hasSaeb && (
        <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-4">
          <div className="flex gap-2">
            {(["الكل", "معبأ", "سائب"] as PkgFilter[]).map(p => (
              <button key={p} onClick={() => setPkgFilter(p)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  pkgFilter === p
                    ? p === "سائب" ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : p === "معبأ" ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                }`}>
                {p === "سائب" && <Truck size={11} />}
                {p === "الكل" ? "جميع الأنواع" : p === "سائب" ? "سائب (بلكر)" : "معبأ (أكياس)"}
              </button>
            ))}
          </div>
          {pkgFilter === "سائب" && (
            <div className="mt-2 bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-start gap-3">
              <Truck size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-blue-800 text-sm">منتجات سائبة (بلكر)</p>
                <p className="text-xs text-blue-600 mt-0.5">تُشحن بشاحنات بلكر متخصصة — مناسبة للكميات الكبيرة والمشاريع</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════
          CATEGORIES SECTION
      ════════════════════════════════════ */}
      {!search && categories.length > 0 && (
        <section className="bg-white py-8 border-b border-gray-100 mt-6">
          <div className="max-w-6xl mx-auto px-4 lg:px-8">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-1 h-6 rounded-full bg-orange-500" />
              <h2 className="text-xl font-black text-gray-900">تسوق حسب الأقسام</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {categories.map(cat => {
                const img = categoryImages[cat];
                const count = products.filter(p => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setActiveCategory(cat);
                      document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={`relative group rounded-2xl overflow-hidden aspect-[4/3] flex items-end transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                      activeCategory === cat ? "ring-2 ring-[#103c68]" : ""
                    }`}>
                    {img ? (
                      <img
                        src={img}
                        alt={cat}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[#103c68]/20 to-[#103c68]/40" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="relative z-10 p-3 text-right w-full">
                      <p className="text-white font-black text-sm leading-tight">{cat}</p>
                      <p className="text-white/70 text-xs">{count} منتج</p>
                    </div>
                    {activeCategory === cat && (
                      <div className="absolute top-2 left-2 w-5 h-5 bg-[#103c68] rounded-full flex items-center justify-center">
                        <CheckCircle2 size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════
          PRODUCTS GRID
      ════════════════════════════════════ */}
      <section id="products-section" className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 rounded-full bg-orange-500" />
            <div>
              <h2 className="text-xl font-black text-gray-900">
                {activeCategory ? activeCategory : search ? `نتائج "${search}"` : "جميع المنتجات"}
              </h2>
              <p className="text-gray-400 text-sm mt-0.5">
                {filtered.length} {filtered.length === products.length ? "منتج متاح" : "نتيجة"}
              </p>
            </div>
          </div>
          {(search || activeCategory || pkgFilter !== "الكل") && (
            <button
              onClick={() => { setSearch(""); setActiveCategory(""); setPkgFilter("الكل"); }}
              className="text-xs text-orange-500 hover:text-orange-600 font-semibold border border-orange-200 px-3 py-1.5 rounded-xl flex items-center gap-1">
              <X size={11} /> مسح الفلتر
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">لا توجد منتجات</p>
            <p className="text-sm mt-1">جرب بحثاً مختلفاً</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onOrder={() => navigate(`/order/${product.id}`)}
                onAddToCart={e => handleAddToCart(product, e)}
                added={addedIds.has(product.id)}
                onRequestQuote={e => {
                  e.stopPropagation();
                  setQuoteForm({ qty: "", trucks: "", name: user?.name || "", phone: user?.phone || "", location: "" });
                  setQuoteSent(false);
                  setQuoteProduct(product);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════
          FOOTER — matches homepage
      ════════════════════════════════════ */}
      <footer className="bg-[#103c68] text-white mt-0">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {/* Brand */}
            <div className="text-right">
              <div className="inline-block bg-white/10 rounded-xl px-4 py-2 mb-3">
                <img src="/jefer-logo-new.png" alt="JEFER" className="h-8 object-contain"
                  style={{ filter: "brightness(0) invert(1)" }} />
              </div>
              <p className="text-white/60 text-sm leading-relaxed">
                منصة متكاملة لمواد البناء — توصيل سريع وتتبع لحظي لجميع مناطق المملكة
              </p>
            </div>

            {/* Quick links */}
            <div className="text-right">
              <h3 className="font-bold text-white mb-3 text-sm">روابط سريعة</h3>
              <ul className="space-y-2">
                {[
                  { label: "الكتالوج", onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
                  { label: "المنتجات", onClick: () => document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth" }) },
                  { label: "طلباتي", onClick: () => navigate("/my-orders") },
                  { label: "سلة المشتريات", onClick: () => navigate("/cart") },
                ].map(link => (
                  <li key={link.label}>
                    <button onClick={link.onClick}
                      className="text-white/60 hover:text-white text-sm transition-colors">
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div className="text-right">
              <h3 className="font-bold text-white mb-3 text-sm">تواصل معنا</h3>
              {supervisorPhone ? (
                <div className="space-y-2">
                  <a href={`tel:${supervisorPhone}`}
                    className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors justify-end">
                    <span>{supervisorPhone}</span>
                    <Phone size={14} />
                  </a>
                  <a href={waLink("السلام عليكم، أود الاستفسار")}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-green-400 hover:text-green-300 text-sm transition-colors justify-end">
                    <span>واتساب</span>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M11.998 2C6.478 2 2 6.48 2 12.001c0 1.765.461 3.468 1.338 4.973L2 22l5.149-1.321A9.956 9.956 0 0011.998 22C17.519 22 22 17.52 22 12c0-5.522-4.48-10-10.002-10z"/>
                    </svg>
                  </a>
                </div>
              ) : (
                <p className="text-white/40 text-sm">تواصل معنا عبر الواتساب</p>
              )}
            </div>
          </div>

          <div className="border-t border-white/10 mt-8 pt-5 text-center">
            <p className="text-white/40 text-xs">© {new Date().getFullYear()} MKGH — جميع الحقوق محفوظة</p>
          </div>
        </div>
      </footer>

      {showGuestModal && (
        <GuestAuthModal
          onClose={() => setShowGuestModal(false)}
          message="سجّل دخولك أو أنشئ حساباً لإضافة المنتجات وإتمام الطلب"
        />
      )}

      {/* ── WhatsApp Quote Modal ── */}
      {quoteProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setQuoteProduct(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" dir="rtl"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                  <MessageCircle size={18} className="text-green-600" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-sm">اطلب الآن</h3>
                  <p className="text-xs text-gray-400 line-clamp-1">{quoteProduct.name}</p>
                </div>
              </div>
              <button onClick={() => setQuoteProduct(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={16} /></button>
            </div>

            {quoteSent ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 size={28} className="text-green-600" />
                </div>
                <p className="font-bold text-gray-900">تم فتح واتساب!</p>
                <p className="text-sm text-gray-500">سيتواصل معك فريقنا في أقرب وقت.</p>
                <button onClick={() => setQuoteProduct(null)}
                  className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200 transition-colors">
                  إغلاق
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">الكمية ({quoteProduct.unit})</label>
                    <input type="number" min="1" value={quoteForm.qty}
                      onChange={e => setQuoteForm(f => ({ ...f, qty: e.target.value }))}
                      placeholder="مثال: 100"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">عدد الشاحنات</label>
                    <input type="number" min="1" value={quoteForm.trucks}
                      onChange={e => setQuoteForm(f => ({ ...f, trucks: e.target.value }))}
                      placeholder="مثال: 2"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">الاسم *</label>
                  <input type="text" value={quoteForm.name}
                    onChange={e => setQuoteForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="اسمك الكريم"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">رقم الجوال *</label>
                  <input type="tel" value={quoteForm.phone}
                    onChange={e => setQuoteForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="05xxxxxxxx"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">موقع التنزيل *</label>
                  <input type="text" value={quoteForm.location}
                    onChange={e => setQuoteForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="المدينة / الحي / العنوان"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>

                <button
                  disabled={!quoteForm.name.trim() || !quoteForm.phone.trim() || !quoteForm.location.trim()}
                  onClick={() => {
                    const num = whatsappOrderPhone.replace(/^0/, "966");
                    const lines = [
                      `📦 *طلب جديد — ${quoteProduct.name}*`,
                      `الاسم: ${quoteForm.name}`,
                      `الجوال: ${quoteForm.phone}`,
                      quoteForm.qty   ? `الكمية: ${quoteForm.qty} ${quoteProduct.unit}` : null,
                      quoteForm.trucks ? `عدد الشاحنات: ${quoteForm.trucks}` : null,
                      `موقع التنزيل: ${quoteForm.location}`,
                    ].filter(Boolean).join("\n");
                    window.open(`https://wa.me/${num}?text=${encodeURIComponent(lines)}`, "_blank");
                    setQuoteSent(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M11.998 2C6.478 2 2 6.48 2 12.001c0 1.765.461 3.468 1.338 4.973L2 22l5.149-1.321A9.956 9.956 0 0011.998 22C17.519 22 22 17.52 22 12c0-5.522-4.48-10-10.002-10z"/>
                  </svg>
                  إرسال عبر واتساب
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
