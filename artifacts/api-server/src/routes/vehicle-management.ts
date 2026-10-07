import { Router } from "express";
import multer from "multer";
import db, { UPLOADS_PATH } from "../lib/db.js";
import { isSysAdminToken } from "./auth.js";
import {
  countVehicleAttachmentReferences,
  deleteVehicleAttachmentBytes,
  getVehicleAttachmentIdentity,
  UnsupportedVehicleAttachmentError,
} from "../lib/vehicle-uploads.js";

const router = Router();

// Convert M/D/YY, M/D/YYYY, or YYYY-MM-DD → ISO 'YYYY-MM-DD' for date comparison
function mlDateToISO(raw: string): string {
  if (!raw) return "";
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const p = t.split("/");
  if (p.length !== 3) return "";
  const y = p[2].length === 2 ? `20${p[2]}` : p[2];
  return `${y}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}`;
}

// ── Migrations ────────────────────────────────────────────────────────────────
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN linked_teidara_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE fleet_vehicles ADD COLUMN linked_teidara_ids TEXT DEFAULT '[]'"); } catch {}
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicle_images (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_number TEXT    NOT NULL,
    angle        TEXT    NOT NULL DEFAULT 'other',
    image_url    TEXT    NOT NULL,
    created_at   TEXT    DEFAULT (datetime('now'))
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_vehicle_images_plate_number ON vehicle_images(plate_number)"); } catch {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g,"_")}`),
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

type AttachmentRemovalResult = {
  fileRemoved: boolean;
  fileRetainedBecauseShared: boolean;
  referencesVerified: boolean;
};

async function removeVehicleAttachmentIfExclusive(
  rawUrl: unknown,
  expectedReferences = 1,
): Promise<AttachmentRemovalResult> {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { fileRemoved: true, fileRetainedBecauseShared: false, referencesVerified: true };
  }

  const identity = getVehicleAttachmentIdentity(rawUrl);
  if (!identity) throw new UnsupportedVehicleAttachmentError();

  const referenceCount = countVehicleAttachmentReferences(identity);
  if (referenceCount !== expectedReferences) {
    return {
      fileRemoved: false,
      fileRetainedBecauseShared: referenceCount > expectedReferences,
      referencesVerified: referenceCount >= expectedReferences,
    };
  }

  await deleteVehicleAttachmentBytes(identity);
  return { fileRemoved: true, fileRetainedBecauseShared: false, referencesVerified: true };
}

function quoteVehicleColumn(column: string): string {
  return `"${column.replace(/"/g, "\"\"")}"`;
}

function parseTeidaraIds(value: unknown): number[] {
  let raw: unknown = value;
  if (typeof value === "string") {
    try { raw = JSON.parse(value); } catch { raw = []; }
  }
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(Number).filter(id => Number.isInteger(id) && id > 0))];
}

