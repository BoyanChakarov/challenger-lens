import type { SupabaseClient } from "@supabase/supabase-js";
import { demoData } from "../data/demo";
import type {
  ChampionStat,
  ConfidenceLabel,
  DashboardData,
  DashboardLoadResult,
  DatasetStatus,
  ItemBuildStat,
  MatchupStat,
  Region,
  Role,
} from "../types";
import {
  adjustedWinRate,
  calculateEvidenceScore,
  confidenceFromScore,
  wilsonInterval,
} from "./analytics";
import { isSupabaseConfigured, supabase } from "./supabase";

type UnknownRow = Record<string, unknown>;

function firstValue(row: UnknownRow, keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function textValue(row: UnknownRow, keys: string[], fallback = ""): string {
  const value = firstValue(row, keys);
  return value === undefined ? fallback : String(value);
}

function numberValue(row: UnknownRow, keys: string[], fallback = 0): number {
  const value = firstValue(row, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function rateValue(row: UnknownRow, keys: string[], fallback = 0): number {
  const value = numberValue(row, keys, fallback);
  return Math.abs(value) > 1 && Math.abs(value) <= 100 ? value / 100 : value;
}

function regionValue(row: UnknownRow): Region {
  const value = textValue(row, ["region", "platform", "platform_id"], "EUW").toUpperCase();
  return value.includes("EUN") || value.includes("EUNE") ? "EUNE" : "EUW";
}

function roleValue(row: UnknownRow): Role {
  const value = textValue(row, ["role", "team_position", "position"], "MID").toUpperCase();
  if (value === "MIDDLE") return "MID";
  if (value === "BOTTOM" || value === "BOT") return "ADC";
  if (value === "UTILITY") return "SUPPORT";
  if (["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"].includes(value)) {
    return value as Role;
  }
  return "MID";
}

function stringArray(row: UnknownRow, keys: string[]): string[] {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) {
      const items = value
        .map((entry) => {
          if (typeof entry === "string" || typeof entry === "number") return String(entry);
          if (entry && typeof entry === "object") {
            const record = entry as UnknownRow;
            return textValue(record, ["name", "item_name", "id", "item_id"]);
          }
          return "";
        })
        .filter(Boolean);
      if (items.length > 0) return items;
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed)) {
          const items = parsed.map(String).filter(Boolean);
          if (items.length > 0) return items;
          continue;
        }
      } catch {
        const items = value.split(/[>,|]/).map((item) => item.trim()).filter(Boolean);
        if (items.length > 0) return items;
      }
    }
  }
  return [];
}

export function normalizeDatasetStatus(row: UnknownRow, index = 0): DatasetStatus {
  const patch = textValue(row, ["patch", "game_version", "current_patch"], "unknown");
  const region = regionValue(row);
  return {
    id: textValue(row, ["id"], `${patch}-${region}-${index}`),
    patch,
    region,
    queue: textValue(row, ["queue", "queue_name"], "Ranked Solo / Challenger"),
    playerCount: numberValue(
      row,
      ["tracked_player_count", "player_count", "challenger_players", "players"],
    ),
    matchCount: numberValue(row, ["match_count", "matches", "games"]),
    participantCount: numberValue(
      row,
      ["participant_observation_count", "participant_count", "participants"],
    ),
    lastUpdated: textValue(
      row,
      [
        "analytics_refreshed_at",
        "last_ingestion_at",
        "last_updated_at",
        "updated_at",
        "collected_at",
        "created_at",
      ],
      new Date(0).toISOString(),
    ),
    windowStart:
      textValue(row, ["oldest_game_at", "window_start", "started_at"]) || undefined,
    windowEnd:
      textValue(row, ["latest_game_at", "window_end", "completed_at"]) || undefined,
    coveragePct:
      rateValue(row, ["coverage", "coverage_rate"], -1) >= 0
        ? rateValue(row, ["coverage", "coverage_rate"]) * 100
        : numberValue(row, ["coverage_pct"], 0),
    dataProvenance:
      textValue(row, ["data_provenance"], "live").toLowerCase() === "synthetic"
        ? "synthetic"
        : "live",
  };
}

