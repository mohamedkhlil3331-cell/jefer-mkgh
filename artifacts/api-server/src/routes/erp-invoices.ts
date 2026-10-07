import { Router } from "express";
import multer from "multer";
import path from "path";
import { UPLOADS_PATH } from "../lib/db.js";
import db from "../lib/db.js";

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
  filename: (_req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/invoices", (_req, res) => {
  const rows = db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all();
  res.json(rows);
});

router.post("/invoices", upload.single("invoice_image"), (req, res) => {
  const { department, details, amount } = req.body;
  const image_url = req.file ? `/api/uploads/${req.file.filename}` : null;
  const result = db.prepare(
    "INSERT INTO invoices (department, details, amount, image_url) VALUES (?,?,?,?)"
  ).run(department, details, parseFloat(amount) || 0, image_url);
  res.status(201).json({ id: result.lastInsertRowid, message: "تم حفظ الفاتورة" });
});

router.put("/invoices/:id", upload.single("invoice_image"), (req, res) => {
  const { department, details, amount } = req.body;
  const existing = db.prepare("SELECT * FROM invoices WHERE id=?").get(req.params.id) as { image_url: string | null } | undefined;
  if (!existing) { res.status(404).json({ message: "غير موجود" }); return; }
  const image_url = req.file ? `/api/uploads/${req.file.filename}` : existing.image_url;
  db.prepare(
    "UPDATE invoices SET department=?, details=?, amount=?, image_url=? WHERE id=?"
  ).run(department, details, parseFloat(amount) || 0, image_url, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/invoices/:id", (req, res) => {
  db.prepare("DELETE FROM invoices WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
