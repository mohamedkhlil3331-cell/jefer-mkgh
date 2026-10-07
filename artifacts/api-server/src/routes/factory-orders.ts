import { Router } from "express";
import multer from "multer";
import db, { UPLOADS_PATH } from "../lib/db.js";

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
  filename:    (_req, file,  cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

function genOrderNumber() {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `FO${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

// ── Convert workflow order (fsohat_pending) to factory order ─────────────────
router.post("/factory-orders/from-workflow/:workflow_order_id", (req, res) => {
  const workflowId = Number(req.params.workflow_order_id);
  const wo = db.prepare("SELECT * FROM workflow_orders WHERE id=?").get(workflowId) as Record<string, unknown> | undefined;
  if (!wo) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (wo.stage !== "fsohat_pending") return void res.status(400).json({ error: "الطلب ليس في مرحلة انتظار الفسحة" });

  // Check if already converted
  const existing = db.prepare("SELECT id FROM factory_orders WHERE workflow_order_id=?").get(workflowId) as { id: number } | undefined;
  if (existing) return void res.status(400).json({ error: "تم إنشاء طلبية مصنع لهذا الطلب مسبقاً" });

  const orderNumber = genOrderNumber();
  const r = db.prepare(`
    INSERT INTO factory_orders
      (order_number, product_name, quantity, unit, delivery_site, notes, workflow_order_id, created_by_phone)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    orderNumber,
    wo.product_name as string,
    (wo.quantity as number) || 0,
    (wo.unit as string) || "طن",
    (wo.delivery_location as string) || null,
    `من الطلب ${wo.order_number} — العميل: ${wo.customer_name || wo.customer_phone}`,
    workflowId,
    req.body.created_by_phone || null,
  );

  // Update workflow order stage to fsohat_processing
  db.prepare("UPDATE workflow_orders SET stage='fsohat_processing' WHERE id=?").run(workflowId);

  res.status(201).json({ id: r.lastInsertRowid, order_number: orderNumber });
});

