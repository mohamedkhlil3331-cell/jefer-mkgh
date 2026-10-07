import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import db from "../lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_PATH = path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

const router = Router();

// ── List reps ────────────────────────────────────────────────────────────────
router.get("/reps", (_req, res) => {
  const reps = db.prepare("SELECT id, name, phone FROM users WHERE role='rep' AND active=1 ORDER BY name").all();
  res.json(reps);
});

// ── List rep requests ────────────────────────────────────────────────────────
router.get("/rep-requests", (req, res) => {
  const { status, created_by, rep_phone, driver_phone, needs_vehicle, needs_permit } = req.query as Record<string, string>;
  let sql = "SELECT * FROM rep_requests WHERE 1=1";
  const params: unknown[] = [];

  if (status)       { sql += " AND status=?";      params.push(status); }
  if (created_by)   { sql += " AND created_by=?";  params.push(created_by); }
  if (rep_phone)    { sql += " AND rep_phone=?";   params.push(rep_phone); }
  if (driver_phone) { sql += " AND driver_phone=?";params.push(driver_phone); }
  if (needs_vehicle === "1") { sql += " AND status='pending'"; }
  if (needs_permit  === "1") { sql += " AND status='vehicle_assigned'"; }

  sql += " ORDER BY created_at DESC";
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  res.json(rows.map(r => ({
    ...r,
    loading_locations: (() => { try { return JSON.parse(r.loading_locations as string || "[]"); } catch { return []; } })(),
  })));
});

// ── Create rep request ───────────────────────────────────────────────────────
router.post("/rep-requests", (req, res) => {
  const { product_name, loading_locations, delivery_location, rep_name, rep_phone, notes, created_by } = req.body as Record<string, unknown>;
  if (!product_name) return void res.status(400).json({ error: "اسم المنتج مطلوب" });

  const no = `RR${Date.now()}`;
  const r = db.prepare(`
    INSERT INTO rep_requests
      (request_no, product_name, loading_locations, delivery_location, rep_name, rep_phone, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    no,
    String(product_name),
    JSON.stringify(Array.isArray(loading_locations) ? loading_locations : []),
    delivery_location ? String(delivery_location) : null,
    rep_name ? String(rep_name) : null,
    rep_phone ? String(rep_phone) : null,
    notes ? String(notes) : null,
    created_by ? String(created_by) : null,
  );
  res.json({ id: r.lastInsertRowid, request_no: no });
});

// ── Supervisor: assign vehicle ────────────────────────────────────────────────
router.put("/rep-requests/:id/assign-vehicle", (req, res) => {
  const { vehicle_plate, driver_name, driver_phone } = req.body as Record<string, string>;
  if (!vehicle_plate) return void res.status(400).json({ error: "رقم اللوحة مطلوب" });
  db.prepare(`
    UPDATE rep_requests
    SET status='vehicle_assigned', vehicle_plate=?, driver_name=?, driver_phone=?, assigned_at=datetime('now')
    WHERE id=?
  `).run(vehicle_plate, driver_name || null, driver_phone || null, req.params.id);
  res.json({ ok: true });
});

// ── Fsohat: upload permit ─────────────────────────────────────────────────────
router.put("/rep-requests/:id/upload-permit", upload.single("permit_photo"), (req, res) => {
  const photoUrl = req.file ? `/api/uploads/${req.file.filename}` : null;
  if (!photoUrl) return void res.status(400).json({ error: "صورة الفسحة مطلوبة" });
  db.prepare(`
    UPDATE rep_requests
    SET status='permit_uploaded', permit_photo_url=?, permit_uploaded_at=datetime('now')
    WHERE id=?
  `).run(photoUrl, req.params.id);
  res.json({ ok: true, permit_photo_url: photoUrl });
});

// ── Driver: load + upload invoice photo ──────────────────────────────────────
router.put("/rep-requests/:id/load", upload.single("invoice_photo"), (req, res) => {
  const photoUrl = req.file ? `/api/uploads/${req.file.filename}` : null;
  db.prepare(`
    UPDATE rep_requests
    SET status='loaded', invoice_photo_url=?, loaded_at=datetime('now')
    WHERE id=?
  `).run(photoUrl, req.params.id);
  res.json({ ok: true, invoice_photo_url: photoUrl });
});

// ── Driver: deliver ───────────────────────────────────────────────────────────
router.put("/rep-requests/:id/deliver", (req, res) => {
  db.prepare(`
    UPDATE rep_requests SET status='delivered', delivered_at=datetime('now') WHERE id=?
  `).run(req.params.id);
  res.json({ ok: true });
});

// ── Cancel ────────────────────────────────────────────────────────────────────
router.put("/rep-requests/:id/cancel", (req, res) => {
  db.prepare("UPDATE rep_requests SET status='cancelled' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/rep-requests/:id", (req, res) => {
  const row = db.prepare("SELECT id FROM rep_requests WHERE id=?").get(req.params.id);
  if (!row) return void res.status(404).json({ error: "الطلب غير موجود" });
  db.prepare("DELETE FROM rep_requests WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
