import Link from "next/link";
import { cn, externalImageUrl } from "@/lib/utils";
import { formatDate, relativeLabel } from "@/lib/dates";
import { countdown, type ItemStatus } from "@/lib/status";
import { CategoryTile } from "@/components/category-chip";
import type { Item } from "@/types/database";

// Colour is never the only signal: the countdown text and caption carry the meaning too.
const TONE: Record<ItemStatus, string> = {
  expired: "text-danger",
  expiring: "text-warning",
  ok: "text-success",
};

export function ItemRow({ item, today }: { item: Item; today: string }) {
  const { value, caption, status } = countdown(today, item.effective_expiry);
  const img = externalImageUrl(item.image_preview_url ?? item.image_url);
  const opened = item.opened_date && item.effective_expiry < item.expiry_date;

  const details = [
    opened ? `Use by ${formatDate(item.effective_expiry)} (opened)` : formatDate(item.effective_expiry),
    item.expiry_source === "estimated" ? "estimated" : null,
    item.location,
    // A bare "1" says nothing; only show a quantity when it adds information.
    item.quantity != null && (item.unit || item.quantity !== 1) ? `${item.unit ? "" : "×"}${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : null,
  ].filter(Boolean);

  return (
    <li>
      <Link
        href={`/items/${item.id}`}
        aria-label={`${item.name}, ${relativeLabel(today, item.effective_expiry)}`}
        className="glass group flex min-h-[4.5rem] items-center gap-3 p-3 transition hover:border-primary/40 active:bg-surface/[0.06]"
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl border border-border object-cover"
          />
        ) : (
          <CategoryTile category={item.category} />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-medium leading-snug">{item.name}</p>
          <p className="truncate text-xs text-muted">{details.join(" · ")}</p>
        </div>
        <div className="min-w-[4.25rem] shrink-0 whitespace-nowrap text-right leading-tight" aria-hidden>
          <p className={cn("text-base font-bold tabular-nums", TONE[status])}>{value}</p>
          {caption && <p className="text-[11px] text-muted">{caption}</p>}
        </div>
      </Link>
    </li>
  );
}
