import type { PlatformRegion } from "./config";
import { ConcurrencyLimiter } from "./concurrency";
import {
  challengerLeagueSchema,
  matchSchema,
  realmSchema,
  summonerSchema,
  timelineSchema,
  type ChallengerLeague,
  type RiotMatch,
  type RiotTimeline,
} from "./riot-schemas";

export type RiotClientOptions = Readonly<{
  apiKey: string;
  concurrency: number;
  maxAttempts?: number;
  minimumRequestIntervalMs?: number;
  fetchImplementation?: typeof fetch;
  sleepImplementation?: (milliseconds: number) => Promise<void>;
  randomImplementation?: () => number;
}>;

export class RiotHttpError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    message = `Riot request failed with status ${status}`,
  ) {
    super(message);
    this.name = "RiotHttpError";
  }
}

interface Decoder<T> {
  parse(value: unknown): T;
}

const EUROPE_HOST = "https://europe.api.riotgames.com";
const DDRAGON_HOST = "https://ddragon.leagueoflegends.com";
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

function safeEndpoint(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

export class RiotClient {
  readonly #apiKey: string;
  readonly #limiter: ConcurrencyLimiter;
  readonly #maxAttempts: number;
  readonly #minimumRequestIntervalMs: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #random: () => number;
  #blockedUntil = 0;
  #nextRequestAt = 0;
  #requestWindowTail: Promise<void> = Promise.resolve();

  constructor(options: RiotClientOptions) {
    this.#apiKey = options.apiKey;
    this.#limiter = new ConcurrencyLimiter(options.concurrency);
    this.#maxAttempts = options.maxAttempts ?? 6;
    this.#minimumRequestIntervalMs = options.minimumRequestIntervalMs ?? 0;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#sleep = options.sleepImplementation ?? sleep;
    this.#random = options.randomImplementation ?? Math.random;
  }

  async getChallengerLeague(platform: PlatformRegion): Promise<ChallengerLeague> {
    const url = new URL(
      "/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5",
      this.#platformHost(platform),
    );
    return this.#request(url, challengerLeagueSchema, true);
  }

  async getSummonerById(platform: PlatformRegion, encryptedSummonerId: string): Promise<string> {
    const url = new URL(
      `/lol/summoner/v4/summoners/${encodeURIComponent(encryptedSummonerId)}`,
      this.#platformHost(platform),
    );
    return (await this.#request(url, summonerSchema, true)).puuid;
  }

  async getRecentMatchIds(
    puuid: string,
    count: number,
    start = 0,
  ): Promise<string[]> {
    const url = new URL(
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`,
      EUROPE_HOST,
    );
    url.searchParams.set("queue", "420");
    url.searchParams.set("type", "ranked");
    url.searchParams.set("start", String(start));
    url.searchParams.set("count", String(count));
    return this.#request(url, this.#matchIdsSchema, true);
  }

  async getMatch(matchId: string): Promise<RiotMatch> {
    const url = new URL(`/lol/match/v5/matches/${encodeURIComponent(matchId)}`, EUROPE_HOST);
    return this.#request(url, matchSchema, true);
  }

  async getTimeline(matchId: string): Promise<RiotTimeline> {
    const url = new URL(
      `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`,
      EUROPE_HOST,
    );
    return this.#request(url, timelineSchema, true);
  }

  async getRealmPatch(platform: PlatformRegion): Promise<string> {
    const realm = platform === "EUW1" ? "euw" : "eune";
    const url = new URL(`/realms/${realm}.json`, DDRAGON_HOST);
    return (await this.#request(url, realmSchema, false)).v;
  }

  readonly #matchIdsSchema = {
    parse(value: unknown): string[] {
      if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && id.length > 0)) {
        throw new TypeError("Riot match ID response was not a string array");
      }
      return value;
    },
  };

  #platformHost(platform: PlatformRegion): string {
    return `https://${platform.toLowerCase()}.api.riotgames.com`;
  }

  async #request<T>(
    url: URL,
    schema: Decoder<T>,
    authenticated: boolean,
  ): Promise<T> {
    return this.#limiter.run(async () => {
      const endpoint = safeEndpoint(url);
      let lastError: unknown;

      for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
        await this.#waitForRequestWindow();

        try {
          const response = await this.#fetch(url, {
            headers: authenticated
              ? {
                  Accept: "application/json",
                  "X-Riot-Token": this.#apiKey,
                }
              : { Accept: "application/json" },
            signal: AbortSignal.timeout(30_000),
          });

          if (response.ok) {
            return schema.parse(await response.json());
          }

          const error = new RiotHttpError(response.status, endpoint);
          if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === this.#maxAttempts) {
            throw error;
          }

          const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
          const delay = retryAfter ?? this.#backoff(attempt);
          if (response.status === 429) {
            this.#blockedUntil = Math.max(this.#blockedUntil, Date.now() + delay);
          } else {
            await this.#sleep(delay);
          }
          lastError = error;
        } catch (error) {
          if (error instanceof RiotHttpError) throw error;
          lastError = error;
          if (attempt === this.#maxAttempts) break;
          await this.#sleep(this.#backoff(attempt));
        }
      }

      throw new Error(`Riot request exhausted retries for ${endpoint}`, { cause: lastError });
    });
  }

  async #waitForRequestWindow(): Promise<void> {
    let releaseWindow!: () => void;
    const previousWindow = this.#requestWindowTail;
    this.#requestWindowTail = new Promise<void>((resolve) => {
      releaseWindow = resolve;
    });

    await previousWindow;
    try {
      let waitUntil = Math.max(this.#blockedUntil, this.#nextRequestAt);
      let now = Date.now();
      if (waitUntil > now) {
        await this.#sleep(waitUntil - now);
      }

      // A concurrent request can receive a 429 while this request is waiting.
      // Re-read the shared block once before reserving the next request slot.
      if (this.#blockedUntil > waitUntil) {
        waitUntil = this.#blockedUntil;
        now = Date.now();
        if (waitUntil > now) await this.#sleep(waitUntil - now);
      }

      this.#nextRequestAt = Math.max(Date.now(), waitUntil) + this.#minimumRequestIntervalMs;
    } finally {
      releaseWindow();
    }
  }

  #backoff(attempt: number): number {
    const exponential = Math.min(30_000, 500 * 2 ** (attempt - 1));
    return Math.round(exponential * (0.75 + this.#random() * 0.5));
  }
}

export const riotClientInternals = { parseRetryAfter };
