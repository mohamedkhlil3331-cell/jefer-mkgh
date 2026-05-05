import { Router } from "express";
import db, { generateToken } from "../lib/db.js";

const router = Router();

// ── Login ────────────────────────────────────────────────────────────────────
router.post("/auth/login", (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return void res.status(400).json({ error: "رقم الجوال وكلمة المرور مطلوبان" });

  const user = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as Record<string, unknown> | undefined;
  if (!user) return void res.status(401).json({ error: "رقم الجوال غير مسجل" });
  if (user.password !== password) return void res.status(401).json({ error: "كلمة المرور غير صحيحة" });

  // Check approval for non-customer roles
  if (user.approval_status === "pending")
    return void res.status(403).json({ error: "الحساب قيد المراجعة، يرجى انتظار موافقة المدير", code: "pending_approval" });
  if (user.approval_status === "rejected")
    return void res.status(403).json({ error: "تم رفض طلب التسجيل. تواصل مع الإدارة", code: "rejected" });
  if (!user.active)
    return void res.status(403).json({ error: "الحساب غير مفعّل، يرجى التواصل مع الإدارة" });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, user.id, expiresAt);

  const { password: _pw, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// ── Register ─────────────────────────────────────────────────────────────────
router.post("/auth/register", (req, res) => {
  const { name, phone, password, company_name, vat_number, role, register_note } = req.body;
  if (!name || !phone || !password) return void res.status(400).json({ error: "الاسم والجوال وكلمة المرور مطلوبة" });
  if (phone.length < 10) return void res.status(400).json({ error: "رقم الجوال غير صحيح" });

  const isStaff = role && role !== "customer";
  const approvalStatus = isStaff ? "pending" : "approved";
  const active = isStaff ? 0 : 1;
  const finalRole = role || "customer";

  try {
    const result = db.prepare(
      "INSERT INTO users (name,phone,password,role,company_name,vat_number,active,approval_status,register_note) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(name, phone, password, finalRole, company_name || null, vat_number || null, active, approvalStatus, register_note || null);

    if (!isStaff) {
      // Auto-login customers
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, result.lastInsertRowid, expiresAt);
      const newUser = db.prepare("SELECT id,name,phone,role,company_name,vat_number FROM users WHERE id=?").get(result.lastInsertRowid);
      return void res.status(201).json({ id: result.lastInsertRowid, token, user: newUser, message: "تم إنشاء الحساب بنجاح" });
    }

    res.status(201).json({ id: result.lastInsertRowid, pending: true, message: "تم التسجيل، يرجى انتظار موافقة المدير" });
  } catch {
    res.status(409).json({ error: "رقم الجوال مسجل مسبقاً" });
  }
});

// ── Guest token ───────────────────────────────────────────────────────────────
router.post("/auth/guest", (_req, res) => {
  res.json({
    token: "guest",
    user: { id: 0, name: "زائر", phone: "guest", role: "customer", isGuest: true },
  });
});

// ── Logout ───────────────────────────────────────────────────────────────────
router.post("/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token && token !== "guest") db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.json({ message: "تم تسجيل الخروج" });
});

// ── Me ────────────────────────────────────────────────────────────────────────
router.get("/auth/me", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || token === "guest") return void res.status(401).json({ error: "غير مصرح" });

  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token) as Record<string, unknown> | undefined;
  if (!session) return void res.status(401).json({ error: "الجلسة منتهية" });

  const user = db.prepare("SELECT id,name,phone,role,email,company_name,vat_number,cr_number,created_at FROM users WHERE id = ?").get(session.user_id) as Record<string, unknown> | undefined;
  if (!user) return void res.status(401).json({ error: "المستخدم غير موجود" });

  res.json(user);
});

// ── Users CRUD ────────────────────────────────────────────────────────────────
router.get("/users", (req, res) => {
  const { role } = req.query as Record<string, string>;
  let sql = "SELECT id,name,phone,role,active,approval_status,company_name,created_at FROM users WHERE 1=1";
  const params: string[] = [];
  if (role) { sql += " AND role = ?"; params.push(role); }
  sql += " ORDER BY name";
  res.json(db.prepare(sql).all(...params));
});

router.post("/users", (req, res) => {
  const { name, phone, password, role, email, company_name, vat_number, cr_number } = req.body;
  try {
    const result = db.prepare(
      "INSERT INTO users (name,phone,password,role,email,company_name,vat_number,cr_number,approval_status) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(name, phone, password || "123456", role || "customer", email || null, company_name || null, vat_number || null, cr_number || null, "approved");
    res.status(201).json({ id: result.lastInsertRowid, message: "تم إضافة المستخدم" });
  } catch {
    res.status(409).json({ error: "رقم الجوال مسجل مسبقاً" });
  }
});

router.put("/users/:id", (req, res) => {
  const { name, phone, password, role, email, company_name, vat_number, cr_number, active } = req.body;
  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!current) return void res.status(404).json({ error: "المستخدم غير موجود" });
  db.prepare(
    "UPDATE users SET name=?,phone=?,password=?,role=?,email=?,company_name=?,vat_number=?,cr_number=?,active=? WHERE id=?"
  ).run(name||current.name, phone||current.phone, password||current.password, role||current.role,
        email||current.email, company_name||current.company_name, vat_number||current.vat_number,
        cr_number||current.cr_number, active??current.active, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/users/:id", (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// ── Admin: Approvals Management ────────────────────────────────────────────────
router.get("/admin/pending-approvals", (_req, res) => {
  const rows = db.prepare(
    "SELECT id,name,phone,role,company_name,register_note,approval_status,created_at FROM users WHERE approval_status='pending' ORDER BY created_at DESC"
  ).all();
  res.json(rows);
});

router.put("/admin/users/:id/approve", (req, res) => {
  const { approved, note } = req.body;
  const status = approved ? "approved" : "rejected";
  const active = approved ? 1 : 0;
  db.prepare("UPDATE users SET approval_status=?,active=? WHERE id=?").run(status, active, req.params.id);
  if (note) db.prepare("UPDATE users SET register_note=? WHERE id=?").run(note, req.params.id);
  res.json({ message: approved ? "تم قبول المستخدم" : "تم رفض المستخدم" });
});

export default router;
