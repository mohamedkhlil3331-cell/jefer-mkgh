import { Router } from "express";
import { execute, queryAll } from "../lib/erp-sql.js";

const router = Router();

router.get("/driver-doc-requests", async (req, res) => {
  const { driver_phone, driver_id } = req.query as Record<string, string>;
  if (driver_phone) {
    res.json(
      await queryAll("SELECT * FROM driver_doc_requests WHERE driver_phone=? ORDER BY created_at DESC LIMIT 50", driver_phone)
    );
  } else if (driver_id) {
    res.json(
      await queryAll("SELECT * FROM driver_doc_requests WHERE driver_id=? ORDER BY created_at DESC LIMIT 50", driver_id)
    );
  } else {
    res.json(
      await queryAll("SELECT * FROM driver_doc_requests ORDER BY created_at DESC LIMIT 200")
    );
  }
});

router.post("/driver-doc-requests", async (req, res) => {
  const {
    driver_id, driver_name, driver_phone,
    request_type, request_label,
    date, loading_lat, loading_lng, loading_location_name,
    cargo_type,
  } = req.body as Record<string, unknown>;

  if (!request_type || !request_label) {
    return void res.status(400).json({ error: "نوع الطلب مطلوب" });
  }

  const r = await execute(`
    INSERT INTO driver_doc_requests
      (driver_id, driver_name, driver_phone, request_type, request_label,
       date, loading_lat, loading_lng, loading_location_name, cargo_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
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

  const supervisors = await queryAll<{ phone: string }>(
    "SELECT phone FROM users WHERE role = 'supervisor' AND active = 1"
  );

  const driverLabel = (driver_name as string) || (driver_phone as string) || "سائق";
  for (const sup of supervisors) {
    await execute(
      "INSERT INTO notifications (user_phone, title, body) VALUES (?, ?, ?)",
      sup.phone,
      "طلب مستند جديد",
      `${driverLabel} — ${request_label as string}`,
    );
  }

  res.status(201).json({ id: r.lastInsertRowid });
});

router.put("/driver-doc-requests/:id/status", async (req, res) => {
  const { status } = req.body as { status: string };
  const allowed = ["pending", "done", "cancelled"];
  if (!allowed.includes(status)) return void res.status(400).json({ error: "حالة غير صحيحة" });
  await execute("UPDATE driver_doc_requests SET status=? WHERE id=?", status, req.params.id);
  res.json({ message: "تم التحديث" });
});

export default router;
