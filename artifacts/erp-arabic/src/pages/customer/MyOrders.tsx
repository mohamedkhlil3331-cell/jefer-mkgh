import { useEffect, useState, useMemo, useCallback } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  Package, ChevronLeft, Search, RefreshCw, Clock, CheckCircle, Truck,
  FileText, Star, XCircle, ShoppingCart, Banknote, Ban, X, Send,
  Warehouse, Users, Building2, MessageCircle, Download,
} from "lucide-react";

interface Order {
  id: number; order_number: string; product_name: string; quantity: number; unit: string;
  total_with_vat: number; stage: string; delivery_location: string; packaging_type: string;
  vehicle_plate: string; driver_phone: string; driver_name: string; rep_id: number;
  payment_method: string; created_at: string;
  driver_lat?: number; driver_lng?: number; driver_location_updated_at?: string;
}

const STAGES = [
  { key: "draft",                  label: "مسودة",               icon: FileText,     color: "text-gray-500   bg-gray-50   border-gray-200"   },
  { key: "pending",                label: "قيد المراجعة",        icon: Clock,        color: "text-amber-600  bg-amber-50  border-amber-200"  },
  { key: "pending_cash_approval",  label: "انتظار موافقة الكاش", icon: Banknote,     color: "text-orange-600 bg-orange-50 border-orange-200" },
  { key: "payment_confirmed",      label: "تم تأكيد الدفع",      icon: CheckCircle,  color: "text-blue-600   bg-blue-50   border-blue-200"   },
  { key: "vehicle_assigned",       label: "جاري التجهيز",        icon: Truck,        color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  { key: "invoiced",               label: "صدرت الفاتورة",       icon: FileText,     color: "text-purple-600 bg-purple-50 border-purple-200" },
  { key: "loaded",                 label: "في الطريق إليك",      icon: Truck,        color: "text-cyan-600   bg-cyan-50   border-cyan-200"   },
  { key: "delivered",              label: "تم التسليم",          icon: Star,         color: "text-green-600  bg-green-50  border-green-200"  },
  { key: "cancelled",              label: "ملغي",                icon: XCircle,      color: "text-red-600    bg-red-50    border-red-200"    },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));
const stageIndex = (k: string) => STAGES.findIndex(s => s.key === k);
const PROGRESS_STAGES = STAGES.filter(s => !["draft","cancelled","pending_cash_approval"].includes(s.key));

const FILTER_TABS = [
  { key: "all",       label: "الكل"    },
  { key: "active",    label: "نشطة"    },
  { key: "draft",     label: "مسودات"  },
  { key: "delivered", label: "مسلّمة"  },
  { key: "cancelled", label: "ملغاة"   },
];

