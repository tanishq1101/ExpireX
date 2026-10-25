"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ReceiptText, Trash2, Save } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseClient } from "@/services/supabase/client";
import type { ReceiptItem } from "@/lib/validators";
import { prepareReceiptRows, type ReceiptRow as Row } from "@/lib/receipt-review";
import { fetchJson } from "@/lib/fetch-json";
import { CATEGORIES } from "@/lib/status";
import { CATEGORY_META } from "@/lib/categories";
import type { Category } from "@/types/database";
import { ImageCapture } from "@/components/image-capture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

function toRows(items: ReceiptItem[]): Row[] {
  return items.map((it) => ({
    name: it.name,
    category: (it.category as Category) ?? "food",
    expiry: it.expiry_date ?? "",
    qty: it.quantity != null ? String(it.quantity) : "1",
  }));
}

export function ReceiptScan() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const { userId } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  async function process() {
    if (!file) return;
    setProcessing(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const json = await fetchJson<{ items?: ReceiptItem[] }>("/api/receipt", {
        method: "POST",
        body,
      });
      const items = (json.items ?? []) as ReceiptItem[];
      if (items.length === 0) {
        toast.error("No products found. Try a clearer photo or add items manually.");
        return;
      }
      setRows(toRows(items));
      toast.success(`Found ${items.length} item${items.length > 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Receipt scan failed.");
    } finally {
      setProcessing(false);
    }
  }

  function update(i: number, patch: Partial<Row>) {
    setRowErrors({});
    setRows((prev) => prev && prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRowErrors({});
    setRows((prev) => prev && prev.filter((_, idx) => idx !== i));
  }

  async function saveAll() {
    if (!rows) return;
    if (!userId) {
      toast.error("Your session ended. Sign in again to save your items.");
      return;
    }
    setSaving(true);
    try {
      const { valid, errors } = prepareReceiptRows(rows, userId);
      setRowErrors(errors);
      if (Object.keys(errors).length > 0 || valid.length === 0) {
        toast.error("Check the highlighted items. Nothing has been saved yet.");
        return;
      }
      const { error } = await supabase.from("items").insert(valid);
      if (error) throw error;
      toast.success(`Saved ${valid.length} item${valid.length > 1 ? "s" : ""}`);
      router.push("/items");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save items.");
    } finally {
      setSaving(false);
    }
  }

  // Step 2: review & edit the extracted rows.
  if (rows) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ReceiptText className="h-4 w-4 text-primary" />
          Review {rows.length} item{rows.length > 1 ? "s" : ""}
        </div>
        <p className="text-xs text-muted">
          Check every name and printed expiry date before saving. Suggested dates are estimates,
          not dates read from the pack. Remove any items you don’t want to save.
        </p>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="glass space-y-2 p-3" role="group" aria-label={`Item ${i + 1}`} aria-describedby={rowErrors[i] ? `receipt-error-${i}` : undefined}>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Item ${i + 1} name`}
                  disabled={saving}
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Item name"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={saving}
                  aria-label="Remove row"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Select
                  disabled={saving}
                  value={r.category}
                  onChange={(e) => update(i, { category: e.target.value as Category })}
                  aria-label="Category"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </option>
                  ))}
                </Select>
                <Input
                  disabled={saving}
                  type="date"
                  value={r.expiry}
                  onChange={(e) => update(i, { expiry: e.target.value })}
                  aria-label="Expiry date"
                />
                <Input
                  disabled={saving}
                  type="number"
                  min="0"
                  step="any"
                  value={r.qty}
                  onChange={(e) => update(i, { qty: e.target.value })}
                  placeholder="Qty"
                  aria-label="Quantity"
                  className="col-span-2 sm:col-span-1"
                />
              </div>
              {rowErrors[i] && <p id={`receipt-error-${i}`} role="alert" className="text-sm text-danger">{rowErrors[i]}</p>}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setRows(null)} disabled={saving}>
            Scan again
          </Button>
          <Button className="flex-1" onClick={saveAll} disabled={saving || rows.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save all
          </Button>
        </div>
      </div>
    );
  }

  // Step 1: capture the receipt.
  return (
    <div className="space-y-4">
      <ImageCapture
        disabled={processing}
        onPick={setFile}
        onClear={() => setFile(null)}
        hint="Snap or upload a shopping receipt — we’ll list every product and estimate expiries."
      />
      {file && (
        <Button className="w-full" onClick={process} disabled={processing}>
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Reading receipt…
            </>
          ) : (
            <>
              <ReceiptText className="h-4 w-4" /> Extract items
            </>
          )}
        </Button>
      )}
    </div>
  );
}
