import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

const STATES = [
  "سطحة محملة", "قلاب محمل", "بلكر محمل",
  "راس فقط", "رجوع خالي", "عطل / صيانة", "فحص",
];

router.get("/trip-bonus-rates", (_req, res) => {
  const rows = db.prepare("SELECT * FROM trip_bonus_rates ORDER BY id").all();
  res.json(rows);
});

router.put("/trip-bonus-rates/:state", (req, res) => {
  const state = decodeURIComponent(req.params.state);
  const rate = parseFloat(req.body.rate_per_km) || 0;
  const existing = db.prepare("SELECT id FROM trip_bonus_rates WHERE state=?").get(state);
  if (!existing) return void res.status(404).json({ error: "حالة غير موجودة" });
  db.prepare(
    "UPDATE trip_bonus_rates SET rate_per_km=?, updated_at=datetime('now') WHERE state=?"
  ).run(rate, state);
  res.json({ message: "تم الحفظ" });
});

// POST /trip-bonus-rates — add new vehicle type bonus
router.post("/trip-bonus-rates", (req, res) => {
  const { state, rate_per_km } = req.body as { state: string; rate_per_km?: number };
  if (!state || !state.trim()) return void res.status(400).json({ error: "اسم نوع السيارة مطلوب" });
  const existing = db.prepare("SELECT id FROM trip_bonus_rates WHERE state=?").get(state.trim());
  if (existing) return void res.status(409).json({ error: "هذا النوع موجود مسبقاً" });
  const r = db.prepare(
    "INSERT INTO trip_bonus_rates (state, rate_per_km, updated_at) VALUES (?, ?, datetime('now'))"
  ).run(state.trim(), parseFloat(String(rate_per_km)) || 0);
  res.status(201).json({ id: r.lastInsertRowid, message: "تم الإضافة" });
});

// DELETE /trip-bonus-rates/:state — delete a vehicle type bonus
router.delete("/trip-bonus-rates/:state", (req, res) => {
  const state = decodeURIComponent(req.params.state);
  db.prepare("DELETE FROM trip_bonus_rates WHERE state=?").run(state);
  res.json({ message: "تم الحذف" });
});

