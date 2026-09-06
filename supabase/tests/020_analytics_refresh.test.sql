begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(13);

insert into public.players (id, puuid, region, platform_region, game_name, tag_line)
values
  ('99000000-0000-0000-0000-000000000001', 'test-puuid-blue-1', 'EUW', 'EUW1', 'FixtureOne', 'TEST'),
  ('99000000-0000-0000-0000-000000000002', 'test-puuid-blue-2', 'EUW', 'EUW1', 'FixtureTwo', 'TEST');

insert into public.matches (
  match_id, region, platform_region, regional_route, queue_id, map_id,
  game_mode, game_type, game_version, ddragon_version, patch,
  game_creation, game_start, game_end, duration_seconds,
  winning_team_id, timeline_status, raw_payload
)
values
  (
    'EUW1_9900000001', 'EUW', 'EUW1', 'EUROPE', 420, 11,
    'CLASSIC', 'MATCHED_GAME', '99.99.1', '99.99.1', '99.99',
    '2099-09-01T12:00:00Z', '2099-09-01T12:00:00Z', '2099-09-01T12:30:00Z', 1800,
    100, 'complete', '{}'::jsonb
  ),
  (
    'EUW1_9900000002', 'EUW', 'EUW1', 'EUROPE', 420, 11,
    'CLASSIC', 'MATCHED_GAME', '99.99.1', '99.99.1', '99.99',
    '2099-09-01T13:00:00Z', '2099-09-01T13:00:00Z', '2099-09-01T13:32:00Z', 1920,
    200, 'complete', '{}'::jsonb
  );

insert into public.match_participants (
  id, match_id, participant_id, player_id, puuid, team_id,
  champion_id, champion_name, team_position, individual_position, lane, role,
  win, kills, deaths, assists, cs, gold_earned, champ_level,
  damage_to_champions, damage_taken, vision_score, final_item_ids
)
values
  (
    '99100000-0000-0000-0000-000000000001', 'EUW1_9900000001', 1,
    '99000000-0000-0000-0000-000000000001', 'test-puuid-blue-1', 100,
    38, 'Kassadin', 'MIDDLE', 'MIDDLE', 'MIDDLE', 'MIDDLE',
    true, 8, 2, 6, 241, 13200, 17, 22100, 16500, 18, array[6657, 3040]
  ),
  (
    '99100000-0000-0000-0000-000000000002', 'EUW1_9900000001', 6,
    null, 'test-puuid-red-1', 200,
    134, 'Syndra', 'MIDDLE', 'MIDDLE', 'MIDDLE', 'MIDDLE',
    false, 3, 7, 4, 232, 11900, 16, 18700, 18400, 22, array[6655, 3020]
  ),
  (
    '99100000-0000-0000-0000-000000000003', 'EUW1_9900000002', 1,
    '99000000-0000-0000-0000-000000000002', 'test-puuid-blue-2', 100,
    38, 'Kassadin', 'MIDDLE', 'MIDDLE', 'MIDDLE', 'MIDDLE',
    false, 2, 6, 4, 249, 12600, 16, 19800, 21100, 20, array[6657, 3040]
  ),
  (
    '99100000-0000-0000-0000-000000000004', 'EUW1_9900000002', 6,
    null, 'test-puuid-red-2', 200,
    134, 'Syndra', 'MIDDLE', 'MIDDLE', 'MIDDLE', 'MIDDLE',
    true, 7, 2, 5, 255, 13700, 18, 24400, 17200, 25, array[6655, 3020]
  );

insert into public.match_sources (match_id, player_id, source_type)
values
  ('EUW1_9900000001', '99000000-0000-0000-0000-000000000001', 'challenger_ladder'),
  ('EUW1_9900000002', '99000000-0000-0000-0000-000000000002', 'challenger_ladder');

insert into public.participant_frames (
  match_id, participant_id, timestamp_ms, total_gold, current_gold,
  level, xp, minions_killed, jungle_minions_killed
)
values
  ('EUW1_9900000001', 1, 905000, 5000, 700, 11, 6500, 118, 2),
  ('EUW1_9900000001', 6, 905000, 4700, 500, 10, 6200, 110, 0),
  ('EUW1_9900000002', 1, 910000, 4800, 350, 10, 6300, 114, 1),
  ('EUW1_9900000002', 6, 910000, 4700, 620, 10, 6250, 111, 0);

