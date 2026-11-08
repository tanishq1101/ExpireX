import { parseReceiptExtraction, type ReceiptExtraction } from "@/lib/receipt-extraction";
import "server-only";
import { isCalendarDate } from "@/lib/calendar-date";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  extractionSchema,
  shelfLifeSchema,
  emptyExtraction,
  emptyShelfLife,
  type Extraction,
  type ShelfLife,
} from "@/lib/validators";
import { CATEGORIES } from "@/lib/status";
import { parseOcrText } from "@/lib/ocr-parser";

const MODEL = "gemini-2.5-flash"; // multimodal; reads the label image and extracts in one call
const IMAGE_TIMEOUT_MS = 18_000; // route allows 60s; leaves room for the offline fallback after a timeout
const TEXT_TIMEOUT_MS = 12_000;

const RULES = `Return ONLY JSON with exactly these keys:
- "product_name": string | null   (concise product name, no marketing fluff)
- "brand": string | null          (maker/brand if printed)
- "expiry_date": string | null    (ISO "YYYY-MM-DD"; the EXPIRY/USE-BY/BEST-BEFORE date, NOT manufacture)
- "manufacture_date": string | null (ISO "YYYY-MM-DD"; MFG/MFD/PKD/"packed on" if present)
- "expiry_text": string | null     (the expiry date EXACTLY as printed, character for character, e.g. "15/06/27" or "JUN 2027" — copy it, do not reformat. If the expiry is only given relative to manufacture, copy that sentence, e.g. "Best before 9 months from packaging")
- "manufacture_text": string | null (the manufacture date EXACTLY as printed)
- "category": one of [${CATEGORIES.join(", ")}] | null
- "quantity": number | null       (net amount as a number, e.g. 500 for "500 g", 1 for "1 L")
- "unit": string | null           (the unit only, e.g. "g", "ml", "L", "kg", "tablets", "pcs")
- "item_type": "food" | "cosmetics" | "medicine" | "unsupported"  (what KIND of object this is)
- "detected": string | null       (1-3 word label of the object, e.g. "Laptop", "Shampoo bottle", "Apple" — never a date)
- "estimated": boolean | null      (true if you ESTIMATED expiry_date rather than reading a printed one; false if printed; null only if no expiry)
- "freshness": "fresh" | "use_soon" | "spoiled" | null  (ONLY for fresh UNPACKAGED perishables, judged by eye)
- "freshness_note": string | null  (short visual note, e.g. "bright red & firm", "yellowing leaves", "shells intact")

Eligibility (item_type) — only things that are CONSUMED and have a shelf life are trackable:
- food = edible/drinkable CONSUMABLES: fresh fruit & vegetables, raw meat/chicken/fish, eggs, packaged/canned/frozen food, snacks, beverages, milk, juice, baby formula & baby food.
- cosmetics = skincare/makeup/personal-care CONSUMABLES (cream, shampoo, soap, sunscreen, lipstick, toothpaste…).
- medicine = tablets, capsules, syrups, ointments, supplements, healthcare consumables.
- unsupported = ANYTHING that is NOT consumed / has NO expiry. This includes ALL durable goods: electronics & gadgets (mobile phone, laptop, keyboard, mouse, charger, headphones, TV), clothes & footwear (pants, shirts, shoes), bags & accessories, stationery (pens, notebooks), home/kitchen goods (bed sheets, towels, utensils, cups, plates), toys, books, furniture, vehicles, AND empty/reusable CONTAINERS (an empty bottle, a water bottle, a feeding/baby bottle with no formula in it, a flask, an empty box).

CRITICAL — judge by the CONTENT, not the container or packaging:
- A SEALED drink / juice / milk / baby formula = "food".  An EMPTY or reusable bottle/cup/flask/container/utensil = "unsupported".
- If the object is clearly a gadget, garment, footwear, bag, accessory, piece of stationery, household item, or empty container — even if it has a brand name or barcode — set item_type = "unsupported".
- When genuinely unsure whether the thing is eaten/drunk/applied/taken, prefer "unsupported". For unsupported items, set expiry_date, freshness and most fields to null.

Rules:
- Read EVERYTHING printed. Works for food, medicines, cosmetics/makeup/creams/powders, and packaged goods.
- The photo may be rotated, upside-down, tilted, curved around a bottle, glary, or blurry. Mentally rotate it and read text in any orientation. Check every face of the pack that is visible, including side panels, flaps, crimps, caps and the base.
- Faint dot-matrix / ink-jet stamps (often a few mm tall, grey or black on foil, plastic or glass) are the most common place for the real expiry date. Look for them specifically before concluding no date exists.
- Transcribe digits carefully: tell 0 from O and 8, 1 from 7 and I, 5 from S, 6 from G, 2 from Z. If two readings are plausible for a digit, choose the one that makes a valid date.
- Dates on Indian packaging are usually DD/MM/YYYY. If only MM/YYYY or MM/YY (e.g. "06/27", "JUN 2027"), use the LAST day of that month.
- Prefer "best before"/"exp"/"use by"/"use before" for expiry; "mfg"/"mfd"/"pkd"/"packed on" for manufacture.
- If the label states a shelf life relative to manufacture (e.g. "Best before 6 months from the date of manufacture", "Use within 24 months of MFG") AND a manufacture/packing date is printed, set expiry_date = that manufacture date + that period and estimated = false. If no manufacture date is printed, leave expiry_date null.
- Dates contain digits only: read "O" as 0 and "I"/"l" as 1 inside a date. Ink-jet dates are often small, on the base, cap or crimp — look for them.
- Ignore batch/lot numbers, MRP and prices, and barcode digits: they are never dates.
- PKD/PKG/"packed on"/MFD/DOM/"date of manufacture" dates are MANUFACTURE dates — never put them in expiry_date.
- "Use within N months of opening" (or a 6M/12M open-jar symbol) is NOT an expiry date.
- If two dates are printed under one combined heading such as "MFD/EXP" or "PKD & USE BY", the EARLIER date is manufacture and the LATER date is expiry.
- US-style "MM/DD/YYYY" appears only on imported goods; if the first number is greater than 12 it is a day.
- Medicines: read the printed "EXP" date; set category to "medicine". NEVER estimate a medicine expiry. If no printed expiry is legible, return null expiry_date.
- Cosmetics/makeup/skincare: set category to "cosmetics". If only a Period-After-Opening symbol ("12M", "24M") is shown and there is no printed expiry, leave expiry_date null.
- For fresh unpackaged items without a printed date, leave expiry_date, freshness and freshness_note null. A photo cannot establish a safe expiry. Do not estimate dates during label extraction.
- For PACKAGED goods (sealed carton, bottle, can, blister, jar) with or without a printed date: set "freshness" and "freshness_note" to null. Never invent a visual freshness verdict for sealed packaging.
- If a value is unreadable or absent, use null. Never invent a value.`;

