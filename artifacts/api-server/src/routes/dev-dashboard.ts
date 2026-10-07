import { Router, type Request, type Response, type NextFunction } from "express";
import db from "../lib/db.js";
import crypto from "node:crypto";
import { acquireActorLock } from "../lib/session-control.js";
import { clearSpecialSession, isSpecialSessionValid, setSpecialSession } from "../lib/special-sessions.js";

const router = Router();

export function isValidDevToken(token: string): boolean {
  return isSpecialSessionValid("developer-admin", token);
}

function cleanExpired() {
  db.prepare("DELETE FROM special_sessions WHERE datetime(expires_at)<=datetime('now')").run();
}

function getCfg(key: string): string {
  return (db.prepare("SELECT value FROM system_config WHERE key=?").get(key) as any)?.value ?? "";
}

function checkDevAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("DevAuth ") ? auth.slice(8) : (req.query.devToken as string);
  if (!token) return void res.status(401).json({ error: "غير مصرح" });
  if (!isValidDevToken(token)) {
    return void res.status(401).json({ error: "انتهت صلاحية الجلسة" });
  }
  next();
}

// POST /api/mkgh/auth — verify dev password, issue session token
router.post("/mkgh/auth", async (req: Request, res: Response) => {
  const { password } = req.body as { password: string };
  const devPw = getCfg("dev_password") || "09001120009328187184508MmOo@mkgh.com";
  if (password !== devPw) return void res.status(401).json({ error: "كلمة مرور خاطئة" });
  cleanExpired();
  const release = await acquireActorLock("developer-admin");
  try {
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setSpecialSession("developer-admin", token, expiresAt);
    res.json({ ok: true, token });
  } finally {
    release();
  }
});

// GET /api/mkgh/sessions — all login sessions with user info
router.get("/mkgh/sessions", checkDevAuth, (_req: Request, res: Response) => {
  // created_at / ip_address may not exist if Supabase schema lacks them — use safe COALESCE
  const hasCols = (() => {
    const info = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    const names = new Set(info.map(c => c.name));
    return { created_at: names.has("created_at"), ip_address: names.has("ip_address") };
  })();
  const rows = db.prepare(`
    SELECT
      s.token,
      ${hasCols.created_at ? "s.created_at," : "NULL AS created_at,"}
      s.expires_at,
      ${hasCols.ip_address ? "s.ip_address," : "NULL AS ip_address,"}
      u.id AS user_id, u.name, u.phone, u.role
    FROM sessions s
    LEFT JOIN users u ON s.user_id = u.id
    ORDER BY s.rowid DESC
    LIMIT 500
  `).all();
  res.json(rows);
});

// GET /api/mkgh/audit — dev_audit_log entries
router.get("/mkgh/audit", checkDevAuth, (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 500, 2000);
  const rows = db.prepare(
    "SELECT * FROM dev_audit_log ORDER BY created_at DESC LIMIT ?"
  ).all(limit);
  res.json(rows);
});

// GET /api/mkgh/stats — aggregated stats
router.get("/mkgh/stats", checkDevAuth, (_req: Request, res: Response) => {
  const userCount    = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as any).c as number;
  const sessionCount = (db.prepare("SELECT COUNT(*) AS c FROM sessions WHERE expires_at > datetime('now')").get() as any).c as number;
  const orderCount   = (db.prepare("SELECT COUNT(*) AS c FROM workflow_orders").get() as any).c as number;
  const auditCount   = (db.prepare("SELECT COUNT(*) AS c FROM dev_audit_log").get() as any).c as number;
  const todayActions = (db.prepare(
    "SELECT COUNT(*) AS c FROM dev_audit_log WHERE date(created_at) = date('now')"
  ).get() as any).c as number;

  const usersByRole = db.prepare(
    "SELECT role, COUNT(*) AS count FROM users GROUP BY role ORDER BY count DESC"
  ).all() as { role: string; count: number }[];

  const sessionCols = (() => {
    const info = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    const n = new Set(info.map(c => c.name));
    return { created_at: n.has("created_at"), ip_address: n.has("ip_address") };
  })();
  const recentLogins = db.prepare(`
    SELECT u.name, u.role, u.phone,
      ${sessionCols.created_at ? "s.created_at," : "s.expires_at AS created_at,"}
      ${sessionCols.ip_address ? "s.ip_address" : "NULL AS ip_address"}
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    ORDER BY s.rowid DESC
    LIMIT 10
  `).all();

  res.json({ userCount, sessionCount, orderCount, auditCount, todayActions, usersByRole, recentLogins });
});

