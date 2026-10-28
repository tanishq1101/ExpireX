import type { Item } from "../types/database";

/** Quote CSV values and prevent spreadsheet formula execution in user-provided text. */
export function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  const safe = /^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function inventoryCsv(items: Item[]): string {
  const columns: (keyof Item)[] = ["name", "category", "expiry_date", "effective_expiry", "expiry_source", "quantity", "unit", "location", "opened_date", "open_within_days", "notes", "barcode"];
  return "\uFEFF" + [columns.map(csvCell).join(","), ...items.map((item) => columns.map((key) => csvCell(item[key])).join(","))].join("\r\n");
}
