import type BetterSqlite3 from "better-sqlite3";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDb: getNativeDb } = require("./database.js") as {
  getDb: () => BetterSqlite3.Database;
};

export function getDb(): BetterSqlite3.Database {
  return getNativeDb();
}
