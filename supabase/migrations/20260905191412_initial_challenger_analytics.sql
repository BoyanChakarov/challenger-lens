-- Initial League of Legends Challenger analytics schema.
-- Designed for a fresh Supabase project; later changes belong in new migrations.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Server-only ingestion tables
-- ---------------------------------------------------------------------------

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline text not null,
  region text,
  patch text,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  requested_count integer not null default 0,
  discovered_count integer not null default 0,
  processed_count integer not null default 0,
  succeeded_count integer not null default 0,
  failed_count integer not null default 0,
  error_summary text,
  error_details jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ingestion_runs_pipeline_not_blank check (btrim(pipeline) <> ''),
  constraint ingestion_runs_region_check check (region is null or region in ('EUW', 'EUNE')),
  constraint ingestion_runs_patch_check check (patch is null or patch ~ '^[0-9]+\.[0-9]+$'),
  constraint ingestion_runs_status_check check (status in ('running', 'succeeded', 'partial', 'failed', 'cancelled')),
  constraint ingestion_runs_finished_after_started check (finished_at is null or finished_at >= started_at),
  constraint ingestion_runs_counts_nonnegative check (
    requested_count >= 0 and discovered_count >= 0 and processed_count >= 0
    and succeeded_count >= 0 and failed_count >= 0
  ),
  constraint ingestion_runs_error_details_object check (jsonb_typeof(error_details) = 'object'),
  constraint ingestion_runs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index ingestion_runs_pipeline_started_idx
  on public.ingestion_runs (pipeline, started_at desc);
create index ingestion_runs_status_started_idx
  on public.ingestion_runs (status, started_at desc);

create table public.ingestion_cursors (
  pipeline text not null,
  region text not null,
  cursor_key text not null,
  cursor_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  run_id uuid references public.ingestion_runs (id) on delete set null,
  primary key (pipeline, region, cursor_key),
  constraint ingestion_cursors_pipeline_not_blank check (btrim(pipeline) <> ''),
  constraint ingestion_cursors_region_check check (region in ('EUW', 'EUNE')),
  constraint ingestion_cursors_key_not_blank check (btrim(cursor_key) <> '')
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  puuid text not null unique,
  region text not null,
  platform_region text not null,
  summoner_id text,
  game_name text,
  tag_line text,
  profile_icon_id integer,
  summoner_level bigint,
  current_tier text,
  current_rank text,
  league_points integer,
  wins integer,
  losses integer,
  last_ladder_seen_at timestamptz not null default now(),
  raw_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_puuid_not_blank check (btrim(puuid) <> ''),
  constraint players_region_check check (region in ('EUW', 'EUNE')),
  constraint players_platform_region_check check (platform_region in ('EUW1', 'EUN1')),
  constraint players_region_platform_consistent check (
    (region = 'EUW' and platform_region = 'EUW1')
    or (region = 'EUNE' and platform_region = 'EUN1')
  ),
  constraint players_rank_counts_nonnegative check (
    (league_points is null or league_points >= 0)
    and (wins is null or wins >= 0)
    and (losses is null or losses >= 0)
  ),
  constraint players_raw_profile_object check (jsonb_typeof(raw_profile) = 'object')
);

create unique index players_region_summoner_id_uidx
  on public.players (region, summoner_id)
  where summoner_id is not null;
create index players_region_ladder_seen_idx
  on public.players (region, last_ladder_seen_at desc);

create table public.ladder_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.ingestion_runs (id) on delete set null,
  region text not null,
  platform_region text not null,
  queue_type text not null default 'RANKED_SOLO_5x5',
  tier text not null default 'CHALLENGER',
  patch text,
  fetched_at timestamptz not null default now(),
  entry_count integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ladder_snapshots_region_check check (region in ('EUW', 'EUNE')),
  constraint ladder_snapshots_platform_region_check check (platform_region in ('EUW1', 'EUN1')),
  constraint ladder_snapshots_region_platform_consistent check (
    (region = 'EUW' and platform_region = 'EUW1')
    or (region = 'EUNE' and platform_region = 'EUN1')
  ),
  constraint ladder_snapshots_queue_check check (queue_type = 'RANKED_SOLO_5x5'),
  constraint ladder_snapshots_tier_check check (tier = 'CHALLENGER'),
  constraint ladder_snapshots_patch_check check (patch is null or patch ~ '^[0-9]+\.[0-9]+$'),
  constraint ladder_snapshots_entry_count_nonnegative check (entry_count >= 0),
  constraint ladder_snapshots_raw_payload_object check (jsonb_typeof(raw_payload) = 'object'),
  unique (region, queue_type, tier, fetched_at)
);

create index ladder_snapshots_region_fetched_idx
  on public.ladder_snapshots (region, fetched_at desc);

create table public.ladder_entries (
  snapshot_id uuid not null references public.ladder_snapshots (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  league_points integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  rank_position integer,
  veteran boolean not null default false,
  inactive boolean not null default false,
  fresh_blood boolean not null default false,
  hot_streak boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, player_id),
  constraint ladder_entries_counts_nonnegative check (
    league_points >= 0 and wins >= 0 and losses >= 0
    and (rank_position is null or rank_position > 0)
  ),
  constraint ladder_entries_raw_payload_object check (jsonb_typeof(raw_payload) = 'object')
);

create index ladder_entries_player_snapshot_idx
  on public.ladder_entries (player_id, snapshot_id);
create index ladder_entries_snapshot_rank_idx
  on public.ladder_entries (snapshot_id, rank_position)
  where rank_position is not null;

