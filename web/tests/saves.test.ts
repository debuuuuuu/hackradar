import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "../server/db.js";
import { route } from "../server/router.js";
import { signSession } from "../server/session.js";
import { dbIt, withSchema } from "./helpers.js";

const ORIGIN = "https://hackradar.test";
const cookie = (uid: number) => `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!)}`;

async function newUser(): Promise<number> {
  const [row] = await query<{ id: number }>("INSERT INTO users (name, email_hash) VALUES ($1, $2) RETURNING id", [
    "Ann",
    randomBytes(8).toString("hex"),
  ]);
  return Number(row.id);
}

async function newEvent(): Promise<number> {
  const [row] = await query<{ id: number }>(
    "INSERT INTO events (title, status) VALUES ($1, 'open') RETURNING id",
    ["Test Hack"],
  );
  return Number(row.id);
}

const ENV = ["SESSION_SECRET", "CAL_FEED_SECRET"] as const;
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

const call = (method: string, uid: number | null, path: string, body?: unknown) =>
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

describe("saves API", () => {
  dbIt("POST /api/me/events/:id saves an event", () =>
    withSchema(async () => {
      const uid = await newUser();
      const eid = await newEvent();
      const res = await call("POST", uid, `/api/me/events/${eid}`);
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("saved");
    }));

  dbIt("POST /api/me/events/:id twice is idempotent", () =>
    withSchema(async () => {
      const uid = await newUser();
      const eid = await newEvent();
      await call("POST", uid, `/api/me/events/${eid}`);
      const res = await call("POST", uid, `/api/me/events/${eid}`);
      expect(res.status).toBe(200);
    }));

  dbIt("PATCH /api/me/events/:id updates status to registered", () =>
    withSchema(async () => {
      const uid = await newUser();
      const eid = await newEvent();
      await call("POST", uid, `/api/me/events/${eid}`);
      const res = await call("PATCH", uid, `/api/me/events/${eid}`, { status: "registered" });
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("registered");
    }));

  dbIt("DELETE /api/me/events/:id removes the row", () =>
    withSchema(async () => {
      const uid = await newUser();
      const eid = await newEvent();
      await call("POST", uid, `/api/me/events/${eid}`);
      expect((await call("DELETE", uid, `/api/me/events/${eid}`)).status).toBe(200);
      expect((await call("DELETE", uid, `/api/me/events/${eid}`)).status).toBe(404);
    }));

  dbIt("GET /api/me/events lists saved events with gcalLink", () =>
    withSchema(async () => {
      const uid = await newUser();
      const eid = await newEvent();
      await call("POST", uid, `/api/me/events/${eid}`);
      const body = await (await call("GET", uid, "/api/me/events")).json();
      expect(body.items.length).toBe(1);
      expect(body.items[0].gcalLink).toMatch(/^https:\/\/calendar\.google\.com/);
    }));

  dbIt("GET /api/me/calendar.ics with valid token returns VCALENDAR", () =>
    withSchema(async () => {
      process.env.CAL_FEED_SECRET = "a".repeat(64);
      const uid = await newUser();
      const { calToken } = await import("../server/saves.js");
      const token = calToken(uid);
      const res = await call("GET", null, `/api/me/calendar.ics?token=${token}&user=${uid}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("BEGIN:VCALENDAR");
    }));

  dbIt("GET /api/me/calendar.ics with bad token returns 401", () =>
    withSchema(async () => {
      process.env.CAL_FEED_SECRET = "a".repeat(64);
      const uid = await newUser();
      const res = await call("GET", null, `/api/me/calendar.ics?token=badtoken&user=${uid}`);
      expect(res.status).toBe(401);
    }));

  it("GET /api/me/events returns 401 when not signed in", async () => {
    const res = await call("GET", null, "/api/me/events");
    expect(res.status).toBe(401);
  });
});
