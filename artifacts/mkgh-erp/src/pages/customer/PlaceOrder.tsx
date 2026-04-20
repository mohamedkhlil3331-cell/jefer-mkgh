import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, CheckCircle2, ChevronRight } from "lucide-react";

const vehicleTypes = ["Van", "Heavy Truck", "Flatbed", "Refrigerated Truck", "Tanker"];
const saudiCities = ["Riyadh", "Jeddah", "Dammam", "Mecca", "Medina", "Tabuk", "Abha", "Yanbu", "Jubail", "Taif"];

export default function PlaceOrder() {
  const [form, setForm] = useState({
    origin: "", destination: "", vehicleType: "", weight: "", description: "", urgent: false
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orderId] = useState(`ORD-${String(Math.floor(Math.random() * 9000 + 1000))}`);

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">Place New Order</h2>
        <p className="text-muted-foreground text-sm mt-1">Fill in shipment details to create a new freight order</p>
      </div>

      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-card-border rounded-2xl p-10 text-center shadow-xs"
          >
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Order Placed Successfully</h3>
            <p className="text-muted-foreground text-sm mb-4">Your shipment has been registered and is pending review.</p>
            <div className="inline-flex items-center gap-2 bg-muted px-4 py-2 rounded-xl text-sm font-medium text-foreground mb-6">
              Order ID: <span className="text-[#f97316] font-bold">{orderId}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-left text-sm border-t border-border pt-6">
              {[
                { l: "Origin", v: form.origin },
                { l: "Destination", v: form.destination },
                { l: "Vehicle", v: form.vehicleType },
                { l: "Weight", v: form.weight ? `${form.weight} tons` : "—" },
              ].map(({ l, v }) => (
                <div key={l}>
                  <p className="text-muted-foreground text-xs">{l}</p>
                  <p className="font-medium text-foreground">{v || "—"}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setSubmitted(false); setForm({ origin: "", destination: "", vehicleType: "", weight: "", description: "", urgent: false }); }}
              className="mt-6 px-6 py-2.5 rounded-xl mkgh-gradient-orange text-white text-sm font-semibold hover:opacity-90 transition-all"
            >
              Place Another Order
            </button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <Package className="w-4 h-4 text-orange-600" />
              </div>
              <span className="font-semibold text-foreground text-sm">Shipment Details</span>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Origin City *</label>
                  <select name="origin" value={form.origin} onChange={handle} required
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                    <option value="">Select city</option>
                    {saudiCities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Destination City *</label>
                  <select name="destination" value={form.destination} onChange={handle} required
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                    <option value="">Select city</option>
                    {saudiCities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Vehicle Type *</label>
                  <select name="vehicleType" value={form.vehicleType} onChange={handle} required
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                    <option value="">Select vehicle</option>
                    {vehicleTypes.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Cargo Weight (tons)</label>
                  <input name="weight" type="number" min="0.1" step="0.1" value={form.weight} onChange={handle}
                    placeholder="e.g. 12.5"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
                <textarea name="description" value={form.description} onChange={handle as any} rows={3}
                  placeholder="Describe the cargo (type, special handling, etc.)"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" />
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none group">
                <div className={`relative w-11 h-6 rounded-full transition-all ${form.urgent ? "bg-[#f97316]" : "bg-muted"}`}
                  onClick={() => setForm(f => ({ ...f, urgent: !f.urgent }))}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.urgent ? "left-6" : "left-1"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Urgent Shipment</p>
                  <p className="text-xs text-muted-foreground">Priority handling with same-day pickup</p>
                </div>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl mkgh-gradient-orange text-white font-semibold text-sm shadow hover:opacity-90 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting...
                  </>
                ) : (
                  <>Submit Order <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
