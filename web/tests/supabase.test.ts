import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "../server/db.js";
import { route } from "../server/router.js";
import { readSession } from "../server/session.js";
import { supabaseConfig, verifySupabaseToken } from "../server/supabase.js";
import { dbIt, withSchema } from "./helpers.js";

const ENV = ["SESSION_SECRET", "ENCRYPTION_KEY", "SITE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SMTP_USER", "SMTP_APP_PASSWORD"] as const;
const saved: Record<string, string | undefined> = {};
const SECRET = "s".repeat(32);
const ORIGIN = "https://hackradar.test";

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SESSION_SECRET = SECRET;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  delete process.env.SITE_URL;
  delete process.env.SMTP_USER; // a real send must be impossible in tests
  delete process.env.SMTP_APP_PASSWORD;
  process.env.SUPABASE_URL = "https://proj.supabase.test/";
  process.env.SUPABASE_ANON_KEY = "anon-key-123";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Fake Supabase /auth/v1/user. */
const fakeSupabase = (user: Record<string, unknown>, status = 200) =>
  vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe("https://proj.supabase.test/auth/v1/user");
    expect((init?.headers as Record<string, string>).apikey).toBe("anon-key-123");
    return jsonRes(user, status);
  }) as unknown as typeof fetch;

const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  route(new Request(`${ORIGIN}/api/auth/supabase/session`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("supabase password sign-in", () => {
  it("config needs both values and trims the trailing slash", () => {
    expect(supabaseConfig()).toEqual({ url: "https://proj.supabase.test", anonKey: "anon-key-123" });
    delete process.env.SUPABASE_ANON_KEY;
    expect(supabaseConfig()).toBeNull();
  });

  it("accepts a confirmed email and cleans the name", async () => {
    const f = fakeSupabase({ email: "ann@example.com", email_confirmed_at: "2026-10-16T00:00:00Z", user_metadata: { full_name: " Ann\u0007 Lee " } });
    expect(await verifySupabaseToken("tok", f)).toEqual({ email: "ann@example.com", name: "Ann Lee" });
  });

  it("refuses an unconfirmed email, a bad token and a missing config, with a generic error", async () => {
    await expect(verifySupabaseToken("t", fakeSupabase({ email: "a@example.com", email_confirmed_at: null }))).rejects.toThrow("supabase token check failed");
    await expect(verifySupabaseToken("t", fakeSupabase({ email: "a@example.com" }))).rejects.toThrow("supabase token check failed");
    await expect(verifySupabaseToken("t", fakeSupabase({ msg: "bad jwt" }, 401))).rejects.toThrow("supabase token check failed");
    delete process.env.SUPABASE_URL;
    await expect(verifySupabaseToken("t", fakeSupabase({}))).rejects.toThrow("supabase token check failed");
    await verifySupabaseToken("secret-token-xyz", fakeSupabase({}, 401)).catch((e: Error) => expect(e.message).not.toContain("secret-token-xyz"));
  });

  it("providers shows the public config only when configured", async () => {
    const on = (await (await route(new Request(`${ORIGIN}/api/auth/providers`))).json()) as { password: unknown };
    expect(on.password).toEqual({ url: "https://proj.supabase.test", anonKey: "anon-key-123" });
    delete process.env.SUPABASE_URL;
    const off = (await (await route(new Request(`${ORIGIN}/api/auth/providers`))).json()) as { password: unknown };
    expect(off.password).toBeNull();
  });

  it("session route: 415 without JSON, 400 for a missing, oversize or non-string token", async () => {
    expect((await post("{}", { "content-type": "text/plain" })).status).toBe(415);
    expect((await post({})).status).toBe(400);
    expect((await post({ accessToken: 5 })).status).toBe(400);
    expect((await post({ accessToken: "x".repeat(7000) })).status).toBe(400);
  });

  it("session route: a token Supabase rejects gives 401 and no cookie", async () => {
    vi.stubGlobal("fetch", fakeSupabase({ msg: "bad" }, 401));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ accessToken: "bad" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(log.mock.calls.flat().join(" ")).not.toContain("bad jwt");
  });

  it("session route: an unconfirmed email gives 401 and no cookie, so a wrong address cannot sign in", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const user of [
      { email: "nobody@example.com", email_confirmed_at: null },
      { email: "nobody@example.com" },
      { email: "nobody@example.com", email_confirmed_at: "" },
    ]) {
      vi.stubGlobal("fetch", fakeSupabase(user));
      const res = await post({ accessToken: "unconfirmed" });
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  dbIt("session route: an unconfirmed email creates no account", () =>
    withSchema(async () => {
      vi.stubGlobal("fetch", fakeSupabase({ email: "nobody@example.com", email_confirmed_at: null }));
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await post({ accessToken: "unconfirmed" })).status).toBe(401);
      const [n] = await query<{ n: string }>("SELECT count(*) AS n FROM users");
      expect(Number(n.n)).toBe(0);
    }));

  dbIt("session route: a valid confirmed token signs in, sets our session, and shares the account with the email link", () =>
    withSchema(async () => {
      vi.stubGlobal("fetch", fakeSupabase({ email: "Ann@Example.com", email_confirmed_at: "2026-10-16T00:00:00Z", user_metadata: { name: "Ann" } }));
      const log = vi.spyOn(console, "error").mockImplementation(() => {}); // the unconfigured welcome mail is logged by class only
      const res = await post({ accessToken: "good" });
      expect(res.status).toBe(200);
      const session = /hr_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "");
      expect(session).not.toBeNull();
      const uid = readSession(`hr_session=${session![1]}`, SECRET)?.uid;
      expect(uid).toBeGreaterThan(0);
      // the same address again (different casing) is the same account, not a second one
      const again = await post({ accessToken: "good" });
      expect(again.status).toBe(200);
      const [n] = await query<{ n: string }>("SELECT count(*) AS n FROM users");
      expect(Number(n.n)).toBe(1);
      const logins = await query<{ method: string }>("SELECT method FROM logins ORDER BY id");
      expect(logins.map((l) => l.method)).toEqual(["email", "email"]);
      log.mockRestore();
    }));
});
