import { Router } from "express";
import multer from "multer";
import fs from "fs";
import db, { UPLOADS_PATH } from "../lib/db.js";
import { makeStorage } from "../lib/db-sync.js";
import { isSysAdminToken } from "./auth.js";
import { deletePendingRoutingTripLog, syncRoutingTripLog } from "./routing-trip-log.js";

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
  filename:    (_req, file, cb) => cb(null,
    `sr-${Date.now()}-${file.originalname.replace(/\s+/g, "_").replace(/[^A-Za-z0-9._-]/g, "_")}`),
});
// Multer only calls the route after _handleFile succeeds. Persist before saving
// the URL in SQLite, so a new published instance can still serve the same URL.
const storage: multer.StorageEngine = {
  _handleFile(req, file, cb) {
    diskStorage._handleFile(req, file, (error, info) => {
      if (error) return cb(error);
      const saved = info as { path: string; filename: string; size: number };
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) {
        fs.unlink(saved.path, () => cb(new Error("Object Storage is unavailable for uploaded files")));
        return;
      }
      makeStorage().bucket(bucketId).upload(saved.path, {
        destination: `legacy-uploads/${saved.filename}`,
        metadata: { contentType: file.mimetype || "application/octet-stream" },
      }).then(() => cb(null, info)).catch(uploadError => {
        fs.unlink(saved.path, () => cb(uploadError));
      });
    });
  },
  _removeFile(req, file, cb) {
    diskStorage._removeFile(req, file, cb);
  },
};
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

const router = Router();

function authorizedRole(req: import("express").Request, roles: string[]): boolean {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (isSysAdminToken(token)) return true;
  const user = db.prepare(`
    SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
  `).get(token) as { role: string } | undefined;
  return !!user && roles.includes(user.role);
}

type AuthenticatedCaller = { id: number; role: string; phone: string; name: string; hiddenAdmin?: boolean };

function getAuthenticatedCaller(req: import("express").Request): AuthenticatedCaller | null {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === "guest") return null;
  if (isSysAdminToken(token)) return { id: 0, role: "admin", phone: "", name: "", hiddenAdmin: true };
  return db.prepare(`
    SELECT u.id, u.role, u.phone, u.name FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
  `).get(token) as AuthenticatedCaller | undefined || null;
}

function driverOwnsTrip(caller: AuthenticatedCaller, tripId: string): boolean {
  if (!caller.phone || caller.hiddenAdmin) return false;
  return Boolean(db.prepare(`
    SELECT 1
    FROM supply_request_trips t
    WHERE t.id=? AND (
      lower(trim(t.driver_phone))=lower(trim(?))
      OR EXISTS (
        SELECT 1 FROM fleet_vehicles fv
        WHERE fv.plate_number=t.vehicle_plate AND lower(trim(fv.linked_user_phone))=lower(trim(?))
      )
      OR EXISTS (
        SELECT 1 FROM driver_profiles dp
        WHERE dp.vehicle_plate=t.vehicle_plate
          AND (lower(trim(dp.phone))=lower(trim(?)) OR dp.user_id=?)
      )
    )
    LIMIT 1
  `).get(tripId, caller.phone, caller.phone, caller.phone, caller.id));
}

function driverOwnsSupplyRequest(
  caller: AuthenticatedCaller,
  requestId: number,
  vehiclePlate: string | null,
): boolean {
  if (!caller.phone || caller.hiddenAdmin || !["driver", "vehicle"].includes(caller.role) || !vehiclePlate) return false;
  if (caller.role === "vehicle" && caller.phone.trim().toLocaleLowerCase() === vehiclePlate.trim().toLocaleLowerCase()) {
    return true;
  }
  return Boolean(db.prepare(`
    SELECT 1
    FROM supply_requests sr
    WHERE sr.id=? AND sr.vehicle_plate=? AND (
      lower(trim(COALESCE(sr.driver_phone,'')))=lower(trim(?))
      OR EXISTS (
        SELECT 1 FROM fleet_vehicles fv
        WHERE fv.plate_number=sr.vehicle_plate
          AND lower(trim(COALESCE(fv.linked_user_phone,'')))=lower(trim(?))
      )
      OR EXISTS (
        SELECT 1 FROM driver_profiles dp
        WHERE dp.vehicle_plate=sr.vehicle_plate
          AND (lower(trim(COALESCE(dp.phone,'')))=lower(trim(?)) OR dp.user_id=?)
      )
    )
    LIMIT 1
  `).get(requestId, vehiclePlate, caller.phone, caller.phone, caller.phone, caller.id));
}

function routingWarehouseAccess(req: import("express").Request, warehouseId: number | null): "allowed" | "unauthenticated" | "forbidden" {
  const caller = getAuthenticatedCaller(req);
  if (!caller) return "unauthenticated";
  if (caller.hiddenAdmin || caller.role === "admin") return "allowed";
  if (!warehouseId || !["warehouse_manager", "warehouse"].includes(caller.role)) return "forbidden";
  const warehouse = db.prepare(`
    SELECT warehouse_manager_user_id, manager_name FROM warehouses WHERE id=?
  `).get(warehouseId) as { warehouse_manager_user_id: number | null; manager_name: string | null } | undefined;
  if (!warehouse) return "forbidden";
  if (warehouse.warehouse_manager_user_id != null) {
    return warehouse.warehouse_manager_user_id === caller.id ? "allowed" : "forbidden";
  }
  if (caller.role !== "warehouse_manager" || !warehouse.manager_name || !caller.name) return "forbidden";
  const normalizedManager = warehouse.manager_name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const normalizedCaller = caller.name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return normalizedManager === normalizedCaller ? "allowed" : "forbidden";
}

function requireRole(roles: string[]) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    if (!authorizedRole(req, roles)) return void res.status(403).json({ error: "ليس لديك صلاحية لتنفيذ هذا الإجراء" });
    next();
  };
}

function warehouseRequiresApproval(warehouseId: unknown): boolean {
  const id = Number(warehouseId);
  if (!Number.isSafeInteger(id) || id <= 0) return true;
  const setting = db.prepare(
    "SELECT requires_approval FROM warehouse_approval_settings WHERE warehouse_id=?"
  ).get(id) as { requires_approval: number } | undefined;
  return setting?.requires_approval !== 0;
}

type WarehouseFinalizationResult = {
  success: boolean;
  missing: boolean;
  conflict: boolean;
  undelivered: boolean;
};

/**
 * Finalizes an arrived supply request using the same stock, trip-snapshot, and
 * vehicle-release work as the warehouse approval action. Callers must run this
 * inside their transaction so its status claim and all side effects are atomic.
 */
function finalizeWarehouseRequest(
  requestId: number,
  acceptedStatuses: string[],
): WarehouseFinalizationResult {
  const sr = db.prepare("SELECT * FROM supply_requests WHERE id=?").get(requestId) as {
    id: number; warehouse_id: number | null; product_name: string; requested_qty: number;
    unit: string; vehicle_plate: string | null;
    routing_dispatch_id: number | null; driver_expense: number | null; rental: number | null;
    destination_division: string | null; warehouse_name: string | null;
    permit_image_url: string | null; customer_name: string | null; customer_type: string | null;
    invoice_image: string | null; cargo_type: string | null; reference_no: string | null;
    rep_name: string | null; rep_phone: string | null; status: string;
  } | undefined;
  if (!sr) return { success: false, missing: true, conflict: false, undelivered: false };
  if (!acceptedStatuses.includes(sr.status)) return { success: false, missing: false, conflict: true, undelivered: false };

  const children = db.prepare(`
    SELECT id, status, vehicle_plate, driver_name, driver_phone, driver_loading_image,
           permit_image_url, invoice_image_url, reference_no
    FROM supply_request_trips WHERE supply_request_id=?
  `).all(sr.id) as {
    id: number; status: string; vehicle_plate: string | null; driver_name: string | null;
    driver_phone: string | null; driver_loading_image: string | null; permit_image_url: string | null;
    invoice_image_url: string | null; reference_no: string | null;
  }[];
  const eligible = children.filter(t => ["delivered_to_warehouse", "pending_warehouse_approval"].includes(t.status));
  const unfinished = children.some(t =>
    !["delivered_to_warehouse", "pending_warehouse_approval", "cancelled", "rejected", "completed"].includes(t.status)
  );
  if (unfinished || (sr.routing_dispatch_id && children.length === 0) || (children.length > 0 && eligible.length === 0)) {
    return { success: false, missing: false, conflict: false, undelivered: true };
  }

  const placeholders = acceptedStatuses.map(() => "?").join(",");
  const claimed = db.prepare(`
    UPDATE supply_requests SET status='completed', updated_at=datetime('now')
    WHERE id=? AND status IN (${placeholders})
  `).run(sr.id, ...acceptedStatuses).changes;
  if (claimed !== 1) return { success: false, missing: false, conflict: true, undelivered: false };

  const inventoryQuantity = sr.routing_dispatch_id ? eligible.length : sr.requested_qty;
  if (sr.warehouse_id && inventoryQuantity > 0) {
    const existing = db.prepare(
      "SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_name=?"
    ).get(sr.warehouse_id, sr.product_name) as { id: number } | undefined;
    if (existing) {
      db.prepare("UPDATE warehouse_items SET quantity=quantity+?, last_updated=datetime('now') WHERE id=?")
        .run(inventoryQuantity, existing.id);
    } else {
      db.prepare(
        "INSERT INTO warehouse_items (warehouse_id, product_name, quantity, unit, min_stock, max_stock) VALUES (?,?,?,?,0,0)"
      ).run(sr.warehouse_id, sr.product_name, inventoryQuantity, sr.unit || "وحدة");
    }
  }

  db.prepare(`
    UPDATE supply_request_trips SET status='completed', updated_at=datetime('now')
    WHERE supply_request_id=? AND status IN ('delivered_to_warehouse','pending_warehouse_approval')
  `).run(sr.id);

  if (sr.routing_dispatch_id) {
    const today = new Date().toISOString().slice(0, 10);
    for (const t of eligible) {
      if (!t.vehicle_plate) continue;
      db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(t.vehicle_plate);
      db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(t.vehicle_plate);
      syncRoutingTripLog(t.id, { createIfMissing: true, fallbackDate: today });
    }
  } else if (children.length > 0) {
    for (const t of eligible) {
      if (!t.vehicle_plate) continue;
      db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(t.vehicle_plate);
      db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(t.vehicle_plate);
    }
  } else if (sr.vehicle_plate) {
    db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(sr.vehicle_plate);
    db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(sr.vehicle_plate);
  }
  return { success: true, missing: false, conflict: false, undelivered: false };
}