// ── Model client + retry ─────────────────────────────────────────────────────

function model() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: MODEL,
    // Reading printed text needs no deliberation; skipping "thinking" roughly halves latency, which
    // keeps slow mobile scans from timing out into the weaker offline OCR fallback.
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
      // Printed dates are tiny; spend more image tokens so they survive downscaling.
      mediaResolution: "MEDIA_RESOLUTION_HIGH",
    } as Record<string, unknown>,
  });
}

/** True for rate-limit / transient capacity errors worth retrying. */
function isRetriableGeminiError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; statusCode?: number; message?: string; code?: number | string };
  const status = e.status ?? e.statusCode ?? (typeof e.code === "number" ? e.code : undefined);
  if (status === 429 || status === 503 || status === 500) return true;
  const msg = typeof e.message === "string" ? e.message : String(err);
  return /429|Too Many|RESOURCE_EXHAUSTED|503|UNAVAILABLE|internal error|deadline/i.test(msg);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** One bounded retry for transient errors; leave time for the route fallback. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isRetriableGeminiError(err) || i === attempts - 1) throw err;
      // 600ms, 1200ms (+ small jitter) before 2nd / 3rd try
      await sleep(600 * 2 ** i + Math.floor(Math.random() * 200));
    }
  }
  throw last;
}

