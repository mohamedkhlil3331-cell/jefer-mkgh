import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Plus, X, AlertTriangle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAppData } from "../../context/AppDataContext";
import { StatusBadge } from "../../components/StatusBadge";

const SEVERITIES = ["Low", "Medium", "High"] as const;

export default function Maintenance() {
  const { user } = useAuth();
  const { maintenanceReports, addMaintenanceReport, vehicles } = useAppData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ issue: "", severity: "Medium", vehiclePlate: "" });

  const myReports = maintenanceReports.filter((r) => r.driverId === user?.driverId);

  const submit = () => {
    if (!form.issue || !user?.driverId) return;
    addMaintenanceReport({
      driverId: user.driverId,
      vehiclePlate: form.vehiclePlate || "Unknown",
      issue: form.issue,
      severity: form.severity as any,
      status: "Open",
      date: new Date().toISOString().split("T")[0],
    });
    setForm({ issue: "", severity: "Medium", vehiclePlate: "" });
    setShowForm(false);
  };

  const severityIcon = (s: string) =>
    s === "High" ? "text-red-400" : s === "Medium" ? "text-amber-400" : "text-slate-400";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Maintenance Reports</h2>
          <p className="text-muted-foreground text-sm mt-1">Report vehicle issues for the workshop</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 mkgh-gradient-orange text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> New Report
        </button>
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-sm">New Maintenance Report</h3>
                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Vehicle Plate</label>
                  <select value={form.vehiclePlate} onChange={(e) => setForm((f) => ({ ...f, vehiclePlate: e.target.value }))}
                    className="w-full glass-input rounded-xl px-3 py-2.5 text-sm">
                    <option value="" className="bg-[#0d1a2d]">Select vehicle</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.plateNo} className="bg-[#0d1a2d]">{v.plateNo} ({v.type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Severity</label>
                  <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                    className="w-full glass-input rounded-xl px-3 py-2.5 text-sm">
                    {SEVERITIES.map((s) => <option key={s} value={s} className="bg-[#0d1a2d]">{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Issue Description</label>
                <textarea value={form.issue} onChange={(e) => setForm((f) => ({ ...f, issue: e.target.value }))}
                  placeholder="Describe the vehicle issue..." rows={3}
                  className="w-full glass-input rounded-xl px-3 py-2.5 text-sm resize-none" />
              </div>
              <button onClick={submit}
                className="w-full py-2.5 mkgh-gradient-orange text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                Submit Report
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reports list */}
      <div className="space-y-3">
        {myReports.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <Wrench className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No reports filed</p>
            <p className="text-sm text-muted-foreground mt-1">Report any vehicle issues immediately.</p>
          </div>
        ) : (
          myReports.map((report, i) => (
            <motion.div key={report.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }} className="glass-card rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  report.severity === "High" ? "bg-red-500/15" :
                  report.severity === "Medium" ? "bg-amber-500/15" : "bg-slate-500/15"
                }`}>
                  <AlertTriangle className={`w-5 h-5 ${severityIcon(report.severity)}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-semibold text-foreground text-sm">{report.issue}</p>
                    <StatusBadge status={report.status} size="sm" />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Vehicle: {report.vehiclePlate}</span>
                    <span>·</span>
                    <StatusBadge status={report.severity} size="sm" />
                    <span>·</span>
                    <span>{report.date}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
