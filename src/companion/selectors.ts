import type {
  BuildPath,
  CounterCandidate,
  CounterInsufficiencyReason,
  DeepReadonly,
  EvidenceLabel,
  EvidenceMetrics,
  FrozenRecommendationBundle,
  ItemChecklistEntry,
  ItemChecklistStage,
  RankedCounterCandidate,
  RecommendationBundle,
  Region,
  Role,
} from "./types";

export interface CounterSelectionContext {
  patch: string;
  region: Region;
  role: Role;
  opponentChampionId: number;
}

export interface CounterEligibilityThresholds {
  minSampleSize: number;
  minEarlyGameSampleSize: number;
  minUniquePlayers: number;
  maxTopPlayerShare: number;
  minEvidenceScore: number;
  minWinRateLift: number;
  /** Required lower-bound lift of the raw-WR Wilson interval over baseline. */
  minIntervalLift: number;
  /** May reduce the result count, but is always capped at three. */
  maxCandidates: number;
}

export const DEFAULT_COUNTER_THRESHOLDS: Readonly<CounterEligibilityThresholds> =
  Object.freeze({
    minSampleSize: 50,
    minEarlyGameSampleSize: 30,
    minUniquePlayers: 15,
    maxTopPlayerShare: 0.25,
    minEvidenceScore: 60,
    minWinRateLift: 0.01,
    minIntervalLift: 0,
    maxCandidates: 3,
  });

export interface SupportedCounterSelection {
  status: "supported";
  candidates: RankedCounterCandidate[];
}

export interface InsufficientCounterSelection {
  status: "insufficient_evidence";
  candidates: [];
  reason: CounterInsufficiencyReason;
}

export type CounterSelectionResult =
  | SupportedCounterSelection
  | InsufficientCounterSelection;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const finiteOr = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

const round = (value: number, digits = 0): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/**
 * Scores only evidence that is available before a game or at 15 minutes.
 * In particular, there is no KDA input and arbitrary extra object properties
 * cannot influence the result.
 */
export function calculateCompanionEvidenceScore(
  evidence: EvidenceMetrics,
): number {
  const sampleSize = Math.max(finiteOr(evidence.sampleSize, 0), 0);
  const uniquePlayers = Math.max(finiteOr(evidence.uniquePlayers, 0), 0);
  const topPlayerShare = clamp(
    finiteOr(evidence.topPlayerShare, 1),
    0,
    1,
  );
  const intervalLow = finiteOr(evidence.interval95.low, 0);
  const intervalHigh = finiteOr(evidence.interval95.high, 1);
  const intervalWidth = Math.max(intervalHigh - intervalLow, 0);
  const lift =
    finiteOr(evidence.adjustedWinRate, 0) -
    finiteOr(evidence.baselineWinRate, 0);

  const sampleStrength = clamp(Math.log2(Math.max(sampleSize, 1)) / 9, 0, 1);
  const playerBreadth = clamp(uniquePlayers / 50, 0, 1);
  const concentrationStrength = 1 - topPlayerShare;
  const precision = 1 - clamp(intervalWidth, 0, 0.5) / 0.5;
  const direction = Math.sign(lift);
  const earlySignals = [
    finiteOr(evidence.deltas15.gold, 0),
    finiteOr(evidence.deltas15.cs, 0),
    finiteOr(evidence.deltas15.xp, 0),
  ];
  const directionalAgreement =
    direction === 0
      ? 0.5
      : earlySignals.filter((signal) => Math.sign(signal) === direction).length /
        earlySignals.length;

  return round(
    clamp(
      100 *
        (sampleStrength * 0.26 +
          playerBreadth * 0.2 +
          concentrationStrength * 0.16 +
          precision * 0.22 +
          directionalAgreement * 0.16),
      0,
      100,
    ),
  );
}

export function evidenceLabelFromScore(score: number): EvidenceLabel {
  const bounded = clamp(finiteOr(score, 0), 0, 100);
  if (bounded >= 80) return "strong";
  if (bounded >= 60) return "moderate";
  if (bounded >= 40) return "limited";
  return "insufficient";
}

function candidateLift(candidate: CounterCandidate): number {
  return (
    finiteOr(candidate.evidence.adjustedWinRate, 0) -
    finiteOr(candidate.evidence.baselineWinRate, 0)
  );
}

export function rankCounterCandidate(
  candidate: CounterCandidate,
): RankedCounterCandidate {
  const evidenceScore = calculateCompanionEvidenceScore(candidate.evidence);
  const liftStrength = clamp(candidateLift(candidate) / 0.08, 0, 1);
  const compatibility = clamp(
    finiteOr(candidate.compositionCompatibility, 0),
    0,
    1,
  );

  return {
    ...candidate,
    evidence: {
      ...candidate.evidence,
      label: evidenceLabelFromScore(evidenceScore),
    },
    evidenceScore,
    rankingScore: round(
      (evidenceScore * 0.75 + liftStrength * 15 + compatibility * 10) / 100,
      4,
    ),
  };
}

function failureReason(
  candidate: CounterCandidate,
  thresholds: CounterEligibilityThresholds,
): CounterInsufficiencyReason | null {
  const evidence = candidate.evidence;
  const earlyGameSampleSize =
    evidence.earlyGameSampleSize ?? evidence.sampleSize;

  if (
    evidence.sampleSize < thresholds.minSampleSize ||
    earlyGameSampleSize < thresholds.minEarlyGameSampleSize
  ) {
    return "sample_too_small";
  }
  if (evidence.uniquePlayers < thresholds.minUniquePlayers) {
    return "player_breadth_too_low";
  }
  if (evidence.topPlayerShare > thresholds.maxTopPlayerShare) {
    return "player_concentration_too_high";
  }

  const lift = candidateLift(candidate);
  const intervalLift =
    finiteOr(evidence.interval95.low, Number.NEGATIVE_INFINITY) -
    finiteOr(evidence.baselineWinRate, 0);
  if (
    lift < thresholds.minWinRateLift ||
    intervalLift <= thresholds.minIntervalLift
  ) {
    return "lift_not_supported";
  }
  if (
    calculateCompanionEvidenceScore(evidence) < thresholds.minEvidenceScore
  ) {
    return "evidence_too_weak";
  }
  return null;
}

