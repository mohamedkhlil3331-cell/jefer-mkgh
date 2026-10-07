import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import db, { UPLOADS_PATH } from "../lib/db.js";
import { isSysAdminToken } from "./auth.js";
import { finalizeDisabledWarehouseRoutingRequest } from "./supply-requests.js";
import { deletePendingRoutingTripLog, syncRoutingTripLog } from "./routing-trip-log.js";

const router = Router();

function requireRoutingSupervisor(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (isSysAdminToken(token)) return next();
  const user = db.prepare(`
    SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
  `).get(token) as { role: string } | undefined;
  if (!user) return void res.status(401).json({ error: "جلسة الدخول غير صالحة" });
  if (!["admin", "supervisor"].includes(user.role)) {
    return void res.status(403).json({ error: "صلاحيات مشرف النقليات مطلوبة" });
  }
  next();
}
const permitUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `routing-permit-${Date.now()}-${safeName}`);
    },
  }),
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
  const uploadsRoot = path.resolve(UPLOADS_PATH);
  const localFile = path.resolve(uploadsRoot, filename);
  if (!localFile.startsWith(`${uploadsRoot}${path.sep}`) || !fs.existsSync(localFile)) return false;
  return raw;
}

type RoutingCargoItem = { cargo_type: string; quantity: number };
type RoutingAttachment = {
  kind: "supervisor_permit" | "fsohat_permit" | "driver_invoice";
  url: string;
  file_name: string;
  sort_order: number;
};

function parseCargoItems(raw: unknown): RoutingCargoItem[] | false {
  if (raw == null || raw === "") return [];
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return false; }
  }
  if (!Array.isArray(value) || value.length > 20) return false;
  const items: RoutingCargoItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return false;
    const cargoType = typeof entry.cargo_type === "string" ? entry.cargo_type.trim() : "";
    const quantity = Number(entry.quantity);
    if (!cargoType || cargoType.length > 120 || !Number.isFinite(quantity) || quantity <= 0) return false;
    if (items.some(item => item.cargo_type.toLocaleLowerCase() === cargoType.toLocaleLowerCase())) return false;
    items.push({ cargo_type: cargoType, quantity });
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

function notify(userPhone: string, title: string, body: string) {
  try {
    db.prepare("INSERT INTO notifications (user_phone, title, body) VALUES (?,?,?)").run(userPhone, title, body);
  } catch {}
}

router.get("/routing-dispatches", (_req, res) => {
  const rows = db.prepare("SELECT * FROM routing_dispatches ORDER BY created_at DESC LIMIT 200").all();
  res.json(rows);
});

