import type { LocalPlayerProfileSeed } from "./bridge";
import type { OpggBanAdvice } from "./opgg-client";
import type { ChampionRef, Role } from "./types";

export interface PlayerProfileConfig {
  gameName: string;
  tagLine: string;
  region: string;
}

export interface PlayerRank {
  tier: string;
  division?: number;
  lp?: number;
  wins: number;
  losses: number;
}

export interface PlayerChampionPerformance {
  champion: ChampionRef;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface PlayerMastery {
  championId: number;
  level: number;
  points: number;
  highestGrade?: string;
  lastPlayedAt?: string;
}

export interface PlayerRecentMatch {
  playedAt: string;
  queue: string;
  role?: Role;
  champion: ChampionRef;
  opponent?: ChampionRef;
  result: "win" | "loss" | "unknown";
  kills: number;
  deaths: number;
  assists: number;
}

export interface PlayerMatchupStat {
  championId: number;
  opponent: ChampionRef;
  role: Role;
  games: number;
  wins: number;
  losses: number;
}

export interface PlayerProfile {
  config: PlayerProfileConfig;
  summonerLevel: number;
  rank?: PlayerRank;
  champions: readonly PlayerChampionPerformance[];
  masteries: readonly PlayerMastery[];
  recentMatches: readonly PlayerRecentMatch[];
  matchups: readonly PlayerMatchupStat[];
  refreshedAt: string;
  sourceUpdatedAt?: string;
}

export interface ParsedRecentMatch extends PlayerRecentMatch {
  gameId: string;
}

export interface ParsedPlayerProfile {
  profile: PlayerProfile;
  pendingMatches: readonly ParsedRecentMatch[];
}

const numeric = "-?\\d+(?:\\.\\d+)?";
const quoted = '"((?:\\\\.|[^"\\\\])*)"';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function textPart(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function decoded(value: string): string {
  try { return JSON.parse(`"${value}"`) as string; } catch { return value; }
}

function nullableNumber(value: string | undefined): number | undefined {
  if (!value || value === "null") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRole(value: string): Role | undefined {
  switch (value.toUpperCase()) {
    case "TOP": return "TOP";
    case "JUNGLE": return "JUNGLE";
    case "MID": case "MIDDLE": return "MID";
    case "ADC": case "BOTTOM": case "BOT": return "ADC";
    case "SUPPORT": case "UTILITY": return "SUPPORT";
    default: return undefined;
  }
}

function parseRank(profileText: string): PlayerRank | undefined {
  const pattern = new RegExp(`LeagueStat\\("SOLORANKED",TierInfo\\(("[^"]*"|null),(\\d+|null),(\\d+|null),(\\d+|null)\\),(\\d+|null),(\\d+|null)\\)`);
  const match = profileText.match(pattern);
  if (!match) return undefined;
  const tier = match[1] === "null" ? "UNRANKED" : match[1]!.slice(1, -1);
  return {
    tier,
    ...(nullableNumber(match[2]) !== undefined ? { division: nullableNumber(match[2]) } : {}),
    ...(nullableNumber(match[3]) !== undefined ? { lp: nullableNumber(match[3]) } : {}),
    wins: nullableNumber(match[5]) ?? 0,
    losses: nullableNumber(match[6]) ?? 0,
  };
}

function parseChampionPerformance(profileText: string): PlayerChampionPerformance[] {
  const pattern = new RegExp(`MyChampionStat\\((\\d+),(\\d+),(\\d+),(\\d+),${quoted}\\)`, "g");
  return [...profileText.matchAll(pattern)].map((match) => {
    const games = Number(match[2]);
    const wins = Number(match[3]);
    return {
      champion: { id: Number(match[1]), name: decoded(match[5]!) },
      games,
      wins,
      losses: Number(match[4]),
      winRate: games > 0 ? wins / games : 0,
    };
  }).filter((entry) => entry.champion.id > 0 && entry.games > 0);
}

function parseRecentMatches(matchesText: string): ParsedRecentMatch[] {
  const pattern = new RegExp(`GameHistory\\(${quoted},${quoted},${quoted},\\[Participant\\((\\d+),${quoted},${quoted},Stats\\((${numeric}),(${numeric}),(${numeric}),${quoted}\\)\\)\\]\\)`, "g");
  return [...matchesText.matchAll(pattern)].map((match) => ({
    gameId: decoded(match[1]!),
    playedAt: decoded(match[2]!),
    queue: decoded(match[3]!),
    champion: { id: Number(match[4]), name: decoded(match[5]!) },
    ...(normalizeRole(decoded(match[6]!)) ? { role: normalizeRole(decoded(match[6]!)) } : {}),
    kills: Number(match[7]),
    deaths: Number(match[8]),
    assists: Number(match[9]),
    result: decoded(match[10]!).toUpperCase() === "WIN"
      ? "win" as const
      : decoded(match[10]!).toUpperCase() === "LOSE"
        ? "loss" as const
        : "unknown" as const,
  })).filter((entry) => entry.gameId && entry.champion.id > 0);
}

function masteryRows(local: LocalPlayerProfileSeed): PlayerMastery[] {
  return local.masteries
    .filter((entry) => entry.championId > 0 && entry.championPoints >= 0)
    .map((entry) => ({
      championId: entry.championId,
      level: entry.championLevel,
      points: entry.championPoints,
      ...(entry.highestGrade ? { highestGrade: entry.highestGrade } : {}),
      ...(entry.lastPlayTime > 0 ? { lastPlayedAt: new Date(entry.lastPlayTime).toISOString() } : {}),
    }))
    .sort((left, right) => right.points - left.points);
}

export function parseOpggPlayerProfile(
  raw: unknown,
  config: PlayerProfileConfig,
  local: LocalPlayerProfileSeed,
  now = new Date(),
): ParsedPlayerProfile | null {
  const envelope = record(raw);
  if (!envelope) return null;
  const profileText = textPart(envelope.profile);
  const matchesText = textPart(envelope.matches);
  const champions = parseChampionPerformance(profileText);
  if (!profileText || champions.length === 0) return null;
  const pendingMatches = parseRecentMatches(matchesText);
  const updatedAt = profileText.match(/"(\d{4}-\d{2}-\d{2}T[^" ]+)"/)?.[1];
  return {
    profile: {
      config,
      summonerLevel: local.summonerLevel,
      ...(parseRank(profileText) ? { rank: parseRank(profileText) } : {}),
      champions,
      masteries: masteryRows(local),
      recentMatches: pendingMatches.map(({ gameId: _gameId, ...match }) => match),
      matchups: [],
      refreshedAt: now.toISOString(),
      ...(updatedAt ? { sourceUpdatedAt: updatedAt } : {}),
    },
    pendingMatches,
  };
}

interface DetailParticipant {
  champion: ChampionRef;
  team: string;
  role?: Role;
}

function detailParticipants(value: unknown): DetailParticipant[] {
  const text = textPart(value);
  const pattern = new RegExp(`Participant\\((?:true|false),(\\d+),${quoted},${quoted},${quoted},Stats\\(`, "g");
  return [...text.matchAll(pattern)].map((match) => ({
    champion: { id: Number(match[1]), name: decoded(match[2]!) },
    team: decoded(match[3]!),
    ...(normalizeRole(decoded(match[4]!)) ? { role: normalizeRole(decoded(match[4]!)) } : {}),
  }));
}

export function attachMatchupDetails(
  parsed: ParsedPlayerProfile,
  details: readonly unknown[],
): PlayerProfile {
  const recentMatches = parsed.pendingMatches.map((match, index): PlayerRecentMatch => {
    const participants = detailParticipants(details[index]);
    const player = participants.find((entry) => entry.champion.id === match.champion.id && entry.role === match.role);
    const opponent = player
      ? participants.find((entry) => entry.team !== player.team && entry.role === player.role)?.champion
      : undefined;
    const { gameId: _gameId, ...visible } = match;
    return { ...visible, ...(opponent ? { opponent } : {}) };
  });

  const matchupMap = new Map<string, PlayerMatchupStat>();
  for (const match of recentMatches) {
    if (match.queue !== "SOLORANKED" || !match.role || !match.opponent || match.result === "unknown") continue;
    const key = `${match.champion.id}:${match.role}:${match.opponent.id}`;
    const current = matchupMap.get(key) ?? {
      championId: match.champion.id,
      opponent: match.opponent,
      role: match.role,
      games: 0,
      wins: 0,
      losses: 0,
    };
    current.games += 1;
    current.wins += match.result === "win" ? 1 : 0;
    current.losses += match.result === "loss" ? 1 : 0;
    matchupMap.set(key, current);
  }

  return {
    ...parsed.profile,
    recentMatches,
    matchups: [...matchupMap.values()].sort((left, right) => right.losses - left.losses || right.games - left.games),
  };
}

/** Personal history may add at most eight points to the aggregate 100-point ban score. */
export function personalizeBanAdvice(
  advice: OpggBanAdvice | undefined,
  profile: PlayerProfile | undefined,
): OpggBanAdvice | undefined {
  if (!advice || !profile) return advice;
  const candidates = advice.candidates.map((candidate) => {
    const personal = profile.matchups.find((entry) =>
      entry.championId === advice.champion.id
      && entry.role === advice.role
      && entry.opponent.id === candidate.champion.id,
    );
    if (!personal || personal.games === 0) return candidate;
    const lossRate = personal.losses / personal.games;
    const support = personal.games / (personal.games + 5);
    const personalSignal = Math.max(0, Math.min((lossRate - 0.5) * 2, 1));
    const personalAdjustment = Math.round(8 * support * personalSignal);
    return {
      ...candidate,
      score: Math.min(candidate.score + personalAdjustment, 100),
      personalAdjustment,
      personalGames: personal.games,
      personalLossRate: lossRate,
    };
  }).sort((left, right) => right.score - left.score || right.matchupSampleSize - left.matchupSampleSize);
  return { ...advice, candidates };
}
