export type Region = "EUW" | "EUNE";

export type Role = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";

export type RegionFilter = Region | "ALL";

export type RoleFilter = Role | "ALL";

export type ConfidenceLabel = "High" | "Medium" | "Low";

export interface DashboardFilters {
  patch: string;
  region: RegionFilter;
  role: RoleFilter;
  minGames: number;
  query: string;
}

export interface DatasetStatus {
  id: string;
  patch: string;
  region: Region;
  queue: string;
  playerCount: number;
  matchCount: number;
  participantCount: number;
  lastUpdated: string;
  windowStart?: string;
  windowEnd?: string;
  coveragePct?: number;
  dataProvenance: "live" | "synthetic";
}

export interface ChampionStat {
  id: string;
  patch: string;
  region: Region;
  role: Role;
  championId: number;
  championName: string;
  games: number;
  wins: number;
  winRate: number;
  pickRate: number;
  avgKda: number;
  avgCsPerMinute: number;
  avgGoldPerMinute: number;
  avgDamagePerMinute: number;
  avgGoldDiff15: number;
  avgCsDiff15: number;
  uniquePlayers: number;
}

export interface MatchupStat {
  id: string;
  patch: string;
  region: Region;
  role: Role;
  championId: number;
  championName: string;
  opponentId: number;
  opponentName: string;
  games: number;
  wins: number;
  rawWinRate: number;
  adjustedWinRate: number;
  baselineWinRate: number;
  winRateLift: number;
  wilsonLow: number;
  wilsonHigh: number;
  avgGoldDiff15: number;
  medianGoldDiff15: number;
  avgCsDiff15: number;
  avgXpDiff15: number;
  earlyGameSampleSize: number;
  kdaDiff: number;
  uniquePlayers: number;
  topPlayerShare: number;
  evidenceScore: number;
  confidenceLabel: ConfidenceLabel;
}

export interface ItemBuildStat {
  id: string;
  patch: string;
  region: Region;
  role: Role;
  championId: number;
  championName: string;
  opponentId?: number;
  opponentName?: string;
  buildLabel: string;
  itemNames: string[];
  firstItem?: string;
  boots?: string;
  games: number;
  wins: number;
  winRate: number;
  pickRate: number;
  avgCompletionMinutes?: number;
}

export interface DashboardData {
  status: DatasetStatus[];
  champions: ChampionStat[];
  matchups: MatchupStat[];
  itemBuilds: ItemBuildStat[];
}

export type DataMode = "live" | "demo";

export interface DashboardLoadResult {
  data: DashboardData;
  mode: DataMode;
  message: string;
}
