import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const missingColumnMessage =
  "[d1-readiness] D1 sessions table is missing created_at or ip_address required by authentication";

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const { port } = address;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  return port;
}

async function assertPortClosed(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = createServer();
    socket.once("error", error => {
      if ("code" in error && error.code === "EADDRINUSE") {
        reject(new Error(`API port ${port} was opened despite failed D1 readiness`));
      } else {
        resolve();
      }
    });
    socket.listen(port, "127.0.0.1", () => {
      socket.close(error => error ? reject(error) : resolve());
    });
  });
}

async function assertStartupRejectedForMissingColumn(column: "created_at" | "ip_address"): Promise<void> {
  const port = await reservePort();
  const child = spawn(
    process.execPath,
    ["--import", "./src/lib/d1-readiness-worker-fixture.mjs", "./dist/index.mjs"],
    {
      cwd: apiDirectory,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        NODE_ENV: "production",
        PORT: String(port),
        ERP_DATABASE_BACKEND: "d1",
        ERP_OBJECT_STORAGE_BACKEND: "r2",
        ERP_D1_PRODUCTS_ENABLED: "1",
        ERP_D1_WAREHOUSES_ENABLED: "1",
        ERP_D1_REPLICATION_ENABLED: "1",
        ERP_D1_PRIMARY_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
        ERP_D1_REPLICA_DATABASE_ID: "22222222-2222-4222-8222-222222222222",
        D1_TEST_MISSING_SESSION_COLUMN: column,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let output = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { output += chunk; });

  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`D1 startup did not stop after detecting missing sessions column ${column}; output: ${output}`));
    }, 10_000);
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

  assert.equal(exit.code, 1, `D1 startup should exit with code 1; output: ${output}`);
  assert.match(output, new RegExp(missingColumnMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await assertPortClosed(port);
}

async function main(): Promise<void> {
  await assertStartupRejectedForMissingColumn("created_at");
  await assertStartupRejectedForMissingColumn("ip_address");
  console.log("D1 sessions readiness startup tests passed");
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
