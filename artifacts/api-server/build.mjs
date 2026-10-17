import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

const D1_DUAL_BACKEND_MODULES = new Set([
  "index.ts",
  "lib/erp-sql.ts",
  "routes/products.ts",
  "routes/warehouses.ts",
]);

async function collectD1SqliteBlockers(directory) {
  const blockers = [];
  const pending = [
    "index.ts",
    "app.ts",
    "lib/d1-readiness.ts",
    "lib/cloudflare-d1.ts",
    "routes/index.ts",
    "routes/system-backup-d1.ts",
  ]
    .map(file => path.resolve(directory, file));
  const visited = new Set();
  const importPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g;

  while (pending.length) {
    const filePath = pending.pop();
    if (!filePath || visited.has(filePath)) continue;
    visited.add(filePath);
    let source;
    try {
      source = await readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const relativePath = path.relative(directory, filePath).split(path.sep).join("/");
    const importsSqlite = /import\s+db(?:\s*,\s*\{[^}]*\})?\s+from\s+["'][^"']*\/(?:lib\/)?db\.js["']/.test(source)
      || /import\s*\{\s*[^}]*\bdb\b[^}]*\}\s*from\s+["'][^"']*\/(?:lib\/)?db\.js["']/.test(source);
    const callsSqlite = /\bdb\s*\.\s*(?:prepare|exec|transaction|pragma)\s*\(/.test(source);
    if ((importsSqlite || callsSqlite) && !D1_DUAL_BACKEND_MODULES.has(relativePath)) {
      blockers.push({
        file: relativePath,
        importsSqlite,
        callsSqlite,
      });
    }

    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      let dependency = path.resolve(path.dirname(filePath), specifier);
      if (dependency.endsWith(".js")) dependency = dependency.slice(0, -3) + ".ts";
      else if (!path.extname(dependency)) dependency += ".ts";
      if (dependency.startsWith(`${directory}${path.sep}`)) pending.push(dependency);
    }
  }
  return blockers.sort((a, b) => a.file.localeCompare(b.file));
}

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });
  const sourceDir = path.resolve(artifactDir, "src");
  const routesIndex = await readFile(path.join(sourceDir, "routes/index.ts"), "utf8");
  if (
    /import\s+\w+\s+from\s+["']\.\/system-backup\.js["']/.test(routesIndex)
    || !/isD1DatabaseMode\(\)\s*\?\s*\(await\s+import\(["']\.\/system-backup-d1\.js["']\)\)\.default\s*:\s*\(await\s+import\(["']\.\/system-backup\.js["']\)\)\.default/s.test(routesIndex)
  ) {
    throw new Error("D1 startup requires system-backup routes to be selected dynamically by database mode");
  }
  const sqliteBlockers = await collectD1SqliteBlockers(sourceDir);

  await esbuild({
    entryPoints: [
      path.resolve(artifactDir, "src/index.ts"),
      path.resolve(artifactDir, "src/pre-start.ts"),
    ],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  await writeFile(
    path.join(distDir, "d1-readiness.json"),
    `${JSON.stringify({ version: 1, sqliteBlockers }, null, 2)}\n`,
  );
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
