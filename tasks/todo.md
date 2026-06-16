# Wave 2 (subset): location + opened-date/use-within + PWA install + push

Scope: storage location; opened-date "use within"; PWA install; web push. SKIP batches + household sharing.

## Plan
- [ ] 1. DB: items.location, opened_date, open_within_days, effective_expiry (generated = least(expiry, opened+within)); push_subscriptions table + RLS. MCP migration + repo SQL + prisma + types.
- [ ] 2. validators: location, opened_date, open_within_days in itemFormSchema
- [ ] 3. item-form: location (datalist) + "Opened?" section (opened_date + use-within) with effective-expiry hint
- [ ] 4. App uses effective_expiry for status/sort/filter: item-row, detail, dashboard counts+list, items list+filter, shopping suggestions; show location chip
- [ ] 5. filter-bar: location filter on /items
- [ ] 6. reminders + digest edge fns: switch to effective_expiry; redeploy
- [ ] 7. PWA: manifest + icon + service worker (public/sw.js) + register + install prompt component
- [ ] 8. Push: VAPID keys (generate + Vercel env + app_config) + /api/push/subscribe + subscribe UI + send from reminders edge fn (additive, try/catch)
- [ ] 9. Build + deploy + verify; commit + push

## Review (DONE, live)
- **Storage location**: items.location; form datalist; item-row + detail chip; /items location filter (FilterBar `locations` prop, distinct values from DB).
- **Opened-date / use-within**: items.opened_date + open_within_days + GENERATED `effective_expiry = least(expiry_date, opened_date+open_within_days)`. Form has "Opened?" section + effective-use-by hint. App now uses effective_expiry for status/sort/filter everywhere (item-row, detail, dashboard counts+list, items query+filters, shopping suggestions) AND in the reminders + digest edge functions (redeployed v3). Single source of truth; non-destructive (printed expiry kept).
- **PWA install**: public/manifest.webmanifest + public/icon.svg + public/sw.js (push + notificationclick); PwaRegister in layout; metadata.manifest/appleWebApp/icons. Fixed middleware matcher so /sw.js + /manifest.webmanifest are public (was 307→login). Both now 200.
- **Web push**: web-push npm; VAPID keys generated + set in Vercel env (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) + .env.local + CRON_SECRET. push_subscriptions table+RLS. /api/push/subscribe (POST/DELETE, Clerk). /api/push/run (Node, admin client, web-push send, dedup-free once-daily) protected by Authorization: Bearer CRON_SECRET (Vercel cron) or x-cron-secret. Vercel cron in vercel.json (30 2 * * * = 08:00 IST). PushToggle bell in app header. Verified: push/run with secret → {due:0,sent:0}; subscribe 401 unauth; run 403 no secret.

Verify: build clean; deployed; manifest+sw 200; edge fns v3 ACTIVE; push/run works. Push DELIVERY needs a real device/installed PWA over HTTPS to confirm end to end (iOS requires the app be installed to Home Screen first).

## Skipped (per user): batch tracking, household sharing.
