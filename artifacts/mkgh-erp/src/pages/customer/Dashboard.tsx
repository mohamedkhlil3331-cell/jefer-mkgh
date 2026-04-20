import { motion } from "framer-motion";
import { Package, Clock, CheckCircle, TrendingUp, ArrowRight } from "lucide-react";
import { orders } from "../../data.js";
import { StatusBadge } from "../../components/StatusBadge";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function CustomerDashboard() {
  const myOrders = orders.slice(0, 4);
  const active = orders.filter(o => o.status === "In Transit").length;
  const pending = orders.filter(o => o.status === "Pending").length;
  const delivered = orders.filter(o => o.status === "Delivered").length;

  const stats = [
    { label: "Active Shipments", value: active, icon: Package, color: "bg-blue-50 text-blue-600 border-blue-100" },
    { label: "Pending Orders", value: pending, icon: Clock, color: "bg-amber-50 text-amber-600 border-amber-100" },
    { label: "Delivered", value: delivered, icon: CheckCircle, color: "bg-green-50 text-green-600 border-green-100" },
    { label: "Total Orders", value: orders.length, icon: TrendingUp, color: "bg-purple-50 text-purple-600 border-purple-100" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">My Shipments Overview</h2>
        <p className="text-muted-foreground text-sm mt-1">Track and manage your logistics orders</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            custom={i}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="bg-card border border-card-border rounded-2xl p-5 shadow-xs mkgh-card-shine"
          >
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Recent Orders */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground text-sm">Recent Orders</h3>
          <button className="text-xs text-[#f97316] font-medium flex items-center gap-1 hover:gap-2 transition-all">View all <ArrowRight className="w-3 h-3" /></button>
        </div>
        <div className="divide-y divide-border">
          {myOrders.map((order) => (
            <div key={order.id} className="px-6 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
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
