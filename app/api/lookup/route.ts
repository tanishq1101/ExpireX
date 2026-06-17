import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { lookupBarcode } from "@/services/openfoodfacts";
import { createAdminClient } from "@/services/supabase/admin";

export const runtime = "nodejs";

type CatalogRow = {
  name: string;
  brand: string | null;
  size: string | null;
  category: string | null;
  image_url: string | null;
};

// GET /api/lookup?barcode=8901234567890
// 1. Check local barcode_catalog (instant, no external call).
// 2. On miss: query Open Food Facts / Open Beauty Facts / UPCitemdb in parallel.
// 3. Cache the result so the next scan for the same barcode is served locally.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
  if (!barcode || !/^\d{6,14}$/.test(barcode)) {
    return NextResponse.json({ error: "Provide a valid numeric barcode" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── 1. Catalog hit ─────────────────────────────────────────────────────────
  const { data: cached } = await admin
    .from("barcode_catalog")
    .select("name, brand, size, category, image_url")
    .eq("barcode", barcode)
    .maybeSingle<CatalogRow>();

  if (cached) {
    return NextResponse.json({
      found: true,
      barcode,
      name: cached.name,
      brand: cached.brand ?? null,
      size: cached.size ?? null,
      category: cached.category ?? null,
      image_url: cached.image_url ?? null,
      fromCatalog: true,
    });
  }

  // ── 2. External APIs ────────────────────────────────────────────────────────
  const product = await lookupBarcode(barcode);

  // ── 3. Cache on hit (fire-and-forget — don't block the response) ────────────
  if (product.found && product.name) {
    void (async () => {
      await admin.from("barcode_catalog").upsert(
        {
          barcode,
          name: product.name,
          brand: product.brand ?? null,
          size: product.size ?? null,
          category: product.category ?? null,
          image_url: product.image_url ?? null,
          source: "api",
          confirmed_count: 0,
        },
        { onConflict: "barcode" }
      );
    })();
  }

  return NextResponse.json(product);
}
