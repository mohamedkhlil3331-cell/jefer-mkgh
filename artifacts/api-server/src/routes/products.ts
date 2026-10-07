import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

function syncProductStock(productId: number | bigint) {
  const row = db.prepare("SELECT COALESCE(SUM(quantity),0) as total FROM warehouse_items WHERE product_id=?").get(productId) as { total: number };
  db.prepare("UPDATE products SET stock=? WHERE id=?").run(row.total, productId);
}

function autoCreateWarehouseItems(productId: number | bigint, productName: string, unit: string) {
  const warehouses = db.prepare("SELECT id FROM warehouses WHERE active=1").all() as { id: number }[];
  const ins = db.prepare("INSERT OR IGNORE INTO warehouse_items (warehouse_id,product_name,product_id,quantity,unit) VALUES (?,?,?,0,?)");
  for (const w of warehouses) {
    ins.run(w.id, productName, productId, unit);
  }
}

function autoCreateCategoryInWarehouses(category: string, unit: string) {
  const warehouses = db.prepare("SELECT id FROM warehouses WHERE active=1").all() as { id: number }[];
  const check = db.prepare("SELECT id FROM warehouse_items WHERE warehouse_id=? AND product_name=?");
  const ins  = db.prepare("INSERT INTO warehouse_items (warehouse_id,product_name,quantity,unit,min_stock) VALUES (?,?,0,?,0)");
  for (const w of warehouses) {
    if (!check.get(w.id, category)) ins.run(w.id, category, unit);
  }
}

router.get("/products", (_req, res) => {
  const products = db.prepare(
    "SELECT p.*, AVG(r.rating) as avg_rating, COUNT(r.id) as review_count FROM products p LEFT JOIN product_ratings r ON r.product_id = p.id WHERE p.active = 1 GROUP BY p.id ORDER BY p.sort_order, p.name"
  ).all();
  res.json(products);
});

// All products including inactive (admin use)
router.get("/products/all", (_req, res) => {
  const products = db.prepare(
    "SELECT p.*, AVG(r.rating) as avg_rating, COUNT(r.id) as review_count FROM products p LEFT JOIN product_ratings r ON r.product_id = p.id GROUP BY p.id ORDER BY p.sort_order, p.name"
  ).all();
  res.json(products);
});

router.get("/products/:id", (req, res) => {
  const product = db.prepare(
    "SELECT p.*, AVG(r.rating) as avg_rating, COUNT(r.id) as review_count FROM products p LEFT JOIN product_ratings r ON r.product_id = p.id WHERE p.id = ? GROUP BY p.id"
  ).get(req.params.id);
  if (!product) return void res.status(404).json({ error: "المنتج غير موجود" });

  const ratings = db.prepare("SELECT * FROM product_ratings WHERE product_id = ? ORDER BY created_at DESC LIMIT 10").all(req.params.id);
  res.json({ ...product as Record<string, unknown>, ratings });
});

router.post("/products", (req, res) => {
  const { name, description, image_url, price_per_unit, price_delivered, price_truck_buraydah, unit, category, stock, sort_order, packaging_type, weight_kg, price_locked } = req.body;
  const result = db.prepare(
    "INSERT INTO products (name,description,image_url,price_per_unit,price_delivered,price_truck_buraydah,unit,category,stock,sort_order,packaging_type,weight_kg,price_locked) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(name, description||null, image_url||null,
    parseFloat(price_per_unit)||0, parseFloat(price_delivered)||0, parseFloat(price_truck_buraydah)||0,
    unit||"كيس", category||null, parseInt(stock)||0, parseInt(sort_order)||0, packaging_type||"معبأ",
    parseFloat(weight_kg)||0, price_locked ? 1 : 0);

  autoCreateWarehouseItems(result.lastInsertRowid, name, unit||"كيس");
  if (category) autoCreateCategoryInWarehouses(category, unit||"كيس");
  syncProductStock(result.lastInsertRowid);

  res.status(201).json({ id: result.lastInsertRowid, message: "تم إضافة المنتج" });
});

