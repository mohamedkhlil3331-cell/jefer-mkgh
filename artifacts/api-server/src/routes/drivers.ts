import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { execute, queryAll, queryOne } from "../lib/erp-sql.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /drivers/ghost — names in ops tables not registered in driver_profiles or aliases
router.get("/drivers/ghost", async (_req, res) => {
  const rows = await queryAll(`
    SELECT
      name,
      SUM(in_trips)      AS in_trips,
      SUM(in_orders)     AS in_orders,
      SUM(in_breakdowns) AS in_breakdowns
    FROM (
      SELECT driver_name AS name,
             COUNT(*) AS in_trips, 0 AS in_orders, 0 AS in_breakdowns
      FROM trips
      WHERE driver_name IS NOT NULL AND driver_name != ''
      GROUP BY driver_name
      UNION ALL
      SELECT driver_name AS name,
             0 AS in_trips, COUNT(*) AS in_orders, 0 AS in_breakdowns
      FROM workflow_orders
      WHERE driver_name IS NOT NULL AND driver_name != ''
      GROUP BY driver_name
      UNION ALL
      SELECT driver_name AS name,
             0 AS in_trips, 0 AS in_orders, COUNT(*) AS in_breakdowns
      FROM breakdown_reports
      WHERE driver_name IS NOT NULL AND driver_name != ''
      GROUP BY driver_name
    ) combined
    WHERE name NOT IN (SELECT driver_name FROM driver_profiles WHERE driver_name IS NOT NULL)
      AND name NOT IN (SELECT alias_name FROM driver_aliases)
    GROUP BY name
    ORDER BY (SUM(in_trips)+SUM(in_orders)+SUM(in_breakdowns)) DESC
  `);
  res.json(rows);
});

// GET /drivers/aliases — all aliases with linked driver info
router.get("/drivers/aliases", async (_req, res) => {
  const rows = await queryAll(`
    SELECT da.*, dp.driver_name AS real_name
    FROM driver_aliases da
    JOIN driver_profiles dp ON dp.id = da.driver_id
    ORDER BY da.alias_name
  `);
  res.json(rows);
});

// POST /drivers/:id/alias — add an alias name for a driver
// Optional body field: rename (boolean) — if true, rename all records in ops tables
router.post("/drivers/:id/alias", async (req, res) => {
  const { alias_name, rename } = req.body as { alias_name?: string; rename?: boolean };
  if (!alias_name?.trim()) return void res.status(400).json({ error: "اسم الاسم المستعار مطلوب" });

  const driver = await queryOne<{ id: number; driver_name: string }>(
    "SELECT id, driver_name FROM driver_profiles WHERE id=?",
    req.params.id,
  );
  if (!driver) return void res.status(404).json({ error: "السائق غير موجود" });

  const aliasClean = alias_name.trim();
  try {
    await execute("INSERT INTO driver_aliases (alias_name, driver_id) VALUES (?,?)", aliasClean, req.params.id);
  } catch {
    return void res.status(409).json({ error: "هذا الاسم مرتبط بالفعل" });
  }

  const renamed = { orders: 0, trips: 0, breakdowns: 0 };
  if (rename) {
    const canonical = driver.driver_name;
    renamed.orders = (await execute("UPDATE workflow_orders SET driver_name=? WHERE driver_name=?", canonical, aliasClean)).changes;
    renamed.trips = (await execute("UPDATE trips SET driver_name=? WHERE driver_name=?", canonical, aliasClean)).changes;
    renamed.breakdowns = (await execute("UPDATE breakdown_reports SET driver_name=? WHERE driver_name=?", canonical, aliasClean)).changes;
  }

  res.status(201).json({ message: "تم إضافة الاسم المستعار", renamed });
});

