---
name: R2 attachment downloads
description: Avoid connection-pool exhaustion when serving many images or PDFs stored in R2.
---

For the Node/S3-backed R2 runtime, after the route's existing access checks, serve file requests with a short-lived signed GET redirect instead of proxying the entire object stream through the API. Keep the stream-and-cancel fallback for Worker-bound R2, where S3 signing credentials are not available. Avoid a separate HEAD before the GET/redirect when the download itself can establish existence.

**Why:** Production logs showed abandoned attachment downloads and the AWS SDK reporting its 50-socket pool at capacity with thousands of requests queued. Each proxied stream occupied a server-side R2 connection.

**How to apply:** Preserve authorization before signing, use a brief expiry, and test both current object URLs and legacy upload URLs without logging signed query strings. When streaming remains necessary, abort the upstream read when the client disconnects.
