import { Router, type Request, type Response } from "express";
import db from "../lib/db.js";

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  if (!token || token === "guest") {
    res.status(401).json({ error: "غير مصرح" });
    return false;
  }
  const session = db.prepare(
    "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')"
  ).get(token) as { user_id: number } | undefined;
  if (!session) {
    res.status(401).json({ error: "الجلسة منتهية" });
    return false;
  }
  const user = db.prepare(
    "SELECT role FROM users WHERE id = ? AND active = 1"
  ).get(session.user_id) as { role: string } | undefined;
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "صلاحيات المدير مطلوبة" });
    return false;
  }
  return true;
}

export default router;
