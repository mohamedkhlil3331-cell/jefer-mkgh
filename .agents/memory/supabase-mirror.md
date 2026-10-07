---
name: Supabase mirror strategy
description: How the MKGH ERP persists data to Supabase without rewriting routes
---

## The rule
SQLite (better-sqlite3) is the synchronous runtime DB. Supabase PostgreSQL is the durable store. On startup, data loads from Supabase into SQLite. Every write is mirrored to Supabase asynchronously.

**Why:** Replit containers are ephemeral — SQLite files are lost on restart. Object storage backup had a 30-minute window of data loss. Supabase pooler solves this with zero route changes.

**How to apply:** `pg-mirror.ts` exports two functions:
- `loadFromPg(db)` — called once at startup in `index.ts`, disables FK checks, loads all tables from Supabase into SQLite
- `wrapDb(db)` — monkey-patches `db.prepare().run()` to fire an async mirror write to Supabase after every SQLite write

Routes use `db.prepare().get/.all/.run()` unchanged — no async needed.

## Supabase connection
- Use **Transaction Pooler** URL (port 6543), NOT direct connection (port 5432, IPv6-only, unreachable from Replit)
- Pooler host: `aws-1-ap-northeast-2.pooler.supabase.com`
- URL stored in secret `SUPABASE_DATABASE_URL` — may lack `/postgres` path suffix; `pool.ts` and `pg-mirror.ts` both append it when missing
- Password special chars: `@` → `%40`, `$` → `%24`

## Key files
- `artifacts/api-server/src/lib/pg-mirror.ts` — mirror logic + loadFromPg
- `artifacts/api-server/src/lib/pool.ts` — pg Pool singleton (used only by pg-mirror)
- `artifacts/api-server/src/index.ts` — calls wrapDb + loadFromPg before serving
- `artifacts/api-server/scripts/migrate-to-pg.mjs` — one-time SQLite→Supabase data migration

## Migration already done
All 53 tables migrated. Data verified in Supabase. Mirror confirmed working (session count increments in Supabase on each login).
