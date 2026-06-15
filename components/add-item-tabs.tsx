"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Extraction } from "@/lib/validators";
import { ItemForm, type ItemFormInitial } from "@/components/item-form";
import { ScanUploader } from "@/components/scan-uploader";
import { Button } from "@/components/ui/button";

type Tab = "manual" | "scan";

export function AddItemTabs() {
  const [tab, setTab] = useState<Tab>("manual");
  const [scanResult, setScanResult] = useState<{ initial: ItemFormInitial; file: File } | null>(null);

  function handleExtracted(ex: Extraction, file: File) {
    // Map extraction -> form initial values. User MUST confirm via the form before any save.
    setScanResult({
      initial: {
        name: ex.product_name ?? "",
        category: ex.category ?? undefined,
        expiry_date: ex.expiry_date ?? undefined,
      },
      file,
    });
  }

  return (
    <div className="space-y-4">
      <div className="glass inline-flex gap-1 p-1">
        {(["manual", "scan"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm capitalize transition",
              tab === t ? "bg-primary/20 text-primary" : "text-muted hover:text-foreground"
            )}
          >
            {t === "scan" ? "Scan photo" : "Manual"}
          </button>
        ))}
      </div>

      <div className="glass p-5">
        {tab === "manual" && <ItemForm mode="create" />}

        {tab === "scan" &&
          (scanResult ? (
            <div className="space-y-3">
              <ItemForm
                mode="create"
                initial={scanResult.initial}
                pendingImage={scanResult.file}
                fromScan
              />
              <Button variant="ghost" className="w-full" onClick={() => setScanResult(null)}>
                Scan a different photo
              </Button>
            </div>
          ) : (
            <ScanUploader onExtracted={handleExtracted} />
          ))}
      </div>
    </div>
  );
}
