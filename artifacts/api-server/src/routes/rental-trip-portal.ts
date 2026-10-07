import { Router, type Request, type Response, type NextFunction } from "express";
import db from "../lib/db.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();
const objectStorage = new ObjectStorageService();
const text = (value: unknown) => String(value ?? "").trim();
const today = () => new Date().toISOString().slice(0, 10);
const receiptPathVariants = (path: string) => [path, `/api/storage${path}`, `/api${path}`];

type PortalUser = { id: number; name: string };
type PortalCustomer = { id: number; name: string; phone: string | null; notes: string | null };

function requirePortalCustomer(req: Request, res: Response, next: NextFunction) {
  const match = /^Bearer\s+(.+)$/i.exec(text(req.headers.authorization));
  const token = match?.[1]?.trim();
  const user = token
    ? db.prepare(`
        SELECT u.id,u.name,u.role
        FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
          AND s.rowid=(
            SELECT MAX(s2.rowid) FROM sessions s2
            WHERE s2.user_id=s.user_id AND datetime(s2.expires_at)>datetime('now')
          )
      `).get(token) as { id: number; name: string; role: string } | undefined
    : undefined;
  if (!user) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (user.role !== "rental_trip_customer") {
    return void res.status(403).json({ error: "هذه الخدمة متاحة لعملاء تأجير الرحلات فقط" });
  }
  const customer = db.prepare(`
    SELECT id,name,phone,notes FROM rental_customers
    WHERE portal_user_id=? AND active=1 AND customer_type='rental'
  `).get(user.id) as PortalCustomer | undefined;
  if (!customer) return void res.status(403).json({ error: "لا يوجد حساب إيجار مرتبط بهذا المستخدم" });
  res.locals.portalUser = { id: user.id, name: user.name } satisfies PortalUser;
  res.locals.portalCustomer = customer;
  next();
}

router.use("/rental-trip-portal", requirePortalCustomer);

function adjustedTripPrices(customerName: string) {
  const rows = db.prepare(`
    SELECT trip_id,amount FROM rental_statement_adjustments
    WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND adjustment_type='reply'
  `).all(customerName) as Array<{ trip_id: number; amount: number }>;
  return new Map(rows.map(row => [row.trip_id, Number(row.amount)]));
}

function tripRows(customerName: string) {
  return db.prepare(`
    SELECT id,date,car_id,vehicle_type,driver_name,material_type,loading_region,unloading_region,
      COALESCE(trips_count,1) trips_count,
      COALESCE(return_value_no_vat,total_amount,0) base_total,
      image_url,permit_image_url,fsohat_image_url,created_at
    FROM trips
    WHERE LOWER(TRIM(client_name))=LOWER(TRIM(?))
      AND COALESCE(customer_type_snapshot,'rental')='rental'
    ORDER BY date DESC,created_at DESC,id DESC
  `).all(customerName) as Array<Record<string, unknown> & {
    id: number; date: string; base_total: number; material_type: string | null;
    loading_region: string | null; unloading_region: string | null;
  }>;
}

