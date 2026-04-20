import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, Check, X, Eye, MessageCircle, PackageCheck,
  Warehouse, AlertTriangle, Zap
} from "lucide-react";
import { StatusBadge } from "../../components/StatusBadge";
import { useAppData } from "../../context/AppDataContext";
import type { OrderStatus } from "../../mockData";

export default function NewOrders() {
  const { orders, updateOrderStatus, warehouseLog } = useAppData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastAutomated, setLastAutomated] = useState<string | null>(null);

  const pending = orders.filter((o) => o.status === "Pending");
  const selected = orders.find((o) => o.id === selectedId) ?? null;

  const handleStatus = (id: string, status: OrderStatus) => {
    updateOrderStatus(id, status);
    if (status === "Delivered") {
      setLastAutomated(id);
      setTimeout(() => setLastAutomated(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Orders Queue</h2>
          <p className="text-muted-foreground text-sm mt-1">Review and process incoming freight orders</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-xl">
          <ClipboardList className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-400">{pending.length} Pending</span>
        </div>
      </div>

      {/* Warehouse Automation Banner */}
      <AnimatePresence>
        {lastAutomated && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-400">Warehouse Automation Triggered</p>
              <p className="text-xs text-emerald-400/70">
                Stock levels for order {lastAutomated} have been auto-decremented.
              </p>
            </div>
            <Warehouse className="w-5 h-5 text-emerald-400/50" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp CTA */}
      <div className="flex items-center gap-4 p-4 bg-[#25D366]/8 border border-[#25D366]/20 rounded-2xl">
        <div className="w-10 h-10 rounded-xl bg-[#25D366]/15 flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-5 h-5 text-[#25D366]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">WhatsApp Business Line</p>
          <p className="text-xs text-muted-foreground">Send urgent order notifications to customers instantly</p>
        </div>
        <a href="https://wa.me/966500000000" target="_blank" rel="noopener noreferrer"
          className="flex-shrink-0 px-4 py-2 bg-[#25D366] hover:bg-[#1ebe58] text-white text-xs font-semibold rounded-xl transition-colors">
          Open WhatsApp
        </a>
      </div>

      {/* Orders Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order ID</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Route</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Payment</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.map((order, i) => (
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`hover:bg-white/3 transition-colors cursor-pointer ${
                    selectedId === order.id ? "bg-white/5" : ""
                  }`}
                  onClick={() => setSelectedId(selectedId === order.id ? null : order.id)}
                >
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-semibold text-foreground">{order.id}</p>
                    <p className="text-xs text-muted-foreground">{order.date}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden sm:table-cell">
                    <p className="text-sm text-foreground">{order.customerName}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <p className="text-xs text-muted-foreground">{order.origin} → {order.destination}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={order.status} size="sm" />
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell">
                    <p className="text-xs text-muted-foreground">{order.payment.amount.toLocaleString()} SAR</p>
                    <StatusBadge status={order.payment.status} size="sm" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setSelectedId(selectedId === order.id ? null : order.id)}
                        className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground hover:text-foreground" title="View">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {order.status === "Pending" && (
                        <>
                          <button onClick={() => handleStatus(order.id, "Processing")}
                            className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 transition-colors" title="Approve">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleStatus(order.id, "Cancelled")}
                            className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 transition-colors" title="Reject">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {(order.status === "Processing" || order.status === "In Transit") && (
                        <button onClick={() => handleStatus(order.id, "Delivered")}
                          className="p-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 transition-colors" title="Mark Delivered">
                          <PackageCheck className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass-card rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground">Order Details — {selected.id}</h3>
              <button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                { l: "Customer", v: selected.customerName },
                { l: "Origin", v: selected.origin },
                { l: "Destination", v: selected.destination },
                { l: "Vehicle", v: selected.vehicleType },
                { l: "Weight", v: selected.weight },
                { l: "Cargo", v: selected.cargoDescription },
              ].map(({ l, v }) => (
                <div key={l} className="p-3 bg-white/4 rounded-xl">
                  <p className="text-muted-foreground text-xs mb-0.5">{l}</p>
                  <p className="font-medium text-foreground">{v}</p>
                </div>
              ))}
            </div>
            {/* Payment info */}
            <div className="mt-4 p-3 bg-white/4 rounded-xl flex items-center gap-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">Payment</p>
                <p className="font-semibold text-foreground">
                  {selected.payment.amount.toLocaleString()} SAR
                  <span className="ml-2 text-xs text-muted-foreground">via {selected.payment.method}</span>
                </p>
              </div>
              <StatusBadge status={selected.payment.status} />
            </div>
            {/* Stock consumption */}
            {selected.consumesStock.length > 0 && (
              <div className="mt-3 p-3 bg-amber-500/8 border border-amber-500/15 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <p className="text-xs font-semibold text-amber-400">Stock will be consumed on delivery</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.consumesStock.map((c) => (
                    <span key={c.itemId} className="px-2 py-0.5 bg-amber-500/10 rounded-full text-xs text-amber-300">
                      {c.itemId}: −{c.quantity} units
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Warehouse automation log */}
      {warehouseLog.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Warehouse className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-foreground text-sm">Warehouse Automation Log</h3>
          </div>
          <div className="space-y-3">
            {warehouseLog.slice(0, 5).map((evt, i) => (
              <div key={i} className="flex items-start gap-3 text-xs">
                <span className="text-muted-foreground whitespace-nowrap">{evt.timestamp}</span>
                <div>
                  <p className="text-foreground font-medium">Order {evt.orderId} delivered</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {evt.changes.map((c) => (
                      <span key={c.itemId} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full">
                        {c.itemName}: {c.delta} → {c.newQuantity}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
