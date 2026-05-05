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

// ── Bulk import ─────────────────────────────────────────────────────────────────
router.post("/employees/import", (req, res) => {
  const rows: Record<string, unknown>[] = req.body?.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0)
    return void res.status(400).json({ error: "لا توجد بيانات" });

  const COL: Record<string, string> = {
    "الاسم":"name","اسم الموظف":"name","name":"name",
    "الوظيفة":"job_title","العمل":"job_title","job_title":"job_title","المسمى الوظيفي":"job_title",
    "الجهة":"entity","entity":"entity","الشركة":"entity",
    "القسم":"department","department":"department","الإدارة":"department",
    "الجنسية":"nationality","nationality":"nationality",
    "الجوال":"phone","رقم الجوال":"phone","phone":"phone","الهاتف":"phone",
    "الحالة":"status","status":"status",
    "الراتب":"salary","salary":"salary","الراتب الأساسي":"salary",
    "العلاوات":"allowances","allowances":"allowances","علاوة":"allowances",
    "البونص":"bonus","bonus":"bonus",
    "المكافآت":"rewards","rewards":"rewards",
    "الجزاءات":"penalties","penalties":"penalties",
    "تاريخ المباشرة":"hire_date","hire_date":"hire_date","تاريخ التعيين":"hire_date",
    "رقم الإقامة":"iqama_no","iqama_no":"iqama_no",
    "مبلغ الإقامة":"iqama_amount","iqama_amount":"iqama_amount",
    "انتهاء الإقامة":"iqama_end","iqama_end":"iqama_end","تاريخ انتهاء الإقامة":"iqama_end",
    "رقم الرخصة":"driver_license_no","driver_license_no":"driver_license_no",
    "انتهاء الرخصة":"driver_license_end","driver_license_end":"driver_license_end","تاريخ انتهاء الرخصة":"driver_license_end",
    "انتهاء الجواز":"passport_end","passport_end":"passport_end","تاريخ انتهاء الجواز":"passport_end",
    "السيارة":"vehicle_plate","vehicle_plate":"vehicle_plate","رقم اللوحة":"vehicle_plate",
    "الكفاءة":"efficiency","efficiency":"efficiency",
  };

  const ins = db.prepare(`
    INSERT INTO employees
      (name,job_title,department,entity,nationality,phone,status,salary,allowances,
       bonus,rewards,penalties,hire_date,iqama_no,iqama_amount,iqama_end,
       driver_license_no,driver_license_end,passport_end,vehicle_plate,efficiency)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let imported = 0;
  for (const raw of rows) {
    const m: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      const field = COL[k.trim()] ?? COL[k.trim().toLowerCase()];
      if (field) m[field] = v;
    }
    if (!m.name) continue;
    ins.run(
      m.name, m.job_title||null, m.department||null, m.entity||null,
      m.nationality||null, m.phone||null, m.status||"يعمل",
      parseFloat(String(m.salary||0))||0, parseFloat(String(m.allowances||0))||0,
      parseFloat(String(m.bonus||0))||0, parseFloat(String(m.rewards||0))||0,
      parseFloat(String(m.penalties||0))||0,
      m.hire_date||null, m.iqama_no||null, parseFloat(String(m.iqama_amount||0))||0,
      m.iqama_end||null, m.driver_license_no||null, m.driver_license_end||null,
      m.passport_end||null, m.vehicle_plate||null, m.efficiency||"جيد",
    );
    imported++;
  }
  res.json({ imported, message: `تم استيراد ${imported} موظف` });
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
