import { createHmac } from "node:crypto";
import { gcalLink, toIcsFeed } from "./calendar.js";
import { query } from "./db.js";

export interface SavedEvent {
  eventId: number;
  title: string;
  status: string;
  won: boolean;
  projectUrl: string | null;
  startDate: string | null;
  regDeadline: string | null;
  sources: { url: string; source: string }[];
  gcalLink: string;
  createdAt: string;
}

export interface SavePatch {
  status?: string;
  won?: boolean;
  project_url?: string | null;
}

/** HMAC-SHA256(CAL_FEED_SECRET, userId) as hex. Throws when CAL_FEED_SECRET is not set. */
export function calToken(userId: number): string {
  const secret = process.env.CAL_FEED_SECRET;
  if (!secret) throw new Error("CAL_FEED_SECRET not set");
  return createHmac("sha256", secret).update(String(userId)).digest("hex");
}

const VALID_STATUSES = new Set(["saved", "registered", "submitted", "done", "dismissed"]);

/** The one allowed next step in the forward chain; any→dismissed is handled separately. */
const NEXT_STATUS: Record<string, string> = {
  saved: "registered",
  registered: "submitted",
  submitted: "done",
};

function isValidTransition(current: string, next: string): boolean {
  if (next === "dismissed") return true;
  return NEXT_STATUS[current] === next;
}

/**
 * Saves an event for a user with status "saved". Idempotent: if the row already
 * exists the current status is returned unchanged.
 */
export async function upsertSave(userId: number, eventId: number): Promise<string> {
  const rows = await query<{ status: string }>(
    `INSERT INTO user_events (user_id, event_id, status)
     VALUES ($1, $2, 'saved')
     ON CONFLICT (user_id, event_id) DO NOTHING
     RETURNING status`,
    [userId, eventId],
  );
  if (rows.length > 0) return rows[0].status;
  // Conflict: row already existed; read current status.
  const existing = await query<{ status: string }>(
    "SELECT status FROM user_events WHERE user_id = $1 AND event_id = $2",
    [userId, eventId],
  );
  return existing[0]?.status ?? "saved";
}

/**
 * Updates fields on a saved event. Returns the new status, or null when the row
 * does not exist. Throws a StatusError on invalid transitions.
 */
export class StatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatusError";
  }
}

export async function updateSave(userId: number, eventId: number, patch: SavePatch): Promise<string | null> {
  // Validate status value first (before hitting the DB).
  if (patch.status !== undefined && !VALID_STATUSES.has(patch.status)) {
    throw new StatusError(`Invalid status: ${patch.status}`);
  }

  // If transitioning status, verify the transition is allowed.
  if (patch.status !== undefined) {
    const rows = await query<{ status: string }>(
      "SELECT status FROM user_events WHERE user_id = $1 AND event_id = $2",
      [userId, eventId],
    );
    if (rows.length === 0) return null;
    const current = rows[0].status;
    if (!isValidTransition(current, patch.status)) {
      throw new StatusError(`Cannot transition from "${current}" to "${patch.status}"`);
    }
  }

  // Build dynamic SET clause.
  const setClauses: string[] = ["updated_at = now()"];
  const values: unknown[] = [userId, eventId];
  let idx = 3;

  if (patch.status !== undefined) {
    setClauses.push(`status = $${idx++}`);
    values.push(patch.status);
  }
  if (patch.won !== undefined) {
    setClauses.push(`won = $${idx++}`);
    values.push(patch.won);
  }
  if ("project_url" in patch) {
    setClauses.push(`project_url = $${idx++}`);
    values.push(patch.project_url);
  }

  const rows = await query<{ status: string }>(
    `UPDATE user_events SET ${setClauses.join(", ")}
     WHERE user_id = $1 AND event_id = $2
     RETURNING status`,
    values,
  );
  if (rows.length === 0) return null;
  return rows[0].status;
}

/** Deletes a saved event. Returns false when the row does not exist. */
export async function deleteSave(userId: number, eventId: number): Promise<boolean> {
  const rows = await query(
    "DELETE FROM user_events WHERE user_id = $1 AND event_id = $2 RETURNING event_id",
    [userId, eventId],
  );
  return rows.length > 0;
}

type ListRow = {
  eventId: string;
  title: string;
  status: string;
  won: boolean;
  projectUrl: string | null;
  startDate: string | null;
  regDeadline: string | null;
  sources: string; // JSON array string from pg
  createdAt: string;
  city: string | null;
  startDateTs: string | null;
  endDateTs: string | null;
  regDeadlineTs: string | null;
};

/** Lists all saved events for a user, newest first. */
export async function listSaves(userId: number): Promise<SavedEvent[]> {
  const rows = await query<ListRow>(
    `SELECT
       ue.event_id::text AS "eventId",
       e.title,
       ue.status,
       ue.won,
       ue.project_url AS "projectUrl",
       to_char(e.start_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS "startDate",
       to_char(e.reg_deadline AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS "regDeadline",
       COALESCE(
         json_agg(json_build_object('url', es.url, 'source', es.source) ORDER BY es.first_seen_at)
         FILTER (WHERE es.id IS NOT NULL),
         '[]'::json
       ) AS sources,
       ue.created_at AS "createdAt",
       e.city AS city,
       e.start_date::text AS "startDateTs",
       e.end_date::text AS "endDateTs",
       e.reg_deadline::text AS "regDeadlineTs"
     FROM user_events ue
     JOIN events e ON e.id = ue.event_id
     LEFT JOIN event_sources es ON es.event_id = e.id
     WHERE ue.user_id = $1
     GROUP BY ue.user_id, ue.event_id, e.id, ue.status, ue.won, ue.project_url,
              ue.created_at, e.title, e.start_date, e.end_date, e.reg_deadline, e.city
     ORDER BY ue.created_at DESC`,
    [userId],
  );

  return rows.map((r) => {
    const sourcesArr: { url: string; source: string }[] =
      typeof r.sources === "string" ? (JSON.parse(r.sources) as { url: string; source: string }[]) : (r.sources as unknown as { url: string; source: string }[]);
    const link = gcalLink({
      title: r.title,
      startDate: r.startDateTs,
      endDate: r.endDateTs,
      regDeadline: r.regDeadlineTs,
      city: r.city,
      sources: sourcesArr,
    });
    return {
      eventId: Number(r.eventId),
      title: r.title,
      status: r.status,
      won: Boolean(r.won),
      projectUrl: r.projectUrl,
      startDate: r.startDate,
      regDeadline: r.regDeadline,
      sources: sourcesArr,
      gcalLink: link,
      createdAt: r.createdAt,
    };
  });
}

/** Returns the ICS feed for a user's saved events as a string. */
export async function calFeed(userId: number): Promise<string> {
  const events = await listSaves(userId);
  const calEvents = events.map((e) => ({
    id: e.eventId,
    title: e.title,
    startDate: e.startDate,
    endDate: null as string | null,
    regDeadline: e.regDeadline,
    city: null as string | null,
    sources: e.sources,
  }));
  return toIcsFeed(calEvents, "HackRadar");
}
