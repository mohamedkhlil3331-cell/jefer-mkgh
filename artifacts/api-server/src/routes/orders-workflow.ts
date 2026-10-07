import { Router } from "express";
import multer from "multer";
import path from "path";
import db, { generateOrderNumber, UPLOADS_PATH } from "../lib/db.js";
import { createJournalEntry } from "../lib/journal.js";
import { getSlaStatus, getSlaSettings } from "../lib/sla.js";

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

/** Enrich an array of orders with sla_status (non-fatal helper) */
function withSla(orders: Record<string, unknown>[]): Record<string, unknown>[] {
  try {
    const settings = getSlaSettings();
    return orders.map(o => {
      const sla = getSlaStatus(o, settings);
      return sla ? { ...o, sla_status: sla } : o;
    });
  } catch {
    return orders; // SLA enrichment failure must never break the order list
  }
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
    sql += " AND stage IN ('pending','pending_rep_approval','payment_confirmed')";
  } else if (role === "supervisor") {
    const stageCond = stage ? " AND wo.stage = ?" : "";
    if (stage) params.push(stage);
    const supervisorSql = `
      SELECT wo.*, u.name AS rep_name, u.phone AS rep_phone
      FROM workflow_orders wo
      LEFT JOIN users u ON u.id = wo.rep_id
      WHERE wo.stage IN ('payment_confirmed','vehicle_assigned','invoiced','loaded','bulker_assignment')
      ${stageCond}
      ORDER BY wo.created_at DESC
    `;
    return void res.json(withSla(db.prepare(supervisorSql).all(...params) as Record<string, unknown>[]));
  } else if (role === "warehouse") {
    sql += " AND stage IN ('vehicle_assigned','invoiced')";
  } else if (role === "bulker") {
    sql += " AND stage IN ('bulker_assignment')";
  } else if (role === "fsohat") {
    sql += " AND stage IN ('fsohat_pending','fsohat_processing')";
  } else if (role === "driver") {
    // Check if phone is a vehicle plate number → fetch by vehicle_plate
    const isVehiclePlate = db.prepare("SELECT id FROM fleet_vehicles WHERE plate_number = ?").get(phone);
    if (isVehiclePlate) {
      sql += " AND vehicle_plate = ?";
    } else {
      sql += " AND driver_phone = ?";
    }
    params.push(phone);
  }
  if (stage) { sql += " AND stage = ?"; params.push(stage); }
  sql += " ORDER BY created_at DESC";
  res.json(withSla(db.prepare(sql).all(...params) as Record<string, unknown>[]));
});

router.get("/workflow/orders/:id", (req, res) => {
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  // If caller identifies as customer, verify ownership
  const { customer_phone } = req.query as Record<string, string>;
  if (customer_phone && order.customer_phone !== customer_phone) {
    return void res.status(403).json({ error: "غير مصرح" });
  }
  res.json(order);
});

