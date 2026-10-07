import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import db from "../lib/db.js";
import { checkpointWAL } from "../lib/db.js";
import { uploadDbBackup, getDefaultDbPath } from "../lib/db-sync.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/* ── Column aliases: maps Arabic / English header variants → DB column name ── */
const TABLE_MAP: Record<string, {
  insert: (rows: Record<string, unknown>[], importedBy: string) => { inserted: number; skipped: number; errors: string[] };
  columns: Record<string, string[]>; /* dbCol → [aliases] */
  hint: string;
}> = {

  fleet_vehicles: {
    hint: "رقم اللوحة — نوع السيارة — السائق — هاتف السائق — الحالة — ملاحظات",
    columns: {
      plate_number: ["رقم اللوحة","اللوحة","لوحة السيارة","plate_number","plate","رقم السيارة","اللوحة"],
      vehicle_type: ["نوع المركبة","نوع السيارة","النوع","vehicle_type","type","نوع"],
      driver_name:  ["اسم السائق","السائق","driver_name","driver"],
      driver_phone: ["هاتف السائق","رقم السائق","جوال السائق","driver_phone"],
      status:       ["الحالة","status"],
      notes:        ["ملاحظات","notes","بيانات"],
    },
    insert(rows, importedBy) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO fleet_vehicles (plate_number, vehicle_type, driver_name, driver_phone, status, notes)
        VALUES (?,?,?,?,?,?)
      `);
      let inserted = 0, skipped = 0;
      const errors: string[] = [];
      for (const r of rows) {
        const plate = String(r.plate_number || "").trim();
        if (!plate) { skipped++; continue; }
        try {
          const res = stmt.run(
            plate,
            r.vehicle_type || null,
            r.driver_name  || null,
            r.driver_phone || null,
            r.status       || "available",
            r.notes        || importedBy ? `مستورد بواسطة ${importedBy}` : null,
          );
          res.changes > 0 ? inserted++ : skipped++;
        } catch (e) { errors.push(`${plate}: ${(e as Error).message}`); }
      }
      return { inserted, skipped, errors };
    },
  },

  purchase_invoices: {
    hint: "م — التاريخ — الفرع — رقم السيارة — رقم الفاتورة — المورد — الصنف — السعر قبل الضريبة — الكمية — السعر بعد الضريبة — ملاحظات",
    columns: {
      serial_no:        ["م","رقم","serial_no","serial","تسلسل","#"],
      invoice_date:     ["التاريخ","تاريخ الفاتورة","invoice_date","date","التاريخ"],
      branch:           ["الفرع","branch"],
      vehicle_plate:    ["رقم السيارة","السيارة","اللوحة","vehicle_plate","سيارة"],
      invoice_number:   ["رقم الفاتورة","invoice_number","invoice_no","الفاتورة","رقم فاتورة"],
      supplier_name:    ["المورد","اسم المورد","supplier_name","supplier","مورد"],
      item_name:        ["الصنف","اسم الصنف","المادة","البند","item_name","item","صنف","المنتج"],
      price_before_vat: ["السعر قبل الضريبة","سعر الوحدة","السعر","price_before_vat","unit_price","سعر"],
      quantity:         ["الكمية","quantity","qty","كمية"],
      price_after_vat:  ["السعر بعد الضريبة","الإجمالي","المجموع","price_after_vat","total","إجمالي"],
      notes:            ["ملاحظات","notes","ملاحظة"],
    },
    insert(rows, importedBy) {
      const stmt = db.prepare(`
        INSERT INTO purchase_invoices
          (serial_no, invoice_date, branch, vehicle_plate, invoice_number, supplier_name,
           item_name, price_before_vat, quantity, price_after_vat, notes, imported_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      let inserted = 0, skipped = 0;
      const errors: string[] = [];
      for (const r of rows) {
        const item = String(r.item_name || "").trim();
        if (!item) { skipped++; continue; }
        try {
          stmt.run(
            r.serial_no        || null,
            r.invoice_date     || null,
            r.branch           || null,
            r.vehicle_plate    || null,
            r.invoice_number   || null,
            r.supplier_name    || null,
            item,
            Number(r.price_before_vat) || 0,
            Number(r.quantity)         || 0,
            Number(r.price_after_vat)  || 0,
            r.notes            || null,
            importedBy,
          );
          inserted++;
        } catch (e) { errors.push(`${item}: ${(e as Error).message}`); }
      }
      return { inserted, skipped, errors };
    },
  },

  workshop_inventory: {
    hint: "اسم القطعة — الكود — التصنيف — الكمية — الوحدة — الحد الأدنى — التكلفة — المورد",
    columns: {
      item_name:     ["اسم القطعة","القطعة","الصنف","item_name","name","قطعة"],
      item_code:     ["الكود","رقم القطعة","رمز القطعة","item_code","code"],
      category:      ["التصنيف","الفئة","category","تصنيف"],
      quantity:      ["الكمية","المخزون","quantity","qty","كمية"],
      unit:          ["الوحدة","unit"],
      min_stock:     ["الحد الأدنى","حد أدنى","min_stock"],
      cost_per_unit: ["التكلفة","السعر","سعر الوحدة","cost_per_unit","price","تكلفة"],
      supplier:      ["المورد","المصدر","supplier"],
    },
    insert(rows, importedBy) {
      const actor = importedBy || null;
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO workshop_inventory
          (item_name, item_code, category, quantity, unit, min_stock, cost_per_unit, supplier, updated_by)
        VALUES (?,?,?,?,?,?,?,?,?)
      `);
      const updateStmt = db.prepare(`
        UPDATE workshop_inventory SET quantity=quantity+?, last_updated=datetime('now'), updated_by=? WHERE item_name=?
      `);
      let inserted = 0, skipped = 0;
      const errors: string[] = [];
      for (const r of rows) {
        const name = String(r.item_name || "").trim();
        if (!name) { skipped++; continue; }
        try {
          const res = stmt.run(
            name,
            r.item_code     || null,
            r.category      || "عام",
            Number(r.quantity)      || 0,
            r.unit          || "قطعة",
            Number(r.min_stock)     || 0,
            Number(r.cost_per_unit) || 0,
            r.supplier      || null,
            actor,
          );
          if (res.changes > 0) {
            inserted++;
          } else {
            /* item exists — add quantity */
            if (Number(r.quantity) > 0) {
              updateStmt.run(Number(r.quantity), actor, name);
            }
            skipped++;
          }
        } catch (e) { errors.push(`${name}: ${(e as Error).message}`); }
      }
      return { inserted, skipped, errors };
    },
  },

  trips: {
    hint: "التاريخ — رقم السيارة — السائق — العميل — المادة — الوجهة — عدد الرحلات — سعر الوحدة — الإجمالي — الصافي",
    columns: {
      date:         ["التاريخ","date","تاريخ"],
      car_id:       ["رقم السيارة","السيارة","اللوحة","car_id","plate","لوحة"],
      driver_name:  ["السائق","اسم السائق","driver_name","driver"],
      client_name:  ["العميل","الزبون","client_name","client"],
      material_type:["المادة","النوع","material_type","material","نوع المادة"],
      destination:  ["الوجهة","destination","وجهة"],
      trips_count:  ["عدد الرحلات","الرحلات","trips_count","trips"],
      unit_price:   ["سعر الوحدة","البونص","unit_price","price"],
      total_amount: ["الإجمالي","المجموع","total_amount","total","مجموع"],
      net_amount:   ["الصافي","net_amount","net","صافي"],
    },
    insert(rows, _importedBy) {
      // Pre-fetch trailer snapshots for all unique plates
      const uniquePlates = [...new Set(rows.map(r => String(r.car_id || "").trim()).filter(Boolean))];
      const trailerMap = new Map<string, string | null>();
      if (uniquePlates.length > 0) {
        const ph = uniquePlates.map(() => "?").join(",");
        const fvRows = db.prepare(
          `SELECT plate_number, linked_trailer_number FROM fleet_vehicles WHERE plate_number IN (${ph})`
        ).all(...uniquePlates) as { plate_number: string; linked_trailer_number: string | null }[];
        for (const fv of fvRows) trailerMap.set(fv.plate_number, fv.linked_trailer_number || null);
      }
      const stmt = db.prepare(`
        INSERT INTO trips (date, car_id, driver_name, driver_phone, client_name, material_type, destination,
                           trips_count, unit_price, total_amount, net_amount, trailer_number)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      let inserted = 0, skipped = 0;
      const errors: string[] = [];
      for (const r of rows) {
        const carId = String(r.car_id || "").trim();
        const date  = String(r.date   || "").trim();
        if (!carId || !date) { skipped++; continue; }
        try {
          const driverName = String(r.driver_name || "").trim();
          const profile = db.prepare(`
            SELECT phone FROM driver_profiles
            WHERE (driver_name=? AND ? != '') OR vehicle_plate=?
            LIMIT 1
          `).get(driverName, driverName, carId) as { phone: string | null } | undefined;
          stmt.run(
            date, carId,
            driverName || null,
            profile?.phone || null,
            r.client_name   || null,
            r.material_type || null,
            r.destination   || null,
            Number(r.trips_count)  || 1,
            Number(r.unit_price)   || 0,
            Number(r.total_amount) || 0,
            Number(r.net_amount)   || 0,
            trailerMap.get(carId) ?? null,
          );
          inserted++;
        } catch (e) { errors.push(`${date}/${carId}: ${(e as Error).message}`); }
      }
      return { inserted, skipped, errors };
    },
  },

  maintenance_logs: {
    hint: "رقم البطاقة — تاريخ الصيانة — رقم السيارة — السائق — الفرع — نوع الصيانة — الوصف — المبلغ",
    columns: {
      card_number:       ["رقم البطاقة","البطاقة","card_number","بطاقة"],
      maintenance_date:  ["تاريخ الصيانة","التاريخ","maintenance_date","date"],
      vehicle_plate:     ["رقم السيارة","السيارة","اللوحة","vehicle_plate","plate"],
      driver_name:       ["السائق","driver_name","driver","اسم السائق"],
      branch:            ["الفرع","branch"],
      maintenance_type:  ["نوع الصيانة","maintenance_type","type","النوع"],
      description:       ["الوصف","البيان","description","وصف"],
      amount:            ["المبلغ","التكلفة","amount","مبلغ","تكلفة"],
    },
    insert(rows, importedBy) {
      const stmt = db.prepare(`
        INSERT INTO maintenance_logs
          (card_number, maintenance_date, vehicle_plate, driver_name, branch,
           maintenance_type, description, amount, imported_by)
        VALUES (?,?,?,?,?,?,?,?,?)
      `);
      let inserted = 0, skipped = 0;
      const errors: string[] = [];
      for (const r of rows) {
        const plate = String(r.vehicle_plate || "").trim();
        const date  = String(r.maintenance_date || "").trim();
        if (!plate && !date) { skipped++; continue; }
        try {
          stmt.run(
            r.card_number      || null,
            date               || null,
            plate              || null,
            r.driver_name      || null,
            r.branch           || null,
            r.maintenance_type || null,
            r.description      || null,
            Number(r.amount)   || 0,
            importedBy,
          );
          inserted++;
        } catch (e) { errors.push(`${date}/${plate}: ${(e as Error).message}`); }
      }
      return { inserted, skipped, errors };
    },
  },
};