// ── Sanitizers (coerce freelanced model JSON into something Zod can keep) ────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function nullishStr(v: unknown, max?: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return null;
  return max ? t.slice(0, max) : t;
}

function asIsoDate(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  // Accept only ISO here; Indian DD/MM is the model's job to convert.
  return ISO_DATE.test(t) && isCalendarDate(t) ? t : null;
}

function asBool(v: unknown): boolean | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function asNonNegNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** Normalize extraction-shaped objects before Zod / field recovery. */
function sanitizeExtraction(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    product_name: nullishStr(raw.product_name, 200) ?? null,
    brand: nullishStr(raw.brand, 80) ?? null,
    expiry_date: asIsoDate(raw.expiry_date) ?? null,
    manufacture_date: asIsoDate(raw.manufacture_date) ?? null,
    expiry_text: nullishStr(raw.expiry_text, 60) ?? null,
    manufacture_text: nullishStr(raw.manufacture_text, 60) ?? null,
    category: typeof raw.category === "string" ? raw.category : null,
    quantity: asNonNegNumber(raw.quantity) ?? null,
    unit: nullishStr(raw.unit, 40) ?? null,
    estimated: asBool(raw.estimated) ?? null,
    item_type: typeof raw.item_type === "string" ? raw.item_type : null,
    detected: nullishStr(raw.detected, 60) ?? null,
    freshness: typeof raw.freshness === "string" ? raw.freshness : null,
    freshness_note: nullishStr(raw.freshness_note, 200) ?? null,
  };

  // Sealed / printed-date packages: drop visual freshness (model often freelances it).
  const printed = out.expiry_date && out.estimated !== true;
  if (printed) {
    out.freshness = null;
    out.freshness_note = null;
  }

  // "detected" must be an object label, never a date string the model misfiled.
  if (typeof out.detected === "string" && /[\d/.-]{6,}/.test(out.detected) && !/[A-Za-z]{3,}/.test(out.detected)) {
    out.detected = null;
  }

  return out;
}

function sanitizeShelfLife(raw: Record<string, unknown>): Record<string, unknown> {
  let tips: unknown = raw.tips;
  if (Array.isArray(tips)) {
    tips = tips
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 3);
  } else if (tips != null && tips !== null) {
    tips = null;
  }

  return {
    expiry_date: asIsoDate(raw.expiry_date) ?? null,
    confidence: typeof raw.confidence === "string" ? raw.confidence : null,
    basis: nullishStr(raw.basis, 160) ?? null,
    tips: tips ?? null,
  };
}

// ── Parsers (full Zod first; field-level recovery if one field is freelanced) ─

function parse(raw: string): Extraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyExtraction();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyExtraction();
  }

  const cleaned = sanitizeExtraction(parsed as Record<string, unknown>);
  const full = extractionSchema.safeParse(cleaned);
  if (full.success) return full.data;

  // Partial recovery: keep every field that validates on its own.
  const out = emptyExtraction();
  const pick = <K extends keyof Extraction>(key: K, schema: { safeParse: (v: unknown) => { success: boolean; data?: Extraction[K] } }) => {
    const r = schema.safeParse(cleaned[key]);
    if (r.success && r.data !== undefined) (out as Extraction)[key] = r.data as Extraction[K];
  };

  pick("product_name", extractionSchema.shape.product_name);
  pick("brand", extractionSchema.shape.brand);
  pick("expiry_date", extractionSchema.shape.expiry_date);
  pick("manufacture_date", extractionSchema.shape.manufacture_date);
  pick("expiry_text", extractionSchema.shape.expiry_text);
  pick("manufacture_text", extractionSchema.shape.manufacture_text);
  pick("category", extractionSchema.shape.category);
  pick("quantity", extractionSchema.shape.quantity);
  pick("unit", extractionSchema.shape.unit);
  pick("estimated", extractionSchema.shape.estimated);
  pick("item_type", extractionSchema.shape.item_type);
  pick("detected", extractionSchema.shape.detected);
  pick("freshness", extractionSchema.shape.freshness);
  pick("freshness_note", extractionSchema.shape.freshness_note);

  // product_name is required-nullable on the type; ensure it's set
  if (out.product_name === undefined) out.product_name = null;
  if (out.expiry_date === undefined) out.expiry_date = null;
  if (out.category === undefined) out.category = null;

  return out;
}