// GET /api/mkgh/config — return current config (sensitive values masked)
router.get("/mkgh/config", checkDevAuth, (_req: Request, res: Response) => {
  const SENSITIVE = ["gmail_pass", "dev_password", "mkgh_password", "rental_accounts_password_hash"];
  const rows = db.prepare("SELECT key, value, updated_at FROM system_config").all() as { key: string; value: string; updated_at: string }[];
  const result = rows.map(r => ({
    key: r.key,
    value: SENSITIVE.includes(r.key) ? "" : r.value,
    has_value: r.value !== "",
    updated_at: r.updated_at,
  }));
  res.json(result);
});

// PUT /api/mkgh/config — update one or more config values
router.put("/mkgh/config", checkDevAuth, (req: Request, res: Response) => {
  const ALLOWED = ["otp_email", "gmail_user", "gmail_pass", "mkgh_password", "dev_password", "rental_accounts_password", "show_vehicle_stops"];
  const updates = req.body as Record<string, string>;
  const stmt = db.prepare(
    "UPDATE system_config SET value=?, updated_at=datetime('now') WHERE key=?"
  );
  let changed = 0;
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
    db.prepare(
      "INSERT INTO system_config (key, value, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
    ).run(v, storageKey);
    // If dev_password changed, invalidate all active tokens
    if (key === "dev_password") clearSpecialSession("developer-admin");
  }
  res.json({ ok: true, changed });
});

// ── Site CMS: Content ─────────────────────────────────────────────────────────

