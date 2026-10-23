import { expect, test } from "vitest";
import { gcalLink, toIcsFeed } from "../server/calendar.js";

test("gcalLink includes encoded title and dates", () => {
  const url = gcalLink({ title: "Hack Day", startDate: "2026-11-01", endDate: "2026-11-02", regDeadline: null, city: "Pune", sources: [{ url: "https://devpost.com/x" }] });
  expect(url).toMatch(/calendar\.google\.com\/calendar\/render/);
  expect(url).toMatch(/Hack\+Day/);
  expect(url).toMatch(/20261101/);
});

test("toIcsFeed returns valid VCALENDAR wrapper", () => {
  const ics = toIcsFeed([], "HackRadar");
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("END:VCALENDAR");
});

test("toIcsFeed includes VEVENT for each event", () => {
  const ics = toIcsFeed([{ id: 1, title: "Hack Day", startDate: "2026-11-01", endDate: "2026-11-02", regDeadline: null, city: null, sources: [{ url: "https://devpost.com/x" }] }], "HackRadar");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toContain("SUMMARY:Hack Day");
});
