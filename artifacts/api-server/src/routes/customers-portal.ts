import { Router } from "express";
import multer from "multer";
import path from "path";
import db, { UPLOADS_PATH } from "../lib/db.js";

const router = Router();
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-transfer${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Customer list ──────────────────────────────────────────────────────────
router.get("/portal/customers", (_req, res) => {
  const customers = db.prepare(
    "SELECT id,name,phone,company_name,vat_number,cr_number,created_at FROM users WHERE role='customer' AND active=1 ORDER BY name"
  ).all();
  res.json(customers);
});

// ── Customer account statement ─────────────────────────────────────────────
router.get("/portal/customers/:phone/statement", (req, res) => {
  const { phone } = req.params;

  const customer = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as Record<string, unknown> | undefined;
  const orders = db.prepare(
    "SELECT * FROM workflow_orders WHERE customer_phone = ? ORDER BY created_at DESC"
  ).all(phone) as Record<string, unknown>[];
  const transfers = db.prepare(
    "SELECT * FROM customer_transfers WHERE customer_phone = ? ORDER BY created_at DESC"
  ).all(phone) as Record<string, unknown>[];

  const totalOrders = orders.reduce((s, o) => s + ((o.total_with_vat as number)||0), 0);
  const totalTransfers = transfers.filter(t => t.confirmed).reduce((s, t) => s + ((t.amount as number)||0), 0);
  const balance = totalTransfers - totalOrders; // positive = credit, negative = debt

  res.json({
    customer,
    orders,
    transfers,
    summary: {
      total_orders: parseFloat(totalOrders.toFixed(2)),
      total_transfers: parseFloat(totalTransfers.toFixed(2)),
      balance: parseFloat(balance.toFixed(2)),
    }
  });
});

// ── VAT invoice for a specific order ──────────────────────────────────────
router.get("/portal/customers/:phone/orders/:orderId/vat-invoice", (req, res) => {
  const { phone, orderId } = req.params;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id = ? AND customer_phone = ?").get(orderId, phone) as Record<string, unknown> | undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });

  const customer = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as Record<string, unknown> | undefined;
  const company = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get() as Record<string, unknown> | undefined;

  res.json({
    invoice_number: order.invoice_number || `INV-${order.order_number}`,
    invoice_date: order.invoice_date || order.created_at,
    order_number: order.order_number,
    seller: {
      name: company?.company_name || "شركة MKGH",
      vat_number: company?.vat_number || "310000000000003",
      address: "المملكة العربية السعودية",
    },
    buyer: {
      name: customer?.name || order.customer_name,
      phone: phone,
      company_name: customer?.company_name || null,
      vat_number: customer?.vat_number || null,
      cr_number: customer?.cr_number || null,
    },
    items: [{
      description: order.product_name,
      quantity: order.quantity,
      unit: order.unit,
      unit_price: order.unit_price,
      total: order.total_before_vat,
    }],
    total_before_vat: order.total_before_vat,
    vat_rate: 15,
    vat_amount: order.vat_amount,
    total_with_vat: order.total_with_vat,
    delivery_location: order.delivery_location,
    payment_ref: order.payment_transfer_ref,
  });
});

// ── Transfers ─────────────────────────────────────────────────────────────
router.get("/portal/transfers", (req, res) => {
  const { phone, role } = req.query as Record<string, string>;
  let sql = "SELECT * FROM customer_transfers WHERE 1=1";
  const params: string[] = [];
  if (role === "customer") { sql += " AND customer_phone = ?"; params.push(phone); }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/portal/transfers", upload.single("transfer_image"), (req, res) => {
  const { customer_phone, customer_name, amount, transfer_date, transfer_ref, bank_name, notes } = req.body;
  if (!customer_phone || !amount) return void res.status(400).json({ error: "البيانات ناقصة" });
  const imageUrl = req.file ? `/api/uploads/${req.file.filename}` : null;

  const result = db.prepare(`
    INSERT INTO customer_transfers
      (customer_phone, customer_name, amount, transfer_date, transfer_ref, bank_name, transfer_image, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(customer_phone, customer_name||null, parseFloat(amount), transfer_date||new Date().toISOString().slice(0,10), transfer_ref||null, bank_name||null, imageUrl, notes||null);

  // Notify reviewers
  const reviewers = db.prepare("SELECT phone FROM users WHERE role = 'reviewer' AND active = 1").all() as {phone: string}[];
  reviewers.forEach(r => db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)").run(r.phone, "تحويل جديد", `تحويل من ${customer_name||customer_phone} بمبلغ ${amount} ر.س`));

  res.status(201).json({ id: result.lastInsertRowid, message: "تم تسجيل التحويل" });
});

router.put("/portal/transfers/:id/confirm", (req, res) => {
  const { reviewer_phone } = req.body;
  const reviewer = db.prepare("SELECT name FROM users WHERE phone = ?").get(reviewer_phone) as {name:string} | undefined;
  db.prepare("UPDATE customer_transfers SET confirmed=1, confirmed_by=?, confirmed_date=datetime('now') WHERE id=?")
    .run(reviewer?.name || reviewer_phone, req.params.id);
  res.json({ message: "تم تأكيد التحويل" });
});

router.delete("/portal/transfers/:id", (req, res) => {
  db.prepare("DELETE FROM customer_transfers WHERE id = ?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