// GET /api/mkgh/site-content
router.get("/mkgh/site-content", checkDevAuth, (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT key, value FROM site_content").all() as { key: string; value: string }[];
  const obj: Record<string, string> = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

// PUT /api/mkgh/site-content — body: { key: value, ... }
router.put("/mkgh/site-content", checkDevAuth, (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;
  const stmt = db.prepare("INSERT INTO site_content (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at");
  let n = 0;
  for (const [k, v] of Object.entries(updates)) { stmt.run(k, String(v ?? "")); n++; }
  res.json({ ok: true, updated: n });
});

// ── Site CMS: Services ────────────────────────────────────────────────────────

router.get("/mkgh/site-services", checkDevAuth, (_req: Request, res: Response) => {
  res.json(db.prepare("SELECT * FROM site_services ORDER BY sort_order, id").all());
});
router.post("/mkgh/site-services", checkDevAuth, (req: Request, res: Response) => {
  const { icon = "star", label, sub = "", sort_order = 0, active = 1 } = req.body as Record<string, unknown>;
  if (!label) return void res.status(400).json({ error: "الاسم مطلوب" });
  const r = db.prepare("INSERT INTO site_services (icon, label, sub, sort_order, active) VALUES (?, ?, ?, ?, ?)").run(String(icon), String(label), String(sub), Number(sort_order), Number(active));
  res.json({ id: r.lastInsertRowid });
});
router.put("/mkgh/site-services/:id", checkDevAuth, (req: Request, res: Response) => {
  const { icon, label, sub, sort_order, active } = req.body as Record<string, unknown>;
  db.prepare("UPDATE site_services SET icon=?, label=?, sub=?, sort_order=?, active=? WHERE id=?")
    .run(String(icon ?? "star"), String(label ?? ""), String(sub ?? ""), Number(sort_order ?? 0), Number(active ?? 1), req.params.id);
  res.json({ ok: true });
});
router.delete("/mkgh/site-services/:id", checkDevAuth, (req: Request, res: Response) => {
  db.prepare("DELETE FROM site_services WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Site CMS: Emails ──────────────────────────────────────────────────────────

router.get("/mkgh/site-emails", checkDevAuth, (_req: Request, res: Response) => {
  res.json(db.prepare("SELECT * FROM site_emails ORDER BY sort_order, id").all());
});
router.post("/mkgh/site-emails", checkDevAuth, (req: Request, res: Response) => {
  const { label, email, sort_order = 0, active = 1 } = req.body as Record<string, unknown>;
  if (!email) return void res.status(400).json({ error: "الإيميل مطلوب" });
  const r = db.prepare("INSERT INTO site_emails (label, email, sort_order, active) VALUES (?, ?, ?, ?)").run(String(label ?? ""), String(email), Number(sort_order), Number(active));
  res.json({ id: r.lastInsertRowid });
});
router.put("/mkgh/site-emails/:id", checkDevAuth, (req: Request, res: Response) => {
  const { label, email, sort_order, active } = req.body as Record<string, unknown>;
  if (!email) return void res.status(400).json({ error: "الإيميل مطلوب" });
  db.prepare("UPDATE site_emails SET label=?, email=?, sort_order=?, active=? WHERE id=?")
    .run(String(label ?? ""), String(email), Number(sort_order ?? 0), Number(active ?? 1), req.params.id);
  res.json({ ok: true });
});
router.delete("/mkgh/site-emails/:id", checkDevAuth, (req: Request, res: Response) => {
  db.prepare("DELETE FROM site_emails WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Business Card Info ────────────────────────────────────────────────────────

router.get("/mkgh/business-card", checkDevAuth, (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT key, value FROM business_card_info").all() as { key: string; value: string }[];
  const obj: Record<string, string> = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

router.put("/mkgh/business-card", checkDevAuth, (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;
  const stmt = db.prepare("INSERT INTO business_card_info (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at");
  for (const [k, v] of Object.entries(updates)) stmt.run(k, String(v ?? ""));
  res.json({ ok: true });
});

// ── Contact Entries CRUD ──────────────────────────────────────────────────────

// GET /api/mkgh/contacts
router.get("/mkgh/contacts", checkDevAuth, (_req: Request, res: Response) => {
  res.json(db.prepare("SELECT * FROM contact_entries ORDER BY sort_order, id").all());
});

// POST /api/mkgh/contacts
router.post("/mkgh/contacts", checkDevAuth, (req: Request, res: Response) => {
  const { label, phone, has_whatsapp = 1, sort_order = 0 } = req.body as Record<string, unknown>;
  if (!phone) return void res.status(400).json({ error: "رقم الهاتف مطلوب" });
  const r = db.prepare(
    "INSERT INTO contact_entries (label, phone, has_whatsapp, sort_order) VALUES (?, ?, ?, ?)"
  ).run(String(label ?? "تواصل معنا"), String(phone), Number(has_whatsapp), Number(sort_order));
  res.json({ id: r.lastInsertRowid });
});

// PUT /api/mkgh/contacts/:id
router.put("/mkgh/contacts/:id", checkDevAuth, (req: Request, res: Response) => {
  const { label, phone, has_whatsapp, sort_order, active } = req.body as Record<string, unknown>;
  if (!phone) return void res.status(400).json({ error: "رقم الهاتف مطلوب" });
  db.prepare(
    "UPDATE contact_entries SET label=?, phone=?, has_whatsapp=?, sort_order=?, active=? WHERE id=?"
  ).run(String(label ?? "تواصل معنا"), String(phone), Number(has_whatsapp ?? 1), Number(sort_order ?? 0), Number(active ?? 1), req.params.id);
  res.json({ ok: true });
});

// DELETE /api/mkgh/contacts/:id
router.delete("/mkgh/contacts/:id", checkDevAuth, (req: Request, res: Response) => {
  db.prepare("DELETE FROM contact_entries WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
