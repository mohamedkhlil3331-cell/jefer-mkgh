import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { execute, executeBatch, queryAll, queryOne } from "../lib/erp-sql.js";
import { isSpecialSessionValid } from "../lib/special-sessions.js";
import { ensureRentalPortalUser } from "../lib/rental-portal-users.js";

const router = Router();
const text = (v: unknown) => String(v ?? "").trim();
const amount = (v: unknown) => Number(v);
const today = () => new Date().toISOString().slice(0, 10);
const mutated = () => {};
const FINANCE_ROLES = new Set(["admin", "supervisor", "reviewer", "finance", "accountant"]);
const AUDIT_ROLES = new Set(["admin", "supervisor"]);
const rentalAccessTokens = new Map<string, { expiresAt: number; passwordFingerprint: string }>();
const unlockAttempts = new Map<string, { count: number; resetAt: number }>();
const ACCESS_TTL_MS = 8 * 60 * 60 * 1000;

async function requireFinancialAccess(req: Request, res: Response, next: NextFunction) {
  const token = text(req.headers.authorization).replace(/^Bearer\s+/i, "");
  if (token && await isSpecialSessionValid("system-admin", token)) {
    res.locals.financeActor = "مدير النظام";
    res.locals.financeRole = "system-admin";
    return next();
  }
  const user = token ? await queryOne<{ id: number; name: string; role: string }>(`
    SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
      AND s.rowid=(SELECT MAX(s2.rowid) FROM sessions s2 WHERE s2.user_id=s.user_id AND datetime(s2.expires_at)>datetime('now'))
  `, token) : undefined;
  if (!user) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (!FINANCE_ROLES.has(user.role)) return void res.status(403).json({ error: "لا تملك صلاحية إدارة حسابات الإيجار" });
  res.locals.financeActor = user.name;
  res.locals.financeRole = user.role;
  next();
}

function requireAuditAccess(_req: Request, res: Response, next: NextFunction) {
  if (res.locals.financeRole === "system-admin" || AUDIT_ROLES.has(res.locals.financeRole)) return next();
  res.status(403).json({ error: "سجل المراجعة متاح للمدير فقط" });
}

type AuditedEntity = "account_entry" | "payment" | "cash_remittance" | "external_entry";

async function writeAudit(entityType: AuditedEntity, entityId: number, operation: "update" | "delete", actor: string, oldValues: unknown, newValues: unknown = null) {
  await execute(
    `INSERT INTO rental_financial_audit_log
      (entity_type,entity_id,operation,actor_name,old_values,new_values) VALUES(?,?,?,?,?,?)`,
    entityType, entityId, operation, actor, JSON.stringify(oldValues),
    newValues == null ? null : JSON.stringify(newValues),
  );
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function getRentalPasswordHash() {
  return (await queryOne<{ value: string }>("SELECT value FROM system_config WHERE key='rental_accounts_password_hash'"))?.value || "";
}

async function verifyRentalPassword(supplied: string) {
  const stored = await getRentalPasswordHash();
  if (stored.startsWith("scrypt$")) {
    const [, salt, expected] = stored.split("$");
    if (!salt || !expected) return false;
    return safeEqual(crypto.scryptSync(supplied, salt, 32).toString("hex"), expected);
  }
  const fallback = process.env.RENTAL_ACCOUNTS_PASSWORD || "";
  return !!fallback && safeEqual(supplied, fallback);
}

async function rentalPasswordFingerprint() {
  return crypto.createHash("sha256").update(await getRentalPasswordHash() || process.env.RENTAL_ACCOUNTS_PASSWORD || "").digest("hex");
}

async function requireRentalUnlock(req: Request, res: Response, next: NextFunction) {
  const accessToken = text(req.headers["x-rental-access"]);
  const access = rentalAccessTokens.get(accessToken);
  if (!accessToken || !access || access.expiresAt <= Date.now() || access.passwordFingerprint !== await rentalPasswordFingerprint()) {
    if (accessToken) rentalAccessTokens.delete(accessToken);
    return void res.status(423).json({ error: "حسابات الإيجار مقفلة بكلمة المرور" });
  }
  next();
}

export async function isRentalAccessTokenValid(accessToken: string) {
  const access = rentalAccessTokens.get(accessToken);
  if (!access || access.expiresAt <= Date.now() || access.passwordFingerprint !== await rentalPasswordFingerprint()) {
    if (accessToken) rentalAccessTokens.delete(accessToken);
    return false;
  }
  return true;
}

router.post("/rental-accounts/unlock", requireFinancialAccess, async (req, res) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const attempt = unlockAttempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 5) {
    return void res.status(429).json({ error: "محاولات كثيرة، حاول بعد 15 دقيقة" });
  }
  const supplied = text(req.body.password);
  if (!await verifyRentalPassword(supplied)) {
    const next = attempt && attempt.resetAt > now
      ? { count: attempt.count + 1, resetAt: attempt.resetAt }
      : { count: 1, resetAt: now + 15 * 60 * 1000 };
    unlockAttempts.set(ip, next);
    return void res.status(403).json({ error: "كلمة المرور غير صحيحة" });
  }
  unlockAttempts.delete(ip);
  const accessToken = crypto.randomBytes(32).toString("base64url");
  rentalAccessTokens.set(accessToken, { expiresAt: now + ACCESS_TTL_MS, passwordFingerprint: await rentalPasswordFingerprint() });
  res.json({ access_token: accessToken, expires_in: ACCESS_TTL_MS / 1000 });
});

for (const path of ["/rental-accounts", "/rental-customers", "/rental-account-entries", "/rental-payments", "/rental-cash-remittances", "/rental-cash-movements", "/rental-company-income", "/rental-monthly-closures", "/rental-financial-audit", "/external-accounts", "/external-parties"]) {
  router.use(path, requireFinancialAccess, requireRentalUnlock);
}

router.get("/rental-financial-audit", requireAuditAccess, async (_req, res) => {
  const rows = await queryAll<Record<string, unknown> & { old_values: string; new_values: string | null }>(
    `SELECT id,entity_type,entity_id,operation,actor_name,old_values,new_values,created_at
     FROM rental_financial_audit_log ORDER BY created_at DESC,id DESC LIMIT 1000`,
  );
  res.json(rows.map(row => ({
    ...row,
    old_values: JSON.parse(row.old_values),
    new_values: row.new_values ? JSON.parse(row.new_values) : null,
  })));
});

