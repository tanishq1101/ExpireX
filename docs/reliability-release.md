# Reliability fixes and small features — 28 October 2026

## Implemented

| Review finding | Result |
| --- | --- |
| Weekly digest ignores consent | Digest and reminder candidates require opt-in; the handler rechecks consent. Browser users can change consent, while recipient addresses come only from verified Clerk profiles. |
| Reminder duplication, renewal and catch-up | Private delivery records have atomic leases, immutable retry payloads, provider idempotency keys and expiry revision/date keys. Current-window catch-up includes expiry day and one overdue reminder within 7 days. Ambiguous sends have an explicit state. |
| Response caps and large scheduled runs | Keyset pagination covers users, items and devices. SQL excludes completed stages before fetching candidates, so a later invocation can reach remaining work. Digest summaries count all inventory while limiting email detail to the earliest 50, with an explicit notice. |
| Shared-catalog poisoning/privacy | Confirmation accepts only a saved item ID, verifies ownership, counts a vetted external identity once per account, and sends no personal names/photos. The definer RPC is revoked from browser roles. Old user-contributed catalog entries are removed by the migration. |
| Email HTML injection | Reminder, digest and welcome templates escape untrusted text. Tests include injected links. |
| Orphan images and false saves | Definitive failed saves clean new unreferenced uploads. Ambiguous saves retain the staged object and stable item ID for retry. Successful replacement cleans the old unreferenced private image. Zero-row updates are failures. Network/storage outages can still delay cleanup; account deletion retries all image pages. |
| Duplicate shopping suggestions and racing toggles | Synchronous mutation locks prevent overlapping operations; checkbox state changes after a confirmed update. A partial unique index prevents cross-tab duplicate inventory references. Upgrades preserve redundant shopping rows as manual entries, including quantity, notes and checked state. |
| Shopping suggestions starve after the first 50 | Candidates are paged and excluded against the shopping list before filling the visible 50 suggestions. The shopping list itself is paginated during loading. |
| Receipt extraction omissions | The response includes detected/omitted counts and warnings. Review requires acknowledgement when rows were omitted. Invalid dates remain blank for correction. |
| User sync / welcome | Uses the primary verified address, timestamps Clerk sync to prevent stale updates, reports sync failure, awaits welcome sending and records one-time delivery. Legacy accounts are not sent another welcome on upgrade. |
| Item query errors appear as 404 | Operational errors reach a retryable page boundary. A genuinely absent/RLS-hidden item remains 404. |
| Push refresh, ownership and hidden failures | Owner-only UPDATE policy, bounded key/endpoint validation, shared save quota, HTTPS push-provider allowlist, explicit refresh/delete errors and account-aware browser state. Sign-out detaches the local subscription. Push content is generic rather than exposing product names on a shared device. |
| Private image previews | Authorized short-lived signed URLs are display-only. Stored paths remain unchanged. |
| Date provenance | Printed/manual/estimated/unknown source and confirmation time persist; inventory, CSV and notifications distinguish estimates. Medicine estimates are rejected. |
| Account deletion | Signed Clerk handler, tombstone policies, serialized sync/deletion, retryable row/storage cleanup and completion timestamp. Browser roles cannot invoke cleanup or inspect private payloads. |
| Quotas, payload limits and timeouts | Shared atomic Postgres quotas replace instance-local counters. JSON/multipart bodies are bounded while streaming. AI output/tokens are bounded and transient retries have a request timeout. |
| Documentation, accessibility and dependencies | README/environment setup updated; fresh-project bootstrap and rollout instructions added; nested link/button controls removed from navigation/landing; settings dialog traps/returns focus; status has visible text on mobile. Zod upgraded to 4, compatible dependency patches applied, and CI added. |

## Added features

1. **Needs attention:** Today, Next 7 days and Overdue views before the dashboard scanner. Each links to the matching inventory/export filter.
2. **Add another batch:** copy identity/location and ask for a fresh expiry. Repeated barcode scans offer this instead of unsafe quantity merging.
3. **Calendar export:** authenticated, per-item `.ics` for documents, warranties and subscriptions, with stable UID, revision sequence, all-day event and one-day alarm. Calendar files are snapshots, not a sync connection.

Used/discarded/renewed history, household sharing, offline editing, additional AI helpers and analytics remain deferred as recommended in the review. There is no fabricated usage/savings history.

## Rollout order

1. Back up the database and test the new migration against a staging copy. Apply `20261028100447_reliability_and_date_provenance.sql` before the updated app and functions. Do not replay earlier schema files on an existing project.
2. Deploy the app and both updated Edge Functions, using `supabase/functions/deno.json` as their import map. Keep their existing cron-secret gate; do not expose service keys to clients.
3. Configure the signed Clerk webhook for created/updated/deleted users, including `CLERK_WEBHOOK_SIGNING_SECRET`. Use production Clerk keys/branding/redirect domains for the real domain. Configure Resend sender/key and VAPID keys in their documented runtimes.
4. Run `supabase/tests/upgrade_cron.sql` for hourly email/digest retries. The Vercel push schedule remains daily; an hourly scheduler can call the same protected endpoint without changing Vercel plan requirements.
5. Resync existing users from verified Clerk data before expecting reminder email. First app load and verified user-update webhooks do this. The migration intentionally stops trusting addresses that clients previously could edit.
6. With two disposable staging accounts, check create/edit/image replacement, Today/week/overdue filters, batch creation with cleared dates, calendar download/import, receipt warnings, shopping double clicks, push refresh/off/sign-out, email opt-out, changed primary email, overlapping cron runs and account-deletion retries. Inspect delivery status and the provider dashboard. Do not test by sending to customer records.

The new migration removes untrusted shared catalog contributions and resets legacy confirmation counts. It does not remove personal inventory. Duplicate shopping data is retained as manual rows. Existing expiry source is `unknown` until reviewed.

`uncertain` deliveries require operator inspection; resetting them without checking the provider can duplicate a send. `sent` records mean provider acceptance, not inbox/browser presentation. The email provider's idempotency retention is finite; automatic retries stop before that window ends. The tombstone intentionally retains a minimal deleted-account identifier to block stale sessions.

## Verification

- 76 regression tests passed, including actual PostgreSQL bootstrap/migrations/RLS, overlapping claims, cross-user restrictions, shared quotas, upgrade preservation, signature verification, capped-page handlers, consent, retries, storage failures and calendar escaping.
- App and shared-job TypeScript checks, ESLint, production build and `git diff --check` passed.
- Actual Deno checks passed for both Edge Function entry points using the pinned Supabase module/import map.
- The actual Tesseract worker passed both printed-expiry and manufacture-only fixtures.
- Prisma reference schema validated using placeholder local URLs; no production connection was made.
- Dependency audit after compatible patches: zero reported vulnerabilities. This is not a penetration test or a claim that all deployed configuration is secure.

No production migration, deployment, Clerk configuration, real reminder delivery, or authenticated browser/camera check was performed. Local route tests use controlled network/auth adapters; PGlite verifies database semantics without connecting to customer data. Follow the staging checks above before releasing.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys), [Clerk webhook verification](https://clerk.com/docs/guides/development/webhooks/syncing).