/**
 * Complete a delivered routing request after sibling trips have been cancelled,
 * but only when that warehouse has opted out of its approval step.
 * Returns true only when this call finalized the request.
 */
export function finalizeDisabledWarehouseRoutingRequest(requestId: number): boolean {
  if (!Number.isSafeInteger(requestId) || requestId <= 0) return false;
  const finalize = db.transaction(() => {
    const request = db.prepare(`
      SELECT routing_dispatch_id, warehouse_id, status
      FROM supply_requests WHERE id=?
    `).get(requestId) as {
      routing_dispatch_id: number | null;
      warehouse_id: number | null;
      status: string;
    } | undefined;
    if (!request?.routing_dispatch_id || request.status !== "delivered_to_warehouse") return false;
    if (warehouseRequiresApproval(request.warehouse_id)) return false;
    return finalizeWarehouseRequest(requestId, ["delivered_to_warehouse"]).success;
  });
  return finalize();
}

// ── Supply Requests ───────────────────────────────────────────────────────────
router.get("/warehouse-approval-settings", requireRole(["admin", "supervisor"]), (_req, res) => {
  const warehouses = db.prepare(`
    SELECT w.id, w.name, COALESCE(s.requires_approval, 1) AS requires_approval
    FROM warehouses w
    LEFT JOIN warehouse_approval_settings s ON s.warehouse_id=w.id
    WHERE w.active=1
    ORDER BY w.name COLLATE NOCASE, w.id
  `).all() as { id: number; name: string; requires_approval: number }[];
  res.json({
    warehouses: warehouses.map(warehouse => ({
      id: warehouse.id,
      name: warehouse.name,
      requires_approval: warehouse.requires_approval !== 0,
    })),
  });
});

router.put("/warehouse-approval-settings", requireRole(["admin", "supervisor"]), (req, res) => {
  const { warehouse_ids, requires_approval } = req.body || {};
  if (
    !Array.isArray(warehouse_ids)
    || warehouse_ids.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) <= 0)
    || typeof requires_approval !== "boolean"
  ) {
    return void res.status(400).json({ error: "قائمة المستودعات وخيار الموافقة مطلوبان بصيغة صحيحة" });
  }
  const warehouseIds = [...new Set<number>(warehouse_ids)];
  const update = db.transaction(() => {
    if (warehouseIds.length) {
      const existingIds = db.prepare(
        `SELECT id FROM warehouses WHERE id IN (${warehouseIds.map(() => "?").join(",")})`
      ).all(...warehouseIds) as { id: number }[];
      if (existingIds.length !== warehouseIds.length) return { invalidWarehouse: true as const };

      const saveSetting = db.prepare(`
        INSERT INTO warehouse_approval_settings (warehouse_id, requires_approval, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(warehouse_id) DO UPDATE SET
          requires_approval=excluded.requires_approval,
          updated_at=datetime('now')
      `);
      for (const warehouseId of warehouseIds) {
        saveSetting.run(warehouseId, requires_approval ? 1 : 0);
      }
    }

    let finalized = 0;
    let skipped = 0;
    if (!requires_approval && warehouseIds.length) {
      const arrived = db.prepare(`
        SELECT id FROM supply_requests
        WHERE warehouse_id IN (${warehouseIds.map(() => "?").join(",")})
          AND status IN ('delivered_to_warehouse','pending_warehouse_approval')
        ORDER BY id
      `).all(...warehouseIds) as { id: number }[];
      for (const request of arrived) {
        const result = finalizeWarehouseRequest(request.id, ["delivered_to_warehouse", "pending_warehouse_approval"]);
        if (result.success) finalized++;
        else skipped++;
      }
    }
    return { finalized, skipped };
  });
  const result = update();
  if ("invalidWarehouse" in result) {
    return void res.status(400).json({ error: "أحد المستودعات المحددة غير موجود" });
  }
  res.json({
    message: "تم حفظ إعدادات موافقة الاستلام",
    finalized_count: result.finalized,
    skipped_count: result.skipped,
  });
});

