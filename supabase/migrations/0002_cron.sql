-- ============================================================================
-- Daily reminder cron. Apply AFTER deploying the `reminders` Edge Function.
-- Requires extensions pg_cron + pg_net (enable in Supabase: Database > Extensions).
-- Replace <PROJECT_REF> and <CRON_SECRET> before running. Store the secret out of git.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 08:00 Asia/Kolkata == 02:30 UTC. pg_cron schedules are in UTC.
-- Remove any prior copy of this job first (safe to re-run).
select cron.unschedule('expirex-daily-reminders')
where exists (select 1 from cron.job where jobname = 'expirex-daily-reminders');

select cron.schedule(
  'expirex-daily-reminders',
  '30 2 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Inspect:   select * from cron.job;
-- History:   select * from cron.job_run_details order by start_time desc limit 10;
