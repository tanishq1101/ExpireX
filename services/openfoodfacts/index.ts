import "server-only";
import type { ProductLookup } from "@/lib/validators";
import type { Category } from "@/types/database";

// Open Food Facts and its sibling databases are free, key-less and community-run.
// Querying all three widens coverage: food, cosmetics, and general products.
// A descriptive User-Agent is required by their API etiquette.
const SOURCES: { host: string; category: Category }[] = [
  { host: "world.openfoodfacts.org", category: "food" },
  { host: "world.openbeautyfacts.org", category: "cosmetics" },
  { host: "world.openpetfoodfacts.org", category: "food" },
  { host: "world.openproductsfacts.org", category: "other" },
];

const UA = "ExpireX/1.0 (expiry tracker; +https://expire-x-three.vercel.app)";

type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
  image_front_url?: string;
  image_url?: string;
};

/** Only consumables have a shelf life; everything else is rejected at scan time. */
export function isConsumable(c: Category | null): boolean {
  return c === "food" || c === "cosmetics" || c === "medicine";
}

/** Refine the source's default category using OFF category tags where we can. */
function refineCategory(fallback: Category, tags: string[] = []): Category {
  const t = tags.join(" ");
  if (/beauty|cosmetic|makeup|skin|hair|fragrance/.test(t)) return "cosmetics";
  if (/medicine|pharmacy|supplement|drug/.test(t)) return "medicine";
  return fallback;
}

function toResult(barcode: string, category: Category, p: OffProduct): ProductLookup | null {
  const name = (p.product_name_en || p.product_name || "").trim();
  if (!name) return null;
  const resolved = refineCategory(category, p.categories_tags);
  return {
    found: true,
    barcode,
    name,
    brand: (p.brands || "").split(",")[0]?.trim() || null,
    size: (p.quantity || "").trim() || null,
    category: resolved,
    image_url: p.image_front_url || p.image_url || null,
    // English category tags ("en:uht-milks") help the shelf-life table recognise the product.
    tags: (p.categories_tags ?? []).filter((t) => t.startsWith("en:")).slice(-12),
    // The general products DB ("other") isn't a consumable unless tags say otherwise.
    supported: isConsumable(resolved),
  };
}

async function fetchFrom(host: string, barcode: string): Promise<OffProduct | null> {
  const url = `https://${host}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,brands,quantity,categories_tags,image_front_url,image_url`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      // Tighter timeout so one slow DB can't stall the scan.
      signal: AbortSignal.timeout(3800),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { status?: number; product?: OffProduct };
    if (json.status === 1 && json.product) return json.product;
    return null;
  } catch {
    return null;
  }
}

/** Map UPCitemdb's freeform category string to our enum. */
function mapUpcCategory(cat: string): Category {
  const t = cat.toLowerCase();
  if (/health|medicine|pharmacy|drug|supplement/.test(t)) return "medicine";
  if (/beauty|cosmetic|makeup|fragrance|personal care|skin|hair/.test(t)) return "cosmetics";
  if (/food|beverage|grocery|snack|drink|gourmet/.test(t)) return "food";
  return "other";
}

// Categories that have no expiry/shelf life — reject these at scan time.
const UNSUPPORTED_RE =
  /(electronic|computer|laptop|phone|mobile|camera|headphone|earbud|charger|cable|tv|television|appliance|book|media|clothing|apparel|shoe|footwear|furniture|toy|\bgame|stationery|office|hardware|\btool|automotive|vehicle|jewel|watch|sport|luggage|garden|decor)/i;

// UPCitemdb trial endpoint: free, key-less, broad general-retail coverage (rate-limited).
// Used as an extra fallback so far more barcodes resolve than Open Food Facts alone.
async function fetchUpcItemDb(barcode: string): Promise<ProductLookup | null> {
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3800),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: { title?: string; brand?: string; category?: string; images?: string[] }[];
    };
    const it = json.items?.[0];
    const name = (it?.title || "").trim();
    if (!name) return null;
    const catStr = it?.category || "";
    const category = mapUpcCategory(catStr);
    return {
      found: true,
      barcode,
      name,
      brand: it?.brand?.trim() || null,
      size: null,
      category,
      image_url: it?.images?.[0] || null,
      tags: catStr ? catStr.split(/\s*>\s*/).slice(-3) : [],
      // Only food/cosmetics/medicine are trackable; electronics/clothes/"other" → rejected.
      supported: isConsumable(category) && !UNSUPPORTED_RE.test(catStr),
    };
  } catch {
    return null;
  }
}

const NOT_FOUND = (barcode: string): ProductLookup => ({
  found: false, barcode, name: null, brand: null, size: null, category: null, image_url: null,
});

// Unknown barcodes are re-checked at most every few hours per server instance, so a repeat scan
// of an unlisted product answers at once instead of waiting on every database again.
const MISS_TTL_MS = 6 * 60 * 60 * 1000;
const misses = new Map<string, number>();
function rememberMiss(barcode: string) {
  if (misses.size > 2000) misses.delete(misses.keys().next().value as string);
  misses.set(barcode, Date.now());
}

/**
 * Resolve a barcode to product identity. Dates/price are NEVER sourced here.
 * All databases are asked at once and the answer is returned as soon as it is known: a hit from
 * the richest source that has answered, without waiting for slower sources that can only tie.
 */
export async function lookupBarcode(barcode: string, { budgetMs = 4000 } = {}): Promise<ProductLookup> {
  const clean = barcode.replace(/\s+/g, "");
  const missedAt = misses.get(clean);
  if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return NOT_FOUND(clean);

  // Priority order: Open Food / Beauty / Pet / Products Facts (richest data), then UPCitemdb.
  const tasks: Promise<ProductLookup | null>[] = [
    ...SOURCES.map(async ({ host, category }) => {
      const p = await fetchFrom(host, clean);
      return p ? toResult(clean, category, p) : null;
    }),
    fetchUpcItemDb(clean),
  ];

  return new Promise<ProductLookup>((resolve) => {
    const results: (ProductLookup | null | undefined)[] = tasks.map(() => undefined);
    let settled = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: ProductLookup | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(budget);
      clearTimeout(grace);
      if (!value) rememberMiss(clean);
      resolve(value ?? NOT_FOUND(clean));
    };
    const best = () => results.find((r): r is ProductLookup => !!r) ?? null;
    const check = () => {
      for (const r of results) {
        if (r === undefined) {
          // A lower-priority hit waits briefly for a richer source, never for a slow one.
          if (best() && !grace) grace = setTimeout(() => finish(best()), 700);
          return;
        }
        if (r) return finish(r);
      }
      finish(null);
    };
    const budget = setTimeout(() => finish(best()), budgetMs);
    tasks.forEach((task, i) =>
      task.then(
        (r) => { results[i] = r; check(); },
        () => { results[i] = null; check(); }
      )
    );
  });
}
