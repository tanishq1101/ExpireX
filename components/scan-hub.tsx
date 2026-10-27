"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ScanBarcode, Camera, ReceiptText, PencilLine, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Extraction } from "@/lib/validators";
import { initialFromExtraction } from "@/lib/extraction";
import type { ItemFormInitial } from "@/components/item-form";

const loading = () => <p role="status" className="py-6 text-center text-sm text-muted">Loading item entry…</p>;
const ItemForm = dynamic(() => import("@/components/item-form").then((module) => module.ItemForm), { loading });
const ScanUploader = dynamic(() => import("@/components/scan-uploader").then((module) => module.ScanUploader), { loading });
const BarcodeAdd = dynamic(() => import("@/components/barcode-add").then((module) => module.BarcodeAdd), { loading });
const ReceiptScan = dynamic(() => import("@/components/receipt-scan").then((module) => module.ReceiptScan), { loading });

type Mode = "barcode" | "scan" | "receipt" | "manual";

const OPTIONS: { id: Mode; label: string; desc: string; icon: typeof ScanBarcode }[] = [
  { id: "barcode", label: "Scan barcode", desc: "Identify a product instantly", icon: ScanBarcode },
  { id: "scan", label: "Scan photo", desc: "Read a label with the camera", icon: Camera },
  { id: "receipt", label: "Scan receipt", desc: "Add many items at once", icon: ReceiptText },
  { id: "manual", label: "Add manually", desc: "Type the details yourself", icon: PencilLine },
];

export function ScanHub({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [result, setResult] = useState<{ initial: ItemFormInitial; file?: File; notice?: string } | null>(
    null
  );

  function back() {
    setMode(null);
    setResult(null);
  }

  function handleExtracted(ex: Extraction, file: File) {
    const { initial, notice } = initialFromExtraction(ex);
    setResult({ initial, file, notice });
  }

  function handleBarcodeResolved(initial: ItemFormInitial, notice: string, file?: File) {
    setResult({ initial, notice, file });
  }

  // Chooser — the scan-first screen.
  if (!mode) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-border bg-surface/[0.04] px-3 py-2 text-center text-xs text-muted">
          Scan items with an expiry: 🍎 Food · 💄 Cosmetics · 💊 Medicine
        </p>
        <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
          {OPTIONS.map(({ id, label, desc, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className="glass hover-glow group flex flex-col items-center gap-2 p-5 text-center"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/15 text-primary transition group-hover:scale-110">
              <Icon className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold">{label}</span>
            {!compact && <span className="text-xs text-muted">{desc}</span>}
          </button>
          ))}
        </div>
      </div>
    );
  }

  const showForm = result !== null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={back}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to options
      </button>

      {mode === "manual" && <ItemForm mode="create" />}

      {mode === "receipt" && <ReceiptScan />}

      {mode === "scan" &&
        (showForm ? (
          <ItemForm
            mode="create"
            initial={result.initial}
            pendingImage={result.file ?? null}
            fromScan
            notice={result.notice}
          />
        ) : (
          <ScanUploader onExtracted={handleExtracted} />
        ))}

      {mode === "barcode" &&
        (showForm ? (
          <ItemForm
            mode="create"
            initial={result.initial}
            pendingImage={result.file ?? null}
            fromScan
            notice={result.notice}
          />
        ) : (
          <BarcodeAdd onResolved={handleBarcodeResolved} />
        ))}
    </div>
  );
}
