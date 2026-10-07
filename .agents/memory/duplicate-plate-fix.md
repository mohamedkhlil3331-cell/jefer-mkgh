---
name: Duplicate plate fix pattern
description: Where to place startup cleanup guards when SQLite+Supabase mirror is involved
---

## The rule

Any "always delete this row" guard must be placed in **`index.ts` AFTER `wrapDb()`** — not in `db.ts` and not before `wrapDb`.

## Why

Startup order: `db.ts init → loadFromPg(db) → wrapDb(db) → [your guard here] → syncToPg (5s later)`

- A guard in `db.ts` runs *before* `loadFromPg`, so `loadFromPg` immediately re-inserts the row from Supabase.
- A guard *before* `wrapDb` deletes from SQLite but the delete is NOT mirrored to Supabase, so Supabase keeps the stale row, which gets restored on next restart.
- A guard *after* `wrapDb` deletes from SQLite AND the mirror fires a `pool.query DELETE` to Supabase. The 5-second `syncToPg` delay ensures the mirror completes first. Self-healing across restarts.

## How to apply

```ts
// index.ts — after wrapDb(db) call
wrapDb(db);

// ‼️ Remove legacy "PLATE" — duplicate of "PLATE أ ب ت" (id=N).
try { db.prepare("DELETE FROM fleet_vehicles WHERE plate_number=?").run("PLATE"); } catch {}
```

The guard in `db.ts` (before loadFromPg) is still useful as a secondary safety net for SQLite-only re-insertions (e.g. re-seeding from vehicleData), but it cannot fix Supabase-sourced duplicates on its own.
