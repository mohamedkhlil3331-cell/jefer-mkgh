import { Router } from "express";
import multer from "multer";
import db, { UPLOADS_PATH } from "../lib/db.js";

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
    filename:    (_req, file,  cb) => cb(null, `td-${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

// ── Create table if not exists ────────────────────────────────────────────────
db.prepare(`
  CREATE TABLE IF NOT EXISTS teidarat (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category        TEXT    NOT NULL,
    seq_no          INTEGER NOT NULL,
    vehicle_plate   TEXT,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(category, seq_no)
  )
`).run();

// ── Add new columns if they don't exist (safe migration) ─────────────────────
const addCol = (col: string) => { try { db.prepare(`ALTER TABLE teidarat ADD COLUMN ${col}`).run(); } catch {} };
addCol("teidara_number TEXT");
addCol("teidara_type   TEXT");
addCol("length_m       REAL");
addCol("width_m        REAL");
addCol("height_m       REAL");
addCol("capacity       REAL");
addCol("weight_kg      REAL");
addCol("image_url      TEXT");

// ── Migrate UNIQUE(category, seq_no) → global UNIQUE(seq_no) ─────────────────
{
  const schema = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='teidarat'").get() as { sql: string } | undefined)?.sql ?? "";
  if (schema.includes("UNIQUE(category, seq_no)")) {
    // Read all rows ordered by category then seq_no to preserve relative order
    const rows = db.prepare(
      "SELECT * FROM teidarat ORDER BY category, seq_no ASC, id ASC"
    ).all() as Record<string, unknown>[];

    // Build new table with global UNIQUE(seq_no)
    db.prepare("DROP TABLE IF EXISTS teidarat_v2").run();
    db.prepare(`
      CREATE TABLE teidarat_v2 (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        category        TEXT    NOT NULL,
        seq_no          INTEGER NOT NULL UNIQUE,
        vehicle_plate   TEXT,
        notes           TEXT,
        created_at      TEXT DEFAULT (datetime('now')),
        teidara_number  TEXT,
        teidara_type    TEXT,
        length_m        REAL,
        width_m         REAL,
        height_m        REAL,
        capacity        REAL,
        weight_kg       REAL,
        image_url       TEXT
      )
    `).run();

    const ins = db.prepare(`
      INSERT INTO teidarat_v2
        (id, category, seq_no, vehicle_plate, notes, created_at,
         teidara_number, teidara_type, length_m, width_m, height_m, capacity, weight_kg, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAll = db.transaction(() => {
      rows.forEach((r, i) => {
        ins.run(
          r.id, r.category, i + 1,
          r.vehicle_plate ?? null, r.notes ?? null, r.created_at ?? null,
          r.teidara_number ?? null, r.teidara_type ?? null,
          r.length_m ?? null, r.width_m ?? null, r.height_m ?? null,
          r.capacity ?? null, r.weight_kg ?? null, r.image_url ?? null
        );
      });
    });
    insertAll();

    db.prepare("DROP TABLE teidarat").run();
    db.prepare("ALTER TABLE teidarat_v2 RENAME TO teidarat").run();
  }
}

const SELECT_WITH_JOIN = `
  SELECT t.*, fv.vehicle_type, fv.status AS vehicle_status, fv.driver_name
  FROM teidarat t
  LEFT JOIN fleet_vehicles fv ON t.vehicle_plate = fv.plate_number
`;

// ── GET /api/teidarat  ────────────────────────────────────────────────────────
router.get("/teidarat", (_req, res) => {
  const rows = db.prepare(`${SELECT_WITH_JOIN} ORDER BY t.seq_no ASC`).all();
  res.json(rows);
});

