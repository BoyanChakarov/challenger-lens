import { z } from "zod";

import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  loadDataDragonCatalog,
  readCachedDataDragonCatalog,
  type DataDragonCatalog,
} from "./dataDragon";
import {
  freezeRecommendationBundle,
  selectCounterCandidates,
} from "./selectors";
import type {
  BuildPath,
  ChampionRef,
  CounterCandidate,
  CounterInsufficiencyReason,
  EvidenceMetrics,
  FrozenRecommendationBundle,
  ItemRef,
  RecommendationBundle,
  Region,
  Role,
  RuneRecommendation,
  SpellPairRecommendation,
} from "./types";

export const COMPANION_RECOMMENDATIONS_RPC =
  "get_companion_recommendations_v1" as const;

const CACHE_VERSION = 1 as const;
const CACHE_PREFIX = "challenger-lens:companion-recommendations:v1";
const PATCH_PATTERN = /^\d+\.\d+$/;

const DB_ROLE_BY_UI_ROLE = {
  TOP: "TOP",
  JUNGLE: "JUNGLE",
  MID: "MIDDLE",
  ADC: "BOTTOM",
  SUPPORT: "UTILITY",
} as const satisfies Record<Role, DatabaseRole>;

export type DatabaseRole =
  | "TOP"
  | "JUNGLE"
  | "MIDDLE"
  | "BOTTOM"
  | "UTILITY";

export type RecommendationRpcStatus =
  | "ready"
  | "insufficient"
  | "stale"
  | "unsupported";

export interface RecommendationRequest {
  patch: string;
  region: Region;
  queueId: number;
  mapId: number;
  role: Role;
  localChampionId?: number;
  localChampionName?: string;
  opponentChampionId: number;
  opponentChampionName?: string;
}

interface NormalizedRequest {
  patch: string;
  region: Region;
  queueId: 420;
  mapId: 11;
  role: Role;
  databaseRole: DatabaseRole;
  localChampionId: number | null;
  localChampionName?: string;
  opponentChampionId: number;
  opponentChampionName?: string;
}

export interface RecommendationRpcParams {
  p_patch: string;
  p_region: Region;
  p_queue_id: 420;
  p_map_id: 11;
  p_role: DatabaseRole;
  p_champion_id: number | null;
  p_opponent_champion_id: number;
}

export interface RecommendationRpcError {
  message: string;
}

export interface RecommendationRpcInvocation {
  data: unknown;
  error: RecommendationRpcError | null;
}

export type RecommendationRpcInvoker = (
  params: RecommendationRpcParams,
) => Promise<RecommendationRpcInvocation>;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RecommendationDatasetMetadata {
  dataPatch: string;
  dataDragonVersion?: string;
  status: "collecting" | "ready" | "stale" | "error";
  refreshedAt?: string;
  lastIngestionAt?: string;
  matchCount: number;
  trackedPlayerCount: number;
  qualityNote?: string;
}

export type RecommendationStaleReason =
  | "backend_marked_stale"
  | "backend_unavailable"
  | "invalid_backend_response"
  | "backend_unconfigured";

export interface RecommendationClientSuccess {
  ok: true;
  bundle: FrozenRecommendationBundle;
  source: "network" | "cache";
  stale: boolean;
  staleReason?: RecommendationStaleReason;
  cacheAgeMs?: number;
  rpcStatus: RecommendationRpcStatus;
  reasonCodes: readonly string[];
  warnings: readonly string[];
  dataset?: RecommendationDatasetMetadata;
}

export interface RecommendationClientFailure {
  ok: false;
  reason:
    | "invalid_context"
    | "backend_unconfigured"
    | "backend_unavailable"
    | "invalid_backend_response";
  message: string;
}

export type RecommendationClientResult =
  | RecommendationClientSuccess
  | RecommendationClientFailure;

export interface RecommendationClientOptions {
  invokeRpc?: RecommendationRpcInvoker;
  storage?: StorageLike | null;
  now?: () => Date;
  catalog?: DataDragonCatalog;
}

const rateSchema = z.number().finite().min(0).max(1);
const finiteSchema = z.number().finite();
const positiveIdSchema = z.number().int().positive();
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const evidenceLabelSchema = z.enum([
  "strong",
  "moderate",
  "limited",
  "insufficient",
]);
const isoTimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Expected an ISO-compatible timestamp",
);

