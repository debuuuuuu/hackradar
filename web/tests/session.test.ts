import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { clearSessionCookie, readSession, sessionCookie, signSession } from "../server/session.js";

const secret = "s".repeat(32);
const DAY = 86_400_000;
const cookie = (t: string) => `a=b; hr_session=${t}; c=d`;

describe("session", () => {
  it("round trips", () => {
    const t = signSession({ uid: 7 }, secret, 1000);
    expect(readSession(cookie(t), secret, 2000)).toEqual({ uid: 7, iat: 1000 });
  });
  it("token is base64url only", () => {
    expect(signSession({ uid: 7 }, secret, 1000)).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
  it("a token without iat (issued before it existed) reads as iat 0", () => {
    const body = Buffer.from(JSON.stringify({ uid: 7, exp: 9e15 })).toString("base64url");
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    expect(readSession(cookie(`${body}.${sig}`), secret, 2000)).toEqual({ uid: 7, iat: 0 });
  });
  it("rejects a tampered signature or payload", () => {
    const t = signSession({ uid: 7 }, secret, 1000);
    const bad = t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA");
    expect(readSession(cookie(bad), secret, 2000)).toBeNull();
    const sig = t.split(".")[1];
    const forged = Buffer.from(JSON.stringify({ uid: 8, exp: 9e15 })).toString("base64url");
    expect(readSession(cookie(`${forged}.${sig}`), secret, 2000)).toBeNull();
  });
  it("rejects a wrong secret", () => {
    const t = signSession({ uid: 7 }, secret, 1000);
    expect(readSession(cookie(t), "x".repeat(32), 2000)).toBeNull();
  });
  it("expires after 30 days + 1 ms", () => {
    const t = signSession({ uid: 7 }, secret, 0);
    expect(readSession(cookie(t), secret, 30 * DAY)).toEqual({ uid: 7, iat: 0 });
    expect(readSession(cookie(t), secret, 30 * DAY + 1)).toBeNull();
  });
  it("returns null for missing or malformed input without throwing", () => {
    expect(readSession(null, secret)).toBeNull();
    expect(readSession("", secret)).toBeNull();
    expect(readSession("a=b", secret)).toBeNull();
    for (const junk of ["", ".", "..", "a.b", "%%%.%%%", "x".repeat(5000)]) {
      expect(readSession(cookie(junk), secret)).toBeNull();
    }
  });
  it("cookie attributes", () => {
    expect(sessionCookie("tok")).toBe("hr_session=tok; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000");
    expect(clearSessionCookie()).toBe("hr_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  });
});
