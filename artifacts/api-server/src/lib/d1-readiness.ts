import buildReadinessManifest from "./d1-readiness.json";
import {
  drainD1Replication,
  ensureD1ReplicationSchema,
  getD1ReplicaDatabaseId,
  getD1ReplicationStatus,
  getProductionD1DatabaseId,
  hasD1MigrationBaselineBeenVerified,
  markD1MigrationBaselineVerified,
  queryD1DatabaseBatch,
  queryProductionD1,
  queryProductionD1Batch,
} from "./cloudflare-d1.js";
import { isR2ObjectStorageBackend } from "./r2-storage.js";

const REQUIRED_D1_FLAGS = [
  "ERP_D1_PRODUCTS_ENABLED",
  "ERP_D1_WAREHOUSES_ENABLED",
  "ERP_D1_REPLICATION_ENABLED",
] as const;
const REQUIRED_OBJECT_STORAGE_BACKEND = "r2";

const REQUIRED_TABLES = [
  "products",
  "product_ratings",
  "warehouses",
  "warehouse_items",
  "warehouse_dispatch_orders",
  "workflow_orders",
  "supply_requests",
  "rep_requests",
  "invoice_settings",
  "trailer_load_configs",
  "teidarat",
  "users",
  "sessions",
  "special_sessions",
  "dev_audit_log",
  "notifications",
  "vehicle_stop_records",
  "supervisor_settings",
  "bulker_vehicles",
  "fleet_vehicles",
  "employees",
  "km_rates",
  "vehicle_breakdowns",
  "vehicle_compliance_docs",
  "vehicle_images",
  "vehicle_type_assignments",
  "trips",
  "workshop_jobs",
  "workshop_inventory",
  "workshop_inventory_transactions",
  "purchase_requests",
  "purchase_invoices",
  "purchase_invoice_paste_batches",
  "purchase_invoice_returns",
  "maintenance_logs",
  "reimbursement_requests",
  "suppliers",
  "supplier_reimbursement_claims",
  "supplier_reimbursement_claim_print_events",
  "driver_profiles",
  "driver_aliases",
  "breakdown_reports",
  "client_rep_links",
  "rep_targets",
  "driver_custody_records",
  "tariffs",
  "tariff_locations",
  "trip_tariff_expense_snapshots",
  "loading_orders",
  "finance_settings",
  "driver_expenses",
  "fleet_expenses",
  "sla_settings",
  "company_settings",
  "flatbed_multipliers",
  "customer_transfers",
  "external_rentals",
  "external_account_entries",
  "external_parties",
  "contact_entries",
  "site_content",
  "site_services",
  "site_emails",
  "business_card_info",
  "rental_customers",
  "rental_statement_adjustments",
  "rental_account_entries",
  "rental_cash_remittances",
  "rental_financial_audit_log",
  "rental_monthly_closures",
  "rental_payments",
  "rental_trip_requests",
  "rental_receipt_objects",
  "mkgh_transactions",
  "mkgh_imports",
  "mkgh_email_settings",
  "mkgh_report_log",
  "system_backup_restore_items",
  "system_backup_restore_runs",
  "system_config",
] as const;

type BuildReadiness = {
  version: number;
  sqliteBlockers: Array<{ file: string; importsSqlite: boolean; callsSqlite: boolean }>;
};

type MigrationManifest = {
  source_table_count: number;
  migrated_table_counts_json: string;
  schema_adjustments_json: string;
  status: string;
  final_source_sha256: string | null;
  final_source_table_count: number | null;
  final_source_row_count: number | null;
};

type MigrationAdjustments = {
  preservedD1Extras?: Array<{ table: string; rowId: string | number }>;
  dynamicallyPreservedD1Tables?: string[];
  preservedD1Tables?: Array<{ table: string; sourceCount: number; d1Count: number }>;
};

const APPROVED_EXPLICIT_EXTRA_COUNTS: Record<string, number> = {
  driver_expenses: 2,
  printed_marks: 1,
  sessions: 15,
  trips: 8,
  warehouse_items: 4,
  workshop_inventory_transactions: 14,
};
const APPROVED_DYNAMIC_EXTRA_TABLES = new Set(["chat_push_queue"]);
const APPROVED_DYNAMIC_EXTRA_ROWS = 74;
const APPROVED_PRESERVED_D1_TABLES = new Set(["sessions"]);

