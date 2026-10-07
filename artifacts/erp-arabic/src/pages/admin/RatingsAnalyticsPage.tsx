import { useState, useEffect } from "react";
import { Star, TrendingUp, Users, Truck, Package, Warehouse, Building2, RefreshCw } from "lucide-react";

interface RatingStats {
  totals: {
    avg_product: number; avg_driver: number; avg_rep: number;
    avg_warehouse: number; avg_company: number; total_ratings: number;
  };
  topDrivers: { driver_name: string; avg: number; count: number }[];
  topReps: { rep_name: string; avg: number; count: number }[];
  recent: {
    id: number; order_number: string; customer_name: string;
    product_rating: number; driver_rating: number; rep_rating: number;
    warehouse_rating: number; company_rating: number;
    driver_name: string; rep_name: string; created_at: string;
  }[];
}

function StarDisplay({ value }: { value: number }) {
  if (!value) return <span className="text-gray-300 text-xs">غير مُقيَّم</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={12} className={i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-gray-200"} />
      ))}
      <span className="text-xs font-bold text-gray-700 mr-1">{value?.toFixed(1)}</span>
    </div>
  );
}

function ScoreBar({ label, icon: Icon, value, color }: { label: string; icon: React.ElementType; value: number; color: string }) {
  const pct = value ? (value / 5) * 100 : 0;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center`}><Icon size={15} /></div>
        <div>
          <div className="text-xs text-gray-500">{label}</div>
          <div className="font-black text-gray-900 text-lg">{value ? value.toFixed(1) : "—"}</div>
        </div>
        <div className="mr-auto">
          <StarDisplay value={value} />
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-2 bg-gradient-to-l from-amber-400 to-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function RatingsAnalyticsPage() {
  const [stats, setStats] = useState<RatingStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/order-ratings/stats").then(r => r.json()).then(setStats).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Star size={20} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">تحليلات التقييمات 360°</h1>
            <p className="text-sm text-gray-500">تقييمات العملاء لكل عنصر خدمي بعد التسليم</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-gray-200 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> تحديث
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16"><RefreshCw size={24} className="animate-spin text-gray-300 mx-auto mb-2" /></div>
      ) : !stats ? (
        <div className="text-center py-16 text-gray-400">تعذر تحميل البيانات</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="bg-[#103c68] rounded-2xl p-5 text-white">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} />
              <span className="font-bold">ملخص الأداء العام · {stats.totals.total_ratings} تقييم</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "المنتج", val: stats.totals.avg_product },
                { label: "السائق", val: stats.totals.avg_driver },
                { label: "المندوب", val: stats.totals.avg_rep },
                { label: "المستودع", val: stats.totals.avg_warehouse },
                { label: "الشركة", val: stats.totals.avg_company },
              ].map(({ label, val }) => (
                <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                  <div className="text-2xl font-black">{val ? val.toFixed(1) : "—"}</div>
                  <div className="text-xs opacity-80">{label}</div>
                  <div className="flex justify-center mt-1">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} size={10} className={i <= Math.round(val || 0) ? "fill-amber-300 text-amber-300" : "text-white/20"} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Score bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ScoreBar label="تقييم المنتج" icon={Package}  value={stats.totals.avg_product}   color="bg-blue-50 text-blue-600" />
            <ScoreBar label="تقييم السائق" icon={Truck}    value={stats.totals.avg_driver}    color="bg-orange-50 text-orange-600" />
            <ScoreBar label="تقييم المندوب" icon={Users}   value={stats.totals.avg_rep}       color="bg-pink-50 text-pink-600" />
            <ScoreBar label="تقييم المستودع" icon={Warehouse} value={stats.totals.avg_warehouse} color="bg-green-50 text-green-600" />
            <ScoreBar label="تقييم الشركة"  icon={Building2} value={stats.totals.avg_company}  color="bg-purple-50 text-purple-600" />
          </div>

          {/* Top Performers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Truck size={16} className="text-orange-500" />
                <h3 className="font-bold text-gray-900">أفضل السائقين</h3>
              </div>
              {stats.topDrivers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">لا توجد بيانات</p>
              ) : (
                <div className="space-y-2">
                  {stats.topDrivers.map((d, i) => (
                    <div key={d.driver_name} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black
                        ${i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-gray-300 text-white" : i === 2 ? "bg-amber-700 text-white" : "bg-gray-100 text-gray-500"}`}>
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 text-sm">{d.driver_name}</div>
                        <div className="text-xs text-gray-400">{d.count} تقييم</div>
                      </div>
                      <StarDisplay value={d.avg} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-pink-500" />
                <h3 className="font-bold text-gray-900">أفضل المندوبين</h3>
              </div>
              {stats.topReps.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">لا توجد بيانات</p>
              ) : (
                <div className="space-y-2">
                  {stats.topReps.map((r, i) => (
                    <div key={r.rep_name} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black
                        ${i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-gray-300 text-white" : i === 2 ? "bg-amber-700 text-white" : "bg-gray-100 text-gray-500"}`}>
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 text-sm">{r.rep_name}</div>
                        <div className="text-xs text-gray-400">{r.count} تقييم</div>
                      </div>
                      <StarDisplay value={r.avg} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent ratings */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Star size={16} className="text-amber-500" />
              <h3 className="font-bold text-gray-900">أحدث التقييمات</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    {["الطلب","العميل","المنتج","السائق","المندوب","المستودع","الشركة","التاريخ"].map(h => (
                      <th key={h} className="px-4 py-3 text-right font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stats.recent.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-[#103c68] font-bold">{r.order_number}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs">{r.customer_name || "—"}</td>
                      <td className="px-4 py-3"><StarDisplay value={r.product_rating} /></td>
                      <td className="px-4 py-3"><StarDisplay value={r.driver_rating} /></td>
                      <td className="px-4 py-3"><StarDisplay value={r.rep_rating} /></td>
                      <td className="px-4 py-3"><StarDisplay value={r.warehouse_rating} /></td>
                      <td className="px-4 py-3"><StarDisplay value={r.company_rating} /></td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
