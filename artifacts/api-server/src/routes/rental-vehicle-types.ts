import { Router } from "express";
import { execute, queryAll } from "../lib/erp-sql.js";

const router = Router();

router.get("/rental-vehicle-types", async (_req, res) => {
  res.json(await queryAll("SELECT * FROM rental_vehicle_types WHERE active=1 ORDER BY sort_order,name"));
});

router.get("/rental-vehicle-types/all", async (_req, res) => {
  res.json(await queryAll("SELECT * FROM rental_vehicle_types ORDER BY sort_order,name"));
});

router.post("/rental-vehicle-types", async (req, res) => {
  const { name, description, icon, sort_order, rate_per_km } = req.body;
  if (!name) return void res.status(400).json({ error: "الاسم مطلوب" });
  try {
    const r = await execute(
      "INSERT INTO rental_vehicle_types (name,description,icon,sort_order,rate_per_km) VALUES (?,?,?,?,?)"
    , name, description||null, icon||"🚛", parseInt(sort_order)||0, parseFloat(rate_per_km)||0);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch {
    res.status(400).json({ error: "الاسم مكرر" });
  }
});

router.put("/rental-vehicle-types/:id", async (req, res) => {
  const { name, description, icon, sort_order, active, rate_per_km } = req.body;
  await execute(`
    UPDATE rental_vehicle_types SET name=?,description=?,icon=?,sort_order=?,active=?,rate_per_km=? WHERE id=?
  `, name, description||null, icon||"🚛", parseInt(sort_order)||0,
         active===false||active===0?0:1, parseFloat(rate_per_km)||0, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/rental-vehicle-types/:id", async (req, res) => {
  await execute("DELETE FROM rental_vehicle_types WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
