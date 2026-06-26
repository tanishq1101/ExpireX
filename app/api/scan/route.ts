import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { geminiExtractFromImage, geminiExtract, geminiEstimateShelfLife } from "@/services/gemini";
import { tesseractExtractText, parseOcrText } from "@/services/tesseract";
import { estimateShelfLifeLocal } from "@/lib/shelf-life";
import { todayKolkata } from "@/lib/dates";
import type { Extraction } from "@/lib/validators";
import type { Category } from "@/types/database";

function hasUseful(ex: Extraction): boolean {
  return !!(ex.product_name || ex.expiry_date);
}

export const runtime = "nodejs"; // Tesseract fallback needs Node, not Edge
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  // Require an authenticated user — don't burn AI quota for anonymous callers.
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await request.formData();
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

  // If OCR read no expiry date, auto-estimate one so the form is never blank.
  async function withEstimatedExpiry(extraction: Extraction): Promise<Extraction> {
    if (extraction.expiry_date || !extraction.product_name) return extraction;
    const category = (extraction.category as Category) ?? "other";
    const base = extraction.manufacture_date ?? today;
    try {
      const ai = await geminiEstimateShelfLife(extraction.product_name, category, base);
      if (ai.expiry_date && ai.expiry_date > today) {
        return { ...extraction, expiry_date: ai.expiry_date, estimated: true };
      }
    } catch {
      /* fall through to local */
    }
    const local = estimateShelfLifeLocal(extraction.product_name, category, base);
    return local.expiry_date
      ? { ...extraction, expiry_date: local.expiry_date, estimated: true }
      : extraction;
  }

  // Only consumables (food/cosmetics/medicine) have an expiry. AI vision ALWAYS returns an
  // item_type, so for a photo scan we ALLOW only those three and reject everything else —
  // including blank/uncertain results (a laptop or phone often comes back unsure rather than
  // the exact word "unsupported"). Tesseract may legitimately omit item_type for a real
  // label, so there we only hard-reject an explicit "unsupported".
  async function ok(raw: Extraction, source: string) {
    const consumable =
      raw.item_type === "food" || raw.item_type === "cosmetics" || raw.item_type === "medicine";
    const reject = raw.item_type === "unsupported" || (source === "gemini" && !consumable);
    if (reject) {
      return NextResponse.json({
        rejected: true,
        detected: raw.detected ?? raw.product_name ?? null,
      });
    }
    const extraction = await withEstimatedExpiry(raw);
    return NextResponse.json({ extraction, source });
  }

  // ── Tesseract engine (user choice): OCR with Tesseract, structure with AI text-parse,
  //    then a pure-offline regex parse as the final fallback. ───────────────────────────
  if (engine === "tesseract") {
    try {
      const text = await tesseractExtractText(buffer);
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
          return ok(await geminiExtractFromImage(buffer.toString("base64"), file.type, today), "gemini");
        } catch {
          /* keep the offline result */
        }
      }
      return ok(raw, "tesseract");
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
    return ok(raw, "gemini");
  } catch {
    try {
      const text = await tesseractExtractText(buffer);
      let raw: Extraction;
      try {
        const ai = await geminiExtract(text, today);
        raw = hasUseful(ai) ? ai : parseOcrText(text, today);
      } catch {
        raw = parseOcrText(text, today);
      }
      return ok(raw, "tesseract");
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
