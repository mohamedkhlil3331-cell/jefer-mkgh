---
name: Supplier claim print history
description: Preserve supplier reimbursement claim accounting and distinguish original print attribution from later reprints.
---

Supplier invoice statements remain in the existing supplier-reimbursement claim workflow; do not create a separate personal-custody process or change invoice amounts. Record the authenticated actor for the first print and append a separate event for each reprint. Never overwrite the original printer or infer a legacy claim's printer from its creator; show the attribution as unavailable unless a trusted print record exists.

**Why:** The existing claim schema did not preserve the identity of the original printer, and the creator may not be the person who printed the statement. Reusing the existing workflow also preserves its invoice links and accounting behavior.

**How to apply:** For future claim changes, group selected invoices into statements by branch, keep original-print data immutable, and add reprint history as append-only events. Clearing a statement's printed state must preserve its original print timestamp and events; a later print is a reprint whenever prior print history exists. Treat legacy printer identity as unknown unless it can be verified from a separate authoritative source.