const intervalSchema = z
  .object({
    low: rateSchema,
    high: rateSchema,
    metric: z.literal("rawWinRate"),
  })
  .strict()
  .refine((value) => value.low <= value.high, {
    message: "The uncertainty interval must be ordered",
  });

const evidenceSchema = z
  .object({
    sampleSize: z.number().int().positive(),
    uniquePlayers: z.number().int().positive(),
    rawWinRate: rateSchema,
    adjustedWinRate: rateSchema,
    baselineWinRate: rateSchema,
    adjustedLift: finiteSchema.min(-1).max(1),
    interval95: intervalSchema,
    topPlayerShare: rateSchema,
    playerConcentrationHhi: rateSchema,
    deltas15: z
      .object({
        gold: finiteSchema,
        cs: finiteSchema,
        xp: finiteSchema,
      })
      .strict(),
    earlyGameSampleSize: nonNegativeIntegerSchema,
    frequency: rateSchema.optional(),
    label: evidenceLabelSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.uniquePlayers > value.sampleSize) {
      context.addIssue({
        code: "custom",
        message: "Unique players cannot exceed the sample size",
      });
    }
    if (
      value.rawWinRate < value.interval95.low ||
      value.rawWinRate > value.interval95.high
    ) {
      context.addIssue({
        code: "custom",
        message: "The raw win rate must fall inside its 95% interval",
      });
    }
    const statedLift = value.adjustedWinRate - value.baselineWinRate;
    if (Math.abs(statedLift - value.adjustedLift) > 0.000_01) {
      context.addIssue({
        code: "custom",
        message: "Adjusted lift does not match the supplied rates",
      });
    }
  });

const matchupSchema = z
  .object({
    championId: positiveIdSchema,
    championName: z.string().trim().min(1),
    opponentChampionId: positiveIdSchema,
    opponentChampionName: z.string().trim().min(1),
    evidence: evidenceSchema,
  })
  .strict();

const counterCandidateSchema = matchupSchema;

const runePageSchema = z
  .object({
    runePageKey: z.string().trim().min(1),
    primaryStyleId: positiveIdSchema,
    secondaryStyleId: positiveIdSchema,
    perkIds: z.array(positiveIdSchema).min(1).max(20),
    statPerkIds: z.array(positiveIdSchema).max(10),
    evidence: evidenceSchema,
  })
  .strict();

const spellSetSchema = z
  .object({
    spellPairKey: z.string().trim().min(1),
    spellIds: z.tuple([positiveIdSchema, positiveIdSchema]),
    evidence: evidenceSchema,
  })
  .strict();

const itemPathSchema = z
  .object({
    pathKey: z.string().trim().min(1),
    startingItemIds: z.array(positiveIdSchema).max(12),
    firstItemId: positiveIdSchema.nullable(),
    bootsItemId: positiveIdSchema.nullable(),
    coreItemIds: z.array(positiveIdSchema).min(1).max(12),
    purchaseSequence: z.array(positiveIdSchema).max(30),
    stageQuality: z.enum(["retained_item_proxy", "metadata_enriched"]),
    evidence: evidenceSchema,
    biasWarning: z.string().trim().min(1),
  })
  .strict();

const contextSchema = z
  .object({
    patch: z.string().regex(PATCH_PATTERN),
    region: z.enum(["EUW", "EUNE"]),
    queueId: z.literal(420),
    mapId: z.literal(11),
    cohort: z.literal("CHALLENGER"),
    role: z.enum(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]),
    championId: positiveIdSchema.nullable(),
    opponentChampionId: positiveIdSchema,
  })
  .strict();

const datasetSchema = z
  .object({
    dataPatch: z.string().regex(PATCH_PATTERN),
    dataDragonVersion: z.string().trim().min(1).nullable(),
    status: z.enum(["collecting", "ready", "stale", "error"]),
    provenance: z.literal("live"),
    refreshedAt: isoTimestampSchema.nullable(),
    lastIngestionAt: isoTimestampSchema.nullable(),
    matchCount: nonNegativeIntegerSchema,
    trackedPlayerCount: nonNegativeIntegerSchema,
    qualityNote: z.string().trim().min(1).nullable(),
  })
  .strict();

const rpcResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(["ready", "insufficient", "stale", "unsupported"]),
    reasonCodes: z.array(z.string().trim().min(1)).max(30),
    context: contextSchema,
    dataset: datasetSchema.nullable(),
    matchup: matchupSchema.nullable(),
    counterCandidates: z.array(counterCandidateSchema).max(3),
    runePages: z.array(runePageSchema).max(3),
    summonerSpellSets: z.array(spellSetSchema).max(3),
    itemPaths: z.array(itemPathSchema).max(3),
    warnings: z.array(z.string().trim().min(1)).max(20),
  })
  .strict();

type RpcResponse = z.infer<typeof rpcResponseSchema>;
type RpcEvidence = z.infer<typeof evidenceSchema>;

const cachedEnvelopeSchema = z
  .object({
    cacheVersion: z.literal(CACHE_VERSION),
    cachedAt: isoTimestampSchema,
    context: contextSchema,
    payload: rpcResponseSchema,
  })
  .strict();

type CachedEnvelope = z.infer<typeof cachedEnvelopeSchema>;

export function toDatabaseRole(role: Role): DatabaseRole {
  return DB_ROLE_BY_UI_ROLE[role];
}

function normalizeName(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeRequest(
  request: RecommendationRequest,
): NormalizedRequest | null {
  if (
    !PATCH_PATTERN.test(request.patch) ||
    (request.region !== "EUW" && request.region !== "EUNE") ||
    request.queueId !== 420 ||
    request.mapId !== 11 ||
    !(request.role in DB_ROLE_BY_UI_ROLE) ||
    !Number.isInteger(request.opponentChampionId) ||
    request.opponentChampionId <= 0 ||
    (request.localChampionId !== undefined &&
      (!Number.isInteger(request.localChampionId) ||
        request.localChampionId <= 0 ||
        request.localChampionId === request.opponentChampionId))
  ) {
    return null;
  }

  return {
    patch: request.patch,
    region: request.region,
    queueId: 420,
    mapId: 11,
    role: request.role,
    databaseRole: toDatabaseRole(request.role),
    localChampionId: request.localChampionId ?? null,
    ...(normalizeName(request.localChampionName) === undefined
      ? {}
      : { localChampionName: normalizeName(request.localChampionName) }),
    opponentChampionId: request.opponentChampionId,
    ...(normalizeName(request.opponentChampionName) === undefined
      ? {}
      : { opponentChampionName: normalizeName(request.opponentChampionName) }),
  };
}

function rpcParams(request: NormalizedRequest): RecommendationRpcParams {
  return {
    p_patch: request.patch,
    p_region: request.region,
    p_queue_id: request.queueId,
    p_map_id: request.mapId,
    p_role: request.databaseRole,
    p_champion_id: request.localChampionId,
    p_opponent_champion_id: request.opponentChampionId,
  };
}

function contextForCache(request: NormalizedRequest): RpcResponse["context"] {
  return {
    patch: request.patch,
    region: request.region,
    queueId: request.queueId,
    mapId: request.mapId,
    cohort: "CHALLENGER",
    role: request.databaseRole,
    championId: request.localChampionId,
    opponentChampionId: request.opponentChampionId,
  };
}

function contextsMatch(
  left: RpcResponse["context"],
  right: RpcResponse["context"],
): boolean {
  return (
    left.patch === right.patch &&
    left.region === right.region &&
    left.queueId === right.queueId &&
    left.mapId === right.mapId &&
    left.cohort === right.cohort &&
    left.role === right.role &&
    left.championId === right.championId &&
    left.opponentChampionId === right.opponentChampionId
  );
}

export function recommendationCacheKey(
  request: RecommendationRequest,
): string | null {
  const normalized = normalizeRequest(request);
  if (!normalized) return null;
  return normalizedRecommendationCacheKey(normalized);
}

function normalizedRecommendationCacheKey(
  normalized: NormalizedRequest,
): string {
  const champion = normalized.localChampionId ?? "unselected";
  return [
    CACHE_PREFIX,
    normalized.patch,
    normalized.region,
    normalized.queueId,
    normalized.mapId,
    normalized.databaseRole,
    champion,
    normalized.opponentChampionId,
  ].join(":");
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? null
      : globalThis.localStorage;
  } catch {
    return null;
  }
}