// ── POST /api/teidarat  ───────────────────────────────────────────────────────
router.post("/teidarat", (req, res) => {
  const { category, notes, teidara_number, teidara_type,
          length_m, width_m, height_m, capacity, weight_kg } = req.body as {
    category: string; notes?: string;
    teidara_number?: string; teidara_type?: string;
    length_m?: number; width_m?: number; height_m?: number;
    capacity?: number; weight_kg?: number;
  };
  if (!category) { res.status(400).json({ error: "category مطلوب" }); return; }

  // Global max seq_no across all categories
  const maxRow = db.prepare(
    "SELECT COALESCE(MAX(seq_no),0) as mx FROM teidarat"
  ).get() as { mx: number };
  const seq_no = maxRow.mx + 1;

  const result = db.prepare(`
    INSERT INTO teidarat
      (category, seq_no, vehicle_plate, notes, teidara_number, teidara_type,
       length_m, width_m, height_m, capacity, weight_kg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(category, seq_no, null, notes || null,
         teidara_number || null, teidara_type || null,
         length_m ?? null, width_m ?? null, height_m ?? null,
         capacity ?? null, weight_kg ?? null);

  const row = db.prepare(`${SELECT_WITH_JOIN} WHERE t.id = ?`).get(result.lastInsertRowid);
  res.json(row);
});

// ── PUT /api/teidarat/:id  ────────────────────────────────────────────────────
router.put("/teidarat/:id", (req, res) => {
  const { id } = req.params;
  const { notes, teidara_number, teidara_type,
          length_m, width_m, height_m, capacity, weight_kg } = req.body as {
    notes?: string;
    teidara_number?: string; teidara_type?: string;
    length_m?: number; width_m?: number; height_m?: number;
    capacity?: number; weight_kg?: number;
  };

  db.prepare(`
    UPDATE teidarat
    SET notes=?, teidara_number=?, teidara_type=?,
        length_m=?, width_m=?, height_m=?, capacity=?, weight_kg=?
    WHERE id=?
  `).run(notes ?? null, teidara_number ?? null, teidara_type ?? null,
         length_m ?? null, width_m ?? null, height_m ?? null,
         capacity ?? null, weight_kg ?? null, id);

  const row = db.prepare(`${SELECT_WITH_JOIN} WHERE t.id = ?`).get(id);
  res.json(row);
});

// ── POST /api/teidarat/:id/image  ────────────────────────────────────────────
router.post("/teidarat/:id/image", upload.single("image"), (req, res) => {
  if (!req.file) return void res.status(400).json({ error: "لا يوجد ملف" });
  const url = `/api/uploads/${req.file.filename}`;
  db.prepare("UPDATE teidarat SET image_url=? WHERE id=?").run(url, req.params.id);
  res.json({ image_url: url });
});

// ── DELETE /api/teidarat/:id  ─────────────────────────────────────────────────
router.delete("/teidarat/:id", (req, res) => {
  const { id } = req.params;
  const row = db.prepare("SELECT id, teidara_number, vehicle_plate FROM teidarat WHERE id=?").get(id) as
    { id: number; teidara_number: string | null; vehicle_plate: string | null } | undefined;
  if (!row) { res.status(404).json({ error: "غير موجود" }); return; }

  const fleetRows = db.prepare(`
    SELECT linked_teidara_id, linked_teidara_ids, linked_trailer_number
    FROM fleet_vehicles
  `).all() as { linked_teidara_id?: number | null; linked_teidara_ids?: string | null; linked_trailer_number?: string | null }[];
  const isLinked = !!row.vehicle_plate || fleetRows.some(vehicle => {
    let ids: number[] = [];
    try { ids = JSON.parse(vehicle.linked_teidara_ids || "[]").map(Number); } catch {}
    return Number(vehicle.linked_teidara_id) === row.id ||
      ids.includes(row.id) ||
      (!!row.teidara_number && vehicle.linked_trailer_number === row.teidara_number);
  });
  if (isLinked) {
    return void res.status(409).json({
      error: "التيدار مرتبط بسيارة. فك الربط أولاً من صفحة سيارات الشركة كاملة",
    });
  }

  db.prepare("DELETE FROM teidarat WHERE id=?").run(id);

  // Re-sequence ALL remaining entries globally
  const remaining = db.prepare(
    "SELECT id FROM teidarat ORDER BY seq_no ASC"
  ).all() as { id: number }[];
  const update = db.prepare("UPDATE teidarat SET seq_no=? WHERE id=?");
  const reseq = db.transaction(() => {
    remaining.forEach((r, i) => update.run(i + 1, r.id));
  });
  reseq();

  res.json({ ok: true });
});

export default router;
