import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { chunk } from "./concurrency";
import type { PlatformRegion } from "./config";
import type { ChallengerEntry, ChallengerLeague } from "./riot-schemas";
import type {
  MatchFilterReason,
  MatchRow,
  RiotRegion,
  SeenPlayerRow,
  TransformedMatch,
} from "./transform";

type RunStatus = "running" | "succeeded" | "partial" | "failed" | "cancelled";

export type RunProgress = Readonly<{
  patch?: string | null;
  status?: RunStatus;
  finishedAt?: string | null;
  requestedCount?: number;
  discoveredCount?: number;
  processedCount?: number;
  succeededCount?: number;
  failedCount?: number;
  errorSummary?: string | null;
  errorDetails?: unknown;
  metadata?: unknown;
}>;

export type ResolvedLadderEntry = Readonly<{
  entry: ChallengerEntry;
  puuid: string;
  summonerId: string | null;
}>;

export type LadderSnapshotInput = Readonly<{
  runId: string;
  region: RiotRegion;
  platform: PlatformRegion;
  patch: string;
  fetchedAt: string;
  league: ChallengerLeague;
  entries: ResolvedLadderEntry[];
}>;

export type LadderSnapshotResult = Readonly<{
  snapshotId: string;
  playerIds: ReadonlyMap<string, string>;
}>;

export type MatchSourceRow = Readonly<{
  match_id: string;
  player_id: string;
  ladder_snapshot_id: string | null;
  run_id: string | null;
  source_type: "challenger_ladder";
  discovered_at: string;
  rank_at_discovery: number | null;
}>;

export type MatchExclusionRow = Readonly<{
  match_id: string;
  run_id: string;
  region: RiotRegion;
  platform_region: PlatformRegion;
  filter_reason: MatchFilterReason;
  game_version: string;
  evaluated_against_patch: string;
  queue_id: number;
  map_id: number;
  duration_seconds: number;
  first_seen_at: string;
  last_seen_at: string;
}>;

export class DatabaseOperationError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string | undefined,
    message: string,
  ) {
    super(`Database operation ${operation} failed: ${message}`);
    this.name = "DatabaseOperationError";
  }
}

function throwOnError(
  operation: string,
  error: { code?: string; message: string } | null,
): asserts error is null {
  if (error) {
    throw new DatabaseOperationError(operation, error.code, error.message);
  }
}

export function createWorkerSupabaseClient(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: { "X-Client-Info": "challenger-lens-ingestion-worker" },
    },
  });
}

