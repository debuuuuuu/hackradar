import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "../server/db.js";
import { orderPicks } from "../server/picks.js";
import { route } from "../server/router.js";
import { signSession } from "../server/session.js";
import { dbIt, withSchema } from "./helpers.js";

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved.SESSION_SECRET = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "s".repeat(32);
});
afterEach(() => {
  if (saved.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = saved.SESSION_SECRET;
});

const ORIGIN = "https://hackradar.test";

async function newUser(name = "Ann"): Promise<number> {
  const [row] = await query<{ id: number }>("INSERT INTO users (name) VALUES ($1) RETURNING id", [name]);
  await query("INSERT INTO preferences (user_id, themes) VALUES ($1, ARRAY['ai-ml'])", [row.id]);
  return Number(row.id);
}

async function newEvent(
  title: string,
  opts: { status?: string; mode?: string; start?: string; end?: string; invite?: boolean; deadline?: string } = {},
): Promise<number> {
  const [row] = await query<{ id: number }>(
    "INSERT INTO events (title, status, mode, start_date, end_date, invite_only, reg_deadline) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    [title, opts.status ?? "open", opts.mode ?? "offline", opts.start ?? null, opts.end ?? null, opts.invite ?? false, opts.deadline ?? null],
  );
  return Number(row.id);
}

const score = (uid: number, eventId: number, s: number, reason: string | null) =>
  query("INSERT INTO scores (user_id, event_id, score, reason) VALUES ($1, $2, $3, $4)", [uid, eventId, s, reason]);

const getPicks = (uid: number | null) =>
  route(
    new Request(`${ORIGIN}/api/me/picks`, {
      headers: uid === null ? {} : { cookie: `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!)}` },
    }),
  );

describe("orderPicks", () => {
  it("puts clashing picks last, then higher score first, capped at 6", () => {
    const mk = (id: number, score: number, clash: string | null) => ({ id, title: `t${id}`, score, why: null, clash });
    const out = orderPicks([mk(1, 90, "Exams"), mk(2, 50, null), mk(3, 70, null), ...[4, 5, 6, 7, 8].map((i) => mk(i, 10, null))]);
    expect(out.map((p) => p.id).slice(0, 3)).toEqual([3, 2, 4]);
    expect(out).toHaveLength(6);
    expect(out.some((p) => p.id === 1)).toBe(false);
  });
});

describe("GET /api/me/picks", () => {
  dbIt("401 when signed out", () =>
    withSchema(async () => {
      expect((await getPicks(null)).status).toBe(401);
    }),
  );

  dbIt("returns { picks: [] } with no scores", () =>
    withSchema(async () => {
      const uid = await newUser();
      const res = await getPicks(uid);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ picks: [] });
    }),
  );

  dbIt("returns only the caller's rows for open events; blank reason is why null", () =>
    withSchema(async () => {
      const me = await newUser();
      const other = await newUser("Bob");
      const a = await newEvent("Alpha");
      const closed = await newEvent("Closed", { status: "closed" });
      const theirs = await newEvent("Theirs");
      const blank = await newEvent("Blank");
      await score(me, a, 80, "Matches your AI interest.");
      await score(me, closed, 99, "Old");
      await score(other, theirs, 95, "Not mine");
      await score(me, blank, 60, "   ");
      const body = (await (await getPicks(me)).json()) as { picks: { id: number; title: string; score: number; why: string | null; clash: string | null }[] };
      expect(body.picks).toEqual([
        { id: a, title: "Alpha", score: 80, why: "Matches your AI interest.", clash: null },
        { id: blank, title: "Blank", score: 60, why: null, clash: null },
      ]);
    }),
  );

  dbIt("leaves out invite-only events and events already past their deadline", () =>
    withSchema(async () => {
      const me = await newUser();
      const fine = await newEvent("Fine", { deadline: "2099-01-01T00:00:00Z" });
      const invite = await newEvent("Invite", { invite: true });
      const past = await newEvent("Past", { deadline: "2020-01-01T00:00:00Z" });
      for (const id of [fine, invite, past]) await score(me, id, 80, "x");
      const body = (await (await getPicks(me)).json()) as { picks: { id: number }[] };
      expect(body.picks.map((p) => p.id)).toEqual([fine]);
    }),
  );

  dbIt("returns no picks once the caller has cleared their topics", () =>
    withSchema(async () => {
      const me = await newUser();
      await score(me, await newEvent("Alpha"), 80, "x");
      await query("UPDATE preferences SET themes = '{}' WHERE user_id = $1", [me]);
      expect(await (await getPicks(me)).json()).toEqual({ picks: [] });
    }),
  );

  dbIt("sorts a clashing pick after a lower-scored clear one and labels it", () =>
    withSchema(async () => {
      const me = await newUser();
      const far = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
      const farEnd = new Date(Date.now() + 41 * 86_400_000).toISOString().slice(0, 10);
      await query("INSERT INTO busy_periods (user_id, starts_on, ends_on, label) VALUES ($1, $2, $3, 'Exams')", [me, far, farEnd]);
      const clashing = await newEvent("Clashing", { start: `${far}T06:00:00Z`, end: `${farEnd}T06:00:00Z` });
      const clear = await newEvent("Clear", { start: "2099-01-01T06:00:00Z", end: "2099-01-02T06:00:00Z" });
      await score(me, clashing, 95, "great");
      await score(me, clear, 40, "ok");
      const body = (await (await getPicks(me)).json()) as { picks: { id: number; clash: string | null }[] };
      expect(body.picks.map((p) => [p.id, p.clash])).toEqual([
        [clear, null],
        [clashing, "Exams"],
      ]);
    }),
  );
});
