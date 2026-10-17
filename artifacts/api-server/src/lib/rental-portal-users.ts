import { execute, executeBatch, queryAll, queryOne } from "./erp-sql.js";
import { hashRentalPassword, RENTAL_CUSTOMER_ROLE } from "./rental-customer-auth.js";

export async function ensureRentalPortalUser(
  customerId: number,
  name: string,
  phone: string | null,
  customerType: string,
): Promise<{ userId: number; created: boolean } | null> {
  if (customerType !== "rental" || !phone?.trim()) return null;
  const customer = await queryOne<{ portal_user_id: number | null }>(
    "SELECT portal_user_id FROM rental_customers WHERE id=?",
    customerId,
  );
  if (!customer) throw new Error("العميل غير موجود");
  const linkedId = customer.portal_user_id;
  const otherCustomer = await queryOne("SELECT id FROM rental_customers WHERE id<>? AND phone=?", customerId, phone);
  if (otherCustomer) throw new Error("رقم الجوال مرتبط بعميل إيجار آخر");
  const collision = await queryOne<{ id: number }>(
    "SELECT id FROM users WHERE phone=? AND (? IS NULL OR id<>?)",
    phone, linkedId ?? null, linkedId ?? null,
  );
  if (collision) throw new Error("رقم الجوال مستخدم بالفعل في حساب آخر");

  if (linkedId) {
    const linked = await queryOne<{ id: number; role: string }>("SELECT id,role FROM users WHERE id=?", linkedId);
    if (linked && linked.role !== RENTAL_CUSTOMER_ROLE) throw new Error("حساب الدخول المرتبط لا يحمل صلاحية عميل إيجار");
    if (linked) {
      await execute("UPDATE users SET name=?,phone=? WHERE id=?", name, phone, linkedId);
      return { userId: linkedId, created: false };
    }
  }

  await executeBatch([
    {
      sql: `INSERT INTO users(name,phone,password,role,active,approval_status)
            VALUES(?,?,?,?,1,'approved')`,
      params: [name, phone, hashRentalPassword(phone), RENTAL_CUSTOMER_ROLE],
    },
    {
      sql: `UPDATE rental_customers
            SET portal_user_id=(SELECT id FROM users WHERE phone=? AND role=?)
            WHERE id=? AND customer_type='rental'`,
      params: [phone, RENTAL_CUSTOMER_ROLE, customerId],
    },
  ]);
  const linked = await queryOne<{ id: number }>(
    "SELECT id FROM users WHERE phone=? AND role=?",
    phone, RENTAL_CUSTOMER_ROLE,
  );
  if (!linked) throw new Error("تعذر ربط حساب العميل");
  return { userId: linked.id, created: true };
}

export async function backfillRentalPortalUsers(): Promise<{ created: number; missingPhone: number; conflicts: number }> {
  // Historical statements may exist without a customer-directory row. Add the
  // directory record without touching the statement, then link it once a phone is saved.
  await execute(`
    INSERT OR IGNORE INTO rental_customers(name,customer_type)
    SELECT name,'rental' FROM (
      SELECT TRIM(customer_name) name FROM rental_account_entries
      UNION SELECT TRIM(customer_name) FROM rental_payments
      UNION SELECT TRIM(customer_name) FROM rental_statement_adjustments
    ) WHERE name<>''
  `);
  const rows = await queryAll<{ id: number; name: string; phone: string | null; customer_type: string }>(`
    SELECT id,name,phone,customer_type FROM rental_customers
    WHERE customer_type='rental' AND active=1 AND portal_user_id IS NULL
  `);
  let created = 0, missingPhone = 0, conflicts = 0;
  for (const customer of rows) {
    if (!customer.phone?.trim()) { missingPhone++; continue; }
    try {
      const result = await ensureRentalPortalUser(customer.id, customer.name, customer.phone, customer.customer_type);
      if (result?.created) created++;
    } catch {
      // Never assign another user's phone/account to a historical customer.
      conflicts++;
    }
  }
  return { created, missingPhone, conflicts };
}