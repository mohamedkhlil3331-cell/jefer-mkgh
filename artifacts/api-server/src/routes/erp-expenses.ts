import { Router } from "express";
import { execute, queryAll, queryOne } from "../lib/erp-sql.js";

const router = Router();

router.get("/fleet-expenses", async (req, res) => {
  const { car_id, category } = req.query as Record<string, string>;
  let sql = "SELECT * FROM fleet_expenses WHERE 1=1";
  const params: string[] = [];
  if (car_id)   { sql += " AND car_id = ?"; params.push(car_id); }
  if (category) { sql += " AND expense_category = ?"; params.push(category); }
  sql += " ORDER BY date DESC, id DESC";
  res.json(await queryAll(sql, ...params));
});

router.get("/fleet-expenses/summary", async (_req, res) => {
  const total = await queryOne("SELECT SUM(amount) as total FROM fleet_expenses");
  const byCar = await queryAll(`
    SELECT car_id, SUM(amount) as total FROM fleet_expenses
    WHERE car_id IS NOT NULL AND car_id != ''
    GROUP BY car_id ORDER BY total DESC LIMIT 10
  `);
  const byCategory = await queryAll(`
    SELECT expense_category, SUM(amount) as total FROM fleet_expenses
    GROUP BY expense_category ORDER BY total DESC
  `);
  res.json({ total, byCar, byCategory });
});

router.post("/fleet-expenses", async (req, res) => {
  const { date, car_id, expense_category, description, amount, document_number } = req.body;
  const result = await execute(`
    INSERT INTO fleet_expenses (date, car_id, expense_category, description, amount, document_number)
    VALUES (?,?,?,?,?,?)
  `, date, car_id || null, expense_category, description, parseFloat(amount) || 0, document_number || null);
  res.status(201).json({ id: result.lastInsertRowid, message: "تم تسجيل المصروف" });
});

router.put("/fleet-expenses/:id", async (req, res) => {
  const { date, car_id, expense_category, description, amount, document_number } = req.body;
  await execute(`
    UPDATE fleet_expenses SET date=?, car_id=?, expense_category=?, description=?, amount=?, document_number=?
    WHERE id=?
  `, date, car_id || null, expense_category, description || null,
         parseFloat(amount) || 0, document_number || null, req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/fleet-expenses/:id", async (req, res) => {
  await execute("DELETE FROM fleet_expenses WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

// Petty cash
router.get("/petty-cash", async (req, res) => {
  const { custodian } = req.query as Record<string, string>;
  let sql = "SELECT * FROM petty_cash WHERE 1=1";
  const params: string[] = [];
  if (custodian) { sql += " AND custodian_name = ?"; params.push(custodian); }
  sql += " ORDER BY date ASC, id ASC";
  const rows = await queryAll<Record<string, number | string>>(sql, ...params);
  // compute running balance
  let balance = 0;
  const result = rows.map(r => {
    balance += (r.amount_in as number) - (r.amount_out as number);
    return { ...r, balance: parseFloat(balance.toFixed(2)) };
  });
  res.json(result);
});

router.get("/petty-cash/custodians", async (_req, res) => {
  const rows = await queryAll("SELECT DISTINCT custodian_name FROM petty_cash WHERE custodian_name IS NOT NULL");
  res.json(rows);
});

router.post("/petty-cash", async (req, res) => {
  const { date, custodian_name, transaction_type, description, amount_in, amount_out, receipt_number } = req.body;
  const result = await execute(`
    INSERT INTO petty_cash (date, custodian_name, transaction_type, description, amount_in, amount_out, receipt_number)
    VALUES (?,?,?,?,?,?,?)
  `, date, custodian_name, transaction_type,
         description, parseFloat(amount_in) || 0, parseFloat(amount_out) || 0, receipt_number || null);
  res.status(201).json({ id: result.lastInsertRowid, message: "تم تسجيل القيد" });
});

router.delete("/petty-cash/:id", async (req, res) => {
  await execute("DELETE FROM petty_cash WHERE id=?", req.params.id);
  res.json({ message: "تم الحذف" });
});

export default router;
