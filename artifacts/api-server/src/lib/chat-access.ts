import db from "./db.js";

export const CHAT_CUSTOMER_ROLES = ["customer", "rental_trip_customer"] as const;
export const CHAT_CUSTOMER_CATEGORIES = [
  { key: "company", label: "تابع للشركة" },
  { key: "rental", label: "إيجار خارجي" },
] as const;

export type ChatCustomerCategory = typeof CHAT_CUSTOMER_CATEGORIES[number]["key"];
export type ChatAccessEffect = "include" | "exclude";

export interface ChatAccessRule {
  contact_user_id: number;
  effect: ChatAccessEffect;
}

export interface ChatCustomerAccount {
  id: number;
  name: string;
  phone: string;
  role: string;
}

interface ChatAccountRow extends ChatCustomerAccount {
  active: number;
  approval_status: string | null;
}

const isCustomerRole = (role: string): boolean =>
  (CHAT_CUSTOMER_ROLES as readonly string[]).includes(role);

export const isCustomerChatRole = isCustomerRole;

export function isChatContactRole(role: string): boolean {
  return role === "rep" || role === "supervisor";
}

export function listChatStaffContacts(): ChatCustomerAccount[] {
  return db.prepare(`
    SELECT id, name, phone, role
    FROM users
    WHERE active=1 AND COALESCE(approval_status,'approved')='approved'
      AND role IN ('rep','supervisor')
    ORDER BY name COLLATE NOCASE
  `).all() as ChatCustomerAccount[];
}

export function listChatCustomerAccounts(): ChatCustomerAccount[] {
  return db.prepare(`
    SELECT id, name, phone, role
    FROM users
    WHERE active=1 AND COALESCE(approval_status,'approved')='approved'
      AND role IN ('customer','rental_trip_customer')
    ORDER BY name COLLATE NOCASE
  `).all() as ChatCustomerAccount[];
}

export function getChatCustomerCategory(
  customer: Pick<ChatCustomerAccount, "id" | "phone" | "role">,
): ChatCustomerCategory | null {
  const row = db.prepare(`
    SELECT customer_type
    FROM rental_customers
    WHERE active=1 AND (
      portal_user_id=? OR (phone IS NOT NULL AND TRIM(phone)=TRIM(?))
    )
    ORDER BY CASE WHEN portal_user_id=? THEN 0 ELSE 1 END, id DESC
    LIMIT 1
  `).get(customer.id, customer.phone, customer.id) as { customer_type: string } | undefined;
  if (row?.customer_type === "company" || row?.customer_type === "rental") {
    return row.customer_type;
  }
  return customer.role === "rental_trip_customer" ? "rental" : null;
}

export function getDefaultCustomerChatContactIds(customerPhone: string): number[] {
  const order = db.prepare(`
    SELECT rep_id, supervisor_id
    FROM workflow_orders
    WHERE customer_phone=? AND COALESCE(stage,'')<>'cancelled'
    ORDER BY COALESCE(created_at,'') DESC, id DESC
    LIMIT 1
  `).get(customerPhone) as { rep_id: number | null; supervisor_id: number | null } | undefined;
  if (!order) return [];
  return getActiveChatContactIds([order.rep_id, order.supervisor_id]);
}

