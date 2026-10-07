import db from "./db.js";

export type SpecialSessionKind = "system-admin" | "developer-admin";

export function setSpecialSession(kind: SpecialSessionKind, token: string, expiresAt: string) {
  db.prepare(`
    INSERT INTO special_sessions (kind, token, expires_at, created_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(kind) DO UPDATE SET
      token=excluded.token,
      expires_at=excluded.expires_at,
      created_at=excluded.created_at
  `).run(kind, token, expiresAt);
}

export function isSpecialSessionValid(kind: SpecialSessionKind, token: string): boolean {
  return Boolean(db.prepare(`
    SELECT 1 FROM special_sessions
    WHERE kind=? AND token=? AND datetime(expires_at)>datetime('now')
  `).get(kind, token));
}

export function clearSpecialSession(kind: SpecialSessionKind, token?: string) {
  if (token) {
    db.prepare("DELETE FROM special_sessions WHERE kind=? AND token=?").run(kind, token);
  } else {
    db.prepare("DELETE FROM special_sessions WHERE kind=?").run(kind);
  }
}