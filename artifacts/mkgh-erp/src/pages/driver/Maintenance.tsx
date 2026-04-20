import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Plus, AlertTriangle, CheckCircle, X } from "lucide-react";
import { maintenanceReports } from "../../data.js";
import { useAuth } from "../../context/AuthContext";
import { StatusBadge } from "../../components/StatusBadge";

const severities = ["Low", "Medium", "High"];
const issueTypes = ["Engine issue", "Tire problem", "Brake failure", "AC system", "Electrical fault", "Oil leak", "Battery issue", "Other"];

export default function Maintenance() {
  const { user } = useAuth();
  const myReports = maintenanceReports.filter(r => r.driverId === user?.driverId);
  const [reports, setReports] = useState(myReports.map(r => ({ ...r })));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ issue: "", severity: "Medium", vehiclePlate: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 800));
    const newReport = {
      id: `MNT-00${reports.length + 4}`,
      vehiclePlate: form.vehiclePlate || "RYH-4421",
      driverId: user?.driverId ?? "DRV-001",
      issue: form.issue,
      severity: form.severity,
      status: "Open",
      date: new Date().toISOString().split("T")[0],
    };
    setReports(r => [newReport, ...r]);
    setForm({ issue: "", severity: "Medium", vehiclePlate: "" });
    setShowForm(false);
    setSubmitting(false);
  };

  const openCount = reports.filter(r => r.status === "Open").length;
  const inProgressCount = reports.filter(r => r.status === "In Progress").length;
  const resolvedCount = reports.filter(r => r.status === "Resolved").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Maintenance Reports</h2>
          <p className="text-muted-foreground text-sm mt-1">Report vehicle issues and track repair status</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl mkgh-gradient-orange text-white text-sm font-semibold shadow hover:opacity-90 transition-all">
          <Plus className="w-4 h-4" /> Report Issue
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Open Issues", value: openCount, color: "text-red-600 bg-red-50 border-red-100" },
          { label: "In Progress", value: inProgressCount, color: "text-blue-600 bg-blue-50 border-blue-100" },
          { label: "Resolved", value: resolvedCount, color: "text-green-600 bg-green-50 border-green-100" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className={`rounded-2xl border p-4 shadow-xs text-center ${s.color}`}>
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-xs mt-0.5 opacity-80">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            onSubmit={handleSubmit}
            className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <span className="font-semibold text-foreground text-sm">New Maintenance Report</span>
              <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Issue Type *</label>
                  <select value={form.issue} onChange={e => setForm(f => ({ ...f, issue: e.target.value }))} required
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                    <option value="">Select issue</option>
                    {issueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Severity *</label>
                  <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                    {severities.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Vehicle Plate</label>
                <input type="text" value={form.vehiclePlate} onChange={e => setForm(f => ({ ...f, vehiclePlate: e.target.value }))}
                  placeholder="e.g. RYH-4421"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
              </div>
              <button type="submit" disabled={submitting}
                className="w-full py-2.5 rounded-xl mkgh-gradient-orange text-white text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-70 flex items-center justify-center gap-2">
                {submitting ? <><svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Submitting...</> : "Submit Report"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Reports */}
      <div className="space-y-3">
        {reports.length === 0 ? (
          <div className="bg-card border border-card-border rounded-2xl p-12 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="font-semibold text-foreground">No maintenance issues reported</p>
            <p className="text-sm text-muted-foreground mt-1">Your vehicle is in good condition.</p>
          </div>
        ) : (
          reports.map((report, i) => (
            <motion.div key={report.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="bg-card border border-card-border rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${report.severity === "High" ? "bg-red-100 text-red-600" : report.severity === "Medium" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-600"}`}>
                  {report.status === "Resolved" ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-foreground text-sm">{report.issue}</p>
                    <StatusBadge status={report.severity} size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{report.id} · {report.vehiclePlate} · {report.date}</p>
                  <StatusBadge status={report.status} size="sm" />
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
