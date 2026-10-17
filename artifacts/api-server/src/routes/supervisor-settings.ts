import { Router, type Request, type Response } from "express";
import { execute, executeBatch, queryAll, queryOne } from "../lib/erp-sql.js";

const router = Router();

async function requireAdminOrSupervisor(req: Request, res: Response): Promise<boolean> {
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  if (!token || token === "guest") { res.status(401).json({ error: "غير مصرح" }); return false; }
  const session = await queryOne<{ user_id: number }>(
    "SELECT user_id FROM sessions WHERE token=? AND expires_at > datetime('now')"
  , token);
  if (!session) { res.status(401).json({ error: "الجلسة منتهية" }); return false; }
  const user = await queryOne<{ role: string }>("SELECT role FROM users WHERE id=? AND active=1", session.user_id);
  if (!user || !["admin", "supervisor"].includes(user.role)) {
    res.status(403).json({ error: "صلاحيات المدير مطلوبة" }); return false;
  }
  return true;
}

// ── Supervisor settings ────────────────────────────────────────────────────────
router.get("/supervisor-settings", async (_req, res) => {
  const row = await queryOne("SELECT * FROM supervisor_settings WHERE id=1");
  res.json(row || { id: 1, auto_assign_enabled: 0, stopped_alert_minutes: 30 });
});

router.put("/supervisor-settings", async (req, res) => {
  if (!await requireAdminOrSupervisor(req, res)) return;
  const { auto_assign_enabled, stopped_alert_minutes, crane_assign_enabled, show_ai_chat, whatsapp_order_phone, quote_action } = req.body;
  const current = await queryOne<Record<string, unknown>>("SELECT * FROM supervisor_settings WHERE id=1");
  const currentAutoAssign         = current?.auto_assign_enabled    ?? 0;
  const currentStoppedAlert       = current?.stopped_alert_minutes  ?? 30;
  const currentCraneAssign        = current?.crane_assign_enabled   ?? 1;
  const currentShowAiChat         = current?.show_ai_chat           ?? 1;
  const currentWhatsappOrderPhone = current?.whatsapp_order_phone   ?? "0571748370";
  const currentQuoteAction        = current?.quote_action           ?? "whatsapp";
  await execute(
    "UPDATE supervisor_settings SET auto_assign_enabled=?, stopped_alert_minutes=?, crane_assign_enabled=?, show_ai_chat=?, whatsapp_order_phone=?, quote_action=?, updated_at=datetime('now') WHERE id=1"
  ,
    auto_assign_enabled   !== undefined ? (auto_assign_enabled   ? 1 : 0) : currentAutoAssign,
    stopped_alert_minutes !== undefined ? Number(stopped_alert_minutes)    : currentStoppedAlert,
    crane_assign_enabled  !== undefined ? (crane_assign_enabled  ? 1 : 0) : currentCraneAssign,
    show_ai_chat          !== undefined ? (show_ai_chat          ? 1 : 0) : currentShowAiChat,
    whatsapp_order_phone  !== undefined ? String(whatsapp_order_phone)     : currentWhatsappOrderPhone,
    quote_action          !== undefined && ["whatsapp","login"].includes(quote_action) ? quote_action : currentQuoteAction
  );
  res.json({ message: "تم حفظ الإعدادات" });
});

// ── Public app settings (no auth) ─────────────────────────────────────────────
router.get("/app-settings", async (_req, res) => {
  const row = await queryOne<{ show_ai_chat: number; whatsapp_order_phone: string; quote_action: string }>(
    "SELECT show_ai_chat, whatsapp_order_phone, quote_action FROM supervisor_settings WHERE id=1",
  );
  res.json({
    show_ai_chat:         row?.show_ai_chat         ?? 1,
    whatsapp_order_phone: row?.whatsapp_order_phone ?? "0571748370",
    quote_action:         row?.quote_action         ?? "whatsapp",
  });
});

