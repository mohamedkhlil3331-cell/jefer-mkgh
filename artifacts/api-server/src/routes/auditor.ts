import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// ── All clients with financial summary ────────────────────────────────────
router.get("/auditor/clients", (_req, res) => {
  const customers = db.prepare(
    "SELECT id,name,phone,company_name,vat_number,cr_number,created_at FROM users WHERE role='customer' AND active=1 ORDER BY name"
  ).all() as Record<string, unknown>[];

  const result = customers.map(c => {
    const phone = c.phone as string;
    const orderRow = db.prepare(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(total_with_vat),0) as total FROM workflow_orders WHERE customer_phone=? AND stage NOT IN ('cancelled')"
    ).get(phone) as { cnt: number; total: number };
    const paidRow = db.prepare(
      "SELECT COALESCE(SUM(amount),0) as total FROM customer_transfers WHERE customer_phone=? AND confirmed=1"
    ).get(phone) as { total: number };
    const balance = (paidRow.total || 0) - (orderRow.total || 0);
    return {
      ...c,
      order_count:  orderRow.cnt   || 0,
      total_orders: parseFloat(((orderRow.total || 0) as number).toFixed(2)),
      total_paid:   parseFloat(((paidRow.total  || 0) as number).toFixed(2)),
      balance:      parseFloat(balance.toFixed(2)),
    };
  });

  res.json(result);
});

// ── Full financial profile for one customer ────────────────────────────────
router.get("/auditor/clients/:phone/profile", (req, res) => {
  const { phone } = req.params;
  const customer = db.prepare("SELECT * FROM users WHERE phone=?").get(phone) as Record<string, unknown> | undefined;
  if (!customer) return void res.status(404).json({ error: "العميل غير موجود" });

  const orders = db.prepare(
    "SELECT * FROM workflow_orders WHERE customer_phone=? ORDER BY created_at DESC"
  ).all(phone) as Record<string, unknown>[];
  const transfers = db.prepare(
    "SELECT * FROM customer_transfers WHERE customer_phone=? ORDER BY created_at DESC"
  ).all(phone) as Record<string, unknown>[];

  const totalOrders = orders
    .filter(o => o.stage !== "cancelled")
    .reduce((s, o) => s + ((o.total_with_vat as number) || 0), 0);
  const totalPaid = transfers
    .filter(t => t.confirmed)
    .reduce((s, t) => s + ((t.amount as number) || 0), 0);

  res.json({
    customer,
    orders,
    transfers,
    summary: {
      order_count:     orders.length,
      delivered_count: orders.filter(o => o.stage === "delivered").length,
      total_orders:    parseFloat(totalOrders.toFixed(2)),
      total_paid:      parseFloat(totalPaid.toFixed(2)),
      balance:         parseFloat((totalPaid - totalOrders).toFixed(2)),
    },
  });
});

// ── Pending new-client registrations ──────────────────────────────────────
router.get("/auditor/pending-approvals", (_req, res) => {
  const rows = db.prepare(
    "SELECT id,name,phone,company_name,vat_number,cr_number,register_note,approval_status,created_at FROM users WHERE role='customer' AND approval_status='pending' ORDER BY created_at DESC"
  ).all();
  res.json(rows);
});

// ── Bank transfers with optional time filter ───────────────────────────────
router.get("/auditor/transfers", (req, res) => {
  const { period } = req.query as { period?: string };
  let dateClause = "";
  if (period === "today") dateClause = "AND date(ct.created_at) = date('now')";
  else if (period === "week")  dateClause = "AND ct.created_at >= datetime('now','-7 days')";
  else if (period === "month") dateClause = "AND ct.created_at >= datetime('now','-30 days')";
  else if (period === "year")  dateClause = "AND ct.created_at >= datetime('now','-365 days')";

  const rows = db.prepare(`
    SELECT ct.*, u.company_name
    FROM customer_transfers ct
    LEFT JOIN users u ON u.phone = ct.customer_phone
    WHERE 1=1 ${dateClause}
    ORDER BY ct.created_at DESC
  `).all();
  res.json(rows);
});

