import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "text-foreground",
  iconTone = "text-muted bg-white/[0.06]",
}: {
  label: string;
  value: number;
  icon?: LucideIcon;
  tone?: string;
  iconTone?: string;
}) {
  return (
    <div className="glass p-4 transition hover:border-white/15">
      <div className="flex items-center justify-between">
        <div className={cn("text-3xl font-bold tabular-nums", tone)}>{value}</div>
        {Icon && (
          <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", iconTone)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}
