import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "../server/db.js";
import { route } from "../server/router.js";
import { signSession } from "../server/session.js";
import { adminStats } from "../server/stats.js";
import { dbIt, withSchema } from "./helpers.js";

const NOW = new Date("2026-10-15T10:00:00Z"); // 15:30 IST on 15 Oct 2026
const MS_DAY = 86_400_000;

async function user(
  name: string,
  createdAt: string,
  opts: { onboarded?: boolean; prefs?: object | null } = {},
): Promise<number> {
  const [row] = await query<{ id: number }>(
    "INSERT INTO users (name, created_at, onboarded_at) VALUES ($1, $2, $3) RETURNING id",
    [name, createdAt, opts.onboarded ? createdAt : null],
  );
  const id = Number(row.id);
  if (opts.prefs !== null) {
    if (opts.prefs) await query("INSERT INTO preferences (user_id, channels) VALUES ($1, $2)", [id, JSON.stringify(opts.prefs)]);
    else await query("INSERT INTO preferences (user_id) VALUES ($1)", [id]);
  }
  return id;
}
const login = (uid: number, method: "discord" | "email" | "google", at: string) =>
  query("INSERT INTO logins (user_id, method, at) VALUES ($1, $2, $3)", [uid, method, at]);

describe("adminStats", () => {
  dbIt("counts users, logins and signups by IST day, zero-filled and oldest first", async () => {
    await withSchema(async () => {
      const a = await user("Ann Secret", "2026-10-14T20:00:00Z", { onboarded: true }); // IST 15 Oct
      const b = await user("Bob Secret", "2026-10-10T05:00:00Z", { onboarded: true }); // IST 10 Oct
      const c = await user("Cy Secret", "2026-09-20T05:00:00Z"); // IST 20 Sep
      await login(a, "discord", "2026-10-15T05:00:00Z"); // IST 15 Oct
      await login(a, "email", "2026-10-14T18:29:00Z"); // 18:29 UTC = 23:59 IST, same IST day (14 Oct)
      await login(b, "email", "2026-10-14T23:30:00Z"); // 23:30 UTC -> NEXT IST day (15 Oct 05:00)
      await login(b, "email", "2026-10-12T06:00:00Z"); // IST 12 Oct
      await login(c, "discord", "2026-09-20T10:00:00Z"); // IST 20 Sep: inside the 30 days, outside 7
      await login(c, "email", "2026-09-10T10:00:00Z"); // before the 30-day window: ignored
      await login(a, "email", "2026-10-16T01:00:00Z"); // after `now`: ignored

      const s = await adminStats(NOW);
      expect(s.totalUsers).toBe(3);
      expect(s.newUsers7d).toBe(2);
      expect(s.activeUsers7d).toBe(2); // Ann has several logins but counts once; Cy is older than 7 days
      expect(s.onboardedPct).toBe(66.7);

      expect(s.loginsByDay).toHaveLength(30);
      expect(s.loginsByDay[0].day).toBe("2026-09-16");
      expect(s.loginsByDay[29].day).toBe("2026-10-15");
      const days = s.loginsByDay.map((d) => d.day);
      expect(days).toEqual([...days].sort());
      const expected = new Map([
        ["2026-10-15", { discord: 1, email: 1, google: 0 }],
        ["2026-10-14", { discord: 0, email: 1, google: 0 }],
        ["2026-10-12", { discord: 0, email: 1, google: 0 }],
        ["2026-09-20", { discord: 1, email: 0, google: 0 }],
      ]);
      expect(s.loginsByDay).toEqual(days.map((day) => ({ day, ...(expected.get(day) ?? { discord: 0, email: 0, google: 0 }) })));

      const signups = new Map([
        ["2026-10-15", 1],
        ["2026-10-10", 1],
        ["2026-09-20", 1],
      ]);
      expect(s.signupsByDay).toEqual(days.map((day) => ({ day, count: signups.get(day) ?? 0 })));
    });
  });

  dbIt("is zero with no data: no divide by zero, no pipeline run", async () => {
    await withSchema(async () => {
      const s = await adminStats(NOW);
      expect(s.totalUsers).toBe(0);
      expect(s.onboardedPct).toBe(0);
      expect(s.newUsers7d).toBe(0);
      expect(s.activeUsers7d).toBe(0);
      expect(s.loginsByDay).toHaveLength(30);
      expect(s.loginsByDay.every((d) => d.discord === 0 && d.email === 0 && d.google === 0)).toBe(true);
      expect(s.signupsByDay.every((d) => d.count === 0)).toBe(true);
      expect(s.channelAdoption).toEqual({ email: 0, discord: 0, whatsapp: 0 });
      expect(s.lastPipelineRun).toBeNull();
    });
  });

  dbIt("7-day window is (now - 7d, now]: a row exactly 7 days old is out, 1 ms younger is in", async () => {
    await withSchema(async () => {
      const edge = new Date(NOW.getTime() - 7 * MS_DAY).toISOString();
      const inside = new Date(NOW.getTime() - 7 * MS_DAY + 1).toISOString();
      const d = await user("Dee", edge);
      const e = await user("Eve", inside);
      await login(d, "email", edge);
      await login(e, "email", inside);
      const s = await adminStats(NOW);
      expect(s.totalUsers).toBe(2);
      expect(s.newUsers7d).toBe(1);
      expect(s.activeUsers7d).toBe(1);
    });
  });

  dbIt("counts each user once per channel across digest, ping and reminders; ignores users without preferences", async () => {
    await withSchema(async () => {
      await user("A", "2026-10-01T00:00:00Z", { prefs: { digest: ["email"], ping: ["email"], reminders: ["email"] } });
      await user("B", "2026-10-01T00:00:00Z", { prefs: { digest: ["discord"], ping: [], reminders: ["discord", "whatsapp"] } });
      await user("C", "2026-10-01T00:00:00Z", { prefs: null }); // no preferences row
      await user("D", "2026-10-01T00:00:00Z", { prefs: { digest: ["email"], ping: ["discord"], reminders: [] } });
      await user("E", "2026-10-01T00:00:00Z", { prefs: { digest: [], ping: [], reminders: [] } });
      const s = await adminStats(NOW);
      expect(s.totalUsers).toBe(5);
      expect(s.channelAdoption).toEqual({ email: 2, discord: 2, whatsapp: 1 });
    });
  });

  dbIt("reports the newest pipeline run and leaks no personal data", async () => {
    await withSchema(async () => {
      await user("Zed Hidden", "2026-10-01T00:00:00Z");
      await query("INSERT INTO runs (started_at, status, notifications_sent) VALUES ($1, 'failed', 1), ($2, 'partial', 7)", [
        "2026-10-13T23:17:00Z",
        "2026-10-14T23:17:00Z",
      ]);
      const s = await adminStats(NOW);
      expect(s.lastPipelineRun).toEqual({ startedAt: "2026-10-14T23:17:00.000Z", status: "partial", notificationsSent: 7 });
      const text = JSON.stringify(s);
      expect(text).not.toContain("@");
      expect(text).not.toContain("Zed");
      const keys = new Set<string>();
      (function walk(v: unknown) {
        if (v && typeof v === "object") {
          for (const [k, x] of Object.entries(v)) {
            keys.add(k);
            walk(x);
          }
        }
      })(s);
      for (const bad of ["phone", "name", "token", "email_enc", "callmebot_phone_enc"]) expect(keys.has(bad)).toBe(false);
      // "email" appears only as the sign-in method / channel counter, never as an address (no "@" above).
    });
  });
});

