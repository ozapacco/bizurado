export interface StatementResult {
  lastInsertRowid: number;
  changes: number;
}

export interface StatementSync {
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): StatementResult;
}

export interface DatabaseSync {
  prepare(sql: string): StatementSync;
  exec(sql: string): void;
  close(): void;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeSqlite = require("node:sqlite");

export function createDatabase(path: string): DatabaseSync {
  return new nodeSqlite.DatabaseSync(path);
}