// ── Customer places order ────────────────────────────────────────────────────
router.post("/workflow/orders", (req, res) => {
  const {
    customer_phone, customer_name, rep_id,
    product_id, product_name, quantity, unit,
    unit_price, delivery_location, delivery_lat, delivery_lng, destination_type,
    payment_method, packaging_type
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

  const payMethod = payment_method === "cash" ? "cash" : payment_method === "card" ? "card" : "transfer";
  const pkgType = packaging_type === "سائب" ? "سائب" : "معبأ";

  // ── سائب orders: go directly to rep, bypass payment flow ──────────────────
  let initialStage: string;
  if (pkgType === "سائب") {
    // Find the rep linked to this customer (active link)
    const repLink = customer_phone
      ? db.prepare(
          "SELECT u.phone FROM client_rep_links l JOIN users u ON u.phone = l.rep_phone WHERE l.customer_phone = ? AND l.link_status = 'active' LIMIT 1"
        ).get(customer_phone) as { phone: string } | undefined
      : undefined;
    if (repLink) {
      initialStage = "pending_rep_approval";
    } else {
      // No rep linked — fall through to normal flow
      initialStage = payMethod === "card" ? "payment_confirmed"
                   : payMethod === "cash" ? "pending_cash_approval"
                   : "pending";
    }
  } else {
    // Card: auto-confirmed. Cash: pending_cash_approval. Transfer: pending
    initialStage = payMethod === "card" ? "payment_confirmed"
                 : payMethod === "cash" ? "pending_cash_approval"
                 : "pending";
  }

  const orderNumber = generateOrderNumber();

  const result = db.prepare(`
    INSERT INTO workflow_orders
      (order_number, customer_phone, customer_name, rep_id, product_id, product_name,
       quantity, unit, unit_price, total_before_vat, vat_amount, total_with_vat,
       delivery_location, delivery_lat, delivery_lng, destination_type, stage,
       payment_method, reviewer_name, review_date, payment_amount, packaging_type)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(orderNumber, customer_phone, customer_name||null, rep_id||null,
         product_id||null, resolvedProductName||null, qty, resolvedUnit||null,
         resolvedUnitPrice, totalBefore, vatAmount, totalWith,
         delivery_location||null, delivery_lat||null, delivery_lng||null,
         destination_type||"مستودع", initialStage,
         payMethod,
         payMethod === "card" ? "الدفع الإلكتروني" : null,
         payMethod === "card" ? new Date().toISOString() : null,
         payMethod === "card" ? totalWith : null,
         pkgType);

  // Notify based on initial stage / payment method
  if (initialStage === "pending_rep_approval") {
    // سائب order — notify the rep linked to this customer directly
    const repUser = rep_id
      ? db.prepare("SELECT phone,name FROM users WHERE id=?").get(rep_id) as {phone:string;name:string}|undefined
      : db.prepare(
          "SELECT u.phone,u.name FROM client_rep_links l JOIN users u ON u.phone=l.rep_phone WHERE l.customer_phone=? AND l.link_status='active' LIMIT 1"
        ).get(customer_phone) as {phone:string;name:string}|undefined;
    if (repUser) notify(repUser.phone, "طلبية سائب تحتاج موافقتك", `طلب سائب جديد رقم ${orderNumber} من ${customer_name||customer_phone} — يحتاج موافقتك`);
  } else if (payMethod === "cash" || initialStage === "pending_cash_approval") {
    const repUser = rep_id ? db.prepare("SELECT phone,name FROM users WHERE id=?").get(rep_id) as {phone:string;name:string}|undefined : null;
    const admins = db.prepare("SELECT phone FROM users WHERE role IN ('admin','reviewer') AND active=1").all() as {phone:string}[];
    const cashMsg = `طلب كاش جديد رقم ${orderNumber} من ${customer_name||customer_phone} — يتطلب موافقتك`;
    if (repUser) notify(repUser.phone, "طلب كاش يحتاج موافقة", cashMsg);
    admins.forEach(a => notify(a.phone, "طلب كاش جديد", cashMsg));
  } else if (payMethod === "card") {
    const supervisors = db.prepare("SELECT phone FROM users WHERE role = 'supervisor' AND active = 1").all() as {phone: string}[];
    supervisors.forEach(s => notify(s.phone, "طلب مدفوع بالبطاقة", `طلب ${orderNumber} جاهز للتعيين — دفع إلكتروني`));
  } else {
    const reviewers = db.prepare("SELECT phone FROM users WHERE role = 'reviewer' AND active = 1").all() as {phone: string}[];
    reviewers.forEach(r => notify(r.phone, "طلب جديد", `طلب جديد رقم ${orderNumber} من ${customer_name || customer_phone}`));
  }

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

  const confirmedAmount = parseFloat(payment_amount) || (order.total_with_vat as number) || 0;

  db.transaction(() => {
    db.prepare(`
      UPDATE workflow_orders SET
        stage = 'payment_confirmed', reviewer_id = ?, reviewer_name = ?,
        review_date = datetime('now'), payment_transfer_ref = ?, payment_amount = ?
      WHERE id = ?
    `).run(reviewer?.id||null, reviewer_name||reviewer_phone, payment_transfer_ref||null, confirmedAmount, req.params.id);

    // ── Journal Entry: Payment confirmed (bank transfer) ───────────────────
    if (confirmedAmount > 0) {
      createJournalEntry({ reference_type: "payment_bank", reference_id: String(order.order_number), debit_account: "1020", credit_account: "1030", amount: confirmedAmount, description: `تأكيد دفع بنكي — طلب ${order.order_number}`, created_by: reviewer_phone });
    }
  })();

  // Notify supervisor
  const supervisors = db.prepare("SELECT phone FROM users WHERE role = 'supervisor' AND active = 1").all() as {phone: string}[];
  supervisors.forEach(s => notify(s.phone, "طلب جاهز للتخصيص", `تم تأكيد دفع طلب ${order.order_number}`));
  notify(order.customer_phone as string, "تم تأكيد الدفع", `تم تأكيد دفع طلبك رقم ${order.order_number}`);

  res.json({ message: "تم تأكيد الدفع والتوقيع" });
});

// ── Reviewer: send order to rep for balance approval ─────────────────────────
router.put("/workflow/orders/:id/send-to-rep", (req, res) => {
  const { reviewer_phone, reviewer_name } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage !== "pending") return void res.status(400).json({ error: "الطلب ليس في انتظار التأكيد" });
  if (!order.rep_id) return void res.status(400).json({ error: "لا يوجد مندوب مرتبط بهذا الطلب" });

  const reviewer = db.prepare("SELECT id FROM users WHERE phone = ?").get(reviewer_phone) as { id: number } | undefined;
  db.prepare(`
    UPDATE workflow_orders SET stage = 'pending_rep_approval',
      reviewer_id = ?, reviewer_name = ?, review_date = datetime('now')
    WHERE id = ?
  `).run(reviewer?.id || null, reviewer_name || reviewer_phone, req.params.id);

  const rep = db.prepare("SELECT phone, name FROM users WHERE id = ?").get(order.rep_id as number) as { phone: string; name: string } | undefined;
  if (rep) {
    notify(rep.phone, "طلب يحتاج موافقتك", `الطلب ${order.order_number} للعميل ${order.customer_name || order.customer_phone} يحتاج موافقتك — رصيد العميل غير كافٍ`);
  }
  res.json({ message: "تم إرسال الطلب للمندوب" });
});

// ── Rep: approve order (balance approved) ─────────────────────────────────
router.put("/workflow/orders/:id/rep-approve", (req, res) => {
  const { approver_phone, approver_name } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage !== "pending_rep_approval") return void res.status(400).json({ error: "الطلب ليس في مرحلة انتظار موافقة المندوب" });

  // سائب orders → go to bulker supervisor for vehicle assignment first
  const isSaeb = order.packaging_type === "سائب";
  const nextStage = isSaeb ? "bulker_assignment" : "payment_confirmed";

  db.prepare(`
    UPDATE workflow_orders SET stage = ?,
      cash_approved_by = ?, cash_approved_at = datetime('now'),
      payment_amount = ?
    WHERE id = ?
  `).run(nextStage, approver_phone || null, order.total_with_vat as number, req.params.id);

  notify(order.customer_phone as string, "تمت الموافقة على طلبك", `تمت الموافقة على طلبك رقم ${order.order_number} — سيتم التواصل معك قريباً`);

  if (isSaeb) {
    // Notify bulker supervisors to assign a bulker vehicle
    const bulkerSups = db.prepare("SELECT phone FROM users WHERE role IN ('bulker_supervisor','admin') AND active=1").all() as { phone: string }[];
    bulkerSups.forEach(u => notify(u.phone, "طلبية سائب تحتاج تعيين بلاكر", `طلب ${order.order_number} (${order.product_name}) وافق عليه المندوب — يحتاج تعيين سيارة بلاكر`));
  } else {
    const supervisors = db.prepare("SELECT phone FROM users WHERE role='supervisor' AND active=1").all() as { phone: string }[];
    supervisors.forEach(s => notify(s.phone, "طلب جاهز للتخصيص", `وافق المندوب على طلب ${order.order_number} — جاهز للتخصيص`));
  }
  res.json({ message: "تمت الموافقة على الطلب" });
});

// ── Rep: reject order (balance insufficient) ──────────────────────────────
router.put("/workflow/orders/:id/rep-reject", (req, res) => {
  const { approver_phone, reason } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage !== "pending_rep_approval") return void res.status(400).json({ error: "الطلب ليس في مرحلة انتظار موافقة المندوب" });

  const cancelReason = reason || "رفض المندوب — رصيد العميل غير كافٍ";
  db.prepare("UPDATE workflow_orders SET stage='cancelled', cancel_reason=? WHERE id=?").run(cancelReason, req.params.id);
  notify(order.customer_phone as string, "تم رفض طلبك", `تم رفض طلبك رقم ${order.order_number}. ${cancelReason}`);
  if (approver_phone) {
    const reviewers = db.prepare("SELECT phone FROM users WHERE role='reviewer' AND active=1").all() as { phone: string }[];
    reviewers.forEach(r => notify(r.phone, "رفض المندوب", `رفض المندوب طلب ${order.order_number} — تم الإلغاء`));
  }
  res.json({ message: "تم رفض الطلب وإلغاؤه" });
});

// ── Draft: save order without submitting ─────────────────────────────────────
router.post("/workflow/orders/draft", (req, res) => {
  const {
    customer_phone, customer_name, rep_id,
    product_id, product_name, quantity, unit,
    unit_price, delivery_location, delivery_lat, delivery_lng, destination_type,
    payment_method, packaging_type
  } = req.body;
  if (!customer_phone) return void res.status(400).json({ error: "رقم الهاتف مطلوب" });

  let resolvedProductName = product_name;
  let resolvedUnitPrice = parseFloat(unit_price) || 0;
  let resolvedUnit = unit;
  if (product_id) {
    const p = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id) as Record<string, unknown> | undefined;
    if (p) {
      resolvedProductName = resolvedProductName || p.name as string;
      resolvedUnitPrice = resolvedUnitPrice || (p.price_per_unit as number);
      resolvedUnit = resolvedUnit || (p.unit as string);
    }
  }
  const qty = parseFloat(quantity) || 1;
  const totalBefore = parseFloat((qty * resolvedUnitPrice).toFixed(2));
  const vatAmount = parseFloat((totalBefore * 0.15).toFixed(2));
  const totalWith = parseFloat((totalBefore + vatAmount).toFixed(2));
  const payMethod = payment_method === "cash" ? "cash" : payment_method === "card" ? "card" : "transfer";
  const pkgType = packaging_type === "سائب" ? "سائب" : "معبأ";
  const orderNumber = generateOrderNumber();
  const result = db.prepare(`
    INSERT INTO workflow_orders
      (order_number, customer_phone, customer_name, rep_id, product_id, product_name,
       quantity, unit, unit_price, total_before_vat, vat_amount, total_with_vat,
       delivery_location, delivery_lat, delivery_lng, destination_type, stage,
       payment_method, packaging_type)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(orderNumber, customer_phone, customer_name||null, rep_id||null,
         product_id||null, resolvedProductName||null, qty, resolvedUnit||null,
         resolvedUnitPrice, totalBefore, vatAmount, totalWith,
         delivery_location||null, delivery_lat||null, delivery_lng||null,
         destination_type||"مستودع", "draft", payMethod, pkgType);
  res.status(201).json({ id: result.lastInsertRowid, order_number: orderNumber, message: "تم حفظ المسودة" });
});

// ── Draft: submit draft as real order ─────────────────────────────────────────
router.put("/workflow/orders/:id/submit-draft", (req, res) => {
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage !== "draft") return void res.status(400).json({ error: "الطلب ليس مسودة" });

  const payMethod = order.payment_method as string;
  const initialStage = payMethod === "card" ? "payment_confirmed"
                     : payMethod === "cash" ? "pending_cash_approval"
                     : "pending";
  db.prepare("UPDATE workflow_orders SET stage=? WHERE id=?").run(initialStage, req.params.id);

  if (payMethod === "cash") {
    const repUser = order.rep_id ? db.prepare("SELECT phone,name FROM users WHERE id=?").get(order.rep_id) as {phone:string;name:string}|undefined : null;
    const admins = db.prepare("SELECT phone FROM users WHERE role IN ('admin','reviewer') AND active=1").all() as {phone:string}[];
    const cashMsg = `طلب كاش جديد رقم ${order.order_number} من ${order.customer_name||order.customer_phone} — يتطلب موافقتك`;
    if (repUser) notify(repUser.phone, "طلب كاش يحتاج موافقة", cashMsg);
    admins.forEach(a => notify(a.phone, "طلب كاش جديد", cashMsg));
  } else if (payMethod !== "card") {
    const reviewers = db.prepare("SELECT phone FROM users WHERE role='reviewer' AND active=1").all() as {phone:string}[];
    reviewers.forEach(r => notify(r.phone, "طلب جديد", `طلب جديد رقم ${order.order_number} من ${order.customer_name||order.customer_phone}`));
  }
  res.json({ message: "تم إرسال الطلب", stage: initialStage, order_number: order.order_number });
});

// ── Nearest loading point (Haversine) ─────────────────────────────────────────
router.get("/workflow/nearest-loading-point", (req, res) => {
  const { lat, lng } = req.query as Record<string, string>;
  if (!lat || !lng) return void res.status(400).json({ error: "lat/lng مطلوبان" });
  const points = db.prepare("SELECT * FROM loading_points WHERE active=1 AND lat IS NOT NULL AND lng IS NOT NULL").all() as {id:number;name:string;city:string;address:string;lat:number;lng:number}[];
  if (!points.length) return void res.json(null);

  const R = 6371; // Earth radius km
  const toRad = (d: number) => d * Math.PI / 180;
  const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const lat0 = parseFloat(lat), lng0 = parseFloat(lng);
  const nearest = points.map(p => ({ ...p, distance_km: haversine(lat0, lng0, p.lat, p.lng) }))
    .sort((a, b) => a.distance_km - b.distance_km)[0];
  res.json(nearest);
});

// ── Cash approval — rep/admin approves cash order ────────────────────────────
router.put("/workflow/orders/:id/approve-cash", (req, res) => {
  const { approver_phone, approver_name, note } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage !== "pending_cash_approval") return void res.status(400).json({ error: "الطلب ليس في مرحلة انتظار موافقة الكاش" });
  const cashAmount = order.total_with_vat as number || 0;

  db.transaction(() => {
    db.prepare(`
      UPDATE workflow_orders SET stage='payment_confirmed',
        cash_approved_by=?, cash_approval_note=?, cash_approved_at=datetime('now'),
        reviewer_name=?, review_date=datetime('now'), payment_amount=?
      WHERE id=?
    `).run(approver_phone||null, note||null, approver_name||approver_phone, cashAmount, req.params.id);

    // ── Journal Entry: Cash payment approved ───────────────────────────────
    if (cashAmount > 0) {
      createJournalEntry({ reference_type: "payment_cash", reference_id: String(order.order_number), debit_account: "1010", credit_account: "1030", amount: cashAmount, description: `تأكيد دفع نقدي — طلب ${order.order_number}`, created_by: approver_phone });
    }
  })();

  const supervisors = db.prepare("SELECT phone FROM users WHERE role='supervisor' AND active=1").all() as {phone:string}[];
  supervisors.forEach(s => notify(s.phone, "طلب كاش مؤكد", `تم تأكيد طلب الكاش ${order.order_number} — جاهز للتخصيص`));
  notify(order.customer_phone as string, "تمت الموافقة على طلبك", `تمت الموافقة على طلبك رقم ${order.order_number} — سيتم التواصل معك قريباً`);
  res.json({ message: "تمت الموافقة على الدفع النقدي" });
});