function chooseInsufficiencyReason(
  reasons: readonly CounterInsufficiencyReason[],
): CounterInsufficiencyReason {
  const priority: readonly CounterInsufficiencyReason[] = [
    "sample_too_small",
    "player_breadth_too_low",
    "player_concentration_too_high",
    "lift_not_supported",
    "evidence_too_weak",
  ];

  return priority
    .map((reason) => ({
      reason,
      count: reasons.filter((candidateReason) => candidateReason === reason)
        .length,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        priority.indexOf(left.reason) - priority.indexOf(right.reason),
    )[0]?.reason ?? "evidence_too_weak";
}

/**
 * Returns only candidates supported for this exact patch, region, role, and
 * visible lane opponent. An empty result is explicitly labelled insufficient.
 */
export function selectCounterCandidates(
  candidates: readonly CounterCandidate[],
  context: CounterSelectionContext,
  thresholdOverrides: Partial<CounterEligibilityThresholds> = {},
): CounterSelectionResult {
  const thresholds: CounterEligibilityThresholds = {
    ...DEFAULT_COUNTER_THRESHOLDS,
    ...thresholdOverrides,
  };
  const matching = candidates.filter(
    (candidate) =>
      candidate.patch === context.patch &&
      candidate.region === context.region &&
      candidate.role === context.role &&
      candidate.opponent.id === context.opponentChampionId,
  );

  if (matching.length === 0) {
    return {
      status: "insufficient_evidence",
      candidates: [],
      reason: "no_matching_data",
    };
  }

  const evaluated = matching.map((candidate) => ({
    candidate,
    reason: failureReason(candidate, thresholds),
  }));
  const limit = clamp(Math.floor(finiteOr(thresholds.maxCandidates, 3)), 0, 3);
  const eligible = evaluated
    .filter(
      (entry): entry is { candidate: CounterCandidate; reason: null } =>
        entry.reason === null,
    )
    .map(({ candidate }) => rankCounterCandidate(candidate))
    .sort(
      (left, right) =>
        right.rankingScore - left.rankingScore ||
        right.evidenceScore - left.evidenceScore ||
        candidateLift(right) - candidateLift(left) ||
        right.evidence.sampleSize - left.evidence.sampleSize ||
        left.champion.id - right.champion.id,
    )
    .slice(0, limit);

  if (eligible.length === 0) {
    return {
      status: "insufficient_evidence",
      candidates: [],
      reason: chooseInsufficiencyReason(
        evaluated
          .map(({ reason }) => reason)
          .filter(
            (reason): reason is CounterInsufficiencyReason => reason !== null,
          ),
      ),
    };
  }

  return { status: "supported", candidates: eligible };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): DeepReadonly<T> {
  if (value === null || typeof value !== "object") {
    return value as DeepReadonly<T>;
  }
  if (seen.has(value)) return value as DeepReadonly<T>;
  seen.add(value);

  for (const child of Object.values(value)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value) as DeepReadonly<T>;
}

/** Creates a detached, immutable bundle for display throughout the match. */
export function freezeRecommendationBundle(
  bundle: RecommendationBundle,
  frozenAt: string,
): FrozenRecommendationBundle {
  const detached = structuredClone({ ...bundle, frozenAt });
  return deepFreeze(detached);
}

function appendChecklistItem(
  entries: ItemChecklistEntry[],
  seen: Set<number>,
  item: ItemChecklistEntry["item"],
  stage: ItemChecklistStage,
  ownedItemIds: ReadonlySet<number>,
  condition?: string,
): void {
  if (seen.has(item.id)) return;
  seen.add(item.id);
  entries.push({
    item: { ...item },
    stage,
    ...(condition === undefined ? {} : { condition }),
    owned: ownedItemIds.has(item.id),
  });
}

/** Builds a passive ownership checklist; it never issues purchase advice. */
export function createItemChecklist(
  path: BuildPath,
  ownedItemIds: readonly number[] = [],
): ItemChecklistEntry[] {
  const owned = new Set(ownedItemIds);
  const seen = new Set<number>();
  const entries: ItemChecklistEntry[] = [];

  for (const item of path.startingItems) {
    appendChecklistItem(entries, seen, item, "starting", owned);
  }
  appendChecklistItem(
    entries,
    seen,
    path.firstCompletedItem,
    "first_completed",
    owned,
  );
  appendChecklistItem(entries, seen, path.boots, "boots", owned);
  for (const item of path.coreItems) {
    appendChecklistItem(entries, seen, item, "core", owned);
  }
  for (const option of path.situationalOptions) {
    for (const item of option.items) {
      appendChecklistItem(
        entries,
        seen,
        item,
        "situational",
        owned,
        option.condition,
      );
    }
  }

  return entries;
}

export function updateItemChecklist(
  checklist: readonly ItemChecklistEntry[],
  ownedItemIds: readonly number[],
): ItemChecklistEntry[] {
  const owned = new Set(ownedItemIds);
  return checklist.map((entry) => ({
    ...entry,
    item: { ...entry.item },
    owned: owned.has(entry.item.id),
  }));
}
