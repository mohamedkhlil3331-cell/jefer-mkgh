import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import db from "../lib/db.js";

const router = Router();
const CUSTODY_ROLES = new Set(["admin", "supervisor", "finance", "accountant"]);

type CustodyUser = { id: number; role: string };
type UnknownRecord = Record<string, unknown>;

function isStructuredPrintSnapshot(value: unknown, requireReference = true): value is UnknownRecord {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as UnknownRecord;
  if (
    snapshot.version !== 1 ||
    typeof snapshot.driver_name !== "string" ||
    (requireReference && typeof snapshot.filter_ref !== "string") ||
    typeof snapshot.printed_at !== "string" ||
    !snapshot.statement ||
    typeof snapshot.statement !== "object"
  ) return false;
  const statement = snapshot.statement as UnknownRecord;
  return ["orders", "trips", "rentals", "supply_trips", "expenses", "settlements"]
    .every(key => Array.isArray(statement[key])) &&
    !!statement.totals && typeof statement.totals === "object";
}

function parseItemsSnapshot(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  try {
    const items = JSON.parse(value) as unknown;
    if (!Array.isArray(items) || !items.every(item => {
      if (!item || typeof item !== "object") return false;
      const record = item as UnknownRecord;
      return typeof record.date === "string" &&
        typeof record.kind === "string" &&
        typeof record.label === "string" &&
        typeof record.sub === "string" &&
        typeof record.amount === "number" &&
        typeof record.sign === "number" &&
        (record.refKey === undefined || typeof record.refKey === "string");
    })) return null;
    return JSON.stringify(items);
  } catch {
    return null;
  }
}

function printedItemsFromSnapshot(serializedItems: string | null): { type: string; ref: string }[] | null {
  if (!serializedItems) return null;
  const items = JSON.parse(serializedItems) as UnknownRecord[];
  if (!items.length) return null;
  const refs: { type: string; ref: string }[] = [];
  for (const item of items) {
    if (typeof item.refKey !== "string") return null;
    const separator = item.refKey.indexOf(":");
    const type = item.refKey.slice(0, separator);
    const ref = item.refKey.slice(separator + 1);
    if (!["order", "trip", "rental", "supply_trip", "expense"].includes(type) || !ref || ref.length > 300) return null;
    refs.push({ type, ref });
  }
  return refs;
}

function markCustodyItems(driverPhone: string, items: { type: string; ref: string }[], batchKey: string) {
  const insert = db.prepare(
    `INSERT INTO printed_marks (driver_phone, item_type, item_ref, batch_key) VALUES (?,?,?,?)
     ON CONFLICT(driver_phone, item_type, item_ref) DO UPDATE SET
       batch_key=excluded.batch_key, marked_at=datetime('now')
     WHERE printed_marks.batch_key IS NULL`
  );
  for (const item of items) insert.run(driverPhone, item.type, item.ref, batchKey);
}

function savedStatementRefs(snapshotData: string | null): Set<string> {
  const refs = new Set<string>();
  if (!snapshotData) return refs;
  try {
    const document = JSON.parse(snapshotData) as { statement?: Record<string, unknown> };
    const statement = document.statement;
    if (!statement) return refs;
    const entries = (key: string): UnknownRecord[] => Array.isArray(statement[key])
      ? statement[key] as UnknownRecord[] : [];
    for (const order of entries("orders")) if (order.order_number != null) refs.add(`order:${order.order_number}`);
    for (const trip of entries("trips")) {
      if (trip.id != null) refs.add(`trip:${trip.id}`);
      else refs.add(`trip:@${trip.date}|${trip.loading_region || trip.client_name || "—"}|${trip.unloading_region || trip.destination || "—"}|${trip.bonus}`);
    }
    for (const rental of entries("rentals")) {
      if (rental.id != null) refs.add(`rental:${rental.id}`);
      else refs.add(`rental:@${rental.assigned_at}|${rental.driver_bonus}`);
    }
    for (const supply of entries("supply_trips")) if (supply.id != null) refs.add(`supply_trip:${supply.id}`);
    for (const expense of entries("expenses")) if (expense.id != null) refs.add(`expense:${expense.id}`);
  } catch {
    // An unreadable old snapshot is not evidence that it contains a specific item.
  }
  return refs;
}

