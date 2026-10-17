import { Router, type Request, type Response } from "express";
import { queryOne } from "../lib/erp-sql.js";

const router = Router();

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  if (!token || token === "guest") {
    res.status(401).json({ error: "غير مصرح" });
    return false;
  }
  const session = await queryOne<{ user_id: number }>(
    "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')"
  , token);
  if (!session) {
    res.status(401).json({ error: "الجلسة منتهية" });
    return false;
  }
  const user = await queryOne<{ role: string }>(
    "SELECT role FROM users WHERE id = ? AND active = 1"
  , session.user_id);
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "صلاحيات المدير مطلوبة" });
    return false;
  }
  return true;
}

export default router;
