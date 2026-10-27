import type { Category } from "@/types/database";
import { addDays } from "./dates";
import type { ShelfLife } from "./validators";

// Coarse, conservative shelf-life defaults (in days) used only when the AI estimate is
// unavailable. Deliberately middle-of-the-road; the user always confirms before saving.
const DEFAULT_DAYS: Record<Category, number | null> = {
  food: 30, // generic packaged food; fresh items overridden by keywords/AI/OCR
  medicine: null, // The printed expiry is required; never infer medicine expiry.
  cosmetics: 730, // ~2 years unopened
  documents: null, // no meaningful shelf life
  warranty: 365,
  subscription: 30,
  other: 180,
};

// Keyword nudges so common products across food / medicine / cosmetics get a saner default.
const KEYWORD_DAYS: { re: RegExp; days: number }[] = [
  // --- fresh / perishable food ---
  { re: /\b(milk|cream|yogurt|yoghurt|curd|paneer|buttermilk|lassi)\b/i, days: 7 },
  { re: /\b(bread|bun|pav|cake|pastry|croissant)\b/i, days: 5 },
  { re: /\b(egg|eggs)\b/i, days: 21 },
  { re: /\b(meat|chicken|mutton|fish|prawn|seafood|sausage)\b/i, days: 3 },
  { re: /\b(fruit|vegetable|veggie|salad|spinach|banana|apple|tomato|onion|potato|berry|berries)\b/i, days: 7 },
  { re: /\b(juice|smoothie|shake)\b/i, days: 10 },
  { re: /\b(cheese)\b/i, days: 30 },
  { re: /\b(butter|ghee|margarine)\b/i, days: 120 },
  { re: /\b(tofu|sprouts)\b/i, days: 5 },
  { re: /\b(cooked|leftover|fresh)\b/i, days: 3 },
  // --- packaged / dry food ---
  { re: /\b(canned|tinned|pickle|achar|jam|honey|sauce|ketchup|mayonnaise|spread)\b/i, days: 540 },
  { re: /\b(chips|biscuit|cookie|namkeen|chocolate|candy|snack|wafer|chips)\b/i, days: 150 },
  { re: /\b(rice|flour|atta|maida|pasta|noodle|lentil|dal|pulse|sugar|salt|spice|masala)\b/i, days: 365 },
  { re: /\b(oil|vinegar)\b/i, days: 365 },
  { re: /\b(tea|coffee|cereal|oats|muesli)\b/i, days: 300 },
  { re: /\b(nuts|almond|cashew|dry\s?fruit|raisin)\b/i, days: 180 },
  { re: /\b(water|soda|cola|soft\s?drink|beer)\b/i, days: 270 },
  // --- medicines ---
  {
    re: /\b(tablet|tablets|capsule|capsules|syrup|tonic|ointment|drops|inhaler|antibiotic|paracetamol|ibuprofen|antacid|medicine|supplement|vitamin|sachet|injection)\b/i,
    days: 730,
  },
  // --- cosmetics / personal care ---
  {
    re: /\b(cream|lotion|moisturiser|moisturizer|serum|shampoo|conditioner|soap|face\s?wash|cleanser|toner|sunscreen|spf|lipstick|lip\s?balm|foundation|concealer|mascara|kajal|eyeliner|compact|blush|perfume|deodorant|deo|nail\s?polish|makeup|make-?up\s?kit|powder)\b/i,
    days: 730,
  },
];

/** Offline shelf-life estimate. Returns null expiry for categories without a shelf life. */
export function estimateShelfLifeLocal(
  productName: string,
  category: Category,
  baseDate: string
): ShelfLife {
  if (category === "medicine" || category === "documents") {
    return { expiry_date: null, confidence: null, basis: null };
  }
  const kw = KEYWORD_DAYS.find((k) => k.re.test(productName));
  const days = kw?.days ?? DEFAULT_DAYS[category];
  if (days == null) {
    return { expiry_date: null, confidence: null, basis: null };
  }
  return {
    expiry_date: addDays(baseDate, days),
    confidence: kw ? "medium" : "low",
    basis: `Typical shelf life for ${kw ? "this product" : category} is about ${
      days >= 60 ? `${Math.round(days / 30)} months` : `${days} days`
    }.`,
  };
}
