-- READ-ONLY DIAGNOSTIC. Does not DROP, UPDATE, DELETE, ALTER or INSERT.
-- Run in Supabase SQL Editor to inspect production schema before writing a migration.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
order by table_name, ordinal_position;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname='public'
order by tablename, policyname;

select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint where connamespace='public'::regnamespace
order by 1,2;

select indexrelid::regclass::text as index_name, indrelid::regclass::text as table_name,
       pg_get_indexdef(indexrelid) as definition
from pg_index where indrelid::regclass::text like 'public.%'
order by 2,1;