router.get("/supply-requests", (req, res) => {
  const { warehouse_id, status, driver_phone, requested_by } = req.query;
  let sql = `
    SELECT sr.*,
           COALESCE(sr.vehicle_plate,
             (SELECT t.vehicle_plate FROM supply_request_trips t
              WHERE t.supply_request_id = sr.id AND t.vehicle_plate IS NOT NULL
              ORDER BY t.created_at ASC LIMIT 1)) AS vehicle_plate,
           COALESCE(sr.driver_name,
             (SELECT t.driver_name FROM supply_request_trips t
              WHERE t.supply_request_id = sr.id AND t.driver_name IS NOT NULL
              ORDER BY t.created_at ASC LIMIT 1)) AS driver_name,
           COALESCE(sr.driver_phone,
             (SELECT t.driver_phone FROM supply_request_trips t
              WHERE t.supply_request_id = sr.id AND t.driver_phone IS NOT NULL
              ORDER BY t.created_at ASC LIMIT 1)) AS driver_phone,
           COALESCE((SELECT COUNT(*) FROM supply_request_trips t WHERE t.supply_request_id = sr.id), 0) AS trips_count
    FROM supply_requests sr WHERE 1=1
  `;
  const params: unknown[] = [];
  if (warehouse_id)  { sql += " AND sr.warehouse_id=?";   params.push(warehouse_id); }
  if (status)        { sql += " AND sr.status=?";          params.push(status); }
  if (driver_phone)  { sql += " AND sr.driver_phone=?";    params.push(driver_phone); }
  if (requested_by)  { sql += " AND sr.requested_by=?";    params.push(requested_by); }
  sql += " ORDER BY sr.created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/supply-requests", (req, res) => {
  const {
    warehouse_id, warehouse_name, product_name, product_category,
    requested_qty, unit, trailer_loads, destination_division,
    requested_by, notes, auto_triggered, priority, batch_id,
    external_customer_name, external_customer_phone,
  } = req.body;
  if (!product_name || !requested_qty) return void res.status(400).json({ error: "المنتج والكمية مطلوبان" });
  const r = db.prepare(`
    INSERT INTO supply_requests
      (warehouse_id, warehouse_name, product_name, product_category, requested_qty, unit, trailer_loads, destination_division, requested_by, notes, auto_triggered, priority, batch_id, external_customer_name, external_customer_phone)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    warehouse_id || null, warehouse_name || null, product_name,
    product_category || null, parseFloat(requested_qty) || 0,
    unit || "وحدة", parseFloat(trailer_loads) || 1,
    destination_division || null, requested_by || null,
    notes || null, auto_triggered ? 1 : 0, priority || "normal",
    batch_id || null,
    external_customer_name || null, external_customer_phone || null,
  );
  res.status(201).json({ id: r.lastInsertRowid, message: "تم إرسال طلب التوريد" });
});

router.put("/supply-requests/:id", (req, res) => {
  const { status, approved_by, notes } = req.body;
  const requestInfo = db.prepare("SELECT routing_dispatch_id FROM supply_requests WHERE id=?")
    .get(req.params.id) as { routing_dispatch_id: number | null } | undefined;
  if (requestInfo?.routing_dispatch_id) {
    return void res.status(409).json({ error: "يجب تحديث حالة التوجيه عبر إجراءاته المخصصة" });
  }
  db.prepare(
    "UPDATE supply_requests SET status=?,approved_by=?,notes=?,updated_at=datetime('now') WHERE id=?"
  ).run(status, approved_by || null, notes || null, req.params.id);
  res.json({ message: "تم التحديث" });
});

// ── تعديل طلب التوريد (قبل تعيين سيارة) ─────────────────────────────────────
router.patch("/supply-requests/:id/edit", (req, res) => {
  const sr = db.prepare("SELECT status FROM supply_requests WHERE id=?")
    .get(req.params.id) as { status: string } | undefined;
  if (!sr) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (sr.status !== "pending") return void res.status(403).json({ error: "لا يمكن تعديل طلب بعد الموافقة عليه" });
  const { requested_qty, trailer_loads, destination_division, notes } = req.body;
  db.prepare(`
    UPDATE supply_requests
    SET requested_qty=?, trailer_loads=?, destination_division=?, notes=?, updated_at=datetime('now')
    WHERE id=?
  `).run(parseFloat(requested_qty) || 0, parseFloat(trailer_loads) || 1, destination_division || null, notes || null, req.params.id);
  res.json({ message: "تم التعديل" });
});

// ── إلغاء طلب التوريد ─────────────────────────────────────────────────────────
router.delete("/supply-requests/:id", (req, res) => {
  const sr = db.prepare("SELECT status FROM supply_requests WHERE id=?")
    .get(req.params.id) as { status: string } | undefined;
  if (!sr) return void res.status(404).json({ error: "الطلب غير موجود" });
  const cancellable = ["pending", "approved", "supervisor_assigned"];
  if (!cancellable.includes(sr.status)) return void res.status(403).json({ error: "لا يمكن إلغاء طلب بعد انطلاق الشاحنة" });
  db.prepare("UPDATE supply_requests SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ message: "تم الإلغاء" });
});

// ── تعديل موقع التنزيل (بعد تعيين السيارة) ──────────────────────────────────
router.patch("/supply-requests/:id/location", (req, res) => {
  const { destination_division } = req.body;
  db.prepare("UPDATE supply_requests SET destination_division=?, updated_at=datetime('now') WHERE id=?")
    .run(destination_division || null, req.params.id);
  res.json({ message: "تم تحديث الموقع" });
});

// ── مشرف الحركة: تعيين سيارة ────────────────────────────────────────────────
router.put("/supply-requests/:id/assign-vehicle", (req, res) => {
  const { vehicle_plate, driver_name, driver_phone, assigned_by } = req.body;
  if (!vehicle_plate) return void res.status(400).json({ error: "لوحة السيارة مطلوبة" });

  const id = req.params.id;

  // ── Update parent request ────────────────────────────────────────────────────
  db.prepare(`
    UPDATE supply_requests
    SET vehicle_plate=?, driver_name=?, driver_phone=?,
        status='pending_permit', approved_by=?,
        updated_at=datetime('now')
    WHERE id=?
  `).run(vehicle_plate, driver_name || null, driver_phone || null, assigned_by || null, id);

  // ── Sync trip row (upsert) ───────────────────────────────────────────────────
  const existing = db.prepare(
    "SELECT id FROM supply_request_trips WHERE supply_request_id=? LIMIT 1"
  ).get(id) as { id: number } | undefined;

  if (existing) {
    // Update the existing trip with the new vehicle/driver info
    db.prepare(`
      UPDATE supply_request_trips
      SET vehicle_plate=?, driver_name=?, driver_phone=?, status='assigned',
          updated_at=datetime('now')
      WHERE id=?
    `).run(vehicle_plate, driver_name || null, driver_phone || null, existing.id);
  } else {
    // Create the trip row so the driver can see it in their portal
    db.prepare(`
      INSERT INTO supply_request_trips (supply_request_id, vehicle_plate, driver_name, driver_phone, status)
      VALUES (?,?,?,?,'assigned')
    `).run(id, vehicle_plate, driver_name || null, driver_phone || null);
  }

  // ── Mark vehicle busy + driver en-route ─────────────────────────────────────
  try { db.prepare("UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?").run(vehicle_plate); } catch {}
  try { db.prepare("UPDATE driver_profiles SET status='في رحلة' WHERE vehicle_plate=?").run(vehicle_plate); } catch {}

  res.json({ message: "تم تعيين السيارة" });
});

// ── رحلات طلبات التوريد (supply_request_trips) ────────────────────────────────

/** GET trips — for driver (by driver_phone) or supervisor (by supply_request_id) or active only */
type RoutingCargoItem = { cargo_type: string; quantity?: number | null; sort_order?: number };
type RoutingTripAttachment = {
  kind: "supervisor_permit" | "fsohat_permit" | "driver_invoice" | string;
  url: string;
  file_name?: string;
  reference_no?: string | null;
  sort_order?: number;
};

function readRoutingCargoItems(raw: unknown): RoutingCargoItem[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item, index) => {
      if (!item || typeof item.cargo_type !== "string" || !item.cargo_type.trim()) return [];
      const quantity = item.quantity == null ? null : Number(item.quantity);
      if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) return [];
      return [{ cargo_type: item.cargo_type.trim(), quantity, sort_order: Number(item.sort_order ?? index) }];
    });
  } catch { return []; }
}

function readRoutingAttachments(raw: unknown): RoutingTripAttachment[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item, index) => {
      if (!item || typeof item.url !== "string" || !item.url.trim()) return [];
      return [{
        kind: typeof item.kind === "string" ? item.kind : "supervisor_permit",
        url: item.url,
        file_name: typeof item.file_name === "string" ? item.file_name : "",
        reference_no: typeof item.reference_no === "string" ? item.reference_no : null,
        sort_order: Number(item.sort_order ?? index),
      }];
    });
  } catch { return []; }
}

function validateAppStorageObjectUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/api/storage/objects/") || /[%\\?#]/.test(value)) return null;
  const key = value.slice("/api/storage/objects/".length);
  const segments = key.split("/");
  if (!key || !/^[A-Za-z0-9._/-]+$/.test(key) || segments.some(segment => !segment || segment === "." || segment === "..")) return null;
  return value;
}

function parseClientRoutingAttachments(raw: unknown, kind: RoutingTripAttachment["kind"]): RoutingTripAttachment[] | false {
  if (raw == null || raw === "") return [];
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return false; }
  }
  if (!Array.isArray(parsed) || parsed.length > 20) return false;
  const result: RoutingTripAttachment[] = [];
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== "object") return false;
    const url = validateAppStorageObjectUrl(item.url);
    const fileName = typeof item.file_name === "string" ? item.file_name.trim() : "";
    if (!url || fileName.length > 255) return false;
    result.push({ kind, url, file_name: fileName, sort_order: index });
  }
  return result;
}

function mergeRoutingAttachments(
  existingRaw: unknown,
  additions: RoutingTripAttachment[],
  replaceKind?: RoutingTripAttachment["kind"],
): RoutingTripAttachment[] {
  const existing = readRoutingAttachments(existingRaw);
  const kept = replaceKind ? existing.filter(item => item.kind !== replaceKind) : existing;
  const nextOrder = Math.max(-1, ...kept.filter(item => item.kind === additions[0]?.kind).map(item => Number(item.sort_order) || 0)) + 1;
  return [...kept, ...additions.map((item, index) => ({ ...item, sort_order: nextOrder + index }))];
}

function listTripAttachments(row: Record<string, unknown>): RoutingTripAttachment[] {
  const attachments = readRoutingAttachments(row.attachments_json);
  const legacy = [
    { kind: "supervisor_permit", url: row.permit_image_url },
    { kind: "fsohat_permit", url: row.invoice_image },
    { kind: "driver_invoice", url: row.driver_loading_image },
  ];
  for (const item of legacy) {
    if (typeof item.url === "string" && item.url && !attachments.some(saved => saved.url === item.url)) {
      attachments.push({ kind: item.kind, url: item.url, file_name: "", sort_order: attachments.length });
    }
  }
  return attachments;
}

router.get("/supply-request-trips", (req, res) => {
  const { driver_phone, supply_request_id, active_only } = req.query;
  let sql = `
    SELECT t.id, t.supply_request_id, t.vehicle_plate, t.driver_name, t.driver_phone,
           t.status, t.driver_loading_image, t.permit_number, t.loaded_at, t.delivered_at,
           t.received_at, t.created_at, t.updated_at, t.archived_at,
           t.cargo_items_json, t.attachments_json,
           sr.product_name, sr.requested_qty, sr.unit, sr.trailer_loads,
           sr.warehouse_name, sr.destination_division,
            COALESCE(t.invoice_image_url, sr.invoice_image) AS invoice_image,
            sr.cargo_type, COALESCE(t.reference_no, sr.reference_no) AS reference_no,
            sr.priority, sr.warehouse_id,
            COALESCE(t.permit_image_url, sr.permit_image_url) AS permit_image_url,
             sr.customer_name, sr.customer_type, sr.rep_name, sr.rep_phone, sr.routing_dispatch_id,
           rd.loading_location_name, rd.loading_location_url,
           rd.unloading_location_name, rd.unloading_location_url,
           w.lat      AS warehouse_lat,
           w.lng      AS warehouse_lng,
           w.location AS warehouse_location,
           mgr.phone  AS warehouse_manager_phone,
           mgr.name   AS warehouse_manager_name
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id = t.supply_request_id
    LEFT JOIN routing_dispatches rd ON rd.id = sr.routing_dispatch_id
    LEFT JOIN warehouses w ON w.id = sr.warehouse_id
    LEFT JOIN users mgr ON mgr.id = w.warehouse_manager_user_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (driver_phone)       { sql += " AND t.driver_phone=?";                         params.push(driver_phone); }
  if (supply_request_id)  { sql += " AND t.supply_request_id=?";                   params.push(supply_request_id); }
  if (active_only === "1") { sql += " AND t.status NOT IN ('completed','rejected')"; }
  if (req.query.include_archived !== "1") { sql += " AND (t.archived_at IS NULL)"; }
  sql += " ORDER BY t.created_at DESC";
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  res.json(rows.map(row => {
    const cargoItems = readRoutingCargoItems(row.cargo_items_json);
    const legacyCargoType = typeof row.cargo_type === "string" && row.cargo_type.trim()
      ? row.cargo_type.trim()
      : !row.routing_dispatch_id && typeof row.product_name === "string" ? row.product_name : "";
    if (!cargoItems.length && legacyCargoType) {
      const legacyQuantity = row.routing_dispatch_id ? null : Number(row.requested_qty);
      cargoItems.push({
        cargo_type: legacyCargoType,
        ...(legacyQuantity && Number.isFinite(legacyQuantity) ? { quantity: legacyQuantity } : {}),
      });
    }
    const { cargo_items_json: _cargoItemsJson, attachments_json: _attachmentsJson, ...publicRow } = row;
    return { ...publicRow, cargo_items: cargoItems, attachments: listTripAttachments(row) };
  }));
});

// ── Bulk archive trips (soft delete) ─────────────────────────────────────────
router.post("/supply-request-trips/bulk-archive", (req, res) => {
  const ids: number[] = req.body?.ids ?? [];
  if (!ids.length) return void res.status(400).json({ error: "لا توجد طلبات محددة" });
  const stmt = db.prepare("UPDATE supply_request_trips SET archived_at=datetime('now') WHERE id=? AND archived_at IS NULL");
  const run = db.transaction(() => ids.forEach(id => stmt.run(id)));
  run();
  res.json({ message: `تم أرشفة ${ids.length} طلب` });
});

// ── Bulk restore trips ────────────────────────────────────────────────────────
router.post("/supply-request-trips/bulk-restore", (req, res) => {
  const ids: number[] = req.body?.ids ?? [];
  if (!ids.length) return void res.status(400).json({ error: "لا توجد طلبات محددة" });
  const stmt = db.prepare("UPDATE supply_request_trips SET archived_at=NULL WHERE id=?");
  const run = db.transaction(() => ids.forEach(id => stmt.run(id)));
  run();
  res.json({ message: `تم استرجاع ${ids.length} طلب` });
});

// ── Bulk permanent delete trips ───────────────────────────────────────────────
router.post("/supply-request-trips/bulk-hard-delete", (req, res) => {
  const ids: number[] = req.body?.ids ?? [];
  if (!ids.length) return void res.status(400).json({ error: "لا توجد طلبات محددة" });
  const stmt = db.prepare("DELETE FROM supply_request_trips WHERE id=?");
  const run = db.transaction(() => ids.forEach(id => {
    deletePendingRoutingTripLog(Number(id));
    stmt.run(id);
  }));
  run();
  res.json({ message: `تم حذف ${ids.length} طلب نهائياً` });
});

/** POST create one trip assignment (supervisor assigns one vehicle) */
router.post("/supply-requests/:id/trips", (req, res) => {
  const { vehicle_plate, driver_name, driver_phone, assigned_by } = req.body;
  if (!vehicle_plate) return void res.status(400).json({ error: "لوحة السيارة مطلوبة" });

  const sr = db.prepare("SELECT * FROM supply_requests WHERE id=?").get(req.params.id) as {
    id: number; trailer_loads: number; status: string;
  } | undefined;
  if (!sr) return void res.status(404).json({ error: "الطلب غير موجود" });

  const tripCount = (db.prepare(
    "SELECT COUNT(*) as c FROM supply_request_trips WHERE supply_request_id=?"
  ).get(req.params.id) as { c: number }).c;

  if (tripCount >= sr.trailer_loads) {
    return void res.status(400).json({ error: `تم تعيين كل الرحلات (${sr.trailer_loads})` });
  }

  const r = db.prepare(`
    INSERT INTO supply_request_trips (supply_request_id, vehicle_plate, driver_name, driver_phone, status)
    VALUES (?,?,?,?,'assigned')
  `).run(req.params.id, vehicle_plate, driver_name || null, driver_phone || null);

  /* Mark vehicle as busy in fleet_vehicles + driver_profiles */
  try { db.prepare("UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?").run(vehicle_plate); } catch {}
  try { db.prepare("UPDATE driver_profiles SET status='في رحلة' WHERE vehicle_plate=?").run(vehicle_plate); } catch {}

  /* Set pending_permit so fsohat can see it and upload permit */
  db.prepare(`
    UPDATE supply_requests
    SET status='pending_permit', vehicle_plate=?, driver_phone=?,
        approved_by=?, updated_at=datetime('now')
    WHERE id=?
  `).run(vehicle_plate, driver_phone || null, assigned_by || null, req.params.id);

  res.status(201).json({ id: r.lastInsertRowid, assigned: tripCount + 1, total: sr.trailer_loads });
});

/** PUT driver confirms load (photo + permit) */
router.put("/supply-request-trips/:id/driver-load", upload.single("loading_image"), (req, res) => {
  const { permit_number } = req.body;
  const submittedAttachments = req.body.loading_images !== undefined
    ? parseClientRoutingAttachments(req.body.loading_images, "driver_invoice")
    : req.file
      ? [{ kind: "driver_invoice", url: `/api/uploads/${req.file.filename}`, file_name: req.file.originalname, sort_order: 0 }]
      : [];
  if (submittedAttachments === false) return void res.status(400).json({ error: "قائمة صور الفواتير غير صالحة" });
  const image_url = submittedAttachments[0]?.url || null;
  const tripId = String(req.params.id);
  const caller = getAuthenticatedCaller(req);
  const load = db.transaction(() => {
    const trip = db.prepare(`
      SELECT t.supply_request_id, t.status, t.attachments_json, t.permit_image_url,
             t.invoice_image_url, sr.routing_dispatch_id, sr.status AS parent_status,
             sr.permit_image_url AS parent_permit_image_url, sr.invoice_image AS parent_invoice_image
      FROM supply_request_trips t JOIN supply_requests sr ON sr.id=t.supply_request_id
      WHERE t.id=?
    `).get(tripId) as {
      supply_request_id: number; status: string; routing_dispatch_id: number | null; parent_status: string;
      attachments_json: string | null; permit_image_url: string | null; invoice_image_url: string | null;
      parent_permit_image_url: string | null; parent_invoice_image: string | null;
    } | undefined;
    if (!trip) return { missing: true as const };
    if (trip.routing_dispatch_id) {
      if (!caller) return { unauthenticated: true as const };
      if (!driverOwnsTrip(caller, tripId)) return { forbidden: true as const };
    }
    if (trip.status === "loaded") return { duplicate: true as const };
    if (trip.routing_dispatch_id
      ? trip.status !== "in_transit"
      : !["assigned", "in_transit"].includes(trip.status)) {
      return { conflict: true as const };
    }
    if (["delivered_to_warehouse", "pending_warehouse_approval", "completed", "received", "cancelled"].includes(trip.parent_status)) {
      return { conflict: true as const };
    }
    if (trip.routing_dispatch_id) {
      const attachments = readRoutingAttachments(trip.attachments_json);
      const expectedCount = attachments.filter(item => item.kind === "fsohat_permit").length
        || attachments.filter(item => item.kind === "supervisor_permit").length
        || ((trip.invoice_image_url || trip.parent_invoice_image || trip.permit_image_url || trip.parent_permit_image_url) ? 1 : 1);
      if (submittedAttachments.length !== expectedCount) {
        return { attachmentCountMismatch: expectedCount as number };
      }
    }
    const attachmentsJson = trip.routing_dispatch_id && submittedAttachments.length
      ? JSON.stringify(mergeRoutingAttachments(trip.attachments_json, submittedAttachments))
      : trip.attachments_json;

    const changed = db.prepare(`
      UPDATE supply_request_trips
      SET driver_loading_image=?, permit_number=?, attachments_json=?,
          status='loaded', loaded_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND status=?
    `).run(image_url, permit_number || null, attachmentsJson, tripId, trip.status).changes;
    if (!changed) return { conflict: true as const };
    if (trip.routing_dispatch_id) syncRoutingTripLog(Number(tripId));

    const children = db.prepare("SELECT status FROM supply_request_trips WHERE supply_request_id=?")
      .all(trip.supply_request_id) as { status: string }[];
    const allLoaded = children.length > 0 && children.every(child =>
      ["loaded", "delivered_to_warehouse", "pending_warehouse_approval", "completed", "cancelled", "rejected"].includes(child.status)
    );
    if (allLoaded) {
      db.prepare(`
        UPDATE supply_requests SET status='loaded', loaded_at=datetime('now'), updated_at=datetime('now')
        WHERE id=? AND status IN ('assigned','pending_permit','in_transit','loaded')
      `).run(trip.supply_request_id);
    }
    return { ok: true as const };
  });
  const result = load();
  if (result.missing) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (result.unauthenticated) return void res.status(401).json({ error: "يلزم تسجيل الدخول بحساب السائق" });
  if (result.forbidden) return void res.status(403).json({ error: "لا يمكنك تحديث رحلة غير مسندة إليك" });
  if (result.conflict) return void res.status(409).json({ error: "لا يمكن تأكيد تحميل رحلة في حالتها الحالية" });
  if (result.attachmentCountMismatch) {
    return void res.status(400).json({ error: `يجب رفع ${result.attachmentCountMismatch} صورة، صورة واحدة لكل فسح` });
  }
  res.json({ message: "تم تأكيد التحميل", image_url });
});

/** PUT driver confirms delivery to warehouse */
router.put("/supply-request-trips/:id/driver-deliver", (req, res) => {
  const tripId = String(req.params.id);
  const caller = getAuthenticatedCaller(req);
  const delivery = db.transaction(() => {
    const trip = db.prepare(`
      SELECT t.*, sr.product_name, sr.destination_division, sr.warehouse_name, sr.warehouse_id,
             sr.routing_dispatch_id, sr.status AS parent_status, sr.driver_expense, sr.rental,
             sr.permit_image_url AS parent_permit_image_url,
             sr.invoice_image AS parent_invoice_image, sr.customer_name, sr.customer_type, sr.cargo_type,
             COALESCE(t.reference_no, sr.reference_no) AS effective_reference_no,
             sr.rep_name, sr.rep_phone,
             rd.tariff_loading_place, rd.tariff_unloading_place
      FROM supply_request_trips t
      LEFT JOIN supply_requests sr ON t.supply_request_id = sr.id
      LEFT JOIN routing_dispatches rd ON rd.id = sr.routing_dispatch_id
      WHERE t.id=?
    `).get(tripId) as Record<string, unknown> | undefined;
    if (!trip) return { missing: true as const };

    const isRoutingDispatch = !!trip.routing_dispatch_id;
    if (isRoutingDispatch) {
      if (!caller) return { unauthenticated: true as const };
      if (!driverOwnsTrip(caller, tripId)) return { forbidden: true as const };
    }
    const hasWarehouse = !!trip.warehouse_id;
    const approvalRequired = hasWarehouse ? warehouseRequiresApproval(trip.warehouse_id) : true;
    const finalStatus = (!isRoutingDispatch || hasWarehouse) ? "delivered_to_warehouse" : "completed";
    if (["delivered_to_warehouse", "pending_warehouse_approval", "completed", "received", "cancelled"].includes(String(trip.parent_status))) {
      const terminalChild = ["delivered_to_warehouse", "pending_warehouse_approval", "completed"].includes(String(trip.status));
      if (terminalChild) return { duplicate: true as const, isRoutingDispatch, hasWarehouse };
      return { conflict: true as const };
    }
    if (isRoutingDispatch && String(trip.status) !== "loaded") return { conflict: true as const };
    const updateDelivery = isRoutingDispatch ? db.prepare(`
      UPDATE supply_request_trips
      SET status=?, delivered_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND status='loaded'
    `) : db.prepare(`
      UPDATE supply_request_trips
      SET status=?, delivered_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND status NOT IN ('delivered_to_warehouse','pending_warehouse_approval','completed','cancelled','rejected')
    `);
    const changed = updateDelivery.run(finalStatus, tripId).changes;
    if (!changed) {
      if (["delivered_to_warehouse", "pending_warehouse_approval", "completed"].includes(String(trip.status))) {
        return { duplicate: true as const, isRoutingDispatch, hasWarehouse };
      }
      return { conflict: true as const };
    }
    if (isRoutingDispatch) {
      syncRoutingTripLog(Number(tripId), {
        createIfMissing: true,
        fallbackDate: new Date().toISOString().slice(0, 10),
      });
      // The dispatch row already holds the tariff snapshot in total_amount.
      // Record its return value when the driver unloads, without replacing a
      // value previously entered manually for this trip.
      db.prepare(`
        UPDATE trips SET return_value_no_vat=total_amount
        WHERE client_request_id=? AND COALESCE(return_value_no_vat,0)=0
      `).run(`routing-trip:${tripId}`);
    }

    const activeChildren = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status IN ('delivered_to_warehouse','pending_warehouse_approval','completed','cancelled','rejected') THEN 1 ELSE 0 END) AS done
      FROM supply_request_trips WHERE supply_request_id=?
    `).get(trip.supply_request_id) as { total: number; done: number };
    let autoFinalized = false;
    if (activeChildren.total > 0 && activeChildren.total === activeChildren.done) {
      const parentStatus = (!isRoutingDispatch || hasWarehouse) ? "delivered_to_warehouse" : "completed";
      db.prepare(`
        UPDATE supply_requests SET status=?, updated_at=datetime('now')
        WHERE id=? AND status NOT IN ('completed','cancelled')
      `).run(parentStatus, trip.supply_request_id);
      if (hasWarehouse && !approvalRequired && parentStatus === "delivered_to_warehouse") {
        const finalized = finalizeWarehouseRequest(Number(trip.supply_request_id), ["delivered_to_warehouse"]);
        autoFinalized = finalized.success;
      }
    }

    if (isRoutingDispatch && !hasWarehouse && trip.vehicle_plate) {
      db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(trip.vehicle_plate);
      db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(trip.vehicle_plate);
      const today = new Date().toISOString().slice(0, 10);
      syncRoutingTripLog(Number(tripId), { createIfMissing: true, fallbackDate: today });
    } else if (isRoutingDispatch && hasWarehouse && approvalRequired && !autoFinalized) {
      const wMgr = db.prepare(`
        SELECT u.phone FROM warehouses w
        LEFT JOIN users u ON u.id=w.warehouse_manager_user_id
        WHERE w.id=? AND u.phone IS NOT NULL LIMIT 1
      `).get(trip.warehouse_id) as { phone: string } | undefined;
      if (wMgr?.phone) {
        db.prepare("INSERT INTO notifications (user_phone, title, body) VALUES (?,?,?)")
          .run(wMgr.phone, "شحنة وصلت 📦", `الرحلة ${trip.vehicle_plate || ""} وصلت — يرجى تأكيد الاستلام`);
      }
    } else if (!isRoutingDispatch && trip.vehicle_plate) {
      const today = new Date().toISOString().slice(0, 10);
      const trailer = (db.prepare("SELECT linked_trailer_number FROM fleet_vehicles WHERE plate_number=? LIMIT 1")
        .get(trip.vehicle_plate) as { linked_trailer_number: string | null } | undefined)?.linked_trailer_number || null;
      db.prepare(`
        INSERT INTO trips (date, car_id, driver_name, driver_phone, material_type, destination, trips_count, notes, trailer_number)
        VALUES (?,?,?,?,?,?,1,?,?)
      `).run(today, trip.vehicle_plate, trip.driver_name || null, trip.driver_phone || null,
        trip.product_name || null, trip.destination_division || trip.warehouse_name || null,
        `طلب توريد #${trip.supply_request_id}`, trailer);
    }
    return { isRoutingDispatch, hasWarehouse, autoFinalized };
  });

  const result = delivery();
  if (result.missing) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (result.unauthenticated) return void res.status(401).json({ error: "يلزم تسجيل الدخول بحساب السائق" });
  if (result.forbidden) return void res.status(403).json({ error: "لا يمكنك تحديث رحلة غير مسندة إليك" });
  if (result.conflict) return void res.status(409).json({ error: "الطلب لم يعد يسمح بتحديث هذه الرحلة" });
  if (result.duplicate) return void res.json({ message: "تم تسجيل التسليم مسبقاً" });
  res.json({
    message: result.autoFinalized
      ? "تم التسليم، تم تحديث المخزون وإتاحة المركبة ✅"
      : (result.isRoutingDispatch && !result.hasWarehouse)
        ? "تم التسليم، المركبة متاحة الآن ✅"
        : "تم تأكيد التوصيل، بانتظار استلام المستودع",
  });
});