// ── Supervisor: assign vehicle ───────────────────────────────────────────────
router.put("/workflow/orders/:id/assign-vehicle", (req, res) => {
  const { supervisor_phone, vehicle_id, driver_phone, driver_name_override, tariff_id, alt_driver_phone, alt_driver_name } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  // driver_phone is now optional — plate-only assignment allowed

  // Look up vehicle in driver_profiles
  const vehicle = db.prepare("SELECT * FROM driver_profiles WHERE id = ?").get(vehicle_id) as Record<string, unknown> | undefined;
  if (!vehicle) return void res.status(400).json({ error: "السيارة غير موجودة" });

  // Look up driver from users table (login account) — this ensures phone matches login
  const driver = db.prepare("SELECT * FROM users WHERE phone = ? AND role = 'driver'").get(driver_phone) as Record<string, unknown> | undefined;
  const supervisor = db.prepare("SELECT id FROM users WHERE phone = ?").get(supervisor_phone) as Record<string, unknown> | undefined;

  const finalDriverName = driver?.name as string || driver_name_override || null;

  // Resolve tariff data if tariff_id provided
  let rentalAmount = 0, driverBonusVal = 0;
  if (tariff_id) {
    const tariff = db.prepare("SELECT * FROM tariffs WHERE id=? AND status='approved'").get(tariff_id) as Record<string,unknown>|undefined;
    if (tariff) { rentalAmount = (tariff.rental as number)||0; driverBonusVal = (tariff.driver_expense as number)||0; }
  }

  // NOTE: vehicle_id column has FK to fleet_vehicles — do NOT store driver_profiles ID there.
  // We store vehicle_plate (text) for display and use it to track the vehicle in driver_profiles.
  // Bonus target: alt driver if provided, else main driver
  const bonusPhone = alt_driver_phone || driver_phone || null;

  db.prepare(`
    UPDATE workflow_orders SET
      stage = 'vehicle_assigned', supervisor_id = ?,
      vehicle_id = NULL, vehicle_plate = ?,
      driver_id = ?, driver_name = ?, driver_phone = ?,
      alt_driver_phone = ?, alt_driver_name = ?,
      vehicle_assign_date = datetime('now'),
      tariff_id = ?, rental_amount = ?, driver_bonus = ?
    WHERE id = ?
  `).run(supervisor?.id||null, vehicle.vehicle_plate,
         driver?.id||null, finalDriverName, driver_phone||null,
         alt_driver_phone||null, alt_driver_name||null,
         tariff_id||null, rentalAmount, driverBonusVal, req.params.id);

  // Mark vehicle as busy in driver_profiles (by plate, not by ID)
  db.prepare("UPDATE driver_profiles SET status = 'في رحلة' WHERE vehicle_plate = ?").run(vehicle.vehicle_plate);
  // Also update fleet_vehicles
  db.prepare("UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?").run(vehicle.vehicle_plate);

  // Notify warehouse + driver(s)
  const warehouse = db.prepare("SELECT phone FROM users WHERE role = 'warehouse' AND active = 1").all() as {phone: string}[];
  warehouse.forEach(w => notify(w.phone, "طلب جاهز للفاتورة", `تم تخصيص سيارة لطلب ${order.order_number}`));
  if (driver_phone) notify(driver_phone, "طلب جديد لك", `لديك طلب توصيل رقم ${order.order_number}، تفضل بالتحقق من بوابتك`);
  if (alt_driver_phone && alt_driver_phone !== driver_phone) {
    notify(alt_driver_phone, "طلب جديد لك (سائق بديل)", `تم تعيينك بديلاً في طلب ${order.order_number}`);
  }

  const bonusDriverLabel = bonusPhone
    ? (alt_driver_name || alt_driver_phone || driver_phone || "السائق")
    : "—";

  res.json({ message: "تم تخصيص السيارة", vehicle_plate: vehicle.vehicle_plate, bonus_goes_to: bonusDriverLabel });
});

