---
name: Miniflare D1 integration tests
description: Configuration details for isolated D1 integration tests using the installed Miniflare 5 version.
---

When running D1 integration tests with Miniflare 5, convert the legacy Worker/D1 options with `convertV4MiniflareOptions` before constructing `Miniflare`. Create schema objects with individual prepared `CREATE TABLE` statements rather than relying on `D1Database.exec` for test setup.

**Why:** The installed Miniflare 5 constructor uses its newer worker configuration shape, and `exec` did not reliably create all tables needed by the auth test.

**How to apply:** Use a unique D1 binding ID, local isolated persistence, and explicit cleanup/disposal in `finally`; never aim an automated integration test at the production D1 binding.
