import { motion } from "framer-motion";
import { Truck, Users, AlertTriangle, Activity, ArrowRight } from "lucide-react";
import { vehicles, drivers, orders } from "../../data.js";
import { StatusBadge } from "../../components/StatusBadge";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function SupervisorDashboard() {
  const activeVehicles = vehicles.filter(v => v.status === "Active" || v.status === "In Transit").length;
  const maintenanceCount = vehicles.filter(v => v.status === "Maintenance").length;
  const onDutyDrivers = drivers.filter(d => d.status === "On Duty").length;
  const activeOrders = orders.filter(o => o.status === "In Transit" || o.status === "Processing").length;

  const stats = [
    { label: "Active Vehicles", value: activeVehicles, sub: `of ${vehicles.length} total`, color: "bg-green-50 text-green-600 border-green-100", icon: Truck },
    { label: "In Maintenance", value: maintenanceCount, sub: "Needs attention", color: "bg-red-50 text-red-600 border-red-100", icon: AlertTriangle },
    { label: "Drivers On Duty", value: onDutyDrivers, sub: `of ${drivers.length} registered`, color: "bg-blue-50 text-blue-600 border-blue-100", icon: Users },
    { label: "Active Orders", value: activeOrders, sub: "In transit / processing", color: "bg-orange-50 text-orange-600 border-orange-100", icon: Activity },
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
            className="bg-card border border-card-border rounded-2xl p-5 shadow-xs mkgh-card-shine">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{s.sub}</p>
            <p className="text-foreground text-xs font-medium mt-1">{s.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Fleet quick view */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="font-semibold text-foreground text-sm">Fleet Status</h3>
            <button className="text-xs text-[#f97316] font-medium flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></button>
          </div>
          <div className="divide-y divide-border">
            {vehicles.slice(0, 4).map(v => (
              <div key={v.plateNo} className="px-5 py-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
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

        {/* Drivers quick view */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="font-semibold text-foreground text-sm">Driver Roster</h3>
            <button className="text-xs text-[#f97316] font-medium flex items-center gap-1">Manage <ArrowRight className="w-3 h-3" /></button>
          </div>
          <div className="divide-y divide-border">
            {drivers.slice(0, 4).map(d => (
              <div key={d.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
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
