import { useState } from "react";
import { motion } from "framer-motion";
import { Boxes, AlertTriangle, TrendingDown, Plus, Minus, Package } from "lucide-react";
import { useAppData } from "../../context/AppDataContext";

const categoryColors: Record<string, string> = {
  Packaging:   "text-blue-400 bg-blue-500/10",
  Fuel:        "text-amber-400 bg-amber-500/10",
  Maintenance: "text-red-400 bg-red-500/10",
  Equipment:   "text-violet-400 bg-violet-500/10",
};

export default function Inventory() {
  const { stock, adjustStock, warehouseLog } = useAppData();
  const [adjusting, setAdjusting] = useState<string | null>(null);

  const lowStock = stock.filter((s) => s.quantity <= s.minLevel);
  const totalItems = stock.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Inventory Status</h2>
          <p className="text-muted-foreground text-sm mt-1">Real-time warehouse stock tracking</p>
        </div>
        {lowStock.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/25 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400">{lowStock.length} Low Stock</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total SKUs", value: stock.length, Icon: Boxes, color: "text-blue-400" },
          { label: "Low Stock", value: lowStock.length, Icon: AlertTriangle, color: "text-red-400" },
          { label: "Total Units", value: totalItems.toLocaleString(), Icon: Package, color: "text-violet-400" },
        ].map((stat) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl p-4">
            <stat.Icon className={`w-5 h-5 ${stat.color} mb-2`} />
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/8 border border-red-500/20 rounded-2xl">
          <TrendingDown className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">
            <span className="font-semibold">{lowStock.map((s) => s.itemName).join(", ")}</span>
            {" "}— below minimum. Restock immediately.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Category</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock Level</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Location</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {stock.map((item, i) => {
                const pct = Math.min(100, (item.quantity / Math.max(item.minLevel * 2, 1)) * 100);
                const isLow = item.quantity <= item.minLevel;
                return (
                  <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className={`hover:bg-white/3 transition-colors ${isLow ? "bg-red-500/3" : ""}`}>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-foreground">{item.itemName}</p>
                      <p className="text-xs text-muted-foreground">Min: {item.minLevel} {item.unit}</p>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${categoryColors[item.category] ?? "text-slate-400 bg-white/5"}`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 min-w-[140px]">
                        <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.7, delay: i * 0.04 }}
                            className={`h-full rounded-full ${isLow ? "bg-red-500" : pct < 60 ? "bg-amber-500" : "bg-emerald-500"}`}
                          />
                        </div>
                        <span className={`text-sm font-bold whitespace-nowrap ${isLow ? "text-red-400" : "text-foreground"}`}>
                          {item.quantity.toLocaleString()} {item.unit}
                        </span>
                        {isLow && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <p className="text-xs text-muted-foreground">{item.location}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {adjusting === item.id ? (
                          <>
                            <button onClick={() => adjustStock(item.id, -10)}
                              className="w-7 h-7 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 flex items-center justify-center transition-colors">
                              <Minus className="w-3 h-3" />
                            </button>
                            <button onClick={() => adjustStock(item.id, 50)}
                              className="w-7 h-7 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 flex items-center justify-center transition-colors">
                              <Plus className="w-3 h-3" />
                            </button>
                            <button onClick={() => setAdjusting(null)}
                              className="text-xs text-muted-foreground hover:text-foreground px-2 transition-colors">Done</button>
                          </>
                        ) : (
                          <button onClick={() => setAdjusting(item.id)}
                            className="px-3 py-1.5 text-xs rounded-lg bg-white/6 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                            Adjust
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Automation log */}
      {warehouseLog.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <p className="text-sm font-semibold text-foreground mb-3">Recent Auto-Deductions</p>
          <div className="space-y-2">
            {warehouseLog.slice(0, 3).map((evt, i) => (
              <div key={i} className="text-xs flex items-start gap-2 p-2.5 bg-white/3 rounded-xl">
                <span className="text-muted-foreground whitespace-nowrap">{evt.timestamp}</span>
                <span className="text-foreground">
                  Order {evt.orderId} — {evt.changes.map((c) => `${c.itemName}: −${Math.abs(c.delta)}`).join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
