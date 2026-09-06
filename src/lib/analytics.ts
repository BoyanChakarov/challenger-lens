import type {
  ChampionStat,
  ConfidenceLabel,
  DashboardFilters,
  DatasetStatus,
  ItemBuildStat,
  MatchupStat,
  RegionFilter,
} from "../types";

export interface ChampionRollup extends Omit<ChampionStat, "id" | "region"> {
  id: string;
  region: RegionFilter;
}

export interface MatchupInsight extends Omit<MatchupStat, "id" | "region"> {
  id: string;
  region: RegionFilter;
}

export interface DatasetSummary {
  matches: number;
  players: number;
  participants: number;
  coveragePct: number;
  updatedAt?: string;
}

const safeDivide = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function wilsonInterval(
  wins: number,
  games: number,
  z = 1.96,
): { low: number; high: number } {
  if (games <= 0) return { low: 0, high: 0 };

  const proportion = clamp(wins / games, 0, 1);
  const zSquared = z * z;
  const denominator = 1 + zSquared / games;
  const centre = proportion + zSquared / (2 * games);
  const spread =
    z *
    Math.sqrt(
      (proportion * (1 - proportion)) / games +
        zSquared / (4 * games * games),
    );

  return {
    low: clamp((centre - spread) / denominator, 0, 1),
    high: clamp((centre + spread) / denominator, 0, 1),
  };
}

export function adjustedWinRate(
  wins: number,
  games: number,
  baseline = 0.5,
  priorGames = 20,
): number {
  if (games <= 0) return clamp(baseline, 0, 1);
  return clamp(
    (wins + clamp(baseline, 0, 1) * priorGames) / (games + priorGames),
    0,
    1,
  );
}

export function confidenceFromScore(score: number): ConfidenceLabel {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  return "Low";
}

export function calculateEvidenceScore(input: {
  games: number;
  uniquePlayers: number;
  topPlayerShare: number;
  wilsonLow: number;
  wilsonHigh: number;
  winRateLift: number;
  avgGoldDiff15: number;
  avgCsDiff15: number;
  kdaDiff: number;
}): number {
  const sample = clamp(Math.log2(Math.max(input.games, 1)) / 8, 0, 1);
  const playerBreadth = clamp(input.uniquePlayers / 45, 0, 1);
  const concentration = 1 - clamp(input.topPlayerShare, 0, 1);
  const precision = 1 - clamp(input.wilsonHigh - input.wilsonLow, 0, 0.45) / 0.45;
  const direction = Math.sign(input.winRateLift);
  const directionalAgreement =
    direction === 0
      ? 0.5
      : [input.avgGoldDiff15, input.avgCsDiff15, input.kdaDiff].filter(
          (signal) => Math.sign(signal) === direction,
        ).length / 3;

  return Math.round(
    clamp(
      100 *
        (sample * 0.28 +
          playerBreadth * 0.2 +
          concentration * 0.16 +
          precision * 0.22 +
          directionalAgreement * 0.14),
      0,
      100,
    ),
  );
}

function includesQuery(values: Array<string | undefined>, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return values.some((value) => value?.toLocaleLowerCase().includes(normalized));
}

function matchesCommonFilter(
  row: { patch: string; region: string; role?: string },
  filters: DashboardFilters,
): boolean {
  return (
    row.patch === filters.patch &&
    (filters.region === "ALL" || row.region === filters.region) &&
    (filters.role === "ALL" || row.role === undefined || row.role === filters.role)
  );
}

function weightedAverage<T>(
  rows: T[],
  value: (row: T) => number,
  weight: (row: T) => number,
): number {
  const totalWeight = rows.reduce((sum, row) => sum + Math.max(weight(row), 0), 0);
  if (totalWeight === 0) return 0;
  return rows.reduce(
    (sum, row) => sum + value(row) * Math.max(weight(row), 0),
    0,
  ) / totalWeight;
}

