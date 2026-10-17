import { Router } from "express";
import { queryProductionD1 } from "../lib/cloudflare-d1.js";

const router = Router();

function useD1WarehousesBackend(): boolean {
  if (process.env.NODE_ENV === "production" && process.env.ERP_DATABASE_BACKEND === "d1") {
    if (process.env.ERP_D1_WAREHOUSES_ENABLED !== "1") {
      throw new Error("[warehouses] D1 backend is selected but ERP_D1_WAREHOUSES_ENABLED is not enabled");
    }
    return true;
  }
  return false;
}

async function getSqliteDb() {
  return (await import("../lib/db.js")).default;
}

async function queryAll<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  if (useD1WarehousesBackend()) {
    return (await queryProductionD1<T>(sql, params)).results;
  }
  const db = await getSqliteDb();
  return db.prepare(sql).all(...params) as T[];
}

async function queryOne<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
  if (useD1WarehousesBackend()) {
    return (await queryProductionD1<T>(sql, params)).results[0];
  }
  const db = await getSqliteDb();
  return db.prepare(sql).get(...params) as T | undefined;
}

async function execute(sql: string, ...params: unknown[]): Promise<{ lastInsertRowid: number | bigint; changes: number }> {
  if (useD1WarehousesBackend()) {
    const result = await queryProductionD1(sql, params);
    return {
      lastInsertRowid: result.meta?.last_row_id ?? 0,
      changes: result.meta?.changes ?? 0,
    };
  }
  const db = await getSqliteDb();
  return db.prepare(sql).run(...params);
}

async function syncProductStock(productId: number | string) {
  const row = await queryOne<{ total: number }>("SELECT COALESCE(SUM(quantity),0) as total FROM warehouse_items WHERE product_id=?", productId);
  await execute("UPDATE products SET stock=? WHERE id=?", row?.total ?? 0, productId);
}

// ── Warehouses CRUD ───────────────────────────────────────────────────────────
router.get("/warehouses", async (_req, res) => {
  const warehouses = await queryAll("SELECT w.*, (SELECT COUNT(*) FROM warehouse_items wi WHERE wi.warehouse_id = w.id) as items_count, (SELECT SUM(quantity) FROM warehouse_items wi WHERE wi.warehouse_id = w.id) as total_stock FROM warehouses w WHERE w.active=1 ORDER BY w.name");
  res.json(warehouses);
});

router.get("/warehouses/all", async (_req, res) => {
  const warehouses = await queryAll("SELECT w.*, (SELECT COUNT(*) FROM warehouse_items wi WHERE wi.warehouse_id = w.id) as items_count, (SELECT SUM(quantity) FROM warehouse_items wi WHERE wi.warehouse_id = w.id) as total_stock FROM warehouses w ORDER BY w.name");
  res.json(warehouses);
});

router.get("/warehouses/:id", async (req, res) => {
  const w = await queryOne("SELECT * FROM warehouses WHERE id = ?", req.params.id);
  if (!w) return void res.status(404).json({ error: "المستودع غير موجود" });
  const items = await queryAll("SELECT * FROM warehouse_items WHERE warehouse_id = ? ORDER BY product_name", req.params.id);
  res.json({ ...w as Record<string, unknown>, items });
});

router.post("/warehouses", async (req, res) => {
  const { name, location, manager_name, capacity, notes, lat, lng, warehouse_manager_user_id } = req.body;
  const result = await execute(
    "INSERT INTO warehouses (name,location,manager_name,capacity,notes,lat,lng,warehouse_manager_user_id) VALUES (?,?,?,?,?,?,?,?)"
  , name, location||null, manager_name||null, parseInt(capacity)||0, notes||null, lat||null, lng||null, warehouse_manager_user_id||null);

  const newWarehouseId = result.lastInsertRowid;
  const categories = await queryAll<{ category: string; unit: string }>(
    "SELECT DISTINCT category, unit FROM products WHERE active=1 AND category IS NOT NULL AND category != ''"
  );
  for (const cat of categories) {
    await execute("INSERT INTO warehouse_items (warehouse_id,product_name,quantity,unit,min_stock) VALUES (?,?,0,?,0)", newWarehouseId, cat.category, cat.unit);
  }

  res.status(201).json({ id: newWarehouseId, message: "تم إضافة المستودع" });
});

