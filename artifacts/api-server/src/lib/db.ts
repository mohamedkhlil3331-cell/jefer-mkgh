import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, "erp.db");
export const UPLOADS_PATH = UPLOADS_DIR;

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    job_title   TEXT,
    department  TEXT,
    nationality TEXT,
    phone       TEXT,
    email       TEXT    UNIQUE,
    password    TEXT,
    role        TEXT    DEFAULT 'worker',  -- admin | supervisor | worker
    status      TEXT    DEFAULT 'active',  -- active | suspended | terminated
    salary      REAL    DEFAULT 0,
    hire_date   TEXT,
    iqama_no        TEXT,
    iqama_start     TEXT,
    iqama_end       TEXT,
    work_permit_start TEXT,
    work_permit_end   TEXT,
    driver_license_no   TEXT,
    driver_license_end  TEXT,
    permissions TEXT    DEFAULT '{}',
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id   INTEGER REFERENCES employees(id),
    employee_name TEXT,
    leave_type    TEXT,   -- annual | sick | emergency | unpaid
    from_date     TEXT,
    to_date       TEXT,
    days          INTEGER,
    reason        TEXT,
    status        TEXT    DEFAULT 'pending', -- pending | approved | rejected
    reviewed_by   TEXT,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    department  TEXT    NOT NULL,
    details     TEXT,
    amount      REAL,
    image_url   TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trips (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    date          TEXT    NOT NULL,
    car_id        TEXT    NOT NULL,
    driver_name   TEXT,
    client_name   TEXT,
    material_type TEXT,
    destination   TEXT,
    trips_count   INTEGER DEFAULT 1,
    unit_price    REAL    DEFAULT 0,
    total_amount  REAL    DEFAULT 0,
    vat           REAL    DEFAULT 0,
    net_amount    REAL    DEFAULT 0,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fleet_expenses (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT    NOT NULL,
    car_id           TEXT,
    expense_category TEXT,
    description      TEXT,
    amount           REAL    NOT NULL,
    document_number  TEXT,
    created_at       TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS petty_cash (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT    NOT NULL,
    custodian_name   TEXT,
    transaction_type TEXT,  -- in | out
    description      TEXT,
    amount_in        REAL    DEFAULT 0,
    amount_out       REAL    DEFAULT 0,
    receipt_number   TEXT,
    created_at       TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_number TEXT    UNIQUE NOT NULL,
    vehicle_type TEXT,
    status       TEXT    DEFAULT 'available', -- available | busy | maintenance | broken
    driver_name  TEXT,
    notes        TEXT,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_type   TEXT,
    quantity     REAL,
    unit         TEXT,
    client_name  TEXT,
    client_phone TEXT,
    location     TEXT,
    gps_lat      REAL,
    gps_lng      REAL,
    car_id       TEXT,
    driver_name  TEXT,
    status       TEXT    DEFAULT 'new', -- new | in_progress | delivered | cancelled
    notes        TEXT,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workshop (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id      TEXT,
    issue_desc      TEXT,
    technician      TEXT,
    status          TEXT    DEFAULT 'open', -- open | in_progress | done
    cost            REAL    DEFAULT 0,
    start_date      TEXT,
    end_date        TEXT,
    created_at      TEXT    DEFAULT (datetime('now'))
  );
`);

// Seed sample vehicles if empty
const vehicleCount = (db.prepare("SELECT COUNT(*) as c FROM vehicles").get() as { c: number }).c;
if (vehicleCount === 0) {
  const insert = db.prepare("INSERT INTO vehicles (plate_number, vehicle_type, status, driver_name) VALUES (?, ?, ?, ?)");
  insert.run("ABC-1234", "شاحنة نقل", "available", "أحمد محمد");
  insert.run("XYZ-5678", "قلاب", "busy", "محمد علي");
  insert.run("DEF-9012", "بيك أب", "maintenance", "خالد سالم");
}

export default db;
