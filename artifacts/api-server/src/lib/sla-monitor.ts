/**
 * SLA Monitor — runs every 5 minutes, checks active orders against SLA limits.
 * Sends internal notifications at 75% (warning) and 100% (breach/escalation).
 * Each level fires exactly once per order per stage (tracked via sla_warning_stage /
 * sla_breach_stage columns to survive restarts without duplicate alerts).
 */
import db from "./db.js";
import { logger } from "./logger.js";
import { getSlaSettings, getSlaStatus, STAGE_RESPONSIBLE_ROLE } from "./sla.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type ActiveOrder = {
  id: number;
  order_number: string;
  stage: string;
  created_at: string;
  review_date: string | null;
  vehicle_assign_date: string | null;
  invoice_date: string | null;
  sla_warning_stage: string | null;
  sla_breach_stage: string | null;
};

function notify(phone: string, title: string, body: string, data?: string) {
  try {
    db.prepare("INSERT INTO notifications (user_phone,title,body,data) VALUES (?,?,?,?)")
      .run(phone, title, body, data || null);
  } catch { /* ignore */ }
}

function checkSla(): void {
  const settings = getSlaSettings();

  const stages = ["pending", "pending_cash_approval", "payment_confirmed", "vehicle_assigned", "invoiced"];
  const placeholders = stages.map(() => "?").join(",");

  const orders = db.prepare(`
    SELECT id, order_number, stage,
           created_at, review_date, vehicle_assign_date, invoice_date,
           sla_warning_stage, sla_breach_stage
    FROM workflow_orders
    WHERE stage IN (${placeholders})
  `).all(...stages) as ActiveOrder[];

  if (orders.length === 0) return;

  // Fetch admins once
  const admins = db.prepare("SELECT phone FROM users WHERE role='admin' AND active=1").all() as { phone: string }[];

  for (const order of orders) {
    const sla = getSlaStatus(order as Record<string, unknown>, settings);
    if (!sla || sla.status === "ok") continue;

    const orderData = JSON.stringify({ order_id: order.id, order_number: order.order_number });

    // ── 75% warning — notify responsible role ────────────────────────────────
    if ((sla.status === "warning" || sla.status === "breached") &&
        order.sla_warning_stage !== order.stage) {
      const role = STAGE_RESPONSIBLE_ROLE[order.stage];
      if (role) {
        const responsibles = db.prepare(
          "SELECT phone FROM users WHERE role=? AND active=1"
        ).all(role) as { phone: string }[];

        const title = `⚠️ تنبيه SLA — طلب ${order.order_number}`;
        const body = `الطلب ${order.order_number} استهلك ${sla.percent}% من وقت مرحلة "${order.stage}" (${sla.elapsed_minutes} دقيقة من أصل ${sla.limit_minutes}).`;

        for (const r of responsibles) {
          notify(r.phone, title, body, orderData);
        }
      }

      db.prepare("UPDATE workflow_orders SET sla_warning_stage=? WHERE id=?")
        .run(order.stage, order.id);

      logger.info(
        { order_id: order.id, order_number: order.order_number, stage: order.stage, percent: sla.percent },
        "sla-monitor: warning sent"
      );
    }

    // ── 100% breach — escalate to admin ──────────────────────────────────────
    if (sla.status === "breached" && order.sla_breach_stage !== order.stage) {
      const title = `🚨 تجاوز SLA — طلب ${order.order_number}`;
      const body = `الطلب ${order.order_number} تجاوز وقت SLA المسموح (${sla.limit_minutes} دقيقة) في مرحلة "${order.stage}". الوقت المنقضي: ${sla.elapsed_minutes} دقيقة.`;

      for (const admin of admins) {
        notify(admin.phone, title, body, orderData);
      }

      db.prepare("UPDATE workflow_orders SET sla_breach_stage=? WHERE id=?")
        .run(order.stage, order.id);

      logger.info(
        { order_id: order.id, order_number: order.order_number, stage: order.stage, elapsed: sla.elapsed_minutes },
        "sla-monitor: breach escalation sent"
      );
    }
  }
}

export function startSlaMonitor(): void {
  logger.info("sla-monitor: started (interval=5min)");
  const runCheckSafely = () => {
    try {
      checkSla();
    } catch (err) {
      logger.warn(
        { err },
        "sla-monitor: check skipped because order data could not be read"
      );
    }
  };
  // Initial check after 1 minute (let the server settle)
  setTimeout(() => {
    runCheckSafely();
    setInterval(runCheckSafely, CHECK_INTERVAL_MS);
  }, 60_000);
}
