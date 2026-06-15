import "server-only";
import { createWorker } from "tesseract.js";

// Fallback OCR — used ONLY when Cloud Vision errors/quota-fails. Slower; loads lang data
// at runtime. Acceptable at ~100 scans/month where the fallback path is rare.
export async function tesseractExtractText(image: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
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
