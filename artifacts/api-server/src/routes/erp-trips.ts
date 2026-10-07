import { Router, type Request, type Response, type NextFunction } from "express";
import db from "../lib/db.js";
import { ensureRentalPortalUser } from "../lib/rental-portal-users.js";
import { lookupRouteBonus } from "./driver-bonus.js";
import { queueTripInvoiceIdentityExtraction } from "./invoice-extraction.js";
import { isSysAdminToken } from "./auth.js";

const router = Router();
const TRIP_EDITOR_ROLES = new Set(["admin", "supervisor", "reviewer"]);
try { db.exec("ALTER TABLE trips ADD COLUMN client_request_id TEXT"); } catch {}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_client_request_id ON trips(client_request_id) WHERE client_request_id IS NOT NULL");

function canEditTrips(authorization: string | undefined): boolean {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (isSysAdminToken(token)) return true;
  const caller = db.prepare(`
    SELECT u.role
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
    ORDER BY s.rowid DESC LIMIT 1
  `).get(token) as { role: string } | undefined;
  return Boolean(caller && TRIP_EDITOR_ROLES.has(caller.role));
}

function requireRoutingLookupEditor(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (isSysAdminToken(token)) return next();
  const caller = db.prepare(`
    SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
  `).get(token) as { role: string } | undefined;
  if (!caller || !["admin", "supervisor"].includes(caller.role)) {
    return void res.status(403).json({ error: "صلاحيات مشرف النقليات مطلوبة" });
  }
  next();
}

/** Historical trip ownership is based on the driver name saved on the trip. */
function getKnownDriverNames(phone: string, names: Array<string | null | undefined>): string[] {
  const aliases = db.prepare(`
    SELECT da.alias_name
    FROM driver_aliases da
    JOIN driver_profiles dp ON dp.id=da.driver_id
    WHERE dp.phone=?
  `).all(phone) as { alias_name: string }[];
  return [...new Set([
    ...names,
    ...aliases.map(row => row.alias_name),
  ].filter((name): name is string => Boolean(name && name.trim())))];
}

/** Resolve the driver currently recorded for a new trip without changing old trips. */
function snapshotDriverPhone(driverName: string | null | undefined, vehiclePlate: string): string | null {
  const byName = driverName
    ? db.prepare("SELECT phone FROM driver_profiles WHERE driver_name=? LIMIT 1").get(driverName) as { phone: string | null } | undefined
    : undefined;
  if (byName?.phone) return byName.phone;
  const byVehicle = vehiclePlate
    ? db.prepare("SELECT phone FROM driver_profiles WHERE vehicle_plate=? LIMIT 1").get(vehiclePlate) as { phone: string | null } | undefined
    : undefined;
  return byVehicle?.phone || null;
}

/** For a manually added trip, associate the chosen driver rather than an old profile on the plate. */
function newTripDriverPhone(driverName: string | null | undefined, vehiclePlate: string): string | null {
  const name = driverName?.trim();
  if (!name) return null;
  const fleetDriver = db.prepare(
    "SELECT driver_name, driver_phone FROM fleet_vehicles WHERE plate_number=? LIMIT 1"
  ).get(vehiclePlate) as { driver_name: string | null; driver_phone: string | null } | undefined;
  if (fleetDriver?.driver_name?.trim() === name && fleetDriver.driver_phone) return fleetDriver.driver_phone;
  const account = db.prepare(
    "SELECT phone FROM users WHERE role='driver' AND active=1 AND name=? LIMIT 1"
  ).get(name) as { phone: string | null } | undefined;
  if (account?.phone) return account.phone;
  const profile = db.prepare(
    "SELECT phone FROM driver_profiles WHERE driver_name=? LIMIT 1"
  ).get(name) as { phone: string | null } | undefined;
  return profile?.phone || null;
}

/** GET /trips/for-driver — رحلات السائق المسجلة عبر session token (لا يحتاج JWT) */
router.get("/trips/for-driver", (req, res) => {
  // Resolve driver from session token (Bearer header)
  const raw = (req.headers.authorization ?? "").replace("Bearer ", "").trim();
  if (!raw || raw === "guest" || raw === "null" || raw === "undefined") {
    res.status(401).json({ error: "غير مصرح" }); return;
  }
  // No expiry check — consistent with /auth/me which also skips expiry in production
  const session = db.prepare(
    "SELECT user_id FROM sessions WHERE token = ?"
  ).get(raw) as { user_id: number } | undefined;
  if (!session) { res.status(401).json({ error: "الجلسة غير موجودة" }); return; }
  const dbUser = db.prepare(
    "SELECT name, phone, vehicle_plate FROM users WHERE id = ? AND active = 1"
  ).get(session.user_id) as { name: string; phone: string; vehicle_plate: string | null } | undefined;
  if (!dbUser) { res.status(401).json({ error: "المستخدم غير موجود" }); return; }

  const phone = dbUser.phone;
  const dp = db.prepare(
    "SELECT driver_name FROM driver_profiles WHERE phone=? LIMIT 1"
  ).get(phone) as { driver_name: string } | undefined;
  const names = getKnownDriverNames(phone, [dbUser.name, dp?.driver_name]);

  const rows = db.prepare(`
    SELECT DISTINCT t.id, t.date, t.car_id, t.driver_name,
           t.destination, t.image_url, t.notes,
           COALESCE(t.route_bonus, 0) AS route_bonus,
           COALESCE(t.return_value_no_vat, 0) AS return_value_no_vat,
           COALESCE(t.net_amount, 0) AS net_amount,
           t.trip_state, t.loading_region, t.unloading_region,
           COALESCE(t.trips_count, 0) AS trips_count,
           COALESCE(t.unit_price, 0) AS unit_price,
           t.client_name
    FROM trips t
    WHERE ${
      names.length ? `t.driver_name IN (${names.map(() => "?").join(",")})` : "0"
    } OR ((t.driver_name IS NULL OR TRIM(t.driver_name)='') AND t.driver_phone=?)
    ORDER BY t.date DESC, t.id DESC
    LIMIT 200
  `).all(...names, phone);
  res.json(rows);
});

