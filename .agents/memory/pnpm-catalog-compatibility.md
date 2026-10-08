---
name: pnpm catalog compatibility
description: Ensures workspace catalog references are resolved by a compatible pnpm version during deployment.
---

pnpm workspace `catalog:` references require pnpm 9.5.0 or later. If a build reports a missing catalog while the root `pnpm-workspace.yaml` already defines it, check the package manager version and build root before changing catalog contents.

**Why:** pnpm 9.0 predates catalog support and may report an existing default catalog as unresolved.

**How to apply:** Keep the root `packageManager` pin at a catalog-capable version, build from the repository root, and commit the workspace lockfile.
