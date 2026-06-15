// Minimal hand-written DB types. Regenerate with `npm run types` once linked to the
// Supabase project for the full generated version.

export type Category =
  | "food"
  | "medicine"
  | "cosmetics"
  | "documents"
  | "warranty"
  | "subscription"
  | "other";

export type ReminderType = "d30" | "d15" | "d7" | "d3" | "d1";

export interface Item {
  id: string;
  user_id: string;
  name: string;
  category: Category;
  expiry_date: string; // YYYY-MM-DD
  manufacture_date: string | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  barcode: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export type ItemInsert = Omit<Item, "id" | "created_at" | "updated_at">;
export type ItemUpdate = Partial<Omit<Item, "id" | "user_id" | "created_at" | "updated_at">>;
