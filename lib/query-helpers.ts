import { CATEGORIES, EXPIRING_WINDOW_DAYS } from "./status";
import type { Category } from "@/types/database";

export { EXPIRING_WINDOW_DAYS };

/** Narrow an untrusted searchParam to a valid Category (else undefined). */
export function categoryGuard(value: string | undefined): value is Category {
  return !!value && (CATEGORIES as readonly string[]).includes(value);
}