// ── مسؤول الفسوحات: تصريح/مرجع خاص برحلة توجيه واحدة ─────────────────────
router.put("/supply-request-trips/:id/fsohat-confirm", requireRole(["fsohat", "admin"]), upload.single("invoice_file"), (req, res) => {
  const { reference_no, confirmed_by } = req.body;
  const submittedAttachments = req.body.attachments !== undefined
    ? parseClientRoutingAttachments(req.body.attachments, "fsohat_permit")
    : req.file
      ? [{ kind: "fsohat_permit", url: `/api/uploads/${req.file.filename}`, file_name: req.file.originalname, sort_order: 0 }]
      : [];
  if (submittedAttachments === false) return void res.status(400).json({ error: "قائمة ملفات الفسح غير صالحة" });
  const invoiceUrl = submittedAttachments[0]?.url || null;
  if (!reference_no) return void res.status(400).json({ error: "رقم المرجع مطلوب" });
  const result = db.transaction(() => {
    const trip = db.prepare(`
      SELECT t.supply_request_id, t.status, t.attachments_json, sr.routing_dispatch_id
      FROM supply_request_trips t JOIN supply_requests sr ON sr.id=t.supply_request_id
      WHERE t.id=?
    `).get(req.params.id) as {
      supply_request_id: number; status: string; routing_dispatch_id: number | null; attachments_json: string | null;
    } | undefined;
    if (!trip) return { missing: true as const };
    if (!trip.routing_dispatch_id) return { notRouting: true as const };
    if (trip.status !== "assigned") return { conflict: true as const };
    const attachmentsJson = submittedAttachments.length
      ? JSON.stringify(mergeRoutingAttachments(
          trip.attachments_json,
          submittedAttachments.map(item => ({ ...item, reference_no: String(reference_no).trim() })),
        ))
      : trip.attachments_json;
    db.prepare(`
      UPDATE supply_request_trips
      SET reference_no=?, invoice_image_url=COALESCE(?,invoice_image_url),
          attachments_json=?, status='in_transit', updated_at=datetime('now')
      WHERE id=? AND status='assigned'
    `).run(reference_no, invoiceUrl, attachmentsJson, req.params.id);
    syncRoutingTripLog(Number(req.params.id));
    const remaining = (db.prepare(`
      SELECT COUNT(*) AS count FROM supply_request_trips
      WHERE supply_request_id=? AND status IN ('assigned','pending_permit')
    `).get(trip.supply_request_id) as { count: number }).count;
    if (remaining === 0) {
      db.prepare("UPDATE supply_requests SET status='in_transit', approved_by=?, updated_at=datetime('now') WHERE id=? AND status NOT IN ('completed','cancelled')")
        .run(confirmed_by || null, trip.supply_request_id);
    }
    return { ok: true as const };
  })();
  if (result.missing) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (result.notRouting) return void res.status(400).json({ error: "هذه الرحلة ليست ضمن توجيه" });
  if (result.conflict) return void res.status(409).json({ error: "الرحلة ليست بانتظار الفسوحات" });
  res.json({ message: "تم التأكيد، السيارة في الطريق" });
});

