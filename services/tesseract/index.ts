import "server-only";
import { createWorker, OEM, PSM } from "tesseract.js";
import { langPath, gzip } from "@tesseract.js-data/eng";
import type { Extraction } from "@/lib/validators";
import { parseOcrText } from "@/lib/ocr-parser";
export { parseOcrText } from "@/lib/ocr-parser";

// Read labels with bundled language data, without a runtime CDN download.
export async function tesseractExtractText(image: Buffer): Promise<string> {
  const worker = await createWorker("eng", OEM.LSTM_ONLY, { langPath, gzip, cacheMethod: "none" });
  try {
    // PSM 6 = assume a single uniform block of text — better on dense labels.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK }).catch(() => {});
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
