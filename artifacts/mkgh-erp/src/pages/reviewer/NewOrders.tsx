import { useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Check, X, Eye, MessageCircle } from "lucide-react";
import { orders } from "../../data.js";
import { StatusBadge } from "../../components/StatusBadge";

export default function NewOrders() {
  const [orderList, setOrderList] = useState(orders.map(o => ({ ...o })));
  const [selected, setSelected] = useState<typeof orders[0] | null>(null);

  const approve = (id: string) => {
    setOrderList(list => list.map(o => o.id === id ? { ...o, status: "Processing" } : o));
    if (selected?.id === id) setSelected(s => s ? { ...s, status: "Processing" } : s);
  };
  const reject = (id: string) => {
    setOrderList(list => list.map(o => o.id === id ? { ...o, status: "Cancelled" } : o));
    if (selected?.id === id) setSelected(s => s ? { ...s, status: "Cancelled" } : s);
  };

  const pending = orderList.filter(o => o.status === "Pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Orders Queue</h2>
          <p className="text-muted-foreground text-sm mt-1">Review and process incoming freight orders</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl">
          <ClipboardList className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-700">{pending.length} Pending</span>
        </div>
      </div>

      {/* WhatsApp CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-2xl"
      >
        <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-800">WhatsApp Business Line</p>
          <p className="text-xs text-green-700">Send urgent order notifications or updates to customers instantly</p>
        </div>
        <a href="https://wa.me/966500000000" target="_blank" rel="noopener noreferrer"
          className="flex-shrink-0 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
          Open WhatsApp
        </a>
      </motion.div>

      {/* Orders Table */}
      <div className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order ID</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Route</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Vehicle</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orderList.map((order, i) => (
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`hover:bg-muted/30 transition-colors ${selected?.id === order.id ? "bg-muted/50" : ""}`}
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
                    <p className="text-xs text-muted-foreground">{order.vehicleType}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setSelected(selected?.id === order.id ? null : order)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="View">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {order.status === "Pending" && (
                        <>
                          <button onClick={() => approve(order.id)}
                            className="p-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 transition-colors" title="Approve">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => reject(order.id)}
                            className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition-colors" title="Reject">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
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
      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-card-border rounded-2xl shadow-xs p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Order Details — {selected.id}</h3>
            <button onClick={() => setSelected(null)} className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {[
              { l: "Customer", v: selected.customerName },
              { l: "Origin", v: selected.origin },
              { l: "Destination", v: selected.destination },
              { l: "Vehicle", v: selected.vehicleType },
              { l: "Weight", v: selected.weight },
              { l: "Date", v: selected.date },
            ].map(({ l, v }) => (
              <div key={l} className="p-3 bg-muted/40 rounded-xl">
                <p className="text-muted-foreground text-xs mb-0.5">{l}</p>
                <p className="font-medium text-foreground">{v}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
