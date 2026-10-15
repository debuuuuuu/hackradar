import { describe, expect, it, vi } from "vitest";
import handler from "../api/index.js";
import { addRoute, json } from "../server/router.js";

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

  it("returns a generic 500 for a throwing handler and logs only the class name", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    addRoute("GET", "/api/_boom", () => {
      throw new TypeError("secret postgres://u:p@h/db");
    });
    const res = await handler.fetch(new Request("https://x.test/api/_boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("secret");
    log.mockRestore();
  });

  it("matches :params and the method", async () => {
    addRoute("GET", "/api/_echo/:id", (_r, p) => json({ id: p.id }));
    const res = await handler.fetch(new Request("https://x.test/api/_echo/42"));
    expect(await res.json()).toEqual({ id: "42" });
    const post = await handler.fetch(new Request("https://x.test/api/_echo/42", { method: "POST" }));
    expect(post.status).toBe(404);
  });
});