router.put("/warehouses/:id", async (req, res) => {
  const { name, location, manager_name, capacity, notes, active, lat, lng, warehouse_manager_user_id } = req.body;
  await execute("UPDATE warehouses SET name=?,location=?,manager_name=?,capacity=?,notes=?,active=?,lat=?,lng=?,warehouse_manager_user_id=? WHERE id=?",
    name, location||null, manager_name||null, parseInt(capacity)||0, notes||null, active??1, lat||null, lng||null, warehouse_manager_user_id||null, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/warehouses/:id", async (req, res) => {
  await execute("UPDATE warehouses SET active=0 WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

// ── Warehouse Items ────────────────────────────────────────────────────────────
router.get("/warehouses/:id/items", async (req, res) => {
  res.json(await queryAll("SELECT wi.*, p.active as product_listed FROM warehouse_items wi LEFT JOIN products p ON wi.product_id = p.id WHERE wi.warehouse_id = ? ORDER BY wi.product_name", req.params.id));
});

router.post("/warehouses/:id/items", async (req, res) => {
  const { product_name, product_id, quantity, unit, min_stock, notes } = req.body;
  if (product_id) {
    const existing = await queryOne("SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_id=?", req.params.id, product_id);
    if (existing) {
      return void res.status(409).json({ error: "هذا المنتج موجود بالفعل في المستودع" });
    }
  }
  const result = await execute("INSERT INTO warehouse_items (warehouse_id,product_name,product_id,quantity,unit,min_stock,notes) VALUES (?,?,?,?,?,?,?)", req.params.id, product_name, product_id||null, parseFloat(quantity)||0, unit||"وحدة", parseFloat(min_stock)||0, notes||null);
  if (product_id) await syncProductStock(product_id);
  res.status(201).json({ id: result.lastInsertRowid, message: "تم إضافة الصنف" });
});

router.patch("/warehouses/:wid/items/:iid/toggle", async (req, res) => {
  const row = await queryOne<{ active: number }>("SELECT active FROM warehouse_items WHERE id=? AND warehouse_id=?", req.params.iid, req.params.wid);
  if (!row) return void res.status(404).json({ error: "الصنف غير موجود" });
  await execute("UPDATE warehouse_items SET active=? WHERE id=? AND warehouse_id=?", row.active ? 0 : 1, req.params.iid, req.params.wid);
  res.json({ active: row.active ? 0 : 1 });
});

router.delete("/warehouses/:wid/items/:iid", async (req, res) => {
  const item = await queryOne<{ product_id: number | null }>("SELECT product_id FROM warehouse_items WHERE id=? AND warehouse_id=?", req.params.iid, req.params.wid);
  await execute("DELETE FROM warehouse_items WHERE id=? AND warehouse_id=?", req.params.iid, req.params.wid);
  if (item?.product_id) await syncProductStock(item.product_id);
  res.json({ message: "تم الحذف" });
});

// ── Warehouse items with max_stock ────────────────────────────────────────────
router.put("/warehouses/:wid/items/:iid", async (req, res) => {
  const { product_name, quantity, unit, min_stock, max_stock, notes } = req.body;
  const before = await queryOne<{ product_id: number | null }>("SELECT product_id FROM warehouse_items WHERE id=? AND warehouse_id=?", req.params.iid, req.params.wid);
  await execute("UPDATE warehouse_items SET product_name=?,quantity=?,unit=?,min_stock=?,max_stock=?,notes=?,last_updated=datetime('now') WHERE id=? AND warehouse_id=?",
    product_name, parseFloat(quantity)||0, unit, parseFloat(min_stock)||0, parseFloat(max_stock)||0, notes||null, req.params.iid, req.params.wid);
  if (before?.product_id) await syncProductStock(before.product_id);
  res.json({ message: "تم التحديث" });
});

// ── Transfer order to another warehouse ───────────────────────────────────────
router.put("/warehouses/transfer-order/:orderId", async (req, res) => {
  const { target_warehouse_id, reason, transferred_by } = req.body;
  if (!target_warehouse_id) return void res.status(400).json({ error: "المستودع الهدف مطلوب" });
  const order = await queryOne<Record<string, unknown>>("SELECT * FROM workflow_orders WHERE id=?", req.params.orderId);
  if (!order) return void res.status(404).json({ error: "الطلب غير موجود" });
  const target = await queryOne<Record<string, unknown>>("SELECT * FROM warehouses WHERE id=? AND active=1", target_warehouse_id);
  if (!target) return void res.status(404).json({ error: "المستودع المحدد غير موجود" });

  await execute(
    "UPDATE workflow_orders SET invoice_warehouse_id=?, notes=COALESCE(notes,'') || ? WHERE id=?"
  ,
    target_warehouse_id,
    `\n[ترحيل] ${new Date().toLocaleString('ar')} - بواسطة ${transferred_by||'غير محدد'}: ${reason||''}`,
    req.params.orderId,
  );

  // Sync product stock after transfer in case the order's product exists in warehouse_items
  const orderRow = await queryOne<{ product_id: number | null }>("SELECT product_id FROM workflow_orders WHERE id=?", req.params.orderId);
  if (orderRow?.product_id) await syncProductStock(orderRow.product_id);

  res.json({ message: `تم الترحيل إلى ${target.name}` });
});

// ── Deduct stock after dispatch ────────────────────────────────────────────────
router.post("/warehouses/:wid/deduct", async (req, res) => {
  const { product_name, quantity } = req.body;
  if (!product_name || !quantity) return void res.status(400).json({ error: "المنتج والكمية مطلوبان" });
  const item = await queryOne<Record<string, unknown>>(
    "SELECT * FROM warehouse_items WHERE warehouse_id=? AND product_name LIKE ? LIMIT 1"
  , req.params.wid, `%${product_name}%`);
  if (!item) return void res.status(404).json({ error: "الصنف غير موجود في المستودع" });
  const newQty = Math.max(0, (item.quantity as number) - parseFloat(quantity));
  await execute("UPDATE warehouse_items SET quantity=?,last_updated=datetime('now') WHERE id=?", newQty, item.id);

  if (item.product_id) await syncProductStock(item.product_id as number);

  // Check auto-replenishment
  const settings = await queryOne<Record<string, unknown>>("SELECT * FROM invoice_settings WHERE id=1");
  if (settings?.auto_replenishment && newQty <= (item.min_stock as number)) {
    const config = await queryOne<Record<string, unknown>>(
      "SELECT * FROM trailer_load_configs WHERE product_category=? LIMIT 1"
    , item.product_name as string);
    const trailerCap = (config?.trailer_capacity as number) || 1;
    const loads = Math.ceil((item.min_stock as number) / trailerCap) || 1;
    const wh = await queryOne<Record<string, unknown>>("SELECT name FROM warehouses WHERE id=?", req.params.wid);
    await execute(`
      INSERT INTO supply_requests (warehouse_id, warehouse_name, product_name, requested_qty, unit, trailer_loads, auto_triggered, destination_division, priority)
      VALUES (?,?,?,?,?,?,1,'المصنع','urgent')
    `, req.params.wid, wh?.name||null, item.product_name, item.min_stock, item.unit, loads);
  }
  res.json({ message: "تم الخصم", new_quantity: newQty });
});

// ── Auto-replenish scan: create requests for all items currently below min_stock ─
router.post("/warehouses/:id/auto-replenish-scan", async (req, res) => {
  const wh = await queryOne<Record<string, unknown>>("SELECT * FROM warehouses WHERE id=?", req.params.id);
  if (!wh) return void res.status(404).json({ error: "المستودع غير موجود" });

  const lowItems = await queryAll<Record<string, unknown>>(
    "SELECT * FROM warehouse_items WHERE warehouse_id=? AND active=1 AND min_stock > 0 AND quantity <= min_stock"
  , req.params.id);

  let created = 0;
  for (const item of lowItems) {
    // Skip if a non-cancelled/non-rejected pending request already exists for this product
    const existing = await queryOne(
      "SELECT id FROM supply_requests WHERE warehouse_id=? AND product_name=? AND status NOT IN ('cancelled','rejected','received','completed','redirected') LIMIT 1"
    , req.params.id, item.product_name);
    if (existing) continue;

    const config = await queryOne<{ trailer_capacity: number }>(
      "SELECT * FROM trailer_load_configs WHERE product_category=? LIMIT 1"
    , item.product_name as string);
    const trailerCap = config?.trailer_capacity || 1;
    const neededQty  = Math.max((item.min_stock as number), 1);
    const loads      = Math.ceil(neededQty / trailerCap) || 1;

    await execute(`
      INSERT INTO supply_requests
        (warehouse_id, warehouse_name, product_name, requested_qty, unit, trailer_loads, auto_triggered, destination_division, priority)
      VALUES (?,?,?,?,?,?,1,'المصنع','urgent')
    `, req.params.id, wh.name, item.product_name, neededQty, item.unit, loads);
    created++;
  }

  res.json({ created, total_low: lowItems.length });
});

// ── Orders by warehouse ────────────────────────────────────────────────────────
router.get("/warehouses/:id/orders", async (req, res) => {
  const { stage, limit } = req.query as Record<string, string>;
  let sql = "SELECT * FROM workflow_orders WHERE (warehouse_id = ? OR invoice_warehouse_id = ?)";
  const params: (string | number)[] = [req.params.id, req.params.id];
  if (stage) { sql += " AND stage = ?"; params.push(stage); }
  sql += " ORDER BY created_at DESC";
  if (limit) { sql += " LIMIT ?"; params.push(parseInt(limit)); }
  res.json(await queryAll(sql, ...params));
});

// ── Warehouse Dispatch Orders ──────────────────────────────────────────────────
router.get("/warehouse-dispatch-orders", async (req, res) => {
  const { warehouse_id } = req.query as Record<string, string>;
  if (warehouse_id) {
    res.json(await queryAll("SELECT * FROM warehouse_dispatch_orders WHERE warehouse_id=? ORDER BY created_at DESC", warehouse_id));
  } else {
    res.json(await queryAll("SELECT * FROM warehouse_dispatch_orders ORDER BY created_at DESC"));
  }
});

router.post("/warehouse-dispatch-orders", async (req, res) => {
  const { warehouse_id, warehouse_name, product_name, product_id, unit, quantity, price, payment_status, recipient_name, notes, created_by } = req.body as Record<string, string | number>;
  if (!warehouse_id || !product_name || !quantity || price === undefined) {
    return void res.status(400).json({ error: "warehouse_id, product_name, quantity, price مطلوبة" });
  }
  const result = await execute(`
    INSERT INTO warehouse_dispatch_orders
      (warehouse_id, warehouse_name, product_name, product_id, unit, quantity, price, payment_status, recipient_name, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `,
    warehouse_id, warehouse_name || null, product_name,
    product_id || null, unit || "وحدة",
    parseFloat(String(quantity)),
    parseFloat(String(price)),
    payment_status || "unpaid",
    recipient_name || null,
    notes || null,
    created_by || null
  );
  res.json({ id: result.lastInsertRowid, message: "تم إنشاء أمر الصرف" });
});

router.put("/warehouse-dispatch-orders/:id/deliver", async (req, res) => {
  const order = await queryOne<Record<string, unknown>>("SELECT * FROM warehouse_dispatch_orders WHERE id=?", req.params.id);
  if (!order) return void res.status(404).json({ error: "الأمر غير موجود" });
  if (order.status === "delivered") return void res.status(400).json({ error: "تم تسليم هذا الأمر مسبقاً" });

  // Deduct from warehouse stock
  const item = await queryOne<Record<string, unknown>>(
    "SELECT * FROM warehouse_items WHERE warehouse_id=? AND (product_id=? OR product_name LIKE ?) LIMIT 1"
  , order.warehouse_id, order.product_id || -1, `%${order.product_name}%`);

  if (item) {
    const newQty = Math.max(0, (item.quantity as number) - (order.quantity as number));
    await execute("UPDATE warehouse_items SET quantity=?,last_updated=datetime('now') WHERE id=?", newQty, item.id);
    // Sync global product stock
    if (item.product_id) {
      const totalStock = (await queryOne<{ t: number }>("SELECT COALESCE(SUM(quantity),0) as t FROM warehouse_items WHERE product_id=?", item.product_id as number))?.t ?? 0;
      await execute("UPDATE products SET stock=? WHERE id=?", totalStock, item.product_id);
    }
  }

  await execute("UPDATE warehouse_dispatch_orders SET status='delivered', delivered_at=datetime('now') WHERE id=?", req.params.id);
  res.json({ message: "تم التسليم وخصم الكمية من المستودع" });
});

router.patch("/warehouse-dispatch-orders/:id/payment", async (req, res) => {
  const order = await queryOne("SELECT id FROM warehouse_dispatch_orders WHERE id=?", req.params.id);
  if (!order) return void res.status(404).json({ error: "الأمر غير موجود" });
  const { payment_status } = req.body as { payment_status: string };
  if (!["paid", "unpaid"].includes(payment_status)) return void res.status(400).json({ error: "قيمة غير صالحة" });
  await execute("UPDATE warehouse_dispatch_orders SET payment_status=? WHERE id=?", payment_status, req.params.id);
  res.json({ message: "تم تحديث حالة الدفع" });
});

router.delete("/warehouse-dispatch-orders/:id", async (req, res) => {
  const order = await queryOne<{ status: string }>("SELECT status FROM warehouse_dispatch_orders WHERE id=?", req.params.id);
  if (!order) return void res.status(404).json({ error: "الأمر غير موجود" });
  if (order.status === "delivered") return void res.status(400).json({ error: "لا يمكن حذف أمر تم تسليمه" });
  await execute("DELETE FROM warehouse_dispatch_orders WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

// Bulk import items from CSV data
router.post("/warehouses/:id/items/bulk", async (req, res) => {
  const { rows } = req.body as { rows: { product_name: string; quantity: number; unit: string; min_stock: number }[] };
  if (!Array.isArray(rows)) return void res.status(400).json({ error: "rows مطلوب" });
  let count = 0;
  for (const row of rows) {
    await execute("INSERT OR REPLACE INTO warehouse_items (warehouse_id,product_name,quantity,unit,min_stock) VALUES (?,?,?,?,?)", req.params.id, row.product_name, parseFloat(String(row.quantity))||0, row.unit||"وحدة", parseFloat(String(row.min_stock))||0);
    count++;
  }
  res.json({ imported: count, message: `تم استيراد ${count} صنف` });
});

// ── تعديل أمر صرف (pending فقط) ──────────────────────────────────────────────
router.put("/warehouse-dispatch-orders/:id", async (req, res) => {
  const order = await queryOne<{ status: string }>("SELECT * FROM warehouse_dispatch_orders WHERE id=?", req.params.id);
  if (!order) return void res.status(404).json({ error: "الأمر غير موجود" });
  if (order.status === "delivered") return void res.status(400).json({ error: "لا يمكن تعديل أمر تم تسليمه" });
  const { quantity, price, recipient_name, notes, payment_status } = req.body as Record<string, unknown>;
  await execute(`
    UPDATE warehouse_dispatch_orders
    SET quantity=?, price=?, recipient_name=?, notes=?, payment_status=?
    WHERE id=?
  `,
    parseFloat(String(quantity)) || 0,
    parseFloat(String(price)) || 0,
    recipient_name ? String(recipient_name) : null,
    notes ? String(notes) : null,
    ["paid","unpaid"].includes(String(payment_status)) ? payment_status : "unpaid",
    req.params.id,
  );
  res.json({ message: "تم تحديث أمر الصرف" });
});

// ── مرتجعات المستودع ──────────────────────────────────────────────────────────
router.get("/warehouse-returns", async (req, res) => {
  const { warehouse_id } = req.query as Record<string, string>;
  if (warehouse_id) {
    res.json(await queryAll("SELECT * FROM warehouse_returns WHERE warehouse_id=? ORDER BY created_at DESC", warehouse_id));
  } else {
    res.json(await queryAll("SELECT * FROM warehouse_returns ORDER BY created_at DESC"));
  }
});

router.post("/warehouse-returns", async (req, res) => {
  const { warehouse_id, warehouse_name, product_name, product_id, warehouse_item_id, unit, quantity, reason, returned_by, created_by } = req.body as Record<string, unknown>;
  if (!warehouse_id || !product_name || !quantity) {
    return void res.status(400).json({ error: "warehouse_id, product_name, quantity مطلوبة" });
  }
  const qty = parseFloat(String(quantity));
  if (qty <= 0) return void res.status(400).json({ error: "الكمية يجب أن تكون أكبر من صفر" });

  // Add qty back to warehouse_items
  const item = await queryOne<{ id: number; quantity: number; product_id: number | null }>(
    "SELECT * FROM warehouse_items WHERE (id=? OR (warehouse_id=? AND (product_id=? OR product_name LIKE ?))) LIMIT 1"
  ,
    Number(warehouse_item_id) || -1,
    warehouse_id,
    Number(product_id) || -1,
    `%${product_name}%`,
  );

  if (item) {
    await execute("UPDATE warehouse_items SET quantity=quantity+?, last_updated=datetime('now') WHERE id=?", qty, item.id);
    if (item.product_id) {
      const totalStock = (await queryOne<{ t: number }>("SELECT COALESCE(SUM(quantity),0) as t FROM warehouse_items WHERE product_id=?", item.product_id))?.t ?? 0;
      await execute("UPDATE products SET stock=? WHERE id=?", totalStock, item.product_id);
    }
  }

  const result = await execute(`
    INSERT INTO warehouse_returns (warehouse_id, warehouse_name, product_name, product_id, warehouse_item_id, unit, quantity, reason, returned_by, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `,
    warehouse_id, warehouse_name || null, product_name,
    Number(product_id) || null, Number(warehouse_item_id) || null,
    unit || "وحدة", qty, reason || null, returned_by || null, created_by || null,
  );
  res.json({ id: result.lastInsertRowid, message: "تم تسجيل المرتجع وإضافة الكمية للمستودع" });
});

router.put("/warehouse-returns/:id", async (req, res) => {
  const ret = await queryOne<{
    id: number; warehouse_item_id: number | null; product_id: number | null; quantity: number;
  }>("SELECT * FROM warehouse_returns WHERE id=?", req.params.id);
  if (!ret) return void res.status(404).json({ error: "المرتجع غير موجود" });

  const { quantity, reason, returned_by } = req.body as Record<string, unknown>;
  const newQty = parseFloat(String(quantity));
  if (isNaN(newQty) || newQty <= 0) return void res.status(400).json({ error: "الكمية يجب أن تكون أكبر من صفر" });

  const diff = newQty - ret.quantity; // positive = add more, negative = subtract

  if (ret.warehouse_item_id && diff !== 0) {
    await execute("UPDATE warehouse_items SET quantity=MAX(0,quantity+?), last_updated=datetime('now') WHERE id=?", diff, ret.warehouse_item_id);
    const item = await queryOne<{ product_id: number | null }>("SELECT product_id FROM warehouse_items WHERE id=?", ret.warehouse_item_id);
    if (item?.product_id) {
      const total = (await queryOne<{ t: number }>("SELECT COALESCE(SUM(quantity),0) as t FROM warehouse_items WHERE product_id=?", item.product_id))?.t ?? 0;
      await execute("UPDATE products SET stock=? WHERE id=?", total, item.product_id);
    }
  }

  await execute("UPDATE warehouse_returns SET quantity=?, reason=?, returned_by=? WHERE id=?",
    newQty, reason || null, returned_by || null, ret.id);

  res.json({ message: "تم تحديث المرتجع" });
});

router.delete("/warehouse-returns/:id", async (req, res) => {
  const ret = await queryOne<{
    id: number; warehouse_item_id: number | null; product_id: number | null; quantity: number;
  }>("SELECT * FROM warehouse_returns WHERE id=?", req.params.id);
  if (!ret) return void res.status(404).json({ error: "المرتجع غير موجود" });

  // Reverse the stock addition
  if (ret.warehouse_item_id) {
    await execute("UPDATE warehouse_items SET quantity=MAX(0,quantity-?), last_updated=datetime('now') WHERE id=?", ret.quantity, ret.warehouse_item_id);
    const item = await queryOne<{ product_id: number | null }>("SELECT product_id FROM warehouse_items WHERE id=?", ret.warehouse_item_id);
    if (item?.product_id) {
      const total = (await queryOne<{ t: number }>("SELECT COALESCE(SUM(quantity),0) as t FROM warehouse_items WHERE product_id=?", item.product_id))?.t ?? 0;
      await execute("UPDATE products SET stock=? WHERE id=?", total, item.product_id);
    }
  }
  await execute("DELETE FROM warehouse_returns WHERE id=?", req.params.id);
  res.json({ message: "تم حذف المرتجع وعكس الكمية" });
});

// ── One-shot: deactivate warehouse items whose product was deleted ─────────────
router.post("/warehouse-items/cleanup-orphans", async (_req, res) => {
  const del = await execute("DELETE FROM warehouse_items WHERE product_id IS NULL AND (quantity IS NULL OR quantity <= 0) AND product_name NOT IN (SELECT name FROM products)");
  const upd = await execute("UPDATE warehouse_items SET active = 0 WHERE product_id IS NULL AND (quantity > 0) AND product_name NOT IN (SELECT name FROM products)");
  res.json({ deleted: del.changes, deactivated: upd.changes });
});

export default router;
