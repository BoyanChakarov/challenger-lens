import type {
  BuildPath,
  ChampionRef,
  CounterRecommendationGroup,
  EvidenceMetrics,
  FrozenRecommendationBundle,
  LeaguePhase,
  LeagueSnapshot,
  RecommendationBundle,
  RuneRecommendation,
  SpellPairRecommendation,
} from "./types";
import { freezeRecommendationBundle } from "./selectors";

const PREPARED_AT = "2026-09-07T06:42:00.000Z";
const REFRESHED_AT = "2026-09-07T05:58:00.000Z";

const champions = {
  taliyah: { id: 163, name: "Taliyah" },
  akshan: { id: 166, name: "Akshan" },
  cassiopeia: { id: 69, name: "Cassiopeia" },
  sylas: { id: 517, name: "Sylas" },
  sejuani: { id: 113, name: "Sejuani" },
  renekton: { id: 58, name: "Renekton" },
  jinx: { id: 222, name: "Jinx" },
  rell: { id: 526, name: "Rell" },
} satisfies Record<string, ChampionRef>;

const evidence = (
  overrides: Partial<EvidenceMetrics> = {},
): EvidenceMetrics => ({
  rawWinRate: 0.574,
  adjustedWinRate: 0.556,
  baselineWinRate: 0.511,
  interval95: { low: 0.523, high: 0.662 },
  sampleSize: 194,
  uniquePlayers: 71,
  topPlayerShare: 0.08,
  playerConcentrationHhi: 0.034,
  deltas15: { gold: 190, cs: 4.6, xp: 117 },
  earlyGameSampleSize: 181,
  frequency: 0.34,
  label: "strong",
  ...overrides,
});

const counterGroups: CounterRecommendationGroup[] = [
  {
    opponent: champions.sylas,
    role: "MID",
    status: "supported",
    candidates: [
      {
        id: "16.17-euw-mid-taliyah-sylas",
        patch: "16.17",
        region: "EUW",
        role: "MID",
        opponent: champions.sylas,
        champion: champions.taliyah,
        evidence: evidence(),
        evidenceScore: 89,
        rankingScore: 0.86,
        explanations: [
          "Early gold, CS, and XP observations point in the same direction.",
          "Adds range and mixed crowd control to the visible allied draft.",
        ],
      },
      {
        id: "16.17-euw-mid-akshan-sylas",
        patch: "16.17",
        region: "EUW",
        role: "MID",
        opponent: champions.sylas,
        champion: champions.akshan,
        evidence: evidence({
          rawWinRate: 0.561,
          adjustedWinRate: 0.548,
          baselineWinRate: 0.507,
          interval95: { low: 0.511, high: 0.608 },
          sampleSize: 121,
          uniquePlayers: 49,
          topPlayerShare: 0.11,
          deltas15: { gold: 151, cs: 2.8, xp: 83 },
          label: "moderate",
        }),
        evidenceScore: 78,
        rankingScore: 0.75,
        explanations: ["Observed lane pressure is positive, with a wider uncertainty range."],
      },
      {
        id: "16.17-euw-mid-cassiopeia-sylas",
        patch: "16.17",
        region: "EUW",
        role: "MID",
        opponent: champions.sylas,
        champion: champions.cassiopeia,
        evidence: evidence({
          rawWinRate: 0.552,
          adjustedWinRate: 0.54,
          baselineWinRate: 0.504,
          interval95: { low: 0.506, high: 0.597 },
          sampleSize: 98,
          uniquePlayers: 38,
          topPlayerShare: 0.13,
          deltas15: { gold: 96, cs: 3.5, xp: 51 },
          label: "moderate",
        }),
        evidenceScore: 72,
        rankingScore: 0.69,
        explanations: ["A scaling alternative with supported, but less precise, lane evidence."],
      },
    ],
  },
  {
    opponent: champions.sejuani,
    role: "MID",
    status: "insufficient_evidence",
    candidates: [],
    reason: "no_matching_data",
  },
];