// ── Star Picker ────────────────────────────────────────────────────────────────
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hov, setHov] = useState(0);
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(i => (
        <button key={i} type="button"
          onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(0)}
          onClick={() => onChange(i)}
          className="focus:outline-none transition-transform hover:scale-110">
          <Star size={26} className={`transition-colors ${i <= (hov || value) ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
        </button>
      ))}
    </div>
  );
}

const RATING_ENTITIES = [
  { key: "product",   label: "المنتج",    sub: "جودة المنتج وخصائصه",       icon: Package,   rKey: "product_rating",   cKey: "product_comment",   nKey: null },
  { key: "driver",    label: "السائق",    sub: "احترافية وسلوك السائق",      icon: Truck,     rKey: "driver_rating",    cKey: "driver_comment",    nKey: "driver_name" },
  { key: "rep",       label: "المندوب",   sub: "خدمة ومتابعة المندوب",       icon: Users,     rKey: "rep_rating",       cKey: "rep_comment",       nKey: "rep_name" },
  { key: "warehouse", label: "المستودع",  sub: "سرعة التجهيز والتغليف",      icon: Warehouse, rKey: "warehouse_rating", cKey: "warehouse_comment", nKey: null },
  { key: "company",   label: "الشركة",    sub: "تقييمك العام لـ MKGH",        icon: Building2, rKey: "company_rating",  cKey: "company_comment",   nKey: null },
] as const;

type RatingForm = {
  product_rating: number; product_comment: string;
  driver_rating: number;  driver_comment: string; driver_name: string;
  rep_rating: number;     rep_comment: string;    rep_name: string;
  warehouse_rating: number; warehouse_comment: string;
  company_rating: number; company_comment: string;
};
const emptyRating = (): RatingForm => ({
  product_rating: 0, product_comment: "",
  driver_rating: 0,  driver_comment: "",  driver_name: "",
  rep_rating: 0,     rep_comment: "",     rep_name: "",
  warehouse_rating: 0, warehouse_comment: "",
  company_rating: 0, company_comment: "",
});

export default function MyOrders() {
  const { user }   = useAuth();
  const [orders,   setOrders]  = useState<Order[]>([]);
  const [loading,  setLoading] = useState(true);
  const [search,   setSearch]  = useRememberedState("customer-orders-search", "");
  const [tabFilter,setTabFilter] = useRememberedState("customer-orders-status-filter", "all");
  const [, navigate] = useLocation();

  // Cancel
  const [cancelId,   setCancelId]   = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Rating modal
  const [ratingOrder, setRatingOrder] = useState<Order | null>(null);
  const [ratingForm,  setRatingForm]  = useState<RatingForm>(emptyRating());
  const [ratingPage,  setRatingPage]  = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingDone,  setRatingDone]  = useState(false);
  const [ratedIds,    setRatedIds]    = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    fetch(`/api/workflow/orders?role=customer&phone=${user.phone}`)
      .then(r => r.json())
      .then(d => {
        const list: Order[] = Array.isArray(d) ? d : [];
        setOrders(list);
        // Check which delivered orders are already rated
        const delivered = list.filter(o => o.stage === "delivered").map(o => o.id);
        Promise.all(delivered.map(id =>
          fetch(`/api/order-ratings/check/${id}`).then(r => r.json()).then((j: {rated:boolean}) => j.rated ? id : null)
        )).then(results => {
          setRatedIds(new Set(results.filter((id): id is number => id !== null)));
        });
      })
      .finally(() => setLoading(false));
  }, [user]);
  useEffect(load, [load]);

  // Draft submit + delete
  const [submittingDraft, setSubmittingDraft] = useState<number | null>(null);
  const [deletingDraft,   setDeletingDraft]   = useState<number | null>(null);

  const doSubmitDraft = async (orderId: number) => {
    setSubmittingDraft(orderId);
    try {
      const res = await fetch(`/api/workflow/orders/${orderId}/submit-draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: user?.phone }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "خطأ في الإرسال"); }
      else load();
    } finally { setSubmittingDraft(null); }
  };

  const doDeleteDraft = async (orderId: number) => {
    setDeletingDraft(orderId);
    try {
      await fetch(`/api/workflow/orders/${orderId}/cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caller_phone: user?.phone, reason: "حذف المسودة" }),
      });
      load();
    } finally { setDeletingDraft(null); }
  };

  const stats = useMemo(() => ({
    total:     orders.length,
    active:    orders.filter(o => !["delivered","cancelled","draft"].includes(o.stage)).length,
    delivered: orders.filter(o => o.stage === "delivered").length,
    drafts:    orders.filter(o => o.stage === "draft").length,
    revenue:   orders.filter(o => o.stage !== "cancelled").reduce((s, o) => s + (o.total_with_vat || 0), 0),
  }), [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (tabFilter === "active")    list = list.filter(o => !["delivered","cancelled","draft"].includes(o.stage));
    if (tabFilter === "draft")     list = list.filter(o => o.stage === "draft");
    if (tabFilter === "delivered") list = list.filter(o => o.stage === "delivered");
    if (tabFilter === "cancelled") list = list.filter(o => o.stage === "cancelled");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.order_number.toLowerCase().includes(q) ||
        o.product_name.toLowerCase().includes(q) ||
        (o.delivery_location || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, tabFilter, search]);

  const doCancel = async (orderId: number) => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/workflow/orders/${orderId}/cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caller_phone: user?.phone, reason: "إلغاء بواسطة العميل" }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || "حدث خطأ"); } else { load(); }
    } finally { setCancelling(false); setCancelId(null); }
  };

  const openRating = (order: Order) => {
    setRatingOrder(order);
    setRatingForm(emptyRating());
    setRatingPage(0);
    setRatingDone(false);
  };

  const submitRating = async () => {
    if (!ratingOrder || !user) return;
    setRatingSubmitting(true);
    try {
      const res = await fetch("/api/order-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: ratingOrder.id, customer_phone: user.phone, ...ratingForm }),
      });
      if (res.ok) {
        setRatingDone(true);
        setRatedIds(prev => new Set(prev).add(ratingOrder.id));
      } else {
        const d = await res.json();
        alert(d.error || "خطأ في الإرسال");
      }
    } finally { setRatingSubmitting(false); }
  };

  const printReceipt = useCallback((order: Order) => {
    const receiptHtml = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>إيصال - ${order.order_number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#fff; color:#1a1a1a; }
  .receipt { max-width:420px; margin:0 auto; padding:32px 24px; }
  .header { text-align:center; border-bottom:2px solid #103c68; padding-bottom:16px; margin-bottom:16px; }
  .company { font-size:22px; font-weight:900; color:#103c68; }
  .subtitle { font-size:12px; color:#444; font-weight:600; margin-top:2px; }
  .title { font-size:15px; font-weight:700; color:#333; margin-top:8px; background:#f0f5fb; display:inline-block; padding:4px 12px; border-radius:20px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px; }
  .meta-item { background:#f7f8fa; border-radius:10px; padding:10px; }
  .meta-label { font-size:11px; color:#555; font-weight:700; margin-bottom:2px; text-transform:uppercase; letter-spacing:.5px; }
  .meta-value { font-size:12px; font-weight:700; color:#222; }
  .section-title { font-size:12px; font-weight:700; color:#103c68; text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  th { background:#103c68; color:#fff; font-size:11px; padding:8px 10px; text-align:right; font-weight:700; }
  td { padding:8px 10px; font-size:12px; border-bottom:1px solid #f0f0f0; }
  .total-row { background:#f0f5fb; font-weight:900; font-size:14px; color:#103c68; }
  .total-row td { padding:12px 10px; }
  .barcode { text-align:center; margin:16px 0; padding:12px; border:1.5px dashed #ccc; border-radius:10px; }
  .bars { display:flex; align-items:flex-end; justify-content:center; gap:1px; height:40px; margin-bottom:4px; }
  .bar { background:#1a1a1a; border-radius:1px; }
  .barcode-num { font-family:monospace; font-size:11px; color:#555; font-weight:600; letter-spacing:1px; }
  .footer { text-align:center; font-size:11px; color:#555; border-top:1px dashed #e0e0e0; padding-top:12px; margin-top:12px; }
  .wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.06;width:65%;pointer-events:none;z-index:-1}
  @page{size:A4 portrait;margin:15mm}html{width:210mm}body{width:210mm;margin:0 auto;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{button{display:none}}
</style>
</head>
<body>
<img class="wm" src="/logo.png" alt="" />
<div class="receipt">
  <div class="header">
    <img src="/jefer-logo-new.png" alt="JEFER" style="height:60px;object-fit:contain;display:block;margin:0 auto 4px"/>
    <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:#103c68;text-align:center;margin-bottom:4px">MKGH</div>
    <div class="subtitle">شركة جيفر التجارية · مواد البناء</div>
    <div class="title">فاتورة ضريبية</div>
  </div>
  <div class="meta">
    <div class="meta-item"><div class="meta-label">رقم الفاتورة</div><div class="meta-value" style="font-family:monospace;font-size:10px">${order.order_number}</div></div>
    <div class="meta-item"><div class="meta-label">تاريخ الإصدار</div><div class="meta-value">${new Date().toLocaleDateString("ar-SA")}</div></div>
    <div class="meta-item"><div class="meta-label">طريقة الدفع</div><div class="meta-value">${order.payment_method === "cash" ? "نقداً" : order.payment_method === "card" ? "بطاقة" : "تحويل بنكي"}</div></div>
    <div class="meta-item"><div class="meta-label">الحالة</div><div class="meta-value" style="color:#22c55e">مسلّم ✓</div></div>
  </div>
  ${order.delivery_location ? `<div style="background:#f7f8fa;border-radius:10px;padding:10px;margin-bottom:16px;"><div class="meta-label">موقع التسليم</div><div style="font-size:12px;font-weight:600;margin-top:2px">${order.delivery_location}</div></div>` : ""}
  <div class="section-title">تفاصيل الطلب</div>
  <table>
    <thead><tr><th>المنتج</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
    <tbody>
      <tr><td>${order.product_name}</td><td>${order.quantity} ${order.unit}</td><td>${((order.total_with_vat || 0) / 1.15).toFixed(2)} ر.س</td></tr>
      <tr style="background:#fafafa"><td colspan="2" style="color:#888">ضريبة القيمة المضافة (15%)</td><td style="font-weight:700">${((order.total_with_vat || 0) * 0.15 / 1.15).toFixed(2)} ر.س</td></tr>
    </tbody>
    <tfoot><tr class="total-row"><td colspan="2">الإجمالي شامل الضريبة</td><td>${(order.total_with_vat || 0).toFixed(2)} ر.س</td></tr></tfoot>
  </table>
  <div class="barcode">
    <div class="bars">${order.order_number.split("").map((c, i) => { const h = 15 + (c.charCodeAt(0) % 20); const w = i % 3 === 0 ? 3 : i % 3 === 1 ? 1 : 2; return `<div class="bar" style="width:${w}px;height:${h}px"></div>`; }).join("")}</div>
    <div class="barcode-num">${order.order_number}</div>
  </div>
  <div class="footer">هذه الفاتورة صادرة إلكترونياً وسارية المفعول · ضريبة القيمة المضافة 15% · المملكة العربية السعودية<br/>تاريخ الطباعة: ${new Date().toLocaleString("ar-SA")}</div>
</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
    const w = window.open("", "_blank", "width=500,height=700");
    if (w) { w.document.write(receiptHtml); w.document.close(); }
  }, []);

  const canCancel = (o: Order) => {
    const cancelStages = ["pending", "pending_cash_approval", "payment_confirmed"];
    return cancelStages.includes(o.stage) && !o.vehicle_plate;
  };
  const hasVehicleNoDeliver = (o: Order) => !!o.vehicle_plate && !["delivered","cancelled"].includes(o.stage);

  const currentEntity = RATING_ENTITIES[ratingPage];

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {/* ── Cancel confirmation dialog ── */}
      {cancelId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5 text-center">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Ban size={28} className="text-red-500" />
            </div>
            <h3 className="font-black text-gray-900 mb-1">إلغاء الطلب</h3>
            <p className="text-sm text-gray-500 mb-5">هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex gap-2">
              <button onClick={() => setCancelId(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                تراجع
              </button>
              <button onClick={() => doCancel(cancelId)} disabled={cancelling}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-1">
                {cancelling ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Ban size={14} />}
                تأكيد الإلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 360° Rating Modal ── */}
      {ratingOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {ratingDone ? (
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={40} className="text-green-500" />
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-2">شكراً على تقييمك!</h3>
                <p className="text-gray-500 text-sm mb-6">تقييمك يساعدنا على تحسين خدمتنا لك</p>
                <button onClick={() => setRatingOrder(null)}
                  className="w-full bg-[#103c68] text-white py-3.5 rounded-xl font-bold hover:bg-[#0d2e50] transition-colors">
                  إغلاق
                </button>
              </div>
            ) : (
              <div className="p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-black text-gray-900">قيّم تجربتك</h3>
                    <p className="text-xs text-gray-400 font-mono">{ratingOrder.order_number}</p>
                  </div>
                  <button onClick={() => setRatingOrder(null)} className="p-2 hover:bg-gray-100 rounded-xl">
                    <X size={18} className="text-gray-400" />
                  </button>
                </div>

                {/* Progress dots */}
                <div className="flex gap-1.5 mb-5">
                  {RATING_ENTITIES.map((e, i) => (
                    <div key={e.key}
                      className={`flex-1 h-1.5 rounded-full transition-all ${i < ratingPage ? "bg-[#103c68]" : i === ratingPage ? "bg-amber-400" : "bg-gray-100"}`}
                    />
                  ))}
                </div>

                {/* Current entity */}
                {currentEntity && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-10 h-10 bg-[#103c68]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <currentEntity.icon size={18} className="text-[#103c68]" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">{currentEntity.label}</div>
                        <div className="text-xs text-gray-500">{currentEntity.sub}</div>
                      </div>
                      <div className="mr-auto text-xs text-gray-400">{ratingPage + 1} / {RATING_ENTITIES.length}</div>
                    </div>

                    {/* Star picker */}
                    <div className="flex flex-col items-center gap-2 py-3">
                      <StarPicker
                        value={(ratingForm as unknown as Record<string, number>)[currentEntity.rKey] || 0}
                        onChange={v => setRatingForm(f => ({ ...f, [currentEntity.rKey]: v }))}
                      />
                      <div className="text-xs text-gray-400">
                        {(() => {
                          const v = (ratingForm as unknown as Record<string, number>)[currentEntity.rKey] || 0;
                          return v === 0 ? "اختر تقييمك" : v === 1 ? "ضعيف" : v === 2 ? "مقبول" : v === 3 ? "جيد" : v === 4 ? "جيد جداً" : "ممتاز!";
                        })()}
                      </div>
                    </div>

                    {/* Optional comment */}
                    <textarea
                      rows={2}
                      placeholder={`ملاحظات على ${currentEntity.label} (اختياري)`}
                      value={(ratingForm as unknown as Record<string, string>)[currentEntity.cKey] || ""}
                      onChange={e => setRatingForm(f => ({ ...f, [currentEntity.cKey]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                    />
                  </div>
                )}

                {/* Navigation */}
                <div className="flex gap-3 mt-5">
                  {ratingPage > 0 && (
                    <button onClick={() => setRatingPage(p => p - 1)}
                      className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                      السابق
                    </button>
                  )}
                  {ratingPage < RATING_ENTITIES.length - 1 ? (
                    <button onClick={() => setRatingPage(p => p + 1)}
                      disabled={!(ratingForm as unknown as Record<string, number>)[currentEntity.rKey]}
                      className="flex-1 py-3 bg-[#103c68] text-white rounded-xl text-sm font-bold hover:bg-[#0d2e50] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      التالي
                    </button>
                  ) : (
                    <button onClick={submitRating} disabled={ratingSubmitting || !(ratingForm as unknown as Record<string, number>)[currentEntity.rKey]}
                      className="flex-1 py-3 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-40 flex items-center justify-center gap-2">
                      {ratingSubmitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={15} />}
                      إرسال التقييم
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

          <div className="relative mb-2">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input placeholder="ابحث بالرقم أو المنتج..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pr-9 pl-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
          </div>

          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {FILTER_TABS.map(t => (
              <button key={t.key} onClick={() => setTabFilter(t.key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${tabFilter === t.key ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {/* Stats */}
        {!search && tabFilter === "all" && orders.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: ShoppingCart, label: "نشطة",     val: stats.active,    color: "bg-blue-50   text-blue-600"   },
              { icon: CheckCircle,  label: "مسلّمة",    val: stats.delivered, color: "bg-green-50  text-green-600"  },
              { icon: FileText,     label: "مسودات",   val: stats.drafts,    color: "bg-gray-100  text-gray-500"   },
              { icon: Banknote,     label: "إجمالي",   val:`${(stats.revenue/1000).toFixed(1)}k`, color:"bg-[#103c68]/5 text-[#103c68]"},
            ].map(({ icon: Icon, label, val, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-2.5 text-center shadow-sm">
                <div className={`w-7 h-7 rounded-xl ${color} flex items-center justify-center mx-auto mb-1`}><Icon size={12} /></div>
                <div className="font-black text-gray-900 text-sm leading-none">{val}</div>
                <div className="text-xs text-gray-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                <div className="flex justify-between mb-3"><div className="h-3 bg-gray-100 rounded w-24" /><div className="h-3 bg-gray-100 rounded w-16" /></div>
                <div className="h-4 bg-gray-100 rounded w-40 mb-2" /><div className="h-2 bg-gray-100 rounded-full w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Package size={48} className="text-gray-200 mx-auto mb-3" />
            <p className="font-semibold text-gray-500">{orders.length === 0 ? "لا توجد طلبات بعد" : "لا توجد نتائج"}</p>
            {orders.length === 0 && (
              <button onClick={() => navigate("/")}
                className="mt-4 bg-[#103c68] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#0d2e50] transition-colors">
                اطلب الآن
              </button>
            )}
          </div>
        )}

        {/* Order cards */}
        {!loading && filtered.map(order => {
          const stageInfo = STAGE_MAP[order.stage];
          const progressIdx = PROGRESS_STAGES.findIndex(s => s.key === order.stage);
          const pct = order.stage === "cancelled" ? 0 : order.stage === "pending_cash_approval" ? 10 :
            Math.round(((progressIdx + 1) / PROGRESS_STAGES.length) * 100);
          const Icon = stageInfo?.icon ?? Package;
          const isDelivered = order.stage === "delivered";
          const alreadyRated = ratedIds.has(order.id);
          const canCancelOrder = canCancel(order);
          const hasVehicle = hasVehicleNoDeliver(order);

          return (
            <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md hover:border-[#103c68]/20 transition-all group"
              onClick={() => navigate(`/my-orders/${order.id}`)}>

              {/* Stage color strip */}
              <div className="h-1 bg-gray-100 w-full">
                <div className={`h-1 transition-all ${order.stage === "cancelled" ? "bg-red-300" : order.stage === "pending_cash_approval" ? "bg-orange-400" : "bg-gradient-to-l from-[#0eb5cb] to-[#103c68]"}`}
                  style={{ width: `${pct}%` }} />
              </div>

              <div className="p-4">
                {/* Header row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-bold text-[#103c68]">{order.order_number}</div>
                    <div className="font-bold text-gray-900 mt-0.5 leading-tight">{order.product_name}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-1.5">
                      <span>{order.quantity} {order.unit}</span>
                      {order.packaging_type && order.packaging_type !== "معبأ" && (
                        <span className="bg-blue-50 text-blue-600 px-1.5 rounded text-xs">{order.packaging_type}</span>
                      )}
                      {order.delivery_location && <span>· {order.delivery_location}</span>}
                    </div>
                  </div>
                  <div className="text-left flex-shrink-0 mr-3">
                    <div className="font-black text-gray-900">{order.total_with_vat?.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">ر.س</div>
                    <ChevronLeft size={14} className="text-gray-300 group-hover:text-[#103c68] mt-1 mr-auto transition-colors" />
                  </div>
                </div>

                {/* Stage badge + action buttons */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className={`inline-flex items-center gap-1.5 border text-xs px-2.5 py-1 rounded-full font-semibold ${stageInfo?.color ?? "text-gray-600 bg-gray-50 border-gray-200"}`}>
                    <Icon size={11} />
                    {stageInfo?.label ?? order.stage}
                  </div>

                  <div className="flex gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
                    {/* Draft: submit + delete */}
                    {order.stage === "draft" && (
                      <>
                        <button onClick={() => doSubmitDraft(order.id)} disabled={submittingDraft === order.id}
                          className="text-xs text-white bg-[#103c68] hover:bg-[#0d2e50] border border-[#103c68] px-3 py-1 rounded-full font-bold flex items-center gap-1 transition-colors disabled:opacity-60">
                          {submittingDraft === order.id
                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Send size={10} />
                          }
                          إرسال الطلب
                        </button>
                        <button onClick={() => doDeleteDraft(order.id)} disabled={deletingDraft === order.id}
                          className="text-xs text-red-500 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-full font-medium flex items-center gap-1 transition-colors disabled:opacity-60">
                          <Ban size={10} /> حذف المسودة
                        </button>
                      </>
                    )}

                    {/* Cancel button */}
                    {canCancelOrder && (
                      <button onClick={() => setCancelId(order.id)}
                        className="text-xs text-red-500 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-full font-medium flex items-center gap-1 transition-colors">
                        <Ban size={10} /> إلغاء
                      </button>
                    )}

                    {/* Vehicle-assigned: cannot cancel directly */}
                    {hasVehicle && (
                      <span className="text-xs text-gray-400 border border-gray-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                        <MessageCircle size={10} /> تواصل مع المندوب للإلغاء
                      </span>
                    )}

                    {/* Cash pending */}
                    {order.stage === "pending_cash_approval" && (
                      <span className="text-xs text-orange-600 border border-orange-200 bg-orange-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                        <Clock size={10} /> انتظار موافقة الكاش
                      </span>
                    )}

                    {/* Rate button */}
                    {isDelivered && !alreadyRated && (
                      <button onClick={() => openRating(order)}
                        className="text-xs text-amber-600 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full font-medium flex items-center gap-1 transition-colors">
                        <Star size={10} className="fill-amber-400" /> قيّم التجربة
                      </button>
                    )}
                    {isDelivered && alreadyRated && (
                      <span className="text-xs text-green-600 border border-green-200 bg-green-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle size={10} /> تم التقييم
                      </span>
                    )}

                    {/* VAT Invoice / Receipt download */}
                    {isDelivered && (
                      <button onClick={() => printReceipt(order)}
                        className="text-xs text-[#103c68] border border-[#103c68]/30 bg-[#103c68]/5 hover:bg-[#103c68]/10 px-2.5 py-1 rounded-full font-medium flex items-center gap-1 transition-colors">
                        <Download size={10} /> فاتورة ضريبية
                      </button>
                    )}
                  </div>
                </div>

                {/* Driver contact — visible once loaded */}
                {["loaded","delivered"].includes(order.stage) && order.driver_phone && (
                  <div className="mt-2 bg-cyan-50 border border-cyan-200 rounded-xl px-3 py-2 space-y-2" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Truck size={13} className="text-cyan-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-cyan-800 truncate">
                            {order.driver_name || "السائق"}{order.vehicle_plate ? ` · ${order.vehicle_plate}` : ""}
                          </p>
                          <p className="text-xs font-mono text-cyan-700">{order.driver_phone}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <a href={`tel:${order.driver_phone}`}
                          className="bg-cyan-100 hover:bg-cyan-200 text-cyan-700 text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                          📞
                        </a>
                        <a href={`https://wa.me/966${order.driver_phone.replace(/^0/, "")}`}
                          target="_blank" rel="noopener noreferrer"
                          className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                          <MessageCircle size={11} /> واتساب
                        </a>
                        {order.driver_lat && order.driver_lng && (
                          <a href={`https://www.google.com/maps?q=${order.driver_lat},${order.driver_lng}`}
                            target="_blank" rel="noopener noreferrer"
                            className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                            📍 موقعه
                          </a>
                        )}
                      </div>
                    </div>
                    {order.driver_lat && order.driver_lng && order.driver_location_updated_at && (
                      <p className="text-[10px] text-cyan-600 text-center">
                        آخر تحديث موقع: {new Date(order.driver_location_updated_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                )}

                {/* Progress bar (non-cancelled, non-cash-pending, non-draft) */}
                {!["cancelled","pending_cash_approval","draft"].includes(order.stage) && (
                  <div className="flex items-center gap-1 mt-3">
                    {PROGRESS_STAGES.map((s, i) => {
                      const done = i <= progressIdx;
                      const curr = i === progressIdx;
                      return (
                        <div key={s.key}
                          className={`flex-1 h-1.5 rounded-full transition-all ${done ? (curr ? "bg-[#0eb5cb]" : "bg-[#103c68]/40") : "bg-gray-100"}`} />
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