router.put("/supply-request-trips/:id/fsohat-update", requireRole(["fsohat", "admin"]), upload.single("invoice_file"), (req, res) => {
  const { reference_no } = req.body;
  const submittedAttachments = req.body.attachments !== undefined
    ? parseClientRoutingAttachments(req.body.attachments, "fsohat_permit")
    : req.file
      ? [{ kind: "fsohat_permit", url: `/api/uploads/${req.file.filename}`, file_name: req.file.originalname, sort_order: 0 }]
      : [];
  if (submittedAttachments === false) return void res.status(400).json({ error: "قائمة ملفات الفسح غير صالحة" });
  const invoiceUrl = submittedAttachments[0]?.url || null;
  const result = db.transaction(() => {
    const trip = db.prepare(`
      SELECT t.status, t.attachments_json, sr.routing_dispatch_id FROM supply_request_trips t
      JOIN supply_requests sr ON sr.id=t.supply_request_id WHERE t.id=?
    `).get(req.params.id) as { status: string; routing_dispatch_id: number | null; attachments_json: string | null } | undefined;
    if (!trip) return { missing: true as const };
    if (!trip.routing_dispatch_id) return { notRouting: true as const };
    if (trip.status !== "in_transit") return { conflict: true as const };
    const attachmentsJson = submittedAttachments.length
      ? JSON.stringify(mergeRoutingAttachments(
          trip.attachments_json,
          submittedAttachments.map(item => ({
            ...item,
            ...(reference_no ? { reference_no: String(reference_no).trim() } : {}),
          })),
          "fsohat_permit",
        ))
      : trip.attachments_json;
    const changed = db.prepare(`
      UPDATE supply_request_trips
      SET reference_no=COALESCE(?,reference_no), invoice_image_url=COALESCE(?,invoice_image_url),
          attachments_json=?, updated_at=datetime('now')
      WHERE id=? AND status='in_transit'
    `).run(reference_no || null, invoiceUrl, attachmentsJson, req.params.id).changes;
    if (!changed) return { conflict: true as const };
    syncRoutingTripLog(Number(req.params.id));
    return { ok: true as const };
  })();
  if (result.missing) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (result.notRouting) return void res.status(400).json({ error: "هذه الرحلة ليست ضمن توجيه" });
  if (result.conflict) return void res.status(409).json({ error: "يمكن تعديل الرحلات المؤكدة فقط" });
  res.json({ message: "تم التحديث" });
});

