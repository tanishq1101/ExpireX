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

  const initial: ItemFormInitial = {
    name,
    category: ex.category ?? undefined,
    expiry_date: ex.expiry_date ?? undefined,
    manufacture_date: ex.manufacture_date ?? undefined,
    quantity: ex.quantity ?? undefined,
    unit: ex.unit ?? undefined,
    ...extra,
  };

  const notice = ex.estimated
    ? "The expiry was AI-estimated (no printed date found) — please confirm or adjust it."
    : undefined;

  return { initial, notice };
}
