---
name: Hidden system-admin tokens
description: Authentication constraint for privileged API routes used by the hidden system administrator.
---

Privileged API routes must recognize the hidden system-administrator token in addition to normal user sessions. Its current token is persisted as a special session, with an in-memory cache only for fast access.

**Why:** A memory-only token disappears on restart and cannot reliably revoke an older administration session. A normal user-session lookup still does not find the hidden administrator.

**How to apply:** Use the shared system-administrator token validator rather than reading the ordinary sessions table or an in-memory token set directly.