function readBuildReadiness(): Promise<BuildReadiness> {
  const parsed = buildReadinessManifest as BuildReadiness;
  if (parsed.version !== 1 || !Array.isArray(parsed.sqliteBlockers)) {
    throw new Error("[d1-readiness] Build readiness manifest has an unsupported format");
  }
  return Promise.resolve(parsed);
}

function parseTableCounts(value: string): Record<string, number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("[d1-readiness] D1 migration manifest contains invalid table counts");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("[d1-readiness] D1 migration manifest table counts are not an object");
  }
  const counts = parsed as Record<string, unknown>;
  for (const [table, count] of Object.entries(counts)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || !Number.isSafeInteger(count) || Number(count) < 0) {
      throw new Error(`[d1-readiness] Invalid table name or row count in D1 migration manifest: ${table}`);
    }
  }
  return counts as Record<string, number>;
}

function parseApprovedExtraRows(
  value: string,
  targetRowCount: number,
  sourceRowCount: number,
  tableCounts: Record<string, number>,
): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("[d1-readiness] D1 migration manifest contains invalid schema adjustments");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("[d1-readiness] D1 migration manifest schema adjustments are not an object");
  }
  const adjustments = parsed as MigrationAdjustments;
  const explicitEntries = adjustments.preservedD1Extras ?? [];
  const dynamicTables = adjustments.dynamicallyPreservedD1Tables ?? [];
  const preservedTables = adjustments.preservedD1Tables ?? [];
  if (!Array.isArray(explicitEntries) || !Array.isArray(dynamicTables) || !Array.isArray(preservedTables)) {
    throw new Error("[d1-readiness] D1 migration manifest contains malformed preserved-row metadata");
  }

  const explicitCounts = new Map<string, number>();
  for (const entry of explicitEntries) {
    if (
      !entry || typeof entry.table !== "string"
      || !(typeof entry.rowId === "string" || Number.isSafeInteger(entry.rowId))
      || !(entry.table in tableCounts)
    ) {
      throw new Error("[d1-readiness] D1 migration manifest contains an invalid preserved-row entry");
    }
    explicitCounts.set(entry.table, (explicitCounts.get(entry.table) ?? 0) + 1);
  }
  for (const [table, expected] of Object.entries(APPROVED_EXPLICIT_EXTRA_COUNTS)) {
    if ((explicitCounts.get(table) ?? 0) !== expected) {
      throw new Error(`[d1-readiness] D1 migration manifest does not record the approved preserved rows for ${table}`);
    }
  }
  for (const table of explicitCounts.keys()) {
    if (!(table in APPROVED_EXPLICIT_EXTRA_COUNTS) && !APPROVED_DYNAMIC_EXTRA_TABLES.has(table)) {
      throw new Error(`[d1-readiness] D1 migration manifest contains unapproved extra rows for ${table}`);
    }
  }

  const uniqueDynamicTables = [...new Set(dynamicTables)];
  if (uniqueDynamicTables.length !== dynamicTables.length) {
    throw new Error("[d1-readiness] D1 migration manifest repeats a dynamically preserved table");
  }
  for (const table of dynamicTables) {
    if (!APPROVED_DYNAMIC_EXTRA_TABLES.has(table) || !(table in tableCounts)) {
      throw new Error(`[d1-readiness] D1 migration manifest contains an unapproved dynamically preserved table: ${table}`);
    }
  }

  const preservedTableNames = new Set<string>();
  let preservedTableRowDelta = 0;
  for (const entry of preservedTables) {
    if (
      !entry
      || typeof entry.table !== "string"
      || !APPROVED_PRESERVED_D1_TABLES.has(entry.table)
      || preservedTableNames.has(entry.table)
      || !Number.isSafeInteger(entry.sourceCount)
      || entry.sourceCount < 0
      || !Number.isSafeInteger(entry.d1Count)
      || entry.d1Count < 0
      || tableCounts[entry.table] !== entry.d1Count
    ) {
      throw new Error("[d1-readiness] D1 migration manifest contains an invalid preserved-table entry");
    }
    preservedTableNames.add(entry.table);
    preservedTableRowDelta += entry.d1Count - entry.sourceCount;
  }

  const explicitCount = [...explicitCounts.values()].reduce((sum, count) => sum + count, 0);
  const unexplainedDifference = targetRowCount - sourceRowCount - explicitCount - preservedTableRowDelta;
  if (unexplainedDifference < 0) {
    throw new Error("[d1-readiness] D1 target contains fewer rows than the verified source plus approved extras");
  }
  if (unexplainedDifference === 0) {
    return explicitCount + preservedTableRowDelta;
  }
  if (
    dynamicTables.length !== 1
    || dynamicTables[0] !== "chat_push_queue"
    || unexplainedDifference !== APPROVED_DYNAMIC_EXTRA_ROWS
    || Number(tableCounts.chat_push_queue) < APPROVED_DYNAMIC_EXTRA_ROWS
  ) {
    throw new Error("[d1-readiness] D1 target contains unapproved or unexplained extra rows");
  }
  return explicitCount + preservedTableRowDelta + unexplainedDifference;
}

