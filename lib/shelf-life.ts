import type { Category } from "@/types/database";
import { addDays } from "./dates";
import type { ShelfLife } from "./validators";

// Coarse, conservative shelf-life defaults (in days) used only when the AI estimate is
// unavailable. Deliberately middle-of-the-road; the user always confirms before saving.
const DEFAULT_DAYS: Record<Category, number | null> = {
  food: 14, // generic packaged food; fresh items will be overridden by AI/OCR
  medicine: 365,
  cosmetics: 365,
  documents: null, // no meaningful shelf life
  warranty: 365,
  subscription: 30,
  other: 180,
};

// Keyword nudges so common perishables get a saner default than the category mean.
const KEYWORD_DAYS: { re: RegExp; days: number }[] = [
  { re: /\b(milk|cream|yogurt|curd|paneer)\b/i, days: 7 },
  { re: /\b(bread|bun|pav)\b/i, days: 5 },
  { re: /\b(egg|eggs)\b/i, days: 21 },
  { re: /\b(meat|chicken|fish|mutton|prawn)\b/i, days: 3 },
  { re: /\b(fruit|vegetable|salad|spinach|banana|apple)\b/i, days: 7 },
  { re: /\b(juice|smoothie)\b/i, days: 10 },
  { re: /\b(canned|tinned|pickle|jam|honey|sauce)\b/i, days: 540 },
  { re: /\b(chips|biscuit|cookie|namkeen|chocolate|snack)\b/i, days: 120 },
  { re: /\b(rice|flour|atta|pasta|lentil|dal|sugar|salt)\b/i, days: 365 },
];

/** Offline shelf-life estimate. Returns null expiry for categories without a shelf life. */
export function estimateShelfLifeLocal(
  productName: string,
  category: Category,
  baseDate: string
): ShelfLife {
  const kw = KEYWORD_DAYS.find((k) => k.re.test(productName));
  const days = kw?.days ?? DEFAULT_DAYS[category];
  if (days == null) {
    return { expiry_date: null, confidence: null, basis: null };
  }
  return {
    expiry_date: addDays(baseDate, days),
    confidence: kw ? "medium" : "low",
    basis: `Typical shelf life for ${kw ? "this product" : category} is about ${days} days.`,
  };
}
