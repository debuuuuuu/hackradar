import { query } from "./db.js";

export interface LeaderboardRow {
  rank: number;
  handle: string;
  points: number;
  registered: number;
  submitted: number;
  won: number;
  isMe: boolean;
}

export interface LeaderboardResponse {
  rows: LeaderboardRow[];
  total: number;
  myRank?: number;
  myRow?: LeaderboardRow;
}

export interface LeaderboardOptions {
  period?: string;
  theme?: string;
  city?: string;
  limit?: number;
  offset?: number;
  callerUid?: number | null;
}

/** The shared scoring CASE expression — must match the HAVING clause exactly. */
const SCORE_CASE = `
  CASE
    WHEN ue.won AND ue.project_url IS NOT NULL THEN 10
    WHEN ue.status = 'submitted' AND ue.project_url IS NOT NULL THEN 3
    WHEN ue.status = 'registered' THEN 1
    ELSE 0
  END`;

/**
 * Build the scored + ranked CTEs as a SQL fragment.
 * Returns { cte: string, params: unknown[], nextParamIdx: number }
 */
function buildScoredCte(opts: {
  period?: string;
  theme?: string;
  city?: string;
  startIdx?: number;
}): { cte: string; params: unknown[]; nextIdx: number } {
  const params: unknown[] = [];
  let n = opts.startIdx ?? 1;
  const conditions: string[] = [];

  if (opts.period === "month") {
    conditions.push(`ue.updated_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')`);
  }

  if (opts.theme !== undefined && opts.theme !== "") {
    params.push(opts.theme);
    conditions.push(`p.themes && ARRAY[$${n}::text]`);
    n++;
  }

  if (opts.city !== undefined && opts.city !== "") {
    params.push(opts.city);
    conditions.push(`p.home_city ILIKE $${n}`);
    n++;
  }

  const extraWhere = conditions.length > 0 ? "\n    AND " + conditions.join("\n    AND ") : "";

  const cte = `
WITH scored AS (
  SELECT
    u.id,
    u.handle,
    SUM(${SCORE_CASE})::int AS points,
    COUNT(*) FILTER (WHERE ue.status = 'registered')::int AS registered,
    COUNT(*) FILTER (WHERE ue.status = 'submitted' AND ue.project_url IS NOT NULL)::int AS submitted,
    COUNT(*) FILTER (WHERE ue.won AND ue.project_url IS NOT NULL)::int AS won,
    MIN(ue.updated_at) FILTER (WHERE
      (ue.won AND ue.project_url IS NOT NULL) OR
      (ue.status = 'submitted' AND ue.project_url IS NOT NULL) OR
      ue.status = 'registered'
    ) AS first_scored_at
  FROM users u
  JOIN user_events ue ON ue.user_id = u.id
  LEFT JOIN preferences p ON p.user_id = u.id
  WHERE u.handle IS NOT NULL
    AND u.profile_public = true${extraWhere}
  GROUP BY u.id, u.handle
  HAVING SUM(
    CASE
      WHEN ue.won AND ue.project_url IS NOT NULL THEN 10
      WHEN ue.status = 'submitted' AND ue.project_url IS NOT NULL THEN 3
      WHEN ue.status = 'registered' THEN 1
      ELSE 0
    END
  ) > 0
),
ranked AS (
  SELECT *, RANK() OVER (ORDER BY points DESC, first_scored_at ASC NULLS LAST) AS rank,
         COUNT(*) OVER () AS total
  FROM scored
)`;

  return { cte, params, nextIdx: n };
}

export async function fetchLeaderboard(opts: LeaderboardOptions): Promise<LeaderboardResponse> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = opts.offset ?? 0;
  const callerUid = opts.callerUid ?? null;

  const { cte, params, nextIdx } = buildScoredCte({
    period: opts.period,
    theme: opts.theme,
    city: opts.city,
    startIdx: 1,
  });

  // Add limit and offset params
  const limitIdx = nextIdx;
  const offsetIdx = nextIdx + 1;
  params.push(limit, offset);

  const mainSql = `${cte}
SELECT
  rank::int AS rank,
  handle,
  points,
  registered,
  submitted,
  won,
  total::int AS total,
  id
FROM ranked
ORDER BY rank, handle
LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

  interface RawRow {
    rank: number;
    handle: string;
    points: number;
    registered: number;
    submitted: number;
    won: number;
    total: number;
    id: number;
  }

  const rawRows = await query<RawRow>(mainSql, params);

  const total = rawRows.length > 0 ? Number(rawRows[0].total) : 0;
  const returnedIds = new Set(rawRows.map((r) => Number(r.id)));

  const rows: LeaderboardRow[] = rawRows.map((r) => ({
    rank: Number(r.rank),
    handle: r.handle,
    points: Number(r.points),
    registered: Number(r.registered),
    submitted: Number(r.submitted),
    won: Number(r.won),
    isMe: callerUid !== null && Number(r.id) === callerUid,
  }));

  // If no callerUid, or caller is already in the window, skip myRank
  if (callerUid === null || returnedIds.has(callerUid)) {
    return { rows, total };
  }

  // Fetch myRank — run same CTE without LIMIT/OFFSET, filtered to callerUid
  const { cte: myCte, params: myParams, nextIdx: myNextIdx } = buildScoredCte({
    period: opts.period,
    theme: opts.theme,
    city: opts.city,
    startIdx: 1,
  });

  myParams.push(callerUid);
  const myUidIdx = myNextIdx;

  const myRankSql = `${myCte}
SELECT
  rank::int AS rank,
  handle,
  points,
  registered,
  submitted,
  won,
  id
FROM ranked
WHERE id = $${myUidIdx}`;

  interface MyRawRow {
    rank: number;
    handle: string;
    points: number;
    registered: number;
    submitted: number;
    won: number;
    id: number;
  }

  const myRows = await query<MyRawRow>(myRankSql, myParams);

  if (myRows.length === 0) {
    // Caller has 0 points or is excluded by filters — omit myRank
    return { rows, total };
  }

  const mr = myRows[0];
  const myRow: LeaderboardRow = {
    rank: Number(mr.rank),
    handle: mr.handle,
    points: Number(mr.points),
    registered: Number(mr.registered),
    submitted: Number(mr.submitted),
    won: Number(mr.won),
    isMe: true,
  };

  return { rows, total, myRank: myRow.rank, myRow };
}
