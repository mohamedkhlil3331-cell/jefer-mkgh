---
name: Two separate vehicle-type lists
description: vehicle_type_definitions vs rental_vehicle_types are distinct tables with different purposes; don't assume one is the source for the other.
---

The system has two unrelated "vehicle type" tables:

- `vehicle_type_definitions` — the canonical internal fleet vehicle types (managed on the "أنواع السيارات وقواعد التحميل" page). Used for cargo routing rules, max load, etc.
- `rental_vehicle_types` — a separate list with its own `rate_per_km`/`active` fields, used for (1) the Tariffs page "معدل السعر / كم" tab rate management, and (2) the customer-facing External Rentals booking flow (`ExternalRentals.tsx`). Names can drift out of sync with `vehicle_type_definitions` since admins could add entries independently.

**Why:** A user request to make "vehicle types in the Tariffs page" come from "the system's vehicle types" meant only the vehicle_type *selection dropdowns* on tariff rows (which vehicle type a route applies to) should read from `vehicle_type_definitions`, not the whole `rental_vehicle_types` feature. The rate-per-km management tab and external rental booking legitimately still use `rental_vehicle_types` and were left untouched.

**How to apply:** When asked to unify or fix "vehicle type" data, first check the specific request scope (pricing/rental vs. general definitions/cargo routing) before merging or repointing these tables — they serve different features, not just duplicated data.
