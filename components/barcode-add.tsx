"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, ScanBarcode, Package } from "lucide-react";
import { useSupabaseClient } from "@/services/supabase/client";
import { addDays, daysBetween, formatDate, relativeLabel, todayKolkata } from "@/lib/dates";
import type { ProductLookup, ShelfLife, Extraction } from "@/lib/validators";
import { fetchJson } from "@/lib/fetch-json";
import { anotherBatch } from "@/lib/batch";
import type { Item } from "@/types/database";
import { initialFromExtraction } from "@/lib/extraction";
import type { ItemFormInitial } from "@/components/item-form";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ScanUploader } from "@/components/scan-uploader";
import { ScanRejected } from "@/components/scan-rejected";
import { ProductAnalysisCard, type Analysis } from "@/components/product-analysis-card";
import { Button } from "@/components/ui/button";

type Existing = Pick<Item, "id" | "name" | "category" | "quantity" | "unit" | "expiry_date" | "location" | "image_url" | "created_at" | "expiry_source">;

/** Days the previous batch was good for (added → expiry), when that is a sensible number. */
function lastShelfLife(row: Existing): number | null {
  if (!row.created_at || !row.expiry_date || row.expiry_source === "unknown") return null;
  const days = daysBetween(row.created_at.slice(0, 10), row.expiry_date);
  return days >= 1 && days <= 5 * 365 ? days : null;
}