function syncVehicleTeidarat(oldPlate: string, newPlate: string, selectedIds: number[]) {
  const selected = new Set(selectedIds);
  const currentLegacy = db.prepare(
    "SELECT id FROM teidarat WHERE vehicle_plate=? OR vehicle_plate=?"
  ).all(oldPlate, newPlate) as { id: number }[];
  const currentFleet = db.prepare(
    "SELECT linked_teidara_id, linked_teidara_ids, linked_trailer_number FROM fleet_vehicles WHERE plate_number=?"
  ).get(newPlate) as { linked_teidara_id?: number | null; linked_teidara_ids?: string | null; linked_trailer_number?: string | null } | undefined;
  const legacyNumber = currentFleet?.linked_trailer_number
    ? db.prepare("SELECT id FROM teidarat WHERE teidara_number=? LIMIT 1")
        .get(currentFleet.linked_trailer_number) as { id: number } | undefined
    : undefined;
  const currentIds = new Set([
    ...currentLegacy.map(row => row.id),
    ...parseTeidaraIds(currentFleet?.linked_teidara_ids),
    ...(currentFleet?.linked_teidara_id ? [Number(currentFleet.linked_teidara_id)] : []),
    ...(legacyNumber?.id ? [legacyNumber.id] : []),
  ]);

  for (const id of currentIds) {
    if (!selected.has(id)) {
      db.prepare("UPDATE teidarat SET vehicle_plate=NULL WHERE id=? AND (vehicle_plate=? OR vehicle_plate=?)")
        .run(id, oldPlate, newPlate);
    }
  }
  if (selectedIds.length) {
    const setPlate = db.prepare("UPDATE teidarat SET vehicle_plate=? WHERE id=?");
    for (const id of selectedIds) setPlate.run(newPlate, id);
  }
  const selectedRows = selectedIds.map(id =>
    db.prepare("SELECT id, teidara_number, teidara_type FROM teidarat WHERE id=?").get(id)
  ).filter(Boolean) as { id: number; teidara_number?: string | null; teidara_type?: string | null }[];
  const primaryTeidara = selectedRows[0];
  const selectedNumbers = new Set(selectedRows.map(row => row.teidara_number).filter(Boolean));
  db.prepare(`
    UPDATE fleet_vehicles
    SET linked_teidara_id=?, linked_teidara_ids=?,
        linked_trailer_number=?, linked_trailer_type=?
    WHERE plate_number=?
  `).run(
    selectedIds[0] || null,
    JSON.stringify(selectedIds),
    primaryTeidara?.teidara_number || null,
    primaryTeidara?.teidara_type || null,
    newPlate,
  );

  const otherVehicles = db.prepare(
    `SELECT plate_number, linked_teidara_id, linked_teidara_ids,
            linked_trailer_number, linked_trailer_type
     FROM fleet_vehicles WHERE plate_number!=?`
  ).all(newPlate) as {
    plate_number: string; linked_teidara_id?: number | null; linked_teidara_ids?: string | null;
    linked_trailer_number?: string | null; linked_trailer_type?: string | null;
  }[];
  for (const vehicle of otherVehicles) {
    const ids = parseTeidaraIds(vehicle.linked_teidara_ids);
    const filtered = ids.filter(id => !selected.has(id));
    const primaryWasRemoved = !!vehicle.linked_teidara_id && selected.has(Number(vehicle.linked_teidara_id));
    const numberWasMoved = !!vehicle.linked_trailer_number && selectedNumbers.has(vehicle.linked_trailer_number);
    const canonicalIdWasMoved = filtered.length !== ids.length || primaryWasRemoved;
    if (canonicalIdWasMoved || numberWasMoved) {
      const nextPrimaryId = primaryWasRemoved
        ? (filtered[0] || null)
        : (vehicle.linked_teidara_id || filtered[0] || null);
      const nextPrimary = nextPrimaryId
        ? db.prepare("SELECT teidara_number, teidara_type FROM teidarat WHERE id=?").get(nextPrimaryId) as
            { teidara_number?: string | null; teidara_type?: string | null } | undefined
        : undefined;
      const nextNumber = nextPrimary?.teidara_number ||
        (canonicalIdWasMoved || numberWasMoved ? null : vehicle.linked_trailer_number || null);
      const nextType = nextPrimary?.teidara_type ||
        (canonicalIdWasMoved || numberWasMoved ? null : vehicle.linked_trailer_type || null);
      db.prepare(`
        UPDATE fleet_vehicles
        SET linked_teidara_id=?, linked_teidara_ids=?,
            linked_trailer_number=?, linked_trailer_type=?
        WHERE plate_number=?
      `).run(nextPrimaryId, JSON.stringify(filtered), nextNumber, nextType, vehicle.plate_number);
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// LINK VEHICLE TO DRIVER  (ربط سيارة بسائق — للمشرف)
// ══════════════════════════════════════════════════════════════════
router.put("/supervisor/link-driver-vehicle", (req, res) => {
  res.status(410).json({ error: "تم نقل ربط السائقين إلى صفحة سيارات الشركة كاملة" });
});

router.put("/supervisor/unlink-driver-vehicle", (req, res) => {
  res.status(410).json({ error: "تم نقل إلغاء الربط إلى صفحة سيارات الشركة كاملة" });
});

// ══════════════════════════════════════════════════════════════════
// DRIVER VEHICLE INFO  (بطاقة السيارة للسائق)
// ══════════════════════════════════════════════════════════════════
router.get("/driver-vehicle-info", (req, res) => {
  const { phone } = req.query as Record<string, string>;
  if (!phone) return void res.status(400).json({ error: "phone required" });
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  const caller = token && !isSysAdminToken(token)
    ? db.prepare(`
        SELECT u.phone, u.role
        FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
        ORDER BY s.rowid DESC LIMIT 1
      `).get(token) as { phone: string | null; role: string } | undefined
    : undefined;
  const canReadOtherDriver = token && (isSysAdminToken(token) || caller?.role === "admin" || caller?.role === "supervisor");
  if (!token || (!canReadOtherDriver && caller?.phone !== phone)) {
    return void res.status(403).json({ error: "غير مسموح بعرض بيانات هذا السائق" });
  }

  // Find the user first
  const user = db.prepare("SELECT id, name, phone, vehicle_plate FROM users WHERE phone = ? LIMIT 1").get(phone) as Record<string,unknown> | undefined;
  if (!user) return void res.status(404).json({ error: "المستخدم غير موجود" });

  // Check driver_profiles for this user (by user_id or phone) to get linked vehicle plate
  const driverProfile = db.prepare(
    "SELECT * FROM driver_profiles WHERE user_id=? OR phone=? ORDER BY (user_id IS NOT NULL) DESC LIMIT 1"
  ).get(user.id, phone) as Record<string,unknown> | undefined;

  // Legacy profile/user plate links remain fallback-only for historical data.
  const effectivePlate = (driverProfile?.vehicle_plate as string | null) || (user.vehicle_plate as string | null);

  // Fleet primary/backup assignment is the source of truth. Return every
  // current assignment so the portal can require a vehicle choice when needed.
  const fleetVehicles = db.prepare(`
    SELECT *,
      CASE
        WHEN driver_phone=? OR (driver_phone IS NULL AND driver_name=?) THEN 'primary'
        ELSE 'backup'
      END AS assignment_role
    FROM fleet_vehicles
    WHERE driver_phone=? OR backup_driver_phone=?
       OR (driver_phone IS NULL AND driver_name=?)
       OR (backup_driver_phone IS NULL AND backup_driver_name=?)
    ORDER BY CASE WHEN driver_phone=? THEN 0 ELSE 1 END, plate_number
  `).all(
    phone, user.name as string,
    phone, phone, user.name as string, user.name as string,
    phone,
  ) as Record<string, unknown>[];

  const vehicle = (
    fleetVehicles[0] ||
    (effectivePlate
      ? db.prepare("SELECT * FROM fleet_vehicles WHERE plate_number = ? LIMIT 1").get(effectivePlate)
      : null) ||
    db.prepare("SELECT * FROM fleet_vehicles WHERE linked_user_phone = ? LIMIT 1").get(phone)
  ) as Record<string,unknown> | null | undefined;

  // Find employee: by phone, or by name as fallback
  const employee = (
    db.prepare("SELECT * FROM employees WHERE phone = ? LIMIT 1").get(phone) ||
    (user.name ? db.prepare("SELECT * FROM employees WHERE name = ? LIMIT 1").get(user.name as string) : null)
  ) as Record<string,unknown> | null | undefined;

  // Return merged result (even without a vehicle — driver still sees their personal docs)
  const row = {
    // vehicle fields
    plate_number:          vehicle?.plate_number          ?? null,
    vehicle_type:          vehicle?.vehicle_type          ?? null,
    vehicle_name:          vehicle?.vehicle_name          ?? null,
    show_cargo_photo:      vehicle?.show_cargo_photo      ?? 1,
    vehicle_subtype:       vehicle?.vehicle_subtype       ?? null,
    status:                vehicle?.status                ?? null,
    driver_name:           vehicle?.driver_name           ?? user.name,
    insurance_start:       vehicle?.insurance_start       ?? null,
    insurance_end:         vehicle?.insurance_end         ?? null,
    inspection_start:      vehicle?.inspection_start      ?? null,
    inspection_end:        vehicle?.inspection_end        ?? null,
    operation_card_start:  vehicle?.operation_card_start  ?? null,
    operation_card_end:    vehicle?.operation_card_end    ?? null,
    entity:                vehicle?.entity                ?? null,
    max_weight_kg:         vehicle?.max_weight_kg         ?? null,
    empty_weight_kg:       vehicle?.empty_weight_kg       ?? null,
    vehicles: fleetVehicles.map(v => ({
      plate_number: v.plate_number,
      vehicle_type: v.vehicle_type,
      vehicle_name: v.vehicle_name,
      assignment_role: v.assignment_role,
    })),
    // employee fields
    iqama_no:              employee?.iqama_no             ?? null,
    iqama_start:           employee?.iqama_start          ?? null,
    iqama_end:             employee?.iqama_end            ?? null,
    driver_license_no:     employee?.driver_license_no    ?? null,
    driver_license_end:    employee?.driver_license_end   ?? null,
    nationality:           employee?.nationality          ?? null,
    hire_date:             employee?.hire_date            ?? null,
  };

  res.json(row);
});

// ══════════════════════════════════════════════════════════════════
// VEHICLE COMPLIANCE DOCS
// ══════════════════════════════════════════════════════════════════

router.get("/vehicle-compliance/:plate", (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM vehicle_compliance_docs WHERE car_number=? ORDER BY doc_type, created_at DESC"
  ).all(req.params.plate);
  res.json(rows);
});

router.post("/vehicle-compliance", upload.single("image"), (req, res) => {
  const { car_number, doc_type, start_date, end_date, notes } = req.body;
  if (!car_number || !doc_type) return void res.status(400).json({ error: "السيارة ونوع الوثيقة مطلوبان" });
  const image_url = req.file ? `/api/uploads/${req.file.filename}` : null;
  const r = db.prepare(`
    INSERT INTO vehicle_compliance_docs (car_number,doc_type,start_date,end_date,image_url,notes)
    VALUES (?,?,?,?,?,?)
  `).run(car_number, doc_type, start_date||null, end_date||null, image_url, notes||null);
  res.status(201).json({ id: r.lastInsertRowid, message: "تم حفظ الوثيقة" });
});

router.put("/vehicle-compliance/:id", upload.single("image"), (req, res) => {
  const existing = db.prepare("SELECT * FROM vehicle_compliance_docs WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  if (!existing) return void res.status(404).json({ error: "الوثيقة غير موجودة" });
  const { doc_type, start_date, end_date, notes } = req.body;
  const image_url = req.file ? `/api/uploads/${req.file.filename}` : (existing.image_url as string|null);
  db.prepare(`
    UPDATE vehicle_compliance_docs SET doc_type=?,start_date=?,end_date=?,image_url=?,notes=?,updated_at=datetime('now') WHERE id=?
  `).run(doc_type||existing.doc_type, start_date||existing.start_date||null, end_date||existing.end_date||null, image_url, notes!==undefined?notes:existing.notes||null, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/vehicle-compliance/:id", async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "رقم الوثيقة غير صالح" });
    return;
  }

  const existing = db.prepare("SELECT id, image_url FROM vehicle_compliance_docs WHERE id=?")
    .get(id) as { id: number; image_url: string | null } | undefined;
  if (!existing) {
    res.status(404).json({ error: "الوثيقة غير موجودة" });
    return;
  }

  let removal: AttachmentRemovalResult;
  try {
    removal = await removeVehicleAttachmentIfExclusive(existing.image_url);
  } catch (error) {
    if (error instanceof UnsupportedVehicleAttachmentError) {
      res.status(422).json({ error: "نوع تخزين هذا الملف لا يدعم الحذف من إدارة الأسطول" });
      return;
    }
    req.log.error({ err: error, documentId: id }, "Could not remove vehicle compliance attachment");
    res.status(500).json({ error: "تعذر حذف الملف من التخزين؛ لم يتم حذف الوثيقة" });
    return;
  }

  const deleted = db.prepare("DELETE FROM vehicle_compliance_docs WHERE id=?").run(id);
  if (!deleted.changes) {
    res.status(404).json({ error: "الوثيقة غير موجودة" });
    return;
  }

  res.json({
    ok: true,
    ...removal,
    clearedFields: [],
  });
});

// ══════════════════════════════════════════════════════════════════
// VEHICLE BREAKDOWNS (new comprehensive table)
// ══════════════════════════════════════════════════════════════════

router.get("/vehicle-breakdowns", (req, res) => {
  const { plate, status } = req.query as Record<string,string>;
  let sql = "SELECT * FROM vehicle_breakdowns WHERE 1=1";
  const params: string[] = [];
  if (plate)  { sql += " AND car_number=?"; params.push(plate); }
  if (status) { sql += " AND status=?";     params.push(status); }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/vehicle-breakdowns", upload.single("photo"), (req, res) => {
  const { car_number, driver_name, driver_phone, operational_state, action_taken, description } = req.body;
  if (!car_number) return void res.status(400).json({ error: "رقم السيارة مطلوب" });
  const photo_url = req.file ? `/api/uploads/${req.file.filename}` : null;
  const r = db.prepare(`
    INSERT INTO vehicle_breakdowns (car_number,driver_name,driver_phone,operational_state,action_taken,description,photo_url)
    VALUES (?,?,?,?,?,?,?)
  `).run(car_number, driver_name||null, driver_phone||null, operational_state||null, action_taken||null, description||null, photo_url);

  // Notify supervisors and workshop managers
  const toNotify = db.prepare("SELECT phone FROM users WHERE role IN ('supervisor','workshop_manager') AND active=1").all() as {phone:string}[];
  const ins = db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)");
  const msg = `بلاغ عطل جديد — السيارة: ${car_number} — الحالة: ${operational_state||"غير محدد"} — الإجراء: ${action_taken||"غير محدد"}`;
  toNotify.forEach(u => ins.run(u.phone, "بلاغ عطل السيارة", msg));

  res.status(201).json({ id: r.lastInsertRowid, message: "تم تسجيل بلاغ العطل" });
});

router.put("/vehicle-breakdowns/:id/resolve", upload.single("invoice"), (req, res) => {
  const existing = db.prepare("SELECT * FROM vehicle_breakdowns WHERE id=?").get(req.params.id) as Record<string,unknown>|undefined;
  if (!existing) return void res.status(404).json({ error: "البلاغ غير موجود" });
  if (!req.file) return void res.status(400).json({ error: "فاتورة الإصلاح مطلوبة لإغلاق البلاغ (تأكيد التسليم بفاتورة)" });
  const { resolved_by, resolve_notes } = req.body;
  const invoice_image_url = `/api/uploads/${req.file.filename}`;
  db.prepare(`
    UPDATE vehicle_breakdowns SET status='resolved',invoice_image_url=?,resolved_by=?,resolve_notes=?,resolved_at=datetime('now') WHERE id=?
  `).run(invoice_image_url, resolved_by||null, resolve_notes||null, req.params.id);
  res.json({ message: "تم إغلاق البلاغ بنجاح" });
});

// DELETE vehicle_breakdown
router.delete("/vehicle-breakdowns/:id", (req, res) => {
  const row = db.prepare("SELECT id FROM vehicle_breakdowns WHERE id=?").get(req.params.id);
  if (!row) return void res.status(404).json({ error: "البلاغ غير موجود" });
  db.prepare("DELETE FROM vehicle_breakdowns WHERE id=?").run(req.params.id);
  res.json({ message: "تم حذف البلاغ" });
});

// EDIT vehicle_breakdown
router.put("/vehicle-breakdowns/:id/edit", (req, res) => {
  const row = db.prepare("SELECT id FROM vehicle_breakdowns WHERE id=?").get(req.params.id);
  if (!row) return void res.status(404).json({ error: "البلاغ غير موجود" });
  const { driver_name, driver_phone, operational_state, action_taken, description } = req.body as Record<string,string>;
  db.prepare(`
    UPDATE vehicle_breakdowns SET driver_name=?,driver_phone=?,operational_state=?,action_taken=?,description=? WHERE id=?
  `).run(driver_name||null, driver_phone||null, operational_state||null, action_taken||null, description||null, req.params.id);
  res.json({ message: "تم تعديل البلاغ" });
});

// DELETE legacy breakdown_report
router.delete("/legacy-breakdowns/:id", (req, res) => {
  const row = db.prepare("SELECT id FROM breakdown_reports WHERE id=?").get(req.params.id);
  if (!row) return void res.status(404).json({ error: "البلاغ غير موجود" });
  db.prepare("DELETE FROM breakdown_reports WHERE id=?").run(req.params.id);
  res.json({ message: "تم حذف البلاغ" });
});

// EDIT legacy breakdown_report (all fields optional — only provided fields are updated)
router.put("/legacy-breakdowns/:id/edit", (req, res) => {
  const row = db.prepare("SELECT * FROM breakdown_reports WHERE id=?").get(req.params.id) as Record<string,unknown> | undefined;
  if (!row) return void res.status(404).json({ error: "البلاغ غير موجود" });
  const { breakdown_type, description, action_taken, operational_state, status, vehicle_plate } = req.body as Record<string,string>;
  db.prepare(`
    UPDATE breakdown_reports
    SET breakdown_type    = COALESCE(?, breakdown_type),
        description       = COALESCE(?, description),
        action_taken      = COALESCE(?, action_taken),
        operational_state = COALESCE(?, operational_state),
        status            = COALESCE(?, status),
        vehicle_plate     = COALESCE(?, vehicle_plate)
    WHERE id = ?
  `).run(
    breakdown_type    || null,
    description       || null,
    action_taken      || null,
    operational_state || null,
    status            || null,
    vehicle_plate     || null,
    req.params.id
  );
  res.json({ message: "تم تعديل البلاغ" });
});

// ══════════════════════════════════════════════════════════════════
// VEHICLE ANALYTICS — داشبورد السيارة الشامل
// ══════════════════════════════════════════════════════════════════

router.get("/vehicle-analytics/:plate", (req, res) => {
  const plate = req.params.plate;
  const { from = "", to = "" } = req.query as Record<string, string>;
  const isoOf = (d: unknown): string => { const p = new Date(String(d || "")); return isNaN(p.getTime()) ? "" : p.toISOString().slice(0, 10); };
  const inRange = (d: unknown): boolean => { if (!from && !to) return true; const iso = isoOf(d); if (!iso) return true; return (!from || iso >= from) && (!to || iso <= to); };
  const sqlDf = from || "0000-01-01";
  const sqlDt = to ? to + " 23:59:59" : "9999-12-31";

  const vehicle = db.prepare("SELECT * FROM fleet_vehicles WHERE plate_number=?").get(plate) as Record<string,unknown>|undefined;
  if (!vehicle) return void res.status(404).json({ error: "السيارة غير موجودة" });

  // Trips - non-ISO dates ("Wednesday, January 14, 2026"), filter in JS
  const allTrips = db.prepare("SELECT * FROM trips WHERE car_id=? ORDER BY date DESC LIMIT 2000").all(plate) as {driver_name:string;trips_count:number;date:string;net_amount:number;distance_km:number;trip_state:string;payment_voucher:string|null;loading_card_no:string|null;vehicle_type:string|null;material_type:string|null;meter_ton:number|null;unit_price:number|null;return_value_no_vat:number|null;client_name:string|null;supplier:string|null;material_expense_diesel:number|null;work_value:number|null;destination:string|null;notes:string|null;cash_collection:number|null}[];
  const trips = allTrips.filter(t => inRange(t.date));
  const totalTrips  = trips.reduce((s, t) => s + (t.trips_count || 1), 0);
  const totalKm     = trips.reduce((s, t) => s + (t.distance_km || 0), 0);

  // Drivers currently assigned from the fleet vehicle record.
  const assignedDrivers = db.prepare(`
    SELECT dp.id, dp.driver_name, dp.phone, dp.branch, dp.status, dp.email
    FROM fleet_vehicles fv
    JOIN driver_profiles dp
      ON dp.phone IN (fv.driver_phone, fv.backup_driver_phone)
      OR dp.driver_name IN (fv.driver_name, fv.backup_driver_name)
    WHERE fv.plate_number=?
  `).all(plate) as {id:number;driver_name:string;phone:string|null;branch:string;status:string;email:string|null}[];

  // Driver history — computed from already-filtered trips (respects date range)
  const driverTripMap = new Map<string, {trip_count:number; last_date:string}>();
  for (const t of trips) {
    if (!t.driver_name) continue;
    const key = t.driver_name.trim();
    const iso = isoOf(t.date);
    const cur = driverTripMap.get(key);
    if (!cur) { driverTripMap.set(key, { trip_count: 1, last_date: iso }); }
    else { cur.trip_count++; if (iso > cur.last_date) cur.last_date = iso; }
  }
  const tripsDriverHistory = [...driverTripMap.entries()]
    .map(([driver_name, v]) => ({ driver_name, ...v }))
    .sort((a, b) => b.trip_count - a.trip_count);

  // Merge: start with trip history, add any assigned drivers not in trips
  const driverHistoryMap = new Map<string, {driver_name:string;trip_count:number;last_date:string}>();
  for (const d of tripsDriverHistory) {
    driverHistoryMap.set(d.driver_name.trim(), d);
  }
  for (const ad of assignedDrivers) {
    const key = ad.driver_name.trim();
    if (!driverHistoryMap.has(key)) {
      driverHistoryMap.set(key, { driver_name: ad.driver_name, trip_count: 0, last_date: "" });
    }
  }
  const driverHistory = [...driverHistoryMap.values()]
    .sort((a, b) => b.trip_count - a.trip_count || b.last_date.localeCompare(a.last_date));

  // Also from workflow_orders
  const orderDrivers: {driver_name:string;count:number;last_date:string}[] = db.prepare(`
    SELECT driver_name, COUNT(*) as count, MAX(created_at) as last_date
    FROM workflow_orders WHERE vehicle_plate=? AND driver_name IS NOT NULL
    GROUP BY driver_name ORDER BY last_date DESC
  `).all(plate) as {driver_name:string;count:number;last_date:string}[];

  // Spare parts by source (from workshop_jobs) — filter by date range
  const workshopJobs = db.prepare(`
    SELECT wj.*, br.breakdown_type, br.driver_name as bd_driver
    FROM workshop_jobs wj
    LEFT JOIN breakdown_reports br ON wj.breakdown_report_id=br.id
    WHERE wj.vehicle_plate=? AND wj.created_at BETWEEN ? AND ?
    ORDER BY wj.created_at DESC LIMIT 100
  `).all(plate, sqlDf, sqlDt) as Record<string,unknown>[];

  // Fleet expenses — non-ISO dates, filter in JS; alias expense_category→expense_type for frontend
  const allFleetExpenses = db.prepare("SELECT id, expense_category as expense_type, amount, date, description FROM fleet_expenses WHERE car_id=? ORDER BY date DESC LIMIT 200").all(plate) as {expense_type:string;amount:number;date:string;description:string}[];
  const fleetExpenses = allFleetExpenses.filter(e => inRange(e.date));

  // Costs grouped by source
  const warehouseCost  = (workshopJobs.filter(j => j.invoice_target === "inventory") as {total_cost:number}[]).reduce((s, j) => s + (j.total_cost||0), 0);
  const vehicleCost    = (workshopJobs.filter(j => j.invoice_target !== "inventory") as {total_cost:number}[]).reduce((s, j) => s + (j.total_cost||0), 0);
  const directExpenses = fleetExpenses.reduce((s, e) => s + (e.amount||0), 0);

  // Compliance documents
  const complianceDocs = db.prepare("SELECT * FROM vehicle_compliance_docs WHERE car_number=? ORDER BY doc_type").all(plate) as Record<string,unknown>[];

  // Breakdowns (new table)
  const breakdowns = db.prepare("SELECT * FROM vehicle_breakdowns WHERE car_number=? ORDER BY created_at DESC LIMIT 50").all(plate) as Record<string,unknown>[];

  // Legacy breakdowns
  const legacyBreakdowns = db.prepare("SELECT * FROM breakdown_reports WHERE vehicle_plate=? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 50").all(plate, sqlDf, sqlDt) as Record<string,unknown>[];

  // Workflow orders count
  const orderStats = db.prepare(`
    SELECT COUNT(*) as total, SUM(CASE WHEN stage='delivered' THEN 1 ELSE 0 END) as delivered
    FROM workflow_orders WHERE vehicle_plate=?
  `).get(plate) as {total:number;delivered:number};

  // Purchase invoices (supplier invoices) for this vehicle
  const purchaseInvoices = db.prepare(`
    SELECT id, serial_no, invoice_date, invoice_number, supplier_name,
           item_name, price_before_vat, quantity, price_after_vat, notes, imported_by, created_at
    FROM purchase_invoices WHERE vehicle_plate=?
      AND (work_on IS NULL OR work_on='' OR work_on='vehicle')
    AND COALESCE(invoice_date, created_at) BETWEEN ? AND ?
    ORDER BY invoice_date DESC, created_at DESC LIMIT 200
  `).all(plate, sqlDf, sqlDt) as Record<string,unknown>[];

  // Maintenance logs — maintenance_date stored as M/D/YY; load all for plate, filter in JS
  const allMaintenanceLogs = db.prepare(`
    SELECT id, card_number, maintenance_date, entry_time, exit_time, exit_date,
           driver_name, branch, maintenance_type, description, amount, created_at,
           trailer_number
    FROM maintenance_logs WHERE vehicle_plate=?
      AND COALESCE(vehicle_choice,'vehicle') != 'trailer'
    ORDER BY id DESC LIMIT 500
  `).all(plate) as Record<string,unknown>[];
  const maintenanceLogs = (!from && !to) ? allMaintenanceLogs : allMaintenanceLogs.filter(m => {
    const iso = mlDateToISO(String(m.maintenance_date ?? ""));
    if (!iso) return true;
    return (!from || iso >= from) && (!to || iso <= to);
  });

  // Common fault types (merged from breakdown_reports + maintenance_logs)
  const faultsFromBD = db.prepare(`
    SELECT breakdown_type as fault_type, COUNT(*) as cnt
    FROM breakdown_reports WHERE vehicle_plate=? AND breakdown_type IS NOT NULL AND breakdown_type!=''
    AND created_at BETWEEN ? AND ?
    GROUP BY breakdown_type
  `).all(plate, sqlDf, sqlDt) as {fault_type:string; cnt:number}[];
  // faultsFromML derived from already-JS-filtered maintenanceLogs (avoids broken SQL date compare)
  const faultMlMap: Record<string,number> = {};
  for (const m of maintenanceLogs) {
    const ft = String(m.maintenance_type ?? "").trim();
    if (ft) faultMlMap[ft] = (faultMlMap[ft] || 0) + 1;
  }
  const faultsFromML = Object.entries(faultMlMap).map(([fault_type, cnt]) => ({ fault_type, cnt }));
  const faultMap: Record<string,number> = {};
  for (const f of [...faultsFromBD, ...faultsFromML]) {
    faultMap[f.fault_type] = (faultMap[f.fault_type] || 0) + (f.cnt || 0);
  }
  const commonFaults = Object.entries(faultMap)
    .map(([fault_type, count]) => ({ fault_type, count }))
    .sort((a, b) => b.count - a.count).slice(0, 6);

  // Workshop visits = jobs count + maintenance_log entries
  const workshopVisits = workshopJobs.length + maintenanceLogs.length;

  // Total purchase cost from supplier invoices
  const totalPurchaseCost = (purchaseInvoices as {price_after_vat:number; quantity:number}[])
    .reduce((s, p) => s + ((p.price_after_vat || 0) * (p.quantity || 1)), 0);

  // Total maintenance logs cost
  const maintenanceLogsCost = (maintenanceLogs as {amount:number}[])
    .reduce((s, m) => s + (m.amount || 0), 0);

  // External rentals revenue for this vehicle
  const rentalRows = db.prepare(`
    SELECT id, customer_name, vehicle_type, total_price, driver_bonus,
           driver_phone, status, assigned_at, created_at
    FROM external_rentals WHERE assigned_vehicle=? AND status='confirmed'
    ORDER BY assigned_at DESC
  `).all(plate) as {id:number;customer_name:string;vehicle_type:string;total_price:number;driver_bonus:number;driver_phone:string;status:string;assigned_at:string;created_at:string}[];
  const totalRentalRevenue = rentalRows.reduce((s, r) => s + (r.total_price || 0), 0);
  const totalRentalDriverBonus = rentalRows.reduce((s, r) => s + (r.driver_bonus || 0), 0);

  // Trip-based revenue
  const totalTripRevenue = trips.reduce((s, t) => s + (t.net_amount || 0), 0);

  res.json({
    vehicle,
    trips,
    totalTrips,
    totalKm: parseFloat(totalKm.toFixed(1)),
    assignedDrivers,
    driverHistory,
    orderDrivers,
    workshopJobs,
    fleetExpenses: fleetExpenses.slice(0, 50),
    complianceDocs,
    breakdowns,
    legacyBreakdowns,
    orderStats,
    purchaseInvoices,
    maintenanceLogs,
    commonFaults,
    workshopVisits,
    totalPurchaseCost,
    rentalRows,
    totalRentalRevenue,
    totalRentalDriverBonus,
    totalTripRevenue,
    costSummary: {
      warehouse: warehouseCost,
      vehicle: vehicleCost,
      direct: directExpenses,
      purchases: totalPurchaseCost,
      maintenance: maintenanceLogsCost,
      total: vehicleCost + directExpenses + totalPurchaseCost + maintenanceLogsCost,
    },
  });
});

// All fleet vehicles (for admin dropdown)
router.get("/fleet-vehicles-list", (_req, res) => {
  const rows = db.prepare(`
    SELECT fv.id, fv.plate_number, fv.vehicle_type, fv.status, fv.gps_device_id,
           fv.entity, fv.branch, fv.show_cargo_photo, fv.backup_driver_name, fv.backup_driver_phone,
           fv.linked_trailer_number, fv.linked_trailer_type, fv.linked_trailer_default,
           fv.linked_teidara_id, fv.linked_teidara_ids,
           fv.driver_name AS driver_name,
           fv.driver_phone AS driver_phone,
           (SELECT wo.order_number || ' — ' || COALESCE(wo.customer_name, wo.customer_phone, '') || ' ← ' || COALESCE(wo.delivery_location, '')
            FROM workflow_orders wo
            WHERE wo.vehicle_plate = fv.plate_number
              AND wo.stage IN ('vehicle_assigned','invoiced','loaded')
            ORDER BY wo.created_at DESC LIMIT 1) AS order_label,
           (SELECT 'توريد: ' || sr.product_name || ' (' || COALESCE(sr.warehouse_name, '') || ')'
            FROM supply_requests sr
            WHERE sr.vehicle_plate = fv.plate_number
              AND sr.status NOT IN ('delivered','cancelled')
            ORDER BY sr.created_at DESC LIMIT 1) AS supply_label,
           (SELECT rr.request_no || ' — ' || COALESCE(rr.rep_name, '') || ' ← ' || COALESCE(rr.delivery_location, '')
            FROM rep_requests rr
            WHERE rr.vehicle_plate = fv.plate_number
              AND rr.status NOT IN ('delivered','cancelled')
            ORDER BY rr.created_at DESC LIMIT 1) AS rep_label
    FROM fleet_vehicles fv
    ORDER BY fv.plate_number
  `).all();
  res.json(rows);
});

// PUT /api/fleet-vehicles/:plate/trailer-link — link/unlink a trailer to a vehicle
router.put("/fleet-vehicles/:plate/trailer-link", (req, res) => {
  res.status(410).json({ error: "يتم ربط التيدارات من صفحة سيارات الشركة كاملة فقط" });
});

router.get("/drivers-list", (_req, res) => {
  const rows = db.prepare(
    "SELECT id, name, phone, vehicle_plate FROM users WHERE role='driver' AND active=1 ORDER BY name"
  ).all();
  res.json(rows);
});

// ── Fleet Rankings (أقل/أكثر أعطال، مصاريف، إيراد) ──────────────────────────
router.get("/fleet-rankings", (req, res) => {
  const { from = "", to = "", plates: platesParam = "", trailers: trailersParam = "",
    asset_filter = "", vtype = "", branch = "" } = req.query as Record<string, string>;
  const df = from || "0000-01-01";
  const dt = to   || "9999-12-31";

  // All registered plates (with vehicle_type + branch for filtering)
  const allVehicles = db.prepare(`
    SELECT plate_number, vehicle_type, branch, linked_teidara_id, linked_teidara_ids, linked_trailer_number
    FROM fleet_vehicles
  `).all() as {
    plate_number:string;vehicle_type:string|null;branch:string|null;
    linked_teidara_id?:number|null;linked_teidara_ids?:string|null;linked_trailer_number?:string|null;
  }[];

  // Resolve effective plates after branch + vtype + explicit plate filters
  let plates = allVehicles.map(v => v.plate_number);
  if (branch) plates = plates.filter(p => (allVehicles.find(v => v.plate_number === p)?.branch || "النقليات") === branch);
  if (vtype)  plates = plates.filter(p => (allVehicles.find(v => v.plate_number === p)?.vehicle_type || "") === vtype);
  if (platesParam) {
    const sel = platesParam.split(",").filter(Boolean);
    plates = plates.filter(p => sel.includes(p));
  }

  const trailerRows = db.prepare(`
    SELECT MIN(id) AS id, TRIM(teidara_number) AS trailer_number
    FROM teidarat
    WHERE TRIM(COALESCE(teidara_number,'')) <> ''
    GROUP BY TRIM(teidara_number)
    ORDER BY trailer_number
  `).all() as {id:number;trailer_number:string}[];
  const teidaraIdRows = db.prepare(`
    SELECT id, TRIM(teidara_number) AS trailer_number
    FROM teidarat
    WHERE TRIM(COALESCE(teidara_number,'')) <> ''
  `).all() as {id:number;trailer_number:string}[];
  const trailerNumberById = new Map(teidaraIdRows.map(row => [row.id, row.trailer_number]));
  const ownerByTrailer = new Map<string, typeof allVehicles[number]>();
  for (const vehicle of allVehicles) {
    const linkedIds = [
      ...parseTeidaraIds(vehicle.linked_teidara_ids),
      ...(vehicle.linked_teidara_id ? [Number(vehicle.linked_teidara_id)] : []),
    ];
    for (const id of linkedIds) {
      const number = trailerNumberById.get(id);
      if (number && !ownerByTrailer.has(number)) ownerByTrailer.set(number, vehicle);
    }
    const primaryNumber = String(vehicle.linked_trailer_number || "").trim();
    if (primaryNumber && !ownerByTrailer.has(primaryNumber)) ownerByTrailer.set(primaryNumber, vehicle);
  }
  const legacyTrailerOwners = db.prepare(`
    SELECT TRIM(teidara_number) AS trailer_number, vehicle_plate
    FROM teidarat
    WHERE TRIM(COALESCE(teidara_number,'')) <> ''
      AND TRIM(COALESCE(vehicle_plate,'')) <> ''
  `).all() as {trailer_number:string;vehicle_plate:string}[];
  for (const link of legacyTrailerOwners) {
    const owner = allVehicles.find(vehicle => vehicle.plate_number === link.vehicle_plate);
    if (owner && !ownerByTrailer.has(link.trailer_number)) ownerByTrailer.set(link.trailer_number, owner);
  }
  let trailerNumbers = trailerRows.map(t => t.trailer_number);
  if (branch) trailerNumbers = trailerNumbers.filter(number => (ownerByTrailer.get(number)?.branch || "النقليات") === branch);
  if (vtype) trailerNumbers = trailerNumbers.filter(number => (ownerByTrailer.get(number)?.vehicle_type || "") === vtype);
  if (asset_filter === "1") {
    const selectedTrailers = new Set(trailersParam.split(",").map(value => value.trim()).filter(Boolean));
    const selectedPlates = new Set(platesParam.split(",").map(value => value.trim()).filter(Boolean));
    trailerNumbers = trailerNumbers.filter(number => selectedTrailers.has(number));
    plates = plates.filter(plate => selectedPlates.has(plate));
  }

  // Helper: parameterized IN clause for a column
  const queryPlates = plates.length ? plates : [""];
  const inQ  = (col: string) => `AND ${col} IN (${queryPlates.map(() => "?").join(",")})`;
  const pt   = queryPlates; // alias for spreading

  // ── Breakdowns per plate ─────────────────────────────────────────────────
  const bdRows = db.prepare(`
    SELECT vehicle_plate, COUNT(*) as cnt FROM breakdown_reports
    WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
      AND created_at BETWEEN ? AND ? ${inQ("vehicle_plate")}
    GROUP BY vehicle_plate
  `).all(df, dt + " 23:59:59", ...pt) as {vehicle_plate:string; cnt:number}[];

  // maintenance_logs: load all rows for relevant plates; filter in JS (maintenance_date = M/D/YY)
  const mlAllRows = (() => {
    try {
      return db.prepare(`
        SELECT vehicle_plate, maintenance_date, COALESCE(amount,0) as amount
        FROM maintenance_logs
        WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
          AND COALESCE(vehicle_choice,'vehicle') != 'trailer'
          ${inQ("vehicle_plate")}
      `).all(...pt) as {vehicle_plate:string; maintenance_date:string; amount:number}[];
    } catch { return []; }
  })();
  const mlFiltered = (!from && !to) ? mlAllRows : mlAllRows.filter(r => {
    const iso = mlDateToISO(String(r.maintenance_date ?? ""));
    if (!iso) return true;
    return (!from || iso >= from) && (!to || iso <= to);
  });

  const bdMap: Record<string,number> = {};
  for (const p of plates) bdMap[p] = 0;
  for (const r of bdRows) {
    if (r.vehicle_plate in bdMap) bdMap[r.vehicle_plate] = (bdMap[r.vehicle_plate] || 0) + r.cnt;
  }
  for (const r of mlFiltered) {
    if (r.vehicle_plate in bdMap) bdMap[r.vehicle_plate] = (bdMap[r.vehicle_plate] || 0) + 1;
  }

  // ── Expenses per plate ───────────────────────────────────────────────────
  // mlCostRows derived from already JS-filtered mlFiltered
  const mlCostRows = mlFiltered.map(r => ({ vehicle_plate: r.vehicle_plate, total: r.amount }));
  const wjCostRows = db.prepare(`
    SELECT vehicle_plate, SUM(total_cost) as total FROM workshop_jobs
    WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
      AND created_at BETWEEN ? AND ? ${inQ("vehicle_plate")}
    GROUP BY vehicle_plate
  `).all(df, dt + " 23:59:59", ...pt) as {vehicle_plate:string; total:number}[];
  const prCostRows = db.prepare(`
    SELECT vehicle_plate, SUM(price_after_vat * quantity) as total
    FROM purchase_invoices
    WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
      AND (work_on IS NULL OR work_on='' OR work_on='vehicle')
      AND COALESCE(invoice_date, created_at) BETWEEN ? AND ? ${inQ("vehicle_plate")}
    GROUP BY vehicle_plate
  `).all(df, dt, ...pt) as {vehicle_plate:string; total:number}[];
  const feCostRows = db.prepare(`
    SELECT car_id as vehicle_plate, SUM(amount) as total FROM fleet_expenses
    WHERE car_id IS NOT NULL AND car_id != ''
      AND date BETWEEN ? AND ? ${inQ("car_id")}
    GROUP BY car_id
  `).all(df, dt, ...pt) as {vehicle_plate:string; total:number}[];
  const expMap: Record<string,number> = {};
  for (const p of plates) expMap[p] = 0;
  for (const r of [...mlCostRows, ...wjCostRows, ...prCostRows, ...feCostRows]) {
    if (r.vehicle_plate in expMap) expMap[r.vehicle_plate] = (expMap[r.vehicle_plate] || 0) + (r.total || 0);
  }

  // ── Orders/trips count per plate — combines workflow_orders + trips ──────
  // workflow_orders: plate may be stored without Arabic suffix (e.g. '1909' vs '1909 أ ب ت')
  //   → fetch all, match in JS with flexible prefix comparison
  // trips: car_id matches fleet plate; date filter applied in JS (like revenue)
  const woOrdAllRows = db.prepare(`
    SELECT vehicle_plate, created_at as date
    FROM workflow_orders
    WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
      AND created_at BETWEEN ? AND ?`
  ).all(df, dt + " 23:59:59") as {vehicle_plate:string; date:string}[];

  const allTripOrdRows = db.prepare(
    `SELECT car_id as vehicle_plate, date FROM trips WHERE car_id IS NOT NULL AND car_id != '' ${inQ("car_id")}`
  ).all(...pt) as {vehicle_plate:string; date:string|null}[];

  // Build plate normalizer: numeric prefix only (strip trailing Arabic letters/spaces)
  const plateBase = (p: string) => p.trim().replace(/[\u0600-\u06FF\s]+$/, "").trim();
  // Build reverse map: base → fleet plate
  const baseToFleet = new Map<string, string>();
  for (const p of plates) baseToFleet.set(plateBase(p), p);

  const ordMap: Record<string,number> = {};
  for (const p of plates) ordMap[p] = 0;

  // ── Revenue per plate ────────────────────────────────────────────────────
  const orderRevRows = db.prepare(`
    SELECT vehicle_plate, SUM(total_with_vat) as total FROM workflow_orders
    WHERE vehicle_plate IS NOT NULL AND vehicle_plate != '' AND stage='delivered'
      AND created_at BETWEEN ? AND ? ${inQ("vehicle_plate")}
    GROUP BY vehicle_plate
  `).all(df, dt + " 23:59:59", ...pt) as {vehicle_plate:string; total:number}[];
  // trips.date stored as long English format — filter in JS
  const isoOfT = (d: unknown): string => { const p = new Date(String(d||"")); return isNaN(p.getTime())?"":p.toISOString().slice(0,10); };
  const inTR   = (d: unknown): boolean => { if (!from&&!to) return true; const iso=isoOfT(d); if(!iso) return true; return (!from||iso>=from)&&(!to||iso<=to); };
  const allTripRevRows = db.prepare(
    `SELECT car_id as vehicle_plate, net_amount, date FROM trips WHERE car_id IS NOT NULL AND car_id != ''`
  ).all() as {vehicle_plate:string; net_amount:number|null; date:string|null}[];
  const plateSetRev = new Set(plates);
  const tripsRevByPlate: Record<string,number> = {};
  for (const t of allTripRevRows) {
    if (!inTR(t.date)) continue;
    if (plateSetRev.has(t.vehicle_plate)) {
      tripsRevByPlate[t.vehicle_plate] = (tripsRevByPlate[t.vehicle_plate]||0) + (t.net_amount||0);
    }
  }

  // ── Populate ordMap: trips (car_id) + workflow_orders (vehicle_plate) ────
  // Trips: date stored in long English format → use same inTR helper as revenue
  for (const t of allTripOrdRows) {
    if (!inTR(t.date)) continue;
    if (t.vehicle_plate in ordMap) ordMap[t.vehicle_plate] = (ordMap[t.vehicle_plate] || 0) + 1;
  }
  // Workflow orders: match plate flexibly (exact → base-prefix fallback)
  for (const r of woOrdAllRows) {
    const fleetPlate = (r.vehicle_plate in ordMap)
      ? r.vehicle_plate
      : baseToFleet.get(plateBase(r.vehicle_plate)) ?? null;
    if (fleetPlate !== null && fleetPlate in ordMap) {
      ordMap[fleetPlate] = (ordMap[fleetPlate] || 0) + 1;
    }
  }

  const revMap: Record<string,number> = {};
  for (const p of plates) revMap[p] = 0;
  for (const r of orderRevRows) {
    if (r.vehicle_plate in revMap) revMap[r.vehicle_plate] = (revMap[r.vehicle_plate] || 0) + (r.total || 0);
  }
  for (const [vp, total] of Object.entries(tripsRevByPlate)) {
    if (vp in revMap) revMap[vp] = (revMap[vp] || 0) + total;
  }

  // ── Teidarat use the trip/maintenance/invoice snapshot, never the current
  // fleet link, so changing a permanent link cannot rewrite historical totals.
  const trailerMaintenanceRows = (() => {
    try {
      const rows = db.prepare(`
        SELECT trailer_number, maintenance_date, COALESCE(amount,0) AS amount
        FROM maintenance_logs
        WHERE vehicle_choice='trailer' AND TRIM(COALESCE(trailer_number,'')) <> ''
      `).all() as {trailer_number:string;maintenance_date:string;amount:number}[];
      return (!from && !to) ? rows : rows.filter(row => {
        const iso = mlDateToISO(String(row.maintenance_date ?? ""));
        if (!iso) return true;
        return (!from || iso >= from) && (!to || iso <= to);
      });
    } catch { return []; }
  })();
  const trailerBreakdownMap: Record<string,number> = {};
  const trailerMaintenanceCostMap: Record<string,number> = {};
  for (const number of trailerNumbers) {
    trailerBreakdownMap[number] = 0;
    trailerMaintenanceCostMap[number] = 0;
  }
  for (const row of trailerMaintenanceRows) {
    const number = String(row.trailer_number || "").trim();
    if (!(number in trailerBreakdownMap)) continue;
    trailerBreakdownMap[number]++;
    trailerMaintenanceCostMap[number] += Number(row.amount) || 0;
  }

  const trailerPurchaseRows = db.prepare(`
    SELECT trailer_number, SUM(COALESCE(price_after_vat,0) * COALESCE(quantity,1)) AS total
    FROM purchase_invoices
    WHERE work_on='trailer' AND TRIM(COALESCE(trailer_number,'')) <> ''
      AND date(COALESCE(invoice_date, created_at)) BETWEEN ? AND ?
    GROUP BY trailer_number
  `).all(df, dt) as {trailer_number:string;total:number}[];
  const trailerExpenseMap: Record<string,number> = {};
  for (const number of trailerNumbers) {
    trailerExpenseMap[number] = trailerMaintenanceCostMap[number] || 0;
  }
  for (const row of trailerPurchaseRows) {
    const number = String(row.trailer_number || "").trim();
    if (number in trailerExpenseMap)
      trailerExpenseMap[number] += Number(row.total) || 0;
  }

  const trailerRevenueMap: Record<string,number> = {};
  const trailerOrderMap: Record<string,number> = {};
  for (const number of trailerNumbers) {
    trailerRevenueMap[number] = 0;
    trailerOrderMap[number] = 0;
  }
  const trailerTrips = db.prepare(`
    SELECT trailer_number, date, COALESCE(net_amount,0) AS net_amount
    FROM trips
    WHERE TRIM(COALESCE(trailer_number,'')) <> ''
  `).all() as {trailer_number:string;date:string|null;net_amount:number}[];
  for (const trip of trailerTrips) {
    const number = String(trip.trailer_number || "").trim();
    if (!inTR(trip.date) || !(number in trailerRevenueMap)) continue;
    trailerRevenueMap[number] += Number(trip.net_amount) || 0;
    trailerOrderMap[number]++;
  }

  // ── Build sorted arrays ─────────────────────────────────────────────────
  const toArr = (map: Record<string,number>, asset_type: "vehicle" | "trailer") =>
    Object.entries(map).map(([plate, value]) => ({ plate, value, asset_type }));

  const sortDesc = (arr: {plate:string;value:number}[]) => [...arr].sort((a,b) => b.value - a.value);
  const sortAsc  = (arr: {plate:string;value:number}[]) => [...arr].sort((a,b) => a.value - b.value);

  const bdArr  = [...toArr(bdMap, "vehicle"), ...toArr(trailerBreakdownMap, "trailer")];
  const expArr = [...toArr(expMap, "vehicle"), ...toArr(trailerExpenseMap, "trailer")];
  const revArr = [...toArr(revMap, "vehicle"), ...toArr(trailerRevenueMap, "trailer")];
  const ordArr = [...toArr(ordMap, "vehicle"), ...toArr(trailerOrderMap, "trailer")];

  res.json({
    breakdowns: { most: sortDesc(bdArr),  least: sortAsc(bdArr).filter(v => v.value > 0) },
    expenses:   { most: sortDesc(expArr), least: sortAsc(expArr).filter(v => v.value > 0) },
    revenue:    { most: sortDesc(revArr), least: sortAsc(revArr).filter(v => v.value > 0) },
    orders:     { most: sortDesc(ordArr), least: sortAsc(ordArr).filter(v => v.value > 0) },
  });
});

// ══════════════════════════════════════════════════════════════════
// VEHICLE PLATE DETAIL — تفصيل مصادر المصاريف / الأعطال / الإيرادات
// ══════════════════════════════════════════════════════════════════
router.get("/vehicle-plate-detail", (req, res) => {
  const { plate = "", from = "", to = "", asset_type = "vehicle" } = req.query as Record<string, string>;
  if (!plate) return void res.status(400).json({ error: "plate required" });
  const df = from || "0000-01-01";
  const dt = to   || "9999-12-31";

  if (asset_type === "trailer") {
    const allMaintenance = db.prepare(`
      SELECT maintenance_date, maintenance_type AS type, COALESCE(amount,0) AS amount
      FROM maintenance_logs
      WHERE TRIM(COALESCE(trailer_number,''))=? AND vehicle_choice='trailer'
      ORDER BY id DESC
    `).all(plate) as {maintenance_date:string|null;type:string|null;amount:number}[];
    const maintenance = allMaintenance.filter(row => {
      if (!from && !to) return true;
      const iso = mlDateToISO(String(row.maintenance_date ?? ""));
      return !iso || ((!from || iso >= from) && (!to || iso <= to));
    });
    const mlTotal = maintenance.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const mlTypes = [...new Set(maintenance.map(row => row.type).filter(Boolean))].join(",");

    const purchaseRows = db.prepare(`
      SELECT invoice_date, created_at, item_name,
             COALESCE(price_after_vat,0) * COALESCE(quantity,1) AS total
      FROM purchase_invoices
      WHERE TRIM(COALESCE(trailer_number,''))=? AND work_on='trailer'
      ORDER BY COALESCE(invoice_date, created_at) DESC
    `).all(plate) as {invoice_date:string|null;created_at:string;item_name:string;total:number}[];
    const inRangeDate = (raw: string | null | undefined) => {
      if (!raw || (!from && !to)) return true;
      const parsed = new Date(raw);
      if (isNaN(parsed.getTime())) return true;
      const iso = parsed.toISOString().slice(0, 10);
      return (!from || iso >= from) && (!to || iso <= to);
    };
    const purchases = purchaseRows.filter(row => inRangeDate(row.invoice_date || row.created_at));
    const purchaseTotal = purchases.reduce((sum, row) => sum + (Number(row.total) || 0), 0);

    const allTrips = db.prepare(`
      SELECT date, COALESCE(net_amount,0) AS net_amount, driver_name
      FROM trips WHERE TRIM(COALESCE(trailer_number,''))=?
      ORDER BY date DESC
    `).all(plate) as {date:string;net_amount:number;driver_name:string|null}[];
    const trips = allTrips.filter(row => inRangeDate(row.date));
    const tripRevenue = trips.reduce((sum, row) => sum + (Number(row.net_amount) || 0), 0);
    const tripDrivers = new Set(trips.map(row => row.driver_name?.trim()).filter(Boolean));
    const mlEvents = maintenance.map(row => ({
      date: mlDateToISO(String(row.maintenance_date ?? "")) || row.maintenance_date || "",
      type: row.type || "صيانة",
      amount: Number(row.amount) || 0,
      src: "maintenance_logs",
    }));
    const expenses = [
      { key:"maintenance_logs", label:"سجل صيانة التيدر", tab:"overview", total:mlTotal, count:maintenance.length, notes:mlTypes || null },
      { key:"purchase_invoices", label:"فواتير التيدر", tab:"overview", total:purchaseTotal, count:purchases.length, notes:[...new Set(purchases.map(row => row.item_name).filter(Boolean))].join(",") || null },
    ];
    const revenue = [{
      key:"trips", label:"رحلات التيدر", tab:"history", total:tripRevenue,
      count:trips.length, notes:tripDrivers.size ? `${tripDrivers.size} سائق` : null,
    }];
    res.json({
      plate, asset_type, from, to,
      expenses: { total: mlTotal + purchaseTotal, sources: expenses },
      breakdowns: { total: maintenance.length, bd_events: [], ml_events: mlEvents },
      revenue: { total: tripRevenue, sources: revenue },
    });
    return;
  }

  // ── Expenses per source ─────────────────────────────────────────
  const mlCost = db.prepare(
    `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt,
            GROUP_CONCAT(DISTINCT maintenance_type) as types
     FROM maintenance_logs WHERE vehicle_plate=?
       AND COALESCE(vehicle_choice,'vehicle') != 'trailer'
       AND maintenance_date BETWEEN ? AND ?`
  ).get(plate, df, dt) as {total:number;cnt:number;types:string|null};

  const wjCost = db.prepare(
    `SELECT COALESCE(SUM(total_cost),0) as total, COUNT(*) as cnt
     FROM workshop_jobs WHERE vehicle_plate=? AND created_at BETWEEN ? AND ?`
  ).get(plate, df, dt + " 23:59:59") as {total:number;cnt:number};

  const piCost = db.prepare(
    `SELECT COALESCE(SUM(price_after_vat * quantity),0) as total, COUNT(*) as cnt,
            GROUP_CONCAT(DISTINCT item_name) as items
     FROM purchase_invoices WHERE vehicle_plate=?
       AND (work_on IS NULL OR work_on='' OR work_on='vehicle')
       AND COALESCE(invoice_date, created_at) BETWEEN ? AND ?`
  ).get(plate, df, dt) as {total:number;cnt:number;items:string|null};

  const feCost = db.prepare(
    `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt,
            GROUP_CONCAT(DISTINCT expense_category) as types
     FROM fleet_expenses WHERE car_id=? AND date BETWEEN ? AND ?`
  ).get(plate, df, dt) as {total:number;cnt:number;types:string|null};

  const expSources = [
    { key:"maintenance_logs",  label:"سجل الصيانة",      tab:"overview",    total: mlCost?.total||0,  count: mlCost?.cnt||0,  notes: mlCost?.types||null },
    { key:"workshop_jobs",     label:"أوامر الورشة",      tab:"overview",    total: wjCost?.total||0,  count: wjCost?.cnt||0,  notes: null },
    { key:"purchase_invoices", label:"فواتير المشتريات",  tab:"overview",    total: piCost?.total||0,  count: piCost?.cnt||0,  notes: piCost?.items||null },
    { key:"fleet_expenses",    label:"مصاريف الأسطول",    tab:"overview",    total: feCost?.total||0,  count: feCost?.cnt||0,  notes: feCost?.types||null },
  ];
  const expTotal = expSources.reduce((s,r)=>s+r.total, 0);

  // ── Breakdown events ────────────────────────────────────────────
  const bdEvents = db.prepare(
    `SELECT substr(created_at,1,10) as date, breakdown_type as type, 'breakdown_reports' as src
     FROM breakdown_reports WHERE vehicle_plate=? AND created_at BETWEEN ? AND ?
     ORDER BY created_at DESC LIMIT 20`
  ).all(plate, df, dt + " 23:59:59") as {date:string;type:string;src:string}[];

  // mlEvents — maintenance_date stored as M/D/YY; load all for plate and filter in JS
  const mlEvents = (db.prepare(
    `SELECT maintenance_date, maintenance_type as type, COALESCE(amount,0) as amount
     FROM maintenance_logs WHERE vehicle_plate=?
       AND COALESCE(vehicle_choice,'vehicle') != 'trailer'
     ORDER BY id DESC LIMIT 200`
  ).all(plate) as {maintenance_date:string;type:string;amount:number}[])
    .filter(e => {
      const iso = mlDateToISO(String(e.maintenance_date ?? ""));
      if (!iso) return true;
      return (!from || iso >= from) && (!to || iso <= to);
    })
    .slice(0, 20)
    .map(e => ({ date: mlDateToISO(String(e.maintenance_date ?? "")) || e.maintenance_date, type: e.type, amount: e.amount, src: "maintenance_logs" }));

  const bdTotal = bdEvents.length + mlEvents.length;

  // ── Revenue per source ──────────────────────────────────────────
  const trRev = db.prepare(
    `SELECT COALESCE(SUM(net_amount),0) as total, COUNT(*) as cnt,
            COUNT(DISTINCT driver_name) as drivers
     FROM trips WHERE car_id=? AND date BETWEEN ? AND ?`
  ).get(plate, df, dt) as {total:number;cnt:number;drivers:number};

  const woRev = db.prepare(
    `SELECT COALESCE(SUM(total_with_vat),0) as total, COUNT(*) as cnt
     FROM workflow_orders WHERE vehicle_plate=? AND stage='delivered'
       AND created_at BETWEEN ? AND ?`
  ).get(plate, df, dt + " 23:59:59") as {total:number;cnt:number};

  const revSources = [
    { key:"trips",           label:"رحلات النقل",    tab:"history",     total: trRev?.total||0, count: trRev?.cnt||0,  notes: trRev?.drivers ? `${trRev.drivers} سائق` : null },
    { key:"workflow_orders", label:"أوامر الشحن",    tab:"overview",    total: woRev?.total||0, count: woRev?.cnt||0,  notes: null },
  ];
  const revTotal = revSources.reduce((s,r)=>s+r.total, 0);

  res.json({
    plate, from, to,
    expenses:   { total: expTotal, sources: expSources },
    breakdowns: { total: bdTotal, bd_events: bdEvents, ml_events: mlEvents },
    revenue:    { total: revTotal, sources: revSources },
  });
});

// Add a new vehicle
router.post("/fleet-vehicles", (req, res) => {
  const { plate_number, vehicle_type, driver_name, status, notes, gps_device_id, branch } = req.body;
  if (!plate_number?.trim()) return void res.status(400).json({ error: "رقم اللوحة مطلوب" });
  const branchName = String(branch || "").trim();
  if (!branchName) return void res.status(400).json({ error: "اختيار فرع السيارة مطلوب" });
  const companyBranch = db.prepare(
    "SELECT id FROM company_settings WHERE active=1 AND LOWER(TRIM(entity_name))=LOWER(?)"
  ).get(branchName);
  if (!companyBranch) return void res.status(400).json({ error: "الفرع المختار غير موجود ضمن فروع الشركة" });
  try {
    const r = db.prepare(
      "INSERT INTO fleet_vehicles (plate_number,vehicle_type,driver_name,status,notes,gps_device_id,branch) VALUES (?,?,?,?,?,?,?)"
    ).run(plate_number.trim(), vehicle_type||null, driver_name||null, status||"available", notes||null, gps_device_id||null, branchName);
    res.status(201).json({ id: r.lastInsertRowid, message: "تم إضافة السيارة" });
  } catch {
    res.status(409).json({ error: "رقم اللوحة مسجّل مسبقاً" });
  }
});

// Update GPS device ID for a vehicle
router.put("/fleet-vehicles/:plate/gps", (req, res) => {
  const { gps_device_id } = req.body;
  const existing = db.prepare("SELECT id FROM fleet_vehicles WHERE plate_number=?").get(req.params.plate);
  if (!existing) return void res.status(404).json({ error: "السيارة غير موجودة" });
  db.prepare("UPDATE fleet_vehicles SET gps_device_id=? WHERE plate_number=?")
    .run(gps_device_id || null, req.params.plate);
  res.json({ message: "تم تحديث معرّف GPS" });
});

router.put("/fleet-vehicles/:plate/branch", (req, res) => {
  const { branch } = req.body;
  const existing = db.prepare("SELECT id FROM fleet_vehicles WHERE plate_number=?").get(req.params.plate);
  if (!existing) return void res.status(404).json({ error: "السيارة غير موجودة" });
  const branchName = String(branch || "").trim();
  if (!branchName) return void res.status(400).json({ error: "اختيار فرع السيارة مطلوب" });
  const companyBranch = db.prepare(
    "SELECT id FROM company_settings WHERE active=1 AND LOWER(TRIM(entity_name))=LOWER(?)"
  ).get(branchName);
  if (!companyBranch) return void res.status(400).json({ error: "الفرع المختار غير موجود ضمن فروع الشركة" });
  db.prepare("UPDATE fleet_vehicles SET branch=? WHERE plate_number=?")
    .run(branchName, req.params.plate);
  res.json({ message: "تم تحديث الجهة" });
});

router.put("/fleet-vehicles/:plate/cargo-photo-visibility", (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  const caller = token && !isSysAdminToken(token)
    ? db.prepare(`SELECT u.role, u.permissions FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
        ORDER BY s.rowid DESC LIMIT 1`).get(token) as { role: string; permissions: string | null } | undefined
    : undefined;
  const permissions = (() => {
    try { return JSON.parse(caller?.permissions || "[]"); } catch { return []; }
  })();
  if (!token || (!isSysAdminToken(token) && caller?.role !== "admin" &&
      !(Array.isArray(permissions) && permissions.includes("fleet_transportation")) &&
      caller?.role !== "supervisor")) {
    return void res.status(403).json({ error: "غير مسموح بتعديل إعداد السيارة" });
  }
  const plate = req.params.plate;
  const existing = db.prepare("SELECT id FROM fleet_vehicles WHERE plate_number=?").get(plate);
  if (!existing) return void res.status(404).json({ error: "السيارة غير موجودة" });
  if (typeof req.body?.visible !== "boolean") {
    return void res.status(400).json({ error: "قيمة إظهار بطاقة صورة الحمولة غير صالحة" });
  }
  db.prepare("UPDATE fleet_vehicles SET show_cargo_photo=? WHERE plate_number=?")
    .run(req.body.visible ? 1 : 0, plate);
  res.json({ plate_number: plate, show_cargo_photo: req.body.visible ? 1 : 0 });
});

// Summary of linked data before hard-delete
router.get("/fleet-vehicles/:plate/delete-summary", (req, res) => {
  const plate = req.params.plate;
  const docs      = (db.prepare("SELECT COUNT(*) AS c FROM vehicle_compliance_docs WHERE car_number=?").get(plate) as {c:number}).c;
  const images    = (db.prepare("SELECT COUNT(*) AS c FROM vehicle_images WHERE car_number=?").get(plate) as {c:number}).c;
  const breaks    = (db.prepare("SELECT COUNT(*) AS c FROM vehicle_breakdowns WHERE plate_number=?").get(plate) as {c:number}).c;
  const trips     = (db.prepare("SELECT COUNT(*) AS c FROM trips WHERE vehicle_plate=?").get(plate) as {c:number}).c;
  res.json({ docs, images, breaks, trips });
});

// Hard-delete a vehicle — removes from ALL related tables so it never comes back
router.delete("/fleet-vehicles/:plate", (req, res) => {
  const plate = req.params.plate;
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM fleet_vehicles            WHERE plate_number=?").run(plate);
      db.prepare("DELETE FROM bulker_vehicles           WHERE vehicle_plate=?").run(plate);
      db.prepare("DELETE FROM vehicle_compliance_docs   WHERE car_number=?").run(plate);
      db.prepare("DELETE FROM vehicle_images            WHERE plate_number=?").run(plate);
      try { db.prepare("DELETE FROM vehicle_type_assignments WHERE plate_number=?").run(plate); } catch {}
      // Note: breakdowns and trips are kept as historical records (plate becomes orphan reference)
    })();
    res.json({ message: "تم حذف السيارة نهائياً مع جميع وثائقها" });
  } catch (err) {
    res.status(500).json({ error: "فشل الحذف: " + String(err) });
  }
});