// ── Supervisor: swap vehicle on an already-assigned order ────────────────────
router.put("/workflow/orders/:id/swap-vehicle", (req, res) => {
  const { vehicle_id, driver_phone, driver_name_override } = req.body as Record<string, string>;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (!["vehicle_assigned","invoiced","loaded"].includes(order.stage as string))
    return void res.status(400).json({ error: "لا يمكن تبديل السيارة في هذه المرحلة" });

  const newVehicle = db.prepare("SELECT * FROM driver_profiles WHERE id=?").get(vehicle_id) as Record<string,unknown>|undefined;
  if (!newVehicle) return void res.status(400).json({ error: "السيارة الجديدة غير موجودة" });

  const driver = driver_phone ? db.prepare("SELECT * FROM users WHERE phone=? AND role='driver'").get(driver_phone) as Record<string,unknown>|undefined : undefined;
  const finalDriverName = (driver?.name as string) || driver_name_override || null;

  /* Free the old vehicle */
  const oldPlate = order.vehicle_plate as string;
  if (oldPlate) {
    try { db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(oldPlate); } catch {}
    try { db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(oldPlate); } catch {}
  }

  /* Occupy the new vehicle */
  const newPlate = newVehicle.vehicle_plate as string;
  db.prepare("UPDATE driver_profiles SET status='في رحلة' WHERE vehicle_plate=?").run(newPlate);
  try { db.prepare("UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?").run(newPlate); } catch {}

  /* Update the order */
  db.prepare(`
    UPDATE workflow_orders SET
      vehicle_plate=?, driver_id=?, driver_name=?, driver_phone=?,
      vehicle_assign_date=datetime('now')
    WHERE id=?
  `).run(newPlate, driver?.id||null, finalDriverName, driver_phone||null, req.params.id);

  res.json({ ok: true, vehicle_plate: newPlate });
});

// ── Get active order for a vehicle plate ─────────────────────────────────────
router.get("/workflow/orders/by-vehicle/:plate", (req, res) => {
  const plate = decodeURIComponent(req.params.plate);
  const order = db.prepare(`
    SELECT id, order_number, customer_name, product_name, quantity, stage,
           driver_name, driver_phone, vehicle_plate
    FROM workflow_orders
    WHERE vehicle_plate = ? AND stage IN ('vehicle_assigned','invoiced','loaded')
    ORDER BY vehicle_assign_date DESC LIMIT 1
  `).get(plate) as Record<string,unknown>|undefined;
  if (!order) return void res.status(404).json({ error: "لا يوجد طلب نشط لهذه السيارة" });
  res.json(order);
});

// ── Reviewer: unconfirm (revert payment_confirmed → pending) ─────────────────
router.put("/workflow/orders/:id/unconfirm", (req, res) => {
  const { reason } = req.body as Record<string, string>;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage !== "payment_confirmed")
    return void res.status(400).json({ error: "الطلب ليس في مرحلة تأكيد الدفع" });

  db.prepare(`
    UPDATE workflow_orders SET
      stage = 'pending', reviewer_id = NULL, reviewer_name = NULL,
      review_date = NULL, payment_transfer_ref = NULL, payment_amount = 0
    WHERE id = ?
  `).run(req.params.id);

  notify(order.customer_phone as string, "إعادة مراجعة الطلب",
    `تم إعادة طلبك رقم ${order.order_number} إلى قائمة الانتظار. ${reason || ""}`);
  res.json({ message: "تم إلغاء التأكيد وإعادة الطلب للانتظار" });
});

// ── Reviewer: edit confirmed order (quantity / amounts) ───────────────────────
router.put("/workflow/orders/:id/edit-confirmed", (req, res) => {
  const { quantity, unit_price } = req.body as Record<string, string>;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage !== "payment_confirmed")
    return void res.status(400).json({ error: "التعديل متاح فقط في مرحلة تأكيد الدفع" });

  const qty = parseFloat(quantity);
  if (!qty || qty <= 0) return void res.status(400).json({ error: "الكمية غير صالحة" });

  const uprice = unit_price
    ? parseFloat(unit_price)
    : (order.total_before_vat as number) / (order.quantity as number);

  const newBefore = Math.round(qty * uprice * 100) / 100;
  const newVat    = Math.round(newBefore * 0.15 * 100) / 100;
  const newTotal  = Math.round((newBefore + newVat) * 100) / 100;

  db.prepare(`
    UPDATE workflow_orders SET
      quantity = ?, total_before_vat = ?, vat_amount = ?, total_with_vat = ?
    WHERE id = ?
  `).run(qty, newBefore, newVat, newTotal, req.params.id);

  res.json({ message: "تم تعديل الطلب", total_with_vat: newTotal });
});

