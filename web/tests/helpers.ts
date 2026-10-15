import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { it } from "vitest";
import { closePool } from "../server/db.js";

/** Mirrors tests/conftest.py: DB tests skip unless TEST_DATABASE_URL is set. */
export const dbIt = it.skipIf(!process.env.TEST_DATABASE_URL);

const MODELS = fileURLToPath(new URL("../../pipeline/models.sql", import.meta.url));

/** Run fn against a throwaway schema with pipeline/models.sql applied; always dropped after. */
export async function withSchema(fn: () => Promise<void>): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL not set");
  const schema = `t_${randomBytes(4).toString("hex")}`;
  const prevSchema = process.env.DB_SCHEMA;
  const prevUrl = process.env.DATABASE_URL;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    await admin.query("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public");
    await admin.query("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public");
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}, public`);
    await admin.query(readFileSync(MODELS, "utf8"));
    await closePool();
    process.env.DATABASE_URL = url;
    process.env.DB_SCHEMA = schema;
    await fn();
  } finally {
    await closePool();
    if (prevSchema === undefined) delete process.env.DB_SCHEMA;
    else process.env.DB_SCHEMA = prevSchema;
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}
