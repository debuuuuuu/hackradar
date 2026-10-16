import { createHash, randomBytes } from "node:crypto";
import { blindIndex, decrypt, encrypt, keyFromEnv } from "./crypto.js";
import { query, transaction } from "./db.js";
import { readSession } from "./session.js";

const TOKEN_TTL_MS = 15 * 60_000;
const RESEND_GAP_MS = 60_000;
const HOUR_MS = 3_600_000;
// Global brake, sized to the mail provider (Gmail SMTP ~500/day). Raise LOGIN_TOKENS_PER_HOUR when it moves to a real provider (D-044).
const MAX_TOKENS_PER_HOUR = Number(process.env.LOGIN_TOKENS_PER_HOUR) || 200;
/** One address of the world can't use up the global brake: at most this many links per IP per hour. */
export const MAX_TOKENS_PER_IP_PER_HOUR = 20;
const MAX_NEXT_LEN = 2000;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export interface PublicUser {
  uid: number;
  name: string;
  onboarded: boolean;
  isAdmin: boolean;
}

/** A same-site path only: one leading "/", no "//", no backslash, printable ASCII only. */
export function safeNext(value: string | null): string {
  if (!value || value.length > MAX_NEXT_LEN) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\") || /[^\x20-\x7e]/.test(value)) return "/";
  return value;
}

/** Trimmed, lower-cased address, or null when it does not look like one. */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_SHAPE.test(email) ? email : null;
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/**
 * Creates a one-time token and mails the link. Resolves the same way for every input: unknown,
 * known, invalid, rate-limited. Fewer than 200 tokens per hour overall, one per address per 60 s.
 */
export async function startEmailLogin(
  email: string,
  deps: { send: (to: string, link: string) => Promise<void>; now?: number; origin: string; next?: string | null; ip?: string | null },
): Promise<void> {
  const normalised = normaliseEmail(email);
  if (!normalised) return;
  const now = deps.now ?? Date.now();
  const key = keyFromEnv();
  const emailHash = blindIndex(normalised, key);
  const ipHash = deps.ip ? blindIndex(deps.ip, key) : null; // hashed: raw IPs are never stored
  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  // A transaction-scoped advisory lock serialises every start, so the per-address and global
  // checks below cannot be raced by parallel requests (READ COMMITTED alone would allow it).
  const inserted = await transaction(async (q) => {
    await q("SELECT pg_advisory_xact_lock(hashtext('login_tokens_start'))");
    const rows = await q(
      `INSERT INTO login_tokens (email_hash, email_enc, token_hash, expires_at, created_at, ip_hash)
       SELECT $1::text, $2::text, $3::text, $4::timestamptz, $5::timestamptz, $9::text
       WHERE NOT EXISTS (SELECT 1 FROM login_tokens WHERE email_hash = $1 AND created_at > $6::timestamptz)
         AND (SELECT count(*) FROM login_tokens WHERE created_at > $7::timestamptz) < $8
         AND ($9::text IS NULL OR (SELECT count(*) FROM login_tokens WHERE ip_hash = $9::text AND created_at > $7::timestamptz) < $10)
       RETURNING id`,
      [
        emailHash,
        encrypt(normalised, key),
        tokenHash,
        new Date(now + TOKEN_TTL_MS),
        new Date(now),
        new Date(now - RESEND_GAP_MS),
        new Date(now - HOUR_MS),
        MAX_TOKENS_PER_HOUR,
        ipHash,
        MAX_TOKENS_PER_IP_PER_HOUR,
      ],
    );
    return rows.length > 0;
  });
  if (!inserted) return;
  const link = new URL("/api/auth/email/verify", deps.origin);
  link.searchParams.set("token", token);
  const next = safeNext(deps.next ?? null);
  if (next !== "/") link.searchParams.set("next", next);
  try {
    await deps.send(normalised, link.toString());
  } catch (e) {
    // A failed mail must not lock the address for the next 60 s.
    await query("DELETE FROM login_tokens WHERE token_hash = $1", [tokenHash]);
    throw e;
  }
}

/** True when the token exists, is unused and unexpired. Does NOT consume it (link scanners GET). */
export async function peekEmailToken(token: string, now: number = Date.now()): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0 || token.length > 200) return false;
  const rows = await query(
    "SELECT 1 FROM login_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at >= $2::timestamptz",
    [sha256(token), new Date(now)],
  );
  return rows.length > 0;
}

