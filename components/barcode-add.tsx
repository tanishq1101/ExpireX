"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ScanBarcode, Package } from "lucide-react";
import { useSupabaseClient } from "@/services/supabase/client";
import { relativeLabel, todayKolkata } from "@/lib/dates";
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

type Existing = Pick<Item, "id" | "name" | "category" | "quantity" | "unit" | "expiry_date" | "location" | "image_url">;

export function BarcodeAdd({
  onResolved,
}: {
  onResolved: (initial: ItemFormInitial, notice: string, file?: File) => void;
}) {
  const supabase = useSupabaseClient();

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<
    "intro" | "scan" | "looking" | "analysis" | "exists" | "ocr" | "rejected"
  >("intro");
  const [rejectedName, setRejectedName] = useState<string | null>(null);
  // When the same barcode already exists, hold the new-item data so the user can still add it fresh.
  const [existing, setExisting] = useState<Existing | null>(null);
  const [pending, setPending] = useState<{ initial: ItemFormInitial; notice: string } | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);

  // Kick off the AI expiry estimate in the background and stream it into the card.
  function runEstimate(name: string, category: string) {
    fetchJson<ShelfLife>("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category }),
    })
      .then((est: ShelfLife) => {
        setAnalysis((prev) =>
          prev
            ? {
                ...prev,
                expiryDate: est.expiry_date ?? null,
                confidence: est.confidence ?? null,
                tips: est.tips ?? null,
                estimating: false,
              }
            : prev
        );
        setPending((prev) => {
          if (!prev) return prev;
          const initial = { ...prev.initial };
          let notice: string;
          if (est.expiry_date) {
            initial.expiry_date = est.expiry_date;
            initial.expiry_source = "estimated";
            notice = `Identified "${initial.name}" by barcode. Expiry is an AI estimate${
              est.basis ? ` (${est.basis})` : ""
            } — please confirm or scan the printed date.`;
          } else {
            notice = `Identified "${initial.name}" by barcode. Add the expiry date (scan the label or enter it).`;
          }
          return { initial, notice };
        });
      })
      .catch(() => {
        setAnalysis((prev) => (prev ? { ...prev, estimating: false } : prev));
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
          .select("id,name,category,quantity,unit,expiry_date,location,image_url")
          .eq("barcode", barcode)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r) => { if (r.error) throw r.error; return (r.data as Existing) ?? null; }),
      ]);
      product = p;
      existingRow = ex;
    } catch {
      toast.error("Lookup failed. Try again or enter details manually.");
      setStep("scan");
      setBusy(false);
      return;
    }

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

    // Already in inventory → offer +1 (the form can estimate if they add as new).
    if (existingRow) {
      setExisting(existingRow);
      setPending({
        initial: { ...anotherBatch(existingRow), ...initial, name: initial.name || existingRow.name, category: initial.category ?? existingRow.category },
        notice: product.found ? `Identified "${initial.name}" by barcode.` : `Barcode ${barcode} saved.`,
      });
      setStep("exists");
      setBusy(false);
      return;
    }

    // Unknown barcode → auto-flow into the AI label reader (no empty manual form).
    if (!product.found || !product.name) {
      setUnknownBarcode(barcode);
      setStep("ocr");
      setBusy(false);
      toast.message("Code not in our databases — point at the label and AI will read it");
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
    setPending({ initial, notice: `Identified "${initial.name}" by barcode. Estimating expiry…` });
    setStep("analysis");
    setBusy(false);
    toast.success("Product identified");
    runEstimate(initial.name ?? "", initial.category ?? "other");
  }

  if (step === "looking" || busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-muted">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm">Working…</p>
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
        <p className="text-sm text-muted">This product is already tracked. Save a separate batch and enter its printed expiry; the existing batch stays unchanged.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            onClick={() => onResolved(pending.initial, pending.notice)}
          >
            Add new batch
          </Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => setStep("intro")}>
          Cancel
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
          setStep("intro");
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
            Couldn&apos;t identify barcode {unknownBarcode} in our databases. Point the camera at the
            product label — AI will read the name, dates and details automatically.
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

  if (step === "intro") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/15 text-primary">
          <ScanBarcode className="h-8 w-8" />
        </span>
        <div>
          <p className="font-semibold">Scan a product barcode</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
            We&apos;ll identify the product and AI-estimate a likely expiry. You confirm before saving.
          </p>
        </div>
        <Button onClick={() => setStep("scan")}>
          <ScanBarcode className="h-4 w-4" /> Start scanning
        </Button>
      </div>
    );
  }

  return <BarcodeScanner onDetected={handleDetected} onCancel={() => setStep("intro")} />;
}
