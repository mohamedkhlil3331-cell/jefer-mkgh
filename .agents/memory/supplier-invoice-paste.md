---
name: Supplier invoice paste grid
description: Confirmed user requirements for pasting copied spreadsheet ranges into supplier invoices.
---

Supplier invoice entry keeps the existing Excel file import and adds an editable paste/manual grid with automatic or fixed 14-column mapping; the fixed mapping ignores month/year. Drafts survive closing until approved or explicitly cancelled. Store tax status, tax amount, and invoice totals. Assignment can be branch-only, an existing fleet vehicle, or a newly added fleet vehicle. Vehicle matching ignores whitespace only, preserves letters, and requires a specific choice when matches are ambiguous.

A workshop-inventory invoice is a pending receipt request, not an immediate stock increase. A user with the existing workshop-inventory access links it to an existing item or creates one with a unique code. Confirmation updates quantity and unit cost and logs one incoming transaction exactly once. Do not backfill old invoices or change unrelated purchase/workshop flows.

The workshop receipt screen also supports direct receipt when exactly one inventory item matches the invoice item name after trimming and collapsing whitespace (case-insensitive). If there is no match or multiple matches, do not change stock; keep manual linking available.

**Why:** The user wants spreadsheet and manual entry in the supplier invoice flow while preserving the established file import, fleet records, and stock audit history.

**How to apply:** Keep paste changes staged and editable before saving. Treat workshop invoices as pending until an authorized direct or manual receipt action; keep stock mutations atomic and idempotent.
