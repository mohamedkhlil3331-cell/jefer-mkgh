import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import db from "../lib/db.js";
import { createJournalEntry } from "../lib/journal.js";
import { isSysAdminToken } from "./auth.js";

const router = Router();
const SIGNATURE_MANAGER_ROLES = new Set(["admin", "supervisor", "finance", "accountant"]);
type SignatureUser = { id: number; role: string; phone: string | null };

function requireSignatureAccess(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  const user = token ? db.prepare(
    `SELECT u.id, u.role, u.phone
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token=? AND datetime(s.expires_at) > datetime('now') AND u.active=1`
  ).get(token) as SignatureUser | undefined : undefined;
  if (!user) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  res.locals.signatureUser = user;
  next();
}

function canAccessDriverSignature(user: SignatureUser, phone: string) {
  return SIGNATURE_MANAGER_ROLES.has(user.role) || (user.role === "driver" && user.phone === phone);
}

function isSafeSignatureData(value: unknown): value is string {
  return typeof value === "string" &&
    /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value) &&
    value.length <= 1_500_000;
}

interface SettlementRow {
  id: number; driver_phone: string; driver_name: string | null;
  allocated_amount: number; settlement_date: string; settled_by: string | null;
  notes: string | null; deferred: number; delivered_at: string | null; created_at: string;
}

const SETTLEMENT_DASHBOARD_SETTINGS_KEY = "driver_settlement_dashboard_settings";

type SettlementDashboardSettings = {
  cash_amount: number;
  company_custody_amount: number;
  rentals_amount: number;
};

function canAccessSettlementDashboard(req: Request, res: Response): boolean {
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  if (token && isSysAdminToken(token)) return true;
  const user = token
    ? db.prepare(
      `SELECT u.role
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token=? AND datetime(s.expires_at) > datetime('now') AND u.active=1`
    ).get(token) as { role: string } | undefined
    : undefined;

  if (!user) {
    res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    return false;
  }
  if (!SIGNATURE_MANAGER_ROLES.has(user.role)) {
    res.status(403).json({ error: "صلاحيات المدير أو المالية مطلوبة" });
    return false;
  }
  return true;
}

function toNonNegativeAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function getSettlementDashboardSettings(): SettlementDashboardSettings {
  const row = db.prepare("SELECT value FROM system_config WHERE key=?").get(SETTLEMENT_DASHBOARD_SETTINGS_KEY) as { value?: string } | undefined;
  try {
    const parsed = JSON.parse(row?.value || "{}") as Partial<SettlementDashboardSettings>;
    return {
      cash_amount: toNonNegativeAmount(parsed.cash_amount),
      company_custody_amount: toNonNegativeAmount(parsed.company_custody_amount),
      rentals_amount: toNonNegativeAmount(parsed.rentals_amount),
    };
  } catch {
    return { cash_amount: 0, company_custody_amount: 0, rentals_amount: 0 };
  }
}

router.get("/driver-settlements/ledger", (_req, res) => {
  const drivers = db.prepare(
    "SELECT dp.driver_name, dp.phone, dp.vehicle_plate, dp.status FROM driver_profiles dp ORDER BY dp.driver_name"
  ).all() as Array<{ driver_name: string; phone: string; vehicle_plate: string; status: string }>;

  const result = drivers.map(d => {
    const earned = (db.prepare(
      "SELECT COALESCE(SUM(driver_bonus),0) as s FROM workflow_orders WHERE driver_phone=? AND stage='delivered'"
    ).get(d.phone) as { s: number }).s;
    const expenses = (db.prepare(
      "SELECT COALESCE(SUM(amount),0) as s FROM driver_expenses WHERE driver_phone=?"
    ).get(d.phone) as { s: number }).s;
    const settled = (db.prepare(
      "SELECT COALESCE(SUM(allocated_amount),0) as s FROM driver_settlements WHERE driver_phone=? AND (deferred=0 OR delivered_at IS NOT NULL)"
    ).get(d.phone) as { s: number }).s;
    const deferred = (db.prepare(
      "SELECT COALESCE(SUM(allocated_amount),0) as s FROM driver_settlements WHERE driver_phone=? AND deferred=1 AND delivered_at IS NULL"
    ).get(d.phone) as { s: number }).s;
    // Company sends (debited from balance — الشركة أرسلت مسبقاً)
    const companySent = (db.prepare(
      "SELECT COALESCE(SUM(amount),0) as s FROM driver_company_sends WHERE driver_phone=?"
    ).get(d.phone) as { s: number }).s;
    const lastSettlement = db.prepare(
      "SELECT * FROM driver_settlements WHERE driver_phone=? ORDER BY created_at DESC LIMIT 1"
    ).get(d.phone) as SettlementRow | undefined;
    const lastCompanySend = db.prepare(
      "SELECT * FROM driver_company_sends WHERE driver_phone=? ORDER BY created_at DESC LIMIT 1"
    ).get(d.phone) as { id: number; amount: number; note: string | null; created_at: string } | undefined;
    const trips = (db.prepare(
      "SELECT COUNT(*) as c FROM workflow_orders WHERE driver_phone=? AND stage='delivered'"
    ).get(d.phone) as { c: number }).c;
    const tripsNoBonus = (db.prepare(
      "SELECT COUNT(*) as c FROM workflow_orders WHERE driver_phone=? AND stage='delivered' AND (driver_bonus IS NULL OR driver_bonus=0)"
    ).get(d.phone) as { c: number }).c;

    return {
      ...d,
      earned,
      expenses,
      settled,
      deferred,
      companySent,
      balance: earned - expenses - settled - deferred - companySent,
      trips,
      tripsNoBonus,
      lastSettlement: lastSettlement || null,
      lastCompanySend: lastCompanySend || null,
    };
  });

  res.json(result);
});

