import { motion } from "framer-motion";
import { Truck, Users, AlertTriangle, Activity, ArrowRight } from "lucide-react";
import { useAppData } from "../../context/AppDataContext";
import { StatusBadge } from "../../components/StatusBadge";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function SupervisorDashboard() {
  const { vehicles, drivers, orders } = useAppData();

  const activeVehicles  = vehicles.filter((v) => v.status === "On-Trip" || v.status === "Available").length;
  const maintenanceCount = vehicles.filter((v) => v.status === "Maintenance").length;
  const onDutyDrivers   = drivers.filter((d) => d.status === "On Duty").length;
  const activeOrders    = orders.filter((o) => o.status === "In Transit" || o.status === "Processing").length;

  const stats = [
    { label: "Active Vehicles", value: activeVehicles, sub: `of ${vehicles.length} total`, color: "text-emerald-400 bg-emerald-500/10", icon: Truck },
    { label: "In Maintenance", value: maintenanceCount, sub: "Needs attention", color: "text-red-400 bg-red-500/10", icon: AlertTriangle },
    { label: "Drivers On Duty", value: onDutyDrivers, sub: `of ${drivers.length} registered`, color: "text-blue-400 bg-blue-500/10", icon: Users },
    { label: "Active Orders", value: activeOrders, sub: "In transit / processing", color: "text-[#f97316] bg-orange-500/10", icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Operations Overview</h2>
        <p className="text-muted-foreground text-sm mt-1">Fleet and driver status at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} custom={i} initial="hidden" animate="show" variants={fadeUp}
            className="glass-card rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{s.sub}</p>
            <p className="text-foreground text-xs font-medium mt-1">{s.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass-card rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
            <h3 className="font-semibold text-foreground text-sm">Fleet Status</h3>
            <button className="text-xs text-[#f97316] font-medium flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></button>
          </div>
          <div className="divide-y divide-white/5">
            {vehicles.slice(0, 4).map((v) => (
              <div key={v.plateNo} className="px-5 py-3.5 flex items-center gap-3 hover:bg-white/3 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <Truck className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{v.plateNo}</p>
                  <p className="text-xs text-muted-foreground truncate">{v.currentDriver}</p>
                </div>
                <StatusBadge status={v.status} size="sm" />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="glass-card rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
            <h3 className="font-semibold text-foreground text-sm">Driver Roster</h3>
            <button className="text-xs text-[#f97316] font-medium flex items-center gap-1">Manage <ArrowRight className="w-3 h-3" /></button>
          </div>
          <div className="divide-y divide-white/5">
            {drivers.slice(0, 4).map((d) => (
              <div key={d.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-white/3 transition-colors">
                <div className="w-8 h-8 rounded-full bg-[#f97316]/15 flex items-center justify-center text-[#f97316] text-xs font-bold flex-shrink-0">
                  {d.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.vehicle}</p>
                </div>
                <StatusBadge status={d.status} size="sm" />
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
