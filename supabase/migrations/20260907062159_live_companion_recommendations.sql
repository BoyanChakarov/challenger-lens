-- Read-only recommendation aggregates for the Live League Companion.
--
-- This migration intentionally keeps the supported context narrow:
-- Challenger observations from EUW/EUNE, Ranked Solo (420), Summoner's Rift
-- (11), and one exact patch. It never falls back across patches.

-- ---------------------------------------------------------------------------
-- Public, aggregate-only recommendation tables
-- ---------------------------------------------------------------------------

create table public.rune_page_stats (
  patch text not null,
  region text not null,
  queue_id integer not null default 420,
  map_id integer not null default 11,
  cohort text not null default 'CHALLENGER',
  role text not null,
  champion_id integer not null,
  champion_name text not null,
  opponent_champion_id integer not null,
  opponent_champion_name text not null,
  rune_page_key text not null,
  primary_style_id integer not null,
  secondary_style_id integer not null,
  perk_ids integer[] not null,
  stat_perk_ids integer[] not null default '{}'::integer[],
  sample_size integer not null,
  wins integer not null,
  losses integer not null,
  frequency numeric(8, 6) not null,
  win_rate numeric(8, 6) not null,
  adjusted_win_rate numeric(8, 6) not null,
  baseline_win_rate numeric(8, 6) not null,
  wilson_low numeric(8, 6) not null,
  wilson_high numeric(8, 6) not null,
  unique_players integer not null,
  player_concentration_hhi numeric(8, 6) not null,
  top_player_share numeric(8, 6) not null,
  evidence_label text not null,
  option_rank integer not null,
  data_provenance text not null default 'live',
  updated_at timestamptz not null default now(),
  primary key (
    patch, region, queue_id, map_id, cohort, role,
    champion_id, opponent_champion_id, rune_page_key
  ),
  constraint rune_page_stats_patch_check check (patch ~ '^[0-9]+\.[0-9]+$'),
  constraint rune_page_stats_region_check check (region in ('EUW', 'EUNE')),
  constraint rune_page_stats_context_check check (
    queue_id = 420 and map_id = 11 and cohort = 'CHALLENGER'
  ),
  constraint rune_page_stats_role_check check (
    role in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY')
  ),
  constraint rune_page_stats_champions_check check (
    champion_id > 0 and opponent_champion_id > 0 and champion_id <> opponent_champion_id
    and btrim(champion_name) <> '' and btrim(opponent_champion_name) <> ''
  ),
  constraint rune_page_stats_key_check check (btrim(rune_page_key) <> ''),
  constraint rune_page_stats_runes_check check (
    primary_style_id > 0 and secondary_style_id > 0
    and cardinality(perk_ids) > 0 and 0 < all (perk_ids)
    and 0 < all (stat_perk_ids)
  ),
  constraint rune_page_stats_counts_check check (
    sample_size > 0 and wins >= 0 and losses >= 0 and wins + losses = sample_size
    and unique_players > 0 and option_rank > 0
  ),
  constraint rune_page_stats_rates_check check (
    frequency between 0 and 1 and win_rate between 0 and 1
    and adjusted_win_rate between 0 and 1 and baseline_win_rate between 0 and 1
    and wilson_low between 0 and 1 and wilson_high between 0 and 1
    and wilson_low <= wilson_high
    and player_concentration_hhi between 0 and 1
    and top_player_share between 0 and 1
  ),
  constraint rune_page_stats_evidence_check check (
    evidence_label in ('strong', 'moderate', 'limited', 'insufficient')
  ),
  constraint rune_page_stats_provenance_check check (data_provenance = 'live')
);

create index rune_page_stats_companion_lookup_idx
  on public.rune_page_stats (
    patch, region, queue_id, map_id, cohort, role,
    champion_id, opponent_champion_id, option_rank
  );

create table public.summoner_spell_stats (
  patch text not null,
  region text not null,
  queue_id integer not null default 420,
  map_id integer not null default 11,
  cohort text not null default 'CHALLENGER',
  role text not null,
  champion_id integer not null,
  champion_name text not null,
  opponent_champion_id integer not null,
  opponent_champion_name text not null,
  spell_pair_key text not null,
  spell_ids integer[] not null,
  sample_size integer not null,
  wins integer not null,
  losses integer not null,
  frequency numeric(8, 6) not null,
  win_rate numeric(8, 6) not null,
  adjusted_win_rate numeric(8, 6) not null,
  baseline_win_rate numeric(8, 6) not null,
  wilson_low numeric(8, 6) not null,
  wilson_high numeric(8, 6) not null,
  unique_players integer not null,
  player_concentration_hhi numeric(8, 6) not null,
  top_player_share numeric(8, 6) not null,
  evidence_label text not null,
  option_rank integer not null,
  data_provenance text not null default 'live',
  updated_at timestamptz not null default now(),
  primary key (
    patch, region, queue_id, map_id, cohort, role,
    champion_id, opponent_champion_id, spell_pair_key
  ),
  constraint summoner_spell_stats_patch_check check (patch ~ '^[0-9]+\.[0-9]+$'),
  constraint summoner_spell_stats_region_check check (region in ('EUW', 'EUNE')),
  constraint summoner_spell_stats_context_check check (
    queue_id = 420 and map_id = 11 and cohort = 'CHALLENGER'
  ),
  constraint summoner_spell_stats_role_check check (
    role in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY')
  ),
  constraint summoner_spell_stats_champions_check check (
    champion_id > 0 and opponent_champion_id > 0 and champion_id <> opponent_champion_id
    and btrim(champion_name) <> '' and btrim(opponent_champion_name) <> ''
  ),
  constraint summoner_spell_stats_key_check check (btrim(spell_pair_key) <> ''),
  constraint summoner_spell_stats_spells_check check (
    cardinality(spell_ids) = 2 and 0 < all (spell_ids) and spell_ids[1] <= spell_ids[2]
  ),
  constraint summoner_spell_stats_counts_check check (
    sample_size > 0 and wins >= 0 and losses >= 0 and wins + losses = sample_size
    and unique_players > 0 and option_rank > 0
  ),
  constraint summoner_spell_stats_rates_check check (
    frequency between 0 and 1 and win_rate between 0 and 1
    and adjusted_win_rate between 0 and 1 and baseline_win_rate between 0 and 1
    and wilson_low between 0 and 1 and wilson_high between 0 and 1
    and wilson_low <= wilson_high
    and player_concentration_hhi between 0 and 1
    and top_player_share between 0 and 1
  ),
  constraint summoner_spell_stats_evidence_check check (
    evidence_label in ('strong', 'moderate', 'limited', 'insufficient')
  ),
  constraint summoner_spell_stats_provenance_check check (data_provenance = 'live')
);

create index summoner_spell_stats_companion_lookup_idx
  on public.summoner_spell_stats (
    patch, region, queue_id, map_id, cohort, role,
    champion_id, opponent_champion_id, option_rank
  );

