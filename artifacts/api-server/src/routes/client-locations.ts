import { Router } from "express";
import { execute, queryAll } from "../lib/erp-sql.js";

const router = Router();

// ── Get customer saved locations ──────────────────────────────────
router.get("/client-locations", async (req, res) => {
  const { phone } = req.query as Record<string, string>;
  if (!phone) return void res.status(400).json({ error: "رقم الهاتف مطلوب" });
  res.json(await queryAll("SELECT * FROM client_locations WHERE customer_phone=? ORDER BY is_default DESC, created_at DESC", phone));
});

// ── Add a new saved location ──────────────────────────────────────
router.post("/client-locations", async (req, res) => {
  const { customer_phone, alias, address, lat, lng, is_default } = req.body;
  if (!customer_phone || !alias) return void res.status(400).json({ error: "رقم الهاتف والاسم مطلوبان" });
  // If new location is set as default, clear other defaults
  if (is_default) {
    await execute("UPDATE client_locations SET is_default=0 WHERE customer_phone=?", customer_phone);
  }
  const r = await execute(`
    INSERT INTO client_locations (customer_phone,alias,address,lat,lng,is_default)
    VALUES (?,?,?,?,?,?)
  `, customer_phone, alias, address||null, lat||null, lng||null, is_default ? 1 : 0);
  res.status(201).json({ id: r.lastInsertRowid, message: "تم حفظ الموقع" });
});

// ── Update a saved location ───────────────────────────────────────
router.put("/client-locations/:id", async (req, res) => {
  const { alias, address, lat, lng, is_default, customer_phone } = req.body;
  if (is_default && customer_phone) {
    await execute("UPDATE client_locations SET is_default=0 WHERE customer_phone=?", customer_phone);
  }
  await execute(`
    UPDATE client_locations SET alias=?,address=?,lat=?,lng=?,is_default=?,updated_at=datetime('now') WHERE id=?
  `, alias, address||null, lat||null, lng||null, is_default ? 1 : 0, req.params.id);
  res.json({ message: "تم التحديث" });
});

// ── Delete a saved location ───────────────────────────────────────
router.delete("/client-locations/:id", async (req, res) => {
  await execute("DELETE FROM client_locations WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
