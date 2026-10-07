import { Router } from "express";
import db from "../lib/db.js";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";

const router = Router();
const objectStorageService = new ObjectStorageService();

const AI_BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const AI_API_KEY  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

type LoadingOrder = {
  id: number;
  permit_number: string | null;
  cement_ref_number: string | null;
  vehicle_plate: string;
  driver_name: string;
  driver_phone: string | null;
  cargo_type: string | null;
  unload_location: string | null;
  unload_location_id: number | null;
  unload_location_phone: string | null;
  unload_location_map_url: string | null;
  status: string;
  confirmed_at: string | null;
  saib_order_id: number | null;
  supply_request_id: number | null;
  created_by: string | null;
  notes: string | null;
  attachment_url: string | null;
  loading_invoice_url: string | null;
  net_weight: string | null;
  tariff_id: number | null;
  tariff_loading_place: string | null;
  tariff_unloading_place: string | null;
  tariff_bonus: number | null;
  tariff_rental_per_ton: number | null;
  created_at: string;
};

type BulkerTariff = {
  id: number; loading_place: string; unloading_place: string;
  vehicle_type: string | null; cargo_type: string | null;
  driver_expense: number; rental: number;
};

const loadingOrderSelect = `
  SELECT lo.id, lo.permit_number, lo.cement_ref_number, lo.vehicle_plate,
    lo.driver_name, lo.driver_phone, lo.cargo_type, lo.unload_location,
    COALESCE(lo.unload_location_id, location.id) AS unload_location_id,
    lo.status, lo.confirmed_at, lo.saib_order_id, lo.supply_request_id,
    lo.created_by, lo.notes, lo.attachment_url, lo.loading_invoice_url,
    lo.net_weight, lo.tariff_id, lo.tariff_loading_place, lo.tariff_unloading_place,
    lo.tariff_bonus, lo.tariff_rental_per_ton, lo.created_at,
    location.phone_number AS unload_location_phone,
    location.map_url AS unload_location_map_url
  FROM loading_orders lo
  LEFT JOIN unload_locations location ON location.id = COALESCE(
    lo.unload_location_id,
    (SELECT legacy.id FROM unload_locations legacy
      WHERE LOWER(TRIM(legacy.name)) = LOWER(TRIM(lo.unload_location))
      ORDER BY legacy.id LIMIT 1)
  )
`;

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function findUnloadLocation(id: unknown): { id: number; name: string } | null {
  const parsed = Number(id);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return (db.prepare("SELECT id, name FROM unload_locations WHERE id=?").get(parsed) as { id: number; name: string } | undefined) || null;
}

function findUnloadLocationByName(name: string): { id: number; name: string } | null {
  return (db.prepare("SELECT id, name FROM unload_locations WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) ORDER BY id LIMIT 1")
    .get(name) as { id: number; name: string } | undefined) || null;
}

function getBulkerTariff(id: unknown, cargo: string | null): BulkerTariff | null {
  const tariffId = Number(id);
  if (!Number.isSafeInteger(tariffId) || tariffId <= 0) return null;
  const tariff = db.prepare("SELECT id, loading_place, unloading_place, vehicle_type, cargo_type, driver_expense, rental FROM tariffs WHERE id=? AND status='approved'")
    .get(tariffId) as BulkerTariff | undefined;
  if (!tariff || (tariff.vehicle_type && tariff.vehicle_type !== "الكل" && !/بلك|بالك|bulker/i.test(tariff.vehicle_type))
    || (tariff.cargo_type && tariff.cargo_type.trim() !== (cargo || "").trim())) return null;
  return tariff;
}

// AI invoice extraction returns a number with kg/ton when available. Plain small
// numbers are tons; invoice-style large numbers are kilograms.
function weightInTons(raw: string | null): number | null {
  if (!raw) return null;
  const latin = raw.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/٬/g, ",").replace(/٫/g, ".");
  const match = latin.match(/(\d[\d,.]*)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const kg = /كجم|كيلو|kg|kilogram/i.test(latin) || (!/طن|ton|t\b/i.test(latin) && value >= 1000);
  return Math.round((kg ? value / 1000 : value) * 1000) / 1000;
}

