-- Adds the scanned barcode to items. A barcode (EAN/UPC/QR) identifies the *product*,
-- not its dates — those still come from OCR / AI estimate / manual entry.
alter table public.items add column if not exists barcode text;
create index if not exists items_user_barcode_idx on public.items (user_id, barcode);
comment on column public.items.barcode is 'EAN/UPC/QR code scanned at entry; identifies the product (not the date).';
