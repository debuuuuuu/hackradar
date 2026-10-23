import { query, transaction } from "./db.js";
import { ValidationError } from "./prefs.js";

export const MAX_PERIODS = 20;
export const MAX_LABEL = 40;
const MAX_SPAN_DAYS = 366;
const IST_OFFSET_MS = 330 * 60_000;
const PHYSICAL_MODES = new Set(["offline", "hybrid"]);

export interface BusyInput {
  startsOn: string;
  endsOn: string;
  label: string;
}
export interface BusyPeriod extends BusyInput {
  id: number;
}

/** Today's calendar date in Asia/Kolkata as YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Days since the epoch for a real YYYY-MM-DD date, else null (rejects 2026-02-30 and non-ISO text). */
function dayNumber(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return null;
  return ms / 86_400_000;
}

export function validateBusy(input: unknown, today: string): BusyInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError("body");
  const { startsOn, endsOn, label } = input as Record<string, unknown>;
  const start = dayNumber(startsOn);
  const end = dayNumber(endsOn);
  if (start === null) throw new ValidationError("startsOn", "Start date must be a real date (YYYY-MM-DD).");
  if (end === null) throw new ValidationError("endsOn", "End date must be a real date (YYYY-MM-DD).");
  if (end < start) throw new ValidationError("endsOn", "The end date cannot be before the start date.");
  if (end - start > MAX_SPAN_DAYS) throw new ValidationError("endsOn", "A busy period can span at most 366 days.");
  if (end < (dayNumber(today) as number)) throw new ValidationError("endsOn", "The end date cannot be in the past.");
  const text = typeof label === "string" ? label.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  if (!text || text.length > MAX_LABEL) throw new ValidationError("label", `Give it a label of 1 to ${MAX_LABEL} characters.`);
  return { startsOn: startsOn as string, endsOn: endsOn as string, label: text };
}

/** The IST calendar date of an ISO timestamp, or null when absent or unparseable. */
function istDate(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Label of the first period an event clashes with, else null. Mirrors pipeline/busy.py (clash_label).
 * Offline or hybrid events clash when start..end overlaps a period (a lone known date is its own span);
 * a submission deadline inside a period clashes for any mode. Inclusive bounds, IST calendar dates.
 * YYYY-MM-DD strings compare correctly as text.
 */
export function clashLabel(
  mode: string | null,
  start: string | null,
  end: string | null,
  submit: string | null,
  periods: readonly BusyInput[],
): string | null {
  const s = istDate(start);
  const e = istDate(end);
  const first = s ?? e;
  const last = e ?? s;
  const submitDay = istDate(submit);
  const physical = mode !== null && PHYSICAL_MODES.has(mode) && first !== null && last !== null;
  const sorted = [...periods].sort(
    (a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0) || (a.endsOn < b.endsOn ? -1 : a.endsOn > b.endsOn ? 1 : 0),
  );
  for (const p of sorted) {
    if (physical && first <= p.endsOn && last >= p.startsOn) return p.label;
    if (submitDay !== null && p.startsOn <= submitDay && submitDay <= p.endsOn) return p.label;
  }
  return null;
}

const COLUMNS = `id, to_char(starts_on, 'YYYY-MM-DD') AS "startsOn", to_char(ends_on, 'YYYY-MM-DD') AS "endsOn", label`;

type Row = { id: string | number; startsOn: string; endsOn: string; label: string };
const toPeriod = (r: Row): BusyPeriod => ({ id: Number(r.id), startsOn: r.startsOn, endsOn: r.endsOn, label: r.label });

export async function listBusy(uid: number): Promise<BusyPeriod[]> {
  const rows = await query<Row>(`SELECT ${COLUMNS} FROM busy_periods WHERE user_id = $1 ORDER BY starts_on, ends_on, id`, [uid]);
  return rows.map(toPeriod);
}

/** Inserts a period, or returns null when the user already has MAX_PERIODS (checked under a row lock). */
export async function addBusy(uid: number, input: BusyInput): Promise<BusyPeriod | null> {
  return transaction(async (q) => {
    // Serialise this user's inserts so two concurrent requests cannot both pass the cap.
    await q("SELECT id FROM users WHERE id = $1 FOR UPDATE", [uid]);
    const [{ n }] = await q<{ n: string }>("SELECT count(*) AS n FROM busy_periods WHERE user_id = $1", [uid]);
    if (Number(n) >= MAX_PERIODS) return null;
    const [row] = await q<Row>(
      `INSERT INTO busy_periods (user_id, starts_on, ends_on, label) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
      [uid, input.startsOn, input.endsOn, input.label],
    );
    return toPeriod(row);
  });
}

/** Deletes only the caller's own period; false when it does not exist or belongs to someone else. */
export async function deleteBusy(uid: number, id: number): Promise<boolean> {
  const rows = await query("DELETE FROM busy_periods WHERE id = $1 AND user_id = $2 RETURNING id", [id, uid]);
  return rows.length > 0;
}
