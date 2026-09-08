import { describe, expect, it } from "vitest";

import { matchExclusionApplies } from "../src/worker/repository";

describe("match exclusion reuse", () => {
  it.each(["wrong_queue", "wrong_map", "short_game"] as const)(
    "keeps permanent %s exclusions across gameplay patches",
    (filterReason) => {
      expect(
        matchExclusionApplies(
          { filter_reason: filterReason, evaluated_against_patch: "16.16" },
          "16.17",
        ),
      ).toBe(true);
    },
  );

  it("rechecks an old-patch exclusion after the evaluated gameplay patch changes", () => {
    const exclusion = {
      filter_reason: "old_patch" as const,
      evaluated_against_patch: "16.16",
    };

    expect(matchExclusionApplies(exclusion, "16.16")).toBe(true);
    expect(matchExclusionApplies(exclusion, "16.17")).toBe(false);
  });
});
