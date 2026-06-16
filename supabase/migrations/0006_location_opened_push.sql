-- Storage location + opened-date "use within" tracking, and web-push subscriptions.
alter table public.items add column if not exists location text;
alter table public.items add column if not exists opened_date date;
alter table public.items add column if not exists open_within_days int;

-- effective_expiry = soonest of printed/estimated expiry and the opened-window date.
-- least() ignores NULLs, so unopened items keep their expiry_date untouched.
alter table public.items
  add column if not exists effective_expiry date
  generated always as (least(expiry_date, opened_date + open_within_days)) stored;
create index if not exists items_user_effexp_idx on public.items (user_id, effective_expiry);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_select_own on public.push_subscriptions;
drop policy if exists push_insert_own on public.push_subscriptions;
drop policy if exists push_delete_own on public.push_subscriptions;
create policy push_select_own on public.push_subscriptions for select to authenticated using (user_id = (auth.jwt() ->> 'sub'));
create policy push_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = (auth.jwt() ->> 'sub'));
create policy push_delete_own on public.push_subscriptions for delete to authenticated using (user_id = (auth.jwt() ->> 'sub'));
