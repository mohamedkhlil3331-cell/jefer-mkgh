import { motion } from "framer-motion";
import { BarChart3, TrendingUp, Package, Truck, DollarSign } from "lucide-react";
import { useAppData } from "../context/AppDataContext";

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 text-right shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-white/6 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className={`h-full rounded-full ${color} flex items-center justify-end pr-2`}
        >
          <span className="text-[10px] text-white font-bold">{value}</span>
        </motion.div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const { orders, vehicles, drivers } = useAppData();

  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  const vehicleStatusCounts = vehicles.reduce<Record<string, number>>((acc, v) => {
    acc[v.status] = (acc[v.status] ?? 0) + 1;
    return acc;
  }, {});

  const totalRevenue = orders
    .filter((o) => o.status === "Delivered")
    .reduce((sum, o) => sum + o.payment.amount, 0);

  const activeDrivers = drivers.filter((d) => d.status === "On Duty").length;

  const stats = [
    { label: "Total Orders", value: orders.length, icon: Package, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Fleet Active", value: activeDrivers, icon: Truck, color: "text-violet-400", bg: "bg-violet-500/10" },
    { label: "Revenue (SAR)", value: totalRevenue.toLocaleString(), icon: DollarSign, color: "text-[#f97316]", bg: "bg-orange-500/10" },
    { label: "Delivered", value: statusCounts["Delivered"] ?? 0, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  ];

  const maxOrders = Math.max(...Object.values(statusCounts), 1);
  const maxVehicles = Math.max(...Object.values(vehicleStatusCounts), 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Analytics</h2>
        <p className="text-muted-foreground text-sm mt-1">Operational performance overview</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }} className="glass-card rounded-2xl p-4">
            <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
              <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Order status breakdown */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-foreground text-sm">Order Status Breakdown</h3>
        </div>
        <div className="space-y-3">
          {Object.entries(statusCounts).map(([status, count]) => (
            <Bar key={status} label={status} value={count} max={maxOrders}
              color={
                status === "Delivered" ? "bg-emerald-500" :
                status === "In Transit" ? "bg-blue-500" :
                status === "Processing" ? "bg-violet-500" :
                status === "Pending" ? "bg-amber-500" : "bg-red-500"
              }
            />
          ))}
        </div>
      </div>

      {/* Fleet utilization */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <Truck className="w-4 h-4 text-violet-400" />
          <h3 className="font-semibold text-foreground text-sm">Fleet Utilization</h3>
        </div>
        <div className="space-y-3">
          {Object.entries(vehicleStatusCounts).map(([status, count]) => (
            <Bar key={status} label={status} value={count} max={maxVehicles}
              color={
                status === "On-Trip" ? "bg-blue-500" :
                status === "Available" ? "bg-emerald-500" :
                status === "Maintenance" ? "bg-red-500" : "bg-slate-500"
              }
            />
          ))}
        </div>
      </div>

      {/* Top drivers */}
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-semibold text-foreground text-sm mb-4">Top Drivers by Trips</h3>
        <div className="space-y-3">
          {[...drivers].sort((a, b) => b.trips - a.trips).slice(0, 5).map((d, i) => (
            <div key={d.id} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
              <div className="w-7 h-7 rounded-full bg-[#f97316]/15 flex items-center justify-center text-xs font-bold text-[#f97316] flex-shrink-0">
                {d.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.truckType}</p>
              </div>
              <span className="text-sm font-bold text-foreground">{d.trips} trips</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