router.put("/supply-request-trips/:id/fsohat-recall", requireRole(["fsohat", "admin"]), (req, res) => {
  const result = db.transaction(() => {
    const trip = db.prepare(`
      SELECT t.supply_request_id, t.status, t.attachments_json, sr.routing_dispatch_id FROM supply_request_trips t
      JOIN supply_requests sr ON sr.id=t.supply_request_id WHERE t.id=?
    `).get(req.params.id) as {
      supply_request_id: number; status: string; routing_dispatch_id: number | null; attachments_json: string | null;
    } | undefined;
    if (!trip) return { missing: true as const };
    if (!trip.routing_dispatch_id) return { notRouting: true as const };
    if (trip.status !== "in_transit") return { conflict: true as const };
    const attachmentsJson = JSON.stringify(readRoutingAttachments(trip.attachments_json)
      .filter(item => item.kind !== "fsohat_permit"));
    db.prepare(`
      UPDATE supply_request_trips SET status='assigned', reference_no=NULL, invoice_image_url=NULL,
        attachments_json=?, updated_at=datetime('now') WHERE id=? AND status='in_transit'
    `).run(attachmentsJson, req.params.id);
    syncRoutingTripLog(Number(req.params.id));
    const inTransit = (db.prepare(`
      SELECT COUNT(*) AS count FROM supply_request_trips
      WHERE supply_request_id=? AND status='in_transit'
    `).get(trip.supply_request_id) as { count: number }).count;
    if (inTransit === 0) {
      db.prepare("UPDATE supply_requests SET status='assigned', reference_no=NULL, invoice_image=NULL, updated_at=datetime('now') WHERE id=?")
        .run(trip.supply_request_id);
    }
    return { ok: true as const };
  })();
  if (result.missing) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (result.notRouting) return void res.status(400).json({ error: "هذه الرحلة ليست ضمن توجيه" });
  if (result.conflict) return void res.status(409).json({ error: "يمكن سحب الرحلات المؤكدة فقط" });
  res.json({ message: "تم سحب التأكيد، الرحلة عادت لبانتظار التأكيد" });
});

// ── مسؤول الفسوحات: تأكيد (رفع ملف الفاتورة + رقم المرجع) للطلب العادي ────
router.put("/supply-requests/:id/fsohat-confirm", requireRole(["fsohat", "admin"]), upload.single("invoice_file"), (req, res) => {
  const { reference_no, confirmed_by } = req.body;
  const invoice_url = req.file ? `/api/uploads/${req.file.filename}` : undefined;
  const existing = db.prepare("SELECT routing_dispatch_id FROM supply_requests WHERE id=?")
    .get(req.params.id) as { routing_dispatch_id: number | null } | undefined;
  if (!existing) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (existing.routing_dispatch_id) return void res.status(400).json({ error: "يجب تأكيد كل رحلة توجيه بشكل منفصل" });

  // Build update keeping existing invoice if no new file uploaded
  if (invoice_url !== undefined) {
    db.prepare(`
      UPDATE supply_requests
       SET invoice_image=?, reference_no=?,
           cargo_type=CASE WHEN routing_dispatch_id IS NOT NULL THEN cargo_type ELSE ? END,
          status='in_transit', approved_by=?,
          updated_at=datetime('now')
      WHERE id=?
    `).run(invoice_url, reference_no || null, reference_no || null, confirmed_by || null, req.params.id);
  } else {
    db.prepare(`
      UPDATE supply_requests
       SET reference_no=?, cargo_type=CASE WHEN routing_dispatch_id IS NOT NULL THEN cargo_type ELSE ? END,
          status='in_transit', approved_by=?,
          updated_at=datetime('now')
      WHERE id=?
    `).run(reference_no || null, reference_no || null, confirmed_by || null, req.params.id);
  }

  db.prepare(`
    UPDATE supply_request_trips
    SET status='in_transit', updated_at=datetime('now')
    WHERE supply_request_id=? AND status='assigned'
  `).run(req.params.id);
  res.json({ message: "تم التأكيد، السيارة في الطريق" });
});

