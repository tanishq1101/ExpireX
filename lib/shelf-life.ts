import type { Category } from "@/types/database";
import { addDays } from "./dates";
import type { ShelfLife } from "./validators";
import { SHELF_LIFE_ROWS, type ShelfRow } from "./shelf-life-data";

export type Storage = "pantry" | "fridge" | "freezer";

export const STORAGE_LABEL: Record<Storage, string> = {
  pantry: "Cupboard",
  fridge: "Fridge",
  freezer: "Freezer",
};

/** Words that usually describe a flavour or ingredient rather than what the product is. */
const FLAVOUR_WORDS = new Set([
  "milk", "chocolate", "cream", "butter", "cheese", "mango", "orange", "lemon", "lime", "tomato",
  "chicken", "honey", "salt", "pepper", "garlic", "onion", "mint", "coffee", "strawberry", "vanilla",
  "banana", "apple", "coconut", "ginger", "rose", "egg", "fruit", "spinach", "potato", "corn",
  "almond", "almonds", "cashew", "peanut", "peanuts", "ghee", "paneer", "curd", "malai", "tea",
  "jam", "fish", "meat", "rice", "oats", "dates", "sugar", "jaggery", "masala", "cocoa", "pista",
  "kesar", "elaichi", "badam", "chilli", "mushroom", "pizza", "pasta", "sauce", "soda", "water",
]);

/** Lowercase, drop pack sizes and punctuation so "Amul Butter 500g (Pasteurised)" → "amul butter pasteurised". */
export function normalizeProductName(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:g|gm|gms|gram|grams|kg|kgs|mg|ml|l|ltr|ltrs|litre|litres|liter|liters|oz|lb|lbs|pcs|pc|pieces|n|nos|tabs|caps|pack|packs|sachets?|units?|count|ct)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type IndexedRow = { row: ShelfRow; keywords: { text: string; words: number; re: RegExp }[] };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const INDEX: IndexedRow[] = SHELF_LIFE_ROWS.map((row) => ({
  row,
  keywords: row[0].split("|").map((raw) => {
    const text = normalizeProductName(raw);
    // Whole words only, tolerant of simple plurals ("biscuit" ↔ "biscuits", "tomato" ↔ "tomatoes").
    return { text, words: text.split(" ").length, re: new RegExp(`(?:^| )${escape(text)}(?:s|es)?(?= |$)`) };
  }),
}));

export type ShelfMatch = {
  row: ShelfRow;
  keyword: string;
  confidence: "high" | "medium" | "low";
  score: number;
};

function bestMatch(text: string, category: Category | null, fromHint: boolean): ShelfMatch | null {
  if (!text) return null;
  const tokens = text.split(" ").length;
  let best: ShelfMatch | null = null;
  for (const { row, keywords } of INDEX) {
    // A face cream must never inherit dairy cream's shelf life, and vice versa.
    if (category && category !== "other" && row[1] !== category) continue;
    for (const kw of keywords) {
      const m = kw.re.exec(text);
      if (!m) continue;
      const start = m.index + (m[0].startsWith(" ") ? 1 : 0);
      const endToken = text.slice(0, start).split(" ").filter(Boolean).length + kw.words; // 1-based
      const last = endToken >= tokens;
      // Product names put the head noun last ("Potato Chips", "Apple Juice", "Butter Cookies").
      let score = kw.words * 10 + (fromHint ? 2 : (6 * endToken) / tokens) + kw.text.length * 0.01;
      const flavour = kw.words === 1 && FLAVOUR_WORDS.has(kw.text) && !last;
      if (flavour) score -= 5;
      const confidence: ShelfMatch["confidence"] =
        flavour ? "low"
        : fromHint ? (kw.words >= 2 ? "medium" : "low")
        : kw.words >= 2 || endToken >= tokens - 1 ? "high"
        : "medium";
      if (!best || score > best.score) best = { row, keyword: kw.text, confidence, score };
    }
  }
  return best;
}

/**
 * Find the dataset entry that best describes a product. Category tags from product databases
 * ("en:uht-milks") are used as hints when the name alone is not conclusive.
 */
