-- Apply before deploying the matching app and Edge Functions.
begin;

-- Existing dates have unknown provenance; do not relabel them as printed.
alter table public.items add column expiry_source text not null default 'unknown'
  check (expiry_source in ('unknown', 'manual', 'printed', 'estimated'));
alter table public.items add column expiry_revision integer not null default 1;
alter table public.items add column expiry_confirmed_at timestamptz;
create or replace function public.bump_expiry_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.expiry_revision := old.expiry_revision;
  if new.expiry_date is distinct from old.expiry_date
     or new.opened_date is distinct from old.opened_date
     or new.open_within_days is distinct from old.open_within_days then
    new.expiry_revision := old.expiry_revision + 1;
  end if;
  return new;
end; $$;
revoke all on function public.bump_expiry_revision() from public, anon, authenticated;
create trigger items_expiry_revision before update on public.items
for each row execute function public.bump_expiry_revision();
create index items_effective_expiry_idx on public.items(effective_expiry, id);

-- Only trusted Clerk sync may set recipients; clients can change consent only.
alter table public.users add column clerk_updated_at bigint not null default 0;
revoke insert, update on public.users from public, anon, authenticated;
grant update(email_reminders_enabled) on public.users to authenticated;

-- Explicit grants: do not depend on a project's Data API default privileges.
grant select,insert,update,delete on public.items,public.shopping_list,public.push_subscriptions to authenticated;
grant select on public.users,public.barcode_catalog,public.notification_log to authenticated;
grant all on public.users,public.items,public.shopping_list,public.push_subscriptions,public.barcode_catalog,public.notification_log to service_role;
drop policy shopping_insert_own on public.shopping_list;
create policy shopping_insert_own on public.shopping_list for insert to authenticated
with check(user_id = (select auth.jwt()->>'sub') and (item_id is null or exists(select 1 from public.items i where i.id=item_id and i.user_id=(select auth.jwt()->>'sub'))));
drop policy shopping_update_own on public.shopping_list;
create policy shopping_update_own on public.shopping_list for update to authenticated
using(user_id = (select auth.jwt()->>'sub'))
with check(user_id = (select auth.jwt()->>'sub') and (item_id is null or exists(select 1 from public.items i where i.id=item_id and i.user_id=(select auth.jwt()->>'sub'))));

-- A browser may refresh its own keys, but cannot reassign another user's endpoint.
create policy push_update_own on public.push_subscriptions for update to authenticated
using (user_id = (select auth.jwt()->>'sub'))
with check (user_id = (select auth.jwt()->>'sub'));

-- Retain all shopping data. Keep the oldest reference; detach later duplicates as
-- manual rows rather than discarding names, quantities, notes or checked state.
with duplicates as (
  select id, row_number() over (partition by user_id,item_id order by created_at,id) as position
  from public.shopping_list where item_id is not null
)
update public.shopping_list s set item_id = null, source = 'manual',
  note = concat_ws(E'\n',s.note,'Duplicate inventory reference detached during upgrade.')
from duplicates d where s.id=d.id and d.position > 1;
create unique index shopping_one_inventory_item on public.shopping_list(user_id, item_id)
where item_id is not null;

-- Stop accepting private/user-edited metadata into the shared catalog.
revoke execute on function public.confirm_barcode_scan from public, anon, authenticated;
grant execute on function public.confirm_barcode_scan to service_role;
create table public.barcode_confirmations (
  barcode text not null references public.barcode_catalog(barcode) on delete cascade,
  user_id text not null,
  primary key (barcode, user_id)
);
alter table public.barcode_confirmations enable row level security;
revoke all on public.barcode_confirmations from public, anon, authenticated;
grant all on public.barcode_confirmations to service_role;
-- Old user-contributed entries may contain private names/photos or poisoned identity.
delete from public.barcode_catalog where source = 'user';
update public.barcode_catalog set confirmed_count = 0;
-- New confirmations increment only vetted entries, once per account. No metadata input.
create function public.confirm_catalog_item(p_barcode text, p_user_id text) returns void
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.items where user_id = p_user_id and barcode = p_barcode)
     and exists (select 1 from public.barcode_catalog where barcode = p_barcode and source = 'api') then
    insert into public.barcode_confirmations values (p_barcode, p_user_id) on conflict do nothing;
    if found then
      update public.barcode_catalog set confirmed_count = confirmed_count + 1 where barcode = p_barcode;
    end if;
  end if;
end; $$;
revoke all on function public.confirm_catalog_item from public, anon, authenticated;
grant execute on function public.confirm_catalog_item to service_role;

