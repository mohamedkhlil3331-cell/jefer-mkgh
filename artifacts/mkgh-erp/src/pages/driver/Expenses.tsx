import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Receipt, Plus, CheckCircle2, Clock, X } from "lucide-react";
import { expenses } from "../../data.js";
import { useAuth } from "../../context/AuthContext";
import { StatusBadge } from "../../components/StatusBadge";

const categories = ["Fuel", "Toll", "Maintenance", "Meals", "Parking", "Other"];

interface ExpenseItem {
  id: string;
  driverId: string;
  category: string;
  amount: number;
  date: string;
  status: string;
  description: string;
}

export default function Expenses() {
  const { user } = useAuth();
  const myExpenses = expenses.filter(e => e.driverId === user?.driverId);
  const [expenseList, setExpenseList] = useState<ExpenseItem[]>(myExpenses);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "Fuel", amount: "", description: "" });
  const [submitting, setSubmitting] = useState(false);

  const total = expenseList.reduce((sum, e) => sum + e.amount, 0);
  const approved = expenseList.filter(e => e.status === "Approved").reduce((sum, e) => sum + e.amount, 0);
  const pending = expenseList.filter(e => e.status === "Pending").reduce((sum, e) => sum + e.amount, 0);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 800));
    const newExp: ExpenseItem = {
      id: `EXP-00${expenseList.length + 5}`,
      driverId: user?.driverId ?? "DRV-001",
      category: form.category,
      amount: parseFloat(form.amount),
      date: new Date().toISOString().split("T")[0],
      status: "Pending",
      description: form.description,
    };
    setExpenseList(l => [newExp, ...l]);
    setForm({ category: "Fuel", amount: "", description: "" });
    setShowForm(false);
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Expense Reports</h2>
          <p className="text-muted-foreground text-sm mt-1">Submit and track your expense claims</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl mkgh-gradient-orange text-white text-sm font-semibold shadow hover:opacity-90 transition-all">
          <Plus className="w-4 h-4" /> New Claim
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Claimed", value: `SAR ${total.toFixed(0)}`, color: "text-foreground" },
          { label: "Approved", value: `SAR ${approved.toFixed(0)}`, color: "text-green-600" },
          { label: "Pending", value: `SAR ${pending.toFixed(0)}`, color: "text-amber-600" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="bg-card border border-card-border rounded-2xl p-4 shadow-xs text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Submit form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -12, height: 0 }}
            onSubmit={handleSubmit}
            className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <span className="font-semibold text-foreground text-sm">New Expense Claim</span>
              <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Amount (SAR)</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required min="1"
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required
                  placeholder="Brief description of the expense"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
              </div>
              <button type="submit" disabled={submitting}
                className="w-full py-2.5 rounded-xl mkgh-gradient-orange text-white text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-70 flex items-center justify-center gap-2">
                {submitting ? <><svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Submitting...</> : "Submit Claim"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Expense list */}
      <div className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="font-semibold text-foreground text-sm">Claim History</h3>
        </div>
        {expenseList.length === 0 ? (
          <div className="p-10 text-center">
            <Receipt className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No expense claims yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {expenseList.map((exp, i) => (
              <motion.div key={exp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className="px-5 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${exp.status === "Approved" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"}`}>
                  {exp.status === "Approved" ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{exp.category}</p>
                  <p className="text-xs text-muted-foreground truncate">{exp.description}</p>
                </div>
                <div className="text-right mr-3">
                  <p className="text-sm font-bold text-foreground">SAR {exp.amount}</p>
                  <p className="text-xs text-muted-foreground">{exp.date}</p>
                </div>
                <StatusBadge status={exp.status} size="sm" />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
