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

// ── Load Request — route to supervisor based on vehicle type ──────────────────
router.post("/vehicles/:id/load-request", (req, res) => {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id=?").get(req.params.id) as
    { id: number; plate_number: string; vehicle_type: string } | undefined;
  if (!vehicle) return void res.status(404).json({ error: "السيارة غير موجودة" });

  const type  = (vehicle.vehicle_type || "");
  const notes = String(req.body?.notes || "").trim();

  let targetLabel = "";
  let recipients: { phone: string }[] = [];

  if (/بلكر/i.test(type)) {
    targetLabel = "مسؤول الفسحات";
    const all = db.prepare("SELECT phone, permissions FROM users WHERE active=1").all() as
      { phone: string; permissions: string | null }[];
    recipients = all.filter(u => {
      try { return (JSON.parse(u.permissions || "[]") as string[]).includes("ops_fsohat"); }
      catch { return false; }
    });
  } else if (/سطحة|قلاب|لوبد|lowbed/i.test(type)) {
    targetLabel = "مشرف النقليات";
    recipients = db.prepare("SELECT phone FROM users WHERE role='supervisor' AND active=1").all() as
      { phone: string }[];
  } else {
    targetLabel = "مسئول حركة البرح";
    const all = db.prepare("SELECT phone, permissions FROM users WHERE active=1").all() as
      { phone: string; permissions: string | null }[];
    recipients = all.filter(u => {
      try { return (JSON.parse(u.permissions || "[]") as string[]).includes("ops_bulker"); }
      catch { return false; }
    });
  }

  if (recipients.length === 0)
    return void res.status(200).json({ ok: true, sent: 0, targetLabel, warn: "لا يوجد مستخدم مخصص لهذا الدور حالياً" });

  const title = `طلب حمولة — ${vehicle.plate_number}`;
  const body  = `نوع المركبة: ${type}${notes ? ` — ملاحظة: ${notes}` : ""}`;
  const ins   = db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)");
  recipients.forEach(r => ins.run(r.phone, title, body));

  res.json({ ok: true, sent: recipients.length, targetLabel });
});

// ── Fleet Vehicles — existing profile view, or current fleet assignment for trip entry
// The subquery collapses multiple driver_profiles rows per plate to at most one,
// preventing duplicated vehicle cards when more than one profile shares a plate.
// UNION appends vehicles found only in vehicle_compliance_docs (added via the
// Compliance / Documents page) so they appear in the Trips vehicle picker too.
router.get("/fleet-vehicles", (req, res) => {
  const driverNameColumn = req.query.driver_source === "fleet"
    ? "fv.driver_name"
    : "COALESCE(dp.driver_name, fv.driver_name)";
  const rows = db.prepare(`
    SELECT fv.plate_number,
           fv.vehicle_type,
           fv.status,
           fv.driver_phone,
           fv.notes,
           fv.insurance_start,
           fv.insurance_end,
           fv.inspection_start,
           fv.inspection_end,
           fv.operation_card_start,
           fv.operation_card_end,
            ${driverNameColumn}                       AS driver_name,
           COALESCE(dp.phone, fv.driver_phone)        AS driver_phone_linked,
           dp.vehicle_plate IS NOT NULL               AS has_linked_driver
    FROM fleet_vehicles fv
    LEFT JOIN (
      SELECT vehicle_plate, driver_name, phone
      FROM driver_profiles
      WHERE vehicle_plate IS NOT NULL
      GROUP BY vehicle_plate
    ) dp ON dp.vehicle_plate = fv.plate_number

    UNION

    SELECT DISTINCT
           vcd.car_number        AS plate_number,
           NULL                  AS vehicle_type,
           'available'           AS status,
           NULL                  AS driver_phone,
           NULL                  AS notes,
           NULL                  AS insurance_start,
           NULL                  AS insurance_end,
           NULL                  AS inspection_start,
           NULL                  AS inspection_end,
           NULL                  AS operation_card_start,
           NULL                  AS operation_card_end,
           NULL                  AS driver_name,
           NULL                  AS driver_phone_linked,
           0                     AS has_linked_driver
    FROM vehicle_compliance_docs vcd
    WHERE vcd.car_number IS NOT NULL
      AND vcd.car_number != ''
      AND vcd.car_number NOT IN (SELECT plate_number FROM fleet_vehicles)

    ORDER BY plate_number
  `).all();
  res.json(rows);
});
router.put("/fleet-vehicles/:plate", (req, res) => {
  const { plate } = req.params;
  const cols = ["insurance_start","insurance_end","inspection_start","inspection_end","operation_card_start","operation_card_end","driver_phone","notes"] as const;
  const updates = cols.filter(c => req.body[c] !== undefined).map(c => `${c}=?`).join(", ");
  if (!updates) return void res.status(400).json({ error: "لا توجد بيانات للتحديث" });
  const vals = cols.filter(c => req.body[c] !== undefined).map(c => req.body[c] || null);
  db.prepare(`UPDATE fleet_vehicles SET ${updates} WHERE plate_number=?`).run(...vals, plate);
  res.json({ message: "تم التحديث" });
});

// ── Vehicles bulk import ───────────────────────────────────────────────────────
router.post("/vehicles/import", (req, res) => {
  const rows: Record<string, string>[] = req.body?.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0)
    return void res.status(400).json({ error: "لا توجد بيانات" });

  const keyMap: Record<string, string> = {
    "رقم اللوحة": "plate_number", "plate_number": "plate_number",
    "رقم السيارة": "plate_number", "اللوحة": "plate_number",
    "نوع المركبة": "vehicle_type", "vehicle_type": "vehicle_type", "النوع": "vehicle_type",
    "الحالة": "status", "status": "status",
    "السائق": "driver_name", "driver_name": "driver_name", "اسم السائق": "driver_name",
    "ملاحظات": "notes", "notes": "notes",
  };
  const statusMap: Record<string, string> = {
    "متاح": "available", "مشغول": "busy", "صيانة": "maintenance", "معطل": "broken",
    available: "available", busy: "busy", maintenance: "maintenance", broken: "broken",
  };
  const ins = db.prepare(
    "INSERT OR IGNORE INTO vehicles (plate_number, vehicle_type, status, driver_name, notes) VALUES (?,?,?,?,?)"
  );
  let imported = 0;
  for (const raw of rows) {
    const mapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const norm = keyMap[k.trim()] ?? keyMap[k.trim().toLowerCase()];
      if (norm) mapped[norm] = String(v).trim();
    }
    if (!mapped.plate_number) continue;
    const st = statusMap[mapped.status ?? ""] ?? "available";
    ins.run(mapped.plate_number, mapped.vehicle_type || "شاحنة", st, mapped.driver_name || null, mapped.notes || null);
    imported++;
  }
  res.json({ imported, message: `تم استيراد ${imported} مركبة` });
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
