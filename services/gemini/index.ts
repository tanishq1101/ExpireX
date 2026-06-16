import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  extractionSchema,
  shelfLifeSchema,
  receiptSchema,
  type Extraction,
  type ShelfLife,
  type ReceiptItem,
} from "@/lib/validators";
import { CATEGORIES } from "@/lib/status";

const MODEL = "gemini-2.5-flash"; // multimodal; reads the label image and extracts in one call

const RULES = `Return ONLY JSON with exactly these keys:
- "product_name": string | null   (concise product name, no marketing fluff)
- "brand": string | null          (maker/brand if printed)
- "expiry_date": string | null    (ISO "YYYY-MM-DD"; the EXPIRY/USE-BY/BEST-BEFORE date, NOT manufacture)
- "manufacture_date": string | null (ISO "YYYY-MM-DD"; MFG/MFD/PKD/"packed on" if present)
- "category": one of [${CATEGORIES.join(", ")}] | null
- "quantity": number | null       (net amount as a number, e.g. 500 for "500 g", 1 for "1 L")
- "unit": string | null           (the unit only, e.g. "g", "ml", "L", "kg", "tablets", "pcs")

Rules:
- Read EVERYTHING printed. Works for food, medicines, cosmetics/makeup/creams/powders, and packaged goods.
- Dates on Indian packaging are usually DD/MM/YYYY. If only MM/YYYY, use the LAST day of that month.
- Prefer "best before"/"exp"/"use by"/"use before" for expiry; "mfg"/"mfd"/"pkd"/"packed on" for manufacture.
- Medicines: read the "EXP" date; set category to "medicine".
- Cosmetics/makeup/skincare: set category to "cosmetics". If only a Period-After-Opening symbol ("12M", "24M") is shown and there is no printed expiry, leave expiry_date null.
- If a value is unreadable or absent, use null. Never invent a value.`;

function model() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });
}

function parse(raw: string): Extraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { product_name: null, expiry_date: null, category: null };
  }
  // Never trust model output — invalid shape degrades to nulls so the user just fills the form.
  const safe = extractionSchema.safeParse(parsed);
  return safe.success ? safe.data : { product_name: null, expiry_date: null, category: null };
}

/** Primary path: send the label photo straight to Gemini (OCR + extraction in one call). */
export async function geminiExtractFromImage(
  imageBase64: string,
  mimeType: string,
  today: string
): Promise<Extraction> {
  const prompt = `You read a photo of a product label and extract structured data.
Today's date is ${today} (Asia/Kolkata).
${RULES}`;
  const result = await model().generateContent([
    { text: prompt },
    { inlineData: { data: imageBase64, mimeType } },
  ]);
  return parse(result.response.text());
}

function parseShelfLife(raw: string): ShelfLife {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { expiry_date: null, confidence: null, basis: null };
  }
  const safe = shelfLifeSchema.safeParse(parsed);
  return safe.success ? safe.data : { expiry_date: null, confidence: null, basis: null };
}

/**
 * Estimate a likely expiry date from product identity when no printed date is read.
 * `baseDate` is the manufacture/purchase date (or today) the shelf life is measured from.
 */
export async function geminiEstimateShelfLife(
  productName: string,
  category: string,
  baseDate: string
): Promise<ShelfLife> {
  const prompt = `You are a food-safety and product shelf-life expert.
Estimate a realistic EXPIRY date for the product below, measured from the base date.

Product: "${productName}"
Category: ${category}
Base date (manufacture or purchase): ${baseDate} (Asia/Kolkata)

Return ONLY JSON with exactly these keys:
- "expiry_date": string | null  (ISO "YYYY-MM-DD"; base date + a typical unopened shelf life)
- "confidence": "high" | "medium" | "low" | null
- "basis": string | null  (ONE short sentence, e.g. "Sealed UHT milk keeps ~6 months")
- "tips": string[] | null  (1-2 short, practical storage/usage tips, each under 12 words)

Rules:
- Base the estimate on typical UNOPENED shelf life for this kind of product.
- Fresh perishables (dairy, produce, bakery, cooked/fresh food) = days to ~2 weeks.
- Packaged/canned/dry food = months to a couple of years.
- Medicines (tablets, capsules, syrups, ointments) = typically 1–3 years from manufacture.
- Cosmetics/makeup/creams/powders/skincare = typically 2–3 years unopened; add a tip about the Period-After-Opening (e.g. "Use within 12 months of opening").
- For documents/warranty/subscription where a shelf life is meaningless, return null expiry/confidence.
- Tips should be genuinely useful (e.g. "Refrigerate after opening", "Best consumed within 48h").
- Never return a date before the base date. Be realistic, not optimistic.`;
  const result = await model().generateContent(prompt);
  return parseShelfLife(result.response.text());
}

/** Read a receipt photo and return many line items, each with an estimated expiry. */
export async function geminiExtractReceipt(
  imageBase64: string,
  mimeType: string,
  today: string
): Promise<ReceiptItem[]> {
  const prompt = `You read a photo of a shopping receipt and list the purchasable products on it.
Today's date is ${today} (Asia/Kolkata). Use the receipt/purchase date if visible, else today, as the base date.

Return ONLY JSON: { "items": [ { "name", "category", "expiry_date", "quantity" }, ... ] }
For each item:
- "name": string  (clean product name; drop prices, codes, taxes, totals, store name)
- "category": one of [${CATEGORIES.join(", ")}] | null
- "expiry_date": string | null  (ISO "YYYY-MM-DD"; ESTIMATE base date + typical unopened shelf life)
- "quantity": number | null

Rules:
- Skip non-product lines (subtotal, GST, change, card, store info).
- Perishables get short shelf lives (days); packaged/canned get months.
- If you can't estimate an expiry, use null. Never invent product names.`;
  const result = await model().generateContent([
    { text: prompt },
    { inlineData: { data: imageBase64, mimeType } },
  ]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.response.text());
  } catch {
    return [];
  }
  const safe = receiptSchema.safeParse(parsed);
  return safe.success ? safe.data.items : [];
}

/** Fallback path: extract from OCR text (used when image extraction fails, after Tesseract). */
export async function geminiExtract(rawText: string, today: string): Promise<Extraction> {
  const prompt = `You extract structured product data from OCR text of a product label.
Today's date is ${today} (Asia/Kolkata).
${RULES}

OCR TEXT:
"""
${rawText.slice(0, 4000)}
"""`;
  const result = await model().generateContent(prompt);
  return parse(result.response.text());
}
