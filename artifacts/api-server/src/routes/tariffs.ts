import { Router } from "express";
import db from "../lib/db.js";
import { invalidateSlaCache } from "../lib/sla.js";

const router = Router();

function snapshotMutableTariffValues() {
  db.prepare(`
    INSERT OR IGNORE INTO trip_tariff_expense_snapshots (trip_id, driver_expense)
    SELECT t.id, COALESCE((
      SELECT tf.driver_expense
      FROM tariffs tf
      WHERE tf.loading_place = t.loading_region
        AND tf.unloading_place = t.unloading_region
      LIMIT 1
    ), 0)
    FROM trips t
    WHERE t.tariff_driver_expense_snapshot IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM trip_tariff_expense_snapshots s WHERE s.trip_id = t.id
      )
  `).run();

  db.prepare(`
    UPDATE loading_orders
    SET tariff_loading_place = COALESCE(tariff_loading_place, (
          SELECT tf.loading_place FROM tariffs tf WHERE tf.id = loading_orders.tariff_id
        )),
        tariff_unloading_place = COALESCE(tariff_unloading_place, (
          SELECT tf.unloading_place FROM tariffs tf WHERE tf.id = loading_orders.tariff_id
        )),
        tariff_bonus = COALESCE(tariff_bonus, (
          SELECT tf.driver_expense FROM tariffs tf WHERE tf.id = loading_orders.tariff_id
        )),
        tariff_rental_per_ton = COALESCE(tariff_rental_per_ton, (
          SELECT tf.rental FROM tariffs tf WHERE tf.id = loading_orders.tariff_id
        ))
    WHERE tariff_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM tariffs tf WHERE tf.id = loading_orders.tariff_id)
      AND (
        tariff_loading_place IS NULL OR tariff_unloading_place IS NULL
        OR tariff_bonus IS NULL OR tariff_rental_per_ton IS NULL
      )
  `).run();
}

function mutateTariffs<T>(mutation: () => T): T {
  return db.transaction(() => {
    snapshotMutableTariffValues();
    return mutation();
  })();
}

// GET /tariffs
router.get("/tariffs", (_req, res) => {
  const rows = db.prepare("SELECT * FROM tariffs ORDER BY loading_place, unloading_place").all() as { id: number }[];
  const locations = db.prepare("SELECT id, tariff_id, kind, name, url FROM tariff_locations ORDER BY id").all() as
    { id: number; tariff_id: number; kind: string; name: string; url: string }[];
  const byTariff = new Map<number, typeof locations>();
  locations.forEach(location => byTariff.set(location.tariff_id, [...(byTariff.get(location.tariff_id) || []), location]));
  const syncedAt = (db.prepare("SELECT MAX(synced_at) as ts FROM tariffs").get() as { ts: string | null })?.ts;
  res.json({ rows: rows.map(row => ({ ...row, locations: byTariff.get(row.id) || [] })), count: rows.length, synced_at: syncedAt });
});

function parseLocation(body: Record<string, unknown>): { name: string; url: string } | null {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!name || name.length > 100 || !rawUrl || rawUrl.length > 2048) return null;
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return { name, url: rawUrl };
  } catch { return null; }
}

router.post("/tariffs/:id/locations", (req, res) => {
  const tariffId = Number(req.params.id);
  if (!Number.isSafeInteger(tariffId) || !db.prepare("SELECT 1 FROM tariffs WHERE id=?").get(tariffId))
    return void res.status(404).json({ error: "التعريفة غير موجودة" });
  const kind = req.body?.kind;
  const location = parseLocation(req.body || {});
  if (!["loading", "unloading"].includes(kind) || !location)
    return void res.status(400).json({ error: "أدخل اسمًا ورابطًا صحيحًا للّوكيشن" });
  const existing = db.prepare("SELECT id FROM tariff_locations WHERE tariff_id=? AND kind=? AND url=?")
    .get(tariffId, kind, location.url) as { id: number } | undefined;
  if (existing) return void res.status(409).json({ error: "هذا اللوكيشن موجود بالفعل في التعريفة", id: existing.id });
  const result = db.prepare("INSERT INTO tariff_locations(tariff_id,kind,name,url) VALUES(?,?,?,?)")
    .run(tariffId, kind, location.name, location.url);
  res.status(201).json({ id: result.lastInsertRowid, ...location, kind });
});

