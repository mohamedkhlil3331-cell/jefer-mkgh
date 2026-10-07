---
name: Invoice date acceptance
description: Confirmed business rule for validating dates extracted from trip invoice images.
---

Accept an invoice date extracted by AI only when it is in the current month and current year, and its day is today or an earlier day in that month. Reject future days, other months, and other years; retain the trip's existing date when rejected.

Apply this validation prospectively to newly registered invoices only. Do not scan, rewrite, or otherwise touch historical invoice or trip records.

**Why:** OCR/AI may misread one or more date digits and produce an implausible future or stale date.

**How to apply:** Evaluate the extracted calendar date against the application's current local date only while processing a new invoice. For example, on 3 September 2026, only 1–3 September 2026 are acceptable. Never run a backfill over existing records.