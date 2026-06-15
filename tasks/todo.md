# Wave 3: weekly email digest (+insight) + auto shopping list

## Plan
- [ ] 1. weekly-digest Edge Function (Deno): per-user summary of expiring-this-week + insight stats, Resend, green theme, cron-secret gate
- [ ] 2. Deploy weekly-digest via Supabase MCP
- [ ] 3. Schedule weekly pg_cron (Mon 08:00 IST = 30 2 * * 1 UTC) + repo migration 0004
- [ ] 4. shopping_list table + RLS (MCP migration) + repo SQL 0005 + prisma + types
- [ ] 5. /shopping page: auto "suggested to buy" (from expired/expiring) + saved list (check/remove/manual add)
- [ ] 6. Nav links (desktop + mobile bottom bar) to Shopping
- [ ] 7. Build + deploy frontend + verify; commit + push

## Review (Wave 3 — DONE, live)
- **Weekly email digest + insight**: `supabase/functions/weekly-digest/index.ts` (Deno) — per-user summary of items expiring within 7 days + insight stats (total tracked / expiring this week / expired / added this week), green-themed HTML, Resend (secrets from app_config), cron-secret gated. Deployed via MCP (ACTIVE, verify_jwt=false). Only emails users with something actionable (expiring ≤30d or expired) to avoid noise.
- **Cron**: `expirex-weekly-digest` scheduled `30 2 * * 1` UTC = Mon 08:00 IST (alongside daily reminders). Repo record: `0004_weekly_digest_cron.sql`.
- **Auto shopping list**: `public.shopping_list` table + RLS (MCP migration; repo `0005_shopping_list.sql`); prisma model + `ShoppingItem` type. `/shopping` page: auto "Suggested to buy" (items expired/expiring ≤7d not already listed) + saved list (check/uncheck, remove, clear-checked, manual add). `components/shopping-client.tsx`. Nav links added (desktop top nav + mobile bottom bar, px tightened for 4 tabs).

Verification: build clean (type+lint); function deployed + 403 on bad/no secret (didn't trigger real send); both cron jobs active; `shopping_list` table present with rls_enabled=true; deployed to prod; `/shopping` 307 unauth, `/` 200. Visual QA still blocked by sandbox preview networking.

## Still pending (Wave 2, user said later)
Inventory depth: storage locations, opened-date/PAO, batch tracking, household sharing. Also PWA + web push.
