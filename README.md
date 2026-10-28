# Expire X

Expiry tracking with Clerk authentication, Supabase RLS, label/receipt extraction, shopping suggestions, private images, CSV export, email reminders and browser push. Next.js 15 / React 19. Node 22+ recommended.

## Local development

```sh
npm ci
cp .env.example .env.local
# Fill in your development project keys.
npm run dev
```

Configure Clerk's Supabase integration and add the Clerk domain in **Supabase → Authentication → Third-party Auth**. The app passes the native Clerk session token to Supabase. Row ownership uses `auth.jwt()->>'sub'`, not a Supabase `auth.users` record.

The server requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. The service key stays server-only: verified profile sync, shared quotas, vetted catalog caching and delivery workers need it. Inventory CRUD continues to use the user's RLS client.

Optional features:

- `GEMINI_API_KEY`: image/receipt extraction and shelf-life estimates. Label fallback OCR runs on the server using bundled Tesseract language data; both paths need an internet connection from the browser. Label extraction never fills an unreadable printed date with an estimate. Medicine estimates are disabled.
- `RESEND_API_KEY` and `RESEND_FROM`: Next.js welcome email. Set the same keys in Supabase function secrets for reminders/digests.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: browser push. The public key must match the private key; generate them with `npx web-push generate-vapid-keys` using the installed CLI.
- `CRON_SECRET`: long random shared secret in Next.js and function secrets. Do not commit the real value in SQL templates.
- `CLERK_WEBHOOK_SIGNING_SECRET`: signed account updates/deletion. Set the Clerk endpoint to `/api/webhooks/clerk` and subscribe to `user.created`, `user.updated`, `user.deleted`.

Clerk production branding, allowed domains, production keys and the webhook subscription must be configured in Clerk before release. Source changes cannot switch a development Clerk instance into production.

## Database setup and upgrades

**Existing installations through migration 0008:** back up and apply only `supabase/migrations/20261028100447_reliability_and_date_provenance.sql` before deploying this app. Test it in staging first. It:

- Adds date provenance/revisions and a service-only delivery ledger.
- Adds push UPDATE policies and explicit API grants; restricts recipient writes to trusted Clerk sync.
- Keeps the oldest shopping reference and detaches redundant references as manual rows, preserving all quantities, names, notes and checked state.
- Removes old user-contributed catalog entries and resets legacy confirmation counts. New confirmations count vetted public identities once per account; personal product names/photos are never contributed.
- Adds shared quotas, worker candidate RPCs and deleted-account tombstones.

Existing accounts must sync from verified Clerk profiles (next app load or verified `user.updated` webhook) before receiving reminder emails. This prevents trusting email addresses previously editable through the database API. Existing welcome emails are suppressed during rollout rather than resent. Existing expiry dates are marked `unknown`; the migration does not pretend they were printed dates.

**Fresh Supabase project:** run `supabase/bootstrap.sql` once, then these SQL files in order:

1. `0001_rls_and_storage.sql`
2. `0003_barcode.sql`
3. `0005_shopping_list.sql`
4. `0006_location_opened_push.sql`
5. `0007_user_settings.sql`
6. `0008_barcode_catalog.sql`
7. `20261028100447_reliability_and_date_provenance.sql`

Run the cron templates separately after configuring secrets and deploying the functions. Never run the bootstrap against an existing installation. The bootstrap keeps RLS enabled while setup is incomplete. The local PostgreSQL regression suite exercises this same bootstrap/migration sequence.

`prisma/schema.prisma` is a reference for tables/columns, not a complete deployment mechanism. Generated columns, policies, grants, triggers, function permissions and cron configuration are maintained in SQL. Do not use `prisma db push` or blindly apply a generated diff over this schema: it cannot preserve those operational rules. Prisma is not used at runtime.

## Reminder operations

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy reminders --no-verify-jwt --import-map supabase/functions/deno.json
supabase functions deploy weekly-digest --no-verify-jwt --import-map supabase/functions/deno.json
supabase secrets set RESEND_API_KEY=re_REPLACE RESEND_FROM='Expire X <reminders@example.com>' CRON_SECRET=REPLACE
```

Enable `pg_cron` and `pg_net`. For a new project, fill in and run `0002_cron.sql` and `0004_weekly_digest_cron.sql` privately. Then run `supabase/tests/upgrade_cron.sql` to upgrade existing jobs to hourly retries while preserving their URL/secret commands. These templates are operational steps; do not replay old schema migrations on an existing database.

Email stages cover 30, 15, 7, 3, 1 and 0 days, plus one overdue stage within 7 days. Late additions or missed runs use the current stage; they do not replay every older stage. Weekly digests send at most once per Kolkata-calendar ISO week when actionable. Both honor email opt-out. Times use the India calendar date; hourly jobs currently have no per-user quiet-hours setting.

Delivery keys contain the item, expiry revision/date and stage. Atomic leases prevent overlapping workers from claiming the same send; provider idempotency keys protect email retries within Resend's 24-hour window. Retries stop at 23 hours and become `uncertain` for manual inspection. Push has no provider idempotency guarantee, so ambiguous failures/stale leases become `uncertain` immediately. Do not blindly reset these records: first check the provider. `sent` means the provider accepted the request, not that the recipient opened it.

Inspect `notification_deliveries` using the service role: `status`, `attempts`, `last_error`, `sent_at`. It contains private payloads and is inaccessible to browser roles. Functions return a non-success response for partial failures. Completed work is filtered in SQL so subsequent invocations can advance after timeouts. Supabase response caps are handled with keyset pagination.

Vercel runs `/api/push/run` daily using `Authorization: Bearer <CRON_SECRET>`. The route also accepts `x-cron-secret`; an external hourly scheduler can call it if desired. Duplicate invocations are safe through the ledger. Keep the same cron secret on both sides.

## User-facing additions

- **Needs attention:** Today / Next 7 days / Overdue, ahead of the dashboard scanner. Links preserve the corresponding inventory filter and export.
- **Add another batch:** available from an item or repeated barcode. Copies product identity/location, clears batch dates/opened state, and saves separately. Private photos are not shared between independently deletable batches.
- **Calendar reminder:** a per-item `.ics` download for documents, warranties and subscriptions, with a stable UID, revision sequence, an all-day expiry event and a one-day alarm. Downloads are snapshots. Calendar import/update behavior depends on the user's calendar.
- Saved date source remains visible in inventory and reminders. Receipt review reports omitted extraction rows and requires acknowledgement. Uploaded private images use 15-minute signed previews without changing stored paths.

## Account deletion

A verified `user.deleted` webhook first records a tombstone that prevents stale sessions from reading/writing user data, then removes inventory, shopping entries, push subscriptions, notification records, confirmations and all image pages. Failures return 503 for webhook retry; replay the event in Clerk if retries expire. `deleted_accounts.cleaned_at` confirms completion. A minimal deleted-account identifier remains to prevent stale-token recreation. The webhook signature is always verified; an unconfigured endpoint returns 503.

## Checks

```sh
npm test                 # PostgreSQL migrations/RLS + route and helper regressions
npm run typecheck
npm run typecheck:jobs   # shared scheduled-job code, normally excluded by Next
npm run lint
npm run test:ocr         # actual local OCR worker, two controlled fixtures
npm run build
npm audit
```

GitHub Actions runs these checks. Unit/route tests use controlled network/auth adapters; PostgreSQL tests run in PGlite. They do not prove production RLS configuration, email/push delivery, real camera accuracy, or authenticated browser behavior. Before releasing, test those with a disposable staging account and verify both opted-in and opted-out users. See `docs/reliability-release.md` for rollout details.