describe("GET /api/admin/stats", () => {
  const prev = process.env.SESSION_SECRET;
  beforeEach(() => {
    process.env.SESSION_SECRET = "s".repeat(32);
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prev;
  });
  const call = (uid: number | null) =>
    route(
      new Request("https://hackradar.test/api/admin/stats", {
        headers: uid === null ? {} : { cookie: `hr_session=${signSession({ uid }, process.env.SESSION_SECRET!)}` },
      }),
    );

  dbIt("401 anonymous or deleted user, 403 normal user, 200 admin; always no-store", async () => {
    await withSchema(async () => {
      const normal = await user("Normal", "2026-10-01T00:00:00Z");
      const admin = await user("Boss", "2026-10-01T00:00:00Z");
      const gone = await user("Gone", "2026-10-01T00:00:00Z");
      await query("UPDATE users SET is_admin = true WHERE id = $1", [admin]);
      await query("DELETE FROM users WHERE id = $1", [gone]);

      const anon = await call(null);
      expect(anon.status).toBe(401);
      expect(anon.headers.get("cache-control")).toBe("no-store");
      const deleted = await call(gone);
      expect(deleted.status).toBe(401);
      expect(deleted.headers.get("cache-control")).toBe("no-store");
      const nope = await call(normal);
      expect(nope.status).toBe(403);
      expect(nope.headers.get("cache-control")).toBe("no-store");
      expect(await nope.text()).not.toContain("totalUsers");

      const ok = await call(admin);
      expect(ok.status).toBe(200);
      expect(ok.headers.get("cache-control")).toBe("no-store");
      const body = await ok.text();
      expect(body).not.toContain("@");
      expect(JSON.parse(body).totalUsers).toBe(2);

      // Admin status comes from the database row, not the cookie: revoking it takes effect immediately.
      await query("UPDATE users SET is_admin = false WHERE id = $1", [admin]);
      expect((await call(admin)).status).toBe(403);
    });
  });
});