// ── Sales breakdown: by product, packaging, rep, warehouse + debts + trend ─
router.get("/auditor/sales-breakdown", (_req, res) => {
  const orders = db.prepare(`
    SELECT
      wo.product_name,
      wo.packaging_type,
      wo.rep_phone,
      COALESCE(u_rep.name, wo.rep_phone)  AS rep_label,
      COALESCE(u_wh.name,  'غير محدد')   AS warehouse_label,
      wo.total_with_vat
    FROM workflow_orders wo
    LEFT JOIN users u_rep ON u_rep.phone = wo.rep_phone
    LEFT JOIN users u_wh  ON u_wh.id    = wo.warehouse_id
    WHERE wo.stage = 'delivered'
  `).all() as Record<string, unknown>[];

  const aggregate = (key: (o: Record<string, unknown>) => string) => {
    const map: Record<string, { count: number; revenue: number }> = {};
    orders.forEach(o => {
      const k = key(o) || "غير محدد";
      if (!map[k]) map[k] = { count: 0, revenue: 0 };
      map[k].count++;
      map[k].revenue += (o.total_with_vat as number) || 0;
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, count: d.count, revenue: parseFloat(d.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue);
  };

  const customers = db.prepare(
    "SELECT phone FROM users WHERE role='customer' AND active=1"
  ).all() as { phone: string }[];

  let totalDebt = 0;
  let debtorCount = 0;
  customers.forEach(c => {
    const ord = (db.prepare(
      "SELECT COALESCE(SUM(total_with_vat),0) as t FROM workflow_orders WHERE customer_phone=? AND stage NOT IN ('cancelled')"
    ).get(c.phone) as { t: number }).t || 0;
    const paid = (db.prepare(
      "SELECT COALESCE(SUM(amount),0) as t FROM customer_transfers WHERE customer_phone=? AND confirmed=1"
    ).get(c.phone) as { t: number }).t || 0;
    const bal = paid - ord;
    if (bal < 0) { totalDebt += Math.abs(bal); debtorCount++; }
  });

  const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const now = new Date();
  const monthly_trend: { month: string; label: string; revenue: number; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const row = db.prepare(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(total_with_vat),0) as rev FROM workflow_orders WHERE stage='delivered' AND substr(created_at,1,7)=?"
    ).get(key) as { cnt: number; rev: number };
    monthly_trend.push({ month: key, label: MONTHS_AR[d.getMonth()], revenue: parseFloat((row.rev||0).toFixed(2)), count: row.cnt||0 });
  }

  const totalRevenue = orders.reduce((s, o) => s + ((o.total_with_vat as number)||0), 0);

  res.json({
    by_product:    aggregate(o => o.product_name as string),
    by_packaging:  aggregate(o => o.packaging_type as string),
    by_rep:        aggregate(o => o.rep_label as string),
    by_warehouse:  aggregate(o => o.warehouse_label as string),
    debts:         { total_debt: parseFloat(totalDebt.toFixed(2)), debtor_count: debtorCount },
    monthly_trend,
    total_revenue: parseFloat(totalRevenue.toFixed(2)),
    total_delivered: orders.length,
  });
});

// ── System audit log (with synthetic fallback from workflow_orders) ────────
router.get("/auditor/system-logs", (req, res) => {
  const { search, entity_type, limit = "300", offset = "0" } = req.query as Record<string, string>;

  let sql = "SELECT * FROM system_logs WHERE 1=1";
  const params: (string | number)[] = [];
  if (entity_type) { sql += " AND entity_type=?"; params.push(entity_type); }
  if (search) {
    sql += " AND (action LIKE ? OR user_name LIKE ? OR details LIKE ? OR entity_type LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), parseInt(offset));
  const realLogs = db.prepare(sql).all(...params) as Record<string, unknown>[];

  // Synthetic entries built from workflow events so the log is always populated
  let syntheticSql = `
    SELECT
      id,
      order_number   AS entity_id,
      'order'        AS entity_type,
      stage          AS action,
      customer_phone AS user_phone,
      customer_name  AS user_name,
      'customer'     AS user_role,
      delivery_location AS details,
      created_at
    FROM workflow_orders
    WHERE 1=1
  `;
  const synParams: (string | number)[] = [];
  if (search) {
    syntheticSql += " AND (customer_name LIKE ? OR order_number LIKE ? OR delivery_location LIKE ?)";
    const s = `%${search}%`;
    synParams.push(s, s, s);
  }
  if (entity_type && entity_type !== "order") {
    syntheticSql += " AND 0=1";
  }
  syntheticSql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  synParams.push(parseInt(limit), parseInt(offset));
  const syntheticLogs = db.prepare(syntheticSql).all(...synParams) as Record<string, unknown>[];

  // Synthetic entries from customer_transfers
  let transferSql = `
    SELECT
      id,
      CAST(id AS TEXT)    AS entity_id,
      'transfer'          AS entity_type,
      CASE WHEN confirmed=1 THEN 'transfer_confirmed' ELSE 'transfer_pending' END AS action,
      customer_phone      AS user_phone,
      customer_name       AS user_name,
      'customer'          AS user_role,
      CAST(amount AS TEXT) || ' ر.س · ' || COALESCE(bank_name,'') AS details,
      created_at
    FROM customer_transfers
    WHERE 1=1
  `;
  const tParams: (string | number)[] = [];
  if (search) {
    transferSql += " AND (customer_name LIKE ? OR bank_name LIKE ?)";
    const s = `%${search}%`;
    tParams.push(s, s);
  }
  if (entity_type && entity_type !== "transfer") {
    transferSql += " AND 0=1";
  }
  transferSql += " ORDER BY created_at DESC LIMIT 100";
  const transferLogs = db.prepare(transferSql).all(...tParams) as Record<string, unknown>[];

  const combined = [
    ...realLogs,
    ...syntheticLogs,
    ...transferLogs,
  ].sort((a, b) => {
    const da = (a.created_at as string) || "";
    const db2 = (b.created_at as string) || "";
    return db2 < da ? -1 : db2 > da ? 1 : 0;
  }).slice(0, parseInt(limit));

  res.json({ logs: combined, total: combined.length });
});

export default router;