router.get("/rental-accounts", async (_req, res) => {
  const rows = await queryAll(`
    WITH raw_names AS (
      SELECT TRIM(client_name) name FROM trips
        WHERE TRIM(COALESCE(client_name,'')) <> '' AND COALESCE(customer_type_snapshot,'rental')='rental'
      UNION ALL SELECT TRIM(name) FROM rental_customers WHERE customer_type='rental' AND active=1
      UNION ALL SELECT TRIM(customer_name) FROM rental_account_entries
      UNION ALL SELECT TRIM(customer_name) FROM rental_payments
      UNION ALL SELECT TRIM(customer_name) FROM rental_statement_adjustments
    ), names AS (
      SELECT LOWER(name) key, MIN(name) name FROM raw_names GROUP BY LOWER(name)
    ), charges AS (
      SELECT LOWER(TRIM(client_name)) key,
        SUM(COALESCE(return_value_no_vat, total_amount, 0)) charges,
        SUM(COALESCE(rental_company_share, return_value_no_vat, total_amount, 0)) company_share,
        SUM(COALESCE(rental_broker_commission, 0)) broker_commission,
        SUM(COALESCE(trips_count,1)) reply_count
      FROM trips WHERE TRIM(COALESCE(client_name,'')) <> ''
        AND COALESCE(customer_type_snapshot,'rental')='rental' GROUP BY LOWER(TRIM(client_name))
    ), adjustments AS (
      SELECT LOWER(TRIM(customer_name)) key,
        SUM(CASE WHEN entry_type='opening_debit' THEN amount ELSE 0 END) manual_debit,
        SUM(CASE WHEN entry_type='opening_credit' THEN amount ELSE 0 END) manual_credit
      FROM rental_account_entries GROUP BY LOWER(TRIM(customer_name))
    ), statement_adjustments AS (
      SELECT LOWER(TRIM(a.customer_name)) key,
        SUM(CASE WHEN a.adjustment_type='statement' THEN a.amount ELSE 0 END) statement_increase,
        SUM(CASE WHEN a.adjustment_type='reply' THEN a.amount-COALESCE(t.return_value_no_vat,t.total_amount,0) ELSE 0 END) reply_delta
      FROM rental_statement_adjustments a
      LEFT JOIN trips t ON t.id=a.trip_id
        AND LOWER(TRIM(t.client_name))=LOWER(TRIM(a.customer_name))
        AND COALESCE(t.customer_type_snapshot,'rental')='rental'
      WHERE a.adjustment_type='statement' OR t.id IS NOT NULL
      GROUP BY LOWER(TRIM(a.customer_name))
    ), payments AS (
      SELECT LOWER(TRIM(customer_name)) key, SUM(amount) paid,
        SUM(CASE WHEN payment_method='company_direct' THEN amount ELSE 0 END) direct_paid,
        SUM(CASE WHEN payment_method='cash_received' THEN amount ELSE 0 END) cash_paid
      FROM rental_payments GROUP BY LOWER(TRIM(customer_name))
    ), customer_remittances AS (
      SELECT LOWER(TRIM(customer_name)) key, SUM(amount) remitted
      FROM rental_cash_remittances WHERE TRIM(COALESCE(customer_name,'')) <> ''
      GROUP BY LOWER(TRIM(customer_name))
    )
    SELECT n.name, c.phone, COALESCE(ch.reply_count,0) reply_count,
      COALESCE(ch.charges,0) + COALESCE(a.manual_debit,0)
        + COALESCE(sa.reply_delta,0) + COALESCE(sa.statement_increase,0) total_due,
      COALESCE(ch.company_share,0) company_share,
      COALESCE(ch.broker_commission,0) broker_commission,
      COALESCE(a.manual_credit,0) manual_credit, COALESCE(p.paid,0) paid,
      COALESCE(p.direct_paid,0) direct_paid, COALESCE(p.cash_paid,0) cash_paid,
      MAX(0,COALESCE(p.cash_paid,0)-COALESCE(cr.remitted,0)) cash_in_custody,
      COALESCE(ch.charges,0)+COALESCE(a.manual_debit,0)
        +COALESCE(sa.reply_delta,0)+COALESCE(sa.statement_increase,0)
        -COALESCE(a.manual_credit,0)-COALESCE(p.paid,0) balance
    FROM names n
    LEFT JOIN rental_customers c ON LOWER(TRIM(c.name))=n.key
    LEFT JOIN charges ch ON ch.key=n.key
    LEFT JOIN adjustments a ON a.key=n.key
    LEFT JOIN statement_adjustments sa ON sa.key=n.key
    LEFT JOIN payments p ON p.key=n.key
    LEFT JOIN customer_remittances cr ON cr.key=n.key
    ORDER BY balance DESC, n.name
  `);
  const cash = await queryOne<{ received: number; remitted: number }>(`
    SELECT
      COALESCE((SELECT SUM(amount) FROM rental_payments WHERE payment_method='cash_received'),0) received,
      COALESCE((SELECT SUM(amount) FROM rental_cash_remittances),0) remitted
  `);
  const customerDebt = (rows as Array<{ balance: number }>).reduce((sum, row) => sum + Math.max(0, Number(row.balance) || 0), 0);
  const received = Number(cash?.received ?? 0);
  const remitted = Number(cash?.remitted ?? 0);
  const custodyBalance = received - remitted;
  res.json({
    accounts: rows,
    cash_custody: { received, remitted, balance: custodyBalance },
    summary: { customer_debt: customerDebt, my_company_debt: custodyBalance, company_outstanding: customerDebt + custodyBalance },
  });
});

router.get("/rental-accounts-summary/routes", async (req, res) => {
  const from = text(req.query.from);
  const to = text(req.query.to);
  const customer = text(req.query.customer);
  const rows = await queryAll(`
    SELECT TRIM(client_name) customer_name,
      COALESCE(NULLIF(TRIM(loading_region),''),'غير محدد') loading_region,
      COALESCE(NULLIF(TRIM(unloading_region),''),'غير محدد') unloading_region,
      COALESCE(unit_price,0) unit_price,
      SUM(COALESCE(trips_count,1)) trips_count,
      SUM(COALESCE(return_value_no_vat,total_amount,0)) total_amount,
      SUM(COALESCE(rental_company_share,return_value_no_vat,total_amount,0)) company_share,
      SUM(COALESCE(rental_broker_commission,0)) broker_commission
    FROM trips
    WHERE TRIM(COALESCE(client_name,''))<>''
      AND COALESCE(customer_type_snapshot,'rental')='rental'
      AND (?='' OR date>=?)
      AND (?='' OR date<=?)
      AND (?='' OR LOWER(TRIM(client_name))=LOWER(TRIM(?)))
    GROUP BY LOWER(TRIM(client_name)),loading_region,unloading_region,COALESCE(unit_price,0)
    ORDER BY customer_name,loading_region,unloading_region,unit_price
  `, from, from, to, to, customer, customer);
  res.json(rows);
});

