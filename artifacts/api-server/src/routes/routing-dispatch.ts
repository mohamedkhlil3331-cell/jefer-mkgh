import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import { execute, executeBatch, queryAll, queryOne } from "../lib/erp-sql.js";
import { isSysAdminToken } from "./auth.js";
import { finalizeDisabledWarehouseRoutingRequest } from "./supply-requests.js";
import { deletePendingRoutingTripLog, syncRoutingTripLog } from "./routing-trip-log.js";
import { r2MulterStorage, uniqueUploadName } from "../lib/r2-storage.js";

const router = Router();

async function requireRoutingSupervisor(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (await isSysAdminToken(token)) return next();
  const user = await queryOne<{ role: string }>(`
    SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
  `, token);
  if (!user) return void res.status(401).json({ error: "جلسة الدخول غير صالحة" });
  if (!["admin", "supervisor"].includes(user.role)) {
    return void res.status(403).json({ error: "صلاحيات مشرف النقليات مطلوبة" });
  }
  next();
}
const permitUpload = multer({
  storage: r2MulterStorage(name => uniqueUploadName("routing-permit-", name)),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function validatePermitImageUrl(raw: unknown): string | null | false {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || raw.includes("%") || raw.includes("\\") || raw.includes("?") || raw.includes("#")) return false;

  const objectPrefix = "/api/storage/objects/";
  if (raw.startsWith(objectPrefix)) {
    const objectKey = raw.slice(objectPrefix.length);
    const segments = objectKey.split("/");
    if (!objectKey || !/^[A-Za-z0-9._/-]+$/.test(objectKey) || segments.some(segment => !segment || segment === "." || segment === "..")) {
      return false;
    }
    return raw;
  }

  const uploadsPrefix = "/api/uploads/";
  if (!raw.startsWith(uploadsPrefix)) return false;
  const filename = raw.slice(uploadsPrefix.length);
  if (!filename || filename === "." || filename === ".." || path.basename(filename) !== filename) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) return false;
  return raw;
}

type RoutingCargoItem = {
  product_id: number | null;
  cargo_type: string;
  quantity: number;
  unit: string;
};
type RoutingAttachment = {
  kind: "supervisor_permit" | "fsohat_permit" | "driver_invoice";
  url: string;
  file_name: string;
  sort_order: number;
};

async function parseCargoItems(raw: unknown): Promise<RoutingCargoItem[] | false> {
  if (raw == null || raw === "") return [];
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return false; }
  }
  if (!Array.isArray(value) || value.length > 20) return false;
  const items: RoutingCargoItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return false;
    const requestedName = typeof entry.cargo_type === "string" ? entry.cargo_type.trim() : "";
    const quantity = Number(entry.quantity);
    if (!requestedName || requestedName.length > 120 || !Number.isFinite(quantity) || quantity <= 0) return false;
    const hasProductId = entry.product_id != null && entry.product_id !== "";
    const productId = hasProductId ? Number(entry.product_id) : null;
    if (hasProductId && (!Number.isSafeInteger(productId) || Number(productId) <= 0)) return false;
    const product = productId == null ? undefined : await queryOne<{ id: number; name: string; unit: string | null }>(
      "SELECT id, name, unit FROM products WHERE id=? AND active=1", productId,
    );
    if (productId != null && !product) return false;
    if (productId != null && !Number.isSafeInteger(quantity)) return false;
    const cargoType = product?.name || requestedName;
    if (items.some(item =>
      (productId != null && item.product_id === productId) ||
      item.cargo_type.toLocaleLowerCase() === cargoType.toLocaleLowerCase()
    )) return false;
    items.push({
      product_id: product?.id ?? null,
      cargo_type: cargoType,
      quantity,
      unit: product?.unit || (typeof entry.unit === "string" && entry.unit.trim() ? entry.unit.trim() : "حبة"),
    });
  }
  return items;
}

