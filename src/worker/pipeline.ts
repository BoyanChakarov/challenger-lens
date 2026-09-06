import { mapWithConcurrency } from "./concurrency";
import { publicConfigSummary, type PlatformRegion, type WorkerConfig } from "./config";
import {
  createWorkerSupabaseClient,
  IngestionRepository,
  type MatchSourceRow,
  type ResolvedLadderEntry,
} from "./repository";
import { RiotClient, RiotHttpError } from "./riot-client";
import type { ChallengerEntry, RiotMatch, RiotTimeline } from "./riot-schemas";
import {
  marketingPatch,
  matchFilterReason,
  normalizeGameDurationSeconds,
  normalizePatch,
  platformToRegion,
  transformEligibleMatch,
  type RiotRegion,
} from "./transform";

interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

interface PipelineMetrics {
  requested: number;
  discovered: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  deduplicated: number;
  unavailableTimelines: number;
}

interface ErrorDetail {
  scope: string;
  reference?: string;
  message: string;
}

interface CandidateSource {
  playerId: string;
  snapshotId: string;
  rank: number;
}

interface MatchCandidate {
  matchId: string;
  sources: Map<string, CandidateSource>;
}

interface RegionResult {
  platform: PlatformRegion;
  region: RiotRegion;
  realmVersion: string;
  realmPatch: string;
  publicPatch: string;
}

export interface IngestionSummary extends PipelineMetrics {
  runId: string;
  status: "succeeded" | "partial" | "failed" | "cancelled";
  patches: string[];
  errorCount: number;
}

export type PipelineDependencies = Readonly<{
  riot?: RiotClient;
  repository?: IngestionRepository;
  logger?: Logger;
  now?: () => Date;
  isCancellationRequested?: () => boolean;
}>;

const consoleLogger: Logger = {
  info: (message, context) => console.info(message, context ?? ""),
  warn: (message, context) => console.warn(message, context ?? ""),
  error: (message, context) => console.error(message, context ?? ""),
};

class CancellationError extends Error {
  constructor() {
    super("Ingestion was cancelled");
    this.name = "CancellationError";
  }
}

function sanitizedErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/RGAPI-[A-Za-z0-9_-]+/gi, "[redacted Riot key]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/gi, "[redacted Supabase key]")
    .slice(0, 1_000);
}

function emptyTimeline(match: RiotMatch): RiotTimeline {
  return {
    metadata: {
      dataVersion: match.metadata.dataVersion,
      matchId: match.metadata.matchId,
      participants: match.metadata.participants,
    },
    info: { frameInterval: 60_000, frames: [] },
  };
}

function sortLadderEntries(entries: readonly ChallengerEntry[]): ChallengerEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.leaguePoints - left.leaguePoints ||
      (left.puuid ?? left.summonerId ?? "").localeCompare(right.puuid ?? right.summonerId ?? ""),
  );
}

function sourceRows(
  candidate: MatchCandidate,
  runId: string,
  discoveredAt: string,
): MatchSourceRow[] {
  return [...candidate.sources.values()].map((source) => ({
    match_id: candidate.matchId,
    player_id: source.playerId,
    ladder_snapshot_id: source.snapshotId,
    run_id: runId,
    source_type: "challenger_ladder",
    discovered_at: discoveredAt,
    rank_at_discovery: source.rank,
  }));
}

