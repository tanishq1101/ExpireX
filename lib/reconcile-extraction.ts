import type { Extraction } from "./validators";
import { parseDateText, parseOcrText } from "./ocr-parser";

const MIN_YEAR = 1990;
const MAX_YEARS_AHEAD = 15;

/**
 * Cross-check a scan result before the user sees it. The model converts printed text to ISO
 * dates, and its usual mistakes are day/month swaps and impossible orderings. Dates are only
 * ever replaced by a deterministic read of the text the model itself transcribed, or dropped
 * so the user is asked to enter them — never invented.
 */
export function reconcileExtraction(ex: Extraction, today: string, ocrText?: string): Extraction {
  const out: Extraction = { ...ex };

  // The printed text is ground truth for the conversion; the model's ISO is only a convenience.
  const fromExpiryText = out.expiry_text ? parseDateText(out.expiry_text, "exp") : null;
  if (fromExpiryText) out.expiry_date = fromExpiryText;
  const fromMfgText = out.manufacture_text ? parseDateText(out.manufacture_text, "mfg") : null;
  if (fromMfgText) out.manufacture_date = fromMfgText;

  // "Best before 9 months from packaging": do the date maths here rather than trust the model's.
  if (!fromExpiryText && out.expiry_text && out.manufacture_date && /\d|\b(?:ONE|TWO|THREE|SIX|NINE|TWELVE|EIGHTEEN)\b/i.test(out.expiry_text)) {
    const [y, m, d] = out.manufacture_date.split("-");
    const relative = parseOcrText(`MFG ${d}/${m}/${y}\n${out.expiry_text}`, today).expiry_date;
    if (relative && relative !== out.manufacture_date) out.expiry_date = relative;
  }

  // Labelled dates in raw OCR text beat a model's reading of that same text.
  if (ocrText) {
    const parsed = parseOcrText(ocrText, today);
    if (parsed.expiry_date) out.expiry_date = parsed.expiry_date;
    if (parsed.manufacture_date) out.manufacture_date = parsed.manufacture_date;
  }

  const limit = `${Number(today.slice(0, 4)) + MAX_YEARS_AHEAD}${today.slice(4)}`;
  if (out.expiry_date && (out.expiry_date < `${MIN_YEAR}-01-01` || out.expiry_date > limit)) out.expiry_date = null;
  if (out.manufacture_date && (out.manufacture_date < `${MIN_YEAR}-01-01` || out.manufacture_date > limit)) out.manufacture_date = null;
  // A manufacture date in the future is a misread; keep the expiry, drop the bad one. A month-only
  // date ("11/2026") resolves to month end, so allow a month of slack.
  const slack = new Date(`${today}T00:00:00Z`);
  slack.setUTCDate(slack.getUTCDate() + 31);
  if (out.manufacture_date && out.manufacture_date > slack.toISOString().slice(0, 10)) out.manufacture_date = null;
  // A product cannot expire before (or on the day) it was made: one of the two was misread —
  // typically the packing date copied into the expiry — so ask the user.
  if (out.expiry_date && out.manufacture_date && out.expiry_date <= out.manufacture_date) out.expiry_date = null;
  return out;
}