function parsePermitAttachments(raw: unknown, fallbackUrl: string | null, originalName?: string): RoutingAttachment[] | false {
  if (raw == null || raw === "") {
    return fallbackUrl
      ? [{ kind: "supervisor_permit", url: fallbackUrl, file_name: originalName || "", sort_order: 0 }]
      : [];
  }
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return false; }
  }
  if (!Array.isArray(value) || value.length > 20) return false;
  const attachments: RoutingAttachment[] = [];
  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== "object") return false;
    const url = validatePermitImageUrl(entry.url);
    const fileName = typeof entry.file_name === "string" ? entry.file_name.trim() : "";
    if (!url || fileName.length > 255) return false;
    attachments.push({ kind: "supervisor_permit", url, file_name: fileName, sort_order: index });
  }
  return attachments;
}

function parseDispatchLocation(nameRaw: unknown, urlRaw: unknown):
  { name: string; url: string } | null | false {
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const url = typeof urlRaw === "string" ? urlRaw.trim() : "";
  if (!name && !url) return null;
  if (!name || !url || name.length > 100 || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return false;
    return { name, url };
  } catch { return false; }
}

async function notify(userPhone: string, title: string, body: string) {
  try {
    await execute("INSERT INTO notifications (user_phone, title, body) VALUES (?,?,?)", userPhone, title, body);
  } catch {}
}

router.get("/routing-dispatches", async (_req, res) => {
  res.json(await queryAll("SELECT * FROM routing_dispatches ORDER BY created_at DESC LIMIT 200"));
});

