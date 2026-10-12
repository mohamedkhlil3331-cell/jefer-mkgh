---
name: Routing cargo quantities
description: Confirmed product and per-vehicle quantity behavior for routing cargo across dispatch, clearance, driver, and warehouse flows.
---

New and edited routing dispatches select cargo from the active system product catalog. The entered quantity is per vehicle: if the same dispatch assigns that quantity to multiple eligible vehicles, warehouse receipt adds the quantity once for each vehicle to the same catalog product. A multi-vehicle dispatch is only a shortcut for creating multiple trips; receipt, approval, inventory posting, trip completion, and vehicle release happen independently per trip. One arrived vehicle must not wait for its siblings. Preserve product and quantity on clearance and driver views.

**Why:** the user confirmed both that quantities apply separately to each vehicle and that a multi-vehicle dispatch is only a shortcut for individual trips; an arrived vehicle must be receivable without waiting for other vehicles.

**How to apply:** when changing routing cargo or warehouse finalization, aggregate only saved per-trip quantities by product ID, let the warehouse finalize each eligible trip independently, and mark the parent dispatch complete only after its trips are resolved.
