import { Router, type Request, type Response } from "express";
import { GetBranchDashboardQueryParams, GetBranchDashboardResponse } from "@workspace/api-zod";
import db from "../lib/db.js";
import { isSysAdminToken } from "./auth.js";

const router = Router();

function requireDashboardAccess(req: Request, res: Response, branchDetails: boolean): boolean {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token || token === "guest") {
    res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    return false;
  }
  if (isSysAdminToken(token)) return true;

  const session = db.prepare(
    `SELECT u.role, u.permissions
     FROM sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.token=? AND datetime(s.expires_at)>datetime('now')
       AND u.active=1
       AND s.rowid=(
         SELECT MAX(current.rowid)
         FROM sessions current
         WHERE current.user_id=s.user_id
       )`
  ).get(token) as { role: string; permissions: string | null } | undefined;

  if (!session) {
    res.status(401).json({ error: "الجلسة منتهية أو غير صالحة" });
    return false;
  }

  // Match the existing page guard: admins bypass custom permissions, while
  // legacy users with missing/empty permission lists retain their old access.
  const isAdmin = session.role === "admin";
  if (isAdmin) return true;

  let permissions: string[] | null = null;
  if (session.permissions) {
    try {
      const parsed: unknown = JSON.parse(session.permissions);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) {
        permissions = parsed;
      }
    } catch {
      // The frontend treats malformed permission JSON as null and uses legacy access.
    }
  }
  const mayViewDashboard = !permissions || permissions.length === 0 || permissions.includes("home_dashboard");
  if (!mayViewDashboard || branchDetails) {
    res.status(403).json({ error: "صلاحيات لوحة الفروع مطلوبة" });
    return false;
  }
  return true;
}