export async function runIngestion(
  config: WorkerConfig,
  dependencies: PipelineDependencies = {},
): Promise<IngestionSummary> {
  const logger = dependencies.logger ?? consoleLogger;
  const now = dependencies.now ?? (() => new Date());
  const isCancellationRequested = dependencies.isCancellationRequested ?? (() => false);
  const riot =
    dependencies.riot ??
    new RiotClient({
      apiKey: config.riotApiKey,
      concurrency: config.requestConcurrency,
      maxAttempts: config.riotMaxAttempts,
      minimumRequestIntervalMs: config.riotMinRequestIntervalMs,
    });
  const repository =
    dependencies.repository ??
    new IngestionRepository(
      createWorkerSupabaseClient(config.supabaseUrl, config.supabaseSecretKey),
      config.databaseBatchSize,
    );

  logger.info("Starting Challenger ingestion", publicConfigSummary(config));
  const runId = await repository.createRun({
    worker: "challenger-lens",
    platforms: config.platforms,
    matches_per_player: config.matchesPerPlayer,
    players_per_run: config.playersPerRun || null,
    match_start_offset: config.matchStartOffset,
  });

  const metrics: PipelineMetrics = {
    requested: 0,
    discovered: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    deduplicated: 0,
    unavailableTimelines: 0,
  };
  const errors: ErrorDetail[] = [];
  const regionResults: RegionResult[] = [];

  const recordError = (scope: string, error: unknown, reference?: string) => {
    metrics.failed += 1;
    const detail: ErrorDetail = { scope, message: sanitizedErrorMessage(error) };
    if (reference) detail.reference = reference;
    if (errors.length < 100) errors.push(detail);
    logger.warn(`Ingestion issue in ${scope}`, reference ? { reference } : undefined);
  };

  const updateProgress = async () => {
    const patches = [...new Set(regionResults.map((result) => result.publicPatch))];
    await repository.updateRun(runId, {
      patch: patches.length === 1 ? patches[0]! : null,
      requestedCount: metrics.requested,
      discoveredCount: metrics.discovered,
      processedCount: metrics.processed,
      succeededCount: metrics.succeeded,
      failedCount: metrics.failed,
      errorDetails: { errors, total: metrics.failed },
      metadata: {
        ...publicConfigSummary(config),
        skipped: metrics.skipped,
        deduplicated: metrics.deduplicated,
        unavailable_timelines: metrics.unavailableTimelines,
        regions: regionResults,
      },
    });
  };

  try {
    for (const platform of config.platforms) {
      if (isCancellationRequested()) throw new CancellationError();

      try {
        const result = await ingestRegion({
          platform,
          runId,
          config,
          riot,
          repository,
          metrics,
          recordError,
          now,
          isCancellationRequested,
        });
        regionResults.push(result);
      } catch (error) {
        if (error instanceof CancellationError) throw error;
        recordError(`region:${platform}`, error);
      }
      await updateProgress();
    }

    for (const result of regionResults) {
      try {
        // Retain sparse observed builds and matchups in the public aggregate
        // layer; the dashboard applies its own minimum-sample filter and the
        // evidence model labels small samples as insufficient.
        await repository.refreshAnalytics(result.publicPatch, result.region, 1);
      } catch (error) {
        recordError(`analytics:${result.region}`, error);
      }
    }

    const usefulCount = metrics.succeeded + metrics.deduplicated;
    const status = errors.length === 0 ? "succeeded" : usefulCount > 0 ? "partial" : "failed";
    const patches = [...new Set(regionResults.map((result) => result.publicPatch))];
    await repository.updateRun(runId, {
      status,
      finishedAt: now().toISOString(),
      patch: patches.length === 1 ? patches[0]! : null,
      requestedCount: metrics.requested,
      discoveredCount: metrics.discovered,
      processedCount: metrics.processed,
      succeededCount: metrics.succeeded,
      failedCount: metrics.failed,
      errorSummary: errors.length > 0 ? `${errors.length} ingestion operation(s) failed` : null,
      errorDetails: { errors, total: metrics.failed },
      metadata: {
        ...publicConfigSummary(config),
        skipped: metrics.skipped,
        deduplicated: metrics.deduplicated,
        unavailable_timelines: metrics.unavailableTimelines,
        regions: regionResults,
      },
    });

    logger.info("Challenger ingestion finished", {
      runId,
      status,
      processed: metrics.processed,
      succeeded: metrics.succeeded,
      failed: metrics.failed,
    });
    return { ...metrics, runId, status, patches, errorCount: errors.length };
  } catch (error) {
    const cancelled = error instanceof CancellationError;
    if (!cancelled) recordError("pipeline", error);
    const status = cancelled ? "cancelled" : "failed";
    const patches = [...new Set(regionResults.map((result) => result.publicPatch))];

    try {
      await repository.updateRun(runId, {
        status,
        finishedAt: now().toISOString(),
        patch: patches.length === 1 ? patches[0]! : null,
        requestedCount: metrics.requested,
        discoveredCount: metrics.discovered,
        processedCount: metrics.processed,
        succeededCount: metrics.succeeded,
        failedCount: metrics.failed,
        errorSummary: cancelled ? "Ingestion cancelled" : sanitizedErrorMessage(error),
        errorDetails: { errors, total: metrics.failed },
      });
    } catch (finalizationError) {
      logger.error("Could not finalize ingestion run", {
        message: sanitizedErrorMessage(finalizationError),
      });
    }

    return { ...metrics, runId, status, patches, errorCount: errors.length };
  }
}

