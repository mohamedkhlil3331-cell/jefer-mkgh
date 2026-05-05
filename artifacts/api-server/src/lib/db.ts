import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const UPLOADS_PATH = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOADS_PATH)) fs.mkdirSync(UPLOADS_PATH, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, "erp.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
    driver_name TEXT, client_name TEXT, material_type TEXT, destination TEXT,
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
`);

// ─── Backward-compat: add price columns to existing DBs ──────────────────────
try { db.exec("ALTER TABLE products ADD COLUMN price_delivered REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN price_truck_buraydah REAL DEFAULT 0"); } catch {}

// ─── Seed data ────────────────────────────────────────────────────────────────
const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as {c:number}).c;
if (userCount === 0) {
  const ins = db.prepare("INSERT INTO users (name,phone,password,role,company_name,vat_number) VALUES (?,?,?,?,?,?)");
  ins.run("المدير العام",    "0500000000","admin123",  "admin",      "شركة MKGH", "310000000000003");
  ins.run("أحمد المراجع",   "0500000001","123456",    "reviewer",   null, null);
  ins.run("خالد مشرف النقليات","0500000002","123456", "supervisor", null, null);
  ins.run("محمد المستودع",  "0500000003","123456",    "warehouse",  null, null);
  ins.run("عبد الهادي السائق","0500000004","123456",  "driver",     null, null);
  ins.run("سالم المندوب",   "0500000005","123456",    "rep",        null, null);
  ins.run("عميل تجريبي",    "0555555555","123456",    "customer",   "مؤسسة البناء", "310000000000999");
  ins.run("عميل ثاني",      "0555555556","123456",    "customer",   "شركة العمارة", null);
}

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
      INSERT INTO employees
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

// Import spreadsheet order if not exists
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
    driver_card_url     TEXT,
    insurance_url       TEXT,
    status              TEXT DEFAULT 'نشط',
    notes               TEXT,
    synced_at           TEXT DEFAULT (datetime('now')),
    created_at          TEXT DEFAULT (datetime('now'))
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
  CREATE TABLE IF NOT EXISTS driver_expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_phone TEXT NOT NULL,
    driver_name  TEXT,
    order_id     INTEGER,
    order_number TEXT,
    expense_type TEXT DEFAULT 'ديزل',
    amount       REAL NOT NULL,
    liters       REAL DEFAULT 0,
    description  TEXT,
    expense_date TEXT DEFAULT (date('now')),
    created_at   TEXT DEFAULT (datetime('now'))
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

export function generateOrderNumber(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `MKGH${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export default db;
