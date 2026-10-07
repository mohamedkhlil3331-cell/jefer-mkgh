---
name: Customer chat access policy
description: Confirmed limits and default contact rules for customer conversations.
---

Customers and their assigned supervisors or reps can initiate conversations with each other. Customer accounts can only chat with supervisors and reps; internal employee-to-employee chat remains unchanged. Rental-trip portal accounts are included.

Default contacts are the supervisor and rep on the customer's latest non-cancelled order. Category rules use the existing company ("تابع للشركة") and rental ("إيجار خارجي") classifications. A per-customer include/exclude rule takes precedence over the category rule. Only managers configure these chat rules.

Chat contact search and job-title labels apply to all chat users, not just Mohammed Khalil's account. Search remains limited to contacts returned by the existing permission-filtered API; it does not widen access.

**Why:** the user confirmed the existing access rules and clarified that the search/title enhancement should be available to all chat users, while keeping the change limited to chat—not orders, accounting, or customer classifications.

**How to apply:** enforce the same eligibility in contact discovery, conversation creation, message/media access, realtime events, and calls. Do not add a third customer category or change the source order/category data as part of chat work.