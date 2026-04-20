import { motion } from "framer-motion";
import { ListTodo, Receipt, Wrench, CheckCircle2, ArrowRight } from "lucide-react";
import { tasks, expenses, maintenanceReports } from "../../data.js";
import { useAuth } from "../../context/AuthContext";
import { StatusBadge } from "../../components/StatusBadge";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function DriverDashboard() {
  const { user } = useAuth();
  const myTasks = tasks.filter(t => t.driverId === user?.driverId);
  const myExpenses = expenses.filter(e => e.driverId === user?.driverId);
  const myMaintenance = maintenanceReports.filter(m => m.driverId === user?.driverId);

  const completedTasks = myTasks.filter(t => t.status === "Completed").length;
  const pendingExpenses = myExpenses.filter(e => e.status === "Pending").length;
  const openMaintenance = myMaintenance.filter(m => m.status === "Open").length;

  const stats = [
    { label: "Today's Tasks", value: myTasks.length, sub: `${completedTasks} completed`, color: "bg-blue-50 text-blue-600 border-blue-100", icon: ListTodo },
    { label: "Pending Claims", value: pendingExpenses, sub: "Awaiting approval", color: "bg-amber-50 text-amber-600 border-amber-100", icon: Receipt },
    { label: "Open Issues", value: openMaintenance, sub: "Maintenance reports", color: "bg-red-50 text-red-600 border-red-100", icon: Wrench },
    { label: "Tasks Done", value: completedTasks, sub: `of ${myTasks.length} today`, color: "bg-green-50 text-green-600 border-green-100", icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Driver Portal</h2>
        <p className="text-muted-foreground text-sm mt-1">Your tasks, expenses, and vehicle status</p>
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

      {/* Today's tasks */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="font-semibold text-foreground text-sm">Today's Schedule</h3>
          <button className="text-xs text-[#f97316] font-medium flex items-center gap-1">Full list <ArrowRight className="w-3 h-3" /></button>
        </div>
        {myTasks.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No tasks assigned for today.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {myTasks.map(task => (
              <div key={task.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{task.type} — {task.orderId}</p>
                  <p className="text-xs text-muted-foreground truncate">{task.location} · {task.time}</p>
                </div>
                <StatusBadge status={task.status} size="sm" />
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
