---
name: Rental trip customer terms
description: User-approved accounting and credential decisions for the rental customer portal
---

Customer-specific increases to a historical rental trip appear to that customer as the trip's actual rental price and carry into a repeat-trip request, but the original tariff, company revenue, and historical trip accounting remain unchanged.

**Why:** The user explicitly distinguished the customer-facing quoted amount from the internal tariff and did not want past accounting rewritten.

**How to apply:** Keep customer-facing statements and repeat requests on the effective adjusted price; never recalculate internal trip revenue from the customer adjustment.

A customer-uploaded transfer reduces the balance as soon as it is uploaded. Management confirmation only confirms that existing credit; after confirmation the customer cannot edit or delete it, but management can.

**Why:** The user explicitly chose immediate credit rather than delaying it until approval.

**How to apply:** Do not create a second payment on confirmation or hide pending credits from balances.

The user chose the customer's phone number as the initial password despite being warned it is predictable. Later self-service password changes require an SMS code sent to the registered number.

**Why:** This was an explicit choice, not an inferred secure default.

**How to apply:** Do not silently replace the initial credential scheme. Keep role and ownership checks strict and surface SMS delivery failures rather than pretending to send a code.