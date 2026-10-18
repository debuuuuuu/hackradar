import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";

const AUTHORIZE = "https://discord.com/oauth2/authorize";
const TOKEN_URL = "https://discord.com/api/oauth2/token";
const ME_URL = "https://discord.com/api/users/@me";
const TIMEOUT_MS = 8000;
const COOKIE = "hr_oauth";
const MAX_AGE_S = 600;
const MAX_COOKIE_LEN = 4096;
const MAX_NAME_LEN = 40;

export const discordConfigured = (): boolean =>
  Boolean(process.env.DISCORD_CLIENT_ID) && Boolean(process.env.DISCORD_CLIENT_SECRET);

export function authorizeUrl(state: string, redirectUri: string): string {
  const u = new URL(AUTHORIZE);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID ?? "");
  u.searchParams.set("scope", "identify");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "none");
  return u.toString();
}

/**
 * Trades the code for the user's id and username. Throws a generic Error on any failure; the
 * message never carries response text, the access token or the client secret.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ discordId: string; username: string }> {
  const fail = () => new Error("discord exchange failed");
  try {
    const tokenRes = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID ?? "",
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!tokenRes.ok) throw fail();
    const token = (await tokenRes.json()) as { access_token?: unknown };
    if (typeof token.access_token !== "string" || !token.access_token) throw fail();
    const meRes = await fetchImpl(ME_URL, {
      headers: { authorization: `Bearer ${token.access_token}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!meRes.ok) throw fail();
    const me = (await meRes.json()) as { id?: unknown; username?: unknown };
    if (typeof me.id !== "string" || !/^\d{1,32}$/.test(me.id)) throw fail();
    if (typeof me.username !== "string" || !me.username) throw fail();
    return { discordId: me.id, username: me.username };
  } catch {
    throw fail();
  }
}

const cleanName = (s: string): string =>
  Array.from(s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim())
    .slice(0, MAX_NAME_LEN)
    .join("") || "Member";

/** Finds or creates the user for a Discord id, with default preferences, in one statement. */
export async function upsertUserByDiscord(p: {
  discordId: string;
  username: string;
}): Promise<{ uid: number; isNew: boolean }> {
  const created = await query<{ id: number }>(
    `WITH u AS (
       INSERT INTO users (name, discord_user_id) VALUES ($1, $2)
       ON CONFLICT (discord_user_id) DO NOTHING RETURNING id
     ), p AS (INSERT INTO preferences (user_id) SELECT id FROM u)
     SELECT id FROM u`,
    [cleanName(p.username), p.discordId],
  );
  if (created.length > 0) return { uid: Number(created[0].id), isNew: true };
  const existing = await query<{ id: number }>("SELECT id FROM users WHERE discord_user_id = $1", [p.discordId]);
  if (existing.length === 0) throw new Error("discord user missing after upsert");
  return { uid: Number(existing[0].id), isNew: false };
}

const sign = (body: string, secret: string): Buffer => createHmac("sha256", secret).update(body).digest();

export const newState = (): string => randomBytes(32).toString("base64url");

/** Cookie value = base64url(JSON {state, next}) + "." + base64url(HMAC-SHA256). */
export function oauthCookie(state: string, next: string, secret: string, path = "/api/auth/discord"): string {
  const body = Buffer.from(JSON.stringify({ state, next })).toString("base64url");
  return `${COOKIE}=${body}.${sign(body, secret).toString("base64url")}; HttpOnly; Secure; SameSite=Lax; Path=${path}; Max-Age=${MAX_AGE_S}`;
}

export const clearOauthCookie = (path = "/api/auth/discord"): string =>
  `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=${path}; Max-Age=0`;

export function readOauthCookie(
  cookieHeader: string | null,
  secret: string,
): { state: string; next: string } | null {
  try {
    if (!cookieHeader) return null;
    const pair = cookieHeader.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
    if (!pair) return null;
    const token = pair.slice(COOKIE.length + 1);
    if (token.length > MAX_COOKIE_LEN) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const given = Buffer.from(parts[1], "base64url");
    const expected = sign(parts[0], secret);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { state?: unknown; next?: unknown };
    if (typeof data.state !== "string" || typeof data.next !== "string") return null;
    return { state: data.state, next: data.next };
  } catch {
    return null;
  }
}

/** Constant-time string comparison (hashes first so lengths do not leak). */
export function sameState(a: string, b: string): boolean {
  const x = createHmac("sha256", "cmp").update(a).digest();
  const y = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(x, y);
}