function getActiveChatContactIds(ids: Array<number | null | undefined>): number[] {
  const uniqueIds = [...new Set(ids.filter((id): id is number => Number.isInteger(id) && Number(id) > 0))];
  if (uniqueIds.length === 0) return [];
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT id FROM users
    WHERE id IN (${placeholders})
      AND role IN ('rep','supervisor')
      AND active=1 AND COALESCE(approval_status,'approved')='approved'
  `).all(...uniqueIds) as Array<{ id: number }>;
  return rows.map(row => row.id);
}

function getRulesForCustomer(customerUserId: number): ChatAccessRule[] {
  return db.prepare(`
    SELECT contact_user_id, effect
    FROM chat_customer_direct_rules
    WHERE customer_user_id=?
    ORDER BY contact_user_id
  `).all(customerUserId) as ChatAccessRule[];
}

function getRulesForCategory(category: ChatCustomerCategory): ChatAccessRule[] {
  return db.prepare(`
    SELECT contact_user_id, effect
    FROM chat_customer_category_rules
    WHERE category=?
    ORDER BY contact_user_id
  `).all(category) as ChatAccessRule[];
}

export interface CustomerChatPolicy {
  category: ChatCustomerCategory | null;
  default_contact_ids: number[];
  category_rules: ChatAccessRule[];
  customer_rules: ChatAccessRule[];
  allowed_contact_ids: number[];
}

export function getCustomerChatPolicy(customerUserId: number): CustomerChatPolicy | null {
  const customer = db.prepare(`
    SELECT id, name, phone, role, active, approval_status
    FROM users
    WHERE id=? AND role IN ('customer','rental_trip_customer')
      AND active=1 AND COALESCE(approval_status,'approved')='approved'
  `).get(customerUserId) as ChatAccountRow | undefined;
  if (!customer) return null;

  const category = getChatCustomerCategory(customer);
  const defaultContactIds = getDefaultCustomerChatContactIds(customer.phone);
  const categoryRules = category ? getRulesForCategory(category) : [];
  const customerRules = getRulesForCustomer(customer.id);
  const allowed = new Set(defaultContactIds);

  for (const rule of categoryRules) {
    if (rule.effect === "include") allowed.add(rule.contact_user_id);
    else allowed.delete(rule.contact_user_id);
  }
  for (const rule of customerRules) {
    if (rule.effect === "include") allowed.add(rule.contact_user_id);
    else allowed.delete(rule.contact_user_id);
  }

  return {
    category,
    default_contact_ids: defaultContactIds,
    category_rules: categoryRules,
    customer_rules: customerRules,
    allowed_contact_ids: getActiveChatContactIds([...allowed]),
  };
}

export function areChatUsersAllowed(userId: number, otherUserId: number): boolean {
  if (!Number.isInteger(userId) || !Number.isInteger(otherUserId) ||
      userId <= 0 || otherUserId <= 0 || userId === otherUserId) return false;
  const users = db.prepare(`
    SELECT id, phone, role, active, approval_status
    FROM users
    WHERE id IN (?,?)
  `).all(userId, otherUserId) as Array<{
    id: number;
    phone: string;
    role: string;
    active: number;
    approval_status: string | null;
  }>;
  if (users.length !== 2) return false;

  const first = users.find(user => user.id === userId)!;
  const second = users.find(user => user.id === otherUserId)!;
  const firstIsCustomer = isCustomerRole(first.role);
  const secondIsCustomer = isCustomerRole(second.role);

  if (firstIsCustomer && secondIsCustomer) return false;
  if (firstIsCustomer || secondIsCustomer) {
    if (users.some(user =>
      user.active !== 1 || (user.approval_status != null && user.approval_status !== "approved")
    )) return false;
    const customer = firstIsCustomer ? first : second;
    const staff = firstIsCustomer ? second : first;
    if (!isChatContactRole(staff.role)) return false;
    const policy = getCustomerChatPolicy(customer.id);
    return Boolean(policy?.allowed_contact_ids.includes(staff.id));
  }

  return true;
}

export function isChatConversationAllowed(conversationId: number, userId: number): boolean {
  const conversation = db.prepare(`
    SELECT user_low_id, user_high_id
    FROM chat_conversations
    WHERE id=? AND (user_low_id=? OR user_high_id=?)
  `).get(conversationId, userId, userId) as {
    user_low_id: number;
    user_high_id: number;
  } | undefined;
  return Boolean(conversation && areChatUsersAllowed(
    conversation.user_low_id,
    conversation.user_high_id,
  ));
}

export function getChatCategoryRules(category: ChatCustomerCategory): ChatAccessRule[] {
  return getRulesForCategory(category);
}

export function getChatCustomerRules(customerUserId: number): ChatAccessRule[] {
  return getRulesForCustomer(customerUserId);
}