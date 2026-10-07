---
name: Production compute restart
description: Distinguish workspace restarts from published Autoscale recovery when the API is down
---

For a published Autoscale app, do not direct users to the workspace command palette's “Restart compute” or promise a restart button in Publishing → Manage. The command restarts development compute; the mobile Publishing → Manage view exposes pause, change deployment type, and shut down, not restart. Replit's documented way to start new production compute is Republish.

**Why:** During an API outage, multiple incorrect UI directions delayed recovery. Republish has materially different consequences from a simple restart for an SQLite-backed app: it can ship pending code and restore from object-storage backup, possibly dropping live writes not in that backup.

**How to apply:** Inspect production logs and validate backup freshness/integrity; compare live data with backup when reachable. Explain the potential data and code impact before asking the user to republish. Never describe Republish as a risk-free restart.