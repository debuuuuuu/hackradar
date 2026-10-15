import { describe, expect, it } from "vitest";
import { barPct, niceMax, shortDay } from "../src/lib/chart.js";

describe("chart helpers", () => {
  it("rounds the axis max up to 1/2/5/10 times a power of ten", () => {
    expect([0, 1, 2, 3, 5, 6, 10, 11, 21, 51, 99, 100, 101].map(niceMax)).toEqual([1, 1, 2, 5, 5, 10, 10, 20, 50, 100, 100, 100, 200]);
    expect(niceMax(NaN)).toBe(1);
    expect(niceMax(-4)).toBe(1);
  });
  it("scales bar heights into 0..100 and survives bad input", () => {
    expect(barPct(5, 10)).toBe(50);
    expect(barPct(1, 3)).toBe(33.33);
    expect(barPct(20, 10)).toBe(100);
    expect(barPct(0, 10)).toBe(0);
    expect(barPct(5, 0)).toBe(0);
    expect(barPct(-1, 10)).toBe(0);
  });
  it("formats an IST calendar day label", () => {
    expect(shortDay("2026-10-05")).toBe("5 Oct");
    expect(shortDay("2026-01-31")).toBe("31 Jan");
  });
});
