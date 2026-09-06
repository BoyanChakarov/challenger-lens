import type {
  ChampionStat,
  DashboardData,
  DatasetStatus,
  ItemBuildStat,
  MatchupStat,
  Region,
  Role,
} from "../types";

const CURRENT_PATCH = "26.17";
const PREVIOUS_PATCH = "26.16";

const status: DatasetStatus[] = [
  {
    id: "26.17-euw",
    patch: CURRENT_PATCH,
    region: "EUW",
    queue: "Ranked Solo / Challenger",
    playerCount: 300,
    matchCount: 4_826,
    participantCount: 48_260,
    lastUpdated: "2026-09-05T08:42:00.000Z",
    windowStart: "2026-08-26T00:00:00.000Z",
    windowEnd: "2026-09-05T08:42:00.000Z",
    coveragePct: 94,
    dataProvenance: "synthetic",
  },
  {
    id: "26.17-eune",
    patch: CURRENT_PATCH,
    region: "EUNE",
    queue: "Ranked Solo / Challenger",
    playerCount: 283,
    matchCount: 3_114,
    participantCount: 31_140,
    lastUpdated: "2026-09-05T08:35:00.000Z",
    windowStart: "2026-08-26T00:00:00.000Z",
    windowEnd: "2026-09-05T08:35:00.000Z",
    coveragePct: 91,
    dataProvenance: "synthetic",
  },
  {
    id: "26.16-euw",
    patch: PREVIOUS_PATCH,
    region: "EUW",
    queue: "Ranked Solo / Challenger",
    playerCount: 300,
    matchCount: 7_308,
    participantCount: 73_080,
    lastUpdated: "2026-08-26T02:10:00.000Z",
    coveragePct: 98,
    dataProvenance: "synthetic",
  },
  {
    id: "26.16-eune",
    patch: PREVIOUS_PATCH,
    region: "EUNE",
    queue: "Ranked Solo / Challenger",
    playerCount: 289,
    matchCount: 4_972,
    participantCount: 49_720,
    lastUpdated: "2026-08-26T02:04:00.000Z",
    coveragePct: 97,
    dataProvenance: "synthetic",
  },
];

type ChampionSeed = Omit<ChampionStat, "id" | "patch" | "wins"> & {
  wins?: number;
};

const champion = (seed: ChampionSeed, patch = CURRENT_PATCH): ChampionStat => ({
  ...seed,
  id: `${patch}-${seed.region}-${seed.role}-${seed.championId}`,
  patch,
  wins: seed.wins ?? Math.round(seed.games * seed.winRate),
});

