---
name: Node 24 TypeScript script loading
description: Run local one-off scripts that import TypeScript source modules using emitted JavaScript specifiers.
---

When Node 24 runs a TypeScript source entry with `--experimental-strip-types`, it may still fail to resolve an internal `.js` import when only the matching `.ts` source file exists. If `tsx` is not installed, a temporary loader in `/tmp` can remap `.js` specifiers to `.ts` only within the known source tree. Keep this workaround local to the one-off command; do not alter application import conventions or add a runtime loader to the project.

**Why:** A local D1 migration script could not start because Node reached a TypeScript module that imported another source module using its emitted `.js` path. The failure occurred before any database connection or write.

**How to apply:** Verify the source path mapping is limited to the intended project source directory, then run a read-only preflight before any database write.
