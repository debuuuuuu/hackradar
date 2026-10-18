import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "../server/db.js";
import { route } from "../server/router.js";
import { readUnsubscribeToken, unsubscribeToken } from "../server/unsubscribe.js";
import { dbIt, withSchema } from "./helpers.js";

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});
afterEach(() => {
  if (saved === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = saved;
});

const post = (token: unknown) =>
  route(
    new Request("https://hackradar.test/api/auth/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }),
  );

describe("unsubscribe link", () => {
  it("round-trips a user id and rejects forged, tampered or malformed tokens", () => {
    expect(readUnsubscribeToken(unsubscribeToken(42))).toBe(42);
    const [, sig] = unsubscribeToken(42).split(".");
    expect(readUnsubscribeToken(`43.${sig}`)).toBeNull(); // another user's id with this signature
    expect(readUnsubscribeToken(`42.${sig}x`)).toBeNull();
    for (const bad of ["", "42", "abc.def", "0.AAAA", 42, null, undefined, "9".repeat(200)]) expect(readUnsubscribeToken(bad)).toBeNull();
  });

  it("a token signed with another key is refused", () => {
    const token = unsubscribeToken(5);
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(readUnsubscribeToken(token)).toBeNull();
  });

  it("GET only forwards to the confirm page and never deletes", async () => {
    const res = await route(new Request("https://hackradar.test/api/auth/unsubscribe?token=abc"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/unsubscribe?token=abc");
  });

  it("POST with an invalid token gives 400", async () => {
    expect((await post("42.forged")).status).toBe(400);
  });

  dbIt("POST with a valid token deletes the account and its data, and leaves other users alone", () =>
    withSchema(async () => {
      const [a] = await query<{ id: string }>("INSERT INTO users (name) VALUES ('A') RETURNING id");
      const [b] = await query<{ id: string }>("INSERT INTO users (name) VALUES ('B') RETURNING id");
      await query("INSERT INTO preferences (user_id) VALUES ($1), ($2)", [a.id, b.id]);
      const res = await post(unsubscribeToken(Number(a.id)));
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
      const left = await query<{ id: string }>("SELECT id FROM users");
      expect(left.map((r) => r.id)).toEqual([b.id]);
      const prefs = await query("SELECT 1 FROM preferences");
      expect(prefs).toHaveLength(1);
    }));
});