const champions: ChampionStat[] = [
  champion({ region: "EUW", role: "MID", championId: 38, championName: "Kassadin", games: 186, winRate: 0.554, pickRate: 0.082, avgKda: 3.31, avgCsPerMinute: 8.2, avgGoldPerMinute: 447, avgDamagePerMinute: 651, avgGoldDiff15: 82, avgCsDiff15: -0.6, uniquePlayers: 57 }),
  champion({ region: "EUNE", role: "MID", championId: 38, championName: "Kassadin", games: 121, winRate: 0.545, pickRate: 0.074, avgKda: 3.18, avgCsPerMinute: 8.0, avgGoldPerMinute: 441, avgDamagePerMinute: 636, avgGoldDiff15: 68, avgCsDiff15: -0.9, uniquePlayers: 39 }),
  champion({ region: "EUW", role: "MID", championId: 61, championName: "Orianna", games: 328, winRate: 0.526, pickRate: 0.141, avgKda: 3.02, avgCsPerMinute: 8.8, avgGoldPerMinute: 429, avgDamagePerMinute: 704, avgGoldDiff15: 113, avgCsDiff15: 2.8, uniquePlayers: 94 }),
  champion({ region: "EUNE", role: "MID", championId: 61, championName: "Orianna", games: 194, winRate: 0.515, pickRate: 0.126, avgKda: 2.91, avgCsPerMinute: 8.6, avgGoldPerMinute: 423, avgDamagePerMinute: 688, avgGoldDiff15: 91, avgCsDiff15: 2.1, uniquePlayers: 58 }),
  champion({ region: "EUW", role: "MID", championId: 163, championName: "Taliyah", games: 243, winRate: 0.539, pickRate: 0.104, avgKda: 3.17, avgCsPerMinute: 8.5, avgGoldPerMinute: 438, avgDamagePerMinute: 732, avgGoldDiff15: 104, avgCsDiff15: 1.7, uniquePlayers: 66 }),
  champion({ region: "EUNE", role: "MID", championId: 163, championName: "Taliyah", games: 137, winRate: 0.533, pickRate: 0.089, avgKda: 3.06, avgCsPerMinute: 8.3, avgGoldPerMinute: 432, avgDamagePerMinute: 715, avgGoldDiff15: 86, avgCsDiff15: 1.2, uniquePlayers: 44 }),
  champion({ region: "EUW", role: "MID", championId: 134, championName: "Syndra", games: 361, winRate: 0.497, pickRate: 0.155, avgKda: 2.62, avgCsPerMinute: 8.7, avgGoldPerMinute: 425, avgDamagePerMinute: 748, avgGoldDiff15: 72, avgCsDiff15: 2.4, uniquePlayers: 102 }),
  champion({ region: "EUNE", role: "MID", championId: 134, championName: "Syndra", games: 211, winRate: 0.493, pickRate: 0.137, avgKda: 2.57, avgCsPerMinute: 8.5, avgGoldPerMinute: 419, avgDamagePerMinute: 731, avgGoldDiff15: 55, avgCsDiff15: 1.9, uniquePlayers: 63 }),
  champion({ region: "EUW", role: "MID", championId: 103, championName: "Ahri", games: 421, winRate: 0.519, pickRate: 0.181, avgKda: 3.42, avgCsPerMinute: 8.1, avgGoldPerMinute: 417, avgDamagePerMinute: 634, avgGoldDiff15: 38, avgCsDiff15: 0.4, uniquePlayers: 128 }),
  champion({ region: "EUNE", role: "MID", championId: 103, championName: "Ahri", games: 248, winRate: 0.512, pickRate: 0.161, avgKda: 3.29, avgCsPerMinute: 7.9, avgGoldPerMinute: 411, avgDamagePerMinute: 621, avgGoldDiff15: 24, avgCsDiff15: 0.1, uniquePlayers: 76 }),
  champion({ region: "EUW", role: "TOP", championId: 58, championName: "Renekton", games: 384, winRate: 0.524, pickRate: 0.134, avgKda: 2.38, avgCsPerMinute: 8.4, avgGoldPerMinute: 438, avgDamagePerMinute: 622, avgGoldDiff15: 176, avgCsDiff15: 3.7, uniquePlayers: 109 }),
  champion({ region: "EUNE", role: "TOP", championId: 58, championName: "Renekton", games: 226, winRate: 0.518, pickRate: 0.121, avgKda: 2.31, avgCsPerMinute: 8.2, avgGoldPerMinute: 431, avgDamagePerMinute: 608, avgGoldDiff15: 149, avgCsDiff15: 3.0, uniquePlayers: 71 }),
  champion({ region: "EUW", role: "JUNGLE", championId: 78, championName: "Poppy", games: 276, winRate: 0.548, pickRate: 0.112, avgKda: 3.64, avgCsPerMinute: 6.3, avgGoldPerMinute: 397, avgDamagePerMinute: 468, avgGoldDiff15: 96, avgCsDiff15: 1.1, uniquePlayers: 82 }),
  champion({ region: "EUNE", role: "JUNGLE", championId: 78, championName: "Poppy", games: 152, winRate: 0.536, pickRate: 0.096, avgKda: 3.48, avgCsPerMinute: 6.2, avgGoldPerMinute: 391, avgDamagePerMinute: 451, avgGoldDiff15: 73, avgCsDiff15: 0.7, uniquePlayers: 49 }),
  champion({ region: "EUW", role: "ADC", championId: 222, championName: "Jinx", games: 404, winRate: 0.531, pickRate: 0.173, avgKda: 3.21, avgCsPerMinute: 9.3, avgGoldPerMinute: 472, avgDamagePerMinute: 681, avgGoldDiff15: 78, avgCsDiff15: 1.8, uniquePlayers: 117 }),
  champion({ region: "EUNE", role: "ADC", championId: 222, championName: "Jinx", games: 236, winRate: 0.523, pickRate: 0.158, avgKda: 3.08, avgCsPerMinute: 9.1, avgGoldPerMinute: 465, avgDamagePerMinute: 665, avgGoldDiff15: 61, avgCsDiff15: 1.2, uniquePlayers: 69 }),
  champion({ region: "EUW", role: "SUPPORT", championId: 526, championName: "Rell", games: 337, winRate: 0.541, pickRate: 0.144, avgKda: 3.89, avgCsPerMinute: 1.1, avgGoldPerMinute: 276, avgDamagePerMinute: 271, avgGoldDiff15: 34, avgCsDiff15: 0.2, uniquePlayers: 98 }),
  champion({ region: "EUNE", role: "SUPPORT", championId: 526, championName: "Rell", games: 183, winRate: 0.529, pickRate: 0.119, avgKda: 3.71, avgCsPerMinute: 1.1, avgGoldPerMinute: 270, avgDamagePerMinute: 259, avgGoldDiff15: 21, avgCsDiff15: 0.1, uniquePlayers: 56 }),
  champion({ region: "EUW", role: "TOP", championId: 164, championName: "Camille", games: 292, winRate: 0.516, pickRate: 0.102, avgKda: 2.54, avgCsPerMinute: 8.2, avgGoldPerMinute: 446, avgDamagePerMinute: 655, avgGoldDiff15: 47, avgCsDiff15: 0.8, uniquePlayers: 85 }),
  champion({ region: "EUW", role: "JUNGLE", championId: 64, championName: "Lee Sin", games: 496, winRate: 0.501, pickRate: 0.201, avgKda: 3.06, avgCsPerMinute: 6.5, avgGoldPerMinute: 408, avgDamagePerMinute: 512, avgGoldDiff15: 64, avgCsDiff15: 0.9, uniquePlayers: 143 }),
  champion({ region: "EUW", role: "ADC", championId: 145, championName: "Kai'Sa", games: 469, winRate: 0.508, pickRate: 0.19, avgKda: 3.01, avgCsPerMinute: 9.0, avgGoldPerMinute: 459, avgDamagePerMinute: 703, avgGoldDiff15: 31, avgCsDiff15: 0.4, uniquePlayers: 139 }),
  champion({ region: "EUW", role: "SUPPORT", championId: 111, championName: "Nautilus", games: 352, winRate: 0.503, pickRate: 0.151, avgKda: 3.11, avgCsPerMinute: 1.2, avgGoldPerMinute: 268, avgDamagePerMinute: 286, avgGoldDiff15: -12, avgCsDiff15: 0, uniquePlayers: 101 }),
  champion({ region: "EUW", role: "MID", championId: 38, championName: "Kassadin", games: 278, winRate: 0.536, pickRate: 0.077, avgKda: 3.16, avgCsPerMinute: 8.1, avgGoldPerMinute: 441, avgDamagePerMinute: 638, avgGoldDiff15: 54, avgCsDiff15: -0.8, uniquePlayers: 76 }, PREVIOUS_PATCH),
  champion({ region: "EUNE", role: "MID", championId: 61, championName: "Orianna", games: 281, winRate: 0.508, pickRate: 0.121, avgKda: 2.87, avgCsPerMinute: 8.5, avgGoldPerMinute: 420, avgDamagePerMinute: 679, avgGoldDiff15: 77, avgCsDiff15: 1.8, uniquePlayers: 81 }, PREVIOUS_PATCH),
];