// ══════════════════════════════════════════════════════════════════
// KM RATES — أسعار الكيلومتر حسب نوع السيارة
// ══════════════════════════════════════════════════════════════════

router.get("/km-rates", (_req, res) => {
  res.json(db.prepare("SELECT * FROM km_rates ORDER BY vehicle_type").all());
});

router.put("/km-rates/:id", (req, res) => {
  const { rate_per_km, multiplier } = req.body;
  db.prepare("UPDATE km_rates SET rate_per_km=?,multiplier=?,updated_at=datetime('now') WHERE id=?")
    .run(parseFloat(rate_per_km)||0, parseFloat(multiplier)||1, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.post("/km-rates/calculate", (req, res) => {
  const { vehicle_type, distance_km } = req.body;
  if (!vehicle_type || !distance_km) return void res.status(400).json({ error: "نوع السيارة والمسافة مطلوبان" });
  const rate = db.prepare("SELECT * FROM km_rates WHERE vehicle_type=?").get(vehicle_type) as Record<string,unknown>|undefined;
  if (!rate) return void res.status(404).json({ error: "نوع السيارة غير موجود" });
  const km = parseFloat(String(distance_km));
  const ratePerKm = rate.rate_per_km as number;
  const mult = rate.multiplier as number;
  const total = km * mult * ratePerKm;
  res.json({ vehicle_type, distance_km: km, rate_per_km: ratePerKm, multiplier: mult, total: parseFloat(total.toFixed(2)) });
});

// ══════════════════════════════════════════════════════════════════
// VEHICLE DETAILS — PATCH compliance columns directly on fleet_vehicles
// ══════════════════════════════════════════════════════════════════

router.put("/fleet-vehicles/:plate/compliance", upload.fields([
  { name: "insurance_image", maxCount: 1 },
  { name: "inspection_image", maxCount: 1 },
  { name: "operation_card_image", maxCount: 1 },
]), (req, res) => {
  const { insurance_start, insurance_end, inspection_start, inspection_end, operation_card_start, operation_card_end } = req.body;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const ins_img  = files?.insurance_image?.[0]  ? `/api/uploads/${files.insurance_image[0].filename}`  : null;
  const ins2_img = files?.inspection_image?.[0] ? `/api/uploads/${files.inspection_image[0].filename}` : null;
  const op_img   = files?.operation_card_image?.[0] ? `/api/uploads/${files.operation_card_image[0].filename}` : null;

  const existing = db.prepare("SELECT * FROM fleet_vehicles WHERE plate_number=?").get(req.params.plate) as Record<string,unknown>|undefined;
  if (!existing) return void res.status(404).json({ error: "السيارة غير موجودة" });

  db.prepare(`UPDATE fleet_vehicles SET
    insurance_start=COALESCE(?,insurance_start), insurance_end=COALESCE(?,insurance_end),
    insurance_image=COALESCE(?,insurance_image),
    inspection_start=COALESCE(?,inspection_start), inspection_end=COALESCE(?,inspection_end),
    inspection_image=COALESCE(?,inspection_image),
    operation_card_start=COALESCE(?,operation_card_start), operation_card_end=COALESCE(?,operation_card_end),
    operation_card_image=COALESCE(?,operation_card_image)
    WHERE plate_number=?`).run(
    insurance_start||null, insurance_end||null, ins_img,
    inspection_start||null, inspection_end||null, ins2_img,
    operation_card_start||null, operation_card_end||null, op_img,
    req.params.plate
  );
  res.json({ message: "تم تحديث الوثائق" });
});

router.delete("/fleet-vehicles/:plate/attachments/:field", async (req, res): Promise<void> => {
  const plate = Array.isArray(req.params.plate) ? req.params.plate[0] : req.params.plate;
  const field = Array.isArray(req.params.field) ? req.params.field[0] : req.params.field;
  if (!plate || !field || !/(?:_url|_image|_pdf)$/i.test(field)) {
    res.status(400).json({ error: "بيانات المرفق غير صالحة" });
    return;
  }

  const attachmentFields = (db.prepare("PRAGMA table_info(fleet_vehicles)").all() as { name: string }[])
    .map(column => column.name)
    .filter(name => /(?:_url|_image|_pdf)$/i.test(name));
  if (!attachmentFields.includes(field)) {
    res.status(404).json({ error: "المرفق غير موجود" });
    return;
  }

  const selectedColumns = attachmentFields.map(quoteVehicleColumn).join(", ");
  const vehicle = db.prepare(
    `SELECT ${selectedColumns} FROM fleet_vehicles WHERE plate_number=?`,
  ).get(plate) as Record<string, unknown> | undefined;
  if (!vehicle) {
    res.status(404).json({ error: "السيارة غير موجودة" });
    return;
  }

  const selectedUrl = vehicle[field];
  const identity = getVehicleAttachmentIdentity(selectedUrl);
  if (typeof selectedUrl === "string" && selectedUrl.trim() && !identity) {
    res.status(422).json({ error: "نوع تخزين هذا الملف لا يدعم الحذف من إدارة الأسطول" });
    return;
  }

  const fieldsToClear = identity
    ? attachmentFields.filter(name => getVehicleAttachmentIdentity(vehicle[name])?.key === identity.key)
    : [field];

  let removal: AttachmentRemovalResult;
  try {
    removal = await removeVehicleAttachmentIfExclusive(selectedUrl, fieldsToClear.length || 1);
  } catch (error) {
    if (error instanceof UnsupportedVehicleAttachmentError) {
      res.status(422).json({ error: "نوع تخزين هذا الملف لا يدعم الحذف من إدارة الأسطول" });
      return;
    }
    req.log.error({ err: error, plate, field }, "Could not remove fleet vehicle attachment");
    res.status(500).json({ error: "تعذر حذف الملف من التخزين؛ لم يتم حذف المرفق من السيارة" });
    return;
  }

  const assignments = fieldsToClear.map(name => `${quoteVehicleColumn(name)}=NULL`).join(", ");
  const updated = db.prepare(
    `UPDATE fleet_vehicles SET ${assignments} WHERE plate_number=?`,
  ).run(plate);
  if (!updated.changes) {
    res.status(404).json({ error: "السيارة غير موجودة" });
    return;
  }

  res.json({
    ok: true,
    ...removal,
    clearedFields: fieldsToClear,
  });
});

// ══════════════════════════════════════════════════════════════════
// VEHICLE DRIVER HISTORY — سجل السائقين المعينين على السيارة
// ══════════════════════════════════════════════════════════════════

router.get("/vehicle-driver-history/:plate", (req, res) => {
  const fromTrips = db.prepare(`
    SELECT driver_name, NULL as driver_phone, MIN(date) as assigned_at, MAX(date) as last_trip, COUNT(*) as trips_count
    FROM trips WHERE car_id=? AND driver_name IS NOT NULL AND driver_name != ''
    GROUP BY driver_name ORDER BY last_trip DESC
  `).all(req.params.plate);
  const fromOrders = db.prepare(`
    SELECT driver_name, driver_phone, MIN(created_at) as assigned_at, MAX(created_at) as last_trip, COUNT(*) as trips_count
    FROM workflow_orders WHERE vehicle_plate=? AND driver_name IS NOT NULL AND driver_name != ''
    GROUP BY driver_name ORDER BY last_trip DESC
  `).all(req.params.plate);
  res.json({ fromTrips, fromOrders });
});

// ══════════════════════════════════════════════════════════════════
// VEHICLE PARTS LOG — قطع الغيار على حساب السيارة
// ══════════════════════════════════════════════════════════════════

router.get("/vehicle-parts/:plate", (req, res) => {
  const plate = req.params.plate;
  const { from = "", to = "" } = req.query as Record<string, string>;
  const isoOf2 = (d: unknown): string => { const p = new Date(String(d || "")); return isNaN(p.getTime()) ? "" : p.toISOString().slice(0, 10); };
  const sqlDf2 = from || "0000-01-01";
  const sqlDt2 = to ? to + " 23:59:59" : "9999-12-31";

  const workshopParts = db.prepare(`
    SELECT wj.id, wj.title, wj.parts_used, wj.parts_cost, wj.total_cost,
           wj.invoice_target, wj.status, wj.created_at,
           wj.job_type, 'workshop' as source
    FROM workshop_jobs wj
    WHERE wj.vehicle_plate=? AND wj.invoice_target='vehicle'
    AND wj.created_at BETWEEN ? AND ?
    ORDER BY wj.created_at DESC
  `).all(plate, sqlDf2, sqlDt2) as Record<string,unknown>[];

  const purchaseParts = db.prepare(`
    SELECT pr.id, pr.item_name as title, pr.quantity, pr.unit, pr.estimated_cost,
           pr.actual_cost, pr.status, pr.created_at, 'purchase' as source
    FROM purchase_requests pr
    WHERE pr.vehicle_plate=?
    AND pr.created_at BETWEEN ? AND ?
    ORDER BY pr.created_at DESC
  `).all(plate, sqlDf2, sqlDt2) as Record<string,unknown>[];

  const allDirectExpenses = db.prepare(`
    SELECT fe.id, fe.expense_category as title, fe.amount, fe.description, fe.date, 'direct' as source
    FROM fleet_expenses fe
    WHERE fe.car_id=? AND (fe.expense_category LIKE '%قطعة%' OR fe.expense_category LIKE '%اصلاح%' OR fe.expense_category LIKE '%صيانة%' OR fe.expense_category LIKE '%بنشر%' OR fe.expense_category LIKE '%زيت%')
    ORDER BY fe.date DESC
  `).all(plate) as {date:string;[k:string]:unknown}[];
  const directExpenses = (from || to) ? allDirectExpenses.filter(e => {
    const iso = isoOf2(e.date); if (!iso) return true;
    return (!from || iso >= from) && (!to || iso <= to);
  }) : allDirectExpenses;

  const inventoryParts = db.prepare(`
    SELECT wit.id, wit.item_name, wit.quantity, wit.cost_per_unit,
           ROUND(wit.quantity * COALESCE(wit.cost_per_unit, 0), 2) as total_cost,
           wit.reason, wit.reference_no, wit.created_at, wit.created_by,
           COALESCE(wi.unit, 'قطعة') as unit
    FROM workshop_inventory_transactions wit
    LEFT JOIN workshop_inventory wi ON wi.id = wit.item_id
    WHERE wit.type = 'out' AND (
      wit.vehicle_no = ?
      OR CAST(wit.reference_no AS TEXT) = CAST(? AS TEXT)
      OR EXISTS (
        SELECT 1 FROM maintenance_logs ml
        WHERE CAST(ml.card_number AS TEXT) = CAST(wit.reference_no AS TEXT)
          AND ml.vehicle_plate = ?
      )
      OR EXISTS (
        SELECT 1 FROM workshop_jobs wj
        WHERE wit.reference_no = 'أمر_عمل_#' || CAST(wj.id AS TEXT)
          AND wj.vehicle_plate = ?
      )
    )
    AND wit.created_at BETWEEN ? AND ?
    ORDER BY wit.created_at DESC
  `).all(plate, plate, plate, plate, sqlDf2, sqlDt2) as Record<string,unknown>[];

  res.json({ workshopParts, purchaseParts, directExpenses, inventoryParts });
});

// ══════════════════════════════════════════════════════════════════
// FLEET VEHICLES — full list + general edit  (new, additive)
// ══════════════════════════════════════════════════════════════════

// /fleet-vehicles/manage-full — avoids conflict with existing GET /fleet-vehicles in erp-operations.ts
router.get("/users", (_req, res) => {
  res.json(db.prepare("SELECT id, name, phone, role FROM users ORDER BY name").all());
});

router.get("/fleet-vehicles/manage-full", (_req, res) => {
  const vehicles    = db.prepare(`
    SELECT fv.*
    FROM fleet_vehicles fv
    ORDER BY fv.plate_number
  `).all() as Record<string,unknown>[];
  const compDocs    = db.prepare("SELECT * FROM vehicle_compliance_docs ORDER BY created_at DESC").all() as Record<string,unknown>[];
  const typeRows    = db.prepare("SELECT plate_number, type_name, is_primary FROM vehicle_type_assignments ORDER BY is_primary DESC, id ASC").all() as { plate_number: string; type_name: string; is_primary: number }[];
  const teidaratRows = db.prepare("SELECT * FROM teidarat").all() as Record<string,unknown>[];
  const teidaratById: Record<number, Record<string,unknown>> = {};
  for (const t of teidaratRows) teidaratById[Number(t.id)] = t;

  // Derive real-time status from active workflow orders (source of truth)
  const activeOrders = db.prepare(`
    SELECT vehicle_plate, stage, order_number, customer_name, product_name, driver_name, driver_phone
    FROM workflow_orders
    WHERE stage IN ('vehicle_assigned','invoiced','loaded')
      AND vehicle_plate IS NOT NULL AND vehicle_plate != ''
  `).all() as Record<string,unknown>[];
  const activeByPlate: Record<string, Record<string,unknown>> = {};
  for (const o of activeOrders) {
    activeByPlate[String(o.vehicle_plate)] = o;
  }

  const compMap: Record<string, Record<string, Record<string,unknown>>> = {};
  for (const doc of compDocs) {
    const car  = String(doc.car_number);
    const type = String(doc.doc_type);
    if (!compMap[car])        compMap[car] = {};
    if (!compMap[car][type])  compMap[car][type] = doc;
  }

  const typesMap: Record<string, { type_name: string; is_primary: number }[]> = {};
  for (const tr of typeRows) {
    if (!typesMap[tr.plate_number]) typesMap[tr.plate_number] = [];
    typesMap[tr.plate_number].push({ type_name: tr.type_name, is_primary: tr.is_primary });
  }

  res.json(vehicles.map(v => {
    const plate = String(v.plate_number);
    const activeOrder = activeByPlate[plate];
    const computedStatus = activeOrder ? "on_trip" : (
      (v.status === "busy") ? "available" : (v.status || "available")
    );
    const linkedTeidaraId = v.linked_teidara_id as number | null;
    const legacyIds = teidaratRows
      .filter(t => String(t.vehicle_plate || "") === plate)
      .map(t => Number(t.id));
    const legacyNumberIds = teidaratRows
      .filter(t => String(t.teidara_number || "") === String(v.linked_trailer_number || ""))
      .map(t => Number(t.id));
    const linkedIds = [...new Set([
      ...parseTeidaraIds(v.linked_teidara_ids),
      ...(linkedTeidaraId ? [Number(linkedTeidaraId)] : []),
      ...legacyIds,
      ...legacyNumberIds,
    ])];
    const linked_teidarat = linkedIds.map(id => teidaratById[id]).filter(Boolean);
    const unresolved_teidara_links = [
      ...linkedIds.filter(id => !teidaratById[id]).map(id => ({ source: "id", value: String(id) })),
      ...(v.linked_trailer_number && legacyNumberIds.length === 0
        ? [{ source: "number", value: String(v.linked_trailer_number) }]
        : []),
    ];
    return {
      ...v,
      status: computedStatus,
      active_order: activeOrder || null,
      compliance: compMap[plate] || {},
      types: typesMap[plate] || [],
      linked_teidara: linkedTeidaraId ? (teidaratById[linkedTeidaraId] || null) : null,
      linked_teidarat,
      unresolved_teidara_links,
    };
  }));
});

// PUT /fleet-vehicles/:plate/types — save multi-type assignments
router.put("/fleet-vehicles/:plate/types", (req, res) => {
  const plate = req.params.plate;
  const { types } = req.body as { types: { type_name: string; is_primary: number }[] };

  const existing = db.prepare("SELECT id FROM fleet_vehicles WHERE plate_number=?").get(plate);
  if (!existing) return void res.status(404).json({ error: "السيارة غير موجودة" });

  db.prepare("DELETE FROM vehicle_type_assignments WHERE plate_number=?").run(plate);

  if (Array.isArray(types) && types.length > 0) {
    const ins = db.prepare("INSERT OR IGNORE INTO vehicle_type_assignments (plate_number,type_name,is_primary) VALUES (?,?,?)");
    for (const t of types) ins.run(plate, t.type_name, t.is_primary ? 1 : 0);
    const primary = types.find(t => t.is_primary)?.type_name ?? types[0].type_name;
    db.prepare("UPDATE fleet_vehicles SET vehicle_type=? WHERE plate_number=?").run(primary, plate);
  } else {
    db.prepare("UPDATE fleet_vehicles SET vehicle_type=NULL WHERE plate_number=?").run(plate);
  }

  res.json({ message: "تم حفظ أنواع السيارة" });
});

// ══════════════════════════════════════════════════════════════════
// VEHICLE IMAGES
// ══════════════════════════════════════════════════════════════════

router.get("/vehicle-images/:plate", (req, res) => {
  const rows = db.prepare("SELECT * FROM vehicle_images WHERE plate_number=? ORDER BY created_at ASC").all(req.params.plate);
  res.json(rows);
});

router.post("/vehicle-images", upload.single("image"), (req, res) => {
  const { plate_number, angle } = req.body as Record<string,string>;
  if (!plate_number || !req.file) return void res.status(400).json({ error: "بيانات ناقصة" });
  const image_url = `/api/uploads/${req.file.filename}`;
  const r = db.prepare("INSERT INTO vehicle_images (plate_number,angle,image_url) VALUES (?,?,?)").run(plate_number, angle || "other", image_url);
  res.json({ id: r.lastInsertRowid, image_url, angle: angle || "other" });
});

router.delete("/vehicle-images/:id", async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "رقم الصورة غير صالح" });
    return;
  }

  const existing = db.prepare("SELECT id, image_url FROM vehicle_images WHERE id=?")
    .get(id) as { id: number; image_url: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: "الصورة غير موجودة" });
    return;
  }

  let removal: AttachmentRemovalResult;
  try {
    removal = await removeVehicleAttachmentIfExclusive(existing.image_url);
  } catch (error) {
    if (error instanceof UnsupportedVehicleAttachmentError) {
      res.status(422).json({ error: "نوع تخزين هذه الصورة لا يدعم الحذف من إدارة الأسطول" });
      return;
    }
    req.log.error({ err: error, imageId: id }, "Could not remove vehicle image attachment");
    res.status(500).json({ error: "تعذر حذف الصورة من التخزين؛ لم يتم حذفها من السيارة" });
    return;
  }

  const deleted = db.prepare("DELETE FROM vehicle_images WHERE id=?").run(id);
  if (!deleted.changes) {
    res.status(404).json({ error: "الصورة غير موجودة" });
    return;
  }

  res.json({
    ok: true,
    ...removal,
    clearedFields: [],
  });
});