const defaultRpcInvoker: RecommendationRpcInvoker = async (params) => {
  if (!supabase) {
    return {
      data: null,
      error: { message: "The recommendation backend is not configured." },
    };
  }

  const { data, error } = await supabase.rpc(
    COMPANION_RECOMMENDATIONS_RPC,
    params,
  );
  return {
    data,
    error: error ? { message: error.message } : null,
  };
};

function mapEvidence(evidence: RpcEvidence): EvidenceMetrics {
  return {
    rawWinRate: evidence.rawWinRate,
    adjustedWinRate: evidence.adjustedWinRate,
    baselineWinRate: evidence.baselineWinRate,
    interval95: {
      low: evidence.interval95.low,
      high: evidence.interval95.high,
    },
    sampleSize: evidence.sampleSize,
    uniquePlayers: evidence.uniquePlayers,
    topPlayerShare: evidence.topPlayerShare,
    playerConcentrationHhi: evidence.playerConcentrationHhi,
    deltas15: { ...evidence.deltas15 },
    earlyGameSampleSize: evidence.earlyGameSampleSize,
    ...(evidence.frequency === undefined
      ? {}
      : { frequency: evidence.frequency }),
    label: evidence.label,
  };
}

const percentage = (value: number): string => `${(value * 100).toFixed(1)}%`;

function evidenceExplanation(evidence: RpcEvidence): string {
  return [
    `${evidence.sampleSize.toLocaleString()} games from ${evidence.uniquePlayers.toLocaleString()} unique players`,
    `${percentage(evidence.adjustedWinRate)} adjusted win rate versus ${percentage(evidence.baselineWinRate)} baseline`,
    `${percentage(evidence.interval95.low)}–${percentage(evidence.interval95.high)} 95% raw win-rate interval`,
    `${percentage(evidence.topPlayerShare)} top-player share and ${evidence.playerConcentrationHhi.toFixed(3)} player-concentration HHI`,
    `at 15 minutes: ${evidence.deltas15.gold >= 0 ? "+" : ""}${Math.round(evidence.deltas15.gold)} gold, ${evidence.deltas15.cs >= 0 ? "+" : ""}${evidence.deltas15.cs.toFixed(1)} CS, ${evidence.deltas15.xp >= 0 ? "+" : ""}${Math.round(evidence.deltas15.xp)} XP (${evidence.earlyGameSampleSize.toLocaleString()} games)`,
  ].join("; ");
}

function champion(
  id: number,
  suppliedName?: string,
  catalog?: DataDragonCatalog,
): ChampionRef {
  return {
    id,
    name: normalizeName(suppliedName) ?? catalog?.championNames[id] ?? `Champion ${id}`,
  };
}

function item(id: number, catalog?: DataDragonCatalog): ItemRef {
  return { id, name: catalog?.itemData[id]?.name ?? `Item ${id}` };
}

function matchupOpponentName(
  response: RpcResponse,
  request: NormalizedRequest,
): string | undefined {
  if (
    response.matchup?.opponentChampionId === request.opponentChampionId
  ) {
    return response.matchup.opponentChampionName;
  }
  return response.counterCandidates.find(
    (candidate) =>
      candidate.opponentChampionId === request.opponentChampionId,
  )?.opponentChampionName;
}

function matchupLocalName(
  response: RpcResponse,
  request: NormalizedRequest,
): string | undefined {
  return response.matchup?.championId === request.localChampionId
    ? response.matchup.championName
    : undefined;
}