const runePages: RuneRecommendation[] = [
  {
    id: "taliyah-runes-frequent",
    kind: "most_frequent",
    title: "Most observed — First Strike",
    page: {
      primaryStyleId: 8300,
      secondaryStyleId: 8200,
      selectedPerkIds: [8369, 8304, 8345, 8347, 8226, 8237],
      statShardIds: [5005, 5008, 5001],
    },
    evidence: evidence({
      rawWinRate: 0.535,
      adjustedWinRate: 0.528,
      baselineWinRate: 0.511,
      interval95: { low: 0.501, high: 0.568 },
      sampleSize: 326,
      uniquePlayers: 94,
      topPlayerShare: 0.06,
      frequency: 0.46,
      deltas15: { gold: 112, cs: 2.6, xp: 61 },
    }),
    explanation: "The highest-frequency page in the current patch sample.",
  },
  {
    id: "taliyah-runes-supported",
    kind: "highest_supported",
    title: "Supported alternative — Dark Harvest",
    page: {
      primaryStyleId: 8100,
      secondaryStyleId: 8200,
      selectedPerkIds: [8128, 8126, 8138, 8135, 8226, 8210],
      statShardIds: [5005, 5008, 5001],
    },
    evidence: evidence({
      rawWinRate: 0.548,
      adjustedWinRate: 0.534,
      baselineWinRate: 0.511,
      interval95: { low: 0.508, high: 0.588 },
      sampleSize: 167,
      uniquePlayers: 63,
      topPlayerShare: 0.09,
      frequency: 0.24,
      deltas15: { gold: 84, cs: 2.1, xp: 44 },
      label: "moderate",
    }),
    explanation: "A lower-frequency alternative with broad player support.",
  },
  {
    id: "taliyah-runes-defensive",
    kind: "matchup_defensive_or_scaling",
    title: "Matchup alternative — Phase Rush",
    page: {
      primaryStyleId: 8200,
      secondaryStyleId: 8300,
      selectedPerkIds: [8230, 8226, 8210, 8237, 8304, 8347],
      statShardIds: [5005, 5008, 5001],
    },
    evidence: evidence({
      rawWinRate: 0.529,
      adjustedWinRate: 0.519,
      baselineWinRate: 0.511,
      interval95: { low: 0.482, high: 0.575 },
      sampleSize: 83,
      uniquePlayers: 36,
      topPlayerShare: 0.14,
      frequency: 0.12,
      deltas15: { gold: 37, cs: 1.4, xp: 29 },
      label: "limited",
    }),
    explanation: "A lower-sample mobility option when disengage is valued.",
  },
];

const spellPairs: SpellPairRecommendation[] = [
  {
    id: "flash-teleport",
    spells: [
      { id: 4, name: "Flash" },
      { id: 12, name: "Teleport" },
    ],
    evidence: evidence({
      rawWinRate: 0.532,
      adjustedWinRate: 0.526,
      baselineWinRate: 0.511,
      interval95: { low: 0.502, high: 0.561 },
      sampleSize: 412,
      uniquePlayers: 112,
      topPlayerShare: 0.05,
      frequency: 0.62,
      deltas15: { gold: 81, cs: 2.3, xp: 47 },
    }),
    explanation: "The standard high-frequency combination for Mid on Summoner's Rift.",
  },
  {
    id: "flash-barrier",
    spells: [
      { id: 4, name: "Flash" },
      { id: 21, name: "Barrier" },
    ],
    evidence: evidence({
      rawWinRate: 0.541,
      adjustedWinRate: 0.525,
      baselineWinRate: 0.511,
      interval95: { low: 0.493, high: 0.587 },
      sampleSize: 91,
      uniquePlayers: 42,
      topPlayerShare: 0.12,
      frequency: 0.14,
      deltas15: { gold: 49, cs: 1.8, xp: 35 },
      label: "limited",
    }),
    explanation: "A lower-sample defensive alternative into visible burst threats.",
  },
];

const item = (id: number, name: string) => ({ id, name });
const biasWarning =
  "Item-path win rates are observational and contain affordability and win-more bias.";

const itemPaths: BuildPath[] = [
  {
    id: "standard-control",
    kind: "standard",
    title: "Standard high-frequency path",
    startingItems: [item(1056, "Doran's Ring"), item(2003, "Health Potion")],
    firstCompletedItem: item(2503, "Blackfire Torch"),
    boots: item(3020, "Sorcerer's Shoes"),
    coreItems: [
      item(2503, "Blackfire Torch"),
      item(6653, "Liandry's Torment"),
      item(3157, "Zhonya's Hourglass"),
    ],
    situationalOptions: [
      {
        id: "standard-anti-heal",
        condition: "Against heavy healing",
        intent: "utility",
        items: [item(3165, "Morellonomicon")],
        explanation: "An observed utility alternative when healing reduction is relevant.",
      },
    ],
    evidence: evidence({
      rawWinRate: 0.558,
      adjustedWinRate: 0.538,
      baselineWinRate: 0.511,
      interval95: { low: 0.516, high: 0.599 },
      sampleSize: 214,
      uniquePlayers: 79,
      topPlayerShare: 0.07,
      frequency: 0.38,
      deltas15: { gold: 103, cs: 2.8, xp: 57 },
    }),
    explanation: "The most frequently completed three-item route in the scoped sample.",
    biasWarning,
  },
  {
    id: "magic-burst",
    kind: "defensive",
    title: "Against burst magic damage",
    startingItems: [item(1056, "Doran's Ring"), item(2003, "Health Potion")],
    firstCompletedItem: item(2503, "Blackfire Torch"),
    boots: item(3111, "Mercury's Treads"),
    coreItems: [
      item(2503, "Blackfire Torch"),
      item(3102, "Banshee's Veil"),
      item(3157, "Zhonya's Hourglass"),
    ],
    situationalOptions: [
      {
        id: "magic-burst-stasis",
        condition: "When stasis has higher value",
        intent: "defensive",
        items: [item(3157, "Zhonya's Hourglass")],
        explanation: "A defensive alternative observed against committed dive threats.",
      },
    ],
    evidence: evidence({
      rawWinRate: 0.551,
      adjustedWinRate: 0.531,
      baselineWinRate: 0.511,
      interval95: { low: 0.507, high: 0.597 },
      sampleSize: 146,
      uniquePlayers: 58,
      topPlayerShare: 0.1,
      frequency: 0.22,
      deltas15: { gold: 68, cs: 1.9, xp: 42 },
      label: "moderate",
    }),
    explanation: "A defensive route observed into magic burst and crowd control.",
    biasWarning,
  },
  {
    id: "scaling-output",
    kind: "offensive",
    title: "Scaling damage alternative",
    startingItems: [item(1056, "Doran's Ring"), item(2003, "Health Potion")],
    firstCompletedItem: item(6653, "Liandry's Torment"),
    boots: item(3020, "Sorcerer's Shoes"),
    coreItems: [
      item(6653, "Liandry's Torment"),
      item(4629, "Cosmic Drive"),
      item(3135, "Void Staff"),
    ],
    situationalOptions: [
      {
        id: "scaling-penetration",
        condition: "Against high magic resistance",
        intent: "offensive",
        items: [item(3135, "Void Staff")],
        explanation: "A penetration option represented in longer-game samples.",
      },
    ],
    evidence: evidence({
      rawWinRate: 0.565,
      adjustedWinRate: 0.536,
      baselineWinRate: 0.511,
      interval95: { low: 0.502, high: 0.623 },
      sampleSize: 89,
      uniquePlayers: 41,
      topPlayerShare: 0.13,
      frequency: 0.16,
      deltas15: { gold: 42, cs: 1.6, xp: 31 },
      label: "limited",
    }),
    explanation: "A less frequent offensive alternative from games that reached a later core.",
    biasWarning,
  },
];

