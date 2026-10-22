---
name: Cloudflare Worker cutover readiness
description: Production cutover checks for D1 startup validation, Node HTTP handling, and domain routing.
---

Use the final verified D1 migration snapshot for startup checks: the initial migration table count may differ from the final source snapshot, and preserved D1-only rows must match the migration's explicit reconciliation report. Keep any approved-extra allowlist aligned with that report; do not replace it with unrestricted acceptance.

Cloudflare's `httpServerHandler` returns an exported handler object. Route requests through its `.fetch(request, env, ctx)` method rather than calling the object as a function.

Do not leave active production domains split between Replit SQLite and Cloudflare D1. A secondary-domain test route can validate the Worker while DNS stays direct, but revert it if the primary domain cannot be cut over at the same time.

Check Cloudflare `Workers Routes: Write` access before attempting a production route. Do not substitute the Custom Domain flow when DNS must remain unchanged; it creates or changes DNS records. If route access is denied, leave the domain on its current host rather than retrying after the approved reconnect attempt.

**Why:** Route access was denied, while the Custom Domain flow would have crossed the approved DNS boundary.

**How to apply:** Confirm route-write permission before cutover; if unavailable, keep Replit serving production and stop before any DNS-changing setup.

**Why:** stale D1 readiness assumptions and an incorrect handler call both caused Worker 1101 failures; partial domain routing can split production writes across databases.

**How to apply:** verify the final manifest and Worker adapter, smoke-test through a narrow route, and confirm all production domains are delegated/routed before leaving the full Worker route enabled.
