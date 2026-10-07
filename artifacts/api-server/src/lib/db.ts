import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
import { getDefaultDbPath } from "./db-sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.dirname(getDefaultDbPath());
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const UPLOADS_PATH = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOADS_PATH)) fs.mkdirSync(UPLOADS_PATH, { recursive: true });

export const DB_PATH = getDefaultDbPath();

function openDb(): Database.Database {
  try {
    const d = new Database(DB_PATH);
    d.pragma("journal_mode = WAL");
    d.pragma("foreign_keys = ON");
    return d;
  } catch (err: any) {
    if (err?.code === "SQLITE_CORRUPT") {
      console.error("[db] SQLITE_CORRUPT — refusing to delete or replace the database automatically");
    }
    throw err;
  }
}

const db = openDb();

// ─── Existing ERP Tables ─────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, job_title TEXT, department TEXT,
    nationality TEXT, phone TEXT, email TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'worker',
    status TEXT DEFAULT 'active', salary REAL DEFAULT 0, hire_date TEXT,
    iqama_no TEXT, iqama_start TEXT, iqama_end TEXT,
    work_permit_start TEXT, work_permit_end TEXT,
    driver_license_no TEXT, driver_license_end TEXT,
    permissions TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER REFERENCES employees(id),
    employee_name TEXT, leave_type TEXT, from_date TEXT, to_date TEXT, days INTEGER,
    reason TEXT, status TEXT DEFAULT 'pending', reviewed_by TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, department TEXT NOT NULL, details TEXT,
    amount REAL, image_url TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, car_id TEXT NOT NULL,
    driver_name TEXT, driver_phone TEXT, client_name TEXT, material_type TEXT, destination TEXT,
    trips_count INTEGER DEFAULT 1, unit_price REAL DEFAULT 0, total_amount REAL DEFAULT 0,
    vat REAL DEFAULT 0, net_amount REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS fleet_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, car_id TEXT,
    expense_category TEXT, description TEXT, amount REAL NOT NULL, document_number TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS petty_cash (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, custodian_name TEXT,
    transaction_type TEXT, description TEXT, amount_in REAL DEFAULT 0, amount_out REAL DEFAULT 0,
    receipt_number TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS fleet_vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, plate_number TEXT UNIQUE NOT NULL, vehicle_type TEXT,
    status TEXT DEFAULT 'available', driver_name TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS workshop (
    id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT, issue_desc TEXT, technician TEXT,
    status TEXT DEFAULT 'open', cost REAL DEFAULT 0, start_date TEXT, end_date TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── New Platform Tables ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    phone       TEXT    UNIQUE NOT NULL,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'customer',
    email       TEXT,
    company_name TEXT,
    vat_number  TEXT,
    cr_number   TEXT,
    active      INTEGER DEFAULT 1,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT    PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    expires_at  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT    NOT NULL,
    description           TEXT,
    image_url             TEXT,
    price_per_unit        REAL    DEFAULT 0,
    price_delivered       REAL    DEFAULT 0,
    price_truck_buraydah  REAL    DEFAULT 0,
    unit                  TEXT    DEFAULT 'كيس',
    category              TEXT,
    stock                 INTEGER DEFAULT 0,
    active                INTEGER DEFAULT 1,
    sort_order            INTEGER DEFAULT 0,
    created_at            TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS product_ratings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id    INTEGER REFERENCES products(id),
    customer_phone TEXT,
    customer_name  TEXT,
    rating         INTEGER DEFAULT 5,
    comment        TEXT,
    created_at     TEXT   DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workflow_orders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number        TEXT    UNIQUE NOT NULL,
    customer_phone      TEXT    NOT NULL,
    customer_name       TEXT,
    rep_id              INTEGER REFERENCES users(id),
    product_id          INTEGER REFERENCES products(id),
    product_name        TEXT,
    quantity            REAL    NOT NULL,
    unit                TEXT,
    unit_price          REAL    DEFAULT 0,
    total_before_vat    REAL    DEFAULT 0,
    vat_amount          REAL    DEFAULT 0,
    total_with_vat      REAL    DEFAULT 0,
    delivery_location   TEXT,
    delivery_lat        REAL,
    delivery_lng        REAL,
    destination_type    TEXT    DEFAULT 'مستودع',
    stage               TEXT    DEFAULT 'pending',
    reviewer_id         INTEGER REFERENCES users(id),
    reviewer_name       TEXT,
    review_date         TEXT,
    payment_transfer_ref TEXT,
    payment_amount      REAL,
    supervisor_id       INTEGER REFERENCES users(id),
    vehicle_id          INTEGER REFERENCES fleet_vehicles(id),
    vehicle_plate       TEXT,
    vehicle_assign_date TEXT,
    warehouse_id        INTEGER REFERENCES users(id),
    invoice_number      TEXT,
    invoice_image_url   TEXT,
    invoice_date        TEXT,
    driver_id           INTEGER REFERENCES users(id),
    driver_name         TEXT,
    driver_phone        TEXT,
    loading_photo_url   TEXT,
    loading_date        TEXT,
    delivery_date       TEXT,
    delivery_notes      TEXT,
    cancel_reason       TEXT,
    created_at          TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customer_transfers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone  TEXT    NOT NULL,
    customer_name   TEXT,
    amount          REAL    NOT NULL,
    transfer_date   TEXT    NOT NULL,
    transfer_ref    TEXT,
    bank_name       TEXT,
    transfer_image  TEXT,
    confirmed       INTEGER DEFAULT 0,
    confirmed_by    TEXT,
    confirmed_date  TEXT,
    notes           TEXT,
    created_at      TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone  TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    body        TEXT,
    data        TEXT,
    read        INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_conversations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_low_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    retention_mode    TEXT NOT NULL DEFAULT 'auto_delete' CHECK (retention_mode IN ('auto_delete','keep')),
    retention_days    INTEGER NOT NULL DEFAULT 45,
    allow_user_delete INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (user_low_id < user_high_id),
    UNIQUE (user_low_id, user_high_id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER NOT NULL REFERENCES users(id),
    message_type    TEXT NOT NULL CHECK (message_type IN ('text','voice')),
    text            TEXT,
    media_path      TEXT,
    media_type      TEXT,
    media_size      INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    edited_at       TEXT,
    CHECK (
      (message_type='text' AND text IS NOT NULL AND media_path IS NULL) OR
      (message_type='voice' AND text IS NULL AND media_path IS NOT NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS chat_message_reads (
    message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (message_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS chat_upload_tokens (
    token_hash      TEXT PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    object_path     TEXT NOT NULL UNIQUE,
    media_type      TEXT NOT NULL,
    expected_size   INTEGER NOT NULL,
    expires_at      TEXT NOT NULL,
    consumed_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_notification_preferences (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    messages_enabled INTEGER NOT NULL DEFAULT 1,
    orders_enabled   INTEGER NOT NULL DEFAULT 1,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_push_subscriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_push_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_id INTEGER NOT NULL UNIQUE,
    attempts        INTEGER NOT NULL DEFAULT 0,
    processed_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_realtime_events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_json       TEXT NOT NULL,
    expires_at       TEXT NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_calls (
    call_id         TEXT PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    caller_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    callee_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_type      TEXT NOT NULL CHECK (media_type IN ('audio','video')),
    status          TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','active')),
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_vapid_keys (
    id                    INTEGER PRIMARY KEY CHECK (id=1),
    public_key            TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    created_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_chat_conversations_low_updated
    ON chat_conversations(user_low_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_conversations_high_updated
    ON chat_conversations(user_high_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
    ON chat_messages(conversation_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_retention
    ON chat_messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_upload_expiry
    ON chat_upload_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_chat_realtime_recipient
    ON chat_realtime_events(recipient_user_id, id);
  CREATE INDEX IF NOT EXISTS idx_chat_calls_expiry
    ON chat_calls(expires_at);

  CREATE TRIGGER IF NOT EXISTS notifications_queue_browser_push
  AFTER INSERT ON notifications
  BEGIN
    INSERT OR IGNORE INTO chat_push_queue (notification_id) VALUES (NEW.id);
  END;
`);

// Read-path indexes for the fleet, driver, trip, and notification screens.
// These only accelerate lookups; they do not change stored records.
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_orders_stage
      ON workflow_orders(stage);
    CREATE INDEX IF NOT EXISTS idx_workflow_orders_vehicle_plate
      ON workflow_orders(vehicle_plate);
    CREATE INDEX IF NOT EXISTS idx_workflow_orders_driver_phone
      ON workflow_orders(driver_phone);
    CREATE INDEX IF NOT EXISTS idx_trips_driver_name
      ON trips(driver_name);
    CREATE INDEX IF NOT EXISTS idx_driver_profiles_vehicle_plate
      ON driver_profiles(vehicle_plate);
    CREATE INDEX IF NOT EXISTS idx_vehicle_compliance_docs_car_number
      ON vehicle_compliance_docs(car_number);
    CREATE INDEX IF NOT EXISTS idx_vehicle_type_assignments_plate_number
      ON vehicle_type_assignments(plate_number);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON notifications(user_phone, created_at DESC);
  `);
} catch (err) {
  console.warn("[db] Fleet read indexes could not be created; continuing without them:", err);
}

// ─── Backward-compat: add columns to existing DBs ────────────────────────────
try { db.exec("ALTER TABLE products ADD COLUMN price_delivered REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN price_truck_buraydah REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'approved'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN register_note TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN vehicle_password TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN gps_device_id TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN driver_lat REAL"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN driver_lng REAL"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN driver_location_updated_at TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN payment_method TEXT DEFAULT 'transfer'"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN bank_receipt_image TEXT"); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN load_capacity INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN address TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN city TEXT"); } catch {}
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN customer_name TEXT"); } catch {}
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN rep_name TEXT"); } catch {}
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN override_loading_place TEXT"); } catch {}
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN override_unloading_place TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN photo_url TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN fingerprint_url TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN signature_url TEXT"); } catch {}
try { db.exec("ALTER TABLE loading_orders ADD COLUMN loading_invoice_url TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN license_expiry TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN operation_card_expiry TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN iqama_image_url TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN iqama_pdf_url TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN iqama_expiry TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN delegated_form_image_url TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN delegated_form_pdf_url TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN delegated_form_expiry TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN create_request_id TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_profiles ADD COLUMN salary REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN price_locked INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE supervisor_settings ADD COLUMN whatsapp_order_phone TEXT DEFAULT '0571748370'"); } catch {}

// ─── Offers (عروض وتخفيضات) ──────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS offers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT,
    image_url   TEXT,
    discount_pct REAL   DEFAULT 0,
    valid_from  TEXT,
    valid_until TEXT,
    active      INTEGER DEFAULT 1,
    created_by  TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rental_vehicle_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT,
    icon        TEXT    DEFAULT '🚛',
    active      INTEGER DEFAULT 1,
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── Client-Rep Association ───────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS client_rep_links (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone  TEXT    NOT NULL,
    rep_phone       TEXT    NOT NULL,
    link_status     TEXT    DEFAULT 'pending_rep_approval',
    linked_at       TEXT    DEFAULT (datetime('now')),
    approved_at     TEXT,
    UNIQUE(customer_phone, rep_phone)
  );

  CREATE TABLE IF NOT EXISTS rep_targets (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    rep_phone        TEXT    NOT NULL,
    product_category TEXT    NOT NULL,
    target_qty       REAL    DEFAULT 0,
    tier1_qty        REAL    DEFAULT 0,
    tier1_bonus      REAL    DEFAULT 0,
    tier2_qty        REAL    DEFAULT 0,
    tier2_bonus      REAL    DEFAULT 0,
    tier3_qty        REAL    DEFAULT 0,
    tier3_bonus      REAL    DEFAULT 0,
    period           TEXT    DEFAULT 'monthly',
    start_date       TEXT,
    end_date         TEXT,
    active           INTEGER DEFAULT 1,
    created_at       TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── External Rentals new columns ────────────────────────────────────────────
try { db.exec("ALTER TABLE external_rentals ADD COLUMN pickup_location TEXT"); } catch {}
try { db.exec("ALTER TABLE external_rentals ADD COLUMN pickup_lat REAL"); } catch {}
try { db.exec("ALTER TABLE external_rentals ADD COLUMN pickup_lng REAL"); } catch {}
try { db.exec("ALTER TABLE external_rentals ADD COLUMN destination_location TEXT"); } catch {}
try { db.exec("ALTER TABLE external_rentals ADD COLUMN destination_lat REAL"); } catch {}
try { db.exec("ALTER TABLE external_rentals ADD COLUMN destination_lng REAL"); } catch {}
try { db.exec("ALTER TABLE external_rentals ADD COLUMN lease_proposal TEXT"); } catch {}
try { db.exec("ALTER TABLE external_rentals ADD COLUMN driver_bonus REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE external_rentals ADD COLUMN driver_phone TEXT"); } catch {}

// ─── Seed default rental vehicle types if empty ───────────────────────────────
try {
  const count = (db.prepare("SELECT COUNT(*) as c FROM rental_vehicle_types").get() as {c:number}).c;
  if (count === 0) {
    const types = [
      { name: "سطحة",       icon: "🚛", sort_order: 1 },
      { name: "قلاب",       icon: "🚚", sort_order: 2 },
      { name: "سيارة نقل",  icon: "🚐", sort_order: 3 },
      { name: "شاحنة",      icon: "🔩", sort_order: 4 },
      { name: "رافعة",      icon: "🏗️",  sort_order: 5 },
    ];
    types.forEach(t => db.prepare(
      "INSERT INTO rental_vehicle_types (name,icon,sort_order) VALUES (?,?,?)"
    ).run(t.name, t.icon, t.sort_order));
  }
} catch {}

// ─── External Rentals (تأجير خارجي) ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS external_rentals (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone       TEXT    NOT NULL,
    customer_name        TEXT,
    vehicle_type         TEXT    NOT NULL DEFAULT 'سطحة',
    start_date           TEXT    NOT NULL,
    duration_type        TEXT    NOT NULL DEFAULT 'محددة',
    duration_days        INTEGER DEFAULT 1,
    status               TEXT    DEFAULT 'pending',
    payment_method       TEXT    DEFAULT 'transfer',
    payment_status       TEXT    DEFAULT 'pending',
    notes                TEXT,
    assigned_vehicle     TEXT,
    assigned_driver      TEXT,
    assigned_by          TEXT,
    assigned_at          TEXT,
    total_price          REAL    DEFAULT 0,
    pickup_location      TEXT,
    pickup_lat           REAL,
    pickup_lng           REAL,
    destination_location TEXT,
    destination_lat      REAL,
    destination_lng      REAL,
    lease_proposal       TEXT,
    driver_bonus         REAL    DEFAULT 0,
    driver_phone         TEXT,
    driver_stage         TEXT    DEFAULT NULL,
    driver_stage_at      TEXT    DEFAULT NULL,
    payment_type         TEXT    DEFAULT 'transfer',
    created_at           TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── Employee passwords = phone number (non-admin staff) ──────────────────────
// Only set password=phone for staff who have no password yet (first-time init only)
try {
  db.exec("UPDATE users SET password = phone WHERE role NOT IN ('customer') AND role != 'admin' AND (password IS NULL OR TRIM(password) = '')");
} catch {}

// ─── Sync employees table → users (role='employee') ───────────────────────────
// Employees with a phone number
try {
  db.exec(`
    INSERT OR IGNORE INTO users (name, phone, password, role, approval_status)
    SELECT name, phone, phone, 'employee', 'approved'
    FROM employees
    WHERE phone IS NOT NULL AND TRIM(phone) != ''
      AND phone NOT IN (SELECT phone FROM users WHERE phone IS NOT NULL)
  `);
} catch {}
// Employees with no phone → use 'EMP' || id as identifier
try {
  db.exec(`
    INSERT OR IGNORE INTO users (name, phone, password, role, approval_status)
    SELECT name, 'EMP' || id, 'EMP' || id, 'employee', 'approved'
    FROM employees
    WHERE (phone IS NULL OR TRIM(phone) = '')
      AND ('EMP' || id) NOT IN (SELECT phone FROM users WHERE phone IS NOT NULL)
  `);
} catch {}

// ─── Breakdown reports table ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS breakdown_reports (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_phone   TEXT    NOT NULL,
    driver_name    TEXT,
    vehicle_id     INTEGER,
    vehicle_plate  TEXT,
    breakdown_type TEXT    NOT NULL,
    description    TEXT,
    photo_url      TEXT,
    status         TEXT    DEFAULT 'open',
    resolved_by    TEXT,
    resolve_notes  TEXT,
    resolved_at    TEXT,
    created_at     TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── Workshop Jobs (أوامر العمل) ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS workshop_jobs (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_plate        TEXT,
    breakdown_report_id  INTEGER REFERENCES breakdown_reports(id),
    title                TEXT    NOT NULL,
    job_type             TEXT    NOT NULL DEFAULT 'صيانة_مباشرة',
    description          TEXT,
    parts_used           TEXT,
    labor_cost           REAL    DEFAULT 0,
    parts_cost           REAL    DEFAULT 0,
    total_cost           REAL    DEFAULT 0,
    invoice_target       TEXT    DEFAULT 'vehicle',
    status               TEXT    DEFAULT 'open',
    created_by           TEXT,
    notes                TEXT,
    created_at           TEXT    DEFAULT (datetime('now')),
    completed_at         TEXT
  );
`);

// ─── Workshop Inventory (مخزون الورشة) ────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS workshop_inventory (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name     TEXT    NOT NULL,
    item_code     TEXT,
    category      TEXT    DEFAULT 'عام',
    quantity      REAL    DEFAULT 0,
    unit          TEXT    DEFAULT 'قطعة',
    min_stock     REAL    DEFAULT 0,
    cost_per_unit REAL    DEFAULT 0,
    supplier      TEXT,
    last_updated  TEXT    DEFAULT (datetime('now')),
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_by    TEXT
  );
`);

// ─── Workshop Inventory Transactions (سجل حركة المخزون) ──────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS workshop_inventory_transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id       INTEGER NOT NULL,
    item_name     TEXT    NOT NULL,
    type          TEXT    NOT NULL,
    quantity      REAL    NOT NULL,
    cost_per_unit REAL    DEFAULT 0,
    reason        TEXT,
    reference_no  TEXT,
    created_by    TEXT,
    created_at    TEXT    DEFAULT (datetime('now'))
  );
`);
// safe migrations
try { db.exec(`ALTER TABLE workshop_inventory_transactions ADD COLUMN cost_per_unit REAL DEFAULT 0`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE workshop_inventory_transactions ADD COLUMN vehicle_no TEXT`); } catch { /* already exists */ }
// Track who last modified each inventory item
try { db.exec(`ALTER TABLE workshop_inventory ADD COLUMN updated_by TEXT`); } catch { /* already exists */ }
// Unique index on item_code (non-null only) — prevents duplicate codes
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_workshop_inv_item_code ON workshop_inventory(item_code) WHERE item_code IS NOT NULL AND item_code != ''`); } catch { /* already exists */ }

// ─── Purchase Requests (طلبات الشراء) ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS purchase_requests (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name         TEXT    NOT NULL,
    quantity          REAL    NOT NULL,
    unit              TEXT    DEFAULT 'قطعة',
    reason            TEXT,
    workshop_job_id   INTEGER REFERENCES workshop_jobs(id),
    requested_by      TEXT    NOT NULL,
    status            TEXT    DEFAULT 'pending',
    approved_by       TEXT,
    rejection_reason  TEXT,
    estimated_cost    REAL    DEFAULT 0,
    actual_cost       REAL    DEFAULT 0,
    supplier          TEXT,
    received_at       TEXT,
    created_at        TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── Trip Bonus Rates (بونص السائق حسب حالة الرحلة) ──────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS trip_bonus_rates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    state      TEXT    UNIQUE NOT NULL,
    rate_per_km REAL   DEFAULT 0,
    updated_at TEXT   DEFAULT (datetime('now'))
  );
`);
{
  const states = [
    "سطحة محملة", "قلاب محمل", "بلكر محمل",
    "راس فقط", "رجوع خالي", "عطل / صيانة", "فحص",
  ];
  for (const state of states) {
    try {
      db.prepare("INSERT OR IGNORE INTO trip_bonus_rates (state, rate_per_km) VALUES (?,?)").run(state, 0);
    } catch { /* ignore */ }
  }
}

// ─── Trip state + distance columns on trips ───────────────────────────────────
try { db.exec("ALTER TABLE trips ADD COLUMN trip_state TEXT DEFAULT 'سطحة محملة'"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN distance_km REAL DEFAULT 0"); } catch {}
// ─── Extended trips columns (vehicle trips sheet) ─────────────────────────────
try { db.exec("ALTER TABLE trips ADD COLUMN payment_voucher TEXT"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN loading_card_no TEXT"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN vehicle_type TEXT"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN meter_ton REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN return_value_no_vat REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN supplier TEXT"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN material_expense_diesel REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN work_value REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN image_url TEXT"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN notes TEXT"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN cash_collection REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN invoice_data_source TEXT"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN invoice_data_status TEXT"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN invoice_data_run_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN invoice_identity_status TEXT"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN invoice_identity_updated_at TEXT"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS trip_invoice_bulk_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    status      TEXT NOT NULL DEFAULT 'completed',
    created_at  TEXT DEFAULT (datetime('now')),
    undone_at   TEXT
  );
  CREATE TABLE IF NOT EXISTS trip_invoice_bulk_changes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER NOT NULL REFERENCES trip_invoice_bulk_runs(id),
    trip_id     INTEGER NOT NULL REFERENCES trips(id),
    before_json TEXT NOT NULL,
    after_json  TEXT NOT NULL,
    changed_at  TEXT DEFAULT (datetime('now')),
    undone_at   TEXT
  );
`);

// ─── Vehicle Compliance Documents (وثائق الامتثال) ───────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicle_compliance_docs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    car_number TEXT    NOT NULL,
    doc_type   TEXT    NOT NULL,
    start_date TEXT,
    end_date   TEXT,
    image_url  TEXT,
    notes      TEXT,
    created_at TEXT    DEFAULT (datetime('now')),
    updated_at TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── Vehicle Breakdowns (تبليغات الأعطال) ─────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicle_breakdowns (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    car_number        TEXT    NOT NULL,
    driver_name       TEXT,
    driver_phone      TEXT,
    operational_state TEXT,
    action_taken      TEXT,
    description       TEXT,
    photo_url         TEXT,
    status            TEXT    DEFAULT 'open',
    invoice_image_url TEXT,
    resolved_by       TEXT,
    resolve_notes     TEXT,
    resolved_at       TEXT,
    created_at        TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── Alter breakdown_reports for new fields ────────────────────────────────────
try { db.exec("ALTER TABLE breakdown_reports ADD COLUMN operational_state TEXT"); } catch {}
try { db.exec("ALTER TABLE breakdown_reports ADD COLUMN action_taken TEXT"); } catch {}
try { db.exec("ALTER TABLE breakdown_reports ADD COLUMN invoice_image_url TEXT"); } catch {}

// ─── Chart of Accounts (دليل الحسابات — ثابت حسب BRD) ────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS chart_of_accounts (
    code        TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL,  -- asset | liability | revenue | expense
    normal_side TEXT    NOT NULL   -- debit | credit
  );
`);
{
  const accounts = [
    { code: "1010", name: "النقدية",                         type: "asset",     normal_side: "debit"  },
    { code: "1020", name: "البنك",                           type: "asset",     normal_side: "debit"  },
    { code: "1030", name: "الذمم المدينة - العملاء",         type: "asset",     normal_side: "debit"  },
    { code: "1040", name: "مخزون قطع الغيار",               type: "asset",     normal_side: "debit"  },
    { code: "2010", name: "ضريبة القيمة المضافة المستحقة",  type: "liability", normal_side: "credit" },
    { code: "2020", name: "مستحقات السائقين",               type: "liability", normal_side: "credit" },
    { code: "2030", name: "الموردون",                        type: "liability", normal_side: "credit" },
    { code: "4010", name: "إيرادات المبيعات",               type: "revenue",   normal_side: "credit" },
    { code: "4020", name: "إيرادات النقل",                  type: "revenue",   normal_side: "credit" },
    { code: "5010", name: "تكاليف الصيانة",                 type: "expense",   normal_side: "debit"  },
    { code: "5020", name: "تكاليف المشتريات",               type: "expense",   normal_side: "debit"  },
    { code: "5030", name: "عمولات ومستحقات السائقين",       type: "expense",   normal_side: "debit"  },
  ];
  const ins = db.prepare("INSERT OR IGNORE INTO chart_of_accounts (code,name,type,normal_side) VALUES (?,?,?,?)");
  for (const a of accounts) ins.run(a.code, a.name, a.type, a.normal_side);
}

// ─── Journal Entries (قيود اليومية) ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS journal_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date      TEXT    NOT NULL DEFAULT (date('now')),
    reference_type  TEXT    NOT NULL,   -- invoice | payment_cash | payment_bank | purchase_receive | job_inventory | job_external | settlement_create | settlement_pay | manual | reversal
    reference_id    TEXT,               -- order_number / job_id / settlement_id / etc.
    debit_account   TEXT    NOT NULL REFERENCES chart_of_accounts(code),
    credit_account  TEXT    NOT NULL REFERENCES chart_of_accounts(code),
    amount          REAL    NOT NULL,
    description     TEXT,
    created_by      TEXT,
    created_at      TEXT    DEFAULT (datetime('now'))
  );

  -- Idempotency guard: prevent duplicate automatic entries for the same event.
  -- Manual and reversal types are excluded (they can legitimately repeat).
  CREATE UNIQUE INDEX IF NOT EXISTS idx_je_idempotent
    ON journal_entries(reference_type, reference_id, debit_account, credit_account)
    WHERE reference_type NOT IN ('manual', 'reversal');
`);

// ─── Suppliers (الموردين) ─────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    phone       TEXT,
    specialty   TEXT,
    notes       TEXT,
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT    DEFAULT (datetime('now'))
  );
`);
// Link purchase_requests to suppliers
try { db.exec("ALTER TABLE purchase_requests ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)"); } catch {}

// ─── SLA Settings (إعدادات SLA) ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sla_settings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    stage         TEXT    UNIQUE NOT NULL,   -- pending | payment_confirmed | vehicle_assigned | invoiced
    limit_minutes INTEGER NOT NULL DEFAULT 120,
    updated_at    TEXT    DEFAULT (datetime('now'))
  );
`);
{
  // Seed defaults from BRD §6.16
  const slaDefaults = [
    { stage: "pending",           limit_minutes: 120 },
    { stage: "payment_confirmed", limit_minutes: 240 },
    { stage: "vehicle_assigned",  limit_minutes:  60 },
    { stage: "invoiced",          limit_minutes:  30 },
  ];
  const ins = db.prepare("INSERT OR IGNORE INTO sla_settings (stage, limit_minutes) VALUES (?,?)");
  for (const r of slaDefaults) ins.run(r.stage, r.limit_minutes);
}

// SLA notification tracking columns on workflow_orders
// sla_warning_stage: stage for which the 75% warning was already sent
// sla_breach_stage:  stage for which the 100% breach was already sent
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN sla_warning_stage TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN sla_breach_stage  TEXT"); } catch {}

// ─── AI chat messages ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    user_phone TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Seed data ────────────────────────────────────────────────────────────────
const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as {c:number}).c;
if (userCount === 0) {
  const ins = db.prepare("INSERT INTO users (name,phone,password,role,company_name,vat_number,approval_status) VALUES (?,?,?,?,?,?,?)");
  ins.run("المدير العام",          "0500000000","admin123","admin",           "شركة MKGH","310000000000003","approved");
  ins.run("أحمد المراجع",         "0500000001","123456",  "reviewer",        null,null,"approved");
  ins.run("خالد مشرف النقليات",   "0500000002","123456",  "supervisor",      null,null,"approved");
  ins.run("محمد المستودع",        "0500000003","123456",  "warehouse",       null,null,"approved");
  ins.run("عبد الهادي السائق",    "0500000004","123456",  "driver",          null,null,"approved");
  ins.run("سالم المندوب",         "0500000005","123456",  "rep",             null,null,"approved");
  ins.run("فهد مدير الورشة",      "0500000006","123456",  "workshop_manager",null,null,"approved");
  ins.run("ناصر مسئول المشتريات", "0500000007","123456",  "purchasing",      null,null,"approved");
  ins.run("عميل تجريبي",          "0555555555","123456",  "customer",        "مؤسسة البناء","310000000000999","approved");
  ins.run("عميل ثاني",            "0555555556","123456",  "customer",        "شركة العمارة",null,"approved");
}

// ─── Ensure core system users exist (INSERT only — never overwrite existing data) ──
{
  const coreUsers = [
    ["المدير العام","0500000000","admin123","admin","شركة MKGH","310000000000003"],
    ["أحمد المراجع","0500000001","123456","reviewer",null,null],
    ["خالد مشرف النقليات","0500000002","123456","supervisor",null,null],
    ["محمد المستودع","0500000003","123456","warehouse",null,null],
    ["عبد الهادي السائق","0500000004","123456","driver",null,null],
    ["سالم المندوب","0500000005","123456","rep",null,null],
    ["فهد مدير الورشة","0500000006","123456","workshop_manager",null,null],
    ["ناصر مسئول المشتريات","0500000007","123456","purchasing",null,null],
    ["عميل تجريبي","0555555555","123456","customer","مؤسسة البناء","310000000000999"],
    // jefer/jefer — alternative admin account for JEFER-MKGH-ERP system
    ["المدير العام — JEFER","jefer","jefer","admin","شركة جيفر التجارية",null],
  ];
  for (const [name, phone, pw, role, company, vat] of coreUsers) {
    const existing = db.prepare("SELECT id FROM users WHERE phone=?").get(phone) as { id: number } | undefined;
    if (!existing) {
      // Only insert if user doesn't exist — never update passwords or data of existing users
      db.prepare("INSERT OR IGNORE INTO users (name,phone,password,role,company_name,vat_number,approval_status,active) VALUES (?,?,?,?,?,?,?,1)")
        .run(name, phone, pw, role, company, vat, "approved");
    }
    // NOTE: existing users are left untouched — their passwords and data are preserved
  }
}

// ─── Add workshop_manager + purchasing seed users if missing ─────────────────
try {
  if (!db.prepare("SELECT id FROM users WHERE phone='0500000006'").get()) {
    db.prepare("INSERT INTO users (name,phone,password,role,approval_status,active) VALUES (?,?,?,?,?,?)").run("فهد مدير الورشة","0500000006","123456","workshop_manager","approved",1);
  }
  if (!db.prepare("SELECT id FROM users WHERE phone='0500000007'").get()) {
    db.prepare("INSERT INTO users (name,phone,password,role,approval_status,active) VALUES (?,?,?,?,?,?)").run("ناصر مسئول المشتريات","0500000007","123456","purchasing","approved",1);
  }
} catch { /* ignore */ }

const productCount = (db.prepare("SELECT COUNT(*) as c FROM products").get() as {c:number}).c;
if (productCount === 0) {
  const ip = db.prepare("INSERT INTO products (name,description,price_per_unit,price_delivered,price_truck_buraydah,unit,category,stock,sort_order) VALUES (?,?,?,?,?,?,?,?,?)");
  // ─── أسمنت المدينة ─────────────────────────────────────────────────────────
  ip.run("عادي المدينة",    "اسمنت بورتلاندي عادي - مصانع المدينة المنورة",   13, 18, 8000, "كيس", "اسمنت المدينة",  5000, 1);
  ip.run("تشطيب المدينة",  "اسمنت تشطيب عالي الجودة - مصانع المدينة المنورة", 13, 18, 8000, "كيس", "اسمنت المدينة",  3000, 2);
  ip.run("مقاوم المدينة",  "اسمنت مقاوم للكبريتات - مصانع المدينة المنورة",   13, 18, 8000, "كيس", "اسمنت المدينة",  2000, 3);
  // ─── أسمنت القصيم ──────────────────────────────────────────────────────────
  ip.run("عادي قصيم",      "اسمنت بورتلاندي عادي - مصانع القصيم",             13, 18, 8000, "كيس", "اسمنت القصيم",   5000, 4);
  ip.run("تشطيب قصيم",    "اسمنت تشطيب عالي الجودة - مصانع القصيم",           13, 18, 8000, "كيس", "اسمنت القصيم",   3000, 5);
  ip.run("مقاوم قصيم",    "اسمنت مقاوم للكبريتات - مصانع القصيم",             14, 19, 8600, "كيس", "اسمنت القصيم",   2000, 6);
  // ─── أسمنت مكس ─────────────────────────────────────────────────────────────
  ip.run("سمنت مكس",       "خلطة اسمنت جاهزة متعددة الاستخدامات",              15, 20, 9200, "كيس", "اسمنت مكس",      2000, 7);
  // ─── جيفر ──────────────────────────────────────────────────────────────────
  ip.run("جيفر 3 فتحة",   "بلوك جيفر 3 فتحات للبناء الخفيف",                  3,  8, 1500, "حبة", "جيفر",          20000, 8);
  ip.run("جيفر 8 فتحة",   "بلوك جيفر 8 فتحات للعزل والبناء",                  3,  8, 1500, "حبة", "جيفر",          20000, 9);
  ip.run("جيفر 20",        "بلوك جيفر مقاس 20 سم",                             3,  8, 1500, "حبة", "جيفر",          15000, 10);
  // ─── بركاني / بلوك ─────────────────────────────────────────────────────────
  ip.run("بركاني ازرق ابني","بلوك بركاني لون أبيض أو أزرق للأعمال الإنشائية", 3,  8, 1500, "حبة", "بركاني",        10000, 11);
  ip.run("3 فتحة ابني",    "بلوك 3 فتحات لون أبني للبناء العام",               3,  8, 1500, "حبة", "بلوك",          15000, 12);
  ip.run("8 فتحة ابني",    "بلوك 8 فتحات لون أبني للبناء العام",               3,  8, 1500, "حبة", "بلوك",          15000, 13);
  ip.run("3 فتحة زراعة",  "بلوك 3 فتحات للاستخدامات الزراعية وتصريف المياه",  3,  8, 1500, "حبة", "بلوك",          10000, 14);
}

// Seed vehicles if empty
const vCount = (db.prepare("SELECT COUNT(*) as c FROM fleet_vehicles").get() as {c:number}).c;
if (vCount === 0) {
  const iv = db.prepare("INSERT INTO fleet_vehicles (plate_number,vehicle_type,status,driver_name) VALUES (?,?,?,?)");
  iv.run("1909 أ ب ت", "شاحنة نقل", "available", "عبد الهادي");
  iv.run("2345 ج د ه", "قلاب", "available", null);
  iv.run("3678 و ز ح", "بيك أب", "maintenance", null);
}

// ─── Seed specific vehicles with numeric car numbers and passwords ─────────────
{
  const vehicleData = [
    { plate: "1908", pw: "1909" },
    { plate: "1912", pw: "1915" },
    { plate: "1988", pw: "1992" },
    { plate: "5847", pw: "5852" },
    { plate: "5848", pw: "5854" },
    { plate: "1446", pw: "1453" },
    { plate: "1447", pw: "1455" },
    { plate: "9159", pw: "9168" },
    { plate: "9254", pw: "9264" },
    { plate: "9171", pw: "9182" },
    { plate: "2262", pw: "2274" },
    { plate: "2264", pw: "2277" },
    { plate: "2265", pw: "2279" },
    { plate: "2268", pw: "2283" },
    { plate: "6214", pw: "6230" },
    { plate: "9878", pw: "9895" },
    { plate: "6374", pw: "6392" },
    { plate: "6375", pw: "6394" },
  ];
  const insertV = db.prepare(
    "INSERT OR IGNORE INTO fleet_vehicles (plate_number,vehicle_password,vehicle_type,status) VALUES (?,?,'شاحنة','available')"
  );
  const updatePw = db.prepare(
    "UPDATE fleet_vehicles SET vehicle_password=? WHERE plate_number=? AND (vehicle_password IS NULL OR vehicle_password='')"
  );
  for (const v of vehicleData) {
    insertV.run(v.plate, v.pw);
    updatePw.run(v.pw, v.plate);
  }
  // ‼️ Safety guard: remove the legacy numeric-only "1909" plate if it crept back in.
  // The correct entry is "1909 أ ب ت" (id=1). This runs every startup to prevent duplicates.
  try { db.prepare("DELETE FROM fleet_vehicles WHERE plate_number=? AND id != 1").run("1909"); } catch {}
}

// ─── Migrate existing demo products to real MKGH products ─────────────────────
{
  const existing = db.prepare("SELECT id FROM products WHERE name = 'عادي المدينة'").get();
  if (!existing) {
    // deactivate old demo products
    db.prepare("UPDATE products SET active=0").run();
    const ip = db.prepare("INSERT INTO products (name,description,price_per_unit,price_delivered,price_truck_buraydah,unit,category,stock,sort_order) VALUES (?,?,?,?,?,?,?,?,?)");
    ip.run("عادي المدينة",    "اسمنت بورتلاندي عادي - مصانع المدينة المنورة",   13, 18, 8000, "كيس", "اسمنت المدينة",  5000, 1);
    ip.run("تشطيب المدينة",  "اسمنت تشطيب عالي الجودة - مصانع المدينة المنورة", 13, 18, 8000, "كيس", "اسمنت المدينة",  3000, 2);
    ip.run("مقاوم المدينة",  "اسمنت مقاوم للكبريتات - مصانع المدينة المنورة",   13, 18, 8000, "كيس", "اسمنت المدينة",  2000, 3);
    ip.run("عادي قصيم",      "اسمنت بورتلاندي عادي - مصانع القصيم",             13, 18, 8000, "كيس", "اسمنت القصيم",   5000, 4);
    ip.run("تشطيب قصيم",    "اسمنت تشطيب عالي الجودة - مصانع القصيم",           13, 18, 8000, "كيس", "اسمنت القصيم",   3000, 5);
    ip.run("مقاوم قصيم",    "اسمنت مقاوم للكبريتات - مصانع القصيم",             14, 19, 8600, "كيس", "اسمنت القصيم",   2000, 6);
    ip.run("سمنت مكس",       "خلطة اسمنت جاهزة متعددة الاستخدامات",              15, 20, 9200, "كيس", "اسمنت مكس",      2000, 7);
    ip.run("جيفر 3 فتحة",   "بلوك جيفر 3 فتحات للبناء الخفيف",                  3,  8, 1500, "حبة", "جيفر",          20000, 8);
    ip.run("جيفر 8 فتحة",   "بلوك جيفر 8 فتحات للعزل والبناء",                  3,  8, 1500, "حبة", "جيفر",          20000, 9);
    ip.run("جيفر 20",        "بلوك جيفر مقاس 20 سم",                             3,  8, 1500, "حبة", "جيفر",          15000, 10);
    ip.run("بركاني ازرق ابني","بلوك بركاني لون أبيض أو أزرق للأعمال الإنشائية", 3,  8, 1500, "حبة", "بركاني",        10000, 11);
    ip.run("3 فتحة ابني",    "بلوك 3 فتحات لون أبني للبناء العام",               3,  8, 1500, "حبة", "بلوك",          15000, 12);
    ip.run("8 فتحة ابني",    "بلوك 8 فتحات لون أبني للبناء العام",               3,  8, 1500, "حبة", "بلوك",          15000, 13);
    ip.run("3 فتحة زراعة",  "بلوك 3 فتحات للاستخدامات الزراعية وتصريف المياه",  3,  8, 1500, "حبة", "بلوك",          10000, 14);
  }
}

// ─── Backward-compat: add new employee columns to existing DBs ───────────────
const empNewCols: [string, string][] = [
  ["entity",       "TEXT"],
  ["iqama_amount", "REAL DEFAULT 0"],
  ["passport_end", "TEXT"],
  ["vehicle_plate","TEXT"],
  ["efficiency",   "TEXT DEFAULT 'جيد'"],
  ["penalties",    "REAL DEFAULT 0"],
  ["allowances",   "REAL DEFAULT 0"],
  ["bonus",        "REAL DEFAULT 0"],
  ["rewards",      "REAL DEFAULT 0"],
];
for (const [col, type] of empNewCols) {
  try { db.exec(`ALTER TABLE employees ADD COLUMN ${col} ${type}`); } catch {}
}

// ─── HR Requests table ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS hr_requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id   INTEGER,
    employee_name TEXT NOT NULL,
    employee_job  TEXT,
    employee_dept TEXT,
    request_type  TEXT NOT NULL,
    details       TEXT,
    from_date     TEXT,
    to_date       TEXT,
    days          INTEGER,
    status        TEXT DEFAULT 'pending',
    reviewed_by   TEXT,
    review_notes  TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Seed employees ───────────────────────────────────────────────────────────
const empCount = (db.prepare("SELECT COUNT(*) as c FROM employees").get() as {c:number}).c;
if (empCount === 0) {
  db.prepare(`
    INSERT INTO employees
      (name,job_title,entity,department,salary,allowances,bonus,rewards,penalties,
       status,hire_date,iqama_amount,iqama_end,driver_license_end,passport_end,
       vehicle_plate,efficiency)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "محمد غزاله","مطور الشركة","الشركة","التقنية",
    25000,16000,2000,50000,0,
    "يعمل","2024-02-08",100,
    "2027-12-08","2027-12-08","2026-07-08",
    "5930","ممتاز"
  );
}

// ─── Seed 20 demo employees (all branches) ────────────────────────────────────
{
  const exists = db.prepare("SELECT id FROM employees WHERE email = 'abdullah.sahli@mkgh.com'").get();
  if (!exists) {
    const ie = db.prepare(`
      INSERT OR IGNORE INTO employees
        (name,job_title,department,entity,nationality,phone,email,password,role,
         status,salary,allowances,bonus,rewards,penalties,hire_date,
         iqama_no,iqama_amount,iqama_end,driver_license_end,passport_end,efficiency)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    // ── مشرفون سعوديون ──────────────────────────────────────────────────────
    ie.run("عبدالله السهلي","مشرف نقليات","النقليات","النقليات","سعودي","0555100001","abdullah.sahli@mkgh.com","Ab@12345","supervisor","يعمل",8500,2000,500,0,0,"2022-03-01",null,0,"2027-06-01","2028-01-01","2028-06-01","ممتاز");
    ie.run("سعد العتيبي","مشرف مستودع","المستودع","المستودع","سعودي","0555100002","saad.otaibi@mkgh.com","Sa@12345","supervisor","يعمل",7500,1500,500,0,0,"2021-07-15",null,0,"2027-08-01","2027-12-01","2027-08-01","ممتاز");
    ie.run("خالد الرشيدي","مشرف تحميل وتنزيل","العمليات","التحميل","سعودي","0555100003","khaled.rashidi@mkgh.com","Kh@12345","supervisor","يعمل",7000,1500,400,0,0,"2023-01-10",null,0,"2028-03-01","2028-06-01","2029-01-01","جيد جداً");
    ie.run("منصور العنزي","ميكانيكي مشرف","الصيانة","الصيانة","سعودي","0555100004","mansour.anzi@mkgh.com","Mn@12345","worker","يعمل",5500,1000,300,0,0,"2020-05-20",null,0,"2027-11-01","2027-11-01","2028-03-01","جيد جداً");
    ie.run("سعد الغامدي","محاسب","الإدارة","الإدارة","سعودي","0555100005","saad.ghamdi@mkgh.com","Sg@12345","worker","يعمل",6500,1000,400,0,0,"2021-11-01",null,0,null,null,"2028-10-01","ممتاز");
    // ── سائقون ──────────────────────────────────────────────────────────────
    ie.run("فيض الله خان","سائق قلاب","النقليات","النقليات","باكستاني","0555100006","faizullah@mkgh.com","Fz@12345","driver","يعمل",3500,500,200,0,0,"2021-03-15","PKI-001",800,"2026-09-01","2026-09-01","2026-12-01","جيد");
    ie.run("حيدر علي","سائق قلاب","النقليات","النقليات","باكستاني","0555100007","haider.ali@mkgh.com","Hy@12345","driver","يعمل",3500,500,200,0,0,"2022-06-01","PKI-002",800,"2026-11-01","2027-01-01","2027-03-01","جيد");
    ie.run("مكمل خان","سائق سطحة","النقليات","النقليات","باكستاني","0555100008","makmal.khan@mkgh.com","Mk@12345","driver","يعمل",3800,500,200,0,0,"2020-09-10","PKI-003",800,"2025-12-01","2026-06-01","2026-06-01","جيد جداً");
    ie.run("ظهور أحمد","سائق شيول","النقليات","النقليات","باكستاني","0555100009","zuhor.ahmed@mkgh.com","Zh@12345","driver","يعمل",4200,500,300,0,0,"2019-02-01","PKI-004",800,"2026-07-01","2026-07-01","2026-09-01","ممتاز");
    ie.run("عبد الهادي سيف","سائق رافعة","النقليات","النقليات","يمني","0555100010","abdulhadi@mkgh.com","Ah@12345","driver","يعمل",4000,500,200,0,0,"2021-01-05","YEM-001",600,"2026-10-01","2027-02-01","2026-08-01","جيد جداً");
    ie.run("بوتا خان","سائق قلاب","النقليات","النقليات","باكستاني","0555100011","buta.khan@mkgh.com","Bt@12345","driver","يعمل",3500,500,150,0,0,"2023-04-01","PKI-005",800,"2027-04-01","2027-06-01","2027-08-01","جيد");
    ie.run("إبراهيم حسين","سائق سطحة","النقليات","النقليات","إثيوبي","0555100012","ibrahim.h@mkgh.com","Ib@12345","driver","يعمل",3200,500,150,0,0,"2022-08-20","ETH-001",700,"2026-08-01","2026-12-01","2026-10-01","جيد");
    // ── عمال تحميل وتنزيل ───────────────────────────────────────────────────
    ie.run("رمضان محمد","عامل تحميل","العمليات","التحميل","مصري","0555100013","ramadan.m@mkgh.com","Rm@12345","worker","يعمل",2200,300,100,0,0,"2022-05-01","EGY-001",600,"2026-05-01",null,"2026-05-01","جيد");
    ie.run("كمال عبدالله","عامل تنزيل","العمليات","التحميل","مصري","0555100014","kamal.a@mkgh.com","Km@12345","worker","يعمل",2000,300,100,0,0,"2023-02-15","EGY-002",600,"2026-02-01",null,"2026-02-01","جيد");
    ie.run("حسن يوسف","عامل مستودع","المستودع","المستودع","سوداني","0555100015","hasan.y@mkgh.com","Hs@12345","worker","يعمل",1900,300,80,0,0,"2022-11-01","SDN-001",700,"2027-01-01",null,"2027-01-01","جيد");
    ie.run("عمر فاروق","عامل تحميل","العمليات","التحميل","باكستاني","0555100016","omar.f@mkgh.com","Om@12345","worker","يعمل",2000,300,80,0,0,"2023-07-01","PKI-006",800,"2027-07-01",null,"2027-07-01","جيد");
    ie.run("علي أحمد دافري","عامل تنزيل","العمليات","التحميل","إثيوبي","0555100017","ali.a@mkgh.com","Al@12345","worker","يعمل",1800,300,80,0,100,"2023-09-15","ETH-002",700,"2026-09-01",null,"2026-09-01","جيد");
    // ── إداريون ─────────────────────────────────────────────────────────────
    ie.run("خالد المطيري","مساعد إداري","الإدارة","الإدارة","سعودي","0555100018","khaled.mutairi@mkgh.com","Km@67890","worker","يعمل",5000,800,300,0,0,"2022-09-01",null,0,null,null,"2027-09-01","جيد جداً");
    ie.run("أحمد قاسم","مدخل بيانات","الإدارة","الإدارة","يمني","0555100019","ahmed.qasim@mkgh.com","Aq@12345","worker","يعمل",2800,400,150,0,0,"2023-03-01","YEM-002",600,"2027-03-01",null,"2026-12-01","جيد");
    ie.run("صالح الزهراني","مدير إداري","الإدارة","الإدارة","سعودي","0555100020","saleh.zahrani@mkgh.com","Sl@12345","worker","يعمل",5500,800,400,0,0,"2020-01-15",null,0,null,null,"2028-01-01","ممتاز");
  }
}

// ─── Seed demo HR requests ─────────────────────────────────────────────────────
{
  const hrExists = db.prepare("SELECT id FROM hr_requests LIMIT 1").get();
  if (!hrExists) {
    const ihr = db.prepare(`
      INSERT INTO hr_requests (employee_id,employee_name,employee_job,employee_dept,request_type,details,from_date,to_date,days,status,reviewed_by,review_notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    ihr.run(null,"فيض الله خان","سائق قلاب","النقليات","إجازة سنوية","أرغب في أخذ إجازة سنوية للزيارة العائلية","2026-06-01","2026-06-21",21,"approved","عبدالله السهلي","تمت الموافقة");
    ihr.run(null,"حيدر علي","سائق قلاب","النقليات","إجازة مرضية","مريض بالإنفلونزا وأحتاج راحة لمدة أسبوع","2026-05-10","2026-05-16",7,"approved","عبدالله السهلي","تمت الموافقة مع طلب تقرير طبي");
    ihr.run(null,"مكمل خان","سائق سطحة","النقليات","زيادة راتب","أعمل منذ 5 سنوات دون زيادة، أطلب مراجعة الراتب","2026-05-01",null,null,"pending",null,null);
    ihr.run(null,"رمضان محمد","عامل تحميل","العمليات","إجازة سنوية","إجازة لزيارة الأسرة في مصر","2026-07-01","2026-07-30",30,"pending",null,null);
    ihr.run(null,"كمال عبدالله","عامل تنزيل","العمليات","شكوى","تأخر صرف الراتب لشهر أبريل","2026-05-05",null,null,"pending",null,null);
    ihr.run(null,"ظهور أحمد","سائق شيول","النقليات","زيادة راتب","خبرة 7 سنوات في قيادة الشيول، أطلب زيادة قدرها 500 ريال","2026-04-20",null,null,"rejected","عبدالله السهلي","سيتم مراجعة الطلب في نهاية السنة المالية");
    ihr.run(null,"علي أحمد دافري","عامل تنزيل","العمليات","استقالة","أرغب في إنهاء عقد العمل لأسباب شخصية","2026-05-15",null,null,"pending",null,null);
    ihr.run(null,"أحمد قاسم","مدخل بيانات","الإدارة","إجازة طارئة","وفاة في العائلة أحتاج 3 أيام","2026-05-02","2026-05-04",3,"approved","صالح الزهراني","تمت الموافقة وتقديم العزاء");
  }
}

// Import spreadsheet order if not exists.
// This demo-only seed must never prevent the server from starting when an
// existing workflow_orders database/index is damaged. Do not alter or delete
// any existing workflow order in the fallback path.
try {
  const existingOrder = db.prepare("SELECT id FROM workflow_orders WHERE order_number = ?").get("MKGH20260425001417");
  if (!existingOrder) {
    db.prepare(`
      INSERT INTO workflow_orders
        (order_number,customer_phone,customer_name,product_name,quantity,unit,delivery_location,
         delivery_lat,delivery_lng,vehicle_plate,driver_name,driver_phone,stage,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run("MKGH20260425001417","55","عميل قديم","اسمنت عادي مدينة",1,"كيس","المدينة",
      26.414103,43.874256,"1909","عبد الهادي","9","delivered","2026-04-25 00:14:17");
  }
} catch (err) {
  console.warn("[db] Skipping non-critical workflow_orders demo seed because the table could not be read:", err);
}

// ─── Warehouses ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS warehouses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    location      TEXT,
    manager_name  TEXT,
    capacity      INTEGER DEFAULT 0,
    notes         TEXT,
    active        INTEGER DEFAULT 1,
    created_at    TEXT    DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS warehouse_approval_settings (
    warehouse_id      INTEGER PRIMARY KEY REFERENCES warehouses(id) ON DELETE CASCADE,
    requires_approval INTEGER NOT NULL DEFAULT 1,
    updated_at        TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS warehouse_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id  INTEGER REFERENCES warehouses(id),
    product_name  TEXT    NOT NULL,
    product_id    INTEGER REFERENCES products(id),
    quantity      REAL    DEFAULT 0,
    unit          TEXT    DEFAULT 'وحدة',
    min_stock     REAL    DEFAULT 0,
    last_updated  TEXT    DEFAULT (datetime('now')),
    notes         TEXT,
    created_at    TEXT    DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS warehouse_dispatch_orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id    INTEGER NOT NULL REFERENCES warehouses(id),
    warehouse_name  TEXT,
    product_name    TEXT NOT NULL,
    product_id      INTEGER,
    unit            TEXT DEFAULT 'وحدة',
    quantity        REAL NOT NULL DEFAULT 0,
    price           REAL NOT NULL DEFAULT 0,
    payment_status  TEXT DEFAULT 'unpaid',
    recipient_name  TEXT,
    notes           TEXT,
    status          TEXT DEFAULT 'pending',
    created_by      TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    delivered_at    TEXT
  );
`);

// Seed warehouses
const warehouseCount = (db.prepare("SELECT COUNT(*) as c FROM warehouses").get() as {c:number}).c;
if (warehouseCount === 0) {
  const iw = db.prepare("INSERT INTO warehouses (name,location,manager_name,capacity,notes) VALUES (?,?,?,?,?)");
  const w1 = iw.run("مستودع الرياض الرئيسي", "حي الصناعية، الرياض", "محمد المستودع", 50000, "المستودع الرئيسي لتخزين الاسمنت والبلوك");
  const w2 = iw.run("مستودع المدينة المنورة", "المدينة الصناعية، المدينة", "خالد العمري", 30000, "مستودع فرعي");
  const w3 = iw.run("مصنع الإسمنت", "المنطقة الصناعية الثانية", "عبدالله الفهد", 100000, "موقع الإنتاج الرئيسي");

  const ii = db.prepare("INSERT INTO warehouse_items (warehouse_id,product_name,quantity,unit,min_stock) VALUES (?,?,?,?,?)");
  // W1
  ii.run(w1.lastInsertRowid, "اسمنت عادي",          4500, "كيس 50 كجم", 500);
  ii.run(w1.lastInsertRowid, "اسمنت سريع التصلب",   1800, "كيس 50 كجم", 200);
  ii.run(w1.lastInsertRowid, "اسمنت أبيض",           950, "كيس 40 كجم", 100);
  ii.run(w1.lastInsertRowid, "بلوك عادي",           18000, "حبة",        2000);
  ii.run(w1.lastInsertRowid, "بلوك فراغي",          12000, "حبة",        1500);
  // W2
  ii.run(w2.lastInsertRowid, "اسمنت عادي",          2200, "كيس 50 كجم", 300);
  ii.run(w2.lastInsertRowid, "رمل خشن",              400, "م³",           50);
  // W3
  ii.run(w3.lastInsertRowid, "اسمنت عادي",         80000, "كيس 50 كجم", 5000);
  ii.run(w3.lastInsertRowid, "اسمنت سريع التصلب",  20000, "كيس 50 كجم", 2000);
  ii.run(w3.lastInsertRowid, "اسمنت أبيض",         10000, "كيس 40 كجم", 1000);
}

// ─── Driver Profiles ───────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS driver_profiles (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_plate       TEXT,
    driver_name         TEXT NOT NULL,
    phone               TEXT,
    branch              TEXT DEFAULT 'النقليات',
    email               TEXT,
    license_url         TEXT,
    operation_card_url  TEXT,
    iqama_image_url     TEXT,
    iqama_pdf_url       TEXT,
    iqama_expiry        TEXT,
    delegated_form_image_url TEXT,
    delegated_form_pdf_url   TEXT,
    delegated_form_expiry    TEXT,
    create_request_id   TEXT,
    driver_card_url     TEXT,
    insurance_url       TEXT,
    status              TEXT DEFAULT 'نشط',
    notes               TEXT,
    synced_at           TEXT DEFAULT (datetime('now')),
    created_at          TEXT DEFAULT (datetime('now'))
  );
`);
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profiles_create_request_id
  ON driver_profiles(create_request_id)
  WHERE create_request_id IS NOT NULL
`);

// ─── Driver Aliases (ghost names linked to real driver profiles) ────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS driver_aliases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    alias_name  TEXT NOT NULL UNIQUE,
    driver_id   INTEGER NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Tariffs ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS tariffs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    row_id          INTEGER,
    loading_place   TEXT NOT NULL,
    unloading_place TEXT NOT NULL,
    driver_expense  REAL DEFAULT 0,
    rental          REAL DEFAULT 0,
    notes           TEXT,
    synced_at       TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tariff_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tariff_id INTEGER NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('loading', 'unloading')),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    UNIQUE(tariff_id, kind, url)
  );
  CREATE TABLE IF NOT EXISTS invoice_templates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT,
    supplier      TEXT,
    cargo_type    TEXT,
    marker_text   TEXT,
    rules_json    TEXT DEFAULT '{}',
    tariff_id     INTEGER REFERENCES tariffs(id) ON DELETE SET NULL,
    sample_images TEXT DEFAULT '[]',
    active        INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS trip_invoice_images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    object_path TEXT NOT NULL,
    file_name   TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS trip_invoice_extractions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    image_ids   TEXT NOT NULL DEFAULT '[]',
    template_id INTEGER REFERENCES invoice_templates(id) ON DELETE SET NULL,
    result_json TEXT NOT NULL,
    confidence  REAL DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS driver_expenses (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_phone   TEXT NOT NULL,
    driver_name    TEXT,
    vehicle_plate  TEXT,
    order_id       INTEGER,
    order_number   TEXT,
    expense_type   TEXT DEFAULT 'ديزل',
    amount         REAL NOT NULL,
    liters         REAL DEFAULT 0,
    description    TEXT,
    expense_date   TEXT DEFAULT (date('now')),
    attachment_url TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS driver_settlements (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_phone     TEXT NOT NULL,
    driver_name      TEXT,
    allocated_amount REAL NOT NULL,
    settlement_date  TEXT DEFAULT (date('now')),
    settled_by       TEXT,
    notes            TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Finance Settings ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS finance_settings (
    id                    INTEGER PRIMARY KEY,
    supervisor_salary_pct REAL DEFAULT 5,
    transport_pct         REAL DEFAULT 3,
    admin_pct             REAL DEFAULT 7,
    driver_salary_default REAL DEFAULT 3000,
    updated_at            TEXT DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO finance_settings (id) VALUES (1);
`);

// ─── Company Settings (multiple entities) ────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS company_settings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_name      TEXT NOT NULL,
    tax_number       TEXT DEFAULT '',
    national_address TEXT DEFAULT '',
    cr_number        TEXT DEFAULT '',
    phone            TEXT DEFAULT '',
    logo_url         TEXT DEFAULT '',
    is_default       INTEGER DEFAULT 0,
    active           INTEGER DEFAULT 1,
    created_at       TEXT DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO company_settings (id, entity_name, tax_number, is_default)
    VALUES (1, 'شركة MKGH للمقاولات', '', 1);
  INSERT OR IGNORE INTO company_settings (id, entity_name, tax_number, is_default)
    VALUES (2, 'مصنع البلك', '', 0);
  INSERT OR IGNORE INTO company_settings (id, entity_name, tax_number, is_default)
    VALUES (3, 'مصنع سمنت مكس', '', 0);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS company_branch_documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id     INTEGER NOT NULL REFERENCES company_settings(id),
    document_type TEXT NOT NULL CHECK (document_type IN ('tax_number','cr_number','national_address','custom')),
    title         TEXT NOT NULL,
    object_path   TEXT NOT NULL UNIQUE,
    file_name     TEXT NOT NULL,
    content_type  TEXT NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
    file_size     INTEGER NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_company_branch_documents_branch
    ON company_branch_documents(branch_id, document_type, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_company_branch_documents_fixed_type
    ON company_branch_documents(branch_id, document_type)
    WHERE document_type <> 'custom';
`);

// ─── Backward-compat for tariffs and workflow_orders ─────────────────────────
try { db.exec("ALTER TABLE tariffs ADD COLUMN status TEXT DEFAULT 'approved'"); } catch {}
try { db.exec("ALTER TABLE tariffs ADD COLUMN proposed_by TEXT"); } catch {}
try { db.exec("ALTER TABLE tariffs ADD COLUMN price_set_by TEXT"); } catch {}
try { db.exec("ALTER TABLE tariffs ADD COLUMN vehicle_type TEXT"); } catch {}
try { db.exec("ALTER TABLE tariffs ADD COLUMN bonus_amount REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE tariffs ADD COLUMN supplier TEXT"); } catch {}
try { db.exec("ALTER TABLE tariffs ADD COLUMN customer_name TEXT"); } catch {}
try { db.exec("ALTER TABLE tariffs ADD COLUMN loaded_meters REAL"); } catch {}
try { db.exec("ALTER TABLE tariffs ADD COLUMN cargo_type TEXT"); } catch {}
try { db.exec("ALTER TABLE tariffs ADD COLUMN km_per_route REAL"); } catch {}
try { db.exec("ALTER TABLE tariffs ADD COLUMN image_url TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN tariff_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN loading_place TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN rental_amount REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN driver_bonus REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN company_entity_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN delivery_date TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN cancelled_at TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN cancelled_by TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN cancel_reason TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN linked_user_phone TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN vehicle_password TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'approved'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN register_note TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN rep_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN complaints_whatsapp TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN vehicle_plate TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN rep_phone TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN supervisor_phone TEXT"); } catch {}
try { db.exec("ALTER TABLE rental_vehicle_types ADD COLUMN rate_per_km REAL DEFAULT 0"); } catch {}

// ─── Flatbed Route Multipliers ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS flatbed_multipliers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    origin_city  TEXT NOT NULL,
    dest_city    TEXT NOT NULL,
    multiplier   REAL NOT NULL DEFAULT 2,
    notes        TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO flatbed_multipliers (id, origin_city, dest_city, multiplier) VALUES
    (1, 'القصيم', 'المدينة',  1),
    (2, 'القصيم', 'الرياض',  1),
    (3, 'القصيم', 'حائل',    2);
`);

// ─── Supervisor settings (auto-assignment toggle) ─────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS supervisor_settings (
    id                    INTEGER PRIMARY KEY,
    auto_assign_enabled   INTEGER DEFAULT 0,
    whatsapp_order_phone  TEXT    DEFAULT '0571748370',
    quote_action          TEXT    DEFAULT 'whatsapp',
    updated_at            TEXT    DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO supervisor_settings (id, auto_assign_enabled) VALUES (1, 0);
`);
// Migrate existing DBs that have the table but not the column
try { db.exec("ALTER TABLE supervisor_settings ADD COLUMN whatsapp_order_phone TEXT DEFAULT '0571748370'"); } catch {}
try { db.exec("ALTER TABLE supervisor_settings ADD COLUMN quote_action TEXT DEFAULT 'whatsapp'"); } catch {}

// ─── Breakdown attribution + settlement columns ───────────────────────────────
try { db.exec("ALTER TABLE breakdown_reports ADD COLUMN fault_attribution TEXT DEFAULT 'vehicle'"); } catch {}
try { db.exec("ALTER TABLE driver_settlements ADD COLUMN deferred INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE driver_settlements ADD COLUMN delivered_at TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN alt_driver_phone TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN alt_driver_name TEXT"); } catch {}

// ─── Packaging type on products & orders ─────────────────────────────────────
try { db.exec("ALTER TABLE products ADD COLUMN packaging_type TEXT DEFAULT 'معبأ'"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN packaging_type TEXT DEFAULT 'معبأ'"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN vehicle_category TEXT DEFAULT 'standard'"); } catch {}

// ─── Cash payment approval fields ─────────────────────────────────────────────
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN cash_approved_by TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN cash_approval_note TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN cash_approved_at TEXT"); } catch {}

// ─── Client saved locations (address book) ────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS client_locations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    alias        TEXT NOT NULL,
    address      TEXT,
    lat          REAL,
    lng          REAL,
    is_default   INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Loading Points (Company Warehouses / Factories) ─────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS loading_points (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    city       TEXT,
    address    TEXT,
    lat        REAL,
    lng        REAL,
    active     INTEGER DEFAULT 1,
    notes      TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
// Seed default loading points if empty
{
  const cnt = (db.prepare("SELECT COUNT(*) as c FROM loading_points").get() as {c:number}).c;
  if (cnt === 0) {
    db.exec(`
      INSERT INTO loading_points (name,city,address,lat,lng) VALUES
        ('مصنع القصيم','بريدة','طريق القصيم - الرياض, بريدة',26.3292,43.9747),
        ('مستودع الرياض','الرياض','المنطقة الصناعية, الرياض',24.7136,46.6753),
        ('مستودع المدينة','المدينة المنورة','المنطقة الصناعية, المدينة',24.5247,39.5692);
    `);
  }
}

// ─── 360-Degree Order Ratings (5 entities) ───────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS order_ratings (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id          INTEGER NOT NULL,
    order_number      TEXT,
    customer_phone    TEXT NOT NULL,
    product_rating    INTEGER,
    product_comment   TEXT,
    driver_rating     INTEGER,
    driver_comment    TEXT,
    driver_name       TEXT,
    rep_rating        INTEGER,
    rep_comment       TEXT,
    rep_name          TEXT,
    warehouse_rating  INTEGER,
    warehouse_comment TEXT,
    company_rating    INTEGER,
    company_comment   TEXT,
    created_at        TEXT DEFAULT (datetime('now'))
  );
`);
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_order_ratings_order ON order_ratings(order_id)"); } catch {}

// ─── Legal Documents Library (مكتبة الأنظمة السعودية) ────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS legal_docs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT NOT NULL,
    category       TEXT DEFAULT 'نظام',
    doc_number     TEXT,
    published_date TEXT,
    content        TEXT,
    file_url       TEXT,
    tags           TEXT,
    active         INTEGER DEFAULT 1,
    created_by     TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Hearing Tracker (متتبع الجلسات) ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS hearings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT NOT NULL,
    case_type        TEXT DEFAULT 'مخالفة مرورية',
    case_number      TEXT,
    party_name       TEXT,
    driver_name      TEXT,
    related_order_id INTEGER,
    vehicle_plate    TEXT,
    hearing_date     TEXT,
    court            TEXT,
    status           TEXT DEFAULT 'مفتوحة',
    notes            TEXT,
    outcome          TEXT,
    closed_at        TEXT,
    created_by       TEXT,
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now'))
  );
`);

// ─── System / Audit Logs ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS system_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone  TEXT,
    user_name   TEXT,
    user_role   TEXT,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    details     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Warehouse v2 Migrations ──────────────────────────────────────────────────
try { db.exec("ALTER TABLE warehouses ADD COLUMN lat REAL"); } catch {}
try { db.exec("ALTER TABLE warehouses ADD COLUMN lng REAL"); } catch {}
try { db.exec("ALTER TABLE warehouses ADD COLUMN warehouse_manager_user_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE warehouse_items ADD COLUMN max_stock REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN invoice_draft_data TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN invoice_warehouse_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN loading_point_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN loading_point_name TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN inventory_deducted INTEGER DEFAULT 0"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS trailer_load_configs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    product_category  TEXT NOT NULL,
    trailer_capacity  REAL NOT NULL,
    min_threshold     REAL NOT NULL,
    unit              TEXT DEFAULT 'وحدة',
    active            INTEGER DEFAULT 1,
    created_at        TEXT DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO trailer_load_configs (id, name, product_category, trailer_capacity, min_threshold, unit) VALUES
    (1, 'أسمنت معبأ',   'أسمنت',      600,  600,  'كيس'),
    (2, 'بلك 15',       'بلك',        1800, 1800, 'حبة'),
    (3, 'بلك 20',       'بلك',        1600, 1600, 'حبة'),
    (4, 'بلك بخاري',    'بلك بخاري',  1200, 1200, 'حبة');

  CREATE TABLE IF NOT EXISTS supply_requests (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id         INTEGER REFERENCES warehouses(id),
    warehouse_name       TEXT,
    product_name         TEXT NOT NULL,
    product_category     TEXT,
    requested_qty        REAL NOT NULL,
    unit                 TEXT DEFAULT 'وحدة',
    trailer_loads        REAL DEFAULT 1,
    status               TEXT DEFAULT 'pending',
    priority             TEXT DEFAULT 'normal',
    destination_division TEXT,
    requested_by         TEXT,
    approved_by          TEXT,
    notes                TEXT,
    auto_triggered       INTEGER DEFAULT 0,
    created_at           TEXT DEFAULT (datetime('now')),
    loaded_at            TEXT,
    updated_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invoice_settings (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    auto_replenishment      INTEGER DEFAULT 0,
    auto_invoice_enabled    INTEGER DEFAULT 0,
    auto_invoice_categories TEXT DEFAULT '[]',
    updated_at              TEXT DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO invoice_settings (id, auto_replenishment, auto_invoice_enabled) VALUES (1, 0, 0);
`);

try { db.exec("ALTER TABLE invoice_settings ADD COLUMN prices_locked INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE supply_requests ADD COLUMN batch_id TEXT"); } catch {}
try { db.exec("ALTER TABLE supply_requests ADD COLUMN routing_dispatch_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE supply_requests ADD COLUMN driver_expense REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE supply_requests ADD COLUMN rental REAL DEFAULT 0"); } catch {}
if (!(db.prepare("PRAGMA table_info(supply_requests)").all() as { name: string }[])
  .some(column => column.name === "loaded_at")) {
  db.exec("ALTER TABLE supply_requests ADD COLUMN loaded_at TEXT");
}
try { db.exec("ALTER TABLE supply_request_trips ADD COLUMN archived_at TEXT"); } catch {}
try { db.exec("ALTER TABLE trailer_load_configs ADD COLUMN approved_qty REAL DEFAULT 0"); } catch {}

// ─── KM Rates per vehicle type (أسعار الكيلومتر حسب نوع السيارة) ──────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS km_rates (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_type TEXT    UNIQUE NOT NULL,
    rate_per_km  REAL    DEFAULT 0,
    multiplier   REAL    DEFAULT 1,
    updated_at   TEXT    DEFAULT (datetime('now'))
  );
`);
{
  const defaults = [
    { vehicle_type: "سطحة",  rate_per_km: 1.50,   multiplier: 1 },
    { vehicle_type: "بلكر",  rate_per_km: 0.7440, multiplier: 2 },
    { vehicle_type: "قلاب",  rate_per_km: 0.7990, multiplier: 2 },
    { vehicle_type: "رأس",   rate_per_km: 0.77,   multiplier: 1 },
  ];
  for (const r of defaults) {
    try {
      db.prepare("INSERT OR IGNORE INTO km_rates (vehicle_type,rate_per_km,multiplier) VALUES (?,?,?)").run(r.vehicle_type, r.rate_per_km, r.multiplier);
    } catch { /* ignore */ }
  }
}

// ─── Vehicle Driver History (سجل السائقين على كل سيارة) ──────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicle_driver_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_number TEXT NOT NULL,
    driver_name  TEXT,
    driver_phone TEXT,
    assigned_at  TEXT DEFAULT (datetime('now')),
    relieved_at  TEXT,
    notes        TEXT
  );
`);

// ─── Fleet vehicles extra columns ──────────────────────────────────────────────
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN vehicle_type_normalized TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN insurance_start TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN insurance_end TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN insurance_image TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN inspection_start TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN inspection_end TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN inspection_image TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN operation_card_start TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN operation_card_end TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN operation_card_image TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN driver_phone TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN backup_driver_name TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN backup_driver_phone TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN show_cargo_photo INTEGER NOT NULL DEFAULT 1"); } catch {}

// ─── Trip km cost field ────────────────────────────────────────────────────────
try { db.exec("ALTER TABLE trips ADD COLUMN km_cost REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN bonus_amount REAL DEFAULT 0"); } catch {}

// ─── Purchase requests — vehicle_plate column ─────────────────────────────────
try { db.exec("ALTER TABLE purchase_requests ADD COLUMN vehicle_plate TEXT"); } catch {}

// ─── Vehicle equipment fields (فرش / طبالي خشب / طبالي بلاستك) ───────────────
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN equipment_type TEXT DEFAULT 'none'"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN load_capacity_tons REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN vehicle_subtype TEXT"); } catch {}

// ─── Vehicle → Trailer linking ────────────────────────────────────────────────
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN linked_trailer_number TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN linked_trailer_type   TEXT"); } catch {}
// 'vehicle' = default work on vehicle, 'trailer' = default work on linked trailer
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN linked_trailer_default TEXT DEFAULT 'vehicle'"); } catch {}

// ─── Order equipment requirement ─────────────────────────────────────────────
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN required_equipment TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN required_vehicle_type TEXT"); } catch {}

// ─── Driver company send (إرسال مبلغ من الشركة للسائق) ──────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS driver_company_sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_phone TEXT NOT NULL,
    driver_name  TEXT,
    amount       REAL NOT NULL,
    note         TEXT,
    sent_by      TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  )`);
} catch {}

// ─── Auto-assign smart fields ─────────────────────────────────────────────────
try { db.exec("ALTER TABLE supervisor_settings ADD COLUMN auto_assign_criteria TEXT DEFAULT 'nearest'"); } catch {}

// ─── Vehicle stop alert threshold (minutes) ───────────────────────────────────
try { db.exec("ALTER TABLE supervisor_settings ADD COLUMN stopped_alert_minutes INTEGER DEFAULT 30"); } catch {}

// ─── Crane supervisor vehicle-assign button toggle ────────────────────────────
try { db.exec("ALTER TABLE supervisor_settings ADD COLUMN crane_assign_enabled INTEGER DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE supervisor_settings ADD COLUMN show_ai_chat INTEGER DEFAULT 1"); } catch {}

// ─── Vehicle stop tracking on active orders ───────────────────────────────────
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN vehicle_stopped_since TEXT"); } catch {}
try { db.exec("ALTER TABLE workflow_orders ADD COLUMN vehicle_stop_notified_at TEXT"); } catch {}

// ─── External rental driver stages (حمل / وصل / نزل) ────────────────────────
try { db.exec("ALTER TABLE external_rentals ADD COLUMN driver_stage TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE external_rentals ADD COLUMN driver_stage_at TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE external_rentals ADD COLUMN payment_type TEXT DEFAULT 'transfer'"); } catch {}

// ─── Warehouse lat/lng (for map picker) ───────────────────────────────────────
try { db.exec("ALTER TABLE warehouses ADD COLUMN lat REAL"); } catch {}
try { db.exec("ALTER TABLE warehouses ADD COLUMN lng REAL"); } catch {}

// ─── Product offers/discounts ─────────────────────────────────────────────────
try { db.exec("ALTER TABLE products ADD COLUMN offer_label TEXT"); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN offer_pct REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN offer_active INTEGER DEFAULT 0"); } catch {}

// ─── Offers product linking ───────────────────────────────────────────────────
try { db.exec("ALTER TABLE offers ADD COLUMN product_ids TEXT"); } catch {}

// ─── Driver settlement cash flag ──────────────────────────────────────────────
try { db.exec("ALTER TABLE driver_expenses ADD COLUMN is_settlement_cash INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE driver_expenses ADD COLUMN attachment_url TEXT"); } catch {}
// Vehicle snapshot for new driver expenses. Existing rows intentionally remain NULL.
try { db.exec("ALTER TABLE driver_expenses ADD COLUMN vehicle_plate TEXT"); } catch {}
// Driver snapshot for new trips. Existing rows intentionally continue to use their saved name.
try { db.exec("ALTER TABLE trips ADD COLUMN driver_phone TEXT"); } catch {}

// ─── Product min_stock for low-stock alerts ───────────────────────────────────
try { db.exec("ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 0"); } catch {}

// ─── Fleet vehicles extra columns ────────────────────────────────────────────
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN vehicle_name TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN entity TEXT"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN max_weight_kg REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN empty_weight_kg REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN branch TEXT DEFAULT 'النقليات'"); } catch {}

// ─── Vehicle type assignments (multi-type per vehicle) ──────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS vehicle_type_assignments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_number TEXT NOT NULL,
    type_name    TEXT NOT NULL,
    is_primary   INTEGER DEFAULT 0,
    UNIQUE(plate_number, type_name)
  )`);
} catch {}

// ─── Products weight ──────────────────────────────────────────────────────────
try { db.exec("ALTER TABLE products ADD COLUMN weight_kg REAL DEFAULT 0"); } catch {}

// ─── Vehicle type overnight rate ──────────────────────────────────────────────
try { db.exec("ALTER TABLE vehicle_type_definitions ADD COLUMN overnight_rate REAL DEFAULT 0"); } catch {}

// ─── Vehicle Type Definitions ─────────────────────────────────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS vehicle_type_definitions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE,
    icon          TEXT DEFAULT '🚛',
    description   TEXT,
    max_load_bags INTEGER DEFAULT 0,
    cargo_types   TEXT DEFAULT '[]',
    sort_order    INTEGER DEFAULT 0,
    is_custom     INTEGER DEFAULT 0,
    is_active     INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  )`);
  const vtdCount = (db.prepare("SELECT COUNT(*) as c FROM vehicle_type_definitions").get() as { c: number }).c;
  if (vtdCount === 0) {
    const ivt = db.prepare("INSERT OR IGNORE INTO vehicle_type_definitions (name,icon,description,max_load_bags,cargo_types,sort_order,is_custom) VALUES (?,?,?,?,?,?,0)");
    ivt.run("سطحة", "🚛", "سطحة تحمل الأسمنت المعبأ والبلاط — حد أقصى 600 كيس", 600, JSON.stringify(["cement_packed","tiles"]),    1);
    ivt.run("بلكر",  "🛢️", "صهريج الأسمنت السائب",                                  0,   JSON.stringify(["cement_loose"]),            2);
    ivt.run("ونش",   "🏗️", "رافعة لتحميل البلوك",                                    0,   JSON.stringify(["blocks"]),                  3);
    ivt.run("دين",   "🚚", "شاحنة صغيرة — حد أقصى 50 كيس أسمنت معبأ",              50,  JSON.stringify(["cement_packed"]),            4);
  }
} catch {}

