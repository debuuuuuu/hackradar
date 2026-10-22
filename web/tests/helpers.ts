import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { it } from "vitest";
import { closePool } from "../server/db.js";

/** Mirrors tests/conftest.py: DB tests skip unless TEST_DATABASE_URL is set. */
export const dbIt = it.skipIf(!process.env.TEST_DATABASE_URL);

const MODELS = fileURLToPath(new URL("../../pipeline/models.sql", import.meta.url));

/** Production tables a test must never touch. */
export const GUARDED_TABLES = ["users", "preferences", "logins", "login_tokens", "user_events", "scores", "reminders_sent", "busy_periods"];

export type Querier = { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

/** count(*) of each guarded table that exists in `public`. Plain qualified queries: no search_path involved. */
export async function publicCounts(c: Querier): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of GUARDED_TABLES) {
    const ex = await c.query("SELECT to_regclass($1) IS NOT NULL AS e", [`public.${t}`]);
    if (!ex.rows[0]?.e) continue;
    out[t] = Number((await c.query(`SELECT count(*) AS n FROM public.${t}`)).rows[0].n);
  }
  return out;
}

/** Runs fn and throws loudly if any guarded public table's row count changed. Deletes nothing. */
export async function withLeakGuard(c: Querier, fn: () => Promise<void>): Promise<void> {
  const before = await publicCounts(c);
  try {
    await fn();
  } finally {
    const after = await publicCounts(c);
    for (const t of Object.keys({ ...before, ...after })) {
      if (before[t] !== after[t]) {
        // eslint-disable-next-line no-unsafe-finally
        throw new Error(`TEST LEAKED INTO PUBLIC SCHEMA: public.${t} count ${before[t]} -> ${after[t]}`);
      }
    }
  }
}

/** Run fn against a throwaway schema with pipeline/models.sql applied; always dropped after. */
export async function withSchema(fn: () => Promise<void>): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL not set");
  const schema = `t_${randomBytes(4).toString("hex")}`;
  const prevSchema = process.env.DB_SCHEMA;
  const prevUrl = process.env.DATABASE_URL;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  const guard = new pg.Client({ connectionString: url });
  await guard.connect();
  try {
    await admin.query("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public");
    await admin.query("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public");
    await admin.query(`CREATE SCHEMA ${schema}`);
    // SET LOCAL inside a transaction: a session-level SET would stick to the pooled backend and leak to other clients.
    await admin.query("BEGIN");
    await admin.query(`SET LOCAL search_path TO ${schema}, public`);
    await admin.query(readFileSync(MODELS, "utf8"));
    await admin.query("COMMIT");
    await closePool();
    process.env.DATABASE_URL = url;
    process.env.DB_SCHEMA = schema;
    await withLeakGuard(guard, fn);
  } finally {
    await closePool();
    if (prevSchema === undefined) delete process.env.DB_SCHEMA;
    else process.env.DB_SCHEMA = prevSchema;
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    await guard.end();
  }
}
