import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// ── Warehouses CRUD ───────────────────────────────────────────────────────────
router.get("/warehouses", (_req, res) => {
  const warehouses = db.prepare("SELECT w.*, (SELECT COUNT(*) FROM warehouse_items wi WHERE wi.warehouse_id = w.id) as items_count, (SELECT SUM(quantity) FROM warehouse_items wi WHERE wi.warehouse_id = w.id) as total_stock FROM warehouses w WHERE w.active=1 ORDER BY w.name").all();
  res.json(warehouses);
});

router.get("/warehouses/:id", (req, res) => {
  const w = db.prepare("SELECT * FROM warehouses WHERE id = ?").get(req.params.id);
  if (!w) return void res.status(404).json({ error: "المستودع غير موجود" });
  const items = db.prepare("SELECT * FROM warehouse_items WHERE warehouse_id = ? ORDER BY product_name").all(req.params.id);
  res.json({ ...w as Record<string, unknown>, items });
});

router.post("/warehouses", (req, res) => {
  const { name, location, manager_name, capacity, notes } = req.body;
  const result = db.prepare("INSERT INTO warehouses (name,location,manager_name,capacity,notes) VALUES (?,?,?,?,?)").run(name, location||null, manager_name||null, parseInt(capacity)||0, notes||null);
  res.status(201).json({ id: result.lastInsertRowid, message: "تم إضافة المستودع" });
});

router.put("/warehouses/:id", (req, res) => {
  const { name, location, manager_name, capacity, notes, active } = req.body;
  db.prepare("UPDATE warehouses SET name=?,location=?,manager_name=?,capacity=?,notes=?,active=? WHERE id=?")
    .run(name, location||null, manager_name||null, parseInt(capacity)||0, notes||null, active??1, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/warehouses/:id", (req, res) => {
  db.prepare("UPDATE warehouses SET active=0 WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// ── Warehouse Items ────────────────────────────────────────────────────────────
router.get("/warehouses/:id/items", (req, res) => {
  res.json(db.prepare("SELECT * FROM warehouse_items WHERE warehouse_id = ? ORDER BY product_name").all(req.params.id));
});

router.post("/warehouses/:id/items", (req, res) => {
  const { product_name, product_id, quantity, unit, min_stock, notes } = req.body;
  const result = db.prepare("INSERT INTO warehouse_items (warehouse_id,product_name,product_id,quantity,unit,min_stock,notes) VALUES (?,?,?,?,?,?,?)").run(req.params.id, product_name, product_id||null, parseFloat(quantity)||0, unit||"وحدة", parseFloat(min_stock)||0, notes||null);
  res.status(201).json({ id: result.lastInsertRowid, message: "تم إضافة الصنف" });
});

router.put("/warehouses/:wid/items/:iid", (req, res) => {
  const { product_name, quantity, unit, min_stock, notes } = req.body;
  db.prepare("UPDATE warehouse_items SET product_name=?,quantity=?,unit=?,min_stock=?,notes=?,last_updated=datetime('now') WHERE id=? AND warehouse_id=?")
    .run(product_name, parseFloat(quantity)||0, unit, parseFloat(min_stock)||0, notes||null, req.params.iid, req.params.wid);
  res.json({ message: "تم التحديث" });
});

router.delete("/warehouses/:wid/items/:iid", (req, res) => {
  db.prepare("DELETE FROM warehouse_items WHERE id=? AND warehouse_id=?").run(req.params.iid, req.params.wid);
  res.json({ message: "تم الحذف" });
});

// Bulk import items from CSV data
router.post("/warehouses/:id/items/bulk", (req, res) => {
  const { rows } = req.body as { rows: { product_name: string; quantity: number; unit: string; min_stock: number }[] };
  if (!Array.isArray(rows)) return void res.status(400).json({ error: "rows مطلوب" });
  let count = 0;
  const stmt = db.prepare("INSERT OR REPLACE INTO warehouse_items (warehouse_id,product_name,quantity,unit,min_stock) VALUES (?,?,?,?,?)");
  for (const row of rows) {
    stmt.run(req.params.id, row.product_name, parseFloat(String(row.quantity))||0, row.unit||"وحدة", parseFloat(String(row.min_stock))||0);
    count++;
  }
  res.json({ imported: count, message: `تم استيراد ${count} صنف` });
});

export default router;
