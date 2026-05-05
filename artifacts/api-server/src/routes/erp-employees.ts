import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// ── Migration: add new employee fields ─────────────────────────────────────────
const newCols: [string, string][] = [
  ["entity",      "TEXT"],
  ["iqama_amount","REAL DEFAULT 0"],
  ["passport_end","TEXT"],
  ["vehicle_plate","TEXT"],
  ["efficiency",  "TEXT DEFAULT 'جيد'"],
  ["penalties",   "REAL DEFAULT 0"],
  ["allowances",  "REAL DEFAULT 0"],
  ["bonus",       "REAL DEFAULT 0"],
  ["rewards",     "REAL DEFAULT 0"],
];
for (const [col, type] of newCols) {
  try { db.exec(`ALTER TABLE employees ADD COLUMN ${col} ${type}`); } catch {}
}

// ── Employee list ───────────────────────────────────────────────────────────────
router.get("/employees", (_req, res) => {
  const rows = db.prepare("SELECT * FROM employees ORDER BY id").all();
  res.json(rows);
});

router.get("/employees/stats", (_req, res) => {
  const employees = db.prepare("SELECT * FROM employees").all() as Record<string, unknown>[];
  const active = employees.filter(e => e.status === "يعمل" || e.status === "active");
  const totalSalary = active.reduce((s, e) => s + (Number(e.salary) || 0), 0);
  const totalAllowances = active.reduce((s, e) => s + (Number(e.allowances) || 0), 0);

  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const expiring = employees.filter(e =>
    (String(e.iqama_end || "") > today && String(e.iqama_end || "") <= in90) ||
    (String(e.driver_license_end || "") > today && String(e.driver_license_end || "") <= in90) ||
    (String(e.passport_end || "") > today && String(e.passport_end || "") <= in90)
  ).length;
  const expired = employees.filter(e =>
    String(e.iqama_end || "") < today ||
    String(e.driver_license_end || "") < today ||
    String(e.passport_end || "") < today
  ).length;

  res.json({
    total: employees.length,
    active: active.length,
    total_salary: totalSalary,
    total_allowances: totalAllowances,
    monthly_bill: totalSalary + totalAllowances,
    expiring_docs: expiring,
    expired_docs: expired,
  });
});

router.get("/employees/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM employees WHERE id = ?").get(req.params.id);
  if (!row) return void res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.post("/employees", (req, res) => {
  const f = req.body;
  const result = db.prepare(`
    INSERT INTO employees
      (name, job_title, department, entity, nationality, phone, email, password, role,
       status, salary, allowances, bonus, rewards, penalties,
       hire_date, iqama_no, iqama_amount, iqama_start, iqama_end,
       work_permit_start, work_permit_end, driver_license_no, driver_license_end,
       passport_end, vehicle_plate, efficiency, permissions)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    f.name, f.job_title||null, f.department||null, f.entity||null,
    f.nationality||null, f.phone||null, f.email||null, f.password||null, f.role||"worker",
    f.status||"يعمل",
    parseFloat(f.salary)||0, parseFloat(f.allowances)||0, parseFloat(f.bonus)||0,
    parseFloat(f.rewards)||0, parseFloat(f.penalties)||0,
    f.hire_date||null, f.iqama_no||null, parseFloat(f.iqama_amount)||0,
    f.iqama_start||null, f.iqama_end||null,
    f.work_permit_start||null, f.work_permit_end||null,
    f.driver_license_no||null, f.driver_license_end||null,
    f.passport_end||null, f.vehicle_plate||null,
    f.efficiency||"جيد",
    typeof f.permissions === "object" ? JSON.stringify(f.permissions) : (f.permissions||"{}")
  );
  res.status(201).json({ id: result.lastInsertRowid, message: "تم إضافة الموظف" });
});

router.put("/employees/:id", (req, res) => {
  const f = req.body;
  db.prepare(`
    UPDATE employees SET
      name=?, job_title=?, department=?, entity=?, nationality=?, phone=?, email=?,
      role=?, status=?, salary=?, allowances=?, bonus=?, rewards=?, penalties=?,
      hire_date=?, iqama_no=?, iqama_amount=?, iqama_start=?, iqama_end=?,
      work_permit_start=?, work_permit_end=?,
      driver_license_no=?, driver_license_end=?,
      passport_end=?, vehicle_plate=?, efficiency=?, permissions=?
    WHERE id=?
  `).run(
    f.name, f.job_title||null, f.department||null, f.entity||null,
    f.nationality||null, f.phone||null, f.email||null,
    f.role||"worker", f.status||"يعمل",
    parseFloat(f.salary)||0, parseFloat(f.allowances)||0, parseFloat(f.bonus)||0,
    parseFloat(f.rewards)||0, parseFloat(f.penalties)||0,
    f.hire_date||null, f.iqama_no||null, parseFloat(f.iqama_amount)||0,
    f.iqama_start||null, f.iqama_end||null,
    f.work_permit_start||null, f.work_permit_end||null,
    f.driver_license_no||null, f.driver_license_end||null,
    f.passport_end||null, f.vehicle_plate||null,
    f.efficiency||"جيد",
    typeof f.permissions === "object" ? JSON.stringify(f.permissions) : (f.permissions||"{}"),
    req.params.id
  );
  res.json({ message: "تم التحديث" });
});

router.delete("/employees/:id", (req, res) => {
  db.prepare("DELETE FROM employees WHERE id = ?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// ── Leave requests ──────────────────────────────────────────────────────────────
router.get("/leave-requests", (_req, res) => {
  res.json(db.prepare("SELECT * FROM leave_requests ORDER BY created_at DESC").all());
});

router.post("/leave-requests", (req, res) => {
  const { employee_id, employee_name, leave_type, from_date, to_date, reason } = req.body;
  const d1 = new Date(from_date), d2 = new Date(to_date);
  const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
  const result = db.prepare(
    "INSERT INTO leave_requests (employee_id,employee_name,leave_type,from_date,to_date,days,reason) VALUES (?,?,?,?,?,?,?)"
  ).run(employee_id, employee_name, leave_type, from_date, to_date, days, reason);
  res.status(201).json({ id: result.lastInsertRowid, days, message: "تم تقديم طلب الإجازة" });
});

router.put("/leave-requests/:id/status", (req, res) => {
  const { status, reviewed_by } = req.body;
  db.prepare("UPDATE leave_requests SET status=?,reviewed_by=? WHERE id=?")
    .run(status, reviewed_by, req.params.id);
  res.json({ message: "تم تحديث الحالة" });
});

router.delete("/leave-requests/:id", (req, res) => {
  db.prepare("DELETE FROM leave_requests WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
