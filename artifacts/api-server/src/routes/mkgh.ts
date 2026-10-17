/**
 * MKGH Data Analysis Routes
 * Handles import, query, and analytics for fleet financial data.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { execute, executeBatch, queryAll, queryOne } from "../lib/erp-sql.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Auth helper — admin-only guard ───────────────────────────────────────────
// Used as a return-value helper for non-file routes
async function requireMkghAccess(req: Request, res: Response): Promise<{ ok: true; actorName: string } | { ok: false }> {
  const raw = req.headers.authorization?.replace("Bearer ", "").trim() ?? "";
  // Guard against JS null/undefined serialised as the string "null" or "undefined"
  if (!raw || raw === "guest" || raw === "null" || raw === "undefined") {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return { ok: false };
  }
  // No expiry check — consistent with /auth/me which also skips expiry in production
  const session = await queryOne<{ user_id: number }>(
    "SELECT user_id FROM sessions WHERE token = ?"
  , raw);
  if (!session) {
    res.status(401).json({ error: "الجلسة غير موجودة، يرجى تسجيل الدخول مجدداً" });
    return { ok: false };
  }
  const user = await queryOne<{ name: string; role: string }>(
    "SELECT name, role FROM users WHERE id = ? AND active = 1"
  , session.user_id);
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "هذه الوظيفة مخصصة للمدير فقط" });
    return { ok: false };
  }
  return { ok: true, actorName: user.name };
}

// ── Auth middleware — runs BEFORE multer so file parsing is skipped on 401 ───
async function mkghAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = req.headers.authorization?.replace("Bearer ", "").trim() ?? "";
  if (!raw || raw === "guest" || raw === "null" || raw === "undefined") {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }
  const session = await queryOne<{ user_id: number }>(
    "SELECT user_id FROM sessions WHERE token = ?"
  , raw);
  if (!session) {
    res.status(401).json({ error: "الجلسة غير موجودة، يرجى تسجيل الدخول مجدداً" });
    return;
  }
  const user = await queryOne<{ name: string; role: string }>(
    "SELECT name, role FROM users WHERE id = ? AND active = 1"
  , session.user_id);
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "هذه الوظيفة مخصصة للمدير فقط" });
    return;
  }
  (req as Request & { mkghActor: string }).mkghActor = user.name;
  next();
}

// ── Helper: extract maintenance type from doc_number ────────────────────────
function classifyDocType(docNumber: string | null): string {
  if (!docNumber) return "أخرى";
  const s = String(docNumber).trim();
  if (/ميكانيكا/i.test(s))       return "ميكانيكا";
  if (/كهرباء/i.test(s))         return "كهرباء";
  if (/غيار.*زيت|زيت/i.test(s))  return "غيار زيت";
  if (/كفر|كفرات/i.test(s))      return "كفرات";
  if (/قطع.*غيار|غيار/i.test(s)) return "قطع غيار";
  if (/بطار/i.test(s))           return "بطاريات";
  if (/كبس/i.test(s))            return "بريكات";
  return "أخرى";
}

// ── Helper: convert Excel date serial to ISO string ─────────────────────────
function excelDateToISO(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && v > 1000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().split("T")[0];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /mkgh/import   — auth runs BEFORE multer so 401 is returned before file parsing
// ─────────────────────────────────────────────────────────────────────────────
router.post("/mkgh/import", mkghAuthMiddleware, upload.single("file"), async (req, res) => {
  // auth already verified by mkghAuthMiddleware
  const actorName = (req as Request & { mkghActor?: string }).mkghActor ?? "";
  if (!req.file) return void res.status(400).json({ error: "لم يُرفق ملف" });
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = wb.SheetNames.find(n => /^data$/i.test(n.trim())) ?? wb.SheetNames[0];
    const ws  = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
    if (!raw.length) return void res.status(400).json({ error: "الملف فارغ" });

    let headerIdx = 0;
    for (let i = 0; i < Math.min(raw.length, 10); i++) {
      const r = raw[i] as unknown[];
      if (r.filter(c => c !== null && c !== "").length >= 5) { headerIdx = i; break; }
    }
    const headers = (raw[headerIdx] as unknown[]).map(h => String(h ?? "").trim());
    const col = (kw: RegExp): number => headers.findIndex(h => kw.test(h));

    const colMonth    = col(/الشهر/);
    const colYear     = col(/عام|سنة|year/i);
    const colDriver   = col(/السائق/);
    const colAccTab   = col(/تبويب.*حساب|تبويب/);
    const colModel    = col(/موديل/);
    const colActivity = col(/النشاط/);
    const colVehicle  = col(/مركز.*تكلفة|مركز/);
    const colAccName  = col(/اسم.*حساب/);
    const colDate     = col(/التاريخ/);
    const colDocType  = col(/نوع.*مستند/);
    const colDocNum   = col(/رقم.*مستند/);
    const colDesc     = col(/البيان/);
    const colDebit    = col(/مدين/);
    const colCredit   = col(/دائن/);
    const colNet      = col(/الصافي/);

    const dataRows = raw.slice(headerIdx + 1).filter(r =>
      (r as unknown[]).some(c => c !== null && c !== "")
    );
    const importedBy = String(req.body?.imported_by || actorName || "");
    const fileName   = req.file.originalname;

    const g = (row: unknown[], idx: number) => idx >= 0 ? (row[idx] ?? null) : null;
    const statements: Array<{ sql: string; params?: unknown[] }> = [
      { sql: "DELETE FROM mkgh_transactions" },
      { sql: "DELETE FROM mkgh_imports" },
      {
        sql: "INSERT INTO mkgh_imports (imported_by, row_count, file_name) VALUES (?,?,?)",
        params: [importedBy, dataRows.length, fileName],
      },
    ];
    for (const rawRow of dataRows) {
      const row = rawRow as unknown[];
      const debit = Number(g(row, colDebit)) || 0;
      const credit = Number(g(row, colCredit)) || 0;
      const netVal = colNet >= 0 ? (Number(g(row, colNet)) || (credit - debit)) : (credit - debit);
      statements.push({
        sql: `
          INSERT INTO mkgh_transactions
            (import_id, month, year, driver_name, account_tab, model, activity,
             cost_center, account_name, tx_date, doc_type, doc_number,
             description, debit, credit, net)
          VALUES ((SELECT MAX(id) FROM mkgh_imports),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `,
        params: [
          Number(g(row, colMonth)) || null,
          Number(g(row, colYear)) || null,
          g(row, colDriver) ? String(g(row, colDriver)!).trim() : null,
          g(row, colAccTab) ? String(g(row, colAccTab)!).trim() : null,
          g(row, colModel) ? String(g(row, colModel)!).trim() : null,
          g(row, colActivity) ? String(g(row, colActivity)!).trim() : null,
          g(row, colVehicle) ? String(g(row, colVehicle)!).trim() : null,
          g(row, colAccName) ? String(g(row, colAccName)!).trim() : null,
          excelDateToISO(g(row, colDate)),
          g(row, colDocType) ? String(g(row, colDocType)!).trim() : null,
          g(row, colDocNum) ? String(g(row, colDocNum)!).trim() : null,
          g(row, colDesc) ? String(g(row, colDesc)!).trim() : null,
          debit, credit, netVal,
        ],
      });
    }
    await executeBatch(statements);

    res.json({ ok: true, inserted: dataRows.length, sheet: sheetName });
  } catch (err) {
    res.status(400).json({ error: "خطأ في قراءة الملف", detail: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/transactions
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/transactions", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { driver, vehicle, month, year, account_tab, account_name, page = "1", limit = "100" } = req.query as Record<string, string>;
  const params: (string | number)[] = [];
  let where = "WHERE 1=1";
  if (driver)       { where += " AND driver_name  LIKE ?"; params.push(`%${driver}%`); }
  if (vehicle)      { where += " AND cost_center   LIKE ?"; params.push(`%${vehicle}%`); }
  if (month)        { where += " AND month=?";              params.push(Number(month)); }
  if (year)         { where += " AND year=?";               params.push(Number(year)); }
  if (account_tab)  { where += " AND account_tab  LIKE ?";  params.push(`%${account_tab}%`); }
  if (account_name) { where += " AND account_name LIKE ?";  params.push(`%${account_name}%`); }

  const total  = (await queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM mkgh_transactions ${where}`, ...params))?.c || 0;
  const offset = (Number(page) - 1) * Number(limit);
  const rows   = await queryAll(
    `SELECT * FROM mkgh_transactions ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  , ...params, Number(limit), offset);
  res.json({ total, page: Number(page), rows });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /mkgh/transactions  (deletes ALL — clear data)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/mkgh/transactions", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  await executeBatch([{ sql: "DELETE FROM mkgh_transactions" }, { sql: "DELETE FROM mkgh_imports" }]);
  res.json({ ok: true });
});

// DELETE /mkgh/transactions/bulk  (delete selected rows by IDs)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/mkgh/transactions/bulk", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0)
    return void res.status(400).json({ error: "ids مطلوبة" });
  await executeBatch(ids.map(id => ({ sql: "DELETE FROM mkgh_transactions WHERE id=?", params: [id] })));
  res.json({ deleted: ids.length });
});

// DELETE /mkgh/transactions/:id  (delete single row)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/mkgh/transactions/:id", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  await execute("DELETE FROM mkgh_transactions WHERE id=?", req.params.id);
  res.json({ ok: true });
});

// PATCH /mkgh/transactions/:id  (edit single row)
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/mkgh/transactions/:id", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { driver_name, cost_center, activity, account_tab, account_name,
          tx_date, doc_number, description, debit, credit, month, year } = req.body as Record<string, string>;
  const d = parseFloat(debit) || 0;
  const c = parseFloat(credit) || 0;
  const net = c - d;
  await execute(`
    UPDATE mkgh_transactions SET
      driver_name=?, cost_center=?, activity=?, account_tab=?, account_name=?,
      tx_date=?, doc_number=?, description=?, debit=?, credit=?, net=?, month=?, year=?
    WHERE id=?
  `,
    driver_name || null, cost_center || null, activity || null, account_tab || null, account_name || null,
    tx_date || null, doc_number || null, description || null,
    d, c, net,
    parseInt(month) || null, parseInt(year) || null,
    req.params.id,
  );
  res.json({ ok: true, net });
});

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Helper: multi-select + period-range WHERE conditions for analytics endpoints
// ─────────────────────────────────────────────────────────────────────────────
function buildDashConditions(q: Record<string, string>): { conditions: string; params: (string | number)[] } {
  const params: (string | number)[] = [];
  let conditions = "";
  const addIn = (col: string, csv: string) => {
    const list = csv.split(",").map(s => s.trim()).filter(Boolean);
    if (!list.length) return;
    if (list.length === 1) { conditions += ` AND ${col} = ?`; params.push(list[0]); }
    else { conditions += ` AND ${col} IN (${list.map(() => "?").join(",")})`; params.push(...list); }
  };
  addIn("driver_name",  q.drivers       || "");
  addIn("cost_center",  q.vehicles      || "");
  addIn("account_tab",  q.account_tabs  || "");
  addIn("account_name", q.account_names || "");
  if (q.periodFrom) {
    const [yr, mn] = q.periodFrom.split("-").map(Number);
    if (yr && mn) { conditions += " AND (year * 100 + month) >= ?"; params.push(yr * 100 + mn); }
  }
  if (q.periodTo) {
    const [yr, mn] = q.periodTo.split("-").map(Number);
    if (yr && mn) { conditions += " AND (year * 100 + month) <= ?"; params.push(yr * 100 + mn); }
  }
  return { conditions, params };
}

// GET /mkgh/analytics/summary
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/analytics/summary", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { conditions, params } = buildDashConditions(req.query as Record<string, string>);
  const where = "WHERE 1=1" + conditions;
  const [row, imp] = await Promise.all([
    queryOne<Record<string, unknown>>(`
    SELECT
      COUNT(*)                                                    AS total_rows,
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)   AS total_revenue,
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0) AS total_expenses,
      COALESCE(SUM(net), 0)                                      AS net_profit,
      COUNT(DISTINCT driver_name)                                AS driver_count,
      COUNT(DISTINCT cost_center)                                AS vehicle_count,
      MIN(year || '-' || printf('%02d', month))                  AS period_from,
      MAX(year || '-' || printf('%02d', month))                  AS period_to
    FROM mkgh_transactions ${where}
    `, ...params),
    queryOne<Record<string, unknown>>("SELECT * FROM mkgh_imports ORDER BY id DESC LIMIT 1"),
  ]);
  res.json({ ...row, last_import: imp || null });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/analytics/drivers
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/analytics/drivers", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { conditions, params } = buildDashConditions(req.query as Record<string, string>);
  const where = "WHERE driver_name IS NOT NULL AND driver_name != ''" + conditions;
  const rows = await queryAll(`
    SELECT
      driver_name,
      COUNT(*)                                                               AS tx_count,
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)              AS revenue,
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0)         AS expenses,
      COALESCE(SUM(net), 0)                                                  AS net_profit,
      COUNT(DISTINCT cost_center)                                            AS vehicle_count,
      COUNT(DISTINCT printf('%d-%02d', year, month))                         AS active_months,
      MIN(printf('%d-%02d', year, month))                                    AS period_from,
      MAX(printf('%d-%02d', year, month))                                    AS period_to
    FROM mkgh_transactions ${where}
    GROUP BY driver_name
    ORDER BY net_profit DESC
  `, ...params);
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/analytics/vehicles  — per-vehicle performance (full VehicleStat shape)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/analytics/vehicles", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { conditions: extraWhere, params } = buildDashConditions(req.query as Record<string, string>);
  const allParams = [...params, ...params];
  const rows = await queryAll(`
    WITH vehicle_stats AS (
      SELECT
        cost_center                                                             AS vehicle,
        MAX(activity)                                                           AS activity,
        COUNT(*)                                                                AS tx_count,
        COUNT(DISTINCT driver_name)                                             AS driver_count,
        COUNT(CASE WHEN account_name LIKE '%صيانه%' OR account_name LIKE '%صيانة%'
                   OR account_name LIKE '%قطع غيار%' OR account_name LIKE '%كفرات%'
                   OR account_name LIKE '%غيار زيت%' THEN 1 END)              AS workshop_count,
        COUNT(CASE WHEN account_name LIKE '%صيانه%' OR account_name LIKE '%صيانة%'
                   OR account_name LIKE '%قطع غيار%' OR account_name LIKE '%كفرات%'
                   OR account_name LIKE '%غيار زيت%'
                   OR account_name LIKE '%بطار%' OR account_name LIKE '%كبس%'
                   THEN 1 END)                                                  AS full_maint_count,
        COUNT(DISTINCT printf('%d-%02d', year, month))                          AS active_months,
        COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)               AS revenue,
        COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0)          AS expenses,
        COALESCE(SUM(net), 0)                                                   AS net_profit,
        MIN(printf('%d-%02d', year, month))                                     AS period_from,
        MAX(printf('%d-%02d', year, month))                                     AS period_to
      FROM mkgh_transactions
      WHERE cost_center IS NOT NULL AND cost_center != '' ${extraWhere}
      GROUP BY cost_center
    ),
    best_drivers AS (
      SELECT
        cost_center                                                             AS vehicle,
        driver_name                                                             AS best_driver,
        COALESCE(SUM(net), 0)                                                  AS best_driver_net,
        ROW_NUMBER() OVER (PARTITION BY cost_center ORDER BY COALESCE(SUM(net), 0) DESC) AS rn
      FROM mkgh_transactions
      WHERE cost_center IS NOT NULL AND driver_name IS NOT NULL AND driver_name != '' ${extraWhere}
      GROUP BY cost_center, driver_name
    )
    SELECT
      vs.*,
      bd.best_driver,
      COALESCE(bd.best_driver_net, 0) AS best_driver_net
    FROM vehicle_stats vs
    LEFT JOIN best_drivers bd ON bd.vehicle = vs.vehicle AND bd.rn = 1
    ORDER BY vs.net_profit DESC
  `, ...allParams);
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/analytics/driver-vehicle-matrix
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/analytics/driver-vehicle-matrix", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const rows = await queryAll<{ driver_name: string; vehicle: string; workshop_count: number; total_cost: number }>(`
    SELECT
      driver_name,
      cost_center                          AS vehicle,
      COUNT(*)                             AS workshop_count,
      COALESCE(SUM(ABS(net)), 0)          AS total_cost
    FROM mkgh_transactions
    WHERE driver_name IS NOT NULL AND cost_center IS NOT NULL
      AND (account_name LIKE '%صيانه%' OR account_name LIKE '%صيانة%'
           OR account_name LIKE '%قطع غيار%' OR account_name LIKE '%كفرات%'
           OR account_name LIKE '%غيار زيت%')
    GROUP BY driver_name, cost_center
    ORDER BY workshop_count DESC
  `);

  const matrix: Record<string, Record<string, { count: number; cost: number }>> = {};
  for (const r of rows) {
    if (!matrix[r.driver_name]) matrix[r.driver_name] = {};
    matrix[r.driver_name][r.vehicle] = { count: r.workshop_count, cost: r.total_cost };
  }
  // Extract sorted unique driver/vehicle lists for axis labels
  const drivers  = [...new Set(rows.map(r => r.driver_name))];
  const vehicles = [...new Set(rows.map(r => r.vehicle))];
  res.json({ drivers, vehicles, matrix });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/meta
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/meta", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const [drivers, vehicles, months, accountTabs, accountNames] = await Promise.all([
    queryAll<{ driver_name: string }>("SELECT DISTINCT driver_name FROM mkgh_transactions WHERE driver_name IS NOT NULL ORDER BY driver_name"),
    queryAll<{ cost_center: string }>("SELECT DISTINCT cost_center FROM mkgh_transactions WHERE cost_center IS NOT NULL ORDER BY cost_center"),
    queryAll<{ month: number; year: number }>("SELECT DISTINCT month, year FROM mkgh_transactions WHERE month IS NOT NULL ORDER BY year, month"),
    queryAll<{ account_tab: string }>("SELECT DISTINCT account_tab FROM mkgh_transactions WHERE account_tab IS NOT NULL ORDER BY account_tab"),
    queryAll<{ account_name: string }>("SELECT DISTINCT account_name FROM mkgh_transactions WHERE account_name IS NOT NULL ORDER BY account_name"),
  ]);
  res.json({
    drivers:      drivers.map(r => r.driver_name),
    vehicles:     vehicles.map(r => r.cost_center),
    months,
    accountTabs:  accountTabs.map(r => r.account_tab),
    accountNames: accountNames.map(r => r.account_name),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/analytics/breakdown-types
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/analytics/breakdown-types", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const raw = await queryAll<{ vehicle: string; doc_number: string | null; cost: number }>(`
    SELECT cost_center AS vehicle, doc_number, ABS(net) AS cost
    FROM mkgh_transactions
    WHERE cost_center IS NOT NULL
      AND (account_name LIKE '%صيانه%' OR account_name LIKE '%صيانة%'
           OR account_name LIKE '%قطع غيار%' OR account_name LIKE '%كفرات%'
           OR account_name LIKE '%غيار زيت%' OR account_name LIKE '%بطار%')
  `);

  const byVehicle: Record<string, Record<string, { count: number; cost: number }>> = {};
  for (const r of raw) {
    const type = classifyDocType(r.doc_number);
    if (!byVehicle[r.vehicle]) byVehicle[r.vehicle] = {};
    if (!byVehicle[r.vehicle][type]) byVehicle[r.vehicle][type] = { count: 0, cost: 0 };
    byVehicle[r.vehicle][type].count++;
    byVehicle[r.vehicle][type].cost += r.cost;
  }
  const globalTypes: Record<string, { count: number; cost: number }> = {};
  for (const vtypes of Object.values(byVehicle)) {
    for (const [type, val] of Object.entries(vtypes)) {
      if (!globalTypes[type]) globalTypes[type] = { count: 0, cost: 0 };
      globalTypes[type].count += val.count;
      globalTypes[type].cost  += val.cost;
    }
  }
  res.json({ byVehicle, globalTypes });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/analytics/monthly
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/analytics/monthly", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { conditions, params } = buildDashConditions(req.query as Record<string, string>);
  const where = "WHERE year IS NOT NULL AND month IS NOT NULL" + conditions;

  const rows = await queryAll(`
    SELECT
      printf('%d-%02d', year, month)                                        AS period,
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)              AS revenue,
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0)         AS expenses,
      COALESCE(SUM(net), 0)                                                 AS net_profit
    FROM mkgh_transactions ${where}
    GROUP BY year, month ORDER BY year ASC, month ASC
  `, ...params);
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/analytics/driver-vehicle-timeline
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/analytics/driver-vehicle-timeline", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { driver, vehicle } = req.query as Record<string, string>;
  if (!driver && !vehicle) return void res.status(400).json({ error: "يجب تحديد سائق أو سيارة" });
  const params: string[] = [];
  let where = "WHERE year IS NOT NULL AND month IS NOT NULL";
  if (driver)  { where += " AND driver_name LIKE ?"; params.push(`%${driver}%`); }
  if (vehicle) { where += " AND cost_center = ?";    params.push(vehicle); }

  const rows = await queryAll(`
    SELECT
      printf('%d-%02d', year, month)                                        AS period,
      driver_name,
      cost_center                                                           AS vehicle,
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)              AS revenue,
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0)         AS expenses,
      COALESCE(SUM(net), 0)                                                 AS net_profit
    FROM mkgh_transactions ${where}
    GROUP BY year, month, driver_name, cost_center
    ORDER BY year ASC, month ASC
  `, ...params);
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/export
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/export", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;

  const [driverRows, vehicleRows, monthlyRows, matrixRows] = await Promise.all([
    queryAll<Record<string, unknown>>(`
    SELECT
      driver_name                                                            AS "السائق",
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)              AS "الإيرادات",
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0)         AS "المصاريف",
      COALESCE(SUM(net), 0)                                                 AS "صافي الربح",
      COUNT(*)                                                              AS "عدد الحركات",
      COUNT(DISTINCT cost_center)                                           AS "عدد السيارات"
    FROM mkgh_transactions
    WHERE driver_name IS NOT NULL AND driver_name != ''
    GROUP BY driver_name ORDER BY "صافي الربح" DESC
    `),

    queryAll<Record<string, unknown>>(`
    SELECT
      cost_center                                                           AS "السيارة",
      MAX(activity)                                                         AS "النشاط",
      MAX(model)                                                            AS "الموديل",
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)             AS "الإيرادات",
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0)        AS "المصاريف",
      COALESCE(SUM(net), 0)                                                AS "صافي الربح",
      COUNT(*)                                                             AS "عدد الحركات",
      COUNT(DISTINCT driver_name)                                          AS "عدد السائقين"
    FROM mkgh_transactions
    WHERE cost_center IS NOT NULL AND cost_center != ''
    GROUP BY cost_center ORDER BY "صافي الربح" DESC
    `),

    queryAll<Record<string, unknown>>(`
    SELECT
      printf('%d-%02d', year, month) AS "الفترة",
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)  AS "الإيرادات",
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0) AS "المصاريف",
      COALESCE(SUM(net), 0) AS "صافي الربح"
    FROM mkgh_transactions
    WHERE year IS NOT NULL AND month IS NOT NULL
    GROUP BY year, month ORDER BY year ASC, month ASC
    `),

    queryAll<Record<string, unknown>>(`
    SELECT
      driver_name AS "السائق", cost_center AS "السيارة",
      COUNT(*) AS "عدد أوامر الورشة",
      COALESCE(SUM(ABS(net)), 0) AS "إجمالي التكلفة"
    FROM mkgh_transactions
    WHERE driver_name IS NOT NULL AND cost_center IS NOT NULL
      AND (account_name LIKE '%صيانه%' OR account_name LIKE '%صيانة%'
           OR account_name LIKE '%قطع غيار%' OR account_name LIKE '%كفرات%'
           OR account_name LIKE '%غيار زيت%')
    GROUP BY driver_name, cost_center ORDER BY "عدد أوامر الورشة" DESC
    `),
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(driverRows.length  ? driverRows  : [{}]), "تصنيف السائقين");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vehicleRows.length ? vehicleRows : [{}]), "تصنيف السيارات");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matrixRows.length  ? matrixRows  : [{}]), "مصفوفة السائق والسيارة");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows.length ? monthlyRows : [{}]), "الاتجاه الشهري");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const date = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="mkgh-analysis-${date}.xlsx"`);
  res.send(buf);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/vehicle/:vehicle
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/vehicle/:vehicle", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { vehicle } = req.params;

  const [kpi, monthly, driverRows, rawMaint] = await Promise.all([
    queryOne<Record<string, unknown>>(`
    SELECT
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)      AS revenue,
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0) AS expenses,
      COALESCE(SUM(net), 0)                                         AS net_profit,
      COUNT(*)                                                       AS tx_count,
      COUNT(DISTINCT driver_name)                                    AS driver_count,
      MAX(activity)                                                  AS activity,
      MAX(model)                                                     AS model,
      MIN(printf('%d-%02d', year, month))                            AS period_from,
      MAX(printf('%d-%02d', year, month))                            AS period_to,
      COUNT(DISTINCT printf('%d-%02d', year, month))                 AS active_months
    FROM mkgh_transactions WHERE cost_center = ?
    `, vehicle),

    queryAll(`
    SELECT printf('%d-%02d', year, month) AS period,
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)      AS revenue,
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0) AS expenses,
      COALESCE(SUM(net), 0)                                         AS net_profit
    FROM mkgh_transactions WHERE cost_center = ? AND year IS NOT NULL
    GROUP BY year, month ORDER BY year, month
    `, vehicle),

    queryAll(`
    SELECT driver_name, COUNT(*) AS tx_count,
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)      AS revenue,
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0) AS expenses,
      COALESCE(SUM(net), 0)                                         AS net_profit,
      MIN(printf('%d-%02d', year, month)) AS period_from,
      MAX(printf('%d-%02d', year, month)) AS period_to
    FROM mkgh_transactions WHERE cost_center = ? AND driver_name IS NOT NULL
    GROUP BY driver_name ORDER BY tx_count DESC
    `, vehicle),

    queryAll<{ doc_number: string | null; cost: number }>(`
    SELECT doc_number, ABS(net) AS cost
    FROM mkgh_transactions WHERE cost_center = ?
      AND (account_name LIKE '%صيانه%' OR account_name LIKE '%صيانة%'
           OR account_name LIKE '%قطع غيار%' OR account_name LIKE '%كفرات%'
           OR account_name LIKE '%غيار زيت%' OR account_name LIKE '%بطار%')
    `, vehicle),
  ]);

  const breakdownTypes: Record<string, { count: number; cost: number }> = {};
  for (const r of rawMaint) {
    const t = classifyDocType(r.doc_number);
    if (!breakdownTypes[t]) breakdownTypes[t] = { count: 0, cost: 0 };
    breakdownTypes[t].count++; breakdownTypes[t].cost += r.cost;
  }
  res.json({ vehicle, kpi, monthly, drivers: driverRows, breakdownTypes });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/driver/:driver
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/driver/:driver", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { driver } = req.params;

  const [kpi, monthly, vehicleRows, rawMaint] = await Promise.all([
    queryOne<Record<string, unknown>>(`
    SELECT
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)      AS revenue,
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0) AS expenses,
      COALESCE(SUM(net), 0)                                         AS net_profit,
      COUNT(*)                                                       AS tx_count,
      COUNT(DISTINCT cost_center)                                    AS vehicle_count,
      MIN(printf('%d-%02d', year, month))                            AS period_from,
      MAX(printf('%d-%02d', year, month))                            AS period_to,
      COUNT(DISTINCT printf('%d-%02d', year, month))                 AS active_months
    FROM mkgh_transactions WHERE driver_name = ?
    `, driver),

    queryAll(`
    SELECT printf('%d-%02d', year, month) AS period,
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)      AS revenue,
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0) AS expenses,
      COALESCE(SUM(net), 0)                                         AS net_profit
    FROM mkgh_transactions WHERE driver_name = ? AND year IS NOT NULL
    GROUP BY year, month ORDER BY year, month
    `, driver),

    queryAll(`
    SELECT cost_center AS vehicle, MAX(activity) AS activity,
      COUNT(*) AS tx_count,
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)      AS revenue,
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0) AS expenses,
      COALESCE(SUM(net), 0)                                         AS net_profit,
      MIN(printf('%d-%02d', year, month)) AS period_from,
      MAX(printf('%d-%02d', year, month)) AS period_to
    FROM mkgh_transactions WHERE driver_name = ? AND cost_center IS NOT NULL
    GROUP BY cost_center ORDER BY tx_count DESC
    `, driver),

    queryAll<{ doc_number: string | null; cost: number }>(`
    SELECT doc_number, ABS(net) AS cost
    FROM mkgh_transactions WHERE driver_name = ?
      AND (account_name LIKE '%صيانه%' OR account_name LIKE '%صيانة%'
           OR account_name LIKE '%قطع غيار%' OR account_name LIKE '%كفرات%'
           OR account_name LIKE '%غيار زيت%' OR account_name LIKE '%بطار%')
    `, driver),
  ]);

  const breakdownTypes: Record<string, { count: number; cost: number }> = {};
  for (const r of rawMaint) {
    const t = classifyDocType(r.doc_number);
    if (!breakdownTypes[t]) breakdownTypes[t] = { count: 0, cost: 0 };
    breakdownTypes[t].count++; breakdownTypes[t].cost += r.cost;
  }
  res.json({ driver, kpi, monthly, vehicles: vehicleRows, breakdownTypes });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /mkgh/analyze-descriptions  — AI analysis of the description field
// ─────────────────────────────────────────────────────────────────────────────
router.post("/mkgh/analyze-descriptions", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;

  const BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const API_KEY  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!BASE_URL || !API_KEY)
    return void res.status(503).json({ error: "خدمة الذكاء الاصطناعي غير متاحة" });

  const vehicle: string | undefined = req.body?.vehicle;
  const driver: string | undefined  = req.body?.driver;

  let where = "WHERE description IS NOT NULL AND TRIM(description) != ''";
  const params: string[] = [];
  if (vehicle) { where += " AND cost_center = ?"; params.push(vehicle); }
  if (driver)  { where += " AND driver_name = ?"; params.push(driver); }

  const rows = await queryAll<{ description: string }>(
    `SELECT description FROM mkgh_transactions ${where} ORDER BY id DESC LIMIT 200`
  , ...params);

  if (!rows.length)
    return void res.json({ items: [], summary: "لا توجد بيانات بيان للتحليل" });

  const descriptions = rows.map(r => r.description.trim()).filter(Boolean);

  const prompt = `أنت محلل بيانات صيانة أسطول شاحنات. لديك ${descriptions.length} نص من عمود "البيان" في سجلات المحاسبة.

حلل كل نص وأعط:
1. "category": فئة موحدة مختصرة (مثل: زيت المحرك، كهرباء، إطارات، قطع غيار ميكانيكية، وقود، نقل إيراد، أخرى)
2. "note": ملاحظة قصيرة جداً (أقصى 10 كلمات). اتركها "" إذا لم يكن هناك شيء غير عادي.

ثم summary: ملخص 3-5 أسطر يتضمن أكثر الفئات تكراراً وتوصية عملية.

أعد JSON فقط: {"items":[{"original":"...","category":"...","note":"..."}],"summary":"..."}

البيانات:
${descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n")}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    let fetchRes: Awaited<ReturnType<typeof fetch>>;
    try {
      fetchRes = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          messages: [{ role: "user", content: prompt }],
          max_completion_tokens: 4096,
          response_format: { type: "json_object" },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!fetchRes.ok)
      return void res.status(502).json({ error: "فشل الاتصال بالذكاء الاصطناعي", detail: await fetchRes.text() });
    const aiJson = await fetchRes.json() as { choices: { message: { content: string } }[] };
    const rawContent = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(rawContent); }
    catch { return void res.status(500).json({ error: "تعذّر تفسير رد الذكاء الاصطناعي", raw: rawContent }); }
    res.json({ items: Array.isArray(parsed.items) ? parsed.items : [], summary: parsed.summary ?? "" });
  } catch (err) {
    res.status(500).json({ error: "خطأ في تحليل الذكاء الاصطناعي", detail: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/gmail-config
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/gmail-config", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const getVal = async (key: string) =>
    (await queryOne<{ value?: string }>("SELECT value FROM system_config WHERE key=?", key))?.value?.trim() ?? "";
  const gmailUser = await getVal("gmail_user") || process.env.GMAIL_USER?.trim();
  const gmailPass = await getVal("gmail_pass") || process.env.GMAIL_APP_PASSWORD?.trim();
  res.json({ gmail_user: gmailUser, gmail_pass_set: (gmailPass ?? "").length > 0 });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /mkgh/gmail-config
// ─────────────────────────────────────────────────────────────────────────────
router.put("/mkgh/gmail-config", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { gmail_user, gmail_pass } = req.body as { gmail_user?: string; gmail_pass?: string };
  const upsert = "INSERT INTO system_config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')";
  if (gmail_user !== undefined) await execute(upsert, "gmail_user", gmail_user.trim());
  if (gmail_pass !== undefined && gmail_pass.trim().length > 0) await execute(upsert, "gmail_pass", gmail_pass.trim());
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /mkgh/test-email
// ─────────────────────────────────────────────────────────────────────────────
router.post("/mkgh/test-email", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const getVal = async (key: string) =>
    (await queryOne<{ value?: string }>("SELECT value FROM system_config WHERE key=?", key))?.value?.trim() ?? "";
  const gmailUser = await getVal("gmail_user") || process.env.GMAIL_USER?.trim();
  const gmailPass = await getVal("gmail_pass") || process.env.GMAIL_APP_PASSWORD?.trim();
  const toEmail   = (req.body as any).to_email || await getVal("otp_email") || gmailUser;
  if (!gmailUser || !gmailPass)
    return void res.status(400).json({ ok: false, error: "بيانات Gmail غير مُعدَّة" });
  if (!toEmail)
    return void res.status(400).json({ ok: false, error: "لا يوجد بريد وجهة للاختبار" });
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
    await transporter.sendMail({
      from: `"MKGH System" <${gmailUser}>`,
      to: toEmail,
      subject: "✅ اختبار إرسال Gmail — MKGH",
      html: `<div dir="rtl" style="font-family:'Segoe UI',Arial,sans-serif;max-width:440px;padding:32px;border-radius:16px;background:#f8fafc;">
        <div style="background:#103c68;border-radius:12px;padding:18px 24px;margin-bottom:20px;">
          <h2 style="color:white;margin:0;font-size:18px;">MKGH — اختبار الإرسال</h2>
        </div>
        <p style="color:#374151;">🎉 تم إعداد بريد Gmail بنجاح!</p>
        <p style="color:#6b7280;font-size:13px;">سيُستخدم هذا الحساب لإرسال التقارير الشهرية.</p>
      </div>`,
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "فشل الإرسال" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/email-settings
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/email-settings", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const settingRows = await queryAll<{ key: string; value: string }>("SELECT key, value FROM mkgh_email_settings");
  const obj: Record<string, string> = {};
  for (const r of settingRows) obj[r.key] = r.value;
  res.json({
    enabled:        obj["enabled"]        === "1",
    send_day:       parseInt(obj["send_day"] || "1", 10),
    recipients:     (() => { try { return JSON.parse(obj["recipients"] || "[]"); } catch { return []; } })() as string[],
    last_sent:      obj["last_sent"] || null,
    fallback_email: obj["fallback_email"] || "",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /mkgh/email-settings
// ─────────────────────────────────────────────────────────────────────────────
router.put("/mkgh/email-settings", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { enabled, send_day, recipients, fallback_email } = req.body as {
    enabled?: boolean; send_day?: number; recipients?: string[]; fallback_email?: string;
  };
  const upd = "UPDATE mkgh_email_settings SET value=? WHERE key=?";
  if (enabled !== undefined) await execute(upd, enabled ? "1" : "0", "enabled");
  if (send_day !== undefined) await execute(upd, String(Math.max(1, Math.min(28, Number(send_day)))), "send_day");
  if (Array.isArray(recipients)) await execute(upd, JSON.stringify(recipients.filter(e => e && e.includes("@"))), "recipients");
  if (fallback_email !== undefined) {
    const cleaned = fallback_email.trim();
    await execute(upd, cleaned && cleaned.includes("@") ? cleaned : "", "fallback_email");
  }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mkgh/report-log  — send history
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mkgh/report-log", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const rows = await queryAll("SELECT * FROM mkgh_report_log ORDER BY id DESC LIMIT 50");
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /mkgh/send-report-now
// ─────────────────────────────────────────────────────────────────────────────
router.post("/mkgh/send-report-now", async (req, res) => {
  if (!(await requireMkghAccess(req, res)).ok) return;
  const { sendMkghReport } = await import("../lib/mkgh-scheduler.js");
  const result = await sendMkghReport("manual");
  if (result.ok) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ ok: false, error: result.error });
  }
});

export default router;
