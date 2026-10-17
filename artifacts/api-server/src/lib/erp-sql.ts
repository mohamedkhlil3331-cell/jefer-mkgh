import { queryProductionD1, queryProductionD1Batch, type ProductionD1Statement } from "./cloudflare-d1.js";
import { isD1DatabaseMode } from "./database-mode.js";

export type ErpSqlRunResult = {
  lastInsertRowid: number | bigint;
  changes: number;
};

async function getSqliteDb() {
  if (isD1DatabaseMode()) {
    throw new Error("[erp-sql] SQLite access is not allowed while the production D1 backend is selected");
  }
  return (await import("./db.js")).default;
}

export async function queryAll<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  if (isD1DatabaseMode()) return (await queryProductionD1<T>(sql, params)).results;
  const db = await getSqliteDb();
  return db.prepare(sql).all(...params) as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  if (isD1DatabaseMode()) return (await queryProductionD1<T>(sql, params)).results[0];
  const db = await getSqliteDb();
  return db.prepare(sql).get(...params) as T | undefined;
}

export async function execute(
  sql: string,
  ...params: unknown[]
): Promise<ErpSqlRunResult> {
  if (isD1DatabaseMode()) {
    const result = await queryProductionD1(sql, params);
    return {
      lastInsertRowid: result.meta?.last_row_id ?? 0,
      changes: result.meta?.changes ?? 0,
    };
  }
  const db = await getSqliteDb();
  return db.prepare(sql).run(...params);
}

export async function executeBatch(
  statements: ProductionD1Statement[],
): Promise<ErpSqlRunResult[]> {
  if (isD1DatabaseMode()) {
    const results = await queryProductionD1Batch(statements);
    return results.map(result => ({
      lastInsertRowid: result.meta?.last_row_id ?? 0,
      changes: result.meta?.changes ?? 0,
    }));
  }

  const db = await getSqliteDb();
  return db.transaction(() => statements.map(({ sql, params = [] }) => db.prepare(sql).run(...params)))();
}
