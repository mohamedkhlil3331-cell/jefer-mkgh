import { Router } from "express";
import multer from "multer";
import path from "path";
import db, { generateOrderNumber, UPLOADS_PATH } from "../lib/db.js";

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

function notify(userPhone: string, title: string, body: string) {
  try {
    db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)").run(userPhone, title, body);
  } catch { /* ignore */ }
}

// ── GET orders (role-filtered) ──────────────────────────────────────────────
router.get("/workflow/orders", (req, res) => {
  const { phone, role, stage } = req.query as Record<string, string>;
  let sql = "SELECT * FROM workflow_orders WHERE 1=1";
  const params: string[] = [];

  if (role === "customer") {
    sql += " AND customer_phone = ?"; params.push(phone);
  } else if (role === "rep") {
    sql += " AND rep_id = (SELECT id FROM users WHERE phone = ? LIMIT 1)"; params.push(phone);
  } else if (role === "reviewer") {
    sql += " AND stage IN ('pending','payment_confirmed')";
  } else if (role === "supervisor") {
    sql += " AND stage IN ('payment_confirmed','vehicle_assigned')";
  } else if (role === "warehouse") {
    sql += " AND stage IN ('vehicle_assigned','invoiced')";
  } else if (role === "driver") {
    sql += " AND driver_phone = ?"; params.push(phone);
  }
  if (stage) { sql += " AND stage = ?"; params.push(stage); }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.get("/workflow/orders/:id", (req, res) => {
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id);
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  res.json(order);
});

// ── Customer places order ────────────────────────────────────────────────────
router.post("/workflow/orders", (req, res) => {
  const {
    customer_phone, customer_name, rep_id,
    product_id, product_name, quantity, unit,
    unit_price, delivery_location, delivery_lat, delivery_lng, destination_type
  } = req.body;

  if (!customer_phone || !quantity) return void res.status(400).json({ error: "البيانات غير مكتملة" });

  let resolvedProductName = product_name;
  let resolvedUnitPrice = parseFloat(unit_price) || 0;
  let resolvedUnit = unit;

  if (product_id) {
    const p = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id) as Record<string, unknown> | undefined;
    if (p) {
      resolvedProductName = p.name as string;
      resolvedUnitPrice = resolvedUnitPrice || (p.price_per_unit as number);
      resolvedUnit = resolvedUnit || (p.unit as string);
    }
  }

  const qty = parseFloat(quantity);
  const totalBefore = parseFloat((qty * resolvedUnitPrice).toFixed(2));
  const vatAmount = parseFloat((totalBefore * 0.15).toFixed(2));
  const totalWith = parseFloat((totalBefore + vatAmount).toFixed(2));

  const orderNumber = generateOrderNumber();
  const result = db.prepare(`
    INSERT INTO workflow_orders
      (order_number, customer_phone, customer_name, rep_id, product_id, product_name,
       quantity, unit, unit_price, total_before_vat, vat_amount, total_with_vat,
       delivery_location, delivery_lat, delivery_lng, destination_type, stage)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(orderNumber, customer_phone, customer_name||null, rep_id||null,
         product_id||null, resolvedProductName||null, qty, resolvedUnit||null,
         resolvedUnitPrice, totalBefore, vatAmount, totalWith,
         delivery_location||null, delivery_lat||null, delivery_lng||null,
         destination_type||"مستودع", "pending");

  // Notify all reviewers
  const reviewers = db.prepare("SELECT phone FROM users WHERE role = 'reviewer' AND active = 1").all() as {phone: string}[];
  reviewers.forEach(r => notify(r.phone, "طلب جديد", `طلب جديد رقم ${orderNumber} من ${customer_name || customer_phone}`));

  res.status(201).json({
    id: result.lastInsertRowid,
    order_number: orderNumber,
    total_before_vat: totalBefore,
    vat_amount: vatAmount,
    total_with_vat: totalWith,
    message: "تم إرسال طلبك بنجاح"
  });
});

// ── Reviewer: confirm payment + sign ────────────────────────────────────────
router.put("/workflow/orders/:id/confirm-payment", (req, res) => {
  const { reviewer_phone, reviewer_name, payment_transfer_ref, payment_amount } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  const reviewer = db.prepare("SELECT id,name FROM users WHERE phone = ?").get(reviewer_phone) as Record<string, unknown> | undefined;

  db.prepare(`
    UPDATE workflow_orders SET
      stage = 'payment_confirmed', reviewer_id = ?, reviewer_name = ?,
      review_date = datetime('now'), payment_transfer_ref = ?, payment_amount = ?
    WHERE id = ?
  `).run(reviewer?.id||null, reviewer_name||reviewer_phone, payment_transfer_ref||null, parseFloat(payment_amount)||0, req.params.id);

  // Notify supervisor
  const supervisors = db.prepare("SELECT phone FROM users WHERE role = 'supervisor' AND active = 1").all() as {phone: string}[];
  supervisors.forEach(s => notify(s.phone, "طلب جاهز للتخصيص", `تم تأكيد دفع طلب ${order.order_number}`));
  notify(order.customer_phone as string, "تم تأكيد الدفع", `تم تأكيد دفع طلبك رقم ${order.order_number}`);

  res.json({ message: "تم تأكيد الدفع والتوقيع" });
});

// ── Supervisor: assign vehicle ───────────────────────────────────────────────
router.put("/workflow/orders/:id/assign-vehicle", (req, res) => {
  const { supervisor_phone, vehicle_id, driver_phone } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  const vehicle = db.prepare("SELECT * FROM fleet_vehicles WHERE id = ?").get(vehicle_id) as Record<string, unknown> | undefined;
  if (!vehicle) return void res.status(400).json({ error: "السيارة غير موجودة" });

  const supervisor = db.prepare("SELECT id FROM users WHERE phone = ?").get(supervisor_phone) as Record<string, unknown> | undefined;
  const driver = db.prepare("SELECT * FROM users WHERE phone = ? AND role = 'driver'").get(driver_phone || vehicle.driver_name) as Record<string, unknown> | undefined;

  db.prepare(`
    UPDATE workflow_orders SET
      stage = 'vehicle_assigned', supervisor_id = ?,
      vehicle_id = ?, vehicle_plate = ?,
      driver_id = ?, driver_name = ?, driver_phone = ?,
      vehicle_assign_date = datetime('now')
    WHERE id = ?
  `).run(supervisor?.id||null, vehicle_id, vehicle.plate_number,
         driver?.id||null, driver?.name||vehicle.driver_name||null, driver_phone||null, req.params.id);

  // Mark vehicle as busy
  db.prepare("UPDATE fleet_vehicles SET status = 'busy' WHERE id = ?").run(vehicle_id);

  // Notify warehouse
  const warehouse = db.prepare("SELECT phone FROM users WHERE role = 'warehouse' AND active = 1").all() as {phone: string}[];
  warehouse.forEach(w => notify(w.phone, "طلب جاهز للفاتورة", `تم تخصيص سيارة لطلب ${order.order_number}`));
  if (driver_phone) notify(driver_phone, "طلب جديد لك", `لديك طلب توصيل رقم ${order.order_number}`);

  res.json({ message: "تم تخصيص السيارة" });
});

// ── Warehouse: issue invoice ─────────────────────────────────────────────────
router.put("/workflow/orders/:id/invoice", upload.single("invoice_image"), (req, res) => {
  const { warehouse_phone, invoice_number } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  const warehouse = db.prepare("SELECT id FROM users WHERE phone = ?").get(warehouse_phone) as Record<string, unknown> | undefined;
  const imageUrl = req.file ? `/api/uploads/${req.file.filename}` : null;
  const invoiceNum = invoice_number || `INV-${order.order_number}`;

  db.prepare(`
    UPDATE workflow_orders SET
      stage = 'invoiced', warehouse_id = ?,
      invoice_number = ?, invoice_image_url = ?, invoice_date = datetime('now')
    WHERE id = ?
  `).run(warehouse?.id||null, invoiceNum, imageUrl, req.params.id);

  if (order.driver_phone) notify(order.driver_phone as string, "فاتورة جاهزة", `الفاتورة جاهزة لطلب ${order.order_number}. تفضل بالتحميل.`);

  res.json({ message: "تم إصدار الفاتورة", invoice_number: invoiceNum });
});

// ── Driver: confirm loading + upload photo ───────────────────────────────────
router.put("/workflow/orders/:id/load", upload.single("loading_photo"), (req, res) => {
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  const photoUrl = req.file ? `/api/uploads/${req.file.filename}` : null;
  db.prepare("UPDATE workflow_orders SET stage='loaded', loading_photo_url=?, loading_date=datetime('now') WHERE id=?")
    .run(photoUrl, req.params.id);

  // Notify customer & rep
  notify(order.customer_phone as string, "السائق في الطريق", `طلبك رقم ${order.order_number} تم تحميله والسائق في الطريق. السيارة: ${order.vehicle_plate} | جوال السائق: ${order.driver_phone}`);
  if (order.rep_id) {
    const rep = db.prepare("SELECT phone FROM users WHERE id = ?").get(order.rep_id) as {phone: string} | undefined;
    if (rep) notify(rep.phone, "السائق في الطريق", `طلب ${order.order_number} محمل. السيارة: ${order.vehicle_plate}`);
  }

  res.json({ message: "تم تسجيل التحميل. في الطريق!" });
});

// ── Driver: confirm delivery ─────────────────────────────────────────────────
router.put("/workflow/orders/:id/deliver", (req, res) => {
  const { notes } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  db.prepare("UPDATE workflow_orders SET stage='delivered', delivery_date=datetime('now'), delivery_notes=? WHERE id=?")
    .run(notes||null, req.params.id);

  // Free the vehicle
  if (order.vehicle_id) db.prepare("UPDATE fleet_vehicles SET status='available' WHERE id=?").run(order.vehicle_id);

  notify(order.customer_phone as string, "تم التسليم", `تم تسليم طلبك رقم ${order.order_number} بنجاح.`);

  res.json({ message: "تم تسجيل التسليم" });
});

// ── Driver: report vehicle breakdown ────────────────────────────────────────
router.put("/workflow/vehicles/:vehicleId/break", (req, res) => {
  const { notes } = req.body;
  db.prepare("UPDATE fleet_vehicles SET status='broken', notes=? WHERE id=?").run(notes||"عطل مُبلَّغ عنه من السائق", req.params.vehicleId);
  const supervisors = db.prepare("SELECT phone FROM users WHERE role = 'supervisor'").all() as {phone: string}[];
  supervisors.forEach(s => notify(s.phone, "عطل في سيارة", `تم الإبلاغ عن عطل في السيارة رقم ${req.params.vehicleId}`));
  res.json({ message: "تم الإبلاغ عن العطل" });
});

// ── Cancel order ─────────────────────────────────────────────────────────────
router.put("/workflow/orders/:id/cancel", (req, res) => {
  const { reason } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  db.prepare("UPDATE workflow_orders SET stage='cancelled', cancel_reason=? WHERE id=?").run(reason||null, req.params.id);
  if (order.vehicle_id) db.prepare("UPDATE fleet_vehicles SET status='available' WHERE id=?").run(order.vehicle_id);
  notify(order.customer_phone as string, "تم إلغاء الطلب", `تم إلغاء طلبك رقم ${order.order_number}. ${reason||""}`);

  res.json({ message: "تم الإلغاء" });
});

// ── Notifications ─────────────────────────────────────────────────────────
router.get("/notifications", (req, res) => {
  const { phone } = req.query as Record<string, string>;
  const rows = db.prepare("SELECT * FROM notifications WHERE user_phone = ? ORDER BY created_at DESC LIMIT 50").all(phone);
  res.json(rows);
});

router.put("/notifications/read-all", (req, res) => {
  const { phone } = req.body;
  db.prepare("UPDATE notifications SET read = 1 WHERE user_phone = ?").run(phone);
  res.json({ message: "تم" });
});

// ── Available vehicles ────────────────────────────────────────────────────────
router.get("/workflow/vehicles", (_req, res) => {
  res.json(db.prepare("SELECT * FROM fleet_vehicles ORDER BY plate_number").all());
});

export default router;
