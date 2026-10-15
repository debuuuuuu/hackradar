import { describe, expect, it, vi } from "vitest";
import { closePool, getPool, query } from "../server/db.js";
import { dbIt, withSchema } from "./helpers.js";

const COUNT = "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = $1 AND tablename = 'scratch'";

describe("db", () => {
  dbIt("query honours DB_SCHEMA and models.sql is applied", () =>
    withSchema(async () => {
      const [s] = await query<{ s: string }>("SELECT current_schema() AS s");
      expect(s.s).toBe(process.env.DB_SCHEMA);
      expect(await query("SELECT * FROM users")).toEqual([]);
    }),
  );

  dbIt("a table made in the temp schema is gone after drop", async () => {
    let schema = "";
    await withSchema(async () => {
      schema = process.env.DB_SCHEMA!;
      await query("CREATE TABLE scratch (id int)");
      expect((await query<{ n: number }>(COUNT, [schema]))[0].n).toBe(1);
    });
    expect(process.env.DB_SCHEMA).toBeUndefined();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    expect((await query<{ n: number }>(COUNT, [schema]))[0].n).toBe(0);
    await closePool();
    delete process.env.DATABASE_URL;
  });

  it("an idle pool error is logged generically and does not throw", async () => {
    process.env.DATABASE_URL = "postgres://u:topsecret@localhost:1/db";
    await closePool();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = getPool();
    expect(() => pool.emit("error", new Error("connect postgres://u:topsecret@h/db"))).not.toThrow();
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("topsecret");
    log.mockRestore();
    await closePool();
    delete process.env.DATABASE_URL;
  });

  it("rejects an unsafe DB_SCHEMA", async () => {
    process.env.DB_SCHEMA = "x; DROP TABLE users";
    process.env.DATABASE_URL = "postgres://u:p@localhost/db";
    await closePool();
    await expect(query("SELECT 1")).rejects.toThrow(/DB_SCHEMA/);
    delete process.env.DB_SCHEMA;
    delete process.env.DATABASE_URL;
  });
});
