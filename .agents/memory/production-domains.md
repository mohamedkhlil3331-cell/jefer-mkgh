---
name: Production domains and SEO target
description: Current domain roles and the requested domain/search visibility direction for the ERP project.
---

The user chose `jefer-mkgh1.com` as the sole production domain going forward and wants production traffic fully off Replit. They also want the site discoverable under the Arabic brand name «مجموعة جيفر». `jefer-mkgh.com` was purchased through Replit; nameserver delegation is unavailable there, and transfer requires Replit Support after the 60-day purchase hold.

**Why:** The user clarified the production-domain choice and the registrar limitation.

**How to apply:** Treat `jefer-mkgh1.com` as the production domain. Do not leave it routed to Cloudflare D1 while the old `.com` remains active on a Replit-backed database; stop the Replit deployment only after Worker validation and explicit confirmation of the old domain impact. Revisit the old `.com` only if the user transfers it out or intentionally abandons it. A domain switch alone cannot guarantee search visibility.