router.get("/loading-orders/bulker-tariffs", (_req, res) => {
  const rows = db.prepare(`
    SELECT id, loading_place, unloading_place, vehicle_type, cargo_type, driver_expense, rental
    FROM tariffs WHERE status='approved'
      AND (vehicle_type IS NULL OR vehicle_type='' OR vehicle_type='الكل'
           OR vehicle_type LIKE '%بلك%' OR vehicle_type LIKE '%بالك%' OR lower(vehicle_type) LIKE '%bulker%')
    ORDER BY loading_place, unloading_place, id
  `).all();
  res.json(rows);
});

// ── GET loading orders by vehicle plate (for bulker driver) ───────────────
router.get("/loading-orders/by-plate/:plate", (req, res) => {
  const rows = db.prepare(
    `${loadingOrderSelect} WHERE lo.vehicle_plate=? ORDER BY lo.id DESC`
  ).all(req.params.plate) as LoadingOrder[];
  res.json(rows);
});

// ── GET loading orders by driver phone ────────────────────────────────────
router.get("/loading-orders/by-driver/:phone", (req, res) => {
  const phone = req.params.phone;
  // Match by direct driver_phone stored on the order,
  // OR via vehicle_plate assigned to this user in the users table.
  const rows = db.prepare(
    `${loadingOrderSelect}
     WHERE lo.driver_phone = ?
        OR lo.vehicle_plate IN (
             SELECT vehicle_plate FROM users
             WHERE phone = ? AND vehicle_plate IS NOT NULL AND vehicle_plate != ''
           )
     ORDER BY lo.id DESC`
  ).all(phone, phone) as LoadingOrder[];
  res.json(rows);
});

// ── GET all loading orders (optional ?status=pending|confirmed) ───────────
router.get("/loading-orders", (req, res) => {
  const { status } = req.query as { status?: string };
  const rows = status
    ? (db.prepare(`${loadingOrderSelect} WHERE lo.status=? ORDER BY lo.id DESC`).all(status) as LoadingOrder[])
    : (db.prepare(`${loadingOrderSelect} ORDER BY lo.id DESC`).all() as LoadingOrder[]);
  res.json(rows);
});

// ── POST create a new loading order ───────────────────────────────────────
router.post("/loading-orders", (req, res) => {
  const {
    permit_number, cement_ref_number, vehicle_plate, driver_name,
    driver_phone, cargo_type, unload_location, unload_location_id, saib_order_id, supply_request_id,
    created_by, notes, attachment_url, tariff_id,
  } = req.body;

  if (!vehicle_plate || !driver_name) {
    return void res.status(400).json({ error: "رقم السيارة واسم السائق مطلوبان" });
  }
  let location = hasValue(unload_location_id) ? findUnloadLocation(unload_location_id) : null;
  if (hasValue(unload_location_id) && !location) {
    return void res.status(400).json({ error: "موقع التنزيل المختار غير موجود" });
  }
  const requestedLocationName = typeof unload_location === "string" ? unload_location.trim() : "";
  if (!location && requestedLocationName) location = findUnloadLocationByName(requestedLocationName);
  if (requestedLocationName && !location) {
    return void res.status(400).json({ error: "اختر موقع التنزيل من قائمة المواقع المحفوظة" });
  }
  const hasTariffId = hasValue(tariff_id);
  const tariff = hasTariffId ? getBulkerTariff(tariff_id, cargo_type) : null;
  if (hasTariffId && !tariff) {
    return void res.status(400).json({ error: "اختر تعريفة بلكر معتمدة ومناسبة لنوع الحمولة" });
  }
  if (location && !tariff) {
    return void res.status(400).json({ error: "اختيار التعريفة إلزامي عند تحديد موقع التنزيل" });
  }

  if (permit_number) {
    const existing = db.prepare("SELECT id FROM loading_orders WHERE permit_number=?").get(permit_number);
    if (existing) {
      return void res.status(409).json({ error: `رقم الفسح "${permit_number}" مستخدم مسبقاً في أمر تحميل آخر` });
    }
  }

  const result = db.transaction(() => {
    const created = db.prepare(`
    INSERT INTO loading_orders
      (permit_number, cement_ref_number, vehicle_plate, driver_name,
       driver_phone, cargo_type, unload_location, unload_location_id, saib_order_id, supply_request_id,
        created_by, notes, attachment_url, tariff_id, tariff_loading_place,
        tariff_unloading_place, tariff_bonus, tariff_rental_per_ton, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',datetime('now'))
    `).run(
      permit_number || null, cement_ref_number || null,
      vehicle_plate, driver_name, driver_phone || null,
      cargo_type || null, location?.name || null, location?.id || null,
      saib_order_id || null, supply_request_id || null,
      created_by || null, notes || null, attachment_url || null, tariff?.id || null,
      tariff?.loading_place || null, tariff?.unloading_place || null, tariff?.driver_expense ?? null, tariff?.rental ?? null,
    );
    // Separate bulker registry only; never create a company fleet vehicle here.
    if (!db.prepare("SELECT id FROM bulker_vehicles WHERE vehicle_plate=? LIMIT 1").get(vehicle_plate)) {
      db.prepare("INSERT INTO bulker_vehicles (vehicle_plate,driver_name,driver_phone) VALUES (?,?,?)")
        .run(vehicle_plate, driver_name, driver_phone || null);
    }
    db.prepare("UPDATE fleet_vehicles SET status='busy' WHERE plate_number=?").run(vehicle_plate);
    return created;
  })();

  const row = db.prepare(`${loadingOrderSelect} WHERE lo.id=?`).get(result.lastInsertRowid) as LoadingOrder;
  res.json(row);
});

