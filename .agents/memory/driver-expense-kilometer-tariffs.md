---
name: Kilometer-based driver expense
description: User decisions for mixing fixed and kilometer-based driver expense tariffs
---

Keep the existing driver-expense amount as a valid fixed tariff when kilometer inputs are absent or incomplete. Apply per-kilometer or tiered pricing only when its required route distance and rate data are configured. Save the rounded whole-riyal result on new trips; never recalculate old trips. A manual trip amount is an override for that trip only. Do not alter rental prices or other kilometer-rate systems.

**Why:** The user wants legacy tariffs and manually entered expenses to remain usable without requiring kilometer data, while supporting automatic calculation for explicitly configured routes.

**How to apply:** Use this behavior when editing route tariffs, importing/exporting tariff sheets, or selecting a tariff for a new trip. Keep production D1 schema changes separate and obtain authorization before a production migration.