export function matchShelfLife(name: string, category?: Category | null, hints: string[] = []): ShelfMatch | null {
  const byName = bestMatch(normalizeProductName(name), category ?? null, false);
  if (byName?.confidence === "high") return byName;
  let byHint: ShelfMatch | null = null;
  for (const hint of hints.slice(0, 30)) {
    const text = normalizeProductName(hint.replace(/^[a-z]{2}:/i, "").replace(/-/g, " "));
    const m = bestMatch(text, category ?? null, true);
    if (m && (!byHint || m.score > byHint.score)) byHint = m;
  }
  if (byHint?.confidence === "medium" && (!byName || byName.confidence === "low")) return byHint;
  if (!byName) return byHint;
  if (byHint && byHint.score > byName.score && byName.confidence === "low") return byHint;
  return byName;
}

// ── Retrieval for AI grounding (RAG) ─────────────────────────────────────────
// When no entry matches confidently, the closest few entries are retrieved by weighted word
// overlap and handed to the model as reference facts, so its estimate is anchored to the
// curated table instead of free recall. Lexical retrieval is enough for ~230 short entries
// and needs no embedding calls (which would spend the same rate-limited AI quota).

const stem = (w: string) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const tokens = (text: string) => normalizeProductName(text).split(" ").filter((w) => w.length > 1).map(stem);

const ROW_TOKENS = INDEX.map(({ row }) => new Set(row[0].split("|").flatMap(tokens)));
const DOC_FREQ = new Map<string, number>();
for (const set of ROW_TOKENS) for (const t of set) DOC_FREQ.set(t, (DOC_FREQ.get(t) ?? 0) + 1);
const idf = (t: string) => Math.log(1 + INDEX.length / (DOC_FREQ.get(t) ?? INDEX.length));

export type RetrievedShelfLife = { row: ShelfRow; score: number };

