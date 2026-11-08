import { readImageForm } from "@/lib/request-body";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { geminiExtractFromImage, geminiExtract, geminiFindDates } from "@/services/gemini";
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
const OPTIONAL_PASS_DEADLINE_MS = 32_000;
const REQUEST_BUDGET_MS = 50_000;

export async function POST(request: Request) {
  // Require an authenticated user — don't burn AI quota for anonymous callers.
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await rateLimit(`scan:${userId}`, 20, 60_000))
    return NextResponse.json({ error: "Too many scans — please slow down." }, { status: 429 });

  let file: File | null = null;
  try {
    const form = await readImageForm(request);
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "Image must be under 8MB" }, { status: 400 });

  // Engine preference: "ai" (Gemini vision, default & most accurate) or "tesseract" (offline OCR).
  const engine = new URL(request.url).searchParams.get("engine") === "tesseract" ? "tesseract" : "ai";

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

  // ── Tesseract engine (user choice): OCR with Tesseract, structure with AI text-parse,
  //    then a pure-offline regex parse as the final fallback. ───────────────────────────
  if (engine === "tesseract") {
    try {
      const text = await tesseractExtractText(buffer, Math.max(0, REQUEST_BUDGET_MS - (Date.now() - started)));
      let raw: Extraction;
      try {
        const ai = await geminiExtract(text, today); // AI structures the OCR text
        raw = hasUseful(ai) ? ai : parseOcrText(text, today);
      } catch {
        raw = parseOcrText(text, today); // fully offline
      }
      // Offline OCR can't tell a gadget from a label; if it read nothing useful,
      // fall back to AI vision so durable goods (laptop, phone…) are still rejected.
      if (!hasUseful(raw) && raw.item_type !== "unsupported") {
        try {
          return ok(await withDateSecondLook(await geminiExtractFromImage(buffer.toString("base64"), file.type, today)), "gemini");
        } catch {
          /* keep the offline result */
        }
      }
      return ok(raw, "tesseract", text);
    } catch {
      return NextResponse.json(
        { error: "Couldn’t read the image with Tesseract. Try a clearer photo or the AI engine." },
        { status: 422 }
      );
    }
  }

  // ── AI engine (default): Gemini reads the photo directly; Tesseract is the fallback. ──
  try {
    const raw = await geminiExtractFromImage(buffer.toString("base64"), file.type, today);
    return ok(await withDateSecondLook(raw), "gemini");
  } catch {
    try {
      const text = await tesseractExtractText(buffer, Math.max(0, REQUEST_BUDGET_MS - (Date.now() - started)));
      let raw: Extraction;
      try {
        const ai = await geminiExtract(text, today);
        raw = hasUseful(ai) ? ai : parseOcrText(text, today);
      } catch {
        raw = parseOcrText(text, today);
      }
      return ok(raw, "tesseract", text);
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
