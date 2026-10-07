import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// ── Rep Dashboard Stats ───────────────────────────────────────────────────────
router.get("/rep/stats", (req, res) => {
  const { rep_phone } = req.query as Record<string, string>;
  if (!rep_phone) return void res.status(400).json({ error: "rep_phone مطلوب" });

  const rep = db.prepare("SELECT id FROM users WHERE phone = ? AND role = 'rep'").get(rep_phone) as { id: number } | undefined;
  if (!rep) return void res.status(404).json({ error: "المندوب غير موجود" });

  const orderStats = db.prepare(`
    SELECT
      COUNT(*)                                                              AS total_orders,
      COUNT(CASE WHEN stage NOT IN ('cancelled') THEN 1 END)               AS active_orders,
      COUNT(CASE WHEN stage = 'delivered' THEN 1 END)                      AS delivered_orders,
      COALESCE(SUM(CASE WHEN stage != 'cancelled' THEN total_with_vat END),0) AS total_revenue,
      COALESCE(SUM(CASE WHEN stage != 'cancelled' THEN quantity END),0)       AS total_qty
    FROM workflow_orders WHERE rep_id = ?
  `).get(rep.id) as Record<string, number>;

  const clientCount = (db.prepare(
    "SELECT COUNT(*) AS c FROM client_rep_links WHERE rep_phone = ? AND link_status = 'active'"
  ).get(rep_phone) as { c: number }).c;

  const pendingCount = (db.prepare(
    "SELECT COUNT(*) AS c FROM client_rep_links WHERE rep_phone = ? AND link_status = 'pending_rep_approval'"
  ).get(rep_phone) as { c: number }).c;

  const categoryStats = db.prepare(`
    SELECT
      COALESCE(p.category, 'أخرى') AS category,
      COUNT(*)                      AS order_count,
      COALESCE(SUM(wo.quantity),0)                                             AS total_qty,
      COALESCE(SUM(CASE WHEN wo.stage != 'cancelled' THEN wo.total_with_vat END),0) AS total_revenue
    FROM workflow_orders wo
    LEFT JOIN products p ON wo.product_id = p.id
    WHERE wo.rep_id = ?
    GROUP BY COALESCE(p.category, 'أخرى')
    ORDER BY total_revenue DESC
  `).all(rep.id);

  res.json({ ...orderStats, client_count: clientCount, pending_count: pendingCount, category_stats: categoryStats });
});

// ── Rep Clients (isolated — only this rep's approved clients) ─────────────────
router.get("/rep/clients", (req, res) => {
  const { rep_phone } = req.query as Record<string, string>;
  if (!rep_phone) return void res.status(400).json({ error: "rep_phone مطلوب" });

  const clients = db.prepare(`
    SELECT u.id, u.name, u.phone, u.company_name, u.vat_number, u.city, u.active,
      l.link_status, l.linked_at, l.approved_at,
      COUNT(DISTINCT wo.id)                                                              AS order_count,
      COALESCE(SUM(CASE WHEN wo.stage != 'cancelled' THEN wo.total_with_vat END), 0)   AS total_revenue,
      MAX(wo.created_at)                                                                 AS last_order_at
    FROM client_rep_links l
    JOIN users u ON u.phone = l.customer_phone
    LEFT JOIN workflow_orders wo ON wo.customer_phone = u.phone
    WHERE l.rep_phone = ? AND l.link_status = 'active'
    GROUP BY u.id
    ORDER BY last_order_at DESC, u.name
  `).all(rep_phone);

  res.json(clients);
});

