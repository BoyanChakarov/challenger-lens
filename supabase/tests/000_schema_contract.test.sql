begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(25);

select has_table('public', 'ingestion_runs', 'ingestion_runs exists');
select has_table('public', 'ingestion_cursors', 'ingestion_cursors exists');
select has_table('public', 'players', 'players exists');
select has_table('public', 'ladder_snapshots', 'ladder_snapshots exists');
select has_table('public', 'ladder_entries', 'ladder_entries exists');
select has_table('public', 'matches', 'matches exists');
select has_table('public', 'match_exclusions', 'match_exclusions exists');
select has_table('public', 'match_sources', 'match_sources exists');
select has_table('public', 'match_participants', 'match_participants exists');
select has_table('public', 'participant_frames', 'participant_frames exists');
select has_table('public', 'item_events', 'item_events exists');
select has_table('public', 'role_pairs', 'role_pairs exists');

select has_table('public', 'dataset_status', 'dataset_status exists');
select has_table('public', 'champion_stats', 'champion_stats exists');
select has_table('public', 'matchup_stats', 'matchup_stats exists');
select has_table('public', 'item_build_stats', 'item_build_stats exists');

select has_pk('public', 'players', 'players has a primary key');
select has_pk('public', 'matches', 'matches has a primary key');
select has_pk('public', 'match_exclusions', 'match_exclusions has a primary key');
select has_pk('public', 'match_participants', 'match_participants has a primary key');
select has_pk('public', 'participant_frames', 'participant_frames has a primary key');
select has_pk('public', 'role_pairs', 'role_pairs has a primary key');

select has_column('public', 'matches', 'ddragon_version', 'matches records the asset version separately');
select has_function(
  'public',
  'refresh_public_analytics',
  array['text', 'text', 'integer'],
  'refresh_public_analytics(text,text,integer) exists'
);
select function_returns(
  'public',
  'refresh_public_analytics',
  array['text', 'text', 'integer'],
  'jsonb',
  'refresh_public_analytics returns jsonb'
);

select * from finish();
rollback;
