import type {
  RiotMatch,
  RiotParticipant,
  RiotParticipantFrame,
  RiotTimeline,
} from "./riot-schemas";

export const RANKED_SOLO_QUEUE_ID = 420;
export const SUMMONERS_RIFT_MAP_ID = 11;
export const MINIMUM_DURATION_SECONDS = 10 * 60;
export const FIFTEEN_MINUTES_MS = 15 * 60 * 1_000;

export const VALID_TEAM_POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type TeamPosition = (typeof VALID_TEAM_POSITIONS)[number];
export type AnalyticsRole = TeamPosition | "UNKNOWN";
export type RiotRegion = "EUW" | "EUNE";

const validPositionSet = new Set<string>(VALID_TEAM_POSITIONS);
const itemEventTypes = new Set(["ITEM_PURCHASED", "ITEM_SOLD", "ITEM_UNDO", "ITEM_DESTROYED"]);

export type MatchFilterReason = "wrong_queue" | "wrong_map" | "short_game" | "old_patch";

export interface MatchRow {
  match_id: string;
  run_id: string | null;
  region: RiotRegion;
  platform_region: string;
  regional_route: "EUROPE";
  queue_id: number;
  map_id: number;
  game_mode: string;
  game_type: string;
  game_version: string;
  ddragon_version: string | null;
  patch: string;
  game_creation: string;
  game_start: string;
  game_end: string;
  duration_seconds: number;
  data_version: string | null;
  winning_team_id: 100 | 200 | null;
  timeline_status: "pending" | "complete" | "unavailable" | "failed";
  raw_payload: RiotMatch;
  ingested_at: string;
  updated_at: string;
}

export interface MatchParticipantRow {
  match_id: string;
  participant_id: number;
  player_id: string | null;
  puuid: string;
  team_id: 100 | 200;
  champion_id: number;
  champion_name: string;
  team_position: string | null;
  individual_position: string | null;
  lane: string | null;
  role: AnalyticsRole;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_minions_killed: number;
  neutral_minions_killed: number;
  cs: number;
  gold_earned: number;
  champ_level: number;
  damage_to_champions: number;
  damage_taken: number;
  vision_score: number;
  wards_placed: number;
  wards_killed: number;
  control_wards_bought: number;
  summoner_spell_1_id: number | null;
  summoner_spell_2_id: number | null;
  final_item_ids: number[];
  perks: Record<string, unknown>;
  challenges: Record<string, unknown>;
  raw_payload: RiotParticipant;
}

export interface ParticipantFrameRow {
  match_id: string;
  participant_id: number;
  timestamp_ms: number;
  total_gold: number;
  current_gold: number;
  level: number;
  xp: number;
  minions_killed: number;
  jungle_minions_killed: number;
  position_x: number | null;
  position_y: number | null;
  damage_stats: Record<string, unknown>;
  raw_payload: RiotParticipantFrame;
}

export interface ItemEventRow {
  match_id: string;
  event_index: number;
  participant_id: number;
  timestamp_ms: number;
  event_type: "ITEM_PURCHASED" | "ITEM_SOLD" | "ITEM_UNDO" | "ITEM_DESTROYED";
  item_id: number | null;
  before_id: number | null;
  after_id: number | null;
  raw_payload: Record<string, unknown>;
}

export interface RolePairRow {
  match_id: string;
  role: TeamPosition;
  blue_participant_id: number;
  red_participant_id: number;
  pairing_method: "team_position";
  is_valid: true;
  quality_reason: null;
}

export interface SeenPlayerRow {
  puuid: string;
  region: RiotRegion;
  platform_region: string;
  game_name: string | null;
  tag_line: string | null;
  profile_icon_id: number | null;
  updated_at: string;
}

export interface TransformedMatch {
  match: MatchRow;
  players: SeenPlayerRow[];
  participants: MatchParticipantRow[];
  frames: ParticipantFrameRow[];
  itemEvents: ItemEventRow[];
  rolePairs: RolePairRow[];
}

export function normalizePatch(version: string): string {
  const [major, minor] = version.split(".");
  if (!major || !minor || !/^\d+$/.test(major) || !/^\d+$/.test(minor)) {
    throw new Error(`Could not determine patch from version "${version}"`);
  }
  return `${Number(major)}.${Number(minor)}`;
}

/**
 * Riot's game/realm version still uses the client major (for example 16.17.1),
 * while patch notes use the calendar-season label (26.17 in 2026). Eligibility
 * always compares game versions; this label is only for public analytics.
 */
export function marketingPatch(version: string, at = new Date()): string {
  const [, minor] = normalizePatch(version).split(".");
  return `${String(at.getUTCFullYear()).slice(-2)}.${minor}`;
}

export function normalizeGameDurationSeconds(duration: number): number {
  // Older Match-v5 payloads could return milliseconds when gameEndTimestamp was absent.
  return duration > 100_000 ? Math.round(duration / 1_000) : Math.round(duration);
}

