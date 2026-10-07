---
name: Supplier invoice paste grid
description: Confirmed user requirements for pasting copied spreadsheet ranges into supplier invoices.
---

Supplier invoice entry should have a separate paste-from-Excel action alongside the existing file import. It opens an editable grid showing the invoice register's column headings, expands to fit one pasted row or a larger pasted range, allows corrections before confirmation, and supports choosing an existing fleet vehicle or typing an external vehicle plate. System-generated fields stay automatic.

**Why:** The user wants to copy a selected range from Excel directly into supplier invoices, review and edit the rows, then confirm them into the existing invoice register without replacing file import.

**How to apply:** Build the paste flow as a staged, editable grid that parses clipboard rows and previews changes before saving. Preserve existing invoice creation and fleet lookup behavior.
