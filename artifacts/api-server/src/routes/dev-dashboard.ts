import { Router, type Request, type Response, type NextFunction } from "express";
import { execute, executeBatch, queryAll, queryOne } from "../lib/erp-sql.js";
import crypto from "node:crypto";
import { acquireActorLock } from "../lib/session-control.js";
import { clearSpecialSession, isSpecialSessionValid, setSpecialSession } from "../lib/special-sessions.js";

const router = Router();

export function isValidDevToken(token: string): Promise<boolean> {
  return isSpecialSessionValid("developer-admin", token);
}

async function cleanExpired() {
  await execute("DELETE FROM special_sessions WHERE datetime(expires_at)<=datetime('now')");
}

async function getCfg(key: string): Promise<string> {
  return (await queryOne<{ value: string }>("SELECT value FROM system_config WHERE key=?", key))?.value ?? "";
}

async function checkDevAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("DevAuth ") ? auth.slice(8) : (req.query.devToken as string);
  if (!token) return void res.status(401).json({ error: "غير مصرح" });
  if (!await isValidDevToken(token)) {
    return void res.status(401).json({ error: "انتهت صلاحية الجلسة" });
  }
  next();
}

// POST /api/mkgh/auth — verify dev password, issue session token
router.post("/mkgh/auth", async (req: Request, res: Response) => {
  const { password } = req.body as { password: string };
  const devPw = (await getCfg("dev_password")) || "09001120009328187184508MmOo@mkgh.com";
  if (password !== devPw) return void res.status(401).json({ error: "كلمة مرور خاطئة" });
  await cleanExpired();
  const release = await acquireActorLock("developer-admin");
  try {
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await setSpecialSession("developer-admin", token, expiresAt);
    res.json({ ok: true, token });
  } finally {
    release();
  }
});

// GET /api/mkgh/sessions — all login sessions with user info
router.get("/mkgh/sessions", checkDevAuth, async (_req: Request, res: Response) => {
  const rows = await queryAll(`
    SELECT
      s.token,
      s.created_at,
      s.expires_at,
      s.ip_address,
      u.id AS user_id, u.name, u.phone, u.role
    FROM sessions s
    LEFT JOIN users u ON s.user_id = u.id
    ORDER BY s.rowid DESC
    LIMIT 500
  `);
  res.json(rows);
});

// GET /api/mkgh/audit — dev_audit_log entries
router.get("/mkgh/audit", checkDevAuth, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 500, 2000);
  const rows = await queryAll("SELECT * FROM dev_audit_log ORDER BY created_at DESC LIMIT ?", limit);
  res.json(rows);
});

// GET /api/mkgh/stats — aggregated stats
router.get("/mkgh/stats", checkDevAuth, async (_req: Request, res: Response) => {
  const [users, sessions, orders, audits, today, usersByRole, recentLogins] = await Promise.all([
    queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM users"),
    queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM sessions WHERE expires_at > datetime('now')"),
    queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM workflow_orders"),
    queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM dev_audit_log"),
    queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM dev_audit_log WHERE date(created_at) = date('now')"),
    queryAll<{ role: string; count: number }>("SELECT role, COUNT(*) AS count FROM users GROUP BY role ORDER BY count DESC"),
    queryAll(`
    SELECT u.name, u.role, u.phone,
      s.created_at, s.ip_address
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    ORDER BY s.rowid DESC
    LIMIT 10
    `),
  ]);

  res.json({
    userCount: users?.c ?? 0,
    sessionCount: sessions?.c ?? 0,
    orderCount: orders?.c ?? 0,
    auditCount: audits?.c ?? 0,
    todayActions: today?.c ?? 0,
    usersByRole,
    recentLogins,
  });
});

// GET /api/mkgh/config — return current config (sensitive values masked)
router.get("/mkgh/config", checkDevAuth, async (_req: Request, res: Response) => {
  const SENSITIVE = ["gmail_pass", "dev_password", "mkgh_password", "rental_accounts_password_hash"];
  const rows = await queryAll<{ key: string; value: string; updated_at: string }>("SELECT key, value, updated_at FROM system_config");
  const result = rows.map(r => ({
    key: r.key,
    value: SENSITIVE.includes(r.key) ? "" : r.value,
    has_value: r.value !== "",
    updated_at: r.updated_at,
  }));
  res.json(result);
});

