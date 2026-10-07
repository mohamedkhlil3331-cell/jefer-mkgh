import { createServer } from "node:http";
import { logger } from "./lib/logger.js";
import {
  restoreDbFromStorage,
  startPeriodicDbBackup,
  uploadDbBackup,
  registerShutdownBackup,
  registerStaleWriterShutdown,
  getDefaultDbPath,
  getBackupWriterId,
} from "./lib/db-sync.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

if (process.env.NODE_ENV !== "production" && process.env.DEV_DB_WRITER_LOCK_HELD !== "1") {
  throw new Error("[startup] Development API must be started through the exclusive database writer lock");
}

// ── Restore from Object Storage BEFORE opening the database ──────────────────
// Must happen before ANY import of db.ts — db.ts opens the SQLite connection
// at module load time, so the restored file must be in place first.
const dbPath = getDefaultDbPath();
logger.info({
  dbPath,
  ...(process.env.NODE_ENV === "production" ? {} : { writerId: getBackupWriterId() }),
}, "[startup] restoreDbFromStorage: checking object storage...");
await restoreDbFromStorage(dbPath);
logger.info("[startup] restoreDbFromStorage: done — opening database");

// ── Dynamic imports AFTER restore so SQLite opens the (possibly restored) file ─
const { default: db, checkpointWAL } = await import("./lib/db.js");
const { default: app }               = await import("./app.js");
const { backfillRentalPortalUsers }   = await import("./lib/rental-portal-users.js");
const { startVehicleStopMonitor }    = await import("./lib/vehicle-stop-monitor.js");
const { startSlaMonitor }            = await import("./lib/sla-monitor.js");
const { startMkghScheduler }         = await import("./lib/mkgh-scheduler.js");
const { startNightlyStopScheduler }  = await import("./lib/vehicle-stop-scheduler.js");
const { attachChatRealtime }        = await import("./lib/chat-realtime.js");
const { startChatBackgroundServices } = await import("./lib/chat-maintenance.js");

async function startServer() {
  const portalBackfill = backfillRentalPortalUsers();
  logger.info(portalBackfill, "[backfill] Rental customer accounts");
  // ‼️ Remove legacy numeric-only "1909" plate (duplicate of "1909 أ ب ت", id=1).
  try { db.prepare("DELETE FROM fleet_vehicles WHERE plate_number=?").run("1909"); } catch {}

  // ── Seed test users ──────────────────────────────────────────────────────────
  try {
    const seedUsers: [string, string, string, string][] = [
      ["مشرف الدينه والأوناش", "0500000011", "123456", "crane_traffic_supervisor"],
    ];
    for (const [name, phone, password, role] of seedUsers) {
      const exists = db.prepare("SELECT id FROM users WHERE phone=?").get(phone);
      if (!exists) {
        db.prepare("INSERT INTO users (name,phone,password,role,approval_status,active) VALUES (?,?,?,?,?,?)")
          .run(name, phone, password, role, "approved", 1);
        logger.info({ phone, role }, "[seed] Created missing test user");
      }
    }
  } catch (err) {
    logger.warn({ err }, "[seed] Test user seed failed — non-fatal");
  }

  // ── Backfill: ensure every active product has a warehouse_item in every active warehouse ──
  try {
    const warehouses = db.prepare("SELECT id FROM warehouses WHERE active=1").all() as { id: number }[];
    const products   = db.prepare("SELECT id, name, unit FROM products WHERE active=1").all() as { id: number; name: string; unit: string }[];
    const check = db.prepare("SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_id=?");
    const ins   = db.prepare("INSERT INTO warehouse_items (warehouse_id,product_name,product_id,quantity,unit,min_stock) VALUES (?,?,?,0,?,0)");
    let added = 0;
    for (const w of warehouses) {
      for (const p of products) {
        if (!check.get(w.id, p.id)) { ins.run(w.id, p.name, p.id, p.unit); added++; }
      }
    }
    if (added > 0) logger.info({ added }, "[backfill] Added missing warehouse_items");
  } catch (err) {
    logger.warn({ err }, "[backfill] warehouse_items backfill failed — non-fatal");
  }

  // Claim storage authority before opening the listener. Otherwise an older
  // process can accept writes during deployment before it notices the fence.
  let initialBackupReady = false;
  try {
    await uploadDbBackup(dbPath, checkpointWAL);
    initialBackupReady = true;
  } catch (err) {
    logger.error({ err }, "[startup] Initial database backup failed; refusing to accept writes");
    throw err;
  }

  const server = createServer(app);
  const closeChatRealtime = attachChatRealtime(server);
  server.once("error", err => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
  server.listen(port, () => {
    logger.info({ port }, "Server listening");
    startVehicleStopMonitor();
    startSlaMonitor();
    startMkghScheduler();
    startNightlyStopScheduler();
    startChatBackgroundServices();

    // Start periodic backup every 30 s (fires immediately on first tick too).
    startPeriodicDbBackup(dbPath, 30_000, checkpointWAL, initialBackupReady);
  });

  registerStaleWriterShutdown(() => new Promise<void>((resolve) => {
    closeChatRealtime();
    server.close(() => resolve());
  }));

  registerShutdownBackup(dbPath, checkpointWAL, () => new Promise<void>((resolve, reject) => {
    logger.info("[shutdown] Stopping new requests and draining active requests");
    closeChatRealtime();
    server.close(err => {
      if (err) {
        reject(err);
        return;
      }
      logger.info("[shutdown] Active requests drained");
      resolve();
    });
  }));
}

startServer().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
