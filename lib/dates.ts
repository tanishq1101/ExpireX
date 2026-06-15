import { formatInTimeZone } from "date-fns-tz";

export const APP_TZ = "Asia/Kolkata";

/** Today's calendar date in Asia/Kolkata as 'YYYY-MM-DD'. */
export function todayKolkata(now: Date = new Date()): string {
  return formatInTimeZone(now, APP_TZ, "yyyy-MM-dd");
}

/** Add (or subtract) whole days to a 'YYYY-MM-DD' string, returning 'YYYY-MM-DD'. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole-day difference (target - base), both 'YYYY-MM-DD'. */
export function daysBetween(base: string, target: string): number {
  const a = Date.parse(`${base}T00:00:00Z`);
  const b = Date.parse(`${target}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Human label, e.g. "in 5 days", "today", "3 days ago". */
export function relativeLabel(today: string, expiry: string): string {
  const diff = daysBetween(today, expiry);
  if (diff === 0) return "expires today";
  if (diff === 1) return "expires tomorrow";
  if (diff > 1) return `in ${diff} days`;
  if (diff === -1) return "expired yesterday";
  return `expired ${Math.abs(diff)} days ago`;
}
