import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

function genNum(): string {
  const now = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `BLKR${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

const VALID_STATUSES = ["scheduled", "loading", "loaded", "dispatched", "delivered", "cancelled"];

router.get("/bulker-movements", (req, res) => {
  const { status } = req.query as Record<string, string>;
  if (status) {
    res.json(db.prepare("SELECT * FROM bulker_movements WHERE status=? ORDER BY created_at DESC").all(status));
  } else {
    res.json(db.prepare("SELECT * FROM bulker_movements ORDER BY created_at DESC").all());
  }
});

router.get("/bulker-movements/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM bulker_movements WHERE id=?").get(req.params.id);
  if (!row) return void res.status(404).json({ error: "الحركة غير موجودة" });
  res.json(row);
});

router.post("/bulker-movements", (req, res) => {
  const {
    vehicle_id, driver_id, vehicle_plate, driver_name, driver_phone,
    load_qty_m3, destination, customer_order_id, is_for_customer,
    customer_name, notes, created_by, scheduled_date,
  } = req.body as Record<string, unknown>;

  const num = genNum();
  const r = db.prepare(`
    INSERT INTO bulker_movements
      (movement_number, vehicle_id, driver_id, vehicle_plate, driver_name, driver_phone,
       load_qty_m3, destination, customer_order_id, is_for_customer, customer_name,
       status, notes, created_by, scheduled_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
  `).run(
    num,
    vehicle_id || null, driver_id || null,
    vehicle_plate || null, driver_name || null, driver_phone || null,
    parseFloat(String(load_qty_m3)) || 0,
    destination || null,
    customer_order_id || null,
    is_for_customer ? 1 : 0,
    customer_name || null,
    notes || null,
    created_by || null,
    scheduled_date || null,
  );
  res.status(201).json({ id: r.lastInsertRowid, movement_number: num });
});

router.put("/bulker-movements/:id", (req, res) => {
  const {
    vehicle_id, driver_id, vehicle_plate, driver_name, driver_phone,
    load_qty_m3, destination, customer_order_id, is_for_customer,
    customer_name, notes, scheduled_date,
  } = req.body as Record<string, unknown>;
  db.prepare(`
    UPDATE bulker_movements SET
      vehicle_id=?, driver_id=?, vehicle_plate=?, driver_name=?, driver_phone=?,
      load_qty_m3=?, destination=?, customer_order_id=?, is_for_customer=?,
      customer_name=?, notes=?, scheduled_date=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    vehicle_id || null, driver_id || null,
    vehicle_plate || null, driver_name || null, driver_phone || null,
    parseFloat(String(load_qty_m3)) || 0,
    destination || null,
    customer_order_id || null,
    is_for_customer ? 1 : 0,
    customer_name || null,
    notes || null,
    scheduled_date || null,
    req.params.id,
  );
  res.json({ message: "تم التحديث" });
});

router.put("/bulker-movements/:id/status", (req, res) => {
  const { status } = req.body as { status: string };
  if (!VALID_STATUSES.includes(status)) return void res.status(400).json({ error: "حالة غير صحيحة" });

  const tsMap: Record<string, string> = { loaded: "loaded_at", dispatched: "dispatched_at", delivered: "delivered_at" };
  const tsField = tsMap[status];
  const extra = tsField ? `, ${tsField}=datetime('now')` : "";
  db.prepare(`UPDATE bulker_movements SET status=?, updated_at=datetime('now')${extra} WHERE id=?`).run(status, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/bulker-movements/:id", (req, res) => {
  db.prepare("DELETE FROM bulker_movements WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