// ── Client Account Statement ──────────────────────────────────────────────────
router.get("/rep/clients/:phone/statement", (req, res) => {
  const { rep_phone } = req.query as Record<string, string>;
  if (!rep_phone) return void res.status(400).json({ error: "rep_phone مطلوب" });

  const link = db.prepare(
    "SELECT id FROM client_rep_links WHERE customer_phone = ? AND rep_phone = ? AND link_status = 'active'"
  ).get(req.params.phone, rep_phone);
  if (!link) return void res.status(403).json({ error: "هذا العميل ليس ضمن قائمة عملائك" });

  const customer = db.prepare(
    "SELECT id,name,phone,company_name,vat_number,city,address FROM users WHERE phone = ?"
  ).get(req.params.phone);

  const orders = db.prepare(`
    SELECT id, order_number, product_name, quantity, unit, unit_price,
      total_before_vat, vat_amount, total_with_vat,
      stage, delivery_location, destination_type, payment_method,
      created_at, delivery_date
    FROM workflow_orders
    WHERE customer_phone = ?
    ORDER BY created_at DESC
  `).all(req.params.phone);

  const summary = db.prepare(`
    SELECT
      COUNT(*)                                                                    AS total_orders,
      COUNT(CASE WHEN stage = 'delivered' THEN 1 END)                            AS delivered,
      COUNT(CASE WHEN stage = 'cancelled' THEN 1 END)                            AS cancelled,
      COALESCE(SUM(CASE WHEN stage != 'cancelled' THEN total_with_vat END), 0)  AS total_revenue,
      COALESCE(SUM(CASE WHEN stage = 'delivered' THEN total_with_vat END),  0)  AS paid_revenue
    FROM workflow_orders WHERE customer_phone = ?
  `).get(req.params.phone);

  res.json({ customer, orders, summary });
});

// ── Pending Client Approvals ──────────────────────────────────────────────────
router.get("/rep/pending-clients", (req, res) => {
  const { rep_phone } = req.query as Record<string, string>;
  if (!rep_phone) return void res.status(400).json({ error: "rep_phone مطلوب" });

  const rows = db.prepare(`
    SELECT l.id AS link_id, l.customer_phone, l.linked_at,
      u.name, u.phone, u.company_name, u.vat_number, u.city,
      u.created_at AS registered_at
    FROM client_rep_links l
    JOIN users u ON u.phone = l.customer_phone
    WHERE l.rep_phone = ? AND l.link_status = 'pending_rep_approval'
    ORDER BY l.linked_at DESC
  `).all(rep_phone);

  res.json(rows);
});

// ── Approve / Reject Pending Client ──────────────────────────────────────────
router.put("/rep/pending-clients/:link_id/action", (req, res) => {
  const { action, rep_phone } = req.body as { action: string; rep_phone: string };
  if (!action || !rep_phone) return void res.status(400).json({ error: "البيانات ناقصة" });

  const link = db.prepare(
    "SELECT * FROM client_rep_links WHERE id = ? AND rep_phone = ?"
  ).get(req.params.link_id, rep_phone) as Record<string, unknown> | undefined;
  if (!link) return void res.status(404).json({ error: "الرابط غير موجود" });

  const newStatus = action === "approve" ? "active" : "rejected";
  db.prepare(
    "UPDATE client_rep_links SET link_status = ?, approved_at = datetime('now') WHERE id = ?"
  ).run(newStatus, req.params.link_id);

  try {
    db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)").run(
      link.customer_phone as string,
      action === "approve" ? "تم قبول طلبك" : "تم رفض طلبك",
      action === "approve"
        ? "تم قبولك ضمن قائمة عملاء المندوب، يمكنك الآن تقديم طلباتك"
        : "تم رفض ربطك بالمندوب، يرجى التواصل مع الإدارة"
    );
  } catch { /* ignore */ }

  res.json({ message: action === "approve" ? "تم قبول العميل" : "تم رفض العميل" });
});

