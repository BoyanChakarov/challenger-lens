import { describe, expect, it } from "vitest";

import {
  fetchCompanionRecommendations,
  parseRecommendationResponse,
  recommendationCacheKey,
  toDatabaseRole,
  type RecommendationRequest,
  type StorageLike,
} from "../src/companion/recommendation-client";
import {
  mergeRecommendationResults,
  requestsForSnapshot,
} from "../src/companion/useRecommendations";
import type { DataDragonCatalog } from "../src/companion/dataDragon";
import { createBrowserDemoSnapshot } from "../src/companion/demo";

const NOW = new Date("2026-09-07T08:00:00.000Z");

const request: RecommendationRequest = {
  patch: "16.17",
  region: "EUW",
  queueId: 420,
  mapId: 11,
  role: "MID",
  localChampionId: 103,
  opponentChampionId: 134,
};

const evidence = (overrides: Record<string, unknown> = {}) => ({
  sampleSize: 200,
  uniquePlayers: 80,
  rawWinRate: 0.56,
  adjustedWinRate: 0.55,
  baselineWinRate: 0.5,
  adjustedLift: 0.05,
  interval95: { low: 0.52, high: 0.6, metric: "rawWinRate" },
  topPlayerShare: 0.1,
  playerConcentrationHhi: 0.04,
  deltas15: { gold: 140, cs: 3.2, xp: 90 },
  earlyGameSampleSize: 170,
  label: "strong",
  ...overrides,
});

