import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "./dates";
import { categoryGuard } from "./query-helpers";
import { EXPIRING_WINDOW_DAYS } from "./status";

export const PAGE_SIZE = 24;
export const INVENTORY_SORTS = {
  expiry: "Expiry: soonest first",
  newest: "Recently added",
  name: "Name: A–Z",
} as const;

export type InventoryParams = Partial<Record<"q" | "category" | "status" | "location" | "sort" | "page", string | string[]>>;

export function inventoryFilters(params: InventoryParams) {
  // Next.js returns arrays for repeats; match the export's Object.fromEntries normalization.
  const value = (key: keyof InventoryParams) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw.at(-1) ?? "" : raw ?? "";
  };
  const category = value("category");
  const status = value("status");
  const sort = value("sort");
  const page = value("page");
  return {
    q: value("q").trim().slice(0, 200),
    category: categoryGuard(category) ? category : undefined,
    status: ["expired", "expiring", "ok", "today", "week"].includes(status) ? status : undefined,
    location: value("location").trim().slice(0, 60),
    sort: Object.hasOwn(INVENTORY_SORTS, sort) ? sort as keyof typeof INVENTORY_SORTS : "expiry" as const,
    page: /^\d{1,6}$/.test(page) ? Math.max(1, Number(page)) : 1,
  };
}

/** Shared by the list and CSV export so both use the same filters and RLS client. */
export function inventoryQuery(supabase: SupabaseClient, params: InventoryParams, today: string) {
  const filters = inventoryFilters(params);
  let query = supabase.from("items").select("*", { count: "exact" });
  // Treat SQL LIKE wildcards as literal characters typed by the user.
  if (filters.q) query = query.ilike("name", `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.location) query = query.eq("location", filters.location);
  if (filters.status === "today") query = query.eq("effective_expiry", today);
  if (filters.status === "week") query = query.gte("effective_expiry", today).lte("effective_expiry", addDays(today, 7));
  if (filters.status === "expired") query = query.lt("effective_expiry", today);
  if (filters.status === "expiring") query = query.gte("effective_expiry", today).lte("effective_expiry", addDays(today, EXPIRING_WINDOW_DAYS));
  if (filters.status === "ok") query = query.gt("effective_expiry", addDays(today, EXPIRING_WINDOW_DAYS));
  const column = filters.sort === "newest" ? "created_at" : filters.sort === "name" ? "name" : "effective_expiry";
  return query.order(column, { ascending: filters.sort !== "newest" }).order("id", { ascending: true });
}
