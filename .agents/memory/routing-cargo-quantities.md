---
name: Routing cargo quantities
description: Confirmed product and per-vehicle quantity behavior for routing cargo across dispatch, clearance, driver, and warehouse flows.
---

New and edited routing dispatches select cargo from the active system product catalog. The entered quantity is per vehicle: if the same dispatch assigns that quantity to multiple eligible vehicles, warehouse receipt adds the quantity once for each vehicle to the same catalog product. Preserve product and quantity on clearance and driver views. Do not change the separate delivered-to-completed workflow.

**Why:** the user confirmed that an entered amount such as 600 applies separately to each vehicle and required the product and quantity to remain visible downstream.

**How to apply:** when changing routing cargo or warehouse finalization, aggregate the saved per-trip quantities by product ID and count only trips eligible for receipt; keep existing delivery and approval states unchanged.