// ── مسؤل الفسوحات: تعديل بعد التأكيد ──────────────────────────────────────
router.put("/supply-requests/:id/fsohat-update", requireRole(["fsohat", "admin"]), upload.single("invoice_file"), (req, res) => {
  const { reference_no } = req.body;
  const invoice_url = req.file ? `/api/uploads/${req.file.filename}` : undefined;
  const existing = db.prepare("SELECT routing_dispatch_id FROM supply_requests WHERE id=?")
    .get(req.params.id) as { routing_dispatch_id: number | null } | undefined;
  if (!existing) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (existing.routing_dispatch_id) return void res.status(400).json({ error: "يجب تعديل كل رحلة توجيه بشكل منفصل" });

  if (invoice_url !== undefined) {
    db.prepare(`
      UPDATE supply_requests
       SET reference_no=?,
           cargo_type=CASE WHEN routing_dispatch_id IS NOT NULL THEN cargo_type ELSE ? END,
           invoice_image=?,
          updated_at=datetime('now')
      WHERE id=? AND status='in_transit'
    `).run(reference_no || null, reference_no || null, invoice_url, req.params.id);
  } else {
    db.prepare(`
      UPDATE supply_requests
       SET reference_no=?, cargo_type=CASE WHEN routing_dispatch_id IS NOT NULL THEN cargo_type ELSE ? END,
          updated_at=datetime('now')
      WHERE id=? AND status='in_transit'
    `).run(reference_no || null, reference_no || null, req.params.id);
  }
  res.json({ message: "تم التحديث" });
});

// ── مسؤل الفسوحات: سحب التأكيد (إعادة إلى assigned) ──────────────────────
router.put("/supply-requests/:id/fsohat-recall", requireRole(["fsohat", "admin"]), (req, res) => {
  const sr = db.prepare("SELECT status, routing_dispatch_id FROM supply_requests WHERE id=?")
    .get(req.params.id) as { status: string; routing_dispatch_id: number | null } | undefined;
  if (!sr) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (sr.routing_dispatch_id) return void res.status(400).json({ error: "يجب سحب تأكيد كل رحلة توجيه بشكل منفصل" });
  if (sr.status !== "in_transit") return void res.status(403).json({ error: "يمكن سحب الطلبات في الطريق فقط" });

  db.prepare(`
    UPDATE supply_requests
    SET status='assigned', invoice_image=NULL, reference_no=NULL,
        cargo_type=CASE WHEN routing_dispatch_id IS NOT NULL THEN cargo_type ELSE NULL END,
        updated_at=datetime('now')
    WHERE id=?
  `).run(req.params.id);
  db.prepare(`
    UPDATE supply_request_trips
    SET status='assigned', updated_at=datetime('now')
    WHERE supply_request_id=? AND status='in_transit'
  `).run(req.params.id);
  res.json({ message: "تم سحب التأكيد، الطلب عاد لبانتظار التأكيد" });
});

// ── السائق: تأكيد التحميل (رفع صورة فاتورة + رقم الفسح) ──────────────────────
router.put("/supply-requests/:id/driver-load", upload.single("loading_image"), (req, res) => {
  const { permit_number } = req.body;
  const image_url = req.file ? `/api/uploads/${req.file.filename}` : null;
  db.prepare(`
    UPDATE supply_requests
    SET driver_loading_image=?, permit_number=?,
        status='loaded', loaded_at=datetime('now'),
        updated_at=datetime('now')
    WHERE id=?
  `).run(image_url, permit_number || null, req.params.id);
  res.json({ message: "تم تأكيد التحميل", image_url });
});

// ── السائق: تأكيد التوصيل للمستودع ──────────────────────────────────────────
router.put("/supply-requests/:id/driver-deliver", (req, res) => {
  const deliver = db.transaction(() => {
    const requestId = Number(req.params.id);
    const sr = db.prepare("SELECT status, warehouse_id, routing_dispatch_id, vehicle_plate FROM supply_requests WHERE id=?")
      .get(requestId) as {
        status: string; warehouse_id: number | null; routing_dispatch_id: number | null; vehicle_plate: string | null;
      } | undefined;
    if (!sr) return { missing: true as const };
    if (sr.routing_dispatch_id) return { routingDispatch: true as const };
    if (["completed", "cancelled"].includes(sr.status)) return { conflict: true as const };
    const approvalRequired = warehouseRequiresApproval(sr.warehouse_id);
    if (!approvalRequired) {
      const caller = getAuthenticatedCaller(req);
      if (!caller) return { unauthenticated: true as const };
      if (!driverOwnsSupplyRequest(caller, requestId, sr.vehicle_plate)) return { forbidden: true as const };
      if (sr.status !== "loaded") return { notLoaded: true as const };
    }
    const children = db.prepare("SELECT status FROM supply_request_trips WHERE supply_request_id=?")
      .all(requestId) as { status: string }[];
    if (children.length && (
      children.some(child => !["delivered_to_warehouse", "pending_warehouse_approval", "completed", "cancelled", "rejected"].includes(child.status))
      || !children.some(child => ["delivered_to_warehouse", "pending_warehouse_approval"].includes(child.status))
    )) {
      return { undelivered: true as const };
    }
    const changed = db.prepare(`
      UPDATE supply_requests
      SET status='delivered_to_warehouse',
          delivered_at=COALESCE(delivered_at,datetime('now')),
          updated_at=datetime('now')
      WHERE id=? AND status NOT IN ('completed','cancelled')
    `).run(requestId).changes;
    if (!changed) return { conflict: true as const };
    if (!approvalRequired) {
      const finalized = finalizeWarehouseRequest(requestId, ["delivered_to_warehouse", "pending_warehouse_approval"]);
      return { finalized: finalized.success };
    }
    return { finalized: false };
  });
  const result = deliver();
  if ("missing" in result) return void res.status(404).json({ error: "الطلب غير موجود" });
  if ("routingDispatch" in result) return void res.status(409).json({ error: "يجب تأكيد وصول كل رحلة عبر إجراء السائق الخاص بها" });
  if ("unauthenticated" in result) return void res.status(401).json({ error: "يلزم تسجيل الدخول بحساب السائق" });
  if ("forbidden" in result) return void res.status(403).json({ error: "لا يمكنك تأكيد توصيل طلب غير مسند إلى مركبتك" });
  if ("notLoaded" in result) return void res.status(409).json({ error: "يجب تأكيد تحميل الطلب قبل توصيله" });
  if ("conflict" in result) return void res.status(409).json({ error: "لا يمكن تأكيد توصيل طلب مكتمل أو ملغى" });
  if ("undelivered" in result) return void res.status(409).json({ error: "لا يمكن تأكيد وصول الطلب قبل وصول جميع الرحلات النشطة" });
  res.json({
    message: result.finalized
      ? "تم التسليم، تم تحديث المخزون وإتاحة المركبة ✅"
      : "تم تأكيد التوصيل، بانتظار استلام المستودع",
  });
});

// ── مدير المستودع: توجيه السيارة لموقع آخر ──────────────────────────────────
router.put("/supply-requests/:id/redirect", (req, res) => {
  const { redirect_location } = req.body;
  if (!redirect_location) return void res.status(400).json({ error: "الموقع الجديد مطلوب" });
  db.prepare(`
    UPDATE supply_requests
    SET redirect_location=?, status='redirected', updated_at=datetime('now')
    WHERE id=?
  `).run(redirect_location, req.params.id);
  res.json({ message: "تم توجيه السيارة" });
});

// ── مدير المستودع: تأكيد وصول الشحنة للوجهة المُحوَّلة إليها ─────────────
router.put("/supply-requests/:id/confirm-redirect-delivery", (req, res) => {
  const sr = db.prepare("SELECT status FROM supply_requests WHERE id=?").get(req.params.id) as { status: string } | undefined;
  if (!sr) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (sr.status !== "redirected") return void res.status(409).json({ error: "الطلب ليس في حالة إعادة توجيه" });
  db.prepare(`
    UPDATE supply_requests
    SET status='completed', updated_at=datetime('now')
    WHERE id=?
  `).run(req.params.id);
  res.json({ message: "تم تأكيد التسليم للوجهة" });
});

