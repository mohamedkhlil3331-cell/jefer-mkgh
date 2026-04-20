import { motion } from "framer-motion";
import { Truck, Fuel, Wrench, MapPin, AlertCircle, DollarSign } from "lucide-react";
import { useAppData } from "../../context/AppDataContext";
import { StatusBadge } from "../../components/StatusBadge";

function FuelBar({ level }: { level: number }) {
  const color = level < 30 ? "bg-red-500" : level < 60 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-white/8 rounded-full h-1.5 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${level}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`} />
      </div>
      <span className={`text-xs font-medium ${level < 30 ? "text-red-400" : "text-muted-foreground"}`}>{level}%</span>
    </div>
  );
}

export default function Fleet() {
  const { vehicles } = useAppData();

  const active      = vehicles.filter((v) => v.status === "On-Trip" || v.status === "Available").length;
  const maintenance = vehicles.filter((v) => v.status === "Maintenance").length;
  const idle        = vehicles.filter((v) => v.status === "Idle").length;
  const lowFuel     = vehicles.filter((v) => v.fuel < 30).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Fleet Management</h2>
        <p className="text-muted-foreground text-sm mt-1">Real-time status of all registered vehicles</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active / On-Trip", value: active, color: "text-emerald-400 bg-emerald-500/10" },
          { label: "In Maintenance", value: maintenance, color: "text-red-400 bg-red-500/10" },
          { label: "Idle", value: idle, color: "text-slate-400 bg-slate-500/10" },
          { label: "Low Fuel Alert", value: lowFuel, color: "text-amber-400 bg-amber-500/10" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }} className={`glass-card rounded-2xl p-5 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs mt-0.5 opacity-80">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {lowFuel > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/8 border border-amber-500/20 rounded-2xl">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-400 font-medium">{lowFuel} vehicle(s) below 30% fuel. Schedule refueling immediately.</p>
        </div>
      )}

      <div className="grid gap-4">
        {vehicles.map((v, i) => (
          <motion.div key={v.plateNo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} className="glass-card rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
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
                    <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Truck className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Driver</p>
                      <p className="text-xs font-medium text-foreground truncate">{v.currentDriver}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Location</p>
                      <p className="text-xs font-medium text-foreground truncate">{v.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last Service</p>
                      <p className="text-xs font-medium text-foreground">{v.lastService}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <Fuel className="w-3 h-3" /> Fuel Level
                      </span>
                    </div>
                    <FuelBar level={v.fuel} />
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Diesel:</span>
                      <span className="text-foreground font-medium">{v.expenses.diesel} SAR</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Wrench className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Repairs:</span>
                      <span className="text-foreground font-medium">{v.expenses.repairs} SAR</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
