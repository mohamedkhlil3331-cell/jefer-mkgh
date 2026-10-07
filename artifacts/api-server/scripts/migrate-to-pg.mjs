/**
 * One-time migration: SQLite → Supabase PostgreSQL
 * Run: node scripts/migrate-to-pg.mjs
 */
import Database from "better-sqlite3";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "erp.db");

const rawUrl = process.env.SUPABASE_DATABASE_URL || "";
const connectionString = rawUrl && !new URL(rawUrl).pathname.replace("/", "")
  ? rawUrl + "/postgres"
  : rawUrl;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const sqlite = new Database(DB_PATH);

// Column type mapping: SQLite value → PG-safe value
function clean(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number" && !isFinite(val)) return null;
  return val;
}

async function createSchema(client) {
  console.log("Creating schema...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY, name TEXT, job_title TEXT, department TEXT,
      nationality TEXT, phone TEXT, email TEXT, password TEXT, role TEXT DEFAULT 'worker',
      status TEXT DEFAULT 'active', salary DOUBLE PRECISION DEFAULT 0, hire_date TEXT,
      iqama_no TEXT, iqama_start TEXT, iqama_end TEXT,
      work_permit_start TEXT, work_permit_end TEXT,
      driver_license_no TEXT, driver_license_end TEXT,
      permissions TEXT DEFAULT '{}', created_at TEXT,
      entity TEXT, iqama_amount DOUBLE PRECISION, passport_end TEXT, vehicle_plate TEXT,
      efficiency TEXT, penalties DOUBLE PRECISION, allowances DOUBLE PRECISION,
      bonus DOUBLE PRECISION, rewards DOUBLE PRECISION
    );
    CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY, employee_id INTEGER, employee_name TEXT, leave_type TEXT,
      from_date TEXT, to_date TEXT, days INTEGER, reason TEXT,
      status TEXT DEFAULT 'pending', reviewed_by TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY, department TEXT, details TEXT,
      amount DOUBLE PRECISION, image_url TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY, date TEXT, car_id TEXT, driver_name TEXT, client_name TEXT,
      material_type TEXT, destination TEXT, trips_count INTEGER DEFAULT 1,
      unit_price DOUBLE PRECISION DEFAULT 0, total_amount DOUBLE PRECISION DEFAULT 0,
      vat DOUBLE PRECISION DEFAULT 0, net_amount DOUBLE PRECISION DEFAULT 0,
      created_at TEXT, trip_state TEXT, distance_km DOUBLE PRECISION DEFAULT 0,
      km_cost DOUBLE PRECISION DEFAULT 0, bonus_amount DOUBLE PRECISION DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS fleet_expenses (
      id SERIAL PRIMARY KEY, date TEXT, car_id TEXT, expense_category TEXT,
      description TEXT, amount DOUBLE PRECISION, document_number TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS petty_cash (
      id SERIAL PRIMARY KEY, date TEXT, custodian_name TEXT, transaction_type TEXT,
      description TEXT, amount_in DOUBLE PRECISION DEFAULT 0,
      amount_out DOUBLE PRECISION DEFAULT 0, receipt_number TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY, plate_number TEXT, vehicle_type TEXT,
      status TEXT, driver_name TEXT, notes TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY, order_type TEXT, quantity DOUBLE PRECISION, unit TEXT,
      client_name TEXT, client_phone TEXT, location TEXT,
      gps_lat DOUBLE PRECISION, gps_lng DOUBLE PRECISION,
      car_id TEXT, driver_name TEXT, status TEXT, notes TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workshop (
      id SERIAL PRIMARY KEY, vehicle_id TEXT, issue_desc TEXT, technician TEXT,
      status TEXT DEFAULT 'open', cost DOUBLE PRECISION DEFAULT 0,
      start_date TEXT, end_date TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS fleet_vehicles (
      id SERIAL PRIMARY KEY, plate_number TEXT, vehicle_type TEXT,
      status TEXT DEFAULT 'available', driver_name TEXT, notes TEXT, created_at TEXT,
      linked_user_phone TEXT, vehicle_password TEXT, vehicle_category TEXT,
      vehicle_type_normalized TEXT, insurance_start TEXT, insurance_end TEXT, insurance_image TEXT,
      inspection_start TEXT, inspection_end TEXT, inspection_image TEXT,
      operation_card_start TEXT, operation_card_end TEXT, operation_card_image TEXT,
      driver_phone TEXT, equipment_type TEXT DEFAULT 'none',
      load_capacity_tons DOUBLE PRECISION DEFAULT 0, vehicle_subtype TEXT, gps_device_id TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer',
      email TEXT, company_name TEXT, vat_number TEXT, cr_number TEXT,
      active INTEGER DEFAULT 1, created_at TEXT,
      approval_status TEXT DEFAULT 'approved', register_note TEXT,
      rep_id INTEGER, complaints_whatsapp TEXT, vehicle_plate TEXT,
      permissions TEXT, address TEXT, city TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER, expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, image_url TEXT,
      price_per_unit DOUBLE PRECISION DEFAULT 0, unit TEXT DEFAULT 'كيس',
      category TEXT, stock INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0, created_at TEXT,
      price_delivered DOUBLE PRECISION DEFAULT 0, price_truck_buraydah DOUBLE PRECISION DEFAULT 0,
      load_capacity INTEGER DEFAULT 0, packaging_type TEXT,
      offer_label TEXT, offer_pct DOUBLE PRECISION DEFAULT 0,
      offer_active INTEGER DEFAULT 0, min_stock INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS product_ratings (
      id SERIAL PRIMARY KEY, product_id INTEGER, customer_phone TEXT,
      customer_name TEXT, rating INTEGER DEFAULT 5, comment TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workflow_orders (
      id SERIAL PRIMARY KEY, order_number TEXT UNIQUE NOT NULL,
      customer_phone TEXT NOT NULL, customer_name TEXT,
      rep_id INTEGER, product_id INTEGER, product_name TEXT,
      quantity DOUBLE PRECISION NOT NULL, unit TEXT,
      unit_price DOUBLE PRECISION DEFAULT 0, total_before_vat DOUBLE PRECISION DEFAULT 0,
      vat_amount DOUBLE PRECISION DEFAULT 0, total_with_vat DOUBLE PRECISION DEFAULT 0,
      delivery_location TEXT, delivery_lat DOUBLE PRECISION, delivery_lng DOUBLE PRECISION,
      destination_type TEXT DEFAULT 'مستودع', stage TEXT DEFAULT 'pending',
      reviewer_id INTEGER, reviewer_name TEXT, review_date TEXT,
      payment_transfer_ref TEXT, payment_amount DOUBLE PRECISION,
      supervisor_id INTEGER, vehicle_id INTEGER, vehicle_plate TEXT,
      vehicle_assign_date TEXT, warehouse_id INTEGER, invoice_number TEXT,
      invoice_image_url TEXT, invoice_date TEXT, driver_id INTEGER,
      driver_name TEXT, driver_phone TEXT, loading_photo_url TEXT,
      loading_date TEXT, delivery_date TEXT, delivery_notes TEXT,
      cancel_reason TEXT, created_at TEXT,
      driver_lat DOUBLE PRECISION, driver_lng DOUBLE PRECISION,
      driver_location_updated_at TEXT, tariff_id INTEGER,
      loading_place TEXT, rental_amount DOUBLE PRECISION, driver_bonus DOUBLE PRECISION,
      company_entity_id INTEGER, cancelled_at TEXT, cancelled_by TEXT,
      rep_phone TEXT, supervisor_phone TEXT, payment_method TEXT DEFAULT 'transfer',
      bank_receipt_image TEXT, alt_driver_phone TEXT, alt_driver_name TEXT,
      packaging_type TEXT, cash_approved_by TEXT, cash_approval_note TEXT,
      cash_approved_at TEXT, invoice_draft_data TEXT, invoice_warehouse_id INTEGER,
      loading_point_id INTEGER, loading_point_name TEXT, inventory_deducted INTEGER DEFAULT 0,
      required_equipment TEXT, required_vehicle_type TEXT,
      vehicle_stopped_since TEXT, vehicle_stop_notified_at TEXT
    );
    CREATE TABLE IF NOT EXISTS customer_transfers (
      id SERIAL PRIMARY KEY, customer_phone TEXT, customer_name TEXT,
      amount DOUBLE PRECISION, transfer_date TEXT, transfer_ref TEXT,
      bank_name TEXT, transfer_image TEXT, confirmed INTEGER DEFAULT 0,
      confirmed_by TEXT, confirmed_date TEXT, notes TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY, user_phone TEXT NOT NULL, title TEXT NOT NULL,
      body TEXT, data TEXT, read INTEGER DEFAULT 0, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS warehouses (
      id SERIAL PRIMARY KEY, name TEXT, location TEXT, manager_name TEXT,
      capacity INTEGER, notes TEXT, active INTEGER DEFAULT 1, created_at TEXT,
      lat DOUBLE PRECISION, lng DOUBLE PRECISION, warehouse_manager_user_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS warehouse_items (
      id SERIAL PRIMARY KEY, warehouse_id INTEGER, product_name TEXT,
      product_id INTEGER, quantity DOUBLE PRECISION, unit TEXT,
      min_stock DOUBLE PRECISION, last_updated TEXT, notes TEXT, created_at TEXT,
      max_stock DOUBLE PRECISION DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tariffs (
      id SERIAL PRIMARY KEY, row_id INTEGER, loading_place TEXT,
      unloading_place TEXT, driver_expense DOUBLE PRECISION, rental DOUBLE PRECISION,
      notes TEXT, synced_at TEXT, status TEXT, proposed_by TEXT, price_set_by TEXT
    );
    CREATE TABLE IF NOT EXISTS driver_expenses (
      id SERIAL PRIMARY KEY, driver_phone TEXT, driver_name TEXT,
      order_id INTEGER, order_number TEXT, expense_type TEXT,
      amount DOUBLE PRECISION, liters DOUBLE PRECISION, description TEXT,
      expense_date TEXT, created_at TEXT, is_settlement_cash INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS driver_settlements (
      id SERIAL PRIMARY KEY, driver_phone TEXT, driver_name TEXT,
      allocated_amount DOUBLE PRECISION, settlement_date TEXT,
      settled_by TEXT, notes TEXT, created_at TEXT, deferred INTEGER, delivered_at TEXT
    );
    CREATE TABLE IF NOT EXISTS driver_profiles (
      id SERIAL PRIMARY KEY, vehicle_plate TEXT, driver_name TEXT, phone TEXT,
      branch TEXT, email TEXT, license_url TEXT, operation_card_url TEXT,
      driver_card_url TEXT, insurance_url TEXT, status TEXT, notes TEXT,
      synced_at TEXT, created_at TEXT, user_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS hr_requests (
      id SERIAL PRIMARY KEY, employee_id INTEGER, employee_name TEXT,
      employee_job TEXT, employee_dept TEXT, request_type TEXT, details TEXT,
      from_date TEXT, to_date TEXT, days INTEGER, status TEXT,
      reviewed_by TEXT, review_notes TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS ai_messages (
      id SERIAL PRIMARY KEY, user_id INTEGER, user_phone TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS breakdown_reports (
      id SERIAL PRIMARY KEY, driver_phone TEXT, driver_name TEXT,
      vehicle_id INTEGER, vehicle_plate TEXT, breakdown_type TEXT,
      description TEXT, photo_url TEXT, status TEXT DEFAULT 'open',
      resolved_by TEXT, resolve_notes TEXT, resolved_at TEXT, created_at TEXT,
      operational_state TEXT, action_taken TEXT, invoice_image_url TEXT, fault_attribution TEXT
    );
    CREATE TABLE IF NOT EXISTS workshop_jobs (
      id SERIAL PRIMARY KEY, vehicle_plate TEXT, breakdown_report_id INTEGER,
      title TEXT NOT NULL, job_type TEXT NOT NULL DEFAULT 'صيانة_مباشرة',
      description TEXT, parts_used TEXT, labor_cost DOUBLE PRECISION DEFAULT 0,
      parts_cost DOUBLE PRECISION DEFAULT 0, total_cost DOUBLE PRECISION DEFAULT 0,
      invoice_target TEXT DEFAULT 'vehicle', status TEXT DEFAULT 'open',
      created_by TEXT, notes TEXT, created_at TEXT, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workshop_inventory (
      id SERIAL PRIMARY KEY, item_name TEXT NOT NULL, item_code TEXT,
      category TEXT DEFAULT 'عام', quantity DOUBLE PRECISION DEFAULT 0,
      unit TEXT DEFAULT 'قطعة', min_stock DOUBLE PRECISION DEFAULT 0,
      cost_per_unit DOUBLE PRECISION DEFAULT 0, supplier TEXT,
      last_updated TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS purchase_requests (
      id SERIAL PRIMARY KEY, item_name TEXT NOT NULL, quantity DOUBLE PRECISION,
      unit TEXT DEFAULT 'قطعة', reason TEXT, workshop_job_id INTEGER,
      requested_by TEXT, status TEXT DEFAULT 'pending', approved_by TEXT,
      rejection_reason TEXT, estimated_cost DOUBLE PRECISION DEFAULT 0,
      actual_cost DOUBLE PRECISION DEFAULT 0, supplier TEXT, received_at TEXT,
      created_at TEXT, vehicle_plate TEXT
    );
    CREATE TABLE IF NOT EXISTS finance_settings (
      id SERIAL PRIMARY KEY, supervisor_salary_pct DOUBLE PRECISION,
      transport_pct DOUBLE PRECISION, admin_pct DOUBLE PRECISION,
      driver_salary_default DOUBLE PRECISION, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS company_settings (
      id SERIAL PRIMARY KEY, entity_name TEXT, tax_number TEXT,
      national_address TEXT, cr_number TEXT, phone TEXT, logo_url TEXT,
      is_default INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS external_rentals (
      id SERIAL PRIMARY KEY, customer_phone TEXT, customer_name TEXT,
      vehicle_type TEXT DEFAULT 'سطحة', start_date TEXT, duration_type TEXT DEFAULT 'محددة',
      duration_days INTEGER DEFAULT 1, status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'transfer', payment_status TEXT DEFAULT 'pending',
      notes TEXT, assigned_vehicle TEXT, assigned_driver TEXT, assigned_by TEXT,
      assigned_at TEXT, total_price DOUBLE PRECISION DEFAULT 0, created_at TEXT,
      pickup_location TEXT, pickup_lat DOUBLE PRECISION, pickup_lng DOUBLE PRECISION,
      destination_location TEXT, destination_lat DOUBLE PRECISION, destination_lng DOUBLE PRECISION,
      lease_proposal TEXT, driver_bonus DOUBLE PRECISION DEFAULT 0, driver_phone TEXT,
      driver_stage TEXT, driver_stage_at TEXT, payment_type TEXT DEFAULT 'transfer'
    );
    CREATE TABLE IF NOT EXISTS offers (
      id SERIAL PRIMARY KEY, title TEXT, description TEXT, image_url TEXT,
      discount_pct DOUBLE PRECISION DEFAULT 0, valid_from TEXT, valid_until TEXT,
      active INTEGER DEFAULT 1, created_by TEXT, created_at TEXT, product_ids TEXT
    );
    CREATE TABLE IF NOT EXISTS rental_vehicle_types (
      id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT,
      icon TEXT DEFAULT '🚛', active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
      created_at TEXT, rate_per_km DOUBLE PRECISION DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS client_rep_links (
      id SERIAL PRIMARY KEY, customer_phone TEXT, rep_phone TEXT,
      link_status TEXT DEFAULT 'pending_rep_approval', linked_at TEXT, approved_at TEXT,
      UNIQUE(customer_phone, rep_phone)
    );
    CREATE TABLE IF NOT EXISTS rep_targets (
      id SERIAL PRIMARY KEY, rep_phone TEXT, product_category TEXT,
      target_qty DOUBLE PRECISION DEFAULT 0, tier1_qty DOUBLE PRECISION DEFAULT 0,
      tier1_bonus DOUBLE PRECISION DEFAULT 0, tier2_qty DOUBLE PRECISION DEFAULT 0,
      tier2_bonus DOUBLE PRECISION DEFAULT 0, tier3_qty DOUBLE PRECISION DEFAULT 0,
      tier3_bonus DOUBLE PRECISION DEFAULT 0, period TEXT DEFAULT 'monthly',
      start_date TEXT, end_date TEXT, active INTEGER DEFAULT 1, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS trip_bonus_rates (
      id SERIAL PRIMARY KEY, state TEXT UNIQUE NOT NULL,
      rate_per_km DOUBLE PRECISION DEFAULT 0, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS vehicle_compliance_docs (
      id SERIAL PRIMARY KEY, car_number TEXT, doc_type TEXT, start_date TEXT,
      end_date TEXT, image_url TEXT, notes TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS vehicle_breakdowns (
      id SERIAL PRIMARY KEY, car_number TEXT, driver_name TEXT, driver_phone TEXT,
      operational_state TEXT, action_taken TEXT, description TEXT, photo_url TEXT,
      status TEXT DEFAULT 'open', invoice_image_url TEXT, resolved_by TEXT,
      resolve_notes TEXT, resolved_at TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS flatbed_multipliers (
      id SERIAL PRIMARY KEY, origin_city TEXT, dest_city TEXT,
      multiplier DOUBLE PRECISION, notes TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS supervisor_settings (
      id SERIAL PRIMARY KEY, auto_assign_enabled INTEGER DEFAULT 0,
      updated_at TEXT, auto_assign_criteria TEXT DEFAULT 'nearest',
      stopped_alert_minutes INTEGER DEFAULT 30
    );
    CREATE TABLE IF NOT EXISTS client_locations (
      id SERIAL PRIMARY KEY, customer_phone TEXT, alias TEXT, address TEXT,
      lat DOUBLE PRECISION, lng DOUBLE PRECISION, is_default INTEGER DEFAULT 0,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS loading_points (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, city TEXT, address TEXT,
      lat DOUBLE PRECISION, lng DOUBLE PRECISION, active INTEGER DEFAULT 1,
      notes TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS order_ratings (
      id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, order_number TEXT,
      customer_phone TEXT, product_rating INTEGER, product_comment TEXT,
      driver_rating INTEGER, driver_comment TEXT, driver_name TEXT,
      rep_rating INTEGER, rep_comment TEXT, rep_name TEXT,
      warehouse_rating INTEGER, warehouse_comment TEXT,
      company_rating INTEGER, company_comment TEXT, created_at TEXT,
      CONSTRAINT uq_order_ratings_order UNIQUE(order_id)
    );
    CREATE TABLE IF NOT EXISTS legal_docs (
      id SERIAL PRIMARY KEY, title TEXT, category TEXT DEFAULT 'نظام',
      doc_number TEXT, published_date TEXT, content TEXT, file_url TEXT,
      tags TEXT, active INTEGER DEFAULT 1, created_by TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS hearings (
      id SERIAL PRIMARY KEY, title TEXT, case_type TEXT DEFAULT 'مخالفة مرورية',
      case_number TEXT, party_name TEXT, driver_name TEXT, related_order_id INTEGER,
      vehicle_plate TEXT, hearing_date TEXT, court TEXT, status TEXT DEFAULT 'مفتوحة',
      notes TEXT, outcome TEXT, closed_at TEXT, created_by TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS system_logs (
      id SERIAL PRIMARY KEY, user_phone TEXT, user_name TEXT, user_role TEXT,
      action TEXT, entity_type TEXT, entity_id TEXT, details TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS trailer_load_configs (
      id SERIAL PRIMARY KEY, name TEXT, product_category TEXT,
      trailer_capacity DOUBLE PRECISION, min_threshold DOUBLE PRECISION,
      unit TEXT DEFAULT 'وحدة', active INTEGER DEFAULT 1, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS supply_requests (
      id SERIAL PRIMARY KEY, warehouse_id INTEGER, warehouse_name TEXT,
      product_name TEXT, product_category TEXT, requested_qty DOUBLE PRECISION,
      unit TEXT DEFAULT 'وحدة', trailer_loads DOUBLE PRECISION DEFAULT 1,
      status TEXT DEFAULT 'pending', priority TEXT DEFAULT 'normal',
      destination_division TEXT, requested_by TEXT, approved_by TEXT, notes TEXT,
      auto_triggered INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS invoice_settings (
      id SERIAL PRIMARY KEY, auto_replenishment INTEGER DEFAULT 0,
      auto_invoice_enabled INTEGER DEFAULT 0, auto_invoice_categories TEXT DEFAULT '[]',
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS km_rates (
      id SERIAL PRIMARY KEY, vehicle_type TEXT UNIQUE NOT NULL,
      rate_per_km DOUBLE PRECISION DEFAULT 0, multiplier DOUBLE PRECISION DEFAULT 1,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS vehicle_driver_history (
      id SERIAL PRIMARY KEY, plate_number TEXT, driver_name TEXT, driver_phone TEXT,
      assigned_at TEXT, relieved_at TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS driver_company_sends (
      id SERIAL PRIMARY KEY, driver_phone TEXT, driver_name TEXT,
      amount DOUBLE PRECISION, note TEXT, sent_by TEXT, created_at TEXT
    );
  `);
  console.log("Schema created.");
}

async function migrateTable(client, tableName, rows) {
  if (!rows || rows.length === 0) {
    console.log(`  ${tableName}: empty, skipped`);
    return;
  }

  // Get columns from first row
  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `"${c}"`).join(", ");

  let inserted = 0;
  for (const row of rows) {
    const vals = cols.map(c => clean(row[c]));
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
    try {
      await client.query(
        `INSERT INTO ${tableName} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        vals
      );
      inserted++;
    } catch (e) {
      // Skip rows with constraint violations silently
    }
  }
  console.log(`  ${tableName}: ${inserted}/${rows.length} rows inserted`);
}

async function fixSequences(client, tables) {
  for (const t of tables) {
    try {
      await client.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1))`);
    } catch { /* no serial column */ }
  }
}

async function main() {
  console.log("=== SQLite → Supabase Migration ===");
  
  // Read all SQLite data
  const tableNames = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(t => t.name);

  const dump = {};
  for (const t of tableNames) {
    try { dump[t] = sqlite.prepare(`SELECT * FROM ${t}`).all(); }
    catch { dump[t] = []; }
  }

  const client = await pool.connect();
  try {
    await createSchema(client);

    // Migrate in dependency order (users first, then refs)
    const order = [
      "employees","vehicles","fleet_vehicles","users","products","warehouses",
      "sessions","leave_requests","invoices","trips","fleet_expenses","petty_cash",
      "orders","workshop","product_ratings","workflow_orders","customer_transfers",
      "notifications","warehouse_items","tariffs","driver_expenses","driver_settlements",
      "driver_profiles","hr_requests","ai_messages","breakdown_reports","workshop_jobs",
      "workshop_inventory","purchase_requests","finance_settings","company_settings",
      "external_rentals","offers","rental_vehicle_types","client_rep_links","rep_targets",
      "trip_bonus_rates","vehicle_compliance_docs","vehicle_breakdowns","flatbed_multipliers",
      "supervisor_settings","client_locations","loading_points","order_ratings","legal_docs",
      "hearings","system_logs","trailer_load_configs","supply_requests","invoice_settings",
      "km_rates","vehicle_driver_history","driver_company_sends",
    ];

    console.log("\nMigrating data...");
    for (const t of order) {
      if (dump[t]) await migrateTable(client, t, dump[t]);
    }

    // Fix sequences so next inserts don't conflict
    console.log("\nFixing sequences...");
    await fixSequences(client, order);

    console.log("\n✅ Migration complete!");
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch(e => { console.error("Migration failed:", e); process.exit(1); });
