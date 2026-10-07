import db from "./db.js";
import { logger } from "./logger.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

interface WialonUnit {
  id: number;
  nm: string;
  uid?: string;
  pos?: { x: number; y: number; s: number; t: number } | null;
}

interface GpsLocation {
  gps_device_id: string;
  speed: number;
  updated_at: string;
}

async function fetchWialonSpeeds(): Promise<Map<string, GpsLocation>> {
  const base = "https://gps.tawasolmap.com/wialon/ajax.html";
  const result = new Map<string, GpsLocation>();

  const user = process.env.TAWASOLMAP_USER;
  const pass = process.env.TAWASOLMAP_PASS;
  const token = process.env.TAWASOLMAP_TOKEN;
  const loginParams = user && pass ? { user, password: pass, fl: 1 } : token ? { token, fl: 1 } : null;
  if (!loginParams) return result;

  let sid: string;
  try {
    const loginRes = await fetch(
      `${base}?svc=core/login&params=${encodeURIComponent(JSON.stringify(loginParams))}`
    );
    if (!loginRes.ok) return result;
    const loginData = await loginRes.json() as { eid?: string; error?: number };
    if (!loginData.eid) return result;
    sid = loginData.eid;
  } catch {
    return result;
  }

  const search = async (propName: string, propValueMask: string): Promise<WialonUnit[]> => {
    const params = {
      spec: { itemsType: "avl_unit", propName, propValueMask, sortType: "sys_name", propType: "property" },
      force: 1, flags: 0x1 | 0x100, from: 0, to: 0,
    };
    try {
      const r = await fetch(`${base}?sid=${sid}&svc=core/search_items&params=${encodeURIComponent(JSON.stringify(params))}`);
      if (!r.ok) return [];
      const d = await r.json() as { items?: WialonUnit[] };
      return d.items || [];
    } catch { return []; }
  };

  try {
    const nameItems = await search("sys_name", "*");
    for (const u of nameItems) {
      if (!u.pos) continue;
      const entry: GpsLocation = { gps_device_id: String(u.id), speed: u.pos.s, updated_at: new Date(u.pos.t * 1000).toISOString() };
      result.set(String(u.id), entry);
    }

    const uidItems = await search("sys_unique_id", "*");
    for (const u of uidItems) {
      if (!u.uid || !u.pos) continue;
      const imei = u.uid.trim();
      if (!imei || imei === String(u.id)) continue;
      const existing = result.get(String(u.id));
      const entry: GpsLocation = existing ?? { gps_device_id: imei, speed: u.pos.s, updated_at: new Date(u.pos.t * 1000).toISOString() };
      result.set(imei, { ...entry, gps_device_id: imei });
    }

    return result;
  } finally {
    try {
      await fetch(`${base}?sid=${sid}&svc=core/logout&params=%7B%7D`);
    } catch { /* ignore */ }
  }
}

async function checkVehicleStops(): Promise<void> {
  const settings = db.prepare("SELECT stopped_alert_minutes FROM supervisor_settings WHERE id=1").get() as
    { stopped_alert_minutes: number | null } | undefined;
  const thresholdMinutes = settings?.stopped_alert_minutes ?? 30;

  type ActiveOrder = {
    id: number;
    order_number: string;
    vehicle_plate: string | null;
    gps_device_id: string | null;
    vehicle_stopped_since: string | null;
    vehicle_stop_notified_at: string | null;
  };

  const activeOrders = db.prepare(`
    SELECT wo.id, wo.order_number, wo.vehicle_plate,
           fv.gps_device_id,
           wo.vehicle_stopped_since, wo.vehicle_stop_notified_at
    FROM workflow_orders wo
    LEFT JOIN fleet_vehicles fv ON fv.plate_number = wo.vehicle_plate
    WHERE wo.stage = 'loaded'
  `).all() as ActiveOrder[];

  if (activeOrders.length === 0) return;

  let gpsMap = new Map<string, GpsLocation>();
  try {
    gpsMap = await fetchWialonSpeeds();
  } catch (err) {
    logger.warn({ err }, "vehicle-stop-monitor: failed to fetch GPS data");
  }

  const now = new Date();
  const supervisors = db.prepare("SELECT phone FROM users WHERE role='supervisor' AND active=1").all() as { phone: string }[];

  const notify = (phone: string, title: string, body: string, data?: string) => {
    try {
      db.prepare("INSERT INTO notifications (user_phone,title,body,data) VALUES (?,?,?,?)").run(phone, title, body, data || null);
    } catch { /* ignore */ }
  };

  for (const order of activeOrders) {
    if (!order.gps_device_id) continue;

    const loc = gpsMap.get(order.gps_device_id);
    if (!loc) continue;

    const isStopped = loc.speed === 0;

    if (!isStopped) {
      if (order.vehicle_stopped_since || order.vehicle_stop_notified_at) {
        db.prepare(`
          UPDATE workflow_orders
          SET vehicle_stopped_since=NULL, vehicle_stop_notified_at=NULL
          WHERE id=?
        `).run(order.id);
      }
      continue;
    }

    if (!order.vehicle_stopped_since) {
      db.prepare("UPDATE workflow_orders SET vehicle_stopped_since=? WHERE id=?").run(now.toISOString(), order.id);
      continue;
    }

    const stoppedSince = new Date(order.vehicle_stopped_since);
    const stoppedMinutes = (now.getTime() - stoppedSince.getTime()) / 60_000;

    if (stoppedMinutes < thresholdMinutes) continue;

    if (order.vehicle_stop_notified_at) {
      const lastNotified = new Date(order.vehicle_stop_notified_at);
      const minutesSinceNotify = (now.getTime() - lastNotified.getTime()) / 60_000;
      if (minutesSinceNotify < thresholdMinutes) continue;
    }

    const plate = order.vehicle_plate || "—";
    const stoppedForText = Math.round(stoppedMinutes);
    const title = `⚠️ توقف سيارة: ${plate}`;
    const body = `السيارة ${plate} متوقفة منذ ${stoppedForText} دقيقة في الرحلة ${order.order_number}. يرجى المتابعة.`;
    const data = JSON.stringify({ order_id: order.id, order_number: order.order_number, vehicle_plate: plate });

    for (const sup of supervisors) {
      notify(sup.phone, title, body, data);
    }

    db.prepare("UPDATE workflow_orders SET vehicle_stop_notified_at=? WHERE id=?").run(now.toISOString(), order.id);

    logger.info(
      { order_id: order.id, order_number: order.order_number, vehicle_plate: plate, stopped_minutes: stoppedForText },
      "vehicle-stop-monitor: stop alert sent"
    );
  }
}

export function startVehicleStopMonitor(): void {
  logger.info("vehicle-stop-monitor: started (interval=10min)");
  const runCheckSafely = () => {
    void checkVehicleStops().catch((err) => {
      logger.warn(
        { err },
        "vehicle-stop-monitor: check skipped because order data could not be read"
      );
    });
  };
  runCheckSafely();
  setInterval(runCheckSafely, CHECK_INTERVAL_MS);
}