/** GET /trips/mine — all trips that belong to the authenticated driver */
router.get("/trips/mine", (req, res) => {
  const user = (req as unknown as { user?: { phone?: string; name?: string; vehicle_plate?: string } }).user;
  if (!user?.phone) { res.status(401).json({ error: "غير مصرح" }); return; }

  // Resolve driver's vehicle plate from driver_profiles (most reliable)
  const dp = db.prepare(
    "SELECT driver_name FROM driver_profiles WHERE phone=? LIMIT 1"
  ).get(user.phone) as { driver_name: string } | undefined;

  // Also collect all names this driver is known by
  const nameRows = db.prepare(
    "SELECT name FROM users WHERE phone=?"
  ).all(user.phone) as { name: string }[];
  const names = getKnownDriverNames(user.phone, [
    ...nameRows.map(row => row.name),
    dp?.driver_name,
    user.name,
  ]);
  const rows = db.prepare(`
    SELECT DISTINCT t.id, t.date, t.car_id, t.driver_name,
           t.destination, t.image_url, t.notes,
           COALESCE(t.route_bonus, 0) AS route_bonus,
           COALESCE(t.return_value_no_vat, 0) AS return_value_no_vat,
           COALESCE(t.net_amount, 0) AS net_amount,
           t.trip_state, t.loading_region, t.unloading_region,
           COALESCE(t.trips_count, 0) AS trips_count,
           COALESCE(t.unit_price, 0) AS unit_price,
           t.client_name
    FROM trips t
    WHERE ${
      names.length ? `t.driver_name IN (${names.map(() => "?").join(",")})` : "0"
    } OR ((t.driver_name IS NULL OR TRIM(t.driver_name)='') AND t.driver_phone=?)
    ORDER BY t.date DESC, t.id DESC
    LIMIT 100
  `).all(...names, user.phone);
  res.json(rows);
});

/** Helper: resolve driver identity from session token */
function resolveDriverFromToken(authHeader: string | undefined): { phone: string; names: string[] } | null {
  const raw = (authHeader ?? "").replace("Bearer ", "").trim();
  if (!raw || raw === "guest" || raw === "null" || raw === "undefined") return null;
  const session = db.prepare("SELECT user_id FROM sessions WHERE token = ?").get(raw) as { user_id: number } | undefined;
  if (!session) return null;
  const dbUser = db.prepare("SELECT name, phone, vehicle_plate FROM users WHERE id = ? AND active = 1").get(session.user_id) as { name: string; phone: string; vehicle_plate: string | null } | undefined;
  if (!dbUser) return null;
  const dp = db.prepare("SELECT driver_name FROM driver_profiles WHERE phone=? LIMIT 1").get(dbUser.phone) as { driver_name: string } | undefined;
  return {
    phone: dbUser.phone,
    names: getKnownDriverNames(dbUser.phone, [dbUser.name, dp?.driver_name]),
  };
}

/** PATCH /trips/:id/driver-note — driver updates notes or image on their own trip */
router.patch("/trips/:id/driver-note", (req, res) => {
  const driver = resolveDriverFromToken(req.headers.authorization);
  if (!driver) { res.status(401).json({ error: "غير مصرح" }); return; }

  const { notes, image_url } = req.body as { notes?: string; image_url?: string };

  // A current vehicle assignment must never grant access to an old driver's trip.
  const { names } = driver;
  const trip = db.prepare(`
    SELECT id FROM trips
    WHERE id=? AND (
      ${names.length ? `driver_name IN (${names.map(() => "?").join(",")})` : "0"}
      OR ((driver_name IS NULL OR TRIM(driver_name)='') AND driver_phone=?)
    )
  `).get(req.params.id, ...names, driver.phone);
  if (!trip) { res.status(403).json({ error: "غير مسموح بتعديل هذه الرحلة" }); return; }

  if (notes !== undefined) db.prepare("UPDATE trips SET notes=? WHERE id=?").run(notes || null, req.params.id);
  if (image_url !== undefined) {
    db.prepare(`
      UPDATE trips
      SET image_url=?, invoice_identity_status=NULL, invoice_identity_updated_at=NULL
      WHERE id=?
    `).run(image_url || null, req.params.id);
  }

  res.json({ message: "تم التحديث" });
  if (image_url) queueTripInvoiceIdentityExtraction(Number(req.params.id));
});