insert into public.item_events (
  match_id, event_index, participant_id, timestamp_ms, event_type, item_id
)
values
  ('EUW1_9900000001', 1, 1, 60000, 'ITEM_PURCHASED', 1056),
  ('EUW1_9900000001', 2, 1, 480000, 'ITEM_PURCHASED', 6657),
  ('EUW1_9900000002', 1, 1, 60000, 'ITEM_PURCHASED', 1056),
  ('EUW1_9900000002', 2, 1, 480000, 'ITEM_PURCHASED', 6657);

insert into public.role_pairs (
  match_id, role, blue_participant_id, red_participant_id, pairing_method, is_valid
)
values
  ('EUW1_9900000001', 'MIDDLE', 1, 6, 'team_position', true),
  ('EUW1_9900000002', 'MIDDLE', 1, 6, 'team_position', true);

select lives_ok(
  $$select public.refresh_public_analytics('99.99', 'EUW', 1)$$,
  'analytics refresh succeeds for a fixture patch'
);

select is(
  (select sample_size from public.champion_stats where patch = '99.99' and region = 'EUW' and champion_id = 38),
  2,
  'champion statistics count only tracked Challenger observations'
);
select is(
  (select sample_size from public.matchup_stats where patch = '99.99' and region = 'EUW' and champion_id = 38 and opponent_champion_id = 134),
  2,
  'directional matchup sample is built from both source games'
);
select is(
  (select win_rate from public.matchup_stats where patch = '99.99' and region = 'EUW' and champion_id = 38 and opponent_champion_id = 134),
  0.500000::numeric,
  'raw matchup win rate is calculated correctly'
);
select is(
  (select adjusted_win_rate from public.matchup_stats where patch = '99.99' and region = 'EUW' and champion_id = 38 and opponent_champion_id = 134),
  0.500000::numeric,
  'empirical-Bayes rate shrinks toward the champion baseline'
);
select is(
  (select avg_gold_diff_15 from public.matchup_stats where patch = '99.99' and region = 'EUW' and champion_id = 38 and opponent_champion_id = 134),
  200.0000::numeric,
  'nearest-to-15-minute frame gold difference is averaged'
);
select is(
  (select avg_cs_diff_15 from public.matchup_stats where patch = '99.99' and region = 'EUW' and champion_id = 38 and opponent_champion_id = 134),
  7.0000::numeric,
  'nearest-to-15-minute frame CS difference is averaged'
);
select is(
  (select early_game_sample_size from public.matchup_stats where patch = '99.99' and region = 'EUW' and champion_id = 38 and opponent_champion_id = 134),
  2,
  'early-game metric coverage is reported'
);
select is(
  (select player_concentration_hhi from public.matchup_stats where patch = '99.99' and region = 'EUW' and champion_id = 38 and opponent_champion_id = 134),
  0.500000::numeric,
  'player concentration HHI detects two equally weighted players'
);
select is(
  (select top_player_share from public.matchup_stats where patch = '99.99' and region = 'EUW' and champion_id = 38 and opponent_champion_id = 134),
  0.500000::numeric,
  'top-player share detects two equally weighted players'
);
select ok(
  (select wilson_low < win_rate and wilson_high > win_rate
   from public.matchup_stats
   where patch = '99.99' and region = 'EUW' and champion_id = 38 and opponent_champion_id = 134),
  'Wilson interval surrounds the observed rate'
);
select is(
  (select sample_size from public.item_build_stats where patch = '99.99' and region = 'EUW' and champion_id = 38 and opponent_champion_id = 134 and build_rank = 1),
  2,
  'matching item paths aggregate into one build sample'
);
select is(
  (select data_provenance from public.dataset_status where patch = '99.99' and region = 'EUW'),
  'live',
  'refresh marks generated aggregates as live data'
);

select * from finish();
rollback;
