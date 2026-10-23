import { clashLabel, istToday, type BusyInput } from "./busy.js";
import { query } from "./db.js";

export const MAX_PICKS = 6;

export interface Pick {
  id: number;
  title: string;
  score: number;
  why: string | null;
  clash: string | null;
}

/** Clear picks first, then clashing ones; highest score first inside each group; at most MAX_PICKS. */
export function orderPicks(picks: Pick[]): Pick[] {
  return [...picks].sort((a, b) => Number(a.clash !== null) - Number(b.clash !== null) || b.score - a.score || a.id - b.id).slice(0, MAX_PICKS);
}

interface Row {
  id: string | number;
  title: string;
  score: number;
  reason: string | null;
  mode: string | null;
  start_date: Date | null;
  end_date: Date | null;
  submission_deadline: Date | null;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/**
 * The caller's scored open events, clash-labelled against their upcoming busy periods. Same hard rules
 * as the digest: no invite-only events, none already past their deadline, nothing without chosen topics.
 * (The place and format filter is not applied here yet; clashes are labelled instead.)
 */
export async function getPicks(uid: number): Promise<Pick[]> {
  const rows = await query<Row>(
    `SELECT e.id, e.title, s.score, s.reason, e.mode, e.start_date, e.end_date, e.submission_deadline
       FROM scores s JOIN events e ON e.id = s.event_id
       JOIN preferences p ON p.user_id = s.user_id AND cardinality(p.themes) > 0
      WHERE s.user_id = $1 AND e.status = 'open' AND NOT e.invite_only
        AND (COALESCE(e.reg_deadline, e.submission_deadline, e.end_date) IS NULL
             OR COALESCE(e.reg_deadline, e.submission_deadline, e.end_date) >= now())`,
    [uid],
  );
  const periods = await query<{ startsOn: string; endsOn: string; label: string }>(
    `SELECT to_char(starts_on, 'YYYY-MM-DD') AS "startsOn", to_char(ends_on, 'YYYY-MM-DD') AS "endsOn", label
       FROM busy_periods WHERE user_id = $1 AND ends_on >= $2`,
    [uid, istToday()],
  );
  const busy: BusyInput[] = periods;
  return orderPicks(
    rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      score: r.score,
      why: r.reason && r.reason.trim() ? r.reason.trim() : null,
      clash: clashLabel(r.mode, iso(r.start_date), iso(r.end_date), iso(r.submission_deadline), busy),
    })),
  );
}
