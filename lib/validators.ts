import { z } from "zod";
import { isCalendarDate } from "./calendar-date";
import { CATEGORIES } from "./status";

export const categorySchema = z.enum(CATEGORIES);

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(isCalendarDate, "Enter a valid calendar date");

// Form payload (what the Add/Edit + confirm-before-save form validates).
export const itemFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    category: categorySchema,
    expiry_source: z.enum(["manual", "printed", "estimated", "unknown"]).optional(),
    expiry_date: dateString,
    manufacture_date: dateString.nullable().optional(),
    quantity: z
      .preprocess((v) => typeof v === "string" && !v.trim() ? null : v,
        z.coerce.number().finite().nonnegative().nullable())
      .nullable()
      .optional(),
    unit: z.string().trim().max(40).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    barcode: z.string().trim().max(64).nullable().optional(),
    location: z.string().trim().max(60).nullable().optional(),
    opened_date: dateString.nullable().optional(),
    open_within_days: z
      .union([z.coerce.number().int().positive().max(3650), z.literal("")])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
  })
  .refine((v) => v.category !== "medicine" || v.expiry_source !== "estimated", { path: ["expiry_source"], message: "Use the printed expiry date for medicine." })
  .refine(
    (v) => !v.manufacture_date || v.manufacture_date <= v.expiry_date,
    { path: ["manufacture_date"], message: "Manufacture date must be on/before expiry" }
  );

export type ItemFormValues = z.infer<typeof itemFormSchema>;

// Shape Gemini must return. Used to validate model output server-side before trusting it.
// Nullable optionals match the model prompt (boolean | null, etc.) so one freelanced
// field cannot wipe an otherwise-good extraction.
export const extractionSchema = z.object({
  product_name: z.string().nullable(),
  brand: z.string().nullable().optional(),
  expiry_date: dateString.nullable(),
  manufacture_date: dateString.nullable().optional(),
  category: categorySchema.nullable(),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  // true when expiry_date was AI-estimated (no printed date found), so the UI can flag it.
  // null is allowed — the model prompt returns boolean | null.
  estimated: z.boolean().nullable().optional(),
  // Eligibility: only food/cosmetics/medicine are trackable; everything else is rejected.
  item_type: z.enum(["food", "cosmetics", "medicine", "unsupported"]).nullable().optional(),
  detected: z.string().max(60).nullable().optional(),
  // Visual freshness verdict for fresh UNPACKAGED perishables (raw meat/fish, eggs, loose
  // fruit & vegetables) that carry no printed date — judged from the photo.
  freshness: z.enum(["fresh", "use_soon", "spoiled"]).nullable().optional(),
  freshness_note: z.string().max(200).nullable().optional(),
});

export type Extraction = z.infer<typeof extractionSchema>;

/** Empty extraction used when the model returns unparseable output. */
export function emptyExtraction(): Extraction {
  return { product_name: null, expiry_date: null, category: null };
}

// One line item parsed from a receipt photo. Receipts rarely print expiry dates, so the
// model estimates a likely expiry from the purchase date + typical shelf life.
export const receiptItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: categorySchema.nullable(),
  expiry_date: dateString.nullable(),
  quantity: z.number().nonnegative().nullable(),
});
export type ReceiptItem = z.infer<typeof receiptItemSchema>;

export const receiptSchema = z.object({
  items: z.array(receiptItemSchema).max(50),
});

// Shape Gemini must return for an AI shelf-life estimate (used when no printed date is read).
// tips: preprocess slices to 3 — models often return 4 and used to fail the whole estimate.
export const shelfLifeSchema = z.object({
  // estimated expiry as ISO date, or null if the model can't reason about it
  expiry_date: dateString.nullable(),
  // rough confidence so the UI can flag low-confidence guesses
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  // one short human sentence explaining the basis (e.g. "Milk keeps ~7 days refrigerated")
  basis: z.string().max(160).nullable(),
  // up to 3 short, practical usage/storage tips for the scanner analysis card
  tips: z.preprocess((v) => {
    if (v == null) return v;
    if (!Array.isArray(v)) return null;
    return v
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 3);
  }, z.array(z.string().max(120)).max(3).nullable().optional()),
});

export type ShelfLife = z.infer<typeof shelfLifeSchema>;

/** Empty shelf-life estimate when the model returns unparseable output. */
export function emptyShelfLife(): ShelfLife {
  return { expiry_date: null, confidence: null, basis: null };
}

// Product identity resolved from a barcode (Open Food Facts). Dates never come from here.
export type ProductLookup = {
  found: boolean;
  barcode: string;
  name: string | null;
  brand: string | null;
  size: string | null; // package size from the product DB, e.g. "1 L", "500 g"
  category: import("@/types/database").Category | null;
  image_url: string | null;
  // false when the resolved product is clearly NOT an expiry item (electronics, books…)
  supported?: boolean;
};