// ── GET all (fsohat / admin) ──────────────────────────────────────────────────
router.get("/factory-orders", (req, res) => {
  const { status, vehicle_plate } = req.query as Record<string, string>;
  let sql = "SELECT * FROM factory_orders WHERE 1=1";
  const params: unknown[] = [];
  if (status)        { sql += " AND status=?";        params.push(status); }
  if (vehicle_plate) { sql += " AND vehicle_plate=?"; params.push(vehicle_plate); }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

// ── GET: driver — orders for my vehicle ──────────────────────────────────────
router.get("/factory-orders/driver", (req, res) => {
  const { plate, phone } = req.query as Record<string, string>;

  let vehiclePlate = plate || null;

  if (!vehiclePlate && phone) {
    const u = db.prepare("SELECT vehicle_plate, name FROM users WHERE phone=? LIMIT 1")
      .get(phone) as Record<string, string> | undefined;
    vehiclePlate = u?.vehicle_plate || null;

    if (!vehiclePlate && u?.name) {
      const fv = db.prepare("SELECT plate_number FROM fleet_vehicles WHERE driver_name=? LIMIT 1")
        .get(u.name) as Record<string, string> | undefined;
      vehiclePlate = fv?.plate_number || null;
    }
  }

  if (!vehiclePlate) return void res.json([]);

  const rows = db.prepare(
    "SELECT * FROM factory_orders WHERE vehicle_plate=? AND status IN ('permit_issued','loaded','delivered') ORDER BY created_at DESC"
  ).all(vehiclePlate);
  res.json(rows);
});

// ── POST: create ──────────────────────────────────────────────────────────────
router.post("/factory-orders", (req, res) => {
  const {
    vehicle_plate, driver_name, driver_phone,
    product_name, quantity, unit,
    delivery_site, notes, created_by_phone,
  } = req.body;

  if (!product_name) return void res.status(400).json({ error: "اسم المنتج مطلوب" });

  const order_number = genOrderNumber();
  const r = db.prepare(`
    INSERT INTO factory_orders
      (order_number, vehicle_plate, driver_name, driver_phone,
       product_name, quantity, unit, delivery_site, notes, created_by_phone)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    order_number,
    vehicle_plate  || null,
    driver_name    || null,
    driver_phone   || null,
    product_name,
    parseFloat(quantity) || 0,
    unit           || "طن",
    delivery_site  || null,
    notes          || null,
    created_by_phone || null,
  );

  res.json({ id: r.lastInsertRowid, order_number });
});

// ── PUT: upload factory permit (فسحة) ────────────────────────────────────────
router.put("/factory-orders/:id/permit", upload.single("permit_doc"), (req, res) => {
  const existing = db.prepare("SELECT id FROM factory_orders WHERE id=?").get(req.params.id);
  if (!existing) return void res.status(404).json({ error: "الطلبية غير موجودة" });

  const permit_doc_url = req.file ? `/api/uploads/${req.file.filename}` : null;
  const { permit_number } = req.body;

  db.prepare(`
    UPDATE factory_orders
    SET permit_number=?,
        permit_doc_url=COALESCE(?, permit_doc_url),
        status='permit_issued',
        permit_issued_at=datetime('now'),
        updated_at=datetime('now')
    WHERE id=?
  `).run(permit_number || null, permit_doc_url, req.params.id);

  res.json({ success: true });
});

// ── PUT: update delivery site ─────────────────────────────────────────────────
router.put("/factory-orders/:id/delivery-site", (req, res) => {
  const { delivery_site } = req.body;
  db.prepare("UPDATE factory_orders SET delivery_site=?, updated_at=datetime('now') WHERE id=?")
    .run(delivery_site || null, req.params.id);
  res.json({ success: true });
});

// ── PUT: driver uploads loading order (أمر التحميل) ────────────────────────────
router.put("/factory-orders/:id/loading-order", upload.single("loading_order_doc"), (req, res) => {
  const loading_order_url = req.file ? `/api/uploads/${req.file.filename}` : null;
  if (!loading_order_url) return void res.status(400).json({ error: "يرجى إرفاق صورة أمر التحميل" });

  db.prepare(`
    UPDATE factory_orders
    SET loading_order_url=?,
        status='loaded',
        loading_confirmed_at=datetime('now'),
        updated_at=datetime('now')
    WHERE id=?
  `).run(loading_order_url, req.params.id);

  res.json({ success: true });
});

// ── PUT: driver confirms delivery ─────────────────────────────────────────────
router.put("/factory-orders/:id/deliver", (req, res) => {
  const { delivery_notes } = req.body;

  // Read before update to get vehicle/driver info for trips log
  const fo = db.prepare("SELECT * FROM factory_orders WHERE id=?")
    .get(req.params.id) as Record<string, unknown> | undefined;

  db.prepare(`
    UPDATE factory_orders
    SET status='delivered',
        delivery_notes=?,
        delivered_at=datetime('now'),
        updated_at=datetime('now')
    WHERE id=?
  `).run(delivery_notes || null, req.params.id);

  // ── Auto-add trip to سجل الرحلات ──────────────────────────────────────────
  if (fo?.vehicle_plate) {
    const today = new Date().toISOString().slice(0, 10);
    const fvTrailer = (db.prepare("SELECT linked_trailer_number FROM fleet_vehicles WHERE plate_number=? LIMIT 1")
      .get(fo.vehicle_plate) as { linked_trailer_number: string | null } | undefined)?.linked_trailer_number || null;
    db.prepare(`
      INSERT INTO trips (date, car_id, driver_name, driver_phone, material_type, destination, trips_count, notes, trailer_number)
      VALUES (?,?,?,?,?,?,1,?,?)
    `).run(
      today,
      fo.vehicle_plate,
      fo.driver_name    || null,
      fo.driver_phone   || null,
      fo.product_name   || null,
      fo.delivery_site  || null,
      fo.order_number   || null,
      fvTrailer,
    );
  }

  res.json({ success: true });
});

export default router;
