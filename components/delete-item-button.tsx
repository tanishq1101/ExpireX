"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { useSupabaseClient } from "@/services/supabase/client";
import { removeItemImage } from "@/lib/storage";
import { Button } from "@/components/ui/button";

export function DeleteItemButton({ id, imageUrl }: { id: string; imageUrl: string | null }) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    setBusy(true);
    try {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
      if (imageUrl) await removeItemImage(supabase, imageUrl);
      toast.success("Item deleted");
      router.push("/items");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      <Button variant="danger" onClick={onDelete} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm delete"}
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}