export function BarcodeAdd({
  onResolved,
}: {
  onResolved: (initial: ItemFormInitial, notice: string, file?: File) => void;
}) {
  const supabase = useSupabaseClient();

  const [busy, setBusy] = useState(false);
  // Opens straight on the camera — the chooser tile the user just tapped is the only "start" they need.
  const [step, setStep] = useState<
    "scan" | "looking" | "analysis" | "exists" | "ocr" | "rejected"
  >("scan");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [rejectedName, setRejectedName] = useState<string | null>(null);
  // When the same barcode already exists, hold the new-item data so the user can still add it fresh.
  const [existing, setExisting] = useState<Existing | null>(null);
  const [pending, setPending] = useState<{ initial: ItemFormInitial; notice: string } | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);

  /** Put an expiry estimate into the card and the form prefill. */
  function applyEstimate(est: Pick<ShelfLife, "expiry_date" | "confidence" | "basis" | "tips">) {
    setAnalysis((prev) =>
      prev
        ? { ...prev, expiryDate: est.expiry_date ?? null, confidence: est.confidence ?? null, tips: est.tips ?? null, basis: est.basis ?? null, estimating: false }
        : prev
    );
    setPending((prev) => {
      if (!prev) return prev;
      const initial = { ...prev.initial };
      let notice: string;
      if (est.expiry_date) {
        initial.expiry_date = est.expiry_date;
        initial.expiry_source = "estimated";
        notice = `We found "${initial.name}". The expiry below is a typical estimate${
          est.basis ? ` (${est.basis})` : ""
        }. If a date is printed on the pack, use that instead.`;
      } else {
        notice = `We found "${initial.name}". Now add the expiry date printed on the pack.`;
      }
      return { initial, notice };
    });
  }

  // Only products our shelf-life guide can't place need the slower server estimate.
  function runEstimate(name: string, category: string, hints: string[] = []) {
    fetchJson<ShelfLife & { basis?: string | null }>("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, hints }),
    })
      .then((est) => { if (alive.current) applyEstimate(est); })
      .catch(() => {
        if (alive.current) setAnalysis((prev) => (prev ? { ...prev, estimating: false } : prev));
      });
  }

  async function handleDetected(barcode: string) {
    setBusy(true);
    setStep("looking");

    let product: ProductLookup;
    let existingRow: Existing | null;
    try {
      // Identify the product AND check for a duplicate IN PARALLEL (neither depends on the other).
      const [p, ex] = await Promise.all([
        fetchJson<ProductLookup>(`/api/lookup?barcode=${encodeURIComponent(barcode)}`),
        supabase
          .from("items")
          .select("id,name,category,quantity,unit,expiry_date,location,image_url,created_at,expiry_source")
          .eq("barcode", barcode)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r) => { if (r.error) throw r.error; return (r.data as Existing) ?? null; }),
      ]);
      product = p;
      existingRow = ex;
    } catch {
      if (!alive.current) return;
      toast.error("Lookup failed. Try again or enter details manually.");
      setStep("scan");
      setBusy(false);
      return;
    }
    // The user may have left this screen while the product was being looked up.
    if (!alive.current) return;

    // Reject products that aren't food/cosmetics/medicine (electronics, books, etc.).
    if (product.found && product.supported === false) {
      setRejectedName(product.name);
      setStep("rejected");
      setBusy(false);
      return;
    }

    // Build the form prefill from product identity (dates come later from AI/OCR/manual).
    const initial: ItemFormInitial = { barcode };
    if (product.found && product.name) {
      const nm = product.name;
      const br = product.brand;
      initial.name = br && !nm.toLowerCase().includes(br.toLowerCase()) ? `${br} ${nm}` : nm;
      if (product.category) initial.category = product.category;
      if (product.image_url) initial.image_url = product.image_url;
    }

    // Already in inventory → offer a new batch, pre-dated by how long the last one lasted.
    if (existingRow) {
      setExisting(existingRow);
      const next: ItemFormInitial = { ...anotherBatch(existingRow), ...initial, name: initial.name || existingRow.name, category: initial.category ?? existingRow.category };
      const lasted = lastShelfLife(existingRow);
      let notice = product.found ? `Identified "${next.name}" by barcode.` : `Barcode ${barcode} saved.`;
      if (lasted && next.category !== "medicine") {
        next.expiry_date = addDays(todayKolkata(), lasted);
        next.expiry_source = "estimated";
        notice = `Your last one was good for about ${lasted} days, so we suggested ${formatDate(next.expiry_date)}. If a date is printed on this pack, use that instead.`;
      }
      setPending({ initial: next, notice });
      setStep("exists");
      setBusy(false);
      return;
    }

    // Unknown barcode → auto-flow into the AI label reader (no empty manual form).
    if (!product.found || !product.name) {
      setUnknownBarcode(barcode);
      setStep("ocr");
      setBusy(false);
      toast.message("Not in our product databases — photograph the label instead");
      return;
    }

    // Found → show the analysis card IMMEDIATELY, then stream in the AI estimate.
    setAnalysis({
      name: initial.name ?? "",
      imageUrl: initial.image_url ?? null,
      category: initial.category,
      size: product.size,
      expiryDate: null,
      confidence: null,
      tips: null,
      estimating: true,
    });
    setPending({ initial, notice: `We found "${initial.name}". Add the expiry date printed on the pack.` });
    setStep("analysis");
    setBusy(false);
    toast.success("Product identified");
    if (product.estimate?.expiry_date) applyEstimate(product.estimate);
    else if (initial.category !== "medicine") runEstimate(initial.name ?? "", initial.category ?? "other", product.tags ?? []);
    else setAnalysis((prev) => (prev ? { ...prev, estimating: false } : prev));
  }

  if (step === "looking" || busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-muted">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p role="status" className="text-sm">Looking up the product…</p>
      </div>
    );
  }

  if (step === "analysis" && analysis && pending) {
    return (
      <ProductAnalysisCard
        analysis={analysis}
        today={todayKolkata()}
        onContinue={() => onResolved(pending.initial, pending.notice)}
        onRescan={() => {
          setAnalysis(null);
          setStep("scan");
        }}
      />
    );
  }

  if (step === "exists" && existing && pending) {
    return (
      <div className="space-y-4">
        <div className="glass flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <Package className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{existing.name}</p>
            <p className="text-xs text-muted">
              Already in your inventory · qty {existing.quantity ?? 1} ·{" "}
              {relativeLabel(todayKolkata(), existing.expiry_date)}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted">
          You already track this product. Add this one as a new batch with its own expiry date — the existing one stays as it is.
          {pending.initial.expiry_date && (
            <span className="mt-1 block text-foreground">
              Suggested expiry: <strong>{formatDate(pending.initial.expiry_date)}</strong> (based on your last one).
            </span>
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            onClick={() => onResolved(pending.initial, pending.notice)}
          >
            Add new batch
          </Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => setStep("scan")}>
          Scan a different product
        </Button>
      </div>
    );
  }

  if (step === "rejected") {
    return (
      <ScanRejected
        detected={rejectedName}
        onRetry={() => {
          setRejectedName(null);
          setStep("scan");
        }}
      />
    );
  }

  if (step === "ocr") {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          <ScanBarcode className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Barcode {unknownBarcode} isn&apos;t in our product databases. Take a photo of the label
            instead — we&apos;ll read the name and dates for you.
          </span>
        </p>
        <ScanUploader
          onExtracted={(ex: Extraction, file: File) => {
            const { initial, notice } = initialFromExtraction(ex, {
              barcode: unknownBarcode ?? undefined,
            });
            onResolved(initial, notice ?? "Read from the label by AI — please confirm.", file);
          }}
        />
      </div>
    );
  }

  return <BarcodeScanner onDetected={handleDetected} />;
}
