import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractionSchema, type Extraction } from "@/lib/validators";
import { CATEGORIES } from "@/lib/status";

const MODEL = "gemini-2.5-flash"; // multimodal; reads the label image and extracts in one call

const RULES = `Return ONLY JSON with exactly these keys:
- "product_name": string | null  (concise product name, no marketing fluff)
- "expiry_date": string | null   (ISO "YYYY-MM-DD"; the EXPIRY/USE-BY/BEST-BEFORE date, NOT the manufacture date)
- "category": one of [${CATEGORIES.join(", ")}] | null

Rules:
- Dates on Indian packaging are usually DD/MM/YYYY.
- If a value is unreadable or absent, use null. Never guess wildly.
- Prefer "best before"/"exp"/"use by" for expiry. Ignore "mfg"/"packed on" for expiry.
- If only month/year is present, use the last day of that month.`;

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
