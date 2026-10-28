import { itemFormSchema } from "./validators";
import type { Category } from "@/types/database";

export type ReceiptRow = { name: string; category: Category; expiry: string; qty: string; source?: "manual" | "estimated" | "printed" | "unknown" };

/** Validate the entire receipt before issuing a single insert. */
export function prepareReceiptRows(rows: ReceiptRow[], userId: string) {
  const valid: Record<string, unknown>[] = [];
  const errors: Record<number, string> = {};
  for (const [index, row] of rows.entries()) {
    const parsed = itemFormSchema.safeParse({
      name: row.name,
      category: row.category,
      expiry_date: row.expiry,
      quantity: row.qty,
      expiry_source: row.source ?? "manual",
    });
    if (parsed.success) valid.push({ ...parsed.data, user_id: userId, expiry_confirmed_at: new Date().toISOString() });
    else errors[index] = parsed.error.issues[0]?.message ?? "Check this item’s details.";
  }
  // Never hand the caller a partial batch that could silently lose invalid rows.
  return { valid: Object.keys(errors).length ? [] : valid, errors };
}
