import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encrypt, keyFromEnv } from "../server/crypto.js";
import { query } from "../server/db.js";
import {
  DEFAULT_PREFS,
  getPrefs,
  savePrefs,
  TOPICS,
  validateContact,
  validatePrefs,
  ValidationError,
  type Prefs,
} from "../server/prefs.js";
import { route } from "../server/router.js";
import { signSession } from "../server/session.js";
import { dbIt, withSchema } from "./helpers.js";

const ENV = ["SESSION_SECRET", "ENCRYPTION_KEY"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SESSION_SECRET = "s".repeat(32);
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const ORIGIN = "https://hackradar.test";

async function seedPlaces(): Promise<void> {
  await query("INSERT INTO places (key, name, lat, lon) VALUES ('pune','Pune',18.5,73.8),('mumbai','Mumbai',19.0,72.8)");
}

/** A user with its default preferences row, like production creates them. */
async function newUser(opts: { emailHash?: string; name?: string } = {}): Promise<number> {
  const [row] = await query<{ id: number }>(
    `WITH u AS (INSERT INTO users (name, email_hash) VALUES ($1, $2) RETURNING id),
          p AS (INSERT INTO preferences (user_id) SELECT id FROM u)
     SELECT id FROM u`,
    [opts.name ?? "Ann", opts.emailHash ?? null],
  );
  return Number(row.id);
}

const cookie = (uid: number) => `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!)}`;
const call = (method: string, uid: number | null, body?: unknown, headers: Record<string, string> = {}) =>
  route(
    new Request(`${ORIGIN}/api/me/prefs`, {
      method,
      headers: {
        ...(uid === null ? {} : { cookie: cookie(uid) }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const valid = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...over });

describe("validatePrefs", () => {
  dbIt("accepts the defaults and a full set of topics", () =>
    withSchema(async () => {
      await seedPlaces();
      expect(await validatePrefs(DEFAULT_PREFS)).toEqual(DEFAULT_PREFS);
      const all = await validatePrefs(valid({ topics: [...TOPICS] }));
      expect(all.topics).toHaveLength(8);
    }));

  dbIt("rejects bad values and names the field", () =>
    withSchema(async () => {
      await seedPlaces();
      const field = async (p: unknown) => {
        try {
          await validatePrefs(p);
        } catch (e) {
          expect(e).toBeInstanceOf(ValidationError);
          return (e as ValidationError).field;
        }
        return null;
      };
      expect(await field(null)).toBe("prefs");
      expect(await field({ ...DEFAULT_PREFS, priorities: { ...DEFAULT_PREFS.priorities, hackathon: "high" } })).toBe("priorities");
      expect(await field({ ...DEFAULT_PREFS, topics: ["underwater-basketweaving"] })).toBe("topics");
      expect(await field({ ...DEFAULT_PREFS, topics: ["web", "web"] })).toBe("topics");
      expect(await field({ ...DEFAULT_PREFS, topics: [...TOPICS, "ai-ml"] })).toBe("topics");
      expect(await field({ ...DEFAULT_PREFS, homeCity: "atlantis" })).toBe("homeCity");
      expect(await field({ ...DEFAULT_PREFS, radiusKm: 7 })).toBe("radiusKm");
      expect(await field({ ...DEFAULT_PREFS, format: "hybrid" })).toBe("format");
      expect(await field({ ...DEFAULT_PREFS, includeSocial: "yes" })).toBe("includeSocial");
      expect(await field({ ...DEFAULT_PREFS, channels: { ...DEFAULT_PREFS.channels, ping: ["sms"] } })).toBe("channels");
    }));
});

describe("validateContact", () => {
  it("passes absent fields through and rejects bad shapes", () => {
    expect(validateContact(undefined)).toEqual({});
    expect(validateContact({ email: " A@Example.com ", phone: "+91 98765-43210", callmebotKey: "ab_1-2" })).toEqual({
      email: "a@example.com",
      phone: "+91 98765-43210",
      callmebotKey: "ab_1-2",
    });
    expect(validateContact({ email: "", phone: "", callmebotKey: "" })).toEqual({ email: "", phone: "", callmebotKey: "" });
    const field = (c: unknown) => {
      try {
        validateContact(c);
      } catch (e) {
        return (e as ValidationError).field;
      }
      return null;
    };
    expect(field({ email: "nope" })).toBe("email");
    expect(field({ email: `${"a".repeat(250)}@x.io` })).toBe("email");
    expect(field({ phone: "12345" })).toBe("phone");
    expect(field({ phone: "call me maybe" })).toBe("phone");
    expect(field({ callmebotKey: "has space" })).toBe("callmebotKey");
    expect(field({ callmebotKey: "x".repeat(65) })).toBe("callmebotKey");
  });
});

describe("getPrefs and savePrefs", () => {
  dbIt("a fresh user gets the defaults", () =>
    withSchema(async () => {
      const uid = await newUser();
      const got = await getPrefs(uid);
      expect(got).toEqual({
        ...DEFAULT_PREFS,
        contact: { email: null, emailLocked: false, phone: null, hasCallmebotKey: false },
      });
      expect(await getPrefs(uid + 999)).toBeNull();
    }));

  dbIt("round-trips prefs and contact, with ciphertext in the columns", () =>
    withSchema(async () => {
      await seedPlaces();
      const uid = await newUser();
      const prefs = valid({
        homeCity: "mumbai",
        radiusKm: 300,
        format: "anything",
        topics: ["ai-ml", "security"],
        includeSocial: false,
        priorities: { hackathon: "normal", contest: "top", workshop: "normal", fest: "off" },
        channels: { digest: ["whatsapp"], ping: [], reminders: ["email"] },
      });
      await savePrefs(uid, prefs, { email: "ann@example.com", phone: "+91 98765 43210", callmebotKey: "k3y-123" });
      const got = (await getPrefs(uid))!;
      const { contact, ...rest } = got;
      expect(rest).toEqual(prefs);
      expect(contact).toEqual({ email: "ann@example.com", emailLocked: false, phone: "+91 98765 43210", hasCallmebotKey: true });
      expect(JSON.stringify(got)).not.toContain("k3y-123");

      const [raw] = await query<{ email_enc: string; callmebot_phone_enc: string; callmebot_key_enc: string; email_hash: string | null }>(
        "SELECT email_enc, callmebot_phone_enc, callmebot_key_enc, email_hash FROM users WHERE id = $1",
        [uid],
      );
      expect(raw.email_enc).toMatch(/^v1:/);
      expect(raw.callmebot_phone_enc).toMatch(/^v1:/);
      expect(raw.callmebot_key_enc).toMatch(/^v1:/);
      expect(raw.callmebot_phone_enc).not.toContain("98765");
      expect(raw.callmebot_key_enc).not.toContain("k3y-123");
      expect(raw.email_enc).not.toContain("ann@example.com");
      expect(raw.email_hash).toBeNull();
    }));

  dbIt("omitted contact leaves stored data; empty string clears", () =>
    withSchema(async () => {
      await seedPlaces();
      const uid = await newUser();
      await savePrefs(uid, valid(), { email: "ann@example.com", phone: "+91 98765 43210", callmebotKey: "k3y" });
      await savePrefs(uid, valid({ radiusKm: 50 }));
      let got = (await getPrefs(uid))!;
      expect(got.radiusKm).toBe(50);
      expect(got.contact).toMatchObject({ email: "ann@example.com", phone: "+91 98765 43210", hasCallmebotKey: true });
      await savePrefs(uid, valid(), { email: "", phone: "", callmebotKey: "" });
      got = (await getPrefs(uid))!;
      expect(got.contact).toEqual({ email: null, emailLocked: false, phone: null, hasCallmebotKey: false });
    }));

  dbIt("sets onboarded_at once and leaves it afterwards", () =>
    withSchema(async () => {
      await seedPlaces();
      const uid = await newUser();
      const stamp = async () =>
        (await query<{ t: Date | null }>("SELECT onboarded_at AS t FROM users WHERE id = $1", [uid]))[0].t;
      expect(await stamp()).toBeNull();
      await savePrefs(uid, valid());
      const first = await stamp();
      expect(first).not.toBeNull();
      await new Promise((r) => setTimeout(r, 20));
      await savePrefs(uid, valid({ radiusKm: 300 }));
      expect((await stamp())!.getTime()).toBe(first!.getTime());
    }));

  dbIt("an email-sign-in user's email is read-only", () =>
    withSchema(async () => {
      await seedPlaces();
      const uid = await newUser({ emailHash: "hash-of-login-email" });
      const original = encrypt("login@example.com", keyFromEnv());
      await query("UPDATE users SET email_enc = $2 WHERE id = $1", [uid, original]);

      await savePrefs(uid, valid(), { email: "other@example.com", phone: "+91 98765 43210" });
      const [raw] = await query<{ email_hash: string; email_enc: string }>("SELECT email_hash, email_enc FROM users WHERE id = $1", [uid]);
      expect(raw.email_hash).toBe("hash-of-login-email");
      expect(raw.email_enc).toBe(original);
      const got = (await getPrefs(uid))!;
      expect(got.contact.email).toBe("login@example.com");
      expect(got.contact.emailLocked).toBe(true);
      expect(got.contact.phone).toBe("+91 98765 43210");
    }));

  dbIt("a Discord user may set and clear a notification email; email_hash stays NULL", () =>
    withSchema(async () => {
      await seedPlaces();
      const uid = await newUser();
      await savePrefs(uid, valid(), { email: "n@example.com" });
      const read = async () =>
        (await query<{ email_hash: string | null; email_enc: string | null }>("SELECT email_hash, email_enc FROM users WHERE id = $1", [uid]))[0];
      let raw = await read();
      expect(raw.email_hash).toBeNull();
      expect(raw.email_enc).toMatch(/^v1:/);
      expect((await getPrefs(uid))!.contact.email).toBe("n@example.com");
      await savePrefs(uid, valid(), { email: "" });
      raw = await read();
      expect(raw.email_hash).toBeNull();
      expect(raw.email_enc).toBeNull();
    }));
});

describe("/api/me/prefs", () => {
  it("401 without a session cookie (GET and PUT)", async () => {
    expect((await call("GET", null)).status).toBe(401);
    expect((await call("PUT", null, { prefs: DEFAULT_PREFS })).status).toBe(401);
  });

  dbIt("415 without a JSON content type", () =>
    withSchema(async () => {
      const uid = await newUser();
      const res = await call("PUT", uid, "{}", { "content-type": "text/plain" });
      expect(res.status).toBe(415);
    }));

  dbIt("400 on an oversized body and on an invalid value with the field named", () =>
    withSchema(async () => {
      await seedPlaces();
      const uid = await newUser();
      const big = await call("PUT", uid, { prefs: DEFAULT_PREFS, pad: "x".repeat(9000) });
      expect(big.status).toBe(400);
      const bad = await call("PUT", uid, { prefs: { ...DEFAULT_PREFS, radiusKm: 7 } });
      expect(bad.status).toBe(400);
      expect(await bad.json()).toMatchObject({ field: "radiusKm" });
      const badContact = await call("PUT", uid, { prefs: DEFAULT_PREFS, contact: { phone: "x" } });
      expect(badContact.status).toBe(400);
      expect(await badContact.json()).toMatchObject({ field: "phone" });
      expect((await call("PUT", uid, "{")).status).toBe(400);
    }));

  dbIt("GET/PUT round trip for the session user only; the CallMeBot key never comes back", () =>
    withSchema(async () => {
      await seedPlaces();
      const uid = await newUser();
      const other = await newUser({ name: "Bob" });
      const get = await call("GET", uid);
      expect(get.status).toBe(200);
      expect(get.headers.get("cache-control")).toBe("no-store");
      expect(await get.json()).toEqual({
        prefs: DEFAULT_PREFS,
        contact: { email: null, emailLocked: false, phone: null, hasCallmebotKey: false },
      });

      const prefs = valid({ homeCity: "mumbai", topics: ["data"] });
      const put = await call("PUT", uid, {
        prefs,
        contact: { phone: "+91 98765 43210", callmebotKey: "super-secret-key", email: "ann@example.com" },
        uid: other, // ignored: never taken from the client
      });
      expect(put.status).toBe(200);
      expect(await put.json()).toEqual({ ok: true });

      const again = await call("GET", uid);
      const text = await again.text();
      expect(text).not.toContain("super-secret-key");
      expect(JSON.parse(text)).toEqual({
        prefs,
        contact: { email: "ann@example.com", emailLocked: false, phone: "+91 98765 43210", hasCallmebotKey: true },
      });
      const o = (await (await call("GET", other)).json()) as { prefs: unknown };
      expect(o.prefs).toEqual(DEFAULT_PREFS);
    }));
});
