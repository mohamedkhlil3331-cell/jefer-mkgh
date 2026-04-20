import { useState } from "react";
import { motion } from "framer-motion";
import { Calculator, Banknote, Fuel, TrendingUp, Info } from "lucide-react";
import { TRIP_RATES, AVG_FUEL_COST, calculateTripPayout, calculateTotalPayout, formatSAR } from "../lib/payoutLogic";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type { TruckType } from "../mockData";

const TRUCK_TYPES: TruckType[] = ["Bulker", "Flatbed", "Tipper", "Heavy Truck", "Van", "Refrigerated Truck"];

export default function PayoutCalculator() {
  const { user } = useAuth();
  const { drivers } = useAppData();

  const myDriver = drivers.find((d) => d.id === user?.driverId);
  const defaultTruck = myDriver?.truckType ?? "Flatbed";

  const [truckType, setTruckType] = useState<TruckType>(defaultTruck);
  const [trips, setTrips] = useState(10);
  const [fuelCost, setFuelCost] = useState(AVG_FUEL_COST[defaultTruck] ?? 95);

  const single = calculateTripPayout(truckType, fuelCost);
  const total = calculateTotalPayout(truckType, trips, fuelCost * trips);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-foreground">Payout Calculator</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Calculate driver net pay using: <span className="text-foreground font-medium">Net_Pay = Trip_Rate − Fuel_Cost</span>
        </p>
      </div>

      {/* Rate reference table */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground">Trip Rate Schedule</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { type: "Bulker", rate: 400, fuel: 120 },
            { type: "Flatbed", rate: 360, fuel: 95 },
            { type: "Tipper", rate: 300, fuel: 75 },
          ].map((r) => (
            <div key={r.type} className="p-3 bg-white/4 rounded-xl text-center">
              <p className="text-xs text-muted-foreground mb-1">{r.type}</p>
              <p className="text-lg font-bold text-[#f97316]">{r.rate} SAR</p>
              <p className="text-[10px] text-muted-foreground">fuel ~{r.fuel} SAR</p>
            </div>
          ))}
        </div>
      </div>

      {/* Calculator form */}
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Truck Type</label>
          <div className="grid grid-cols-3 gap-2">
            {TRUCK_TYPES.map((t) => (
              <button key={t} onClick={() => { setTruckType(t); setFuelCost(AVG_FUEL_COST[t] ?? 75); }}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  truckType === t
                    ? "mkgh-gradient-orange text-white shadow-sm"
                    : "bg-white/5 text-muted-foreground hover:bg-white/8 hover:text-foreground"
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Number of Trips
            </label>
            <input type="number" value={trips} min={1}
              onChange={(e) => setTrips(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full glass-input rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Fuel Cost per Trip (SAR)
            </label>
            <input type="number" value={fuelCost} min={0}
              onChange={(e) => setFuelCost(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full glass-input rounded-xl px-3 py-2.5 text-sm" />
          </div>
        </div>
      </div>

      {/* Results */}
      <motion.div
        key={`${truckType}-${trips}-${fuelCost}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Per-trip breakdown */}
        <div className="glass-card-elevated rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Per-Trip Breakdown</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Trip Rate ({single.truckCategory})
              </div>
              <span className="text-sm font-semibold text-blue-400">{formatSAR(single.tripRate)}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Fuel className="w-4 h-4 text-red-400" />
                Fuel Cost
              </div>
              <span className="text-sm font-semibold text-red-400">− {formatSAR(single.fuelCost)}</span>
            </div>
            <div className="h-px bg-white/8" />
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Banknote className="w-4 h-4 text-[#f97316]" />
                Net Pay / Trip
              </div>
              <span className="text-lg font-bold text-[#f97316]">{formatSAR(single.netPay)}</span>
            </div>
          </div>
        </div>

        {/* Total payout */}
        <div className="glass-card-elevated rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Total for {trips} Trip{trips !== 1 ? "s" : ""}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Gross", value: formatSAR(total.totalGross), color: "text-blue-400" },
              { label: "Fuel", value: `− ${formatSAR(total.totalFuel)}`, color: "text-red-400" },
              { label: "Net Total", value: formatSAR(total.totalNet), color: "text-[#f97316]" },
            ].map((s) => (
              <div key={s.label} className="p-4 bg-white/4 rounded-xl text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Formula explanation */}
        <div className="flex items-center gap-3 p-4 bg-white/3 rounded-2xl border border-white/6">
          <Calculator className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">Formula: </span>
            Net_Pay = Trip_Rate − Fuel_Cost →{" "}
            <span className="text-blue-400">{single.tripRate}</span>
            {" − "}
            <span className="text-red-400">{single.fuelCost}</span>
            {" = "}
            <span className="text-[#f97316] font-bold">{single.netPay} SAR</span>
            {" per trip"}
          </p>
        </div>
      </motion.div>

      {/* Driver payout list (supervisor view) */}
      {user?.role === "supervisor" && (
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">All Driver Payouts</h3>
          <div className="space-y-3">
            {drivers.map((d) => {
              const p = calculateTripPayout(d.truckType);
              return (
                <div key={d.id} className="flex items-center gap-3 p-3 bg-white/3 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-[#f97316]/15 flex items-center justify-center text-xs font-bold text-[#f97316] flex-shrink-0">
                    {d.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.truckType} · {d.trips} trips</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#f97316]">{formatSAR(p.netPay)}/trip</p>
                    <p className="text-xs text-muted-foreground">{formatSAR(d.totalEarnings)} total</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
