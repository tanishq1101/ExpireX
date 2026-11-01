import { extractionSchema, type Extraction } from "./validators";
import { isCalendarDate } from "./calendar-date";
import type { Category } from "@/types/database";

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
  return isCalendarDate(s) ? s : null;
}
const normYear = (y: number) => (y < 100 ? 2000 + y : y);

type Found = { iso: string; idx: number };

/**
 * OCR often reads 0 as O and 1 as I/l inside printed dates ("2O/O5/2O27"). Repair those only
 * inside tokens that look like a date, so ordinary words are never touched.
 */
export function repairDateDigits(text: string): string {
  return text.replace(/(?<![A-Za-z0-9])[0-9OoIl|]{1,4}(?:[\/\-.][0-9OoIl|]{1,4}){1,2}(?![A-Za-z0-9])/g, (token) =>
    (token.match(/\d/g)?.length ?? 0) >= 2 ? token.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1") : token
  );
}

const EXPIRY_LABELS = String.raw`(?:EXP(?:IRY|IRES|IRATION)?|BEST\s*BEFORE|USE\s*(?:BY|BEFORE)|BBE?)`;
const MFG_LABELS = String.raw`(?:MFG|MFD|PKD|PACK(?:ED)?(?:\s*ON)?|MANUF(?:ACTURED)?(?:\s*ON)?)`;

/** Pull every plausible date out of OCR text, tolerant of /, -, . and spaces. */
function findDates(text: string): Found[] {
  const out: Found[] = [];
  const push = (s: string | null, idx: number) => {
    if (s) out.push({ iso: s, idx });
  };
  let m: RegExpExecArray | null;

  // Consume full dates before month/year so a manufacture day cannot be
  // reinterpreted as a second expiry date. Invalid dates are consumed too.
  const occupied: { start: number; end: number }[] = [];
  function collect(re: RegExp, convert: (m: RegExpExecArray) => string | null) {
    while ((m = re.exec(text))) {
      const start = m.index, end = start + m[0].length;
      if (occupied.some((r) => start < r.end && end > r.start)) continue;
      occupied.push({ start, end });
      push(convert(m), start);
    }
  }
  collect(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g,
    (m) => iso(+m[1], +m[2], +m[3]));
  collect(/(?<!\d)(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4}|\d{2})(?!\d)/g,
    (m) => iso(normYear(+m[3]), +m[2], +m[1]));
  collect(/\b(\d{1,2})[\s/.-]*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s,/.-]*(\d{4}|\d{2})\b/gi,
    (m) => iso(normYear(+m[3]), MONTHS[m[2].toUpperCase()], +m[1]));
  collect(new RegExp(String.raw`(?<=(?:${EXPIRY_LABELS}|${MFG_LABELS})\.?\W{0,4})(\d{1,2})[\/\-.](\d{2})(?![\d\/\-.])`, "gi"), (m) => {
    const mo = +m[1], y = normYear(+m[2]);
    return mo >= 1 && mo <= 12 ? iso(y, mo, lastDayOfMonth(y, mo)) : null;
  });
  collect(/(?<!\d)(\d{1,2})[\/\-. ](\d{4})(?!\d)/g, (m) => {
    const mo = +m[1], y = +m[2];
    return iso(y, mo, lastDayOfMonth(y, mo));
  });
  collect(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s*[,\/-]?\s*(\d{4})/gi,
    (m) => {
      const mo = MONTHS[m[1].toUpperCase()], y = +m[2];
      return iso(y, mo, lastDayOfMonth(y, mo));
    });
  return out;
}

/** Classify a date by the keyword nearest before it: expiry vs manufacture. */
function nearestKind(text: string, idx: number): "exp" | "mfg" | "none" {
  const before = text.slice(Math.max(0, idx - 64), idx).toUpperCase();
  const labels = [...before.matchAll(new RegExp(String.raw`\b(${EXPIRY_LABELS}|${MFG_LABELS})\b`, "g"))];
  const label = labels.at(-1)?.[1];
  if (!label) return "none";
  return /^(MFG|MFD|PKD|PACK|MANUF)/.test(label) ? "mfg" : "exp";
}

function guessCategory(text: string): Category | null {
  const t = text.toLowerCase();
  // "mg" and "powder" also appear on food (nutrition panels, milk powder), so they are not signals.
  if (/\b(tablets?|capsules?|syrup|ointment|antibiotic|pharma\w*|medicine|dosage|prescription)\b/.test(t)) return "medicine";
  if (/\b(cream|lotion|shampoo|conditioner|serum|spf|sunscreen|cosmetic|lipstick|makeup|face\s*powder|talc)\b/.test(t))
    return "cosmetics";
  return null;
}

/** Pure-offline parse of OCR text into structured fields (no AI). */
export function parseOcrText(rawText: string, _today: string): Extraction {
  const text = repairDateDigits(rawText);
  const dates = findDates(text);
  const exps = dates
    .filter((d) => nearestKind(text, d.idx) === "exp")
    .sort((a, b) => (a.iso < b.iso ? 1 : -1));
  const mfgs = dates
    .filter((d) => nearestKind(text, d.idx) === "mfg")
    .sort((a, b) => (a.iso < b.iso ? -1 : 1));

  // Never assume an unlabelled or manufacture date is an expiry.
  const expiry: string | null = exps[0]?.iso ?? null;
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

