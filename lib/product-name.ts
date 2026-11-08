/**
 * Product databases (especially general retail ones) return listing titles such as
 * "NiveaIndia Nivea All in 1 Facewash 10X Whitening Effect With Cooling Menthol 50 Gram Tube (B00LC2V3F6)".
 * These helpers turn that into a name a person would write, and pull the pack size out into
 * quantity/unit fields where it belongs.
 */

const UNIT_ALIASES: Record<string, string> = {
  g: "g", gm: "g", gms: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg",
  mg: "mg",
  ml: "ml", millilitre: "ml", milliliter: "ml", millilitres: "ml", milliliters: "ml",
  l: "L", ltr: "L", ltrs: "L", litre: "L", liter: "L", litres: "L", liters: "L",
  pcs: "pcs", pc: "pcs", pieces: "pcs", piece: "pcs", nos: "pcs",
  tablets: "tablets", tablet: "tablets", tabs: "tablets",
  capsules: "capsules", capsule: "capsules", caps: "capsules",
};
const UNIT_RE = Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length).join("|");
const SIZE_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE})\\b\\.?`, "i");
// "50 Gram Tube", "500 g pack", "1 L bottle", "(Pack of 2)", "Pack of 3", "- 200ml"
const PACKAGING = "tube|pack|packet|pouch|bottle|jar|box|can|tin|carton|sachet|refill|strip";
const SIZE_PHRASE_RE = new RegExp(`[-–,]?\\s*\\(?\\s*(?:\\d+\\s*[x×]\\s*)?\\d+(?:[.,]\\d+)?\\s*(?:${UNIT_RE})\\b\\.?(?:\\s*(?:${PACKAGING}))?\\s*\\)?`, "gi");
const PACK_OF_RE = /[-–,]?\s*\(?\s*(?:pack|set|combo)\s+of\s+\d+\s*\)?/gi;
// Marketplace/store identifiers: Amazon ASINs, SKUs and long codes in brackets.
const CODE_RE = /\s*[([](?:B0[A-Z0-9]{8}|[A-Z0-9-]{6,})[)\]]/g;

export function parseSize(text?: string | null): { quantity: number; unit: string } | null {
  const m = text ? SIZE_RE.exec(text) : null;
  if (!m) return null;
  const quantity = Number(m[1].replace(",", "."));
  const unit = UNIT_ALIASES[m[2].toLowerCase()];
  return Number.isFinite(quantity) && quantity > 0 && unit ? { quantity, unit } : null;
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function titleCaseIfShouting(text: string): string {
  const alpha = text.replace(/[^A-Za-z]/g, "");
  if (alpha.length < 4 || alpha !== alpha.toUpperCase()) return text;
  return text.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** Remove codes, pack sizes and filler from a product title. */
export function cleanProductName(raw?: string | null): string {
  if (!raw) return "";
  let name = raw.replace(CODE_RE, " ").replace(PACK_OF_RE, " ").replace(SIZE_PHRASE_RE, " ");
  name = name.replace(/\s*[|/]\s*$/, "").replace(/\s{2,}/g, " ").replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "");
  name = titleCaseIfShouting(name);
  // Listing titles run on with marketing copy; keep it readable in a list row.
  if (name.length > 70) {
    const cut = name.slice(0, 70);
    name = cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[\s,;:–-]+$/, "");
  }
  return name || raw.trim();
}

/** Combine brand and name without repeating the brand ("NiveaIndia" + "Nivea Facewash" → "Nivea Facewash"). */
export function composeProductName(name?: string | null, brand?: string | null): string {
  const clean = cleanProductName(name);
  const b = brand?.trim();
  if (!b || !clean) return clean || b || "";
  const nameLetters = letters(clean);
  const brandLetters = letters(b);
  const firstWord = letters(clean.split(/\s+/)[0] ?? "");
  if (
    nameLetters.includes(brandLetters) ||
    (firstWord.length >= 3 && (brandLetters.startsWith(firstWord) || firstWord.startsWith(brandLetters)))
  ) return clean;
  return `${b} ${clean}`;
}

const PERSONAL_CARE_RE = /\b(face ?wash|facewash|shampoo|conditioner|soap|body ?wash|lotion|moisturi[sz]er|sunscreen|deodorant|toothpaste|lip ?balm|serum|cleanser|hair ?oil|cream)\b/i;
const MEDICINE_RE = /\b(tablets?|capsules?|syrup|mg|ointment|drops|paracetamol|antibiotic|vitamin)\b/i;

/** Personal-care products that a retail database filed as "medicine" (via "Health & Beauty"). */
export function correctCategory<C extends string>(name: string, category: C | null): C | "cosmetics" | null {
  if (category === "medicine" && PERSONAL_CARE_RE.test(name) && !MEDICINE_RE.test(name)) return "cosmetics";
  return category;
}
