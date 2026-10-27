# ExpireX platform review

Reviewed on 27 October 2026 against https://expire-x.tanishqsinha.in/ and repository commit `102d486`.

## Recommendation

Make trustworthy dates, dependable reminders, and fast inventory entry the product's priorities. More AI features will not help if a guessed date looks authoritative or a reminder can silently fail. Keep the existing Next.js, Clerk and Supabase architecture; a rewrite is unnecessary for the current requirements.

The workspace already contained the requested GitHub clone. Two newer upstream commits were fetched and integrated before these improvements. Existing untracked user files were preserved. The implementation was prepared on `codex/platform-review`; release status is recorded in GitHub and Vercel.

## What was inspected

- Live landing page, sign-in, FAQ, contact, privacy and terms pages, including their visible navigation and content.
- Signed-out `/dashboard` access redirects to sign-in. The browser had no authenticated app session.
- Source for inventory CRUD, filters, dashboard, shopping list, scanners, receipt review, settings, API routes, image storage, notifications, database policies, deployment configuration and dependencies.
- Existing upstream OCR/date/receipt fixes were retained. This review does not claim those as newly implemented changes.

Authenticated persistence, real phone camera behavior, production RLS, deployed cron execution, AI recognition accuracy and actual email/push delivery were not verified. This was not a complete penetration test or a measured accessibility conformance audit. The 21st review skill guided the UI review; its CLI and a project design manifest were unavailable.

## Implemented improvements

| Area | Change and purpose |
| --- | --- |
| Inventory navigation | Added 24-item pagination with exact result counts and stable ordering. Added expiry, newest and name sorting. |
| Filtering | Search submits the complete filter set instead of navigating on every keystroke. Filters reset pagination, have a clear action, and remain represented in the URL. SQL wildcard characters are escaped so a literal `%` or `_` search behaves as typed. Repeated query parameters are handled safely. |
| Export | Added authenticated, filtered CSV export using the user's existing Supabase session client. Fetches batches rather than silently stopping at the database row cap. Limits exports to 5,000 items with an explicit error, disables caching, and escapes spreadsheet formulas. The export includes inventory fields rather than account identifiers or image credentials. |
| Locations | Added a storage-location field to create/edit forms, completing the existing location filter. No database migration is needed beyond the repository's existing location migration. |
| Validation | Blank quantities remain null; explicit zero remains zero and is visible in inventory rows. Invalid saved default categories fall back safely. The opened-date preview uses existing calendar validation. Upstream strict date validation was preserved. |
| Medicine dates | The estimate endpoint and local fallback no longer infer medicine expiry. Receipt medicine rows require the user to enter the printed date. Medicine forms disable the estimate helper and explain why. Existing scan-route rejection of estimated dates was preserved. AI classification/OCR can still be wrong, so this does not establish recognition accuracy. |
| Error handling | Dashboard and shopping query failures show errors instead of healthy-looking empty inventory. Failed reminder preference saves revert the toggle and show a message. Upstream shopping-delete failure handling was retained. |
| Entry performance | Scanner and entry modules load when selected. The production build reported dashboard first-load JS falling from about 261 KB to 117 KB, and new-item first-load JS from about 258 KB to 114 KB. These are build bundle figures, not measured mobile loading times. |
| Public UI | Simplified the hero copy; documented where label processing runs and which categories need manual entry. Added a way home from auth pages, Escape handling for the mobile menu, and an “Open email draft” label for the mailto contact action. |
| Maintenance | Updated Next.js and its ESLint configuration from 15.5.19 to 15.5.28. Patched Next's image/CSS dependencies and compatible source-map/nanoid packages. Updated the lint command and added a typecheck command. Welcome emails now link to the supplied production domain. |

The Next-specific dependency overrides are deliberate: the framework's declared ranges/pins otherwise retained vulnerable `sharp` and PostCSS versions. Recheck these overrides when upgrading Next.js and remove them when its normal dependency tree supplies patched versions.

