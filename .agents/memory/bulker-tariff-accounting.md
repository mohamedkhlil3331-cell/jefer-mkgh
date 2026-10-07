---
name: Bulker tariff accounting
description: Why bulker loading-order tariffs and completed trips retain their historical amounts
---

The tariff selected for a bulker loading order fixes the route and prices for that order. At unloading, the rental is calculated from the loading invoice's net weight in tons and the selected per-ton rate; the driver bonus is a single saved trip bonus, not another payment. A completed trip is an accounting snapshot: later edits or deletion of its loading order must not silently alter or erase that trip.

**Why:** Tariff prices may change between loading and unloading, and historical trips must retain the amount that was applied when recorded. The user specifically asked to preserve existing data while making the order record editable and deletable.

**How to apply:** When changing bulker orders, trip completion, bonus summaries, or reports, use the order's selected tariff values rather than current tariff-table prices, and keep edits to completed orders separate from the recorded trip unless the user explicitly requests a correction workflow.