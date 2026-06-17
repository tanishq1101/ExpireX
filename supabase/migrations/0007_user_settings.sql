-- Add per-user app preferences to public.users.
-- Additive migration: safe to run on a live database.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_reminders_enabled boolean NOT NULL DEFAULT true;