## Remaining issues, in priority order

| Priority | Evidence and likely failure | Recommended next step |
| --- | --- | --- |
| High | Live sign-in shows **Development mode** and **My Application**. This is a verified visible configuration issue. | Configure a production Clerk instance, app branding and allowed redirect domains. Test sign-in, sign-up and session expiry on the real domain. |
| High | The final production dependency audit still reports Zod 3 as affected by an unbounded-validation resource-consumption advisory. The compatible framework/transitive updates removed the other audit findings. | Migrate Zod separately to a patched 4.x version, verify extraction/form behavior, and bound incoming JSON/AI output sizes. An advisory is not proof of an exploitable deployed path. |
| High | `0008_barcode_catalog.sql` grants authenticated callers a `SECURITY DEFINER` catalog-writing RPC despite the table's “service-role writes only” comment. The API also accepts user-provided product names and URLs for a shared catalog. | Restrict the RPC to the server role and verify ownership of a saved item before counting a confirmation. Keep personal item names/photos out of shared product data by default; use vetted public product identity or an explicit contribution flow. Test with two users. |
| High | Reminder checks use exact date offsets. An item added after a relevant send window or a missed cron can receive no catch-up reminder. Email deduplication uses item + reminder type rather than the expiry revision; push has no persistent delivery ledger. | Add durable notification jobs with idempotency keys including the expiry date, retries, catch-up rules and delivery status. Keep this in Postgres/cron initially; introducing another queue service is unnecessary until load requires it. |
| High | The weekly digest selects `users(email)` without `email_reminders_enabled`, so it does not honor the app's email toggle. User names/item names are interpolated into email HTML without escaping. | Honor the preference across every email job; escape text in reminder, digest and welcome templates. Verify opt-out and delivery failure behavior using a disposable test account. |
| High | Privacy copy promises associated data removal after account deletion, but no Clerk deletion webhook or explicit cleanup route appears in this repository. | Implement a verified account deletion flow covering database rows, photos and push subscriptions. Reconcile the policy with actual retention. Confirm whether external webhook configuration already exists. |
| Medium | Barcode “Add +1” updates the existing row's quantity while retaining its dates. A new purchase can be a different batch with a different expiry. | Default to a separate batch. Offer quantity merging only after confirming the same expiry and unit. Use an atomic increment if merging is retained. |
| Medium | Uploaded photos are private storage paths, while item rows and editing previews only display external HTTP URLs. | Generate short-lived signed preview URLs after authorization. Keep original storage paths in saved records; never overwrite them with expiring signed URLs. |
| Medium | The push-subscription migration lacks an UPDATE policy although the API uses upsert. Endpoint input is only checked for truthiness; deletion errors are ignored. Settings may suppress push failures. | Add bounded schemas and endpoint validation, verify device ownership, define the missing refresh policy, and show permission/save failures. Verify that signing out and switching accounts cannot leave reminders bound to the wrong user. |
| Medium | The in-memory rate limiter is per server instance and cannot enforce an account-wide budget. The shared catalog endpoint does not use it. | Use a Postgres-backed quota or shared rate store for cost-bearing actions. Add strict payload limits and request timeouts. |
| Medium | Settings/menu keyboard behavior, nested links/buttons, status color cues and small-screen form layouts need dedicated interaction tests. Escape support alone is not a complete accessibility fix. | Test keyboard focus, focus return/trapping, accessible names, contrast, 320–430 px layouts and reduced motion. Remove nested interactive controls and give status a text equivalent. |
| Medium | README, environment examples, Prisma comments and the SQL isolation checklist are partly out of step with Clerk, push, catalog and newer features. | Document all migrations and operational secrets; make a real two-Clerk-user RLS test runnable against a non-production database. Add CI for tests, lint, types and build. |
| Lower | Landing page promises “Free forever,” the FAQ says shopping can be added automatically while the UI presents suggestions, and there is no interactive public demo. | Align copy with actual behavior and funding plans. Add a clearly separated sample-data demo to let new users assess the app before account creation. |
| Lower | No sitemap/canonical/Open Graph setup appears in the main layout. Digest emails still use the older Vercel domain. | Centralize the canonical domain and email links; add public-page metadata and a sitemap. Exclude authenticated inventory from indexing and social previews. |