function branchLinkedMetrics(branchNames: string[]) {
  const names = [...new Set(branchNames.map(name => name.trim().toLocaleLowerCase()).filter(Boolean))];
  const zero = {
    vehicles: { total: 0, available: 0, busy: 0, maintenance: 0, broken: 0 },
    maintenance: { count: 0, amount: 0 },
    purchase_invoices: { count: 0, amount: 0 },
    reimbursement_claims: { count: 0, amount: 0 },
  };
  if (!names.length) return zero;

  const placeholders = names.map(() => "?").join(", ");
  const branchFilter = `LOWER(TRIM(COALESCE(branch,''))) IN (${placeholders})`;

  const vehicles = db.prepare(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN LOWER(TRIM(COALESCE(status,'')))='available' THEN 1 ELSE 0 END) AS available,
       SUM(CASE WHEN LOWER(TRIM(COALESCE(status,'')))='busy' THEN 1 ELSE 0 END) AS busy,
       SUM(CASE WHEN LOWER(TRIM(COALESCE(status,'')))='maintenance' THEN 1 ELSE 0 END) AS maintenance,
       SUM(CASE WHEN LOWER(TRIM(COALESCE(status,'')))='broken' THEN 1 ELSE 0 END) AS broken
     FROM fleet_vehicles
     WHERE ${branchFilter}`
  ).get(...names) as Record<string, number | null>;

  const maintenance = db.prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
     FROM maintenance_logs
     WHERE ${branchFilter}`
  ).get(...names) as { count: number; amount: number };

  const purchaseInvoices = db.prepare(
    `SELECT COUNT(DISTINCT CASE
         WHEN TRIM(COALESCE(invoice_number,'')) <> '' THEN TRIM(invoice_number)
         ELSE 'purchase-invoice:' || CAST(id AS TEXT)
       END) AS count,
       COALESCE(SUM(price_after_vat), 0) AS amount
     FROM purchase_invoices
     WHERE ${branchFilter}`
  ).get(...names) as { count: number; amount: number };

  const reimbursementClaims = db.prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total_after_vat), 0) AS amount
     FROM supplier_reimbursement_claims
     WHERE ${branchFilter} AND COALESCE(is_cancelled, 0)=0`
  ).get(...names) as { count: number; amount: number };

  const roundedAmount = (value: number | null | undefined) =>
    Number((Number(value) || 0).toFixed(2));

  return {
    vehicles: {
      total: Number(vehicles.total) || 0,
      available: Number(vehicles.available) || 0,
      busy: Number(vehicles.busy) || 0,
      maintenance: Number(vehicles.maintenance) || 0,
      broken: Number(vehicles.broken) || 0,
    },
    maintenance: {
      count: Number(maintenance.count) || 0,
      amount: roundedAmount(maintenance.amount),
    },
    purchase_invoices: {
      count: Number(purchaseInvoices.count) || 0,
      amount: roundedAmount(purchaseInvoices.amount),
    },
    reimbursement_claims: {
      count: Number(reimbursementClaims.count) || 0,
      amount: roundedAmount(reimbursementClaims.amount),
    },
  };
}

router.get("/stats/dashboard", (_req, res) => {
  const orders = db.prepare("SELECT * FROM workflow_orders ORDER BY created_at DESC").all() as Record<string, unknown>[];
  const vehicles = db.prepare("SELECT * FROM fleet_vehicles").all() as Record<string, unknown>[];
  const employees = (db.prepare("SELECT COUNT(*) as c FROM employees").get() as {c:number}).c;
  const customers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role='customer' AND active=1").get() as {c:number}).c;
  const notifications = (db.prepare("SELECT COUNT(*) as c FROM notifications WHERE read=0").get() as {c:number}).c;
  const pendingTransfers = (db.prepare("SELECT COUNT(*) as c FROM customer_transfers WHERE confirmed=0").get() as {c:number}).c;

  const byStage = orders.reduce<Record<string, number>>((acc, o) => {
    const s = o.stage as string;
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const revenue = orders
    .filter(o => o.stage === "delivered")
    .reduce((s, o) => s + ((o.total_with_vat as number) || 0), 0);

  const vehicleStatus = vehicles.reduce<Record<string, number>>((acc, v) => {
    const s = v.status as string;
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  // Monthly chart data (last 6 months)
  const now = new Date();
  const months: { month: string; label: string; orders: number; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    const monthOrders = orders.filter(o => (o.created_at as string)?.startsWith(key));
    months.push({
      month: key,
      label: `${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`,
      orders: monthOrders.length,
      revenue: monthOrders.filter(o => o.stage === "delivered").reduce((s, o) => s + ((o.total_with_vat as number) || 0), 0),
    });
  }

  // Stage distribution for pie
  const stageLabels: Record<string, string> = {
    pending: "انتظار المراجعة", payment_confirmed: "تم تأكيد الدفع",
    vehicle_assigned: "جاري التجهيز", invoiced: "صدرت الفاتورة",
    loaded: "في الطريق", delivered: "تم التسليم", cancelled: "ملغي",
  };
  const chartStages = Object.entries(byStage).map(([k, v]) => ({
    name: stageLabels[k] || k, value: v, key: k,
  }));

  // Top products
  const productCount = orders.reduce<Record<string, number>>((acc, o) => {
    const p = o.product_name as string;
    if (p) acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {});
  const chartProducts = Object.entries(productCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  // Recent orders
  const recentOrders = orders.slice(0, 10);

  res.json({
    kpi: {
      total_orders: orders.length,
      pending_orders: byStage.pending || 0,
      delivered_orders: byStage.delivered || 0,
      revenue: parseFloat(revenue.toFixed(2)),
      vehicles_available: vehicleStatus.available || 0,
      vehicles_busy: vehicleStatus.busy || 0,
      employees,
      customers,
      notifications,
      pending_transfers: pendingTransfers,
    },
    vehicle_status: vehicleStatus,
    chart_monthly: months,
    chart_stages: chartStages,
    chart_products: chartProducts,
    recent_orders: recentOrders,
    vehicles,
  });
});

router.get("/branch-dashboard", (req, res) => {
  const parsedQuery = GetBranchDashboardQueryParams.safeParse(req.query);
  if (
    !parsedQuery.success ||
    (parsedQuery.data.branchId !== undefined && !Number.isSafeInteger(parsedQuery.data.branchId))
  ) {
    res.status(400).json({ error: "معرّف الفرع غير صالح" });
    return;
  }
  const requestedBranchId = parsedQuery.data.branchId;

  if (!requireDashboardAccess(req, res, requestedBranchId !== undefined)) return;

  const activeBranches = db.prepare(
    "SELECT id, entity_name FROM company_settings WHERE active=1 AND TRIM(COALESCE(entity_name,''))<>'' ORDER BY id"
  ).all() as { id: number; entity_name: string }[];

  let branch: { id: number; entity_name: string } | null = null;
  let branchNames = activeBranches.map(item => item.entity_name);
  if (requestedBranchId !== undefined) {
    branch = activeBranches.find(item => item.id === requestedBranchId) ?? null;
    if (!branch) {
      res.status(404).json({ error: "الفرع النشط غير موجود" });
      return;
    }
    branchNames = [branch.entity_name];
  }

  const metrics = branchLinkedMetrics(branchNames);
  const response = GetBranchDashboardResponse.parse({
    scope: branch ? "branch" : "all",
    branch,
    ...metrics,
  });
  res.json(response);
});

export default router;