router.get("/driver-bonus-summary", (req, res) => {
  const { phone, month } = req.query as Record<string, string>;
  if (!phone) return void res.status(400).json({ error: "يجب تحديد رقم الجوال" });

  const prefix = month || new Date().toISOString().slice(0, 7);

  // ── Distance-based trip bonuses ──────────────────────────────────────────
  const trips = db.prepare(
    `SELECT t.trip_state, t.distance_km, COALESCE(t.route_bonus,0) AS route_bonus,
            t.notes, t.client_request_id, route_child.status AS routing_child_status
     FROM trips t
     LEFT JOIN supply_request_trips route_child
       ON t.client_request_id = 'routing-trip:' || route_child.id
     WHERE (CASE
              WHEN t.client_request_id LIKE 'routing-trip:%'
                THEN CASE WHEN route_child.status='completed' THEN route_child.updated_at END
              ELSE t.date
            END) LIKE ?
       AND (t.driver_phone=? OR (
         t.driver_phone IS NULL
         AND t.driver_name IN (SELECT name FROM users WHERE phone=?)
       ))`
  ).all(`${prefix}%`, phone, phone) as {
    trip_state: string; distance_km: number; route_bonus: number; notes: string | null;
    client_request_id: string | null; routing_child_status: string | null;
  }[];

  const rates = db.prepare("SELECT state, rate_per_km FROM trip_bonus_rates").all() as { state: string; rate_per_km: number }[];
  const rateMap: Record<string, number> = {};
  rates.forEach(r => { rateMap[r.state] = r.rate_per_km; });

  const breakdown: { state: string; km: number; rate: number; bonus: number }[] = [];
  for (const t of trips) {
    const state = t.trip_state || "سطحة محملة";
    const km    = t.distance_km || 0;
    const rate  = rateMap[state] || 0;
    // Routing-dispatch trips already have a saved driver bonus. Do not
    // recalculate one from distance, even when the saved amount is zero.
    const isKeyedRoutingTrip = t.client_request_id?.startsWith("routing-trip:") || false;
    const bonus = isKeyedRoutingTrip
      ? t.routing_child_status === "completed" ? (t.route_bonus || 0) : 0
      : (t.notes?.startsWith("توجيه #") || t.notes?.startsWith("بلكر #")) ? (t.route_bonus || 0) : km * rate;
    const existing = breakdown.find(b => b.state === state);
    if (existing) { existing.km += km; existing.bonus += bonus; }
    else breakdown.push({ state, km, rate, bonus });
  }

  const trip_bonus = breakdown.reduce((s, b) => s + b.bonus, 0);

  // ── Workflow order bonuses (delivered orders) ────────────────────────────
  const orderBonusRow = db.prepare(`
    SELECT COALESCE(SUM(driver_bonus),0) as total
    FROM workflow_orders
    WHERE driver_phone=? AND stage='delivered'
      AND substr(created_at,1,7)=?
  `).get(phone, prefix) as { total: number };
  const order_bonus = orderBonusRow.total || 0;

  // ── External rental bonuses (confirmed rentals) ──────────────────────────
  const rentalBonusRow = db.prepare(`
    SELECT COALESCE(SUM(driver_bonus),0) as total
    FROM external_rentals
    WHERE driver_phone=? AND status='confirmed'
      AND substr(assigned_at,1,7)=?
  `).get(phone, prefix) as { total: number };
  const rental_bonus = rentalBonusRow.total || 0;

  // ── Supply trip bonuses (completed routing dispatch trips) ───────────────
  const supplyBonusRow = db.prepare(`
    SELECT COALESCE(SUM(sr.rental),0) as total
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id = t.supply_request_id
    WHERE t.driver_phone=? AND t.status='completed'
      AND sr.routing_dispatch_id IS NULL
      AND substr(COALESCE(t.delivered_at, t.updated_at),1,7)=?
  `).get(phone, prefix) as { total: number };
  const supply_trip_bonus = supplyBonusRow.total || 0;

  const gross_bonus = trip_bonus + order_bonus + rental_bonus + supply_trip_bonus;

  const dieselRows = db.prepare(
    "SELECT SUM(amount) as total FROM driver_expenses WHERE driver_phone=? AND expense_type='ديزل' AND expense_date LIKE ?"
  ).get(phone, `${prefix}%`) as { total: number | null };

  const total_diesel = dieselRows.total || 0;
  const net_bonus    = gross_bonus - total_diesel;

  res.json({
    month: prefix, gross_bonus, trip_bonus, order_bonus, rental_bonus, supply_trip_bonus,
    total_diesel, net_bonus, breakdown,
  });
});

/**
 * Lookup driver bonus for a trip from the tariffs table.
 * Exact vehicle_type match first, then NULL/empty fallback.
 * route_bonus_rates data was migrated into tariffs.bonus_amount on startup.
 */
export function lookupRouteBonus(from_region: string, to_region: string, vehicle_type: string): number {
  if (!from_region || !to_region) return 0;
  const exact = db.prepare(`
    SELECT driver_expense FROM tariffs
    WHERE loading_place=? AND unloading_place=? AND vehicle_type=?
    LIMIT 1
  `).get(from_region, to_region, vehicle_type) as {driver_expense:number}|undefined;
  if (exact) return exact.driver_expense || 0;

  const fallback = db.prepare(`
    SELECT driver_expense FROM tariffs
    WHERE loading_place=? AND unloading_place=? AND (vehicle_type='الكل' OR vehicle_type IS NULL OR vehicle_type='')
    LIMIT 1
  `).get(from_region, to_region) as {driver_expense:number}|undefined;
  return fallback?.driver_expense || 0;
}

export default router;
