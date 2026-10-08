---
name: pnpm catalog compatibility
description: Ensures workspace catalog references are resolved by a compatible pnpm version during deployment.
---

pnpm workspace `catalog:` references require pnpm 9.5.0 or later. If a build reports a missing catalog while the root `pnpm-workspace.yaml` already defines it, check the package manager version and build root before changing catalog contents.

Inside pnpm lifecycle scripts, use `node "$npm_execpath"` for nested pnpm calls so they reuse the active pnpm binary instead of resolving another `pnpm` shim through `PATH`.

**Why:** pnpm 9.0 predates catalog support and may report an existing default catalog as unresolved. Hostinger also installed the pinned pnpm successfully but a nested shell invocation tried to load a different, uncached Corepack version.

**How to apply:** Keep the root `packageManager` pin at a catalog-capable version, build from the repository root, commit the workspace lockfile, and route recursive build/typecheck calls through `npm_execpath`.
