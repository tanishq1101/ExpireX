import "server-only";
import { createWorker } from "tesseract.js";
import type { Extraction } from "@/lib/validators";
import { parseOcrText } from "@/lib/ocr-parser";
export { parseOcrText } from "@/lib/ocr-parser";

// Raw OCR text via Tesseract. Slower than Gemini vision; loads lang data at runtime.
export async function tesseractExtractText(image: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    // PSM 6 = assume a single uniform block of text — better on dense labels.
    await worker.setParameters({ tessedit_pageseg_mode: "6" as never }).catch(() => {});
    const {
      data: { text },
    } = await worker.recognize(image);
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Tesseract returned no text");
    return trimmed;
  } finally {
    await worker.terminate();
  }
}

/** Full Tesseract extraction: OCR the image, then parse it locally (offline). */
export async function tesseractExtract(image: Buffer, today: string): Promise<Extraction> {
  const text = await tesseractExtractText(image);
  return parseOcrText(text, today);
}
