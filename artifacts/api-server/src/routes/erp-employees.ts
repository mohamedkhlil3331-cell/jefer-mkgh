import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/employees", (_req, res) => {
  const rows = db.prepare("SELECT * FROM employees ORDER BY name").all();
  res.json(rows);
});

router.get("/employees/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM employees WHERE id = ?").get(req.params.id);
  if (!row) return void res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.post("/employees", (req, res) => {
  const {
    name, job_title, department, nationality, phone, email, password, role,
    status, salary, hire_date, iqama_no, iqama_start, iqama_end,
    work_permit_start, work_permit_end, driver_license_no, driver_license_end,
    permissions
  } = req.body;

  const result = db.prepare(`
    INSERT INTO employees
      (name, job_title, department, nationality, phone, email, password, role,
       status, salary, hire_date, iqama_no, iqama_start, iqama_end,
       work_permit_start, work_permit_end, driver_license_no, driver_license_end, permissions)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    name, job_title, department, nationality, phone, email,
    password, role || "worker", status || "active", salary || 0,
    hire_date, iqama_no, iqama_start, iqama_end,
    work_permit_start, work_permit_end, driver_license_no, driver_license_end,
    typeof permissions === "object" ? JSON.stringify(permissions) : (permissions || "{}")
  );
  res.status(201).json({ id: result.lastInsertRowid, message: "تم إضافة الموظف" });
});

router.put("/employees/:id", (req, res) => {
  const {
    name, job_title, department, nationality, phone, email, password, role,
    status, salary, hire_date, iqama_no, iqama_start, iqama_end,
    work_permit_start, work_permit_end, driver_license_no, driver_license_end,
    permissions
  } = req.body;

  db.prepare(`
    UPDATE employees SET
      name=?, job_title=?, department=?, nationality=?, phone=?, email=?,
      password=?, role=?, status=?, salary=?, hire_date=?,
      iqama_no=?, iqama_start=?, iqama_end=?,
      work_permit_start=?, work_permit_end=?,
      driver_license_no=?, driver_license_end=?, permissions=?
    WHERE id=?
  `).run(
    name, job_title, department, nationality, phone, email,
    password, role, status, salary, hire_date,
    iqama_no, iqama_start, iqama_end,
    work_permit_start, work_permit_end,
    driver_license_no, driver_license_end,
    typeof permissions === "object" ? JSON.stringify(permissions) : (permissions || "{}"),
    req.params.id
  );
  res.json({ message: "تم التحديث" });
});

router.delete("/employees/:id", (req, res) => {
  db.prepare("DELETE FROM employees WHERE id = ?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// Leave requests
router.get("/leave-requests", (_req, res) => {
  const rows = db.prepare("SELECT * FROM leave_requests ORDER BY created_at DESC").all();
  res.json(rows);
});

router.post("/leave-requests", (req, res) => {
  const { employee_id, employee_name, leave_type, from_date, to_date, reason } = req.body;
  const d1 = new Date(from_date), d2 = new Date(to_date);
  const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
  const result = db.prepare(`
    INSERT INTO leave_requests (employee_id, employee_name, leave_type, from_date, to_date, days, reason)
    VALUES (?,?,?,?,?,?,?)
  `).run(employee_id, employee_name, leave_type, from_date, to_date, days, reason);
  res.status(201).json({ id: result.lastInsertRowid, days, message: "تم تقديم طلب الإجازة" });
});

router.put("/leave-requests/:id/status", (req, res) => {
  const { status, reviewed_by } = req.body;
  db.prepare("UPDATE leave_requests SET status=?, reviewed_by=? WHERE id=?")
    .run(status, reviewed_by, req.params.id);
  res.json({ message: "تم تحديث الحالة" });
});

router.delete("/leave-requests/:id", (req, res) => {
  db.prepare("DELETE FROM leave_requests WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