/* ── Normalize header: lowercase + trim + remove diacritics ── */
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase()
    .replace(/[\u064B-\u065F]/g, "")  /* Arabic diacritics */
    .replace(/\s+/g, " ");
}

/* ── Map Excel column headers → DB column names ── */
function mapColumns(
  headers: string[],
  colDefs: Record<string, string[]>
): Record<number, string> {
  const map: Record<number, string> = {};
  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    for (const [dbCol, aliases] of Object.entries(colDefs)) {
      if (aliases.some(a => normalizeHeader(a) === norm)) {
        map[idx] = dbCol;
        break;
      }
    }
  });
  return map;
}

/* ── POST /api/admin/excel-import ── */
router.post("/admin/excel-import", upload.single("file"), async (req, res) => {
  const { table } = req.body as { table: string };
  const file = req.file;

  if (!file) return void res.status(400).json({ error: "لم يتم رفع ملف" });
  if (!table || !TABLE_MAP[table]) {
    return void res.status(400).json({ error: "اسم الجدول غير صحيح", supported: Object.keys(TABLE_MAP) });
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
  } catch {
    return void res.status(400).json({ error: "ملف Excel غير صالح" });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (jsonRows.length === 0) {
    return void res.status(400).json({ error: "الملف فارغ أو لا يحتوي على بيانات" });
  }

  /* Auto-map headers */
  const headers = Object.keys(jsonRows[0]);
  const colDefs = TABLE_MAP[table].columns;
  const colMap  = mapColumns(headers, colDefs);

  /* Build normalized rows */
  const rows: Record<string, unknown>[] = jsonRows.map(r => {
    const out: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const dbCol = colMap[idx];
      if (dbCol) {
        let val = r[h];
        /* Excel dates come as Date objects */
        if (val instanceof Date) {
          val = val.toISOString().slice(0, 10);
        }
        out[dbCol] = val;
      }
    });
    return out;
  });

  const importedBy = (req as unknown as Record<string, unknown>).userPhone as string || "excel_import";
  const { inserted, skipped, errors } = TABLE_MAP[table].insert(rows, importedBy);

  // Trigger an immediate backup after every successful import so the data
  // is safely stored in object storage right away (not just at the next
  // 30-second periodic tick).
  if (inserted > 0) {
    uploadDbBackup(getDefaultDbPath(), checkpointWAL).catch(() => {});
  }

  res.json({
    total: jsonRows.length,
    inserted,
    skipped,
    errors: errors.slice(0, 20),
    mappedColumns: Object.entries(colMap).map(([idx, dbCol]) => ({ header: headers[Number(idx)], dbCol })),
  });
});

/* ── GET /api/admin/excel-tables — list supported tables ── */
router.get("/admin/excel-tables", (_req, res) => {
  res.json(
    Object.entries(TABLE_MAP).map(([key, val]) => ({ key, hint: val.hint, columns: Object.keys(val.columns) }))
  );
});

export default router;
