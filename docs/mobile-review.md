# Mobile and scanning review

## Changes

- Label scans preserve readable printed dates, including dates already in the past. Missing dates stay blank for the user to enter; the scanner no longer automatically substitutes a shelf-life guess or photo freshness verdict.
- Local OCR distinguishes expiry labels from manufacture labels, rejects impossible calendar dates, and handles ISO, Indian day/month/year, named-month, and month/year dates. Month/year uses the last day of that month. Unlabelled dates are not assumed to be expiry dates.
- Receipt review validates every row before saving one batch, displays row errors, and never silently skips invalid products.
- Label and receipt scanning share camera/upload controls. Camera streams acquired after navigation are stopped, preview URLs are released, the same photo can be selected again, and oversized uploads are rejected before a request.
- Common form controls have larger touch targets and mobile inputs use 16px text to avoid iPhone focus zoom. Scanner copy uses plain language.
- Shopping-list delete/clear operations keep items visible until the database confirms success; failed requests no longer make products appear deleted. Filtered inventory results distinguish “No matching items” from an empty inventory.
- The public FAQ no longer incorrectly describes server-side label OCR as on-device processing.

## Verified in the cloud

- `npm test`: regression coverage for calendar parsing, complete receipt validation, and the real scan route with mocked authentication/recognition adapters. External image recognition accuracy is not established by these tests.
- `npm run lint`, `npx tsc --noEmit --incremental false`, and `npm run build`.
- The public production landing page responds successfully via verified HTTPS. Additional route checks are recorded in the task report.

## Still requires direct testing

- Signed-in create/edit/delete, dashboard counts, search/filtering, shopping-list persistence, and account settings.
- Real camera permissions and switching on Android Chrome/iPhone Safari, poor-light photos, HEIC photos, barcode recognition, Gemini extraction, and Tesseract worker/language downloads in the deployed runtime.
- Clerk/Supabase integration, RLS isolation, email deduplication, push delivery, and scheduled reminders. Use a disposable test account and development data.
- Automated live visual review: Chromium does not trust the cloud proxy CA. No certificate checks were disabled.

## Next improvements to prioritize

1. Improve scan setup for nontechnical users: make automatic recognition the normal path and move engine selection behind advanced settings.
2. Make reminders verifiable with a delivery-status indicator and an explicit test-reminder action once delivery can be tested.

Barcode and receipt flows still offer clearly labelled shelf-life estimates; those are not batch-specific printed expiry dates. No production credentials or customer records are included in these tests.
