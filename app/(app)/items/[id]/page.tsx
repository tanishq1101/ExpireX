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

  const { data } = await supabase.from("items").select("*").eq("id", id).single();
  if (!data) notFound();
  const item = data as Item;

  const today = todayKolkata();
  const status = getStatus(today, item.expiry_date);
  const img = externalImageUrl(item.image_url);

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
          <p className="text-xs text-muted">{relativeLabel(today, item.expiry_date)}</p>
        </div>
        <Badge className={cn(STATUS_META[status].tone)}>{STATUS_META[status].label}</Badge>
      </div>

      <div className="glass p-5">
        <ItemForm mode="edit" initial={item} />
      </div>

      <div className="flex justify-end">
        <DeleteItemButton id={item.id} imageUrl={item.image_url} />
      </div>
    </div>
  );
}
