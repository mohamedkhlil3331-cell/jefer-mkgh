import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

function syncUser(vehicle_plate: string, driver_name: string, driver_phone: string | null) {
  if (!driver_phone) return;
  db.prepare(`
    INSERT OR IGNORE INTO users (name, phone, password, role, active, approval_status, vehicle_plate)
    VALUES (?, ?, '123456', 'bulker_driver', 1, 'approved', ?)
  `).run(driver_name, driver_phone, vehicle_plate);
  db.prepare(`
    UPDATE users SET name=?, vehicle_plate=? WHERE phone=? AND role='bulker_driver'
  `).run(driver_name, vehicle_plate, driver_phone);
}

router.get("/bulker-vehicles", (_req, res) => {
  const rows = db.prepare("SELECT * FROM bulker_vehicles ORDER BY id DESC").all();
  res.json(rows);
});

router.post("/bulker-vehicles", (req, res) => {
  const { vehicle_plate, driver_name, destination, driver_phone, supervisor_phone, notes } = req.body;
  if (!vehicle_plate || !driver_name) {
    res.status(400).json({ error: "رقم السيارة واسم السائق مطلوبان" });
    return;
  }
  const r = db.prepare(`
    INSERT INTO bulker_vehicles (vehicle_plate, driver_name, destination, driver_phone, supervisor_phone, notes)
    VALUES (?,?,?,?,?,?)
  `).run(vehicle_plate, driver_name, destination || null, driver_phone || null, supervisor_phone || null, notes || null);

  syncUser(vehicle_plate, driver_name, driver_phone || null);

  res.json({ id: r.lastInsertRowid });
});

router.put("/bulker-vehicles/:id", (req, res) => {
  const { vehicle_plate, driver_name, destination, driver_phone, supervisor_phone, notes } = req.body;
  if (!vehicle_plate || !driver_name) {
    res.status(400).json({ error: "رقم السيارة واسم السائق مطلوبان" });
    return;
  }
  db.prepare(`
    UPDATE bulker_vehicles
    SET vehicle_plate=?, driver_name=?, destination=?, driver_phone=?, supervisor_phone=?, notes=?
    WHERE id=?
  `).run(vehicle_plate, driver_name, destination || null, driver_phone || null, supervisor_phone || null, notes || null, req.params.id);

  syncUser(vehicle_plate, driver_name, driver_phone || null);

  res.json({ ok: true });
});

router.put("/bulker-vehicles/:id/toggle-stopped", (req, res) => {
  db.prepare(`
    UPDATE bulker_vehicles SET is_stopped = CASE WHEN is_stopped=1 THEN 0 ELSE 1 END WHERE id=?
  `).run(req.params.id);
  const row = db.prepare("SELECT is_stopped FROM bulker_vehicles WHERE id=?").get(req.params.id) as { is_stopped: number };
  res.json({ is_stopped: row?.is_stopped ?? 0 });
});

router.delete("/bulker-vehicles/:id", (req, res) => {
  db.prepare("DELETE FROM bulker_vehicles WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.post("/bulker-vehicles/bulk-import", (req, res) => {
  const { rows } = req.body as {
    rows: { vehicle_plate: string; driver_name: string; destination?: string; driver_phone?: string; supervisor_phone?: string; notes?: string }[];
  };
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للاستيراد" });
    return;
  }
  let inserted = 0;
  let updated  = 0;
  let skipped  = 0;

  const insertStmt = db.prepare(`
    INSERT INTO bulker_vehicles (vehicle_plate, driver_name, destination, driver_phone, supervisor_phone, notes)
    VALUES (?,?,?,?,?,?)
  `);
  const updateStmt = db.prepare(`
    UPDATE bulker_vehicles
    SET driver_name=?, destination=?, driver_phone=?, supervisor_phone=?, notes=?
    WHERE vehicle_plate=?
  `);

  for (const row of rows) {
    const plate = (row.vehicle_plate || "").trim();
    const name  = (row.driver_name  || "").trim();
    if (!plate || !name) { skipped++; continue; }
    const existing = db.prepare("SELECT id FROM bulker_vehicles WHERE vehicle_plate=?").get(plate);
    if (existing) {
      updateStmt.run(name, row.destination||null, row.driver_phone||null, row.supervisor_phone||null, row.notes||null, plate);
      updated++;
    } else {
      try {
        insertStmt.run(plate, name, row.destination||null, row.driver_phone||null, row.supervisor_phone||null, row.notes||null);
        inserted++;
      } catch { skipped++; }
    }
    if (row.driver_phone && name) syncUser(plate, name, row.driver_phone);
  }
  res.json({ inserted, updated, skipped });
});

router.post("/bulker-vehicles/sync-from-fleet", (req, res) => {
  const supervisorPhone = (req.body?.supervisor_phone as string) || null;

  const fleetBulkers = db.prepare(`
    SELECT fv.plate_number,
           COALESCE(fv.driver_name, dp.driver_name)                         AS driver_name,
           COALESCE(fv.driver_phone, fv.linked_user_phone, dp.phone)        AS driver_phone,
           COALESCE(fv.entity, dp.branch)                                   AS destination
    FROM fleet_vehicles fv
    LEFT JOIN driver_profiles dp
           ON REPLACE(dp.vehicle_plate,' ','') = REPLACE(fv.plate_number,' ','')
    WHERE fv.vehicle_type='بلكر'
  `).all() as { plate_number: string; driver_name: string | null; driver_phone: string | null; destination: string | null }[];

  let added = 0;
  let updated = 0;

  for (const fv of fleetBulkers) {
    const plate       = fv.plate_number;
    const driverName  = fv.driver_name  || "—";
    const driverPhone = fv.driver_phone || null;
    const destination = fv.destination  || null;

    const existing = db.prepare("SELECT id FROM bulker_vehicles WHERE vehicle_plate=?").get(plate);
    if (!existing) {
      db.prepare(
        "INSERT INTO bulker_vehicles (vehicle_plate, driver_name, driver_phone, destination, supervisor_phone) VALUES (?,?,?,?,?)"
      ).run(plate, driverName, driverPhone, destination, supervisorPhone);
      added++;
    } else {
      db.prepare(
        `UPDATE bulker_vehicles SET
          driver_name=CASE WHEN driver_name='—' OR driver_name IS NULL THEN ? ELSE driver_name END,
          driver_phone=COALESCE(driver_phone,?),
          destination=COALESCE(destination,?),
          supervisor_phone=COALESCE(supervisor_phone,?)
        WHERE vehicle_plate=?`
      ).run(driverName, driverPhone, destination, supervisorPhone, plate);
      updated++;
    }

    if (driverPhone && driverName !== "—") {
      syncUser(plate, driverName, driverPhone);
    }
  }

  res.json({ added, updated, total: fleetBulkers.length });
});

export default router;
