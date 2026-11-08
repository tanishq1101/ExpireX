import { NextResponse, after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { lookupBarcode, isConsumable } from "@/services/openfoodfacts";
import { createAdminClient } from "@/services/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { estimateShelfLifeLocal } from "@/lib/shelf-life";
import { todayKolkata } from "@/lib/dates";
import { cleanProductName, composeProductName, correctCategory } from "@/lib/product-name";
import type { ProductLookup } from "@/lib/validators";
import type { Category } from "@/types/database";

export const runtime = "nodejs";

type CatalogRow = {
  name: string;
  brand: string | null;
  size: string | null;
  category: string | null;
  image_url: string | null;
};

/**
 * A confident shelf-life match is computed here and returned with the product, so the scanner
 * can show "usually good until …" straight away instead of making a second request.
 */
function withEstimate(product: ProductLookup) {
  if (!product.found || !product.name || product.supported === false) return product;
  const category = (product.category ?? "food") as Category;
  if (category === "medicine") return product;
  const name = composeProductName(product.name, product.brand);
  const est = estimateShelfLifeLocal(name, category, todayKolkata(), { hints: product.tags ?? [] });
  if (!est.expiry_date || est.confidence !== "high") return product;
  return {
    ...product,
    estimate: { expiry_date: est.expiry_date, confidence: est.confidence, basis: est.basis, tips: est.tips ?? null },
  };
}

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

  try {
    const admin = createAdminClient();

    // The quota check and the catalog read are independent: one round trip instead of two.
    const [allowed, { data: cached }] = await Promise.all([
      rateLimit(`lookup:${userId}`, 30, 60_000),
      admin
        .from("barcode_catalog")
        .select("name, brand, size, category, image_url")
        .eq("barcode", barcode)
        .eq("source", "api")
        .maybeSingle<CatalogRow>(),
    ]);
    if (!allowed) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

    // ── 1. Catalog hit ───────────────────────────────────────────────────────
    if (cached) {
      return NextResponse.json(withEstimate({
        found: true,
        barcode,
        // Older catalog rows were stored with raw listing titles.
        name: cleanProductName(cached.name),
        brand: cached.brand ?? null,
        size: cached.size ?? null,
        category: correctCategory(cached.name, (cached.category as Category | null) ?? null),
        image_url: cached.image_url ?? null,
        // Gate cached hits too — a non-consumable must still be rejected.
        supported: isConsumable(correctCategory(cached.name, (cached.category as Category | null) ?? null)),
      }));
    }

    // ── 2. External APIs ──────────────────────────────────────────────────────
    const product = await lookupBarcode(barcode);

    // ── 3. Cache on hit after the response is sent (serverless keeps `after` work alive) ──
    //     Skip non-consumables so they never get served as a catalog hit later.
    if (product.found && product.name && product.supported !== false) {
      after(async () => { await admin
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
          { onConflict: "barcode", ignoreDuplicates: true }
        )
        .then(() => {}); });
    }

    return NextResponse.json(withEstimate(product));
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
