import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// ── Vehicles ──────────────────────────────────────────────────────────────────
router.get("/vehicles", (_req, res) => {
  res.json(db.prepare("SELECT * FROM vehicles ORDER BY plate_number").all());
});

router.post("/vehicles", (req, res) => {
  const { plate_number, vehicle_type, status, driver_name, notes } = req.body;
  const result = db.prepare(
    "INSERT INTO vehicles (plate_number, vehicle_type, status, driver_name, notes) VALUES (?,?,?,?,?)"
  ).run(plate_number, vehicle_type, status || "available", driver_name || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid, message: "تمت إضافة السيارة" });
});

router.put("/vehicles/:id", (req, res) => {
  const { plate_number, vehicle_type, status, driver_name, notes } = req.body;
  db.prepare(
    "UPDATE vehicles SET plate_number=?, vehicle_type=?, status=?, driver_name=?, notes=? WHERE id=?"
  ).run(plate_number, vehicle_type, status, driver_name, notes, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/vehicles/:id", (req, res) => {
  db.prepare("DELETE FROM vehicles WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// ── Orders ────────────────────────────────────────────────────────────────────
router.get("/orders", (req, res) => {
  const { status } = req.query as Record<string, string>;
  let sql = "SELECT * FROM orders WHERE 1=1";
  const params: string[] = [];
  if (status) { sql += " AND status = ?"; params.push(status); }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/orders", (req, res) => {
  const { order_type, quantity, unit, client_name, client_phone, location, gps_lat, gps_lng, car_id, driver_name, notes } = req.body;
  const result = db.prepare(`
    INSERT INTO orders (order_type, quantity, unit, client_name, client_phone, location, gps_lat, gps_lng, car_id, driver_name, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(order_type, quantity, unit, client_name, client_phone, location,
         gps_lat || null, gps_lng || null, car_id || null, driver_name || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid, message: "تم إنشاء الطلب" });
});

router.put("/orders/:id/status", (req, res) => {
  const { status, car_id, driver_name } = req.body;
  db.prepare("UPDATE orders SET status=?, car_id=?, driver_name=? WHERE id=?")
    .run(status, car_id, driver_name, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/orders/:id", (req, res) => {
  db.prepare("DELETE FROM orders WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// ── Workshop ──────────────────────────────────────────────────────────────────
router.get("/workshop", (_req, res) => {
  res.json(db.prepare("SELECT * FROM workshop ORDER BY created_at DESC").all());
});

router.post("/workshop", (req, res) => {
  const { vehicle_id, issue_desc, technician, start_date, cost } = req.body;
  const result = db.prepare(
    "INSERT INTO workshop (vehicle_id, issue_desc, technician, start_date, cost) VALUES (?,?,?,?,?)"
  ).run(vehicle_id, issue_desc, technician || null, start_date || null, parseFloat(cost) || 0);
  res.status(201).json({ id: result.lastInsertRowid, message: "تم تسجيل بلاغ الصيانة" });
});

router.put("/workshop/:id/status", (req, res) => {
  const { status, end_date, cost } = req.body;
  db.prepare("UPDATE workshop SET status=?, end_date=?, cost=? WHERE id=?")
    .run(status, end_date || null, parseFloat(cost) || 0, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/workshop/:id", (req, res) => {
  db.prepare("DELETE FROM workshop WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// ── Dashboard summary ─────────────────────────────────────────────────────────
router.get("/dashboard", (_req, res) => {
  const vehicles   = db.prepare("SELECT status, COUNT(*) as c FROM vehicles GROUP BY status").all() as { status: string; c: number }[];
  const orders     = db.prepare("SELECT status, COUNT(*) as c FROM orders GROUP BY status").all() as { status: string; c: number }[];
  const workshop   = db.prepare("SELECT COUNT(*) as c FROM workshop WHERE status != 'done'").get() as { c: number };
  const tripRev    = db.prepare("SELECT SUM(net_amount) as total FROM trips").get() as { total: number | null };
  const expenses   = db.prepare("SELECT SUM(amount) as total FROM fleet_expenses").get() as { total: number | null };
  const employees  = db.prepare("SELECT COUNT(*) as c FROM employees WHERE status = 'active'").get() as { c: number };
  const expiring   = db.prepare(`
    SELECT name, iqama_end, work_permit_end, driver_license_end
    FROM employees
    WHERE (iqama_end BETWEEN date('now') AND date('now', '+60 days'))
       OR (work_permit_end BETWEEN date('now') AND date('now', '+60 days'))
       OR (driver_license_end BETWEEN date('now') AND date('now', '+60 days'))
  `).all();
  res.json({ vehicles, orders, workshop, tripRev, expenses, employees, expiring });
});

// ── Uploads static handler setup (registered in app.ts) ──────────────────────
export default router;
