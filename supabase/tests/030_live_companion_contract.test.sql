begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(30);

select is(
  (
    select count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'rune_page_stats', 'summoner_spell_stats', 'item_path_stats'
      ])
      and c.relkind = 'r'
  ),
  3::bigint,
  'all three companion aggregate tables exist'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'rune_page_stats', 'summoner_spell_stats', 'item_path_stats'
      ])
      and c.relrowsecurity
  ),
  3::bigint,
  'RLS is enabled on every companion aggregate'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'rune_page_stats', 'summoner_spell_stats', 'item_path_stats'
      ])
      and cmd = 'SELECT'
      and roles @> array['anon'::name, 'authenticated'::name]
  ),
  3::bigint,
  'each companion aggregate has a browser read policy'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and table_name = any (array[
        'rune_page_stats', 'summoner_spell_stats', 'item_path_stats'
      ])
      and privilege_type <> 'SELECT'
  ),
  0::bigint,
  'browser roles cannot write companion aggregates'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and table_name = any (array[
        'rune_page_stats', 'summoner_spell_stats', 'item_path_stats'
      ])
      and privilege_type = 'SELECT'
  ),
  6::bigint,
  'browser roles can read all companion aggregates'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.refresh_companion_analytics(text,text,integer)',
    'EXECUTE'
  ),
  'service_role can refresh companion aggregates'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.refresh_companion_analytics(text,text,integer)',
    'EXECUTE'
  ),
  'anon cannot refresh companion aggregates'
);
select ok(
  has_function_privilege(
    'anon',
    'public.get_companion_recommendations_v1(text,text,integer,integer,text,integer,integer)',
    'EXECUTE'
  ),
  'anon can call the bounded recommendation RPC'
);

insert into public.dataset_status (
  patch, region, queue_id, ddragon_version,
  analytics_refreshed_at, match_count, tracked_player_count,
  participant_observation_count, matchup_observation_count,
  status, data_provenance, data_quality_note
)
values (
  '98.98', 'EUW', 420, '98.98.1',
  '2098-09-01T00:00:00Z', 40, 40, 40, 40,
  'ready', 'live', 'Companion contract fixture.'
);

insert into public.matchup_stats (
  patch, region, role, champion_id, champion_name,
  opponent_champion_id, opponent_champion_name,
  sample_size, wins, losses, unique_players,
  win_rate, adjusted_win_rate, baseline_win_rate, wilson_low, wilson_high,
  avg_gold_diff_15, avg_cs_diff_15, avg_xp_diff_15, early_game_sample_size,
  avg_kda_diff, avg_damage_diff_per_min,
  player_concentration_hhi, top_player_share, evidence_label,
  confidence_score, counter_score, prediction_label,
  data_provenance, updated_at
)
select
  '98.98', 'EUW', 'MIDDLE', candidate.champion_id, candidate.champion_name,
  134, 'Syndra', 120, 72, 48, 60,
  0.600000, 0.580000, 0.500000, 0.520000, 0.680000,
  160.0 - candidate.ordinality, 3.0, 90.0, 120,
  0.0, 0.0, 0.020000, 0.040000, 'strong',
  80.0, 20.0 - candidate.ordinality, 'favorable',
  'live', '2098-09-01T00:00:00Z'
from unnest(
  array[38, 103, 61, 163],
  array['Kassadin', 'Ahri', 'Orianna', 'Taliyah']
) with ordinality as candidate(champion_id, champion_name, ordinality);

