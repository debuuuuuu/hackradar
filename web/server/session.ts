import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "hr_session";
const MAX_AGE_S = 30 * 24 * 60 * 60;
const MAX_TOKEN_LEN = 512;

const sign = (body: string, secret: string): Buffer => createHmac("sha256", secret).update(body).digest();

/** Token = base64url(JSON {uid, iat, exp}) + "." + base64url(HMAC-SHA256). */
export function signSession(payload: { uid: number }, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ uid: payload.uid, iat: now, exp: now + MAX_AGE_S * 1000 })).toString("base64url");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

export function readSession(
  cookieHeader: string | null,
  secret: string,
  now = Date.now(),
): { uid: number; iat: number } | null {
  try {
    if (!cookieHeader) return null;
    const pair = cookieHeader.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
    if (!pair) return null;
    const token = pair.slice(COOKIE.length + 1);
    if (token.length > MAX_TOKEN_LEN) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const given = Buffer.from(sig, "base64url");
    const expected = sign(body, secret);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { uid?: unknown; iat?: unknown; exp?: unknown };
    if (!Number.isInteger(data.uid) || typeof data.exp !== "number" || now > data.exp) return null;
    // Tokens issued before "iat" existed count as issued at 0, so "sign out everywhere" ends them too.
    return { uid: data.uid as number, iat: typeof data.iat === "number" ? data.iat : 0 };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
