import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

function genNum(): string {
  const now = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `IREQ${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

const VALID_STATUSES = ["pending", "assigned", "in_progress", "completed", "cancelled"];

router.get("/internal-requests", (req, res) => {
  const { status, requester_role } = req.query as Record<string, string>;
  if (status && requester_role) {
    res.json(db.prepare("SELECT * FROM internal_requests WHERE status=? AND requester_role=? ORDER BY created_at DESC").all(status, requester_role));
  } else if (status) {
    res.json(db.prepare("SELECT * FROM internal_requests WHERE status=? ORDER BY created_at DESC").all(status));
  } else if (requester_role) {
    res.json(db.prepare("SELECT * FROM internal_requests WHERE requester_role=? ORDER BY created_at DESC").all(requester_role));
  } else {
    res.json(db.prepare("SELECT * FROM internal_requests ORDER BY created_at DESC").all());
  }
});

router.post("/internal-requests", (req, res) => {
  const {
    requester_id, requester_name, requester_role,
    cargo_type, cargo_label, qty, unit,
    vehicle_type_id, vehicle_type_name, notes,
  } = req.body as Record<string, unknown>;

  if (!cargo_type) return void res.status(400).json({ error: "نوع الشحنة مطلوب" });

  const num = genNum();
  const r = db.prepare(`
    INSERT INTO internal_requests
      (request_number, requester_id, requester_name, requester_role,
       cargo_type, cargo_label, qty, unit, vehicle_type_id, vehicle_type_name, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    num,
    requester_id || null, requester_name || null, requester_role || null,
    cargo_type,
    cargo_label || cargo_type,
    parseInt(String(qty)) || 0,
    unit || "كيس",
    vehicle_type_id || null,
    vehicle_type_name || null,
    notes || null,
  );
  res.status(201).json({ id: r.lastInsertRowid, request_number: num });
});

router.put("/internal-requests/:id/assign", (req, res) => {
  const { assigned_vehicle_id, assigned_vehicle_plate, assigned_driver_id, assigned_driver_name, assigned_by } = req.body as Record<string, unknown>;
  db.prepare(`
    UPDATE internal_requests SET
      status='assigned',
      assigned_vehicle_id=?, assigned_vehicle_plate=?,
      assigned_driver_id=?, assigned_driver_name=?,
      assigned_by=?, assigned_at=datetime('now'), updated_at=datetime('now')
    WHERE id=?
  `).run(
    assigned_vehicle_id || null, assigned_vehicle_plate || null,
    assigned_driver_id || null, assigned_driver_name || null,
    assigned_by || null,
    req.params.id,
  );
  res.json({ message: "تم تعيين المركبة" });
});

router.put("/internal-requests/:id/status", (req, res) => {
  const { status } = req.body as { status: string };
  if (!VALID_STATUSES.includes(status)) return void res.status(400).json({ error: "حالة غير صحيحة" });
  const extra = status === "completed" ? ", completed_at=datetime('now')" : "";
  db.prepare(`UPDATE internal_requests SET status=?, updated_at=datetime('now')${extra} WHERE id=?`).run(status, req.params.id);
  res.json({ message: "تم التحديث" });
});

export default router;
