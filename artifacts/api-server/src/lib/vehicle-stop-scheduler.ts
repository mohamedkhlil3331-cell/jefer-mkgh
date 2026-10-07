import db from "./db.js";
import { logger } from "./logger.js";

function isEnabled(): boolean {
  try {
    const row = db.prepare("SELECT value FROM system_config WHERE key='show_vehicle_stops'").get() as { value: string } | undefined;
    return row?.value === "1";
  } catch {
    return false;
  }
}

function recordNightlyStops() {
  if (!isEnabled()) return;

  // Run at midnight → evaluate the day that just ENDED (yesterday in local wall-clock).
  // Using explicit UTC-3 offset (Arabia Standard Time = UTC+3); getTimezoneOffset is 0
  // on the server (UTC), so we subtract 1 day from UTC midnight to get the business day.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const today = yesterday.toISOString().slice(0, 10);

  let vehicles: { plate_number: string }[] = [];
  try {
    vehicles = db.prepare(
      `SELECT plate_number FROM fleet_vehicles
       WHERE (branch='النقليات' OR branch IS NULL)
         AND status NOT IN ('معطلة','غير_فعّال','خارج الخدمة')`
    ).all() as { plate_number: string }[];
  } catch (err) {
    logger.warn({ err }, "[stop-scheduler] Failed to fetch fleet vehicles");
    return;
  }

  let recorded = 0;
  for (const v of vehicles) {
    try {
      const existing = db.prepare(
        "SELECT id FROM vehicle_stop_records WHERE vehicle_plate=? AND stop_date=?"
      ).get(v.plate_number, today);
      if (existing) continue;

      const hasTrip = db.prepare(
        "SELECT id FROM trips WHERE car_id=? AND date=? LIMIT 1"
      ).get(v.plate_number, today);
      if (hasTrip) continue;

      const openJob = db.prepare(
        `SELECT id FROM workshop_jobs WHERE vehicle_plate=?
         AND status NOT IN ('completed','مكتملة','مكتمل','منتهية') LIMIT 1`
      ).get(v.plate_number);
      const reason = openJob ? "في الورشة" : "توقف بدون عذر";

      db.prepare(
        "INSERT OR IGNORE INTO vehicle_stop_records (vehicle_plate, stop_date, reason, source) VALUES (?,?,?,'auto')"
      ).run(v.plate_number, today, reason);
      recorded++;
    } catch (err) {
      logger.warn({ err, plate: v.plate_number }, "[stop-scheduler] Insert failed");
    }
  }

  if (recorded > 0) {
    logger.info({ recorded, date: today }, "[stop-scheduler] Nightly stop records created");
  }
}

export function startNightlyStopScheduler() {
  function msUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  const delay = msUntilMidnight();
  logger.info({ delayHrs: (delay / 3_600_000).toFixed(2) }, "[stop-scheduler] First run at midnight");

  setTimeout(() => {
    recordNightlyStops();
    setInterval(recordNightlyStops, 24 * 60 * 60 * 1_000);
  }, delay);
}
