import { Router } from "express";
import multer from "multer";
import { execute, executeBatch, queryAll, queryOne } from "../lib/erp-sql.js";
import { isSysAdminToken } from "./auth.js";
import { deletePendingRoutingTripLog, syncRoutingTripLog } from "./routing-trip-log.js";
import { r2MulterStorage, uniqueUploadName } from "../lib/r2-storage.js";

const upload = multer({
  storage: r2MulterStorage(name => uniqueUploadName("sr-", name)),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const router = Router();

async function authorizedRole(req: import("express").Request, roles: string[]): Promise<boolean> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (await isSysAdminToken(token)) return true;
  const user = await queryOne<{ role: string }>(`
    SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
  `, token);
  return !!user && roles.includes(user.role);
}

type AuthenticatedCaller = { id: number; role: string; phone: string; name: string; hiddenAdmin?: boolean };

async function getAuthenticatedCaller(req: import("express").Request): Promise<AuthenticatedCaller | null> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === "guest") return null;
  if (await isSysAdminToken(token)) return { id: 0, role: "admin", phone: "", name: "", hiddenAdmin: true };
  return await queryOne<AuthenticatedCaller>(`
    SELECT u.id, u.role, u.phone, u.name FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
  `, token) || null;
}

async function driverOwnsTrip(caller: AuthenticatedCaller, tripId: string): Promise<boolean> {
  if (!caller.phone || caller.hiddenAdmin) return false;
  return Boolean(await queryOne(`
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
  `, tripId, caller.phone, caller.phone, caller.phone, caller.id));
}

async function driverOwnsSupplyRequest(
  caller: AuthenticatedCaller,
  requestId: number,
  vehiclePlate: string | null,
): Promise<boolean> {
  if (!caller.phone || caller.hiddenAdmin || !["driver", "vehicle"].includes(caller.role) || !vehiclePlate) return false;
  if (caller.role === "vehicle" && caller.phone.trim().toLocaleLowerCase() === vehiclePlate.trim().toLocaleLowerCase()) {
    return true;
  }
  return Boolean(await queryOne(`
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
  `, requestId, vehiclePlate, caller.phone, caller.phone, caller.phone, caller.id));
}

async function routingWarehouseAccess(req: import("express").Request, warehouseId: number | null): Promise<"allowed" | "unauthenticated" | "forbidden"> {
  const caller = await getAuthenticatedCaller(req);
  if (!caller) return "unauthenticated";
  if (caller.hiddenAdmin || caller.role === "admin") return "allowed";
  if (!warehouseId || !["warehouse_manager", "warehouse"].includes(caller.role)) return "forbidden";
  const warehouse = await queryOne<{ warehouse_manager_user_id: number | null; manager_name: string | null }>(`
    SELECT warehouse_manager_user_id, manager_name FROM warehouses WHERE id=?
  `, warehouseId);
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
  return async (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    if (!await authorizedRole(req, roles)) return void res.status(403).json({ error: "ليس لديك صلاحية لتنفيذ هذا الإجراء" });
    next();
  };
}

async function warehouseRequiresApproval(warehouseId: unknown): Promise<boolean> {
  const id = Number(warehouseId);
  if (!Number.isSafeInteger(id) || id <= 0) return true;
  const setting = await queryOne<{ requires_approval: number }>(
    "SELECT requires_approval FROM warehouse_approval_settings WHERE warehouse_id=?", id,
  );
  return setting?.requires_approval !== 0;
}

type WarehouseFinalizationResult = {
  success: boolean;
  missing: boolean;
  conflict: boolean;
  undelivered: boolean;
};

async function updateRoutingRequestAggregateStatus(
  requestId: number,
  allowReopenTerminalParent = false,
): Promise<void> {
  const trips = await queryAll<{ status: string }>(
    "SELECT status FROM supply_request_trips WHERE supply_request_id=?", requestId,
  );
  if (!trips.length) return;
  const parent = await queryOne<{ status: string; route_type: string | null }>(`
    SELECT sr.status, rd.route_type
    FROM supply_requests sr
    LEFT JOIN routing_dispatches rd ON rd.id=sr.routing_dispatch_id
    WHERE sr.id=?
  `, requestId);
  if (!parent) return;
  const terminalParent = ["cancelled", "rejected", "completed", "delivered_to_warehouse"].includes(parent.status);
  if (parent.status === "cancelled" && !allowReopenTerminalParent) return;

  const resolved = trips.every(t => ["completed", "cancelled", "rejected"].includes(t.status));
  const allArrived = trips.every(t =>
    ["delivered_to_warehouse", "pending_warehouse_approval", "completed", "cancelled", "rejected"].includes(t.status)
  );
  if (resolved) {
    await execute(`
      UPDATE supply_requests SET status='completed', updated_at=datetime('now')
      WHERE id=? AND (status NOT IN ('cancelled','rejected') OR ?=1)
    `, requestId, allowReopenTerminalParent ? 1 : 0);
  } else if (allArrived) {
    await execute(`
      UPDATE supply_requests SET status='delivered_to_warehouse', updated_at=datetime('now')
      WHERE id=? AND (status NOT IN ('cancelled','rejected') OR ?=1)
    `, requestId, allowReopenTerminalParent ? 1 : 0);
  } else if (allowReopenTerminalParent && terminalParent) {
    const initialStatus = parent.route_type === "via_fusahat" ? "assigned" : "in_transit";
    await execute("UPDATE supply_requests SET status=?, updated_at=datetime('now') WHERE id=?", initialStatus, requestId);
  }
}

async function finalizeRoutingTrip(tripId: number, acceptedStatuses: string[]): Promise<{ success: boolean; missing?: boolean; conflict?: boolean; notRouting?: boolean }> {
  const trip = await queryOne<{
    id: number; supply_request_id: number; status: string; vehicle_plate: string | null;
    cargo_items_json: string | null; warehouse_id: number | null; routing_dispatch_id: number | null;
    product_name: string; unit: string;
  }>(`
    SELECT t.id, t.supply_request_id, t.status, t.vehicle_plate, t.cargo_items_json,
           sr.warehouse_id, sr.routing_dispatch_id, sr.product_name, sr.unit
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id=t.supply_request_id
    WHERE t.id=?
  `, tripId);
  if (!trip) return { success: false, missing: true };
  if (!trip.routing_dispatch_id) return { success: false, notRouting: true };
  if (!acceptedStatuses.includes(trip.status)) return { success: false, conflict: true };

  const claimed = await execute(`
    UPDATE supply_request_trips SET status='completed', updated_at=datetime('now')
    WHERE id=? AND status IN (${acceptedStatuses.map(() => "?").join(",")})
  `, trip.id, ...acceptedStatuses);
  if (claimed.changes !== 1) return { success: false, conflict: true };

  if (trip.warehouse_id) {
    const cargoItems = readRoutingCargoItems(trip.cargo_items_json);
    const products = new Map<number, { name: string; unit: string; quantity: number }>();
    for (const cargo of cargoItems) {
      let productId = cargo.product_id || null;
      let product = productId
        ? await queryOne<{ id: number; name: string; unit: string | null }>(
            "SELECT id, name, unit FROM products WHERE id=?", productId,
          )
        : undefined;
      if (!product) {
        product = await queryOne<{ id: number; name: string; unit: string | null }>(
          "SELECT id, name, unit FROM products WHERE lower(trim(name))=lower(trim(?)) LIMIT 1"
        , cargo.cargo_type);
        productId = product?.id ?? null;
      }
      if (!productId || !product || !cargo.quantity) continue;
      const current = products.get(productId);
      products.set(productId, {
        name: product.name,
        unit: product.unit || cargo.unit || "حبة",
        quantity: (current?.quantity || 0) + cargo.quantity,
      });
    }

    if (products.size) {
      for (const [productId, product] of products) {
        const existing = await queryOne<{ id: number }>(
          "SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_id=?"
        , trip.warehouse_id, productId);
        if (existing) {
          await execute("UPDATE warehouse_items SET quantity=quantity+?, unit=?, last_updated=datetime('now') WHERE id=?",
            product.quantity, product.unit, existing.id);
        } else {
          const unlinked = await queryOne<{ id: number }>(
            "SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_name=? AND product_id IS NULL LIMIT 1"
          , trip.warehouse_id, product.name);
          if (unlinked) {
            await execute("UPDATE warehouse_items SET product_id=?, quantity=quantity+?, unit=?, last_updated=datetime('now') WHERE id=?",
              productId, product.quantity, product.unit, unlinked.id);
          } else {
            await execute(
              "INSERT INTO warehouse_items (warehouse_id, product_name, product_id, quantity, unit, min_stock) VALUES (?,?,?,?,?,0)"
            , trip.warehouse_id, product.name, productId, product.quantity, product.unit);
          }
        }
        const stock = await queryOne<{ total: number }>(
          "SELECT COALESCE(SUM(quantity),0) AS total FROM warehouse_items WHERE product_id=?"
        , productId);
        await execute("UPDATE products SET stock=? WHERE id=?", stock?.total ?? 0, productId);
      }
    } else if (trip.product_name) {
      const existing = await queryOne<{ id: number }>(
        "SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_name=?"
      , trip.warehouse_id, trip.product_name);
      if (existing) {
        await execute("UPDATE warehouse_items SET quantity=quantity+1, last_updated=datetime('now') WHERE id=?", existing.id);
      } else {
        await execute(
          "INSERT INTO warehouse_items (warehouse_id, product_name, quantity, unit, min_stock, max_stock) VALUES (?,?,1,?,0,0)"
        , trip.warehouse_id, trip.product_name, trip.unit || "وحدة");
      }
    }
  }

  if (trip.vehicle_plate) {
    await execute("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?", trip.vehicle_plate);
    await execute("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?", trip.vehicle_plate);
  }
  await syncRoutingTripLog(trip.id, {
    createIfMissing: true,
    fallbackDate: new Date().toISOString().slice(0, 10),
  });
  await updateRoutingRequestAggregateStatus(trip.supply_request_id, acceptedStatuses.includes("cancelled"));
  return { success: true };
}

