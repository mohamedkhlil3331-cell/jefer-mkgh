import { Router } from "express";
import { execute, queryAll, queryOne } from "../lib/erp-sql.js";

const router = Router();

async function syncUser(vehicle_plate: string, driver_name: string, driver_phone: string | null) {
  if (!driver_phone) return;
  await execute(`
    INSERT OR IGNORE INTO users (name, phone, password, role, active, approval_status, vehicle_plate)
    VALUES (?, ?, '123456', 'bulker_driver', 1, 'approved', ?)
  `, driver_name, driver_phone, vehicle_plate);
  await execute(`
    UPDATE users SET name=?, vehicle_plate=? WHERE phone=? AND role='bulker_driver'
  `, driver_name, vehicle_plate, driver_phone);
}

router.get("/bulker-vehicles", async (_req, res) => {
  const rows = await queryAll("SELECT * FROM bulker_vehicles ORDER BY id DESC");
  res.json(rows);
});

router.post("/bulker-vehicles", async (req, res) => {
  const { vehicle_plate, driver_name, destination, driver_phone, supervisor_phone, notes } = req.body;
  if (!vehicle_plate || !driver_name) {
    res.status(400).json({ error: "رقم السيارة واسم السائق مطلوبان" });
    return;
  }
  const r = await execute(`
    INSERT INTO bulker_vehicles (vehicle_plate, driver_name, destination, driver_phone, supervisor_phone, notes)
    VALUES (?,?,?,?,?,?)
  `, vehicle_plate, driver_name, destination || null, driver_phone || null, supervisor_phone || null, notes || null);

  await syncUser(vehicle_plate, driver_name, driver_phone || null);

  res.json({ id: r.lastInsertRowid });
});

router.put("/bulker-vehicles/:id", async (req, res) => {
  const { vehicle_plate, driver_name, destination, driver_phone, supervisor_phone, notes } = req.body;
  if (!vehicle_plate || !driver_name) {
    res.status(400).json({ error: "رقم السيارة واسم السائق مطلوبان" });
    return;
  }
  await execute(`
    UPDATE bulker_vehicles
    SET vehicle_plate=?, driver_name=?, destination=?, driver_phone=?, supervisor_phone=?, notes=?
    WHERE id=?
  `, vehicle_plate, driver_name, destination || null, driver_phone || null, supervisor_phone || null, notes || null, req.params.id);

  await syncUser(vehicle_plate, driver_name, driver_phone || null);

  res.json({ ok: true });
});

router.put("/bulker-vehicles/:id/toggle-stopped", async (req, res) => {
  await execute(`
    UPDATE bulker_vehicles SET is_stopped = CASE WHEN is_stopped=1 THEN 0 ELSE 1 END WHERE id=?
  `, req.params.id);
  const row = await queryOne<{ is_stopped: number }>("SELECT is_stopped FROM bulker_vehicles WHERE id=?", req.params.id);
  res.json({ is_stopped: row?.is_stopped ?? 0 });
});

router.delete("/bulker-vehicles/:id", async (req, res) => {
  await execute("DELETE FROM bulker_vehicles WHERE id=?", req.params.id);
  res.json({ ok: true });
});

router.post("/bulker-vehicles/bulk-import", async (req, res) => {
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

  for (const row of rows) {
    const plate = (row.vehicle_plate || "").trim();
    const name  = (row.driver_name  || "").trim();
    if (!plate || !name) { skipped++; continue; }
    const existing = await queryOne("SELECT id FROM bulker_vehicles WHERE vehicle_plate=?", plate);
    if (existing) {
      await execute(
        `UPDATE bulker_vehicles
         SET driver_name=?, destination=?, driver_phone=?, supervisor_phone=?, notes=?
         WHERE vehicle_plate=?`,
        name, row.destination||null, row.driver_phone||null, row.supervisor_phone||null, row.notes||null, plate,
      );
      updated++;
    } else {
      try {
        await execute(
          `INSERT INTO bulker_vehicles (vehicle_plate, driver_name, destination, driver_phone, supervisor_phone, notes)
           VALUES (?,?,?,?,?,?)`,
          plate, name, row.destination||null, row.driver_phone||null, row.supervisor_phone||null, row.notes||null,
        );
        inserted++;
      } catch { skipped++; }
    }
    if (row.driver_phone && name) await syncUser(plate, name, row.driver_phone);
  }
  res.json({ inserted, updated, skipped });
});

router.post("/bulker-vehicles/sync-from-fleet", async (req, res) => {
  const supervisorPhone = (req.body?.supervisor_phone as string) || null;

  const fleetBulkers = await queryAll<{ plate_number: string; driver_name: string | null; driver_phone: string | null; destination: string | null }>(`
    SELECT fv.plate_number,
           COALESCE(fv.driver_name, dp.driver_name)                         AS driver_name,
           COALESCE(fv.driver_phone, fv.linked_user_phone, dp.phone)        AS driver_phone,
           COALESCE(fv.entity, dp.branch)                                   AS destination
    FROM fleet_vehicles fv
    LEFT JOIN driver_profiles dp
           ON REPLACE(dp.vehicle_plate,' ','') = REPLACE(fv.plate_number,' ','')
    WHERE fv.vehicle_type='بلكر'
  `);

  let added = 0;
  let updated = 0;

  for (const fv of fleetBulkers) {
    const plate       = fv.plate_number;
    const driverName  = fv.driver_name  || "—";
    const driverPhone = fv.driver_phone || null;
    const destination = fv.destination  || null;

    const existing = await queryOne("SELECT id FROM bulker_vehicles WHERE vehicle_plate=?", plate);
    if (!existing) {
      await execute(
        "INSERT INTO bulker_vehicles (vehicle_plate, driver_name, driver_phone, destination, supervisor_phone) VALUES (?,?,?,?,?)"
      , plate, driverName, driverPhone, destination, supervisorPhone);
      added++;
    } else {
      await execute(
        `UPDATE bulker_vehicles SET
          driver_name=CASE WHEN driver_name='—' OR driver_name IS NULL THEN ? ELSE driver_name END,
          driver_phone=COALESCE(driver_phone,?),
          destination=COALESCE(destination,?),
          supervisor_phone=COALESCE(supervisor_phone,?)
        WHERE vehicle_plate=?`
      , driverName, driverPhone, destination, supervisorPhone, plate);
      updated++;
    }

    if (driverPhone && driverName !== "—") {
      await syncUser(plate, driverName, driverPhone);
    }
  }

  res.json({ added, updated, total: fleetBulkers.length });
});

export default router;
