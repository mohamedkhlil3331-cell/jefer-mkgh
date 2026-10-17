import { Router } from "express";
import { execute, queryAll } from "../lib/erp-sql.js";

const router = Router();

router.get("/vehicle-type-defs", async (_req, res) => {
  res.json(await queryAll("SELECT * FROM vehicle_type_definitions ORDER BY sort_order, name"));
});

router.post("/vehicle-type-defs", async (req, res) => {
  const { name, icon, description, max_load_bags, cargo_types, sort_order, overnight_rate } = req.body as Record<string, string>;
  if (!name?.trim()) return void res.status(400).json({ error: "الاسم مطلوب" });
  try {
    const r = await execute(`
      INSERT INTO vehicle_type_definitions (name, icon, description, max_load_bags, cargo_types, sort_order, overnight_rate, is_custom)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `, name.trim(), icon || "🚛", description || null,
           parseInt(max_load_bags) || 0, cargo_types || "[]", parseInt(sort_order) || 0,
           parseFloat(overnight_rate) || 0);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch {
    res.status(400).json({ error: "الاسم مكرر" });
  }
});

router.put("/vehicle-type-defs/:id", async (req, res) => {
  const { name, icon, description, max_load_bags, cargo_types, sort_order, is_active, overnight_rate } = req.body as Record<string, unknown>;
  await execute(`
    UPDATE vehicle_type_definitions
    SET name=?, icon=?, description=?, max_load_bags=?, cargo_types=?, sort_order=?, is_active=?, overnight_rate=?, updated_at=datetime('now')
    WHERE id=?
  `,
    name, icon || "🚛", description || null,
    parseInt(String(max_load_bags)) || 0,
    typeof cargo_types === "string" ? cargo_types : JSON.stringify(cargo_types || []),
    parseInt(String(sort_order)) || 0,
    is_active === false || is_active === 0 ? 0 : 1,
    parseFloat(String(overnight_rate)) || 0,
    req.params.id
  );
  res.json({ message: "تم التحديث" });
});

router.delete("/vehicle-type-defs/:id", async (req, res) => {
  await execute("DELETE FROM vehicle_type_definitions WHERE id=? AND is_custom=1", req.params.id);
  res.json({ message: "تم الحذف" });
});

// ── Cargo routing rules ──────────────────────────────────────────────────────

router.get("/cargo-routing-rules", async (_req, res) => {
  res.json(await queryAll(`
    SELECT r.*, v.name as vehicle_type_name, v.icon as vehicle_icon
    FROM cargo_routing_rules r
    LEFT JOIN vehicle_type_definitions v ON r.vehicle_type_id = v.id
    ORDER BY r.cargo_type, r.min_qty
  `));
});

router.post("/cargo-routing-rules", async (req, res) => {
  const { cargo_type, cargo_label, min_qty, max_qty, vehicle_type_id, notes, sort_order } = req.body as Record<string, string>;
  const r = await execute(`
    INSERT INTO cargo_routing_rules (cargo_type, cargo_label, min_qty, max_qty, vehicle_type_id, notes, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    cargo_type, cargo_label || cargo_type,
    parseInt(min_qty) || 0, parseInt(max_qty) || 0,
    vehicle_type_id || null, notes || null, parseInt(sort_order) || 0
  );
  res.status(201).json({ id: r.lastInsertRowid });
});

router.put("/cargo-routing-rules/:id", async (req, res) => {
  const { cargo_type, cargo_label, min_qty, max_qty, vehicle_type_id, notes } = req.body as Record<string, string>;
  await execute(`
    UPDATE cargo_routing_rules
    SET cargo_type=?, cargo_label=?, min_qty=?, max_qty=?, vehicle_type_id=?, notes=?
    WHERE id=?
  `,
    cargo_type, cargo_label || cargo_type,
    parseInt(min_qty) || 0, parseInt(max_qty) || 0,
    vehicle_type_id || null, notes || null,
    req.params.id
  );
  res.json({ message: "تم التحديث" });
});

router.delete("/cargo-routing-rules/:id", async (req, res) => {
  await execute("DELETE FROM cargo_routing_rules WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
