begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(12);

select is(
  (
    select count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'ingestion_runs', 'ingestion_cursors', 'players', 'ladder_snapshots',
        'ladder_entries', 'matches', 'match_sources', 'match_participants',
        'match_exclusions', 'participant_frames', 'item_events', 'role_pairs'
      ])
      and c.relrowsecurity
  ),
  12::bigint,
  'RLS is enabled on every ingestion table'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'dataset_status', 'champion_stats', 'matchup_stats', 'item_build_stats'
      ])
      and c.relrowsecurity
  ),
  4::bigint,
  'RLS is enabled on every aggregate table'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'ingestion_runs', 'ingestion_cursors', 'players', 'ladder_snapshots',
        'ladder_entries', 'matches', 'match_sources', 'match_participants',
        'match_exclusions', 'participant_frames', 'item_events', 'role_pairs'
      ])
  ),
  0::bigint,
  'ingestion tables expose no RLS policies'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'dataset_status', 'champion_stats', 'matchup_stats', 'item_build_stats'
      ])
      and cmd = 'SELECT'
      and roles @> array['anon'::name, 'authenticated'::name]
  ),
  4::bigint,
  'each aggregate has an anon/authenticated SELECT policy'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and table_name = any (array[
        'ingestion_runs', 'ingestion_cursors', 'players', 'ladder_snapshots',
        'ladder_entries', 'matches', 'match_sources', 'match_participants',
        'match_exclusions', 'participant_frames', 'item_events', 'role_pairs'
      ])
  ),
  0::bigint,
  'anon and authenticated have no ingestion-table grants'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'service_role'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      and table_name = any (array[
        'ingestion_runs', 'ingestion_cursors', 'players', 'ladder_snapshots',
        'ladder_entries', 'matches', 'match_sources', 'match_participants',
        'match_exclusions', 'participant_frames', 'item_events', 'role_pairs'
      ])
  ),
  48::bigint,
  'service_role has CRUD grants on all ingestion tables'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type = 'SELECT'
      and table_name = any (array[
        'dataset_status', 'champion_stats', 'matchup_stats', 'item_build_stats'
      ])
  ),
  8::bigint,
  'anon and authenticated can SELECT all four aggregates'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
      and table_name = any (array[
        'dataset_status', 'champion_stats', 'matchup_stats', 'item_build_stats'
      ])
  ),
  0::bigint,
  'browser roles have no aggregate write grants'
);

select ok(
  not has_function_privilege('anon', 'public.refresh_public_analytics(text,text,integer)', 'EXECUTE'),
  'anon cannot execute the analytics refresh'
);
select ok(
  not has_function_privilege('authenticated', 'public.refresh_public_analytics(text,text,integer)', 'EXECUTE'),
  'authenticated cannot execute the analytics refresh'
);
select ok(
  has_function_privilege('service_role', 'public.refresh_public_analytics(text,text,integer)', 'EXECUTE'),
  'service_role can execute the analytics refresh'
);
select is(
  (
    select count(*)
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'refresh_public_analytics'
      and grantee = 'PUBLIC'
      and privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'PUBLIC has no implicit EXECUTE grant on the analytics refresh'
);

select * from finish();
rollback;
