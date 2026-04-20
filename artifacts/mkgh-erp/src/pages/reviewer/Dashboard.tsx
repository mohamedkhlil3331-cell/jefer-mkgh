import { motion } from "framer-motion";
import { ClipboardList, Boxes, TrendingUp, AlertTriangle, ArrowRight, MessageCircle } from "lucide-react";
import { useAppData } from "../../context/AppDataContext";
import { StatusBadge } from "../../components/StatusBadge";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function ReviewerDashboard() {
  const { orders, stock } = useAppData();

  const pendingOrders = orders.filter((o) => o.status === "Pending").length;
  const lowStock      = stock.filter((s) => s.quantity <= s.minLevel).length;
  const todayOrders   = orders.filter((o) => o.date === "2026-04-20").length;
  const delivered     = orders.filter((o) => o.status === "Delivered").length;

  const stats = [
    { label: "Pending Review", value: pendingOrders, color: "text-amber-400 bg-amber-500/10", icon: ClipboardList },
    { label: "Low Stock Items", value: lowStock, color: "text-red-400 bg-red-500/10", icon: AlertTriangle },
    { label: "Orders Today", value: todayOrders, color: "text-blue-400 bg-blue-500/10", icon: TrendingUp },
    { label: "Delivered", value: delivered, color: "text-emerald-400 bg-emerald-500/10", icon: Boxes },
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
            className="glass-card rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="flex items-center gap-4 p-4 bg-[#25D366]/8 border border-[#25D366]/20 rounded-2xl">
        <div className="w-10 h-10 rounded-xl bg-[#25D366]/15 flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-5 h-5 text-[#25D366]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Customer Communication</p>
          <p className="text-xs text-muted-foreground">Contact customers directly via WhatsApp for order updates</p>
        </div>
        <a href="https://wa.me/966500000000" target="_blank" rel="noopener noreferrer"
          className="flex-shrink-0 px-4 py-2 bg-[#25D366] hover:bg-[#1ebe58] text-white text-xs font-semibold rounded-xl transition-colors">
          Open WhatsApp
        </a>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
        className="glass-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
          <h3 className="font-semibold text-foreground text-sm">Orders Needing Review</h3>
          <button className="text-xs text-[#f97316] font-medium flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></button>
        </div>
        <div className="divide-y divide-white/5">
          {orders.filter((o) => o.status === "Pending").slice(0, 4).map((order) => (
            <div key={order.id} className="px-5 py-4 flex items-center gap-3 hover:bg-white/3 transition-colors">
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
