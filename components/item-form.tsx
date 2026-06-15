"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseClient } from "@/services/supabase/client";
import { uploadItemImage } from "@/lib/storage";
import { itemFormSchema } from "@/lib/validators";
import { CATEGORIES } from "@/lib/status";
import { CATEGORY_META } from "@/lib/categories";
import type { Category, Item } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type ItemFormInitial = Partial<
  Pick<
    Item,
    | "id"
    | "name"
    | "category"
    | "expiry_date"
    | "manufacture_date"
    | "quantity"
    | "unit"
    | "notes"
    | "image_url"
  >
>;

export function ItemForm({
  mode,
  initial = {},
  // A File handed in from the scan flow — uploaded only when the user confirms by saving.
  pendingImage = null,
  fromScan = false,
}: {
  mode: "create" | "edit";
  initial?: ItemFormInitial;
  pendingImage?: File | null;
  fromScan?: boolean;
}) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const { userId } = useAuth();

  const [name, setName] = useState(initial.name ?? "");
  const [category, setCategory] = useState<Category>((initial.category as Category) ?? "food");
  const [expiry, setExpiry] = useState(initial.expiry_date ?? "");
  const [mfg, setMfg] = useState(initial.manufacture_date ?? "");
  const [quantity, setQuantity] = useState(initial.quantity != null ? String(initial.quantity) : "");
  const [unit, setUnit] = useState(initial.unit ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [file, setFile] = useState<File | null>(pendingImage);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = itemFormSchema.safeParse({
      name,
      category,
      expiry_date: expiry,
      manufacture_date: mfg || null,
      quantity,
      unit: unit || null,
      notes: notes || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please fix the form.");
      return;
    }

    if (!userId) {
      toast.error("Session expired. Please sign in again.");
      return;
    }

    setSaving(true);
    try {
      let imageUrl = initial.image_url ?? null;
      if (file) imageUrl = await uploadItemImage(supabase, userId, file);

      const payload = { ...parsed.data, image_url: imageUrl };

      if (mode === "create") {
        const { error } = await supabase.from("items").insert({ ...payload, user_id: userId });
        if (error) throw error;
        toast.success("Item saved");
      } else {
        const { error } = await supabase.from("items").update(payload).eq("id", initial.id!);
        if (error) throw error;
        toast.success("Item updated");
      }

      router.push("/items");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {fromScan && (
        <p className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          Review the auto-filled details below. Nothing is saved until you press “Save item”.
        </p>
      )}

      <div>
        <Label htmlFor="name">Name *</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="category">Category *</Label>
          <Select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="expiry">Expiry date *</Label>
          <Input
            id="expiry"
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="mfg">Manufacture date</Label>
          <Input id="mfg" type="date" value={mfg ?? ""} onChange={(e) => setMfg(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="qty">Qty</Label>
            <Input
              id="qty"
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="unit">Unit</Label>
            <Input id="unit" value={unit ?? ""} onChange={(e) => setUnit(e.target.value)} placeholder="ml, pcs" />
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {!fromScan && (
        <div>
          <Label htmlFor="image">Image</Label>
          <Input
            id="image"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {initial.image_url && !file && (
            <p className="mt-1 text-xs text-muted">An image is already attached.</p>
          )}
        </div>
      )}
      {fromScan && file && <p className="text-xs text-muted">Scanned image will be attached on save.</p>}

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save item"}
      </Button>
    </form>
  );
}
