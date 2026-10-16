import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "../server/db.js";
import { decrypt, encrypt, keyFromEnv } from "../server/crypto.js";
import { DEFAULT_PREFS } from "../server/prefs.js";
import { route } from "../server/router.js";
import { signSession } from "../server/session.js";
import { dbIt, withSchema } from "./helpers.js";

const HOOK = "https://discord.com/api/webhooks/123456789/SECRETTOKEN_abc-1";
const HOOK2 = "https://discordapp.com/api/webhooks/987/OTHER_token";
const ORIGIN = "https://hackradar.test";

const ENV = ["SESSION_SECRET", "ENCRYPTION_KEY"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SESSION_SECRET = "s".repeat(32);
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function newUser(): Promise<number> {
  await query("INSERT INTO places (key, name, lat, lon) VALUES ('pune','Pune',18.5,73.8)");
  const [row] = await query<{ id: number }>(
    `WITH u AS (INSERT INTO users (name) VALUES ('Ann') RETURNING id),
          p AS (INSERT INTO preferences (user_id) SELECT id FROM u)
     SELECT id FROM u`,
  );
  return Number(row.id);
}

const cookie = (uid: number) => `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!)}`;
const send = (method: string, path: string, uid: number | null, body?: unknown, ct = "application/json") =>
  route(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { ...(uid === null ? {} : { cookie: cookie(uid) }), ...(body === undefined ? {} : { "content-type": ct }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
const put = (uid: number, contact: unknown) => send("PUT", "/api/me/prefs", uid, { prefs: DEFAULT_PREFS, contact });
const testHook = (uid: number | null) => send("POST", "/api/me/prefs/test-discord", uid, {});
const stored = async (uid: number) => (await query<{ d: string | null }>("SELECT discord_webhook_enc AS d FROM users WHERE id = $1", [uid]))[0].d;

describe("discord webhook save and read", () => {
  dbIt("saves a valid webhook encrypted, reports only a set flag, never returns the URL", () =>
    withSchema(async () => {
      const uid = await newUser();
      expect((await put(uid, { discordWebhook: HOOK })).status).toBe(200);
      const enc = await stored(uid);
      expect(enc).not.toBeNull();
      expect(enc).not.toContain("SECRETTOKEN");
      expect(decrypt(enc as string, keyFromEnv())).toBe(HOOK);

      const text = await (await send("GET", "/api/me/prefs", uid)).text();
      expect(text).not.toContain("SECRETTOKEN");
      expect(text).not.toContain("discord.com/api");
      expect(JSON.parse(text).contact.discordWebhookSet).toBe(true);
    }));

  dbIt("rejects an invalid webhook with 400 and stores nothing", () =>
    withSchema(async () => {
      const uid = await newUser();
      for (const bad of ["https://evil.com/api/webhooks/1/tok", "http://discord.com/api/webhooks/1/tok", `${HOOK}?wait=true`, 5]) {
        const res = await put(uid, { discordWebhook: bad });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string; field: string };
        expect(body.field).toBe("discordWebhook");
        expect(JSON.stringify(body)).not.toContain("evil.com");
      }
      expect(await stored(uid)).toBeNull();
    }));

  dbIt("omitted leaves it, a new value replaces it, empty string clears it", () =>
    withSchema(async () => {
      const uid = await newUser();
      await put(uid, { discordWebhook: HOOK });
      await put(uid, { phone: "" });
      expect(decrypt((await stored(uid)) as string, keyFromEnv())).toBe(HOOK);
      await put(uid, { discordWebhook: HOOK2 });
      expect(decrypt((await stored(uid)) as string, keyFromEnv())).toBe(HOOK2);
      expect((await put(uid, { discordWebhook: "  " })).status).toBe(200);
      expect(await stored(uid)).toBeNull();
      const got = (await (await send("GET", "/api/me/prefs", uid)).json()) as { contact: { discordWebhookSet: boolean } };
      expect(got.contact.discordWebhookSet).toBe(false);
    }));
});

describe("POST /api/me/prefs/test-discord", () => {
  it("401 without a session", async () => {
    expect((await testHook(null)).status).toBe(401);
  });

  dbIt("415 without a JSON content type", () =>
    withSchema(async () => {
      const uid = await newUser();
      expect((await send("POST", "/api/me/prefs/test-discord", uid, {}, "text/plain")).status).toBe(415);
    }));

  dbIt("reports not-ok without calling out when no webhook is saved", () =>
    withSchema(async () => {
      const uid = await newUser();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(await (await testHook(uid)).json()).toMatchObject({ ok: false });
      expect(fetchMock).not.toHaveBeenCalled();
    }));

  dbIt("posts the test message with a timeout and no redirects; the URL never appears in the response or logs", () =>
    withSchema(async () => {
      const uid = await newUser();
      await put(uid, { discordWebhook: HOOK });
      const logs = vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", fetchMock);
      const text = await (await testHook(uid)).text();
      expect(JSON.parse(text)).toEqual({ ok: true });
      expect(text).not.toContain("SECRETTOKEN");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(HOOK);
      expect(init.method).toBe("POST");
      expect(init.redirect).toBe("error");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(init.body as string)).toEqual({ content: "HackRadar test message. If you see this, your webhook works." });
      expect(JSON.stringify(logs.mock.calls)).not.toContain("SECRETTOKEN");
    }));

  dbIt("a refused redirect, an HTTP error and a network error all give a generic not-ok with no URL", () =>
    withSchema(async () => {
      const uid = await newUser();
      await put(uid, { discordWebhook: HOOK });
      const logs = vi.spyOn(console, "error").mockImplementation(() => {});
      const failures: Array<() => Promise<Response>> = [
        async () => {
          throw new TypeError(`redirect mode is set to error: ${HOOK}`);
        },
        async () => new Response("nope", { status: 404 }),
        async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }),
        async () => {
          throw new Error(`connect ECONNREFUSED ${HOOK}`);
        },
      ];
      for (const f of failures) {
        vi.stubGlobal("fetch", vi.fn(f));
        const text = await (await testHook(uid)).text();
        const body = JSON.parse(text) as { ok: boolean; reason: string };
        expect(body.ok).toBe(false);
        expect(typeof body.reason).toBe("string");
        expect(text).not.toContain("SECRETTOKEN");
        expect(text).not.toContain("169.254");
      }
      expect(JSON.stringify(logs.mock.calls)).not.toContain("SECRETTOKEN");
    }));

  dbIt("refuses a stored value that no longer passes validation", () =>
    withSchema(async () => {
      const uid = await newUser();
      await query("UPDATE users SET discord_webhook_enc = $2 WHERE id = $1", [uid, encrypt("https://evil.com/x", keyFromEnv())]);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(await (await testHook(uid)).json()).toMatchObject({ ok: false });
      expect(fetchMock).not.toHaveBeenCalled();
    }));
});
