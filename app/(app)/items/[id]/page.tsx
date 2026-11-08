import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Copy, MapPin, Package, PackageOpen, ScanBarcode, StickyNote } from "lucide-react";
import { withImagePreviews } from "@/lib/storage";
import { createClient } from "@/services/supabase/server";
import { addDays, formatDate, relativeLabel, todayKolkata } from "@/lib/dates";
import { countdown, getStatus, STATUS_META } from "@/lib/status";
import { openedDaysFor } from "@/lib/shelf-life";
import { cn, externalImageUrl } from "@/lib/utils";
import { CATEGORY_META } from "@/lib/categories";
import { DeleteItemButton } from "@/components/delete-item-button";
import { ItemQuickActions } from "@/components/item-quick-actions";
import { ItemEditToggle } from "@/components/item-edit-toggle";
import { CategoryTile } from "@/components/category-chip";
import { Badge } from "@/components/ui/badge";
import type { Item } from "@/types/database";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Partial<Record<Item["expiry_source"], string>> = {
  printed: "Read from the pack",
  manual: "Entered by you",
  estimated: "Estimated — check the pack",
};
const TONE = { expired: "text-danger", expiring: "text-warning", ok: "text-success" } as const;

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Could not load this item. Please retry.");
  if (!data) notFound();
  const [item] = await withImagePreviews(supabase, [data as Item]);

  const today = todayKolkata();
  const status = getStatus(today, item.effective_expiry);
  const left = countdown(today, item.effective_expiry);
  const img = externalImageUrl(item.image_preview_url ?? item.image_url);
  const opened = item.opened_date && item.open_within_days ? addDays(item.opened_date, item.open_within_days) : null;
  const datedItem = ["documents", "warranty", "subscription"].includes(item.category);

  const facts = [
    { icon: Package, label: "Amount", value: item.quantity != null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : null },
    { icon: MapPin, label: "Kept in", value: item.location },
    { icon: PackageOpen, label: "Opened", value: item.opened_date ? `${formatDate(item.opened_date)}${opened ? ` · use by ${formatDate(opened)}` : ""}` : null },
    { icon: ScanBarcode, label: "Barcode", value: item.barcode },
    { icon: StickyNote, label: "Notes", value: item.notes },
  ].filter((f) => f.value);

  return (
    <div className="space-y-4">
      <section className="glass p-5">
        <div className="flex items-start gap-3">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="h-16 w-16 shrink-0 rounded-2xl border border-border object-cover" />
          ) : (
            <CategoryTile category={item.category} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-lg font-semibold leading-snug">{item.name}</h1>
            <p className="text-xs text-muted">{CATEGORY_META[item.category].label}</p>
          </div>
          <Badge className={cn("shrink-0", STATUS_META[status].tone)}>{STATUS_META[status].label}</Badge>
        </div>

        <div className="mt-5 flex items-end justify-between gap-3 rounded-2xl border border-border bg-surface/[0.04] p-4">
          <div>
            <p className="text-xs text-muted">{opened && opened < item.expiry_date ? "Use by (opened)" : "Expires"}</p>
            <p className="text-xl font-bold">{formatDate(item.effective_expiry)}</p>
            {SOURCE_LABEL[item.expiry_source] && <p className="mt-0.5 text-xs text-muted">{SOURCE_LABEL[item.expiry_source]}</p>}
          </div>
          <div className="text-right">
            <p className={cn("text-2xl font-extrabold tabular-nums", TONE[status])}>{left.value}</p>
            <p className="text-xs text-muted">{left.caption || relativeLabel(today, item.effective_expiry)}</p>
          </div>
        </div>

        {facts.length > 0 && (
          <dl className="mt-4 grid gap-2 text-sm">
            {facts.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                <dt className="w-20 shrink-0 text-muted">{label}</dt>
                <dd className={cn("min-w-0 break-words", label === "Barcode" && "font-mono text-xs leading-5")}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <ItemQuickActions item={item} expired={status === "expired"} openDays={item.open_within_days ?? openedDaysFor(item.name, item.category)} />

      <ItemEditToggle initial={item} previewUrl={item.image_preview_url} />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm">
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-muted hover:text-foreground" href={`/items/new?batch=${item.id}`}>
            <Copy className="h-4 w-4" /> Add another batch
          </Link>
          {datedItem && (
            <a className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-muted hover:text-foreground" href={`/api/items/${item.id}/calendar`}>
              <CalendarPlus className="h-4 w-4" /> Add to calendar
            </a>
          )}
        </div>
        <DeleteItemButton id={item.id} imageUrl={item.image_url} />
      </div>
    </div>
  );
}
