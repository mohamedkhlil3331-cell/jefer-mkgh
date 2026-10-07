import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// ── GET customer's previously used locations (for smart presets) ──────────────
router.get("/external-rentals/locations", (req, res) => {
  const { phone } = req.query as Record<string, string>;
  if (!phone) return void res.status(400).json({ error: "phone required" });

  const shorten = (addr: string) =>
    addr.split(",").slice(0, 2).join(",").trim().slice(0, 50);

  const pickups = db.prepare(`
    SELECT pickup_location, pickup_lat, pickup_lng, MAX(created_at) AS last_used
    FROM external_rentals
    WHERE customer_phone = ?
      AND pickup_location IS NOT NULL AND TRIM(pickup_location) != ''
      AND pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL
    GROUP BY pickup_location
    ORDER BY last_used DESC
    LIMIT 8
  `).all(phone) as { pickup_location: string; pickup_lat: number; pickup_lng: number }[];

  const destinations = db.prepare(`
    SELECT destination_location, destination_lat, destination_lng, MAX(created_at) AS last_used
    FROM external_rentals
    WHERE customer_phone = ?
      AND destination_location IS NOT NULL AND TRIM(destination_location) != ''
      AND destination_lat IS NOT NULL AND destination_lng IS NOT NULL
    GROUP BY destination_location
    ORDER BY last_used DESC
    LIMIT 8
  `).all(phone) as { destination_location: string; destination_lat: number; destination_lng: number }[];

  res.json({
    pickup: pickups.map(r => ({
      label: shorten(r.pickup_location),
      lat:   r.pickup_lat,
      lng:   r.pickup_lng,
    })),
    destination: destinations.map(r => ({
      label: shorten(r.destination_location),
      lat:   r.destination_lat,
      lng:   r.destination_lng,
    })),
  });
});

// ── GET rentals ───────────────────────────────────────────────────────────────
router.get("/external-rentals", (req, res) => {
  const { phone, role } = req.query as Record<string, string>;
  let sql = "SELECT * FROM external_rentals WHERE 1=1";
  const params: string[] = [];
  if (role === "customer" && phone) {
    sql += " AND customer_phone = ?"; params.push(phone);
  }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

// ── POST create rental ────────────────────────────────────────────────────────
router.post("/external-rentals", (req, res) => {
  const {
    customer_phone, customer_name, vehicle_type, start_date,
    duration_type, duration_days, payment_method, notes,
    pickup_location, pickup_lat, pickup_lng,
    destination_location, destination_lat, destination_lng,
    lease_proposal,
  } = req.body;
  if (!customer_phone || !vehicle_type)
    return void res.status(400).json({ error: "البيانات غير مكتملة" });

  const result = db.prepare(`
    INSERT INTO external_rentals
      (customer_phone, customer_name, vehicle_type, start_date,
       duration_type, duration_days, payment_method, notes,
       pickup_location, pickup_lat, pickup_lng,
       destination_location, destination_lat, destination_lng,
       lease_proposal, status, payment_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)
  `).run(
    customer_phone, customer_name || null, vehicle_type, start_date,
    duration_type || "محددة", parseInt(duration_days) || 1,
    payment_method || "transfer", notes || null,
    pickup_location || null,
    pickup_lat ? parseFloat(pickup_lat) : null,
    pickup_lng ? parseFloat(pickup_lng) : null,
    destination_location || null,
    destination_lat ? parseFloat(destination_lat) : null,
    destination_lng ? parseFloat(destination_lng) : null,
    lease_proposal || null,
    payment_method === "card" ? "paid" : "pending"
  );

  try {
    const supervisors = db.prepare("SELECT phone FROM users WHERE role='supervisor' AND active=1").all() as {phone:string}[];
    supervisors.forEach(s =>
      db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)")
        .run(s.phone, "طلب تأجير جديد", `طلب تأجير ${vehicle_type} من ${customer_name || customer_phone}`)
    );
  } catch { /* ignore */ }

  res.status(201).json({ id: result.lastInsertRowid, message: "تم إرسال طلب التأجير" });
});

// ── Supervisor/Admin: assign vehicle ─────────────────────────────────────────
router.put("/external-rentals/:id/assign", (req, res) => {
  const { assigned_vehicle, assigned_driver, assigned_by, total_price,
          assigned_vehicle_plate, assigned_driver_name,
          driver_bonus, driver_phone } = req.body;
  const plate      = assigned_vehicle || assigned_vehicle_plate || null;
  const driver     = assigned_driver || assigned_driver_name || null;
  const bonus      = parseFloat(driver_bonus) || 0;
  const driverPhone = driver_phone || null;
  db.prepare(`
    UPDATE external_rentals
    SET assigned_vehicle=?, assigned_driver=?, assigned_by=?,
        assigned_at=datetime('now'), status='confirmed', total_price=?,
        driver_bonus=?, driver_phone=?
    WHERE id=?
  `).run(plate, driver, assigned_by || null,
         parseFloat(total_price) || 0, bonus, driverPhone, req.params.id);

  try {
    const rental = db.prepare("SELECT customer_phone,vehicle_type FROM external_rentals WHERE id=?")
      .get(req.params.id) as { customer_phone: string; vehicle_type: string } | undefined;
    if (rental) {
      db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)")
        .run(rental.customer_phone, "تم تأكيد التأجير",
          `تم تعيين ${plate || "مركبة"} لطلب التأجير الخاص بك`);
    }
  } catch { /* ignore */ }

  res.json({ message: "تم تأكيد التأجير" });
});