// PUT /api/mkgh/config — update one or more config values
router.put("/mkgh/config", checkDevAuth, async (req: Request, res: Response) => {
  const ALLOWED = ["otp_email", "gmail_user", "gmail_pass", "mkgh_password", "dev_password", "rental_accounts_password", "show_vehicle_stops"];
  const updates = req.body as Record<string, string>;
  const statements: Array<{ sql: string; params?: unknown[] }> = [];
  let changed = 0;
  let devPasswordChanged = false;
  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED.includes(key)) continue;
    let v = String(value).trim();
    // For boolean flags allow "0"/"1"; for password fields skip blank to avoid wiping
    const isFlag = key === "show_vehicle_stops";
    if (!isFlag && v === "") continue; // skip empty — don't blank out passwords
    const storageKey = key === "rental_accounts_password" ? "rental_accounts_password_hash" : key;
    if (key === "rental_accounts_password") {
      const salt = crypto.randomBytes(16).toString("hex");
      v = `scrypt$${salt}$${crypto.scryptSync(v, salt, 32).toString("hex")}`;
    }
    // Upsert so new config keys survive a missing row
    statements.push({
      sql: "INSERT INTO system_config (key, value, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
      params: [v, storageKey],
    });
    // If dev_password changed, invalidate all active tokens
    if (key === "dev_password") devPasswordChanged = true;
  }
  await executeBatch(statements);
  if (devPasswordChanged) await clearSpecialSession("developer-admin");
  res.json({ ok: true, changed });
});

// ── Site CMS: Content ─────────────────────────────────────────────────────────

