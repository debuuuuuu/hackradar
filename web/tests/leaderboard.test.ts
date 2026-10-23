import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "../server/db.js";
import { route } from "../server/router.js";
import { signSession } from "../server/session.js";
import { dbIt, withSchema } from "./helpers.js";

const ORIGIN = "https://hackradar.test";
const cookie = (uid: number) => `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!)}`;

async function newUser(handle: string | null = null, profile_public = true): Promise<number> {
  const [row] = await query<{ id: number }>(
    "INSERT INTO users (name, email_hash, handle, profile_public) VALUES ($1,$2,$3,$4) RETURNING id",
    ["Test", randomBytes(8).toString("hex"), handle, profile_public]
  );
  return Number(row.id);
}

async function newEvent(): Promise<number> {
  const [row] = await query<{ id: number }>(
    "INSERT INTO events (title, status) VALUES ($1, 'open') RETURNING id",
    ["Test Hack"]
  );
  return Number(row.id);
}

async function saveEvent(uid: number, eid: number, status: string, won = false, project_url: string | null = null) {
  await query(
    "INSERT INTO user_events (user_id, event_id, status, won, project_url) VALUES ($1,$2,$3,$4,$5)",
    [uid, eid, status, won, project_url]
  );
}

async function newPrefs(uid: number, themes: string[] = [], home_city = "pune") {
  await query(
    "INSERT INTO preferences (user_id, themes, home_city) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET themes=$2, home_city=$3",
    [uid, themes, home_city]
  );
}

const call = (method: string, uid: number | null, path: string) =>
  route(new Request(`${ORIGIN}${path}`, {
    method,
    headers: uid === null ? {} : { cookie: cookie(uid) },
  }));

const ENV = ["SESSION_SECRET"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV) saved[k] = process.env[k]; process.env.SESSION_SECRET = "s".repeat(32); });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("leaderboard API", () => {
  dbIt("returns empty rows when no users have points", () =>
    withSchema(async () => {
      const res = await call("GET", null, "/api/leaderboard");
      expect(res.status).toBe(200);
      const body = await res.json() as { rows: unknown[]; total: number };
      expect(body.rows).toEqual([]);
      expect(body.total).toBe(0);
    }));

  dbIt("ranks by points: won > submitted > registered", () =>
    withSchema(async () => {
      const u1 = await newUser("alice"), e1 = await newEvent(); await saveEvent(u1, e1, "registered");
      const u2 = await newUser("bob"),   e2 = await newEvent(); await saveEvent(u2, e2, "submitted", false, "https://devpost.com/p1");
      const u3 = await newUser("cara"),  e3 = await newEvent(); await saveEvent(u3, e3, "submitted", true, "https://devpost.com/p2");
      const body = await (await call("GET", null, "/api/leaderboard")).json() as { rows: { handle: string; points: number }[] };
      expect(body.rows[0].handle).toBe("cara");  expect(body.rows[0].points).toBe(10);
      expect(body.rows[1].handle).toBe("bob");   expect(body.rows[1].points).toBe(3);
      expect(body.rows[2].handle).toBe("alice"); expect(body.rows[2].points).toBe(1);
    }));

  dbIt("submitted without project_url scores 0 and is excluded", () =>
    withSchema(async () => {
      const u = await newUser("dave"), e = await newEvent();
      await saveEvent(u, e, "submitted", false, null);
      const body = await (await call("GET", null, "/api/leaderboard")).json() as { rows: unknown[] };
      expect(body.rows).toHaveLength(0);
    }));

  dbIt("private profile users do not appear", () =>
    withSchema(async () => {
      const u = await newUser("eve", false), e = await newEvent();
      await saveEvent(u, e, "registered");
      const body = await (await call("GET", null, "/api/leaderboard")).json() as { rows: unknown[] };
      expect(body.rows).toHaveLength(0);
    }));

  dbIt("period=month excludes events updated last month", () =>
    withSchema(async () => {
      const u = await newUser("frank"), e = await newEvent();
      await query(
        "INSERT INTO user_events (user_id, event_id, status, updated_at, created_at) VALUES ($1,$2,'registered',now()-interval'40 days',now()-interval'40 days')",
        [u, e]
      );
      const body = await (await call("GET", null, "/api/leaderboard?period=month")).json() as { rows: unknown[] };
      expect(body.rows).toHaveLength(0);
    }));

  dbIt("theme filter: only users whose themes overlap", () =>
    withSchema(async () => {
      const u1 = await newUser("gina"), e1 = await newEvent(); await saveEvent(u1, e1, "registered"); await newPrefs(u1, ["ai","web"]);
      const u2 = await newUser("hal"),  e2 = await newEvent(); await saveEvent(u2, e2, "registered"); await newPrefs(u2, ["blockchain"]);
      const body = await (await call("GET", null, "/api/leaderboard?theme=ai")).json() as { rows: { handle: string }[] };
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0].handle).toBe("gina");
    }));

  dbIt("myRank present when signed-in user is outside the returned window", () =>
    withSchema(async () => {
      const u1 = await newUser("i1"), e1 = await newEvent(); await saveEvent(u1, e1, "submitted", false, "https://x.com/p1");
      const u2 = await newUser("i2"), e2 = await newEvent(); await saveEvent(u2, e2, "submitted", false, "https://x.com/p2");
      const me = await newUser("moi"), e3 = await newEvent(); await saveEvent(me, e3, "registered");
      const res = await call("GET", me, "/api/leaderboard?limit=2");
      const body = await res.json() as { rows: { handle: string }[]; myRank?: number; myRow?: { handle: string } };
      expect(body.rows).toHaveLength(2);
      expect(body.myRank).toBe(3);
      expect(body.myRow?.handle).toBe("moi");
    }));

  dbIt("myRank absent when signed-in user has 0 points", () =>
    withSchema(async () => {
      const me = await newUser("zero"), e = await newEvent(); await saveEvent(me, e, "saved");
      const body = await (await call("GET", me, "/api/leaderboard")).json() as { myRank?: number };
      expect(body.myRank).toBeUndefined();
    }));
});
