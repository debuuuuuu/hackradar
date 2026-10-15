import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findUser, finishEmailLogin, recordLogin, safeNext, startEmailLogin } from "../server/auth.js";
import { blindIndex, decrypt, keyFromEnv } from "../server/crypto.js";
import { query } from "../server/db.js";
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
  });
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "", null, "evil.com", "/\t/evil.com", "/a\nb", "javascript:alert(1)"])(
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

  dbIt("known and unknown addresses resolve identically", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("known@example.com", { send, origin: ORIGIN, now: T0 });
      await finishEmailLogin(lastToken(), T0 + 1000);
      const known = await startEmailLogin("known@example.com", { send, origin: ORIGIN, now: T0 + 5 * MIN });
      const unknown = await startEmailLogin("new@example.com", { send, origin: ORIGIN, now: T0 + 5 * MIN });
      expect(known).toBeUndefined();
      expect(unknown).toBeUndefined();
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
      expect(first).toEqual({ uid: expect.any(Number), isNew: true });
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

  dbIt("sends nothing once more than 200 tokens were created in the last hour", () =>
    withSchema(async () => {
      const { send } = fakeSend();
      await query(
        `INSERT INTO login_tokens (email_hash, token_hash, expires_at, created_at)
         SELECT 'h' || g, 't' || g, $1::timestamptz, $2::timestamptz FROM generate_series(1, 201) g`,
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
  dbIt("start: always 200 {ok:true} for a valid address, even when mail cannot be sent", () =>
    withSchema(async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await post("/api/auth/email/start", '{"email":"a@example.com","next":"/events/3"}');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      // SMTP is unconfigured in tests, so the failure is logged by class name only
      expect(log.mock.calls.flat().join(" ")).not.toContain("example.com");
      log.mockRestore();
    }));

  it("verify: only GET", async () => {
    const res = await route(new Request(`${ORIGIN}/api/auth/email/verify?token=x`, { method: "POST" }));
    expect(res.status).toBe(404);
  });
  it("verify: a bad token redirects to /signin?error=expired with no-store", async () => {
    const res = await route(new Request(`${ORIGIN}/api/auth/email/verify?token=`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/signin?error=expired");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  dbIt("verify: sets the session cookie and redirects to safeNext(next)", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN });
      const t = lastToken();
      const url = `${ORIGIN}/api/auth/email/verify?token=${t}&next=${encodeURIComponent("//evil.com")}`;
      const res = await route(new Request(url));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
      expect(res.headers.get("cache-control")).toBe("no-store");
      const cookie = res.headers.get("set-cookie")!;
      expect(cookie).toMatch(/^hr_session=/);
      expect(readSession(cookie.split(";")[0], process.env.SESSION_SECRET!)).not.toBeNull();
      // the link is single use
      const again = await route(new Request(`${ORIGIN}/api/auth/email/verify?token=${t}`));
      expect(again.headers.get("location")).toBe("/signin?error=expired");
    }));
  dbIt("verify: keeps a safe next", () =>
    withSchema(async () => {
      const { send, lastToken } = fakeSend();
      await startEmailLogin("a@example.com", { send, origin: ORIGIN });
      const res = await route(new Request(`${ORIGIN}/api/auth/email/verify?token=${lastToken()}&next=%2Fevents%2F3`));
      expect(res.headers.get("location")).toBe("/events/3");
    }));

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

  it("logout: clears the cookie; 415 without JSON", async () => {
    const res = await post("/api/auth/logout", "{}");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^hr_session=;.*Max-Age=0/);
    expect((await post("/api/auth/logout", "{}", { "content-type": "text/plain" })).status).toBe(415);
  });
});
