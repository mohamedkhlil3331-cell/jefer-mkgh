import { Router, type Request, type Response, type NextFunction } from "express";
import { execute, queryAll, queryOne } from "../lib/erp-sql.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();
const objectStorage = new ObjectStorageService();
const text = (value: unknown) => String(value ?? "").trim();
const today = () => new Date().toISOString().slice(0, 10);
const receiptPathVariants = (path: string) => [path, `/api/storage${path}`, `/api${path}`];

type PortalUser = { id: number; name: string };
type PortalCustomer = { id: number; name: string; phone: string | null; notes: string | null };

async function requirePortalCustomer(req: Request, res: Response, next: NextFunction) {
  const match = /^Bearer\s+(.+)$/i.exec(text(req.headers.authorization));
  const token = match?.[1]?.trim();
  const user = token
    ? await queryOne<{ id: number; name: string; role: string }>(`
        SELECT u.id,u.name,u.role
        FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
          AND s.rowid=(
            SELECT MAX(s2.rowid) FROM sessions s2
            WHERE s2.user_id=s.user_id AND datetime(s2.expires_at)>datetime('now')
          )
      `, token)
    : undefined;
  if (!user) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (user.role !== "rental_trip_customer") {
    return void res.status(403).json({ error: "هذه الخدمة متاحة لعملاء تأجير الرحلات فقط" });
  }
  const customer = await queryOne<PortalCustomer>(`
    SELECT id,name,phone,notes FROM rental_customers
    WHERE portal_user_id=? AND active=1 AND customer_type='rental'
  `, user.id);
  if (!customer) return void res.status(403).json({ error: "لا يوجد حساب إيجار مرتبط بهذا المستخدم" });
  res.locals.portalUser = { id: user.id, name: user.name } satisfies PortalUser;
  res.locals.portalCustomer = customer;
  next();
}

router.use("/rental-trip-portal", requirePortalCustomer);

async function adjustedTripPrices(customerName: string) {
  const rows = await queryAll<{ trip_id: number; amount: number }>(`
    SELECT trip_id,amount FROM rental_statement_adjustments
    WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND adjustment_type='reply'
  `, customerName);
  return new Map(rows.map(row => [row.trip_id, Number(row.amount)]));
}

async function tripRows(customerName: string) {
  return queryAll<Record<string, unknown> & {
    id: number; date: string; base_total: number; material_type: string | null;
    loading_region: string | null; unloading_region: string | null;
  }>(`
    SELECT id,date,car_id,vehicle_type,driver_name,material_type,loading_region,unloading_region,
      COALESCE(trips_count,1) trips_count,
      COALESCE(return_value_no_vat,total_amount,0) base_total,
      image_url,permit_image_url,fsohat_image_url,created_at
    FROM trips
    WHERE LOWER(TRIM(client_name))=LOWER(TRIM(?))
      AND COALESCE(customer_type_snapshot,'rental')='rental'
    ORDER BY date DESC,created_at DESC,id DESC
  `, customerName);
}

