import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clashLabel, validateBusy } from "../server/busy.js";
import { query } from "../server/db.js";
import { ValidationError } from "../server/prefs.js";
import { route } from "../server/router.js";
import { signSession } from "../server/session.js";
import { dbIt, withSchema } from "./helpers.js";

const TODAY = "2026-10-23";

describe("validateBusy", () => {
  const ok = { startsOn: "2026-11-10", endsOn: "2026-11-15", label: "exams" };
  const field = (input: unknown): string | null => {
    try {
      validateBusy(input, TODAY);
      return null;
    } catch (e) {
      if (e instanceof ValidationError) return e.field;
      throw e;
    }
  };

  it("accepts a valid period and trims the label", () => {
    expect(validateBusy({ ...ok, label: "  exams  " }, TODAY)).toEqual(ok);
  });

  it("accepts a single day, today as the end, and a 366-day span", () => {
    expect(field({ startsOn: "2026-11-10", endsOn: "2026-11-10", label: "x" })).toBeNull();
    expect(field({ startsOn: "2026-10-01", endsOn: TODAY, label: "x" })).toBeNull();
    expect(field({ startsOn: "2026-11-01", endsOn: "2027-11-02", label: "x" })).toBeNull();
  });

  it("rejects end before start", () => {
    expect(field({ ...ok, startsOn: "2026-11-16" })).toBe("endsOn");
  });

  it("rejects a span over 366 days", () => {
    expect(field({ startsOn: "2026-11-01", endsOn: "2027-11-03", label: "x" })).toBe("endsOn");
  });

  it("rejects an end date before today (IST)", () => {
    expect(field({ startsOn: "2026-10-01", endsOn: "2026-10-22", label: "x" })).toBe("endsOn");
  });

  it("rejects empty, blank, over-long and non-string labels", () => {
    expect(field({ ...ok, label: "" })).toBe("label");
    expect(field({ ...ok, label: "   " })).toBe("label");
    expect(field({ ...ok, label: "x".repeat(41) })).toBe("label");
    expect(field({ ...ok, label: "x".repeat(40) })).toBeNull();
    expect(field({ ...ok, label: 5 })).toBe("label");
  });

  it("rejects non-ISO and impossible dates", () => {
    expect(field({ ...ok, startsOn: "10/11/2026" })).toBe("startsOn");
    expect(field({ ...ok, startsOn: "2026-11-1" })).toBe("startsOn");
    expect(field({ ...ok, startsOn: "2026-02-30" })).toBe("startsOn");
    expect(field({ ...ok, endsOn: "2026-13-01" })).toBe("endsOn");
    expect(field({ ...ok, endsOn: 20261115 })).toBe("endsOn");
    expect(field({ ...ok, startsOn: undefined })).toBe("startsOn");
  });

  it("rejects non-object input", () => {
    expect(field(null)).not.toBeNull();
    expect(field("x")).not.toBeNull();
    expect(field([])).not.toBeNull();
  });
});

// Mirrors tests/test_busy.py (same cases, same expected labels). Keep the two in sync.
describe("clashLabel", () => {
  const EXAMS = { startsOn: "2026-11-10", endsOn: "2026-11-15", label: "exams" };
  /** ISO instant for an IST wall-clock time in 2026 (IST = UTC+05:30). */
  const ist = (month: number, day: number, hour = 12, minute = 0): string =>
    new Date(Date.UTC(2026, month - 1, day, hour, minute) - 330 * 60_000).toISOString();

  const cases: [string | null, string | null, string | null, string | null, string | null][] = [
    ["offline", ist(11, 14), ist(11, 16), null, "exams"],
    ["hybrid", ist(11, 1), ist(11, 10), null, "exams"],
    ["offline", ist(11, 16), ist(11, 18), null, null],
    ["online", ist(11, 1), ist(11, 30), null, null],
    ["online", ist(11, 1), ist(11, 30), ist(11, 12), "exams"],
    ["offline", null, null, null, null],
    ["online", null, null, null, null],
    [null, null, null, null, null],
    ["offline", ist(11, 5), ist(11, 9, 23, 59), null, null],
    ["offline", ist(11, 15, 23, 30), ist(11, 17), null, "exams"],
  ];

  it.each(cases)("%s %s..%s submit %s -> %s", (mode, start, end, submit, expected) => {
    expect(clashLabel(mode, start, end, submit, [EXAMS])).toBe(expected);
  });

  it("start-only and end-only events use the known date", () => {
    expect(clashLabel("offline", ist(11, 12), null, null, [EXAMS])).toBe("exams");
    expect(clashLabel("offline", null, ist(11, 12), null, [EXAMS])).toBe("exams");
    expect(clashLabel("offline", ist(11, 20), null, null, [EXAMS])).toBeNull();
  });

  it("compares IST dates, not UTC dates", () => {
    // 2026-11-16 00:30 IST is 2026-11-15 19:00 UTC; the IST date is the 16th, so no clash.
    expect(clashLabel("offline", ist(11, 16, 0, 30), ist(11, 17), null, [EXAMS])).toBeNull();
    // Submission 2026-11-10 00:15 IST is still the 9th in UTC; the IST date is inside.
    expect(clashLabel("online", null, null, ist(11, 10, 0, 15), [EXAMS])).toBe("exams");
  });

  it("the first clashing period wins, even for unsorted input", () => {
    const later = { startsOn: "2026-11-12", endsOn: "2026-11-20", label: "trip" };
    expect(clashLabel("offline", ist(11, 13), ist(11, 14), null, [EXAMS, later])).toBe("exams");
    expect(clashLabel("offline", ist(11, 13), ist(11, 14), null, [later, EXAMS])).toBe("exams");
    expect(clashLabel("offline", ist(11, 16), ist(11, 17), null, [later, EXAMS])).toBe("trip");
  });

  it("no periods, no clash", () => {
    expect(clashLabel("offline", ist(11, 13), ist(11, 14), null, [])).toBeNull();
  });

  it("does not mutate the periods it is given", () => {
    const later = { startsOn: "2026-11-12", endsOn: "2026-11-20", label: "trip" };
    const input = [later, EXAMS];
    clashLabel("offline", ist(11, 13), ist(11, 14), null, input);
    expect(input[0]).toBe(later);
  });
});