router.post("/routing-dispatches", requireRoutingSupervisor, permitUpload.single("permit_image"), async (req, res) => {
  const {
    tariff_id, loading_place, unloading_place, driver_expense, rental,
    vehicle_plates, route_type, created_by, notes,
    customer_name, customer_type, rep_name, rep_phone, cargo_type,
    override_loading_place, override_unloading_place, client_request_id,
  } = req.body as Record<string, unknown>;

  // Overrides affect operational branch/labels, while tariff values remain immutable trip-log snapshots.
  const effectiveLoading   = (override_loading_place   && String(override_loading_place).trim())   || loading_place;
  const effectiveUnloading = (override_unloading_place && String(override_unloading_place).trim()) || unloading_place;

  if (!effectiveLoading || !effectiveUnloading || !vehicle_plates) {
    return void res.status(400).json({ error: "بيانات ناقصة" });
  }

  let plates: string[];
  try {
    const parsedPlates = Array.isArray(vehicle_plates) ? vehicle_plates : JSON.parse(String(vehicle_plates) || "[]");
    if (!Array.isArray(parsedPlates)) throw new Error("vehicle_plates must be an array");
    plates = parsedPlates.map(String).map(plate => plate.trim()).filter(Boolean);
  } catch {
    return void res.status(400).json({ error: "قائمة السيارات غير صالحة" });
  }
  if (!tariff_id) return void res.status(400).json({ error: "التعريفة مطلوبة" });
  if (plates.length === 0) return void res.status(400).json({ error: "لا توجد سيارات محددة" });
  const clientRequestId = typeof client_request_id === "string" ? client_request_id.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(clientRequestId)) {
    return void res.status(400).json({ error: "معرّف طلب التوجيه غير صالح" });
  }
  if (customer_type != null && customer_type !== "" && customer_type !== "rental" && customer_type !== "company") {
    return void res.status(400).json({ error: "تصنيف العميل غير صالح" });
  }
  const permitImageUrl = req.file
    ? `/api/uploads/${req.file.filename}`
    : validatePermitImageUrl(req.body.permit_image_url);
  if (permitImageUrl === false) return void res.status(400).json({ error: "مسار صورة التصريح غير صالح" });
  const cargoItems = await parseCargoItems(req.body.cargo_items);
  if (cargoItems === false) return void res.status(400).json({ error: "قائمة أنواع الحمولة والكميات غير صالحة" });
  const permitAttachments = parsePermitAttachments(
    req.body.permit_images,
    permitImageUrl || null,
    req.file?.originalname,
  );
  if (permitAttachments === false) return void res.status(400).json({ error: "قائمة ملفات التصريح غير صالحة" });
  const firstCargoType = cargoItems[0]?.cargo_type
    || (typeof cargo_type === "string" ? cargo_type.trim() : "");
  const cargoItemsJson = cargoItems.length ? JSON.stringify(cargoItems) : null;
  const attachmentsJson = permitAttachments.length ? JSON.stringify(permitAttachments) : null;
  const firstPermitImageUrl = permitAttachments[0]?.url || permitImageUrl || null;
  const loadingLocation = parseDispatchLocation(req.body.loading_location_name, req.body.loading_location_url);
  const unloadingLocation = parseDispatchLocation(req.body.unloading_location_name, req.body.unloading_location_url);
  if (loadingLocation === false || unloadingLocation === false)
    return void res.status(400).json({ error: "اسم ورابط لوكيشن التحميل والتنزيل مطلوبان معًا، ويجب أن يبدأ الرابط بـ https أو http" });

  const existingDispatch = await queryOne<{ id: number }>(
    "SELECT id FROM routing_dispatches WHERE client_request_id=?", clientRequestId,
  );
  if (existingDispatch) {
    return void res.json({ id: existingDispatch.id, message: "تم إرسال التوجيه بنجاح", existing: true });
  }

  const destWarehouse = await queryOne<{ id: number }>(
    "SELECT id FROM warehouses WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1", String(effectiveUnloading),
  );
  const warehouseId = destWarehouse?.id ?? null;
  const vehicleRows = await queryAll<{
    plate_number: string; driver_name: string | null; driver_phone: string | null; linked_user_phone: string | null;
  }>(
    `SELECT plate_number, driver_name, driver_phone, linked_user_phone
     FROM fleet_vehicles WHERE plate_number IN (${plates.map(() => "?").join(",")})`,
    ...plates,
  );
  const vehicleByPlate = new Map(vehicleRows.map(vehicle => [vehicle.plate_number, vehicle]));
  const fsohatUsers = route_type === "via_fusahat"
    ? await queryAll<{ phone: string }>("SELECT phone FROM users WHERE role IN ('fsohat','admin') AND active=1")
    : [];
  const routeLabel = `${effectiveLoading} ← ${effectiveUnloading}`;
  const reqNotes = [
    route_type === "via_fusahat" ? "توجيه من مشرف النقليات" : "توجيه مباشر من مشرف النقليات",
    tariff_id ? `رقم التعريفة: ${tariff_id}` : null,
    notes ? String(notes) : null,
  ].filter(Boolean).join(" | ");
  const statements = [{
    sql: `
      INSERT INTO routing_dispatches
        (tariff_id, loading_place, unloading_place, driver_expense, rental, vehicle_plates,
         route_type, created_by, notes, customer_name, rep_name,
         override_loading_place, override_unloading_place, tariff_loading_place,
         tariff_unloading_place, customer_type, rep_phone, cargo_type, permit_image_url, client_request_id,
         loading_location_name, loading_location_url, unloading_location_name, unloading_location_url)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
    params: [
      tariff_id ?? null, effectiveLoading, effectiveUnloading, Number(driver_expense) || 0,
      Number(rental) || 0, JSON.stringify(plates), route_type === "via_fusahat" ? "via_fusahat" : "direct",
      created_by ?? null, notes ?? null, customer_name ? String(customer_name).trim() : null,
      rep_name ? String(rep_name).trim() : null,
      override_loading_place ? String(override_loading_place).trim() : null,
      override_unloading_place ? String(override_unloading_place).trim() : null,
      loading_place ? String(loading_place).trim() : null, unloading_place ? String(unloading_place).trim() : null,
      customer_type || null, rep_phone ? String(rep_phone).trim() : null, firstCargoType || null,
      firstPermitImageUrl, clientRequestId, loadingLocation?.name ?? null, loadingLocation?.url ?? null,
      unloadingLocation?.name ?? null, unloadingLocation?.url ?? null,
    ],
  }, {
    sql: `
      INSERT INTO supply_requests
        (product_name, warehouse_name, destination_division, warehouse_id,
         requested_qty, unit, trailer_loads, status, priority, requested_by, notes,
         routing_dispatch_id, driver_expense, rental, cargo_type, customer_name,
         customer_type, rep_name, rep_phone, permit_image_url)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,
         (SELECT id FROM routing_dispatches WHERE client_request_id=?),
         ?,?,?,?,?,?,?,?)
    `,
    params: [
      routeLabel, String(effectiveLoading), String(effectiveUnloading), warehouseId,
      plates.length, "مركبة", plates.length,
      route_type === "via_fusahat" ? "assigned" : "in_transit", "high",
      created_by ? String(created_by) : null, reqNotes, clientRequestId,
      Number(driver_expense) || 0, Number(rental) || 0, firstCargoType || null,
      customer_name ? String(customer_name).trim() : null, customer_type || null,
      rep_name ? String(rep_name).trim() : null, rep_phone ? String(rep_phone).trim() : null,
      firstPermitImageUrl,
    ],
  }];
  const childStatus = route_type === "via_fusahat" ? "assigned" : "in_transit";
  for (const plate of plates) {
    const vehicle = vehicleByPlate.get(plate);
    const phone = vehicle?.driver_phone ?? vehicle?.linked_user_phone ?? null;
    statements.push({
      sql: `
        INSERT INTO supply_request_trips
          (supply_request_id, vehicle_plate, driver_name, driver_phone, status, permit_image_url,
           cargo_items_json, attachments_json)
        SELECT id, ?, ?, ?, ?, ?, ?, ?
        FROM supply_requests
        WHERE routing_dispatch_id=(SELECT id FROM routing_dispatches WHERE client_request_id=?)
      `,
      params: [
        plate, vehicle?.driver_name ?? null, phone, childStatus, firstPermitImageUrl,
        cargoItemsJson, attachmentsJson, clientRequestId,
      ],
    });
  }
  let dispatchId: number;
  try {
    await executeBatch(statements);
    const createdDispatch = await queryOne<{ id: number }>(
      "SELECT id FROM routing_dispatches WHERE client_request_id=?", clientRequestId,
    );
    if (!createdDispatch) throw new Error("تعذر حفظ التوجيه");
    dispatchId = createdDispatch.id;
  } catch (error) {
    const duplicate = await queryOne<{ id: number }>(
      "SELECT id FROM routing_dispatches WHERE client_request_id=?", clientRequestId,
    );
    if (duplicate) return void res.json({ id: duplicate.id, message: "تم إرسال التوجيه بنجاح", existing: true });
    throw error;
  }
  const createdTrips = await queryAll<{ id: number }>(`
    SELECT t.id
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id=t.supply_request_id
    WHERE sr.routing_dispatch_id=?
    ORDER BY t.id
  `, dispatchId);
  if (createdTrips.length !== plates.length) throw new Error("لم يتم إنشاء رحلات جميع المركبات");
  const createdTripIds = createdTrips.map(trip => trip.id);
  const pendingNotifications: Array<{ phone: string; title: string; body: string }> = [];
  if (route_type === "via_fusahat") {
    const platesStr = plates.join("، ");
    for (const user of fsohatUsers) pendingNotifications.push({
      phone: user.phone,
      title: "توجيه جديد — يحتاج فسوحات",
      body: `مسار: ${routeLabel} | السيارات: ${platesStr}`,
    });
  } else {
    for (const plate of plates) {
      const phone = vehicleByPlate.get(plate)?.driver_phone ?? vehicleByPlate.get(plate)?.linked_user_phone ?? null;
      if (phone) pendingNotifications.push({
        phone,
        title: "توجيه جديد مباشر 🚛",
        body: `مسار: ${routeLabel} | البونص: ${Number(driver_expense)||0} | الإيجار: ${Number(rental)||0}`,
      });
    }
  }
  for (const childId of createdTripIds) {
    await syncRoutingTripLog(childId, { createIfMissing: true });
  }
  for (const notification of pendingNotifications) {
    await notify(notification.phone, notification.title, notification.body);
  }
  res.json({ id: dispatchId, message: "تم إرسال التوجيه بنجاح" });
});

/* ── GET all routing-dispatch trips ──────────────────────────────────────── */
router.get("/routing-dispatch-trips", async (_req, res) => {
  const rows = await queryAll<Record<string, unknown>>(
    `
    SELECT t.id, t.supply_request_id, t.vehicle_plate, t.driver_name, t.driver_phone,
           t.status, t.created_at, t.delivered_at, t.cargo_items_json,
           sr.product_name, sr.warehouse_name, sr.destination_division,
            sr.routing_dispatch_id, sr.driver_expense, sr.rental, sr.notes AS sr_notes,
            sr.requested_by, sr.warehouse_id,
            d.tariff_id, d.tariff_loading_place, d.tariff_unloading_place,
            d.loading_place, d.unloading_place, d.override_loading_place, d.override_unloading_place,
            d.customer_name, d.customer_type, d.rep_name, d.rep_phone, d.cargo_type,
             d.permit_image_url, d.route_type,
             d.loading_location_name, d.loading_location_url,
             d.unloading_location_name, d.unloading_location_url
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id = t.supply_request_id
    JOIN routing_dispatches d ON d.id = sr.routing_dispatch_id
    WHERE sr.routing_dispatch_id IS NOT NULL
    ORDER BY t.created_at DESC
    LIMIT 500
  `);
  res.json(rows.map(row => {
    let cargoItems: unknown[] = [];
    try {
      const parsed = JSON.parse(String(row.cargo_items_json || "[]"));
      if (Array.isArray(parsed)) cargoItems = parsed;
    } catch {}
    const { cargo_items_json: _cargoItemsJson, ...trip } = row;
    return { ...trip, cargo_items: cargoItems };
  }));
});

/* ── Cancel a routing-dispatch trip ─────────────────────────────────────── */
router.put("/routing-dispatch-trips/:id/cancel", requireRoutingSupervisor, async (req, res) => {
  const trip = await queryOne<{
    vehicle_plate: string | null; supply_request_id: number; warehouse_id: number | null; routing_dispatch_id: number | null;
  }>(`
    SELECT t.vehicle_plate, t.supply_request_id, sr.warehouse_id, sr.routing_dispatch_id
    FROM supply_request_trips t JOIN supply_requests sr ON sr.id=t.supply_request_id
    WHERE t.id=?
  `, req.params.id);
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  let shouldFinalizeRequest = false;
  await execute(`
    UPDATE supply_request_trips SET status='cancelled', updated_at=datetime('now')
    WHERE id=? AND status NOT IN ('completed','cancelled','rejected')
  `, req.params.id);
  const remaining = await queryOne<{ total: number; done: number; delivered: number }>(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status IN ('completed','cancelled','rejected','delivered_to_warehouse','pending_warehouse_approval') THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN status IN ('completed','delivered_to_warehouse','pending_warehouse_approval') THEN 1 ELSE 0 END) AS delivered
    FROM supply_request_trips WHERE supply_request_id=?
  `, trip.supply_request_id);
  if (remaining && remaining.total > 0 && remaining.total === remaining.done) {
    const status = remaining.delivered === 0
      ? "cancelled"
      : trip.warehouse_id ? "delivered_to_warehouse" : "completed";
    await execute("UPDATE supply_requests SET status=?, updated_at=datetime('now') WHERE id=? AND status NOT IN ('completed','cancelled')",
      status, trip.supply_request_id);
    if (status === "delivered_to_warehouse") {
      shouldFinalizeRequest = true;
    }
  }
  await syncRoutingTripLog(Number(req.params.id));
  if (shouldFinalizeRequest) await finalizeDisabledWarehouseRoutingRequest(trip.supply_request_id);

  if (trip?.vehicle_plate) {
    try {
      await execute("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?", trip.vehicle_plate);
    } catch {}
  }
  res.json({ message: "تم إلغاء الرحلة" });
});

