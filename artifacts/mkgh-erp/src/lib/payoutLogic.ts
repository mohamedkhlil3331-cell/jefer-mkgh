import type { TruckType } from "../mockData";

// ─────────────────────────────────────────────────────────────────────────────
// Driver Payout Engine
// Formula: Net_Pay = Trip_Rate - Fuel_Cost
// ─────────────────────────────────────────────────────────────────────────────

/** Base trip rate in SAR per completed trip, keyed by truck type */
export const TRIP_RATES: Record<string, number> = {
  Bulker:              400,
  "Heavy Truck":       400, // maps to Bulker
  Flatbed:             360,
  Tipper:              300,
  Van:                 300, // maps to Tipper class
  "Refrigerated Truck": 380,
};

/** Average fuel cost per trip by truck type */
export const AVG_FUEL_COST: Record<string, number> = {
  Bulker:              120,
  "Heavy Truck":       120,
  Flatbed:              95,
  Tipper:               75,
  Van:                  55,
  "Refrigerated Truck": 110,
};

export interface PayoutResult {
  tripRate: number;
  fuelCost: number;
  netPay: number;
  truckCategory: string;
}

/**
 * Calculate driver net pay for a single trip.
 * Net_Pay = Trip_Rate - Fuel_Cost
 */
export function calculateTripPayout(truckType: TruckType, actualFuelCost?: number): PayoutResult {
  const tripRate = TRIP_RATES[truckType] ?? 300;
  const fuelCost = actualFuelCost ?? AVG_FUEL_COST[truckType] ?? 75;
  const netPay = Math.max(0, tripRate - fuelCost);

  const categoryMap: Record<string, string> = {
    "Heavy Truck": "Bulker",
    "Refrigerated Truck": "Refrigerated",
    Van: "Tipper Class",
  };

  return {
    tripRate,
    fuelCost,
    netPay,
    truckCategory: categoryMap[truckType] ?? truckType,
  };
}

/**
 * Calculate cumulative payout for a driver over all their trips.
 */
export function calculateTotalPayout(
  truckType: TruckType,
  totalTrips: number,
  totalFuelCost: number
): { totalGross: number; totalFuel: number; totalNet: number } {
  const tripRate = TRIP_RATES[truckType] ?? 300;
  const totalGross = tripRate * totalTrips;
  const totalNet = Math.max(0, totalGross - totalFuelCost);
  return { totalGross, totalFuel: totalFuelCost, totalNet };
}

/** Format SAR currency */
export function formatSAR(amount: number): string {
  return `SAR ${amount.toLocaleString("en-SA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