/**
 * Supervisor-only recovery for a cancelled routing trip. The existing
 * finalization claim keeps its stock and release effects idempotent.
 */
export async function completeCancelledRoutingDispatchTrip(tripId: number) {
  return finalizeRoutingTrip(tripId, ["cancelled"]);
}

/**
 * Restore one cancelled routing trip without changing its sibling assignments.
 */
export async function restoreCancelledRoutingDispatchTrip(tripId: number): Promise<
  { success: true } | { success: false; missing?: boolean; conflict?: boolean; notRouting?: boolean }
> {
  const trip = await queryOne<{
    id: number; supply_request_id: number; status: string; vehicle_plate: string | null;
    routing_dispatch_id: number | null; route_type: string | null;
  }>(`
    SELECT t.id, t.supply_request_id, t.status, t.vehicle_plate,
           sr.routing_dispatch_id, rd.route_type
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id=t.supply_request_id
    LEFT JOIN routing_dispatches rd ON rd.id=sr.routing_dispatch_id
    WHERE t.id=?
  `, tripId);
  if (!trip) return { success: false, missing: true };
  if (!trip.routing_dispatch_id) return { success: false, notRouting: true };
  if (trip.status !== "cancelled") return { success: false, conflict: true };

  const initialStatus = trip.route_type === "via_fusahat" ? "assigned" : "in_transit";
  const restored = await execute(`
    UPDATE supply_request_trips
    SET status=?, delivered_at=NULL, loaded_at=NULL, updated_at=datetime('now')
    WHERE id=? AND status='cancelled'
  `, initialStatus, trip.id);
  if (restored.changes !== 1) return { success: false, conflict: true };

  if (trip.vehicle_plate) {
    await execute("UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?", trip.vehicle_plate);
    await execute("UPDATE driver_profiles SET status='في رحلة' WHERE vehicle_plate=?", trip.vehicle_plate);
  }
  await updateRoutingRequestAggregateStatus(trip.supply_request_id, true);
  await syncRoutingTripLog(trip.id, { createIfMissing: true });
  return { success: true };
}

/**
 * Finalizes an arrived supply request using the same stock, trip-snapshot, and
 * vehicle-release work as the warehouse approval action. Callers must run this
 * inside their transaction so its status claim and all side effects are atomic.
 */
async function finalizeWarehouseRequest(
  requestId: number,
  acceptedStatuses: string[],
): Promise<WarehouseFinalizationResult> {
  const sr = await queryOne<{
    id: number; warehouse_id: number | null; product_name: string; requested_qty: number;
    unit: string; vehicle_plate: string | null;
    routing_dispatch_id: number | null; driver_expense: number | null; rental: number | null;
    destination_division: string | null; warehouse_name: string | null;
    permit_image_url: string | null; customer_name: string | null; customer_type: string | null;
    invoice_image: string | null; cargo_type: string | null; reference_no: string | null;
    rep_name: string | null; rep_phone: string | null; status: string;
  }>("SELECT * FROM supply_requests WHERE id=?", requestId);
  if (!sr) return { success: false, missing: true, conflict: false, undelivered: false };
  if (!acceptedStatuses.includes(sr.status)) return { success: false, missing: false, conflict: true, undelivered: false };

  const children = await queryAll<{
    id: number; status: string; vehicle_plate: string | null; driver_name: string | null;
    driver_phone: string | null; driver_loading_image: string | null; permit_image_url: string | null;
    invoice_image_url: string | null; reference_no: string | null; cargo_items_json: string | null;
  }>(`
    SELECT id, status, vehicle_plate, driver_name, driver_phone, driver_loading_image,
           permit_image_url, invoice_image_url, reference_no, cargo_items_json
    FROM supply_request_trips WHERE supply_request_id=?
  `, sr.id);
  const eligible = children.filter(t => ["delivered_to_warehouse", "pending_warehouse_approval"].includes(t.status));
  const unfinished = children.some(t =>
    !["delivered_to_warehouse", "pending_warehouse_approval", "cancelled", "rejected", "completed"].includes(t.status)
  );
  if (unfinished || (sr.routing_dispatch_id && children.length === 0) || (children.length > 0 && eligible.length === 0)) {
    return { success: false, missing: false, conflict: false, undelivered: true };
  }

  const placeholders = acceptedStatuses.map(() => "?").join(",");
  const claimed = await execute(`
    UPDATE supply_requests SET status='completed', updated_at=datetime('now')
    WHERE id=? AND status IN (${placeholders})
  `, sr.id, ...acceptedStatuses);
  if (claimed.changes !== 1) return { success: false, missing: false, conflict: true, undelivered: false };

  if (sr.warehouse_id) {
    const routingProducts = new Map<number, { name: string; unit: string; quantity: number }>();
    if (sr.routing_dispatch_id) {
      for (const trip of eligible) {
        for (const cargo of readRoutingCargoItems(trip.cargo_items_json)) {
          let productId = cargo.product_id || null;
          let product = productId
            ? await queryOne<{ id: number; name: string; unit: string | null }>(
                "SELECT id, name, unit FROM products WHERE id=?", productId,
              )
            : undefined;
          if (!product) {
            product = await queryOne<{ id: number; name: string; unit: string | null }>(
              "SELECT id, name, unit FROM products WHERE lower(trim(name))=lower(trim(?)) LIMIT 1"
            , cargo.cargo_type);
            productId = product?.id ?? null;
          }
          if (!productId || !product || !cargo.quantity) continue;
          const current = routingProducts.get(productId);
          routingProducts.set(productId, {
            name: product.name,
            unit: product.unit || cargo.unit || "حبة",
            quantity: (current?.quantity || 0) + cargo.quantity,
          });
        }
      }
    }

    if (routingProducts.size) {
      for (const [productId, product] of routingProducts) {
        const existing = await queryOne<{ id: number }>(
          "SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_id=?"
        , sr.warehouse_id, productId);
        if (existing) {
          await execute("UPDATE warehouse_items SET quantity=quantity+?, unit=?, last_updated=datetime('now') WHERE id=?",
            product.quantity, product.unit, existing.id);
        } else {
          const unlinked = await queryOne<{ id: number }>(
            "SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_name=? AND product_id IS NULL LIMIT 1"
          , sr.warehouse_id, product.name);
          if (unlinked) {
            await execute("UPDATE warehouse_items SET product_id=?, quantity=quantity+?, unit=?, last_updated=datetime('now') WHERE id=?",
              productId, product.quantity, product.unit, unlinked.id);
          } else {
            await execute(
              "INSERT INTO warehouse_items (warehouse_id, product_name, product_id, quantity, unit, min_stock) VALUES (?,?,?,?,?,0)"
            , sr.warehouse_id, product.name, productId, product.quantity, product.unit);
          }
        }
        const stock = await queryOne<{ total: number }>(
          "SELECT COALESCE(SUM(quantity),0) AS total FROM warehouse_items WHERE product_id=?"
        , productId);
        await execute("UPDATE products SET stock=? WHERE id=?", stock?.total ?? 0, productId);
      }
    } else {
      const inventoryQuantity = sr.routing_dispatch_id ? eligible.length : sr.requested_qty;
      if (inventoryQuantity > 0) {
        const existing = await queryOne<{ id: number }>(
          "SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_name=?"
        , sr.warehouse_id, sr.product_name);
        if (existing) {
          await execute("UPDATE warehouse_items SET quantity=quantity+?, last_updated=datetime('now') WHERE id=?",
            inventoryQuantity, existing.id);
        } else {
          await execute(
            "INSERT INTO warehouse_items (warehouse_id, product_name, quantity, unit, min_stock, max_stock) VALUES (?,?,?,?,0,0)"
          , sr.warehouse_id, sr.product_name, inventoryQuantity, sr.unit || "وحدة");
        }
      }
    }
  }

  await execute(`
    UPDATE supply_request_trips SET status='completed', updated_at=datetime('now')
    WHERE supply_request_id=? AND status IN ('delivered_to_warehouse','pending_warehouse_approval')
  `, sr.id);

  if (sr.routing_dispatch_id) {
    const today = new Date().toISOString().slice(0, 10);
    for (const t of eligible) {
      if (!t.vehicle_plate) continue;
      await execute("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?", t.vehicle_plate);
      await execute("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?", t.vehicle_plate);
      await syncRoutingTripLog(t.id, { createIfMissing: true, fallbackDate: today });
    }
  } else if (children.length > 0) {
    for (const t of eligible) {
      if (!t.vehicle_plate) continue;
      await execute("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?", t.vehicle_plate);
      await execute("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?", t.vehicle_plate);
    }
  } else if (sr.vehicle_plate) {
    await execute("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?", sr.vehicle_plate);
    await execute("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?", sr.vehicle_plate);
  }
  return { success: true, missing: false, conflict: false, undelivered: false };
}

