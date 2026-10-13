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

D1 rejects individual strings and rows over 2,000,000 bytes. Preserve approved oversized source values losslessly in a snapshot-scoped chunk table, with byte length and SHA-256 metadata and a reversible marker in the original field. Any later D1-backed read path must reassemble and verify these values before cutover. When source FK violations already exist, preserve their rows and document each affected constraint; do not silently repair or delete orphans.

**Why:** Cloudflare D1 enforces its row/value limit, while existing production snapshots may contain larger embedded files and pre-existing orphan references.

**How to apply:** Preflight all SQLite cells and rows before creating D1 objects. Put only specifically approved large fields in a sidecar chunk store, then verify reconstructed hashes and exact source-to-target values. Defer app cutover until chunk reassembly and any required orphan remediation are addressed.

R2 production backups at `db-backups/erp.db` can be overwritten, and this account's R2 API does not implement `ListObjectVersions`. Do not discard the downloaded SQLite snapshot before exact D1 read-back finishes. If the R2 object changes while a staged migration is being checked, compare every existing D1 value against one fixed newer snapshot, record changed old/new values before updates, and only import additions proven to be append-only.

**Why:** The D1 copy lagged behind the R2 backup while verification ran: a later snapshot added audit rows and updated existing cells. Object version listing could not retrieve the earlier object, so the staged D1 copy had to be reconciled to a newer snapshot with an audit log before exact verification.

**How to apply:** Treat a row-count match as insufficient. Verify all current D1 rows and values, refuse deletion/non-append drift, retain before/after values for approved changes, and repeat exact read-back against the captured R2 file before marking the D1 copy complete.