export function normalizeChampionStat(row: UnknownRow, index = 0): ChampionStat {
  const games = numberValue(row, ["games", "game_count", "sample_size"]);
  const winRate = rateValue(row, ["win_rate", "raw_win_rate", "wr"]);
  const wins = numberValue(row, ["wins", "win_count"], Math.round(games * winRate));
  const championId = numberValue(row, ["champion_id", "championId"]);
  const patch = textValue(row, ["patch", "game_version"], "unknown");
  const region = regionValue(row);
  const role = roleValue(row);
  return {
    id: textValue(row, ["id"], `${patch}-${region}-${role}-${championId}-${index}`),
    patch,
    region,
    role,
    championId,
    championName: textValue(
      row,
      ["champion_name", "championName", "champion"],
      `Champion ${championId}`,
    ),
    games,
    wins,
    winRate: games > 0 ? wins / games : winRate,
    pickRate: rateValue(row, ["pick_rate", "presence_rate"]),
    avgKda: numberValue(row, ["avg_kda", "kda"]),
    avgCsPerMinute: numberValue(
      row,
      ["avg_cs_per_min", "avg_cs_per_minute", "cs_per_minute", "cs_per_min"],
    ),
    avgGoldPerMinute: numberValue(
      row,
      ["avg_gold_per_min", "avg_gold_per_minute", "gold_per_minute", "gold_per_min"],
    ),
    avgDamagePerMinute: numberValue(
      row,
      ["avg_damage_per_min", "avg_damage_per_minute", "damage_per_minute", "damage_per_min"],
    ),
    avgGoldDiff15: numberValue(row, ["avg_gold_diff_15", "gold_diff_15"]),
    avgCsDiff15: numberValue(row, ["avg_cs_diff_15", "cs_diff_15"]),
    uniquePlayers: numberValue(row, ["unique_players", "player_count"]),
  };
}

export function normalizeMatchupStat(row: UnknownRow, index = 0): MatchupStat {
  const games = numberValue(row, ["games", "game_count", "sample_size"]);
  const rawWinRate = rateValue(row, ["raw_win_rate", "win_rate", "wr"]);
  const wins = numberValue(row, ["wins", "win_count"], Math.round(games * rawWinRate));
  const baselineWinRate = rateValue(row, ["baseline_win_rate", "champion_baseline"], 0.5);
  const adjusted = rateValue(
    row,
    ["adjusted_win_rate", "shrunk_win_rate"],
    adjustedWinRate(wins, games, baselineWinRate),
  );
  const interval = wilsonInterval(wins, games);
  const wilsonLow = rateValue(row, ["wilson_low", "ci_low"], interval.low);
  const wilsonHigh = rateValue(row, ["wilson_high", "ci_high"], interval.high);
  const winRateLift = rateValue(
    row,
    ["win_rate_lift", "adjusted_lift", "wr_lift"],
    adjusted - baselineWinRate,
  );
  const avgGoldDiff15 = numberValue(row, ["avg_gold_diff_15", "gold_diff_15"]);
  const avgCsDiff15 = numberValue(row, ["avg_cs_diff_15", "cs_diff_15"]);
  const kdaDiff = numberValue(row, ["kda_diff", "avg_kda_diff"]);
  const uniquePlayers = numberValue(row, ["unique_players", "player_count"]);
  const topPlayerShare = rateValue(row, ["top_player_share", "max_player_share"]);
  const evidenceScore = numberValue(
    row,
    ["evidence_score", "confidence_score"],
    calculateEvidenceScore({
      games,
      uniquePlayers,
      topPlayerShare,
      wilsonLow,
      wilsonHigh,
      winRateLift,
      avgGoldDiff15,
      avgCsDiff15,
      kdaDiff,
    }),
  );
  const confidenceRaw = textValue(row, ["confidence_label", "confidence"]);
  const confidenceLabel: ConfidenceLabel = ["high", "medium", "low"].includes(
    confidenceRaw.toLowerCase(),
  )
    ? (`${confidenceRaw[0]?.toUpperCase()}${confidenceRaw.slice(1).toLowerCase()}` as ConfidenceLabel)
    : confidenceFromScore(evidenceScore);
  const championId = numberValue(row, ["champion_id", "championId"]);
  const opponentId = numberValue(
    row,
    ["opponent_champion_id", "opponent_id", "enemy_champion_id", "opponentId"],
  );
  const patch = textValue(row, ["patch", "game_version"], "unknown");
  const region = regionValue(row);
  const role = roleValue(row);

  return {
    id: textValue(row, ["id"], `${patch}-${region}-${role}-${championId}-${opponentId}-${index}`),
    patch,
    region,
    role,
    championId,
    championName: textValue(
      row,
      ["champion_name", "championName", "champion"],
      `Champion ${championId}`,
    ),
    opponentId,
    opponentName: textValue(
      row,
      [
        "opponent_champion_name",
        "opponent_name",
        "enemy_champion_name",
        "opponentName",
        "opponent",
      ],
      `Champion ${opponentId}`,
    ),
    games,
    wins,
    rawWinRate: games > 0 ? wins / games : rawWinRate,
    adjustedWinRate: adjusted,
    baselineWinRate,
    winRateLift,
    wilsonLow,
    wilsonHigh,
    avgGoldDiff15,
    medianGoldDiff15: numberValue(row, ["median_gold_diff_15"], avgGoldDiff15),
    avgCsDiff15,
    avgXpDiff15: numberValue(row, ["avg_xp_diff_15", "xp_diff_15"]),
    earlyGameSampleSize: numberValue(row, ["early_game_sample_size"], games),
    kdaDiff,
    uniquePlayers,
    topPlayerShare,
    evidenceScore,
    confidenceLabel,
  };
}