function mapCounters(
  response: RpcResponse,
  request: NormalizedRequest,
  catalog?: DataDragonCatalog,
) {
  const candidates: CounterCandidate[] = response.counterCandidates.map(
    (candidateRow) => ({
      id: `counter:${request.patch}:${request.region}:${request.databaseRole}:${request.opponentChampionId}:${candidateRow.championId}`,
      patch: request.patch,
      region: request.region,
      role: request.role,
      opponent: champion(
        candidateRow.opponentChampionId,
        candidateRow.opponentChampionName,
        catalog,
      ),
      champion: champion(candidateRow.championId, candidateRow.championName, catalog),
      evidence: mapEvidence(candidateRow.evidence),
      explanations: [
        evidenceExplanation(candidateRow.evidence),
        "Composition compatibility is not present in this aggregate and adds no ranking boost.",
      ],
    }),
  );

  const selected = selectCounterCandidates(candidates, {
    patch: request.patch,
    region: request.region,
    role: request.role,
    opponentChampionId: request.opponentChampionId,
  });
  const opponent = champion(
    request.opponentChampionId,
    matchupOpponentName(response, request) ?? request.opponentChampionName,
    catalog,
  );

  if (selected.status === "supported") {
    const evidenceById = new Map(
      candidates.map((candidate) => [candidate.id, candidate.evidence]),
    );
    return {
      opponent,
      role: request.role,
      status: "supported" as const,
      candidates: selected.candidates.map((candidate) => ({
        ...candidate,
        evidence: evidenceById.get(candidate.id) ?? candidate.evidence,
      })),
    };
  }

  return {
    opponent,
    role: request.role,
    status: "insufficient_evidence" as const,
    candidates: [],
    reason: counterReason(response.reasonCodes, selected.reason),
  };
}

function counterReason(
  reasonCodes: readonly string[],
  selectorReason: CounterInsufficiencyReason,
): CounterInsufficiencyReason {
  if (reasonCodes.includes("matchup_evidence_insufficient")) {
    return "evidence_too_weak";
  }
  return selectorReason;
}

function mapRunePages(response: RpcResponse): RuneRecommendation[] {
  const byFrequency = [...response.runePages].sort(
    (left, right) =>
      (right.evidence.frequency ?? 0) - (left.evidence.frequency ?? 0) ||
      right.evidence.sampleSize - left.evidence.sampleSize ||
      left.runePageKey.localeCompare(right.runePageKey),
  );
  const mostFrequent = byFrequency[0];
  const supportRank = {
    strong: 3,
    moderate: 2,
    limited: 1,
    insufficient: 0,
  } as const;
  const alternatives = byFrequency.slice(1).sort(
    (left, right) =>
      supportRank[right.evidence.label] - supportRank[left.evidence.label] ||
      right.evidence.sampleSize - left.evidence.sampleSize ||
      (right.evidence.frequency ?? 0) - (left.evidence.frequency ?? 0),
  );
  const ordered = mostFrequent ? [mostFrequent, ...alternatives] : [];

  return ordered.slice(0, 3).map((row, index) => ({
    id: `runes:${row.runePageKey}`,
    kind:
      index === 0
        ? "most_frequent"
        : index === 1
          ? "highest_supported"
          : "matchup_alternative",
    title:
      index === 0
        ? `Most observed page · ${row.runePageKey}`
        : index === 1
          ? `Supported alternative · ${row.runePageKey}`
          : `Matchup alternative · ${row.runePageKey}`,
    page: {
      primaryStyleId: row.primaryStyleId,
      secondaryStyleId: row.secondaryStyleId,
      selectedPerkIds: [...row.perkIds],
      statShardIds: [...row.statPerkIds],
    },
    evidence: mapEvidence(row.evidence),
    explanation: evidenceExplanation(row.evidence),
  }));
}

function mapSpellPairs(
  response: RpcResponse,
  catalog?: DataDragonCatalog,
): SpellPairRecommendation[] {
  const spellNames: Record<number, string> = {
    1: "Cleanse",
    3: "Exhaust",
    4: "Flash",
    6: "Ghost",
    7: "Heal",
    11: "Smite",
    12: "Teleport",
    14: "Ignite",
    21: "Barrier",
  };
  return response.summonerSpellSets.slice(0, 3).map((row) => ({
    id: `spells:${row.spellPairKey}`,
    spells: [
      { id: row.spellIds[0], name: catalog?.spellNames[row.spellIds[0]] ?? spellNames[row.spellIds[0]] ?? `Spell ${row.spellIds[0]}` },
      { id: row.spellIds[1], name: catalog?.spellNames[row.spellIds[1]] ?? spellNames[row.spellIds[1]] ?? `Spell ${row.spellIds[1]}` },
    ],
    evidence: mapEvidence(row.evidence),
    explanation: evidenceExplanation(row.evidence),
  }));
}