// ── POST bulk import ───────────────────────────────────────────────────────
router.post("/loading-orders/bulk-import", (req, res) => {
  const { rows, created_by } = req.body as { rows: Record<string, string>[]; created_by?: string };
  if (!Array.isArray(rows) || rows.length === 0)
    return void res.status(400).json({ error: "لا توجد صفوف للاستيراد" });
  const validRows = rows.filter(r => r.vehicle_plate && r.driver_name);
  if (validRows.length === 0)
    return void res.status(400).json({ error: "لا توجد صفوف صالحة (رقم السيارة واسم السائق مطلوبان)" });
  const preparedRows = validRows.map((r, index) => {
    const locationName = (r.unload_location || "").trim();
    const location = locationName ? findUnloadLocationByName(locationName) : null;
    const hasTariffId = hasValue(r.tariff_id);
    const tariff = hasTariffId ? getBulkerTariff(r.tariff_id, r.cargo_type || null) : null;
    return { row: r, rowNumber: index + 1, locationName, location, hasTariffId, tariff };
  });
  const invalidRow = preparedRows.find(item =>
    (item.locationName && !item.location) ||
    (item.hasTariffId && !item.tariff) ||
    (item.location && !item.tariff)
  );
  if (invalidRow) {
    const error = invalidRow.locationName && !invalidRow.location
      ? "موقع غير محفوظ في قائمة المواقع"
      : invalidRow.location && !invalidRow.tariff
        ? "يجب تحديد رقم تعريفة معتمد لكل صف له موقع تنزيل"
        : "رقم التعريفة غير معتمد أو لا يناسب نوع الحمولة";
    return void res.status(400).json({ error: `${error} (الصف ${invalidRow.rowNumber})` });
  }
  const insert = db.prepare(`
    INSERT INTO loading_orders (permit_number, cement_ref_number, vehicle_plate, driver_name,
      cargo_type, unload_location, unload_location_id, tariff_id, tariff_loading_place,
      tariff_unloading_place, tariff_bonus, tariff_rental_per_ton, created_by, notes, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',datetime('now'))
  `);
  const insertMany = db.transaction(() => {
    for (const item of preparedRows) {
      const { row: r, location, tariff } = item;
      insert.run(r.permit_number||null, r.cement_ref_number||null, r.vehicle_plate, r.driver_name,
        r.cargo_type||null, location?.name || null, location?.id || null, tariff?.id || null,
        tariff?.loading_place || null, tariff?.unloading_place || null,
        tariff?.driver_expense ?? null, tariff?.rental ?? null, created_by||null, r.notes||null);
      if (!db.prepare("SELECT id FROM bulker_vehicles WHERE vehicle_plate=? LIMIT 1").get(r.vehicle_plate)) {
        db.prepare("INSERT INTO bulker_vehicles (vehicle_plate,driver_name) VALUES (?,?)")
          .run(r.vehicle_plate, r.driver_name);
      }
    }
  });
  insertMany();
  res.json({ inserted: validRows.length, skipped: rows.length - validRows.length });
});

