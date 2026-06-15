"use client";

import { useState } from "react";
import { ScanBarcode, Camera, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Extraction } from "@/lib/validators";
import { ItemForm, type ItemFormInitial } from "@/components/item-form";
import { ScanUploader } from "@/components/scan-uploader";
import { BarcodeAdd } from "@/components/barcode-add";
import { Button } from "@/components/ui/button";

type Tab = "barcode" | "scan" | "manual";

const TABS: { id: Tab; label: string; icon: typeof ScanBarcode }[] = [
  { id: "barcode", label: "Barcode", icon: ScanBarcode },
  { id: "scan", label: "Scan photo", icon: Camera },
  { id: "manual", label: "Manual", icon: PencilLine },
];

export function AddItemTabs() {
  const [tab, setTab] = useState<Tab>("barcode");
  const [result, setResult] = useState<{
    initial: ItemFormInitial;
    file?: File;
    notice?: string;
  } | null>(null);

  function reset() {
    setResult(null);
  }

  // Photo OCR path -> prefill the confirm form.
  function handleExtracted(ex: Extraction, file: File) {
    setResult({
      initial: {
        name: ex.product_name ?? "",
        category: ex.category ?? undefined,
        expiry_date: ex.expiry_date ?? undefined,
      },
      file,
      notice: undefined,
    });
  }

  // Barcode path -> product identity + AI estimate already resolved.
  function handleBarcodeResolved(initial: ItemFormInitial, notice: string) {
    setResult({ initial, notice });
  }

  function switchTab(t: Tab) {
    setResult(null);
    setTab(t);
  }

  return (
    <div className="space-y-4">
      <div className="glass inline-flex gap-1 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition sm:px-4",
              tab === id ? "bg-primary/20 text-primary" : "text-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="glass p-5">
        {/* Manual */}
        {tab === "manual" && <ItemForm mode="create" />}

        {/* Photo OCR */}
        {tab === "scan" &&
          (result ? (
            <FormWithReset
              onReset={reset}
              resetLabel="Scan a different photo"
              initial={result.initial}
              file={result.file}
              notice={result.notice}
            />
          ) : (
            <ScanUploader onExtracted={handleExtracted} />
          ))}

        {/* Barcode */}
        {tab === "barcode" &&
          (result ? (
            <FormWithReset
              onReset={reset}
              resetLabel="Scan another barcode"
              initial={result.initial}
              file={result.file}
              notice={result.notice}
            />
          ) : (
            <BarcodeAdd onResolved={handleBarcodeResolved} />
          ))}
      </div>
    </div>
  );
}

function FormWithReset({
  initial,
  file,
  notice,
  onReset,
  resetLabel,
}: {
  initial: ItemFormInitial;
  file?: File;
  notice?: string;
  onReset: () => void;
  resetLabel: string;
}) {
  return (
    <div className="space-y-3">
      <ItemForm mode="create" initial={initial} pendingImage={file ?? null} fromScan notice={notice} />
      <Button variant="ghost" className="w-full" onClick={onReset}>
        {resetLabel}
      </Button>
    </div>
  );
}
