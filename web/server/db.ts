import pg from "pg";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  activeSchema();
  pool = new pg.Pool({
    connectionString,
    max: 3,
  });
  // An idle client dropping must not crash the process; log a generic line only (never the connection string).
  pool.on("error", () => console.error("db: idle pool client error"));
  return pool;
}

const SCHEMA_RE = /^[a-z0-9_]+$/;

/** DB_SCHEMA (test isolation only), validated on every use; undefined in production. */
function activeSchema(): string | undefined {
  const schema = process.env.DB_SCHEMA;
  if (!schema) return undefined;
  if (!SCHEMA_RE.test(schema)) throw new Error("invalid DB_SCHEMA");
  return schema;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = getPool();
  // Validate before any SQL is sent.
  if (!activeSchema()) return (await p.query(text, params)).rows as T[];
  // Neon's pooled endpoint is a transaction-mode pooler: a separate SET and statement can land on different
  // backends (and hit `public`). In DB_SCHEMA mode run SET LOCAL + statement as one transaction.
  return transaction((q) => q<T>(text, params));
}

export type Q = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

/** Runs fn on one connection inside BEGIN/COMMIT (ROLLBACK on error). */
export async function transaction<R>(fn: (q: Q) => Promise<R>): Promise<R> {
  const schema = activeSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    try {
      // SET LOCAL inside the transaction: a transaction-mode pooler may switch backends between statements.
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