router.get("/rental-trip-portal/me", (_req, res) => {
  const customer = res.locals.portalCustomer as PortalCustomer;
  const trips = tripRows(customer.name);
  const adjustments = adjustedTripPrices(customer.name);
  const entries = db.prepare(`
    SELECT 'manual' source,id,entry_date,COALESCE(description,'رصيد سابق') description,
      CASE WHEN entry_type='opening_debit' THEN amount ELSE 0 END debit,
      CASE WHEN entry_type='opening_credit' THEN amount ELSE 0 END credit,
      reference_no,NULL loading_region,NULL unloading_region,NULL trips_count,
      created_at,NULL transfer_status,NULL transfer_image_url
    FROM rental_account_entries WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))
    UNION ALL
    SELECT payment_method source,id,payment_date,
      CASE payment_method WHEN 'company_direct' THEN 'دفعة مباشرة للشركة' ELSE 'دفعة كاش مستلمة' END description,
      0 debit,amount credit,reference_no,NULL,NULL,NULL,created_at,transfer_status,transfer_image_url
    FROM rental_payments WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))
    UNION ALL
    SELECT 'statement_adjustment' source,id,entry_date,'زيادة خاصة بهذا الكشف' description,
      amount debit,0 credit,NULL,NULL,NULL,NULL,created_at,NULL,NULL
    FROM rental_statement_adjustments
    WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND adjustment_type='statement'
  `).all(customer.name, customer.name, customer.name) as Array<Record<string, unknown> & {
    id: number; source: string; entry_date: string; created_at: string;
  }>;

  const statementTrips = trips.map(trip => ({
    source: "trip",
    id: trip.id,
    entry_date: trip.date,
    description: `رد إيجار رقم ${trip.id}`,
    debit: adjustments.get(trip.id) ?? Number(trip.base_total || 0),
    credit: 0,
    reference_no: trip.car_id,
    loading_region: trip.loading_region,
    unloading_region: trip.unloading_region,
    trips_count: trip.trips_count,
    created_at: trip.created_at,
  }));
  const statementEntries = [...statementTrips, ...entries].sort((left, right) =>
    String(left.entry_date).localeCompare(String(right.entry_date)) ||
    String(left.created_at).localeCompare(String(right.created_at)) ||
    Number(left.id) - Number(right.id)
  );
  const balance = statementEntries.reduce(
    (total, entry) => total + Number(entry.debit || 0) - Number(entry.credit || 0), 0
  );

  const templates = trips.map(trip => ({
    loading_region: trip.loading_region,
    unloading_region: trip.unloading_region,
    cargo_type: trip.material_type,
    price: (adjustments.get(trip.id) ?? Number(trip.base_total || 0)) /
      Math.max(1, Number(trip.trips_count) || 1),
    source_trip_id: trip.id,
  }));

  const requests = db.prepare(`
    SELECT id,source_trip_id,loading_region,unloading_region,cargo_type,price,status,notes,created_at
    FROM rental_trip_requests WHERE customer_id=? ORDER BY created_at DESC,id DESC
  `).all(customer.id);
  const transfers = db.prepare(`
    SELECT id,payment_date,amount,reference_no,notes,transfer_image_url,transfer_status,created_at
    FROM rental_payments WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))
      AND submitted_by_user_id=? AND transfer_status IS NOT NULL
    ORDER BY payment_date DESC,id DESC
  `).all(customer.name, (res.locals.portalUser as PortalUser).id);
  res.json({
    customer,
    entries: statementEntries,
    trips: trips.map(trip => ({
      id: trip.id,
      date: trip.date,
      car_id: trip.car_id,
      vehicle_type: trip.vehicle_type,
      driver_name: trip.driver_name,
      cargo_type: trip.material_type,
      loading_region: trip.loading_region,
      unloading_region: trip.unloading_region,
      trips_count: trip.trips_count,
      image_url: trip.image_url,
      permit_image_url: trip.permit_image_url,
      fsohat_image_url: trip.fsohat_image_url,
      price: adjustments.get(trip.id) ?? Number(trip.base_total || 0),
    })),
    templates,
    requests,
    transfers,
    balance,
  });
});

router.post("/rental-trip-portal/requests", (req, res) => {
  const customer = res.locals.portalCustomer as PortalCustomer;
  const sourceTripId = Number(req.body?.source_trip_id);
  if (!Number.isSafeInteger(sourceTripId) || sourceTripId <= 0) {
    return void res.status(400).json({ error: "الرحلة المصدر غير صحيحة" });
  }
  const trip = db.prepare(`
    SELECT id,loading_region,unloading_region,material_type,COALESCE(trips_count,1) trips_count,
      COALESCE(return_value_no_vat,total_amount,0) base_total
    FROM trips WHERE id=? AND LOWER(TRIM(client_name))=LOWER(TRIM(?))
      AND COALESCE(customer_type_snapshot,'rental')='rental'
  `).get(sourceTripId, customer.name) as {
    id: number; loading_region: string | null; unloading_region: string | null; trips_count: number;
    material_type: string | null; base_total: number;
  } | undefined;
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة ضمن حسابك" });
  const adjusted = db.prepare(`
    SELECT amount FROM rental_statement_adjustments
    WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND adjustment_type='reply' AND trip_id=?
  `).get(customer.name, trip.id) as { amount: number } | undefined;
  const result = db.prepare(`
    INSERT INTO rental_trip_requests
      (customer_id,source_trip_id,loading_region,unloading_region,cargo_type,price,status,notes)
    VALUES(?,?,?,?,?,?,'pending',?)
  `).run(
    customer.id, trip.id, trip.loading_region, trip.unloading_region, trip.material_type,
    (adjusted?.amount ?? trip.base_total) / Math.max(1, Number(trip.trips_count) || 1),
    text(req.body?.notes) || null,
  );
  res.status(201).json(db.prepare(`
    SELECT id,source_trip_id,loading_region,unloading_region,cargo_type,price,status,notes,created_at
    FROM rental_trip_requests WHERE id=?
  `).get(result.lastInsertRowid));
});

