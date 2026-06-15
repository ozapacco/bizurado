declare module "node:sqlite" {
  export interface StatementResult {
    lastInsertRowid: number;
    changes: number;
  }

  export interface StatementSync {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): StatementResult;
  }

  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean });
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}