/**
 * Complete a delivered routing request after sibling trips have been cancelled,
 * but only when that warehouse has opted out of its approval step.
 * Returns true only when this call finalized the request.
 */
export async function finalizeDisabledWarehouseRoutingRequest(requestId: number): Promise<boolean> {
  if (!Number.isSafeInteger(requestId) || requestId <= 0) return false;
  const request = await queryOne<{
    routing_dispatch_id: number | null; warehouse_id: number | null; status: string;
  }>(`
    SELECT routing_dispatch_id, warehouse_id, status
    FROM supply_requests WHERE id=?
  `, requestId);
  if (!request?.routing_dispatch_id || request.status !== "delivered_to_warehouse") return false;
  if (await warehouseRequiresApproval(request.warehouse_id)) return false;
  return (await finalizeWarehouseRequest(requestId, ["delivered_to_warehouse"])).success;
}

// ── Supply Requests ───────────────────────────────────────────────────────────
router.get("/warehouse-approval-settings", requireRole(["admin", "supervisor"]), async (_req, res) => {
  const warehouses = await queryAll<{ id: number; name: string; requires_approval: number }>(`
    SELECT w.id, w.name, COALESCE(s.requires_approval, 1) AS requires_approval
    FROM warehouses w
    LEFT JOIN warehouse_approval_settings s ON s.warehouse_id=w.id
    WHERE w.active=1
    ORDER BY w.name COLLATE NOCASE, w.id
  `);
  res.json({
    warehouses: warehouses.map(warehouse => ({
      id: warehouse.id,
      name: warehouse.name,
      requires_approval: warehouse.requires_approval !== 0,
    })),
  });
});

router.put("/warehouse-approval-settings", requireRole(["admin", "supervisor"]), async (req, res) => {
  const { warehouse_ids, requires_approval } = req.body || {};
  if (
    !Array.isArray(warehouse_ids)
    || warehouse_ids.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) <= 0)
    || typeof requires_approval !== "boolean"
  ) {
    return void res.status(400).json({ error: "قائمة المستودعات وخيار الموافقة مطلوبان بصيغة صحيحة" });
  }
  const warehouseIds = [...new Set<number>(warehouse_ids)];
  if (warehouseIds.length) {
    const existingIds = await queryAll<{ id: number }>(
      `SELECT id FROM warehouses WHERE id IN (${warehouseIds.map(() => "?").join(",")})`,
      ...warehouseIds,
    );
    if (existingIds.length !== warehouseIds.length) {
      return void res.status(400).json({ error: "أحد المستودعات المحددة غير موجود" });
    }
    await executeBatch(warehouseIds.map(warehouseId => ({
      sql: `
        INSERT INTO warehouse_approval_settings (warehouse_id, requires_approval, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(warehouse_id) DO UPDATE SET
          requires_approval=excluded.requires_approval,
          updated_at=datetime('now')
      `,
      params: [warehouseId, requires_approval ? 1 : 0],
    })));
  }
  const arrived = !requires_approval && warehouseIds.length
    ? await queryAll<{ id: number; routing_dispatch_id: number | null; status: string }>(`
        SELECT id, routing_dispatch_id, status FROM supply_requests
        WHERE warehouse_id IN (${warehouseIds.map(() => "?").join(",")})
          AND status NOT IN ('completed','cancelled','rejected')
        ORDER BY id
      `, ...warehouseIds)
    : [];
  let finalized = 0;
  let skipped = 0;
  for (const request of arrived) {
    if (request.routing_dispatch_id) {
      const trips = await queryAll<{ id: number }>(`
        SELECT id FROM supply_request_trips
        WHERE supply_request_id=? AND status IN ('delivered_to_warehouse','pending_warehouse_approval')
      `, request.id);
      for (const trip of trips) {
        if ((await finalizeRoutingTrip(trip.id, ["delivered_to_warehouse", "pending_warehouse_approval"])).success) finalized++;
        else skipped++;
      }
    } else if (["delivered_to_warehouse", "pending_warehouse_approval"].includes(request.status)) {
      const finalizedRequest = await finalizeWarehouseRequest(request.id, ["delivered_to_warehouse", "pending_warehouse_approval"]);
      if (finalizedRequest.success) finalized++;
      else skipped++;
    }
  }
  res.json({
    message: "تم حفظ إعدادات موافقة الاستلام",
    finalized_count: finalized,
    skipped_count: skipped,
  });
});

router.get("/supply-requests", async (req, res) => {
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
  res.json(await queryAll(sql, ...params));
});