create table public.matches (
  match_id text primary key,
  run_id uuid references public.ingestion_runs (id) on delete set null,
  region text not null,
  platform_region text not null,
  regional_route text not null default 'EUROPE',
  queue_id integer not null,
  map_id integer not null,
  game_mode text not null,
  game_type text not null,
  game_version text not null,
  ddragon_version text,
  patch text not null,
  game_creation timestamptz,
  game_start timestamptz,
  game_end timestamptz,
  duration_seconds integer not null,
  data_version text,
  winning_team_id smallint,
  timeline_status text not null default 'pending',
  raw_payload jsonb not null,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_match_id_not_blank check (btrim(match_id) <> ''),
  constraint matches_region_check check (region in ('EUW', 'EUNE')),
  constraint matches_platform_region_check check (platform_region in ('EUW1', 'EUN1')),
  constraint matches_region_platform_consistent check (
    (region = 'EUW' and platform_region = 'EUW1')
    or (region = 'EUNE' and platform_region = 'EUN1')
  ),
  constraint matches_route_check check (regional_route = 'EUROPE'),
  constraint matches_ddragon_version_check check (
    ddragon_version is null or ddragon_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  constraint matches_patch_check check (patch ~ '^[0-9]+\.[0-9]+$'),
  constraint matches_duration_positive check (duration_seconds > 0),
  constraint matches_time_order check (
    (game_start is null or game_end is null or game_end >= game_start)
    and (game_creation is null or game_start is null or game_start >= game_creation)
  ),
  constraint matches_winning_team_check check (winning_team_id is null or winning_team_id in (100, 200)),
  constraint matches_timeline_status_check check (timeline_status in ('pending', 'complete', 'unavailable', 'failed')),
  constraint matches_raw_payload_object check (jsonb_typeof(raw_payload) = 'object')
);

create index matches_patch_region_end_idx
  on public.matches (patch, region, game_end desc);
create index matches_region_queue_end_idx
  on public.matches (region, queue_id, game_end desc);
create index matches_timeline_retry_idx
  on public.matches (timeline_status, updated_at)
  where timeline_status in ('pending', 'failed');

create table public.match_exclusions (
  match_id text primary key,
  run_id uuid references public.ingestion_runs (id) on delete set null,
  region text not null,
  platform_region text not null,
  filter_reason text not null,
  game_version text not null,
  evaluated_against_patch text not null,
  queue_id integer not null,
  map_id integer not null,
  duration_seconds integer not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint match_exclusions_match_id_not_blank check (btrim(match_id) <> ''),
  constraint match_exclusions_region_check check (region in ('EUW', 'EUNE')),
  constraint match_exclusions_platform_check check (platform_region in ('EUW1', 'EUN1')),
  constraint match_exclusions_region_platform_consistent check (
    (region = 'EUW' and platform_region = 'EUW1')
    or (region = 'EUNE' and platform_region = 'EUN1')
  ),
  constraint match_exclusions_reason_check check (
    filter_reason in ('wrong_queue', 'wrong_map', 'short_game', 'old_patch')
  ),
  constraint match_exclusions_patch_check check (evaluated_against_patch ~ '^[0-9]+\.[0-9]+$'),
  constraint match_exclusions_duration_nonnegative check (duration_seconds >= 0)
);

create index match_exclusions_region_reason_idx
  on public.match_exclusions (region, filter_reason, last_seen_at desc);

create table public.match_sources (
  match_id text not null references public.matches (match_id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  ladder_snapshot_id uuid references public.ladder_snapshots (id) on delete set null,
  run_id uuid references public.ingestion_runs (id) on delete set null,
  source_type text not null default 'challenger_ladder',
  discovered_at timestamptz not null default now(),
  rank_at_discovery integer,
  primary key (match_id, player_id),
  constraint match_sources_type_check check (source_type in ('challenger_ladder', 'backfill', 'manual')),
  constraint match_sources_rank_positive check (rank_at_discovery is null or rank_at_discovery > 0)
);

create index match_sources_player_discovered_idx
  on public.match_sources (player_id, discovered_at desc);

create table public.match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches (match_id) on delete cascade,
  participant_id smallint not null,
  player_id uuid references public.players (id) on delete set null,
  puuid text not null,
  team_id smallint not null,
  champion_id integer not null,
  champion_name text not null,
  team_position text,
  individual_position text,
  lane text,
  role text not null default 'UNKNOWN',
  win boolean not null,
  kills integer not null default 0,
  deaths integer not null default 0,
  assists integer not null default 0,
  total_minions_killed integer not null default 0,
  neutral_minions_killed integer not null default 0,
  cs integer not null default 0,
  gold_earned integer not null default 0,
  champ_level integer not null default 1,
  damage_to_champions integer not null default 0,
  damage_taken integer not null default 0,
  vision_score integer not null default 0,
  wards_placed integer not null default 0,
  wards_killed integer not null default 0,
  control_wards_bought integer not null default 0,
  summoner_spell_1_id integer,
  summoner_spell_2_id integer,
  final_item_ids integer[] not null default '{}'::integer[],
  perks jsonb not null default '{}'::jsonb,
  challenges jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint match_participants_participant_id_check check (participant_id between 1 and 10),
  constraint match_participants_puuid_not_blank check (btrim(puuid) <> ''),
  constraint match_participants_team_check check (team_id in (100, 200)),
  constraint match_participants_champion_positive check (champion_id > 0 and btrim(champion_name) <> ''),
  constraint match_participants_role_check check (role in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'UNKNOWN')),
  constraint match_participants_stats_nonnegative check (
    kills >= 0 and deaths >= 0 and assists >= 0
    and total_minions_killed >= 0 and neutral_minions_killed >= 0 and cs >= 0
    and gold_earned >= 0 and champ_level >= 1
    and damage_to_champions >= 0 and damage_taken >= 0 and vision_score >= 0
    and wards_placed >= 0 and wards_killed >= 0 and control_wards_bought >= 0
  ),
  constraint match_participants_item_ids_nonnegative check (
    0 <= all (final_item_ids)
  ),
  constraint match_participants_perks_object check (jsonb_typeof(perks) = 'object'),
  constraint match_participants_challenges_object check (jsonb_typeof(challenges) = 'object'),
  constraint match_participants_raw_payload_object check (jsonb_typeof(raw_payload) = 'object'),
  unique (match_id, participant_id),
  unique (match_id, puuid)
);

create unique index match_participants_match_player_uidx
  on public.match_participants (match_id, player_id)
  where player_id is not null;
create index match_participants_champion_role_idx
  on public.match_participants (champion_id, role, match_id);

create table public.participant_frames (
  match_id text not null,
  participant_id smallint not null,
  timestamp_ms integer not null,
  total_gold integer not null,
  current_gold integer not null,
  level integer not null,
  xp integer not null,
  minions_killed integer not null,
  jungle_minions_killed integer not null,
  position_x integer,
  position_y integer,
  damage_stats jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  primary key (match_id, participant_id, timestamp_ms),
  foreign key (match_id, participant_id)
    references public.match_participants (match_id, participant_id) on delete cascade,
  constraint participant_frames_participant_id_check check (participant_id between 1 and 10),
  constraint participant_frames_values_nonnegative check (
    timestamp_ms >= 0 and total_gold >= 0 and current_gold >= 0 and level >= 1
    and xp >= 0 and minions_killed >= 0 and jungle_minions_killed >= 0
  ),
  constraint participant_frames_damage_stats_object check (jsonb_typeof(damage_stats) = 'object'),
  constraint participant_frames_raw_payload_object check (jsonb_typeof(raw_payload) = 'object')
);

create index participant_frames_fifteen_minute_idx
  on public.participant_frames (match_id, participant_id, timestamp_ms)
  where timestamp_ms between 840000 and 960000;

