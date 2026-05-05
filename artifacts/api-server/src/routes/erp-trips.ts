import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/trips", (req, res) => {
  const { from, to, car_id } = req.query as Record<string, string>;
  let sql = "SELECT * FROM trips WHERE 1=1";
  const params: string[] = [];
  if (from)   { sql += " AND date >= ?"; params.push(from); }
  if (to)     { sql += " AND date <= ?"; params.push(to); }
  if (car_id) { sql += " AND car_id = ?"; params.push(car_id); }
  sql += " ORDER BY date DESC, id DESC";
  res.json(db.prepare(sql).all(...params));
});

router.get("/trips/summary", (_req, res) => {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total_records,
      SUM(trips_count) as total_trips,
      SUM(total_amount) as total_gross,
      SUM(vat) as total_vat,
      SUM(net_amount) as total_net
    FROM trips
  `).get();
  res.json(row);
});

router.post("/trips", (req, res) => {
  const { date, car_id, driver_name, client_name, material_type, destination, trips_count, unit_price } = req.body;
  const count  = parseInt(trips_count) || 1;
  const price  = parseFloat(unit_price) || 0;
  const total  = count * price;
  const vat    = parseFloat((total * 0.15).toFixed(2));
  const net    = parseFloat((total + vat).toFixed(2));

  const result = db.prepare(`
    INSERT INTO trips (date, car_id, driver_name, client_name, material_type, destination,
      trips_count, unit_price, total_amount, vat, net_amount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(date, car_id, driver_name, client_name, material_type, destination,
         count, price, total, vat, net);
  res.status(201).json({ id: result.lastInsertRowid, total, vat, net, message: "تم حفظ الرحلة" });
});

router.delete("/trips/:id", (req, res) => {
  db.prepare("DELETE FROM trips WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
