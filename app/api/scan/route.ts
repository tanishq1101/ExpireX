import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { geminiExtractFromImage, geminiExtract, geminiEstimateShelfLife } from "@/services/gemini";
import { tesseractExtractText } from "@/services/tesseract";
import { estimateShelfLifeLocal } from "@/lib/shelf-life";
import { todayKolkata } from "@/lib/dates";
import type { Extraction } from "@/lib/validators";
import type { Category } from "@/types/database";

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

  // Primary: Gemini reads the photo and extracts in one call (no Cloud Vision / billing).
  try {
    const raw = await geminiExtractFromImage(buffer.toString("base64"), file.type, today);
    const extraction = await withEstimatedExpiry(raw);
    return NextResponse.json({ extraction, source: "gemini" });
  } catch {
    // Fallback: offline Tesseract OCR -> Gemini text extraction.
    try {
      const text = await tesseractExtractText(buffer);
      const raw = await geminiExtract(text, today);
      const extraction = await withEstimatedExpiry(raw);
      return NextResponse.json({ extraction, source: "tesseract" });
    } catch {
      return NextResponse.json(
        { error: "Couldn’t read the image. Try a clearer photo or enter details manually." },
        { status: 422 }
      );
    }
  }
}
