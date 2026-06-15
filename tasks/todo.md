# Wave 1: scan-first dashboard + UI fixes + top scanning features

Decisions (2026-06-15): rear camera + flip button; scan-first screen, camera-on-tap (no auto-open). English only.

## Plan (Wave 1)
- [ ] 1. Scan-first dashboard: big centered Scan/Barcode entry; camera on tap; inventory summary below
- [ ] 2. Camera: rear (environment) default + flip-to-front button in scanner(s)
- [ ] 3. Receipt scanning → bulk add (Gemini multi-item + per-item AI expiry) → editable list → bulk insert
- [ ] 4. Re-scan barcode = increment existing quantity (offer +1 vs add new)
- [ ] 5. Auto-attach Open Food Facts product image to the item
- [ ] 6. UI audit + fix padding/alignment/overlap across pages
- [ ] 7. Verify build + live; commit + push

## Later waves (acknowledged, not this turn)
- Inventory depth: storage locations, opened-date/PAO, batch tracking, household sharing
- Email digest (weekly + insight) via cron/edge fn; auto shopping list; PWA + web push

## Review (Wave 1 — DONE, live)
- **Scan-first dashboard**: `components/scan-hub.tsx` (Barcode/Photo/Receipt/Manual chooser) is now the top of `/dashboard` and is the whole of `/items/new`. Camera opens on tap (chosen behaviour). Inventory stats + expiring list moved below. Removed old `add-item-tabs.tsx`.
- **Camera**: rear (environment) default + flip-to-front button in `scan-uploader`, `barcode-scanner` (native path), and new reusable `image-capture.tsx`.
- **Receipt → bulk add**: `geminiExtractReceipt` + `/api/receipt` + `receipt-scan.tsx` (editable rows, per-row AI-estimated expiry, bulk insert, skips rows missing a date). `receiptSchema` added.
- **Re-scan = increment**: `barcode-add.tsx` queries existing item by barcode → offers "Add +1 to existing" vs "Add as new".
- **Auto product image**: barcode flow stores the Open Food Facts image URL in `image_url`; `externalImageUrl()` helper renders thumbnails in item-row, detail header, and the confirm form (private storage paths still skipped — need signed URLs, a later polish).
- **UI fixes**: unified thumbnail/tile sizes (40px), landing mobile menu now anchors `top-full` (correct when scrolled), receipt row controls aligned.

Verification: build clean (type+lint); OFF lookup verified live (Nutella); deployed; public pages 200; `/api/receipt|lookup|estimate` all 401 unauth; `/dashboard` 307. Visual QA still blocked by sandbox preview networking — user to eyeball signed-in on mobile.

## Next waves (not yet done)
- Inventory depth: storage locations, opened-date/PAO, batch tracking, household sharing
- Email digest (weekly + insight) via Supabase cron/edge fn; auto shopping list; PWA + web push