// ─── Cargo Routing Rules ──────────────────────────────────────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS cargo_routing_rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    cargo_type      TEXT NOT NULL,
    cargo_label     TEXT,
    min_qty         INTEGER DEFAULT 0,
    max_qty         INTEGER DEFAULT 0,
    vehicle_type_id INTEGER,
    notes           TEXT,
    sort_order      INTEGER DEFAULT 0
  )`);
  const crrCount = (db.prepare("SELECT COUNT(*) as c FROM cargo_routing_rules").get() as { c: number }).c;
  if (crrCount === 0) {
    const gvt = (n: string) => (db.prepare("SELECT id FROM vehicle_type_definitions WHERE name=?").get(n) as { id: number } | undefined)?.id ?? null;
    const satha = gvt("سطحة"); const balkar = gvt("بلكر"); const wonsh = gvt("ونش"); const deen = gvt("دين");
    const ic = db.prepare("INSERT INTO cargo_routing_rules (cargo_type,cargo_label,min_qty,max_qty,vehicle_type_id,notes,sort_order) VALUES (?,?,?,?,?,?,?)");
    ic.run("cement_packed","أسمنت معبأ",  1,   599, deen,   "أقل من 600 كيس — على دين",          1);
    ic.run("cement_packed","أسمنت معبأ",  600, 0,   satha,  "600 كيس أو أكثر — على سطحة",        2);
    ic.run("cement_loose", "أسمنت سائب",  0,   0,   balkar, "الأسمنت السائب على بلكر",            3);
    ic.run("blocks",       "بلوك",         0,   0,   wonsh,  "البلوك يُحمَّل برافعة (ونش)",        4);
    ic.run("tiles",        "بلاط وأرضيات",0,   0,   satha,  "البلاط على سطحة",                    5);
  }
} catch {}

// ─── Bulker Movements ─────────────────────────────────────────────────────────
try { db.exec(`CREATE TABLE IF NOT EXISTS bulker_movements (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  movement_number   TEXT NOT NULL UNIQUE,
  vehicle_id        INTEGER,
  driver_id         INTEGER,
  vehicle_plate     TEXT,
  driver_name       TEXT,
  driver_phone      TEXT,
  load_qty_m3       REAL DEFAULT 0,
  destination       TEXT,
  customer_order_id TEXT,
  is_for_customer   INTEGER DEFAULT 0,
  customer_name     TEXT,
  status            TEXT DEFAULT 'scheduled',
  notes             TEXT,
  created_by        TEXT,
  scheduled_date    TEXT,
  loaded_at         TEXT,
  dispatched_at     TEXT,
  delivered_at      TEXT,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
)`); } catch {}

// ─── Internal Requests ────────────────────────────────────────────────────────
try { db.exec(`CREATE TABLE IF NOT EXISTS internal_requests (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number        TEXT NOT NULL UNIQUE,
  requester_id          INTEGER,
  requester_name        TEXT,
  requester_role        TEXT,
  cargo_type            TEXT NOT NULL,
  cargo_label           TEXT,
  qty                   INTEGER DEFAULT 0,
  unit                  TEXT DEFAULT 'كيس',
  vehicle_type_id       INTEGER,
  vehicle_type_name     TEXT,
  notes                 TEXT,
  status                TEXT DEFAULT 'pending',
  assigned_vehicle_id   INTEGER,
  assigned_vehicle_plate TEXT,
  assigned_driver_id    INTEGER,
  assigned_driver_name  TEXT,
  assigned_by           TEXT,
  assigned_at           TEXT,
  completed_at          TEXT,
  created_at            TEXT DEFAULT (datetime('now')),
  updated_at            TEXT DEFAULT (datetime('now'))
)`); } catch {}

export function generateOrderNumber(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `MKGH${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─── Factory Orders (طلبيات المصنع / الفسحات) ────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS factory_orders (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number          TEXT UNIQUE,
    vehicle_plate         TEXT,
    driver_name           TEXT,
    driver_phone          TEXT,
    product_name          TEXT NOT NULL,
    quantity              REAL DEFAULT 0,
    unit                  TEXT DEFAULT 'طن',
    delivery_site         TEXT,
    notes                 TEXT,
    status                TEXT DEFAULT 'pending_permit',
    permit_number         TEXT,
    permit_doc_url        TEXT,
    permit_issued_at      TEXT,
    loading_order_url     TEXT,
    loading_confirmed_at  TEXT,
    delivered_at          TEXT,
    delivery_notes        TEXT,
    created_by_phone      TEXT,
    created_at            TEXT DEFAULT (datetime('now')),
    updated_at            TEXT DEFAULT (datetime('now'))
  )
`);
try { db.exec("ALTER TABLE trips ADD COLUMN permit_image_url TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE trips ADD COLUMN fsohat_image_url TEXT"); } catch { /* already exists */ }

// ─── Factory Orders: link to workflow_orders ──────────────────────────────────
try { db.exec("ALTER TABLE factory_orders ADD COLUMN workflow_order_id INTEGER"); } catch { /* already exists */ }

// ─── Supply Request extended columns (migrate) ────────────────────────────────
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN vehicle_plate TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN driver_name TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN driver_phone TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN invoice_image TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN cargo_type TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN redirect_location TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN parent_id INTEGER`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN reference_no TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN external_customer_name TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN external_customer_phone TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN customer_name TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN customer_type TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN rep_name TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN rep_phone TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_requests ADD COLUMN permit_image_url TEXT`); } catch { /* already exists */ }

// ─── Supply request trips table (migrate) ──────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS supply_request_trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supply_request_id INTEGER NOT NULL,
    vehicle_plate TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    status TEXT DEFAULT 'assigned',
    driver_loading_image TEXT,
    permit_number TEXT,
    loaded_at TEXT,
    delivered_at TEXT,
    received_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);
try { db.exec(`ALTER TABLE supply_request_trips ADD COLUMN archived_at TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_request_trips ADD COLUMN permit_image_url TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_request_trips ADD COLUMN reference_no TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_request_trips ADD COLUMN invoice_image_url TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_request_trips ADD COLUMN cargo_items_json TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE supply_request_trips ADD COLUMN attachments_json TEXT`); } catch { /* already exists */ }

// ─── Unique index on warehouse_items(warehouse_id, product_id) ────────────────
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_items_wh_product ON warehouse_items(warehouse_id, product_id) WHERE product_id IS NOT NULL"); } catch { /* already exists */ }
try { db.exec("DROP INDEX IF EXISTS idx_maintenance_logs_card"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_maintenance_logs_card_ni ON maintenance_logs(card_number) WHERE card_number IS NOT NULL AND card_number != ''"); } catch {}
// ─── maintenance_logs: amount breakdown columns ───────────────────────────────
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN amount_mechanical REAL DEFAULT 0"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN amount_electrical REAL DEFAULT 0"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN amount_salvage    REAL DEFAULT 0"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN salvage_source    TEXT");           } catch { /* already exists */ }

// ─── maintenance_logs: per-type amount breakdown ──────────────────────────────
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN amount_breakdown TEXT"); } catch { /* already exists */ }

// ─── maintenance_logs: trailer + external vehicle columns ─────────────────────
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN trailer_number TEXT");          } catch { /* already exists */ }
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN trailer_type   TEXT");          } catch { /* already exists */ }
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN is_external    INTEGER DEFAULT 0"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN vehicle_choice TEXT DEFAULT 'vehicle'"); } catch { /* already exists */ }

// ─── warehouse_items.active column ────────────────────────────────────────────
try { db.exec("ALTER TABLE warehouse_items ADD COLUMN active INTEGER DEFAULT 1"); } catch { /* already exists */ }

// ─── cleanup orphaned warehouse_items whose product was deleted ───────────────
try {
  db.exec("DELETE FROM warehouse_items WHERE product_id IS NULL AND (quantity IS NULL OR quantity <= 0) AND product_name NOT IN (SELECT name FROM products)");
  db.exec("UPDATE warehouse_items SET active = 0 WHERE product_id IS NULL AND quantity > 0 AND product_name NOT IN (SELECT name FROM products)");
} catch { /* non-fatal */ }

// ─── Purchase invoices table (import from Excel) ───────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS purchase_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_no TEXT,
    invoice_date TEXT,
    branch TEXT,
    vehicle_plate TEXT,
    invoice_number TEXT,
    supplier_name TEXT,
    item_name TEXT NOT NULL,
    price_before_vat REAL DEFAULT 0,
    quantity REAL DEFAULT 0,
    price_after_vat REAL DEFAULT 0,
    notes TEXT,
    imported_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ─── Purchase Invoice Returns — مرتجعات فواتير الموردين ───────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS purchase_invoice_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER,
    invoice_number TEXT,
    supplier_name TEXT,
    item_name TEXT NOT NULL,
    return_quantity REAL NOT NULL DEFAULT 1,
    reason TEXT,
    returned_by TEXT,
    returned_at TEXT DEFAULT (datetime('now'))
  )
`);

