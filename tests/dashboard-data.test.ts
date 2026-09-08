import { describe, expect, it } from "vitest";

import {
  normalizeChampionStat,
  normalizeDatasetStatus,
  normalizeItemBuildStat,
  normalizeMatchupStat,
} from "../src/lib/dashboard-data";

describe("Supabase aggregate normalization", () => {
  it("maps the exact dataset_status schema and preserves synthetic provenance", () => {
    const row = normalizeDatasetStatus({
      patch: "16.17",
      region: "EUNE",
      tracked_player_count: 183,
      match_count: 910,
      participant_observation_count: 1_184,
      analytics_refreshed_at: "2026-09-05T00:20:00Z",
      oldest_game_at: "2026-08-28T00:00:00Z",
      latest_game_at: "2026-09-04T21:45:00Z",
      data_provenance: "synthetic",
    });

    expect(row.playerCount).toBe(183);
    expect(row.participantCount).toBe(1_184);
    expect(row.windowStart).toBe("2026-08-28T00:00:00Z");
    expect(row.dataProvenance).toBe("synthetic");
  });

  it("maps current champion metric column names", () => {
    const row = normalizeChampionStat({
      patch: "16.17",
      region: "EUW",
      role: "MIDDLE",
      champion_id: 38,
      champion_name: "Kassadin",
      sample_size: 100,
      wins: 55,
      avg_cs_per_min: 8.4,
      avg_gold_per_min: 431.2,
      avg_damage_per_min: 640.1,
      unique_players: 40,
    });

    expect(row.role).toBe("MID");
    expect(row.avgCsPerMinute).toBe(8.4);
    expect(row.avgGoldPerMinute).toBe(431.2);
  });

  it("maps canonical opponent and baseline fields", () => {
    const row = normalizeMatchupStat({
      patch: "16.17",
      region: "EUW",
      role: "MIDDLE",
      champion_id: 38,
      champion_name: "Kassadin",
      opponent_champion_id: 134,
      opponent_champion_name: "Syndra",
      sample_size: 80,
      wins: 48,
      adjusted_win_rate: 0.57,
      baseline_win_rate: 0.53,
      wilson_low: 0.49,
      wilson_high: 0.70,
      confidence_score: 72,
    });

    expect(row.opponentId).toBe(134);
    expect(row.opponentName).toBe("Syndra");
    expect(row.winRateLift).toBeCloseTo(0.04);
    expect(row.evidenceScore).toBe(72);
  });

  it("falls back to readable item IDs when names are not enriched", () => {
    const row = normalizeItemBuildStat({
      patch: "16.17",
      region: "EUW",
      role: "MIDDLE",
      champion_id: 38,
      champion_name: "Kassadin",
      opponent_champion_id: 134,
      opponent_champion_name: "Syndra",
      item_names: [],
      item_ids: [6657, 3040],
      sample_size: 20,
      wins: 12,
      pick_rate: 0.25,
    });

    expect(row.opponentName).toBe("Syndra");
    expect(row.itemNames).toEqual(["Item 6657", "Item 3040"]);
  });
});
