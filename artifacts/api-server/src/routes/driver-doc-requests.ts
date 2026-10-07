import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/driver-doc-requests", (req, res) => {
  const { driver_phone, driver_id } = req.query as Record<string, string>;
  if (driver_phone) {
    res.json(
      db.prepare("SELECT * FROM driver_doc_requests WHERE driver_phone=? ORDER BY created_at DESC LIMIT 50")
        .all(driver_phone)
    );
  } else if (driver_id) {
    res.json(
      db.prepare("SELECT * FROM driver_doc_requests WHERE driver_id=? ORDER BY created_at DESC LIMIT 50")
        .all(driver_id)
    );
  } else {
    res.json(
      db.prepare("SELECT * FROM driver_doc_requests ORDER BY created_at DESC LIMIT 200").all()
    );
  }
});

router.post("/driver-doc-requests", (req, res) => {
  const {
    driver_id, driver_name, driver_phone,
    request_type, request_label,
    date, loading_lat, loading_lng, loading_location_name,
    cargo_type,
  } = req.body as Record<string, unknown>;

  if (!request_type || !request_label) {
    return void res.status(400).json({ error: "نوع الطلب مطلوب" });
  }

  const r = db.prepare(`
    INSERT INTO driver_doc_requests
      (driver_id, driver_name, driver_phone, request_type, request_label,
       date, loading_lat, loading_lng, loading_location_name, cargo_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    driver_id   || null,
    driver_name || null,
    driver_phone || null,
    request_type,
    request_label,
    date || new Date().toISOString().slice(0, 10),
    loading_lat  !== undefined ? Number(loading_lat)  : null,
    loading_lng  !== undefined ? Number(loading_lng)  : null,
    loading_location_name || null,
    cargo_type || null,
  );

  const supervisors = db.prepare(
    "SELECT phone FROM users WHERE role = 'supervisor' AND active = 1"
  ).all() as { phone: string }[];

  const insNotif = db.prepare(
    "INSERT INTO notifications (user_phone, title, body) VALUES (?, ?, ?)"
  );
  const driverLabel = (driver_name as string) || (driver_phone as string) || "سائق";
  for (const sup of supervisors) {
    insNotif.run(
      sup.phone,
      "طلب مستند جديد",
      `${driverLabel} — ${request_label as string}`,
    );
  }

  res.status(201).json({ id: r.lastInsertRowid });
});

router.put("/driver-doc-requests/:id/status", (req, res) => {
  const { status } = req.body as { status: string };
  const allowed = ["pending", "done", "cancelled"];
  if (!allowed.includes(status)) return void res.status(400).json({ error: "حالة غير صحيحة" });
  db.prepare("UPDATE driver_doc_requests SET status=? WHERE id=?").run(status, req.params.id);
  res.json({ message: "تم التحديث" });
});

export default router;
