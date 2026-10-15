import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blindIndex, decrypt, encrypt, keyFromEnv } from "../server/crypto.js";

const key = randomBytes(32);

describe("crypto", () => {
  it("round trips", () => {
    expect(decrypt(encrypt("hello @x", key), key)).toBe("hello @x");
  });
  it("uses the v1:iv:tag:ct format", () => {
    expect(encrypt("a", key).split(":")).toHaveLength(4);
    expect(encrypt("a", key).startsWith("v1:")).toBe(true);
  });
  it("two encryptions of one value differ", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });
  it("throws on a flipped ciphertext byte", () => {
    const [v, iv, tag, ct] = encrypt("secret value", key).split(":");
    const buf = Buffer.from(ct, "base64");
    buf[0] ^= 1;
    expect(() => decrypt([v, iv, tag, buf.toString("base64")].join(":"), key)).toThrow();
  });
  it("throws on the wrong key and malformed blobs", () => {
    expect(() => decrypt(encrypt("x", key), randomBytes(32))).toThrow();
    expect(() => decrypt("garbage", key)).toThrow();
  });
  it("blindIndex normalises case and whitespace", () => {
    expect(blindIndex(" A@b.com ", key)).toBe(blindIndex("a@b.com", key));
    expect(blindIndex("a@b.com", key)).toMatch(/^[0-9a-f]{64}$/);
    expect(blindIndex("a@b.com", key)).not.toBe(blindIndex("c@b.com", key));
  });
  it("rejects a 31-byte key", () => {
    expect(() => encrypt("x", randomBytes(31))).toThrow();
    expect(() => blindIndex("x", randomBytes(31))).toThrow();
  });
  it("keyFromEnv requires 32 base64 bytes", () => {
    process.env.TEST_KEY_OK = randomBytes(32).toString("base64");
    process.env.TEST_KEY_BAD = randomBytes(31).toString("base64");
    expect(keyFromEnv("TEST_KEY_OK")).toHaveLength(32);
    expect(() => keyFromEnv("TEST_KEY_BAD")).toThrow(/32 bytes/);
    expect(() => keyFromEnv("TEST_KEY_MISSING")).toThrow(/TEST_KEY_MISSING/);
  });
});
