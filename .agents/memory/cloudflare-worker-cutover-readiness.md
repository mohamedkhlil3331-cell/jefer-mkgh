---
name: Cloudflare Worker cutover readiness
description: Production cutover checks for D1 startup validation, Node HTTP handling, and domain routing.
---

Use the final verified D1 migration snapshot for startup checks: the initial migration table count may differ from the final source snapshot, and preserved D1-only rows must match the migration's explicit reconciliation report. Keep any approved-extra allowlist aligned with that report; do not replace it with unrestricted acceptance.

Cloudflare's `httpServerHandler` returns an exported handler object. Route requests through its `.fetch(request, env, ctx)` method rather than calling the object as a function.

Do not leave active production domains split between Replit SQLite and Cloudflare D1. A secondary-domain test route can validate the Worker while DNS stays direct, but revert it if the primary domain cannot be cut over at the same time.

**Why:** stale D1 readiness assumptions and an incorrect handler call both caused Worker 1101 failures; partial domain routing can split production writes across databases.

**How to apply:** verify the final manifest and Worker adapter, smoke-test through a narrow route, and confirm all production domains are delegated/routed before leaving the full Worker route enabled.
