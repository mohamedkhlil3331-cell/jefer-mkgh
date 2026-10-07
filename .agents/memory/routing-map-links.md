---
name: Routing map links are operational
description: User-approved boundary between reusable tariff map choices, dispatch-specific links, and trip accounting.
---

The loading and unloading map links belong to dispatch guidance only. A tariff can offer multiple named choices; a dispatch can select or override them and later update its own links. Editing or deleting a tariff choice should not change a previously sent dispatch's chosen link.

**Why:** The user explicitly approved these links as an additive convenience to save effort, and said they have no bearing on the trip log, historic tariffs, or calculations.

**How to apply:** For future routing changes, preserve dispatch-specific selected links independently from reusable tariff choices. Show unloading guidance after the driver's loading photo, but do not tie link changes to trip-log rows or earned amounts.