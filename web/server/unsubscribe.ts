import { createHmac, timingSafeEqual } from "node:crypto";
import { keyFromEnv } from "./crypto.js";

// The pipeline (pipeline/notify/unsubscribe.py) signs the same way, so a digest email can carry the link.
// The key is derived from ENCRYPTION_KEY, which both sides already hold, so no new secret is needed.
const mac = (uid: number): Buffer =>
  createHmac("sha256", createHmac("sha256", keyFromEnv()).update("unsubscribe-v1").digest()).update(`unsub:${uid}`).digest();

/** `<uid>.<base64url HMAC>`. It has no expiry: a mail can be opened months later. */
export const unsubscribeToken = (uid: number): string => `${uid}.${mac(uid).toString("base64url")}`;

/** The user id inside a valid token, or null. */
export function readUnsubscribeToken(token: unknown): number | null {
  if (typeof token !== "string" || token.length > 120) return null;
  const m = /^([1-9]\d{0,15})\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return null;
  const uid = Number(m[1]);
  const given = Buffer.from(m[2], "base64url");
  const expected = mac(uid);
  return Number.isSafeInteger(uid) && given.length === expected.length && timingSafeEqual(given, expected) ? uid : null;
}
