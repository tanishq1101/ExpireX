"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { CATEGORIES } from "@/lib/status";
import { CATEGORY_META } from "@/lib/categories";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function FilterBar({ locations = [] }: { locations?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router]
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-9"
          placeholder="Search by name…"
          defaultValue={params.get("q") ?? ""}
          onChange={(e) => setParam("q", e.target.value.trim())}
          aria-label="Search items"
        />
      </div>
      <Select
        className="sm:w-40"
        defaultValue={params.get("category") ?? ""}
        onChange={(e) => setParam("category", e.target.value)}
        aria-label="Filter by category"
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_META[c].label}
          </option>
        ))}
      </Select>
      <Select
        className="sm:w-36"
        defaultValue={params.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        aria-label="Filter by status"
      >
        <option value="">All status</option>
        <option value="expiring">Expiring</option>
        <option value="expired">Expired</option>
        <option value="ok">OK</option>
      </Select>
      {locations.length > 0 && (
        <Select
          className="sm:w-40"
          defaultValue={params.get("location") ?? ""}
          onChange={(e) => setParam("location", e.target.value)}
          aria-label="Filter by location"
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