function parseShelfLife(raw: string): ShelfLife {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyShelfLife();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyShelfLife();
  }

  const cleaned = sanitizeShelfLife(parsed as Record<string, unknown>);
  const full = shelfLifeSchema.safeParse(cleaned);
  if (full.success) return full.data;

  // Keep a good date even if confidence/basis/tips freelanced.
  const out = emptyShelfLife();
  const exp = shelfLifeSchema.shape.expiry_date.safeParse(cleaned.expiry_date);
  if (exp.success) out.expiry_date = exp.data;
  const conf = shelfLifeSchema.shape.confidence.safeParse(cleaned.confidence);
  if (conf.success) out.confidence = conf.data;
  const basis = shelfLifeSchema.shape.basis.safeParse(cleaned.basis);
  if (basis.success) out.basis = basis.data;
  const tips = shelfLifeSchema.shape.tips.safeParse(cleaned.tips);
  if (tips.success && tips.data !== undefined) out.tips = tips.data;
  return out;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Primary path: send the label photo straight to Gemini (OCR + extraction in one call). */
export async function geminiExtractFromImage(
  imageBase64: string,
  mimeType: string,
  today: string
): Promise<Extraction> {
  const prompt = `You read a photo of a product label and extract structured data.
Today's date is ${today} (Asia/Kolkata).
${RULES}`;
  const result = await withRetry(() =>
    model().generateContent([
      { text: prompt },
      { inlineData: { data: imageBase64, mimeType } },
    ], { timeout: IMAGE_TIMEOUT_MS })
  );
  return parse(result.response.text());
}

/**
 * Second look for a missing date. The model only transcribes what is printed next to a keyword
 * (no date maths, no guessing); the deterministic parser then converts it. Unlabelled dates
 * are ignored on purpose: a batch or packing stamp must never become an expiry.
 */
export async function geminiFindDates(
  imageBase64: string,
  mimeType: string,
  today: string,
  timeoutMs = 12_000
): Promise<Pick<Extraction, "expiry_date" | "manufacture_date" | "expiry_text" | "manufacture_text">> {
  const prompt = `Today's date is ${today}. This is a photo of a product pack. Find every printed date or shelf-life statement on it.
Look on ALL visible faces, including side panels, crimped seams, caps, shoulders and the base, and in any orientation (rotated, upside-down, curved). Faint dot-matrix / ink-jet stamps are the usual place for an expiry date.
Copy each one EXACTLY as printed, character for character. Do not reformat or convert dates.

Return ONLY JSON: { "dates": [ { "label": string, "text": string } ], "shelf_life": string | null }
- "label": the keyword printed next to that date, copied as printed (e.g. "EXP", "BEST BEFORE", "USE BY", "MFG", "PKD", "MFD"). Use "" if no keyword is printed with it.
- "text": the date characters, e.g. "15/06/2027", "JUN 2027", "06/27".
- "shelf_life": a printed relative statement such as "Best before 6 months from date of manufacture", else null.
Ignore batch/lot numbers, prices, MRP, barcodes and phone numbers. If there is no date at all, return { "dates": [], "shelf_life": null }.`;
  const none = { expiry_date: null, manufacture_date: null, expiry_text: null, manufacture_text: null };
  const result = await model().generateContent(
    [{ text: prompt }, { inlineData: { data: imageBase64, mimeType } }],
    { timeout: timeoutMs }
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.response.text());
  } catch {
    return none;
  }
  const raw = parsed as { dates?: unknown; shelf_life?: unknown };
  const entries = (Array.isArray(raw.dates) ? raw.dates : [])
    .filter((d): d is { label: string; text: string } =>
      !!d && typeof d === "object" && typeof (d as { label?: unknown }).label === "string" && typeof (d as { text?: unknown }).text === "string")
    .filter((d) => d.label.trim() && d.text.trim())
    .slice(0, 12);
  const shelfLife = typeof raw.shelf_life === "string" ? raw.shelf_life.slice(0, 160) : "";
  const synthetic = [...entries.map((d) => `${d.label.slice(0, 30)} ${d.text.slice(0, 40)}`), shelfLife].join("\n");
  const found = parseOcrText(synthetic, today);
  // Echo back the printed text of the entry that produced each date, for later cross-checking.
  const textFor = (field: "expiry_date" | "manufacture_date") =>
    found[field] ? entries.find((d) => parseOcrText(`${d.label} ${d.text}`, today)[field] === found[field])?.text ?? null : null;
  return {
    expiry_date: found.expiry_date,
    manufacture_date: found.manufacture_date ?? null,
    expiry_text: textFor("expiry_date"),
    manufacture_text: textFor("manufacture_date"),
  };
}

