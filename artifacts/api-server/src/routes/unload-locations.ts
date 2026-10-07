import { Router } from "express";
import db from "../lib/db.js";

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

router.get("/unload-locations", (_req, res) => {
  const rows = db.prepare("SELECT * FROM unload_locations ORDER BY name ASC").all();
  res.json(rows);
});

router.post("/unload-locations", (req, res) => {
  const { name, notes, phone_number } = req.body;
  const map_url = normalizeMapUrl(req.body.map_url);
  if (!name?.trim()) return void res.status(400).json({ error: "اسم الموقع مطلوب" });
  if (map_url === undefined) return void res.status(400).json({ error: "رابط اللوكيشن غير صالح" });
  const exists = db.prepare("SELECT id FROM unload_locations WHERE name = ?").get(name.trim());
  if (exists) return void res.status(409).json({ error: "الموقع موجود مسبقًا" });
  const normalizedPhone = typeof phone_number === "string" ? phone_number.trim() : "";
  const normalizedNotes = typeof notes === "string" ? notes.trim() : "";
  const r = db.prepare("INSERT INTO unload_locations (name, notes, phone_number, map_url) VALUES (?, ?, ?, ?)")
    .run(name.trim(), normalizedNotes || null, normalizedPhone || null, map_url);
  res.json({
    id: r.lastInsertRowid, name: name.trim(),
    notes: normalizedNotes || null, phone_number: normalizedPhone || null, map_url,
  });
});

router.put("/unload-locations/:id", (req, res) => {
  const { name, notes, phone_number } = req.body;
  const map_url = normalizeMapUrl(req.body.map_url);
  if (!name?.trim()) return void res.status(400).json({ error: "اسم الموقع مطلوب" });
  if (map_url === undefined) return void res.status(400).json({ error: "رابط اللوكيشن غير صالح" });
  const current = db.prepare("SELECT id, name FROM unload_locations WHERE id=?").get(req.params.id) as { id: number; name: string } | undefined;
  if (!current) return void res.status(404).json({ error: "الموقع غير موجود" });
  const exists = db.prepare("SELECT id FROM unload_locations WHERE name = ? AND id != ?").get(name.trim(), req.params.id);
  if (exists) return void res.status(409).json({ error: "الموقع موجود مسبقًا" });
  const normalizedPhone = typeof phone_number === "string" ? phone_number.trim() : "";
  const normalizedNotes = typeof notes === "string" ? notes.trim() : "";
  db.transaction(() => {
    db.prepare("UPDATE unload_locations SET name=?, notes=?, phone_number=?, map_url=? WHERE id=?")
      .run(name.trim(), normalizedNotes || null, normalizedPhone || null, map_url, req.params.id);
    db.prepare(`
      UPDATE loading_orders SET unload_location=?, unload_location_id=?
      WHERE unload_location_id=?
         OR (unload_location_id IS NULL AND LOWER(TRIM(unload_location))=LOWER(TRIM(?)))
    `).run(name.trim(), req.params.id, req.params.id, current.name);
  })();
  res.json({ ok: true });
});

router.delete("/unload-locations/:id", (req, res) => {
  db.prepare("UPDATE loading_orders SET unload_location_id=NULL WHERE unload_location_id=?").run(req.params.id);
  db.prepare("DELETE FROM unload_locations WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
