---
name: Fleet assignment authority
description: Defines the authoritative source for current company-vehicle branches and driver assignments.
---

Current company-vehicle branch and driver assignment must be managed from the fleet vehicle record. A vehicle may have one primary driver and one optional backup driver. Driver profiles hold driver identity and employment data only; any old profile/user vehicle plate values are historical fallback data and must not overwrite the fleet record.

**Why:** Separate vehicle links in driver profiles and fleet records previously drifted, causing invoices and driver screens to show different branches or vehicles. Automatic backfills from legacy profile data can silently restore the conflict.

**How to apply:** New assignment reads and writes must resolve through fleet vehicles, including operational snapshots such as driver expenses. A driver linked to one vehicle gets it automatically when submitting an invoice; if linked across primary/backup roles to multiple vehicles, require choosing the invoice's vehicle. Do not add driver-page assignment controls, startup backfills, or bulk migrations for existing records. Preserve historical trip/order snapshots unchanged.