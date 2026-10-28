import type { Item } from '../types/database';
import { isCalendarDate } from './calendar-date';
const escapeText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r?\n|\r/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
/** RFC 5545 limits content lines to 75 octets, folding without splitting UTF-8. */
export function foldLine(line: string) {
  const lines: string[] = [];
  let current = '', bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) { lines.push(current); current = ' '; bytes = 1; }
    current += char; bytes += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}
export function itemCalendar(item: Pick<Item, 'id' | 'name' | 'effective_expiry' | 'updated_at' | 'expiry_revision'>) {
  if (!isCalendarDate(item.effective_expiry)) throw new Error('Invalid calendar date');
  const stamp = new Date(item.updated_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const next = new Date(`${item.effective_expiry}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Expire X//Expiry reminder//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${item.id}@expire-x.tanishqsinha.in`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`, `SEQUENCE:${item.expiry_revision ?? 1}`,
    `DTSTART;VALUE=DATE:${item.effective_expiry.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`,
    `SUMMARY:${escapeText(`${item.name} expires`)}`, 'DESCRIPTION:Review the date in Expire X. This download does not sync future edits.',
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Expiry reminder', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].map(foldLine).join('\r\n');
}
