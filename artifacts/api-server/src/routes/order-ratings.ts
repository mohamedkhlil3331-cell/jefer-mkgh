import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// ── Submit 360-degree order rating ────────────────────────────────
router.post("/order-ratings", (req, res) => {
  const {
    order_id, customer_phone,
    product_rating, product_comment,
    driver_rating, driver_comment, driver_name,
    rep_rating, rep_comment, rep_name,
    warehouse_rating, warehouse_comment,
    company_rating, company_comment,
  } = req.body;

  if (!order_id || !customer_phone) return void res.status(400).json({ error: "البيانات غير مكتملة" });

  const order = db.prepare("SELECT * FROM workflow_orders WHERE id=?").get(order_id) as Record<string,unknown>|undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage !== "delivered") return void res.status(400).json({ error: "التقييم متاح فقط للطلبات المسلّمة" });

  // Upsert — one rating per order
  const existing = db.prepare("SELECT id FROM order_ratings WHERE order_id=?").get(order_id);
  if (existing) {
    db.prepare(`
      UPDATE order_ratings SET
        product_rating=?,product_comment=?,driver_rating=?,driver_comment=?,driver_name=?,
        rep_rating=?,rep_comment=?,rep_name=?,warehouse_rating=?,warehouse_comment=?,
        company_rating=?,company_comment=?,created_at=datetime('now')
      WHERE order_id=?
    `).run(
      product_rating||null, product_comment||null,
      driver_rating||null, driver_comment||null, driver_name||null,
      rep_rating||null, rep_comment||null, rep_name||null,
      warehouse_rating||null, warehouse_comment||null,
      company_rating||null, company_comment||null,
      order_id
    );
  } else {
    db.prepare(`
      INSERT INTO order_ratings
        (order_id,order_number,customer_phone,product_rating,product_comment,driver_rating,driver_comment,driver_name,
         rep_rating,rep_comment,rep_name,warehouse_rating,warehouse_comment,company_rating,company_comment)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      order_id, order.order_number as string, customer_phone,
      product_rating||null, product_comment||null,
      driver_rating||null, driver_comment||null, driver_name||null,
      rep_rating||null, rep_comment||null, rep_name||null,
      warehouse_rating||null, warehouse_comment||null,
      company_rating||null, company_comment||null
    );
  }

  res.status(201).json({ message: "تم إرسال التقييم، شكراً!" });
});

// ── Get rating for a specific order ──────────────────────────────
router.get("/order-ratings/by-order/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM order_ratings WHERE order_id=?").get(req.params.id);
  res.json(r || null);
});

// ── Admin: rating stats (top performers + averages) ───────────────
router.get("/order-ratings/stats", (_req, res) => {
  const totals = db.prepare(`
    SELECT
      ROUND(AVG(product_rating),2)   as avg_product,
      ROUND(AVG(driver_rating),2)    as avg_driver,
      ROUND(AVG(rep_rating),2)       as avg_rep,
      ROUND(AVG(warehouse_rating),2) as avg_warehouse,
      ROUND(AVG(company_rating),2)   as avg_company,
      COUNT(*) as total_ratings
    FROM order_ratings
  `).get();

  const topDrivers = db.prepare(`
    SELECT driver_name, ROUND(AVG(driver_rating),2) as avg, COUNT(*) as count
    FROM order_ratings WHERE driver_name IS NOT NULL AND driver_rating IS NOT NULL
    GROUP BY driver_name ORDER BY avg DESC LIMIT 10
  `).all();

  const topReps = db.prepare(`
    SELECT rep_name, ROUND(AVG(rep_rating),2) as avg, COUNT(*) as count
    FROM order_ratings WHERE rep_name IS NOT NULL AND rep_rating IS NOT NULL
    GROUP BY rep_name ORDER BY avg DESC LIMIT 10
  `).all();

  const recent = db.prepare(`
    SELECT r.*, wo.order_number, wo.customer_name
    FROM order_ratings r
    LEFT JOIN workflow_orders wo ON wo.id = r.order_id
    ORDER BY r.created_at DESC LIMIT 20
  `).all();

  res.json({ totals, topDrivers, topReps, recent });
});

// ── Customer: their own rating history ───────────────────────────
router.get("/order-ratings/customer/:phone", (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, wo.order_number, wo.product_name, wo.delivery_location
    FROM order_ratings r
    LEFT JOIN workflow_orders wo ON wo.id = r.order_id
    WHERE r.customer_phone=? ORDER BY r.created_at DESC
  `).all(req.params.phone);
  res.json(rows);
});

// ── Check if order already rated ──────────────────────────────────
router.get("/order-ratings/check/:order_id", (req, res) => {
  const r = db.prepare("SELECT id FROM order_ratings WHERE order_id=?").get(req.params.order_id);
  res.json({ rated: !!r });
});

// ── System logs (admin audit trail) ──────────────────────────────
router.get("/system-logs", (req, res) => {
  const { phone, role, action, entity_type, limit: lim, q } = req.query as Record<string,string>;
  let sql = "SELECT * FROM system_logs WHERE 1=1";
  const params: string[] = [];
  if (phone)       { sql += " AND user_phone=?";   params.push(phone); }
  if (role)        { sql += " AND user_role=?";    params.push(role); }
  if (action)      { sql += " AND action LIKE ?";  params.push(`%${action}%`); }
  if (entity_type) { sql += " AND entity_type=?";  params.push(entity_type); }
  if (q)           { sql += " AND (details LIKE ? OR user_name LIKE ? OR action LIKE ?)"; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += ` ORDER BY created_at DESC LIMIT ${parseInt(lim)||200}`;
  res.json(db.prepare(sql).all(...params));
});

router.post("/system-logs", (req, res) => {
  const { user_phone, user_name, user_role, action, entity_type, entity_id, details } = req.body;
  db.prepare(`
    INSERT INTO system_logs (user_phone,user_name,user_role,action,entity_type,entity_id,details)
    VALUES (?,?,?,?,?,?,?)
  `).run(user_phone||null, user_name||null, user_role||null, action||"action", entity_type||null, entity_id||null, details||null);
  res.status(201).json({ ok: true });
});

export default router;
