"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "expirex-splash-shown";

/** First-open splash (once per browser session): logo, wordmark, progress, tagline. */
export function SplashScreen() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* private mode — just show it */
    }
    if (alreadyShown) return;

    setShow(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 350 : 1700;

    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(100, ((t - start) / dur) * 100);
      setProgress(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const t1 = setTimeout(() => setLeaving(true), dur);
    const t2 = setTimeout(() => {
      setShow(false);
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
    }, dur + 500);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-6 transition-opacity duration-500",
        leaving && "pointer-events-none opacity-0"
      )}
      aria-hidden
    >
      {/* Logo */}
      <div className="relative grid h-28 w-28 place-items-center rounded-[28px] bg-gradient-to-br from-primary to-accent shadow-[0_24px_60px_-12px] shadow-primary/50">
        <div className="absolute inset-3 rounded-full border-2 border-dashed border-white/40" />
        <X className="h-14 w-14 text-white" strokeWidth={3} />
      </div>

      {/* Wordmark */}
      <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-primary">
        Expire <span className="text-accent">X</span>
      </h1>

      {/* Progress */}
      <div className="mt-7 h-1 w-52 overflow-hidden rounded-full bg-surface/15">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Tagline */}
      <div className="mt-7 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-muted">
        <span className="h-px w-6 bg-border" />
        Track. Save. Sustain.
        <span className="h-px w-6 bg-border" />
      </div>
    </div>
  );
}
