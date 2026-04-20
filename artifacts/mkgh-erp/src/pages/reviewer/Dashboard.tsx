import { motion } from "framer-motion";
import { ClipboardList, Boxes, TrendingUp, AlertTriangle, ArrowRight, MessageCircle } from "lucide-react";
import { orders, inventory } from "../../data.js";
import { StatusBadge } from "../../components/StatusBadge";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function ReviewerDashboard() {
  const pendingOrders = orders.filter(o => o.status === "Pending").length;
  const lowStock = inventory.filter(i => i.stockLevel < i.minLevel).length;
  const todayOrders = orders.filter(o => o.date === "2026-04-20").length;
  const delivered = orders.filter(o => o.status === "Delivered").length;

  const stats = [
    { label: "Pending Review", value: pendingOrders, color: "bg-amber-50 text-amber-600 border-amber-100", icon: ClipboardList },
    { label: "Low Stock Items", value: lowStock, color: "bg-red-50 text-red-600 border-red-100", icon: AlertTriangle },
    { label: "Orders Today", value: todayOrders, color: "bg-blue-50 text-blue-600 border-blue-100", icon: TrendingUp },
    { label: "Delivered", value: delivered, color: "bg-green-50 text-green-600 border-green-100", icon: Boxes },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Reviewer Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-1">Operations summary and quick actions</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} custom={i} initial="hidden" animate="show" variants={fadeUp}
            className="bg-card border border-card-border rounded-2xl p-5 shadow-xs mkgh-card-shine">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* WhatsApp */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-2xl">
        <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-800">Customer Communication</p>
          <p className="text-xs text-green-700">Contact customers directly via WhatsApp for order updates</p>
        </div>
        <a href="https://wa.me/966500000000" target="_blank" rel="noopener noreferrer"
          className="flex-shrink-0 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
          Open WhatsApp
        </a>
      </motion.div>

      {/* Recent orders to review */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
        className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="font-semibold text-foreground text-sm">Orders Needing Review</h3>
          <button className="text-xs text-[#f97316] font-medium flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></button>
        </div>
        <div className="divide-y divide-border">
          {orders.filter(o => o.status === "Pending").slice(0, 4).map(order => (
            <div key={order.id} className="px-5 py-4 flex items-center gap-3 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{order.id} — {order.customerName}</p>
                <p className="text-xs text-muted-foreground">{order.origin} → {order.destination} · {order.vehicleType}</p>
              </div>
              <StatusBadge status={order.status} size="sm" />
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