function requireCustodyAccess(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  const user = token
    ? db.prepare(
      `SELECT u.id, u.role
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token=? AND datetime(s.expires_at) > datetime('now') AND u.active=1`
    ).get(token) as CustodyUser | undefined
    : undefined;
  if (!user) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (!CUSTODY_ROLES.has(user.role)) return void res.status(403).json({ error: "لا تملك صلاحية إدارة عهدة الحركة" });
  res.locals.custodyUser = user;
  next();
}

function unprintDriverCustody(id: number) {
  const update = db.prepare(
    `UPDATE driver_custody_records
     SET is_custody_printed=0, custody_printed_at=NULL,
         is_cancelled=0, cancelled_at=NULL, cancelled_by_user_id=NULL
     WHERE id=?`
  ).run(id);
  if (update.changes !== 1) {
    return { ok: false as const, error: "سجل العهدة غير موجود", status: 404 as const };
  }
  return { ok: true as const, is_custody_printed: 0 };
}

router.use("/driver-custody", requireCustodyAccess);

// GET /driver-custody — list all records, optional filters
router.get("/driver-custody", (req, res) => {
  const { driver_phone, from, to } = req.query as Record<string, string>;
  // Do not send potentially large stored print documents with the listing.
  let sql = `SELECT id, driver_phone, driver_name, vehicle_plate, print_date, date_from, date_to,
                    filter_ref, load_types, net_amount, item_count, items_snapshot,
                    is_custody_printed, custody_printed_at, created_at, batch_key,
                    COALESCE(is_cancelled, 0) AS is_cancelled, cancelled_at,
                    COALESCE(include_driver_signatures, 1) AS include_driver_signatures,
                    COALESCE(snapshot_required, 0) AS snapshot_required,
                    CASE WHEN print_snapshot_data IS NULL THEN 0 ELSE 1 END AS has_print_snapshot
             FROM driver_custody_records WHERE 1=1`;
  const params: (string | null)[] = [];
  if (driver_phone) { sql += " AND driver_phone=?"; params.push(driver_phone); }
  if (from)         { sql += " AND print_date >= ?"; params.push(from); }
  if (to)           { sql += " AND print_date <= ?"; params.push(to); }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

// GET /driver-custody/summary — total + per-driver breakdown
router.get("/driver-custody/summary", (_req, res) => {
  const row = db.prepare(
    "SELECT COALESCE(SUM(net_amount),0) AS total FROM driver_custody_records"
  ).get() as { total: number };
  const perDriver = db.prepare(`
    SELECT driver_phone, driver_name, vehicle_plate,
           COALESCE(SUM(net_amount),0) AS total_amount,
           COUNT(*) AS record_count
     FROM driver_custody_records
    GROUP BY driver_phone
    ORDER BY total_amount DESC
  `).all();
  res.json({ total_custody: row.total, per_driver: perDriver });
});

// POST /driver-custody — create new custody record (called after printing a statement)
router.post("/driver-custody", (req, res) => {
  const custodyUser = res.locals.custodyUser as CustodyUser;
  const { driver_phone, driver_name, vehicle_plate, date_from, date_to,
          load_types, net_amount, item_count, items_snapshot, batch_key, print_snapshot } = req.body;
  if (!driver_phone) return void res.status(400).json({ error: "driver_phone مطلوب" });
  if (!isStructuredPrintSnapshot(print_snapshot, false)) {
    return void res.status(400).json({ error: "لقطة كشف الحساب الكاملة مطلوبة" });
  }
  const serializedItems = parseItemsSnapshot(items_snapshot);
  if (items_snapshot && !serializedItems) {
    return void res.status(400).json({ error: "بنود كشف العهدة غير صالحة" });
  }
  const printedItems = printedItemsFromSnapshot(serializedItems);
  if (!printedItems || !batch_key) {
    return void res.status(400).json({ error: "بنود الكشف المطلوبة للوسم غير مكتملة؛ حدّث الصفحة وحاول مجددًا" });
  }

  const created = db.transaction(() => {
    const print_date = new Date().toISOString().slice(0, 10);
    const seqRow = db.prepare(
      `SELECT COALESCE(MAX(CAST(REPLACE(filter_ref,'KH-','') AS INTEGER)),0)+1 AS n
       FROM driver_custody_records WHERE filter_ref LIKE 'KH-%'`
    ).get() as { n: number };
    const filter_ref = `KH-${String(seqRow.n).padStart(4, "0")}`;
    const snapshotData = JSON.stringify({ ...print_snapshot, filter_ref });
    const r = db.prepare(`
      INSERT INTO driver_custody_records
        (driver_phone, driver_name, vehicle_plate, print_date, date_from, date_to,
         filter_ref, load_types, net_amount, item_count, items_snapshot, batch_key,
         print_snapshot_data, snapshot_required, created_by_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      driver_phone, driver_name || null, vehicle_plate || null, print_date,
      date_from || null, date_to || null, filter_ref,
      load_types || null,
      parseFloat(String(net_amount || 0)) || 0,
      parseInt(String(item_count || 0)) || 0,
      serializedItems,
      batch_key || null,
      snapshotData,
      1,
      custodyUser.id,
    );
    markCustodyItems(driver_phone, printedItems, batch_key);
    return { id: r.lastInsertRowid, filter_ref };
  })();
  res.status(201).json(created);
});

// PUT /driver-custody/:id — replace a saved statement while preserving its reference number
router.put("/driver-custody/:id", (req, res) => {
  const custodyUser = res.locals.custodyUser as CustodyUser;
  const { driver_phone, driver_name, vehicle_plate, date_from, date_to,
          load_types, net_amount, item_count, items_snapshot, batch_key, print_snapshot } = req.body;
  if (!driver_phone) return void res.status(400).json({ error: "driver_phone مطلوب" });
  if (!isStructuredPrintSnapshot(print_snapshot, false)) {
    return void res.status(400).json({ error: "لقطة كشف الحساب الكاملة مطلوبة" });
  }
  const serializedItems = parseItemsSnapshot(items_snapshot);
  if (items_snapshot && !serializedItems) {
    return void res.status(400).json({ error: "بنود كشف العهدة غير صالحة" });
  }
  const printedItems = printedItemsFromSnapshot(serializedItems);
  if (!printedItems || !batch_key) {
    return void res.status(400).json({ error: "بنود الكشف المطلوبة للوسم غير مكتملة؛ حدّث الصفحة وحاول مجددًا" });
  }

  const existing = db.prepare(
    "SELECT id, driver_phone, filter_ref, batch_key FROM driver_custody_records WHERE id=?"
  ).get(req.params.id) as { id: number; driver_phone: string; filter_ref: string; batch_key: string | null } | undefined;
  if (!existing) return void res.status(404).json({ error: "الكشف القديم غير موجود" });
  if (existing.driver_phone !== driver_phone) {
    return void res.status(409).json({ error: "لا يمكن تعديل كشف تابع لسائق آخر" });
  }

  const snapshotData = JSON.stringify({ ...print_snapshot, filter_ref: existing.filter_ref });
  db.transaction(() => {
    if (existing.batch_key) {
      const selectedRefs = new Set(printedItems.map(item => `${item.type}:${item.ref}`));
      const oldMarks = db.prepare(
        "SELECT item_type, item_ref FROM printed_marks WHERE driver_phone=? AND batch_key=?"
      ).all(driver_phone, existing.batch_key) as { item_type: string; item_ref: string }[];
      const otherStatements = db.prepare(
        `SELECT batch_key, created_at, items_snapshot, print_snapshot_data FROM driver_custody_records
         WHERE driver_phone=? AND id!=? AND batch_key IS NOT NULL ORDER BY id DESC`
      ).all(driver_phone, existing.id) as { batch_key: string; created_at: string; items_snapshot: string | null; print_snapshot_data: string | null }[];
      const otherItems = otherStatements.map(record => {
        try {
          const entries = JSON.parse(record.items_snapshot || "[]") as { refKey?: string }[];
          const refs = savedStatementRefs(record.print_snapshot_data);
          for (const entry of entries) if (entry.refKey) refs.add(entry.refKey);
          return { record, refs };
        } catch {
          return { record, refs: savedStatementRefs(record.print_snapshot_data) };
        }
      });
      const update = db.prepare(
        "UPDATE printed_marks SET batch_key=?, marked_at=? WHERE driver_phone=? AND item_type=? AND item_ref=? AND batch_key=?"
      );
      const remove = db.prepare(
        "DELETE FROM printed_marks WHERE driver_phone=? AND item_type=? AND item_ref=? AND batch_key=?"
      );
      for (const mark of oldMarks) {
        const key = `${mark.item_type}:${mark.item_ref}`;
        if (selectedRefs.has(key)) {
          update.run(batch_key, new Date().toISOString(), driver_phone, mark.item_type, mark.item_ref, existing.batch_key);
        } else {
          const replacement = otherItems.find(other => other.refs.has(key))?.record;
          if (replacement) {
            update.run(replacement.batch_key, replacement.created_at, driver_phone, mark.item_type, mark.item_ref, existing.batch_key);
          } else {
            remove.run(driver_phone, mark.item_type, mark.item_ref, existing.batch_key);
          }
        }
      }
    }
    db.prepare(`
      UPDATE driver_custody_records
      SET driver_name=?, vehicle_plate=?, print_date=?, date_from=?, date_to=?,
          load_types=?, net_amount=?, item_count=?, items_snapshot=?, batch_key=?,
          print_snapshot_data=?, snapshot_required=1, created_by_user_id=?
      WHERE id=?
    `).run(
      driver_name || null,
      vehicle_plate || null,
      new Date().toISOString().slice(0, 10),
      date_from || null,
      date_to || null,
      load_types || null,
      parseFloat(String(net_amount || 0)) || 0,
      parseInt(String(item_count || 0)) || 0,
      serializedItems,
      batch_key,
      snapshotData,
      custodyUser.id,
      existing.id,
    );
    markCustodyItems(driver_phone, printedItems, batch_key);
  })();
  res.json({ id: existing.id, filter_ref: existing.filter_ref });
});

// GET /driver-custody/:id/print-snapshot — structured print document saved for the statement
router.get("/driver-custody/:id/print-snapshot", (req, res) => {
  const row = db.prepare(
    "SELECT print_snapshot_data FROM driver_custody_records WHERE id=?"
  ).get(req.params.id) as { print_snapshot_data: string | null } | undefined;
  if (!row?.print_snapshot_data) {
    return void res.status(404).json({ error: "لا توجد نسخة محفوظة لهذا الكشف" });
  }
  try {
    res.json({ print_snapshot: JSON.parse(row.print_snapshot_data) });
  } catch {
    res.status(500).json({ error: "تعذر قراءة نسخة الكشف المحفوظة" });
  }
});

// PATCH /driver-custody/mark-printed — mark selected records as printed from custody tab
router.patch("/driver-custody/mark-printed", (req, res) => {
  const rawIds = (req.body as { ids?: unknown } | undefined)?.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return void res.status(400).json({ error: "ids مطلوبة" });
  }
  const ids = rawIds.map(Number);
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    return void res.status(400).json({ error: "قائمة السجلات غير صالحة" });
  }
  const now = new Date().toISOString();
  let result: { ok: false; error: string; status: number } | { ok: true; updated: number };
  try {
    result = db.transaction(() => {
      const placeholders = ids.map(() => "?").join(",");
      const rows = db.prepare(
        `SELECT id, is_custody_printed
         FROM driver_custody_records WHERE id IN (${placeholders})`
      ).all(...ids) as { id: number; is_custody_printed: number }[];
      if (rows.length !== ids.length) {
        return { ok: false as const, error: "بعض سجلات العهدة غير موجودة", status: 404 as const };
      }
      if (rows.some(row => row.is_custody_printed)) {
        return { ok: false as const, error: "يمكن طباعة السجلات غير المطبوعة فقط", status: 409 as const };
      }
      const update = db.prepare(
        `UPDATE driver_custody_records
         SET is_custody_printed=1, custody_printed_at=?,
             is_cancelled=0, cancelled_at=NULL, cancelled_by_user_id=NULL
         WHERE id IN (${placeholders})
           AND COALESCE(is_custody_printed,0)=0`
      ).run(now, ...ids);
      if (update.changes !== ids.length) {
        throw new Error("CUSTODY_RESERVATION_CONFLICT");
      }
      return { ok: true as const, updated: ids.length };
    })();
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTODY_RESERVATION_CONFLICT") {
      return void res.status(409).json({ error: "تغيّرت حالة أحد السجلات؛ حدّث القائمة ثم حاول مجددًا" });
    }
    throw error;
  }
  if (!result.ok) return void res.status(result.status).json({ error: result.error });
  res.json(result);
});

// PATCH /driver-custody/:id/signature — save the driver-signature visibility preference
router.patch("/driver-custody/:id/signature", (req, res) => {
  const { include_driver_signatures } = (req.body || {}) as { include_driver_signatures?: unknown };
  if (typeof include_driver_signatures !== "boolean") {
    return void res.status(400).json({ error: "قيمة إعداد التوقيع غير صالحة" });
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return void res.status(400).json({ error: "رقم سجل العهدة غير صالح" });
  }
  const result = db.prepare(
    `UPDATE driver_custody_records SET include_driver_signatures=?
     WHERE id=? AND COALESCE(is_custody_printed,0)=0`
  ).run(include_driver_signatures ? 1 : 0, id);
  if (!result.changes) {
    const row = db.prepare(
      "SELECT is_custody_printed FROM driver_custody_records WHERE id=?"
    ).get(id) as { is_custody_printed: number } | undefined;
    return void res.status(row ? 409 : 404).json({
      error: row ? "لا يمكن تغيير التوقيعات بعد الطباعة" : "سجل العهدة غير موجود",
    });
  }
  res.json({ include_driver_signatures });
});

// PATCH /driver-custody/:id/cancel — cancel printing only; preserve the statement and its source marks
router.patch("/driver-custody/:id/cancel", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return void res.status(400).json({ error: "رقم سجل العهدة غير صالح" });
  }
  const result = unprintDriverCustody(id);
  if (!result.ok) return void res.status(result.status).json({ error: result.error });
  res.json(result);
});

// PATCH /driver-custody/:id/ref — تعديل رقم الكشف يدوياً
router.patch("/driver-custody/:id/ref", (req, res) => {
  const { filter_ref } = req.body as { filter_ref: string };
  if (!filter_ref?.trim()) return void res.status(400).json({ error: "filter_ref مطلوب" });
  const result = db.prepare(
    "UPDATE driver_custody_records SET filter_ref=? WHERE id=? AND COALESCE(snapshot_required,0)=0 AND print_snapshot_data IS NULL"
  ).run(filter_ref.trim(), req.params.id);
  if (!result.changes) {
    const exists = db.prepare("SELECT id FROM driver_custody_records WHERE id=?").get(req.params.id);
    return void res.status(exists ? 409 : 404).json({
      error: exists ? "لا يمكن تعديل رقم كشف تم حفظ نسخته" : "سجل العهدة غير موجود",
    });
  }
  res.json({ ok: true });
});

// DELETE /driver-custody/:id — legacy clients also only clear the print state
router.delete("/driver-custody/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return void res.status(400).json({ error: "رقم سجل العهدة غير صالح" });
  }
  const result = unprintDriverCustody(id);
  if (!result.ok) return void res.status(result.status).json({ error: result.error });
  res.json(result);
});

export default router;