// Read-only aggregate for the Gross Settlements tab. It deliberately uses only
// printed movement-custody records, then applies registered payments and sends.
router.get("/driver-settlements/statement-summary", (req, res) => {
  if (!canAccessSettlementDashboard(req, res)) return;

  const balances = new Map<string, number>();
  const addToBalance = (phone: string, amount: number) => {
    if (!phone) return;
    balances.set(phone, (balances.get(phone) || 0) + amount);
  };

  const custodyRows = db.prepare(`
    SELECT driver_phone,
           COALESCE(SUM(net_amount), 0) AS net_total,
           COALESCE(SUM(CASE WHEN net_amount > 0 THEN net_amount ELSE 0 END), 0) AS due_total
    FROM driver_custody_records
    WHERE is_custody_printed=1
    GROUP BY driver_phone
  `).all() as Array<{ driver_phone: string; net_total: number; due_total: number }>;
  const settlementRows = db.prepare(`
    SELECT driver_phone, COALESCE(SUM(allocated_amount), 0) AS total
    FROM driver_settlements
    WHERE driver_phone IN (
      SELECT DISTINCT driver_phone
      FROM driver_custody_records
      WHERE is_custody_printed=1
    )
    GROUP BY driver_phone
  `).all() as Array<{ driver_phone: string; total: number }>;
  const companySendRows = db.prepare(`
    SELECT driver_phone, COALESCE(SUM(amount), 0) AS total
    FROM driver_company_sends
    WHERE driver_phone IN (
      SELECT DISTINCT driver_phone
      FROM driver_custody_records
      WHERE is_custody_printed=1
    )
    GROUP BY driver_phone
  `).all() as Array<{ driver_phone: string; total: number }>;

  let totalCustodyDue = 0;
  custodyRows.forEach(row => {
    totalCustodyDue += Number(row.due_total) || 0;
    addToBalance(row.driver_phone, Number(row.net_total) || 0);
  });
  settlementRows.forEach(row => addToBalance(row.driver_phone, -(Number(row.total) || 0)));
  companySendRows.forEach(row => addToBalance(row.driver_phone, -(Number(row.total) || 0)));

  const perDriver = Array.from(balances, ([driver_phone, balance]) => ({ driver_phone, balance }));
  const totalRemainingForDrivers = perDriver.reduce((total, row) => total + Math.max(row.balance, 0), 0);
  const totalOnDrivers = perDriver.reduce((total, row) => total + Math.max(-row.balance, 0), 0);

  res.json({
    total_custody_due: totalCustodyDue,
    total_on_drivers: totalOnDrivers,
    total_remaining_for_drivers: totalRemainingForDrivers,
    per_driver: perDriver,
  });
});

router.get("/driver-settlements/dashboard-settings", (req, res) => {
  if (!canAccessSettlementDashboard(req, res)) return;
  res.json(getSettlementDashboardSettings());
});

