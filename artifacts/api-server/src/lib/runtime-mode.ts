import path from "node:path";
import { homedir } from "node:os";
import { isD1DatabaseMode } from "./database-mode.js";

export function isWorkerRuntime(): boolean {
  return Boolean((globalThis as typeof globalThis & { __ERP_WORKER_ENV?: unknown }).__ERP_WORKER_ENV);
}

export function isFilesystemStorageMode(): boolean {
  const backend = process.env.ERP_STORAGE_BACKEND;
  if (backend && backend !== "filesystem" && backend !== "r2") {
    throw new Error(`[runtime-mode] Unsupported ERP_STORAGE_BACKEND: ${backend}`);
  }
  return backend === "filesystem";
}

export function isFilesystemDatabaseMode(): boolean {
  return !isD1DatabaseMode()
    && (process.env.ERP_DATABASE_BACKEND === "filesystem" || isFilesystemStorageMode());
}

export function getAppDataDir(): string {
  const cwd = process.cwd();
  const apiServerRoot = path.basename(cwd) === "api-server"
    ? cwd
    : path.join(cwd, "artifacts", "api-server");
  if (isD1DatabaseMode()) {
    throw new Error("[runtime-mode] The SQLite data directory is unavailable while D1 is selected");
  }
  if (!isFilesystemDatabaseMode()) return path.join(apiServerRoot, "data");

  const configuredDir = process.env.ERP_DATA_DIR?.trim();
  if (!configuredDir) {
    throw new Error("[runtime-mode] ERP_DATA_DIR is required when the SQLite database uses filesystem persistence");
  }
  const expandedDir = configuredDir === "~"
    ? homedir()
    : configuredDir.startsWith("~/")
      ? path.join(homedir(), configuredDir.slice(2))
      : configuredDir;
  const dataDir = path.resolve(expandedDir);
  if (dataDir.split(path.sep).some(part => part === "hbuilds" || part === "public_html")) {
    throw new Error("[runtime-mode] ERP_DATA_DIR must be outside Hostinger's managed hbuilds and public_html directories");
  }
  return dataDir;
}
