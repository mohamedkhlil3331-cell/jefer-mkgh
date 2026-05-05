import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

const SHEET_ID = "1yqIRQPMo2_dXUfzWLcyO2WKkjN83e5Wko5a3ZdtdTtU";

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

// Fetch a sheet by GID
router.get("/sheets/:gid", async (req, res) => {
  const { gid } = req.params;
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return void res.status(502).json({ error: "فشل جلب البيانات من جوجل شيت" });
    const text = await r.text();
    if (text.includes("<!DOCTYPE")) return void res.status(404).json({ error: "الورقة غير موجودة" });
    const rows = parseCSV(text);
    res.json({ gid, rows, headers: rows.length > 0 ? Object.keys(rows[0]) : [], count: rows.length });
  } catch {
    res.status(502).json({ error: "فشل الاتصال بجوجل شيت" });
  }
});

// Known sheets registry
router.get("/sheets", (_req, res) => {
  res.json([
    { gid: "1937499220", name: "طلبات العملاء", description: "سجل الطلبات مع حالة التنفيذ" },
    { gid: "0", name: "الرئيسية - الأقسام", description: "أقسام النظام والأيقونات" },
  ]);
});

// Import rows from sheet into workflow_orders
router.post("/sheets/:gid/import", async (req, res) => {
  const { gid } = req.params;
  if (gid !== "1937499220") return void res.status(400).json({ error: "استيراد هذه الورقة غير مدعوم حالياً" });

  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await r.text();
    const rows = parseCSV(text);

    let imported = 0; let skipped = 0;
    for (const row of rows) {
      const rawId = row["ID"] || "";
      if (!rawId) { skipped++; continue; }
      const normalizedId = rawId.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
      const orderNum = normalizedId.toUpperCase().replace(/^MK/, "MKGH");
      const exists = db.prepare("SELECT id FROM workflow_orders WHERE order_number = ?").get(orderNum);
      if (exists) { skipped++; continue; }

      const [lat, lng] = (row["لوكيشن التنزيل"] || "").split(",").map(s => parseFloat(s.trim()));
      db.prepare(`
        INSERT INTO workflow_orders
          (order_number, customer_phone, product_name, quantity, unit,
           delivery_location, delivery_lat, delivery_lng,
           vehicle_plate, driver_name, driver_phone, stage, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        orderNum,
        row["رقم الجوال"] || "",
        row["نوع الطلب"] || "",
        parseFloat(row["الكمية بالحبة"]) || 0,
        "حبة",
        row["مكان التنزيل"] || "",
        isNaN(lat) ? null : lat,
        isNaN(lng) ? null : lng,
        row["رقم السيارة"] || null,
        row["اسم السائق"] || null,
        row["رقم السائق"] || null,
        row["حالة الطلب"] ? "delivered" : "pending",
        row["الوقت والتاريخ"] || new Date().toISOString(),
      );
      imported++;
    }

    res.json({ imported, skipped, total: rows.length, message: `تم استيراد ${imported} سجل وتخطي ${skipped} مكرر` });
  } catch {
    res.status(502).json({ error: "فشل الاستيراد" });
  }
});

export default router;
