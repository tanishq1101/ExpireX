-- ============================================================================
-- Weekly digest cron. Apply AFTER deploying the `weekly-digest` Edge Function.
-- Requires pg_cron + pg_net (already enabled for the daily reminders job).
-- Replace <PROJECT_REF> and <CRON_SECRET> before running. Keep the secret out of git.
-- Monday 08:00 Asia/Kolkata == 02:30 UTC Monday.
-- ============================================================================

select cron.unschedule('expirex-weekly-digest')
where exists (select 1 from cron.job where jobname = 'expirex-weekly-digest');

select cron.schedule(
  'expirex-weekly-digest',
  '30 2 * * 1',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
