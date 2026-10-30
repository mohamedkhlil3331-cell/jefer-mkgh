---
name: Driver invoice photo visibility
description: Scope for driver invoice photos on the active orders list
---

Show drivers only the two newest `driver_invoice` photos across their full active supply-request list. Older invoice photos should not appear in that active list.

Do not delete or relocate stored photos, and do not modify trip history or response history as part of this change.

**Why:** The user explicitly narrowed the request to invoice photos only and asked not to alter either history area.

**How to apply:** Enforce the two-photo cap on the active driver list; preserve all other trip fields, permit images, storage, and history views.
