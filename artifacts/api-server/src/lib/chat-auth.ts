import type { Request } from "express";
import db from "./db.js";
import { isSysAdminToken } from "../routes/auth.js";

export interface ChatActor {
  id: number;
  name: string;
  phone: string;
  role: string;
  permissions: string[] | null;
  isSystemAdmin: boolean;
}

function parsePermissions(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(value => typeof value === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function resolveChatActor(token: string | null | undefined): ChatActor | null {
  if (!token || token === "guest") return null;
  if (isSysAdminToken(token)) {
    return {
      id: 0,
      name: "مدير النظام",
      phone: "mkgh",
      role: "admin",
      permissions: null,
      isSystemAdmin: true,
    };
  }

  const user = db.prepare(`
    SELECT u.id, u.name, u.phone, u.role, u.permissions
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token=?
      AND datetime(s.expires_at)>datetime('now')
      AND u.active=1
      AND COALESCE(u.approval_status,'approved')='approved'
      AND s.rowid=(
        SELECT MAX(current.rowid)
        FROM sessions current
        WHERE current.user_id=s.user_id
      )
  `).get(token) as {
    id: number;
    name: string;
    phone: string;
    role: string;
    permissions: string | null;
  } | undefined;

  if (!user) return null;
  return {
    ...user,
    permissions: parsePermissions(user.permissions),
    isSystemAdmin: false,
  };
}

export function actorFromRequest(req: Request): ChatActor | null {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "");
  return resolveChatActor(bearer?.[1]?.trim());
}

export function isInternalChatUser(actor: ChatActor): boolean {
  return actor.id > 0 && !["customer", "rental_trip_customer"].includes(actor.role);
}

export function canManageUsers(actor: ChatActor): boolean {
  if (actor.isSystemAdmin || actor.role === "admin") return true;
  return actor.permissions === null ||
    actor.permissions.length === 0 ||
    actor.permissions.includes("users_manage");
}