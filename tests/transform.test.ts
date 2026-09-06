import { describe, expect, it } from "vitest";

import { matchSchema, timelineSchema } from "../src/worker/riot-schemas";
import {
  marketingPatch,
  matchFilterReason,
  normalizePatch,
  transformEligibleMatch,
} from "../src/worker/transform";

const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

function participant(participantId: number) {
  const teamId = participantId <= 5 ? 100 : 200;
  const role = roles[(participantId - 1) % 5]!;
  return {
    participantId,
    puuid: `puuid-${participantId}`,
    teamId,
    championId: participantId + 10,
    championName: `Champion${participantId}`,
    teamPosition: role,
    individualPosition: role,
    lane: role,
    win: teamId === 100,
    kills: participantId,
    deaths: 2,
    assists: 4,
    totalMinionsKilled: 100 + participantId,
    neutralMinionsKilled: role === "JUNGLE" ? 80 : 0,
    goldEarned: 10_000 + participantId,
    totalDamageDealtToChampions: 15_000 + participantId,
    totalDamageTaken: 12_000,
    visionScore: 20,
    wardsPlaced: 8,
    wardsKilled: 2,
    visionWardsBoughtInGame: 1,
    champLevel: 15,
    item0: 3000 + participantId,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0,
  };
}

const match = matchSchema.parse({
  metadata: {
    dataVersion: "2",
    matchId: "EUW1_123",
    participants: Array.from({ length: 10 }, (_, index) => `puuid-${index + 1}`),
  },
  info: {
    gameCreation: 1_788_000_000_000,
    gameStartTimestamp: 1_788_000_010_000,
    gameEndTimestamp: 1_788_001_810_000,
    gameDuration: 1_800,
    gameMode: "CLASSIC",
    gameType: "MATCHED_GAME",
    gameVersion: "16.17.123.456",
    mapId: 11,
    platformId: "EUW1",
    queueId: 420,
    participants: Array.from({ length: 10 }, (_, index) => participant(index + 1)),
  },
});

const timeline = timelineSchema.parse({
  metadata: {
    dataVersion: "2",
    matchId: "EUW1_123",
    participants: Array.from({ length: 10 }, (_, index) => `puuid-${index + 1}`),
  },
  info: {
    frameInterval: 60_000,
    frames: [
      {
        timestamp: 900_000,
        participantFrames: Object.fromEntries(
          Array.from({ length: 10 }, (_, index) => {
            const participantId = index + 1;
            return [
              String(participantId),
              {
                participantId,
                currentGold: 700,
                totalGold: 5_000 + participantId * 100,
                level: 10,
                xp: 6_000 + participantId * 50,
                minionsKilled: 100 + participantId,
                jungleMinionsKilled: 0,
                position: { x: 7_000, y: 7_000 },
              },
            ];
          }),
        ),
        events: [
          { type: "ITEM_PURCHASED", timestamp: 850_000, participantId: 1, itemId: 3001 },
          { type: "CHAMPION_KILL", timestamp: 860_000, participantId: 1 },
        ],
      },
    ],
  },
});

describe("Riot transforms", () => {
  it("keeps client and public patch labels separate", () => {
    expect(normalizePatch("16.17.123.456")).toBe("16.17");
    expect(marketingPatch("16.17.1", new Date("2026-09-05T00:00:00Z"))).toBe(
      "26.17",
    );
  });

  it("filters queue, map, duration, and client patch", () => {
    expect(matchFilterReason(match, "16.17.1")).toBeNull();
    expect(
      matchFilterReason(
        { ...match, info: { ...match.info, queueId: 440 } },
        "16.17.1",
      ),
    ).toBe("wrong_queue");
  });

  it("creates five canonical role pairs and only item events", () => {
    const result = transformEligibleMatch(match, timeline, {
      runId: "3f06ad35-03e7-4505-b0aa-8b6077897c11",
      ingestedAt: new Date("2026-09-05T00:00:00Z"),
      marketingPatch: "26.17",
      ddragonVersion: "16.17.1",
    });

    expect(result.match.patch).toBe("26.17");
    expect(result.match.game_version).toBe("16.17.123.456");
    expect(result.participants).toHaveLength(10);
    expect(result.frames).toHaveLength(10);
    expect(result.rolePairs.map((pair) => pair.role)).toEqual(roles);
    expect(result.itemEvents).toHaveLength(1);
    expect(result.itemEvents[0]?.item_id).toBe(3001);
  });

  it("rejects a timeline for another match", () => {
    expect(() =>
      transformEligibleMatch(match, {
        ...timeline,
        metadata: { ...timeline.metadata, matchId: "EUW1_other" },
      }),
    ).toThrow(/does not belong/);
  });
});
