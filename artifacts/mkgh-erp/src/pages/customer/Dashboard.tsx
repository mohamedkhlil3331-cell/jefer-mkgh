import { motion } from "framer-motion";
import { Package, Clock, CheckCircle, TrendingUp, ArrowRight } from "lucide-react";
import { useAppData } from "../../context/AppDataContext";
import { StatusBadge } from "../../components/StatusBadge";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function CustomerDashboard() {
  const { orders } = useAppData();

  const active    = orders.filter((o) => o.status === "In Transit").length;
  const pending   = orders.filter((o) => o.status === "Pending").length;
  const delivered = orders.filter((o) => o.status === "Delivered").length;

  const stats = [
    { label: "Active Shipments", value: active, icon: Package, color: "text-blue-400 bg-blue-500/10" },
    { label: "Pending Orders", value: pending, icon: Clock, color: "text-amber-400 bg-amber-500/10" },
    { label: "Delivered", value: delivered, icon: CheckCircle, color: "text-emerald-400 bg-emerald-500/10" },
    { label: "Total Orders", value: orders.length, icon: TrendingUp, color: "text-violet-400 bg-violet-500/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">My Shipments Overview</h2>
        <p className="text-muted-foreground text-sm mt-1">Track and manage your logistics orders</p>
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

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="glass-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h3 className="font-semibold text-foreground text-sm">Recent Orders</h3>
          <button className="text-xs text-[#f97316] font-medium flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></button>
        </div>
        <div className="divide-y divide-white/5">
          {orders.slice(0, 5).map((order) => (
            <div key={order.id} className="px-6 py-4 flex items-center gap-4 hover:bg-white/3 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                <Package className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{order.id}</p>
                <p className="text-xs text-muted-foreground truncate">{order.origin} → {order.destination}</p>
              </div>
              <div className="text-right hidden sm:block mr-4">
                <p className="text-xs text-muted-foreground">{order.vehicleType}</p>
                <p className="text-xs text-foreground font-medium">{order.weight}</p>
              </div>
              <StatusBadge status={order.status} size="sm" />
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
