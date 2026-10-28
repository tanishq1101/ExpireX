const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
async function database(options={}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1, '/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    create table storage.buckets(id text primary key,name text,public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant all on all tables in schema public,storage to anon,authenticated,service_role;
  `);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/bootstrap.sql'),'utf8'));
  for (const filename of ['0001_rls_and_storage.sql','0003_barcode.sql','0005_shopping_list.sql','0006_location_opened_push.sql','0007_user_settings.sql','0008_barcode_catalog.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',filename),'utf8'));
  }
  await db.exec(`grant all on all tables in schema public to authenticated,service_role;`);
  if (options.preUpgrade) await options.preUpgrade(db);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261028100447_reliability_and_date_provenance.sql'),'utf8'));
  return db;
}
module.exports = { database };