// POST /fleet-vehicles/create — add new vehicle (new, additive — avoids overriding existing POST /fleet-vehicles)
router.post("/fleet-vehicles/create", (req, res) => {
  const { plate_number, vehicle_name, vehicle_type, entity, branch, status, notes,
    max_weight_kg, empty_weight_kg, driver_name, driver_phone,
    backup_driver_name, backup_driver_phone, linked_teidara_id, linked_teidara_ids
  } = req.body as Record<string,string>;
  if (!plate_number?.trim()) return void res.status(400).json({ error: "رقم اللوحة مطلوب" });
  if (!branch?.trim()) return void res.status(400).json({ error: "اختيار فرع الشركة مطلوب" });
  const validBranch = db.prepare(
    "SELECT id FROM company_settings WHERE active=1 AND LOWER(TRIM(entity_name))=LOWER(?)"
  ).get(branch.trim());
  if (!validBranch) return void res.status(400).json({ error: "الفرع غير موجود ضمن فروع الشركة" });
  if (driver_name?.trim() && backup_driver_name?.trim() && driver_name.trim() === backup_driver_name.trim()) {
    return void res.status(400).json({ error: "لا يمكن اختيار نفس السائق كأساسي واحتياطي" });
  }
  try {
    const selectedIds = parseTeidaraIds(linked_teidara_ids);
    const create = db.transaction(() => {
      const r = db.prepare(`
        INSERT INTO fleet_vehicles (plate_number, vehicle_name, vehicle_type, entity, branch, status, notes,
          max_weight_kg, empty_weight_kg, driver_name, driver_phone, backup_driver_name, backup_driver_phone,
          linked_teidara_id, linked_teidara_ids)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(plate_number.trim(), vehicle_name||null, vehicle_type||null, entity||null, branch.trim(), status||"available", notes||null,
        parseFloat(max_weight_kg)||0, parseFloat(empty_weight_kg)||0,
        driver_name||null, driver_phone||null, backup_driver_name||null, backup_driver_phone||null,
        selectedIds[0] || null, JSON.stringify(selectedIds));
      syncVehicleTeidarat(plate_number.trim(), plate_number.trim(), selectedIds);
      return r;
    });
    const r = create();
    res.status(201).json({ id: r.lastInsertRowid, message: "تم إضافة السيارة" });
  } catch {
    res.status(409).json({ error: "رقم اللوحة مسجّل مسبقاً" });
  }
});

// /fleet-vehicles/:plate/info — avoids conflict with existing PUT /fleet-vehicles/:plate in erp-operations.ts
router.put("/fleet-vehicles/:plate/info", (req, res) => {
  const oldPlate = req.params.plate;
  const { vehicle_name, new_plate_number, vehicle_type, entity, branch, status, notes,
    max_weight_kg, empty_weight_kg, driver_name, driver_phone,
    backup_driver_name, backup_driver_phone, linked_teidara_ids, teidara_links_touched
  } = req.body as Record<string,unknown>;

  const existing = db.prepare("SELECT id FROM fleet_vehicles WHERE plate_number=?").get(oldPlate);
  if (!existing) return void res.status(404).json({ error: "السيارة غير موجودة" });

  const newPlate = String(new_plate_number || "").trim() || oldPlate;
  if (!String(branch || "").trim()) return void res.status(400).json({ error: "اختيار فرع الشركة مطلوب" });
  const validBranch = db.prepare(
    "SELECT id FROM company_settings WHERE active=1 AND LOWER(TRIM(entity_name))=LOWER(?)"
  ).get(String(branch).trim());
  if (!validBranch) return void res.status(400).json({ error: "الفرع غير موجود ضمن فروع الشركة" });

  if (newPlate !== oldPlate) {
    const conflict = db.prepare(
      "SELECT id FROM fleet_vehicles WHERE plate_number=? AND plate_number!=?"
    ).get(newPlate, oldPlate);
    if (conflict) return void res.status(409).json({ error: "رقم اللوحة مستخدم لدى سيارة أخرى" });
    db.prepare("UPDATE vehicle_compliance_docs SET car_number=? WHERE car_number=?").run(newPlate, oldPlate);
    db.prepare("UPDATE vehicle_images SET plate_number=? WHERE plate_number=?").run(newPlate, oldPlate);
  }

  const selectedIds = parseTeidaraIds(linked_teidara_ids);

  if (String(driver_name || "").trim() && String(backup_driver_name || "").trim() &&
      String(driver_name).trim() === String(backup_driver_name).trim()) {
    return void res.status(400).json({ error: "لا يمكن اختيار نفس السائق كأساسي واحتياطي" });
  }

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE fleet_vehicles
      SET vehicle_name=?, plate_number=?, vehicle_type=?, entity=?, branch=?, status=?, notes=?,
          max_weight_kg=?, empty_weight_kg=?, driver_name=?, driver_phone=?,
          backup_driver_name=?, backup_driver_phone=?
      WHERE plate_number=?
    `).run(vehicle_name||null, newPlate, vehicle_type||null, entity||null, String(branch).trim(), status||"available", notes||null,
      parseFloat(String(max_weight_kg || ""))||0, parseFloat(String(empty_weight_kg || ""))||0,
      driver_name||null, driver_phone||null, backup_driver_name||null, backup_driver_phone||null,
      oldPlate);
    if (oldPlate !== newPlate) {
      db.prepare("UPDATE teidarat SET vehicle_plate=? WHERE vehicle_plate=?").run(newPlate, oldPlate);
    }
    if (teidara_links_touched === true) {
      syncVehicleTeidarat(oldPlate, newPlate, selectedIds);
    }
  });
  update();

  res.json({ message: "تم التحديث", new_plate: newPlate });
});

// ══════════════════════════════════════════════════════════════════
// VEHICLE PERFORMANCE DASHBOARD — داش بورد أداء السيارات
// ══════════════════════════════════════════════════════════════════
router.get("/vehicle-perf-dashboard", (req, res) => {
  const { from = "", to = "", branch = "", vtype = "", plates: platesParam = "" } = req.query as Record<string, string>;
  const df = from || "0000-01-01";
  const dt = to   || "9999-12-31";

  // All vehicles (filtered)
  const allV = db.prepare("SELECT plate_number, vehicle_type, branch, status FROM fleet_vehicles ORDER BY plate_number")
    .all() as {plate_number:string;vehicle_type:string|null;branch:string|null;status:string}[];
  let vList = allV;
  if (branch)     vList = vList.filter(v => (v.branch || "النقليات") === branch);
  if (vtype)      vList = vList.filter(v => (v.vehicle_type || "") === vtype);
  if (platesParam) {
    const sel = platesParam.split(",").filter(Boolean);
    vList = vList.filter(v => sel.includes(v.plate_number));
  }
  const plateSet = new Set(vList.map(v => v.plate_number));
  if (plateSet.size === 0) return void res.json([]);

  // Trips — fetch all then filter in JS (trips.date stored as long English format)
  const isoOfTrip = (d: unknown): string => {
    const p = new Date(String(d || "")); return isNaN(p.getTime()) ? "" : p.toISOString().slice(0, 10);
  };
  const inTripRange = (d: unknown): boolean => {
    if (!from && !to) return true;
    const iso = isoOfTrip(d); if (!iso) return true;
    return (!from || iso >= from) && (!to || iso <= to);
  };
  const rawTripRows = db.prepare(`
    SELECT car_id, net_amount, date, driver_name,
           COALESCE(material_expense_diesel,0) as diesel,
           COALESCE(work_value,0) as driver_commission
    FROM trips
    WHERE car_id IS NOT NULL AND car_id != ''
  `).all() as {car_id:string;net_amount:number|null;date:string|null;driver_name:string|null;diesel:number;driver_commission:number}[];

  // Aggregate per vehicle in JS after date filter
  const tripAggMap = new Map<string, {trip_count:number;revenue:number;diesel:number;driver_commission:number;work_days:Set<string>;driver_names:Set<string>}>();
  for (const t of rawTripRows) {
    if (!inTripRange(t.date)) continue;
    const agg = tripAggMap.get(t.car_id) ?? { trip_count:0, revenue:0, diesel:0, driver_commission:0, work_days:new Set<string>(), driver_names:new Set<string>() };
    agg.trip_count++;
    agg.revenue += t.net_amount ?? 0;
    agg.diesel  += t.diesel;
    agg.driver_commission += t.driver_commission;
    if (t.date) agg.work_days.add(t.date);
    if (t.driver_name?.trim()) agg.driver_names.add(t.driver_name.trim());
    tripAggMap.set(t.car_id, agg);
  }
  const tripRows = [...tripAggMap.entries()].map(([car_id, a]) => ({
    car_id,
    trip_count:        a.trip_count,
    revenue:           a.revenue,
    diesel_cost:       a.diesel,
    driver_commission: a.driver_commission,
    work_days:         a.work_days.size,
    driver_count:      a.driver_names.size,
    drivers:           [...a.driver_names].join(",") || null,
  }));

  // Breakdown events per vehicle — from breakdown_reports
  const rawBdEvents = db.prepare(`
    SELECT vehicle_plate, created_at as date, breakdown_type as type, COALESCE(description,'') as description
    FROM breakdown_reports
    WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
      AND created_at BETWEEN ? AND ?
    ORDER BY created_at DESC
  `).all(df, dt + " 23:59:59") as {vehicle_plate:string;date:string;type:string;description:string}[];

  // Breakdown events from maintenance_logs — date is stored as M/D/YY (non-ISO),
  // so we load all rows and filter in JS with proper date parsing.
  const rawMLEvents = (() => {
    try {
      const allML = db.prepare(`
        SELECT vehicle_plate,
               COALESCE(maintenance_date,'') as raw_date,
               COALESCE(maintenance_type,'صيانة') as type,
               COALESCE(description,'') as description
        FROM maintenance_logs
        WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
          AND COALESCE(vehicle_choice,'vehicle') != 'trailer'
        ORDER BY maintenance_date DESC
      `).all() as {vehicle_plate:string;raw_date:string;type:string;description:string}[];

      // Parse M/D/YY or M/D/YYYY → ISO 'YYYY-MM-DD'
      const toISO = (raw: string): string => {
        if (!raw) return "";
        const p = raw.split("/");
        if (p.length !== 3) return "";
        const y = p[2].length === 2 ? `20${p[2]}` : p[2];
        return `${y}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}`;
      };

      return allML
        .filter(r => {
          if (!from && !to) return true;
          const iso = toISO(r.raw_date);
          if (!iso) return true;
          return (!from || iso >= from) && (!to || iso <= dt);
        })
        .map(r => ({ vehicle_plate: r.vehicle_plate, date: toISO(r.raw_date) || r.raw_date, type: r.type, description: r.description }));
    } catch { return []; }
  })();

  const bdEventsMap = new Map<string, {date:string;type:string;desc:string}[]>();
  const addEvent = (plate: string, date: string, type: string, desc: string) => {
    if (!plateSet.has(plate)) return;
    const arr = bdEventsMap.get(plate) || [];
    if (arr.length < 20) arr.push({ date: date.slice(0,10), type: type || "غير محدد", desc });
    bdEventsMap.set(plate, arr);
  };
  for (const e of rawBdEvents)  addEvent(e.vehicle_plate, e.date, e.type, e.description);
  for (const e of rawMLEvents)  addEvent(e.vehicle_plate, e.date, e.type, e.description);

  // Breakdowns from breakdown_reports
  const bdRows = db.prepare(`
    SELECT vehicle_plate,
           COUNT(*) as bd_count,
           GROUP_CONCAT(breakdown_type) as bd_types
    FROM breakdown_reports
    WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
      AND created_at BETWEEN ? AND ?
    GROUP BY vehicle_plate
  `).all(df, dt + " 23:59:59") as {vehicle_plate:string;bd_count:number;bd_types:string|null}[];

  // Build maps
  const tripMap = new Map<string, typeof tripRows[0]>();
  for (const r of tripRows) if (plateSet.has(r.car_id)) tripMap.set(r.car_id, r);

  const bdMap = new Map<string, {count:number;types:string[]}>();
  const addBd = (plate:string, count:number, types:string|null) => {
    const cur = bdMap.get(plate) || {count:0, types:[]};
    cur.count += count;
    if (types) cur.types.push(...types.split(",").map(t => t.trim()).filter(Boolean));
    bdMap.set(plate, cur);
  };
  for (const r of bdRows) if (plateSet.has(r.vehicle_plate)) addBd(r.vehicle_plate, r.bd_count, r.bd_types);

  // Aggregate rawMLEvents (already JS-filtered by date) into bdMap
  const mlAgg = new Map<string, {count:number;types:string[]}>();
  for (const e of rawMLEvents) {
    if (!plateSet.has(e.vehicle_plate)) continue;
    const cur = mlAgg.get(e.vehicle_plate) || {count:0, types:[]};
    cur.count++;
    if (e.type) cur.types.push(e.type);
    mlAgg.set(e.vehicle_plate, cur);
  }
  for (const [plate, agg] of mlAgg) addBd(plate, agg.count, agg.types.join(","));

  // Most frequent type
  const topType = (types: string[]) => {
    if (!types.length) return null;
    const freq: Record<string,number> = {};
    for (const t of types) freq[t] = (freq[t]||0)+1;
    return Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
  };

  // Parts used per vehicle (workshop_inventory_transactions, type='out')
  // Use vehicle_no when set (new rows), fall back to reference_no for old bulk-imported rows
  // JOIN fleet_vehicles ensures the derived plate is a real fleet plate
  const partsRows = db.prepare(`
    SELECT
      CAST(COALESCE(wit.vehicle_no, wit.reference_no) AS TEXT) AS plate,
      COUNT(*) AS parts_count,
      SUM(COALESCE(wit.quantity,0) * COALESCE(wit.cost_per_unit,0)) AS parts_cost
    FROM workshop_inventory_transactions wit
    JOIN fleet_vehicles fv
      ON CAST(COALESCE(wit.vehicle_no, wit.reference_no) AS TEXT) = fv.plate_number
    WHERE wit.type = 'out'
      AND wit.created_at BETWEEN ? AND ?
    GROUP BY plate
  `).all(df, dt + " 23:59:59") as {plate:string;parts_count:number;parts_cost:number}[];
  const partsMap = new Map<string, {count:number;cost:number}>();
  for (const r of partsRows) if (plateSet.has(r.plate)) partsMap.set(r.plate, {count:r.parts_count, cost:r.parts_cost||0});

  // Purchase invoices per vehicle
  const purchasesRows = db.prepare(`
    SELECT vehicle_plate,
      COUNT(*) AS purchases_count,
      SUM(COALESCE(price_after_vat,0) * COALESCE(quantity,1)) AS purchases_cost
    FROM purchase_invoices
    WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
      AND (work_on IS NULL OR work_on='' OR work_on='vehicle')
      AND COALESCE(invoice_date, DATE(created_at)) BETWEEN ? AND ?
    GROUP BY vehicle_plate
  `).all(df, dt) as {vehicle_plate:string;purchases_count:number;purchases_cost:number}[];
  const purchasesMap = new Map<string, {count:number;cost:number}>();
  for (const r of purchasesRows) if (plateSet.has(r.vehicle_plate)) purchasesMap.set(r.vehicle_plate, {count:r.purchases_count, cost:r.purchases_cost||0});

  // Fleet avg revenue (among vehicles that have trips)
  const totalRevAll = tripRows.reduce((s,r)=>s+r.revenue,0);
  const totalTripsAll = tripRows.reduce((s,r)=>s+r.trip_count,0);
  const fleetAvgRevPerTrip = totalTripsAll > 0 ? totalRevAll / totalTripsAll : 0;

  const result = vList.map(v => {
    const trips = tripMap.get(v.plate_number);
    const bd    = bdMap.get(v.plate_number);
    const revPerTrip = trips && trips.trip_count > 0 ? trips.revenue / trips.trip_count : 0;

    // Diagnosis
    const diagnosis: string[] = [];
    if (bd && bd.count > 0) {
      diagnosis.push(bd.count >= 3 ? "breakdown_heavy" : "breakdown");
    }
    if (!trips || trips.trip_count === 0) {
      if (v.status === "maintenance") diagnosis.push("in_workshop");
      else { diagnosis.push("no_work"); diagnosis.push("supervisor"); }
    } else {
      if (fleetAvgRevPerTrip > 0 && revPerTrip < fleetAvgRevPerTrip * 0.4) diagnosis.push("low_efficiency");
      if (trips.driver_count > 4 && trips.work_days > 0) diagnosis.push("driver_churn");
    }

    const netRev = (trips?.revenue || 0) - (trips?.diesel_cost || 0) - (trips?.driver_commission || 0);
    const netDailyRev = (trips?.work_days || 0) > 0 ? netRev / trips!.work_days : 0;
    const parts     = partsMap.get(v.plate_number);
    const purchases = purchasesMap.get(v.plate_number);
    return {
      plate_number:      v.plate_number,
      vehicle_type:      v.vehicle_type,
      branch:            v.branch || "النقليات",
      status:            v.status,
      trip_count:        trips?.trip_count        || 0,
      revenue:           trips?.revenue           || 0,
      diesel_cost:       trips?.diesel_cost       || 0,
      driver_commission: trips?.driver_commission || 0,
      net_daily_rev:     Math.round(netDailyRev),
      work_days:         trips?.work_days         || 0,
      driver_count:      trips?.driver_count      || 0,
      drivers:           trips?.drivers           || null,
      breakdown_count:   bd?.count               || 0,
      top_breakdown_type: topType(bd?.types || []),
      bd_events:         bdEventsMap.get(v.plate_number) || [],
      diagnosis,
      parts_count:       parts?.count    || 0,
      parts_cost:        parts?.cost     || 0,
      purchases_count:   purchases?.count || 0,
      purchases_cost:    purchases?.cost  || 0,
    };
  });

  res.json(result);
});

// ══════════════════════════════════════════════════════════════════
// FLEET DRIVER RANKING — ترتيب السائقين على مستوى الأسطول
// ══════════════════════════════════════════════════════════════════

router.get("/fleet-driver-ranking", (req, res) => {
  const { from = "", to = "", plates: platesParam = "", vtype = "", branch = "" } = req.query as Record<string, string>;
  const df = from || "0000-01-01";
  const dt = to   || "9999-12-31";

  // Resolve effective plates for vehicle filter (branch + vtype + explicit plates)
  const allVehicles = db.prepare("SELECT plate_number, vehicle_type, branch FROM fleet_vehicles").all() as {plate_number:string;vehicle_type:string|null;branch:string|null}[];
  let activePlates: string[] = allVehicles.map(v => v.plate_number);
  if (branch)     activePlates = activePlates.filter(p => (allVehicles.find(v => v.plate_number === p)?.branch || "النقليات") === branch);
  if (vtype)      activePlates = activePlates.filter(p => (allVehicles.find(v => v.plate_number === p)?.vehicle_type || "") === vtype);
  if (platesParam) {
    const sel = platesParam.split(",").filter(Boolean);
    activePlates = activePlates.filter(p => sel.includes(p));
  }
  const platesFiltered = branch || vtype || platesParam ? activePlates : [];

  // All registered drivers from driver_profiles (source of truth for assignments)
  const profiles = db.prepare(`
    SELECT driver_name, vehicle_plate, phone, status
    FROM driver_profiles WHERE driver_name IS NOT NULL AND driver_name != ''
    ORDER BY driver_name
  `).all() as {driver_name:string;vehicle_plate:string|null;phone:string|null;status:string}[];

  // Trip stats grouped by driver name (date + vehicle filtered)
  const platesCond = platesFiltered.length > 0
    ? `AND car_id IN (${platesFiltered.map(() => "?").join(",")})`
    : "";
  const tripStats = db.prepare(`
    SELECT driver_name,
           SUM(COALESCE(trips_count,1)) as total_trips,
           SUM(COALESCE(return_value_no_vat,0)) as total_revenue,
           SUM(COALESCE(work_value,0)) as total_work,
           SUM(COALESCE(material_expense_diesel,0)) as total_diesel,
           GROUP_CONCAT(DISTINCT car_id) as vehicles_from_trips,
           MIN(date) as first_date, MAX(date) as last_date
    FROM trips WHERE driver_name IS NOT NULL AND driver_name != ''
      AND date BETWEEN ? AND ?
      ${platesCond}
    GROUP BY driver_name
  `).all(df, dt, ...platesFiltered) as {driver_name:string;total_trips:number;total_revenue:number;total_work:number;total_diesel:number;vehicles_from_trips:string;first_date:string;last_date:string}[];

  // Build lookup map (try exact + trimmed)
  const statsMap = new Map<string, typeof tripStats[0]>();
  for (const s of tripStats) {
    statsMap.set(s.driver_name, s);
    statsMap.set(s.driver_name.trim(), s);
  }

  const seenTrimmed = new Set<string>();
  const result: Record<string, unknown>[] = [];

  // Add all profile drivers (with or without trips)
  for (const p of profiles) {
    const trimmed = p.driver_name.trim();
    seenTrimmed.add(trimmed);
    const stats = statsMap.get(p.driver_name) || statsMap.get(trimmed) || null;
    const vehiclesSet = new Set<string>();
    if (p.vehicle_plate) vehiclesSet.add(p.vehicle_plate);
    if (stats?.vehicles_from_trips) stats.vehicles_from_trips.split(",").forEach((v: string) => vehiclesSet.add(v.trim()));
    result.push({
      driver_name: p.driver_name,
      driver_status: p.status,
      phone: p.phone,
      assigned_vehicle: p.vehicle_plate,
      total_trips: stats?.total_trips || 0,
      total_revenue: stats?.total_revenue || 0,
      total_work: stats?.total_work || 0,
      total_diesel: stats?.total_diesel || 0,
      vehicles_count: vehiclesSet.size,
      vehicles_list: [...vehiclesSet].join(","),
      first_date: stats?.first_date || null,
      last_date: stats?.last_date || null,
    });
  }

  // Add trip drivers not in any profile
  for (const s of tripStats) {
    if (!seenTrimmed.has(s.driver_name.trim())) {
      const vList = s.vehicles_from_trips || "";
      result.push({
        driver_name: s.driver_name,
        driver_status: null,
        phone: null,
        assigned_vehicle: null,
        total_trips: s.total_trips,
        total_revenue: s.total_revenue,
        total_work: s.total_work,
        total_diesel: s.total_diesel,
        vehicles_count: vList.split(",").filter(Boolean).length,
        vehicles_list: vList,
        first_date: s.first_date,
        last_date: s.last_date,
      });
    }
  }

  result.sort((a, b) => (b.total_trips as number) - (a.total_trips as number));
  res.json(result.slice(0, 60));
});

// ══════════════════════════════════════════════════════════════════
// DRIVER CROSS-VEHICLE STATS — السيارات التي عمل عليها سائق محدد
// ══════════════════════════════════════════════════════════════════

router.get("/driver-vehicles/:driver", (req, res) => {
  const driver = decodeURIComponent(req.params.driver);

  // Trip-based vehicle stats for this driver
  const tripRows = db.prepare(`
    SELECT car_id as plate,
           SUM(COALESCE(trips_count,1)) as total_trips,
           SUM(COALESCE(return_value_no_vat,0)) as total_revenue,
           SUM(COALESCE(work_value,0)) as total_work,
           MIN(date) as first_date, MAX(date) as last_date
    FROM trips
    WHERE (driver_name=? OR TRIM(driver_name)=TRIM(?)) AND car_id IS NOT NULL AND car_id != ''
    GROUP BY car_id
    ORDER BY total_trips DESC LIMIT 30
  `).all(driver, driver) as {plate:string;total_trips:number;total_revenue:number;total_work:number;first_date:string;last_date:string}[];

  // Current assignment comes from the company fleet record.
  const assignment = db.prepare(`
    SELECT plate_number FROM fleet_vehicles
    WHERE driver_name=? OR TRIM(driver_name)=TRIM(?)
       OR backup_driver_name=? OR TRIM(backup_driver_name)=TRIM(?)
    LIMIT 1
  `).get(driver, driver, driver, driver) as {plate_number:string|null}|undefined;

  // Merge: add assigned vehicle if not in trips
  const platesInTrips = new Set(tripRows.map(r => r.plate));
  if (assignment?.plate_number && !platesInTrips.has(assignment.plate_number)) {
    tripRows.unshift({
      plate: assignment.plate_number,
      total_trips: 0, total_revenue: 0, total_work: 0,
      first_date: "", last_date: "",
    });
  }

  res.json(tripRows);
});

// ══════════════════════════════════════════════════════════════════
// EXCEL IMPORT / EXPORT HELPERS
// ══════════════════════════════════════════════════════════════════

// GET /vehicle-compliance/all — export all compliance docs
router.get("/vehicle-compliance/all", (_req, res) => {
  const rows = db.prepare(`
    SELECT car_number, doc_type, start_date, end_date, notes, created_at
    FROM vehicle_compliance_docs
    ORDER BY car_number, doc_type
  `).all();
  res.json(rows);
});

// POST /fleet-vehicles/import — bulk upsert from Excel (parsed rows)
router.post("/fleet-vehicles/import", (req, res) => {
  const rows: Record<string, string>[] = req.body?.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0)
    return void res.status(400).json({ error: "لا توجد بيانات" });

  const keyMap: Record<string, string> = {
    "رقم اللوحة": "plate_number",   "plate_number": "plate_number",
    "رقم السيارة": "plate_number",  "اللوحة": "plate_number",
    "اسم المركبة": "vehicle_name",  "vehicle_name": "vehicle_name",
    "نوع المركبة": "vehicle_type",  "vehicle_type": "vehicle_type", "النوع": "vehicle_type",
    "الجهة": "entity",              "entity": "entity",
    "فرع الشركة": "branch",         "الفرع": "branch", "branch": "branch",
    "الحالة": "status",             "status": "status",
    "السائق الأساسي": "driver_name", "driver_name": "driver_name", "اسم السائق": "driver_name",
    "جوال السائق الأساسي": "driver_phone", "driver_phone": "driver_phone",
    "السائق الاحتياطي": "backup_driver_name", "backup_driver_name": "backup_driver_name",
    "جوال السائق الاحتياطي": "backup_driver_phone", "backup_driver_phone": "backup_driver_phone",
    "الحمولة القصوى كجم": "max_weight_kg",  "max_weight_kg": "max_weight_kg",
    "الوزن الفارغ كجم": "empty_weight_kg",  "empty_weight_kg": "empty_weight_kg",
    "ملاحظات": "notes",             "notes": "notes",
  };
  const statusMap: Record<string, string> = {
    "متاح": "available", "مشغول": "busy", "في رحلة": "on_trip",
    "في الصيانة": "maintenance", "متوقف": "inactive",
    available: "available", busy: "busy", on_trip: "on_trip",
    maintenance: "maintenance", inactive: "inactive",
  };

  const upsert = db.prepare(`
    INSERT INTO fleet_vehicles
      (plate_number, vehicle_name, vehicle_type, entity, branch, status,
       driver_name, driver_phone, backup_driver_name, backup_driver_phone,
       max_weight_kg, empty_weight_kg, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(plate_number) DO UPDATE SET
      vehicle_name   = COALESCE(excluded.vehicle_name,   vehicle_name),
      vehicle_type   = COALESCE(excluded.vehicle_type,   vehicle_type),
      entity         = COALESCE(excluded.entity,         entity),
      branch         = COALESCE(excluded.branch,         branch),
      status         = COALESCE(excluded.status,         status),
      driver_name    = COALESCE(excluded.driver_name,    driver_name),
      driver_phone   = COALESCE(excluded.driver_phone,   driver_phone),
      backup_driver_name = COALESCE(excluded.backup_driver_name, backup_driver_name),
      backup_driver_phone = COALESCE(excluded.backup_driver_phone, backup_driver_phone),
      max_weight_kg  = COALESCE(excluded.max_weight_kg,  max_weight_kg),
      empty_weight_kg= COALESCE(excluded.empty_weight_kg,empty_weight_kg),
      notes          = COALESCE(excluded.notes,          notes)
  `);

  let imported = 0;
  const doImport = db.transaction(() => {
    for (const raw of rows) {
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        const norm = keyMap[k.trim()];
        if (norm) mapped[norm] = String(v ?? "").trim();
      }
      if (!mapped.plate_number) continue;
      const current = db.prepare("SELECT branch, status FROM fleet_vehicles WHERE plate_number=?")
        .get(mapped.plate_number) as { branch?: string; status?: string } | undefined;
      const branch = mapped.branch || current?.branch || "";
      if (!branch) throw new Error(`فرع الشركة مطلوب للسيارة ${mapped.plate_number}`);
      const validBranch = db.prepare(
        "SELECT id FROM company_settings WHERE active=1 AND LOWER(TRIM(entity_name))=LOWER(?)"
      ).get(branch);
      if (!validBranch) throw new Error(`فرع السيارة ${mapped.plate_number} غير موجود ضمن فروع الشركة`);
      if (mapped.driver_name && mapped.backup_driver_name &&
          mapped.driver_name === mapped.backup_driver_name) {
        throw new Error(`لا يمكن تكرار نفس السائق للسيارة ${mapped.plate_number}`);
      }
      let st: string | null = null;
      if (mapped.status) {
        st = statusMap[mapped.status] ?? null;
        if (!st) throw new Error(`حالة السيارة ${mapped.plate_number} غير معروفة`);
      } else if (!current) {
        st = "available";
      }
      upsert.run(
        mapped.plate_number,
        mapped.vehicle_name  || null,
        mapped.vehicle_type  || null,
        mapped.entity        || null,
        branch,
        st,
        mapped.driver_name   || null,
        mapped.driver_phone  || null,
        mapped.backup_driver_name || null,
        mapped.backup_driver_phone || null,
        mapped.max_weight_kg  ? parseFloat(mapped.max_weight_kg)  : null,
        mapped.empty_weight_kg? parseFloat(mapped.empty_weight_kg): null,
        mapped.notes         || null,
      );
      imported++;
    }
  });
  try {
    doImport();
  } catch (error) {
    return void res.status(400).json({ error: error instanceof Error ? error.message : "تعذر استيراد السيارات" });
  }

  res.json({ imported, message: `تم استيراد/تحديث ${imported} مركبة` });
});