const response = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  status: "ready",
  reasonCodes: [],
  context: {
    patch: "16.17",
    region: "EUW",
    queueId: 420,
    mapId: 11,
    cohort: "CHALLENGER",
    role: "MIDDLE",
    championId: 103,
    opponentChampionId: 134,
  },
  dataset: {
    dataPatch: "16.17",
    dataDragonVersion: "16.17.1",
    status: "ready",
    provenance: "live",
    refreshedAt: "2026-09-07T07:00:00.000Z",
    lastIngestionAt: "2026-09-07T06:30:00.000Z",
    matchCount: 50_000,
    trackedPlayerCount: 300,
    qualityNote: "Current-patch Challenger observations.",
  },
  matchup: {
    championId: 103,
    championName: "Ahri",
    opponentChampionId: 134,
    opponentChampionName: "Syndra",
    evidence: evidence(),
  },
  counterCandidates: [
    {
      championId: 7,
      championName: "LeBlanc",
      opponentChampionId: 134,
      opponentChampionName: "Syndra",
      evidence: evidence({
        sampleSize: 250,
        uniquePlayers: 90,
        rawWinRate: 0.58,
        adjustedWinRate: 0.57,
        adjustedLift: 0.07,
        interval95: { low: 0.53, high: 0.63, metric: "rawWinRate" },
      }),
    },
  ],
  runePages: [
    {
      runePageKey: "primary",
      primaryStyleId: 8100,
      secondaryStyleId: 8200,
      perkIds: [8112, 8126, 8138, 8106],
      statPerkIds: [5008, 5008, 5001],
      evidence: evidence({ frequency: 0.42 }),
    },
  ],
  summonerSpellSets: [
    {
      spellPairKey: "4:14",
      spellIds: [4, 14],
      evidence: evidence({ frequency: 0.61 }),
    },
  ],
  itemPaths: [
    {
      pathKey: "1056:6655:3020:4645",
      startingItemIds: [1056, 2003],
      firstItemId: 6655,
      bootsItemId: 3020,
      coreItemIds: [6655, 3020, 4645],
      purchaseSequence: [1056, 2003, 6655, 3020, 4645],
      stageQuality: "metadata_enriched",
      evidence: evidence({ frequency: 0.31 }),
      biasWarning: "Item win rates contain affordability and win-more bias.",
    },
  ],
  warnings: ["No result is mixed with another patch."],
  ...overrides,
});

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("companion recommendation client", () => {
  it("focuses the recommendation request on the chosen lane opponent and planned champion", () => {
    const snapshot = createBrowserDemoSnapshot("champion_select");
    const requests = requestsForSnapshot(snapshot, {
      opponentChampionId: 517,
      localChampion: { id: 166, name: "Akshan" },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      role: "MID",
      localChampionId: 166,
      opponentChampionId: 517,
    });
  });

  it("requires explicit opt-in and a manual role before using ranked evidence in a custom game", () => {
    const customSnapshot = {
      ...createBrowserDemoSnapshot("champion_select"),
      queue: { id: 0, name: "Custom" },
      draft: {
        ...createBrowserDemoSnapshot("champion_select").draft!,
        assignedRole: undefined,
      },
    };

    expect(requestsForSnapshot(customSnapshot)).toEqual([]);
    const requests = requestsForSnapshot(customSnapshot, {
      role: "MID",
      useRankedEvidenceForCustom: true,
    });
    expect(requests[0]).toMatchObject({ queueId: 420, mapId: 11, role: "MID" });
  });

  it("maps UI roles to the aggregate RPC roles", () => {
    expect(toDatabaseRole("TOP")).toBe("TOP");
    expect(toDatabaseRole("JUNGLE")).toBe("JUNGLE");
    expect(toDatabaseRole("MID")).toBe("MIDDLE");
    expect(toDatabaseRole("ADC")).toBe("BOTTOM");
    expect(toDatabaseRole("SUPPORT")).toBe("UTILITY");
  });

  it("strictly maps aggregate evidence without KDA or final-game features", () => {
    const result = parseRecommendationResponse(response(), request, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.patch).toBe("16.17");
    expect(result.bundle.localChampion).toEqual({ id: 103, name: "Ahri" });
    expect(result.bundle.counterGroups[0]?.opponent).toEqual({
      id: 134,
      name: "Syndra",
    });
    expect(result.bundle.counterGroups[0]?.candidates).toHaveLength(1);
    expect(result.bundle.runePages).toHaveLength(1);
    expect(result.bundle.spellPairs[0]?.spells).toEqual([
      { id: 4, name: "Flash" },
      { id: 14, name: "Ignite" },
    ]);
    expect(result.bundle.itemPaths[0]?.firstCompletedItem).toEqual({
      id: 6655,
      name: "Item 6655",
    });
    expect(result.bundle.counterGroups[0]?.candidates[0]?.evidence).not.toHaveProperty(
      "kda",
    );
    expect(result.bundle.counterGroups[0]?.candidates[0]?.explanations[0]).toContain(
      "player-concentration HHI",
    );
    expect(Object.isFrozen(result.bundle)).toBe(true);
  });

  it("rejects unknown fields and any exact-context mismatch", () => {
    const withKda = response({ kda: 99 });
    const wrongPatch = response({
      context: { ...response().context, patch: "16.16" },
    });
    const wrongDatasetPatch = response({
      dataset: { ...response().dataset, dataPatch: "16.16" },
    });

    expect(parseRecommendationResponse(withKda, request, NOW)).toMatchObject({
      ok: false,
      reason: "invalid_backend_response",
    });
    expect(parseRecommendationResponse(wrongPatch, request, NOW)).toMatchObject({
      ok: false,
      reason: "invalid_backend_response",
    });
    expect(
      parseRecommendationResponse(wrongDatasetPatch, request, NOW),
    ).toMatchObject({ ok: false, reason: "invalid_backend_response" });
  });

  it("uses the exact RPC parameters and caches only the exact context", async () => {
    const storage = new MemoryStorage();
    const calls: unknown[] = [];
    const network = await fetchCompanionRecommendations(request, {
      storage,
      now: () => NOW,
      invokeRpc: async (params) => {
        calls.push(params);
        return { data: response(), error: null };
      },
    });

    expect(network).toMatchObject({ ok: true, source: "network", stale: false });
    expect(calls).toEqual([
      {
        p_patch: "16.17",
        p_region: "EUW",
        p_queue_id: 420,
        p_map_id: 11,
        p_role: "MIDDLE",
        p_champion_id: 103,
        p_opponent_champion_id: 134,
      },
    ]);
    expect(storage.values.has(recommendationCacheKey(request) ?? "")).toBe(true);

    const cached = await fetchCompanionRecommendations(request, {
      storage,
      now: () => new Date("2026-09-07T08:05:00.000Z"),
      invokeRpc: async () => {
        throw new Error("offline");
      },
    });
    expect(cached).toMatchObject({
      ok: true,
      source: "cache",
      stale: true,
      staleReason: "backend_unavailable",
      cacheAgeMs: 300_000,
    });

    const nextPatch = await fetchCompanionRecommendations(
      { ...request, patch: "16.18" },
      {
        storage,
        now: () => NOW,
        invokeRpc: async () => {
          throw new Error("offline");
        },
      },
    );
    expect(nextPatch).toMatchObject({
      ok: false,
      reason: "backend_unavailable",
    });
  });

  it("uses matching Data Dragon metadata to name items and identify boots", async () => {
    const catalog: DataDragonCatalog = {
      version: "16.17.1",
      championNames: {},
      spellNames: {},
      itemData: {
        1056: { name: "Doran's Ring", tags: [], into: [], purchasable: true },
        2003: { name: "Health Potion", tags: [], into: [], purchasable: true },
        6655: { name: "Luden's Companion", tags: ["SpellDamage"], into: [], purchasable: true },
        3020: { name: "Sorcerer's Shoes", tags: ["Boots"], into: [], purchasable: true },
        4645: { name: "Shadowflame", tags: ["SpellDamage"], into: [], purchasable: true },
      },
    };
    const payload = response({
      itemPaths: [{
        ...response().itemPaths[0],
        firstItemId: null,
        bootsItemId: null,
        stageQuality: "retained_item_proxy",
      }],
    });

    const result = await fetchCompanionRecommendations(request, {
      catalog,
      storage: null,
      now: () => NOW,
      invokeRpc: async () => ({ data: payload, error: null }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.itemPaths[0]).toMatchObject({
      firstCompletedItem: { id: 6655, name: "Luden's Companion" },
      boots: { id: 3020, name: "Sorcerer's Shoes" },
    });
  });

  it("supports counter lookup before a local champion is selected", () => {
    const withoutLocal = { ...request, localChampionId: undefined };
    const payload = response({
      context: { ...response().context, championId: null },
      matchup: null,
      runePages: [],
      summonerSpellSets: [],
      itemPaths: [],
      reasonCodes: ["local_champion_not_selected"],
    });
    const result = parseRecommendationResponse(payload, withoutLocal, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.localChampion).toBeUndefined();
    expect(result.bundle.counterGroups[0]?.candidates).toHaveLength(1);
    expect(result.bundle.runePages).toEqual([]);
  });

  it("merges every visible enemy result and labels an exact-patch cache fallback", () => {
    const first = parseRecommendationResponse(response(), request, NOW);
    const secondRequest = {
      ...request,
      opponentChampionId: 238,
      opponentChampionName: "Zed",
    };
    const second = parseRecommendationResponse(
      response({
        context: { ...response().context, opponentChampionId: 238 },
        matchup: {
          ...response().matchup,
          opponentChampionId: 238,
          opponentChampionName: "Zed",
        },
        counterCandidates: [{
          ...response().counterCandidates[0],
          opponentChampionId: 238,
          opponentChampionName: "Zed",
        }],
      }),
      secondRequest,
      NOW,
    );

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const merged = mergeRecommendationResults([
      first,
      { ...second, source: "cache", stale: true, staleReason: "backend_unavailable" },
    ], NOW);

    expect(merged?.counterGroups.map((group) => group.opponent.id)).toEqual([134, 238]);
    expect(merged).toMatchObject({ dataStatus: "stale" });
    expect(merged?.dataNotice).toMatch(/exact patch/i);
  });

  it("refuses unsupported input before invoking the backend", async () => {
    let invoked = false;
    const result = await fetchCompanionRecommendations(
      { ...request, queueId: 440 },
      {
        invokeRpc: async () => {
          invoked = true;
          return { data: response(), error: null };
        },
      },
    );

    expect(invoked).toBe(false);
    expect(result).toMatchObject({ ok: false, reason: "invalid_context" });
  });
});
