import { Router, type Request, type Response } from "express";
import * as XLSX from "xlsx";
import db from "../lib/db.js";
import { createJournalEntry } from "../lib/journal.js";

const router = Router();

// ── Auth helper — admin-only guard ────────────────────────────────────────────
function requireAdmin(req: Request, res: Response): { ok: true; actorName: string } | { ok: false } {
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  if (!token || token === "guest") {
    res.status(401).json({ error: "غير مصرح" });
    return { ok: false };
  }
  const session = db.prepare(
    "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')"
  ).get(token) as { user_id: number } | undefined;
  if (!session) {
    res.status(401).json({ error: "الجلسة منتهية" });
    return { ok: false };
  }
  const user = db.prepare(
    "SELECT name, role FROM users WHERE id = ? AND active = 1"
  ).get(session.user_id) as { name: string; role: string } | undefined;
  if (!user || !["admin", "finance"].includes(user.role)) {
    res.status(403).json({ error: "صلاحيات المدير أو المحاسب مطلوبة" });
    return { ok: false };
  }
  return { ok: true, actorName: user.name };
}

// ── GET /journal-entries — list with filters ──────────────────────────────────
router.get("/journal-entries", (req, res) => {
  const { from, to, account, reference_type, limit: lim } = req.query as Record<string, string>;
  let sql = `
    SELECT je.*,
      da.name AS debit_account_name,
      ca.name AS credit_account_name
    FROM journal_entries je
    LEFT JOIN chart_of_accounts da ON da.code = je.debit_account
    LEFT JOIN chart_of_accounts ca ON ca.code = je.credit_account
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (from)           { sql += " AND substr(je.entry_date,1,10) >= ?"; params.push(from); }
  if (to)             { sql += " AND substr(je.entry_date,1,10) <= ?"; params.push(to); }
  if (account)        { sql += " AND (je.debit_account = ? OR je.credit_account = ?)"; params.push(account, account); }
  if (reference_type) { sql += " AND je.reference_type = ?"; params.push(reference_type); }
  sql += " ORDER BY je.created_at DESC";
  if (lim)            { sql += " LIMIT ?"; params.push(Number(lim)); }
  res.json(db.prepare(sql).all(...params));
});

// ── GET /chart-of-accounts — all accounts ─────────────────────────────────────
router.get("/chart-of-accounts", (_req, res) => {
  res.json(db.prepare("SELECT * FROM chart_of_accounts ORDER BY code").all());
});

// ── POST /journal-entries — manual entry (admin/finance only) ─────────────────
router.post("/journal-entries", (req, res) => {
  const auth = requireAdmin(req, res);
  if (!auth.ok) return;

  const { debit_account, credit_account, amount, description, entry_date, reference_id } = req.body;
  if (!debit_account || !credit_account)
    return void res.status(400).json({ error: "الحساب المدين والدائن مطلوبان" });
  if (!amount || Number(amount) <= 0)
    return void res.status(400).json({ error: "المبلغ يجب أن يكون أكبر من صفر" });
  if (!description || String(description).trim().length < 5)
    return void res.status(400).json({ error: "سبب القيد اليدوي إلزامي (5 أحرف على الأقل)" });

  // Verify accounts exist
  const dAcc = db.prepare("SELECT code FROM chart_of_accounts WHERE code=?").get(debit_account);
  const cAcc = db.prepare("SELECT code FROM chart_of_accounts WHERE code=?").get(credit_account);
  if (!dAcc) return void res.status(400).json({ error: `الحساب المدين غير موجود: ${debit_account}` });
  if (!cAcc) return void res.status(400).json({ error: `الحساب الدائن غير موجود: ${credit_account}` });

  try {
    const id = createJournalEntry({
      reference_type: "manual",
      reference_id: reference_id || undefined,
      debit_account,
      credit_account,
      amount: Number(amount),
      description,
      created_by: auth.actorName,   // derived from session, not client-supplied
      entry_date: entry_date || undefined,
    });
    res.status(201).json({ id, message: "تم إنشاء القيد اليدوي" });
  } catch (err) {
    console.error("[journal-entries] manual insert failed:", err);
    res.status(500).json({ error: "فشل إنشاء القيد — حاول مرة أخرى", detail: String(err) });
  }
});

// ── POST /journal-entries/:id/reverse — reverse an entry (admin/finance only) ─
router.post("/journal-entries/:id/reverse", (req, res) => {
  const auth = requireAdmin(req, res);
  if (!auth.ok) return;

  const { reason } = req.body;
  if (!reason || String(reason).trim().length < 3)
    return void res.status(400).json({ error: "سبب العكس إلزامي (3 أحرف على الأقل)" });

  const entry = db.prepare("SELECT * FROM journal_entries WHERE id=?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!entry) return void res.status(404).json({ error: "القيد غير موجود" });
  if (entry.reference_type === "reversal") return void res.status(400).json({ error: "لا يمكن عكس قيد عكسي" });

  try {
    const id = createJournalEntry({
      reference_type: "reversal",
      reference_id: String(entry.id),
      debit_account: String(entry.credit_account),   // swap
      credit_account: String(entry.debit_account),   // swap
      amount: Number(entry.amount),
      description: `عكس قيد #${entry.id}: ${reason}`,
      created_by: auth.actorName,   // derived from session, not client-supplied
    });
    res.status(201).json({ id, message: "تم إنشاء القيد العكسي" });
  } catch (err) {
    console.error("[journal-entries] reversal insert failed:", err);
    res.status(500).json({ error: "فشل إنشاء القيد العكسي", detail: String(err) });
  }
});