async function validateCompletedMigration(): Promise<void> {
  const result = await queryProductionD1<MigrationManifest>(`
    SELECT source_table_count, migrated_table_counts_json, schema_adjustments_json,
           status, final_source_sha256, final_source_table_count, final_source_row_count
    FROM d1_migration_manifest
    WHERE id=1
  `);
  const migration = result.results[0];
  if (
    !migration
    || migration.status !== "completed"
    || !migration.final_source_sha256
    || migration.final_source_table_count == null
    || migration.final_source_row_count == null
  ) {
    throw new Error("[d1-readiness] Production D1 migration has not completed exact source-to-target verification");
  }

  const tableCounts = parseTableCounts(migration.migrated_table_counts_json);
  const tableNames = Object.keys(tableCounts);
  const initialSourceTableCount = Number(migration.source_table_count);
  const finalSourceTableCount = Number(migration.final_source_table_count);
  if (
    !Number.isSafeInteger(initialSourceTableCount)
    || initialSourceTableCount < 1
    || !Number.isSafeInteger(finalSourceTableCount)
    || finalSourceTableCount < initialSourceTableCount
    || tableNames.length !== finalSourceTableCount
  ) {
    throw new Error("[d1-readiness] D1 migration table count does not match its final verified source snapshot");
  }
  const expectedRowCount = Object.values(tableCounts).reduce((total, count) => total + count, 0);
  const sourceRowCount = Number(migration.final_source_row_count);
  if (!Number.isSafeInteger(expectedRowCount) || !Number.isSafeInteger(sourceRowCount)) {
    throw new Error("[d1-readiness] D1 migration row totals are outside the safe integer range");
  }
  const approvedExtras = parseApprovedExtraRows(
    migration.schema_adjustments_json,
    expectedRowCount,
    sourceRowCount,
    tableCounts,
  );
  if (expectedRowCount - approvedExtras !== sourceRowCount) {
    throw new Error("[d1-readiness] D1 migration row count does not match the source plus approved preserved rows");
  }

  const tableResult = await queryProductionD1<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const actualTables = new Set(tableResult.results.map(row => row.name));
  const missingTables = tableNames.filter(table => !actualTables.has(table));
  const missingRequiredTables = REQUIRED_TABLES.filter(table => !actualTables.has(table) || !(table in tableCounts));
  if (missingTables.length || missingRequiredTables.length) {
    throw new Error(
      `[d1-readiness] D1 schema is incomplete; missing migrated tables: ${[...new Set([...missingTables, ...missingRequiredTables])].join(", ")}`,
    );
  }

  try {
    await queryProductionD1("SELECT client_request_id FROM trips LIMIT 0");
  } catch {
    throw new Error("[d1-readiness] D1 trips table is missing client_request_id required by routing trip idempotency");
  }

  const primaryCounts: Record<string, number> = {};
  const baselineVerified = await hasD1MigrationBaselineBeenVerified();
  for (let start = 0; start < tableNames.length; start += 40) {
    const names = tableNames.slice(start, start + 40);
    const counts = await queryProductionD1Batch<{ row_count: number }>(names.map(table => ({
      sql: `SELECT COUNT(*) AS row_count FROM "${table}"`,
    })));
    for (let index = 0; index < names.length; index++) {
      const actual = Number(counts[index].results[0]?.row_count ?? 0);
      if (!Number.isSafeInteger(actual)) {
        throw new Error(`[d1-readiness] D1 returned an invalid row count for ${names[index]}`);
      }
      primaryCounts[names[index]] = actual;
      if (!baselineVerified && actual !== tableCounts[names[index]]) {
        throw new Error(
          `[d1-readiness] D1 row count changed since exact verification for ${names[index]} (expected ${tableCounts[names[index]]}, found ${actual})`,
        );
      }
    }
  }

  const replication = await getD1ReplicationStatus();
  if (!baselineVerified || replication.pendingOperations === 0) {
    const replicaId = getD1ReplicaDatabaseId();
    for (let start = 0; start < tableNames.length; start += 40) {
      const names = tableNames.slice(start, start + 40);
      const counts = await queryD1DatabaseBatch<{ row_count: number }>(replicaId, names.map(table => ({
        sql: `SELECT COUNT(*) AS row_count FROM "${table}"`,
      })));
      for (let index = 0; index < names.length; index++) {
        const actual = Number(counts[index].results[0]?.row_count ?? 0);
        const expected = baselineVerified ? primaryCounts[names[index]] : tableCounts[names[index]];
        if (!Number.isSafeInteger(actual) || actual !== expected) {
          throw new Error(
            `[d1-readiness] D1 replica row count differs for ${names[index]} (expected ${expected}, found ${actual})`,
          );
        }
      }
    }
    if (!baselineVerified) await markD1MigrationBaselineVerified();
  } else {
    console.warn(
      `[d1-readiness] D1 replica has ${replication.pendingOperations} queued mutation(s); writes remain on the primary until the replica catches up`,
    );
  }
}

