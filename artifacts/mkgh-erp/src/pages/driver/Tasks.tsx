import { motion } from "framer-motion";
import { ListTodo, MapPin, Package, CheckCircle2, Clock, PlayCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAppData } from "../../context/AppDataContext";
import { StatusBadge } from "../../components/StatusBadge";

export default function Tasks() {
  const { user } = useAuth();
  const { tasks, orders, updateTaskStatus } = useAppData();

  const myTasks = tasks.filter((t) => t.driverId === user?.driverId);
  const getOrder = (orderId: string) => orders.find((o) => o.id === orderId);

  const completed = myTasks.filter((t) => t.status === "Completed").length;
  const inProgress = myTasks.filter((t) => t.status === "In Progress").length;
  const pending = myTasks.filter((t) => t.status === "Pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">My Tasks</h2>
        <p className="text-muted-foreground text-sm mt-1">Today's delivery schedule and pickups</p>
      </div>

      {/* Progress summary */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-foreground">Today's Progress</span>
          <span className="text-sm text-muted-foreground">{completed}/{myTasks.length} tasks</span>
        </div>
        <div className="w-full bg-white/8 rounded-full h-2.5 overflow-hidden mb-4">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${myTasks.length ? (completed / myTasks.length) * 100 : 0}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full mkgh-gradient-orange rounded-full"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Completed", value: completed, color: "text-emerald-400" },
            { label: "In Progress", value: inProgress, color: "text-blue-400" },
            { label: "Pending", value: pending, color: "text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {myTasks.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="font-semibold text-foreground">All done for today!</p>
          <p className="text-sm text-muted-foreground mt-1">No tasks assigned to your driver ID.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myTasks.map((task, i) => {
            const order = getOrder(task.orderId);
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`glass-card rounded-2xl p-5 transition-all ${task.status === "Completed" ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    task.type === "Pickup" ? "bg-blue-500/15 text-blue-400" : "bg-orange-500/15 text-orange-400"
                  }`}>
                    {task.type === "Pickup" ? <Package className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div>
                        <span className="font-semibold text-foreground text-sm">{task.type}</span>
                        <span className="ml-2 text-xs text-muted-foreground">· {task.id}</span>
                      </div>
                      <StatusBadge status={task.status} size="sm" />
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3" />
                        <span>{task.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        <span>Scheduled: {task.time}</span>
                      </div>
                      {order && (
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3 h-3" />
                          <span>{order.customerName} · {order.weight}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {task.status !== "Completed" && (
                  <div className="flex gap-2 mt-4">
                    {task.status === "Pending" && (
                      <button onClick={() => updateTaskStatus(task.id, "In Progress")}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 text-xs font-semibold transition-colors">
                        <PlayCircle className="w-3.5 h-3.5" /> Start
                      </button>
                    )}
                    {task.status === "In Progress" && (
                      <button onClick={() => updateTaskStatus(task.id, "Completed")}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold transition-colors">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
