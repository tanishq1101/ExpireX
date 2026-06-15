"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Check, Trash2, ShoppingCart, Sparkles, Eraser } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseClient } from "@/services/supabase/client";
import { relativeLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ShoppingItem } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Suggestion = {
  item_id: string;
  name: string;
  unit: string | null;
  quantity: number | null;
  expiry_date: string;
  expired: boolean;
};

export function ShoppingClient({
  initialList,
  suggestions: initialSuggestions,
  today,
}: {
  initialList: ShoppingItem[];
  suggestions: Suggestion[];
  today: string;
}) {
  const supabase = useSupabaseClient();
  const { userId } = useAuth();

  const [list, setList] = useState<ShoppingItem[]>(initialList);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initialSuggestions);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function addRow(row: {
    name: string;
    unit?: string | null;
    quantity?: number | null;
    source: "manual" | "auto";
    item_id?: string | null;
  }) {
    if (!userId) return toast.error("Please sign in again.");
    const payload = {
      user_id: userId,
      name: row.name.trim(),
      unit: row.unit ?? null,
      quantity: row.quantity ?? null,
      source: row.source,
      item_id: row.item_id ?? null,
    };
    const { data, error } = await supabase.from("shopping_list").insert(payload).select("*").single();
    if (error || !data) {
      toast.error(error?.message ?? "Couldn't add item.");
      return null;
    }
    setList((prev) => [data as ShoppingItem, ...prev]);
    return data as ShoppingItem;
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const added = await addRow({ name, source: "manual" });
    if (added) setName("");
    setBusy(false);
  }

  async function acceptSuggestion(s: Suggestion) {
    const added = await addRow({
      name: s.name,
      unit: s.unit,
      quantity: s.quantity,
      source: "auto",
      item_id: s.item_id,
    });
    if (added) {
      setSuggestions((prev) => prev.filter((x) => x.item_id !== s.item_id));
      toast.success(`Added "${s.name}"`);
    }
  }

  async function toggle(row: ShoppingItem) {
    const next = !row.checked;
    setList((prev) => prev.map((r) => (r.id === row.id ? { ...r, checked: next } : r)));
    const { error } = await supabase.from("shopping_list").update({ checked: next }).eq("id", row.id);
    if (error) {
      setList((prev) => prev.map((r) => (r.id === row.id ? { ...r, checked: !next } : r)));
      toast.error("Couldn't update.");
    }
  }

  async function remove(row: ShoppingItem) {
    setList((prev) => prev.filter((r) => r.id !== row.id));
    const { error } = await supabase.from("shopping_list").delete().eq("id", row.id);
    if (error) toast.error("Couldn't remove.");
  }

  async function clearChecked() {
    const checkedIds = list.filter((r) => r.checked).map((r) => r.id);
    if (checkedIds.length === 0) return;
    setBusy(true);
    setList((prev) => prev.filter((r) => !r.checked));
    const { error } = await supabase.from("shopping_list").delete().in("id", checkedIds);
    if (error) toast.error("Couldn't clear checked items.");
    else toast.success(`Cleared ${checkedIds.length} item${checkedIds.length > 1 ? "s" : ""}`);
    setBusy(false);
  }

  const checkedCount = list.filter((r) => r.checked).length;

  return (
    <div className="space-y-5">
      {/* Manual add */}
      <form onSubmit={addManual} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add an item to buy…"
          className="flex-1"
        />
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      {/* Auto suggestions */}
      {suggestions.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
            <Sparkles className="h-4 w-4 text-primary" /> Suggested to buy
          </h2>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div key={s.item_id} className="glass flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className={cn("text-xs", s.expired ? "text-danger" : "text-warning")}>
                    {relativeLabel(today, s.expiry_date)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => acceptSuggestion(s)}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The list */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">
            Your list {list.length > 0 && `(${list.length})`}
          </h2>
          {checkedCount > 0 && (
            <button
              onClick={clearChecked}
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-foreground"
            >
              <Eraser className="h-3.5 w-3.5" /> Clear {checkedCount} checked
            </button>
          )}
        </div>

        {list.length === 0 ? (
          <div className="glass flex flex-col items-center gap-2 px-6 py-10 text-center text-muted">
            <ShoppingCart className="h-7 w-7" />
            <p className="text-sm">Your shopping list is empty.</p>
            <p className="text-xs">Add items above, or pull in a suggestion.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((row) => (
              <li
                key={row.id}
                className="glass flex items-center gap-3 p-3"
              >
                <button
                  onClick={() => toggle(row)}
                  aria-label={row.checked ? "Mark as not bought" : "Mark as bought"}
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-md border transition",
                    row.checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-transparent hover:border-primary/60"
                  )}
                >
                  <Check className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm", row.checked && "text-muted line-through")}>
                    {row.name}
                  </p>
                  {(row.quantity || row.unit) && (
                    <p className="text-xs text-muted">
                      {row.quantity ?? ""}
                      {row.unit ? ` ${row.unit}` : ""}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => remove(row)}
                  aria-label="Remove"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
