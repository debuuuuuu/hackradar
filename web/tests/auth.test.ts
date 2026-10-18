import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findUser, finishEmailLogin, MAX_TOKENS_PER_IP_PER_HOUR, recordLogin, safeNext, startEmailLogin } from "../server/auth.js";
import { blindIndex, decrypt, keyFromEnv } from "../server/crypto.js";
import { query } from "../server/db.js";
import { isBadRecipient } from "../server/mail.js";
import { route } from "../server/router.js";
import { readSession, signSession } from "../server/session.js";
import { dbIt, withSchema } from "./helpers.js";

const ENV = ["SESSION_SECRET", "ENCRYPTION_KEY", "ADMIN_EMAILS", "SITE_URL", "SMTP_USER", "SMTP_APP_PASSWORD"] as const;
const saved: Record<string, string | undefined> = {};
const T0 = 1_800_000_000_000;
const MIN = 60_000;

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SESSION_SECRET = "s".repeat(32);
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.ADMIN_EMAILS;
  delete process.env.SITE_URL;
  delete process.env.SMTP_USER; // a real send must be impossible in tests
  delete process.env.SMTP_APP_PASSWORD;
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const ORIGIN = "https://hackradar.test";
function fakeSend() {
  const send = vi.fn(async (_to: string, _link: string) => {});
  const lastToken = () => new URL(send.mock.calls.at(-1)![1]).searchParams.get("token")!;
  return { send, lastToken };
}

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/events/3")).toBe("/events/3");
    expect(safeNext("/events?q=a&b=c")).toBe("/events?q=a&b=c");
    // percent-encoded forms are inert in a Location header and stay as given
    expect(safeNext("/%2F%2Fevil.com")).toBe("/%2F%2Fevil.com");
    expect(safeNext("/%5Cevil.com")).toBe("/%5Cevil.com");
  });
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "", null, "evil.com", "/\t/evil.com", "/a\nb", "javascript:alert(1)", "/events?q=日本"])(
    "rejects %j",
    (v) => expect(safeNext(v as string | null)).toBe("/"),
  );
});

