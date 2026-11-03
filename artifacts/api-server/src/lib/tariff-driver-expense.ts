export type DriverExpenseMode = "fixed" | "per_km" | "tiered";

export type DriverExpenseTier = {
  km: number;
  rate: number;
};

export type TariffDriverExpense = {
  driver_expense?: number | string | null;
  driver_expense_mode?: DriverExpenseMode | string | null;
  driver_expense_rate_per_km?: number | string | null;
  driver_expense_segments_json?: string | null;
  km_per_route?: number | string | null;
};

export function parseDriverExpenseTiers(value: unknown): DriverExpenseTier[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tier): tier is DriverExpenseTier =>
      !!tier &&
      Number.isFinite(Number((tier as DriverExpenseTier).km)) &&
      Number((tier as DriverExpenseTier).km) > 0 &&
      Number.isFinite(Number((tier as DriverExpenseTier).rate)) &&
      Number((tier as DriverExpenseTier).rate) >= 0
    ).map(tier => ({ km: Number(tier.km), rate: Number(tier.rate) }));
  } catch {
    return [];
  }
}

export function calculateTariffDriverExpense(tariff: TariffDriverExpense): number {
  const fixed = Math.max(0, Number(tariff.driver_expense) || 0);
  const km = Number(tariff.km_per_route) || 0;
  const mode = tariff.driver_expense_mode || "fixed";

  if (km <= 0 || mode === "fixed") return fixed;

  if (mode === "per_km") {
    const rate = Number(tariff.driver_expense_rate_per_km);
    return Number.isFinite(rate) && rate >= 0 ? Math.round(km * rate) : fixed;
  }

  if (mode === "tiered") {
    const tiers = parseDriverExpenseTiers(tariff.driver_expense_segments_json);
    const totalKm = tiers.reduce((sum, tier) => sum + tier.km, 0);
    if (!tiers.length || Math.abs(totalKm - km) > 0.01) return fixed;
    return Math.round(tiers.reduce((sum, tier) => sum + tier.km * tier.rate, 0));
  }

  return fixed;
}
