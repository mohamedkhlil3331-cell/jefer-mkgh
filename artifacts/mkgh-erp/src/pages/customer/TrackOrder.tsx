import { useState } from "react";
import { motion } from "framer-motion";
import { Search, MapPin, Package, CheckCircle2, Truck, Clock } from "lucide-react";
import { useAppData } from "../../context/AppDataContext";
import { StatusBadge } from "../../components/StatusBadge";
import type { Order } from "../../mockData";

const trackingSteps: Record<string, { step: number; label: string; done: boolean }[]> = {
  Pending:    [{ step: 1, label: "Order Placed", done: true }, { step: 2, label: "Processing", done: false }, { step: 3, label: "Picked Up", done: false }, { step: 4, label: "In Transit", done: false }, { step: 5, label: "Delivered", done: false }],
  Processing: [{ step: 1, label: "Order Placed", done: true }, { step: 2, label: "Processing", done: true }, { step: 3, label: "Picked Up", done: false }, { step: 4, label: "In Transit", done: false }, { step: 5, label: "Delivered", done: false }],
  "In Transit":[{ step: 1, label: "Order Placed", done: true }, { step: 2, label: "Processing", done: true }, { step: 3, label: "Picked Up", done: true }, { step: 4, label: "In Transit", done: true }, { step: 5, label: "Delivered", done: false }],
  Delivered:  [{ step: 1, label: "Order Placed", done: true }, { step: 2, label: "Processing", done: true }, { step: 3, label: "Picked Up", done: true }, { step: 4, label: "In Transit", done: true }, { step: 5, label: "Delivered", done: true }],
  Cancelled:  [{ step: 1, label: "Order Placed", done: true }, { step: 2, label: "Cancelled", done: true }, { step: 3, label: "Picked Up", done: false }, { step: 4, label: "In Transit", done: false }, { step: 5, label: "Delivered", done: false }],
};

const stepIcons = [Package, Clock, Truck, MapPin, CheckCircle2];

export default function TrackOrder() {
  const { orders } = useAppData();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);

  const filtered = query.trim()
    ? orders.filter((o) => o.id.toLowerCase().includes(query.toLowerCase()) || o.customerName.toLowerCase().includes(query.toLowerCase()))
    : orders;

  const steps = selected ? (trackingSteps[selected.status] ?? trackingSteps.Pending) : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Track Orders</h2>
        <p className="text-muted-foreground text-sm mt-1">Search by order ID or customer name</p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search orders (e.g. ORD-0001)"
          className="w-full pl-11 pr-4 py-3 glass-input rounded-xl text-sm" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Order list */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/8">
            <h3 className="font-semibold text-foreground text-sm">Orders ({filtered.length})</h3>
          </div>
          <div className="divide-y divide-white/5 max-h-[480px] overflow-y-auto">
            {filtered.map((order) => (
              <button key={order.id} onClick={() => setSelected(order)}
                className={`w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-white/5 transition-colors ${selected?.id === order.id ? "bg-white/8" : ""}`}>
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{order.id}</p>
                  <p className="text-xs text-muted-foreground truncate">{order.origin} → {order.destination}</p>
                </div>
                <StatusBadge status={order.status} size="sm" />
              </button>
            ))}
          </div>
        </div>

        {/* Tracking detail */}
        <motion.div key={selected?.id ?? "empty"} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }} className="glass-card rounded-2xl">
          {selected ? (
            <div>
              <div className="px-5 py-4 border-b border-white/8">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-foreground">{selected.id}</h3>
                  <StatusBadge status={selected.status} />
                </div>
                <p className="text-muted-foreground text-xs">{selected.customerName} · {selected.vehicleType} · {selected.weight}</p>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-3 p-4 bg-white/4 rounded-xl mb-5">
                  <div className="text-center flex-1">
                    <p className="text-xs text-muted-foreground mb-1">From</p>
                    <p className="text-sm font-semibold text-foreground">{selected.origin}</p>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-full h-px bg-white/10 relative">
                      <Truck className="absolute left-1/2 -translate-x-1/2 -top-3 w-5 h-5 text-[#f97316]" />
                    </div>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-xs text-muted-foreground mb-1">To</p>
                    <p className="text-sm font-semibold text-foreground">{selected.destination}</p>
                  </div>
                </div>
                <div className="space-y-0">
                  {steps.map((s, i) => {
                    const Icon = stepIcons[i] ?? CheckCircle2;
                    const isLast = i === steps.length - 1;
                    return (
                      <div key={s.step} className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${s.done ? "bg-[#f97316] border-[#f97316] text-white" : "bg-white/5 border-white/15 text-muted-foreground"}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          {!isLast && <div className={`w-0.5 h-6 ${s.done && steps[i + 1]?.done ? "bg-[#f97316]" : "bg-white/10"}`} />}
                        </div>
                        <p className={`text-sm pt-1.5 ${s.done ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-center px-6">
              <MapPin className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">Select an order to see tracking details</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
