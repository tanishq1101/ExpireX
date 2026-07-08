import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { lookupBarcode, isConsumable } from "@/services/openfoodfacts";
import { createAdminClient } from "@/services/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import type { Category } from "@/types/database";

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
  if (!rateLimit(`lookup:${userId}`, 30, 60_000))
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
  if (!barcode || !/^\d{6,14}$/.test(barcode)) {
    return NextResponse.json({ error: "Provide a valid numeric barcode" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    // ── 1. Catalog hit ───────────────────────────────────────────────────────
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
        // Gate cached hits too — a non-consumable must still be rejected.
        supported: isConsumable((cached.category as Category | null) ?? null),
        fromCatalog: true,
      });
    }

    // ── 2. External APIs ──────────────────────────────────────────────────────
    const product = await lookupBarcode(barcode);

    // ── 3. Cache on hit (fire-and-forget — don't block the response) ──────────
    //     Skip non-consumables so they never get served as a catalog hit later.
    if (product.found && product.name && product.supported !== false) {
      void admin
        .from("barcode_catalog")
        .upsert(
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
        )
        .then(() => {});
    }

    return NextResponse.json(product);
  } catch {
    // Never leak a non-JSON 500 to the client — return a clean "not found" shape.
    return NextResponse.json({
      found: false,
      barcode,
      name: null,
      brand: null,
      size: null,
      category: null,
      image_url: null,
    });
  }
}
