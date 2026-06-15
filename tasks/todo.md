# Smart inventory: barcode + OCR + AI estimate, ease-of-entry, legal/contact pages

Decisions (user, 2026-06-15): Barcode + OCR + AI shelf-life estimate; product DB = Open Food Facts (free).

## Plan
- [ ] 1. DB: add `barcode text` column to items (Supabase migration); update prisma schema + types + validators
- [ ] 2. services/openfoodfacts: fetch product by barcode → {name, brand, category, image}
- [ ] 3. services/gemini: add geminiEstimateShelfLife (expiry estimate + confidence + basis)
- [ ] 4. lib/shelf-life.ts: local fallback shelf-life table (works if Gemini fails)
- [ ] 5. API: /api/lookup (barcode→product) and /api/estimate (name+category→expiry)
- [ ] 6. components/barcode-scanner.tsx: camera scan via native BarcodeDetector + @zxing/browser fallback
- [ ] 7. Rework add-item-tabs → 3 modes (Barcode / Photo / Manual); autonomous barcode→lookup→estimate→form
- [ ] 8. item-form: barcode field, source/AI-estimate badges, "Scan date (OCR)" + "Estimate with AI", smart defaults
- [ ] 9. Legal/contact: /privacy, /terms, /contact (detailed) + shared SiteFooter; link from landing footer; middleware public
- [ ] 10. Verify: npm run build clean; manual-review the smart flow
- [ ] 11. Commit + push; then list suggested future features

## Review
All 11 steps done and live at https://expire-x-three.vercel.app.

- **DB**: `items.barcode text` added via Supabase migration (`crwwfkanhmlytayzqvyt`) + repo `0003_barcode.sql`; prisma schema, types/database.ts, validators all updated.
- **Barcode lookup**: `services/openfoodfacts` queries Open Food Facts + Open Beauty/Products Facts (free, no key). Verified live against Nutella (3017620422003) → name/brand/category/image returned correctly. `/api/lookup` (auth-gated, 401 unauth confirmed).
- **AI shelf-life**: `geminiEstimateShelfLife` + `lib/shelf-life.ts` local fallback table. `/api/estimate` tries Gemini then falls back. 401 unauth confirmed.
- **Barcode scanner**: `components/barcode-scanner.tsx` — native `BarcodeDetector` (Chrome) with dynamic `@zxing/browser` fallback (iOS/Firefox), reticle overlay, vibrate, manual-entry fallback, proper camera cleanup. Tap-to-start gate so opening "Add item" doesn't auto-prompt the camera.
- **Flow**: `barcode-add.tsx` orchestrates scan → lookup → AI estimate → prefilled confirm form. `add-item-tabs.tsx` now 3 modes (Barcode / Photo / Manual). `item-form.tsx` gained barcode chip, "Estimate expiry with AI", inline "Scan date from label" (reuses ScanUploader), unit datalist, qty default 1, notice banner.
- **Legal/contact**: `/privacy`, `/terms`, `/contact` (detailed, accurate to real data flows incl. AI-estimate disclaimer), public via middleware, `SiteFooter` + `LegalPage` wrapper, `.prose` styles, contact form via mailto. Linked from landing footer. All 200 live.
- **Landing**: added "Barcode scanning" feature + barcode copy in hero/preview.

Verification: `npm run build` clean (type-check + lint); Open Food Facts integration tested live; all public pages 200; all 3 API routes 401 unauthenticated (wired, not crashing). Visual QA still blocked by sandbox preview networking — user should test the scan flow signed-in on mobile Chrome.

Note: `CONTACT_EMAIL` in `lib/site.ts` is set to the owner's gmail so the contact form works — change to a dedicated support inbox if preferred.