// DELETE /drivers/aliases/:id — remove an alias
router.delete("/drivers/aliases/:id", async (req, res) => {
  await execute("DELETE FROM driver_aliases WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

// GET /drivers — include linked user info + revenue rank from trips
router.get("/drivers", async (_req, res) => {
  const rows = await queryAll(`
    SELECT dp.*, u.name AS user_name, u.phone AS user_phone_account, u.id AS user_id,
           COALESCE(rev.total_revenue, 0) AS total_revenue,
           COALESCE(rev.trips_count, 0)   AS trips_count
    FROM driver_profiles dp
    LEFT JOIN users u ON u.id = dp.user_id
    LEFT JOIN (
      SELECT driver_name,
             SUM(COALESCE(work_value, net_amount, 0)) AS total_revenue,
             COUNT(*) AS trips_count
      FROM trips
      WHERE driver_name IS NOT NULL AND driver_name != ''
      GROUP BY driver_name
    ) rev ON rev.driver_name = dp.driver_name
    ORDER BY total_revenue DESC, dp.driver_name
  `);
  res.json(rows);
});

// GET /drivers/stats
router.get("/drivers/stats", async (_req, res) => {
  const [totalRow, activeRow, onTripRow, recentOrders] = await Promise.all([
    queryOne<{ c: number }>("SELECT COUNT(*) as c FROM driver_profiles"),
    queryOne<{ c: number }>("SELECT COUNT(*) as c FROM driver_profiles WHERE status='نشط'"),
    queryOne<{ c: number }>(`
    SELECT COUNT(DISTINCT driver_phone) as c FROM workflow_orders WHERE stage='loaded'
    `),
    queryAll(`
    SELECT dp.driver_name, dp.vehicle_plate, wo.order_number, wo.delivery_location, wo.stage, wo.created_at
    FROM driver_profiles dp
    LEFT JOIN workflow_orders wo ON wo.driver_phone = dp.phone
    WHERE wo.id IS NOT NULL
    ORDER BY wo.created_at DESC LIMIT 6
    `),
  ]);
  res.json({ total: totalRow?.c || 0, active: activeRow?.c || 0, onTrip: onTripRow?.c || 0, noDoc: 0, recentOrders });
});

// GET /drivers/export-excel
router.get("/drivers/export-excel", async (_req, res) => {
  const rows = await queryAll<Record<string, unknown>>("SELECT * FROM driver_profiles ORDER BY driver_name");
  const data = rows.map(d => ({
    "اسم السائق":                  d.driver_name,
    "رقم الجوال":                   d.phone,
    "رقم السيارة":                  d.vehicle_plate,
    "الجهة":                        d.branch,
    "البريد الإلكتروني":            d.email,
    "الراتب (ريال)":                d.salary ?? 0,
    "الحالة":                       d.status,
    "تاريخ انتهاء الرخصة":          d.license_expiry,
    "تاريخ انتهاء بطاقة التشغيل":   d.operation_card_expiry,
    "ملاحظات":                      d.notes,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [22, 16, 14, 20, 26, 10, 22, 26, 20].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "السائقين");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="drivers.xlsx"`);
  res.send(buf);
});

// POST /drivers/import-excel
router.post("/drivers/import-excel", upload.single("file"), async (req, res) => {
  if (!req.file) return void res.status(400).json({ error: "لم يتم رفع الملف" });
  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

  let added = 0, updated = 0;

  for (const row of rows) {
    const name = String(row["اسم السائق"] ?? "").trim();
    if (!name) continue;
    const phone    = String(row["رقم الجوال"]  ?? "").trim() || null;
    const email    = String(row["البريد الإلكتروني"] ?? "").trim() || null;
    const status   = String(row["الحالة"]      ?? "").trim() || "نشط";
    const licExp   = String(row["تاريخ انتهاء الرخصة"] ?? "").trim() || null;
    const opExp    = String(row["تاريخ انتهاء بطاقة التشغيل"] ?? "").trim() || null;
    const notes    = String(row["ملاحظات"]     ?? "").trim() || null;

    const existing = await queryOne("SELECT id FROM driver_profiles WHERE driver_name=?", name);
    if (existing) {
      await execute(`
        UPDATE driver_profiles SET
          phone=COALESCE(?,phone), email=COALESCE(?,email), status=COALESCE(?,status),
          license_expiry=COALESCE(?,license_expiry), operation_card_expiry=COALESCE(?,operation_card_expiry),
          notes=COALESCE(?,notes)
        WHERE driver_name=?
      `, phone, email, status, licExp, opExp, notes, name);
      updated++;
    } else {
      await execute(
        "INSERT INTO driver_profiles (driver_name, phone, email, status, license_expiry, operation_card_expiry, notes) VALUES (?,?,?,?,?,?,?)",
        name, phone, email, status, licExp, opExp, notes,
      );
      added++;
    }
  }
  res.json({ added, updated, total: rows.length });
});

// POST /drivers
router.post("/drivers", async (req, res) => {
  const { driver_name, phone, email, status, notes, user_id,
          photo_url, license_url, operation_card_url, driver_card_url, insurance_url,
          license_expiry, operation_card_expiry, salary,
          fingerprint_url, signature_url,
          iqama_image_url, iqama_pdf_url, iqama_expiry,
          delegated_form_image_url, delegated_form_pdf_url, delegated_form_expiry,
          create_request_id } = req.body;
  if (!driver_name) return void res.status(400).json({ error: "اسم السائق مطلوب" });

  const createRequestId = typeof create_request_id === "string" ? create_request_id.trim() : "";
  if (createRequestId.length > 128) {
    return void res.status(400).json({ error: "معرّف الطلب غير صالح" });
  }
  if (createRequestId) {
    const previous = await queryOne<Record<string, unknown>>(
      "SELECT * FROM driver_profiles WHERE create_request_id=?",
      createRequestId,
    );
    if (previous) {
      res.status(200).json({ driver: previous, id: previous.id, user_id: previous.user_id, auto_created: false });
      return;
    }
  }

  // Auto-create a driver user account if phone provided and no existing user with that phone
  let resolvedUserId = user_id || null;
  let autoCreated = false;
  if (phone && !resolvedUserId) {
    const existing = await queryOne<{ id: number }>("SELECT id FROM users WHERE phone=?", phone);
    if (existing) {
      resolvedUserId = existing.id;
    } else {
      const u = await execute(
        "INSERT INTO users (name, phone, password, role, active, approval_status) VALUES (?,?,?,?,1,'approved')"
      , driver_name, phone, "123456", "driver");
      resolvedUserId = u.lastInsertRowid;
      autoCreated = true;
    }
  }

  let r;
  try {
    r = await execute(`
    INSERT INTO driver_profiles
      (vehicle_plate, driver_name, phone, branch, email, status, notes, user_id,
       photo_url, license_url, operation_card_url, driver_card_url, insurance_url,
       license_expiry, operation_card_expiry, salary,
       fingerprint_url, signature_url,
       iqama_image_url, iqama_pdf_url, iqama_expiry,
       delegated_form_image_url, delegated_form_pdf_url, delegated_form_expiry,
       create_request_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `,
    null, driver_name, phone||null, null,
    email||null, status||"نشط", notes||null, resolvedUserId,
    photo_url||null, license_url||null, operation_card_url||null,
    driver_card_url||null, insurance_url||null,
    license_expiry||null, operation_card_expiry||null,
    parseFloat(String(salary||0))||0,
    fingerprint_url||null, signature_url||null,
    iqama_image_url||null, iqama_pdf_url||null, iqama_expiry||null,
    delegated_form_image_url||null, delegated_form_pdf_url||null, delegated_form_expiry||null,
    createRequestId || null,
    );
  } catch (error) {
    if (createRequestId) {
      const previous = await queryOne<Record<string, unknown>>(
        "SELECT * FROM driver_profiles WHERE create_request_id=?",
        createRequestId,
      );
      if (previous) {
        res.status(200).json({ driver: previous, id: previous.id, user_id: previous.user_id, auto_created: false });
        return;
      }
    }
    throw error;
  }
  const driver = await queryOne("SELECT * FROM driver_profiles WHERE id=?", r.lastInsertRowid);
  res.status(201).json({ driver, id: r.lastInsertRowid, user_id: resolvedUserId, auto_created: autoCreated });
});

// PUT /drivers/:id
router.put("/drivers/:id", async (req, res) => {
  const { driver_name, phone, email, status, notes, user_id,
          photo_url, license_url, operation_card_url, driver_card_url, insurance_url,
          license_expiry, operation_card_expiry, salary,
          fingerprint_url, signature_url,
          iqama_image_url, iqama_pdf_url, iqama_expiry,
          delegated_form_image_url, delegated_form_pdf_url, delegated_form_expiry } = req.body;

  await execute(`
    UPDATE driver_profiles SET
      driver_name=?, phone=?, email=?, status=?, notes=?, user_id=?,
      photo_url=?, license_url=?, operation_card_url=?, driver_card_url=?, insurance_url=?,
      license_expiry=?, operation_card_expiry=?, salary=?,
      fingerprint_url=?, signature_url=?,
      iqama_image_url=?, iqama_pdf_url=?, iqama_expiry=?,
      delegated_form_image_url=?, delegated_form_pdf_url=?, delegated_form_expiry=?
    WHERE id=?
  `,
    driver_name, phone||null, email||null, status||"نشط", notes||null, user_id||null,
    photo_url||null, license_url||null, operation_card_url||null,
    driver_card_url||null, insurance_url||null,
    license_expiry||null, operation_card_expiry||null,
    parseFloat(String(salary||0))||0,
    fingerprint_url||null, signature_url||null,
    iqama_image_url||null, iqama_pdf_url||null, iqama_expiry||null,
    delegated_form_image_url||null, delegated_form_pdf_url||null, delegated_form_expiry||null,
    req.params.id,
  );

  const driver = await queryOne("SELECT * FROM driver_profiles WHERE id=?", req.params.id);
  if (!driver) {
    res.status(404).json({ error: "السائق غير موجود" });
    return;
  }
  res.json({ driver });
});

// PUT /drivers/:id/link-user — link or unlink a user account
router.put("/drivers/:id/link-user", async (req, res) => {
  const { user_id } = req.body;
  const driver = await queryOne<Record<string, unknown>>(
    "SELECT * FROM driver_profiles WHERE id=?",
    req.params.id,
  );
  if (!driver) return void res.status(404).json({ error: "السائق غير موجود" });

  if (user_id) {
    const user = await queryOne<Record<string, unknown>>("SELECT id,name,phone,role FROM users WHERE id=?", user_id);
    if (!user) return void res.status(404).json({ error: "المستخدم غير موجود" });
    if (user.role !== "driver") return void res.status(400).json({ error: "المستخدم ليس بدور سائق" });
  }

  await execute("UPDATE driver_profiles SET user_id=? WHERE id=?", user_id || null, req.params.id);
  res.json({ message: user_id ? "تم ربط الحساب بنجاح" : "تم إلغاء الربط" });
});

// DELETE /drivers/:id
router.delete("/drivers/:id", async (req, res) => {
  await execute("DELETE FROM driver_profiles WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
