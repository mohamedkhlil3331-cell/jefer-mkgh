---
name: GitHub CLI authentication
description: Distinguishes Replit's GitHub API integration from shell Git transport authentication.
---

The Replit GitHub connector provides authenticated API access but does not automatically authenticate shell `git push` or `git pull`; Git transport needs a separate credential path.

**Why:** Attaching the GitHub App integration did not resolve an invalid-credentials error from `git push`; Replit documentation distinguishes the API connector from Git CLI operations.

**How to apply:** When shell Git authentication fails, use a secure credential flow for Git transport rather than reauthorizing the API connector. Never print the token or persist it in `.git/config`.
