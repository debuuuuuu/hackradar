/** Round a positive max up to a tidy axis ceiling: 1, 2, 5 or 10 times a power of ten (minimum 1). */
export function niceMax(n: number): number {
  if (!Number.isFinite(n) || n <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 5, 10]) if (n <= step * pow) return step * pow;
  return 10 * pow;
}

/** Height of a bar segment as a percentage of the axis max, clamped to 0..100 (2 decimals). */
export function barPct(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.round(Math.min(100, (value / max) * 100) * 100) / 100;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-15" -> "15 Oct" (the string is already an IST calendar date, so no timezone maths). */
export function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""}`.trim();
}
