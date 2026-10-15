import { describe, expect, it } from "vitest";
import { formatIst } from "../src/lib/format.js";

describe("formatIst", () => {
  it("formats an instant in IST with time", () => {
    expect(formatIst("2026-10-15T18:29:00.000Z")).toBe("15 Oct 2026, 11:59 PM IST");
  });
  it("shows only the date for a value stored at 00:00 IST", () => {
    expect(formatIst("2026-10-30T18:30:00.000Z")).toBe("31 Oct 2026");
  });
  it("returns null for missing or invalid input", () => {
    expect(formatIst(null)).toBeNull();
    expect(formatIst("nope")).toBeNull();
  });
});
