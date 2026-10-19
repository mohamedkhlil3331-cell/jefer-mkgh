---
name: Cloudflare Worker multipart uploads
description: The part-name requirement when updating service-worker syntax Worker content through the Cloudflare API.
---

When uploading a service-worker syntax Worker as multipart form data, name the script part exactly as the `body_part` value in metadata; a generic `files` part may fail even when it has the correct filename.

**Why:** Cloudflare rejected the multipart upload because it could not find the named body part, while matching the form part name to `body_part` succeeded.

**How to apply:** For Cloudflare API Worker content uploads using `body_part`, verify the form-data field name and metadata value match before retrying.
