import { Router } from "express";
import db from "../lib/db.js";

const router = Router();
const SHEET_ID = "1yqIRQPMo2_dXUfzWLcyO2WKkjN83e5Wko5a3ZdtdTtU";
const TARIFF_GID = "1287689900";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = ""; let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { values.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
}

// GET /tariffs
router.get("/tariffs", (_req, res) => {
  const rows = db.prepare("SELECT * FROM tariffs ORDER BY loading_place, unloading_place").all();
  const syncedAt = (db.prepare("SELECT MAX(synced_at) as ts FROM tariffs").get() as { ts: string | null })?.ts;
  res.json({ rows, count: rows.length, synced_at: syncedAt });
});

// GET /tariffs/loading-places
router.get("/tariffs/loading-places", (_req, res) => {
  const rows = db.prepare("SELECT DISTINCT loading_place FROM tariffs ORDER BY loading_place").all() as { loading_place: string }[];
  res.json(rows.map(r => r.loading_place));
});

// POST /tariffs/sync - fetch from Google Sheets and store in DB
router.post("/tariffs/sync", async (_req, res) => {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${TARIFF_GID}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return void res.status(502).json({ error: "فشل جلب التعريفة من جوجل شيت" });
    const text = await r.text();
    if (text.includes("<!DOCTYPE")) return void res.status(404).json({ error: "الورقة غير موجودة" });
    const rows = parseCSV(text);

    // Clear and re-import
    db.prepare("DELETE FROM tariffs").run();
    const ins = db.prepare(`
      INSERT INTO tariffs (row_id, loading_place, unloading_place, driver_expense, rental, synced_at)
      VALUES (?,?,?,?,?,datetime('now'))
    `);
    let imported = 0;
    for (const row of rows) {
      const loading = row["مكان التحميل"]?.trim();
      const unloading = row["مكان التنزيل"]?.trim();
      if (!loading || !unloading) continue;
      ins.run(
        parseInt(row["ID"]) || null,
        loading,
        unloading,
        parseFloat(row["السعر"]) || 0,
        parseFloat(row["الايجار"]) || 0,
      );
      imported++;
    }
    res.json({ imported, message: `تم مزامنة ${imported} سطر من التعريفة` });
  } catch {
    res.status(502).json({ error: "فشل الاتصال بجوجل شيت" });
  }
});

// PUT /tariffs/:id
router.put("/tariffs/:id", (req, res) => {
  const { loading_place, unloading_place, driver_expense, rental, notes } = req.body;
  db.prepare("UPDATE tariffs SET loading_place=?,unloading_place=?,driver_expense=?,rental=?,notes=? WHERE id=?")
    .run(loading_place, unloading_place, parseFloat(driver_expense)||0, parseFloat(rental)||0, notes||null, req.params.id);
  res.json({ message: "تم التحديث" });
});

// DELETE /tariffs/:id
router.delete("/tariffs/:id", (req, res) => {
  db.prepare("DELETE FROM tariffs WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// POST /tariffs (manual add)
router.post("/tariffs", (req, res) => {
  const { loading_place, unloading_place, driver_expense, rental, notes } = req.body;
  const r = db.prepare("INSERT INTO tariffs (loading_place,unloading_place,driver_expense,rental,notes) VALUES (?,?,?,?,?)")
    .run(loading_place, unloading_place, parseFloat(driver_expense)||0, parseFloat(rental)||0, notes||null);
  res.status(201).json({ id: r.lastInsertRowid, message: "تم الإضافة" });
});

export default router;
