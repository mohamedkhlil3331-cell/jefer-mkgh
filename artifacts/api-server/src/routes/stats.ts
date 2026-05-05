import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

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

export default router;