// GET /api/mkgh/site-content
router.get("/mkgh/site-content", checkDevAuth, async (_req: Request, res: Response) => {
  const rows = await queryAll<{ key: string; value: string }>("SELECT key, value FROM site_content");
  const obj: Record<string, string> = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

// PUT /api/mkgh/site-content — body: { key: value, ... }
router.put("/mkgh/site-content", checkDevAuth, async (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;
  const statements = [];
  let n = 0;
  for (const [k, v] of Object.entries(updates)) {
    statements.push({ sql: "INSERT INTO site_content (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", params: [k, String(v ?? "")] });
    n++;
  }
  await executeBatch(statements);
  res.json({ ok: true, updated: n });
});

// ── Site CMS: Services ────────────────────────────────────────────────────────

router.get("/mkgh/site-services", checkDevAuth, async (_req: Request, res: Response) => {
  res.json(await queryAll("SELECT * FROM site_services ORDER BY sort_order, id"));
});
router.post("/mkgh/site-services", checkDevAuth, async (req: Request, res: Response) => {
  const { icon = "star", label, sub = "", sort_order = 0, active = 1 } = req.body as Record<string, unknown>;
  if (!label) return void res.status(400).json({ error: "الاسم مطلوب" });
  const r = await execute(
    "INSERT INTO site_services (icon, label, sub, sort_order, active) VALUES (?, ?, ?, ?, ?)",
    String(icon), String(label), String(sub), Number(sort_order), Number(active),
  );
  res.json({ id: r.lastInsertRowid });
});
router.put("/mkgh/site-services/:id", checkDevAuth, async (req: Request, res: Response) => {
  const { icon, label, sub, sort_order, active } = req.body as Record<string, unknown>;
  await execute("UPDATE site_services SET icon=?, label=?, sub=?, sort_order=?, active=? WHERE id=?",
    String(icon ?? "star"), String(label ?? ""), String(sub ?? ""), Number(sort_order ?? 0), Number(active ?? 1), req.params.id);
  res.json({ ok: true });
});
router.delete("/mkgh/site-services/:id", checkDevAuth, async (req: Request, res: Response) => {
  await execute("DELETE FROM site_services WHERE id=?", req.params.id);
  res.json({ ok: true });
});

// ── Site CMS: Emails ──────────────────────────────────────────────────────────

router.get("/mkgh/site-emails", checkDevAuth, async (_req: Request, res: Response) => {
  res.json(await queryAll("SELECT * FROM site_emails ORDER BY sort_order, id"));
});
router.post("/mkgh/site-emails", checkDevAuth, async (req: Request, res: Response) => {
  const { label, email, sort_order = 0, active = 1 } = req.body as Record<string, unknown>;
  if (!email) return void res.status(400).json({ error: "الإيميل مطلوب" });
  const r = await execute("INSERT INTO site_emails (label, email, sort_order, active) VALUES (?, ?, ?, ?)",
    String(label ?? ""), String(email), Number(sort_order), Number(active));
  res.json({ id: r.lastInsertRowid });
});
router.put("/mkgh/site-emails/:id", checkDevAuth, async (req: Request, res: Response) => {
  const { label, email, sort_order, active } = req.body as Record<string, unknown>;
  if (!email) return void res.status(400).json({ error: "الإيميل مطلوب" });
  await execute("UPDATE site_emails SET label=?, email=?, sort_order=?, active=? WHERE id=?",
    String(label ?? ""), String(email), Number(sort_order ?? 0), Number(active ?? 1), req.params.id);
  res.json({ ok: true });
});
router.delete("/mkgh/site-emails/:id", checkDevAuth, async (req: Request, res: Response) => {
  await execute("DELETE FROM site_emails WHERE id=?", req.params.id);
  res.json({ ok: true });
});

// ── Business Card Info ────────────────────────────────────────────────────────

router.get("/mkgh/business-card", checkDevAuth, async (_req: Request, res: Response) => {
  const rows = await queryAll<{ key: string; value: string }>("SELECT key, value FROM business_card_info");
  const obj: Record<string, string> = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

router.put("/mkgh/business-card", checkDevAuth, async (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;
  const statements = Object.entries(updates).map(([k, v]) => ({
    sql: "INSERT INTO business_card_info (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    params: [k, String(v ?? "")],
  }));
  await executeBatch(statements);
  res.json({ ok: true });
});

// ── Contact Entries CRUD ──────────────────────────────────────────────────────

// GET /api/mkgh/contacts
router.get("/mkgh/contacts", checkDevAuth, async (_req: Request, res: Response) => {
  res.json(await queryAll("SELECT * FROM contact_entries ORDER BY sort_order, id"));
});

// POST /api/mkgh/contacts
router.post("/mkgh/contacts", checkDevAuth, async (req: Request, res: Response) => {
  const { label, phone, has_whatsapp = 1, sort_order = 0 } = req.body as Record<string, unknown>;
  if (!phone) return void res.status(400).json({ error: "رقم الهاتف مطلوب" });
  const r = await execute(
    "INSERT INTO contact_entries (label, phone, has_whatsapp, sort_order) VALUES (?, ?, ?, ?)",
    String(label ?? "تواصل معنا"), String(phone), Number(has_whatsapp), Number(sort_order),
  );
  res.json({ id: r.lastInsertRowid });
});

// PUT /api/mkgh/contacts/:id
router.put("/mkgh/contacts/:id", checkDevAuth, async (req: Request, res: Response) => {
  const { label, phone, has_whatsapp, sort_order, active } = req.body as Record<string, unknown>;
  if (!phone) return void res.status(400).json({ error: "رقم الهاتف مطلوب" });
  await execute(
    "UPDATE contact_entries SET label=?, phone=?, has_whatsapp=?, sort_order=?, active=? WHERE id=?",
    String(label ?? "تواصل معنا"), String(phone), Number(has_whatsapp ?? 1),
    Number(sort_order ?? 0), Number(active ?? 1), req.params.id,
  );
  res.json({ ok: true });
});

// DELETE /api/mkgh/contacts/:id
router.delete("/mkgh/contacts/:id", checkDevAuth, async (req: Request, res: Response) => {
  await execute("DELETE FROM contact_entries WHERE id=?", req.params.id);
  res.json({ ok: true });
});

export default router;
