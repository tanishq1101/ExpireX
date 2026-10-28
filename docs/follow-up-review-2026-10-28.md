# Follow-up review — 28 October 2026

Implementation follow-up: see [reliability release notes](reliability-release.md) for the resulting changes, verification and rollout requirements. This document records the findings before implementation.

## Recommendation

Prioritize reminder reliability, consent, and trustworthy saved dates before adding more AI features. The weakest assumption is that a passing build and happy-path tests establish that scheduled reminders reach every eligible user. Current tests do not establish that.

This is a local source review, supplementing `docs/platform-review.md`. No application code, production configuration, database records, or migrations were changed.

## Fix first: confirmed source-level gaps

| Priority | Evidence | Failure scenario and minimal direction |
| --- | --- | --- |
| High | `supabase/functions/weekly-digest/index.ts:114` selects only `users(email)`; line 130 checks only for an email. | A user who disables email reminders remains eligible for weekly digests. Include and honor `email_reminders_enabled`, with opt-out regression coverage. |
| High | `supabase/functions/reminders/index.ts:118–132` sends before inserting its unique log. | Two overlapping runs can both read no log and both send; the later unique constraint cannot undo delivery. Claim work atomically and use provider idempotency with an expiry-revision key. Also add catch-up rules: exact offsets miss late additions/outages, and the existing item/type key suppresses reminders after renewal. |
| High | Reminder and digest item queries, push item query, and push subscription query have no pagination. | Once a query exceeds the configured Supabase response cap, users/items/devices beyond that response are omitted. The digest's cap applies across the entire service, not per user. Use stable paginated reads and bounded processing batches; verify against a deliberately small cap. The deployed cap was not inspected. |
| High | `supabase/migrations/0008_barcode_catalog.sql:62` grants authenticated callers the definer RPC; `app/api/catalog/confirm/route.ts` accepts arbitrary product metadata without checking a saved item. | Callers can seed shared product identity and inflate confirmation counts. Restrict RPC execution to the server role and validate contributions against owned saved records. Prefer caching vetted external product metadata; ownership alone does not make a user's custom name public catalog data. |
| High | Reminder HTML interpolates `opts.itemName`; digest HTML interpolates `it.name`; welcome HTML interpolates a Clerk first name. | User-controlled strings can alter email markup or insert deceptive links. Escape text at each HTML boundary. This is an HTML-injection finding, not a claim that mail clients execute scripts. |
| Medium | `components/item-form.tsx:160–171` uploads before saving, with no compensating deletion and no old-image cleanup. | Failed saves/retries leave orphan uploads; successful image replacement leaves the previous private image stored. Remove a newly uploaded object on a confirmed failed save; remove the old private object after confirmed replacement. Handle ambiguous network outcomes by reconciling the saved row before deleting referenced files. |
| Medium | `components/shopping-client.tsx:74–85` does not mark suggestion insertion busy; `0005_shopping_list.sql` has no matching uniqueness constraint. | Repeated clicks or two tabs can insert the same suggested inventory item more than once. Disable that row while pending and add a partial unique index for `(user_id, item_id)` where `item_id IS NOT NULL`, after resolving existing duplicates. Allow repeated manual names. |
| Medium | `components/shopping-client.tsx:88–96` permits overlapping optimistic toggles. | Requests can finish out of order, leaving the checkbox inconsistent with the database; an older failed request can revert a newer state. Serialize mutations per row and test reordered success/failure responses. |
| Medium | `app/(app)/shopping/page.tsx:27` limits candidates to 50 before excluding items already on the shopping list. | If those 50 are already listed, suggestions become empty even when later eligible items exist. Exclude existing entries before limiting, or fetch further pages until the visible suggestion limit is filled. |
| Medium | `services/gemini/index.ts:263–297` salvages valid receipt rows and caps output at 50; `/api/receipt` returns only the resulting rows. | Invalid or excess model rows disappear without a warning. The later form validates every displayed row, but cannot show rows already dropped. Return extraction warnings/counts and require review; do not imply the whole receipt was captured. |
| Medium | `app/(app)/layout.tsx:12–31` picks `emailAddresses[0]`, ignores user-sync errors, and launches an unawaited welcome send. | The selected email need not be the Clerk primary address. Failed sync can leave reminders without a current recipient; concurrent first loads can schedule multiple welcomes. Use the primary verified address and explicit sync error handling; persist welcome delivery state if one-time delivery matters. |
| Medium | `app/(app)/items/[id]/page.tsx` ignores the query error and calls `notFound()` for any missing data. | A database outage/session-token problem is presented as a missing item. Distinguish an absent or unauthorized row from an operational failure and offer retry. |

Previously documented gaps remain in source: push refresh lacks an UPDATE RLS policy; push save/delete failures are suppressed in settings; barcode quantity merging retains an old batch date and can lose concurrent increments; private uploaded image previews are absent; date provenance is not persisted; account-deletion cleanup is not implemented in this repository. External configuration could affect deletion behavior and was not inspected.

## Small features worth adding

1. **Today / next 7 days view:** use existing inventory filters, show urgent items before the scan chooser, and link directly to edit. Low schema cost; improves repeat use.
2. **Add another batch:** copy product identity and storage location, require a fresh expiry, and keep the purchase separate. Prefer this over silently adding quantity to an old expiry batch.
3. **Calendar export (`.ics`):** start with one document, warranty, or subscription. Useful without calendar-account permissions; use stable event IDs and explain that a downloaded file will not automatically track edits.

Add **Used / discarded / renewed with undo** after a deliberate status/history migration. It is valuable, but larger than a button: inventory queries and reminder jobs must exclude resolved records consistently. Likewise, a test-reminder action and delivery history should follow durable delivery handling.

Defer household sharing, full offline synchronization, more AI helpers, recipes, and waste/savings dashboards. Sharing needs a permissions model; offline edits need conflict resolution; savings metrics need real outcome history. None justifies a rewrite or another service now.

## Verification

- `npm test`: all 42 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed, including static generation and route compilation.
- No authenticated browser, production RLS, actual email/push delivery, external OCR accuracy, or real-device camera verification was performed.
- The Deno edge functions are outside the normal application lint/typecheck commands. Passing those commands does not validate the scheduled jobs. Add dedicated handler tests with fake database/email adapters plus staging integration tests for RLS, pagination, opt-out, overlapping runs, and retries.
- No fresh dependency audit was performed. The previous review's dependency and production-auth observations should be rechecked before release rather than treated as current verified results.

Implement in this order: email consent/HTML escaping and catalog permissions; reminder idempotency/pagination; push persistence and batch entry; image/shopping fixes; then the small feature shortlist. Add focused regressions alongside each fix and CI for the existing checks.
