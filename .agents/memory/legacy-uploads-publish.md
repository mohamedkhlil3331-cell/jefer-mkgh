---
name: Legacy uploads at publish
description: Why database backup equality is insufficient to protect older locally uploaded attachments during republishing
---

Treat published-server-local uploads as a separate preservation requirement from the SQLite backup before recommending a republish. Verify that every currently accessible legacy attachment needed by the database is independently recoverable and remains reachable at its original URL after a new instance starts.

**Why:** The production database can exactly match its persistent backup while some records still point to files on the old instance's local filesystem. Replacing an autoscaled instance can drop those files even when every database row survives. An unauthenticated 401 response alone is not proof of a file's absence if routing or authorization differs between builds.

**How to apply:** Check the live attachment endpoints, preserve retrievable bytes in durable storage, and provide a backward-compatible serving path. Treat references that cannot be fetched or checked as unverified rather than claiming a complete backup. New uploads also need durable storage before future publishes.