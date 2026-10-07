---
name: Closed-month tariff snapshots
description: Why historical tariff values must be captured without updating old trip rows
---

Historical driver-statement expense values can depend on the current tariff until frozen. Capture the existing value before changing a tariff, including zero, without updating historical trip rows. New transactions should carry their selected tariff snapshot directly.

**Why:** Customer month-close protection rejects updates to trips from closed months, even when the update only fills a new snapshot column. A tariff edit that tries to backfill trip rows would therefore fail or tempt bypassing an accounting lock.

**How to apply:** For future historical snapshots derived from mutable configuration, use a separate append-only keyed snapshot outside locked records; then read the snapshot before falling back to current configuration. Do not bypass closed-month protection or recalculate a completed transaction from today's tariff.