// --- database tests ---------------------------------------------------------------------------

const ENV = ["SESSION_SECRET"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SESSION_SECRET = "s".repeat(32);
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const ORIGIN = "https://hackradar.test";
const cookie = (uid: number) => `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!)}`;

async function newUser(): Promise<number> {
  const [row] = await query<{ id: number }>("INSERT INTO users (name, email_hash) VALUES ($1, $2) RETURNING id", [
    "Ann",
    randomBytes(8).toString("hex"),
  ]);
  return Number(row.id);
}

const call = (method: string, uid: number | null, path = "/api/me/busy", body?: unknown) =>
  route(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        ...(uid === null ? {} : { cookie: cookie(uid) }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

/** A date string `days` from now, so the end-not-in-the-past rule never makes these tests rot. */
const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe("busy periods API", () => {
  dbIt("signed-out requests get 401", () =>
    withSchema(async () => {
      expect((await call("GET", null)).status).toBe(401);
      expect((await call("POST", null, "/api/me/busy", { startsOn: inDays(5), endsOn: inDays(6), label: "x" })).status).toBe(401);
      expect((await call("DELETE", null, "/api/me/busy/1")).status).toBe(401);
    }));

  dbIt("create, list and delete round trip", () =>
    withSchema(async () => {
      const uid = await newUser();
      expect(await (await call("GET", uid)).json()).toEqual({ periods: [] });

      const res = await call("POST", uid, "/api/me/busy", { startsOn: inDays(5), endsOn: inDays(9), label: "  exams " });
      expect(res.status).toBe(200);
      const created = await res.json();
      expect(created).toMatchObject({ startsOn: inDays(5), endsOn: inDays(9), label: "exams" });
      expect(typeof created.id).toBe("number");

      const listed = await (await call("GET", uid)).json();
      expect(listed.periods).toEqual([created]);

      const del = await call("DELETE", uid, `/api/me/busy/${created.id}`);
      expect(await del.json()).toEqual({ ok: true });
      expect(await (await call("GET", uid)).json()).toEqual({ periods: [] });
    }));

  dbIt("lists earliest first", () =>
    withSchema(async () => {
      const uid = await newUser();
      await call("POST", uid, "/api/me/busy", { startsOn: inDays(30), endsOn: inDays(31), label: "later" });
      await call("POST", uid, "/api/me/busy", { startsOn: inDays(2), endsOn: inDays(3), label: "sooner" });
      const { periods } = await (await call("GET", uid)).json();
      expect(periods.map((p: { label: string }) => p.label)).toEqual(["sooner", "later"]);
    }));

  dbIt("rejects invalid input with 400 and the field", async () =>
    withSchema(async () => {
      const uid = await newUser();
      const res = await call("POST", uid, "/api/me/busy", { startsOn: "2026-02-30", endsOn: inDays(3), label: "x" });
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe("startsOn");
    }));

  dbIt("another user cannot list or delete a period (404 on delete)", () =>
    withSchema(async () => {
      const a = await newUser();
      const b = await newUser();
      const created = await (await call("POST", a, "/api/me/busy", { startsOn: inDays(5), endsOn: inDays(6), label: "mine" })).json();

      expect(await (await call("GET", b)).json()).toEqual({ periods: [] });
      expect((await call("DELETE", b, `/api/me/busy/${created.id}`)).status).toBe(404);
      expect((await (await call("GET", a)).json()).periods).toHaveLength(1);
      expect((await call("DELETE", a, "/api/me/busy/abc")).status).toBe(404);
    }));

  dbIt("rejects a 21st period with 400", () =>
    withSchema(async () => {
      const uid = await newUser();
      for (let i = 0; i < 20; i++) {
        const r = await call("POST", uid, "/api/me/busy", { startsOn: inDays(5), endsOn: inDays(6), label: `p${i}` });
        expect(r.status).toBe(200);
      }
      const res = await call("POST", uid, "/api/me/busy", { startsOn: inDays(5), endsOn: inDays(6), label: "one too many" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("You can keep up to 20 busy periods.");
    }));
});