async function validateTransferImage(
  value: unknown,
  userId: number,
  allowTransferId?: number,
): Promise<string | null> {
  const supplied = text(value);
  if (!supplied) return null;
  let normalized: string;
  try {
    normalized = objectStorage.normalizeObjectEntityPath(supplied);
    if (!normalized.startsWith("/objects/") || normalized.includes("?") || normalized.includes("#") ||
        normalized.split("/").some(segment => segment === "." || segment === "..")) return null;
    const file = await objectStorage.getObjectEntityFile(normalized);
    const [metadata] = await file.getMetadata();
    const type = String(metadata.contentType || "").toLowerCase();
    const size = Number(metadata.size);
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type) ||
        !Number.isFinite(size) || size <= 0 || size > 10 * 1024 * 1024) return null;
    const variants = receiptPathVariants(normalized);
    const placeholders = variants.map(() => "?").join(",");
    const usedByAnotherCustomer = db.prepare(`
      SELECT id FROM rental_payments
      WHERE transfer_image_url IN (${placeholders}) AND (
        submitted_by_user_id IS NULL OR submitted_by_user_id<>? OR
        LOWER(TRIM(customer_name))<>LOWER(TRIM(?))
      )
        AND (? IS NULL OR id<>?)
      LIMIT 1
    `).get(...variants, userId, (db.prepare("SELECT name FROM rental_customers WHERE portal_user_id=? AND active=1 AND customer_type='rental'").get(userId) as { name: string } | undefined)?.name ?? "", allowTransferId ?? null, allowTransferId ?? null);
    const registeredToAnotherUser = db.prepare(
      `SELECT path FROM rental_receipt_objects WHERE path IN (${placeholders}) AND owner_user_id<>?`
    ).get(...variants, userId);
    if (usedByAnotherCustomer || registeredToAnotherUser) return null;
    return normalized;
  } catch {
    return null;
  }
}

function registerReceiptPath(path: string, userId: number, customerName: string) {
  const objectPath = existingReceiptObjectPath(path) ?? (path.startsWith("/objects/") ? path : null);
  if (!objectPath) return;
  const variants = receiptPathVariants(objectPath);
  const placeholders = variants.map(() => "?").join(",");
  const registered = db.prepare(`SELECT owner_user_id FROM rental_receipt_objects WHERE path IN (${placeholders}) LIMIT 1`).get(...variants) as
    { owner_user_id: number } | undefined;
  if (registered && registered.owner_user_id !== userId) throw new Error("صورة التحويل مرتبطة بحساب آخر");
  const usedByAnotherCustomer = db.prepare(`
    SELECT id FROM rental_payments
    WHERE transfer_image_url IN (${placeholders}) AND (
      submitted_by_user_id IS NULL OR submitted_by_user_id<>? OR
      LOWER(TRIM(customer_name))<>LOWER(TRIM(?))
    )
    LIMIT 1
  `).get(...variants, userId, customerName);
  if (usedByAnotherCustomer) throw new Error("صورة التحويل مرتبطة بحساب آخر");
  db.prepare("INSERT OR IGNORE INTO rental_receipt_objects(path,owner_user_id) VALUES(?,?)").run(objectPath, userId);
}

function existingReceiptObjectPath(value: string | null) {
  const path = text(value);
  if (path.startsWith("/objects/")) return path;
  if (path.startsWith("/api/storage/objects/")) return path.slice("/api/storage".length);
  return null;
}

router.post("/rental-trip-portal/transfers", async (req, res) => {
  const customer = res.locals.portalCustomer as PortalCustomer;
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    return void res.status(400).json({ error: "مبلغ التحويل غير صحيح" });
  }
  const imagePath = await validateTransferImage(req.body?.image_url, (res.locals.portalUser as PortalUser).id);
  if (!imagePath) return void res.status(400).json({ error: "صورة التحويل غير صالحة أو غير موجودة" });
  const user = res.locals.portalUser as PortalUser;
  let transferId: number;
  try {
    transferId = db.transaction(() => {
      registerReceiptPath(imagePath, user.id, customer.name);
      const result = db.prepare(`
        INSERT INTO rental_payments
          (customer_name,payment_date,amount,payment_method,transfer_image_url,transfer_status,submitted_by_user_id,created_by)
        VALUES(?,? ,?,'company_direct',?,'pending',?,?)
      `).run(customer.name, today(), amount, imagePath, user.id, user.name);
      return Number(result.lastInsertRowid);
    })();
  } catch (error) {
    return void res.status(409).json({ error: (error as Error).message || "تعذر ربط صورة التحويل بحسابك" });
  }
  res.status(201).json(db.prepare(`
    SELECT id,payment_date,amount,reference_no,notes,transfer_image_url,transfer_status,created_at
    FROM rental_payments WHERE id=?
  `).get(transferId));
});