function mapItemPaths(
  response: RpcResponse,
  catalog?: DataDragonCatalog,
): {
  paths: BuildPath[];
  warnings: string[];
} {
  const paths: BuildPath[] = [];
  const warnings: string[] = [];

  const observedPaths = [...response.itemPaths]
    .sort((left, right) =>
      (right.evidence.frequency ?? 0) - (left.evidence.frequency ?? 0) ||
      right.evidence.sampleSize - left.evidence.sampleSize,
    )
    .slice(0, 3);

  for (const [index, row] of observedPaths.entries()) {
    const isBoot = (itemId: number) =>
      catalog?.itemData[itemId]?.tags.some((tag) => tag.toLowerCase() === "boots") === true;
    const isCompleted = (itemId: number) => {
      const metadata = catalog?.itemData[itemId];
      return metadata?.purchasable === true && metadata.into.length === 0;
    };
    const bootsItemId =
      row.bootsItemId ??
      row.purchaseSequence.find(isBoot) ??
      row.coreItemIds.find(isBoot) ??
      null;
    const firstItemId =
      (row.firstItemId !== null && !isBoot(row.firstItemId) &&
      (!catalog || isCompleted(row.firstItemId))
        ? row.firstItemId
        : undefined) ??
      row.purchaseSequence.find((itemId) =>
        !row.startingItemIds.includes(itemId) && !isBoot(itemId) && isCompleted(itemId),
      ) ??
      row.coreItemIds.find((itemId) => !isBoot(itemId) && isCompleted(itemId)) ??
      null;

    if (firstItemId === null || bootsItemId === null) {
      warnings.push(
        `Item path ${row.pathKey} was omitted because its aggregate does not identify both a first item and boots.`,
      );
      continue;
    }

    const pathTags = row.coreItemIds.flatMap(
      (itemId) => catalog?.itemData[itemId]?.tags ?? [],
    );
    const defensiveTags = new Set(["Armor", "SpellBlock", "Health", "Tenacity"]);
    const offensiveTags = new Set([
      "Damage",
      "CriticalStrike",
      "AttackSpeed",
      "SpellDamage",
      "MagicPenetration",
      "ArmorPenetration",
    ]);
    const defensiveScore = pathTags.filter((tag) => defensiveTags.has(tag)).length;
    const offensiveScore = pathTags.filter((tag) => offensiveTags.has(tag)).length;
    const kind: BuildPath["kind"] = index === 0
      ? "standard"
      : defensiveScore > offensiveScore
        ? "defensive"
        : offensiveScore > defensiveScore
          ? "offensive"
          : "situational";
    const conditionalCopy = kind === "defensive"
      ? "If additional durability is the priority, consider this defensive-leaning observed route"
      : kind === "offensive"
        ? "If additional damage is the priority, consider this offensive-leaning observed route"
        : kind === "situational"
          ? "Consider this lower-frequency observed alternative when its item effects fit the matchup"
          : "This is the highest-frequency observed route in the returned sample";

    paths.push({
      id: `items:${row.pathKey}`,
      kind,
      title: index === 0 ? "Standard high-frequency path" : `${kind.charAt(0).toUpperCase()}${kind.slice(1)} alternative`,
      startingItems: row.startingItemIds.map((itemId) => item(itemId, catalog)),
      firstCompletedItem: item(firstItemId, catalog),
      boots: item(bootsItemId, catalog),
      coreItems: row.coreItemIds
        .filter((itemId) => itemId !== bootsItemId)
        .map((itemId) => item(itemId, catalog)),
      situationalOptions: [],
      evidence: mapEvidence(row.evidence),
      explanation: `${conditionalCopy}. ${evidenceExplanation(row.evidence)}; ${
        row.stageQuality === "metadata_enriched"
          ? "purchase stages are metadata-enriched"
          : "stages are retained-item proxies, not verified purchase order"
      }.`,
      biasWarning: row.biasWarning,
    });
  }

  return { paths, warnings };
}

