---
name: R2 signed URL normalization
description: Keep R2 presigned uploads compatible with application object locators across S3 URL addressing styles.
---

Normalize Cloudflare R2 presigned URLs from both path-style URLs (`account.r2.../<bucket>/<key>`) and virtual-hosted URLs (`<bucket>.<account>.r2.../<key>`). Derive the application's stable `/objects/...` locator from the key and never retain a signed query string in the saved locator.

**Why:** The AWS SDK produced a virtual-hosted URL in this workspace, while the existing normalizer only recognized path-style URLs. The API returned HTTP 200, but the frontend rejected the response before sending the file.

**How to apply:** When changing R2 URL generation or normalization, test the application's normalizer against a fresh SDK-generated URL, then verify a temporary upload and read-back without logging the signed URL.
