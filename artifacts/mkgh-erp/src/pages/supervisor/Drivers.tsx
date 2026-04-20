import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Phone, Truck, Star, ChevronDown } from "lucide-react";
import { drivers, vehicles } from "../../data.js";
import { StatusBadge } from "../../components/StatusBadge";

export default function Drivers() {
  const [assignModal, setAssignModal] = useState<typeof drivers[0] | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});

  const assign = (driverId: string, plate: string) => {
    setAssignments(a => ({ ...a, [driverId]: plate }));
    setAssignModal(null);
  };

  const availableVehicles = vehicles.filter(v => v.status === "Idle" || v.status === "Active");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Driver Assignment</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage driver schedules and vehicle assignments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "On Duty", value: drivers.filter(d => d.status === "On Duty").length, color: "bg-green-50 border-green-100 text-green-700" },
          { label: "Available", value: drivers.filter(d => d.status === "Available").length, color: "bg-blue-50 border-blue-100 text-blue-700" },
          { label: "Off Duty", value: drivers.filter(d => d.status === "Off Duty").length, color: "bg-slate-50 border-slate-200 text-slate-600" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className={`rounded-2xl border p-4 shadow-xs ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs mt-0.5 opacity-80">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Drivers grid */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {drivers.map((driver, i) => (
          <motion.div
            key={driver.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.07 }}
            className="bg-card border border-card-border rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
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
                <span className="font-medium text-foreground truncate">{assignments[driver.id] ?? driver.vehicle}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{driver.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Star className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{driver.trips} total trips</span>
              </div>
            </div>

            <button
              onClick={() => setAssignModal(driver)}
              className="w-full py-2 rounded-xl border border-[#f97316]/30 bg-orange-50 hover:bg-orange-100 text-[#f97316] text-xs font-semibold transition-colors"
            >
              Assign Vehicle
            </button>
          </motion.div>
        ))}
      </div>

      {/* Assignment Modal */}
      <AnimatePresence>
        {assignModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAssignModal(null)} />
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="relative bg-card border border-card-border rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10"
            >
              <h3 className="font-bold text-foreground mb-1">Assign Vehicle</h3>
              <p className="text-muted-foreground text-sm mb-5">Select a vehicle for {assignModal.name}</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableVehicles.map(v => (
                  <button key={v.plateNo} onClick={() => assign(assignModal.id, v.plateNo)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted transition-colors text-left">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Truck className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{v.plateNo}</p>
                      <p className="text-xs text-muted-foreground">{v.type} · {v.status}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setAssignModal(null)}
                className="mt-4 w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
