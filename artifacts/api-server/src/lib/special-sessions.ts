import { execute, queryOne } from "./erp-sql.js";

export type SpecialSessionKind = "system-admin" | "developer-admin";

export async function setSpecialSession(kind: SpecialSessionKind, token: string, expiresAt: string) {
  await execute(`
    INSERT INTO special_sessions (kind, token, expires_at, created_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(kind) DO UPDATE SET
      token=excluded.token,
      expires_at=excluded.expires_at,
      created_at=excluded.created_at
  `, kind, token, expiresAt);
}

export async function isSpecialSessionValid(kind: SpecialSessionKind, token: string): Promise<boolean> {
  return Boolean(await queryOne(`
    SELECT 1 FROM special_sessions
    WHERE kind=? AND token=? AND datetime(expires_at)>datetime('now')
  `, kind, token));
}

export async function clearSpecialSession(kind: SpecialSessionKind, token?: string) {
  if (token) {
    await execute("DELETE FROM special_sessions WHERE kind=? AND token=?", kind, token);
  } else {
    await execute("DELETE FROM special_sessions WHERE kind=?", kind);
  }
}