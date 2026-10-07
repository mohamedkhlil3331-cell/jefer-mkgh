import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import {
  PasteSupplierPurchaseInvoicesBody,
  type SupplierPurchaseInvoicePasteResult,
  type SupplierPurchaseInvoicePasteSavedRow,
} from "@workspace/api-zod";
import db, { UPLOADS_PATH } from "../lib/db.js";
import { createJournalEntry } from "../lib/journal.js";
import { isSysAdminToken } from "./auth.js";
import path from "path";
import fs from "fs";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
    filename: (_req, file, cb) => cb(null, `reimb_${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

type SupplierClaimActor = { id: number; role: string; name: string };

function getSupplierClaimActor(req: Request): SupplierClaimActor | null {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token || token === "guest") return null;
  if (isSysAdminToken(token)) return { id: 0, role: "admin", name: "مدير النظام" };
  const actor = db.prepare(`
    SELECT u.id, u.role, u.name
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token=?
      AND datetime(s.expires_at)>datetime('now')
      AND s.rowid=(SELECT MAX(current.rowid) FROM sessions current WHERE current.user_id=s.user_id)
      AND u.active=1
    LIMIT 1
  `).get(token) as SupplierClaimActor | undefined;
  return actor || null;
}

function requireSupplierClaimActor(
  req: Request,
  res: Response,
  adminOnly = false,
): SupplierClaimActor | null {
  const actor = getSupplierClaimActor(req);
  if (!actor) {
    res.status(401).json({ error: "تسجيل الدخول مطلوب لتسجيل الطباعة" });
    return null;
  }
  if (adminOnly && actor.role !== "admin") {
    res.status(403).json({ error: "صلاحيات مدير النظام مطلوبة" });
    return null;
  }
  return actor;
}

// ══════════════════════════════════════════════════════════════════
//  WORKSHOP JOBS — أوامر العمل
// ══════════════════════════════════════════════════════════════════

router.get("/workshop-jobs", (req, res) => {
  const { vehicle_plate } = req.query as Record<string, string>;
  let sql = `
    SELECT wj.*, br.breakdown_type, br.driver_name, br.driver_phone
    FROM workshop_jobs wj
    LEFT JOIN breakdown_reports br ON wj.breakdown_report_id = br.id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (vehicle_plate) { sql += " AND wj.vehicle_plate = ?"; params.push(vehicle_plate); }
  sql += " ORDER BY wj.created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

// Vehicle dashboard — all data for a specific car in one call
router.get("/vehicle-dashboard/:plate", (req, res) => {
  const plate = req.params.plate;
  const vehicle = db.prepare("SELECT * FROM fleet_vehicles WHERE plate_number=?").get(plate);
  const expenses = db.prepare(
    "SELECT * FROM fleet_expenses WHERE car_id=? ORDER BY date DESC LIMIT 100"
  ).all(plate);
  const jobs = db.prepare(`
    SELECT wj.*, br.breakdown_type FROM workshop_jobs wj
    LEFT JOIN breakdown_reports br ON wj.breakdown_report_id = br.id
    WHERE wj.vehicle_plate=? ORDER BY wj.created_at DESC LIMIT 50
  `).all(plate);
  const breakdowns = db.prepare(
    "SELECT * FROM breakdown_reports WHERE vehicle_plate=? ORDER BY created_at DESC LIMIT 50"
  ).all(plate);
  const trips = db.prepare(
    "SELECT * FROM trips WHERE car_id=? ORDER BY date DESC LIMIT 50"
  ).all(plate);
  const totalExpenses = (expenses as {amount:number}[]).reduce((s,e) => s + e.amount, 0);
  const totalJobs = (jobs as {total_cost:number}[]).reduce((s,j) => s + (j.total_cost||0), 0);

  // Linked driver
  const linked_driver = db.prepare(
    "SELECT id, name, phone FROM users WHERE vehicle_plate=? AND role='driver' LIMIT 1"
  ).get(plate);

  // Active workflow orders on this vehicle
  const active_orders = db.prepare(
    "SELECT * FROM workflow_orders WHERE vehicle_plate=? AND stage IN ('vehicle_assigned','invoiced','loaded','delivered') ORDER BY created_at DESC LIMIT 10"
  ).all(plate);

  res.json({ vehicle, expenses, jobs, breakdowns, trips, totalExpenses, totalJobs, linked_driver, active_orders });
});

router.post("/workshop-jobs", (req, res) => {
  const {
    vehicle_plate, breakdown_report_id, title, job_type, description,
    parts_used, labor_cost, parts_cost, invoice_target, created_by, notes,
  } = req.body;
  if (!title) return void res.status(400).json({ error: "عنوان أمر العمل مطلوب" });

  const total = (Number(labor_cost) || 0) + (Number(parts_cost) || 0);
  const r = db.prepare(`
    INSERT INTO workshop_jobs
      (vehicle_plate, breakdown_report_id, title, job_type, description,
       parts_used, labor_cost, parts_cost, total_cost, invoice_target, created_by, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    vehicle_plate || null,
    breakdown_report_id || null,
    title,
    job_type || "صيانة_مباشرة",
    description || null,
    parts_used || null,
    Number(labor_cost) || 0,
    Number(parts_cost) || 0,
    total,
    invoice_target || "vehicle",
    created_by || null,
    notes || null,
  );

  // If this job is linked to a breakdown report, auto-resolve it
  if (breakdown_report_id) {
    db.prepare(`
      UPDATE breakdown_reports SET status='resolved', resolved_by=?, resolve_notes=?, resolved_at=datetime('now')
      WHERE id=? AND status='open'
    `).run(created_by || "مدير الورشة", `تم إنشاء أمر عمل: ${title}`, breakdown_report_id);
  }

  // If invoice_target = 'inventory', deduct from workshop inventory and log
  if (invoice_target === "inventory" && parts_used) {
    try {
      const parts = JSON.parse(parts_used);
      for (const p of parts) {
        if (p.inventory_id && p.qty) {
          const invItem = db.prepare("SELECT item_name FROM workshop_inventory WHERE id=?").get(p.inventory_id) as { item_name: string } | undefined;
          db.prepare(`
            UPDATE workshop_inventory SET quantity = quantity - ?, last_updated = datetime('now'), updated_by=?
            WHERE id = ?
          `).run(Number(p.qty), created_by || null, p.inventory_id);
          if (invItem) {
            logInventoryTransaction(Number(p.inventory_id), invItem.item_name, "out", Number(p.qty),
              "صرف_أمر_عمل", `أمر_عمل_#${r.lastInsertRowid}`, created_by, undefined, vehicle_plate || undefined);
            checkLowStock(Number(p.inventory_id));
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  res.json({ id: r.lastInsertRowid });
});

router.put("/workshop-jobs/:id/complete", (req, res) => {
  const { notes, labor_cost, parts_cost, created_by } = req.body;
  const job = db.prepare("SELECT * FROM workshop_jobs WHERE id=?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!job) return void res.status(404).json({ error: "أمر العمل غير موجود" });

  const lc = labor_cost !== undefined ? Number(labor_cost) : Number(job.labor_cost);
  const pc = parts_cost !== undefined ? Number(parts_cost) : Number(job.parts_cost);
  const total = lc + pc;
  const isInventory = job.invoice_target === "inventory";

  db.transaction(() => {
    db.prepare(`
      UPDATE workshop_jobs SET status='done', notes=?, labor_cost=?, parts_cost=?, total_cost=?, completed_at=datetime('now')
      WHERE id=?
    `).run(notes || job.notes || null, lc, pc, total, req.params.id);

    // ── Journal Entry: Close work order ────────────────────────────────────
    if (total > 0) {
      createJournalEntry({
        reference_type: isInventory ? "job_inventory" : "job_external",
        reference_id: String(job.id),
        debit_account:  "5010",
        credit_account: isInventory ? "1040" : "2030",
        amount: total,
        description: `إغلاق أمر عمل #${job.id}: ${job.title} — ${job.vehicle_plate || ""}`,
        created_by: created_by || job.created_by as string || undefined,
      });
    }
  })();

  res.json({ ok: true });
});

router.put("/workshop-jobs/:id/status", (req, res) => {
  const { status } = req.body;
  if (!["open","in_progress","done"].includes(status))
    return void res.status(400).json({ error: "حالة غير صالحة" });
  db.prepare("UPDATE workshop_jobs SET status=? WHERE id=?").run(status, req.params.id);
  res.json({ ok: true });
});

router.delete("/workshop-jobs/:id", (req, res) => {
  db.prepare("DELETE FROM workshop_jobs WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
//  WORKSHOP INVENTORY — مخزون الورشة
// ══════════════════════════════════════════════════════════════════

// ── helper: log a movement and send low-stock alert if needed ──────────────
function logInventoryTransaction(
  itemId: number, itemName: string, type: "in" | "out",
  qty: number, reason: string, referenceNo?: string, createdBy?: string, costPerUnit?: number, vehicleNo?: string,
) {
  try {
    db.prepare(`
      INSERT INTO workshop_inventory_transactions (item_id, item_name, type, quantity, cost_per_unit, reason, reference_no, created_by, vehicle_no)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(itemId, itemName, type, qty, costPerUnit || 0, reason, referenceNo || null, createdBy || null, vehicleNo || null);
  } catch { /* non-fatal */ }
}

// Weighted average cost: new_avg = (old_qty*old_cost + in_qty*in_cost) / (old_qty + in_qty)
function updateWeightedCost(itemId: number, inQty: number, inCost: number, updatedBy?: string | null) {
  if (inCost <= 0) return;
  const item = db.prepare("SELECT quantity, cost_per_unit FROM workshop_inventory WHERE id=?").get(itemId) as { quantity: number; cost_per_unit: number } | undefined;
  if (!item) return;
  const oldQty  = Number(item.quantity);
  const oldCost = Number(item.cost_per_unit);
  const totalQty = oldQty + inQty;
  const newCost  = totalQty > 0 ? (oldQty * oldCost + inQty * inCost) / totalQty : inCost;
  db.prepare("UPDATE workshop_inventory SET cost_per_unit=?, last_updated=datetime('now'), updated_by=COALESCE(?, updated_by) WHERE id=?").run(newCost, updatedBy ?? null, itemId);
}

function checkLowStock(itemId: number) {
  const item = db.prepare("SELECT * FROM workshop_inventory WHERE id=?").get(itemId) as Record<string,unknown> | undefined;
  if (!item) return;
  const qty = Number(item.quantity); const minStock = Number(item.min_stock);
  if (minStock > 0 && qty <= minStock) {
    const alertTitle = `⚠️ مخزون منخفض: ${item.item_name}`;
    const alertBody  = `الكمية الحالية ${qty} ${item.unit} وصلت للحد الأدنى (${minStock}). يرجى إنشاء طلب شراء.`;
    const roles = db.prepare("SELECT phone FROM users WHERE role IN ('workshop_manager','purchasing','admin') AND active=1").all() as { phone: string }[];
    const ins = db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)");
    roles.forEach(u => ins.run(u.phone, alertTitle, alertBody));
  }
}

router.get("/workshop-inventory", (_req, res) => {
  const items = db.prepare("SELECT * FROM workshop_inventory ORDER BY item_name ASC").all();
  res.json(items);
});

// ── transaction history ────────────────────────────────────────────────────
router.get("/workshop-inventory/transactions/counts", (_req, res) => {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN type='in'  THEN 1 ELSE 0 END) AS inCount,
      SUM(CASE WHEN type='out' THEN 1 ELSE 0 END) AS outCount
    FROM workshop_inventory_transactions
  `).get() as { inCount: number; outCount: number };
  res.json({ in: row.inCount ?? 0, out: row.outCount ?? 0 });
});

router.get("/workshop-inventory/transactions", (req, res) => {
  const { type, item_id, limit: lim } = req.query as Record<string, string>;
  let sql = `
    SELECT t.*, wi.item_code
    FROM workshop_inventory_transactions t
    LEFT JOIN workshop_inventory wi ON wi.id = t.item_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (type)    { sql += " AND t.type=?";    params.push(type); }
  if (item_id) { sql += " AND t.item_id=?"; params.push(Number(item_id)); }
  sql += " ORDER BY t.created_at DESC";
  if (lim) { sql += " LIMIT ?"; params.push(Number(lim)); }
  res.json(db.prepare(sql).all(...params));
});

router.post("/workshop-inventory", (req, res) => {
  const { item_name, item_code, category, quantity, unit, min_stock, cost_per_unit, supplier, created_by } = req.body;
  if (!item_name) return void res.status(400).json({ error: "اسم القطعة مطلوب" });

  try {
    const r = db.prepare(`
      INSERT INTO workshop_inventory (item_name, item_code, category, quantity, unit, min_stock, cost_per_unit, supplier, updated_by)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      item_name, item_code || null, category || "عام",
      Number(quantity) || 0, unit || "قطعة",
      Number(min_stock) || 0, Number(cost_per_unit) || 0, supplier || null, created_by || null,
    );
    const newId = Number(r.lastInsertRowid);
    if (Number(quantity) > 0) {
      logInventoryTransaction(newId, item_name, "in", Number(quantity), "رصيد_أولي", undefined, created_by);
    }
    res.json({ id: newId });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return void res.status(409).json({ error: `رقم الصنف "${item_code}" مستخدم مسبقاً — اختر رقماً مختلفاً` });
    }
    throw e;
  }
});

router.put("/workshop-inventory/:id", (req, res) => {
  const { item_name, item_code, category, quantity, unit, min_stock, cost_per_unit, supplier, updated_by } = req.body;
  const existing = db.prepare("SELECT * FROM workshop_inventory WHERE id=?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) return void res.status(404).json({ error: "القطعة غير موجودة" });

  const newQty      = quantity !== undefined ? Number(quantity) : Number(existing.quantity);
  const newMinStock = min_stock !== undefined ? Number(min_stock) : Number(existing.min_stock);
  const itemName    = item_name || String(existing.item_name);

  try {
    db.prepare(`
      UPDATE workshop_inventory
      SET item_name=?, item_code=?, category=?, quantity=?, unit=?, min_stock=?, cost_per_unit=?, supplier=?, last_updated=datetime('now'), updated_by=?
      WHERE id=?
    `).run(
      itemName,
      item_code !== undefined ? item_code : existing.item_code,
      category || existing.category,
      newQty,
      unit || existing.unit,
      newMinStock,
      cost_per_unit !== undefined ? Number(cost_per_unit) : existing.cost_per_unit,
      supplier !== undefined ? supplier : existing.supplier,
      updated_by || null,
      req.params.id,
    );
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return void res.status(409).json({ error: `رقم الصنف "${item_code}" مستخدم مسبقاً — اختر رقماً مختلفاً` });
    }
    throw e;
  }

  checkLowStock(Number(req.params.id));
  res.json({ ok: true });
});

// ── Bulk delete inventory items — must be BEFORE /:id or Express swallows it ──
router.delete("/workshop-inventory/bulk", (req, res) => {
  const { ids } = req.body as { ids?: unknown };
  if (!Array.isArray(ids) || ids.length === 0) return void res.status(400).json({ error: "ids مطلوبة" });
  const del = db.prepare("DELETE FROM workshop_inventory WHERE id=?");
  const run = db.transaction((list: number[]) => { for (const id of list) del.run(id); });
  run(ids.map(Number));
  res.json({ ok: true, deleted: ids.length });
});

router.delete("/workshop-inventory/:id", (req, res) => {
  db.prepare("DELETE FROM workshop_inventory WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Receive stock (وارد) ───────────────────────────────────────────────────
router.put("/workshop-inventory/:id/receive", (req, res) => {
  const { qty, cost_per_unit, purchase_request_id, created_by, reason } = req.body;
  if (!qty || Number(qty) <= 0) return void res.status(400).json({ error: "الكمية غير صالحة" });

  const item = db.prepare("SELECT * FROM workshop_inventory WHERE id=?").get(req.params.id) as Record<string,unknown> | undefined;
  if (!item) return void res.status(404).json({ error: "القطعة غير موجودة" });

  const inQty  = Number(qty);
  const inCost = Number(cost_per_unit) || 0;
  const refNo  = purchase_request_id ? `طلب_شراء_#${purchase_request_id}` : undefined;
  const purchaseRequest = purchase_request_id
    ? db.prepare("SELECT supplier FROM purchase_requests WHERE id=?").get(purchase_request_id) as { supplier?: string | null } | undefined
    : undefined;
  const supplierName = String(purchaseRequest?.supplier || "").trim();
  const receiveReason = reason || `فاتورة مشتريات${supplierName ? ` — ${supplierName}` : ""}`;
  const totalPartsCost = inQty * (inCost || Number(item.cost_per_unit) || 0);
  // Deterministic idempotency key: purchase_request_id (if present) guarantees uniqueness
  const journalRef = purchase_request_id
    ? `PR-${purchase_request_id}-item-${req.params.id}`
    : `INV-recv-${req.params.id}-${Date.now()}`;

  // Single transactional block: quantity update + cost + log + journal entry all commit or all roll back
  db.transaction(() => {
    db.prepare(`UPDATE workshop_inventory SET quantity = quantity + ?, last_updated = datetime('now'), updated_by=? WHERE id=?`).run(inQty, created_by || null, req.params.id);
    if (inCost > 0) updateWeightedCost(Number(req.params.id), inQty, inCost, created_by || null);

    logInventoryTransaction(Number(req.params.id), String(item.item_name), "in", inQty,
      receiveReason, refNo, created_by, inCost);

    // ── Journal Entry: Receive parts/inventory ──────────────────────────────
    if (totalPartsCost > 0) {
      createJournalEntry({
        reference_type: "purchase_receive",
        reference_id: journalRef,
        debit_account:  "1040",
        credit_account: "2030",
        amount: totalPartsCost,
        description: `استلام مخزون: ${item.item_name} (${inQty} وحدة)`,
        created_by: created_by || undefined,
      });
    }

    if (purchase_request_id) {
      db.prepare(`UPDATE purchase_requests SET status='received', received_at=datetime('now') WHERE id=?`).run(purchase_request_id);
    }
  })();

  res.json({ ok: true });
});

// ── Manual adjustment (تعديل يدوي وارد/منصرف) ─────────────────────────────
router.post("/workshop-inventory/:id/adjust", (req, res) => {
  const { type, qty, reason, created_by, reference_no, cost_per_unit, vehicle_no } = req.body as {
    type: "in" | "out"; qty: number; cost_per_unit?: number;
    reason?: string; created_by?: string; reference_no?: string; vehicle_no?: string;
  };
  if (!type || !["in","out"].includes(type)) return void res.status(400).json({ error: "نوع التعديل غير صالح" });
  if (!qty || Number(qty) <= 0) return void res.status(400).json({ error: "الكمية غير صالحة" });

  const item = db.prepare("SELECT * FROM workshop_inventory WHERE id=?").get(req.params.id) as Record<string,unknown> | undefined;
  if (!item) return void res.status(404).json({ error: "القطعة غير موجودة" });

  const inQty  = Number(qty);
  const inCost = Number(cost_per_unit) || 0;
  const delta  = type === "in" ? inQty : -inQty;

  db.prepare(`UPDATE workshop_inventory SET quantity = quantity + ?, last_updated = datetime('now'), updated_by=? WHERE id=?`).run(delta, created_by || null, req.params.id);
  if (type === "in" && inCost > 0) updateWeightedCost(Number(req.params.id), inQty, inCost, created_by || null);

  logInventoryTransaction(Number(req.params.id), String(item.item_name), type, inQty,
    reason || (type === "in" ? "إضافة_يدوية" : "صرف_يدوي"), reference_no, created_by, inCost, vehicle_no);

  if (type === "out") checkLowStock(Number(req.params.id));
  res.json({ ok: true });
});

// ── Export inventory as Excel ──────────────────────────────────────────────
router.get("/workshop-inventory/export", (_req, res) => {
  const items = db.prepare("SELECT * FROM workshop_inventory ORDER BY category, item_name").all() as Record<string, unknown>[];
  const rows = items.map(i => ({
    "الكود":       i.item_code || "",
    "اسم الصنف":   i.item_name,
    "الفئة":       i.category,
    "الكمية":      i.quantity,
    "الوحدة":      i.unit,
    "الحد الأدنى": i.min_stock,
    "سعر الوحدة":  i.cost_per_unit,
    "الإجمالي":    Number(i.quantity) * Number(i.cost_per_unit),
    "المورد":      i.supplier || "",
    "آخر تحديث":  i.last_updated,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
  ws["!dir"] = "RTL";
  XLSX.utils.book_append_sheet(wb, ws, "المخزون");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", `attachment; filename="workshop-inventory-${new Date().toISOString().slice(0,10)}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ── Export transactions as Excel ───────────────────────────────────────────
router.get("/workshop-inventory/transactions/export", (req, res) => {
  const { type } = req.query as Record<string, string>;
  let sql = `
    SELECT t.*, wi.item_code
    FROM workshop_inventory_transactions t
    LEFT JOIN workshop_inventory wi ON wi.id = t.item_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (type && ["in","out"].includes(type)) { sql += " AND t.type=?"; params.push(type); }
  sql += " ORDER BY t.created_at DESC";
  const txs = db.prepare(sql).all(...params) as Record<string, unknown>[];
  const rows = txs.map(t => ({
    "التاريخ":          t.created_at,
    "النوع":            t.type === "in" ? "وارد" : "منصرف",
    "رقم الصنف":        (() => { const c = String(t.item_code ?? ""); const n = Number(c); return c === "" ? "" : (!isNaN(n) ? String(Math.round(n)) : c); })(),
    "الصنف":            t.item_name,
    "الكمية":           Math.round(Number(t.quantity)),
    "سعر الوحدة":       Math.round(Number(t.cost_per_unit || 0)),
    "الإجمالي":         Math.round(Number(t.quantity) * Number(t.cost_per_unit || 0)),
    "السبب":            String(t.reason || "").replace(/_/g, " "),
    "رقم المرجع":       t.reference_no || "",
    "بواسطة":           t.created_by || "",
    "الجهة (السيارة)":  t.vehicle_no || "",
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!dir"] = "RTL";
  XLSX.utils.book_append_sheet(wb, ws, type === "in" ? "الوارد" : type === "out" ? "المنصرف" : "الحركات");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const label = type === "in" ? "in" : type === "out" ? "out" : "all";
  res.setHeader("Content-Disposition", `attachment; filename="inventory-txs-${label}-${new Date().toISOString().slice(0,10)}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ── Import inventory from Excel ────────────────────────────────────────────
router.post("/workshop-inventory/import", upload.single("file"), (req, res) => {
  if (!req.file) return void res.status(400).json({ error: "لم يُرفق ملف" });
  try {
    const wb   = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    if (!rows.length) return void res.status(400).json({ error: "الملف فارغ" });

    // Column aliases (Arabic headers from our export template)
    const g = (r: Record<string,unknown>, ...keys: string[]) => {
      for (const k of keys) { const v = r[k]; if (v !== undefined && v !== "") return v; }
      return undefined;
    };

    const inserted: string[] = []; const skipped: string[] = [];
    const importedBy = String(req.body?.created_by || "") || null;
    const ins = db.prepare(`
      INSERT INTO workshop_inventory (item_name, item_code, category, quantity, unit, min_stock, cost_per_unit, supplier, updated_by)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);

    const insertMany = db.transaction((rws: Record<string, unknown>[]) => {
      for (const r of rws) {
        const name = String(g(r, "اسم الصنف", "item_name", "Name") ?? "").trim();
        if (!name) { skipped.push("صف بدون اسم"); continue; }
        const qty  = Number(g(r, "الكمية", "quantity", "Qty") ?? 0);
        const res2 = ins.run(
          name,
          g(r, "الكود", "item_code", "Code") || null,
          String(g(r, "الفئة", "category", "Category") ?? "عام"),
          qty, String(g(r, "الوحدة", "unit", "Unit") ?? "قطعة"),
          Number(g(r, "الحد الأدنى", "min_stock", "Min Stock") ?? 0),
          Number(g(r, "سعر الوحدة", "cost_per_unit", "Cost") ?? 0),
          g(r, "المورد", "supplier", "Supplier") || null,
          importedBy,
        );
        const newId = Number(res2.lastInsertRowid);
        if (qty > 0) logInventoryTransaction(newId, name, "in", qty, "استيراد_إكسل", undefined, String(req.body?.created_by || ""));
        inserted.push(name);
      }
    });
    insertMany(rows);
    res.json({ ok: true, inserted: inserted.length, skipped: skipped.length, skipped_names: skipped });
  } catch (err) {
    res.status(400).json({ error: "خطأ في قراءة الملف", detail: String(err) });
  }
});

// ── Bulk disbursement import (استيراد منصرف من Excel) ──────────────────────
router.post("/workshop-inventory/transactions/bulk-out", (req, res) => {
  const { rows, created_by } = req.body as {
    rows: { item_name: string; quantity: number; reason?: string; reference_no?: string; cost_per_unit?: number; vehicle_no?: string }[];
    created_by?: string;
  };
  if (!Array.isArray(rows) || rows.length === 0)
    return void res.status(400).json({ error: "لا توجد بيانات" });

  const inserted: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

  const doAll = db.transaction(() => {
    for (const r of rows) {
      const name = String(r.item_name || "").trim();
      if (!name) { skipped.push({ name: "—", reason: "بدون اسم صنف" }); continue; }
      const qty = Number(r.quantity);
      if (!qty || qty <= 0) { skipped.push({ name, reason: "كمية غير صالحة" }); continue; }
      const item = db.prepare(
        "SELECT * FROM workshop_inventory WHERE LOWER(TRIM(item_name))=LOWER(TRIM(?))"
      ).get(name) as Record<string, unknown> | undefined;
      if (!item) { skipped.push({ name, reason: "الصنف غير موجود في المخزون" }); continue; }
      db.prepare(
        "UPDATE workshop_inventory SET quantity = quantity - ?, last_updated = datetime('now'), updated_by=? WHERE id=?"
      ).run(qty, created_by || null, item.id);
      logInventoryTransaction(
        Number(item.id), String(item.item_name), "out", qty,
        r.reason || "صرف_يدوي", r.reference_no, created_by,
        Number(r.cost_per_unit) || 0, r.vehicle_no,
      );
      inserted.push(String(item.item_name));
    }
  });

  doAll();
  res.json({ ok: true, inserted: inserted.length, skipped: skipped.length, skipped_details: skipped });
});

// ── Edit a single transaction ────────────────────────────────────────────────
router.put("/workshop-inventory/transactions/:id", (req, res) => {
  const { quantity, reason, reference_no, cost_per_unit, updated_by } = req.body as {
    quantity?: number; reason?: string; reference_no?: string; cost_per_unit?: number; updated_by?: string;
  };
  const tx = db.prepare("SELECT * FROM workshop_inventory_transactions WHERE id=?")
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!tx) return void res.status(404).json({ error: "السجل غير موجود" });

  const oldQty = Number(tx.quantity);
  const newQty = quantity !== undefined ? Number(quantity) : oldQty;
  if (newQty <= 0) return void res.status(400).json({ error: "الكمية يجب أن تكون أكبر من صفر" });

  const delta = newQty - oldQty;
  if (delta !== 0) {
    const invDelta = tx.type === "in" ? delta : -delta;
    db.prepare("UPDATE workshop_inventory SET quantity = quantity + ?, last_updated = datetime('now'), updated_by=COALESCE(?,updated_by) WHERE id=?")
      .run(invDelta, updated_by || null, tx.item_id);
  }

  db.prepare(`
    UPDATE workshop_inventory_transactions
    SET quantity=?, reason=?, reference_no=?, cost_per_unit=?
    WHERE id=?
  `).run(
    newQty,
    reason !== undefined ? reason : tx.reason,
    reference_no !== undefined ? (reference_no || null) : tx.reference_no,
    cost_per_unit !== undefined ? Number(cost_per_unit) : Number(tx.cost_per_unit),
    req.params.id,
  );

  res.json({ ok: true });
});

// ── Bulk delete transactions (with stock reversal) ──────────────────────────
// NOTE: must be registered BEFORE /:id or Express matches "bulk" as an id
router.delete("/workshop-inventory/transactions/bulk", (req, res) => {
  const { ids, deleted_by } = req.body as { ids: number[]; deleted_by?: string };
  if (!Array.isArray(ids) || ids.length === 0)
    return void res.status(400).json({ error: "ids مطلوب" });

  const doBulk = db.transaction((list: number[]) => {
    for (const id of list) {
      const tx = db.prepare("SELECT * FROM workshop_inventory_transactions WHERE id=?")
        .get(id) as Record<string, unknown> | undefined;
      if (!tx) continue;
      const qty = Number(tx.quantity);
      const delta = tx.type === "in" ? -qty : qty;
      db.prepare("UPDATE workshop_inventory SET quantity = quantity + ?, last_updated = datetime('now'), updated_by=COALESCE(?,updated_by) WHERE id=?")
        .run(delta, deleted_by || null, tx.item_id);
      db.prepare("DELETE FROM workshop_inventory_transactions WHERE id=?").run(id);
    }
  });
  doBulk(ids);
  res.json({ ok: true, deleted: ids.length });
});

// ── Delete a single transaction (with stock reversal) ────────────────────────
router.delete("/workshop-inventory/transactions/:id", (req, res) => {
  const { deleted_by } = (req.body || {}) as { deleted_by?: string };
  const tx = db.prepare("SELECT * FROM workshop_inventory_transactions WHERE id=?")
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!tx) return void res.status(404).json({ error: "السجل غير موجود" });

  const qty = Number(tx.quantity);
  const invDelta = tx.type === "in" ? -qty : qty;
  db.prepare("UPDATE workshop_inventory SET quantity = quantity + ?, last_updated = datetime('now'), updated_by=COALESCE(?,updated_by) WHERE id=?")
    .run(invDelta, deleted_by || null, tx.item_id);
  db.prepare("DELETE FROM workshop_inventory_transactions WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Bulk in import (استيراد وارد من Excel) ──────────────────────────────────
router.post("/workshop-inventory/transactions/bulk-in", (req, res) => {
  const { rows, created_by } = req.body as {
    rows: { item_name: string; quantity: number; reason?: string; reference_no?: string; cost_per_unit?: number; vehicle_no?: string }[];
    created_by?: string;
  };
  if (!Array.isArray(rows) || rows.length === 0)
    return void res.status(400).json({ error: "لا توجد بيانات" });

  const inserted: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

  const doAll = db.transaction(() => {
    for (const r of rows) {
      const name = String(r.item_name || "").trim();
      if (!name) { skipped.push({ name: "—", reason: "بدون اسم صنف" }); continue; }
      const qty = Number(r.quantity);
      if (!qty || qty <= 0) { skipped.push({ name, reason: "كمية غير صالحة" }); continue; }
      const item = db.prepare(
        "SELECT * FROM workshop_inventory WHERE LOWER(TRIM(item_name))=LOWER(TRIM(?))"
      ).get(name) as Record<string, unknown> | undefined;
      if (!item) { skipped.push({ name, reason: "الصنف غير موجود في المخزون" }); continue; }
      const cost = Number(r.cost_per_unit) || 0;
      db.prepare("UPDATE workshop_inventory SET quantity = quantity + ?, last_updated = datetime('now'), updated_by=? WHERE id=?")
        .run(qty, created_by || null, item.id);
      if (cost > 0) updateWeightedCost(Number(item.id), qty, cost, created_by || null);
      logInventoryTransaction(
        Number(item.id), String(item.item_name), "in", qty,
        r.reason || "إضافة_يدوية", r.reference_no, created_by, cost, r.vehicle_no,
      );
      inserted.push(String(item.item_name));
    }
  });

  doAll();
  res.json({ ok: true, inserted: inserted.length, skipped: skipped.length, skipped_details: skipped });
});

// ══════════════════════════════════════════════════════════════════
//  PURCHASE REQUESTS — طلبات الشراء
// ══════════════════════════════════════════════════════════════════

router.get("/purchase-requests", (_req, res) => {
  const rows = db.prepare("SELECT * FROM purchase_requests ORDER BY created_at DESC").all();
  res.json(rows);
});

router.post("/purchase-requests", (req, res) => {
  const { item_name, quantity, unit, reason, workshop_job_id, requested_by, estimated_cost, supplier, supplier_id, vehicle_plate } = req.body;
  if (!item_name || !quantity || !requested_by)
    return void res.status(400).json({ error: "البيانات ناقصة" });

  const r = db.prepare(`
    INSERT INTO purchase_requests (item_name, quantity, unit, reason, workshop_job_id, requested_by, estimated_cost, supplier, supplier_id, vehicle_plate)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    item_name, Number(quantity), unit || "قطعة",
    reason || null, workshop_job_id || null,
    requested_by, Number(estimated_cost) || 0, supplier || null,
    supplier_id ? Number(supplier_id) : null,
    vehicle_plate || null,
  );

  // Notify purchasing managers
  const purchasing = db.prepare("SELECT phone FROM users WHERE role='purchasing' AND active=1").all() as {phone: string}[];
  const ins = db.prepare("INSERT INTO notifications (user_phone, title, body) VALUES (?,?,?)");
  for (const u of purchasing) ins.run(u.phone, "طلب شراء جديد", `${item_name} (${quantity} ${unit || "قطعة"}) من ${requested_by}`);

  res.json({ id: r.lastInsertRowid });
});

router.put("/purchase-requests/:id/approve", (req, res) => {
  const { approved_by, actual_cost, supplier, supplier_id } = req.body;
  const row = db.prepare("SELECT * FROM purchase_requests WHERE id=?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return void res.status(404).json({ error: "الطلب غير موجود" });
  if (row.status !== "pending") return void res.status(400).json({ error: "الطلب ليس في حالة انتظار" });

  // Resolve supplier name from supplier_id if provided
  let resolvedName = supplier || row.supplier;
  let resolvedId = supplier_id ? Number(supplier_id) : (row.supplier_id as number | null);
  if (supplier_id) {
    const sup = db.prepare("SELECT name FROM suppliers WHERE id=?").get(Number(supplier_id)) as { name: string } | undefined;
    if (sup) resolvedName = sup.name;
  }

  db.prepare(`
    UPDATE purchase_requests SET status='approved', approved_by=?, actual_cost=?, supplier=?, supplier_id=? WHERE id=?
  `).run(approved_by || null, Number(actual_cost) || row.actual_cost, resolvedName, resolvedId, req.params.id);

  // Notify workshop_manager
  const managers = db.prepare("SELECT phone FROM users WHERE role='workshop_manager' AND active=1").all() as {phone: string}[];
  const insN = db.prepare("INSERT INTO notifications (user_phone, title, body) VALUES (?,?,?)");
  for (const u of managers) insN.run(u.phone, "موافقة على طلب شراء", `تمت الموافقة على: ${row.item_name}`);

  res.json({ ok: true });
});

router.put("/purchase-requests/:id/reject", (req, res) => {
  const { rejection_reason } = req.body;
  db.prepare(`
    UPDATE purchase_requests SET status='rejected', rejection_reason=? WHERE id=?
  `).run(rejection_reason || null, req.params.id);
  res.json({ ok: true });
});

router.put("/purchase-requests/:id/receive", (req, res) => {
  const { actual_cost, inventory_id, qty, rating, quality_notes, received_by, supplier } = req.body;
  const row = db.prepare("SELECT * FROM purchase_requests WHERE id=?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return void res.status(404).json({ error: "الطلب غير موجود" });

  db.prepare(`
    UPDATE purchase_requests
    SET status='received', actual_cost=?, received_at=datetime('now'), rating=?, quality_notes=?
    WHERE id=?
  `).run(
    Number(actual_cost) || row.actual_cost,
    rating ? Number(rating) : null,
    quality_notes || null,
    req.params.id,
  );

  // Optionally update inventory
  if (inventory_id && qty) {
    const receiveQty = Number(qty);
    const totalCost = Number(actual_cost) || Number(row.actual_cost) || Number(row.estimated_cost) || 0;
    const unitCost = receiveQty > 0 ? totalCost / receiveQty : 0;
    const supplierName = String(supplier || row.supplier || "").trim();
    const receiveReason = `فاتورة مشتريات${supplierName ? ` — ${supplierName}` : ""}`;
    const referenceNo = `طلب_شراء_#${req.params.id}`;
    db.prepare(`
      UPDATE workshop_inventory SET quantity = quantity + ?, last_updated = datetime('now'), updated_by=COALESCE(?,updated_by) WHERE id=?
    `).run(receiveQty, received_by || null, inventory_id);
    const inventoryItem = db.prepare("SELECT item_name FROM workshop_inventory WHERE id=?")
      .get(inventory_id) as { item_name?: string } | undefined;
    if (inventoryItem) {
      logInventoryTransaction(
        Number(inventory_id),
        String(inventoryItem.item_name || row.item_name || ""),
        "in",
        receiveQty,
        receiveReason,
        referenceNo,
        received_by,
        unitCost,
      );
    }
  }

  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
//  PURCHASE INVOICES — فواتير المشتريات (استيراد إكسل)
// ══════════════════════════════════════════════════════════════════

router.get("/purchase-invoices", (req, res) => {
  const { vehicle_plate, branch, supplier_name, from, to, unclaimed, created_by } = req.query as Record<string, string>;
  let sql = `
    SELECT i.*,
      c.claim_number AS claim_number,
      c.sequence_no AS claim_sequence_no,
      c.is_printed AS claim_is_printed,
      c.is_cancelled AS claim_is_cancelled,
      c.printed_at AS claim_printed_at,
      (SELECT actor_name FROM supplier_reimbursement_claim_print_events e
       WHERE e.claim_id=c.id AND e.event_type='original' ORDER BY e.id LIMIT 1) AS claim_printed_by,
      (SELECT actor_name FROM supplier_reimbursement_claim_print_events e
       WHERE e.claim_id=c.id AND e.event_type='reprint' ORDER BY e.id DESC LIMIT 1) AS claim_last_reprinted_by,
      (SELECT printed_at FROM supplier_reimbursement_claim_print_events e
       WHERE e.claim_id=c.id AND e.event_type='reprint' ORDER BY e.id DESC LIMIT 1) AS claim_last_reprinted_at
    FROM purchase_invoices i
    LEFT JOIN supplier_reimbursement_claims c ON c.id=i.reimbursement_claim_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (vehicle_plate) { sql += " AND i.vehicle_plate LIKE ?"; params.push(`%${vehicle_plate}%`); }
  if (branch)         { sql += " AND i.branch LIKE ?";         params.push(`%${branch}%`); }
  if (supplier_name)  { sql += " AND i.supplier_name LIKE ?";  params.push(`%${supplier_name}%`); }
  if (from)           { sql += " AND i.invoice_date >= ?";     params.push(from); }
  if (to)             { sql += " AND i.invoice_date <= ?";     params.push(to); }
  if (unclaimed === "true") sql += " AND (i.reimbursement_claim_id IS NULL OR i.reimbursement_claim_id = 0)";
  if (created_by)     { sql += " AND i.imported_by = ?"; params.push(created_by); }
  sql += " ORDER BY i.invoice_date DESC, i.id DESC";
  res.json(db.prepare(sql).all(...params));
});

// ── Single invoice creation — إضافة فاتورة يدوياً ──────────────────────────
type PurchaseInvoiceCreateFailure = Error & { statusCode: number };
type PurchaseInvoiceCreateResult = {
  id: number;
  invoice: SupplierPurchaseInvoicePasteSavedRow;
  workshopAdded: boolean;
  workshopItemName: string;
  supplierId: number | null;
  supplierName: string;
};

function purchaseInvoiceCreateFailure(message: string, statusCode = 400): PurchaseInvoiceCreateFailure {
  return Object.assign(new Error(message), { statusCode });
}

function createPurchaseInvoiceRecord(body: Record<string, unknown>): PurchaseInvoiceCreateResult {
  const {
    serial_no, invoice_date, branch, vehicle_plate, invoice_number,
    supplier_name, supplier_id, item_name, price_before_vat, quantity, price_after_vat, discount_amount,
    notes, imported_by, work_on, trailer_number,
  } = body;

  if (!item_name || String(item_name).trim() === "")
    throw purchaseInvoiceCreateFailure("اسم قطعة الغيار مطلوب");

  const vehiclePlate = String(vehicle_plate || "").trim();
  const isWorkshop = vehiclePlate === "مستودع الورشة";
  const workOn = isWorkshop
    ? null
    : work_on === "trailer" ? "trailer" : work_on === "vehicle" ? "vehicle" : null;
  const trailerNumber = isWorkshop ? "" : String(trailer_number || "").trim();
  if (workOn === "vehicle" && !vehiclePlate)
    throw purchaseInvoiceCreateFailure("اختر السيارة التي تخصها الفاتورة");
  if (workOn === "trailer" && !trailerNumber)
    throw purchaseInvoiceCreateFailure("اختر رقم التيدر الذي تخصه الفاتورة");
  if (workOn === "trailer" && trailerNumber) {
    const trailerExists = db.prepare(
      "SELECT id FROM teidarat WHERE TRIM(COALESCE(teidara_number,''))=? LIMIT 1"
    ).get(trailerNumber);
    if (!trailerExists)
      throw purchaseInvoiceCreateFailure("رقم التيدر غير موجود في إدارة التيدارات");
  }

  const fleetVehicle = vehiclePlate
    ? db.prepare("SELECT branch FROM fleet_vehicles WHERE LOWER(TRIM(plate_number))=LOWER(?)")
        .get(vehiclePlate) as { branch?: string | null } | undefined
    : undefined;
  const trailerFleetVehicle = trailerNumber
    ? db.prepare("SELECT branch FROM fleet_vehicles WHERE linked_trailer_number=? LIMIT 1")
        .get(trailerNumber) as { branch?: string | null } | undefined
    : undefined;
  const resolvedBranch = fleetVehicle?.branch
    ? String(fleetVehicle.branch).trim()
    : trailerFleetVehicle?.branch
      ? String(trailerFleetVehicle.branch).trim()
    : String(branch || "").trim();

  if (!resolvedBranch)
    throw purchaseInvoiceCreateFailure(fleetVehicle
      ? "هذه السيارة غير مرتبطة بفرع. حدّد فرعها أولًا من إدارة الأسطول"
      : "اختيار الفرع مطلوب");

  if (fleetVehicle || trailerFleetVehicle) {
    const activeBranch = db.prepare(
      "SELECT id FROM company_settings WHERE active=1 AND LOWER(TRIM(entity_name))=LOWER(?)"
    ).get(resolvedBranch);
    if (!activeBranch)
      throw purchaseInvoiceCreateFailure("فرع السيارة غير موجود ضمن فروع الشركة؛ حدّث السيارة من إدارة الأسطول");
  }

  const inQty = Number(quantity) || 0;
  const inCost = Number(price_before_vat) || 0;
  const costUnit = inQty > 0 && inCost > 0 ? inCost / inQty : 0;
  let resolvedSupplierName = String(supplier_name || "").trim();
  let resolvedSupplierId = supplier_id ? Number(supplier_id) : null;

  if (resolvedSupplierId) {
    const selectedSupplier = db.prepare(
      "SELECT id, name FROM suppliers WHERE id=? AND is_active=1"
    ).get(resolvedSupplierId) as { id: number; name: string } | undefined;
    if (selectedSupplier) resolvedSupplierName = selectedSupplier.name;
    else resolvedSupplierId = null;
  }

  if (!resolvedSupplierId && resolvedSupplierName) {
    const existingSupplier = db.prepare(
      "SELECT id, name FROM suppliers WHERE LOWER(TRIM(name))=LOWER(?) AND is_active=1 ORDER BY id LIMIT 1"
    ).get(resolvedSupplierName) as { id: number; name: string } | undefined;
    if (existingSupplier) {
      resolvedSupplierId = existingSupplier.id;
      resolvedSupplierName = existingSupplier.name;
    } else {
      const newSupplier = db.prepare(
        "INSERT INTO suppliers (name) VALUES (?)"
      ).run(resolvedSupplierName);
      resolvedSupplierId = Number(newSupplier.lastInsertRowid);
    }
  }

  const inserted = db.prepare(`
    INSERT INTO purchase_invoices
      (serial_no, invoice_date, branch, vehicle_plate, invoice_number,
        supplier_name, supplier_id, item_name, price_before_vat, quantity, price_after_vat, discount_amount,
        notes, imported_by, work_on, trailer_number)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    serial_no ?? null, invoice_date ?? null, resolvedBranch, vehicle_plate ?? null,
    invoice_number ?? null, resolvedSupplierName || null, resolvedSupplierId,
    String(item_name), Number(price_before_vat) || 0, inQty, Number(price_after_vat) || 0,
    Math.max(0, Number(discount_amount) || 0),
    notes ?? null, imported_by ?? null, workOn, trailerNumber || null,
  );
  const id = Number(inserted.lastInsertRowid);

  let workshopAdded = false;
  let workshopItemName = "";
  if (isWorkshop && inQty > 0) {
    const name = String(item_name).trim();
    workshopItemName = name;
    const existing = db.prepare(
      "SELECT * FROM workshop_inventory WHERE LOWER(item_name)=LOWER(?)"
    ).get(name) as { id: number; item_name: string; quantity: number; cost_per_unit: number } | undefined;

    if (existing) {
      db.prepare(
        "UPDATE workshop_inventory SET quantity=quantity+?, last_updated=datetime('now'), updated_by=? WHERE id=?"
      ).run(inQty, String(imported_by || "") || null, existing.id);
      if (costUnit > 0) updateWeightedCost(existing.id, inQty, costUnit, String(imported_by || "") || null);
      logInventoryTransaction(existing.id, name, "in", inQty, "فاتورة_مشتريات",
        String(invoice_number || id), String(imported_by || ""), costUnit);
    } else {
      const newR = db.prepare(`
        INSERT INTO workshop_inventory
          (item_name, category, quantity, unit, min_stock, cost_per_unit, supplier, updated_by)
        VALUES (?, 'عام', ?, 'قطعة', 0, ?, ?, ?)
      `).run(name, inQty, costUnit, resolvedSupplierName || null, String(imported_by || "") || null);
      logInventoryTransaction(Number(newR.lastInsertRowid), name, "in", inQty, "فاتورة_مشتريات",
        String(invoice_number || id), String(imported_by || ""), costUnit);
    }
    workshopAdded = true;
  }

  return {
    id,
    invoice: db.prepare("SELECT * FROM purchase_invoices WHERE id=?").get(id) as SupplierPurchaseInvoicePasteSavedRow,
    workshopAdded,
    workshopItemName,
    supplierId: resolvedSupplierId,
    supplierName: resolvedSupplierName,
  };
}

router.post("/purchase-invoices", (req, res) => {
  try {
    const result = createPurchaseInvoiceRecord(req.body as Record<string, unknown>);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    const failure = error as Partial<PurchaseInvoiceCreateFailure>;
    const statusCode = Number(failure.statusCode) || 500;
    if (statusCode >= 500) req.log.error({ err: error }, "Failed to create supplier purchase invoice");
    res.status(statusCode).json({
      error: statusCode < 500 && typeof failure.message === "string"
        ? failure.message
        : "فشل حفظ الفاتورة",
    });
  }
});

router.post("/purchase-invoices/paste", (req, res) => {
  const actor = getSupplierClaimActor(req);
  if (!actor) {
    res.status(401).json({ error: "تسجيل الدخول مطلوب لإضافة فواتير الموردين" });
    return;
  }

  const parsed = PasteSupplierPurchaseInvoicesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات جدول اللصق غير مكتملة أو غير صحيحة" });
    return;
  }

  const { request_key: requestKey, rows } = parsed.data;
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ actor_id: actor.id, rows }))
    .digest("hex");
  type PasteBatchResult =
    | { conflict: true }
    | { conflict: false; replayed: boolean; invoiceIds: number[]; workshopItemNames: string[] };

  try {
    const saveBatch = db.transaction((): PasteBatchResult => {
      const existing = db.prepare(`
        SELECT payload_hash, invoice_ids_json, workshop_item_names_json
        FROM purchase_invoice_paste_batches WHERE request_key=?
      `).get(requestKey) as {
        payload_hash: string;
        invoice_ids_json: string;
        workshop_item_names_json: string;
      } | undefined;

      if (existing) {
        if (existing.payload_hash !== payloadHash) return { conflict: true };
        return {
          conflict: false,
          replayed: true,
          invoiceIds: JSON.parse(existing.invoice_ids_json) as number[],
          workshopItemNames: JSON.parse(existing.workshop_item_names_json) as string[],
        };
      }

      const created = rows.map((row, index) => {
        try {
          return createPurchaseInvoiceRecord({
            ...row,
            imported_by: actor.name,
          });
        } catch (error) {
          const failure = error as Partial<PurchaseInvoiceCreateFailure>;
          if ((Number(failure.statusCode) || 500) < 500) {
            throw purchaseInvoiceCreateFailure(`الصف ${index + 1}: ${failure.message || "بيانات الفاتورة غير صحيحة"}`);
          }
          throw error;
        }
      });
      const invoiceIds = created.map(record => record.id);
      const workshopItemNames = created
        .filter(record => record.workshopAdded)
        .map(record => record.workshopItemName);
      db.prepare(`
        INSERT INTO purchase_invoice_paste_batches
          (request_key, payload_hash, invoice_ids_json, workshop_item_names_json)
        VALUES (?, ?, ?, ?)
      `).run(requestKey, payloadHash, JSON.stringify(invoiceIds), JSON.stringify(workshopItemNames));
      return { conflict: false, replayed: false, invoiceIds, workshopItemNames };
    });

    const batch = saveBatch();
    if (batch.conflict) {
      res.status(409).json({
        error: "رمز الحفظ مرتبط بدفعة سابقة ببيانات مختلفة؛ لم يتم حفظ هذه البيانات.",
        replayConflict: true,
      });
      return;
    }

    const invoices = batch.invoiceIds
      .map(id => db.prepare("SELECT * FROM purchase_invoices WHERE id=?").get(id))
      .filter((invoice): invoice is SupplierPurchaseInvoicePasteSavedRow => Boolean(invoice));
    const result = {
      ok: true,
      inserted: batch.invoiceIds.length,
      invoice_ids: batch.invoiceIds,
      invoices,
      workshop_added_count: batch.workshopItemNames.length,
      workshop_item_names: batch.workshopItemNames,
      replayed: batch.replayed,
    } satisfies SupplierPurchaseInvoicePasteResult;
    res.status(201).json(result);
  } catch (error) {
    const failure = error as Partial<PurchaseInvoiceCreateFailure>;
    const statusCode = Number(failure.statusCode) || 500;
    if (statusCode >= 500) req.log.error({ err: error }, "Failed to save supplier invoice paste batch");
    res.status(statusCode).json({
      error: statusCode < 500 && typeof failure.message === "string"
        ? failure.message
        : "فشل حفظ مجموعة فواتير الموردين",
    });
  }
});

router.post("/purchase-invoices/import", (req, res) => {
  const { rows, imported_by } = req.body as { rows: Record<string, unknown>[]; imported_by?: string };
  if (!Array.isArray(rows) || rows.length === 0)
    return void res.status(400).json({ error: "لا توجد صفوف للاستيراد" });

  const insert = db.prepare(`
    INSERT INTO purchase_invoices
      (serial_no, invoice_date, branch, vehicle_plate, invoice_number,
       supplier_name, item_name, price_before_vat, quantity, price_after_vat, notes, imported_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const importAll = db.transaction((rows: Record<string, unknown>[]) => {
    for (const r of rows) {
      insert.run(
        r.serial_no ?? null, r.invoice_date ?? null, r.branch ?? null,
        r.vehicle_plate ?? null, r.invoice_number ?? null, r.supplier_name ?? null,
        r.item_name ?? "", Number(r.price_before_vat) || 0,
        Number(r.quantity) || 0, Number(r.price_after_vat) || 0,
        r.notes ?? null, imported_by ?? null,
      );
    }
  });

  importAll(rows);
  res.json({ ok: true, inserted: rows.length });
});

router.put("/purchase-invoices/:id", (req, res) => {
  const { serial_no, invoice_date, branch, vehicle_plate, invoice_number,
    supplier_name, supplier_id, item_name, price_before_vat, quantity, price_after_vat, notes,
    work_on, trailer_number } = req.body as Record<string, unknown>;
  if (!item_name) return void res.status(400).json({ error: "اسم قطعة الغيار مطلوب" });
  const existing = db.prepare("SELECT id, work_on, trailer_number, supplier_id FROM purchase_invoices WHERE id=?")
    .get(req.params.id) as { id:number; work_on:string|null; trailer_number:string|null; supplier_id:number|null } | undefined;
  if (!existing) return void res.status(404).json({ error: "الفاتورة غير موجودة" });

  const body = req.body as Record<string, unknown>;
  const hasSupplierSelection = Object.prototype.hasOwnProperty.call(body, "supplier_id");
  const rawSupplierId = String(supplier_id ?? "").trim();
  const requestedSupplierId = rawSupplierId ? Number(rawSupplierId) : null;
  if (
    hasSupplierSelection &&
    rawSupplierId &&
    (!Number.isSafeInteger(requestedSupplierId) || Number(requestedSupplierId) <= 0)
  ) {
    return void res.status(400).json({ error: "اختيار المورد غير صحيح" });
  }
  const vehiclePlate = String(vehicle_plate || "").trim();
  const isWorkshop = vehiclePlate === "مستودع الورشة";
  const workOn = isWorkshop
    ? null
    : Object.prototype.hasOwnProperty.call(body, "work_on")
      ? work_on === "trailer" ? "trailer" : work_on === "vehicle" ? "vehicle" : null
      : existing.work_on;
  const trailerNumber = isWorkshop
    ? ""
    : Object.prototype.hasOwnProperty.call(body, "trailer_number")
      ? String(trailer_number || "").trim()
      : String(existing.trailer_number || "").trim();
  if (workOn === "vehicle" && !vehiclePlate)
    return void res.status(400).json({ error: "اختر السيارة التي تخصها الفاتورة" });
  if (workOn === "trailer" && !trailerNumber)
    return void res.status(400).json({ error: "اختر رقم التيدر الذي تخصه الفاتورة" });
  if (workOn === "trailer" && trailerNumber) {
    const trailerExists = db.prepare(
      "SELECT id FROM teidarat WHERE TRIM(COALESCE(teidara_number,''))=? LIMIT 1"
    ).get(trailerNumber);
    if (!trailerExists)
      return void res.status(400).json({ error: "رقم التيدر غير موجود في إدارة التيدارات" });
  }
  const savedInvoice = db.transaction(() => {
    let resolvedSupplierId = existing.supplier_id;
    let resolvedSupplierName: string | null =
      supplier_name == null ? null : String(supplier_name).trim() || null;

    if (hasSupplierSelection) {
      resolvedSupplierId = null;
      if (requestedSupplierId) {
        const selectedSupplier = db.prepare(
          "SELECT id, name FROM suppliers WHERE id=? AND is_active=1"
        ).get(requestedSupplierId) as { id: number; name: string } | undefined;
        if (selectedSupplier) {
          resolvedSupplierId = selectedSupplier.id;
          resolvedSupplierName = selectedSupplier.name;
        }
      }

      if (!resolvedSupplierId && resolvedSupplierName) {
        const existingSupplier = db.prepare(
          "SELECT id, name FROM suppliers WHERE LOWER(TRIM(name))=LOWER(?) AND is_active=1 ORDER BY id LIMIT 1"
        ).get(resolvedSupplierName) as { id: number; name: string } | undefined;
        if (existingSupplier) {
          resolvedSupplierId = existingSupplier.id;
          resolvedSupplierName = existingSupplier.name;
        } else {
          const newSupplier = db.prepare(
            "INSERT INTO suppliers (name) VALUES (?)"
          ).run(resolvedSupplierName);
          resolvedSupplierId = Number(newSupplier.lastInsertRowid);
        }
      }
    }

    db.prepare(`
      UPDATE purchase_invoices SET
        serial_no=?, invoice_date=?, branch=?, vehicle_plate=?, invoice_number=?,
        supplier_name=?, supplier_id=?, item_name=?, price_before_vat=?, quantity=?, price_after_vat=?, notes=?,
        work_on=?, trailer_number=?
      WHERE id=?
    `).run(
      serial_no ?? null, invoice_date ?? null, branch ?? null, vehiclePlate || null,
      invoice_number ?? null, resolvedSupplierName, resolvedSupplierId, item_name,
      Number(price_before_vat) || 0, Number(quantity) || 0, Number(price_after_vat) || 0,
      notes ?? null, workOn, trailerNumber || null, req.params.id,
    );
    return db.prepare("SELECT * FROM purchase_invoices WHERE id=?").get(req.params.id);
  })();
  res.json({
    ok: true,
    invoice: savedInvoice,
  });
});

router.delete("/purchase-invoices/clear", (_req, res) => {
  const { changes } = db.prepare("DELETE FROM purchase_invoices").run();
  res.json({ ok: true, deleted: changes });
});

router.delete("/purchase-invoices/bulk", (req, res) => {
  const { ids } = req.body as { ids?: number[] };
  if (!Array.isArray(ids) || ids.length === 0)
    return void res.status(400).json({ error: "لا توجد معرّفات" });
  const del = db.prepare("DELETE FROM purchase_invoices WHERE id=?");
  const bulkDel = db.transaction((list: number[]) => { for (const id of list) del.run(id); });
  bulkDel(ids);
  res.json({ ok: true, deleted: ids.length });
});

router.delete("/purchase-invoices/:id", (req, res) => {
  db.prepare("DELETE FROM purchase_invoices WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
//  SUPPLIERS — الموردين
// ══════════════════════════════════════════════════════════════════

router.get("/suppliers", (_req, res) => {
  const rows = db.prepare(`
    SELECT s.*,
      COALESCE(pr.order_count,    0) AS order_count,
      COALESCE(pr.total_amount,   0) AS total_amount,
      pr.last_deal,
      COALESCE(pr.received_count, 0) AS received_count,
      COALESCE(pr.avg_rating,     0) AS avg_rating,
      COALESCE(inv.inv_count,     0) AS inv_count,
      COALESCE(inv.inv_total,     0) AS inv_total
    FROM suppliers s
    LEFT JOIN (
      SELECT supplier_id,
        COUNT(*)                                          AS order_count,
        COALESCE(SUM(actual_cost), 0)                    AS total_amount,
        MAX(received_at)                                  AS last_deal,
        COUNT(CASE WHEN status='received' THEN 1 END)    AS received_count,
        AVG(CASE WHEN rating > 0 THEN CAST(rating AS REAL) END) AS avg_rating
      FROM purchase_requests WHERE supplier_id IS NOT NULL
      GROUP BY supplier_id
    ) pr ON pr.supplier_id = s.id
    LEFT JOIN (
      SELECT supplier_id,
        COUNT(*)                                          AS inv_count,
        COALESCE(SUM(quantity * price_after_vat), 0)     AS inv_total
      FROM purchase_invoices WHERE supplier_id IS NOT NULL
      GROUP BY supplier_id
    ) inv ON inv.supplier_id = s.id
    WHERE s.is_active = 1
    ORDER BY s.name
  `).all();
  res.json(rows);
});

router.post("/suppliers", (req, res) => {
  const { name, phone, specialty, notes } = req.body as Record<string, string>;
  if (!name?.trim()) return void res.status(400).json({ error: "اسم المورد مطلوب" });
  const r = db.prepare(
    "INSERT INTO suppliers (name, phone, specialty, notes) VALUES (?,?,?,?)"
  ).run(name.trim(), phone || null, specialty || null, notes || null);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.put("/suppliers/:id", (req, res) => {
  const { name, phone, specialty, notes } = req.body as Record<string, string>;
  if (!name?.trim()) return void res.status(400).json({ error: "اسم المورد مطلوب" });
  const exists = db.prepare("SELECT id FROM suppliers WHERE id=?").get(req.params.id);
  if (!exists) return void res.status(404).json({ error: "المورد غير موجود" });
  db.prepare(
    "UPDATE suppliers SET name=?, phone=?, specialty=?, notes=? WHERE id=?"
  ).run(name.trim(), phone || null, specialty || null, notes || null, req.params.id);
  res.json({ ok: true });
});

router.delete("/suppliers/:id", (req, res) => {
  db.prepare("UPDATE suppliers SET is_active=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.get("/suppliers/:id/history", (req, res) => {
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id=?").get(req.params.id) as
    { id: number; name: string } | undefined;
  if (!supplier) return void res.status(404).json({ error: "المورد غير موجود" });

  const requests = db.prepare(`
    SELECT * FROM purchase_requests
    WHERE supplier_id = ?
       OR (supplier_id IS NULL AND supplier LIKE ?)
    ORDER BY created_at DESC
  `).all(supplier.id, `%${supplier.name}%`);

  const invoices = db.prepare(`
    SELECT * FROM purchase_invoices
    WHERE supplier_id = ?
       OR (supplier_id IS NULL AND supplier_name LIKE ?)
    ORDER BY invoice_date DESC, id DESC
  `).all(supplier.id, `%${supplier.name}%`);

  res.json({ requests, invoices });
});

// ══════════════════════════════════════════════════════════════════
//  PURCHASE INVOICE RETURNS — مرتجعات فواتير الموردين
// ══════════════════════════════════════════════════════════════════

router.get("/purchase-invoice-returns", (req, res) => {
  const { q } = req.query as Record<string, string>;
  let sql = "SELECT * FROM purchase_invoice_returns WHERE 1=1";
  const params: unknown[] = [];
  if (q) {
    sql += " AND (item_name LIKE ? OR invoice_number LIKE ? OR supplier_name LIKE ? OR vehicle_plate LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY returned_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/purchase-invoice-returns", (req, res) => {
  const { items, returned_by } = req.body as {
    items: { invoice_id: number; invoice_number: string | null; supplier_name: string | null; item_name: string; return_quantity: number; reason: string; vehicle_plate?: string | null }[];
    returned_by?: string;
  };
  if (!Array.isArray(items) || items.length === 0)
    return void res.status(400).json({ error: "لا توجد أصناف للإرجاع" });

  const ins = db.prepare(`
    INSERT INTO purchase_invoice_returns
      (invoice_id, invoice_number, supplier_name, item_name, return_quantity, reason, returned_by, vehicle_plate)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  const doInsert = db.transaction((list: typeof items) => {
    for (const it of list) {
      ins.run(it.invoice_id, it.invoice_number ?? null, it.supplier_name ?? null,
        it.item_name, it.return_quantity, it.reason ?? null, returned_by ?? null, it.vehicle_plate ?? null);
    }
  });
  doInsert(items);
  res.status(201).json({ ok: true, count: items.length });
});

// ══════════════════════════════════════════════════════════════════
//  MAINTENANCE LOGS — سجل الأعطال
// ══════════════════════════════════════════════════════════════════

// Convert M/D/YY or M/D/YYYY or YYYY-MM-DD to ISO string (YYYY-MM-DD) for comparison
function mlDateToISO(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10); // already ISO
  const parts = trimmed.split("/");
  if (parts.length !== 3) return "";
  const [m, d, y] = parts;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

type MaintenancePartRecord = {
  item_id: number | null;
  item_name: string;
  quantity: number;
  unit: string;
  cost_per_unit: number;
  item_code: string | null;
};

function attachMaintenanceParts(logs: Record<string, unknown>[]) {
  const cardNumbers = logs.map(l => l.card_number).filter(Boolean) as string[];
  const partsByRef = new Map<string, MaintenancePartRecord[]>();

  if (cardNumbers.length > 0) {
    const ph = cardNumbers.map(() => "?").join(",");
    const txns = db.prepare(
      `SELECT t.item_id, t.item_name, t.quantity, t.cost_per_unit, t.reference_no,
              COALESCE(i.unit, 'قطعة') AS unit,
              i.item_code
       FROM workshop_inventory_transactions t
       LEFT JOIN workshop_inventory i ON t.item_id = i.id
       WHERE t.reason='سجل_عطل' AND t.type='out' AND t.reference_no IN (${ph})`
    ).all(...cardNumbers) as Array<MaintenancePartRecord & { reference_no: string }>;

    for (const t of txns) {
      if (!partsByRef.has(t.reference_no)) partsByRef.set(t.reference_no, []);
      partsByRef.get(t.reference_no)!.push({
        item_id: t.item_id,
        item_name: t.item_name,
        quantity: t.quantity,
        unit: t.unit,
        cost_per_unit: t.cost_per_unit,
        item_code: t.item_code ?? null,
      });
    }
  }

  return logs.map(l => ({
    ...l,
    parts: l.card_number ? (partsByRef.get(l.card_number as string) ?? []) : [],
  }));
}

function parseMaintenanceBreakdown(raw: unknown): Record<string, number> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, Number(value) || 0]),
    );
  } catch {
    return {};
  }
}

function normalizeMaintenanceType(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isOilChangeType(value: string) {
  return /(?:تبديل|تغيير)\s*(?:ال)?زيت/i.test(normalizeMaintenanceType(value));
}

function maintenanceTypesOf(log: Record<string, unknown>) {
  const savedTypes = typeof log.maintenance_type === "string"
    ? log.maintenance_type.split(/[,،]/)
    : [];
  return [
    ...savedTypes,
    ...Object.keys(parseMaintenanceBreakdown(log.amount_breakdown)),
  ].map(normalizeMaintenanceType).filter(Boolean);
}

function hasOilChange(log: Record<string, unknown>) {
  return maintenanceTypesOf(log).some(isOilChangeType);
}

function oilChangeAmount(log: Record<string, unknown>) {
  const breakdown = parseMaintenanceBreakdown(log.amount_breakdown);
  const oilAmount = Object.entries(breakdown)
    .filter(([type]) => isOilChangeType(type))
    .reduce((sum, [, amount]) => sum + amount, 0);
  if (oilAmount > 0) return oilAmount;

  const savedTypes = typeof log.maintenance_type === "string"
    ? log.maintenance_type.split(/[,،]/).map(normalizeMaintenanceType).filter(Boolean)
    : [];
  return savedTypes.length > 0 && savedTypes.every(isOilChangeType)
    ? Number(log.amount) || 0
    : 0;
}

function hasOilFilter(log: Record<string, unknown>) {
  const parts = Array.isArray(log.parts) ? log.parts as Array<Partial<MaintenancePartRecord>> : [];
  return parts.some(part => /فلتر|فلاتر|filter/i.test(
    `${part.item_name || ""} ${part.item_code || ""}`,
  ));
}

router.get("/maintenance-logs", (req, res) => {
  const { vehicle_plate, branch, from, to, search } = req.query as Record<string, string>;
  let sql = "SELECT * FROM maintenance_logs WHERE 1=1";
  const params: unknown[] = [];
  if (vehicle_plate) { sql += " AND vehicle_plate LIKE ?"; params.push(`%${vehicle_plate}%`); }
  if (branch)        { sql += " AND branch LIKE ?";        params.push(`%${branch}%`); }
  // NOTE: date filter done in JS below — maintenance_date may be M/D/YY or ISO format
  if (search)        {
    sql += " AND (description LIKE ? OR driver_name LIKE ? OR card_number LIKE ? OR vehicle_plate LIKE ? OR maintenance_type LIKE ? OR branch LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += " ORDER BY id DESC";
  let logs = db.prepare(sql).all(...params) as Record<string, unknown>[];

  // Date filter in JS — handles both ISO and M/D/YY formats
  if (from || to) {
    logs = logs.filter(l => {
      const iso = mlDateToISO(String(l.maintenance_date ?? ""));
      if (!iso) return true; // no date → include
      if (from && iso < from) return false;
      if (to   && iso > to)   return false;
      return true;
    });
  }

  if (logs.length === 0) return void res.json([]);

  res.json(attachMaintenanceParts(logs));
});

// Oil-change register — same card data as the company export, with an
// inventory-backed filter status and oil-only amount.
// Keep this route before any /maintenance-logs/:id routes.
router.get("/maintenance-logs/oil-changes", (req, res) => {
  const { vehicle_plate, branch, from, to, search, filter_status } =
    req.query as Record<string, string>;
  let sql = "SELECT * FROM maintenance_logs WHERE 1=1";
  const params: unknown[] = [];
  if (vehicle_plate) { sql += " AND vehicle_plate LIKE ?"; params.push(`%${vehicle_plate}%`); }
  if (branch)        { sql += " AND branch LIKE ?";        params.push(`%${branch}%`); }
  if (search) {
    sql += " AND (description LIKE ? OR driver_name LIKE ? OR card_number LIKE ? OR vehicle_plate LIKE ? OR maintenance_type LIKE ? OR branch LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += " ORDER BY id DESC";
  let logs = db.prepare(sql).all(...params) as Record<string, unknown>[];

  if (from || to) {
    logs = logs.filter(log => {
      const iso = mlDateToISO(String(log.maintenance_date ?? ""));
      if (!iso) return true;
      if (from && iso < from) return false;
      if (to && iso > to) return false;
      return true;
    });
  }

  const oilLogs = attachMaintenanceParts(logs)
    .filter(hasOilChange)
    .map(log => ({
      ...log,
      oil_change_amount: oilChangeAmount(log),
      filter_status: hasOilFilter(log) ? "with" : "without",
    }))
    .filter(log =>
      filter_status !== "with" && filter_status !== "without"
        ? true
        : log.filter_status === filter_status,
    );

  res.json(oilLogs);
});

router.post("/maintenance-logs", (req, res) => {
  const { card_number, maintenance_date, entry_time, exit_time, exit_date,
    vehicle_plate, driver_name, branch, maintenance_type, description, amount,
    amount_mechanical, amount_electrical, amount_salvage, salvage_source,
    inv_items, inventory_item_id, inventory_qty_used, performed_by,
    technicians, trailer_number, trailer_type, is_external, amount_breakdown,
    vehicle_choice } = req.body as Record<string, unknown>;
  const vehiclePlate = typeof vehicle_plate === "string" ? vehicle_plate.trim() : "";
  const fleetVehicle = vehiclePlate
    ? db.prepare("SELECT branch FROM fleet_vehicles WHERE TRIM(plate_number)=?")
        .get(vehiclePlate) as { branch?: string | null } | undefined
    : undefined;
  const branchName = fleetVehicle
    ? String(fleetVehicle.branch || "").trim()
    : (typeof branch === "string" ? branch.trim() : "");
  if (!branchName) {
    return void res.status(400).json({
      error: fleetVehicle
        ? "هذه السيارة غير مرتبطة بفرع. حدّد فرعها أولًا من إدارة الأسطول"
        : "يجب كتابة الفرع قبل حفظ سجل العطل",
    });
  }
  if (fleetVehicle) {
    const activeBranch = db.prepare(
      "SELECT id FROM company_settings WHERE active=1 AND LOWER(TRIM(entity_name))=LOWER(?)"
    ).get(branchName);
    if (!activeBranch) {
      return void res.status(400).json({ error: "فرع السيارة غير موجود ضمن فروع الشركة؛ حدّث السيارة من إدارة الأسطول" });
    }
  }
  // Derive mech/elec from breakdown when available — never keep stale column values
  let amtMech = 0, amtElec = 0;
  if (amount_breakdown) {
    try {
      const bd = JSON.parse(String(amount_breakdown)) as Record<string, number>;
      amtMech = Number(bd["ميكانيكة"]) || 0;
      amtElec = Number(bd["كهرباء"])   || 0;
    } catch {}
  } else {
    amtMech = Number(amount_mechanical) || 0;
    amtElec = Number(amount_electrical) || 0;
  }
  const amtSalv = Number(amount_salvage) || 0;
  const totalAmount = Number(amount) || (amtMech + amtElec + amtSalv) || 0;
  const vc = vehicle_choice === "trailer" ? "trailer" : "vehicle";

  const r = db.prepare(`
    INSERT INTO maintenance_logs
      (card_number, maintenance_date, entry_time, exit_time, exit_date,
       vehicle_plate, driver_name, branch, maintenance_type, description, amount,
       amount_mechanical, amount_electrical, amount_salvage, salvage_source, technicians, tires,
       trailer_number, trailer_type, is_external, amount_breakdown, vehicle_choice)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    card_number ? String(card_number).trim() : null,
    maintenance_date || null, entry_time || null,
    exit_time || null, exit_date || null, vehicle_plate || null,
    driver_name || null, branchName, maintenance_type || null,
    description || null, totalAmount,
    amtMech, amtElec, amtSalv, salvage_source || null,
    technicians ? String(technicians) : null,
    (req.body as Record<string, unknown>).tires ? String((req.body as Record<string, unknown>).tires) : null,
    trailer_number ? String(trailer_number) : null,
    trailer_type ? String(trailer_type) : null,
    fleetVehicle ? 0 : (is_external ? 1 : 0),
    amount_breakdown ? String(amount_breakdown) : null,
    vc,
  );

  // ── Auto-deduct from workshop inventory (supports multiple items) ──────────
  const refNo = card_number ? String(card_number).trim() : String(r.lastInsertRowid);
  const itemsToDeduct: Array<{ id: number; qty: number }> = Array.isArray(inv_items)
    ? (inv_items as Array<{ id: unknown; qty: unknown }>).map(x => ({ id: Number(x.id), qty: Number(x.qty) || 1 }))
    : (inventory_item_id && Number(inventory_qty_used) > 0
        ? [{ id: Number(inventory_item_id), qty: Number(inventory_qty_used) }]
        : []);

  for (const { id, qty } of itemsToDeduct) {
    if (!id || qty <= 0) continue;
    const item = db.prepare("SELECT * FROM workshop_inventory WHERE id=?")
      .get(id) as { id: number; item_name: string; quantity: number; cost_per_unit: number; unit: string } | undefined;
    if (item) {
      const newQty = Math.max(0, Number(item.quantity) - qty);
      db.prepare("UPDATE workshop_inventory SET quantity=?, last_updated=datetime('now'), updated_by=? WHERE id=?")
        .run(newQty, performed_by ? String(performed_by) : null, item.id);
      logInventoryTransaction(
        item.id, item.item_name, "out", qty, "سجل_عطل",
        refNo, String(performed_by || ""), Number(item.cost_per_unit), vehicle_plate ? String(vehicle_plate) : undefined,
      );
    }
  }

  // ── Sync trailer link + default to fleet_vehicles ─────────────────────────
  if (vehicle_plate) {
    const vp = String(vehicle_plate);
    const tn = trailer_number ? String(trailer_number) : null;
    const vc = String((req.body as Record<string, unknown>).vehicle_choice || "vehicle");
    const def = (vc === "trailer" && tn) ? "trailer" : "vehicle";
    if (tn) {
      db.prepare(
        "UPDATE fleet_vehicles SET linked_trailer_number=?, linked_trailer_default=? WHERE plate_number=?"
      ).run(tn, def, vp);
    } else {
      // no trailer in this log — only update the default if explicitly set to vehicle
      db.prepare(
        "UPDATE fleet_vehicles SET linked_trailer_default='vehicle' WHERE plate_number=? AND linked_trailer_default IS NOT NULL"
      ).run(vp);
    }
  }

  res.json({ id: r.lastInsertRowid });
});

router.put("/maintenance-logs/:id", (req, res) => {
  const { card_number, maintenance_date, entry_time, exit_time, exit_date,
    vehicle_plate, driver_name, branch, maintenance_type, description, amount,
    amount_mechanical, amount_electrical, amount_salvage, salvage_source,
    technicians, tires, trailer_number, trailer_type, is_external,
    inv_items, performed_by, amount_breakdown, vehicle_choice } = req.body as Record<string, unknown>;
  const id = req.params.id;

  // Preserve the historical vehicle attribution on old records unless the
  // user explicitly changes the vehicle itself.
  const oldLog = db.prepare(
    "SELECT card_number, vehicle_plate, trailer_number, branch, is_external FROM maintenance_logs WHERE id=?"
  ).get(id) as {
    card_number: string | null;
    vehicle_plate: string | null;
    trailer_number: string | null;
    branch: string | null;
    is_external: number | null;
  } | undefined;
  if (!oldLog) return void res.status(404).json({ error: "سجل العطل غير موجود" });

  const vehiclePlate = typeof vehicle_plate === "string" ? vehicle_plate.trim() : "";
  const vehicleChanged = vehiclePlate !== String(oldLog.vehicle_plate || "").trim();
  const fleetVehicle = vehiclePlate
    ? db.prepare("SELECT branch FROM fleet_vehicles WHERE TRIM(plate_number)=?")
        .get(vehiclePlate) as { branch?: string | null } | undefined
    : undefined;
  const branchName = !vehicleChanged
    ? String(oldLog.branch || "").trim()
    : fleetVehicle
      ? String(fleetVehicle.branch || "").trim()
      : (typeof branch === "string" ? branch.trim() : "");
  if (vehicleChanged && !branchName) {
    return void res.status(400).json({
      error: fleetVehicle
        ? "هذه السيارة غير مرتبطة بفرع. حدّد فرعها أولًا من إدارة الأسطول"
        : "يجب كتابة الفرع قبل حفظ سجل العطل",
    });
  }
  if (vehicleChanged && fleetVehicle) {
    const activeBranch = db.prepare(
      "SELECT id FROM company_settings WHERE active=1 AND LOWER(TRIM(entity_name))=LOWER(?)"
    ).get(branchName);
    if (!activeBranch) {
      return void res.status(400).json({ error: "فرع السيارة غير موجود ضمن فروع الشركة؛ حدّث السيارة من إدارة الأسطول" });
    }
  }

  // Derive mech/elec from breakdown when available — never keep stale column values
  let amtMech = 0, amtElec = 0;
  if (amount_breakdown) {
    try {
      const bd = JSON.parse(String(amount_breakdown)) as Record<string, number>;
      amtMech = Number(bd["ميكانيكة"]) || 0;
      amtElec = Number(bd["كهرباء"])   || 0;
    } catch {}
  } else {
    amtMech = Number(amount_mechanical) || 0;
    amtElec = Number(amount_electrical) || 0;
  }
  const amtSalv = Number(amount_salvage) || 0;
  const totalAmount = Number(amount) || (amtMech + amtElec + amtSalv) || 0;

  const newVehicle = vehicle_plate ? String(vehicle_plate) : null;
  const newTrailer = trailer_number !== undefined
    ? (trailer_number ? String(trailer_number) : null)
    : oldLog?.trailer_number ?? null;

  const vcSaved = vehicle_choice === "trailer" ? "trailer" : "vehicle";

  db.transaction(() => {
    db.prepare(`
      UPDATE maintenance_logs SET
        card_number=?, maintenance_date=?, entry_time=?, exit_time=?, exit_date=?,
        vehicle_plate=?, driver_name=?, branch=?, maintenance_type=?, description=?, amount=?,
        amount_mechanical=?, amount_electrical=?, amount_salvage=?, salvage_source=?,
        technicians=?, tires=?, trailer_number=?, trailer_type=?, is_external=?, amount_breakdown=?,
        vehicle_choice=?
      WHERE id=?
    `).run(
      card_number ? String(card_number).trim() : null,
      maintenance_date || null, entry_time || null,
      exit_time || null, exit_date || null, newVehicle,
      driver_name || null, branchName, maintenance_type || null,
      description || null, totalAmount,
      amtMech, amtElec, amtSalv, salvage_source || null,
      technicians ? String(technicians) : null,
      tires ? String(tires) : null,
      newTrailer,
      trailer_type ? String(trailer_type) : null,
      vehicleChanged
        ? (fleetVehicle ? 0 : (is_external ? 1 : 0))
        : (oldLog.is_external ? 1 : 0),
      amount_breakdown ? String(amount_breakdown) : null,
      vcSaved,
      id,
    );

    // ── Sync trailer link + default to fleet_vehicles ───────────────────────
    const oldVehicle = oldLog?.vehicle_plate ?? null;
    const oldTrailer = oldLog?.trailer_number ?? null;
    const linkedVehicleChanged = oldVehicle !== newVehicle;
    const trailerChanged = trailer_number !== undefined && oldTrailer !== newTrailer;
    const vc = String((req.body as Record<string, unknown>).vehicle_choice || "vehicle");
    const newDefault = (vc === "trailer" && newTrailer) ? "trailer" : "vehicle";

    if (linkedVehicleChanged || trailerChanged) {
      // Clear old vehicle's link if it was pointing at the old trailer
      if (oldVehicle && oldTrailer) {
        db.prepare(
          "UPDATE fleet_vehicles SET linked_trailer_number=NULL WHERE plate_number=? AND linked_trailer_number=?"
        ).run(oldVehicle, oldTrailer);
      }
    }

    // Always sync default (and trailer number) on the new vehicle when vehicle_plate present
    if (newVehicle && newTrailer) {
      db.prepare(
        "UPDATE fleet_vehicles SET linked_trailer_number=?, linked_trailer_default=? WHERE plate_number=?"
      ).run(newTrailer, newDefault, newVehicle);
    } else if (newVehicle && !newTrailer) {
      // Trailer explicitly cleared — clear number and reset default to vehicle
      db.prepare(
        "UPDATE fleet_vehicles SET linked_trailer_number=NULL, linked_trailer_default='vehicle' WHERE plate_number=? AND linked_trailer_number=?"
      ).run(newVehicle, oldTrailer ?? "");
    }
  })();

  // ── Update inventory parts if inv_items provided ───────────────────────────
  if (Array.isArray(inv_items)) {
    const newRefNo  = card_number ? String(card_number).trim() : String(id);
    const oldRefNo  = oldLog?.card_number ? String(oldLog.card_number).trim() : String(id);

    // Restore old items back to inventory
    const oldTxns = db.prepare(
      "SELECT item_id, quantity FROM workshop_inventory_transactions WHERE reason='سجل_عطل' AND type='out' AND reference_no=?"
    ).all(oldRefNo) as { item_id: number; quantity: number }[];
    for (const t of oldTxns) {
      db.prepare("UPDATE workshop_inventory SET quantity=quantity+?, last_updated=datetime('now'), updated_by=? WHERE id=?")
        .run(t.quantity, performed_by ? String(performed_by) : null, t.item_id);
    }
    // Delete old transactions for this log
    db.prepare("DELETE FROM workshop_inventory_transactions WHERE reason='سجل_عطل' AND type='out' AND reference_no=?")
      .run(oldRefNo);

    // Apply new items
    const newItems = (inv_items as Array<{ id: unknown; qty: unknown }>)
      .map(x => ({ id: Number(x.id), qty: Number(x.qty) || 1 }));
    for (const { id: itemId, qty } of newItems) {
      if (!itemId || qty <= 0) continue;
      const item = db.prepare("SELECT * FROM workshop_inventory WHERE id=?")
        .get(itemId) as { id: number; item_name: string; quantity: number; cost_per_unit: number; unit: string } | undefined;
      if (item) {
        const newQty = Math.max(0, Number(item.quantity) - qty);
        db.prepare("UPDATE workshop_inventory SET quantity=?, last_updated=datetime('now'), updated_by=? WHERE id=?")
          .run(newQty, performed_by ? String(performed_by) : null, item.id);
        logInventoryTransaction(item.id, item.item_name, "out", qty, "سجل_عطل",
          newRefNo, String(performed_by || ""), Number(item.cost_per_unit), newVehicle || undefined);
        checkLowStock(item.id);
      }
    }
  }

  res.json({ ok: true });
});

router.post("/maintenance-logs/import", (req, res) => {
  const { rows, imported_by } = req.body as { rows: Record<string, unknown>[]; imported_by?: string };
  if (!Array.isArray(rows) || rows.length === 0)
    return void res.status(400).json({ error: "لا توجد صفوف للاستيراد" });

  const insert = db.prepare(`
    INSERT INTO maintenance_logs
      (card_number, maintenance_date, entry_time, exit_time, exit_date,
       vehicle_plate, driver_name, branch, maintenance_type, description, amount, imported_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  let inserted = 0; let skipped = 0;
  const importAll = db.transaction((rows: Record<string, unknown>[]) => {
    for (const r of rows) {
      const result = insert.run(
        r.card_number ? String(r.card_number).trim() : null,
        r.maintenance_date ?? null,
        r.entry_time ?? null, r.exit_time ?? null, r.exit_date ?? null,
        r.vehicle_plate ?? null, r.driver_name ?? null,
        r.branch ?? null, r.maintenance_type ?? null,
        r.description ?? null, Number(r.amount) || 0,
        imported_by ?? null,
      );
      if (result.changes > 0) inserted++; else skipped++;
    }
  });
  importAll(rows);
  res.json({ ok: true, inserted, skipped });
});

router.patch("/maintenance-logs/:id/printed", (req, res) => {
  const id = req.params.id;
  const current = db.prepare("SELECT is_printed FROM maintenance_logs WHERE id=?").get(id) as { is_printed: number } | undefined;
  if (!current) return void res.status(404).json({ error: "not found" });
  const next = current.is_printed ? 0 : 1;
  db.prepare("UPDATE maintenance_logs SET is_printed=? WHERE id=?").run(next, id);
  res.json({ ok: true, is_printed: next });
});

router.delete("/maintenance-logs/clear", (_req, res) => {
  db.prepare("DELETE FROM maintenance_logs").run();
  res.json({ ok: true, message: "تم مسح جميع سجلات الأعطال" });
});

router.delete("/maintenance-logs/:id", (req, res) => {
  db.prepare("DELETE FROM maintenance_logs WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
//  REIMBURSEMENT REQUESTS — طلبات الاستعاضة
// ══════════════════════════════════════════════════════════════════

router.get("/reimbursement-requests", (req, res) => {
  const { status, submitted_by } = req.query as Record<string, string>;
  let sql = "SELECT * FROM reimbursement_requests WHERE 1=1";
  const params: unknown[] = [];
  if (status)       { sql += " AND status=?";       params.push(status); }
  if (submitted_by) { sql += " AND submitted_by=?"; params.push(submitted_by); }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/reimbursement-requests", diskUpload.single("invoice_image"), (req, res) => {
  const { submitted_by, description, total_amount, invoice_count } = req.body as Record<string, string>;
  if (!submitted_by?.trim()) return void res.status(400).json({ error: "اسم مقدم الطلب مطلوب" });
  const request_number = "REIMB" + Date.now();
  const invoice_image_url = req.file ? `/api/uploads/${req.file.filename}` : null;
  const r = db.prepare(`
    INSERT INTO reimbursement_requests
      (request_number, submitted_by, description, total_amount, invoice_count, invoice_image_url, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    request_number, submitted_by.trim(), description || null,
    parseFloat(total_amount) || 0, parseInt(invoice_count) || 0, invoice_image_url
  );
  // Notify accountants
  const accountants = db.prepare("SELECT phone FROM users WHERE role='accountant' AND active=1").all() as {phone:string}[];
  const insN = db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)");
  for (const u of accountants) insN.run(u.phone, "طلب استعاضة جديد", `قدّم ${submitted_by} طلب استعاضة رقم ${request_number}`);
  res.status(201).json({ id: r.lastInsertRowid, request_number });
});

router.put("/reimbursement-requests/:id/review", (req, res) => {
  const { accountant_name, accountant_notes } = req.body as Record<string, string>;
  const existing = db.prepare("SELECT * FROM reimbursement_requests WHERE id=?").get(req.params.id) as { submitted_by: string } | undefined;
  if (!existing) return void res.status(404).json({ error: "الطلب غير موجود" });
  db.prepare(`
    UPDATE reimbursement_requests
    SET status='accountant_reviewed', accountant_name=?, accountant_notes=?,
        accountant_reviewed_at=datetime('now')
    WHERE id=?
  `).run(accountant_name || null, accountant_notes || null, req.params.id);
  // Notify bank officers
  const banks = db.prepare("SELECT phone FROM users WHERE role='bank_officer' AND active=1").all() as {phone:string}[];
  const insN = db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)");
  for (const u of banks) insN.run(u.phone, "فاتورة استعاضة للمراجعة", `راجع المحاسب طلب استعاضة من ${existing.submitted_by}`);
  res.json({ ok: true });
});

router.put("/reimbursement-requests/:id/reimburse", (req, res) => {
  const { bank_officer_notes } = req.body as Record<string, string>;
  const existing = db.prepare("SELECT * FROM reimbursement_requests WHERE id=?").get(req.params.id) as { submitted_by: string } | undefined;
  if (!existing) return void res.status(404).json({ error: "الطلب غير موجود" });
  db.prepare(`
    UPDATE reimbursement_requests
    SET status='reimbursed', bank_officer_notes=?, reimbursed_at=datetime('now')
    WHERE id=?
  `).run(bank_officer_notes || null, req.params.id);
  // Notify purchasing user
  const purchasers = db.prepare("SELECT phone FROM users WHERE (role='purchasing' OR name=?) AND active=1").all(existing.submitted_by) as {phone:string}[];
  const insN = db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)");
  for (const u of purchasers) insN.run(u.phone, "تم صرف الاستعاضة ✓", `تمت الاستعاضة لطلبك المقدم من ${existing.submitted_by}`);
  res.json({ ok: true });
});

router.delete("/reimbursement-requests/:id", (req, res) => {
  const row = db.prepare("SELECT invoice_image_url FROM reimbursement_requests WHERE id=?").get(req.params.id) as { invoice_image_url: string | null } | undefined;
  if (row?.invoice_image_url) {
    const fname = row.invoice_image_url.split("/").pop()!;
    try { fs.unlinkSync(`${UPLOADS_PATH}/${fname}`); } catch { /* ignore */ }
  }
  db.prepare("DELETE FROM reimbursement_requests WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
//  SUPPLIER REIMBURSEMENT CLAIMS — كشوفات استعاضة الموردين
// ══════════════════════════════════════════════════════════════════

type ClaimRouteError = Error & { statusCode?: number };

function claimRouteError(message: string, statusCode: number): ClaimRouteError {
  return Object.assign(new Error(message), { statusCode });
}

function reserveClaimsForPrinting(claimIds: number[], actor: SupplierClaimActor) {
  if (!claimIds.length || claimIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw claimRouteError("أرقام الكشوف غير صحيحة", 400);
  }
  if (new Set(claimIds).size !== claimIds.length) {
    throw claimRouteError("يوجد رقم كشف مكرر في الطلب", 400);
  }

  return db.transaction(() => {
    const placeholders = claimIds.map(() => "?").join(",");
    const claims = db.prepare(`
      SELECT * FROM supplier_reimbursement_claims
      WHERE id IN (${placeholders})
    `).all(...claimIds) as Array<Record<string, unknown>>;
    if (claims.length !== claimIds.length) {
      throw claimRouteError("بعض الكشوف غير موجودة", 404);
    }
    if (claims.some(claim => Number(claim.is_cancelled))) {
      throw claimRouteError("لا يمكن طباعة كشف ملغي", 409);
    }
    if (claims.some(claim => Number(claim.is_printed))) {
      throw claimRouteError("سبق طباعة أحد هذه الكشوف. ألغِه وأنشئ كشفاً جديداً إذا لزم.", 409);
    }

    const update = db.prepare(`
      UPDATE supplier_reimbursement_claims
      SET is_printed=1, printed_at=COALESCE(printed_at, datetime('now'))
      WHERE id=? AND COALESCE(is_printed,0)=0 AND COALESCE(is_cancelled,0)=0
    `);
    const hasPrintHistory = db.prepare(`
      SELECT 1 FROM supplier_reimbursement_claim_print_events
      WHERE claim_id=? LIMIT 1
    `);
    const insertPrintEvent = db.prepare(`
      INSERT INTO supplier_reimbursement_claim_print_events
        (claim_id, event_type, actor_user_id, actor_name)
      VALUES (?, ?, ?, ?)
    `);
    const claimsById = new Map(claims.map(claim => [Number(claim.id), claim]));
    for (const id of claimIds) {
      if (update.run(id).changes !== 1) {
        throw claimRouteError("تغيّرت حالة أحد الكشوف. حدّث القائمة وحاول مرة أخرى.", 409);
      }
      const claim = claimsById.get(id);
      const alreadyPrinted = Boolean(hasPrintHistory.get(id)) || Boolean(claim?.printed_at);
      insertPrintEvent.run(id, alreadyPrinted ? "reprint" : "original", actor.id, actor.name);
    }
    return db.prepare(`
      SELECT c.*,
        (SELECT actor_name FROM supplier_reimbursement_claim_print_events e
         WHERE e.claim_id=c.id AND e.event_type='original' ORDER BY e.id LIMIT 1) AS original_printed_by,
        (SELECT actor_name FROM supplier_reimbursement_claim_print_events e
         WHERE e.claim_id=c.id AND e.event_type='reprint' ORDER BY e.id DESC LIMIT 1) AS last_reprinted_by,
        (SELECT printed_at FROM supplier_reimbursement_claim_print_events e
         WHERE e.claim_id=c.id AND e.event_type='reprint' ORDER BY e.id DESC LIMIT 1) AS last_reprinted_at
      FROM supplier_reimbursement_claims c
      WHERE c.id IN (${placeholders})
      ORDER BY c.sequence_no, c.id
    `).all(...claimIds);
  })();
}

router.get("/supplier-reimbursement-claims", (req, res) => {
  const { created_by, printed } = req.query as Record<string, string>;
  const printArchiveActor = printed === "true"
    ? requireSupplierClaimActor(req, res)
    : null;
  if (printed === "true" && !printArchiveActor) return;
  let sql = `
    SELECT c.*,
      (SELECT actor_name FROM supplier_reimbursement_claim_print_events e
       WHERE e.claim_id=c.id AND e.event_type='original' ORDER BY e.id LIMIT 1) AS original_printed_by,
      (SELECT actor_name FROM supplier_reimbursement_claim_print_events e
       WHERE e.claim_id=c.id AND e.event_type='reprint' ORDER BY e.id DESC LIMIT 1) AS last_reprinted_by,
      (SELECT printed_at FROM supplier_reimbursement_claim_print_events e
       WHERE e.claim_id=c.id AND e.event_type='reprint' ORDER BY e.id DESC LIMIT 1) AS last_reprinted_at
    FROM supplier_reimbursement_claims c
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (printed === "true") sql += " AND COALESCE(c.is_printed,0)=1";
  if (printArchiveActor && printArchiveActor.role !== "admin") {
    sql += " AND c.created_by = ?";
    params.push(printArchiveActor.name);
  } else if (created_by) {
    sql += " AND c.created_by = ?";
    params.push(created_by);
  }
  sql += " ORDER BY c.sequence_no DESC, c.id DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/supplier-reimbursement-claims", (req, res) => {
  const body = req.body as { invoice_ids?: unknown; notes?: unknown; created_by?: unknown };
  if (!Array.isArray(body.invoice_ids) || body.invoice_ids.length === 0)
    return void res.status(400).json({ error: "لا توجد فواتير محددة" });

  const invoiceIds = body.invoice_ids.map(Number);
  if (invoiceIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(invoiceIds).size !== invoiceIds.length) {
    return void res.status(400).json({ error: "أرقام الفواتير المحددة غير صحيحة أو مكررة" });
  }

  try {
    const created = db.transaction(() => {
      const placeholders = invoiceIds.map(() => "?").join(",");
      const invoices = db.prepare(`
        SELECT * FROM purchase_invoices
        WHERE id IN (${placeholders})
        ORDER BY invoice_date, id
      `).all(...invoiceIds) as Array<Record<string, unknown>>;
      if (invoices.length !== invoiceIds.length) {
        throw claimRouteError("بعض الفواتير لم تعد موجودة. حدّث القائمة وحاول مرة أخرى.", 409);
      }
      if (invoices.some(invoice => invoice.reimbursement_claim_id != null && Number(invoice.reimbursement_claim_id) !== 0)) {
        throw claimRouteError("سبق إدراج إحدى الفواتير في كشف آخر. حدّث القائمة قبل إنشاء كشف جديد.", 409);
      }

      const branches = [...new Set(invoices.map(invoice => String(invoice.branch || "بدون فرع").trim() || "بدون فرع"))];
      if (branches.length !== 1) {
        throw claimRouteError("لا يمكن جمع فواتير أكثر من فرع في كشف واحد", 400);
      }

      const total_before_vat = invoices.reduce((sum, invoice) =>
        sum + (Number(invoice.quantity) || 0) * (Number(invoice.price_before_vat) || 0), 0);
      const total_after_vat = invoices.reduce((sum, invoice) =>
        sum + (Number(invoice.quantity) || 0) * (Number(invoice.price_after_vat) || 0), 0);
      const sequenceNo = Number((db.prepare(
        "SELECT COALESCE(MAX(sequence_no),0)+1 AS next FROM supplier_reimbursement_claims"
      ).get() as { next: number }).next);
      const claimNumber = `RCLAIM-${String(sequenceNo).padStart(6, "0")}`;
      const actor = getSupplierClaimActor(req);
      const createdBy = actor?.name ||
        (typeof body.created_by === "string" ? body.created_by.trim().slice(0, 120) : "");
      const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
      const insert = db.prepare(`
        INSERT INTO supplier_reimbursement_claims
          (claim_number, sequence_no, created_by, branch, total_before_vat, total_after_vat, invoice_count, notes, items_snapshot_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        claimNumber, sequenceNo, createdBy || null, branches[0], total_before_vat,
        total_after_vat, invoices.length, notes || null, JSON.stringify(invoices),
      );
      const claimId = Number(insert.lastInsertRowid);
      const updateInvoice = db.prepare(`
        UPDATE purchase_invoices
        SET reimbursement_claim_id=?
        WHERE id=? AND (reimbursement_claim_id IS NULL OR reimbursement_claim_id=0)
      `);
      for (const id of invoiceIds) {
        if (updateInvoice.run(claimId, id).changes !== 1) {
          throw claimRouteError("سبق إدراج إحدى الفواتير في كشف آخر. لم يتم إنشاء الكشف.", 409);
        }
      }
      return { id: claimId, claim_number: claimNumber, sequence_no: sequenceNo };
    })();
    res.status(201).json({ ok: true, ...created });
  } catch (error) {
    const routeError = error as ClaimRouteError;
    res.status(routeError.statusCode || 500).json({ error: routeError.message || "تعذر إنشاء الكشف" });
  }
});

router.post("/supplier-reimbursement-claims/bulk", (req, res) => {
  const actor = requireSupplierClaimActor(req, res, true);
  if (!actor) return;
  const body = req.body as { invoice_ids?: unknown };
  if (!Array.isArray(body.invoice_ids) || body.invoice_ids.length === 0) {
    res.status(400).json({ error: "حدد فاتورة واحدة على الأقل" });
    return;
  }

  const invoiceIds = body.invoice_ids.map(Number);
  if (
    invoiceIds.some(id => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(invoiceIds).size !== invoiceIds.length
  ) {
    res.status(400).json({ error: "أرقام الفواتير المحددة غير صحيحة أو مكررة" });
    return;
  }

  try {
    const claims = db.transaction(() => {
      const placeholders = invoiceIds.map(() => "?").join(",");
      const invoices = db.prepare(`
        SELECT * FROM purchase_invoices
        WHERE id IN (${placeholders})
        ORDER BY invoice_date, id
      `).all(...invoiceIds) as Array<Record<string, unknown>>;
      if (invoices.length !== invoiceIds.length) {
        throw claimRouteError("بعض الفواتير لم تعد موجودة. حدّث القائمة وحاول مرة أخرى.", 409);
      }
      if (invoices.some(invoice => invoice.reimbursement_claim_id != null && Number(invoice.reimbursement_claim_id) !== 0)) {
        throw claimRouteError("سبق إدراج إحدى الفواتير في كشف آخر. حدّث القائمة وحاول مرة أخرى.", 409);
      }

      const byBranch = new Map<string, Array<Record<string, unknown>>>();
      for (const invoice of invoices) {
        const branch = String(invoice.branch || "بدون فرع").trim() || "بدون فرع";
        byBranch.set(branch, [...(byBranch.get(branch) || []), invoice]);
      }

      const created: Array<Record<string, unknown>> = [];
      const insertClaim = db.prepare(`
        INSERT INTO supplier_reimbursement_claims
          (claim_number, sequence_no, created_by, branch, total_before_vat, total_after_vat,
           invoice_count, items_snapshot_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateInvoice = db.prepare(`
        UPDATE purchase_invoices SET reimbursement_claim_id=?
        WHERE id=? AND (reimbursement_claim_id IS NULL OR reimbursement_claim_id=0)
      `);

      for (const [branch, branchInvoices] of byBranch) {
        const totalBeforeVat = branchInvoices.reduce(
          (sum, invoice) => sum + (Number(invoice.quantity) || 0) * (Number(invoice.price_before_vat) || 0),
          0,
        );
        const totalAfterVat = branchInvoices.reduce(
          (sum, invoice) => sum + (Number(invoice.quantity) || 0) * (Number(invoice.price_after_vat) || 0),
          0,
        );
        const sequenceNo = Number((db.prepare(
          "SELECT COALESCE(MAX(sequence_no),0)+1 AS next FROM supplier_reimbursement_claims"
        ).get() as { next: number }).next);
        const claimNumber = `RCLAIM-${String(sequenceNo).padStart(6, "0")}`;
        const result = insertClaim.run(
          claimNumber, sequenceNo, actor.name, branch, totalBeforeVat,
          totalAfterVat, branchInvoices.length, JSON.stringify(branchInvoices),
        );
        const claimId = Number(result.lastInsertRowid);
        for (const invoice of branchInvoices) {
          if (updateInvoice.run(claimId, invoice.id).changes !== 1) {
            throw claimRouteError("سبق إدراج إحدى الفواتير في كشف آخر. لم يتم إنشاء الكشوف.", 409);
          }
        }
        created.push(db.prepare(
          "SELECT * FROM supplier_reimbursement_claims WHERE id=?"
        ).get(claimId) as Record<string, unknown>);
      }
      return created;
    })();
    res.status(201).json({ ok: true, claims });
  } catch (error) {
    const routeError = error as ClaimRouteError;
    res.status(routeError.statusCode || 500).json({ error: routeError.message || "تعذر إنشاء الكشوف" });
  }
});

router.get("/supplier-reimbursement-claims/:id/invoices", (req, res) => {
  const claim = db.prepare(
    "SELECT items_snapshot_json FROM supplier_reimbursement_claims WHERE id=?"
  ).get(req.params.id) as { items_snapshot_json: string | null } | undefined;
  if (!claim) return void res.status(404).json({ error: "الكشف غير موجود" });
  if (claim.items_snapshot_json) {
    try {
      const snapshot = JSON.parse(claim.items_snapshot_json) as unknown;
      if (Array.isArray(snapshot)) return void res.json(snapshot);
    } catch {
      return void res.status(500).json({ error: "تعذر قراءة نسخة فواتير الكشف" });
    }
  }
  const rows = db.prepare("SELECT * FROM purchase_invoices WHERE reimbursement_claim_id = ? ORDER BY invoice_date, id").all(req.params.id);
  return void res.json(rows);
});

router.patch("/supplier-reimbursement-claims/:id/signature-settings", (req, res) => {
  const claimId = Number(req.params.id);
  const includeDriverSignatures = (req.body as { include_driver_signatures?: unknown }).include_driver_signatures;
  if (!Number.isSafeInteger(claimId) || claimId <= 0 || typeof includeDriverSignatures !== "boolean") {
    return void res.status(400).json({ error: "اختيار توقيعات السائقين غير صحيح" });
  }
  try {
    db.transaction(() => {
      const claim = db.prepare(
        "SELECT is_printed, is_cancelled FROM supplier_reimbursement_claims WHERE id=?"
      ).get(claimId) as { is_printed: number; is_cancelled: number } | undefined;
      if (!claim) throw claimRouteError("الكشف غير موجود", 404);
      if (Number(claim.is_printed) || Number(claim.is_cancelled)) {
        throw claimRouteError("لا يمكن تغيير خيارات كشف مطبوع أو ملغي", 409);
      }
      const update = db.prepare(`
        UPDATE supplier_reimbursement_claims SET include_driver_signatures=?
        WHERE id=? AND COALESCE(is_printed,0)=0 AND COALESCE(is_cancelled,0)=0
      `).run(includeDriverSignatures ? 1 : 0, claimId);
      if (update.changes !== 1) throw claimRouteError("تغيّرت حالة الكشف. حدّث القائمة وحاول مرة أخرى.", 409);
    })();
    res.json({ ok: true, include_driver_signatures: includeDriverSignatures });
  } catch (error) {
    const routeError = error as ClaimRouteError;
    res.status(routeError.statusCode || 500).json({ error: routeError.message || "تعذر حفظ إعداد التوقيعات" });
  }
});

router.post("/supplier-reimbursement-claims/mark-printed", (req, res) => {
  const actor = requireSupplierClaimActor(req, res);
  if (!actor) return;
  const body = req.body as { ids?: unknown };
  if (!Array.isArray(body.ids)) return void res.status(400).json({ error: "أرقام الكشوف مطلوبة" });
  const claimIds = body.ids.map(Number);
  try {
    const claims = reserveClaimsForPrinting(claimIds, actor);
    res.json({ ok: true, claims });
  } catch (error) {
    const routeError = error as ClaimRouteError;
    res.status(routeError.statusCode || 500).json({ error: routeError.message || "تعذر تسجيل طباعة الكشوف" });
  }
});

router.patch("/supplier-reimbursement-claims/:id/mark-printed", (req, res) => {
  const actor = requireSupplierClaimActor(req, res);
  if (!actor) return;
  try {
    const claim = reserveClaimsForPrinting([Number(req.params.id)], actor)[0];
    res.json({ ok: true, claim });
  } catch (error) {
    const routeError = error as ClaimRouteError;
    res.status(routeError.statusCode || 500).json({ error: routeError.message || "تعذر تسجيل طباعة الكشف" });
  }
});

router.post("/supplier-reimbursement-claims/:id/reprint", (req, res) => {
  const actor = requireSupplierClaimActor(req, res, true);
  if (!actor) return;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const claimId = Number(rawId);
  if (!Number.isSafeInteger(claimId) || claimId <= 0) {
    res.status(400).json({ error: "رقم الكشف غير صحيح" });
    return;
  }

  try {
    const result = db.transaction(() => {
      const claim = db.prepare(
        "SELECT * FROM supplier_reimbursement_claims WHERE id=?"
      ).get(claimId) as Record<string, unknown> | undefined;
      if (!claim) throw claimRouteError("الكشف غير موجود", 404);
      if (!Number(claim.is_printed)) {
        throw claimRouteError("إعادة الطباعة متاحة للكشوف المطبوعة فقط", 409);
      }
      const eventId = Number(db.prepare(`
        INSERT INTO supplier_reimbursement_claim_print_events
          (claim_id, event_type, actor_user_id, actor_name)
        VALUES (?, 'reprint', ?, ?)
      `).run(claimId, actor.id, actor.name).lastInsertRowid);
      const event = db.prepare(
        "SELECT id, claim_id, event_type, actor_user_id, actor_name, printed_at FROM supplier_reimbursement_claim_print_events WHERE id=?"
      ).get(eventId);
      const updatedClaim = db.prepare(`
        SELECT c.*,
          (SELECT actor_name FROM supplier_reimbursement_claim_print_events e
           WHERE e.claim_id=c.id AND e.event_type='original' ORDER BY e.id LIMIT 1) AS original_printed_by,
          (SELECT actor_name FROM supplier_reimbursement_claim_print_events e
           WHERE e.claim_id=c.id AND e.event_type='reprint' ORDER BY e.id DESC LIMIT 1) AS last_reprinted_by,
          (SELECT printed_at FROM supplier_reimbursement_claim_print_events e
           WHERE e.claim_id=c.id AND e.event_type='reprint' ORDER BY e.id DESC LIMIT 1) AS last_reprinted_at
        FROM supplier_reimbursement_claims c WHERE c.id=?
      `).get(claimId);
      return { event, claim: updatedClaim };
    })();
    res.json({ ok: true, ...result });
  } catch (error) {
    const routeError = error as ClaimRouteError;
    res.status(routeError.statusCode || 500).json({ error: routeError.message || "تعذرت إعادة طباعة الكشف" });
  }
});

router.patch("/supplier-reimbursement-claims/:id/cancel-print", (req, res) => {
  const actor = requireSupplierClaimActor(req, res);
  if (!actor) return;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const claimId = Number(rawId);
  if (!Number.isSafeInteger(claimId) || claimId <= 0) {
    res.status(400).json({ error: "رقم الكشف غير صحيح" });
    return;
  }

  try {
    const claim = db.transaction(() => {
      const current = db.prepare(`
        SELECT id, created_by, is_printed, is_cancelled, printed_at
        FROM supplier_reimbursement_claims WHERE id=?
      `).get(claimId) as {
        id: number;
        created_by: string;
        is_printed: number;
        is_cancelled: number;
        printed_at: string | null;
      } | undefined;
      if (!current) throw claimRouteError("الكشف غير موجود", 404);
      if (actor.role !== "admin" && current.created_by !== actor.name) {
        throw claimRouteError("لا تملك صلاحية إلغاء طباعة هذا الكشف", 403);
      }
      if (Number(current.is_cancelled)) {
        throw claimRouteError("لا يمكن إلغاء طباعة كشف ملغي", 409);
      }
      if (!Number(current.is_printed)) {
        throw claimRouteError("الكشف غير مطبوع بالفعل", 409);
      }

      const update = db.prepare(`
        UPDATE supplier_reimbursement_claims
        SET is_printed=0
        WHERE id=? AND COALESCE(is_printed,0)=1 AND COALESCE(is_cancelled,0)=0
      `).run(claimId);
      if (update.changes !== 1) {
        throw claimRouteError("تغيّرت حالة الكشف. حدّث القائمة وحاول مرة أخرى.", 409);
      }
      return { id: current.id, is_printed: 0, printed_at: current.printed_at };
    })();
    res.json({ ok: true, claim });
  } catch (error) {
    const routeError = error as ClaimRouteError;
    res.status(routeError.statusCode || 500).json({ error: routeError.message || "تعذر إلغاء حالة الطباعة" });
  }
});

const cancelSupplierClaim = (req: Request, res: Response) => {
  const claimId = Number(req.params.id);
  if (!Number.isSafeInteger(claimId) || claimId <= 0) return void res.status(400).json({ error: "رقم الكشف غير صحيح" });
  const body = (req.body || {}) as { cancelled_by?: unknown };
  const cancelledBy = typeof body.cancelled_by === "string" ? body.cancelled_by.trim().slice(0, 120) : "";
  try {
    const result = db.transaction(() => {
      const claim = db.prepare(`
        SELECT id, is_cancelled, items_snapshot_json
        FROM supplier_reimbursement_claims WHERE id=?
      `).get(claimId) as { id: number; is_cancelled: number; items_snapshot_json: string | null } | undefined;
      if (!claim) throw claimRouteError("الكشف غير موجود", 404);
      if (Number(claim.is_cancelled)) throw claimRouteError("الكشف ملغي بالفعل", 409);

      const linkedInvoices = db.prepare(`
        SELECT * FROM purchase_invoices
        WHERE reimbursement_claim_id=?
        ORDER BY invoice_date, id
      `).all(claimId) as Array<Record<string, unknown>>;
      const existingSnapshot = claim.items_snapshot_json?.trim();
      const snapshotToSave = existingSnapshot || JSON.stringify(linkedInvoices);
      db.prepare(`
        UPDATE supplier_reimbursement_claims
        SET is_cancelled=1, cancelled_at=datetime('now'), cancelled_by=?, items_snapshot_json=?
        WHERE id=?
      `).run(cancelledBy || null, snapshotToSave, claimId);
      const released = db.prepare(
        "UPDATE purchase_invoices SET reimbursement_claim_id=NULL WHERE reimbursement_claim_id=?"
      ).run(claimId);
      return { released_count: released.changes };
    })();
    res.json({ ok: true, ...result });
  } catch (error) {
    const routeError = error as ClaimRouteError;
    res.status(routeError.statusCode || 500).json({ error: routeError.message || "تعذر إلغاء الكشف" });
  }
};

router.patch("/supplier-reimbursement-claims/:id/cancel", cancelSupplierClaim);
// Keep the existing endpoint as a backwards-compatible soft-cancel operation.
router.delete("/supplier-reimbursement-claims/:id", cancelSupplierClaim);

export default router;
