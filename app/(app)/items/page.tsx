import { withImagePreviews } from "@/lib/storage";
import Link from "next/link";
import { PackageOpen, Search } from "lucide-react";
import { createClient } from "@/services/supabase/server";
import { todayKolkata } from "@/lib/dates";
import { inventoryFilters, inventoryQuery, PAGE_SIZE, type InventoryParams } from "@/lib/inventory";
import { FilterBar } from "@/components/filter-bar";
import { ExportItemsButton } from "@/components/export-items-button";
import { ItemRow } from "@/components/item-row";
import { EmptyState } from "@/components/ui/empty-state";
import type { Item } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ItemsPage({ searchParams }: { searchParams: Promise<InventoryParams> }) {
  const params = await searchParams;
  const filters = inventoryFilters(params);
  const supabase = await createClient();
  const today = todayKolkata();
  const offset = (filters.page - 1) * PAGE_SIZE;
  const [{ data, error, count }, { data: locRows }] = await Promise.all([
    inventoryQuery(supabase, params, today).range(offset, offset + PAGE_SIZE - 1),
    supabase.from("items").select("location").not("location", "is", null),
  ]);
  const locations = Array.from(new Set(((locRows ?? []) as { location: string | null }[]).map((r) => r.location).filter((l): l is string => !!l))).sort();
  const items = await withImagePreviews(supabase, (data ?? []) as Item[]);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(filters.q || filters.category || filters.status || filters.location);
  function pageHref(page: number) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value && key !== "page") next.set(key, String(value));
    next.set("page", String(page));
    return `/items?${next}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Items</h1>
          {!error && <p className="text-xs text-muted" role="status">{items.length ? `${offset + 1}–${offset + items.length} of ${total}` : `${total} matching items`}</p>}
        </div>
        {!error && total > 0 && <ExportItemsButton />}
      </div>
      <FilterBar locations={locations} />
      {error ? (
        <div role="alert" className="glass space-y-2 p-6 text-center text-sm">
          <p className="text-danger">Couldn’t load items. Your inventory may still contain items.</p>
          <Link href={pageHref(filters.page)} className="inline-flex min-h-10 items-center text-primary underline">Try again</Link>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={hasFilters ? Search : PackageOpen} title={total > 0 ? "No items on this page" : hasFilters ? "No matching items" : "No items yet"}
          description={hasFilters ? "Try another search or clear the filters to see your inventory." : "Add an item by scanning a label or entering its details."}
          actionLabel={total > 0 ? "Go to first page" : hasFilters ? "Clear filters" : "Add item"}
          actionHref={total > 0 ? pageHref(1) : hasFilters ? "/items" : "/items/new"} />
      ) : (
        <ul className="space-y-2">{items.map((item) => <ItemRow key={item.id} item={item} today={today} />)}</ul>
      )}
      {!error && pages > 1 && (
        <nav aria-label="Inventory pages" className="flex items-center justify-between gap-3 text-sm">
          {filters.page > 1 ? <Link href={pageHref(filters.page - 1)} className="inline-flex min-h-10 items-center rounded-xl border border-border px-3">Previous</Link> : <span />}
          <span className="text-muted">Page {filters.page} of {pages}</span>
          {filters.page < pages ? <Link href={pageHref(filters.page + 1)} className="inline-flex min-h-10 items-center rounded-xl border border-border px-3">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