router.post("/supply-requests", async (req, res) => {
  const {
    warehouse_id, warehouse_name, product_name, product_category,
    requested_qty, unit, trailer_loads, destination_division,
    requested_by, notes, auto_triggered, priority, batch_id,
    external_customer_name, external_customer_phone,
  } = req.body;
  if (!product_name || !requested_qty) return void res.status(400).json({ error: "المنتج والكمية مطلوبان" });
  const r = await execute(`
    INSERT INTO supply_requests
      (warehouse_id, warehouse_name, product_name, product_category, requested_qty, unit, trailer_loads, destination_division, requested_by, notes, auto_triggered, priority, batch_id, external_customer_name, external_customer_phone)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `,
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

router.put("/supply-requests/:id", async (req, res) => {
  const { status, approved_by, notes } = req.body;
  const requestInfo = await queryOne<{ routing_dispatch_id: number | null }>(
    "SELECT routing_dispatch_id FROM supply_requests WHERE id=?", req.params.id,
  );
  if (requestInfo?.routing_dispatch_id) {
    return void res.status(409).json({ error: "يجب تحديث حالة التوجيه عبر إجراءاته المخصصة" });
  }
  await execute(
    "UPDATE supply_requests SET status=?,approved_by=?,notes=?,updated_at=datetime('now') WHERE id=?"
  , status, approved_by || null, notes || null, req.params.id);
  res.json({ message: "تم التحديث" });
});

// ── تعديل طلب التوريد (قبل تعيين سيارة) ─────────────────────────────────────
router.patch("/supply-requests/:id/edit", async (req, res) => {
  const sr = await queryOne<{ status: string }>("SELECT status FROM supply_requests WHERE id=?", req.params.id);
  if (!sr) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (sr.status !== "pending") return void res.status(403).json({ error: "لا يمكن تعديل طلب بعد الموافقة عليه" });
  const { requested_qty, trailer_loads, destination_division, notes } = req.body;
  await execute(`
    UPDATE supply_requests
    SET requested_qty=?, trailer_loads=?, destination_division=?, notes=?, updated_at=datetime('now')
    WHERE id=?
  `, parseFloat(requested_qty) || 0, parseFloat(trailer_loads) || 1, destination_division || null, notes || null, req.params.id);
  res.json({ message: "تم التعديل" });
});

// ── إلغاء طلب التوريد ─────────────────────────────────────────────────────────
router.delete("/supply-requests/:id", async (req, res) => {
  const sr = await queryOne<{ status: string }>("SELECT status FROM supply_requests WHERE id=?", req.params.id);
  if (!sr) return void res.status(404).json({ error: "الطلب غير موجود" });
  const cancellable = ["pending", "approved", "supervisor_assigned"];
  if (!cancellable.includes(sr.status)) return void res.status(403).json({ error: "لا يمكن إلغاء طلب بعد انطلاق الشاحنة" });
  await execute("UPDATE supply_requests SET status='cancelled', updated_at=datetime('now') WHERE id=?", req.params.id);
  res.json({ message: "تم الإلغاء" });
});

// ── تعديل موقع التنزيل (بعد تعيين السيارة) ──────────────────────────────────
router.patch("/supply-requests/:id/location", async (req, res) => {
  const { destination_division } = req.body;
  await execute("UPDATE supply_requests SET destination_division=?, updated_at=datetime('now') WHERE id=?",
    destination_division || null, req.params.id);
  res.json({ message: "تم تحديث الموقع" });
});

// ── مشرف الحركة: تعيين سيارة ────────────────────────────────────────────────
router.put("/supply-requests/:id/assign-vehicle", async (req, res) => {
  const { vehicle_plate, driver_name, driver_phone, assigned_by } = req.body;
  if (!vehicle_plate) return void res.status(400).json({ error: "لوحة السيارة مطلوبة" });

  const id = req.params.id;

  // ── Update parent request ────────────────────────────────────────────────────
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM supply_request_trips WHERE supply_request_id=? LIMIT 1"
  , id);
  const statements = [{
    sql: `
      UPDATE supply_requests
      SET vehicle_plate=?, driver_name=?, driver_phone=?,
          status='pending_permit', approved_by=?, updated_at=datetime('now')
      WHERE id=?
    `,
    params: [vehicle_plate, driver_name || null, driver_phone || null, assigned_by || null, id],
  }];
  if (existing) {
    statements.push({
      sql: `
        UPDATE supply_request_trips
        SET vehicle_plate=?, driver_name=?, driver_phone=?, status='assigned',
            updated_at=datetime('now')
        WHERE id=?
      `,
      params: [vehicle_plate, driver_name || null, driver_phone || null, existing.id],
    });
  } else {
    statements.push({
      sql: `
        INSERT INTO supply_request_trips (supply_request_id, vehicle_plate, driver_name, driver_phone, status)
        VALUES (?,?,?,?,'assigned')
      `,
      params: [id, vehicle_plate, driver_name || null, driver_phone || null],
    });
  }
  await executeBatch(statements);

  // ── Mark vehicle busy + driver en-route ─────────────────────────────────────
  try { await execute("UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?", vehicle_plate); } catch {}
  try { await execute("UPDATE driver_profiles SET status='في رحلة' WHERE vehicle_plate=?", vehicle_plate); } catch {}

  res.json({ message: "تم تعيين السيارة" });
});

// ── رحلات طلبات التوريد (supply_request_trips) ────────────────────────────────

/** GET trips — for driver (by driver_phone) or supervisor (by supply_request_id) or active only */
type RoutingCargoItem = {
  cargo_type: string;
  quantity?: number | null;
  sort_order?: number;
  product_id?: number | null;
  unit?: string | null;
};
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
      const productId = Number.isSafeInteger(Number(item.product_id)) && Number(item.product_id) > 0
        ? Number(item.product_id)
        : null;
      return [{
        cargo_type: item.cargo_type.trim(),
        quantity,
        sort_order: Number(item.sort_order ?? index),
        product_id: productId,
        unit: typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : null,
      }];
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

router.get("/supply-request-trips", async (req, res) => {
  const { driver_phone, supply_request_id, active_only, warehouse_id } = req.query;
  const limitDriverInvoicePhotos = req.query.driver_invoice_limit === "2" && Boolean(driver_phone);
  let remainingDriverInvoicePhotos = limitDriverInvoicePhotos ? 2 : 0;
  let sql = `
    SELECT t.id, t.supply_request_id, t.vehicle_plate, t.driver_name, t.driver_phone,
           t.status, t.driver_loading_image, t.permit_number, t.loaded_at, t.delivered_at,
           t.received_at, t.created_at, t.updated_at, t.archived_at,
           t.cargo_items_json, t.attachments_json,
           sr.product_name, sr.requested_qty, sr.unit, sr.trailer_loads,
           sr.warehouse_name, sr.destination_division,
            sr.driver_expense,
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
  if (warehouse_id)       { sql += " AND sr.warehouse_id=?";                        params.push(warehouse_id); }
  if (active_only === "1") {
    sql += req.query.include_completed === "1"
      ? " AND t.status!='rejected'"
      : " AND t.status NOT IN ('completed','rejected')";
  }
  if (limitDriverInvoicePhotos) {
    sql += " AND t.status IN ('assigned','in_transit','loaded','delivered_to_warehouse','pending_warehouse_approval')";
  }
  if (req.query.include_archived !== "1") { sql += " AND (t.archived_at IS NULL)"; }
  sql += " ORDER BY t.created_at DESC";
  const rows = await queryAll<Record<string, unknown>>(sql, ...params);
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
    let attachments = listTripAttachments(row);
    let driverInvoiceArchivedCount = 0;
    let driverLoadingImage = row.driver_loading_image;
    if (limitDriverInvoicePhotos) {
      const driverInvoicePhotos = attachments
        .filter(item => item.kind === "driver_invoice")
        .sort((a, b) => (Number(b.sort_order) || 0) - (Number(a.sort_order) || 0));
      const visiblePhotos = driverInvoicePhotos.slice(0, Math.max(0, remainingDriverInvoicePhotos));
      const visibleUrls = new Set(visiblePhotos.map(item => item.url));
      remainingDriverInvoicePhotos -= visiblePhotos.length;
      driverInvoiceArchivedCount = driverInvoicePhotos.length - visiblePhotos.length;
      attachments = attachments.filter(item => item.kind !== "driver_invoice" || visibleUrls.has(item.url));
      if (typeof driverLoadingImage === "string" && !visibleUrls.has(driverLoadingImage)) {
        driverLoadingImage = null;
      }
    }
    return {
      ...publicRow,
      ...(limitDriverInvoicePhotos
        ? { driver_loading_image: driverLoadingImage, driver_invoice_archived_count: driverInvoiceArchivedCount }
        : {}),
      cargo_items: cargoItems,
      attachments,
    };
  }));
});

// ── Bulk archive trips (soft delete) ─────────────────────────────────────────
router.post("/supply-request-trips/bulk-archive", async (req, res) => {
  const ids: number[] = req.body?.ids ?? [];
  if (!ids.length) return void res.status(400).json({ error: "لا توجد طلبات محددة" });
  await executeBatch(ids.map(id => ({
    sql: "UPDATE supply_request_trips SET archived_at=datetime('now') WHERE id=? AND archived_at IS NULL",
    params: [id],
  })));
  res.json({ message: `تم أرشفة ${ids.length} طلب` });
});

// ── Bulk restore trips ────────────────────────────────────────────────────────
router.post("/supply-request-trips/bulk-restore", async (req, res) => {
  const ids: number[] = req.body?.ids ?? [];
  if (!ids.length) return void res.status(400).json({ error: "لا توجد طلبات محددة" });
  await executeBatch(ids.map(id => ({
    sql: "UPDATE supply_request_trips SET archived_at=NULL WHERE id=?",
    params: [id],
  })));
  res.json({ message: `تم استرجاع ${ids.length} طلب` });
});

// ── Bulk permanent delete trips ───────────────────────────────────────────────
router.post("/supply-request-trips/bulk-hard-delete", async (req, res) => {
  const ids: number[] = req.body?.ids ?? [];
  if (!ids.length) return void res.status(400).json({ error: "لا توجد طلبات محددة" });
  for (const id of ids) await deletePendingRoutingTripLog(Number(id));
  await executeBatch(ids.map(id => ({ sql: "DELETE FROM supply_request_trips WHERE id=?", params: [id] })));
  res.json({ message: `تم حذف ${ids.length} طلب نهائياً` });
});

/** POST create one trip assignment (supervisor assigns one vehicle) */
router.post("/supply-requests/:id/trips", async (req, res) => {
  const { vehicle_plate, driver_name, driver_phone, assigned_by } = req.body;
  if (!vehicle_plate) return void res.status(400).json({ error: "لوحة السيارة مطلوبة" });

  const sr = await queryOne<{ id: number; trailer_loads: number; status: string }>(
    "SELECT * FROM supply_requests WHERE id=?", req.params.id,
  );
  if (!sr) return void res.status(404).json({ error: "الطلب غير موجود" });

  const tripCount = (await queryOne<{ c: number }>(
    "SELECT COUNT(*) as c FROM supply_request_trips WHERE supply_request_id=?"
  , req.params.id))?.c ?? 0;

  if (tripCount >= sr.trailer_loads) {
    return void res.status(400).json({ error: `تم تعيين كل الرحلات (${sr.trailer_loads})` });
  }

  const r = await execute(`
    INSERT INTO supply_request_trips (supply_request_id, vehicle_plate, driver_name, driver_phone, status)
    VALUES (?,?,?,?,'assigned')
  `, req.params.id, vehicle_plate, driver_name || null, driver_phone || null);

  /* Mark vehicle as busy in fleet_vehicles + driver_profiles */
  try { await execute("UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?", vehicle_plate); } catch {}
  try { await execute("UPDATE driver_profiles SET status='في رحلة' WHERE vehicle_plate=?", vehicle_plate); } catch {}

  /* Set pending_permit so fsohat can see it and upload permit */
  await execute(`
    UPDATE supply_requests
    SET status='pending_permit', vehicle_plate=?, driver_phone=?,
        approved_by=?, updated_at=datetime('now')
    WHERE id=?
  `, vehicle_plate, driver_phone || null, assigned_by || null, req.params.id);

  res.status(201).json({ id: r.lastInsertRowid, assigned: tripCount + 1, total: sr.trailer_loads });
});

/** PUT driver confirms load (photo + permit) */
router.put("/supply-request-trips/:id/driver-load", upload.single("loading_image"), async (req, res) => {
  const { permit_number } = req.body;
  const submittedAttachments = req.body.loading_images !== undefined
    ? parseClientRoutingAttachments(req.body.loading_images, "driver_invoice")
    : req.file
      ? [{ kind: "driver_invoice", url: `/api/uploads/${req.file.filename}`, file_name: req.file.originalname, sort_order: 0 }]
      : [];
  if (submittedAttachments === false) return void res.status(400).json({ error: "قائمة صور الفواتير غير صالحة" });
  const image_url = submittedAttachments[0]?.url || null;
  const tripId = String(req.params.id);
  const caller = await getAuthenticatedCaller(req);
  const ownsTrip = caller ? await driverOwnsTrip(caller, tripId) : false;
  const trip = await queryOne<{
    supply_request_id: number; status: string; routing_dispatch_id: number | null; parent_status: string;
    attachments_json: string | null; permit_image_url: string | null; invoice_image_url: string | null;
    parent_permit_image_url: string | null; parent_invoice_image: string | null;
  }>(`
      SELECT t.supply_request_id, t.status, t.attachments_json, t.permit_image_url,
             t.invoice_image_url, sr.routing_dispatch_id, sr.status AS parent_status,
             sr.permit_image_url AS parent_permit_image_url, sr.invoice_image AS parent_invoice_image
      FROM supply_request_trips t JOIN supply_requests sr ON sr.id=t.supply_request_id
      WHERE t.id=?
  `, tripId);
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (trip.routing_dispatch_id) {
    if (!caller) return void res.status(401).json({ error: "يلزم تسجيل الدخول بحساب السائق" });
    if (!ownsTrip) return void res.status(403).json({ error: "لا يمكنك تحديث رحلة غير مسندة إليك" });
  }
  if (trip.status !== "loaded") {
    if (trip.routing_dispatch_id
      ? trip.status !== "in_transit"
      : !["assigned", "in_transit"].includes(trip.status)) {
      return void res.status(409).json({ error: "لا يمكن تأكيد تحميل رحلة في حالتها الحالية" });
    }
    if (["delivered_to_warehouse", "pending_warehouse_approval", "completed", "received", "cancelled"].includes(trip.parent_status)) {
      return void res.status(409).json({ error: "لا يمكن تأكيد تحميل رحلة في حالتها الحالية" });
    }
    if (trip.routing_dispatch_id) {
      const attachments = readRoutingAttachments(trip.attachments_json);
      const expectedCount = attachments.filter(item => item.kind === "fsohat_permit").length
        || attachments.filter(item => item.kind === "supervisor_permit").length
        || ((trip.invoice_image_url || trip.parent_invoice_image || trip.permit_image_url || trip.parent_permit_image_url) ? 1 : 1);
      if (submittedAttachments.length !== expectedCount) {
        return void res.status(400).json({ error: `يجب رفع ${expectedCount} صورة، صورة واحدة لكل فسح` });
      }
    }
    const attachmentsJson = trip.routing_dispatch_id && submittedAttachments.length
      ? JSON.stringify(mergeRoutingAttachments(trip.attachments_json, submittedAttachments))
      : trip.attachments_json;
    const changed = await execute(`
      UPDATE supply_request_trips
      SET driver_loading_image=?, permit_number=?, attachments_json=?,
          status='loaded', loaded_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND status=?
    `, image_url, permit_number || null, attachmentsJson, tripId, trip.status);
    if (!changed.changes) return void res.status(409).json({ error: "لا يمكن تأكيد تحميل رحلة في حالتها الحالية" });
    const children = await queryAll<{ status: string }>(
      "SELECT status FROM supply_request_trips WHERE supply_request_id=?", trip.supply_request_id,
    );
    const allLoaded = children.length > 0 && children.every(child =>
      ["loaded", "delivered_to_warehouse", "pending_warehouse_approval", "completed", "cancelled", "rejected"].includes(child.status)
    );
    if (allLoaded) {
      await execute(`
        UPDATE supply_requests SET status='loaded', loaded_at=datetime('now'), updated_at=datetime('now')
        WHERE id=? AND status IN ('assigned','pending_permit','in_transit','loaded')
      `, trip.supply_request_id);
    }
  }
  await syncRoutingTripLog(Number(tripId));
  res.json({ message: "تم تأكيد التحميل", image_url });
});

/** PUT driver confirms delivery to warehouse */
router.put("/supply-request-trips/:id/driver-deliver", async (req, res) => {
  const tripId = String(req.params.id);
  const caller = await getAuthenticatedCaller(req);
  const ownsTrip = caller ? await driverOwnsTrip(caller, tripId) : false;
  const deliveryInfo = await queryOne<{ warehouse_id: number | null }>(`
    SELECT sr.warehouse_id FROM supply_request_trips t
    LEFT JOIN supply_requests sr ON sr.id=t.supply_request_id
    WHERE t.id=?
  `, tripId);
  const approvalRequiredForTrip = deliveryInfo?.warehouse_id
    ? await warehouseRequiresApproval(deliveryInfo.warehouse_id)
    : true;
  let finalizeRoutingTripId: number | null = null;
  let finalizeWarehouseRequestId: number | null = null;
  let aggregateRequestId: number | null = null;
  const delivery = async () => {
    const trip = await queryOne<Record<string, unknown>>(`
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
    `, tripId);
    if (!trip) return { missing: true as const };

    const isRoutingDispatch = !!trip.routing_dispatch_id;
    if (isRoutingDispatch) {
      if (!caller) return { unauthenticated: true as const };
      if (!ownsTrip) return { forbidden: true as const };
    }
    const hasWarehouse = !!trip.warehouse_id;
    const approvalRequired = hasWarehouse ? approvalRequiredForTrip : true;
    const finalStatus = (!isRoutingDispatch || hasWarehouse) ? "delivered_to_warehouse" : "completed";
    if (["delivered_to_warehouse", "pending_warehouse_approval", "completed", "received", "cancelled"].includes(String(trip.parent_status))) {
      const terminalChild = ["delivered_to_warehouse", "pending_warehouse_approval", "completed"].includes(String(trip.status));
      if (terminalChild) return { duplicate: true as const, isRoutingDispatch, hasWarehouse };
      return { conflict: true as const };
    }
    if (isRoutingDispatch && String(trip.status) !== "loaded") return { conflict: true as const };
    const updateDeliverySql = isRoutingDispatch ? `
      UPDATE supply_request_trips
      SET status=?, delivered_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND status='loaded'
    ` : `
      UPDATE supply_request_trips
      SET status=?, delivered_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND status NOT IN ('delivered_to_warehouse','pending_warehouse_approval','completed','cancelled','rejected')
    `;
    const changed = await execute(updateDeliverySql, finalStatus, tripId);
    if (!changed.changes) {
      if (["delivered_to_warehouse", "pending_warehouse_approval", "completed"].includes(String(trip.status))) {
        return { duplicate: true as const, isRoutingDispatch, hasWarehouse };
      }
      return { conflict: true as const };
    }
    if (isRoutingDispatch) {
      // The dispatch row already holds the tariff snapshot in total_amount.
      // Record its return value when the driver unloads, without replacing a
      // value previously entered manually for this trip.
      await execute(`
        UPDATE trips SET return_value_no_vat=total_amount
        WHERE client_request_id=? AND COALESCE(return_value_no_vat,0)=0
      `, `routing-trip:${tripId}`);
    }

    let autoFinalized = false;
    if (isRoutingDispatch && hasWarehouse) {
      if (!approvalRequired) {
        finalizeRoutingTripId = Number(tripId);
      }
      aggregateRequestId = Number(trip.supply_request_id);
    } else {
      const activeChildren = await queryOne<{ total: number; done: number }>(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN status IN ('delivered_to_warehouse','pending_warehouse_approval','completed','cancelled','rejected') THEN 1 ELSE 0 END) AS done
        FROM supply_request_trips WHERE supply_request_id=?
      `, trip.supply_request_id);
      if (activeChildren && activeChildren.total > 0 && activeChildren.total === activeChildren.done) {
        const parentStatus = isRoutingDispatch ? "completed" : "delivered_to_warehouse";
        await execute(`
          UPDATE supply_requests SET status=?, updated_at=datetime('now')
          WHERE id=? AND status NOT IN ('completed','cancelled')
        `, parentStatus, trip.supply_request_id);
        if (!isRoutingDispatch && hasWarehouse && !approvalRequired) {
          finalizeWarehouseRequestId = Number(trip.supply_request_id);
        }
      }
    }

    if (isRoutingDispatch && !hasWarehouse && trip.vehicle_plate) {
      await execute("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?", trip.vehicle_plate);
      await execute("UPDATE driver_profiles SET status='نشط' WHERE vehicle_plate=?", trip.vehicle_plate);
    } else if (isRoutingDispatch && hasWarehouse && approvalRequired && !autoFinalized) {
      const wMgr = await queryOne<{ phone: string }>(`
        SELECT u.phone FROM warehouses w
        LEFT JOIN users u ON u.id=w.warehouse_manager_user_id
        WHERE w.id=? AND u.phone IS NOT NULL LIMIT 1
      `, trip.warehouse_id);
      if (wMgr?.phone) {
        await execute("INSERT INTO notifications (user_phone, title, body) VALUES (?,?,?)",
          wMgr.phone, "شحنة وصلت 📦", `الرحلة ${trip.vehicle_plate || ""} وصلت — يرجى تأكيد الاستلام`);
      }
    } else if (!isRoutingDispatch && trip.vehicle_plate) {
      const today = new Date().toISOString().slice(0, 10);
      const trailer = (await queryOne<{ linked_trailer_number: string | null }>(
        "SELECT linked_trailer_number FROM fleet_vehicles WHERE plate_number=? LIMIT 1", trip.vehicle_plate,
      ))?.linked_trailer_number || null;
      await execute(`
        INSERT INTO trips (date, car_id, driver_name, driver_phone, material_type, destination, trips_count, notes, trailer_number)
        VALUES (?,?,?,?,?,?,1,?,?)
      `, today, trip.vehicle_plate, trip.driver_name || null, trip.driver_phone || null,
        trip.product_name || null, trip.destination_division || trip.warehouse_name || null,
        `طلب توريد #${trip.supply_request_id}`, trailer);
    }
    return { isRoutingDispatch, hasWarehouse, autoFinalized };
  };

  const result = await delivery();
  if (aggregateRequestId !== null) await updateRoutingRequestAggregateStatus(aggregateRequestId);
  if (result.missing) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (result.unauthenticated) return void res.status(401).json({ error: "يلزم تسجيل الدخول بحساب السائق" });
  if (result.forbidden) return void res.status(403).json({ error: "لا يمكنك تحديث رحلة غير مسندة إليك" });
  if (result.conflict) return void res.status(409).json({ error: "الطلب لم يعد يسمح بتحديث هذه الرحلة" });
  if (result.duplicate) return void res.json({ message: "تم تسجيل التسليم مسبقاً" });
  if (finalizeRoutingTripId !== null) {
    result.autoFinalized = (await finalizeRoutingTrip(finalizeRoutingTripId, ["delivered_to_warehouse"])).success;
  }
  if (finalizeWarehouseRequestId !== null) {
    result.autoFinalized = (await finalizeWarehouseRequest(
      finalizeWarehouseRequestId, ["delivered_to_warehouse"],
    )).success;
  }
  await syncRoutingTripLog(Number(tripId), { createIfMissing: result.isRoutingDispatch });
  res.json({
    message: result.autoFinalized
      ? "تم التسليم، تم تحديث المخزون وإتاحة المركبة ✅"
      : (result.isRoutingDispatch && !result.hasWarehouse)
        ? "تم التسليم، المركبة متاحة الآن ✅"
        : "تم تأكيد التوصيل، بانتظار استلام المستودع",
  });
});

