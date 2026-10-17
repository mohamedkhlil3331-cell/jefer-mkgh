import { Router } from "express";
import multer from "multer";
import { execute, queryAll, queryOne } from "../lib/erp-sql.js";
import { r2MulterStorage, uniqueUploadName } from "../lib/r2-storage.js";

const router = Router();

const upload = multer({ storage: r2MulterStorage(name => uniqueUploadName("invoice-", name)), limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/invoices", async (_req, res) => {
  const rows = await queryAll("SELECT * FROM invoices ORDER BY created_at DESC");
  res.json(rows);
});

router.post("/invoices", upload.single("invoice_image"), async (req, res) => {
  const { department, details, amount } = req.body;
  const image_url = req.file ? `/api/uploads/${req.file.filename}` : null;
  const result = await execute(
    "INSERT INTO invoices (department, details, amount, image_url) VALUES (?,?,?,?)"
  , department, details, parseFloat(amount) || 0, image_url);
  res.status(201).json({ id: result.lastInsertRowid, message: "تم حفظ الفاتورة" });
});

router.put("/invoices/:id", upload.single("invoice_image"), async (req, res) => {
  const { department, details, amount } = req.body;
  const existing = await queryOne<{ image_url: string | null }>("SELECT * FROM invoices WHERE id=?", req.params.id);
  if (!existing) { res.status(404).json({ message: "غير موجود" }); return; }
  const image_url = req.file ? `/api/uploads/${req.file.filename}` : existing.image_url;
  await execute(
    "UPDATE invoices SET department=?, details=?, amount=?, image_url=? WHERE id=?"
  , department, details, parseFloat(amount) || 0, image_url, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/invoices/:id", async (req, res) => {
  await execute("DELETE FROM invoices WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