// ── Supervisor: reject order awaiting vehicle assignment ──────────────────────
router.put("/workflow/orders/:id/supervisor-reject", (req, res) => {
  const { cancel_reason } = req.body as Record<string,string>;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (!["payment_confirmed","vehicle_assigned"].includes(order.stage as string))
    return void res.status(400).json({ error: "لا يمكن رفض هذا الطلب في مرحلته الحالية" });

  /* Free vehicle if already assigned */
  const plate = order.vehicle_plate as string;
  if (plate) {
    try { db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(plate); } catch {}
    try { db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(plate); } catch {}
  }

  db.prepare(`
    UPDATE workflow_orders SET stage='cancelled', cancel_reason=COALESCE(?,cancel_reason),
      vehicle_plate=NULL, driver_phone=NULL, driver_name=NULL
    WHERE id=?
  `).run(cancel_reason || "رفض مشرف النقليات", req.params.id);

  if (order.customer_phone) {
    notify(order.customer_phone as string, "تم رفض طلبك", `تم رفض طلبك رقم ${order.order_number}. ${cancel_reason || "سيتواصل معك الفريق قريباً."}`);
  }
  res.json({ ok: true });
});

// ── Admin/Supervisor: cancel active trip ──────────────────────────────────────
router.put("/workflow/orders/:id/cancel-trip", (req, res) => {
  const { cancel_reason } = req.body as Record<string,string>;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (!["vehicle_assigned","invoiced","loaded"].includes(order.stage as string))
    return void res.status(400).json({ error: "لا يمكن إلغاء هذه الرحلة في مرحلتها الحالية" });

  /* Free the vehicle */
  const plate = order.vehicle_plate as string;
  if (plate) {
    try { db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(plate); } catch {}
    try { db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(plate); } catch {}
  }

  db.prepare(`
    UPDATE workflow_orders SET stage='cancelled', cancel_reason=COALESCE(?,cancel_reason),
      vehicle_plate=NULL, driver_phone=NULL, driver_name=NULL
    WHERE id=?
  `).run(cancel_reason || "إلغاء الرحلة من قِبَل الإدارة", req.params.id);

  if (order.customer_phone) {
    notify(order.customer_phone as string, "تم إلغاء رحلتك", `تم إلغاء طلب ${order.order_number}. سيتواصل معك الفريق قريباً.`);
  }
  res.json({ ok: true });
});

// ── Warehouse: issue invoice ─────────────────────────────────────────────────
router.put("/workflow/orders/:id/invoice", upload.single("invoice_image"), (req, res) => {
  const { warehouse_phone, invoice_number, invoice_warehouse_id } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  const warehouse = db.prepare("SELECT id FROM users WHERE phone = ?").get(warehouse_phone) as Record<string, unknown> | undefined;
  const imageUrl = req.file ? `/api/uploads/${req.file.filename}` : null;
  const invoiceNum = invoice_number || `INV-${order.order_number}`;
  const srcWhId = invoice_warehouse_id ? parseInt(invoice_warehouse_id) : null;

  const revenueAmt = Number(order.total_before_vat) || 0;
  const vatAmt     = Number(order.vat_amount)       || 0;
  const totalAmt   = Number(order.total_with_vat)   || revenueAmt;

  db.transaction(() => {
    db.prepare(`
      UPDATE workflow_orders SET
        stage = 'invoiced', warehouse_id = ?,
        invoice_number = ?, invoice_image_url = ?, invoice_date = datetime('now'),
        invoice_warehouse_id = COALESCE(?, invoice_warehouse_id)
      WHERE id = ?
    `).run(warehouse?.id||null, invoiceNum, imageUrl, srcWhId, req.params.id);

    // ── Journal Entry: Issue Invoice ────────────────────────────────────────
    // reference_id uses stable order ID (not invoice_number which can change on re-issue)
    // so re-invoicing the same order is a no-op for accounting (INSERT OR IGNORE).
    // Corrections require an explicit reversal + new manual entry.
    const orderId = req.params.id;
    if (revenueAmt > 0) {
      createJournalEntry({ reference_type: "invoice", reference_id: `order:${orderId}:rev`, debit_account: "1030", credit_account: "4010", amount: revenueAmt, description: `فاتورة ${invoiceNum} — إيراد مبيعات`, created_by: warehouse_phone });
    }
    if (vatAmt > 0) {
      createJournalEntry({ reference_type: "invoice", reference_id: `order:${orderId}:vat`, debit_account: "1030", credit_account: "2010", amount: vatAmt, description: `فاتورة ${invoiceNum} — ضريبة القيمة المضافة`, created_by: warehouse_phone });
    }
    if (revenueAmt === 0 && totalAmt > 0) {
      createJournalEntry({ reference_type: "invoice", reference_id: `order:${orderId}:rev`, debit_account: "1030", credit_account: "4010", amount: totalAmt, description: `فاتورة ${invoiceNum}`, created_by: warehouse_phone });
    }
  })();

  if (order.driver_phone) notify(order.driver_phone as string, "فاتورة جاهزة", `الفاتورة جاهزة لطلب ${order.order_number}. تفضل بالتحميل.`);

  res.json({ message: "تم إصدار الفاتورة", invoice_number: invoiceNum });
});

// ── Warehouse: change loading point ──────────────────────────────────────────
router.put("/workflow/orders/:id/change-loading-point", (req, res) => {
  const { loading_point_id, loading_point_name } = req.body;
  const order = db.prepare("SELECT id FROM workflow_orders WHERE id=?").get(req.params.id);
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  const lp = loading_point_id
    ? (db.prepare("SELECT * FROM loading_points WHERE id=?").get(loading_point_id) as Record<string, unknown> | undefined)
    : null;
  const finalName = (lp?.name as string) || loading_point_name || null;
  db.prepare("UPDATE workflow_orders SET loading_point_id=?, loading_point_name=? WHERE id=?")
    .run(loading_point_id || null, finalName, req.params.id);
  res.json({ message: "تم تحديث مكان التحميل", loading_point_name: finalName });
});

// ── Warehouse: save invoice draft (preview step — does not finalize) ──────────
router.put("/workflow/orders/:id/invoice-draft", (req, res) => {
  const order = db.prepare("SELECT id FROM workflow_orders WHERE id=?").get(req.params.id);
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  db.prepare("UPDATE workflow_orders SET invoice_draft_data=? WHERE id=?")
    .run(JSON.stringify(req.body), req.params.id);
  res.json({ message: "تم حفظ مسودة الفاتورة" });
});

// ── Driver: update current GPS location ──────────────────────────────────────
router.put("/workflow/orders/:id/driver-location", (req, res) => {
  const { driver_phone, driver_lat, driver_lng } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (!driver_lat || !driver_lng) return void res.status(400).json({ error: "الإحداثيات مطلوبة" });
  if (driver_phone && order.driver_phone !== driver_phone) {
    return void res.status(403).json({ error: "غير مصرح" });
  }
  db.prepare(
    "UPDATE workflow_orders SET driver_lat=?, driver_lng=?, driver_location_updated_at=datetime('now') WHERE id=?"
  ).run(parseFloat(driver_lat), parseFloat(driver_lng), req.params.id);
  res.json({ message: "تم تحديث الموقع" });
});

