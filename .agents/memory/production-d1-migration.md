---
name: Production D1 migration boundary
description: User-approved separation and cutover constraints for moving the ERP production database to Cloudflare D1.
---

Production should use Cloudflare D1 for SQL and R2 for files while the app runtime stays on Replit. Development must remain on its existing SQLite database and its separate `db-backups/erp.db.dev` object. Keep the current production SQLite backup intact as a rollback source until the full D1 copy and application behavior are validated; do not switch the published app before that check. The user explicitly wants all published application data to be written to D1 after migration, not a partial or split database.

**Why:** The user explicitly wants production moved without disturbing development data or prematurely cutting over the published ERP.

**How to apply:** Use the latest published production backup (`db-backups/erp.db`) as the migration source. Treat production data migration, app-code conversion, and published cutover as separate validation gates. Enable D1 only after all production data is migrated and validated, and all published SQL paths are ready to use it.

Cloudflare's Replit connector API paths are relative to `/client`, so requests use `/v4/...` (not `/client/v4/...` and not `/accounts/...`). D1 queries are asynchronous; the current ERP API has widespread synchronous `better-sqlite3` usage, so the runtime conversion cannot be achieved by only swapping a database client.

**Why:** The connector returns HTTP 404/code 10404 for paths with the wrong prefix, and the ERP currently depends on synchronous SQLite operations.

**How to apply:** Verify a read-only D1 query through the existing `cloudflare` connector before relying on runtime access. Plan an explicit asynchronous data-access conversion rather than assuming a transparent synchronous D1 replacement.
