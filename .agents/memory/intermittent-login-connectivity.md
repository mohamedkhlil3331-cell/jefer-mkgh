---
name: Intermittent login connectivity
description: The user reports the generic login connection error recurring in both Replit preview and the published app.
---

The user has repeatedly reported that the generic login connection message occurs intermittently in both the Replit preview and the published app.

**Why:** The user explicitly said this had been reported before; treating a preview-only outage as the whole issue misses the production symptom.

**How to apply:** Investigate preview and production independently. A non-JSON `/api/auth/login` response may indicate a gateway or service-availability failure; distinguish it from JSON credential or permission errors.
