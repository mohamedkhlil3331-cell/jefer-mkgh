import { motion } from "framer-motion";
import { BarChart3, TrendingUp, Package, Truck } from "lucide-react";
import { orders, vehicles } from "../data.js";

function SimpleBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold text-foreground">{value}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(value / max) * 100}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

export default function Analytics() {
  const statusCounts = {
    "In Transit": orders.filter(o => o.status === "In Transit").length,
    "Delivered": orders.filter(o => o.status === "Delivered").length,
    "Pending": orders.filter(o => o.status === "Pending").length,
    "Processing": orders.filter(o => o.status === "Processing").length,
    "Cancelled": orders.filter(o => o.status === "Cancelled").length,
  };

  const vehicleStatusCounts = {
    "Active": vehicles.filter(v => v.status === "Active").length,
    "In Transit": vehicles.filter(v => v.status === "In Transit").length,
    "Maintenance": vehicles.filter(v => v.status === "Maintenance").length,
    "Idle": vehicles.filter(v => v.status === "Idle").length,
  };

  const vehicleTypes = {
    "Heavy Truck": orders.filter(o => o.vehicleType === "Heavy Truck").length,
    "Flatbed": orders.filter(o => o.vehicleType === "Flatbed").length,
    "Van": orders.filter(o => o.vehicleType === "Van").length,
    "Refrigerated Truck": orders.filter(o => o.vehicleType === "Refrigerated Truck").length,
  };

  const maxStatus = Math.max(...Object.values(statusCounts));
  const maxVehicle = Math.max(...Object.values(vehicleStatusCounts));
  const maxType = Math.max(...Object.values(vehicleTypes));

  const barColors = ["bg-blue-500", "bg-green-500", "bg-amber-500", "bg-purple-500", "bg-red-500"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Analytics Overview</h2>
        <p className="text-muted-foreground text-sm mt-1">Performance metrics and operational insights</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Orders", value: orders.length, icon: Package, color: "bg-blue-50 text-blue-600 border-blue-100", trend: "+12%" },
          { label: "Delivery Rate", value: "87.5%", icon: TrendingUp, color: "bg-green-50 text-green-600 border-green-100", trend: "+3%" },
          { label: "Active Fleet", value: `${vehicleStatusCounts["Active"] + vehicleStatusCounts["In Transit"]}/${vehicles.length}`, icon: Truck, color: "bg-orange-50 text-orange-600 border-orange-100", trend: "+5%" },
          { label: "Avg. Transit", value: "6.2h", icon: BarChart3, color: "bg-purple-50 text-purple-600 border-purple-100", trend: "-8min" },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-card border border-card-border rounded-2xl p-5 shadow-xs mkgh-card-shine"
          >
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${kpi.color}`}>
              <kpi.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{kpi.label}</p>
            <p className="text-green-600 text-xs font-medium mt-1">{kpi.trend} vs last month</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Order Status breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-card-border rounded-2xl p-5 shadow-xs"
        >
          <h3 className="font-semibold text-foreground text-sm mb-4">Order Status</h3>
          <div className="space-y-3.5">
            {Object.entries(statusCounts).map(([label, value], i) => (
              <SimpleBar key={label} label={label} value={value} max={maxStatus} color={barColors[i]} />
            ))}
          </div>
        </motion.div>

        {/* Fleet status */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-card-border rounded-2xl p-5 shadow-xs"
        >
          <h3 className="font-semibold text-foreground text-sm mb-4">Fleet Status</h3>
          <div className="space-y-3.5">
            {Object.entries(vehicleStatusCounts).map(([label, value], i) => (
              <SimpleBar key={label} label={label} value={value} max={maxVehicle} color={barColors[i]} />
            ))}
          </div>
          {/* Donut-like visual */}
          <div className="mt-5 flex items-center justify-center gap-4 flex-wrap">
            {Object.entries(vehicleStatusCounts).map(([label, value], i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${["bg-blue-500", "bg-green-500", "bg-red-500", "bg-slate-400"][i]}`} />
                <span className="text-xs text-muted-foreground">{label} ({value})</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Vehicle type distribution */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-card border border-card-border rounded-2xl p-5 shadow-xs"
        >
          <h3 className="font-semibold text-foreground text-sm mb-4">Vehicle Type Usage</h3>
          <div className="space-y-3.5">
            {Object.entries(vehicleTypes).map(([label, value], i) => (
              <SimpleBar key={label} label={label} value={value} max={maxType} color={barColors[i]} />
            ))}
          </div>
        </motion.div>
      </div>

      {/* Monthly trend (mock) */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="bg-card border border-card-border rounded-2xl p-5 shadow-xs"
      >
        <h3 className="font-semibold text-foreground text-sm mb-5">Monthly Order Volume</h3>
        <div className="flex items-end justify-between gap-2 h-28">
          {[
            { month: "Nov", val: 42 },
            { month: "Dec", val: 58 },
            { month: "Jan", val: 51 },
            { month: "Feb", val: 67 },
            { month: "Mar", val: 74 },
            { month: "Apr", val: 89 },
          ].map((d, i) => (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(d.val / 89) * 100}%` }}
                transition={{ delay: i * 0.08 + 0.5, duration: 0.5, ease: "easeOut" }}
                className={`w-full rounded-t-lg ${i === 5 ? "bg-[#f97316]" : "bg-primary/25 hover:bg-primary/40"} transition-colors cursor-pointer`}
              />
              <span className="text-[10px] text-muted-foreground">{d.month}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
