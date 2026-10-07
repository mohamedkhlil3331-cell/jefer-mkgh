---
name: SQLite deployment writer fencing
description: Preventing acknowledged writes from being lost when old and new server processes overlap during deployment
---

When a newer server process takes ownership of the SQLite backup object, any older process must immediately reject mutations and stop listening. The new process must claim backup ownership successfully before it begins accepting requests.

**Why:** Production logs showed an older process continuing to serve requests while every backup was rejected because a newer process was authoritative. Writes acknowledged by the old process could therefore disappear when the stored backup was restored.

**How to apply:** Preserve both sides of the fence: pre-listen authority claim on startup, and mutation rejection plus graceful listener shutdown when a newer writer is detected. Do not weaken this to backup rejection alone.

Before recommending a publish for this SQLite-backed app, compare the currently serving production data with the object-storage backup that startup will restore. If they differ, do not publish or claim the current code's fencing fix will preserve historical writes already stranded on an older live instance.

**Why:** A live old process can continue serving data that is absent from the backup. Publishing replaces the process, so a successful new startup can still lose those stranded writes.

**How to apply:** Treat a live-versus-backup mismatch as a release blocker; obtain and validate a complete snapshot from the live process (not just its periodic backup) before allowing deployment.

In development, a workflow can report a failed startup while its child API process remains alive, serving requests and writing backups. Do not assume a failed workflow state means the SQLite database has no active writer.

**Why:** A second startup encountered the writer fence even though the original child process was still healthy. Starting another server without checking could overlap writers or restore a backup over a live database.

**How to apply:** Before retrying a failed startup, check the process tree, HTTP health, and backup writer metadata. Preserve a consistent local snapshot before restarting the managed workflow.

In development, hold one process-wide local writer lock before restore and through the final backup. Treat the SQLite WAL timestamp as local data freshness too; object generation checks and writer metadata alone do not protect a live local database from a competing restore.

**Why:** Multiple development processes share one local SQLite path and one development backup object. A pre-start restore can replace the database before the main server reaches its upload fence, and a recent committed write may still be in the WAL.

**How to apply:** Acquire the exclusive lock in the development launch path before any restore, reject direct unlocked development restore/backup calls, and keep production restore behavior separate.