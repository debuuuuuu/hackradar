import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanDisplayName } from "../server/auth.js";
import { route } from "../server/router.js";

const SECRET = "s".repeat(32);
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = saved;
});

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
});