/** Top-k dataset entries that share the most informative words with the product. */
export function retrieveShelfLife(name: string, category?: Category | null, hints: string[] = [], k = 5): RetrievedShelfLife[] {
  const nameTokens = tokens(name);
  const hintTokens = hints.slice(0, 30).flatMap((h) => tokens(h.replace(/^[a-z]{2}:/i, "").replace(/-/g, " ")));
  if (!nameTokens.length && !hintTokens.length) return [];
  const scored: RetrievedShelfLife[] = [];
  INDEX.forEach(({ row }, i) => {
    if (category && category !== "other" && row[1] !== category) return;
    let score = 0;
    nameTokens.forEach((t, pos) => {
      // Later words are usually the head noun ("potato chips" is chips): weight them up.
      if (ROW_TOKENS[i].has(t)) score += idf(t) * (1 + pos / Math.max(1, nameTokens.length));
    });
    for (const t of new Set(hintTokens)) if (ROW_TOKENS[i].has(t)) score += idf(t) * 0.5;
    if (score > 0) scored.push({ row, score });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

const fmtDays = (d: number | null) => (d == null ? "not suitable" : d === 0 ? "same day" : `${d} days`);

/** Plain-text reference lines for the model prompt. */
export function describeShelfRows(rows: RetrievedShelfLife[]): string {
  return rows
    .map(({ row: [, cat, pantry, fridge, freezer, opened, label] }) =>
      `- ${label} (${cat}): cupboard ${fmtDays(pantry)}, fridge ${fmtDays(fridge)}, freezer ${fmtDays(freezer)}${opened != null ? `, once opened ${opened} days` : ""}`)
    .join("\n");
}

/** Read a free-text storage location ("Kitchen fridge", "Deep freezer", "Medicine box"). */
export function storageFromLocation(location?: string | null, name?: string | null): Storage | null {
  const loc = (location ?? "").toLowerCase();
  if (/freez|deep\s*freeze/.test(loc)) return "freezer";
  if (/fridge|refrig|chiller|cooler/.test(loc)) return "fridge";
  if (/cupboard|pantry|shelf|kitchen|room|cabinet|drawer|counter|rack|box|bathroom|almirah|store|basket|table/.test(loc)) return "pantry";
  if (/\bfrozen\b/i.test(name ?? "")) return "freezer";
  return null;
}

function humanDays(days: number): string {
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

const WHERE: Record<Storage, string> = {
  pantry: "at room temperature",
  fridge: "in the fridge",
  freezer: "in the freezer",
};

/** Days a dataset entry keeps in a given place, falling back sensibly when it doesn't apply. */
export function daysFor(row: ShelfRow, wanted: Storage | null): { days: number; storage: Storage; warning?: string } | null {
  const [, , pantry, fridge, freezer] = row;
  const natural: Storage | null = pantry != null ? "pantry" : fridge != null ? "fridge" : freezer != null ? "freezer" : null;
  if (!natural) return null;
  const storage = wanted ?? natural;
  if (storage === "freezer") {
    if (freezer != null) return { days: freezer, storage };
    if (fridge != null) return { days: fridge, storage: "fridge", warning: "This doesn’t freeze well, so we used the fridge time." };
    return { days: pantry!, storage: "pantry" };
  }
  if (storage === "fridge") {
    if (fridge != null) return { days: fridge, storage };
    if (pantry != null) return { days: pantry, storage: "pantry" };
    return { days: freezer!, storage: "freezer" };
  }
  if (pantry != null) return { days: pantry, storage };
  // Perishables left out of the fridge are a same-day item.
  return { days: 0, storage: "pantry", warning: "This needs the fridge. Out of the fridge, use it today." };
}

export type LocalEstimate = ShelfLife & {
  storage?: Storage | null;
  /** Typical days it keeps once opened — used to suggest "use within" when the pack is opened. */
  open_days?: number | null;
  label?: string | null;
};

// Used only when the product isn't in the dataset. Food is left blank on purpose: a random
// "30 days" for an unknown food is worse than asking the user to read the pack.
const CATEGORY_DEFAULT_DAYS: Partial<Record<Category, number>> = {
  cosmetics: 730,
  warranty: 365,
  subscription: 30,
};

/** Offline shelf-life estimate from the dataset. Medicine and documents are never estimated. */
export function estimateShelfLifeLocal(
  productName: string,
  category: Category,
  baseDate: string,
  opts: { storage?: Storage | null; hints?: string[] } = {}
): LocalEstimate {
  const none: LocalEstimate = { expiry_date: null, confidence: null, basis: null };
  if (category === "documents") return none;
  const match = category === "warranty" || category === "subscription" ? null : matchShelfLife(productName, category, opts.hints);
  if (category === "medicine") {
    // Never invent a medicine expiry, but still say how long it lasts once opened.
    return { ...none, open_days: match?.row[5] ?? null, label: match?.row[6] ?? null, tips: match?.row[7] ? [match.row[7]] : null };
  }
  if (match) {
    const picked = daysFor(match.row, opts.storage ?? storageFromLocation(null, productName));
    if (picked) {
      const [, , , , , opened, label, tip] = match.row;
      const tips = [picked.warning, tip].filter((t): t is string => !!t).slice(0, 2);
      return {
        expiry_date: addDays(baseDate, picked.days),
        confidence: match.confidence,
        basis: (picked.days > 0
          ? `${label} usually keeps about ${humanDays(picked.days)} ${WHERE[picked.storage]}.`
          : `${label} should be used the same day if it isn’t refrigerated.`).slice(0, 160),
        tips: tips.length ? tips : null,
        storage: picked.storage,
        open_days: opened,
        label,
      };
    }
  }
  const days = CATEGORY_DEFAULT_DAYS[category];
  if (days == null) return none;
  return {
    expiry_date: addDays(baseDate, days),
    confidence: "low",
    basis: `Most ${category === "cosmetics" ? "unopened cosmetics" : category} last about ${humanDays(days)}.`,
  };
}

/** How many days a product typically keeps once opened (null when unknown). */
export function openedDaysFor(productName: string, category: Category): number | null {
  if (category === "documents" || category === "warranty" || category === "subscription") return null;
  return matchShelfLife(productName, category)?.row[5] ?? null;
}
