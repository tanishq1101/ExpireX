import "server-only";
import type { ProductLookup } from "@/lib/validators";
import type { Category } from "@/types/database";

// Open Food Facts and its sibling databases are free, key-less and community-run.
// Querying all three widens coverage: food, cosmetics, and general products.
// A descriptive User-Agent is required by their API etiquette.
const SOURCES: { host: string; category: Category }[] = [
  { host: "world.openfoodfacts.org", category: "food" },
  { host: "world.openbeautyfacts.org", category: "cosmetics" },
  { host: "world.openproductsfacts.org", category: "other" },
];

const UA = "ExpireX/1.0 (expiry tracker; +https://expire-x-three.vercel.app)";

type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  categories_tags?: string[];
  image_front_url?: string;
  image_url?: string;
};

/** Refine the source's default category using OFF category tags where we can. */
function refineCategory(fallback: Category, tags: string[] = []): Category {
  const t = tags.join(" ");
  if (/beauty|cosmetic|makeup|skin|hair|fragrance/.test(t)) return "cosmetics";
  if (/medicine|pharmacy|supplement|drug/.test(t)) return "medicine";
  return fallback;
}

async function fetchFrom(host: string, barcode: string): Promise<OffProduct | null> {
  const url = `https://${host}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,brands,categories_tags,image_front_url,image_url`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      // OFF can be slow; don't hang the request forever.
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { status?: number; product?: OffProduct };
    if (json.status === 1 && json.product) return json.product;
    return null;
  } catch {
    return null;
  }
}

/** Resolve a barcode to product identity. Dates are NEVER sourced here. */
export async function lookupBarcode(barcode: string): Promise<ProductLookup> {
  const clean = barcode.replace(/\s+/g, "");
  for (const { host, category } of SOURCES) {
    const p = await fetchFrom(host, clean);
    if (!p) continue;
    const name = (p.product_name_en || p.product_name || "").trim();
    if (!name) continue;
    return {
      found: true,
      barcode: clean,
      name,
      brand: (p.brands || "").split(",")[0]?.trim() || null,
      category: refineCategory(category, p.categories_tags),
      image_url: p.image_front_url || p.image_url || null,
    };
  }
  return { found: false, barcode: clean, name: null, brand: null, category: null, image_url: null };
}
