"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, Camera, Info, ScanBarcode } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseClient } from "@/services/supabase/client";
import { uploadItemImage } from "@/lib/storage";
import { externalImageUrl } from "@/lib/utils";
import { addDays } from "@/lib/dates";
import { itemFormSchema, type Extraction, type ShelfLife } from "@/lib/validators";
import { CATEGORIES } from "@/lib/status";
import { CATEGORY_META } from "@/lib/categories";
import type { Category, Item } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScanUploader } from "@/components/scan-uploader";

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
    | "barcode"
    | "location"
    | "opened_date"
    | "open_within_days"
    | "image_url"
  >
>;

const UNIT_SUGGESTIONS = ["pcs", "ml", "L", "g", "kg", "pack", "box", "bottle", "strip", "tablets"];
const LOCATION_SUGGESTIONS = [
  "Fridge",
  "Freezer",
  "Pantry",
  "Kitchen cabinet",
  "Medicine box",
  "Bathroom",
  "Wardrobe",
  "Desk",
];

export function ItemForm({
  mode,
  initial = {},
  // A File handed in from the scan flow — uploaded only when the user confirms by saving.
  pendingImage = null,
  fromScan = false,
  notice,
}: {
  mode: "create" | "edit";
  initial?: ItemFormInitial;
  pendingImage?: File | null;
  fromScan?: boolean;
  notice?: string;
}) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const { userId } = useAuth();

  const [name, setName] = useState(initial.name ?? "");
  const [category, setCategory] = useState<Category>(() => {
    if (initial.category) return initial.category as Category;
    try { return (localStorage.getItem("defaultCategory") as Category) ?? "food"; } catch { return "food"; }
  });
  const [expiry, setExpiry] = useState(initial.expiry_date ?? "");
  const [mfg, setMfg] = useState(initial.manufacture_date ?? "");
  const [quantity, setQuantity] = useState(initial.quantity != null ? String(initial.quantity) : "1");
  const [unit, setUnit] = useState(initial.unit ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [barcode] = useState(initial.barcode ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [openedDate, setOpenedDate] = useState(initial.opened_date ?? "");
  const [openWithin, setOpenWithin] = useState(
    initial.open_within_days != null ? String(initial.open_within_days) : ""
  );
  const [file, setFile] = useState<File | null>(pendingImage);
  const [saving, setSaving] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);

  async function estimateExpiry() {
    if (!name.trim()) {
      toast.error("Enter a product name first.");
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category, base_date: mfg || undefined }),
      });
      const est = (await res.json()) as ShelfLife & { source?: string };
      if (!res.ok || !est.expiry_date) {
        toast.error("Couldn't estimate a date for this item — please enter it.");
        return;
      }
      setExpiry(est.expiry_date);
      setEstimateNote(est.basis ?? "AI-estimated expiry — please confirm.");
      toast.success(`Estimated expiry: ${est.expiry_date}`);
    } catch {
      toast.error("Estimate failed. Please enter the date.");
    } finally {
      setEstimating(false);
    }
  }

  // Inline OCR: scan the printed label to fill the date and any still-empty fields.
  function handleScanFill(ex: Extraction, scanned: File) {
    if (ex.expiry_date) setExpiry(ex.expiry_date);
    if (!name.trim() && ex.product_name) {
      setName(ex.brand && !ex.product_name.toLowerCase().includes(ex.brand.toLowerCase())
        ? `${ex.brand} ${ex.product_name}`
        : ex.product_name);
    }
    if (!initial.category && ex.category) setCategory(ex.category);
    if (!mfg && ex.manufacture_date) setMfg(ex.manufacture_date);
    if ((!quantity || quantity === "1") && ex.quantity != null) setQuantity(String(ex.quantity));
    if (!unit && ex.unit) setUnit(ex.unit);
    setFile(scanned);
    setEstimateNote(ex.estimated ? "Expiry was AI-estimated — please confirm." : null);
    setShowScan(false);
    toast.success(ex.expiry_date ? "Filled from label" : "Label scanned — review the details");
  }

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
      barcode: barcode || null,
      location: location || null,
      opened_date: openedDate || null,
      open_within_days: openWithin || null,
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

      // Record confirmed scan in the shared barcode catalog (fire-and-forget).
      if (barcode) {
        fetch("/api/catalog/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barcode,
            name: name.trim(),
            category,
            image_url: initial.image_url ?? null,
          }),
        }).catch(() => {});
      }

      router.push("/items");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save item.");
    } finally {
      setSaving(false);
    }
  }

  // Soonest of the printed expiry and the opened-window date (mirrors the DB generated column).
  const effectiveHint = (() => {
    const n = parseInt(openWithin, 10);
    if (!openedDate || !Number.isFinite(n) || n <= 0) return null;
    const eff = addDays(openedDate, n);
    return !expiry || eff < expiry ? eff : null;
  })();

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {notice && (
        <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{notice}</span>
        </p>
      )}
      {!notice && fromScan && (
        <p className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          Review the auto-filled details below. Nothing is saved until you press “Save item”.
        </p>
      )}

      {barcode && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/[0.04] px-3 py-2 text-xs text-muted">
          <ScanBarcode className="h-3.5 w-3.5 text-primary" />
          Barcode: <span className="font-mono text-foreground">{barcode}</span>
        </div>
      )}

      {!file && externalImageUrl(initial.image_url) && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/[0.04] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={externalImageUrl(initial.image_url)!}
            alt=""
            className="h-14 w-14 rounded-lg border border-border object-cover"
          />
          <span className="text-xs text-muted">Product image attached from the barcode database.</span>
        </div>
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
            onChange={(e) => {
              setExpiry(e.target.value);
              setEstimateNote(null);
            }}
            required
          />
        </div>
      </div>

      {/* Smart helpers: AI estimate + scan the printed date */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={estimateExpiry}
          disabled={estimating}
        >
          {estimating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Estimate expiry with AI
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowScan((s) => !s)}>
          <Camera className="h-3.5 w-3.5" /> {showScan ? "Close scanner" : "Scan date from label"}
        </Button>
      </div>
      {estimateNote && <p className="text-xs text-muted">✨ {estimateNote}</p>}

      {showScan && (
        <div className="rounded-xl border border-border p-3">
          <ScanUploader onExtracted={handleScanFill} />
        </div>
      )}

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
            <Input
              id="unit"
              list="unit-suggestions"
              value={unit ?? ""}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pcs, ml"
            />
            <datalist id="unit-suggestions">
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="location">Storage location</Label>
        <Input
          id="location"
          list="location-suggestions"
          value={location ?? ""}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Fridge, Pantry, Medicine box…"
        />
        <datalist id="location-suggestions">
          {LOCATION_SUGGESTIONS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>

      {/* Opened tracking — shortens the effective expiry once a product is opened. */}
      <div className="space-y-3 rounded-xl border border-border p-3">
        <p className="text-xs font-medium text-muted">
          Opened? <span className="font-normal">Optional — we’ll use whichever date comes first.</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="opened">Opened on</Label>
            <Input
              id="opened"
              type="date"
              value={openedDate ?? ""}
              onChange={(e) => setOpenedDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="within">Use within (days)</Label>
            <Input
              id="within"
              type="number"
              min="1"
              value={openWithin}
              onChange={(e) => setOpenWithin(e.target.value)}
              placeholder="7"
            />
          </div>
        </div>
        {effectiveHint && (
          <p className="text-xs text-accent">⏳ Effective use-by: {effectiveHint}</p>
        )}
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