// ── Driver: confirm loading + upload photo ───────────────────────────────────
router.put("/workflow/orders/:id/load", upload.single("loading_photo"), (req, res) => {
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  const photoUrl = req.file ? `/api/uploads/${req.file.filename}` : null;
  db.prepare("UPDATE workflow_orders SET stage='loaded', loading_photo_url=?, loading_date=datetime('now') WHERE id=?")
    .run(photoUrl, req.params.id);

  // ── Inventory deduction at loading time (single deduction only) ─────────────
  if (!order.inventory_deducted) {
    const whId = (order.invoice_warehouse_id as number) || (order.warehouse_id as number);
    if (whId && order.product_name) {
      const item = db.prepare(
        "SELECT * FROM warehouse_items WHERE warehouse_id=? AND product_name LIKE ? LIMIT 1"
      ).get(whId, `%${order.product_name}%`) as Record<string, unknown> | undefined;
      if (item) {
        const newQty = Math.max(0, (item.quantity as number) - ((order.quantity as number) || 0));
        db.prepare("UPDATE warehouse_items SET quantity=?,last_updated=datetime('now') WHERE id=?").run(newQty, item.id);
        db.prepare("UPDATE workflow_orders SET inventory_deducted=1 WHERE id=?").run(req.params.id);
        const settings = db.prepare("SELECT * FROM invoice_settings WHERE id=1").get() as Record<string, unknown> | undefined;
        if (settings?.auto_replenishment && newQty <= (item.min_stock as number)) {
          const cfg = db.prepare("SELECT * FROM trailer_load_configs WHERE ? LIKE '%' || product_category || '%' LIMIT 1").get(item.product_name) as Record<string, unknown> | undefined;
          const loads = Math.ceil(((item.min_stock as number) || 1) / ((cfg?.trailer_capacity as number) || 1));
          db.prepare(`INSERT INTO supply_requests (warehouse_id, product_name, requested_qty, unit, trailer_loads, auto_triggered, priority, destination_division) VALUES (?,?,?,?,?,1,'urgent','المصنع')`)
            .run(whId, item.product_name, item.min_stock, item.unit, loads || 1);
        }
      }
    }
  }

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

  // Free the vehicle in driver_profiles (by plate since vehicle_id FK is to fleet_vehicles)
  if (order.vehicle_plate) db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(order.vehicle_plate);

  // ── Auto-add trip to سجل الرحلات ──────────────────────────────────────────
  if (order.vehicle_plate) {
    const today = new Date().toISOString().slice(0, 10);
    const fvTrailer = (db.prepare("SELECT linked_trailer_number FROM fleet_vehicles WHERE plate_number=? LIMIT 1")
      .get(order.vehicle_plate) as { linked_trailer_number: string | null } | undefined)?.linked_trailer_number || null;
    db.prepare(`
      INSERT INTO trips
        (date, car_id, driver_name, driver_phone, client_name, material_type, destination,
         trips_count, unit_price, total_amount, vat, net_amount, notes, trailer_number)
      VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?,?)
    `).run(
      today,
      order.vehicle_plate,
      order.driver_name  || null,
      order.driver_phone || null,
      order.customer_name || null,
      order.product_name  || null,
      order.delivery_location || null,
      Number(order.unit_price)       || 0,
      Number(order.total_with_vat)   || 0,
      Number(order.vat_amount)       || 0,
      Number(order.total_before_vat) || 0,
      order.order_number || null,
      fvTrailer,
    );
  }

  notify(order.customer_phone as string, "تم التسليم", `تم تسليم طلبك رقم ${order.order_number} بنجاح.`);

  res.json({ message: "تم تسجيل التسليم" });
});

// ── Driver: report vehicle breakdown (legacy simple) ────────────────────────
router.put("/workflow/vehicles/:vehicleId/break", (req, res) => {
  const { notes } = req.body;
  db.prepare("UPDATE driver_profiles SET status='موقوف', notes=? WHERE id=?").run(notes||"عطل مُبلَّغ عنه من السائق", req.params.vehicleId);
  const supervisors = db.prepare("SELECT phone FROM users WHERE role = 'supervisor'").all() as {phone: string}[];
  supervisors.forEach(s => notify(s.phone, "عطل في سيارة", `تم الإبلاغ عن عطل في السيارة رقم ${req.params.vehicleId}`));
  res.json({ message: "تم الإبلاغ عن العطل" });
});

