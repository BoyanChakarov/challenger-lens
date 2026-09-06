-- SYNTHETIC PORTFOLIO DEMO DATA ONLY.
--
-- These aggregate rows are invented to make a fresh local UI explorable before
-- the Riot ingestion worker has collected enough observations. They must never
-- be presented as measured Riot statistics. The `data_provenance` column and
-- dataset note make that distinction machine-readable and visible to the UI.
--
-- Display patch 26.17 intentionally maps to Data Dragon/realm version 16.17.1.

begin;

insert into public.dataset_status (
  patch, region, queue_id, ddragon_version,
  oldest_game_at, latest_game_at, last_ingestion_at, analytics_refreshed_at,
  match_count, tracked_player_count, participant_observation_count,
  matchup_observation_count, status, data_provenance, data_quality_note
)
values
  (
    '26.17', 'EUW', 420, '16.17.1',
    '2026-08-27T00:00:00Z', '2026-09-04T22:30:00Z',
    '2026-09-05T00:10:00Z', '2026-09-05T00:20:00Z',
    1840, 296, 2310, 514, 'ready', 'synthetic',
    'Synthetic portfolio demo data — replace with a service-role analytics refresh before drawing conclusions.'
  ),
  (
    '26.17', 'EUNE', 420, '16.17.1',
    '2026-08-28T00:00:00Z', '2026-09-04T21:45:00Z',
    '2026-09-05T00:12:00Z', '2026-09-05T00:20:00Z',
    910, 183, 1184, 256, 'ready', 'synthetic',
    'Synthetic portfolio demo data — replace with a service-role analytics refresh before drawing conclusions.'
  )
on conflict (patch, region, queue_id) do nothing;

insert into public.champion_stats (
  patch, region, role, champion_id, champion_name,
  sample_size, wins, losses, win_rate, adjusted_win_rate, wilson_low, wilson_high,
  avg_kills, avg_deaths, avg_assists, avg_kda,
  avg_cs_per_min, avg_gold_per_min, avg_damage_per_min, avg_vision_per_min,
  avg_game_duration_min, unique_players, evidence_label, data_provenance, updated_at
)
values
  ('26.17', 'EUW',  'MIDDLE', 38,  'Kassadin', 182, 103, 79, 0.565934, 0.555104, 0.493281, 0.635882, 7.21, 4.62, 6.84, 3.38, 8.16, 431.70, 641.40, 0.71, 29.84, 61, 'strong',   'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUW',  'MIDDLE', 134, 'Syndra',   410, 211, 199, 0.514634, 0.513211, 0.466370, 0.562676, 6.84, 5.18, 7.92, 3.11, 8.42, 424.60, 702.80, 0.76, 29.41, 112, 'strong',  'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUW',  'MIDDLE', 103, 'Ahri',     355, 187, 168, 0.526761, 0.523942, 0.474812, 0.577997, 6.19, 4.73, 8.71, 3.62, 8.09, 418.20, 658.30, 0.83, 28.96, 104, 'strong',  'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUW',  'MIDDLE', 61,  'Orianna',  298, 150, 148, 0.503356, 0.504118, 0.446903, 0.559699, 5.44, 4.38, 9.53, 3.94, 8.67, 426.90, 681.10, 0.88, 30.12, 88,  'moderate','synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUNE', 'MIDDLE', 38,  'Kassadin',  96, 55, 41, 0.572917, 0.552682, 0.473058, 0.666957, 7.46, 4.54, 6.51, 3.49, 8.08, 434.10, 649.70, 0.68, 29.18, 30, 'moderate', 'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUNE', 'MIDDLE', 134, 'Syndra',   215, 108, 107, 0.502326, 0.503517, 0.435991, 0.568571, 6.71, 5.29, 7.61, 3.02, 8.31, 421.80, 695.40, 0.73, 28.87, 66, 'moderate', 'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUNE', 'MIDDLE', 112, 'Viktor',   164, 85, 79, 0.518293, 0.514792, 0.442272, 0.593558, 6.08, 4.92, 7.86, 3.18, 8.58, 427.30, 716.20, 0.70, 30.06, 49, 'moderate', 'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUNE', 'MIDDLE', 7,   'LeBlanc',  141, 70, 71, 0.496454, 0.500188, 0.414998, 0.577910, 7.13, 5.38, 6.29, 2.91, 7.73, 416.50, 671.90, 0.66, 27.92, 44, 'moderate', 'synthetic', '2026-09-05T00:20:00Z')
