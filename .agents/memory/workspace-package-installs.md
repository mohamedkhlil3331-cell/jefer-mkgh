---
name: Workspace package installs
description: Installing a dependency in this pnpm workspace without putting it at the wrong level
---

The generic Node language-package installer runs `pnpm add` at the workspace root, which pnpm rejects with `ERR_PNPM_ADDING_TO_ROOT`. For an artifact-specific dependency, install through pnpm with a workspace-package filter.

**Why:** The generic installer has no package-target option here; an unfiltered install does not know which app owns the dependency.

**How to apply:** When adding a package to one artifact, use the pnpm filter for that package rather than forcing a root-level installation. Keep runtime dependencies and type-only development dependencies in their respective sections.