router.put("/rental-trip-portal/transfers/:id", async (req, res) => {
  const customer = res.locals.portalCustomer as PortalCustomer;
  const user = res.locals.portalUser as PortalUser;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return void res.status(400).json({ error: "رقم التحويل غير صحيح" });
  const transfer = db.prepare(`
    SELECT id,amount,transfer_image_url,transfer_status FROM rental_payments
    WHERE id=? AND LOWER(TRIM(customer_name))=LOWER(TRIM(?))
      AND submitted_by_user_id=? AND transfer_status IS NOT NULL
  `).get(id, customer.name, user.id) as {
    id: number; amount: number; transfer_image_url: string | null; transfer_status: string;
  } | undefined;
  if (!transfer) return void res.status(404).json({ error: "التحويل غير موجود" });
  if (transfer.transfer_status !== "pending") return void res.status(409).json({ error: "لا يمكن تعديل تحويل تم تأكيده" });

  const hasAmount = Object.prototype.hasOwnProperty.call(req.body ?? {}, "amount");
  const hasImage = Object.prototype.hasOwnProperty.call(req.body ?? {}, "image_url");
  if (!hasAmount && !hasImage) return void res.status(400).json({ error: "أدخل مبلغًا أو صورة جديدة" });
  const amount = hasAmount ? Number(req.body.amount) : Number(transfer.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    return void res.status(400).json({ error: "مبلغ التحويل غير صحيح" });
  }
  const imagePath = hasImage
    ? await validateTransferImage(req.body.image_url, user.id, id)
    : transfer.transfer_image_url;
  if (!imagePath) return void res.status(400).json({ error: "صورة التحويل غير صالحة أو غير موجودة" });
  let update: { changes: number };
  try {
    update = db.transaction(() => {
      const previousImagePath = hasImage ? existingReceiptObjectPath(transfer.transfer_image_url) : null;
      if (previousImagePath && previousImagePath !== imagePath) {
        registerReceiptPath(previousImagePath, user.id, customer.name);
      }
      registerReceiptPath(imagePath, user.id, customer.name);
      const result = db.prepare(`
        UPDATE rental_payments SET amount=?,transfer_image_url=?
        WHERE id=? AND submitted_by_user_id=? AND transfer_status='pending'
      `).run(amount, imagePath, id, user.id);
      if (!result.changes) throw new Error("لا يمكن تعديل تحويل تم تأكيده");
      return result;
    })();
  } catch (error) {
    return void res.status(409).json({ error: (error as Error).message || "تعذر ربط صورة التحويل بحسابك" });
  }
  if (!update.changes) return void res.status(409).json({ error: "لا يمكن تعديل تحويل تم تأكيده" });
  res.json(db.prepare(`
    SELECT id,payment_date,amount,reference_no,notes,transfer_image_url,transfer_status,created_at
    FROM rental_payments WHERE id=?
  `).get(id));
});

router.delete("/rental-trip-portal/transfers/:id", (req, res) => {
  const customer = res.locals.portalCustomer as PortalCustomer;
  const user = res.locals.portalUser as PortalUser;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return void res.status(400).json({ error: "رقم التحويل غير صحيح" });
  const transfer = db.prepare(`
    SELECT id,transfer_status FROM rental_payments
    WHERE id=? AND LOWER(TRIM(customer_name))=LOWER(TRIM(?))
      AND submitted_by_user_id=? AND transfer_status IS NOT NULL
  `).get(id, customer.name, user.id) as { id: number; transfer_status: string } | undefined;
  if (!transfer) return void res.status(404).json({ error: "التحويل غير موجود" });
  if (transfer.transfer_status !== "pending") return void res.status(409).json({ error: "لا يمكن حذف تحويل تم تأكيده" });
  let deletion: { changes: number };
  try {
    deletion = db.transaction(() => {
      const imagePath = db.prepare("SELECT transfer_image_url FROM rental_payments WHERE id=?")
        .get(id) as { transfer_image_url: string | null } | undefined;
      const receiptObjectPath = existingReceiptObjectPath(imagePath?.transfer_image_url ?? null);
      if (receiptObjectPath) registerReceiptPath(receiptObjectPath, user.id, customer.name);
      return db.prepare(`
        DELETE FROM rental_payments
        WHERE id=? AND submitted_by_user_id=? AND transfer_status='pending'
      `).run(id, user.id);
    })();
  } catch (error) {
    return void res.status(409).json({ error: (error as Error).message || "تعذر حذف التحويل" });
  }
  if (!deletion.changes) return void res.status(409).json({ error: "لا يمكن حذف تحويل تم تأكيده" });
  res.json({ deleted: true });
});

export default router;