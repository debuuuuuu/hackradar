import { query } from "./db.js";

export type Kind = "hackathon" | "contest" | "other";

export interface EventFilter {
  q?: string;
  kind?: Kind;
  near?: { lat: number; lon: number; radiusKm: number };
  includeOnline?: boolean;
  limit: number;
  offset: number;
}

interface EventBase {
  id: number;
  title: string;
  kind: Kind | null;
  mode: "online" | "offline" | "hybrid" | null;
  city: string | null;
  organizer: string | null;
  regDeadline: string | null;
  startDate: string | null;
  endDate: string | null;
  submissionDeadline: string | null;
  prizeText: string | null;
  entryFee: string | null;
  teamSize: string | null;
  summary: string | null;
}

/** List item: source names only. */
export interface EventRow extends EventBase {
  sources: string[];
}

/** Detail: each source with its listing URL. */
export interface EventDetail extends EventBase {
  sources: { source: string; url: string }[];
}

export interface Place {
  key: string;
  name: string;
}

const COLS = `e.id, e.title, e.kind, e.mode, e.city, e.organizer, e.reg_deadline, e.start_date, e.end_date,
  e.submission_deadline, e.prize_text, e.entry_fee, e.team_size, e.summary`;

type Raw = Record<string, unknown> & { id: string | number };

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

function base(r: Raw): EventBase {
  return {
    id: Number(r.id),
    title: r.title as string,
    kind: r.kind as EventBase["kind"],
    mode: r.mode as EventBase["mode"],
    city: r.city as string | null,
    organizer: r.organizer as string | null,
    regDeadline: iso(r.reg_deadline),
    startDate: iso(r.start_date),
    endDate: iso(r.end_date),
    submissionDeadline: iso(r.submission_deadline),
    prizeText: r.prize_text as string | null,
    entryFee: r.entry_fee as string | null,
    teamSize: r.team_size as string | null,
    summary: r.summary as string | null,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listEvents(f: EventFilter): Promise<{ items: EventRow[]; total: number }> {
  const where = ["e.status = 'open'"];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.q) where.push(`e.title ILIKE ${p(`%${escapeLike(f.q)}%`)} ESCAPE '\\'`);
  if (f.kind) where.push(`e.kind = ${p(f.kind)}`);
  if (f.near) {
    const lat = p(f.near.lat);
    const lon = p(f.near.lon);
    const km = p(f.near.radiusKm);
    const dist = `6371 * 2 * asin(sqrt(LEAST(1, power(sin(radians(e.lat - ${lat}) / 2), 2)
      + cos(radians(${lat})) * cos(radians(e.lat)) * power(sin(radians(e.lon - ${lon}) / 2), 2))))`;
    const inRange = `(e.lat IS NOT NULL AND e.lon IS NOT NULL AND ${dist} <= ${km})`;
    where.push(f.includeOnline ? `(${inRange} OR e.mode = 'online' OR e.mode IS NULL)` : inRange);
  }
  const w = where.join(" AND ");
  const rows = await query<Raw & { sources: string[] | null }>(
    `SELECT ${COLS},
       (SELECT array_agg(DISTINCT s.source ORDER BY s.source) FROM event_sources s WHERE s.event_id = e.id) AS sources
     FROM events e WHERE ${w}
     ORDER BY COALESCE(e.reg_deadline, e.submission_deadline, e.end_date) ASC NULLS LAST, e.id
     LIMIT ${p(f.limit)} OFFSET ${p(f.offset)}`,
    params,
  );
  const [{ n }] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events e WHERE ${w}`,
    params.slice(0, params.length - 2),
  );
  return { items: rows.map((r) => ({ ...base(r), sources: r.sources ?? [] })), total: n };
}

export async function getEvent(id: number): Promise<EventDetail | null> {
  const rows = await query<Raw>(`SELECT ${COLS} FROM events e WHERE e.id = $1`, [id]);
  if (rows.length === 0) return null;
  const sources = await query<{ source: string; url: string }>(
    "SELECT source, url FROM event_sources WHERE event_id = $1 ORDER BY first_seen_at, id",
    [id],
  );
  return { ...base(rows[0]), sources };
}

export async function listPlaces(): Promise<Place[]> {
  return query<Place>("SELECT key, coalesce(name, key) AS name FROM places ORDER BY name");
}

export async function getPlace(key: string): Promise<{ lat: number; lon: number } | null> {
  const rows = await query<{ lat: number | null; lon: number | null }>(
    "SELECT lat, lon FROM places WHERE key = $1",
    [key],
  );
  const r = rows[0];
  return r && r.lat != null && r.lon != null ? { lat: r.lat, lon: r.lon } : null;
}
