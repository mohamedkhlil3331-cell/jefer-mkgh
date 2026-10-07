---
name: SQLite corruption recovery
description: Why opening SQLite successfully is not enough to prove an object-storage backup is healthy.
---

An object-storage SQLite backup can open and accept initial pragmas, then report `SQLITE_CORRUPT` only during later schema, seed, or application queries. Recovery around the database constructor alone is therefore insufficient.

**Why:** A restored development backup passed the existing open/pragma path but crashed the API during an early seed lookup with `database disk image is malformed`, leaving the workflow unavailable.

**How to apply:** Validate downloaded staging databases with an integrity check before replacing the local database. Preserve the last known-good file and avoid automatically uploading or repeatedly restoring a backup that failed validation.

Bundled modules must also resolve the database path consistently. A path derived from `import.meta.url` can point somewhere different after bundling than it does in source, causing pre-start restoration and runtime access to operate on different SQLite files.

**Why:** A pre-start process validated/restored one database copy while the bundled runtime opened another copy outside the artifact directory, hiding which file was actually corrupt.

**How to apply:** Before recovery, confirm the effective database path from the built runtime rather than assuming the source-tree-relative path. Make backup, restore, integrity validation, runtime access, and periodic upload target the same file.

Production SQLite must run on one Reserved VM, not Autoscale. Backups must serialize checkpoint/upload operations, reject incomplete WAL checkpoints, and prevent an older process from overwriting a newer process's snapshot.

**Why:** Multiple instances or overlapping uploads can each hold a different local SQLite state; a slower stale upload may otherwise become the object-storage source of truth and be restored on the next publish.

**How to apply:** Drain requests before the final shutdown backup. Validate a staged download before a rollback-capable swap, and fail startup instead of deleting, opening bundled data, or creating an empty production database when restore is missing or invalid.