import { Router, Request } from "express";
import db from "../lib/db.js";
import { isSysAdminToken } from "./auth.js";

const router = Router();
type Caller = { id: number; role: string; phone: string | null; name: string | null };

function getCaller(req: Request): Caller | null {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === "guest") return null;
  if (isSysAdminToken(token)) return { id: 0, role: "admin", phone: null, name: "مدير النظام" };
  return db.prepare(`
    SELECT u.id, u.role, u.phone, u.name
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
    ORDER BY s.rowid DESC LIMIT 1
  `).get(token) as Caller | undefined || null;
}

/** Returns the caller's role from the Bearer token, or null if unauthenticated. */
function getCallerRole(req: Request): string | null {
  return getCaller(req)?.role || null;
}

/** Only admin and supervisor may mutate expense records. */
function canMutateExpenses(role: string | null): boolean {
  return role === "admin" || role === "supervisor";
}

function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

// GET /driver-expenses/diesel-ledger — read-only view of existing diesel expenses.
// This does not create a second expense or affect driver-account calculations.
router.get("/driver-expenses/diesel-ledger", (req, res) => {
  if (!canMutateExpenses(getCallerRole(req))) {
    res.status(403).json({ error: "غير مسموح — هذا السجل للمشرفين والمديرين فقط" });
    return;
  }

  const rows = db.prepare(`
    SELECT de.id,
           de.expense_date,
           COALESCE(
             NULLIF(trim(de.driver_name), ''),
             (SELECT NULLIF(trim(dp.driver_name), '') FROM driver_profiles dp WHERE dp.phone=de.driver_phone LIMIT 1),
             (SELECT NULLIF(trim(u.name), '') FROM users u WHERE u.phone=de.driver_phone LIMIT 1),
             '—'
           ) AS driver_name,
           de.vehicle_plate,
           de.expense_type,
           de.description,
           de.order_number,
           de.amount,
           de.liters
    FROM driver_expenses de
    WHERE lower(trim(COALESCE(de.expense_type, ''))) LIKE '%ديزل%'
       OR lower(trim(COALESCE(de.expense_type, ''))) LIKE '%diesel%'
    ORDER BY de.expense_date DESC, de.id DESC
  `).all();
  res.json(rows);
});

// GET /driver-expenses?phone=xxx
router.get("/driver-expenses", (req, res) => {
  const { phone } = req.query;
  const rows = phone
    ? db.prepare("SELECT * FROM driver_expenses WHERE driver_phone=? ORDER BY created_at DESC").all(phone)
    : db.prepare("SELECT * FROM driver_expenses ORDER BY created_at DESC LIMIT 200").all();
  res.json(rows);
});

