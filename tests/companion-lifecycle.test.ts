import { describe, expect, it } from "vitest";
import {
  browserDemoPhases,
  browserDemoRecommendations,
  createBrowserDemoSnapshot,
} from "../src/companion/demo";

describe("companion lifecycle fixtures", () => {
  it("provides every user-visible lifecycle state", () => {
    expect(browserDemoPhases).toEqual([
      "client_closed",
      "idle",
      "lobby",
      "champion_select",
      "loading",
      "active_game",
      "post_game",
    ]);
    expect(browserDemoPhases.map((phase) => createBrowserDemoSnapshot(phase).phase)).toEqual(
      browserDemoPhases,
    );
  });

  it("uses one deeply frozen bundle from champion select through the match", () => {
    const championSelect = createBrowserDemoSnapshot("champion_select");
    const loading = createBrowserDemoSnapshot("loading");
    const activeGame = createBrowserDemoSnapshot("active_game");

    expect(championSelect.recommendations).toBe(browserDemoRecommendations);
    expect(loading.recommendations).toBe(browserDemoRecommendations);
    expect(activeGame.recommendations).toBe(browserDemoRecommendations);
    expect(Object.isFrozen(browserDemoRecommendations)).toBe(true);
    expect(Object.isFrozen(browserDemoRecommendations.itemPaths)).toBe(true);
    expect(Object.isFrozen(browserDemoRecommendations.itemPaths[0]?.coreItems)).toBe(true);
  });

  it("keeps non-draft states free of synthetic recommendation data", () => {
    for (const phase of ["client_closed", "idle", "lobby", "post_game"] as const) {
      expect(createBrowserDemoSnapshot(phase).recommendations).toBeUndefined();
    }
  });

  it("includes explicit supported and insufficient counter outcomes", () => {
    expect(browserDemoRecommendations.counterGroups.some((group) => group.status === "supported")).toBe(true);
    expect(
      browserDemoRecommendations.counterGroups.some(
        (group) => group.status === "insufficient_evidence" && group.candidates.length === 0,
      ),
    ).toBe(true);
    expect(
      browserDemoRecommendations.counterGroups.every((group) => group.candidates.length <= 3),
    ).toBe(true);
  });
});

