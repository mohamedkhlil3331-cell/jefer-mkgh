import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// ══════════════════════════════════════════════════════════════════
// LEGAL DOCS — مكتبة الأنظمة السعودية
// ══════════════════════════════════════════════════════════════════

router.get("/legal-docs", (req, res) => {
  const { category, q } = req.query as Record<string, string>;
  let sql = "SELECT * FROM legal_docs WHERE active=1";
  const params: string[] = [];
  if (category) { sql += " AND category=?"; params.push(category); }
  if (q) { sql += " AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)"; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.get("/legal-docs/:id", (req, res) => {
  const doc = db.prepare("SELECT * FROM legal_docs WHERE id=?").get(req.params.id);
  if (!doc) return void res.status(404).json({ error: "الوثيقة غير موجودة" });
  res.json(doc);
});

router.post("/legal-docs", (req, res) => {
  const { title, category, doc_number, published_date, content, file_url, tags, created_by } = req.body;
  if (!title) return void res.status(400).json({ error: "العنوان مطلوب" });
  const r = db.prepare(`
    INSERT INTO legal_docs (title,category,doc_number,published_date,content,file_url,tags,created_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(title, category||"نظام", doc_number||null, published_date||null, content||null, file_url||null, tags||null, created_by||null);
  res.status(201).json({ id: r.lastInsertRowid, message: "تمت إضافة الوثيقة" });
});

router.put("/legal-docs/:id", (req, res) => {
  const { title, category, doc_number, published_date, content, file_url, tags, active } = req.body;
  db.prepare(`
    UPDATE legal_docs SET title=?,category=?,doc_number=?,published_date=?,content=?,file_url=?,tags=?,active=?,updated_at=datetime('now') WHERE id=?
  `).run(title, category||"نظام", doc_number||null, published_date||null, content||null, file_url||null, tags||null, active??1, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/legal-docs/:id", (req, res) => {
  db.prepare("UPDATE legal_docs SET active=0 WHERE id=?").run(req.params.id);
  res.json({ message: "تم الأرشفة" });
});

router.get("/legal-doc-categories", (_req, res) => {
  const cats = db.prepare("SELECT DISTINCT category FROM legal_docs WHERE active=1 ORDER BY category").all();
  res.json(["نظام","لائحة","قرار","تعميم","عقد","أخرى"].map(c => ({
    key: c, count: (cats as {category:string}[]).filter(x => x.category === c).length
  })));
});

// ══════════════════════════════════════════════════════════════════
// HEARINGS — متتبع الجلسات
// ══════════════════════════════════════════════════════════════════

router.get("/hearings", (req, res) => {
  const { status, case_type, q } = req.query as Record<string, string>;
  let sql = `
    SELECT h.*, wo.order_number
    FROM hearings h
    LEFT JOIN workflow_orders wo ON wo.id = h.related_order_id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (status)    { sql += " AND h.status=?";    params.push(status); }
  if (case_type) { sql += " AND h.case_type=?"; params.push(case_type); }
  if (q)         { sql += " AND (h.title LIKE ? OR h.party_name LIKE ? OR h.driver_name LIKE ? OR h.case_number LIKE ?)"; params.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += " ORDER BY h.hearing_date DESC, h.created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/hearings", (req, res) => {
  const { title, case_type, case_number, party_name, driver_name, related_order_id, vehicle_plate, hearing_date, court, notes, created_by } = req.body;
  if (!title) return void res.status(400).json({ error: "العنوان مطلوب" });
  const r = db.prepare(`
    INSERT INTO hearings (title,case_type,case_number,party_name,driver_name,related_order_id,vehicle_plate,hearing_date,court,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(title, case_type||"مخالفة مرورية", case_number||null, party_name||null, driver_name||null, related_order_id||null, vehicle_plate||null, hearing_date||null, court||null, notes||null, created_by||null);
  res.status(201).json({ id: r.lastInsertRowid, message: "تمت إضافة الجلسة" });
});

router.put("/hearings/:id", (req, res) => {
  const { title, case_type, case_number, party_name, driver_name, related_order_id, vehicle_plate, hearing_date, court, status, notes, outcome } = req.body;
  const closedAt = status === "مغلقة" ? "datetime('now')" : "NULL";
  db.prepare(`
    UPDATE hearings SET title=?,case_type=?,case_number=?,party_name=?,driver_name=?,related_order_id=?,vehicle_plate=?,
    hearing_date=?,court=?,status=?,notes=?,outcome=?,updated_at=datetime('now') WHERE id=?
  `).run(title, case_type||"مخالفة مرورية", case_number||null, party_name||null, driver_name||null, related_order_id||null, vehicle_plate||null, hearing_date||null, court||null, status||"مفتوحة", notes||null, outcome||null, req.params.id);
  if (status === "مغلقة") {
    db.prepare("UPDATE hearings SET closed_at=datetime('now') WHERE id=? AND closed_at IS NULL").run(req.params.id);
  }
  res.json({ message: "تم التحديث" });
});

router.delete("/hearings/:id", (req, res) => {
  db.prepare("DELETE FROM hearings WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
