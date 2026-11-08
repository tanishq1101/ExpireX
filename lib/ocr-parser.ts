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

const EXPIRY_LABELS = String.raw`(?:EXP(?:IRY|IRES?|IRATION|Y|D)?|BEST\s*(?:BEFORE|BY)(?:\s*END)?|USE[\s-]*(?:BY|BEFORE)|CONSUME\s*(?:BY|BEFORE)|VALID\s*(?:UNTIL|TILL|UPTO|UP\s*TO)|B\.?B\.?(?:D|E)?|DATE\s*OF\s*EXP(?:IRY)?|SELL\s*BY)`;
const MFG_LABELS = String.raw`(?:MFG|MFD|MFR|PKD|PKG|DOM|D\.O\.M|PACK(?:ED|ING|AGED)?(?:\s*ON)?|MANUF(?:ACTUR(?:E|ED|ING))?(?:\s*ON)?|PROD(?:UCED|UCTION)?(?:\s*ON)?|DATE\s*OF\s*(?:MFG|MANUFACTURE|PACKING|PACKAGING))`;
/** "EXP DATE: 06/27", "BEST BEFORE END 06/27", "MFG. DT 05/26" — words that sit between a label and its date. */
const LABEL_TAIL = String.raw`(?:\s*(?:DATE|DT|ON|END))?\.?\W{0,4}`;
const IS_MFG_LABEL = new RegExp(String.raw`^${MFG_LABELS}$`, "i");

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
  collect(/(?<!\d)(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/g,
    (m) => iso(+m[1], +m[2], +m[3]));
  collect(/(?<!\d)(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4}|\d{2})(?!\d)/g,
    (m) => iso(normYear(+m[3]), +m[2], +m[1]));
  collect(/\b(\d{1,2})[\s/.-]*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s,/.-]*(\d{4}|\d{2})\b/gi,
    (m) => iso(normYear(+m[3]), MONTHS[m[2].toUpperCase()], +m[1]));
  collect(new RegExp(String.raw`(?<=(?:${EXPIRY_LABELS}|${MFG_LABELS})${LABEL_TAIL})(\d{1,2})[\/\-.](\d{2})(?![\d\/\-.])`, "gi"), (m) => {
    const mo = +m[1], y = normYear(+m[2]);
    return mo >= 1 && mo <= 12 ? iso(y, mo, lastDayOfMonth(y, mo)) : null;
  });
  collect(/(?<!\d)(\d{1,2})[\/\-. ](\d{4})(?!\d)/g, (m) => {
    const mo = +m[1], y = +m[2];
    return iso(y, mo, lastDayOfMonth(y, mo));
  });
  // US-style "JUN 15, 2027" / "JUN 15 27".
  collect(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?[\s/.-]*(\d{1,2})(?:ST|ND|RD|TH)?[\s,/.-]+(\d{4}|\d{2})\b/gi,
    (m) => iso(normYear(+m[3]), MONTHS[m[1].toUpperCase()], +m[2]));
  // Compact labelled dates: EXP 15062027 (DDMMYYYY) or EXP 20270615 (YYYYMMDD).
  collect(new RegExp(String.raw`(?<=(?:${EXPIRY_LABELS}|${MFG_LABELS})${LABEL_TAIL})(\d{8})(?!\d)`, "gi"), (m) => {
    const v = m[1];
    return v.startsWith("20") && +v.slice(4, 6) <= 12
      ? iso(+v.slice(0, 4), +v.slice(4, 6), +v.slice(6, 8))
      : iso(+v.slice(4, 8), +v.slice(2, 4), +v.slice(0, 2));
  });
  // Labelled year-month: EXP 2027-06 / 2027/06.
  collect(new RegExp(String.raw`(?<=(?:${EXPIRY_LABELS}|${MFG_LABELS})${LABEL_TAIL})(20\d{2})[\/\-.](\d{1,2})(?![\d\/\-.])`, "gi"), (m) => {
    const mo = +m[2], y = +m[1];
    return mo >= 1 && mo <= 12 ? iso(y, mo, lastDayOfMonth(y, mo)) : null;
  });
  // Labelled month + 2-digit year ("EXP JUN 27", "USE BY SEP-26") means a month, not a day.
  collect(new RegExp(String.raw`(?<=(?:${EXPIRY_LABELS}|${MFG_LABELS})${LABEL_TAIL})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?[\s,\/-]*(\d{2})(?![\d\/\-.:])`, "gi"), (m) => {
    const mo = MONTHS[m[1].toUpperCase()], y = normYear(+m[2]);
    return iso(y, mo, lastDayOfMonth(y, mo));
  });
  collect(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s*[,\/-]?\s*(\d{4})/gi,
    (m) => {
      const mo = MONTHS[m[1].toUpperCase()], y = +m[2];
      return iso(y, mo, lastDayOfMonth(y, mo));
    });
  return out;
}

