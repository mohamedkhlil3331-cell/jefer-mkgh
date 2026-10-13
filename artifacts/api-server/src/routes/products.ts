import { Router } from "express";
import db from "../lib/db.js";
import { queryProductionD1 } from "../lib/cloudflare-d1.js";

const router = Router();

function useD1ProductsBackend(): boolean {
  return process.env.NODE_ENV === "production"
    && process.env.ERP_DATABASE_BACKEND === "d1"
    && process.env.ERP_D1_PRODUCTS_ENABLED === "1";
}

async function queryAll<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  if (useD1ProductsBackend()) {
    return (await queryProductionD1<T>(sql, params)).results;
  }
  return db.prepare(sql).all(...params) as T[];
}

async function queryOne<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
  if (useD1ProductsBackend()) {
    return (await queryProductionD1<T>(sql, params)).results[0];
  }
  return db.prepare(sql).get(...params) as T | undefined;
}

async function execute(sql: string, ...params: unknown[]): Promise<{ lastInsertRowid: number | bigint; changes: number }> {
  if (useD1ProductsBackend()) {
    const result = await queryProductionD1(sql, params);
    return {
      lastInsertRowid: result.meta?.last_row_id ?? 0,
      changes: result.meta?.changes ?? 0,
    };
  }
  return db.prepare(sql).run(...params);
}

async function syncProductStock(productId: number | bigint) {
  const row = await queryOne<{ total: number }>("SELECT COALESCE(SUM(quantity),0) as total FROM warehouse_items WHERE product_id=?", productId);
  await execute("UPDATE products SET stock=? WHERE id=?", row?.total ?? 0, productId);
}

async function autoCreateWarehouseItems(productId: number | bigint, productName: string, unit: string) {
  const warehouses = await queryAll<{ id: number }>("SELECT id FROM warehouses WHERE active=1");
  for (const w of warehouses) {
    await execute("INSERT OR IGNORE INTO warehouse_items (warehouse_id,product_name,product_id,quantity,unit) VALUES (?,?,?,0,?)", w.id, productName, productId, unit);
  }
}

async function autoCreateCategoryInWarehouses(category: string, unit: string) {
  const warehouses = await queryAll<{ id: number }>("SELECT id FROM warehouses WHERE active=1");
  for (const w of warehouses) {
    if (!await queryOne("SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_name=?", w.id, category)) {
      await execute("INSERT INTO warehouse_items (warehouse_id,product_name,quantity,unit,min_stock) VALUES (?,?,0,?,0)", w.id, category, unit);
    }
  }
}

router.get("/products", async (_req, res) => {
  const products = await queryAll(
    "SELECT p.*, AVG(r.rating) as avg_rating, COUNT(r.id) as review_count FROM products p LEFT JOIN product_ratings r ON r.product_id = p.id WHERE p.active = 1 GROUP BY p.id ORDER BY p.sort_order, p.name"
  );
  res.json(products);
});

// All products including inactive (admin use)
router.get("/products/all", async (_req, res) => {
  const products = await queryAll(
    "SELECT p.*, AVG(r.rating) as avg_rating, COUNT(r.id) as review_count FROM products p LEFT JOIN product_ratings r ON r.product_id = p.id GROUP BY p.id ORDER BY p.sort_order, p.name"
  );
  res.json(products);
});

router.get("/products/:id", async (req, res) => {
  const product = await queryOne(
    "SELECT p.*, AVG(r.rating) as avg_rating, COUNT(r.id) as review_count FROM products p LEFT JOIN product_ratings r ON r.product_id = p.id WHERE p.id = ? GROUP BY p.id"
    , req.params.id);
  if (!product) return void res.status(404).json({ error: "المنتج غير موجود" });

  const ratings = await queryAll("SELECT * FROM product_ratings WHERE product_id = ? ORDER BY created_at DESC LIMIT 10", req.params.id);
  res.json({ ...product as Record<string, unknown>, ratings });
});

router.post("/products", async (req, res) => {
  const { name, description, image_url, price_per_unit, price_delivered, price_truck_buraydah, unit, category, stock, sort_order, packaging_type, weight_kg, price_locked } = req.body;
  const result = await execute(
    "INSERT INTO products (name,description,image_url,price_per_unit,price_delivered,price_truck_buraydah,unit,category,stock,sort_order,packaging_type,weight_kg,price_locked) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
  , name, description||null, image_url||null,
    parseFloat(price_per_unit)||0, parseFloat(price_delivered)||0, parseFloat(price_truck_buraydah)||0,
    unit||"كيس", category||null, parseInt(stock)||0, parseInt(sort_order)||0, packaging_type||"معبأ",
    parseFloat(weight_kg)||0, price_locked ? 1 : 0);

  await autoCreateWarehouseItems(result.lastInsertRowid, name, unit||"كيس");
  if (category) await autoCreateCategoryInWarehouses(category, unit||"كيس");
  await syncProductStock(result.lastInsertRowid);

  res.status(201).json({ id: result.lastInsertRowid, message: "تم إضافة المنتج" });
});

