"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PackageOpen, ShoppingCart, Trash2 } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseClient } from "@/services/supabase/client";
import { removeUnreferencedImage } from "@/lib/storage";
import { formatDate, todayKolkata, addDays } from "@/lib/dates";
import type { Item } from "@/types/database";
import { Button } from "@/components/ui/button";

type QuickItem = Pick<Item, "id" | "name" | "category" | "quantity" | "unit" | "image_url" | "opened_date" | "open_within_days" | "expiry_date">;

/**
 * The two things people actually do with an item after adding it, one tap each:
 * mark it opened (the reminder moves to the "use within" date) or finish it.
 */
export function ItemQuickActions({ item, openDays, expired = false }: { item: QuickItem; openDays: number | null; expired?: boolean }) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const { userId } = useAuth();
  const [busy, setBusy] = useState<"open" | "used" | "rebuy" | null>(null);

  async function markOpened() {
    setBusy("open");
    try {
      const today = todayKolkata();
      const { data, error } = await supabase
        .from("items")
        .update({ opened_date: today, open_within_days: openDays })
        .eq("id", item.id)
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error("Could not update the item.");
      const useBy = openDays ? addDays(today, openDays) : null;
      toast.success(useBy && useBy < item.expiry_date ? `Marked opened — use by ${formatDate(useBy)}` : "Marked as opened today");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the item.");
    } finally {
      setBusy(null);
    }
  }

  async function finish(rebuy: boolean) {
    if (!userId) return void toast.error("Session expired. Please sign in again.");
    setBusy(rebuy ? "rebuy" : "used");
    try {
      if (rebuy) {
        const { error } = await supabase.from("shopping_list").insert({
          user_id: userId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          source: "auto",
          item_id: item.id,
        });
        if (error) throw new Error("Could not add it to your shopping list.");
      }
      const { error } = await supabase.from("items").delete().eq("id", item.id);
      if (error) throw new Error(rebuy ? "Added to your list, but the item could not be removed." : "Could not remove the item.");
      if (item.image_url) await removeUnreferencedImage(supabase, item.image_url).catch(() => {});
      toast.success(rebuy ? "Done — added to your shopping list" : expired ? "Removed" : "Nice — marked as used up");
      router.push(rebuy ? "/shopping" : "/items");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
    }
  }

  return (
    <section aria-label="Quick actions" className="grid gap-2 sm:auto-cols-fr sm:grid-flow-col">
      {!expired && !item.opened_date && item.category !== "documents" && item.category !== "warranty" && item.category !== "subscription" && (
        <Button variant="outline" onClick={markOpened} disabled={!!busy}>
          {busy === "open" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />}
          Opened today
        </Button>
      )}
      <Button variant="outline" onClick={() => finish(false)} disabled={!!busy}>
        {busy === "used" ? <Loader2 className="h-4 w-4 animate-spin" /> : expired ? <Trash2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {expired ? "Threw it out" : "Used it up"}
      </Button>
      <Button onClick={() => finish(true)} disabled={!!busy}>
        {busy === "rebuy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
        {expired ? "Remove · buy again" : "Used up · buy again"}
      </Button>
    </section>
  );
}
