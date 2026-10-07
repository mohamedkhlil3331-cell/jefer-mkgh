import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/rental-vehicle-types", (_req, res) => {
  res.json(db.prepare("SELECT * FROM rental_vehicle_types WHERE active=1 ORDER BY sort_order,name").all());
});

router.get("/rental-vehicle-types/all", (_req, res) => {
  res.json(db.prepare("SELECT * FROM rental_vehicle_types ORDER BY sort_order,name").all());
});

router.post("/rental-vehicle-types", (req, res) => {
  const { name, description, icon, sort_order, rate_per_km } = req.body;
  if (!name) return void res.status(400).json({ error: "الاسم مطلوب" });
  try {
    const r = db.prepare(
      "INSERT INTO rental_vehicle_types (name,description,icon,sort_order,rate_per_km) VALUES (?,?,?,?,?)"
    ).run(name, description||null, icon||"🚛", parseInt(sort_order)||0, parseFloat(rate_per_km)||0);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch {
    res.status(400).json({ error: "الاسم مكرر" });
  }
});

router.put("/rental-vehicle-types/:id", (req, res) => {
  const { name, description, icon, sort_order, active, rate_per_km } = req.body;
  db.prepare(`
    UPDATE rental_vehicle_types SET name=?,description=?,icon=?,sort_order=?,active=?,rate_per_km=? WHERE id=?
  `).run(name, description||null, icon||"🚛", parseInt(sort_order)||0,
         active===false||active===0?0:1, parseFloat(rate_per_km)||0, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/rental-vehicle-types/:id", (req, res) => {
  db.prepare("DELETE FROM rental_vehicle_types WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
