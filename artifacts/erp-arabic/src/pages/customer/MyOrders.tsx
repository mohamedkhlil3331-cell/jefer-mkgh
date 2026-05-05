import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  Package, ChevronLeft, Search, RefreshCw,
  Clock, CheckCircle, Truck, FileText, Star, XCircle, Filter,
  TrendingUp, ShoppingCart, Banknote,
} from "lucide-react";

interface Order {
  id: number; order_number: string; product_name: string; quantity: number; unit: string;
  total_with_vat: number; stage: string; delivery_location: string;
  vehicle_plate: string; driver_phone: string; created_at: string;
}

const STAGES = [
  { key: "pending",           label: "قيد المراجعة",    icon: Clock,        color: "text-amber-600  bg-amber-50  border-amber-200"  },
  { key: "payment_confirmed", label: "تم تأكيد الدفع",  icon: CheckCircle,  color: "text-blue-600   bg-blue-50   border-blue-200"   },
  { key: "vehicle_assigned",  label: "جاري التجهيز",    icon: Truck,        color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  { key: "invoiced",          label: "صدرت الفاتورة",   icon: FileText,     color: "text-purple-600 bg-purple-50 border-purple-200" },
  { key: "loaded",            label: "في الطريق إليك",  icon: Truck,        color: "text-cyan-600   bg-cyan-50   border-cyan-200"   },
  { key: "delivered",         label: "تم التسليم",      icon: Star,         color: "text-green-600  bg-green-50  border-green-200"  },
  { key: "cancelled",         label: "ملغي",            icon: XCircle,      color: "text-red-600    bg-red-50    border-red-200"    },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));
const stageIndex = (k: string) => STAGES.findIndex(s => s.key === k);

const FILTER_TABS = [
  { key: "all",       label: "الكل"    },
  { key: "active",    label: "نشطة"    },
  { key: "delivered", label: "مسلّمة"  },
  { key: "cancelled", label: "ملغاة"   },
];

