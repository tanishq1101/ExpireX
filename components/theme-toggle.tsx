"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border",
        "bg-surface/[0.05] text-foreground transition hover:bg-surface/[0.12]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        className
      )}
    >
      {/* Render an icon only after mount to avoid SSR/theme mismatch flicker */}
      <Sun
        className={cn(
          "h-[1.05rem] w-[1.05rem] transition-all duration-300",
          mounted && !isDark ? "scale-100 rotate-0 opacity-100" : "absolute scale-0 -rotate-90 opacity-0"
        )}
      />
      <Moon
        className={cn(
          "h-[1.05rem] w-[1.05rem] transition-all duration-300",
          mounted && isDark ? "scale-100 rotate-0 opacity-100" : "absolute scale-0 rotate-90 opacity-0"
        )}
      />
    </button>
  );
}
