import { z } from "zod";

import type { ChampionRef, Interval95, Role } from "./types";

const OPGG_SOURCE = "OP.GG MCP" as const;

const observedRowSchema = z.object({
  ids: z.array(z.number().int().positive()),
  ids_names: z.array(z.union([z.string(), z.number()])),
  play: z.number().int().positive(),
  win: z.number().int().nonnegative(),
  pick_rate: z.number().finite().min(0).max(1).optional(),
}).passthrough();

const runeBuildSchema = z.object({
  id: z.number().int().positive(),
  primary_page_id: z.number().int().positive(),
  primary_page_name: z.string(),
  primary_rune_ids: z.array(z.number().int().positive()),
  primary_rune_names: z.array(z.string()),
  secondary_page_id: z.number().int().positive(),
  secondary_page_name: z.string(),
  secondary_rune_ids: z.array(z.number().int().positive()),
  secondary_rune_names: z.array(z.string()),
  stat_mod_ids: z.array(z.number().int().positive()),
  play: z.number().int().positive(),
  win: z.number().int().nonnegative(),
  pick_rate: z.number().finite().min(0).max(1).optional(),
}).passthrough();

const rawGuideSchema = z.object({
  data: z.object({
    summary: z.object({
      positions: z.array(z.object({
        name: z.string(),
        counters: z.array(z.object({
          champion_id: z.number().int().positive(),
          champion_name: z.string(),
          play: z.number().int().positive(),
          win: z.number().int().nonnegative(),
        }).passthrough()).optional().default([]),
      }).passthrough()).optional().default([]),
    }).passthrough(),
    summoner_spells: z.array(observedRowSchema).optional().default([]),
    core_items: z.array(observedRowSchema).optional().default([]),
    boots: z.array(observedRowSchema).optional().default([]),
    starter_items: z.array(observedRowSchema).optional().default([]),
    rune_pages: z.array(z.object({
      builds: z.array(runeBuildSchema).optional().default([]),
    }).passthrough()).optional().default([]),
  }).passthrough(),
}).passthrough();

export interface OpggObservedEvidence {
  sampleSize: number;
  wins: number;
  rawWinRate: number;
  frequency?: number;
  interval95: Interval95;
}

export interface OpggObservedSet extends OpggObservedEvidence {
  ids: readonly number[];
  names: readonly string[];
}

export interface OpggRuneOption extends OpggObservedEvidence {
  primaryStyleId: number;
  primaryStyleName: string;
  secondaryStyleId: number;
  secondaryStyleName: string;
  perkIds: readonly number[];
  perkNames: readonly string[];
  statShardIds: readonly number[];
}

export interface OpggCounterReference extends OpggObservedEvidence {
  champion: ChampionRef;
}

export interface OpggDraftGuide {
  source: typeof OPGG_SOURCE;
  fetchedAt: string;
  role: Role;
  champion: ChampionRef;
  opponent: ChampionRef;
  builds: readonly OpggObservedSet[];
  boots: readonly OpggObservedSet[];
  starters: readonly OpggObservedSet[];
  runes: readonly OpggRuneOption[];
  spells: readonly OpggObservedSet[];
  matchupCandidates: readonly OpggCounterReference[];
  evidenceNotice: string;
}

export interface OpggBanCandidate {
  champion: ChampionRef;
  score: number;
  matchupScore: number;
  metaScore: number;
  counterWinRate: number;
  adjustedCounterWinRate: number;
  matchupSampleSize: number;
  interval95: Interval95;
  metaRank: number;
  metaTier: number;
  metaWinRate: number;
  metaPickRate: number;
  metaBanRate: number;
  metaSampleSize: number;
  evidenceLabel: "strong" | "moderate" | "limited";
  personalAdjustment?: number;
  personalGames?: number;
  personalLossRate?: number;
}

export interface OpggBanAdvice {
  source: typeof OPGG_SOURCE;
  fetchedAt: string;
  dataPatch?: string;
  role: Role;
  champion: ChampionRef;
  candidates: readonly OpggBanCandidate[];
  evidenceNotice: string;
}

const specialChampionTokens: Record<string, string> = {
  "Bel'Veth": "BELVETH",
  "Cho'Gath": "CHOGATH",
  "Dr. Mundo": "DR_MUNDO",
  "Kai'Sa": "KAISA",
  "Kha'Zix": "KHAZIX",
  "Kog'Maw": "KOGMAW",
  "K'Sante": "KSANTE",
  LeBlanc: "LEBLANC",
  "Nunu & Willump": "NUNU",
  "Rek'Sai": "REKSAI",
  "Renata Glasc": "RENATA",
  "Vel'Koz": "VELKOZ",
};