export function normalizeItemBuildStat(row: UnknownRow, index = 0): ItemBuildStat {
  const games = numberValue(row, ["games", "game_count", "sample_size"]);
  const winRate = rateValue(row, ["win_rate", "raw_win_rate", "wr"]);
  const wins = numberValue(row, ["wins", "win_count"], Math.round(games * winRate));
  const championId = numberValue(row, ["champion_id", "championId"]);
  const opponentId = numberValue(
    row,
    ["opponent_champion_id", "opponent_id", "enemy_champion_id", "opponentId"],
    -1,
  );
  const patch = textValue(row, ["patch", "game_version"], "unknown");
  const region = regionValue(row);
  const role = roleValue(row);
  const rawItems = stringArray(row, ["item_names", "core_items", "build_items", "items", "item_ids"]);
  const itemNames = rawItems.map((item) => (/^\d+$/.test(item) ? `Item ${item}` : item));

  return {
    id: textValue(row, ["id"], `${patch}-${region}-${role}-${championId}-${opponentId}-${index}`),
    patch,
    region,
    role,
    championId,
    championName: textValue(
      row,
      ["champion_name", "championName", "champion"],
      `Champion ${championId}`,
    ),
    opponentId: opponentId >= 0 ? opponentId : undefined,
    opponentName:
      textValue(row, [
        "opponent_champion_name",
        "opponent_name",
        "enemy_champion_name",
        "opponentName",
      ]) || undefined,
    buildLabel: textValue(row, ["build_label", "label"], "Observed final items"),
    itemNames,
    firstItem: textValue(row, ["first_item", "first_item_name"]) || itemNames[0],
    boots: textValue(row, ["boots", "boots_name"]) || undefined,
    games,
    wins,
    winRate: games > 0 ? wins / games : winRate,
    pickRate: rateValue(row, ["pick_rate", "build_rate", "share"]),
    avgCompletionMinutes:
      numberValue(row, ["avg_completion_minutes", "completion_minutes"], -1) >= 0
        ? numberValue(row, ["avg_completion_minutes", "completion_minutes"])
        : undefined,
  };
}

interface TableResult {
  data: UnknownRow[];
  error?: string;
}

async function fetchTable(
  client: SupabaseClient,
  table: "dataset_status" | "champion_stats" | "matchup_stats" | "item_build_stats",
  limit: number,
): Promise<TableResult> {
  const rows: UnknownRow[] = [];
  const pageSize = 1_000;

  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    const { data, error } = await client.from(table).select("*").range(from, to);
    if (error) return { data: rows, error: `${table}: ${error.message}` };

    const page = (data ?? []) as UnknownRow[];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }

  return { data: rows };
}

export async function loadDashboardData(): Promise<DashboardLoadResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      data: demoData,
      mode: "demo",
      message: "Supabase is not configured. Showing an illustrative portfolio dataset.",
    };
  }

  try {
    const [statusResult, championResult, matchupResult, buildResult] = await Promise.all([
      fetchTable(supabase, "dataset_status", 100),
      fetchTable(supabase, "champion_stats", 5_000),
      fetchTable(supabase, "matchup_stats", 5_000),
      fetchTable(supabase, "item_build_stats", 5_000),
    ]);
    const errors = [
      statusResult.error,
      championResult.error,
      matchupResult.error,
      buildResult.error,
    ].filter((error): error is string => Boolean(error));

    if (errors.length > 0 || championResult.data.length === 0 || matchupResult.data.length === 0) {
      throw new Error(errors[0] ?? "The aggregate tables do not contain dashboard rows yet.");
    }

    const data: DashboardData = {
      status: statusResult.data.map(normalizeDatasetStatus),
      champions: championResult.data.map(normalizeChampionStat),
      matchups: matchupResult.data.map(normalizeMatchupStat),
      itemBuilds: buildResult.data.map(normalizeItemBuildStat),
    };

    const containsLiveRows = data.status.some((row) => row.dataProvenance === "live");

    return {
      data,
      mode: containsLiveRows ? "live" : "demo",
      message: containsLiveRows
        ? "Reading public, pre-aggregated analytics from Supabase."
        : "Reading clearly labeled synthetic seed data from Supabase; no Riot observations are shown yet.",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The live dataset could not be loaded.";
    console.warn("Challenger Lens fell back to demo data:", reason);
    return {
      data: demoData,
      mode: "demo",
      message: `Live data is unavailable (${reason}). Showing an illustrative portfolio dataset.`,
    };
  }
}
