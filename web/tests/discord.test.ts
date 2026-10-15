import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "../server/db.js";
import {
  authorizeUrl,
  exchangeCode,
  oauthCookie,
  readOauthCookie,
  upsertUserByDiscord,
} from "../server/discord.js";
import { route } from "../server/router.js";
import { readSession } from "../server/session.js";
import { dbIt, withSchema } from "./helpers.js";

const ENV = ["SESSION_SECRET", "ENCRYPTION_KEY", "SITE_URL", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"] as const;
const saved: Record<string, string | undefined> = {};
const SECRET = "s".repeat(32);
const ORIGIN = "https://hackradar.test";
const REDIRECT = `${ORIGIN}/api/auth/discord/callback`;

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SESSION_SECRET = SECRET;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  delete process.env.SITE_URL;
  process.env.DISCORD_CLIENT_ID = "cid-123";
  process.env.DISCORD_CLIENT_SECRET = "csecret-xyz";
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Fake Discord: token endpoint then profile endpoint. */
function fakeDiscord(opts: { token?: Response; me?: Response } = {}) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith("/oauth2/token")) return opts.token ?? jsonRes({ access_token: "AT-secret" });
    if (u.endsWith("/users/@me")) return opts.me ?? jsonRes({ id: "1234567890", username: "ada" });
    throw new Error("unexpected url");
  });
}

describe("authorizeUrl", () => {
  it("carries client id, scope, exact redirect and state", () => {
    const u = new URL(authorizeUrl("st4te", REDIRECT));
    expect(u.origin + u.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("cid-123");
    expect(u.searchParams.get("scope")).toBe("identify");
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("state")).toBe("st4te");
    expect(u.searchParams.get("prompt")).toBe("none");
  });
});

describe("exchangeCode", () => {
  it("returns id and username only, posting a form body then a bearer GET", async () => {
    const f = fakeDiscord();
    const r = await exchangeCode("the-code", REDIRECT, f as unknown as typeof fetch);
    expect(r).toEqual({ discordId: "1234567890", username: "ada" });
    const [, tokenInit] = f.mock.calls[0];
    expect(String((tokenInit!.headers as Record<string, string>)["content-type"])).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(tokenInit!.body));
    expect(Object.fromEntries(body)).toEqual({
      client_id: "cid-123",
      client_secret: "csecret-xyz",
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: REDIRECT,
    });
    expect((f.mock.calls[1][1]!.headers as Record<string, string>).authorization).toBe("Bearer AT-secret");
    expect(tokenInit!.signal).toBeInstanceOf(AbortSignal);
  });

  const leak = "SECRET-RESPONSE-TEXT";
  it.each([
    ["non-200 token", { token: jsonRes({ message: leak }, 400) }],
    ["non-200 profile", { me: jsonRes({ message: leak }, 401) }],
    ["malformed token JSON", { token: new Response(`not json ${leak}`) }],
    ["malformed profile JSON", { me: new Response(`not json ${leak}`) }],
    ["profile without id", { me: jsonRes({ username: "ada" }) }],
  ])("throws a generic error on %s", async (_n, opts) => {
    const err = await exchangeCode("c", REDIRECT, fakeDiscord(opts) as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    for (const s of [leak, "AT-secret", "csecret-xyz"]) expect(String(err.message)).not.toContain(s);
  });

  it("throws generically when the request times out or fails", async () => {
    const f = vi.fn(async () => {
      throw new DOMException("The operation timed out: csecret-xyz", "TimeoutError");
    });
    const err = await exchangeCode("c", REDIRECT, f as unknown as typeof fetch).catch((e) => e);
    expect(err.message).toBe("discord exchange failed");
  });
});

describe("oauth cookie", () => {
  const value = (c: string) => c.split(";")[0];
  it("round-trips and rejects tampering or another secret", () => {
    const c = oauthCookie("abc", "/events", SECRET);
    expect(c).toContain("HttpOnly; Secure; SameSite=Lax; Path=/api/auth/discord; Max-Age=600");
    expect(readOauthCookie(value(c), SECRET)).toEqual({ state: "abc", next: "/events" });
    expect(readOauthCookie(value(c), "other".repeat(8))).toBeNull();
    const [body, sig] = value(c).slice("hr_oauth=".length).split(".");
    const forged = Buffer.from(JSON.stringify({ state: "abc", next: "/admin" })).toString("base64url");
    expect(readOauthCookie(`hr_oauth=${forged}.${sig}`, SECRET)).toBeNull();
    expect(readOauthCookie(`hr_oauth=${body}`, SECRET)).toBeNull();
    expect(readOauthCookie(null, SECRET)).toBeNull();
  });
});

describe("GET /api/auth/providers", () => {
  const get = async () => (await route(new Request(`${ORIGIN}/api/auth/providers`))).json();
  it("reports discord only when both variables are non-empty", async () => {
    expect(await get()).toEqual({ email: true, discord: true });
    delete process.env.DISCORD_CLIENT_SECRET;
    expect(await get()).toEqual({ email: true, discord: false });
    process.env.DISCORD_CLIENT_SECRET = "x";
    process.env.DISCORD_CLIENT_ID = "";
    expect(await get()).toEqual({ email: true, discord: false });
    delete process.env.DISCORD_CLIENT_ID;
    delete process.env.DISCORD_CLIENT_SECRET;
    expect(await get()).toEqual({ email: true, discord: false });
  });
});