async function ingestRegion(input: {
  platform: PlatformRegion;
  runId: string;
  config: WorkerConfig;
  riot: RiotClient;
  repository: IngestionRepository;
  metrics: PipelineMetrics;
  recordError: (scope: string, error: unknown, reference?: string) => void;
  now: () => Date;
  isCancellationRequested: () => boolean;
}): Promise<RegionResult> {
  const {
    platform,
    runId,
    config,
    riot,
    repository,
    metrics,
    recordError,
    now,
    isCancellationRequested,
  } = input;
  const region = platformToRegion(platform);
  const realmVersion = await riot.getRealmPatch(platform);
  const realmPatch = normalizePatch(realmVersion);
  const publicPatch = marketingPatch(realmVersion, now());
  const league = await riot.getChallengerLeague(platform);
  const fetchedAt = now().toISOString();
  const orderedEntries = sortLadderEntries(league.entries);

  const resolvedResults = await mapWithConcurrency(
    orderedEntries,
    config.requestConcurrency,
    async (entry): Promise<ResolvedLadderEntry | null> => {
      if (entry.puuid) {
        return { entry, puuid: entry.puuid, summonerId: entry.summonerId ?? null };
      }
      try {
        const puuid = await riot.getSummonerById(platform, entry.summonerId!);
        return { entry, puuid, summonerId: entry.summonerId ?? null };
      } catch (error) {
        recordError(`resolve-player:${region}`, error);
        return null;
      }
    },
  );
  const resolvedEntries = resolvedResults.filter(
    (entry): entry is ResolvedLadderEntry => entry !== null,
  );
  const snapshot = await repository.persistLadderSnapshot({
    runId,
    region,
    platform,
    patch: publicPatch,
    fetchedAt,
    league,
    entries: resolvedEntries,
  });

  await repository.setCursor(runId, region, "progress", {
    stage: "ladder_saved",
    snapshot_id: snapshot.snapshotId,
    patch: publicPatch,
    ddragon_version: realmVersion,
    fetched_at: fetchedAt,
  });

  const batchCursor = await repository.getCursor(region, "player_batch");
  const savedOffset = Number(batchCursor?.next_offset ?? 0);
  const startOffset =
    Number.isInteger(savedOffset) && savedOffset >= 0 && savedOffset < resolvedEntries.length
      ? savedOffset
      : 0;
  const selectedEntries =
    config.playersPerRun > 0 && resolvedEntries.length > 0
      ? Array.from(
          { length: Math.min(config.playersPerRun, resolvedEntries.length) },
          (_, index) => {
            const absoluteIndex = (startOffset + index) % resolvedEntries.length;
            return { resolved: resolvedEntries[absoluteIndex]!, rankIndex: absoluteIndex };
          },
        )
      : resolvedEntries.map((resolved, rankIndex) => ({ resolved, rankIndex }));
  metrics.requested += selectedEntries.length * config.matchesPerPlayer;
  const candidates = new Map<string, MatchCandidate>();

  await mapWithConcurrency(selectedEntries, config.requestConcurrency, async ({ resolved, rankIndex }) => {
    if (isCancellationRequested()) throw new CancellationError();
    try {
      const matchIds = await riot.getRecentMatchIds(
        resolved.puuid,
        config.matchesPerPlayer,
        config.matchStartOffset,
      );
      const playerId = snapshot.playerIds.get(resolved.puuid);
      if (!playerId) throw new Error("Resolved ladder player has no database ID");

      for (const matchId of matchIds) {
        const candidate = candidates.get(matchId) ?? { matchId, sources: new Map() };
        candidate.sources.set(playerId, {
          playerId,
          snapshotId: snapshot.snapshotId,
          rank: rankIndex + 1,
        });
        candidates.set(matchId, candidate);
      }
    } catch (error) {
      recordError(`discover-matches:${region}`, error);
    }
  });

  metrics.discovered += candidates.size;
  const nextOffset =
    resolvedEntries.length > 0 ? (startOffset + selectedEntries.length) % resolvedEntries.length : 0;
  await repository.setCursor(runId, region, "player_batch", {
    next_offset: nextOffset,
    players_in_snapshot: resolvedEntries.length,
    batch_size: selectedEntries.length,
    snapshot_id: snapshot.snapshotId,
    updated_at: now().toISOString(),
  });
  await repository.setCursor(runId, region, "progress", {
    stage: "matches_discovered",
    snapshot_id: snapshot.snapshotId,
    patch: publicPatch,
    ddragon_version: realmVersion,
    match_count: candidates.size,
  });

  const candidateList = [...candidates.values()];
  const completed = await repository.getCompletedMatchIds(
    candidateList.map((candidate) => candidate.matchId),
  );
  const excluded = await repository.getExcludedMatchIds(
    candidateList.map((candidate) => candidate.matchId),
  );
  const discoveredAt = now().toISOString();
  const completedSources = candidateList
    .filter((candidate) => completed.has(candidate.matchId))
    .flatMap((candidate) => sourceRows(candidate, runId, discoveredAt));
  if (completedSources.length > 0) {
    await repository.upsertMatchSources(completedSources);
  }
  metrics.deduplicated += completed.size;
  metrics.skipped += excluded.size;

  const pending = candidateList.filter(
    (candidate) => !completed.has(candidate.matchId) && !excluded.has(candidate.matchId),
  );
  await mapWithConcurrency(pending, config.requestConcurrency, async (candidate) => {
    if (isCancellationRequested()) throw new CancellationError();
    metrics.processed += 1;

    try {
      const match = await riot.getMatch(candidate.matchId);
      const reason = matchFilterReason(match, realmPatch);
      if (reason) {
        const excludedAt = now().toISOString();
        await repository.upsertMatchExclusion({
          match_id: candidate.matchId,
          run_id: runId,
          region,
          platform_region: platform,
          filter_reason: reason,
          game_version: match.info.gameVersion,
          evaluated_against_patch: realmPatch,
          queue_id: match.info.queueId,
          map_id: match.info.mapId,
          duration_seconds: normalizeGameDurationSeconds(match.info.gameDuration),
          first_seen_at: excludedAt,
          last_seen_at: excludedAt,
        });
        metrics.skipped += 1;
        return;
      }

      let timeline: RiotTimeline;
      let finalTimelineStatus: "complete" | "unavailable" = "complete";
      try {
        timeline = await riot.getTimeline(candidate.matchId);
      } catch (error) {
        if (error instanceof RiotHttpError && error.status === 404) {
          timeline = emptyTimeline(match);
          finalTimelineStatus = "unavailable";
          metrics.unavailableTimelines += 1;
        } else {
          throw error;
        }
      }

      const transformed = transformEligibleMatch(match, timeline, {
        runId,
        ingestedAt: now(),
        marketingPatch: publicPatch,
        ddragonVersion: realmVersion,
      });
      await repository.persistMatch(transformed, finalTimelineStatus);
      await repository.upsertMatchSources(sourceRows(candidate, runId, discoveredAt));

      if (finalTimelineStatus === "complete") metrics.succeeded += 1;
    } catch (error) {
      recordError(`match:${region}`, error, candidate.matchId);
    }
  });

  await repository.setCursor(runId, region, "progress", {
    stage: "complete",
    snapshot_id: snapshot.snapshotId,
    patch: publicPatch,
    ddragon_version: realmVersion,
    processed_count: metrics.processed,
    succeeded_count: metrics.succeeded,
    failed_count: metrics.failed,
  });

  return { platform, region, realmVersion, realmPatch, publicPatch };
}