router.put("/products/:id", (req, res) => {
  const { name, description, image_url, price_per_unit, price_delivered, price_truck_buraydah, unit, category, stock, active, sort_order, packaging_type, min_stock, weight_kg, price_locked } = req.body;

  const before = db.prepare("SELECT active FROM products WHERE id=?").get(req.params.id) as { active: number } | undefined;

  // Read current price_locked to preserve it when not supplied by caller
  const current = db.prepare("SELECT price_locked FROM products WHERE id=?").get(req.params.id) as { price_locked: number } | undefined;
  const resolvedPriceLocked = price_locked !== undefined ? (price_locked ? 1 : 0) : (current?.price_locked ?? 0);

  db.prepare(
    "UPDATE products SET name=?,description=?,image_url=?,price_per_unit=?,price_delivered=?,price_truck_buraydah=?,unit=?,category=?,stock=?,active=?,sort_order=?,packaging_type=?,min_stock=?,weight_kg=?,price_locked=? WHERE id=?"
  ).run(
    name, description||null, image_url||null,
    parseFloat(price_per_unit)||0, parseFloat(price_delivered)||0, parseFloat(price_truck_buraydah)||0,
    unit, category||null, parseInt(stock)||0, active??1, parseInt(sort_order)||0, packaging_type||"معبأ",
    parseInt(min_stock)||0, parseFloat(weight_kg)||0, resolvedPriceLocked,
    req.params.id
  );

  const newActive = active ?? 1;
  if (before && before.active === 0 && newActive === 1) {
    autoCreateWarehouseItems(parseInt(req.params.id), name, unit||"كيس");
  }
  if (category) autoCreateCategoryInWarehouses(category, unit||"كيس");

  // Derive stock from warehouse sum — overrides any payload value
  syncProductStock(parseInt(req.params.id));

  // Low-stock alert on full update too
  const newStock = parseInt(stock)||0;
  const minSt = parseInt(min_stock)||0;
  if (minSt > 0 && newStock <= minSt) {
    const admins = db.prepare("SELECT phone FROM users WHERE role IN ('admin','workshop_manager') AND active=1").all() as { phone: string }[];
    const ins = db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)");
    const msg = `⚠️ تنبيه مخزون: ${name} وصل إلى ${newStock} ${unit||""} (الحد الأدنى: ${minSt})`;
    admins.forEach(a => ins.run(a.phone, "مخزون منخفض", msg));
  }

  res.json({ message: "تم التحديث" });
});

// Quick stock update (warehouse)
router.patch("/products/:id/stock", (req, res) => {
  const { stock } = req.body;
  if (stock === undefined || stock === null) return void res.status(400).json({ error: "الكمية مطلوبة" });
  const newStock = parseInt(stock);
  db.prepare("UPDATE products SET stock=? WHERE id=?").run(newStock, req.params.id);

  // Low-stock alert notification
  const prod = db.prepare("SELECT name, unit, min_stock FROM products WHERE id=?").get(req.params.id) as { name: string; unit: string; min_stock: number } | undefined;
  if (prod && prod.min_stock > 0 && newStock <= prod.min_stock) {
    const admins = db.prepare("SELECT phone FROM users WHERE role IN ('admin','workshop_manager') AND active=1").all() as { phone: string }[];
    const msg = `⚠️ تنبيه مخزون: ${prod.name} وصل إلى ${newStock} ${prod.unit} (الحد الأدنى: ${prod.min_stock} ${prod.unit})`;
    const ins = db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)");
    admins.forEach(a => ins.run(a.phone, "مخزون منخفض", msg));
  }

  res.json({ message: "تم تحديث المخزون", stock: newStock });
});

// Quick price update only
router.patch("/products/:id/prices", (req, res) => {
  const { price_per_unit, price_delivered, price_truck_buraydah } = req.body;
  db.prepare(
    "UPDATE products SET price_per_unit=?, price_delivered=?, price_truck_buraydah=? WHERE id=?"
  ).run(
    parseFloat(price_per_unit)||0,
    parseFloat(price_delivered)||0,
    parseFloat(price_truck_buraydah)||0,
    req.params.id
  );
  res.json({ message: "تم تحديث الأسعار" });
});

router.delete("/products/:id", (req, res) => {
  const id = req.params.id;
  db.prepare("DELETE FROM product_ratings WHERE product_id = ?").run(id);
  // Remove zero-stock warehouse rows; close (hide) rows that still have stock
  db.prepare("DELETE FROM warehouse_items WHERE product_id = ? AND (quantity IS NULL OR quantity <= 0)").run(id);
  db.prepare("UPDATE warehouse_items SET active = 0, product_id = NULL WHERE product_id = ?").run(id);
  db.prepare("UPDATE workflow_orders SET product_id = NULL WHERE product_id = ?").run(id);
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
  res.json({ message: "تم الحذف" });
});

router.post("/products/:id/rate", (req, res) => {
  const { customer_phone, customer_name, rating, comment } = req.body;
  if (!customer_phone || !rating) return void res.status(400).json({ error: "البيانات غير مكتملة" });
  const existing = db.prepare("SELECT id FROM product_ratings WHERE product_id = ? AND customer_phone = ?").get(req.params.id, customer_phone);
  if (existing) {
    db.prepare("UPDATE product_ratings SET rating=?,comment=? WHERE product_id=? AND customer_phone=?")
      .run(parseInt(rating), comment||null, req.params.id, customer_phone);
  } else {
    db.prepare("INSERT INTO product_ratings (product_id,customer_phone,customer_name,rating,comment) VALUES (?,?,?,?,?)")
      .run(req.params.id, customer_phone, customer_name||null, parseInt(rating), comment||null);
  }
  res.json({ message: "تم تسجيل التقييم" });
});

export { syncProductStock };
export default router;