try { db.exec("ALTER TABLE purchase_invoice_returns ADD COLUMN vehicle_plate TEXT"); } catch { /* already exists */ }

// ─── Supplier Reimbursement Claims — كشوفات الاستعاضة ────────────────────────
try { db.exec("ALTER TABLE purchase_invoices ADD COLUMN reimbursement_claim_id INTEGER"); } catch { /* already exists */ }
// Optional operational target for new or manually reclassified purchase invoices.
try { db.exec("ALTER TABLE purchase_invoices ADD COLUMN work_on TEXT"); } catch {}
try { db.exec("ALTER TABLE purchase_invoices ADD COLUMN trailer_number TEXT"); } catch {}
// #136 — link invoices to suppliers
try { db.exec("ALTER TABLE purchase_invoices ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)"); } catch {}
// Optional proportional share of an invoice-entry discount. Additive migration preserves all existing invoices.
try { db.exec("ALTER TABLE purchase_invoices ADD COLUMN discount_amount REAL DEFAULT 0"); } catch {}
db.exec(`
  CREATE TABLE IF NOT EXISTS purchase_invoice_paste_batches (
    request_key TEXT PRIMARY KEY,
    payload_hash TEXT NOT NULL,
    invoice_ids_json TEXT NOT NULL,
    workshop_item_names_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
// #138 — supplier rating after receive
try { db.exec("ALTER TABLE purchase_requests ADD COLUMN rating INTEGER"); } catch {}
try { db.exec("ALTER TABLE purchase_requests ADD COLUMN quality_notes TEXT"); } catch {}
db.exec(`
  CREATE TABLE IF NOT EXISTS supplier_reimbursement_claims (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_number     TEXT UNIQUE,
    created_by       TEXT,
    total_before_vat REAL DEFAULT 0,
    total_after_vat  REAL DEFAULT 0,
    invoice_count    INTEGER DEFAULT 0,
    notes            TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  )
`);
try { db.exec("ALTER TABLE supplier_reimbursement_claims ADD COLUMN is_printed INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE supplier_reimbursement_claims ADD COLUMN printed_at TEXT"); } catch {}
try { db.exec("ALTER TABLE supplier_reimbursement_claims ADD COLUMN branch TEXT"); } catch {}
try { db.exec("ALTER TABLE supplier_reimbursement_claims ADD COLUMN sequence_no INTEGER"); } catch {}
try { db.exec("ALTER TABLE supplier_reimbursement_claims ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE supplier_reimbursement_claims ADD COLUMN cancelled_at TEXT"); } catch {}
try { db.exec("ALTER TABLE supplier_reimbursement_claims ADD COLUMN cancelled_by TEXT"); } catch {}
try { db.exec("ALTER TABLE supplier_reimbursement_claims ADD COLUMN include_driver_signatures INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE supplier_reimbursement_claims ADD COLUMN items_snapshot_json TEXT"); } catch {}
db.exec(`
  CREATE TABLE IF NOT EXISTS supplier_reimbursement_claim_print_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id    INTEGER NOT NULL REFERENCES supplier_reimbursement_claims(id),
    event_type  TEXT NOT NULL CHECK(event_type IN ('original', 'reprint')),
    actor_user_id INTEGER,
    actor_name  TEXT NOT NULL,
    printed_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_supplier_reimbursement_claim_print_events
  ON supplier_reimbursement_claim_print_events(claim_id, event_type, id)
`);
db.transaction(() => {
  db.prepare(`
    UPDATE supplier_reimbursement_claims AS current_claim
    SET sequence_no=(
      SELECT COUNT(*)
      FROM supplier_reimbursement_claims earlier_claim
      WHERE earlier_claim.id <= current_claim.id
    )
    WHERE sequence_no IS NULL
  `).run();
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_reimbursement_claims_sequence ON supplier_reimbursement_claims(sequence_no)");
})();

// ─── Rental customer accounts + cash custody ────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS rental_customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT,
    notes TEXT,
    customer_type TEXT NOT NULL DEFAULT 'rental' CHECK(customer_type IN ('rental','company')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rental_account_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL COLLATE NOCASE,
    entry_date TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK(entry_type IN ('opening_debit','opening_credit')),
    amount REAL NOT NULL CHECK(amount > 0),
    description TEXT,
    reference_no TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rental_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL COLLATE NOCASE,
    payment_date TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_method TEXT NOT NULL CHECK(payment_method IN ('company_direct','cash_received')),
    reference_no TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rental_receipt_objects (
    path TEXT PRIMARY KEY,
    owner_user_id INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rental_cash_remittances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remittance_date TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    reference_no TEXT,
    notes TEXT,
    customer_name TEXT COLLATE NOCASE,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rental_monthly_closures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL COLLATE NOCASE,
    month TEXT NOT NULL,
    opening_balance REAL NOT NULL DEFAULT 0,
    period_debit REAL NOT NULL DEFAULT 0,
    period_credit REAL NOT NULL DEFAULT 0,
    closing_balance REAL NOT NULL DEFAULT 0,
    statement_snapshot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'closed' CHECK(status IN ('closed','reopened')),
    closed_by TEXT NOT NULL,
    closed_at TEXT NOT NULL DEFAULT (datetime('now')),
    reopened_by TEXT,
    reopened_at TEXT,
    UNIQUE(customer_name, month)
  );
  CREATE TABLE IF NOT EXISTS rental_statement_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL COLLATE NOCASE,
    adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('reply','statement')),
    trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
    amount REAL NOT NULL CHECK(amount >= 0),
    entry_date TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK(
      (adjustment_type='reply' AND trip_id IS NOT NULL AND entry_date IS NULL) OR
      (adjustment_type='statement' AND trip_id IS NULL AND entry_date IS NOT NULL)
    )
  );
  CREATE TABLE IF NOT EXISTS rental_trip_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES rental_customers(id),
    source_trip_id INTEGER NOT NULL REFERENCES trips(id),
    loading_region TEXT,
    unloading_region TEXT,
    cargo_type TEXT,
    price REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS external_parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS external_account_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL REFERENCES external_parties(id) ON DELETE CASCADE,
    entry_date TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK(entry_type IN ('receivable','receivable_payment','payable','payable_payment')),
    money_scope TEXT NOT NULL CHECK(money_scope IN ('company','personal')),
    payment_method TEXT CHECK(payment_method IN ('cash','company_direct') OR payment_method IS NULL),
    amount REAL NOT NULL CHECK(amount > 0),
    description TEXT,
    reference_no TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rental_financial_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('account_entry','payment','cash_remittance','external_entry')),
    entity_id INTEGER NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('update','delete')),
    actor_name TEXT NOT NULL,
    old_values TEXT NOT NULL,
    new_values TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_rental_entries_customer ON rental_account_entries(customer_name);
  CREATE INDEX IF NOT EXISTS idx_rental_payments_customer ON rental_payments(customer_name);
  CREATE INDEX IF NOT EXISTS idx_rental_trip_requests_customer
    ON rental_trip_requests(customer_id, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_external_entries_party ON external_account_entries(party_id);
  CREATE INDEX IF NOT EXISTS idx_rental_financial_audit_created ON rental_financial_audit_log(created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_rental_monthly_closures_customer ON rental_monthly_closures(customer_name, month DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_statement_reply_adjustment
    ON rental_statement_adjustments(LOWER(TRIM(customer_name)), trip_id)
    WHERE adjustment_type='reply' AND trip_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_rental_statement_adjustments_customer
    ON rental_statement_adjustments(customer_name, created_at, id);
  CREATE TRIGGER IF NOT EXISTS block_closed_trip_insert
    BEFORE INSERT ON trips WHEN EXISTS (
      SELECT 1 FROM rental_monthly_closures c
      WHERE c.status='closed' AND LOWER(TRIM(c.customer_name))=LOWER(TRIM(NEW.client_name))
        AND c.month=substr(NEW.date,1,7)
    ) BEGIN SELECT RAISE(ABORT, 'هذا الشهر مقفول لهذا العميل'); END;
  CREATE TRIGGER IF NOT EXISTS block_closed_trip_update
    BEFORE UPDATE ON trips WHEN EXISTS (
      SELECT 1 FROM rental_monthly_closures c
      WHERE c.status='closed' AND (
        (LOWER(TRIM(c.customer_name))=LOWER(TRIM(OLD.client_name)) AND c.month=substr(OLD.date,1,7))
        OR (LOWER(TRIM(c.customer_name))=LOWER(TRIM(NEW.client_name)) AND c.month=substr(NEW.date,1,7))
      )
    ) BEGIN SELECT RAISE(ABORT, 'هذا الشهر مقفول لهذا العميل'); END;
  CREATE TRIGGER IF NOT EXISTS block_closed_trip_delete
    BEFORE DELETE ON trips WHEN EXISTS (
      SELECT 1 FROM rental_monthly_closures c
      WHERE c.status='closed' AND LOWER(TRIM(c.customer_name))=LOWER(TRIM(OLD.client_name))
        AND c.month=substr(OLD.date,1,7)
    ) BEGIN SELECT RAISE(ABORT, 'هذا الشهر مقفول لهذا العميل'); END;
  CREATE TRIGGER IF NOT EXISTS block_closed_entry_insert
    BEFORE INSERT ON rental_account_entries WHEN EXISTS (
      SELECT 1 FROM rental_monthly_closures c WHERE c.status='closed'
        AND LOWER(TRIM(c.customer_name))=LOWER(TRIM(NEW.customer_name)) AND c.month=substr(NEW.entry_date,1,7)
    ) BEGIN SELECT RAISE(ABORT, 'هذا الشهر مقفول لهذا العميل'); END;
  CREATE TRIGGER IF NOT EXISTS block_closed_entry_update
    BEFORE UPDATE ON rental_account_entries WHEN EXISTS (
      SELECT 1 FROM rental_monthly_closures c WHERE c.status='closed' AND (
        (LOWER(TRIM(c.customer_name))=LOWER(TRIM(OLD.customer_name)) AND c.month=substr(OLD.entry_date,1,7))
        OR (LOWER(TRIM(c.customer_name))=LOWER(TRIM(NEW.customer_name)) AND c.month=substr(NEW.entry_date,1,7))
      )
    ) BEGIN SELECT RAISE(ABORT, 'هذا الشهر مقفول لهذا العميل'); END;
  CREATE TRIGGER IF NOT EXISTS block_closed_entry_delete
    BEFORE DELETE ON rental_account_entries WHEN EXISTS (
      SELECT 1 FROM rental_monthly_closures c WHERE c.status='closed'
        AND LOWER(TRIM(c.customer_name))=LOWER(TRIM(OLD.customer_name)) AND c.month=substr(OLD.entry_date,1,7)
    ) BEGIN SELECT RAISE(ABORT, 'هذا الشهر مقفول لهذا العميل'); END;
  CREATE TRIGGER IF NOT EXISTS block_closed_payment_insert
    BEFORE INSERT ON rental_payments WHEN EXISTS (
      SELECT 1 FROM rental_monthly_closures c WHERE c.status='closed'
        AND LOWER(TRIM(c.customer_name))=LOWER(TRIM(NEW.customer_name)) AND c.month=substr(NEW.payment_date,1,7)
    ) BEGIN SELECT RAISE(ABORT, 'هذا الشهر مقفول لهذا العميل'); END;
  CREATE TRIGGER IF NOT EXISTS block_closed_payment_update
    BEFORE UPDATE ON rental_payments WHEN EXISTS (
      SELECT 1 FROM rental_monthly_closures c WHERE c.status='closed' AND (
        (LOWER(TRIM(c.customer_name))=LOWER(TRIM(OLD.customer_name)) AND c.month=substr(OLD.payment_date,1,7))
        OR (LOWER(TRIM(c.customer_name))=LOWER(TRIM(NEW.customer_name)) AND c.month=substr(NEW.payment_date,1,7))
      )
    ) BEGIN SELECT RAISE(ABORT, 'هذا الشهر مقفول لهذا العميل'); END;
  CREATE TRIGGER IF NOT EXISTS block_closed_payment_delete
    BEFORE DELETE ON rental_payments WHEN EXISTS (
      SELECT 1 FROM rental_monthly_closures c WHERE c.status='closed'
        AND LOWER(TRIM(c.customer_name))=LOWER(TRIM(OLD.customer_name)) AND c.month=substr(OLD.payment_date,1,7)
    ) BEGIN SELECT RAISE(ABORT, 'هذا الشهر مقفول لهذا العميل'); END;
  CREATE TRIGGER IF NOT EXISTS prevent_rental_financial_audit_update
    BEFORE UPDATE ON rental_financial_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'financial audit log is append-only');
    END;
  CREATE TRIGGER IF NOT EXISTS prevent_rental_financial_audit_delete
    BEFORE DELETE ON rental_financial_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'financial audit log is append-only');
    END;
`);
try { db.exec("ALTER TABLE rental_customers ADD COLUMN customer_type TEXT NOT NULL DEFAULT 'rental' CHECK(customer_type IN ('rental','company'))"); } catch {}
try { db.exec("ALTER TABLE rental_customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE rental_customers ADD COLUMN portal_user_id INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_customers_portal_user ON rental_customers(portal_user_id) WHERE portal_user_id IS NOT NULL"); } catch {}
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_customer_category_rules (
    category TEXT NOT NULL CHECK(category IN ('company','rental')),
    contact_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    effect TEXT NOT NULL CHECK(effect IN ('include','exclude')),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(category, contact_user_id)
  );

  CREATE TABLE IF NOT EXISTS chat_customer_direct_rules (
    customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    effect TEXT NOT NULL CHECK(effect IN ('include','exclude')),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(customer_user_id, contact_user_id),
    CHECK(customer_user_id <> contact_user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_chat_customer_direct_rules_customer
    ON chat_customer_direct_rules(customer_user_id);
`);
try { db.exec("ALTER TABLE rental_payments ADD COLUMN transfer_image_url TEXT"); } catch {}
try { db.exec("ALTER TABLE rental_payments ADD COLUMN transfer_status TEXT CHECK(transfer_status IN ('pending','confirmed'))"); } catch {}
try { db.exec("ALTER TABLE rental_payments ADD COLUMN submitted_by_user_id INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("ALTER TABLE rental_cash_remittances ADD COLUMN customer_name TEXT COLLATE NOCASE"); } catch {}
try { db.exec("ALTER TABLE rental_cash_remittances ADD COLUMN image_url TEXT"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN customer_type_snapshot TEXT CHECK(customer_type_snapshot IN ('rental','company'))"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN rental_company_share REAL"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN rental_broker_commission REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN rental_broker_type TEXT CHECK(rental_broker_type IN ('self','external'))"); } catch {}
try { db.exec("ALTER TABLE trips ADD COLUMN rental_broker_name TEXT"); } catch {}
db.exec(`
  INSERT OR IGNORE INTO rental_customers(name)
  SELECT DISTINCT TRIM(client_name) FROM trips WHERE TRIM(COALESCE(client_name,'')) <> '';
  UPDATE trips SET customer_type_snapshot=COALESCE(
    (SELECT customer_type FROM rental_customers c WHERE LOWER(TRIM(c.name))=LOWER(TRIM(trips.client_name))),
    'rental'
  ) WHERE TRIM(COALESCE(client_name,'')) <> '' AND customer_type_snapshot IS NULL;
`);

// ─── Maintenance Logs — سجل الأعطال ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS maintenance_logs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    card_number      TEXT,
    maintenance_date TEXT,
    entry_time       TEXT,
    exit_time        TEXT,
    exit_date        TEXT,
    vehicle_plate    TEXT,
    driver_name      TEXT,
    branch           TEXT,
    maintenance_type TEXT,
    description      TEXT,
    amount           REAL DEFAULT 0,
    imported_by      TEXT,
    technicians      TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  )
`);
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN technicians TEXT"); } catch {}
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN tires TEXT"); } catch {}
try { db.exec("ALTER TABLE maintenance_logs ADD COLUMN is_printed INTEGER DEFAULT 0"); } catch {}

// ─── Reimbursement Requests — طلبات الاستعاضة ────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS reimbursement_requests (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    request_number         TEXT UNIQUE,
    submitted_by           TEXT,
    description            TEXT,
    total_amount           REAL DEFAULT 0,
    invoice_count          INTEGER DEFAULT 0,
    invoice_image_url      TEXT,
    status                 TEXT DEFAULT 'pending',
    accountant_name        TEXT,
    accountant_notes       TEXT,
    accountant_reviewed_at TEXT,
    bank_officer_notes     TEXT,
    bank_sent_at           TEXT,
    reimbursed_at          TEXT,
    created_at             TEXT DEFAULT (datetime('now'))
  )