router.put("/tariffs/:id/locations/:locationId", (req, res) => {
  const location = parseLocation(req.body || {});
  if (!location) return void res.status(400).json({ error: "أدخل اسمًا ورابطًا صحيحًا للّوكيشن" });
  const current = db.prepare("SELECT kind FROM tariff_locations WHERE id=? AND tariff_id=?")
    .get(req.params.locationId, req.params.id) as { kind: string } | undefined;
  if (!current) return void res.status(404).json({ error: "اللوكيشن غير موجود" });
  if (db.prepare("SELECT 1 FROM tariff_locations WHERE tariff_id=? AND kind=? AND url=? AND id<>?")
    .get(req.params.id, current.kind, location.url, req.params.locationId))
    return void res.status(409).json({ error: "هذا اللوكيشن موجود بالفعل في التعريفة" });
  const result = db.prepare("UPDATE tariff_locations SET name=?, url=? WHERE id=? AND tariff_id=?")
    .run(location.name, location.url, req.params.locationId, req.params.id);
  if (!result.changes) return void res.status(404).json({ error: "اللوكيشن غير موجود" });
  res.json({ ...location });
});

router.delete("/tariffs/:id/locations/:locationId", (req, res) => {
  const result = db.prepare("DELETE FROM tariff_locations WHERE id=? AND tariff_id=?")
    .run(req.params.locationId, req.params.id);
  if (!result.changes) return void res.status(404).json({ error: "اللوكيشن غير موجود" });
  res.json({ message: "تم حذف اللوكيشن" });
});

// GET /tariffs/routes?loading=X — return unloading places + prices + vehicle_type + cargo_type
router.get("/tariffs/routes", (req, res) => {
  const { loading } = req.query as Record<string, string>;
  if (!loading) return void res.json([]);
  const rows = db.prepare(`
    SELECT unloading_place, driver_expense, rental,
           COALESCE(vehicle_type,'') AS vehicle_type,
           COALESCE(cargo_type,'')   AS cargo_type
    FROM tariffs
    WHERE loading_place=? AND status='approved'
    ORDER BY unloading_place
  `).all(loading) as { unloading_place: string; driver_expense: number; rental: number; vehicle_type: string; cargo_type: string }[];
  res.json(rows);
});

// GET /tariffs/route-bonus?loading=X&unloading=Y — lookup driver_expense for a route
router.get("/tariffs/route-bonus", (req, res) => {
  const { loading, unloading } = req.query as Record<string, string>;
  if (!loading || !unloading) return void res.json({ bonus: 0, found: false });
  const row = db.prepare(`
    SELECT driver_expense FROM tariffs
    WHERE loading_place=? AND unloading_place=? AND status='approved'
    ORDER BY CASE WHEN (vehicle_type IS NULL OR vehicle_type='' OR vehicle_type='الكل') THEN 1 ELSE 0 END
    LIMIT 1
  `).get(loading, unloading) as { driver_expense: number } | undefined;
  res.json({ bonus: row?.driver_expense || 0, found: !!row });
});

// GET /tariffs/loading-places
router.get("/tariffs/loading-places", (_req, res) => {
  const rows = db.prepare("SELECT DISTINCT loading_place FROM tariffs ORDER BY loading_place").all() as { loading_place: string }[];
  res.json(rows.map(r => r.loading_place));
});

// GET /tariffs/unloading-places
router.get("/tariffs/unloading-places", (_req, res) => {
  const rows = db.prepare("SELECT DISTINCT unloading_place FROM tariffs ORDER BY unloading_place").all() as { unloading_place: string }[];
  res.json(rows.map(r => r.unloading_place));
});

// POST /tariffs/import - import rows from uploaded file (Excel/CSV parsed on frontend)
router.post("/tariffs/import", (req, res) => {
  const { rows, replace_existing } = req.body as { rows: Record<string, string | number>[]; replace_existing?: boolean };
  if (!Array.isArray(rows) || rows.length === 0)
    return void res.status(400).json({ error: "لا توجد صفوف للاستيراد" });

  const ins = db.prepare(`
    INSERT INTO tariffs (row_id, loading_place, unloading_place, driver_expense, rental, synced_at)
    VALUES (?,?,?,?,?,datetime('now'))
  `);
  let imported = 0; let skipped = 0;
  mutateTariffs(() => {
    if (replace_existing) {
      db.prepare("DELETE FROM tariffs WHERE row_id IS NOT NULL").run();
    }
    for (const row of rows) {
      const loading   = String(row["مكان التحميل"]   || row["loading_place"]   || "").trim();
      const unloading = String(row["مكان التنزيل"]  || row["unloading_place"]  || "").trim();
      if (!loading || !unloading) { skipped++; continue; }
      const rowId = parseInt(String(row["ID"] || row["id"] || "")) || null;
      ins.run(
        rowId,
        loading,
        unloading,
        parseFloat(String(row["السعر"] || row["مصروف السائق"] || row["driver_expense"] || "0")) || 0,
        parseFloat(String(row["الايجار"] || row["الإيجار"] || row["rental"] || "0")) || 0,
      );
      imported++;
    }
  });
  res.json({ imported, skipped, message: `تم استيراد ${imported} سطر${skipped ? ` وتخطي ${skipped} سطر فارغ` : ""}` });
});

