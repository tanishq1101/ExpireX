import { PackageOpen } from "lucide-react";
import { createClient } from "@/services/supabase/server";
import { todayKolkata, addDays } from "@/lib/dates";
import { EXPIRING_WINDOW_DAYS, categoryGuard } from "@/lib/query-helpers";
import { FilterBar } from "@/components/filter-bar";
import { ItemRow } from "@/components/item-row";
import { EmptyState } from "@/components/ui/empty-state";
import type { Item } from "@/types/database";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; category?: string; status?: string }>;

export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, category, status } = await searchParams;
  const supabase = await createClient();
  const today = todayKolkata();

  let query = supabase.from("items").select("*").order("expiry_date", { ascending: true });

  if (q) query = query.ilike("name", `%${q}%`);
  if (categoryGuard(category)) query = query.eq("category", category);

  if (status === "expired") query = query.lt("expiry_date", today);
  else if (status === "expiring")
    query = query.gte("expiry_date", today).lte("expiry_date", addDays(today, EXPIRING_WINDOW_DAYS));
  else if (status === "ok") query = query.gt("expiry_date", addDays(today, EXPIRING_WINDOW_DAYS));

  const { data, error } = await query;
  const items = (data ?? []) as Item[];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Items</h1>
        <span className="text-xs text-muted">{items.length} shown</span>
      </div>

      <FilterBar />

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