`);

// ─── Seed accountant + bank_officer test users ────────────────────────────────
try {
  const existsAcc = db.prepare("SELECT id FROM users WHERE phone=?").get("0500000008");
  if (!existsAcc) db.prepare("INSERT INTO users (name,phone,password,role,approval_status,active) VALUES (?,?,?,?,?,?)").run("أحمد المحاسب","0500000008","123456","accountant","approved",1);
  const existsBank = db.prepare("SELECT id FROM users WHERE phone=?").get("0500000009");
  if (!existsBank) db.prepare("INSERT INTO users (name,phone,password,role,approval_status,active) VALUES (?,?,?,?,?,?)").run("فهد مسؤول البنوك","0500000009","123456","bank_officer","approved",1);
  const existsCrane = db.prepare("SELECT id FROM users WHERE phone=?").get("0500000011");
  if (!existsCrane) db.prepare("INSERT INTO users (name,phone,password,role,approval_status,active) VALUES (?,?,?,?,?,?)").run("مشرف الدينه والأوناش","0500000011","123456","crane_traffic_supervisor","approved",1);
} catch { /* already exists */ }

// ─── Driver Document Requests (طلبات المستندات) ───────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS driver_doc_requests (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id             INTEGER,
    driver_name           TEXT,
    driver_phone          TEXT,
    request_type          TEXT    NOT NULL,
    request_label         TEXT    NOT NULL,
    date                  TEXT,
    loading_lat           REAL,
    loading_lng           REAL,
    loading_location_name TEXT,
    cargo_type            TEXT,
    status                TEXT    DEFAULT 'pending',
    created_at            TEXT    DEFAULT (datetime('now'))
  );
`);

