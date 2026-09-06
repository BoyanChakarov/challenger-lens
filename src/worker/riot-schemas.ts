import { z } from "zod";

const nonEmptyString = z.string().min(1);
const nonNegativeInteger = z.number().int().nonnegative();

export const challengerEntrySchema = z
  .object({
    puuid: nonEmptyString.optional(),
    summonerId: nonEmptyString.optional(),
    leaguePoints: nonNegativeInteger,
    rank: nonEmptyString,
    wins: nonNegativeInteger,
    losses: nonNegativeInteger,
    veteran: z.boolean().default(false),
    inactive: z.boolean().default(false),
    freshBlood: z.boolean().default(false),
    hotStreak: z.boolean().default(false),
  })
  .refine((entry) => Boolean(entry.puuid || entry.summonerId), {
    message: "A Challenger entry must contain a PUUID or summoner ID",
  });

export const challengerLeagueSchema = z.object({
  leagueId: nonEmptyString,
  queue: z.literal("RANKED_SOLO_5x5"),
  tier: z.literal("CHALLENGER"),
  name: z.string(),
  entries: z.array(challengerEntrySchema),
});

export const summonerSchema = z.object({
  puuid: nonEmptyString,
  id: nonEmptyString.optional(),
  accountId: nonEmptyString.optional(),
  profileIconId: nonNegativeInteger.optional(),
  revisionDate: nonNegativeInteger.optional(),
  summonerLevel: nonNegativeInteger.optional(),
});

export const realmSchema = z.object({
  v: z.string().regex(/^\d+\.\d+\.\d+$/),
});

const participantSchema = z
  .object({
  participantId: z.number().int().min(1).max(10),
  puuid: nonEmptyString,
  teamId: z.union([z.literal(100), z.literal(200)]),
  championId: nonNegativeInteger,
  championName: nonEmptyString,
  teamPosition: z.string().nullish(),
  individualPosition: z.string().nullish(),
  lane: z.string().nullish(),
  role: z.string().nullish(),
  win: z.boolean(),
  kills: nonNegativeInteger,
  deaths: nonNegativeInteger,
  assists: nonNegativeInteger,
  totalMinionsKilled: nonNegativeInteger,
  neutralMinionsKilled: nonNegativeInteger,
  goldEarned: nonNegativeInteger,
  totalDamageDealtToChampions: nonNegativeInteger,
  totalDamageTaken: nonNegativeInteger.default(0),
  visionScore: nonNegativeInteger,
  wardsPlaced: nonNegativeInteger.default(0),
  wardsKilled: nonNegativeInteger.default(0),
  detectorWardsPlaced: nonNegativeInteger.default(0),
  visionWardsBoughtInGame: nonNegativeInteger.default(0),
  summoner1Id: nonNegativeInteger.optional(),
  summoner2Id: nonNegativeInteger.optional(),
  summonerName: z.string().nullish(),
  riotIdGameName: z.string().nullish(),
  riotIdTagline: z.string().nullish(),
  profileIcon: nonNegativeInteger.optional(),
  champLevel: nonNegativeInteger.optional(),
  item0: nonNegativeInteger.default(0),
  item1: nonNegativeInteger.default(0),
  item2: nonNegativeInteger.default(0),
  item3: nonNegativeInteger.default(0),
  item4: nonNegativeInteger.default(0),
  item5: nonNegativeInteger.default(0),
  item6: nonNegativeInteger.default(0),
  perks: z.record(z.string(), z.unknown()).optional(),
  challenges: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const matchSchema = z.object({
  metadata: z.object({
    dataVersion: z.string().optional(),
    matchId: nonEmptyString,
    participants: z.array(nonEmptyString).length(10),
  }),
  info: z.object({
    gameCreation: nonNegativeInteger,
    gameDuration: nonNegativeInteger,
    gameEndTimestamp: nonNegativeInteger.optional(),
    gameId: nonNegativeInteger.optional(),
    gameMode: z.string(),
    gameName: z.string().optional(),
    gameStartTimestamp: nonNegativeInteger.optional(),
    gameType: z.string().optional(),
    gameVersion: nonEmptyString,
    mapId: nonNegativeInteger,
    platformId: nonEmptyString,
    queueId: nonNegativeInteger,
    tournamentCode: z.string().optional(),
    participants: z.array(participantSchema).length(10),
  }),
});

const participantFrameSchema = z.object({
  participantId: z.number().int().min(1).max(10),
  currentGold: nonNegativeInteger,
  totalGold: nonNegativeInteger,
  level: nonNegativeInteger,
  xp: nonNegativeInteger,
  minionsKilled: nonNegativeInteger,
  jungleMinionsKilled: nonNegativeInteger,
  position: z
    .object({ x: z.number(), y: z.number() })
    .optional(),
  damageStats: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const timelineEventSchema = z
  .object({
    type: nonEmptyString,
    timestamp: nonNegativeInteger,
    participantId: z.number().int().min(1).max(10).optional(),
    itemId: nonNegativeInteger.optional(),
    beforeId: nonNegativeInteger.optional(),
    afterId: nonNegativeInteger.optional(),
  })
  .passthrough();

export const timelineSchema = z.object({
  metadata: z.object({
    dataVersion: z.string().optional(),
    matchId: nonEmptyString,
    participants: z.array(nonEmptyString).length(10),
  }),
  info: z.object({
    frameInterval: nonNegativeInteger,
    frames: z.array(
      z.object({
        timestamp: nonNegativeInteger,
        participantFrames: z.record(z.string(), participantFrameSchema),
        events: z.array(timelineEventSchema),
      }),
    ),
  }),
});

export type ChallengerLeague = z.infer<typeof challengerLeagueSchema>;
export type ChallengerEntry = z.infer<typeof challengerEntrySchema>;
export type RiotMatch = z.infer<typeof matchSchema>;
export type RiotParticipant = RiotMatch["info"]["participants"][number];
export type RiotTimeline = z.infer<typeof timelineSchema>;
export type RiotTimelineEvent = RiotTimeline["info"]["frames"][number]["events"][number];
export type RiotParticipantFrame = RiotTimeline["info"]["frames"][number]["participantFrames"][string];
