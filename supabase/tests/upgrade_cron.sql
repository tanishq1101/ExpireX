-- Optional operational step AFTER deploying both updated Edge Functions.
-- Preserves existing URL/secret commands; does not store credentials in this file.
select cron.alter_job(job_id := jobid, schedule := '30 * * * *')
from cron.job where jobname = 'expirex-daily-reminders';
select cron.alter_job(job_id := jobid, schedule := '35 * * * *')
from cron.job where jobname = 'expirex-weekly-digest';