// ── Driver: get their assigned rentals ────────────────────────────────────────
router.get("/external-rentals/driver", (req, res) => {
  const { phone } = req.query as Record<string, string>;
  if (!phone) return void res.status(400).json({ error: "phone required" });
  const rows = db.prepare(`
    SELECT * FROM external_rentals
    WHERE driver_phone = ? AND status IN ('confirmed','active')
    ORDER BY assigned_at DESC
  `).all(phone);
  res.json(rows);
});

// ── Driver: update stage (حمل / وصل / نزل) ───────────────────────────────────
router.put("/external-rentals/:id/driver-stage", (req, res) => {
  const { stage } = req.body;
  const allowed = ["loaded", "arrived", "delivered"];
  if (!allowed.includes(stage))
    return void res.status(400).json({ error: "مرحلة غير صالحة" });
  db.prepare("UPDATE external_rentals SET driver_stage=?, driver_stage_at=datetime('now') WHERE id=?")
    .run(stage, req.params.id);
  // Notify supervisor
  try {
    const rental = db.prepare("SELECT customer_name, vehicle_type, assigned_by FROM external_rentals WHERE id=?")
      .get(req.params.id) as { customer_name: string; vehicle_type: string; assigned_by: string } | undefined;
    if (rental?.assigned_by) {
      const stageLabel: Record<string, string> = { loaded: "تحميل", arrived: "وصول للموقع", delivered: "تسليم" };
      db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)")
        .run(rental.assigned_by, `تحديث التأجير: ${stageLabel[stage]}`,
          `${rental.customer_name || "عميل"} - ${rental.vehicle_type}`);
    }
  } catch { /* ignore */ }
  res.json({ message: "تم تحديث المرحلة" });
});

// ── Update status ─────────────────────────────────────────────────────────────
router.put("/external-rentals/:id/status", (req, res) => {
  const { status } = req.body;
  db.prepare("UPDATE external_rentals SET status=? WHERE id=?").run(status, req.params.id);
  res.json({ message: "تم تحديث الحالة" });
});

// ── Edit rental fields ────────────────────────────────────────────────────────
router.put("/external-rentals/:id", (req, res) => {
  const { vehicle_type, start_date, duration_days, notes, total_price, pickup_location, destination } = req.body;
  db.prepare(`
    UPDATE external_rentals
    SET vehicle_type    = COALESCE(?, vehicle_type),
        start_date      = COALESCE(?, start_date),
        rental_date     = COALESCE(?, rental_date),
        duration_days   = COALESCE(?, duration_days),
        notes           = ?,
        total_price     = COALESCE(?, total_price),
        pickup_location = COALESCE(?, pickup_location),
        destination     = COALESCE(?, destination)
    WHERE id = ?
  `).run(
    vehicle_type  || null,
    start_date    || null,
    start_date    || null,
    duration_days != null ? parseInt(duration_days) : null,
    notes ?? null,
    total_price != null ? parseFloat(total_price) : null,
    pickup_location || null,
    destination     || null,
    req.params.id
  );
  res.json({ message: "تم التحديث" });
});

// ── Cancel rental (customer) / Hard-delete (supervisor) ───────────────────────
router.delete("/external-rentals/:id", (req, res) => {
  if (req.query.hard === "true") {
    db.prepare("DELETE FROM external_rentals WHERE id=?").run(req.params.id);
    return void res.json({ message: "تم الحذف نهائياً" });
  }
  db.prepare("UPDATE external_rentals SET status='cancelled' WHERE id=?").run(req.params.id);
  res.json({ message: "تم إلغاء الطلب" });
});

export default router;
