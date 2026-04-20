import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Receipt, Plus, X, Banknote, Wallet } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAppData } from "../../context/AppDataContext";
import { StatusBadge } from "../../components/StatusBadge";
import { calculateTripPayout, formatSAR, TRIP_RATES, AVG_FUEL_COST } from "../../lib/payoutLogic";
import { initialDrivers } from "../../mockData";

const CATEGORIES = ["Fuel", "Toll", "Maintenance", "Meals", "Parking", "Other"] as const;

export default function Expenses() {
  const { user } = useAuth();
  const { expenses, addExpense, drivers } = useAppData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "Fuel", amount: "", description: "" });

  const myExpenses = expenses.filter((e) => e.driverId === user?.driverId);
  const driver = drivers.find((d) => d.id === user?.driverId) ?? initialDrivers.find((d) => d.id === user?.driverId);
  const payout = driver ? calculateTripPayout(driver.truckType) : null;

  const submit = () => {
    if (!form.amount || !form.description || !user?.driverId) return;
    addExpense({
      driverId: user.driverId,
      category: form.category as any,
      amount: parseFloat(form.amount),
      description: form.description,
      date: new Date().toISOString().split("T")[0],
      status: "Pending",
    });
    setForm({ category: "Fuel", amount: "", description: "" });
    setShowForm(false);
  };

  const totalClaimed = myExpenses.reduce((sum, e) => sum + e.amount, 0);
  const approved = myExpenses.filter((e) => e.status === "Approved").reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Expense Reports</h2>
          <p className="text-muted-foreground text-sm mt-1">Submit and track your trip expenses</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 mkgh-gradient-orange text-white rounded-xl text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> New Claim
        </button>
      </div>

      {/* Payout summary panel */}
      {payout && driver && (
        <div className="glass-card-elevated rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-[#f97316]" />
            <h3 className="font-semibold text-foreground text-sm">Payout Summary</h3>
            <span className="ml-auto px-2.5 py-0.5 bg-[#f97316]/15 text-[#f97316] text-xs font-semibold rounded-full">
              {driver.truckType}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Trip Rate", value: formatSAR(TRIP_RATES[driver.truckType] ?? 300), color: "text-blue-400" },
              { label: "Avg Fuel Cost", value: formatSAR(AVG_FUEL_COST[driver.truckType] ?? 75), color: "text-red-400" },
              { label: "Net Pay / Trip", value: formatSAR(payout.netPay), color: "text-[#f97316]" },
            ].map((s) => (
              <div key={s.label} className="p-3 bg-white/4 rounded-xl text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-white/4 rounded-xl">
            <Banknote className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">Total trips: </span>
            <span className="text-xs font-semibold text-foreground">{driver.trips}</span>
            <span className="ml-auto text-xs text-muted-foreground">Est. lifetime earnings: </span>
            <span className="text-xs font-semibold text-emerald-400">{formatSAR(driver.totalEarnings)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Formula: Net_Pay = Trip_Rate − Fuel_Cost ({payout.tripRate} − {payout.fuelCost} = {payout.netPay} SAR)
          </p>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Total Claimed", value: `SAR ${totalClaimed.toLocaleString()}`, color: "text-foreground" },
          { label: "Approved", value: `SAR ${approved.toLocaleString()}`, color: "text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-2xl p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* New claim form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-sm">New Expense Claim</h3>
                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full glass-input rounded-xl px-3 py-2.5 text-sm">
                    {CATEGORIES.map((c) => <option key={c} value={c} className="bg-[#0d1a2d]">{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Amount (SAR)</label>
                  <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00" className="w-full glass-input rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the expense..." className="w-full glass-input rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <button onClick={submit}
                className="w-full py-2.5 mkgh-gradient-orange text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                Submit Claim
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expense list */}
      <div className="space-y-3">
        {myExpenses.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No expense claims yet</p>
            <p className="text-sm text-muted-foreground mt-1">Click "New Claim" to submit your first expense.</p>
          </div>
        ) : (
          myExpenses.map((exp, i) => (
            <motion.div key={exp.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass-card rounded-2xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                <Receipt className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{exp.description}</p>
                <p className="text-xs text-muted-foreground">{exp.category} · {exp.date}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">SAR {exp.amount.toLocaleString()}</p>
                <StatusBadge status={exp.status} size="sm" />
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
