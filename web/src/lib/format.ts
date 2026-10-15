const TZ = "Asia/Kolkata";

const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const HM = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "15 Oct 2026, 11:59 PM IST"; date only when the instant is midnight IST (a date-only source value). */
export function formatIst(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = DATE.format(d);
  if (HM.format(d) === "00:00") return date;
  return `${date}, ${TIME.format(d).replace(/\s/g, " ")} IST`;
}

const SOURCE_NAMES: Record<string, string> = { mlh: "MLH", devpost: "Devpost", devfolio: "Devfolio", unstop: "Unstop" };

/** Display name for a source key, e.g. "devfolio" -> "Devfolio". */
export function sourceLabel(key: string): string {
  return SOURCE_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Date-only variant used for ranges. */
export function formatIstDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DATE.format(d);
}