// ── Driver: submit breakdown report with photo + type ────────────────────────
router.post("/workflow/breakdown-reports", upload.single("photo"), (req, res) => {
  const { driver_phone, driver_name, vehicle_id, vehicle_plate, breakdown_type, description, operational_state, action_taken } = req.body;
  if (!driver_phone || !breakdown_type) return void res.status(400).json({ error: "البيانات غير مكتملة" });
  if (!vehicle_plate || !vehicle_plate.trim()) return void res.status(400).json({ error: "يجب تحديد رقم لوحة السيارة قبل إرسال بلاغ العطل" });

  const photo_url = req.file ? `/api/uploads/${req.file.filename}` : null;

  // Mark vehicle as broken in driver_profiles
  if (vehicle_id) {
    db.prepare("UPDATE driver_profiles SET status='موقوف' WHERE id=?").run(vehicle_id);
  }

  const result = db.prepare(`
    INSERT INTO breakdown_reports (driver_phone, driver_name, vehicle_id, vehicle_plate, breakdown_type, description, photo_url, operational_state, action_taken)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(driver_phone, driver_name||null, vehicle_id||null, vehicle_plate||null, breakdown_type, description||null, photo_url, operational_state||null, action_taken||null);

  // Notify supervisors and workshop managers
  const toNotify = db.prepare("SELECT phone FROM users WHERE role IN ('supervisor','workshop_manager') AND active=1").all() as {phone: string}[];
  const msg = `بلاغ عطل من ${driver_name||driver_phone} — السيارة: ${vehicle_plate||"غير محدد"} — النوع: ${breakdown_type}`;
  toNotify.forEach(u => notify(u.phone, "بلاغ عطل جديد", msg));

  res.status(201).json({ id: result.lastInsertRowid, message: "تم إرسال بلاغ العطل" });
});

// ── GET breakdown reports (supervisor + workshop_manager) ────────────────────
router.get("/workflow/breakdown-reports", (req, res) => {
  const { status } = req.query as Record<string, string>;
  let sql = "SELECT * FROM breakdown_reports WHERE 1=1";
  const params: string[] = [];
  if (status) { sql += " AND status=?"; params.push(status); }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

// ── PUT breakdown report: resolve (requires invoice image) ───────────────────
router.put("/workflow/breakdown-reports/:id/resolve", upload.single("invoice"), (req, res) => {
  const { resolved_by, resolve_notes } = req.body;
  const report = db.prepare("SELECT * FROM breakdown_reports WHERE id=?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!report) return void res.status(404).json({ error: "البلاغ غير موجود" });

  const invoice_image_url = req.file ? `/api/uploads/${req.file.filename}` : null;

  db.prepare(`
    UPDATE breakdown_reports SET status='resolved', resolved_by=?, resolve_notes=?, resolved_at=datetime('now'), invoice_image_url=? WHERE id=?
  `).run(resolved_by||null, resolve_notes||null, invoice_image_url, req.params.id);

  // Free vehicle if it was broken (use plate since vehicle_id FK points to fleet_vehicles)
  if (report.vehicle_plate) {
    db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=? AND status='موقوف'").run(report.vehicle_plate);
  }

  // Notify the driver
  if (report.driver_phone) {
    notify(report.driver_phone as string, "تم حل العطل", `تم إصلاح عطل السيارة ${report.vehicle_plate||""} وهي جاهزة للعمل`);
  }

  res.json({ message: "تم تسجيل الحل" });
});

// ── Reviewer/Admin: reverse delivery (delivered → loaded) ────────────────────
router.put("/workflow/orders/:id/reverse-delivery", (req, res) => {
  const { reason, password, caller_phone } = req.body as Record<string, string>;

  // Server-side password enforcement
  if (password !== "mkgh") return void res.status(403).json({ error: "كلمة المرور غير صحيحة" });

  // Role authorization — reviewer or admin only
  if (!caller_phone) return void res.status(400).json({ error: "يجب تحديد هوية المنفِّذ" });
  const caller = db.prepare("SELECT role FROM users WHERE phone=? AND active=1").get(caller_phone) as { role: string } | undefined;
  if (!caller || !["reviewer", "admin"].includes(caller.role)) {
    return void res.status(403).json({ error: "غير مصرح لك بهذه العملية — يلزم دور مراجع أو مدير" });
  }

  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage !== "delivered") return void res.status(400).json({ error: "الطلب ليس في مرحلة التسليم" });

  db.prepare(`
    UPDATE workflow_orders SET stage='loaded', delivery_date=NULL,
      cancel_reason=COALESCE(?, cancel_reason)
    WHERE id=?
  `).run(reason || "عكس التسليم من قِبل المراجع/المدير", req.params.id);

  // Re-occupy the vehicle (mark as busy again)
  if (order.vehicle_plate) {
    db.prepare("UPDATE driver_profiles SET status='في رحلة' WHERE vehicle_plate=?").run(order.vehicle_plate);
  }

  notify(order.customer_phone as string, "تم عكس التسليم", `تم إعادة طلبك رقم ${order.order_number} إلى مرحلة الشحن — يرجى التواصل معنا`);

  res.json({ message: "تم عكس التسليم وإعادة الطلب إلى مرحلة محمّل" });
});

// ── Cancel order — reviewer/admin always; customer only on pending stage ───────
router.put("/workflow/orders/:id/cancel", (req, res) => {
  const { reason, caller_phone } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  if (caller_phone) {
    const caller = db.prepare("SELECT role FROM users WHERE phone = ? AND active = 1").get(caller_phone) as { role: string } | undefined;
    const isCustomerOwner = caller?.role === "customer" && order.customer_phone === caller_phone;
    const isPrivileged    = caller && ["reviewer", "admin"].includes(caller.role);
    if (!isPrivileged && !isCustomerOwner) {
      return void res.status(403).json({ error: "غير مصرح لك بإلغاء الطلبات" });
    }
    // Customer may only cancel while no vehicle is assigned yet
    if (isCustomerOwner && !isPrivileged) {
      const cancelableStages = ["draft", "pending", "pending_cash_approval", "payment_confirmed"];
      const hasVehicle = !!(order.vehicle_plate as string);
      if (!cancelableStages.includes(order.stage as string) || hasVehicle) {
        return void res.status(400).json({ error: "لا يمكن إلغاء الطلب بعد تعيين السيارة. يرجى التواصل مع المندوب أو مشرف الحركة." });
      }
    }
  }

  db.prepare("UPDATE workflow_orders SET stage='cancelled', cancel_reason=? WHERE id=?").run(reason||null, req.params.id);
  if (order.vehicle_plate) {
    try { db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(order.vehicle_plate); } catch {}
    try { db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(order.vehicle_plate); } catch {}
  }
  notify(order.customer_phone as string, "تم إلغاء الطلب", `تم إلغاء طلبك رقم ${order.order_number}. ${reason||""}`);
  res.json({ message: "تم الإلغاء" });
});

// ── Upload bank receipt image (customer) ────────────────────────────────────
router.put("/workflow/orders/:id/upload-receipt", (req, res) => {
  const { bank_receipt_image } = req.body;
  if (!bank_receipt_image) return void res.status(400).json({ error: "الصورة مطلوبة" });
  db.prepare("UPDATE workflow_orders SET bank_receipt_image=? WHERE id=?")
    .run(bank_receipt_image, req.params.id);
  res.json({ message: "تم رفع إيصال التحويل" });
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

// ── Available drivers — from users table (real login accounts) ──────────────
router.get("/workflow/drivers", (_req, res) => {
  const drivers = db.prepare(
    "SELECT id, name, phone FROM users WHERE role = 'driver' AND active = 1 AND phone GLOB '[0-9]*' ORDER BY name"
  ).all();
  res.json(drivers);
});

// ── Available vehicles — sourced from driver_profiles (joined with linked user account) ──
router.get("/workflow/vehicles", (_req, res) => {
  const rows = db.prepare(`
    SELECT dp.*, u.id AS linked_user_id, u.name AS linked_user_name, u.phone AS linked_user_phone,
           fv.gps_device_id, fv.branch AS fleet_branch,
           ld.delivery_location AS last_delivery_location,
           ld.delivery_date     AS last_delivery_date
    FROM driver_profiles dp
    LEFT JOIN users u ON u.id = dp.user_id
    LEFT JOIN fleet_vehicles fv ON fv.plate_number = dp.vehicle_plate
    LEFT JOIN (
      SELECT vehicle_plate, delivery_location, delivery_date
      FROM workflow_orders
      WHERE stage = 'delivered' AND vehicle_plate IS NOT NULL
        AND delivery_date = (
          SELECT MAX(wo2.delivery_date)
          FROM workflow_orders wo2
          WHERE wo2.vehicle_plate = workflow_orders.vehicle_plate AND wo2.stage = 'delivered'
        )
    ) ld ON ld.vehicle_plate = dp.vehicle_plate
    WHERE dp.vehicle_plate IS NOT NULL AND dp.vehicle_plate != ''
    ORDER BY dp.vehicle_plate
  `).all() as Record<string, unknown>[];

  // Use the already-saved trip log for the vehicle's most recent route,
  // regardless of which workflow recorded it. This is display-only.
  const latestTrips = db.prepare(`
    SELECT car_id, date, loading_region, unloading_region, destination
    FROM (
      SELECT car_id, date, loading_region, unloading_region, destination,
             ROW_NUMBER() OVER (PARTITION BY TRIM(car_id) ORDER BY date DESC, id DESC) AS position
      FROM trips
      WHERE car_id IS NOT NULL AND TRIM(car_id) != ''
    )
    WHERE position = 1
  `).all() as {
    car_id: string;
    date: string;
    loading_region: string | null;
    unloading_region: string | null;
    destination: string | null;
  }[];
  const lastTripByPlate = new Map(latestTrips.map(trip => [trip.car_id.trim(), trip]));

  // Build set of plates that have a real active workflow order
  const activePlates = new Set<string>(
    (db.prepare(`
      SELECT DISTINCT vehicle_plate FROM workflow_orders
      WHERE stage IN ('vehicle_assigned','invoiced','loaded','bulker_assignment')
        AND vehicle_plate IS NOT NULL AND vehicle_plate != ''
    `).all() as { vehicle_plate: string }[]).map(r => r.vehicle_plate)
  );

  // Also include plates with pending bulker loading orders (loading_orders table)
  (db.prepare(`
    SELECT DISTINCT vehicle_plate FROM loading_orders
    WHERE status = 'pending' AND vehicle_plate IS NOT NULL AND vehicle_plate != ''
  `).all() as { vehicle_plate: string }[]).forEach(r => activePlates.add(r.vehicle_plate));

  // Routing assignments are shown in the "new routing" vehicle picker without
  // changing historical vehicle/profile status or any saved trip.
  const routingAssignments = db.prepare(`
    SELECT t.vehicle_plate, t.status AS trip_status, d.tariff_id,
           d.loading_place, d.unloading_place, d.tariff_loading_place,
           d.tariff_unloading_place, d.driver_expense, d.rental,
           COALESCE(NULLIF(sr.cargo_type,''), d.cargo_type) AS cargo_type
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id=t.supply_request_id
    JOIN routing_dispatches d ON d.id=sr.routing_dispatch_id
    WHERE t.status IN ('assigned','in_transit','loaded','delivered_to_warehouse','pending_warehouse_approval')
      AND t.vehicle_plate IS NOT NULL AND TRIM(t.vehicle_plate) != ''
    ORDER BY t.id DESC
  `).all() as {
    vehicle_plate: string; trip_status: string; tariff_id: number | null;
    loading_place: string | null; unloading_place: string | null;
    tariff_loading_place: string | null; tariff_unloading_place: string | null;
    driver_expense: number; rental: number; cargo_type: string | null;
  }[];
  const activeRoutingByPlate = new Map<string, (typeof routingAssignments)[number]>();
  for (const assignment of routingAssignments) {
    const plate = assignment.vehicle_plate.trim();
    if (!activeRoutingByPlate.has(plate)) activeRoutingByPlate.set(plate, assignment);
  }

  const STATUS_MAP: Record<string, string> = { "نشط": "available", "في رحلة": "busy", "إجازة": "maintenance", "موقوف": "broken" };
  res.json(rows.map(d => ({
    id: d.id,
    plate_number: d.vehicle_plate,
    vehicle_type: d.branch || "نقليات",
    status: (() => {
      const mapped = STATUS_MAP[d.status as string] ?? "available";
      // If profile says "busy" but no active order/loading exists → treat as available
      if (mapped === "busy" && !activePlates.has(String(d.vehicle_plate))) return "available";
      // If vehicle has an active order or loading order → treat as busy
      if (activePlates.has(String(d.vehicle_plate)) && mapped === "available") return "busy";
      return mapped;
    })(),
    driver_name: d.driver_name,
    driver_phone: d.phone,
    branch: d.fleet_branch ?? null,
    linked_user_id: d.linked_user_id ?? null,
    linked_user_name: d.linked_user_name ?? null,
    linked_user_phone: d.linked_user_phone ?? null,
    capacity: null,
    notes: d.notes,
    gps_device_id: d.gps_device_id ?? null,
    last_delivery_location: d.last_delivery_location ?? null,
    last_delivery_date:     d.last_delivery_date     ?? null,
    last_trip_loading_place: lastTripByPlate.get(String(d.vehicle_plate).trim())?.loading_region?.trim() || null,
    last_trip_unloading_place: (() => {
      const trip = lastTripByPlate.get(String(d.vehicle_plate).trim());
      return trip?.unloading_region?.trim() || trip?.destination?.trim() || null;
    })(),
    last_trip_date: lastTripByPlate.get(String(d.vehicle_plate).trim())?.date ?? null,
    active_routing: activeRoutingByPlate.get(String(d.vehicle_plate).trim()) ?? null,
  })));
});

// ── Bulker supervisor: assign bulker vehicle to سائب order ───────────────────
router.put("/workflow/orders/:id/assign-bulker", (req, res) => {
  const { vehicle_plate, driver_name, driver_phone, assigned_by } = req.body as Record<string, string>;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage !== "bulker_assignment") return void res.status(400).json({ error: "الطلب ليس في مرحلة تعيين البلاكر" });
  if (!vehicle_plate) return void res.status(400).json({ error: "رقم اللوحة مطلوب" });

  db.prepare(`
    UPDATE workflow_orders SET
      stage = 'fsohat_pending',
      vehicle_plate = ?,
      driver_name = ?,
      driver_phone = ?,
      vehicle_assigned_at = datetime('now'),
      vehicle_assigned_by = ?
    WHERE id = ?
  `).run(vehicle_plate, driver_name || null, driver_phone || null, assigned_by || null, req.params.id);

  // Notify fsohat users
  const fsohatUsers = db.prepare("SELECT phone FROM users WHERE role IN ('fsohat','admin') AND active=1").all() as { phone: string }[];
  fsohatUsers.forEach(u => notify(u.phone, "طلبية سائب جاهزة للفسحة", `طلب ${order.order_number} (${order.product_name}) — تم تعيين بلاكر ${vehicle_plate} — جاهز لإصدار الفسحة`));

  // Notify customer
  notify(order.customer_phone as string, "تم تعيين سيارة لطلبك", `تم تعيين سيارة بلاكر (${vehicle_plate}) لطلبك رقم ${order.order_number}`);

  res.json({ message: "تم تعيين البلاكر وإحالة الطلب لمسؤول الفسوحات" });
});

// ── Admin: edit order (admin override) ───────────────────────────────────────
router.put("/workflow/orders/:id/admin-edit", (req, res) => {
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  const { customer_name, product_name, quantity, unit_price, delivery_location, stage, cancel_reason } =
    req.body as Record<string, unknown>;

  const qty   = quantity   ? Number(quantity)   : (order.quantity   as number);
  const price = unit_price ? Number(unit_price) : (order.unit_price as number);
  const totalBeforeVat = qty * price;
  const vatAmount      = totalBeforeVat * 0.15;
  const totalWithVat   = totalBeforeVat + vatAmount;

  db.prepare(`
    UPDATE workflow_orders SET
      customer_name    = COALESCE(?, customer_name),
      product_name     = COALESCE(?, product_name),
      quantity         = ?,
      unit_price       = ?,
      total_before_vat = ?,
      vat_amount       = ?,
      total_with_vat   = ?,
      delivery_location = COALESCE(?, delivery_location),
      stage            = COALESCE(?, stage),
      cancel_reason    = COALESCE(?, cancel_reason)
    WHERE id = ?
  `).run(
    customer_name || null,
    product_name  || null,
    qty, price,
    totalBeforeVat, vatAmount, totalWithVat,
    delivery_location || null,
    stage        || null,
    cancel_reason || null,
    req.params.id,
  );
  res.json({ ok: true });
});

// ── Customer: delete own pending order ───────────────────────────────────────
router.delete("/portal/orders/:id", (req, res) => {
  const { phone } = req.query as { phone?: string };
  if (!phone) return void res.status(400).json({ error: "phone مطلوب" });

  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.customer_phone !== phone) return void res.status(403).json({ error: "غير مصرح" });
  if (order.stage !== "pending") return void res.status(400).json({ error: "لا يمكن حذف الطلب بعد بدء المعالجة" });

  db.prepare("DELETE FROM workflow_orders WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── Admin: delete order ───────────────────────────────────────────────────────
router.delete("/workflow/orders/:id", (req, res) => {
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  if (order.vehicle_plate) {
    try { db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(order.vehicle_plate); } catch {}
    try { db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(order.vehicle_plate); } catch {}
  }

  db.prepare("DELETE FROM workflow_orders WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
