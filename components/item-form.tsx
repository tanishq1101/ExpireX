"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, Camera, Info, ScanBarcode, ChevronDown, CheckCircle2, Lightbulb, Refrigerator, Snowflake, Archive } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseClient } from "@/services/supabase/client";
import { saveItem } from "@/lib/save-item";
import { cn, externalImageUrl } from "@/lib/utils";
import { MAX_ORIGINAL_BYTES, MAX_UPLOAD_BYTES, prepareImage } from "@/lib/image-resize";
import { fetchJson } from "@/lib/fetch-json";
import { addDays, formatDate, todayKolkata } from "@/lib/dates";
import { estimateShelfLifeLocal, openedDaysFor, storageFromLocation, STORAGE_LABEL, type Storage } from "@/lib/shelf-life";
import { categorySchema, dateString, itemFormSchema, type Extraction, type ShelfLife } from "@/lib/validators";
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
    | "expiry_source"
  >
>;

const UNIT_SUGGESTIONS = ["pcs", "ml", "L", "g", "kg", "pack", "box", "bottle", "strip", "tablets"];

const STORAGE_OPTIONS: { id: Storage; icon: typeof Archive }[] = [
  { id: "pantry", icon: Archive },
  { id: "fridge", icon: Refrigerator },
  { id: "freezer", icon: Snowflake },
];

// Maps a validation issue to the input to focus; "more" fields live in the collapsible section.
const FIELD_IDS: Record<string, { id: string; more?: boolean }> = {
  name: { id: "name" },
  category: { id: "category" },
  expiry_date: { id: "expiry" },
  expiry_source: { id: "expiry" },
  quantity: { id: "qty" },
  unit: { id: "unit" },
  manufacture_date: { id: "mfg", more: true },
  opened_date: { id: "opened", more: true },
  open_within_days: { id: "within", more: true },
  location: { id: "location", more: true },
  notes: { id: "notes", more: true },
};