## Feature roadmap

### First: improve repeat use

1. **Today / next 7 days action list.** Put urgent items ahead of the scan chooser for returning users. Show the printed/effective date and actions that resolve the item.
2. **Used, discarded, renewed and archived states with undo.** Deleting everything loses useful history. Record outcomes first; only then build waste/savings metrics based on real events.
3. **Reminder preferences and delivery history.** Support per-item timing, an expiry-day reminder, overdue reminders and a test reminder. Start with the existing India timezone; add per-user timezones together with scheduler changes.
4. **Remember date provenance.** Store printed, manual or estimated source, extraction timestamp and user confirmation. Keep estimated dates visibly distinct after saving and in notifications.
5. **Batch-aware entry.** Allow “add another with the same details” while asking for the new expiry, rather than silently merging purchases.

### Second: improve portability and collaboration

6. **CSV import with preview and duplicate handling.** Export is now available; the matching import should validate all rows and let users correct errors before one batch save.
7. **Calendar export.** Offer `.ics` reminders for documents, warranties and subscriptions without requiring broad calendar-account permissions.
8. **Household sharing.** Use explicit household membership and roles with database-level access policies, rather than sharing a login. This is useful but requires a deliberate permissions model and two-user tests.
9. **Accessible onboarding and a sample inventory.** Explain barcode identity versus printed expiry, storage location, opened-product dates and reminders with a short guided first item.

### Later, when supported by usage

10. **Renewal history and recurring subscriptions.** Model recurrence explicitly, preserving old dates and reminder revisions.
11. **Offline drafts and sync.** Begin with manual drafts and retryable saves. Full offline inventory editing requires conflict resolution; a cache-only service worker would not solve it.
12. **Storage-aware suggestions and usage analytics.** Ask for actual storage/opening details; present suggestions as planning aids. Avoid camera-derived claims that a product is safe to consume.

Avoid adding recipes, broad health advice, a general chatbot, microservices or a new database before measuring whether the core reminders and inventory actions bring users back.

## Verification and limits

- `npm test`: 42 tests passed, including upstream scan/receipt regression tests and new inventory/export/estimate tests. External services and auth are controlled adapters in route tests.
- `npm run test:ocr`: the actual Tesseract worker passed printed-expiry and manufacture-only fixture checks using bundled language data. This does not establish real camera accuracy.
- `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check` all passed.
- Local production smoke test: all seven public pages returned 200; `/dashboard`, `/items`, `/items/new` and `/shopping` returned 307 to login; `/api/items/export` returned 401 while signed out. Updated hero, contact-draft label and auth return link were present. The local preview rendered successfully in the browser using Node 24 and dual-stack localhost binding; an earlier Node 26/IPv4-only preview had a localhost proxy error.
- Production dependency audit after updates: **0 critical, 1 high (Zod)**. This is a production dependency audit, not a clean bill of health for every development tool or deployed configuration.
- Browser inspection confirmed public pages and signed-out protection. No production records were created, edited or deleted, and no reminder jobs were triggered.
- No production migration or service-configuration change was performed during this review. Git publishing and deployment are separate release steps.

Before releasing, exercise create/edit/location/filter/export with a signed-in disposable account; verify page 2 and browser back navigation; disable email reminders and check persisted settings; test medicine receipt review; and check camera/delivery behavior on iPhone Safari and Android Chrome.

Dependency references: [Next.js upstream advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). The audit checks installed versions; it does not establish exploitability of this application's specific paths.