// ── PUT edit a pending loading order ──────────────────────────────────────
router.put("/loading-orders/:id", (req, res) => {
  const lo = db.prepare("SELECT status, unload_location, unload_location_id, tariff_id, tariff_loading_place, tariff_unloading_place, tariff_bonus, tariff_rental_per_ton FROM loading_orders WHERE id=?").get(req.params.id) as LoadingOrder | undefined;
  if (!lo) return void res.status(404).json({ error: "أمر التحميل غير موجود" });
  const {
    permit_number, cement_ref_number, vehicle_plate, driver_name,
    driver_phone, cargo_type, unload_location, unload_location_id, notes, attachment_url, net_weight, tariff_id,
  } = req.body;
  if (!vehicle_plate || !driver_name) {
    return void res.status(400).json({ error: "رقم السيارة واسم السائق مطلوبان" });
  }
  const submittedLocationName = typeof unload_location === "string" ? unload_location.trim() : "";
  const submittedLocationId = hasValue(unload_location_id) ? findUnloadLocation(unload_location_id) : null;
  if (hasValue(unload_location_id) && !submittedLocationId) {
    return void res.status(400).json({ error: "موقع التنزيل المختار غير موجود" });
  }
  let nextLocation: { id: number; name: string } | null = null;
  if (unload_location_id === undefined) {
    if (unload_location === undefined) {
      nextLocation = lo.unload_location_id
        ? findUnloadLocation(lo.unload_location_id)
        : findUnloadLocationByName(lo.unload_location || "");
    } else if (submittedLocationName) {
      nextLocation = findUnloadLocationByName(submittedLocationName);
    }
  } else {
    nextLocation = submittedLocationId;
  }
  if (!nextLocation && submittedLocationName) {
    nextLocation = findUnloadLocationByName(submittedLocationName);
    if (!nextLocation && submittedLocationName !== (lo.unload_location || "").trim()) {
      return void res.status(400).json({ error: "اختر موقع التنزيل من قائمة المواقع المحفوظة" });
    }
  }
  const nextUnloadLocation = unload_location === undefined
    ? (nextLocation?.name || lo.unload_location || "")
    : nextLocation?.name || (submittedLocationName === (lo.unload_location || "").trim() ? submittedLocationName : "");
  const nextTariffId = tariff_id === undefined ? lo.tariff_id : tariff_id || null;
  const changedTariff = String(nextTariffId || "") !== String(lo.tariff_id || "");
  const hasTariffSnapshot = lo.tariff_loading_place != null && lo.tariff_unloading_place != null;
  const selected = nextTariffId && (changedTariff || !hasTariffSnapshot)
    ? getBulkerTariff(nextTariffId, cargo_type)
    : null;
  if (nextTariffId && !selected && (changedTariff || !lo.tariff_loading_place)) {
    return void res.status(400).json({ error: "التعريفة غير معتمدة أو لا تناسب حمولة البلكر" });
  }
  if (nextUnloadLocation.trim() && !nextTariffId) {
    return void res.status(400).json({ error: "اختيار التعريفة إلزامي عند تحديد موقع التنزيل" });
  }
  if (permit_number) {
    const existing = db.prepare("SELECT id FROM loading_orders WHERE permit_number=? AND id!=?").get(permit_number, req.params.id) as { id: number } | undefined;
    if (existing) {
      return void res.status(409).json({ error: `رقم الفسح "${permit_number}" مستخدم مسبقاً في أمر تحميل آخر` });
    }
  }
  db.prepare(`
    UPDATE loading_orders SET
      permit_number=?, cement_ref_number=?, vehicle_plate=?, driver_name=?,
      driver_phone=COALESCE(?,driver_phone),
      cargo_type=?, unload_location=?, unload_location_id=?, notes=?,
      attachment_url=COALESCE(?,attachment_url),
       net_weight=COALESCE(?,net_weight), tariff_id=?,
       tariff_loading_place=?, tariff_unloading_place=?, tariff_bonus=?, tariff_rental_per_ton=?
    WHERE id=?
  `).run(
    permit_number || null, cement_ref_number || null,
    vehicle_plate, driver_name,
    driver_phone || null,
    cargo_type || null, nextUnloadLocation || null, nextLocation?.id || null,
    notes || null,
    attachment_url || null,
    net_weight || null, nextTariffId || null,
    changedTariff ? selected?.loading_place || null : lo.tariff_loading_place,
    changedTariff ? selected?.unloading_place || null : lo.tariff_unloading_place,
    changedTariff ? selected?.driver_expense ?? null : lo.tariff_bonus,
    changedTariff ? selected?.rental ?? null : lo.tariff_rental_per_ton,
    req.params.id,
  );
  if (!db.prepare("SELECT id FROM bulker_vehicles WHERE vehicle_plate=? LIMIT 1").get(vehicle_plate)) {
    db.prepare("INSERT INTO bulker_vehicles (vehicle_plate,driver_name,driver_phone) VALUES (?,?,?)")
      .run(vehicle_plate, driver_name, driver_phone || null);
  }
  const row = db.prepare(`${loadingOrderSelect} WHERE lo.id=?`).get(req.params.id) as LoadingOrder;
  res.json(row);
});