// ══════════════════════════════════════════════════════════════════
// LOAD REQUEST — fleet-vehicles variant (replaces /api/vehicles/:id/load-request)
// ══════════════════════════════════════════════════════════════════

router.post("/fleet-vehicles/:plate/load-request", (req, res) => {
  const plate = decodeURIComponent(req.params.plate);
  const vehicle = db.prepare("SELECT plate_number, vehicle_type FROM fleet_vehicles WHERE plate_number=?").get(plate) as
    { plate_number: string; vehicle_type: string | null } | undefined;
  if (!vehicle) return void res.status(404).json({ error: "السيارة غير موجودة" });

  const type  = vehicle.vehicle_type || "";
  const notes = String(req.body?.notes || "").trim();

  let targetLabel = "";
  let recipients: { phone: string }[] = [];

  if (/بلكر/i.test(type)) {
    targetLabel = "مسؤول الفسحات";
    const all = db.prepare("SELECT phone, permissions FROM users WHERE active=1").all() as
      { phone: string; permissions: string | null }[];
    recipients = all.filter(u => {
      try { return (JSON.parse(u.permissions || "[]") as string[]).includes("ops_fsohat"); }
      catch { return false; }
    });
  } else if (/سطحة|قلاب|لوبد|lowbed/i.test(type)) {
    targetLabel = "مشرف النقليات";
    recipients = db.prepare("SELECT phone FROM users WHERE role='supervisor' AND active=1").all() as
      { phone: string }[];
  } else {
    targetLabel = "مسئول حركة البرح";
    const all = db.prepare("SELECT phone, permissions FROM users WHERE active=1").all() as
      { phone: string; permissions: string | null }[];
    recipients = all.filter(u => {
      try { return (JSON.parse(u.permissions || "[]") as string[]).includes("ops_bulker"); }
      catch { return false; }
    });
  }

  if (recipients.length === 0)
    return void res.status(200).json({ ok: true, sent: 0, targetLabel, warn: "لا يوجد مستخدم مخصص لهذا الدور حالياً" });

  const title = `طلب حمولة — ${vehicle.plate_number}`;
  const body  = `نوع المركبة: ${type}${notes ? ` — ملاحظة: ${notes}` : ""}`;
  const ins   = db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)");
  recipients.forEach(r => ins.run(r.phone, title, body));

  res.json({ ok: true, sent: recipients.length, targetLabel });
});

export default router;