// POST /driver-expenses
router.post("/driver-expenses", (req, res) => {
  const { driver_phone, driver_name, order_id, order_number, expense_type, amount, liters, description, expense_date, attachment_url, vehicle_plate } = req.body;
  const caller = getCaller(req);
  if (!caller) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  const managerSubmission = canMutateExpenses(caller.role);
  const effectiveDriverPhone = managerSubmission ? String(driver_phone || "").trim() : String(caller.phone || "").trim();
  const effectiveDriverName = managerSubmission ? String(driver_name || "").trim() : String(caller.name || "").trim();
  if (!effectiveDriverPhone || !amount) return void res.status(400).json({ error: "يجب تحديد السائق والمبلغ" });

  // Snapshot the vehicle at the time of entry. An order keeps its own vehicle
  // snapshot. Standalone expenses must resolve through current fleet assignment.
  const orderVehicle = order_id
    ? db.prepare(`
        SELECT vehicle_plate, driver_phone, alt_driver_phone
        FROM workflow_orders WHERE id=? LIMIT 1
      `).get(order_id) as {
        vehicle_plate: string | null;
        driver_phone: string | null;
        alt_driver_phone: string | null;
      } | undefined
    : undefined;
  if (order_id && !orderVehicle) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (
    orderVehicle && !managerSubmission &&
    orderVehicle.driver_phone !== effectiveDriverPhone &&
    orderVehicle.alt_driver_phone !== effectiveDriverPhone
  ) {
    return void res.status(403).json({ error: "هذا الطلب غير مرتبط بحساب السائق الحالي" });
  }
  const fleetVehicles = db.prepare(`
    SELECT DISTINCT plate_number AS vehicle_plate FROM fleet_vehicles
    WHERE driver_phone=? OR backup_driver_phone=?
       OR (driver_phone IS NULL AND driver_name=?)
       OR (backup_driver_phone IS NULL AND backup_driver_name=?)
    ORDER BY plate_number
  `).all(
    effectiveDriverPhone, effectiveDriverPhone,
    effectiveDriverName || "", effectiveDriverName || "",
  ) as { vehicle_plate: string }[];
  const assignedPlates = fleetVehicles.map(v => String(v.vehicle_plate || "").trim()).filter(Boolean);
  const submittedPlate = String(vehicle_plate || "").trim();
  let resolvedVehicle = String(orderVehicle?.vehicle_plate || "").trim();
  if (resolvedVehicle && submittedPlate && submittedPlate !== resolvedVehicle) {
    return void res.status(400).json({ error: "السيارة المرسلة لا تطابق سيارة الطلب" });
  }
  if (!resolvedVehicle && assignedPlates.length > 0) {
    if (submittedPlate && !assignedPlates.includes(submittedPlate)) {
      return void res.status(400).json({ error: "السيارة المختارة غير مرتبطة بهذا السائق" });
    }
    if (assignedPlates.length > 1 && !submittedPlate) {
      return void res.status(400).json({ error: "اختر السيارة التي تخصها الفاتورة" });
    }
    resolvedVehicle = submittedPlate || assignedPlates[0];
  }
  if (!resolvedVehicle && assignedPlates.length === 0) {
    return void res.status(400).json({ error: "لا توجد سيارة مرتبطة بهذا السائق في سجل السيارات" });
  }
  const resolvedVehicleOrNull = resolvedVehicle || null;

  const r = db.prepare(`
    INSERT INTO driver_expenses (driver_phone,driver_name,vehicle_plate,order_id,order_number,expense_type,amount,liters,description,expense_date,attachment_url)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    effectiveDriverPhone, effectiveDriverName||null, resolvedVehicleOrNull, order_id||null, order_number||null,
    expense_type||"ديزل", parseFloat(amount)||0, parseFloat(liters)||0,
    description||null, expense_date||new Date().toISOString().slice(0,10),
    attachment_url||null
  );
  const saved = db.prepare("SELECT * FROM driver_expenses WHERE id=?").get(r.lastInsertRowid);
  res.status(201).json({ id: r.lastInsertRowid, message: "تم تسجيل المصروف", expense: saved });
});

// PUT /driver-expenses/:id
router.put("/driver-expenses/:id", (req, res) => {
  if (!canMutateExpenses(getCallerRole(req)))
    return void res.status(403).json({ error: "غير مسموح — هذا الإجراء للمشرفين فقط" });
  const { expense_type, amount, liters, description, expense_date, attachment_url, vehicle_plate } = req.body;
  if (!amount) return void res.status(400).json({ error: "المبلغ مطلوب" });
  const hasVehiclePlate = Object.prototype.hasOwnProperty.call(req.body || {}, "vehicle_plate");
  const normalizedPlate = String(vehicle_plate ?? "").trim();
  if (hasVehiclePlate && normalizedPlate) {
    const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const existing = db.prepare("SELECT vehicle_plate FROM driver_expenses WHERE id=?").get(id) as { vehicle_plate: string | null } | undefined;
    if (!existing) return void res.status(404).json({ error: "المصروف غير موجود" });
    if (
      normalizedPlate !== existing.vehicle_plate &&
      !db.prepare("SELECT 1 FROM fleet_vehicles WHERE plate_number=? LIMIT 1").get(normalizedPlate)
    ) {
      return void res.status(400).json({ error: "رقم السيارة غير موجود في سيارات الشركة" });
    }
  }
  db.prepare(`
    UPDATE driver_expenses SET expense_type=?, amount=?, liters=?, description=?, expense_date=?,
      attachment_url=COALESCE(?,attachment_url),
      vehicle_plate=CASE WHEN ?=1 THEN ? ELSE vehicle_plate END
    WHERE id=?
  `).run(
    expense_type || "ديزل", parseFloat(amount) || 0, parseFloat(liters) || 0,
    description || null, expense_date || new Date().toISOString().slice(0, 10),
    attachment_url || null,
    hasVehiclePlate ? 1 : 0,
    normalizedPlate || null,
    req.params.id,
  );
  res.json(db.prepare("SELECT * FROM driver_expenses WHERE id=?").get(req.params.id));
});

// DELETE /driver-expenses/:id
router.delete("/driver-expenses/:id", (req, res) => {
  if (!canMutateExpenses(getCallerRole(req)))
    return void res.status(403).json({ error: "غير مسموح — هذا الإجراء للمشرفين فقط" });
  db.prepare("DELETE FROM driver_expenses WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// GET /driver-settlements?phone=xxx
router.get("/driver-settlements", (req, res) => {
  const { phone } = req.query;
  const rows = phone
    ? db.prepare("SELECT * FROM driver_settlements WHERE driver_phone=? ORDER BY settlement_date DESC").all(phone)
    : db.prepare("SELECT * FROM driver_settlements ORDER BY settlement_date DESC LIMIT 100").all();
  res.json(rows);
});

// POST /driver-settlements
router.post("/driver-settlements", (req, res) => {
  const { driver_phone, driver_name, allocated_amount, settlement_date, settled_by, notes } = req.body;
  if (!driver_phone || !allocated_amount) return void res.status(400).json({ error: "يجب تحديد السائق والمبلغ" });
  if (settlement_date !== undefined && !isValidCalendarDate(settlement_date)) {
    return void res.status(400).json({ error: "تاريخ التسوية غير صالح، استخدم YYYY-MM-DD" });
  }
  const r = db.prepare(`
    INSERT INTO driver_settlements (driver_phone,driver_name,allocated_amount,settlement_date,settled_by,notes)
    VALUES (?,?,?,?,?,?)
  `).run(
    driver_phone, driver_name||null, parseFloat(allocated_amount)||0,
    settlement_date ?? new Date().toISOString().slice(0,10),
    settled_by||null, notes||null
  );
  res.status(201).json({ id: r.lastInsertRowid, message: "تم تسجيل التسوية" });
});

// GET /driver-balance?phone=xxx
router.get("/driver-balance", (req, res) => {
  const { phone } = req.query;
  if (!phone) return void res.status(400).json({ error: "يجب تحديد رقم الجوال" });

  const lastSettlement = db.prepare(
    "SELECT * FROM driver_settlements WHERE driver_phone=? ORDER BY settlement_date DESC, id DESC LIMIT 1"
  ).get(phone) as { id: number; allocated_amount: number; settlement_date: string; driver_name: string } | undefined;

  if (!lastSettlement) {
    return void res.json({ allocated: 0, spent: 0, remaining: 0, last_settlement_date: null, expenses: [] });
  }

  const expenses = db.prepare(
    "SELECT * FROM driver_expenses WHERE driver_phone=? AND expense_date >= ? ORDER BY created_at DESC"
  ).all(phone, lastSettlement.settlement_date) as { amount: number }[];

  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const remaining = lastSettlement.allocated_amount - spent;

  res.json({
    allocated: lastSettlement.allocated_amount,
    spent,
    remaining,
    last_settlement_date: lastSettlement.settlement_date,
    driver_name: lastSettlement.driver_name,
    expenses,
  });
});

export default router;
