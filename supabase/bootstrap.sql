-- Fresh projects ONLY. Supabase supplies auth/storage schemas and database roles.
-- Do not run this against an existing installation. Follow README migration order.
begin;
create type public.category as enum ('food','medicine','cosmetics','documents','warranty','subscription','other');
create type public.reminder_type as enum ('d30','d15','d7','d3','d1');
create table public.users (
  id text primary key,
  email text not null,
  created_at timestamptz not null default now()
);
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  category public.category not null,
  expiry_date date not null,
  manufacture_date date,
  quantity numeric,
  unit text,
  notes text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_user_expiry_idx on public.items(user_id,expiry_date);
create index items_user_category_idx on public.items(user_id,category);
create index items_user_created_idx on public.items(user_id,created_at desc);
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  reminder_type public.reminder_type not null,
  sent_at timestamptz not null default now(),
  unique(item_id,reminder_type)
);
alter table public.users enable row level security;
alter table public.items enable row level security;
alter table public.notification_log enable row level security;
grant select,insert,update,delete on public.users,public.items to authenticated;
grant select on public.notification_log to authenticated;
grant all on public.users,public.items,public.notification_log to service_role;
commit;
