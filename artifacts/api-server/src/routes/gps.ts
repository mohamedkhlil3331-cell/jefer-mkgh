import { Router } from "express";

const router = Router();

interface WialonUnit {
  id: number;
  nm: string;
  uid?: string;
  pos?: { x: number; y: number; s: number; t: number } | null;
}

interface GpsLocation {
  gps_device_id: string;
  lat: number;
  lng: number;
  speed: number;
  updated_at: string;
}

interface TrackPoint {
  lat: number;
  lng: number;
  speed: number;
  t: number;
}

function looksLikeImei(value: string): boolean {
  return /^\d{14,}$/.test(value.trim());
}

async function wialonLogin(base: string): Promise<string | null> {
  const user = process.env.TAWASOLMAP_USER?.trim();
  const pass = process.env.TAWASOLMAP_PASS?.trim();
  const token = process.env.TAWASOLMAP_TOKEN?.trim();

  let params: Record<string, unknown>;
  if (user && pass) {
    params = { user, password: pass, fl: 1 };
  } else if (token) {
    params = { token, fl: 1 };
  } else {
    return null;
  }

  const loginRes = await fetch(`${base}?svc=core/login&params=${encodeURIComponent(JSON.stringify(params))}`);
  if (!loginRes.ok) return null;
  const loginData = await loginRes.json() as { eid?: string; error?: number };
  return loginData.eid ?? null;
}

async function wialonLogout(sid: string, base: string): Promise<void> {
  try {
    await fetch(`${base}?sid=${sid}&svc=core/logout&params=%7B%7D`);
  } catch { /* ignore */ }
}

async function wialonSearch(
  sid: string,
  base: string,
  propName: string,
  propValueMask: string,
  flags: number,
): Promise<WialonUnit[]> {
  const searchParams = {
    spec: { itemsType: "avl_unit", propName, propValueMask, sortType: "sys_name", propType: "property" },
    force: 1, flags, from: 0, to: 0,
  };
  try {
    const res = await fetch(`${base}?sid=${sid}&svc=core/search_items&params=${encodeURIComponent(JSON.stringify(searchParams))}`);
    if (!res.ok) return [];
    const data = await res.json() as { items?: WialonUnit[]; error?: number };
    if (data.error) return [];
    return data.items || [];
  } catch {
    return [];
  }
}

async function fetchWialonLocations(): Promise<GpsLocation[]> {
  const base = "https://gps.tawasolmap.com/wialon/ajax.html";

  const sid = await wialonLogin(base);
  if (!sid) return [];

  try {
    const byKey = new Map<string, GpsLocation>();

    const nameItems = await wialonSearch(sid, base, "sys_name", "*", 0x1 | 0x100);
    for (const u of nameItems) {
      if (!u.pos) continue;
      byKey.set(String(u.id), {
        gps_device_id: String(u.id),
        lat: u.pos.y, lng: u.pos.x, speed: u.pos.s,
        updated_at: new Date(u.pos.t * 1000).toISOString(),
      });
    }

    const uidItems = await wialonSearch(sid, base, "sys_unique_id", "*", 0x1 | 0x100);
    for (const u of uidItems) {
      if (!u.uid || !u.pos) continue;
      const imei = u.uid.trim();
      if (!imei || imei === String(u.id)) continue;
      const existingById = byKey.get(String(u.id));
      const loc = existingById ?? {
        gps_device_id: String(u.id),
        lat: u.pos.y, lng: u.pos.x, speed: u.pos.s,
        updated_at: new Date(u.pos.t * 1000).toISOString(),
      };
      byKey.set(imei, { ...loc, gps_device_id: imei });
    }

    return Array.from(byKey.values());
  } finally {
    await wialonLogout(sid, base);
  }
}

async function resolveToWialonId(sid: string, base: string, deviceId: string): Promise<number | null> {
  if (!looksLikeImei(deviceId)) {
    const n = parseInt(deviceId, 10);
    return isNaN(n) ? null : n;
  }
  const items = await wialonSearch(sid, base, "sys_unique_id", deviceId, 0x1);
  return items[0] ? items[0].id : null;
}

