import { createClient } from "@/services/supabase/server";
import { todayKolkata, addDays } from "@/lib/dates";
import { ShoppingClient, type Suggestion } from "@/components/shopping-client";
import type { ShoppingItem, Item } from "@/types/database";

export const dynamic = "force-dynamic";

const SUGGEST_WINDOW_DAYS = 7;

export default async function ShoppingPage() {
  const supabase = await createClient();
  const today = todayKolkata();
  const soon = addDays(today, SUGGEST_WINDOW_DAYS);

  const [listRes, itemsRes] = await Promise.all([
    supabase
      .from("shopping_list")
      .select("*")
      .order("checked", { ascending: true })
      .order("created_at", { ascending: false }),
    // Expired or expiring within a week (effective date) → candidates to re-buy.
    supabase
      .from("items")
      .select("id, name, category, expiry_date, effective_expiry, quantity, unit")
      .lte("effective_expiry", soon)
      .order("effective_expiry", { ascending: true })
      .limit(50),
  ]);

  const list = (listRes.data ?? []) as ShoppingItem[];
  const onList = new Set(list.map((l) => l.item_id).filter(Boolean) as string[]);

  const suggestions: Suggestion[] = ((itemsRes.data ?? []) as Item[])
    .filter((it) => !onList.has(it.id))
    .map((it) => ({
      item_id: it.id,
      name: it.name,
      unit: it.unit,
      quantity: it.quantity,
      expiry_date: it.effective_expiry,
      expired: it.effective_expiry < today,
    }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Shopping list</h1>
        <p className="text-sm text-muted">
          Auto-suggested from items that expired or expire within {SUGGEST_WINDOW_DAYS} days — plus anything you add.
        </p>
      </div>
      <ShoppingClient initialList={list} suggestions={suggestions} today={today} />
    </div>
  );
}
