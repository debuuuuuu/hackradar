import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanDisplayName, finishEmailLogin, startEmailLogin } from "../server/auth.js";
import { query } from "../server/db.js";
import { route } from "../server/router.js";
import { dbIt, withSchema } from "./helpers.js";

const SECRET = "s".repeat(32);
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});
afterEach(() => {
  if (saved === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = saved;
  delete process.env.ENCRYPTION_KEY;
});

/** Runs the sign-in start step and returns the token from the mailed link. */
async function mailedToken(email: string, name?: unknown, now = Date.now()): Promise<string> {
  let link = "";
  await startEmailLogin(email, { send: async (_to, l) => void (link = l), origin: "https://hackradar.test", now, name });
  return new URL(link).searchParams.get("token") ?? "";
}

describe("display name", () => {
  it("trims, strips control characters and caps at 40 characters", () => {
    expect(cleanDisplayName("  Ann Lee  ")).toBe("Ann Lee");
    expect(cleanDisplayName("A\u0000n\nn")).toBe("Ann");
    expect(cleanDisplayName("x".repeat(100))).toBe("x".repeat(40));
  });

  it("refuses an empty, blank or non-string name", () => {
    for (const bad of ["", "   ", "\u0000\n", 42, null, undefined, {}]) expect(cleanDisplayName(bad)).toBeNull();
  });

  it("PUT /api/me/name needs a signed-in user", async () => {
    const res = await route(
      new Request("https://hackradar.test/api/me/name", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ann" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  dbIt("the name typed on the sign-in form names a new account, and never renames an existing one", () =>
    withSchema(async () => {
      const t1 = await mailedToken("ann@example.com", "  Ann Lee ");
      expect(await finishEmailLogin(t1)).toMatchObject({ isNew: true, name: "Ann Lee" });
      const t2 = await mailedToken("ann@example.com", "Someone Else", Date.now() + 120_000);
      expect(await finishEmailLogin(t2, Date.now() + 120_000)).toMatchObject({ isNew: false });
      const rows = await query<{ name: string }>("SELECT name FROM users");
      expect(rows.map((r) => r.name)).toEqual(["Ann Lee"]);
    }));

  dbIt("no name typed gives the placeholder, and junk names are ignored", () =>
    withSchema(async () => {
      expect(await finishEmailLogin(await mailedToken("bob@example.com", "   "))).toMatchObject({ isNew: true, name: "Member" });
      expect(await finishEmailLogin(await mailedToken("cy@example.com", { x: 1 }))).toMatchObject({ name: "Member" });
    }));
});