router.get("/trips", (req, res) => {
  const { from, to, car_id, trailer_id, page, limit, column_filters } = req.query as Record<string, string>;
  const conditions: string[] = ["1=1"];
  const params: Array<string | number> = [];
  const filterColumns: Record<string, string> = {
    date: "t.date", payment_voucher: "t.payment_voucher", loading_card_no: "t.loading_card_no",
    car_id: "t.car_id", linked_trailer_number: "COALESCE(t.trailer_number, fv.linked_trailer_number)",
    vehicle_type: "t.vehicle_type", driver_name: "t.driver_name", material_type: "t.material_type",
    meter_ton: "t.meter_ton", unit_price: "t.unit_price", trips_count: "t.trips_count",
    return_value_no_vat: "t.return_value_no_vat", client_name: "t.client_name", supplier: "t.supplier",
    material_expense_diesel: "t.material_expense_diesel", work_value: "t.work_value",
    loading_region: "t.loading_region", unloading_region: "t.unloading_region", route_bonus: "t.route_bonus",
    net_amount: "t.net_amount", image_url: "t.image_url", invoice_data_status: "t.invoice_data_status",
    notes: "t.notes", cash_collection: "t.cash_collection",
  };
  if (from)       { conditions.push("t.date >= ?");                                              params.push(from); }
  if (to)         { conditions.push("t.date <= ?");                                              params.push(to); }
  if (car_id)     { conditions.push("t.car_id = ?");                                             params.push(car_id); }
  if (trailer_id) { conditions.push("t.trailer_number = ?"); params.push(trailer_id); }
  let activeColumnFilters = false;
  if (column_filters) {
    try {
      const parsed = JSON.parse(column_filters) as Record<string, unknown>;
      for (const [key, rawValues] of Object.entries(parsed)) {
        const expression = filterColumns[key];
        const values = Array.isArray(rawValues) ? rawValues.map(String) : [];
        if (!expression || values.length === 0) continue;
        const includesBlank = values.includes("(فارغ)");
        const normalValues = values.filter(value => value !== "(فارغ)");
        const parts: string[] = [];
        if (normalValues.length) {
          parts.push(`CAST(${expression} AS TEXT) IN (${normalValues.map(() => "?").join(",")})`);
          params.push(...normalValues);
        }
        if (includesBlank) parts.push(`COALESCE(TRIM(CAST(${expression} AS TEXT)), '') = ''`);
        conditions.push(`(${parts.join(" OR ")})`);
        activeColumnFilters = true;
      }
    } catch {
      return res.status(400).json({ error: "فلاتر الأعمدة غير صالحة" });
    }
  }
  const paginated = !activeColumnFilters && (page !== undefined || limit !== undefined);
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
  const safePage = Math.max(1, Number(page) || 1);
  const count = paginated
    ? (db.prepare(`SELECT COUNT(*) total FROM trips t LEFT JOIN fleet_vehicles fv ON fv.plate_number = t.car_id WHERE ${conditions.join(" AND ")}`).get(...params) as { total: number }).total
    : 0;
  const sql = `
    SELECT t.*, COALESCE(t.trailer_number, fv.linked_trailer_number) AS linked_trailer_number,
           (SELECT route_child.status
            FROM supply_request_trips route_child
            WHERE t.client_request_id = 'routing-trip:' || route_child.id
            LIMIT 1) AS routing_child_status
    FROM trips t
    LEFT JOIN fleet_vehicles fv ON fv.plate_number = t.car_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY t.date DESC, t.id DESC
    ${paginated ? "LIMIT ? OFFSET ?" : ""}
  `;
  const rows = db.prepare(sql).all(...params, ...(paginated ? [safeLimit, (safePage - 1) * safeLimit] : [])) as Array<Record<string, unknown>>;
  const routeChildIds = [...new Set(rows.flatMap(row => {
    const match = String(row.client_request_id || "").match(/^routing-trip:(\d+)$/);
    return match ? [Number(match[1])] : [];
  }))];
  const routeChildRows = routeChildIds.length
    ? db.prepare(`SELECT id, cargo_items_json, attachments_json FROM supply_request_trips WHERE id IN (${routeChildIds.map(() => "?").join(",")})`)
        .all(...routeChildIds) as Array<{ id: number; cargo_items_json: string | null; attachments_json: string | null }>
    : [];
  const routeChildById = new Map(routeChildRows.map(child => [child.id, child]));
  const parseJsonArray = (raw: unknown): Array<Record<string, unknown>> => {
    if (typeof raw !== "string" || !raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === "object") : [];
    } catch { return []; }
  };
  const enrichedRows = rows.map(row => {
    const match = String(row.client_request_id || "").match(/^routing-trip:(\d+)$/);
    const child = match ? routeChildById.get(Number(match[1])) : undefined;
    if (!child) return row;
    const scalarUrls = new Set([row.image_url, row.permit_image_url, row.fsohat_image_url].filter(value => typeof value === "string"));
    const routingAttachments = parseJsonArray(child.attachments_json)
      .filter(item => typeof item.url === "string" && !scalarUrls.has(item.url));
    return {
      ...row,
      routing_cargo_items: parseJsonArray(child.cargo_items_json),
      routing_attachments: routingAttachments,
    };
  });
  return res.json(
    paginated
      ? { rows: enrichedRows, total: count, page: safePage, limit: safeLimit, pages: Math.max(1, Math.ceil(count / safeLimit)) }
      : activeColumnFilters
        ? { rows: enrichedRows, total: enrichedRows.length, page: 1, limit: enrichedRows.length, pages: 1, filtered: true }
        : enrichedRows
  );
});

router.get("/trips/filter-options", (req, res) => {
  const { key, from, to } = req.query as Record<string, string>;
  const filterColumns: Record<string, string> = {
    date: "t.date", payment_voucher: "t.payment_voucher", loading_card_no: "t.loading_card_no", car_id: "t.car_id",
    linked_trailer_number: "COALESCE(t.trailer_number, fv.linked_trailer_number)", vehicle_type: "t.vehicle_type",
    driver_name: "t.driver_name", material_type: "t.material_type", meter_ton: "t.meter_ton", unit_price: "t.unit_price",
    trips_count: "t.trips_count", return_value_no_vat: "t.return_value_no_vat", client_name: "t.client_name",
    supplier: "t.supplier", material_expense_diesel: "t.material_expense_diesel", work_value: "t.work_value",
    loading_region: "t.loading_region", unloading_region: "t.unloading_region", route_bonus: "t.route_bonus",
    net_amount: "t.net_amount", image_url: "t.image_url", invoice_data_status: "t.invoice_data_status",
    notes: "t.notes", cash_collection: "t.cash_collection",
  };
  const expression = filterColumns[key];
  if (!expression) return res.status(400).json({ error: "عمود غير صالح" });
  const conditions = ["1=1"];
  const params: string[] = [];
  if (from) { conditions.push("t.date >= ?"); params.push(from); }
  if (to) { conditions.push("t.date <= ?"); params.push(to); }
  const values = db.prepare(`
    SELECT DISTINCT COALESCE(NULLIF(TRIM(CAST(${expression} AS TEXT)), ''), '(فارغ)') value
    FROM trips t LEFT JOIN fleet_vehicles fv ON fv.plate_number = t.car_id
    WHERE ${conditions.join(" AND ")} ORDER BY value
  `).all(...params) as Array<{ value: string }>;
  return res.json(values.map(row => row.value));
});

router.get("/trip-customers", (_req, res) => {
  res.json(db.prepare("SELECT id,name,phone,customer_type,active FROM rental_customers WHERE active=1 ORDER BY customer_type,name").all());
});

router.post("/trip-customers", requireRoutingLookupEditor, (req, res) => {
  const { name, phone, customer_type } = req.body as Record<string, unknown>;
  const customerName = String(name ?? "").trim();
  if (!customerName) return void res.status(400).json({ error: "اسم العميل مطلوب" });
  if (customer_type !== "rental" && customer_type !== "company") {
    return void res.status(400).json({ error: "تصنيف العميل يجب أن يكون rental أو company" });
  }
  try {
    const { customer, created } = db.transaction(() => {
      const insertion = db.prepare(`
        INSERT OR IGNORE INTO rental_customers (name, phone, customer_type, active)
        VALUES (?, ?, ?, 1)
      `).run(customerName, phone ? String(phone).trim() : null, customer_type);
      const row = db.prepare(
        "SELECT id,name,phone,customer_type,active FROM rental_customers WHERE LOWER(TRIM(name))=LOWER(TRIM(?))"
      ).get(customerName) as { id: number; name: string; phone: string | null; customer_type: string; active: number } | undefined;
      if (!row || row.customer_type !== customer_type)
        throw new Error("اسم العميل مسجل بتصنيف مختلف؛ لم يتم تغيير بيانات العملاء أو الرحلات السابقة");
      if (row.active && row.customer_type === "rental")
        ensureRentalPortalUser(row.id, row.name, row.phone, row.customer_type);
      return { customer: row, created: !!insertion.changes };
    })();
    res.status(created ? 201 : 200).json(customer);
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "تعذر إنشاء حساب العميل" });
  }
});