export function getChampionRollups(
  rows: ChampionStat[],
  filters: DashboardFilters,
): ChampionRollup[] {
  const filtered = rows.filter(
    (row) =>
      matchesCommonFilter(row, filters) &&
      includesQuery([row.championName], filters.query),
  );
  const grouped = new Map<string, ChampionStat[]>();

  for (const row of filtered) {
    const key = `${row.patch}:${row.role}:${row.championId}`;
    const existing = grouped.get(key);
    if (existing) existing.push(row);
    else grouped.set(key, [row]);
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const first = group[0];
      if (!first) throw new Error("Champion rollup cannot be empty");
      const games = group.reduce((sum, row) => sum + row.games, 0);
      const wins = group.reduce((sum, row) => sum + row.wins, 0);

      return {
        ...first,
        id: key,
        region: filters.region,
        games,
        wins,
        winRate: safeDivide(wins, games),
        pickRate: weightedAverage(group, (row) => row.pickRate, (row) => row.games),
        avgKda: weightedAverage(group, (row) => row.avgKda, (row) => row.games),
        avgCsPerMinute: weightedAverage(
          group,
          (row) => row.avgCsPerMinute,
          (row) => row.games,
        ),
        avgGoldPerMinute: weightedAverage(
          group,
          (row) => row.avgGoldPerMinute,
          (row) => row.games,
        ),
        avgDamagePerMinute: weightedAverage(
          group,
          (row) => row.avgDamagePerMinute,
          (row) => row.games,
        ),
        avgGoldDiff15: weightedAverage(
          group,
          (row) => row.avgGoldDiff15,
          (row) => row.games,
        ),
        avgCsDiff15: weightedAverage(
          group,
          (row) => row.avgCsDiff15,
          (row) => row.games,
        ),
        uniquePlayers: group.reduce((sum, row) => sum + row.uniquePlayers, 0),
      } satisfies ChampionRollup;
    })
    .filter((row) => row.games >= filters.minGames);
}

export function getMatchupInsights(
  rows: MatchupStat[],
  filters: DashboardFilters,
): MatchupInsight[] {
  const filtered = rows.filter((row) => matchesCommonFilter(row, filters));
  const grouped = new Map<string, MatchupStat[]>();

  for (const row of filtered) {
    const key = `${row.patch}:${row.role}:${row.championId}:${row.opponentId}`;
    const existing = grouped.get(key);
    if (existing) existing.push(row);
    else grouped.set(key, [row]);
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const first = group[0];
      if (!first) throw new Error("Matchup rollup cannot be empty");
      const games = group.reduce((sum, row) => sum + row.games, 0);
      const wins = group.reduce((sum, row) => sum + row.wins, 0);
      const rawWinRate = safeDivide(wins, games);
      const baselineWinRate = weightedAverage(
        group,
        (row) => row.baselineWinRate,
        (row) => row.games,
      );
      const adjusted = weightedAverage(
        group,
        (row) => row.adjustedWinRate,
        (row) => row.games,
      );
      const interval = wilsonInterval(wins, games);
      const avgGoldDiff15 = weightedAverage(
        group,
        (row) => row.avgGoldDiff15,
        (row) => row.games,
      );
      const avgCsDiff15 = weightedAverage(
        group,
        (row) => row.avgCsDiff15,
        (row) => row.games,
      );
      const kdaDiff = weightedAverage(group, (row) => row.kdaDiff, (row) => row.games);
      const uniquePlayers = group.reduce((sum, row) => sum + row.uniquePlayers, 0);
      const topPlayerShare = weightedAverage(
        group,
        (row) => row.topPlayerShare,
        (row) => row.games,
      );
      const evidenceScore = calculateEvidenceScore({
        games,
        uniquePlayers,
        topPlayerShare,
        wilsonLow: interval.low,
        wilsonHigh: interval.high,
        winRateLift: adjusted - baselineWinRate,
        avgGoldDiff15,
        avgCsDiff15,
        kdaDiff,
      });

      return {
        ...first,
        id: key,
        region: filters.region,
        games,
        wins,
        rawWinRate,
        adjustedWinRate: adjusted,
        baselineWinRate,
        winRateLift: adjusted - baselineWinRate,
        wilsonLow: interval.low,
        wilsonHigh: interval.high,
        avgGoldDiff15,
        medianGoldDiff15: weightedAverage(
          group,
          (row) => row.medianGoldDiff15,
          (row) => row.games,
        ),
        avgCsDiff15,
        avgXpDiff15: weightedAverage(
          group,
          (row) => row.avgXpDiff15,
          (row) => row.games,
        ),
        earlyGameSampleSize: group.reduce((sum, row) => sum + row.earlyGameSampleSize, 0),
        kdaDiff,
        uniquePlayers,
        topPlayerShare,
        evidenceScore,
        confidenceLabel: confidenceFromScore(evidenceScore),
      } satisfies MatchupInsight;
    })
    .filter(
      (row) =>
        row.games >= filters.minGames &&
        includesQuery([row.championName, row.opponentName], filters.query),
    )
    .sort(
      (left, right) =>
        right.evidenceScore - left.evidenceScore ||
        right.winRateLift - left.winRateLift ||
        right.games - left.games,
    );
}

