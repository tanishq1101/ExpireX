import "server-only";
import { createWorker, OEM, PSM } from "tesseract.js";
import { langPath, gzip } from "@tesseract.js-data/eng";
import type { Extraction } from "@/lib/validators";
import { parseOcrText } from "@/lib/ocr-parser";
import { enhanceForOcr, type Enhancement } from "./enhance";
export { parseOcrText } from "@/lib/ocr-parser";

type Pass = { psm: PSM; enhance: Enhancement | null; rotate?: 0 | 90 | 180 | 270 };

// Cheapest/most reliable first. Later passes only run while no expiry date has been read, so
// a clean label costs one pass and a hard one (faint print, sideways, light-on-dark) gets more.
const PASSES: Pass[] = [
  { psm: PSM.AUTO, enhance: "contrast" },
  { psm: PSM.SPARSE_TEXT, enhance: "local" },
  { psm: PSM.SINGLE_BLOCK, enhance: null },
  { psm: PSM.SPARSE_TEXT, enhance: "invert" },
  { psm: PSM.SPARSE_TEXT, enhance: "contrast", rotate: 90 },
  { psm: PSM.SPARSE_TEXT, enhance: "contrast", rotate: 270 },
  { psm: PSM.SPARSE_TEXT, enhance: "contrast", rotate: 180 },
];

/** Rough "is this real text" score so a garbage pass (e.g. wrong rotation) never wins on length. */
function readability(text: string): number {
  const words = text.match(/\b[A-Za-z]{3,}\b/g)?.length ?? 0;
  const labels = text.match(/\b(?:EXP\w*|MFG|MFD|PKD|BEST|USE\s*BY|BATCH)\b/gi)?.length ?? 0;
  return words + labels * 5;
}

/**
 * Read a label with bundled language data (no runtime CDN download). Tries several image
 * treatments and page layouts and stops as soon as an expiry date is found, within `budgetMs`.
 */
export async function tesseractExtractText(image: Buffer, budgetMs = 25_000): Promise<string> {
  const started = Date.now();
  const worker = await createWorker("eng", OEM.LSTM_ONLY, { langPath, gzip, cacheMethod: "none" });
  try {
    const texts: string[] = [];
    let best = "";
    for (const pass of PASSES) {
      // The first pass always runs; later ones need time left for the rest of the request.
      if (texts.length && Date.now() - started > budgetMs) break;
      try {
        await worker.setParameters({ tessedit_pageseg_mode: pass.psm, preserve_interword_spaces: "1" });
        const input = pass.enhance ? await enhanceForOcr(image, pass.enhance, pass.rotate ?? 0) : image;
        const text = (await worker.recognize(input)).data.text.trim();
        if (!text) continue;
        texts.push(text);
        if (readability(text) > readability(best)) best = text;
        const parsed = parseOcrText(text, "");
        if (parsed.expiry_date) {
          // A name from an earlier, cleaner pass is worth keeping alongside the date.
          return parsed.product_name || !texts[0] || texts[0] === text ? text : `${texts[0]}\n${text}`;
        }
      } catch {
        /* a failed pass must not discard what earlier passes read */
      }
    }
    if (!best) throw new Error("Tesseract returned no text");
    return best;
  } finally {
    await worker.terminate();
  }
}

/** Full Tesseract extraction: OCR the image, then parse it locally (offline). */
export async function tesseractExtract(image: Buffer, today: string): Promise<Extraction> {
  const text = await tesseractExtractText(image);
  return parseOcrText(text, today);
}