type MatchupSeed = Omit<MatchupStat, "id" | "patch" | "wins" | "earlyGameSampleSize"> & {
  wins?: number;
  earlyGameSampleSize?: number;
};

const matchup = (seed: MatchupSeed, patch = CURRENT_PATCH): MatchupStat => ({
  ...seed,
  id: `${patch}-${seed.region}-${seed.role}-${seed.championId}-${seed.opponentId}`,
  patch,
  wins: seed.wins ?? Math.round(seed.games * seed.rawWinRate),
  earlyGameSampleSize: seed.earlyGameSampleSize ?? seed.games,
});

const matchups: MatchupStat[] = [
  matchup({ region: "EUW", role: "MID", championId: 38, championName: "Kassadin", opponentId: 134, opponentName: "Syndra", games: 72, rawWinRate: 0.611, adjustedWinRate: 0.584, baselineWinRate: 0.514, winRateLift: 0.07, wilsonLow: 0.497, wilsonHigh: 0.716, avgGoldDiff15: 210, medianGoldDiff15: 184, avgCsDiff15: -1.2, avgXpDiff15: 103, kdaDiff: 0.38, uniquePlayers: 29, topPlayerShare: 0.12, evidenceScore: 87, confidenceLabel: "High" }),
  matchup({ region: "EUNE", role: "MID", championId: 38, championName: "Kassadin", opponentId: 134, opponentName: "Syndra", games: 43, rawWinRate: 0.581, adjustedWinRate: 0.56, baselineWinRate: 0.507, winRateLift: 0.053, wilsonLow: 0.433, wilsonHigh: 0.714, avgGoldDiff15: 146, medianGoldDiff15: 121, avgCsDiff15: -1.8, avgXpDiff15: 81, kdaDiff: 0.27, uniquePlayers: 19, topPlayerShare: 0.16, evidenceScore: 72, confidenceLabel: "Medium" }),
  matchup({ region: "EUW", role: "MID", championId: 163, championName: "Taliyah", opponentId: 517, opponentName: "Sylas", games: 94, rawWinRate: 0.574, adjustedWinRate: 0.556, baselineWinRate: 0.511, winRateLift: 0.045, wilsonLow: 0.473, wilsonHigh: 0.67, avgGoldDiff15: 190, medianGoldDiff15: 173, avgCsDiff15: 4.6, avgXpDiff15: 117, kdaDiff: 0.29, uniquePlayers: 37, topPlayerShare: 0.1, evidenceScore: 84, confidenceLabel: "High" }),
  matchup({ region: "EUNE", role: "MID", championId: 163, championName: "Taliyah", opponentId: 517, opponentName: "Sylas", games: 48, rawWinRate: 0.563, adjustedWinRate: 0.545, baselineWinRate: 0.506, winRateLift: 0.039, wilsonLow: 0.422, wilsonHigh: 0.69, avgGoldDiff15: 152, medianGoldDiff15: 138, avgCsDiff15: 3.8, avgXpDiff15: 91, kdaDiff: 0.22, uniquePlayers: 21, topPlayerShare: 0.15, evidenceScore: 69, confidenceLabel: "Medium" }),
  matchup({ region: "EUW", role: "MID", championId: 61, championName: "Orianna", opponentId: 7, opponentName: "LeBlanc", games: 81, rawWinRate: 0.568, adjustedWinRate: 0.549, baselineWinRate: 0.503, winRateLift: 0.046, wilsonLow: 0.459, wilsonHigh: 0.669, avgGoldDiff15: 164, medianGoldDiff15: 142, avgCsDiff15: 5.1, avgXpDiff15: 95, kdaDiff: 0.18, uniquePlayers: 34, topPlayerShare: 0.11, evidenceScore: 81, confidenceLabel: "High" }),
  matchup({ region: "EUNE", role: "MID", championId: 103, championName: "Ahri", opponentId: 91, opponentName: "Talon", games: 52, rawWinRate: 0.558, adjustedWinRate: 0.541, baselineWinRate: 0.505, winRateLift: 0.036, wilsonLow: 0.423, wilsonHigh: 0.684, avgGoldDiff15: 72, medianGoldDiff15: 64, avgCsDiff15: 2.7, avgXpDiff15: 42, kdaDiff: 0.31, uniquePlayers: 23, topPlayerShare: 0.14, evidenceScore: 68, confidenceLabel: "Medium" }),
  matchup({ region: "EUW", role: "TOP", championId: 58, championName: "Renekton", opponentId: 164, opponentName: "Camille", games: 112, rawWinRate: 0.589, adjustedWinRate: 0.566, baselineWinRate: 0.508, winRateLift: 0.058, wilsonLow: 0.497, wilsonHigh: 0.675, avgGoldDiff15: 286, medianGoldDiff15: 249, avgCsDiff15: 6.3, avgXpDiff15: 148, kdaDiff: 0.42, uniquePlayers: 46, topPlayerShare: 0.09, evidenceScore: 91, confidenceLabel: "High" }),
  matchup({ region: "EUNE", role: "TOP", championId: 58, championName: "Renekton", opponentId: 164, opponentName: "Camille", games: 66, rawWinRate: 0.561, adjustedWinRate: 0.545, baselineWinRate: 0.501, winRateLift: 0.044, wilsonLow: 0.441, wilsonHigh: 0.674, avgGoldDiff15: 211, medianGoldDiff15: 188, avgCsDiff15: 4.9, avgXpDiff15: 117, kdaDiff: 0.31, uniquePlayers: 27, topPlayerShare: 0.13, evidenceScore: 76, confidenceLabel: "Medium" }),
  matchup({ region: "EUW", role: "JUNGLE", championId: 78, championName: "Poppy", opponentId: 59, opponentName: "Jarvan IV", games: 103, rawWinRate: 0.592, adjustedWinRate: 0.568, baselineWinRate: 0.516, winRateLift: 0.052, wilsonLow: 0.496, wilsonHigh: 0.681, avgGoldDiff15: 138, medianGoldDiff15: 119, avgCsDiff15: 2.1, avgXpDiff15: 74, kdaDiff: 0.47, uniquePlayers: 41, topPlayerShare: 0.1, evidenceScore: 88, confidenceLabel: "High" }),
  matchup({ region: "EUNE", role: "JUNGLE", championId: 78, championName: "Poppy", opponentId: 59, opponentName: "Jarvan IV", games: 57, rawWinRate: 0.561, adjustedWinRate: 0.546, baselineWinRate: 0.509, winRateLift: 0.037, wilsonLow: 0.432, wilsonHigh: 0.681, avgGoldDiff15: 101, medianGoldDiff15: 88, avgCsDiff15: 1.4, avgXpDiff15: 55, kdaDiff: 0.34, uniquePlayers: 24, topPlayerShare: 0.14, evidenceScore: 71, confidenceLabel: "Medium" }),
  matchup({ region: "EUW", role: "ADC", championId: 222, championName: "Jinx", opponentId: 145, opponentName: "Kai'Sa", games: 126, rawWinRate: 0.563, adjustedWinRate: 0.547, baselineWinRate: 0.506, winRateLift: 0.041, wilsonLow: 0.476, wilsonHigh: 0.646, avgGoldDiff15: 167, medianGoldDiff15: 139, avgCsDiff15: 3.9, avgXpDiff15: 36, kdaDiff: 0.34, uniquePlayers: 52, topPlayerShare: 0.08, evidenceScore: 86, confidenceLabel: "High" }),
  matchup({ region: "EUNE", role: "ADC", championId: 222, championName: "Jinx", opponentId: 145, opponentName: "Kai'Sa", games: 71, rawWinRate: 0.549, adjustedWinRate: 0.536, baselineWinRate: 0.501, winRateLift: 0.035, wilsonLow: 0.434, wilsonHigh: 0.66, avgGoldDiff15: 119, medianGoldDiff15: 102, avgCsDiff15: 2.8, avgXpDiff15: 24, kdaDiff: 0.26, uniquePlayers: 31, topPlayerShare: 0.12, evidenceScore: 73, confidenceLabel: "Medium" }),
  matchup({ region: "EUW", role: "SUPPORT", championId: 526, championName: "Rell", opponentId: 111, opponentName: "Nautilus", games: 108, rawWinRate: 0.574, adjustedWinRate: 0.555, baselineWinRate: 0.511, winRateLift: 0.044, wilsonLow: 0.48, wilsonHigh: 0.663, avgGoldDiff15: 76, medianGoldDiff15: 64, avgCsDiff15: 0.2, avgXpDiff15: 63, kdaDiff: 0.51, uniquePlayers: 45, topPlayerShare: 0.09, evidenceScore: 85, confidenceLabel: "High" }),
  matchup({ region: "EUW", role: "MID", championId: 134, championName: "Syndra", opponentId: 38, opponentName: "Kassadin", games: 72, rawWinRate: 0.389, adjustedWinRate: 0.416, baselineWinRate: 0.486, winRateLift: -0.07, wilsonLow: 0.284, wilsonHigh: 0.503, avgGoldDiff15: -210, medianGoldDiff15: -184, avgCsDiff15: 1.2, avgXpDiff15: -103, kdaDiff: -0.38, uniquePlayers: 31, topPlayerShare: 0.11, evidenceScore: 83, confidenceLabel: "High" }),
  matchup({ region: "EUW", role: "MID", championId: 103, championName: "Ahri", opponentId: 61, opponentName: "Orianna", games: 64, rawWinRate: 0.516, adjustedWinRate: 0.512, baselineWinRate: 0.506, winRateLift: 0.006, wilsonLow: 0.397, wilsonHigh: 0.633, avgGoldDiff15: -18, medianGoldDiff15: -14, avgCsDiff15: -1.1, avgXpDiff15: 9, kdaDiff: 0.08, uniquePlayers: 27, topPlayerShare: 0.13, evidenceScore: 51, confidenceLabel: "Low" }),
  matchup({ region: "EUW", role: "MID", championId: 38, championName: "Kassadin", opponentId: 134, opponentName: "Syndra", games: 109, rawWinRate: 0.569, adjustedWinRate: 0.552, baselineWinRate: 0.505, winRateLift: 0.047, wilsonLow: 0.475, wilsonHigh: 0.658, avgGoldDiff15: 132, medianGoldDiff15: 111, avgCsDiff15: -1.5, avgXpDiff15: 69, kdaDiff: 0.24, uniquePlayers: 41, topPlayerShare: 0.1, evidenceScore: 79, confidenceLabel: "High" }, PREVIOUS_PATCH),
];

