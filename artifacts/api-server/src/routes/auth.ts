import { Router } from "express";
import db, { generateToken } from "../lib/db.js";

const router = Router();

router.post("/auth/login", (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return void res.status(400).json({ error: "رقم الجوال وكلمة المرور مطلوبان" });

  const user = db.prepare("SELECT * FROM users WHERE phone = ? AND active = 1").get(phone) as Record<string, unknown> | undefined;
  if (!user || user.password !== password) return void res.status(401).json({ error: "رقم الجوال أو كلمة المرور غير صحيحة" });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, user.id, expiresAt);

  const { password: _pw, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

router.post("/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.json({ message: "تم تسجيل الخروج" });
});

router.get("/auth/me", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return void res.status(401).json({ error: "غير مصرح" });

  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token) as Record<string, unknown> | undefined;
  if (!session) return void res.status(401).json({ error: "الجلسة منتهية" });

  const user = db.prepare("SELECT id,name,phone,role,email,company_name,vat_number,cr_number,created_at FROM users WHERE id = ?").get(session.user_id) as Record<string, unknown> | undefined;
  if (!user) return void res.status(401).json({ error: "المستخدم غير موجود" });

  res.json(user);
});

// Get all users (admin) or reps list (for customer order form)
router.get("/users", (req, res) => {
  const { role } = req.query as Record<string, string>;
  let sql = "SELECT id,name,phone,role,active,created_at FROM users WHERE 1=1";
  const params: string[] = [];
  if (role) { sql += " AND role = ?"; params.push(role); }
  sql += " ORDER BY name";
  res.json(db.prepare(sql).all(...params));
});

router.post("/users", (req, res) => {
  const { name, phone, password, role, email, company_name, vat_number, cr_number } = req.body;
  try {
    const result = db.prepare(
      "INSERT INTO users (name,phone,password,role,email,company_name,vat_number,cr_number) VALUES (?,?,?,?,?,?,?,?)"
    ).run(name, phone, password || "123456", role || "customer", email || null, company_name || null, vat_number || null, cr_number || null);
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

export default router;