// ── GET /trial-balance — aggregated per account ────────────────────────────────
router.get("/trial-balance", (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  let dateFilter = "1=1";
  const params: string[] = [];
  if (from) { dateFilter += " AND substr(je.entry_date,1,10) >= ?"; params.push(from); }
  if (to)   { dateFilter += " AND substr(je.entry_date,1,10) <= ?"; params.push(to); }

  const rows = db.prepare(`
    WITH debits AS (
      SELECT debit_account AS code, SUM(amount) AS total_debit
      FROM journal_entries je WHERE ${dateFilter}
      GROUP BY debit_account
    ),
    credits AS (
      SELECT credit_account AS code, SUM(amount) AS total_credit
      FROM journal_entries je WHERE ${dateFilter}
      GROUP BY credit_account
    )
    SELECT
      c.code,
      c.name,
      c.type,
      c.normal_side,
      COALESCE(d.total_debit,  0) AS total_debit,
      COALESCE(cr.total_credit, 0) AS total_credit,
      COALESCE(d.total_debit, 0) - COALESCE(cr.total_credit, 0) AS balance
    FROM chart_of_accounts c
    LEFT JOIN debits  d  ON d.code  = c.code
    LEFT JOIN credits cr ON cr.code = c.code
    ORDER BY c.code
  `).all(...params, ...params) as Record<string, unknown>[];

  const totalDebit  = (rows as { total_debit:  number }[]).reduce((s, r) => s + r.total_debit,  0);
  const totalCredit = (rows as { total_credit: number }[]).reduce((s, r) => s + r.total_credit, 0);

  res.json({ rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 });
});

// ── GET /journal-entries/export — Excel export ────────────────────────────────
router.get("/journal-entries/export", (req, res) => {
  const { from, to, account, reference_type } = req.query as Record<string, string>;
  let sql = `
    SELECT je.*,
      da.name AS debit_account_name,
      ca.name AS credit_account_name
    FROM journal_entries je
    LEFT JOIN chart_of_accounts da ON da.code = je.debit_account
    LEFT JOIN chart_of_accounts ca ON ca.code = je.credit_account
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (from)           { sql += " AND substr(je.entry_date,1,10) >= ?"; params.push(from); }
  if (to)             { sql += " AND substr(je.entry_date,1,10) <= ?"; params.push(to); }
  if (account)        { sql += " AND (je.debit_account = ? OR je.credit_account = ?)"; params.push(account, account); }
  if (reference_type) { sql += " AND je.reference_type = ?"; params.push(reference_type); }
  sql += " ORDER BY je.created_at DESC";

  const entries = db.prepare(sql).all(...params) as Record<string, unknown>[];

  const RTYPE_LABELS: Record<string, string> = {
    invoice:            "فاتورة",
    payment_cash:       "دفع نقدي",
    payment_bank:       "دفع بنكي",
    purchase_receive:   "استلام مشتريات",
    job_inventory:      "إغلاق أمر عمل (مخزون)",
    job_external:       "إغلاق أمر عمل (خارجي)",
    settlement_create:  "إنشاء تسوية",
    settlement_pay:     "صرف تسوية",
    manual:             "قيد يدوي",
    reversal:           "قيد عكسي",
  };

  const rows = entries.map(e => ({
    "رقم القيد":       e.id,
    "التاريخ":         e.entry_date,
    "نوع الحدث":       RTYPE_LABELS[e.reference_type as string] || e.reference_type,
    "المرجع":          e.reference_id || "",
    "الحساب المدين":   `${e.debit_account} - ${e.debit_account_name || ""}`,
    "الحساب الدائن":   `${e.credit_account} - ${e.credit_account_name || ""}`,
    "المبلغ (ريال)":   e.amount,
    "البيان":          e.description || "",
    "بواسطة":          e.created_by || "",
    "وقت الإنشاء":     e.created_at,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!dir"] = "RTL";
  XLSX.utils.book_append_sheet(wb, ws, "اليومية");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", `attachment; filename="journal-entries-${new Date().toISOString().slice(0,10)}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

export default router;