/**
 * Estimate a likely expiry date from product identity when no printed date is read.
 * `baseDate` is the manufacture/purchase date (or today) the shelf life is measured from.
 */
export async function geminiEstimateShelfLife(
  productName: string,
  category: string,
  baseDate: string,
  context: { storage?: "pantry" | "fridge" | "freezer" | null; reference?: string | null } = {}
): Promise<ShelfLife> {
  const where =
    context.storage === "freezer" ? "in the freezer"
    : context.storage === "fridge" ? "in the refrigerator"
    : context.storage === "pantry" ? "at room temperature (India, often 25–35°C)"
    : "in its usual storage place (typical Indian household)";
  const prompt = `You are a food-safety and product shelf-life expert for Indian households.
Estimate a realistic EXPIRY date for the product below, measured from the base date.

Product: ${JSON.stringify(productName.slice(0, 200))}
Category: ${category}
Base date (manufacture or purchase): ${baseDate} (Asia/Kolkata)
Stored: ${where}
${context.reference ? `Reference from our shelf-life table: "${context.reference}" Use it unless this specific product is clearly different (e.g. a packaged, preservative-added or UHT version).\n` : ""}
Return ONLY JSON with exactly these keys:
- "expiry_date": string | null  (ISO "YYYY-MM-DD"; base date + a typical unopened shelf life)
- "confidence": "high" | "medium" | "low" | null
- "basis": string | null  (ONE short sentence, e.g. "Sealed UHT milk keeps ~6 months")
- "tips": string[] | null  (at most 2 short, practical storage/usage tips, each under 12 words)

Rules:
- Base the estimate on typical UNOPENED shelf life for this kind of product, in the storage place given above.
- Indian fresh pouch milk keeps ~2–3 days refrigerated; UHT/tetra milk ~6 months unopened. Fresh paneer/curd about a week.
- Fresh perishables (dairy, produce, bakery, cooked/fresh food) = days to ~2 weeks.
- Packaged/canned/dry food = months to a couple of years.
- Medicines: never estimate their expiry; return null expiry_date and confidence.
- Cosmetics/makeup/creams/powders/skincare = typically 2–3 years unopened; add a tip about the Period-After-Opening (e.g. "Use within 12 months of opening").
- For documents/warranty/subscription where a shelf life is meaningless, return null expiry/confidence.
- Tips: at most TWO items. Genuinely useful (e.g. "Refrigerate after opening", "Best consumed within 48h").
- Never return a date before the base date. Be realistic, not optimistic.`;
  const result = await withRetry(() => model().generateContent(prompt, { timeout: TEXT_TIMEOUT_MS }));
  return parseShelfLife(result.response.text());
}

/** Read a receipt photo and return many line items, each with an estimated expiry. */
export async function geminiExtractReceipt(
  imageBase64: string,
  mimeType: string,
  today: string
): Promise<ReceiptExtraction> {
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
  const result = await withRetry(() =>
    model().generateContent([
      { text: prompt },
      { inlineData: { data: imageBase64, mimeType } },
    ], { timeout: IMAGE_TIMEOUT_MS })
  );
  return parseReceiptExtraction(result.response.text());
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
  const result = await withRetry(() => model().generateContent(prompt, { timeout: TEXT_TIMEOUT_MS }));
  return parse(result.response.text());
}
