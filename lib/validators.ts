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
