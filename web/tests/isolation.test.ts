import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { query, transaction } from "../server/db.js";
import { dbIt, GUARDED_TABLES, publicCounts, withLeakGuard, withSchema, type Querier } from "./helpers.js";

describe("test-database isolation", () => {
  dbIt("40 parallel query() calls all run in the test schema", () =>
    withSchema(async () => {
      const schema = process.env.DB_SCHEMA;
      const rows = await Promise.all(Array.from({ length: 40 }, () => query<{ s: string }>("select current_schema() as s")));
      expect(rows.map((r) => r[0].s)).toEqual(Array(40).fill(schema));
    }),
  );

  dbIt("20 parallel transaction() calls all run in the test schema", () =>
    withSchema(async () => {
      const schema = process.env.DB_SCHEMA;
      const rows = await Promise.all(
        Array.from({ length: 20 }, () => transaction((q) => q<{ s: string }>("select current_schema() as s"))),
      );
      expect(rows.map((r) => r[0].s)).toEqual(Array(20).fill(schema));
    }),
  );

  dbIt("query() with an invalid DB_SCHEMA rejects without sending SQL", () =>
    withSchema(async () => {
      const connect = vi.spyOn(pg.Pool.prototype, "connect");
      const run = vi.spyOn(pg.Pool.prototype, "query");
      process.env.DB_SCHEMA = "a;drop table users";
      await expect(query("select 1")).rejects.toThrow(/DB_SCHEMA/);
      await expect(transaction(async () => 1)).rejects.toThrow(/DB_SCHEMA/);
      expect(connect).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      connect.mockRestore();
      run.mockRestore();
    }),
  );

  dbIt("with DB_SCHEMA unset, query() is a plain pooled query (no SET)", () =>
    withSchema(async () => {
      const schema = process.env.DB_SCHEMA;
      delete process.env.DB_SCHEMA;
      const sent = vi.spyOn(pg.Client.prototype, "query");
      try {
        const [r] = await query<{ s: string }>("select current_schema() as s");
        expect(r.s).toBe("public");
        expect(sent.mock.calls.map((c) => String(typeof c[0] === "string" ? c[0] : (c[0] as { text?: string }).text))).toEqual([
          "select current_schema() as s",
        ]);
      } finally {
        sent.mockRestore();
        process.env.DB_SCHEMA = schema;
      }
    }),
  );
});

/** Fake querier whose guarded tables exist with counts taken from `counts`. */
function fake(counts: Record<string, number>): Querier {
  return {
    async query(text, params) {
      if (text.includes("to_regclass")) return { rows: [{ e: String(params?.[0]).replace("public.", "") in counts }] };
      const t = /public\.(\w+)/.exec(text)![1];
      return { rows: [{ n: counts[t] }] };
    },
  };
}

describe("leak guard", () => {
  it("throws loudly when a public table count changes", async () => {
    const counts: Record<string, number> = { users: 0, logins: 2 };
    await expect(withLeakGuard(fake(counts), async () => void (counts.users = 1))).rejects.toThrow(
      /TEST LEAKED INTO PUBLIC SCHEMA: public\.users count 0 -> 1/,
    );
  });

  it("passes when counts are stable, and ignores missing tables", async () => {
    await expect(withLeakGuard(fake({}), async () => {})).resolves.toBeUndefined();
    expect(await publicCounts(fake({ users: 3 }))).toEqual({ users: 3 });
    expect(GUARDED_TABLES).toContain("reminders_sent");
  });
});