export class IngestionRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly batchSize = 100,
  ) {}

  async createRun(metadata: unknown): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error } = await this.client.from("ingestion_runs").insert({
      id,
      pipeline: "challenger_match_ingestion",
      region: null,
      patch: null,
      status: "running",
      started_at: now,
      finished_at: null,
      requested_count: 0,
      discovered_count: 0,
      processed_count: 0,
      succeeded_count: 0,
      failed_count: 0,
      error_summary: null,
      error_details: { errors: [] },
      metadata,
    });
    throwOnError("create ingestion run", error);
    return id;
  }

  async updateRun(runId: string, progress: RunProgress): Promise<void> {
    const update: Record<string, unknown> = {};
    if (progress.patch !== undefined) update.patch = progress.patch;
    if (progress.status !== undefined) update.status = progress.status;
    if (progress.finishedAt !== undefined) update.finished_at = progress.finishedAt;
    if (progress.requestedCount !== undefined) update.requested_count = progress.requestedCount;
    if (progress.discoveredCount !== undefined) update.discovered_count = progress.discoveredCount;
    if (progress.processedCount !== undefined) update.processed_count = progress.processedCount;
    if (progress.succeededCount !== undefined) update.succeeded_count = progress.succeededCount;
    if (progress.failedCount !== undefined) update.failed_count = progress.failedCount;
    if (progress.errorSummary !== undefined) update.error_summary = progress.errorSummary;
    if (progress.errorDetails !== undefined) update.error_details = progress.errorDetails;
    if (progress.metadata !== undefined) update.metadata = progress.metadata;

    const { error } = await this.client.from("ingestion_runs").update(update).eq("id", runId);
    throwOnError("update ingestion run", error);
  }

  async setCursor(
    runId: string,
    region: RiotRegion,
    cursorKey: string,
    cursorValue: unknown,
  ): Promise<void> {
    const { error } = await this.client.from("ingestion_cursors").upsert(
      {
        pipeline: "challenger_match_ingestion",
        region,
        cursor_key: cursorKey,
        cursor_value: cursorValue,
        updated_at: new Date().toISOString(),
        run_id: runId,
      },
      { onConflict: "pipeline,region,cursor_key" },
    );
    throwOnError("save ingestion cursor", error);
  }

  async getCursor(
    region: RiotRegion,
    cursorKey: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.client
      .from("ingestion_cursors")
      .select("cursor_value")
      .eq("pipeline", "challenger_match_ingestion")
      .eq("region", region)
      .eq("cursor_key", cursorKey)
      .maybeSingle();
    throwOnError("load ingestion cursor", error);

    const value = data?.cursor_value;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  async persistLadderSnapshot(input: LadderSnapshotInput): Promise<LadderSnapshotResult> {
    const snapshotId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const playerRows = input.entries.map(({ entry, puuid, summonerId }) => ({
      puuid,
      region: input.region,
      platform_region: input.platform,
      summoner_id: summonerId,
      current_tier: "CHALLENGER",
      current_rank: entry.rank,
      league_points: entry.leaguePoints,
      wins: entry.wins,
      losses: entry.losses,
      last_ladder_seen_at: input.fetchedAt,
      updated_at: timestamp,
    }));
    const playerIds = await this.upsertPlayers(playerRows);

    const { error: snapshotError } = await this.client.from("ladder_snapshots").insert({
      id: snapshotId,
      run_id: input.runId,
      region: input.region,
      platform_region: input.platform,
      queue_type: "RANKED_SOLO_5x5",
      tier: "CHALLENGER",
      patch: input.patch,
      fetched_at: input.fetchedAt,
      entry_count: input.entries.length,
      raw_payload: input.league,
    });
    throwOnError("insert ladder snapshot", snapshotError);

    const rankByPuuid = [...input.entries]
      .sort(
        (left, right) =>
          right.entry.leaguePoints - left.entry.leaguePoints || left.puuid.localeCompare(right.puuid),
      )
      .map((entry, index) => ({ ...entry, rankPosition: index + 1 }));

    await this.upsertRows(
      "ladder_entries",
      rankByPuuid.map(({ entry, puuid, rankPosition }) => ({
        snapshot_id: snapshotId,
        player_id: playerIds.get(puuid)!,
        league_points: entry.leaguePoints,
        wins: entry.wins,
        losses: entry.losses,
        rank_position: rankPosition,
        veteran: entry.veteran,
        inactive: entry.inactive,
        fresh_blood: entry.freshBlood,
        hot_streak: entry.hotStreak,
        raw_payload: entry,
      })),
      "snapshot_id,player_id",
    );

    return { snapshotId, playerIds };
  }

  async upsertPlayers<T extends { puuid: string }>(
    players: ReadonlyArray<T | SeenPlayerRow>,
  ): Promise<Map<string, string>> {
    const deduplicated = new Map<string, Record<string, unknown>>();
    for (const player of players) {
      const row = { ...player } as Record<string, unknown>;
      deduplicated.set(String(row.puuid), row);
    }

    const ids = new Map<string, string>();
    for (const batch of chunk([...deduplicated.values()], this.batchSize)) {
      const { data, error } = await this.client
        .from("players")
        .upsert(batch, { onConflict: "puuid" })
        .select("id,puuid");
      throwOnError("upsert players", error);
      for (const row of data ?? []) {
        ids.set(String(row.puuid), String(row.id));
      }
    }

    if (ids.size !== deduplicated.size) {
      throw new Error("Player upsert did not return every requested player ID");
    }
    return ids;
  }

  async getCompletedMatchIds(matchIds: readonly string[]): Promise<Set<string>> {
    const completed = new Set<string>();
    for (const batch of chunk(matchIds, this.batchSize)) {
      const { data, error } = await this.client
        .from("matches")
        .select("match_id")
        .in("match_id", batch)
        .in("timeline_status", ["complete", "unavailable"]);
      throwOnError("find completed matches", error);
      for (const row of data ?? []) completed.add(String(row.match_id));
    }
    return completed;
  }

  async getExcludedMatchIds(matchIds: readonly string[]): Promise<Set<string>> {
    const excluded = new Set<string>();
    for (const batch of chunk(matchIds, this.batchSize)) {
      const { data, error } = await this.client
        .from("match_exclusions")
        .select("match_id")
        .in("match_id", batch);
      throwOnError("find excluded matches", error);
      for (const row of data ?? []) excluded.add(String(row.match_id));
    }
    return excluded;
  }

  async upsertMatchExclusion(row: MatchExclusionRow): Promise<void> {
    await this.upsertRows("match_exclusions", [row], "match_id");
  }

  async persistMatch(
    transformed: TransformedMatch,
    finalTimelineStatus: "complete" | "unavailable" = "complete",
  ): Promise<void> {
    const playerIds = await this.upsertPlayers(transformed.players);
    const pendingMatch: MatchRow = {
      ...transformed.match,
      timeline_status: "pending",
      updated_at: new Date().toISOString(),
    };

    await this.upsertRows("matches", [pendingMatch], "match_id");

    try {
      await this.upsertRows(
        "match_participants",
        transformed.participants.map((participant) => ({
          ...participant,
          player_id: playerIds.get(participant.puuid) ?? null,
        })),
        "match_id,participant_id",
      );
      await this.upsertRows(
        "participant_frames",
        transformed.frames,
        "match_id,participant_id,timestamp_ms",
      );
      await this.upsertRows("item_events", transformed.itemEvents, "match_id,event_index");
      await this.upsertRows("role_pairs", transformed.rolePairs, "match_id,role");

      const { error } = await this.client
        .from("matches")
        .update({
          timeline_status: finalTimelineStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("match_id", transformed.match.match_id);
      throwOnError("complete match ingestion", error);
    } catch (error) {
      // Best effort: the next run retries anything not marked terminal.
      await this.client
        .from("matches")
        .update({ timeline_status: "failed", updated_at: new Date().toISOString() })
        .eq("match_id", transformed.match.match_id);
      throw error;
    }
  }

  async upsertMatchSources(sources: readonly MatchSourceRow[]): Promise<void> {
    await this.upsertRows("match_sources", sources, "match_id,player_id");
  }

  async refreshAnalytics(patch: string, region: RiotRegion | null, minimumGames = 1): Promise<void> {
    const { error } = await this.client.rpc("refresh_public_analytics", {
      p_patch: patch,
      p_region: region,
      p_min_games: minimumGames,
    });
    throwOnError("refresh public analytics", error);
  }

  private async upsertRows<T extends object>(
    table: string,
    rows: readonly T[],
    onConflict: string,
  ): Promise<void> {
    for (const batch of chunk(rows, this.batchSize)) {
      const { error } = await this.client.from(table).upsert(batch as Record<string, unknown>[], {
        onConflict,
      });
      throwOnError(`upsert ${table}`, error);
    }
  }
}