router.get("/rental-trip-portal/me", async (_req, res) => {
  const customer = res.locals.portalCustomer as PortalCustomer;
  const [trips, adjustments, entries, requests, transfers] = await Promise.all([
    tripRows(customer.name),
    adjustedTripPrices(customer.name),
    queryAll<Record<string, unknown> & { id: number; source: string; entry_date: string; created_at: string }>(`
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
    `, customer.name, customer.name, customer.name),
    queryAll(`
      SELECT id,source_trip_id,loading_region,unloading_region,cargo_type,price,status,notes,created_at
      FROM rental_trip_requests WHERE customer_id=? ORDER BY created_at DESC,id DESC
    `, customer.id),
    queryAll(`
      SELECT id,payment_date,amount,reference_no,notes,transfer_image_url,transfer_status,created_at
      FROM rental_payments WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?))
        AND submitted_by_user_id=? AND transfer_status IS NOT NULL
      ORDER BY payment_date DESC,id DESC
    `, customer.name, (res.locals.portalUser as PortalUser).id),
  ]);

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

router.post("/rental-trip-portal/requests", async (req, res) => {
  const customer = res.locals.portalCustomer as PortalCustomer;
  const sourceTripId = Number(req.body?.source_trip_id);
  if (!Number.isSafeInteger(sourceTripId) || sourceTripId <= 0) {
    return void res.status(400).json({ error: "الرحلة المصدر غير صحيحة" });
  }
  const trip = await queryOne<{
    id: number; loading_region: string | null; unloading_region: string | null; trips_count: number;
    material_type: string | null; base_total: number;
  }>(`
    SELECT id,loading_region,unloading_region,material_type,COALESCE(trips_count,1) trips_count,
      COALESCE(return_value_no_vat,total_amount,0) base_total
    FROM trips WHERE id=? AND LOWER(TRIM(client_name))=LOWER(TRIM(?))
      AND COALESCE(customer_type_snapshot,'rental')='rental'
  `, sourceTripId, customer.name);
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة ضمن حسابك" });
  const adjusted = await queryOne<{ amount: number }>(`
    SELECT amount FROM rental_statement_adjustments
    WHERE LOWER(TRIM(customer_name))=LOWER(TRIM(?)) AND adjustment_type='reply' AND trip_id=?
  `, customer.name, trip.id);
  const result = await execute(`
    INSERT INTO rental_trip_requests
      (customer_id,source_trip_id,loading_region,unloading_region,cargo_type,price,status,notes)
    VALUES(?,?,?,?,?,?,'pending',?)
  `,
    customer.id, trip.id, trip.loading_region, trip.unloading_region, trip.material_type,
    (adjusted?.amount ?? trip.base_total) / Math.max(1, Number(trip.trips_count) || 1),
    text(req.body?.notes) || null,
  );
  res.status(201).json(await queryOne(`
    SELECT id,source_trip_id,loading_region,unloading_region,cargo_type,price,status,notes,created_at
    FROM rental_trip_requests WHERE id=?
  `, result.lastInsertRowid));
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
    const customer = await queryOne<{ name: string }>(
      "SELECT name FROM rental_customers WHERE portal_user_id=? AND active=1 AND customer_type='rental'",
      userId,
    );
    const usedByAnotherCustomer = await queryOne(`
      SELECT id FROM rental_payments
      WHERE transfer_image_url IN (${placeholders}) AND (
        submitted_by_user_id IS NULL OR submitted_by_user_id<>? OR
        LOWER(TRIM(customer_name))<>LOWER(TRIM(?))
      )
        AND (? IS NULL OR id<>?)
      LIMIT 1
    `, ...variants, userId, customer?.name ?? "", allowTransferId ?? null, allowTransferId ?? null);
    const registeredToAnotherUser = await queryOne(
      `SELECT path FROM rental_receipt_objects WHERE path IN (${placeholders}) AND owner_user_id<>?`
    , ...variants, userId);
    if (usedByAnotherCustomer || registeredToAnotherUser) return null;
    return normalized;
  } catch {
    return null;
  }
}

async function registerReceiptPath(path: string, userId: number, customerName: string) {
  const objectPath = existingReceiptObjectPath(path) ?? (path.startsWith("/objects/") ? path : null);
  if (!objectPath) return;
  const variants = receiptPathVariants(objectPath);
  const placeholders = variants.map(() => "?").join(",");
  const registered = await queryOne<{ owner_user_id: number }>(
    `SELECT owner_user_id FROM rental_receipt_objects WHERE path IN (${placeholders}) LIMIT 1`,
    ...variants,
  );
  if (registered && registered.owner_user_id !== userId) throw new Error("صورة التحويل مرتبطة بحساب آخر");
  const usedByAnotherCustomer = await queryOne(`
    SELECT id FROM rental_payments
    WHERE transfer_image_url IN (${placeholders}) AND (
      submitted_by_user_id IS NULL OR submitted_by_user_id<>? OR
      LOWER(TRIM(customer_name))<>LOWER(TRIM(?))
    )
    LIMIT 1
  `, ...variants, userId, customerName);
  if (usedByAnotherCustomer) throw new Error("صورة التحويل مرتبطة بحساب آخر");
  await execute("INSERT OR IGNORE INTO rental_receipt_objects(path,owner_user_id) VALUES(?,?)", objectPath, userId);
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
    await registerReceiptPath(imagePath, user.id, customer.name);
    const result = await execute(`
        INSERT INTO rental_payments
          (customer_name,payment_date,amount,payment_method,transfer_image_url,transfer_status,submitted_by_user_id,created_by)
        VALUES(?,? ,?,'company_direct',?,'pending',?,?)
      `, customer.name, today(), amount, imagePath, user.id, user.name);
    transferId = Number(result.lastInsertRowid);
  } catch (error) {
    return void res.status(409).json({ error: (error as Error).message || "تعذر ربط صورة التحويل بحسابك" });
  }
  res.status(201).json(await queryOne(`
    SELECT id,payment_date,amount,reference_no,notes,transfer_image_url,transfer_status,created_at
    FROM rental_payments WHERE id=?
  `, transferId));
});