-- Private outbox. No API consumer can submit arbitrary privileged sends or see payloads.
create table public.notification_deliveries (
  key text primary key,
  user_id text not null,
  item_id uuid references public.items(id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'uncertain', 'cancelled')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  first_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public, anon, authenticated;
grant all on public.notification_deliveries to service_role;
create index delivery_retries on public.notification_deliveries(channel, status, created_at);
create function public.claim_delivery(p_key text, p_user_id text, p_item_id uuid, p_channel text, p_payload jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare job public.notification_deliveries;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id,0));
  if exists(select 1 from public.deleted_accounts where user_id = p_user_id) then return null; end if;
  insert into public.notification_deliveries(key, user_id, item_id, channel, payload)
    values(p_key, p_user_id, p_item_id, p_channel, p_payload) on conflict do nothing;
  -- Validate the frozen recipient, not just a newly supplied retry payload.
  update public.notification_deliveries d set status = 'cancelled', last_error = 'Recipient or consent changed'
    where d.key = p_key and d.channel = 'email' and (d.status in ('pending','failed') or (d.status='sending' and d.lease_until < now()))
    and not exists(select 1 from public.users u where u.id = d.user_id and u.clerk_updated_at > 0 and u.email = d.payload->>'to'
      and (u.email_reminders_enabled or d.key like 'welcome/%'));
  -- Resend only retains idempotency keys for 24h. Never blindly replay an old ambiguous send.
  update public.notification_deliveries set status = 'uncertain', last_error = 'Retry window ended; inspect provider delivery before retrying'
    where key = p_key and ((status in ('failed', 'sending') and first_attempt_at < now() - interval '23 hours') or (channel = 'push' and status = 'sending' and lease_until < now()));
  update public.notification_deliveries set status = 'sending', attempts = attempts + 1,
    lease_token = gen_random_uuid(), lease_until = now() + interval '2 minutes',
    first_attempt_at = coalesce(first_attempt_at, now())
    where key = p_key and (status in ('pending', 'failed') or (status = 'sending' and lease_until < now()))
    returning * into job;
  if not found then return null; end if;
  return to_jsonb(job);
end; $$;
revoke all on function public.claim_delivery from public, anon, authenticated;
grant execute on function public.claim_delivery to service_role;

-- Existing accounts may already have received the legacy welcome email. Suppress replay
-- without claiming a historical provider send was verified.
insert into public.notification_deliveries(key,user_id,channel,payload,status,last_error)
select 'welcome/'||id,id,'email','{}'::jsonb,'cancelled','Account predates delivery tracking' from public.users;

-- Shared quotas for paid/CPU-heavy API actions. Each window expires for cleanup.
create table public.request_quotas(key text primary key, hits integer not null, expires_at timestamptz not null);
create index quota_expiry_idx on public.request_quotas(expires_at);
alter table public.request_quotas enable row level security;
revoke all on public.request_quotas from public, anon, authenticated;
grant all on public.request_quotas to service_role;
create function public.take_quota(p_key text, p_limit integer, p_window_ms integer) returns boolean
language plpgsql set search_path = '' as $$
declare used integer;
begin
  if p_limit < 1 or p_window_ms < 1 then return false; end if;
  delete from public.request_quotas where expires_at < now();
  insert into public.request_quotas values(p_key, 1, now() + p_window_ms * interval '1 millisecond')
    on conflict(key) do update set hits = public.request_quotas.hits + 1 returning hits into used;
  return used <= p_limit;
end; $$;
revoke all on function public.take_quota from public, anon, authenticated;
grant execute on function public.take_quota to service_role;

-- A signed Clerk deletion webhook writes a tombstone before removing private data.
-- Existing sessions cannot recreate data while storage cleanup is retried.
create table public.deleted_accounts(user_id text primary key, deleted_at timestamptz not null default now(), cleaned_at timestamptz);
alter table public.deleted_accounts enable row level security;
revoke all on public.deleted_accounts from public, anon, authenticated;
grant all on public.deleted_accounts to service_role;
create function public.account_active() returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.deleted_accounts where user_id = (select auth.jwt()->>'sub'))
$$;
revoke all on function public.account_active from public, anon;
grant execute on function public.account_active to authenticated;
create policy users_account_active on public.users as restrictive for all to authenticated using(public.account_active()) with check(public.account_active());
create policy items_account_active on public.items as restrictive for all to authenticated using(public.account_active()) with check(public.account_active());
create policy shopping_account_active on public.shopping_list as restrictive for all to authenticated using(public.account_active()) with check(public.account_active());
create policy push_account_active on public.push_subscriptions as restrictive for all to authenticated using(public.account_active()) with check(public.account_active());
create policy storage_account_active on storage.objects as restrictive for all to authenticated
  using(bucket_id <> 'item-images' or public.account_active()) with check(bucket_id <> 'item-images' or public.account_active());