export function normalizeTeamPosition(position: string | null | undefined): TeamPosition | null {
  const normalized = position?.toUpperCase() ?? "";
  return validPositionSet.has(normalized) ? (normalized as TeamPosition) : null;
}

export function platformToRegion(platform: string): RiotRegion {
  switch (platform.toUpperCase()) {
    case "EUW1":
      return "EUW";
    case "EUN1":
      return "EUNE";
    default:
      throw new Error(`Unsupported platform in match payload: ${platform}`);
  }
}

export function matchFilterReason(match: RiotMatch, currentPatch: string): MatchFilterReason | null {
  if (match.info.queueId !== RANKED_SOLO_QUEUE_ID) return "wrong_queue";
  if (match.info.mapId !== SUMMONERS_RIFT_MAP_ID) return "wrong_map";
  if (normalizeGameDurationSeconds(match.info.gameDuration) < MINIMUM_DURATION_SECONDS) {
    return "short_game";
  }
  if (normalizePatch(match.info.gameVersion) !== normalizePatch(currentPatch)) return "old_patch";
  return null;
}

export function findFrameAtFifteen(timeline: RiotTimeline) {
  return (
    timeline.info.frames
      .filter(
        (frame) =>
          frame.timestamp >= FIFTEEN_MINUTES_MS - 60_000 &&
          frame.timestamp <= FIFTEEN_MINUTES_MS + 60_000,
      )
      .sort(
        (left, right) =>
          Math.abs(left.timestamp - FIFTEEN_MINUTES_MS) -
          Math.abs(right.timestamp - FIFTEEN_MINUTES_MS),
      )[0] ?? null
  );
}

function finalItems(participant: RiotParticipant): number[] {
  return [
    participant.item0,
    participant.item1,
    participant.item2,
    participant.item3,
    participant.item4,
    participant.item5,
  ]
    .filter((itemId) => itemId > 0)
    .sort((left, right) => left - right);
}

function frameForParticipant(
  frame: ReturnType<typeof findFrameAtFifteen>,
  participantId: number,
): RiotParticipantFrame | undefined {
  return frame?.participantFrames[String(participantId)];
}

function buildParticipantRows(match: RiotMatch): MatchParticipantRow[] {
  return match.info.participants.map((participant) => {
    const teamPosition = normalizeTeamPosition(participant.teamPosition);
    return {
      match_id: match.metadata.matchId,
      participant_id: participant.participantId,
      player_id: null,
      puuid: participant.puuid,
      team_id: participant.teamId,
      champion_id: participant.championId,
      champion_name: participant.championName,
      team_position: participant.teamPosition ?? null,
      individual_position: participant.individualPosition ?? null,
      lane: participant.lane ?? null,
      role: teamPosition ?? "UNKNOWN",
      win: participant.win,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      total_minions_killed: participant.totalMinionsKilled,
      neutral_minions_killed: participant.neutralMinionsKilled,
      cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
      gold_earned: participant.goldEarned,
      champ_level: Math.max(1, participant.champLevel ?? 1),
      damage_to_champions: participant.totalDamageDealtToChampions,
      damage_taken: participant.totalDamageTaken,
      vision_score: participant.visionScore,
      wards_placed: participant.wardsPlaced,
      wards_killed: participant.wardsKilled,
      control_wards_bought: participant.visionWardsBoughtInGame,
      summoner_spell_1_id: participant.summoner1Id ?? null,
      summoner_spell_2_id: participant.summoner2Id ?? null,
      final_item_ids: finalItems(participant),
      perks: participant.perks ?? {},
      challenges: participant.challenges ?? {},
      raw_payload: participant,
    };
  });
}

function buildFrameRows(matchId: string, timeline: RiotTimeline): ParticipantFrameRow[] {
  const frame = findFrameAtFifteen(timeline);
  if (!frame) return [];

  return Object.values(frame.participantFrames).map((participantFrame) => ({
    match_id: matchId,
    participant_id: participantFrame.participantId,
    timestamp_ms: frame.timestamp,
    total_gold: participantFrame.totalGold,
    current_gold: participantFrame.currentGold,
    level: participantFrame.level,
    xp: participantFrame.xp,
    minions_killed: participantFrame.minionsKilled,
    jungle_minions_killed: participantFrame.jungleMinionsKilled,
    position_x: participantFrame.position?.x ?? null,
    position_y: participantFrame.position?.y ?? null,
    damage_stats: participantFrame.damageStats ?? {},
    raw_payload: participantFrame,
  }));
}

