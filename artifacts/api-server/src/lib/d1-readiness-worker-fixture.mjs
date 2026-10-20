import Database from "better-sqlite3";

const missingColumn = process.env.D1_TEST_MISSING_SESSION_COLUMN;
if (missingColumn !== "created_at" && missingColumn !== "ip_address") {
  throw new Error("D1_TEST_MISSING_SESSION_COLUMN must name a sessions column omitted by this test fixture");
}

const sessionColumns = ["id INTEGER PRIMARY KEY", "token TEXT", "user_id INTEGER", "expires_at TEXT"];
if (missingColumn !== "created_at") sessionColumns.push("created_at TEXT");
if (missingColumn !== "ip_address") sessionColumns.push("ip_address TEXT");
const testDatabase = new Database(":memory:");
testDatabase.exec(`CREATE TABLE sessions (${sessionColumns.join(", ")})`);

function createBinding() {
  return {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) {
          params = values;
          return this;
        },
        async all() {
          try {
            const results = testDatabase.prepare(sql).all(...params);
            return { success: true, results };
          } catch (error) {
            return { success: false, results: [], error: String(error) };
          }
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.all()));
    },
  };
}

globalThis.__ERP_WORKER_ENV = {
  ERP_DB: createBinding(),
  ERP_DB_REPLICA: createBinding(),
  ERP_OBJECTS: {
    async get() { return null; },
    async head() { return null; },
    async put() { return null; },
    async delete() {},
    async list() { return { objects: [], truncated: false }; },
  },
};
