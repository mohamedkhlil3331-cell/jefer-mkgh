---
name: Single active account session
description: Project-wide rule preventing slow or stale devices from overwriting newer business changes.
---

Only the newest login session for an account may execute state-changing API requests. A new login waits for any already-running mutation from the old session to finish, then replaces that session; subsequent old-device writes are rejected before business routes run.

**Why:** The app has many unconditional state updates and previously allowed the same account on multiple devices. A slow device could submit stale work after a faster device had saved newer data.

**How to apply:** Route all browser mutations through the shared authenticated fetch monitor and keep the server mutation-session guard ahead of business routes. Do not queue offline writes as successful or replay requests that lack their original authorization identity.