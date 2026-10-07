---
name: Stale artifact workflow listeners
description: How to handle artifact workflow child processes that keep ports bound after a failed or stopped workflow.
---

When an artifact workflow restart reports a busy port, check which process is listening before changing app configuration. A child process from an earlier run may still hold the port even when workflow status says failed or stopped.

**Why:** API and Vite listeners remained bound after earlier workflow runs, so managed restarts could not start until the exact stale listener processes were stopped.

**How to apply:** Use `lsof -nP -iTCP:<configured-port> -sTCP:LISTEN`, inspect the process arguments with `ps`, and stop only a listener confirmed to belong to that artifact. Then restart its existing managed workflow; do not create a replacement workflow.