---
name: Password visibility and compatibility
description: User-approved balance between administrative password recovery and compatibility with older accounts
---

The administrator may deliberately reveal legacy passwords that were already stored as plaintext. Never present an encrypted password as recoverable; offer a reset instead. Preserve login with existing legacy passwords and with encrypted passwords independently of a user's current role.

**Why:** The user explicitly requested that administrators help people who forgot passwords and that accounts continue to accept their previous passwords. The user approved showing only recoverable legacy passwords after being told that encrypted passwords cannot be reversed and that admin visibility increases the sensitivity of admin access.

**How to apply:** In future login, role-editing, and user-management changes, do not bulk-rewrite passwords or make a role change invalidate an otherwise valid password. Keep password revelation limited to explicit authenticated administrator actions, not general user lists or exports.