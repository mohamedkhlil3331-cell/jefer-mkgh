---
name: ERP calculator independence
description: Scope rule for the floating calculator and its saved history.
---

Keep the floating calculator separate from ERP business data and workflows. It must not read from or write to ERP APIs or business records. Its calculation history is private to each user's browser.

**Why:** the user explicitly said the calculator addition should have nothing to do with anything else in the system.

**How to apply:** preserve the client-only calculator and user-scoped local history; do not add server persistence, ERP data lookups, or module-specific behavior unless the user explicitly requests it.