function mapDataset(
  dataset: RpcResponse["dataset"],
): RecommendationDatasetMetadata | undefined {
  if (!dataset) return undefined;
  return {
    dataPatch: dataset.dataPatch,
    ...(dataset.dataDragonVersion === null
      ? {}
      : { dataDragonVersion: dataset.dataDragonVersion }),
    status: dataset.status,
    ...(dataset.refreshedAt === null ? {} : { refreshedAt: dataset.refreshedAt }),
    ...(dataset.lastIngestionAt === null
      ? {}
      : { lastIngestionAt: dataset.lastIngestionAt }),
    matchCount: dataset.matchCount,
    trackedPlayerCount: dataset.trackedPlayerCount,
    ...(dataset.qualityNote === null
      ? {}
      : { qualityNote: dataset.qualityNote }),
  };
}

function responseMatchesRequest(
  response: RpcResponse,
  request: NormalizedRequest,
): boolean {
  const expectedContext = contextForCache(request);
  if (!contextsMatch(response.context, expectedContext)) return false;
  if (response.dataset && response.dataset.dataPatch !== request.patch) {
    return false;
  }
  if (
    (response.status === "ready" || response.status === "stale") &&
    !response.dataset
  ) {
    return false;
  }
  if (
    response.matchup &&
    (response.matchup.championId !== request.localChampionId ||
      response.matchup.opponentChampionId !== request.opponentChampionId)
  ) {
    return false;
  }
  return response.counterCandidates.every(
    (candidate) =>
      candidate.opponentChampionId === request.opponentChampionId &&
      candidate.championId !== request.opponentChampionId,
  );
}

function mapResponse(
  response: RpcResponse,
  request: NormalizedRequest,
  now: Date,
  catalog?: DataDragonCatalog,
): RecommendationClientSuccess {
  const itemResult = mapItemPaths(response, catalog);
  const refreshedAt = response.dataset?.refreshedAt ?? now.toISOString();
  const localChampion =
    request.localChampionId === null
      ? undefined
      : champion(
          request.localChampionId,
          matchupLocalName(response, request) ?? request.localChampionName,
          catalog,
        );
  const bundle: RecommendationBundle = {
    id: [
      "companion",
      request.patch,
      request.region,
      request.databaseRole,
      request.localChampionId ?? "unselected",
      request.opponentChampionId,
      refreshedAt,
    ].join(":"),
    patch: request.patch,
    region: request.region,
    queue: { id: request.queueId, name: "Ranked Solo/Duo" },
    map: { id: request.mapId, name: "Summoner's Rift" },
    preparedAt: now.toISOString(),
    refreshedAt,
    ...(localChampion === undefined ? {} : { localChampion }),
    role: request.role,
    counterGroups: [mapCounters(response, request, catalog)],
    runePages: mapRunePages(response),
    spellPairs: mapSpellPairs(response, catalog),
    itemPaths: itemResult.paths,
  };

  return {
    ok: true,
    bundle: freezeRecommendationBundle(bundle, now.toISOString()),
    source: "network",
    stale: response.status === "stale",
    ...(response.status === "stale"
      ? { staleReason: "backend_marked_stale" as const }
      : {}),
    rpcStatus: response.status,
    reasonCodes: [...response.reasonCodes],
    warnings: [...response.warnings, ...itemResult.warnings],
    ...(mapDataset(response.dataset) === undefined
      ? {}
      : { dataset: mapDataset(response.dataset) }),
  };
}

export function parseRecommendationResponse(
  value: unknown,
  request: RecommendationRequest,
  now: Date = new Date(),
): RecommendationClientResult {
  const normalized = normalizeRequest(request);
  if (!normalized) {
    return {
      ok: false,
      reason: "invalid_context",
      message:
        "Recommendations require an exact patch, EUW/EUNE, queue 420, map 11, a supported role, and a visible opponent.",
    };
  }

  const parsed = rpcResponseSchema.safeParse(value);
  if (!parsed.success || !responseMatchesRequest(parsed.data, normalized)) {
    return {
      ok: false,
      reason: "invalid_backend_response",
      message:
        "The backend response did not match the exact requested context or schema.",
    };
  }

  return mapResponse(parsed.data, normalized, now);
}

