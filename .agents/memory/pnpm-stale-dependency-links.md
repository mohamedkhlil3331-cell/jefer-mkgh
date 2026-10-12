---
name: Stale pnpm runtime links
description: Recovery when pnpm's installed symlinks disagree with the frozen workspace lockfile.
---

When runtime resolution reports a missing transitive package even though the frozen lockfile contains it, inspect the actual symlink under `node_modules/.pnpm`. A normal `pnpm install --frozen-lockfile` may report “Already up to date” without repairing a stale link; `pnpm install --force --frozen-lockfile` rebuilt the links in this workspace.

**Why:** The API's externalized Google Cloud Storage dependency pointed at a `fast-xml-parser` version absent from the installed store, so production startup failed despite the lockfile containing the correct version.

**How to apply:** Compare the symlink target to the locked package version before changing dependency versions. Force-rebuild pnpm's links when they diverge, then verify with a production-mode startup using isolated data.