// ── مسؤول الفسوحات: تصريح/مرجع خاص برحلة توجيه واحدة ─────────────────────
router.put("/supply-request-trips/:id/fsohat-confirm", requireRole(["fsohat", "admin"]), upload.single("invoice_file"), async (req, res) => {
  const { reference_no, confirmed_by } = req.body;
  const submittedAttachments = req.body.attachments !== undefined
    ? parseClientRoutingAttachments(req.body.attachments, "fsohat_permit")
    : req.file
      ? [{ kind: "fsohat_permit", url: `/api/uploads/${req.file.filename}`, file_name: req.file.originalname, sort_order: 0 }]
      : [];
  if (submittedAttachments === false) return void res.status(400).json({ error: "قائمة ملفات الفسح غير صالحة" });
  const invoiceUrl = submittedAttachments[0]?.url || null;
  if (!reference_no) return void res.status(400).json({ error: "رقم المرجع مطلوب" });
  const trip = await queryOne<{
    supply_request_id: number; status: string; routing_dispatch_id: number | null; attachments_json: string | null;
  }>(`
      SELECT t.supply_request_id, t.status, t.attachments_json, sr.routing_dispatch_id
      FROM supply_request_trips t JOIN supply_requests sr ON sr.id=t.supply_request_id
      WHERE t.id=?
  `, req.params.id);
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (!trip.routing_dispatch_id) return void res.status(400).json({ error: "هذه الرحلة ليست ضمن توجيه" });
  if (trip.status !== "assigned") return void res.status(409).json({ error: "الرحلة ليست بانتظار الفسوحات" });
  const attachmentsJson = submittedAttachments.length
    ? JSON.stringify(mergeRoutingAttachments(
        trip.attachments_json,
        submittedAttachments.map(item => ({ ...item, reference_no: String(reference_no).trim() })),
      ))
    : trip.attachments_json;
  const changed = await execute(`
    UPDATE supply_request_trips
    SET reference_no=?, invoice_image_url=COALESCE(?,invoice_image_url),
        attachments_json=?, status='in_transit', updated_at=datetime('now')
    WHERE id=? AND status='assigned'
  `, reference_no, invoiceUrl, attachmentsJson, req.params.id);
  if (!changed.changes) return void res.status(409).json({ error: "الرحلة ليست بانتظار الفسوحات" });
  const remaining = await queryOne<{ count: number }>(`
    SELECT COUNT(*) AS count FROM supply_request_trips
    WHERE supply_request_id=? AND status IN ('assigned','pending_permit')
  `, trip.supply_request_id);
  if (!remaining?.count) {
    await execute(
      "UPDATE supply_requests SET status='in_transit', approved_by=?, updated_at=datetime('now') WHERE id=? AND status NOT IN ('completed','cancelled')",
      confirmed_by || null, trip.supply_request_id,
    );
  }
  await syncRoutingTripLog(Number(req.params.id));
  res.json({ message: "تم التأكيد، السيارة في الطريق" });
});