create table public.item_path_stats (
  patch text not null,
  region text not null,
  queue_id integer not null default 420,
  map_id integer not null default 11,
  cohort text not null default 'CHALLENGER',
  role text not null,
  champion_id integer not null,
  champion_name text not null,
  opponent_champion_id integer not null,
  opponent_champion_name text not null,
  path_key text not null,
  starting_item_ids integer[] not null default '{}'::integer[],
  first_item_id integer,
  boots_item_id integer,
  core_item_ids integer[] not null,
  purchase_sequence integer[] not null default '{}'::integer[],
  stage_quality text not null default 'retained_item_proxy',
  sample_size integer not null,
  wins integer not null,
  losses integer not null,
  frequency numeric(8, 6) not null,
  win_rate numeric(8, 6) not null,
  adjusted_win_rate numeric(8, 6) not null,
  baseline_win_rate numeric(8, 6) not null,
  wilson_low numeric(8, 6) not null,
  wilson_high numeric(8, 6) not null,
  unique_players integer not null,
  player_concentration_hhi numeric(8, 6) not null,
  top_player_share numeric(8, 6) not null,
  evidence_label text not null,
  option_rank integer not null,
  data_provenance text not null default 'live',
  updated_at timestamptz not null default now(),
  primary key (
    patch, region, queue_id, map_id, cohort, role,
    champion_id, opponent_champion_id, path_key
  ),
  constraint item_path_stats_patch_check check (patch ~ '^[0-9]+\.[0-9]+$'),
  constraint item_path_stats_region_check check (region in ('EUW', 'EUNE')),
  constraint item_path_stats_context_check check (
    queue_id = 420 and map_id = 11 and cohort = 'CHALLENGER'
  ),
  constraint item_path_stats_role_check check (
    role in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY')
  ),
  constraint item_path_stats_champions_check check (
    champion_id > 0 and opponent_champion_id > 0 and champion_id <> opponent_champion_id
    and btrim(champion_name) <> '' and btrim(opponent_champion_name) <> ''
  ),
  constraint item_path_stats_key_check check (btrim(path_key) <> ''),
  constraint item_path_stats_items_check check (
    cardinality(core_item_ids) > 0
    and 0 < all (starting_item_ids) and 0 < all (core_item_ids)
    and 0 < all (purchase_sequence)
    and (first_item_id is null or first_item_id > 0)
    and (boots_item_id is null or boots_item_id > 0)
  ),
  constraint item_path_stats_stage_quality_check check (
    stage_quality in ('retained_item_proxy', 'metadata_enriched')
  ),
  constraint item_path_stats_counts_check check (
    sample_size > 0 and wins >= 0 and losses >= 0 and wins + losses = sample_size
    and unique_players > 0 and option_rank > 0
  ),
  constraint item_path_stats_rates_check check (
    frequency between 0 and 1 and win_rate between 0 and 1
    and adjusted_win_rate between 0 and 1 and baseline_win_rate between 0 and 1
    and wilson_low between 0 and 1 and wilson_high between 0 and 1
    and wilson_low <= wilson_high
    and player_concentration_hhi between 0 and 1
    and top_player_share between 0 and 1
  ),
  constraint item_path_stats_evidence_check check (
    evidence_label in ('strong', 'moderate', 'limited', 'insufficient')
  ),
  constraint item_path_stats_provenance_check check (data_provenance = 'live')
);

create index item_path_stats_companion_lookup_idx
  on public.item_path_stats (
    patch, region, queue_id, map_id, cohort, role,
    champion_id, opponent_champion_id, option_rank
  );

create index matchup_stats_companion_counter_idx
  on public.matchup_stats (
    patch, region, role, opponent_champion_id, counter_score desc, sample_size desc
  )
  where evidence_label in ('strong', 'moderate')
    and prediction_label = 'favorable';

-- ---------------------------------------------------------------------------
-- Trusted aggregate refresh
-- ---------------------------------------------------------------------------

