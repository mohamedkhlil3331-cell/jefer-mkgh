---
name: Cloudflare Worker response compression
description: Avoid unreadable JSON from nested Brotli compression in the ERP's Cloudflare Worker runtime.
---

Do not apply Express `compression()` middleware in Cloudflare Worker mode. Let the Worker response path apply content encoding once; retain Express compression for the regular Node server.

**Why:** Production responses larger than Express's compression threshold contained nested Brotli streams while carrying only one `Content-Encoding: br` header. A browser decodes one layer and then cannot parse the remaining compressed bytes as JSON, so lists appear empty.

**How to apply:** For Worker responses, verify a raw HTTP response with `Accept-Encoding: br` becomes valid JSON after exactly one Brotli decode. Check both a small response and a response larger than 1 KB; also ensure the regular Node server still has compression enabled.
