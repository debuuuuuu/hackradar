import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { query } from "../server/db.js";
import { route } from "../server/router.js";
import { signSession } from "../server/session.js";
import { dbIt, withSchema } from "./helpers.js";

const ORIGIN = "https://hackradar.test";
const cookie = (uid: number) =>
  `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!)}`;

async function newUser(opts?: { handle?: string; profilePublic?: boolean; termsAccepted?: boolean }): Promise<number> {
  const [row] = await query<{ id: number }>(
    "INSERT INTO users (name, email_hash) VALUES ($1, $2) RETURNING id",
    ["Ann", randomBytes(8).toString("hex")],
  );
  const uid = Number(row.id);
  if (opts?.handle !== undefined || opts?.profilePublic !== undefined || opts?.termsAccepted) {
    const sets: string[] = [];
    const vals: unknown[] = [uid];
    if (opts.handle !== undefined) { vals.push(opts.handle); sets.push(`handle = $${vals.length}`); }
    if (opts.profilePublic !== undefined) { vals.push(opts.profilePublic); sets.push(`profile_public = $${vals.length}`); }
    if (opts.termsAccepted) { sets.push(`terms_accepted_at = now()`); }
    if (sets.length > 0) {
      await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, vals);
    }
  }
  return uid;
}

async function newEvent(): Promise<number> {
  const [row] = await query<{ id: number }>(
    "INSERT INTO events (title, status, start_date) VALUES ($1, 'open', now()) RETURNING id",
    ["Test Hack"],
  );
  return Number(row.id);
}

async function addUserEvent(uid: number, eid: number, status: string, won = false): Promise<void> {
  await query(
    "INSERT INTO user_events (user_id, event_id, status, won) VALUES ($1, $2, $3, $4)",
    [uid, eid, status, won],
  );
}

async function addScore(uid: number, eid: number): Promise<void> {
  await query(
    "INSERT INTO scores (user_id, event_id, score) VALUES ($1, $2, 75)",
    [uid, eid],
  );
}

