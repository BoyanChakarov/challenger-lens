import type { Region, Role } from "../types";

export type { Region, Role } from "../types";

/** The seven user-visible states of the League companion lifecycle. */
export type LeaguePhase =
  | "client_closed"
  | "idle"
  | "lobby"
  | "champion_select"
  | "loading"
  | "active_game"
  | "post_game";

export interface ChampionRef {
  id: number;
  name: string;
}

export interface QueueRef {
  id: number;
  name: string;
}

export interface MapRef {
  id: number;
  name: string;
}

export interface RunePageRef {
  primaryStyleId: number;
  secondaryStyleId: number;
  selectedPerkIds: readonly number[];
  statShardIds: readonly number[];
}

export interface SpellRef {
  id: number;
  name: string;
}

export interface ItemRef {
  id: number;
  name: string;
}

export type DraftTeam = "ally" | "enemy";

export type DraftSelectionState =
  | "empty"
  | "hovered"
  | "selected"
  | "locked";

/**
 * An ephemeral draft position. It deliberately contains no PUUID, summoner
 * name, Riot ID, account ID, or other player identity.
 */
export interface DraftSlot {
  slot: number;
  team: DraftTeam;
  champion?: ChampionRef;
  role?: Role;
  isLocal?: boolean;
  selectionState: DraftSelectionState;
}

export interface DraftBan {
  /** Position within that team's visible ban list; no global ban order is inferred. */
  slot: number;
  team: DraftTeam;
  champion?: ChampionRef;
}

export interface DraftTimer {
  phase: "planning" | "ban" | "pick" | "finalization";
  remainingMs: number;
}

export interface DraftSnapshot {
  timer?: DraftTimer;
  localChampion?: ChampionRef;
  assignedRole?: Role;
  allies: readonly DraftSlot[];
  enemies: readonly DraftSlot[];
  bans: readonly DraftBan[];
  currentRunes?: RunePageRef;
  currentSpells?: readonly [SpellRef, SpellRef];
}

/** Only locally visible, non-identifying state needed by the static overlay. */
export interface ActiveGameSnapshot {
  startedAt?: string;
  localChampion?: ChampionRef;
  assignedRole?: Role;
  ownedItemIds: readonly number[];
}

export type EvidenceLabel =
  | "strong"
  | "moderate"
  | "limited"
  | "insufficient";

export interface Interval95 {
  low: number;
  high: number;
}

export interface FifteenMinuteDeltas {
  gold: number;
  cs: number;
  xp: number;
}

/**
 * Evidence available at recommendation time. Post-game outcome features such
 * as KDA, final gold, and completed items are intentionally absent.
 */
export interface EvidenceMetrics {
  rawWinRate: number;
  adjustedWinRate: number;
  baselineWinRate: number;
  /** Wilson 95% uncertainty interval for the raw win rate. */
  interval95: Interval95;
  sampleSize: number;
  uniquePlayers: number;
  topPlayerShare: number;
  playerConcentrationHhi?: number;
  deltas15: FifteenMinuteDeltas;
  earlyGameSampleSize?: number;
  frequency?: number;
  label: EvidenceLabel;
}

export interface RelevantBalanceChange {
  patch: string;
  severity: "minor" | "major";
  summary: string;
}

export interface CounterCandidate {
  id: string;
  patch: string;
  region: Region;
  role: Role;
  opponent: ChampionRef;
  champion: ChampionRef;
  evidence: EvidenceMetrics;
  /** Normalized to 0..1 when a forward-tested composition model is available. */
  compositionCompatibility?: number;
  explanations: readonly string[];
  relevantBalanceChange?: RelevantBalanceChange;
}

export interface RankedCounterCandidate extends CounterCandidate {
  evidenceScore: number;
  /** Composite ordering value normalized to the inclusive range 0..1. */
  rankingScore: number;
}

export type CounterInsufficiencyReason =
  | "no_matching_data"
  | "sample_too_small"
  | "player_breadth_too_low"
  | "player_concentration_too_high"
  | "evidence_too_weak"
  | "lift_not_supported";

export interface CounterRecommendationGroup {
  opponent: ChampionRef;
  role: Role;
  status: "supported" | "insufficient_evidence";
  candidates: readonly RankedCounterCandidate[];
  reason?: CounterInsufficiencyReason;
}

export type RuneRecommendationKind =
  | "most_frequent"
  | "highest_supported"
  | "matchup_alternative"
  | "matchup_defensive_or_scaling";

export interface RuneRecommendation {
  id: string;
  kind: RuneRecommendationKind;
  title: string;
  page: RunePageRef;
  evidence: EvidenceMetrics;
  explanation: string;
}

export interface SpellPairRecommendation {
  id: string;
  spells: readonly [SpellRef, SpellRef];
  evidence: EvidenceMetrics;
  explanation: string;
}

export interface SituationalItemOption {
  id: string;
  condition: string;
  intent: "defensive" | "offensive" | "utility";
  items: readonly ItemRef[];
  explanation: string;
}

export interface BuildPath {
  id: string;
  kind: "standard" | "defensive" | "offensive" | "situational";
  title: string;
  startingItems: readonly ItemRef[];
  firstCompletedItem: ItemRef;
  boots: ItemRef;
  coreItems: readonly ItemRef[];
  situationalOptions: readonly SituationalItemOption[];
  evidence: EvidenceMetrics;
  explanation: string;
  biasWarning: string;
}

export interface RecommendationBundle {
  id: string;
  patch: string;
  region: Region;
  queue: QueueRef;
  map: MapRef;
  preparedAt: string;
  refreshedAt: string;
  dataStatus?: "fresh" | "stale";
  dataNotice?: string;
  localChampion?: ChampionRef;
  role?: Role;
  counterGroups: readonly CounterRecommendationGroup[];
  runePages: readonly RuneRecommendation[];
  spellPairs: readonly SpellPairRecommendation[];
  itemPaths: readonly BuildPath[];
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type FrozenRecommendationBundle = DeepReadonly<
  RecommendationBundle & { frozenAt: string }
>;

export type ItemChecklistStage =
  | "starting"
  | "first_completed"
  | "boots"
  | "core"
  | "situational";

export interface ItemChecklistEntry {
  item: ItemRef;
  stage: ItemChecklistStage;
  condition?: string;
  owned: boolean;
}

/** A privacy-safe view of the local session; no player identity is represented. */
export interface LeagueSnapshot {
  phase: LeaguePhase;
  observedAt: string;
  patch?: string;
  region?: Region;
  queue?: QueueRef;
  map?: MapRef;
  draft?: DraftSnapshot;
  activeGame?: ActiveGameSnapshot;
  recommendations?: FrozenRecommendationBundle;
}