/** Flush all WAL pages into the main DB file before a backup.
 *  Must be called before uploading erp.db to object storage so that
 *  the backup is complete and not missing recent writes. */
export function checkpointWAL(): void {
  // TRUNCATE writes every committed WAL frame into the main file. A busy or
  // partial result is a hard backup failure: uploading the main file anyway
  // would silently create a valid-looking but stale backup.
  const result = db.pragma("wal_checkpoint(TRUNCATE)") as { busy: number; log: number; checkpointed: number }[];
  const status = result?.[0];
  if (!status || status.busy !== 0 || status.log !== status.checkpointed) {
    throw new Error(
      `[db] WAL checkpoint incomplete (busy=${status?.busy ?? "unknown"}, log=${status?.log ?? "unknown"}, checkpointed=${status?.checkpointed ?? "unknown"})`,
    );
  }
}

// ─── Trips table: add legacy columns if missing ───────────────────────────
try {
  const tripCols = (db.pragma("table_info(trips)") as {name:string}[]).map(c => c.name);
  const legacyCols: [string, string][] = [
    ["return_value_no_vat",    "REAL DEFAULT 0"],
    ["payment_voucher",        "TEXT"],
    ["loading_card_no",        "TEXT"],
    ["vehicle_type",           "TEXT"],
    ["meter_ton",              "REAL DEFAULT 0"],
    ["supplier",               "TEXT"],
    ["material_expense_diesel","REAL DEFAULT 0"],
    ["work_value",             "REAL DEFAULT 0"],
    ["notes",                  "TEXT"],
    ["cash_collection",        "REAL DEFAULT 0"],
  ];
  for (const [col, def] of legacyCols) {
    if (!tripCols.includes(col)) {
      db.exec(`ALTER TABLE trips ADD COLUMN ${col} ${def}`);
    }
  }
} catch { /* non-fatal — columns may already exist */ }