insert into public.players (id, puuid, region, platform_region)
select
  ('98000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
  'companion-fixture-puuid-' || g,
  'EUW',
  'EUW1'
from generate_series(1, 40) as series(g);

insert into public.matches (
  match_id, region, platform_region, regional_route, queue_id, map_id,
  game_mode, game_type, game_version, ddragon_version, patch,
  duration_seconds, winning_team_id, timeline_status, raw_payload
)
select
  'EUW1_980000' || lpad(g::text, 2, '0'),
  'EUW', 'EUW1', 'EUROPE', 420, 11,
  'CLASSIC', 'MATCHED_GAME', '98.98.1.1', '98.98.1', '98.98',
  1800,
  case when g % 5 <> 0 then 100 else 200 end,
  'complete',
  '{}'::jsonb
from generate_series(1, 40) as series(g);

insert into public.match_participants (
  match_id, participant_id, player_id, puuid, team_id,
  champion_id, champion_name, team_position, individual_position, lane, role,
  win, summoner_spell_1_id, summoner_spell_2_id, final_item_ids, perks
)
select
  'EUW1_980000' || lpad(g::text, 2, '0'),
  1,
  ('98000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
  'companion-fixture-puuid-' || g,
  100,
  38, 'Kassadin', 'MIDDLE', 'MIDDLE', 'MIDDLE', 'MIDDLE',
  g % 5 <> 0,
  4,
  (array[12, 14, 3, 21])[((g - 1) % 4) + 1],
  array[3001 + ((g - 1) % 4), 4001 + ((g - 1) % 4)],
  pg_catalog.jsonb_build_object(
    'styles', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'style', 8000,
        'selections', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('perk', 8001 + ((g - 1) % 4))
        )
      ),
      pg_catalog.jsonb_build_object(
        'style', 8100,
        'selections', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('perk', 8101 + ((g - 1) % 4))
        )
      )
    ),
    'statPerks', pg_catalog.jsonb_build_object(
      'offense', 5008, 'flex', 5008, 'defense', 5001
    )
  )
from generate_series(1, 40) as series(g);

insert into public.match_participants (
  match_id, participant_id, puuid, team_id,
  champion_id, champion_name, team_position, individual_position, lane, role,
  win, final_item_ids
)
select
  'EUW1_980000' || lpad(g::text, 2, '0'),
  6,
  'untracked-opponent-puuid-' || g,
  200,
  134, 'Syndra', 'MIDDLE', 'MIDDLE', 'MIDDLE', 'MIDDLE',
  g % 5 = 0,
  array[6655]
from generate_series(1, 40) as series(g);

