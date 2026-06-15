"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ScanBarcode } from "lucide-react";
import type { ProductLookup, ShelfLife } from "@/lib/validators";
import type { ItemFormInitial } from "@/components/item-form";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button } from "@/components/ui/button";

export function BarcodeAdd({
  onResolved,
}: {
  onResolved: (initial: ItemFormInitial, notice: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  // intro -> wait for a tap before opening the camera (no surprise permission prompt)
  const [step, setStep] = useState<"intro" | "scan" | "looking">("intro");

  async function handleDetected(barcode: string) {
    setBusy(true);
    setStep("looking");
    try {
      // 1) Identify the product from the barcode (name/brand/category).
      const lookupRes = await fetch(`/api/lookup?barcode=${encodeURIComponent(barcode)}`);
      const product = (await lookupRes.json()) as ProductLookup;

      const initial: ItemFormInitial = { barcode };
      let notice: string;

      if (product.found && product.name) {
        // Prefix the brand only when it isn't already part of the product name.
        const nm = product.name;
        const br = product.brand;
        initial.name =
          br && !nm.toLowerCase().includes(br.toLowerCase()) ? `${br} ${nm}` : nm;
        if (product.category) initial.category = product.category;

        // 2) The barcode can't carry a date — ask AI for a shelf-life estimate to pre-fill.
        try {
          const estRes = await fetch("/api/estimate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: initial.name, category: initial.category ?? "other" }),
          });
          const est = (await estRes.json()) as ShelfLife;
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

      onResolved(initial, notice);
    } catch {
      toast.error("Lookup failed. Try again or enter details manually.");
      setStep("scan");
    } finally {
      setBusy(false);
    }
  }

  if (step === "looking" || busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-muted">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm">Looking up the product…</p>
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