router.put("/supply-request-trips/:id/fsohat-update", requireRole(["fsohat", "admin"]), upload.single("invoice_file"), async (req, res) => {
  const { reference_no } = req.body;
  const submittedAttachments = req.body.attachments !== undefined
    ? parseClientRoutingAttachments(req.body.attachments, "fsohat_permit")
    : req.file
      ? [{ kind: "fsohat_permit", url: `/api/uploads/${req.file.filename}`, file_name: req.file.originalname, sort_order: 0 }]
      : [];
  if (submittedAttachments === false) return void res.status(400).json({ error: "قائمة ملفات الفسح غير صالحة" });
  const invoiceUrl = submittedAttachments[0]?.url || null;
  const trip = await queryOne<{ status: string; routing_dispatch_id: number | null; attachments_json: string | null }>(`
      SELECT t.status, t.attachments_json, sr.routing_dispatch_id FROM supply_request_trips t
      JOIN supply_requests sr ON sr.id=t.supply_request_id WHERE t.id=?
  `, req.params.id);
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (!trip.routing_dispatch_id) return void res.status(400).json({ error: "هذه الرحلة ليست ضمن توجيه" });
  if (trip.status !== "in_transit") return void res.status(409).json({ error: "يمكن تعديل الرحلات المؤكدة فقط" });
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
  const changed = await execute(`
    UPDATE supply_request_trips
    SET reference_no=COALESCE(?,reference_no), invoice_image_url=COALESCE(?,invoice_image_url),
        attachments_json=?, updated_at=datetime('now')
    WHERE id=? AND status='in_transit'
  `, reference_no || null, invoiceUrl, attachmentsJson, req.params.id);
  if (!changed.changes) return void res.status(409).json({ error: "يمكن تعديل الرحلات المؤكدة فقط" });
  await syncRoutingTripLog(Number(req.params.id));
  res.json({ message: "تم التحديث" });
});

router.put("/supply-request-trips/:id/fsohat-recall", requireRole(["fsohat", "admin"]), async (req, res) => {
  const trip = await queryOne<{
    supply_request_id: number; status: string; routing_dispatch_id: number | null; attachments_json: string | null;
  }>(`
      SELECT t.supply_request_id, t.status, t.attachments_json, sr.routing_dispatch_id FROM supply_request_trips t
      JOIN supply_requests sr ON sr.id=t.supply_request_id WHERE t.id=?
  `, req.params.id);
  if (!trip) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (!trip.routing_dispatch_id) return void res.status(400).json({ error: "هذه الرحلة ليست ضمن توجيه" });
  if (trip.status !== "in_transit") return void res.status(409).json({ error: "يمكن سحب الرحلات المؤكدة فقط" });
  const attachmentsJson = JSON.stringify(readRoutingAttachments(trip.attachments_json)
    .filter(item => item.kind !== "fsohat_permit"));
  const changed = await execute(`
    UPDATE supply_request_trips SET status='assigned', reference_no=NULL, invoice_image_url=NULL,
      attachments_json=?, updated_at=datetime('now') WHERE id=? AND status='in_transit'
  `, attachmentsJson, req.params.id);
  if (!changed.changes) return void res.status(409).json({ error: "يمكن سحب الرحلات المؤكدة فقط" });
  const inTransit = await queryOne<{ count: number }>(`
    SELECT COUNT(*) AS count FROM supply_request_trips
    WHERE supply_request_id=? AND status='in_transit'
  `, trip.supply_request_id);
  if (!inTransit?.count) {
    await execute(
      "UPDATE supply_requests SET status='assigned', reference_no=NULL, invoice_image=NULL, updated_at=datetime('now') WHERE id=?",
      trip.supply_request_id,
    );
  }
  await syncRoutingTripLog(Number(req.params.id));
  res.json({ message: "تم سحب التأكيد، الرحلة عادت لبانتظار التأكيد" });
});

// ── مسؤول الفسوحات: تأكيد (رفع ملف الفاتورة + رقم المرجع) للطلب العادي ────
router.put("/supply-requests/:id/fsohat-confirm", requireRole(["fsohat", "admin"]), upload.single("invoice_file"), async (req, res) => {
  const { reference_no, confirmed_by } = req.body;
  const invoice_url = req.file ? `/api/uploads/${req.file.filename}` : undefined;
  const existing = await queryOne<{ routing_dispatch_id: number | null }>(
    "SELECT routing_dispatch_id FROM supply_requests WHERE id=?", req.params.id,
  );
  if (!existing) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (existing.routing_dispatch_id) return void res.status(400).json({ error: "يجب تأكيد كل رحلة توجيه بشكل منفصل" });

  // Build update keeping existing invoice if no new file uploaded
  const statements = invoice_url !== undefined ? [{
    sql: `
      UPDATE supply_requests
       SET invoice_image=?, reference_no=?,
           cargo_type=CASE WHEN routing_dispatch_id IS NOT NULL THEN cargo_type ELSE ? END,
          status='in_transit', approved_by=?,
          updated_at=datetime('now')
      WHERE id=?
    `,
    params: [invoice_url, reference_no || null, reference_no || null, confirmed_by || null, req.params.id],
  }] : [{
    sql: `
      UPDATE supply_requests
       SET reference_no=?, cargo_type=CASE WHEN routing_dispatch_id IS NOT NULL THEN cargo_type ELSE ? END,
          status='in_transit', approved_by=?,
          updated_at=datetime('now')
      WHERE id=?
    `,
    params: [reference_no || null, reference_no || null, confirmed_by || null, req.params.id],
  }];
  statements.push({
    sql: `
      UPDATE supply_request_trips
      SET status='in_transit', updated_at=datetime('now')
      WHERE supply_request_id=? AND status='assigned'
    `,
    params: [req.params.id],
  });
  await executeBatch(statements);
  res.json({ message: "تم التأكيد، السيارة في الطريق" });
});