function writeCache(
  storage: StorageLike | null,
  request: NormalizedRequest,
  payload: RpcResponse,
  now: Date,
): void {
  if (!storage) return;
  const key = normalizedRecommendationCacheKey(request);
  const envelope: CachedEnvelope = {
    cacheVersion: CACHE_VERSION,
    cachedAt: now.toISOString(),
    context: contextForCache(request),
    payload,
  };
  try {
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    // A cache failure must not block a valid network recommendation.
  }
}

function readCache(
  storage: StorageLike | null,
  request: NormalizedRequest,
  now: Date,
  staleReason: Exclude<
    RecommendationStaleReason,
    "backend_marked_stale"
  >,
): RecommendationClientSuccess | null {
  if (!storage) return null;
  const key = normalizedRecommendationCacheKey(request);

  try {
    const serialized = storage.getItem(key);
    if (!serialized) return null;
    const parsedEnvelope = cachedEnvelopeSchema.safeParse(
      JSON.parse(serialized) as unknown,
    );
    if (
      !parsedEnvelope.success ||
      !contextsMatch(parsedEnvelope.data.context, contextForCache(request)) ||
      !responseMatchesRequest(parsedEnvelope.data.payload, request)
    ) {
      storage.removeItem(key);
      return null;
    }

    const catalog = readCachedDataDragonCatalog(
      parsedEnvelope.data.payload.dataset?.dataDragonVersion ?? undefined,
      storage,
    );
    const mapped = mapResponse(parsedEnvelope.data.payload, request, now, catalog);
    return {
      ...mapped,
      source: "cache",
      stale: true,
      staleReason,
      cacheAgeMs: Math.max(
        0,
        now.getTime() - Date.parse(parsedEnvelope.data.cachedAt),
      ),
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage may be unavailable entirely; there is nothing else to do.
    }
    return null;
  }
}

function parseNetworkPayload(
  value: unknown,
  request: NormalizedRequest,
): RpcResponse | null {
  const parsed = rpcResponseSchema.safeParse(value);
  return parsed.success && responseMatchesRequest(parsed.data, request)
    ? parsed.data
    : null;
}

export async function fetchCompanionRecommendations(
  request: RecommendationRequest,
  options: RecommendationClientOptions = {},
): Promise<RecommendationClientResult> {
  const normalized = normalizeRequest(request);
  if (!normalized) {
    return parseRecommendationResponse(null, request);
  }

  const storage =
    options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now?.() ?? new Date();
  const invoke = options.invokeRpc ?? defaultRpcInvoker;

  if (!options.invokeRpc && !isSupabaseConfigured) {
    return (
      readCache(storage, normalized, now, "backend_unconfigured") ?? {
        ok: false,
        reason: "backend_unconfigured",
        message:
          "The Supabase publishable URL and key are not configured, and no exact-context cache is available.",
      }
    );
  }

  let invocation: RecommendationRpcInvocation;
  try {
    invocation = await invoke(rpcParams(normalized));
  } catch {
    return (
      readCache(storage, normalized, now, "backend_unavailable") ?? {
        ok: false,
        reason: "backend_unavailable",
        message:
          "The recommendation backend is unavailable, and no exact-context cache is available.",
      }
    );
  }

  if (invocation.error) {
    return (
      readCache(storage, normalized, now, "backend_unavailable") ?? {
        ok: false,
        reason: "backend_unavailable",
        message:
          "The recommendation backend returned an error, and no exact-context cache is available.",
      }
    );
  }

  const payload = parseNetworkPayload(invocation.data, normalized);
  if (!payload) {
    return (
      readCache(storage, normalized, now, "invalid_backend_response") ?? {
        ok: false,
        reason: "invalid_backend_response",
        message:
          "The backend response did not match the exact requested context or schema.",
      }
    );
  }

  writeCache(storage, normalized, payload, now);
  const cachedCatalog = options.catalog ?? readCachedDataDragonCatalog(
    payload.dataset?.dataDragonVersion ?? undefined,
    storage,
  );
  const catalog =
    cachedCatalog ??
    (options.invokeRpc
      ? undefined
      : await loadDataDragonCatalog(
          payload.dataset?.dataDragonVersion ?? undefined,
          storage,
        ));
  return mapResponse(payload, normalized, now, catalog);
}
