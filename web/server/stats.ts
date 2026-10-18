import { query } from "./db.js";

export interface AdminStats {
  totalUsers: number;
  newUsers7d: number;
  activeUsers7d: number;
  onboardedPct: number;
  loginsByDay: { day: string; discord: number; email: number; google: number }[];
  signupsByDay: { day: string; count: number }[];
  channelAdoption: { email: number; discord: number; whatsapp: number };
  lastPipelineRun: { startedAt: string; status: string; notificationsSent: number } | null;
}

const DAYS = 30;

/**
 * Aggregate counts for the owner dashboard. Contains no personal data: only counts, day labels and run status.
 *
 * Definitions:
 * - A "day" is an IST calendar day: (ts AT TIME ZONE 'Asia/Kolkata')::date. So 23:30 UTC lands on the NEXT IST day.
 * - loginsByDay / signupsByDay cover the last 30 IST days INCLUDING today (relative to `now`), oldest first, zero-filled.
 * - "Last 7 days" is the half-open window (now - 7 days, now]: a row stamped exactly now - 7 days is OUT, one a
 *   millisecond later is IN. Rows stamped after `now` are ignored everywhere.
 */
export async function adminStats(now: Date = new Date()): Promise<AdminStats> {
  const at = now.toISOString();

  // users: total, created in the last 7 days, onboarded.
  const [u] = await query<{ total: string; new7: string; onboarded: string }>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE created_at > $1::timestamptz - interval '7 days' AND created_at <= $1::timestamptz) AS new7,
            count(*) FILTER (WHERE onboarded_at IS NOT NULL) AS onboarded
       FROM users`,
    [at],
  );
  const totalUsers = Number(u.total);
  // One decimal; 0 (not NaN) when there are no users.
  const onboardedPct = totalUsers === 0 ? 0 : Math.round((Number(u.onboarded) / totalUsers) * 1000) / 10;

  // activeUsers7d: DISTINCT users with at least one login in the window.
  const [a] = await query<{ n: string }>(
    `SELECT count(DISTINCT user_id) AS n FROM logins
      WHERE at > $1::timestamptz - interval '7 days' AND at <= $1::timestamptz`,
    [at],
  );

  // 30 IST days ending today, oldest first, LEFT JOINed so empty days come back as zero.
  const loginRows = await query<{ day: string; discord: string; email: string; google: string }>(
    `WITH d AS (
       SELECT (($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date - g) AS day FROM generate_series(0, ${DAYS - 1}) AS g
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            count(l.id) FILTER (WHERE l.method = 'discord') AS discord,
            count(l.id) FILTER (WHERE l.method = 'email') AS email,
            count(l.id) FILTER (WHERE l.method = 'google') AS google
       FROM d
       LEFT JOIN logins l
         ON (l.at AT TIME ZONE 'Asia/Kolkata')::date = d.day
        AND l.at <= $1::timestamptz AND l.at >= $1::timestamptz - interval '${DAYS + 1} days'
      GROUP BY d.day ORDER BY d.day`,
    [at],
  );

  const signupRows = await query<{ day: string; n: string }>(
    `WITH d AS (
       SELECT (($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date - g) AS day FROM generate_series(0, ${DAYS - 1}) AS g
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(u.id) AS n
       FROM d
       LEFT JOIN users u
         ON (u.created_at AT TIME ZONE 'Asia/Kolkata')::date = d.day
        AND u.created_at <= $1::timestamptz AND u.created_at >= $1::timestamptz - interval '${DAYS + 1} days'
      GROUP BY d.day ORDER BY d.day`,
    [at],
  );

  // channelAdoption: DISTINCT users (one preferences row each) with the channel in ANY of digest/ping/reminders.
  // Users without a preferences row never match the join, so they count as 0.
  const chRows = await query<{ ch: string; n: string }>(
    `SELECT c.ch, count(p.user_id) AS n
       FROM (VALUES ('email'), ('discord'), ('whatsapp')) AS c(ch)
       LEFT JOIN preferences p
         ON jsonb_exists(p.channels -> 'digest', c.ch)
         OR jsonb_exists(p.channels -> 'ping', c.ch)
         OR jsonb_exists(p.channels -> 'reminders', c.ch)
      GROUP BY c.ch`,
  );
  const ch = Object.fromEntries(chRows.map((r) => [r.ch, Number(r.n)]));

  // lastPipelineRun: newest runs row by started_at.
  const runs = await query<{ started_at: Date; status: string; notifications_sent: number }>(
    "SELECT started_at, status, notifications_sent FROM runs ORDER BY started_at DESC LIMIT 1",
  );

  return {
    totalUsers,
    newUsers7d: Number(u.new7),
    activeUsers7d: Number(a.n),
    onboardedPct,
    loginsByDay: loginRows.map((r) => ({ day: r.day, discord: Number(r.discord), email: Number(r.email), google: Number(r.google) })),
    signupsByDay: signupRows.map((r) => ({ day: r.day, count: Number(r.n) })),
    channelAdoption: { email: ch.email ?? 0, discord: ch.discord ?? 0, whatsapp: ch.whatsapp ?? 0 },
    lastPipelineRun: runs[0]
      ? {
          startedAt: new Date(runs[0].started_at).toISOString(),
          status: runs[0].status,
          notificationsSent: Number(runs[0].notifications_sent),
        }
      : null,
  };
}
