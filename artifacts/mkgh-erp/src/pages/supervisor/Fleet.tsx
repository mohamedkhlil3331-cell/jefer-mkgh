import { motion } from "framer-motion";
import { Truck, Fuel, Wrench, MapPin, AlertCircle } from "lucide-react";
import { vehicles } from "../../data.js";
import { StatusBadge } from "../../components/StatusBadge";

function FuelBar({ level }: { level: number }) {
  const color = level < 30 ? "bg-red-500" : level < 60 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${level}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className={`text-xs font-medium ${level < 30 ? "text-red-600" : "text-muted-foreground"}`}>{level}%</span>
    </div>
  );
}

export default function Fleet() {
  const active = vehicles.filter(v => v.status === "Active" || v.status === "In Transit").length;
  const maintenance = vehicles.filter(v => v.status === "Maintenance").length;
  const idle = vehicles.filter(v => v.status === "Idle").length;
  const lowFuel = vehicles.filter(v => v.fuel < 30).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Fleet Management</h2>
        <p className="text-muted-foreground text-sm mt-1">Real-time status of all registered vehicles</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active / In Transit", value: active, color: "text-green-600 bg-green-50 border-green-100" },
          { label: "In Maintenance", value: maintenance, color: "text-red-600 bg-red-50 border-red-100" },
          { label: "Idle", value: idle, color: "text-slate-600 bg-slate-50 border-slate-200" },
          { label: "Low Fuel Alert", value: lowFuel, color: "text-amber-600 bg-amber-50 border-amber-100" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className={`rounded-2xl border p-5 shadow-xs ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs mt-0.5 opacity-80">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Low fuel alert */}
      {lowFuel > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">{lowFuel} vehicle(s) below 30% fuel. Schedule refueling immediately.</p>
        </div>
      )}

      {/* Vehicle cards */}
      <div className="grid gap-4">
        {vehicles.map((v, i) => (
          <motion.div
            key={v.plateNo}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="bg-card border border-card-border rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                <Truck className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div>
                    <span className="font-bold text-foreground text-base">{v.plateNo}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{v.type}</span>
                  </div>
                  <StatusBadge status={v.status} size="sm" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Truck className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Driver</p>
                      <p className="text-xs font-medium text-foreground truncate">{v.currentDriver}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Location</p>
                      <p className="text-xs font-medium text-foreground truncate">{v.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last Service</p>
                      <p className="text-xs font-medium text-foreground">{v.lastService}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Fuel className="w-3 h-3" /> Fuel Level
                    </span>
                  </div>
                  <FuelBar level={v.fuel} />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
