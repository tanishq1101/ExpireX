import Link from "next/link";
import { withImagePreviews } from "@/lib/storage";
import { notFound } from "next/navigation";
import { createClient } from "@/services/supabase/server";
import { todayKolkata, relativeLabel } from "@/lib/dates";
import { getStatus, STATUS_META } from "@/lib/status";
import { cn, externalImageUrl } from "@/lib/utils";
import { ItemForm } from "@/components/item-form";
import { DeleteItemButton } from "@/components/delete-item-button";
import { CategoryTile } from "@/components/category-chip";
import { Badge } from "@/components/ui/badge";
import type { Item } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Could not load this item. Please retry.");
  if (!data) notFound();
  const [item] = await withImagePreviews(supabase, [data as Item]);

  const today = todayKolkata();
  const status = getStatus(today, item.effective_expiry);
  const img = externalImageUrl(item.image_preview_url ?? item.image_url);

  return (
    <div className="space-y-5">
      <div className="glass flex items-center gap-3 p-4">
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
          <h1 className="truncate text-lg font-semibold">{item.name}</h1>
          <p className="text-xs text-muted">
            {relativeLabel(today, item.effective_expiry)}
            {item.location ? ` · ${item.location}` : ""}
          </p>
        </div>
        <Badge className={cn(STATUS_META[status].tone)}>{STATUS_META[status].label}</Badge>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="inline-flex min-h-11 items-center rounded-xl border border-border px-3" href={`/items/new?batch=${item.id}`}>Add another batch</Link>
        {["documents", "warranty", "subscription"].includes(item.category) && <a className="inline-flex min-h-11 items-center rounded-xl border border-border px-3" href={`/api/items/${item.id}/calendar`}>Download calendar reminder</a>}
      </div>
      {["documents", "warranty", "subscription"].includes(item.category) && <p className="text-xs text-muted">Calendar downloads are snapshots. Download again after changing the date; your calendar may ask whether to update the existing event.</p>}
      <div className="glass p-5">
        <ItemForm mode="edit" initial={item} previewUrl={item.image_preview_url} />
      </div>

      <div className="flex justify-end">
        <DeleteItemButton id={item.id} imageUrl={item.image_url} />
      </div>
    </div>
  );
}
