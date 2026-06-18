"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUPPORTED = [
  { emoji: "🍎", label: "Food", ex: "Fruits, veg, snacks, drinks, packaged food" },
  { emoji: "💄", label: "Cosmetics", ex: "Shampoo, face wash, sunscreen, makeup" },
  { emoji: "💊", label: "Medicine", ex: "Tablets, syrups, supplements" },
];
const UNSUPPORTED = ["Laptop", "Phone", "TV", "Headphones", "Books", "Charger", "Shoes", "Furniture"];

export function ScanRejected({
  detected,
  onRetry,
}: {
  detected?: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="animate-fade-up space-y-5 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-warning/15 text-warning">
        <AlertTriangle className="h-8 w-8" />
      </div>

      <div>
        <h2 className="text-lg font-bold">This item has no expiry tracking support</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {detected ? (
            <>
              Detected <span className="font-medium text-foreground">{detected}</span>. Expire X
              tracks only products with an expiry or shelf life.
            </>
          ) : (
            <>Expire X tracks only products with an expiry or shelf life.</>
          )}
        </p>
      </div>

      {/* What you can scan */}
      <div className="grid gap-2 sm:grid-cols-3">
        {SUPPORTED.map((s) => (
          <div key={s.label} className="glass p-4 text-center">
            <div className="text-2xl">{s.emoji}</div>
            <div className="mt-1 text-sm font-semibold">{s.label}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-muted">{s.ex}</div>
          </div>
        ))}
      </div>

      {/* What gets rejected (subtle) */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted/70">
        {UNSUPPORTED.map((u) => (
          <span key={u} className="inline-flex items-center gap-1">
            <span className="text-danger/70">✕</span> {u}
          </span>
        ))}
      </div>

      <Button onClick={onRetry} className="mx-auto">
        <RotateCcw className="h-4 w-4" /> Scan a supported product
      </Button>
    </div>
  );
}