// ── مسؤل الفسوحات: تعديل بعد التأكيد ──────────────────────────────────────
router.put("/supply-requests/:id/fsohat-update", requireRole(["fsohat", "admin"]), upload.single("invoice_file"), async (req, res) => {
  const { reference_no } = req.body;
  const invoice_url = req.file ? `/api/uploads/${req.file.filename}` : undefined;
  const existing = await queryOne<{ routing_dispatch_id: number | null }>(
    "SELECT routing_dispatch_id FROM supply_requests WHERE id=?", req.params.id,
  );
  if (!existing) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (existing.routing_dispatch_id) return void res.status(400).json({ error: "يجب تعديل كل رحلة توجيه بشكل منفصل" });

  if (invoice_url !== undefined) {
    await execute(`
      UPDATE supply_requests
       SET reference_no=?,
           cargo_type=CASE WHEN routing_dispatch_id IS NOT NULL THEN cargo_type ELSE ? END,
           invoice_image=?,
          updated_at=datetime('now')
      WHERE id=? AND status='in_transit'
    `, reference_no || null, reference_no || null, invoice_url, req.params.id);
  } else {
    await execute(`
      UPDATE supply_requests
       SET reference_no=?, cargo_type=CASE WHEN routing_dispatch_id IS NOT NULL THEN cargo_type ELSE ? END,
          updated_at=datetime('now')
      WHERE id=? AND status='in_transit'
    `, reference_no || null, reference_no || null, req.params.id);
  }
  res.json({ message: "تم التحديث" });
});

// ── مسؤل الفسوحات: سحب التأكيد (إعادة إلى assigned) ──────────────────────
router.put("/supply-requests/:id/fsohat-recall", requireRole(["fsohat", "admin"]), async (req, res) => {
  const sr = await queryOne<{ status: string; routing_dispatch_id: number | null }>(
    "SELECT status, routing_dispatch_id FROM supply_requests WHERE id=?", req.params.id,
  );
  if (!sr) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (sr.routing_dispatch_id) return void res.status(400).json({ error: "يجب سحب تأكيد كل رحلة توجيه بشكل منفصل" });
  if (sr.status !== "in_transit") return void res.status(403).json({ error: "يمكن سحب الطلبات في الطريق فقط" });

  await executeBatch([
    {
      sql: `
        UPDATE supply_requests
        SET status='assigned', invoice_image=NULL, reference_no=NULL,
            cargo_type=CASE WHEN routing_dispatch_id IS NOT NULL THEN cargo_type ELSE NULL END,
            updated_at=datetime('now')
        WHERE id=?
      `,
      params: [req.params.id],
    },
    {
      sql: `
        UPDATE supply_request_trips
        SET status='assigned', updated_at=datetime('now')
        WHERE supply_request_id=? AND status='in_transit'
      `,
      params: [req.params.id],
    },
  ]);
  res.json({ message: "تم سحب التأكيد، الطلب عاد لبانتظار التأكيد" });
});

// ── السائق: تأكيد التحميل (رفع صورة فاتورة + رقم الفسح) ──────────────────────
router.put("/supply-requests/:id/driver-load", upload.single("loading_image"), async (req, res) => {
  const { permit_number } = req.body;
  const image_url = req.file ? `/api/uploads/${req.file.filename}` : null;
  await execute(`
    UPDATE supply_requests
    SET driver_loading_image=?, permit_number=?,
        status='loaded', loaded_at=datetime('now'),
        updated_at=datetime('now')
    WHERE id=?
  `, image_url, permit_number || null, req.params.id);
  res.json({ message: "تم تأكيد التحميل", image_url });
});

// ── السائق: تأكيد التوصيل للمستودع ──────────────────────────────────────────
router.put("/supply-requests/:id/driver-deliver", async (req, res) => {
  const requestIdForAuth = Number(req.params.id);
  const caller = await getAuthenticatedCaller(req);
  const authRequest = await queryOne<{ vehicle_plate: string | null; warehouse_id: number | null }>(
    "SELECT vehicle_plate, warehouse_id FROM supply_requests WHERE id=?", requestIdForAuth,
  );
  const ownsRequest = caller && authRequest
    ? await driverOwnsSupplyRequest(caller, requestIdForAuth, authRequest.vehicle_plate)
    : false;
  const approvalRequiredForRequest = authRequest
    ? await warehouseRequiresApproval(authRequest.warehouse_id)
    : true;
  const deliver = async () => {
    const requestId = Number(req.params.id);
    const sr = await queryOne<{
      status: string; warehouse_id: number | null; routing_dispatch_id: number | null; vehicle_plate: string | null;
    }>("SELECT status, warehouse_id, routing_dispatch_id, vehicle_plate FROM supply_requests WHERE id=?", requestId);
    if (!sr) return { missing: true as const };
    if (sr.routing_dispatch_id) return { routingDispatch: true as const };
    if (["completed", "cancelled"].includes(sr.status)) return { conflict: true as const };
    const approvalRequired = approvalRequiredForRequest;
    if (!approvalRequired) {
      if (!caller) return { unauthenticated: true as const };
      if (!ownsRequest) return { forbidden: true as const };
      if (sr.status !== "loaded") return { notLoaded: true as const };
    }
    const children = await queryAll<{ status: string }>(
      "SELECT status FROM supply_request_trips WHERE supply_request_id=?", requestId,
    );
    if (children.length && (
      children.some(child => !["delivered_to_warehouse", "pending_warehouse_approval", "completed", "cancelled", "rejected"].includes(child.status))
      || !children.some(child => ["delivered_to_warehouse", "pending_warehouse_approval"].includes(child.status))
    )) {
      return { undelivered: true as const };
    }
    const changed = await execute(`
      UPDATE supply_requests
      SET status='delivered_to_warehouse',
          delivered_at=COALESCE(delivered_at,datetime('now')),
          updated_at=datetime('now')
      WHERE id=? AND status NOT IN ('completed','cancelled')
    `, requestId);
    if (!changed.changes) return { conflict: true as const };
    if (!approvalRequired) {
      return { shouldFinalize: true as const };
    }
    return { finalized: false };
  };
  const result = await deliver();
  if ("missing" in result) return void res.status(404).json({ error: "الطلب غير موجود" });
  if ("routingDispatch" in result) return void res.status(409).json({ error: "يجب تأكيد وصول كل رحلة عبر إجراء السائق الخاص بها" });
  if ("unauthenticated" in result) return void res.status(401).json({ error: "يلزم تسجيل الدخول بحساب السائق" });
  if ("forbidden" in result) return void res.status(403).json({ error: "لا يمكنك تأكيد توصيل طلب غير مسند إلى مركبتك" });
  if ("notLoaded" in result) return void res.status(409).json({ error: "يجب تأكيد تحميل الطلب قبل توصيله" });
  if ("conflict" in result) return void res.status(409).json({ error: "لا يمكن تأكيد توصيل طلب مكتمل أو ملغى" });
  if ("undelivered" in result) return void res.status(409).json({ error: "لا يمكن تأكيد وصول الطلب قبل وصول جميع الرحلات النشطة" });
  const finalized = "shouldFinalize" in result
    ? (await finalizeWarehouseRequest(Number(req.params.id), ["delivered_to_warehouse", "pending_warehouse_approval"])).success
    : result.finalized;
  res.json({
    message: finalized
      ? "تم التسليم، تم تحديث المخزون وإتاحة المركبة ✅"
      : "تم تأكيد التوصيل، بانتظار استلام المستودع",
  });
});

// ── مدير المستودع: توجيه السيارة لموقع آخر ──────────────────────────────────
router.put("/supply-requests/:id/redirect", async (req, res) => {
  const { redirect_location } = req.body;
  if (!redirect_location) return void res.status(400).json({ error: "الموقع الجديد مطلوب" });
  await execute(`
    UPDATE supply_requests
    SET redirect_location=?, status='redirected', updated_at=datetime('now')
    WHERE id=?
  `, redirect_location, req.params.id);
  res.json({ message: "تم توجيه السيارة" });
});

// ── مدير المستودع: تأكيد وصول الشحنة للوجهة المُحوَّلة إليها ─────────────
router.put("/supply-requests/:id/confirm-redirect-delivery", async (req, res) => {
  const sr = await queryOne<{ status: string }>("SELECT status FROM supply_requests WHERE id=?", req.params.id);
  if (!sr) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (sr.status !== "redirected") return void res.status(409).json({ error: "الطلب ليس في حالة إعادة توجيه" });
  await execute(`
    UPDATE supply_requests
    SET status='completed', updated_at=datetime('now')
    WHERE id=?
  `, req.params.id);
  res.json({ message: "تم تأكيد التسليم للوجهة" });
});

