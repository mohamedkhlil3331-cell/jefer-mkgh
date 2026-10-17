/**
 * Central production database mode guard. This module intentionally has no
 * SQLite, Cloudflare connector, filesystem, or storage imports so D1-only
 * routes can select their backend without loading the SQLite runtime.
 */
export function isD1DatabaseMode(): boolean {
  const backend = process.env.ERP_DATABASE_BACKEND;
  if (backend && backend !== "filesystem" && backend !== "d1") {
    throw new Error(`[database-mode] Unsupported ERP_DATABASE_BACKEND: ${backend}`);
  }
  if (backend === "d1" && process.env.NODE_ENV !== "production") {
    throw new Error("[database-mode] ERP_DATABASE_BACKEND=d1 is only allowed in production; development must use SQLite");
  }
  return backend === "d1";
}
