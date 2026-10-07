---
name: Trip image extraction source
description: Product decisions governing invoice-template regions and data extraction for trip records.
---

Data extraction must use the cargo image already stored on the same trip. Do not ask the user to upload a separate invoice image during extraction. Saving an extraction must set the trip response count to 1. Visual reference images and field regions belong directly to a tariff route, not to a standalone invoice-template workflow.

**Why:** The cargo image in the trip is the authoritative source the operator wants analyzed; separate uploads create duplicate and confusing image sources.

**How to apply:** Each tariff route may contain reference images with normalized rectangular regions mapped to trip fields (cargo type, weight/quantity, document number, permit/loading-card number, supplier, client, loading place, and unloading place). Match the trip image visually to a tariff before extracting its fields. Once matched, apply that tariff's driver expense and unit price, then calculate return value and net using the same trip formulas as manual tariff selection. Adding or editing a trip must never create a tariff automatically; tariffs are created explicitly from tariff management.