// PUT /tariffs/:id
router.put("/tariffs/:id", (req, res) => {
  const { loading_place, unloading_place, driver_expense, rental, notes, vehicle_type,
          supplier, customer_name, loaded_meters, cargo_type, km_per_route, image_url } = req.body;
  mutateTariffs(() => {
    db.prepare(`UPDATE tariffs SET
      loading_place=?, unloading_place=?, driver_expense=?, rental=?, notes=?, vehicle_type=?,
      supplier=?, customer_name=?, loaded_meters=?, cargo_type=?, km_per_route=?, image_url=?
      WHERE id=?`)
      .run(loading_place, unloading_place,
           parseFloat(driver_expense)||0, parseFloat(rental)||0,
           notes||null, vehicle_type||null,
           supplier||null, customer_name||null,
           loaded_meters != null ? parseFloat(loaded_meters)||null : null,
           cargo_type||null,
           km_per_route != null && km_per_route !== "" ? parseFloat(km_per_route)||null : null,
           image_url||null,
           req.params.id);
  });
  res.json({ message: "تم التحديث" });
});

// PATCH /tariffs/:id/image — update only image_url (after upload)
router.patch("/tariffs/:id/image", (req, res) => {
  const { image_url } = req.body;
  mutateTariffs(() => db.prepare("UPDATE tariffs SET image_url=? WHERE id=?").run(image_url||null, req.params.id));
  res.json({ message: "تم تحديث الصورة" });
});

// DELETE /tariffs/:id
router.delete("/tariffs/:id", (req, res) => {
  mutateTariffs(() => db.prepare("DELETE FROM tariffs WHERE id=?").run(req.params.id));
  res.json({ message: "تم الحذف" });
});

// POST /tariffs (manual add)
router.post("/tariffs", (req, res) => {
  const { loading_place, unloading_place, driver_expense, rental, notes, vehicle_type,
          supplier, customer_name, loaded_meters, cargo_type, km_per_route } = req.body;
  const r = mutateTariffs(() => db.prepare(`
    INSERT INTO tariffs
      (loading_place, unloading_place, driver_expense, rental, notes, vehicle_type,
       supplier, customer_name, loaded_meters, cargo_type, km_per_route, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'approved')
  `).run(loading_place, unloading_place,
         parseFloat(driver_expense)||0, parseFloat(rental)||0,
         notes||null, vehicle_type||null,
         supplier||null, customer_name||null,
         loaded_meters != null ? parseFloat(String(loaded_meters))||null : null,
         cargo_type||null,
         km_per_route != null && km_per_route !== "" ? parseFloat(String(km_per_route))||null : null));
  res.status(201).json({ id: r.lastInsertRowid, message: "تم الإضافة" });
});

// GET /tariffs/from-trips — analyze existing trips for tariff suggestions
router.get("/tariffs/from-trips", (_req, res) => {
  const groups = db.prepare(`
    SELECT
      client_name,
      material_type,
      destination,
      COUNT(*)                                                  AS trip_count,
      AVG(unit_price)                                           AS avg_price,
      MAX(unit_price)                                           AS max_price,
      MIN(unit_price)                                           AS min_price,
      AVG(COALESCE(bonus_amount,0))                             AS avg_bonus,
      AVG(COALESCE(material_expense_diesel,0))                  AS avg_diesel,
      AVG(COALESCE(bonus_amount,0) + COALESCE(material_expense_diesel,0)) AS avg_driver_total,
      MAX(car_id)                                               AS sample_car
    FROM trips
    WHERE destination IS NOT NULL AND destination != ''
      AND client_name IS NOT NULL AND client_name != ''
    GROUP BY client_name, material_type, destination
    ORDER BY trip_count DESC, client_name
    LIMIT 200
  `).all();
  res.json(groups);
});

