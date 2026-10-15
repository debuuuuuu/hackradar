import { describe, expect, it } from "vitest";
import { signInHref } from "../src/lib/me.js";

describe("me helpers", () => {
  it("builds a sign-in link that carries a safe-looking next", () => {
    expect(signInHref("/events/3", "")).toBe("/signin?next=%2Fevents%2F3");
    expect(signInHref("/", "")).toBe("/signin");
    expect(signInHref("/events", "?q=a")).toBe("/signin?next=%2Fevents%3Fq%3Da");
  });
});