const COMBINED_HEADING = new RegExp(
  String.raw`(?:(?:${MFG_LABELS})\s*(?:DATE|DT)?\.?\s*(?:[\/&,|+]|AND)\s*(?:${EXPIRY_LABELS})|(?:${EXPIRY_LABELS})\s*(?:DATE|DT)?\.?\s*(?:[\/&,|+]|AND)\s*(?:${MFG_LABELS}))$`,
  "i"
);

/**
 * Classify a date by the keyword nearest before it: expiry vs manufacture. A combined heading
 * ("MFD/EXP:", "PKD & USE BY") followed by two dates is a "pair", resolved by date order.
 */
function nearestKind(text: string, idx: number): "exp" | "mfg" | "pair" | "none" {
  const before = text.slice(Math.max(0, idx - 64), idx).toUpperCase();
  const labels = [...before.matchAll(new RegExp(String.raw`(?<![A-Z])(${EXPIRY_LABELS}|${MFG_LABELS})(?![A-Z])`, "g"))];
  const last = labels.at(-1);
  if (!last) return "none";
  const end = (last.index ?? 0) + last[1].length;
  if (COMBINED_HEADING.test(before.slice(Math.max(0, end - 40), end))) return "pair";
  return IS_MFG_LABEL.test(last[1].trim()) ? "mfg" : "exp";
}

function guessCategory(text: string): Category | null {
  const t = text.toLowerCase();
  // "mg" and "powder" also appear on food (nutrition panels, milk powder), so they are not signals.
  if (/\b(tablets?|capsules?|syrup|ointment|antibiotic|pharma\w*|medicine|dosage|prescription)\b/.test(t)) return "medicine";
  if (/\b(cream|lotion|shampoo|conditioner|serum|spf|sunscreen|cosmetic|lipstick|makeup|face\s*powder|talc)\b/.test(t))
    return "cosmetics";
  return null;
}

function addPeriod(isoDate: string, amount: number, unit: string): string | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  const u = unit.toUpperCase();
  if (u.startsWith("DAY")) return iso(...ymd(new Date(Date.UTC(y, m - 1, d + amount))));
  if (u.startsWith("WEEK")) return iso(...ymd(new Date(Date.UTC(y, m - 1, d + amount * 7))));
  const months = u.startsWith("YEAR") ? amount * 12 : amount;
  const total = m - 1 + months;
  const ty = y + Math.floor(total / 12), tm = (total % 12 + 12) % 12 + 1;
  return iso(ty, tm, Math.min(d, lastDayOfMonth(ty, tm)));
}
function ymd(date: Date): [number, number, number] {
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

const NUMBER_WORDS: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10,
  ELEVEN: 11, TWELVE: 12, FIFTEEN: 15, EIGHTEEN: 18, TWENTY: 20, "TWENTY FOUR": 24, "TWENTY-FOUR": 24,
  THIRTY: 30, "THIRTY SIX": 36, "THIRTY-SIX": 36,
};
const MAX_PERIOD: Record<string, number> = { DAY: 1095, WEEK: 156, MONTH: 60, YEAR: 5 };

/**
 * "Best before 6 months from the date of manufacture" is only usable with a printed
 * manufacture date; without one the expiry stays unknown rather than guessed. A period
 * counted from opening ("use within 3 months of opening") is not an expiry at all.
 */
function relativeExpiry(text: string, manufacture: string | null): string | null {
  if (!manufacture) return null;
  const words = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|");
  const re = new RegExp(
    String.raw`\b(?:${EXPIRY_LABELS}|USE\s*WITHIN|CONSUME\s*WITHIN|SHELF[\s-]*LIFE(?:\s*IS)?|VALID\s*FOR|GOOD\s*FOR)\W{0,12}(?:WITHIN\s*)?(\d{1,3}|${words})\s*\(?\d{0,3}\)?\s*(DAYS?|WEEKS?|MONTHS?|MTHS?|YEARS?|YRS?)\b(?!\s*(?:OF|AFTER|FROM)?\s*(?:THE\s*)?(?:DATE\s*OF\s*)?OPEN)`,
    "gi"
  );
  const flat = text.replace(/\s+/g, " ");
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    const amount = /^\d+$/.test(m[1]) ? +m[1] : NUMBER_WORDS[m[1].toUpperCase().replace(/\s+/g, " ")] ?? 0;
    const unit = m[2].toUpperCase().replace(/^MTHS?$/, "MONTH").replace(/^YRS?$/, "YEAR").replace(/S$/, "");
    if (!amount || amount > (MAX_PERIOD[unit] ?? 0)) continue;
    return addPeriod(manufacture, amount, unit);
  }
  return null;
}

