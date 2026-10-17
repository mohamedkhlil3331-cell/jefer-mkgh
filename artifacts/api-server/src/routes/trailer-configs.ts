import { Router } from "express";
import { execute, queryAll } from "../lib/erp-sql.js";

const router = Router();

router.get("/trailer-configs", async (_req, res) => {
  res.json(await queryAll("SELECT * FROM trailer_load_configs ORDER BY id"));
});

router.post("/trailer-configs", async (req, res) => {
  const { name, product_category, trailer_capacity, min_threshold, approved_qty, unit } = req.body;
  if (!name || !product_category || !trailer_capacity) return void res.status(400).json({ error: "الحقول مطلوبة" });
  const r = await execute(
    "INSERT INTO trailer_load_configs (name, product_category, trailer_capacity, min_threshold, approved_qty, unit) VALUES (?,?,?,?,?,?)"
  , name, product_category, parseFloat(trailer_capacity), parseFloat(min_threshold) || parseFloat(trailer_capacity), parseFloat(approved_qty) || 0, unit || "وحدة");
  res.status(201).json({ id: r.lastInsertRowid, message: "تم الإضافة" });
});

router.put("/trailer-configs/:id", async (req, res) => {
  const { name, product_category, trailer_capacity, min_threshold, approved_qty, unit, active } = req.body;
  await execute(
    "UPDATE trailer_load_configs SET name=?,product_category=?,trailer_capacity=?,min_threshold=?,approved_qty=?,unit=?,active=? WHERE id=?"
  , name, product_category, parseFloat(trailer_capacity), parseFloat(min_threshold) || 0, parseFloat(approved_qty) || 0, unit || "وحدة", active ?? 1, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/trailer-configs/:id", async (req, res) => {
  await execute("UPDATE trailer_load_configs SET active=0 WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
