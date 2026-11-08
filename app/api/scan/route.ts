import { readImageForm } from "@/lib/request-body";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { geminiExtractFromImage, geminiFindDates } from "@/services/gemini";
import { reconcileExtraction } from "@/lib/reconcile-extraction";
import { tesseractExtractText, parseOcrText } from "@/services/tesseract";
import { rateLimit } from "@/lib/rate-limit";
import { todayKolkata } from "@/lib/dates";
import type { Extraction } from "@/lib/validators";

function hasUseful(ex: Extraction): boolean {
  return !!(ex.product_name || ex.expiry_date);
}

export const runtime = "nodejs"; // Tesseract fallback needs Node, not Edge
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
// The platform kills the request at maxDuration; optional extra passes must leave room to answer.
const OPTIONAL_PASS_DEADLINE_MS = 15_000;
const REQUEST_BUDGET_MS = 50_000;

export async function POST(request: Request) {
  // Require an authenticated user — don't burn AI quota for anonymous callers.
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Check the quota while the photo is still uploading: one wait instead of two.
  const [allowed, form] = await Promise.all([
    rateLimit(`scan:${userId}`, 20, 60_000),
    readImageForm(request).catch(() => null),
  ]);
  if (!allowed) return NextResponse.json({ error: "Too many scans — please slow down." }, { status: 429 });
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  const f = form.get("file");
  const file: File | null = f instanceof File ? f : null;

  if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "Image must be under 8MB" }, { status: 400 });

  try {
  const buffer = Buffer.from(await file.arrayBuffer());
  const today = todayKolkata();
  const started = Date.now();

  /** Gemini sometimes misses small ink-jet dates on the first look; ask again, transcription only. */
  async function withDateSecondLook(raw: Extraction): Promise<Extraction> {
    const consumable = raw.item_type === "food" || raw.item_type === "cosmetics" || raw.item_type === "medicine";
    // Judge the first reading after cross-checking: a date the checks throw out needs a second look too.
    const checked = reconcileExtraction(raw, today);
    if (!consumable || (checked.expiry_date && !checked.estimated) || Date.now() - started > OPTIONAL_PASS_DEADLINE_MS) return raw;
    try {
      const found = await geminiFindDates(buffer.toString("base64"), file!.type, today);
      if (!found.expiry_date) return raw;
      return {
        ...raw,
        expiry_date: found.expiry_date,
        expiry_text: found.expiry_text,
        manufacture_date: raw.manufacture_date ?? found.manufacture_date,
        manufacture_text: raw.manufacture_text ?? found.manufacture_text,
        estimated: false,
      };
    } catch {
      return raw;
    }
  }

  // Only consumables (food/cosmetics/medicine) have an expiry. AI vision ALWAYS returns an
  // item_type, so for a photo scan we ALLOW only those three and reject everything else —
  // including blank/uncertain results (a laptop or phone often comes back unsure rather than
  // the exact word "unsupported"). Tesseract may legitimately omit item_type for a real
  // label, so there we only hard-reject an explicit "unsupported".
  async function ok(candidate: Extraction, source: string, ocrText?: string) {
    const raw = reconcileExtraction(candidate, today, ocrText);
    const consumable =
      raw.item_type === "food" || raw.item_type === "cosmetics" || raw.item_type === "medicine";
    const reject = raw.item_type === "unsupported" || (source === "gemini" && !consumable);
    if (reject) {
      return NextResponse.json({
        rejected: true,
        detected: raw.detected ?? raw.product_name ?? null,
      });
    }
    if (!hasUseful(raw)) {
      return NextResponse.json(
        { error: "No product details were readable. Take a close-up of the printed name and expiry date, or enter them manually." },
        { status: 422 }
      );
    }
    // A scan must not silently replace an unreadable printed date with a guess.
    const extraction = {
      ...raw,
      expiry_date: raw.estimated ? null : raw.expiry_date,
      estimated: false,
      freshness: null,
      freshness_note: null,
    };
    return NextResponse.json({ extraction, source });
  }

  // Gemini reads the photo directly (trying a second model on its own quota if the first is
  // busy). Server OCR is only the last resort when no model can answer.
  try {
    const raw = await geminiExtractFromImage(buffer.toString("base64"), file.type, today);
    return ok(await withDateSecondLook(raw), "gemini");
  } catch {
    try {
      // Every model just failed, so asking one to structure the OCR text would only add waiting:
      // the deterministic label parser reads it instead.
      const text = await tesseractExtractText(buffer, Math.max(0, REQUEST_BUDGET_MS - (Date.now() - started)));
      return ok(parseOcrText(text, today), "tesseract", text);
    } catch {
      return NextResponse.json(
        { error: "Couldn’t read the image. Try a clearer photo or enter details manually." },
        { status: 422 }
      );
    }
  }
  } catch {
    return NextResponse.json(
      { error: "Scan failed unexpectedly. Please try again or enter details manually." },
      { status: 500 }
    );
  }
}
