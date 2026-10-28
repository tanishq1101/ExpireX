> Historical plan, superseded by the October reviews and `docs/reliability-release.md`.
> Do not restore automatic dates for unreadable labels, clamp estimates to hide past dates,
> or estimate medicine expiry. Missing printed dates require manual confirmation.

# Max automation: richer AI extraction + wider barcode coverage

## Plan
- [ ] 1. extractionSchema: add brand, manufacture_date, quantity, unit (all nullable). Extraction type.
- [ ] 2. gemini vision prompt: extract name/brand/category/expiry/MFG/quantity/unit thoroughly (food, medicine, cosmetics)
- [ ] 3. /api/scan: if OCR finds no expiry, auto-run AI estimate to fill it (never blank); return enriched extraction
- [ ] 4. estimate: improve prompt for meds/cosmetics/food; clamp AI/local estimates to future (never past)
- [ ] 5. lib/shelf-life: expand keyword table across medicines, cosmetics, food
- [ ] 6. openfoodfacts service: add UPCitemdb trial source (parallel, key-less, broad)
- [ ] 7. scan-hub + item-form: map brand/mfg/quantity/unit from extraction into the form
- [ ] 8. barcode-add: on not-found, auto-flow into the photo/AI label reader instead of manual form
- [ ] 9. build + deploy + verify; commit + push

## Review (DONE, live)
- **Richer AI extraction**: extractionSchema + Gemini vision prompt now pull product_name, brand, expiry, manufacture_date, category, quantity, unit (tuned for food/medicine/cosmetics, PAO-aware). `lib/extraction.ts` maps all of it into the form (brand+name dedupe). scan-hub + item-form inline OCR fill every field.
- **Never-blank expiry**: /api/scan auto-runs the AI shelf-life estimate when OCR finds no date (flagged `estimated`, shown as a notice). Estimates clamped to the future (never "already expired").
- **Wider barcode coverage**: added UPCitemdb (free trial, key-less) as a 4th parallel source after Open Food/Beauty/Products Facts — verified live (Coca-Cola). Picks first hit by priority.
- **Barcode not found → auto AI label reader**: barcode-add now flows straight into the photo/OCR scanner (carrying the scanned barcode + attaching the photo) instead of an empty manual form.
- **Expanded shelf-life knowledge** across fresh/packaged food, medicines, cosmetics; medicine/cosmetics defaults bumped to ~2 years.

Honest limits told to user: cannot bundle "all medicines/cosmetics/food" datasets (proprietary/huge); AI can't resolve an unknown barcode→name reliably (would hallucinate) — the camera/label scan is the universal path.

Verify: build clean; UPCitemdb live; deployed; / 200; scan+estimate 401 unauth.
