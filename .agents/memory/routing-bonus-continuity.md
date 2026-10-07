---
name: Routing bonus continuity
description: User-approved constraint on the existing transport dispatch bonus and trip-log presentation
---

For transport routing, keep the existing tariff/dispatch bonus amount and net calculation unchanged. The requested improvement is to show that same saved bonus in each newly completed trip's "بونص المسار" field, rather than zero. Do not rename the bonus, add a second payout, or backfill old trips as part of this change.

**Why:** The user explicitly clarified that the bonus already existed; it simply was not visible in the resulting trip.

**How to apply:** When touching transport dispatches, trip completion, statements, or bonus reports, trace the single existing bonus amount through to display and aggregation without counting the dispatch and trip as two separate bonuses.

New routing trips are visible in the trip log as soon as the dispatch is sent, but their displayed tariff and bonus are not yet earned. Driver settlements, monthly bonus summaries, and completed-trip aggregates must count a keyed routing trip only after its child assignment reaches completed status. Use the completion time for bonus accounting, not the early log date; keep completed trip snapshots unchanged when a sibling assignment is edited.

**Why:** Operators need to see photos and status in one live trip-log row, while paying or reporting a pending or cancelled trip as completed would overstate earnings. Editing one active vehicle must not rewrite completed accounting history.

**How to apply:** Keep log visibility separate from earned totals, update the same live record during the routing lifecycle, and preserve the original tariff/bonus snapshot except when an active dispatch is explicitly edited.