router.put("/driver-settlements/dashboard-settings", (req, res) => {
  if (!canAccessSettlementDashboard(req, res)) return;
  const settings: SettlementDashboardSettings = {
    cash_amount: toNonNegativeAmount(req.body.cash_amount),
    company_custody_amount: toNonNegativeAmount(req.body.company_custody_amount),
    rentals_amount: toNonNegativeAmount(req.body.rentals_amount),
  };
  db.prepare(`
    INSERT INTO system_config (key, value, updated_at) VALUES (?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).run(SETTLEMENT_DASHBOARD_SETTINGS_KEY, JSON.stringify(settings));
  res.json(settings);
});

router.get("/driver-settlements", (req, res) => {
  const { driver_phone } = req.query as Record<string, string>;
  const rows = driver_phone
    ? db.prepare(
        "SELECT * FROM driver_settlements WHERE driver_phone=? ORDER BY created_at DESC"
      ).all(driver_phone)
    : db.prepare(
        "SELECT * FROM driver_settlements ORDER BY created_at DESC LIMIT 100"
      ).all();
  res.json(rows);
});

router.post("/driver-settlements", (req, res) => {
  const { driver_phone, driver_name, allocated_amount, settlement_date, settled_by, notes, deferred, is_settlement_cash, items } = req.body;
  if (!driver_phone || allocated_amount === undefined) {
    return void res.status(400).json({ error: "البيانات غير مكتملة" });
  }
  if (settlement_date !== undefined && (typeof settlement_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(settlement_date) ||
      Number.isNaN(Date.parse(`${settlement_date}T00:00:00Z`)) ||
      new Date(`${settlement_date}T00:00:00Z`).toISOString().slice(0, 10) !== settlement_date)) {
    return void res.status(400).json({ error: "تاريخ التسوية غير صالح" });
  }
  const amt = parseFloat(String(allocated_amount));

  let newId: number | bigint = 0;
  db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO driver_settlements (driver_phone, driver_name, allocated_amount, settlement_date, settled_by, notes, deferred, is_settlement_cash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      driver_phone,
      driver_name || null,
      amt,
      settlement_date ?? new Date().toISOString().slice(0, 10),
      settled_by || null,
      notes || null,
      deferred ? 1 : 0,
      is_settlement_cash ? 1 : 0,
    );
    newId = r.lastInsertRowid;

    // ── Save selective settlement items ────────────────────────────────────
    if (Array.isArray(items) && items.length > 0) {
      const itemStmt = db.prepare(
        "INSERT INTO settlement_items (settlement_id, item_type, item_ref, amount) VALUES (?,?,?,?)"
      );
      for (const item of items as { type: string; ref: string; amount: number }[]) {
        itemStmt.run(newId, item.type, String(item.ref), item.amount || 0);
      }
    }

    // ── Journal Entry: Create driver settlement ───────────────────────────
    if (amt > 0) {
      createJournalEntry({
        reference_type: "settlement_create",
        reference_id: String(newId),
        debit_account:  "5030",
        credit_account: "2020",
        amount: amt,
        description: `تسوية سائق: ${driver_name || driver_phone}${deferred ? " (مؤجلة)" : ""}`,
        created_by: settled_by || undefined,
      });
    }
  })();

  res.status(201).json({
    id: newId,
    message: deferred ? "تم تسجيل التصفية المؤجلة" : "تم تسجيل التصفية",
  });
});

// ── Printed marks (وسم "تم طباعته") ──────────────────────────────────────────
router.get("/driver-settlements/printed-marks-all", (req, res) => {
  if (!canAccessSettlementDashboard(req, res)) return;
  try {
    const rows = db.prepare(
      `SELECT pm.item_type, pm.item_ref, pm.marked_at,
              (SELECT dcr.filter_ref FROM driver_custody_records dcr
               WHERE dcr.driver_phone=pm.driver_phone AND dcr.batch_key=pm.batch_key
               ORDER BY dcr.id DESC LIMIT 1) AS statement_ref
       FROM printed_marks pm ORDER BY pm.marked_at DESC`
    ).all();
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.get("/driver-settlements/printed-marks/:phone", (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT pm.item_type, pm.item_ref, pm.marked_at, pm.batch_key,
              (SELECT dcr.filter_ref FROM driver_custody_records dcr
               WHERE dcr.driver_phone=pm.driver_phone AND dcr.batch_key=pm.batch_key
               ORDER BY dcr.id DESC LIMIT 1) AS statement_ref
       FROM printed_marks pm WHERE pm.driver_phone=?`
    ).all(req.params.phone);
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.post("/driver-settlements/printed-marks", (req, res) => {
  const { driver_phone, items, batch_key } = req.body as { driver_phone: string; items: { type: string; ref: string }[]; batch_key?: string };
  if (!driver_phone || !Array.isArray(items) || items.length === 0) {
    return void res.status(400).json({ error: "البيانات غير مكتملة" });
  }
  try {
    const ins = db.prepare(
      "INSERT OR IGNORE INTO printed_marks (driver_phone, item_type, item_ref, batch_key) VALUES (?,?,?,?)"
    );
    db.transaction(() => {
      for (const it of items) {
        if (!it?.type || it.ref === undefined) continue;
        ins.run(driver_phone, it.type, String(it.ref), batch_key || null);
      }
    })();
    res.status(201).json({ message: "تم وسم البنود" });
  } catch {
    res.status(500).json({ error: "تعذّر حفظ الوسم" });
  }
});

// ── Statement signatures (توقيع السائق الرقمي) ────────────────────────────────
// GET all signatures for a driver
router.get("/driver-settlements/statements/signatures/:phone", requireSignatureAccess, (req, res) => {
  const phone = String(req.params.phone);
  if (!canAccessDriverSignature(res.locals.signatureUser as SignatureUser, phone)) {
    return void res.status(403).json({ error: "لا تملك صلاحية عرض التوقيع" });
  }
  try {
    const rows = db.prepare(
      "SELECT batch_key, signed_at FROM statement_signatures WHERE driver_phone=? ORDER BY signed_at DESC"
    ).all(phone);
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// GET single signature (for embedding in print)
router.get("/driver-settlements/statements/:batchKey/signature", requireSignatureAccess, (req, res) => {
  try {
    const row = db.prepare(
      "SELECT driver_phone, signature_data, signed_at FROM statement_signatures WHERE batch_key=?"
    ).get(req.params.batchKey) as { driver_phone: string; signature_data: string; signed_at: string } | undefined;
    if (!row) return void res.status(404).json({ error: "لا يوجد توقيع" });
    if (!canAccessDriverSignature(res.locals.signatureUser as SignatureUser, row.driver_phone)) {
      return void res.status(403).json({ error: "لا تملك صلاحية عرض التوقيع" });
    }
    res.json(row);
  } catch {
    res.status(500).json({ error: "تعذّر تحميل التوقيع" });
  }
});

// POST sign a statement
router.post("/driver-settlements/statements/:batchKey/sign", requireSignatureAccess, (req, res) => {
  const { driver_phone, signature_data } = req.body as { driver_phone: string; signature_data: string };
  const signatureUser = res.locals.signatureUser as SignatureUser;
  if (!driver_phone || !signature_data || !isSafeSignatureData(signature_data)) {
    return void res.status(400).json({ error: "البيانات غير مكتملة" });
  }
  if (!canAccessDriverSignature(signatureUser, driver_phone)) {
    return void res.status(403).json({ error: "لا تملك صلاحية توقيع هذا الكشف" });
  }
  try {
    db.prepare(
      "INSERT OR REPLACE INTO statement_signatures (driver_phone, batch_key, signature_data) VALUES (?,?,?)"
    ).run(driver_phone, req.params.batchKey, signature_data);

    // ── إشعار المدير والمراجعين عند توقيع السائق ──────────────────────────
    try {
      const driverInfo = db.prepare(
        "SELECT driver_name FROM driver_profiles WHERE phone=? LIMIT 1"
      ).get(driver_phone) as { driver_name: string } | undefined;
      const driverLabel = driverInfo?.driver_name || driver_phone;
      const signedAt = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
      const admins = db.prepare(
        "SELECT phone FROM users WHERE role IN ('admin','reviewer') AND active=1"
      ).all() as { phone: string }[];
      const insNotif = db.prepare(
        "INSERT INTO notifications (user_phone, title, body) VALUES (?,?,?)"
      );
      for (const admin of admins) {
        insNotif.run(
          admin.phone,
          "توقيع كشف حساب",
          `السائق ${driverLabel} وقّع على كشف حساب بتاريخ ${signedAt}`
        );
      }
    } catch { /* لا يوقف الاستجابة إذا فشل الإشعار */ }

    res.status(201).json({ message: "تم حفظ التوقيع" });
  } catch {
    res.status(500).json({ error: "تعذّر حفظ التوقيع" });
  }
});

router.delete("/driver-settlements/printed-marks", (req, res) => {
  const { driver_phone, items } = req.body as { driver_phone: string; items: { type: string; ref: string }[] };
  if (!driver_phone || !Array.isArray(items) || items.length === 0) {
    return void res.status(400).json({ error: "البيانات غير مكتملة" });
  }
  try {
    const del = db.prepare(
      "DELETE FROM printed_marks WHERE driver_phone=? AND item_type=? AND item_ref=?"
    );
    db.transaction(() => {
      for (const it of items) {
        if (!it?.type || it.ref === undefined) continue;
        del.run(driver_phone, it.type, String(it.ref));
      }
    })();
    res.json({ message: "تم إلغاء الوسم" });
  } catch {
    res.status(500).json({ error: "تعذّر إلغاء الوسم" });
  }
});

// ── Edit settlement (amount + notes) ─────────────────────────────────────────
router.put("/driver-settlements/:id", (req, res) => {
  const { allocated_amount, notes, settlement_date } = req.body;
  const existing = db.prepare("SELECT * FROM driver_settlements WHERE id=?").get(req.params.id) as SettlementRow | undefined;
  if (!existing) return void res.status(404).json({ error: "التسوية غير موجودة" });
  if (settlement_date !== undefined && (typeof settlement_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(settlement_date) ||
      Number.isNaN(Date.parse(`${settlement_date}T00:00:00Z`)) ||
      new Date(`${settlement_date}T00:00:00Z`).toISOString().slice(0, 10) !== settlement_date)) {
    return void res.status(400).json({ error: "تاريخ التسوية غير صالح" });
  }

  const newAmt = allocated_amount !== undefined ? parseFloat(String(allocated_amount)) : existing.allocated_amount;
  const newNotes = notes !== undefined ? (notes || null) : existing.notes;

  db.prepare(
    "UPDATE driver_settlements SET allocated_amount=?, notes=?, settlement_date=? WHERE id=?"
  ).run(newAmt, newNotes, settlement_date ?? existing.settlement_date, req.params.id);

  res.json({ message: "تم تعديل التسوية" });
});

// ── Delete settlement ─────────────────────────────────────────────────────────
router.delete("/driver-settlements/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM driver_settlements WHERE id=?").get(req.params.id) as SettlementRow | undefined;
  if (!existing) return void res.status(404).json({ error: "التسوية غير موجودة" });

  db.transaction(() => {
    try { db.prepare("DELETE FROM settlement_items WHERE settlement_id=?").run(req.params.id); } catch {}
    db.prepare("DELETE FROM driver_settlements WHERE id=?").run(req.params.id);
  })();

  res.json({ message: "تم حذف التسوية" });
});

router.put("/driver-settlements/:id/deliver", (req, res) => {
  const { delivered_by } = req.body;
  const settlement = db.prepare("SELECT * FROM driver_settlements WHERE id=?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!settlement) return void res.status(404).json({ error: "التسوية غير موجودة" });

  db.transaction(() => {
    db.prepare(
      "UPDATE driver_settlements SET delivered_at=datetime('now'), deferred=0, settled_by=COALESCE(?,settled_by) WHERE id=?"
    ).run(delivered_by || null, req.params.id);

    // ── Journal Entry: Pay driver settlement ───────────────────────────────
    if (Number(settlement.allocated_amount) > 0) {
      createJournalEntry({
        reference_type: "settlement_pay",
        reference_id: String(req.params.id),
        debit_account:  "2020",
        credit_account: "1010",
        amount: Number(settlement.allocated_amount),
        description: `صرف تسوية سائق: ${settlement.driver_name || settlement.driver_phone}`,
        created_by: delivered_by || undefined,
      });
    }
  })();

  res.json({ message: "تم تسليم المبالغ بنجاح" });
});


// ── Remove a single settled item (un-settle) ─────────────────────────────────
router.delete("/driver-settlements/items", (req, res) => {
  const { driver_phone, item_type, item_ref } = req.body as { driver_phone: string; item_type: string; item_ref: string };
  if (!driver_phone || !item_type || item_ref === undefined) {
    return void res.status(400).json({ error: "البيانات غير مكتملة" });
  }
  try {
    db.prepare(`
      DELETE FROM settlement_items
      WHERE item_type=? AND item_ref=?
        AND settlement_id IN (
          SELECT id FROM driver_settlements WHERE driver_phone=?
        )
    `).run(item_type, String(item_ref), driver_phone);
    res.json({ message: "تم إلغاء تصفية البند" });
  } catch {
    res.status(500).json({ error: "تعذّر إلغاء التصفية" });
  }
});

// ── Full statement per driver (for print) ──────────────────────────────────
router.get("/driver-settlements/statement/:phone", (req, res) => {
  const { phone } = req.params;
  const { from, to, vehicle_plate } = req.query as Record<string, string>;

  const f  = from ? from.replace(/'/g, "") : "";
  const t2 = to   ? to.replace(/'/g, "")  : "";
  const selectedVehicle = (vehicle_plate || "").trim();

  const fromSql      = f  ? `AND substr(created_at,1,10) >= '${f}'`    : "";
  const toSql        = t2 ? `AND substr(created_at,1,10) <= '${t2}'`   : "";
  const tripAccountingDate = `(CASE
    WHEN t.client_request_id LIKE 'routing-trip:%'
      THEN CASE WHEN route_child.status='completed' THEN route_child.updated_at END
    ELSE t.date
  END)`;
  const fromTripSql  = f  ? `AND substr(${tripAccountingDate},1,10) >= '${f}'` : "";
  const toTripSql    = t2 ? `AND substr(${tripAccountingDate},1,10) <= '${t2}'` : "";
  const fromRentSql  = f  ? `AND substr(assigned_at,1,10) >= '${f}'`   : "";
  const toRentSql    = t2 ? `AND substr(assigned_at,1,10) <= '${t2}'`  : "";
  const fromStripSql = f  ? `AND substr(COALESCE(t.delivered_at,t.updated_at),1,10) >= '${f}'` : "";
  const toStripSql   = t2 ? `AND substr(COALESCE(t.delivered_at,t.updated_at),1,10) <= '${t2}'`: "";
  const fromExpSql   = f  ? `AND substr(expense_date,1,10) >= '${f}'`  : "";
  const toExpSql     = t2 ? `AND substr(expense_date,1,10) <= '${t2}'` : "";

  const driver = db.prepare(
    "SELECT driver_name, phone, vehicle_plate, status FROM driver_profiles WHERE phone=? LIMIT 1"
  ).get(phone) as { driver_name: string; phone: string; vehicle_plate: string; status: string } | undefined;

  // Trips belong to the driver name recorded on the trip, not to whichever
  // vehicle is currently assigned to the driver. Aliases keep historical names
  // visible without rewriting old trip records.
  const driverNames = (db.prepare(`
    SELECT DISTINCT name FROM (
      SELECT name AS name FROM users WHERE phone=?
      UNION
      SELECT driver_name AS name FROM driver_profiles WHERE phone=?
      UNION
      SELECT da.alias_name AS name
      FROM driver_aliases da
      JOIN driver_profiles dp ON dp.id=da.driver_id
      WHERE dp.phone=?
    )
    WHERE name IS NOT NULL AND trim(name) != ''
  `).all(phone, phone, phone) as { name: string }[]).map(row => row.name);
  const legacyTripOwnerSql = driverNames.length
    ? `t.driver_name IN (${driverNames.map(() => "?").join(",")})`
    : "0";
  // New trips carry an immutable phone snapshot; legacy trips keep their
  // original name-only ownership without being rewritten.
  const tripOwnerSql = `(t.driver_phone=? OR (t.driver_phone IS NULL AND ${legacyTripOwnerSql}))`;
  const tripOwnerParams = [phone, ...driverNames];
  const vehicleTripSql = selectedVehicle ? "AND t.car_id=?" : "";
  const orderVehicleSql = selectedVehicle ? "AND vehicle_plate=?" : "";
  const rentalVehicleSql = selectedVehicle ? "AND assigned_vehicle=?" : "";
  const supplyVehicleSql = selectedVehicle ? "AND t.vehicle_plate=?" : "";
  const expenseVehicleSql = selectedVehicle ? "AND vehicle_plate=?" : "";

  const orders = db.prepare(`
    SELECT order_number, created_at, driver_bonus,
           loading_point_name, delivery_location, quantity, vehicle_plate
    FROM workflow_orders
    WHERE driver_phone=? AND stage='delivered' ${fromSql} ${toSql} ${orderVehicleSql}
    ORDER BY created_at DESC
  `).all(...(selectedVehicle ? [phone, selectedVehicle] : [phone])) as Record<string, unknown>[];

  const rates = db.prepare("SELECT state, rate_per_km FROM trip_bonus_rates").all() as { state: string; rate_per_km: number }[];
  const rateMap: Record<string, number> = {};
  rates.forEach(r => { rateMap[r.state] = r.rate_per_km; });

  const rawTrips = db.prepare(`
    SELECT t.id, t.date, ${tripAccountingDate} AS bonus_date,
           t.trip_state, t.distance_km,
           t.car_id AS vehicle_plate,
           COALESCE(t.route_bonus, 0) AS route_bonus,
           t.notes, t.client_request_id,
           route_child.status AS routing_child_status,
           t.destination, t.client_name,
           t.loading_region, t.unloading_region,
           COALESCE(t.trips_count, 1) AS trips_count,
            COALESCE(t.unit_price, 0)  AS unit_price
    FROM trips t
    LEFT JOIN supply_request_trips route_child
      ON t.client_request_id = 'routing-trip:' || route_child.id
    WHERE ${tripOwnerSql} ${fromTripSql} ${toTripSql} ${vehicleTripSql}
    ORDER BY t.date DESC
  `).all(...tripOwnerParams, ...(selectedVehicle ? [selectedVehicle] : [])) as {
    id: number; date: string; bonus_date: string | null; trip_state: string; distance_km: number;
    vehicle_plate: string; route_bonus: number; notes: string | null; client_request_id: string | null;
    routing_child_status: string | null; destination: string; client_name: string;
    loading_region: string; unloading_region: string; trips_count: number; unit_price: number;
  }[];

  const trips = rawTrips.map(t => {
    const kmBonus  = (t.distance_km || 0) * (rateMap[t.trip_state] || 0);
    const isKeyedRoutingTrip = t.client_request_id?.startsWith("routing-trip:") || false;
    const isRoutingTrip = t.notes?.startsWith("توجيه #") || false;
    const bonus    = isKeyedRoutingTrip
      ? t.routing_child_status === "completed" ? (t.route_bonus || 0) : 0
      : isRoutingTrip ? (t.route_bonus || 0) : (t.route_bonus || 0) > 0 ? t.route_bonus : kmBonus;
    const tripsCount = t.trips_count > 0 ? t.trips_count : 1;
    // New/live statements use the saved trip bonus as the source of truth.
    // Keep the per-reply shape expected by the print table; persisted print
    // snapshots are unaffected.
    return {
      ...t,
      driver_expense: bonus / tripsCount,
      rate: rateMap[t.trip_state] || 0,
      bonus,
    };
  });

  const rentals = db.prepare(`
    SELECT id, assigned_at, driver_bonus, pickup_location, destination_location, assigned_vehicle AS vehicle_plate
    FROM external_rentals
    WHERE driver_phone=? AND status='confirmed' ${fromRentSql} ${toRentSql} ${rentalVehicleSql}
    ORDER BY assigned_at DESC
  `).all(...(selectedVehicle ? [phone, selectedVehicle] : [phone])) as Record<string, unknown>[];

  // ── Completed routing-dispatch supply trips ────────────────────────────────
  const supply_trips = db.prepare(`
    SELECT t.id, COALESCE(t.delivered_at, t.updated_at) AS completed_at,
           sr.rental, sr.driver_expense,
           sr.product_name, sr.warehouse_name, sr.destination_division,
           t.vehicle_plate, sr.routing_dispatch_id
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id = t.supply_request_id
    WHERE t.driver_phone=? AND t.status='completed' AND sr.routing_dispatch_id IS NULL ${fromStripSql} ${toStripSql} ${supplyVehicleSql}
    ORDER BY completed_at DESC
  `).all(...(selectedVehicle ? [phone, selectedVehicle] : [phone])) as Record<string, unknown>[];

  const expenses = db.prepare(
    `SELECT id, expense_date, expense_type, amount, liters, description, order_number, vehicle_plate FROM driver_expenses WHERE driver_phone=? ${fromExpSql} ${toExpSql} ${expenseVehicleSql} ORDER BY expense_date DESC, id DESC`
  ).all(...(selectedVehicle ? [phone, selectedVehicle] : [phone])) as Record<string, unknown>[];

  // A vehicle-specific statement cannot attribute an older global settlement
  // to one car, so keep settlements in the all-vehicles statement only.
  const settlements = selectedVehicle ? [] : db.prepare(
    `SELECT id, created_at, settlement_date, allocated_amount, notes, settled_by, deferred, delivered_at
     FROM driver_settlements WHERE driver_phone=?
       ${f ? "AND substr(COALESCE(NULLIF(settlement_date,''),created_at),1,10)>=?" : ""}
       ${t2 ? "AND substr(COALESCE(NULLIF(settlement_date,''),created_at),1,10)<=?" : ""}
     ORDER BY COALESCE(NULLIF(settlement_date,''),created_at) DESC`
  ).all(phone, ...(f ? [f] : []), ...(t2 ? [t2] : [])) as Record<string, unknown>[];

  const vehicle_plates = (db.prepare(`
    SELECT DISTINCT vehicle_plate FROM (
      SELECT t.car_id AS vehicle_plate FROM trips t WHERE ${tripOwnerSql}
      UNION
      SELECT vehicle_plate FROM workflow_orders WHERE driver_phone=?
      UNION
      SELECT assigned_vehicle AS vehicle_plate FROM external_rentals WHERE driver_phone=?
      UNION
      SELECT vehicle_plate FROM supply_request_trips WHERE driver_phone=?
      UNION
      SELECT vehicle_plate FROM driver_expenses WHERE driver_phone=?
    )
    WHERE vehicle_plate IS NOT NULL AND trim(vehicle_plate) != ''
    ORDER BY vehicle_plate
  `).all(...tripOwnerParams, phone, phone, phone, phone) as { vehicle_plate: string }[])
    .map(row => row.vehicle_plate);
  // Only currently assigned vehicles can be used for a new standalone expense.
  // Historical statement plates remain available for filtering, not for new entries.
  const expense_vehicle_plates = (db.prepare(`
    SELECT DISTINCT plate_number FROM fleet_vehicles
    WHERE driver_phone=? OR backup_driver_phone=?
       OR (driver_phone IS NULL AND driver_name=?)
       OR (backup_driver_phone IS NULL AND backup_driver_name=?)
    ORDER BY plate_number
  `).all(phone, phone, driver?.driver_name || "", driver?.driver_name || "") as { plate_number: string }[])
    .map(row => row.plate_number).filter(Boolean);

  // ── Mark items already included in a selective settlement ─────────────────
  const settledRefs = new Set<string>();
  try {
    const settledRows = db.prepare(`
      SELECT si.item_type, si.item_ref
      FROM settlement_items si
      JOIN driver_settlements ds ON ds.id = si.settlement_id
      WHERE ds.driver_phone = ?
    `).all(phone) as { item_type: string; item_ref: string }[];
    settledRows.forEach(s => settledRefs.add(`${s.item_type}:${s.item_ref}`));
  } catch {}

  const markedOrders: Record<string, unknown>[]      = (orders      as Record<string,unknown>[]).map(o => ({ ...o, settled: settledRefs.has(`order:${o.order_number}`) }));
  const markedTrips       = trips.map(t  => ({ ...t,  settled: settledRefs.has(`trip:${(t as Record<string,unknown>).id}`) }));
  const markedRentals: Record<string, unknown>[]     = (rentals     as Record<string,unknown>[]).map(r => ({ ...r, settled: settledRefs.has(`rental:${r.id}`) }));
  const markedSupplyTrips: Record<string, unknown>[] = (supply_trips as Record<string,unknown>[]).map(t => ({ ...t, settled: settledRefs.has(`supply_trip:${t.id}`) }));
  const markedExpenses: Record<string, unknown>[]    = (expenses    as Record<string,unknown>[]).map(e => ({ ...e, settled: settledRefs.has(`expense:${e.id}`) }));

  const order_bonus        = markedOrders.reduce((s, o) => s + (Number(o.driver_bonus) || 0), 0);
  const trip_bonus         = markedTrips.reduce((s, t) => s + t.bonus, 0);
  const rental_bonus       = markedRentals.reduce((s, r) => s + (Number(r.driver_bonus) || 0), 0);
  const supply_trip_bonus  = markedSupplyTrips.reduce((s, t) => s + (Number(t.rental) || 0), 0);
  const gross_bonus        = order_bonus + trip_bonus + rental_bonus + supply_trip_bonus;
  const total_expenses     = markedExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const total_settled      = (settlements as { allocated_amount: number }[]).reduce((s, x) => s + (x.allocated_amount || 0), 0);

  res.json({
    driver: selectedVehicle && driver ? { ...driver, vehicle_plate: selectedVehicle } : driver || null,
    vehicle_plates,
    expense_vehicle_plates,
    orders: markedOrders, trips: markedTrips, rentals: markedRentals,
    supply_trips: markedSupplyTrips, expenses: markedExpenses, settlements,
    totals: { order_bonus, trip_bonus, rental_bonus, supply_trip_bonus, gross_bonus, total_expenses, total_settled, balance: gross_bonus - total_expenses - total_settled },
  });
});

export default router;