describe("email sign-in", () => {
  dbIt("a token works once, then returns null", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 });
      const token = lastToken();
      expect(await finishEmailLogin(token, T0 + MIN)).toMatchObject({ isNew: true });
      expect(await finishEmailLogin(token, T0 + MIN)).toBeNull();
    }));

  dbIt("expires after 15 minutes", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 });
      expect(await finishEmailLogin(lastToken(), T0 + 15 * MIN + 1000)).toBeNull();
      await startEmailLogin("b@example.com", { send, origin: ORIGIN, now: T0 });
      expect(await finishEmailLogin(lastToken(), T0 + 15 * MIN)).not.toBeNull();
    }));

  dbIt("limits sign-in links per IP but not for other IPs or the same IP after an hour", () =>
    withSchema(async () => {
      const { send } = fakeSend();
      const sent = vi.fn(send);
      for (let i = 0; i < MAX_TOKENS_PER_IP_PER_HOUR + 5; i++) {
        await startEmailLogin(`u${i}@example.com`, { send: sent, origin: ORIGIN, now: T0, ip: "203.0.113.7" });
      }
      expect(sent).toHaveBeenCalledTimes(MAX_TOKENS_PER_IP_PER_HOUR);
      await startEmailLogin("other@example.com", { send: sent, origin: ORIGIN, now: T0, ip: "203.0.113.8" });
      expect(sent).toHaveBeenCalledTimes(MAX_TOKENS_PER_IP_PER_HOUR + 1);
      await startEmailLogin("later@example.com", { send: sent, origin: ORIGIN, now: T0 + 61 * MIN, ip: "203.0.113.7" });
      expect(sent).toHaveBeenCalledTimes(MAX_TOKENS_PER_IP_PER_HOUR + 2);
      const [row] = await query<{ ip_hash: string }>("SELECT ip_hash FROM login_tokens ORDER BY id LIMIT 1");
      expect(row.ip_hash).not.toContain("203.0.113"); // only a hash is stored
    }));

  dbIt("rejects junk tokens", () =>
    withSchema(async () => {
      expect(await finishEmailLogin("nope", T0)).toBeNull();
      expect(await finishEmailLogin("", T0)).toBeNull();
    }));

  dbIt("a second start for the same address within 60 s sends once", () =>
    withSchema(async () => {
      const { send } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 });
      await startEmailLogin("A@Example.com ", { send, origin: ORIGIN, now: T0 + 59_000 });
      expect(send).toHaveBeenCalledTimes(1);
      await startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 + 61_000 });
      expect(send).toHaveBeenCalledTimes(2);
    }));

  dbIt("known and unknown addresses behave identically (same sends, same route response)", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("known@example.com", { send, origin: ORIGIN, now: T0 });
      await finishEmailLogin(lastToken(), T0 + 1000);
      send.mockClear();
      await startEmailLogin("known@example.com", { send, origin: ORIGIN, now: T0 + 5 * MIN });
      const knownSends = send.mock.calls.length;
      send.mockClear();
      await startEmailLogin("new@example.com", { send, origin: ORIGIN, now: T0 + 5 * MIN });
      expect(send.mock.calls.length).toBe(knownSends);
      const startPost = (email: string) =>
        route(
          new Request(`${ORIGIN}/api/auth/email/start`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email }),
          }),
        );
      // The earlier calls leave a token for this address; clear them so the 60 s per-address limit
      // (which answers 200 silently) does not stand in for the account check this test is about.
      await query("DELETE FROM login_tokens");
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const k = await startPost("known@example.com");
      const u = await startPost("other@example.com");
      log.mockRestore();
      expect(k.status).toBe(u.status);
      expect(await k.json()).toEqual(await u.json());
    }));

  dbIt("five parallel starts for one address send exactly once", () =>
    withSchema(async () => {
      const { send } = fakeSend();
      await Promise.all(
        Array.from({ length: 5 }, () => startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 })),
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(await query("SELECT 1 FROM login_tokens")).toHaveLength(1);
    }));

  dbIt("a failed send releases the address so it can retry immediately", () =>
    withSchema(async () => {
      const bad = vi.fn(async () => {
        throw new Error("smtp down");
      });
      await expect(startEmailLogin("a@example.com", { send: bad, origin: ORIGIN, now: T0 })).rejects.toThrow("smtp down");
      expect(await query("SELECT 1 FROM login_tokens")).toHaveLength(0);
      const { send } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 + 1000 });
      expect(send).toHaveBeenCalledTimes(1);
    }));

  dbIt("an invalid address resolves without sending or storing", () =>
    withSchema(async () => {
      const { send } = fakeSend();
      expect(await startEmailLogin("not-an-email", { send, origin: ORIGIN, now: T0 })).toBeUndefined();
      expect(send).not.toHaveBeenCalled();
      expect(await query("SELECT 1 FROM login_tokens")).toHaveLength(0);
    }));

  dbIt("stores only the token hash and an encrypted address", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("Me@Example.com", { send, origin: ORIGIN, now: T0 });
      const token = lastToken();
      const [row] = await query<{ token_hash: string; email_enc: string; email_hash: string }>(
        "SELECT token_hash, email_enc, email_hash FROM login_tokens",
      );
      expect(row.token_hash).not.toBe(token);
      expect(row.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
      expect(row.email_enc).not.toContain("example.com");
      expect(decrypt(row.email_enc, keyFromEnv())).toBe("me@example.com");
      expect(row.email_hash).toBe(blindIndex("me@example.com", keyFromEnv()));
      expect(send.mock.calls[0][0]).toBe("me@example.com");
    }));

  dbIt("creates a user named Member with encrypted email and default preferences; reuses it later", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 });
      const first = await finishEmailLogin(lastToken(), T0 + 1000);
      expect(first).toEqual({ uid: expect.any(Number), isNew: true, email: "a@example.com", name: "Member" });
      const [u] = await query<{ name: string; email_enc: string }>("SELECT name, email_enc FROM users WHERE id = $1", [
        first!.uid,
      ]);
      expect(u.name).toBe("Member");
      expect(u.email_enc).not.toContain("example.com");
      expect(decrypt(u.email_enc, keyFromEnv())).toBe("a@example.com");
      expect(await query("SELECT 1 FROM preferences WHERE user_id = $1", [first!.uid])).toHaveLength(1);

      await startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 + 5 * MIN });
      const second = await finishEmailLogin(lastToken(), T0 + 5 * MIN + 1000);
      expect(second).toEqual({ uid: first!.uid, isNew: false });
      expect(await query("SELECT 1 FROM users")).toHaveLength(1);
      expect(await query("SELECT 1 FROM preferences")).toHaveLength(1);
    }));

  dbIt("each successful finish adds exactly one email login row and sets last_login_at", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 });
      const r = await finishEmailLogin(lastToken(), T0 + 1000);
      expect(await query("SELECT method FROM logins")).toEqual([{ method: "email" }]);
      await finishEmailLogin(lastToken(), T0 + 2000); // replay fails and adds nothing
      expect(await query("SELECT 1 FROM logins")).toHaveLength(1);
      const [u] = await query<{ last_login_at: Date | null }>("SELECT last_login_at FROM users WHERE id = $1", [r!.uid]);
      expect(u.last_login_at).not.toBeNull();
    }));

  dbIt("recordLogin inserts a row for either method", () =>
    withSchema(async () => {
      const [u] = await query<{ id: number }>("INSERT INTO users (name) VALUES ('x') RETURNING id");
      await recordLogin(u.id, "discord");
      expect(await query("SELECT method FROM logins")).toEqual([{ method: "discord" }]);
    }));

  dbIt("grants is_admin to listed addresses at every sign-in and never revokes", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      process.env.ADMIN_EMAILS = " other@example.com , Boss@Example.com ";
      await startEmailLogin("boss@example.com", { send, origin: ORIGIN, now: T0 });
      const boss = await finishEmailLogin(lastToken(), T0 + 1000);
      await startEmailLogin("plain@example.com", { send, origin: ORIGIN, now: T0 });
      const plain = await finishEmailLogin(lastToken(), T0 + 1000);
      const admins = async () =>
        (await query<{ id: number; is_admin: boolean }>("SELECT id, is_admin FROM users"))
          .filter((r) => r.is_admin)
          .map((r) => Number(r.id));
      expect(await admins()).toEqual([boss!.uid]);
      // listed later: granted on the next sign-in; an unset list never revokes
      process.env.ADMIN_EMAILS = "plain@example.com";
      await startEmailLogin("plain@example.com", { send, origin: ORIGIN, now: T0 + 5 * MIN });
      await finishEmailLogin(lastToken(), T0 + 5 * MIN + 1000);
      delete process.env.ADMIN_EMAILS;
      await startEmailLogin("plain@example.com", { send, origin: ORIGIN, now: T0 + 10 * MIN });
      await finishEmailLogin(lastToken(), T0 + 10 * MIN + 1000);
      expect((await admins()).sort()).toEqual([boss!.uid, plain!.uid].sort());
    }));

  dbIt("sends nothing once 200 tokens were created in the last hour", () =>
    withSchema(async () => {
      const { send } = fakeSend();
      await query(
        `INSERT INTO login_tokens (email_hash, token_hash, expires_at, created_at)
         SELECT 'h' || g, 't' || g, $1::timestamptz, $2::timestamptz FROM generate_series(1, 200) g`,
        [new Date(T0 + 15 * MIN), new Date(T0 - 5 * MIN)],
      );
      await expect(startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 })).resolves.toBeUndefined();
      expect(send).not.toHaveBeenCalled();
      // an hour later the old tokens no longer count
      await startEmailLogin("a@example.com", { send, origin: ORIGIN, now: T0 + 61 * MIN });
      expect(send).toHaveBeenCalledTimes(1);
    }));

  dbIt("findUser returns the public profile or null", () =>
    withSchema(async () => {
      const [row] = await query<{ id: number }>(
        "INSERT INTO users (name, onboarded_at) VALUES ('Ann', now()) RETURNING id",
      );
      const u = { id: Number(row.id) }; // pg returns bigint as a string
      expect(await findUser(u.id)).toEqual({ uid: u.id, name: "Ann", onboarded: true, isAdmin: false });
      expect(await findUser(u.id + 999)).toBeNull();
    }));
});

