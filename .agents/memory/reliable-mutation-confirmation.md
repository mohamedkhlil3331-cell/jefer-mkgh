---
name: Reliable mutation confirmation
description: Reliability rule for data-entry saves under weak or interrupted network conditions
---

Data-entry forms must remain open until the server confirms persistence by returning the saved database row. Retry transient failures only; do not retry ordinary validation or authorization failures.

For updates, retrying the same idempotent payload is acceptable. For creates, generate one stable idempotency key per submit action and reuse it across retries; the server must persist and uniquely enforce that key, returning the existing row on replay.

**Why:** A successful-looking UI after an ignored HTTP failure loses operational data, while blindly retrying creates can duplicate trips or expenses after an ambiguous timeout.

**How to apply:** Use this contract for future ERP mutations where operators enter business records. Keep the editor populated on failure, show the server error, and close/reset it only after a valid saved-row response.