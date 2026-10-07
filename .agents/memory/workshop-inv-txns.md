---
name: Workshop inventory transactions schema
description: Key facts about workshop_inventory_transactions table and how spare parts link to vehicles/maintenance cards
---

## The rule
`workshop_inventory_transactions` has NO `unit` column. To get the unit you must LEFT JOIN with `workshop_inventory` on `item_id`.

## vehicle_no column — Supabase schema gap (critical)
The `vehicle_no` column was added to SQLite via `ALTER TABLE` in `db.ts`, but was MISSING from `schema-pg.ts` (Supabase schema). This caused mirrorWrite to fail silently for any insert that included `vehicle_no`, so the value was never persisted to Supabase. On restart, loadFromPg restored NULL vehicle_no for all rows.

**Fix applied:** Added `vehicle_no TEXT` to both:
1. `CREATE TABLE IF NOT EXISTS workshop_inventory_transactions` in schema-pg.ts
2. `ALTER TABLE workshop_inventory_transactions ADD COLUMN IF NOT EXISTS vehicle_no TEXT` migration at end of initSchema()

**Pattern to follow:** Any SQLite ALTER TABLE in db.ts that adds a column MUST have a matching `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in schema-pg.ts or the value will be silently lost on restart.

## Linking parts to a vehicle (query conditions in /vehicle-parts/:plate)
Four conditions in OR to match out-transactions to a vehicle plate:
1. `wit.vehicle_no = ?` — direct plate stored on transaction (new flow, after fix)
2. `CAST(wit.reference_no AS TEXT) = CAST(? AS TEXT)` — bulk-imported rows have reference_no = plate directly
3. EXISTS on maintenance_logs where card_number = reference_no AND vehicle_plate = plate (maintenance card flow)
4. EXISTS on workshop_jobs where reference_no = 'أمر_عمل_#' || job_id AND vehicle_plate = plate (workshop job inventory dispatch)

## Linking parts to maintenance cards
- `reason = 'سجل_عطل'`
- `type = 'out'`
- `reference_no = card_number` (the maintenance log card number string)
- `vehicle_no = vehicle_plate` (set correctly in POST /maintenance-logs handler)

## Workshop job inventory dispatch
When `invoice_target = 'inventory'` on a workshop job, `logInventoryTransaction` is called with:
- `reason = 'صرف_أمر_عمل'`
- `reference_no = 'أمر_عمل_#' + jobId`
- `vehicle_no = vehicle_plate` (fixed — was missing before)

**How to apply:** When joining transactions back to maintenance logs, always do:
```sql
SELECT t.item_name, t.quantity, t.cost_per_unit, t.reference_no,
       COALESCE(i.unit, 'قطعة') AS unit
FROM workshop_inventory_transactions t
LEFT JOIN workshop_inventory i ON t.item_id = i.id
WHERE t.reason='سجل_عطل' AND t.type='out' AND t.reference_no IN (...)
```
