import type { Extraction } from "./validators";
import type { ItemFormInitial } from "@/components/item-form";

/** Map an AI extraction (photo OCR) into form prefill values. Fills as much as possible. */
export function initialFromExtraction(
  ex: Extraction,
  extra?: Partial<ItemFormInitial>
): { initial: ItemFormInitial; notice?: string } {
  const brand = ex.brand?.trim();
  const pname = ex.product_name?.trim() ?? "";
  const name =
    brand && pname && !pname.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} ${pname}`
      : pname;

  // Freshness verdict for fresh unpackaged perishables (meat/egg/produce), judged from the photo.
  const FRESHNESS_LABEL = {
    fresh: "Fresh ✅",
    use_soon: "Use soon ⚠️",
    spoiled: "Looks spoiled ❌",
  } as const;
  const freshnessLabel = ex.freshness ? FRESHNESS_LABEL[ex.freshness] : null;

  const initial: ItemFormInitial = {
    name,
    category: ex.category ?? undefined,
    expiry_date: ex.expiry_date ?? undefined,
    manufacture_date: ex.manufacture_date ?? undefined,
    quantity: ex.quantity ?? undefined,
    unit: ex.unit ?? undefined,
    // Pre-fill notes with the freshness observation so it's saved with the item.
    notes: freshnessLabel
      ? `Freshness at scan: ${freshnessLabel}${ex.freshness_note ? ` — ${ex.freshness_note}` : ""}`
      : undefined,
    ...extra,
  };

  const notice = freshnessLabel
    ? `Freshness check: ${freshnessLabel}${
        ex.freshness_note ? ` (${ex.freshness_note})` : ""
      }. No printed date, so the expiry is an AI estimate — a visual guide, not a safety guarantee. When in doubt, throw it out.`
    : ex.estimated
    ? "The expiry was AI-estimated (no printed date found) — please confirm or adjust it."
    : undefined;

  return { initial, notice };
}