create table public.item_events (
  match_id text not null references public.matches (match_id) on delete cascade,
  event_index integer not null,
  participant_id smallint not null,
  timestamp_ms integer not null,
  event_type text not null,
  item_id integer,
  before_id integer,
  after_id integer,
  raw_payload jsonb not null default '{}'::jsonb,
  primary key (match_id, event_index),
  foreign key (match_id, participant_id)
    references public.match_participants (match_id, participant_id) on delete cascade,
  constraint item_events_event_index_nonnegative check (event_index >= 0),
  constraint item_events_participant_id_check check (participant_id between 1 and 10),
  constraint item_events_timestamp_nonnegative check (timestamp_ms >= 0),
  constraint item_events_type_check check (
    event_type in ('ITEM_PURCHASED', 'ITEM_SOLD', 'ITEM_DESTROYED', 'ITEM_UNDO')
  ),
  constraint item_events_ids_nonnegative check (
    (item_id is null or item_id >= 0)
    and (before_id is null or before_id >= 0)
    and (after_id is null or after_id >= 0)
  ),
  constraint item_events_raw_payload_object check (jsonb_typeof(raw_payload) = 'object')
);

create index item_events_participant_time_idx
  on public.item_events (match_id, participant_id, timestamp_ms, event_index);

create table public.role_pairs (
  match_id text not null references public.matches (match_id) on delete cascade,
  role text not null,
  blue_participant_id smallint not null,
  red_participant_id smallint not null,
  pairing_method text not null default 'team_position',
  is_valid boolean not null default true,
  quality_reason text,
  created_at timestamptz not null default now(),
  primary key (match_id, role),
  foreign key (match_id, blue_participant_id)
    references public.match_participants (match_id, participant_id) on delete cascade,
  foreign key (match_id, red_participant_id)
    references public.match_participants (match_id, participant_id) on delete cascade,
  constraint role_pairs_role_check check (role in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY')),
  constraint role_pairs_distinct_participants check (blue_participant_id <> red_participant_id),
  constraint role_pairs_participant_ids_check check (
    blue_participant_id between 1 and 10 and red_participant_id between 1 and 10
  ),
  constraint role_pairs_method_check check (pairing_method in ('team_position', 'inferred', 'manual'))
);

create index role_pairs_valid_role_idx
  on public.role_pairs (role, match_id)
  where is_valid;

-- ---------------------------------------------------------------------------
-- Browser-readable, precomputed analytics tables
-- ---------------------------------------------------------------------------

create table public.dataset_status (
  patch text not null,
  region text not null,
  queue_id integer not null default 420,
  ddragon_version text,
  oldest_game_at timestamptz,
  latest_game_at timestamptz,
  last_ingestion_at timestamptz,
  analytics_refreshed_at timestamptz not null default now(),
  match_count integer not null default 0,
  tracked_player_count integer not null default 0,
  participant_observation_count integer not null default 0,
  matchup_observation_count integer not null default 0,
  status text not null default 'ready',
  data_provenance text not null default 'live',
  data_quality_note text,
  primary key (patch, region, queue_id),
  constraint dataset_status_patch_check check (patch ~ '^[0-9]+\.[0-9]+$'),
  constraint dataset_status_ddragon_version_check check (
    ddragon_version is null or ddragon_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  constraint dataset_status_region_check check (region in ('EUW', 'EUNE')),
  constraint dataset_status_counts_nonnegative check (
    match_count >= 0 and tracked_player_count >= 0
    and participant_observation_count >= 0 and matchup_observation_count >= 0
  ),
  constraint dataset_status_status_check check (status in ('collecting', 'ready', 'stale', 'error')),
  constraint dataset_status_provenance_check check (data_provenance in ('live', 'synthetic'))
);

create table public.champion_stats (
  patch text not null,
  region text not null,
  role text not null,
  champion_id integer not null,
  champion_name text not null,
  sample_size integer not null,
  wins integer not null,
  losses integer not null,
  win_rate numeric(8, 6) not null,
  adjusted_win_rate numeric(8, 6) not null,
  wilson_low numeric(8, 6) not null,
  wilson_high numeric(8, 6) not null,
  avg_kills numeric(10, 4) not null,
  avg_deaths numeric(10, 4) not null,
  avg_assists numeric(10, 4) not null,
  avg_kda numeric(10, 4) not null,
  avg_cs_per_min numeric(10, 4) not null,
  avg_gold_per_min numeric(10, 4) not null,
  avg_damage_per_min numeric(10, 4) not null,
  avg_vision_per_min numeric(10, 4) not null,
  avg_game_duration_min numeric(10, 4) not null,
  unique_players integer not null,
  evidence_label text not null,
  data_provenance text not null default 'live',
  updated_at timestamptz not null default now(),
  primary key (patch, region, role, champion_id),
  constraint champion_stats_patch_check check (patch ~ '^[0-9]+\.[0-9]+$'),
  constraint champion_stats_region_check check (region in ('EUW', 'EUNE')),
  constraint champion_stats_role_check check (role in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY')),
  constraint champion_stats_counts_check check (
    champion_id > 0 and sample_size > 0 and wins >= 0 and losses >= 0
    and wins + losses = sample_size and unique_players > 0
  ),
  constraint champion_stats_rates_check check (
    win_rate between 0 and 1 and adjusted_win_rate between 0 and 1
    and wilson_low between 0 and 1 and wilson_high between 0 and 1
    and wilson_low <= wilson_high
  ),
  constraint champion_stats_evidence_check check (evidence_label in ('strong', 'moderate', 'limited', 'insufficient')),
  constraint champion_stats_provenance_check check (data_provenance in ('live', 'synthetic'))
);

create index champion_stats_discovery_idx
  on public.champion_stats (patch, region, role, adjusted_win_rate desc, sample_size desc);

create table public.matchup_stats (
  patch text not null,
  region text not null,
  role text not null,
  champion_id integer not null,
  champion_name text not null,
  opponent_champion_id integer not null,
  opponent_champion_name text not null,
  sample_size integer not null,
  wins integer not null,
  losses integer not null,
  unique_players integer not null,
  win_rate numeric(8, 6) not null,
  adjusted_win_rate numeric(8, 6) not null,
  baseline_win_rate numeric(8, 6) not null,
  wilson_low numeric(8, 6) not null,
  wilson_high numeric(8, 6) not null,
  avg_gold_diff_15 numeric(12, 4),
  avg_cs_diff_15 numeric(12, 4),
  avg_xp_diff_15 numeric(12, 4),
  early_game_sample_size integer not null default 0,
  avg_kda_diff numeric(12, 4) not null,
  avg_damage_diff_per_min numeric(12, 4) not null,
  player_concentration_hhi numeric(8, 6) not null,
  top_player_share numeric(8, 6) not null,
  evidence_label text not null,
  confidence_score numeric(8, 4) not null,
  counter_score numeric(12, 4) not null,
  prediction_label text not null,
  data_provenance text not null default 'live',
  updated_at timestamptz not null default now(),
  primary key (patch, region, role, champion_id, opponent_champion_id),
  constraint matchup_stats_patch_check check (patch ~ '^[0-9]+\.[0-9]+$'),
  constraint matchup_stats_region_check check (region in ('EUW', 'EUNE')),
  constraint matchup_stats_role_check check (role in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY')),
  constraint matchup_stats_distinct_champions check (
    champion_id > 0 and opponent_champion_id > 0 and champion_id <> opponent_champion_id
  ),
  constraint matchup_stats_counts_check check (
    sample_size > 0 and wins >= 0 and losses >= 0 and wins + losses = sample_size
    and unique_players > 0 and early_game_sample_size between 0 and sample_size
  ),
  constraint matchup_stats_rates_check check (
    win_rate between 0 and 1 and adjusted_win_rate between 0 and 1
    and baseline_win_rate between 0 and 1
    and wilson_low between 0 and 1 and wilson_high between 0 and 1
    and wilson_low <= wilson_high
    and player_concentration_hhi between 0 and 1
    and top_player_share between 0 and 1
    and confidence_score between 0 and 100
  ),
  constraint matchup_stats_evidence_check check (evidence_label in ('strong', 'moderate', 'limited', 'insufficient')),
  constraint matchup_stats_prediction_check check (prediction_label in ('favorable', 'neutral', 'unfavorable')),
  constraint matchup_stats_provenance_check check (data_provenance in ('live', 'synthetic'))
);

create index matchup_stats_counter_idx
  on public.matchup_stats (patch, region, role, champion_id, counter_score desc);
create index matchup_stats_opponent_idx
  on public.matchup_stats (patch, region, role, opponent_champion_id, adjusted_win_rate desc);

create table public.item_build_stats (
  patch text not null,
  region text not null,
  role text not null,
  champion_id integer not null,
  champion_name text not null,
  opponent_champion_id integer not null,
  opponent_champion_name text not null,
  build_key text not null,
  build_label text,
  item_ids integer[] not null,
  item_names text[] not null default '{}'::text[],
  purchase_sequence integer[] not null default '{}'::integer[],
  sample_size integer not null,
  wins integer not null,
  losses integer not null,
  pick_rate numeric(8, 6) not null,
  win_rate numeric(8, 6) not null,
  adjusted_win_rate numeric(8, 6) not null,
  build_rank integer not null,
  data_provenance text not null default 'live',
  updated_at timestamptz not null default now(),
  primary key (patch, region, role, champion_id, opponent_champion_id, build_key),
  constraint item_build_stats_patch_check check (patch ~ '^[0-9]+\.[0-9]+$'),
  constraint item_build_stats_region_check check (region in ('EUW', 'EUNE')),
  constraint item_build_stats_role_check check (role in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY')),
  constraint item_build_stats_champions_check check (
    champion_id > 0 and opponent_champion_id > 0 and champion_id <> opponent_champion_id
  ),
  constraint item_build_stats_build_key_not_blank check (btrim(build_key) <> ''),
  constraint item_build_stats_item_ids_nonnegative check (0 <= all (item_ids) and 0 <= all (purchase_sequence)),
  constraint item_build_stats_counts_check check (
    sample_size > 0 and wins >= 0 and losses >= 0 and wins + losses = sample_size and build_rank > 0
  ),
  constraint item_build_stats_rates_check check (
    pick_rate between 0 and 1 and win_rate between 0 and 1 and adjusted_win_rate between 0 and 1
  ),
  constraint item_build_stats_provenance_check check (data_provenance in ('live', 'synthetic'))
);

create index item_build_stats_lookup_idx
  on public.item_build_stats (patch, region, role, champion_id, opponent_champion_id, build_rank);

-- ---------------------------------------------------------------------------
-- Analytics refresh RPC
-- ---------------------------------------------------------------------------

create or replace function public.refresh_public_analytics(
  p_patch text default null,
  p_region text default null,
  p_min_games integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_refreshed_at timestamptz := pg_catalog.clock_timestamp();
  v_champion_rows integer := 0;
  v_matchup_rows integer := 0;
  v_item_rows integer := 0;
  v_dataset_rows integer := 0;
begin
  if p_patch is not null and p_patch !~ '^[0-9]+\.[0-9]+$' then
    raise exception 'p_patch must look like major.minor (received %)', p_patch
      using errcode = '22023';
  end if;

  if p_region is not null and p_region not in ('EUW', 'EUNE') then
    raise exception 'p_region must be EUW or EUNE (received %)', p_region
      using errcode = '22023';
  end if;

  if p_min_games is null or p_min_games < 1 then
    raise exception 'p_min_games must be at least 1'
      using errcode = '22023';
  end if;

  -- Prevent overlapping refreshes from interleaving their delete/insert phases.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.refresh_public_analytics', 0)
  );

  delete from public.item_build_stats
  where (p_patch is null or patch = p_patch)
    and (p_region is null or region = p_region);

  delete from public.matchup_stats
  where (p_patch is null or patch = p_patch)
    and (p_region is null or region = p_region);

  delete from public.champion_stats
  where (p_patch is null or patch = p_patch)
    and (p_region is null or region = p_region);

  delete from public.dataset_status
  where (p_patch is null or patch = p_patch)
    and (p_region is null or region = p_region);

  with source_participants as (
    select
      m.patch,
      m.region,
      mp.role,
      mp.champion_id,
      mp.champion_name,
      mp.puuid,
      mp.win,
      mp.kills,
      mp.deaths,
      mp.assists,
      mp.cs,
      mp.gold_earned,
      mp.damage_to_champions,
      mp.vision_score,
      m.duration_seconds
    from public.matches m
    join public.match_participants mp on mp.match_id = m.match_id
    join public.match_sources ms
      on ms.match_id = m.match_id and ms.player_id = mp.player_id
    where m.queue_id = 420
      and m.map_id = 11
      and m.duration_seconds >= 600
      and m.timeline_status in ('complete', 'unavailable')
      and mp.role in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY')
      and (p_patch is null or m.patch = p_patch)
      and (p_region is null or m.region = p_region)
  ),
  role_priors as (
    select
      patch,
      region,
      role,
      count(*)::integer as prior_n,
      (count(*) filter (where win))::numeric / count(*)::numeric as prior_rate
    from source_participants
    group by patch, region, role
  ),
  grouped as (
    select
      patch,
      region,
      role,
      champion_id,
      max(champion_name) as champion_name,
      count(*)::integer as sample_size,
      (count(*) filter (where win))::integer as wins,
      (count(*) filter (where not win))::integer as losses,
      count(distinct puuid)::integer as unique_players,
      avg(kills::numeric) as avg_kills,
      avg(deaths::numeric) as avg_deaths,
      avg(assists::numeric) as avg_assists,
      avg((kills + assists)::numeric / greatest(deaths, 1)::numeric) as avg_kda,
      avg(cs::numeric * 60.0 / duration_seconds::numeric) as avg_cs_per_min,
      avg(gold_earned::numeric * 60.0 / duration_seconds::numeric) as avg_gold_per_min,
      avg(damage_to_champions::numeric * 60.0 / duration_seconds::numeric) as avg_damage_per_min,
      avg(vision_score::numeric * 60.0 / duration_seconds::numeric) as avg_vision_per_min,
      avg(duration_seconds::numeric / 60.0) as avg_game_duration_min
    from source_participants
    group by patch, region, role, champion_id
    having count(*) >= p_min_games
  ),
  scored as (
    select
      g.*,
      g.wins::numeric / g.sample_size::numeric as raw_rate,
      (g.wins::numeric + 20.0 * rp.prior_rate) / (g.sample_size::numeric + 20.0) as adjusted_rate,
      (
        (g.wins::numeric / g.sample_size::numeric) + 3.8416 / (2.0 * g.sample_size::numeric)
        - 1.96 * pg_catalog.sqrt(
          ((g.wins::numeric / g.sample_size::numeric) * (1.0 - g.wins::numeric / g.sample_size::numeric)
            + 3.8416 / (4.0 * g.sample_size::numeric)) / g.sample_size::numeric
        )
      ) / (1.0 + 3.8416 / g.sample_size::numeric) as wilson_low,
      (
        (g.wins::numeric / g.sample_size::numeric) + 3.8416 / (2.0 * g.sample_size::numeric)
        + 1.96 * pg_catalog.sqrt(
          ((g.wins::numeric / g.sample_size::numeric) * (1.0 - g.wins::numeric / g.sample_size::numeric)
            + 3.8416 / (4.0 * g.sample_size::numeric)) / g.sample_size::numeric
        )
      ) / (1.0 + 3.8416 / g.sample_size::numeric) as wilson_high
    from grouped g
    join role_priors rp using (patch, region, role)
  )
  insert into public.champion_stats (
    patch, region, role, champion_id, champion_name,
    sample_size, wins, losses, win_rate, adjusted_win_rate, wilson_low, wilson_high,
    avg_kills, avg_deaths, avg_assists, avg_kda, avg_cs_per_min, avg_gold_per_min,
    avg_damage_per_min, avg_vision_per_min, avg_game_duration_min, unique_players,
    evidence_label, data_provenance, updated_at
  )
  select
    patch,
    region,
    role,
    champion_id,
    champion_name,
    sample_size,
    wins,
    losses,
    raw_rate,
    adjusted_rate,
    greatest(0.0, wilson_low),
    least(1.0, wilson_high),
    avg_kills,
    avg_deaths,
    avg_assists,
    avg_kda,
    avg_cs_per_min,
    avg_gold_per_min,
    avg_damage_per_min,
    avg_vision_per_min,
    avg_game_duration_min,
    unique_players,
    case
      when sample_size >= 100 and unique_players >= 20 then 'strong'
      when sample_size >= 30 and unique_players >= 8 then 'moderate'
      when sample_size >= 10 and unique_players >= 3 then 'limited'
      else 'insufficient'
    end,
    'live',
    v_refreshed_at
  from scored;

  get diagnostics v_champion_rows = row_count;

  with pair_base as (
    select
      m.match_id,
      m.patch,
      m.region,
      m.duration_seconds,
      rp.role,
      blue.participant_id as blue_participant_id,
      blue.player_id as blue_player_id,
      blue.puuid as blue_puuid,
      blue.champion_id as blue_champion_id,
      blue.champion_name as blue_champion_name,
      blue.win as blue_win,
      blue.kills as blue_kills,
      blue.deaths as blue_deaths,
      blue.assists as blue_assists,
      blue.damage_to_champions as blue_damage,
      red.participant_id as red_participant_id,
      red.player_id as red_player_id,
      red.puuid as red_puuid,
      red.champion_id as red_champion_id,
      red.champion_name as red_champion_name,
      red.win as red_win,
      red.kills as red_kills,
      red.deaths as red_deaths,
      red.assists as red_assists,
      red.damage_to_champions as red_damage,
      bf.timestamp_ms as blue_frame_at,
      bf.total_gold as blue_gold_15,
      (bf.minions_killed + bf.jungle_minions_killed) as blue_cs_15,
      bf.xp as blue_xp_15,
      rf.timestamp_ms as red_frame_at,
      rf.total_gold as red_gold_15,
      (rf.minions_killed + rf.jungle_minions_killed) as red_cs_15,
      rf.xp as red_xp_15
    from public.role_pairs rp
    join public.matches m on m.match_id = rp.match_id
    join public.match_participants blue
      on blue.match_id = rp.match_id and blue.participant_id = rp.blue_participant_id
    join public.match_participants red
      on red.match_id = rp.match_id and red.participant_id = rp.red_participant_id
    left join lateral (
      select pf.timestamp_ms, pf.total_gold, pf.minions_killed, pf.jungle_minions_killed, pf.xp
      from public.participant_frames pf
      where pf.match_id = rp.match_id
        and pf.participant_id = rp.blue_participant_id
        and pf.timestamp_ms between 840000 and 960000
      order by abs(pf.timestamp_ms - 900000), pf.timestamp_ms
      limit 1
    ) bf on true
    left join lateral (
      select pf.timestamp_ms, pf.total_gold, pf.minions_killed, pf.jungle_minions_killed, pf.xp
      from public.participant_frames pf
      where pf.match_id = rp.match_id
        and pf.participant_id = rp.red_participant_id
        and pf.timestamp_ms between 840000 and 960000
      order by abs(pf.timestamp_ms - 900000), pf.timestamp_ms
      limit 1
    ) rf on true
    where rp.is_valid
      and m.queue_id = 420
      and m.map_id = 11
      and m.duration_seconds >= 600
      and m.timeline_status in ('complete', 'unavailable')
      and blue.team_id = 100
      and red.team_id = 200
      and blue.champion_id <> red.champion_id
      and (p_patch is null or m.patch = p_patch)
      and (p_region is null or m.region = p_region)
  ),
  oriented as (
    select
      pb.match_id,
      pb.patch,
      pb.region,
      pb.duration_seconds,
      pb.role,
      pb.blue_player_id as focal_player_id,
      pb.blue_puuid as focal_puuid,
      pb.blue_champion_id as champion_id,
      pb.blue_champion_name as champion_name,
      pb.red_champion_id as opponent_champion_id,
      pb.red_champion_name as opponent_champion_name,
      pb.blue_win as win,
      case when pb.blue_frame_at is not null and pb.red_frame_at is not null
        then pb.blue_gold_15 - pb.red_gold_15 end as gold_diff_15,
      case when pb.blue_frame_at is not null and pb.red_frame_at is not null
        then pb.blue_cs_15 - pb.red_cs_15 end as cs_diff_15,
      case when pb.blue_frame_at is not null and pb.red_frame_at is not null
        then pb.blue_xp_15 - pb.red_xp_15 end as xp_diff_15,
      ((pb.blue_kills + pb.blue_assists)::numeric / greatest(pb.blue_deaths, 1)::numeric)
        - ((pb.red_kills + pb.red_assists)::numeric / greatest(pb.red_deaths, 1)::numeric) as kda_diff,
      (pb.blue_damage - pb.red_damage)::numeric * 60.0 / pb.duration_seconds::numeric as damage_diff_per_min
    from pair_base pb
    join public.match_sources ms
      on ms.match_id = pb.match_id and ms.player_id = pb.blue_player_id

    union all

    select
      pb.match_id,
      pb.patch,
      pb.region,
      pb.duration_seconds,
      pb.role,
      pb.red_player_id,
      pb.red_puuid,
      pb.red_champion_id,
      pb.red_champion_name,
      pb.blue_champion_id,
      pb.blue_champion_name,
      pb.red_win,
      case when pb.blue_frame_at is not null and pb.red_frame_at is not null
        then pb.red_gold_15 - pb.blue_gold_15 end,
      case when pb.blue_frame_at is not null and pb.red_frame_at is not null
        then pb.red_cs_15 - pb.blue_cs_15 end,
      case when pb.blue_frame_at is not null and pb.red_frame_at is not null
        then pb.red_xp_15 - pb.blue_xp_15 end,
      ((pb.red_kills + pb.red_assists)::numeric / greatest(pb.red_deaths, 1)::numeric)
        - ((pb.blue_kills + pb.blue_assists)::numeric / greatest(pb.blue_deaths, 1)::numeric),
      (pb.red_damage - pb.blue_damage)::numeric * 60.0 / pb.duration_seconds::numeric
    from pair_base pb
    join public.match_sources ms
      on ms.match_id = pb.match_id and ms.player_id = pb.red_player_id
  ),
  player_counts as (
    select
      patch, region, role, champion_id, opponent_champion_id, focal_puuid,
      count(*)::integer as player_games
    from oriented
    group by patch, region, role, champion_id, opponent_champion_id, focal_puuid
  ),
  concentration as (
    select
      patch,
      region,
      role,
      champion_id,
      opponent_champion_id,
      count(*)::integer as unique_players,
      sum(player_games)::integer as total_games,
      sum(player_games::numeric * player_games::numeric)
        / (sum(player_games)::numeric ^ 2) as hhi,
      max(player_games)::numeric / sum(player_games)::numeric as top_player_share
    from player_counts
    group by patch, region, role, champion_id, opponent_champion_id
  ),
  grouped as (
    select
      o.patch,
      o.region,
      o.role,
      o.champion_id,
      max(o.champion_name) as champion_name,
      o.opponent_champion_id,
      max(o.opponent_champion_name) as opponent_champion_name,
      count(*)::integer as sample_size,
      (count(*) filter (where o.win))::integer as wins,
      (count(*) filter (where not o.win))::integer as losses,
      avg(o.gold_diff_15::numeric) as avg_gold_diff_15,
      avg(o.cs_diff_15::numeric) as avg_cs_diff_15,
      avg(o.xp_diff_15::numeric) as avg_xp_diff_15,
      (count(*) filter (where o.gold_diff_15 is not null))::integer as early_game_sample_size,
      avg(o.kda_diff) as avg_kda_diff,
      avg(o.damage_diff_per_min) as avg_damage_diff_per_min
    from oriented o
    group by o.patch, o.region, o.role, o.champion_id, o.opponent_champion_id
    having count(*) >= p_min_games
  ),
  scored as (
    select
      g.*,
      c.unique_players,
      c.hhi,
      c.top_player_share,
      g.wins::numeric / g.sample_size::numeric as raw_rate,
      (g.wins::numeric + 20.0 * coalesce(cs.win_rate, 0.5))
        / (g.sample_size::numeric + 20.0) as adjusted_rate,
      coalesce(cs.win_rate, 0.5) as baseline_rate,
      (
        (g.wins::numeric / g.sample_size::numeric) + 3.8416 / (2.0 * g.sample_size::numeric)
        - 1.96 * pg_catalog.sqrt(
          ((g.wins::numeric / g.sample_size::numeric) * (1.0 - g.wins::numeric / g.sample_size::numeric)
            + 3.8416 / (4.0 * g.sample_size::numeric)) / g.sample_size::numeric
        )
      ) / (1.0 + 3.8416 / g.sample_size::numeric) as wilson_low,
      (
        (g.wins::numeric / g.sample_size::numeric) + 3.8416 / (2.0 * g.sample_size::numeric)
        + 1.96 * pg_catalog.sqrt(
          ((g.wins::numeric / g.sample_size::numeric) * (1.0 - g.wins::numeric / g.sample_size::numeric)
            + 3.8416 / (4.0 * g.sample_size::numeric)) / g.sample_size::numeric
        )
      ) / (1.0 + 3.8416 / g.sample_size::numeric) as wilson_high
    from grouped g
    join concentration c using (patch, region, role, champion_id, opponent_champion_id)
    left join public.champion_stats cs
      on cs.patch = g.patch and cs.region = g.region and cs.role = g.role
      and cs.champion_id = g.champion_id
  ),
  predictions as (
    select
      s.*,
      greatest(0.0, least(100.0,
        pg_catalog.round(100.0 * (
          least(1.0, pg_catalog.ln(greatest(s.sample_size, 1)::numeric) / pg_catalog.ln(2.0) / 8.0) * 0.28
          + least(1.0, s.unique_players::numeric / 45.0) * 0.20
          + (1.0 - least(1.0, greatest(0.0, s.top_player_share))) * 0.16
          + (1.0 - least(0.45, greatest(0.0, s.wilson_high - s.wilson_low)) / 0.45) * 0.22
          + (
            case
              when s.adjusted_rate = s.baseline_rate then 0.5
              else (
                (case when pg_catalog.sign(s.avg_gold_diff_15) = pg_catalog.sign(s.adjusted_rate - s.baseline_rate) then 1 else 0 end)
                + (case when pg_catalog.sign(s.avg_cs_diff_15) = pg_catalog.sign(s.adjusted_rate - s.baseline_rate) then 1 else 0 end)
                + (case when pg_catalog.sign(s.avg_kda_diff) = pg_catalog.sign(s.adjusted_rate - s.baseline_rate) then 1 else 0 end)
              )::numeric / 3.0
            end
          ) * 0.14
        ), 0)
      )) as confidence_score,
      (
        100.0 * (s.adjusted_rate - s.baseline_rate)
        + 5.0 * coalesce(s.avg_gold_diff_15 / (abs(s.avg_gold_diff_15) + 600.0), 0.0)
        + 4.0 * coalesce(s.avg_cs_diff_15 / (abs(s.avg_cs_diff_15) + 12.0), 0.0)
        + 3.0 * coalesce(s.avg_xp_diff_15 / (abs(s.avg_xp_diff_15) + 500.0), 0.0)
      ) as counter_score
    from scored s
  )
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
    patch,
    region,
    role,
    champion_id,
    champion_name,
    opponent_champion_id,
    opponent_champion_name,
    sample_size,
    wins,
    losses,
    unique_players,
    raw_rate,
    adjusted_rate,
    baseline_rate,
    greatest(0.0, wilson_low),
    least(1.0, wilson_high),
    avg_gold_diff_15,
    avg_cs_diff_15,
    avg_xp_diff_15,
    early_game_sample_size,
    avg_kda_diff,
    avg_damage_diff_per_min,
    hhi,
    top_player_share,
    case
      when sample_size >= 100 and unique_players >= 20 and hhi <= 0.10 and top_player_share <= 0.20 then 'strong'
      when sample_size >= 30 and unique_players >= 8 and hhi <= 0.25 and top_player_share <= 0.35 then 'moderate'
      when sample_size >= 10 and unique_players >= 3 and top_player_share <= 0.60 then 'limited'
      else 'insufficient'
    end,
    confidence_score,
    counter_score,
    case
      when sample_size < 10 or unique_players < 3 or top_player_share > 0.60 then 'neutral'
      when counter_score >= 3.0 then 'favorable'
      when counter_score <= -3.0 then 'unfavorable'
      else 'neutral'
    end,
    'live',
    v_refreshed_at
  from predictions;

  get diagnostics v_matchup_rows = row_count;

  with pair_base as (
    select
      m.match_id,
      m.patch,
      m.region,
      rp.role,
      blue.participant_id as blue_participant_id,
      blue.player_id as blue_player_id,
      blue.champion_id as blue_champion_id,
      blue.champion_name as blue_champion_name,
      blue.win as blue_win,
      blue.final_item_ids as blue_item_ids,
      red.participant_id as red_participant_id,
      red.player_id as red_player_id,
      red.champion_id as red_champion_id,
      red.champion_name as red_champion_name,
      red.win as red_win,
      red.final_item_ids as red_item_ids
    from public.role_pairs rp
    join public.matches m on m.match_id = rp.match_id
    join public.match_participants blue
      on blue.match_id = rp.match_id and blue.participant_id = rp.blue_participant_id
    join public.match_participants red
      on red.match_id = rp.match_id and red.participant_id = rp.red_participant_id
    where rp.is_valid
      and m.queue_id = 420
      and m.map_id = 11
      and m.duration_seconds >= 600
      and m.timeline_status in ('complete', 'unavailable')
      and blue.team_id = 100
      and red.team_id = 200
      and blue.champion_id <> red.champion_id
      and (p_patch is null or m.patch = p_patch)
      and (p_region is null or m.region = p_region)
  ),
  oriented as (
    select
      pb.match_id,
      pb.patch,
      pb.region,
      pb.role,
      pb.blue_participant_id as participant_id,
      pb.blue_champion_id as champion_id,
      pb.blue_champion_name as champion_name,
      pb.red_champion_id as opponent_champion_id,
      pb.red_champion_name as opponent_champion_name,
      pb.blue_win as win,
      pb.blue_item_ids as item_ids
    from pair_base pb
    join public.match_sources ms
      on ms.match_id = pb.match_id and ms.player_id = pb.blue_player_id

    union all

    select
      pb.match_id,
      pb.patch,
      pb.region,
      pb.role,
      pb.red_participant_id,
      pb.red_champion_id,
      pb.red_champion_name,
      pb.blue_champion_id,
      pb.blue_champion_name,
      pb.red_win,
      pb.red_item_ids
    from pair_base pb
    join public.match_sources ms
      on ms.match_id = pb.match_id and ms.player_id = pb.red_player_id
  ),
  normalized as (
    select
      o.*,
      md5(array_to_string(o.item_ids, ',')) as build_key
    from oriented o
    where cardinality(o.item_ids) > 0
  ),
  matchup_totals as (
    select
      patch,
      region,
      role,
      champion_id,
      opponent_champion_id,
      count(*)::integer as matchup_build_games
    from normalized
    group by patch, region, role, champion_id, opponent_champion_id
  ),
  build_groups as (
    select
      patch,
      region,
      role,
      champion_id,
      max(champion_name) as champion_name,
      opponent_champion_id,
      max(opponent_champion_name) as opponent_champion_name,
      build_key,
      item_ids,
      count(*)::integer as sample_size,
      (count(*) filter (where win))::integer as wins,
      (count(*) filter (where not win))::integer as losses
    from normalized
    group by patch, region, role, champion_id, opponent_champion_id, build_key, item_ids
    having count(*) >= p_min_games
  ),
  ranked as (
    select
      bg.*,
      mt.matchup_build_games,
      row_number() over (
        partition by patch, region, role, champion_id, opponent_champion_id
        order by bg.sample_size desc, (bg.wins::numeric / bg.sample_size::numeric) desc, bg.build_key
      )::integer as build_rank
    from build_groups bg
    join matchup_totals mt using (patch, region, role, champion_id, opponent_champion_id)
  )
  insert into public.item_build_stats (
    patch, region, role, champion_id, champion_name,
    opponent_champion_id, opponent_champion_name,
    build_key, build_label, item_ids, item_names, purchase_sequence,
    sample_size, wins, losses, pick_rate, win_rate, adjusted_win_rate, build_rank,
    data_provenance, updated_at
  )
  select
    r.patch,
    r.region,
    r.role,
    r.champion_id,
    r.champion_name,
    r.opponent_champion_id,
    r.opponent_champion_name,
    r.build_key,
    null,
    r.item_ids,
    '{}'::text[],
    '{}'::integer[],
    r.sample_size,
    r.wins,
    r.losses,
    r.sample_size::numeric / r.matchup_build_games::numeric,
    r.wins::numeric / r.sample_size::numeric,
    (r.wins::numeric + 10.0 * coalesce(ms.adjusted_win_rate, 0.5))
      / (r.sample_size::numeric + 10.0),
    r.build_rank,
    'live',
    v_refreshed_at
  from ranked r
  left join public.matchup_stats ms
    on ms.patch = r.patch and ms.region = r.region and ms.role = r.role
    and ms.champion_id = r.champion_id
    and ms.opponent_champion_id = r.opponent_champion_id
  where r.build_rank <= 10;

  get diagnostics v_item_rows = row_count;

  with selected_matches as (
    select m.*
    from public.matches m
    where m.queue_id = 420
      and m.map_id = 11
      and m.duration_seconds >= 600
      and m.timeline_status in ('complete', 'unavailable')
      and (p_patch is null or m.patch = p_patch)
      and (p_region is null or m.region = p_region)
  ),
  match_rollup as (
    select
      sm.patch,
      sm.region,
      min(coalesce(sm.game_end, sm.game_start, sm.game_creation)) as oldest_game_at,
      max(coalesce(sm.game_end, sm.game_start, sm.game_creation)) as latest_game_at,
      max(sm.ingested_at) as last_ingestion_at,
      max(sm.ddragon_version) as ddragon_version,
      count(distinct sm.match_id)::integer as match_count,
      count(distinct ms.player_id)::integer as tracked_player_count,
      count(ms.player_id)::integer as participant_observation_count
    from selected_matches sm
    join public.match_sources ms on ms.match_id = sm.match_id
    group by sm.patch, sm.region
  ),
  matchup_rollup as (
    select patch, region, sum(sample_size)::integer as matchup_observation_count
    from public.matchup_stats
    where (p_patch is null or patch = p_patch)
      and (p_region is null or region = p_region)
    group by patch, region
  )
  insert into public.dataset_status (
    patch, region, queue_id, ddragon_version, oldest_game_at, latest_game_at, last_ingestion_at,
    analytics_refreshed_at, match_count, tracked_player_count,
    participant_observation_count, matchup_observation_count,
    status, data_provenance, data_quality_note
  )
  select
    mr.patch,
    mr.region,
    420,
    mr.ddragon_version,
    mr.oldest_game_at,
    mr.latest_game_at,
    mr.last_ingestion_at,
    v_refreshed_at,
    mr.match_count,
    mr.tracked_player_count,
    mr.participant_observation_count,
    coalesce(mu.matchup_observation_count, 0),
    'ready',
    'live',
    'Top-rank observations only; adjusted rates shrink small samples toward the champion baseline.'
  from match_rollup mr
  left join matchup_rollup mu using (patch, region);

  get diagnostics v_dataset_rows = row_count;

  return pg_catalog.jsonb_build_object(
    'refreshed_at', v_refreshed_at,
    'patch', p_patch,
    'region', p_region,
    'minimum_games', p_min_games,
    'champion_rows', v_champion_rows,
    'matchup_rows', v_matchup_rows,
    'item_build_rows', v_item_rows,
    'dataset_rows', v_dataset_rows
  );
end;
$$;

comment on function public.refresh_public_analytics(text, text, integer) is
  'Rebuilds browser-readable Challenger analytics. Must be called by a trusted service-role worker.';

-- ---------------------------------------------------------------------------
-- Grants and row-level security
-- ---------------------------------------------------------------------------

alter table public.ingestion_runs enable row level security;
alter table public.ingestion_cursors enable row level security;
alter table public.players enable row level security;
alter table public.ladder_snapshots enable row level security;
alter table public.ladder_entries enable row level security;
alter table public.matches enable row level security;
alter table public.match_exclusions enable row level security;
alter table public.match_sources enable row level security;
alter table public.match_participants enable row level security;
alter table public.participant_frames enable row level security;
alter table public.item_events enable row level security;
alter table public.role_pairs enable row level security;
alter table public.dataset_status enable row level security;
alter table public.champion_stats enable row level security;
alter table public.matchup_stats enable row level security;
alter table public.item_build_stats enable row level security;

-- Defense in depth: ingestion tables have no anon/authenticated policies at all.
revoke all on table
  public.ingestion_runs,
  public.ingestion_cursors,
  public.players,
  public.ladder_snapshots,
  public.ladder_entries,
  public.matches,
  public.match_exclusions,
  public.match_sources,
  public.match_participants,
  public.participant_frames,
  public.item_events,
  public.role_pairs
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.ingestion_runs,
  public.ingestion_cursors,
  public.players,
  public.ladder_snapshots,
  public.ladder_entries,
  public.matches,
  public.match_exclusions,
  public.match_sources,
  public.match_participants,
  public.participant_frames,
  public.item_events,
  public.role_pairs
to service_role;

revoke all on table
  public.dataset_status,
  public.champion_stats,
  public.matchup_stats,
  public.item_build_stats
from public, anon, authenticated;

grant select on table
  public.dataset_status,
  public.champion_stats,
  public.matchup_stats,
  public.item_build_stats
to anon, authenticated;

grant select, insert, update, delete on table
  public.dataset_status,
  public.champion_stats,
  public.matchup_stats,
  public.item_build_stats
to service_role;

create policy dataset_status_public_read
  on public.dataset_status for select
  to anon, authenticated
  using (true);

create policy champion_stats_public_read
  on public.champion_stats for select
  to anon, authenticated
  using (true);

create policy matchup_stats_public_read
  on public.matchup_stats for select
  to anon, authenticated
  using (true);

create policy item_build_stats_public_read
  on public.item_build_stats for select
  to anon, authenticated
  using (true);

revoke all on function public.refresh_public_analytics(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.refresh_public_analytics(text, text, integer)
  to service_role;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to service_role;

comment on table public.matchup_stats is
  'Directional Challenger-player matchups with empirical-Bayes shrinkage, Wilson uncertainty, player-concentration evidence, and a descriptive counter score.';
comment on column public.matchup_stats.adjusted_win_rate is
  'Observed wins shrunk with 20 pseudo-games toward the focal champion role/patch/region win rate.';
comment on column public.matchup_stats.player_concentration_hhi is
  'Herfindahl-Hirschman index over contributing Challenger accounts; lower means broader evidence.';
comment on column public.matchup_stats.counter_score is
  'Descriptive composite of baseline-adjusted win rate and 15-minute gold/CS/XP differences; not a causal estimate.';