export function ItemForm({
  mode,
  initial = {},
  // A File handed in from the scan flow — uploaded only when the user confirms by saving.
  pendingImage = null,
  fromScan = false,
  notice,
  previewUrl,
}: {
  mode: "create" | "edit";
  initial?: ItemFormInitial;
  pendingImage?: File | null;
  fromScan?: boolean;
  notice?: string;
  previewUrl?: string;
}) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const { userId } = useAuth();

  const [saveId] = useState(() => initial.id ?? crypto.randomUUID());
  const staged = useRef<{ file: File; path: string } | null>(null);
  const submitting = useRef(false);
  const [expirySource, setExpirySource] = useState(initial.expiry_source ?? (initial.expiry_date ? "unknown" : "manual"));
  const [name, setName] = useState(initial.name ?? "");
  const [category, setCategory] = useState<Category>(() => {
    if (initial.category) return initial.category as Category;
    try {
      const saved = categorySchema.safeParse(localStorage.getItem("defaultCategory"));
      return saved.success ? saved.data : "food";
    } catch { return "food"; }
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
  // Rarely used fields stay tucked away, but open by themselves when there is something in them.
  const [moreOpen, setMoreOpen] = useState(
    () => !!(initial.manufacture_date || initial.opened_date || initial.open_within_days != null || initial.location || initial.notes)
  );

  async function estimateExpiry() {
    if (!name.trim()) {
      toast.error("Enter a product name first.");
      return;
    }
    setEstimating(true);
    try {
      const est = await fetchJson<ShelfLife & { source?: string }>("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category, base_date: mfg || undefined, location: location || undefined }),
      });
      if (!est.expiry_date) {
        toast.error("Couldn't estimate a date for this item — please enter it.");
        return;
      }
      setExpiry(est.expiry_date);
      setExpirySource("estimated");
      setEstimateNote(est.basis ?? "Estimated date — please check it.");
      toast.success(`Suggested date: ${formatDate(est.expiry_date)}`);
    } catch {
      toast.error("Estimate failed. Please enter the date.");
    } finally {
      setEstimating(false);
    }
  }

  // Inline OCR: scan the printed label to fill the date and any still-empty fields.
  function handleScanFill(ex: Extraction, scanned: File) {
    if (ex.expiry_date) { setExpiry(ex.expiry_date); setExpirySource(ex.estimated ? "estimated" : "printed"); }
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

  async function onImageChosen(chosen: File | null) {
    if (!chosen) return setFile(null);
    if (!chosen.type.startsWith("image/")) return void toast.error("Please choose an image.");
    if (chosen.size > MAX_ORIGINAL_BYTES) return void toast.error("This photo is too large. Choose one smaller than 25 MB.");
    const ready = await prepareImage(chosen);
    if (ready.size > MAX_UPLOAD_BYTES) return void toast.error("This photo is too large. Try a different one.");
    setFile(ready);
  }

  const storage = storageFromLocation(location, name);
  const canEstimate = category !== "medicine" && category !== "documents";
  // Instant, offline suggestion from the shelf-life table, so most people never need to guess a date.
  const suggestion = (() => {
    if (!canEstimate || name.trim().length < 2) return null;
    const est = estimateShelfLifeLocal(name, category, mfg || todayKolkata(), { storage });
    return est.expiry_date && est.confidence !== "low" ? est : null;
  })();
  const showSuggestion =
    !!suggestion?.expiry_date && (!expiry || (expirySource === "estimated" && expiry !== suggestion.expiry_date));

  function useSuggestion() {
    if (!suggestion?.expiry_date) return;
    setExpiry(suggestion.expiry_date);
    setExpirySource("estimated");
    setEstimateNote(suggestion.basis ?? null);
  }

  function pickStorage(next: Storage) {
    const label = STORAGE_LABEL[next];
    setLocation(storage === next ? "" : label);
    // An estimated date follows the storage choice; a printed or typed date never changes.
    if (expirySource === "estimated" && storage !== next) {
      const est = estimateShelfLifeLocal(name, category, mfg || todayKolkata(), { storage: next });
      if (est.expiry_date) {
        setExpiry(est.expiry_date);
        setEstimateNote(est.basis ?? null);
      }
    }
  }

  function changeOpened(value: string) {
    setOpenedDate(value);
    if (value && !openWithin) {
      const days = openedDaysFor(name, category);
      if (days) setOpenWithin(String(days));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;

    const parsed = itemFormSchema.safeParse({
      name,
      category,
      expiry_source: expirySource,
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
      const issue = parsed.error.issues[0];
      toast.error(issue?.message ?? "Please fix the form.");
      const target = FIELD_IDS[String(issue?.path[0])];
      if (target) {
        if (target.more) setMoreOpen(true);
        requestAnimationFrame(() => document.getElementById(target.id)?.focus());
      }
      return;
    }
    if (!userId) {
      toast.error("Session expired. Please sign in again.");
      return;
    }

    submitting.current = true;
    let completed = false;
    setSaving(true);
    try {
      const result = await saveItem(supabase, {
        id: saveId, userId, mode, file, staged, oldImage: initial.image_url ?? null,
        payload: { ...parsed.data, expiry_confirmed_at: new Date().toISOString() },
      });
      completed = true;
      toast.success(mode === "create" ? "Item saved" : "Item updated");
      if (result.cleanupWarning) toast.warning("Item saved, but the previous image could not be removed.");
      if (barcode) {
        // Do not publish user-entered names or private image paths to the shared catalog.
        await fetch("/api/catalog/confirm", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id: saveId }),
        }).catch(() => {});
      }

      router.push("/items");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save item.");
    } finally {
      if (!completed) { submitting.current = false; setSaving(false); }
    }
  }

  // Soonest of the printed expiry and the opened-window date (mirrors the DB generated column).
  const effectiveHint = (() => {
    const n = parseInt(openWithin, 10);
    if (!dateString.safeParse(openedDate).success || !Number.isFinite(n) || n <= 0) return null;
    const eff = addDays(openedDate, n);
    return !expiry || eff < expiry ? eff : null;
  })();

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {notice && (
        <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </p>
      )}
      {!notice && fromScan && (
        <p className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
          Check the details we filled in. Nothing is saved until you tap “Save item”.
        </p>
      )}

      {barcode && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/[0.04] px-3 py-2 text-xs text-muted">
          <ScanBarcode className="h-3.5 w-3.5 text-primary" />
          Barcode: <span className="font-mono text-foreground">{barcode}</span>
        </div>
      )}

      {!file && externalImageUrl(previewUrl ?? initial.image_url) && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/[0.04] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={externalImageUrl(previewUrl ?? initial.image_url)!}
            alt=""
            className="h-14 w-14 rounded-lg border border-border object-cover"
          />
          <span className="text-xs text-muted">Attached photo. Reload the page if the preview disappears.</span>
        </div>
      )}

      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" enterKeyHint="next" />
      </div>

      <div>
        <Label htmlFor="category">Category</Label>
        <Select id="category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c].label}
            </option>
          ))}
        </Select>
      </div>

      {category === "food" && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Where will you keep it?</legend>
          <div className="grid grid-cols-3 gap-2">
            {STORAGE_OPTIONS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={storage === id}
                onClick={() => pickStorage(id)}
                className={cn(
                  "flex min-h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition active:scale-[0.98]",
                  storage === id ? "border-primary bg-primary/15 text-primary" : "border-border text-muted hover:bg-surface/[0.06]"
                )}
              >
                <Icon className="h-4 w-4" /> {STORAGE_LABEL[id]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="space-y-2">
        <Label htmlFor="expiry">Expiry date</Label>
        <Input
          id="expiry"
          type="date"
          value={expiry}
          onChange={(e) => {
            setExpiry(e.target.value);
            setExpirySource("manual");
            setEstimateNote(null);
          }}
          required
        />

        {/* Where the date came from is recorded automatically; users only see what matters. */}
        {expirySource === "printed" && expiry && (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Read from the packaging. Double-check it against the pack.
          </p>
        )}
        {expirySource === "estimated" && (
          <p className="text-sm text-warning">This date is an estimate. Check the packaging before relying on it.</p>
        )}
        {expirySource === "unknown" && expiry && (
          <p className="text-xs text-muted">We don’t know where this date came from. Change it to confirm it.</p>
        )}
        {estimateNote && expirySource === "estimated" && <p className="text-xs text-muted">{estimateNote}</p>}
        {category === "medicine" ? (
          <p className="text-xs text-muted">For medicine, scan or enter the expiry printed on the strip or box.</p>
        ) : (
          !expiry && <p className="text-xs text-muted">Only month and year printed (like “06/27”)? Pick the last day of that month.</p>
        )}

        {showSuggestion && suggestion && (
          <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/[0.07] p-3 sm:flex-row sm:items-center">
            <p className="flex flex-1 items-start gap-2 text-sm">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                {suggestion.basis} Suggested date: <strong>{formatDate(suggestion.expiry_date!)}</strong>.
                <span className="block text-xs text-muted">If a date is printed on the pack, use that instead.</span>
              </span>
            </p>
            <Button type="button" size="sm" onClick={useSuggestion} className="shrink-0">
              Use this date
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowScan((v) => !v)}>
            <Camera className="h-4 w-4" /> {showScan ? "Close scanner" : "Scan date from label"}
          </Button>
          {canEstimate && !showSuggestion && !expiry && (
            <Button type="button" variant="outline" size="sm" onClick={estimateExpiry} disabled={estimating}>
              {estimating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              No date? Estimate it
            </Button>
          )}
        </div>
      </div>

      {showScan && (
        <div className="rounded-xl border border-border p-3">
          <ScanUploader onExtracted={handleScanFill} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="qty">Quantity</Label>
          <Input
            id="qty"
            type="number"
            inputMode="decimal"
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
            placeholder="pcs, ml, g"
            autoComplete="off"
          />
          <datalist id="unit-suggestions">
            {UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="space-y-4">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="more-details"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border px-3 text-left text-sm font-medium transition hover:bg-surface/[0.06]"
        >
          <span>
            More details <span className="font-normal text-muted">· optional</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", moreOpen && "rotate-180")} />
        </button>

        {moreOpen && (
          <div id="more-details" className="space-y-4">
            <div>
              <Label htmlFor="location">Storage location</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} placeholder="Fridge, pantry, medicine cabinet…" />
            </div>

            <div>
              <Label htmlFor="mfg">Manufacture date</Label>
              <Input id="mfg" type="date" value={mfg ?? ""} onChange={(e) => setMfg(e.target.value)} />
            </div>

            {/* Opened tracking — shortens the effective expiry once a product is opened. */}
            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-sm font-medium">
                Opened it? <span className="font-normal text-muted">We’ll remind you by whichever date comes first.</span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="opened">Opened on</Label>
                  <Input id="opened" type="date" value={openedDate ?? ""} onChange={(e) => changeOpened(e.target.value)} />
                  {!openedDate && (
                    <button type="button" onClick={() => changeOpened(todayKolkata())} className="mt-1 inline-flex min-h-9 items-center text-xs font-medium text-primary">
                      Opened today
                    </button>
                  )}
                </div>
                <div>
                  <Label htmlFor="within">Use within (days)</Label>
                  <Input
                    id="within"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={openWithin}
                    onChange={(e) => setOpenWithin(e.target.value)}
                    placeholder="7"
                  />
                </div>
              </div>
              {effectiveHint && <p className="text-xs text-accent">Use by {formatDate(effectiveHint)} once opened.</p>}
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {!fromScan && (
              <div>
                <Label htmlFor="image">Photo</Label>
                <Input id="image" type="file" accept="image/*" onChange={(e) => void onImageChosen(e.target.files?.[0] ?? null)} />
                {initial.image_url && !file && <p className="mt-1 text-xs text-muted">A photo is already attached.</p>}
              </div>
            )}
            {fromScan && file && <p className="text-xs text-muted">The scanned photo will be saved with this item.</p>}
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "create" ? "Save item" : "Save changes"}
      </Button>
    </form>
  );
}
