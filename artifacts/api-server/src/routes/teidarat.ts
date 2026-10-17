import { Router } from "express";
import multer from "multer";
import { execute, executeBatch, queryAll, queryOne } from "../lib/erp-sql.js";
import { r2MulterStorage, uniqueUploadName } from "../lib/r2-storage.js";

const upload = multer({
  storage: r2MulterStorage(name => uniqueUploadName("td-", name)),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

const SELECT_WITH_JOIN = `
  SELECT t.*, fv.vehicle_type, fv.status AS vehicle_status, fv.driver_name
  FROM teidarat t
  LEFT JOIN fleet_vehicles fv ON t.vehicle_plate = fv.plate_number
`;

// ── GET /api/teidarat  ────────────────────────────────────────────────────────
router.get("/teidarat", async (_req, res) => {
  const rows = await queryAll(`${SELECT_WITH_JOIN} ORDER BY t.seq_no ASC`);
  res.json(rows);
});

// ── POST /api/teidarat  ───────────────────────────────────────────────────────
router.post("/teidarat", async (req, res) => {
  const { category, notes, teidara_number, teidara_type,
          length_m, width_m, height_m, capacity, weight_kg } = req.body as {
    category: string; notes?: string;
    teidara_number?: string; teidara_type?: string;
    length_m?: number; width_m?: number; height_m?: number;
    capacity?: number; weight_kg?: number;
  };
  if (!category) { res.status(400).json({ error: "category مطلوب" }); return; }

  const inserted = await queryOne<{ id: number }>(`
    INSERT INTO teidarat
      (category, seq_no, vehicle_plate, notes, teidara_number, teidara_type,
       length_m, width_m, height_m, capacity, weight_kg)
    SELECT ?, COALESCE(MAX(seq_no), 0) + 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?
    FROM teidarat
    RETURNING id
  `, category, notes || null, teidara_number || null, teidara_type || null,
  length_m ?? null, width_m ?? null, height_m ?? null, capacity ?? null, weight_kg ?? null);
  if (!inserted) throw new Error("Teidara insert did not return an id");
  const row = await queryOne(`${SELECT_WITH_JOIN} WHERE t.id = ?`, inserted.id);
  res.json(row);
});

// ── PUT /api/teidarat/:id  ────────────────────────────────────────────────────
router.put("/teidarat/:id", async (req, res) => {
  const { id } = req.params;
  const { notes, teidara_number, teidara_type,
          length_m, width_m, height_m, capacity, weight_kg } = req.body as {
    notes?: string;
    teidara_number?: string; teidara_type?: string;
    length_m?: number; width_m?: number; height_m?: number;
    capacity?: number; weight_kg?: number;
  };

  await execute(`
    UPDATE teidarat
    SET notes=?, teidara_number=?, teidara_type=?,
        length_m=?, width_m=?, height_m=?, capacity=?, weight_kg=?
    WHERE id=?
  `, notes ?? null, teidara_number ?? null, teidara_type ?? null,
  length_m ?? null, width_m ?? null, height_m ?? null, capacity ?? null, weight_kg ?? null, id);

  const row = await queryOne(`${SELECT_WITH_JOIN} WHERE t.id = ?`, id);
  res.json(row);
});

// ── POST /api/teidarat/:id/image  ────────────────────────────────────────────
router.post("/teidarat/:id/image", upload.single("image"), async (req, res) => {
  if (!req.file) return void res.status(400).json({ error: "لا يوجد ملف" });
  const url = `/api/uploads/${req.file.filename}`;
  await execute("UPDATE teidarat SET image_url=? WHERE id=?", url, req.params.id);
  res.json({ image_url: url });
});

// ── DELETE /api/teidarat/:id  ─────────────────────────────────────────────────
router.delete("/teidarat/:id", async (req, res) => {
  const { id } = req.params;
  const row = await queryOne<{ id: number; teidara_number: string | null; vehicle_plate: string | null }>(
    "SELECT id, teidara_number, vehicle_plate FROM teidarat WHERE id=?",
    id,
  );
  if (!row) { res.status(404).json({ error: "غير موجود" }); return; }

  const fleetRows = await queryAll<{
    linked_teidara_id?: number | null;
    linked_teidara_ids?: string | null;
    linked_trailer_number?: string | null;
  }>(`
    SELECT linked_teidara_id, linked_teidara_ids, linked_trailer_number
    FROM fleet_vehicles
  `);
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

  const remaining = await queryAll<{ id: number; seq_no: number }>(
    "SELECT id, seq_no FROM teidarat WHERE id<>? ORDER BY seq_no ASC, id ASC",
    id,
  );
  const minimumSequence = Math.min(0, ...remaining.map(item => item.seq_no));
  const maximumSequence = Math.max(0, ...remaining.map(item => item.seq_no));
  const offset = maximumSequence - minimumSequence + remaining.length + 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(maximumSequence + offset)) {
    throw new Error("Teidara sequence values exceed the safe integer range");
  }
  const statements = [
    { sql: "DELETE FROM teidarat WHERE id=?", params: [id] },
    ...(remaining.length ? [
      { sql: "UPDATE teidarat SET seq_no=seq_no+?", params: [offset] },
      {
        sql: `WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY seq_no ASC, id ASC) AS next_seq
          FROM teidarat
        )
        UPDATE teidarat
        SET seq_no=(SELECT next_seq FROM ranked WHERE ranked.id=teidarat.id)`,
        params: [],
      },
    ] : []),
  ];
  await executeBatch(statements);

  res.json({ ok: true });
});

export default router;
