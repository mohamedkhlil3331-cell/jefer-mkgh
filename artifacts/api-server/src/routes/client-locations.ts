import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// ── Get customer saved locations ──────────────────────────────────
router.get("/client-locations", (req, res) => {
  const { phone } = req.query as Record<string, string>;
  if (!phone) return void res.status(400).json({ error: "رقم الهاتف مطلوب" });
  res.json(db.prepare("SELECT * FROM client_locations WHERE customer_phone=? ORDER BY is_default DESC, created_at DESC").all(phone));
});

// ── Add a new saved location ──────────────────────────────────────
router.post("/client-locations", (req, res) => {
  const { customer_phone, alias, address, lat, lng, is_default } = req.body;
  if (!customer_phone || !alias) return void res.status(400).json({ error: "رقم الهاتف والاسم مطلوبان" });
  // If new location is set as default, clear other defaults
  if (is_default) {
    db.prepare("UPDATE client_locations SET is_default=0 WHERE customer_phone=?").run(customer_phone);
  }
  const r = db.prepare(`
    INSERT INTO client_locations (customer_phone,alias,address,lat,lng,is_default)
    VALUES (?,?,?,?,?,?)
  `).run(customer_phone, alias, address||null, lat||null, lng||null, is_default ? 1 : 0);
  res.status(201).json({ id: r.lastInsertRowid, message: "تم حفظ الموقع" });
});

// ── Update a saved location ───────────────────────────────────────
router.put("/client-locations/:id", (req, res) => {
  const { alias, address, lat, lng, is_default, customer_phone } = req.body;
  if (is_default && customer_phone) {
    db.prepare("UPDATE client_locations SET is_default=0 WHERE customer_phone=?").run(customer_phone);
  }
  db.prepare(`
    UPDATE client_locations SET alias=?,address=?,lat=?,lng=?,is_default=?,updated_at=datetime('now') WHERE id=?
  `).run(alias, address||null, lat||null, lng||null, is_default ? 1 : 0, req.params.id);
  res.json({ message: "تم التحديث" });
});

// ── Delete a saved location ───────────────────────────────────────
router.delete("/client-locations/:id", (req, res) => {
  db.prepare("DELETE FROM client_locations WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
