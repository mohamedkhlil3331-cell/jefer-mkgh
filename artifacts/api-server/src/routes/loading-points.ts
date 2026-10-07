import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// Haversine distance (km) between two lat/lng points
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── List loading points ───────────────────────────────────────────
router.get("/loading-points", (_req, res) => {
  res.json(db.prepare("SELECT * FROM loading_points WHERE active=1 ORDER BY name").all());
});

// ── Find nearest loading point to destination ─────────────────────
router.get("/loading-points/nearest", (req, res) => {
  const { lat, lng } = req.query as Record<string, string>;
  if (!lat || !lng) return void res.status(400).json({ error: "الإحداثيات مطلوبة" });
  const dLat = parseFloat(lat);
  const dLng = parseFloat(lng);
  const points = db.prepare("SELECT * FROM loading_points WHERE active=1 AND lat IS NOT NULL").all() as {id:number;name:string;city:string;lat:number;lng:number;address:string}[];
  if (points.length === 0) return void res.json({ nearest: null, distance_km: null });
  const withDist = points.map(p => ({ ...p, distance_km: parseFloat(haversine(p.lat, p.lng, dLat, dLng).toFixed(1)) }));
  withDist.sort((a, b) => a.distance_km - b.distance_km);
  res.json({ nearest: withDist[0], all: withDist });
});

// ── Create loading point ──────────────────────────────────────────
router.post("/loading-points", (req, res) => {
  const { name, city, address, lat, lng, notes } = req.body;
  if (!name) return void res.status(400).json({ error: "الاسم مطلوب" });
  const r = db.prepare(`
    INSERT INTO loading_points (name,city,address,lat,lng,notes)
    VALUES (?,?,?,?,?,?)
  `).run(name, city||null, address||null, lat||null, lng||null, notes||null);
  res.status(201).json({ id: r.lastInsertRowid, message: "تمت الإضافة" });
});

// ── Update loading point ──────────────────────────────────────────
router.put("/loading-points/:id", (req, res) => {
  const { name, city, address, lat, lng, notes, active } = req.body;
  db.prepare(`
    UPDATE loading_points SET name=?,city=?,address=?,lat=?,lng=?,notes=?,active=? WHERE id=?
  `).run(name, city||null, address||null, lat||null, lng||null, notes||null, active??1, req.params.id);
  res.json({ message: "تم التحديث" });
});

// ── Delete loading point ──────────────────────────────────────────
router.delete("/loading-points/:id", (req, res) => {
  db.prepare("UPDATE loading_points SET active=0 WHERE id=?").run(req.params.id);
  res.json({ message: "تم التعطيل" });
});

export default router;