insert into public.match_sources (match_id, player_id, source_type)
select
  'EUW1_980000' || lpad(g::text, 2, '0'),
  ('98000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
  'challenger_ladder'
from generate_series(1, 40) as series(g);

insert into public.role_pairs (
  match_id, role, blue_participant_id, red_participant_id, pairing_method, is_valid
)
select
  'EUW1_980000' || lpad(g::text, 2, '0'),
  'MIDDLE', 1, 6, 'team_position', true
from generate_series(1, 40) as series(g);

insert into public.item_events (
  match_id, event_index, participant_id, timestamp_ms, event_type, item_id
)
select
  'EUW1_980000' || lpad(g::text, 2, '0'),
  event.event_index,
  1,
  event.timestamp_ms,
  'ITEM_PURCHASED',
  case
    when event.event_index = 1 then 1001 + ((g - 1) % 4)
    else 3001 + ((g - 1) % 4)
  end
from generate_series(1, 40) as series(g)
cross join (values (1, 60000), (2, 480000)) as event(event_index, timestamp_ms);

select lives_ok(
  $$select public.refresh_companion_analytics('98.98', 'EUW', 1)$$,
  'companion analytics refresh succeeds for the fixture patch'
);

select is(
  (select count(*) from public.rune_page_stats where patch = '98.98'),
  4::bigint,
  'four distinct rune pages are aggregated'
);
select is(
  (select count(*) from public.summoner_spell_stats where patch = '98.98'),
  4::bigint,
  'four distinct summoner spell pairs are aggregated'
);
select is(
  (select count(*) from public.item_path_stats where patch = '98.98'),
  4::bigint,
  'four distinct item paths are aggregated'
);
select ok(
  (
    select bool_and(spell_ids[1] <= spell_ids[2])
    from public.summoner_spell_stats
    where patch = '98.98'
  ),
  'summoner spell order is canonicalized'
);
select is(
  (
    select min(stage_quality)
    from public.item_path_stats
    where patch = '98.98'
  ),
  'retained_item_proxy',
  'item completion stages remain explicitly marked as proxies'
);

create temporary table companion_test_results (
  kind text primary key,
  payload jsonb not null
) on commit drop;

insert into companion_test_results (kind, payload)
values
  (
    'selected',
    public.get_companion_recommendations_v1(
      '98.98', 'EUW', 420, 11, 'MIDDLE', 38, 134
    )
  ),
  (
    'not_selected',
    public.get_companion_recommendations_v1(
      '98.98', 'EUW', 420, 11, 'MIDDLE', null, 134
    )
  ),
  (
    'unsupported',
    public.get_companion_recommendations_v1(
      '98.98', 'EUW', 420, 12, 'MIDDLE', null, 134
    )
  ),
  (
    'missing_patch',
    public.get_companion_recommendations_v1(
      '98.97', 'EUW', 420, 11, 'MIDDLE', null, 134
    )
  );

select is(
  (select (payload ->> 'schemaVersion')::integer from companion_test_results where kind = 'selected'),
  1,
  'RPC response is explicitly versioned'
);
select is(
  (select payload ->> 'status' from companion_test_results where kind = 'selected'),
  'ready',
  'selected-champion response is ready for supported evidence'
);
select is(
  (select pg_catalog.jsonb_array_length(payload -> 'counterCandidates') from companion_test_results where kind = 'selected'),
  3,
  'counter candidates are capped at three'
);
select is(
  (select pg_catalog.jsonb_array_length(payload -> 'runePages') from companion_test_results where kind = 'selected'),
  3,
  'rune pages are capped at three'
);
select is(
  (select pg_catalog.jsonb_array_length(payload -> 'summonerSpellSets') from companion_test_results where kind = 'selected'),
  3,
  'summoner spell sets are capped at three'
);
select is(
  (select pg_catalog.jsonb_array_length(payload -> 'itemPaths') from companion_test_results where kind = 'selected'),
  3,
  'item paths are capped at three'
);
select ok(
  (
    select (payload #> '{runePages,0,evidence}') ?& array[
      'sampleSize', 'uniquePlayers', 'rawWinRate', 'adjustedWinRate',
      'baselineWinRate', 'interval95', 'topPlayerShare',
      'playerConcentrationHhi', 'frequency', 'label'
    ]
    from companion_test_results
    where kind = 'selected'
  ),
  'loadout evidence includes support, uncertainty, concentration, and frequency'
);
select is(
  (select payload #>> '{context,patch}' from companion_test_results where kind = 'selected'),
  '98.98',
  'RPC preserves the exact requested gameplay patch'
);
select ok(
  (
    select payload::text not like '%companion-fixture-puuid%'
    from companion_test_results
    where kind = 'selected'
  ),
  'RPC never exposes player identifiers'
);

select is(
  (select payload ->> 'status' from companion_test_results where kind = 'not_selected'),
  'ready',
  'a missing local champion does not make supported counter discovery unsupported'
);
select ok(
  (
    select (payload -> 'reasonCodes') ? 'local_champion_not_selected'
    from companion_test_results
    where kind = 'not_selected'
  ),
  'pre-selection response explains why loadout sections are omitted'
);
select is(
  (select pg_catalog.jsonb_array_length(payload -> 'counterCandidates') from companion_test_results where kind = 'not_selected'),
  3,
  'pre-selection response still returns bounded counters'
);
select ok(
  (
    select
      payload -> 'matchup' = 'null'::jsonb
      and payload -> 'runePages' = '[]'::jsonb
      and payload -> 'summonerSpellSets' = '[]'::jsonb
      and payload -> 'itemPaths' = '[]'::jsonb
    from companion_test_results
    where kind = 'not_selected'
  ),
  'pre-selection response omits exact-matchup loadout sections'
);
select is(
  (select payload ->> 'status' from companion_test_results where kind = 'unsupported'),
  'unsupported',
  'unsupported map context is rejected explicitly'
);
select is(
  (select payload ->> 'status' from companion_test_results where kind = 'missing_patch'),
  'insufficient',
  'an unavailable exact patch is labelled insufficient'
);
select is(
  (select payload -> 'counterCandidates' from companion_test_results where kind = 'missing_patch'),
  '[]'::jsonb,
  'an unavailable patch never falls back to another patch'
);

select * from finish();
rollback;
