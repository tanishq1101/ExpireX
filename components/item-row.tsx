import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn, externalImageUrl } from "@/lib/utils";
import { relativeLabel } from "@/lib/dates";
import { getStatus, STATUS_META } from "@/lib/status";
import { CategoryTile } from "@/components/category-chip";
import { Badge } from "@/components/ui/badge";
import type { Item } from "@/types/database";

export function ItemRow({ item, today }: { item: Item; today: string }) {
  const status = getStatus(today, item.effective_expiry);
  const meta = STATUS_META[status];
  const img = externalImageUrl(item.image_preview_url ?? item.image_url);
  const opened = item.opened_date && item.effective_expiry < item.expiry_date;

  return (
    <li>
      <Link
        href={`/items/${item.id}`}
        className="glass group flex items-center gap-3 p-3 transition hover:border-primary/40"
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
          <p className="truncate font-medium">{item.name}</p>
          <p className="truncate text-xs text-muted">
            {relativeLabel(today, item.effective_expiry)}
            {opened ? " · opened" : ""}
            {item.expiry_source === "estimated" ? " · estimated date" : ""}
            {item.location ? ` · ${item.location}` : ""}
            {item.quantity != null ? ` · ${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : ""}
          </p>
        </div>
        <Badge className={cn(meta.tone)}>{meta.label}</Badge>
        <ChevronRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Link>
    </li>
  );
}
