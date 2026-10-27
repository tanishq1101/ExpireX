"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { CATEGORIES } from "@/lib/status";
import { CATEGORY_META } from "@/lib/categories";
import { INVENTORY_SORTS, inventoryFilters } from "@/lib/inventory";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function FilterBar({ locations = [] }: { locations?: string[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = inventoryFilters(Object.fromEntries(params));
  const hasFilters = !!(filters.q || filters.category || filters.status || filters.location);

  return (
    <form key={params.toString()} action={pathname} method="get" className="space-y-2" role="search" aria-label="Search and filter inventory">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input name="q" className="pl-9" placeholder="Search by name…" defaultValue={filters.q} maxLength={200} aria-label="Search items" />
        </div>
        <Button type="submit">Search</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select name="category" defaultValue={filters.category ?? ""} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
        </Select>
        <Select name="status" defaultValue={filters.status ?? ""} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="ok">OK</option>
        </Select>
        <Select name="sort" defaultValue={filters.sort} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Sort items">
          {Object.entries(INVENTORY_SORTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select>
        {(locations.length > 0 || filters.location) && (
          <Select name="location" defaultValue={filters.location} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Filter by location">
            <option value="">All locations</option>
            {Array.from(new Set([...locations, filters.location].filter(Boolean))).map((location) => <option key={location} value={location}>{location}</option>)}
          </Select>
        )}
      </div>
      {hasFilters && <Link href={pathname} className="inline-flex min-h-9 items-center text-sm text-primary hover:underline">Clear filters</Link>}
    </form>
  );
}
