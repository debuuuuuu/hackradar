import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

function checkKey(key: Buffer): void {
  if (key.length !== 32) throw new Error("encryption key must be exactly 32 bytes");
}

/** AES-256-GCM. Format: "v1:<iv>:<tag>:<ciphertext>", each part base64, random 12-byte iv. */
export function encrypt(plain: string, key: Buffer): string {
  checkKey(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

/** Throws if the blob is malformed, tampered with, or the key is wrong. */
export function decrypt(blob: string, key: Buffer): string {
  checkKey(key);
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("unsupported ciphertext format");
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
}

/** Deterministic lookup hash: hex HMAC-SHA256 of the trimmed, lower-cased value. */
export function blindIndex(value: string, key: Buffer): string {
  checkKey(key);
  return createHmac("sha256", key).update(value.trim().toLowerCase()).digest("hex");
}

/** Reads a base64 key from the environment; must decode to exactly 32 bytes. */
export function keyFromEnv(name = "ENCRYPTION_KEY"): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name} must be base64 of exactly 32 bytes (got ${key.length})`);
  return key;
}