/** Sets is_admin when the address is listed in ADMIN_EMAILS. Never clears it. */
export async function grantAdminIfListed(uid: number, emailHash: string): Promise<void> {
  const listed = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (listed.length === 0) return;
  const key = keyFromEnv();
  if (listed.some((a) => blindIndex(a, key) === emailHash)) {
    await query("UPDATE users SET is_admin = true WHERE id = $1 AND NOT is_admin", [uid]);
  }
}

/** Records a successful sign-in. */
export async function recordLogin(uid: number, method: "discord" | "email" | "google"): Promise<void> {
  await query("INSERT INTO logins (user_id, method) VALUES ($1, $2)", [uid, method]);
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [uid]);
}

/**
 * Consumes a token (single use) and signs the user in, creating the account on first use.
 * Records the login itself, so callers must not call recordLogin again.
 */
export async function finishEmailLogin(
  token: string,
  now: number = Date.now(),
): Promise<{ uid: number; isNew: boolean; email?: string } | null> {
  if (typeof token !== "string" || token.length === 0 || token.length > 200) return null;
  const used = await query<{ email_hash: string; email_enc: string | null }>(
    `UPDATE login_tokens SET used_at = $2::timestamptz
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at >= $2::timestamptz
     RETURNING email_hash, email_enc`,
    [sha256(token), new Date(now)],
  );
  if (used.length === 0) return null;
  const { email_hash: emailHash, email_enc: emailEnc } = used[0];
  const user = await userForEmail(emailHash, emailEnc, "Member");
  if (!user) return null;
  await grantAdminIfListed(user.uid, emailHash);
  await recordLogin(user.uid, "email");
  return user;
}

/**
 * Finds the account for an email (by its blind index) or creates it with default preferences. The
 * address is returned only for a brand-new account, so the caller can send the welcome mail.
 */
async function userForEmail(
  emailHash: string,
  emailEnc: string | null,
  name: string,
): Promise<{ uid: number; isNew: boolean; email?: string } | null> {
  const existing = await query<{ id: number }>("SELECT id FROM users WHERE email_hash = $1", [emailHash]);
  if (existing.length > 0) return { uid: Number(existing[0].id), isNew: false };
  if (!emailEnc) return null;
  // One statement: the user and their default preferences are created together or not at all.
  const created = await query<{ id: number }>(
    `WITH u AS (
       INSERT INTO users (name, email_hash, email_enc) VALUES ($3, $1, $2)
       ON CONFLICT (email_hash) DO NOTHING RETURNING id
     ), p AS (INSERT INTO preferences (user_id) SELECT id FROM u)
     SELECT id FROM u`,
    [emailHash, emailEnc, name],
  );
  if (created.length > 0) return { uid: Number(created[0].id), isNew: true, email: decrypt(emailEnc, keyFromEnv()) };
  const raced = await query<{ id: number }>("SELECT id FROM users WHERE email_hash = $1", [emailHash]);
  return raced.length === 0 ? null : { uid: Number(raced[0].id), isNew: false };
}

/**
 * Signs in a person whose email a provider (Google, or Supabase for passwords) has verified. They land
 * on the same account as the email link for that address (one account per email), created on first use.
 * Records the login itself. A password sign-in is recorded as "email": the identity is the address.
 */
async function signInWithVerifiedEmail(
  rawEmail: string,
  name: string,
  method: "google" | "email",
): Promise<{ uid: number; isNew: boolean; email?: string } | null> {
  const email = normaliseEmail(rawEmail);
  if (!email) return null;
  const key = keyFromEnv();
  const emailHash = blindIndex(email, key);
  const user = await userForEmail(emailHash, encrypt(email, key), name);
  if (!user) return null;
  await grantAdminIfListed(user.uid, emailHash);
  await recordLogin(user.uid, method);
  return user;
}

export const signInWithGoogle = (email: string, name: string) => signInWithVerifiedEmail(email, name, "google");
export const signInWithSupabase = (email: string, name: string) => signInWithVerifiedEmail(email, name, "email");

export async function findUser(uid: number): Promise<PublicUser | null> {
  const rows = await query<{ id: number; name: string; onboarded_at: Date | null; is_admin: boolean }>(
    "SELECT id, name, onboarded_at, is_admin FROM users WHERE id = $1",
    [uid],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return { uid: Number(r.id), name: r.name, onboarded: r.onboarded_at !== null, isAdmin: r.is_admin };
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

/** The signed-in user's id from the request cookie, or null. */
export function sessionFromRequest(request: Request): { uid: number } | null {
  return readSession(request.headers.get("cookie"), sessionSecret());
}
