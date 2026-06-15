-- ============================================================================
-- Expire X — RLS, updated_at trigger, storage. Apply AFTER `prisma migrate`.
-- AUTH: Clerk (native third-party auth). Clerk's user id is exposed to Postgres as
-- auth.jwt()->>'sub'. There is NO auth.users row for Clerk users; public.users is
-- synced from the app (upsert on first authenticated load). Keep in sync with
-- prisma/schema.prisma by hand.
-- ============================================================================

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security — keyed on the Clerk subject claim
-- ----------------------------------------------------------------------------
alter table public.users            enable row level security;
alter table public.items            enable row level security;
alter table public.notification_log enable row level security;

create policy users_select_own on public.users for select to authenticated using (id = (auth.jwt() ->> 'sub'));
create policy users_insert_self on public.users for insert to authenticated with check (id = (auth.jwt() ->> 'sub'));
create policy users_update_own on public.users for update to authenticated using (id = (auth.jwt() ->> 'sub')) with check (id = (auth.jwt() ->> 'sub'));

create policy items_select_own on public.items for select to authenticated using (user_id = (auth.jwt() ->> 'sub'));
create policy items_insert_own on public.items for insert to authenticated with check (user_id = (auth.jwt() ->> 'sub'));
create policy items_update_own on public.items for update to authenticated using (user_id = (auth.jwt() ->> 'sub')) with check (user_id = (auth.jwt() ->> 'sub'));
create policy items_delete_own on public.items for delete to authenticated using (user_id = (auth.jwt() ->> 'sub'));

-- notification_log: users read their own; writes are by the Edge Function (service-role).
create policy notiflog_select_own on public.notification_log for select to authenticated using (user_id = (auth.jwt() ->> 'sub'));

-- ----------------------------------------------------------------------------
-- Storage: private bucket, per-user folder isolation (path = <clerk_uid>/<file>)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', false)
on conflict (id) do nothing;

drop policy if exists item_images_select_own on storage.objects;
drop policy if exists item_images_insert_own on storage.objects;
drop policy if exists item_images_update_own on storage.objects;
drop policy if exists item_images_delete_own on storage.objects;

create policy item_images_select_own on storage.objects for select to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
create policy item_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'item-images' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
create policy item_images_update_own on storage.objects for update to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
create policy item_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
