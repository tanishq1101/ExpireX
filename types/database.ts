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
  location: string | null;
  opened_date: string | null;
  open_within_days: number | null;
  effective_expiry: string; // DB-generated: soonest of expiry_date and opened+within
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

// effective_expiry is DB-generated, so it is never inserted/updated directly.
export type ItemInsert = Omit<Item, "id" | "created_at" | "updated_at" | "effective_expiry">;
export type ItemUpdate = Partial<
  Omit<Item, "id" | "user_id" | "created_at" | "updated_at" | "effective_expiry">
>;

export interface ShoppingItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  source: "manual" | "auto";
  item_id: string | null;
  checked: boolean;
  created_at: string;
}
