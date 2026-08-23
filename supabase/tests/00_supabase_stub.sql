-- จำลองสิ่งที่ Supabase มีให้อยู่แล้ว เพื่อทดสอบ migration บน Postgres เปล่า
create schema if not exists auth;
create schema if not exists storage;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(p text) returns text[] language sql immutable as $$
  select string_to_array(p, '/') $$;
create publication supabase_realtime;
