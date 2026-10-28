import type { Item } from '../types/database';
/** Product identity may repeat; batch-specific dates and personal photos must not. */
export function anotherBatch(item: Partial<Item>) {
  return {
    name: item.name, category: item.category, barcode: item.barcode,
    location: item.location, quantity: item.quantity ?? 1, unit: item.unit,
    image_url: /^https?:\/\//i.test(item.image_url ?? '') ? item.image_url : null,
    expiry_source: 'manual' as const,
  };
}
