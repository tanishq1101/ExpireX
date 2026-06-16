"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ScanBarcode, Plus, Package } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseClient } from "@/services/supabase/client";
import { relativeLabel, todayKolkata } from "@/lib/dates";
import type { ProductLookup, ShelfLife } from "@/lib/validators";
import type { ItemFormInitial } from "@/components/item-form";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ProductAnalysisCard, type Analysis } from "@/components/product-analysis-card";
import { Button } from "@/components/ui/button";

type Existing = { id: string; name: string; quantity: number | null; unit: string | null; expiry_date: string };

export function BarcodeAdd({
  onResolved,
}: {
  onResolved: (initial: ItemFormInitial, notice: string) => void;
}) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const { userId } = useAuth();

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"intro" | "scan" | "looking" | "analysis" | "exists">("intro");
  // When the same barcode already exists, hold the new-item data so the user can still add it fresh.
  const [existing, setExisting] = useState<Existing | null>(null);
  const [pending, setPending] = useState<{ initial: ItemFormInitial; notice: string } | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  async function handleDetected(barcode: string) {
    setBusy(true);
    setStep("looking");
    try {
      // 1) Identify the product (name/brand/category/image).
      const lookupRes = await fetch(`/api/lookup?barcode=${encodeURIComponent(barcode)}`);
      const product = (await lookupRes.json()) as ProductLookup;

      const initial: ItemFormInitial = { barcode };
      let notice: string;
      let confidence: ShelfLife["confidence"] = null;
      let tips: string[] | null = null;

      if (product.found && product.name) {
        const nm = product.name;
        const br = product.brand;
        initial.name = br && !nm.toLowerCase().includes(br.toLowerCase()) ? `${br} ${nm}` : nm;
        if (product.category) initial.category = product.category;
        if (product.image_url) initial.image_url = product.image_url; // auto-attach product image

        // 2) Barcodes carry no date — AI estimates a likely expiry (+ confidence + tips).
        try {
          const estRes = await fetch("/api/estimate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: initial.name, category: initial.category ?? "other" }),
          });
          const est = (await estRes.json()) as ShelfLife;
          confidence = est.confidence ?? null;
          tips = est.tips ?? null;
          if (est.expiry_date) {
            initial.expiry_date = est.expiry_date;
            notice = `Identified "${initial.name}" by barcode. Expiry is an AI estimate${
              est.basis ? ` (${est.basis})` : ""
            } — please confirm or scan the printed date.`;
          } else {
            notice = `Identified "${initial.name}" by barcode. Add the expiry date (scan the label or enter it).`;
          }
        } catch {
          notice = `Identified "${initial.name}" by barcode. Add the expiry date.`;
        }
        toast.success("Product identified");
      } else {
        notice = `Barcode ${barcode} isn't in the product database. Enter the details, or scan the label to auto-fill.`;
        toast.message("Barcode saved — product not found in database");
      }

      // 3) Already in inventory? Offer to bump quantity instead of duplicating.
      const { data } = await supabase
        .from("items")
        .select("id,name,quantity,unit,expiry_date")
        .eq("barcode", barcode)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setExisting(data as Existing);
        setPending({ initial, notice });
        setStep("exists");
        return;
      }

      // 4) Identified products get the HUD analysis card; unknown barcodes go straight to the form.
      if (product.found && product.name) {
        setAnalysis({
          name: initial.name ?? "",
          imageUrl: initial.image_url ?? null,
          category: initial.category,
          expiryDate: initial.expiry_date ?? null,
          confidence,
          tips,
        });
        setPending({ initial, notice });
        setStep("analysis");
        return;
      }

      onResolved(initial, notice);
    } catch {
      toast.error("Lookup failed. Try again or enter details manually.");
      setStep("scan");
    } finally {
      setBusy(false);
    }
  }

  async function incrementExisting() {
    if (!existing) return;
    setBusy(true);
    try {
      const next = (existing.quantity ?? 1) + 1;
      const { error } = await supabase.from("items").update({ quantity: next }).eq("id", existing.id);
      if (error) throw error;
      toast.success(`Updated "${existing.name}" — quantity ${next}`);
      router.push("/items");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update quantity.");
      setBusy(false);
    }
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
        <p className="text-sm text-muted">You&apos;ve scanned this product before. Add one more, or save it as a separate entry?</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={incrementExisting}>
            <Plus className="h-4 w-4" /> Add +1 to existing
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onResolved(pending.initial, pending.notice)}
          >
            Add as new item
          </Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => setStep("intro")}>
          Cancel
        </Button>
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