// ── مدير المستودع: تأكيد الاستلام (→ pending_warehouse_approval, بدون إضافة مخزون بعد) ──
router.put("/supply-request-trips/:id/warehouse-receive", async (req, res) => {
  const tripId = Number(req.params.id);
  if (!Number.isSafeInteger(tripId) || tripId <= 0) return void res.status(400).json({ error: "رقم الرحلة غير صحيح" });
  const requestInfo = await queryOne<{ routing_dispatch_id: number | null; warehouse_id: number | null }>(`
    SELECT sr.routing_dispatch_id, sr.warehouse_id
    FROM supply_request_trips t JOIN supply_requests sr ON sr.id=t.supply_request_id
    WHERE t.id=?
  `, tripId);
  if (!requestInfo) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (!requestInfo.routing_dispatch_id || !requestInfo.warehouse_id) {
    return void res.status(409).json({ error: "هذا الإجراء مخصص لرحلات التوجيه المرتبطة بمستودع" });
  }
  const access = await routingWarehouseAccess(req, requestInfo.warehouse_id);
  if (access === "unauthenticated") return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (access === "forbidden") return void res.status(403).json({ error: "يجب أن تكون مسؤول المستودع المعيّن لهذا الطلب" });
  const requiresApproval = await warehouseRequiresApproval(requestInfo.warehouse_id);

  let aggregateRequestId: number | null = null;
  const receive = async () => {
    const trip = await queryOne<{ status: string }>("SELECT status FROM supply_request_trips WHERE id=?", tripId);
    if (!trip) return { missing: true as const };
    if (trip.status !== "delivered_to_warehouse") return { conflict: true as const };
    if (!requiresApproval) {
      return { shouldFinalize: true as const };
    }
    const changed = await execute(`
      UPDATE supply_request_trips SET status='pending_warehouse_approval', updated_at=datetime('now')
      WHERE id=? AND status='delivered_to_warehouse'
    `, tripId);
    if (changed.changes !== 1) return { conflict: true as const };
    const parent = await queryOne<{ supply_request_id: number }>(
      "SELECT supply_request_id FROM supply_request_trips WHERE id=?", tripId,
    );
    aggregateRequestId = parent?.supply_request_id ?? null;
    return { completed: false as const };
  };
  const result = await receive();
  if ("shouldFinalize" in result) {
    const finalized = await finalizeRoutingTrip(tripId, ["delivered_to_warehouse"]);
    if (!finalized.success) return void res.status(409).json({ error: "لا يمكن استلام هذه السيارة في حالتها الحالية" });
    return void res.json({ message: "تم استلام حمولة السيارة، وتحديث المخزون وإتاحتها ✅" });
  }
  if (result.missing) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (result.conflict) return void res.status(409).json({ error: "لا يمكن استلام هذه السيارة في حالتها الحالية" });
  if (aggregateRequestId !== null) await updateRoutingRequestAggregateStatus(aggregateRequestId);
  await syncRoutingTripLog(tripId);
  res.json({
    message: result.completed
      ? "تم استلام حمولة السيارة، وتحديث المخزون وإتاحتها ✅"
      : "تم تأكيد استلام السيارة — بانتظار الموافقة",
  });
});

router.put("/supply-request-trips/:id/warehouse-approve", async (req, res) => {
  const tripId = Number(req.params.id);
  if (!Number.isSafeInteger(tripId) || tripId <= 0) return void res.status(400).json({ error: "رقم الرحلة غير صحيح" });
  const requestInfo = await queryOne<{ routing_dispatch_id: number | null; warehouse_id: number | null }>(`
    SELECT sr.routing_dispatch_id, sr.warehouse_id
    FROM supply_request_trips t JOIN supply_requests sr ON sr.id=t.supply_request_id
    WHERE t.id=?
  `, tripId);
  if (!requestInfo) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (!requestInfo.routing_dispatch_id || !requestInfo.warehouse_id) {
    return void res.status(409).json({ error: "هذا الإجراء مخصص لرحلات التوجيه المرتبطة بمستودع" });
  }
  const access = await routingWarehouseAccess(req, requestInfo.warehouse_id);
  if (access === "unauthenticated") return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (access === "forbidden") return void res.status(403).json({ error: "يجب أن تكون مسؤول المستودع المعيّن لهذا الطلب" });

  const result = await finalizeRoutingTrip(tripId, ["pending_warehouse_approval"]);
  if (result.missing) return void res.status(404).json({ error: "الرحلة غير موجودة" });
  if (result.notRouting) return void res.status(409).json({ error: "الرحلة ليست مرتبطة بتوجيه للمستودع" });
  if (result.conflict) return void res.status(409).json({ error: "يجب تأكيد استلام هذه السيارة قبل الموافقة" });
  res.json({ message: "تمت الموافقة — حمولتها أضيفت للمخزون والسيارة أصبحت متاحة ✅" });
});

router.put("/supply-requests/:id/receive", async (req, res) => {
  const { receive_notes } = req.body;
  const requestInfo = await queryOne<{ routing_dispatch_id: number | null; warehouse_id: number | null }>(
    "SELECT routing_dispatch_id, warehouse_id FROM supply_requests WHERE id=?", req.params.id,
  );
  if (!requestInfo) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (requestInfo.routing_dispatch_id) {
    return void res.status(409).json({ error: "يجب تأكيد استلام كل سيارة من سجل رحلتها بشكل مستقل" });
  }
  const requiresApproval = await warehouseRequiresApproval(requestInfo.warehouse_id);
  let arrivedTripIds: number[] = [];
  const receive = async () => {
    const sr = await queryOne<{ status: string }>("SELECT status FROM supply_requests WHERE id=?", req.params.id);
    if (!sr) return { missing: true as const };
    if (sr.status !== "delivered_to_warehouse") return { conflict: true as const };
    if (!requiresApproval) {
      return { shouldFinalize: true as const };
    }
    const children = await queryAll<{ status: string }>(
      "SELECT status FROM supply_request_trips WHERE supply_request_id=?", req.params.id,
    );
    if (children.some(t => !["delivered_to_warehouse", "pending_warehouse_approval", "completed", "cancelled", "rejected"].includes(t.status))) {
      return { undelivered: true as const };
    }
    const changed = await execute(`
      UPDATE supply_requests
      SET status='pending_warehouse_approval', notes=COALESCE(?,notes), updated_at=datetime('now')
      WHERE id=? AND status='delivered_to_warehouse'
    `, receive_notes || null, req.params.id);
    if (!changed.changes) return { conflict: true as const };
    await execute(`
      UPDATE supply_request_trips SET status='pending_warehouse_approval', updated_at=datetime('now')
      WHERE supply_request_id=? AND status='delivered_to_warehouse'
    `, req.params.id);
    const arrivedTrips = await queryAll<{ id: number }>(`
      SELECT id FROM supply_request_trips
      WHERE supply_request_id=? AND status='pending_warehouse_approval'
    `, req.params.id);
    arrivedTripIds = arrivedTrips.map(trip => trip.id);
    return { ok: true as const, autoFinalized: false as const };
  };
  const result = await receive();
  if ("shouldFinalize" in result) {
    const finalized = await finalizeWarehouseRequest(Number(req.params.id), ["delivered_to_warehouse"]);
    if (finalized.success) {
      return void res.json({ message: "تم الاستلام وإضافة الحمولة للمخزون" });
    }
    if (finalized.undelivered) return void res.status(409).json({ error: "لا يمكن الاستلام قبل وصول جميع الرحلات النشطة" });
    return void res.status(409).json({ error: "لا يمكن استلام الطلب في حالته الحالية" });
  }
  for (const tripId of arrivedTripIds) await syncRoutingTripLog(tripId);
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
router.put("/supply-requests/:id/approve", async (req, res) => {
  const requestInfo = await queryOne<{ routing_dispatch_id: number | null }>(
    "SELECT routing_dispatch_id FROM supply_requests WHERE id=?", req.params.id,
  );
  if (!requestInfo) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (requestInfo.routing_dispatch_id) {
    return void res.status(409).json({ error: "يجب الموافقة على كل سيارة من سجل رحلتها بشكل مستقل" });
  }
  const result = await finalizeWarehouseRequest(Number(req.params.id), ["pending_warehouse_approval"]);
  if (result.missing) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (result.conflict) return void res.status(409).json({ error: "تمت الموافقة على الطلب مسبقاً أو لم يصل إلى مرحلة الموافقة" });
  if (result.undelivered) return void res.status(409).json({ error: "لا يمكن الموافقة قبل تسليم جميع الرحلات النشطة" });
  res.json({ message: "تمت الموافقة — المخزون حُدِّث والسيارة أُفرجت" });
});

// ── Invoice / Auto-Replenishment Settings ─────────────────────────────────────
router.get("/invoice-settings", async (_req, res) => {
  res.json(await queryOne("SELECT * FROM invoice_settings WHERE id=1") || {});
});

router.put("/invoice-settings", async (req, res) => {
  const { auto_replenishment, auto_invoice_enabled, auto_invoice_categories, prices_locked } = req.body;
  await execute(
    "UPDATE invoice_settings SET auto_replenishment=?,auto_invoice_enabled=?,auto_invoice_categories=?,prices_locked=?,updated_at=datetime('now') WHERE id=1"
  ,
    auto_replenishment ? 1 : 0,
    auto_invoice_enabled ? 1 : 0,
    JSON.stringify(auto_invoice_categories || []),
    prices_locked ? 1 : 0,
  );
  res.json({ message: "تم الحفظ" });
});

export default router;