router.get("/routing-cargo-types", (_req, res) => {
  res.json(db.prepare("SELECT id,name,created_at FROM routing_cargo_types ORDER BY name COLLATE NOCASE").all());
});

router.post("/routing-cargo-types", requireRoutingLookupEditor, (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return void res.status(400).json({ error: "اسم نوع الشحنة مطلوب" });
  try {
    const result = db.prepare("INSERT INTO routing_cargo_types (name) VALUES (?)").run(name);
    res.status(201).json(db.prepare("SELECT id,name,created_at FROM routing_cargo_types WHERE id=?").get(result.lastInsertRowid));
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return void res.status(409).json({ error: "نوع الشحنة موجود مسبقاً" });
    throw error;
  }
});

router.put("/routing-cargo-types/:id", requireRoutingLookupEditor, (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name ?? "").trim();
  if (!Number.isInteger(id) || id <= 0 || !name) return void res.status(400).json({ error: "معرف واسم نوع الشحنة مطلوبان" });
  try {
    const result = db.prepare("UPDATE routing_cargo_types SET name=? WHERE id=?").run(name, id);
    if (!result.changes) return void res.status(404).json({ error: "نوع الشحنة غير موجود" });
    res.json(db.prepare("SELECT id,name,created_at FROM routing_cargo_types WHERE id=?").get(id));
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return void res.status(409).json({ error: "نوع الشحنة موجود مسبقاً" });
    throw error;
  }
});

router.delete("/routing-cargo-types/:id", requireRoutingLookupEditor, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ error: "معرف نوع الشحنة غير صالح" });
  const result = db.prepare("DELETE FROM routing_cargo_types WHERE id=?").run(id);
  if (!result.changes) return void res.status(404).json({ error: "نوع الشحنة غير موجود" });
  res.json({ message: "تم حذف نوع الشحنة" });
});

function resolveCustomerType(clientName: unknown): "rental" | "company" | null {
  const name = String(clientName ?? "").trim();
  if (!name) return null;
  db.prepare("INSERT OR IGNORE INTO rental_customers(name,customer_type) VALUES(?,'rental')").run(name);
  const row = db.prepare("SELECT customer_type FROM rental_customers WHERE LOWER(TRIM(name))=LOWER(TRIM(?))")
    .get(name) as { customer_type: "rental" | "company" } | undefined;
  return row?.customer_type || "rental";
}