router.put("/products/:id", async (req, res) => {
  const { name, description, image_url, price_per_unit, price_delivered, price_truck_buraydah, unit, category, stock, active, sort_order, packaging_type, min_stock, weight_kg, price_locked } = req.body;

  const before = await queryOne<{ active: number }>("SELECT active FROM products WHERE id=?", req.params.id);

  // Read current price_locked to preserve it when not supplied by caller
  const current = await queryOne<{ price_locked: number }>("SELECT price_locked FROM products WHERE id=?", req.params.id);
  const resolvedPriceLocked = price_locked !== undefined ? (price_locked ? 1 : 0) : (current?.price_locked ?? 0);

  await execute(
    "UPDATE products SET name=?,description=?,image_url=?,price_per_unit=?,price_delivered=?,price_truck_buraydah=?,unit=?,category=?,stock=?,active=?,sort_order=?,packaging_type=?,min_stock=?,weight_kg=?,price_locked=? WHERE id=?"
  ,
    name, description||null, image_url||null,
    parseFloat(price_per_unit)||0, parseFloat(price_delivered)||0, parseFloat(price_truck_buraydah)||0,
    unit, category||null, parseInt(stock)||0, active??1, parseInt(sort_order)||0, packaging_type||"معبأ",
    parseInt(min_stock)||0, parseFloat(weight_kg)||0, resolvedPriceLocked,
    req.params.id
  );

  const newActive = active ?? 1;
  if (before && before.active === 0 && newActive === 1) {
    await autoCreateWarehouseItems(parseInt(req.params.id), name, unit||"كيس");
  }
  if (category) await autoCreateCategoryInWarehouses(category, unit||"كيس");

  // Derive stock from warehouse sum — overrides any payload value
  await syncProductStock(parseInt(req.params.id));

  // Low-stock alert on full update too
  const newStock = parseInt(stock)||0;
  const minSt = parseInt(min_stock)||0;
  if (minSt > 0 && newStock <= minSt) {
    const admins = await queryAll<{ phone: string }>("SELECT phone FROM users WHERE role IN ('admin','workshop_manager') AND active=1");
    const msg = `⚠️ تنبيه مخزون: ${name} وصل إلى ${newStock} ${unit||""} (الحد الأدنى: ${minSt})`;
    for (const admin of admins) await execute("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)", admin.phone, "مخزون منخفض", msg);
  }

  res.json({ message: "تم التحديث" });
});

// Quick stock update (warehouse)
router.patch("/products/:id/stock", async (req, res) => {
  const { stock } = req.body;
  if (stock === undefined || stock === null) return void res.status(400).json({ error: "الكمية مطلوبة" });
  const newStock = parseInt(stock);
  await execute("UPDATE products SET stock=? WHERE id=?", newStock, req.params.id);

  // Low-stock alert notification
  const prod = await queryOne<{ name: string; unit: string; min_stock: number }>("SELECT name, unit, min_stock FROM products WHERE id=?", req.params.id);
  if (prod && prod.min_stock > 0 && newStock <= prod.min_stock) {
    const admins = await queryAll<{ phone: string }>("SELECT phone FROM users WHERE role IN ('admin','workshop_manager') AND active=1");
    const msg = `⚠️ تنبيه مخزون: ${prod.name} وصل إلى ${newStock} ${prod.unit} (الحد الأدنى: ${prod.min_stock} ${prod.unit})`;
    for (const admin of admins) await execute("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)", admin.phone, "مخزون منخفض", msg);
  }

  res.json({ message: "تم تحديث المخزون", stock: newStock });
});

// Quick price update only
router.patch("/products/:id/prices", async (req, res) => {
  const { price_per_unit, price_delivered, price_truck_buraydah } = req.body;
  await execute(
    "UPDATE products SET price_per_unit=?, price_delivered=?, price_truck_buraydah=? WHERE id=?"
  ,
    parseFloat(price_per_unit)||0,
    parseFloat(price_delivered)||0,
    parseFloat(price_truck_buraydah)||0,
    req.params.id
  );
  res.json({ message: "تم تحديث الأسعار" });
});

router.delete("/products/:id", async (req, res) => {
  const id = req.params.id;
  await execute("DELETE FROM product_ratings WHERE product_id = ?", id);
  // Remove zero-stock warehouse rows; close (hide) rows that still have stock
  await execute("DELETE FROM warehouse_items WHERE product_id = ? AND (quantity IS NULL OR quantity <= 0)", id);
  await execute("UPDATE warehouse_items SET active = 0, product_id = NULL WHERE product_id = ?", id);
  await execute("UPDATE workflow_orders SET product_id = NULL WHERE product_id = ?", id);
  await execute("DELETE FROM products WHERE id = ?", id);
  res.json({ message: "تم الحذف" });
});

router.post("/products/:id/rate", async (req, res) => {
  const { customer_phone, customer_name, rating, comment } = req.body;
  if (!customer_phone || !rating) return void res.status(400).json({ error: "البيانات غير مكتملة" });
  const existing = await queryOne("SELECT id FROM product_ratings WHERE product_id = ? AND customer_phone = ?", req.params.id, customer_phone);
  if (existing) {
    await execute("UPDATE product_ratings SET rating=?,comment=? WHERE product_id=? AND customer_phone=?", parseInt(rating), comment||null, req.params.id, customer_phone);
  } else {
    await execute("INSERT INTO product_ratings (product_id,customer_phone,customer_name,rating,comment) VALUES (?,?,?,?,?)", req.params.id, customer_phone, customer_name||null, parseInt(rating), comment||null);
  }
  res.json({ message: "تم تسجيل التقييم" });
});

export { syncProductStock };
export default router;
