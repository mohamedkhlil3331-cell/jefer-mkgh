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

Cloudflare D1 HTTP API writes require the API token's `D1:Edit` permission; `D1:Read` plus edit access to another product is no longer sufficient. Migrations that insert data in multiple remote requests can also leave D1 ahead of its table-level progress manifest when a later request fails. A failed command does not prove that no rows were written; resume only after exact rowid/value comparison against a fixed source snapshot, and adopt only verified append-prefix progress.

**Why:** Cloudflare fixed a D1 HTTP API permissions bug, and repeated 403 responses can leave earlier migration requests committed while the recorded table progress lags behind.

**How to apply:** Ensure the existing Cloudflare connection has D1 write permission before migrating. Preserve a failed source snapshot, compare all existing source-backed D1 rows, reject count decreases or non-append differences, and never replay from an old manifest count without verification.

Cloudflare D1 SQL imports can reject oversized literal `INSERT` statements with `SQLITE_TOOBIG`, and import jobs can reset if they are not polled promptly. Split large exports into smaller statement-complete chunks, poll each job continuously, and insert oversized rows with bound parameters. If triggers block historical inserts, disable them only on the replica during import and restore their exact source definitions before checking parity.

**Why:** A full export exceeded D1's statement limit, and one large import timed out before polling; later chunks succeeded, while several large image rows required parameterized inserts.

**How to apply:** Keep the source database untouched. Verify each chunk's completion before proceeding, record which large rows were parameterized, then compare every application table's row count and restore triggers before declaring the replica synchronized.

D1 query batches can hit a lower SQL bind-variable ceiling than SQLite, especially when verification statements bind long lists of preserved row IDs.

**Why:** A read-only comparison failed with “too many SQL variables” before any database writes when the preserved-row exclusion list was bound as parameters.

**How to apply:** Keep D1 verification batches small. For exclusion lists, embed only IDs validated as safe integers into SQL literals; keep other values parameterized and verify before any write.

Cloudflare D1 Time Travel provides automatic bookmarks for backups, but restoring to a bookmark cancels in-flight queries and transactions. SQL export/import also makes the target D1 unavailable to serve queries. The app-side Cloudflare connector rejected D1 export POSTs even though Time Travel bookmark/restore calls worked. The user does not accept interruption on the active primary.

**Why:** Cloudflare documents query cancellation during Time Travel restore; live tests succeeded when restore targeted only a separate writable shadow and the R2-backed mutation journal caught it up.

**How to apply:** Capture a bookmark under the replica replay lock, restore only the writable shadow, clear the restored lock, replay ordered R2-journaled operations, then require exact parity. Do not claim the archive is a portable SQL backup, and never restore the active primary as part of a zero-downtime operation.

Keep the production D1 startup gate closed until every route and schema check passes and source-to-target data parity is verified. Development stays on its separate SQLite database and backup.

**Why:** The user approved building and testing the D1 path without switching the published app; the existing development database and production SQLite rollback source must remain intact.

**How to apply:** Keep D1 IDs and feature flags test-only until all API routes pass against migrated test data and exact parity checks; never flip the published backend as an automatic consequence of a successful synthetic integration test.

Preflight the primary and replica independently. An empty replication outbox and a zero replica sequence do not establish data parity; either database may contain target-only records that are absent from the current source snapshot.

**Why:** The D1 primary and replica had different session rows despite no pending replication operations, so a primary-only preflight would have missed the replica's extra records.

**How to apply:** Compare exact source values, append candidates, and target-only row IDs against each D1 database separately. Preserve target-only rows unless the user explicitly approves their removal.

The Cloudflare Worker import graph must not statically load `db-sync`; keep runtime-mode checks and backup-writer status in SQLite-free modules, and load legacy database/storage services only inside their Replit/SQLite-only paths.

**Why:** Importing the Express app can transitively evaluate `better-sqlite3` and Replit storage clients before any route is called, even when D1 and R2 are selected.

**How to apply:** Before Worker runtime tests, inspect static imports from the Worker entry and defer SQLite, local-filesystem, and Replit sidecar modules to branches that are unreachable in Worker mode.

New D1 databases may contain a Cloudflare-managed `_cf_KV` table before application tables are created.

**Why:** Live tests against newly created empty D1 databases showed `_cf_KV` even though no user or application data had been added.

**How to apply:** When asserting that an isolated test D1 database is empty, ignore only `_cf_KV`; do not broadly ignore other tables.

Some `dev_audit_log.path` values can trigger HTTP 403 when sent as ordinary D1 query parameters through the Cloudflare connector. A UTF-8 hex literal cast back to TEXT preserved exact values and passed read-back verification.

**Why:** The proxy rejected selected path strings in the request payload even though the same query shape and other fields succeeded.

**How to apply:** Isolate the failing column with a duplicate-key no-op probe, encode only the confirmed field as a safe hex literal, then require full exact-value verification; never drop or rewrite the source data.

When a source column is missing in D1, compare against the value D1 will expose after the planned `ALTER TABLE`, including a constant schema default; do not model every missing column as `NULL`. Verify the Cloudflare database name and role before using `ERP_D1_REPLICA_DATABASE_ID`, since it may point to a shadow-test database rather than the production replica.

**Why:** Treating a missing column as `NULL` overstated reconciliation changes for columns with defaults, and the configured replica ID pointed to a shadow-test database while the production replica had a different name.

**How to apply:** Derive safe constant defaults from the pinned source schema and use them in both the preflight projection and `ALTER TABLE`. Confirm primary and replica names in Cloudflare before any D1 write; never write to a shadow target as a substitute for the production replica.

Data parity does not prove schema parity. A copied D1 database can still be missing a column that a real route writes, so schema checks and route-level write/read tests are separate cutover gates.

**Why:** Authentication on the isolated shadow failed because its `sessions` table lacked `created_at`, which the login route inserts, even though other core route writes succeeded.

**How to apply:** Compare the D1 table definitions with the application schema, then exercise each critical route's actual insert/update path against an isolated shadow before enabling production traffic.

For large D1 reconciliations, send several parameterized insert statements per atomic batch request rather than one request per statement. Keep the batch within D1's statement and payload limits, validate every returned change count, and retain the request delay. If a run stops, recover only after exact source-row/value verification.

**Why:** A one-second delay between individual write requests can make a tens-of-thousands-row migration exceed its timeout; batching reduces network calls without weakening per-statement change checks.

**How to apply:** Use small atomic batches (currently five statements), verify each result's reported changes, and resume an interrupted run only with verified-progress recovery against the same pinned snapshot.

Replica session rows can share a token and identical application fields with source rows while having different implicit row IDs. Treat token plus all shared session fields as the logical identity before classifying such rows as target-only extras.

**Why:** The replica had 46 exact logical matches, 8 genuinely target-only sessions, and 9 source-only sessions; blindly appending all source rows violated the token primary key.

**How to apply:** Verify matches and row-ID availability without displaying tokens; align only the hidden row ID for exact matches, preserve unmatched D1 sessions unchanged, then append source-only sessions and require exact read-back.

After all application, data, and file validation gates pass, proceed with the production D1 cutover immediately; do not add another waiting period.

**Why:** The user explicitly requested immediate migration after validation because the prolonged delay is costing money.

**How to apply:** Finish the remaining checks without changing production traffic or runtime flags, then execute the approved cutover as soon as every gate is verified.