create or replace function public.refresh_companion_analytics(
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
  v_rune_rows integer := 0;
  v_spell_rows integer := 0;
  v_item_rows integer := 0;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.refresh_companion_analytics', 0)
  );

  delete from public.rune_page_stats
  where (p_patch is null or patch = p_patch)
    and (p_region is null or region = p_region);

  delete from public.summoner_spell_stats
  where (p_patch is null or patch = p_patch)
    and (p_region is null or region = p_region);

  delete from public.item_path_stats
  where (p_patch is null or patch = p_patch)
    and (p_region is null or region = p_region);

  with pair_base as (
    select
      m.match_id,
      m.patch,
      m.region,
      rp.role,
      blue.participant_id as blue_participant_id,
      blue.player_id as blue_player_id,
      blue.puuid as blue_puuid,
      blue.champion_id as blue_champion_id,
      blue.champion_name as blue_champion_name,
      blue.win as blue_win,
      blue.perks as blue_perks,
      red.participant_id as red_participant_id,
      red.player_id as red_player_id,
      red.puuid as red_puuid,
      red.champion_id as red_champion_id,
      red.champion_name as red_champion_name,
      red.win as red_win,
      red.perks as red_perks
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
      pb.blue_puuid as focal_puuid,
      pb.blue_champion_id as champion_id,
      pb.blue_champion_name as champion_name,
      pb.red_champion_id as opponent_champion_id,
      pb.red_champion_name as opponent_champion_name,
      pb.blue_win as win,
      pb.blue_perks as perks
    from pair_base pb
    join public.match_sources ms
      on ms.match_id = pb.match_id and ms.player_id = pb.blue_player_id

    union all

    select
      pb.match_id,
      pb.patch,
      pb.region,
      pb.role,
      pb.red_puuid,
      pb.red_champion_id,
      pb.red_champion_name,
      pb.blue_champion_id,
      pb.blue_champion_name,
      pb.red_win,
      pb.red_perks
    from pair_base pb
    join public.match_sources ms
      on ms.match_id = pb.match_id and ms.player_id = pb.red_player_id
  ),
  rune_components as (
    select
      o.*,
      case
        when coalesce(o.perks #>> '{styles,0,style}', '') ~ '^[0-9]+$'
          then (o.perks #>> '{styles,0,style}')::integer
        else 0
      end as primary_style_id,
      case
        when coalesce(o.perks #>> '{styles,1,style}', '') ~ '^[0-9]+$'
          then (o.perks #>> '{styles,1,style}')::integer
        else 0
      end as secondary_style_id,
      array(
        select (selection_json ->> 'perk')::integer
        from pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(o.perks -> 'styles') = 'array'
              then o.perks -> 'styles'
            else '[]'::jsonb
          end
        ) with ordinality as style_entry(style_json, style_order)
        cross join lateral pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(style_json -> 'selections') = 'array'
              then style_json -> 'selections'
            else '[]'::jsonb
          end
        ) with ordinality as selection_entry(selection_json, selection_order)
        where coalesce(selection_json ->> 'perk', '') ~ '^[0-9]+$'
        order by style_order, selection_order
      )::integer[] as perk_ids,
      pg_catalog.array_remove(array[
        case when coalesce(o.perks #>> '{statPerks,offense}', '') ~ '^[0-9]+$'
          then (o.perks #>> '{statPerks,offense}')::integer end,
        case when coalesce(o.perks #>> '{statPerks,flex}', '') ~ '^[0-9]+$'
          then (o.perks #>> '{statPerks,flex}')::integer end,
        case when coalesce(o.perks #>> '{statPerks,defense}', '') ~ '^[0-9]+$'
          then (o.perks #>> '{statPerks,defense}')::integer end
      ]::integer[], null) as stat_perk_ids
    from oriented o
  ),
  rune_observations as (
    select
      rc.*,
      pg_catalog.md5(
        rc.primary_style_id::text || ':' || rc.secondary_style_id::text || ':'
        || pg_catalog.array_to_string(rc.perk_ids, ',') || ':'
        || pg_catalog.array_to_string(rc.stat_perk_ids, ',')
      ) as rune_page_key
    from rune_components rc
    where rc.primary_style_id > 0
      and rc.secondary_style_id > 0
      and pg_catalog.cardinality(rc.perk_ids) > 0
  ),
  option_totals as (
    select patch, region, role, champion_id, opponent_champion_id, count(*)::integer as total_games
    from rune_observations
    group by patch, region, role, champion_id, opponent_champion_id
  ),
  player_counts as (
    select
      patch, region, role, champion_id, opponent_champion_id,
      rune_page_key, focal_puuid, count(*)::integer as player_games
    from rune_observations
    group by patch, region, role, champion_id, opponent_champion_id, rune_page_key, focal_puuid
  ),
  concentration as (
    select
      patch, region, role, champion_id, opponent_champion_id, rune_page_key,
      count(*)::integer as unique_players,
      sum(player_games::numeric * player_games::numeric)
        / (sum(player_games)::numeric ^ 2) as hhi,
      max(player_games)::numeric / sum(player_games)::numeric as top_player_share
    from player_counts
    group by patch, region, role, champion_id, opponent_champion_id, rune_page_key
  ),
  grouped as (
    select
      ro.patch,
      ro.region,
      ro.role,
      ro.champion_id,
      max(ro.champion_name) as champion_name,
      ro.opponent_champion_id,
      max(ro.opponent_champion_name) as opponent_champion_name,
      ro.rune_page_key,
      ro.primary_style_id,
      ro.secondary_style_id,
      ro.perk_ids,
      ro.stat_perk_ids,
      count(*)::integer as sample_size,
      (count(*) filter (where ro.win))::integer as wins,
      (count(*) filter (where not ro.win))::integer as losses
    from rune_observations ro
    group by
      ro.patch, ro.region, ro.role, ro.champion_id, ro.opponent_champion_id,
      ro.rune_page_key, ro.primary_style_id, ro.secondary_style_id,
      ro.perk_ids, ro.stat_perk_ids
    having count(*) >= p_min_games
  ),
  scored as (
    select
      g.*,
      c.unique_players,
      c.hhi,
      c.top_player_share,
      ot.total_games,
      coalesce(ms.adjusted_win_rate, cs.adjusted_win_rate, 0.5) as baseline_rate,
      g.wins::numeric / g.sample_size::numeric as raw_rate,
      (
        g.wins::numeric + 10.0 * coalesce(ms.adjusted_win_rate, cs.adjusted_win_rate, 0.5)
      ) / (g.sample_size::numeric + 10.0) as adjusted_rate,
      (
        (g.wins::numeric / g.sample_size::numeric) + 3.8416 / (2.0 * g.sample_size::numeric)
        - 1.96 * pg_catalog.sqrt(
          ((g.wins::numeric / g.sample_size::numeric)
            * (1.0 - g.wins::numeric / g.sample_size::numeric)
            + 3.8416 / (4.0 * g.sample_size::numeric)) / g.sample_size::numeric
        )
      ) / (1.0 + 3.8416 / g.sample_size::numeric) as wilson_low,
      (
        (g.wins::numeric / g.sample_size::numeric) + 3.8416 / (2.0 * g.sample_size::numeric)
        + 1.96 * pg_catalog.sqrt(
          ((g.wins::numeric / g.sample_size::numeric)
            * (1.0 - g.wins::numeric / g.sample_size::numeric)
            + 3.8416 / (4.0 * g.sample_size::numeric)) / g.sample_size::numeric
        )
      ) / (1.0 + 3.8416 / g.sample_size::numeric) as wilson_high
    from grouped g
    join concentration c using (
      patch, region, role, champion_id, opponent_champion_id, rune_page_key
    )
    join option_totals ot using (patch, region, role, champion_id, opponent_champion_id)
    left join public.matchup_stats ms
      on ms.patch = g.patch and ms.region = g.region and ms.role = g.role
      and ms.champion_id = g.champion_id
      and ms.opponent_champion_id = g.opponent_champion_id
    left join public.champion_stats cs
      on cs.patch = g.patch and cs.region = g.region and cs.role = g.role
      and cs.champion_id = g.champion_id
  ),
  ranked as (
    select
      s.*,
      pg_catalog.row_number() over (
        partition by patch, region, role, champion_id, opponent_champion_id
        order by sample_size desc, adjusted_rate desc, rune_page_key
      )::integer as option_rank
    from scored s
  )
  insert into public.rune_page_stats (
    patch, region, queue_id, map_id, cohort, role,
    champion_id, champion_name, opponent_champion_id, opponent_champion_name,
    rune_page_key, primary_style_id, secondary_style_id, perk_ids, stat_perk_ids,
    sample_size, wins, losses, frequency, win_rate, adjusted_win_rate,
    baseline_win_rate, wilson_low, wilson_high, unique_players,
    player_concentration_hhi, top_player_share, evidence_label, option_rank,
    data_provenance, updated_at
  )
  select
    patch, region, 420, 11, 'CHALLENGER', role,
    champion_id, champion_name, opponent_champion_id, opponent_champion_name,
    rune_page_key, primary_style_id, secondary_style_id, perk_ids, stat_perk_ids,
    sample_size, wins, losses,
    sample_size::numeric / total_games::numeric,
    raw_rate, adjusted_rate, baseline_rate,
    greatest(0.0, wilson_low), least(1.0, wilson_high),
    unique_players, hhi, top_player_share,
    case
      when sample_size >= 100 and unique_players >= 20 and hhi <= 0.10 and top_player_share <= 0.20
        then 'strong'
      when sample_size >= 30 and unique_players >= 8 and hhi <= 0.25 and top_player_share <= 0.35
        then 'moderate'
      when sample_size >= 10 and unique_players >= 3 and top_player_share <= 0.60
        then 'limited'
      else 'insufficient'
    end,
    option_rank, 'live', v_refreshed_at
  from ranked
  where option_rank <= 20;

  get diagnostics v_rune_rows = row_count;

  with pair_base as (
    select
      m.match_id,
      m.patch,
      m.region,
      rp.role,
      blue.player_id as blue_player_id,
      blue.puuid as blue_puuid,
      blue.champion_id as blue_champion_id,
      blue.champion_name as blue_champion_name,
      blue.win as blue_win,
      blue.summoner_spell_1_id as blue_spell_1,
      blue.summoner_spell_2_id as blue_spell_2,
      red.player_id as red_player_id,
      red.puuid as red_puuid,
      red.champion_id as red_champion_id,
      red.champion_name as red_champion_name,
      red.win as red_win,
      red.summoner_spell_1_id as red_spell_1,
      red.summoner_spell_2_id as red_spell_2
    from public.role_pairs rp
    join public.matches m on m.match_id = rp.match_id
    join public.match_participants blue
      on blue.match_id = rp.match_id and blue.participant_id = rp.blue_participant_id
    join public.match_participants red
      on red.match_id = rp.match_id and red.participant_id = rp.red_participant_id
    where rp.is_valid
      and m.queue_id = 420 and m.map_id = 11 and m.duration_seconds >= 600
      and m.timeline_status in ('complete', 'unavailable')
      and blue.team_id = 100 and red.team_id = 200
      and blue.champion_id <> red.champion_id
      and (p_patch is null or m.patch = p_patch)
      and (p_region is null or m.region = p_region)
  ),
  oriented as (
    select
      pb.match_id, pb.patch, pb.region, pb.role, pb.blue_puuid as focal_puuid,
      pb.blue_champion_id as champion_id, pb.blue_champion_name as champion_name,
      pb.red_champion_id as opponent_champion_id,
      pb.red_champion_name as opponent_champion_name,
      pb.blue_win as win, pb.blue_spell_1 as spell_1, pb.blue_spell_2 as spell_2
    from pair_base pb
    join public.match_sources ms
      on ms.match_id = pb.match_id and ms.player_id = pb.blue_player_id

    union all

    select
      pb.match_id, pb.patch, pb.region, pb.role, pb.red_puuid,
      pb.red_champion_id, pb.red_champion_name,
      pb.blue_champion_id, pb.blue_champion_name,
      pb.red_win, pb.red_spell_1, pb.red_spell_2
    from pair_base pb
    join public.match_sources ms
      on ms.match_id = pb.match_id and ms.player_id = pb.red_player_id
  ),
  spell_observations as (
    select
      o.*,
      array[least(o.spell_1, o.spell_2), greatest(o.spell_1, o.spell_2)]::integer[] as spell_ids,
      least(o.spell_1, o.spell_2)::text || ':' || greatest(o.spell_1, o.spell_2)::text
        as spell_pair_key
    from oriented o
    where o.spell_1 > 0 and o.spell_2 > 0
  ),
  option_totals as (
    select patch, region, role, champion_id, opponent_champion_id, count(*)::integer as total_games
    from spell_observations
    group by patch, region, role, champion_id, opponent_champion_id
  ),
  player_counts as (
    select
      patch, region, role, champion_id, opponent_champion_id,
      spell_pair_key, focal_puuid, count(*)::integer as player_games
    from spell_observations
    group by patch, region, role, champion_id, opponent_champion_id, spell_pair_key, focal_puuid
  ),
  concentration as (
    select
      patch, region, role, champion_id, opponent_champion_id, spell_pair_key,
      count(*)::integer as unique_players,
      sum(player_games::numeric * player_games::numeric)
        / (sum(player_games)::numeric ^ 2) as hhi,
      max(player_games)::numeric / sum(player_games)::numeric as top_player_share
    from player_counts
    group by patch, region, role, champion_id, opponent_champion_id, spell_pair_key
  ),
  grouped as (
    select
      so.patch, so.region, so.role, so.champion_id,
      max(so.champion_name) as champion_name,
      so.opponent_champion_id,
      max(so.opponent_champion_name) as opponent_champion_name,
      so.spell_pair_key, so.spell_ids,
      count(*)::integer as sample_size,
      (count(*) filter (where so.win))::integer as wins,
      (count(*) filter (where not so.win))::integer as losses
    from spell_observations so
    group by
      so.patch, so.region, so.role, so.champion_id, so.opponent_champion_id,
      so.spell_pair_key, so.spell_ids
    having count(*) >= p_min_games
  ),
  scored as (
    select
      g.*, c.unique_players, c.hhi, c.top_player_share, ot.total_games,
      coalesce(ms.adjusted_win_rate, cs.adjusted_win_rate, 0.5) as baseline_rate,
      g.wins::numeric / g.sample_size::numeric as raw_rate,
      (g.wins::numeric + 10.0 * coalesce(ms.adjusted_win_rate, cs.adjusted_win_rate, 0.5))
        / (g.sample_size::numeric + 10.0) as adjusted_rate,
      (
        (g.wins::numeric / g.sample_size::numeric) + 3.8416 / (2.0 * g.sample_size::numeric)
        - 1.96 * pg_catalog.sqrt(
          ((g.wins::numeric / g.sample_size::numeric)
            * (1.0 - g.wins::numeric / g.sample_size::numeric)
            + 3.8416 / (4.0 * g.sample_size::numeric)) / g.sample_size::numeric
        )
      ) / (1.0 + 3.8416 / g.sample_size::numeric) as wilson_low,
      (
        (g.wins::numeric / g.sample_size::numeric) + 3.8416 / (2.0 * g.sample_size::numeric)
        + 1.96 * pg_catalog.sqrt(
          ((g.wins::numeric / g.sample_size::numeric)
            * (1.0 - g.wins::numeric / g.sample_size::numeric)
            + 3.8416 / (4.0 * g.sample_size::numeric)) / g.sample_size::numeric
        )
      ) / (1.0 + 3.8416 / g.sample_size::numeric) as wilson_high
    from grouped g
    join concentration c using (
      patch, region, role, champion_id, opponent_champion_id, spell_pair_key
    )
    join option_totals ot using (patch, region, role, champion_id, opponent_champion_id)
    left join public.matchup_stats ms
      on ms.patch = g.patch and ms.region = g.region and ms.role = g.role
      and ms.champion_id = g.champion_id
      and ms.opponent_champion_id = g.opponent_champion_id
    left join public.champion_stats cs
      on cs.patch = g.patch and cs.region = g.region and cs.role = g.role
      and cs.champion_id = g.champion_id
  ),
  ranked as (
    select
      s.*,
      pg_catalog.row_number() over (
        partition by patch, region, role, champion_id, opponent_champion_id
        order by sample_size desc, adjusted_rate desc, spell_pair_key
      )::integer as option_rank
    from scored s
  )
  insert into public.summoner_spell_stats (
    patch, region, queue_id, map_id, cohort, role,
    champion_id, champion_name, opponent_champion_id, opponent_champion_name,
    spell_pair_key, spell_ids, sample_size, wins, losses, frequency,
    win_rate, adjusted_win_rate, baseline_win_rate, wilson_low, wilson_high,
    unique_players, player_concentration_hhi, top_player_share,
    evidence_label, option_rank, data_provenance, updated_at
  )
  select
    patch, region, 420, 11, 'CHALLENGER', role,
    champion_id, champion_name, opponent_champion_id, opponent_champion_name,
    spell_pair_key, spell_ids, sample_size, wins, losses,
    sample_size::numeric / total_games::numeric,
    raw_rate, adjusted_rate, baseline_rate,
    greatest(0.0, wilson_low), least(1.0, wilson_high),
    unique_players, hhi, top_player_share,
    case
      when sample_size >= 100 and unique_players >= 20 and hhi <= 0.10 and top_player_share <= 0.20
        then 'strong'
      when sample_size >= 30 and unique_players >= 8 and hhi <= 0.25 and top_player_share <= 0.35
        then 'moderate'
      when sample_size >= 10 and unique_players >= 3 and top_player_share <= 0.60
        then 'limited'
      else 'insufficient'
    end,
    option_rank, 'live', v_refreshed_at
  from ranked
  where option_rank <= 20;

  get diagnostics v_spell_rows = row_count;

  with pair_base as (
    select
      m.match_id,
      m.patch,
      m.region,
      rp.role,
      blue.participant_id as blue_participant_id,
      blue.player_id as blue_player_id,
      blue.puuid as blue_puuid,
      blue.champion_id as blue_champion_id,
      blue.champion_name as blue_champion_name,
      blue.win as blue_win,
      blue.final_item_ids as blue_final_item_ids,
      red.participant_id as red_participant_id,
      red.player_id as red_player_id,
      red.puuid as red_puuid,
      red.champion_id as red_champion_id,
      red.champion_name as red_champion_name,
      red.win as red_win,
      red.final_item_ids as red_final_item_ids
    from public.role_pairs rp
    join public.matches m on m.match_id = rp.match_id
    join public.match_participants blue
      on blue.match_id = rp.match_id and blue.participant_id = rp.blue_participant_id
    join public.match_participants red
      on red.match_id = rp.match_id and red.participant_id = rp.red_participant_id
    where rp.is_valid
      and m.queue_id = 420 and m.map_id = 11 and m.duration_seconds >= 600
      and m.timeline_status = 'complete'
      and blue.team_id = 100 and red.team_id = 200
      and blue.champion_id <> red.champion_id
      and (p_patch is null or m.patch = p_patch)
      and (p_region is null or m.region = p_region)
  ),
  oriented as (
    select
      pb.match_id, pb.patch, pb.region, pb.role,
      pb.blue_participant_id as participant_id, pb.blue_puuid as focal_puuid,
      pb.blue_champion_id as champion_id, pb.blue_champion_name as champion_name,
      pb.red_champion_id as opponent_champion_id,
      pb.red_champion_name as opponent_champion_name,
      pb.blue_win as win, pb.blue_final_item_ids as final_item_ids
    from pair_base pb
    join public.match_sources ms
      on ms.match_id = pb.match_id and ms.player_id = pb.blue_player_id

    union all

    select
      pb.match_id, pb.patch, pb.region, pb.role,
      pb.red_participant_id, pb.red_puuid,
      pb.red_champion_id, pb.red_champion_name,
      pb.blue_champion_id, pb.blue_champion_name,
      pb.red_win, pb.red_final_item_ids
    from pair_base pb
    join public.match_sources ms
      on ms.match_id = pb.match_id and ms.player_id = pb.red_player_id
  ),
  item_components as (
    select
      o.*,
      purchases.starting_item_ids,
      purchases.purchase_sequence,
      first_retained.first_item_id,
      o.final_item_ids as core_item_ids
    from oriented o
    cross join lateral (
      select
        coalesce(
          pg_catalog.array_agg(ie.item_id order by ie.timestamp_ms, ie.event_index)
            filter (
              where ie.event_type = 'ITEM_PURCHASED'
                and ie.item_id is not null and ie.item_id > 0
                and ie.timestamp_ms <= 120000
            ),
          '{}'::integer[]
        ) as starting_item_ids,
        coalesce(
          pg_catalog.array_agg(ie.item_id order by ie.timestamp_ms, ie.event_index)
            filter (
              where ie.event_type = 'ITEM_PURCHASED'
                and ie.item_id is not null and ie.item_id > 0
                and (
                  ie.timestamp_ms <= 120000
                  or ie.item_id = any (o.final_item_ids)
                )
            ),
          '{}'::integer[]
        ) as purchase_sequence
      from public.item_events ie
      where ie.match_id = o.match_id and ie.participant_id = o.participant_id
    ) purchases
    left join lateral (
      select ie.item_id as first_item_id
      from public.item_events ie
      where ie.match_id = o.match_id
        and ie.participant_id = o.participant_id
        and ie.event_type = 'ITEM_PURCHASED'
        and ie.item_id is not null and ie.item_id > 0
        and ie.timestamp_ms > 120000
        and ie.item_id = any (o.final_item_ids)
        and not (ie.item_id = any (purchases.starting_item_ids))
      order by ie.timestamp_ms, ie.event_index
      limit 1
    ) first_retained on true
    where pg_catalog.cardinality(o.final_item_ids) > 0
  ),
  item_observations as (
    select
      ic.*,
      pg_catalog.md5(
        pg_catalog.array_to_string(ic.starting_item_ids, ',') || ':'
        || coalesce(ic.first_item_id::text, '') || ':'
        || pg_catalog.array_to_string(ic.core_item_ids, ',') || ':'
        || pg_catalog.array_to_string(ic.purchase_sequence, ',')
      ) as path_key
    from item_components ic
  ),
  option_totals as (
    select patch, region, role, champion_id, opponent_champion_id, count(*)::integer as total_games
    from item_observations
    group by patch, region, role, champion_id, opponent_champion_id
  ),
  player_counts as (
    select
      patch, region, role, champion_id, opponent_champion_id,
      path_key, focal_puuid, count(*)::integer as player_games
    from item_observations
    group by patch, region, role, champion_id, opponent_champion_id, path_key, focal_puuid
  ),
  concentration as (
    select
      patch, region, role, champion_id, opponent_champion_id, path_key,
      count(*)::integer as unique_players,
      sum(player_games::numeric * player_games::numeric)
        / (sum(player_games)::numeric ^ 2) as hhi,
      max(player_games)::numeric / sum(player_games)::numeric as top_player_share
    from player_counts
    group by patch, region, role, champion_id, opponent_champion_id, path_key
  ),
  grouped as (
    select
      io.patch, io.region, io.role, io.champion_id,
      max(io.champion_name) as champion_name,
      io.opponent_champion_id,
      max(io.opponent_champion_name) as opponent_champion_name,
      io.path_key, io.starting_item_ids, io.first_item_id,
      io.core_item_ids, io.purchase_sequence,
      count(*)::integer as sample_size,
      (count(*) filter (where io.win))::integer as wins,
      (count(*) filter (where not io.win))::integer as losses
    from item_observations io
    group by
      io.patch, io.region, io.role, io.champion_id, io.opponent_champion_id,
      io.path_key, io.starting_item_ids, io.first_item_id,
      io.core_item_ids, io.purchase_sequence
    having count(*) >= p_min_games
  ),
  scored as (
    select
      g.*, c.unique_players, c.hhi, c.top_player_share, ot.total_games,
      coalesce(ms.adjusted_win_rate, cs.adjusted_win_rate, 0.5) as baseline_rate,
      g.wins::numeric / g.sample_size::numeric as raw_rate,
      (g.wins::numeric + 10.0 * coalesce(ms.adjusted_win_rate, cs.adjusted_win_rate, 0.5))
        / (g.sample_size::numeric + 10.0) as adjusted_rate,
      (
        (g.wins::numeric / g.sample_size::numeric) + 3.8416 / (2.0 * g.sample_size::numeric)
        - 1.96 * pg_catalog.sqrt(
          ((g.wins::numeric / g.sample_size::numeric)
            * (1.0 - g.wins::numeric / g.sample_size::numeric)
            + 3.8416 / (4.0 * g.sample_size::numeric)) / g.sample_size::numeric
        )
      ) / (1.0 + 3.8416 / g.sample_size::numeric) as wilson_low,
      (
        (g.wins::numeric / g.sample_size::numeric) + 3.8416 / (2.0 * g.sample_size::numeric)
        + 1.96 * pg_catalog.sqrt(
          ((g.wins::numeric / g.sample_size::numeric)
            * (1.0 - g.wins::numeric / g.sample_size::numeric)
            + 3.8416 / (4.0 * g.sample_size::numeric)) / g.sample_size::numeric
        )
      ) / (1.0 + 3.8416 / g.sample_size::numeric) as wilson_high
    from grouped g
    join concentration c using (
      patch, region, role, champion_id, opponent_champion_id, path_key
    )
    join option_totals ot using (patch, region, role, champion_id, opponent_champion_id)
    left join public.matchup_stats ms
      on ms.patch = g.patch and ms.region = g.region and ms.role = g.role
      and ms.champion_id = g.champion_id
      and ms.opponent_champion_id = g.opponent_champion_id
    left join public.champion_stats cs
      on cs.patch = g.patch and cs.region = g.region and cs.role = g.role
      and cs.champion_id = g.champion_id
  ),
  ranked as (
    select
      s.*,
      pg_catalog.row_number() over (
        partition by patch, region, role, champion_id, opponent_champion_id
        order by sample_size desc, adjusted_rate desc, path_key
      )::integer as option_rank
    from scored s
  )
  insert into public.item_path_stats (
    patch, region, queue_id, map_id, cohort, role,
    champion_id, champion_name, opponent_champion_id, opponent_champion_name,
    path_key, starting_item_ids, first_item_id, boots_item_id,
    core_item_ids, purchase_sequence, stage_quality,
    sample_size, wins, losses, frequency, win_rate, adjusted_win_rate,
    baseline_win_rate, wilson_low, wilson_high, unique_players,
    player_concentration_hhi, top_player_share, evidence_label, option_rank,
    data_provenance, updated_at
  )
  select
    patch, region, 420, 11, 'CHALLENGER', role,
    champion_id, champion_name, opponent_champion_id, opponent_champion_name,
    path_key, starting_item_ids, first_item_id, null,
    core_item_ids, purchase_sequence, 'retained_item_proxy',
    sample_size, wins, losses,
    sample_size::numeric / total_games::numeric,
    raw_rate, adjusted_rate, baseline_rate,
    greatest(0.0, wilson_low), least(1.0, wilson_high),
    unique_players, hhi, top_player_share,
    case
      when sample_size >= 100 and unique_players >= 20 and hhi <= 0.10 and top_player_share <= 0.20
        then 'strong'
      when sample_size >= 30 and unique_players >= 8 and hhi <= 0.25 and top_player_share <= 0.35
        then 'moderate'
      when sample_size >= 10 and unique_players >= 3 and top_player_share <= 0.60
        then 'limited'
      else 'insufficient'
    end,
    option_rank, 'live', v_refreshed_at
  from ranked
  where option_rank <= 20;

  get diagnostics v_item_rows = row_count;

  return pg_catalog.jsonb_build_object(
    'refreshedAt', v_refreshed_at,
    'patch', p_patch,
    'region', p_region,
    'minimumGames', p_min_games,
    'runePageRows', v_rune_rows,
    'summonerSpellRows', v_spell_rows,
    'itemPathRows', v_item_rows
  );
end;
$$;

comment on function public.refresh_companion_analytics(text, text, integer) is
  'Rebuilds aggregate-only rune, spell, and staged item-path evidence for the live companion.';

-- ---------------------------------------------------------------------------
-- Bounded, exact-patch public contract
-- ---------------------------------------------------------------------------

create or replace function public.get_companion_recommendations_v1(
  p_patch text,
  p_region text,
  p_queue_id integer,
  p_map_id integer,
  p_role text,
  p_champion_id integer,
  p_opponent_champion_id integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_dataset public.dataset_status%rowtype;
  v_dataset_found boolean := false;
  v_matchup_row public.matchup_stats%rowtype;
  v_matchup_found boolean := false;
  v_status text := 'ready';
  v_reason_codes text[] := '{}'::text[];
  v_matchup jsonb := 'null'::jsonb;
  v_counter_candidates jsonb := '[]'::jsonb;
  v_rune_pages jsonb := '[]'::jsonb;
  v_spell_sets jsonb := '[]'::jsonb;
  v_item_paths jsonb := '[]'::jsonb;
begin
  if p_patch is null
    or p_patch !~ '^[0-9]+\.[0-9]+$'
    or p_region is null
    or p_region not in ('EUW', 'EUNE')
    or p_queue_id is distinct from 420
    or p_map_id is distinct from 11
    or p_role is null
    or p_role not in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY')
    or p_opponent_champion_id is null
    or p_opponent_champion_id <= 0
    or (
      p_champion_id is not null
      and (p_champion_id <= 0 or p_champion_id = p_opponent_champion_id)
    )
  then
    return pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'status', 'unsupported',
      'reasonCodes', pg_catalog.jsonb_build_array('unsupported_context'),
      'context', pg_catalog.jsonb_build_object(
        'patch', p_patch,
        'region', p_region,
        'queueId', p_queue_id,
        'mapId', p_map_id,
        'cohort', 'CHALLENGER',
        'role', p_role,
        'championId', p_champion_id,
        'opponentChampionId', p_opponent_champion_id
      ),
      'dataset', null,
      'matchup', null,
      'counterCandidates', '[]'::jsonb,
      'runePages', '[]'::jsonb,
      'summonerSpellSets', '[]'::jsonb,
      'itemPaths', '[]'::jsonb,
      'warnings', pg_catalog.jsonb_build_array(
        'This version supports EUW/EUNE Challenger Ranked Solo on Summoner''s Rift only.'
      )
    );
  end if;

  select ds.*
  into v_dataset
  from public.dataset_status ds
  where ds.patch = p_patch
    and ds.region = p_region
    and ds.queue_id = p_queue_id;
  v_dataset_found := found;

  if not v_dataset_found then
    v_status := 'insufficient';
    v_reason_codes := pg_catalog.array_append(v_reason_codes, 'dataset_unavailable');
  elsif v_dataset.data_provenance <> 'live' then
    v_status := 'insufficient';
    v_reason_codes := pg_catalog.array_append(v_reason_codes, 'live_dataset_unavailable');
  elsif v_dataset.status = 'stale' then
    v_status := 'stale';
    v_reason_codes := pg_catalog.array_append(v_reason_codes, 'dataset_stale');
  elsif v_dataset.status <> 'ready' then
    v_status := 'insufficient';
    v_reason_codes := pg_catalog.array_append(
      v_reason_codes,
      'dataset_' || v_dataset.status
    );
  end if;

  if p_champion_id is null then
    v_reason_codes := pg_catalog.array_append(
      v_reason_codes,
      'local_champion_not_selected'
    );
  end if;

  if v_dataset_found and v_dataset.data_provenance = 'live' then
    if p_champion_id is not null then
      select ms.*
      into v_matchup_row
      from public.matchup_stats ms
      where ms.patch = p_patch
        and ms.region = p_region
        and ms.role = p_role
        and ms.champion_id = p_champion_id
        and ms.opponent_champion_id = p_opponent_champion_id;
      v_matchup_found := found;

      if v_matchup_found
        and v_matchup_row.early_game_sample_size > 0
        and v_matchup_row.avg_gold_diff_15 is not null
        and v_matchup_row.avg_cs_diff_15 is not null
        and v_matchup_row.avg_xp_diff_15 is not null
      then
        v_matchup := pg_catalog.jsonb_build_object(
          'championId', v_matchup_row.champion_id,
          'championName', v_matchup_row.champion_name,
          'opponentChampionId', v_matchup_row.opponent_champion_id,
          'opponentChampionName', v_matchup_row.opponent_champion_name,
          'evidence', pg_catalog.jsonb_build_object(
            'sampleSize', v_matchup_row.sample_size,
            'uniquePlayers', v_matchup_row.unique_players,
            'rawWinRate', v_matchup_row.win_rate,
            'adjustedWinRate', v_matchup_row.adjusted_win_rate,
            'baselineWinRate', v_matchup_row.baseline_win_rate,
            'adjustedLift', v_matchup_row.adjusted_win_rate - v_matchup_row.baseline_win_rate,
            'interval95', pg_catalog.jsonb_build_object(
              'low', v_matchup_row.wilson_low,
              'high', v_matchup_row.wilson_high,
              'metric', 'rawWinRate'
            ),
            'topPlayerShare', v_matchup_row.top_player_share,
            'playerConcentrationHhi', v_matchup_row.player_concentration_hhi,
            'deltas15', pg_catalog.jsonb_build_object(
              'gold', v_matchup_row.avg_gold_diff_15,
              'cs', v_matchup_row.avg_cs_diff_15,
              'xp', v_matchup_row.avg_xp_diff_15
            ),
            'earlyGameSampleSize', v_matchup_row.early_game_sample_size,
            'label', v_matchup_row.evidence_label
          )
        );

        if v_matchup_row.evidence_label = 'insufficient' and v_status = 'ready' then
          v_status := 'insufficient';
          v_reason_codes := pg_catalog.array_append(v_reason_codes, 'matchup_evidence_insufficient');
        end if;
      elsif v_matchup_found then
        v_matchup_found := false;
        if v_status = 'ready' then
          v_status := 'insufficient';
        end if;
        v_reason_codes := pg_catalog.array_append(
          v_reason_codes,
          'early_game_evidence_unavailable'
        );
      else
        if v_status = 'ready' then
          v_status := 'insufficient';
        end if;
        v_reason_codes := pg_catalog.array_append(v_reason_codes, 'matchup_unavailable');
      end if;
    end if;

    select coalesce(pg_catalog.jsonb_agg(candidate order by counter_score desc, sample_size desc), '[]'::jsonb)
    into v_counter_candidates
    from (
      select
        ms.counter_score,
        ms.sample_size,
        pg_catalog.jsonb_build_object(
          'championId', ms.champion_id,
          'championName', ms.champion_name,
          'opponentChampionId', ms.opponent_champion_id,
          'opponentChampionName', ms.opponent_champion_name,
          'evidence', pg_catalog.jsonb_build_object(
            'sampleSize', ms.sample_size,
            'uniquePlayers', ms.unique_players,
            'rawWinRate', ms.win_rate,
            'adjustedWinRate', ms.adjusted_win_rate,
            'baselineWinRate', ms.baseline_win_rate,
            'adjustedLift', ms.adjusted_win_rate - ms.baseline_win_rate,
            'interval95', pg_catalog.jsonb_build_object(
              'low', ms.wilson_low,
              'high', ms.wilson_high,
              'metric', 'rawWinRate'
            ),
            'topPlayerShare', ms.top_player_share,
            'playerConcentrationHhi', ms.player_concentration_hhi,
            'deltas15', pg_catalog.jsonb_build_object(
              'gold', ms.avg_gold_diff_15,
              'cs', ms.avg_cs_diff_15,
              'xp', ms.avg_xp_diff_15
            ),
            'earlyGameSampleSize', ms.early_game_sample_size,
            'label', ms.evidence_label
          )
        ) as candidate
      from public.matchup_stats ms
      where ms.patch = p_patch
        and ms.region = p_region
        and ms.role = p_role
        and ms.opponent_champion_id = p_opponent_champion_id
        and ms.evidence_label in ('strong', 'moderate')
        and ms.sample_size >= 50
        and ms.unique_players >= 15
        and ms.top_player_share <= 0.25
        and ms.early_game_sample_size >= 30
        and ms.avg_gold_diff_15 is not null
        and ms.avg_cs_diff_15 is not null
        and ms.avg_xp_diff_15 is not null
        and ms.prediction_label = 'favorable'
        and ms.adjusted_win_rate > ms.baseline_win_rate
        and ms.wilson_low > ms.baseline_win_rate
      order by ms.counter_score desc, ms.sample_size desc, ms.champion_id
      limit 3
    ) ranked_counters;

    if pg_catalog.jsonb_array_length(v_counter_candidates) = 0 then
      v_reason_codes := pg_catalog.array_append(v_reason_codes, 'counter_evidence_unavailable');
    end if;

    if p_champion_id is not null and v_matchup_found then
      select coalesce(pg_catalog.jsonb_agg(option order by evidence_order desc, sample_size desc, option_rank), '[]'::jsonb)
    into v_rune_pages
    from (
      select
        case rps.evidence_label
          when 'strong' then 3 when 'moderate' then 2 when 'limited' then 1 else 0
        end as evidence_order,
        rps.sample_size,
        rps.option_rank,
        pg_catalog.jsonb_build_object(
          'runePageKey', rps.rune_page_key,
          'primaryStyleId', rps.primary_style_id,
          'secondaryStyleId', rps.secondary_style_id,
          'perkIds', rps.perk_ids,
          'statPerkIds', rps.stat_perk_ids,
          'evidence', pg_catalog.jsonb_build_object(
            'sampleSize', rps.sample_size,
            'uniquePlayers', rps.unique_players,
            'rawWinRate', rps.win_rate,
            'adjustedWinRate', rps.adjusted_win_rate,
            'baselineWinRate', rps.baseline_win_rate,
            'adjustedLift', rps.adjusted_win_rate - rps.baseline_win_rate,
            'interval95', pg_catalog.jsonb_build_object(
              'low', rps.wilson_low, 'high', rps.wilson_high, 'metric', 'rawWinRate'
            ),
            'topPlayerShare', rps.top_player_share,
            'playerConcentrationHhi', rps.player_concentration_hhi,
            'deltas15', pg_catalog.jsonb_build_object(
              'gold', v_matchup_row.avg_gold_diff_15,
              'cs', v_matchup_row.avg_cs_diff_15,
              'xp', v_matchup_row.avg_xp_diff_15
            ),
            'earlyGameSampleSize', v_matchup_row.early_game_sample_size,
            'frequency', rps.frequency,
            'label', rps.evidence_label
          )
        ) as option
      from public.rune_page_stats rps
      where rps.patch = p_patch and rps.region = p_region
        and rps.queue_id = p_queue_id and rps.map_id = p_map_id
        and rps.cohort = 'CHALLENGER' and rps.role = p_role
        and rps.champion_id = p_champion_id
        and rps.opponent_champion_id = p_opponent_champion_id
        and rps.evidence_label <> 'insufficient'
      order by evidence_order desc, rps.sample_size desc, rps.option_rank
      limit 3
    ) ranked_runes;

    select coalesce(pg_catalog.jsonb_agg(option order by evidence_order desc, sample_size desc, option_rank), '[]'::jsonb)
    into v_spell_sets
    from (
      select
        case sss.evidence_label
          when 'strong' then 3 when 'moderate' then 2 when 'limited' then 1 else 0
        end as evidence_order,
        sss.sample_size,
        sss.option_rank,
        pg_catalog.jsonb_build_object(
          'spellPairKey', sss.spell_pair_key,
          'spellIds', sss.spell_ids,
          'evidence', pg_catalog.jsonb_build_object(
            'sampleSize', sss.sample_size,
            'uniquePlayers', sss.unique_players,
            'rawWinRate', sss.win_rate,
            'adjustedWinRate', sss.adjusted_win_rate,
            'baselineWinRate', sss.baseline_win_rate,
            'adjustedLift', sss.adjusted_win_rate - sss.baseline_win_rate,
            'interval95', pg_catalog.jsonb_build_object(
              'low', sss.wilson_low, 'high', sss.wilson_high, 'metric', 'rawWinRate'
            ),
            'topPlayerShare', sss.top_player_share,
            'playerConcentrationHhi', sss.player_concentration_hhi,
            'deltas15', pg_catalog.jsonb_build_object(
              'gold', v_matchup_row.avg_gold_diff_15,
              'cs', v_matchup_row.avg_cs_diff_15,
              'xp', v_matchup_row.avg_xp_diff_15
            ),
            'earlyGameSampleSize', v_matchup_row.early_game_sample_size,
            'frequency', sss.frequency,
            'label', sss.evidence_label
          )
        ) as option
      from public.summoner_spell_stats sss
      where sss.patch = p_patch and sss.region = p_region
        and sss.queue_id = p_queue_id and sss.map_id = p_map_id
        and sss.cohort = 'CHALLENGER' and sss.role = p_role
        and sss.champion_id = p_champion_id
        and sss.opponent_champion_id = p_opponent_champion_id
        and sss.evidence_label <> 'insufficient'
      order by evidence_order desc, sss.sample_size desc, sss.option_rank
      limit 3
    ) ranked_spells;

    select coalesce(pg_catalog.jsonb_agg(option order by evidence_order desc, sample_size desc, option_rank), '[]'::jsonb)
    into v_item_paths
    from (
      select
        case ips.evidence_label
          when 'strong' then 3 when 'moderate' then 2 when 'limited' then 1 else 0
        end as evidence_order,
        ips.sample_size,
        ips.option_rank,
        pg_catalog.jsonb_build_object(
          'pathKey', ips.path_key,
          'startingItemIds', ips.starting_item_ids,
          'firstItemId', ips.first_item_id,
          'bootsItemId', ips.boots_item_id,
          'coreItemIds', ips.core_item_ids,
          'purchaseSequence', ips.purchase_sequence,
          'stageQuality', ips.stage_quality,
          'evidence', pg_catalog.jsonb_build_object(
            'sampleSize', ips.sample_size,
            'uniquePlayers', ips.unique_players,
            'rawWinRate', ips.win_rate,
            'adjustedWinRate', ips.adjusted_win_rate,
            'baselineWinRate', ips.baseline_win_rate,
            'adjustedLift', ips.adjusted_win_rate - ips.baseline_win_rate,
            'interval95', pg_catalog.jsonb_build_object(
              'low', ips.wilson_low, 'high', ips.wilson_high, 'metric', 'rawWinRate'
            ),
            'topPlayerShare', ips.top_player_share,
            'playerConcentrationHhi', ips.player_concentration_hhi,
            'deltas15', pg_catalog.jsonb_build_object(
              'gold', v_matchup_row.avg_gold_diff_15,
              'cs', v_matchup_row.avg_cs_diff_15,
              'xp', v_matchup_row.avg_xp_diff_15
            ),
            'earlyGameSampleSize', v_matchup_row.early_game_sample_size,
            'frequency', ips.frequency,
            'label', ips.evidence_label
          ),
          'biasWarning', 'Item win rates contain affordability and win-more bias.'
        ) as option
      from public.item_path_stats ips
      where ips.patch = p_patch and ips.region = p_region
        and ips.queue_id = p_queue_id and ips.map_id = p_map_id
        and ips.cohort = 'CHALLENGER' and ips.role = p_role
        and ips.champion_id = p_champion_id
        and ips.opponent_champion_id = p_opponent_champion_id
        and ips.evidence_label <> 'insufficient'
      order by evidence_order desc, ips.sample_size desc, ips.option_rank
      limit 3
    ) ranked_items;

      if pg_catalog.jsonb_array_length(v_rune_pages) = 0 then
        v_reason_codes := pg_catalog.array_append(v_reason_codes, 'rune_evidence_unavailable');
      end if;
      if pg_catalog.jsonb_array_length(v_spell_sets) = 0 then
        v_reason_codes := pg_catalog.array_append(v_reason_codes, 'spell_evidence_unavailable');
      end if;
      if pg_catalog.jsonb_array_length(v_item_paths) = 0 then
        v_reason_codes := pg_catalog.array_append(v_reason_codes, 'item_path_evidence_unavailable');
      end if;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'status', v_status,
    'reasonCodes', pg_catalog.to_jsonb(v_reason_codes),
    'context', pg_catalog.jsonb_build_object(
      'patch', p_patch,
      'region', p_region,
      'queueId', p_queue_id,
      'mapId', p_map_id,
      'cohort', 'CHALLENGER',
      'role', p_role,
      'championId', p_champion_id,
      'opponentChampionId', p_opponent_champion_id
    ),
    'dataset', case
      when v_dataset_found then pg_catalog.jsonb_build_object(
        'dataPatch', v_dataset.patch,
        'dataDragonVersion', v_dataset.ddragon_version,
        'status', v_dataset.status,
        'provenance', v_dataset.data_provenance,
        'refreshedAt', v_dataset.analytics_refreshed_at,
        'lastIngestionAt', v_dataset.last_ingestion_at,
        'matchCount', v_dataset.match_count,
        'trackedPlayerCount', v_dataset.tracked_player_count,
        'qualityNote', v_dataset.data_quality_note
      )
      else 'null'::jsonb
    end,
    'matchup', v_matchup,
    'counterCandidates', v_counter_candidates,
    'runePages', v_rune_pages,
    'summonerSpellSets', v_spell_sets,
    'itemPaths', v_item_paths,
    'warnings', pg_catalog.jsonb_build_array(
      'Recommendations are descriptive pre-game choices, not live gameplay instructions.',
      'Item win rates contain affordability and win-more bias.',
      'Item stages are retained-item proxies until matching Data Dragon metadata is imported.',
      'No result is mixed with another patch.'
    )
  );
end;
$$;

comment on function public.get_companion_recommendations_v1(
  text, text, integer, integer, text, integer, integer
) is
  'Returns a versioned, exact-patch, aggregate-only recommendation bundle capped at three options per category.';

-- ---------------------------------------------------------------------------
-- Explicit Data API boundary
-- ---------------------------------------------------------------------------

alter table public.rune_page_stats enable row level security;
alter table public.summoner_spell_stats enable row level security;
alter table public.item_path_stats enable row level security;

revoke all on table
  public.rune_page_stats,
  public.summoner_spell_stats,
  public.item_path_stats
from public, anon, authenticated;

grant select on table
  public.rune_page_stats,
  public.summoner_spell_stats,
  public.item_path_stats
to anon, authenticated;

grant select, insert, update, delete on table
  public.rune_page_stats,
  public.summoner_spell_stats,
  public.item_path_stats
to service_role;

create policy rune_page_stats_public_read
  on public.rune_page_stats for select
  to anon, authenticated
  using (true);

create policy summoner_spell_stats_public_read
  on public.summoner_spell_stats for select
  to anon, authenticated
  using (true);

create policy item_path_stats_public_read
  on public.item_path_stats for select
  to anon, authenticated
  using (true);

revoke all on function public.refresh_companion_analytics(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.refresh_companion_analytics(text, text, integer)
  to service_role;

revoke all on function public.get_companion_recommendations_v1(
  text, text, integer, integer, text, integer, integer
)
from public, anon, authenticated;
grant execute on function public.get_companion_recommendations_v1(
  text, text, integer, integer, text, integer, integer
)
to anon, authenticated, service_role;

comment on table public.rune_page_stats is
  'Aggregate-only exact-matchup rune pages. Contains no player or match identifiers.';
comment on table public.summoner_spell_stats is
  'Aggregate-only exact-matchup summoner spell pairs. Spell order is canonicalized.';
comment on table public.item_path_stats is
  'Aggregate-only staged item paths. Retained-item proxies remain explicitly marked until Data Dragon enrichment.';
