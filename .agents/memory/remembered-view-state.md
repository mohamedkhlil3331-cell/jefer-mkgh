---
name: Remembered view-state isolation
description: Avoid cross-page/account state leakage and effect loops in persistent React list controls
---

A generic hook that remembers search and filter controls must rehydrate synchronously if its account or pathname key changes while the component remains mounted. Its returned setter should have stable identity for a stable key.

**Why:** An initial implementation only read storage on mount. When the key changed, its write effect could copy the previous page's or person's search state into the new namespace. A freshly created setter every render could also retrigger effects that depend on normal React state setters.

**How to apply:** Whenever persistence keys depend on routing or identity, handle transitions before write effects run; test same-component route and account changes, not just unmount/remount. Keep draft forms and server-owned data out of remembered view state.