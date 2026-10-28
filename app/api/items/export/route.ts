import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@/services/supabase/server";
import { todayKolkata } from "@/lib/dates";
import { inventoryQuery } from "@/lib/inventory";
import { inventoryCsv } from "@/lib/csv";
import { rateLimit } from "@/lib/rate-limit";
import type { Item } from "@/types/database";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await rateLimit(`export:${userId}`, 5, 60_000)) return NextResponse.json({ error: "Please wait a minute before exporting again." }, { status: 429 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const supabase = await createClient();
  const today = todayKolkata();
  const items: Item[] = [];
  // Fetch in batches rather than silently truncating at Supabase's default row limit.
  for (let offset = 0; ; offset += 500) {
    const { data, count, error } = await inventoryQuery(supabase, params, today).range(offset, offset + 499);
    if (error) return NextResponse.json({ error: "Couldn’t export items. Try again." }, { status: 500 });
    if ((count ?? 0) > 5000) return NextResponse.json({ error: "Export supports up to 5,000 items. Narrow your filters and try again." }, { status: 413 });
    items.push(...(data ?? []) as Item[]);
    if (!data?.length || items.length >= (count ?? 0)) break;
  }
  return new Response(inventoryCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expirex-items-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