// ── مدير المستودع: تأكيد الاستلام (→ pending_warehouse_approval, بدون إضافة مخزون بعد) ──
router.put("/supply-requests/:id/receive", (req, res) => {
  const { receive_notes } = req.body;
  const requestInfo = db.prepare("SELECT routing_dispatch_id, warehouse_id FROM supply_requests WHERE id=?")
    .get(req.params.id) as { routing_dispatch_id: number | null; warehouse_id: number | null } | undefined;
  if (!requestInfo) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (requestInfo.routing_dispatch_id) {
    const access = routingWarehouseAccess(req, requestInfo.warehouse_id);
    if (access === "unauthenticated") return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    if (access === "forbidden") return void res.status(403).json({ error: "يجب أن تكون مسؤول المستودع المعيّن لهذا الطلب" });
  }
  const receive = db.transaction(() => {
    const sr = db.prepare("SELECT status FROM supply_requests WHERE id=?").get(req.params.id) as { status: string } | undefined;
    if (!sr) return { missing: true as const };
    if (sr.status !== "delivered_to_warehouse") return { conflict: true as const };
    if (!warehouseRequiresApproval(requestInfo.warehouse_id)) {
      const finalized = finalizeWarehouseRequest(Number(req.params.id), ["delivered_to_warehouse"]);
      if (finalized.success) return { ok: true as const, autoFinalized: true as const };
      if (finalized.undelivered) return { undelivered: true as const };
      return { conflict: true as const };
    }
    const children = db.prepare("SELECT status FROM supply_request_trips WHERE supply_request_id=?").all(req.params.id) as { status: string }[];
    if (children.some(t => !["delivered_to_warehouse", "pending_warehouse_approval", "completed", "cancelled", "rejected"].includes(t.status))) {
      return { undelivered: true as const };
    }
    const changed = db.prepare(`
      UPDATE supply_requests
      SET status='pending_warehouse_approval', notes=COALESCE(?,notes), updated_at=datetime('now')
      WHERE id=? AND status='delivered_to_warehouse'
    `).run(receive_notes || null, req.params.id).changes;
    if (!changed) return { conflict: true as const };
    db.prepare(`
      UPDATE supply_request_trips SET status='pending_warehouse_approval', updated_at=datetime('now')
      WHERE supply_request_id=? AND status='delivered_to_warehouse'
    `).run(req.params.id);
    const arrivedTrips = db.prepare(`
      SELECT id FROM supply_request_trips
      WHERE supply_request_id=? AND status='pending_warehouse_approval'
    `).all(req.params.id) as { id: number }[];
    arrivedTrips.forEach(trip => syncRoutingTripLog(trip.id));
    return { ok: true as const, autoFinalized: false as const };
  });
  const result = receive();
  if (result.missing) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (result.conflict) return void res.status(409).json({ error: "لا يمكن الاستلام قبل أن يسلّم السائق الشحنة" });
  if (result.undelivered) return void res.status(409).json({ error: "لا يمكن الاستلام قبل تسليم جميع الرحلات النشطة" });
  res.json({
    message: result.autoFinalized
      ? "تم الاستلام، تم تحديث المخزون وإتاحة المركبة ✅"
      : "تم تأكيد الاستلام — بانتظار موافقة المستودع",
  });
});

// ── مدير المستودع: الموافقة النهائية (→ completed، يُضاف المخزون، تتحرر السيارة) ──
router.put("/supply-requests/:id/approve", (req, res) => {
  const requestInfo = db.prepare("SELECT routing_dispatch_id, warehouse_id FROM supply_requests WHERE id=?")
    .get(req.params.id) as { routing_dispatch_id: number | null; warehouse_id: number | null } | undefined;
  if (!requestInfo) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (requestInfo.routing_dispatch_id) {
    const access = routingWarehouseAccess(req, requestInfo.warehouse_id);
    if (access === "unauthenticated") return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    if (access === "forbidden") return void res.status(403).json({ error: "يجب أن تكون مسؤول المستودع المعيّن لهذا الطلب" });
  }
  const approve = db.transaction(() => {
    const sr = db.prepare("SELECT * FROM supply_requests WHERE id=?").get(req.params.id) as {
      id: number; warehouse_id: number; product_name: string; requested_qty: number;
      unit: string; vehicle_plate: string | null;
      routing_dispatch_id: number | null; driver_expense: number | null; rental: number | null;
      destination_division: string | null; warehouse_name: string | null;
      permit_image_url: string | null; customer_name: string | null; customer_type: string | null;
      invoice_image: string | null; cargo_type: string | null; reference_no: string | null;
      rep_name: string | null; rep_phone: string | null; status: string;
    } | undefined;
    if (!sr) return { missing: true as const };
    if (sr.status !== "pending_warehouse_approval") return { conflict: true as const };

    const children = db.prepare(`
      SELECT id, status, vehicle_plate, driver_name, driver_phone, driver_loading_image,
             permit_image_url, invoice_image_url, reference_no
      FROM supply_request_trips WHERE supply_request_id=?
    `).all(sr.id) as {
      id: number; status: string; vehicle_plate: string | null; driver_name: string | null;
      driver_phone: string | null; driver_loading_image: string | null; permit_image_url: string | null;
      invoice_image_url: string | null; reference_no: string | null;
    }[];
    const eligible = children.filter(t => ["delivered_to_warehouse", "pending_warehouse_approval"].includes(t.status));
    const unfinished = children.some(t =>
      !["delivered_to_warehouse", "pending_warehouse_approval", "cancelled", "rejected", "completed"].includes(t.status)
    );
    if (unfinished || (sr.routing_dispatch_id && children.length === 0) || (children.length > 0 && eligible.length === 0)) {
      return { undelivered: true as const };
    }

    const claimed = db.prepare(`
      UPDATE supply_requests SET status='completed', updated_at=datetime('now')
      WHERE id=? AND status='pending_warehouse_approval'
    `).run(sr.id).changes;
    if (claimed !== 1) return { conflict: true as const };

    const inventoryQuantity = sr.routing_dispatch_id ? eligible.length : sr.requested_qty;
    if (sr.warehouse_id && inventoryQuantity > 0) {
      const existing = db.prepare(
        "SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_name=?"
      ).get(sr.warehouse_id, sr.product_name) as { id: number } | undefined;
      if (existing) {
        db.prepare("UPDATE warehouse_items SET quantity=quantity+?, last_updated=datetime('now') WHERE id=?")
          .run(inventoryQuantity, existing.id);
      } else {
        db.prepare(
          "INSERT INTO warehouse_items (warehouse_id, product_name, quantity, unit, min_stock, max_stock) VALUES (?,?,?,?,0,0)"
        ).run(sr.warehouse_id, sr.product_name, inventoryQuantity, sr.unit || "وحدة");
      }
    }

    db.prepare(`
      UPDATE supply_request_trips SET status='completed', updated_at=datetime('now')
      WHERE supply_request_id=? AND status IN ('delivered_to_warehouse','pending_warehouse_approval')
    `).run(sr.id);

    if (sr.routing_dispatch_id) {
      const today = new Date().toISOString().slice(0, 10);
      for (const t of eligible) {
        if (!t.vehicle_plate) continue;
        db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(t.vehicle_plate);
        db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(t.vehicle_plate);
        syncRoutingTripLog(t.id, { createIfMissing: true, fallbackDate: today });
      }
    } else if (children.length > 0) {
      for (const t of eligible) {
        if (!t.vehicle_plate) continue;
        db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(t.vehicle_plate);
        db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(t.vehicle_plate);
      }
    } else if (sr.vehicle_plate) {
      db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(sr.vehicle_plate);
      db.prepare("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?").run(sr.vehicle_plate);
    }
    return { success: true as const };
  });
  const result = approve();
  if (result.missing) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (result.conflict) return void res.status(409).json({ error: "تمت الموافقة على الطلب مسبقاً أو لم يصل إلى مرحلة الموافقة" });
  if (result.undelivered) return void res.status(409).json({ error: "لا يمكن الموافقة قبل تسليم جميع الرحلات النشطة" });
  res.json({ message: "تمت الموافقة — المخزون حُدِّث والسيارة أُفرجت" });
});

// ── Invoice / Auto-Replenishment Settings ─────────────────────────────────────
router.get("/invoice-settings", (_req, res) => {
  res.json(db.prepare("SELECT * FROM invoice_settings WHERE id=1").get() || {});
});

router.put("/invoice-settings", (req, res) => {
  const { auto_replenishment, auto_invoice_enabled, auto_invoice_categories, prices_locked } = req.body;
  db.prepare(
    "UPDATE invoice_settings SET auto_replenishment=?,auto_invoice_enabled=?,auto_invoice_categories=?,prices_locked=?,updated_at=datetime('now') WHERE id=1"
  ).run(
    auto_replenishment ? 1 : 0,
    auto_invoice_enabled ? 1 : 0,
    JSON.stringify(auto_invoice_categories || []),
    prices_locked ? 1 : 0,
  );
  res.json({ message: "تم الحفظ" });
});

export default router;
