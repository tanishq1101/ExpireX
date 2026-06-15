-- Auto shopping list: per-user re-buy list (manual items + accepted suggestions).
-- RLS mirrors items: a row is visible only to its owner (Clerk sub).
create table if not exists public.shopping_list (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  quantity numeric,
  unit text,
  note text,
  source text not null default 'manual', -- 'manual' | 'auto'
  item_id uuid references public.items(id) on delete set null,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shopping_list_user_idx on public.shopping_list (user_id, checked, created_at desc);

alter table public.shopping_list enable row level security;

drop policy if exists shopping_select_own on public.shopping_list;
drop policy if exists shopping_insert_own on public.shopping_list;
drop policy if exists shopping_update_own on public.shopping_list;
drop policy if exists shopping_delete_own on public.shopping_list;

create policy shopping_select_own on public.shopping_list for select to authenticated using (user_id = (auth.jwt() ->> 'sub'));
create policy shopping_insert_own on public.shopping_list for insert to authenticated with check (user_id = (auth.jwt() ->> 'sub'));
create policy shopping_update_own on public.shopping_list for update to authenticated using (user_id = (auth.jwt() ->> 'sub')) with check (user_id = (auth.jwt() ->> 'sub'));
create policy shopping_delete_own on public.shopping_list for delete to authenticated using (user_id = (auth.jwt() ->> 'sub'));
