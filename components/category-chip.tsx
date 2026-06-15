import { cn } from "@/lib/utils";
import { CATEGORY_META } from "@/lib/categories";
import type { Category } from "@/types/database";

export function CategoryChip({
  category,
  withIcon = true,
  className,
}: {
  category: Category;
  withIcon?: boolean;
  className?: string;
}) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        meta.tint,
        className
      )}
    >
      {withIcon && <Icon className="h-3.5 w-3.5" />}
      {meta.label}
    </span>
  );
}

// Square icon tile used in list rows / detail headers.
export function CategoryTile({ category, className }: { category: Category; className?: string }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
        meta.tint,
        className
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}