// POST /tariffs/propose — driver proposes new route
router.post("/tariffs/propose", (req, res) => {
  const { loading_place, unloading_place, proposed_by } = req.body;
  if (!loading_place || !unloading_place) return void res.status(400).json({ error: "مكان التحميل والتنزيل مطلوبان" });
  const existing = db.prepare("SELECT id FROM tariffs WHERE loading_place=? AND unloading_place=? AND status='approved'").get(loading_place, unloading_place);
  if (existing) return void res.status(409).json({ error: "هذا المسار موجود مسبقاً في التعريفة" });
  const r = mutateTariffs(() => db.prepare("INSERT INTO tariffs (loading_place,unloading_place,driver_expense,rental,status,proposed_by) VALUES (?,?,0,0,'pending',?)")
    .run(loading_place, unloading_place, proposed_by||null));
  const sups = db.prepare("SELECT phone FROM users WHERE role='supervisor' AND active=1").all() as {phone:string}[];
  sups.forEach(s => db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)").run(s.phone, "مسار جديد مقترح", `مسار: ${loading_place} → ${unloading_place} يحتاج تسعيراً`));
  res.status(201).json({ id: r.lastInsertRowid, message: "تم إرسال اقتراح المسار للمشرف" });
});

// PUT /tariffs/:id/set-price — supervisor sets price
router.put("/tariffs/:id/set-price", (req, res) => {
  const { driver_expense, rental, set_by } = req.body;
  mutateTariffs(() => db.prepare("UPDATE tariffs SET driver_expense=?,rental=?,price_set_by=? WHERE id=?")
    .run(parseFloat(driver_expense)||0, parseFloat(rental)||0, set_by||null, req.params.id));
  const tariff = db.prepare("SELECT * FROM tariffs WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  const fins = db.prepare("SELECT phone FROM users WHERE role IN ('admin','finance') AND active=1").all() as {phone:string}[];
  fins.forEach(f => db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)").run(f.phone, "تعريفة تنتظر الموافقة", `مسار ${tariff?.loading_place} → ${tariff?.unloading_place} جاهز للموافقة`));
  res.json({ message: "تم تحديث السعر" });
});

// PUT /tariffs/:id/approve — finance approves
router.put("/tariffs/:id/approve", (req, res) => {
  mutateTariffs(() => db.prepare("UPDATE tariffs SET status='approved' WHERE id=?").run(req.params.id));
  const tariff = db.prepare("SELECT * FROM tariffs WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  if (tariff?.proposed_by) db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)").run(tariff.proposed_by, "تمت الموافقة على المسار", `مسار: ${tariff.loading_place} → ${tariff.unloading_place}`);
  res.json({ message: "تمت الموافقة" });
});

// PUT /tariffs/:id/reject — finance rejects
router.put("/tariffs/:id/reject", (req, res) => {
  mutateTariffs(() => db.prepare("UPDATE tariffs SET status='rejected' WHERE id=?").run(req.params.id));
  const tariff = db.prepare("SELECT * FROM tariffs WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  if (tariff?.proposed_by) db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)").run(tariff.proposed_by, "رُفض المسار المقترح", `مسار: ${tariff.loading_place} → ${tariff.unloading_place}`);
  res.json({ message: "تم الرفض" });
});

// GET /finance-settings
router.get("/finance-settings", (_req, res) => {
  const s = db.prepare("SELECT * FROM finance_settings WHERE id=1").get();
  res.json(s || { supervisor_salary_pct:5, transport_pct:3, admin_pct:7, driver_salary_default:3000 });
});

// PUT /finance-settings
router.put("/finance-settings", (req, res) => {
  const { supervisor_salary_pct, transport_pct, admin_pct, driver_salary_default } = req.body;
  db.prepare("UPDATE finance_settings SET supervisor_salary_pct=?,transport_pct=?,admin_pct=?,driver_salary_default=?,updated_at=datetime('now') WHERE id=1")
    .run(parseFloat(supervisor_salary_pct)||5, parseFloat(transport_pct)||3, parseFloat(admin_pct)||7, parseFloat(driver_salary_default)||3000);
  res.json({ message: "تم حفظ الإعدادات" });
});

// GET /finance/report
router.get("/finance/report", (req, res) => {
  const { from, to } = req.query as { from?:string; to?:string };
  const d = new Date(); d.setDate(1);
  const fromDate = from || d.toISOString().slice(0,10);
  const toDate   = to   || new Date().toISOString().slice(0,10);

  const settings = (db.prepare("SELECT * FROM finance_settings WHERE id=1").get() as Record<string,number>|undefined)
    || { supervisor_salary_pct:5, transport_pct:3, admin_pct:7, driver_salary_default:3000 };

  const orders = db.prepare(`
    SELECT vehicle_plate, driver_name, driver_phone,
      COUNT(*) as trips,
      COALESCE(SUM(rental_amount),0) as revenue,
      COALESCE(SUM(driver_bonus),0) as driver_bonus_total
    FROM workflow_orders
    WHERE stage='delivered'
      AND vehicle_plate IS NOT NULL AND vehicle_plate != ''
      AND (
        (delivery_date IS NOT NULL AND delivery_date BETWEEN ? AND ?)
        OR (delivery_date IS NULL AND DATE(created_at) BETWEEN ? AND ?)
      )
    GROUP BY vehicle_plate, driver_name, driver_phone
  `).all(fromDate, toDate, fromDate, toDate) as Record<string,unknown>[];

  const dieselMap = new Map<string,number>();
  (db.prepare("SELECT driver_phone, COALESCE(SUM(amount),0) as total FROM driver_expenses WHERE expense_date BETWEEN ? AND ? GROUP BY driver_phone").all(fromDate,toDate) as Record<string,unknown>[])
    .forEach(r => dieselMap.set(r.driver_phone as string, r.total as number));

  const repairMap = new Map<string,number>();
  (db.prepare("SELECT car_id, COALESCE(SUM(amount),0) as total FROM fleet_expenses WHERE date BETWEEN ? AND ? GROUP BY car_id").all(fromDate,toDate) as Record<string,unknown>[])
    .forEach(r => repairMap.set(r.car_id as string, r.total as number));

  const report = orders.map(o => {
    const revenue           = (o.revenue as number) || 0;
    const driver_bonus_gross= (o.driver_bonus_total as number) || 0;
    const diesel            = dieselMap.get(o.driver_phone as string) || 0;
    const repairs           = repairMap.get(o.vehicle_plate as string) || 0;
    const supervisor_cost   = +(revenue * settings.supervisor_salary_pct / 100).toFixed(2);
    const transport_cost    = +(revenue * settings.transport_pct / 100).toFixed(2);
    const admin_cost        = +(revenue * settings.admin_pct / 100).toFixed(2);
    const driver_salary     = settings.driver_salary_default;
    const net_profit        = +(revenue - driver_salary - driver_bonus_gross - diesel - repairs - supervisor_cost - transport_cost - admin_cost).toFixed(2);
    return { vehicle_plate: o.vehicle_plate, driver_name: o.driver_name, driver_phone: o.driver_phone,
      trips: o.trips, revenue, driver_bonus_gross, diesel, repairs, supervisor_cost, transport_cost, admin_cost, driver_salary, net_profit };
  }).sort((a: Record<string,unknown>, b: Record<string,unknown>) => (b.revenue as number) - (a.revenue as number));

  const zero = { trips:0, revenue:0, driver_bonus_gross:0, diesel:0, repairs:0, supervisor_cost:0, transport_cost:0, admin_cost:0, driver_salary:0, net_profit:0 };
  const totals = report.reduce((acc: typeof zero, r: Record<string,unknown>) => ({
    trips:             acc.trips             + (r.trips as number),
    revenue:           acc.revenue           + (r.revenue as number),
    driver_bonus_gross:acc.driver_bonus_gross+ (r.driver_bonus_gross as number),
    diesel:            acc.diesel            + (r.diesel as number),
    repairs:           acc.repairs           + (r.repairs as number),
    supervisor_cost:   acc.supervisor_cost   + (r.supervisor_cost as number),
    transport_cost:    acc.transport_cost    + (r.transport_cost as number),
    admin_cost:        acc.admin_cost        + (r.admin_cost as number),
    driver_salary:     acc.driver_salary     + (r.driver_salary as number),
    net_profit:        +((acc.net_profit     + (r.net_profit as number)).toFixed(2)),
  }), zero);

  res.json({ report, totals, settings, from: fromDate, to: toDate });
});

// ── SLA Settings ─────────────────────────────────────────────────────────────
router.get("/company-settings/sla", (_req, res) => {
  const rows = db.prepare("SELECT * FROM sla_settings ORDER BY id").all();
  res.json(rows);
});

router.put("/company-settings/sla", (req, res) => {
  const { settings } = req.body as {
    settings: Array<{ stage: string; limit_minutes: number }>;
  };
  if (!Array.isArray(settings)) return void res.status(400).json({ error: "settings يجب أن يكون مصفوفة" });

  const update = db.prepare(
    "UPDATE sla_settings SET limit_minutes=?, updated_at=datetime('now') WHERE stage=?"
  );
  for (const s of settings) {
    if (!s.stage || typeof s.limit_minutes !== "number" || s.limit_minutes < 1) continue;
    update.run(s.limit_minutes, s.stage);
  }

  // Invalidate the in-memory SLA settings cache (imported at top)
  invalidateSlaCache();
  res.json({ ok: true });
});

// ── Company Settings ─────────────────────────────────────────────────────────
router.get("/company-settings", (_req, res) => {
  const rows = db.prepare("SELECT * FROM company_settings WHERE active=1 ORDER BY id").all();
  res.json(rows);
});
router.get("/company-settings/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM company_settings WHERE id=?").get(req.params.id);
  if (!row) return void res.status(404).json({ error: "غير موجود" });
  res.json(row);
});
router.put("/company-settings/:id", (req, res) => {
  const { entity_name, tax_number, national_address, cr_number, phone } = req.body;
  db.prepare("UPDATE company_settings SET entity_name=COALESCE(?,entity_name), tax_number=COALESCE(?,tax_number), national_address=COALESCE(?,national_address), cr_number=COALESCE(?,cr_number), phone=COALESCE(?,phone) WHERE id=?")
    .run(entity_name||null, tax_number||null, national_address||null, cr_number||null, phone||null, req.params.id);
  res.json({ message: "تم الحفظ" });
});
router.post("/company-settings", (req, res) => {
  const { entity_name, tax_number, national_address, cr_number, phone } = req.body;
  if (!entity_name) return void res.status(400).json({ error: "اسم الجهة مطلوب" });
  const r = db.prepare("INSERT INTO company_settings (entity_name,tax_number,national_address,cr_number,phone) VALUES (?,?,?,?,?)")
    .run(entity_name, tax_number||"", national_address||"", cr_number||"", phone||"");
  res.status(201).json({ id: r.lastInsertRowid });
});
router.delete("/company-settings/:id", (req, res) => {
  const row = db.prepare("SELECT id FROM company_settings WHERE id=? AND active=1").get(req.params.id);
  if (!row) return void res.status(404).json({ error: "الفرع غير موجود" });
  db.prepare("UPDATE company_settings SET active=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Flatbed Route Multipliers ────────────────────────────────────────────────
router.get("/flatbed-multipliers", (_req, res) => {
  res.json(db.prepare("SELECT * FROM flatbed_multipliers ORDER BY id").all());
});

router.post("/flatbed-multipliers", (req, res) => {
  const { origin_city, dest_city, multiplier, notes } = req.body;
  if (!origin_city || !dest_city) return void res.status(400).json({ error: "مدينة الانطلاق والوجهة مطلوبتان" });
  const r = db.prepare("INSERT INTO flatbed_multipliers (origin_city,dest_city,multiplier,notes) VALUES (?,?,?,?)")
    .run(origin_city, dest_city, parseFloat(multiplier) || 2, notes || null);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.put("/flatbed-multipliers/:id", (req, res) => {
  const { origin_city, dest_city, multiplier, notes } = req.body;
  db.prepare("UPDATE flatbed_multipliers SET origin_city=?,dest_city=?,multiplier=?,notes=? WHERE id=?")
    .run(origin_city, dest_city, parseFloat(multiplier) || 2, notes || null, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/flatbed-multipliers/:id", (req, res) => {
  db.prepare("DELETE FROM flatbed_multipliers WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// ── Order cancel ─────────────────────────────────────────────────────────────
router.put("/workflow/orders/:id/cancel", (req, res) => {
  const { cancelled_by, cancel_reason } = req.body;
  const order = db.prepare("SELECT * FROM workflow_orders WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (order.stage === "delivered") return void res.status(400).json({ error: "لا يمكن إلغاء طلب مسلّم" });
  db.prepare("UPDATE workflow_orders SET stage='cancelled', cancelled_at=datetime('now'), cancelled_by=?, cancel_reason=? WHERE id=?")
    .run(cancelled_by||null, cancel_reason||null, req.params.id);
  // Notify customer
  if (order.customer_phone) db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)").run(order.customer_phone, "تم إلغاء طلبك", `رقم الطلب: ${order.order_number}${cancel_reason ? " — السبب: " + cancel_reason : ""}`);
  res.json({ message: "تم الإلغاء" });
});

export default router;
