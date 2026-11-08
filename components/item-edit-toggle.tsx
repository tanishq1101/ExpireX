"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import type { ItemFormInitial } from "@/components/item-form";
import { DeferredItemForm as ItemForm } from "@/components/deferred-item-form";
import { Button } from "@/components/ui/button";

/** The full edit form is only downloaded and shown when the user asks to edit. */
export function ItemEditToggle({ initial, previewUrl }: { initial: ItemFormInitial; previewUrl?: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Edit details
      </Button>
    );
  }
  return (
    <section className="glass space-y-4 p-5" aria-label="Edit item">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Edit details</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close editor" className="grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-surface/[0.06]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ItemForm mode="edit" initial={initial} previewUrl={previewUrl} />
    </section>
  );
}
