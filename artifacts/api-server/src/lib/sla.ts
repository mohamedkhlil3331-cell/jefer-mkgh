/**
 * SLA Helper — getSlaStatus()
 * Computes the elapsed time and SLA status for any active order stage.
 *
 * Stage → start-timestamp column mapping (from existing workflow_orders fields):
 *   pending            → created_at
 *   pending_cash_approval → created_at
 *   payment_confirmed  → review_date  (set on confirm-payment / approve-cash)
 *   vehicle_assigned   → vehicle_assign_date
 *   invoiced           → invoice_date
 */
import db from "./db.js";

export type SlaStatusLevel = "ok" | "warning" | "breached";

export interface SlaStatus {
  stage: string;
  elapsed_minutes: number;
  limit_minutes: number;
  percent: number;           // 0–100+
  status: SlaStatusLevel;
}

// Stages covered by SLA (out-of-scope stages return null)
const STAGE_TIMESTAMP: Record<string, string> = {
  pending:               "created_at",
  pending_cash_approval: "created_at",
  payment_confirmed:     "review_date",
  vehicle_assigned:      "vehicle_assign_date",
  invoiced:              "invoice_date",
};

// Role responsible for each stage (gets the 75% warning)
export const STAGE_RESPONSIBLE_ROLE: Record<string, string> = {
  pending:               "reviewer",
  pending_cash_approval: "reviewer",
  payment_confirmed:     "supervisor",
  vehicle_assigned:      "warehouse",
  invoiced:              "warehouse",
};

type SlaRow = { stage: string; limit_minutes: number };

let _cachedSettings: Map<string, number> | null = null;
let _cacheTs = 0;

/** Returns a map of stage → limit_minutes, cached for 60 s */
export function getSlaSettings(): Map<string, number> {
  if (_cachedSettings && Date.now() - _cacheTs < 60_000) return _cachedSettings;
  const rows = db.prepare("SELECT stage, limit_minutes FROM sla_settings").all() as SlaRow[];
  const m = new Map<string, number>(rows.map(r => [r.stage, r.limit_minutes]));
  _cachedSettings = m;
  _cacheTs = Date.now();
  return m;
}

/** Invalidate cache (call after updating settings) */
export function invalidateSlaCache() {
  _cachedSettings = null;
}

/**
 * Compute SLA status for a single order.
 * Returns null when the current stage is not covered by SLA.
 */
export function getSlaStatus(
  order: Record<string, unknown>,
  settingsOverride?: Map<string, number>,
): SlaStatus | null {
  const stage = order.stage as string | undefined;
  if (!stage) return null;

  const tsCol = STAGE_TIMESTAMP[stage];
  if (!tsCol) return null;

  const tsVal = order[tsCol] as string | undefined;
  if (!tsVal) return null;

  const settings = settingsOverride ?? getSlaSettings();
  const limit = settings.get(stage);
  if (!limit) return null;

  const elapsed_minutes = (Date.now() - new Date(tsVal).getTime()) / 60_000;
  const percent = Math.round((elapsed_minutes / limit) * 100);

  let status: SlaStatusLevel = "ok";
  if (percent >= 100) status = "breached";
  else if (percent >= 75) status = "warning";

  return {
    stage,
    elapsed_minutes: Math.round(elapsed_minutes),
    limit_minutes: limit,
    percent,
    status,
  };
}