// ── Link Customer to Rep (called by customer from profile or register) ────────
router.post("/rep/link-customer", (req, res) => {
  const { customer_phone, rep_phone } = req.body as { customer_phone: string; rep_phone: string };
  if (!customer_phone || !rep_phone) return void res.status(400).json({ error: "البيانات ناقصة" });

  const rep = db.prepare(
    "SELECT id,name FROM users WHERE phone = ? AND role = 'rep'"
  ).get(rep_phone) as { id: number; name: string } | undefined;
  if (!rep) return void res.status(404).json({ error: "المندوب غير موجود" });

  const customer = db.prepare(
    "SELECT id,name,created_at FROM users WHERE phone = ?"
  ).get(customer_phone) as { id: number; name: string; created_at: string } | undefined;
  if (!customer) return void res.status(404).json({ error: "العميل غير موجود" });

  // New customers (registered < 24h ago) need rep approval; existing = implicit
  const hoursSince = (Date.now() - new Date(customer.created_at).getTime()) / 3_600_000;
  const linkStatus = hoursSince < 24 ? "pending_rep_approval" : "active";
  const approvedAt = linkStatus === "active" ? new Date().toISOString() : null;

  try {
    const existing = db.prepare(
      "SELECT id,link_status FROM client_rep_links WHERE customer_phone = ? AND rep_phone = ?"
    ).get(customer_phone, rep_phone) as { id: number; link_status: string } | undefined;

    if (existing) {
      if (existing.link_status === "active") return void res.json({ message: "العميل مرتبط بك مسبقاً", link_status: "active" });
      db.prepare(
        "UPDATE client_rep_links SET link_status = ?, approved_at = ? WHERE id = ?"
      ).run(linkStatus, approvedAt, existing.id);
    } else {
      db.prepare(
        "INSERT INTO client_rep_links (customer_phone,rep_phone,link_status,approved_at) VALUES (?,?,?,?)"
      ).run(customer_phone, rep_phone, linkStatus, approvedAt);
    }

    if (linkStatus === "pending_rep_approval") {
      try {
        db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)").run(
          rep_phone,
          "طلب ارتباط عميل جديد",
          `يطلب ${customer.name} الانضمام لقائمة عملائك`
        );
      } catch { /* ignore */ }
    }

    res.json({
      message: linkStatus === "active" ? "تم الربط فوراً (موافقة ضمنية)" : "بانتظار موافقة المندوب",
      link_status: linkStatus,
    });
  } catch {
    res.status(500).json({ error: "خطأ في الربط" });
  }
});

// ── Customer: Get My Rep Link ─────────────────────────────────────────────────
router.get("/rep/my-link", (req, res) => {
  const { customer_phone } = req.query as Record<string, string>;
  if (!customer_phone) return void res.status(400).json({ error: "customer_phone مطلوب" });

  const link = db.prepare(`
    SELECT l.id, l.rep_phone, l.link_status, l.linked_at, l.approved_at,
      u.name AS rep_name
    FROM client_rep_links l
    JOIN users u ON u.phone = l.rep_phone
    WHERE l.customer_phone = ? AND l.link_status != 'rejected'
    ORDER BY l.linked_at DESC
    LIMIT 1
  `).get(customer_phone);

  res.json(link || null);
});

// ── Rep Targets + Bonus Progress ──────────────────────────────────────────────
router.get("/rep/targets", (req, res) => {
  const { rep_phone } = req.query as Record<string, string>;
  if (!rep_phone) return void res.status(400).json({ error: "rep_phone مطلوب" });

  const rep = db.prepare("SELECT id FROM users WHERE phone = ?").get(rep_phone) as { id: number } | undefined;
  if (!rep) return void res.status(404).json({ error: "المندوب غير موجود" });

  type Target = {
    id: number; rep_phone: string; product_category: string;
    target_qty: number; tier1_qty: number; tier1_bonus: number;
    tier2_qty: number; tier2_bonus: number; tier3_qty: number; tier3_bonus: number;
    period: string; start_date: string | null; end_date: string | null; active: number;
  };

  const targets = db.prepare(
    "SELECT * FROM rep_targets WHERE rep_phone = ? AND active = 1 ORDER BY product_category"
  ).all(rep_phone) as Target[];

  const result = targets.map(t => {
    const parts: unknown[] = [rep.id, t.product_category];
    let dateFilter = "";
    if (t.start_date) { dateFilter += " AND wo.created_at >= ?"; parts.push(t.start_date); }
    if (t.end_date)   { dateFilter += " AND wo.created_at <= ?"; parts.push(t.end_date); }

    const progress = db.prepare(`
      SELECT
        COALESCE(SUM(wo.quantity), 0)                                               AS achieved_qty,
        COALESCE(SUM(CASE WHEN wo.stage != 'cancelled' THEN wo.total_with_vat END),0) AS achieved_revenue
      FROM workflow_orders wo
      LEFT JOIN products p ON wo.product_id = p.id
      WHERE wo.rep_id = ? AND COALESCE(p.category, 'أخرى') = ?${dateFilter}
    `).get(...(parts as Parameters<typeof db.prepare>)) as { achieved_qty: number; achieved_revenue: number };

    const qty = progress.achieved_qty || 0;
    const pct = t.target_qty > 0 ? Math.min(100, Math.round((qty / t.target_qty) * 100)) : 0;

    let earnedBonus = 0;
    let earnedTier = 0;
    if (t.tier3_qty && qty >= t.tier3_qty) { earnedBonus = t.tier3_bonus; earnedTier = 3; }
    else if (t.tier2_qty && qty >= t.tier2_qty) { earnedBonus = t.tier2_bonus; earnedTier = 2; }
    else if (t.tier1_qty && qty >= t.tier1_qty) { earnedBonus = t.tier1_bonus; earnedTier = 1; }

    return { ...t, achieved_qty: qty, achieved_revenue: progress.achieved_revenue || 0, progress_pct: pct, earned_bonus: earnedBonus, earned_tier: earnedTier };
  });

  res.json(result);
});

