---
name: Excel export styling
description: Spreadsheet writer compatibility for persisted cell styles in generated Excel workbooks.
---

For exports that must preserve cell formatting, do not rely on `xlsx` 0.18.5 community edition merely because cells accept an `s` style property; it can write the workbook while silently omitting fills and other styles. Use a writer that persists styles, and verify the generated XLSX archive contains the expected style records.

**Why:** A test workbook showed that the current SheetJS writer dropped an explicitly assigned yellow cell fill without warning.

**How to apply:** For styled browser exports in this project, use `xlsx-js-style` and verify style XML in a generated workbook before claiming formatting works.
