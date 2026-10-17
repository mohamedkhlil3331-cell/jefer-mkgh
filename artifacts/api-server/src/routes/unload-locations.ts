import { Router } from "express";
import { execute, executeBatch, queryAll, queryOne } from "../lib/erp-sql.js";

const router = Router();

function normalizeMapUrl(value: unknown): string | null | undefined {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

router.get("/unload-locations", async (_req, res) => {
  const rows = await queryAll("SELECT * FROM unload_locations ORDER BY name ASC");
  res.json(rows);
});

router.post("/unload-locations", async (req, res) => {
  const { name, notes, phone_number } = req.body;
  const map_url = normalizeMapUrl(req.body.map_url);
  if (!name?.trim()) return void res.status(400).json({ error: "اسم الموقع مطلوب" });
  if (map_url === undefined) return void res.status(400).json({ error: "رابط اللوكيشن غير صالح" });
  const exists = await queryOne("SELECT id FROM unload_locations WHERE name = ?", name.trim());
  if (exists) return void res.status(409).json({ error: "الموقع موجود مسبقًا" });
  const normalizedPhone = typeof phone_number === "string" ? phone_number.trim() : "";
  const normalizedNotes = typeof notes === "string" ? notes.trim() : "";
  const r = await execute(
    "INSERT INTO unload_locations (name, notes, phone_number, map_url) VALUES (?, ?, ?, ?)",
    name.trim(), normalizedNotes || null, normalizedPhone || null, map_url,
  );
  res.json({
    id: r.lastInsertRowid, name: name.trim(),
    notes: normalizedNotes || null, phone_number: normalizedPhone || null, map_url,
  });
});

router.put("/unload-locations/:id", async (req, res) => {
  const { name, notes, phone_number } = req.body;
  const map_url = normalizeMapUrl(req.body.map_url);
  if (!name?.trim()) return void res.status(400).json({ error: "اسم الموقع مطلوب" });
  if (map_url === undefined) return void res.status(400).json({ error: "رابط اللوكيشن غير صالح" });
  const current = await queryOne<{ id: number; name: string }>("SELECT id, name FROM unload_locations WHERE id=?", req.params.id);
  if (!current) return void res.status(404).json({ error: "الموقع غير موجود" });
  const exists = await queryOne("SELECT id FROM unload_locations WHERE name = ? AND id != ?", name.trim(), req.params.id);
  if (exists) return void res.status(409).json({ error: "الموقع موجود مسبقًا" });
  const normalizedPhone = typeof phone_number === "string" ? phone_number.trim() : "";
  const normalizedNotes = typeof notes === "string" ? notes.trim() : "";
  await executeBatch([
    {
      sql: "UPDATE unload_locations SET name=?, notes=?, phone_number=?, map_url=? WHERE id=?",
      params: [name.trim(), normalizedNotes || null, normalizedPhone || null, map_url, req.params.id],
    },
    {
      sql: `
      UPDATE loading_orders SET unload_location=?, unload_location_id=?
      WHERE unload_location_id=?
         OR (unload_location_id IS NULL AND LOWER(TRIM(unload_location))=LOWER(TRIM(?)))
      `,
      params: [name.trim(), req.params.id, req.params.id, current.name],
    },
  ]);
  res.json({ ok: true });
});

router.delete("/unload-locations/:id", async (req, res) => {
  await executeBatch([
    { sql: "UPDATE loading_orders SET unload_location_id=NULL WHERE unload_location_id=?", params: [req.params.id] },
    { sql: "DELETE FROM unload_locations WHERE id=?", params: [req.params.id] },
  ]);
  res.json({ ok: true });
});

export default router;