type BuildSeed = Omit<ItemBuildStat, "id" | "patch" | "wins"> & { wins?: number };

const build = (seed: BuildSeed, patch = CURRENT_PATCH): ItemBuildStat => ({
  ...seed,
  id: `${patch}-${seed.region}-${seed.role}-${seed.championId}-${seed.opponentId ?? "all"}-${seed.buildLabel}`,
  patch,
  wins: seed.wins ?? Math.round(seed.games * seed.winRate),
});

const itemBuilds: ItemBuildStat[] = [
  build({ region: "EUW", role: "MID", championId: 38, championName: "Kassadin", opponentId: 134, opponentName: "Syndra", buildLabel: "Scaling into stasis", itemNames: ["Rod of Ages", "Archangel's Staff", "Zhonya's Hourglass"], firstItem: "Rod of Ages", boots: "Mercury's Treads", games: 44, winRate: 0.614, pickRate: 0.611, avgCompletionMinutes: 27.8 }),
  build({ region: "EUNE", role: "MID", championId: 38, championName: "Kassadin", opponentId: 134, opponentName: "Syndra", buildLabel: "Early spell shield", itemNames: ["Rod of Ages", "Archangel's Staff", "Banshee's Veil"], firstItem: "Rod of Ages", boots: "Mercury's Treads", games: 26, winRate: 0.577, pickRate: 0.605, avgCompletionMinutes: 28.4 }),
  build({ region: "EUW", role: "MID", championId: 163, championName: "Taliyah", opponentId: 517, opponentName: "Sylas", buildLabel: "Tempo control", itemNames: ["Blackfire Torch", "Liandry's Torment", "Zhonya's Hourglass"], firstItem: "Blackfire Torch", boots: "Sorcerer's Shoes", games: 51, winRate: 0.608, pickRate: 0.543, avgCompletionMinutes: 26.2 }),
  build({ region: "EUW", role: "MID", championId: 61, championName: "Orianna", opponentId: 7, opponentName: "LeBlanc", buildLabel: "Safe burst", itemNames: ["Luden's Companion", "Archangel's Staff", "Banshee's Veil"], firstItem: "Luden's Companion", boots: "Sorcerer's Shoes", games: 39, winRate: 0.59, pickRate: 0.481, avgCompletionMinutes: 27.1 }),
  build({ region: "EUNE", role: "MID", championId: 103, championName: "Ahri", opponentId: 91, opponentName: "Talon", buildLabel: "Catch and kite", itemNames: ["Malignance", "Horizon Focus", "Zhonya's Hourglass"], firstItem: "Malignance", boots: "Ionian Boots of Lucidity", games: 31, winRate: 0.581, pickRate: 0.596, avgCompletionMinutes: 26.9 }),
  build({ region: "EUW", role: "TOP", championId: 58, championName: "Renekton", opponentId: 164, opponentName: "Camille", buildLabel: "Side-lane pressure", itemNames: ["Eclipse", "Black Cleaver", "Sterak's Gage"], firstItem: "Eclipse", boots: "Plated Steelcaps", games: 67, winRate: 0.612, pickRate: 0.598, avgCompletionMinutes: 25.6 }),
  build({ region: "EUW", role: "JUNGLE", championId: 78, championName: "Poppy", opponentId: 59, opponentName: "Jarvan IV", buildLabel: "Frontline utility", itemNames: ["Sundered Sky", "Dead Man's Plate", "Kaenic Rookern"], firstItem: "Sundered Sky", boots: "Plated Steelcaps", games: 58, winRate: 0.621, pickRate: 0.563, avgCompletionMinutes: 26.4 }),
  build({ region: "EUW", role: "ADC", championId: 222, championName: "Jinx", opponentId: 145, opponentName: "Kai'Sa", buildLabel: "Front-to-back crit", itemNames: ["Kraken Slayer", "Infinity Edge", "Runaan's Hurricane"], firstItem: "Kraken Slayer", boots: "Berserker's Greaves", games: 73, winRate: 0.589, pickRate: 0.579, avgCompletionMinutes: 25.9 }),
  build({ region: "EUW", role: "SUPPORT", championId: 526, championName: "Rell", opponentId: 111, opponentName: "Nautilus", buildLabel: "Teamfight engage", itemNames: ["Locket of the Iron Solari", "Zeke's Convergence", "Knight's Vow"], firstItem: "Locket of the Iron Solari", boots: "Plated Steelcaps", games: 62, winRate: 0.597, pickRate: 0.574, avgCompletionMinutes: 24.8 }),
];

export const demoData: DashboardData = {
  status,
  champions,
  matchups,
  itemBuilds,
};

export const demoPatches = [CURRENT_PATCH, PREVIOUS_PATCH];

export function getDemoRegions(): Region[] {
  return ["EUW", "EUNE"];
}

export function getDemoRoles(): Role[] {
  return ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
}
