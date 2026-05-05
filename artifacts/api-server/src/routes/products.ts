import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/products", (_req, res) => {
  const products = db.prepare(
    "SELECT p.*, AVG(r.rating) as avg_rating, COUNT(r.id) as review_count FROM products p LEFT JOIN product_ratings r ON r.product_id = p.id WHERE p.active = 1 GROUP BY p.id ORDER BY p.sort_order, p.name"
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
  const { name, description, image_url, price_per_unit, unit, category, stock, sort_order } = req.body;
  const result = db.prepare(
    "INSERT INTO products (name,description,image_url,price_per_unit,unit,category,stock,sort_order) VALUES (?,?,?,?,?,?,?,?)"
  ).run(name, description||null, image_url||null, parseFloat(price_per_unit)||0, unit||"كيس", category||null, parseInt(stock)||0, parseInt(sort_order)||0);
  res.status(201).json({ id: result.lastInsertRowid, message: "تم إضافة المنتج" });
});

router.put("/products/:id", (req, res) => {
  const { name, description, image_url, price_per_unit, unit, category, stock, active, sort_order } = req.body;
  db.prepare(
    "UPDATE products SET name=?,description=?,image_url=?,price_per_unit=?,unit=?,category=?,stock=?,active=?,sort_order=? WHERE id=?"
  ).run(name,description||null,image_url||null,parseFloat(price_per_unit)||0,unit,category||null,parseInt(stock)||0,active??1,parseInt(sort_order)||0,req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/products/:id", (req, res) => {
  db.prepare("UPDATE products SET active = 0 WHERE id = ?").run(req.params.id);
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

export default router;
