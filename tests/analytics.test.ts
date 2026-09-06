import { describe, expect, it } from "vitest";

import {
  adjustedWinRate,
  calculateEvidenceScore,
  wilsonInterval,
} from "../src/lib/analytics";

describe("analytics helpers", () => {
  it("computes a bounded Wilson interval around the observed rate", () => {
    const interval = wilsonInterval(50, 100);

    expect(interval.low).toBeCloseTo(0.4038, 3);
    expect(interval.high).toBeCloseTo(0.5962, 3);
    expect(interval.low).toBeLessThan(0.5);
    expect(interval.high).toBeGreaterThan(0.5);
  });

  it("shrinks a sparse result toward the champion baseline", () => {
    const adjusted = adjustedWinRate(4, 5, 0.52, 20);

    expect(adjusted).toBeGreaterThan(0.52);
    expect(adjusted).toBeLessThan(0.8);
    expect(adjusted).toBeCloseTo(0.576, 3);
  });

  it("gives broader, better-concentrated evidence a higher score", () => {
    const sparse = calculateEvidenceScore({
      games: 12,
      uniquePlayers: 2,
      topPlayerShare: 0.75,
      wilsonLow: 0.31,
      wilsonHigh: 0.79,
      winRateLift: 0.04,
      avgGoldDiff15: 120,
      avgCsDiff15: 3,
      kdaDiff: 0.2,
    });
    const broad = calculateEvidenceScore({
      games: 120,
      uniquePlayers: 35,
      topPlayerShare: 0.08,
      wilsonLow: 0.53,
      wilsonHigh: 0.65,
      winRateLift: 0.04,
      avgGoldDiff15: 120,
      avgCsDiff15: 3,
      kdaDiff: 0.2,
    });

    expect(broad).toBeGreaterThan(sparse);
    expect(broad).toBeLessThanOrEqual(100);
  });
});