router.get("/rental-company-income", async (req, res) => {
  const from = text(req.query.from);
  const to = text(req.query.to);
  const rows = await queryAll(`
    SELECT id,payment_date,customer_name,amount,reference_no,notes,created_by,created_at
    FROM rental_payments
    WHERE payment_method='company_direct'
      AND (?='' OR payment_date>=?)
      AND (?='' OR payment_date<=?)
    ORDER BY payment_date DESC,id DESC
  `, from, from, to, to);
  const total = (rows as Array<{ amount: number }>).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  res.json({ rows, total });
});

router.get("/rental-accounts/:name/statement", async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const customer = await queryOne("SELECT * FROM rental_customers WHERE LOWER(TRIM(name))=LOWER(TRIM(?))", name);
  const entries = await queryAll<Record<string, unknown> & { source: string; id: number; debit: number; credit: number }>(`
    SELECT * FROM (
      SELECT 'trip' source, id, date entry_date, 'رد إيجار رقم '||id description,
        COALESCE(return_value_no_vat,total_amount,0) debit, 0 credit,
        car_id reference_no, loading_region, unloading_region,
        COALESCE(trips_count,1) trips_count, COALESCE(unit_price,0) unit_price, created_at
      FROM trips WHERE LOWER(TRIM(client_name))=LOWER(TRIM(?))
        AND COALESCE(customer_type_snapshot,'rental')='rental'
      UNION ALL
      SELECT 'trip_split', id, date entry_date,
        'توزيع الرد رقم '||id||': حق الشركة '||
        printf('%.2f',COALESCE(rental_company_share,return_value_no_vat,total_amount,0))||
        CASE WHEN COALESCE(rental_broker_commission,0)>0
          THEN '، عمولة '||CASE rental_broker_type WHEN 'self' THEN 'أنا الوسيط' ELSE COALESCE(rental_broker_name,'وسيط خارجي') END||
               ' '||printf('%.2f',rental_broker_commission)
          ELSE '' END description,
        0 debit, 0 credit, car_id reference_no, loading_region, unloading_region,
        COALESCE(trips_count,1) trips_count, COALESCE(unit_price,0) unit_price, created_at||'.1' created_at
      FROM trips WHERE LOWER(TRIM(client_name))=LOWER(TRIM(?))
        AND COALESCE(customer_type_snapshot,'rental')='rental'
        AND (rental_company_share IS NOT NULL OR COALESCE(rental_broker_commission,0)>0)
      UNION ALL
      SELECT 'manual', id, entry_date, COALESCE(description,'رصيد سابق'),
        CASE WHEN entry_type='opening_debit' THEN amount ELSE 0 END,
        CASE WHEN entry_type='opening_credit' THEN amount ELSE 0 END,
        reference_no, NULL loading_region, NULL unloading_region,
        NULL trips_count, NULL unit_price, created_at
      FROM rental_account_entries WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))
      UNION ALL
      SELECT payment_method, id, payment_date,
        CASE payment_method WHEN 'company_direct' THEN 'دفعة مباشرة للشركة' ELSE 'دفعة كاش مستلمة' END,
        0, amount, reference_no, NULL loading_region, NULL unloading_region,
        NULL trips_count, NULL unit_price, created_at
      FROM rental_payments WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))
    ) ORDER BY entry_date, created_at, id
  `, name, name, name, name);
  const replyAdjustments = await queryAll<{ trip_id: number; amount: number }>(`SELECT trip_id,amount FROM rental_statement_adjustments
    WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND adjustment_type='reply'`, name);
  const statementAdjustments = await queryAll<{ id: number; amount: number; entry_date: string; created_at: string }>(`SELECT id,amount,entry_date,created_at FROM rental_statement_adjustments
    WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND adjustment_type='statement'
    ORDER BY entry_date,created_at,id`, name);
  const adjustedReplies = new Map(replyAdjustments.map(adjustment => [adjustment.trip_id, adjustment.amount]));
  const adjustedEntries = entries.map(entry => entry.source === "trip" && adjustedReplies.has(entry.id)
    ? { ...entry, statement_debit: adjustedReplies.get(entry.id) }
    : entry);
  for (const adjustment of statementAdjustments) {
    adjustedEntries.push({
      source: "statement_adjustment",
      id: adjustment.id,
      entry_date: adjustment.entry_date,
      description: "زيادة خاصة بهذا الكشف",
      debit: adjustment.amount,
      credit: 0,
      reference_no: null,
      loading_region: null,
      unloading_region: null,
      trips_count: null,
      unit_price: null,
      created_at: adjustment.created_at,
    });
  }
  adjustedEntries.sort((left, right) =>
    String(left.entry_date).localeCompare(String(right.entry_date)) ||
    String(left.created_at).localeCompare(String(right.created_at)) ||
    Number(left.id) - Number(right.id)
  );
  res.json({ customer: customer || { name }, entries: adjustedEntries });
});

router.put("/rental-accounts/:name/statement-adjustments/replies/:tripId", async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const tripId = Number(req.params.tripId);
  const adjustedDebit = amount(req.body.adjusted_debit);
  if (!Number.isSafeInteger(tripId) || tripId <= 0 || !Number.isFinite(adjustedDebit) || adjustedDebit < 0) {
    return void res.status(400).json({ error: "بيانات تعديل الرد غير صحيحة" });
  }
  const trip = await queryOne<{ id: number; debit: number }>(`SELECT id,COALESCE(return_value_no_vat,total_amount,0) debit FROM trips
    WHERE id=? AND LOWER(TRIM(client_name))=LOWER(TRIM(?))
      AND COALESCE(customer_type_snapshot,'rental')='rental'`, tripId, name);
  if (!trip) return void res.status(404).json({ error: "الرد غير موجود ضمن حساب هذا العميل" });
  if (adjustedDebit < Number(trip.debit || 0)) {
    return void res.status(400).json({ error: "لا يمكن تخفيض قيمة الرد الأصلية من هذا التعديل" });
  }
  if (adjustedDebit === Number(trip.debit || 0)) {
    await execute(`DELETE FROM rental_statement_adjustments
      WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND adjustment_type='reply' AND trip_id=?`,
      name, tripId);
    return void res.json({ adjustment: null, reset_to_original: true });
  }
  const existing = await queryOne<{ id: number }>(`SELECT id FROM rental_statement_adjustments
      WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND adjustment_type='reply' AND trip_id=?`,
      name, tripId);
  let saved: unknown;
  if (existing) {
    await execute(`UPDATE rental_statement_adjustments SET amount=?,created_by=?,created_at=datetime('now') WHERE id=?`,
      adjustedDebit, res.locals.financeActor, existing.id);
    saved = await queryOne("SELECT * FROM rental_statement_adjustments WHERE id=?", existing.id);
  } else {
    const result = await execute(`INSERT INTO rental_statement_adjustments
      (customer_name,adjustment_type,trip_id,amount,created_by) VALUES(?,'reply',?,?,?)`,
      name, tripId, adjustedDebit, res.locals.financeActor);
    saved = await queryOne("SELECT * FROM rental_statement_adjustments WHERE id=?", result.lastInsertRowid);
  }
  res.json({ adjustment: saved });
});

