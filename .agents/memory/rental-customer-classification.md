---
name: Rental customer classification history
description: Governs whether changing a customer between company and external rental changes historical rental accounts.
---

Each trip keeps the customer's billing classification from the time that trip was saved. Changing the customer directory classification applies to future or newly edited trips, while old trips change only when the user explicitly requests historical reclassification.

**Why:** Silently moving old trips into or out of rental statements can unexpectedly rewrite established balances.

**How to apply:** Preserve the snapshot during unrelated trip edits. Offer an explicit, clearly labeled historical reclassification choice when changing a customer's type.