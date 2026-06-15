import { z } from "zod";
import { CATEGORIES } from "./status";

export const categorySchema = z.enum(CATEGORIES);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date");

// Form payload (what the Add/Edit + confirm-before-save form validates).
export const itemFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    category: categorySchema,
    expiry_date: dateString,
    manufacture_date: dateString.nullable().optional(),
    quantity: z
      .union([z.coerce.number().nonnegative(), z.literal("")])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    unit: z.string().trim().max(40).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    barcode: z.string().trim().max(64).nullable().optional(),
  })
  .refine(
    (v) => !v.manufacture_date || v.manufacture_date <= v.expiry_date,
    { path: ["manufacture_date"], message: "Manufacture date must be on/before expiry" }
  );

export type ItemFormValues = z.infer<typeof itemFormSchema>;

// Shape Gemini must return. Used to validate model output server-side before trusting it.
export const extractionSchema = z.object({
  product_name: z.string().nullable(),
  expiry_date: dateString.nullable(),
  category: categorySchema.nullable(),
});

export type Extraction = z.infer<typeof extractionSchema>;

// Shape Gemini must return for an AI shelf-life estimate (used when no printed date is read).
export const shelfLifeSchema = z.object({
  // estimated expiry as ISO date, or null if the model can't reason about it
  expiry_date: dateString.nullable(),
  // rough confidence so the UI can flag low-confidence guesses
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  // one short human sentence explaining the basis (e.g. "Milk keeps ~7 days refrigerated")
  basis: z.string().max(160).nullable(),
});

export type ShelfLife = z.infer<typeof shelfLifeSchema>;

// Product identity resolved from a barcode (Open Food Facts). Dates never come from here.
export type ProductLookup = {
  found: boolean;
  barcode: string;
  name: string | null;
  brand: string | null;
  category: import("@/types/database").Category | null;
  image_url: string | null;
};
