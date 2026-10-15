import { describe, expect, it } from "vitest";
import handler from "../api/index.js";

describe("router", () => {
  it("serves /api/health", async () => {
    const res = await handler.fetch(new Request("https://x.test/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it("404s as JSON otherwise", async () => {
    const res = await handler.fetch(new Request("https://x.test/api/nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});
