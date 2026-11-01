import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "text-foreground",
  iconTone = "text-muted bg-surface/[0.08]",
  href,
}: {
  label: string;
  value: number;
  icon?: LucideIcon;
  tone?: string;
  iconTone?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <div className={cn("text-3xl font-bold tabular-nums", tone)}>{value}</div>
        {Icon && (
          <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", iconTone)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </>
  );
  const cls = "glass block p-4 transition hover:border-primary/40";
  // A tappable card opens the matching list, so the number is never a dead end.
  return href ? (
    <Link href={href} className={cn(cls, "active:bg-surface/[0.06]")} aria-label={`${label}: ${value}. View items`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