function buildItemEventRows(matchId: string, timeline: RiotTimeline): ItemEventRow[] {
  const events = timeline.info.frames
    .flatMap((frame, frameIndex) => frame.events.map((event, eventIndex) => ({ event, frameIndex, eventIndex })))
    .filter(
      ({ event }) =>
        itemEventTypes.has(event.type) &&
        event.participantId !== undefined &&
        event.participantId >= 1,
    )
    .sort(
      (left, right) =>
        left.event.timestamp - right.event.timestamp ||
        left.frameIndex - right.frameIndex ||
        left.eventIndex - right.eventIndex,
    );

  return events.map(({ event }, eventIndex) => ({
    match_id: matchId,
    event_index: eventIndex,
    participant_id: event.participantId!,
    timestamp_ms: event.timestamp,
    event_type: event.type as ItemEventRow["event_type"],
    item_id: event.itemId ?? null,
    before_id: event.beforeId ?? null,
    after_id: event.afterId ?? null,
    raw_payload: event,
  }));
}

function buildRolePairRows(match: RiotMatch, timeline: RiotTimeline): RolePairRow[] {
  const frame = findFrameAtFifteen(timeline);
  const pairs: RolePairRow[] = [];

  for (const role of VALID_TEAM_POSITIONS) {
    const blue = match.info.participants.filter(
      (participant) => participant.teamId === 100 && normalizeTeamPosition(participant.teamPosition) === role,
    );
    const red = match.info.participants.filter(
      (participant) => participant.teamId === 200 && normalizeTeamPosition(participant.teamPosition) === role,
    );

    // Do not manufacture lane opponents when Riot did not report one unambiguous
    // teamPosition on each team. The analytics layer only consumes valid pairs.
    if (blue.length !== 1 || red.length !== 1) continue;
    if (frame) {
      const hasBothFrames =
        frameForParticipant(frame, blue[0]!.participantId) &&
        frameForParticipant(frame, red[0]!.participantId);
      if (!hasBothFrames) continue;
    }

    pairs.push({
      match_id: match.metadata.matchId,
      role,
      blue_participant_id: blue[0]!.participantId,
      red_participant_id: red[0]!.participantId,
      pairing_method: "team_position",
      is_valid: true,
      quality_reason: null,
    });
  }

  return pairs;
}

export function transformEligibleMatch(
  match: RiotMatch,
  timeline: RiotTimeline,
  options: {
    runId?: string;
    ingestedAt?: Date;
    marketingPatch?: string;
    ddragonVersion?: string;
  } = {},
): TransformedMatch {
  if (timeline.metadata.matchId !== match.metadata.matchId) {
    throw new Error(
      `Timeline ${timeline.metadata.matchId} does not belong to match ${match.metadata.matchId}`,
    );
  }

  const durationSeconds = normalizeGameDurationSeconds(match.info.gameDuration);
  const participants = buildParticipantRows(match);
  const startedAtMs = match.info.gameStartTimestamp ?? match.info.gameCreation;
  const endedAtMs = match.info.gameEndTimestamp ?? startedAtMs + durationSeconds * 1_000;
  const ingestedAt = options.ingestedAt ?? new Date();
  const timestamp = ingestedAt.toISOString();
  const platform = match.info.platformId.toUpperCase();
  const region = platformToRegion(platform);
  const blueWon = match.info.participants.some(
    (participant) => participant.teamId === 100 && participant.win,
  );
  const redWon = match.info.participants.some(
    (participant) => participant.teamId === 200 && participant.win,
  );

  return {
    match: {
      match_id: match.metadata.matchId,
      run_id: options.runId ?? null,
      region,
      platform_region: platform,
      regional_route: "EUROPE",
      queue_id: match.info.queueId,
      map_id: match.info.mapId,
      game_mode: match.info.gameMode,
      game_type: match.info.gameType ?? "MATCHED_GAME",
      game_version: match.info.gameVersion,
      ddragon_version: options.ddragonVersion ?? null,
      patch: options.marketingPatch ?? marketingPatch(match.info.gameVersion, ingestedAt),
      game_creation: new Date(match.info.gameCreation).toISOString(),
      game_start: new Date(startedAtMs).toISOString(),
      game_end: new Date(endedAtMs).toISOString(),
      duration_seconds: durationSeconds,
      data_version: match.metadata.dataVersion ?? null,
      winning_team_id: blueWon ? 100 : redWon ? 200 : null,
      timeline_status: "pending",
      raw_payload: match,
      ingested_at: timestamp,
      updated_at: timestamp,
    },
    players: match.info.participants.map((participant) => ({
      puuid: participant.puuid,
      region,
      platform_region: platform,
      game_name: participant.riotIdGameName ?? participant.summonerName ?? null,
      tag_line: participant.riotIdTagline ?? null,
      profile_icon_id: participant.profileIcon ?? null,
      updated_at: timestamp,
    })),
    participants,
    frames: buildFrameRows(match.metadata.matchId, timeline),
    itemEvents: buildItemEventRows(match.metadata.matchId, timeline),
    rolePairs: buildRolePairRows(match, timeline),
  };
}
