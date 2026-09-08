import { z } from "zod";

export const PLATFORM_REGIONS = ["EUW1", "EUN1"] as const;
export type PlatformRegion = (typeof PLATFORM_REGIONS)[number];

const integerFromEnv = (minimum: number, maximum: number, fallback: number) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : value),
    z.coerce.number().int().min(minimum).max(maximum),
  );

const platformsFromEnv = z
  .preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((part) => part.trim().toUpperCase())
            .filter(Boolean)
        : PLATFORM_REGIONS,
    z.array(z.enum(PLATFORM_REGIONS)).min(1),
  )
  .transform((platforms) => [...new Set(platforms)]);

const workerEnvSchema = z.object({
  RIOT_API_KEY: z
    .string({ error: "RIOT_API_KEY is required" })
    .min(20, "RIOT_API_KEY is not valid")
    .refine((value) => value.startsWith("RGAPI-"), "RIOT_API_KEY must be a Riot API key"),
  SUPABASE_URL: z
    .url({ error: "SUPABASE_URL must be a valid URL" })
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
      );
    }, "SUPABASE_URL must use HTTPS (plain HTTP is allowed only for a loopback development stack)"),
  SUPABASE_SECRET_KEY: z
    .string({ error: "SUPABASE_SECRET_KEY is required" })
    .min(20, "SUPABASE_SECRET_KEY is not valid")
    .refine(
      (value) => !value.startsWith("sb_publishable_") && !value.startsWith("anon"),
      "SUPABASE_SECRET_KEY must be a server-side secret/service-role key",
    ),
  RIOT_PLATFORMS: platformsFromEnv.default([...PLATFORM_REGIONS]),
  MATCHES_PER_PLAYER: integerFromEnv(1, 100, 20),
  PLAYERS_PER_RUN: integerFromEnv(0, 1_000, 0),
  REQUEST_CONCURRENCY: integerFromEnv(1, 10, 2),
  DATABASE_BATCH_SIZE: integerFromEnv(1, 500, 100),
  RIOT_MAX_ATTEMPTS: integerFromEnv(1, 10, 6),
  RIOT_MIN_REQUEST_INTERVAL_MS: integerFromEnv(0, 60_000, 1_200),
  MATCH_START_OFFSET: integerFromEnv(0, 10_000, 0),
});

export type WorkerConfig = Readonly<{
  riotApiKey: string;
  supabaseUrl: string;
  supabaseSecretKey: string;
  platforms: PlatformRegion[];
  matchesPerPlayer: number;
  playersPerRun: number;
  requestConcurrency: number;
  databaseBatchSize: number;
  riotMaxAttempts: number;
  riotMinRequestIntervalMs: number;
  matchStartOffset: number;
}>;

/**
 * Parse server-only worker configuration. Validation errors intentionally mention
 * environment variable names, never their values.
 */
export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const result = workerEnvSchema.safeParse({
    ...environment,
    // The project URL is public configuration, so the worker may safely reuse
    // the same value as the frontend. Server write credentials never fall back.
    SUPABASE_URL: environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid ingestion worker configuration: ${details}`);
  }

  const values = result.data;
  return Object.freeze({
    riotApiKey: values.RIOT_API_KEY,
    supabaseUrl: values.SUPABASE_URL,
    supabaseSecretKey: values.SUPABASE_SECRET_KEY,
    platforms: values.RIOT_PLATFORMS,
    matchesPerPlayer: values.MATCHES_PER_PLAYER,
    playersPerRun: values.PLAYERS_PER_RUN,
    requestConcurrency: values.REQUEST_CONCURRENCY,
    databaseBatchSize: values.DATABASE_BATCH_SIZE,
    riotMaxAttempts: values.RIOT_MAX_ATTEMPTS,
    riotMinRequestIntervalMs: values.RIOT_MIN_REQUEST_INTERVAL_MS,
    matchStartOffset: values.MATCH_START_OFFSET,
  });
}

/** A safe-to-log view of worker settings. */
export function publicConfigSummary(config: WorkerConfig) {
  return {
    platforms: config.platforms,
    matchesPerPlayer: config.matchesPerPlayer,
    playersPerRun: config.playersPerRun || "all",
    requestConcurrency: config.requestConcurrency,
    matchStartOffset: config.matchStartOffset,
  } as const;
}