// ── Vehicle stats (performance dashboard) ─────────────────────────────────────
router.get("/supervisor/vehicle-stats", async (req, res) => {
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
  const rawTo   = typeof req.query.to   === "string" ? req.query.to   : "";
  if ((rawFrom && !isoRe.test(rawFrom)) || (rawTo && !isoRe.test(rawTo))) {
    return void res.status(400).json({ error: "صيغة التاريخ غير صالحة، استخدم YYYY-MM-DD" });
  }
  const from = rawFrom || null;
  const to   = rawTo   || null;

  // Returns SQL clause + bound params for a date-column filter (column name is hardcoded, not user input)
  const dateFilter = (col: string): { clause: string; params: string[] } => {
    if (from && to)  return { clause: ` AND date(${col}) >= ? AND date(${col}) <= ?`, params: [from, to] };
    if (from)        return { clause: ` AND date(${col}) >= ?`, params: [from] };
    if (to)          return { clause: ` AND date(${col}) <= ?`, params: [to] };
    return { clause: "", params: [] };
  };

  const vehicles = await queryAll<{
    id: number; plate_number: string; vehicle_type: string; driver_name: string; status: string;
    equipment_type: string | null; load_capacity_tons: number | null;
  }>(
    "SELECT id, plate_number, vehicle_type, driver_name, status, equipment_type, load_capacity_tons FROM fleet_vehicles ORDER BY plate_number"
  );

  const stats = await Promise.all(vehicles.map(async v => {
    const plate = v.plate_number;
    const { clause: dc, params: dp } = dateFilter("created_at");
    const { clause: dcExp, params: dpExp } = dateFilter("date");
    const { clause: dcRepeat, params: dpRepeat } = (from || to)
      ? dateFilter("created_at")
      : { clause: " AND created_at >= date('now','-90 days')", params: [] };

    const [tripsRow, revenueRow, expensesRow, breakdownsRow, workshopVisitsRow, workshopCostRow,
      attrRows, topCauses, workshopRepeatsRow, reports, daysDeliveredRow, daysWorkshopDaysRow,
      loadedNotDeliveredRow] = await Promise.all([
      queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM workflow_orders WHERE vehicle_plate=? AND stage='delivered'${dc}`
      , plate, ...dp),
      queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(total_with_vat),0) as s FROM workflow_orders WHERE vehicle_plate=? AND stage='delivered'${dc}`
      , plate, ...dp),
      queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(amount),0) as s FROM fleet_expenses WHERE car_id=(SELECT id FROM fleet_vehicles WHERE plate_number=?)${dcExp}`
      , plate, ...dpExp),
      queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM breakdown_reports WHERE vehicle_plate=?${dc}`
      , plate, ...dp),
      queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM workshop_jobs WHERE vehicle_plate=?${dc}`
      , plate, ...dp),
      queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(total_cost),0) as s FROM workshop_jobs WHERE vehicle_plate=? AND status='done'${dc}`
      , plate, ...dp),
      queryAll<{ fault_attribution: string; c: number }>(
      `SELECT fault_attribution, COUNT(*) as c FROM breakdown_reports WHERE vehicle_plate=? AND fault_attribution IS NOT NULL${dc} GROUP BY fault_attribution`
      , plate, ...dp),
      queryAll<{ notes: string; c: number }>(
      `SELECT description as notes, COUNT(*) as c FROM breakdown_reports WHERE vehicle_plate=? AND description IS NOT NULL${dc} GROUP BY description ORDER BY c DESC LIMIT 3`
      , plate, ...dp),
      queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM workshop_jobs WHERE vehicle_plate=?${dcRepeat}`
      , plate, ...dpRepeat),
      queryAll<{ id: number; breakdown_type: string; description: string | null; fault_attribution: string | null; operational_state: string | null; action_taken: string | null; driver_name: string | null; created_at: string }>(
      `SELECT id, breakdown_type, description, fault_attribution, operational_state, action_taken, driver_name, created_at FROM breakdown_reports WHERE vehicle_plate=?${dc} ORDER BY created_at DESC`
      , plate, ...dp),
      queryOne<{ c: number }>(
      `SELECT COUNT(DISTINCT date(delivery_date)) as c FROM workflow_orders WHERE vehicle_plate=? AND stage='delivered' AND delivery_date IS NOT NULL${dc}`
      , plate, ...dp),
      queryOne<{ c: number }>(
      `SELECT COUNT(DISTINCT date(created_at)) as c FROM workshop_jobs WHERE vehicle_plate=?${dc}`
      , plate, ...dp),
      queryOne<{ c: number }>("SELECT COUNT(*) as c FROM workflow_orders WHERE vehicle_plate=? AND stage='loaded'", plate),
    ]);
    const trips = tripsRow?.c || 0;
    const revenue = revenueRow?.s || 0;
    const expenses = expensesRow?.s || 0;
    const driverExpenses = 0;
    const breakdowns = breakdownsRow?.c || 0;
    const workshopVisits = workshopVisitsRow?.c || 0;
    const workshopCost = workshopCostRow?.s || 0;
    const attribution: Record<string, number> = {};
    for (const row of attrRows) attribution[row.fault_attribution] = row.c;

    const workshopRepeats = workshopRepeatsRow?.c || 0;

    // Utilization analysis
    // Working days: 26/month default; if date range given, scale by 26/30
    let workingDays = 26;
    if (from && to) {
      const calDays = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
      workingDays = Math.max(1, Math.round(calDays * (26 / 30)));
    }
    const daysDelivered = daysDeliveredRow?.c || 0;
    const daysWorkshopDays = daysWorkshopDaysRow?.c || 0;
    const loadedNotDelivered = loadedNotDeliveredRow?.c || 0;
    const daysIdle = Math.max(0, workingDays - daysDelivered - daysWorkshopDays);
    const avgDailyRevenue = revenue / workingDays;

    return {
      ...v,
      trips, revenue,
      expenses: expenses + driverExpenses,
      breakdowns, workshopVisits, workshopCost,
      attribution, topCauses, workshopRepeats, reports,
      workingDays, daysDelivered, daysWorkshopDays, loadedNotDelivered, daysIdle, avgDailyRevenue,
    };
  }));

  res.json(stats);
});

// ── Fleet summary for dashboard ───────────────────────────────────────────────
router.get("/supervisor/fleet-summary", async (req, res) => {
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
  const rawTo   = typeof req.query.to   === "string" ? req.query.to   : "";
  if ((rawFrom && !isoRe.test(rawFrom)) || (rawTo && !isoRe.test(rawTo))) {
    return void res.status(400).json({ error: "صيغة التاريخ غير صالحة، استخدم YYYY-MM-DD" });
  }
  const from = rawFrom || null;
  const to   = rawTo   || null;

  // Returns SQL clause + bound params for a date-column filter (column names are hardcoded, not user input)
  const dateFilter = (col: string): { clause: string; params: string[] } => {
    if (from && to)  return { clause: ` AND date(${col}) >= ? AND date(${col}) <= ?`, params: [from, to] };
    if (from)        return { clause: ` AND date(${col}) >= ?`, params: [from] };
    if (to)          return { clause: ` AND date(${col}) <= ?`, params: [to] };
    return { clause: "", params: [] };
  };

  const { clause: dcCat, params: dpCat } = dateFilter("created_at");
  const { clause: dcExp, params: dpExp } = dateFilter("date");

  const [revenueRow, tripsRow, breakdownsRow, fleetExpensesRow, driverExpensesRow,
    monthlyRevenue, topCauses, attrSummary, driverBreakdowns, workshopRepeat,
    customerRevenue, unattributedBreakdowns] = await Promise.all([
    queryOne<{ s: number }>(
    `SELECT COALESCE(SUM(total_with_vat),0) as s FROM workflow_orders WHERE stage='delivered'${dcCat}`
    , ...dpCat),
    queryOne<{ c: number }>(
    `SELECT COUNT(*) as c FROM workflow_orders WHERE stage='delivered'${dcCat}`
    , ...dpCat),
    queryOne<{ c: number }>(
    `SELECT COUNT(*) as c FROM breakdown_reports WHERE 1=1${dcCat}`
    , ...dpCat),
    queryOne<{ s: number }>(
    `SELECT COALESCE(SUM(amount),0) as s FROM fleet_expenses WHERE 1=1${dcExp}`
    , ...dpExp),
    queryOne<{ s: number }>(
    `SELECT COALESCE(SUM(amount),0) as s FROM driver_expenses WHERE 1=1${dcCat}`
    , ...dpCat),

  // Monthly revenue trend — when date range is active show months within range, else last 6 months
    queryAll<{ month: string; revenue: number; trips: number }>(`
    SELECT strftime('%Y-%m', created_at) as month,
           COALESCE(SUM(total_with_vat),0) as revenue,
           COUNT(*) as trips
    FROM workflow_orders WHERE stage='delivered'${dcCat}
    GROUP BY month ORDER BY month DESC LIMIT 12
    `, ...dpCat),

    queryAll<{ notes: string; c: number }>(
    `SELECT description as notes, COUNT(*) as c FROM breakdown_reports WHERE description IS NOT NULL${dcCat} GROUP BY description ORDER BY c DESC LIMIT 5`
    , ...dpCat),

    queryAll<{ fault_attribution: string; c: number }>(
    `SELECT fault_attribution, COUNT(*) as c FROM breakdown_reports WHERE fault_attribution IS NOT NULL${dcCat} GROUP BY fault_attribution`
    , ...dpCat),

    queryAll<{ driver_name: string; c: number }>(`
    SELECT br.driver_name, COUNT(*) as c FROM breakdown_reports br
    WHERE br.fault_attribution='driver'${dcCat} GROUP BY br.driver_name ORDER BY c DESC LIMIT 5
    `, ...dpCat),

    queryAll<{ vehicle_plate: string; visits: number; cost: number }>(`
    SELECT vehicle_plate, COUNT(*) as visits, COALESCE(SUM(total_cost),0) as cost
    FROM workshop_jobs WHERE status='done'${dcCat}
    GROUP BY vehicle_plate ORDER BY visits DESC LIMIT 5
    `, ...dpCat),

    queryAll<{ customer_name: string; trips: number; revenue: number; totalQty: number }>(`
    SELECT customer_name, COUNT(*) as trips,
           COALESCE(SUM(total_with_vat),0) as revenue,
           COALESCE(SUM(quantity),0) as totalQty
    FROM workflow_orders WHERE stage='delivered' AND customer_name IS NOT NULL AND customer_name != ''${dcCat}
    GROUP BY customer_name ORDER BY revenue DESC LIMIT 10
    `, ...dpCat),

    queryAll<{ id: number; breakdown_type: string; description: string | null; fault_attribution: string | null; driver_name: string | null; created_at: string }>(`
    SELECT id, breakdown_type, description, fault_attribution, driver_name, created_at
    FROM breakdown_reports WHERE vehicle_plate IS NULL${dcCat} ORDER BY created_at DESC
    `, ...dpCat),
  ]);
  const totalRevenue = revenueRow?.s || 0;
  const totalTrips = tripsRow?.c || 0;
  const totalBreakdowns = breakdownsRow?.c || 0;
  const totalExpenses = (fleetExpensesRow?.s || 0) + (driverExpensesRow?.s || 0);

  res.json({
    totalRevenue, totalTrips, totalBreakdowns, totalExpenses,
    monthlyRevenue: monthlyRevenue.reverse(),
    topCauses, attrSummary, driverBreakdowns, workshopRepeat,
    customerRevenue, unattributedBreakdowns,
  });
});

// ── Auto-assign: trigger for a specific order ──────────────────────────────────
router.post("/supervisor/auto-assign/:orderId", async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const { supervisor_phone } = req.body;

  const order = await queryOne<Record<string, unknown>>(
    "SELECT * FROM workflow_orders WHERE id=? AND stage='payment_confirmed'",
    orderId,
  );
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود أو لا يمكن تخصيصه" });

  const supervisor = await queryOne<{ id: number }>("SELECT id FROM users WHERE phone=?", supervisor_phone);

  // Get available vehicles with equipment info
  const vehicles = await queryAll<Record<string, unknown>>(
    "SELECT fv.*, dp.phone as driver_phone_dp, dp.driver_name as dp_name FROM fleet_vehicles fv LEFT JOIN driver_profiles dp ON dp.vehicle_plate=fv.plate_number WHERE fv.status='available'"
  );

  if (vehicles.length === 0) {
    return void res.status(400).json({ error: "لا توجد سيارات متاحة للتخصيص التلقائي" });
  }

  const orderLat  = order.delivery_lat  as number | null;
  const orderLng  = order.delivery_lng  as number | null;
  const reqType   = (order.required_vehicle_type as string | null) || null;
  const reqEquip  = (order.required_equipment as string | null) || null;
  const qty       = (order.quantity as number) || 0;

  const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // Get nearest loading point for reference
  const loadingPoints = await queryAll<{ id: number; lat: number; lng: number; name: string }>(
    "SELECT * FROM loading_points WHERE active=1 AND lat IS NOT NULL",
  );

  // Score each vehicle
  let bestVehicle: Record<string, unknown> | null = null;
  let bestScore = -Infinity;

  for (const v of vehicles) {
    let score = 100;

    // Type match bonus
    if (reqType && v.vehicle_type) {
      if ((v.vehicle_type as string).includes(reqType)) score += 50;
      else score -= 30;
    }

    // Equipment match bonus
    if (reqEquip && v.equipment_type) {
      if ((v.equipment_type as string) === reqEquip) score += 40;
    }

    // Capacity match (prefer vehicle that fits the order quantity)
    const cap = (v.load_capacity_tons as number) || 0;
    if (cap > 0 && qty > 0) {
      if (cap >= qty) score += 20;
      else score -= 40; // under-capacity
    }

    // Distance from nearest loading point (proximity)
    if (orderLat && orderLng && loadingPoints.length > 0) {
      const minDist = Math.min(...loadingPoints.map(lp => haversine(orderLat, orderLng, lp.lat, lp.lng)));
      score -= minDist * 0.5; // closer = better score
    }

    if (score > bestScore) {
      bestScore = score;
      bestVehicle = v;
    }
  }

  if (!bestVehicle) return void res.status(400).json({ error: "لم يُعثر على سيارة مناسبة" });

  // Find linked driver for the best vehicle
  const linkedUser = bestVehicle.linked_user_phone
    ? await queryOne<Record<string, unknown>>("SELECT * FROM users WHERE phone=? AND role='driver' AND active=1", bestVehicle.linked_user_phone)
    : null;
  const driverPhone = linkedUser?.phone as string || bestVehicle.driver_phone_dp as string || null;
  const driverName  = linkedUser?.name  as string || bestVehicle.dp_name as string || bestVehicle.driver_name as string || null;

  if (!driverPhone) {
    return void res.status(400).json({ error: `السيارة ${bestVehicle.plate_number} ليس لها سائق مرتبط` });
  }

  // Apply assignment
  await executeBatch([
    {
      sql: `UPDATE workflow_orders SET
      stage='vehicle_assigned', supervisor_id=?,
      vehicle_plate=?, driver_phone=?, driver_name=?,
      vehicle_assign_date=datetime('now')
      WHERE id=?`,
      params: [supervisor?.id || null, bestVehicle.plate_number, driverPhone, driverName, orderId],
    },
    { sql: "UPDATE driver_profiles SET status='في رحلة' WHERE vehicle_plate=?", params: [bestVehicle.plate_number] },
    { sql: "UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?", params: [bestVehicle.plate_number] },
  ]);

  // Notify
  const notify = (phone: string, title: string, body: string) => {
    try {
      void execute("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)", phone, title, body).catch(() => {});
    } catch {}
  };
  notify(driverPhone, "طلب جديد (تلقائي)", `تم تخصيصك تلقائياً لطلب ${order.order_number}`);
  const warehouseUsers = await queryAll<{ phone: string }>("SELECT phone FROM users WHERE role='warehouse' AND active=1");
  warehouseUsers.forEach(w => notify(w.phone, "طلب جاهز للفاتورة", `تم تخصيص سيارة لطلب ${order.order_number}`));

  res.json({
    message: "تم التخصيص التلقائي",
    vehicle_plate: bestVehicle.plate_number,
    driver_name: driverName,
    driver_phone: driverPhone,
    score: bestScore,
  });
});

// ── Breakdown attribution ──────────────────────────────────────────────────────
router.put("/breakdown-reports/:id/attribution", async (req, res) => {
  const { fault_attribution } = req.body;
  if (!["driver", "mechanic", "vehicle"].includes(fault_attribution)) {
    return void res.status(400).json({ error: "قيمة غير صالحة" });
  }
  await execute("UPDATE breakdown_reports SET fault_attribution=? WHERE id=?", fault_attribution, req.params.id);
  res.json({ message: "تم تحديث الإسناد" });
});

// ── Vehicle equipment update ───────────────────────────────────────────────────
router.put("/fleet-vehicles/:plate/equipment", async (req, res) => {
  const { equipment_type, load_capacity_tons, vehicle_subtype } = req.body;
  await execute(
    "UPDATE fleet_vehicles SET equipment_type=?, load_capacity_tons=?, vehicle_subtype=? WHERE plate_number=?"
  , equipment_type || "none", load_capacity_tons || 0, vehicle_subtype || null, req.params.plate);
  res.json({ message: "تم تحديث معدات السيارة" });
});

// ── Vehicle stop events history ────────────────────────────────────────────────
router.get("/supervisor/vehicle-stops", async (_req, res) => {
  // All orders that ever had a stop recorded (vehicle_stopped_since IS NOT NULL)
  // Join notifications to also surface stop-alert notification timestamps
  const rows = await queryAll<{
    id: number; order_number: string; vehicle_plate: string; driver_name: string | null;
    driver_phone: string | null; stage: string; vehicle_stopped_since: string;
    vehicle_stop_notified_at: string | null; delivery_date: string | null;
    notification_sent_at: string | null; notification_body: string | null;
  }>(`
    SELECT
      wo.id,
      wo.order_number,
      wo.vehicle_plate,
      wo.driver_name,
      wo.driver_phone,
      wo.stage,
      wo.vehicle_stopped_since,
      wo.vehicle_stop_notified_at,
      wo.delivery_date,
      n.created_at AS notification_sent_at,
      n.body       AS notification_body
    FROM workflow_orders wo
    LEFT JOIN notifications n
      ON n.body LIKE '%' || wo.order_number || '%'
      AND n.title LIKE '%توقف%'
    WHERE wo.vehicle_stopped_since IS NOT NULL
    ORDER BY wo.vehicle_stopped_since DESC
    LIMIT 200
  `);

  const now = Date.now();
  const enriched = rows.map(r => {
    const stoppedSince = new Date(r.vehicle_stopped_since).getTime();
    const stillStopped = ["vehicle_assigned", "invoiced", "loaded"].includes(r.stage);
    const endTime = stillStopped ? now : (r.delivery_date ? new Date(r.delivery_date).getTime() : now);
    const durationMinutes = Math.round((endTime - stoppedSince) / 60_000);
    return {
      ...r,
      duration_minutes: durationMinutes > 0 ? durationMinutes : 0,
      still_stopped: stillStopped,
    };
  });

  res.json(enriched);
});

// ── Driver company sends ────────────────────────────────────────────────────────
router.get("/driver-company-sends", async (req, res) => {
  const { driver_phone } = req.query as Record<string, string>;
  const rows = driver_phone
    ? await queryAll("SELECT * FROM driver_company_sends WHERE driver_phone=? ORDER BY created_at DESC", driver_phone)
    : await queryAll("SELECT * FROM driver_company_sends ORDER BY created_at DESC LIMIT 100");
  res.json(rows);
});

router.post("/driver-company-sends", async (req, res) => {
  const { driver_phone, driver_name, amount, note, sent_by } = req.body;
  if (!driver_phone || !amount) return void res.status(400).json({ error: "البيانات غير مكتملة" });
  const r = await execute(
    "INSERT INTO driver_company_sends (driver_phone,driver_name,amount,note,sent_by) VALUES (?,?,?,?,?)"
  , driver_phone, driver_name || null, parseFloat(String(amount)), note || null, sent_by || null);
  res.status(201).json({ id: r.lastInsertRowid, message: "تم إرسال المبلغ من الشركة" });
});

export default router;
