-- ============================================================================
-- RLS ISOLATION TEST — run in Supabase SQL editor BEFORE building/using the UI.
-- Replace the two UUIDs with real ids from auth.users (create 2 test accounts via
-- the app login first). This simulates each user's JWT with set_config(request.jwt...).
-- Expected results are noted on each block. If any expectation fails, fix policies
-- in 0001_rls_and_triggers.sql before proceeding.
-- ============================================================================

-- \set A '00000000-0000-0000-0000-00000000000a'
-- \set B '00000000-0000-0000-0000-00000000000b'

-- Helper to "become" a user for the session:
-- select set_config('request.jwt.claims', json_build_object('sub','<UUID>','role','authenticated')::text, true);
-- select set_config('role','authenticated', true);

-- 1) As A, insert two items -> should SUCCEED
-- select set_config('request.jwt.claims', json_build_object('sub','<A>','role','authenticated')::text, true);
-- set local role authenticated;
-- insert into public.items (user_id, name, category, expiry_date) values ('<A>','A milk','food', current_date + 5);
-- insert into public.items (user_id, name, category, expiry_date) values ('<A>','A pills','medicine', current_date + 12);

-- 2) As A, try to insert a row owned by B -> should be REJECTED by WITH CHECK
-- insert into public.items (user_id, name, category, expiry_date) values ('<B>','sneaky','food', current_date + 5);  -- expect: new row violates row-level security

-- 3) As B, select items -> should return ONLY B's rows (0 if none inserted yet)
-- select set_config('request.jwt.claims', json_build_object('sub','<B>','role','authenticated')::text, true);
-- select id, name, user_id from public.items;   -- expect: none of A's rows visible

-- 4) As B, try to UPDATE / DELETE one of A's items -> should affect 0 rows
-- update public.items set name = 'hacked' where name = 'A milk';   -- expect: UPDATE 0
-- delete from public.items where name = 'A pills';                 -- expect: DELETE 0

-- 5) Reset
-- select set_config('request.jwt.claims', NULL, true);
-- reset role;
