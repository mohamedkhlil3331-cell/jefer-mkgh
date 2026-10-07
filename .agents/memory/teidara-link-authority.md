---
name: Teidara link authority
description: Ownership and compatibility rules for permanent links between fleet vehicles and teidarat.
---

Permanent vehicle–teidara linkage is managed only from the fleet vehicle record. Teidarat management edits the teidara's own data, while trips and workshop records may store a teidara as a snapshot or work target without changing the permanent link.

In the Teidarat UI, the stored category is the teidara's primary type. Any separate `teidara_type` text is only an optional detailed description, not a second primary type.

**Why:** Historical data can represent the same relationship by teidara ID lists, a single teidara ID, a trailer number, or `teidarat.vehicle_plate`. Automatic normalization or an ordinary vehicle edit could otherwise discard a valid old relation or create duplicate ownership.

**How to apply:** Label category as the teidara type, show the linked vehicle plate read-only in Teidarat, and manage the link only from Fleet. Merge every historical representation for display, retain unresolved legacy values unless explicitly changed, and reject deletion of a linked teidara until it is unlinked from Fleet.