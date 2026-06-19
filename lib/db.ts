import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";
import ws from "ws";

// Neon's Pool/Client use WebSockets for interactive transactions (BEGIN/COMMIT
// with statements that depend on each other). Node has no global ws, so wire it
// up. Simple pool.query() calls go over plain HTTP fetch (faster, no socket).
neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

// Reuse a single Pool across hot reloads / serverless invocations.
const globalForDb = globalThis as unknown as { _bizuradoPool?: Pool };

// SCRAM channel binding isn't available over Neon's WebSocket proxy, and a
// `channel_binding=require` in the URL makes interactive transactions (the WS
// path via pool.connect) fail with "Connection terminated unexpectedly". The
// HTTP path ignores it. Strip it so both paths work from one URL.
function sanitizeConnectionString(raw: string): string {
  try {
    const u = new URL(raw);
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return raw.replace(/[?&]channel_binding=[^&]*/i, "");
  }
}

export function getPool(): Pool {
  if (!globalForDb._bizuradoPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL não definida. Configure-a no .env.local (local) ou nas Environment Variables da Vercel."
      );
    }
    globalForDb._bizuradoPool = new Pool({
      connectionString: sanitizeConnectionString(connectionString),
    });
  }
  return globalForDb._bizuradoPool;
}

/** Run a query, return all rows. Uses $1, $2, ... placeholders (Postgres). */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await getPool().query(text, params as unknown[]);
  return res.rows as T[];
}

/** Run a query, return the first row (or undefined). */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const res = await getPool().query(text, params as unknown[]);
  return res.rows[0] as T | undefined;
}

/** Run a write; expose rowCount (e.g. to detect ON CONFLICT DO NOTHING no-ops). */
export async function execute(
  text: string,
  params: unknown[] = []
): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> {
  const res = await getPool().query(text, params as unknown[]);
  return { rowCount: res.rowCount ?? 0, rows: res.rows as Record<string, unknown>[] };
}

/**
 * Run `fn` inside a single transaction on a dedicated connection. Mirrors the
 * old better-sqlite3 `db.transaction()`: commit on success, rollback on throw.
 * Use `client.query(...)` inside for statements that must be atomic or that
 * depend on each other's results.
 */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Close the pool — call at the end of local CLI scripts for a clean exit. */
export async function closePool(): Promise<void> {
  if (globalForDb._bizuradoPool) {
    await globalForDb._bizuradoPool.end();
    globalForDb._bizuradoPool = undefined;
  }
}

export type { PoolClient };