describe("auth routes", () => {
  const post = (path: string, body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
    route(new Request(`${ORIGIN}${path}`, { method: "POST", body, headers }));

  it("start: 415 without a JSON content type", async () => {
    const res = await post("/api/auth/email/start", '{"email":"a@example.com"}', { "content-type": "text/plain" });
    expect(res.status).toBe(415);
  });
  it("start: 400 for an invalid email, bad JSON or an oversize body", async () => {
    expect((await post("/api/auth/email/start", '{"email":"nope"}')).status).toBe(400);
    expect((await post("/api/auth/email/start", "{")).status).toBe(400);
    const big = JSON.stringify({ email: "a@example.com", pad: "x".repeat(3000) });
    expect((await post("/api/auth/email/start", big)).status).toBe(400);
  });
  it("isBadRecipient: recipient refusals only, not our own SMTP failures", () => {
    expect(isBadRecipient(Object.assign(new Error("x"), { code: "EENVELOPE" }))).toBe(true);
    expect(isBadRecipient(Object.assign(new Error("x"), { responseCode: 550 }))).toBe(true);
    expect(isBadRecipient(Object.assign(new Error("x"), { responseCode: 535 }))).toBe(false); // bad SMTP login
    expect(isBadRecipient(new Error("connection refused"))).toBe(false);
    expect(isBadRecipient("550")).toBe(false);
  });
  dbIt("start: 502 when mail cannot be sent, and the log never holds the address", () =>
    withSchema(async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await post("/api/auth/email/start", '{"email":"a@example.com","next":"/events/3"}');
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "could not send email" });
      // SMTP is unconfigured in tests, so the failure is logged by class name only
      expect(log.mock.calls.flat().join(" ")).not.toContain("example.com");
      log.mockRestore();
    }));

  const verifyPost = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
    post("/api/auth/email/verify", typeof body === "string" ? body : JSON.stringify(body), headers);
  const getVerify = (token: string, next?: string) =>
    route(
      new Request(`${ORIGIN}/api/auth/email/verify?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ""}`),
    );

  it("verify GET: a bad token redirects to /signin?error=expired with no-store", async () => {
    const res = await getVerify("");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/signin?error=expired");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("verify: other methods are not routed", async () => {
    const res = await route(new Request(`${ORIGIN}/api/auth/email/verify?token=x`, { method: "DELETE" }));
    expect(res.status).toBe(404);
  });
  dbIt("verify GET only validates: redirects to the confirm page and leaves the token usable", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN });
      const t = lastToken();
      for (let i = 0; i < 2; i++) {
        const res = await getVerify(t, "/events/3");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(`/signin/confirm?token=${t}&next=${encodeURIComponent("/events/3")}`);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(res.headers.get("set-cookie")).toBeNull();
      }
      expect(await query("SELECT 1 FROM logins")).toHaveLength(0);
      expect(await query("SELECT 1 FROM users")).toHaveLength(0);
      const evil = await getVerify(t, "//evil.com");
      expect(evil.headers.get("location")).toBe(`/signin/confirm?token=${t}&next=%2F`);
      expect(await finishEmailLogin(t)).not.toBeNull(); // still usable afterwards
    }));
  dbIt("verify POST: consumes once, sets a hardened cookie, records one login, returns next", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN });
      const t = lastToken();
      const res = await verifyPost({ token: t, next: "/events/3" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, next: "/events/3" });
      const cookie = res.headers.get("set-cookie")!;
      expect(cookie).toMatch(/^hr_session=/);
      for (const attr of ["HttpOnly", "Secure", "SameSite=Lax"]) expect(cookie).toContain(attr);
      expect(readSession(cookie.split(";")[0], process.env.SESSION_SECRET!)).not.toBeNull();
      expect(await query("SELECT method FROM logins")).toEqual([{ method: "email" }]);
      const again = await verifyPost({ token: t });
      expect(again.status).toBe(400);
      expect(await again.json()).toEqual({ ok: false });
      expect(again.headers.get("set-cookie")).toBeNull();
      expect(await query("SELECT 1 FROM logins")).toHaveLength(1);
    }));
  dbIt("verify POST: //evil.com and non-ASCII next become /", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN });
      const r1 = await verifyPost({ token: lastToken(), next: "//evil.com" });
      expect(await r1.json()).toEqual({ ok: true, next: "/" });
      await startEmailLogin("b@example.com", { send, origin: ORIGIN });
      const r2 = await verifyPost({ token: lastToken(), next: "/events?q=日本" });
      expect(await r2.json()).toEqual({ ok: true, next: "/" });
    }));
  dbIt("verify POST: an expired token fails", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN, now: Date.now() - 20 * MIN });
      const res = await verifyPost({ token: lastToken() });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false });
    }));
  dbIt("verify POST: a missing SESSION_SECRET fails without consuming the token", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN });
      const t = lastToken();
      const secret = process.env.SESSION_SECRET;
      delete process.env.SESSION_SECRET;
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await verifyPost({ token: t });
      log.mockRestore();
      process.env.SESSION_SECRET = secret;
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false });
      expect((await getVerify(t)).headers.get("location")).toMatch(/^\/signin\/confirm/);
      expect(await finishEmailLogin(t)).not.toBeNull();
    }));
  it("verify POST: 415 without JSON, 400 on a bad body", async () => {
    expect((await verifyPost({ token: "x" }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await verifyPost("{")).status).toBe(400);
  });

  it("me: 401 without a cookie", async () => {
    const res = await route(new Request(`${ORIGIN}/api/me`));
    expect(res.status).toBe(401);
  });
  dbIt("me: 200 profile for a valid cookie; 401 once the user is gone", () =>
    withSchema(async () => {
      const [row] = await query<{ id: number }>("INSERT INTO users (name) VALUES ('Ann') RETURNING id");
      const u = { id: Number(row.id) };
      const cookie = (uid: number) => `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!)}`;
      const ok = await route(new Request(`${ORIGIN}/api/me`, { headers: { cookie: cookie(u.id) } }));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ uid: u.id, name: "Ann", onboarded: false, isAdmin: false });
      const gone = await route(new Request(`${ORIGIN}/api/me`, { headers: { cookie: cookie(u.id + 999) } }));
      expect(gone.status).toBe(401);
    }));

  dbIt("logout-all: cookies issued before it stop working, new ones work", () =>
    withSchema(async () => {
      const [row] = await query<{ id: number }>("INSERT INTO users (name) VALUES ('Ann') RETURNING id");
      const uid = Number(row.id);
      const cookie = (iat: number) => `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!, iat)}`;
      const old = cookie(Date.now() - 1000);
      const out = await route(new Request(`${ORIGIN}/api/auth/logout-all`, { method: "POST", headers: { cookie: old, "content-type": "application/json" }, body: "{}" }));
      expect(out.status).toBe(200);
      expect(out.headers.get("set-cookie")).toMatch(/^hr_session=;.*Max-Age=0/);
      expect((await route(new Request(`${ORIGIN}/api/me`, { headers: { cookie: old } }))).status).toBe(401);
      expect((await route(new Request(`${ORIGIN}/api/me`, { headers: { cookie: cookie(Date.now() + 1000) } }))).status).toBe(200);
    }));

  dbIt("delete account: needs the confirm word, removes the user and their data", () =>
    withSchema(async () => {
      const [row] = await query<{ id: number }>("INSERT INTO users (name) VALUES ('Ann') RETURNING id");
      const uid = Number(row.id);
      await query("INSERT INTO preferences (user_id) VALUES ($1)", [uid]);
      const cookie = `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!)}`;
      const del = (body: string) =>
        route(new Request(`${ORIGIN}/api/me`, { method: "DELETE", headers: { cookie, "content-type": "application/json" }, body }));
      expect((await del("{}")).status).toBe(400);
      expect((await query("SELECT 1 FROM users WHERE id = $1", [uid])).length).toBe(1);
      expect((await del('{"confirm":"delete"}')).status).toBe(200);
      expect((await query("SELECT 1 FROM users WHERE id = $1", [uid])).length).toBe(0);
      expect((await query("SELECT 1 FROM preferences WHERE user_id = $1", [uid])).length).toBe(0);
      expect((await del('{"confirm":"delete"}')).status).toBe(401);
    }));

  it("delete account and logout-all: 401 without a cookie", async () => {
    expect((await post("/api/auth/logout-all", "{}")).status).toBe(401);
    const res = await route(new Request(`${ORIGIN}/api/me`, { method: "DELETE", headers: { "content-type": "application/json" }, body: '{"confirm":"delete"}' }));
    expect(res.status).toBe(401);
  });

  it("logout: clears the cookie; 415 without JSON", async () => {
    const res = await post("/api/auth/logout", "{}");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^hr_session=;.*Max-Age=0/);
    expect((await post("/api/auth/logout", "{}", { "content-type": "text/plain" })).status).toBe(415);
  });
});