// ── PUT save loading invoice URL (driver uploads photo) ───────────────────
router.put("/loading-orders/:id/upload-invoice", (req, res) => {
  const { invoice_url, net_weight } = req.body as { invoice_url: string; net_weight?: string };
  if (!invoice_url) return void res.status(400).json({ error: "invoice_url مطلوب" });
  const lo = db.prepare("SELECT id, status FROM loading_orders WHERE id=?").get(req.params.id) as { id: number; status: string } | undefined;
  if (!lo) return void res.status(404).json({ error: "أمر التحميل غير موجود" });
  if (lo.status === "confirmed") return void res.status(409).json({ error: "الأمر مكتمل بالفعل" });
  db.prepare("UPDATE loading_orders SET loading_invoice_url=?, net_weight=COALESCE(?,net_weight) WHERE id=?")
    .run(invoice_url, net_weight || null, req.params.id);
  res.json({ ok: true });
});

// ── POST extract net weight from the loading invoice photo via AI vision ──
router.post("/loading-orders/:id/extract-net-weight", async (req, res) => {
  if (!AI_BASE_URL || !AI_API_KEY)
    return void res.status(503).json({ error: "خدمة الذكاء الاصطناعي غير متاحة حالياً" });

  const lo = db.prepare("SELECT id, status, loading_invoice_url FROM loading_orders WHERE id=?")
    .get(req.params.id) as { id: number; status: string; loading_invoice_url: string | null } | undefined;
  if (!lo) return void res.status(404).json({ error: "أمر التحميل غير موجود" });
  if (lo.status === "confirmed") return void res.status(409).json({ error: "الأمر مكتمل بالفعل" });
  if (!lo.loading_invoice_url) return void res.status(400).json({ error: "لا توجد فاتورة تحميل مرفوعة" });

  try {
    const objectPath = lo.loading_invoice_url.replace(/^\/api\/storage/, "");
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const downloadRes = await objectStorageService.downloadObject(file);
    const contentType = downloadRes.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return void res.json({ found: false, net_weight: null, reason: "الفاتورة ليست صورة (PDF) — يُرجى كتابة الوزن يدوياً" });
    }
    const arrayBuffer = await downloadRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const aiRes = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_completion_tokens: 64,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "هذه صورة فاتورة تحميل أسمنت/بضاعة. استخرج فقط قيمة \"الوزن الصافي\" (Net Weight) المكتوبة في الفاتورة، مع وحدة القياس إن وجدت (مثل كجم أو طن). أجب بالقيمة فقط بدون أي شرح إضافي. إذا لم تجد وزناً صافياً واضحاً في الصورة، أجب بكلمة واحدة فقط: غير_موجود",
              },
              { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      req.log.error({ status: aiRes.status }, "extract-net-weight: AI request failed");
      return void res.status(502).json({ error: "فشل الاتصال بخدمة قراءة الفاتورة" });
    }

    const data = await aiRes.json() as { choices: { message: { content: string } }[] };
    const raw = (data.choices?.[0]?.message?.content || "").trim();
    const notFound = !raw || raw.includes("غير_موجود") || raw.includes("غير موجود") || !/\d/.test(raw);

    if (notFound) {
      return void res.json({ found: false, net_weight: null });
    }

    db.prepare("UPDATE loading_orders SET net_weight=? WHERE id=?").run(raw, req.params.id);
    res.json({ found: true, net_weight: raw });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return void res.status(404).json({ error: "ملف الفاتورة غير موجود" });
    }
    req.log.error({ err: error }, "extract-net-weight failed");
    res.status(500).json({ error: "فشل استخراج الوزن الصافي من الفاتورة" });
  }
});

