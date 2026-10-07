import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/trailer-configs", (_req, res) => {
  res.json(db.prepare("SELECT * FROM trailer_load_configs ORDER BY id").all());
});

router.post("/trailer-configs", (req, res) => {
  const { name, product_category, trailer_capacity, min_threshold, approved_qty, unit } = req.body;
  if (!name || !product_category || !trailer_capacity) return void res.status(400).json({ error: "الحقول مطلوبة" });
  const r = db.prepare(
    "INSERT INTO trailer_load_configs (name, product_category, trailer_capacity, min_threshold, approved_qty, unit) VALUES (?,?,?,?,?,?)"
  ).run(name, product_category, parseFloat(trailer_capacity), parseFloat(min_threshold) || parseFloat(trailer_capacity), parseFloat(approved_qty) || 0, unit || "وحدة");
  res.status(201).json({ id: r.lastInsertRowid, message: "تم الإضافة" });
});

router.put("/trailer-configs/:id", (req, res) => {
  const { name, product_category, trailer_capacity, min_threshold, approved_qty, unit, active } = req.body;
  db.prepare(
    "UPDATE trailer_load_configs SET name=?,product_category=?,trailer_capacity=?,min_threshold=?,approved_qty=?,unit=?,active=? WHERE id=?"
  ).run(name, product_category, parseFloat(trailer_capacity), parseFloat(min_threshold) || 0, parseFloat(approved_qty) || 0, unit || "وحدة", active ?? 1, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/trailer-configs/:id", (req, res) => {
  db.prepare("UPDATE trailer_load_configs SET active=0 WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