/* ── Hard-delete a routing-dispatch trip ────────────────────────────────── */
router.delete("/routing-dispatch-trips/:id", async (req, res) => {
  const trip = await queryOne<{ vehicle_plate: string | null; status: string }>(
    "SELECT vehicle_plate, status FROM supply_request_trips WHERE id=?"
  , req.params.id);

  await deletePendingRoutingTripLog(Number(req.params.id));
  await execute("DELETE FROM supply_request_trips WHERE id=?", req.params.id);

  if (trip?.vehicle_plate && !["completed","cancelled","delivered_to_warehouse"].includes(trip.status ?? "")) {
    try {
      await execute("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?", trip.vehicle_plate);
    } catch {}
  }
  res.json({ message: "تم حذف الرحلة" });
});

/* Shared routing fields belong to the dispatch; vehicle/driver belong to one trip. */
router.put("/routing-dispatch-trips/:id", requireRoutingSupervisor, async (req, res) => {
  const trip = await queryOne<{
    id: number; status: string; supply_request_id: number; vehicle_plate: string | null;
    routing_dispatch_id: number; route_type: string;
  }>(`
    SELECT t.id, t.status, t.supply_request_id, t.vehicle_plate,
           sr.routing_dispatch_id, d.route_type
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id=t.supply_request_id
    JOIN routing_dispatches d ON d.id=sr.routing_dispatch_id
    WHERE t.id=?
  `, req.params.id);
  if (!trip) return void res.status(404).json({ error: "رحلة التوجيه غير موجودة" });
  if (["completed", "cancelled", "rejected"].includes(trip.status)) {
    return void res.status(409).json({ error: "لا يمكن تعديل رحلة مكتملة أو ملغاة" });
  }

  const body = req.body as Record<string, unknown>;
  const text = (key: string) => typeof body[key] === "string" ? String(body[key]).trim() : "";
  const parsedCargoItems = body.cargo_items === undefined ? null : await parseCargoItems(body.cargo_items);
  if (parsedCargoItems === false) return void res.status(400).json({ error: "قائمة المنتجات والكميات غير صالحة" });
  const cargoType = parsedCargoItems
    ? parsedCargoItems[0]?.cargo_type || ""
    : text("cargo_type");
  const cargoItemsJson = parsedCargoItems
    ? (parsedCargoItems.length ? JSON.stringify(parsedCargoItems) : null)
    : null;
  const plate = text("vehicle_plate");
  const loading = text("loading_place");
  const unloading = text("unloading_place");
  const effectiveLoading = text("override_loading_place") || loading;
  const effectiveUnloading = text("override_unloading_place") || unloading;
  const destination = text("destination_division") || effectiveUnloading;
  const routeType = text("route_type");
  if (!plate || !loading || !unloading || !["direct", "via_fusahat"].includes(routeType)) {
    return void res.status(400).json({ error: "اللوحة والمسار ونوع التوجيه مطلوبة" });
  }
  if (body.customer_type && !["rental", "company"].includes(String(body.customer_type))) {
    return void res.status(400).json({ error: "تصنيف العميل غير صالح" });
  }
  const amounts = [Number(body.driver_expense), Number(body.rental)];
  if (amounts.some(n => !Number.isFinite(n) || n < 0)) {
    return void res.status(400).json({ error: "قيم التعريفة غير صالحة" });
  }
  const tariffId = Number(body.tariff_id);
  if (!Number.isSafeInteger(tariffId) || tariffId <= 0 ||
      !await queryOne("SELECT id FROM tariffs WHERE id=?", tariffId)) {
    return void res.status(400).json({ error: "رقم التعريفة غير صالح" });
  }
  const suppliedWarehouseId = body.warehouse_id == null || body.warehouse_id === "" ? null : Number(body.warehouse_id);
  const matchingWarehouse = suppliedWarehouseId === null
    ? await queryOne<{ id: number }>("SELECT id FROM warehouses WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) AND active=1 LIMIT 1",
      effectiveUnloading)
    : undefined;
  const warehouseId = suppliedWarehouseId ?? matchingWarehouse?.id ?? null;
  if (warehouseId !== null) {
    const selectedWarehouse = Number.isSafeInteger(warehouseId) && warehouseId > 0
      ? await queryOne<{ name: string }>("SELECT name FROM warehouses WHERE id=? AND active=1", warehouseId)
      : undefined;
    if (!selectedWarehouse) {
      return void res.status(400).json({ error: "المستودع المحدد غير موجود" });
    }
    if (selectedWarehouse.name.trim().toLocaleLowerCase() !== effectiveUnloading.toLocaleLowerCase()) {
      return void res.status(400).json({ error: "المستودع المحدد لا يطابق مكان التنزيل الجديد" });
    }
  }
  const permitUrl = body.permit_image_url === undefined ? undefined : validatePermitImageUrl(body.permit_image_url);
  if (permitUrl === false) return void res.status(400).json({ error: "رابط صورة الفسح غير صالح" });
  const existingLocations = await queryOne<{
    loading_location_name: string | null; loading_location_url: string | null;
    unloading_location_name: string | null; unloading_location_url: string | null;
  }>(`
    SELECT loading_location_name, loading_location_url, unloading_location_name, unloading_location_url
    FROM routing_dispatches WHERE id=?
  `, trip.routing_dispatch_id);
  if (!existingLocations) return void res.status(404).json({ error: "التوجيه غير موجود" });
  const loadingLocation = parseDispatchLocation(
    body.loading_location_name ?? existingLocations.loading_location_name,
    body.loading_location_url ?? existingLocations.loading_location_url,
  );
  const unloadingLocation = parseDispatchLocation(
    body.unloading_location_name ?? existingLocations.unloading_location_name,
    body.unloading_location_url ?? existingLocations.unloading_location_url,
  );
  if (loadingLocation === false || unloadingLocation === false)
    return void res.status(400).json({ error: "اسم ورابط اللوكيشن مطلوبان معًا، ويجب أن يبدأ الرابط بـ https أو http" });
  const siblingTrips = await queryAll<{ id: number; status: string; vehicle_plate: string | null }>(`
    SELECT id, status, vehicle_plate FROM supply_request_trips WHERE supply_request_id=?
  `, trip.supply_request_id);
  if (routeType !== trip.route_type &&
      siblingTrips.some(t => !["assigned", "in_transit"].includes(t.status))) {
    return void res.status(409).json({ error: "لا يمكن تغيير نوع التوجيه بعد بدء تحميل أو تسليم إحدى سياراته" });
  }
  if (plate !== trip.vehicle_plate) {
    const replacement = await queryOne<{ status: string }>("SELECT status FROM fleet_vehicles WHERE plate_number=?", plate);
    const occupied = await queryOne(`
      SELECT 1 FROM supply_request_trips
      WHERE vehicle_plate=? AND id<>? AND status IN
        ('assigned','in_transit','loaded','delivered_to_warehouse','pending_warehouse_approval')
      LIMIT 1
    `, plate, trip.id);
    if (!replacement || replacement.status !== "available" || occupied) {
      return void res.status(409).json({ error: "السيارة البديلة غير متاحة للتوجيه" });
    }
  }

  const statements: Array<{ sql: string; params?: unknown[] }> = [{
    sql: `
      UPDATE routing_dispatches SET
        tariff_id=?, loading_place=?, unloading_place=?,
        tariff_loading_place=?, tariff_unloading_place=?,
        override_loading_place=?, override_unloading_place=?,
        customer_name=?, customer_type=?, rep_name=?, rep_phone=?, cargo_type=?,
        driver_expense=?, rental=?, notes=?, route_type=?,
        permit_image_url=COALESCE(?,permit_image_url),
        loading_location_name=?, loading_location_url=?,
        unloading_location_name=?, unloading_location_url=?
      WHERE id=?
    `,
    params: [
      tariffId, effectiveLoading, effectiveUnloading, loading, unloading,
      text("override_loading_place") || null, text("override_unloading_place") || null,
      text("customer_name") || null, text("customer_type") || null,
      text("rep_name") || null, text("rep_phone") || null, cargoType || null,
      amounts[0], amounts[1], text("notes") || null, routeType, permitUrl ?? null,
      loadingLocation?.name ?? null, loadingLocation?.url ?? null,
      unloadingLocation?.name ?? null, unloadingLocation?.url ?? null,
      trip.routing_dispatch_id,
    ],
  }, {
    sql: `
      UPDATE supply_requests SET
        product_name=?, warehouse_name=?, destination_division=?, warehouse_id=?,
        driver_expense=?, rental=?, cargo_type=?, customer_name=?, customer_type=?,
        rep_name=?, rep_phone=?, notes=?, permit_image_url=COALESCE(?,permit_image_url),
        updated_at=datetime('now')
      WHERE routing_dispatch_id=?
    `,
    params: [
      text("product_name") || `${effectiveLoading} ← ${effectiveUnloading}`,
      effectiveLoading, destination, warehouseId, amounts[0], amounts[1],
      cargoType || null, text("customer_name") || null, text("customer_type") || null,
      text("rep_name") || null, text("rep_phone") || null, text("notes") || null,
      permitUrl ?? null, trip.routing_dispatch_id,
    ],
  }, {
    sql: `
      UPDATE supply_request_trips SET
        vehicle_plate=?, driver_name=?, driver_phone=?, updated_at=datetime('now')
      WHERE id=?
    `,
    params: [plate, text("driver_name") || null, text("driver_phone") || null, trip.id],
  }];
  if (parsedCargoItems) statements.push({
    sql: `
      UPDATE supply_request_trips SET cargo_items_json=?, updated_at=datetime('now')
      WHERE supply_request_id=? AND status NOT IN ('completed','cancelled','rejected')
    `,
    params: [cargoItemsJson, trip.supply_request_id],
  });
  if (plate !== trip.vehicle_plate) {
    statements.push(
      { sql: "UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?", params: [plate] },
      { sql: "UPDATE driver_profiles SET status='في رحلة' WHERE vehicle_plate=?", params: [plate] },
    );
    if (trip.vehicle_plate) {
      const stillAssigned = await queryOne(`
        SELECT 1 FROM supply_request_trips WHERE vehicle_plate=? AND id<>?
          AND status IN ('assigned','in_transit','loaded','delivered_to_warehouse','pending_warehouse_approval')
        LIMIT 1
      `, trip.vehicle_plate, trip.id);
      const activeOrder = await queryOne(`
        SELECT 1 FROM workflow_orders WHERE vehicle_plate=?
          AND stage IN ('vehicle_assigned','invoiced','loaded','bulker_assignment') LIMIT 1
      `, trip.vehicle_plate);
      if (!stillAssigned && !activeOrder) {
        statements.push(
          { sql: "UPDATE fleet_vehicles SET status='available' WHERE plate_number=?", params: [trip.vehicle_plate] },
          { sql: "UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?", params: [trip.vehicle_plate] },
        );
      }
    }
  }
  if (permitUrl) statements.push({
    sql: `
      UPDATE supply_request_trips SET permit_image_url=?
      WHERE supply_request_id=? AND status NOT IN ('completed','cancelled','rejected')
    `,
    params: [permitUrl, trip.supply_request_id],
  });
  if (routeType !== trip.route_type) {
    const nextTripStatus = routeType === "via_fusahat" ? "assigned" : "in_transit";
    statements.push(
      {
        sql: "UPDATE supply_request_trips SET status=?, updated_at=datetime('now') WHERE supply_request_id=?",
        params: [nextTripStatus, trip.supply_request_id],
      },
      {
        sql: "UPDATE supply_requests SET status=?, updated_at=datetime('now') WHERE routing_dispatch_id=?",
        params: [nextTripStatus, trip.routing_dispatch_id],
      },
    );
  }
  await executeBatch(statements);
  const routingChildrenToSync = await queryAll<{ id: number }>(`
    SELECT id FROM supply_request_trips
    WHERE supply_request_id=? AND status NOT IN ('completed','cancelled','rejected')
  `, trip.supply_request_id);
  const plates = await queryAll<{ vehicle_plate: string | null }>(
    "SELECT vehicle_plate FROM supply_request_trips WHERE supply_request_id=? ORDER BY id",
    trip.supply_request_id,
  );
  await execute(
    "UPDATE routing_dispatches SET vehicle_plates=? WHERE id=?",
    JSON.stringify(plates.map(child => child.vehicle_plate).filter(Boolean)),
    trip.routing_dispatch_id,
  );
  for (const child of routingChildrenToSync) {
    await syncRoutingTripLog(child.id, {
      onlyActive: true,
      refreshDispatchSnapshot: true,
      refreshTrailerSnapshot: child.id === trip.id && plate !== trip.vehicle_plate,
    });
  }
  res.json({ message: "تم تحديث التوجيه والرحلة" });
});

export default router;
