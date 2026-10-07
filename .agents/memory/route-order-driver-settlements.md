---
name: Express route order in driver-settlements
description: Literal subpaths must precede param routes in driver-settlements router
---

Rule: in `driver-settlements.ts`, register any new literal route like `/driver-settlements/printed-marks` BEFORE `/driver-settlements/:id` (PUT/DELETE) — otherwise `:id` matches the literal segment and returns "التسوية غير موجودة".

**Why:** hit this bug when adding printed-marks endpoints; DELETE was swallowed by the `:id` delete route.

**How to apply:** place new literal routes near the top of the file (before the `:id` handlers), and curl-test each verb after adding.
