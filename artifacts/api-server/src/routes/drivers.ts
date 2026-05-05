import { Router } from "express";
import db from "../lib/db.js";

const router = Router();
const SHEET_ID = "1yqIRQPMo2_dXUfzWLcyO2WKkjN83e5Wko5a3ZdtdTtU";
const DRIVER_GID = "702903959";
const STATUS_GID = "1942701062";

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

// GET /drivers
router.get("/drivers", (_req, res) => {
  const rows = db.prepare("SELECT * FROM driver_profiles ORDER BY driver_name").all();
  res.json(rows);
});

// GET /drivers/stats
router.get("/drivers/stats", (_req, res) => {
  const total = (db.prepare("SELECT COUNT(*) as c FROM driver_profiles").get() as { c: number }).c;
  const active = (db.prepare("SELECT COUNT(*) as c FROM driver_profiles WHERE status='نشط'").get() as { c: number }).c;
  const onTrip = (db.prepare(`
    SELECT COUNT(DISTINCT driver_phone) as c FROM workflow_orders WHERE stage='loaded'
  `).get() as { c: number }).c;
  const recentOrders = db.prepare(`
    SELECT dp.driver_name, dp.vehicle_plate, wo.order_number, wo.delivery_location, wo.stage, wo.created_at
    FROM driver_profiles dp
    LEFT JOIN workflow_orders wo ON wo.driver_phone = dp.phone
    WHERE wo.id IS NOT NULL
    ORDER BY wo.created_at DESC LIMIT 6
  `).all();
  res.json({ total, active, onTrip, noDoc: 0, recentOrders });
});

// POST /drivers/sync
router.post("/drivers/sync", async (_req, res) => {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${DRIVER_GID}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return void res.status(502).json({ error: "فشل جلب بيانات السائقين" });
    const text = await r.text();
    if (text.includes("<!DOCTYPE")) return void res.status(404).json({ error: "الورقة غير موجودة" });
    const rows = parseCSV(text);

    // Also fetch status sheet
    const statusUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${STATUS_GID}`;
    const sr = await fetch(statusUrl, { signal: AbortSignal.timeout(10000) });
    const statusMap: Record<string, string> = {};
    if (sr.ok) {
      const statusText = await sr.text();
      const statusRows = parseCSV(statusText);
      for (const row of statusRows) {
        if (row["رقم السيارة"]) statusMap[row["رقم السيارة"]] = row["الحالة"] || "نشط";
      }
    }

    db.prepare("DELETE FROM driver_profiles").run();
    const ins = db.prepare(`
      INSERT INTO driver_profiles
        (vehicle_plate, driver_name, phone, branch, email, license_url, operation_card_url, driver_card_url, insurance_url, status, synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `);
    let imported = 0;
    for (const row of rows) {
      const name = row["اسم السائق"]?.trim();
      if (!name) continue;
      const plate = row["رقم السيارة"]?.trim();
      const status = statusMap[plate || ""] || "نشط";
      ins.run(
        plate || null,
        name,
        row["رقم الجوال"]?.trim() || null,
        row["الفرع"]?.trim() || "النقليات",
        row["ايميل"]?.trim() || null,
        row["الرخصة"]?.trim() || null,
        row["كرت التشغيل"]?.trim() || null,
        row["كرت سائق"]?.trim() || null,
        row["تأمين"]?.trim() || null,
        status,
      );
      imported++;
    }
    res.json({ imported, message: `تم مزامنة ${imported} سائق` });
  } catch (e) {
    res.status(502).json({ error: "فشل الاتصال بجوجل شيت" });
  }
});

// POST /drivers
router.post("/drivers", (req, res) => {
  const { vehicle_plate, driver_name, phone, branch, email, status, notes } = req.body;
  if (!driver_name) return void res.status(400).json({ error: "اسم السائق مطلوب" });
  const r = db.prepare(`
    INSERT INTO driver_profiles (vehicle_plate,driver_name,phone,branch,email,status,notes)
    VALUES (?,?,?,?,?,?,?)
  `).run(vehicle_plate||null, driver_name, phone||null, branch||"النقليات", email||null, status||"نشط", notes||null);
  res.status(201).json({ id: r.lastInsertRowid });
});

// PUT /drivers/:id
router.put("/drivers/:id", (req, res) => {
  const { vehicle_plate, driver_name, phone, branch, email, status, notes } = req.body;
  db.prepare(`
    UPDATE driver_profiles SET vehicle_plate=?,driver_name=?,phone=?,branch=?,email=?,status=?,notes=? WHERE id=?
  `).run(vehicle_plate||null, driver_name, phone||null, branch||"النقليات", email||null, status||"نشط", notes||null, req.params.id);
  res.json({ message: "تم التحديث" });
});

// DELETE /drivers/:id
router.delete("/drivers/:id", (req, res) => {
  db.prepare("DELETE FROM driver_profiles WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