beforeEach(() => {
  process.env.SESSION_SECRET = "s".repeat(32);
});
afterEach(() => {
  delete process.env.SESSION_SECRET;
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

describe("profile API", () => {
  // 1. Public profile returns PublicProfile for public user
  dbIt("GET /api/profile/:handle 200 returns PublicProfile for public user", () =>
    withSchema(async () => {
      const uid = await newUser({ handle: "alice", profilePublic: true });
      const eid = await newEvent();
      await addUserEvent(uid, eid, "registered");

      const res = await call("GET", null, "/api/profile/alice");
      expect(res.status).toBe(200);
      const body = await res.json() as { handle: string; name: string; counts: { registered: number }; activity: unknown[]; isOwn: boolean };
      expect(body.handle).toBe("alice");
      expect(body.name).toBe("Ann");
      expect(body.counts.registered).toBe(1);
      expect(body.activity).toHaveLength(1);
      expect(body.isOwn).toBe(false);
    }));

  // 2. 404 when profile_public = false
  dbIt("GET /api/profile/:handle 404 when profile_public = false", () =>
    withSchema(async () => {
      await newUser({ handle: "secret", profilePublic: false });

      const res = await call("GET", null, "/api/profile/secret");
      expect(res.status).toBe(404);
    }));

  // 3. 404 for nonexistent handle
  dbIt("GET /api/profile/:handle 404 for nonexistent handle", () =>
    withSchema(async () => {
      const res = await call("GET", null, "/api/profile/nobody");
      expect(res.status).toBe(404);
    }));

  // 4. handle-check available
  dbIt("GET /api/profile/handle-check?q=newhandle returns available: true", () =>
    withSchema(async () => {
      const res = await call("GET", null, "/api/profile/handle-check?q=newhandle");
      expect(res.status).toBe(200);
      expect((await res.json() as { available: boolean }).available).toBe(true);
    }));

  // 5. handle-check taken
  dbIt("GET /api/profile/handle-check?q=takenhandle returns available: false", () =>
    withSchema(async () => {
      await newUser({ handle: "takenhandle" });

      const res = await call("GET", null, "/api/profile/handle-check?q=takenhandle");
      expect(res.status).toBe(200);
      expect((await res.json() as { available: boolean }).available).toBe(false);
    }));

  // 6. GET /api/me/profile 401 when unauthenticated
  dbIt("GET /api/me/profile 401 when unauthenticated", () =>
    withSchema(async () => {
      const res = await call("GET", null, "/api/me/profile");
      expect(res.status).toBe(401);
    }));

  // 7. GET /api/me/profile returns OwnProfile
  dbIt("GET /api/me/profile 200 returns OwnProfile", () =>
    withSchema(async () => {
      const uid = await newUser({ handle: "bob", profilePublic: true, termsAccepted: true });

      const res = await call("GET", uid, "/api/me/profile");
      expect(res.status).toBe(200);
      const body = await res.json() as { handle: string | null; profilePublic: boolean; termsAcceptedAt: string | null };
      expect(body.handle).toBe("bob");
      expect(body.profilePublic).toBe(true);
      expect(body.termsAcceptedAt).not.toBeNull();
    }));

  // 8. PATCH /api/me/profile 400 when terms not accepted
  dbIt("PATCH /api/me/profile 400 when terms not accepted", () =>
    withSchema(async () => {
      const uid = await newUser();

      const res = await call("PATCH", uid, "/api/me/profile", { handle: "newhandle" });
      expect(res.status).toBe(400);
    }));

  // 9. PATCH /api/me/profile sets handle + terms_accepted_at atomically
  dbIt("PATCH /api/me/profile sets handle + terms_accepted_at atomically", () =>
    withSchema(async () => {
      const uid = await newUser();

      const res = await call("PATCH", uid, "/api/me/profile", { handle: "myhandle", termsAccepted: true });
      expect(res.status).toBe(200);
      expect((await res.json() as { ok: boolean }).ok).toBe(true);

      // Verify in DB
      const rows = await query<{ handle: string; terms_accepted_at: Date | null }>(
        "SELECT handle, terms_accepted_at FROM users WHERE id = $1",
        [uid],
      );
      expect(rows[0].handle).toBe("myhandle");
      expect(rows[0].terms_accepted_at).not.toBeNull();
    }));

  // 10. PATCH /api/me/profile 409 on duplicate handle
  dbIt("PATCH /api/me/profile 409 on duplicate handle", () =>
    withSchema(async () => {
      await newUser({ handle: "taken", termsAccepted: true });
      const uid2 = await newUser({ termsAccepted: true });

      const res = await call("PATCH", uid2, "/api/me/profile", { handle: "taken", termsAccepted: true });
      expect(res.status).toBe(409);
    }));

  // 11. Public GET omits "skipped" marks from activity
  dbIt("Public GET omits skipped marks from activity", () =>
    withSchema(async () => {
      const uid = await newUser({ handle: "charlie", profilePublic: true });
      const eid1 = await newEvent();
      const eid2 = await newEvent();
      await addUserEvent(uid, eid1, "registered");
      await addScore(uid, eid2); // scored but not saved => skipped mark for owner

      // Public access: no skipped marks
      const pubRes = await call("GET", null, "/api/profile/charlie");
      expect(pubRes.status).toBe(200);
      const pubBody = await pubRes.json() as { activity: Array<{ mark: string }> };
      expect(pubBody.activity.some(a => a.mark === "skipped")).toBe(false);
      expect(pubBody.activity).toHaveLength(1); // only the registered event

      // Owner access: sees skipped marks
      const ownRes = await call("GET", uid, "/api/profile/charlie");
      expect(ownRes.status).toBe(200);
      const ownBody = await ownRes.json() as { activity: Array<{ mark: string }> };
      expect(ownBody.activity.some(a => a.mark === "skipped")).toBe(true);
      expect(ownBody.activity).toHaveLength(2);
    }));
});
