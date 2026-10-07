/**
 * Automated conversion: better-sqlite3 sync API → pg async API
 * Transforms all route files in-place.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.join(__dirname, "..", "src", "routes");
const libDir = path.join(__dirname, "..", "src", "lib");

// Files to convert
const files = [
  ...fs.readdirSync(routesDir).filter(f => f.endsWith(".ts")).map(f => path.join(routesDir, f)),
  path.join(libDir, "vehicle-stop-monitor.ts"),
];

let totalChanged = 0;

for (const filePath of files) {
  let src = fs.readFileSync(filePath, "utf8");
  const original = src;
  const name = path.basename(filePath);

  // 1. Replace db import from lib/db.js → lib/pool.js
  src = src.replace(
    /import db(?:,\s*\{([^}]*)\})? from ["']\.\.\/lib\/db\.js["'];?/g,
    (_, named) => {
      const extras = named ? named.split(",").map(s => s.trim()).filter(Boolean) : [];
      const keepFromDb = extras.filter(e => ["generateOrderNumber", "generateToken", "UPLOADS_PATH"].includes(e));
      const lines = [];
      if (keepFromDb.length) {
        lines.push(`import { ${keepFromDb.join(", ")} } from "../lib/db.js";`);
      }
      lines.push(`import { pool } from "../lib/pool.js";`);
      return lines.join("\n");
    }
  );
  // vehicle-stop-monitor uses ../db not ../lib/db
  src = src.replace(
    /import db from ["']\.\/db\.js["'];?/g,
    `import { pool } from "./pool.js";`
  );

  // 2. Convert route handlers: (req, res) => { → async (req, res) => {
  //    Only if body contains db.prepare
  src = src.replace(
    /(\(req(?:uest)?,\s*res(?:ponse)?\)\s*=>\s*\{)/g,
    (match, handler, offset) => {
      // Check if "async" already precedes
      const before = src.substring(Math.max(0, offset - 10), offset);
      if (/async\s*$/.test(before)) return match;
      return `async ${match}`;
    }
  );
  // Also handle (req, res, next) =>
  src = src.replace(
    /(\(req(?:uest)?,\s*res(?:ponse)?,\s*next\)\s*=>\s*\{)/g,
    (match, handler, offset) => {
      const before = src.substring(Math.max(0, offset - 10), offset);
      if (/async\s*$/.test(before)) return match;
      return `async ${match}`;
    }
  );

  // 3. Convert db.prepare("...").get(params) → await pool.query("...", [params]) and extract .rows[0]
  // Pattern: db.prepare(`...`).get(a, b, c) → (await pool.query(`...`, [a,b,c])).rows[0]
  // And: db.prepare(`...`).all(a, b) → (await pool.query(`...`, [a,b])).rows
  // And: db.prepare(`...`).run(a, b) → await pool.query(`...`, [a,b])

  // We'll do a multi-pass replacement using a function approach

  function convertDbPrepare(code) {
    // Match db.prepare(SQL_LITERAL).method(args)
    // SQL can be template literal or string
    const re = /db\.prepare\((`[^`]*`|'[^']*'|"[^"]*")\)\.(get|all|run)\(([^)]*)\)/g;
    return code.replace(re, (match, sql, method, args) => {
      // Convert ? to $1, $2 ... in SQL
      let pgSql = sql;
      let paramIdx = 0;

      // Handle template literals
      if (pgSql.startsWith("`")) {
        pgSql = pgSql.slice(1, -1); // strip backticks
        // Replace ? with $N
        pgSql = pgSql.replace(/\?/g, () => `$${++paramIdx}`);
        // Replace SQLite specifics
        pgSql = pgSql
          .replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO")
          .replace(/INSERT OR REPLACE INTO/gi, "INSERT INTO")
          .replace(/datetime\s*\(\s*'now'\s*\)/gi, "NOW()::TEXT")
          .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY");
        pgSql = "`" + pgSql + "`";
      } else {
        const q = pgSql[0];
        pgSql = pgSql.slice(1, -1); // strip quotes
        pgSql = pgSql.replace(/\?/g, () => `$${++paramIdx}`);
        pgSql = pgSql
          .replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO")
          .replace(/INSERT OR REPLACE INTO/gi, "INSERT INTO")
          .replace(/datetime\s*\(\s*'now'\s*\)/gi, "NOW()::TEXT")
          .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY");
        pgSql = q + pgSql + q;
      }

      // Build params array
      const trimmedArgs = args.trim();
      const paramsArray = trimmedArgs ? `[${trimmedArgs}]` : "[]";
      const hasParams = trimmedArgs.length > 0;

      if (method === "get") {
        return `(await pool.query(${pgSql}${hasParams ? `, ${paramsArray}` : ""})).rows[0]`;
      } else if (method === "all") {
        return `(await pool.query(${pgSql}${hasParams ? `, ${paramsArray}` : ""})).rows`;
      } else { // run
        // For INSERT add RETURNING id
        let execSql = pgSql;
        const sqlContent = pgSql.slice(1, -1);
        if (/^\s*INSERT\s+/i.test(sqlContent) && !/RETURNING/i.test(sqlContent)) {
          if (execSql.startsWith("`")) {
            execSql = "`" + sqlContent + " RETURNING id`";
          } else {
            const q = execSql[0];
            execSql = q + sqlContent + " RETURNING id" + q;
          }
        }
        const res = `(await pool.query(${execSql}${hasParams ? `, ${paramsArray}` : ""}))`;
        // Wrap so callers using .lastInsertRowid or .changes still work
        return `{ changes: ${res}.rowCount ?? 0, lastInsertRowid: ${res}.rows?.[0]?.id ?? 0 }`;
      }
    });
  }

  // Run multiple passes (some patterns are chained)
  for (let i = 0; i < 3; i++) {
    const prev = src;
    src = convertDbPrepare(src);
    if (src === prev) break;
  }

  // 4. Fix spread args: .all(...params) or .all(...someArray) that became .rows with array spread
  // These were already handled above but if there's .all(...params) pattern:
  src = src.replace(
    /db\.prepare\((`[^`]*`|'[^']*'|"[^"]*")\)\.all\(\.\.\.([^)]+)\)/g,
    (_, sql, spreadArg) => {
      let pgSql = convertSqlLiteral(sql);
      return `(await pool.query(${pgSql}, ${spreadArg})).rows`;
    }
  );
  src = src.replace(
    /db\.prepare\((`[^`]*`|'[^']*'|"[^"]*")\)\.get\(\.\.\.([^)]+)\)/g,
    (_, sql, spreadArg) => {
      let pgSql = convertSqlLiteral(sql);
      return `(await pool.query(${pgSql}, ${spreadArg})).rows[0]`;
    }
  );
  src = src.replace(
    /db\.prepare\((`[^`]*`|'[^']*'|"[^"]*")\)\.run\(\.\.\.([^)]+)\)/g,
    (_, sql, spreadArg) => {
      let pgSql = convertSqlLiteral(sql);
      return `{ changes: (await pool.query(${pgSql}, ${spreadArg})).rowCount ?? 0, lastInsertRowid: 0 }`;
    }
  );

  // 5. Fix double await (await (await pool...)
  src = src.replace(/await \(await pool/g, "(await pool");

  // 6. Fix: { changes: (await pool.query(...)).rowCount ?? 0, lastInsertRowid: (await pool.query(...)).rows?.[0]?.id ?? 0 }
  // The double query is a bug — we need to capture result once
  src = src.replace(
    /\{ changes: \(await pool\.query\(([^)]+)\)(?:\))?\.rowCount \?\? 0, lastInsertRowid: \(await pool\.query\([^)]+\)(?:\))?\.rows\?\.\[0\]\?\.id \?\? 0 \}/g,
    (match) => {
      // Extract the query part
      const queryMatch = match.match(/pool\.query\(([^)]+)\)/);
      if (queryMatch) {
        const q = queryMatch[1];
        return `await (async () => { const _r = await pool.query(${q}); return { changes: _r.rowCount ?? 0, lastInsertRowid: _r.rows?.[0]?.id ?? 0 }; })()`;
      }
      return match;
    }
  );

  if (src !== original) {
    fs.writeFileSync(filePath, src);
    totalChanged++;
    console.log(`✅ Converted: ${name}`);
  } else {
    console.log(`⏭  No change: ${name}`);
  }
}

function convertSqlLiteral(sql) {
  let idx = 0;
  if (sql.startsWith("`")) {
    const inner = sql.slice(1, -1)
      .replace(/\?/g, () => `$${++idx}`)
      .replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO")
      .replace(/INSERT OR REPLACE INTO/gi, "INSERT INTO")
      .replace(/datetime\s*\(\s*'now'\s*\)/gi, "NOW()::TEXT");
    return "`" + inner + "`";
  } else {
    const q = sql[0];
    const inner = sql.slice(1, -1)
      .replace(/\?/g, () => `$${++idx}`)
      .replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO")
      .replace(/INSERT OR REPLACE INTO/gi, "INSERT INTO")
      .replace(/datetime\s*\(\s*'now'\s*\)/gi, "NOW()::TEXT");
    return q + inner + q;
  }
}

console.log(`\nDone. ${totalChanged} files converted.`);
