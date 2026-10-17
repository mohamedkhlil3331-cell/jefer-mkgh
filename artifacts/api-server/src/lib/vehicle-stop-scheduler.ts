import { execute, queryAll, queryOne } from "./erp-sql.js";
import { logger } from "./logger.js";

async function isEnabled(): Promise<boolean> {
  try {
    const row = await queryOne<{ value: string }>("SELECT value FROM system_config WHERE key='show_vehicle_stops'");
    return row?.value === "1";
  } catch {
    return false;
  }
}

async function recordNightlyStops() {
  if (!await isEnabled()) return;

  // Run at midnight → evaluate the day that just ENDED (yesterday in local wall-clock).
  // Using explicit UTC-3 offset (Arabia Standard Time = UTC+3); getTimezoneOffset is 0
  // on the server (UTC), so we subtract 1 day from UTC midnight to get the business day.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const today = yesterday.toISOString().slice(0, 10);

  let vehicles: { plate_number: string }[] = [];
  try {
    vehicles = await queryAll<{ plate_number: string }>(
      `SELECT plate_number FROM fleet_vehicles
       WHERE (branch='النقليات' OR branch IS NULL)
         AND status NOT IN ('معطلة','غير_فعّال','خارج الخدمة')`
    );
  } catch (err) {
    logger.warn({ err }, "[stop-scheduler] Failed to fetch fleet vehicles");
    return;
  }

  let recorded = 0;
  for (const v of vehicles) {
    try {
      const existing = await queryOne(
        "SELECT id FROM vehicle_stop_records WHERE vehicle_plate=? AND stop_date=?"
      , v.plate_number, today);
      if (existing) continue;

      const hasTrip = await queryOne(
        "SELECT id FROM trips WHERE car_id=? AND date=? LIMIT 1"
      , v.plate_number, today);
      if (hasTrip) continue;

      const openJob = await queryOne(
        `SELECT id FROM workshop_jobs WHERE vehicle_plate=?
         AND status NOT IN ('completed','مكتملة','مكتمل','منتهية') LIMIT 1`
      , v.plate_number);
      const reason = openJob ? "في الورشة" : "توقف بدون عذر";

      await execute(
        "INSERT OR IGNORE INTO vehicle_stop_records (vehicle_plate, stop_date, reason, source) VALUES (?,?,?,'auto')"
      , v.plate_number, today, reason);
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
    void recordNightlyStops();
    setInterval(() => { void recordNightlyStops(); }, 24 * 60 * 60 * 1_000);
  }, delay);
}
