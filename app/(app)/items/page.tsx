import { PackageOpen } from "lucide-react";
import { createClient } from "@/services/supabase/server";
import { todayKolkata, addDays } from "@/lib/dates";
import { EXPIRING_WINDOW_DAYS, categoryGuard } from "@/lib/query-helpers";
import { FilterBar } from "@/components/filter-bar";
import { ItemRow } from "@/components/item-row";
import { EmptyState } from "@/components/ui/empty-state";
import type { Item } from "@/types/database";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; category?: string; status?: string; location?: string }>;

export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, category, status, location } = await searchParams;
  const supabase = await createClient();
  const today = todayKolkata();

  let query = supabase.from("items").select("*").order("effective_expiry", { ascending: true });

  if (q) query = query.ilike("name", `%${q}%`);
  if (categoryGuard(category)) query = query.eq("category", category);
  if (location) query = query.eq("location", location);

  if (status === "expired") query = query.lt("effective_expiry", today);
  else if (status === "expiring")
    query = query
      .gte("effective_expiry", today)
      .lte("effective_expiry", addDays(today, EXPIRING_WINDOW_DAYS));
  else if (status === "ok") query = query.gt("effective_expiry", addDays(today, EXPIRING_WINDOW_DAYS));

  // Distinct locations the user has used, to populate the filter dropdown.
  const { data: locRows } = await supabase.from("items").select("location").not("location", "is", null);
  const locations = Array.from(
    new Set(
      ((locRows ?? []) as { location: string | null }[])
        .map((r) => r.location)
        .filter((l): l is string => !!l)
    )
  ).sort();

  const { data, error } = await query;
  const items = (data ?? []) as Item[];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Items</h1>
        <span className="text-xs text-muted">{items.length} shown</span>
      </div>

      <FilterBar locations={locations} />

      {error ? (
        <p className="glass p-6 text-center text-sm text-danger">Couldn’t load items. Try again.</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="No items yet"
          description="Add your first item — scan a label or enter it manually."
          actionLabel="Add item"
          actionHref="/items/new"
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}
