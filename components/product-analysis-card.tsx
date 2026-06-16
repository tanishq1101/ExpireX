"use client";

import { Info, Zap, ScanLine, ArrowRight, RotateCcw } from "lucide-react";
import { cn, externalImageUrl } from "@/lib/utils";
import { daysBetween } from "@/lib/dates";
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
  estimating?: boolean; // AI estimate still in flight — show a placeholder
};

const CONF_LABEL: Record<string, string> = { high: "HIGH", medium: "MEDIUM", low: "LOW" };

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
  const { name, imageUrl, category, size, expiryDate, confidence, tips, estimating } = analysis;
  const img = externalImageUrl(imageUrl);
  const Icon = CATEGORY_META[(category as Category) ?? "other"].icon;

  const days = expiryDate ? daysBetween(today, expiryDate) : null;
  const expTone =
    days == null ? "text-muted" : days < 0 ? "text-danger" : days <= 7 ? "text-warning" : "text-accent";
  const expText =
    days == null
      ? "SET DATE"
      : days < 0
        ? `EXPIRED ${Math.abs(days)}D`
        : days === 0
          ? "EXP: TODAY"
          : `EXP: ${days} DAY${days === 1 ? "" : "S"}`;

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

        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent">
          Product identified
        </p>

        {/* image / icon */}
        <div className="mt-3 grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 to-accent/10">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-16 w-16 text-primary/60" />
          )}
        </div>

        <h2 className="mt-4 text-2xl font-extrabold tracking-tight">{name || "Unknown product"}</h2>
        {size && <p className="mt-0.5 text-xs text-muted">Size: {size}</p>}

        <div className="mt-2 flex items-center justify-between">
          {estimating && days == null ? (
            <span className="inline-flex items-center gap-2 font-mono text-sm font-bold tracking-wide text-accent">
              <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-accent" /> ANALYSING…
            </span>
          ) : (
            <span className={cn("font-mono text-sm font-bold tracking-wide", expTone)}>{expText}</span>
          )}
          {confidence && !estimating && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-accent">
              AI MATCH: {CONF_LABEL[confidence]}
            </span>
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
          className="mt-5 w-full border border-dashed border-accent/50 bg-accent/10 text-foreground hover:bg-accent/20"
        >
          <ScanLine className="h-4 w-4" /> View full analysis <ArrowRight className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={onRescan}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 text-xs text-muted transition hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Scan again
        </button>
      </div>
    </div>
  );
}
