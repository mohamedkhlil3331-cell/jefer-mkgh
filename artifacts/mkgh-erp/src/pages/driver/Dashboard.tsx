import { motion } from "framer-motion";
import { ListTodo, Receipt, Wrench, CheckCircle2, ArrowRight, Wallet } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAppData } from "../../context/AppDataContext";
import { StatusBadge } from "../../components/StatusBadge";
import { calculateTripPayout, formatSAR } from "../../lib/payoutLogic";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function DriverDashboard() {
  const { user } = useAuth();
  const { tasks, expenses, maintenanceReports, drivers } = useAppData();

  const myTasks        = tasks.filter((t) => t.driverId === user?.driverId);
  const myExpenses     = expenses.filter((e) => e.driverId === user?.driverId);
  const myMaintenance  = maintenanceReports.filter((m) => m.driverId === user?.driverId);
  const myDriver       = drivers.find((d) => d.id === user?.driverId);

  const completedTasks  = myTasks.filter((t) => t.status === "Completed").length;
  const pendingExpenses = myExpenses.filter((e) => e.status === "Pending").length;
  const openMaintenance = myMaintenance.filter((m) => m.status === "Open").length;

  const payout = myDriver ? calculateTripPayout(myDriver.truckType) : null;

  const stats = [
    { label: "Today's Tasks", value: myTasks.length, sub: `${completedTasks} completed`, color: "text-blue-400 bg-blue-500/10", icon: ListTodo },
    { label: "Pending Claims", value: pendingExpenses, sub: "Awaiting approval", color: "text-amber-400 bg-amber-500/10", icon: Receipt },
    { label: "Open Issues", value: openMaintenance, sub: "Maintenance reports", color: "text-red-400 bg-red-500/10", icon: Wrench },
    { label: "Tasks Done", value: completedTasks, sub: `of ${myTasks.length} today`, color: "text-emerald-400 bg-emerald-500/10", icon: CheckCircle2 },
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
            className="glass-card rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{s.sub}</p>
            <p className="text-foreground text-xs font-medium mt-1">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Payout mini-panel */}
      {payout && myDriver && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass-card-elevated rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-[#f97316]/15 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-4.5 h-4.5 text-[#f97316]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Payout Summary</p>
              <p className="text-xs text-muted-foreground">{myDriver.truckType} · {myDriver.trips} trips</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-lg font-bold text-[#f97316]">{formatSAR(payout.netPay)}</p>
              <p className="text-[10px] text-muted-foreground">per trip</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Net_Pay = {payout.tripRate} − {payout.fuelCost} = {payout.netPay} SAR · Lifetime: {formatSAR(myDriver.totalEarnings)}
          </p>
        </motion.div>
      )}

      {/* Today's schedule */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="glass-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
          <h3 className="font-semibold text-foreground text-sm">Today's Schedule</h3>
          <button className="text-xs text-[#f97316] font-medium flex items-center gap-1">Full list <ArrowRight className="w-3 h-3" /></button>
        </div>
        {myTasks.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No tasks assigned for today.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {myTasks.map((task) => (
              <div key={task.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-white/3 transition-colors">
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