export function championTokenForOpgg(name: string): string | null {
  const special = specialChampionTokens[name];
  if (special) return special;
  const token = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’\.]/g, "")
    .replace(/&/g, " AND ")
    .replace(/[^A-Za-z]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return token && token.length <= 40 ? token : null;
}

export function roleForOpgg(role: Role): "top" | "mid" | "jungle" | "adc" | "support" {
  return role.toLowerCase() as "top" | "mid" | "jungle" | "adc" | "support";
}

export function wilsonInterval(wins: number, games: number): Interval95 {
  if (games <= 0) return { low: 0, high: 1 };
  const z = 1.959963984540054;
  const rate = wins / games;
  const denominator = 1 + (z * z) / games;
  const center = (rate + (z * z) / (2 * games)) / denominator;
  const margin = z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * games)) / games) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

interface CompactMetaRow {
  champion: string;
  play: number;
  win: number;
  winRate: number;
  pickRate: number;
  banRate: number;
  tier: number;
  rank: number;
}

interface CompactCounterRow {
  championId: number;
  championName: string;
  play: number;
  myWins: number;
  myWinRate: number;
  counterWinRate: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function compactText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function decodedCompactString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function parseCompactMeta(value: unknown): CompactMetaRow[] {
  const text = compactText(value);
  const number = "(-?\\d+(?:\\.\\d+)?)";
  const row = new RegExp(`[A-Z][A-Za-z]*\\("((?:\\\\.|[^"\\\\])*)",${number},${number},${number},${number},${number},${number},${number}\\)`, "g");
  return [...text.matchAll(row)].map((match) => ({
    champion: decodedCompactString(match[1]!),
    play: Number(match[2]),
    win: Number(match[3]),
    winRate: Number(match[4]),
    pickRate: Number(match[5]),
    banRate: Number(match[6]),
    tier: Number(match[7]),
    rank: Number(match[8]),
  })).filter((entry) => entry.play > 0 && entry.rank > 0 && entry.tier > 0);
}

function parseCompactCounters(value: unknown): CompactCounterRow[] {
  const text = compactText(value);
  const number = "(-?\\d+(?:\\.\\d+)?)";
  const row = new RegExp(`WeakCounter\\((\\d+),"((?:\\\\.|[^"\\\\])*)",${number},${number},${number},${number},${number}\\)`, "g");
  return [...text.matchAll(row)].map((match) => ({
    championId: Number(match[1]),
    championName: decodedCompactString(match[2]!),
    play: Number(match[3]),
    myWins: Number(match[4]),
    myWinRate: Number(match[5]),
    counterWinRate: Number(match[6]),
  })).filter((entry) => entry.championId > 0 && entry.play > 0);
}

function normalizedChampionName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Combine matchup danger (60%) with current role-meta strength (40%). Matchup
 * rates are shrunk toward 50% when the head-to-head sample is small so a rare
 * matchup cannot outrank a well-supported threat on raw win rate alone.
 */
export function parseOpggBanAdvice(
  raw: unknown,
  context: { role: Role; champion: ChampionRef; dataPatch?: string; fetchedAt?: string },
): OpggBanAdvice | null {
  const envelope = record(raw);
  if (!envelope) return null;
  const meta = parseCompactMeta(envelope.meta);
  const counters = parseCompactCounters(envelope.analysis);
  if (meta.length === 0 || counters.length === 0) return null;

  const metaByName = new Map(meta.map((entry) => [normalizedChampionName(entry.champion), entry]));
  const maximumRank = Math.max(...meta.map((entry) => entry.rank), 1);
  const maximumPickRate = Math.max(...meta.map((entry) => entry.pickRate), 0.01);
  const maximumBanRate = Math.max(...meta.map((entry) => entry.banRate), 0.01);

  const candidates = counters.flatMap((counter): OpggBanCandidate[] => {
    const roleMeta = metaByName.get(normalizedChampionName(counter.championName));
    if (!roleMeta || counter.play < 100 || counter.counterWinRate <= 0.5) return [];

    const confidenceWeight = counter.play / (counter.play + 250);
    const adjustedCounterWinRate = 0.5 + (counter.counterWinRate - 0.5) * confidenceWeight;
    const matchupScore = clamp01((adjustedCounterWinRate - 0.5) / 0.08);
    const tierScore = clamp01((6 - roleMeta.tier) / 5);
    const rankScore = clamp01(1 - (roleMeta.rank - 1) / maximumRank);
    const winRateScore = clamp01((roleMeta.winRate - 0.45) / 0.1);
    const presenceScore = (
      Math.sqrt(clamp01(roleMeta.pickRate / maximumPickRate))
      + Math.sqrt(clamp01(roleMeta.banRate / maximumBanRate))
    ) / 2;
    const metaScore = 0.4 * tierScore + 0.25 * rankScore + 0.2 * winRateScore + 0.15 * presenceScore;
    const score = Math.round(100 * (0.6 * matchupScore + 0.4 * metaScore));
    const counterWins = Math.max(counter.play - counter.myWins, 0);

    return [{
      champion: { id: counter.championId, name: roleMeta.champion },
      score,
      matchupScore,
      metaScore,
      counterWinRate: counter.counterWinRate,
      adjustedCounterWinRate,
      matchupSampleSize: counter.play,
      interval95: wilsonInterval(counterWins, counter.play),
      metaRank: roleMeta.rank,
      metaTier: roleMeta.tier,
      metaWinRate: roleMeta.winRate,
      metaPickRate: roleMeta.pickRate,
      metaBanRate: roleMeta.banRate,
      metaSampleSize: roleMeta.play,
      evidenceLabel: counter.play >= 1_000 ? "strong" : counter.play >= 300 ? "moderate" : "limited",
    }];
  }).sort((left, right) => right.score - left.score || right.matchupSampleSize - left.matchupSampleSize);

  return {
    source: OPGG_SOURCE,
    fetchedAt: context.fetchedAt ?? new Date().toISOString(),
    ...(context.dataPatch ? { dataPatch: context.dataPatch } : {}),
    role: context.role,
    champion: context.champion,
    candidates: candidates.slice(0, 3),
    evidenceNotice:
      "OP.GG current global Ranked reference. Ban score is 60% sample-adjusted matchup danger and 40% role-meta strength. OP.GG does not expose the exact data patch, region, or unique-player concentration here.",
  };
}

function evidence(play: number, wins: number, frequency?: number): OpggObservedEvidence {
  const boundedWins = Math.min(Math.max(wins, 0), play);
  return {
    sampleSize: play,
    wins: boundedWins,
    rawWinRate: boundedWins / play,
    ...(frequency === undefined ? {} : { frequency }),
    interval95: wilsonInterval(boundedWins, play),
  };
}

function observedSet(row: z.infer<typeof observedRowSchema>): OpggObservedSet {
  return {
    ids: row.ids,
    names: row.ids_names.map(String),
    ...evidence(row.play, row.win, row.pick_rate),
  };
}

export function parseOpggDraftGuide(
  rawMatchup: unknown,
  rawOpponentView: unknown,
  context: { role: Role; champion: ChampionRef; opponent: ChampionRef; fetchedAt?: string },
): OpggDraftGuide | null {
  const matchup = rawGuideSchema.safeParse(rawMatchup);
  const opponentView = rawGuideSchema.safeParse(rawOpponentView);
  if (!matchup.success || !opponentView.success) return null;
  const data = matchup.data.data;
  const roleName = context.role === "ADC" ? "ADC" : context.role;
  const counters = opponentView.data.data.summary.positions
    .find((position) => position.name.toUpperCase() === roleName)?.counters ?? [];

  return {
    source: OPGG_SOURCE,
    fetchedAt: context.fetchedAt ?? new Date().toISOString(),
    role: context.role,
    champion: { ...context.champion },
    opponent: { ...context.opponent },
    builds: data.core_items.slice(0, 3).map(observedSet),
    boots: data.boots.slice(0, 3).map(observedSet),
    starters: data.starter_items.slice(0, 3).map(observedSet),
    runes: data.rune_pages
      .flatMap((page) => page.builds.slice(0, 1))
      .slice(0, 3)
      .map((row) => ({
        primaryStyleId: row.primary_page_id,
        primaryStyleName: row.primary_page_name,
        secondaryStyleId: row.secondary_page_id,
        secondaryStyleName: row.secondary_page_name,
        perkIds: [...row.primary_rune_ids, ...row.secondary_rune_ids],
        perkNames: [...row.primary_rune_names, ...row.secondary_rune_names],
        statShardIds: row.stat_mod_ids,
        ...evidence(row.play, row.win, row.pick_rate),
      })),
    spells: data.summoner_spells.slice(0, 3).map(observedSet),
    matchupCandidates: counters.slice(0, 3).map((row) => ({
      champion: { id: row.champion_id, name: row.champion_name },
      ...evidence(row.play, row.play - row.win),
    })),
    evidenceNotice:
      "OP.GG MCP global reference. The endpoint does not expose region, exact data patch, unique-player concentration, baseline adjustment, or 15-minute lane deltas.",
  };
}