on conflict (patch, region, role, champion_id) do nothing;

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
values
  ('26.17', 'EUW',  'MIDDLE', 38,  'Kassadin', 134, 'Syndra',  86, 53, 33, 37, 0.616279, 0.606780, 0.565934, 0.511270, 0.712078,  214.4, -1.8,  138.6, 82,  0.48,   24.9, 0.035710, 0.069767, 'moderate', 54.80, 12.67, 'favorable',   'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUW',  'MIDDLE', 134, 'Syndra',   38, 'Kassadin', 72, 31, 41, 45, 0.430556, 0.448833, 0.514634, 0.321950, 0.545510, -182.7,  2.4, -119.3, 69, -0.39,  -18.5, 0.026620, 0.055556, 'moderate', 50.21, -8.94, 'unfavorable', 'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUW',  'MIDDLE', 103, 'Ahri',     134, 'Syndra', 104, 57, 47, 54, 0.548077, 0.544560, 0.526761, 0.452424, 0.640110,   73.9, -3.1,   51.8, 99,  0.21,   -5.2, 0.022910, 0.048077, 'strong',   61.42,  5.18, 'favorable',   'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUW',  'MIDDLE', 61,  'Orianna',  103, 'Ahri',    93, 46, 47, 42, 0.494624, 0.499051, 0.503356, 0.394770, 0.595490,  121.2,  4.9,   84.4, 90, -0.05,   13.4, 0.031240, 0.064516, 'moderate', 56.03,  1.17, 'neutral',      'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUNE', 'MIDDLE', 38,  'Kassadin', 134, 'Syndra',  47, 29, 18, 22, 0.617021, 0.603856, 0.572917, 0.475200, 0.742118,  196.1, -0.9,  104.7, 44,  0.52,   31.7, 0.058850, 0.106383, 'moderate', 35.64, 12.91, 'favorable',   'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUNE', 'MIDDLE', 134, 'Syndra',   38, 'Kassadin', 41, 17, 24, 26, 0.414634, 0.443382, 0.502326, 0.275900, 0.566143, -205.6,  1.7, -142.2, 39, -0.44,  -29.1, 0.046400, 0.097561, 'moderate', 33.02, -9.92, 'unfavorable', 'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUNE', 'MIDDLE', 112, 'Viktor',     7, 'LeBlanc', 38, 22, 16, 21, 0.578947, 0.558122, 0.518293, 0.411330, 0.728377,   88.8,  5.3,   63.1, 36,  0.31,   42.0, 0.056790, 0.105263, 'moderate', 31.27,  8.04, 'favorable',   'synthetic', '2026-09-05T00:20:00Z'),
  ('26.17', 'EUNE', 'MIDDLE', 7,   'LeBlanc',  112, 'Viktor',  35, 16, 19, 23, 0.457143, 0.472796, 0.496454, 0.297800, 0.625310,  -54.7, -6.2,  -40.8, 33, -0.18,  -37.5, 0.050280, 0.085714, 'moderate', 30.41, -5.71, 'unfavorable', 'synthetic', '2026-09-05T00:20:00Z')
on conflict (patch, region, role, champion_id, opponent_champion_id) do nothing;

insert into public.item_build_stats (
  patch, region, role, champion_id, champion_name,
  opponent_champion_id, opponent_champion_name,
  build_key, build_label, item_ids, item_names, purchase_sequence,
  sample_size, wins, losses, pick_rate, win_rate, adjusted_win_rate, build_rank,
  data_provenance, updated_at
)
values
  (
    '26.17', 'EUW', 'MIDDLE', 38, 'Kassadin', 134, 'Syndra',
    'demo-kassadin-syndra-roa', 'Rod of Ages scaling',
    array[6657, 3040, 3020], array['Rod of Ages', 'Seraph''s Embrace', 'Sorcerer''s Shoes'],
    array[1056, 1027, 1026, 6657, 3070, 3020, 3040],
    34, 23, 11, 0.395349, 0.676471, 0.641793, 1, 'synthetic', '2026-09-05T00:20:00Z'
  ),
  (
    '26.17', 'EUW', 'MIDDLE', 38, 'Kassadin', 134, 'Syndra',
    'demo-kassadin-syndra-malignance', 'Early Malignance',
    array[3118, 3040, 3158], array['Malignance', 'Seraph''s Embrace', 'Ionian Boots of Lucidity'],
    array[1056, 3070, 1027, 3118, 3158, 3040],
    21, 12, 9, 0.244186, 0.571429, 0.587588, 2, 'synthetic', '2026-09-05T00:20:00Z'
  ),
  (
    '26.17', 'EUW', 'MIDDLE', 134, 'Syndra', 38, 'Kassadin',
    'demo-syndra-kassadin-ludens', 'Luden burst',
    array[6655, 3020, 3089], array['Luden''s Companion', 'Sorcerer''s Shoes', 'Rabadon''s Deathcap'],
    array[1056, 1001, 1026, 6655, 3020, 3089],
    19, 9, 10, 0.263889, 0.473684, 0.465113, 1, 'synthetic', '2026-09-05T00:20:00Z'
  ),
  (
    '26.17', 'EUNE', 'MIDDLE', 38, 'Kassadin', 134, 'Syndra',
    'demo-eune-kassadin-syndra-roa', 'Rod of Ages scaling',
    array[6657, 3040, 3020], array['Rod of Ages', 'Seraph''s Embrace', 'Sorcerer''s Shoes'],
    array[1056, 1027, 6657, 3070, 3020, 3040],
    18, 12, 6, 0.382979, 0.666667, 0.627673, 1, 'synthetic', '2026-09-05T00:20:00Z'
  ),
  (
    '26.17', 'EUNE', 'MIDDLE', 112, 'Viktor', 7, 'LeBlanc',
    'demo-viktor-leblanc-defensive', 'Defensive second item',
    array[6653, 3157, 3020], array['Liandry''s Torment', 'Zhonya''s Hourglass', 'Sorcerer''s Shoes'],
    array[1056, 1026, 6653, 1001, 3191, 3157, 3020],
    14, 9, 5, 0.368421, 0.642857, 0.594372, 1, 'synthetic', '2026-09-05T00:20:00Z'
  )
on conflict (patch, region, role, champion_id, opponent_champion_id, build_key) do nothing;

commit;
