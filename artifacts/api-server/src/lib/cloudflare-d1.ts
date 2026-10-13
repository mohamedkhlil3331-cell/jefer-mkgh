import { ReplitConnectors } from "@replit/connectors-sdk";

const D1_DATABASE_ID = "bbeae386-5413-4c9d-8ea5-0f0417960591";

type D1QueryResult<T> = {
  results: T[];
  success: boolean;
  meta?: {
    changes?: number;
    duration?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
  };
};

type CloudflareEnvelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: D1QueryResult<T>[];
};

export type ProductionD1Statement = {
  sql: string;
  params?: unknown[];
};

function getAccountId(): string {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  if (!accountId) {
    throw new Error("[cloudflare-d1] CLOUDFLARE_R2_ACCOUNT_ID is required");
  }
  return accountId;
}

/**
 * Execute one SQL statement against the production D1 database.
 * Cloudflare connector paths are relative to /client and therefore start with /v4.
 */
export async function queryProductionD1<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<D1QueryResult<T>> {
  if (!sql.trim()) throw new Error("[cloudflare-d1] SQL statement cannot be empty");

  // Create a fresh client per request; the connector SDK handles identity refresh.
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy(
    "cloudflare",
    `/v4/accounts/${getAccountId()}/d1/database/${D1_DATABASE_ID}/query`,
    { method: "POST", body: { sql, params } },
  );

  let payload: CloudflareEnvelope<T>;
  try {
    payload = await response.json() as CloudflareEnvelope<T>;
  } catch {
    throw new Error(`[cloudflare-d1] Cloudflare returned a non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok || !payload.success) {
    const details = payload.errors?.map(error => error.message || `code ${error.code ?? "unknown"}`).join("; ");
    throw new Error(`[cloudflare-d1] Query failed (HTTP ${response.status})${details ? `: ${details}` : ""}`);
  }

  const result = payload.result?.[0];
  if (!result?.success) {
    throw new Error("[cloudflare-d1] Query succeeded without a successful D1 result");
  }
  return result;
}

/**
 * Execute an atomic batch of statements against production D1.
 * Cloudflare runs the statements sequentially and rolls the batch back if one fails.
 */
export async function queryProductionD1Batch<T = Record<string, unknown>>(
  batch: ProductionD1Statement[],
): Promise<D1QueryResult<T>[]> {
  if (!batch.length) return [];
  if (batch.some(statement => !statement.sql.trim())) {
    throw new Error("[cloudflare-d1] Batch statements cannot be empty");
  }

  const connectors = new ReplitConnectors();
  const response = await connectors.proxy(
    "cloudflare",
    `/v4/accounts/${getAccountId()}/d1/database/${D1_DATABASE_ID}/query`,
    {
      method: "POST",
      body: {
        batch: batch.map(statement => ({
          sql: statement.sql,
          params: statement.params ?? [],
        })),
      },
    },
  );

  let payload: CloudflareEnvelope<T>;
  try {
    payload = await response.json() as CloudflareEnvelope<T>;
  } catch {
    throw new Error(`[cloudflare-d1] Cloudflare returned a non-JSON batch response (HTTP ${response.status})`);
  }

  if (!response.ok || !payload.success) {
    const details = payload.errors?.map(error => error.message || `code ${error.code ?? "unknown"}`).join("; ");
    throw new Error(`[cloudflare-d1] Batch failed (HTTP ${response.status})${details ? `: ${details}` : ""}`);
  }

  const results = payload.result ?? [];
  if (results.length !== batch.length || results.some(result => !result.success)) {
    const failedIndex = results.findIndex(result => !result.success);
    throw new Error(
      `[cloudflare-d1] Batch returned ${results.length} result(s) for ${batch.length} statement(s)`
      + (failedIndex >= 0 ? `; statement ${failedIndex + 1} failed` : ""),
    );
  }
  return results;
}

export async function checkProductionD1(): Promise<void> {
  const result = await queryProductionD1<{ ok: number }>("SELECT 1 AS ok");
  if (result.results[0]?.ok !== 1) {
    throw new Error("[cloudflare-d1] D1 health query returned an unexpected result");
  }
}