router.get("/trips/summary", (_req, res) => {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total_records,
      COALESCE(SUM(trips_count),0) as total_trips,
      COALESCE(SUM(return_value_no_vat),0) as total_return_no_vat,
      COALESCE(SUM(cash_collection),0) as total_cash,
      COALESCE(SUM(net_amount),0) as total_net
    FROM trips
    WHERE client_request_id IS NULL
       OR client_request_id NOT LIKE 'routing-trip:%'
       OR EXISTS (
         SELECT 1 FROM supply_request_trips route_child
         WHERE trips.client_request_id = 'routing-trip:' || route_child.id
           AND route_child.status='completed'
       )
  `).get() as Record<string, unknown>;
  const cfgRow = db.prepare("SELECT value FROM system_config WHERE key='show_vehicle_stops'").get() as { value: string } | undefined;
  res.json({ ...row, show_vehicle_stops: cfgRow?.value === "1" });
});

/** GET /trips/stops — vehicle stop records, filterable by from/to/car_id */
router.get("/trips/stops", (req, res) => {
  const { from, to, car_id } = req.query as Record<string, string>;
  let sql = "SELECT * FROM vehicle_stop_records WHERE 1=1";
  const params: string[] = [];
  if (from)   { sql += " AND stop_date >= ?"; params.push(from); }
  if (to)     { sql += " AND stop_date <= ?"; params.push(to); }
  if (car_id) { sql += " AND vehicle_plate = ?"; params.push(car_id); }
  sql += " ORDER BY stop_date DESC, id DESC";
  try {
    res.json(db.prepare(sql).all(...params));
  } catch {
    res.json([]);
  }
});

/** POST /trips/stops — manual stop record */
router.post("/trips/stops", (req, res) => {
  const { vehicle_plate, stop_date, reason, notes } = req.body as Record<string, string>;
  if (!vehicle_plate || !stop_date) {
    res.status(400).json({ error: "vehicle_plate و stop_date مطلوبان" }); return;
  }
  try {
    const r = db.prepare(
      "INSERT OR REPLACE INTO vehicle_stop_records (vehicle_plate, stop_date, reason, source, notes) VALUES (?,?,?,?,?)"
    ).run(
      vehicle_plate,
      stop_date,
      reason || "توقف بدون عذر",
      "manual",
      notes || null
    );
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

/** PUT /trips/stops/:id — edit reason / notes */
router.put("/trips/stops/:id", (req, res) => {
  const { reason, notes } = req.body as Record<string, string>;
  try {
    db.prepare(
      "UPDATE vehicle_stop_records SET reason=COALESCE(?,reason), notes=?, source='manual' WHERE id=?"
    ).run(reason || null, notes || null, req.params.id);
    res.json({ message: "تم التحديث" });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// Convert M/D/YY, M/D/YYYY, or YYYY-MM-DD → ISO (YYYY-MM-DD).
// Mirrors the same helper in workshop.ts so both endpoints handle imported slash-format dates.
function mlDateToISO(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parts = trimmed.split("/");
  if (parts.length !== 3) return "";
  const [m, d, y] = parts;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

type WorkshopDeductionRow = {
  maintenance_date: string | null;
  amount: number | null;
  vehicle_plate: string | null;
  trailer_number: string | null;
  vehicle_choice: string | null;
};

/** GET /trips/deductions — workshop (from maintenance_logs) + purchase costs for the filtered period */
router.get("/trips/deductions", (req, res) => {
  const { from, to, car_id } = req.query as Record<string, string>;
  const df = from || "2000-01-01";
  const dt = to   || "2099-12-31";

  // Candidate rows from maintenance_logs — fetched without SQL date filter because
  // imported records may use M/D/YY or M/D/YYYY slash formats that SQLite date() parses as NULL.
  // Date filtering is done in JS using mlDateToISO().

  try {
    let headTotal    = 0;
    let trailerTotal = 0;

    if (car_id) {
      // ── Specific vehicle filter ─────────────────────────────────────────────
      // Resolve linked trailer for this vehicle
      const fv = db.prepare(
        "SELECT linked_trailer_number FROM fleet_vehicles WHERE plate_number = ? LIMIT 1"
      ).get(car_id) as { linked_trailer_number: string | null } | undefined;
      const linkedTrailer = String(fv?.linked_trailer_number ?? "").trim() || null;
      const candidateConditions = ["vehicle_plate = ?"];
      const candidateParams: string[] = [car_id];
      if (linkedTrailer) {
        candidateConditions.push("trailer_number = ?");
        candidateParams.push(linkedTrailer);
      }
      const maintenanceRows = db.prepare(
        `SELECT maintenance_date, amount, vehicle_plate, trailer_number, vehicle_choice
         FROM maintenance_logs
         WHERE ${candidateConditions.join(" OR ")}`
      ).all(...candidateParams) as WorkshopDeductionRow[];

      for (const row of maintenanceRows) {
        const iso = mlDateToISO(String(row.maintenance_date ?? ""));
        if (!iso || iso < df || iso > dt) continue;
        const plate = String(row.vehicle_plate ?? "").trim();
        const trailer = String(row.trailer_number ?? "").trim();
        const target = row.vehicle_choice === "trailer"
          ? "trailer"
          : row.vehicle_choice === "vehicle"
            ? "vehicle"
            : trailer ? "trailer" : "vehicle";

        if (target === "vehicle" && plate === car_id) {
          headTotal += Number(row.amount) || 0;
        } else if (
          target === "trailer" &&
          ((row.vehicle_choice === "trailer" && plate === car_id) ||
            (!!linkedTrailer && trailer === linkedTrailer))
        ) {
          trailerTotal += Number(row.amount) || 0;
        }
      }
    } else {
      // ── No vehicle filter — scope to vehicles present in trips for the period ─
      // Only vehicles that actually ran trips in this date range are included,
      // matching the user expectation that deduction cards reflect the same fleet
      // as the trips being summarised.
      const tripPlateRows = db.prepare(
        "SELECT DISTINCT car_id FROM trips WHERE date(date) BETWEEN ? AND ? AND car_id IS NOT NULL AND car_id != ''"
      ).all(df, dt) as { car_id: string }[];
      const tripPlates = tripPlateRows.map(r => r.car_id);

      if (tripPlates.length > 0) {
        const platePh = tripPlates.map(() => "?").join(",");

        // Linked trailers for those vehicles
        const trailerLinkRows = db.prepare(
          `SELECT linked_trailer_number FROM fleet_vehicles
           WHERE plate_number IN (${platePh})
             AND linked_trailer_number IS NOT NULL AND linked_trailer_number != ''`
        ).all(...tripPlates) as { linked_trailer_number: string }[];
        const linkedTrailers = trailerLinkRows.map(r => r.linked_trailer_number);

        const candidateConditions: string[] = [];
        const candidateParams: string[] = [];
        if (tripPlates.length > 0) {
          candidateConditions.push(`vehicle_plate IN (${platePh})`);
          candidateParams.push(...tripPlates);
        }
        if (linkedTrailers.length > 0) {
          const trailerPh = linkedTrailers.map(() => "?").join(",");
          candidateConditions.push(`trailer_number IN (${trailerPh})`);
          candidateParams.push(...linkedTrailers);
        }
        if (candidateConditions.length > 0) {
          const maintenanceRows = db.prepare(
            `SELECT maintenance_date, amount, vehicle_plate, trailer_number, vehicle_choice
             FROM maintenance_logs
             WHERE ${candidateConditions.map(condition => `(${condition})`).join(" OR ")}`
          ).all(...candidateParams) as WorkshopDeductionRow[];
          const tripPlateSet = new Set(tripPlates);
          const linkedTrailerSet = new Set(linkedTrailers);

          for (const row of maintenanceRows) {
            const iso = mlDateToISO(String(row.maintenance_date ?? ""));
            if (!iso || iso < df || iso > dt) continue;
            const plate = String(row.vehicle_plate ?? "").trim();
            const trailer = String(row.trailer_number ?? "").trim();
            const belongsToTripVehicle = tripPlateSet.has(plate);
            const belongsToTripTrailer = linkedTrailerSet.has(trailer);
            const target = row.vehicle_choice === "trailer"
              ? "trailer"
              : row.vehicle_choice === "vehicle"
                ? "vehicle"
                : trailer ? "trailer" : "vehicle";

            if (row.vehicle_choice === "vehicle" && belongsToTripVehicle) {
              headTotal += Number(row.amount) || 0;
            } else if (row.vehicle_choice === "trailer" && (belongsToTripVehicle || belongsToTripTrailer)) {
              trailerTotal += Number(row.amount) || 0;
            } else if (row.vehicle_choice !== "vehicle" && row.vehicle_choice !== "trailer") {
              // Preserve the previous number-based split for older rows without a saved target.
              if (target === "trailer" && belongsToTripTrailer) {
                trailerTotal += Number(row.amount) || 0;
              } else if (target === "vehicle" && belongsToTripVehicle) {
                headTotal += Number(row.amount) || 0;
              }
            }
          }
        }
      }
    }

    // ── Purchase invoice costs — scoped to trip vehicles when no car_id ───────
    let purchaseTotal = 0;
    if (car_id) {
      const row = db.prepare(`
        SELECT COALESCE(SUM(COALESCE(price_after_vat, 0) * COALESCE(quantity, 1)), 0) AS total
        FROM purchase_invoices
        WHERE date(COALESCE(invoice_date, created_at)) BETWEEN ? AND ?
          AND vehicle_plate = ?
      `).get(df, dt, car_id) as { total: number };
      purchaseTotal = row.total ?? 0;
    } else {
      // Scope to vehicles in trips for the period
      const tripPlateRows2 = db.prepare(
        "SELECT DISTINCT car_id FROM trips WHERE date(date) BETWEEN ? AND ? AND car_id IS NOT NULL AND car_id != ''"
      ).all(df, dt) as { car_id: string }[];
      const tripPlates2 = tripPlateRows2.map(r => r.car_id);
      if (tripPlates2.length > 0) {
        const ph2 = tripPlates2.map(() => "?").join(",");
        const row = db.prepare(`
          SELECT COALESCE(SUM(COALESCE(price_after_vat, 0) * COALESCE(quantity, 1)), 0) AS total
          FROM purchase_invoices
          WHERE date(COALESCE(invoice_date, created_at)) BETWEEN ? AND ?
            AND vehicle_plate IN (${ph2})
        `).get(df, dt, ...tripPlates2) as { total: number };
        purchaseTotal = row.total ?? 0;
      }
    }
    const purchaseRow = { total: purchaseTotal };

    res.json({
      total_workshop: 0,                           // kept for API compatibility
      total_parts:    headTotal + trailerTotal,    // frontend: workshopTotal = total_workshop + total_parts
      parts_head:     headTotal,                   // frontend: headTotal = total_workshop + parts_head
      parts_trailer:  trailerTotal,
      total_purchase: purchaseRow.total ?? 0,
    });
  } catch {
    res.json({ total_workshop: 0, total_parts: 0, parts_head: 0, parts_trailer: 0, total_purchase: 0 });
  }
});

/** POST /trips/driver-image — السائق يرفع صورة حمولة مباشرة بدون طلب */
router.post("/trips/driver-image", (req, res) => {
  const driver = resolveDriverFromToken(req.headers.authorization);
  if (!driver) { res.status(401).json({ error: "غير مصرح" }); return; }
  const { image_url, car_id, driver_name, date, notes } = req.body as Record<string, string>;
  if (!image_url) { res.status(400).json({ error: "image_url مطلوب" }); return; }
  const today = date || new Date().toISOString().slice(0, 10);
  // حاول جلب اسم السائق من driver_profiles إن لم يُرسَل
  let resolvedName = driver_name || null;
  const plate = (car_id || "").trim();
  if (plate && !resolvedName) {
    const dp = db.prepare("SELECT driver_name FROM driver_profiles WHERE vehicle_plate=? LIMIT 1")
      .get(plate) as { driver_name: string } | undefined;
    if (dp?.driver_name) resolvedName = dp.driver_name;
  }
  // Snapshot the current linked trailer at the time of trip creation
  let trailerSnapshot: string | null = null;
  if (plate) {
    const fv = db.prepare("SELECT linked_trailer_number FROM fleet_vehicles WHERE plate_number=? LIMIT 1")
      .get(plate) as { linked_trailer_number: string | null } | undefined;
    trailerSnapshot = fv?.linked_trailer_number || null;
  }
  const result = db.prepare(`
    INSERT INTO trips (date, car_id, driver_name, driver_phone, image_url, trips_count, unit_price,
                       total_amount, vat, net_amount, notes, trailer_number)
    VALUES (?,?,?,?,?,0,0,0,0,0,?,?)
  `).run(today, plate, resolvedName, driver.phone, image_url, notes || null, trailerSnapshot);
  res.status(201).json({ id: result.lastInsertRowid });
  queueTripInvoiceIdentityExtraction(Number(result.lastInsertRowid));
});

router.post("/trips/bulk", (req, res) => {
  const { rows } = req.body as { rows: Record<string, unknown>[] };
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "لا توجد بيانات" });
    return;
  }

  // Pre-fetch trailer snapshots for all unique plates in one query
  const uniquePlates = [...new Set(rows.map(r => (r.car_id as string || "").trim()).filter(Boolean))];
  const trailerMap = new Map<string, string | null>();
  if (uniquePlates.length > 0) {
    const ph = uniquePlates.map(() => "?").join(",");
    const fvRows = db.prepare(
      `SELECT plate_number, linked_trailer_number FROM fleet_vehicles WHERE plate_number IN (${ph})`
    ).all(...uniquePlates) as { plate_number: string; linked_trailer_number: string | null }[];
    for (const fv of fvRows) trailerMap.set(fv.plate_number, fv.linked_trailer_number || null);
  }

  const stmt = db.prepare(`
    INSERT INTO trips (
      date, car_id, driver_name, driver_phone, client_name, customer_type_snapshot, material_type, destination,
      trips_count, unit_price, return_value_no_vat, trip_state,
      payment_voucher, loading_card_no, vehicle_type, meter_ton,
      supplier, material_expense_diesel, work_value, notes, cash_collection,
      total_amount, vat, net_amount, trailer_number
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertAll = db.transaction((rows: Record<string, unknown>[]) => {
    let count = 0;
    for (const r of rows) {
      const plate  = (r.car_id as string || "").trim();
      const cnt    = parseInt(r.trips_count as string) || 1;
      const price  = parseFloat(r.unit_price as string) || 0;
      const mton   = parseFloat(r.meter_ton as string) || 0;
      // Use pre-calculated value from Excel if present, else fallback to meter_ton*price*count
      const preCalc = parseFloat(r.return_value_no_vat as string) || 0;
      const rvnv   = preCalc > 0 ? preCalc : parseFloat((mton > 0 ? mton * price * cnt : cnt * price).toFixed(2));
      const trailerSnapshot = trailerMap.get(plate) ?? null;
      stmt.run(
        r.date || "", plate, r.driver_name || null, snapshotDriverPhone(r.driver_name as string, plate), r.client_name || null, resolveCustomerType(r.client_name),
        r.material_type || null, r.destination || null,
        cnt, price, rvnv, r.trip_state || null,
        r.payment_voucher || null, r.loading_card_no || null, r.vehicle_type || null,
        mton, r.supplier || null,
        parseFloat(r.material_expense_diesel as string) || 0,
        parseFloat(r.work_value as string) || 0,
        r.notes || null,
        parseFloat(r.cash_collection as string) || 0,
        rvnv, 0, rvnv, trailerSnapshot
      );
      count++;
    }
    return count;
  });
  const inserted = insertAll(rows);
  res.json({ inserted, message: `تم استيراد ${inserted} رحلة` });
});

router.post("/trips", (req, res) => {
  if (!canEditTrips(req.headers.authorization)) {
    return void res.status(403).json({ error: "غير مسموح لك بإضافة الردود أو الحمولات" });
  }
  const requestId = String(req.headers["idempotency-key"] || "").trim();
  if (!requestId || requestId.length > 100) {
    return void res.status(400).json({ error: "معرّف طلب الحفظ غير صالح" });
  }
  const existingTrip = db.prepare("SELECT * FROM trips WHERE client_request_id=?").get(requestId);
  if (existingTrip) {
    return void res.json({ message: "تم الحفظ مسبقًا", trip: existingTrip });
  }
  const {
    date, car_id, driver_name, client_name, material_type, destination,
    trips_count, unit_price, trip_state, distance_km,
    payment_voucher, loading_card_no, vehicle_type, meter_ton,
    supplier, material_expense_diesel, work_value, notes, cash_collection,
    loading_region, unloading_region, route_bonus: formBonus,
    trailer_number: bodyTrailer,
    rental_broker_commission, rental_broker_type, rental_broker_name,
  } = req.body;
  const cnt        = parseInt(trips_count) || 0;
  const price      = parseFloat(unit_price) || 0;
  const mton       = parseFloat(meter_ton) || 0;
  // قيمة الرد = متر/طن × سعر الرد × عدد الردود (إذا لم يوجد متر/طن يُكتفى بالسعر × العدد)
  const rvnv       = parseFloat((mton > 0 ? mton * price * cnt : cnt * price).toFixed(2));
  const tariffBonus = lookupRouteBonus(loading_region || "", unloading_region || "", vehicle_type || "");
  const routeBonusPerReply = parseFloat(formBonus) > 0 ? parseFloat(formBonus) : tariffBonus;
  const routeBonus  = parseFloat((routeBonusPerReply * cnt).toFixed(2));
  const matExpense  = parseFloat(material_expense_diesel) || 0;
  // الصافي = قيمة الرد بدون ضريبة − بونص المسار − مصروف مواد+ديزل
  const netAmount   = parseFloat((rvnv - routeBonus - matExpense).toFixed(2));
  const customerType = resolveCustomerType(client_name);
  const brokerCommission = customerType === "rental" ? parseFloat(rental_broker_commission) || 0 : 0;
  if (brokerCommission < 0 || brokerCommission > rvnv) {
    return void res.status(400).json({ error: "عمولة الوسيط يجب أن تكون بين صفر وإجمالي الإيجار" });
  }
  const brokerType = brokerCommission > 0 && ["self", "external"].includes(rental_broker_type)
    ? rental_broker_type : null;
  if (brokerCommission > 0 && !brokerType) {
    return void res.status(400).json({ error: "حدد هل الوسيط أنت أم وسيط خارجي" });
  }
  const companyShare = customerType === "rental"
    ? parseFloat((rvnv - brokerCommission).toFixed(2)) : null;

  // Snapshot trailer: prefer body value, fallback to current fleet link
  const plate = (car_id || "").trim();
  let trailerSnapshot: string | null = bodyTrailer ? String(bodyTrailer).trim() : null;
  if (!trailerSnapshot && plate) {
    const fv = db.prepare("SELECT linked_trailer_number FROM fleet_vehicles WHERE plate_number=? LIMIT 1")
      .get(plate) as { linked_trailer_number: string | null } | undefined;
    trailerSnapshot = fv?.linked_trailer_number || null;
  }

  const result = db.prepare(`
    INSERT INTO trips (
      date, car_id, driver_name, driver_phone, client_name, customer_type_snapshot, material_type, destination,
      trips_count, unit_price, return_value_no_vat, trip_state, distance_km,
      payment_voucher, loading_card_no, vehicle_type, meter_ton,
      supplier, material_expense_diesel, work_value, notes, cash_collection,
      loading_region, unloading_region, route_bonus,
      total_amount, vat, net_amount, trailer_number, client_request_id,
      rental_company_share, rental_broker_commission, rental_broker_type, rental_broker_name
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    date, plate, driver_name || null, newTripDriverPhone(driver_name, plate), client_name || null, customerType,
    material_type || null, destination || null,
    cnt, price, rvnv, trip_state || null, parseFloat(distance_km) || 0,
    payment_voucher || null, loading_card_no || null, vehicle_type || null,
    mton, supplier || null,
    parseFloat(material_expense_diesel) || 0, parseFloat(work_value) || 0,
    notes || null, parseFloat(cash_collection) || 0,
    loading_region || null, unloading_region || null, routeBonus,
    rvnv, 0, netAmount, trailerSnapshot, requestId,
    companyShare, brokerCommission, brokerType, brokerType === "external" ? rental_broker_name || null : null
  );
  if (String(loading_region || "").trim() || String(unloading_region || "").trim()) {
    db.prepare("UPDATE trips SET invoice_data_source='manual', invoice_data_status='manual', invoice_data_run_id=NULL WHERE id=?")
      .run(result.lastInsertRowid);
  }
  const savedTrip = db.prepare("SELECT * FROM trips WHERE id=?").get(result.lastInsertRowid);
  res.status(201).json({
    id: result.lastInsertRowid,
    return_value_no_vat: rvnv,
    route_bonus: routeBonus,
    net_amount: netAmount,
    trip: savedTrip,
  });
});

router.put("/trips/:id", (req, res) => {
  if (!canEditTrips(req.headers.authorization)) {
    return void res.status(403).json({ error: "غير مسموح لك بتعديل الردود أو الحمولات" });
  }
  const {
    date, driver_name, client_name, material_type, destination,
    trips_count, unit_price, trip_state, distance_km,
    payment_voucher, loading_card_no, vehicle_type, meter_ton,
    supplier, material_expense_diesel, work_value, notes, cash_collection,
    return_value_no_vat, loading_region, unloading_region, route_bonus: formBonus,
    image_url, trailer_number: bodyTrailer,
    rental_broker_commission, rental_broker_type, rental_broker_name,
  } = req.body;
  const cnt        = parseInt(trips_count) || 0;
  const price      = parseFloat(unit_price) || 0;
  const mton       = parseFloat(meter_ton) || 0;
  const rvnv       = parseFloat(return_value_no_vat) > 0
    ? parseFloat(return_value_no_vat)
    : parseFloat((mton > 0 ? mton * price * cnt : cnt * price).toFixed(2));
  const tariffBonus = lookupRouteBonus(loading_region || "", unloading_region || "", vehicle_type || "");
  const submittedBonus = parseFloat(formBonus) || 0;
  const previous = db.prepare("SELECT trips_count, route_bonus FROM trips WHERE id=?")
    .get(req.params.id) as { trips_count: number | null; route_bonus: number | null } | undefined;
  let routeBonus: number;
  if (tariffBonus > 0 && submittedBonus === tariffBonus) {
    routeBonus = tariffBonus * cnt;
  } else if (
    previous &&
    submittedBonus === (previous.route_bonus || 0) &&
    (previous.trips_count || 0) > 0
  ) {
    routeBonus = (submittedBonus / Number(previous.trips_count)) * cnt;
  } else {
    routeBonus = submittedBonus > 0 ? submittedBonus : tariffBonus * cnt;
  }
  routeBonus = parseFloat(routeBonus.toFixed(2));
  const matExpense  = parseFloat(material_expense_diesel) || 0;
  const netAmount   = parseFloat((rvnv - routeBonus - matExpense).toFixed(2));
  const customerType = resolveCustomerType(client_name);
  const brokerCommission = customerType === "rental" ? parseFloat(rental_broker_commission) || 0 : 0;
  if (brokerCommission < 0 || brokerCommission > rvnv) {
    return void res.status(400).json({ error: "عمولة الوسيط يجب أن تكون بين صفر وإجمالي الإيجار" });
  }
  const brokerType = brokerCommission > 0 && ["self", "external"].includes(rental_broker_type)
    ? rental_broker_type : null;
  if (brokerCommission > 0 && !brokerType) {
    return void res.status(400).json({ error: "حدد هل الوسيط أنت أم وسيط خارجي" });
  }
  const companyShare = customerType === "rental"
    ? parseFloat((rvnv - brokerCommission).toFixed(2)) : null;

  // If trailer_number explicitly sent, update the snapshot; otherwise keep existing
  const trailerUpdate = "trailer_number" in req.body
    ? (bodyTrailer ? String(bodyTrailer).trim() : null)
    : undefined;

  const sql = trailerUpdate !== undefined
    ? `UPDATE trips SET
        date=?, driver_name=?, client_name=?, customer_type_snapshot=?, material_type=?, destination=?,
        trips_count=?, unit_price=?, trip_state=?, distance_km=?,
        payment_voucher=?, loading_card_no=?, vehicle_type=?, meter_ton=?,
        supplier=?, material_expense_diesel=?, work_value=?, notes=?, cash_collection=?,
        loading_region=?, unloading_region=?, route_bonus=?,
        return_value_no_vat=?, total_amount=?, net_amount=?,
        rental_company_share=?, rental_broker_commission=?, rental_broker_type=?, rental_broker_name=?,
        image_url=COALESCE(?,image_url), trailer_number=?
       WHERE id=?`
    : `UPDATE trips SET
        date=?, driver_name=?, client_name=?, customer_type_snapshot=?, material_type=?, destination=?,
        trips_count=?, unit_price=?, trip_state=?, distance_km=?,
        payment_voucher=?, loading_card_no=?, vehicle_type=?, meter_ton=?,
        supplier=?, material_expense_diesel=?, work_value=?, notes=?, cash_collection=?,
        loading_region=?, unloading_region=?, route_bonus=?,
        return_value_no_vat=?, total_amount=?, net_amount=?,
        rental_company_share=?, rental_broker_commission=?, rental_broker_type=?, rental_broker_name=?,
        image_url=COALESCE(?,image_url)
       WHERE id=?`;

  const baseParams: unknown[] = [
    date || "", driver_name || null, client_name || null, customerType,
    material_type || null, destination || null,
    cnt, price, trip_state || null, parseFloat(distance_km) || 0,
    payment_voucher || null, loading_card_no || null, vehicle_type || null, mton,
    supplier || null,
    parseFloat(material_expense_diesel) || 0, parseFloat(work_value) || 0,
    notes || null, parseFloat(cash_collection) || 0,
    loading_region || null, unloading_region || null, routeBonus,
    rvnv, rvnv, netAmount,
    companyShare, brokerCommission, brokerType, brokerType === "external" ? rental_broker_name || null : null,
    image_url || null,
  ];

  if (trailerUpdate !== undefined) baseParams.push(trailerUpdate);
  baseParams.push(req.params.id);

  const updateTrip = db.transaction(() => {
    const result = db.prepare(sql).run(...baseParams);
    if (result.changes !== 1) return null;
    db.prepare("UPDATE trips SET invoice_data_source='manual', invoice_data_status='manual', invoice_data_run_id=NULL WHERE id=?")
      .run(req.params.id);
    return db.prepare("SELECT * FROM trips WHERE id=?").get(req.params.id);
  });
  const savedTrip = updateTrip();
  if (!savedTrip) return void res.status(404).json({ error: "الرد أو الحمولة غير موجودة" });
  res.json({
    message: "تم التحديث والحفظ في قاعدة البيانات",
    return_value_no_vat: rvnv,
    route_bonus: routeBonus,
    net_amount: netAmount,
    trip: savedTrip,
  });
});

router.delete("/trips/clear", (_req, res) => {
  db.prepare("DELETE FROM trips").run();
  res.json({ message: "تم مسح جميع الردود" });
});

/** DELETE /trips/:id/mine — driver deletes their own trip (ownership verified) */
router.delete("/trips/:id/mine", (req, res) => {
  const driver = resolveDriverFromToken(req.headers.authorization);
  if (!driver) { res.status(401).json({ error: "غير مصرح" }); return; }
  const { names } = driver;

  const trip = db.prepare(`
    SELECT id FROM trips
    WHERE id=? AND (
      ${names.length ? `driver_name IN (${names.map(() => "?").join(",")})` : "0"}
      OR ((driver_name IS NULL OR TRIM(driver_name)='') AND driver_phone=?)
    )
  `).get(req.params.id, ...names, driver.phone);
  if (!trip) { res.status(403).json({ error: "غير مسموح بحذف هذه الرحلة" }); return; }

  db.prepare("DELETE FROM trips WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

router.delete("/trips/:id", (req, res) => {
  db.prepare("DELETE FROM trips WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
