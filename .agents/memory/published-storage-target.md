---
name: Published storage target validation
description: Verify the active storage provider and exact bucket behind a successful published upload
---

A successful signed upload through the published ERP does not prove the object was written to R2. Verify the upload target's provider and confirm the same object exists in the intended bucket; document mismatches instead of inferring from HTTP 200.

**Why:** On 13 October 2026, a published ERP upload returned HTTP 200 and was readable through the app but was found in Replit Object Storage (GCS), not the R2 bucket configured from the workspace. A separate browser PUT directly to R2 also succeeded, which did not prove the app itself used R2.

**How to apply:** Before an R2 cutover or a claim of end-to-end CORS success, inspect only the upload host/provider (never copy the signed query string) and verify the exact uploaded object in the intended bucket.
