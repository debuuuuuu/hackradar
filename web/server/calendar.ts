// Pure calendar helpers: Google Calendar template links and an RFC 5545 ICS feed.
// No DB access, no side effects. All dates are treated as IST (Asia/Kolkata).

export type CalEvent = {
  id: number;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  regDeadline?: string | null;
  city?: string | null;
  sources: { url: string }[];
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Converts a stored date ("YYYY-MM-DD" or ISO with time) into an IST calendar day. */
function istDay(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = ISO_DATE.exec(raw);
  if (!m) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(raw) && raw.length > 10;
  const d = new Date(hasZone ? raw : `${m[0]}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return null;
  // Re-read the calendar day in IST so late-UTC instants land on the right day.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Resolves start/end all-day dates: start falls back to regDeadline, end falls back to start. */
function resolveRange(e: {
  startDate?: string | null;
  endDate?: string | null;
  regDeadline?: string | null;
}): { start: Date; end: Date } | null {
  const start = istDay(e.startDate) ?? istDay(e.regDeadline);
  if (!start) return null;
  const end = istDay(e.endDate) ?? start;
  return { start, end: end < start ? start : end };
}

export function gcalLink(e: {
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  regDeadline?: string | null;
  city?: string | null;
  sources: { url: string }[];
}): string {
  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title });
  const range = resolveRange(e);
  if (range) {
    // Google's all-day range is end-exclusive in ICS terms; a same-day event uses start/start.
    params.set("dates", `${ymd(range.start)}/${ymd(range.end)}`);
  }
  const url = e.sources[0]?.url;
  if (url) params.set("details", url);
  if (e.city) params.set("location", e.city);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** RFC 5545 TEXT escaping. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line so no physical line exceeds 75 octets (RFC 5545 3.1). */
function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    if (bytes + size > limit) {
      out.push(current);
      current = " ";
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

function dtStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function toIcsFeed(events: CalEvent[], calName: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HackRadar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];
  const stamp = dtStamp();
  for (const e of events) {
    const range = resolveRange(e);
    if (!range) continue; // no usable date: nothing to place on a calendar
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@hackradar`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${ymd(range.start)}`);
    // DTEND is exclusive for all-day events, so the last day is end + 1.
    lines.push(`DTEND;VALUE=DATE:${ymd(addDays(range.end, 1))}`);
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    const url = e.sources[0]?.url;
    if (url) lines.push(`URL:${url}`);
    if (e.city) lines.push(`LOCATION:${escapeText(e.city)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