export default function MyOrders() {
  const { user }   = useAuth();
  const [orders,   setOrders]  = useState<Order[]>([]);
  const [loading,  setLoading] = useState(true);
  const [search,   setSearch]  = useState("");
  const [tabFilter,setTabFilter] = useState("all");
  const [, navigate] = useLocation();

  const load = () => {
    if (!user) return;
    setLoading(true);
    fetch(`/api/workflow/orders?role=customer&phone=${user.phone}`)
      .then(r => r.json())
      .then(d => setOrders(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(load, [user]);

  const stats = useMemo(() => ({
    total:     orders.length,
    active:    orders.filter(o => !["delivered","cancelled"].includes(o.stage)).length,
    delivered: orders.filter(o => o.stage === "delivered").length,
    revenue:   orders.filter(o => o.stage !== "cancelled").reduce((s, o) => s + (o.total_with_vat || 0), 0),
  }), [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (tabFilter === "active")    list = list.filter(o => !["delivered","cancelled"].includes(o.stage));
    if (tabFilter === "delivered") list = list.filter(o => o.stage === "delivered");
    if (tabFilter === "cancelled") list = list.filter(o => o.stage === "cancelled");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.order_number.toLowerCase().includes(q) ||
        o.product_name.toLowerCase().includes(q) ||
        o.delivery_location?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, tabFilter, search]);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-xl mx-auto px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-black text-gray-900">طلباتي</h1>
              <p className="text-xs text-gray-400">{orders.length} طلب إجمالاً</p>
            </div>
            <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="ابحث بالرقم أو المنتج..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pr-9 pl-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {FILTER_TABS.map(t => (
              <button key={t.key} onClick={() => setTabFilter(t.key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tabFilter === t.key ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {/* ── Stats row ── */}
        {!search && tabFilter === "all" && orders.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: ShoppingCart, label: "نشطة",  val: stats.active,     color: "bg-blue-50   text-blue-600"   },
              { icon: CheckCircle,  label: "مسلّمة", val: stats.delivered,  color: "bg-green-50  text-green-600"  },
              { icon: Banknote,     label: "الإجمالي",val:`${(stats.revenue/1000).toFixed(1)}k`,color:"bg-[#103c68]/5 text-[#103c68]"},
            ].map(({ icon: Icon, label, val, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
                <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center mx-auto mb-1.5`}>
                  <Icon size={14} />
                </div>
                <div className="font-black text-gray-900 text-base leading-none">{val}</div>
                <div className="text-xs text-gray-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                <div className="flex justify-between mb-3">
                  <div className="h-3 bg-gray-100 rounded w-24" />
                  <div className="h-3 bg-gray-100 rounded w-16" />
                </div>
                <div className="h-4 bg-gray-100 rounded w-40 mb-2" />
                <div className="h-2 bg-gray-100 rounded-full w-full" />
              </div>
            ))}
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Package size={48} className="text-gray-200 mx-auto mb-3" />
            <p className="font-semibold text-gray-500">
              {orders.length === 0 ? "لا توجد طلبات بعد" : "لا توجد نتائج"}
            </p>
            {orders.length === 0 && (
              <button onClick={() => navigate("/")}
                className="mt-4 bg-[#103c68] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#0d2e50] transition-colors">
                اطلب الآن
              </button>
            )}
          </div>
        )}

        {/* ── Order cards ── */}
        {!loading && filtered.map(order => {
          const stageInfo = STAGE_MAP[order.stage];
          const idx       = stageIndex(order.stage);
          const pct       = order.stage === "cancelled" ? 0 : Math.round(((idx + 1) / (STAGES.length - 1)) * 100);
          const Icon      = stageInfo?.icon ?? Package;

          return (
            <div
              key={order.id}
              onClick={() => navigate(`/my-orders/${order.id}`)}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md hover:border-[#103c68]/20 transition-all group"
            >
              {/* Top strip — stage color accent */}
              {order.stage !== "cancelled" && (
                <div className="h-1 bg-gray-100 w-full">
                  <div
                    className="h-1 bg-gradient-to-l from-[#0eb5cb] to-[#103c68] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              {order.stage === "cancelled" && <div className="h-1 bg-red-200 w-full" />}

              <div className="p-4">
                {/* Header row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-bold text-[#103c68]">{order.order_number}</div>
                    <div className="font-bold text-gray-900 mt-0.5 leading-tight">{order.product_name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {order.quantity} {order.unit}
                      {order.delivery_location && ` · ${order.delivery_location}`}
                    </div>
                  </div>
                  <div className="text-left flex-shrink-0 mr-3">
                    <div className="font-black text-gray-900">{order.total_with_vat?.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">ر.س</div>
                    <ChevronLeft size={14} className="text-gray-300 group-hover:text-[#103c68] mt-1 mr-auto transition-colors" />
                  </div>
                </div>

                {/* Stage badge */}
                <div className={`inline-flex items-center gap-1.5 border text-xs px-2.5 py-1 rounded-full font-semibold ${stageInfo?.color ?? "text-gray-600 bg-gray-50 border-gray-200"}`}>
                  <Icon size={11} />
                  {stageInfo?.label ?? order.stage}
                </div>

                {/* Progress dots — only for non-cancelled */}
                {order.stage !== "cancelled" && (
                  <div className="flex items-center gap-1 mt-3">
                    {STAGES.filter(s => s.key !== "cancelled").map((s, i) => {
                      const done = i <= idx;
                      const curr = i === idx;
                      return (
                        <div key={s.key}
                          className={`flex-1 h-1.5 rounded-full transition-all ${
                            done ? (curr ? "bg-[#0eb5cb]" : "bg-[#103c68]/40") : "bg-gray-100"
                          }`}
                        />
                      );
                    })}
                  </div>
                )}

                <div className="text-xs text-gray-300 mt-2">
                  {new Date(order.created_at).toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