// ── Admin: Rep Target CRUD ────────────────────────────────────────────────────
router.get("/admin/rep-targets", (_req, res) => {
  const rows = db.prepare(`
    SELECT t.*, u.name AS rep_name
    FROM rep_targets t
    LEFT JOIN users u ON u.phone = t.rep_phone
    ORDER BY u.name, t.product_category
  `).all();
  res.json(rows);
});

router.post("/admin/rep-targets", (req, res) => {
  const { rep_phone, product_category, target_qty, tier1_qty, tier1_bonus, tier2_qty, tier2_bonus, tier3_qty, tier3_bonus, period, start_date, end_date } = req.body;
  if (!rep_phone || !product_category) return void res.status(400).json({ error: "المندوب والفئة مطلوبان" });
  const r = db.prepare(`
    INSERT INTO rep_targets (rep_phone,product_category,target_qty,tier1_qty,tier1_bonus,tier2_qty,tier2_bonus,tier3_qty,tier3_bonus,period,start_date,end_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(rep_phone, product_category, parseFloat(target_qty) || 0, parseFloat(tier1_qty) || 0, parseFloat(tier1_bonus) || 0, parseFloat(tier2_qty) || 0, parseFloat(tier2_bonus) || 0, parseFloat(tier3_qty) || 0, parseFloat(tier3_bonus) || 0, period || "monthly", start_date || null, end_date || null);
  res.status(201).json({ id: r.lastInsertRowid, message: "تم إضافة التارجت" });
});

router.put("/admin/rep-targets/:id", (req, res) => {
  const { rep_phone, product_category, target_qty, tier1_qty, tier1_bonus, tier2_qty, tier2_bonus, tier3_qty, tier3_bonus, period, start_date, end_date, active } = req.body;
  db.prepare(`
    UPDATE rep_targets SET rep_phone=?,product_category=?,target_qty=?,tier1_qty=?,tier1_bonus=?,tier2_qty=?,tier2_bonus=?,tier3_qty=?,tier3_bonus=?,period=?,start_date=?,end_date=?,active=? WHERE id=?
  `).run(rep_phone, product_category, parseFloat(target_qty) || 0, parseFloat(tier1_qty) || 0, parseFloat(tier1_bonus) || 0, parseFloat(tier2_qty) || 0, parseFloat(tier2_bonus) || 0, parseFloat(tier3_qty) || 0, parseFloat(tier3_bonus) || 0, period || "monthly", start_date || null, end_date || null, active === false || active === 0 ? 0 : 1, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/admin/rep-targets/:id", (req, res) => {
  db.prepare("DELETE FROM rep_targets WHERE id = ?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

router.get("/admin/reps", (_req, res) => {
  res.json(db.prepare("SELECT id,name,phone FROM users WHERE role='rep' AND active=1 ORDER BY name").all());
});

export default router;
