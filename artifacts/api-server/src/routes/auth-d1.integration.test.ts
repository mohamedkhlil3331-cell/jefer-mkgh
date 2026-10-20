import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const databaseId = randomUUID();
const phone = `d1-test-${randomUUID()}`;
const password = "temporary-d1-test-password";
const forwardedIp = "192.0.2.41";

async function main(): Promise<void> {
  process.env.NODE_ENV = "production";
  process.env.ERP_DATABASE_BACKEND = "d1";
  process.env.ERP_D1_PRIMARY_DATABASE_ID = databaseId;
  process.env.ERP_D1_REPLICATION_ENABLED = "0";

  const miniflare = new Miniflare(convertV4MiniflareOptions({
    name: "auth-d1-test",
    compatibilityDate: "2026-10-17",
    d1Databases: { ERP_DB: databaseId },
    modules: true,
    script: "export default { fetch() { return new Response('D1 auth integration test'); } };",
  }));
  let database: Awaited<ReturnType<Miniflare["getD1Database"]>> | undefined;
  let server: Server | undefined;
  let userId: number | undefined;

  try {
    database = await miniflare.getD1Database("ERP_DB");
    const testDatabase = database;
    (globalThis as typeof globalThis & {
      __ERP_WORKER_ENV?: Record<string, unknown>;
    }).__ERP_WORKER_ENV = { ERP_DB: testDatabase };

    await testDatabase.prepare(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer',
        email TEXT,
        company_name TEXT,
        vat_number TEXT,
        cr_number TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        approval_status TEXT NOT NULL DEFAULT 'approved',
        vehicle_plate TEXT,
        permissions TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    await testDatabase.prepare(`
      CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        ip_address TEXT,
        created_at TEXT NOT NULL
      )
    `).run();
    await testDatabase.prepare(`
      CREATE TABLE fleet_vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plate_number TEXT NOT NULL UNIQUE,
        vehicle_password TEXT,
        driver_name TEXT
      )
    `).run();
    await testDatabase.prepare(`
      CREATE TABLE special_sessions (
        kind TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
    const inserted = await testDatabase.prepare(
      "INSERT INTO users (name, phone, password, role, active, approval_status) VALUES (?, ?, ?, 'customer', 1, 'approved')",
    ).bind("D1 auth test user", phone, password).run();
    userId = Number(inserted.meta.last_row_id);

    const { default: authRouter } = await import("./auth.js");
    const app = express();
    app.use(express.json());
    app.use("/api", authRouter);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server!.once("listening", resolve);
      server!.once("error", reject);
    });
    const address = server.address();
    assert(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}/api`;

    const wrongPassword = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password: "incorrect-password" }),
    });
    assert.equal(wrongPassword.status, 401, "wrong password must be rejected");
    const wrongSessionRows = await testDatabase.prepare(
      "SELECT token FROM sessions WHERE user_id = ?",
    ).bind(userId).all();
    assert.equal(wrongSessionRows.results.length, 0, "failed login must not create a session");

    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": forwardedIp,
      },
      body: JSON.stringify({ phone, password }),
    });
    assert.equal(login.status, 200, "correct password must log in");
    const loginBody = await login.json() as {
      token: string;
      user: Record<string, unknown>;
    };
    assert.equal(typeof loginBody.token, "string");
    assert.ok(loginBody.token.length > 0);
    assert.equal("password" in loginBody.user, false, "login response must not expose the password");

    const sessionResult = await testDatabase.prepare(
      "SELECT created_at, ip_address FROM sessions WHERE token = ? AND user_id = ?",
    ).bind(loginBody.token, userId).all<{ created_at: string | null; ip_address: string | null }>();
    assert.equal(sessionResult.results.length, 1, "login must persist its session in D1");
    assert.ok(sessionResult.results[0].created_at, "session created_at must be populated");
    assert.equal(sessionResult.results[0].ip_address, forwardedIp);

    const me = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    assert.equal(me.status, 200, "the issued token must authorize /auth/me");
    const meBody = await me.json() as Record<string, unknown>;
    assert.equal(meBody.id, userId);
    assert.equal(meBody.phone, phone);
    assert.equal("password" in meBody, false, "/auth/me must not expose the password");

    console.log("D1 auth login-to-me integration test passed");
  } finally {
    try {
      if (server?.listening) {
        await new Promise<void>((resolve, reject) => {
          server!.close(error => error ? reject(error) : resolve());
        });
      }
    } finally {
      try {
        if (database && userId !== undefined) {
          await database.prepare(
            "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE phone = ?)",
          ).bind(phone).run();
          await database.prepare("DELETE FROM users WHERE phone = ?").bind(phone).run();
        }
      } finally {
        await miniflare.dispose();
        delete (globalThis as typeof globalThis & { __ERP_WORKER_ENV?: unknown }).__ERP_WORKER_ENV;
      }
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
