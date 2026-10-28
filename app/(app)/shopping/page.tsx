import { pages } from "@/supabase/functions/_shared/delivery";
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

  let list: ShoppingItem[] = [];
  let suggestions: Suggestion[] = [];
  let loadError = false;
  try {
    for await (const batch of pages<ShoppingItem>((after) => {
      let q = supabase.from("shopping_list").select("*").order("id").limit(200);
      if (after) q = q.gt("id", after);
      return q;
    })) list.push(...batch);
    list.sort((a, b) => Number(a.checked) - Number(b.checked) || b.created_at.localeCompare(a.created_at));
    const onList = new Set(list.map((row) => row.item_id));
    // Stable expiry/id cursor prevents already-listed early rows from starving later candidates.
    let cursor: { date: string; id: string } | undefined;
    while (suggestions.length < 50) {
      let q = supabase.from("items").select("id,name,category,expiry_date,effective_expiry,quantity,unit")
        .lte("effective_expiry", soon).order("effective_expiry").order("id").limit(100);
      if (cursor) q = q.or(`effective_expiry.gt.${cursor.date},and(effective_expiry.eq.${cursor.date},id.gt.${cursor.id})`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Item[];
      if (!rows.length) break;
      for (const it of rows) if (!onList.has(it.id) && suggestions.length < 50) suggestions.push({ item_id: it.id, name: it.name, unit: it.unit, quantity: it.quantity, expiry_date: it.effective_expiry, expired: it.effective_expiry < today });
      const last = rows.at(-1)!;
      cursor = { date: last.effective_expiry, id: last.id };
    }
  } catch { loadError = true; }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Shopping list</h1>
        <p className="text-sm text-muted">
          Auto-suggested from items that expired or expire within {SUGGEST_WINDOW_DAYS} days — plus anything you add.
        </p>
      </div>
      {loadError ? (
        <p role="alert" className="glass p-5 text-sm text-danger">Couldn’t load your shopping list. Reload the page to try again.</p>
      ) : <ShoppingClient initialList={list} suggestions={suggestions} today={today} />}
    </div>
  );
}