// ── PUT save/update net weight only (driver types it in) ──────────────────
router.put("/loading-orders/:id/net-weight", (req, res) => {
  const { net_weight } = req.body as { net_weight: string };
  const lo = db.prepare("SELECT id, status FROM loading_orders WHERE id=?").get(req.params.id) as { id: number; status: string } | undefined;
  if (!lo) return void res.status(404).json({ error: "أمر التحميل غير موجود" });
  if (lo.status === "confirmed") return void res.status(409).json({ error: "الأمر مكتمل بالفعل" });
  db.prepare("UPDATE loading_orders SET net_weight=? WHERE id=?").run(net_weight || null, req.params.id);
  res.json({ ok: true });
});

// ── PUT confirm loading (driver confirms → status: pending → loaded) ───────
router.put("/loading-orders/:id/confirm-loading", (req, res) => {
  const lo = db.prepare("SELECT * FROM loading_orders WHERE id=?").get(req.params.id) as LoadingOrder | undefined;
  if (!lo) return void res.status(404).json({ error: "أمر التحميل غير موجود" });
  if (lo.status !== "pending") return void res.status(409).json({ error: "الأمر ليس في حالة انتظار" });
  if (!lo.loading_invoice_url) return void res.status(400).json({ error: "يجب رفع فاتورة التحميل أولاً" });
  db.prepare("UPDATE loading_orders SET status='loaded' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── PUT confirm unloading ─────────────────────────────────────────────────
router.put("/loading-orders/:id/confirm", (req, res) => {
  const lo = db.prepare("SELECT * FROM loading_orders WHERE id=?").get(req.params.id) as LoadingOrder | undefined;
  if (!lo) return void res.status(404).json({ error: "أمر التحميل غير موجود" });
  if (lo.status !== "loaded") return void res.status(409).json({ error: "يجب تأكيد التحميل أولاً قبل تأكيد التنزيل" });
  if (!lo.unload_location?.trim()) return void res.status(400).json({ error: "حدد موقع التنزيل أولاً" });

  const hasTariffSnapshot = lo.tariff_loading_place != null && lo.tariff_unloading_place != null;
  const tariff = hasTariffSnapshot
    ? { loading_place: lo.tariff_loading_place!, unloading_place: lo.tariff_unloading_place!,
        driver_expense: lo.tariff_bonus || 0, rental: lo.tariff_rental_per_ton || 0,
        vehicle_type: "بلكر" }
    : lo.tariff_id ? getBulkerTariff(lo.tariff_id, lo.cargo_type) : null;
  if (lo.tariff_id && !tariff) return void res.status(409).json({ error: "التعريفة المختارة غير متاحة؛ يرجى تحديث الأمر" });
  if (lo.unload_location?.trim() && !tariff) {
    return void res.status(409).json({ error: "يلزم اختيار تعريفة معتمدة قبل تأكيد تنزيل هذا الأمر" });
  }
  const tons = weightInTons(lo.net_weight);
  if (tariff && (!lo.loading_invoice_url || tons === null)) {
    return void res.status(400).json({ error: "يجب رفع فاتورة التحميل وتسجيل وزن صافٍ صحيح قبل التنزيل" });
  }
  const rental = Math.round((tariff?.rental || 0) * (tons || 0) * 100) / 100;
  const bonus = tariff?.driver_expense || 0;
  try {
    const saved = db.transaction(() => {
      const updated = db.prepare("UPDATE loading_orders SET status='confirmed', confirmed_at=datetime('now') WHERE id=? AND status='loaded'").run(lo.id);
      if (!updated.changes) throw new Error("تم تأكيد الأمر بالفعل");
      const fvTrailer = (db.prepare("SELECT linked_trailer_number FROM fleet_vehicles WHERE plate_number=? LIMIT 1")
        .get(lo.vehicle_plate) as { linked_trailer_number: string | null } | undefined)?.linked_trailer_number || null;
      const notes = [`بلكر #${lo.id}`, `موقع التنزيل: ${lo.unload_location}`, lo.permit_number && `فسح: ${lo.permit_number}`, lo.notes].filter(Boolean).join(" | ");
      const trip = db.prepare(`
        INSERT INTO trips
          (date, car_id, driver_name, driver_phone, material_type, destination,
           trips_count, unit_price, meter_ton, return_value_no_vat, total_amount,
           vat, net_amount, route_bonus, tariff_driver_expense_snapshot, loading_region, unloading_region,
           vehicle_type, notes, trailer_number, permit_image_url, image_url)
         VALUES (date('now','localtime'),?,?,?,?,?,1,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?)
      `).run(
        lo.vehicle_plate, lo.driver_name, lo.driver_phone, lo.cargo_type, lo.unload_location,
        tariff?.rental || 0, tons || 0, rental, rental, Math.round((rental - bonus) * 100) / 100,
        bonus, tariff?.driver_expense ?? null, tariff?.loading_place || null, tariff?.unloading_place || null,
        tariff?.vehicle_type || "بلكر", notes || null, fvTrailer,
        lo.attachment_url ? `/api/storage${lo.attachment_url}`.replace(/\/api\/storage\/api\/storage/, "/api/storage") : null,
        lo.loading_invoice_url,
      );
      db.prepare("UPDATE fleet_vehicles SET status='available' WHERE plate_number=?").run(lo.vehicle_plate);
      return trip.lastInsertRowid;
    })();
    res.json({ message: "تم تأكيد التنزيل وتسجيل الرحلة", trip_id: saved });
  } catch (error) {
    req.log.error({ err: error, loadingOrderId: lo.id }, "Failed to confirm bulker unloading");
    res.status(500).json({ error: "تعذر تسجيل الرحلة؛ لم يُؤكد التنزيل. حاول مرة أخرى" });
  }
});

// ── BULK DELETE ───────────────────────────────────────────────────────────
router.delete("/loading-orders/bulk", (req, res) => {
  const { ids, force } = req.body as { ids: number[]; force?: boolean };
  if (!Array.isArray(ids) || ids.length === 0) return void res.status(400).json({ error: "ids مطلوبة" });
  const placeholders = ids.map(() => "?").join(",");
  const condition = force ? "" : " AND status != 'confirmed'";
  const result = db.prepare(`DELETE FROM loading_orders WHERE id IN (${placeholders})${condition}`).run(...ids);
  res.json({ deleted: result.changes });
});

// ── DELETE ────────────────────────────────────────────────────────────────
router.delete("/loading-orders/:id", (req, res) => {
  const lo = db.prepare("SELECT status FROM loading_orders WHERE id=?").get(req.params.id) as { status: string } | undefined;
  if (!lo) return void res.status(404).json({ error: "غير موجود" });
  db.prepare("DELETE FROM loading_orders WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