describe("GET /api/auth/discord/start", () => {
  it("redirects to /signin?error=discord when not configured", async () => {
    delete process.env.DISCORD_CLIENT_ID;
    const res = await route(new Request(`${ORIGIN}/api/auth/discord/start`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/signin?error=discord");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sets the signed cookie and redirects to Discord with the same state", async () => {
    const res = await route(new Request(`${ORIGIN}/api/auth/discord/start?next=${encodeURIComponent("//evil.com")}`));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe("https://discord.com");
    expect(loc.searchParams.get("redirect_uri")).toBe(REDIRECT);
    const cookie = res.headers.get("set-cookie")!;
    const saved = readOauthCookie(cookie.split(";")[0], SECRET)!;
    expect(saved.state).toBe(loc.searchParams.get("state"));
    expect(Buffer.from(saved.state, "base64url").length).toBeGreaterThanOrEqual(32);
    expect(saved.next).toBe("/");
  });
});

describe("GET /api/auth/discord/callback", () => {
  const cb = (qs: string, cookie?: string) =>
    route(new Request(`${ORIGIN}/api/auth/discord/callback?${qs}`, { headers: cookie ? { cookie } : {} }));
  const good = (state = "st4te", next = "/events") => oauthCookie(state, next, SECRET).split(";")[0];
  const clears = (res: Response) =>
    expect(res.headers.getSetCookie().some((c) => c.startsWith("hr_oauth=;") && c.includes("Max-Age=0"))).toBe(true);

  const fail = it.each([
    ["wrong state", "code=c&state=other", () => good()],
    ["missing cookie", "code=c&state=st4te", () => undefined],
    ["tampered cookie", "code=c&state=st4te", () => good().replace(/.$/, (ch) => (ch === "A" ? "B" : "A"))],
    ["missing state", "code=c", () => good()],
  ]);
  fail("%s -> /signin?error=state, cookie cleared, no network", async (_n, qs, cookie) => {
    const f = fakeDiscord();
    vi.stubGlobal("fetch", f);
    const res = await cb(qs, cookie());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/signin?error=state");
    clears(res);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("hr_session="))).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("declined or code-less -> /signin?error=discord, cookie cleared", async () => {
    const f = fakeDiscord();
    vi.stubGlobal("fetch", f);
    for (const qs of ["error=access_denied&state=st4te", "state=st4te"]) {
      const res = await cb(qs, good());
      expect(res.headers.get("location")).toBe("/signin?error=discord");
      clears(res);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("exchange failure -> /signin?error=discord, cookie cleared, no session", async () => {
    vi.stubGlobal("fetch", fakeDiscord({ token: jsonRes({}, 400) }));
    const res = await cb("code=c&state=st4te", good());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/signin?error=discord");
    clears(res);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("hr_session="))).toBe(false);
  });

  dbIt("success creates the user, one discord login, a session, and redirects safely", () =>
    withSchema(async () => {
      vi.stubGlobal("fetch", fakeDiscord());
      const res = await cb("code=c&state=st4te", good("st4te", "//evil.com"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
      clears(res);
      const session = res.headers.getSetCookie().find((c) => c.startsWith("hr_session="))!;
      const s = readSession(session.split(";")[0], SECRET)!;
      const logins = await query<{ user_id: number; method: string }>("SELECT user_id, method FROM logins");
      expect(logins).toHaveLength(1);
      expect(logins[0].method).toBe("discord");
      expect(Number(logins[0].user_id)).toBe(s.uid);
      const prefs = await query("SELECT 1 FROM preferences WHERE user_id = $1", [s.uid]);
      expect(prefs).toHaveLength(1);
      const again = await cb("code=c&state=st4te", good("st4te", "/events"));
      expect(again.headers.get("location")).toBe("/events");
      expect(await query("SELECT 1 FROM users")).toHaveLength(1);
    }));
});

describe("upsertUserByDiscord", () => {
  dbIt("creates once, then reuses the same uid", () =>
    withSchema(async () => {
      const a = await upsertUserByDiscord({ discordId: "42", username: "ada" });
      const b = await upsertUserByDiscord({ discordId: "42", username: "renamed" });
      expect(a.isNew).toBe(true);
      expect(b).toEqual({ uid: a.uid, isNew: false });
      const rows = await query<{ name: string }>("SELECT name FROM users");
      expect(rows).toEqual([{ name: "ada" }]);
      expect(await query("SELECT 1 FROM preferences")).toHaveLength(1);
    }));

  dbIt("cleans and truncates the display name", () =>
    withSchema(async () => {
      const { uid } = await upsertUserByDiscord({ discordId: "43", username: `a\u0000b\n${"x".repeat(60)}` });
      const [row] = await query<{ name: string }>("SELECT name FROM users WHERE id = $1", [uid]);
      expect(row.name).toBe(`ab${"x".repeat(38)}`);
    }));

  dbIt("parallel first sign-ins produce one user", () =>
    withSchema(async () => {
      const rs = await Promise.all(
        Array.from({ length: 5 }, () => upsertUserByDiscord({ discordId: "99", username: "p" })),
      );
      expect(new Set(rs.map((r) => r.uid)).size).toBe(1);
      expect(rs.filter((r) => r.isNew)).toHaveLength(1);
      expect(await query("SELECT 1 FROM users")).toHaveLength(1);
      expect(await query("SELECT 1 FROM preferences")).toHaveLength(1);
    }));
});