export function getItemBuilds(
  rows: ItemBuildStat[],
  filters: DashboardFilters,
): ItemBuildStat[] {
  return rows
    .filter(
      (row) =>
        matchesCommonFilter(row, filters) &&
        row.games >= filters.minGames &&
        includesQuery(
          [row.championName, row.opponentName, row.buildLabel, ...row.itemNames],
          filters.query,
        ),
    )
    .sort(
      (left, right) =>
        right.games * Math.max(right.winRate - 0.5, 0.01) -
        left.games * Math.max(left.winRate - 0.5, 0.01),
    );
}

export function summarizeDataset(
  rows: DatasetStatus[],
  filters: Pick<DashboardFilters, "patch" | "region">,
): DatasetSummary {
  const relevant = rows.filter(
    (row) =>
      row.patch === filters.patch &&
      (filters.region === "ALL" || row.region === filters.region),
  );
  const matches = relevant.reduce((sum, row) => sum + row.matchCount, 0);
  const coverageWeights = relevant.reduce((sum, row) => sum + row.playerCount, 0);
  const dates = relevant
    .map((row) => Date.parse(row.lastUpdated))
    .filter((date) => Number.isFinite(date));

  return {
    matches,
    players: relevant.reduce((sum, row) => sum + row.playerCount, 0),
    participants: relevant.reduce((sum, row) => sum + row.participantCount, 0),
    coveragePct:
      coverageWeights > 0
        ? relevant.reduce(
            (sum, row) => sum + (row.coveragePct ?? 0) * row.playerCount,
            0,
          ) / coverageWeights
        : 0,
    updatedAt: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : undefined,
  };
}

export function describeSignal(matchup: MatchupInsight): string {
  const positives = [
    matchup.winRateLift > 0.02 ? "win rate" : undefined,
    matchup.avgGoldDiff15 > 80 ? "early gold" : undefined,
    matchup.avgCsDiff15 > 2 ? "lane CS" : undefined,
    matchup.kdaDiff > 0.2 ? "KDA" : undefined,
  ].filter((value): value is string => Boolean(value));
  const negatives = [
    matchup.avgGoldDiff15 < -80 ? "early gold" : undefined,
    matchup.avgCsDiff15 < -2 ? "lane CS" : undefined,
    matchup.kdaDiff < -0.2 ? "KDA" : undefined,
  ].filter((value): value is string => Boolean(value));

  if (positives.length >= 2 && negatives.length === 0) {
    return `${joinWords(positives)} point in the same direction.`;
  }
  if (positives.length > 0 && negatives.length > 0) {
    return `${joinWords(positives)} are positive; ${joinWords(negatives)} push back.`;
  }
  if (matchup.winRateLift < 0) {
    return "The adjusted result trails the champion's role baseline.";
  }
  return "The signal is mixed; treat it as a scouting lead, not a conclusion.";
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "The indicators";
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, and ${words.at(-1)}`;
}

export const formatPercent = (value: number, digits = 1): string =>
  `${(value * 100).toFixed(digits)}%`;

export const formatSigned = (
  value: number,
  digits = 0,
  suffix = "",
): string => `${value > 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;

export const formatCompactNumber = (value: number): string =>
  new Intl.NumberFormat("en", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
