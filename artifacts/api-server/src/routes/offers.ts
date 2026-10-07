import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/offers", (_req, res) => {
  const role = (_req.query as Record<string,string>).role;
  let sql = "SELECT * FROM offers";
  if (role !== "admin") sql += " WHERE active=1";
  sql += " ORDER BY created_at DESC";
  const rows = (db.prepare(sql).all() as Record<string,unknown>[]).map(r => ({
    ...r,
    product_ids: r.product_ids ? JSON.parse(r.product_ids as string) : [],
  }));
  res.json(rows);
});

router.post("/offers", (req, res) => {
  const { title, description, image_url, discount_pct, valid_from, valid_until, created_by, product_ids } = req.body;
  if (!title) return void res.status(400).json({ error: "عنوان العرض مطلوب" });
  const pids = Array.isArray(product_ids) ? JSON.stringify(product_ids) : null;
  const r = db.prepare(`
    INSERT INTO offers (title,description,image_url,discount_pct,valid_from,valid_until,active,created_by,product_ids)
    VALUES (?,?,?,?,?,?,1,?,?)
  `).run(title, description||null, image_url||null, parseFloat(discount_pct)||0,
         valid_from||null, valid_until||null, created_by||null, pids);
  res.status(201).json({ id: r.lastInsertRowid, message: "تم إضافة العرض" });
});

router.put("/offers/:id", (req, res) => {
  const { title, description, image_url, discount_pct, valid_from, valid_until, active, product_ids } = req.body;
  const pids = Array.isArray(product_ids) ? JSON.stringify(product_ids) : null;
  db.prepare(`
    UPDATE offers SET title=?,description=?,image_url=?,discount_pct=?,
    valid_from=?,valid_until=?,active=?,product_ids=? WHERE id=?
  `).run(title, description||null, image_url||null, parseFloat(discount_pct)||0,
         valid_from||null, valid_until||null, active===false||active===0?0:1, pids, req.params.id);
  res.json({ message: "تم تحديث العرض" });
});

router.delete("/offers/:id", (req, res) => {
  db.prepare("DELETE FROM offers WHERE id=?").run(req.params.id);
  res.json({ message: "تم حذف العرض" });
});

export default router;
