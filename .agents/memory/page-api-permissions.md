---
name: Page and API permission parity
description: Keep server authorization for page data aligned with the frontend's custom permission rules.
---

When an API read exists specifically to support a permission-gated page, enforce the same permission semantics on the server as the page uses. In particular, apply page-level role bypasses before parsing custom permissions; malformed permission data must not deny a role the page explicitly admits. For other roles, preserve legacy empty-permissions behavior and require the matching custom permission when a list is present.

**Why:** The trip log's PDF attachment endpoint returned 403 for users permitted by the page when server-side role bypasses and custom-permission parsing were evaluated in a different order.

**How to apply:** Check the page guard and supporting API read together, including ordering and malformed-data behavior. Keep unrelated write, delete, and administrative routes under their existing restrictions.

Routers mounted at the API root must scope authorization middleware to their own route prefix. A global `router.use(authGuard)` can reject unrelated paths before a later router gets a chance to handle them.

**Why:** The rental-trip portal's customer-only guard intercepted the trip PDF attachment request and returned the portal-specific 403 message.

**How to apply:** Before adding or changing router-wide middleware, list every route in that router. If all protected handlers share a prefix, mount the guard on that prefix and verify unrelated API paths fall through to their intended router.