router.put("/rental-trip-portal/transfers/:id", async (req, res) => {
  const customer = res.locals.portalCustomer as PortalCustomer;
  const user = res.locals.portalUser as PortalUser;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return void res.status(400).json({ error: "رقم التحويل غير صحيح" });
  const transfer = await queryOne<{
    id: number; amount: number; transfer_image_url: string | null; transfer_status: string;
  }>(`
    SELECT id,amount,transfer_image_url,transfer_status FROM rental_payments
    WHERE id=? AND LOWER(TRIM(customer_name))=LOWER(TRIM(?))
      AND submitted_by_user_id=? AND transfer_status IS NOT NULL
  `, id, customer.name, user.id);
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
    const previousImagePath = hasImage ? existingReceiptObjectPath(transfer.transfer_image_url) : null;
    if (previousImagePath && previousImagePath !== imagePath) {
      await registerReceiptPath(previousImagePath, user.id, customer.name);
    }
    await registerReceiptPath(imagePath, user.id, customer.name);
    update = await execute(`
        UPDATE rental_payments SET amount=?,transfer_image_url=?
        WHERE id=? AND submitted_by_user_id=? AND transfer_status='pending'
      `, amount, imagePath, id, user.id);
      if (!update.changes) throw new Error("لا يمكن تعديل تحويل تم تأكيده");
  } catch (error) {
    return void res.status(409).json({ error: (error as Error).message || "تعذر ربط صورة التحويل بحسابك" });
  }
  if (!update.changes) return void res.status(409).json({ error: "لا يمكن تعديل تحويل تم تأكيده" });
  res.json(await queryOne(`
    SELECT id,payment_date,amount,reference_no,notes,transfer_image_url,transfer_status,created_at
    FROM rental_payments WHERE id=?
  `, id));
});

router.delete("/rental-trip-portal/transfers/:id", async (req, res) => {
  const customer = res.locals.portalCustomer as PortalCustomer;
  const user = res.locals.portalUser as PortalUser;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return void res.status(400).json({ error: "رقم التحويل غير صحيح" });
  const transfer = await queryOne<{ id: number; transfer_status: string }>(`
    SELECT id,transfer_status FROM rental_payments
    WHERE id=? AND LOWER(TRIM(customer_name))=LOWER(TRIM(?))
      AND submitted_by_user_id=? AND transfer_status IS NOT NULL
  `, id, customer.name, user.id);
  if (!transfer) return void res.status(404).json({ error: "التحويل غير موجود" });
  if (transfer.transfer_status !== "pending") return void res.status(409).json({ error: "لا يمكن حذف تحويل تم تأكيده" });
  let deletion: { changes: number };
  try {
    const imagePath = await queryOne<{ transfer_image_url: string | null }>(
      "SELECT transfer_image_url FROM rental_payments WHERE id=?",
      id,
    );
    const receiptObjectPath = existingReceiptObjectPath(imagePath?.transfer_image_url ?? null);
    if (receiptObjectPath) await registerReceiptPath(receiptObjectPath, user.id, customer.name);
    deletion = await execute(`
        DELETE FROM rental_payments
        WHERE id=? AND submitted_by_user_id=? AND transfer_status='pending'
      `, id, user.id);
  } catch (error) {
    return void res.status(409).json({ error: (error as Error).message || "تعذر حذف التحويل" });
  }
  if (!deletion.changes) return void res.status(409).json({ error: "لا يمكن حذف تحويل تم تأكيده" });
  res.json({ deleted: true });
});

export default router;