const recommendationBundle: RecommendationBundle = {
  id: "browser-demo-16.17-taliyah-mid",
  patch: "16.17",
  region: "EUW",
  queue: { id: 420, name: "Ranked Solo/Duo" },
  map: { id: 11, name: "Summoner's Rift" },
  preparedAt: PREPARED_AT,
  refreshedAt: REFRESHED_AT,
  localChampion: champions.taliyah,
  role: "MID",
  counterGroups,
  runePages,
  spellPairs,
  itemPaths,
};

export const browserDemoRecommendations: FrozenRecommendationBundle =
  freezeRecommendationBundle(recommendationBundle, PREPARED_AT);

const draft = {
  timer: { phase: "pick" as const, remainingMs: 38_000 },
  localChampion: champions.taliyah,
  assignedRole: "MID" as const,
  allies: [
    { slot: 0, team: "ally" as const, champion: champions.renekton, role: "TOP" as const, selectionState: "locked" as const },
    { slot: 1, team: "ally" as const, role: "JUNGLE" as const, selectionState: "hovered" as const },
    { slot: 2, team: "ally" as const, champion: champions.taliyah, role: "MID" as const, isLocal: true, selectionState: "selected" as const },
    { slot: 3, team: "ally" as const, champion: champions.jinx, role: "ADC" as const, selectionState: "locked" as const },
    { slot: 4, team: "ally" as const, champion: champions.rell, role: "SUPPORT" as const, selectionState: "locked" as const },
  ],
  enemies: [
    { slot: 0, team: "enemy" as const, champion: champions.sylas, selectionState: "locked" as const },
    { slot: 1, team: "enemy" as const, champion: champions.sejuani, selectionState: "selected" as const },
    { slot: 2, team: "enemy" as const, selectionState: "empty" as const },
    { slot: 3, team: "enemy" as const, selectionState: "empty" as const },
    { slot: 4, team: "enemy" as const, selectionState: "empty" as const },
  ],
  bans: [
    { slot: 0, team: "ally" as const, champion: { id: 238, name: "Zed" } },
    { slot: 0, team: "enemy" as const, champion: { id: 91, name: "Talon" } },
    { slot: 1, team: "ally" as const, champion: { id: 55, name: "Katarina" } },
    { slot: 1, team: "enemy" as const, champion: { id: 84, name: "Akali" } },
  ],
  currentRunes: runePages[0]?.page,
  currentSpells: spellPairs[0]?.spells,
};

export const browserDemoPhases: readonly LeaguePhase[] = [
  "client_closed",
  "idle",
  "lobby",
  "champion_select",
  "loading",
  "active_game",
  "post_game",
];

export function createBrowserDemoSnapshot(phase: LeaguePhase): LeagueSnapshot {
  const shared = {
    phase,
    observedAt: new Date().toISOString(),
    patch: "16.17",
    region: "EUW" as const,
    queue: recommendationBundle.queue,
    map: recommendationBundle.map,
  };

  if (phase === "champion_select") {
    return { ...shared, draft, recommendations: browserDemoRecommendations };
  }

  if (phase === "loading") {
    return { ...shared, draft, recommendations: browserDemoRecommendations };
  }

  if (phase === "active_game") {
    return {
      ...shared,
      activeGame: {
        startedAt: "2026-09-07T06:44:00.000Z",
        localChampion: champions.taliyah,
        assignedRole: "MID",
        ownedItemIds: [1056, 2003, 3020],
      },
      recommendations: browserDemoRecommendations,
    };
  }

  return shared;
}