/** Lines that describe the pack, not the product, are never a usable name. */
const NAME_NOISE = /(\bEXP|MFG|MFD|PKD|BEST\s*(?:BEFORE|BY)|BATCH|LOT\b|MRP|PRICE|\bBB\b|\d{2}[\/\-.]\d{2}|INGREDIENT|NUTRI|STORE\b|STORAGE|KEEP\b|NET\s*(?:WT|QTY|CONTENT)|FSSAI|LIC\.?\s*NO|MARKETED|MANUFACTURED|CUSTOMER\s*CARE|WWW|\.COM|@|ADDRESS|INCLUSIVE|TAXES|DIRECTIONS|WARNING)/i;

function pickName(lines: string[]): string | null {
  const clean = (l: string) => l.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)%.]+$/g, "").replace(/\s{2,}/g, " ");
  const scored = lines
    .map(clean)
    .filter((l) => l.length >= 4 && l.length <= 60 && /[A-Za-z]{3,}/.test(l) && !NAME_NOISE.test(l))
    .filter((l) => (l.match(/[A-Za-z]/g)?.length ?? 0) / l.length >= 0.6);
  return scored[0] ?? null;
}

/** Pure-offline parse of OCR text into structured fields (no AI). */
export function parseOcrText(rawText: string, _today: string): Extraction {
  const text = repairDateDigits(rawText);
  const dates = findDates(text).map((d) => ({ ...d, kind: nearestKind(text, d.idx) }));
  const exps = dates
    .filter((d) => d.kind === "exp")
    .sort((a, b) => (a.iso < b.iso ? 1 : -1));
  const mfgs = dates
    .filter((d) => d.kind === "mfg")
    .sort((a, b) => (a.iso < b.iso ? -1 : 1));

  // Never assume a single unlabelled or manufacture date is an expiry.
  let manufacture = mfgs[0]?.iso ?? null;
  let expiry: string | null = exps[0]?.iso ?? relativeExpiry(text, manufacture);

  // Ink-jet stamps often print just two dates ("05.11.26 04.05.27") under a "MFD/EXP" heading
  // elsewhere on the pack. When the text says both kinds exist and exactly two unlabelled dates
  // were printed a sensible distance apart, the earlier is manufacture and the later is expiry.
  if (!expiry && !manufacture) {
    const paired = [...new Set(dates.filter((d) => d.kind === "pair").map((d) => d.iso))].sort();
    const unlabelled = [...new Set(dates.filter((d) => d.kind === "none").map((d) => d.iso))].sort();
    const mentionsBoth = new RegExp(String.raw`(?<![A-Z])${EXPIRY_LABELS}`, "i").test(text) && new RegExp(String.raw`(?<![A-Z])${MFG_LABELS}`, "i").test(text);
    const loose = paired.length === 2 ? paired : mentionsBoth && !paired.length ? unlabelled : [];
    if (loose.length === 2) {
      const gap = (Date.parse(loose[1]) - Date.parse(loose[0])) / 86_400_000;
      if (gap >= 7 && gap <= 6 * 365) [manufacture, expiry] = loose;
    }
  }

  const name = pickName(text.split(/\n+/).map((l) => l.trim()).filter(Boolean));

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

/**
 * Deterministically read a date the model transcribed verbatim ("15/06/2027", "JUN 27").
 * Used to cross-check model-converted ISO dates, since DD/MM vs MM/DD swaps are its common error.
 */
export function parseDateText(text: string, kind: "exp" | "mfg"): string | null {
  const clean = text.trim();
  if (!clean || clean.length > 60) return null;
  const parsed = parseOcrText(`${kind === "exp" ? "EXP" : "MFG"} ${clean}`, "");
  return (kind === "exp" ? parsed.expiry_date : parsed.manufacture_date) ?? null;
}