// ─── rep_requests: طلب للمندوب من مشرف الدينا والأوناش ───────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS rep_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_no TEXT UNIQUE,
    product_name TEXT NOT NULL,
    loading_locations TEXT DEFAULT '[]',
    delivery_location TEXT,
    rep_name TEXT,
    rep_phone TEXT,
    status TEXT DEFAULT 'pending',
    vehicle_plate TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    permit_photo_url TEXT,
    invoice_photo_url TEXT,
    notes TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    assigned_at DATETIME,
    permit_uploaded_at DATETIME,
    loaded_at DATETIME,
    delivered_at DATETIME
  )
`);

// ─── Backfill: ensure every active product has a warehouse_item row in every active warehouse ──
try {
  const activeWarehouses = db.prepare("SELECT id FROM warehouses WHERE active=1").all() as { id: number }[];
  const activeProducts   = db.prepare("SELECT id, name, unit FROM products WHERE active=1").all() as { id: number; name: string; unit: string }[];
  const check = db.prepare("SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_id=?");
  const ins   = db.prepare("INSERT INTO warehouse_items (warehouse_id,product_name,product_id,quantity,unit,min_stock) VALUES (?,?,?,0,?,0)");
  for (const w of activeWarehouses) {
    for (const p of activeProducts) {
      if (!check.get(w.id, p.id)) ins.run(w.id, p.name, p.id, p.unit);
    }
  }
} catch { /* non-fatal */ }

// ─── warehouse_returns table ──────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS warehouse_returns (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id     INTEGER NOT NULL,
    warehouse_name   TEXT,
    product_name     TEXT NOT NULL,
    product_id       INTEGER,
    warehouse_item_id INTEGER,
    unit             TEXT DEFAULT 'وحدة',
    quantity         REAL NOT NULL,
    reason           TEXT,
    returned_by      TEXT,
    created_by       TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  )
`);

