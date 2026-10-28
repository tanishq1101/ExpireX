import { receiptItemSchema, type ReceiptItem } from './validators';
import { isCalendarDate } from './calendar-date';
export type ReceiptExtraction = { items: ReceiptItem[]; warnings: string[]; detected_count: number; omitted_count: number };

export function parseReceiptExtraction(raw: string): ReceiptExtraction {
  if (raw.length > 100000) throw new Error('Receipt output is too large');
  const parsed: unknown = JSON.parse(raw);
  const rows: unknown[] = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items) ? (parsed as { items: unknown[] }).items : [];
  const items: ReceiptItem[] = [];
  let omitted = 0;
  for (const row of rows) {
    if (items.length >= 50 || !row || typeof row !== 'object') { omitted++; continue; }
    const r = row as Record<string, unknown>;
    const result = receiptItemSchema.safeParse({
      name: typeof r.name === 'string' ? r.name.trim().slice(0, 200) : '',
      category: typeof r.category === 'string' ? r.category : null,
      expiry_date: typeof r.expiry_date === 'string' && isCalendarDate(r.expiry_date) ? r.expiry_date : null,
      quantity: typeof r.quantity === 'number' && Number.isFinite(r.quantity) && r.quantity >= 0 ? r.quantity : null,
    });
    if (result.success) items.push(result.data); else omitted++;
  }
  return { items, detected_count: rows.length, omitted_count: omitted, warnings: omitted ? [`${omitted} receipt row${omitted === 1 ? ' was' : 's were'} omitted because of invalid data or the 50-item limit. Compare with your receipt and add missing items manually.`] : [] };
}
