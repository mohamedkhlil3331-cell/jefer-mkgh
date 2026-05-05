import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// GET /driver-expenses?phone=xxx
router.get("/driver-expenses", (req, res) => {
  const { phone } = req.query;
  const rows = phone
    ? db.prepare("SELECT * FROM driver_expenses WHERE driver_phone=? ORDER BY created_at DESC").all(phone)
    : db.prepare("SELECT * FROM driver_expenses ORDER BY created_at DESC LIMIT 200").all();
  res.json(rows);
});

// POST /driver-expenses
router.post("/driver-expenses", (req, res) => {
  const { driver_phone, driver_name, order_id, order_number, expense_type, amount, liters, description, expense_date } = req.body;
  if (!driver_phone || !amount) return void res.status(400).json({ error: "يجب تحديد السائق والمبلغ" });
  const r = db.prepare(`
    INSERT INTO driver_expenses (driver_phone,driver_name,order_id,order_number,expense_type,amount,liters,description,expense_date)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    driver_phone, driver_name||null, order_id||null, order_number||null,
    expense_type||"ديزل", parseFloat(amount)||0, parseFloat(liters)||0,
    description||null, expense_date||new Date().toISOString().slice(0,10)
  );
  res.status(201).json({ id: r.lastInsertRowid, message: "تم تسجيل المصروف" });
});

// DELETE /driver-expenses/:id
router.delete("/driver-expenses/:id", (req, res) => {
  db.prepare("DELETE FROM driver_expenses WHERE id=?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// GET /driver-settlements?phone=xxx
router.get("/driver-settlements", (req, res) => {
  const { phone } = req.query;
  const rows = phone
    ? db.prepare("SELECT * FROM driver_settlements WHERE driver_phone=? ORDER BY settlement_date DESC").all(phone)
    : db.prepare("SELECT * FROM driver_settlements ORDER BY settlement_date DESC LIMIT 100").all();
  res.json(rows);
});

// POST /driver-settlements
router.post("/driver-settlements", (req, res) => {
  const { driver_phone, driver_name, allocated_amount, settlement_date, settled_by, notes } = req.body;
  if (!driver_phone || !allocated_amount) return void res.status(400).json({ error: "يجب تحديد السائق والمبلغ" });
  const r = db.prepare(`
    INSERT INTO driver_settlements (driver_phone,driver_name,allocated_amount,settlement_date,settled_by,notes)
    VALUES (?,?,?,?,?,?)
  `).run(
    driver_phone, driver_name||null, parseFloat(allocated_amount)||0,
    settlement_date||new Date().toISOString().slice(0,10),
    settled_by||null, notes||null
  );
  res.status(201).json({ id: r.lastInsertRowid, message: "تم تسجيل التسوية" });
});

// GET /driver-balance?phone=xxx
router.get("/driver-balance", (req, res) => {
  const { phone } = req.query;
  if (!phone) return void res.status(400).json({ error: "يجب تحديد رقم الجوال" });

  const lastSettlement = db.prepare(
    "SELECT * FROM driver_settlements WHERE driver_phone=? ORDER BY settlement_date DESC, id DESC LIMIT 1"
  ).get(phone) as { id: number; allocated_amount: number; settlement_date: string; driver_name: string } | undefined;

  if (!lastSettlement) {
    return void res.json({ allocated: 0, spent: 0, remaining: 0, last_settlement_date: null, expenses: [] });
  }

  const expenses = db.prepare(
    "SELECT * FROM driver_expenses WHERE driver_phone=? AND expense_date >= ? ORDER BY created_at DESC"
  ).all(phone, lastSettlement.settlement_date) as { amount: number }[];

  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const remaining = lastSettlement.allocated_amount - spent;

  res.json({
    allocated: lastSettlement.allocated_amount,
    spent,
    remaining,
    last_settlement_date: lastSettlement.settlement_date,
    driver_name: lastSettlement.driver_name,
    expenses,
  });
});

export default router;