router.post("/routing-dispatches", requireRoutingSupervisor, permitUpload.single("permit_image"), (req, res) => {
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
  const cargoItems = parseCargoItems(req.body.cargo_items);
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

  const existingDispatch = db.prepare("SELECT id FROM routing_dispatches WHERE client_request_id=?")
    .get(clientRequestId) as { id: number } | undefined;
  if (existingDispatch) {
    return void res.json({ id: existingDispatch.id, message: "تم إرسال التوجيه بنجاح", existing: true });
  }

  let dispatchId: number;
  try {
    dispatchId = db.transaction(() => {
  const result = db.prepare(`
    INSERT INTO routing_dispatches
      (tariff_id, loading_place, unloading_place, driver_expense, rental, vehicle_plates,
       route_type, created_by, notes, customer_name, rep_name,
       override_loading_place, override_unloading_place, tariff_loading_place,
       tariff_unloading_place, customer_type, rep_phone, cargo_type, permit_image_url, client_request_id,
       loading_location_name, loading_location_url, unloading_location_name, unloading_location_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    tariff_id ?? null,
    effectiveLoading,
    effectiveUnloading,
    Number(driver_expense) || 0,
    Number(rental) || 0,
    JSON.stringify(plates),
    route_type === "via_fusahat" ? "via_fusahat" : "direct",
    created_by ?? null,
    notes ?? null,
    customer_name ? String(customer_name).trim() : null,
    rep_name ? String(rep_name).trim() : null,
    override_loading_place ? String(override_loading_place).trim() : null,
    override_unloading_place ? String(override_unloading_place).trim() : null,
    loading_place ? String(loading_place).trim() : null,
    unloading_place ? String(unloading_place).trim() : null,
    customer_type || null,
    rep_phone ? String(rep_phone).trim() : null,
     firstCargoType || null,
     firstPermitImageUrl,
    clientRequestId,
    loadingLocation?.name ?? null,
    loadingLocation?.url ?? null,
    unloadingLocation?.name ?? null,
    unloadingLocation?.url ?? null,
  );
  const newDispatchId = Number(result.lastInsertRowid);

  /* ── بحث عن مستودع يطابق وجهة التنزيل ── */
  const destWarehouse = db.prepare(
    "SELECT id FROM warehouses WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1"
  ).get(String(effectiveUnloading)) as { id: number } | undefined;
  const warehouseId = destWarehouse?.id ?? null;

  if (route_type === "via_fusahat") {
    /* ── إنشاء طلب توريد + رحلة لكل مركبة ── */
    const routeLabel = `${effectiveLoading} ← ${effectiveUnloading}`;
    const reqNotes = [
      `توجيه من مشرف النقليات`,
      tariff_id ? `رقم التعريفة: ${tariff_id}` : null,
      notes ? String(notes) : null,
    ].filter(Boolean).join(" | ");

    const srResult = db.prepare(`
      INSERT INTO supply_requests
        (product_name, warehouse_name, destination_division, warehouse_id,
          requested_qty, unit, trailer_loads, status, priority,
          requested_by, notes, routing_dispatch_id, driver_expense, rental,
          cargo_type, customer_name, customer_type, rep_name, rep_phone, permit_image_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      routeLabel,
      String(effectiveLoading),
      String(effectiveUnloading),
      warehouseId,
      plates.length,
      "مركبة",
      plates.length,
      "assigned",
      "high",
      created_by ? String(created_by) : null,
      reqNotes,
      newDispatchId,
      Number(driver_expense) || 0,
      Number(rental) || 0,
       firstCargoType || null,
      customer_name ? String(customer_name).trim() : null,
      customer_type || null,
      rep_name ? String(rep_name).trim() : null,
      rep_phone ? String(rep_phone).trim() : null,
       firstPermitImageUrl,
    );

    const srId = srResult.lastInsertRowid as number;

    const tripStmt = db.prepare(`
      INSERT INTO supply_request_trips
        (supply_request_id, vehicle_plate, driver_name, driver_phone, status, permit_image_url,
         cargo_items_json, attachments_json)
      VALUES (?,?,?,?,?,?,?,?)
    `);

    for (const plate of plates) {
      const v = db.prepare(
        "SELECT driver_name, driver_phone, linked_user_phone FROM fleet_vehicles WHERE plate_number=?"
      ).get(plate) as { driver_name: string | null; driver_phone: string | null; linked_user_phone: string | null } | undefined;

      const childTrip = tripStmt.run(
        srId, plate,
        v?.driver_name ?? null,
        v?.driver_phone ?? v?.linked_user_phone ?? null,
        "assigned",
        firstPermitImageUrl,
        cargoItemsJson,
        attachmentsJson,
      );
      syncRoutingTripLog(Number(childTrip.lastInsertRowid), { createIfMissing: true });
    }

    /* ── إشعار مسؤولي الفسوحات ── */
    const fsohatUsers = db.prepare("SELECT phone FROM users WHERE role IN ('fsohat','admin') AND active=1").all() as { phone: string }[];
    const platesStr = plates.join("، ");
    fsohatUsers.forEach(u =>
      notify(u.phone, "توجيه جديد — يحتاج فسوحات", `مسار: ${routeLabel} | السيارات: ${platesStr}`)
    );

  } else {
    /* ── توجيه مباشر: ينشئ طلب توريد + رحلة مباشرةً بدون خطوة الفسوحات ── */
    const routeLabel = `${effectiveLoading} ← ${effectiveUnloading}`;
    const reqNotes = [
      `توجيه مباشر من مشرف النقليات`,
      tariff_id ? `رقم التعريفة: ${tariff_id}` : null,
      notes ? String(notes) : null,
    ].filter(Boolean).join(" | ");

    const srResult = db.prepare(`
      INSERT INTO supply_requests
        (product_name, warehouse_name, destination_division, warehouse_id,
          requested_qty, unit, trailer_loads, status, priority,
          requested_by, notes, routing_dispatch_id, driver_expense, rental,
          cargo_type, customer_name, customer_type, rep_name, rep_phone, permit_image_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      routeLabel,
      String(effectiveLoading),
      String(effectiveUnloading),
      warehouseId,
      plates.length,
      "مركبة",
      plates.length,
      "in_transit",
      "high",
      created_by ? String(created_by) : null,
      reqNotes,
      newDispatchId,
      Number(driver_expense) || 0,
      Number(rental) || 0,
      firstCargoType || null,
      customer_name ? String(customer_name).trim() : null,
      customer_type || null,
      rep_name ? String(rep_name).trim() : null,
      rep_phone ? String(rep_phone).trim() : null,
      firstPermitImageUrl,
    );

    const srId = srResult.lastInsertRowid as number;

    const tripStmt = db.prepare(`
      INSERT INTO supply_request_trips
        (supply_request_id, vehicle_plate, driver_name, driver_phone, status, permit_image_url,
         cargo_items_json, attachments_json)
      VALUES (?,?,?,?,?,?,?,?)
    `);

    for (const plate of plates) {
      const v = db.prepare(
        "SELECT driver_name, driver_phone, linked_user_phone FROM fleet_vehicles WHERE plate_number=?"
      ).get(plate) as { driver_name: string | null; driver_phone: string | null; linked_user_phone: string | null } | undefined;

      const dPhone = v?.driver_phone ?? v?.linked_user_phone ?? null;
      const childTrip = tripStmt.run(
        srId, plate, v?.driver_name ?? null, dPhone, "in_transit",
        firstPermitImageUrl, cargoItemsJson, attachmentsJson,
      );
      syncRoutingTripLog(Number(childTrip.lastInsertRowid), { createIfMissing: true });

      /* إشعار السائق مباشرةً */
      if (dPhone) {
        notify(dPhone, "توجيه جديد مباشر 🚛",
          `مسار: ${routeLabel} | البونص: ${Number(driver_expense)||0} | الإيجار: ${Number(rental)||0}`);
      }
    }
  }
  return newDispatchId;
    })();
  } catch (error) {
    const duplicate = db.prepare("SELECT id FROM routing_dispatches WHERE client_request_id=?")
      .get(clientRequestId) as { id: number } | undefined;
    if (duplicate) return void res.json({ id: duplicate.id, message: "تم إرسال التوجيه بنجاح", existing: true });
    throw error;
  }
  res.json({ id: dispatchId, message: "تم إرسال التوجيه بنجاح" });
});

/* ── GET all routing-dispatch trips ──────────────────────────────────────── */
router.get("/routing-dispatch-trips", (_req, res) => {
  const rows = db.prepare(`
    SELECT t.id, t.supply_request_id, t.vehicle_plate, t.driver_name, t.driver_phone,
           t.status, t.created_at, t.delivered_at,
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
  `).all();
  res.json(rows);
});

/* ── Cancel a routing-dispatch trip ─────────────────────────────────────── */
router.put("/routing-dispatch-trips/:id/cancel", requireRoutingSupervisor, (req, res) => {
  const trip = db.prepare(`
    SELECT t.vehicle_plate, t.supply_request_id, sr.warehouse_id, sr.routing_dispatch_id
    FROM supply_request_trips t JOIN supply_requests sr ON sr.id=t.supply_request_id
    WHERE t.id=?
  `).get(req.params.id) as {
    vehicle_plate: string | null; supply_request_id: number; warehouse_id: number | null; routing_dispatch_id: number | null;
  } | undefined;
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  db.transaction(() => {
    db.prepare(`
      UPDATE supply_request_trips SET status='cancelled', updated_at=datetime('now')
      WHERE id=? AND status NOT IN ('completed','cancelled','rejected')
    `).run(req.params.id);
    syncRoutingTripLog(Number(req.params.id));
    const remaining = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status IN ('completed','cancelled','rejected','delivered_to_warehouse','pending_warehouse_approval') THEN 1 ELSE 0 END) AS done,
             SUM(CASE WHEN status IN ('completed','delivered_to_warehouse','pending_warehouse_approval') THEN 1 ELSE 0 END) AS delivered
      FROM supply_request_trips WHERE supply_request_id=?
    `).get(trip.supply_request_id) as { total: number; done: number; delivered: number };
    if (remaining.total > 0 && remaining.total === remaining.done) {
      const status = remaining.delivered === 0
        ? "cancelled"
        : trip.warehouse_id ? "delivered_to_warehouse" : "completed";
      db.prepare("UPDATE supply_requests SET status=?, updated_at=datetime('now') WHERE id=? AND status NOT IN ('completed','cancelled')")
        .run(status, trip.supply_request_id);
      if (status === "delivered_to_warehouse") {
        finalizeDisabledWarehouseRoutingRequest(trip.supply_request_id);
      }
    }
  })();

  if (trip?.vehicle_plate) {
    try {
      db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?")
        .run(trip.vehicle_plate);
    } catch {}
  }
  res.json({ message: "تم إلغاء الرحلة" });
});

/* ── Hard-delete a routing-dispatch trip ────────────────────────────────── */
router.delete("/routing-dispatch-trips/:id", (req, res) => {
  const trip = db.prepare(
    "SELECT vehicle_plate, status FROM supply_request_trips WHERE id=?"
  ).get(req.params.id) as { vehicle_plate: string | null; status: string } | undefined;

  db.transaction(() => {
    deletePendingRoutingTripLog(Number(req.params.id));
    db.prepare("DELETE FROM supply_request_trips WHERE id=?").run(req.params.id);
  })();

  if (trip?.vehicle_plate && !["completed","cancelled","delivered_to_warehouse"].includes(trip.status ?? "")) {
    try {
      db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?")
        .run(trip.vehicle_plate);
    } catch {}
  }
  res.json({ message: "تم حذف الرحلة" });
});

/* Shared routing fields belong to the dispatch; vehicle/driver belong to one trip. */
router.put("/routing-dispatch-trips/:id", requireRoutingSupervisor, (req, res) => {
  const trip = db.prepare(`
    SELECT t.id, t.status, t.supply_request_id, t.vehicle_plate,
           sr.routing_dispatch_id, d.route_type
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id=t.supply_request_id
    JOIN routing_dispatches d ON d.id=sr.routing_dispatch_id
    WHERE t.id=?
  `).get(req.params.id) as {
    id: number; status: string; supply_request_id: number; vehicle_plate: string | null;
    routing_dispatch_id: number; route_type: string;
  } | undefined;
  if (!trip) return void res.status(404).json({ error: "رحلة التوجيه غير موجودة" });
  if (["completed", "cancelled", "rejected"].includes(trip.status)) {
    return void res.status(409).json({ error: "لا يمكن تعديل رحلة مكتملة أو ملغاة" });
  }

  const body = req.body as Record<string, unknown>;
  const text = (key: string) => typeof body[key] === "string" ? String(body[key]).trim() : "";
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
      !db.prepare("SELECT id FROM tariffs WHERE id=?").get(tariffId)) {
    return void res.status(400).json({ error: "رقم التعريفة غير صالح" });
  }
  const suppliedWarehouseId = body.warehouse_id == null || body.warehouse_id === "" ? null : Number(body.warehouse_id);
  const matchingWarehouse = suppliedWarehouseId === null
    ? db.prepare("SELECT id FROM warehouses WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) AND active=1 LIMIT 1")
      .get(effectiveUnloading) as { id: number } | undefined
    : undefined;
  const warehouseId = suppliedWarehouseId ?? matchingWarehouse?.id ?? null;
  if (warehouseId !== null) {
    const selectedWarehouse = Number.isSafeInteger(warehouseId) && warehouseId > 0
      ? db.prepare("SELECT name FROM warehouses WHERE id=? AND active=1").get(warehouseId) as { name: string } | undefined
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
  const existingLocations = db.prepare(`
    SELECT loading_location_name, loading_location_url, unloading_location_name, unloading_location_url
    FROM routing_dispatches WHERE id=?
  `).get(trip.routing_dispatch_id) as Record<string, string | null>;
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
  const siblingTrips = db.prepare(`
    SELECT id, status, vehicle_plate FROM supply_request_trips WHERE supply_request_id=?
  `).all(trip.supply_request_id) as { id: number; status: string; vehicle_plate: string | null }[];
  if (routeType !== trip.route_type &&
      siblingTrips.some(t => !["assigned", "in_transit"].includes(t.status))) {
    return void res.status(409).json({ error: "لا يمكن تغيير نوع التوجيه بعد بدء تحميل أو تسليم إحدى سياراته" });
  }
  if (plate !== trip.vehicle_plate) {
    const replacement = db.prepare("SELECT status FROM fleet_vehicles WHERE plate_number=?")
      .get(plate) as { status: string } | undefined;
    const occupied = db.prepare(`
      SELECT 1 FROM supply_request_trips
      WHERE vehicle_plate=? AND id<>? AND status IN
        ('assigned','in_transit','loaded','delivered_to_warehouse','pending_warehouse_approval')
      LIMIT 1
    `).get(plate, trip.id);
    if (!replacement || replacement.status !== "available" || occupied) {
      return void res.status(409).json({ error: "السيارة البديلة غير متاحة للتوجيه" });
    }
  }

  db.transaction(() => {
    db.prepare(`
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
    `).run(
      tariffId, effectiveLoading, effectiveUnloading, loading, unloading,
      text("override_loading_place") || null, text("override_unloading_place") || null,
      text("customer_name") || null, text("customer_type") || null,
      text("rep_name") || null, text("rep_phone") || null, text("cargo_type") || null,
       amounts[0], amounts[1], text("notes") || null, routeType, permitUrl ?? null,
       loadingLocation?.name ?? null, loadingLocation?.url ?? null,
       unloadingLocation?.name ?? null, unloadingLocation?.url ?? null,
      trip.routing_dispatch_id,
    );
    db.prepare(`
      UPDATE supply_requests SET
        product_name=?, warehouse_name=?, destination_division=?, warehouse_id=?,
        driver_expense=?, rental=?, cargo_type=?, customer_name=?, customer_type=?,
        rep_name=?, rep_phone=?, notes=?, permit_image_url=COALESCE(?,permit_image_url),
        updated_at=datetime('now')
      WHERE routing_dispatch_id=?
    `).run(
      text("product_name") || `${effectiveLoading} ← ${effectiveUnloading}`,
      effectiveLoading, destination, warehouseId, amounts[0], amounts[1],
      text("cargo_type") || null, text("customer_name") || null, text("customer_type") || null,
      text("rep_name") || null, text("rep_phone") || null, text("notes") || null,
      permitUrl ?? null, trip.routing_dispatch_id,
    );
    db.prepare(`
      UPDATE supply_request_trips SET
        vehicle_plate=?, driver_name=?, driver_phone=?,
        updated_at=datetime('now')
      WHERE id=?
    `).run(plate, text("driver_name") || null, text("driver_phone") || null, trip.id);
    if (plate !== trip.vehicle_plate) {
      db.prepare("UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?").run(plate);
      db.prepare("UPDATE driver_profiles SET status='في رحلة' WHERE vehicle_plate=?").run(plate);
      if (trip.vehicle_plate) {
        const stillAssigned = db.prepare(`
          SELECT 1 FROM supply_request_trips WHERE vehicle_plate=?
            AND status IN ('assigned','in_transit','loaded','delivered_to_warehouse','pending_warehouse_approval')
          LIMIT 1
        `).get(trip.vehicle_plate);
        const activeOrder = db.prepare(`
          SELECT 1 FROM workflow_orders WHERE vehicle_plate=?
            AND stage IN ('vehicle_assigned','invoiced','loaded','bulker_assignment') LIMIT 1
        `).get(trip.vehicle_plate);
        if (!stillAssigned && !activeOrder) {
          db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(trip.vehicle_plate);
          db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(trip.vehicle_plate);
        }
      }
    }
    if (permitUrl) {
      db.prepare(`
        UPDATE supply_request_trips SET permit_image_url=?
        WHERE supply_request_id=? AND status NOT IN ('completed','cancelled','rejected')
      `)
        .run(permitUrl, trip.supply_request_id);
    }
    if (routeType !== trip.route_type) {
      const nextTripStatus = routeType === "via_fusahat" ? "assigned" : "in_transit";
      db.prepare("UPDATE supply_request_trips SET status=?, updated_at=datetime('now') WHERE supply_request_id=?")
        .run(nextTripStatus, trip.supply_request_id);
      db.prepare("UPDATE supply_requests SET status=?, updated_at=datetime('now') WHERE routing_dispatch_id=?")
        .run(nextTripStatus, trip.routing_dispatch_id);
    }
    const currentChildren = db.prepare(`
      SELECT id FROM supply_request_trips
      WHERE supply_request_id=? AND status NOT IN ('completed','cancelled','rejected')
    `)
      .all(trip.supply_request_id) as { id: number }[];
    currentChildren.forEach(child => syncRoutingTripLog(child.id, {
      onlyActive: true,
      refreshDispatchSnapshot: true,
      refreshTrailerSnapshot: child.id === trip.id && plate !== trip.vehicle_plate,
    }));
    const plates = db.prepare("SELECT vehicle_plate FROM supply_request_trips WHERE supply_request_id=? ORDER BY id")
      .all(trip.supply_request_id) as { vehicle_plate: string | null }[];
    db.prepare("UPDATE routing_dispatches SET vehicle_plates=? WHERE id=?")
      .run(JSON.stringify(plates.map(t => t.vehicle_plate).filter(Boolean)), trip.routing_dispatch_id);
  })();
  res.json({ message: "تم تحديث التوجيه والرحلة" });
});

export default router;