router.post("/rental-accounts/:name/statement-adjustments", async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const value = amount(req.body.amount);
  if (!Number.isFinite(value) || value <= 0) {
    return void res.status(400).json({ error: "أدخل مبلغ زيادة صحيحًا" });
  }
  const entryDate = text(req.body.entry_date) || today();
  const parsedDate = new Date(`${entryDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== entryDate) {
    return void res.status(400).json({ error: "تاريخ الزيادة غير صحيح" });
  }
  const result = await execute(`INSERT INTO rental_statement_adjustments
    (customer_name,adjustment_type,amount,entry_date,created_by) VALUES(?,'statement',?,?,?)`,
    name, value, entryDate, res.locals.financeActor);
  res.status(201).json(await queryOne("SELECT * FROM rental_statement_adjustments WHERE id=?", result.lastInsertRowid));
});

router.delete("/rental-accounts/:name/statement-adjustments/:id", async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const id = Number(req.params.id);
  const result = await execute(`DELETE FROM rental_statement_adjustments
    WHERE id=? AND LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND adjustment_type='statement'`, id, name);
  if (!result.changes) return void res.status(404).json({ error: "زيادة الكشف غير موجودة" });
  res.json({ deleted: true });
});

router.get("/rental-monthly-closures", async (req, res) => {
  const customerName = text(req.query.customer_name);
  const rows = await queryAll(`
    SELECT id,customer_name,month,opening_balance,period_debit,period_credit,closing_balance,
      status,closed_by,closed_at,reopened_by,reopened_at
    FROM rental_monthly_closures
    WHERE (?='' OR LOWER(TRIM(customer_name))=LOWER(TRIM(?)))
    ORDER BY month DESC,id DESC
  `, customerName, customerName);
  res.json(rows);
});

router.get("/rental-monthly-closures/:id", async (req, res) => {
  const row = await queryOne<Record<string, unknown>>("SELECT * FROM rental_monthly_closures WHERE id=?", req.params.id);
  if (!row) return void res.status(404).json({ error: "التقفيل غير موجود" });
  res.json({ ...row, statement_snapshot: JSON.parse(String(row.statement_snapshot || "[]")) });
});

router.post("/rental-monthly-closures", async (req, res) => {
  const customerName = text(req.body.customer_name);
  const month = text(req.body.month);
  if (!customerName || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return void res.status(400).json({ error: "اختر العميل والشهر بصورة صحيحة" });
  }
  const existing = await queryOne<{ id: number; status: string }>(
    "SELECT id,status FROM rental_monthly_closures WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND month=?",
    customerName, month,
  );
  if (existing?.status === "closed") return void res.status(409).json({ error: "هذا الشهر مقفول بالفعل لهذا العميل" });

  const monthStart = `${month}-01`;
  const nextMonth = new Date(`${monthStart}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthEndExclusive = nextMonth.toISOString().slice(0, 10);
  const movements = await queryAll<Record<string, unknown> & { entry_date: string; debit: number; credit: number }>(`
    SELECT * FROM (
      SELECT 'trip' source,id,date entry_date,'رد إيجار رقم '||id description,
        COALESCE(return_value_no_vat,total_amount,0) debit,0 credit,car_id reference_no,created_at
      FROM trips WHERE LOWER(TRIM(client_name))=LOWER(TRIM(?))
        AND COALESCE(customer_type_snapshot,'rental')='rental'
      UNION ALL
      SELECT 'manual',id,entry_date,COALESCE(description,'رصيد سابق'),
        CASE WHEN entry_type='opening_debit' THEN amount ELSE 0 END,
        CASE WHEN entry_type='opening_credit' THEN amount ELSE 0 END,
        reference_no,created_at
      FROM rental_account_entries WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))
      UNION ALL
      SELECT payment_method,id,payment_date,
        CASE payment_method WHEN 'company_direct' THEN 'دفعة مباشرة للشركة' ELSE 'دفعة كاش مستلمة' END,
        0,amount,reference_no,created_at
      FROM rental_payments WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))
    ) ORDER BY entry_date,created_at,id
  `, customerName, customerName, customerName);
  const openingBalance = movements
    .filter(entry => entry.entry_date < monthStart)
    .reduce((sum, entry) => sum + Number(entry.debit || 0) - Number(entry.credit || 0), 0);
  const periodEntries = movements.filter(entry => entry.entry_date >= monthStart && entry.entry_date < monthEndExclusive);
  const periodDebit = periodEntries.reduce((sum, entry) => sum + Number(entry.debit || 0), 0);
  const periodCredit = periodEntries.reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
  const closingBalance = openingBalance + periodDebit - periodCredit;
  const snapshot = {
    customer_name: customerName,
    month,
    opening_balance: openingBalance,
    period_debit: periodDebit,
    period_credit: periodCredit,
    closing_balance: closingBalance,
    entries: periodEntries,
  };
  let saved: unknown;
  if (existing) {
    await execute(`UPDATE rental_monthly_closures SET customer_name=?,opening_balance=?,period_debit=?,period_credit=?,
        closing_balance=?,statement_snapshot=?,status='closed',closed_by=?,closed_at=datetime('now'),reopened_by=NULL,reopened_at=NULL WHERE id=?`,
      customerName, openingBalance, periodDebit, periodCredit, closingBalance, JSON.stringify(snapshot), res.locals.financeActor, existing.id);
    saved = await queryOne("SELECT * FROM rental_monthly_closures WHERE id=?", existing.id);
  } else {
    const result = await execute(`INSERT INTO rental_monthly_closures
      (customer_name,month,opening_balance,period_debit,period_credit,closing_balance,statement_snapshot,closed_by)
      VALUES(?,?,?,?,?,?,?,?)`,
      customerName, month, openingBalance, periodDebit, periodCredit, closingBalance, JSON.stringify(snapshot), res.locals.financeActor);
    saved = await queryOne("SELECT * FROM rental_monthly_closures WHERE id=?", result.lastInsertRowid);
  }
  mutated();
  res.status(201).json(saved);
});

