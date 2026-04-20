import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Phone, Truck, Star, X } from "lucide-react";
import { useAppData } from "../../context/AppDataContext";
import { StatusBadge } from "../../components/StatusBadge";
import { formatSAR, TRIP_RATES } from "../../lib/payoutLogic";
import type { Driver } from "../../mockData";

export default function Drivers() {
  const { drivers, vehicles, assignVehicleToDriver } = useAppData();
  const [assignModal, setAssignModal] = useState<Driver | null>(null);

  const availableVehicles = vehicles.filter((v) => v.status === "Idle" || v.status === "Available");

  const handleAssign = (driverId: string, plateNo: string) => {
    assignVehicleToDriver(driverId, plateNo);
    setAssignModal(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Driver Assignment</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage driver schedules and vehicle assignments</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "On Duty", value: drivers.filter((d) => d.status === "On Duty").length, color: "text-emerald-400 bg-emerald-500/10" },
          { label: "Available", value: drivers.filter((d) => d.status === "Available").length, color: "text-blue-400 bg-blue-500/10" },
          { label: "Off Duty", value: drivers.filter((d) => d.status === "Off Duty").length, color: "text-slate-400 bg-slate-500/10" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }} className={`glass-card rounded-2xl p-4 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs mt-0.5 opacity-80">{s.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {drivers.map((driver, i) => (
          <motion.div key={driver.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.07 }} className="glass-card rounded-2xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-full bg-[#f97316]/15 flex items-center justify-center text-[#f97316] font-bold text-lg flex-shrink-0">
                {driver.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">{driver.name}</p>
                <p className="text-xs text-muted-foreground">{driver.id}</p>
              </div>
              <StatusBadge status={driver.status} size="sm" />
            </div>

            <div className="space-y-2 text-xs mb-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Truck className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-medium text-foreground truncate">{driver.vehicle}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{driver.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Star className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{driver.trips} trips · {formatSAR(TRIP_RATES[driver.truckType] ?? 300)}/trip</span>
              </div>
            </div>

            <button onClick={() => setAssignModal(driver)}
              className="w-full py-2 rounded-xl border border-[#f97316]/20 bg-[#f97316]/8 hover:bg-[#f97316]/15 text-[#f97316] text-xs font-semibold transition-colors">
              Assign Vehicle
            </button>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {assignModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAssignModal(null)} />
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="relative glass-card-elevated rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-foreground">Assign Vehicle</h3>
                  <p className="text-muted-foreground text-xs mt-0.5">For {assignModal.name}</p>
                </div>
                <button onClick={() => setAssignModal(null)} className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableVehicles.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No available vehicles</p>
                ) : (
                  availableVehicles.map((v) => (
                    <button key={v.plateNo} onClick={() => handleAssign(assignModal.id, v.plateNo)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/8 hover:bg-white/6 transition-colors text-left">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                        <Truck className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{v.plateNo}</p>
                        <p className="text-xs text-muted-foreground">{v.type} · {v.status}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <button onClick={() => setAssignModal(null)}
                className="mt-4 w-full py-2.5 rounded-xl border border-white/10 text-sm text-muted-foreground hover:bg-white/5 transition-colors">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
