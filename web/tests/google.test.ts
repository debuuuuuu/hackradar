import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInWithGoogle } from "../server/auth.js";
import { oauthCookie } from "../server/discord.js";
import { query } from "../server/db.js";
import { authorizeUrl, exchangeCode, GOOGLE_COOKIE_PATH } from "../server/google.js";
import { route } from "../server/router.js";
import { readSession } from "../server/session.js";
import { dbIt, withSchema } from "./helpers.js";

const ENV = ["SESSION_SECRET", "ENCRYPTION_KEY", "SITE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SMTP_USER", "SMTP_APP_PASSWORD"] as const;
const saved: Record<string, string | undefined> = {};
const SECRET = "s".repeat(32);
const ORIGIN = "https://hackradar.test";
const REDIRECT = `${ORIGIN}/api/auth/google/callback`;

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SESSION_SECRET = SECRET;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  delete process.env.SITE_URL;
  delete process.env.SMTP_USER; // a real send must be impossible in tests
  delete process.env.SMTP_APP_PASSWORD;
  process.env.GOOGLE_CLIENT_ID = "gid-123";
  process.env.GOOGLE_CLIENT_SECRET = "gsecret-xyz";
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

/** Fake Google: token endpoint then userinfo endpoint. */
function fakeGoogle(me: Record<string, unknown>, tokenStatus = 200) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) return tokenStatus === 200 ? jsonRes({ access_token: "tok" }) : jsonRes({}, tokenStatus);
    if (u.includes("openidconnect.googleapis.com")) return jsonRes(me);
    throw new Error("unexpected url " + u);
  }) as unknown as typeof fetch;
}

describe("google sign-in", () => {
  it("authorizeUrl carries client id, openid email scope, redirect and state", () => {
    const u = new URL(authorizeUrl("st4te", REDIRECT));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe("gid-123");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("state")).toBe("st4te");
    expect(u.searchParams.get("client_secret")).toBeNull();
  });

  it("exchangeCode returns a verified email and a cleaned name", async () => {
    const f = fakeGoogle({ email: "Ann@Example.com", email_verified: true, name: "  Ann\u0007 Lee " });
    expect(await exchangeCode("code", REDIRECT, f)).toEqual({ email: "Ann@Example.com", name: "Ann Lee" });
  });

  it("exchangeCode refuses an unverified email, a failed token call, and never leaks response text", async () => {
    await expect(exchangeCode("c", REDIRECT, fakeGoogle({ email: "a@example.com", email_verified: false }))).rejects.toThrow("google exchange failed");
    await expect(exchangeCode("c", REDIRECT, fakeGoogle({ email: "a@example.com" }))).rejects.toThrow("google exchange failed");
    await expect(exchangeCode("c", REDIRECT, fakeGoogle({}, 400))).rejects.toThrow("google exchange failed");
    await exchangeCode("c", REDIRECT, fakeGoogle({}, 400)).catch((e: Error) => {
      expect(e.message).not.toContain("gsecret");
    });
  });

  it("callback with a missing or wrong state cookie redirects to /signin?error=state and sets no session", async () => {
    const res = await route(new Request(`${ORIGIN}/api/auth/google/callback?code=abc&state=nope`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/signin?error=state");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("hr_session");
  });

  it("start redirects to Google with a state cookie scoped to the google path", async () => {
    const res = await route(new Request(`${ORIGIN}/api/auth/google/start?next=/events/3`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");
    expect(res.headers.get("set-cookie")).toContain(`Path=${GOOGLE_COOKIE_PATH}`);
  });

  it("start without Google configured goes back to sign-in with an error", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await route(new Request(`${ORIGIN}/api/auth/google/start`));
    expect(res.headers.get("location")).toBe("/signin?error=google");
  });

  it("providers reports google only when configured", async () => {
    expect(await (await route(new Request(`${ORIGIN}/api/auth/providers`))).json()).toMatchObject({ google: true });
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(await (await route(new Request(`${ORIGIN}/api/auth/providers`))).json()).toMatchObject({ google: false });
  });

  dbIt("creates one account per email: Google lands on the account the email link made", () =>
    withSchema(async () => {
      const first = await signInWithGoogle("Ann@Example.com", "Ann Lee");
      expect(first).toMatchObject({ isNew: true, email: "ann@example.com" });
      const again = await signInWithGoogle("ann@example.com ", "Someone Else");
      expect(again).toEqual({ uid: first!.uid, isNew: false });
      const [u] = await query<{ name: string; n: string }>("SELECT name, (SELECT count(*) FROM users) AS n FROM users WHERE id = $1", [first!.uid]);
      expect(u.name).toBe("Ann Lee"); // the first name stays; a later sign-in does not rename
      expect(Number(u.n)).toBe(1);
      const logins = await query<{ method: string }>("SELECT method FROM logins WHERE user_id = $1", [first!.uid]);
      expect(logins.map((l) => l.method)).toEqual(["google", "google"]);
      expect(await signInWithGoogle("not-an-email", "x")).toBeNull();
    }));

  dbIt("full callback: valid state signs in, sets a session cookie and redirects to next", () =>
    withSchema(async () => {
      vi.stubGlobal("fetch", fakeGoogle({ email: "ann@example.com", email_verified: true, name: "Ann" }));
      const cookie = oauthCookie("goodstate", "/events/3", SECRET, GOOGLE_COOKIE_PATH).split(";")[0];
      const res = await route(
        new Request(`${ORIGIN}/api/auth/google/callback?code=abc&state=goodstate`, { headers: { cookie } }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/events/3");
      const setCookie = res.headers.get("set-cookie") ?? "";
      const session = /hr_session=([^;]+)/.exec(setCookie);
      expect(session).not.toBeNull();
      expect(readSession(`hr_session=${session![1]}`, SECRET)?.uid).toBeGreaterThan(0);
    }));
});