/**
 * Fail closed before importing any module that can open SQLite or accept API
 * traffic. The runtime database mode is enabled only after both the build-time
 * SQLite reference scan and the exact D1 migration verification pass.
 */
export async function validateProductionD1Startup(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || process.env.ERP_DATABASE_BACKEND !== "d1") {
    throw new Error("[d1-readiness] Production D1 startup validation was invoked outside production D1 mode");
  }
  const disabledFlags = REQUIRED_D1_FLAGS.filter(flag => process.env[flag] !== "1");
  if (disabledFlags.length) {
    throw new Error(`[d1-readiness] D1 route backends are not enabled: ${disabledFlags.join(", ")}`);
  }
  if (process.env.ERP_OBJECT_STORAGE_BACKEND !== REQUIRED_OBJECT_STORAGE_BACKEND) {
    throw new Error("[d1-readiness] Set ERP_OBJECT_STORAGE_BACKEND=r2 before starting the production D1 backend");
  }
  if (!isR2ObjectStorageBackend()) {
    throw new Error("[d1-readiness] Cloudflare R2 credentials are not ready for the production D1 backend");
  }

  const buildReadiness = await readBuildReadiness();
  if (buildReadiness.sqliteBlockers.length) {
    const files = buildReadiness.sqliteBlockers.map(blocker => blocker.file);
    const preview = files.slice(0, 12).join(", ");
    const remaining = files.length > 12 ? ` and ${files.length - 12} more` : "";
    throw new Error(
      `[d1-readiness] Refusing to start: ${files.length} runtime source module(s) still import or call SQLite (${preview}${remaining})`,
    );
  }

  try {
    await queryProductionD1("SELECT created_at, ip_address FROM sessions LIMIT 0");
  } catch {
    throw new Error("[d1-readiness] D1 sessions table is missing created_at or ip_address required by authentication");
  }

  await ensureD1ReplicationSchema();
  await drainD1Replication(1_000);
  await validateCompletedMigration();
}