router.post("/rental-monthly-closures/:id/reopen", requireAuditAccess, async (req, res) => {
  if (!await verifyRentalPassword(text(req.body.password))) return void res.status(403).json({ error: "كلمة مرور حسابات الإيجار غير صحيحة" });
  const result = await execute(`UPDATE rental_monthly_closures
    SET status='reopened',reopened_by=?,reopened_at=datetime('now') WHERE id=? AND status='closed'`,
    res.locals.financeActor, req.params.id);
  if (!result.changes) return void res.status(404).json({ error: "التقفيل غير موجود أو مفتوح بالفعل" });
  mutated();
  res.json(await queryOne("SELECT * FROM rental_monthly_closures WHERE id=?", req.params.id));
});

router.get("/rental-accounts/rental-requests", async (_req, res) => {
  const status = text(_req.query.status);
  if (status && !["pending", "accepted", "rejected"].includes(status)) {
    return void res.status(400).json({ error: "حالة الطلب غير صحيحة" });
  }
  const rows = await (status
    ? queryAll(`SELECT r.*,c.name customer_name,c.phone customer_phone
        FROM rental_trip_requests r LEFT JOIN rental_customers c ON c.id=r.customer_id
        WHERE r.status=? ORDER BY r.created_at DESC,r.id DESC`, status)
    : queryAll(`SELECT r.*,c.name customer_name,c.phone customer_phone
        FROM rental_trip_requests r LEFT JOIN rental_customers c ON c.id=r.customer_id
        ORDER BY r.created_at DESC,r.id DESC`));
  res.json(rows);
});

router.put("/rental-accounts/rental-requests/:id", async (req, res) => {
  const id = Number(req.params.id);
  const status = text(req.body.status);
  if (!Number.isSafeInteger(id) || id <= 0 || !["pending", "accepted", "rejected"].includes(status)) {
    return void res.status(400).json({ error: "معرّف الطلب أو حالته غير صحيح" });
  }
  const result = await execute("UPDATE rental_trip_requests SET status=? WHERE id=?", status, id);
  if (!result.changes) return void res.status(404).json({ error: "طلب الرحلة غير موجود" });
  res.json(await queryOne("SELECT * FROM rental_trip_requests WHERE id=?", id));
});

router.get("/rental-accounts/customer-transfers", async (req, res) => {
  const status = text(req.query.status);
  if (status && !["pending", "confirmed"].includes(status)) {
    return void res.status(400).json({ error: "حالة التحويل غير صحيحة" });
  }
  const rows = await (status
    ? queryAll(`SELECT * FROM rental_payments WHERE transfer_status=? ORDER BY created_at DESC,id DESC`, status)
    : queryAll(`SELECT * FROM rental_payments WHERE transfer_status IN ('pending','confirmed') ORDER BY created_at DESC,id DESC`));
  res.json(rows);
});

router.put("/rental-accounts/customer-transfers/:id/confirm", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return void res.status(400).json({ error: "معرّف التحويل غير صحيح" });
  const result = await execute(`UPDATE rental_payments SET transfer_status='confirmed'
    WHERE id=? AND transfer_status='pending'`, id);
  if (!result.changes) {
    const transfer = await queryOne<{ transfer_status: string }>("SELECT transfer_status FROM rental_payments WHERE id=?", id);
    return void res.status(transfer ? 409 : 404).json({ error: transfer ? "تم تأكيد التحويل بالفعل" : "التحويل غير موجود" });
  }
  mutated();
  res.json(await queryOne("SELECT * FROM rental_payments WHERE id=?", id));
});

