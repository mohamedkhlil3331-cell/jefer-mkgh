---
name: Bulker book vs loading history
description: Separates current fleet roster membership from existing loading orders and unloading access.
---

The Bulker Vehicle Book reflects current fleet assignments: a vehicle appears while its fleet type is “بلكر,” and its displayed driver comes from the fleet assignment. Changing the type away hides it from the current roster but must not delete or rewrite loading orders, replies, attachments, or the driver's ability to finish unloading an existing order.

**Why:** The user approved an automatically maintained current roster while explicitly requiring historical orders and unloading to remain intact.

**How to apply:** Treat fleet type and driver assignment as current-state sources for the book. Keep loading-order snapshots and completion paths independent of current roster visibility.
