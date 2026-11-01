import type { ReminderType } from "@/types/database";
import { daysBetween } from "./dates";

// Single source of truth for status buckets + reminder cadence. The cron/edge function
// mirrors REMINDER_OFFSETS in SQL/Deno; keep them identical.
export const EXPIRING_WINDOW_DAYS = 30;
export const RECENT_WINDOW_DAYS = 7;

export const REMINDER_OFFSETS: { days: number; type: ReminderType }[] = [
  { days: 30, type: "d30" },
  { days: 15, type: "d15" },
  { days: 7, type: "d7" },
  { days: 3, type: "d3" },
  { days: 1, type: "d1" },
];

export type ItemStatus = "expired" | "expiring" | "ok";

export function getStatus(today: string, expiry: string): ItemStatus {
  const diff = daysBetween(today, expiry);
  if (diff < 0) return "expired";
  if (diff <= EXPIRING_WINDOW_DAYS) return "expiring";
  return "ok";
}

export const STATUS_META: Record<ItemStatus, { label: string; tone: string }> = {
  expired: { label: "Expired", tone: "text-danger border-danger/40 bg-danger/10" },
  expiring: { label: "Expiring soon", tone: "text-warning border-warning/40 bg-warning/10" },
  ok: { label: "OK", tone: "text-success border-success/40 bg-success/10" },
};

export const CATEGORIES = [
  "food",
  "medicine",
  "cosmetics",
  "documents",
  "warranty",
  "subscription",
  "other",
] as const;

/** What the list row shows on its right edge: a short value with a caption underneath. */
export type Countdown = { value: string; caption: string; status: ItemStatus };

/** Compact, scannable countdown, e.g. "12 / days left", "3d / overdue", "Today". */
export function countdown(today: string, expiry: string): Countdown {
  const diff = daysBetween(today, expiry);
  const status = getStatus(today, expiry);
  if (diff < 0) {
    const late = -diff;
    return late >= 60
      ? { value: `${Math.floor(late / 30)}mo`, caption: "overdue", status }
      : { value: `${late}d`, caption: "overdue", status };
  }
  if (diff === 0) return { value: "Today", caption: "", status };
  if (diff === 1) return { value: "Tomorrow", caption: "", status };
  if (diff < 14) return { value: String(diff), caption: "days left", status };
  if (diff < 60) return { value: String(Math.round(diff / 7)), caption: "weeks left", status };
  if (diff < 730) return { value: String(Math.round(diff / 30)), caption: "months left", status };
  return { value: String(Math.floor(diff / 365)), caption: "years left", status };
}
