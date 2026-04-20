import { motion } from "framer-motion";
import { Boxes, AlertTriangle, CheckCircle, TrendingDown } from "lucide-react";
import { inventory } from "../../data.js";

function StockBar({ level, min }: { level: number; min: number }) {
  const max = Math.max(level, min) * 1.5;
  const pct = Math.min((level / max) * 100, 100);
  const isLow = level < min;
  return (
    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`h-full rounded-full ${isLow ? "bg-red-500" : "bg-green-500"}`}
      />
    </div>
  );
}

export default function Inventory() {
  const lowStock = inventory.filter(i => i.stockLevel < i.minLevel);
  const healthy = inventory.filter(i => i.stockLevel >= i.minLevel);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Inventory Status</h2>
          <p className="text-muted-foreground text-sm mt-1">Monitor stock levels across all depots</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Total Items", value: inventory.length, icon: Boxes, color: "bg-blue-50 text-blue-600 border-blue-100" },
          { label: "Low Stock Alerts", value: lowStock.length, icon: AlertTriangle, color: "bg-red-50 text-red-600 border-red-100" },
          { label: "Healthy Stock", value: healthy.length, icon: CheckCircle, color: "bg-green-50 text-green-600 border-green-100" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-card border border-card-border rounded-2xl p-5 shadow-xs"
          >
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Low Stock Warning</p>
            <p className="text-xs text-red-700 mt-0.5">
              {lowStock.map(i => i.item).join(", ")} — stock below minimum threshold. Consider reordering.
            </p>
          </div>
        </motion.div>
      )}

      {/* Inventory table */}
      <div className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Category</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Location</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Level</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inventory.map((item, i) => {
                const isLow = item.stockLevel < item.minLevel;
                return (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-foreground">{item.item}</p>
                      <p className="text-xs text-muted-foreground">{item.id}</p>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <span className="text-xs px-2 py-1 bg-muted rounded-lg text-muted-foreground">{item.category}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-foreground">{item.stockLevel.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{item.unit} (min: {item.minLevel})</p>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <p className="text-xs text-muted-foreground">{item.location}</p>
                    </td>
                    <td className="px-5 py-3.5 min-w-[100px]">
                      <StockBar level={item.stockLevel} min={item.minLevel} />
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 text-xs font-medium">
                          <TrendingDown className="w-3 h-3" /> Low
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 text-xs font-medium">
                          <CheckCircle className="w-3 h-3" /> OK
                        </span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