// ─── route_bonus_rates: بونص ثابت حسب مسار التحميل/التنزيل ونوع السيارة ────────
db.exec(`
  CREATE TABLE IF NOT EXISTS route_bonus_rates (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    from_region  TEXT    NOT NULL,
    to_region    TEXT    NOT NULL,
    vehicle_type TEXT    NOT NULL DEFAULT 'الكل',
    bonus_amount REAL    NOT NULL DEFAULT 0,
    notes        TEXT,
    created_at   TEXT    DEFAULT (datetime('now'))
  )
`);

// ─── route_bonus_rates: add rental_amount column ─────────────────────────────
try {
  const rbCols = db.prepare("PRAGMA table_info(route_bonus_rates)").all() as {name:string}[];
  const rbNames = rbCols.map(c => c.name);
  if (!rbNames.includes("rental_amount")) db.exec("ALTER TABLE route_bonus_rates ADD COLUMN rental_amount REAL DEFAULT 0");
} catch { /* non-fatal */ }

// ─── Migrate route_bonus_rates → tariffs.bonus_amount (one-time, idempotent) ──
try {
  const tariffCols = (db.prepare("PRAGMA table_info(tariffs)").all() as {name:string}[]).map(c => c.name);
  if (tariffCols.includes("bonus_amount")) {
    type RbRow = { id: number; from_region: string; to_region: string; vehicle_type: string; bonus_amount: number; rental_amount: number };
    const rbRows = db.prepare("SELECT * FROM route_bonus_rates").all() as RbRow[];
    for (const rb of rbRows) {
      const vt = rb.vehicle_type === "الكل" ? null : rb.vehicle_type;
      const existing = db.prepare(
        "SELECT id FROM tariffs WHERE loading_place=? AND unloading_place=? AND (vehicle_type=? OR (? IS NULL AND (vehicle_type IS NULL OR vehicle_type='')))"
      ).get(rb.from_region, rb.to_region, vt, vt) as { id: number } | undefined;
      if (existing) {
        db.prepare("UPDATE tariffs SET bonus_amount=? WHERE id=? AND (bonus_amount IS NULL OR bonus_amount=0)")
          .run(rb.bonus_amount, existing.id);
      } else {
        db.prepare(
          "INSERT OR IGNORE INTO tariffs (loading_place, unloading_place, vehicle_type, driver_expense, rental, bonus_amount, status) VALUES (?,?,?,0,?,?,'approved')"
        ).run(rb.from_region, rb.to_region, vt, rb.rental_amount || 0, rb.bonus_amount);
      }
    }
  }
} catch { /* non-fatal */ }

// ─── trips: add loading_region, unloading_region, route_bonus ────────────────
try {
  const tripColsInfo = db.prepare("PRAGMA table_info(trips)").all() as {name:string}[];
  const tripColNames = tripColsInfo.map(c => c.name);
  if (!tripColNames.includes("loading_region"))   db.exec("ALTER TABLE trips ADD COLUMN loading_region  TEXT");
  if (!tripColNames.includes("unloading_region")) db.exec("ALTER TABLE trips ADD COLUMN unloading_region TEXT");
  if (!tripColNames.includes("route_bonus"))      db.exec("ALTER TABLE trips ADD COLUMN route_bonus  REAL DEFAULT 0");
  if (!tripColNames.includes("trailer_number"))   db.exec("ALTER TABLE trips ADD COLUMN trailer_number TEXT");
  // Captures the tariff-based driver expense shown for an old trip before a
  // tariff mutation. NULL keeps new trips on the current tariff until needed.
  if (!tripColNames.includes("tariff_driver_expense_snapshot")) {
    db.exec("ALTER TABLE trips ADD COLUMN tariff_driver_expense_snapshot REAL");
  }
} catch { /* non-fatal */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS trip_tariff_expense_snapshots (
    trip_id INTEGER PRIMARY KEY,
    driver_expense REAL NOT NULL
  )
`);

try {
  const bvCols = (db.prepare("PRAGMA table_info(bulker_vehicles)").all() as { name: string }[]).map(c => c.name);
  if (!bvCols.includes("is_stopped")) db.exec("ALTER TABLE bulker_vehicles ADD COLUMN is_stopped INTEGER DEFAULT 0");
} catch { /* non-fatal */ }

// ─── Bulker Vehicles Registry (دفتر سيارات البلكر) ──────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS bulker_vehicles (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_plate    TEXT NOT NULL,
    driver_name      TEXT NOT NULL,
    destination      TEXT,
    driver_phone     TEXT,
    supervisor_phone TEXT,
    notes            TEXT,
    is_stopped       INTEGER DEFAULT 0,
    created_at       TEXT DEFAULT (datetime('now'))
  )
`);

