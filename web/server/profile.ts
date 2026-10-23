import { query, transaction } from "./db.js";

export const RESERVED_HANDLES = new Set([
  "admin", "api", "u", "leaderboard", "terms", "settings", "events", "signin",
]);
export const HANDLE_RE = /^[a-z][a-z0-9-]{2,29}$/;

export interface ActivityMark {
  eventId: number;
  title: string;
  startDate: string;        // IST ISO date "YYYY-MM-DD"
  mark: "registered" | "submitted" | "won" | "skipped";
  projectUrl?: string;
}

export interface ProfileCounts {
  registered: number;
  submitted: number;
  won: number;
}

export interface PublicProfile {
  handle: string;
  name: string;
  counts: ProfileCounts;
  activity: ActivityMark[];
  isOwn: boolean;
}

export interface OwnProfile {
  handle: string | null;
  profilePublic: boolean;
  termsAcceptedAt: string | null;
}

export class ProfileError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function getPublicProfile(
  handle: string,
  callerUid?: number,
): Promise<PublicProfile> {
  // Fetch the user by handle
  const users = await query<{
    id: number;
    name: string;
    profile_public: boolean;
  }>(
    "SELECT id, name, profile_public FROM users WHERE handle = $1",
    [handle],
  );
  if (users.length === 0) throw new ProfileError(404, "not found");

  const user = users[0];
  const isOwn = callerUid !== undefined && Number(user.id) === callerUid;

  // If not the owner and profile is not public, return 404
  if (!isOwn && !user.profile_public) throw new ProfileError(404, "not found");

  const uid = Number(user.id);

  // Fetch user_events with event info for activity
  const eventRows = await query<{
    event_id: number;
    title: string;
    start_date: string | null;
    status: string;
    won: boolean;
    project_url: string | null;
  }>(
    `SELECT ue.event_id, e.title,
            to_char(e.start_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS start_date,
            ue.status, ue.won, ue.project_url
     FROM user_events ue
     JOIN events e ON e.id = ue.event_id
     WHERE ue.user_id = $1
       AND ue.status IN ('registered', 'submitted', 'done')
     ORDER BY e.start_date DESC NULLS LAST`,
    [uid],
  );

  const activity: ActivityMark[] = [];
  let registeredCount = 0;
  let submittedCount = 0;
  let wonCount = 0;

  for (const row of eventRows) {
    registeredCount++;
    if (row.status === "submitted" || row.status === "done") submittedCount++;
    if (row.won) wonCount++;

    let mark: ActivityMark["mark"];
    if (row.won) {
      mark = "won";
    } else if (row.status === "submitted" || row.status === "done") {
      mark = "submitted";
    } else {
      mark = "registered";
    }

    const item: ActivityMark = {
      eventId: Number(row.event_id),
      title: row.title,
      startDate: row.start_date ?? "",
      mark,
    };
    if (row.project_url) item.projectUrl = row.project_url;
    activity.push(item);
  }

  // Owner-only: add skipped marks from scores with no matching user_events
  if (isOwn) {
    const skippedRows = await query<{
      event_id: number;
      title: string;
      start_date: string | null;
    }>(
      `SELECT s.event_id, e.title,
              to_char(e.start_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS start_date
       FROM scores s
       JOIN events e ON e.id = s.event_id
       WHERE s.user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM user_events ue2
           WHERE ue2.user_id = s.user_id AND ue2.event_id = s.event_id
         )
       ORDER BY e.start_date DESC NULLS LAST`,
      [uid],
    );

    for (const row of skippedRows) {
      activity.push({
        eventId: Number(row.event_id),
        title: row.title,
        startDate: row.start_date ?? "",
        mark: "skipped",
      });
    }
  }

  return {
    handle,
    name: user.name,
    counts: { registered: registeredCount, submitted: submittedCount, won: wonCount },
    activity,
    isOwn,
  };
}

export async function getOwnProfile(uid: number): Promise<OwnProfile> {
  const rows = await query<{
    handle: string | null;
    terms_accepted_at: Date | null;
    profile_public: boolean;
  }>(
    "SELECT handle, terms_accepted_at, profile_public FROM users WHERE id = $1",
    [uid],
  );
  if (rows.length === 0) throw new ProfileError(404, "not found");
  const r = rows[0];
  return {
    handle: r.handle ?? null,
    profilePublic: r.profile_public,
    termsAcceptedAt: r.terms_accepted_at ? r.terms_accepted_at.toISOString() : null,
  };
}

export async function setProfile(
  uid: number,
  patch: { handle?: string; termsAccepted?: boolean; profilePublic?: boolean },
): Promise<{ ok: true }> {
  if (patch.handle !== undefined) {
    // Validate handle format
    if (!HANDLE_RE.test(patch.handle)) throw new ProfileError(400, "invalid handle format");
    if (RESERVED_HANDLES.has(patch.handle)) throw new ProfileError(400, "handle is reserved");

    // Check terms: must be accepted now or already in DB
    if (!patch.termsAccepted) {
      const rows = await query<{ terms_accepted_at: Date | null }>(
        "SELECT terms_accepted_at FROM users WHERE id = $1",
        [uid],
      );
      if (rows.length === 0 || rows[0].terms_accepted_at === null) {
        throw new ProfileError(400, "terms must be accepted to set a handle");
      }
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [uid];

  if (patch.handle !== undefined) {
    values.push(patch.handle);
    sets.push(`handle = $${values.length}`);
  }
  if (patch.termsAccepted === true) {
    sets.push(`terms_accepted_at = COALESCE(terms_accepted_at, now())`);
  }
  if (patch.profilePublic !== undefined) {
    values.push(patch.profilePublic);
    sets.push(`profile_public = $${values.length}`);
  }

  if (sets.length === 0) return { ok: true };

  try {
    await query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $1`,
      values,
    );
  } catch (e: unknown) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "23505") {
      throw new ProfileError(409, "handle already taken");
    }
    throw e;
  }

  return { ok: true };
}

export async function checkHandle(handle: string): Promise<{ available: boolean }> {
  if (!HANDLE_RE.test(handle) || RESERVED_HANDLES.has(handle)) {
    return { available: false };
  }
  const rows = await query<{ n: string }>(
    "SELECT COUNT(*) AS n FROM users WHERE handle = $1",
    [handle],
  );
  const count = Number(rows[0]?.n ?? 0);
  return { available: count === 0 };
}
