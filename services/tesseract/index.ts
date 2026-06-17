import "server-only";
import { createWorker } from "tesseract.js";
import { extractionSchema, type Extraction } from "@/lib/validators";
import type { Category } from "@/types/database";

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

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function lastDayOfMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? null : s;
}
const normYear = (y: number) => (y < 100 ? 2000 + y : y);

type Found = { iso: string; idx: number };

/** Pull every plausible date out of OCR text, tolerant of /, -, . and spaces. */
function findDates(text: string): Found[] {
  const out: Found[] = [];
  const push = (s: string | null, idx: number) => {
    if (s) out.push({ iso: s, idx });
  };
  let m: RegExpExecArray | null;

  // DD MM YYYY (separators / - . or space)
  const re1 = /(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2,4})/g;
  while ((m = re1.exec(text))) push(iso(normYear(+m[3]), +m[2], +m[1]), m.index);

  // MM/YYYY → last day of month
  const re2 = /(?<!\d)(\d{1,2})[\/\-. ](\d{4})(?!\d)/g;
  while ((m = re2.exec(text))) {
    const mo = +m[1], y = +m[2];
    if (mo >= 1 && mo <= 12) push(iso(y, mo, lastDayOfMonth(y, mo)), m.index);
  }

  // Month-name YYYY e.g. "JUN 2026", "DEC, 2025"
  const T = text.toUpperCase();
  const re3 = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s*[,\/-]?\s*(\d{4})/g;
  while ((m = re3.exec(T))) {
    const mo = MONTHS[m[1]], y = +m[2];
    push(iso(y, mo, lastDayOfMonth(y, mo)), m.index);
  }
  return out;
}

/** Classify a date by the keyword nearest before it: expiry vs manufacture. */
function nearestKind(text: string, idx: number): "exp" | "mfg" | "none" {
  const w = text.slice(Math.max(0, idx - 32), idx + 8).toUpperCase();
  if (/(EXP|BEST\s*BEFORE|USE\s*B|EXPIR|\bBB\b|\bBBE\b)/.test(w)) return "exp";
  if (/(MFG|MFD|PKD|PACK|MANUF)/.test(w)) return "mfg";
  return "none";
}

function guessCategory(text: string): Category | null {
  const t = text.toLowerCase();
  if (/\b(tablet|capsule|syrup|ointment|drops|mg|pharma|medicine|antibiotic)\b/.test(t)) return "medicine";
  if (/\b(cream|lotion|shampoo|conditioner|serum|spf|sunscreen|cosmetic|lipstick|makeup|powder)\b/.test(t))
    return "cosmetics";
  return null;
}

/** Pure-offline parse of OCR text into structured fields (no AI). */
export function parseOcrText(text: string, today: string): Extraction {
  const dates = findDates(text);
  const exps = dates
    .filter((d) => nearestKind(text, d.idx) === "exp")
    .sort((a, b) => (a.iso < b.iso ? 1 : -1));
  const mfgs = dates
    .filter((d) => nearestKind(text, d.idx) === "mfg")
    .sort((a, b) => (a.iso < b.iso ? -1 : 1));

  let expiry: string | null = exps[0]?.iso ?? null;
  if (!expiry) {
    const future = dates.filter((d) => d.iso > today).sort((a, b) => (a.iso < b.iso ? 1 : -1));
    expiry = future[0]?.iso ?? null;
  }
  const manufacture = mfgs[0]?.iso ?? null;

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const name =
    lines.find(
      (l) =>
        /[A-Za-z]{3,}/.test(l) &&
        l.length <= 60 &&
        !/(EXP|MFG|MFD|BEST|BATCH|MRP|PRICE|\bBB\b|\d{2}[\/\-.]\d{2})/i.test(l)
    ) ?? null;

  const candidate = {
    product_name: name,
    expiry_date: expiry,
    manufacture_date: manufacture,
    category: guessCategory(text),
  };
  const safe = extractionSchema.safeParse(candidate);
  return safe.success
    ? safe.data
    : { product_name: name, expiry_date: null, manufacture_date: null, category: null };
}

/** Full Tesseract extraction: OCR the image, then parse it locally (offline). */
export async function tesseractExtract(image: Buffer, today: string): Promise<Extraction> {
  const text = await tesseractExtractText(image);
  return parseOcrText(text, today);
}
