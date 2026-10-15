import pg from "pg";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const schema = process.env.DB_SCHEMA;
  if (schema !== undefined && !/^[a-z0-9_]+$/.test(schema)) throw new Error("invalid DB_SCHEMA");
  pool = new pg.Pool({
    connectionString,
    max: 3,
  });
  // An idle client dropping must not crash the process; log a generic line only (never the connection string).
  pool.on("error", () => console.error("db: idle pool client error"));
  return pool;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = getPool();
  const schema = process.env.DB_SCHEMA;
  if (!schema) return (await p.query(text, params)).rows as T[];
  // Neon's pooled endpoint rejects the startup `options` parameter, so set search_path per checkout.
  const client = await p.connect();
  try {
    await client.query(`SET search_path TO ${schema}, public`);
    return (await client.query(text, params)).rows as T[];
  } finally {
    client.release();
  }
}

export type Q = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

/** Runs fn on one connection inside BEGIN/COMMIT (ROLLBACK on error). */
export async function transaction<R>(fn: (q: Q) => Promise<R>): Promise<R> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    try {
      // SET LOCAL inside the transaction: a transaction-mode pooler may switch backends between statements.
      const schema = process.env.DB_SCHEMA;
      if (schema) await client.query(`SET LOCAL search_path TO ${schema}, public`);
      const out = await fn(async <T,>(text: string, params: unknown[] = []) => (await client.query(text, params)).rows as T[]);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  const p = pool;
  pool = null;
  if (p) await p.end();
}
