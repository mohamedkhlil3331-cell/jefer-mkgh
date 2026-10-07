import db from "./db.js";
import { hashRentalPassword, RENTAL_CUSTOMER_ROLE } from "./rental-customer-auth.js";

export function ensureRentalPortalUser(customerId: number, name: string, phone: string | null, customerType: string):
  { userId: number; created: boolean } | null {
  if (customerType !== "rental" || !phone?.trim()) return null;
  const customer = db.prepare("SELECT portal_user_id FROM rental_customers WHERE id=?").get(customerId) as
    { portal_user_id: number | null } | undefined;
  if (!customer) throw new Error("العميل غير موجود");
  const linkedId = customer.portal_user_id;
  const otherCustomer = db.prepare("SELECT id FROM rental_customers WHERE id<>? AND phone=?").get(customerId, phone);
  if (otherCustomer) throw new Error("رقم الجوال مرتبط بعميل إيجار آخر");
  const collision = db.prepare("SELECT id FROM users WHERE phone=? AND (? IS NULL OR id<>?)")
    .get(phone, linkedId ?? null, linkedId ?? null) as { id: number } | undefined;
  if (collision) throw new Error("رقم الجوال مستخدم بالفعل في حساب آخر");

  if (linkedId) {
    const linked = db.prepare("SELECT id,role FROM users WHERE id=?").get(linkedId) as { id: number; role: string } | undefined;
    if (linked && linked.role !== RENTAL_CUSTOMER_ROLE) throw new Error("حساب الدخول المرتبط لا يحمل صلاحية عميل إيجار");
    if (linked) {
      db.prepare("UPDATE users SET name=?,phone=? WHERE id=?").run(name, phone, linkedId);
      return { userId: linkedId, created: false };
    }
  }

  const result = db.prepare(`INSERT INTO users(name,phone,password,role,active,approval_status)
    VALUES(?,?,?,?,1,'approved')`).run(name, phone, hashRentalPassword(phone), RENTAL_CUSTOMER_ROLE);
  db.prepare("UPDATE rental_customers SET portal_user_id=? WHERE id=?").run(result.lastInsertRowid, customerId);
  return { userId: Number(result.lastInsertRowid), created: true };
}

export function backfillRentalPortalUsers(): { created: number; missingPhone: number; conflicts: number } {
  // Historical statements may exist without a customer-directory row. Add the
  // directory record without touching the statement, then link it once a phone is saved.
  db.prepare(`
    INSERT OR IGNORE INTO rental_customers(name,customer_type)
    SELECT name,'rental' FROM (
      SELECT TRIM(customer_name) name FROM rental_account_entries
      UNION SELECT TRIM(customer_name) FROM rental_payments
      UNION SELECT TRIM(customer_name) FROM rental_statement_adjustments
    ) WHERE name<>''
  `).run();
  const rows = db.prepare(`
    SELECT id,name,phone,customer_type FROM rental_customers
    WHERE customer_type='rental' AND active=1 AND portal_user_id IS NULL
  `).all() as Array<{ id: number; name: string; phone: string | null; customer_type: string }>;
  let created = 0, missingPhone = 0, conflicts = 0;
  for (const customer of rows) {
    if (!customer.phone?.trim()) { missingPhone++; continue; }
    try {
      const result = db.transaction(() =>
        ensureRentalPortalUser(customer.id, customer.name, customer.phone, customer.customer_type)
      )();
      if (result?.created) created++;
    } catch {
      // Never assign another user's phone/account to a historical customer.
      conflicts++;
    }
  }
  return { created, missingPhone, conflicts };
}