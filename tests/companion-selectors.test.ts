import { describe, expect, it } from "vitest";

import {
  calculateCompanionEvidenceScore,
  selectCounterCandidates,
} from "../src/companion/selectors";
import type {
  CounterCandidate,
  EvidenceMetrics,
} from "../src/companion/types";

const supportedEvidence = (
  overrides: Partial<EvidenceMetrics> = {},
): EvidenceMetrics => ({
  rawWinRate: 0.58,
  adjustedWinRate: 0.56,
  baselineWinRate: 0.5,
  interval95: { low: 0.52, high: 0.64 },
  sampleSize: 200,
  uniquePlayers: 60,
  topPlayerShare: 0.1,
  deltas15: { gold: 140, cs: 3.2, xp: 90 },
  earlyGameSampleSize: 180,
  label: "strong",
  ...overrides,
});

const counterCandidate = (
  championId: number,
  overrides: Partial<CounterCandidate> = {},
): CounterCandidate => ({
  id: `counter-${championId}`,
  patch: "16.17",
  region: "EUW",
  role: "MID",
  opponent: { id: 134, name: "Syndra" },
  champion: { id: championId, name: `Champion ${championId}` },
  evidence: supportedEvidence(),
  explanations: ["Supported matchup and early-lane signals."],
  ...overrides,
});

const context = {
  patch: "16.17",
  region: "EUW",
  role: "MID",
  opponentChampionId: 134,
} as const;

describe("companion counter selection", () => {
  it("requires an exact patch, region, role, and visible opponent match", () => {
    const eligible = counterCandidate(1);
    const result = selectCounterCandidates(
      [
        eligible,
        counterCandidate(2, { patch: "16.16" }),
        counterCandidate(3, { region: "EUNE" }),
        counterCandidate(4, { role: "TOP" }),
        counterCandidate(5, {
          opponent: { id: 7, name: "LeBlanc" },
        }),
      ],
      context,
    );

    expect(result.status).toBe("supported");
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([
      eligible.id,
    ]);
  });

  it("orders eligible results deterministically and never returns more than three", () => {
    const result = selectCounterCandidates(
      [
        counterCandidate(1, { compositionCompatibility: 0.1 }),
        counterCandidate(2, { compositionCompatibility: 0.9 }),
        counterCandidate(3, { compositionCompatibility: 0.5 }),
        counterCandidate(4, { compositionCompatibility: 0.7 }),
        counterCandidate(5, { compositionCompatibility: 0.3 }),
      ],
      context,
      { maxCandidates: 99 },
    );

    expect(result.status).toBe("supported");
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((candidate) => candidate.champion.id)).toEqual([
      2, 4, 3,
    ]);
  });

  it("labels matching but under-supported observations as insufficient evidence", () => {
    const sparseResult = selectCounterCandidates(
      [
        counterCandidate(1, {
          evidence: supportedEvidence({
            sampleSize: 12,
            earlyGameSampleSize: 10,
            uniquePlayers: 5,
          }),
        }),
      ],
      context,
    );
    const unsupportedLiftResult = selectCounterCandidates(
      [
        counterCandidate(2, {
          evidence: supportedEvidence({
            adjustedWinRate: 0.55,
            baselineWinRate: 0.5,
            interval95: { low: 0.48, high: 0.62 },
          }),
        }),
      ],
      context,
    );

    expect(sparseResult).toEqual({
      status: "insufficient_evidence",
      candidates: [],
      reason: "sample_too_small",
    });
    expect(unsupportedLiftResult).toEqual({
      status: "insufficient_evidence",
      candidates: [],
      reason: "lift_not_supported",
    });
  });

  it("does not accept KDA as a scoring dependency", () => {
    const evidence = supportedEvidence();
    const withPositiveKda = { ...evidence, kdaDiff: 100_000 };
    const withNegativeKda = { ...evidence, kdaDiff: -100_000 };

    expect(calculateCompanionEvidenceScore(withPositiveKda)).toBe(
      calculateCompanionEvidenceScore(evidence),
    );
    expect(calculateCompanionEvidenceScore(withNegativeKda)).toBe(
      calculateCompanionEvidenceScore(evidence),
    );
  });
});