async function fetchWialonHistory(
  deviceId: string,
  fromTs?: number,
  toTs?: number,
): Promise<TrackPoint[]> {
  const base = "https://gps.tawasolmap.com/wialon/ajax.html";

  const sid = await wialonLogin(base);
  if (!sid) return [];

  try {
    const now = Math.floor(Date.now() / 1000);
    const from = fromTs ?? now - 24 * 60 * 60;
    const to = toTs ?? now;

    const unitId = await resolveToWialonId(sid, base, deviceId);
    if (!unitId) return [];

    const params = {
      itemId: unitId,
      timeFrom: from,
      timeTo: to,
      flags: 0x0001,
      flagsMask: 0xff00,
      loadCount: 2000,
    };

    const res = await fetch(
      `${base}?sid=${sid}&svc=messages/load_interval&params=${encodeURIComponent(JSON.stringify(params))}`
    );
    if (!res.ok) return [];

    const data = await res.json() as { messages?: Array<{ pos?: { x: number; y: number; s: number }; t?: number }>; error?: number };
    if (data.error || !data.messages) return [];

    return data.messages
      .filter(m => m.pos != null)
      .map(m => ({
        lat: m.pos!.y,
        lng: m.pos!.x,
        speed: m.pos!.s,
        t: m.t ?? 0,
      }));
  } finally {
    await wialonLogout(sid, base);
  }
}

router.get("/gps/vehicles", async (_req, res) => {
  const hasCredentials = (process.env.TAWASOLMAP_USER && process.env.TAWASOLMAP_PASS) || process.env.TAWASOLMAP_TOKEN;
  if (!hasCredentials) return void res.json([]);
  try {
    const locations = await fetchWialonLocations();
    res.json(locations);
  } catch {
    res.json([]);
  }
});

router.get("/gps/vehicles/:deviceId/history", async (req, res) => {
  const hasCredentials = (process.env.TAWASOLMAP_USER && process.env.TAWASOLMAP_PASS) || process.env.TAWASOLMAP_TOKEN;
  if (!hasCredentials) return void res.json([]);
  const { deviceId } = req.params;
  const fromRaw = req.query.from;
  const toRaw   = req.query.to;
  const fromTs  = fromRaw ? parseInt(String(fromRaw), 10) : undefined;
  const toTs    = toRaw   ? parseInt(String(toRaw),   10) : undefined;
  try {
    const track = await fetchWialonHistory(deviceId, fromTs, toTs);
    res.json(track);
  } catch {
    res.json([]);
  }
});

async function wialonSearchItem(sid: string, base: string, id: number): Promise<WialonUnit | null> {
  try {
    const params = { id, flags: 0x1 | 0x100 };
    const res = await fetch(`${base}?sid=${sid}&svc=core/search_item&params=${encodeURIComponent(JSON.stringify(params))}`);
    if (!res.ok) return null;
    const data = await res.json() as { item?: WialonUnit; error?: number };
    if (data.error || !data.item) return null;
    return data.item;
  } catch {
    return null;
  }
}

function buildLookupResult(unit: WialonUnit) {
  return {
    found: true,
    wialon_id: String(unit.id),
    name: unit.nm,
    imei: unit.uid || null,
    lat: unit.pos?.y ?? null,
    lng: unit.pos?.x ?? null,
    speed: unit.pos?.s ?? null,
    updated_at: unit.pos ? new Date(unit.pos.t * 1000).toISOString() : null,
  };
}

router.get("/gps/lookup", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return void res.json({ found: false });

  const hasCredentials = (process.env.TAWASOLMAP_USER && process.env.TAWASOLMAP_PASS) || process.env.TAWASOLMAP_TOKEN;
  if (!hasCredentials) return void res.json({ found: false, error: "no_credentials" });

  const base = "https://gps.tawasolmap.com/wialon/ajax.html";
  const sid = await wialonLogin(base);
  if (!sid) return void res.json({ found: false, error: "login_failed" });

  try {
    const numericId = /^\d+$/.test(q) ? parseInt(q, 10) : NaN;
    const isImeiLike = looksLikeImei(q);
    const isUnitId = !isNaN(numericId) && !isImeiLike;

    // 1) Exact Wialon Unit ID lookup (short numeric, not IMEI)
    if (isUnitId) {
      const unit = await wialonSearchItem(sid, base, numericId);
      if (unit) return void res.json(buildLookupResult(unit));
    }

    // 2) Exact IMEI lookup via sys_unique_id
    if (isImeiLike || !isUnitId) {
      const items = await wialonSearch(sid, base, "sys_unique_id", q, 0x1 | 0x100);
      if (items.length) {
        const unit = items.find(u => u.pos != null) ?? items[0];
        return void res.json(buildLookupResult(unit));
      }
    }

    // 3) Partial name fallback
    const nameItems = await wialonSearch(sid, base, "sys_name", `*${q}*`, 0x1 | 0x100);
    if (nameItems.length) {
      const unit = nameItems.find(u => u.pos != null) ?? nameItems[0];
      return void res.json(buildLookupResult(unit));
    }

    res.json({ found: false });
  } catch {
    res.json({ found: false, error: "fetch_error" });
  } finally {
    await wialonLogout(sid, base);
  }
});

export default router;
