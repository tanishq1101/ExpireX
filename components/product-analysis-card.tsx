"use client";

import { Info, Zap, ArrowRight, RotateCcw } from "lucide-react";
import { cn, externalImageUrl } from "@/lib/utils";
import { daysBetween, formatDate } from "@/lib/dates";
import { CATEGORY_META } from "@/lib/categories";
import type { Category } from "@/types/database";
import { Button } from "@/components/ui/button";

export type Analysis = {
  name: string;
  imageUrl?: string | null;
  category?: Category;
  size?: string | null;
  expiryDate?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  tips?: string[] | null;
  basis?: string | null; // one plain sentence, e.g. "Chips usually keep about 4 months at room temperature."
  estimating?: boolean; // estimate still in flight — show a placeholder
};

export function ProductAnalysisCard({
  analysis,
  today,
  onContinue,
  onRescan,
}: {
  analysis: Analysis;
  today: string;
  onContinue: () => void;
  onRescan: () => void;
}) {
  const { name, imageUrl, category, size, expiryDate, tips, basis, estimating } = analysis;
  const img = externalImageUrl(imageUrl);
  const Icon = CATEGORY_META[(category as Category) ?? "other"].icon;

  const days = expiryDate ? daysBetween(today, expiryDate) : null;
  const expTone =
    days == null ? "text-muted" : days < 0 ? "text-danger" : days <= 7 ? "text-warning" : "text-foreground";
  const expText =
    days == null
      ? "Add the expiry date printed on the pack"
      : days < 0
        ? `Probably expired ${Math.abs(days)} day${days === -1 ? "" : "s"} ago`
        : days === 0
          ? "Probably expires today"
          : `Usually good until ${formatDate(expiryDate!)}`;

  return (
    <div className="relative">
      {/* HUD corner brackets */}
      {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "left-0 bottom-0 border-l-2 border-b-2", "right-0 bottom-0 border-r-2 border-b-2"].map(
        (pos) => (
          <span
            key={pos}
            className={cn("pointer-events-none absolute h-6 w-6 rounded-[3px] border-accent/70", pos)}
            aria-hidden
          />
        )
      )}

      <div className="glass relative overflow-hidden p-5">
        {/* animated scan-line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px animate-scanline bg-gradient-to-r from-transparent via-accent to-transparent" aria-hidden />

        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Product found</p>

        {/* image / icon */}
        <div className={cn("mt-3 grid w-full place-items-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 to-accent/10", img ? "aspect-[4/3]" : "h-24")}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-10 w-10 text-primary/60" />
          )}
        </div>

        <h2 className="mt-4 text-2xl font-extrabold tracking-tight">{name || "Unknown product"}</h2>
        {size && <p className="mt-0.5 text-xs text-muted">Size: {size}</p>}

        <div className="mt-3 space-y-1">
          {estimating && days == null ? (
            <span role="status" className="inline-flex items-center gap-2 text-sm font-medium text-accent">
              <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-accent" /> Checking how long it usually lasts…
            </span>
          ) : (
            <>
              <p className={cn("text-base font-semibold", expTone)}>{expText}</p>
              {days != null && (
                <p className="text-xs text-muted">
                  {basis ? `${basis} ` : ""}This is an estimate — if a date is printed on the pack, use that.
                </p>
              )}
            </>
          )}
        </div>

        {/* tips (or a shimmer while the estimate is in flight) */}
        {estimating && (!tips || tips.length === 0) ? (
          <div className="mt-4 space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface/10" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface/10" />
          </div>
        ) : (
          tips &&
          tips.length > 0 && (
            <ul className="mt-4 space-y-2">
              {tips.slice(0, 2).map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted">
                  {i === 0 ? (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  )}
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )
        )}

        <Button
          onClick={onContinue}
          className="mt-5 w-full"
        >
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={onRescan}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 text-sm text-muted transition hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Scan a different product
        </button>
      </div>
    </div>
  );
}