// ─── Loading Orders (أوامر التحميل — البلكر) ─────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS loading_orders (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    permit_number      TEXT,
    cement_ref_number  TEXT,
    vehicle_plate      TEXT NOT NULL,
    driver_name        TEXT NOT NULL,
    cargo_type         TEXT,
    unload_location    TEXT,
    unload_location_id INTEGER,
    status             TEXT DEFAULT 'pending',
    confirmed_at       TEXT,
    saib_order_id      INTEGER,
    supply_request_id  INTEGER,
    created_by         TEXT,
    notes              TEXT,
    created_at         TEXT DEFAULT (datetime('now'))
  )
`);
try { db.exec(`ALTER TABLE loading_orders ADD COLUMN attachment_url TEXT`); } catch {}
try { db.exec(`ALTER TABLE loading_orders ADD COLUMN driver_phone TEXT`); } catch {}
try { db.exec(`ALTER TABLE loading_orders ADD COLUMN net_weight TEXT`); } catch {}
try { db.exec(`ALTER TABLE loading_orders ADD COLUMN tariff_id INTEGER`); } catch {}
try { db.exec(`ALTER TABLE loading_orders ADD COLUMN tariff_loading_place TEXT`); } catch {}
try { db.exec(`ALTER TABLE loading_orders ADD COLUMN tariff_unloading_place TEXT`); } catch {}
try { db.exec(`ALTER TABLE loading_orders ADD COLUMN tariff_bonus REAL`); } catch {}
try { db.exec(`ALTER TABLE loading_orders ADD COLUMN tariff_rental_per_ton REAL`); } catch {}
try { db.exec(`ALTER TABLE loading_orders ADD COLUMN unload_location_id INTEGER`); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS unload_locations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    notes      TEXT,
    phone_number TEXT,
    map_url    TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);
try { db.exec(`ALTER TABLE unload_locations ADD COLUMN phone_number TEXT`); } catch {}
try { db.exec(`ALTER TABLE unload_locations ADD COLUMN map_url TEXT`); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS routing_dispatches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tariff_id       INTEGER NOT NULL,
    loading_place   TEXT NOT NULL,
    unloading_place TEXT NOT NULL,
    driver_expense  REAL DEFAULT 0,
    rental          REAL DEFAULT 0,
    vehicle_plates  TEXT NOT NULL,
    route_type      TEXT DEFAULT 'direct',
    status          TEXT DEFAULT 'pending',
    created_by      TEXT,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
  )
`);
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN customer_name TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN rep_name TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN override_loading_place TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN override_unloading_place TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN tariff_loading_place TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN tariff_unloading_place TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN cargo_type TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN customer_type TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN rep_phone TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN permit_image_url TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN client_request_id TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN loading_location_name TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN loading_location_url TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN unloading_location_name TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE routing_dispatches ADD COLUMN unloading_location_url TEXT"); } catch { /* already exists */ }
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_routing_dispatches_client_request_id ON routing_dispatches(client_request_id) WHERE client_request_id IS NOT NULL AND TRIM(client_request_id)!=''");
} catch { /* already exists */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS routing_cargo_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ─── Sessions: add login-tracking columns (safe migration) ───────────────────
try { db.exec(`ALTER TABLE sessions ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`); } catch {}
try { db.exec(`ALTER TABLE sessions ADD COLUMN ip_address TEXT`); } catch {}

// ─── Single active sessions for hidden/developer administration ─────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS special_sessions (
    kind       TEXT PRIMARY KEY,
    token      TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ─── Developer Audit Log ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS dev_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    method      TEXT    NOT NULL,
    path        TEXT    NOT NULL,
    user_id     INTEGER,
    user_name   TEXT,
    user_role   TEXT,
    ip_address  TEXT,
    status_code INTEGER,
    created_at  TEXT    DEFAULT (datetime('now'))
  )
`);

// ─── System Config (key-value store for runtime settings) ────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS system_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Seed defaults (INSERT OR IGNORE preserves any existing values)
{
  const _ins = db.prepare("INSERT OR IGNORE INTO system_config (key, value) VALUES (?, ?)");
  const _defaults: [string, string][] = [
    ["otp_email",     "mohamedkhlil3331@gmail.com"],
    ["gmail_user",    process.env.GMAIL_USER?.trim() ?? ""],
    ["gmail_pass",    process.env.GMAIL_APP_PASSWORD?.trim() ?? ""],
    ["mkgh_password", "mkgh"],
    ["dev_password",  "09001120009328187184508MmOo@mkgh.com"],
    ["rental_accounts_password_hash", ""],
  ];
  for (const [k, v] of _defaults) _ins.run(k, v);
}

// ─── Site CMS: Content / Services / Emails ───────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS site_content (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS site_services (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    icon       TEXT    NOT NULL DEFAULT 'truck',
    label      TEXT    NOT NULL,
    sub        TEXT    DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS site_emails (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT    NOT NULL,
    email      TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    DEFAULT (datetime('now'))
  );
`);

{
  const sc = db.prepare("INSERT OR IGNORE INTO site_content (key, value) VALUES (?, ?)");
  const defaults: [string, string][] = [
    ["hero_title",     "مواد البناء\nالأفضل جودةً"],
    ["hero_subtitle",  "أسمنت، بلوك، حديد — توصيل سريع وتتبع لحظي لكل طلب في المملكة"],
    ["cta_browse",     "تصفح المنتجات"],
    ["cta_register",   "سجل الآن"],
    ["footer_tagline", "منصة متكاملة لمواد البناء — توصيل سريع وتتبع لحظي لجميع مناطق المملكة"],
    ["dev_whatsapp",   "966571748340"],
    ["dev_credit",     "تم إنشاء الموقع بواسطة MKGH — 0571748340"],
    ["hero_images",    JSON.stringify([
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1920&q=80",
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1920&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1920&q=80",
      "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=1920&q=80",
    ])],
  ];
  for (const [k, v] of defaults) sc.run(k, v);
  const ss = db.prepare("INSERT OR IGNORE INTO site_services (id, icon, label, sub, sort_order) VALUES (?, ?, ?, ?, ?)");
  const svcDefaults: [number, string, string, string, number][] = [
    [1, "truck",       "توصيل سريع",  "لجميع مناطق المملكة", 0],
    [2, "shield",      "جودة مضمونة", "منتجات موثوقة 100%",   1],
    [3, "zap",         "طلب فوري",    "تتبع طلبك لحظياً",     2],
    [4, "phone",       "دعم مستمر",   "خدمة عملاء 24/7",      3],
  ];
  for (const row of svcDefaults) ss.run(...row);
}

// ─── Contact Entries (تواصل معنا) ────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS contact_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    label        TEXT    NOT NULL DEFAULT 'تواصل معنا',
    phone        TEXT    NOT NULL,
    has_whatsapp INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    DEFAULT (datetime('now'))
  )
`);

// ─── Business Card Info ───────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS business_card_info (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);
{
  const bc = db.prepare("INSERT OR IGNORE INTO business_card_info (key, value) VALUES (?, ?)");
  const bDefaults: [string, string][] = [
    ["name",         "أحمد الرشودي"],
    ["job_title",    "المدير العام"],
    ["phone",        "050 381 888"],
    ["whatsapp",     "966503818880"],
    ["email",        ""],
    ["tagline",      "للمقاولات والنقليات\nContracting & Logistics"],
    ["company",      "مجموعة جيفر"],
    ["credit_text",  "تصميم الكارت والموقع بواسطة"],
    ["credit_brand", "MKGH"],
    ["credit_phone", "0571748340"],
    ["credit_logo",  ""],
    ["logo_data",    ""],
    ["bg_image",     ""],
    ["bg_opacity",   "20"],
    ["front_color",     "#12223d"],
    ["back_color",      "#f8f5ee"],
    ["color_name",      "#ffffff"],
    ["color_title",     "#c8a951"],
    ["color_phone",     "#e8e8e8"],
    ["color_tagline",   "#c8a951"],
    ["color_company_f", "#c8a951"],
    ["color_email",     "#c8a951"],
    ["color_company_b", "#8b6914"],
    ["color_credit",    "#8b7355"],
  ];
  for (const [k, v] of bDefaults) bc.run(k, v);
}

// ─── MKGH Email Schedule ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS mkgh_email_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS mkgh_report_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sent_at      TEXT DEFAULT (datetime('now')),
    period_label TEXT,
    recipients   TEXT,
    status       TEXT NOT NULL DEFAULT 'ok',
    error        TEXT,
    triggered_by TEXT DEFAULT 'scheduler'
  );
`);
{
  const _ei = db.prepare("INSERT OR IGNORE INTO mkgh_email_settings (key, value) VALUES (?, ?)");
  const _emailDefaults: [string, string][] = [
    ["enabled",                  "0"],
    ["send_day",                 "1"],
    ["recipients",               "[]"],
    ["last_sent",                ""],
    ["fallback_email",           ""],
    ["last_failure_notified",    ""],
  ];
  for (const [k, v] of _emailDefaults) _ei.run(k, v);
}

// ─── MKGH Data Analysis (تحليل بيانات MKGH) ──────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS mkgh_imports (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    imported_by TEXT,
    row_count  INTEGER DEFAULT 0,
    file_name  TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mkgh_transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id    INTEGER REFERENCES mkgh_imports(id),
    month        INTEGER,
    year         INTEGER,
    driver_name  TEXT,
    account_tab  TEXT,
    model        TEXT,
    activity     TEXT,
    cost_center  TEXT,
    account_name TEXT,
    tx_date      TEXT,
    doc_type     TEXT,
    doc_number   TEXT,
    description  TEXT,
    debit        REAL DEFAULT 0,
    credit       REAL DEFAULT 0,
    net          REAL DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mkgh_driver    ON mkgh_transactions(driver_name);
  CREATE INDEX IF NOT EXISTS idx_mkgh_vehicle   ON mkgh_transactions(cost_center);
  CREATE INDEX IF NOT EXISTS idx_mkgh_month     ON mkgh_transactions(year, month);
  CREATE INDEX IF NOT EXISTS idx_mkgh_acct_tab  ON mkgh_transactions(account_tab);
`);

// ─── Vehicle Stop Records (توقف السيارات اليومي) ─────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle_stop_records (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_plate TEXT NOT NULL,
      stop_date     TEXT NOT NULL,
      reason        TEXT DEFAULT 'توقف بدون عذر',
      source        TEXT DEFAULT 'auto',
      notes         TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(vehicle_plate, stop_date)
    );
    CREATE INDEX IF NOT EXISTS idx_vsr_date  ON vehicle_stop_records(stop_date);
    CREATE INDEX IF NOT EXISTS idx_vsr_plate ON vehicle_stop_records(vehicle_plate);
  `);
} catch {}

// ─── Seed system_config defaults ─────────────────────────────────────────────
try {
  db.prepare("INSERT OR IGNORE INTO system_config (key, value) VALUES ('show_vehicle_stops', '0')").run();
} catch {}

// ─── Settlement Items (انتقائية) ──────────────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settlement_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER NOT NULL,
      item_type     TEXT NOT NULL,
      item_ref      TEXT NOT NULL,
      amount        REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_si_settlement ON settlement_items(settlement_id);
  `);
} catch {}
try { db.exec("ALTER TABLE driver_settlements ADD COLUMN is_settlement_cash INTEGER DEFAULT 0"); } catch {}

// ─── Printed marks (وسم "تم طباعته" في سجل النشاط) ────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS printed_marks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_phone TEXT NOT NULL,
      item_type    TEXT NOT NULL,
      item_ref     TEXT NOT NULL,
      marked_at    TEXT NOT NULL DEFAULT (datetime('now')),
      batch_key    TEXT,
      UNIQUE(driver_phone, item_type, item_ref)
    );
    CREATE INDEX IF NOT EXISTS idx_pm_phone ON printed_marks(driver_phone);

    CREATE TABLE IF NOT EXISTS driver_custody_records (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_phone         TEXT NOT NULL,
      driver_name          TEXT,
      vehicle_plate        TEXT,
      print_date           TEXT NOT NULL,
      date_from            TEXT,
      date_to              TEXT,
      filter_ref           TEXT,
      load_types           TEXT,
      net_amount           REAL DEFAULT 0,
      item_count           INTEGER DEFAULT 0,
      items_snapshot       TEXT,
      print_snapshot_data  TEXT,
      snapshot_required    INTEGER DEFAULT 0,
      created_by_user_id   INTEGER,
      is_custody_printed   INTEGER DEFAULT 0,
      custody_printed_at   TEXT,
      is_cancelled         INTEGER NOT NULL DEFAULT 0,
      cancelled_at         TEXT,
      cancelled_by_user_id INTEGER,
      include_driver_signatures INTEGER NOT NULL DEFAULT 1,
      created_at           TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dcr_phone ON driver_custody_records(driver_phone);
    CREATE INDEX IF NOT EXISTS idx_dcr_date  ON driver_custody_records(print_date);
  `);
} catch {}

// ─── Migrate: add batch_key to printed_marks if missing ──────────────────────
try { db.exec("ALTER TABLE printed_marks ADD COLUMN batch_key TEXT"); } catch {}

// ─── Migrate: add batch_key to driver_custody_records if missing ──────────────
try { db.exec("ALTER TABLE driver_custody_records ADD COLUMN batch_key TEXT"); } catch {}
// Full immutable document for reopening and reprinting a custody statement exactly as issued.
try { db.exec("ALTER TABLE driver_custody_records ADD COLUMN print_snapshot_data TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_custody_records ADD COLUMN snapshot_required INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE driver_custody_records ADD COLUMN created_by_user_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE driver_custody_records ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE driver_custody_records ADD COLUMN cancelled_at TEXT"); } catch {}
try { db.exec("ALTER TABLE driver_custody_records ADD COLUMN cancelled_by_user_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE driver_custody_records ADD COLUMN include_driver_signatures INTEGER NOT NULL DEFAULT 1"); } catch {}

// ─── Statement signatures (توقيع السائق الرقمي على كشف الحساب) ───────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS statement_signatures (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_phone   TEXT NOT NULL,
      batch_key      TEXT NOT NULL UNIQUE,
      signature_data TEXT NOT NULL,
      signed_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ss_phone ON statement_signatures(driver_phone);
  `);
} catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS system_backup_restore_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL CHECK (mode IN ('full', 'append')),
    actor_id TEXT NOT NULL,
    source_filename TEXT NOT NULL,
    source_created_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
    restored_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_rows INTEGER NOT NULL DEFAULT 0,
    conflict_rows INTEGER NOT NULL DEFAULT 0,
    restored_files INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS system_backup_restore_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES system_backup_restore_runs(id),
    item_type TEXT NOT NULL CHECK (item_type IN ('record', 'object', 'local_upload', 'system')),
    table_name TEXT,
    record_key TEXT,
    display_label TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('restored', 'duplicated', 'conflict', 'already_present', 'skipped')),
    target_path TEXT,
    details TEXT,
    reviewed_at TEXT,
    reviewed_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_system_backup_restore_runs_created
    ON system_backup_restore_runs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_system_backup_restore_items_run
    ON system_backup_restore_items(run_id, id);
  CREATE INDEX IF NOT EXISTS idx_system_backup_restore_items_reviewed
    ON system_backup_restore_items(reviewed_at, id);
`);

export default db;


