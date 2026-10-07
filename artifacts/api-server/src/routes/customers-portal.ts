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
  const entityId = (order.company_entity_id as number | undefined) || 1;
  const company  = (db.prepare("SELECT * FROM company_settings WHERE id=? AND active=1").get(entityId)
    || db.prepare("SELECT * FROM company_settings WHERE active=1 ORDER BY id LIMIT 1").get()) as Record<string, unknown> | undefined;

  const invoiceNo    = (order.invoice_number as string) || `INV-${order.order_number}`;
  const invoiceDate  = new Date((order.invoice_date as string) || (order.created_at as string)).toLocaleDateString("ar-SA");
  const vatNumber    = (company?.vat_number as string) || "310000000000003";
  const sellerName   = (company?.company_name as string) || "شركة جيفر التجارية";
  const beforeVat    = Number(order.total_before_vat  || 0).toFixed(2);
  const vatAmt       = Number(order.vat_amount        || 0).toFixed(2);
  const withVat      = Number(order.total_with_vat    || 0).toFixed(2);

  const barcodeHtml = String(order.order_number).split("").map((c, i) => {
    const h = 15 + (c.charCodeAt(0) % 20);
    const w = i % 3 === 0 ? 3 : i % 3 === 1 ? 1 : 2;
    return `<div style="width:${w}px;height:${h}px;background:#1a1a1a;border-radius:1px;display:inline-block"></div>`;
  }).join("");

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>فاتورة ضريبية — ${invoiceNo}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;padding:0}
  .page{max-width:600px;margin:0 auto;padding:32px 28px}
  .header{text-align:center;border-bottom:3px solid #103c68;padding-bottom:20px;margin-bottom:20px}
  .logo{height:70px;object-fit:contain;display:block;margin:0 auto 10px}
  .company{font-size:18px;font-weight:900;color:#103c68}
  .vat-num{font-size:11px;color:#666;margin-top:3px}
  .invoice-title{display:inline-block;background:#103c68;color:#fff;padding:5px 20px;border-radius:20px;font-size:13px;font-weight:700;margin-top:8px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .party{background:#f7f8fb;border:1px solid #e0e6f0;border-radius:10px;padding:12px 14px}
  .party-label{font-size:9px;font-weight:700;color:#103c68;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
  .party-name{font-size:13px;font-weight:700;color:#111;margin-bottom:2px}
  .party-sub{font-size:11px;color:#666}
  .meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px}
  .meta-item{background:#f0f5fb;border-radius:8px;padding:10px}
  .meta-lbl{font-size:9px;color:#999;margin-bottom:2px}
  .meta-val{font-size:12px;font-weight:700;color:#222;font-family:monospace}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px}
  th{background:#103c68;color:#fff;padding:9px 10px;text-align:right;font-weight:600}
  td{padding:9px 10px;border-bottom:1px solid #f0f0f0}
  .subtotal{background:#fafafa}
  .total-row td{background:#f0f5fb;font-weight:900;font-size:14px;color:#103c68;padding:12px 10px}
  .barcode{text-align:center;margin:16px 0;padding:12px;border:1.5px dashed #ccc;border-radius:10px}
  .barcode-num{font-family:monospace;font-size:10px;color:#888;letter-spacing:1px;margin-top:4px}
  .footer{text-align:center;font-size:9px;color:#aaa;border-top:1px dashed #e0e0e0;padding-top:12px;margin-top:12px;line-height:1.6}
  .wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.06;width:65%;pointer-events:none;z-index:-1}
  @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}@page{size:A4;margin:1.5cm}}
</style>
</head>
<body>
<img class="wm" src="/logo.png" alt="" />
<div class="page">
  <div class="header">
    <img class="logo" src="/jefer-logo-new.png" alt="JEFER"/>
    <div class="company">${sellerName}</div>
    <div class="vat-num">الرقم الضريبي: ${vatNumber}</div>
    <div class="invoice-title">فاتورة ضريبية</div>
  </div>

  <div class="meta">
    <div class="meta-item"><div class="meta-lbl">رقم الفاتورة</div><div class="meta-val">${invoiceNo}</div></div>
    <div class="meta-item"><div class="meta-lbl">رقم الطلب</div><div class="meta-val">${order.order_number}</div></div>
    <div class="meta-item"><div class="meta-lbl">تاريخ الإصدار</div><div class="meta-val">${invoiceDate}</div></div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">المورد</div>
      <div class="party-name">${sellerName}</div>
      <div class="party-sub">الرقم الضريبي: ${vatNumber}</div>
      <div class="party-sub">المملكة العربية السعودية</div>
    </div>
    <div class="party">
      <div class="party-label">العميل</div>
      <div class="party-name">${(customer?.name as string) || (order.customer_name as string) || "—"}</div>
      <div class="party-sub">هاتف: ${phone}</div>
      ${(customer?.vat_number as string) ? `<div class="party-sub">الرقم الضريبي: ${customer?.vat_number}</div>` : ""}
    </div>
  </div>

  <table>
    <thead><tr><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
    <tbody>
      <tr><td>${order.product_name}</td><td>${order.quantity} ${order.unit}</td><td>${Number(order.unit_price||0).toFixed(2)} ر.س</td><td>${beforeVat} ر.س</td></tr>
      <tr class="subtotal"><td colspan="3" style="color:#888">ضريبة القيمة المضافة (15%)</td><td style="font-weight:700">${vatAmt} ر.س</td></tr>
    </tbody>
    <tfoot><tr class="total-row"><td colspan="3">الإجمالي شامل الضريبة</td><td>${withVat} ر.س</td></tr></tfoot>
  </table>

  ${(order.delivery_location as string) ? `<div style="background:#f7f8fb;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px"><strong>موقع التسليم:</strong> ${order.delivery_location}</div>` : ""}

  <div class="barcode">
    <div style="display:flex;align-items:flex-end;justify-content:center;gap:1px;height:40px;margin-bottom:4px">${barcodeHtml}</div>
    <div class="barcode-num">${order.order_number}</div>
  </div>

  <div class="footer">
    هذه الفاتورة صادرة إلكترونياً وسارية المفعول · ضريبة القيمة المضافة 15% · المملكة العربية السعودية<br/>
    تاريخ الطباعة: ${new Date().toLocaleString("ar-SA")}
  </div>
</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ── Statement print (HTML) ────────────────────────────────────────────────
router.get("/portal/customers/:phone/statement/print", (req, res) => {
  const { phone } = req.params;
  const customer  = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as Record<string, unknown> | undefined;
  const orders    = db.prepare("SELECT * FROM workflow_orders WHERE customer_phone = ? ORDER BY created_at DESC").all(phone) as Record<string, unknown>[];
  const transfers = db.prepare("SELECT * FROM customer_transfers WHERE customer_phone = ? ORDER BY created_at DESC").all(phone) as Record<string, unknown>[];

  const totalOrders    = orders.reduce((s, o) => s + (Number(o.total_with_vat) || 0), 0);
  const totalTransfers = transfers.filter(t => t.confirmed).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const balance        = totalTransfers - totalOrders;
  const balanceColor   = balance >= 0 ? "#16a34a" : "#dc2626";
  const balanceLabel   = balance >= 0 ? "رصيد دائن" : "رصيد مدين";

  const ordersRows = orders.map(o => `
    <tr>
      <td style="font-family:monospace;font-size:11px">${o.order_number}</td>
      <td>${String(o.created_at || "").slice(0, 10)}</td>
      <td>${o.product_name}</td>
      <td>${o.stage}</td>
      <td style="font-weight:700;text-align:left">${Number(o.total_with_vat || 0).toFixed(2)} ر.س</td>
    </tr>`).join("");

  const transferRows = transfers.map(t => `
    <tr>
      <td>${String(t.transfer_date || t.created_at || "").slice(0, 10)}</td>
      <td>${t.bank_name || "—"}</td>
      <td style="font-family:monospace">${t.transfer_ref || "—"}</td>
      <td style="color:${t.confirmed ? "#16a34a" : "#d97706"}">${t.confirmed ? "مؤكد ✓" : "قيد المراجعة"}</td>
      <td style="font-weight:700;color:#16a34a;text-align:left">${Number(t.amount || 0).toFixed(2)} ر.س</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>كشف حساب — ${(customer?.name as string) || phone}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;padding:0;font-size:12px}
  .page{max-width:800px;margin:0 auto;padding:28px}
  .header{text-align:center;border-bottom:3px solid #103c68;padding-bottom:18px;margin-bottom:18px}
  .logo{height:65px;object-fit:contain;display:block;margin:0 auto 10px}
  .company{font-size:17px;font-weight:900;color:#103c68}
  .doc-title{display:inline-block;background:#103c68;color:#fff;padding:4px 18px;border-radius:20px;font-size:12px;font-weight:700;margin-top:7px}
  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
  .sum-card{border-radius:10px;padding:12px 14px;text-align:center;border:1px solid #e0e6f0}
  .sum-lbl{font-size:9px;color:#888;margin-bottom:4px}
  .sum-val{font-size:16px;font-weight:900}
  .section-title{font-size:12px;font-weight:900;color:#103c68;margin:18px 0 8px;padding-bottom:5px;border-bottom:2px solid #103c68}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
  th{background:#103c68;color:#fff;padding:7px 9px;text-align:right;font-weight:600}
  td{padding:7px 9px;border-bottom:1px solid #f0f0f0}
  tr:nth-child(even) td{background:#f9fafb}
  .footer{text-align:center;font-size:9px;color:#aaa;border-top:1px dashed #e0e0e0;padding-top:10px;margin-top:16px}
  .wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.06;width:65%;pointer-events:none;z-index:-1}
  @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}@page{size:A4;margin:1.5cm}}
</style></head>
<body>
<img class="wm" src="/logo.png" alt="" />
<div class="page">
  <div class="header">
    <img class="logo" src="/jefer-logo-new.png" alt="JEFER"/>
    <div class="company">شركة جيفر التجارية</div>
    <div class="doc-title">كشف حساب</div>
  </div>

  <div style="background:#f7f8fb;border:1px solid #e0e6f0;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12px">
    <strong>${(customer?.name as string) || "—"}</strong> &nbsp;|&nbsp;
    هاتف: ${phone} &nbsp;|&nbsp;
    تاريخ الإصدار: ${new Date().toLocaleDateString("ar-SA")}
  </div>

  <div class="summary">
    <div class="sum-card" style="background:#fff8f0;border-color:#fed7aa">
      <div class="sum-lbl">إجمالي الطلبات</div>
      <div class="sum-val" style="color:#ea580c">${totalOrders.toFixed(2)} ر.س</div>
    </div>
    <div class="sum-card" style="background:#f0fdf4;border-color:#bbf7d0">
      <div class="sum-lbl">إجمالي التحويلات</div>
      <div class="sum-val" style="color:#16a34a">${totalTransfers.toFixed(2)} ر.س</div>
    </div>
    <div class="sum-card" style="background:#f0f5fb;border-color:#bfdbfe">
      <div class="sum-lbl">${balanceLabel}</div>
      <div class="sum-val" style="color:${balanceColor}">${Math.abs(balance).toFixed(2)} ر.س</div>
    </div>
  </div>

  <div class="section-title">الطلبات (${orders.length})</div>
  <table>
    <thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>المنتج</th><th>الحالة</th><th>المبلغ</th></tr></thead>
    <tbody>${ordersRows || '<tr><td colspan="5" style="text-align:center;color:#aaa">لا توجد طلبات</td></tr>'}</tbody>
  </table>

  <div class="section-title">التحويلات البنكية (${transfers.length})</div>
  <table>
    <thead><tr><th>التاريخ</th><th>البنك</th><th>رقم التحويل</th><th>الحالة</th><th>المبلغ</th></tr></thead>
    <tbody>${transferRows || '<tr><td colspan="5" style="text-align:center;color:#aaa">لا توجد تحويلات</td></tr>'}</tbody>
  </table>

  <div class="footer">
    جيفر التجارية · المملكة العربية السعودية · تاريخ الطباعة: ${new Date().toLocaleString("ar-SA")}
  </div>
</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
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
  const { password, caller_phone } = req.body as Record<string, string>;
  if (password !== "mkgh") return void res.status(403).json({ error: "كلمة المرور غير صحيحة" });
  if (caller_phone) {
    const caller = db.prepare("SELECT role FROM users WHERE phone=? AND active=1").get(caller_phone) as { role: string } | undefined;
    if (!caller || !["reviewer", "admin"].includes(caller.role)) {
      return void res.status(403).json({ error: "غير مصرح لك بهذه العملية" });
    }
  }
  db.prepare("DELETE FROM customer_transfers WHERE id = ?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

router.get("/portal/fleet-vehicles", (_req, res) => {
  const vehicles = db.prepare(
    `SELECT id, plate_number, vehicle_type, vehicle_subtype, vehicle_category,
            driver_name, status, load_capacity_tons, equipment_type, notes
     FROM fleet_vehicles ORDER BY vehicle_type, plate_number`
  ).all();
  res.json(vehicles);
});

router.get("/portal/rental-location-presets", (_req, res) => {
  const warehouses = db.prepare(
    "SELECT name, location, lat, lng FROM warehouses WHERE active=1 AND lat IS NOT NULL ORDER BY id"
  ).all() as { name: string; location: string; lat: number; lng: number }[];

  const topPickups = db.prepare(`
    SELECT pickup_location AS loc, pickup_lat AS lat, pickup_lng AS lng, COUNT(*) AS cnt
    FROM external_rentals
    WHERE pickup_location IS NOT NULL AND TRIM(pickup_location)!='' AND pickup_lat IS NOT NULL
    GROUP BY pickup_location ORDER BY cnt DESC LIMIT 8
  `).all() as { loc: string; lat: number; lng: number }[];

  const topDests = db.prepare(`
    SELECT destination_location AS loc, destination_lat AS lat, destination_lng AS lng, COUNT(*) AS cnt
    FROM external_rentals
    WHERE destination_location IS NOT NULL AND TRIM(destination_location)!='' AND destination_lat IS NOT NULL
    GROUP BY destination_location ORDER BY cnt DESC LIMIT 8
  `).all() as { loc: string; lat: number; lng: number }[];

  const seen = new Set<string>();
  const pickups: { label: string; location: string; lat: number; lng: number }[] = [];

  for (const w of warehouses) {
    const key = `${w.lat.toFixed(3)},${w.lng.toFixed(3)}`;
    if (!seen.has(key)) { seen.add(key); pickups.push({ label: w.name, location: w.location || w.name, lat: w.lat, lng: w.lng }); }
  }
  for (const p of topPickups) {
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
    if (!seen.has(key)) { seen.add(key); pickups.push({ label: p.loc.split(",")[0].trim(), location: p.loc, lat: p.lat, lng: p.lng }); }
  }

  const destinations = topDests.map(d => ({
    label: d.loc.split(",")[0].trim(),
    location: d.loc,
    lat: d.lat,
    lng: d.lng,
  }));

  res.json({ pickups: pickups.slice(0, 6), destinations: destinations.slice(0, 6) });
});

router.get("/portal/resolve-maps-url", async (req, res) => {
  const { url } = req.query as { url?: string };
  if (!url) return void res.status(400).json({ error: "url required" });
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(6000) });
    const finalUrl = r.url;
    const patterns = [
      /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
    ];
    for (const p of patterns) {
      const m = finalUrl.match(p);
      if (m) return void res.json({ lat: parseFloat(m[1]), lng: parseFloat(m[2]), url: finalUrl });
    }
    res.json({ url: finalUrl });
  } catch { res.status(500).json({ error: "failed to resolve" }); }
});

router.get("/portal/supervisor-contact", (_req, res) => {
  const entry = db
    .prepare("SELECT label AS name, phone FROM contact_entries WHERE active=1 ORDER BY sort_order, id LIMIT 1")
    .get() as { name: string; phone: string } | undefined;
  if (entry) return void res.json(entry);
  const supervisor = db
    .prepare("SELECT name, phone FROM users WHERE role='supervisor' AND active=1 ORDER BY id LIMIT 1")
    .get() as { name: string; phone: string } | undefined;
  if (!supervisor) return void res.status(404).json({ error: "لا يوجد مشرف" });
  res.json({ name: supervisor.name, phone: supervisor.phone });
});

router.get("/portal/contact-entries", (_req, res) => {
  const entries = db
    .prepare("SELECT id, label, phone, has_whatsapp FROM contact_entries WHERE active=1 ORDER BY sort_order, id")
    .all();
  res.json(entries);
});

// ── Site CMS public reads ─────────────────────────────────────────────────────

router.get("/portal/site-content", (_req, res) => {
  const rows = db.prepare("SELECT key, value FROM site_content").all() as { key: string; value: string }[];
  const obj: Record<string, string> = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

router.get("/portal/site-services", (_req, res) => {
  res.json(db.prepare("SELECT id, icon, label, sub FROM site_services WHERE active=1 ORDER BY sort_order, id").all());
});

router.get("/portal/site-emails", (_req, res) => {
  res.json(db.prepare("SELECT id, label, email FROM site_emails WHERE active=1 ORDER BY sort_order, id").all());
});

router.get("/portal/business-card", (_req, res) => {
  const rows = db.prepare("SELECT key, value FROM business_card_info").all() as { key: string; value: string }[];
  const obj: Record<string, string> = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

export default router;