router.post("/rental-customers", async (req, res) => {
  const name = text(req.body.name);
  const customerType = text(req.body.customer_type) || "rental";
  const phone = text(req.body.phone) || null;
  if (!name) return void res.status(400).json({ error: "اسم العميل مطلوب" });
  if (!["rental","company"].includes(customerType)) return void res.status(400).json({ error: "تصنيف العميل غير صحيح" });
  try {
    const existing = await queryOne<{ id: number; name: string; phone: string | null; notes: string | null; customer_type: string; active: number }>(
      "SELECT id,name,phone,notes,customer_type,active FROM rental_customers WHERE LOWER(TRIM(name))=LOWER(TRIM(?))",
      name,
    );
    let id = existing?.id;
    if (existing) {
      await execute("UPDATE rental_customers SET phone=?,notes=?,customer_type=?,active=1 WHERE id=?",
        phone, text(req.body.notes) || null, customerType, id);
    } else {
      const inserted = await execute("INSERT INTO rental_customers(name,phone,notes,customer_type,active) VALUES(?,?,?,?,1)",
        name, phone, text(req.body.notes) || null, customerType);
      id = Number(inserted.lastInsertRowid);
    }
    const result = { id: id!, previous: existing ?? null };
    let login: Awaited<ReturnType<typeof ensureRentalPortalUser>>;
    try {
      login = await ensureRentalPortalUser(result.id, name, phone, customerType);
    } catch (error) {
      if (result.previous) {
        await execute("UPDATE rental_customers SET name=?,phone=?,notes=?,customer_type=?,active=? WHERE id=?",
          result.previous.name, result.previous.phone, result.previous.notes,
          result.previous.customer_type, result.previous.active, result.id);
      } else {
        await execute("DELETE FROM rental_customers WHERE id=?", result.id);
      }
      throw error;
    }
    if (req.body.reclassify_existing === true) {
      await execute("UPDATE trips SET customer_type_snapshot=? WHERE LOWER(TRIM(client_name))=LOWER(TRIM(?))",
        customerType, name);
    }
    mutated();
    const customer = await queryOne("SELECT * FROM rental_customers WHERE id=?", result.id);
    res.status(201).json({
      ...customer as object,
      login_provisioned: !!login?.created,
      ...(login?.created ? { initial_password: phone } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    res.status(409).json({ error: message.includes("رقم الجوال") || message.includes("عميل إيجار") || message.includes("صلاحية")
      ? message : "تعذر حفظ العميل بسبب تعارض في الاسم أو رقم الجوال" });
  }
});

router.put("/rental-customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const current = await queryOne<{
    id: number; name: string; phone: string | null; notes: string | null;
    customer_type: string; active: number; portal_user_id?: number | null;
  }>("SELECT * FROM rental_customers WHERE id=?", id);
  if (!current) return void res.status(404).json({ error: "العميل غير موجود" });
  const name = text(req.body.name);
  const customerType = text(req.body.customer_type) || "rental";
  if (!name) return void res.status(400).json({ error: "اسم العميل مطلوب" });
  if (!["rental", "company"].includes(customerType)) return void res.status(400).json({ error: "تصنيف العميل غير صحيح" });
  const duplicate = await queryOne("SELECT id FROM rental_customers WHERE id<>? AND LOWER(TRIM(name))=LOWER(TRIM(?))", id, name);
  if (duplicate) return void res.status(409).json({ error: "يوجد عميل آخر بنفس الاسم" });

  const phone = text(req.body.phone) || null;
  let login: Awaited<ReturnType<typeof ensureRentalPortalUser>>;
  try {
    await execute("UPDATE rental_customers SET name=?,phone=?,notes=?,customer_type=?,active=1 WHERE id=?",
      name, phone, text(req.body.notes) || null, customerType, id);
    try {
      login = await ensureRentalPortalUser(id, name, phone, customerType);
    } catch (error) {
      await execute("UPDATE rental_customers SET name=?,phone=?,notes=?,customer_type=?,active=? WHERE id=?",
        current.name, current.phone, current.notes, current.customer_type, current.active, id);
      throw error;
    }
    const customerNameChanged = current.name.trim().toLocaleLowerCase() !== name.trim().toLocaleLowerCase();
    const updates = customerNameChanged
      ? ([
          ["trips", "client_name"],
          ["rental_account_entries", "customer_name"],
          ["rental_payments", "customer_name"],
          ["rental_cash_remittances", "customer_name"],
          ["rental_statement_adjustments", "customer_name"],
        ] as const).map(([table, column]) => ({
          sql: `UPDATE ${table} SET ${column}=? WHERE LOWER(TRIM(${column}))=LOWER(TRIM(?))`,
          params: [name, current.name],
        }))
      : [];
    if (req.body.reclassify_existing === true) {
      updates.push({
        sql: "UPDATE trips SET customer_type_snapshot=? WHERE LOWER(TRIM(client_name))=LOWER(TRIM(?))",
        params: [customerType, name],
      });
    }
    if (updates.length) await executeBatch(updates);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return void res.status(409).json({ error: message.includes("رقم الجوال") || message.includes("عميل إيجار") || message.includes("صلاحية")
      ? message : "تعذر تحديث العميل بسبب تعارض في الاسم أو رقم الجوال" });
  }
  mutated();
  res.json({
    ...await queryOne<object>("SELECT * FROM rental_customers WHERE id=?", id),
    login_provisioned: !!login?.created,
    ...(login?.created ? { initial_password: phone } : {}),
  });
});

router.post("/rental-customers/:id/activate-login", async (req, res) => {
  const id = Number(req.params.id);
  const customer = await queryOne<{ id: number; name: string; phone: string | null; customer_type: string; portal_user_id: number | null }>(
    "SELECT id,name,phone,customer_type,portal_user_id FROM rental_customers WHERE id=?", id,
  );
  if (!customer) return void res.status(404).json({ error: "العميل غير موجود" });
  if (customer.customer_type !== "rental") return void res.status(400).json({ error: "تفعيل الدخول متاح لعملاء الإيجار فقط" });
  if (!customer.phone?.trim()) return void res.status(400).json({ error: "أضف رقم جوال للعميل أولاً" });
  if (customer.portal_user_id) return void res.status(409).json({ error: "لدى العميل حساب دخول مرتبط بالفعل" });
  try {
    const provisioned = await ensureRentalPortalUser(id, customer.name, customer.phone, customer.customer_type);
    if (!provisioned?.created) return void res.status(409).json({ error: "تعذر إنشاء حساب دخول جديد" });
    mutated();
    res.status(201).json({
      customer_id: id,
      user_id: provisioned.userId,
      phone: customer.phone,
      initial_password: customer.phone,
      message: "تم تفعيل دخول العميل، وكلمة المرور الأولية هي رقم الجوال",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    res.status(409).json({ error: message.includes("رقم الجوال") || message.includes("عميل إيجار") || message.includes("صلاحية")
      ? message : "تعذر تفعيل دخول العميل بسبب تعارض في رقم الجوال" });
  }
});

router.delete("/rental-customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const customer = await queryOne<{ id: number; name: string }>("SELECT id,name FROM rental_customers WHERE id=?", id);
  if (!customer) return void res.status(404).json({ error: "العميل غير موجود" });
  const linked = await queryOne<{ count: number }>(`
    SELECT
      (SELECT COUNT(*) FROM trips WHERE LOWER(TRIM(client_name))=LOWER(TRIM(?))) +
      (SELECT COUNT(*) FROM rental_account_entries WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))) +
      (SELECT COUNT(*) FROM rental_payments WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))) +
      (SELECT COUNT(*) FROM rental_cash_remittances WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))) +
      (SELECT COUNT(*) FROM rental_statement_adjustments WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))) count
  `, customer.name, customer.name, customer.name, customer.name, customer.name);
  if (Number(linked?.count || 0) > 0) {
    return void res.status(409).json({ error: "لا يمكن حذف العميل لأنه مرتبط بردود أو حركات مالية" });
  }
  await execute("DELETE FROM rental_customers WHERE id=?", id);
  mutated();
  res.json({ ok: true });
});

router.get("/rental-customers", async (_req, res) => {
  res.json(await queryAll("SELECT * FROM rental_customers ORDER BY customer_type,name"));
});

router.post("/rental-account-entries", async (req, res) => {
  const customer = text(req.body.customer_name), value = amount(req.body.amount);
  if (!customer || !(value > 0) || !["opening_debit","opening_credit"].includes(req.body.entry_type))
    return void res.status(400).json({ error: "بيانات الرصيد غير صحيحة" });
  const result = await execute(`INSERT INTO rental_account_entries
    (customer_name,entry_date,entry_type,amount,description,reference_no,notes,created_by)
    VALUES(?,?,?,?,?,?,?,?)`, customer, text(req.body.entry_date) || today(), req.body.entry_type, value,
      text(req.body.description) || null, text(req.body.reference_no) || null, text(req.body.notes) || null, res.locals.financeActor);
  mutated(); res.status(201).json(await queryOne("SELECT * FROM rental_account_entries WHERE id=?", result.lastInsertRowid));
});
router.put("/rental-account-entries/:id", async (req, res) => {
  const value=amount(req.body.amount);
  if (!(value>0) || !["opening_debit","opening_credit"].includes(req.body.entry_type))
    return void res.status(400).json({ error: "بيانات القيد غير صحيحة" });
  const id=Number(req.params.id);
  const old = await queryOne("SELECT * FROM rental_account_entries WHERE id=?", id);
  if (!old) return void res.status(404).json({ error: "القيد غير موجود" });
  await execute(`UPDATE rental_account_entries SET entry_date=?,entry_type=?,amount=?,description=?,reference_no=?,notes=?,created_by=? WHERE id=?`,
    text(req.body.entry_date)||today(),req.body.entry_type,value,text(req.body.description)||null,text(req.body.reference_no)||null,text(req.body.notes)||null,res.locals.financeActor,id);
  const updated = await queryOne("SELECT * FROM rental_account_entries WHERE id=?", id);
  await writeAudit("account_entry",id,"update",res.locals.financeActor,old,updated);
  res.json(updated);
});
router.delete("/rental-account-entries/:id", async (req, res) => {
  const id=Number(req.params.id);
  const old = await queryOne("SELECT * FROM rental_account_entries WHERE id=?", id);
  if (!old) return void res.status(404).json({ error: "القيد غير موجود" });
  await writeAudit("account_entry",id,"delete",res.locals.financeActor,old);
  await execute("DELETE FROM rental_account_entries WHERE id=?", id);
  res.json({ deleted: true });
});

router.post("/rental-payments", async (req, res) => {
  const customer = text(req.body.customer_name), value = amount(req.body.amount);
  if (!customer || !(value > 0) || !["company_direct","cash_received"].includes(req.body.payment_method))
    return void res.status(400).json({ error: "بيانات الدفعة غير صحيحة" });
  const result = await execute(`INSERT INTO rental_payments
    (customer_name,payment_date,amount,payment_method,reference_no,notes,created_by) VALUES(?,?,?,?,?,?,?)`,
    customer, text(req.body.payment_date) || today(), value, req.body.payment_method,
      text(req.body.reference_no) || null, text(req.body.notes) || null, res.locals.financeActor);
  mutated(); res.status(201).json(await queryOne("SELECT * FROM rental_payments WHERE id=?", result.lastInsertRowid));
});
router.put("/rental-payments/:id", async (req, res) => {
  const value=amount(req.body.amount);
  if (!(value>0) || !["company_direct","cash_received"].includes(req.body.payment_method))
    return void res.status(400).json({ error: "بيانات الدفعة غير صحيحة" });
  const id=Number(req.params.id);
  const old=await queryOne("SELECT * FROM rental_payments WHERE id=?",id);
  if (!old) return void res.status(404).json({ error: "الدفعة غير موجودة" });
  await execute(`UPDATE rental_payments SET payment_date=?,amount=?,payment_method=?,reference_no=?,notes=?,created_by=? WHERE id=?`,
    text(req.body.payment_date)||today(),value,req.body.payment_method,text(req.body.reference_no)||null,text(req.body.notes)||null,res.locals.financeActor,id);
  const updated=await queryOne("SELECT * FROM rental_payments WHERE id=?",id);
  await writeAudit("payment",id,"update",res.locals.financeActor,old,updated);
  res.json(updated);
});
router.delete("/rental-payments/:id", async (req, res) => {
  const id=Number(req.params.id);
  const payment=await queryOne<{amount:number;payment_method:string;customer_name:string}>("SELECT * FROM rental_payments WHERE id=?",id);
  if (!payment) return void res.status(404).json({ error: "الدفعة غير موجودة" });
  if (payment.payment_method==="cash_received") {
    const available=await queryOne<{balance:number}>(`SELECT COALESCE(SUM(amount),0)-(SELECT COALESCE(SUM(amount),0) FROM rental_cash_remittances WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))) balance FROM rental_payments WHERE payment_method='cash_received' AND LOWER(TRIM(customer_name))=LOWER(TRIM(?))`,payment.customer_name,payment.customer_name);
    if ((available?.balance ?? 0) < payment.amount) return void res.status(409).json({ error: "لا يمكن حذف الدفعة لأن جزءًا منها تم توريده للشركة" });
  }
  await writeAudit("payment",id,"delete",res.locals.financeActor,payment);
  await execute("DELETE FROM rental_payments WHERE id=?",id);
  res.json({ deleted: true });
});

router.get("/rental-cash-remittances", async (_req, res) => res.json(
  await queryAll("SELECT * FROM rental_cash_remittances ORDER BY remittance_date DESC,id DESC"),
));
router.get("/rental-cash-movements", async (_req, res) => {
  const rows = await queryAll(`
    WITH movements AS (
      SELECT 'receipt' movement_type, id, payment_date movement_date, customer_name,
        amount incoming, 0 outgoing, reference_no, notes, created_by, created_at
      FROM rental_payments WHERE payment_method='cash_received'
      UNION ALL
      SELECT 'remittance', id, remittance_date, customer_name,
        0, amount, reference_no, notes, created_by, created_at
      FROM rental_cash_remittances
    ), balanced AS (
      SELECT *,
        SUM(incoming-outgoing) OVER (
          ORDER BY movement_date, created_at, movement_type, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) balance_after
      FROM movements
    )
    SELECT * FROM balanced ORDER BY movement_date DESC, created_at DESC, movement_type DESC, id DESC
  `);
  res.json(rows);
});
router.post("/rental-cash-remittances", async (req, res) => {
  const value = amount(req.body.amount);
  const customerName = text(req.body.customer_name);
  if (!customerName) return void res.status(400).json({ error: "اختر العميل صاحب الكاش المورّد" });
  const available = await queryOne<{ balance: number }>(`SELECT COALESCE((SELECT SUM(amount) FROM rental_payments WHERE payment_method='cash_received'),0)
    - COALESCE((SELECT SUM(amount) FROM rental_cash_remittances),0) balance`);
  if (!(value > 0) || value > Number(available?.balance || 0)) return void res.status(400).json({ error: "المبلغ أكبر من العهدة النقدية المتاحة" });
  const customerAvailable = await queryOne<{ balance: number }>(`
    SELECT COALESCE((SELECT SUM(amount) FROM rental_payments WHERE payment_method='cash_received' AND LOWER(TRIM(customer_name))=LOWER(TRIM(?))),0)
      - COALESCE((SELECT SUM(amount) FROM rental_cash_remittances WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))),0) balance
  `, customerName, customerName);
  if (value > Number(customerAvailable?.balance || 0)) return void res.status(400).json({ error: "المبلغ أكبر من الكاش المتبقي لهذا العميل" });
  const result = await execute(`INSERT INTO rental_cash_remittances(remittance_date,amount,reference_no,notes,created_by,customer_name,image_url) VALUES(?,?,?,?,?,?,?)`,
    text(req.body.remittance_date) || today(), value, text(req.body.reference_no) || null, text(req.body.notes) || null, res.locals.financeActor, customerName, text(req.body.image_url) || null);
  mutated(); res.status(201).json(await queryOne("SELECT * FROM rental_cash_remittances WHERE id=?", result.lastInsertRowid));
});
router.put("/rental-cash-remittances/:id", async (req, res) => {
  const value=amount(req.body.amount), customerName=text(req.body.customer_name);
  if (!(value>0) || !customerName) return void res.status(400).json({ error: "بيانات التوريد غير صحيحة" });
  const original=await queryOne<{amount:number;image_url:string|null}>("SELECT amount,image_url FROM rental_cash_remittances WHERE id=?",req.params.id);
  if (!original) return void res.status(404).json({ error: "التوريد غير موجود" });
  const available=await queryOne<{balance:number}>(`SELECT COALESCE((SELECT SUM(amount) FROM rental_payments WHERE payment_method='cash_received' AND LOWER(TRIM(customer_name))=LOWER(TRIM(?))),0)
    - COALESCE((SELECT SUM(amount) FROM rental_cash_remittances WHERE id<>? AND LOWER(TRIM(customer_name))=LOWER(TRIM(?))),0) balance`,customerName,req.params.id,customerName);
  if (value>Number(available?.balance || 0)) return void res.status(400).json({ error: "المبلغ أكبر من كاش العميل المتاح" });
  const id=Number(req.params.id);
  const old=await queryOne("SELECT * FROM rental_cash_remittances WHERE id=?",id);
  await execute(`UPDATE rental_cash_remittances SET remittance_date=?,amount=?,customer_name=?,reference_no=?,notes=?,created_by=?,image_url=? WHERE id=?`,
    text(req.body.remittance_date)||today(),value,customerName,text(req.body.reference_no)||null,text(req.body.notes)||null,res.locals.financeActor,
    req.body.image_url === undefined ? original.image_url : (text(req.body.image_url)||null),id);
  const updated=await queryOne("SELECT * FROM rental_cash_remittances WHERE id=?",id);
  await writeAudit("cash_remittance",id,"update",res.locals.financeActor,old,updated);
  res.json(updated);
});
router.delete("/rental-cash-remittances/:id", async (req, res) => {
  const id=Number(req.params.id);
  const old=await queryOne("SELECT * FROM rental_cash_remittances WHERE id=?",id);
  if (!old) return void res.status(404).json({ error: "التوريد غير موجود" });
  await writeAudit("cash_remittance",id,"delete",res.locals.financeActor,old);
  await execute("DELETE FROM rental_cash_remittances WHERE id=?",id);
  res.json({ deleted: true });
});

router.get("/external-accounts", async (_req, res) => res.json(await queryAll(`
  SELECT p.*,
    COALESCE(SUM(CASE WHEN e.money_scope='company' AND e.entry_type='receivable' THEN e.amount WHEN e.money_scope='company' AND e.entry_type='receivable_payment' THEN -e.amount ELSE 0 END),0) company_due_from,
    COALESCE(SUM(CASE WHEN e.money_scope='company' AND e.entry_type='payable' THEN e.amount WHEN e.money_scope='company' AND e.entry_type='payable_payment' THEN -e.amount ELSE 0 END),0) company_due_to,
    COALESCE(SUM(CASE WHEN e.money_scope='personal' AND e.entry_type='receivable' THEN e.amount WHEN e.money_scope='personal' AND e.entry_type='receivable_payment' THEN -e.amount ELSE 0 END),0) personal_due_from,
    COALESCE(SUM(CASE WHEN e.money_scope='personal' AND e.entry_type='payable' THEN e.amount WHEN e.money_scope='personal' AND e.entry_type='payable_payment' THEN -e.amount ELSE 0 END),0) personal_due_to
  FROM external_parties p LEFT JOIN external_account_entries e ON e.party_id=p.id
  GROUP BY p.id ORDER BY p.name`)));

router.post("/external-parties", async (req, res) => {
  const name = text(req.body.name); if (!name) return void res.status(400).json({ error: "الاسم مطلوب" });
  const r = await execute("INSERT INTO external_parties(name,phone,notes) VALUES(?,?,?)",name,text(req.body.phone)||null,text(req.body.notes)||null);
  mutated(); res.status(201).json(await queryOne("SELECT * FROM external_parties WHERE id=?",r.lastInsertRowid));
});
router.get("/external-accounts/:id/statement", async (req, res) => {
  const party = await queryOne("SELECT * FROM external_parties WHERE id=?",req.params.id);
  if (!party) return void res.status(404).json({ error: "الحساب غير موجود" });
  res.json({ party, entries: await queryAll("SELECT * FROM external_account_entries WHERE party_id=? ORDER BY entry_date,created_at,id",req.params.id) });
});
router.post("/external-account-entries", async (req, res) => {
  const value=amount(req.body.amount), partyId=Number(req.body.party_id);
  const kinds=["receivable","receivable_payment","payable","payable_payment"];
  if (!partyId || !(value>0) || !kinds.includes(req.body.entry_type) || !["company","personal"].includes(req.body.money_scope))
    return void res.status(400).json({ error: "بيانات الحركة غير صحيحة" });
  const r=await execute(`INSERT INTO external_account_entries
    (party_id,entry_date,entry_type,money_scope,payment_method,amount,description,reference_no,notes,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,partyId,text(req.body.entry_date)||today(),req.body.entry_type,req.body.money_scope,
      text(req.body.payment_method)||null,value,text(req.body.description)||null,text(req.body.reference_no)||null,
      text(req.body.notes)||null,res.locals.financeActor);
  mutated(); res.status(201).json(await queryOne("SELECT * FROM external_account_entries WHERE id=?",r.lastInsertRowid));
});
router.put("/external-account-entries/:id", async (req, res) => {
  const value=amount(req.body.amount);
  const kinds=["receivable","receivable_payment","payable","payable_payment"];
  if (!(value>0) || !kinds.includes(req.body.entry_type) || !["company","personal"].includes(req.body.money_scope))
    return void res.status(400).json({ error: "بيانات الحركة غير صحيحة" });
  const id=Number(req.params.id);
  const old=await queryOne("SELECT * FROM external_account_entries WHERE id=?",id);
  if (!old) return void res.status(404).json({ error: "الحركة غير موجودة" });
  await execute(`UPDATE external_account_entries SET entry_date=?,entry_type=?,money_scope=?,payment_method=?,amount=?,description=?,reference_no=?,notes=?,created_by=? WHERE id=?`,
    text(req.body.entry_date)||today(),req.body.entry_type,req.body.money_scope,text(req.body.payment_method)||null,value,text(req.body.description)||null,text(req.body.reference_no)||null,text(req.body.notes)||null,res.locals.financeActor,id);
  const updated=await queryOne("SELECT * FROM external_account_entries WHERE id=?",id);
  await writeAudit("external_entry",id,"update",res.locals.financeActor,old,updated);
  res.json(updated);
});
router.delete("/external-account-entries/:id", async (req, res) => {
  const id=Number(req.params.id);
  const old=await queryOne("SELECT * FROM external_account_entries WHERE id=?",id);
  if (!old) return void res.status(404).json({ error: "الحركة غير موجودة" });
  await writeAudit("external_entry",id,"delete",res.locals.financeActor,old);
  await execute("DELETE FROM external_account_entries WHERE id=?",id);
  res.json({ deleted: true });
});

export default router;