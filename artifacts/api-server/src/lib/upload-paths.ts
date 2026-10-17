import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAppDataDir, isFilesystemDatabaseMode, isFilesystemStorageMode } from "./db-sync.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = getAppDataDir();

export const UPLOADS_PATH = isFilesystemStorageMode()
  ? path.join(dataDirectory, "uploads")
  : isFilesystemDatabaseMode()
    ? path.join(dataDirectory, "uploads")
    : path.join(currentDirectory, "..", "..", "uploads");