create function public.begin_account_deletion(p_user_id text) returns void
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id,0));
  insert into public.deleted_accounts(user_id) values(p_user_id) on conflict do nothing;
end; $$;
revoke all on function public.begin_account_deletion from public, anon, authenticated;
grant execute on function public.begin_account_deletion to service_role;

-- Timestamp-guarded, verified Clerk profile sync; deletion always wins.
create function public.sync_account(p_user_id text, p_email text, p_updated_at bigint) returns boolean
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id,0));
  if exists(select 1 from public.deleted_accounts where user_id = p_user_id) then return false; end if;
  insert into public.users(id,email,clerk_updated_at) values(p_user_id,p_email,p_updated_at)
  on conflict(id) do update set email = excluded.email, clerk_updated_at = excluded.clerk_updated_at
    where public.users.clerk_updated_at <= excluded.clerk_updated_at;
  return true;
end; $$;
revoke all on function public.sync_account from public, anon, authenticated;
grant execute on function public.sync_account to service_role;
-- Filter completed work in the database so large accounts do not starve later rows
-- when a serverless invocation times out. The next invocation starts at unsent work.
create function public.reminder_stage(p_today date, p_expiry date) returns text
language sql immutable set search_path = '' as $$
  select case when p_expiry-p_today > 30 or p_expiry-p_today < -7 then null
    when p_expiry < p_today then 'overdue' when p_expiry = p_today then 'd0'
    when p_expiry-p_today <= 1 then 'd1' when p_expiry-p_today <= 3 then 'd3'
    when p_expiry-p_today <= 7 then 'd7' when p_expiry-p_today <= 15 then 'd15' else 'd30' end
$$;
revoke all on function public.reminder_stage from public, anon, authenticated;
grant execute on function public.reminder_stage to service_role;
create function public.due_reminder_items(p_today date, p_channel text, p_after uuid default null, p_limit int default 100)
returns setof public.items language sql stable set search_path = '' as $$
  select i.* from public.items i join public.users u on u.id = i.user_id
  where i.effective_expiry between p_today-7 and p_today+30 and (p_after is null or i.id > p_after)
  and not exists(select 1 from public.deleted_accounts a where a.user_id = i.user_id)
  and (
    (p_channel = 'email' and u.clerk_updated_at > 0 and u.email <> '' and u.email_reminders_enabled
    and not (i.expiry_revision = 1 and exists(select 1 from public.notification_log l where l.item_id=i.id and l.reminder_type::text=public.reminder_stage(p_today,i.effective_expiry)))
    and not exists(
      select 1 from public.notification_deliveries d
      where d.key = 'reminder/'||i.id||'/'||i.expiry_revision||'/'||i.effective_expiry||'/'||public.reminder_stage(p_today,i.effective_expiry)
      and (d.status in ('sent','uncertain','cancelled') or (d.status='sending' and d.lease_until > now()))
    )) or
    (p_channel = 'push' and exists(select 1 from public.push_subscriptions s where s.user_id = i.user_id and not exists(
      select 1 from public.notification_deliveries d
      where d.key = 'push/'||i.id||'/'||i.expiry_revision||'/'||i.effective_expiry||'/'||public.reminder_stage(p_today,i.effective_expiry)||'/'||s.id
      and (d.status in ('sent','uncertain','cancelled') or (d.status='sending' and d.lease_until > now()))
    )))
  ) order by i.id limit least(greatest(p_limit,1),200)
$$;
revoke all on function public.due_reminder_items from public, anon, authenticated;
grant execute on function public.due_reminder_items to service_role;
create function public.due_digest_users(p_today date, p_week text, p_after text default null)
returns setof public.users language sql stable set search_path = '' as $$
  select u.* from public.users u where u.clerk_updated_at > 0 and u.email <> '' and u.email_reminders_enabled
    and (p_after is null or u.id > p_after)
    and not exists(select 1 from public.deleted_accounts a where a.user_id=u.id)
    and exists(select 1 from public.items i where i.user_id=u.id and i.effective_expiry <= p_today+7)
    and not exists(select 1 from public.notification_deliveries d where d.key='digest/'||u.id||'/'||p_week
      and (d.status in ('sent','uncertain','cancelled') or (d.status='sending' and d.lease_until > now())))
    order by u.id limit 100
$$;
revoke all on function public.due_digest_users from public, anon, authenticated;
grant execute on function public.due_digest_users to service_role;
commit;
